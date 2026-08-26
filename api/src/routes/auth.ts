import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { definirMotDePasse, exiger, marquerConnexion, trouverParEmail, utilisateurDe, verifier } from '../auth.ts';
import { valider } from './aide.ts';
import { lireBase } from '../etat.ts';
import { config } from '../config.ts';

export async function routesAuth(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/connexion', async (requete, reponse) => {
    const { email, motDePasse } = valider(
      z.object({ email: z.string().min(3), motDePasse: z.string().min(1) }),
      requete.body,
    );

    const compte = await trouverParEmail(email);
    // Même message dans les deux cas : ne pas révéler quels comptes existent.
    const echec = { erreur: 'Identifiants incorrects' };
    if (!compte || !compte.mot_de_passe_hash) return reponse.code(401).send(echec);
    if (!compte.actif) return reponse.code(403).send({ erreur: 'Ce compte est désactivé.' });
    if (!verifier(motDePasse, compte.mot_de_passe_hash)) return reponse.code(401).send(echec);

    await marquerConnexion(compte.id);
    const jeton = app.jwt.sign(
      { sub: compte.id, role: compte.role, nom: `${compte.prenom} ${compte.nom}` },
      { expiresIn: config.jwtDuree },
    );
    const profil = lireBase().utilisateurs.find((u) => u.id === compte.id);
    return reponse.send({ jeton, utilisateur: profil });
  });

  app.get('/api/auth/moi', { preHandler: exiger() }, async (requete, reponse) => {
    const jeton = utilisateurDe(requete);
    const profil = lireBase().utilisateurs.find((u) => u.id === jeton.sub);
    if (!profil) return reponse.code(404).send({ erreur: 'Compte introuvable' });
    return reponse.send({ utilisateur: profil });
  });

  app.post('/api/auth/mot-de-passe', { preHandler: exiger() }, async (requete, reponse) => {
    const { ancien, nouveau } = valider(
      z.object({ ancien: z.string().min(1), nouveau: z.string().min(8, 'huit caractères au minimum') }),
      requete.body,
    );
    const jeton = utilisateurDe(requete);
    const compte = await trouverParEmail(
      lireBase().utilisateurs.find((u) => u.id === jeton.sub)?.email ?? '',
    );
    if (!compte?.mot_de_passe_hash || !verifier(ancien, compte.mot_de_passe_hash)) {
      return reponse.code(401).send({ erreur: 'Mot de passe actuel incorrect' });
    }
    await definirMotDePasse(jeton.sub, nouveau);
    return reponse.send({ ok: true });
  });
}
