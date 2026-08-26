import type { FastifyInstance } from 'fastify';
import { exiger } from '../auth.ts';
import { lireBase, etatPret } from '../etat.ts';
import { routesAuth } from './auth.ts';
import { routesParc } from './parc.ts';
import { routesInterventions } from './interventions.ts';
import { routesLogistique } from './logistique.ts';
import { routesInspections } from './inspections.ts';
import { routesAdmin } from './admin.ts';
import { routesIntegrations } from './integrations.ts';

export async function enregistrerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sante', async () => ({
    statut: etatPret() ? 'pret' : 'chargement',
    heure: new Date().toISOString(),
  }));

  /**
   * Instantané complet de la base. L'interface le charge une fois à
   * l'ouverture, puis n'applique plus que les patchs renvoyés par chaque
   * écriture : une seule requête lourde au démarrage plutôt qu'une rafale de
   * requêtes à chaque écran, ce qui compte sur une liaison lente.
   */
  app.get('/api/snapshot', { preHandler: exiger('lire') }, async (_requete, reponse) => {
    return reponse.send(lireBase());
  });

  await app.register(routesAuth);
  await app.register(routesParc);
  await app.register(routesInterventions);
  await app.register(routesLogistique);
  await app.register(routesInspections);
  await app.register(routesAdmin);
  await app.register(routesIntegrations);
}
