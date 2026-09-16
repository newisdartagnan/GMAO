import { useEffect, useMemo, useState } from 'react';
import { Inbox, Link2, Plus, QrCode, ShieldQuestion } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Champ, Liste, Saisie, Segments, Zone } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Modale, Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BarreFiltres } from '@/components/shared/Filtres';
import { BadgePriorite, BadgeStatutDI } from '@/components/shared/Etiquettes';
import { LienEquipement, LienOT, Localisation, NomUtilisateur } from '@/components/shared/Liens';
import { ModaleCreationOT } from './EquipementDetail';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import type { CandidatSuggere } from '@/data/api';
import { dateHeure, heuresEcoulees } from '@gmao/partage';
import { nombre, normaliser } from '@gmao/partage';
import { DOMAINE, PRIORITE, STATUT_DI } from '@gmao/partage';
import type { DemandeIntervention, PrioriteOT } from '@gmao/partage';

const IMPACT: Record<DemandeIntervention['impactPatient'], { libelle: string; ton: 'neutre' | 'info' | 'attention' | 'danger' }> = {
  aucun: { libelle: 'Aucun impact', ton: 'neutre' },
  gene: { libelle: 'Gêne organisationnelle', ton: 'info' },
  report_soin: { libelle: 'Report de soin', ton: 'attention' },
  risque_vital: { libelle: 'Risque vital', ton: 'danger' },
};

