import type { BaseGMAO, DemandeIntervention, ID, ISODate, PrioriteOT } from './domaine';
import { aujourdHui, iso, isoHeure, toDate } from './dates';
import { numeroSuivant, uid } from './id';

/**
 * Rondes d'inspection quotidiennes.
 *
 * Deux fois par jour, un agent fait le tour des installations qui ne peuvent
 * pas s'arrêter : production d'oxygène, eau, énergie, air médical, froid,
 * climatisation. Ce n'est pas de la maintenance préventive — rien n'est
 * démonté — mais un relevé d'état qui sert à trois choses : détecter une
 * dérive avant la panne, alimenter les compteurs d'usage, et prouver que la
 * garde a bien été assurée.
 *
 * La ronde du matin prend le service à 7 h, celle du soir à 17 h : c'est la
 * relève de garde, et un créneau manqué doit se voir.
 */

export type Shift = 'matin' | 'soir';

export const HORAIRES_SHIFT: Record<Shift, { heure: number; libelle: string; description: string }> = {
  matin: { heure: 7, libelle: 'Ronde du matin', description: 'Prise de service — 07:00' },
  soir: { heure: 17, libelle: 'Ronde du soir', description: 'Relève de garde — 17:00' },
};

/** Tolérance avant qu'une ronde non faite soit comptée comme manquée. */
export const TOLERANCE_RETARD_H = 4;

export type TypePointControle = 'mesure' | 'compteur' | 'etat' | 'booleen' | 'texte';

export interface PointControle {
  id: ID;
  ordre: number;
  libelle: string;
  type: TypePointControle;
  unite?: string;
  /** Plage acceptable pour les points de type mesure. */
  valeurMin?: number;
  valeurMax?: number;
  /** Choix proposés pour un point de type état, le premier étant le cas normal. */
  options?: string[];
  optionsConformes?: string[];
  /** Pour un point booléen : la réponse attendue. */
  reponseAttendue?: boolean;
  obligatoire: boolean;
  /** Un écart impose d'ouvrir une demande d'intervention séance tenante. */
  bloquant: boolean;
  consigne?: string;
  /** Le relevé met à jour le compteur d'usage de l'équipement. */
  alimenteCompteur?: 'heures' | 'cycles' | 'actes' | 'kilometres' | 'impressions';
}

export interface ModeleInspection {
  id: ID;
  code: string;
  libelle: string;
  /** Périmètre : désignations d'équipements du catalogue. */
  designations: string[];
  shifts: Shift[];
  equipeId?: ID;
  dureeEstimeeMin: number;
  consignesSecurite?: string;
  points: PointControle[];
  actif: boolean;
}

export interface ValeurReleve {
  pointId: ID;
  valeurNum?: number;
  valeurTexte?: string;
  valeurBool?: boolean;
  conforme: boolean;
  commentaire?: string;
}

export type EtatReleve =
  | 'conforme'
  | 'anomalie_mineure'
  | 'anomalie_majeure'
  | 'hors_service'
  | 'non_accessible';

export interface ReleveInspection {
  id: ID;
  rondeId: ID;
  equipementId: ID;
  modeleId: ID;
  heure: ISODate;
  agentId: ID;
  valeurs: ValeurReleve[];
  etat: EtatReleve;
  observation?: string;
  demandeId?: ID;
}

export type StatutRonde = 'planifiee' | 'en_cours' | 'terminee' | 'incomplete' | 'manquee';

export interface RondeInspection {
  id: ID;
  numero: string;
  date: ISODate;
  shift: Shift;
  siteId: ID;
  agentId?: ID;
  statut: StatutRonde;
  heureDebut?: ISODate;
  heureFin?: ISODate;
  /** Équipements attendus, figés à l'ouverture : le périmètre ne doit pas
   *  bouger sous les pieds de l'agent si le parc évolue en cours de ronde. */
  equipementsAttendus: ID[];
  observations?: string;
  signature?: string;
  /** Visa du responsable technique à la relève. */
  viseParId?: ID;
  dateVisa?: ISODate;
}

/* ------------------------------------------------------------------ */
/* Référentiel des points de contrôle                                  */
/* ------------------------------------------------------------------ */

