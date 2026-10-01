import { Resolver } from 'node:dns/promises';
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
    throw new Error(`Microsoft a refusé le jeton d’envoi : ${messageJeton(donnees.error_description, r.status)}`);
  }
  jetonGraph = { valeur: donnees.access_token, expireLe: Date.now() + (donnees.expires_in ?? 3600) * 1000 };
  return jetonGraph.valeur;
}

/**
 * Les refus de Microsoft à la demande de jeton, dits en clair.
 *
 * Ces quatre-là sont ceux qu'on rencontre en remplissant les trois lignes de
 * configuration, et le code AADSTS seul ne dit pas laquelle est en cause :
 * « AADSTS7000215 » ne désigne pas le secret pour qui ne le sait pas déjà.
 * Le message nomme la variable à corriger.
 */
export function messageJeton(description: string | undefined, statut: number): string {
  const d = description?.split('\n')[0] ?? `HTTP ${statut}`;

  if (/AADSTS7000215/.test(d)) {
    return (
      'le secret est refusé. COURRIEL_GRAPH_SECRET attend la VALEUR du secret, ' +
      'celle qui n’est affichée qu’une fois à sa création — pas son « ID de secret ».'
    );
  }
  if (/AADSTS7000222/.test(d)) {
    return 'le secret a expiré. En créer un nouveau dans Certificats et secrets, et remplacer COURRIEL_GRAPH_SECRET.';
  }
  if (/AADSTS90002/.test(d)) {
    return (
      `le locataire « ${config.courriel.graph.tenantId} » est introuvable. COURRIEL_GRAPH_TENANT attend ` +
      'l’identifiant de locataire (Entra ID → Vue d’ensemble) ou un domaine vérifié du locataire.'
    );
  }
  if (/AADSTS700016|AADSTS70001/.test(d)) {
    return (
      `l’application « ${config.courriel.graph.clientId} » n’existe pas dans ce locataire. ` +
      'COURRIEL_GRAPH_CLIENT_ID attend l’« ID d’application (client) », pas l’ID d’objet ni l’ID de répertoire.'
    );
  }
  return d;
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
export function messageGraph(corps: string): string {
  if (/ErrorAccessDenied|Access is denied/i.test(corps)) {
    return (
      'accès refusé. La permission d’APPLICATION « Mail.Send » doit être accordée à ' +
      'l’inscription, puis validée par un administrateur (Entra ID → Inscriptions ' +
      'd’applications → API autorisées → Accorder un consentement administrateur).'
    );
  }
  // Graph distingue « cet objet n'existe pas » de « il existe mais n'a pas de
  // boîte exploitable ». Les deux se réparent à des endroits différents du
  // centre d'administration, et le code seul ne dit pas lequel.
  if (/MailboxNotEnabledForRESTAPI|MailboxNotSupportedForRESTAPI/i.test(corps)) {
    return (
      `« ${config.courriel.expediteur} » existe, mais Graph n’y voit pas de boîte Exchange ` +
      'Online. La cause la plus fréquente n’est pas un défaut de réglage : la messagerie du ' +
      'domaine est hébergée ailleurs. Un locataire Entra ID ne met pas le courrier chez ' +
      'Microsoft — l’enregistrement MX du domaine le dit. S’il ne pointe pas vers ' +
      '« mail.protection.outlook.com », Graph ne pourra jamais envoyer : prenez ' +
      'COURRIEL_TRANSPORT=smtp, avec le relais de l’hébergeur. Sinon : boîte restée sur un ' +
      'Exchange local, boîte inactive, ou objet sans boîte.'
    );
  }
  if (/ResourceNotFound|ErrorInvalidUser|ErrorNonExistentMailbox|ObjectNotFound/i.test(corps)) {
    return (
      `Graph ne trouve aucune boîte à « ${config.courriel.expediteur} ». Trois causes, par ` +
      'ordre de fréquence : (1) c’est un ALIAS et non l’adresse principale — Graph exige ' +
      'l’adresse principale, ou le nom d’utilisateur principal ; (2) c’est un groupe ou une ' +
      'liste de distribution, qui ne peut pas envoyer ; (3) la boîte n’existe pas. Une boîte ' +
      'partagée convient et ne consomme pas de licence.'
    );
  }
  return corps.slice(0, 240) || 'réponse vide';
}

/**
 * La messagerie du domaine est-elle hébergée par Microsoft 365 ?
 *
 * Graph n'envoie que depuis une boîte Exchange Online. Un locataire Entra ID
 * ne garantit rien là-dessus : l'identité peut être chez Microsoft et le
 * courrier ailleurs. Dans ce cas « Mail.Send » est accordé, le jeton est
 * délivré, et l'envoi échoue sur une boîte pourtant bien vivante — rien, dans
 * le refus, ne dit que la messagerie n'est tout simplement pas là.
 *
 * L'enregistrement MX du domaine tranche en une requête, sans identifiants.
 */
export async function hebergeurDeCourrier(adresse: string): Promise<{
  microsoft365: boolean;
  mx: string[];
}> {
  const domaine = adresse.split('@')[1];
  if (!domaine) return { microsoft365: false, mx: [] };
  try {
    const r = new Resolver();
    const enregistrements = await r.resolveMx(domaine);
    const mx = enregistrements
      .sort((a, b) => a.priority - b.priority)
      .map((e) => e.exchange.toLowerCase());
    return { microsoft365: mx.some((e) => e.endsWith('mail.protection.outlook.com')), mx };
  } catch {
    return { microsoft365: false, mx: [] };
  }
}

/** Ce que l'annuaire sait de l'expéditeur, quand il veut bien le dire. */
export interface Expediteur {
  etat: 'trouve' | 'absent' | 'inconnu';
  detail: string;
}

/**
 * Interroge l'annuaire sur l'adresse d'envoi.
 *
 * Un « 404 » au moment d'envoyer ne dit pas si l'adresse désigne un objet
 * inexistant ou un objet sans boîte — et la réparation n'est pas la même.
 * Cette vérification sépare les deux.
 *
 * Elle demande « User.Read.All », que l'envoi n'exige pas. Ne pas l'avoir
 * n'est donc pas une anomalie : la fonction le dit et s'arrête là, plutôt
 * que de faire passer une permission facultative pour un défaut.
 */
export async function verifierExpediteur(): Promise<Expediteur> {
  const c = config.courriel;
  if (c.transport !== 'graph' || !courrielActif()) return { etat: 'inconnu', detail: 'sans objet' };

  try {
    const jeton = await jetonApplication();
    const url =
      `${c.graph.base}/users/${encodeURIComponent(c.expediteur)}` +
      '?$select=displayName,mail,userPrincipalName,accountEnabled';
    const r = await joindre(url, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });

    if (r.status === 403) {
      return {
        etat: 'inconnu',
        detail: 'annuaire non consultable (User.Read.All non accordé) — sans conséquence pour l’envoi',
      };
    }
    if (r.status === 404) {
      return {
        etat: 'absent',
        detail:
          'aucun objet d’annuaire à cette adresse — c’est un alias, un groupe, ' +
          'ou l’adresse est inexacte',
      };
    }
    if (!r.ok) return { etat: 'inconnu', detail: `annuaire : HTTP ${r.status}` };

    const u = (await r.json()) as {
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
      accountEnabled?: boolean;
    };
    const principale = u.mail ?? u.userPrincipalName ?? '';
    // Si l'adresse configurée n'est pas l'adresse principale, c'est un alias :
    // l'envoi peut échouer alors que l'objet existe bel et bien.
    const alias = principale && principale.toLowerCase() !== c.expediteur.toLowerCase();
    return {
      etat: 'trouve',
      detail:
        `${u.displayName ?? '(sans nom)'} — ${principale}` +
        (alias ? ` — ATTENTION : adresse principale différente, mettez celle-ci dans COURRIEL_EXPEDITEUR` : '') +
        (u.accountEnabled === false ? ' — compte désactivé' : ''),
    };
  } catch (e) {
    return { etat: 'inconnu', detail: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ */
/* SMTP                                                                */
/* ------------------------------------------------------------------ */

/**
 * Les refus d'un relais SMTP, dits en clair.
 *
 * nodemailer rend un code court et le texte brut du serveur. « EAUTH » ne
 * dit pas qu'un mot de passe d'application est exigé, et « ESOCKET » ne dit
 * pas que 465 et 587 ne se parlent pas de la même façon.
 */
export function messageSmtp(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const code = err.code ?? '';
  const texte = err.message ?? String(e);
  const c = config.courriel;

  // nodemailer enveloppe la cause réseau dans un « ESOCKET » générique et ne
  // laisse « ECONNREFUSED » que dans le message. S'en tenir au code faisait
  // annoncer un échec TLS sur un port simplement fermé — et chercher du côté
  // du chiffrement une panne qui n'a rien à y voir.
  const signature = `${code} ${texte}`;

  if (/ECONNREFUSED/.test(signature)) {
    return `${c.smtp.hote}:${c.smtp.port} refuse la connexion. Vérifiez COURRIEL_SMTP_HOTE et COURRIEL_SMTP_PORT.`;
  }
  if (/ETIMEDOUT|ECONNECTION|EDNS|ENOTFOUND|EAI_AGAIN/.test(signature)) {
    return (
      `${c.smtp.hote}:${c.smtp.port} ne répond pas. Soit le nom est inexact, soit le port ` +
      'sortant est fermé — depuis un conteneur, le 587 et le 465 le sont souvent par défaut.'
    );
  }
  if (/EAUTH/.test(code) || err.responseCode === 535) {
    return (
      'le relais refuse l’authentification. Avec la double authentification activée, la ' +
      'plupart des hébergeurs exigent un MOT DE PASSE D’APPLICATION dédié, et non le mot de ' +
      'passe habituel de la boîte.'
    );
  }
  if (/ESOCKET|ETLS|CERT|SELF_SIGNED|wrong version number/i.test(signature)) {
    return (
      `échec TLS avec ${c.smtp.hote}:${c.smtp.port}. Le 465 est chiffré d’emblée, le 587 ` +
      'commence en clair et bascule par STARTTLS : les intervertir donne exactement cette erreur.'
    );
  }
  if (/EENVELOPE/.test(code) || err.responseCode === 553 || err.responseCode === 550) {
    return (
      `l’adresse d’envoi « ${c.expediteur} » est refusée. La plupart des relais n’acceptent ` +
      'que l’adresse du compte authentifié, ou l’un de ses alias vérifiés : COURRIEL_EXPEDITEUR ' +
      'et COURRIEL_SMTP_UTILISATEUR doivent désigner la même boîte.'
    );
  }
  return code ? `${texte} (${code})` : texte;
}

/**
 * Éprouve la connexion et l'authentification, sans envoyer.
 *
 * Distingue « le relais est injoignable » de « il refuse le mot de passe » de
 * « il refuse l'expéditeur » — trois réparations différentes, que le seul
 * échec d'un envoi ne sépare pas.
 */
export async function verifierSmtp(): Promise<{ ok: boolean; detail: string }> {
  const c = config.courriel;
  if (c.transport !== 'smtp' || !courrielActif()) return { ok: false, detail: 'sans objet' };
  try {
    await transporteurSmtp().verify();
    return { ok: true, detail: `${c.smtp.hote}:${c.smtp.port} accepte la connexion` };
  } catch (e) {
    return { ok: false, detail: messageSmtp(e) };
  }
}

/** Le relais configuré, monté une fois par envoi. */
function transporteurSmtp() {
  const c = config.courriel;
  return createTransport({
    host: c.smtp.hote,
    port: c.smtp.port,
    // 465 est chiffré d'emblée ; 587 commence en clair et bascule par STARTTLS.
    secure: c.smtp.port === 465,
    auth: c.smtp.utilisateur ? { user: c.smtp.utilisateur, pass: c.smtp.motDePasse } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });
}

async function envoyerParSmtp(m: Message): Promise<Resultat> {
  const c = config.courriel;
  const info = await transporteurSmtp().sendMail({
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
    return {
      transport: c.transport,
      envoye: false,
      detail: c.transport === 'smtp' ? messageSmtp(e) : (e as Error).message,
    };
  }
}
