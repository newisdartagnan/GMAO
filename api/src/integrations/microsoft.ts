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

/**
 * Colonnes et propriétés qui décrivent la réponse plutôt que son contenu.
 *
 * Forms en ajoute d'office (« ID », « Heure de début », « Heure de fin »,
 * « E-mail », « Nom »), et un classeur repris à la main les renomme — le
 * classeur de Monkole parle d'« Id_formulaire » et de « Date de plainté ».
 * Les laisser passer pour des réponses ferait lire l'heure de début comme la
 * date d'apparition du problème.
 */
const METADONNEES = new Set([
  'id', 'responseid', 'submissionid', 'idreponse', 'idformulaire',
  'formulaireid', 'formid', 'form_id', 'formulaire',
  'date', 'submitdate', 'heuredefin', 'heurededebut', 'completiontime', 'created_at',
  'datedeplainte', 'dateplainte', 'datedesoumission', 'datedenvoi', 'horodatage',
  'email', 'adressedemessagerie', 'nom', 'name',
  'secret', 'jeton', 'token',
]);

/** Colonnes qui portent l'horodatage de la réponse, par ordre de préférence. */
const COLONNES_DATE = [
  'datedeplainte', 'dateplainte', 'heuredefin', 'submitdate', 'completiontime',
  'datedesoumission', 'datedenvoi', 'horodatage', 'heurededebut', 'date',
];

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
  /**
   * « delegue » : la GMAO agit au nom d'un compte, avec un jeton de
   * rafraîchissement obtenu une fois. C'est le seul flux possible avec un
   * compte Microsoft personnel (outlook.fr, hotmail.com, live.fr).
   *
   * « application » : la GMAO s'authentifie seule, sans utilisateur. Réservé
   * aux comptes professionnels, où un administrateur peut accorder
   * `Files.Read.All` à l'application.
   */
  auth?: 'delegue' | 'application';
  /** « consumers » pour un compte personnel, l'identifiant du locataire sinon. */
  tenantId: string;
  clientId: string;
  /**
   * Facultatif. Une inscription « client public » — celle qu'impose le compte
   * personnel — n'a pas de secret, et en envoyer un ferait refuser l'échange.
   */
  clientSecret?: string;
  /** Jeton de rafraîchissement, en flux délégué. */
  refreshToken?: string;
  /** « Files.Read », ou « Files.Read.All » pour un classeur partagé. */
  portee?: string;
  /**
   * Emplacement du classeur des réponses. Quatre écritures, voir
   * `cheminClasseur`.
   */
  classeur: string;
  /** Nom du tableau Excel des réponses. */
  tableau?: string;
  /** Racine de l'API, pour l'éprouver hors ligne. */
  base?: string;
  jetonBase?: string;
}

/**
 * Portée demandée en flux délégué : lecture seule, et de quoi se renouveler.
 *
 * `Files.Read` suffit tant que le classeur est dans le OneDrive du compte qui
 * autorise. S'il appartient à quelqu'un d'autre et a été partagé, il faut
 * `Files.Read.All` — la lecture de son propre espace ne couvre pas ce que les
 * autres nous ont ouvert.
 */
export function porteeDeleguee(portee = 'Files.Read'): string {
  return `https://graph.microsoft.com/${portee} offline_access`;
}

interface Jeton {
  valeur: string;
  expireLe: number;
}

let jetonCache: Jeton | null = null;

/**
 * Le jeton de rafraîchissement tourne à chaque échange.
 *
 * Microsoft en délivre un nouveau à chaque renouvellement et invalide
 * l'ancien. Celui du fichier `.env` ne vaut donc que pour le premier échange :
 * s'il n'était pas conservé ailleurs, la collecte s'arrêterait au premier
 * redémarrage suivant. L'appelant fournit de quoi le ranger — en pratique, la
 * base de données.
 */
export type EnregistrerRefresh = (jeton: string) => void | Promise<void>;

