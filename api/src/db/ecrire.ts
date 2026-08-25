import type { BaseGMAO, CleCollection, EntreePatch, PatchBase } from '@gmao/partage';
import type { Client } from './pool.ts';
import { COLLECTIONS, tablePour } from './collections.ts';
import { versSnake } from './nommage.ts';

/**
 * Persistance par différence.
 *
 * Les opérations métier travaillent sur l'agrégat complet en mémoire — c'est
 * ce qui permet à l'API et au navigateur de partager exactement le même code.
 * Plutôt que de demander à chaque opération de déclarer ce qu'elle a modifié,
 * on compare l'état avant et après : la base reçoit précisément les lignes qui
 * ont changé, sans qu'aucune écriture ne puisse être oubliée en chemin.
 *
 * Les clés étrangères du schéma sont différées, si bien que l'ordre des
 * insertions et des suppressions n'a pas d'importance : la cohérence est
 * vérifiée au COMMIT.
 */

type Entite = Record<string, unknown> & { id: string };

export interface ResumeEcriture {
  table: string;
  inseres: number;
  modifies: number;
  supprimes: number;
}

/** Les objets et tableaux vont en JSONB ; le reste passe tel quel. */
function versParametre(v: unknown): unknown {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function indexer(liste: unknown): Map<string, Entite> {
  const m = new Map<string, Entite>();
  if (!Array.isArray(liste)) return m;
  for (const e of liste as Entite[]) if (e && typeof e.id === 'string') m.set(e.id, e);
  return m;
}

async function inserer(client: Client, table: string, entite: Entite): Promise<void> {
  const champs = Object.keys(entite).filter((c) => entite[c] !== undefined);
  const colonnes = champs.map(versSnake);
  const jetons = champs.map((_, i) => `$${i + 1}`);
  const valeurs = champs.map((c) => versParametre(entite[c]));
  await client.query(
    `INSERT INTO ${table} (${colonnes.join(', ')}) VALUES (${jetons.join(', ')})`,
    valeurs,
  );
}

async function modifier(client: Client, table: string, avant: Entite, apres: Entite): Promise<void> {
  // Un champ qui disparaît doit repasser à NULL en base : on prend l'union des
  // clés des deux versions, sans quoi une valeur effacée resterait affichée.
  const champs = [...new Set([...Object.keys(avant), ...Object.keys(apres)])].filter((c) => c !== 'id');
  const affectations = champs.map((c, i) => `${versSnake(c)} = $${i + 2}`);
  const valeurs = champs.map((c) => versParametre(apres[c]));
  await client.query(`UPDATE ${table} SET ${affectations.join(', ')} WHERE id = $1`, [apres.id, ...valeurs]);
}

export async function ecrireDifferences(
  client: Client,
  avant: BaseGMAO,
  patch: PatchBase,
): Promise<ResumeEcriture[]> {
  const resume: ResumeEcriture[] = [];

  for (const [cle, entree] of Object.entries(patch) as [CleCollection, EntreePatch][]) {
    const table = tablePour(cle);
    const existantes = indexer((avant as unknown as Record<string, unknown>)[cle]);
    let inseres = 0;
    let modifies = 0;

    // Les suppressions passent en premier. Une entité peut en remplacer une
    // autre sous une contrainte d'unicité métier — un relevé d'inspection
    // corrigé prend un nouvel identifiant mais garde le couple (ronde,
    // équipement) — et l'insertion échouerait tant que l'ancienne ligne est là.
    if (entree.supprimes.length) {
      await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [entree.supprimes]);
    }

    for (const entite of entree.maj as Entite[]) {
      const precedente = existantes.get(entite.id);
      if (precedente) {
        await modifier(client, table, precedente, entite);
        modifies += 1;
      } else {
        await inserer(client, table, entite);
        inseres += 1;
      }
    }

    resume.push({ table, inseres, modifies, supprimes: entree.supprimes.length });
  }

  return resume;
}

/** Écriture complète, utilisée par le peuplement initial. */
export async function ecrireBaseComplete(client: Client, base: BaseGMAO): Promise<number> {
  let total = 0;
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for (const { cle, table } of COLLECTIONS) {
    const liste = (base as unknown as Record<string, unknown>)[cle];
    if (!Array.isArray(liste)) continue;
    for (const entite of liste as Entite[]) {
      await inserer(client, table, entite);
      total += 1;
    }
  }
  return total;
}

/** Vide toutes les tables métier, dans un ordre sans importance grâce aux FK différées. */
export async function viderBase(client: Client): Promise<void> {
  await client.query(
    `TRUNCATE ${COLLECTIONS.map((c) => c.table).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
