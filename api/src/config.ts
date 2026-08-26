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
   * Formulaire externe de demande d'intervention (JotForm).
   *
   * Tout est optionnel : sans clé d'API ni identifiant de formulaire le
   * connecteur reste en sommeil et l'application fonctionne comme avant.
   */
  jotform: {
    cleApi: lire('JOTFORM_API_KEY', ''),
    formulaireId: lire('JOTFORM_FORMULAIRE_ID', ''),
    /**
     * Racine de l'API. À changer pour « https://eu-api.jotform.com » si le
     * compte est hébergé dans la région européenne : l'API mondiale y répond
     * « form not found » pour un formulaire pourtant bien existant.
     */
    apiBase: lire('JOTFORM_API_BASE', 'https://api.jotform.com'),
    /** URL publique du formulaire, encodée dans le QR code des étiquettes. */
    urlFormulaire: lire('JOTFORM_URL_FORMULAIRE', ''),
    /** Nom du champ qui reçoit le code d'inventaire pré-rempli. */
    champCode: lire('JOTFORM_CHAMP_CODE', 'equipement'),
    /** Correspondance champ du formulaire → champ de la demande, en JSON. */
    champs: lire('JOTFORM_CHAMPS', ''),
    /** Secret partagé exigé sur l'appel webhook. Vide = webhook fermé. */
    secretWebhook: lire('JOTFORM_SECRET_WEBHOOK', ''),
    /** Période de récupération, en minutes. 0 = pas de récupération automatique. */
    intervalleMin: Number(lire('JOTFORM_INTERVALLE_MIN', '5')),
    /** Compte porteur des demandes dont le déclarant n'est pas identifié. */
    compteService: lire('JOTFORM_COMPTE_SERVICE', ''),
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

/** Le connecteur ne peut interroger JotForm que s'il a de quoi le faire. */
export function jotformRecuperationActive(): boolean {
  return Boolean(config.jotform.cleApi && config.jotform.formulaireId && config.jotform.intervalleMin > 0);
}