let enregistrerRefresh: EnregistrerRefresh | null = null;

export function definirEnregistrementRefresh(f: EnregistrerRefresh | null): void {
  enregistrerRefresh = f;
}

function messageErreur(donnees: { error?: string; error_description?: string }, statut: number): string {
  const brut = donnees.error_description?.split(/[\r\n]/)[0] ?? donnees.error ?? 'réponse inexploitable';
  // Les erreurs d'Entra ID portent un code que la documentation indexe ; le
  // garder évite une demi-heure de recherche à l'administrateur.
  if (/AADSTS70002/.test(brut) && /mobile/i.test(brut)) {
    return (
      'l’inscription n’autorise pas les flux client publics, que le code ' +
      'd’appareil exige. Dans Entra ID → votre inscription → Authentification ' +
      '→ Paramètres avancés → « Autoriser les flux client publics » : Oui, ' +
      'puis Enregistrer. Si la bascule est absente, ajoutez d’abord une ' +
      'plateforme « Applications mobiles et de bureau ».'
    );
  }
  if (/AADSTS7000218/.test(brut)) {
    return (
      'l’inscription attend un secret client. Dans Entra ID → Authentification, ' +
      'passez « Autoriser les flux client publics » à Oui — un compte personnel ' +
      'exige une inscription de type client public, sans secret.'
    );
  }
  if (/AADSTS9002331|AADSTS50194/.test(brut)) {
    return (
      'l’inscription n’accepte pas les comptes personnels. Dans Entra ID → ' +
      'Manifeste, « signInAudience » doit valoir « AzureADandPersonalMicrosoftAccount » ' +
      'ou « PersonalMicrosoftAccount ».'
    );
  }
  if (/AADSTS70000|invalid_grant/.test(brut)) {
    return (
      'le jeton de rafraîchissement n’est plus valable (révoqué, ou plus de ' +
      '90 jours sans usage). Relancez « npm run lier-microsoft --workspace=api ».'
    );
  }
  return `${brut} (HTTP ${statut})`;
}

/** Même traduction, exposée pour le banc d'essai. */
export function messageErreurPourEssai(description: string, statut: number): string {
  return messageErreur({ error_description: description }, statut);
}

/**
 * Jeton d'accès, valable une heure.
 *
 * Il est gardé en mémoire jusqu'à une minute avant son terme : la collecte
 * tourne toutes les cinq minutes, rejouer l'échange à chaque tour serait
 * douze appels inutiles par heure.
 */
