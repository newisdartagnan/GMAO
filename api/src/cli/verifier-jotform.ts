import { construireBaseDemo } from '@gmao/partage';
import type { BaseGMAO } from '@gmao/partage';
import {
  CORRESPONDANCE_PAR_DEFAUT,
  aplatirReponses,
  chargerCorrespondance,
  convertirSoumission,
  integrerDemande,
  lienFormulaire,
  lireWebhook,
} from '../integrations/jotform.ts';
import type { SoumissionJotForm } from '../integrations/jotform.ts';

/**
 * Contrôle de l'interprétation des formulaires.
 *
 * La conversion d'une soumission en demande repose sur des appariements de
 * noms de champs et sur la lecture d'un vocabulaire libre (« très urgent »,
 * « quand possible »). Ces règles se dégradent en silence quand on ajoute une
 * question au formulaire : ce banc les rejoue sur des cas connus, sans base de
 * données, et dit exactement ce qui a changé.
 *
 *   npm run verifier-jotform --workspace=api
 */

const base = construireBaseDemo() as BaseGMAO;
const equipement = base.equipements.find((e) => e.criticite === 1)!;
const correspondance = CORRESPONDANCE_PAR_DEFAUT;
const porteur = base.utilisateurs[0].id;

let numero = 0;
function soumission(answers: SoumissionJotForm['answers']): SoumissionJotForm {
  numero += 1;
  return { id: `test-${numero}`, form_id: 'F1', created_at: '2026-08-26 09:00:00', answers };
}

let echecs = 0;
function verifier(intitule: string, obtenu: unknown, attendu: unknown): void {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(
    `  ${ok ? '✔' : '✘'} ${intitule}` + (ok ? '' : `\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`),
  );
}

/* ------------------------------------------------------------------ */
console.log('\nAppariement des champs');

{
  // Le piège : le libellé « Problème constaté » contient « constat », qui est
  // un des noms acceptés pour la description. L'objet ne doit pas s'y recopier.
  const r = convertirSoumission(
    base,
    soumission({
      3: { name: 'equipement', text: "Code de l'équipement", answer: equipement.code },
      4: { name: 'objet', text: 'Problème constaté', answer: 'Bruit anormal' },
      6: { name: 'urgence', text: 'Urgence', answer: 'Quand possible' },
    }),
    correspondance,
    porteur,
  );
  verifier('objet lu', r.demande?.objet, 'Bruit anormal');
  verifier('description laissée vide plutôt que recopiée', r.demande?.description, '');
  verifier('équipement rattaché', r.demande?.equipementId, equipement.id);
}

{
  // Formulaire sans noms techniques : seuls les libellés guident la lecture.
  const r = convertirSoumission(
    base,
    soumission({
      1: { text: "Numéro d'inventaire", answer: equipement.code },
      2: { text: 'Objet de la demande', answer: 'Fuite de gaz médical' },
      3: { text: 'Description détaillée', answer: 'Sifflement au raccord mural.' },
      4: { text: 'Degré d’urgence', answer: 'Urgence vitale' },
    }),
    correspondance,
    porteur,
  );
  verifier('objet reconnu par le libellé', r.demande?.objet, 'Fuite de gaz médical');
  verifier('description reconnue par le libellé', r.demande?.description, 'Sifflement au raccord mural.');
  verifier('urgence vitale → P1', r.demande?.urgenceDeclaree, 'P1');
}

{
  // Une question dont le libellé ressemble à deux champs à la fois ne doit
  // alimenter qu'une seule case.
  const r = convertirSoumission(
    base,
    soumission({
      1: { name: 'service', text: 'Service demandeur', answer: 'Bloc opératoire' },
      2: { name: 'objet', answer: 'Éclairage défaillant' },
      3: { name: 'declarant', text: 'Nom du demandeur', answer: { first: 'Alice', last: 'Mbala' } },
    }),
    correspondance,
    porteur,
  );
  const service = base.services.find((s) => s.id === r.demande?.serviceId);
  verifier('service reconnu', service?.nom, 'Bloc opératoire');
  verifier('déclarant non identifié reporté en description', r.demande?.description, 'Déclaré par : Alice Mbala');
}

/* ------------------------------------------------------------------ */
console.log('\nLecture du vocabulaire d’urgence');

