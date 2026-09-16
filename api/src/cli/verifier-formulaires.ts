import { construireBaseDemo, lienFormulaireExterne, lienQrEtiquette, lienRedirection } from '@gmao/partage';
import type { BaseGMAO } from '@gmao/partage';
import {
  CORRESPONDANCE_PAR_DEFAUT,
  chargerCorrespondance,
  convertirSoumission,
  integrerDemande,
  reponsesLisibles,
} from '../integrations/formulaires.ts';
import type { SoumissionFormulaire } from '../integrations/formulaires.ts';
import * as jotform from '../integrations/jotform.ts';
import * as microsoft from '../integrations/microsoft.ts';

/**
 * Contrôle de l'interprétation des formulaires.
 *
 * La conversion d'une réponse en demande repose sur des appariements de noms
 * de questions et sur la lecture d'un vocabulaire libre (« Haute », « très
 * urgent », « quand possible »). Ces règles se dégradent en silence quand on
 * ajoute une question au formulaire : ce banc les rejoue sur des cas connus,
 * sans base de données, et dit exactement ce qui a changé.
 *
 *   npm run verifier-formulaires --workspace=api
 */

const base = construireBaseDemo() as BaseGMAO;
const equipement = base.equipements.find((e) => e.criticite === 1)!;
const correspondance = CORRESPONDANCE_PAR_DEFAUT;
const porteur = base.utilisateurs[0].id;

let compteur = 0;
function soumission(reponses: Record<string, string>, nomsTechniques = false): SoumissionFormulaire {
  compteur += 1;
  return {
    source: 'essai',
    id: `test-${compteur}`,
    formulaireId: 'F1',
    date: '2026-08-26T09:00:00',
    reponses: Object.entries(reponses).map(([cle, valeur]) =>
      nomsTechniques ? { nom: cle, valeur } : { libelle: cle, valeur },
    ),
  };
}

let echecs = 0;
function verifier(intitule: string, obtenu: unknown, attendu: unknown): void {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(
    `  ${ok ? '✔' : '✘'} ${intitule}` +
      (ok ? '' : `\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`),
  );
}

/* ================================================================== */
console.log('\nFormulaire Microsoft en service (Hôpital Monkole)');

/** Les libellés exacts des questions, tels qu'Excel les nomme en colonnes. */
const MONKOLE = {
  demandeur: 'Nom et contact du demandeur',
  depuis: 'Depuis quand le problème existe-t-il?',
  secteur: 'Secteur',
  lieu: 'Lieu (bâtiment / service)',
  salle: 'Salle de lieux',
  equipement: 'Équipement / Installation concernée',
  description: 'Description du problème',
  priorite: 'Priorité',
};

{
  const r = convertirSoumission(
    base,
    soumission({
      [MONKOLE.demandeur]: 'Béatrice Ilunga — 0810000000',
      [MONKOLE.depuis]: 'depuis 3 jours',
      [MONKOLE.secteur]: 'Climatisation',
      [MONKOLE.lieu]: 'MKL2',
      [MONKOLE.salle]: 'Bloc opératoire',
      [MONKOLE.equipement]: 'climatiseur',
      [MONKOLE.description]: 'Le climatiseur souffle chaud et fait un bruit de ferraille.',
      [MONKOLE.priorite]: 'Haute',
    }),
    correspondance,
    porteur,
  );

  verifier(
    'objet tiré de la première phrase, faute de champ « objet »',
    r.demande?.objet,
    'Le climatiseur souffle chaud et fait un bruit de ferraille',
  );
  verifier('« Haute » → P1', r.demande?.urgenceDeclaree, 'P1');
  verifier('« Haute » → risque vital', r.demande?.impactPatient, 'risque_vital');
  verifier(
    'ancienneté, secteur, déclarant et lieu conservés dans la description',
    r.demande?.description,
    'Le climatiseur souffle chaud et fait un bruit de ferraille.\n' +
      'Constaté : depuis 3 jours\n' +
      'Secteur indiqué : Climatisation\n' +
      'Déclaré par : Béatrice Ilunga — 0810000000\n' +
      'Localisation indiquée : MKL2 — Bloc opératoire\n' +
      'Équipement indiqué : climatiseur',
  );
  verifier('sans code d’inventaire, aucun équipement rattaché', r.demande?.equipementId, undefined);
  verifier(
    'les huit questions restent lisibles telles quelles',
    Object.keys(r.demande?.origineExterne?.reponses ?? {}).length,
    8,
  );
}

