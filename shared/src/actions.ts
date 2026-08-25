import type {
  BaseGMAO,
  BonCommande,
  DemandeIntervention,
  ID,
  LigneCommande,
  OrdreTravail,
  PrioriteOT,
  StatutOT,
  TypeMaintenance,
  Vigilance,
} from './domaine';
import { PRIORITE } from './libelles';
import { aujourdHui, iso, isoHeure, toDate } from './dates';
import { numeroSuivant, uid } from './id';
import { prochaineEcheanceGamme } from './echeances';

/**
 * Opérations métier. Chaque fonction reçoit la base en cours de mutation et la
 * modifie en place ; l'appelant passe par `muter()` du store, qui se charge de
 * la copie, de la persistance et du journal d'audit.
 */

/* ------------------------------------------------------------------ */
/* Ordres de travail                                                   */
/* ------------------------------------------------------------------ */

export interface BrouillonOT {
  type: TypeMaintenance;
  objet: string;
  description: string;
  equipementId?: ID;
  localId?: ID;
  serviceId?: ID;
  priorite: PrioriteOT;
  datePlanifiee?: string;
  equipeId?: ID;
  technicienPrincipalId?: ID;
  execution: 'interne' | 'prestataire';
  prestataireId?: ID;
  gammeId?: ID;
  demandeId?: ID;
}

export function creerOT(b: BaseGMAO, brouillon: BrouillonOT, auteurId: ID): OrdreTravail {
  const maintenant = aujourdHui();
  const eq = brouillon.equipementId ? b.equipements.find((e) => e.id === brouillon.equipementId) : undefined;
  const localId = brouillon.localId ?? eq?.localId ?? b.locaux[0].id;
  const local = b.locaux.find((l) => l.id === localId)!;
  const sla = PRIORITE[brouillon.priorite];

  const ot: OrdreTravail = {
    id: uid('ord'),
    numero: numeroSuivant('OT', maintenant.getFullYear(), b.ordresTravail.map((o) => o.numero)),
    type: brouillon.type,
    objet: brouillon.objet,
    description: brouillon.description,
    equipementId: brouillon.equipementId,
    localId,
    serviceId: brouillon.serviceId ?? eq?.serviceId ?? local.serviceId,
    siteId: local.siteId,
    demandeId: brouillon.demandeId,
    gammeId: brouillon.gammeId,
    priorite: brouillon.priorite,
    statut: brouillon.technicienPrincipalId ? 'affecte' : brouillon.datePlanifiee ? 'planifie' : 'a_planifier',
    dateCreation: isoHeure(maintenant),
    datePlanifiee: brouillon.datePlanifiee,
    dateEcheanceSLA: isoHeure(new Date(maintenant.getTime() + sla.delaiResolutionH * 3_600_000)),
    equipeId: brouillon.equipeId,
    technicienPrincipalId: brouillon.technicienPrincipalId,
    prestataireId: brouillon.prestataireId,
    execution: brouillon.execution,
    temps: [],
    pieces: [],
    coutPrestataire: 0,
    arretEquipementMin: 0,
    mesures: [],
    reserves: [],
    securite: {
      consignationElectrique: false,
      desinfectionPrealable: eq?.risqueInfectieux ?? false,
      epiPortes: false,
      permisFeu: false,
      patientEvacue: false,
    },
    commentaires: [],
    documentIds: [],
    photoUrls: [],
  };

  b.ordresTravail.unshift(ot);

  // Un correctif sur un équipement encore « en service » le bascule en panne :
  // la fiche équipement doit refléter la réalité du terrain immédiatement.
  if (eq && brouillon.type === 'correctif' && eq.statut === 'en_service') {
    eq.statut = 'en_panne';
  }

  if (brouillon.demandeId) {
    const di = b.demandes.find((d) => d.id === brouillon.demandeId);
    if (di) {
      di.statut = 'transformee';
      di.otId = ot.id;
      di.traiteParId = auteurId;
      di.dateTraitement = isoHeure(maintenant);
    }
  }

  return ot;
}

