import { useMemo, useState } from 'react';
import { AlertOctagon, HeartPulse, Megaphone, Plus } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { CaseACocher, Champ, Liste, Saisie, Segments, Zone } from '@/components/ui/Champs';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Modale, Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { LienEquipement, LienOT, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { aujourdHui, dateCourte, iso, joursRestants } from '@gmao/partage';
import { nombre, pourcent } from '@gmao/partage';
import type { RappelFabricant, Vigilance } from '@gmao/partage';
import type { Ton } from '@gmao/partage';

const GRAVITE: Record<Vigilance['gravite'], { libelle: string; ton: Ton }> = {
  mineur: { libelle: 'Mineur', ton: 'neutre' },
  majeur: { libelle: 'Majeur', ton: 'attention' },
  critique: { libelle: 'Critique', ton: 'danger' },
  deces: { libelle: 'Décès', ton: 'danger' },
};

const ACTION_RAPPEL: Record<RappelFabricant['actionRequise'], string> = {
  mise_a_jour: 'Mise à jour logicielle',
  retrait: 'Retrait immédiat du service',
  controle: 'Contrôle à réaliser',
  information: 'Information de sécurité',
  remplacement: 'Remplacement de composant',
};

export function PageVigilance() {
  const { base, index, commander } = useGMAO();
  const [vue, setVue] = useState<'incidents' | 'rappels'>('incidents');
  const [detail, setDetail] = useState<Vigilance | null>(null);
  const [rappel, setRappel] = useState<RappelFabricant | null>(null);
  const [declaration, setDeclaration] = useState(false);

  const ouvertes = base.vigilances.filter((v) => v.statut !== 'clos');
  const rappelsOuverts = base.rappels.filter((r) => r.statut !== 'solde');
  const equipementsARetirer = useMemo(
    () =>
      base.rappels
        .filter((r) => r.actionRequise === 'retrait' && r.statut !== 'solde')
        .flatMap((r) => r.equipementIds.filter((id) => !r.equipementsTraites.includes(id))),
    [base.rappels],
  );

  const colonnes: Colonne<Vigilance>[] = [
    { cle: 'numero', entete: 'N°', largeur: '130px', tri: (v) => v.numero, rendu: (v) => <span className="font-mono text-xs">{v.numero}</span> },
    { cle: 'date', entete: 'Événement', largeur: '110px', tri: (v) => v.dateEvenement, rendu: (v) => dateCourte(v.dateEvenement) },
    {
      cle: 'description',
      entete: 'Description',
      tri: (v) => v.description,
      rendu: (v) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{v.description}</p>
          <p className="truncate text-xs text-slate-500">
            <LienEquipement id={v.equipementId} />
          </p>
        </div>
      ),
    },
    {
      cle: 'gravite',
      entete: 'Gravité',
      largeur: '100px',
      tri: (v) => v.gravite,
      export: (v) => GRAVITE[v.gravite].libelle,
      rendu: (v) => <Badge ton={GRAVITE[v.gravite].ton}>{GRAVITE[v.gravite].libelle}</Badge>,
    },
    {
      cle: 'patient',
      entete: 'Patient impliqué',
      largeur: '130px',
      tri: (v) => Number(v.patientImplique),
      rendu: (v) => (v.patientImplique ? <Badge ton="danger" compact>oui</Badge> : <span className="text-slate-400">non</span>),
    },
    {
      cle: 'declaration',
      entete: 'Déclaré',
      largeur: '130px',
      secondaire: true,
      tri: (v) => Number(v.declareAutorite),
      rendu: (v) =>
        v.declareAutorite ? (
          <span className="text-xs text-slate-600">{v.numeroDeclaration ?? 'oui'}</span>
        ) : (
          <span className="text-xs text-slate-400">non requis</span>
        ),
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '120px',
      tri: (v) => v.statut,
      rendu: (v) => (
        <Badge ton={v.statut === 'clos' ? 'succes' : v.statut === 'en_analyse' ? 'info' : 'attention'} pastille>
          {v.statut.replace(/_/g, ' ')}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Matériovigilance"
        description="Signalement des incidents liés aux dispositifs médicaux et suivi des actions correctives de sécurité"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'incidents', libelle: 'Incidents', compteur: ouvertes.length },
                { valeur: 'rappels', libelle: 'Rappels fabricants', compteur: rappelsOuverts.length },
              ]}
            />
            <Bouton variante="primaire" onClick={() => setDeclaration(true)}>
              <Plus className="size-4" /> Déclarer un incident
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur
            libelle="Incidents ouverts"
            valeur={nombre(ouvertes.length, 0)}
            accent={ouvertes.length ? 'attention' : 'positif'}
            icone={<HeartPulse className="size-4" />}
          />
          <Indicateur
            libelle="Avec patient impliqué"
            valeur={nombre(base.vigilances.filter((v) => v.patientImplique).length, 0)}
            accent="negatif"
            detail="sur l’ensemble de l’historique"
          />
          <Indicateur
            libelle="Rappels en cours"
            valeur={nombre(rappelsOuverts.length, 0)}
            accent={rappelsOuverts.length ? 'attention' : 'positif'}
            icone={<Megaphone className="size-4" />}
          />
          <Indicateur
            libelle="Équipements à retirer"
            valeur={nombre(equipementsARetirer.length, 0)}
            accent={equipementsARetirer.length ? 'negatif' : 'positif'}
            detail="rappel avec retrait exigé"
          />
        </div>

        {equipementsARetirer.length > 0 && (
          <Encart ton="danger" titre="Retrait du service exigé par un fabricant" icone={<AlertOctagon className="size-4" />}>
            {equipementsARetirer.length} équipement(s) font l’objet d’un rappel exigeant leur retrait immédiat et ne sont
            pas encore traités. Tant que l’action n’est pas soldée, l’établissement engage sa responsabilité.
          </Encart>
        )}

        {vue === 'incidents' ? (
          <Carte sansPadding titre="Registre de matériovigilance" sousTitre="Chaque incident est conservé, y compris après clôture">
            <Tableau
              lignes={base.vigilances}
              colonnes={colonnes}
              cleLigne={(v) => v.id}
              onClicLigne={setDetail}
              triInitial={{ cle: 'date', sens: 'desc' }}
              parPage={25}
              nomExport="registre-materiovigilance"
              vide="Aucun incident déclaré."
              ligneClassName={(v) => (v.statut !== 'clos' && v.gravite === 'critique' ? 'bg-rose-50/40' : '')}
            />
          </Carte>
        ) : (
          <div className="grid gap-4">
            {base.rappels.map((r) => {
              const restants = r.equipementIds.filter((id) => !r.equipementsTraites.includes(id));
              const avancement = r.equipementIds.length
                ? (r.equipementsTraites.length / r.equipementIds.length) * 100
                : 100;
              const j = joursRestants(r.dateEcheance);
              return (
                <Carte
                  key={r.id}
                  titre={`${r.reference} — ${r.objet}`}
                  sousTitre={`Émis par ${index.fournisseurs.get(r.fabricantId)?.raisonSociale} · reçu le ${dateCourte(r.dateReception)}`}
                  actions={
                    <>
                      <Badge ton={r.actionRequise === 'retrait' ? 'danger' : r.actionRequise === 'information' ? 'info' : 'attention'}>
                        {ACTION_RAPPEL[r.actionRequise]}
                      </Badge>
                      <Bouton taille="sm" onClick={() => setRappel(r)}>
                        Traiter
                      </Bouton>
                    </>
                  }
                >
                  <p className="text-sm text-slate-700">{r.description}</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <Jauge
                        valeur={avancement}
                        cible={100}
                        libelle={`Avancement — ${r.equipementsTraites.length} / ${r.equipementIds.length} équipements traités`}
                      />
                    </div>
                    <div className={`rounded-lg px-3 py-2 ${(j ?? 0) < 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                      <p className="text-xs text-slate-500">Échéance</p>
                      <p className={`text-sm font-medium ${(j ?? 0) < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                        {dateCourte(r.dateEcheance)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(j ?? 0) < 0 ? `dépassée de ${-(j ?? 0)} j` : `dans ${j} j`} · {restants.length} restant(s)
                      </p>
                    </div>
                  </div>
                </Carte>
              );
            })}
            {base.rappels.length === 0 && (
              <Carte>
                <p className="py-8 text-center text-sm text-slate-500">Aucun rappel fabricant en cours.</p>
              </Carte>
            )}
          </div>
        )}
      </CorpsPage>

      <Panneau
        ouvert={Boolean(detail)}
        onFermer={() => setDetail(null)}
        titre={detail ? `${detail.numero}` : ''}
        sousTitre={detail ? dateCourte(detail.dateEvenement) : undefined}
        pied={
          detail && detail.statut !== 'clos' ? (
            <Bouton variante="primaire" onClick={() => void commander(() => api.cloturerVigilance(detail.id, {}))}>
              Clôturer le dossier
            </Bouton>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge ton={GRAVITE[detail.gravite].ton}>{GRAVITE[detail.gravite].libelle}</Badge>
              {detail.patientImplique && <Badge ton="danger">Patient impliqué</Badge>}
              {detail.declareAutorite && <Badge ton="info">Déclaré à l’autorité</Badge>}
              {detail.fabricantInforme && <Badge ton="neutre">Fabricant informé</Badge>}
            </div>

            <Definitions
              colonnes={1}
              items={[
                { label: 'Équipement', valeur: <LienEquipement id={detail.equipementId} /> },
                { label: 'Description de l’événement', valeur: detail.description },
                ...(detail.consequencePatient ? [{ label: 'Conséquence pour le patient', valeur: detail.consequencePatient }] : []),
                { label: 'Mesures immédiates', valeur: detail.mesuresImmediates },
                { label: 'Déclarant', valeur: <NomUtilisateur id={detail.declarantId} /> },
                { label: 'Date de déclaration', valeur: dateCourte(detail.dateDeclaration) },
                ...(detail.numeroDeclaration ? [{ label: 'N° de déclaration', valeur: detail.numeroDeclaration }] : []),
                ...(detail.analyseCause ? [{ label: 'Analyse des causes', valeur: detail.analyseCause }] : []),
                ...(detail.otId ? [{ label: 'Ordre de travail', valeur: <LienOT id={detail.otId} /> }] : []),
              ]}
            />

            {detail.actionsCorrectives.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Actions correctives</h3>
                <ul className="space-y-1 text-sm">
                  {detail.actionsCorrectives.map((a) => (
                    <li key={a} className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-900">
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Panneau>

      {rappel && (
        <Modale
          ouverte
          onFermer={() => setRappel(null)}
          titre={`Traitement du rappel ${rappel.reference}`}
          sousTitre="Cocher chaque équipement dont l’action a été réalisée"
          largeur="lg"
          pied={<Bouton onClick={() => setRappel(null)}>Fermer</Bouton>}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {rappel.equipementsTraites.length} sur {rappel.equipementIds.length} équipements traités (
              {pourcent((rappel.equipementsTraites.length / Math.max(1, rappel.equipementIds.length)) * 100, 0)}).
            </p>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {rappel.equipementIds.map((id) => {
                const eq = index.equipements.get(id);
                const traite = rappel.equipementsTraites.includes(id);
                return (
                  <li key={id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={traite}
                      disabled={traite}
                      onChange={async () => {
                        await commander(() => api.traiterRappel(rappel.id, id));
                        setRappel((r) =>
                          r ? { ...r, equipementsTraites: [...r.equipementsTraites, id] } : r,
                        );
                      }}
                      className="size-4 rounded border-slate-300 text-marque-700 focus:ring-marque-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">
                        {eq?.code} — {eq?.designation}
                      </p>
                      <p className="truncate text-xs text-slate-500">{index.services.get(eq?.serviceId ?? '')?.nom}</p>
                    </div>
                    {traite && <Badge ton="succes" compact>traité</Badge>}
                  </li>
                );
              })}
            </ul>
          </div>
        </Modale>
      )}

      <ModaleDeclaration ouverte={declaration} onFermer={() => setDeclaration(false)} />
    </>
  );
}

function ModaleDeclaration({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { base, commander } = useGMAO();
  const [equipementId, setEquipementId] = useState('');
  const [description, setDescription] = useState('');
  const [gravite, setGravite] = useState<Vigilance['gravite']>('majeur');
  const [patient, setPatient] = useState(false);
  const [consequence, setConsequence] = useState('');
  const [mesures, setMesures] = useState('');
  const [declarer, setDeclarer] = useState(true);

  const candidats = base.equipements.filter((e) => e.soumisVigilance && e.statut !== 'reforme');

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Déclarer un incident de matériovigilance"
      sousTitre="Tout dysfonctionnement susceptible d’entraîner un effet indésirable grave doit être signalé"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={!equipementId || !description.trim() || !mesures.trim()}
            onClick={async () => {
              await commander(() =>
                api.declarerVigilance({
                  equipementId,
                  dateEvenement: iso(aujourdHui()),
                  description,
                  gravite,
                  patientImplique: patient,
                  consequencePatient: consequence || undefined,
                  mesuresImmediates: mesures,
                  declareAutorite: declarer,
                  fabricantInforme: false,
                }),
              );
              onFermer();
            }}
          >
            Enregistrer la déclaration
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Encart ton="attention">
          L’équipement concerné doit être retiré du service et conservé en l’état, sans nettoyage ni réparation, tant que
          l’analyse n’est pas terminée.
        </Encart>

        <Champ label="Équipement concerné" obligatoire>
          <Liste
            value={equipementId}
            onChange={(e) => setEquipementId(e.target.value)}
            vide="— sélectionner —"
            options={candidats.slice(0, 400).map((e) => ({ valeur: e.id, libelle: `${e.code} — ${e.designation}` }))}
          />
        </Champ>

        <Champ label="Description de l’événement" obligatoire>
          <Zone rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce qui s’est produit, dans quelles circonstances…" />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Gravité">
            <Liste
              value={gravite}
              onChange={(e) => setGravite(e.target.value as Vigilance['gravite'])}
              options={Object.entries(GRAVITE).map(([v, g]) => ({ valeur: v, libelle: g.libelle }))}
            />
          </Champ>
          <Champ label="Date de l’événement">
            <Saisie type="date" value={iso(aujourdHui())} readOnly />
          </Champ>
        </div>

        <CaseACocher
          label="Un patient a été impliqué"
          checked={patient}
          onChange={(e) => setPatient(e.target.checked)}
        />
        {patient && (
          <Champ label="Conséquence pour le patient">
            <Saisie value={consequence} onChange={(e) => setConsequence(e.target.value)} />
          </Champ>
        )}

        <Champ label="Mesures immédiates prises" obligatoire>
          <Zone rows={3} value={mesures} onChange={(e) => setMesures(e.target.value)} placeholder="Retrait du dispositif, mise en place d’un équipement de secours, information du cadre…" />
        </Champ>

        <CaseACocher
          label="Déclarer à l’autorité compétente"
          description="Obligatoire pour tout incident grave impliquant un dispositif médical"
          checked={declarer}
          onChange={(e) => setDeclarer(e.target.checked)}
        />
      </div>
    </Modale>
  );
}
