import { createTransport } from 'nodemailer';
import { config } from '../config.ts';
import { joindre } from '../integrations/reseau.ts';

/**
 * Envoi de courriel, par le chemin que l'établissement peut emprunter.
 *
 * Trois transports, parce qu'aucun ne convient partout :
 *
 * — « journal » : rien ne part, le message est écrit dans les traces. C'est
 *   le défaut. Une GMAO qui se met à envoyer des courriels sans que personne
 *   l'ait demandé est une mauvaise surprise ; et pour éprouver le contenu
 *   d'un message, il n'y a pas besoin d'un compte.
 *
 * — « smtp » : le relais classique, qui marche avec à peu près tout.
 *
 * — « graph » : Microsoft Graph en mode application, pour un établissement
 *   sur Microsoft 365. Sans utilisateur derrière : aucun jeton à renouveler,
 *   rien à refaire quand quelqu'un s'en va.
 */

export interface Message {
  a: string[];
  sujet: string;
  texte: string;
  html?: string;
}

export interface Resultat {
  transport: string;
  envoye: boolean;
  detail: string;
}

/** Le transport est-il configuré au point de pouvoir envoyer ? */
export function courrielActif(): boolean {
  const c = config.courriel;
  if (c.transport === 'journal') return false;
  if (!c.expediteur) return false;
  if (c.transport === 'smtp') return Boolean(c.smtp.hote);
  if (c.transport === 'graph') return Boolean(c.graph.tenantId && c.graph.clientId && c.graph.clientSecret);
  return false;
}

/** Ce qui manque pour que le transport puisse envoyer, en clair. */
export function manquePourEnvoyer(): string[] {
  const c = config.courriel;
  const manques: string[] = [];
  if (c.transport === 'journal') {
    manques.push('COURRIEL_TRANSPORT vaut « journal » : rien n’est envoyé, tout est écrit dans les traces.');
    return manques;
  }
  if (!c.expediteur) manques.push('COURRIEL_EXPEDITEUR — l’adresse qui envoie');
  if (c.transport === 'smtp') {
    if (!c.smtp.hote) manques.push('COURRIEL_SMTP_HOTE — le serveur de relais');
  } else if (c.transport === 'graph') {
    if (!c.graph.tenantId) manques.push('COURRIEL_GRAPH_TENANT — l’identifiant du locataire Microsoft 365');
    if (!c.graph.clientId) manques.push('COURRIEL_GRAPH_CLIENT_ID — l’inscription d’application');
    if (!c.graph.clientSecret) manques.push('COURRIEL_GRAPH_SECRET — son secret');
  } else {
    manques.push(`COURRIEL_TRANSPORT vaut « ${c.transport} », attendu : journal, smtp ou graph.`);
  }
  return manques;
}

/* ------------------------------------------------------------------ */
/* Microsoft Graph, en mode application                                */
/* ------------------------------------------------------------------ */

let jetonGraph: { valeur: string; expireLe: number } | undefined;

/**
 * Jeton d'application pour Graph.
 *
 * Mode « client_credentials » : l'application agit pour elle-même, avec la
 * permission d'application Mail.Send accordée par un administrateur. Rien à
 * voir avec le jeton délégué du connecteur de formulaire, qui est attaché à
 * une personne et expire si elle ne s'en sert pas — un envoi de courriel ne
 * doit pas s'arrêter parce que quelqu'un a changé de poste.
 */