export function changerStatutOT(b: BaseGMAO, otId: ID, statut: StatutOT, auteurId: ID): void {
  const ot = b.ordresTravail.find((o) => o.id === otId);
  if (!ot) return;
  const maintenant = aujourdHui();
  ot.statut = statut;

  if (statut === 'en_cours' && !ot.dateDebut) ot.dateDebut = isoHeure(maintenant);
  if (statut === 'realise') {
    ot.dateFin = ot.dateFin ?? isoHeure(maintenant);
    appliquerConsommations(b, ot, auteurId);
  }
  if (statut === 'cloture') {
    ot.dateFin = ot.dateFin ?? isoHeure(maintenant);
    ot.dateCloture = isoHeure(maintenant);
    ot.validePar = auteurId;
    ot.dateValidation = iso(maintenant);
    appliquerConsommations(b, ot, auteurId);
    remettreEquipementEnService(b, ot);
  }
  if (statut === 'annule') {
    ot.dateCloture = isoHeure(maintenant);
    remettreEquipementEnService(b, ot);
  }
  if (statut === 'attente_pieces' && ot.equipementId) {
    const eq = b.equipements.find((e) => e.id === ot.equipementId);
    if (eq && eq.statut !== 'reforme') eq.statut = 'attente_pieces';
  }
}

/**
 * Sort du stock les pièces déclarées sur l'OT et non encore mouvementées.
 * L'idempotence repose sur le drapeau `sortieValidee` de chaque ligne.
 */
export function appliquerConsommations(b: BaseGMAO, ot: OrdreTravail, auteurId: ID): void {
  for (const ligne of ot.pieces) {
    if (ligne.sortieValidee) continue;
    const art = b.articles.find((a) => a.id === ligne.articleId);
    if (!art) continue;
    art.stockActuel = Math.max(0, art.stockActuel - ligne.quantite);
    b.mouvementsStock.unshift({
      id: uid('mvs'),
      date: iso(aujourdHui()),
      articleId: art.id,
      type: 'sortie',
      quantite: ligne.quantite,
      prixUnitaire: ligne.prixUnitaire,
      stockApres: art.stockActuel,
      otId: ot.id,
      motif: `Consommation sur ${ot.numero}`,
      utilisateurId: auteurId,
    });
    ligne.sortieValidee = true;
  }
}

/**
 * À la clôture, l'équipement revient en service — sauf si un autre OT ouvert
 * l'immobilise encore, auquel cas on ne masque pas l'indisponibilité réelle.
 */
function remettreEquipementEnService(b: BaseGMAO, ot: OrdreTravail): void {
  if (!ot.equipementId) return;
  const eq = b.equipements.find((e) => e.id === ot.equipementId);
  if (!eq || eq.statut === 'reforme' || eq.statut === 'en_stock') return;
  const autresBloquants = b.ordresTravail.some(
    (o) =>
      o.id !== ot.id &&
      o.equipementId === eq.id &&
      o.type === 'correctif' &&
      ['a_planifier', 'planifie', 'affecte', 'en_cours', 'attente_pieces', 'attente_prestataire'].includes(o.statut),
  );
  if (!autresBloquants) eq.statut = 'en_service';
}

export function ajouterTemps(
  b: BaseGMAO,
  otId: ID,
  ligne: { technicienId: ID; dureeMin: number; commentaire?: string },
): void {
  const ot = b.ordresTravail.find((o) => o.id === otId);
  const tech = b.utilisateurs.find((u) => u.id === ligne.technicienId);
  if (!ot || !tech) return;
  ot.temps.push({
    technicienId: ligne.technicienId,
    date: iso(aujourdHui()),
    dureeMin: ligne.dureeMin,
    tauxHoraire: tech.tauxHoraire,
    commentaire: ligne.commentaire,
  });
  if (ot.statut === 'planifie' || ot.statut === 'affecte' || ot.statut === 'a_planifier') {
    ot.statut = 'en_cours';
    ot.dateDebut = ot.dateDebut ?? isoHeure(aujourdHui());
  }
}

export function ajouterPiece(b: BaseGMAO, otId: ID, articleId: ID, quantite: number): void {
  const ot = b.ordresTravail.find((o) => o.id === otId);
  const art = b.articles.find((a) => a.id === articleId);
  if (!ot || !art) return;
  const existante = ot.pieces.find((p) => p.articleId === articleId && !p.sortieValidee);
  if (existante) existante.quantite += quantite;
  else ot.pieces.push({ articleId, quantite, prixUnitaire: art.prixMoyenPondere, sortieValidee: false });
}

export function ajouterCommentaire(b: BaseGMAO, otId: ID, auteurId: ID, texte: string): void {
  const ot = b.ordresTravail.find((o) => o.id === otId);
  if (!ot) return;
  ot.commentaires.push({ id: uid('cmt'), auteurId, date: isoHeure(aujourdHui()), texte });
}

