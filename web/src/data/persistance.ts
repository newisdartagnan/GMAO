import type { BaseGMAO } from '@gmao/partage';

/**
 * Cache local du dernier instantané reçu.
 *
 * L'application est servie sur un réseau d'établissement qui n'est pas
 * toujours disponible. Conserver le dernier état permet d'ouvrir la GMAO en
 * consultation même quand le serveur ne répond pas : on peut retrouver la
 * fiche d'un équipement ou le dernier compte rendu d'intervention. Aucune
 * écriture n'est possible dans ce mode — la source de vérité reste
 * PostgreSQL.
 */

const NOM_BASE = 'gmao-hopital';
const NOM_STORE = 'etat';
const CLE = 'instantane';
const VERSION_IDB = 1;

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, VERSION_IDB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOM_STORE)) db.createObjectStore(NOM_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function lireCache(): Promise<{ base: BaseGMAO; date: string } | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await ouvrir();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(NOM_STORE, 'readonly').objectStore(NOM_STORE).get(CLE);
      req.onsuccess = () => resolve((req.result as { base: BaseGMAO; date: string }) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function ecrireCache(base: BaseGMAO): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await ouvrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOM_STORE, 'readwrite');
      tx.objectStore(NOM_STORE).put({ base, date: new Date().toISOString() }, CLE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota dépassé ou stockage refusé : le cache est un confort, pas un dû */
  }
}

export async function viderCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await ouvrir();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(NOM_STORE, 'readwrite');
      tx.objectStore(NOM_STORE).delete(CLE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* rien à faire */
  }
}

/* ------------------------------------------------------------------ */
/* Exports de fichiers                                                 */
/* ------------------------------------------------------------------ */

export function exporterJSON(base: BaseGMAO): string {
  return JSON.stringify(base, null, 2);
}

/** Téléchargement navigateur d'un contenu texte (export CSV ou JSON). */
export function telecharger(nomFichier: string, contenu: string, type = 'application/json'): void {
  const blob = new Blob([contenu], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Sérialisation CSV avec séparateur point-virgule (attendu par Excel FR). */
export function versCSV(lignes: Record<string, unknown>[]): string {
  if (!lignes.length) return '';
  const colonnes = Object.keys(lignes[0]);
  const echapper = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colonnes.join(';'), ...lignes.map((l) => colonnes.map((c) => echapper(l[c])).join(';'))].join('\r\n');
}
