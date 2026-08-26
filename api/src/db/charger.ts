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

/**
 * La base n'a jamais reçu de données.
 *
 * Deux conditions, et il faut les deux. La table « sites » vide ne suffit
 * pas : un administrateur qui purge la base pour y verser l'inventaire réel
 * de son établissement la laisse vide un moment, et verrait le jeu de
 * démonstration revenir au premier redémarrage. La trace de peuplement dit
 * que la question a déjà été tranchée une fois, et qu'elle ne se repose plus.
 */
export async function baseEstVide(): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT (SELECT count(*)::int FROM sites) AS sites,
           (SELECT count(*)::int FROM installation WHERE cle = 'peuplement_initial') AS deja_peuplee
  `);
  return rows[0].sites === 0 && rows[0].deja_peuplee === 0;
}
