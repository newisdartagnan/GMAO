import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Biohazard,
  BookOpen,
  Boxes,
  ClipboardList,
  Coins,
  FileText,
  Gauge,
  History,
  Info,
  Plus,
  Printer,
  Radiation,
  ShieldCheck,
  Wind,
  Wrench,
} from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Onglets } from '@/components/ui/Onglets';
import { Badge } from '@/components/ui/Badge';
import { Bouton } from '@/components/ui/Bouton';
import { Definitions, Chronologie, Encart, Vide } from '@/components/ui/Info';
import { Indicateur, Jauge } from '@/components/ui/Indicateur';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Modale } from '@/components/ui/Modale';
import { Champ, Liste, Saisie, Zone } from '@/components/ui/Champs';
import { EtiquetteInventaire } from '@/components/shared/CodeBarres';
import {
  BadgeClasseDM,
  BadgeConformite,
  BadgeCriticite,
  BadgePriorite,
  BadgeStatutEquipement,
  BadgeStatutOT,
  BadgeTypeMaintenance,
} from '@/components/shared/Etiquettes';
import { Localisation, NomFournisseur, NomUtilisateur } from '@/components/shared/Liens';
import { ListeAlertes } from '@/components/shared/Alertes';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { alertesDeLEquipement } from '@gmao/partage';
import {
  coutTotal,
  estOuvert,
  fiabilite,
  tauxRenouvellement,
  tauxVetuste,
  valeurNetteComptable,
} from '@gmao/partage';
import { prochaineEcheanceControle, prochaineEcheanceGamme, seuilCompteurSuivant } from '@gmao/partage';
import { aujourdHui, dateCourte, dateHeure, echeanceRelative, iso, joursRestants, libellePeriodicite } from '@gmao/partage';
import { duree, heures, montant, nombre, pourcent } from '@gmao/partage';
import { CAUSE_PANNE, CRITICITE, DOMAINE, REFERENTIEL, STATUT_EQUIPEMENT } from '@gmao/partage';
import type { OrdreTravail, StatutEquipement } from '@gmao/partage';

