import type { FilterOptions, FilterResponse } from "./types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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

export async function fetchParcellesGeojson(
  projectId: string
): Promise<{ type: "FeatureCollection"; features: unknown[] }> {
  const res = await fetch(`${API}/api/projects/${projectId}/geojson`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportCsv(projectId: string): Promise<void> {
  const res = await fetch(`${API}/api/projects/${projectId}/export/csv`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur lors de l'export CSV");
  }

  // Télécharger le fichier
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parcelles_${projectId.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function exportShp(projectId: string): Promise<void> {
  const res = await fetch(`${API}/api/projects/${projectId}/export/shp`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Erreur lors de l'export SHP");
  }
  
  // Télécharger le fichier
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parcelles_${projectId.slice(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}