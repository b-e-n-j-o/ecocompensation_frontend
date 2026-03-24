import type { FilterOptions, FilterResponse, UfFilterResponse } from "./types";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

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

export async function fetchProjectContextGeometry(
  projectId: string
): Promise<ProjectContextGeometryResponse> {
  const res = await fetch(`${API}/api/projects/${projectId}/context-geometry`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startFetch(projectId: string): Promise<{ status: string }> {
  const res = await fetch(`${API}/api/projects/${projectId}/fetch`, {
    method: "POST",
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