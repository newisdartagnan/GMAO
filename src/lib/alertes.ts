import type { Alerte, BaseGMAO, ID } from '@/types/domain';
import { aujourdHui, iso, joursRestants } from './dates';
import { echeancierPreventif, equipementsDuControle, estEnRetard } from './kpi';
import { prochaineEcheanceControle } from './echeances';

/**
 * Les alertes ne sont pas stockées : elles sont recalculées à chaque lecture à
 * partir de l'état de la base. Une alerte disparaît donc d'elle-même dès que
 * sa cause est traitée, ce qui évite les listes d'alertes fantômes.
 *
 * `base.alertes` ne conserve que les décisions humaines (prise en compte,
 * mise en sourdine) et les alertes de capteurs, qui sont événementielles.
 */

export interface AlerteCalculee extends Alerte {
  /** Nombre de jours de retard (négatif) ou d'avance sur l'échéance. */
  jours?: number;
  lien?: string;
}

const HORIZON_PREVENTIF_J = 15;
const HORIZON_REGLEMENTAIRE_J = 45;
const HORIZON_CONTRAT_J = 90;
const HORIZON_GARANTIE_J = 60;

export function calculerAlertes(base: BaseGMAO): AlerteCalculee[] {
  const out: AlerteCalculee[] = [];
  const now = iso(aujourdHui());

  const pousser = (a: Omit<AlerteCalculee, 'id' | 'date' | 'statut'> & { id: string }) => {
    const decision = base.alertes.find((x) => x.id === a.id);
    out.push({
      date: now,
      statut: decision?.statut ?? 'nouvelle',
      traiteParId: decision?.traiteParId,
      otId: decision?.otId,
      ...a,
    });
  };

  /* -------- Échéances préventives dépassées ou imminentes -------- */
  for (const e of echeancierPreventif(base, HORIZON_PREVENTIF_J)) {
    if (e.otId) continue; // un OT couvre déjà l'occurrence
    const eq = base.equipements.find((x) => x.id === e.equipementId);
    const g = base.gammes.find((x) => x.id === e.gammeId);
    if (!eq || !g) continue;
    const critique = e.joursRestants < 0 && eq.criticite <= 2;
    pousser({
      id: `alr_prev_${g.id}_${eq.id}`,
      source: 'echeance_preventive',
      niveau: critique ? 'critique' : e.joursRestants < 0 ? 'alerte' : 'info',
      titre: e.joursRestants < 0 ? 'Préventif en retard' : 'Préventif à planifier',
      message: `${g.libelle} — ${eq.code} ${eq.designation} (${
        e.joursRestants < 0 ? `${-e.joursRestants} j de retard` : `dans ${e.joursRestants} j`
      })`,
      entiteType: 'equipement',
      entiteId: eq.id,
      jours: e.joursRestants,
      lien: `/equipements/${eq.id}`,
    });
  }

  /* -------- Échéances réglementaires -------- */
  for (const ctrl of base.controles.filter((c) => c.actif)) {
    for (const eq of equipementsDuControle(base, ctrl.id)) {
      const ech = prochaineEcheanceControle(base, ctrl.id, eq.id);
      const j = joursRestants(ech);
      if (j === null || j > HORIZON_REGLEMENTAIRE_J) continue;
      pousser({
        id: `alr_regl_${ctrl.id}_${eq.id}`,
        source: 'echeance_reglementaire',
        niveau: j < 0 ? (ctrl.bloquant ? 'critique' : 'alerte') : 'info',
        titre: j < 0 ? 'Contrôle réglementaire échu' : 'Contrôle réglementaire à programmer',
        message: `${ctrl.libelle} — ${eq.code} ${eq.designation}${
          j < 0 ? ` (${-j} j de retard${ctrl.bloquant ? ', exploitation à suspendre' : ''})` : ` (dans ${j} j)`
        }`,
        entiteType: 'controle',
        entiteId: ctrl.id,
        jours: j,
        lien: `/reglementaire`,
      });
    }
  }

  /* -------- Réserves de contrôle non levées -------- */
  for (const v of base.visitesControle) {
    for (const r of v.reserves.filter((x) => !x.levee)) {
      const eq = v.equipementId ? base.equipements.find((e) => e.id === v.equipementId) : undefined;
      pousser({
        id: `alr_res_${r.id}`,
        source: 'echeance_reglementaire',
        niveau: r.gravite === 'critique' ? 'critique' : r.gravite === 'majeure' ? 'alerte' : 'info',
        titre: `Réserve ${r.gravite} non levée`,
        message: `${r.libelle}${eq ? ` — ${eq.code} ${eq.designation}` : ''}`,
        entiteType: 'controle',
        entiteId: v.controleId,
        jours: joursRestants(r.dateEcheance) ?? undefined,
        lien: `/reglementaire`,
      });
    }
  }

  /* -------- Stocks sous le minimum -------- */
  for (const a of base.articles.filter((x) => x.actif && x.stockActuel <= x.stockMin)) {
    const commandeEnCours = base.bonsCommande.some(
      (bc) =>
        ['validee', 'envoyee', 'partiellement_recue', 'a_valider'].includes(bc.statut) &&
        bc.lignes.some((l) => l.articleId === a.id),
    );
    if (commandeEnCours) continue;
    pousser({
      id: `alr_stk_${a.id}`,
      source: 'stock_bas',
      niveau: a.stockActuel === 0 ? (a.critique ? 'critique' : 'alerte') : a.critique ? 'alerte' : 'info',
      titre: a.stockActuel === 0 ? 'Rupture de stock' : 'Stock sous le seuil minimum',
      message: `${a.code} ${a.designation} — ${a.stockActuel} ${a.unite} en stock (min. ${a.stockMin}), réappro ${a.delaiApproJours} j`,
      entiteType: 'article',
      entiteId: a.id,
      lien: `/stocks`,
    });
  }

  /* -------- SLA dépassés sur OT ouverts -------- */
  for (const ot of base.ordresTravail.filter(estEnRetard)) {
    pousser({
      id: `alr_sla_${ot.id}`,
      source: 'sla_depasse',
      niveau: ot.priorite === 'P1' ? 'critique' : ot.priorite === 'P2' ? 'alerte' : 'info',
      titre: 'Délai d’intervention dépassé',
      message: `${ot.numero} — ${ot.objet}`,
      entiteType: 'ordre_travail',
      entiteId: ot.id,
      jours: joursRestants(ot.dateEcheanceSLA ?? ot.datePlanifiee) ?? undefined,
      lien: `/ordres-travail/${ot.id}`,
    });
  }

  /* -------- Contrats arrivant à échéance -------- */
  for (const c of base.contrats.filter((x) => x.statut === 'actif')) {
    const j = joursRestants(c.dateFin);
    if (j === null || j > HORIZON_CONTRAT_J) continue;
    pousser({
      id: `alr_ctr_${c.id}`,
      source: 'contrat_echu',
      niveau: j < 0 ? 'critique' : j <= c.preavisJours ? 'alerte' : 'info',
      titre: j < 0 ? 'Contrat échu' : 'Contrat à renouveler',
      message: `${c.numero} — ${c.libelle} (${j < 0 ? `échu depuis ${-j} j` : `fin dans ${j} j`}${
        c.reconductionTacite ? `, préavis ${c.preavisJours} j` : ''
      })`,
      entiteType: 'contrat',
      entiteId: c.id,
      jours: j,
      lien: `/contrats`,
    });
  }

  /* -------- Garanties expirant -------- */
  for (const eq of base.equipements.filter((e) => e.finGarantie && e.statut !== 'reforme')) {
    const j = joursRestants(eq.finGarantie);
    if (j === null || j < 0 || j > HORIZON_GARANTIE_J) continue;
    pousser({
      id: `alr_gar_${eq.id}`,
      source: 'garantie_echue',
      niveau: eq.criticite <= 2 ? 'alerte' : 'info',
      titre: 'Fin de garantie proche',
      message: `${eq.code} ${eq.designation} — garantie jusqu’au ${eq.finGarantie} (dans ${j} j)`,
      entiteType: 'equipement',
      entiteId: eq.id,
      jours: j,
      lien: `/equipements/${eq.id}`,
    });
  }

  /* -------- Rappels fabricants non soldés -------- */
  for (const r of base.rappels.filter((x) => x.statut !== 'solde')) {
    const restants = r.equipementIds.filter((id) => !r.equipementsTraites.includes(id)).length;
    const j = joursRestants(r.dateEcheance);
    pousser({
      id: `alr_rap_${r.id}`,
      source: 'rappel_fabricant',
      niveau: r.actionRequise === 'retrait' || (j !== null && j < 0) ? 'critique' : 'alerte',
      titre: 'Action corrective de sécurité en cours',
      message: `${r.reference} — ${r.objet} : ${restants} équipement(s) non traité(s)`,
      entiteType: 'rappel',
      entiteId: r.id,
      jours: j ?? undefined,
      lien: `/vigilance`,
    });
  }

  /* -------- Habilitations expirées -------- */
  for (const h of base.habilitations.filter((x) => x.dateExpiration)) {
    const j = joursRestants(h.dateExpiration);
    if (j === null || j > 60) continue;
    const u = base.utilisateurs.find((x) => x.id === h.utilisateurId);
    if (!u?.actif) continue;
    pousser({
      id: `alr_hab_${h.id}`,
      source: 'habilitation_expiree',
      niveau: j < 0 && h.obligatoire ? 'critique' : 'alerte',
      titre: j < 0 ? 'Habilitation expirée' : 'Habilitation à renouveler',
      message: `${u.prenom} ${u.nom} — ${h.intitule} (${j < 0 ? `expirée depuis ${-j} j` : `dans ${j} j`})`,
      entiteType: 'utilisateur',
      entiteId: u.id,
      jours: j,
      lien: `/equipes`,
    });
  }

  /* -------- Seuils capteurs franchis -------- */
  for (const cap of base.capteurs.filter((c) => c.actif)) {
    const dernier = base.releves
      .filter((r) => r.capteurId === cap.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    if (!dernier) continue;
    const eq = base.equipements.find((e) => e.id === cap.equipementId);
    if (!eq) continue;

    let niveau: AlerteCalculee['niveau'] | null = null;
    let sens = '';
    if (cap.seuilHautCritique !== undefined && dernier.valeur >= cap.seuilHautCritique) {
      niveau = 'critique';
      sens = `≥ ${cap.seuilHautCritique}`;
    } else if (cap.seuilBasCritique !== undefined && dernier.valeur <= cap.seuilBasCritique) {
      niveau = 'critique';
      sens = `≤ ${cap.seuilBasCritique}`;
    } else if (cap.seuilHautAlerte !== undefined && dernier.valeur >= cap.seuilHautAlerte) {
      niveau = 'alerte';
      sens = `≥ ${cap.seuilHautAlerte}`;
    } else if (cap.seuilBasAlerte !== undefined && dernier.valeur <= cap.seuilBasAlerte) {
      niveau = 'alerte';
      sens = `≤ ${cap.seuilBasAlerte}`;
    }
    if (!niveau) continue;

    pousser({
      id: `alr_cap_${cap.id}`,
      source: 'capteur',
      niveau,
      titre: niveau === 'critique' ? 'Seuil capteur critique franchi' : 'Dérive détectée',
      message: `${eq.code} ${eq.designation} — ${cap.code} : ${dernier.valeur} ${cap.unite} (seuil ${sens})`,
      entiteType: 'equipement',
      entiteId: eq.id,
      lien: `/predictif`,
    });
  }

  const rang = { critique: 0, alerte: 1, info: 2 };
  return out
    .filter((a) => a.statut !== 'ignoree')
    .sort((a, b) => rang[a.niveau] - rang[b.niveau] || (a.jours ?? 0) - (b.jours ?? 0));
}

export function compterAlertes(alertes: AlerteCalculee[]) {
  return {
    critiques: alertes.filter((a) => a.niveau === 'critique').length,
    alertes: alertes.filter((a) => a.niveau === 'alerte').length,
    infos: alertes.filter((a) => a.niveau === 'info').length,
    nouvelles: alertes.filter((a) => a.statut === 'nouvelle').length,
    total: alertes.length,
  };
}

export function alertesDeLEquipement(alertes: AlerteCalculee[], equipementId: ID): AlerteCalculee[] {
  return alertes.filter((a) => a.entiteType === 'equipement' && a.entiteId === equipementId);
}