{
  // Le même formulaire, mais ouvert par le QR d'un équipement : une question
  // supplémentaire porte le code, et tout se rattache.
  const r = convertirSoumission(
    base,
    soumission({
      'Code inventaire': equipement.code,
      [MONKOLE.equipement]: 'moniteur de chevet',
      [MONKOLE.secteur]: 'Biomédical',
      [MONKOLE.description]: 'Alarme permanente, écran figé.',
      [MONKOLE.priorite]: 'Haute',
    }),
    correspondance,
    porteur,
  );
  verifier('code d’inventaire reconnu', r.demande?.equipementId, equipement.id);
  verifier('local repris de l’équipement', r.demande?.localId, equipement.localId);
  verifier('service repris de l’équipement', r.demande?.serviceId, equipement.serviceId);
}

{
  const cas: [string, string, string][] = [
    ['Haute', 'P1', 'risque_vital'],
    ['Moyenne', 'P3', 'gene'],
    ['Basse', 'P4', 'gene'],
    ['Urgence vitale', 'P1', 'risque_vital'],
    ['Urgent', 'P2', 'report_soin'],
    ['Quand possible', 'P4', 'gene'],
  ];
  for (const [texte, priorite, impact] of cas) {
    const r = convertirSoumission(
      base,
      soumission({ [MONKOLE.description]: 'Panne', [MONKOLE.priorite]: texte }),
      correspondance,
      porteur,
    );
    verifier(`« ${texte} » → ${priorite} / ${impact}`, [r.demande?.urgenceDeclaree, r.demande?.impactPatient], [priorite, impact]);
  }
  // Sans réponse, la criticité de l'équipement tranche.
  const r = convertirSoumission(
    base,
    soumission({ 'Code inventaire': equipement.code, [MONKOLE.description]: 'Panne' }),
    correspondance,
    porteur,
  );
  verifier('sans priorité, un équipement vital donne P2', r.demande?.urgenceDeclaree, 'P2');
}

/* ================================================================== */
console.log('\nAppariement des questions');

{
  // Le piège : « Description du problème » contient « problème », qui est un
  // des noms acceptés pour l'objet. La description doit gagner.
  const r = convertirSoumission(
    base,
    soumission({ [MONKOLE.description]: 'Fuite au plafond. Eau sur le sol.' }),
    correspondance,
    porteur,
  );
  verifier('« Description du problème » alimente la description', r.demande?.description, 'Fuite au plafond. Eau sur le sol.');
  verifier('et l’objet en est déduit, pas recopié', r.demande?.objet, 'Fuite au plafond');
}

{
  // Et l'inverse : « Problème constaté » est un objet court, pas une
  // description — « constaté » ne doit pas être pris pour « constat ».
  const r = convertirSoumission(
    base,
    soumission({ 'Problème constaté': 'Bruit anormal', 'Détails': 'Depuis ce matin.' }),
    correspondance,
    porteur,
  );
  verifier('« Problème constaté » → objet', r.demande?.objet, 'Bruit anormal');
  verifier('« Détails » → description', r.demande?.description, 'Depuis ce matin.');
}

{
  // « Lieu (bâtiment / service) » contient le mot « service » : il ne doit
  // pas être consommé comme service demandeur.
  const r = convertirSoumission(
    base,
    soumission({
      [MONKOLE.lieu]: 'MKL3',
      [MONKOLE.salle]: 'Cuisine',
      [MONKOLE.description]: 'Robinet cassé',
    }),
    correspondance,
    porteur,
  );
  verifier('lieu et salle rangés ensemble', r.demande?.description, 'Robinet cassé\nLocalisation indiquée : MKL3 — Cuisine');
}

{
  const service = base.services[3];
  const local = base.locaux.find((l) => l.serviceId === service.id)!;
  const r = convertirSoumission(
    base,
    soumission({ 'Salle': local.nom, 'Description': 'Prise arrachée' }),
    correspondance,
    porteur,
  );
  verifier('salle connue de l’inventaire → local rattaché', r.demande?.localId, local.id);
  verifier('et le service en découle', r.demande?.serviceId, service.id);
}

/* ================================================================== */
console.log('\nCas dégradés');

{
  const r = convertirSoumission(base, soumission({ [MONKOLE.secteur]: 'Plomberie' }), correspondance, porteur);
  verifier('ni objet ni description → écartée', Boolean(r.rejet), true);
}

