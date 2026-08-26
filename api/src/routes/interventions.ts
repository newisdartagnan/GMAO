import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  affecterOT,
  ajouterCommentaire,
  ajouterPiece,
  ajouterTemps,
  changerStatutOT,
  creerDemande,
  creerOT,
  genererOTPreventifs,
  refuserDemande,
} from '@gmao/partage';
import type { CausePanne, PrioriteOT, StatutOT } from '@gmao/partage';
import { exiger, utilisateurDe } from '../auth.ts';
import { ErreurMetier, idParam, repondreCommande, valider } from './aide.ts';
import { lireBase } from '../etat.ts';

const PRIORITES = ['P1', 'P2', 'P3', 'P4'] as const;
const TYPES = [
  'correctif', 'preventif', 'predictif', 'reglementaire', 'metrologie', 'amelioration', 'installation', 'reforme',
] as const;
const STATUTS_OT = [
  'a_planifier', 'planifie', 'affecte', 'en_cours', 'attente_pieces', 'attente_prestataire',
  'realise', 'cloture', 'annule',
] as const;
const CAUSES = [
  'usure_normale', 'defaut_fabrication', 'mauvaise_utilisation', 'defaut_alimentation', 'encrassement',
  'choc_accident', 'logiciel', 'consommable_epuise', 'environnement', 'indeterminee',
] as const;

