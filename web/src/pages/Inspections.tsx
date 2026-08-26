import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  Moon,
  Stamp,
  Sun,
  TriangleAlert,
} from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Badge } from '@/components/ui/Badge';
import { Bouton } from '@/components/ui/Bouton';
import { CaseACocher, Champ, Liste, Saisie, Segments, Zone } from '@/components/ui/Champs';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Modale } from '@/components/ui/Modale';
import { Definitions, Encart, Vide } from '@/components/ui/Info';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { BadgeCriticite } from '@/components/shared/Etiquettes';
import { LienEquipement, Localisation, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import {
  HORAIRES_SHIFT,
  avancementRonde,
  aujourdHui,
  dateCourte,
  dateHeure,
  decrireAttendu,
  indicateursRondes,
  iso,
  modelePourEquipement,
  nombre,
  pluriel,
  pourcent,
  statutEffectif,
} from '@gmao/partage';
import type {
  EtatReleve,
  ModeleInspection,
  PointControle,
  ReleveInspection,
  RondeInspection,
  Shift,
  ValeurReleve,
} from '@gmao/partage';
import type { Ton } from '@gmao/partage';

const ETAT: Record<EtatReleve, { libelle: string; ton: Ton }> = {
  conforme: { libelle: 'Conforme', ton: 'succes' },
  anomalie_mineure: { libelle: 'Anomalie mineure', ton: 'attention' },
  anomalie_majeure: { libelle: 'Anomalie majeure', ton: 'danger' },
  hors_service: { libelle: 'Hors service', ton: 'danger' },
  non_accessible: { libelle: 'Non accessible', ton: 'ardoise' },
};

const STATUT_RONDE: Record<RondeInspection['statut'], { libelle: string; ton: Ton }> = {
  planifiee: { libelle: 'À faire', ton: 'neutre' },
  en_cours: { libelle: 'En cours', ton: 'violet' },
  terminee: { libelle: 'Terminée', ton: 'succes' },
  incomplete: { libelle: 'Incomplète', ton: 'attention' },
  manquee: { libelle: 'Manquée', ton: 'danger' },
};

export function PageInspections() {
  const { base, index, commander, utilisateur, horsLigne } = useGMAO();
  const [vue, setVue] = useState<'jour' | 'historique' | 'anomalies'>('jour');
  const [date, setDate] = useState(iso(aujourdHui()));
  const [shiftActif, setShiftActif] = useState<Shift>(aujourdHui().getHours() < 14 ? 'matin' : 'soir');
  const [saisie, setSaisie] = useState<{ ronde: RondeInspection; equipementId: string } | null>(null);
  const [cloture, setCloture] = useState<RondeInspection | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const indicateurs = useMemo(() => indicateursRondes(base, 30), [base]);

  const rondesDuJour = useMemo(
    () => base.rondes.filter((r) => r.date === date).sort((a) => (a.shift === 'matin' ? -1 : 1)),
    [base.rondes, date],
  );
  const ronde = rondesDuJour.find((r) => r.shift === shiftActif);
  const avancement = ronde ? avancementRonde(base, ronde.id) : null;

  const relevesDeLaRonde = useMemo(
    () => (ronde ? base.relevesInspection.filter((r) => r.rondeId === ronde.id) : []),
    [base.relevesInspection, ronde],
  );
  const parEquipement = useMemo(
    () => new Map(relevesDeLaRonde.map((r) => [r.equipementId, r])),
    [relevesDeLaRonde],
  );

  const ouvrirLesRondes = useCallback(async () => {
    const r = await commander(() => api.ouvrirRondes(date));
    setMessage(
      r.crees === 0
        ? 'Les créneaux de cette journée sont déjà ouverts.'
        : `${r.crees} créneau(x) ouvert(s) : ${r.numeros.join(', ')}.`,
    );
  }, [commander, date]);

  return (
    <>
      <EnTetePage
        titre="Rondes d’inspection"
        description="Tour des installations critiques deux fois par jour — prise de service à 7 h, relève de garde à 17 h"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'jour', libelle: 'Ronde du jour' },
                { valeur: 'anomalies', libelle: 'Anomalies', compteur: indicateurs.anomaliesMajeures },
                { valeur: 'historique', libelle: 'Historique' },
              ]}
            />
            {vue === 'jour' && (
              <Saisie
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-auto py-0 text-sm"
              />
            )}
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur
            libelle="Rondes réalisées"
            valeur={pourcent(indicateurs.taux, 0)}
            detail={`${indicateurs.realisees} sur ${indicateurs.attendues} — 30 jours`}
            accent={indicateurs.taux >= 95 ? 'positif' : indicateurs.taux >= 85 ? 'attention' : 'negatif'}
            icone={<ClipboardCheck className="size-4" />}
          />
          <Indicateur
            libelle="Créneaux manqués"
            valeur={nombre(indicateurs.manquees, 0)}
            accent={indicateurs.manquees ? 'negatif' : 'positif'}
            detail="aucun relevé saisi"
          />
          <Indicateur
            libelle="Rondes incomplètes"
            valeur={nombre(indicateurs.incompletes, 0)}
            accent={indicateurs.incompletes ? 'attention' : 'neutre'}
            detail="équipements non relevés"
          />
          <Indicateur
            libelle="Anomalies majeures"
            valeur={nombre(indicateurs.anomaliesMajeures, 0)}
            accent={indicateurs.anomaliesMajeures ? 'negatif' : 'positif'}
            detail={`sur ${nombre(indicateurs.pointsReleves, 0)} points relevés`}
            icone={<TriangleAlert className="size-4" />}
          />
        </div>

        {message && (
          <Encart ton="info">
            {message}{' '}
            <button type="button" className="underline" onClick={() => setMessage(null)}>
              masquer
            </button>
          </Encart>
        )}

        {vue === 'jour' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['matin', 'soir'] as Shift[]).map((s) => {
                const r = rondesDuJour.find((x) => x.shift === s);
                const av = r ? avancementRonde(base, r.id) : null;
                const statut = r ? statutEffectif(base, r) : null;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setShiftActif(s)}
                    className={`carte p-4 text-left transition-shadow hover:shadow-md ${
                      shiftActif === s ? 'ring-2 ring-marque-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex size-9 items-center justify-center rounded-lg ${
                            s === 'matin' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                          }`}
                        >
                          {s === 'matin' ? <Sun className="size-5" /> : <Moon className="size-5" />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{HORAIRES_SHIFT[s].libelle}</p>
                          <p className="text-xs text-slate-500">{HORAIRES_SHIFT[s].description}</p>
                        </div>
                      </div>
                      {statut && <Badge ton={STATUT_RONDE[statut].ton} pastille>{STATUT_RONDE[statut].libelle}</Badge>}
                    </div>

                    {r && av ? (
                      <div className="mt-4 space-y-2">
                        <Jauge valeur={av.taux} cible={100} libelle={`${av.releves} / ${av.attendus} équipements relevés`} />
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {av.conformes > 0 && (
                            <Badge ton="succes" compact>{pluriel(av.conformes, 'conforme')}</Badge>
                          )}
                          {av.anomaliesMineures > 0 && (
                            <Badge ton="attention" compact>
                              {pluriel(av.anomaliesMineures, 'anomalie mineure', 'anomalies mineures')}
                            </Badge>
                          )}
                          {av.anomaliesMajeures > 0 && (
                            <Badge ton="danger" compact>
                              {pluriel(av.anomaliesMajeures, 'anomalie majeure', 'anomalies majeures')}
                            </Badge>
                          )}
                          {av.horsService > 0 && (
                            <Badge ton="danger" compact>{av.horsService} hors service</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {r.agentId ? <>Agent : <NomUtilisateur id={r.agentId} /></> : 'Aucun agent n’a pris cette ronde'}
                          {r.viseParId && <span className="ml-2 text-emerald-700">· visée</span>}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">
                        Créneau non ouvert pour cette journée.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {!ronde ? (
              <Carte>
                <Vide
                  titre="Aucune ronde ouverte pour ce créneau"
                  description="Les créneaux du jour sont ouverts automatiquement à la prise de service. Ils peuvent aussi être ouverts manuellement, par exemple pour rattraper une journée."
                  icone={<ClipboardCheck className="size-8" />}
                  action={
                    <Bouton variante="primaire" disabled={horsLigne} onClick={() => void ouvrirLesRondes()}>
                      Ouvrir les créneaux du {dateCourte(date)}
                    </Bouton>
                  }
                />
              </Carte>
            ) : (
              <Carte
                sansPadding
                titre={`${ronde.numero} — ${HORAIRES_SHIFT[ronde.shift].libelle}`}
                sousTitre={
                  ronde.heureDebut
                    ? `Débutée à ${dateHeure(ronde.heureDebut).slice(-5)}${ronde.heureFin ? `, terminée à ${dateHeure(ronde.heureFin).slice(-5)}` : ''}`
                    : 'Non commencée'
                }
                actions={
                  <>
                    {ronde.statut === 'planifiee' && (
                      <Bouton
                        variante="primaire"
                        disabled={horsLigne}
                        onClick={() => void commander(() => api.demarrerRonde(ronde.id))}
                      >
                        Prendre la ronde
                      </Bouton>
                    )}
                    {(ronde.statut === 'en_cours' || ronde.statut === 'incomplete') && (
                      <Bouton variante="primaire" disabled={horsLigne} onClick={() => setCloture(ronde)}>
                        <CheckCircle2 className="size-4" /> Clôturer
                      </Bouton>
                    )}
                    {ronde.statut !== 'planifiee' && !ronde.viseParId && (
                      <Bouton
                        disabled={horsLigne}
                        onClick={() => void commander(() => api.viserRonde(ronde.id))}
                      >
                        <Stamp className="size-4" /> Viser
                      </Bouton>
                    )}
                  </>
                }
              >
                {ronde.observations && (
                  <div className="border-b border-slate-200 px-4 py-3">
                    <Encart ton="info" titre="Observations de l’agent">
                      {ronde.observations}
                    </Encart>
                  </div>
                )}

                <ul className="divide-y divide-slate-100">
                  {ronde.equipementsAttendus.map((equipementId) => {
                    const eq = index.equipements.get(equipementId);
                    const releve = parEquipement.get(equipementId);
                    const modele = modelePourEquipement(base, equipementId, ronde.shift);
                    if (!eq) return null;
                    return (
                      <li key={equipementId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">
                            <LienEquipement id={equipementId} />
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {modele?.libelle ?? 'sans modèle'} · <Localisation localId={eq.localId} court />
                          </p>
                        </div>
                        <BadgeCriticite niveau={eq.criticite} compact />
                        {releve ? (
                          <>
                            <Badge ton={ETAT[releve.etat].ton} pastille>
                              {ETAT[releve.etat].libelle}
                            </Badge>
                            <span className="w-14 shrink-0 text-right text-xs text-slate-400 tabulaire">
                              {dateHeure(releve.heure).slice(-5)}
                            </span>
                          </>
                        ) : (
                          <Badge ton="neutre">à relever</Badge>
                        )}
                        <Bouton
                          taille="sm"
                          variante={releve ? 'secondaire' : 'primaire'}
                          disabled={horsLigne || ronde.statut === 'terminee' || !modele}
                          onClick={() => setSaisie({ ronde, equipementId })}
                        >
                          {releve ? 'Corriger' : 'Relever'}
                        </Bouton>
                      </li>
                    );
                  })}
                </ul>
              </Carte>
            )}
          </>
        )}

        {vue === 'anomalies' && <OngletAnomalies />}
        {vue === 'historique' && <OngletHistorique />}
      </CorpsPage>

      {saisie && (
        <ModaleReleve
          ronde={saisie.ronde}
          equipementId={saisie.equipementId}
          releveExistant={parEquipement.get(saisie.equipementId)}
          onFermer={() => setSaisie(null)}
          onEnregistre={(demande) => {
            setSaisie(null);
            if (demande) setMessage(`Anomalie bloquante : la demande d’intervention ${demande} a été ouverte.`);
          }}
        />
      )}

      {cloture && (
        <ModaleCloture
          ronde={cloture}
          avancement={avancement}
          agent={`${utilisateur.prenom} ${utilisateur.nom}`}
          onFermer={() => setCloture(null)}
          onCloture={() => setCloture(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Saisie d'un relevé                                                  */
/* ------------------------------------------------------------------ */

function ModaleReleve({
  ronde,
  equipementId,
  releveExistant,
  onFermer,
  onEnregistre,
}: {
  ronde: RondeInspection;
  equipementId: string;
  releveExistant?: ReleveInspection;
  onFermer: () => void;
  onEnregistre: (demandeCreee: string | null) => void;
}) {
  const { base, index, commander } = useGMAO();
  const equipement = index.equipements.get(equipementId);
  const modele = modelePourEquipement(base, equipementId, ronde.shift);

  const [valeurs, setValeurs] = useState<Record<string, Omit<ValeurReleve, 'conforme'>>>(() => {
    const initial: Record<string, Omit<ValeurReleve, 'conforme'>> = {};
    for (const v of releveExistant?.valeurs ?? []) {
      initial[v.pointId] = { pointId: v.pointId, valeurNum: v.valeurNum, valeurTexte: v.valeurTexte, valeurBool: v.valeurBool };
    }
    // Les points de type état et booléen partent sur la réponse normale : sur
    // le terrain, l'agent ne coche que ce qui sort de l'ordinaire.
    for (const p of modele?.points ?? []) {
      if (initial[p.id]) continue;
      if (p.type === 'etat') initial[p.id] = { pointId: p.id, valeurTexte: (p.optionsConformes ?? p.options ?? [])[0] };
      if (p.type === 'booleen') initial[p.id] = { pointId: p.id, valeurBool: p.reponseAttendue ?? true };
    }
    return initial;
  });
  const [observation, setObservation] = useState(releveExistant?.observation ?? '');
  const [etatForce, setEtatForce] = useState<'' | 'hors_service' | 'non_accessible'>('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (!modele || !equipement) return null;

  const definir = (pointId: string, modif: Partial<ValeurReleve>) =>
    setValeurs((v) => ({ ...v, [pointId]: { ...v[pointId], pointId, ...modif } }));

  const ecarts = modele.points.filter((p) => {
    const v = valeurs[p.id];
    if (!v) return false;
    return !estConforme(p, v);
  });
  const manquants = modele.points.filter((p) => p.obligatoire && !aUneValeur(valeurs[p.id]));

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre={`${equipement.code} — ${equipement.designation}`}
      sousTitre={`${modele.libelle} · ${HORAIRES_SHIFT[ronde.shift].libelle.toLowerCase()} du ${dateCourte(ronde.date)}`}
      largeur="lg"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={enCours || (manquants.length > 0 && !etatForce)}
            onClick={async () => {
              setEnCours(true);
              setErreur(null);
              try {
                const r = await commander(() =>
                  api.saisirReleve(ronde.id, {
                    equipementId,
                    valeurs: Object.values(valeurs).filter((v) => aUneValeur(v)),
                    observation: observation || undefined,
                    etatForce: etatForce || undefined,
                  }),
                );
                onEnregistre(r.demandeCreee?.numero ?? null);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
              } finally {
                setEnCours(false);
              }
            }}
          >
            Enregistrer le relevé
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        {modele.consignesSecurite && (
          <Encart ton="attention" titre="Consignes de sécurité">
            {modele.consignesSecurite}
          </Encart>
        )}

        {ecarts.length > 0 && (
          <Encart ton={ecarts.some((p) => p.bloquant) ? 'danger' : 'attention'} titre={`${ecarts.length} point(s) hors tolérance`}>
            {ecarts.some((p) => p.bloquant)
              ? 'Un point bloquant est hors tolérance : une demande d’intervention sera ouverte automatiquement à l’enregistrement.'
              : 'Les écarts seront tracés dans le relevé et visibles à la relève.'}
          </Encart>
        )}

        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {modele.points.map((p) => {
            const v = valeurs[p.id];
            const conforme = v && aUneValeur(v) ? estConforme(p, v) : null;
            return (
              <li
                key={p.id}
                className={`px-3 py-2.5 ${conforme === false ? (p.bloquant ? 'bg-rose-50/60' : 'bg-amber-50/50') : ''}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">
                    {p.ordre}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                      {p.libelle}
                      {p.bloquant && <Badge ton="danger" compact>bloquant</Badge>}
                      {!p.obligatoire && <span className="text-xs text-slate-400">facultatif</span>}
                    </p>
                    <p className="text-xs text-slate-500">Attendu : {decrireAttendu(p)}</p>
                  </div>
                  <div className="w-full shrink-0 sm:w-56">
                    <ChampPoint point={p} valeur={v} onChange={(m) => definir(p.id, m)} />
                  </div>
                </div>
                {conforme === false && p.consigne && (
                  <p className="mt-1.5 pl-9 text-xs font-medium text-rose-700">{p.consigne}</p>
                )}
              </li>
            );
          })}
        </ul>

        <Champ label="Observation générale">
          <Zone rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Ce qui mérite d’être signalé à la relève…" />
        </Champ>

        <Champ label="Situation particulière" aide="À n’utiliser que si le relevé complet est impossible">
          <Liste
            value={etatForce}
            onChange={(e) => setEtatForce(e.target.value as typeof etatForce)}
            vide="— relevé normal —"
            options={[
              { valeur: 'hors_service', libelle: 'Équipement à l’arrêt / hors service' },
              { valeur: 'non_accessible', libelle: 'Local inaccessible' },
            ]}
          />
        </Champ>

        {manquants.length > 0 && !etatForce && (
          <Encart ton="attention">
            Points obligatoires non renseignés : {manquants.map((p) => p.libelle).join(', ')}.
          </Encart>
        )}
        {erreur && <Encart ton="danger">{erreur}</Encart>}
      </div>
    </Modale>
  );
}

function ChampPoint({
  point,
  valeur,
  onChange,
}: {
  point: PointControle;
  valeur?: Omit<ValeurReleve, 'conforme'>;
  onChange: (m: Partial<ValeurReleve>) => void;
}) {
  switch (point.type) {
    case 'mesure':
    case 'compteur':
      return (
        <div className="flex items-center gap-2">
          <Saisie
            type="number"
            step="any"
            inputMode="decimal"
            value={valeur?.valeurNum ?? ''}
            onChange={(e) => onChange({ valeurNum: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="text-right"
          />
          {point.unite && <span className="shrink-0 text-xs text-slate-500">{point.unite}</span>}
        </div>
      );
    case 'etat':
      return (
        <Liste
          value={valeur?.valeurTexte ?? ''}
          onChange={(e) => onChange({ valeurTexte: e.target.value })}
          vide="— à renseigner —"
          options={(point.options ?? []).map((o) => ({ valeur: o, libelle: o }))}
        />
      );
    case 'booleen':
      return (
        <Segments
          valeur={valeur?.valeurBool === undefined ? '' : valeur.valeurBool ? 'oui' : 'non'}
          onChange={(v) => onChange({ valeurBool: v === 'oui' })}
          taille="sm"
          options={[
            { valeur: 'oui', libelle: 'Oui' },
            { valeur: 'non', libelle: 'Non' },
          ]}
        />
      );
    case 'texte':
      return (
        <Saisie
          value={valeur?.valeurTexte ?? ''}
          onChange={(e) => onChange({ valeurTexte: e.target.value })}
          placeholder="facultatif"
        />
      );
  }
}

function aUneValeur(v?: Omit<ValeurReleve, 'conforme'>): boolean {
  if (!v) return false;
  return v.valeurNum !== undefined || (v.valeurTexte ?? '') !== '' || v.valeurBool !== undefined;
}

/**
 * Contrôle local, uniquement pour colorer le formulaire pendant la saisie.
 * La conformité qui fait foi est recalculée par le serveur à l'enregistrement.
 */
function estConforme(point: PointControle, v: Omit<ValeurReleve, 'conforme'>): boolean {
  if (point.type === 'mesure') {
    if (v.valeurNum === undefined) return !point.obligatoire;
    if (point.valeurMin !== undefined && v.valeurNum < point.valeurMin) return false;
    if (point.valeurMax !== undefined && v.valeurNum > point.valeurMax) return false;
    return true;
  }
  if (point.type === 'etat') {
    if (!v.valeurTexte) return !point.obligatoire;
    return point.optionsConformes ? point.optionsConformes.includes(v.valeurTexte) : true;
  }
  if (point.type === 'booleen') {
    if (v.valeurBool === undefined) return !point.obligatoire;
    return point.reponseAttendue === undefined || v.valeurBool === point.reponseAttendue;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Clôture                                                             */
/* ------------------------------------------------------------------ */

function ModaleCloture({
  ronde,
  avancement,
  agent,
  onFermer,
  onCloture,
}: {
  ronde: RondeInspection;
  avancement: ReturnType<typeof avancementRonde> | null;
  agent: string;
  onFermer: () => void;
  onCloture: () => void;
}) {
  const { index, commander } = useGMAO();
  const [observations, setObservations] = useState(ronde.observations ?? '');

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Clôturer la ronde"
      sousTitre={`${ronde.numero} — ${HORAIRES_SHIFT[ronde.shift].libelle.toLowerCase()} du ${dateCourte(ronde.date)}`}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            onClick={async () => {
              await commander(() => api.cloturerRonde(ronde.id, observations || undefined));
              onCloture();
            }}
          >
            Clôturer
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        {avancement && avancement.restants.length > 0 && (
          <Encart ton="attention" titre={`${avancement.restants.length} équipement(s) non relevé(s)`}>
            La ronde sera enregistrée comme incomplète. Les équipements suivants n’ont pas été vus :{' '}
            {avancement.restants
              .slice(0, 6)
              .map((id) => index.equipements.get(id)?.code)
              .filter(Boolean)
              .join(', ')}
            {avancement.restants.length > 6 && `, et ${avancement.restants.length - 6} autre(s)`}.
          </Encart>
        )}

        {avancement && (
          <Definitions
            items={[
              { label: 'Relevés saisis', valeur: `${avancement.releves} / ${avancement.attendus}` },
              { label: 'Conformes', valeur: nombre(avancement.conformes, 0) },
              { label: 'Anomalies mineures', valeur: nombre(avancement.anomaliesMineures, 0) },
              { label: 'Anomalies majeures', valeur: nombre(avancement.anomaliesMajeures, 0) },
            ]}
          />
        )}

        <Champ label="Observations de fin de ronde" aide="Lues par le responsable technique à la relève">
          <Zone rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
        </Champ>

        <CaseACocher label={`Signature : ${agent}`} checked readOnly description="La signature engage l’agent sur l’exactitude des relevés." />
      </div>
    </Modale>
  );
}

/* ------------------------------------------------------------------ */
/* Anomalies et historique                                             */
/* ------------------------------------------------------------------ */

interface LigneAnomalie {
  releve: ReleveInspection;
  ronde: RondeInspection;
  modele?: ModeleInspection;
}

function OngletAnomalies() {
  const { base, index } = useGMAO();

  const lignes = useMemo<LigneAnomalie[]>(() => {
    const rondes = new Map(base.rondes.map((r) => [r.id, r]));
    return base.relevesInspection
      .filter((r) => r.etat !== 'conforme')
      .map((releve) => ({
        releve,
        ronde: rondes.get(releve.rondeId)!,
        modele: base.modelesInspection.find((m) => m.id === releve.modeleId),
      }))
      .filter((l) => l.ronde)
      .sort((a, b) => b.ronde.date.localeCompare(a.ronde.date) || b.releve.heure.localeCompare(a.releve.heure))
      .slice(0, 400);
  }, [base]);

  const colonnes: Colonne<LigneAnomalie>[] = [
    {
      cle: 'date',
      entete: 'Relevé',
      largeur: '130px',
      tri: (l) => `${l.ronde.date}${l.releve.heure}`,
      rendu: (l) => (
        <div>
          <p className="text-sm tabulaire text-slate-700">{dateCourte(l.ronde.date)}</p>
          <p className="text-xs text-slate-500">{HORAIRES_SHIFT[l.ronde.shift].libelle.toLowerCase()}</p>
        </div>
      ),
    },
    {
      cle: 'equipement',
      entete: 'Équipement',
      tri: (l) => index.equipements.get(l.releve.equipementId)?.code ?? '',
      rendu: (l) => (
        <div className="min-w-0">
          <p className="truncate">
            <LienEquipement id={l.releve.equipementId} />
          </p>
          <p className="truncate text-xs text-slate-500">{l.modele?.libelle}</p>
        </div>
      ),
    },
    {
      cle: 'ecarts',
      entete: 'Points hors tolérance',
      tri: (l) => l.releve.valeurs.filter((v) => !v.conforme).length,
      rendu: (l) => {
        const ecarts = l.releve.valeurs.filter((v) => !v.conforme);
        return (
          <ul className="space-y-0.5">
            {ecarts.slice(0, 3).map((v) => {
              const p = l.modele?.points.find((x) => x.id === v.pointId);
              return (
                <li key={v.pointId} className="truncate text-xs text-slate-700">
                  <span className="font-medium">{p?.libelle ?? v.pointId}</span>{' '}
                  <span className="text-rose-700">
                    {v.valeurNum !== undefined ? `${v.valeurNum} ${p?.unite ?? ''}` : (v.valeurTexte ?? (v.valeurBool ? 'oui' : 'non'))}
                  </span>
                  {p && <span className="text-slate-400"> (attendu {decrireAttendu(p)})</span>}
                </li>
              );
            })}
            {ecarts.length > 3 && <li className="text-xs text-slate-400">+ {ecarts.length - 3} autre(s)</li>}
          </ul>
        );
      },
    },
    {
      cle: 'etat',
      entete: 'État',
      largeur: '150px',
      tri: (l) => l.releve.etat,
      rendu: (l) => <Badge ton={ETAT[l.releve.etat].ton} pastille>{ETAT[l.releve.etat].libelle}</Badge>,
    },
    {
      cle: 'suite',
      entete: 'Suite donnée',
      largeur: '150px',
      tri: (l) => l.releve.demandeId ?? '',
      rendu: (l) => {
        if (!l.releve.demandeId) return <span className="text-xs text-slate-400">aucune</span>;
        const d = base.demandes.find((x) => x.id === l.releve.demandeId);
        return d ? (
          <Link to="/demandes" className="lien font-mono text-xs">
            {d.numero}
          </Link>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        );
      },
    },
    {
      cle: 'agent',
      entete: 'Agent',
      largeur: '170px',
      secondaire: true,
      tri: (l) => l.releve.agentId,
      rendu: (l) => <NomUtilisateur id={l.releve.agentId} />,
    },
  ];

  return (
    <Carte
      sansPadding
      titre="Anomalies relevées en ronde"
      sousTitre="Ce que la garde a constaté, et la suite qui y a été donnée"
    >
      <Tableau
        lignes={lignes}
        colonnes={colonnes}
        cleLigne={(l) => l.releve.id}
        triInitial={{ cle: 'date', sens: 'desc' }}
        parPage={25}
        nomExport="anomalies-rondes"
        vide="Aucune anomalie relevée."
        ligneClassName={(l) => (l.releve.etat === 'anomalie_majeure' ? 'bg-rose-50/40' : '')}
      />
    </Carte>
  );
}

function OngletHistorique() {
  const { base } = useGMAO();
  const [jours, setJours] = useState(30);

  const lignes = useMemo(() => {
    const debut = iso(new Date(aujourdHui().getTime() - jours * 86_400_000));
    return base.rondes
      .filter((r) => r.date >= debut)
      .map((r) => ({ ronde: r, avancement: avancementRonde(base, r.id), statut: statutEffectif(base, r) }))
      .sort((a, b) => b.ronde.date.localeCompare(a.ronde.date) || (a.ronde.shift === 'matin' ? 1 : -1));
  }, [base, jours]);

  type Ligne = (typeof lignes)[number];

  const colonnes: Colonne<Ligne>[] = [
    { cle: 'numero', entete: 'N°', largeur: '130px', tri: (l) => l.ronde.numero, rendu: (l) => <span className="font-mono text-xs">{l.ronde.numero}</span> },
    { cle: 'date', entete: 'Date', largeur: '110px', tri: (l) => l.ronde.date, rendu: (l) => dateCourte(l.ronde.date) },
    {
      cle: 'shift',
      entete: 'Créneau',
      largeur: '140px',
      tri: (l) => l.ronde.shift,
      rendu: (l) => (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
          {l.ronde.shift === 'matin' ? <Sun className="size-3.5 text-amber-500" /> : <Moon className="size-3.5 text-indigo-500" />}
          {HORAIRES_SHIFT[l.ronde.shift].libelle}
        </span>
      ),
    },
    { cle: 'agent', entete: 'Agent', largeur: '190px', tri: (l) => l.ronde.agentId ?? '', rendu: (l) => <NomUtilisateur id={l.ronde.agentId} /> },
    {
      cle: 'avancement',
      entete: 'Relevés',
      largeur: '130px',
      tri: (l) => l.avancement.taux,
      export: (l) => `${l.avancement.releves}/${l.avancement.attendus}`,
      rendu: (l) => (
        <div>
          <p className="text-xs tabulaire text-slate-600">
            {l.avancement.releves} / {l.avancement.attendus}
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${l.avancement.taux === 100 ? 'bg-emerald-500' : l.avancement.taux > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
              style={{ width: `${l.avancement.taux}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      cle: 'anomalies',
      entete: 'Anomalies',
      largeur: '110px',
      aDroite: true,
      tri: (l) => l.avancement.anomaliesMajeures * 10 + l.avancement.anomaliesMineures,
      rendu: (l) =>
        l.avancement.anomaliesMajeures + l.avancement.anomaliesMineures === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="inline-flex gap-1">
            {l.avancement.anomaliesMajeures > 0 && <Badge ton="danger" compact>{l.avancement.anomaliesMajeures}</Badge>}
            {l.avancement.anomaliesMineures > 0 && <Badge ton="attention" compact>{l.avancement.anomaliesMineures}</Badge>}
          </span>
        ),
    },
    {
      cle: 'statut',
      entete: 'Statut',
      largeur: '130px',
      tri: (l) => l.statut,
      export: (l) => STATUT_RONDE[l.statut].libelle,
      rendu: (l) => <Badge ton={STATUT_RONDE[l.statut].ton} pastille>{STATUT_RONDE[l.statut].libelle}</Badge>,
    },
    {
      cle: 'visa',
      entete: 'Visa',
      largeur: '160px',
      secondaire: true,
      tri: (l) => l.ronde.viseParId ?? '',
      rendu: (l) => (l.ronde.viseParId ? <NomUtilisateur id={l.ronde.viseParId} /> : <span className="text-xs text-slate-400">non visée</span>),
    },
  ];

  return (
    <Carte
      sansPadding
      titre="Historique des rondes"
      sousTitre="Registre de garde — c’est la pièce qui prouve que la surveillance a été assurée"
      actions={
        <Liste
          value={String(jours)}
          onChange={(e) => setJours(Number(e.target.value))}
          className="h-8 w-auto py-0 text-xs"
          options={[
            { valeur: '7', libelle: '7 jours' },
            { valeur: '30', libelle: '30 jours' },
            { valeur: '90', libelle: '90 jours' },
            { valeur: '365', libelle: '12 mois' },
          ]}
        />
      }
    >
      <Tableau
        lignes={lignes}
        colonnes={colonnes}
        cleLigne={(l) => l.ronde.id}
        triInitial={{ cle: 'date', sens: 'desc' }}
        parPage={30}
        nomExport="registre-rondes"
        vide="Aucune ronde sur la période."
        ligneClassName={(l) => (l.statut === 'manquee' ? 'bg-rose-50/40' : '')}
      />
    </Carte>
  );
}
