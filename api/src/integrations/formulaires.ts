import type { BaseGMAO, DemandeIntervention, PrioriteOT } from '@gmao/partage';
import { aujourdHui, deduireDomaine, isoHeure, normaliser, numeroSuivant, uid } from '@gmao/partage';

/**
 * Conversion d'une soumission de formulaire en demande d'intervention.
 *
 * Ce module ne connaît aucun fournisseur. JotForm, Microsoft Forms ou un
 * tableur relu à la main produisent tous la même `SoumissionFormulaire`, et
 * c'est cette forme neutre qui est interprétée ici. L'intérêt n'est pas la
 * pureté : c'est que les règles délicates — l'appariement des questions, la
 * lecture du vocabulaire d'urgence, la résolution d'un local — n'existent
 * qu'en un exemplaire et s'éprouvent une fois pour toutes.
 */

/** Une réponse, telle que le formulaire la donne. */
export interface ReponseFormulaire {
  /** Nom technique de la question, quand le formulaire en attribue un. */
  nom?: string;
  /** Libellé lu par l'agent. Seul repère dans Microsoft Forms. */
  libelle?: string;
  valeur: string;
}

export interface SoumissionFormulaire {
  source: string;
  id: string;
  formulaireId: string;
  /** Horodatage d'origine, au format ISO si le fournisseur le permet. */
  date?: string;
  reponses: ReponseFormulaire[];
}

/**
 * Noms de questions reconnus pour chaque case d'une demande.
 *
 * L'ordre des clés compte : c'est l'ordre d'attribution, et une réponse déjà
 * prise n'est plus proposée. La description passe avant l'objet parce qu'un
 * libellé comme « Description du problème » contient les deux mots, et que
 * c'est bien une description.
 */
export interface CorrespondanceChamps {
  /** Numéro d'inventaire, celui que le QR code pré-remplit. */
  equipement: string[];
  /** Désignation libre de l'objet en panne : « climatiseur », « robinet ». */
  designation: string[];
  secteur: string[];
  lieu: string[];
  local: string[];
  description: string[];
  anciennete: string[];
  objet: string[];
  urgence: string[];
  impact: string[];
  declarant: string[];
  service: string[];
}

export const CORRESPONDANCE_PAR_DEFAUT: CorrespondanceChamps = {
  equipement: ['codeInventaire', 'codeEquipement', 'numeroInventaire', 'inventaire', 'code'],
  designation: ['equipement', 'installation', 'materiel', 'appareil', 'machine'],
  secteur: ['secteur', 'domaine', 'corpsDeMetier', 'specialite'],
  lieu: ['lieu', 'batiment', 'site', 'pavillon', 'centre'],
  local: ['salle', 'localisation', 'chambre', 'endroit', 'local', 'piece'],
  description: ['description', 'details', 'constat', 'commentaire', 'message'],
  // L'ancienneté passe avant l'objet : « Depuis quand le problème
  // existe-t-il ? » contient le mot « problème », qui est un nom accepté pour
  // l'objet, et serait sinon lu comme l'intitulé de la demande.
  anciennete: ['depuis', 'anciennete', 'duree', 'apparition', 'debut'],
  objet: ['objet', 'probleme', 'panne', 'sujet', 'titre'],
  urgence: ['urgence', 'priorite', 'degreUrgence', 'niveau'],
  impact: ['impact', 'impactPatient', 'consequence'],
  declarant: ['declarant', 'demandeur', 'contact', 'agent', 'nom'],
  service: ['service', 'unite', 'serviceDemandeur'],
};

/**
 * La valeur saisie ressemble-t-elle à un numéro d'inventaire ?
 *
 * Beaucoup de formulaires demandent « l'équipement concerné » en texte libre :
 * on y lit « climatiseur », « robinet », « lampe du couloir ». Signaler cela
 * comme un « code introuvable à l'inventaire » salirait chaque demande d'une
 * ligne fausse. Un numéro d'inventaire porte des chiffres et reste court ;
 * une désignation, non.
 */
export function ressembleAUnCode(valeur: string): boolean {
  const v = valeur.trim();
  return v.length <= 24 && /\d/.test(v) && !/\s{2,}/.test(v) && v.split(/\s+/).length <= 3;
}

const CLES = Object.keys(CORRESPONDANCE_PAR_DEFAUT) as (keyof CorrespondanceChamps)[];

