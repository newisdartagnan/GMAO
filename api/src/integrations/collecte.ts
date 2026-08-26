import type { BaseGMAO, DemandeIntervention } from '@gmao/partage';
import { normaliser } from '@gmao/partage';
import { commande, lireBase } from '../etat.ts';
import { pool } from '../db/pool.ts';
import { config, jotformRecuperationActive } from '../config.ts';
import {
  SOURCE,
  chargerCorrespondance,
  convertirSoumission,
  integrerDemande,
  recupererSoumissions,
} from './jotform.ts';
import type { SoumissionJotForm } from './jotform.ts';

/**
 * Collecte des demandes venues du formulaire.
 *
 * Deux entrées, un seul chemin de traitement : que la soumission arrive par
 * webhook ou par récupération périodique, elle passe par `importer()`, qui la
 * convertit et l'ajoute à l'agrégat comme n'importe quelle autre écriture.
 * L'unicité sur l'identifiant de soumission fait le reste : si le webhook et
 * la récupération voient la même réponse, la seconde ne crée rien.
 */

export interface ResultatImport {
  creees: DemandeIntervention[];
  ignorees: number;
  rejets: { soumissionId: string; motif: string }[];
}

/**
 * Compte au nom duquel sont ouvertes les demandes dont le déclarant n'est pas
 * reconnu. `JOTFORM_COMPTE_SERVICE` peut désigner une adresse ou un matricule ;
 * à défaut on prend un compte technique, jamais un compte au hasard.
 */
export function comptePorteur(base: BaseGMAO): string {
  const demande = normaliser(config.jotform.compteService);
  if (demande) {
    const trouve = base.utilisateurs.find(
      (u) =>
        normaliser(u.email) === demande ||
        normaliser(u.matricule) === demande ||
        u.id === config.jotform.compteService,
    );
    if (trouve) return trouve.id;
  }
  const secours =
    base.utilisateurs.find((u) => u.actif && u.role === 'responsable_biomedical') ??
    base.utilisateurs.find((u) => u.actif && u.role === 'admin') ??
    base.utilisateurs[0];
  return secours.id;
}

/**
 * Convertit et enregistre un lot de soumissions.
 *
 * Le lot entier passe dans une seule commande : une transaction, un patch, et
 * une entrée d'audit qui dit combien de demandes sont entrées par le
 * formulaire — plutôt qu'une ligne de journal par réponse.
 */
export async function importer(soumissions: SoumissionJotForm[]): Promise<ResultatImport> {
  const vide: ResultatImport = { creees: [], ignorees: 0, rejets: [] };
  if (!soumissions.length) return vide;

  const correspondance = chargerCorrespondance(config.jotform.champs || undefined);
  const porteur = comptePorteur(lireBase());

  const { resultat } = await commande(
    {
      utilisateurId: porteur,
      libelle:
        soumissions.length === 1
          ? 'Demande reçue du formulaire externe'
          : `${soumissions.length} soumissions reçues du formulaire externe`,
      action: 'creation',
      entiteType: 'demande',
      entiteId: SOURCE,
    },
    (b) => {
      const sortie: ResultatImport = { creees: [], ignorees: 0, rejets: [] };
      for (const soumission of soumissions) {
        const conversion = convertirSoumission(b, soumission, correspondance, porteur);
        if (conversion.rejet) {
          sortie.rejets.push({ soumissionId: conversion.soumissionId, motif: conversion.rejet });
          continue;
        }
        const demande = integrerDemande(b, conversion);
        if (demande) sortie.creees.push(demande);
        else sortie.ignorees += 1;
      }
      return sortie;
    },
  );

  return resultat;
}

/* ------------------------------------------------------------------ */
/* Position de lecture                                                 */
/* ------------------------------------------------------------------ */

export interface EtatIntegration {
  source: string;
  derniereLecture: string | null;
  dernierHorodatage: string | null;
  soumissionsTraitees: number;
  derniereErreur: string | null;
  actif: boolean;
}

export async function lireEtatIntegration(source = SOURCE): Promise<EtatIntegration | null> {
  const { rows } = await pool.query(
    `SELECT source, derniere_lecture, dernier_horodatage, soumissions_traitees, derniere_erreur, actif
       FROM integrations_etat WHERE source = $1`,
    [source],
  );
  const l = rows[0];
  if (!l) return null;
  return {
    source: l.source,
    derniereLecture: l.derniere_lecture ? new Date(l.derniere_lecture).toISOString() : null,
    dernierHorodatage: l.dernier_horodatage,
    soumissionsTraitees: l.soumissions_traitees,
    derniereErreur: l.derniere_erreur,
    actif: l.actif,
  };
}

