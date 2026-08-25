import { chargerBase } from '../db/charger.ts';
import { pool } from '../db/pool.ts';
import { CLES_COLLECTIONS, calculerPatch } from '@gmao/partage';
import type { BaseGMAO } from '@gmao/partage';

/**
 * Contrôle d'intégrité du mapping objet ↔ relationnel.
 *
 * Relit la base et la compare au jeu de données qui a servi au peuplement :
 * une colonne oubliée dans le schéma, une conversion de nom fautive ou un
 * type mal choisi se voient immédiatement. À lancer après toute modification
 * du modèle de domaine ou d'une migration.
 *
 * Le seul écart attendu porte sur l'horodatage de l'entrée d'audit initiale,
 * qui est reconstruite à l'instant de la comparaison.
 */
console.log(
  'Comparaison de la base au jeu de référence.\n' +
    'À lancer juste après un peuplement : toute écriture faite depuis apparaîtra\n' +
    'ici comme un écart, ce qui est normal et sans rapport avec le mapping.\n',
);

const lue = await chargerBase();

console.log('Volumétrie relue :');
let total = 0;
for (const cle of CLES_COLLECTIONS) {
  const n = (lue as unknown as Record<string, unknown[]>)[cle].length;
  total += n;
  if (n) console.log(`  ${cle.padEnd(22)} ${String(n).padStart(6)}`);
}
console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(6)}`);

// Comparaison champ à champ avec ce qui a servi au peuplement.
const { construireBaseDemo } = await import('@gmao/partage');
const origine = construireBaseDemo() as BaseGMAO;
const patch = calculerPatch(origine, lue);

let ecarts = 0;
for (const [cle, entree] of Object.entries(patch)) {
  const exemples = entree.maj.slice(0, 2).map((e) => {
    const avant = (origine as unknown as Record<string, { id: string }[]>)[cle].find((x) => x.id === e.id);
    const champs = new Set([...Object.keys(avant ?? {}), ...Object.keys(e)]);
    const diff: string[] = [];
    for (const c of champs) {
      const a = JSON.stringify((avant as unknown as Record<string, unknown>)?.[c]);
      const b = JSON.stringify((e as unknown as Record<string, unknown>)[c]);
      if (a !== b) diff.push(`${c}: ${a} → ${b}`);
    }
    return `${e.id} { ${diff.join(', ')} }`;
  });
  ecarts += entree.maj.length + entree.supprimes.length;
  console.log(`\nÉCART ${cle} : ${entree.maj.length} modifié(s), ${entree.supprimes.length} manquant(s)`);
  for (const x of exemples) console.log('   ', x);
}

// L'entrée d'audit initiale porte l'heure de génération : elle diffère par
// construction et ne constitue pas un écart de mapping.
const reels = Math.max(0, ecarts - (patch.audit ? patch.audit.maj.length : 0));
console.log(
  reels === 0
    ? '\nAller-retour fidèle : aucun écart.'
    : `\n${reels} écart(s). Si la base a servi depuis le peuplement, relancer\n` +
      "   « npm run seed -- --remplacer » avant de conclure à un défaut de mapping.",
);
await pool.end();
process.exit(reels === 0 ? 0 : 1);
