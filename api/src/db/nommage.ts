/**
 * Conversion entre le nommage du modèle métier (camelCase) et celui de la base
 * (snake_case). Une seule règle, appliquée partout : les mappings colonne par
 * colonne se désynchronisent tôt ou tard du schéma, une convention non.
 */

/**
 * Quatre champs portent un sigle en capitales que la règle générale ne sait
 * pas restituer en sens inverse (« classe_dm » redonnerait « classeDm »).
 * Les déclarer ici évite d'inventer une heuristique fragile sur les sigles.
 */
const EXCEPTIONS: Record<string, string> = {
  classeDM: 'classe_dm',
  numeroCE: 'numero_ce',
  marquageCE: 'marquage_ce',
  dateEcheanceSLA: 'date_echeance_sla',
};
const EXCEPTIONS_INVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(EXCEPTIONS).map(([camel, snake]) => [snake, camel]),
);

const cacheVersSnake = new Map<string, string>();
const cacheVersCamel = new Map<string, string>();

export function versSnake(nom: string): string {
  const exception = EXCEPTIONS[nom];
  if (exception) return exception;
  const connu = cacheVersSnake.get(nom);
  if (connu) return connu;
  const r = nom
    // « classeDM » → « classe_DM », « surfaceM2 » → « surface_M2 »
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // « slaDelaiInterventionH » garde son H isolé ; « DMDIV » reste groupé
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
  cacheVersSnake.set(nom, r);
  return r;
}

export function versCamel(nom: string): string {
  const exception = EXCEPTIONS_INVERSE[nom];
  if (exception) return exception;
  const connu = cacheVersCamel.get(nom);
  if (connu) return connu;
  // « continuite24_7 » ne doit pas devenir « continuite247 » : on ne recolle
  // que les underscores suivis d'une lettre.
  const r = nom.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  cacheVersCamel.set(nom, r);
  return r;
}