const p = (
  ordre: number,
  libelle: string,
  type: TypePointControle,
  extra: Partial<PointControle> = {},
): Omit<PointControle, 'id'> => ({
  ordre,
  libelle,
  type,
  obligatoire: true,
  bloquant: false,
  ...extra,
});

export const CATALOGUE_INSPECTIONS: {
  code: string;
  libelle: string;
  designations: string[];
  shifts: Shift[];
  duree: number;
  consignes?: string;
  points: Omit<PointControle, 'id'>[];
}[] = [
  {
    code: 'INS-O2',
    libelle: 'Centrale de production d’oxygène',
    designations: ['Centrale de production d’oxygène PSA'],
    shifts: ['matin', 'soir'],
    duree: 20,
    consignes:
      'Interdiction absolue de tout corps gras au contact de l’oxygène. Ne jamais isoler le réseau sans avoir basculé sur la rampe de secours et prévenu la réanimation et le bloc.',
    points: [
      p(1, 'Titre en oxygène produit', 'mesure', { unite: '%', valeurMin: 93, valeurMax: 96, bloquant: true, consigne: 'Sous 93 %, basculer sur la rampe de bouteilles et alerter immédiatement.' }),
      p(2, 'Pression de service du réseau', 'mesure', { unite: 'bar', valeurMin: 4, valeurMax: 5, bloquant: true }),
      p(3, 'Point de rosée sous pression', 'mesure', { unite: '°C', valeurMin: -70, valeurMax: -40 }),
      p(4, 'Compteur horaire du compresseur', 'compteur', { unite: 'h', alimenteCompteur: 'heures' }),
      p(5, 'Purge des condensats effectuée', 'booleen', { reponseAttendue: true }),
      p(6, 'Niveau et aspect de l’huile du compresseur', 'etat', {
        options: ['Correct', 'À compléter', 'Aspect anormal'],
        optionsConformes: ['Correct'],
      }),
      p(7, 'Température du local technique', 'mesure', { unite: '°C', valeurMin: 15, valeurMax: 35 }),
      p(8, 'Pression de la rampe de secours', 'mesure', { unite: 'bar', valeurMin: 100, bloquant: true, consigne: 'La réserve doit couvrir au moins 24 h de consommation.' }),
      p(9, 'Bouteilles pleines en réserve', 'mesure', { unite: 'bouteilles', valeurMin: 6 }),
      p(10, 'Voyants d’alarme de la centrale', 'etat', {
        options: ['Aucun', 'Dérangement', 'Alarme'],
        optionsConformes: ['Aucun'],
        bloquant: true,
      }),
      p(11, 'Bruit ou vibration anormale', 'booleen', { reponseAttendue: false, bloquant: true }),
      p(12, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-EAU',
    libelle: 'Production et distribution d’eau',
    designations: [
      'Surpresseur d’eau sanitaire',
      'Ballon d’eau chaude sanitaire 2 000 L',
      'Station de traitement d’eau par osmose inverse',
    ],
    shifts: ['matin', 'soir'],
    duree: 20,
    consignes:
      'Relevé de la température d’eau chaude au départ : sous 55 °C, le risque légionelles impose un signalement à l’équipe opérationnelle d’hygiène le jour même.',
    points: [
      p(1, 'Niveau de la bâche d’eau', 'mesure', { unite: '%', valeurMin: 30, bloquant: true }),
      p(2, 'Pression au refoulement du surpresseur', 'mesure', { unite: 'bar', valeurMin: 2.5, valeurMax: 4.5 }),
      p(3, 'Conductivité de l’eau traitée', 'mesure', { unite: 'µS/cm', valeurMax: 20 }),
      p(4, 'Chlore résiduel libre', 'mesure', { unite: 'mg/L', valeurMin: 0.2, valeurMax: 0.5 }),
      p(5, 'Température de l’eau chaude au départ', 'mesure', { unite: '°C', valeurMin: 55, bloquant: true, consigne: 'Seuil de prévention des légionelles.' }),
      p(6, 'Aspect de l’eau (limpidité, odeur)', 'etat', {
        options: ['Normal', 'Trouble', 'Coloré ou odeur'],
        optionsConformes: ['Normal'],
      }),
      p(7, 'Compteur volumétrique général', 'compteur', { unite: 'm³' }),
      p(8, 'Fonctionnement des pompes (P1 / P2)', 'etat', {
        options: ['Les deux en service', 'Une seule en service', 'Aucune en service'],
        optionsConformes: ['Les deux en service', 'Une seule en service'],
      }),
      p(9, 'Fuite visible sur le réseau', 'booleen', { reponseAttendue: false, bloquant: true }),
      p(10, 'Niveau des consommables de traitement (sel, réactifs)', 'etat', {
        options: ['Suffisant', 'À réapprovisionner', 'Épuisé'],
        optionsConformes: ['Suffisant'],
      }),
      p(11, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-GE',
    libelle: 'Groupe électrogène de secours',
    designations: ['Groupe électrogène 500 kVA'],
    shifts: ['matin', 'soir'],
    duree: 25,
    consignes:
      'Le commutateur doit rester en position automatique en fin de ronde, sans exception. L’essai de démarrage du soir se fait à vide, hors basculement du réseau.',
    points: [
      p(1, 'Commutateur en position automatique', 'booleen', { reponseAttendue: true, bloquant: true, consigne: 'Sans quoi le groupe ne démarrera pas sur coupure.' }),
      p(2, 'Niveau de gasoil dans la nourrice', 'mesure', { unite: '%', valeurMin: 40, bloquant: true, consigne: 'Sous 40 %, déclencher la commande de carburant le jour même.' }),
      p(3, 'Niveau d’huile moteur', 'etat', {
        options: ['Entre mini et maxi', 'Proche du mini', 'Sous le mini'],
        optionsConformes: ['Entre mini et maxi'],
        bloquant: true,
      }),
      p(4, 'Niveau du liquide de refroidissement', 'etat', {
        options: ['Correct', 'À compléter', 'Insuffisant'],
        optionsConformes: ['Correct'],
      }),
      p(5, 'Tension de la batterie de démarrage', 'mesure', { unite: 'V', valeurMin: 12.4, valeurMax: 13.8, bloquant: true }),
      p(6, 'Chargeur de batterie en service', 'booleen', { reponseAttendue: true }),
      p(7, 'Compteur horaire', 'compteur', { unite: 'h', alimenteCompteur: 'heures' }),
      p(8, 'Nombre de démarrages depuis la dernière ronde', 'mesure', { unite: 'démarrages' }),
      p(9, 'Charge délivrée si le groupe tourne', 'mesure', { unite: 'kVA', valeurMax: 500, obligatoire: false, consigne: 'Au-delà de 80 % de la puissance nominale, alerter : le délestage n’est plus assuré.' }),
      p(10, 'Voyants de défaut sur le coffret', 'etat', {
        options: ['Aucun', 'Préalarme', 'Défaut'],
        optionsConformes: ['Aucun'],
        bloquant: true,
      }),
      p(11, 'Fuite sous le groupe (huile, gasoil, eau)', 'booleen', { reponseAttendue: false, bloquant: true }),
      p(12, 'Température du local et ventilation dégagée', 'mesure', { unite: '°C', valeurMax: 40 }),
      p(13, 'Essai de démarrage à vide (ronde du soir)', 'booleen', { reponseAttendue: true, obligatoire: false }),
      p(14, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-CLIM',
    libelle: 'Climatisation et traitement d’air',
    designations: ['Centrale de traitement d’air bloc opératoire', 'Groupe froid à eau glacée'],
    shifts: ['matin', 'soir'],
    duree: 20,
    consignes:
      'La surpression du bloc opératoire conditionne la maîtrise du risque infectieux : toute valeur sous 10 Pa doit être signalée au cadre de bloc avant la première intervention.',
    points: [
      p(1, 'Fonctionnement du groupe froid', 'etat', {
        options: ['Normal', 'Cycle court', 'À l’arrêt'],
        optionsConformes: ['Normal'],
      }),
      p(2, 'Température de soufflage', 'mesure', { unite: '°C', valeurMin: 12, valeurMax: 18 }),
      p(3, 'Température de reprise', 'mesure', { unite: '°C', valeurMin: 20, valeurMax: 26 }),
      p(4, 'Surpression de la salle propre', 'mesure', { unite: 'Pa', valeurMin: 10, bloquant: true }),
      p(5, 'Hygrométrie', 'mesure', { unite: '%HR', valeurMin: 40, valeurMax: 60 }),
      p(6, 'Encrassement des filtres (perte de charge)', 'mesure', { unite: 'Pa', valeurMax: 450 }),
      p(7, 'Évacuation des condensats', 'etat', {
        options: ['Correcte', 'Ralentie', 'Bouchée'],
        optionsConformes: ['Correcte'],
      }),
      p(8, 'Givrage de l’évaporateur', 'booleen', { reponseAttendue: false }),
      p(9, 'Bruit ou vibration anormale', 'booleen', { reponseAttendue: false }),
      p(10, 'Compteur horaire de la centrale', 'compteur', { unite: 'h', alimenteCompteur: 'heures' }),
      p(11, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-ELEC',
    libelle: 'Énergie, TGBT et onduleurs',
    designations: ['Onduleur ASI 60 kVA', 'Tableau général basse tension'],
    shifts: ['matin', 'soir'],
    duree: 15,
    consignes:
      'Aucune manœuvre sous tension pendant la ronde : le relevé se fait en lecture d’afficheur, capots fermés. Toute intervention exige la consignation et l’habilitation correspondante.',
    points: [
      p(1, 'Tension du réseau à l’arrivée', 'mesure', { unite: 'V', valeurMin: 370, valeurMax: 420 }),
      p(2, 'Taux de charge de l’onduleur', 'mesure', { unite: '%', valeurMax: 80, consigne: 'Au-delà de 80 %, l’autonomie annoncée n’est plus garantie.' }),
      p(3, 'Autonomie batterie affichée', 'mesure', { unite: 'min', valeurMin: 15, bloquant: true }),
      p(4, 'Alarmes sur l’onduleur', 'etat', {
        options: ['Aucune', 'Batterie à contrôler', 'Défaut onduleur'],
        optionsConformes: ['Aucune'],
        bloquant: true,
      }),
      p(5, 'Température du local technique', 'mesure', { unite: '°C', valeurMax: 35, consigne: 'La durée de vie des batteries se joue sur ce point.' }),
      p(6, 'Voyants des départs du TGBT', 'etat', {
        options: ['Tous normaux', 'Un départ en défaut', 'Plusieurs défauts'],
        optionsConformes: ['Tous normaux'],
      }),
      p(7, 'Éclairage de sécurité en veille', 'booleen', { reponseAttendue: true }),
      p(8, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-FLU',
    libelle: 'Air médical et vide',
    designations: ['Compresseur d’air médical', 'Centrale de vide médical'],
    shifts: ['matin', 'soir'],
    duree: 15,
    points: [
      p(1, 'Pression de l’air médical distribué', 'mesure', { unite: 'bar', valeurMin: 4, valeurMax: 5.5, bloquant: true }),
      p(2, 'Dépression du réseau de vide', 'mesure', { unite: 'bar', valeurMin: 0.4, valeurMax: 0.9, bloquant: true }),
      p(3, 'Purge du sécheur effectuée', 'booleen', { reponseAttendue: true }),
      p(4, 'Compteur horaire du compresseur', 'compteur', { unite: 'h', alimenteCompteur: 'heures' }),
      p(5, 'Température de refoulement', 'mesure', { unite: '°C', valeurMax: 85 }),
      p(6, 'Alarmes du tableau de report', 'etat', {
        options: ['Aucune', 'Dérangement', 'Alarme'],
        optionsConformes: ['Aucune'],
        bloquant: true,
      }),
      p(7, 'Fuite audible sur le réseau', 'booleen', { reponseAttendue: false }),
      p(8, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
  {
    code: 'INS-FROID',
    libelle: 'Froid médical critique',
    designations: ['Congélateur -80 °C', 'Réfrigérateur à poches de sang', 'Agitateur de plaquettes'],
    shifts: ['matin', 'soir'],
    duree: 10,
    consignes:
      'Un dépassement de température sur une enceinte de conservation du sang engage la sécurité transfusionnelle : prévenir la banque de sang avant toute autre action.',
    points: [
      p(1, 'Température affichée', 'mesure', { unite: '°C', bloquant: true, consigne: 'Comparer à la consigne propre à l’enceinte.' }),
      p(2, 'Température du thermomètre de contrôle', 'mesure', { unite: '°C' }),
      p(3, 'Alarme sonore et visuelle opérationnelle', 'booleen', { reponseAttendue: true }),
      p(4, 'Raccordement sur circuit secouru', 'booleen', { reponseAttendue: true, bloquant: true }),
      p(5, 'État de la porte et des joints', 'etat', {
        options: ['Correct', 'Joint à remplacer', 'Fermeture défectueuse'],
        optionsConformes: ['Correct'],
      }),
      p(6, 'Givre excessif', 'booleen', { reponseAttendue: false }),
      p(7, 'Observations', 'texte', { obligatoire: false }),
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Périmètre et conformité                                             */
/* ------------------------------------------------------------------ */

export function modelesDuShift(base: BaseGMAO, shift: Shift): ModeleInspection[] {
  return base.modelesInspection.filter((m) => m.actif && m.shifts.includes(shift));
}

export function equipementsDuModele(base: BaseGMAO, modeleId: ID): ID[] {
  const m = base.modelesInspection.find((x) => x.id === modeleId);
  if (!m) return [];
  return base.equipements
    .filter((e) => e.statut !== 'reforme' && m.designations.includes(e.designation))
    .map((e) => e.id);
}

/** Modèle applicable à un équipement pour un shift donné. */
export function modelePourEquipement(base: BaseGMAO, equipementId: ID, shift: Shift): ModeleInspection | undefined {
  const eq = base.equipements.find((e) => e.id === equipementId);
  if (!eq) return undefined;
  return modelesDuShift(base, shift).find((m) => m.designations.includes(eq.designation));
}

/** Tous les équipements attendus sur une ronde, tous modèles confondus. */
export function perimetreRonde(base: BaseGMAO, shift: Shift, siteId?: ID): ID[] {
  const vus = new Set<ID>();
  for (const m of modelesDuShift(base, shift)) {
    for (const id of equipementsDuModele(base, m.id)) {
      const eq = base.equipements.find((e) => e.id === id);
      if (siteId && eq?.siteId !== siteId) continue;
      vus.add(id);
    }
  }
  return [...vus];
}

/** Vérifie une valeur saisie contre les bornes du point de contrôle. */
export function valeurConforme(point: PointControle, valeur: ValeurReleve): boolean {
  switch (point.type) {
    case 'mesure':
      if (valeur.valeurNum === undefined) return !point.obligatoire;
      if (point.valeurMin !== undefined && valeur.valeurNum < point.valeurMin) return false;
      if (point.valeurMax !== undefined && valeur.valeurNum > point.valeurMax) return false;
      return true;
    case 'compteur':
      return valeur.valeurNum !== undefined || !point.obligatoire;
    case 'etat':
      if (!valeur.valeurTexte) return !point.obligatoire;
      return point.optionsConformes ? point.optionsConformes.includes(valeur.valeurTexte) : true;
    case 'booleen':
      if (valeur.valeurBool === undefined) return !point.obligatoire;
      return point.reponseAttendue === undefined || valeur.valeurBool === point.reponseAttendue;
    case 'texte':
      return true;
  }
}

/** Écarts constatés sur un relevé, avec la gravité qui en découle. */
export function ecartsDuReleve(
  base: BaseGMAO,
  releve: ReleveInspection,
): { point: PointControle; valeur: ValeurReleve; bloquant: boolean }[] {
  const modele = base.modelesInspection.find((m) => m.id === releve.modeleId);
  if (!modele) return [];
  const out: { point: PointControle; valeur: ValeurReleve; bloquant: boolean }[] = [];
  for (const v of releve.valeurs) {
    const point = modele.points.find((x) => x.id === v.pointId);
    if (!point || v.conforme) continue;
    out.push({ point, valeur: v, bloquant: point.bloquant });
  }
  return out;
}

export function etatDepuisEcarts(ecarts: { bloquant: boolean }[]): EtatReleve {
  if (!ecarts.length) return 'conforme';
  return ecarts.some((e) => e.bloquant) ? 'anomalie_majeure' : 'anomalie_mineure';
}

/* ------------------------------------------------------------------ */
/* Avancement et indicateurs                                           */
/* ------------------------------------------------------------------ */

export interface AvancementRonde {
  attendus: number;
  releves: number;
  conformes: number;
  anomaliesMineures: number;
  anomaliesMajeures: number;
  horsService: number;
  nonAccessibles: number;
  restants: ID[];
  taux: number;
}

export function avancementRonde(base: BaseGMAO, rondeId: ID): AvancementRonde {
  const ronde = base.rondes.find((r) => r.id === rondeId);
  const releves = base.relevesInspection.filter((r) => r.rondeId === rondeId);
  const attendus = ronde?.equipementsAttendus ?? [];
  const faits = new Set(releves.map((r) => r.equipementId));
  return {
    attendus: attendus.length,
    releves: releves.length,
    conformes: releves.filter((r) => r.etat === 'conforme').length,
    anomaliesMineures: releves.filter((r) => r.etat === 'anomalie_mineure').length,
    anomaliesMajeures: releves.filter((r) => r.etat === 'anomalie_majeure').length,
    horsService: releves.filter((r) => r.etat === 'hors_service').length,
    nonAccessibles: releves.filter((r) => r.etat === 'non_accessible').length,
    restants: attendus.filter((id) => !faits.has(id)),
    taux: attendus.length ? (releves.length / attendus.length) * 100 : 0,
  };
}

/** Heure théorique de passage d'une ronde. */
export function heureTheorique(date: ISODate, shift: Shift): Date {
  const d = toDate(date) ?? aujourdHui();
  const h = new Date(d);
  h.setHours(HORAIRES_SHIFT[shift].heure, 0, 0, 0);
  return h;
}

/**
 * Une ronde est manquée si son créneau est dépassé de plus de quatre heures
 * sans qu'aucun relevé n'ait été saisi. C'est le contrôle que fait le
 * responsable technique à la relève.
 */
export function statutEffectif(base: BaseGMAO, ronde: RondeInspection): StatutRonde {
  if (ronde.statut === 'terminee' || ronde.statut === 'incomplete') return ronde.statut;
  const limite = heureTheorique(ronde.date, ronde.shift).getTime() + TOLERANCE_RETARD_H * 3_600_000;
  const nbReleves = base.relevesInspection.filter((r) => r.rondeId === ronde.id).length;
  if (aujourdHui().getTime() > limite && nbReleves === 0) return 'manquee';
  return nbReleves > 0 ? 'en_cours' : ronde.statut;
}

export interface IndicateursRondes {
  attendues: number;
  realisees: number;
  manquees: number;
  incompletes: number;
  taux: number;
  anomalies: number;
  anomaliesMajeures: number;
  /** Points de contrôle saisis sur la période. */
  pointsReleves: number;
}

export function indicateursRondes(base: BaseGMAO, jours = 30): IndicateursRondes {
  const debut = iso(new Date(aujourdHui().getTime() - jours * 86_400_000));
  const rondes = base.rondes.filter((r) => r.date >= debut);
  const releves = base.relevesInspection.filter((r) => rondes.some((x) => x.id === r.rondeId));
  const statuts = rondes.map((r) => statutEffectif(base, r));
  return {
    attendues: rondes.length,
    realisees: statuts.filter((s) => s === 'terminee').length,
    manquees: statuts.filter((s) => s === 'manquee').length,
    incompletes: statuts.filter((s) => s === 'incomplete').length,
    taux: rondes.length ? (statuts.filter((s) => s === 'terminee').length / rondes.length) * 100 : 0,
    anomalies: releves.filter((r) => r.etat !== 'conforme').length,
    anomaliesMajeures: releves.filter((r) => r.etat === 'anomalie_majeure' || r.etat === 'hors_service').length,
    pointsReleves: releves.reduce((s, r) => s + r.valeurs.length, 0),
  };
}

/** Historique d'un point de contrôle sur un équipement, pour tracer une courbe. */
export function historiquePoint(
  base: BaseGMAO,
  equipementId: ID,
  pointId: ID,
  jours = 30,
): { date: ISODate; shift: Shift; valeur: number; conforme: boolean }[] {
  const debut = iso(new Date(aujourdHui().getTime() - jours * 86_400_000));
  const out: { date: ISODate; shift: Shift; valeur: number; conforme: boolean }[] = [];
  for (const releve of base.relevesInspection) {
    if (releve.equipementId !== equipementId) continue;
    const ronde = base.rondes.find((r) => r.id === releve.rondeId);
    if (!ronde || ronde.date < debut) continue;
    const v = releve.valeurs.find((x) => x.pointId === pointId);
    if (!v || v.valeurNum === undefined) continue;
    out.push({ date: ronde.date, shift: ronde.shift, valeur: v.valeurNum, conforme: v.conforme });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.shift === 'matin' ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Opérations                                                          */
/* ------------------------------------------------------------------ */

/** Ouvre les rondes manquantes pour une date donnée, sur chaque site actif. */
export function genererRondes(base: BaseGMAO, date: ISODate): RondeInspection[] {
  const crees: RondeInspection[] = [];
  const annee = (toDate(date) ?? aujourdHui()).getFullYear();
  for (const site of base.sites.filter((s) => s.actif)) {
    for (const shift of ['matin', 'soir'] as Shift[]) {
      const existante = base.rondes.some((r) => r.date === date && r.shift === shift && r.siteId === site.id);
      if (existante) continue;
      const perimetre = perimetreRonde(base, shift, site.id);
      if (!perimetre.length) continue;
      const ronde: RondeInspection = {
        id: uid('rnd'),
        numero: numeroSuivant('RI', annee, base.rondes.map((r) => r.numero)),
        date,
        shift,
        siteId: site.id,
        statut: 'planifiee',
        equipementsAttendus: perimetre,
      };
      base.rondes.push(ronde);
      crees.push(ronde);
    }
  }
  return crees;
}

export function demarrerRonde(base: BaseGMAO, rondeId: ID, agentId: ID): void {
  const r = base.rondes.find((x) => x.id === rondeId);
  if (!r || r.statut === 'terminee') return;
  r.agentId = agentId;
  r.statut = 'en_cours';
  r.heureDebut = r.heureDebut ?? isoHeure(aujourdHui());
}

export interface SaisieReleve {
  equipementId: ID;
  valeurs: ValeurReleve[];
  observation?: string;
  /** Forcé par l'agent quand l'équipement est arrêté ou inaccessible. */
  etatForce?: EtatReleve;
}

/**
 * Enregistre un relevé et en tire les conséquences : mise à jour du compteur
 * d'usage, et ouverture d'une demande d'intervention si un point bloquant est
 * hors tolérance. C'est ce dernier point qui fait la valeur de la ronde :
 * l'anomalie constatée à 7 h du matin devient un bon d'intervention avant que
 * l'agent ait fini son tour.
 */
export function enregistrerReleve(
  base: BaseGMAO,
  rondeId: ID,
  saisie: SaisieReleve,
  agentId: ID,
): { releve: ReleveInspection; demande?: DemandeIntervention } {
  const ronde = base.rondes.find((r) => r.id === rondeId);
  if (!ronde) throw new Error('Ronde introuvable');
  const equipement = base.equipements.find((e) => e.id === saisie.equipementId);
  if (!equipement) throw new Error('Équipement introuvable');

  const modele = modelePourEquipement(base, saisie.equipementId, ronde.shift);
  if (!modele) throw new Error('Aucun modèle d’inspection ne couvre cet équipement pour ce créneau');

  // Chaque valeur est recontrôlée côté application : la conformité ne dépend
  // pas de ce que le formulaire a bien voulu envoyer.
  const valeurs = saisie.valeurs.map((v) => {
    const point = modele.points.find((x) => x.id === v.pointId);
    return { ...v, conforme: point ? valeurConforme(point, v) : true };
  });

  const releve: ReleveInspection = {
    id: uid('rli'),
    rondeId,
    equipementId: saisie.equipementId,
    modeleId: modele.id,
    heure: isoHeure(aujourdHui()),
    agentId,
    valeurs,
    etat: 'conforme',
    observation: saisie.observation,
  };

  const ecarts = ecartsDuReleve({ ...base, relevesInspection: [...base.relevesInspection, releve] }, releve);
  releve.etat = saisie.etatForce ?? etatDepuisEcarts(ecarts);

  // Les compteurs d'usage relevés en ronde alimentent la maintenance sur
  // compteur : c'est la source la plus fiable dont on dispose au quotidien.
  for (const v of valeurs) {
    const point = modele.points.find((x) => x.id === v.pointId);
    if (!point?.alimenteCompteur || v.valeurNum === undefined) continue;
    const compteur = equipement.compteurs.find((c) => c.type === point.alimenteCompteur);
    if (compteur && v.valeurNum >= compteur.valeur) {
      compteur.valeur = v.valeurNum;
      compteur.dateReleve = iso(aujourdHui());
    }
  }

  // Un précédent relevé du même équipement sur la même ronde est remplacé :
  // l'agent peut corriger une saisie sans créer de doublon.
  base.relevesInspection = base.relevesInspection.filter(
    (r) => !(r.rondeId === rondeId && r.equipementId === saisie.equipementId),
  );
  base.relevesInspection.unshift(releve);

  if (ronde.statut === 'planifiee') {
    ronde.statut = 'en_cours';
    ronde.agentId = ronde.agentId ?? agentId;
    ronde.heureDebut = ronde.heureDebut ?? isoHeure(aujourdHui());
  }

  let demande: DemandeIntervention | undefined;
  const bloquants = ecarts.filter((e) => e.bloquant);
  if (bloquants.length || releve.etat === 'hors_service') {
    const priorite: PrioriteOT = equipement.criticite === 1 ? 'P1' : 'P2';
    demande = {
      id: uid('dmi'),
      numero: numeroSuivant('DI', aujourdHui().getFullYear(), base.demandes.map((d) => d.numero)),
      dateCreation: isoHeure(aujourdHui()),
      demandeurId: agentId,
      serviceId: equipement.serviceId,
      localId: equipement.localId,
      equipementId: equipement.id,
      objet: `${HORAIRES_SHIFT[ronde.shift].libelle} — anomalie sur ${equipement.designation}`,
      description: [
        `Ronde ${ronde.numero} du ${ronde.date} (${HORAIRES_SHIFT[ronde.shift].description}).`,
        ...bloquants.map(
          (e) =>
            `• ${e.point.libelle} : ${
              e.valeur.valeurNum !== undefined
                ? `${e.valeur.valeurNum} ${e.point.unite ?? ''}`
                : (e.valeur.valeurTexte ?? (e.valeur.valeurBool ? 'oui' : 'non'))
            } — attendu ${decrireAttendu(e.point)}.`,
        ),
        saisie.observation ? `Observation de l’agent : ${saisie.observation}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      urgenceDeclaree: priorite,
      impactPatient: equipement.criticite === 1 ? 'risque_vital' : 'report_soin',
      canal: 'terrain',
      statut: 'nouvelle',
    };
    base.demandes.unshift(demande);
    releve.demandeId = demande.id;
  }

  return { releve, demande };
}

export function decrireAttendu(point: PointControle): string {
  if (point.type === 'mesure' || point.type === 'compteur') {
    if (point.valeurMin !== undefined && point.valeurMax !== undefined)
      return `entre ${point.valeurMin} et ${point.valeurMax} ${point.unite ?? ''}`.trim();
    if (point.valeurMin !== undefined) return `au moins ${point.valeurMin} ${point.unite ?? ''}`.trim();
    if (point.valeurMax !== undefined) return `au plus ${point.valeurMax} ${point.unite ?? ''}`.trim();
    return 'un relevé';
  }
  if (point.type === 'etat') return (point.optionsConformes ?? []).join(' ou ') || 'un état normal';
  if (point.type === 'booleen') return point.reponseAttendue ? 'oui' : 'non';
  return '—';
}

export function cloturerRonde(base: BaseGMAO, rondeId: ID, signature: string, observations?: string): void {
  const r = base.rondes.find((x) => x.id === rondeId);
  if (!r) return;
  const av = avancementRonde(base, rondeId);
  r.statut = av.restants.length === 0 ? 'terminee' : 'incomplete';
  r.heureFin = isoHeure(aujourdHui());
  r.signature = signature;
  if (observations) r.observations = observations;
}

export function viserRonde(base: BaseGMAO, rondeId: ID, responsableId: ID): void {
  const r = base.rondes.find((x) => x.id === rondeId);
  if (!r) return;
  r.viseParId = responsableId;
  r.dateVisa = isoHeure(aujourdHui());
}
