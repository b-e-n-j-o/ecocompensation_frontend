import type { FilterOptions, FilterResponse, UfFilterResponse } from "./types";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import {
  RESULTS_LAYERS,
  type ResultsThematicPreload,
} from "./components/ResultPanel/MapResults/cartoCouchesRegistry";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const IDECO_API =
  import.meta.env.VITE_IDECO_API_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  layers_status: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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

export async function runFilter(
  projectId: string,
  options: FilterOptions
): Promise<FilterResponse> {
  const res = await fetch(`${API}/api/projects/${projectId}/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runFilterUF(
  projectId: string,
  options: FilterOptions
): Promise<UfFilterResponse> {
  const res = await fetch(`${API}/api/projects/${projectId}/filter/uf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options }),
  });
  if (!res.ok) throw new Error(await res.text());
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
  projectId: string
): Promise<{ type: "FeatureCollection"; features: unknown[] }> {
  const res = await fetch(`${API}/api/projects/${projectId}/geojson`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
export type ExportScope = "parcelles" | "uf";

export async function exportCsv(
  projectId: string,
  scope: ExportScope = "parcelles",
): Promise<void> {
  const q = new URLSearchParams({ scope });
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
): Promise<void> {
  const q = new URLSearchParams({ scope });
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