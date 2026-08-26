import { normaliser } from '@gmao/partage';
import type { SoumissionFormulaire } from './formulaires.ts';

/**
 * Adaptateur Microsoft Forms.
 *
 * Microsoft Forms n'expose pas d'API publique de lecture des réponses : on ne
 * peut pas l'interroger comme JotForm. Les deux chemins praticables passent
 * par Power Automate, qui se déclenche à chaque soumission.
 *
 * — **Webhook** (`mode = webhook`). Le flux Power Automate appelle
 *   directement la GMAO. C'est immédiat et sans autre pièce à installer, mais
 *   le serveur doit être joignable depuis Internet, puisque c'est le nuage
 *   Microsoft qui appelle.
 *
 * — **Classeur** (`mode = graph`). Le flux ajoute une ligne dans un tableau
 *   Excel sur OneDrive ou SharePoint, et la GMAO relit ce tableau par
 *   Microsoft Graph. Rien n'entre : c'est le serveur qui sort. C'est le mode
 *   qui convient à une GMAO installée derrière la connexion de l'hôpital,
 *   sans adresse publique — au prix d'une inscription d'application dans
 *   Entra ID.
 *
 * Dans les deux cas, l'identifiant de réponse fourni par Forms sert de clé
 * d'unicité : le même formulaire peut alimenter les deux chemins sans qu'une
 * réponse donne deux demandes.
 */

export const SOURCE = 'microsoft-forms';

/* ------------------------------------------------------------------ */
/* Webhook Power Automate                                              */
/* ------------------------------------------------------------------ */

/**
 * Lit le corps envoyé par un flux Power Automate.
 *
 * Le flux est libre de sa mise en forme ; deux dispositions sont acceptées :
 *
 *   { "id": "12", "formulaireId": "u4qT…", "date": "…",
 *     "reponses": { "Secteur": "Plomberie", "Priorité": "Haute" } }
 *
 * et la disposition à plat, où chaque question est une propriété du corps —
 * ce que produit un « Envoyer une requête HTTP » construit en glissant
 * directement les champs du formulaire.
 */
export function lireWebhook(corps: Record<string, unknown>): SoumissionFormulaire | null {
  const identifiant = premierePropriete(corps, ['id', 'responseId', 'submissionId', 'ID', 'idReponse']);
  if (!identifiant) return null;

  const formulaireId =
    premierePropriete(corps, ['formulaireId', 'formId', 'form_id', 'formulaire']) ?? '';
  const date = premierePropriete(corps, ['date', 'submitDate', 'heureDeFin', 'completionTime', 'created_at']);

  const brut = corps.reponses ?? corps.responses ?? corps.champs ?? corps.answers;
  const plat =
    brut && typeof brut === 'object' && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : sansMetadonnees(corps);

  return {
    source: SOURCE,
    id: identifiant,
    formulaireId,
    date: date ? normaliserDate(date) : undefined,
    reponses: Object.entries(plat).map(([libelle, valeur]) => ({
      libelle,
      valeur: texteDe(valeur),
    })),
  };
}

/**
 * Clé de comparaison d'un nom de colonne.
 *
 * Le pliage des accents passe par `normaliser` : retirer directement tout ce
 * qui n'est pas ASCII transformerait « Heure de début » en « heurededbut », et
 * la colonne échapperait au filtre.
 */
function cleComparaison(nom: string): string {
  return normaliser(nom).replace(/[^a-z0-9]/g, '');
}

const METADONNEES = new Set([
  'id', 'responseid', 'submissionid', 'idreponse',
  'formulaireid', 'formid', 'form_id', 'formulaire',
  'date', 'submitdate', 'heuredefin', 'heurededebut', 'completiontime', 'created_at',
  'secret', 'jeton', 'token',
]);

function sansMetadonnees(corps: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(corps)) {
    if (METADONNEES.has(cleComparaison(cle))) continue;
    if (valeur === null || valeur === undefined || valeur === '') continue;
    out[cle] = valeur;
  }
  return out;
}

/**
 * Première propriété présente parmi une liste de noms.
 *
 * La comparaison est faite sur la clé pliée : un flux Power Automate construit
 * en glissant les champs du formulaire nomme ses propriétés comme Forms nomme
 * ses colonnes — « Heure de fin », accent et espace compris — là où la
 * configuration parle de « heureDeFin ».
 */
