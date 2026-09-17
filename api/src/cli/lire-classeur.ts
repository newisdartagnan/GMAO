import { DOMAINE, PRIORITE, construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO, DemandeIntervention } from '@gmao/partage';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { chargerBase } from '../db/charger.ts';
import { comptePorteur, microsoftAutorise, optionsMicrosoft } from '../integrations/collecte.ts';
import { apercuClasseur, lireLigneClasseur } from '../integrations/microsoft.ts';
import { chargerCorrespondance, convertirSoumission } from '../integrations/formulaires.ts';

/**
 * Lecture à blanc du classeur des réponses.
 *
 *   npm run lire-classeur --workspace=api
 *
 * Savoir qu'on voit un fichier ne dit pas qu'on sait l'ouvrir, y trouver le
 * bon tableau et lire ses lignes. Cette commande montre le contenu réel —
 * colonnes, dernières réponses — puis ce que la GMAO en ferait, sans rien
 * écrire. C'est la seule vérification qui prouve la chaîne de bout en bout
 * avant qu'une demande n'entre en base.
 */

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

console.log(
  '\nRien n’a été écrit. Pour importer réellement :\n' +
    '    Paramètres → Formulaire externe → « Récupérer maintenant »\n' +
    '  ou laisser la collecte automatique faire son tour.\n',
);

await pool.end();