export async function obtenirJeton(options: OptionsGraph): Promise<string> {
  if (jetonCache && jetonCache.expireLe > Date.now() + 60_000) return jetonCache.valeur;

  const racine = options.jetonBase ?? 'https://login.microsoftonline.com';
  const delegue = (options.auth ?? 'delegue') === 'delegue';

  if (delegue && !options.refreshToken) {
    throw new Error(
      'Aucun jeton de rafraîchissement Microsoft. Lancez une fois ' +
        '« npm run lier-microsoft --workspace=api » pour autoriser la GMAO.',
    );
  }

  const corps = new URLSearchParams(
    delegue
      ? {
          client_id: options.clientId,
          grant_type: 'refresh_token',
          refresh_token: options.refreshToken!,
          scope: porteeDeleguee(options.portee),
        }
      : {
          client_id: options.clientId,
          client_secret: options.clientSecret ?? '',
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        },
  );
  // Une inscription de client public n'a pas de secret ; en envoyer un vide
  // suffit à faire refuser l'échange.
  if (delegue && options.clientSecret) corps.set('client_secret', options.clientSecret);

  const reponse = await fetch(`${racine}/${options.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
    signal: AbortSignal.timeout(20_000),
  });

  const donnees = (await reponse.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!reponse.ok || !donnees.access_token) {
    throw new Error(`Microsoft a refusé l’authentification : ${messageErreur(donnees, reponse.status)}`);
  }

  // Le nouveau jeton de rafraîchissement remplace l'ancien, immédiatement :
  // l'ancien vient d'être invalidé côté Microsoft.
  if (donnees.refresh_token && donnees.refresh_token !== options.refreshToken) {
    options.refreshToken = donnees.refresh_token;
    await enregistrerRefresh?.(donnees.refresh_token);
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

/* ------------------------------------------------------------------ */
/* Autorisation initiale, par code d'appareil                          */
/* ------------------------------------------------------------------ */

export interface DemandeAppareil {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
}

/**
 * Premier temps du flux « code d'appareil ».
 *
 * Ce flux existe pour les machines sans navigateur — un serveur, justement.
 * Il évite d'avoir à exposer une adresse de redirection publique, ce que la
 * GMAO n'a pas.
 */
export async function demanderCodeAppareil(options: {
  tenantId: string;
  clientId: string;
  portee?: string;
  jetonBase?: string;
}): Promise<DemandeAppareil> {
  const racine = options.jetonBase ?? 'https://login.microsoftonline.com';
  const reponse = await fetch(`${racine}/${options.tenantId}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: options.clientId, scope: porteeDeleguee(options.portee) }),
    signal: AbortSignal.timeout(20_000),
  });
  const donnees = (await reponse.json().catch(() => ({}))) as DemandeAppareil & {
    error?: string;
    error_description?: string;
  };
  if (!reponse.ok || !donnees.device_code) {
    throw new Error(`Microsoft a refusé la demande : ${messageErreur(donnees, reponse.status)}`);
  }
  return donnees;
}

/**
 * Second temps : attendre que la personne ait saisi le code dans son
 * navigateur. Microsoft répond « autorisation en attente » tant que ce n'est
 * pas fait, et impose un rythme d'interrogation qu'il faut respecter.
 */
