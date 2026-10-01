import { affecterOT, construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO } from '@gmao/partage';
import { affectationsNouvelles, messageAffectation } from '../courriel/affectation.ts';

/**
 * Contrôle des notifications d'affectation.
 *
 *   npm run verifier-notifications --workspace=api
 *
 * La règle tient en une phrase — prévenir quand un ordre de travail change
 * de technicien — mais ses bords décident de tout : prévenir deux fois pour
 * une seule affectation apprend à ignorer les messages, et oublier un chemin
 * d'affectation donne un technicien prévenu une fois sur deux sans que rien
 * ne le signale. Ce banc tourne sans base, sans réseau et sans compte.
 */

let echecs = 0;
function verifier(intitule: string, obtenu: unknown, attendu: unknown): void {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(
    `  ${ok ? '✔' : '✘'} ${intitule}` +
      (ok ? '' : `\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`),
  );
}

const base = construireBaseDemo() as BaseGMAO;
const copie = () => structuredClone(base) as BaseGMAO;
const technicien = base.utilisateurs.find((u) => u.role === 'technicien')!;
const autre = base.utilisateurs.filter((u) => u.role === 'technicien' && u.id !== technicien.id)[0];
const libre = base.ordresTravail.find((o) => !o.technicienPrincipalId)!;

/* ================================================================== */
console.log('\nQuand faut-il prévenir ?');

{
  const apres = copie();
  affecterOT(apres, libre.id, technicien.id);
  const n = affectationsNouvelles(base, apres);
  verifier('une affectation nouvelle est vue', n.length, 1);
  verifier('et c’est le bon ordre de travail', n[0]?.ot.id, libre.id);
  verifier('et le bon technicien', n[0]?.technicienId, technicien.id);
}

{
  // Le piège : enregistrer à nouveau la même affectation — un clic répété,
  // une planification rejouée — ne doit pas renvoyer de courriel. Un message
  // qui arrive deux fois pour la même chose apprend à les ignorer tous.
  const avant = copie();
  affecterOT(avant, libre.id, technicien.id);
  const apres = structuredClone(avant) as BaseGMAO;
  affecterOT(apres, libre.id, technicien.id);
  verifier('réaffecter la même personne ne prévient pas', affectationsNouvelles(avant, apres).length, 0);
}

{
  const avant = copie();
  affecterOT(avant, libre.id, technicien.id);
  const apres = structuredClone(avant) as BaseGMAO;
  affecterOT(apres, libre.id, autre.id);
  const n = affectationsNouvelles(avant, apres);
  verifier('passer la main prévient le nouveau', n.length, 1);
  verifier('et c’est bien le nouveau', n[0]?.technicienId, autre.id);
}

{
  const avant = copie();
  affecterOT(avant, libre.id, technicien.id);
  const apres = structuredClone(avant) as BaseGMAO;
  affecterOT(apres, libre.id, undefined);
  verifier('retirer l’affectation ne prévient personne', affectationsNouvelles(avant, apres).length, 0);
}

{
  // Un ordre de travail créé DÉJÀ affecté n'existe pas dans l'état d'avant :
  // comparer les deux états le voit quand même, là où un branchement sur la
  // seule route d'affectation l'aurait manqué.
  const apres = copie();
  apres.ordresTravail = [{ ...libre, id: 'ord_neuf', numero: 'OT-9999', technicienPrincipalId: technicien.id }, ...apres.ordresTravail];
  const n = affectationsNouvelles(base, apres);
  verifier('un OT créé déjà affecté est vu', n.length, 1);
  verifier('et porte le bon numéro', n[0]?.ot.numero, 'OT-9999');
}

{
  const apres = copie();
  const premier = apres.ordresTravail.filter((o) => !o.technicienPrincipalId).slice(0, 3);
  for (const o of premier) affecterOT(apres, o.id, technicien.id);
  verifier('une affectation en lot prévient pour chacun', affectationsNouvelles(base, apres).length, 3);
}

{
  // Toute autre modification ne doit rien déclencher : sinon chaque
  // commentaire, chaque changement de statut enverrait un courriel.
  const apres = copie();
  apres.ordresTravail[0] = { ...apres.ordresTravail[0], description: 'autre chose' };
  verifier('modifier autre chose ne prévient pas', affectationsNouvelles(base, apres).length, 0);
}

/* ================================================================== */
console.log('\nCe que le technicien lit');

{
  const avecEquipement = base.ordresTravail.find((o) => o.equipementId)!;
  const m = messageAffectation(base, avecEquipement, technicien);
  const equipement = base.equipements.find((e) => e.id === avecEquipement.equipementId)!;

  verifier('un seul destinataire : lui', m.a, [technicien.email]);
  verifier('le numéro est dans l’objet', m.sujet.startsWith(avecEquipement.numero), true);
  verifier('la priorité aussi — elle décide si on y va tout de suite', /P\d/.test(m.sujet), true);
  verifier('le code d’inventaire figure dans le corps', m.texte.includes(equipement.code), true);
  verifier('le prénom ouvre le message', m.texte.startsWith(`Bonjour ${technicien.prenom},`), true);
  verifier('une version HTML accompagne le texte', Boolean(m.html), true);

  // Les descriptions viennent d'un formulaire libre : un chevron qui passe
  // tel quel dans le HTML casserait la mise en page, voire pire.
  const piege = { ...avecEquipement, objet: 'Fuite <script>alert(1)</script> & co' };
  const h = messageAffectation(base, piege, technicien).html ?? '';
  verifier('le HTML est échappé', h.includes('<script>'), false);
  verifier('et le texte reste lisible', h.includes('&lt;script&gt;'), true);
}

{
  // Un OT sans équipement ni lieu — une fuite dans un couloir — ne doit pas
  // produire de lignes vides ni de « undefined ».
  // « localId » est obligatoire sur un OT ; ce qui peut manquer, c'est le
  // local correspondant — un référentiel incomplet, un local supprimé.
  const nu = { ...base.ordresTravail[0], equipementId: undefined, localId: 'loc_inconnu', description: '' };
  const m = messageAffectation(base, nu, technicien);
  verifier('aucun « undefined » ne traverse', /undefined/.test(m.texte + m.html), false);
  verifier('l’absence d’équipement est dite', m.texte.includes('Équipement        aucun'), true);
}

console.log(echecs === 0 ? '\nTous les cas passent.\n' : `\n${echecs} cas en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
