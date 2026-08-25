import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInHours,
  differenceInMinutes,
  format,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ISODate, UnitePeriodicite } from '@/types/domain';

/**
 * L'application raisonne sur une « date du jour » injectable : les jeux de
 * démonstration restent cohérents et les échéances se testent sans horloge
 * système.
 */
let referenceAujourdHui: Date | null = null;

export function definirAujourdHui(d: Date | null): void {
  referenceAujourdHui = d;
}

export function aujourdHui(): Date {
  return referenceAujourdHui ? new Date(referenceAujourdHui) : new Date();
}

export function toDate(v: ISODate | Date | undefined | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : parseISO(v);
  return isValid(d) ? d : null;
}

export function iso(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function isoHeure(d: Date): ISODate {
  return format(d, "yyyy-MM-dd'T'HH:mm:ss");
}

export function dateCourte(v: ISODate | Date | undefined | null): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy', { locale: fr }) : '—';
}

export function dateLongue(v: ISODate | Date | undefined | null): string {
  const d = toDate(v);
  return d ? format(d, 'd MMMM yyyy', { locale: fr }) : '—';
}

export function dateHeure(v: ISODate | Date | undefined | null): string {
  const d = toDate(v);
  return d ? format(d, 'dd/MM/yyyy HH:mm', { locale: fr }) : '—';
}

export function moisAnnee(v: ISODate | Date): string {
  const d = toDate(v);
  return d ? format(d, 'MMM yyyy', { locale: fr }) : '—';
}

/** Nombre de jours entre aujourd'hui et l'échéance ; négatif = en retard. */
export function joursRestants(v: ISODate | Date | undefined | null): number | null {
  const d = toDate(v);
  if (!d) return null;
  return differenceInCalendarDays(startOfDay(d), startOfDay(aujourdHui()));
}

export function heuresEcoulees(depuis: ISODate | Date | undefined | null, jusqua?: ISODate | Date): number | null {
  const a = toDate(depuis);
  if (!a) return null;
  const b = toDate(jusqua ?? aujourdHui()) ?? aujourdHui();
  return differenceInHours(b, a);
}

export function minutesEcoulees(depuis: ISODate | Date, jusqua: ISODate | Date): number {
  const a = toDate(depuis);
  const b = toDate(jusqua);
  if (!a || !b) return 0;
  return Math.max(0, differenceInMinutes(b, a));
}

/** Ajoute une périodicité de gamme ou de contrôle à une date. */
export function ajouterPeriode(d: Date, valeur: number, unite: UnitePeriodicite): Date {
  switch (unite) {
    case 'jours':
      return addDays(d, valeur);
    case 'semaines':
      return addWeeks(d, valeur);
    case 'mois':
      return addMonths(d, valeur);
    case 'annees':
      return addYears(d, valeur);
  }
}

export function libellePeriodicite(valeur: number, unite: UnitePeriodicite): string {
  const noms: Record<UnitePeriodicite, [string, string]> = {
    jours: ['jour', 'jours'],
    semaines: ['semaine', 'semaines'],
    mois: ['mois', 'mois'],
    annees: ['an', 'ans'],
  };
  const [s, p] = noms[unite];
  return `Tous les ${valeur > 1 ? `${valeur} ${p}` : s}`;
}

/** Rendu relatif court utilisé dans les listes : « dans 12 j », « il y a 3 j ». */
export function echeanceRelative(v: ISODate | Date | undefined | null): string {
  const j = joursRestants(v);
  if (j === null) return '—';
  if (j === 0) return "aujourd'hui";
  if (j === 1) return 'demain';
  if (j === -1) return 'hier';
  return j > 0 ? `dans ${j} j` : `il y a ${-j} j`;
}

export { addDays, addMonths, addYears, differenceInCalendarDays, format, startOfDay };
