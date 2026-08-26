import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Boxes, PackagePlus, ShoppingCart } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Champ, Liste, Saisie, Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Modale, Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BarreFiltres } from '@/components/shared/Filtres';
import { LienEquipement, LienOT, NomFournisseur, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { api } from '@/data/api';
import { dateCourte, joursRestants } from '@gmao/partage';
import { montant, nombre, normaliser, pluriel } from '@gmao/partage';
import { TYPE_MOUVEMENT } from '@gmao/partage';
import type { Article, MouvementStock } from '@gmao/partage';

export function PageStocks() {
  const { base, index, commander } = useGMAO();
  const [vue, setVue] = useState<'articles' | 'mouvements' | 'peremption'>('articles');
  const [recherche, setRecherche] = useState('');
  const [magasin, setMagasin] = useState('');
  const [categorie, setCategorie] = useState('');
  const [situation, setSituation] = useState('');
  const [detail, setDetail] = useState<Article | null>(null);
  const [mouvement, setMouvement] = useState<Article | null>(null);
  const [reappro, setReappro] = useState(false);
  const [resultatReappro, setResultatReappro] = useState<number | null>(null);

  const sousSeuil = base.articles.filter((a) => a.actif && a.stockActuel <= a.stockMin);
  const ruptures = base.articles.filter((a) => a.actif && a.stockActuel === 0);
  const valeurStock = base.articles.reduce((s, a) => s + a.stockActuel * a.prixMoyenPondere, 0);

  const lotsPerimes = useMemo(
    () =>
      base.lots
        .filter((l) => l.datePeremption && (joursRestants(l.datePeremption) ?? 999) <= 90)
        .sort((a, b) => (a.datePeremption ?? '').localeCompare(b.datePeremption ?? '')),
    [base.lots],
  );

  const articlesFiltres = useMemo(() => {
    const q = normaliser(recherche);
    return base.articles.filter((a) => {
      if (magasin && a.magasinId !== magasin) return false;
      if (categorie && a.categorie !== categorie) return false;
      if (situation === 'rupture' && a.stockActuel > 0) return false;
      if (situation === 'sous_seuil' && a.stockActuel > a.stockMin) return false;
      if (situation === 'critique' && !a.critique) return false;
      if (situation === 'dormant' && a.consommationMensuelle > 0) return false;
      if (q && !normaliser(`${a.code} ${a.designation} ${a.referenceFournisseur ?? ''}`).includes(q)) return false;
      return true;
    });
  }, [base.articles, recherche, magasin, categorie, situation]);

  const colonnes: Colonne<Article>[] = [
    { cle: 'code', entete: 'Code', largeur: '95px', tri: (a) => a.code, rendu: (a) => <span className="font-mono text-xs">{a.code}</span> },
    {
      cle: 'designation',
      entete: 'Article',
      tri: (a) => a.designation,
      rendu: (a) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-slate-800">
            {a.designation}
            {a.critique && <Badge ton="danger" compact>critique</Badge>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {a.categorie.replace(/_/g, ' ')} · emplacement {a.emplacement} ·{' '}
            {pluriel(a.equipementsCompatibles.length, 'équipement compatible', 'équipements compatibles')}
          </p>
        </div>
      ),
    },
    {
      cle: 'stock',
      entete: 'Stock',
      largeur: '120px',
      tri: (a) => a.stockActuel - a.stockMin,
      export: (a) => a.stockActuel,
      rendu: (a) => {
        const ratio = a.stockMax ? Math.min(100, (a.stockActuel / a.stockMax) * 100) : 0;
        const couleur = a.stockActuel === 0 ? 'bg-rose-500' : a.stockActuel <= a.stockMin ? 'bg-amber-500' : 'bg-emerald-500';
        return (
          <div>
            <p className="text-sm tabulaire text-slate-800">
              {a.stockActuel} <span className="text-xs text-slate-400">{a.unite}</span>
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${couleur}`} style={{ width: `${ratio}%` }} />
            </div>
          </div>
        );
      },
    },
    { cle: 'min', entete: 'Min/Max', largeur: '95px', aDroite: true, secondaire: true, tri: (a) => a.stockMin, export: (a) => `${a.stockMin}/${a.stockMax}`, rendu: (a) => <span className="text-xs text-slate-500">{a.stockMin} / {a.stockMax}</span> },
    { cle: 'conso', entete: 'Conso./mois', largeur: '105px', aDroite: true, secondaire: true, tri: (a) => a.consommationMensuelle, rendu: (a) => nombre(a.consommationMensuelle, 0) },
    { cle: 'delai', entete: 'Délai', largeur: '80px', aDroite: true, secondaire: true, tri: (a) => a.delaiApproJours, rendu: (a) => `${a.delaiApproJours} j` },
    { cle: 'pmp', entete: 'PMP', largeur: '95px', aDroite: true, tri: (a) => a.prixMoyenPondere, export: (a) => a.prixMoyenPondere, rendu: (a) => montant(a.prixMoyenPondere, true) },
    { cle: 'valeur', entete: 'Valeur', largeur: '105px', aDroite: true, tri: (a) => a.stockActuel * a.prixMoyenPondere, export: (a) => Math.round(a.stockActuel * a.prixMoyenPondere), rendu: (a) => montant(a.stockActuel * a.prixMoyenPondere) },
  ];

  const colonnesMouvements: Colonne<MouvementStock>[] = [
    { cle: 'date', entete: 'Date', largeur: '110px', tri: (m) => m.date, rendu: (m) => dateCourte(m.date) },
    {
      cle: 'article',
      entete: 'Article',
      tri: (m) => index.articles.get(m.articleId)?.designation ?? '',
      export: (m) => index.articles.get(m.articleId)?.designation ?? '',
      rendu: (m) => {
        const a = index.articles.get(m.articleId);
        return (
          <div className="min-w-0">
            <p className="truncate text-slate-800">{a?.designation}</p>
            <p className="truncate text-xs text-slate-500">{m.motif}</p>
          </div>
        );
      },
    },
    { cle: 'type', entete: 'Type', largeur: '110px', tri: (m) => m.type, export: (m) => TYPE_MOUVEMENT[m.type].libelle, rendu: (m) => <Badge ton={TYPE_MOUVEMENT[m.type].ton} compact>{TYPE_MOUVEMENT[m.type].libelle}</Badge> },
    {
      cle: 'quantite',
      entete: 'Quantité',
      largeur: '100px',
      aDroite: true,
      tri: (m) => m.quantite,
      rendu: (m) => (
        <span className={m.type === 'sortie' || m.type === 'rebut' ? 'text-rose-600' : 'text-emerald-700'}>
          {m.type === 'sortie' || m.type === 'rebut' ? '−' : '+'}
          {Math.abs(m.quantite)}
        </span>
      ),
    },
    { cle: 'ot', entete: 'Origine', largeur: '130px', secondaire: true, tri: (m) => m.otId ?? '', rendu: (m) => (m.otId ? <LienOT id={m.otId} /> : <span className="text-xs text-slate-400">—</span>) },
    { cle: 'valeur', entete: 'Valeur', largeur: '110px', aDroite: true, tri: (m) => Math.abs(m.quantite) * m.prixUnitaire, rendu: (m) => montant(Math.abs(m.quantite) * m.prixUnitaire) },
    { cle: 'par', entete: 'Par', largeur: '160px', secondaire: true, tri: (m) => m.utilisateurId, rendu: (m) => <NomUtilisateur id={m.utilisateurId} /> },
  ];

  return (
    <>
      <EnTetePage
        titre="Stocks et pièces détachées"
        description="Magasin technique et biomédical, seuils de réapprovisionnement et traçabilité des mouvements"
        actions={
          <>
            <Segments
              valeur={vue}
              onChange={setVue}
              taille="sm"
              options={[
                { valeur: 'articles', libelle: 'Articles' },
                { valeur: 'mouvements', libelle: 'Mouvements' },
                { valeur: 'peremption', libelle: 'Péremptions', compteur: lotsPerimes.length },
              ]}
            />
            <Bouton variante="primaire" onClick={() => setReappro(true)}>
              <ShoppingCart className="size-4" /> Réapprovisionner
            </Bouton>
          </>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Références actives" valeur={nombre(base.articles.filter((a) => a.actif).length, 0)} icone={<Boxes className="size-4" />} />
          <Indicateur
            libelle="Sous le seuil minimum"
            valeur={nombre(sousSeuil.length, 0)}
            accent={sousSeuil.length ? 'attention' : 'positif'}
            detail={`dont ${sousSeuil.filter((a) => a.critique).length} critiques`}
          />
          <Indicateur
            libelle="Ruptures"
            valeur={nombre(ruptures.length, 0)}
            accent={ruptures.length ? 'negatif' : 'positif'}
            icone={<AlertTriangle className="size-4" />}
          />
          <Indicateur libelle="Valeur du stock" valeur={montant(valeurStock)} detail="au prix moyen pondéré" />
        </div>

        {ruptures.some((a) => a.critique) && (
          <Encart ton="danger" titre="Ruptures sur des pièces critiques">
            {ruptures
              .filter((a) => a.critique)
              .slice(0, 4)
              .map((a) => a.designation)
              .join(' · ')}
            . Ces références conditionnent la remise en service d’équipements vitaux : le délai d’approvisionnement
            (jusqu’à {Math.max(...ruptures.filter((a) => a.critique).map((a) => a.delaiApproJours))} jours) est le vrai
            risque, pas le montant.
          </Encart>
        )}

        {vue === 'articles' && (
          <Carte sansPadding>
            <div className="border-b border-slate-200 p-4">
              <BarreFiltres
                recherche={recherche}
                onRecherche={setRecherche}
                placeholder="Code, désignation, référence fournisseur…"
                resultats={`${articlesFiltres.length} référence(s)`}
                filtres={[
                  { cle: 'magasin', label: 'Magasin', valeur: magasin, onChange: setMagasin, options: base.magasins.map((m) => ({ valeur: m.id, libelle: m.nom })) },
                  {
                    cle: 'categorie',
                    label: 'Catégorie',
                    valeur: categorie,
                    onChange: setCategorie,
                    options: [
                      { valeur: 'piece_detachee', libelle: 'Pièce détachée' },
                      { valeur: 'consommable', libelle: 'Consommable' },
                      { valeur: 'accessoire', libelle: 'Accessoire' },
                      { valeur: 'outillage', libelle: 'Outillage' },
                      { valeur: 'produit_technique', libelle: 'Produit technique' },
                    ],
                  },
                  {
                    cle: 'situation',
                    label: 'Situation',
                    valeur: situation,
                    onChange: setSituation,
                    options: [
                      { valeur: 'rupture', libelle: 'En rupture' },
                      { valeur: 'sous_seuil', libelle: 'Sous le seuil' },
                      { valeur: 'critique', libelle: 'Pièces critiques' },
                    ],
                  },
                ]}
              />
            </div>
            <Tableau
              lignes={articlesFiltres}
              colonnes={colonnes}
              cleLigne={(a) => a.id}
              onClicLigne={setDetail}
              triInitial={{ cle: 'stock', sens: 'asc' }}
              parPage={30}
              nomExport="stock-magasin"
              vide="Aucun article ne correspond aux critères."
              ligneClassName={(a) => (a.stockActuel === 0 ? 'bg-rose-50/40' : a.stockActuel <= a.stockMin ? 'bg-amber-50/40' : '')}
            />
          </Carte>
        )}

        {vue === 'mouvements' && (
          <Carte sansPadding titre="Mouvements de stock" sousTitre="Entrées, sorties et régularisations" icone={<ArrowDownUp className="size-4 text-slate-400" />}>
            <Tableau
              lignes={base.mouvementsStock}
              colonnes={colonnesMouvements}
              cleLigne={(m) => m.id}
              triInitial={{ cle: 'date', sens: 'desc' }}
              parPage={30}
              nomExport="mouvements-stock"
              vide="Aucun mouvement enregistré."
            />
          </Carte>
        )}

        {vue === 'peremption' && (
          <Carte sansPadding titre="Lots proches de la péremption" sousTitre="Sous 90 jours ou déjà périmés">
            <ul className="divide-y divide-slate-100">
              {lotsPerimes.map((l) => {
                const a = index.articles.get(l.articleId);
                const j = joursRestants(l.datePeremption);
                return (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{a?.designation}</p>
                      <p className="text-xs text-slate-500">
                        lot {l.numeroLot} · {l.quantite} {a?.unite}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm tabulaire ${(j ?? 0) < 0 ? 'font-medium text-rose-600' : 'text-amber-700'}`}>
                      {dateCourte(l.datePeremption)}
                    </span>
                    <Badge ton={(j ?? 0) < 0 ? 'danger' : 'attention'} compact>
                      {(j ?? 0) < 0 ? `périmé depuis ${-(j ?? 0)} j` : `dans ${j} j`}
                    </Badge>
                  </li>
                );
              })}
              {lotsPerimes.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">Aucun lot proche de la péremption.</li>
              )}
            </ul>
          </Carte>
        )}
      </CorpsPage>

      <Panneau
        ouvert={Boolean(detail)}
        onFermer={() => setDetail(null)}
        titre={detail?.designation ?? ''}
        sousTitre={detail?.code}
        pied={
          detail ? (
            <Bouton variante="primaire" onClick={() => { setMouvement(detail); setDetail(null); }}>
              <PackagePlus className="size-4" /> Mouvementer
            </Bouton>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <Definitions
              items={[
                { label: 'Stock actuel', valeur: <strong>{detail.stockActuel} {detail.unite}</strong> },
                { label: 'Seuils', valeur: `min. ${detail.stockMin} — max. ${detail.stockMax}` },
                { label: 'Consommation mensuelle', valeur: `${detail.consommationMensuelle} ${detail.unite}` },
                {
                  label: 'Couverture',
                  valeur: detail.consommationMensuelle
                    ? `${nombre((detail.stockActuel / detail.consommationMensuelle) * 30, 0)} jours`
                    : '—',
                },
                { label: 'Délai d’approvisionnement', valeur: `${detail.delaiApproJours} jours` },
                { label: 'Prix moyen pondéré', valeur: montant(detail.prixMoyenPondere, true) },
                { label: 'Magasin', valeur: index.magasins.get(detail.magasinId)?.nom },
                { label: 'Emplacement', valeur: detail.emplacement },
                { label: 'Fournisseur principal', valeur: <NomFournisseur id={detail.fournisseurPrincipalId} /> },
                { label: 'Référence fournisseur', valeur: detail.referenceFournisseur ?? '—' },
              ]}
            />

            {detail.consommationMensuelle > 0 && detail.stockActuel / detail.consommationMensuelle * 30 < detail.delaiApproJours && (
              <Encart ton="attention" titre="Couverture inférieure au délai d’approvisionnement">
                Au rythme de consommation actuel, le stock sera épuisé avant l’arrivée d’une commande passée aujourd’hui.
              </Encart>
            )}

            {detail.equipementsCompatibles.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Équipements compatibles ({detail.equipementsCompatibles.length})
                </h3>
                <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                  {detail.equipementsCompatibles.slice(0, 40).map((id) => (
                    <li key={id} className="rounded-md bg-slate-50 px-3 py-1.5">
                      <LienEquipement id={id} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Derniers mouvements</h3>
              <ul className="space-y-1 text-sm">
                {base.mouvementsStock
                  .filter((m) => m.articleId === detail.id)
                  .slice(0, 12)
                  .map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                      <span className="min-w-0 truncate text-slate-700">
                        {dateCourte(m.date)} — {m.motif}
                      </span>
                      <span className={`shrink-0 tabulaire ${m.type === 'sortie' ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {m.type === 'sortie' ? '−' : '+'}
                        {Math.abs(m.quantite)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )}
      </Panneau>

      {mouvement && (
        <ModaleMouvement
          article={mouvement}
          onFermer={() => setMouvement(null)}
          onValider={async (type, quantite, motif) => {
            await commander(() => api.mouvementerStock(mouvement.id, { type, quantite, motif }));
            setMouvement(null);
          }}
        />
      )}

      <Modale
        ouverte={reappro}
        onFermer={() => setReappro(false)}
        titre="Générer les commandes de réapprovisionnement"
        sousTitre="Un bon de commande par fournisseur, pour les articles sous le seuil minimum"
        pied={
          <>
            <Bouton onClick={() => setReappro(false)}>Annuler</Bouton>
            <Bouton
              variante="primaire"
              disabled={!sousSeuil.length}
              onClick={async () => {
                const r = await commander(() => api.genererReappro());
                setReappro(false);
                setResultatReappro(r.crees);
              }}
            >
              Générer
            </Bouton>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            {sousSeuil.length === 0
              ? 'Aucun article n’est actuellement sous son seuil minimum.'
              : `${pluriel(sousSeuil.length, 'article')} sous le seuil minimum, dont ${
                  sousSeuil.filter((a) => a.critique).length
                } critique(s). Les articles déjà couverts par une commande en cours sont exclus.`}
          </p>
          {sousSeuil.length > 0 && (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
              {sousSeuil.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 truncate">{a.designation}</span>
                  <span className="shrink-0 text-xs text-slate-500 tabulaire">
                    {a.stockActuel} / {a.stockMin} → commander {Math.max(1, a.stockMax - a.stockActuel)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modale>

      {resultatReappro !== null && (
        <Modale ouverte onFermer={() => setResultatReappro(null)} titre="Commandes générées" largeur="sm">
          <p className="text-sm text-slate-700">
            {resultatReappro === 0
              ? 'Aucune commande n’a été créée : les besoins sont déjà couverts par des commandes en cours.'
              : `${pluriel(resultatReappro, 'bon de commande', 'bons de commande')} créés au statut « à valider ». Ils apparaissent dans le module Achats.`}
          </p>
        </Modale>
      )}
    </>
  );
}

function ModaleMouvement({
  article,
  onFermer,
  onValider,
}: {
  article: Article;
  onFermer: () => void;
  onValider: (type: 'entree' | 'sortie' | 'inventaire' | 'rebut' | 'retour', quantite: number, motif: string) => void;
}) {
  const [type, setType] = useState<'entree' | 'sortie' | 'inventaire' | 'rebut' | 'retour'>('sortie');
  const [quantite, setQuantite] = useState(1);
  const [motif, setMotif] = useState('');

  return (
    <Modale
      ouverte
      onFermer={onFermer}
      titre="Mouvement de stock"
      sousTitre={`${article.code} — ${article.designation}`}
      largeur="sm"
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" disabled={quantite < 0 || !motif.trim()} onClick={() => onValider(type, quantite, motif)}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        <Champ label="Type de mouvement">
          <Liste
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            options={[
              { valeur: 'sortie', libelle: 'Sortie (consommation)' },
              { valeur: 'entree', libelle: 'Entrée (réception)' },
              { valeur: 'retour', libelle: 'Retour au magasin' },
              { valeur: 'inventaire', libelle: 'Régularisation d’inventaire' },
              { valeur: 'rebut', libelle: 'Mise au rebut' },
            ]}
          />
        </Champ>
        <Champ
          label={type === 'inventaire' ? `Quantité comptée (${article.unite})` : `Quantité (${article.unite})`}
          aide={`Stock actuel : ${article.stockActuel} ${article.unite}`}
          erreur={type === 'sortie' && quantite > article.stockActuel ? 'Quantité supérieure au stock disponible' : undefined}
        >
          <Saisie type="number" min={0} value={quantite} onChange={(e) => setQuantite(Number(e.target.value))} />
        </Champ>
        <Champ label="Motif" obligatoire>
          <Saisie value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Écart d’inventaire annuel, don, casse…" />
        </Champ>
      </div>
    </Modale>
  );
}
