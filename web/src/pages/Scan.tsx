import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Search } from 'lucide-react';
import { CorpsPage, EnTetePage } from '@/layouts/Application';
import { Carte } from '@/components/ui/Carte';
import { Bouton } from '@/components/ui/Bouton';
import { Champ, Saisie } from '@/components/ui/Champs';
import { Encart, Vide } from '@/components/ui/Info';
import { BadgeCriticite, BadgeStatutEquipement } from '@/components/shared/Etiquettes';
import { Localisation } from '@/components/shared/Liens';
import { ModaleCreationOT } from './EquipementDetail';
import { useGMAO } from '@/data/store';
import { estOuvert } from '@gmao/partage';
import { normaliser } from '@gmao/partage';

/**
 * Écran de saisie du code d'inventaire — le pendant applicatif de l'étiquette
 * code-barres collée sur l'équipement. Une douchette USB se comporte comme un
 * clavier : elle remplit le champ puis envoie « Entrée », ce que ce formulaire
 * gère nativement.
 */
export function PageScan() {
  const { base, index } = useGMAO();
  const naviguer = useNavigate();
  const [code, setCode] = useState('');
  const [recherche, setRecherche] = useState('');
  const [creationOT, setCreationOT] = useState(false);

  const trouve = useMemo(() => {
    if (!recherche) return null;
    const nettoye = recherche.trim().replace(/^GMAO[-:]/i, '');
    const q = normaliser(nettoye);
    return (
      base.equipements.find((e) => normaliser(e.code) === q) ??
      base.equipements.find((e) => normaliser(e.numeroSerie) === q) ??
      base.equipements.find((e) => normaliser(e.code).includes(q)) ??
      null
    );
  }, [recherche, base.equipements]);

  const otsOuverts = trouve ? base.ordresTravail.filter((o) => o.equipementId === trouve.id && estOuvert(o)) : [];

  return (
    <>
      <EnTetePage
        titre="Identification d’un équipement"
        description="Scanner l’étiquette d’inventaire ou saisir le code manuellement"
      />

      <CorpsPage className="mx-auto max-w-3xl">
        <Carte>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setRecherche(code);
            }}
            className="space-y-4"
          >
            <Champ
              label="Code d’inventaire"
              aide="Une douchette code-barres remplit ce champ et valide automatiquement. Le préfixe « GMAO- » est ignoré."
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
                  <Saisie
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="GMAO-REA-0042"
                    className="h-12 pl-10 font-mono text-base"
                  />
                </div>
                <Bouton type="submit" variante="primaire" taille="lg">
                  <Search className="size-4" /> Rechercher
                </Bouton>
              </div>
            </Champ>
          </form>
        </Carte>

        {recherche && !trouve && (
          <Encart ton="attention" titre="Aucun équipement trouvé">
            Le code « {recherche} » ne correspond à aucun numéro d’inventaire ni à aucun numéro de série. Vérifier
            l’étiquette, ou signaler l’anomalie au service biomédical : un équipement non inventorié ne doit pas rester
            en exploitation.
          </Encart>
        )}

        {trouve && (
          <Carte
            titre={`${trouve.code} — ${trouve.designation}`}
            sousTitre={`${trouve.marque} ${trouve.modele} · n° de série ${trouve.numeroSerie}`}
            actions={
              <>
                <Bouton onClick={() => setCreationOT(true)}>Signaler une panne</Bouton>
                <Bouton variante="primaire" onClick={() => naviguer(`/equipements/${trouve.id}`)}>
                  Ouvrir la fiche
                </Bouton>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <BadgeStatutEquipement statut={trouve.statut} />
              <BadgeCriticite niveau={trouve.criticite} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-slate-600">
                <span className="text-xs tracking-wide text-slate-400 uppercase">Implantation</span>
                <br />
                <Localisation localId={trouve.localId} />
              </p>
              {trouve.contratId && (
                <p className="text-slate-600">
                  Sous contrat {index.contrats.get(trouve.contratId)?.numero} —{' '}
                  {index.fournisseurs.get(index.contrats.get(trouve.contratId)?.fournisseurId ?? '')?.raisonSociale}
                </p>
              )}
              {otsOuverts.length > 0 && (
                <Encart ton="info" titre={`${otsOuverts.length} intervention(s) déjà en cours`}>
                  {otsOuverts.map((o) => (
                    <p key={o.id}>
                      <button type="button" onClick={() => naviguer(`/ordres-travail/${o.id}`)} className="lien">
                        {o.numero}
                      </button>{' '}
                      — {o.objet}
                    </p>
                  ))}
                </Encart>
              )}
              {trouve.risqueInfectieux && (
                <Encart ton="attention" titre="Désinfection préalable obligatoire">
                  Ce dispositif est en contact avec le patient : appliquer le protocole de désinfection avant toute
                  manipulation technique.
                </Encart>
              )}
            </div>
          </Carte>
        )}

        {!recherche && (
          <Vide
            titre="En attente d’un code"
            description="Présenter l’étiquette de l’équipement devant la douchette, ou saisir son numéro d’inventaire."
            icone={<ScanLine className="size-10" />}
          />
        )}
      </CorpsPage>

      {trouve && (
        <ModaleCreationOT ouverte={creationOT} onFermer={() => setCreationOT(false)} equipementId={trouve.id} />
      )}
    </>
  );
}
