import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exiger } from '../auth.ts';
import { ErreurMetier, valider } from './aide.ts';
import { config, jotformRecuperationActive } from '../config.ts';
import { SOURCE, chargerCorrespondance, lienFormulaire, lireWebhook } from '../integrations/jotform.ts';
import { importer, lireEtatIntegration, synchroniser } from '../integrations/collecte.ts';
import { lireBase } from '../etat.ts';

/**
 * Routes du connecteur de formulaire externe.
 *
 * Le webhook est la seule route de l'API ouverte sans jeton : c'est JotForm
 * qui appelle, et JotForm ne sait pas s'authentifier autrement. Le secret
 * partagé, placé dans l'URL, tient lieu de mot de passe — et tant qu'il n'est
 * pas configuré la route refuse tout, plutôt que d'accepter n'importe qui.
 */
export async function routesIntegrations(app: FastifyInstance): Promise<void> {
  /* ---------------- Webhook ---------------- */

  const traiterWebhook = async (requete: import('fastify').FastifyRequest, reponse: import('fastify').FastifyReply) => {
    const attendu = config.jotform.secretWebhook;
    if (!attendu) {
      return reponse
        .code(503)
        .send({ erreur: 'Webhook fermé : définissez JOTFORM_SECRET_WEBHOOK pour l’ouvrir.' });
    }
    const { secret } = requete.params as { secret?: string };
    const fourni = secret ?? (requete.headers['x-gmao-secret'] as string | undefined);
    if (fourni !== attendu) {
      requete.log.warn({ ip: requete.ip }, 'webhook JotForm : secret invalide');
      return reponse.code(401).send({ erreur: 'Secret invalide' });
    }

    // JotForm poste en multipart ou en formulaire encodé selon les cas ; ce
    // qui compte est « rawRequest », présent dans les deux.
    const corps = (requete.body ?? {}) as Record<string, unknown>;
    const soumission = lireWebhook(corps);
    if (!soumission) {
      requete.log.warn({ cles: Object.keys(corps) }, 'webhook JotForm : soumission illisible');
      return reponse.code(400).send({ erreur: 'Soumission illisible : « submissionID » absent.' });
    }

    const resultat = await importer([soumission]);
    if (resultat.rejets.length) {
      requete.log.warn({ rejets: resultat.rejets }, 'webhook JotForm : soumission écartée');
    }

    // JotForm considère toute réponse hors 200 comme un échec et réessaie :
    // une soumission déjà connue ou inexploitable doit donc répondre 200,
    // sinon elle revient indéfiniment.
    return reponse.code(200).send({
      recu: soumission.id,
      demande: resultat.creees[0]?.numero ?? null,
      etat: resultat.creees.length ? 'creee' : resultat.rejets.length ? 'ecartee' : 'deja_connue',
      motif: resultat.rejets[0]?.motif,
    });
  };

  app.post('/api/integrations/jotform/:secret', traiterWebhook);
  /** Variante sans secret dans l'URL, pour un en-tête personnalisé. */
  app.post('/api/integrations/jotform', traiterWebhook);

  /* ---------------- Pilotage ---------------- */

  app.get('/api/integrations', { preHandler: exiger('administrer') }, async (_requete, reponse) => {
    const base = lireBase();
    const externes = base.demandes.filter((d) => d.origineExterne?.source === SOURCE);
    return reponse.send({
      jotform: {
        configure: Boolean(config.jotform.cleApi && config.jotform.formulaireId),
        recuperationActive: jotformRecuperationActive(),
        intervalleMin: config.jotform.intervalleMin,
        webhookOuvert: Boolean(config.jotform.secretWebhook),
        formulaireId: config.jotform.formulaireId || null,
        urlFormulaire: config.jotform.urlFormulaire || null,
        champCode: config.jotform.champCode,
        correspondance: chargerCorrespondance(config.jotform.champs || undefined),
        etat: await lireEtatIntegration(),
        demandesRecues: externes.length,
        derniereDemande: externes[0]?.numero ?? null,
      },
    });
  });

  /** Déclenchement manuel : reprise après coupure, ou simple vérification. */
  app.post('/api/integrations/jotform/synchroniser', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const { depuis } = valider(
      z.object({ depuis: z.string().optional() }),
      requete.body ?? {},
    );
    try {
      const r = await synchroniser(depuis);
      return reponse.send(r);
    } catch (e) {
      throw new ErreurMetier(e instanceof Error ? e.message : 'Récupération impossible', 502);
    }
  });

  /**
   * Réglages que l'interface a besoin de connaître. Ils ne font pas partie de
   * l'agrégat métier : ils décrivent le déploiement, pas l'hôpital.
   */
  app.get('/api/configuration', { preHandler: exiger('lire') }, async (_requete, reponse) =>
    reponse.send({
      formulaireExterne: config.jotform.urlFormulaire
        ? { url: config.jotform.urlFormulaire, champCode: config.jotform.champCode }
        : null,
    }),
  );

  /**
   * Lien du formulaire pré-rempli pour un équipement, tel qu'il est encodé
   * dans le QR code de son étiquette.
   */
  app.get('/api/integrations/jotform/lien/:code', { preHandler: exiger('lire') }, async (requete, reponse) => {
    const { code } = requete.params as { code: string };
    if (!config.jotform.urlFormulaire) {
      throw new ErreurMetier('Aucune URL de formulaire configurée (JOTFORM_URL_FORMULAIRE).', 409);
    }
    return reponse.send({ lien: lienFormulaire(config.jotform.urlFormulaire, config.jotform.champCode, code) });
  });
}
