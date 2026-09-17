import { existsSync } from 'node:fs';
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
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;

  // Ce module s'exécute depuis trois endroits selon la façon dont il a été
  // lancé : src/db en développement, dist/ pour le serveur empaqueté,
  // dist/cli pour une commande d'administration empaquetée. Compter les
  // niveaux à remonter donnait une réponse juste pour deux d'entre eux et
  // fausse pour le troisième — on cherche plutôt le dossier, en remontant.
  let dossier = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    const candidat = join(dossier, 'migrations');
    if (existsSync(candidat)) return candidat;
    const parent = dirname(dossier);
    if (parent === dossier) break;
    dossier = parent;
  }
  throw new Error(
    'Dossier des migrations introuvable. Définissez MIGRATIONS_DIR pour le désigner explicitement.',
  );
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