const casUrgence: [string, string, string][] = [
  ['Urgence vitale', 'P1', 'risque_vital'],
  ['Très urgent', 'P1', 'risque_vital'],
  ['Urgent', 'P2', 'report_soin'],
  ['Normal', 'P3', 'gene'],
  ['Quand possible', 'P4', 'gene'],
  ['', 'P2', 'report_soin'], // sans réponse, la criticité 1 de l'équipement tranche
];
for (const [texte, priorite, impact] of casUrgence) {
  const r = convertirSoumission(
    base,
    soumission({
      1: { name: 'equipement', answer: equipement.code },
      2: { name: 'objet', answer: 'Panne' },
      ...(texte ? { 3: { name: 'urgence', answer: texte } } : {}),
    }),
    correspondance,
    porteur,
  );
  verifier(`« ${texte || '(rien)'} » → ${priorite} / ${impact}`, [r.demande?.urgenceDeclaree, r.demande?.impactPatient], [priorite, impact]);
}

/* ------------------------------------------------------------------ */
console.log('\nCas dégradés');

{
  const r = convertirSoumission(base, soumission({ 1: { name: 'equipement', answer: 'ZZZ-0000' } }), correspondance, porteur);
  verifier('ni objet ni description → soumission écartée', Boolean(r.rejet), true);
}

{
  const r = convertirSoumission(
    base,
    soumission({
      1: { name: 'equipement', answer: 'ZZZ-0000' },
      2: { name: 'objet', answer: 'Porte bloquée' },
      3: { name: 'local', answer: 'Couloir B' },
    }),
    correspondance,
    porteur,
  );
  verifier('code inconnu : la demande est créée sans équipement', r.demande?.equipementId, undefined);
  verifier(
    'code et localisation saisis restent lisibles',
    r.demande?.description,
    'Localisation indiquée : Couloir B\nCode saisi, non trouvé à l’inventaire : ZZZ-0000',
  );
}

{
  // Deux passages de la même soumission : la seconde ne doit rien créer.
  const copie = structuredClone(base) as BaseGMAO;
  const s = soumission({ 1: { name: 'equipement', answer: equipement.code }, 2: { name: 'objet', answer: 'Test doublon' } });
  const avant = copie.demandes.length;
  integrerDemande(copie, convertirSoumission(copie, s, correspondance, porteur));
  integrerDemande(copie, convertirSoumission(copie, s, correspondance, porteur));
  verifier('une soumission rejouée ne crée qu’une demande', copie.demandes.length - avant, 1);
}

/* ------------------------------------------------------------------ */
console.log('\nWebhook et lien du QR code');

{
  const lu = lireWebhook({
    formID: 'F1',
    submissionID: '999',
    rawRequest: JSON.stringify({ q3_equipement: equipement.code, q4_objet: 'Écran noir', q6_urgence: 'Urgent' }),
  });
  verifier('identifiant de soumission repris', lu?.id, '999');
  const r = lu ? convertirSoumission(base, lu, correspondance, porteur) : undefined;
  verifier('préfixes « q3_ » retirés', r?.demande?.objet, 'Écran noir');
  verifier('rien à lire sans submissionID', lireWebhook({ formID: 'F1' }), null);
}

verifier(
  'lien pré-rempli',
  lienFormulaire('https://form.jotform.com/250000000000000', 'equipement', 'REA-0020'),
  'https://form.jotform.com/250000000000000?equipement=REA-0020',
);
verifier(
  'lien pré-rempli sur une URL qui porte déjà des paramètres',
  lienFormulaire('https://form.jotform.com/250?site=1', 'equipement', 'A/B'),
  'https://form.jotform.com/250?site=1&equipement=A%2FB',
);

/* ------------------------------------------------------------------ */
console.log('\nCorrespondance personnalisée');

{
  const perso = chargerCorrespondance('{"equipement":"tag_machine","objet":"panne_signalee"}');
  const r = convertirSoumission(
    base,
    soumission({
      1: { name: 'tag_machine', answer: equipement.code },
      2: { name: 'panne_signalee', answer: 'Ne démarre plus' },
    }),
    perso,
    porteur,
  );
  verifier('noms de champs personnalisés', [r.demande?.equipementId, r.demande?.objet], [equipement.id, 'Ne démarre plus']);
  verifier('JSON invalide : retour aux noms par défaut', chargerCorrespondance('{{'), CORRESPONDANCE_PAR_DEFAUT);
}

verifier(
  'réponses brutes conservées sous leur libellé',
  aplatirReponses(soumission({ 1: { name: 'objet', text: 'Problème constaté', answer: 'X' } })),
  { 'Problème constaté': 'X' },
);

console.log(
  echecs === 0 ? '\nTous les cas passent.\n' : `\n${echecs} cas en échec.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
