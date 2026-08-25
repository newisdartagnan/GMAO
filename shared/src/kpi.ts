import type {
  BaseGMAO,
  Equipement,
  ID,
  OrdreTravail,
  StatutOT,
} from './domaine';
import { STATUTS_OT_OUVERTS } from './libelles';
import { aujourdHui, heuresEcoulees, joursRestants, minutesEcoulees, toDate } from './dates';
import { prochaineEcheanceGamme, prochaineEcheanceControle } from './echeances';

/* ------------------------------------------------------------------ */
/* Coûts                                                               */
/* ------------------------------------------------------------------ */

export function coutMainOeuvre(ot: OrdreTravail): number {
  return ot.temps.reduce((s, t) => s + (t.dureeMin / 60) * t.tauxHoraire, 0);
}

export function coutPieces(ot: OrdreTravail): number {
  return ot.pieces.reduce((s, p) => s + p.quantite * p.prixUnitaire, 0);
}

export function coutTotal(ot: OrdreTravail): number {
  return coutMainOeuvre(ot) + coutPieces(ot) + (ot.coutPrestataire || 0);
}

export function tempsPasseMin(ot: OrdreTravail): number {
  return ot.temps.reduce((s, t) => s + t.dureeMin, 0);
}

/* ------------------------------------------------------------------ */
/* États d'un OT                                                       */
/* ------------------------------------------------------------------ */

export function estOuvert(ot: OrdreTravail): boolean {
  return STATUTS_OT_OUVERTS.includes(ot.statut);
}

export function estTermine(ot: OrdreTravail): boolean {
  return ot.statut === 'realise' || ot.statut === 'cloture';
}

/** OT ouvert dont l'échéance SLA est dépassée. */
export function estEnRetard(ot: OrdreTravail): boolean {
  if (!estOuvert(ot)) return false;
  const cible = ot.dateEcheanceSLA ?? ot.datePlanifiee;
  const j = joursRestants(cible);
  return j !== null && j < 0;
}

/** Heures restantes avant dépassement du délai contractuel. */
export function margeSLAHeures(ot: OrdreTravail): number | null {
  if (!ot.dateEcheanceSLA) return null;
  const d = toDate(ot.dateEcheanceSLA);
  if (!d) return null;
  return -(heuresEcoulees(d) ?? 0);
}

/* ------------------------------------------------------------------ */
/* Indicateurs de fiabilité                                            */
/* ------------------------------------------------------------------ */

export interface IndicateursFiabilite {
  /** Nombre de défaillances retenues sur la période. */
  defaillances: number;
  /** Temps moyen de bon fonctionnement entre deux pannes, en heures. */
  mtbf: number | null;
  /** Temps moyen de réparation (du signalement à la remise en service). */
  mttr: number | null;
  /** Temps moyen avant prise en charge par un technicien. */
  mtta: number | null;
  /** Disponibilité opérationnelle sur la période, en %. */
  disponibilite: number | null;
  /** Heures d'indisponibilité cumulées. */
  heuresArret: number;
}

const HEURES_PAR_JOUR = 24;

/**
 * Calcule MTBF / MTTR / disponibilité pour un ensemble d'équipements sur une
 * fenêtre glissante. La convention retenue :
 *
 * - le temps d'ouverture est le nombre d'équipements × la durée de la fenêtre ;
 * - le temps d'arrêt cumulé provient du champ `arretEquipementMin` des OT
 *   correctifs terminés (c'est l'indisponibilité réellement subie) ;
 * - MTBF = temps de bon fonctionnement / nombre de défaillances.
 */
