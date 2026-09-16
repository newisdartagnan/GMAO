import { createInterface } from 'node:readline/promises';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { ecrireSecret, lireSecret } from '../integrations/secrets.ts';
import {
  SOURCE,
  attendreAutorisation,
  cheminClasseur,
  demanderCodeAppareil,
  trouverClasseurs,
} from '../integrations/microsoft.ts';
import { optionsMicrosoft } from '../integrations/collecte.ts';

/**
 * Autorisation initiale du connecteur Microsoft.
 *
 *   npm run lier-microsoft --workspace=api
 *
 * À lancer une seule fois, depuis le serveur. La GMAO n'a pas d'adresse
 * publique où Microsoft pourrait la renvoyer après authentification : le flux
 * « code d'appareil » contourne cela — un code s'affiche ici, la personne le
 * saisit dans son navigateur, et le serveur reçoit son autorisation.
 *
 * Ce qui en sort est rangé en base, pas dans le fichier .env : Microsoft fait
 * tourner ce jeton à chaque renouvellement.
 */

if (!config.microsoft.clientId) {
  console.error("\nÀ renseigner d'abord dans .env : MSFORMS_CLIENT_ID\n");
  process.exit(1);
}

// MSFORMS_CLASSEUR n'est pas exigé ici : on ne peut pas toujours le
// connaître avant d'être autorisé — le classeur d'un formulaire détenu par
// un autre compte n'est visible qu'une fois le jeton obtenu. L'autorisation
// d'abord, « trouver-classeur » ensuite.
if (config.microsoft.classeur) {
  try {
    cheminClasseur(config.microsoft.classeur);
  } catch (e) {
    console.error(`\n${(e as Error).message}\n`);
    process.exit(1);
  }
}

await migrer(() => {});

const options = {
  tenantId: config.microsoft.tenantId || 'common',
  clientId: config.microsoft.clientId,
  portee: config.microsoft.portee,
  jetonBase: config.microsoft.jetonBase,
};

console.log(`\nInscription  : ${options.clientId}`);
console.log(`Locataire    : ${options.tenantId}${options.tenantId === 'common' ? ' (comptes professionnels et personnels)' : ''}`);
console.log(`Portée       : ${options.portee}`);
console.log(`Classeur     : ${config.microsoft.classeur || '(pas encore renseigné)'}\n`);

const dejaLie = await lireSecret(SOURCE, 'refresh_token');
if (dejaLie) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const reponse = await rl.question('Un compte est déjà lié. Le remplacer ? [o/N] ');
  rl.close();
  if (!/^o(ui)?$/i.test(reponse.trim())) {
    console.log('Inchangé.\n');
    await pool.end();
    process.exit(0);
  }
}

// Microsoft remplace le jeton de rafraîchissement à chaque échange et
// invalide le précédent. Tout ce qui en produit un doit le ranger aussitôt,
// sinon la liaison est morte avant d'avoir servi.
await optionsMicrosoft();

const demande = await demanderCodeAppareil(options);

console.log('┌──────────────────────────────────────────────────────────────┐');
console.log('│  Ouvrez cette adresse dans un navigateur :                   │');
console.log(`│      ${demande.verification_uri.padEnd(56)}│`);
console.log('│  Connectez-vous avec le compte propriétaire du classeur,     │');
console.log('│  puis saisissez ce code :                                    │');
console.log(`│      ${demande.user_code.padEnd(56)}│`);
console.log('└──────────────────────────────────────────────────────────────┘');
console.log(`\nEn attente… (le code expire dans ${Math.round(demande.expires_in / 60)} min)`);

const { refreshToken, accessToken } = await attendreAutorisation(options, demande);
await ecrireSecret(SOURCE, 'refresh_token', refreshToken);
console.log('\nAutorisation reçue et enregistrée en base.');

// Éprouver tout de suite : une autorisation qui ne donne pas accès au
// classeur vaut mieux être découverte ici qu'au premier tour de collecte.
//
// Le contrôle réutilise le jeton d'accès que l'autorisation vient de rendre,
// plutôt que d'en demander un nouveau : un échange de rafraîchissement ferait
// tourner le jeton, et celui qu'on vient d'enregistrer serait déjà périmé.
if (!config.microsoft.classeur) {
  // Sans classeur déclaré, on montre ce que le compte peut lire : c'est
  // précisément ce qu'on ne pouvait pas savoir avant d'être autorisé.
  console.log('\nClasseurs lisibles par ce compte :');
  const trouves = await trouverClasseurs(accessToken, config.microsoft.graphBase);
  if (!trouves.length) {
    console.log('  aucun classeur Excel visible.');
    console.log(
      '\n  Si le formulaire appartient à un autre compte, faites-lui partager\n' +
        '  le classeur des réponses avec celui-ci — un partage en lecture suffit.\n',
    );
  } else {
    for (const c of trouves) {
      console.log(`\n  ${c.nom}${c.proprietaire ? ` — de ${c.proprietaire}` : ''}`);
      console.log(`    MSFORMS_CLASSEUR=${c.reference}`);
    }
    console.log('\n  Copiez la bonne ligne dans .env, puis : ./scripts/mettre-a-jour.sh\n');
  }
  await pool.end();
  process.exit(0);
}

// Éprouver tout de suite : une autorisation qui ne donne pas accès au
// classeur vaut mieux être découverte ici qu'au premier tour de collecte.
//
// Le contrôle réutilise le jeton d'accès que l'autorisation vient de rendre,
// plutôt que d'en demander un nouveau : un échange de rafraîchissement ferait
// tourner le jeton, et celui qu'on vient d'enregistrer serait déjà périmé.
process.stdout.write('Lecture du classeur… ');
try {
  const url = `${config.microsoft.graphBase}${cheminClasseur(config.microsoft.classeur)}/workbook/tables`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const corps = (await r.json().catch(() => ({}))) as {
    value?: { name: string }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(corps.error?.message ?? `HTTP ${r.status}`);

  const tables = (corps.value ?? []).map((t) => t.name);
  console.log(tables.length ? `${tables.length} tableau(x) : ${tables.join(', ')}` : 'aucun tableau');
  if (tables.length && !tables.includes(config.microsoft.tableau)) {
    console.log(
      `\nMSFORMS_TABLEAU vaut « ${config.microsoft.tableau} », absent du classeur.\n` +
        `Mettez-y « ${tables[0]} ».`,
    );
  }
} catch (e) {
  console.log('échec');
  console.error(`\nLe compte est lié, mais le classeur reste inaccessible :\n  ${(e as Error).message}\n`);

  // Plutôt que de renvoyer à la documentation, montrer ce qui est lisible :
  // neuf fois sur dix la bonne ligne est dans cette liste.
  const trouves = await trouverClasseurs(accessToken, config.microsoft.graphBase);
  if (trouves.length) {
    console.error('Ce compte voit ces classeurs :');
    for (const c of trouves) {
      console.error(`  ${c.nom}${c.proprietaire ? ` — de ${c.proprietaire}` : ''}`);
      console.error(`    MSFORMS_CLASSEUR=${c.reference}`);
    }
    console.error('');
  } else {
    console.error(
      'Ce compte ne voit aucun classeur Excel. Si le formulaire appartient à un\n' +
        'autre compte, faites-lui partager le classeur des réponses — un partage\n' +
        'en lecture suffit — ou autorisez la GMAO avec ce compte-là.\n',
    );
  }
  await pool.end();
  process.exit(1);
}

console.log('\nLe connecteur est prêt. Démarrez l’API : docker compose up -d api\n');
await pool.end();
