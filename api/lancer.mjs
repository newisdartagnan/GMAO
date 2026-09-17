#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lanceur des commandes d'administration.
 *
 * Les mêmes commandes doivent tourner à deux endroits qui n'ont pas le même
 * contenu : en développement depuis les sources TypeScript, et dans le
 * conteneur de production, qui ne contient ni sources ni outil de
 * compilation — l'image n'embarque que le paquet compilé et les dépendances
 * d'exécution.
 *
 * Appeler « tsx » directement marchait donc en développement et échouait dans
 * le conteneur, sur un « tsx: not found » qui ne dit pas pourquoi. Ce lanceur
 * choisit.
 *
 * Il préfère les SOURCES quand elles sont là, et ne se rabat sur le paquet
 * compilé qu'à défaut. L'ordre inverse paraissait plus naturel — le compilé
 * d'abord — mais il fait tourner du code périmé dès qu'on modifie une source
 * sans reconstruire, sans rien dire. En développement les sources sont
 * présentes et font foi ; l'image de production n'en a pas, et prend le
 * paquet.
 */

const ici = dirname(fileURLToPath(import.meta.url));
const [nom, ...arguments_] = process.argv.slice(2);

const COMMANDES = [
  'migrer',
  'seed',
  'verifier-mapping',
  'verifier-formulaires',
  'lier-microsoft',
  'trouver-classeur',
];

/**
 * « --liste » sert de contrôle de bonne santé : il dit ce que cette image
 * sait faire, et sort en succès. Un appel sans argument sortait en erreur,
 * ce qui obligeait l'appelant à distinguer « commande absente » de « usage
 * incorrect » — distinction qu'un script shell rate facilement.
 */
if (nom === '--liste') {
  for (const c of COMMANDES) {
    const dispo =
      existsSync(join(ici, 'src', 'cli', `${c}.ts`)) || existsSync(join(ici, 'dist', 'cli', `${c}.js`));
    console.log(`${dispo ? 'ok ' : '-- '}${c}`);
  }
  process.exit(0);
}

if (!nom) {
  console.error('Usage : node lancer.mjs <commande> [arguments]');
  console.error(`Commandes : ${COMMANDES.join(', ')}`);
  process.exit(2);
}

const compile = join(ici, 'dist', 'cli', `${nom}.js`);
const source = join(ici, 'src', 'cli', `${nom}.ts`);

/** Le binaire tsx, cherché dans les node_modules en remontant. */
function chercherTsx() {
  const nomBinaire = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  let dossier = ici;
  for (let i = 0; i < 5; i += 1) {
    const candidat = join(dossier, 'node_modules', '.bin', nomBinaire);
    if (existsSync(candidat)) return candidat;
    const parent = dirname(dossier);
    if (parent === dossier) break;
    dossier = parent;
  }
  return null;
}

let commande;
let parametres;

const tsx = existsSync(source) ? (chercherTsx() ?? 'tsx') : null;

if (existsSync(source) && tsx) {
  // « npm run » met node_modules/.bin sur le PATH, mais un appel direct à
  // « node lancer.mjs » ne l'a pas : on cherche tsx dans l'arborescence avant
  // de s'en remettre au PATH.
  commande = tsx;
  parametres = [source, ...arguments_];
} else if (existsSync(compile)) {
  commande = process.execPath;
  parametres = [compile, ...arguments_];
} else {
  console.error(
    `Commande « ${nom} » introuvable.\n` +
      `  attendu : ${compile}\n` +
      `        ou : ${source}\n\n` +
      `Dans le conteneur, une commande absente signifie une image antérieure\n` +
      `au dernier « git pull ». Reconstruire : ./scripts/mettre-a-jour.sh`,
  );
  process.exit(127);
}

const enfant = spawn(commande, parametres, {
  stdio: 'inherit',
  // Sur Windows, un binaire de node_modules/.bin est un script shell.
  shell: process.platform === 'win32',
});
enfant.on('error', (e) => {
  console.error(`Lancement impossible : ${e.message}`);
  process.exit(127);
});
enfant.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
