import { construireBaseDemo } from '@gmao/partage';
import { transaction } from './db/pool.ts';
import { ecrireBaseComplete, viderBase } from './db/ecrire.ts';
import { hacher } from './auth.ts';
import { config } from './config.ts';

/**
 * Peuplement initial.
 *
 * La base de démonstration décrit un hôpital général de référence complet.
 * Elle sert à deux choses : disposer d'un environnement d'évaluation réaliste,
 * et vérifier que le schéma supporte le volume réel d'un établissement de
 * cette taille avant d'y verser les vraies données.
 *
 * Pour démarrer sur une base vierge, mettre SEED_AU_DEMARRAGE=false : seuls
 * les comptes d'accès seront à créer.
 */
export interface ResumePeuplement {
  entites: number;
  equipements: number;
  ordresTravail: number;
  rondes: number;
  comptes: number;
}

export async function peupler(remplacer = false): Promise<ResumePeuplement> {
  const base = construireBaseDemo();

  return transaction(async (client) => {
    if (remplacer) await viderBase(client);
    const entites = await ecrireBaseComplete(client, base);

    // Chaque compte reçoit le même mot de passe initial, à changer à la
    // première connexion. Il n'existe pas de compte sans mot de passe : un
    // accès muet est plus dangereux qu'un accès trop simple.
    const hash = hacher(config.motDePasseParDefaut);
    const { rowCount } = await client.query(
      'UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE mot_de_passe_hash IS NULL',
      [hash],
    );

    // Le peuplement ne se rejoue pas : la trace survit aux purges, de sorte
    // qu'une base vidée pour recevoir les données réelles le reste.
    await client.query(
      `INSERT INTO installation (cle, valeur) VALUES ('peuplement_initial', $1)
       ON CONFLICT (cle) DO NOTHING`,
      [`jeu de démonstration, ${entites} entités`],
    );

    return {
      entites,
      equipements: base.equipements.length,
      ordresTravail: base.ordresTravail.length,
      rondes: base.rondes.length,
      comptes: rowCount ?? 0,
    };
  });
}
