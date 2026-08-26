import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  changerStatutEquipement,
  deplacerEquipement,
  releverCompteur,
} from '@gmao/partage';
import type { Equipement, NiveauCriticite, StatutEquipement } from '@gmao/partage';
import { exiger, utilisateurDe } from '../auth.ts';
import { ErreurMetier, idParam, repondreCommande, valider } from './aide.ts';
import { lireBase } from '../etat.ts';

const STATUTS = [
  'en_service', 'en_panne', 'en_maintenance', 'attente_pieces', 'en_pret', 'en_stock', 'reforme',
] as const;

const equipementNouveau = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  designation: z.string().min(1),
  familleId: z.string().min(1),
  marque: z.string().default(''),
  modele: z.string().default(''),
  numeroSerie: z.string().default(''),
  classeDM: z.enum(['I', 'IIa', 'IIb', 'III', 'DMDIV', 'hors_DM']),
  criticite: z.number().int().min(1).max(4),
  localId: z.string().min(1),
  dateAcquisition: z.string().min(4),
  dateMiseEnService: z.string().min(4),
  valeurAchat: z.number().min(0).default(0),
  finGarantie: z.string().optional(),
  fournisseurId: z.string().optional(),
  risqueInfectieux: z.boolean().default(false),
  notes: z.string().optional(),
});

/** Champs qu'une modification de fiche peut toucher. Volontairement fermé :
 *  déplacer un équipement ou changer son statut passe par une route dédiée,
 *  parce que ces deux opérations laissent une trace supplémentaire. */
const equipementModifiable = z
  .object({
    designation: z.string().min(1),
    marque: z.string(),
    modele: z.string(),
    numeroSerie: z.string(),
    familleId: z.string(),
    classeDM: z.enum(['I', 'IIa', 'IIb', 'III', 'DMDIV', 'hors_DM']),
    criticite: z.number().int().min(1).max(4),
    marquageCE: z.boolean(),
    numeroCE: z.string(),
    soumisVigilance: z.boolean(),
    fabricantId: z.string(),
    fournisseurId: z.string(),
    contratId: z.string(),
    equipementSecoursId: z.string(),
    dateAcquisition: z.string(),
    dateMiseEnService: z.string(),
    valeurAchat: z.number().min(0),
    dureeAmortissementAns: z.number().int().min(1).max(50),
    finGarantie: z.string(),
    risqueInfectieux: z.boolean(),
    sourceRadioactive: z.boolean(),
    gazMedicaux: z.boolean(),
    alimentationSecourue: z.boolean(),
    objectifDisponibilite: z.number().min(0).max(100),
    notes: z.string(),
  })
  .partial();

