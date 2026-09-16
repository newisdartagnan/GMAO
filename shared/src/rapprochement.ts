import type { BaseGMAO, DomaineTechnique, Equipement, ID } from './domaine';
import { normaliser } from './format';

/**
 * Rapprochement d'un signalement avec l'inventaire.
 *
 * Le formulaire en service demande l'équipement en texte libre : on y lit
 * « climatiseur », « robinet », « prise murale oxygène ». Rien qui désigne une
 * machine précise — et il y a quarante climatiseurs dans l'établissement.
 *
 * Plutôt que d'exiger un numéro d'inventaire que personne n'ira chercher à
 * 3 h du matin, on propose. Le local déclaré, le corps de métier et les mots
 * de la désignation suffisent le plus souvent à ramener la bonne machine dans
 * les trois premières propositions ; le responsable la confirme d'un clic.
 *
 * Le classement est délibérément explicable : chaque point gagné a une raison
 * qu'on peut lire à l'écran. Un rapprochement automatique qui se trompe en
 * silence coûterait plus cher que pas de rapprochement du tout — c'est
 * pourquoi rien n'est rattaché sans confirmation.
 */

export interface CandidatEquipement {
  equipement: Equipement;
  score: number;
  /** Ce qui a valu ses points au candidat, à afficher tel quel. */
  raisons: string[];
}

export interface CritèresRapprochement {
  /** Désignation libre saisie par le demandeur. */
  designation?: string;
  /** Local déclaré, s'il a pu être résolu. */
  localId?: ID;
  /** Salle telle que saisie, quand le local n'a pas été résolu. */
  salle?: string;
  /** Bâtiment ou site déclaré. */
  lieu?: string;
  domaine?: DomaineTechnique;
}

/** Mots vides : présents partout, ils ne distinguent rien. */
const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'dans', 'au', 'aux',
  'et', 'ou', 'a', 'en', 'sur', 'pour', 'par', 'avec', 'est', 'qui',
]);

function mots(texte: string): string[] {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
}

/**
 * Propose les équipements qui peuvent correspondre au signalement.
 *
 * `limite` borne ce qui est rendu : au-delà de cinq propositions, choisir
 * devient plus long que chercher, et l'aide se retourne contre celui qu'elle
 * prétend servir.
 */
export function suggererEquipements(
  base: BaseGMAO,
  criteres: CritèresRapprochement,
  limite = 5,
): CandidatEquipement[] {
  const motsDesignation = criteres.designation ? mots(criteres.designation) : [];
  if (!motsDesignation.length && !criteres.localId) return [];

  const local = criteres.localId ? base.locaux.find((l) => l.id === criteres.localId) : undefined;
  const salle = criteres.salle ? normaliser(criteres.salle) : '';
  const lieu = criteres.lieu ? normaliser(criteres.lieu) : '';

  const candidats: CandidatEquipement[] = [];

  for (const e of base.equipements) {
    if (!e.actif || e.statut === 'reforme') continue;

    let score = 0;
    const raisons: string[] = [];

    // --- Ce que le demandeur a écrit, contre la désignation du parc ---
    if (motsDesignation.length) {
      const motsEquipement = new Set([
        ...mots(e.designation),
        ...mots(e.marque),
        ...mots(e.modele),
      ]);
      const communs = motsDesignation.filter((m) => motsEquipement.has(m));
      if (communs.length) {
        score += communs.length * 10;
        raisons.push(`désignation : ${communs.join(', ')}`);
      } else {
        // Un mot qui n'est qu'un préfixe compte moins : « clim » pour
        // « climatiseur », « respi » pour « respirateur ».
        const partiels = motsDesignation.filter((m) =>
          [...motsEquipement].some((x) => x.startsWith(m) || m.startsWith(x)),
        );
        if (partiels.length) {
          score += partiels.length * 4;
          raisons.push(`désignation approchante : ${partiels.join(', ')}`);
        }
      }
    }

    // --- Le lieu ---
    if (local && e.localId === local.id) {
      score += 25;
      raisons.push(`dans ${local.nom}`);
    } else if (local && e.serviceId === local.serviceId) {
      score += 8;
      raisons.push('même service');
    } else if (salle) {
      const localEquipement = base.locaux.find((l) => l.id === e.localId);
      if (localEquipement && normaliser(localEquipement.nom).includes(salle)) {
        score += 20;
        raisons.push(`dans ${localEquipement.nom}`);
      }
    }

    if (lieu && !local) {
      const batiment = base.batiments.find((b) => b.id === e.batimentId);
      const site = base.sites.find((s) => s.id === e.siteId);
      if (
        (batiment && (normaliser(batiment.nom).includes(lieu) || normaliser(batiment.code) === lieu)) ||
        (site && (normaliser(site.nom).includes(lieu) || normaliser(site.code) === lieu))
      ) {
        score += 6;
        raisons.push(`bâtiment ${batiment?.nom ?? lieu}`);
      }
    }

    // --- Le corps de métier ---
    if (criteres.domaine && e.domaine === criteres.domaine) {
      score += 5;
      raisons.push('même domaine technique');
    }

    if (score <= 0) continue;
    candidats.push({ equipement: e, score, raisons });
  }

  const parDesignation = candidats.filter((c) => c.raisons.some((r) => r.startsWith('désignation')));

  /*
   * Ce qui porte les mots du demandeur passe avant, et seul.
   *
   * Sans cette séparation, un signalement de disjoncteur ramènerait en tête
   * le climatiseur du même local — vingt-cinq points pour être dans la bonne
   * pièce, contre rien pour le mot. Proposer à côté est pire que ne rien
   * proposer : on apprend à ne plus lire la liste.
   *
   * Le repli par le lieu reste utile quand aucun mot ne correspond : « la
   * machine du local de pompe » n'a pas de nom, mais il n'y en a que trois
   * dans ce local.
   */
  const retenus = parDesignation.length
    ? parDesignation
    : candidats.filter((c) => c.score >= 20);

  return retenus
    .sort((a, b) => b.score - a.score || a.equipement.code.localeCompare(b.equipement.code))
    .slice(0, limite);
}