export async function routesInterventions(app: FastifyInstance): Promise<void> {
  /* ---------------- Demandes d'intervention ---------------- */

  app.post('/api/demandes', { preHandler: exiger('signaler') }, async (requete, reponse) => {
    const d = valider(
      z.object({
        equipementId: z.string().optional(),
        localId: z.string().optional(),
        serviceId: z.string().optional(),
        objet: z.string().min(3, 'décrivez brièvement le problème'),
        description: z.string().default(''),
        urgenceDeclaree: z.enum(PRIORITES).default('P3'),
        impactPatient: z.enum(['aucun', 'gene', 'report_soin', 'risque_vital']).default('gene'),
        canal: z.enum(['web', 'qr_code', 'telephone', 'api', 'terrain']).default('web'),
      }),
      requete.body,
    );
    const auteur = utilisateurDe(requete).sub;
    const base = lireBase();
    const equipement = d.equipementId ? base.equipements.find((e) => e.id === d.equipementId) : undefined;
    if (d.equipementId && !equipement) throw new ErreurMetier('Équipement inconnu', 422);

    await repondreCommande(
      requete,
      reponse,
      { libelle: `Demande d’intervention : ${d.objet}`, action: 'creation', entiteType: 'demande', entiteId: d.equipementId ?? '-' },
      (b) => {
        const profil = b.utilisateurs.find((u) => u.id === auteur);
        return creerDemande(b, {
          demandeurId: auteur,
          serviceId: d.serviceId ?? equipement?.serviceId ?? profil?.serviceId ?? b.services[0].id,
          localId: d.localId ?? equipement?.localId,
          equipementId: d.equipementId,
          objet: d.objet,
          description: d.description,
          urgenceDeclaree: d.urgenceDeclaree as PrioriteOT,
          impactPatient: d.impactPatient,
          canal: d.canal,
        });
      },
    );
  });

  app.post('/api/demandes/:id/refuser', { preHandler: exiger('planifier') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { motif } = valider(z.object({ motif: z.string().min(5, 'le motif est communiqué au demandeur') }), requete.body);
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Refus de la demande ${id}`, action: 'validation', entiteType: 'demande', entiteId: id, details: motif },
      (b) => {
        if (!b.demandes.some((x) => x.id === id)) throw new ErreurMetier('Demande introuvable', 404);
        refuserDemande(b, id, motif, auteur);
      },
    );
  });

  app.post('/api/demandes/:id/analyser', { preHandler: exiger('planifier') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Mise en analyse de la demande ${id}`, entiteType: 'demande', entiteId: id },
      (b) => {
        const d = b.demandes.find((x) => x.id === id);
        if (!d) throw new ErreurMetier('Demande introuvable', 404);
        d.statut = 'en_analyse';
      },
    );
  });

  /* ---------------- Ordres de travail ---------------- */

  app.post('/api/ordres-travail', { preHandler: exiger('planifier') }, async (requete, reponse) => {
    const d = valider(
      z.object({
        type: z.enum(TYPES),
        objet: z.string().min(3),
        description: z.string().default(''),
        equipementId: z.string().optional(),
        localId: z.string().optional(),
        serviceId: z.string().optional(),
        priorite: z.enum(PRIORITES),
        datePlanifiee: z.string().optional(),
        equipeId: z.string().optional(),
        technicienPrincipalId: z.string().optional(),
        execution: z.enum(['interne', 'prestataire']).default('interne'),
        prestataireId: z.string().optional(),
        gammeId: z.string().optional(),
        demandeId: z.string().optional(),
      }),
      requete.body,
    );
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Création d’un OT ${d.type} : ${d.objet}`, action: 'creation', entiteType: 'ordre_travail', entiteId: d.equipementId ?? '-' },
      (b) => creerOT(b, d, auteur),
    );
  });

  app.post('/api/ordres-travail/:id/statut', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { statut } = valider(z.object({ statut: z.enum(STATUTS_OT) }), requete.body);
    const jeton = utilisateurDe(requete);
    const ot = lireBase().ordresTravail.find((o) => o.id === id);
    if (!ot) throw new ErreurMetier('Ordre de travail introuvable', 404);
    // La clôture vaut validation : elle engage le responsable, pas l'exécutant.
    if (statut === 'cloture' && !['admin', 'responsable_biomedical', 'responsable_technique', 'qualite'].includes(jeton.role)) {
      throw new ErreurMetier('La clôture d’un ordre de travail relève du responsable du service technique.', 403);
    }
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `${ot.numero} → ${statut.replace(/_/g, ' ')}`,
        action: statut === 'cloture' ? 'cloture' : 'modification',
        entiteType: 'ordre_travail',
        entiteId: id,
      },
      (b) => changerStatutOT(b, id, statut as StatutOT, jeton.sub),
    );
  });

  app.post('/api/ordres-travail/:id/temps', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z.object({
        technicienId: z.string().min(1),
        dureeMin: z.number().int().min(1, 'la durée doit être positive').max(24 * 60),
        commentaire: z.string().optional(),
      }),
      requete.body,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Saisie de ${d.dureeMin} min sur l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        if (!b.ordresTravail.some((o) => o.id === id)) throw new ErreurMetier('Ordre de travail introuvable', 404);
        ajouterTemps(b, id, d);
      },
    );
  });

  app.delete('/api/ordres-travail/:id/temps/:index', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id, index } = valider(
      z.object({ id: z.string().min(1), index: z.coerce.number().int().min(0) }),
      requete.params,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Suppression d’une saisie de temps sur l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        const ot = b.ordresTravail.find((o) => o.id === id);
        if (!ot) throw new ErreurMetier('Ordre de travail introuvable', 404);
        if (index >= ot.temps.length) throw new ErreurMetier('Ligne de temps introuvable', 404);
        ot.temps.splice(index, 1);
      },
    );
  });

  app.post('/api/ordres-travail/:id/pieces', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { articleId, quantite } = valider(
      z.object({ articleId: z.string().min(1), quantite: z.number().int().min(1) }),
      requete.body,
    );
    const article = lireBase().articles.find((a) => a.id === articleId);
    if (!article) throw new ErreurMetier('Article inconnu', 422);
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Ajout de ${quantite} × ${article.designation} sur l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        if (!b.ordresTravail.some((o) => o.id === id)) throw new ErreurMetier('Ordre de travail introuvable', 404);
        ajouterPiece(b, id, articleId, quantite);
      },
    );
  });

  app.delete('/api/ordres-travail/:id/pieces/:index', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id, index } = valider(
      z.object({ id: z.string().min(1), index: z.coerce.number().int().min(0) }),
      requete.params,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Retrait d’une pièce sur l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        const ot = b.ordresTravail.find((o) => o.id === id);
        if (!ot) throw new ErreurMetier('Ordre de travail introuvable', 404);
        const ligne = ot.pieces[index];
        if (!ligne) throw new ErreurMetier('Ligne de pièce introuvable', 404);
        if (ligne.sortieValidee) {
          throw new ErreurMetier('Cette pièce est déjà sortie du stock : passer par un retour au magasin.', 409);
        }
        ot.pieces.splice(index, 1);
      },
    );
  });

  app.post('/api/ordres-travail/:id/commentaire', { preHandler: exiger('signaler') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { texte } = valider(z.object({ texte: z.string().min(1).max(4000) }), requete.body);
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Commentaire sur l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        if (!b.ordresTravail.some((o) => o.id === id)) throw new ErreurMetier('Ordre de travail introuvable', 404);
        ajouterCommentaire(b, id, auteur, texte);
      },
    );
  });

  app.post('/api/ordres-travail/:id/affectation', { preHandler: exiger('planifier') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { technicienId, datePlanifiee } = valider(
      z.object({ technicienId: z.string().optional(), datePlanifiee: z.string().optional() }),
      requete.body,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Affectation de l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        if (!b.ordresTravail.some((o) => o.id === id)) throw new ErreurMetier('Ordre de travail introuvable', 404);
        affecterOT(b, id, technicienId || undefined, datePlanifiee);
      },
    );
  });

  /** Renseignements de terrain : mesures, préparation sécurité, coût externe. */
  app.patch('/api/ordres-travail/:id', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z
        .object({
          diagnostic: z.string(),
          actionsRealisees: z.string(),
          causePanne: z.enum(CAUSES),
          arretEquipementMin: z.number().int().min(0),
          coutPrestataire: z.number().min(0),
          conformite: z.enum(['conforme', 'conforme_avec_reserves', 'non_conforme']),
          securite: z.object({
            consignationElectrique: z.boolean(),
            desinfectionPrealable: z.boolean(),
            epiPortes: z.boolean(),
            permisFeu: z.boolean(),
            patientEvacue: z.boolean(),
          }),
          mesures: z.array(
            z.object({
              operationId: z.string(),
              valeur: z.number().optional(),
              texte: z.string().optional(),
              conforme: z.boolean(),
              commentaire: z.string().optional(),
            }),
          ),
        })
        .partial(),
      requete.body,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Renseignement de l’OT ${id}`, entiteType: 'ordre_travail', entiteId: id },
      (b) => {
        const ot = b.ordresTravail.find((o) => o.id === id);
        if (!ot) throw new ErreurMetier('Ordre de travail introuvable', 404);
        if (ot.statut === 'cloture') {
          throw new ErreurMetier('Un ordre de travail clôturé ne se modifie plus : il fait foi en audit.', 409);
        }
        Object.assign(ot, d);
        return ot;
      },
    );
  });

  /** Compte rendu de fin d'intervention, avec sortie de stock des pièces. */
  app.post('/api/ordres-travail/:id/cloture', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z.object({
        diagnostic: z.string().optional(),
        causePanne: z.enum(CAUSES).optional(),
        actionsRealisees: z.string().min(5, 'le compte rendu est obligatoire'),
        arretEquipementMin: z.number().int().min(0).default(0),
        conformite: z.enum(['conforme', 'conforme_avec_reserves', 'non_conforme']).default('conforme'),
        cloturer: z.boolean().default(false),
      }),
      requete.body,
    );
    const jeton = utilisateurDe(requete);
    if (d.cloturer && !['admin', 'responsable_biomedical', 'responsable_technique', 'qualite'].includes(jeton.role)) {
      throw new ErreurMetier('La clôture relève du responsable ; enregistrez l’intervention comme réalisée.', 403);
    }
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Compte rendu de l’OT ${id}`,
        action: d.cloturer ? 'cloture' : 'modification',
        entiteType: 'ordre_travail',
        entiteId: id,
      },
      (b) => {
        const ot = b.ordresTravail.find((o) => o.id === id);
        if (!ot) throw new ErreurMetier('Ordre de travail introuvable', 404);
        ot.diagnostic = d.diagnostic;
        ot.causePanne = d.causePanne as CausePanne | undefined;
        ot.actionsRealisees = d.actionsRealisees;
        ot.arretEquipementMin = d.arretEquipementMin;
        ot.conformite = d.conformite;
        ot.signatureTechnicien = jeton.nom;
        changerStatutOT(b, id, d.cloturer ? 'cloture' : 'realise', jeton.sub);
        return ot;
      },
    );
  });

  /* ---------------- Génération du préventif ---------------- */

  app.post('/api/preventif/generer', { preHandler: exiger('planifier') }, async (requete, reponse) => {
    const { horizonJours } = valider(
      z.object({ horizonJours: z.number().int().min(1).max(365).default(30) }),
      requete.body ?? {},
    );
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Génération des OT préventifs à ${horizonJours} jours`, action: 'generation', entiteType: 'gamme', entiteId: '-' },
      (b) => {
        const crees = genererOTPreventifs(b, horizonJours, auteur);
        return { crees: crees.length, numeros: crees.slice(0, 20).map((o) => o.numero) };
      },
    );
  });
}

