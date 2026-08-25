import { useRef, useState } from 'react';
import { AlertTriangle, Database, Download, RefreshCw, Upload } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Modale } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { useGMAO } from '@/data/store';
import { exporterJSON, importerJSON, telecharger } from '@/data/persistance';
import { dateHeure } from '@/lib/dates';
import { montant, nombre } from '@/lib/format';
import { CRITICITE, DOMAINE, REFERENTIEL, ROLE } from '@/types/labels';
import type { FamilleEquipement, Local, ServiceHospitalier, Site } from '@/types/domain';

export function PageParametres() {
  const { base, index, remplacerBase, reinitialiser } = useGMAO();
  const [vue, setVue] = useState<'referentiels' | 'organisation' | 'base'>('referentiels');
  const [confirmation, setConfirmation] = useState<'reinitialiser' | null>(null);
  const [erreurImport, setErreurImport] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const colonnesServices: Colonne<ServiceHospitalier>[] = [
    { cle: 'code', entete: 'Code', largeur: '80px', tri: (s) => s.code, rendu: (s) => <span className="font-mono text-xs">{s.code}</span> },
    { cle: 'nom', entete: 'Service', tri: (s) => s.nom, rendu: (s) => <span className="font-medium text-slate-800">{s.nom}</span> },
    { cle: 'pole', entete: 'Pôle', largeur: '200px', tri: (s) => s.pole, rendu: (s) => s.pole },
    { cle: 'responsable', entete: 'Responsable', largeur: '200px', secondaire: true, tri: (s) => s.responsable, rendu: (s) => s.responsable },
    {
      cle: 'criticite',
      entete: 'Criticité',
      largeur: '120px',
      tri: (s) => s.criticite,
      export: (s) => CRITICITE[s.criticite].libelle,
      rendu: (s) => <Badge ton={CRITICITE[s.criticite].ton} compact>{CRITICITE[s.criticite].libelle}</Badge>,
    },
    { cle: 'continu', entete: '24 h / 24', largeur: '100px', tri: (s) => Number(s.continuite24_7), rendu: (s) => (s.continuite24_7 ? 'oui' : 'non') },
    {
      cle: 'equipements',
      entete: 'Équipements',
      largeur: '120px',
      aDroite: true,
      tri: (s) => base.equipements.filter((e) => e.serviceId === s.id).length,
      rendu: (s) => nombre(base.equipements.filter((e) => e.serviceId === s.id).length, 0),
    },
  ];

  const colonnesFamilles: Colonne<FamilleEquipement>[] = [
    { cle: 'code', entete: 'Code', largeur: '80px', tri: (f) => f.code, rendu: (f) => <span className="font-mono text-xs">{f.code}</span> },
    { cle: 'nom', entete: 'Famille', tri: (f) => f.nom, rendu: (f) => <span className="font-medium text-slate-800">{f.nom}</span> },
    { cle: 'domaine', entete: 'Domaine', largeur: '200px', tri: (f) => f.domaine, export: (f) => DOMAINE[f.domaine].libelle, rendu: (f) => <Badge ton={DOMAINE[f.domaine].ton} compact>{DOMAINE[f.domaine].libelle}</Badge> },
    { cle: 'duree', entete: 'Durée de vie', largeur: '120px', aDroite: true, tri: (f) => f.dureeVieAns, rendu: (f) => `${f.dureeVieAns} ans` },
    {
      cle: 'parc',
      entete: 'Parc',
      largeur: '100px',
      aDroite: true,
      tri: (f) => base.equipements.filter((e) => e.familleId === f.id).length,
      rendu: (f) => nombre(base.equipements.filter((e) => e.familleId === f.id).length, 0),
    },
    {
      cle: 'valeur',
      entete: 'Valeur d’achat',
      largeur: '140px',
      aDroite: true,
      tri: (f) => base.equipements.filter((e) => e.familleId === f.id).reduce((s, e) => s + e.valeurAchat, 0),
      export: (f) => Math.round(base.equipements.filter((e) => e.familleId === f.id).reduce((s, e) => s + e.valeurAchat, 0)),
      rendu: (f) => montant(base.equipements.filter((e) => e.familleId === f.id).reduce((s, e) => s + e.valeurAchat, 0)),
    },
  ];

  const colonnesLocaux: Colonne<Local>[] = [
    { cle: 'code', entete: 'Code', largeur: '130px', tri: (l) => l.code, rendu: (l) => <span className="font-mono text-xs">{l.code}</span> },
    { cle: 'nom', entete: 'Local', tri: (l) => l.nom, rendu: (l) => l.nom },
    { cle: 'service', entete: 'Service', largeur: '250px', tri: (l) => index.services.get(l.serviceId)?.nom ?? '', rendu: (l) => index.services.get(l.serviceId)?.nom },
    { cle: 'batiment', entete: 'Bâtiment', largeur: '220px', secondaire: true, tri: (l) => index.batiments.get(l.batimentId)?.nom ?? '', rendu: (l) => index.batiments.get(l.batimentId)?.nom },
    { cle: 'zone', entete: 'Zone à risque', largeur: '150px', tri: (l) => l.zoneRisque, rendu: (l) => <span className="text-xs">{l.zoneRisque.replace(/_/g, ' ')}</span> },
    { cle: 'surface', entete: 'Surface', largeur: '90px', aDroite: true, secondaire: true, tri: (l) => l.surfaceM2 ?? 0, rendu: (l) => (l.surfaceM2 ? `${l.surfaceM2} m²` : '—') },
  ];

  const colonnesSites: Colonne<Site>[] = [
    { cle: 'code', entete: 'Code', largeur: '110px', tri: (s) => s.code, rendu: (s) => <span className="font-mono text-xs">{s.code}</span> },
    { cle: 'nom', entete: 'Site', tri: (s) => s.nom, rendu: (s) => <span className="font-medium text-slate-800">{s.nom}</span> },
    { cle: 'type', entete: 'Type', largeur: '150px', tri: (s) => s.type, rendu: (s) => s.type.replace(/_/g, ' ') },
    { cle: 'ville', entete: 'Ville', largeur: '150px', tri: (s) => s.ville, rendu: (s) => `${s.ville} (${s.province})` },
    { cle: 'lits', entete: 'Lits', largeur: '90px', aDroite: true, tri: (s) => s.nbLits, rendu: (s) => nombre(s.nbLits, 0) },
    {
      cle: 'equipements',
      entete: 'Équipements',
      largeur: '120px',
      aDroite: true,
      tri: (s) => base.equipements.filter((e) => e.siteId === s.id).length,
      rendu: (s) => nombre(base.equipements.filter((e) => e.siteId === s.id).length, 0),
    },
  ];

  const importer = async (f: File) => {
    try {
      const texte = await f.text();
      remplacerBase(importerJSON(texte));
      setErreurImport(null);
    } catch (e) {
      setErreurImport(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  };

  return (
    <>
      <EnTetePage
        titre="Paramètres"
        description="Référentiels, organisation et gestion de la base de données locale"
        actions={
          <Segments
            valeur={vue}
            onChange={setVue}
            taille="sm"
            options={[
              { valeur: 'referentiels', libelle: 'Référentiels' },
              { valeur: 'organisation', libelle: 'Organisation' },
              { valeur: 'base', libelle: 'Base de données' },
            ]}
          />
        }
      />

      <CorpsPage>
        {vue === 'referentiels' && (
          <div className="space-y-4">
            <Carte sansPadding titre="Familles d’équipements" sousTitre="Structure de l’inventaire et durées d’amortissement de référence">
              <Tableau
                lignes={base.familles}
                colonnes={colonnesFamilles}
                cleLigne={(f) => f.id}
                triInitial={{ cle: 'code', sens: 'asc' }}
                parPage={25}
                nomExport="familles-equipements"
                vide="Aucune famille."
              />
            </Carte>

            <Carte titre="Niveaux de criticité" sousTitre="Déterminent les priorités d’intervention et les objectifs de disponibilité">
              <ul className="space-y-2">
                {Object.entries(CRITICITE).map(([niveau, e]) => (
                  <li key={niveau} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <Badge ton={e.ton}>{e.libelle}</Badge>
                    <p className="text-sm text-slate-600">{e.aide}</p>
                  </li>
                ))}
              </ul>
            </Carte>

            <Carte titre="Référentiels réglementaires suivis" sousTitre="Textes servant de base aux obligations de contrôle">
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {Object.entries(REFERENTIEL).map(([cle, libelle]) => {
                  const nb = base.controles.filter((c) => c.referentiel === cle).length;
                  return (
                    <li key={cle} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                      <span className="min-w-0 truncate text-slate-700">{libelle}</span>
                      <span className="shrink-0 text-xs tabulaire text-slate-500">{nb} obligation(s)</span>
                    </li>
                  );
                })}
              </ul>
            </Carte>

            <Carte titre="Rôles et droits" sousTitre="Profils disponibles dans l’application">
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {Object.entries(ROLE).map(([cle, libelle]) => (
                  <li key={cle} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                    <span className="text-slate-700">{libelle}</span>
                    <span className="text-xs tabulaire text-slate-500">
                      {base.utilisateurs.filter((u) => u.role === cle).length} agent(s)
                    </span>
                  </li>
                ))}
              </ul>
            </Carte>
          </div>
        )}

        {vue === 'organisation' && (
          <div className="space-y-4">
            <Carte sansPadding titre="Sites" sousTitre="Établissements couverts par la GMAO">
              <Tableau lignes={base.sites} colonnes={colonnesSites} cleLigne={(s) => s.id} parPage={10} nomExport="sites" vide="Aucun site." />
            </Carte>

            <Carte sansPadding titre="Services et unités fonctionnelles">
              <Tableau
                lignes={base.services}
                colonnes={colonnesServices}
                cleLigne={(s) => s.id}
                triInitial={{ cle: 'code', sens: 'asc' }}
                parPage={25}
                nomExport="services"
                vide="Aucun service."
              />
            </Carte>

            <Carte sansPadding titre="Locaux" sousTitre="Unités d’implantation des équipements">
              <Tableau
                lignes={base.locaux}
                colonnes={colonnesLocaux}
                cleLigne={(l) => l.id}
                triInitial={{ cle: 'code', sens: 'asc' }}
                parPage={30}
                nomExport="locaux"
                vide="Aucun local."
              />
            </Carte>
          </div>
        )}

        {vue === 'base' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Carte titre="État de la base" icone={<Database className="size-4 text-slate-400" />}>
              <Definitions
                items={[
                  { label: 'Version du schéma', valeur: base.version },
                  { label: 'Générée le', valeur: dateHeure(base.dateGeneration) },
                  { label: 'Équipements', valeur: nombre(base.equipements.length, 0) },
                  { label: 'Ordres de travail', valeur: nombre(base.ordresTravail.length, 0) },
                  { label: 'Demandes', valeur: nombre(base.demandes.length, 0) },
                  { label: 'Gammes de maintenance', valeur: nombre(base.gammes.length, 0) },
                  { label: 'Visites de contrôle', valeur: nombre(base.visitesControle.length, 0) },
                  { label: 'Articles en magasin', valeur: nombre(base.articles.length, 0) },
                  { label: 'Mouvements de stock', valeur: nombre(base.mouvementsStock.length, 0) },
                  { label: 'Relevés de capteurs', valeur: nombre(base.releves.length, 0) },
                  { label: 'Documents', valeur: nombre(base.documents.length, 0) },
                  { label: 'Écritures d’audit', valeur: nombre(base.audit.length, 0) },
                ]}
              />
            </Carte>

            <div className="space-y-4">
              <Carte titre="Sauvegarde et restauration">
                <p className="text-sm text-slate-600">
                  Les données sont conservées dans le navigateur (IndexedDB). L’export produit un fichier JSON complet,
                  qui sert aussi bien de sauvegarde que de moyen de transfert vers un autre poste.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Bouton
                    variante="primaire"
                    onClick={() =>
                      telecharger(`gmao-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, exporterJSON(base))
                    }
                  >
                    <Download className="size-4" /> Exporter la base
                  </Bouton>
                  <Bouton onClick={() => fichier.current?.click()}>
                    <Upload className="size-4" /> Importer une sauvegarde
                  </Bouton>
                  <input
                    ref={fichier}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importer(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                {erreurImport && (
                  <div className="mt-3">
                    <Encart ton="danger" titre="Import impossible">
                      {erreurImport}
                    </Encart>
                  </div>
                )}
              </Carte>

              <Carte titre="Réinitialisation">
                <Encart ton="attention" titre="Opération irréversible" icone={<AlertTriangle className="size-4" />}>
                  La réinitialisation efface les données locales et régénère le jeu de démonstration. Exporter la base
                  avant, si les saisies doivent être conservées.
                </Encart>
                <div className="mt-4">
                  <Bouton variante="danger" onClick={() => setConfirmation('reinitialiser')}>
                    <RefreshCw className="size-4" /> Réinitialiser la base
                  </Bouton>
                </div>
              </Carte>

              <Carte titre="Architecture des données">
                <p className="text-sm text-slate-600">
                  L’application fonctionne entièrement côté navigateur : aucun serveur n’est requis pour la démonstration.
                  Les écritures passent toutes par une même fonction de mutation, qui journalise l’action et persiste
                  l’état. Le branchement d’une API REST ne demande de remplacer que la couche de persistance
                  (<span className="font-mono text-xs">src/data/persistance.ts</span>) ; les opérations métier de
                  <span className="font-mono text-xs"> src/data/actions.ts</span> restent inchangées.
                </p>
              </Carte>
            </div>
          </div>
        )}
      </CorpsPage>

      <Modale
        ouverte={confirmation === 'reinitialiser'}
        onFermer={() => setConfirmation(null)}
        titre="Réinitialiser la base ?"
        largeur="sm"
        pied={
          <>
            <Bouton onClick={() => setConfirmation(null)}>Annuler</Bouton>
            <Bouton
              variante="danger"
              onClick={() => {
                void reinitialiser();
                setConfirmation(null);
              }}
            >
              Confirmer la réinitialisation
            </Bouton>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Toutes les saisies effectuées depuis le dernier export seront perdues, y compris les ordres de travail créés et
          les mouvements de stock enregistrés.
        </p>
      </Modale>
    </>
  );
}