export function fiabilite(
  equipements: Equipement[],
  ots: OrdreTravail[],
  jours = 365,
): IndicateursFiabilite {
  const debut = new Date(aujourdHui().getTime() - jours * 86_400_000);
  const idsEq = new Set(equipements.map((e) => e.id));

  const correctifs = ots.filter(
    (o) =>
      o.type === 'correctif' &&
      o.equipementId &&
      idsEq.has(o.equipementId) &&
      estTermine(o) &&
      (toDate(o.dateFin ?? o.dateCloture)?.getTime() ?? 0) >= debut.getTime(),
  );

  const heuresArret = correctifs.reduce((s, o) => s + (o.arretEquipementMin || 0) / 60, 0);
  const parcActif = equipements.filter((e) => e.statut !== 'reforme').length;
  const tempsOuverture = parcActif * jours * HEURES_PAR_JOUR;

  const defaillances = correctifs.length;
  const mtbf = defaillances > 0 ? (tempsOuverture - heuresArret) / defaillances : null;

  const durees = correctifs
    .map((o) => {
      const d = toDate(o.dateCreation);
      const f = toDate(o.dateFin ?? o.dateCloture);
      return d && f ? minutesEcoulees(d, f) / 60 : null;
    })
    .filter((v): v is number => v !== null);
  const mttr = durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : null;

  const prises = correctifs
    .map((o) => {
      const d = toDate(o.dateCreation);
      const deb = toDate(o.dateDebut);
      return d && deb ? minutesEcoulees(d, deb) / 60 : null;
    })
    .filter((v): v is number => v !== null);
  const mtta = prises.length ? prises.reduce((a, b) => a + b, 0) / prises.length : null;

  const disponibilite = tempsOuverture > 0 ? ((tempsOuverture - heuresArret) / tempsOuverture) * 100 : null;

  return { defaillances, mtbf, mttr, mtta, disponibilite, heuresArret };
}

/* ------------------------------------------------------------------ */
/* Performance de la maintenance                                       */
/* ------------------------------------------------------------------ */

export interface IndicateursActivite {
  total: number;
  ouverts: number;
  enRetard: number;
  clotures: number;
  /** Part d'OT préventifs + réglementaires dans le total réalisé. */
  tauxPreventif: number;
  /** Part d'OT réalisés à la date planifiée. */
  respectPlanning: number;
  /** Part d'OT correctifs clos dans le délai SLA. */
  respectSLA: number;
  coutTotal: number;
  coutPieces: number;
  coutMainOeuvre: number;
  coutPrestataire: number;
  tempsPasseH: number;
}

export function activite(ots: OrdreTravail[]): IndicateursActivite {
  const total = ots.length;
  const ouverts = ots.filter(estOuvert).length;
  const enRetard = ots.filter(estEnRetard).length;
  const termines = ots.filter(estTermine);
  const clotures = ots.filter((o) => o.statut === 'cloture').length;

  const preventifsTermines = termines.filter(
    (o) => o.type === 'preventif' || o.type === 'reglementaire' || o.type === 'metrologie' || o.type === 'predictif',
  ).length;

  const planifies = termines.filter((o) => o.datePlanifiee);
  const aLHeure = planifies.filter((o) => {
    const p = toDate(o.datePlanifiee);
    const f = toDate(o.dateFin ?? o.dateCloture);
    return p && f && f.getTime() <= p.getTime() + 86_400_000;
  }).length;

  const correctifsTermines = termines.filter((o) => o.type === 'correctif' && o.dateEcheanceSLA);
  const dansSLA = correctifsTermines.filter((o) => {
    const e = toDate(o.dateEcheanceSLA);
    const f = toDate(o.dateFin ?? o.dateCloture);
    return e && f && f.getTime() <= e.getTime();
  }).length;

  const cmo = ots.reduce((s, o) => s + coutMainOeuvre(o), 0);
  const cp = ots.reduce((s, o) => s + coutPieces(o), 0);
  const cpr = ots.reduce((s, o) => s + (o.coutPrestataire || 0), 0);

  return {
    total,
    ouverts,
    enRetard,
    clotures,
    tauxPreventif: termines.length ? (preventifsTermines / termines.length) * 100 : 0,
    respectPlanning: planifies.length ? (aLHeure / planifies.length) * 100 : 0,
    respectSLA: correctifsTermines.length ? (dansSLA / correctifsTermines.length) * 100 : 100,
    coutTotal: cmo + cp + cpr,
    coutPieces: cp,
    coutMainOeuvre: cmo,
    coutPrestataire: cpr,
    tempsPasseH: ots.reduce((s, o) => s + tempsPasseMin(o), 0) / 60,
  };
}

