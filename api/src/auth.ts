import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RoleUtilisateur } from '@gmao/partage';
import { pool } from './db/pool.ts';

/**
 * Authentification et droits.
 *
 * Les rôles suivent l'organisation réelle d'un service technique : qui peut
 * signaler, qui peut planifier, qui peut clôturer, qui peut engager une
 * dépense. Le contrôle se fait ici, jamais dans l'interface : masquer un
 * bouton n'a jamais empêché personne d'appeler une route.
 */

export interface Jeton {
  sub: string;
  role: RoleUtilisateur;
  nom: string;
}

export const COUT_HACHAGE = 10;

export function hacher(motDePasse: string): string {
  return bcrypt.hashSync(motDePasse, COUT_HACHAGE);
}

export function verifier(motDePasse: string, hash: string): boolean {
  return bcrypt.compareSync(motDePasse, hash);
}

/** Permissions par domaine fonctionnel. */
export const DROITS = {
  /** Consulter l'application. */
  lire: [
    'admin', 'direction', 'qualite', 'responsable_biomedical', 'responsable_technique',
    'technicien', 'magasinier', 'acheteur', 'demandeur', 'prestataire',
  ],
  /** Émettre une demande d'intervention. */
  signaler: [
    'admin', 'direction', 'qualite', 'responsable_biomedical', 'responsable_technique',
    'technicien', 'magasinier', 'acheteur', 'demandeur',
  ],
  /** Qualifier une demande, créer et planifier un ordre de travail. */
  planifier: ['admin', 'responsable_biomedical', 'responsable_technique'],
  /** Renseigner et terminer une intervention. */
  intervenir: ['admin', 'responsable_biomedical', 'responsable_technique', 'technicien', 'prestataire'],
  /** Valider la clôture, viser une ronde, lever une réserve. */
  valider: ['admin', 'responsable_biomedical', 'responsable_technique', 'qualite'],
  /** Mouvementer le stock et réceptionner. */
  magasin: ['admin', 'magasinier', 'responsable_biomedical', 'responsable_technique'],
  /** Engager une commande. */
  acheter: ['admin', 'acheteur', 'responsable_biomedical', 'responsable_technique'],
  /** Saisir une ronde d'inspection. */
  inspecter: ['admin', 'technicien', 'responsable_technique', 'responsable_biomedical'],
  /** Modifier le parc et les référentiels. */
  administrer: ['admin', 'responsable_biomedical', 'responsable_technique'],
  /** Gérer les comptes. */
  comptes: ['admin'],
} as const satisfies Record<string, readonly RoleUtilisateur[]>;

export type Droit = keyof typeof DROITS;

export function aLeDroit(role: RoleUtilisateur, droit: Droit): boolean {
  return (DROITS[droit] as readonly string[]).includes(role);
}

/** Garde de route : exige un jeton valide et, si demandé, un droit précis. */
export function exiger(droit?: Droit) {
  return async (requete: FastifyRequest, reponse: FastifyReply) => {
    try {
      await requete.jwtVerify();
    } catch {
      return reponse.code(401).send({ erreur: 'Authentification requise' });
    }
    const jeton = requete.user as Jeton;
    if (droit && !aLeDroit(jeton.role, droit)) {
      return reponse.code(403).send({
        erreur: `Votre profil (${jeton.role.replace(/_/g, ' ')}) ne permet pas cette opération.`,
      });
    }
  };
}

export function utilisateurDe(requete: FastifyRequest): Jeton {
  return requete.user as Jeton;
}

export async function trouverParEmail(email: string) {
  const { rows } = await pool.query(
    `SELECT id, email, nom, prenom, role, actif, mot_de_passe_hash
       FROM utilisateurs WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] as
    | { id: string; email: string; nom: string; prenom: string; role: RoleUtilisateur; actif: boolean; mot_de_passe_hash: string | null }
    | undefined;
}

export async function definirMotDePasse(utilisateurId: string, motDePasse: string): Promise<void> {
  await pool.query('UPDATE utilisateurs SET mot_de_passe_hash = $2 WHERE id = $1', [
    utilisateurId,
    hacher(motDePasse),
  ]);
}

export async function marquerConnexion(utilisateurId: string): Promise<void> {
  await pool.query('UPDATE utilisateurs SET derniere_connexion = now() WHERE id = $1', [utilisateurId]);
}
