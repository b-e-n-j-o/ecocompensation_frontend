# Module front `ilotsRpg/` — intégration

Fichiers livrés (dossier `frontend/src/pages/Etude/ResultPanel/ilotsRpg/`) :

| Fichier | Rôle |
|---|---|
| `types.ts` | `IlotRpgResult`, `IlotsRpgResponse`, `IlotsRpgGeojson` (miroir du backend) |
| `labels.ts` | Libellés et couleurs des cultures, expressions MapLibre (culture / score), pastille de score |
| `IlotsRpgTable.tsx` | Tableau **plat** (une ligne par îlot), tri, détail déplié en onglets : Composition, Espèces, Végétation, Scoring, Propriétaire |
| `IlotsRpgMap.tsx` | Carte : UF (remplie), parcelles cadastrales (traits fins, à partir du zoom 13), contour RPG (pointillés). Bascule couleur culture / score. Sélection synchronisée |
| `index.ts` | Exports |

Seule dépendance vers l'existant : `../RankingLine` (`FilterEnrichBlock`, `ScoreBlock`, `PersonnesMoralesBlock`, `parsePersonnesMoralesPayload`, `ParcelScorePayload`). Les composants n'appellent pas l'API : c'est la page qui charge les données et les passe en props, comme pour les UF.

## 1. `api.ts`

```ts
import type { IlotsRpgGeojson, IlotsRpgResponse } from "./pages/Etude/ResultPanel/ilotsRpg";

// FilterPipelineBody
include_ilots_rpg?: boolean;

// Même helper / gestion d'erreur que fetchUfResults et fetchUfSubsetsGeojson
export async function fetchIlotsRpgResults(projectId: string): Promise<IlotsRpgResponse> { … `/api/projects/${projectId}/ilots-rpg` … }
export async function fetchIlotsRpgGeojson(projectId: string): Promise<IlotsRpgGeojson> { … `/api/projects/${projectId}/geojson/ilots-rpg` … }
```

`fetchProjectStoredResults` doit aussi exposer `last_results_ilots_rpg` (renvoyé par `GET /results` côté backend).

## 2. `EtudeResultats.tsx`

```tsx
import { IlotsRpgMap, IlotsRpgTable, type IlotsRpgGeojson, type IlotsRpgResponse } from "./ResultPanel/ilotsRpg";

// mainResultsTab : "parcelles" | "unites" | "combine" | "ilots"
const [ilotsRpgResults, setIlotsRpgResults] = useState<IlotsRpgResponse | null>(null);
const [ilotsRpgGeojson, setIlotsRpgGeojson] = useState<IlotsRpgGeojson | null>(null);
const [selectedIlotId, setSelectedIlotId] = useState<string | null>(null);
const [hoverIlotId, setHoverIlotId] = useState<string | null>(null);
const [ilotScrollNonce, setIlotScrollNonce] = useState(0);
const ilotsRequested = Boolean(filterConfig?.include_ilots_rpg);

// au chargement : stored.last_results_ilots_rpg → setIlotsRpgResults
// sur phase:ilots_rpg_ready → fetchIlotsRpgResults(projectId).then(setIlotsRpgResults)
// dès que ilotsRpgResults change (et ilots.length > 0) → fetchIlotsRpgGeojson(projectId).then(setIlotsRpgGeojson)

{ilotsRequested && (
  <button className={…} onClick={() => setMainResultsTab("ilots")}>Îlots agricoles</button>
)}

{mainResultsTab === "ilots" && (
  ilotsRpgResults ? (
    <div className="results-split">{/* même conteneur que l'onglet UF */}
      <IlotsRpgTable
        results={ilotsRpgResults}
        selectedIlotId={selectedIlotId}
        hoverIlotId={hoverIlotId}
        scrollToIlotId={selectedIlotId}
        scrollTableNonce={ilotScrollNonce}
        showZoneHumide={filterConfig?.study_type === "zones_humides_intra"}
        onIlotActivate={setSelectedIlotId}
        onIlotHover={setHoverIlotId}
      />
      <IlotsRpgMap
        geojson={ilotsRpgGeojson}
        foncierGeojson={foncierGeojson}
        projectId={projectId}
        focusIlotId={selectedIlotId}
        hoverIlotId={hoverIlotId}
        onIlotClick={(id) => { setSelectedIlotId(id); setIlotScrollNonce((n) => n + 1); }}
      />
    </div>
  ) : (
    <p className="…">Calcul des îlots agricoles en cours…</p>
  )
)}
```

## 3. `useFetchProgress.ts`, `pipelineProgress.ts`, `CreateAoiPage.tsx`

Voir `rpg_ilots_front_brief.md` §4 à §6 :
- `layer_key: "ilots_rpg"` et `phase:ilots_rpg_ready` ;
- la socket ne doit pas se fermer sur `phase:uf_ready` seul si les îlots sont demandés ;
- la case à cocher « Inclure les îlots agricoles (RPG) » sous le choix radio, avec `include_ilots_rpg` dans le corps du filtre.

## 4. CSS

Les composants réutilisent les classes `ranking-*`, `filter-enrich-*` et `occ-sol-*`. Seules deux classes de colonnes sont nouvelles : `col-culture` et `col-uf-nb-parcelles` (cette dernière existe déjà dans le tableau UF). Ajoute si besoin une largeur pour `col-culture`.
