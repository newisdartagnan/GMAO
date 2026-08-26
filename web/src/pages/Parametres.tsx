import { useEffect, useState } from 'react';
import { Database, Download, KeyRound, QrCode, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Modale } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { Champ, Liste, Saisie } from '@/components/ui/Champs';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import type { EtatIntegrations } from '@/data/api';
import { exporterJSON, telecharger, versCSV } from '@/data/persistance';
import { dateHeure, lienFormulaireExterne } from '@gmao/partage';
import { montant, nombre } from '@gmao/partage';
import { CRITICITE, DOMAINE, REFERENTIEL, ROLE } from '@gmao/partage';
import type { BaseGMAO, FamilleEquipement, Local, ServiceHospitalier, Site } from '@gmao/partage';

export function PageParametres() {
  const { base, index, utilisateur, rafraichir } = useGMAO();
  const [vue, setVue] = useState<'referentiels' | 'organisation' | 'comptes' | 'integrations' | 'base'>('referentiels');
  const estAdministrateur = utilisateur.role === 'admin';

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
            options={
              estAdministrateur
                ? [
                    { valeur: 'referentiels', libelle: 'Référentiels' },
                    { valeur: 'organisation', libelle: 'Organisation' },
                    { valeur: 'comptes', libelle: 'Comptes' },
                    { valeur: 'integrations', libelle: 'Formulaire externe' },
                    { valeur: 'base', libelle: 'Base de données' },
                  ]
                : [
                    { valeur: 'referentiels', libelle: 'Référentiels' },
                    { valeur: 'organisation', libelle: 'Organisation' },
                    { valeur: 'comptes', libelle: 'Mon compte' },
                  ]
            }
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

        {vue === 'comptes' && (estAdministrateur ? <OngletComptes /> : <OngletMonCompte />)}

        {vue === 'integrations' && estAdministrateur && <OngletIntegrations />}
        {vue === 'base' && estAdministrateur && <OngletBase base={base} onRecharger={rafraichir} />}
      </CorpsPage>

    </>
  );
}

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

interface LigneCompte {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  role: string;
  actif: boolean;
  acces_ouvert: boolean;
  derniere_connexion: string | null;
}

