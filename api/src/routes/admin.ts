import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uid } from '@gmao/partage';
import type { RoleUtilisateur, Utilisateur } from '@gmao/partage';
import { definirMotDePasse, exiger, hacher } from '../auth.ts';
import { ErreurMetier, idParam, repondreCommande, valider } from './aide.ts';
import { lireBase, rechargerDepuisBase } from '../etat.ts';
import { pool } from '../db/pool.ts';
import { config } from '../config.ts';

const ROLES = [
  'admin', 'responsable_biomedical', 'responsable_technique', 'technicien', 'magasinier',
  'acheteur', 'demandeur', 'qualite', 'direction', 'prestataire',
] as const;

export async function routesAdmin(app: FastifyInstance): Promise<void> {
  /** Comptes, avec l'information d'accès que l'agrégat métier ne porte pas. */
  app.get('/api/admin/utilisateurs', { preHandler: exiger('comptes') }, async (_requete, reponse) => {
    const { rows } = await pool.query(`
      SELECT id, matricule, nom, prenom, email, role, equipe_id, service_id, actif,
             (mot_de_passe_hash IS NOT NULL) AS acces_ouvert,
             derniere_connexion
        FROM utilisateurs
       ORDER BY nom, prenom
    `);
    return reponse.send({ utilisateurs: rows });
  });

  app.post('/api/admin/utilisateurs', { preHandler: exiger('comptes') }, async (requete, reponse) => {
    const d = valider(
      z.object({
        nom: z.string().min(1),
        prenom: z.string().min(1),
        email: z.string().email('adresse électronique invalide'),
        matricule: z.string().min(1),
        role: z.enum(ROLES),
        equipeId: z.string().optional(),
        serviceId: z.string().optional(),
        siteId: z.string().optional(),
        telephone: z.string().optional(),
        tauxHoraire: z.number().min(0).default(0),
        motDePasse: z.string().min(8, 'huit caractères au minimum').optional(),
      }),
      requete.body,
    );

    const base = lireBase();
    if (base.utilisateurs.some((u) => u.email.toLowerCase() === d.email.toLowerCase())) {
      throw new ErreurMetier('Cette adresse est déjà utilisée par un autre compte.', 409);
    }

    const nouvelId = uid('usr');
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Création du compte ${d.prenom} ${d.nom}`, action: 'creation', entiteType: 'utilisateur', entiteId: nouvelId },
      (b) => {
        const utilisateur: Utilisateur = {
          id: nouvelId,
          matricule: d.matricule,
          nom: d.nom,
          prenom: d.prenom,
          email: d.email,
          telephone: d.telephone,
          role: d.role as RoleUtilisateur,
          equipeId: d.equipeId,
          siteId: d.siteId ?? b.sites[0].id,
          serviceId: d.serviceId,
          competences: [],
          tauxHoraire: d.tauxHoraire,
          actif: true,
        };
        b.utilisateurs.push(utilisateur);
        return utilisateur;
      },
    );

    // Le mot de passe vit hors de l'agrégat : il est écrit après coup, sur la
    // ligne que la commande vient de créer.
    await pool.query('UPDATE utilisateurs SET mot_de_passe_hash = $2 WHERE id = $1', [
      nouvelId,
      hacher(d.motDePasse ?? config.motDePasseParDefaut),
    ]);
  });

  app.patch('/api/admin/utilisateurs/:id', { preHandler: exiger('comptes') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z
        .object({
          nom: z.string().min(1),
          prenom: z.string().min(1),
          email: z.string().email(),
          telephone: z.string(),
          role: z.enum(ROLES),
          equipeId: z.string(),
          serviceId: z.string(),
          tauxHoraire: z.number().min(0),
          actif: z.boolean(),
        })
        .partial(),
      requete.body,
    );
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Modification du compte ${id}`, entiteType: 'utilisateur', entiteId: id },
      (b) => {
        const u = b.utilisateurs.find((x) => x.id === id);
        if (!u) throw new ErreurMetier('Compte introuvable', 404);
        for (const [champ, valeur] of Object.entries(d)) {
          (u as unknown as Record<string, unknown>)[champ] = valeur === '' ? undefined : valeur;
        }
        return u;
      },
    );
  });

  app.post('/api/admin/utilisateurs/:id/mot-de-passe', { preHandler: exiger('comptes') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { motDePasse } = valider(
      z.object({ motDePasse: z.string().min(8, 'huit caractères au minimum') }),
      requete.body,
    );
    if (!lireBase().utilisateurs.some((u) => u.id === id)) throw new ErreurMetier('Compte introuvable', 404);
    await definirMotDePasse(id, motDePasse);
    return reponse.send({ ok: true });
  });

  /** Recharge l'état depuis PostgreSQL, après une intervention directe en SQL. */
  app.post('/api/admin/recharger', { preHandler: exiger('comptes') }, async (_requete, reponse) => {
    const base = await rechargerDepuisBase();
    return reponse.send({
      ok: true,
      equipements: base.equipements.length,
      ordresTravail: base.ordresTravail.length,
      rondes: base.rondes.length,
    });
  });

  /** Volumétrie par table : ce que l'administrateur regarde en premier. */
  app.get('/api/admin/statistiques', { preHandler: exiger('comptes') }, async (_requete, reponse) => {
    const { rows } = await pool.query(`
      SELECT relname AS table, n_live_tup AS lignes
        FROM pg_stat_user_tables
       ORDER BY n_live_tup DESC
    `);
    const { rows: taille } = await pool.query(
      'SELECT pg_size_pretty(pg_database_size(current_database())) AS taille',
    );
    const { rows: migrations } = await pool.query(
      'SELECT version, applique_le FROM schema_migrations ORDER BY version',
    );
    return reponse.send({ tables: rows, tailleBase: taille[0].taille, migrations });
  });
}
