import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  creerVigilance,
  enregistrerVisiteControle,
  genererReappro,
  leverReserve,
  marquerEquipementTraite,
  mouvementerStock,
  receptionnerCommande,
  validerCommande,
} from '@gmao/partage';
import { exiger, utilisateurDe } from '../auth.ts';
import { ErreurMetier, idParam, repondreCommande, valider } from './aide.ts';
import { lireBase } from '../etat.ts';

export async function routesLogistique(app: FastifyInstance): Promise<void> {
  /* ---------------- Stocks ---------------- */

  app.post('/api/articles/:id/mouvements', { preHandler: exiger('magasin') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z.object({
        type: z.enum(['entree', 'sortie', 'inventaire', 'rebut', 'retour']),
        quantite: z.number().int().min(0),
        motif: z.string().min(3, 'le motif justifie l’écriture de stock'),
      }),
      requete.body,
    );
    const article = lireBase().articles.find((a) => a.id === id);
    if (!article) throw new ErreurMetier('Article introuvable', 404);
    if (d.type === 'sortie' && d.quantite > article.stockActuel) {
      throw new ErreurMetier(
        `Stock insuffisant : ${article.stockActuel} ${article.unite} disponibles pour ${article.designation}.`,
        409,
      );
    }
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Mouvement ${d.type} de ${d.quantite} ${article.unite} — ${article.designation}`,
        entiteType: 'article',
        entiteId: id,
        details: d.motif,
      },
      (b) => mouvementerStock(b, id, d.type, d.quantite, d.motif, auteur),
    );
  });

  /* ---------------- Achats ---------------- */

  app.post('/api/achats/reappro', { preHandler: exiger('acheter') }, async (requete, reponse) => {
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: 'Génération des commandes de réapprovisionnement', action: 'generation', entiteType: 'bon_commande', entiteId: '-' },
      (b) => {
        const crees = genererReappro(b, auteur);
        return { crees: crees.length, numeros: crees.map((c) => c.numero) };
      },
    );
  });

  app.post('/api/bons-commande/:id/valider', { preHandler: exiger('acheter') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const auteur = utilisateurDe(requete).sub;
    const bc = lireBase().bonsCommande.find((b) => b.id === id);
    if (!bc) throw new ErreurMetier('Commande introuvable', 404);
    if (bc.statut !== 'a_valider' && bc.statut !== 'brouillon') {
      throw new ErreurMetier(`La commande ${bc.numero} est déjà ${bc.statut.replace(/_/g, ' ')}.`, 409);
    }
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Validation de la commande ${bc.numero}`, action: 'validation', entiteType: 'bon_commande', entiteId: id },
      (b) => validerCommande(b, id, auteur),
    );
  });

  app.post('/api/bons-commande/:id/reception', { preHandler: exiger('magasin') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { partielle } = valider(z.object({ partielle: z.boolean().default(false) }), requete.body ?? {});
    const auteur = utilisateurDe(requete).sub;
    const bc = lireBase().bonsCommande.find((b) => b.id === id);
    if (!bc) throw new ErreurMetier('Commande introuvable', 404);
    if (bc.statut === 'receptionnee') throw new ErreurMetier('Cette commande est déjà soldée.', 409);
    if (bc.statut === 'annulee') throw new ErreurMetier('Cette commande a été annulée.', 409);
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Réception ${partielle ? 'partielle ' : ''}de la commande ${bc.numero}`,
        entiteType: 'bon_commande',
        entiteId: id,
      },
      (b) => receptionnerCommande(b, id, auteur, partielle),
    );
  });

  /* ---------------- Conformité réglementaire ---------------- */

  app.post('/api/controles/:id/visites', { preHandler: exiger('valider') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z.object({
        equipementId: z.string().optional(),
        verdict: z.enum(['conforme', 'conforme_avec_reserves', 'non_conforme']),
        numeroRapport: z.string().optional(),
        reserve: z
          .object({ libelle: z.string().min(3), gravite: z.enum(['mineure', 'majeure', 'critique']) })
          .optional(),
      }),
      requete.body,
    );
    const controle = lireBase().controles.find((c) => c.id === id);
    if (!controle) throw new ErreurMetier('Obligation de contrôle introuvable', 404);
    if (d.verdict !== 'conforme' && !d.reserve) {
      throw new ErreurMetier('Un verdict non conforme doit être accompagné de la réserve constatée.', 422);
    }
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Visite de contrôle ${controle.code} — ${d.verdict.replace(/_/g, ' ')}`,
        action: 'creation',
        entiteType: 'visite_controle',
        entiteId: d.equipementId ?? id,
      },
      (b) => enregistrerVisiteControle(b, { controleId: id, ...d }),
    );
  });

  app.post('/api/reserves/:id/lever', { preHandler: exiger('valider') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { otId } = valider(z.object({ otId: z.string().optional() }), requete.body ?? {});
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Levée de la réserve ${id}`, action: 'validation', entiteType: 'reserve', entiteId: id },
      (b) => leverReserve(b, id, otId),
    );
  });

  /* ---------------- Matériovigilance ---------------- */

  app.post('/api/vigilances', { preHandler: exiger('signaler') }, async (requete, reponse) => {
    const d = valider(
      z.object({
        equipementId: z.string().min(1),
        dateEvenement: z.string().min(4),
        description: z.string().min(10, 'décrivez précisément l’événement'),
        gravite: z.enum(['mineur', 'majeur', 'critique', 'deces']),
        patientImplique: z.boolean().default(false),
        consequencePatient: z.string().optional(),
        mesuresImmediates: z.string().min(5, 'indiquez ce qui a été fait sur le moment'),
        declareAutorite: z.boolean().default(false),
        numeroDeclaration: z.string().optional(),
        fabricantInforme: z.boolean().default(false),
      }),
      requete.body,
    );
    if (!lireBase().equipements.some((e) => e.id === d.equipementId)) {
      throw new ErreurMetier('Équipement inconnu', 422);
    }
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Déclaration de matériovigilance — ${d.gravite}`, action: 'creation', entiteType: 'vigilance', entiteId: d.equipementId },
      (b) => creerVigilance(b, { ...d, declarantId: auteur }),
    );
  });

  app.post('/api/vigilances/:id/cloturer', { preHandler: exiger('valider') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { analyseCause, actionsCorrectives } = valider(
      z.object({
        analyseCause: z.string().optional(),
        actionsCorrectives: z.array(z.string()).default([]),
      }),
      requete.body ?? {},
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Clôture du dossier de vigilance ${id}`, action: 'cloture', entiteType: 'vigilance', entiteId: id },
      (b) => {
        const v = b.vigilances.find((x) => x.id === id);
        if (!v) throw new ErreurMetier('Dossier introuvable', 404);
        if (analyseCause) v.analyseCause = analyseCause;
        if (actionsCorrectives.length) v.actionsCorrectives = actionsCorrectives;
        v.statut = 'clos';
        v.dateCloture = new Date().toISOString().slice(0, 10);
        return v;
      },
    );
  });

  app.post('/api/rappels/:id/equipements/:equipementId', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id, equipementId } = valider(
      z.object({ id: z.string().min(1), equipementId: z.string().min(1) }),
      requete.params,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Rappel ${id} traité sur l’équipement ${equipementId}`, entiteType: 'rappel', entiteId: id },
      (b) => {
        if (!b.rappels.some((r) => r.id === id)) throw new ErreurMetier('Rappel introuvable', 404);
        marquerEquipementTraite(b, id, equipementId);
      },
    );
  });
}
