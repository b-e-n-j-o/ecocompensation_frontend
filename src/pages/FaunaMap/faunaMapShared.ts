import buffer from "@turf/buffer";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";

import { getApiBaseUrl } from "../../config/apiBase";

/** En dev : `/api/fauna` (proxy Vite). En prod : `VITE_API_URL` + `/api/fauna`. */
export const API_BASE = `${getApiBaseUrl()}/api/fauna`;
export const USER_SHP_SOURCE = "user-shp";
export const USER_SHP_CENTROID_SOURCE = "user-shp-centroid";
export const DRAW_ZONE_SOURCE = "fauna-draw-zone";
export const DRAW_BBOX_SOURCE = "fauna-draw-bbox";
export const DRAW_POINT_SOURCE = "fauna-draw-point";
export const DRAW_RADIUS_SOURCE = "fauna-draw-radius";
export const FAUNA_POINTS_SOURCE = "fauna-points";
export const FAUNA_BUFFERS_SOURCE = "fauna-buffers";
/** Propriété de couleur des points. Pas de préfixe `_` : Supercluster les ignore. */
export const FAUNA_COLOR_PROP = "faunaColor";
export const SPECIES_PANEL_LIMIT = 150;
export const ECO_POINT_COLOR = "#289f01";
export const MIN_BBOX_SPAN_DEG = 0.0008;
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 50;
export const DEFAULT_RADIUS_KM = 2;

export const PALETTE = [
  "#289f01",
  "#5c6bc0",
  "#ab47bc",
  "#ef5350",
  "#42a5f5",
  "#26a69a",
  "#ffa726",
  "#ff7043",
  "#8d6e63",
  "#ec407a",
  "#7e57c2",
  "#d4e157",
];

export type SearchMode = "species" | "all_bbox";
export type ExtentKind = "viewport" | "bbox" | "point" | "none";
export type DrawTool = "bbox" | "point";

export type CatalogTaxon = {
  tax: string;
  protection_nationale?: string | null;
  niveau_patrimonialite?: string | null;
};

export type SelectedInfo = { label: string; color: string; bufferM: number };

export type AllSpeciesEntry = {
  name: string;
  count: number;
  color: string;
  visible: boolean;
};

export type ObservationsPayload = Record<string, unknown>;

const GOLDEN_HUE_STEP = 137.508;

export function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function bboxLngLatFromFeatureCollection(fc: FeatureCollection): [number, number, number, number] | null {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  let count = 0;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const a = coords[0];
    const c = coords[1];
    if (typeof a === "number" && typeof c === "number") {
      w = Math.min(w, a);
      e = Math.max(e, a);
      s = Math.min(s, c);
      n = Math.max(n, c);
      count++;
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || g.type === "GeometryCollection") continue;
    if ("coordinates" in g) walk(g.coordinates);
  }
  if (count === 0 || !Number.isFinite(w) || !Number.isFinite(s)) return null;
  return [w, s, e, n];
}

export function centroidMarkerFromBbox(bbox: [number, number, number, number]): FeatureCollection {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const feature: Feature = {
    type: "Feature",
    properties: { _importCentroid: true },
    geometry: {
      type: "Point",
      coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    },
  };
  return { type: "FeatureCollection", features: [feature] };
}

export function escapeHtml(s: unknown): string {
  if (s == null) return "";
  const ent: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(s).replace(/[&<>"']/g, (c) => ent[c] ?? c);
}

export function normalizeForSearch(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function setGeoJSONSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection) {
  const src = map.getSource(sourceId);
  if (src && "setData" in src && typeof (src as maplibregl.GeoJSONSource).setData === "function") {
    (src as maplibregl.GeoJSONSource).setData(data);
  }
}

export function buffersFromPoints(
  points: FeatureCollection,
  selectedMap: Map<string, SelectedInfo>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const f of points.features) {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const tax = String(props.nom_vernaculaire ?? "");
    const info = selectedMap.get(tax);
    const bufM = info?.bufferM ?? 0;
    if (!info || bufM <= 0) continue;
    const geom = f.geometry;
    if (!geom || (geom.type !== "Point" && geom.type !== "MultiPoint")) continue;
    const buffered = buffer(f, bufM / 1000, { units: "kilometers", steps: 24 });
    if (!buffered) continue;
    features.push({
      ...buffered,
      properties: {
        nom_vernaculaire: tax,
        buffer_m: bufM,
        [FAUNA_COLOR_PROP]: info.color,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function bboxFromCorners(a: [number, number], b: [number, number]): [number, number, number, number] {
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  return [Math.min(lngA, lngB), Math.min(latA, latB), Math.max(lngA, lngB), Math.max(latA, latB)];
}

export function isBboxLargeEnough(bbox: [number, number, number, number]): boolean {
  const [w, s, e, n] = bbox;
  return e - w >= MIN_BBOX_SPAN_DEG && n - s >= MIN_BBOX_SPAN_DEG;
}

export function formatBbox(bbox: [number, number, number, number]): string {
  const [w, s, e, n] = bbox;
  return `${w.toFixed(4)}°O · ${s.toFixed(4)}°S → ${e.toFixed(4)}°E · ${n.toFixed(4)}°N`;
}

export function bboxRectFC(bbox: [number, number, number, number] | null): FeatureCollection {
  if (!bbox) return emptyFC();
  const [w, s, e, n] = bbox;
  const feature: Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  };
  return { type: "FeatureCollection", features: [feature] };
}

export function pointFC(center: [number, number] | null): FeatureCollection {
  if (!center) return emptyFC();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: center },
      },
    ],
  };
}

export function radiusCircleFC(center: [number, number] | null, radiusKm: number): FeatureCollection {
  if (!center || radiusKm <= 0) return emptyFC();
  const pt: Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: center },
  };
  const buffered = buffer(pt, radiusKm, { units: "kilometers", steps: 64 });
  if (!buffered) return emptyFC();
  return { type: "FeatureCollection", features: [buffered] };
}