{
  const r = convertirSoumission(
    base,
    soumission({ 'Code inventaire': 'ZZZ-0000', [MONKOLE.description]: 'Porte bloquée' }),
    correspondance,
    porteur,
  );
  verifier('code inconnu : la demande est créée quand même', Boolean(r.demande), true);
  verifier(
    'le code saisi reste lisible',
    r.demande?.description,
    'Porte bloquée\nCode saisi, non trouvé à l’inventaire : ZZZ-0000',
  );
}

{
  const copie = structuredClone(base) as BaseGMAO;
  const s = soumission({ 'Code inventaire': equipement.code, 'Description': 'Test doublon' });
  const avant = copie.demandes.length;
  integrerDemande(copie, convertirSoumission(copie, s, correspondance, porteur));
  integrerDemande(copie, convertirSoumission(copie, s, correspondance, porteur));
  verifier('une réponse rejouée ne crée qu’une demande', copie.demandes.length - avant, 1);
}

{
  const longue = 'A'.repeat(200);
  const r = convertirSoumission(base, soumission({ 'Description': longue }), correspondance, porteur);
  verifier('objet tronqué proprement', r.demande?.objet?.length, 88);
}

/* ================================================================== */
console.log('\nWebhook Power Automate');

{
  const lu = microsoft.lireWebhook({
    id: '412',
    formulaireId: 'u4qTeSeAUF',
    date: '26/08/2026 14:30',
    reponses: {
      [MONKOLE.secteur]: 'Gaz Médicaux',
      [MONKOLE.description]: 'Sifflement au raccord mural.',
      [MONKOLE.priorite]: 'Haute',
    },
  });
  verifier('identifiant de réponse repris', lu?.id, '412');
  verifier('date française convertie', lu?.date, '2026-08-26T14:30:00');
  const r = lu ? convertirSoumission(base, lu, correspondance, porteur) : undefined;
  verifier('converti en P1', r?.demande?.urgenceDeclaree, 'P1');
  verifier('date de la demande', r?.demande?.dateCreation, '2026-08-26T14:30:00');
}

{
  // Disposition à plat : chaque question est une propriété du corps.
  const lu = microsoft.lireWebhook({
    responseId: '99',
    'Heure de fin': '2026-08-26T10:00:00Z',
    'Heure de début': '2026-08-26T09:58:00Z',
    [MONKOLE.description]: 'Lampe grillée',
    [MONKOLE.priorite]: 'Basse',
  });
  verifier('disposition à plat lue', lu?.reponses.length, 2);
  verifier('colonne « Heure de début » reconnue malgré accent et espaces', lu?.date, '2026-08-26T10:00:00');
  verifier('métadonnées écartées des réponses', lu?.reponses.map((r) => r.libelle), [MONKOLE.description, MONKOLE.priorite]);
  verifier(
    'identifiant reconnu sous « Response ID »',
    microsoft.lireWebhook({ 'Response ID': '77', 'Description': 'x' })?.id,
    '77',
  );
  verifier('rien à lire sans identifiant', microsoft.lireWebhook({ 'Priorité': 'Haute' }), null);
}

{
  const cas: [unknown, string | undefined][] = [
    ['26/08/2026 14:30', '2026-08-26T14:30:00'],
    ['2026-08-26T14:30:00Z', '2026-08-26T14:30:00'],
    [46260, '2026-08-26T00:00:00'],
    ['pas une date', undefined],
    ['', undefined],
  ];
  for (const [brut, attendu] of cas) {
    verifier(`date « ${String(brut) || '(vide)'} »`, microsoft.normaliserDate(brut), attendu);
  }
}

/* ================================================================== */
console.log('\nClasseur réel de Monkole — colonnes telles qu’elles sont');