/* ------------------------------------------------------------------ */
/* Conformité réglementaire                                            */
/* ------------------------------------------------------------------ */

export interface IndicateursConformite {
  /** Obligations dont la prochaine échéance est encore dans le futur. */
  aJour: number;
  /** Échéances dans les 30 jours. */
  imminentes: number;
  /** Échéances dépassées : c'est le chiffre qu'un auditeur regarde. */
  depassees: number;
  total: number;
  taux: number;
  /** Réserves non levées, tous contrôles confondus. */
  reservesOuvertes: number;
  reservesCritiques: number;
}

export function conformite(base: BaseGMAO): IndicateursConformite {
  let aJour = 0;
  let imminentes = 0;
  let depassees = 0;

  for (const ctrl of base.controles.filter((c) => c.actif)) {
    const cibles = equipementsDuControle(base, ctrl.id);
    for (const eq of cibles) {
      const ech = prochaineEcheanceControle(base, ctrl.id, eq.id);
      const j = joursRestants(ech);
      if (j === null) {
        depassees += 1;
      } else if (j < 0) {
        depassees += 1;
      } else if (j <= 30) {
        imminentes += 1;
      } else {
        aJour += 1;
      }
    }
  }

  const total = aJour + imminentes + depassees;
  const reserves = [
    ...base.visitesControle.flatMap((v) => v.reserves),
    ...base.ordresTravail.flatMap((o) => o.reserves),
  ].filter((r) => !r.levee);

  return {
    aJour,
    imminentes,
    depassees,
    total,
    taux: total ? ((total - depassees) / total) * 100 : 100,
    reservesOuvertes: reserves.length,
    reservesCritiques: reserves.filter((r) => r.gravite === 'critique').length,
  };
}

/** Équipements entrant dans le périmètre d'un contrôle réglementaire. */
export function equipementsDuControle(base: BaseGMAO, controleId: ID): Equipement[] {
  const ctrl = base.controles.find((c) => c.id === controleId);
  if (!ctrl) return [];
  const familles = new Set(ctrl.familleIds);
  const explicites = new Set(ctrl.equipementIds);
  return base.equipements.filter(
    (e) => e.statut !== 'reforme' && (explicites.has(e.id) || familles.has(e.familleId)),
  );
}

/* ------------------------------------------------------------------ */
/* Charge préventive                                                   */
/* ------------------------------------------------------------------ */

export interface EcheancePreventive {
  gammeId: ID;
  equipementId: ID;
  date: string;
  joursRestants: number;
  dureeMin: number;
  /** Un OT a-t-il déjà été généré pour cette occurrence ? */
  otId?: ID;
}

/** Toutes les occurrences préventives à venir ou en retard, dans l'horizon donné. */
export function echeancierPreventif(base: BaseGMAO, horizonJours = 90): EcheancePreventive[] {
  const out: EcheancePreventive[] = [];
  // Couples déjà couverts par un OT ouvert, indexés une fois pour toutes.
  const couverts = new Map<string, ID>();
  for (const o of base.ordresTravail) {
    if (o.gammeId && o.equipementId && estOuvert(o)) couverts.set(`${o.gammeId}|${o.equipementId}`, o.id);
  }
  for (const g of base.gammes.filter((x) => x.actif)) {
    const cibles = equipementsDeLaGamme(base, g.id);
    for (const eq of cibles) {
      const date = prochaineEcheanceGamme(base, g.id, eq.id);
      if (!date) continue;
      const j = joursRestants(date);
      if (j === null || j > horizonJours) continue;
      out.push({
        gammeId: g.id,
        equipementId: eq.id,
        date,
        joursRestants: j,
        dureeMin: g.dureeEstimeeMin,
        otId: couverts.get(`${g.id}|${eq.id}`),
      });
    }
  }
  return out.sort((a, b) => a.joursRestants - b.joursRestants);
}

