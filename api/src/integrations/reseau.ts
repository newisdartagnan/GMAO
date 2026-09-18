/** Appels sortants, et ce qu'on dit quand ils n'aboutissent pas. */

/**
 * Pourquoi la connexion ne s'est pas faite, en toutes lettres.
 *
 * Quand rien ne répond, « fetch » lève un « TypeError: fetch failed » qui ne
 * dit ni où ni pourquoi : le motif réel est rangé dans « cause », parfois
 * deux niveaux plus bas. Tel quel, le message ne distingue pas un conteneur
 * sans résolveur DNS d'un pare-feu qui coupe, d'un proxy qui refuse le
 * certificat — trois pannes qui ne se réparent pas du même geste.
 */
export function raisonReseau(e: unknown): string {
  let cause: unknown = e;
  const codes: string[] = [];
  let message = e instanceof Error ? e.message : String(e);
  for (let i = 0; i < 5 && cause; i += 1) {
    const c = cause as { code?: string; message?: string; cause?: unknown };
    if (c.code) codes.push(c.code);
    if (c.message) message = c.message;
    cause = c.cause;
  }
  const code = codes[codes.length - 1] ?? '';

  if (/AbortError|TimeoutError/.test(String((e as Error)?.name))) {
    return 'aucune réponse dans le délai imparti';
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) {
    return 'nom de domaine introuvable — le conteneur n’a pas de résolveur DNS, ou pas de sortie vers Internet';
  }
  if (/ECONNREFUSED/.test(code)) return 'connexion refusée';
  if (/ECONNRESET|UND_ERR_SOCKET/.test(code)) return 'connexion coupée en cours de route';
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/.test(code)) return 'délai dépassé avant d’établir la connexion';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) {
    return 'certificat TLS refusé — un proxy d’entreprise s’interpose sans que son autorité soit connue du conteneur';
  }
  return code ? `${message} (${code})` : message;
}

/** L'hôte d'une URL, pour dire à qui la GMAO n'a pas pu parler. */
function hoteDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Un appel réseau dont l'échec se lit.
 *
 * Tous les appels sortants passent par ici : ce qui remonte nomme l'hôte
 * qu'on n'a pas pu joindre et la raison, au lieu d'un « fetch failed » nu.
 */
export async function joindre(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(`Impossible de joindre ${hoteDe(url)} : ${raisonReseau(e)}`);
  }
}
