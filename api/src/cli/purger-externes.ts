import { createInterface } from 'node:readline/promises';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';

/**
 * Retire des demandes venues du formulaire, par numéro de réponse.
 *
 *   npm run purger-externes --workspace=api -- --jusqua 869
 *   npm run purger-externes --workspace=api -- --tout
 *
 * Un classeur en service depuis des mois porte son historique. S'il entre
 * d'un coup dans la GMAO, la file se remplit de demandes réglées depuis
 * longtemps, et rien ne permet de les ressortir autrement qu'une à une.
 *
 * Ne sont retirées que les demandes encore intactes : celles qu'on a
 * commencé à traiter — acceptées, refusées, transformées en ordre de travail
 * — sont laissées en place et comptées à part. Ce qui a été décidé par
 * quelqu'un ne s'efface pas sur un argument de ligne de commande.
 */

const args = process.argv.slice(2);
const tout = args.includes('--tout');
const iJusqua = args.indexOf('--jusqua');
const jusqua = iJusqua >= 0 ? args[iJusqua + 1] : undefined;

if (!tout && !jusqua) {
  console.error(
    '\nIndiquez ce qu’il faut retirer :\n' +
      '    --jusqua <numéro>   les réponses jusqu’à ce numéro inclus\n' +
      '    --tout              toutes les demandes venues du formulaire\n',
  );
  process.exit(1);
}
if (jusqua !== undefined && !/^\d+$/.test(jusqua)) {
  console.error(`\n« ${jusqua ?? ''} » n’est pas un numéro de réponse.\n`);
  process.exit(1);
}

await migrer(() => {});

const source = config.formulaire.source === 'microsoft' ? 'microsoft-forms' : config.formulaire.source;
// Le numéro de réponse est du texte en JSON : le comparer tel quel classerait
// « 9 » après « 871 ». La conversion échouerait sur un identifiant non
// numérique — JotForm en produit — d'où le filtre sur le format d'abord.
const portee = tout
  ? { clause: '', valeurs: [source] }
  : {
      clause: " AND origine_externe ->> 'soumissionId' ~ '^[0-9]+$'" +
        " AND (origine_externe ->> 'soumissionId')::bigint <= $2::bigint",
      valeurs: [source, jusqua!],
    };

const { rows } = await pool.query<{ statut: string; combien: string; plus_petit: string; plus_grand: string }>(
  // Les bornes se calculent en nombre, pas en texte : « 99 » passerait sinon
  // après « 871 », et l'aperçu annoncerait une plage qui n'existe pas — juste
  // avant de demander de confirmer une suppression.
  `SELECT statut,
          count(*) AS combien,
          min(CASE WHEN origine_externe ->> 'soumissionId' ~ '^[0-9]+$'
                   THEN (origine_externe ->> 'soumissionId')::bigint END)::text AS plus_petit,
          max(CASE WHEN origine_externe ->> 'soumissionId' ~ '^[0-9]+$'
                   THEN (origine_externe ->> 'soumissionId')::bigint END)::text AS plus_grand
     FROM demandes
    WHERE origine_externe ->> 'source' = $1${portee.clause}
    GROUP BY statut
    ORDER BY statut`,
  portee.valeurs,
);

if (!rows.length) {
  console.log('\nAucune demande venue du formulaire ne correspond.\n');
  await pool.end();
  process.exit(0);
}

const titre = (t: string) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

titre('Demandes venues du formulaire');
let effacables = 0;
let gardees = 0;
for (const r of rows) {
  const n = Number(r.combien);
  const intacte = r.statut === 'nouvelle';
  if (intacte) effacables += n;
  else gardees += n;
  // Un identifiant non numérique — JotForm en produit — n'a pas de borne.
  const plage = r.plus_petit ? `réponses ${r.plus_petit} à ${r.plus_grand}` : '';
  console.log(
    `  ${r.statut.padEnd(14)}${String(n).padStart(6)}   ${plage.padEnd(26)}` +
      (intacte ? '← à retirer' : '· déjà traitée, conservée'),
  );
}

if (!effacables) {
  console.log('\nRien à retirer : tout ce qui correspond a déjà été traité.\n');
  await pool.end();
  process.exit(0);
}

console.log(
  `\n${effacables} demande(s) seront supprimées définitivement.` +
    (gardees ? ` ${gardees} déjà traitée(s) resteront en place.` : ''),
);
console.log('\nUne suppression ne se rattrape pas. Sauvegardez d’abord :\n    ./scripts/sauvegarder.sh');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const reponse = await rl.question('\nTapez « supprimer » pour confirmer : ');
rl.close();
if (reponse.trim().toLowerCase() !== 'supprimer') {
  console.log('\nRien n’a été supprimé.\n');
  await pool.end();
  process.exit(0);
}

const { rowCount } = await pool.query(
  `DELETE FROM demandes
    WHERE origine_externe ->> 'source' = $1${portee.clause}
      AND statut = 'nouvelle'
      AND ot_id IS NULL`,
  portee.valeurs,
);

console.log(`\n${rowCount} demande(s) supprimée(s).`);
console.log(
  '\nL’API sert la base depuis sa mémoire : elle continuera d’afficher les\n' +
    'demandes supprimées jusqu’à ce qu’elle relise.\n\n' +
    '    docker compose restart api\n' +
    '  ou Paramètres → Base de données → Recharger depuis la base\n',
);

await pool.end();
