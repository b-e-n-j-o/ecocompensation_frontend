import type {
  FilterOptions,
  FilterResponse,
  ParcelPoolMetricRow,
  PoolMetricsBulkResponse,
  PoolRunListItem,
  PoolRunSnapshot,
  UfFilterResponse,
} from "./types";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import {
  RESULTS_LAYERS,
  getResultsLayerDefs,
  type ResultsThematicPreload,
} from "./components/ResultPanel/MapResults/cartoCouchesRegistry";

import { getApiBaseUrl, resolveApiUrl } from "./config/apiBase";

/**
 * Base URL du backend.
 * En dev, chaîne vide → URLs relatives (`/api/...`) et proxy Vite : même origine, pas de CORS.
 * En prod, `VITE_API_URL` ou fallback localhost:8000.
 */
const API = getApiBaseUrl();

import type { StudyType } from "./types/studyTypes";

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  study_type?: StudyType;
  layers_status: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ProjectHistorySummary = ProjectSummary & {
  history: {
    buffer_km: number | null;
    foncier_area_ha: number | null;
    pool_total_count: number | null;
    last_filter: {
      min_area_ha?: number;
      miller_threshold?: number;
      radius_start_km?: number;
      target_count?: number;
      faune_criteria?: unknown[];
      vegetation_hybride?: {
        mode?: string;
        zdv_natures?: string[];
        cesbio_libelles?: string[];
      };
    } | null;
  };
};

export type LayerInfo = {
  key: string;
  label: string;
  fast: boolean;
};