function premierePropriete(corps: Record<string, unknown>, noms: string[]): string | undefined {
  const index = new Map<string, unknown>();
  for (const [cle, valeur] of Object.entries(corps)) {
    const k = cleComparaison(cle);
    if (!index.has(k)) index.set(k, valeur);
  }
  for (const nom of noms) {
    const v = index.get(cleComparaison(nom));
    if (v !== undefined && v !== null && String(v) !== '') return String(v);
  }
  return undefined;
}

function texteDe(brut: unknown): string {
  if (brut === undefined || brut === null) return '';
  if (Array.isArray(brut)) return brut.map(texteDe).filter(Boolean).join(', ');
  if (typeof brut === 'object') {
    return Object.values(brut as Record<string, unknown>)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(' ')
      .trim();
  }
  return String(brut).trim();
}

/**
 * Ramène un horodatage à la forme ISO attendue par le modèle.
 *
 * Excel rend les dates soit en texte, soit en nombre de jours depuis le
 * 30 décembre 1899 — la sérialisation d'origine de Lotus 1-2-3, conservée
 * depuis. Les deux se présentent, selon la façon dont le flux a rempli la
 * colonne.
 */
export function normaliserDate(brut: unknown): string | undefined {
  if (brut === null || brut === undefined || brut === '') return undefined;

  if (typeof brut === 'number' || /^\d+([.,]\d+)?$/.test(String(brut))) {
    const serie = Number(String(brut).replace(',', '.'));
    if (serie > 20000 && serie < 80000) {
      const ms = Math.round((serie - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 19);
    }
  }

  const texte = String(brut).trim();
  // Forms et Excel écrivent volontiers « 26/08/2026 14:30 » en français.
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(texte);
  if (fr) {
    const [, j, m, a, h = '0', min = '0'] = fr;
    return `${a}-${m.padStart(2, '0')}-${j.padStart(2, '0')}T${h.padStart(2, '0')}:${min.padStart(2, '0')}:00`;
  }

  const d = new Date(texte);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 19);
}

/* ------------------------------------------------------------------ */
/* Lecture du classeur par Microsoft Graph                             */
/* ------------------------------------------------------------------ */

export interface OptionsGraph {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /**
   * Emplacement du classeur des réponses. Deux écritures :
   *   drive:<driveId>:/Documents/reponses.xlsx
   *   site:<hostname>:/sites/<nom>:/Documents partages/reponses.xlsx
   */
  classeur: string;
  /** Nom du tableau Excel alimenté par le flux. */
  tableau?: string;
  /** Racine de l'API, pour l'éprouver hors ligne. */
  base?: string;
  jetonBase?: string;
}

interface Jeton {
  valeur: string;
  expireLe: number;
}

let jetonCache: Jeton | null = null;

/**
 * Jeton d'application, obtenu par le flux « client credentials ».
 *
 * Aucun utilisateur n'est impliqué : c'est la GMAO qui s'authentifie, avec
 * l'autorisation `Files.Read.All` accordée une fois par l'administrateur du
 * locataire. Le jeton vaut une heure ; il est gardé jusqu'à une minute avant
 * son terme, pour ne pas rejouer l'échange à chaque tour de collecte.
 */
