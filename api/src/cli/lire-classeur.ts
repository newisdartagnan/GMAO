import { DOMAINE, PRIORITE, construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO, DemandeIntervention } from '@gmao/partage';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { chargerBase } from '../db/charger.ts';
import {
  comptePorteur,
  lireEtatIntegration,
  marquerCommeLu,
  microsoftAutorise,
  optionsMicrosoft,
} from '../integrations/collecte.ts';
import { apercuClasseur, lireLigneClasseur } from '../integrations/microsoft.ts';
import { chargerCorrespondance, convertirSoumission } from '../integrations/formulaires.ts';

/**
 * Lecture à blanc du classeur des réponses.
 *
 *   npm run lire-classeur --workspace=api
 *   npm run lire-classeur --workspace=api -- --marquer-comme-lu
 *
 * Savoir qu'on voit un fichier ne dit pas qu'on sait l'ouvrir, y trouver le
 * bon tableau et lire ses lignes. Cette commande montre le contenu réel —
 * colonnes, dernières réponses — puis ce que la GMAO en ferait, sans rien
 * écrire. C'est la seule vérification qui prouve la chaîne de bout en bout
 * avant qu'une demande n'entre en base.
 */

/**
 * Poser le repère sur la dernière réponse, au lieu de simplement regarder.
 *
 * Utile une fois, à la mise en service d'un classeur qui tourne déjà : sans
 * cela le premier tour de collecte prend tout l'historique pour du nouveau.
 */
const marquer = process.argv.slice(2).includes('--marquer-comme-lu');

if (config.formulaire.source !== 'microsoft') {
  console.error('\nCette commande ne concerne que FORMULAIRE_SOURCE=microsoft.\n');
  process.exit(1);
}
if (!config.microsoft.classeur) {
  console.error(
    '\nMSFORMS_CLASSEUR n’est pas renseigné.\n' +
      '    npm run trouver-classeur --workspace=api\n',
  );
  process.exit(1);
}

await migrer(() => {});

if (!(await microsoftAutorise())) {
  console.error(
    '\nLa GMAO n’est pas autorisée. Lancez d’abord :\n' +
      '    npm run lier-microsoft --workspace=api\n',
  );
  await pool.end();
  process.exit(1);
}

const titre = (t: string) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

/** Mêmes mots qu'à l'écran : la lecture à blanc doit se relire dans l'application. */
const IMPACT: Record<DemandeIntervention['impactPatient'], string> = {
  aucun: 'aucun impact',
  gene: 'gêne organisationnelle',
  report_soin: 'report de soin',
  risque_vital: 'risque vital',
};

let apercu;
try {
  apercu = await apercuClasseur(await optionsMicrosoft(), 3);
} catch (e) {
  const raison = (e as Error).message;
  console.error(`\nLecture impossible :\n  ${raison}\n`);
  // Le conseil ne vaut que pour une référence qui ne désigne rien. L'afficher
  // sur un jeton expiré enverrait chercher un classeur qui n'a jamais bougé.
  if (/404|itemnotfound/i.test(raison)) {
    console.error(
      'La référence ne désigne aucun fichier accessible. Relevez-la sans la\n' +
        'saisir à la main :\n' +
        '    npm run trouver-classeur --workspace=api\n',
    );
  } else if (/Impossible de joindre/.test(raison)) {
    // Rien n'est parti : c'est la sortie du conteneur, pas la configuration
    // du connecteur. Le contrôle tient en une ligne, depuis le conteneur
    // lui-même — le faire depuis la machine hôte ne prouverait rien.
    console.error(
      'La GMAO n’a pas pu sortir du conteneur. Rien à voir avec le classeur :\n' +
        'la configuration Microsoft n’a même pas été soumise.\n\n' +
        '  docker compose exec api node -e "fetch(\'https://login.microsoftonline.com\')' +
        '.then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code??e.message))"\n\n' +
        'Si cela répond un code plutôt qu’un nombre, la cause est en amont de la\n' +
        'GMAO : DNS du démon Docker, pare-feu sortant, ou proxy d’entreprise.\n',
    );
  }
  await pool.end();
  process.exit(1);
}

titre('Classeur');
console.log(`  Référence     ${config.microsoft.classeur}`);
console.log(`  Nom           ${apercu.nom ?? '(inconnu)'}`);
console.log(`  Modifié le    ${apercu.modifieLe?.slice(0, 16).replace('T', ' ') ?? '—'}`);

titre('Tableaux');
if (!apercu.tableaux.length) {
  console.log('  Aucun tableau nommé dans ce classeur.');
  console.log('\n  Les réponses de Forms arrivent normalement dans un tableau. Sans lui,');
  console.log('  la GMAO ne sait pas où lire. Ouvrez le classeur, sélectionnez la plage');
  console.log('  des réponses, puis Insertion → Tableau, et notez son nom dans');
  console.log('  MSFORMS_TABLEAU.');
  await pool.end();
  process.exit(1);
}
for (const t of apercu.tableaux) {
  const marque = t === apercu.tableauLu ? ' ← lu' : '';
  console.log(`  ${t}${marque}`);
}
if (apercu.tableauLu !== config.microsoft.tableau) {
  console.log(
    `\n  MSFORMS_TABLEAU vaut « ${config.microsoft.tableau} », absent du classeur.\n` +
      `  Mettez-y « ${apercu.tableauLu} ».`,
  );
}

