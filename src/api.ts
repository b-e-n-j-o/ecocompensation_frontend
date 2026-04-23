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
  type ResultsThematicPreload,
} from "./components/ResultPanel/MapResults/cartoCouchesRegistry";

/**
 * Base URL du backend.
 * En dev, chaîne vide → URLs relatives (`/api/...`) et proxy Vite : même origine, pas de CORS.
 * Sinon `fetch` vers `http://localhost:8000` depuis le port 5173 peut échouer (« Failed to fetch »).
 * Surcharger avec VITE_API_URL si besoin d’appeler le backend en direct.
 */
const API =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");
const IDECO_API =
  import.meta.env.VITE_IDECO_API_URL?.trim() ||
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
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

export type StudyFromParcelleBody = {
  insee: string;
  section: string;
  numeros: string[];
  buffer_m: number;
  nom_couche?: string | null;
  dry_run?: boolean;
};

export type StudyFromParcelleResponse = {
  project_id: string;
  logs: string[];
};

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${API}/api/projects`);
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

export async function createStudyFromParcelle(
  body: StudyFromParcelleBody,
): Promise<StudyFromParcelleResponse> {
  const res = await fetch(`${IDECO_API}/api/studies/from-parcelle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type FromParcelleBody = {
  code_insee: string;
  section: string;
  numero: string;
  name: string;
  buffer_km: number;
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
  feature: {
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

export async function previewFoncierUpload(file: File): Promise<FoncierUploadPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
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
  file: File;
}): Promise<FoncierImportResponse> {
  const form = new FormData();
  form.append("name", params.name);
  form.append("buffer_km", String(params.buffer_km));
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

export async function runFilter(
  projectId: string,
  options: FilterOptions
): Promise<FilterResponse> {
  const payload = buildFilterRequestPayload(options);
  const res = await fetch(`${API}/api/projects/${projectId}/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwHttpError(res);
  return res.json();
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

export async function runFilterUF(
  projectId: string,
  options: FilterOptions
): Promise<UfFilterResponse> {
  const payload = buildFilterRequestPayload(options);
  const res = await fetch(`${API}/api/projects/${projectId}/filter/uf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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

/** Derniers résultats JSON stockés sur le projet (UF, etc.). */
export async function fetchProjectStoredResults(projectId: string): Promise<{
  last_results_uf: unknown;
  last_filter_uf: unknown;
}> {
  const res = await fetch(`${API}/api/projects/${projectId}/results`);
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as {
    last_results_uf?: unknown;
    last_filter_uf?: unknown;
  };
  return {
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
  const p = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `${window.location.origin}${p}`;
  }
  const explicit = import.meta.env.VITE_API_URL?.trim();
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}${p}`;
  }
  return `http://localhost:8000${p}`;
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

export type IdentiteFonciereParcelleInput = {
  section: string;
  numero: string;
  insee: string;
  commune: string;
};

export type IdentiteFonciereOptionsInput = {
  buffer_wfs_m?: number;
  generer_carte_plu?: boolean;
  dpi_carte?: number;
  layers?: string[];
};

export type IdentiteFonciereRequest = {
  parcelles: IdentiteFonciereParcelleInput[];
  options?: IdentiteFonciereOptionsInput;
};

export type UrbanDocFile = {
  name: string;
  url: string;
  score_reglement: number;
};

export type UrbanDocsResponse = {
  insee: string;
  commune: string;
  idurba: string;
  gpu_doc_id: string;
  typedoc: string;
  files: UrbanDocFile[];
  reglement_name?: string | null;
  reglement_url?: string | null;
};

function parseFilenameFromContentDisposition(header: string | null): string {
  if (!header) return "identite_fonciere.pdf";
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = header.match(/filename="?([^"]+)"?/i);
  if (asciiMatch?.[1]) return asciiMatch[1];
  return "identite_fonciere.pdf";
}

export async function generateIdentiteFoncierePdf(
  body: IdentiteFonciereRequest,
): Promise<{ blob: Blob; filename: string }> {
  const path = "/api/identite-fonciere/rapport";
  const url = apiUrlForFetch(path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      const detail =
        typeof parsed.detail === "string"
          ? parsed.detail
          : JSON.stringify(parsed.detail ?? parsed);
      throw new Error(detail || "Erreur lors de la génération du rapport Identité Foncière");
    } catch {
      throw new Error(raw || "Erreur lors de la génération du rapport Identité Foncière");
    }
  }

  const blob = await res.blob();
  const filename = parseFilenameFromContentDisposition(
    res.headers.get("Content-Disposition"),
  );
  return { blob, filename };
}

export async function fetchUrbanDocumentsForInsee(
  insee: string,
): Promise<UrbanDocsResponse> {
  const path = `/api/identite-fonciere/urban-documents/${encodeURIComponent(insee.trim())}`;
  const url = apiUrlForFetch(path);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { detail?: unknown };
      const detail =
        typeof parsed.detail === "string"
          ? parsed.detail
          : JSON.stringify(parsed.detail ?? parsed);
      throw new Error(detail || "Erreur lors du chargement des documents d'urbanisme");
    } catch {
      throw new Error(raw || "Erreur lors du chargement des documents d'urbanisme");
    }
  }
  return res.json();
}

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
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const res = await fetch(`${API}/api/projects/${projectId}/geojson/results/${layerKey}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Charge en parallèle toutes les couches thématiques (RESULTS_LAYERS) pour un projet.
 * À appeler après un filtrage réussi pour affichage carte instantané (couches toujours masquées par défaut).
 */
export async function prefetchAllResultsThematicLayers(
  projectId: string,
): Promise<ResultsThematicPreload> {
  const out: ResultsThematicPreload = {};
  await Promise.all(
    RESULTS_LAYERS.map(async (def) => {
      try {
        const data = await fetchResultsLayerGeojson(projectId, def.key);
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