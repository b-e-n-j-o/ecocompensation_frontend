import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";

import { fetchPoolMapOverlay, fetchProjectContextGeometry } from "../../api";
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

function asFc(raw: FeatureCollection | null | undefined): FeatureCollection {
  if (raw && raw.type === "FeatureCollection" && Array.isArray(raw.features)) return raw;
  return emptyFC();
}

export type EtudeOverlayPayload = {
  layers: InternalLayerInfo[];
  fcByKey: Record<string, FeatureCollection>;
};

export function emptyEtudeLayers(): InternalLayerInfo[] {
  return ETUDE_LAYER_DEFS.map((def) => asLayer(def, emptyFC(), false));
}

function payloadFromParts(parts: {
  foncier: FeatureCollection;
  aoi: FeatureCollection;
  retenues: FeatureCollection;
  ajoutees: FeatureCollection;
  indesirables: FeatureCollection;
}): EtudeOverlayPayload {
  const fcByKey: Record<string, FeatureCollection> = {
    "etude-foncier": parts.foncier,
    "etude-aoi": parts.aoi,
    "etude-pool": parts.retenues,
    "etude-ajoutees": parts.ajoutees,
    "etude-indesirables": parts.indesirables,
  };
  const ready =
    parts.foncier.features.length > 0 ||
    parts.aoi.features.length > 0 ||
    parts.retenues.features.length > 0 ||
    parts.ajoutees.features.length > 0 ||
    parts.indesirables.features.length > 0;
  const layers = ETUDE_LAYER_DEFS.map((def) => {
    const fc = fcByKey[def.key] ?? emptyFC();
    return asLayer(def, fc, ready && fc.features.length > 0);
  });
  return { layers, fcByKey };
}

function contextCollections(
  ctx: Awaited<ReturnType<typeof fetchProjectContextGeometry>> | null,
): { foncier: FeatureCollection; aoi: FeatureCollection } {
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
  return {
    foncier: { type: "FeatureCollection", features: foncierFeat ? [foncierFeat] : [] },
    aoi: { type: "FeatureCollection", features: aoiFeat ? [aoiFeat] : [] },
  };
}

/** Zone projet + AOI seulement — à peindre dès que le contexte est là. */
export async function loadEtudeContext(projectId: string): Promise<EtudeOverlayPayload> {
  const ctx = await fetchProjectContextGeometry(projectId);
  const { foncier, aoi } = contextCollections(ctx);
  return payloadFromParts({
    foncier,
    aoi,
    retenues: emptyFC(),
    ajoutees: emptyFC(),
    indesirables: emptyFC(),
  });
}

/** Pool enrichi (une requête) + contexte si pas déjà chargé. */
export async function loadEtudeOverlay(
  projectId: string,
  runId: string,
  previous?: EtudeOverlayPayload | null,
): Promise<EtudeOverlayPayload> {
  const overlayP = fetchPoolMapOverlay(projectId, runId);
  const ctxP =
    previous?.fcByKey["etude-foncier"]?.features.length || previous?.fcByKey["etude-aoi"]?.features.length
      ? Promise.resolve(null)
      : fetchProjectContextGeometry(projectId).catch(() => null);

  const [overlay, ctx] = await Promise.all([overlayP, ctxP]);
  const fromPrev = {
    foncier: previous?.fcByKey["etude-foncier"] ?? emptyFC(),
    aoi: previous?.fcByKey["etude-aoi"] ?? emptyFC(),
  };
  const fromCtx = ctx ? contextCollections(ctx) : fromPrev;
  return payloadFromParts({
    foncier: fromCtx.foncier.features.length ? fromCtx.foncier : fromPrev.foncier,
    aoi: fromCtx.aoi.features.length ? fromCtx.aoi : fromPrev.aoi,
    retenues: asFc(overlay.retenues),
    ajoutees: asFc(overlay.ajoutees),
    indesirables: asFc(overlay.indesirables),
  });
}
