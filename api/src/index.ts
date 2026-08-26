import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config, verifierConfigProduction } from './config.ts';
import { attendreBase, pool } from './db/pool.ts';
import { migrer } from './db/migrations.ts';
import { baseEstVide } from './db/charger.ts';
import { initialiserEtat } from './etat.ts';
import { peupler } from './peuplement.ts';
import { enregistrerRoutes } from './routes/index.ts';
import { ErreurMetier } from './routes/aide.ts';
import { enregistrerCorpsFormulaire } from './integrations/corps-formulaire.ts';
import { arreterCollecte, demarrerCollecte } from './integrations/collecte.ts';

const app = Fastify({
  logger: {
    level: config.environnement === 'production' ? 'info' : 'debug',
    transport: config.environnement === 'production' ? undefined : { target: 'pino-pretty' },
  },
  bodyLimit: 8 * 1024 * 1024,
});

/**
 * Traduction des erreurs.
 *
 * Une erreur métier — stock insuffisant, ronde déjà clôturée, droit manquant —
 * doit arriver à l'utilisateur sous forme de phrase, avec le bon code HTTP.
 * Seules les erreurs inattendues sont masquées derrière un message générique,
 * leur détail restant dans le journal du serveur.
 */
app.setErrorHandler((erreur: unknown, requete, reponse) => {
  if (erreur instanceof ErreurMetier) {
    return reponse.code(erreur.code).send({ erreur: erreur.message });
  }
  const details = erreur as { statusCode?: number; message?: string; validation?: unknown };
  if (details.validation) {
    return reponse.code(400).send({ erreur: details.message ?? 'Requête invalide' });
  }
  if (details.statusCode && details.statusCode < 500) {
    return reponse.code(details.statusCode).send({ erreur: details.message ?? 'Requête refusée' });
  }
  requete.log.error({ err: erreur }, 'erreur non traitée');
  return reponse.code(500).send({ erreur: 'Erreur interne du serveur' });
});

app.setNotFoundHandler((requete, reponse) =>
  reponse.code(404).send({ erreur: `Route inconnue : ${requete.method} ${requete.url}` }),
);

async function demarrer(): Promise<void> {
  verifierConfigProduction();

  app.log.info('attente de la base de données…');
  await attendreBase();

  await migrer((m) => app.log.info(m));

  if (config.seedAuDemarrage && (await baseEstVide())) {
    app.log.info('base vide : peuplement initial…');
    const resume = await peupler();
    app.log.info(resume, 'peuplement terminé');
  }

  await initialiserEtat();
  app.log.info('état applicatif chargé');

  // L'instantané complet pèse plusieurs mégaoctets en clair : sur une liaison
  // lente, la compression divise le temps de chargement par près de dix.
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(cors, {
    origin: config.originesAutorisees.length ? config.originesAutorisees : true,
    credentials: true,
  });
  await app.register(jwt, { secret: config.jwtSecret });
  // Le webhook du formulaire externe arrive en multipart : Fastify ne lit que
  // du JSON sans cela, et rejetterait la notification avec un 415.
  enregistrerCorpsFormulaire(app);
  await enregistrerRoutes(app);

  await app.listen({ port: config.port, host: config.hote });
  app.log.info(`API à l'écoute sur ${config.hote}:${config.port}`);

  // La collecte démarre après l'écoute : si JotForm est injoignable, cela ne
  // doit pas empêcher l'hôpital d'utiliser sa GMAO.
  demarrerCollecte((m, e) => (e ? app.log.warn({ err: e }, m) : app.log.info(m)));
}

async function arreter(signal: string): Promise<void> {
  app.log.info(`signal ${signal} reçu, arrêt en cours`);
  arreterCollecte();
  try {
    await app.close();
    await pool.end();
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void arreter('SIGTERM'));
process.on('SIGINT', () => void arreter('SIGINT'));

demarrer().catch((e) => {
  app.log.error(e, 'démarrage impossible');
  process.exit(1);
});
