import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Toute variable lue par le code arrive-t-elle jusqu'au conteneur ?
 *
 *   npm run verifier-compose --workspace=api
 *
 * « docker-compose.yml » énumère les variables transmises à l'API, une par
 * une. Ajouter un réglage dans « config.ts » et dans « .env.example » sans
 * l'ajouter à cette liste donne la panne la plus désagréable qui soit :
 * le fichier .env est juste, le code est juste, et le conteneur ne voit
 * rien. Pas d'erreur, pas d'avertissement — la valeur par défaut s'applique
 * en silence, et on cherche ailleurs pendant une heure.
 *
 * Ce contrôle compare les deux listes. Il tourne sans base, sans réseau et
 * sans Docker.
 */

const ici = dirname(fileURLToPath(import.meta.url));
function remonter(nom: string): string {
  let dossier = ici;
  for (let i = 0; i < 6; i += 1) {
    try {
      return readFileSync(join(dossier, nom), 'utf8');
    } catch {
      dossier = dirname(dossier);
    }
  }
  throw new Error(`${nom} introuvable en remontant depuis ${ici}`);
}

const config = remonter(join('api', 'src', 'config.ts'));
const compose = remonter('docker-compose.yml');

/** Les variables que le code lit vraiment. */
const lues = [...config.matchAll(/\blire(?:Brut)?\('([A-Z0-9_]+)'/g)].map((m) => m[1]);

/** Celles que le service « api » reçoit. */
const bloc = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  web:'));
const transmises = new Set([...bloc.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]));

/**
 * Ce qui n'a pas à passer par Compose.
 *
 * Trois réglages sont fixés en dur dans le service plutôt que repris du
 * fichier .env : l'adresse d'écoute et le port, qui dépendent du réseau de
 * conteneurs et non de l'exploitant, et l'hôte de la base, qui est le nom du
 * service voisin.
 */
const horsCompose = new Set(['API_PORT', 'API_HOST', 'DB_HOST', 'DB_PORT', 'NODE_ENV']);

const absentes = [...new Set(lues)].filter((v) => !transmises.has(v) && !horsCompose.has(v));

console.log(`\n${new Set(lues).size} variable(s) lue(s) par l’API, ${transmises.size} transmise(s) par Compose.`);

if (absentes.length) {
  console.error(
    `\n✘ ${absentes.length} variable(s) lue(s) par le code mais absente(s) du service « api » :\n`,
  );
  for (const v of absentes) console.error(`    ${v}: \${${v}:-}`);
  console.error(
    '\n  Tant qu’elles n’y figurent pas, les renseigner dans .env ne change rien :\n' +
      '  le conteneur applique la valeur par défaut, sans rien dire.\n' +
      '  À ajouter dans docker-compose.yml, service « api », sous « environment: ».\n',
  );
  process.exit(1);
}

console.log('\n✔ Toute variable lue par l’API lui est transmise.\n');
