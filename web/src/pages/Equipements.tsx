import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Printer } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Modale } from '@/components/ui/Modale';
import { Champ, Liste, Saisie, Zone } from '@/components/ui/Champs';
import { BarreFiltres } from '@/components/shared/Filtres';
import { BadgeCriticite, BadgeStatutEquipement } from '@/components/shared/Etiquettes';
import { EtiquetteInventaire } from '@/components/shared/CodeBarres';
import { Localisation } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { estOuvert, tauxVetuste, valeurNetteComptable } from '@gmao/partage';
import { montant, normaliser, nombre } from '@gmao/partage';
import { joursRestants } from '@gmao/partage';
import { CRITICITE, DOMAINE, STATUT_EQUIPEMENT } from '@gmao/partage';
import type { Equipement, NiveauCriticite } from '@gmao/partage';
import { uid } from '@gmao/partage';
import { iso, aujourdHui } from '@gmao/partage';

export function PageEquipements() {
  const { base, index, commander, configuration } = useGMAO();
  const [params, setParams] = useSearchParams();
  const naviguer = useNavigate();
  const [recherche, setRecherche] = useState('');
  const [creation, setCreation] = useState(false);
  const [etiquettes, setEtiquettes] = useState<Equipement[] | null>(null);

  const lire = (cle: string) => params.get(cle) ?? '';
  const ecrire = (cle: string) => (v: string) => {
    const suivant = new URLSearchParams(params);
    if (v) suivant.set(cle, v);
    else suivant.delete(cle);
    setParams(suivant, { replace: true });
  };

  const filtres = useMemo(() => {
    const q = normaliser(recherche);
    const statut = params.get('statut') ?? '';
    const criticite = params.get('criticite') ?? '';
    const domaine = params.get('domaine') ?? '';
    const serviceId = params.get('service') ?? '';
    const familleId = params.get('famille') ?? '';
    const etat = params.get('etat') ?? '';

    return base.equipements.filter((e) => {
      if (statut && e.statut !== statut) return false;
      if (criticite && String(e.criticite) !== criticite) return false;
      if (domaine && e.domaine !== domaine) return false;
      if (serviceId && e.serviceId !== serviceId) return false;
      if (familleId && e.familleId !== familleId) return false;
      if (etat === 'garantie' && (!e.finGarantie || (joursRestants(e.finGarantie) ?? -1) < 0)) return false;
      if (etat === 'obsolete' && tauxVetuste(e) < 100) return false;
      if (etat === 'sous_contrat' && !e.contratId) return false;
      if (etat === 'sans_contrat' && e.contratId) return false;
      if (
        q &&
        !normaliser(
          `${e.code} ${e.designation} ${e.marque} ${e.modele} ${e.numeroSerie}`,
        ).includes(q)
      )
        return false;
      return true;
    });
  }, [base.equipements, recherche, params]);

  const otOuvertsParEquipement = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of base.ordresTravail) {
      if (!o.equipementId || !estOuvert(o)) continue;
      m.set(o.equipementId, (m.get(o.equipementId) ?? 0) + 1);
    }
    return m;
  }, [base.ordresTravail]);

  const colonnes: Colonne<Equipement>[] = [
    {
      cle: 'code',
      entete: 'Inventaire',
      largeur: '110px',
      tri: (e) => e.code,
      rendu: (e) => <span className="font-mono text-xs text-slate-600">{e.code}</span>,
    },
    {
      cle: 'designation',
      entete: 'Désignation',
      tri: (e) => e.designation,
      rendu: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{e.designation}</p>
          <p className="truncate text-xs text-slate-500">
            {e.marque} {e.modele} · n° {e.numeroSerie}
          </p>
        </div>
      ),
    },
    {
      cle: 'localisation',
      entete: 'Implantation',
      secondaire: true,
      tri: (e) => index.services.get(e.serviceId)?.nom ?? '',
      export: (e) => index.services.get(e.serviceId)?.nom ?? '',
      rendu: (e) => <Localisation localId={e.localId} />,
    },
    {
      cle: 'criticite',
      entete: 'Criticité',
      largeur: '110px',
      tri: (e) => e.criticite,
      export: (e) => CRITICITE[e.criticite].libelle,
      rendu: (e) => <BadgeCriticite niveau={e.criticite} compact />,
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '140px',
      tri: (e) => e.statut,
      export: (e) => STATUT_EQUIPEMENT[e.statut].libelle,
      rendu: (e) => <BadgeStatutEquipement statut={e.statut} />,
    },
    {
      cle: 'ot',
      entete: 'OT',
      largeur: '60px',
      aDroite: true,
      tri: (e) => otOuvertsParEquipement.get(e.id) ?? 0,
      rendu: (e) => {
        const n = otOuvertsParEquipement.get(e.id) ?? 0;
        return n ? <Badge ton={n > 1 ? 'attention' : 'info'} compact>{n}</Badge> : <span className="text-slate-300">—</span>;
      },
    },
    {
      cle: 'vetuste',
      entete: 'Vétusté',
      largeur: '110px',
      secondaire: true,
      aDroite: true,
      tri: (e) => tauxVetuste(e),
      export: (e) => Math.round(tauxVetuste(e)),
      rendu: (e) => {
        const t = tauxVetuste(e);
        return (
          <span className={t >= 100 ? 'font-medium text-rose-600' : t >= 80 ? 'text-amber-600' : 'text-slate-600'}>
            {nombre(t, 0)} %
          </span>
        );
      },
    },
    {
      cle: 'valeur',
      entete: 'Valeur nette',
      largeur: '120px',
      secondaire: true,
      aDroite: true,
      tri: (e) => valeurNetteComptable(e),
      export: (e) => Math.round(valeurNetteComptable(e)),
      rendu: (e) => <span className="text-slate-600">{montant(valeurNetteComptable(e))}</span>,
    },
  ];

  const valeurParc = filtres.reduce((s, e) => s + valeurNetteComptable(e), 0);

  return (
    <>
      <EnTetePage
        titre="Parc d’équipements"
        description="Inventaire des dispositifs médicaux, installations techniques et matériels support"
        actions={
          <>
            <Bouton onClick={() => setEtiquettes(filtres.slice(0, 24))} disabled={!filtres.length}>
              <Printer className="size-4" /> Étiquettes
            </Bouton>
            <Bouton variante="primaire" onClick={() => setCreation(true)}>
              <Plus className="size-4" /> Nouvel équipement
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResumeChiffre libelle="Équipements affichés" valeur={nombre(filtres.length, 0)} />
          <ResumeChiffre
            libelle="Dont criticité vitale"
            valeur={nombre(filtres.filter((e) => e.criticite === 1).length, 0)}
            accent="danger"
          />
          <ResumeChiffre
            libelle="Indisponibles"
            valeur={nombre(filtres.filter((e) => e.statut === 'en_panne' || e.statut === 'attente_pieces').length, 0)}
            accent="attention"
          />
          <ResumeChiffre libelle="Valeur nette comptable" valeur={montant(valeurParc)} />
        </div>

        <Carte sansPadding>
          <div className="border-b border-slate-200 p-4">
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Code d’inventaire, désignation, marque, n° de série…"
              resultats={`${filtres.length} équipement(s) sur ${base.equipements.length}`}
              filtres={[
                {
                  cle: 'statut',
                  label: 'Statut',
                  valeur: lire('statut'),
                  onChange: ecrire('statut'),
                  options: Object.entries(STATUT_EQUIPEMENT).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'criticite',
                  label: 'Criticité',
                  valeur: lire('criticite'),
                  onChange: ecrire('criticite'),
                  options: Object.entries(CRITICITE).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'domaine',
                  label: 'Domaine',
                  valeur: lire('domaine'),
                  onChange: ecrire('domaine'),
                  options: Object.entries(DOMAINE).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'service',
                  label: 'Service',
                  valeur: lire('service'),
                  onChange: ecrire('service'),
                  options: base.services.map((s) => ({ valeur: s.id, libelle: s.nom })),
                },
                {
                  cle: 'famille',
                  label: 'Famille',
                  valeur: lire('famille'),
                  onChange: ecrire('famille'),
                  options: base.familles.map((f) => ({ valeur: f.id, libelle: f.nom })),
                },
                {
                  cle: 'etat',
                  label: 'Situation',
                  valeur: lire('etat'),
                  onChange: ecrire('etat'),
                  options: [
                    { valeur: 'garantie', libelle: 'Sous garantie' },
                    { valeur: 'obsolete', libelle: 'Amortissement dépassé' },
                    { valeur: 'sous_contrat', libelle: 'Sous contrat' },
                    { valeur: 'sans_contrat', libelle: 'Hors contrat' },
                  ],
                },
              ]}
            />
          </div>

          <Tableau
            lignes={filtres}
            colonnes={colonnes}
            cleLigne={(e) => e.id}
            onClicLigne={(e) => naviguer(`/equipements/${e.id}`)}
            triInitial={{ cle: 'code', sens: 'asc' }}
            parPage={30}
            nomExport="parc-equipements"
            vide="Aucun équipement ne correspond aux critères."
            ligneClassName={(e) => (e.statut === 'en_panne' ? 'bg-rose-50/40' : '')}
          />
        </Carte>
      </CorpsPage>

      <ModaleCreationEquipement
        ouverte={creation}
        onFermer={() => setCreation(false)}
        onCreer={async (brouillon) => {
          const nouvelId = uid('eqp');
          // La fiche est construite par le serveur à partir du brouillon : c'est
          // lui qui déduit le domaine et la durée d'amortissement de la famille,
          // et lui qui refuse un numéro d'inventaire déjà attribué.
          await commander(() => api.creerEquipement({ id: nouvelId, ...brouillon }));
          setCreation(false);
          naviguer(`/equipements/${nouvelId}`);
        }}
      />

      {etiquettes && (
        <Modale
          ouverte
          onFermer={() => setEtiquettes(null)}
          titre="Étiquettes d’inventaire"
          sousTitre={`${etiquettes.length} étiquette(s) — les premières de la sélection courante`}
          largeur="xl"
          pied={
            <>
              <Bouton onClick={() => setEtiquettes(null)}>Fermer</Bouton>
              <Bouton variante="primaire" onClick={() => window.print()}>
                <Printer className="size-4" /> Imprimer
              </Bouton>
            </>
          }
        >
          <div className="flex flex-wrap gap-3">
            {etiquettes.map((e) => (
              <EtiquetteInventaire
                key={e.id}
                code={e.code}
                designation={e.designation}
                service={index.services.get(e.serviceId)?.nom ?? ''}
                criticite={CRITICITE[e.criticite].libelle.toUpperCase()}
                formulaire={configuration.formulaireExterne}
              />
            ))}
          </div>
        </Modale>
      )}
    </>
  );
}

