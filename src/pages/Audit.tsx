import { useMemo, useState } from 'react';
import { Download, History } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Bouton } from '@/components/ui/Bouton';
import { Badge } from '@/components/ui/Badge';
import { Indicateur } from '@/components/ui/Indicateur';
import { Encart } from '@/components/ui/Info';
import { BarreFiltres } from '@/components/shared/Filtres';
import { NomUtilisateur } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { dateHeure } from '@/lib/dates';
import { nombre, normaliser } from '@/lib/format';
import { telecharger, versCSV } from '@/data/persistance';
import type { EntreeAudit } from '@/types/domain';
import type { Ton } from '@/types/labels';

const ACTIONS: Record<EntreeAudit['action'], { libelle: string; ton: Ton }> = {
  creation: { libelle: 'Création', ton: 'succes' },
  modification: { libelle: 'Modification', ton: 'info' },
  suppression: { libelle: 'Suppression', ton: 'danger' },
  validation: { libelle: 'Validation', ton: 'violet' },
  cloture: { libelle: 'Clôture', ton: 'ardoise' },
  connexion: { libelle: 'Connexion', ton: 'neutre' },
  export: { libelle: 'Export', ton: 'neutre' },
  generation: { libelle: 'Génération', ton: 'attention' },
};

export function PageAudit() {
  const { base, index } = useGMAO();
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState('');
  const [utilisateurId, setUtilisateurId] = useState('');
  const [entite, setEntite] = useState('');

  const typesEntite = useMemo(() => [...new Set(base.audit.map((a) => a.entiteType))].sort(), [base.audit]);

  const filtres = useMemo(() => {
    const q = normaliser(recherche);
    return base.audit.filter((a) => {
      if (action && a.action !== action) return false;
      if (utilisateurId && a.utilisateurId !== utilisateurId) return false;
      if (entite && a.entiteType !== entite) return false;
      if (q && !normaliser(`${a.libelle} ${a.details ?? ''}`).includes(q)) return false;
      return true;
    });
  }, [base.audit, recherche, action, utilisateurId, entite]);

  const colonnes: Colonne<EntreeAudit>[] = [
    { cle: 'date', entete: 'Horodatage', largeur: '160px', tri: (a) => a.date, rendu: (a) => <span className="text-xs tabulaire text-slate-600">{dateHeure(a.date)}</span> },
    {
      cle: 'utilisateur',
      entete: 'Auteur',
      largeur: '190px',
      tri: (a) => index.utilisateurs.get(a.utilisateurId)?.nom ?? '',
      export: (a) => {
        const u = index.utilisateurs.get(a.utilisateurId);
        return u ? `${u.prenom} ${u.nom}` : a.utilisateurId;
      },
      rendu: (a) => <NomUtilisateur id={a.utilisateurId} />,
    },
    {
      cle: 'action',
      entete: 'Action',
      largeur: '130px',
      tri: (a) => a.action,
      export: (a) => ACTIONS[a.action].libelle,
      rendu: (a) => <Badge ton={ACTIONS[a.action].ton} compact>{ACTIONS[a.action].libelle}</Badge>,
    },
    {
      cle: 'libelle',
      entete: 'Écriture',
      tri: (a) => a.libelle,
      rendu: (a) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{a.libelle}</p>
          {a.details && <p className="truncate text-xs text-slate-500">{a.details}</p>}
        </div>
      ),
    },
    { cle: 'entite', entete: 'Objet', largeur: '150px', secondaire: true, tri: (a) => a.entiteType, rendu: (a) => <span className="text-xs text-slate-500">{a.entiteType.replace(/_/g, ' ')}</span> },
  ];

  return (
    <>
      <EnTetePage
        titre="Journal d’audit"
        description="Trace de toutes les écritures effectuées dans la GMAO, dans l’ordre chronologique inverse"
        actions={
          <Bouton
            variante="primaire"
            onClick={() =>
              telecharger(
                'journal-audit.csv',
                versCSV(
                  filtres.map((a) => {
                    const u = index.utilisateurs.get(a.utilisateurId);
                    return {
                      Horodatage: a.date,
                      Auteur: u ? `${u.prenom} ${u.nom}` : a.utilisateurId,
                      Rôle: u?.role ?? '',
                      Action: ACTIONS[a.action].libelle,
                      Objet: a.entiteType,
                      Identifiant: a.entiteId,
                      Écriture: a.libelle,
                      Détails: a.details ?? '',
                    };
                  }),
                ),
                'text/csv',
              )
            }
          >
            <Download className="size-4" /> Exporter le journal
          </Bouton>
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Écritures enregistrées" valeur={nombre(base.audit.length, 0)} icone={<History className="size-4" />} />
          <Indicateur libelle="Créations" valeur={nombre(base.audit.filter((a) => a.action === 'creation').length, 0)} />
          <Indicateur libelle="Clôtures et validations" valeur={nombre(base.audit.filter((a) => a.action === 'cloture' || a.action === 'validation').length, 0)} />
          <Indicateur libelle="Auteurs distincts" valeur={nombre(new Set(base.audit.map((a) => a.utilisateurId)).size, 0)} />
        </div>

        <Encart ton="info" titre="Portée du journal">
          Toute écriture passant par l’application est journalisée avec son auteur et son horodatage. Le journal conserve
          les 4 000 dernières entrées ; au-delà, un archivage périodique est nécessaire pour répondre aux exigences de
          conservation applicables aux dispositifs médicaux.
        </Encart>

        <Carte sansPadding>
          <div className="border-b border-slate-200 p-4">
            <BarreFiltres
              recherche={recherche}
              onRecherche={setRecherche}
              placeholder="Libellé de l’écriture…"
              resultats={`${filtres.length} écriture(s)`}
              filtres={[
                {
                  cle: 'action',
                  label: 'Action',
                  valeur: action,
                  onChange: setAction,
                  options: Object.entries(ACTIONS).map(([v, a]) => ({ valeur: v, libelle: a.libelle })),
                },
                {
                  cle: 'utilisateur',
                  label: 'Auteur',
                  valeur: utilisateurId,
                  onChange: setUtilisateurId,
                  options: base.utilisateurs
                    .filter((u) => u.role !== 'demandeur')
                    .map((u) => ({ valeur: u.id, libelle: `${u.prenom} ${u.nom}` })),
                },
                {
                  cle: 'entite',
                  label: 'Objet',
                  valeur: entite,
                  onChange: setEntite,
                  options: typesEntite.map((t) => ({ valeur: t, libelle: t.replace(/_/g, ' ') })),
                },
              ]}
            />
          </div>
          <Tableau
            lignes={filtres}
            colonnes={colonnes}
            cleLigne={(a) => a.id}
            triInitial={{ cle: 'date', sens: 'desc' }}
            parPage={40}
            compact
            nomExport="journal-audit"
            vide="Aucune écriture ne correspond aux critères."
          />
        </Carte>
      </CorpsPage>
    </>
  );
}
