import { construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO, OrdreTravail, Utilisateur } from '@gmao/partage';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { chargerBase } from '../db/charger.ts';
import { messageAffectation } from '../courriel/affectation.ts';
import {
  courrielActif,
  envoyer,
  hebergeurDeCourrier,
  manquePourEnvoyer,
  verifierAuthentification,
  verifierExpediteur,
  verifierSmtp,
} from '../courriel/envoi.ts';

/**
 * Éprouve la notification, sans toucher à un ordre de travail réel.
 *
 *   npm run tester-courriel --workspace=api -- boris.ikula@monkole.cd
 *
 * Montre le message exactement tel qu'il partira, puis l'envoie si un
 * transport est configuré. Avec « COURRIEL_TRANSPORT=journal », rien ne part
 * et le message s'affiche quand même : on peut juger le contenu avant
 * d'avoir un compte d'envoi.
 */

const destinataire = process.argv.slice(2).find((a) => a.includes('@'));
if (!destinataire) {
  console.error('\nUsage : npm run tester-courriel --workspace=api -- adresse@exemple.cd\n');
  process.exit(1);
}

const titre = (t: string) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

titre('Transport');
console.log(`  Mode          ${config.courriel.transport}`);
console.log(`  Expéditeur    ${config.courriel.expediteur || '(non renseigné)'}`);
if (config.courriel.transport === 'smtp') {
  console.log(`  Relais        ${config.courriel.smtp.hote || '(non renseigné)'}:${config.courriel.smtp.port}`);
} else if (config.courriel.transport === 'graph') {
  console.log(`  Locataire     ${config.courriel.graph.tenantId || '(non renseigné)'}`);
  console.log(`  Inscription   ${config.courriel.graph.clientId || '(non renseignée)'}`);
  console.log(`  Secret        ${config.courriel.graph.clientSecret ? 'renseigné' : '(non renseigné)'}`);
}
console.log(`  Lien GMAO     ${config.courriel.baseUrl || '(aucun — le courriel n’aura pas de lien)'}`);

if (!courrielActif()) {
  console.log('\n  Rien ne sera envoyé :');
  for (const m of manquePourEnvoyer()) console.log(`    · ${m}`);
} else if (config.courriel.transport === 'graph') {
  // Demandé AVANT l'envoi : un « 404 » au moment d'envoyer ne dit pas si
  // l'adresse désigne un objet inexistant ou un objet sans boîte.
  const e = await verifierExpediteur();
  const marque = e.etat === 'trouve' ? '✔' : e.etat === 'absent' ? '✘' : '·';
  console.log(`\n  ${marque} Boîte d’envoi  ${e.detail}`);

  // Le contrôle qui évite une demi-journée : Graph n'envoie que depuis une
  // boîte Exchange Online, et un locataire Entra ID ne met pas le courrier
  // chez Microsoft pour autant.
  const h = await hebergeurDeCourrier(config.courriel.expediteur);
  if (h.mx.length && !h.microsoft365) {
    console.log(`  ✘ Hébergeur       ${h.mx[0]} — la messagerie du domaine n’est pas chez Microsoft 365`);
    console.log('                    Graph ne pourra pas envoyer, quels que soient les réglages.');
    console.log('                    Prenez COURRIEL_TRANSPORT=smtp, avec le relais de cet hébergeur.');
  } else if (h.microsoft365) {
    console.log(`  ✔ Hébergeur       ${h.mx[0]} — Microsoft 365`);
  }
} else if (config.courriel.transport === 'smtp') {
  const v = await verifierSmtp();
  console.log(`\n  ${v.ok ? '✔' : '✘'} Relais         ${v.detail}`);
}

// Partir n'est pas arriver. Les grandes messageries écartent ce qui n'est pas
// authentifié, sans rien dire à l'expéditeur : le message tombe dans les
// indésirables et l'on croit le dispositif en marche.
if (courrielActif()) {
  const a = await verifierAuthentification(config.courriel.expediteur);
  console.log(`  ${a.spf ? '✔' : '✘'} SPF            ${a.spf ?? 'absent'}`);
  console.log(`  ${a.dmarc ? '✔' : '✘'} DMARC          ${a.dmarc ?? 'absent'}`);
  console.log('  · DKIM           non vérifiable ici : sa recherche exige le sélecteur de l’hébergeur');
  for (const remarque of a.remarques) {
    console.log(`\n  ! ${remarque.replace(/\n/g, '\n    ')}`);
  }
}

// Un ordre de travail réel si la base en a un, sinon celui de la
// démonstration : ce qu'on veut juger ici, c'est la forme du message.
let base: BaseGMAO;
try {
  await migrer(() => {});
  base = await chargerBase();
  if (!base.ordresTravail.length) base = construireBaseDemo() as BaseGMAO;
} catch {
  base = construireBaseDemo() as BaseGMAO;
}

const ot: OrdreTravail =
  base.ordresTravail.find((o) => o.equipementId && o.description) ?? base.ordresTravail[0];
const modele = base.utilisateurs.find((u) => u.role === 'technicien') ?? base.utilisateurs[0];
const destinatairePourEssai: Utilisateur = { ...modele, email: destinataire };

const message = messageAffectation(base, ot, destinatairePourEssai);

titre('Message');
console.log(`  À       ${message.a.join(', ')}`);
console.log(`  Objet   ${message.sujet}`);
console.log();
console.log(message.texte.replace(/^/gm, '  '));

titre('Envoi');
const r = await envoyer(message);
console.log(`  ${r.envoye ? '✔ envoyé' : '· non envoyé'} — transport ${r.transport}`);
if (!r.envoye) console.log(`    ${r.detail.split('\n')[0]}`);
console.log();

await pool.end().catch(() => undefined);
