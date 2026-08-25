import { useMemo, useState } from 'react';
import { CheckCheck, PackageCheck, ShoppingCart } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { BarreFiltres } from '@/components/shared/Filtres';
import { NomFournisseur, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { receptionnerCommande, validerCommande } from '@/data/actions';
import { dateCourte, joursRestants } from '@/lib/dates';
import { montant, nombre, normaliser } from '@/lib/format';
import type { BonCommande } from '@/types/domain';
import type { Ton } from '@/types/labels';

const STATUT_BC: Record<BonCommande['statut'], { libelle: string; ton: Ton }> = {
  brouillon: { libelle: 'Brouillon', ton: 'neutre' },
  a_valider: { libelle: 'À valider', ton: 'attention' },
  validee: { libelle: 'Validée', ton: 'info' },
  envoyee: { libelle: 'Envoyée', ton: 'info' },
  partiellement_recue: { libelle: 'Partiellement reçue', ton: 'violet' },
  receptionnee: { libelle: 'Réceptionnée', ton: 'succes' },
  annulee: { libelle: 'Annulée', ton: 'ardoise' },
};

const montantBC = (bc: BonCommande) => bc.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

export function PageAchats() {
  const { base, index, muter, utilisateur } = useGMAO();
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [perimetre, setPerimetre] = useState<'encours' | 'toutes'>('encours');
  const [detail, setDetail] = useState<BonCommande | null>(null);

  const enCours = base.bonsCommande.filter((b) => !['receptionnee', 'annulee'].includes(b.statut));
  const aValider = base.bonsCommande.filter((b) => b.statut === 'a_valider');
  const enRetard = enCours.filter((b) => b.dateLivraisonPrevue && (joursRestants(b.dateLivraisonPrevue) ?? 1) < 0);

  const filtrees = useMemo(() => {
    const q = normaliser(recherche);
    return base.bonsCommande.filter((bc) => {
      if (perimetre === 'encours' && ['receptionnee', 'annulee'].includes(bc.statut)) return false;
      if (statut && bc.statut !== statut) return false;
      if (fournisseur && bc.fournisseurId !== fournisseur) return false;
      if (q && !normaliser(`${bc.numero} ${index.fournisseurs.get(bc.fournisseurId)?.raisonSociale ?? ''}`).includes(q))
        return false;
      return true;
    });
  }, [base.bonsCommande, index, recherche, statut, fournisseur, perimetre]);

  const colonnes: Colonne<BonCommande>[] = [
    { cle: 'numero', entete: 'N°', largeur: '130px', tri: (b) => b.numero, rendu: (b) => <span className="font-mono text-xs">{b.numero}</span> },
    {
      cle: 'fournisseur',
      entete: 'Fournisseur',
      tri: (b) => index.fournisseurs.get(b.fournisseurId)?.raisonSociale ?? '',
      export: (b) => index.fournisseurs.get(b.fournisseurId)?.raisonSociale ?? '',
      rendu: (b) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">
            <NomFournisseur id={b.fournisseurId} />
          </p>
          <p className="text-xs text-slate-500">
            {b.lignes.length} ligne(s) · origine {b.origine.replace(/_/g, ' ')}
          </p>
        </div>
      ),
    },
    { cle: 'creation', entete: 'Créée le', largeur: '110px', tri: (b) => b.dateCreation, rendu: (b) => dateCourte(b.dateCreation) },
    {
      cle: 'livraison',
      entete: 'Livraison prévue',
      largeur: '140px',
      tri: (b) => b.dateLivraisonPrevue ?? '',
      export: (b) => b.dateLivraisonPrevue ?? '',
      rendu: (b) => {
        if (!b.dateLivraisonPrevue) return <span className="text-slate-400">—</span>;
        const j = joursRestants(b.dateLivraisonPrevue);
        const enRetard = j !== null && j < 0 && !['receptionnee', 'annulee'].includes(b.statut);
        return (
          <div className={enRetard ? 'text-rose-600' : 'text-slate-600'}>
            <p className="text-xs tabulaire">{dateCourte(b.dateLivraisonPrevue)}</p>
            {enRetard && <p className="text-[11px]">{-j} j de retard</p>}
          </div>
        );
      },
    },
    {
      cle: 'avancement',
      entete: 'Réception',
      largeur: '130px',
      tri: (b) => {
        const t = b.lignes.reduce((s, l) => s + l.quantite, 0);
        const r = b.lignes.reduce((s, l) => s + l.quantiteRecue, 0);
        return t ? r / t : 0;
      },
      rendu: (b) => {
        const t = b.lignes.reduce((s, l) => s + l.quantite, 0);
        const r = b.lignes.reduce((s, l) => s + l.quantiteRecue, 0);
        const pct = t ? (r / t) * 100 : 0;
        return (
          <div>
            <p className="text-xs tabulaire text-slate-600">{Math.round(pct)} %</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-marque-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    { cle: 'statut', entete: 'Statut', largeur: '160px', tri: (b) => b.statut, export: (b) => STATUT_BC[b.statut].libelle, rendu: (b) => <Badge ton={STATUT_BC[b.statut].ton} pastille>{STATUT_BC[b.statut].libelle}</Badge> },
    { cle: 'montant', entete: 'Montant', largeur: '120px', aDroite: true, tri: (b) => montantBC(b), export: (b) => Math.round(montantBC(b)), rendu: (b) => montant(montantBC(b)) },
  ];

  return (
    <>
      <EnTetePage
        titre="Achats et commandes"
        description="Bons de commande de pièces détachées et de prestations, de la validation à la réception"
        actions={
          <Segments
            valeur={perimetre}
            onChange={setPerimetre}
            taille="sm"
            options={[
              { valeur: 'encours', libelle: 'En cours', compteur: enCours.length },
              { valeur: 'toutes', libelle: 'Toutes', compteur: base.bonsCommande.length },
            ]}
          />
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Commandes en cours" valeur={nombre(enCours.length, 0)} icone={<ShoppingCart className="size-4" />} />
          <Indicateur libelle="En attente de validation" valeur={nombre(aValider.length, 0)} accent={aValider.length ? 'attention' : 'neutre'} />
          <Indicateur libelle="Livraisons en retard" valeur={nombre(enRetard.length, 0)} accent={enRetard.length ? 'negatif' : 'positif'} />
          <Indicateur libelle="Engagé non réceptionné" valeur={montant(enCours.reduce((s, b) => s + montantBC(b), 0))} />
        </div>

        <Carte sansPadding>
          <div className="border-b border-slate-200 p-4">
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Numéro de commande, fournisseur…"
              resultats={`${filtrees.length} commande(s)`}
              filtres={[
                {
                  cle: 'statut',
                  label: 'Statut',
                  valeur: statut,
                  onChange: setStatut,
                  options: Object.entries(STATUT_BC).map(([v, e]) => ({ valeur: v, libelle: e.libelle })),
                },
                {
                  cle: 'fournisseur',
                  label: 'Fournisseur',
                  valeur: fournisseur,
                  onChange: setFournisseur,
                  options: base.fournisseurs.map((f) => ({ valeur: f.id, libelle: f.raisonSociale })),
                },
              ]}
            />
          </div>
          <Tableau
            lignes={filtrees}
            colonnes={colonnes}
            cleLigne={(b) => b.id}
            onClicLigne={setDetail}
            triInitial={{ cle: 'creation', sens: 'desc' }}
            parPage={25}
            nomExport="bons-de-commande"
            vide="Aucune commande à afficher."
          />
        </Carte>
      </CorpsPage>

      <Panneau
        ouvert={Boolean(detail)}
        onFermer={() => setDetail(null)}
        titre={detail ? detail.numero : ''}
        sousTitre={detail ? index.fournisseurs.get(detail.fournisseurId)?.raisonSociale : undefined}
        pied={
          detail && !['receptionnee', 'annulee'].includes(detail.statut) ? (
            <>
              {detail.statut === 'a_valider' && (
                <Bouton
                  onClick={() =>
                    muter(`Validation de la commande ${detail.numero}`, (b) => validerCommande(b, detail.id, utilisateur.id), {
                      action: 'validation',
                      entiteType: 'bon_commande',
                      entiteId: detail.id,
                    })
                  }
                >
                  <CheckCheck className="size-4" /> Valider
                </Bouton>
              )}
              <Bouton
                onClick={() =>
                  muter(`Réception partielle de ${detail.numero}`, (b) => receptionnerCommande(b, detail.id, utilisateur.id, true), {
                    action: 'modification',
                    entiteType: 'bon_commande',
                    entiteId: detail.id,
                  })
                }
              >
                Réception partielle
              </Bouton>
              <Bouton
                variante="primaire"
                onClick={() =>
                  muter(`Réception de ${detail.numero}`, (b) => receptionnerCommande(b, detail.id, utilisateur.id), {
                    action: 'modification',
                    entiteType: 'bon_commande',
                    entiteId: detail.id,
                  })
                }
              >
                <PackageCheck className="size-4" /> Réceptionner
              </Bouton>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge ton={STATUT_BC[detail.statut].ton} pastille>
                {STATUT_BC[detail.statut].libelle}
              </Badge>
              <Badge ton="neutre">origine : {detail.origine.replace(/_/g, ' ')}</Badge>
            </div>

            <Definitions
              items={[
                { label: 'Fournisseur', valeur: <NomFournisseur id={detail.fournisseurId} /> },
                { label: 'Montant total', valeur: <strong>{montant(montantBC(detail))}</strong> },
                { label: 'Créée le', valeur: dateCourte(detail.dateCreation) },
                { label: 'Envoyée le', valeur: dateCourte(detail.dateEnvoi) },
                { label: 'Livraison prévue', valeur: dateCourte(detail.dateLivraisonPrevue) },
                { label: 'Réceptionnée le', valeur: dateCourte(detail.dateReception) },
                { label: 'Demandeur', valeur: <NomUtilisateur id={detail.demandeurId} /> },
                { label: 'Validée par', valeur: <NomUtilisateur id={detail.valideParId} /> },
              ]}
            />

            {detail.notes && <Encart ton="info">{detail.notes}</Encart>}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Lignes de commande</h3>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Article</th>
                    <th className="px-2 py-2 text-right">Cdé</th>
                    <th className="px-2 py-2 text-right">Reçu</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lignes.map((l, i) => {
                    const a = l.articleId ? index.articles.get(l.articleId) : undefined;
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <p className="text-slate-800">{a?.designation ?? l.designationLibre}</p>
                          <p className="text-xs text-slate-500">
                            {a?.code} · {montant(l.prixUnitaire, true)} / {a?.unite ?? 'unité'}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-right tabulaire">{l.quantite}</td>
                        <td className={`px-2 py-2 text-right tabulaire ${l.quantiteRecue < l.quantite ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {l.quantiteRecue}
                        </td>
                        <td className="px-3 py-2 text-right tabulaire">{montant(l.quantite * l.prixUnitaire)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </Panneau>
    </>
  );
}