export async function routesParc(app: FastifyInstance): Promise<void> {
  app.post('/api/equipements', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const d = valider(equipementNouveau, requete.body);
    const base = lireBase();
    if (base.equipements.some((e) => e.code === d.code)) {
      throw new ErreurMetier(`Le numéro d’inventaire ${d.code} est déjà attribué.`, 409);
    }
    const local = base.locaux.find((l) => l.id === d.localId);
    if (!local) throw new ErreurMetier('Local inconnu', 422);

    await repondreCommande(
      requete,
      reponse,
      { libelle: `Création de l’équipement ${d.code}`, action: 'creation', entiteType: 'equipement', entiteId: d.id },
      (b) => {
        const l = b.locaux.find((x) => x.id === d.localId)!;
        const famille = b.familles.find((f) => f.id === d.familleId);
        const equipement: Equipement = {
          id: d.id,
          code: d.code,
          designation: d.designation,
          familleId: d.familleId,
          domaine: famille?.domaine ?? 'biomedical',
          marque: d.marque,
          modele: d.modele,
          numeroSerie: d.numeroSerie,
          classeDM: d.classeDM,
          marquageCE: d.classeDM !== 'hors_DM',
          soumisVigilance: ['IIb', 'III'].includes(d.classeDM),
          fournisseurId: d.fournisseurId || undefined,
          fabricantId: d.fournisseurId || undefined,
          siteId: l.siteId,
          batimentId: l.batimentId,
          localId: l.id,
          serviceId: l.serviceId,
          statut: 'en_service',
          criticite: d.criticite as NiveauCriticite,
          dateAcquisition: d.dateAcquisition,
          dateMiseEnService: d.dateMiseEnService,
          valeurAchat: d.valeurAchat,
          dureeAmortissementAns: famille?.dureeVieAns ?? 8,
          finGarantie: d.finGarantie || undefined,
          compteurs: [],
          risqueInfectieux: d.risqueInfectieux,
          sourceRadioactive: false,
          gazMedicaux: false,
          alimentationSecourue: d.criticite <= 2,
          objectifDisponibilite: d.criticite === 1 ? 99 : 95,
          qrToken: `GMAO:${d.code}`,
          actif: true,
          notes: d.notes || undefined,
        };
        b.equipements.push(equipement);
        return equipement;
      },
    );
  });

  app.patch('/api/equipements/:id', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const modifs = valider(equipementModifiable, requete.body);
    if (!lireBase().equipements.some((e) => e.id === id)) {
      throw new ErreurMetier('Équipement introuvable', 404);
    }
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Modification de la fiche ${id}`, entiteType: 'equipement', entiteId: id },
      (b) => {
        const eq = b.equipements.find((e) => e.id === id)!;
        for (const [champ, valeur] of Object.entries(modifs)) {
          // Une chaîne vide vaut effacement d'un champ facultatif.
          (eq as unknown as Record<string, unknown>)[champ] = valeur === '' ? undefined : valeur;
        }
        return eq;
      },
    );
  });

  app.post('/api/equipements/:id/deplacer', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { localId, motif } = valider(
      z.object({ localId: z.string().min(1), motif: z.string().min(3, 'le motif est obligatoire') }),
      requete.body,
    );
    const auteur = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Déplacement de l’équipement ${id}`, entiteType: 'equipement', entiteId: id, details: motif },
      (b) => {
        if (!b.equipements.some((e) => e.id === id)) throw new ErreurMetier('Équipement introuvable', 404);
        deplacerEquipement(b, id, localId, motif, auteur);
      },
    );
  });

  app.post('/api/equipements/:id/compteur', { preHandler: exiger('intervenir') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { valeur } = valider(z.object({ valeur: z.number().min(0) }), requete.body);
    const eq = lireBase().equipements.find((e) => e.id === id);
    if (!eq) throw new ErreurMetier('Équipement introuvable', 404);
    if (!eq.compteurs.length) throw new ErreurMetier('Cet équipement ne possède pas de compteur d’usage.', 422);
    if (valeur < eq.compteurs[0].valeur) {
      throw new ErreurMetier(
        `Relevé inférieur au précédent (${eq.compteurs[0].valeur} ${eq.compteurs[0].unite}). Corriger la saisie ou signaler un remplacement de compteur.`,
        422,
      );
    }
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Relevé de compteur sur ${eq.code} : ${valeur} ${eq.compteurs[0].unite}`, entiteType: 'equipement', entiteId: id },
      (b) => releverCompteur(b, id, valeur),
    );
  });

  app.post('/api/equipements/:id/statut', { preHandler: exiger('administrer') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { statut, motif } = valider(
      z.object({ statut: z.enum(STATUTS), motif: z.string().optional() }),
      requete.body,
    );
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Statut de l’équipement ${id} : ${statut.replace(/_/g, ' ')}`,
        entiteType: 'equipement',
        entiteId: id,
        details: motif,
      },
      (b) => {
        if (!b.equipements.some((e) => e.id === id)) throw new ErreurMetier('Équipement introuvable', 404);
        changerStatutEquipement(b, id, statut as StatutEquipement);
      },
    );
  });
}