{
  // Les en-têtes exacts du classeur en service. Les colonnes de service
  // (« Id_formulaire », « Date de plainté ») ne sont pas des réponses.
  const COLONNES = [
    'Id_formulaire', 'Date de plainté', 'Nom du demandeur', 'Date de dèbut du probleme',
    'Secteur', 'Lieu', 'Salle de lieu', 'Équipement', 'Description du problème', 'Priorité',
  ];
  const LIGNE = [
    '17', '26/08/2026 07:12', 'Béatrice Ilunga — 0810000000', 'depuis 3 jours',
    'Gaz Médicaux', 'MKL2', 'Bloc opératoire', 'prise murale oxygène',
    'Sifflement continu au raccord mural.', 'Haute',
  ];

  const s = microsoft.lireLigneClasseur(COLONNES, LIGNE, 'classeur-monkole');
  verifier('identifiant pris dans la première colonne', s?.id, '17');
  verifier('« Date de plainté » lue comme horodatage', s?.date, '2026-08-26T07:12:00');
  verifier(
    'colonnes de service écartées des réponses',
    s?.reponses.map((r) => r.libelle),
    ['Nom du demandeur', 'Date de dèbut du probleme', 'Secteur', 'Lieu', 'Salle de lieu', 'Équipement',
     'Description du problème', 'Priorité'],
  );

  const r = s ? convertirSoumission(base, s, correspondance, porteur) : undefined;
  verifier('objet tiré de la description', r?.demande?.objet, 'Sifflement continu au raccord mural');
  verifier('« Haute » → P1', r?.demande?.urgenceDeclaree, 'P1');
  verifier(
    '« Date de dèbut du probleme » lue comme ancienneté, pas comme objet',
    r?.demande?.description,
    'Sifflement continu au raccord mural.\n' +
      'Constaté : depuis 3 jours\n' +
      'Secteur indiqué : Gaz Médicaux\n' +
      'Déclaré par : Béatrice Ilunga — 0810000000\n' +
      'Localisation indiquée : MKL2 — Bloc opératoire\n' +
      'Équipement indiqué : prise murale oxygène',
  );
  verifier('horodatage repris sur la demande', r?.demande?.dateCreation, '2026-08-26T07:12:00');
}

{
  // Le même classeur, avec la question « Code inventaire » ajoutée pour les
  // QR par équipement.
  const COLONNES = [
    'Id_formulaire', 'Date de plainté', 'Code inventaire', 'Nom du demandeur',
    'Secteur', 'Description du problème', 'Priorité',
  ];
  const LIGNE = ['18', '26/08/2026 08:00', equipement.code, 'Joseph Kabamba',
    'Biomédical', 'Alarme permanente.', 'Haute'];
  const s = microsoft.lireLigneClasseur(COLONNES, LIGNE, 'classeur-monkole');
  const r = s ? convertirSoumission(base, s, correspondance, porteur) : undefined;
  verifier('code d’inventaire reconnu dans le classeur', r?.demande?.equipementId, equipement.id);
}

{
  // Un classeur laissé avec les en-têtes que Forms génère par défaut.
  const COLONNES = ['ID', 'Heure de début', 'Heure de fin', 'E-mail', 'Nom',
    'Description du problème', 'Priorité'];
  const LIGNE = ['3', '26/08/2026 09:00', '26/08/2026 09:05', 'a@b.cd', 'Anonyme',
    'Lampe grillée', 'Basse'];
  const s = microsoft.lireLigneClasseur(COLONNES, LIGNE, 'c');
  verifier(
    'en-têtes Forms par défaut : seules les réponses restent',
    s?.reponses.map((r) => r.libelle),
    ['Description du problème', 'Priorité'],
  );
  verifier('« Heure de fin » préférée à « Heure de début »', s?.date, '2026-08-26T09:05:00');
}

/* ================================================================== */
console.log('\nChemin du classeur Microsoft Graph');

verifier(
  'classeur du compte autorisé, par chemin',
  microsoft.cheminClasseur('me:/Maintenance/Formulaire maintenance -- Hôpital Monkole.xlsx'),
  '/me/drive/root:/Maintenance/Formulaire%20maintenance%20--%20H%C3%B4pital%20Monkole.xlsx:',
);
verifier(
  'classeur désigné par son identifiant',
  microsoft.cheminClasseur('item:01ABCDEF123456'),
  '/me/drive/items/01ABCDEF123456',
);
verifier(
  'classeur dans un OneDrive',
  microsoft.cheminClasseur('drive:b!aZ12:/Documents/reponses.xlsx'),
  '/drives/b!aZ12/root:/Documents/reponses.xlsx:',
);
verifier(
  'classeur dans une bibliothèque SharePoint',
  microsoft.cheminClasseur('site:monkole.sharepoint.com:/sites/Maintenance:/Documents partages/reponses.xlsx'),
  '/sites/monkole.sharepoint.com:/sites/Maintenance:/drive/root:/Documents%20partages/reponses.xlsx:',
);
{
  let refus = '';
  try {
    microsoft.cheminClasseur('/Documents/reponses.xlsx');
  } catch (e) {
    refus = e instanceof Error ? e.message.slice(0, 26) : '';
  }
  verifier('écriture non reconnue refusée tôt', refus, 'MSFORMS_CLASSEUR doit comm');
}

/* ================================================================== */
console.log('\nQR code des étiquettes');

