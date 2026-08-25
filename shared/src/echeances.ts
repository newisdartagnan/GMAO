import type { BaseGMAO, ID, ISODate, OrdreTravail, VisiteControle } from './domaine';
import { ajouterPeriode, aujourdHui, iso, toDate } from './dates';

/**
 * Les échéanciers parcourent des centaines de couples (gamme × équipement) et
 * sont recalculés à chaque écriture. Sans index, chaque couple relirait la
 * liste complète des ordres de travail. Les deux index ci-dessous sont
 * construits une fois par version de la base et retenus dans une WeakMap :
 * une nouvelle base — donc un nouvel objet — invalide naturellement le cache.
 */
const cacheRealisations = new WeakMap<BaseGMAO, Map<string, ISODate>>();
const cacheVisites = new WeakMap<BaseGMAO, Map<string, VisiteControle>>();

const estTerminee = (o: OrdreTravail) => o.statut === 'realise' || o.statut === 'cloture';

function indexRealisations(base: BaseGMAO): Map<string, ISODate> {
  const existant = cacheRealisations.get(base);
  if (existant) return existant;
  const m = new Map<string, ISODate>();
  for (const o of base.ordresTravail) {
    if (!o.gammeId || !o.equipementId || !estTerminee(o)) continue;
    const date = o.dateFin ?? o.dateCloture;
    if (!date) continue;
    const cle = `${o.gammeId}|${o.equipementId}`;
    const precedente = m.get(cle);
    if (!precedente || date > precedente) m.set(cle, date);
  }
  cacheRealisations.set(base, m);
  return m;
}

/** Dernière visite enregistrée par couple (contrôle × équipement). */
function indexVisites(base: BaseGMAO): Map<string, VisiteControle> {
  const existant = cacheVisites.get(base);
  if (existant) return existant;
  const m = new Map<string, VisiteControle>();
  for (const v of base.visitesControle) {
    const cle = `${v.controleId}|${v.equipementId ?? ''}`;
    const precedente = m.get(cle);
    if (!precedente || v.dateVisite > precedente.dateVisite) m.set(cle, v);
  }
  cacheVisites.set(base, m);
  return m;
}

/**
 * Calcul des prochaines échéances de maintenance préventive et de contrôle
 * réglementaire. Le principe est le même dans les deux cas : on part de la
 * dernière occurrence réalisée, à défaut de la mise en service de
 * l'équipement, et on ajoute la périodicité.
 */

/** Date de la dernière intervention terminée pour une gamme sur un équipement. */
export function derniereRealisationGamme(base: BaseGMAO, gammeId: ID, equipementId: ID): ISODate | null {
  return indexRealisations(base).get(`${gammeId}|${equipementId}`) ?? null;
}

export function prochaineEcheanceGamme(base: BaseGMAO, gammeId: ID, equipementId: ID): ISODate | null {
  const g = base.gammes.find((x) => x.id === gammeId);
  const eq = base.equipements.find((e) => e.id === equipementId);
  if (!g || !eq) return null;

  if (g.modeDeclenchement === 'compteur' && g.compteurType && g.compteurSeuil) {
    return echeanceSurCompteur(base, gammeId, equipementId);
  }

  const derniere = derniereRealisationGamme(base, gammeId, equipementId);
  const depart = toDate(derniere ?? eq.dateMiseEnService);
  if (!depart) return null;

  // Si aucune occurrence n'a jamais été faite, on rattrape le retard sur la
  // première échéance passée plutôt que de projeter loin dans le passé.
  let prochaine = ajouterPeriode(depart, g.periodiciteValeur, g.periodiciteUnite);
  if (!derniere) {
    const now = aujourdHui();
    let garde = 0;
    while (prochaine < now && garde < 400) {
      prochaine = ajouterPeriode(prochaine, g.periodiciteValeur, g.periodiciteUnite);
      garde += 1;
    }
    // On ramène d'un cran pour que la première échéance affichée soit celle
    // qui vient, et non celle d'après.
    prochaine = ajouterPeriode(prochaine, -g.periodiciteValeur, g.periodiciteUnite);
  }
  return iso(prochaine);
}

/**
 * Échéance sur compteur : on estime la consommation journalière depuis la
 * mise en service, puis on projette la date à laquelle le seuil sera franchi.
 */
export function echeanceSurCompteur(base: BaseGMAO, gammeId: ID, equipementId: ID): ISODate | null {
  const g = base.gammes.find((x) => x.id === gammeId);
  const eq = base.equipements.find((e) => e.id === equipementId);
  if (!g || !eq || !g.compteurType || !g.compteurSeuil) return null;

  const compteur = eq.compteurs.find((c) => c.type === g.compteurType);
  if (!compteur) return null;

  const mise = toDate(eq.dateMiseEnService);
  const releve = toDate(compteur.dateReleve);
  if (!mise || !releve) return null;

  const jours = Math.max(1, (releve.getTime() - mise.getTime()) / 86_400_000);
  const parJour = compteur.valeur / jours;
  if (parJour <= 0) return null;

  const dejaFait = Math.floor(compteur.valeur / g.compteurSeuil) * g.compteurSeuil;
  const restant = dejaFait + g.compteurSeuil - compteur.valeur;
  const joursRestants = restant / parJour;

  return iso(new Date(releve.getTime() + joursRestants * 86_400_000));
}

/** Valeur du compteur à laquelle tombe la prochaine échéance. */
export function seuilCompteurSuivant(base: BaseGMAO, gammeId: ID, equipementId: ID): number | null {
  const g = base.gammes.find((x) => x.id === gammeId);
  const eq = base.equipements.find((e) => e.id === equipementId);
  if (!g || !eq || !g.compteurType || !g.compteurSeuil) return null;
  const compteur = eq.compteurs.find((c) => c.type === g.compteurType);
  if (!compteur) return null;
  return (Math.floor(compteur.valeur / g.compteurSeuil) + 1) * g.compteurSeuil;
}

export function derniereVisiteControle(base: BaseGMAO, controleId: ID, equipementId?: ID) {
  return indexVisites(base).get(`${controleId}|${equipementId ?? ''}`);
}

export function prochaineEcheanceControle(base: BaseGMAO, controleId: ID, equipementId?: ID): ISODate | null {
  const c = base.controles.find((x) => x.id === controleId);
  if (!c) return null;

  const derniere = derniereVisiteControle(base, controleId, equipementId);
  if (derniere) return derniere.dateProchaine;

  const eq = equipementId ? base.equipements.find((e) => e.id === equipementId) : undefined;
  const depart = toDate(eq?.dateMiseEnService ?? iso(aujourdHui()));
  if (!depart) return null;

  let prochaine = ajouterPeriode(depart, c.periodiciteValeur, c.periodiciteUnite);
  const now = aujourdHui();
  let garde = 0;
  while (prochaine < now && garde < 400) {
    prochaine = ajouterPeriode(prochaine, c.periodiciteValeur, c.periodiciteUnite);
    garde += 1;
  }
  return iso(ajouterPeriode(prochaine, -c.periodiciteValeur, c.periodiciteUnite));
}
