import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { microsoftAutorise } from '../integrations/collecte.ts';
import { dateSecret } from '../integrations/secrets.ts';
import { SOURCE as MICROSOFT } from '../integrations/microsoft.ts';
import { SOURCE as JOTFORM } from '../integrations/jotform.ts';

/**
 * Où en est le connecteur, en une commande.
 *
 *   npm run etat-connecteur --workspace=api
 *
 * La question « ai-je déjà les demandes des utilisateurs ? » n'a pas de
 * réponse évidente : l'application affiche des centaines de demandes, mais
 * la plupart viennent du jeu de démonstration. Celles du formulaire se
 * distinguent par leur origine, et c'est cette distinction que la commande
 * rend lisible — plus la raison, quand il n'y en a aucune.
 */

const source = config.formulaire.source === 'microsoft' ? MICROSOFT : JOTFORM;

await migrer(() => {});

const ligne = (etiquette: string, valeur: string) => console.log(`  ${etiquette.padEnd(24)}${valeur}`);

console.log('\nConnecteur');
console.log('──────────');
ligne('Fournisseur', config.formulaire.source || 'aucun');

if (!config.formulaire.source) {
  console.log(
    '\nAucun formulaire branché : renseignez FORMULAIRE_SOURCE dans .env.\n' +
      'Voir le README, section « Recevoir les demandes par formulaire ».\n',
  );
  await pool.end();
  process.exit(0);
}

let autorise = true;
if (config.formulaire.source === 'microsoft') {
  autorise = await microsoftAutorise();
  const depuis = await dateSecret(MICROSOFT);
  ligne('Acheminement', config.microsoft.mode === 'graph' ? 'classeur Excel' : 'appel entrant');
  ligne('Autorisation', autorise ? `accordée${depuis ? ` le ${depuis.slice(0, 16).replace('T', ' ')}` : ''}` : 'PAS ENCORE FAITE');
  ligne('Classeur', config.microsoft.classeur || '(non renseigné)');
}

const { rows: etat } = await pool.query(
  `SELECT derniere_lecture, dernier_horodatage, soumissions_traitees, derniere_erreur
     FROM integrations_etat WHERE source = $1`,
  [source],
);
const e = etat[0];
ligne('Dernière lecture', e?.derniere_lecture ? new Date(e.derniere_lecture).toISOString().slice(0, 16).replace('T', ' ') : 'jamais');
ligne('Repère de lecture', e?.dernier_horodatage ?? '—');
if (e?.derniere_erreur) ligne('Dernière erreur', e.derniere_erreur.slice(0, 120));

/* ------------------------------------------------------------------ */
const { rows: compte } = await pool.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE equipement_id IS NULL)::int AS sans_equipement,
          count(*) FILTER (WHERE statut IN ('nouvelle','en_analyse'))::int AS a_traiter
     FROM demandes WHERE origine_externe ->> 'source' = $1`,
  [source],
);
const c = compte[0];

console.log('\nDemandes venues du formulaire');
console.log('─────────────────────────────');
ligne('Reçues en tout', String(c.total));
ligne('À qualifier', String(c.a_traiter));
ligne('Sans équipement', String(c.sans_equipement));

if (c.total > 0) {
  const { rows: dernieres } = await pool.query(
    `SELECT numero, objet, date_creation, statut
       FROM demandes WHERE origine_externe ->> 'source' = $1
      ORDER BY date_creation DESC LIMIT 5`,
    [source],
  );
  console.log('\n  Les plus récentes :');
  for (const d of dernieres) {
    console.log(`    ${d.numero}  ${String(d.date_creation).slice(0, 16).replace('T', ' ')}  ${d.objet.slice(0, 52)}`);
  }
}

/* ------------------------------------------------------------------ */
// Le jeu de démonstration remplit la même table : sans ce rappel, on peut
// croire que les demandes affichées à l'écran viennent du formulaire.
const { rows: demo } = await pool.query(
  "SELECT count(*)::int AS n FROM demandes WHERE origine_externe IS NULL",
);
console.log('');
if (demo[0].n > 0) {
  console.log(`  ${demo[0].n} autre(s) demande(s) dans la base, qui ne viennent pas du formulaire`);
  console.log('  (jeu de démonstration ou saisies faites dans l’application).');
}

if (c.total === 0) {
  console.log('\nAucune demande du formulaire pour l’instant. La raison :');
  if (config.formulaire.source === 'microsoft' && !autorise) {
    console.log('  → la GMAO n’est pas autorisée à lire le classeur.');
    console.log('    docker compose exec api npm run lier-microsoft --workspace=api');
  } else if (!config.microsoft.classeur && config.formulaire.source === 'microsoft') {
    console.log('  → MSFORMS_CLASSEUR n’est pas renseigné.');
    console.log('    docker compose exec api npm run trouver-classeur --workspace=api');
  } else if (e?.derniere_erreur) {
    console.log(`  → la dernière lecture a échoué : ${e.derniere_erreur.slice(0, 160)}`);
  } else if (!e?.derniere_lecture) {
    console.log('  → aucune lecture n’a encore eu lieu. L’API en fait une au démarrage,');
    console.log(`    puis toutes les ${config.formulaire.intervalleMin} min.`);
  } else {
    console.log('  → la lecture fonctionne, mais le classeur ne contient rien de nouveau.');
  }
}
console.log('');

await pool.end();
