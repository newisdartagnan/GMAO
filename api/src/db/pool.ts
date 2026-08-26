import pg from 'pg';
import { config } from '../config.ts';

/**
 * Les colonnes numériques de PostgreSQL (`numeric`) arrivent par défaut sous
 * forme de chaîne, pour ne pas perdre de précision. Le modèle métier travaille
 * en nombres JavaScript : on convertit à la lecture, les montants manipulés
 * (quelques centaines de milliers au plus) restant très en deçà de la limite
 * de précision d'un double.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  host: config.bdd.hote,
  port: config.bdd.port,
  database: config.bdd.base,
  user: config.bdd.utilisateur,
  password: config.bdd.motDePasse,
  max: config.bdd.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type Client = pg.PoolClient;

/** Exécute une fonction dans une transaction, avec rollback en cas d'erreur. */
export async function transaction<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Attend que la base réponde : le conteneur applicatif démarre souvent avant elle. */
export async function attendreBase(tentatives = 30, delaiMs = 2000): Promise<void> {
  for (let i = 1; i <= tentatives; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i === tentatives) throw e;
      await new Promise((r) => setTimeout(r, delaiMs));
    }
  }
}
