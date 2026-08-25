import type { BaseGMAO } from '@/types/domain';

/**
 * Persistance locale : la base complète est stockée dans IndexedDB sous une
 * clé unique. Le volume visé (quelques milliers d'enregistrements) tient
 * confortablement en mémoire, ce qui permet d'écrire des sélecteurs en TypeScript
 * pur plutôt que des requêtes.
 *
 * Le jour où un serveur est branché, seule cette couche change : les actions
 * de `data/actions.ts` continuent de travailler sur un objet `BaseGMAO`.
 */

const NOM_BASE = 'gmao-hopital';
const NOM_STORE = 'etat';
const CLE = 'base';
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

export async function chargerBase(): Promise<BaseGMAO | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await ouvrir();
    return await new Promise<BaseGMAO | null>((resolve, reject) => {
      const tx = db.transaction(NOM_STORE, 'readonly');
      const req = tx.objectStore(NOM_STORE).get(CLE);
      req.onsuccess = () => resolve((req.result as BaseGMAO) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function enregistrerBase(base: BaseGMAO): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await ouvrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOM_STORE, 'readwrite');
      tx.objectStore(NOM_STORE).put(base, CLE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('GMAO : sauvegarde locale impossible', e);
  }
}

export async function effacerBase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await ouvrir();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NOM_STORE, 'readwrite');
    tx.objectStore(NOM_STORE).delete(CLE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Export d'audit : la base entière, horodatée, en JSON. */
export function exporterJSON(base: BaseGMAO): string {
  return JSON.stringify(base, null, 2);
}

export function importerJSON(texte: string): BaseGMAO {
  const objet = JSON.parse(texte) as BaseGMAO;
  if (!objet || !Array.isArray(objet.equipements)) {
    throw new Error("Le fichier ne contient pas une base GMAO valide (clé « equipements » absente).");
  }
  return objet;
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
  return [
    colonnes.join(';'),
    ...lignes.map((l) => colonnes.map((c) => echapper(l[c])).join(';')),
  ].join('\r\n');
}
