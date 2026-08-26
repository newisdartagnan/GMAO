import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { lienFormulaireExterne } from '@gmao/partage';
import { exiger } from '../auth.ts';
import { ErreurMetier, valider } from './aide.ts';
import { config, formulaireBranche, recuperationActive } from '../config.ts';
import { chargerCorrespondance } from '../integrations/formulaires.ts';
import type { SoumissionFormulaire } from '../integrations/formulaires.ts';
import * as jotform from '../integrations/jotform.ts';
import * as microsoft from '../integrations/microsoft.ts';
import { importerWebhook, lireEtatIntegration, sourceActive, synchroniser } from '../integrations/collecte.ts';
import { lireBase } from '../etat.ts';

/**
 * Routes du connecteur de formulaire externe.
 *
 * Le webhook est la seule route de l'API ouverte sans jeton : c'est le
 * formulaire — ou le flux Power Automate — qui appelle, et ni l'un ni l'autre
 * ne sait s'authentifier autrement. Le secret partagé, placé dans l'URL, tient
 * lieu de mot de passe ; tant qu'il n'est pas configuré, la route refuse tout
 * plutôt que d'accepter n'importe qui.
 */
export async function routesIntegrations(app: FastifyInstance): Promise<void> {
  /* ---------------- Webhook ---------------- */

  const traiterWebhook = async (requete: FastifyRequest, reponse: FastifyReply) => {
    const attendu = config.formulaire.secretWebhook;
    if (!attendu) {
      return reponse
        .code(503)
        .send({ erreur: 'Webhook fermé : définissez FORMULAIRE_SECRET_WEBHOOK pour l’ouvrir.' });
    }
    const { secret } = requete.params as { secret?: string };
    const fourni = secret ?? (requete.headers['x-gmao-secret'] as string | undefined);
    if (fourni !== attendu) {
      requete.log.warn({ ip: requete.ip }, 'webhook formulaire : secret invalide');
      return reponse.code(401).send({ erreur: 'Secret invalide' });
    }

    const corps = (requete.body ?? {}) as Record<string, unknown>;
    // JotForm poste en multipart avec « rawRequest » ; Power Automate poste du
    // JSON. La forme du corps suffit à savoir lequel parle.
    const soumission: SoumissionFormulaire | null =
      corps.rawRequest !== undefined || corps.submissionID !== undefined
        ? jotform.lireWebhook(corps)
        : microsoft.lireWebhook(corps);

    if (!soumission) {
      requete.log.warn({ cles: Object.keys(corps) }, 'webhook formulaire : soumission illisible');
      return reponse.code(400).send({
        erreur: 'Soumission illisible : aucun identifiant de réponse (« id » ou « submissionID »).',
      });
    }

    const resultat = await importerWebhook(soumission);
    if (resultat.rejets.length) {
      requete.log.warn({ rejets: resultat.rejets }, 'webhook formulaire : soumission écartée');
    }

    // Un appelant considère toute réponse hors 2xx comme un échec et réessaie :
    // une soumission déjà connue ou inexploitable doit donc répondre 200,
    // sinon elle revient indéfiniment.
    return reponse.code(200).send({
      recu: soumission.id,
      demande: resultat.creees[0]?.numero ?? null,
      etat: resultat.creees.length ? 'creee' : resultat.rejets.length ? 'ecartee' : 'deja_connue',
      motif: resultat.rejets[0]?.motif,
    });
  };

  app.post('/api/integrations/formulaire/:secret', traiterWebhook);
  /** Variante sans secret dans l'URL, pour un en-tête « X-GMAO-Secret ». */
  app.post('/api/integrations/formulaire', traiterWebhook);
  /** Ancienne adresse, conservée pour les webhooks JotForm déjà déclarés. */
  app.post('/api/integrations/jotform/:secret', traiterWebhook);

  /* ---------------- Pilotage ---------------- */

  app.get('/api/integrations', { preHandler: exiger('administrer') }, async (_requete, reponse) => {
    const base = lireBase();
    const source = sourceActive();
    const externes = source ? base.demandes.filter((d) => d.origineExterne?.source === source) : [];

    return reponse.send({
      formulaire: {
        source: config.formulaire.source || null,
        branche: formulaireBranche(),
        recuperationActive: recuperationActive(),
        intervalleMin: config.formulaire.intervalleMin,
        webhookOuvert: Boolean(config.formulaire.secretWebhook),
        url: config.formulaire.url || null,
        paramCode: config.formulaire.paramCode,
        correspondance: chargerCorrespondance(config.formulaire.champs || undefined),
        // Ce qui identifie le formulaire côté fournisseur, sans jamais
        // renvoyer de secret : cette route est lisible par tout profil
        // d'administration, pas seulement par le compte système.
        reference:
          config.formulaire.source === 'microsoft'
            ? config.microsoft.mode === 'graph'
              ? config.microsoft.classeur || null
              : 'Power Automate → webhook'
            : config.jotform.formulaireId || null,
        mode: config.formulaire.source === 'microsoft' ? config.microsoft.mode : 'api',
        etat: await lireEtatIntegration(),
        demandesRecues: externes.length,
        derniereDemande: externes[0]?.numero ?? null,
      },
    });
  });

  /** Déclenchement manuel : reprise après coupure, ou simple vérification. */
  app.post('/api/integrations/synchroniser', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const { depuis } = valider(z.object({ depuis: z.string().optional() }), requete.body ?? {});
    try {
      return reponse.send(await synchroniser(depuis));
    } catch (e) {
      throw new ErreurMetier(e instanceof Error ? e.message : 'Récupération impossible', 502);
    }
  });

  /**
   * Lien du formulaire pré-rempli pour un équipement, tel qu'il est encodé
   * dans le QR code de son étiquette.
   */
  app.get('/api/integrations/lien/:code', { preHandler: exiger('lire') }, async (requete, reponse) => {
    const { code } = requete.params as { code: string };
    if (!config.formulaire.url) {
      throw new ErreurMetier('Aucune URL de formulaire configurée (FORMULAIRE_URL).', 409);
    }
    return reponse.send({
      lien: lienFormulaireExterne(config.formulaire.url, config.formulaire.paramCode, code),
    });
  });

  /**
   * Réglages que l'interface a besoin de connaître. Ils ne font pas partie de
   * l'agrégat métier : ils décrivent le déploiement, pas l'hôpital.
   */
  app.get('/api/configuration', { preHandler: exiger('lire') }, async (_requete, reponse) =>
    reponse.send({
      formulaireExterne: config.formulaire.url
        ? { url: config.formulaire.url, champCode: config.formulaire.paramCode }
        : null,
    }),
  );
}
