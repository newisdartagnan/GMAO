import {
  construireBaseDemo,
  deduireDomaine,
  domaineDuSecteur,
  lienFormulaireExterne,
  lienQrEtiquette,
  lienRedirection,
  suggererEquipements,
} from '@gmao/partage';
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
import { raisonReseau } from '../integrations/reseau.ts';

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
  verifier('« Haute » → P2, pas P1', r.demande?.urgenceDeclaree, 'P2');
  verifier('sans question sur l’impact, aucun risque vital inventé', r.demande?.impactPatient, 'gene');
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
  // Le formulaire de Monkole n'offre que Haute / Moyenne / Basse et ne
  // demande rien sur les conséquences pour le patient. L'impact attendu est
  // donc « gene » partout sauf là où quelqu'un a écrit le mot : le déduire de
  // l'urgence déclarée revenait à faire dire au demandeur ce qu'il n'a pas
  // dit — et faisait arriver l'intégralité de la file en risque vital.
  const cas: [string, string, string][] = [
    ['Haute', 'P2', 'gene'],
    ['Moyenne', 'P3', 'gene'],
    ['Basse', 'P4', 'gene'],
    ['Urgence vitale', 'P1', 'risque_vital'],
    ['Urgent', 'P2', 'gene'],
    ['Quand possible', 'P4', 'gene'],
    ['Panne critique', 'P1', 'risque_vital'],
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
  verifier('converti en P2', r?.demande?.urgenceDeclaree, 'P2');
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
  verifier('« Haute » → P2', r?.demande?.urgenceDeclaree, 'P2');
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
  verifier('corps de métier déduit du secteur', r?.demande?.domaineSuggere, 'fluides_medicaux');
  verifier('désignation libre conservée à part', r?.demande?.designationLibre, 'prise murale oxygène');
  verifier('aucun équipement rattaché d’office', r?.demande?.equipementId, undefined);
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
  'classeur d’un autre compte, partagé — par identifiants',
  microsoft.cheminClasseur('drive:b!aZ12-xY:item:01ABCDEF123456'),
  '/drives/b!aZ12-xY/items/01ABCDEF123456',
);
verifier(
  'la forme partagée passe avant la forme par chemin',
  microsoft.cheminClasseur('drive:b!aZ12:item:01XYZ').includes('/items/'),
  true,
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
console.log('\nSecteur du formulaire → corps de métier');

for (const [secteur, attendu] of [
  ['Plomberie', 'technique_batiment'],
  ['Électricité', 'technique_batiment'],
  ['Climatisation', 'technique_batiment'],
  ['Gaz Médicaux', 'fluides_medicaux'],
  ['Biomédical', 'biomedical'],
  ['Menuiserie', 'technique_batiment'],
  ['Maçonnerie', 'technique_batiment'],
  ['It/réseau', 'informatique'],
  ['Autres', undefined],
] as const) {
  verifier(`« ${secteur} »`, domaineDuSecteur(secteur), attendu);
}

{
  // « Autres » est le choix de qui ne sait pas où se ranger : les mots de la
  // demande doivent alors prendre le relais.
  verifier(
    '« Autres » + « robinet qui fuit » → bâtiment',
    deduireDomaine({ secteur: 'Autres', designation: 'robinet', description: 'fuite sous le lavabo' }),
    'technique_batiment',
  );
  verifier(
    '« Autres » + « respirateur » → biomédical',
    deduireDomaine({ secteur: 'Autres', designation: 'respirateur' }),
    'biomedical',
  );
  verifier(
    '« Autres » + « prise murale oxygène » → fluides',
    deduireDomaine({ secteur: 'Autres', designation: 'prise murale oxygène' }),
    'fluides_medicaux',
  );
  verifier('rien à déduire de rien', deduireDomaine({ secteur: 'Autres' }), undefined);
  verifier('secteur absent, description parlante', deduireDomaine({ description: 'extincteur vide' }), 'securite_incendie');
}

/* ================================================================== */
console.log('\nRapprochement avec l’inventaire');

{
  const climatiseur = base.equipements.find((e) => /climatiseur/i.test(e.designation))!;
  const r = suggererEquipements(base, { designation: 'climatiseur', domaine: 'technique_batiment' });
  verifier('« climatiseur » ramène des climatiseurs', r.length > 0 && /climatiseur/i.test(r[0].equipement.designation), true);
  verifier('la raison est lisible', r[0]?.raisons.some((x) => x.startsWith('désignation')), true);
  verifier('au plus cinq propositions', r.length <= 5, true);

  // Le local déclaré doit faire remonter la bonne machine en tête.
  const local = base.locaux.find((l) => l.id === climatiseur.localId)!;
  const cible = suggererEquipements(base, { designation: 'climatiseur', localId: local.id });
  verifier('le local déclaré fait remonter la machine du local', cible[0]?.equipement.localId, local.id);
}

{
  // Un mot qui ne correspond à rien ne doit pas ramener le contenu du local.
  const local = base.locaux[0];
  const r = suggererEquipements(base, { designation: 'poignée de porte', localId: local.id });
  verifier('une désignation sans écho ne ramène rien du local', r.every((c) => c.score >= 20), true);
}

{
  // Sans désignation du tout, le lieu seul sert de repli.
  const local = base.locaux.find((l) => base.equipements.some((e) => e.localId === l.id))!;
  const r = suggererEquipements(base, { localId: local.id });
  verifier('sans désignation, le local sert de repli', r.length > 0, true);
  verifier('et tout vient bien du local', r.every((c) => c.equipement.localId === local.id), true);
}

verifier('aucun critère, aucune proposition', suggererEquipements(base, {}), []);

{
  // Un équipement réformé ne doit jamais être proposé.
  const copie = structuredClone(base) as BaseGMAO;
  const cible = copie.equipements.find((e) => /respirateur/i.test(e.designation))!;
  copie.equipements = copie.equipements.filter((e) => !/respirateur/i.test(e.designation) || e.id === cible.id);
  cible.statut = 'reforme';
  verifier(
    'un équipement réformé n’est pas proposé',
    suggererEquipements(copie, { designation: 'respirateur' }).some((c) => c.equipement.id === cible.id),
    false,
  );
}

/* ================================================================== */
console.log('\nMessages d’erreur d’Entra ID');

{
  // Les codes AADSTS sont indexés par la documentation Microsoft, mais leur
  // libellé ne dit pas quoi régler. Le banc vérifie qu'on répond par un geste.
  const cas: [string, RegExp][] = [
    ['AADSTS70002: The client application must be marked as \'mobile.\'', /flux client publics/],
    ['AADSTS7000218: The request body must contain client_secret.', /client public/],
    ['AADSTS9002331: Application is not configured as multi-tenant.', /signInAudience/],
    ['AADSTS70000: The refresh token has expired.', /lier-microsoft/],
  ];
  for (const [brut, attendu] of cas) {
    const code = /AADSTS\d+/.exec(brut)![0];
    verifier(`${code} → geste à faire`, attendu.test(microsoft.messageErreurPourEssai(brut, 400)), true);
  }
  verifier(
    'code inconnu : le message brut est conservé',
    microsoft.messageErreurPourEssai('AADSTS99999: quelque chose', 400),
    'AADSTS99999: quelque chose (HTTP 400)',
  );
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

/* ================================================================== */
console.log('\nClasseur rendu en plusieurs pages par Graph');

{
  // Graph coupe les grands tableaux et laisse un « @odata.nextLink ». Ne pas
  // le suivre ne lève aucune erreur : la collecte voit simplement moins de
  // lignes qu'il n'y en a, et les réponses récentes n'arrivent jamais.
  const pages: Record<string, unknown> = {
    'rows': { value: [{ values: [['1']] }], '@odata.nextLink': 'rows?$skip=1' },
    'rows?$skip=1': { value: [{ values: [['2']] }], '@odata.nextLink': 'rows?$skip=2' },
    'rows?$skip=2': { value: [{ values: [['3']] }] },
  };
  const visitees: string[] = [];
  const appeler = async (url: string) => {
    visitees.push(url);
    return (pages[url] ?? { value: [] }) as Record<string, unknown>;
  };

  const lues = await microsoft.toutesLesLignes(appeler, 'rows');
  verifier('les trois pages sont suivies', visitees.length, 3);
  verifier(
    'les lignes de toutes les pages sont rendues',
    lues.map((l) => l.values?.[0]?.[0]),
    ['1', '2', '3'],
  );
}

{
  // Un lien qui se renvoie à lui-même ferait tourner la collecte sans fin.
  const appeler = async () => ({ value: [{ values: [['x']] }], '@odata.nextLink': 'boucle' });
  const lues = await microsoft.toutesLesLignes(appeler, 'boucle', 4);
  verifier('une boucle de liens est bornée', lues.length, 4);
}

{
  const appeler = async () => ({ value: [{ values: [['seule']] }] });
  const lues = await microsoft.toutesLesLignes(appeler, 'rows');
  verifier('une seule page reste une seule page', lues.length, 1);
}

/* ================================================================== */
console.log('\nPannes réseau traduites en gestes');

{
  // Node lève « TypeError: fetch failed » et range le motif dans « cause ».
  // Sans le déplier, les trois pannes ci-dessous se ressemblent à l'écran
  // alors qu'aucune ne se répare du même geste.
  const echec = (code: string) =>
    Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) });

  verifier('DNS muet → sortie du conteneur', /DNS|sortie vers Internet/.test(raisonReseau(echec('ENOTFOUND'))), true);
  verifier('DNS temporaire → même geste', /DNS|sortie vers Internet/.test(raisonReseau(echec('EAI_AGAIN'))), true);
  verifier('port fermé → connexion refusée', raisonReseau(echec('ECONNREFUSED')), 'connexion refusée');
  verifier(
    'certificat → proxy d’entreprise',
    /proxy/.test(raisonReseau(echec('UNABLE_TO_VERIFY_LEAF_SIGNATURE'))),
    true,
  );
  verifier(
    'délai dépassé nommé comme tel',
    raisonReseau(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })),
    'aucune réponse dans le délai imparti',
  );
  verifier(
    'cause imbriquée : le code le plus profond l’emporte',
    raisonReseau({ message: 'fetch failed', cause: { message: 'y', cause: { code: 'ECONNRESET' } } }),
    'connexion coupée en cours de route',
  );
  verifier(
    'panne inconnue : le message reste, avec son code',
    raisonReseau(Object.assign(new Error('quelque chose'), { code: 'EWEIRD' })),
    'quelque chose (EWEIRD)',
  );
}