export function formatPoint(center: [number, number]): string {
  const [lon, lat] = center;
  return `${lon.toFixed(5)}°, ${lat.toFixed(5)}°`;
}

export function formatRadiusKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

export function clampRadiusKm(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, raw));
}

export type ExtentLayerState = {
  draftBbox: [number, number, number, number] | null;
  validatedBbox: [number, number, number, number] | null;
  searchPoint: [number, number] | null;
  radiusKm: number;
  extentKind: ExtentKind;
  drawActive: boolean;
  drawTool: DrawTool;
};

export function syncExtentLayers(map: MapLibreMap, state: ExtentLayerState) {
  const showBboxDraft = Boolean(state.draftBbox) && !state.validatedBbox;
  const showBbox = state.extentKind === "bbox" && Boolean(state.validatedBbox);
  const showPoint = state.extentKind === "point" || (state.drawActive && state.drawTool === "point");

  if (map.getSource(DRAW_ZONE_SOURCE)) {
    setGeoJSONSourceData(map, DRAW_ZONE_SOURCE, bboxRectFC(showBboxDraft ? state.draftBbox : null));
  }
  if (map.getSource(DRAW_BBOX_SOURCE)) {
    setGeoJSONSourceData(map, DRAW_BBOX_SOURCE, bboxRectFC(showBbox ? state.validatedBbox : null));
  }
  if (map.getSource(DRAW_POINT_SOURCE)) {
    setGeoJSONSourceData(map, DRAW_POINT_SOURCE, showPoint ? pointFC(state.searchPoint) : emptyFC());
  }
  if (map.getSource(DRAW_RADIUS_SOURCE)) {
    setGeoJSONSourceData(
      map,
      DRAW_RADIUS_SOURCE,
      showPoint ? radiusCircleFC(state.searchPoint, state.radiusKm) : emptyFC(),
    );
  }
}

export function buildSpeciesColorMap(names: string[]): Map<string, string> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "fr"));
  const out = new Map<string, string>();
  sorted.forEach((name, i) => {
    const hue = Math.round((i * GOLDEN_HUE_STEP) % 360);
    const sat = 58 + (i % 4) * 8;
    const light = 38 + (i % 3) * 6;
    out.set(name, `hsl(${hue}, ${sat}%, ${light}%)`);
  });
  return out;
}

export function buildAllSpeciesEntries(points: FeatureCollection): Map<string, AllSpeciesEntry> {
  const counts = new Map<string, number>();
  for (const f of points.features) {
    const name = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "—").trim() || "—";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const colors = buildSpeciesColorMap([...counts.keys()]);
  const entries = new Map<string, AllSpeciesEntry>();
  for (const [name, count] of counts) {
    entries.set(name, {
      name,
      count,
      color: colors.get(name) ?? "#888888",
      visible: true,
    });
  }
  return entries;
}

export function pointsFcForAllSpecies(
  raw: FeatureCollection,
  entries: Map<string, AllSpeciesEntry>,
): FeatureCollection {
  const features = raw.features
    .filter((f) => {
      const name = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "—").trim() || "—";
      return entries.get(name)?.visible ?? false;
    })
    .map((f) => {
      const props = { ...(f.properties as Record<string, unknown>) };
      const name = String(props.nom_vernaculaire ?? "—").trim() || "—";
      const entry = entries.get(name);
      props[FAUNA_COLOR_PROP] = entry?.color ?? "#888888";
      return { ...f, properties: props };
    });
  return { type: "FeatureCollection", features };
}

export function setMapDrawMode(map: MapLibreMap, enabled: boolean) {
  const canvas = map.getCanvas();
  if (enabled) {
    map.dragPan.disable();
    map.dragRotate.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    canvas.style.cursor = "crosshair";
  } else {
    map.dragPan.enable();
    map.dragRotate.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.touchZoomRotate.enable();
    canvas.style.cursor = "";
  }
}

export function lngLatFromClient(map: MapLibreMap, clientX: number, clientY: number): [number, number] {
  const rect = map.getCanvas().getBoundingClientRect();
  const p = map.unproject([clientX - rect.left, clientY - rect.top]);
  return [p.lng, p.lat];
}

export const FAUNA_LAYER_IDS = [
  `${FAUNA_BUFFERS_SOURCE}-fill`,
  `${FAUNA_BUFFERS_SOURCE}-line`,
  "fauna-draw-zone-fill",
  "fauna-draw-zone-line",
  "fauna-draw-bbox-fill",
  "fauna-draw-bbox-line",
  "fauna-draw-radius-fill",
  "fauna-draw-radius-line",
  "fauna-draw-point-halo",
  "fauna-draw-point-core",
  `${FAUNA_POINTS_SOURCE}-clusters`,
  `${FAUNA_POINTS_SOURCE}-cluster-count`,
  `${FAUNA_POINTS_SOURCE}-circle`,
] as const;

export function raiseFaunaLayers(map: MapLibreMap) {
  for (const id of FAUNA_LAYER_IDS) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

export function setFaunaLayersVisible(map: MapLibreMap, visOn: boolean) {
  const vis = visOn ? "visible" : "none";
  for (const id of [`${FAUNA_BUFFERS_SOURCE}-fill`, `${FAUNA_BUFFERS_SOURCE}-line`, `${FAUNA_POINTS_SOURCE}-clusters`, `${FAUNA_POINTS_SOURCE}-cluster-count`, `${FAUNA_POINTS_SOURCE}-circle`]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}