titre(`Colonnes (${apercu.colonnes.length})`);
apercu.colonnes.forEach((c, i) => {
  const service = apercu.colonnesDeService.includes(c) || i === 0;
  console.log(`  ${String(i + 1).padStart(2)}  ${service ? `${c.padEnd(34)}· colonne de service` : c}`);
});

titre(`Réponses (${apercu.total} en tout, ${apercu.lignes.length} affichée(s))`);
if (!apercu.total) {
  console.log('  Le tableau est vide : le formulaire n’a encore reçu aucune réponse,');
  console.log('  ou ce n’est pas le bon tableau.');
  await pool.end();
  process.exit(0);
}

// L'interprétation se fait sur la base réelle quand elle est peuplée : c'est
// le référentiel de l'établissement qui décide du service et du local.
let base: BaseGMAO;
try {
  base = await chargerBase();
  if (!base.services.length) base = construireBaseDemo() as BaseGMAO;
} catch {
  base = construireBaseDemo() as BaseGMAO;
}
const correspondance = chargerCorrespondance(config.formulaire.champs || undefined);
const porteur = comptePorteur(base);

for (const cellules of apercu.lignes) {
  const soumission = lireLigneClasseur(apercu.colonnes, cellules, config.microsoft.classeur);
  if (!soumission) continue;

  console.log(`\n  ── réponse ${soumission.id} ─────────────────────────────`);
  for (const r of soumission.reponses) {
    if (!r.valeur) continue;
    console.log(`     ${(r.libelle ?? '').slice(0, 30).padEnd(32)}${r.valeur.slice(0, 60)}`);
  }

  const conversion = convertirSoumission(base, soumission, correspondance, porteur);
  if (conversion.rejet) {
    console.log(`     → écartée : ${conversion.rejet}`);
    continue;
  }
  const d = conversion.demande!;
  const service = base.services.find((s) => s.id === d.serviceId)?.nom ?? '?';
  const equipement = d.equipementId
    ? base.equipements.find((e) => e.id === d.equipementId)?.code
    : undefined;
  console.log('     →');
  console.log(`     ${'devient'.padEnd(32)}${d.objet}`);
  const urgence = PRIORITE[d.urgenceDeclaree]?.libelle ?? d.urgenceDeclaree;
  console.log(`     ${'priorité'.padEnd(32)}${urgence} · ${IMPACT[d.impactPatient]}`);
  console.log(`     ${'service'.padEnd(32)}${service}`);
  console.log(
    `     ${'corps de métier'.padEnd(32)}${d.domaineSuggere ? DOMAINE[d.domaineSuggere].libelle : '(laissé au responsable)'}`,
  );
  console.log(`     ${'équipement'.padEnd(32)}${equipement ?? 'aucun — à rapprocher à l’écran'}`);
}

const dernierId = apercu.lignes
  .map((cellules) => lireLigneClasseur(apercu.colonnes, cellules, config.microsoft.classeur)?.id)
  .filter((id): id is string => Boolean(id))
  .at(-1);

if (marquer && dernierId) {
  await marquerCommeLu(dernierId);
  console.log(
    `\nRepère posé sur la réponse ${dernierId}. Les ${apercu.total} réponses déjà\n` +
      'présentes sont tenues pour connues : la GMAO n’ouvrira de demande que\n' +
      'pour ce qui arrivera après. Le classeur reste l’archive de l’historique.\n',
  );
} else {
  const etat = await lireEtatIntegration();
  const repere = etat?.dernierHorodatage;
  console.log('\nRien n’a été écrit.');
  if (!repere && apercu.total > 20) {
    // Le cas qui fait mal : un classeur en service depuis des mois, et une
    // collecte qui prendrait tout son historique pour du nouveau.
    console.log(
      `\nAucun repère de lecture n’est posé. Au prochain tour, la collecte\n` +
        `ouvrira ${apercu.total} demandes d’un coup, toutes « à qualifier » —\n` +
        `y compris ce qui est réglé depuis des mois.\n\n` +
        `  Pour ne prendre que les nouvelles :\n` +
        `    npm run lire-classeur --workspace=api -- --marquer-comme-lu\n\n` +
        `  Pour tout reprendre malgré tout : laisser la collecte faire son tour.\n`,
    );
  } else {
    console.log(
      `${repere ? `Repère actuel : réponse ${repere}. ` : ''}Pour importer réellement :\n` +
        '    Paramètres → Formulaire externe → « Récupérer maintenant »\n' +
        '  ou laisser la collecte automatique faire son tour.\n',
    );
  }
}

await pool.end();