/* ================================================================== */
console.log('\nChoix du tableau des réponses');

{
  // Le nom du tableau varie d'un classeur à l'autre — « Tableau1 » sur un
  // classeur laissé tel quel, « Repostes » sur celui de Monkole. La collecte
  // échouait sur un 404 là où l'aperçu se rabattait déjà sur le premier : les
  // deux montraient alors des choses différentes, ce qui est pire qu'un refus.
  const tables = (noms: string[]) => async () => ({ value: noms.map((name) => ({ name })) });

  verifier(
    'nom exact : celui-là',
    await microsoft.resoudreTableau(tables(['Tableau1', 'Repostes']), '', 'Repostes'),
    'Repostes',
  );
  verifier(
    'nom erroné, un seul tableau : pas d’ambiguïté',
    await microsoft.resoudreTableau(tables(['Repostes']), '', 'Tableau1'),
    'Repostes',
  );

  let refus = '';
  try {
    await microsoft.resoudreTableau(tables(['Repostes', 'Archive']), '', 'Tableau1');
  } catch (e) {
    refus = (e as Error).message;
  }
  verifier('nom erroné, plusieurs tableaux : refus', /Repostes, Archive/.test(refus), true);

  refus = '';
  try {
    await microsoft.resoudreTableau(tables([]), '', 'Tableau1');
  } catch (e) {
    refus = (e as Error).message;
  }
  verifier('aucun tableau : le geste à faire', /Insertion → Tableau/.test(refus), true);
}

