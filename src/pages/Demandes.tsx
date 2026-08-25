import { useMemo, useState } from 'react';
import { Inbox, Plus, ShieldQuestion } from 'lucide-react';
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
import { creerDemande, refuserDemande } from '@/data/actions';
import { dateHeure, heuresEcoulees } from '@/lib/dates';
import { nombre, normaliser } from '@/lib/format';
import { PRIORITE, STATUT_DI } from '@/types/labels';
import type { DemandeIntervention, PrioriteOT } from '@/types/domain';

const IMPACT: Record<DemandeIntervention['impactPatient'], { libelle: string; ton: 'neutre' | 'info' | 'attention' | 'danger' }> = {
  aucun: { libelle: 'Aucun impact', ton: 'neutre' },
  gene: { libelle: 'Gêne organisationnelle', ton: 'info' },
  report_soin: { libelle: 'Report de soin', ton: 'attention' },
  risque_vital: { libelle: 'Risque vital', ton: 'danger' },
};

export function PageDemandes() {
  const { base, index, muter, utilisateur } = useGMAO();
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
          <p className="truncate font-medium text-slate-800">{d.objet}</p>
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
              <Bouton
                onClick={() =>
                  muter(`Mise en analyse de ${selection.numero}`, (b) => {
                    const d = b.demandes.find((x) => x.id === selection.id);
                    if (d) d.statut = 'en_analyse';
                  })
                }
              >
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
              <Badge ton="neutre">reçue par {selection.canal.replace(/_/g, ' ')}</Badge>
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
        />
      )}

      {refus && (
        <ModaleRefus
          onFermer={() => setRefus(null)}
          onValider={(motif) => {
            muter(
              `Refus de la demande ${refus.numero}`,
              (b) => refuserDemande(b, refus.id, motif, utilisateur.id),
              { action: 'validation', entiteType: 'demande', entiteId: refus.id },
            );
            setRefus(null);
            setSelection(null);
          }}
        />
      )}

      <ModaleNouvelleDemande
        ouverte={creation}
        onFermer={() => setCreation(false)}
        onCreer={(d) => {
          muter(`Nouvelle demande : ${d.objet}`, (b) => creerDemande(b, d), {
            action: 'creation',
            entiteType: 'demande',
            entiteId: d.equipementId ?? '-',
          });
          setCreation(false);
        }}
      />
    </>
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
  onCreer: (d: Omit<DemandeIntervention, 'id' | 'numero' | 'dateCreation' | 'statut'>) => void;
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
                demandeurId: utilisateur.id,
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