export function affecterOT(b: BaseGMAO, otId: ID, technicienId: ID | undefined, datePlanifiee?: string): void {
  const ot = b.ordresTravail.find((o) => o.id === otId);
  if (!ot) return;
  ot.technicienPrincipalId = technicienId;
  if (datePlanifiee) ot.datePlanifiee = datePlanifiee;
  if (technicienId) {
    const tech = b.utilisateurs.find((u) => u.id === technicienId);
    if (tech?.equipeId) ot.equipeId = tech.equipeId;
    if (ot.statut === 'a_planifier' || ot.statut === 'planifie') ot.statut = 'affecte';
  }
}

/* ------------------------------------------------------------------ */
/* Demandes d'intervention                                             */
/* ------------------------------------------------------------------ */

export function creerDemande(
  b: BaseGMAO,
  d: Omit<DemandeIntervention, 'id' | 'numero' | 'dateCreation' | 'statut'>,
): DemandeIntervention {
  const maintenant = aujourdHui();
  const demande: DemandeIntervention = {
    ...d,
    id: uid('dmi'),
    numero: numeroSuivant('DI', maintenant.getFullYear(), b.demandes.map((x) => x.numero)),
    dateCreation: isoHeure(maintenant),
    statut: 'nouvelle',
  };
  b.demandes.unshift(demande);
  return demande;
}

export function refuserDemande(b: BaseGMAO, demandeId: ID, motif: string, auteurId: ID): void {
  const d = b.demandes.find((x) => x.id === demandeId);
  if (!d) return;
  d.statut = 'refusee';
  d.motifRefus = motif;
  d.traiteParId = auteurId;
  d.dateTraitement = isoHeure(aujourdHui());
}

/* ------------------------------------------------------------------ */
/* Maintenance préventive                                              */
/* ------------------------------------------------------------------ */

/**
 * Génère les OT préventifs pour toutes les occurrences arrivant à échéance
 * dans l'horizon donné et non déjà couvertes par un OT ouvert.
 * Retourne les OT créés, pour que l'appelant puisse en rendre compte.
 */
export function genererOTPreventifs(b: BaseGMAO, horizonJours: number, auteurId: ID): OrdreTravail[] {
  const crees: OrdreTravail[] = [];
  const limite = new Date(aujourdHui().getTime() + horizonJours * 86_400_000);

  for (const g of b.gammes.filter((x) => x.actif)) {
    const explicites = new Set(g.equipementIds);
    const cibles = b.equipements.filter(
      (e) => e.statut !== 'reforme' && (explicites.has(e.id) || (g.familleId ? e.familleId === g.familleId : false)),
    );
    for (const eq of cibles) {
      const echeance = prochaineEcheanceGamme(b, g.id, eq.id);
      const d = toDate(echeance);
      if (!d || d > limite) continue;

      const dejaCouvert = b.ordresTravail.some(
        (o) =>
          o.gammeId === g.id &&
          o.equipementId === eq.id &&
          ['a_planifier', 'planifie', 'affecte', 'en_cours', 'attente_pieces', 'attente_prestataire'].includes(o.statut),
      );
      if (dejaCouvert) continue;

      const ot = creerOT(
        b,
        {
          type: g.type,
          objet: `${g.libelle} — ${eq.code}`,
          description: `Occurrence générée depuis la gamme ${g.code}. ${g.consignesSecurite}`,
          equipementId: eq.id,
          priorite: eq.criticite === 1 ? 'P3' : 'P4',
          datePlanifiee: echeance ?? undefined,
          equipeId: g.equipeId,
          execution: g.execution,
          prestataireId: g.execution === 'prestataire' ? b.contrats.find((c) => c.id === eq.contratId)?.fournisseurId : undefined,
          gammeId: g.id,
        },
        auteurId,
      );
      ot.statut = 'planifie';
      ot.mesures = g.operations.map((op) => ({ operationId: op.id, conforme: false }));
      ot.pieces = g.piecesPrevues.map((p) => ({
        articleId: p.articleId,
        quantite: p.quantite,
        prixUnitaire: b.articles.find((a) => a.id === p.articleId)?.prixMoyenPondere ?? 0,
        sortieValidee: false,
      }));
      ot.securite.desinfectionPrealable = eq.risqueInfectieux;
      ot.securite.consignationElectrique = g.operations.some((o) => o.nature === 'securite_electrique');
      crees.push(ot);
    }
  }
  return crees;
}

/* ------------------------------------------------------------------ */
/* Stocks et achats                                                    */
/* ------------------------------------------------------------------ */

