/** Formatage monétaire, numérique et textuel, en français. */

const DEVISE = 'USD';

const nfMonnaie = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: DEVISE,
  maximumFractionDigits: 0,
});

const nfMonnaieDetail = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: DEVISE,
  maximumFractionDigits: 2,
});

const nfNombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nfEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function montant(v: number | undefined | null, detail = false): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return detail ? nfMonnaieDetail.format(v) : nfMonnaie.format(v);
}

export function nombre(v: number | undefined | null, decimales = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return decimales === 0 ? nfEntier.format(v) : nfNombre.format(v);
}

export function pourcent(v: number | undefined | null, decimales = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(decimales).replace('.', ',')} %`;
}

/** Durée en minutes rendue en « 3 h 25 » ou « 45 min ». */
export function duree(minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  if (h < 24) return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, '0')}`;
  const j = Math.floor(h / 24);
  return `${j} j ${h % 24} h`;
}

/** Durée en heures pour les indicateurs MTBF / MTTR. */
export function heures(h: number | undefined | null): string {
  if (h === undefined || h === null || Number.isNaN(h)) return '—';
  if (h >= 1000) return `${nfEntier.format(h)} h`;
  return `${nfNombre.format(h)} h`;
}

export function initiales(nom: string, prenom = ''): string {
  const a = (prenom || nom).trim()[0] ?? '?';
  const b = prenom ? nom.trim()[0] : (nom.trim().split(' ')[1]?.[0] ?? '');
  return `${a}${b}`.toUpperCase();
}

/** Supprime accents et casse pour la recherche plein texte locale. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function tronquer(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Pluriel simple : `pluriel(3, 'équipement')` → « 3 équipements ». */
export function pluriel(n: number, singulier: string, plurielForme?: string): string {
  const mot = n > 1 ? (plurielForme ?? `${singulier}s`) : singulier;
  return `${nfEntier.format(n)} ${mot}`;
}
