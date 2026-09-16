import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { microsoftAutorise, optionsMicrosoft } from '../integrations/collecte.ts';
import { obtenirJeton, trouverClasseurs } from '../integrations/microsoft.ts';

/**
 * Liste les classeurs que le compte autorisé peut lire.
 *
 *   npm run trouver-classeur --workspace=api
 *
 * Répond à la seule question difficile de la configuration : quoi mettre dans
 * MSFORMS_CLASSEUR. Le chemin se devine mal — le nom porte des accents, des
 * espaces et deux tirets, et le classeur d'un formulaire détenu ailleurs ne
 * se trouve pas dans le OneDrive de celui qui le lit. Plutôt que de faire
 * chercher dans l'explorateur Graph, on demande à Microsoft et on imprime la
 * ligne à coller.
 */

if (!config.microsoft.clientId) {
  console.error('\nÀ renseigner d’abord dans .env : MSFORMS_CLIENT_ID\n');
  process.exit(1);
}

await migrer(() => {});

if (!(await microsoftAutorise())) {
  console.error(
    '\nLa GMAO n’est pas encore autorisée. Lancez d’abord :\n' +
      '    npm run lier-microsoft --workspace=api\n',
  );
  await pool.end();
  process.exit(1);
}

// Par optionsMicrosoft, jamais à la main : c'est ce qui garantit que le
// jeton renouvelé au passage sera conservé.
const jeton = await obtenirJeton(await optionsMicrosoft({ classeur: 'me:/' }));

const classeurs = await trouverClasseurs(jeton, config.microsoft.graphBase);

if (!classeurs.length) {
  console.log(
    '\nAucun classeur Excel visible par le compte autorisé.\n\n' +
      'Si le formulaire appartient à un autre compte, il faut que ce compte\n' +
      'partage le classeur des réponses avec celui qui a autorisé la GMAO —\n' +
      'un partage en lecture suffit. Ou alors autoriser la GMAO avec le\n' +
      'compte propriétaire du formulaire :\n' +
      '    npm run lier-microsoft --workspace=api\n',
  );
  await pool.end();
  process.exit(0);
}

const propres = classeurs.filter((c) => c.provenance === 'propre');
const partages = classeurs.filter((c) => c.provenance === 'partage');

const afficher = (titre: string, liste: typeof classeurs) => {
  if (!liste.length) return;
  console.log(`\n${titre}`);
  console.log('─'.repeat(titre.length));
  for (const c of liste) {
    console.log(`\n  ${c.nom}`);
    if (c.proprietaire) console.log(`    de ${c.proprietaire}`);
    if (c.modifieLe) console.log(`    modifié le ${c.modifieLe.slice(0, 16).replace('T', ' ')}`);
    console.log(`    MSFORMS_CLASSEUR=${c.reference}`);
  }
};

afficher('Dans le OneDrive du compte autorisé', propres);
afficher('Partagés avec le compte autorisé', partages);

console.log(
  '\nCopiez la ligne du classeur des réponses dans .env, puis :\n' +
    '    ./scripts/mettre-a-jour.sh\n',
);

await pool.end();