export function PageEquipementDetail() {
  const { id } = useParams();
  const { base, index, alertes, commander, configuration } = useGMAO();
  const naviguer = useNavigate();
  const [onglet, setOnglet] = useState('synthese');
  const [modale, setModale] = useState<'intervention' | 'deplacer' | 'compteur' | 'statut' | 'etiquette' | null>(null);

  const equipement = id ? index.equipements.get(id) : undefined;

  const donnees = useMemo(() => {
    if (!equipement) return null;
    const ots = base.ordresTravail
      .filter((o) => o.equipementId === equipement.id)
      .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
    const ouverts = ots.filter(estOuvert);
    const fiab = fiabilite([equipement], ots, 365);
    const coutCumule = ots.reduce((s, o) => s + coutTotal(o), 0);
    const gammes = base.gammes.filter((g) => g.actif && g.equipementIds.includes(equipement.id));
    const controles = base.controles.filter((c) => c.actif && c.familleIds.includes(equipement.familleId));
    const articles = base.articles.filter((a) => a.equipementsCompatibles.includes(equipement.id));
    const documents = base.documents.filter((d) => d.entiteType === 'equipement' && d.entiteId === equipement.id);
    const mouvements = base.mouvementsEquipement.filter((m) => m.equipementId === equipement.id);
    const vigilances = base.vigilances.filter((v) => v.equipementId === equipement.id);
    const rappels = base.rappels.filter((r) => r.equipementIds.includes(equipement.id));
    const capteurs = base.capteurs.filter((c) => c.equipementId === equipement.id);
    const contrat = equipement.contratId ? index.contrats.get(equipement.contratId) : undefined;
    const visites = base.visitesControle.filter((v) => v.equipementId === equipement.id);
    const enfants = base.equipements.filter((e) => e.parentId === equipement.id);
    return {
      ots, ouverts, fiab, coutCumule, gammes, controles, articles, documents,
      mouvements, vigilances, rappels, capteurs, contrat, visites, enfants,
    };
  }, [base, index, equipement]);

  if (!equipement || !donnees) {
    return (
      <CorpsPage>
        <Vide
          titre="Équipement introuvable"
          description="La fiche demandée n’existe pas ou a été supprimée de l’inventaire."
          icone={<Gauge className="size-8" />}
          action={<Bouton onClick={() => naviguer('/equipements')}>Retour au parc</Bouton>}
        />
      </CorpsPage>
    );
  }

  const alertesEq = alertesDeLEquipement(alertes, equipement.id);
  const vetuste = tauxVetuste(equipement);
  const ratioRenouvellement = tauxRenouvellement(base, equipement.id) ?? 0;
  const rappelsOuverts = donnees.rappels.filter(
    (r) => r.statut !== 'solde' && !r.equipementsTraites.includes(equipement.id),
  );

  const onglets = [
    { cle: 'synthese', libelle: 'Synthèse', icone: <Info className="size-4" /> },
    { cle: 'interventions', libelle: 'Interventions', compteur: donnees.ots.length, icone: <ClipboardList className="size-4" /> },
    { cle: 'programme', libelle: 'Maintenance programmée', compteur: donnees.gammes.length + donnees.controles.length, icone: <Wrench className="size-4" /> },
    { cle: 'couts', libelle: 'Coûts & renouvellement', icone: <Coins className="size-4" /> },
    { cle: 'pieces', libelle: 'Pièces', compteur: donnees.articles.length, icone: <Boxes className="size-4" /> },
    { cle: 'documents', libelle: 'Documents', compteur: donnees.documents.length, icone: <FileText className="size-4" /> },
    { cle: 'tracabilite', libelle: 'Traçabilité', icone: <History className="size-4" /> },
  ];

  return (
    <>
      <EnTetePage
        titre={`${equipement.code} — ${equipement.designation}`}
        description={`${equipement.marque} ${equipement.modele} · n° de série ${equipement.numeroSerie}`}
        retour={{ to: '/equipements', libelle: 'Parc d’équipements' }}
        actions={
          <>
            <Bouton onClick={() => setModale('etiquette')}>
              <Printer className="size-4" /> Étiquette
            </Bouton>
            <Bouton onClick={() => setModale('statut')}>Changer le statut</Bouton>
            <Bouton variante="primaire" onClick={() => setModale('intervention')}>
              <Plus className="size-4" /> Créer un OT
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeStatutEquipement statut={equipement.statut} />
          <BadgeCriticite niveau={equipement.criticite} />
          <BadgeClasseDM classe={equipement.classeDM} />
          <Badge ton="neutre">{DOMAINE[equipement.domaine].libelle}</Badge>
          {equipement.risqueInfectieux && (
            <Badge ton="attention" titre="Désinfection préalable obligatoire avant intervention">
              <Biohazard className="size-3" /> Risque infectieux
            </Badge>
          )}
          {equipement.sourceRadioactive && (
            <Badge ton="danger" titre="Port du dosimètre obligatoire">
              <Radiation className="size-3" /> Rayonnements ionisants
            </Badge>
          )}
          {equipement.gazMedicaux && (
            <Badge ton="violet" titre="Interdiction des corps gras au contact de l’oxygène">
              <Wind className="size-3" /> Gaz médicaux
            </Badge>
          )}
          {equipement.finGarantie && (joursRestants(equipement.finGarantie) ?? -1) >= 0 && (
            <Badge ton="succes">Sous garantie jusqu’au {dateCourte(equipement.finGarantie)}</Badge>
          )}
          {donnees.contrat && <Badge ton="info">Contrat {donnees.contrat.numero}</Badge>}
        </div>

        {rappelsOuverts.length > 0 && (
          <Encart ton="danger" titre="Action corrective de sécurité en attente" icone={<AlertTriangle className="size-4" />}>
            {rappelsOuverts.map((r) => (
              <p key={r.id}>
                <strong>{r.reference}</strong> — {r.objet}. Échéance {dateCourte(r.dateEcheance)} (
                {echeanceRelative(r.dateEcheance)}).{' '}
                <Link to="/vigilance" className="underline">
                  Traiter
                </Link>
              </p>
            ))}
          </Encart>
        )}

        {alertesEq.length > 0 && (
          <Carte titre="Alertes portant sur cet équipement" sansPadding>
            <ListeAlertes alertes={alertesEq} compact />
          </Carte>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Indicateur
            libelle="Interventions"
            valeur={nombre(donnees.ots.length, 0)}
            detail={`${donnees.ouverts.length} en cours`}
            accent={donnees.ouverts.length ? 'attention' : 'neutre'}
          />
          <Indicateur libelle="MTBF" valeur={heures(donnees.fiab.mtbf ?? 0)} detail="12 derniers mois" />
          <Indicateur libelle="MTTR" valeur={heures(donnees.fiab.mttr ?? 0)} detail="réparation moyenne" />
          <Indicateur
            libelle="Disponibilité"
            valeur={pourcent(donnees.fiab.disponibilite ?? 100, 2)}
            detail={`objectif ${equipement.objectifDisponibilite} %`}
            accent={(donnees.fiab.disponibilite ?? 100) >= equipement.objectifDisponibilite ? 'positif' : 'negatif'}
          />
          <Indicateur
            libelle="Coût cumulé"
            valeur={montant(donnees.coutCumule)}
            detail={`${pourcent(ratioRenouvellement, 0)} de la valeur d’achat`}
            accent={ratioRenouvellement > 60 ? 'negatif' : ratioRenouvellement > 35 ? 'attention' : 'neutre'}
          />
        </div>

        <Carte sansPadding>
          <div className="px-4">
            <Onglets onglets={onglets} actif={onglet} onChange={setOnglet} />
          </div>

          <div className="p-4">
            {onglet === 'synthese' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Identification</h3>
                    <Definitions
                      items={[
                        { label: 'Numéro d’inventaire', valeur: <span className="font-mono">{equipement.code}</span> },
                        { label: 'Numéro de série', valeur: <span className="font-mono">{equipement.numeroSerie}</span> },
                        { label: 'Famille', valeur: index.familles.get(equipement.familleId)?.nom },
                        { label: 'Marquage CE', valeur: equipement.marquageCE ? `Oui${equipement.numeroCE ? ` — ${equipement.numeroCE}` : ''}` : 'Non applicable' },
                        {
                          label: 'Fabricant',
                          valeur: equipement.fabricantId ? (
                            <NomFournisseur id={equipement.fabricantId} />
                          ) : (
                            <span title="Aucun représentant local référencé pour cette marque">
                              {equipement.marque}
                            </span>
                          ),
                        },
                        { label: 'Fournisseur', valeur: <NomFournisseur id={equipement.fournisseurId} /> },
                        { label: 'Soumis à matériovigilance', valeur: equipement.soumisVigilance ? 'Oui' : 'Non' },
                        { label: 'Alimentation secourue', valeur: equipement.alimentationSecourue ? 'Oui (ondulé / groupe)' : 'Non' },
                      ]}
                    />
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Implantation</h3>
                    <Definitions
                      colonnes={1}
                      items={[
                        { label: 'Localisation', valeur: <Localisation localId={equipement.localId} /> },
                        {
                          label: 'Zone à risque',
                          valeur: {
                            zone1_bas: 'Zone 1 — risque faible',
                            zone2_moyen: 'Zone 2 — risque modéré',
                            zone3_haut: 'Zone 3 — risque élevé',
                            zone4_tres_haut: 'Zone 4 — risque très élevé (bloc, réanimation)',
                          }[index.locaux.get(equipement.localId)?.zoneRisque ?? 'zone1_bas'],
                        },
                        {
                          label: 'Équipement de secours désigné',
                          valeur: equipement.equipementSecoursId ? (
                            <Link to={`/equipements/${equipement.equipementSecoursId}`} className="lien">
                              {index.equipements.get(equipement.equipementSecoursId)?.code} —{' '}
                              {index.equipements.get(equipement.equipementSecoursId)?.designation}
                            </Link>
                          ) : (
                            <span className="text-amber-700">Aucun — à désigner pour un équipement de criticité {equipement.criticite}</span>
                          ),
                        },
                      ]}
                    />
                    <Bouton taille="sm" className="mt-3" onClick={() => setModale('deplacer')}>
                      Déplacer l’équipement
                    </Bouton>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-800">Cycle de vie</h3>
                    <Definitions
                      items={[
                        { label: 'Date d’acquisition', valeur: dateCourte(equipement.dateAcquisition) },
                        { label: 'Mise en service', valeur: dateCourte(equipement.dateMiseEnService) },
                        { label: 'Valeur d’achat', valeur: montant(equipement.valeurAchat) },
                        { label: 'Valeur nette comptable', valeur: montant(valeurNetteComptable(equipement)) },
                        { label: 'Durée d’amortissement', valeur: `${equipement.dureeAmortissementAns} ans` },
                        {
                          label: 'Fin de garantie',
                          valeur: equipement.finGarantie
                            ? `${dateCourte(equipement.finGarantie)} (${echeanceRelative(equipement.finGarantie)})`
                            : 'Non renseignée',
                        },
                      ]}
                    />
                    <div className="mt-4">
                      <Jauge valeur={Math.min(100, vetuste)} cible={100} inverse libelle="Amortissement consommé" />
                      {vetuste >= 100 && (
                        <p className="mt-2 text-xs text-amber-700">
                          L’équipement a dépassé sa durée d’amortissement de{' '}
                          {nombre((vetuste - 100) * equipement.dureeAmortissementAns / 100, 1)} an(s). Il reste exploitable
                          mais doit figurer au plan pluriannuel de renouvellement.
                        </p>
                      )}
                    </div>
                  </div>

                  {equipement.compteurs.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-800">Compteurs d’usage</h3>
                      {equipement.compteurs.map((c) => (
                        <div key={c.type} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-slate-800 tabulaire">
                              {nombre(c.valeur, 0)} {c.unite}
                            </p>
                            <p className="text-xs text-slate-500">
                              {c.type.replace(/_/g, ' ')} — relevé le {dateCourte(c.dateReleve)}
                            </p>
                          </div>
                          <Bouton taille="sm" onClick={() => setModale('compteur')}>
                            Relever
                          </Bouton>
                        </div>
                      ))}
                    </div>
                  )}

                  {equipement.notes && (
                    <Encart ton="info" titre="Observations">
                      {equipement.notes}
                    </Encart>
                  )}
                </div>
              </div>
            )}

            {onglet === 'interventions' && (
              <TableauInterventions ots={donnees.ots} />
            )}

            {onglet === 'programme' && (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Gammes de maintenance préventive</h3>
                  {donnees.gammes.length === 0 ? (
                    <Encart ton="attention">
                      Aucune gamme de maintenance préventive n’est rattachée à cet équipement. Pour un dispositif de
                      criticité {CRITICITE[equipement.criticite].libelle.toLowerCase()}, c’est un écart à corriger.
                    </Encart>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {donnees.gammes.map((g) => {
                        const ech = prochaineEcheanceGamme(base, g.id, equipement.id);
                        const j = joursRestants(ech);
                        const seuil = seuilCompteurSuivant(base, g.id, equipement.id);
                        return (
                          <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">{g.libelle}</p>
                              <p className="text-xs text-slate-500">
                                {g.code} ·{' '}
                                {g.modeDeclenchement === 'compteur' && seuil
                                  ? `tous les ${nombre(g.compteurSeuil ?? 0, 0)} ${g.compteurType} — prochain seuil ${nombre(seuil, 0)}`
                                  : libellePeriodicite(g.periodiciteValeur, g.periodiciteUnite)}{' '}
                                · {g.operations.length} opérations · {duree(g.dureeEstimeeMin)} ·{' '}
                                {g.execution === 'interne' ? 'réalisée en interne' : 'confiée au prestataire'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`text-sm tabulaire ${j !== null && j < 0 ? 'font-medium text-rose-600' : 'text-slate-700'}`}>
                                {dateCourte(ech)}
                              </p>
                              <p className="text-xs text-slate-500">{echeanceRelative(ech)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Obligations réglementaires applicables</h3>
                  {donnees.controles.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune obligation de contrôle périodique pour cette famille.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {donnees.controles.map((c) => {
                        const ech = prochaineEcheanceControle(base, c.id, equipement.id);
                        const j = joursRestants(ech);
                        const derniere = donnees.visites
                          .filter((v) => v.controleId === c.id)
                          .sort((a, b) => a.dateVisite.localeCompare(b.dateVisite))
                          .at(-1);
                        return (
                          <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                {c.libelle}
                                {c.bloquant && <Badge ton="danger" compact>bloquant</Badge>}
                              </p>
                              <p className="text-xs text-slate-500">
                                {REFERENTIEL[c.referentiel]} · {libellePeriodicite(c.periodiciteValeur, c.periodiciteUnite)}
                                {derniere && ` · dernière visite ${dateCourte(derniere.dateVisite)}`}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {derniere && <BadgeConformite conformite={derniere.verdict} />}
                              <p className={`mt-0.5 text-xs tabulaire ${j !== null && j < 0 ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                                prochaine échéance {dateCourte(ech)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {donnees.capteurs.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">Capteurs de surveillance</h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {donnees.capteurs.map((c) => {
                        const dernier = base.releves
                          .filter((r) => r.capteurId === c.id)
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .at(-1);
                        return (
                          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-800">
                                {c.code} — {c.type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs text-slate-500">
                                seuils : {c.seuilBasCritique ?? '—'} / {c.seuilBasAlerte ?? '—'} …{' '}
                                {c.seuilHautAlerte ?? '—'} / {c.seuilHautCritique ?? '—'} {c.unite}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-medium text-slate-800 tabulaire">
                              {dernier ? `${dernier.valeur} ${c.unite}` : '—'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                    <Link to="/predictif" className="mt-2 inline-block text-xs text-marque-700 hover:underline">
                      Voir les courbes de tendance
                    </Link>
                  </section>
                )}
              </div>
            )}

            {onglet === 'couts' && <OngletCouts equipementId={equipement.id} />}

            {onglet === 'pieces' && (
              <>
                {donnees.articles.length === 0 ? (
                  <Vide
                    titre="Aucune pièce détachée référencée"
                    description="Rattacher des articles à cet équipement permet d’anticiper les ruptures qui l’immobiliseraient."
                    icone={<Boxes className="size-8" />}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {donnees.articles.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800">
                            <span className="font-mono text-xs text-slate-500">{a.code}</span> {a.designation}
                          </p>
                          <p className="text-xs text-slate-500">
                            {a.emplacement} · délai d’approvisionnement {a.delaiApproJours} j ·{' '}
                            {montant(a.prixMoyenPondere, true)} / {a.unite}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`text-sm font-medium tabulaire ${
                              a.stockActuel === 0 ? 'text-rose-600' : a.stockActuel <= a.stockMin ? 'text-amber-600' : 'text-slate-800'
                            }`}
                          >
                            {a.stockActuel} {a.unite}
                          </p>
                          <p className="text-xs text-slate-500">min. {a.stockMin}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {onglet === 'documents' && (
              <>
                {donnees.documents.length === 0 ? (
                  <Vide
                    titre="Aucun document"
                    description="Notice d’utilisation, manuel technique et certificat CE devraient être archivés ici : c’est ce que demande un auditeur."
                    icone={<BookOpen className="size-8" />}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {donnees.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                        <FileText className="size-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">{d.nom}</p>
                          <p className="text-xs text-slate-500">
                            {d.categorie.replace(/_/g, ' ')} · {d.version} · ajouté le {dateCourte(d.dateAjout)} ·{' '}
                            {nombre(d.tailleKo / 1024, 1)} Mo
                          </p>
                        </div>
                        {d.opposable && <Badge ton="info" compact>opposable</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {onglet === 'tracabilite' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Mouvements et événements</h3>
                  <Chronologie
                    evenements={([
                      {
                        id: 'mes',
                        date: dateCourte(equipement.dateMiseEnService),
                        titre: 'Mise en service',
                        detail: `Acquis le ${dateCourte(equipement.dateAcquisition)} pour ${montant(equipement.valeurAchat)}`,
                        ton: 'marque',
                      },
                      ...donnees.mouvements.map((m) => ({
                        id: m.id,
                        date: dateCourte(m.date),
                        titre: 'Changement d’implantation',
                        detail: (
                          <>
                            {m.motif} — vers {index.locaux.get(m.localCibleId)?.nom} par <NomUtilisateur id={m.utilisateurId} />
                          </>
                        ),
                      })),
                      ...donnees.vigilances.map((v) => ({
                        id: v.id,
                        date: dateCourte(v.dateEvenement),
                        titre: `Matériovigilance ${v.numero}`,
                        detail: v.description,
                        ton: 'danger' as const,
                      })),
                      ...donnees.ots
                        .filter((o) => o.statut === 'cloture')
                        .slice(0, 12)
                        .map((o) => ({
                          id: o.id,
                          date: dateCourte(o.dateCloture),
                          titre: (
                            <Link to={`/ordres-travail/${o.id}`} className="lien">
                              {o.numero} — {o.objet}
                            </Link>
                          ),
                          detail: o.actionsRealisees,
                          ton: o.type === 'correctif' ? ('neutre' as const) : ('succes' as const),
                        })),
                    ] as Parameters<typeof Chronologie>[0]['evenements']).sort((a, b) =>
                      b.date.split('/').reverse().join('').localeCompare(a.date.split('/').reverse().join('')),
                    )}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Écritures dans la GMAO</h3>
                  <ul className="space-y-2 text-sm">
                    {base.audit
                      .filter((a) => a.entiteId === equipement.id)
                      .slice(0, 20)
                      .map((a) => (
                        <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-slate-800">{a.libelle}</p>
                          <p className="text-xs text-slate-500">
                            {dateHeure(a.date)} — <NomUtilisateur id={a.utilisateurId} />
                          </p>
                        </li>
                      ))}
                    {!base.audit.some((a) => a.entiteId === equipement.id) && (
                      <li className="text-sm text-slate-500">
                        Aucune écriture enregistrée depuis l’initialisation de la base.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </Carte>
      </CorpsPage>

      {/* --- Modales --- */}
      <ModaleCreationOT
        ouverte={modale === 'intervention'}
        onFermer={() => setModale(null)}
        equipementId={equipement.id}
      />

      <ModaleDeplacement
        ouverte={modale === 'deplacer'}
        onFermer={() => setModale(null)}
        onValider={async (localId, motif) => {
          await commander(() => api.deplacerEquipement(equipement.id, localId, motif));
          setModale(null);
        }}
      />

      {equipement.compteurs.length > 0 && (
        <ModaleCompteur
          ouverte={modale === 'compteur'}
          onFermer={() => setModale(null)}
          valeurActuelle={equipement.compteurs[0].valeur}
          unite={equipement.compteurs[0].unite}
          onValider={async (valeur) => {
            await commander(() => api.releverCompteur(equipement.id, valeur));
            setModale(null);
          }}
        />
      )}

      <ModaleStatut
        ouverte={modale === 'statut'}
        onFermer={() => setModale(null)}
        statutActuel={equipement.statut}
        onValider={async (statut) => {
          await commander(() => api.changerStatutEquipement(equipement.id, statut));
          setModale(null);
        }}
      />

      <Modale
        ouverte={modale === 'etiquette'}
        onFermer={() => setModale(null)}
        titre="Étiquette d’inventaire"
        sousTitre="À coller sur l’équipement — le code-barres est lisible par les douchettes du magasin"
        pied={
          <>
            <Bouton onClick={() => setModale(null)}>Fermer</Bouton>
            <Bouton variante="primaire" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimer
            </Bouton>
          </>
        }
      >
        <div className="flex justify-center">
          <EtiquetteInventaire
            code={equipement.code}
            designation={equipement.designation}
            service={index.services.get(equipement.serviceId)?.nom ?? ''}
            criticite={CRITICITE[equipement.criticite].libelle.toUpperCase()}
            formulaire={configuration.formulaireExterne}
          />
        </div>
      </Modale>
    </>
  );
}

/* ------------------------------------------------------------------ */

function TableauInterventions({ ots }: { ots: OrdreTravail[] }) {
  const naviguer = useNavigate();
  const colonnes: Colonne<OrdreTravail>[] = [
    { cle: 'numero', entete: 'N°', largeur: '130px', tri: (o) => o.numero, rendu: (o) => <span className="font-mono text-xs">{o.numero}</span> },
    { cle: 'date', entete: 'Créé le', largeur: '110px', tri: (o) => o.dateCreation, rendu: (o) => dateCourte(o.dateCreation) },
    { cle: 'type', entete: 'Type', largeur: '130px', tri: (o) => o.type, rendu: (o) => <BadgeTypeMaintenance type={o.type} compact /> },
    { cle: 'objet', entete: 'Objet', tri: (o) => o.objet, rendu: (o) => <span className="line-clamp-1">{o.objet}</span> },
    { cle: 'cause', entete: 'Cause', secondaire: true, tri: (o) => o.causePanne ?? '', rendu: (o) => (o.causePanne ? CAUSE_PANNE[o.causePanne] : '—') },
    { cle: 'priorite', entete: 'Priorité', largeur: '90px', tri: (o) => o.priorite, rendu: (o) => <BadgePriorite priorite={o.priorite} compact /> },
    { cle: 'statut', entete: 'Statut', largeur: '140px', tri: (o) => o.statut, rendu: (o) => <BadgeStatutOT statut={o.statut} /> },
    { cle: 'arret', entete: 'Immobilisation', largeur: '120px', aDroite: true, secondaire: true, tri: (o) => o.arretEquipementMin, rendu: (o) => duree(o.arretEquipementMin) },
    { cle: 'cout', entete: 'Coût', largeur: '110px', aDroite: true, tri: (o) => coutTotal(o), export: (o) => Math.round(coutTotal(o)), rendu: (o) => montant(coutTotal(o)) },
  ];
  return (
    <Tableau
      lignes={ots}
      colonnes={colonnes}
      cleLigne={(o) => o.id}
      onClicLigne={(o) => naviguer(`/ordres-travail/${o.id}`)}
      triInitial={{ cle: 'date', sens: 'desc' }}
      parPage={15}
      nomExport="historique-interventions"
      vide="Aucune intervention enregistrée sur cet équipement."
    />
  );
}

function OngletCouts({ equipementId }: { equipementId: string }) {
  const { base, index } = useGMAO();
  const eq = index.equipements.get(equipementId)!;
  const ots = base.ordresTravail.filter((o) => o.equipementId === equipementId);

  const parType = ['correctif', 'preventif', 'reglementaire', 'metrologie', 'predictif'].map((t) => ({
    type: t,
    total: ots.filter((o) => o.type === t).reduce((s, o) => s + coutTotal(o), 0),
    nb: ots.filter((o) => o.type === t).length,
  }));

  const cumule = ots.reduce((s, o) => s + coutTotal(o), 0);
  const mainOeuvre = ots.reduce((s, o) => s + o.temps.reduce((x, t) => x + (t.dureeMin / 60) * t.tauxHoraire, 0), 0);
  const pieces = ots.reduce((s, o) => s + o.pieces.reduce((x, p) => x + p.quantite * p.prixUnitaire, 0), 0);
  const prestataire = ots.reduce((s, o) => s + o.coutPrestataire, 0);
  const ratio = eq.valeurAchat ? (cumule / eq.valeurAchat) * 100 : 0;
  const contrat = eq.contratId ? index.contrats.get(eq.contratId) : undefined;
  const partContrat = contrat ? contrat.montantAnnuel / Math.max(1, contrat.equipementIds.length) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Definitions
          items={[
            { label: 'Coût cumulé de maintenance', valeur: <strong>{montant(cumule)}</strong> },
            { label: 'dont main-d’œuvre interne', valeur: montant(mainOeuvre) },
            { label: 'dont pièces détachées', valeur: montant(pieces) },
            { label: 'dont prestations externes', valeur: montant(prestataire) },
            { label: 'Quote-part de contrat annuel', valeur: contrat ? montant(partContrat) : 'Hors contrat' },
            { label: 'Valeur d’achat', valeur: montant(eq.valeurAchat) },
          ]}
        />
        <div>
          <Jauge valeur={Math.min(100, ratio)} cible={60} inverse libelle="Coût cumulé rapporté à la valeur d’achat" />
          <p className="mt-2 text-xs text-slate-600">
            {ratio > 60
              ? 'Au-delà de 60 %, le renouvellement devient généralement plus économique que la poursuite des réparations. À inscrire au plan d’investissement.'
              : ratio > 35
                ? 'Le coût de maintenance devient significatif : à surveiller lors du prochain arbitrage budgétaire.'
                : 'Le coût de maintenance reste proportionné à la valeur du bien.'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Répartition par type d’intervention</h3>
        <ul className="space-y-2">
          {parType
            .filter((p) => p.nb > 0)
            .map((p) => (
              <li key={p.type}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-700">
                    <BadgeTypeMaintenance type={p.type as OrdreTravail['type']} compact /> <span className="ml-1 text-xs text-slate-500">{p.nb} OT</span>
                  </span>
                  <span className="tabulaire font-medium text-slate-800">{montant(p.total)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-marque-600" style={{ width: `${cumule ? (p.total / cumule) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modales                                                             */
/* ------------------------------------------------------------------ */

export function ModaleCreationOT({
  ouverte,
  onFermer,
  equipementId,
  demandeId,
  objetInitial,
  descriptionInitiale,
  prioriteInitiale,
}: {
  ouverte: boolean;
  onFermer: () => void;
  equipementId?: string;
  demandeId?: string;
  objetInitial?: string;
  descriptionInitiale?: string;
  prioriteInitiale?: OrdreTravail['priorite'];
}) {
  const { base, index, commander } = useGMAO();
  const naviguer = useNavigate();
  const eq = equipementId ? index.equipements.get(equipementId) : undefined;

  const [f, setF] = useState({
    type: 'correctif' as OrdreTravail['type'],
    objet: objetInitial ?? '',
    description: descriptionInitiale ?? '',
    priorite: prioriteInitiale ?? (eq?.criticite === 1 ? 'P1' : 'P3') as OrdreTravail['priorite'],
    datePlanifiee: iso(aujourdHui()),
    technicienId: '',
    execution: 'interne' as 'interne' | 'prestataire',
    prestataireId: '',
  });

  const techniciens = base.utilisateurs.filter((u) => u.actif && (u.role === 'technicien' || u.role.startsWith('responsable')));

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Créer un ordre de travail"
      sousTitre={eq ? `${eq.code} — ${eq.designation}` : undefined}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="primaire"
            disabled={!f.objet.trim()}
            onClick={async () => {
              const ot = await commander(() =>
                api.creerOT({
                  type: f.type,
                  objet: f.objet,
                  description: f.description,
                  equipementId,
                  priorite: f.priorite,
                  datePlanifiee: f.datePlanifiee,
                  technicienPrincipalId: f.technicienId || undefined,
                  execution: f.execution,
                  prestataireId: f.execution === 'prestataire' ? f.prestataireId || undefined : undefined,
                  demandeId,
                }),
              );
              onFermer();
              naviguer(`/ordres-travail/${ot.id}`);
            }}
          >
            Créer l’OT
          </Bouton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Type d’intervention">
          <Liste
            value={f.type}
            onChange={(e) => setF((x) => ({ ...x, type: e.target.value as OrdreTravail['type'] }))}
            options={[
              { valeur: 'correctif', libelle: 'Correctif — remise en état' },
              { valeur: 'preventif', libelle: 'Préventif' },
              { valeur: 'reglementaire', libelle: 'Contrôle réglementaire' },
              { valeur: 'metrologie', libelle: 'Métrologie / étalonnage' },
              { valeur: 'amelioration', libelle: 'Amélioration' },
              { valeur: 'installation', libelle: 'Installation / mise en service' },
            ]}
          />
        </Champ>
        <Champ label="Priorité" aide="Détermine le délai contractuel de résolution">
          <Liste
            value={f.priorite}
            onChange={(e) => setF((x) => ({ ...x, priorite: e.target.value as OrdreTravail['priorite'] }))}
            options={[
              { valeur: 'P1', libelle: 'P1 — vitale (4 h)' },
              { valeur: 'P2', libelle: 'P2 — urgente (24 h)' },
              { valeur: 'P3', libelle: 'P3 — normale (72 h)' },
              { valeur: 'P4', libelle: 'P4 — planifiée (14 j)' },
            ]}
          />
        </Champ>
        <Champ label="Objet" obligatoire className="sm:col-span-2">
          <Saisie value={f.objet} onChange={(e) => setF((x) => ({ ...x, objet: e.target.value }))} placeholder="Panne d’alimentation sur le respirateur du box 3" />
        </Champ>
        <Champ label="Description" className="sm:col-span-2">
          <Zone rows={4} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />
        </Champ>
        <Champ label="Date planifiée">
          <Saisie type="date" value={f.datePlanifiee} onChange={(e) => setF((x) => ({ ...x, datePlanifiee: e.target.value }))} />
        </Champ>
        <Champ label="Exécution">
          <Liste
            value={f.execution}
            onChange={(e) => setF((x) => ({ ...x, execution: e.target.value as 'interne' | 'prestataire' }))}
            options={[
              { valeur: 'interne', libelle: 'Équipe interne' },
              { valeur: 'prestataire', libelle: 'Prestataire externe' },
            ]}
          />
        </Champ>
        {f.execution === 'interne' ? (
          <Champ label="Technicien affecté" className="sm:col-span-2">
            <Liste
              value={f.technicienId}
              onChange={(e) => setF((x) => ({ ...x, technicienId: e.target.value }))}
              vide="— à affecter plus tard —"
              options={techniciens.map((t) => ({
                valeur: t.id,
                libelle: `${t.prenom} ${t.nom} — ${index.equipes.get(t.equipeId ?? '')?.nom ?? 'sans équipe'}`,
              }))}
            />
          </Champ>
        ) : (
          <Champ label="Prestataire" className="sm:col-span-2">
            <Liste
              value={f.prestataireId}
              onChange={(e) => setF((x) => ({ ...x, prestataireId: e.target.value }))}
              vide="— à désigner —"
              options={base.fournisseurs
                .filter((x) => x.types.includes('prestataire_maintenance'))
                .map((x) => ({ valeur: x.id, libelle: x.raisonSociale }))}
            />
          </Champ>
        )}
      </div>
    </Modale>
  );
}

function ModaleDeplacement({
  ouverte,
  onFermer,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onValider: (localId: string, motif: string) => void;
}) {
  const { base } = useGMAO();
  const [localId, setLocalId] = useState(base.locaux[0].id);
  const [motif, setMotif] = useState('');

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Déplacer l’équipement"
      sousTitre="Le mouvement est tracé : c’est ce qui permet de retrouver un dispositif lors d’un rappel fabricant"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={!motif.trim()} onClick={() => onValider(localId, motif)}>
            Enregistrer le mouvement
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Nouvelle implantation">
          <Liste
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            options={base.locaux.map((l) => ({
              valeur: l.id,
              libelle: `${base.services.find((s) => s.id === l.serviceId)?.nom} — ${l.nom} (${l.code})`,
            }))}
          />
        </Champ>
        <Champ label="Motif" obligatoire>
          <Saisie value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Réaffectation au service de réanimation" />
        </Champ>
      </div>
    </Modale>
  );
}

function ModaleCompteur({
  ouverte,
  onFermer,
  valeurActuelle,
  unite,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  valeurActuelle: number;
  unite: string;
  onValider: (v: number) => void;
}) {
  const [valeur, setValeur] = useState(valeurActuelle);
  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Relevé de compteur"
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={valeur < valeurActuelle} onClick={() => onValider(valeur)}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <Champ
        label={`Nouvelle valeur (${unite})`}
        aide={valeur < valeurActuelle ? 'La valeur ne peut pas être inférieure au dernier relevé.' : `Dernier relevé : ${nombre(valeurActuelle, 0)} ${unite}`}
        erreur={valeur < valeurActuelle ? 'Valeur inférieure au relevé précédent' : undefined}
      >
        <Saisie type="number" value={valeur} onChange={(e) => setValeur(Number(e.target.value))} />
      </Champ>
    </Modale>
  );
}

function ModaleStatut({
  ouverte,
  onFermer,
  statutActuel,
  onValider,
}: {
  ouverte: boolean;
  onFermer: () => void;
  statutActuel: StatutEquipement;
  onValider: (s: StatutEquipement) => void;
}) {
  const [statut, setStatut] = useState<StatutEquipement>(statutActuel);
  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Changer le statut de l’équipement"
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" onClick={() => onValider(statut)}>
            Appliquer
          </Bouton>
        </>
      }
    >
      <Champ label="Statut" aide="Le passage en « réformé » retire l’équipement des échéanciers préventif et réglementaire.">
        <Liste
          value={statut}
          onChange={(e) => setStatut(e.target.value as StatutEquipement)}
          options={Object.entries(STATUT_EQUIPEMENT).map(([v, x]) => ({ valeur: v, libelle: x.libelle }))}
        />
      </Champ>
      {statut === 'reforme' && (
        <div className="mt-3">
          <Encart ton="attention" icone={<ShieldCheck className="size-4" />}>
            La réforme doit faire l’objet d’une décision tracée et, pour un dispositif médical, d’une sortie
            d’inventaire comptable. Les documents opposables restent conservés.
          </Encart>
        </div>
      )}
    </Modale>
  );
}
