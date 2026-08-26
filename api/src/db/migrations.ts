import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './pool.ts';

/**
 * Applique les fichiers SQL de `migrations/` dans l'ordre de leur nom, une
 * seule fois chacun. Le suivi tient dans une table : pas de dépendance à un
 * outil externe, et l'administrateur peut vérifier l'état d'un simple SELECT.
 */

function dossierMigrations(): string {
  // En développement le fichier est sous src/db, une fois empaqueté il est
  // dans dist/ : les migrations sont cherchées à côté de la racine du paquet.
  const ici = dirname(fileURLToPath(import.meta.url));
  return process.env.MIGRATIONS_DIR ?? join(ici, ici.endsWith('db') ? '../../migrations' : '../migrations');
}

export async function migrer(journaliser: (m: string) => void = console.log): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      applique_le timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dossier = dossierMigrations();
  const fichiers = (await readdir(dossier)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const deja = new Set(rows.map((r: { version: string }) => r.version));

  const appliquees: string[] = [];
  for (const fichier of fichiers) {
    if (deja.has(fichier)) continue;
    const sql = await readFile(join(dossier, fichier), 'utf8');
    await transaction(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [fichier]);
    });
    journaliser(`migration appliquée : ${fichier}`);
    appliquees.push(fichier);
  }

  if (!appliquees.length) journaliser('schéma déjà à jour');
  return appliquees;
}
