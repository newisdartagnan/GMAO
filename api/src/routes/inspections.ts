import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  avancementRonde,
  cloturerRonde,
  demarrerRonde,
  enregistrerReleve,
  genererRondes,
  heureTheorique,
  indicateursRondes,
  iso,
  aujourdHui,
  modelePourEquipement,
  statutEffectif,
  viserRonde,
} from '@gmao/partage';
import { exiger, utilisateurDe } from '../auth.ts';
import { ErreurMetier, idParam, repondreCommande, valider } from './aide.ts';
import { lireBase } from '../etat.ts';

/**
 * Rondes d'inspection.
 *
 * L'agent de garde saisit sur le terrain, souvent depuis un téléphone et sans
 * réseau fiable : les routes acceptent un relevé complet en une seule requête
 * et restent idempotentes — resaisir un équipement remplace son relevé au lieu
 * d'en créer un second.
 */

const valeurReleve = z.object({
  pointId: z.string().min(1),
  valeurNum: z.number().optional(),
  valeurTexte: z.string().optional(),
  valeurBool: z.boolean().optional(),
  commentaire: z.string().optional(),
});

export async function routesInspections(app: FastifyInstance): Promise<void> {
  /** Vue de travail de l'agent : ce qui l'attend sur le créneau en cours. */
  app.get('/api/inspections/aujourdhui', { preHandler: exiger('lire') }, async (requete, reponse) => {
    const { date, siteId } = valider(
      z.object({ date: z.string().optional(), siteId: z.string().optional() }),
      requete.query ?? {},
    );
    const base = lireBase();
    const jour = date ?? iso(aujourdHui());
    const rondes = base.rondes
      .filter((r) => r.date === jour && (!siteId || r.siteId === siteId))
      .map((r) => ({
        ronde: { ...r, statut: statutEffectif(base, r) },
        avancement: avancementRonde(base, r.id),
        heureTheorique: heureTheorique(r.date, r.shift).toISOString(),
      }));
    return reponse.send({ date: jour, rondes });
  });

  app.get('/api/inspections/indicateurs', { preHandler: exiger('lire') }, async (requete, reponse) => {
    const { jours } = valider(z.object({ jours: z.coerce.number().int().min(1).max(365).default(30) }), requete.query ?? {});
    return reponse.send(indicateursRondes(lireBase(), jours));
  });

  /**
   * Ouvre les deux créneaux du jour. Appelée par l'interface à la prise de
   * service, et par la tâche planifiée du conteneur pour que la ronde existe
   * même si personne ne se connecte — c'est ainsi qu'un créneau non fait se
   * voit le lendemain.
   */
  app.post('/api/inspections/generer', { preHandler: exiger('inspecter') }, async (requete, reponse) => {
    const { date } = valider(z.object({ date: z.string().optional() }), requete.body ?? {});
    const jour = date ?? iso(aujourdHui());
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Ouverture des rondes d’inspection du ${jour}`, action: 'generation', entiteType: 'ronde', entiteId: jour },
      (b) => {
        const crees = genererRondes(b, jour);
        return { crees: crees.length, numeros: crees.map((r) => `${r.numero} (${r.shift})`) };
      },
    );
  });

  app.post('/api/inspections/rondes/:id/demarrer', { preHandler: exiger('inspecter') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const agent = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Prise de la ronde ${id}`, entiteType: 'ronde', entiteId: id },
      (b) => {
        const r = b.rondes.find((x) => x.id === id);
        if (!r) throw new ErreurMetier('Ronde introuvable', 404);
        if (r.statut === 'terminee') throw new ErreurMetier('Cette ronde est déjà terminée.', 409);
        demarrerRonde(b, id, agent);
        return r;
      },
    );
  });

  app.post('/api/inspections/rondes/:id/releves', { preHandler: exiger('inspecter') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const d = valider(
      z.object({
        equipementId: z.string().min(1),
        valeurs: z.array(valeurReleve).min(1, 'aucune valeur saisie'),
        observation: z.string().optional(),
        etatForce: z.enum(['hors_service', 'non_accessible']).optional(),
      }),
      requete.body,
    );

    const base = lireBase();
    const ronde = base.rondes.find((r) => r.id === id);
    if (!ronde) throw new ErreurMetier('Ronde introuvable', 404);
    if (ronde.statut === 'terminee') {
      throw new ErreurMetier('La ronde est clôturée : toute correction passe par le responsable technique.', 409);
    }
    if (!ronde.equipementsAttendus.includes(d.equipementId)) {
      throw new ErreurMetier('Cet équipement ne fait pas partie du périmètre figé à l’ouverture de la ronde.', 422);
    }
    const modele = modelePourEquipement(base, d.equipementId, ronde.shift);
    if (!modele) throw new ErreurMetier('Aucun modèle d’inspection ne couvre cet équipement sur ce créneau.', 422);

    // Les points obligatoires doivent tous être renseignés : une ronde à
    // trous ne prouve rien.
    const saisis = new Set(d.valeurs.map((v) => v.pointId));
    const manquants = modele.points.filter((p) => p.obligatoire && !saisis.has(p.id));
    if (manquants.length && !d.etatForce) {
      throw new ErreurMetier(
        `Points obligatoires non renseignés : ${manquants.map((p) => p.libelle).join(', ')}.`,
        422,
      );
    }

    const agent = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Relevé d’inspection sur ${base.equipements.find((e) => e.id === d.equipementId)?.code}`,
        action: 'creation',
        entiteType: 'releve_inspection',
        entiteId: d.equipementId,
      },
      (b) => {
        const { releve, demande } = enregistrerReleve(
          b,
          id,
          {
            equipementId: d.equipementId,
            valeurs: d.valeurs.map((v) => ({ ...v, conforme: true })),
            observation: d.observation,
            etatForce: d.etatForce,
          },
          agent,
        );
        return {
          releve,
          demandeCreee: demande ? { id: demande.id, numero: demande.numero, objet: demande.objet } : null,
        };
      },
    );
  });

  app.post('/api/inspections/rondes/:id/cloturer', { preHandler: exiger('inspecter') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const { observations } = valider(z.object({ observations: z.string().optional() }), requete.body ?? {});
    const jeton = utilisateurDe(requete);
    const base = lireBase();
    const ronde = base.rondes.find((r) => r.id === id);
    if (!ronde) throw new ErreurMetier('Ronde introuvable', 404);

    const avancement = avancementRonde(base, id);
    if (avancement.releves === 0) {
      throw new ErreurMetier('Aucun relevé saisi : la ronde ne peut pas être clôturée à vide.', 422);
    }

    await repondreCommande(
      requete,
      reponse,
      {
        libelle: `Clôture de la ronde ${ronde.numero} (${avancement.releves}/${avancement.attendus} relevés)`,
        action: 'cloture',
        entiteType: 'ronde',
        entiteId: id,
        details: observations,
      },
      (b) => {
        cloturerRonde(b, id, jeton.nom, observations);
        return avancementRonde(b, id);
      },
    );
  });

  app.post('/api/inspections/rondes/:id/viser', { preHandler: exiger('valider') }, async (requete, reponse) => {
    const { id } = valider(idParam, requete.params);
    const responsable = utilisateurDe(requete).sub;
    await repondreCommande(
      requete,
      reponse,
      { libelle: `Visa de la ronde ${id}`, action: 'validation', entiteType: 'ronde', entiteId: id },
      (b) => {
        const r = b.rondes.find((x) => x.id === id);
        if (!r) throw new ErreurMetier('Ronde introuvable', 404);
        if (r.statut === 'planifiee') throw new ErreurMetier('Cette ronde n’a pas encore été effectuée.', 409);
        viserRonde(b, id, responsable);
        return r;
      },
    );
  });

  /** Historique d'un point de contrôle, pour suivre une dérive lente. */
  app.get('/api/inspections/historique', { preHandler: exiger('lire') }, async (requete, reponse) => {
    const { equipementId, pointId, jours } = valider(
      z.object({
        equipementId: z.string().min(1),
        pointId: z.string().min(1),
        jours: z.coerce.number().int().min(1).max(365).default(30),
      }),
      requete.query ?? {},
    );
    const { historiquePoint } = await import('@gmao/partage');
    return reponse.send(historiquePoint(lireBase(), equipementId, pointId, jours));
  });
}