export function mouvementerStock(
  b: BaseGMAO,
  articleId: ID,
  type: 'entree' | 'sortie' | 'inventaire' | 'rebut' | 'retour',
  quantite: number,
  motif: string,
  auteurId: ID,
): void {
  const art = b.articles.find((a) => a.id === articleId);
  if (!art) return;
  const avant = art.stockActuel;
  if (type === 'inventaire') art.stockActuel = quantite;
  else if (type === 'entree' || type === 'retour') art.stockActuel += quantite;
  else art.stockActuel = Math.max(0, art.stockActuel - quantite);

  b.mouvementsStock.unshift({
    id: uid('mvs'),
    date: iso(aujourdHui()),
    articleId,
    type,
    quantite: type === 'inventaire' ? quantite - avant : quantite,
    prixUnitaire: art.prixMoyenPondere,
    stockApres: art.stockActuel,
    motif,
    utilisateurId: auteurId,
  });
}

/** Crée un bon de commande de réapprovisionnement pour les articles sous seuil. */
export function genererReappro(b: BaseGMAO, auteurId: ID): BonCommande[] {
  const sousSeuil = b.articles.filter((a) => {
    if (!a.actif || a.stockActuel > a.stockMin) return false;
    return !b.bonsCommande.some(
      (bc) =>
        ['a_valider', 'validee', 'envoyee', 'partiellement_recue'].includes(bc.statut) &&
        bc.lignes.some((l) => l.articleId === a.id),
    );
  });

  const parFournisseur = new Map<ID, typeof sousSeuil>();
  for (const a of sousSeuil) {
    const f = a.fournisseurPrincipalId ?? 'sans_fournisseur';
    parFournisseur.set(f, [...(parFournisseur.get(f) ?? []), a]);
  }

  const crees: BonCommande[] = [];
  const maintenant = aujourdHui();
  for (const [fournisseurId, liste] of parFournisseur) {
    if (fournisseurId === 'sans_fournisseur') continue;
    const lignes: LigneCommande[] = liste.map((a) => ({
      articleId: a.id,
      quantite: Math.max(1, a.stockMax - a.stockActuel),
      quantiteRecue: 0,
      prixUnitaire: a.prixMoyenPondere,
    }));
    const bc: BonCommande = {
      id: uid('bcd'),
      numero: numeroSuivant('BC', maintenant.getFullYear(), b.bonsCommande.map((x) => x.numero)),
      fournisseurId,
      dateCreation: iso(maintenant),
      dateLivraisonPrevue: iso(new Date(maintenant.getTime() + (liste[0].delaiApproJours || 30) * 86_400_000)),
      lignes,
      origine: 'reappro_auto',
      statut: 'a_valider',
      demandeurId: auteurId,
      notes: 'Généré automatiquement à partir des seuils de réapprovisionnement.',
    };
    b.bonsCommande.unshift(bc);
    crees.push(bc);
  }
  return crees;
}

export function receptionnerCommande(b: BaseGMAO, bonId: ID, auteurId: ID, partielle = false): void {
  const bc = b.bonsCommande.find((x) => x.id === bonId);
  if (!bc) return;
  const maintenant = aujourdHui();

  for (const l of bc.lignes) {
    const aRecevoir = partielle ? Math.ceil((l.quantite - l.quantiteRecue) / 2) : l.quantite - l.quantiteRecue;
    if (aRecevoir <= 0 || !l.articleId) continue;
    const art = b.articles.find((a) => a.id === l.articleId);
    if (!art) continue;

    // Prix moyen pondéré : la valorisation du stock suit le coût réel d'achat.
    const valeurAvant = art.stockActuel * art.prixMoyenPondere;
    art.stockActuel += aRecevoir;
    art.prixMoyenPondere =
      art.stockActuel > 0 ? Math.round((valeurAvant + aRecevoir * l.prixUnitaire) / art.stockActuel) : l.prixUnitaire;
    l.quantiteRecue += aRecevoir;

    b.mouvementsStock.unshift({
      id: uid('mvs'),
      date: iso(maintenant),
      articleId: art.id,
      type: 'entree',
      quantite: aRecevoir,
      prixUnitaire: l.prixUnitaire,
      stockApres: art.stockActuel,
      bonCommandeId: bc.id,
      motif: `Réception ${bc.numero}`,
      utilisateurId: auteurId,
    });
  }

  const complet = bc.lignes.every((l) => l.quantiteRecue >= l.quantite);
  bc.statut = complet ? 'receptionnee' : 'partiellement_recue';
  if (complet) bc.dateReception = iso(maintenant);
}

export function validerCommande(b: BaseGMAO, bonId: ID, auteurId: ID): void {
  const bc = b.bonsCommande.find((x) => x.id === bonId);
  if (!bc) return;
  bc.statut = 'validee';
  bc.valideParId = auteurId;
  bc.dateEnvoi = iso(aujourdHui());
}