/* ================================================================== */
console.log('\nDates rangées par Excel sous forme de nombre');

{
  // Une question datée remplie par Forms arrive comme un nombre de jours
  // depuis 1899. « 46274 » dans une demande ne dit rien à un technicien — et
  // ne dit même pas qu'il s'agit d'une date.
  const COLONNES = ['Id', 'Date de plainté', 'Date de dèbut du probleme', 'Description du problème'];
  const lire = (v: unknown, colonne = 'Date de dèbut du probleme') =>
    microsoft.lireLigneClasseur(COLONNES, ['1', '16/09/2026 08:00', v, v], 'c')
      ?.reponses.find((r) => r.libelle === colonne)?.valeur;

  verifier('série Excel rendue lisible', lire(46274), '09/09/2026');
  verifier('série en texte aussi', lire('46274'), '09/09/2026');
  verifier('texte libre intact', lire('depuis 3 jours'), 'depuis 3 jours');
  verifier('nombre hors plage : pas une date', lire('12'), '12');
  verifier('date déjà écrite : intacte', lire('16/09/2026'), '16/09/2026');
  verifier(
    'colonne non datée : le nombre reste un nombre',
    lire(46274, 'Description du problème'),
    '46274',
  );
}

/* ================================================================== */
console.log('\nPoint de reprise : un numéro, ou une date');

