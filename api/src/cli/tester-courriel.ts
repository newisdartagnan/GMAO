import { construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO, OrdreTravail, Utilisateur } from '@gmao/partage';
import { config } from '../config.ts';
import { migrer } from '../db/migrations.ts';
import { pool } from '../db/pool.ts';
import { chargerBase } from '../db/charger.ts';
import { messageAffectation } from '../courriel/affectation.ts';
import { courrielActif, envoyer, manquePourEnvoyer } from '../courriel/envoi.ts';

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