export async function fetchProjects(studyType?: StudyType): Promise<ProjectSummary[]> {
  const qs = studyType ? `?study_type=${encodeURIComponent(studyType)}` : "";
  const res = await fetch(`${API}/api/projects${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProjectHistory(): Promise<ProjectHistorySummary[]> {
  const res = await fetch(`${API}/api/projects/history`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchLayers(): Promise<LayerInfo[]> {
  const res = await fetch(`${API}/api/layers`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchFaunaTaxa(): Promise<string[]> {
  const res = await fetch(`${API}/api/fauna/taxa`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { taxa?: string[] };
  return Array.isArray(data.taxa) ? data.taxa : [];
}

export async function fetchProjectFaunaTaxa(projectId: string): Promise<string[]> {
  const res = await fetch(`${API}/api/projects/${projectId}/fauna/taxa`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { taxa?: string[] };
  return Array.isArray(data.taxa) ? data.taxa : [];
}

export type FromParcelleBody = {
  code_insee: string;
  section: string;
  numero: string;
  name: string;
  buffer_km: number;
  study_type?: StudyType;
};

export type ParcelleRef = {
  code_insee: string;
  section: string;
  numero: string;
};

export type FromParcellesBody = {
  parcelles: ParcelleRef[];
  name: string;
  buffer_km: number;
  study_type?: StudyType;
};

export type FromParcelleResponse = {
  project_id: string;
  aoi_id: string;
  foncier_id: string;
  name: string;
  status: string;
};

export type FoncierUploadPreviewResponse = {
  area_ha: number;
  /** Surface de la zone uploadée (ZH uniquement). */
  upload_area_ha?: number;
  /** Nombre de BV entiers retenus (ZH uniquement). */
  bv_count?: number;
  /** Libellés NomBVSpeMD des BV retenus (ZH uniquement). */
  bv_names?: string[];
  study_type?: StudyType;
  feature: {
    type: "Feature";
    geometry: Geometry;
    properties: Record<string, unknown>;
  };
  /** Zone initiale uploadée en GeoJSON (ZH uniquement). */
  upload_feature?: {
    type: "Feature";
    geometry: Geometry;
    properties: Record<string, unknown>;
  };
};

export type FoncierImportResponse = {
  foncier_id: string;
  aoi_id: string;
  project_id: string;
  area_ha: number;
  buffer_km: number;
  study_type?: StudyType;
  bv_count?: number;
  bv_names?: string[];
  aoi_area_ha?: number;
};

export type ProjectContextGeometryResponse = {
  project_id: string;
  name: string | null;
  parcelle_source: {
    type: "Feature";
    geometry: Geometry;
    properties: {
      project_id: string;
      code_insee?: string;
      section?: string;
      numero?: string;
    };
  } | null;
  aoi: {
    type: "Feature";
    geometry: Geometry;
    properties: {
      project_id: string;
      aoi_id?: string | null;
    };
  } | null;
  foncier: {
    type: "Feature";
    geometry: Geometry;
    properties: {
      project_id: string;
      foncier_id?: string | null;
    };
  } | null;
};

export type PreanalyzeParcelleBody = {
  code_insee: string;
  section: string;
  numero: string;
  /** Buffer pour la BBOX des requêtes WFS (m). Défaut conseillé : 50. */
  buffer_m?: number;
};

export type PreanalyzeLayerRow = {
  key: string;
  label: string;
  status: string;
  intersects?: boolean | null;
  n?: number | null;
  geometry_types?: string[] | null;
  geometry_types_label?: string | null;
  samples?: string[] | null;
  detail?: Record<string, unknown> | null;
  error?: string | null;
};

export type PreanalyzeParcelleResponse = {
  parcelle: {
    code_insee: string;
    section: string;
    numero: string;
    surface_ha: number;
    buffer_m: number;
    perimeter_m?: number;
    miller?: number;
  };
  bbox_3857: number[];
  method: string;
  duration_s: number;
  layers: PreanalyzeLayerRow[];
};

export async function preanalyzeParcelle(
  body: PreanalyzeParcelleBody,
): Promise<PreanalyzeParcelleResponse> {
  const res = await fetch(`${API}/api/parcels/preanalyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code_insee: body.code_insee.trim(),
      section: body.section.trim(),
      numero: body.numero.trim(),
      buffer_m: body.buffer_m ?? 50,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type PreanalyzeStreamHandlers = {
  onStart?: (data: {
    parcelle: PreanalyzeParcelleResponse["parcelle"];
    bbox_3857: number[];
    layers_order: { key: string; label: string }[];
    method: string;
  }) => void;
  onRunning?: (layerKey: string) => void;
  onLayer?: (row: PreanalyzeLayerRow) => void;
  onComplete?: (data: PreanalyzeParcelleResponse) => void;
  onError?: (message: string) => void;
};

/**
 * Pré-analyse en flux WebSocket : lignes du tableau remplies au fil de l’eau
 * (événements start → running → layer → complete).
 */
export function connectPreanalyzeParcelleStream(
  body: PreanalyzeParcelleBody,
  handlers: PreanalyzeStreamHandlers,
): () => void {
  const WS = API.replace(/^http/, "ws");
  const ws = new WebSocket(`${WS}/ws/parcels/preanalyze`);

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        code_insee: body.code_insee.trim(),
        section: body.section.trim(),
        numero: body.numero.trim(),
        buffer_m: body.buffer_m ?? 50,
      }),
    );
  };

  ws.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data as string) as Record<string, unknown>;
      const event = d.event as string;
      if (event === "start") {
        handlers.onStart?.({
          parcelle: d.parcelle as PreanalyzeParcelleResponse["parcelle"],
          bbox_3857: d.bbox_3857 as number[],
          layers_order: d.layers_order as { key: string; label: string }[],
          method: String(d.method ?? ""),
        });
        return;
      }
      if (event === "running") {
        handlers.onRunning?.(String(d.layer_key ?? ""));
        return;
      }
      if (event === "layer") {
        handlers.onLayer?.(d.layer as PreanalyzeLayerRow);
        return;
      }
      if (event === "complete") {
        const { event: _ev, ...rest } = d as Record<string, unknown>;
        handlers.onComplete?.(rest as unknown as PreanalyzeParcelleResponse);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }
      if (event === "error") {
        handlers.onError?.(String(d.message ?? "Erreur inconnue"));
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      handlers.onError?.(e instanceof Error ? e.message : "Message WebSocket invalide");
    }
  };

  ws.onerror = () => {
    handlers.onError?.("Connexion WebSocket interrompue");
  };

  return () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

