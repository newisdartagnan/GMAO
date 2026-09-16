import { createInterface } from 'node:readline/promises';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { ecrireSecret, lireSecret } from '../integrations/secrets.ts';
import {
  SOURCE,
  attendreAutorisation,
  cheminClasseur,
  definirEnregistrementRefresh,
  demanderCodeAppareil,
} from '../integrations/microsoft.ts';

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

const manque: string[] = [];
if (!config.microsoft.clientId) manque.push('MSFORMS_CLIENT_ID');
if (!config.microsoft.classeur) manque.push('MSFORMS_CLASSEUR');
if (manque.length) {
  console.error(`\nÀ renseigner d'abord dans .env : ${manque.join(', ')}\n`);
  process.exit(1);
}

try {
  cheminClasseur(config.microsoft.classeur);
} catch (e) {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
}

await migrer(() => {});

const options = {
  tenantId: config.microsoft.tenantId || 'consumers',
  clientId: config.microsoft.clientId,
  jetonBase: config.microsoft.jetonBase,
};

console.log(`\nInscription  : ${options.clientId}`);
console.log(`Locataire    : ${options.tenantId}${options.tenantId === 'consumers' ? ' (compte Microsoft personnel)' : ''}`);
console.log(`Classeur     : ${config.microsoft.classeur}\n`);

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
definirEnregistrementRefresh((jeton) => ecrireSecret(SOURCE, 'refresh_token', jeton));

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
process.stdout.write('Lecture du classeur… ');
try {
  const jeton = accessToken;
  const url = `${config.microsoft.graphBase}${cheminClasseur(config.microsoft.classeur)}/workbook/tables`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
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
  console.error('Vérifiez MSFORMS_CLASSEUR, et que le compte autorisé est bien celui qui possède le fichier.\n');
  await pool.end();
  process.exit(1);
}

console.log('\nLe connecteur est prêt. Démarrez l’API : docker compose up -d api\n');
await pool.end();
