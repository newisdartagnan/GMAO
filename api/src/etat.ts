import type { BaseGMAO, EntreeAudit, PatchBase } from '@gmao/partage';
import { calculerPatch, isoHeure, aujourdHui, uid, patchEstVide } from '@gmao/partage';
import { transaction } from './db/pool.ts';
import { chargerBase } from './db/charger.ts';
import { ecrireDifferences } from './db/ecrire.ts';

/**
 * État applicatif.
 *
 * Le serveur garde l'agrégat complet en mémoire. Ce choix mérite d'être
 * expliqué : il permet d'exécuter côté serveur exactement les mêmes fonctions
 * métier que le navigateur — un « OT en retard » ou une « prochaine échéance »
 * n'ont qu'une seule définition dans tout le projet — et il rend les calculs
 * d'indicateurs immédiats, là où ils demanderaient des dizaines de requêtes.
 *
 * La contrepartie est que les écritures doivent être sérialisées. Elles le
 * sont par une file d'attente : chaque commande attend la précédente, applique
 * sa modification sur une copie, persiste la différence dans une transaction,
 * puis publie le nouvel état. À l'échelle d'un établissement — quelques
 * dizaines d'écritures par minute au plus fort — le coût est négligeable et la
 * cohérence est totale.
 *
 * PostgreSQL reste la référence : en cas de doute, `rechargerDepuisBase()`
 * reconstruit l'état à partir des tables.
 */

let base: BaseGMAO | null = null;
let file: Promise<unknown> = Promise.resolve();

export async function initialiserEtat(): Promise<void> {
  base = await chargerBase();
}

export function etatPret(): boolean {
  return base !== null;
}

export function lireBase(): BaseGMAO {
  if (!base) throw new Error("L'état n'est pas encore chargé");
  return base;
}

export async function rechargerDepuisBase(): Promise<BaseGMAO> {
  base = await chargerBase();
  return base;
}

export interface ContexteCommande {
  utilisateurId: string;
  libelle: string;
  action?: EntreeAudit['action'];
  entiteType?: string;
  entiteId?: string;
  details?: string;
}

export interface ResultatCommande<T> {
  resultat: T;
  patch: PatchBase;
}

/**
 * Applique une modification métier de façon atomique.
 *
 * `fn` reçoit une copie de l'agrégat qu'elle modifie librement, exactement
 * comme le ferait le navigateur. Ce qui en ressort est comparé à l'état
 * précédent : la différence part en base, et le patch est renvoyé au client
 * pour qu'il rafraîchisse son propre état sans recharger la base entière.
 */
export async function commande<T>(
  contexte: ContexteCommande,
  fn: (b: BaseGMAO) => T,
): Promise<ResultatCommande<T>> {
  const execution = file.then(async () => {
    const avant = lireBase();
    const copie = structuredClone(avant) as BaseGMAO;

    const resultat = fn(copie);

    const entree: EntreeAudit = {
      id: uid('aud'),
      date: isoHeure(aujourdHui()),
      utilisateurId: contexte.utilisateurId,
      action: contexte.action ?? 'modification',
      entiteType: contexte.entiteType ?? 'base',
      entiteId: contexte.entiteId ?? '-',
      libelle: contexte.libelle,
      details: contexte.details,
    };
    copie.audit = [entree, ...copie.audit];

    const patch = calculerPatch(avant, copie);
    if (!patchEstVide(patch)) {
      await transaction(async (client) => {
        await client.query('SET CONSTRAINTS ALL DEFERRED');
        await ecrireDifferences(client, avant, patch);
      });
    }

    base = copie;
    return { resultat, patch };
  });

  // La file ne doit jamais s'interrompre sur une erreur : la commande suivante
  // repart de l'état inchangé, l'erreur étant remontée à l'appelant.
  file = execution.catch(() => undefined);
  return execution;
}

/** Lecture seule protégée par la même file, pour un instantané cohérent. */
export async function lecture<T>(fn: (b: BaseGMAO) => T): Promise<T> {
  const execution = file.then(() => fn(lireBase()));
  file = execution.catch(() => undefined);
  return execution;
}
