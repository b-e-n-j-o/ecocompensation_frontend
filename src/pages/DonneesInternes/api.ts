import type { FeatureCollection } from "geojson";
import { getApiBaseUrl, resolveApiUrl } from "../../config/apiBase";

const API = getApiBaseUrl();

export const MVT_SOURCE_LAYER = "default";

export type LayerStyle = {
  cluster: boolean;
  cluster_max_zoom: number;
  cluster_radius: number;
  geom_min_zoom: number | null;
};

export type InternalLayerInfo = {
  key: string;
  label: string;
  geometry_type: "polygon" | "line" | "point" | string;
  color: string;
  default_visible: boolean;
  count: number;
  bounds: [number, number, number, number] | null;
  available: boolean;
  style?: LayerStyle;
  delivery?: "geojson" | "mvt" | "mbtiles" | string;
  min_zoom?: number | null;
  max_zoom?: number | null;
  color_property?: string | null;
  class_colors?: Record<string, string>;
  class_labels?: Record<string, string>;
  family?: string;
  family_label?: string;
};

const DEFAULT_STYLE: LayerStyle = {
  cluster: false,
  cluster_max_zoom: 12,
  cluster_radius: 56,
  geom_min_zoom: null,
};

export function layerStyle(layer: InternalLayerInfo): LayerStyle {
  return { ...DEFAULT_STYLE, ...(layer.style ?? {}) };
}

export function isMvtLayer(layer: InternalLayerInfo): boolean {
  return layer.delivery === "mvt" || layer.delivery === "mbtiles";
}

export function internalLayerTileUrl(key: string): string {
  return `${resolveApiUrl(`/api/data-interne/layers/${encodeURIComponent(key)}/tiles`)}/{z}/{x}/{y}.mvt`;
}

export async function fetchInternalLayers(): Promise<InternalLayerInfo[]> {
  const r = await fetch(`${API}/api/data-interne/layers`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { layers: InternalLayerInfo[] };
  return data.layers ?? [];
}

export async function fetchInternalLayerGeoJSON(key: string): Promise<FeatureCollection> {
  const r = await fetch(`${API}/api/data-interne/layers/${encodeURIComponent(key)}/geojson`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as FeatureCollection;
}

export async function fetchInternalLayerCentroids(key: string): Promise<FeatureCollection> {
  const r = await fetch(`${API}/api/data-interne/layers/${encodeURIComponent(key)}/centroids`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as FeatureCollection;
}
