import type { BaseGMAO } from './domaine';

/**
 * Différence entre deux états de l'agrégat.
 *
 * Une écriture ne renvoie pas la base entière — quelques mégaoctets à chaque
 * clic — mais seulement ce qui a changé. Le même calcul sert deux fois : le
 * serveur en tire les lignes SQL à écrire, le client les entités à remplacer
 * dans son état local. Une seule définition du « ce qui a changé » évite que
 * les deux côtés divergent.
 */

/** Collections d'entités de l'agrégat, dans l'ordre des dépendances. */
export const CLES_COLLECTIONS = [
  'sites',
  'batiments',
  'services',
  'locaux',
  'equipes',
  'utilisateurs',
  'habilitations',
  'fournisseurs',
  'familles',
  'contrats',
  'equipements',
  'mouvementsEquipement',
  'gammes',
  'controles',
  'demandes',
  'ordresTravail',
  'visitesControle',
  'vigilances',
  'rappels',
  'magasins',
  'articles',
  'lots',
  'bonsCommande',
  'mouvementsStock',
  'capteurs',
  'releves',
  'alertes',
  'documents',
  'audit',
  'budgets',
  'modelesInspection',
  'rondes',
  'relevesInspection',
] as const;

export type CleCollection = (typeof CLES_COLLECTIONS)[number];

export interface EntreePatch {
  /** Entités créées ou modifiées, dans leur état final. */
  maj: { id: string }[];
  /** Identifiants des entités disparues. */
  supprimes: string[];
}

export type PatchBase = Partial<Record<CleCollection, EntreePatch>>;

/**
 * Comparaison structurelle profonde.
 *
 * `JSON.stringify` ne convient pas ici : PostgreSQL réordonne les clés des
 * colonnes JSONB, et l'ordre des colonnes d'un SELECT n'est pas celui dans
 * lequel l'application construit ses objets. Une comparaison textuelle
 * verrait donc « modifié » partout après un rechargement, et chaque écriture
 * réécrirait la base entière. On compare donc les valeurs, pas leur écriture :
 * l'ordre des clés d'un objet est sans importance, celui des éléments d'un
 * tableau en a une.
 */
export function memeContenu(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // `undefined` et une clé absente décrivent la même chose dans ce modèle.
  if (a === undefined || b === undefined || a === null || b === null) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aTableau = Array.isArray(a);
  if (aTableau !== Array.isArray(b)) return false;

  if (aTableau) {
    const ta = a as unknown[];
    const tb = b as unknown[];
    if (ta.length !== tb.length) return false;
    for (let i = 0; i < ta.length; i += 1) if (!memeContenu(ta[i], tb[i])) return false;
    return true;
  }

  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const clesA = Object.keys(oa).filter((c) => oa[c] !== undefined);
  const clesB = Object.keys(ob).filter((c) => ob[c] !== undefined);
  if (clesA.length !== clesB.length) return false;
  for (const c of clesA) {
    if (!Object.prototype.hasOwnProperty.call(ob, c)) return false;
    if (!memeContenu(oa[c], ob[c])) return false;
  }
  return true;
}

function indexer(liste: unknown): Map<string, { id: string }> {
  const m = new Map<string, { id: string }>();
  if (!Array.isArray(liste)) return m;
  for (const e of liste as { id: string }[]) if (e && typeof e.id === 'string') m.set(e.id, e);
  return m;
}

export function calculerPatch(avant: BaseGMAO, apres: BaseGMAO): PatchBase {
  const patch: PatchBase = {};
  for (const cle of CLES_COLLECTIONS) {
    const mAvant = indexer((avant as unknown as Record<string, unknown>)[cle]);
    const mApres = indexer((apres as unknown as Record<string, unknown>)[cle]);
    const maj: { id: string }[] = [];
    const supprimes: string[] = [];

    for (const [id, entite] of mApres) {
      const precedente = mAvant.get(id);
      if (!precedente || !memeContenu(precedente, entite)) maj.push(entite);
    }
    for (const id of mAvant.keys()) if (!mApres.has(id)) supprimes.push(id);

    if (maj.length || supprimes.length) patch[cle] = { maj, supprimes };
  }
  return patch;
}

export function patchEstVide(patch: PatchBase): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Applique un patch et renvoie un nouvel agrégat. Les entités modifiées
 * gardent leur position dans la liste ; les nouvelles sont placées en tête,
 * ce qui correspond à l'ordre d'affichage attendu (le plus récent d'abord).
 */
export function appliquerPatch(base: BaseGMAO, patch: PatchBase): BaseGMAO {
  const suivant = { ...base } as unknown as Record<string, unknown>;

  for (const [cle, entree] of Object.entries(patch) as [CleCollection, EntreePatch][]) {
    const actuelles = (base as unknown as Record<string, unknown>)[cle];
    if (!Array.isArray(actuelles)) continue;

    const supprimes = new Set(entree.supprimes);
    const parId = new Map(entree.maj.map((e) => [e.id, e]));

    const liste = (actuelles as { id: string }[])
      .filter((e) => !supprimes.has(e.id))
      .map((e) => {
        const remplacante = parId.get(e.id);
        if (!remplacante) return e;
        parId.delete(e.id);
        return remplacante;
      });

    // Ce qui reste dans la table d'index n'existait pas : ce sont les créations.
    suivant[cle] = [...parId.values(), ...liste];
  }

  return suivant as unknown as BaseGMAO;
}
