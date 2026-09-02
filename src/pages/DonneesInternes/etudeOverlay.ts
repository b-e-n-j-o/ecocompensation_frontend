import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";

import {
  fetchParcellesGeojson,
  fetchPoolIndesirables,
  fetchPoolRunMetricsBulk,
  fetchProjectContextGeometry,
} from "../../api";
import type { InternalLayerInfo } from "./api";

export const ETUDE_FAMILY = "etude";
export const ETUDE_FAMILY_LABEL = "Étude";

type EtudeLayerDef = {
  key: string;
  label: string;
  color: string;
  default_visible: boolean;
};

export const ETUDE_LAYER_DEFS: readonly EtudeLayerDef[] = [
  { key: "etude-foncier", label: "Zone projet", color: "#ff4fa3", default_visible: true },
  { key: "etude-aoi", label: "Aire d'étude", color: "#3b82f6", default_visible: true },
  { key: "etude-pool", label: "Pool — retenues", color: "#289f01", default_visible: true },
  { key: "etude-ajoutees", label: "Pool — ajoutées", color: "#7c3aed", default_visible: true },
  { key: "etude-indesirables", label: "Pool — indésirables", color: "#6b7280", default_visible: true },
];

export function isEtudeLayerKey(key: string): boolean {
  return key.startsWith("etude-");
}

export function etudeLayerIds(key: string): string[] {
  const sid = `di-${key}`;
  return [`${sid}-fill`, `${sid}-line`, `${sid}-circle`];
}

export function raiseEtudeLayers(map: MapLibreMap) {
  for (const def of ETUDE_LAYER_DEFS) {
    for (const id of etudeLayerIds(def.key)) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  }
}

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function featureFromContext(
  feat: Feature<Geometry> | Record<string, unknown> | null | undefined,
  id: string,
  extra: Record<string, unknown>,
): Feature | null {
  if (!feat || typeof feat !== "object") return null;
  const geometry = (feat as Feature).geometry;
  if (!geometry) return null;
  return {
    type: "Feature",
    id,
    geometry,
    properties: {
      ...((feat as Feature).properties ?? {}),
      ...extra,
      id,
    },
  };
}

function bboxOfFc(fc: FeatureCollection): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  let ok = false;
  const walk = (coords: unknown) => {
    if (!Array.isArray(coords) || coords.length < 2) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      w = Math.min(w, coords[0]);
      e = Math.max(e, coords[0]);
      s = Math.min(s, coords[1]);
      n = Math.max(n, coords[1]);
      ok = true;
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g && g.type !== "GeometryCollection" && "coordinates" in g) walk(g.coordinates);
  }
  return ok ? [w, s, e, n] : null;
}

function asLayer(
  def: EtudeLayerDef,
  fc: FeatureCollection,
  available: boolean,
): InternalLayerInfo {
  return {
    key: def.key,
    label: def.label,
    geometry_type: "polygon",
    color: def.color,
    default_visible: def.default_visible && available && fc.features.length > 0,
    count: fc.features.length,
    bounds: bboxOfFc(fc),
    available,
    delivery: "geojson",
    family: ETUDE_FAMILY,
    family_label: ETUDE_FAMILY_LABEL,
  };
}

function isManualOrigin(metrics: { metric_key: string; metric_value_jsonb?: Record<string, unknown> }[] | undefined): boolean {
  const row = (metrics ?? []).find((m) => m.metric_key === "pool_origin");
  const src = row?.metric_value_jsonb?.source;
  return src === "manual_idu";
}

function splitParcelles(
  geojson: FeatureCollection | null,
  indesirableIdus: Set<string>,
  manualIdus: Set<string>,
): { retenues: FeatureCollection; ajoutees: FeatureCollection; indesirables: FeatureCollection } {
  const retenues: Feature[] = [];
  const ajoutees: Feature[] = [];
  const indesirables: Feature[] = [];
  for (const f of geojson?.features ?? []) {
    const idu = String(f.properties?.idu ?? f.id ?? "");
    if (!idu) continue;
    const tagged: Feature = {
      ...f,
      id: idu,
      properties: {
        ...(f.properties ?? {}),
        id: idu,
        idu,
        statut_pool: indesirableIdus.has(idu)
          ? "Indésirable"
          : manualIdus.has(idu)
            ? "Ajoutée"
            : "Retenue",
      },
    };
    if (indesirableIdus.has(idu)) indesirables.push(tagged);
    else if (manualIdus.has(idu)) ajoutees.push(tagged);
    else retenues.push(tagged);
  }
  return {
    retenues: { type: "FeatureCollection", features: retenues },
    ajoutees: { type: "FeatureCollection", features: ajoutees },
    indesirables: { type: "FeatureCollection", features: indesirables },
  };
}

export type EtudeOverlayPayload = {
  layers: InternalLayerInfo[];
  fcByKey: Record<string, FeatureCollection>;
};

export function emptyEtudeLayers(): InternalLayerInfo[] {
  return ETUDE_LAYER_DEFS.map((def) => asLayer(def, emptyFC(), false));
}

export async function loadEtudeOverlay(
  projectId: string,
  runId: string,
): Promise<EtudeOverlayPayload> {
  const [ctxSettled, geoSettled, indSettled, metricsSettled] = await Promise.allSettled([
    fetchProjectContextGeometry(projectId),
    fetchParcellesGeojson(projectId, runId),
    fetchPoolIndesirables(projectId),
    fetchPoolRunMetricsBulk(projectId, runId),
  ]);

  const ctx = ctxSettled.status === "fulfilled" ? ctxSettled.value : null;
  const rawGeo = geoSettled.status === "fulfilled" ? geoSettled.value : null;
  const geojson = (rawGeo as FeatureCollection | null) ?? emptyFC();
  const indus =
    indSettled.status === "fulfilled" ? new Set(indSettled.value.idus ?? []) : new Set<string>();
  const byIdu =
    metricsSettled.status === "fulfilled" ? (metricsSettled.value.by_idu ?? {}) : {};

  const manualIdus = new Set<string>();
  for (const [idu, rows] of Object.entries(byIdu)) {
    if (isManualOrigin(rows)) manualIdus.add(idu);
  }

  const foncierFeat = featureFromContext(
    ctx?.foncier as Feature | undefined,
    "foncier",
    { libelle: "Zone projet" },
  );
  const aoiFeat = featureFromContext(
    ctx?.aoi as Feature | undefined,
    "aoi",
    { libelle: "Aire d'étude" },
  );
  const foncier: FeatureCollection = {
    type: "FeatureCollection",
    features: foncierFeat ? [foncierFeat] : [],
  };
  const aoi: FeatureCollection = {
    type: "FeatureCollection",
    features: aoiFeat ? [aoiFeat] : [],
  };
  const split = splitParcelles(geojson, indus, manualIdus);

  const fcByKey: Record<string, FeatureCollection> = {
    "etude-foncier": foncier,
    "etude-aoi": aoi,
    "etude-pool": split.retenues,
    "etude-ajoutees": split.ajoutees,
    "etude-indesirables": split.indesirables,
  };

  const ready = Boolean(ctx) || geojson.features.length > 0;
  const layers = ETUDE_LAYER_DEFS.map((def) => {
    const fc = fcByKey[def.key] ?? emptyFC();
    return asLayer(def, fc, ready && fc.features.length > 0);
  });
  return { layers, fcByKey };
}