function ResumeChiffre({
  libelle,
  valeur,
  accent = 'neutre',
}: {
  libelle: string;
  valeur: string;
  accent?: 'neutre' | 'danger' | 'attention';
}) {
  const couleurs = { neutre: 'text-slate-900', danger: 'text-rose-700', attention: 'text-amber-700' };
  return (
    <div className="carte px-4 py-3">
      <p className="text-xs text-slate-500">{libelle}</p>
      <p className={`mt-0.5 text-xl font-semibold tabulaire ${couleurs[accent]}`}>{valeur}</p>
    </div>
  );
}

interface BrouillonEquipement {
  code: string;
  designation: string;
  familleId: string;
  marque: string;
  modele: string;
  numeroSerie: string;
  classeDM: Equipement['classeDM'];
  criticite: NiveauCriticite;
  localId: string;
  dateAcquisition: string;
  dateMiseEnService: string;
  valeurAchat: number;
  finGarantie: string;
  fournisseurId: string;
  risqueInfectieux: boolean;
  notes: string;
}

function ModaleCreationEquipement({
  ouverte,
  onFermer,
  onCreer,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onCreer: (b: BrouillonEquipement) => void;
}) {
  const { base } = useGMAO();
  const aujourd = iso(aujourdHui());
  const [f, setF] = useState<BrouillonEquipement>({
    code: '',
    designation: '',
    familleId: base.familles[0].id,
    marque: '',
    modele: '',
    numeroSerie: '',
    classeDM: 'IIa',
    criticite: 3,
    localId: base.locaux[0].id,
    dateAcquisition: aujourd,
    dateMiseEnService: aujourd,
    valeurAchat: 0,
    finGarantie: '',
    fournisseurId: '',
    risqueInfectieux: false,
    notes: '',
  });

  const maj = <K extends keyof BrouillonEquipement>(k: K, v: BrouillonEquipement[K]) => setF((x) => ({ ...x, [k]: v }));
  const valide = f.code.trim() && f.designation.trim();

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Nouvel équipement"
      sousTitre="La fiche pourra être complétée ensuite (compteurs, documents, contrat)"
      largeur="lg"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={!valide} onClick={() => onCreer(f)}>
            Créer la fiche
          </Bouton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Numéro d’inventaire" obligatoire>
          <Saisie value={f.code} onChange={(e) => maj('code', e.target.value)} placeholder="REA-0412" />
        </Champ>
        <Champ label="Désignation" obligatoire>
          <Saisie value={f.designation} onChange={(e) => maj('designation', e.target.value)} placeholder="Respirateur de réanimation" />
        </Champ>
        <Champ label="Famille">
          <Liste
            value={f.familleId}
            onChange={(e) => maj('familleId', e.target.value)}
            options={base.familles.map((x) => ({ valeur: x.id, libelle: `${x.code} — ${x.nom}` }))}
          />
        </Champ>
        <Champ label="Implantation">
          <Liste
            value={f.localId}
            onChange={(e) => maj('localId', e.target.value)}
            options={base.locaux.map((l) => ({
              valeur: l.id,
              libelle: `${base.services.find((s) => s.id === l.serviceId)?.nom} — ${l.nom} (${l.code})`,
            }))}
          />
        </Champ>
        <Champ label="Marque">
          <Saisie value={f.marque} onChange={(e) => maj('marque', e.target.value)} />
        </Champ>
        <Champ label="Modèle">
          <Saisie value={f.modele} onChange={(e) => maj('modele', e.target.value)} />
        </Champ>
        <Champ label="Numéro de série">
          <Saisie value={f.numeroSerie} onChange={(e) => maj('numeroSerie', e.target.value)} />
        </Champ>
        <Champ label="Classe de dispositif médical" aide="Règlement (UE) 2017/745">
          <Liste
            value={f.classeDM}
            onChange={(e) => maj('classeDM', e.target.value as Equipement['classeDM'])}
            options={[
              { valeur: 'I', libelle: 'Classe I' },
              { valeur: 'IIa', libelle: 'Classe IIa' },
              { valeur: 'IIb', libelle: 'Classe IIb' },
              { valeur: 'III', libelle: 'Classe III' },
              { valeur: 'DMDIV', libelle: 'DM de diagnostic in vitro' },
              { valeur: 'hors_DM', libelle: 'Hors dispositif médical' },
            ]}
          />
        </Champ>
        <Champ label="Criticité" aide="Conditionne les priorités d’intervention et les objectifs de disponibilité">
          <Liste
            value={String(f.criticite)}
            onChange={(e) => maj('criticite', Number(e.target.value) as NiveauCriticite)}
            options={Object.entries(CRITICITE).map(([v, x]) => ({ valeur: v, libelle: x.libelle }))}
          />
        </Champ>
        <Champ label="Fournisseur / fabricant">
          <Liste
            value={f.fournisseurId}
            onChange={(e) => maj('fournisseurId', e.target.value)}
            vide="— non renseigné —"
            options={base.fournisseurs.map((x) => ({ valeur: x.id, libelle: x.raisonSociale }))}
          />
        </Champ>
        <Champ label="Date d’acquisition">
          <Saisie type="date" value={f.dateAcquisition} onChange={(e) => maj('dateAcquisition', e.target.value)} />
        </Champ>
        <Champ label="Date de mise en service">
          <Saisie type="date" value={f.dateMiseEnService} onChange={(e) => maj('dateMiseEnService', e.target.value)} />
        </Champ>
        <Champ label="Valeur d’achat (USD)">
          <Saisie
            type="number"
            min={0}
            value={f.valeurAchat || ''}
            onChange={(e) => maj('valeurAchat', Number(e.target.value))}
          />
        </Champ>
        <Champ label="Fin de garantie">
          <Saisie type="date" value={f.finGarantie} onChange={(e) => maj('finGarantie', e.target.value)} />
        </Champ>
        <Champ label="Observations" className="sm:col-span-2">
          <Zone
            value={f.notes}
            onChange={(e) => maj('notes', e.target.value)}
            placeholder="Conditions particulières d’exploitation, origine du financement, restrictions d’usage…"
          />
        </Champ>
      </div>
    </Modale>
  );
}