export function chargerCorrespondance(json?: string): CorrespondanceChamps {
  if (!json) return CORRESPONDANCE_PAR_DEFAUT;
  try {
    const perso = JSON.parse(json) as Partial<Record<keyof CorrespondanceChamps, string | string[]>>;
    const sortie = { ...CORRESPONDANCE_PAR_DEFAUT };
    for (const cle of CLES) {
      const valeur = perso[cle];
      if (!valeur) continue;
      // Les noms personnalisés passent devant, les défauts restent en secours.
      const liste = Array.isArray(valeur) ? valeur : [valeur];
      sortie[cle] = [...liste, ...CORRESPONDANCE_PAR_DEFAUT[cle]];
    }
    return sortie;
  } catch {
    return CORRESPONDANCE_PAR_DEFAUT;
  }
}

/* ------------------------------------------------------------------ */
/* Appariement des questions                                           */
/* ------------------------------------------------------------------ */

interface EntreeIndex {
  cle: string;
  /** Découpage en mots : « codeEquipement » → [code, equipement]. */
  mots: string[];
  valeur: string;
  /** Vrai si la clé vient du nom technique et non du libellé affiché. */
  nomTechnique: boolean;
}

export function decouper(cle: string): string[] {
  return normaliser(cle.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function indexer(soumission: SoumissionFormulaire): EntreeIndex[] {
  const entrees: EntreeIndex[] = [];
  soumission.reponses.forEach((r, i) => {
    if (!r.valeur) return;
    const nom = r.nom ?? r.libelle ?? `champ_${i}`;
    entrees.push({ cle: nom, mots: decouper(nom), valeur: r.valeur, nomTechnique: Boolean(r.nom) });
    if (r.libelle && r.libelle !== nom) {
      entrees.push({ cle: r.libelle, mots: decouper(r.libelle), valeur: r.valeur, nomTechnique: false });
    }
  });
  // Les noms techniques passent avant les libellés, quel que soit l'ordre des
  // questions dans le formulaire.
  return entrees.sort((a, b) => Number(b.nomTechnique) - Number(a.nomTechnique));
}

/**
 * Cherche la valeur d'une question parmi une liste de noms acceptés.
 *
 * La recherche est volontairement stricte : égalité sur le nom entier, puis
 * sur un mot du nom. Une correspondance par simple sous-chaîne serait commode
 * mais dangereuse — « Problème constaté » contient « constat », et l'objet de
 * la demande se retrouverait recopié dans sa description.
 *
 * Une réponse déjà attribuée n'est plus proposée : chaque question du
 * formulaire alimente une seule case de la demande.
 */
function trouver(index: EntreeIndex[], noms: string[], consommees: Set<string>): string | undefined {
  const cibles = noms.map((n) => decouper(n).join(''));
  const libre = () => index.filter((e) => !consommees.has(e.cle));

  for (const cible of cibles) {
    for (const entree of libre()) {
      if (entree.mots.join('') === cible) {
        consommees.add(entree.cle);
        return entree.valeur;
      }
    }
  }
  for (const cible of cibles) {
    for (const entree of libre()) {
      if (entree.mots.includes(cible)) {
        consommees.add(entree.cle);
        return entree.valeur;
      }
    }
  }
  return undefined;
}

/** Réponses de la soumission, sous leur libellé, telles quelles. */
export function reponsesLisibles(soumission: SoumissionFormulaire): Record<string, string> {
  const out: Record<string, string> = {};
  soumission.reponses.forEach((r, i) => {
    if (!r.valeur) return;
    out[r.libelle || r.nom || `champ_${i}`] = r.valeur;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Lecture du vocabulaire                                              */
/* ------------------------------------------------------------------ */

/**
 * Traduit l'urgence déclarée en priorité d'intervention.
 *
 * Deux vocabulaires cohabitent : celui des quatre priorités de la GMAO, et
 * celui des échelles à trois niveaux qu'emploient les formulaires en service
 * — « Haute / Moyenne / Basse ». Le second est lu selon la définition que ces
 * formulaires en donnent : « haute » y désigne un risque patient ou l'arrêt
 * d'un service essentiel, soit P1 ; « moyenne » un problème important qui ne
 * bloque pas l'activité, soit P3.
 *
 * Ce qui est renvoyé reste une urgence *déclarée* : le service technique la
 * requalifie. Elle n'est donc jamais relevée d'office, même sur un
 * équipement vital — corriger le demandeur en silence lui apprendrait
 * seulement que ses réponses ne comptent pas.
 */
export function interpreterUrgence(texte: string | undefined, criticiteEquipement?: number): PrioriteOT {
  const t = normaliser(texte ?? '');
  if (!t) {
    // Sans réponse, la criticité de l'équipement tranche : c'est le
    // biomédical qui requalifiera, mais un respirateur ne dort pas en P4.
    return criticiteEquipement === 1 ? 'P2' : 'P3';
  }
  if (/\bp1\b|vital|immediat|tres urgent|arret total|haute|elevee|critique/.test(t)) return 'P1';
  if (/\bp2\b|urgent|bloquant|soin.*retard|degrade/.test(t)) return 'P2';
  if (/\bp4\b|basse|faible|planifi|quand possible|pas urgent|confort|esthetique/.test(t)) return 'P4';
  if (/\bp3\b|moyen|normal|courant/.test(t)) return 'P3';
  return criticiteEquipement === 1 ? 'P2' : 'P3';
}

export function interpreterImpact(
  texte: string | undefined,
  priorite: PrioriteOT,
): DemandeIntervention['impactPatient'] {
  const t = normaliser(texte ?? '');
  if (/vital|deces|danger|grave/.test(t)) return 'risque_vital';
  if (/report|annul|retard.*soin|deprogramm/.test(t)) return 'report_soin';
  if (/gene|inconfort|desagrement/.test(t)) return 'gene';
  if (/aucun|sans impact|rien/.test(t)) return 'aucun';
  return priorite === 'P1' ? 'risque_vital' : priorite === 'P2' ? 'report_soin' : 'gene';
}

/**
 * Objet de la demande à partir de la seule description.
 *
 * Beaucoup de formulaires en service n'ont pas de champ « objet » : ils
 * demandent directement de décrire le problème. Plutôt que d'intituler toutes
 * les demandes « Signalement », la première phrase sert de titre — c'est en
 * général exactement ce que le demandeur aurait écrit dans un champ court.
 */
export function objetDepuisDescription(description: string): string {
  const premiere = description.split(/[\n.;]/)[0].trim();
  const titre = premiere || description.trim();
  return titre.length > 90 ? `${titre.slice(0, 87).trimEnd()}…` : titre;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

export interface ResultatConversion {
  demande?: Omit<DemandeIntervention, 'id' | 'numero'>;
  /** Pourquoi la soumission n'a pas pu être convertie. */
  rejet?: string;
  soumissionId: string;
}

function contient(a: string, b: string): boolean {
  const x = normaliser(a);
  const y = normaliser(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
}

/**
 * Transforme une soumission en demande d'intervention.
 *
 * L'équipement est retrouvé par son numéro d'inventaire, tel qu'il figure sur
 * l'étiquette. S'il est absent ou inconnu, la demande est tout de même créée —
 * rattachée au mieux — plutôt que perdue : un signalement qu'on ne sait pas
 * classer reste un signalement, et l'essentiel de la GMAO est qu'aucun ne se
 * perde entre le service qui constate et l'atelier qui répare.
 */
export function convertirSoumission(
  base: BaseGMAO,
  soumission: SoumissionFormulaire,
  correspondance: CorrespondanceChamps,
  demandeurParDefautId: string,
): ResultatConversion {
  const index = indexer(soumission);
  const pris = new Set<string>();
  const champ = (noms: string[]) => trouver(index, noms, pris);

  const codeEquipement = champ(correspondance.equipement);
  const equipement = codeEquipement
    ? base.equipements.find(
        (e) =>
          normaliser(e.code) === normaliser(codeEquipement.replace(/^GMAO[-:]/i, '')) ||
          normaliser(e.numeroSerie) === normaliser(codeEquipement),
      )
    : undefined;

  const designation = champ(correspondance.designation);
  const secteur = champ(correspondance.secteur);
  const lieu = champ(correspondance.lieu);
  const salle = champ(correspondance.local);
  const description = champ(correspondance.description);
  const anciennete = champ(correspondance.anciennete);
  const objet = champ(correspondance.objet);

  if (!objet && !description) {
    return {
      soumissionId: soumission.id,
      rejet: 'Ni objet ni description : rien à transmettre au service technique.',
    };
  }

  const priorite = interpreterUrgence(champ(correspondance.urgence), equipement?.criticite);
  const impact = interpreterImpact(champ(correspondance.impact), priorite);
  const declarant = champ(correspondance.declarant);
  const nomService = champ(correspondance.service);

  // Le local n'est cherché que si l'équipement ne le donne pas déjà. La salle
  // seule est ambiguë — il y a une « salle de pansement » par service — donc
  // le bâtiment déclaré sert à départager.
  const local = equipement
    ? base.locaux.find((l) => l.id === equipement.localId)
    : salle
      ? base.locaux.find((l) => {
          if (!contient(l.nom, salle) && normaliser(l.code) !== normaliser(salle)) return false;
          if (!lieu) return true;
          const batiment = base.batiments.find((b) => b.id === l.batimentId);
          const site = base.sites.find((s) => s.id === l.siteId);
          return Boolean(
            (batiment && contient(batiment.nom, lieu)) ||
              (batiment && normaliser(batiment.code) === normaliser(lieu)) ||
              (site && contient(site.nom, lieu)) ||
              (site && normaliser(site.code) === normaliser(lieu)),
          );
        })
      : undefined;

  const parNom = (texte: string | undefined) =>
    texte
      ? base.services.find((s) => contient(s.nom, texte) || normaliser(s.code) === normaliser(texte))
      : undefined;

  // Faute de mieux, la demande revient au service du compte porteur — celui
  // du biomédical ou de la technique. La rattacher au premier service de la
  // liste la ferait passer pour un signalement des urgences, et fausserait
  // durablement les statistiques par service.
  const porteur = base.utilisateurs.find((u) => u.id === demandeurParDefautId);
  const service =
    (equipement ? base.services.find((s) => s.id === equipement.serviceId) : undefined) ??
    (local ? base.services.find((s) => s.id === local.serviceId) : undefined) ??
    parNom(nomService) ??
    parNom(lieu) ??
    (porteur?.serviceId ? base.services.find((s) => s.id === porteur.serviceId) : undefined);

  // Le déclarant est identifié s'il figure dans l'annuaire, sinon la demande
  // est portée par le compte de service : son nom reste dans la description.
  const utilisateur = declarant
    ? base.utilisateurs.find(
        (u) =>
          normaliser(`${u.prenom} ${u.nom}`) === normaliser(declarant) ||
          normaliser(u.email) === normaliser(declarant) ||
          (u.telephone ? normaliser(u.telephone) === normaliser(declarant) : false),
      )
    : undefined;

  // Tout ce que la demande ne sait pas ranger dans un champ reste lisible ici
  // plutôt que de disparaître : c'est ce que le technicien lira avant de
  // partir, et ce qui lui évite un aller-retour.
  const contexte = [
    description ?? '',
    anciennete ? `Constaté : ${anciennete}` : '',
    secteur ? `Secteur indiqué : ${secteur}` : '',
    declarant && !utilisateur ? `Déclaré par : ${declarant}` : '',
    !local && (lieu || salle) ? `Localisation indiquée : ${[lieu, salle].filter(Boolean).join(' — ')}` : '',
    designation && !equipement ? `Équipement indiqué : ${designation}` : '',
    codeEquipement && !equipement
      ? ressembleAUnCode(codeEquipement)
        ? `Code saisi, non trouvé à l’inventaire : ${codeEquipement}`
        : `Équipement indiqué : ${codeEquipement}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    soumissionId: soumission.id,
    demande: {
      dateCreation: soumission.date ?? isoHeure(aujourdHui()),
      demandeurId: utilisateur?.id ?? demandeurParDefautId,
      serviceId: service?.id ?? base.services[0].id,
      localId: local?.id,
      equipementId: equipement?.id,
      objet:
        objet ??
        (description
          ? objetDepuisDescription(description)
          : `Signalement — ${equipement?.designation ?? designation ?? 'équipement non identifié'}`),
      description: contexte,
      urgenceDeclaree: priorite,
      impactPatient: impact,
      canal: 'qr_code',
      statut: 'nouvelle',
      // Le corps de métier présélectionne l'équipe à la création de l'ordre
      // de travail ; la désignation libre sert à retrouver la machine dans
      // l'inventaire. Aucun des deux ne décide seul.
      domaineSuggere: deduireDomaine({ secteur, designation, description }),
      designationLibre: designation ?? undefined,
      origineExterne: {
        source: soumission.source,
        formulaireId: soumission.formulaireId,
        soumissionId: soumission.id,
        recuLe: isoHeure(aujourdHui()),
        reponses: reponsesLisibles(soumission),
      },
    },
  };
}

/** Ajoute la demande à la base si la soumission n'a pas déjà été traitée. */
export function integrerDemande(base: BaseGMAO, conversion: ResultatConversion): DemandeIntervention | null {
  if (!conversion.demande) return null;
  const source = conversion.demande.origineExterne?.source;
  const dejaVue = base.demandes.some(
    (d) => d.origineExterne?.source === source && d.origineExterne?.soumissionId === conversion.soumissionId,
  );
  if (dejaVue) return null;

  const demande: DemandeIntervention = {
    ...conversion.demande,
    id: uid('dmi'),
    numero: numeroSuivant('DI', aujourdHui().getFullYear(), base.demandes.map((d) => d.numero)),
  };
  base.demandes.unshift(demande);
  return demande;
}