export function equipementsDeLaGamme(base: BaseGMAO, gammeId: ID): Equipement[] {
  const g = base.gammes.find((x) => x.id === gammeId);
  if (!g) return [];
  const explicites = new Set(g.equipementIds);
  return base.equipements.filter(
    (e) => e.statut !== 'reforme' && (explicites.has(e.id) || (g.familleId ? e.familleId === g.familleId : false)),
  );
}

/* ------------------------------------------------------------------ */
/* Répartitions pour les graphiques                                    */
/* ------------------------------------------------------------------ */

export function repartition<T, K extends string>(items: T[], cle: (t: T) => K): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const it of items) {
    const k = cle(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Série mensuelle sur N mois glissants : { mois, valeurs }. */
export function serieMensuelle(
  ots: OrdreTravail[],
  mois = 12,
  valeur: (o: OrdreTravail) => number = () => 1,
): { cle: string; label: string; valeur: number; correctif: number; preventif: number }[] {
  const out: { cle: string; label: string; valeur: number; correctif: number; preventif: number }[] = [];
  const base = aujourdHui();
  for (let i = mois - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      cle,
      label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      valeur: 0,
      correctif: 0,
      preventif: 0,
    });
  }
  const index = new Map(out.map((o) => [o.cle, o]));
  for (const ot of ots) {
    const d = toDate(ot.dateCreation);
    if (!d) continue;
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cible = index.get(cle);
    if (!cible) continue;
    cible.valeur += valeur(ot);
    if (ot.type === 'correctif') cible.correctif += 1;
    else cible.preventif += 1;
  }
  return out;
}

/** Palmarès des équipements les plus coûteux ou les plus défaillants. */
export function palmaresEquipements(
  base: BaseGMAO,
  critere: 'cout' | 'pannes' | 'indisponibilite',
  limite = 10,
): { equipement: Equipement; valeur: number; nbOT: number }[] {
  const agg = new Map<ID, { valeur: number; nbOT: number }>();
  for (const ot of base.ordresTravail) {
    if (!ot.equipementId) continue;
    const cur = agg.get(ot.equipementId) ?? { valeur: 0, nbOT: 0 };
    cur.nbOT += 1;
    if (critere === 'cout') cur.valeur += coutTotal(ot);
    else if (critere === 'pannes') cur.valeur += ot.type === 'correctif' ? 1 : 0;
    else cur.valeur += (ot.arretEquipementMin || 0) / 60;
    agg.set(ot.equipementId, cur);
  }
  return [...agg.entries()]
    .map(([id, v]) => ({ equipement: base.equipements.find((e) => e.id === id)!, ...v }))
    .filter((r) => r.equipement)
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, limite);
}

/**
 * Ratio coût cumulé de maintenance / valeur d'achat. Au-delà de 60 %, le
 * renouvellement devient généralement plus économique que la réparation.
 */
export function tauxRenouvellement(base: BaseGMAO, equipementId: ID): number | null {
  const eq = base.equipements.find((e) => e.id === equipementId);
  if (!eq || !eq.valeurAchat) return null;
  const cumule = base.ordresTravail
    .filter((o) => o.equipementId === equipementId)
    .reduce((s, o) => s + coutTotal(o), 0);
  return (cumule / eq.valeurAchat) * 100;
}

/** Âge de l'équipement rapporté à sa durée d'amortissement, en %. */
export function tauxVetuste(eq: Equipement): number {
  const mise = toDate(eq.dateMiseEnService);
  if (!mise || !eq.dureeAmortissementAns) return 0;
  const ans = (aujourdHui().getTime() - mise.getTime()) / (365.25 * 86_400_000);
  return Math.min(200, (ans / eq.dureeAmortissementAns) * 100);
}

export function valeurNetteComptable(eq: Equipement): number {
  const t = tauxVetuste(eq);
  return Math.max(0, eq.valeurAchat * (1 - t / 100));
}

export const STATUTS_INDISPO: StatutOT[] = ['attente_pieces', 'attente_prestataire'];
