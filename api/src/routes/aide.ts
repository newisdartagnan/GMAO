import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { commande } from '../etat.ts';
import type { ContexteCommande } from '../etat.ts';
import { utilisateurDe } from '../auth.ts';

/** Erreur métier renvoyée telle quelle au client, avec son code HTTP. */
export class ErreurMetier extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}

export function valider<T extends ZodTypeAny>(schema: T, donnees: unknown): z.infer<T> {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    const details = r.error.issues
      .map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`)
      .join(' ; ');
    throw new ErreurMetier(`Données invalides — ${details}`, 422);
  }
  return r.data;
}

/**
 * Exécute une commande métier et répond avec le patch à appliquer côté client.
 * Les erreurs métier remontent avec leur message : l'utilisateur doit lire une
 * phrase compréhensible, pas une trace technique.
 */
export async function repondreCommande<T>(
  requete: FastifyRequest,
  reponse: FastifyReply,
  contexte: Omit<ContexteCommande, 'utilisateurId'>,
  fn: (b: import('@gmao/partage').BaseGMAO) => T,
): Promise<void> {
  const utilisateur = utilisateurDe(requete);
  try {
    const { resultat, patch } = await commande({ ...contexte, utilisateurId: utilisateur.sub }, fn);
    await reponse.send({ resultat, patch });
  } catch (e) {
    if (e instanceof ErreurMetier) {
      await reponse.code(e.code).send({ erreur: e.message });
      return;
    }
    requete.log.error({ err: e }, 'échec de commande');
    await reponse.code(500).send({ erreur: e instanceof Error ? e.message : 'Erreur interne' });
  }
}

export const idParam = z.object({ id: z.string().min(1) });