async function noterLecture(horodatage: string | undefined, traitees: number, erreur?: string): Promise<void> {
  await pool.query(
    `INSERT INTO integrations_etat (source, derniere_lecture, dernier_horodatage, soumissions_traitees, derniere_erreur)
          VALUES ($1, now(), $2, $3, $4)
     ON CONFLICT (source) DO UPDATE
            SET derniere_lecture     = now(),
                -- La position n'avance jamais à reculons : une lecture qui
                -- échoue ou ne rapporte rien laisse le repère où il était.
                dernier_horodatage   = COALESCE($2, integrations_etat.dernier_horodatage),
                soumissions_traitees = integrations_etat.soumissions_traitees + $3,
                derniere_erreur      = $4`,
    [SOURCE, horodatage ?? null, traitees, erreur ?? null],
  );
}

/* ------------------------------------------------------------------ */
/* Récupération périodique                                             */
/* ------------------------------------------------------------------ */

export interface ResultatSynchronisation extends ResultatImport {
  lues: number;
  depuis: string | null;
  jusqua: string | null;
}

/**
 * Interroge JotForm et importe ce qui est nouveau depuis la dernière fois.
 *
 * `forcerDepuis` permet une reprise manuelle — après une panne réseau
 * prolongée, ou pour rejouer une période : les doublons sont écartés à
 * l'insertion, donc relire trop large n'a aucune conséquence.
 */
export async function synchroniser(forcerDepuis?: string): Promise<ResultatSynchronisation> {
  if (!config.jotform.cleApi || !config.jotform.formulaireId) {
    throw new Error(
      'Le connecteur JotForm n’est pas configuré : renseignez JOTFORM_API_KEY et JOTFORM_FORMULAIRE_ID.',
    );
  }

  const etat = await lireEtatIntegration();
  const depuis = forcerDepuis ?? etat?.dernierHorodatage ?? undefined;

  let soumissions: SoumissionJotForm[];
  let dernierHorodatage: string | undefined;
  try {
    const reponse = await recupererSoumissions({
      cleApi: config.jotform.cleApi,
      formulaireId: config.jotform.formulaireId,
      base: config.jotform.apiBase,
      depuis,
    });
    soumissions = reponse.soumissions;
    dernierHorodatage = reponse.dernierHorodatage;
  } catch (e) {
    await noterLecture(undefined, 0, e instanceof Error ? e.message : String(e));
    throw e;
  }

  const resultat = await importer(soumissions);
  await noterLecture(dernierHorodatage, resultat.creees.length);

  return {
    ...resultat,
    lues: soumissions.length,
    depuis: depuis ?? null,
    jusqua: dernierHorodatage ?? null,
  };
}

let minuterie: NodeJS.Timeout | null = null;

/** Démarre la boucle de récupération si la configuration la rend possible. */
export function demarrerCollecte(journaliser: (m: string, e?: unknown) => void): void {
  if (minuterie) return;
  if (!jotformRecuperationActive()) {
    journaliser(
      config.jotform.secretWebhook
        ? 'JotForm : récupération périodique inactive, le webhook reste ouvert'
        : 'JotForm : connecteur inactif (ni clé d’API ni secret de webhook)',
    );
    return;
  }

  const periode = Math.max(1, config.jotform.intervalleMin) * 60_000;
  const tour = async () => {
    try {
      const r = await synchroniser();
      if (r.creees.length || r.rejets.length) {
        journaliser(
          `JotForm : ${r.lues} soumission(s) lue(s), ${r.creees.length} demande(s) créée(s)` +
            (r.rejets.length ? `, ${r.rejets.length} écartée(s)` : ''),
        );
      }
    } catch (e) {
      // Une coupure réseau ne doit pas arrêter la boucle : le repère de
      // lecture n'a pas bougé, le tour suivant rattrapera ce qui manque.
      journaliser('JotForm : récupération impossible, nouvelle tentative au prochain tour', e);
    }
  };

  minuterie = setInterval(() => void tour(), periode);
  minuterie.unref?.();
  journaliser(`JotForm : récupération toutes les ${config.jotform.intervalleMin} min`);
  void tour();
}

export function arreterCollecte(): void {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
