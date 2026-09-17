/** Configuration lue une seule fois au démarrage, avec des défauts de développement. */

/**
 * Valeur d'environnement, débarrassée des blancs qui l'entourent.
 *
 * Un fichier `.env` rédigé sous Windows se termine en CRLF, et le retour
 * chariot reste collé à la fin de chaque valeur. Il ne se voit pas : la
 * chaîne reste « vraie », tous les contrôles de présence passent, et le
 * défaut ne joue pas. Il ressort plus loin, transformé en « %0D » dans une
 * URL — un identifiant de fichier parfaitement valide devient alors
 * introuvable, sur un « 404 » qui n'explique rien.
 */
function lire(nom: string, defaut?: string): string {
  const v = process.env[nom] ?? defaut;
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v.trim();
}

/**
 * Valeur laissée telle quelle, octet pour octet.
 *
 * Réservée à ce que consomme aussi un AUTRE conteneur depuis le même
 * fichier. Le mot de passe de PostgreSQL en est : la base a été initialisée
 * avec la valeur telle que Compose la lui a passée, retour chariot compris.
 * La nettoyer ici seulement ferait diverger les deux lectures, et l'API ne
 * pourrait plus se connecter à sa propre base.
 */
function lireBrut(nom: string, defaut?: string): string {
  const v = process.env[nom] ?? defaut;
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

export const config = {
  port: Number(lire('API_PORT', '3001')),
  hote: lire('API_HOST', '0.0.0.0'),
  environnement: lire('NODE_ENV', 'development'),

  bdd: {
    hote: lire('DB_HOST', 'localhost'),
    port: Number(lire('DB_PORT', '5432')),
    // Ces trois-là servent aussi au conteneur PostgreSQL : voir lireBrut.
    base: lireBrut('DB_NAME', 'gmao'),
    utilisateur: lireBrut('DB_USER', 'gmao'),
    motDePasse: lireBrut('DB_PASSWORD', 'gmao'),
    /** Nombre maximal de connexions ouvertes par le pool. */
    poolMax: Number(lire('DB_POOL_MAX', '10')),
  },

  /**
   * Clé de signature des jetons. En production elle DOIT être fournie : le
   * défaut ci-dessous n'existe que pour démarrer en développement sans
   * configuration, et le serveur refuse de se lancer s'il le trouve ailleurs.
   */
  jwtSecret: lire('JWT_SECRET', 'developpement-seulement-changer-en-production'),
  jwtDuree: lire('JWT_DUREE', '12h'),

  /** Origines autorisées pour l'interface web, séparées par des virgules. */
  originesAutorisees: lire('CORS_ORIGINES', 'http://localhost:5173,http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /** Peuple la base au premier démarrage si elle est vide. */
  seedAuDemarrage: lire('SEED_AU_DEMARRAGE', 'true') === 'true',

  motDePasseParDefaut: lire('MOT_DE_PASSE_PAR_DEFAUT', 'gmao2026'),

  /**
   * Formulaire externe de demande d'intervention.
   *
   * Tout est facultatif : sans `FORMULAIRE_SOURCE`, le connecteur reste en
   * sommeil et l'application fonctionne comme avant.
   */
  formulaire: {
    /** « jotform », « microsoft », ou vide pour n'en brancher aucun. */
    source: lire('FORMULAIRE_SOURCE', ''),
    /** URL publique du formulaire, encodée dans le QR code des étiquettes. */
    url: lire('FORMULAIRE_URL', ''),
    /**
     * Paramètre d'URL qui reçoit le code d'inventaire pré-rempli. Pour
     * Microsoft Forms, c'est l'identifiant opaque que donne « Obtenir un lien
     * pré-rempli » — quelque chose comme « r8f3c1e0a… ».
     */
    paramCode: lire('FORMULAIRE_PARAM_CODE', 'equipement'),
    /**
     * Adresse publique de la GMAO, si les téléphones des services savent la
     * joindre. Renseignée, le QR des étiquettes passe par elle : la
     * destination se change ensuite sans réimprimer une étiquette.
     */
    baseQr: lire('FORMULAIRE_BASE_QR', '').replace(/\/+$/, ''),
    /** Correspondance question → champ de la demande, en JSON. */
    champs: lire('FORMULAIRE_CHAMPS', ''),
    /** Secret partagé exigé sur l'appel webhook. Vide = webhook fermé. */
    secretWebhook: lire('FORMULAIRE_SECRET_WEBHOOK', ''),
    /** Période de récupération, en minutes. 0 = pas de récupération automatique. */
    intervalleMin: Number(lire('FORMULAIRE_INTERVALLE_MIN', '5')),
    /** Compte porteur des demandes dont le déclarant n'est pas identifié. */
    compteService: lire('FORMULAIRE_COMPTE_SERVICE', ''),
  },

  jotform: {
    cleApi: lire('JOTFORM_API_KEY', ''),
    formulaireId: lire('JOTFORM_FORMULAIRE_ID', ''),
    /**
     * Racine de l'API. À changer pour « https://eu-api.jotform.com » si le
     * compte est hébergé dans la région européenne : l'API mondiale y répond
     * « form not found » pour un formulaire pourtant bien existant.
     */
    apiBase: lire('JOTFORM_API_BASE', 'https://api.jotform.com'),
  },

  microsoft: {
    /**
     * Comment la GMAO s'authentifie auprès de Microsoft.
     *
     * « delegue » : au nom d'un compte, par jeton de rafraîchissement. C'est
     * le seul flux possible avec un compte Microsoft personnel — outlook.fr,
     * hotmail.com, live.fr — qui n'a pas de locataire où déclarer des
     * autorisations d'application.
     *
     * « application » : sans utilisateur, réservé aux comptes professionnels.
     */
    auth: (lire('MSFORMS_AUTH', 'delegue') === 'application' ? 'application' : 'delegue') as
      | 'delegue'
      | 'application',
    /**
     * « graph » : la GMAO relit le classeur Excel que Forms alimente de
     * lui-même. C'est la voie par défaut, parce qu'elle ne demande rien
     * d'autre qu'un accès sortant — ni adresse publique, ni licence.
     *
     * « webhook » : une automatisation appelle la GMAO. Plus immédiat, mais
     * l'action HTTP de Power Automate est un connecteur payant, et le serveur
     * doit être joignable depuis Internet.
     */
    mode: lire('MSFORMS_MODE', 'graph'),
    /** « consumers » pour un compte personnel, l'identifiant du locataire sinon. */
    tenantId: lire('MSFORMS_TENANT_ID', 'consumers'),
    clientId: lire('MSFORMS_CLIENT_ID', ''),
    /** Vide pour une inscription de client public, ce qu'exige un compte personnel. */
    clientSecret: lire('MSFORMS_CLIENT_SECRET', ''),
    /**
     * Jeton de rafraîchissement de secours. Le jeton courant vit en base,
     * parce que Microsoft le remplace à chaque renouvellement ; celui-ci ne
     * sert qu'à amorcer une installation déjà autorisée ailleurs.
     */
    refreshToken: lire('MSFORMS_REFRESH_TOKEN', ''),
    /**
     * Portée demandée à Microsoft. « Files.Read » suffit pour lire son propre
     * OneDrive ; un classeur qu'un autre compte a partagé exige
     * « Files.Read.All », qui couvre tout ce que la personne peut déjà voir.
     */
    portee: lire('MSFORMS_PORTEE', 'Files.Read'),
    /** me:/chemin.xlsx, item:<id>, drive:<driveId>:item:<itemId>, drive:<driveId>:/chemin, site:… */
    classeur: lire('MSFORMS_CLASSEUR', ''),
    tableau: lire('MSFORMS_TABLEAU', 'Tableau1'),
    graphBase: lire('MSFORMS_GRAPH_BASE', 'https://graph.microsoft.com/v1.0'),
    jetonBase: lire('MSFORMS_JETON_BASE', 'https://login.microsoftonline.com'),
  },

};

export function verifierConfigProduction(): void {
  if (config.environnement !== 'production') return;
  if (config.jwtSecret.startsWith('developpement-seulement')) {
    throw new Error(
      'JWT_SECRET n’a pas été défini. Refus de démarrer en production avec la clé de développement.',
    );
  }
  if (config.bdd.motDePasse === 'gmao') {
    throw new Error('DB_PASSWORD n’a pas été défini. Refus de démarrer en production avec le mot de passe par défaut.');
  }
}

/**
 * Le connecteur peut-il aller chercher les réponses de lui-même ?
 *
 * Le webhook n'entre pas dans ce compte : il n'a rien à récupérer, c'est le
 * formulaire qui appelle.
 */
export function recuperationActive(): boolean {
  if (config.formulaire.intervalleMin <= 0) return false;
  if (config.formulaire.source === 'jotform') {
    return Boolean(config.jotform.cleApi && config.jotform.formulaireId);
  }
  if (config.formulaire.source === 'microsoft') {
    if (config.microsoft.mode !== 'graph') return false;
    if (!config.microsoft.clientId || !config.microsoft.classeur) return false;
    // En flux délégué, l'autorisation vit en base : la configuration seule ne
    // suffit pas à dire si le connecteur peut lire, et `demarrerCollecte` le
    // vérifiera. En flux application, le secret est exigé tout de suite.
    return config.microsoft.auth === 'delegue' || Boolean(config.microsoft.clientSecret);
  }
  return false;
}

/** Un formulaire est-il branché, par quelque chemin que ce soit ? */
export function formulaireBranche(): boolean {
  return Boolean(config.formulaire.source) && (recuperationActive() || Boolean(config.formulaire.secretWebhook));
}
