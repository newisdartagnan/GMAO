import type { FastifyInstance } from 'fastify';

/**
 * Lecture des corps de requête envoyés par un formulaire.
 *
 * JotForm poste ses notifications en `multipart/form-data` (et parfois en
 * `application/x-www-form-urlencoded`), que Fastify ne sait pas lire seul.
 * Plutôt que d'ajouter deux dépendances pour une seule route, les deux
 * formats sont décodés ici : ce sont des champs de texte, la charge utile
 * étant une chaîne JSON dans « rawRequest ». Les fichiers joints n'ont pas à
 * être traités — JotForm les héberge et n'en transmet que l'URL.
 */

const TAILLE_MAX = 2 * 1024 * 1024;

function lireDisposition(entetes: string): { nom?: string; fichier?: boolean } {
  const ligne = entetes
    .split('\r\n')
    .find((l) => l.toLowerCase().startsWith('content-disposition:'));
  if (!ligne) return {};
  const nom = /;\s*name="([^"]*)"/i.exec(ligne)?.[1];
  return { nom, fichier: /;\s*filename=/i.test(ligne) };
}

export function decouperMultipart(corps: Buffer, frontiere: string): Record<string, string> {
  const separateur = Buffer.from(`--${frontiere}`);
  const champs: Record<string, string> = {};

  let position = corps.indexOf(separateur);
  if (position === -1) return champs;
  position += separateur.length;

  while (position < corps.length) {
    // Fin de corps : « --frontiere-- ».
    if (corps[position] === 0x2d && corps[position + 1] === 0x2d) break;
    // Saut du CRLF qui suit la frontière.
    if (corps[position] === 0x0d) position += 2;

    const finEntetes = corps.indexOf('\r\n\r\n', position);
    if (finEntetes === -1) break;
    const entetes = corps.subarray(position, finEntetes).toString('utf8');
    const debutValeur = finEntetes + 4;

    const suivant = corps.indexOf(separateur, debutValeur);
    const finValeur = suivant === -1 ? corps.length : suivant - 2; // retrait du CRLF final

    const { nom, fichier } = lireDisposition(entetes);
    if (nom && !fichier) champs[nom] = corps.subarray(debutValeur, Math.max(debutValeur, finValeur)).toString('utf8');

    if (suivant === -1) break;
    position = suivant + separateur.length;
  }

  return champs;
}

export function decouperUrlencoded(corps: string): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const [cle, valeur] of new URLSearchParams(corps)) champs[cle] = valeur;
  return champs;
}

/** Branche les deux décodeurs sur l'instance Fastify. */
export function enregistrerCorpsFormulaire(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: TAILLE_MAX },
    (_requete, corps, fait) => {
      try {
        fait(null, decouperUrlencoded(corps as string));
      } catch (e) {
        fait(e as Error, undefined);
      }
    },
  );

  app.addContentTypeParser(
    /^multipart\/form-data/,
    { parseAs: 'buffer', bodyLimit: TAILLE_MAX },
    (requete, corps, fait) => {
      const frontiere = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(requete.headers['content-type'] ?? '');
      const valeur = frontiere?.[1] ?? frontiere?.[2];
      if (!valeur) {
        fait(new Error('multipart/form-data sans frontière'), undefined);
        return;
      }
      try {
        fait(null, decouperMultipart(corps as Buffer, valeur.trim()));
      } catch (e) {
        fait(e as Error, undefined);
      }
    },
  );
}