function OngletComptes() {
  const { base, commander } = useGMAO();
  const [comptes, setComptes] = useState<LigneCompte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [motDePasse, setMotDePasse] = useState<LigneCompte | null>(null);

  const recharger = () => {
    api
      .listerComptes()
      .then((r) => setComptes(r.utilisateurs))
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible'));
  };

  useEffect(recharger, []);

  const colonnes: Colonne<LigneCompte>[] = [
    {
      cle: 'nom',
      entete: 'Agent',
      tri: (c) => `${c.nom} ${c.prenom}`,
      rendu: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">
            {c.prenom} {c.nom}
          </p>
          <p className="truncate text-xs text-slate-500">{c.email}</p>
        </div>
      ),
    },
    { cle: 'matricule', entete: 'Matricule', largeur: '110px', tri: (c) => c.matricule, rendu: (c) => c.matricule },
    {
      cle: 'role',
      entete: 'Rôle',
      largeur: '220px',
      tri: (c) => c.role,
      rendu: (c) => <span className="text-sm text-slate-600">{ROLE[c.role as keyof typeof ROLE] ?? c.role}</span>,
    },
    {
      cle: 'acces',
      entete: 'Accès',
      largeur: '130px',
      tri: (c) => Number(c.acces_ouvert),
      rendu: (c) =>
        !c.actif ? (
          <Badge ton="ardoise" compact>désactivé</Badge>
        ) : c.acces_ouvert ? (
          <Badge ton="succes" compact>ouvert</Badge>
        ) : (
          <Badge ton="attention" compact>sans mot de passe</Badge>
        ),
    },
    {
      cle: 'connexion',
      entete: 'Dernière connexion',
      largeur: '170px',
      secondaire: true,
      tri: (c) => c.derniere_connexion ?? '',
      rendu: (c) => (c.derniere_connexion ? dateHeure(c.derniere_connexion) : <span className="text-slate-400">jamais</span>),
    },
    {
      cle: 'actions',
      entete: '',
      largeur: '210px',
      aDroite: true,
      rendu: (c) => (
        <div className="flex justify-end gap-1.5">
          <Bouton taille="sm" onClick={() => setMotDePasse(c)}>
            <KeyRound className="size-3.5" /> Mot de passe
          </Bouton>
          <Bouton
            taille="sm"
            variante={c.actif ? 'secondaire' : 'primaire'}
            onClick={async () => {
              await commander(() => api.modifierCompte(c.id, { actif: !c.actif }));
              recharger();
            }}
          >
            {c.actif ? 'Désactiver' : 'Réactiver'}
          </Bouton>
        </div>
      ),
    },
  ];

  return (
    <>
      <Carte
        sansPadding
        titre="Comptes d’accès"
        sousTitre="Un compte par agent : la piste d’audit ne vaut que si chacun saisit sous son nom"
        icone={<ShieldCheck className="size-4 text-slate-400" />}
        actions={
          <>
            <Bouton
              taille="sm"
              onClick={() =>
                comptes &&
                telecharger(
                  'comptes-gmao.csv',
                  versCSV(
                    comptes.map((c) => ({
                      Matricule: c.matricule,
                      Nom: c.nom,
                      Prénom: c.prenom,
                      Adresse: c.email,
                      Rôle: ROLE[c.role as keyof typeof ROLE] ?? c.role,
                      Actif: c.actif ? 'oui' : 'non',
                      'Accès ouvert': c.acces_ouvert ? 'oui' : 'non',
                      'Dernière connexion': c.derniere_connexion ?? '',
                    })),
                  ),
                  'text/csv',
                )
              }
            >
              <Download className="size-3.5" /> Exporter
            </Bouton>
            <Bouton variante="primaire" taille="sm" onClick={() => setCreation(true)}>
              <UserPlus className="size-3.5" /> Nouveau compte
            </Bouton>
          </>
        }
      >
        {erreur ? (
          <div className="p-4">
            <Encart ton="danger">{erreur}</Encart>
          </div>
        ) : (
          <Tableau
            lignes={comptes ?? []}
            colonnes={colonnes}
            cleLigne={(c) => c.id}
            triInitial={{ cle: 'nom', sens: 'asc' }}
            parPage={25}
            vide={comptes ? 'Aucun compte.' : 'Chargement…'}
            ligneClassName={(c) => (!c.actif ? 'opacity-60' : '')}
          />
        )}
      </Carte>

      {motDePasse && (
        <ModaleMotDePasse
          compte={motDePasse}
          onFermer={() => setMotDePasse(null)}
          onValide={() => {
            setMotDePasse(null);
            recharger();
          }}
        />
      )}

      {creation && (
        <ModaleNouveauCompte
          services={base.services}
          equipes={base.equipes}
          onFermer={() => setCreation(false)}
          onCree={() => {
            setCreation(false);
            recharger();
          }}
        />
      )}
    </>
  );
}

function ModaleMotDePasse({
  compte,
  onFermer,
  onValide,
}: {
  compte: LigneCompte;
  onFermer: () => void;
  onValide: () => void;
}) {
  const [valeur, setValeur] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Définir un mot de passe"
      sousTitre={`${compte.prenom} ${compte.nom} — ${compte.email}`}
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={valeur.length < 8}
            onClick={async () => {
              try {
                await api.reinitialiserMotDePasse(compte.id, valeur);
                onValide();
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Échec');
              }
            }}
          >
            Enregistrer
          </Bouton>
        </>
      }
    >
      <Champ
        label="Nouveau mot de passe"
        aide="Huit caractères au minimum. À communiquer à l’agent, qui devra le changer."
        erreur={erreur ?? undefined}
      >
        <Saisie type="text" value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus />
      </Champ>
    </Modale>
  );
}

