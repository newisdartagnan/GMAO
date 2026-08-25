import type { BaseGMAO } from '@gmao/partage';
import { pool } from './pool.ts';
import type { Client } from './pool.ts';
import { COLLECTIONS } from './collections.ts';
import { versCamel } from './nommage.ts';

/**
 * Reconstruit l'agrégat complet à partir des tables.
 *
 * Les colonnes NULL sont supprimées plutôt que converties en `null` : le
 * modèle TypeScript décrit ses champs facultatifs avec `?`, et garder cette
 * distinction permet de comparer un objet lu à un objet produit par
 * l'application sans faux écart.
 */
function versEntite(ligne: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [colonne, valeur] of Object.entries(ligne)) {
    if (valeur === null) continue;
    out[versCamel(colonne)] = valeur;
  }
  return out;
}

/** Colonnes techniques qui ne remontent jamais au client. */
const COLONNES_MASQUEES: Record<string, string[]> = {
  utilisateurs: ['mot_de_passe_hash', 'derniere_connexion'],
};

export async function chargerBase(client?: Client): Promise<BaseGMAO> {
  const q = client ?? pool;
  const base = { version: 1, dateGeneration: new Date().toISOString() } as unknown as BaseGMAO;

  for (const { cle, table } of COLLECTIONS) {
    const masquees = COLONNES_MASQUEES[table] ?? [];
    const { rows } = await q.query(`SELECT * FROM ${table}`);
    const entites = rows.map((l: Record<string, unknown>) => {
      for (const m of masquees) delete l[m];
      return versEntite(l);
    });
    (base as unknown as Record<string, unknown>)[cle] = entites;
  }

  return base;
}

export async function baseEstVide(): Promise<boolean> {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sites');
  return rows[0].n === 0;
}