export async function createProjectFromParcelle(
  body: FromParcelleBody
): Promise<FromParcelleResponse> {
  const res = await fetch(`${API}/api/projects/from-parcelle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProjectFromParcelles(
  body: FromParcellesBody
): Promise<FromParcelleResponse> {
  const res = await fetch(`${API}/api/projects/from-parcelles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function previewFoncierUpload(
  file: File,
  studyType?: StudyType,
): Promise<FoncierUploadPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  if (studyType) form.append("study_type", studyType);
  const res = await fetch(`${API}/api/foncier/preview`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createProjectFromFoncierUpload(params: {
  name: string;
  buffer_km: number;
  study_type?: StudyType;
  file: File;
}): Promise<FoncierImportResponse> {
  const form = new FormData();
  form.append("name", params.name);
  form.append("buffer_km", String(params.buffer_km));
  form.append("study_type", params.study_type ?? "faune_buffer");
  form.append("file", params.file);
  const res = await fetch(`${API}/api/foncier/import`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProjectContextGeometry(
  projectId: string
): Promise<ProjectContextGeometryResponse> {
  const res = await fetch(`${API}/api/projects/${projectId}/context-geometry`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type StartFetchOptions = {
  /** Clés de couches à exécuter (ordre backend). Omit ou null = toutes. */
  layers?: string[] | null;
  /** Si true, les données insérées sont supprimées après chaque couche (test). */
  dry_run?: boolean;
  /** Liste optionnelle de taxons pour filtrer les couches faune. */
  fauna_species?: string[] | null;
  /** Nombre max de parcelles par UF pour sous-ensembles (personnes morales), 5–10. */
  uf_max_parcelles?: number;
  /** Surface minimale (ha) d'une UF à conserver au pré-filtre. */
  uf_min_area_ha?: number;
};

export async function startFetch(
  projectId: string,
  options?: StartFetchOptions,
): Promise<{
  status: string;
  project_id?: string;
  layers?: string[] | null;
  dry_run?: boolean;
}> {
  const res = await fetch(`${API}/api/projects/${projectId}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type FilterPhaseInfo = { key: string; label: string };

export type FilterPipelineBody = {
  min_area_ha: number;
  miller_thresh?: number | null;
  cesbio_libelles: string[];
  fauna_criteria: { species: string; dist_m: number }[];
  zone_humide_mode?: "ignore" | "intersect" | "exclude";
  zones_humides_probables_mode?: "ignore" | "intersect" | "exclude";
  /** Surface min. (ha) de ZH établie intersectant la parcelle (mode intersect). */
  min_zone_humide_ha?: number;
  /** Couches nationales à exclure si intersection (geomce, preemption_ens, ens). */
  excluded_layers?: string[];
  /** Distance max (m) au tronçon hydro ; omis ou null = critère ignoré. */
  troncons_hydros_max_dist_m?: number | null;
  surfaces_hydros_max_dist_m?: number | null;
};

export async function fetchFilterPhases(): Promise<FilterPhaseInfo[]> {
  const res = await fetch(`${API}/api/filter-phases`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startFilterPipeline(
  projectId: string,
  body: FilterPipelineBody,
): Promise<{ status: string; project_id: string }> {
  const res = await fetch(`${API}/api/projects/${projectId}/filter-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  const res = await fetch(`${API}/api/projects/${projectId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
}

/** True si la table sous_ensembles contient des lignes pour ce projet (filtre UF possible). */
/** Valeurs `classefiab` présentes en base nationale (couche remontées de nappes). */
export async function fetchRemonteeNappesClassefiab(): Promise<string[]> {
  const res = await fetch(`${API}/api/reference/remontee-nappes-classefiab`);
  if (!res.ok) throw new Error(await res.text());
  const d = (await res.json()) as { values?: string[] };
  return Array.isArray(d.values) ? d.values : [];
}

export async function fetchSousEnsemblesStatus(
  projectId: string,
): Promise<{ has_sous_ensembles: boolean }> {
  const res = await fetch(`${API}/api/projects/${projectId}/sous-ensembles-status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Aligné sur `FiltreOptionsDTO` (Pydantic) : évite les 422 si l’UI envoie des valeurs tolérées côté front mais rejetées par l’API. */
function sanitizeFilterOptionsForApi(options: FilterOptions): FilterOptions {
  const vh = options.vegetation_hybride;
  const modeRaw = String(vh.mode ?? "OR").trim().toUpperCase();
  const mode = modeRaw === "AND" ? "AND" : "OR";
  const faune = options.faune_criteria.filter(
    (c) => typeof c.tax_nom_val === "string" && c.tax_nom_val.trim().length > 0,
  );
  return {
    ...options,
    vegetation_hybride: { ...vh, mode },
    faune_criteria: faune,
  };
}

export function buildFilterRequestPayload(options: FilterOptions): { options: FilterOptions } {
  const safe = sanitizeFilterOptionsForApi(options);
  return { options: safe };
}

async function throwHttpError(res: Response): Promise<never> {
  const text = await res.text();
  let parsed: { detail?: unknown } | null = null;
  try {
    parsed = JSON.parse(text) as { detail?: unknown };
  } catch {
    throw new Error(text || `Erreur HTTP ${res.status}`);
  }
  if (Array.isArray(parsed.detail)) {
    const msg = parsed.detail
      .map((d: unknown) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc =
            "loc" in d && Array.isArray((d as { loc: unknown }).loc)
              ? (d as { loc: (string | number)[] }).loc.slice(1).join(".")
              : "";
          const m = String((d as { msg: unknown }).msg);
          return loc ? `${loc}: ${m}` : m;
        }
        return JSON.stringify(d);
      })
      .join(" ; ");
    throw new Error(msg || text || `Erreur HTTP ${res.status}`);
  }
  if (typeof parsed.detail === "string") throw new Error(parsed.detail);
  throw new Error(text || `Erreur HTTP ${res.status}`);
}

/** Métriques détaillées du pool pour une parcelle (run de filtre donné). */
export async function fetchPoolParcelMetrics(
  projectId: string,
  runId: string,
  idu: string,
): Promise<{ run_id: string; idu: string; metrics: ParcelPoolMetricRow[] }> {
  const q = new URLSearchParams({ run_id: runId });
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/${encodeURIComponent(idu)}/metrics?${q}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Toutes les métriques du run (préchargement après filtrage). */
export async function fetchPoolRunMetricsBulk(
  projectId: string,
  runId: string,
): Promise<PoolMetricsBulkResponse> {
  const q = new URLSearchParams({ run_id: runId });
  const res = await fetch(`${API}/api/projects/${projectId}/pool/metrics?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Parcelles marquées indésirables pour ce run (persistées). */
export async function fetchPoolIndesirables(
  projectId: string,
): Promise<{
  project_id: string;
  idus: string[];
  parcelles: FilterResponse["parcelles"];
  by_idu: Record<string, ParcelPoolMetricRow[]>;
  total: number;
}> {
  const res = await fetch(`${API}/api/projects/${projectId}/pool/indesirables`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPoolIndesirablesCount(
  projectId: string,
): Promise<{ project_id: string; total: number }> {
  const res = await fetch(`${API}/api/projects/${projectId}/pool/indesirables-count`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addPoolIndesirables(
  projectId: string,
  runId: string,
  idus: string[],
): Promise<{ inserted: number }> {
  const res = await fetch(`${API}/api/projects/${projectId}/pool/indesirables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, idus }),
  });
  if (!res.ok) await throwHttpError(res);
  return res.json();
}

export async function removePoolIndesirable(
  projectId: string,
  idu: string,
): Promise<void> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/indesirables/${encodeURIComponent(idu)}`,
    { method: "DELETE" },
  );
  if (!res.ok) await throwHttpError(res);
}

/** Lance le calcul des profilers (COSIA, CARHAB, végétation hybride, …) pour le run pool. Appelé après le filtre. */
export async function computePoolRunMetrics(projectId: string, runId: string): Promise<void> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${runId}/recompute-metrics`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await res.text());
}

/** Lance uniquement le recalcul du score écologique (`score_eco`, /6) pour le run pool. */
export async function computePoolRunScoreOnly(projectId: string, runId: string): Promise<void> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${runId}/recompute-score`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await res.text());
}

export type PoolDureteRecomputeResponse = {
  status: string;
  project_id: string;
  run_id: string;
  metric_key: string;
  updated_count: number;
  active_idus: number;
  requested_idus?: number;
  skipped_indesirables: number;
  eligible_pm: number;
  pm_upserts: number;
  composite_updated: number;
  duration_s: number;
};

/** Dureté foncière (attractivité) — tout le pool actif, ou une sélection d'IDU. */
export async function computePoolRunDurete(
  projectId: string,
  runId: string,
  idus?: string[] | null,
): Promise<PoolDureteRecomputeResponse> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${runId}/recompute-durete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(idus?.length ? { idus } : {}),
    },
  );
  if (!res.ok) await throwHttpError(res);
  return res.json();
}

export type PoolAddParcellesResponse = {
  status: string;
  project_id: string;
  run_id: string;
  added: string[];
  already_in_pool: string[];
  not_found: string[];
  invalid: string[];
  unstuck_indesirables: string[];
  sources?: Record<string, string>;
  total_count: number;
  duration_s: number;
};

/** Ajoute des IDU au pool d'un run déjà calculé (sans rejouer le filtrage). */
export async function addParcellesToPoolRun(
  projectId: string,
  runId: string,
  idus: string[],
): Promise<PoolAddParcellesResponse> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${runId}/parcelles`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idus }),
    },
  );
  if (!res.ok) await throwHttpError(res);
  return res.json();
}

