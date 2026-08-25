import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  MessageSquare,
  Package,
  Play,
  Printer,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Badge } from '@/components/ui/Badge';
import { Bouton, BoutonIcone } from '@/components/ui/Bouton';
import { CaseACocher, Champ, Liste, Saisie, Zone } from '@/components/ui/Champs';
import { Definitions, Encart, Vide } from '@/components/ui/Info';
import { Modale } from '@/components/ui/Modale';
import {
  BadgeConformite,
  BadgeCriticite,
  BadgePriorite,
  BadgeStatutOT,
  BadgeTypeMaintenance,
} from '@/components/shared/Etiquettes';
import { LienEquipement, Localisation, NomFournisseur, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import {
  affecterOT,
  ajouterCommentaire,
  ajouterPiece,
  ajouterTemps,
  changerStatutOT,
} from '@/data/actions';
import { coutMainOeuvre, coutPieces, coutTotal, estEnRetard, estOuvert, estTermine, margeSLAHeures, tempsPasseMin } from '@/lib/kpi';
import { dateCourte, dateHeure, echeanceRelative } from '@/lib/dates';
import { duree, montant, nombre } from '@/lib/format';
import { CAUSE_PANNE, PRIORITE, STATUT_OT } from '@/types/labels';
import type { CausePanne, OrdreTravail, StatutOT } from '@/types/domain';

/** Enchaînement de statuts proposé à l'utilisateur selon l'état courant. */
const TRANSITIONS: Record<StatutOT, StatutOT[]> = {
  a_planifier: ['planifie', 'affecte', 'annule'],
  planifie: ['affecte', 'en_cours', 'annule'],
  affecte: ['en_cours', 'attente_pieces', 'attente_prestataire', 'annule'],
  en_cours: ['attente_pieces', 'attente_prestataire', 'realise', 'annule'],
  attente_pieces: ['en_cours', 'realise', 'annule'],
  attente_prestataire: ['en_cours', 'realise', 'annule'],
  realise: ['cloture', 'en_cours'],
  cloture: [],
  annule: ['a_planifier'],
};

export function PageOrdreTravailDetail() {
  const { id } = useParams();
  const { base, index, muter, utilisateur } = useGMAO();
  const naviguer = useNavigate();
  const [modale, setModale] = useState<'temps' | 'piece' | 'cloture' | 'affecter' | null>(null);
  const [commentaire, setCommentaire] = useState('');

  const ot = base.ordresTravail.find((o) => o.id === id);
  const equipement = ot?.equipementId ? index.equipements.get(ot.equipementId) : undefined;
  const gamme = ot?.gammeId ? index.gammes.get(ot.gammeId) : undefined;
  const demande = ot?.demandeId ? base.demandes.find((d) => d.id === ot.demandeId) : undefined;

  const marge = useMemo(() => (ot ? margeSLAHeures(ot) : null), [ot]);

  if (!ot) {
    return (
      <CorpsPage>
        <Vide
          titre="Ordre de travail introuvable"
          icone={<ClipboardList className="size-8" />}
          action={<Bouton onClick={() => naviguer('/ordres-travail')}>Retour à la liste</Bouton>}
        />
      </CorpsPage>
    );
  }

  const modifier = (libelle: string, fn: Parameters<typeof muter>[1]) =>
    muter(libelle, fn, { action: 'modification', entiteType: 'ordre_travail', entiteId: ot.id });

  const ouvert = estOuvert(ot);
  const retard = estEnRetard(ot);

  return (
    <>
      <EnTetePage
        titre={`${ot.numero} — ${ot.objet}`}
        description={`Créé le ${dateHeure(ot.dateCreation)}${demande ? ` à partir de la demande ${demande.numero}` : ''}`}
        retour={{ to: '/ordres-travail', libelle: 'Ordres de travail' }}
        actions={
          <>
            <Bouton onClick={() => window.print()}>
              <Printer className="size-4" /> Bon d’intervention
            </Bouton>
            {ouvert && ot.statut !== 'en_cours' && (
              <Bouton
                variante="secondaire"
                onClick={() => modifier(`Démarrage de ${ot.numero}`, (b) => changerStatutOT(b, ot.id, 'en_cours', utilisateur.id))}
              >
                <Play className="size-4" /> Démarrer
              </Bouton>
            )}
            {(ot.statut === 'en_cours' || ot.statut === 'attente_pieces' || ot.statut === 'attente_prestataire') && (
              <Bouton variante="primaire" onClick={() => setModale('cloture')}>
                <CheckCircle2 className="size-4" /> Terminer l’intervention
              </Bouton>
            )}
            {ot.statut === 'realise' && (
              <Bouton
                variante="primaire"
                onClick={() =>
                  muter(`Clôture de ${ot.numero}`, (b) => changerStatutOT(b, ot.id, 'cloture', utilisateur.id), {
                    action: 'cloture',
                    entiteType: 'ordre_travail',
                    entiteId: ot.id,
                  })
                }
              >
                <CheckCircle2 className="size-4" /> Valider et clôturer
              </Bouton>
            )}
          </>
        }
      />

      <CorpsPage>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeStatutOT statut={ot.statut} />
          <BadgeTypeMaintenance type={ot.type} />
          <BadgePriorite priorite={ot.priorite} />
          {equipement && <BadgeCriticite niveau={equipement.criticite} />}
          {ot.execution === 'prestataire' && (
            <Badge ton="violet">
              Prestataire : <NomFournisseur id={ot.prestataireId} />
            </Badge>
          )}
          {ot.conformite && <BadgeConformite conformite={ot.conformite} />}
          {ouvert && (
            <Badge ton={retard ? 'danger' : marge !== null && marge < 8 ? 'attention' : 'neutre'}>
              {retard
                ? `Délai dépassé de ${nombre(Math.abs(marge ?? 0), 0)} h`
                : marge !== null
                  ? `${nombre(marge, 0)} h avant échéance`
                  : 'Sans échéance'}
            </Badge>
          )}
        </div>

        {retard && (
          <Encart ton="danger" titre="Engagement de délai dépassé" icone={<ShieldAlert className="size-4" />}>
            L’objectif de résolution pour une priorité {ot.priorite} est de {PRIORITE[ot.priorite].delaiResolutionH} h après
            le signalement. L’écart doit être justifié à la clôture — c’est ce que regarde la commission de gestion des
            risques.
          </Encart>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Carte titre="Description de la demande">
              <p className="text-sm whitespace-pre-line text-slate-700">{ot.description || 'Aucune description saisie.'}</p>
              {demande && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Demande d’origine</p>
                  <p className="mt-1 text-slate-700">
                    {demande.numero} — déclarée par <NomUtilisateur id={demande.demandeurId} /> le{' '}
                    {dateHeure(demande.dateCreation)} via {demande.canal.replace(/_/g, ' ')}.
                  </p>
                  <p className="mt-1 text-slate-600">
                    Impact patient déclaré : <strong>{demande.impactPatient.replace(/_/g, ' ')}</strong>
                  </p>
                </div>
              )}
            </Carte>

            {gamme && <CarteOperations ot={ot} gammeId={gamme.id} onModifier={modifier} />}

            <Carte
              titre="Temps passé"
              sousTitre={`${duree(tempsPasseMin(ot))} — ${montant(coutMainOeuvre(ot))} de main-d’œuvre`}
              icone={<Clock className="size-4 text-slate-400" />}
              actions={
                !estTermine(ot) || ot.statut === 'realise' ? (
                  <Bouton taille="sm" onClick={() => setModale('temps')}>
                    Saisir du temps
                  </Bouton>
                ) : undefined
              }
              sansPadding
            >
              {ot.temps.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Aucun temps saisi.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {ot.temps.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <NomUtilisateur id={t.technicienId} />
                      <div className="min-w-0 flex-1">
                        {t.commentaire && <p className="truncate text-xs text-slate-500">{t.commentaire}</p>}
                        <p className="text-xs text-slate-400">{dateCourte(t.date)}</p>
                      </div>
                      <span className="shrink-0 text-sm tabulaire text-slate-700">{duree(t.dureeMin)}</span>
                      <span className="shrink-0 text-sm tabulaire text-slate-500">
                        {montant((t.dureeMin / 60) * t.tauxHoraire)}
                      </span>
                      {!estTermine(ot) && (
                        <BoutonIcone
                          libelle="Supprimer cette ligne"
                          onClick={() =>
                            modifier(`Suppression d’une saisie de temps sur ${ot.numero}`, (b) => {
                              const cible = b.ordresTravail.find((o) => o.id === ot.id);
                              cible?.temps.splice(i, 1);
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </BoutonIcone>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Carte>

            <Carte
              titre="Pièces et consommables"
              sousTitre={`${montant(coutPieces(ot))} de fournitures`}
              icone={<Package className="size-4 text-slate-400" />}
              actions={
                !estTermine(ot) ? (
                  <Bouton taille="sm" onClick={() => setModale('piece')}>
                    Ajouter une pièce
                  </Bouton>
                ) : undefined
              }
              sansPadding
            >
              {ot.pieces.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Aucune pièce consommée.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {ot.pieces.map((p, i) => {
                    const art = index.articles.get(p.articleId);
                    return (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">
                            <span className="font-mono text-xs text-slate-500">{art?.code}</span> {art?.designation}
                          </p>
                          <p className="text-xs text-slate-500">
                            {p.sortieValidee ? 'Sortie de stock enregistrée' : 'Sortie de stock à valider à la clôture'}
                            {art && ` · reste ${art.stockActuel} ${art.unite} en magasin`}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabulaire text-slate-700">
                          {p.quantite} × {montant(p.prixUnitaire, true)}
                        </span>
                        <span className="shrink-0 text-sm font-medium tabulaire text-slate-800">
                          {montant(p.quantite * p.prixUnitaire)}
                        </span>
                        {!p.sortieValidee && (
                          <BoutonIcone
                            libelle="Retirer cette pièce"
                            onClick={() =>
                              modifier(`Retrait d’une pièce sur ${ot.numero}`, (b) => {
                                const cible = b.ordresTravail.find((o) => o.id === ot.id);
                                cible?.pieces.splice(i, 1);
                              })
                            }
                          >
                            <X className="size-3.5" />
                          </BoutonIcone>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Carte>

            {(ot.diagnostic || ot.actionsRealisees) && (
              <Carte titre="Compte rendu d’intervention">
                <Definitions
                  colonnes={1}
                  items={[
                    { label: 'Diagnostic', valeur: ot.diagnostic ?? '—' },
                    { label: 'Cause de la défaillance', valeur: ot.causePanne ? CAUSE_PANNE[ot.causePanne] : '—' },
                    { label: 'Actions réalisées', valeur: ot.actionsRealisees ?? '—' },
                    {
                      label: 'Immobilisation de l’équipement',
                      valeur: ot.arretEquipementMin ? duree(ot.arretEquipementMin) : 'Aucune',
                    },
                  ]}
                />
              </Carte>
            )}

            {ot.reserves.length > 0 && (
              <Carte titre="Réserves émises" sansPadding>
                <ul className="divide-y divide-slate-100">
                  {ot.reserves.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Badge ton={r.gravite === 'critique' ? 'danger' : r.gravite === 'majeure' ? 'attention' : 'neutre'}>
                        {r.gravite}
                      </Badge>
                      <p className="min-w-0 flex-1 text-sm text-slate-700">{r.libelle}</p>
                      {r.levee ? (
                        <Badge ton="succes">Levée le {dateCourte(r.dateLevee)}</Badge>
                      ) : (
                        <Badge ton="attention">Échéance {dateCourte(r.dateEcheance)}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </Carte>
            )}

            <Carte
              titre="Échanges"
              icone={<MessageSquare className="size-4 text-slate-400" />}
              sousTitre="Fil de discussion entre le service demandeur et l’équipe technique"
            >
              <ul className="space-y-3">
                {ot.commentaires.map((c) => (
                  <li key={c.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <NomUtilisateur id={c.auteurId} />
                      <span className="text-xs text-slate-400">{dateHeure(c.date)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{c.texte}</p>
                  </li>
                ))}
                {ot.commentaires.length === 0 && <li className="text-sm text-slate-500">Aucun échange enregistré.</li>}
              </ul>
              <div className="mt-3 flex gap-2">
                <Zone
                  rows={2}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Ajouter un commentaire visible par le service demandeur…"
                />
                <Bouton
                  variante="primaire"
                  disabled={!commentaire.trim()}
                  onClick={() => {
                    modifier(`Commentaire sur ${ot.numero}`, (b) => ajouterCommentaire(b, ot.id, utilisateur.id, commentaire));
                    setCommentaire('');
                  }}
                >
                  Publier
                </Bouton>
              </div>
            </Carte>
          </div>

          <div className="space-y-4">
            <Carte titre="Équipement concerné">
              {equipement ? (
                <Definitions
                  colonnes={1}
                  items={[
                    { label: 'Équipement', valeur: <LienEquipement id={equipement.id} /> },
                    { label: 'Marque et modèle', valeur: `${equipement.marque} ${equipement.modele}` },
                    { label: 'Localisation', valeur: <Localisation localId={ot.localId} /> },
                    { label: 'Statut actuel', valeur: equipement.statut.replace(/_/g, ' ') },
                    {
                      label: 'Équipement de secours',
                      valeur: equipement.equipementSecoursId ? (
                        <Link to={`/equipements/${equipement.equipementSecoursId}`} className="lien">
                          {index.equipements.get(equipement.equipementSecoursId)?.code}
                        </Link>
                      ) : (
                        'Aucun'
                      ),
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Intervention sur un local, sans équipement rattaché : <Localisation localId={ot.localId} />
                </p>
              )}
            </Carte>

            <Carte
              titre="Affectation"
              actions={
                ouvert ? (
                  <Bouton taille="sm" onClick={() => setModale('affecter')}>
                    Modifier
                  </Bouton>
                ) : undefined
              }
            >
              <Definitions
                colonnes={1}
                items={[
                  { label: 'Équipe', valeur: index.equipes.get(ot.equipeId ?? '')?.nom ?? 'Non affectée' },
                  { label: 'Technicien référent', valeur: <NomUtilisateur id={ot.technicienPrincipalId} /> },
                  { label: 'Date planifiée', valeur: dateCourte(ot.datePlanifiee) },
                  {
                    label: 'Échéance contractuelle',
                    valeur: (
                      <span className={retard ? 'font-medium text-rose-600' : ''}>
                        {dateHeure(ot.dateEcheanceSLA)} ({echeanceRelative(ot.dateEcheanceSLA)})
                      </span>
                    ),
                  },
                  { label: 'Début réel', valeur: dateHeure(ot.dateDebut) },
                  { label: 'Fin réelle', valeur: dateHeure(ot.dateFin) },
                ]}
              />
            </Carte>

            <Carte titre="Préparation sécurité" icone={<ShieldAlert className="size-4 text-slate-400" />}>
              <div className="space-y-2.5">
                {(
                  [
                    ['consignationElectrique', 'Consignation électrique effectuée', 'Étiquette de condamnation posée avant ouverture des capots'],
                    ['desinfectionPrealable', 'Désinfection préalable du dispositif', 'Protocole de l’équipe opérationnelle d’hygiène'],
                    ['epiPortes', 'Équipements de protection portés', 'Gants, lunettes, dosimètre selon le risque'],
                    ['permisFeu', 'Permis de feu délivré', 'Obligatoire pour tout point chaud en établissement de type U'],
                    ['patientEvacue', 'Zone libérée des patients', 'À coordonner avec le cadre de santé'],
                  ] as const
                ).map(([cle, label, aide]) => (
                  <CaseACocher
                    key={cle}
                    label={label}
                    description={aide}
                    checked={ot.securite[cle]}
                    disabled={estTermine(ot)}
                    onChange={(e) =>
                      modifier(`Préparation sécurité de ${ot.numero}`, (b) => {
                        const cible = b.ordresTravail.find((o) => o.id === ot.id);
                        if (cible) cible.securite[cle] = e.target.checked;
                      })
                    }
                  />
                ))}
              </div>
            </Carte>

            <Carte titre="Coûts" icone={<Coins className="size-4 text-slate-400" />}>
              <Definitions
                colonnes={1}
                items={[
                  { label: 'Main-d’œuvre interne', valeur: montant(coutMainOeuvre(ot)) },
                  { label: 'Pièces et consommables', valeur: montant(coutPieces(ot)) },
                  {
                    label: 'Prestation externe',
                    valeur: (
                      <div className="flex items-center gap-2">
                        <span>{montant(ot.coutPrestataire)}</span>
                        {!estTermine(ot) && ot.execution === 'prestataire' && (
                          <Saisie
                            type="number"
                            className="h-7 w-28 py-0 text-xs"
                            value={ot.coutPrestataire || ''}
                            placeholder="montant"
                            onChange={(e) =>
                              modifier(`Coût prestataire sur ${ot.numero}`, (b) => {
                                const cible = b.ordresTravail.find((o) => o.id === ot.id);
                                if (cible) cible.coutPrestataire = Number(e.target.value) || 0;
                              })
                            }
                          />
                        )}
                      </div>
                    ),
                  },
                  { label: 'Total', valeur: <strong className="text-base">{montant(coutTotal(ot))}</strong> },
                ]}
              />
            </Carte>

            {ouvert && (
              <Carte titre="Changer le statut">
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[ot.statut].map((s) => (
                    <Bouton
                      key={s}
                      taille="sm"
                      variante={s === 'annule' ? 'danger' : 'secondaire'}
                      onClick={() => {
                        if (s === 'realise') setModale('cloture');
                        else modifier(`${ot.numero} → ${STATUT_OT[s].libelle}`, (b) => changerStatutOT(b, ot.id, s, utilisateur.id));
                      }}
                    >
                      {STATUT_OT[s].libelle}
                    </Bouton>
                  ))}
                </div>
              </Carte>
            )}

            {ot.statut === 'cloture' && (
              <Carte titre="Validation">
                <Definitions
                  colonnes={1}
                  items={[
                    { label: 'Signature technicien', valeur: ot.signatureTechnicien ?? '—' },
                    { label: 'Signature demandeur', valeur: ot.signatureDemandeur ?? '—' },
                    { label: 'Validé par', valeur: <NomUtilisateur id={ot.validePar} /> },
                    { label: 'Date de validation', valeur: dateCourte(ot.dateValidation) },
                  ]}
                />
              </Carte>
            )}
          </div>
        </div>
      </CorpsPage>

      <ModaleTemps
        ouverte={modale === 'temps'}
        onFermer={() => setModale(null)}
        onValider={(technicienId, dureeMin, texte) => {
          modifier(`Saisie de ${dureeMin} min sur ${ot.numero}`, (b) =>
            ajouterTemps(b, ot.id, { technicienId, dureeMin, commentaire: texte }),
          );
          setModale(null);
        }}
      />

      <ModalePiece
        ouverte={modale === 'piece'}
        onFermer={() => setModale(null)}
        equipementId={ot.equipementId}
        onValider={(articleId, quantite) => {
          modifier(`Ajout d’une pièce sur ${ot.numero}`, (b) => ajouterPiece(b, ot.id, articleId, quantite));
          setModale(null);
        }}
      />

      <ModaleAffectation
        ouverte={modale === 'affecter'}
        onFermer={() => setModale(null)}
        technicienActuel={ot.technicienPrincipalId}
        datePlanifiee={ot.datePlanifiee}
        onValider={(technicienId, date) => {
          modifier(`Affectation de ${ot.numero}`, (b) => affecterOT(b, ot.id, technicienId || undefined, date));
          setModale(null);
        }}
      />

      <ModaleCloture
        ouverte={modale === 'cloture'}
        onFermer={() => setModale(null)}
        ot={ot}
        onValider={(donnees) => {
          muter(
            `Clôture de ${ot.numero}`,
            (b) => {
              const cible = b.ordresTravail.find((o) => o.id === ot.id);
              if (!cible) return;
              cible.diagnostic = donnees.diagnostic;
              cible.causePanne = donnees.causePanne;
              cible.actionsRealisees = donnees.actionsRealisees;
              cible.arretEquipementMin = donnees.arretMin;
              cible.conformite = donnees.conformite;
              cible.signatureTechnicien = donnees.signature;
              changerStatutOT(b, ot.id, donnees.cloturer ? 'cloture' : 'realise', utilisateur.id);
            },
            { action: 'cloture', entiteType: 'ordre_travail', entiteId: ot.id },
          );
          setModale(null);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function CarteOperations({
  ot,
  gammeId,
  onModifier,
}: {
  ot: OrdreTravail;
  gammeId: string;
  onModifier: (libelle: string, fn: (b: import('@/types/domain').BaseGMAO) => void) => void;
}) {
  const { index } = useGMAO();
  const gamme = index.gammes.get(gammeId);
  if (!gamme) return null;

  const verrouille = estTermine(ot);

  return (
    <Carte
      titre={`Gamme ${gamme.code} — ${gamme.libelle}`}
      sousTitre={`${gamme.operations.length} opérations · ${duree(gamme.dureeEstimeeMin)} estimées${
        gamme.referenceNormative ? ` · ${gamme.referenceNormative}` : ''
      }`}
      sansPadding
    >
      {gamme.consignesSecurite && (
        <div className="border-b border-slate-200 px-4 py-2.5">
          <Encart ton="attention" titre="Consignes de sécurité">
            {gamme.consignesSecurite}
          </Encart>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Opération</th>
            <th className="px-3 py-2 text-right">Attendu</th>
            <th className="px-3 py-2 text-right">Mesuré</th>
            <th className="px-3 py-2 text-center">Conforme</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {gamme.operations.map((op) => {
            const mesure = ot.mesures.find((m) => m.operationId === op.id);
            const horsTolerance =
              mesure?.valeur !== undefined &&
              ((op.toleranceMin !== undefined && mesure.valeur < op.toleranceMin) ||
                (op.toleranceMax !== undefined && mesure.valeur > op.toleranceMax));
            return (
              <tr key={op.id} className={horsTolerance ? 'bg-rose-50/50' : ''}>
                <td className="px-4 py-2">
                  <p className="text-slate-800">
                    {op.ordre}. {op.libelle}
                  </p>
                  <p className="text-xs text-slate-500">
                    {op.nature.replace(/_/g, ' ')} · {op.dureeMin} min
                    {op.obligatoire && ' · obligatoire'}
                  </p>
                </td>
                <td className="px-3 py-2 text-right text-xs text-slate-500 tabulaire">
                  {op.valeurAttendue !== undefined
                    ? `${op.valeurAttendue} ${op.unite ?? ''}${
                        op.toleranceMin !== undefined ? ` [${op.toleranceMin} – ${op.toleranceMax}]` : ''
                      }`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  {op.valeurAttendue !== undefined ? (
                    <Saisie
                      type="number"
                      step="any"
                      disabled={verrouille}
                      className="h-7 w-24 py-0 text-right text-xs"
                      value={mesure?.valeur ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        onModifier(`Relevé de mesure sur ${ot.numero}`, (b) => {
                          const cible = b.ordresTravail.find((o) => o.id === ot.id);
                          if (!cible) return;
                          const existante = cible.mesures.find((m) => m.operationId === op.id);
                          const conforme =
                            v === undefined
                              ? false
                              : (op.toleranceMin === undefined || v >= op.toleranceMin) &&
                                (op.toleranceMax === undefined || v <= op.toleranceMax);
                          if (existante) {
                            existante.valeur = v;
                            existante.conforme = conforme;
                          } else {
                            cible.mesures.push({ operationId: op.id, valeur: v, conforme });
                          }
                        });
                      }}
                    />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    disabled={verrouille}
                    checked={mesure?.conforme ?? false}
                    onChange={(e) =>
                      onModifier(`Validation d’une opération sur ${ot.numero}`, (b) => {
                        const cible = b.ordresTravail.find((o) => o.id === ot.id);
                        if (!cible) return;
                        const existante = cible.mesures.find((m) => m.operationId === op.id);
                        if (existante) existante.conforme = e.target.checked;
                        else cible.mesures.push({ operationId: op.id, conforme: e.target.checked });
                      })
                    }
                    className="size-4 rounded border-slate-300 text-marque-700 focus:ring-marque-500"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Carte>
  );
}

function ModaleTemps({
  ouverte,
  onFermer,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onValider: (technicienId: string, dureeMin: number, commentaire?: string) => void;
}) {
  const { base, utilisateur } = useGMAO();
  const [technicienId, setTechnicienId] = useState(utilisateur.id);
  const [heures, setHeures] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [texte, setTexte] = useState('');
  const techniciens = base.utilisateurs.filter((u) => u.actif && u.tauxHoraire > 0);

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Saisir du temps d’intervention"
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={heures * 60 + minutes <= 0}
            onClick={() => onValider(technicienId, heures * 60 + minutes, texte || undefined)}
          >
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Intervenant">
          <Liste
            value={technicienId}
            onChange={(e) => setTechnicienId(e.target.value)}
            options={techniciens.map((t) => ({
              valeur: t.id,
              libelle: `${t.prenom} ${t.nom} — ${montant(t.tauxHoraire, true)}/h`,
            }))}
          />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Heures">
            <Saisie type="number" min={0} value={heures} onChange={(e) => setHeures(Number(e.target.value))} />
          </Champ>
          <Champ label="Minutes">
            <Saisie type="number" min={0} max={59} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Champ>
        </div>
        <Champ label="Commentaire">
          <Saisie value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Diagnostic sur site, reprise en atelier…" />
        </Champ>
      </div>
    </Modale>
  );
}

function ModalePiece({
  ouverte,
  onFermer,
  equipementId,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  equipementId?: string;
  onValider: (articleId: string, quantite: number) => void;
}) {
  const { base } = useGMAO();
  const compatibles = equipementId
    ? base.articles.filter((a) => a.equipementsCompatibles.includes(equipementId))
    : [];
  const [articleId, setArticleId] = useState(compatibles[0]?.id ?? base.articles[0].id);
  const [quantite, setQuantite] = useState(1);
  const article = base.articles.find((a) => a.id === articleId);

  const liste = [...compatibles, ...base.articles.filter((a) => !compatibles.includes(a))];

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Ajouter une pièce à l’intervention"
      sousTitre="La sortie de stock sera enregistrée à la clôture de l’OT"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={quantite <= 0} onClick={() => onValider(articleId, quantite)}>
            Ajouter
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        {compatibles.length > 0 && (
          <p className="text-xs text-slate-500">
            {compatibles.length} article(s) référencé(s) comme compatibles avec cet équipement apparaissent en tête de
            liste.
          </p>
        )}
        <Champ label="Article">
          <Liste
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            options={liste.map((a) => ({
              valeur: a.id,
              libelle: `${a.code} — ${a.designation} (${a.stockActuel} ${a.unite})`,
            }))}
          />
        </Champ>
        <Champ
          label="Quantité"
          erreur={article && quantite > article.stockActuel ? `Stock insuffisant : ${article.stockActuel} ${article.unite} disponibles` : undefined}
          aide={article ? `${montant(article.prixMoyenPondere, true)} l’unité · emplacement ${article.emplacement}` : undefined}
        >
          <Saisie type="number" min={1} value={quantite} onChange={(e) => setQuantite(Number(e.target.value))} />
        </Champ>
      </div>
    </Modale>
  );
}

function ModaleAffectation({
  ouverte,
  onFermer,
  technicienActuel,
  datePlanifiee,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  technicienActuel?: string;
  datePlanifiee?: string;
  onValider: (technicienId: string, date: string) => void;
}) {
  const { base, index } = useGMAO();
  const [technicienId, setTechnicienId] = useState(technicienActuel ?? '');
  const [date, setDate] = useState(datePlanifiee ?? '');
  const techniciens = base.utilisateurs.filter((u) => u.actif && (u.role === 'technicien' || u.role.startsWith('responsable')));

  // Charge du technicien : nombre d'OT ouverts déjà affectés.
  const charge = (id: string) => base.ordresTravail.filter((o) => o.technicienPrincipalId === id && estOuvert(o)).length;

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Affecter l’intervention"
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" onClick={() => onValider(technicienId, date)}>
            Affecter
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Technicien" aide="Le nombre entre parenthèses est la charge d’OT déjà ouverts">
          <Liste
            value={technicienId}
            onChange={(e) => setTechnicienId(e.target.value)}
            vide="— non affecté —"
            options={techniciens.map((t) => ({
              valeur: t.id,
              libelle: `${t.prenom} ${t.nom} — ${index.equipes.get(t.equipeId ?? '')?.code ?? '—'} (${charge(t.id)} OT)`,
            }))}
          />
        </Champ>
        <Champ label="Date planifiée">
          <Saisie type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Champ>
      </div>
    </Modale>
  );
}

function ModaleCloture({
  ouverte,
  onFermer,
  ot,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  ot: OrdreTravail;
  onValider: (d: {
    diagnostic: string;
    causePanne: CausePanne;
    actionsRealisees: string;
    arretMin: number;
    conformite: OrdreTravail['conformite'];
    signature: string;
    cloturer: boolean;
  }) => void;
}) {
  const { utilisateur } = useGMAO();
  const [diagnostic, setDiagnostic] = useState(ot.diagnostic ?? '');
  const [causePanne, setCausePanne] = useState<CausePanne>(ot.causePanne ?? 'usure_normale');
  const [actions, setActions] = useState(ot.actionsRealisees ?? '');
  const [arretH, setArretH] = useState(Math.round((ot.arretEquipementMin || 0) / 60));
  const [conformite, setConformite] = useState<NonNullable<OrdreTravail['conformite']>>('conforme');
  const [cloturer, setCloturer] = useState(false);

  const piecesNonSorties = ot.pieces.filter((p) => !p.sortieValidee);

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Terminer l’intervention"
      sousTitre="Le compte rendu constitue la preuve de maintenance opposable en audit"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={!actions.trim()}
            onClick={() =>
              onValider({
                diagnostic,
                causePanne,
                actionsRealisees: actions,
                arretMin: arretH * 60,
                conformite,
                signature: `${utilisateur.prenom} ${utilisateur.nom}`,
                cloturer,
              })
            }
          >
            {cloturer ? 'Terminer et clôturer' : 'Marquer comme réalisé'}
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        {piecesNonSorties.length > 0 && (
          <Encart ton="info">
            {piecesNonSorties.length} pièce(s) déclarée(s) seront sorties du stock à la validation.
          </Encart>
        )}

        {ot.type === 'correctif' && (
          <>
            <Champ label="Diagnostic">
              <Zone rows={3} value={diagnostic} onChange={(e) => setDiagnostic(e.target.value)} placeholder="Nature exacte de la défaillance constatée…" />
            </Champ>
            <Champ label="Cause de la défaillance" aide="Alimente l’analyse des causes récurrentes et le plan d’action">
              <Liste
                value={causePanne}
                onChange={(e) => setCausePanne(e.target.value as CausePanne)}
                options={Object.entries(CAUSE_PANNE).map(([v, l]) => ({ valeur: v, libelle: l }))}
              />
            </Champ>
          </>
        )}

        <Champ label="Actions réalisées" obligatoire>
          <Zone rows={4} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Travaux effectués, pièces remplacées, essais de remise en service…" />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Immobilisation de l’équipement (heures)" aide="Alimente le calcul de disponibilité">
            <Saisie type="number" min={0} value={arretH} onChange={(e) => setArretH(Number(e.target.value))} />
          </Champ>
          <Champ label="Conclusion">
            <Liste
              value={conformite}
              onChange={(e) => setConformite(e.target.value as NonNullable<OrdreTravail['conformite']>)}
              options={[
                { valeur: 'conforme', libelle: 'Conforme — remis en service' },
                { valeur: 'conforme_avec_reserves', libelle: 'Conforme avec réserves' },
                { valeur: 'non_conforme', libelle: 'Non conforme — maintien hors service' },
              ]}
            />
          </Champ>
        </div>

        <CaseACocher
          label="Clôturer immédiatement l’ordre de travail"
          description="Sans cette validation, l’OT reste au statut « réalisé » en attente du visa du responsable."
          checked={cloturer}
          onChange={(e) => setCloturer(e.target.checked)}
        />

        <p className="text-xs text-slate-500">
          Signature : {utilisateur.prenom} {utilisateur.nom} — {dateCourte(new Date())}
        </p>
      </div>
    </Modale>
  );
}