/* ------------------------------------------------------------------ */
/* Conformité et vigilance                                             */
/* ------------------------------------------------------------------ */

export function leverReserve(b: BaseGMAO, reserveId: ID, otId?: ID): void {
  const maintenant = iso(aujourdHui());
  for (const v of b.visitesControle) {
    const r = v.reserves.find((x) => x.id === reserveId);
    if (r) {
      r.levee = true;
      r.dateLevee = maintenant;
      r.otLeveeId = otId;
      return;
    }
  }
  for (const o of b.ordresTravail) {
    const r = o.reserves.find((x) => x.id === reserveId);
    if (r) {
      r.levee = true;
      r.dateLevee = maintenant;
      r.otLeveeId = otId;
      return;
    }
  }
}

export function enregistrerVisiteControle(
  b: BaseGMAO,
  visite: {
    controleId: ID;
    equipementId?: ID;
    verdict: 'conforme' | 'conforme_avec_reserves' | 'non_conforme';
    numeroRapport?: string;
    reserve?: { libelle: string; gravite: 'mineure' | 'majeure' | 'critique' };
  },
): void {
  const ctrl = b.controles.find((c) => c.id === visite.controleId);
  if (!ctrl) return;
  const maintenant = aujourdHui();
  const jours =
    ctrl.periodiciteUnite === 'jours'
      ? ctrl.periodiciteValeur
      : ctrl.periodiciteUnite === 'semaines'
        ? ctrl.periodiciteValeur * 7
        : ctrl.periodiciteUnite === 'mois'
          ? Math.round(ctrl.periodiciteValeur * 30.44)
          : Math.round(ctrl.periodiciteValeur * 365.25);

  b.visitesControle.unshift({
    id: uid('vct'),
    controleId: ctrl.id,
    equipementId: visite.equipementId,
    dateVisite: iso(maintenant),
    dateProchaine: iso(new Date(maintenant.getTime() + jours * 86_400_000)),
    organismeId: ctrl.organismeId,
    verdict: visite.verdict,
    reserves: visite.reserve
      ? [{ id: uid('res'), libelle: visite.reserve.libelle, gravite: visite.reserve.gravite, levee: false }]
      : [],
    numeroRapport: visite.numeroRapport,
    documentIds: [],
  });
}

export function creerVigilance(
  b: BaseGMAO,
  v: Omit<Vigilance, 'id' | 'numero' | 'statut' | 'actionsCorrectives'>,
): Vigilance {
  const maintenant = aujourdHui();
  const vig: Vigilance = {
    ...v,
    id: uid('vig'),
    numero: numeroSuivant('MV', maintenant.getFullYear(), b.vigilances.map((x) => x.numero)),
    statut: 'ouvert',
    actionsCorrectives: [],
  };
  b.vigilances.unshift(vig);
  return vig;
}

export function marquerEquipementTraite(b: BaseGMAO, rappelId: ID, equipementId: ID): void {
  const r = b.rappels.find((x) => x.id === rappelId);
  if (!r || r.equipementsTraites.includes(equipementId)) return;
  r.equipementsTraites.push(equipementId);
  r.statut = r.equipementsTraites.length >= r.equipementIds.length ? 'solde' : 'en_cours';
}

/* ------------------------------------------------------------------ */
/* Parc                                                                */
/* ------------------------------------------------------------------ */

export function deplacerEquipement(b: BaseGMAO, equipementId: ID, localCibleId: ID, motif: string, auteurId: ID): void {
  const eq = b.equipements.find((e) => e.id === equipementId);
  const local = b.locaux.find((l) => l.id === localCibleId);
  if (!eq || !local) return;
  b.mouvementsEquipement.unshift({
    id: uid('mve'),
    equipementId,
    date: iso(aujourdHui()),
    localSourceId: eq.localId,
    localCibleId,
    motif,
    utilisateurId: auteurId,
  });
  eq.localId = local.id;
  eq.batimentId = local.batimentId;
  eq.serviceId = local.serviceId;
  eq.siteId = local.siteId;
}

export function releverCompteur(b: BaseGMAO, equipementId: ID, valeur: number): void {
  const eq = b.equipements.find((e) => e.id === equipementId);
  if (!eq || !eq.compteurs.length) return;
  eq.compteurs[0].valeur = valeur;
  eq.compteurs[0].dateReleve = iso(aujourdHui());
}

export function changerStatutEquipement(b: BaseGMAO, equipementId: ID, statut: BaseGMAO['equipements'][number]['statut']): void {
  const eq = b.equipements.find((e) => e.id === equipementId);
  if (!eq) return;
  eq.statut = statut;
  eq.actif = statut !== 'reforme';
}