export async function fetchUfResults(
  projectId: string,
  params?: {
    fauna_species?: string;
    cesbio_libelles?: string[];
    fauna_dist_m?: number;
    miller_thresh?: number;
    study_type?: string;
    min_zone_humide_ha?: number;
  },
): Promise<UfFilterResponse> {
  const q = new URLSearchParams();
  if (params?.fauna_species) q.set("fauna_species", params.fauna_species);
  if (params?.fauna_dist_m != null) q.set("fauna_dist_m", String(params.fauna_dist_m));
  if (params?.miller_thresh != null) q.set("miller_thresh", String(params.miller_thresh));
  if (params?.study_type) q.set("study_type", params.study_type);
  if (params?.min_zone_humide_ha != null) {
    q.set("min_zone_humide_ha", String(params.min_zone_humide_ha));
  }
  for (const lib of params?.cesbio_libelles ?? []) {
    q.append("cesbio_libelles", lib);
  }
  const qs = q.toString();
  const url = qs
    ? `${API}/api/projects/${projectId}/uf-pool?${qs}`
    : `${API}/api/projects/${projectId}/uf-pool`;
  const res = await fetch(url);
  if (!res.ok) await throwHttpError(res);
  return res.json();
}

export async function fetchUfSubsetsGeojson(
  projectId: string,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const res = await fetch(`${API}/api/projects/${projectId}/geojson/uf-subsets`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchParcellesGeojson(
  projectId: string,
  poolRunId?: string | null,
): Promise<{ type: "FeatureCollection"; features: unknown[] }> {
  const q = poolRunId ? new URLSearchParams({ run_id: poolRunId }) : "";
  const url = q
    ? `${API}/api/projects/${projectId}/geojson?${q}`
    : `${API}/api/projects/${projectId}/geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Parcelles pool + attributs enrichis pour la carte Données internes. */
export async function fetchPoolMapOverlay(
  projectId: string,
  runId: string,
): Promise<{
  retenues: FeatureCollection<Geometry, GeoJsonProperties>;
  ajoutees: FeatureCollection<Geometry, GeoJsonProperties>;
  indesirables: FeatureCollection<Geometry, GeoJsonProperties>;
}> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${encodeURIComponent(runId)}/map-overlay`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Liste des runs pool parcelles (ou autres scopes) pour un projet. */
export async function fetchPoolRunsList(
  projectId: string,
  limit = 80,
): Promise<{ runs: PoolRunListItem[] }> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${API}/api/projects/${projectId}/pool/runs?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Tous les pools de tous les projets — un seul GET. */
export async function fetchAllPoolRunsList(
  limit = 200,
  scope = "parcelles",
): Promise<{ runs: PoolRunListItem[] }> {
  const q = new URLSearchParams({ limit: String(limit), scope });
  const res = await fetch(`${API}/api/pool/runs?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Recharge les résultats parcelles d’un run persisté (tableau + métriques + options filtre). */
export async function fetchPoolRunSnapshot(
  projectId: string,
  runId: string,
): Promise<PoolRunSnapshot> {
  const res = await fetch(
    `${API}/api/projects/${projectId}/pool/runs/${encodeURIComponent(runId)}/snapshot`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Derniers résultats JSON stockés sur le projet (parcelles, UF, etc.). */
export async function fetchProjectStoredResults(projectId: string): Promise<{
  status: string;
  last_results: unknown;
  last_filter: unknown;
  last_results_uf: unknown;
  last_filter_uf: unknown;
}> {
  const res = await fetch(`${API}/api/projects/${projectId}/results`);
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as {
    status?: string;
    last_results?: unknown;
    last_filter?: unknown;
    last_results_uf?: unknown;
    last_filter_uf?: unknown;
  };
  return {
    status: data.status ?? "unknown",
    last_results: data.last_results ?? null,
    last_filter: data.last_filter ?? null,
    last_results_uf: data.last_results_uf ?? null,
    last_filter_uf: data.last_filter_uf ?? null,
  };
}

export async function fetchFoncierGeojson(
  projectId: string
): Promise<unknown | null> {
  const res = await fetch(`${API}/api/foncier/${projectId}/geometry`);
  if (res.status === 404) {
    // Pas de foncier associé à ce projet (projet créé via commune/GPKG classique)
    return null;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** `parcelles` = classement parcelles ; `uf` = sous-ensembles du classement UF */
export type ExportScope = "parcelles" | "uf" | "indesirables";

export async function exportCsv(
  projectId: string,
  scope: ExportScope = "parcelles",
  poolRunId?: string | null,
): Promise<void> {
  const q = new URLSearchParams({ scope });
  if (poolRunId) q.set("run_id", poolRunId);
  const res = await fetch(`${API}/api/projects/${projectId}/export/csv?${q}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur lors de l'export CSV");
  }

  // Télécharger le fichier
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const prefix = scope === "uf" ? "uf" : "parcelles";
  a.download = `${prefix}_${projectId.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function exportShp(
  projectId: string,
  scope: ExportScope = "parcelles",
  poolRunId?: string | null,
): Promise<void> {
  const q = new URLSearchParams({ scope });
  if (poolRunId) q.set("run_id", poolRunId);
  const res = await fetch(`${API}/api/projects/${projectId}/export/shp?${q}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur lors de l'export SHP");
  }

  // Télécharger le fichier
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const prefix = scope === "uf" ? "uf" : "parcelles";
  a.download = `${prefix}_${projectId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * URL pour le téléchargement PDF : en **dev**, toujours `window.location.origin` + `/api/...`
 * pour passer par le proxy Vite (évite CORS et coupure sur requêtes longues).
 * Même si `.env` définit `VITE_API_URL=http://localhost:8000`, ce cas est contourné ici.
 */
function apiUrlForFetch(path: string): string {
  return resolveApiUrl(path);
}

function isSameOriginAsPage(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

export type RapportPdfExportResult = {
  /**
   * Δ RSS du processus serveur (Mo) pendant SHP + PDF — approximation (pas pic mémoire).
   * `null` si absent (ex. téléchargement natif même origine sans `fetch`).
   */
  rssDeltaMb: number | null;
};

/**
 * Rapport PDF — même jeu de données que CSV/SHP parcelles (run optionnel).
 * En **même origine** (dev via proxy Vite) : lien `<a download>` pour éviter
 * « TypeError: Failed to fetch » sur gros binaires / proxy. Sinon `fetch` + blob.
 */
export async function exportRapportPdf(
  projectId: string,
  poolRunId?: string | null,
): Promise<RapportPdfExportResult> {
  const q = new URLSearchParams();
  if (poolRunId) q.set("run_id", poolRunId);
  const qs = q.toString();
  const path = `/api/projects/${projectId}/export/rapport-pdf${qs ? `?${qs}` : ""}`;
  const url = apiUrlForFetch(path);
  const filename = `rapport_${projectId.slice(0, 8)}.pdf`;

  if (isSameOriginAsPage(url)) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { rssDeltaMb: null };
  }

  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur lors de la génération du rapport PDF");
  }
  const rssRaw = res.headers.get("X-Rapport-Rss-Delta-Mb");
  const rssParsed =
    rssRaw != null && rssRaw.trim() !== "" ? Number.parseFloat(rssRaw.trim()) : NaN;
  const rssDeltaMb = Number.isFinite(rssParsed) ? rssParsed : null;
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
  return { rssDeltaMb };
}

export async function fetchResultsLayerGeojson(
  projectId: string,
  layerKey: string,
  poolRunId?: string | null,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const q = new URLSearchParams();
  if (poolRunId) q.set("run_id", poolRunId);
  const qs = q.toString();
  const res = await fetch(
    `${API}/api/projects/${projectId}/geojson/results/${layerKey}${qs ? `?${qs}` : ""}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Charge en parallèle toutes les couches thématiques (RESULTS_LAYERS) pour un projet.
 * À appeler après un filtrage réussi pour affichage carte instantané (couches toujours masquées par défaut).
 */
export async function prefetchAllResultsThematicLayers(
  projectId: string,
  poolRunId?: string | null,
  layerKeys?: string[],
): Promise<ResultsThematicPreload> {
  const defs = layerKeys?.length
    ? getResultsLayerDefs(layerKeys)
    : RESULTS_LAYERS;
  const out: ResultsThematicPreload = {};
  await Promise.all(
    defs.map(async (def) => {
      try {
        const data = await fetchResultsLayerGeojson(projectId, def.key, poolRunId);
        out[def.key] = { geojson: data, error: null };
      } catch (e) {
        out[def.key] = {
          geojson: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  return out;
}

export type { ResultsThematicPreload };