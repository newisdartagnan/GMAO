/** Configuration lue une seule fois au démarrage, avec des défauts de développement. */

function lire(nom: string, defaut?: string): string {
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
    base: lire('DB_NAME', 'gmao'),
    utilisateur: lire('DB_USER', 'gmao'),
    motDePasse: lire('DB_PASSWORD', 'gmao'),
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
     * « webhook » : Power Automate appelle la GMAO, qui doit être joignable
     * depuis Internet. « graph » : la GMAO relit un classeur Excel alimenté
     * par le flux, sans rien exposer.
     */
    mode: lire('MSFORMS_MODE', 'webhook'),
    tenantId: lire('MSFORMS_TENANT_ID', ''),
    clientId: lire('MSFORMS_CLIENT_ID', ''),
    clientSecret: lire('MSFORMS_CLIENT_SECRET', ''),
    /** drive:<driveId>:/chemin.xlsx ou site:<hote>:/sites/<nom>:/chemin.xlsx */
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
    return (
      config.microsoft.mode === 'graph' &&
      Boolean(
        config.microsoft.tenantId &&
          config.microsoft.clientId &&
          config.microsoft.clientSecret &&
          config.microsoft.classeur,
      )
    );
  }
  return false;
}

/** Un formulaire est-il branché, par quelque chemin que ce soit ? */
export function formulaireBranche(): boolean {
  return Boolean(config.formulaire.source) && (recuperationActive() || Boolean(config.formulaire.secretWebhook));
}
