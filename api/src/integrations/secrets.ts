import { pool } from '../db/pool.ts';

/**
 * Rangement des jetons renouvelables.
 *
 * Un jeton de rafraîchissement Microsoft ne survit pas à son usage : chaque
 * renouvellement en délivre un nouveau. Le conserver en base est ce qui
 * distingue une intégration qui tient dans la durée d'une qui s'arrête au
 * premier redémarrage après la première heure.
 */

export async function lireSecret(source: string, cle: string): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT valeur FROM integrations_secrets WHERE source = $1 AND cle = $2',
    [source, cle],
  );
  return rows[0]?.valeur ?? null;
}

export async function ecrireSecret(source: string, cle: string, valeur: string): Promise<void> {
  await pool.query(
    `INSERT INTO integrations_secrets (source, cle, valeur) VALUES ($1, $2, $3)
     ON CONFLICT (source) DO UPDATE SET cle = $2, valeur = $3, mis_a_jour = now()`,
    [source, cle, valeur],
  );
}

export async function dateSecret(source: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT mis_a_jour FROM integrations_secrets WHERE source = $1', [source]);
  return rows[0]?.mis_a_jour ? new Date(rows[0].mis_a_jour).toISOString() : null;
}