verifier(
  'QR par la GMAO, destination changeable',
  lienQrEtiquette({ baseRedirection: 'https://gmao.monkole.cd', url: 'https://forms.cloud.microsoft/r/u4qT' }, 'REA-0020'),
  'https://gmao.monkole.cd/r/REA-0020',
);
verifier(
  'barre finale en trop sans effet',
  lienRedirection('https://gmao.monkole.cd/', 'REA-0020'),
  'https://gmao.monkole.cd/r/REA-0020',
);
verifier(
  'QR générique, sans équipement',
  lienRedirection('https://gmao.monkole.cd'),
  'https://gmao.monkole.cd/r',
);
verifier(
  'sans adresse publique, le QR mène droit au formulaire',
  lienQrEtiquette({ url: 'https://forms.cloud.microsoft/r/u4qT', paramCode: 'r8f3' }, 'REA-0020'),
  'https://forms.cloud.microsoft/r/u4qT?r8f3=REA-0020',
);
verifier('rien de configuré, pas de QR', lienQrEtiquette({}, 'REA-0020'), '');

/* ================================================================== */
console.log('\nJotForm');

{
  const lu = jotform.lireWebhook({
    formID: 'F1',
    submissionID: '999',
    rawRequest: JSON.stringify({ q3_equipement: equipement.code, q4_objet: 'Écran noir', q6_urgence: 'Urgent' }),
  });
  verifier('préfixes « q3_ » retirés', lu?.reponses[0]?.nom, 'equipement');
  const r = lu ? convertirSoumission(base, lu, correspondance, porteur) : undefined;
  verifier('objet lu', r?.demande?.objet, 'Écran noir');
  verifier('urgence lue', r?.demande?.urgenceDeclaree, 'P2');
  verifier('rien à lire sans submissionID', jotform.lireWebhook({ formID: 'F1' }), null);
}

{
  const normalisee = jotform.normaliserSoumission({
    id: '77',
    form_id: 'F1',
    created_at: '2026-08-26 08:12:03',
    answers: {
      3: { name: 'equipement', text: "Code de l'équipement", answer: equipement.code },
      7: { name: 'declarant', text: 'Votre nom', answer: { first: 'Joseph', last: 'Kabamba' } },
      9: { name: 'objet', text: 'Objet', answer: 'Batterie HS' },
    },
  });
  verifier('horodatage ramené à la forme ISO', normalisee.date, '2026-08-26T08:12:03');
  verifier('champ composé aplati', normalisee.reponses[1].valeur, 'Joseph Kabamba');
  const r = convertirSoumission(base, normalisee, correspondance, porteur);
  verifier('déclarant inconnu reporté', r.demande?.description, 'Déclaré par : Joseph Kabamba');
}

/* ================================================================== */
console.log('\nCorrespondance personnalisée et liens');

{
  const perso = chargerCorrespondance('{"equipement":"tag_machine","objet":"panne_signalee"}');
  const r = convertirSoumission(
    base,
    soumission({ tag_machine: equipement.code, panne_signalee: 'Ne démarre plus' }, true),
    perso,
    porteur,
  );
  verifier('noms de questions personnalisés', [r.demande?.equipementId, r.demande?.objet], [equipement.id, 'Ne démarre plus']);
  verifier('JSON invalide : retour aux noms par défaut', chargerCorrespondance('{{'), CORRESPONDANCE_PAR_DEFAUT);
}

verifier(
  'lien JotForm pré-rempli',
  lienFormulaireExterne('https://form.jotform.com/250000000000000', 'equipement', 'REA-0020'),
  'https://form.jotform.com/250000000000000?equipement=REA-0020',
);
verifier(
  'lien Microsoft Forms pré-rempli',
  lienFormulaireExterne('https://forms.cloud.microsoft/r/u4qTeSeAUF', 'r8f3c1e0a', 'REA-0020'),
  'https://forms.cloud.microsoft/r/u4qTeSeAUF?r8f3c1e0a=REA-0020',
);
verifier(
  'lien sur une URL qui porte déjà des paramètres',
  lienFormulaireExterne('https://forms.cloud.microsoft/r/u4qT?origin=qr', 'r8f3', 'A/B'),
  'https://forms.cloud.microsoft/r/u4qT?origin=qr&r8f3=A%2FB',
);
verifier('sans URL configurée, pas de lien', lienFormulaireExterne('', 'r8f3', 'REA-0020'), '');

verifier(
  'réponses conservées sous leur libellé',
  reponsesLisibles(soumission({ 'Problème constaté': 'X', 'Vide': '' })),
  { 'Problème constaté': 'X' },
);

console.log(echecs === 0 ? '\nTous les cas passent.\n' : `\n${echecs} cas en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