export async function obtenirJeton(options: OptionsGraph): Promise<string> {
  if (jetonCache && jetonCache.expireLe > Date.now() + 60_000) return jetonCache.valeur;

  const racine = options.jetonBase ?? 'https://login.microsoftonline.com';
  const corps = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const reponse = await fetch(`${racine}/${options.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
    signal: AbortSignal.timeout(20_000),
  });

  const donnees = (await reponse.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!reponse.ok || !donnees.access_token) {
    throw new Error(
      `Entra ID a refusé l’authentification (${reponse.status}) : ${
        donnees.error_description?.split('\n')[0] ?? 'réponse inexploitable'
      }`,
    );
  }

  jetonCache = {
    valeur: donnees.access_token,
    expireLe: Date.now() + (donnees.expires_in ?? 3600) * 1000,
  };
  return jetonCache.valeur;
}

/** Oublie le jeton en cache — utile aux essais et après un changement de secret. */
export function oublierJeton(): void {
  jetonCache = null;
}

/** Chemin Graph du classeur, à partir de l'écriture courte de la configuration. */
export function cheminClasseur(classeur: string): string {
  const drive = /^drive:([^:]+):(.+)$/.exec(classeur);
  if (drive) return `/drives/${drive[1]}/root:${encodeURI(drive[2])}:`;

  const site = /^site:([^:]+):([^:]+):(.+)$/.exec(classeur);
  if (site) return `/sites/${site[1]}:${encodeURI(site[2])}:/drive/root:${encodeURI(site[3])}:`;

  // À défaut, un chemin dans le OneDrive de l'application n'a pas de sens en
  // « client credentials » : on le dit plutôt que d'échouer plus loin sur un
  // 404 incompréhensible.
  throw new Error(
    'MSFORMS_CLASSEUR doit commencer par « drive:<driveId>:/chemin » ou ' +
      '« site:<hote>:/sites/<nom>:/chemin » — voir le README.',
  );
}

interface LigneTableau {
  index: number;
  values: unknown[][];
}

/**
 * Relit le tableau des réponses et rend les lignes postérieures au repère.
 *
 * Le repère est l'identifiant de réponse le plus élevé déjà traité. Forms
 * numérote ses réponses de façon croissante, ce qui suffit à ne relire que le
 * nouveau — et si le repère est perdu, tout est relu sans dommage : l'unicité
 * sur l'identifiant écarte ce qui est déjà connu.
 */
export async function recupererSoumissions(
  options: OptionsGraph,
  depuis?: string,
): Promise<{ soumissions: SoumissionFormulaire[]; dernierHorodatage?: string }> {
  const jeton = await obtenirJeton(options);
  const racine = options.base ?? 'https://graph.microsoft.com/v1.0';
  const tableau = options.tableau ?? 'Tableau1';
  const chemin = `${racine}${cheminClasseur(options.classeur)}/workbook/tables/${encodeURIComponent(tableau)}`;

  const appeler = async (url: string) => {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      const corps = await r.text().catch(() => '');
      throw new Error(`Microsoft Graph a répondu ${r.status} : ${corps.slice(0, 200) || 'réponse vide'}`);
    }
    return r.json() as Promise<Record<string, unknown>>;
  };

  const entetes = (await appeler(`${chemin}/headerRowRange`)) as { values?: unknown[][] };
  const colonnes = (entetes.values?.[0] ?? []).map((v) => String(v ?? '').trim());
  if (!colonnes.length) {
    throw new Error(`Le tableau « ${tableau} » du classeur n’a pas de ligne d’en-tête.`);
  }

  const lignes = (await appeler(`${chemin}/rows`)) as { value?: LigneTableau[] };
  const repere = depuis ? Number(depuis) : Number.NaN;

  const soumissions: SoumissionFormulaire[] = [];
  let maximum = Number.isNaN(repere) ? 0 : repere;

  for (const ligne of lignes.value ?? []) {
    const cellules = ligne.values?.[0] ?? [];
    const parColonne = new Map(colonnes.map((c, i) => [c, cellules[i]]));

    const identifiant = String(parColonne.get(colonnes[0]) ?? '').trim();
    if (!identifiant) continue;
    const numero = Number(identifiant);
    if (!Number.isNaN(repere) && !Number.isNaN(numero) && numero <= repere) continue;
    if (!Number.isNaN(numero)) maximum = Math.max(maximum, numero);

    soumissions.push({
      source: SOURCE,
      id: identifiant,
      formulaireId: options.classeur,
      date: normaliserDate(
        parColonne.get(colonnes.find((c) => /heure de fin|completion|submit/i.test(c)) ?? '') ??
          parColonne.get(colonnes.find((c) => /heure de d|start/i.test(c)) ?? ''),
      ),
      reponses: colonnes.slice(1).map((libelle) => ({
        libelle,
        valeur: texteDe(parColonne.get(libelle)),
      })),
    });
  }

  return {
    soumissions,
    dernierHorodatage: maximum > 0 ? String(maximum) : depuis,
  };
}