export function PageDemandes() {
  const { base, index, commander } = useGMAO();
  const [recherche, setRecherche] = useState('');
  const [perimetre, setPerimetre] = useState<'a_traiter' | 'toutes'>('a_traiter');
  const [statut, setStatut] = useState('');
  const [service, setService] = useState('');
  const [selection, setSelection] = useState<DemandeIntervention | null>(null);
  const [creation, setCreation] = useState(false);
  const [transformation, setTransformation] = useState<DemandeIntervention | null>(null);
  const [refus, setRefus] = useState<DemandeIntervention | null>(null);

  const aTraiter = base.demandes.filter((d) => d.statut === 'nouvelle' || d.statut === 'en_analyse');

  const filtrees = useMemo(() => {
    const q = normaliser(recherche);
    return base.demandes.filter((d) => {
      if (perimetre === 'a_traiter' && d.statut !== 'nouvelle' && d.statut !== 'en_analyse') return false;
      if (statut && d.statut !== statut) return false;
      if (service && d.serviceId !== service) return false;
      if (q && !normaliser(`${d.numero} ${d.objet} ${d.description}`).includes(q)) return false;
      return true;
    });
  }, [base.demandes, recherche, perimetre, statut, service]);

  const colonnes: Colonne<DemandeIntervention>[] = [
    { cle: 'numero', entete: 'N°', largeur: '125px', tri: (d) => d.numero, rendu: (d) => <span className="font-mono text-xs">{d.numero}</span> },
    {
      cle: 'objet',
      entete: 'Objet',
      tri: (d) => d.objet,
      rendu: (d) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-medium text-slate-800">
            {d.origineExterne && (
              <QrCode
                className="size-3.5 shrink-0 text-marque-600"
                aria-label="Reçue par le formulaire de signalement"
              />
            )}
            <span className="truncate">{d.objet}</span>
          </p>
          <p className="truncate text-xs text-slate-500">
            <LienEquipement id={d.equipementId} /> · {index.services.get(d.serviceId)?.nom}
          </p>
        </div>
      ),
    },
    {
      cle: 'demandeur',
      entete: 'Demandeur',
      largeur: '170px',
      secondaire: true,
      tri: (d) => index.utilisateurs.get(d.demandeurId)?.nom ?? '',
      rendu: (d) => <NomUtilisateur id={d.demandeurId} />,
    },
    {
      cle: 'impact',
      entete: 'Impact patient',
      largeur: '150px',
      tri: (d) => d.impactPatient,
      export: (d) => IMPACT[d.impactPatient].libelle,
      rendu: (d) => <Badge ton={IMPACT[d.impactPatient].ton}>{IMPACT[d.impactPatient].libelle}</Badge>,
    },
    { cle: 'urgence', entete: 'Urgence', largeur: '90px', tri: (d) => d.urgenceDeclaree, rendu: (d) => <BadgePriorite priorite={d.urgenceDeclaree} compact /> },
    {
      cle: 'attente',
      entete: 'En attente',
      largeur: '100px',
      aDroite: true,
      tri: (d) => -(heuresEcoulees(d.dateCreation) ?? 0),
      export: (d) => heuresEcoulees(d.dateCreation) ?? 0,
      rendu: (d) => {
        if (d.statut !== 'nouvelle' && d.statut !== 'en_analyse') return <span className="text-slate-400">—</span>;
        const h = heuresEcoulees(d.dateCreation) ?? 0;
        return <span className={h > 24 ? 'font-medium text-rose-600' : 'text-slate-600'}>{nombre(h, 0)} h</span>;
      },
    },
    { cle: 'statut', entete: 'Statut', largeur: '160px', tri: (d) => d.statut, export: (d) => STATUT_DI[d.statut].libelle, rendu: (d) => <BadgeStatutDI statut={d.statut} /> },
  ];

  return (
    <>
      <EnTetePage
        titre="Demandes d’intervention"
        description="Signalements des services de soins, à qualifier avant transformation en ordre de travail"
        actions={
          <Bouton variante="primaire" onClick={() => setCreation(true)}>
            <Plus className="size-4" /> Nouvelle demande
          </Bouton>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="À qualifier" valeur={nombre(aTraiter.length, 0)} accent={aTraiter.length ? 'attention' : 'positif'} icone={<Inbox className="size-4" />} />
          <Indicateur
            libelle="Impact patient déclaré"
            valeur={nombre(aTraiter.filter((d) => d.impactPatient === 'risque_vital' || d.impactPatient === 'report_soin').length, 0)}
            accent="negatif"
            detail="report de soin ou risque vital"
          />
          <Indicateur
            libelle="Attente moyenne"
            valeur={`${nombre(aTraiter.length ? aTraiter.reduce((s, d) => s + (heuresEcoulees(d.dateCreation) ?? 0), 0) / aTraiter.length : 0, 0)} h`}
            detail="avant qualification"
          />
          <Indicateur
            libelle="Transformées en OT"
            valeur={nombre(base.demandes.filter((d) => d.statut === 'transformee').length, 0)}
            detail={`sur ${base.demandes.length} demandes`}
          />
        </div>

        <Carte sansPadding>
          <div className="space-y-3 border-b border-slate-200 p-4">
            <Segments
              valeur={perimetre}
              onChange={setPerimetre}
              options={[
                { valeur: 'a_traiter', libelle: 'À traiter', compteur: aTraiter.length },
                { valeur: 'toutes', libelle: 'Toutes', compteur: base.demandes.length },
              ]}
            />
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Numéro, objet, description…"
              resultats={`${filtrees.length} demande(s)`}
              filtres={[
                {
                  cle: 'statut',
                  label: 'Statut',
                  valeur: statut,
                  onChange: setStatut,
                  options: Object.entries(STATUT_DI).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'service',
                  label: 'Service',
                  valeur: service,
                  onChange: setService,
                  options: base.services.map((s) => ({ valeur: s.id, libelle: s.nom })),
                },
              ]}
            />
          </div>

          <Tableau
            lignes={filtrees}
            colonnes={colonnes}
            cleLigne={(d) => d.id}
            onClicLigne={setSelection}
            triInitial={{ cle: 'attente', sens: 'asc' }}
            parPage={25}
            nomExport="demandes-intervention"
            vide="Aucune demande à afficher."
            ligneClassName={(d) => (d.impactPatient === 'risque_vital' && d.statut === 'nouvelle' ? 'bg-rose-50/40' : '')}
          />
        </Carte>
      </CorpsPage>

      <Panneau
        ouvert={Boolean(selection)}
        onFermer={() => setSelection(null)}
        titre={selection ? `${selection.numero} — ${selection.objet}` : ''}
        sousTitre={selection ? dateHeure(selection.dateCreation) : undefined}
        pied={
          selection && (selection.statut === 'nouvelle' || selection.statut === 'en_analyse') ? (
            <>
              <Bouton variante="danger" onClick={() => setRefus(selection)}>
                Refuser
              </Bouton>
              <Bouton onClick={() => void commander(() => api.analyserDemande(selection.id))}>
                Mettre en analyse
              </Bouton>
              <Bouton variante="primaire" onClick={() => setTransformation(selection)}>
                Transformer en OT
              </Bouton>
            </>
          ) : undefined
        }
      >
        {selection && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <BadgeStatutDI statut={selection.statut} />
              <BadgePriorite priorite={selection.urgenceDeclaree} />
              <Badge ton={IMPACT[selection.impactPatient].ton}>{IMPACT[selection.impactPatient].libelle}</Badge>
              {selection.origineExterne ? (
                <Badge ton="info">
                  <QrCode className="size-3" /> formulaire de signalement
                </Badge>
              ) : (
                <Badge ton="neutre">reçue par {selection.canal.replace(/_/g, ' ')}</Badge>
              )}
              {selection.domaineSuggere && (
                <Badge ton={DOMAINE[selection.domaineSuggere].ton}>
                  {DOMAINE[selection.domaineSuggere].libelle}
                </Badge>
              )}
            </div>

            {selection.impactPatient === 'risque_vital' && (
              <Encart ton="danger" titre="Risque vital déclaré par le service" icone={<ShieldQuestion className="size-4" />}>
                Le service signale un risque pour la prise en charge d’un patient. La qualification doit être immédiate
                et l’intervention créée en priorité P1.
              </Encart>
            )}

            <Definitions
              colonnes={1}
              items={[
                { label: 'Demandeur', valeur: <NomUtilisateur id={selection.demandeurId} avecRole /> },
                { label: 'Service', valeur: index.services.get(selection.serviceId)?.nom },
                { label: 'Localisation', valeur: <Localisation localId={selection.localId} /> },
                { label: 'Équipement', valeur: <LienEquipement id={selection.equipementId} /> },
                { label: 'Description', valeur: <p className="whitespace-pre-line">{selection.description}</p> },
                ...(selection.otId ? [{ label: 'Ordre de travail', valeur: <LienOT id={selection.otId} /> }] : []),
                ...(selection.motifRefus ? [{ label: 'Motif du refus', valeur: selection.motifRefus }] : []),
                ...(selection.traiteParId
                  ? [{ label: 'Traitée par', valeur: <NomUtilisateur id={selection.traiteParId} /> }]
                  : []),
              ]}
            />

            {selection.origineExterne && !selection.equipementId && (
              <RapprochementEquipement
                demande={selection}
                onRattache={(maj) => setSelection(maj)}
              />
            )}

            {selection.origineExterne && <ReponsesFormulaire origine={selection.origineExterne} />}
          </div>
        )}
      </Panneau>

      {transformation && (
        <ModaleCreationOT
          ouverte
          onFermer={() => {
            setTransformation(null);
            setSelection(null);
          }}
          equipementId={transformation.equipementId}
          demandeId={transformation.id}
          objetInitial={transformation.objet}
          descriptionInitiale={transformation.description}
          prioriteInitiale={transformation.urgenceDeclaree}
          domaineSuggere={transformation.domaineSuggere}
        />
      )}

      {refus && (
        <ModaleRefus
          onFermer={() => setRefus(null)}
          onValider={async (motif) => {
            await commander(() => api.refuserDemande(refus.id, motif));
            setRefus(null);
            setSelection(null);
          }}
        />
      )}

      <ModaleNouvelleDemande
        ouverte={creation}
        onFermer={() => setCreation(false)}
        onCreer={async (d) => {
          await commander(() => api.creerDemande(d));
          setCreation(false);
        }}
      />
    </>
  );
}

