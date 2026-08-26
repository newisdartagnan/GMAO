import { attendreBase, pool } from '../db/pool.ts';
import { migrer } from '../db/migrations.ts';
import { baseEstVide } from '../db/charger.ts';
import { peupler } from '../peuplement.ts';

/**
 * Peuple la base. Sans argument, refuse d'écraser des données existantes ;
 * `--remplacer` vide les tables métier au préalable.
 */
const remplacer = process.argv.includes('--remplacer');

await attendreBase();
await migrer();

if (!remplacer && !(await baseEstVide())) {
  console.error(
    'La base contient déjà des données. Relancer avec --remplacer pour les écraser (opération irréversible).',
  );
  await pool.end();
  process.exit(1);
}

const debut = Date.now();
const resume = await peupler(remplacer);
console.log(
  `${resume.entites} enregistrements écrits en ${((Date.now() - debut) / 1000).toFixed(1)} s — ` +
    `${resume.equipements} équipements, ${resume.ordresTravail} ordres de travail, ${resume.rondes} rondes, ` +
    `${resume.comptes} comptes ouverts.`,
);
await pool.end();
