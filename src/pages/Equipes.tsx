import { useMemo, useState } from 'react';
import { Award, GraduationCap, Users } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Tableau } from '@/components/ui/Tableau';
import type { Colonne } from '@/components/ui/Tableau';
import { Badge } from '@/components/ui/Badge';
import { Segments } from '@/components/ui/Champs';
import { Indicateur } from '@/components/ui/Indicateur';
import { Panneau } from '@/components/ui/Modale';
import { Definitions, Encart } from '@/components/ui/Info';
import { Avatar } from '@/components/shared/Liens';
import { useGMAO } from '@/data/store';
import { coutTotal, estOuvert, estTermine } from '@/lib/kpi';
import { dateCourte, joursRestants } from '@/lib/dates';
import { duree, montant, nombre } from '@/lib/format';
import { DOMAINE, ROLE } from '@/types/labels';
import type { Habilitation, Utilisateur } from '@/types/domain';

export function PageEquipes() {
  const { base, index } = useGMAO();
  const [vue, setVue] = useState<'personnel' | 'habilitations'>('personnel');
  const [detail, setDetail] = useState<Utilisateur | null>(null);

  const habilitationsExpirees = base.habilitations.filter((h) => (joursRestants(h.dateExpiration) ?? 999) < 0);
  const habilitationsProches = base.habilitations.filter((h) => {
    const j = joursRestants(h.dateExpiration);
    return j !== null && j >= 0 && j <= 90;
  });

  const stats = useMemo(() => {
    const m = new Map<string, { ouverts: number; termines: number; tempsMin: number; cout: number }>();
    for (const o of base.ordresTravail) {
      const ids = new Set([o.technicienPrincipalId, ...o.temps.map((t) => t.technicienId)].filter(Boolean) as string[]);
      for (const id of ids) {
        const cur = m.get(id) ?? { ouverts: 0, termines: 0, tempsMin: 0, cout: 0 };
        if (estOuvert(o)) cur.ouverts += 1;
        if (estTermine(o)) cur.termines += 1;
        cur.tempsMin += o.temps.filter((t) => t.technicienId === id).reduce((s, t) => s + t.dureeMin, 0);
        cur.cout += coutTotal(o) / ids.size;
        m.set(id, cur);
      }
    }
    return m;
  }, [base.ordresTravail]);

  const personnel = base.utilisateurs.filter((u) => u.actif && u.role !== 'demandeur');

  const colonnes: Colonne<Utilisateur>[] = [
    {
      cle: 'nom',
      entete: 'Agent',
      tri: (u) => `${u.nom} ${u.prenom}`,
      export: (u) => `${u.prenom} ${u.nom}`,
      rendu: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar nom={u.nom} prenom={u.prenom} taille="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">
              {u.prenom} {u.nom}
            </p>
            <p className="truncate text-xs text-slate-500">
              {u.matricule} · {u.email}
            </p>
          </div>
        </div>
      ),
    },
    { cle: 'role', entete: 'Rôle', largeur: '210px', tri: (u) => u.role, export: (u) => ROLE[u.role], rendu: (u) => <span className="text-sm text-slate-600">{ROLE[u.role]}</span> },
    {
      cle: 'equipe',
      entete: 'Équipe',
      largeur: '200px',
      secondaire: true,
      tri: (u) => index.equipes.get(u.equipeId ?? '')?.nom ?? '',
      export: (u) => index.equipes.get(u.equipeId ?? '')?.nom ?? '',
      rendu: (u) => {
        const e = u.equipeId ? index.equipes.get(u.equipeId) : undefined;
        return e ? <Badge ton={DOMAINE[e.domaine].ton}>{e.nom}</Badge> : <span className="text-slate-400">—</span>;
      },
    },
    {
      cle: 'habilitations',
      entete: 'Habilitations',
      largeur: '130px',
      aDroite: true,
      tri: (u) => base.habilitations.filter((h) => h.utilisateurId === u.id).length,
      rendu: (u) => {
        const hs = base.habilitations.filter((h) => h.utilisateurId === u.id);
        const perimees = hs.filter((h) => (joursRestants(h.dateExpiration) ?? 999) < 0).length;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-sm tabulaire text-slate-700">{hs.length}</span>
            {perimees > 0 && (
              <Badge ton="danger" compact>
                {perimees} périmée(s)
              </Badge>
            )}
          </div>
        );
      },
    },
    { cle: 'ouverts', entete: 'OT en cours', largeur: '110px', aDroite: true, tri: (u) => stats.get(u.id)?.ouverts ?? 0, rendu: (u) => nombre(stats.get(u.id)?.ouverts ?? 0, 0) },
    { cle: 'termines', entete: 'OT réalisés', largeur: '110px', aDroite: true, secondaire: true, tri: (u) => stats.get(u.id)?.termines ?? 0, rendu: (u) => nombre(stats.get(u.id)?.termines ?? 0, 0) },
    { cle: 'temps', entete: 'Temps cumulé', largeur: '120px', aDroite: true, tri: (u) => stats.get(u.id)?.tempsMin ?? 0, export: (u) => Math.round((stats.get(u.id)?.tempsMin ?? 0) / 60), rendu: (u) => duree(stats.get(u.id)?.tempsMin ?? 0) },
    { cle: 'taux', entete: 'Taux horaire', largeur: '110px', aDroite: true, secondaire: true, tri: (u) => u.tauxHoraire, rendu: (u) => (u.tauxHoraire ? montant(u.tauxHoraire, true) : '—') },
  ];

  const colonnesHabilitations: Colonne<Habilitation>[] = [
    {
      cle: 'agent',
      entete: 'Agent',
      tri: (h) => index.utilisateurs.get(h.utilisateurId)?.nom ?? '',
      export: (h) => {
        const u = index.utilisateurs.get(h.utilisateurId);
        return u ? `${u.prenom} ${u.nom}` : '';
      },
      rendu: (h) => {
        const u = index.utilisateurs.get(h.utilisateurId);
        return u ? (
          <span className="inline-flex items-center gap-2">
            <Avatar nom={u.nom} prenom={u.prenom} />
            {u.prenom} {u.nom}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      cle: 'intitule',
      entete: 'Habilitation',
      tri: (h) => h.intitule,
      rendu: (h) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-slate-800">
            {h.intitule}
            {h.obligatoire && <Badge ton="danger" compact>obligatoire</Badge>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {h.reference} · {h.organisme}
          </p>
        </div>
      ),
    },
    { cle: 'obtention', entete: 'Obtenue le', largeur: '120px', secondaire: true, tri: (h) => h.dateObtention, rendu: (h) => dateCourte(h.dateObtention) },
    {
      cle: 'expiration',
      entete: 'Validité',
      largeur: '160px',
      tri: (h) => h.dateExpiration ?? '9999',
      export: (h) => h.dateExpiration ?? '',
      rendu: (h) => {
        const j = joursRestants(h.dateExpiration);
        if (j === null) return <Badge ton="succes">Sans limite</Badge>;
        return (
          <div className={j < 0 ? 'text-rose-600' : j <= 90 ? 'text-amber-700' : 'text-slate-600'}>
            <p className="text-xs tabulaire">{dateCourte(h.dateExpiration)}</p>
            <p className="text-[11px]">{j < 0 ? `expirée depuis ${-j} j` : `valide ${j} j`}</p>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <EnTetePage
        titre="Équipes et habilitations"
        description="Techniciens, compétences et validité des habilitations réglementaires"
        actions={
          <Segments
            valeur={vue}
            onChange={setVue}
            taille="sm"
            options={[
              { valeur: 'personnel', libelle: 'Personnel', compteur: personnel.length },
              { valeur: 'habilitations', libelle: 'Habilitations', compteur: base.habilitations.length },
            ]}
          />
        }
      />

      <CorpsPage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Agents techniques" valeur={nombre(personnel.length, 0)} icone={<Users className="size-4" />} />
          <Indicateur libelle="Équipes" valeur={nombre(base.equipes.length, 0)} detail={base.equipes.filter((e) => e.astreinte).length + ' avec astreinte'} />
          <Indicateur
            libelle="Habilitations expirées"
            valeur={nombre(habilitationsExpirees.length, 0)}
            accent={habilitationsExpirees.length ? 'negatif' : 'positif'}
            icone={<Award className="size-4" />}
          />
          <Indicateur
            libelle="À renouveler sous 90 j"
            valeur={nombre(habilitationsProches.length, 0)}
            accent={habilitationsProches.length ? 'attention' : 'neutre'}
            icone={<GraduationCap className="size-4" />}
          />
        </div>

        {habilitationsExpirees.some((h) => h.obligatoire) && (
          <Encart ton="danger" titre="Habilitations obligatoires expirées">
            Certains agents interviennent sans habilitation valide. Pour les travaux électriques comme pour les
            interventions en zone contrôlée, cela engage la responsabilité de l’établissement et invalide la traçabilité
            des interventions concernées.
          </Encart>
        )}

        <div className="grid gap-3 lg:grid-cols-5">
          {base.equipes.map((e) => {
            const membres = base.utilisateurs.filter((u) => u.equipeId === e.id && u.actif);
            const otsEquipe = base.ordresTravail.filter((o) => o.equipeId === e.id && estOuvert(o));
            return (
              <Carte key={e.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{e.nom}</p>
                    <p className="text-xs text-slate-500">{DOMAINE[e.domaine].libelle}</p>
                  </div>
                  {e.astreinte && <Badge ton="violet" compact>astreinte</Badge>}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>{membres.length} agents</span>
                  <span>{e.heuresHebdo} h/sem.</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">OT en cours</span>
                  <span className={`tabulaire font-medium ${otsEquipe.length > membres.length * 4 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {otsEquipe.length}
                  </span>
                </div>
                <div className="mt-2 flex -space-x-1.5">
                  {membres.slice(0, 6).map((m) => (
                    <span key={m.id} className="ring-2 ring-white">
                      <Avatar nom={m.nom} prenom={m.prenom} />
                    </span>
                  ))}
                  {membres.length > 6 && (
                    <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500 ring-2 ring-white">
                      +{membres.length - 6}
                    </span>
                  )}
                </div>
              </Carte>
            );
          })}
        </div>

        {vue === 'personnel' ? (
          <Carte sansPadding titre="Personnel technique">
            <Tableau
              lignes={personnel}
              colonnes={colonnes}
              cleLigne={(u) => u.id}
              onClicLigne={setDetail}
              triInitial={{ cle: 'nom', sens: 'asc' }}
              parPage={25}
              nomExport="personnel-technique"
              vide="Aucun agent enregistré."
            />
          </Carte>
        ) : (
          <Carte sansPadding titre="Habilitations et formations" sousTitre="Suivi de validité, condition d’affectation sur certaines interventions">
            <Tableau
              lignes={base.habilitations}
              colonnes={colonnesHabilitations}
              cleLigne={(h) => h.id}
              triInitial={{ cle: 'expiration', sens: 'asc' }}
              parPage={30}
              nomExport="habilitations"
              vide="Aucune habilitation enregistrée."
              ligneClassName={(h) => ((joursRestants(h.dateExpiration) ?? 999) < 0 ? 'bg-rose-50/40' : '')}
            />
          </Carte>
        )}
      </CorpsPage>

      <Panneau
        ouvert={Boolean(detail)}
        onFermer={() => setDetail(null)}
        titre={detail ? `${detail.prenom} ${detail.nom}` : ''}
        sousTitre={detail ? ROLE[detail.role] : undefined}
      >
        {detail && (
          <div className="space-y-5">
            <Definitions
              items={[
                { label: 'Matricule', valeur: detail.matricule },
                { label: 'Équipe', valeur: index.equipes.get(detail.equipeId ?? '')?.nom ?? '—' },
                { label: 'Courriel', valeur: detail.email },
                { label: 'Téléphone', valeur: detail.telephone ?? '—' },
                { label: 'Embauché le', valeur: dateCourte(detail.dateEmbauche) },
                { label: 'Taux horaire chargé', valeur: detail.tauxHoraire ? montant(detail.tauxHoraire, true) : '—' },
              ]}
            />

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Activité</h3>
              <Definitions
                items={[
                  { label: 'OT en cours', valeur: nombre(stats.get(detail.id)?.ouverts ?? 0, 0) },
                  { label: 'OT réalisés', valeur: nombre(stats.get(detail.id)?.termines ?? 0, 0) },
                  { label: 'Temps cumulé', valeur: duree(stats.get(detail.id)?.tempsMin ?? 0) },
                  { label: 'Coût généré', valeur: montant(stats.get(detail.id)?.cout ?? 0) },
                ]}
              />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Habilitations</h3>
              <ul className="space-y-2">
                {base.habilitations
                  .filter((h) => h.utilisateurId === detail.id)
                  .map((h) => {
                    const j = joursRestants(h.dateExpiration);
                    return (
                      <li key={h.id} className="rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-800">{h.intitule}</p>
                            <p className="text-xs text-slate-500">
                              {h.reference} · {h.organisme}
                            </p>
                          </div>
                          <Badge ton={j === null ? 'succes' : j < 0 ? 'danger' : j <= 90 ? 'attention' : 'succes'} compact>
                            {j === null ? 'sans limite' : j < 0 ? 'expirée' : `${j} j`}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                {!base.habilitations.some((h) => h.utilisateurId === detail.id) && (
                  <li className="text-sm text-slate-500">Aucune habilitation enregistrée.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </Panneau>
    </>
  );
}