/**
 * Rapprochement du signalement avec l'inventaire.
 *
 * Le formulaire demande l'équipement en toutes lettres. « Climatiseur » ne
 * désigne aucune machine en particulier, et exiger un numéro d'inventaire de
 * quelqu'un qui constate une panne à 3 h du matin ne marcherait pas — il
 * appellerait, ou ne signalerait rien.
 *
 * La GMAO propose donc, et le responsable tranche. Chaque proposition dit
 * pourquoi elle est là : un rapprochement qu'on ne peut pas vérifier d'un
 * coup d'œil ne se corrige jamais.
 */
function RapprochementEquipement({
  demande,
  onRattache,
}: {
  demande: DemandeIntervention;
  onRattache: (maj: DemandeIntervention) => void;
}) {
  const { commander, index } = useGMAO();
  const [candidats, setCandidats] = useState<CandidatSuggere[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    setCandidats(null);
    api
      .equipementsSuggeres(demande.id)
      .then((r) => setCandidats(r.candidats))
      .catch(() => setCandidats([]));
  }, [demande.id]);

  const rattacher = async (equipementId: string) => {
    setEnCours(equipementId);
    try {
      onRattache(await commander(() => api.rattacherEquipement(demande.id, equipementId)));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="rounded-lg border border-marque-200 bg-marque-50/40">
      <div className="flex items-start gap-2 px-3 py-2">
        <Link2 className="mt-0.5 size-4 shrink-0 text-marque-600" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800">Aucun équipement rattaché</p>
          <p className="text-xs text-slate-600">
            {demande.designationLibre
              ? <>Le demandeur a écrit « {demande.designationLibre} ».</>
              : <>Le formulaire n’indique pas de quelle machine il s’agit.</>}{' '}
            Sans rattachement, l’intervention n’entrera pas dans l’historique de l’équipement.
          </p>
        </div>
      </div>

      {candidats === null && (
        <p className="px-3 pb-2.5 text-xs text-slate-500">Recherche dans l’inventaire…</p>
      )}

      {candidats?.length === 0 && (
        <p className="px-3 pb-2.5 text-xs text-slate-500">
          Rien d’approchant dans l’inventaire. Rattachez la machine depuis sa fiche, ou laissez la demande
          telle quelle si elle ne concerne pas un équipement inventorié — une fuite dans un couloir, par exemple.
        </p>
      )}

      {candidats && candidats.length > 0 && (
        <p className="px-3 pb-1.5 text-[11px] text-slate-500">
          {candidats.some((c) => c.raisons.some((r) => r.startsWith('désignation')))
            ? 'Ce qui porte les mots du demandeur :'
            : 'Rien ne correspond aux mots employés. Voici ce qui se trouve à l’endroit indiqué :'}
        </p>
      )}

      {candidats && candidats.length > 0 && (
        <ul className="divide-y divide-marque-100 border-t border-marque-100">
          {candidats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-800">
                  <span className="font-mono">{c.code}</span> — {c.designation}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {index.locaux.get(c.localId)?.nom ?? '—'} · {c.raisons.join(' · ')}
                </p>
              </div>
              <Bouton
                taille="sm"
                variante="discret"
                disabled={enCours !== null}
                onClick={() => void rattacher(c.id)}
              >
                {enCours === c.id ? 'Rattachement…' : 'Rattacher'}
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Réponses telles que le service les a saisies.
 *
 * La demande affichée plus haut est une interprétation : l'urgence a été
 * traduite en priorité, le code d'inventaire résolu en équipement. Quand cette
 * lecture est contestée — « ce n'est pas ce que j'ai coché » — c'est ce bloc
 * qui tranche, parce qu'il ne montre rien d'autre que l'original.
 */
function ReponsesFormulaire({ origine }: { origine: NonNullable<DemandeIntervention['origineExterne']> }) {
  const [ouvert, setOuvert] = useState(false);
  const entrees = Object.entries(origine.reponses ?? {});

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <QrCode className="size-3.5 text-marque-600" />
          Formulaire d’origine — {entrees.length} réponse{entrees.length > 1 ? 's' : ''}
        </span>
        <span className="text-xs text-slate-500">{ouvert ? 'masquer' : 'afficher'}</span>
      </button>
      {ouvert && (
        <dl className="space-y-1.5 border-t border-slate-200 px-3 py-2.5">
          {entrees.map(([champ, valeur]) => (
            <div key={champ} className="grid grid-cols-[140px_1fr] gap-2 text-xs">
              <dt className="truncate text-slate-500">{champ}</dt>
              <dd className="whitespace-pre-line text-slate-800">{valeur}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[140px_1fr] gap-2 border-t border-slate-200 pt-1.5 text-xs text-slate-400">
            <dt>Soumission</dt>
            <dd className="font-mono">{origine.soumissionId}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function ModaleRefus({ onFermer, onValider }: { onFermer: () => void; onValider: (motif: string) => void }) {
  const [motif, setMotif] = useState('');
  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Refuser la demande"
      sousTitre="Le motif est communiqué au service demandeur"
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="danger" disabled={!motif.trim()} onClick={() => onValider(motif)}>
            Confirmer le refus
          </Bouton>
        </>
      }
    >
      <Champ label="Motif du refus" obligatoire>
        <Zone
          rows={4}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Doublon avec la demande DI-… / relève de l’utilisation et non d’un défaut technique / équipement déjà en cours de réforme…"
        />
      </Champ>
    </Modale>
  );
}

function ModaleNouvelleDemande({
  ouverte,
  onFermer,
  onCreer,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onCreer: (d: {
    equipementId?: string;
    localId?: string;
    serviceId?: string;
    objet: string;
    description: string;
    urgenceDeclaree: PrioriteOT;
    impactPatient: DemandeIntervention['impactPatient'];
    canal: DemandeIntervention['canal'];
  }) => void;
}) {
  const { base, utilisateur } = useGMAO();
  const [equipementId, setEquipementId] = useState('');
  const [objet, setObjet] = useState('');
  const [description, setDescription] = useState('');
  const [urgence, setUrgence] = useState<PrioriteOT>('P3');
  const [impact, setImpact] = useState<DemandeIntervention['impactPatient']>('gene');

  const equipement = base.equipements.find((e) => e.id === equipementId);

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Signaler une anomalie"
      sousTitre="Formulaire tel qu’il est présenté aux services de soins"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={!objet.trim()}
            onClick={() =>
              onCreer({
                serviceId: equipement?.serviceId ?? utilisateur.serviceId ?? base.services[0].id,
                localId: equipement?.localId,
                equipementId: equipementId || undefined,
                objet,
                description,
                urgenceDeclaree: urgence,
                impactPatient: impact,
                canal: 'web',
              })
            }
          >
            Envoyer la demande
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Équipement concerné" aide="Laisser vide s’il s’agit d’un problème de local (éclairage, climatisation, fuite…)">
          <Liste
            value={equipementId}
            onChange={(e) => setEquipementId(e.target.value)}
            vide="— aucun équipement identifié —"
            options={base.equipements
              .filter((e) => e.statut !== 'reforme')
              .slice(0, 400)
              .map((e) => ({ valeur: e.id, libelle: `${e.code} — ${e.designation}` }))}
          />
        </Champ>
        <Champ label="Objet" obligatoire>
          <Saisie value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Le moniteur du box 2 s’éteint tout seul" />
        </Champ>
        <Champ label="Ce qui a été constaté" aide="Décrire les circonstances : depuis quand, dans quelles conditions, ce qui a déjà été tenté">
          <Zone rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Urgence ressentie">
            <Liste
              value={urgence}
              onChange={(e) => setUrgence(e.target.value as PrioriteOT)}
              options={Object.entries(PRIORITE).map(([v, e]) => ({ valeur: v, libelle: e.libelle }))}
            />
          </Champ>
          <Champ label="Conséquence sur la prise en charge">
            <Liste
              value={impact}
              onChange={(e) => setImpact(e.target.value as DemandeIntervention['impactPatient'])}
              options={Object.entries(IMPACT).map(([v, e]) => ({ valeur: v, libelle: e.libelle }))}
            />
          </Champ>
        </div>
      </div>
    </Modale>
  );
}
