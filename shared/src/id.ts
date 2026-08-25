/** Générateur d'identifiants et de numéros métier (OT, DI, BC…). */

let compteur = 0;

export function uid(prefixe = 'id'): string {
  compteur += 1;
  const alea = Math.random().toString(36).slice(2, 8);
  return `${prefixe}_${Date.now().toString(36)}${compteur.toString(36)}${alea}`;
}

/**
 * Numérotation métier lisible : OT-2026-00412.
 * `existants` sert à repartir du plus grand numéro déjà attribué.
 */
export function numeroSuivant(prefixe: string, annee: number, existants: string[]): string {
  const motif = new RegExp(`^${prefixe}-${annee}-(\\d+)$`);
  let max = 0;
  for (const n of existants) {
    const m = motif.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefixe}-${annee}-${String(max + 1).padStart(5, '0')}`;
}

/** Jeton porté par l'étiquette QR collée sur l'équipement. */
export function jetonQR(code: string): string {
  return `GMAO:${code}`;
}
