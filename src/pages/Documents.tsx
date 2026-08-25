import { useMemo, useState } from 'react';
import { FileText, FolderOpen, ShieldCheck } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Badge } from '@/components/ui/Badge';
import { Indicateur } from '@/components/ui/Indicateur';
import { BarreFiltres } from '@/components/shared/Filtres';
import { LienEquipement, NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { dateCourte } from '@/lib/dates';
import { nombre, normaliser } from '@/lib/format';
import type { DocumentGED } from '@/types/domain';

const CATEGORIES: Record<DocumentGED['categorie'], string> = {
  notice_utilisation: 'Notice d’utilisation',
  manuel_technique: 'Manuel technique',
  schema: 'Schéma',
  certificat_ce: 'Certificat CE',
  rapport_controle: 'Rapport de contrôle',
  certificat_etalonnage: 'Certificat d’étalonnage',
  facture: 'Facture',
  contrat: 'Contrat',
  procedure: 'Procédure',
  photo: 'Photographie',
  autre: 'Autre',
};

export function PageDocuments() {
  const { base, index } = useGMAO();
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  const [rattachement, setRattachement] = useState('');

  const filtres = useMemo(() => {
    const q = normaliser(recherche);
    return base.documents.filter((d) => {
      if (categorie && d.categorie !== categorie) return false;
      if (rattachement && d.entiteType !== rattachement) return false;
      if (q && !normaliser(d.nom).includes(q)) return false;
      return true;
    });
  }, [base.documents, recherche, categorie, rattachement]);

  const equipementsSansNotice = useMemo(() => {
    const avec = new Set(
      base.documents.filter((d) => d.entiteType === 'equipement' && d.categorie === 'notice_utilisation').map((d) => d.entiteId),
    );
    return base.equipements.filter((e) => e.statut !== 'reforme' && e.criticite <= 2 && !avec.has(e.id));
  }, [base]);

  const colonnes: Colonne<DocumentGED>[] = [
    {
      cle: 'nom',
      entete: 'Document',
      tri: (d) => d.nom,
      rendu: (d) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="size-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-slate-800">{d.nom}</p>
            <p className="text-xs text-slate-500">
              {CATEGORIES[d.categorie]} · {d.version} · {nombre(d.tailleKo / 1024, 1)} Mo
            </p>
          </div>
        </div>
      ),
    },
    {
      cle: 'rattachement',
      entete: 'Rattaché à',
      largeur: '260px',
      tri: (d) => d.entiteType,
      export: (d) => d.entiteType,
      rendu: (d) => {
        if (d.entiteType === 'equipement') return <LienEquipement id={d.entiteId} />;
        if (d.entiteType === 'contrat') {
          const c = index.contrats.get(d.entiteId ?? '');
          return <span className="text-sm text-slate-600">{c ? `${c.numero} — ${c.libelle}` : '—'}</span>;
        }
        if (d.entiteType === 'controle') {
          const c = base.controles.find((x) => x.id === d.entiteId);
          return <span className="text-sm text-slate-600">{c?.libelle ?? '—'}</span>;
        }
        return <span className="text-sm text-slate-500">{d.entiteType.replace(/_/g, ' ')}</span>;
      },
    },
    { cle: 'date', entete: 'Ajouté le', largeur: '120px', tri: (d) => d.dateAjout, rendu: (d) => dateCourte(d.dateAjout) },
    { cle: 'par', entete: 'Par', largeur: '180px', secondaire: true, tri: (d) => d.ajouteParId, rendu: (d) => <NomUtilisateur id={d.ajouteParId} /> },
    {
      cle: 'opposable',
      entete: 'Opposable',
      largeur: '110px',
      tri: (d) => Number(d.opposable),
      rendu: (d) => (d.opposable ? <Badge ton="info" compact>conservé</Badge> : <span className="text-slate-400">—</span>),
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Documentation technique"
        description="Notices, manuels, certificats et rapports de contrôle rattachés au parc"
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Documents archivés" valeur={nombre(base.documents.length, 0)} icone={<FolderOpen className="size-4" />} />
          <Indicateur
            libelle="Pièces opposables"
            valeur={nombre(base.documents.filter((d) => d.opposable).length, 0)}
            detail="conservées pour l’audit"
            icone={<ShieldCheck className="size-4" />}
          />
          <Indicateur
            libelle="Rapports de contrôle"
            valeur={nombre(base.documents.filter((d) => d.categorie === 'rapport_controle').length, 0)}
          />
          <Indicateur
            libelle="Équipements critiques sans notice"
            valeur={nombre(equipementsSansNotice.length, 0)}
            accent={equipementsSansNotice.length ? 'attention' : 'positif'}
          />
        </div>

        <Carte sansPadding>
          <div className="border-b border-slate-200 p-4">
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Nom du document…"
              resultats={`${filtres.length} document(s)`}
              filtres={[
                {
                  cle: 'categorie',
                  label: 'Catégorie',
                  valeur: categorie,
                  onChange: setCategorie,
                  options: Object.entries(CATEGORIES).map(([v, l]) => ({ valeur: v, libelle: l })),
                },
                {
                  cle: 'rattachement',
                  label: 'Rattachement',
                  valeur: rattachement,
                  onChange: setRattachement,
                  options: [
                    { valeur: 'equipement', libelle: 'Équipement' },
                    { valeur: 'contrat', libelle: 'Contrat' },
                    { valeur: 'controle', libelle: 'Contrôle réglementaire' },
                    { valeur: 'ordre_travail', libelle: 'Ordre de travail' },
                  ],
                },
              ]}
            />
          </div>
          <Tableau
            lignes={filtres}
            colonnes={colonnes}
            cleLigne={(d) => d.id}
            triInitial={{ cle: 'date', sens: 'desc' }}
            parPage={30}
            nomExport="documents"
            vide="Aucun document ne correspond aux critères."
          />
        </Carte>

        {equipementsSansNotice.length > 0 && (
          <Carte
            titre="Équipements critiques sans notice archivée"
            sousTitre="L’absence de documentation constructeur est un écart relevé en certification"
          >
            <ul className="flex flex-wrap gap-2">
              {equipementsSansNotice.slice(0, 40).map((e) => (
                <li key={e.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs">
                  <LienEquipement id={e.id} avecDesignation={false} />
                </li>
              ))}
              {equipementsSansNotice.length > 40 && (
                <li className="px-2 py-1 text-xs text-slate-500">+ {equipementsSansNotice.length - 40} autres</li>
              )}
            </ul>
          </Carte>
        )}
      </CorpsPage>
    </>
  );
}