export async function attendreAutorisation(
  options: { tenantId: string; clientId: string; jetonBase?: string },
  demande: DemandeAppareil,
  journaliser: (m: string) => void = () => {},
): Promise<{ refreshToken: string; accessToken: string }> {
  const racine = options.jetonBase ?? 'https://login.microsoftonline.com';
  const limite = Date.now() + demande.expires_in * 1000;
  let attente = Math.max(1, demande.interval) * 1000;

  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, attente));

    const reponse = await fetch(`${racine}/${options.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: options.clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: demande.device_code,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (donnees.access_token && donnees.refresh_token) {
      return { refreshToken: donnees.refresh_token, accessToken: donnees.access_token };
    }
    if (donnees.error === 'authorization_pending') continue;
    if (donnees.error === 'slow_down') {
      attente += 5000;
      continue;
    }
    if (donnees.error === 'authorization_declined') throw new Error('Autorisation refusée dans le navigateur.');
    if (donnees.error === 'expired_token') break;
    throw new Error(`Microsoft a refusé l’échange : ${messageErreur(donnees, reponse.status)}`);
  }
  journaliser('délai dépassé');
  throw new Error('Le code a expiré avant d’être saisi. Relancez la commande.');
}

/* ------------------------------------------------------------------ */
/* Emplacement du classeur                                             */
/* ------------------------------------------------------------------ */

/**
 * Chemin Graph du classeur, à partir de l'écriture courte de la configuration.
 *
 *   me:/Maintenance/reponses.xlsx            OneDrive du compte autorisé
 *   item:<driveItemId>                       le même, désigné par son identifiant
 *   drive:<driveId>:item:<itemId>            un fichier d'un AUTRE compte,
 *                                            partagé avec celui qui autorise
 *   drive:<driveId>:/chemin.xlsx             un autre OneDrive, par chemin
 *   site:<hote>:/sites/<nom>:/chemin.xlsx    une bibliothèque SharePoint
 *
 * Les formes par identifiant sont les plus sûres : elles survivent à un
 * renommage et ne souffrent ni des accents ni des espaces, dont le nom du
 * classeur de Monkole est abondamment pourvu.
 *
 * `drive:<driveId>:item:<itemId>` répond au cas où le formulaire appartient à
 * un compte et la GMAO est autorisée par un autre : un fichier partagé ne vit
 * pas dans le OneDrive de celui qui le lit, et « me: » ne le trouverait pas.
 * `npm run trouver-classeur --workspace=api` donne la valeur à coller.
 */
export function cheminClasseur(classeur: string): string {
  const partage = /^drive:([^:]+):item:(.+)$/.exec(classeur);
  if (partage) {
    return `/drives/${encodeURIComponent(partage[1].trim())}/items/${encodeURIComponent(partage[2].trim())}`;
  }

  const item = /^item:(.+)$/.exec(classeur);
  if (item) return `/me/drive/items/${encodeURIComponent(item[1].trim())}`;

  const moi = /^me:(.+)$/.exec(classeur);
  if (moi) return `/me/drive/root:${encodeURI(moi[1])}:`;

  const drive = /^drive:([^:]+):(.+)$/.exec(classeur);
  if (drive) return `/drives/${drive[1]}/root:${encodeURI(drive[2])}:`;

  const site = /^site:([^:]+):([^:]+):(.+)$/.exec(classeur);
  if (site) return `/sites/${site[1]}:${encodeURI(site[2])}:/drive/root:${encodeURI(site[3])}:`;

  throw new Error(
    'MSFORMS_CLASSEUR doit commencer par « me:/chemin », « item:<id> », ' +
      '« drive:<driveId>:item:<itemId> », « drive:<driveId>:/chemin » ou ' +
      '« site:<hote>:/sites/<nom>:/chemin » — voir le README.',
  );
}

/** Un classeur que le compte autorisé peut lire. */
export interface ClasseurTrouve {
  nom: string;
  /** Valeur à coller dans MSFORMS_CLASSEUR. */
  reference: string;
  /** « propre » : dans son OneDrive ; « partage » : celui de quelqu'un d'autre. */
  provenance: 'propre' | 'partage';
  proprietaire?: string;
  modifieLe?: string;
}

interface ItemDrive {
  id: string;
  name?: string;
  lastModifiedDateTime?: string;
  parentReference?: { driveId?: string; path?: string };
  createdBy?: { user?: { displayName?: string; email?: string } };
  remoteItem?: {
    id: string;
    name?: string;
    lastModifiedDateTime?: string;
    parentReference?: { driveId?: string };
    createdBy?: { user?: { displayName?: string; email?: string } };
  };
}

/**
 * Cherche les classeurs lisibles par le compte autorisé.
 *
 * Deux endroits, parce qu'un formulaire détenu ailleurs y met son classeur :
 * le OneDrive du compte lui-même, et ce qui lui a été partagé. Le second est
 * le cas de Monkole, où le formulaire appartient à un compte et la GMAO est
 * autorisée par un autre.
 */
export async function trouverClasseurs(
  jeton: string,
  base = 'https://graph.microsoft.com/v1.0',
): Promise<ClasseurTrouve[]> {
  const appeler = async (chemin: string): Promise<ItemDrive[]> => {
    const r = await fetch(`${base}${chemin}`, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return [];
    const corps = (await r.json().catch(() => ({}))) as { value?: ItemDrive[] };
    return corps.value ?? [];
  };

  const sortie: ClasseurTrouve[] = [];

  for (const item of await appeler("/me/drive/root/search(q='.xlsx')?$top=50")) {
    if (!item.name?.toLowerCase().endsWith('.xlsx')) continue;
    const dossier = item.parentReference?.path?.replace(/^\/drive\/root:/, '') ?? '';
    sortie.push({
      nom: `${dossier}/${item.name}`.replace(/\/+/g, '/'),
      reference: `item:${item.id}`,
      provenance: 'propre',
      modifieLe: item.lastModifiedDateTime,
    });
  }

  for (const item of await appeler('/me/drive/sharedWithMe')) {
    const distant = item.remoteItem;
    const nom = distant?.name ?? item.name ?? '';
    if (!nom.toLowerCase().endsWith('.xlsx')) continue;
    const driveId = distant?.parentReference?.driveId;
    if (!distant?.id || !driveId) continue;
    sortie.push({
      nom,
      reference: `drive:${driveId}:item:${distant.id}`,
      provenance: 'partage',
      proprietaire: distant.createdBy?.user?.email ?? distant.createdBy?.user?.displayName,
      modifieLe: distant.lastModifiedDateTime,
    });
  }

  return sortie;
}

interface LigneTableau {
  index: number;
  values: unknown[][];
}

/** Colonnes du classeur qui portent une réponse, dans l'ordre. */
export function colonnesReponses(colonnes: string[]): string[] {
  return colonnes.slice(1).filter((c) => c && !METADONNEES.has(cleComparaison(c)));
}

/** Colonne qui porte l'horodatage de la réponse, s'il y en a une. */
export function colonneHorodatage(colonnes: string[]): string | undefined {
  for (const cible of COLONNES_DATE) {
    const trouvee = colonnes.find((c) => cleComparaison(c) === cible);
    if (trouvee) return trouvee;
  }
  return undefined;
}

/**
 * Une ligne du classeur, ramenée à une soumission.
 *
 * La première colonne porte l'identifiant de réponse, quel que soit son
 * libellé — « ID » dans un classeur laissé tel quel, « Id_formulaire » dans
 * celui de Monkole. Les autres colonnes de service sont écartées : lire
 * « Heure de début » comme une réponse la ferait passer pour la date
 * d'apparition du problème.
 */
export function lireLigneClasseur(
  colonnes: string[],
  cellules: unknown[],
  formulaireId: string,
): SoumissionFormulaire | null {
  const parColonne = new Map(colonnes.map((c, i) => [c, cellules[i]]));
  const identifiant = String(parColonne.get(colonnes[0]) ?? '').trim();
  if (!identifiant) return null;

  const colonneDate = colonneHorodatage(colonnes);
  return {
    source: SOURCE,
    id: identifiant,
    formulaireId,
    date: colonneDate ? normaliserDate(parColonne.get(colonneDate)) : undefined,
    reponses: colonnesReponses(colonnes).map((libelle) => ({
      libelle,
      valeur: texteDe(parColonne.get(libelle)),
    })),
  };
}

/**
 * Toutes les lignes d'un tableau, page après page.
 *
 * Graph ne rend pas forcément le tableau entier d'un coup : passé quelques
 * centaines de lignes il coupe et laisse un « @odata.nextLink ». S'arrêter à
 * la première page se voit mal — la collecte continue de tourner, sans erreur,
 * et cesse simplement de voir les réponses récentes. La borne n'est là que
 * pour qu'un lien qui boucle ne fasse pas tourner la collecte sans fin.
 */
export async function toutesLesLignes(
  appeler: (url: string) => Promise<Record<string, unknown>>,
  premiere: string,
  maxPages = 50,
): Promise<LigneTableau[]> {
  const lignes: LigneTableau[] = [];
  let url: string | undefined = premiere;
  for (let page = 0; url && page < maxPages; page += 1) {
    const reponse: { value?: LigneTableau[]; '@odata.nextLink'?: string } = await appeler(url);
    lignes.push(...(reponse.value ?? []));
    url = reponse['@odata.nextLink'];
  }
  return lignes;
}

/** Ce qu'un classeur contient, pour le montrer avant d'en importer quoi que ce soit. */
export interface ApercuClasseur {
  nom?: string;
  modifieLe?: string;
  tableaux: string[];
  tableauLu?: string;
  colonnes: string[];
  /** Colonnes écartées des réponses parce qu'elles décrivent la soumission. */
  colonnesDeService: string[];
  lignes: unknown[][];
  total: number;
}

/**
 * Regarde dans le classeur sans rien importer.
 *
 * Lister un fichier prouve qu'on le voit ; cela ne prouve pas qu'on sait
 * l'ouvrir, trouver le bon tableau et lire ses lignes. Entre les deux se
 * glissent un nom de tableau erroné, une feuille sans tableau nommé, un
 * classeur vide. Cette lecture à blanc lève le doute avant qu'une
 * collecte ne se taise sans raison lisible.
 */
export async function apercuClasseur(
  options: OptionsGraph,
  combien = 3,
): Promise<ApercuClasseur> {
  const jeton = await obtenirJeton(options);
  const racine = options.base ?? 'https://graph.microsoft.com/v1.0';
  const item = `${racine}${cheminClasseur(options.classeur)}`;

  const appeler = async (url: string) => {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      const corps = await r.text().catch(() => '');
      throw new Error(`Microsoft Graph a répondu ${r.status} : ${corps.slice(0, 240) || 'réponse vide'}`);
    }
    return r.json() as Promise<Record<string, unknown>>;
  };

  // La fiche du fichier n'est qu'un ornement : le nom et la date rassurent,
  // mais c'est le tableau qui compte. Un refus ici — un partage qui donne le
  // contenu sans les métadonnées — ne doit pas emporter la lecture.
  const fiche = (await appeler(item).catch(() => ({}))) as {
    name?: string;
    lastModifiedDateTime?: string;
  };

  const listeTables = (await appeler(`${item}/workbook/tables`)) as { value?: { name: string }[] };
  const tableaux = (listeTables.value ?? []).map((t) => t.name);

  const apercu: ApercuClasseur = {
    nom: fiche.name,
    modifieLe: fiche.lastModifiedDateTime,
    tableaux,
    colonnes: [],
    colonnesDeService: [],
    lignes: [],
    total: 0,
  };
  if (!tableaux.length) return apercu;

  // Le tableau configuré s'il existe, sinon le premier : mieux vaut montrer
  // ce qu'il y a que refuser sur un nom qui se corrige en une ligne de .env.
  const voulu = options.tableau ?? 'Tableau1';
  apercu.tableauLu = tableaux.includes(voulu) ? voulu : tableaux[0];
  const table = `${item}/workbook/tables/${encodeURIComponent(apercu.tableauLu)}`;

  const entetes = (await appeler(`${table}/headerRowRange`)) as { values?: unknown[][] };
  apercu.colonnes = (entetes.values?.[0] ?? []).map((v) => String(v ?? '').trim());

  const utiles = new Set(colonnesReponses(apercu.colonnes));
  apercu.colonnesDeService = apercu.colonnes.filter((c, i) => i === 0 || !utiles.has(c));

  const toutes = (await toutesLesLignes(appeler, `${table}/rows`)).map((l) => l.values?.[0] ?? []);
  apercu.total = toutes.length;
  apercu.lignes = toutes.slice(-combien);

  return apercu;
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
  if (!colonnesReponses(colonnes).length) {
    throw new Error(
      `Le tableau « ${tableau} » ne contient que des colonnes de service : ` +
        `${colonnes.join(', ')}. Vérifiez MSFORMS_TABLEAU.`,
    );
  }

  const lignes = await toutesLesLignes(appeler, `${chemin}/rows`);
  const repere = depuis ? Number(depuis) : Number.NaN;

  const soumissions: SoumissionFormulaire[] = [];
  let maximum = Number.isNaN(repere) ? 0 : repere;

  for (const ligne of lignes) {
    const soumission = lireLigneClasseur(colonnes, ligne.values?.[0] ?? [], options.classeur);
    if (!soumission) continue;

    const numero = Number(soumission.id);
    if (!Number.isNaN(repere) && !Number.isNaN(numero) && numero <= repere) continue;
    if (!Number.isNaN(numero)) maximum = Math.max(maximum, numero);
    soumissions.push(soumission);
  }

  return {
    soumissions,
    dernierHorodatage: maximum > 0 ? String(maximum) : depuis,
  };
}
