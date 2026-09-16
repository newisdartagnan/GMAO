import type { DomaineTechnique } from './domaine';
import { normaliser } from './format';

/**
 * Lecture du secteur déclaré sur un formulaire de signalement.
 *
 * Les formulaires en service font choisir un corps de métier — « Plomberie »,
 * « Gaz Médicaux », « It/réseau » — dans une liste qui leur est propre. La
 * GMAO, elle, raisonne en domaines techniques. La correspondance est faite
 * ici, une fois, plutôt qu'au moment de créer chaque ordre de travail.
 *
 * Elle ne décide de rien : elle présélectionne l'équipe, et le responsable
 * garde la main. Un « Autres » sans correspondance n'est pas une erreur, c'est
 * un arbitrage qui revient à l'humain.
 */

export interface Secteur {
  /** Libellé tel qu'il figure dans le formulaire. */
  libelle: string;
  domaine?: DomaineTechnique;
}

/** Les neuf choix du formulaire de signalement de Monkole. */
export const SECTEURS: Secteur[] = [
  { libelle: 'Plomberie', domaine: 'technique_batiment' },
  { libelle: 'Électricité', domaine: 'technique_batiment' },
  { libelle: 'Climatisation', domaine: 'technique_batiment' },
  { libelle: 'Gaz Médicaux', domaine: 'fluides_medicaux' },
  { libelle: 'Biomédical', domaine: 'biomedical' },
  { libelle: 'Menuiserie', domaine: 'technique_batiment' },
  { libelle: 'Maçonnerie', domaine: 'technique_batiment' },
  { libelle: 'It/réseau', domaine: 'informatique' },
  { libelle: 'Autres' },
];

/**
 * Mots qui trahissent un domaine, quand le secteur déclaré ne suffit pas.
 *
 * Utile dans deux cas : « Autres », choisi par défaut par qui ne sait pas où
 * se ranger, et les formulaires dont la liste ne correspond pas à celle-ci.
 */
const INDICES: [RegExp, DomaineTechnique][] = [
  // Les métiers les plus spécifiques passent en premier : « prise murale
  // d'oxygène » et « prise de courant » n'appellent pas le même technicien, et
  // le seul mot « prise » ne tranche pas.
  [/oxygene|\bo2\b|gaz medic|vide medic|air medic|fluide medic|detendeur|prise murale|manodetendeur/, 'fluides_medicaux'],
  [/biomed|respirateur|moniteur|pousse.?seringue|echographe|scanner|dialyse|bistouri|defibrillateur|couveuse/, 'biomedical'],
  [/informatique|reseau|ordinateur|imprimante|wifi|logiciel|ecran|cable rj/, 'informatique'],
  [/incendie|extincteur|detecteur de fumee|desenfumage|alarme incendie/, 'securite_incendie'],
  [/plomberie|robinet|fuite|evier|lavabo|\bwc\b|sanitaire|chasse|canalisation|siphon/, 'technique_batiment'],
  [/electri|lampe|ampoule|disjoncteur|tableau|eclairage|courant|tgbt|onduleur|groupe electro/, 'technique_batiment'],
  [/clim|split|ventilation|traitement d.?air|chauffage|froid/, 'technique_batiment'],
  [/menuiserie|porte|fenetre|placard|serrure|poignee|meuble/, 'technique_batiment'],
  [/maconnerie|\bmur\b|carrelage|plafond|peinture|dalle|beton/, 'technique_batiment'],
];

/** Domaine technique correspondant à un secteur déclaré. */
export function domaineDuSecteur(secteur: string | undefined): DomaineTechnique | undefined {
  if (!secteur) return undefined;
  const cible = normaliser(secteur);
  const connu = SECTEURS.find((s) => normaliser(s.libelle) === cible);
  if (connu) return connu.domaine;
  // Liste inconnue : on cherche le métier dans les mots du libellé.
  return INDICES.find(([motif]) => motif.test(cible))?.[1];
}

/**
 * Domaine déduit de tout ce que la demande dit, secteur compris.
 *
 * Quand le secteur ne tranche pas — « Autres » —, la désignation de l'objet
 * et la description en disent souvent assez : « robinet qui fuit » n'a pas
 * besoin qu'on précise « Plomberie ».
 */
export function deduireDomaine(champs: {
  secteur?: string;
  designation?: string;
  description?: string;
}): DomaineTechnique | undefined {
  const parSecteur = domaineDuSecteur(champs.secteur);
  if (parSecteur) return parSecteur;

  const texte = normaliser(`${champs.designation ?? ''} ${champs.description ?? ''}`);
  if (!texte.trim()) return undefined;
  return INDICES.find(([motif]) => motif.test(texte))?.[1];
}