{
  // La collecte fait avancer un numéro de réponse ; « Rattraper les 7
  // derniers jours » envoie une date. Confondre les deux faisait relire le
  // classeur entier sans que rien ne le signale.
  verifier('repère courant : un numéro', microsoft.interpreterRepere('871'), { id: 871 });
  verifier(
    'rattrapage : une date',
    microsoft.interpreterRepere('2026-09-11 07:00:00'),
    { date: '2026-09-11T07:00:00' },
  );
  verifier('date française acceptée', microsoft.interpreterRepere('11/09/2026'), {
    date: '2026-09-11T00:00:00',
  });
  verifier('rien : pas de filtre', microsoft.interpreterRepere(undefined), {});
  verifier('vide : pas de filtre', microsoft.interpreterRepere('  '), {});
  verifier('illisible : pas de filtre plutôt qu’un filtre au hasard', microsoft.interpreterRepere('bientôt'), {});
}

/* ================================================================== */
console.log('\nLe nom écrit sur le formulaire');

{
  // La demande est portée par le compte de service, faute de pouvoir
  // rattacher « Eugénie » à un utilisateur. Sans conserver son nom à part,
  // la liste affiche le compte de service pour tout le monde, et trois
  // signalements de trois personnes deviennent indiscernables.
  const r = convertirSoumission(
    base,
    soumission({ [MONKOLE.demandeur]: 'Herdie Vita', [MONKOLE.description]: 'Chasse d’eau HS' }),
    correspondance,
    porteur,
  );
  verifier('nom déclaré conservé', r.demande?.origineExterne?.declarant, 'Herdie Vita');
  verifier('la demande reste portée par le compte de service', r.demande?.demandeurId, porteur);
  verifier(
    'numéro de téléphone collé au nom : conservé tel quel',
    convertirSoumission(
      base,
      soumission({ [MONKOLE.demandeur]: 'Kanza Shekinah, 0823670757', [MONKOLE.description]: 'Lampe' }),
      correspondance,
      porteur,
    ).demande?.origineExterne?.declarant,
    'Kanza Shekinah, 0823670757',
  );

  // Un demandeur de l'annuaire porte sa propre demande : pas de doublon.
  const connu = base.utilisateurs[3];
  const s = convertirSoumission(
    base,
    soumission({
      [MONKOLE.demandeur]: `${connu.prenom} ${connu.nom}`,
      [MONKOLE.description]: 'Panne',
    }),
    correspondance,
    porteur,
  );
  verifier('demandeur connu : la demande lui revient', s.demande?.demandeurId, connu.id);
  verifier('et son nom n’est pas répété à part', s.demande?.origineExterne?.declarant, undefined);
}

console.log(echecs === 0 ? '\nTous les cas passent.\n' : `\n${echecs} cas en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
