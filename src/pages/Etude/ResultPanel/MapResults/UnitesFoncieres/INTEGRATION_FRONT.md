# Front UF v2 — intégration

Dossier : `frontend/src/pages/Etude/ResultPanel/TableauParcelles/`

| Fichier | Action |
|---|---|
| `UnitesFoncieresTable.tsx` | **remplacer** par la version livrée |
| `UnitesFoncieresMap.tsx` | **nouveau** (remplace `SousEnsemblesMap.tsx`, à supprimer) |
| `ufParcelles.ts` | garder **uniquement** `parcelleLabelFromIdu` (supprimer `UfParcelle`, `UfAvecParcelles`, `getUfParcelles`, `getBestScore`) |

## 1. `frontend/src/types.ts`

Ajouter près de `ScoreEcoPayload` :

```ts
export type UfCritereType =
  | "surface" | "eliminatoire" | "existence" | "faune" | "flore"
  | "zh_surface" | "combinaison" | "forme";

export interface UfCritereDetail {
  label: string;
  type: UfCritereType;
  ok: boolean;
  idus?: string[];          // porteuses (existence/faune/flore/zh) ou fautives (eliminatoire)
  valeur_ha?: number;       // surface, zh_surface
  valeur?: number;          // forme (Miller)
  seuil?: number | null;
  bloquant?: boolean;
  faune_ok?: boolean | null;
  flore_ok?: boolean | null;
}

export interface UfParcelleResult {
  idu: string;
  surface_ha: number;
  in_pool: boolean;
  fauna_distances?: Record<string, number>;
  criteres_portes: string[];
}
```

`UniteFoncieresResult` : remplacer la définition par

```ts
export interface UniteFoncieresResult {
  rang: number;
  uf_id: string;
  source?: "pm" | "manuel";
  siren?: string | null;
  denomination?: string | null;
  forme_juridique?: string | null;
  nb_parcelles: number;
  surface_ha?: number;
  miller?: number | null;
  distance_centre_km: number;
  zone_humide_ha?: number;
  verdict?: boolean;
  motif_rejet?: string | null;
  criteres?: Record<string, UfCritereDetail>;
  fauna_distances?: Record<string, number>;
  veg_libelles?: string[];
  veg_profile?: Record<string, { area_m2?: number; pct?: number }>;
  score_eco?: ScoreEcoPayload;
  pm_prospect?: { /* inchangé */ };
  parcelles?: UfParcelleResult[];
}
```

`ScoreEcoPayload.breakdown` : rendre `especes` / `distance` optionnels et ajouter
`zone_humide?: Record<string, unknown>` (mode zones humides).

`UfFilterResponse` :

```ts
export interface UfFilterResponse {
  version?: number;
  total_uf: number;
  unites_foncieres: UniteFoncieresResult[];
  diagnostic?: Record<string, number>;
  funnel?: FunnelStep[];
  memory?: unknown;
}
```

`SousEnsembleResult` : supprimer.

## 2. `frontend/src/api.ts`

- Supprimer `UfCombinationsAudit`, `auditUfCombinations`, `fetchUfSubsetsGeojson`.
- `addManualUniteFonciere` : type de retour
  `{ uf_id: string; nb_parcelles: number; idus: string[]; surface_ha: number | null; verdict: boolean | null; motif_rejet: string | null }`.
- Ajouter (même style que `fetchUfParcellesGeojson`) :

```ts
export async function fetchUfOccupationSolGeojson(projectId: string, ufId: string): Promise<FeatureCollection> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/uf/${encodeURIComponent(ufId)}/occupation-sol.geojson`,
    { headers: authHeaders() },   // reprendre exactement les en-têtes des autres fetch GeoJSON
  );
  if (!res.ok) throw new Error(`Occupation du sol UF : ${res.status}`);
  return res.json();
}
```

## 3. `EtudeResultats.tsx`

- Les 4 tests `hasSubsets` (l. ~435, 577-588, 726, 1455) →
  `(uf.unites_foncieres ?? []).length > 0`.
- `loadUfMapGeojson` : ne charger que `fetchUfParcellesGeojson` ; supprimer l'état `ufGeojson`.
- Supprimer : `subsetScores`, `findUfIdForSubset`, `linkedSubsetId`, `hoverSubsetId`,
  `scrollToSubsetId`, `onSubsetClick` / `onSubsetActivate` / `onSubsetHover`, et
  `total_sous_ensembles` au retrait d'une UF (l. ~995).
- Classement combiné (l. ~1408-1427) : une ligne par **terrain** au lieu d'une par
  sous-ensemble : `idu: \`UF:${uf.uf_id}\``, `surface_ha: uf.surface_ha`, `miller: uf.miller ?? 0`,
  `distance_centre_km: uf.distance_centre_km`, parcelle de référence `uf.parcelles?.[0]?.idu`,
  score `uf.score_eco`. Le clic sur une ligne `UF:` active `linkedUfId`.
- Carte : remplacer `<SousEnsemblesMap …>` par

```tsx
<UnitesFoncieresMap
  parcellesGeojson={ufParcellesGeojson}
  ufResults={ufResults}
  foncierGeojson={…}             // inchangé
  projectId={projectId}
  preloadedThematic={…}          // inchangé
  thematicPreloadLoading={…}     // inchangé
  thematicLayerKeys={…}          // inchangé
  focusUfId={linkedUfId}
  hoverUfId={hoverUfId}
  onUfClick={…}                  // handler existant de clic UF (ouvre + scroll tableau)
  hoverParcelleIdu={hoverParcelleIdu}
  onParcelleHover={setHoverParcelleIdu}
/>
```

- Tableau (`EtudeResultatsUnitesTable`) : ne plus passer `selectedSubsetId`, `scrollToSubsetId`,
  `onSubsetActivate`, `onSubsetHover`.
- `handleAddAsUf` : dans le bandeau, ajouter le verdict :
  `created.verdict === false ? \` — ne passe pas le filtre (${created.motif_rejet})\` : ""`.

## 4. Progression (nettoyage)

- `pipelineProgress.ts` : supprimer le cas `layer_key === "sous_ensembles"`, le bloc `enrich_uf`
  et le motif `UF_SOL:`.
- `layerProgress.ts` : `UF_LAYER_KEYS = ["unites_foncieres"]`, `DEFAULT_UF_PHASES` = la seule
  entrée `unites_foncieres`.
- `aoiLayerKeys.ts` : `UF_BUNDLE_KEYS` → `["unites_foncieres"]` (ou vide si plus rien à exclure).

## 5. Backend, une fois le front v2 en place

- `unites_foncieres/pool.py` : supprimer `_compat_v1` et son appel dans `build_response`.
- `main.py` : supprimer la route `geojson/uf-subsets`. `sous-ensembles-status` peut rester
  (elle lit `uf_terrains`) ; la renommer `uf-status` plus tard si on veut.
- `uf_export_adapter.py` : remplacer les champs v1 (`sous_ensembles`, `nb_combinaisons`,
  `presence`, `noyau`, `best_*`) par `parcelles`, `surface_ha`, `score_eco`, `verdict`,
  `motif_rejet`, `criteres` (une colonne « critères portés » par parcelle).