function ModaleNouveauCompte({
  services,
  equipes,
  onFermer,
  onCree,
}: {
  services: ServiceHospitalier[];
  equipes: { id: string; nom: string }[];
  onFermer: () => void;
  onCree: () => void;
}) {
  const [f, setF] = useState({
    nom: '',
    prenom: '',
    email: '',
    matricule: '',
    role: 'technicien',
    equipeId: '',
    serviceId: '',
    tauxHoraire: 0,
    motDePasse: '',
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Nouveau compte"
      sousTitre="Le rôle détermine ce que l’agent peut faire, pas seulement ce qu’il voit"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={!f.nom || !f.prenom || !f.email || !f.matricule}
            onClick={async () => {
              try {
                await api.creerCompte({
                  ...f,
                  equipeId: f.equipeId || undefined,
                  serviceId: f.serviceId || undefined,
                  motDePasse: f.motDePasse || undefined,
                });
                onCree();
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Création impossible');
              }
            }}
          >
            Créer le compte
          </Bouton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prénom" obligatoire>
          <Saisie value={f.prenom} onChange={(e) => maj('prenom', e.target.value)} />
        </Champ>
        <Champ label="Nom" obligatoire>
          <Saisie value={f.nom} onChange={(e) => maj('nom', e.target.value)} />
        </Champ>
        <Champ label="Adresse électronique" obligatoire className="sm:col-span-2">
          <Saisie type="email" value={f.email} onChange={(e) => maj('email', e.target.value)} placeholder="prenom.nom@hgr-kinshasa.cd" />
        </Champ>
        <Champ label="Matricule" obligatoire>
          <Saisie value={f.matricule} onChange={(e) => maj('matricule', e.target.value)} />
        </Champ>
        <Champ label="Rôle">
          <Liste
            value={f.role}
            onChange={(e) => maj('role', e.target.value)}
            options={Object.entries(ROLE).map(([v, l]) => ({ valeur: v, libelle: l }))}
          />
        </Champ>
        <Champ label="Équipe">
          <Liste
            value={f.equipeId}
            onChange={(e) => maj('equipeId', e.target.value)}
            vide="— aucune —"
            options={equipes.map((e) => ({ valeur: e.id, libelle: e.nom }))}
          />
        </Champ>
        <Champ label="Service">
          <Liste
            value={f.serviceId}
            onChange={(e) => maj('serviceId', e.target.value)}
            vide="— aucun —"
            options={services.map((s) => ({ valeur: s.id, libelle: s.nom }))}
          />
        </Champ>
        <Champ label="Taux horaire chargé (USD)" aide="Sert au calcul du coût des interventions">
          <Saisie
            type="number"
            min={0}
            value={f.tauxHoraire || ''}
            onChange={(e) => maj('tauxHoraire', Number(e.target.value))}
          />
        </Champ>
        <Champ label="Mot de passe initial" aide="Laisser vide pour utiliser celui défini à l’installation">
          <Saisie type="text" value={f.motDePasse} onChange={(e) => maj('motDePasse', e.target.value)} />
        </Champ>
        {erreur && (
          <div className="sm:col-span-2">
            <Encart ton="danger">{erreur}</Encart>
          </div>
        )}
      </div>
    </Modale>
  );
}

function OngletMonCompte() {
  const { utilisateur } = useGMAO();
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<{ ton: 'succes' | 'danger'; texte: string } | null>(null);

  const valide = ancien && nouveau.length >= 8 && nouveau === confirmation;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Carte titre="Mon compte">
        <Definitions
          items={[
            { label: 'Nom', valeur: `${utilisateur.prenom} ${utilisateur.nom}` },
            { label: 'Matricule', valeur: utilisateur.matricule },
            { label: 'Adresse', valeur: utilisateur.email },
            { label: 'Rôle', valeur: ROLE[utilisateur.role] },
          ]}
        />
      </Carte>

      <Carte titre="Changer mon mot de passe" icone={<KeyRound className="size-4 text-slate-400" />}>
        <div className="space-y-4">
          <Champ label="Mot de passe actuel">
            <Saisie type="password" value={ancien} onChange={(e) => setAncien(e.target.value)} autoComplete="current-password" />
          </Champ>
          <Champ label="Nouveau mot de passe" aide="Huit caractères au minimum">
            <Saisie type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" />
          </Champ>
          <Champ
            label="Confirmation"
            erreur={confirmation && nouveau !== confirmation ? 'Les deux saisies diffèrent' : undefined}
          >
            <Saisie type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
          </Champ>
          {message && <Encart ton={message.ton}>{message.texte}</Encart>}
          <Bouton
            variante="primaire"
            disabled={!valide}
            onClick={async () => {
              try {
                await api.changerMotDePasse(ancien, nouveau);
                setMessage({ ton: 'succes', texte: 'Mot de passe modifié.' });
                setAncien('');
                setNouveau('');
                setConfirmation('');
              } catch (e) {
                setMessage({ ton: 'danger', texte: e instanceof Error ? e.message : 'Échec' });
              }
            }}
          >
            Enregistrer
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Base de données                                                     */
/* ------------------------------------------------------------------ */

/**
 * Formulaire externe de signalement.
 *
 * Le connecteur se configure par variables d'environnement, pas ici : ce qui
 * relève du déploiement ne doit pas être modifiable depuis une session
 * ouverte. Cet onglet dit ce que le serveur a compris de sa configuration, ce
 * qu'il a reçu, et permet de rattraper une période manquante après une
 * coupure du lien Internet — ce qui, à Kinshasa, n'est pas une hypothèse
 * d'école.
 */
function OngletIntegrations() {
  const { base, index } = useGMAO();
  const [etat, setEtat] = useState<EtatIntegrations | null>(null);
  const [message, setMessage] = useState<{ ton: 'succes' | 'danger'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const recharger = () => api.etatIntegrations().then(setEtat).catch(() => setEtat(null));
  useEffect(() => {
    void recharger();
  }, []);

  const jf = etat?.jotform;
  const externes = base.demandes.filter((d) => d.origineExterne);
  const exemple = base.equipements[0];

  const synchroniser = async (depuis?: string) => {
    setEnCours(true);
    setMessage(null);
    try {
      const r = await api.synchroniserJotform(depuis);
      setMessage({
        ton: 'succes',
        texte:
          `${r.lues} soumission(s) lue(s) — ${r.creees.length} demande(s) créée(s), ` +
          `${r.ignorees} déjà connue(s)` +
          (r.rejets.length ? `, ${r.rejets.length} écartée(s) : ${r.rejets[0].motif}` : '.'),
      });
      await recharger();
    } catch (e) {
      setMessage({ ton: 'danger', texte: e instanceof Error ? e.message : 'Récupération impossible' });
    } finally {
      setEnCours(false);
    }
  };

  if (!jf) {
    return (
      <Carte titre="Formulaire externe">
        <p className="text-sm text-slate-500">État du connecteur indisponible.</p>
      </Carte>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Carte titre="Connecteur JotForm" icone={<QrCode className="size-4 text-slate-400" />}>
          {!jf.configure && !jf.webhookOuvert && (
            <div className="mb-3">
              <Encart ton="attention" titre="Connecteur inactif">
                Aucun formulaire n’est branché. Renseignez <span className="font-mono text-xs">JOTFORM_API_KEY</span> et{' '}
                <span className="font-mono text-xs">JOTFORM_FORMULAIRE_ID</span> dans le fichier{' '}
                <span className="font-mono text-xs">.env</span>, puis redémarrez la pile Docker.
              </Encart>
            </div>
          )}
          <Definitions
            colonnes={1}
            items={[
              { label: 'Formulaire', valeur: jf.formulaireId ? <span className="font-mono text-xs">{jf.formulaireId}</span> : '—' },
              {
                label: 'Récupération',
                valeur: jf.recuperationActive ? (
                  <Badge ton="succes">toutes les {jf.intervalleMin} min</Badge>
                ) : (
                  <Badge ton="neutre">inactive</Badge>
                ),
              },
              {
                label: 'Webhook',
                valeur: jf.webhookOuvert ? <Badge ton="succes">ouvert</Badge> : <Badge ton="neutre">fermé</Badge>,
              },
              { label: 'Dernière lecture', valeur: jf.etat?.derniereLecture ? dateHeure(jf.etat.derniereLecture) : 'jamais' },
              {
                label: 'Repère de lecture',
                valeur: jf.etat?.dernierHorodatage ? <span className="font-mono text-xs">{jf.etat.dernierHorodatage}</span> : '—',
              },
              { label: 'Demandes reçues', valeur: nombre(externes.length, 0) },
            ]}
          />

          {jf.etat?.derniereErreur && (
            <div className="mt-3">
              <Encart ton="danger" titre="Dernière tentative en échec">
                {jf.etat.derniereErreur}
              </Encart>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Bouton onClick={() => void synchroniser()} disabled={!jf.configure || enCours}>
              <RefreshCw className={`size-4 ${enCours ? 'animate-spin' : ''}`} /> Récupérer maintenant
            </Bouton>
            <Bouton
              variante="discret"
              disabled={!jf.configure || enCours}
              onClick={() => {
                const il7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
                void synchroniser(il7);
              }}
            >
              Rattraper les 7 derniers jours
            </Bouton>
          </div>
          {message && (
            <div className="mt-3">
              <Encart ton={message.ton}>{message.texte}</Encart>
            </div>
          )}
        </Carte>

        <Carte titre="Champs reconnus" sousTitre="Noms acceptés dans le formulaire, par ordre de priorité">
          <dl className="space-y-1.5">
            {Object.entries(jf.correspondance).map(([champ, noms]) => (
              <div key={champ} className="grid grid-cols-[120px_1fr] gap-2 text-sm">
                <dt className="font-medium text-slate-700">{champ}</dt>
                <dd className="font-mono text-xs text-slate-500">{noms.join(', ')}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Ces noms se redéfinissent par la variable <span className="font-mono">JOTFORM_CHAMPS</span> si le formulaire
            existant nomme ses questions autrement.
          </p>
        </Carte>
      </div>

      <div className="space-y-4">
        <Carte titre="Étiquettes à coller" sousTitre="Ce que le QR code ouvre">
          {jf.urlFormulaire && exemple ? (
            <>
              <p className="text-sm text-slate-600">
                Chaque étiquette d’inventaire porte un QR code propre à l’équipement. Le service scanne, le formulaire
                s’ouvre avec le numéro déjà rempli, et la demande arrive ici sans passer par la GMAO.
              </p>
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 font-mono text-[11px] break-all text-slate-600">
                {lienFormulaireExterne(jf.urlFormulaire, jf.champCode, exemple.code)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Les étiquettes s’impriment depuis la page Équipements, sélection puis « Étiquettes ».
              </p>
            </>
          ) : (
            <Encart ton="attention">
              Renseignez <span className="font-mono text-xs">JOTFORM_URL_FORMULAIRE</span> pour que les étiquettes
              portent un QR code.
            </Encart>
          )}
        </Carte>

        <Carte sansPadding titre="Dernières demandes reçues">
          {externes.length ? (
            <ul className="divide-y divide-slate-100">
              {externes.slice(0, 12).map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{d.objet}</p>
                    <p className="truncate text-xs text-slate-500">
                      {d.numero} · {index.services.get(d.serviceId)?.nom ?? '—'} · {dateHeure(d.dateCreation)}
                    </p>
                  </div>
                  <Badge ton="neutre" compact>
                    {d.statut.replace(/_/g, ' ')}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              Aucune demande n’est encore arrivée par le formulaire.
            </p>
          )}
        </Carte>
      </div>
    </div>
  );
}

function OngletBase({ base, onRecharger }: { base: BaseGMAO; onRecharger: () => Promise<void> }) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.statistiquesBase>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.statistiquesBase().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Carte titre="Volumétrie" icone={<Database className="size-4 text-slate-400" />} sousTitre={stats ? `Base de ${stats.tailleBase}` : undefined}>
        {stats ? (
          <table className="w-full text-sm">
            <thead className="text-xs tracking-wide text-slate-500 uppercase">
              <tr className="border-b border-slate-200">
                <th className="py-1.5 text-left">Table</th>
                <th className="py-1.5 text-right">Lignes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.tables
                .filter((t) => t.lignes > 0)
                .map((t) => (
                  <tr key={t.table}>
                    <td className="py-1.5 font-mono text-xs text-slate-700">{t.table}</td>
                    <td className="py-1.5 text-right tabulaire">{nombre(t.lignes, 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">Statistiques indisponibles.</p>
        )}
      </Carte>

      <div className="space-y-4">
        <Carte titre="Migrations appliquées">
          {stats?.migrations.length ? (
            <ul className="space-y-1 text-sm">
              {stats.migrations.map((m) => (
                <li key={m.version} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                  <span className="font-mono text-xs text-slate-700">{m.version}</span>
                  <span className="text-xs text-slate-500">{dateHeure(m.applique_le)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Aucune information de migration.</p>
          )}
        </Carte>

        <Carte titre="Exploitation">
          <p className="text-sm text-slate-600">
            La base PostgreSQL est la source de vérité. Le serveur en garde une copie en mémoire pour appliquer les
            mêmes règles de calcul que l’interface ; après une intervention directe en SQL, il faut lui demander de
            relire les tables.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Bouton
              onClick={async () => {
                const r = await api.rechargerServeur();
                await onRecharger();
                setMessage(r.ok ? 'État du serveur rechargé depuis PostgreSQL.' : 'Rechargement refusé.');
              }}
            >
              <RefreshCw className="size-4" /> Recharger depuis la base
            </Bouton>
            <Bouton
              onClick={() =>
                telecharger(`gmao-instantane-${new Date().toISOString().slice(0, 10)}.json`, exporterJSON(base))
              }
            >
              <Download className="size-4" /> Exporter l’instantané
            </Bouton>
          </div>
          {message && (
            <div className="mt-3">
              <Encart ton="succes">{message}</Encart>
            </div>
          )}
        </Carte>

        <Carte titre="Sauvegarde">
          <p className="text-sm text-slate-600">
            L’export JSON ci-dessus est une photographie de consultation, pas une sauvegarde d’exploitation. La
            sauvegarde de référence se fait par <span className="font-mono text-xs">pg_dump</span> depuis le conteneur
            de base de données ; la procédure figure dans le fichier README du dépôt.
          </p>
        </Carte>
      </div>
    </div>
  );
}