async function jetonApplication(): Promise<string> {
  if (jetonGraph && jetonGraph.expireLe > Date.now() + 60_000) return jetonGraph.valeur;

  const c = config.courriel.graph;
  const corps = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const r = await joindre(`${c.jetonBase}/${c.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
    signal: AbortSignal.timeout(20_000),
  });
  const donnees = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!r.ok || !donnees.access_token) {
    throw new Error(
      `Microsoft a refusé le jeton d’envoi : ${donnees.error_description?.split('\n')[0] ?? `HTTP ${r.status}`}`,
    );
  }
  jetonGraph = { valeur: donnees.access_token, expireLe: Date.now() + (donnees.expires_in ?? 3600) * 1000 };
  return jetonGraph.valeur;
}

async function envoyerParGraph(m: Message): Promise<Resultat> {
  const c = config.courriel;
  const jeton = await jetonApplication();
  const url = `${c.graph.base}/users/${encodeURIComponent(c.expediteur)}/sendMail`;

  const r = await joindre(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.sujet,
        body: { contentType: m.html ? 'HTML' : 'Text', content: m.html ?? m.texte },
        toRecipients: m.a.map((adresse) => ({ emailAddress: { address: adresse } })),
        ...(c.repondreA ? { replyTo: [{ emailAddress: { address: c.repondreA } }] } : {}),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!r.ok) {
    const texte = await r.text().catch(() => '');
    throw new Error(`Microsoft Graph a refusé l’envoi (${r.status}) : ${messageGraph(texte)}`);
  }
  return { transport: 'graph', envoye: true, detail: `envoyé depuis ${c.expediteur}` };
}

/** Les refus de Graph les plus fréquents, traduits en geste à faire. */
function messageGraph(corps: string): string {
  if (/ErrorAccessDenied|Access is denied/i.test(corps)) {
    return (
      'accès refusé. La permission d’APPLICATION « Mail.Send » doit être accordée à ' +
      'l’inscription, puis validée par un administrateur (Entra ID → Inscriptions ' +
      'd’applications → API autorisées → Accorder un consentement administrateur).'
    );
  }
  if (/ResourceNotFound|MailboxNotEnabled|ErrorInvalidUser/i.test(corps)) {
    return `la boîte « ${config.courriel.expediteur} » n’existe pas ou n’a pas de licence de messagerie.`;
  }
  return corps.slice(0, 240) || 'réponse vide';
}

/* ------------------------------------------------------------------ */
/* SMTP                                                                */
/* ------------------------------------------------------------------ */

async function envoyerParSmtp(m: Message): Promise<Resultat> {
  const c = config.courriel;
  const transporteur = createTransport({
    host: c.smtp.hote,
    port: c.smtp.port,
    // 465 est chiffré d'emblée ; 587 commence en clair et bascule par STARTTLS.
    secure: c.smtp.port === 465,
    auth: c.smtp.utilisateur ? { user: c.smtp.utilisateur, pass: c.smtp.motDePasse } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });

  const info = await transporteur.sendMail({
    from: c.nomExpediteur ? `${c.nomExpediteur} <${c.expediteur}>` : c.expediteur,
    to: m.a.join(', '),
    replyTo: c.repondreA || undefined,
    subject: m.sujet,
    text: m.texte,
    html: m.html,
  });
  return { transport: 'smtp', envoye: true, detail: `accepté par ${c.smtp.hote} (${info.messageId})` };
}

/* ------------------------------------------------------------------ */

/**
 * Envoie, ou dit pourquoi il n'a pas envoyé.
 *
 * Ne lève jamais : un courriel qui ne part pas ne doit pas faire échouer
 * l'affectation qui l'a déclenché. Le technicien verra son ordre de travail
 * à l'écran de toute façon ; c'est la notification qui manque, pas le
 * travail.
 */
export async function envoyer(m: Message): Promise<Resultat> {
  const c = config.courriel;
  if (!m.a.length) return { transport: c.transport, envoye: false, detail: 'aucun destinataire' };

  if (!courrielActif()) {
    return {
      transport: 'journal',
      envoye: false,
      detail:
        `[non envoyé] à ${m.a.join(', ')} — ${m.sujet}\n` +
        m.texte.replace(/^/gm, '    ') +
        (c.transport === 'journal' ? '' : `\n  manque : ${manquePourEnvoyer().join(' ; ')}`),
    };
  }

  try {
    return c.transport === 'graph' ? await envoyerParGraph(m) : await envoyerParSmtp(m);
  } catch (e) {
    return { transport: c.transport, envoye: false, detail: (e as Error).message };
  }
}
