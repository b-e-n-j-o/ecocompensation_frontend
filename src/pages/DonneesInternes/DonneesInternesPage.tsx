import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { zipShapefileToFeatureCollection } from "../FaunaMap/faunaShpZip";
import FaunaQueryPanel from "../FaunaMap/FaunaQueryPanel";
import { useFaunaQuery } from "../FaunaMap/useFaunaQuery";
import { raiseFaunaLayers } from "../FaunaMap/faunaMapShared";
import "../FaunaMap/FaunaMapPage.css";
import {
  fetchInternalLayerGeoJSON,
  fetchInternalLayerCentroids,
  fetchInternalLayers,
  internalLayerTileUrl,
  isMvtLayer,
  layerStyle,
  MVT_SOURCE_LAYER,
  type InternalLayerInfo,
  type LayerStyle,
} from "./api";
import {
  emptyEtudeLayers,
  ETUDE_FAMILY,
  ETUDE_LAYER_DEFS,
  isEtudeLayerKey,
  loadEtudeContext,
  loadEtudeOverlay,
  raiseEtudeLayers,
  type EtudeOverlayPayload,
} from "./etudeOverlay";
import {
  fetchAllPoolRunsList,
  fetchProjects,
  type ProjectSummary,
} from "../../api";
import type { PoolRunListItem } from "../../types";
import { getStudyProfile } from "../Etude/studyProfiles";
import { normalizeStudyType } from "../../types/studyTypes";
import "./DonneesInternesPage.css";
import { FeatureInspectSidebar, type InspectPayload, type InspectRow } from "./FeatureInspectSidebar";

const USER_SOURCE = "user-overlay";
const GIRONDE: [number, number] = [-0.58, 44.84];

const PROP_LABELS: Record<string, string> = {
  idu: "IDU",
  statut_pool: "Statut pool",
  rang: "Rang",
  rank: "Rang",
  surf_ha: "Surface (ha)",
  surface_ha: "Surface (ha)",
  dist_km: "Distance (km)",
  distance_km: "Distance (km)",
  dist_hyd: "Dist. cours d'eau (m)",
  zh_ha: "Zone humide (ha)",
  score_eco: "Score éco",
  eco_max: "Score éco max",
  score_comp: "Score composite",
  score_dur: "Dureté foncière",
  attr_fonc: "Attractivité foncière",
  dur_niv: "Niveau dureté",
  cesbio: "Occupation du sol",
  espece_esp: "Espèce",
  rayon_esp: "Dist. espèce (m)",
  p_morale: "Personne morale",
  pm_denom: "Dénomination",
  pm_prosp: "Prospect compensation",
  txt_dure: "Justification dureté",
  geo_parcel: "Parcelle",
  tex: "N°",
  nomcommune: "Commune",
  nom_commune: "Commune",
  codecommun: "Code com.",
  code_commune: "Code com.",
  code_insee: "INSEE",
  adresse: "Adresse",
  proprietai: "Propriétaire",
  propriet_1: "Adr. propriétaire",
  denomination: "Dénomination",
  siren: "SIREN",
  surface: "Surface (m²)",
  surface_ge: "Surf. géom.",
  contenance: "Contenance",
  urbain: "Urbain",
  lot: "Lot",
  comptecomm: "Compte",
  voie: "Voie",
  geo_sectio: "Section",
  section: "Section",
  numero: "N°",
  nature_culture: "Nature",
  est_acteur_public: "Acteur public",
  est_grand_industriel: "Grand industriel",
  parcelle_deja_en_mc: "Déjà en MC",
  libelle_prio: "Occupation",
  source: "Source",
  nature: "Nature",
  libelle: "Libellé",
  inventaire_id: "Id inventaire",
  inv_nom: "Inventaire",
  identifiant: "Identifiant",
  classe: "Classe",
  type: "Type",
  categorie: "Catégorie",
  sous_categorie: "Sous-catégorie",
  projet: "Projet",
  maitre_ouvrage: "Maître d'ouvrage",
  dossier_no: "Dossier",
  l_dep: "Département",
  liste_communes: "Communes",
  code: "Code",
};

const PROP_VALUE_LABELS: Record<string, string> = {
  zhe: "Zones humides effectives",
  zh_total: "Inventaire total",
};

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function featureStateSpec(ref: { source: string; id: string | number; sourceLayer?: string }) {
  return ref.sourceLayer
    ? { source: ref.source, sourceLayer: ref.sourceLayer, id: ref.id }
    : { source: ref.source, id: ref.id };
}

const SKIP_PROP_KEYS = new Set([
  "id",
  "fid",
  "cluster",
  "cluster_id",
  "point_count",
  "point_count_abbreviated",
]);

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatPropValue(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (v === "true" || v === "t") return "Oui";
  if (v === "false" || v === "f") return "Non";
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isInteger(v) ? v.toLocaleString("fr-FR") : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  }
  if (Array.isArray(v)) {
    return v.map((item) => formatPropValue(item)).filter(Boolean).join(" · ");
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  const s = String(v).trim();
  if (PROP_VALUE_LABELS[s]) return PROP_VALUE_LABELS[s];
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
  return s;
}

function featureTitle(props: Record<string, unknown>): string {
  return (
    String(
      [props.tex, props.numero, props.nomcommune || props.nom_commune].filter(Boolean).join(" · ") ||
        props.libelle_prio ||
        props.idu ||
        props.libelle ||
        props.inv_nom ||
        props.projet ||
        (typeof props.source === "string" ? PROP_VALUE_LABELS[props.source] : "") ||
        props.denomination ||
        (props.identifiant != null ? `GEOMCE ${props.identifiant}` : "") ||
        "",
    ).trim() || "Entité"
  );
}

function collectInspectRows(props: Record<string, unknown>): InspectRow[] {
  const seen = new Set<string>();
  const rows: InspectRow[] = [];
  for (const [key, label] of Object.entries(PROP_LABELS)) {
    if (!(key in props) || SKIP_PROP_KEYS.has(key)) continue;
    const val = formatPropValue(props[key]);
    if (!val) continue;
    seen.add(key);
    rows.push({ key, label, value: val });
  }
  for (const [key, raw] of Object.entries(props)) {
    if (seen.has(key) || SKIP_PROP_KEYS.has(key) || key.startsWith("_")) continue;
    const val = formatPropValue(raw);
    if (!val) continue;
    rows.push({ key, label: PROP_LABELS[key] ?? humanizeKey(key), value: val });
  }
  return rows;
}

function sourceId(key: string): string {
  return `di-${key}`;
}

function ptsSourceId(key: string): string {
  return `di-${key}-pts`;
}

function layerIds(key: string): string[] {
  const sid = sourceId(key);
  return [
    `${sid}-fill`,
    `${sid}-line`,
    `${sid}-circle`,
    `${sid}-cluster-halo`,
    `${sid}-cluster`,
    `${sid}-cluster-count`,
    `${sid}-unclustered`,
  ];
}

function averagePositions(coords: unknown, acc: { x: number; y: number; n: number }) {
  if (!Array.isArray(coords) || coords.length < 2) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    acc.x += coords[0];
    acc.y += coords[1];
    acc.n += 1;
    return;
  }
  for (const part of coords) averagePositions(part, acc);
}

function centroidsFc(fc: FeatureCollection): FeatureCollection {
  const features: Feature[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || g.type === "GeometryCollection") continue;
    if (g.type === "Point") {
      features.push({ type: "Feature", id: f.id, properties: f.properties ?? {}, geometry: g });
      continue;
    }
    const acc = { x: 0, y: 0, n: 0 };
    if ("coordinates" in g) averagePositions(g.coordinates, acc);
    if (!acc.n) continue;
    features.push({
      type: "Feature",
      id: f.id,
      properties: f.properties ?? {},
      geometry: { type: "Point", coordinates: [acc.x / acc.n, acc.y / acc.n] },
    });
  }
  return { type: "FeatureCollection", features };
}

type HiddenClasses = Record<string, Record<string, boolean>>;

function layerFillColor(layer: InternalLayerInfo): string | maplibregl.ExpressionSpecification {
  const colors = layer.class_colors;
  const prop = layer.color_property;
  if (!colors || !prop || Object.keys(colors).length === 0) return layer.color;
  const expr: unknown[] = ["match", ["get", prop]];
  for (const [label, color] of Object.entries(colors)) {
    expr.push(label, color);
  }
  expr.push(layer.color);
  return expr as maplibregl.ExpressionSpecification;
}

function hiddenClassValues(hidden: HiddenClasses, key: string): string[] {
  const bag = hidden[key];
  if (!bag) return [];
  return Object.keys(bag).filter((name) => bag[name]);
}

function classVisibilityFilter(
  layer: InternalLayerInfo,
  hidden: HiddenClasses,
): maplibregl.FilterSpecification | null {
  const prop = layer.color_property;
  const off = hiddenClassValues(hidden, layer.key);
  if (!prop || off.length === 0) return null;
  return ["!", ["in", ["get", prop], ["literal", off]]];
}

function applyClassFilter(map: MapLibreMap, layer: InternalLayerInfo, hidden: HiddenClasses) {
  const sid = sourceId(layer.key);
  const filter = classVisibilityFilter(layer, hidden);
  for (const kind of ["fill", "line", "circle"] as const) {
    const id = `${sid}-${kind}`;
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

function filterFcByClass(
  fc: FeatureCollection,
  layer: InternalLayerInfo,
  hidden: HiddenClasses,
): FeatureCollection {
  const prop = layer.color_property;
  const off = new Set(hiddenClassValues(hidden, layer.key));
  if (!prop || off.size === 0) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.filter((f) => {
      const v = f.properties?.[prop];
      return v == null || !off.has(String(v));
    }),
  };
}

function paintHover(cover: boolean) {
  const hoverOp: maplibregl.ExpressionSpecification = [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    cover ? 0.55 : 0.42,
    cover ? 0.38 : 0.2,
  ];
  const hoverW: maplibregl.ExpressionSpecification = [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    2.2,
    cover ? 0.7 : 1.15,
  ];
  return { hoverOp, hoverW };
}

function ensureLayerOnMap(map: MapLibreMap, layer: InternalLayerInfo) {
  const sid = sourceId(layer.key);
  const style = layerStyle(layer);
  const cover = Boolean(layer.class_colors && Object.keys(layer.class_colors).length);
  const { hoverOp, hoverW } = paintHover(cover);
  const fillColor = layerFillColor(layer);

  if (isMvtLayer(layer)) {
    if (!map.getSource(sid)) {
      const minZ = layer.min_zoom ?? 0;
      // maxzoom source = plus haut zoom *avec* tuiles. Au-delà, MapLibre sur-zoome.
      // MBTiles dump défaut z14 ; ne pas mettre 16 sinon requêtes vides et disparition.
      const maxZ = layer.max_zoom ?? (layer.delivery === "mbtiles" ? 14 : 16);
      map.addSource(sid, {
        type: "vector",
        tiles: [internalLayerTileUrl(layer.key)],
        minzoom: minZ,
        maxzoom: maxZ,
        ...(layer.bounds ? { bounds: layer.bounds } : {}),
        promoteId: { [MVT_SOURCE_LAYER]: "fid" },
      });
      if (layer.geometry_type === "polygon") {
        map.addLayer({
          id: `${sid}-fill`,
          type: "fill",
          source: sid,
          "source-layer": MVT_SOURCE_LAYER,
          minzoom: minZ,
          paint: { "fill-color": fillColor, "fill-opacity": hoverOp },
        });
        map.addLayer({
          id: `${sid}-line`,
          type: "line",
          source: sid,
          "source-layer": MVT_SOURCE_LAYER,
          minzoom: minZ,
          paint: { "line-color": fillColor, "line-width": hoverW, "line-opacity": 0.85 },
        });
      } else if (layer.geometry_type === "line") {
        map.addLayer({
          id: `${sid}-line`,
          type: "line",
          source: sid,
          "source-layer": MVT_SOURCE_LAYER,
          minzoom: minZ,
          paint: {
            "line-color": fillColor,
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              3.2,
              2.0,
            ],
            "line-opacity": 0.92,
          },
        });
      } else {
        map.addLayer({
          id: `${sid}-circle`,
          type: "circle",
          source: sid,
          "source-layer": MVT_SOURCE_LAYER,
          minzoom: minZ,
          paint: {
            "circle-color": fillColor,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 16, 7],
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.92,
          },
        });
      }
    }
    if (style.cluster && !map.getSource(ptsSourceId(layer.key))) {
      addClusterLayers(map, layer, style);
    }
    return;
  }

  if (!map.getSource(sid)) {
    map.addSource(sid, { type: "geojson", data: emptyFC(), promoteId: "id" });

    if (layer.geometry_type === "polygon") {
      map.addLayer({
        id: `${sid}-fill`,
        type: "fill",
        source: sid,
        paint: { "fill-color": layer.color, "fill-opacity": hoverOp },
      });
      map.addLayer({
        id: `${sid}-line`,
        type: "line",
        source: sid,
        paint: {
          "line-color": layer.color,
          "line-width": hoverW,
          "line-opacity": 0.95,
        },
      });
    } else if (layer.geometry_type === "line") {
      map.addLayer({
        id: `${sid}-line`,
        type: "line",
        source: sid,
        paint: { "line-color": layer.color, "line-width": 2, "line-opacity": 0.9 },
      });
    } else if (!style.cluster) {
      map.addLayer({
        id: `${sid}-circle`,
        type: "circle",
        source: sid,
        paint: {
          "circle-color": layer.color,
          "circle-radius": 5,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#fff",
        },
      });
    }
  }

  if (style.cluster && !map.getSource(ptsSourceId(layer.key))) {
    addClusterLayers(map, layer, style);
  }
}

function removeLayerFromMap(map: MapLibreMap, layer: InternalLayerInfo) {
  for (const id of layerIds(layer.key)) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  const pts = ptsSourceId(layer.key);
  if (map.getSource(pts)) map.removeSource(pts);
  const sid = sourceId(layer.key);
  if (map.getSource(sid)) map.removeSource(sid);
}

function addClusterLayers(map: MapLibreMap, layer: InternalLayerInfo, style: LayerStyle) {
  const sid = sourceId(layer.key);
  const pts = ptsSourceId(layer.key);
  const maxZ = style.geom_min_zoom ?? style.cluster_max_zoom + 1;

  map.addSource(pts, {
    type: "geojson",
    data: emptyFC(),
    cluster: true,
    clusterMaxZoom: style.cluster_max_zoom,
    clusterRadius: style.cluster_radius,
  });

  map.addLayer({
    id: `${sid}-cluster-halo`,
    type: "circle",
    source: pts,
    filter: ["has", "point_count"],
    maxzoom: maxZ,
    paint: {
      "circle-color": layer.color,
      "circle-opacity": 0.22,
      "circle-radius": ["step", ["get", "point_count"], 28, 8, 36, 20, 46],
      "circle-blur": 0.35,
    },
  });
  map.addLayer({
    id: `${sid}-cluster`,
    type: "circle",
    source: pts,
    filter: ["has", "point_count"],
    maxzoom: maxZ,
    paint: {
      "circle-color": layer.color,
      "circle-opacity": 0.88,
      "circle-radius": ["step", ["get", "point_count"], 14, 8, 18, 20, 22],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: `${sid}-unclustered`,
    type: "circle",
    source: pts,
    filter: ["!", ["has", "point_count"]],
    maxzoom: maxZ,
    paint: {
      "circle-color": layerFillColor(layer),
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 8, 12, 10, 14, 6],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92,
    },
  });
  try {
    map.addLayer({
      id: `${sid}-cluster-count`,
      type: "symbol",
      source: pts,
      filter: ["has", "point_count"],
      maxzoom: maxZ,
      layout: {
        "text-field": ["to-string", ["get", "point_count"]],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#ffffff" },
    });
  } catch {
    /* glyphs indisponibles : les pastilles suffisent */
  }
}

function setSourceData(map: MapLibreMap, sid: string, data: FeatureCollection) {
  const src = map.getSource(sid);
  if (src && "setData" in src) (src as maplibregl.GeoJSONSource).setData(data);
}

function setLayerVisible(map: MapLibreMap, layer: InternalLayerInfo, visOn: boolean) {
  const vis = visOn ? "visible" : "none";
  for (const id of layerIds(layer.key)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

function fitBounds(map: MapLibreMap, bounds: [number, number, number, number] | null) {
  if (!bounds) return;
  const [w, s, e, n] = bounds;
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 72, maxZoom: 16, duration: 500 },
  );
}

function bboxOfFc(fc: FeatureCollection): [number, number, number, number] | null {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
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

type LayerFamily = { id: string; label: string; layers: InternalLayerInfo[] };

function groupByFamily(layers: InternalLayerInfo[]): LayerFamily[] {
  const order: string[] = [];
  const buckets = new Map<string, InternalLayerInfo[]>();
  for (const layer of layers) {
    const id = layer.family || "_";
    if (!buckets.has(id)) {
      order.push(id);
      buckets.set(id, []);
    }
    buckets.get(id)!.push(layer);
  }
  return order.map((id) => {
    const items = buckets.get(id) ?? [];
    return { id, label: items[0]?.family_label || id, layers: items };
  });
}

function layerMeta(layer: InternalLayerInfo): string {
  if (isEtudeLayerKey(layer.key)) return layer.available ? `${layer.count.toLocaleString("fr-FR")} entités` : "—";
  if (layer.delivery === "mbtiles" && layerStyle(layer).cluster) {
    return `halos puis z ≥ ${layer.min_zoom ?? 12}`;
  }
  if (layer.delivery === "mbtiles") return `tuiles · z ≥ ${layer.min_zoom ?? 12}`;
  if (isMvtLayer(layer)) return `vue · z ≥ ${layer.min_zoom ?? 12}`;
  return `${layer.count.toLocaleString("fr-FR")} entités`;
}

export default function DonneesInternesPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverRef = useRef<{ source: string; id: string | number; sourceLayer?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inspectRef = useRef<(payload: InspectPayload | null) => void>(() => undefined);
  const userNameRef = useRef<string | null>(null);
  const didFit = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [inspect, setInspect] = useState<InspectPayload | null>(null);
  inspectRef.current = setInspect;

  const [catalog, setCatalog] = useState<InternalLayerInfo[]>([]);
  const [etudeLayers, setEtudeLayers] = useState<InternalLayerInfo[]>(() => emptyEtudeLayers());
  const layers = useMemo(() => [...etudeLayers, ...catalog], [etudeLayers, catalog]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFc, setUserFc] = useState<FeatureCollection | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  userNameRef.current = userName;
  const [userVisible, setUserVisible] = useState(true);
  const [zoom, setZoom] = useState(8.4);
  const [openFam, setOpenFam] = useState<Record<string, boolean>>({});
  const [openTool, setOpenTool] = useState<Record<string, boolean>>({ files: false, fauna: false });
  const [baseMap, setBaseMap] = useState<"plan" | "satellite">("plan");
  const [hiddenClasses, setHiddenClasses] = useState<HiddenClasses>({});
  const hiddenClassesRef = useRef<HiddenClasses>({});
  hiddenClassesRef.current = hiddenClasses;
  const centroidsRef = useRef<Record<string, FeatureCollection>>({});
  const etudeFcRef = useRef<Record<string, FeatureCollection>>({});
  const fittedEtudeRunRef = useRef<string | null>(null);
  const fauna = useFaunaQuery({ mapRef, mapReady, enableShapefile: false });
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [etudeProjectId, setEtudeProjectId] = useState<string | null>(() => searchParams.get("etude"));
  const [etudeRunId, setEtudeRunId] = useState<string | null>(() => searchParams.get("pool"));
  const [etudeBusy, setEtudeBusy] = useState(false);

  const loadLayer = useCallback(async (layer: InternalLayerInfo) => {
    const map0 = mapRef.current;
    if (!map0?.isStyleLoaded() || !layer.available) return;
    const hidden = hiddenClassesRef.current;
    if (isEtudeLayerKey(layer.key)) {
      ensureLayerOnMap(map0, layer);
      setSourceData(map0, sourceId(layer.key), etudeFcRef.current[layer.key] ?? emptyFC());
      setLoaded((prev) => ({ ...prev, [layer.key]: true }));
      raiseEtudeLayers(map0);
      raiseFaunaLayers(map0);
      return;
    }
    if (isMvtLayer(layer)) {
      ensureLayerOnMap(map0, layer);
      applyClassFilter(map0, layer, hidden);
      if (layerStyle(layer).cluster) {
        const pts = await fetchInternalLayerCentroids(layer.key);
        const map = mapRef.current;
        if (!map?.isStyleLoaded()) return;
        ensureLayerOnMap(map, layer);
        applyClassFilter(map, layer, hidden);
        centroidsRef.current[layer.key] = pts;
        if (map.getSource(ptsSourceId(layer.key))) {
          setSourceData(map, ptsSourceId(layer.key), filterFcByClass(pts, layer, hidden));
        }
      }
      setLoaded((prev) => ({ ...prev, [layer.key]: true }));
      raiseEtudeLayers(map0);
      raiseFaunaLayers(map0);
      return;
    }
    ensureLayerOnMap(map0, layer);
    const fc = await fetchInternalLayerGeoJSON(layer.key);
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    ensureLayerOnMap(map, layer);
    applyClassFilter(map, layer, hidden);
    setSourceData(map, sourceId(layer.key), fc);
    if (layerStyle(layer).cluster && map.getSource(ptsSourceId(layer.key))) {
      const pts = centroidsFc(fc);
      centroidsRef.current[layer.key] = pts;
      setSourceData(map, ptsSourceId(layer.key), filterFcByClass(pts, layer, hidden));
    }
    setLoaded((prev) => ({ ...prev, [layer.key]: true }));
    raiseEtudeLayers(map);
    raiseFaunaLayers(map);
  }, []);

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [
          { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
          { id: "osm", type: "raster", source: "osm" },
        ],
      },
      center: GIRONDE,
      zoom: 8.4,
      maxPitch: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    mapRef.current = map;

    const onLoad = () => {
      map.addSource(USER_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: `${USER_SOURCE}-fill`,
        type: "fill",
        source: USER_SOURCE,
        filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
        paint: { "fill-color": "#111111", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: `${USER_SOURCE}-line`,
        type: "line",
        source: USER_SOURCE,
        paint: { "line-color": "#111111", "line-width": 1.6, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: `${USER_SOURCE}-circle`,
        type: "circle",
        source: USER_SOURCE,
        filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
        paint: {
          "circle-color": "#111111",
          "circle-radius": 4.5,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
      });
      setMapReady(true);
      setZoom(map.getZoom());
    };

    map.on("load", onLoad);
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoom", onZoom);
    return () => {
      map.off("load", onLoad);
      map.off("zoom", onZoom);
      map.remove();
      mapRef.current = null;
      didFit.current = false;
      setLoaded({});
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const catalog = await fetchInternalLayers();
        if (cancelled) return;
        setCatalog(catalog);
        const vis: Record<string, boolean> = {};
        const fam: Record<string, boolean> = { [ETUDE_FAMILY]: true };
        for (const def of ETUDE_LAYER_DEFS) vis[def.key] = false;
        for (const l of catalog) {
          vis[l.key] = l.default_visible && l.available;
          const fid = l.family || "_";
          if (fam[fid] == null) fam[fid] = false;
          if (vis[l.key]) fam[fid] = true;
        }
        setVisible((prev) => ({ ...vis, ...Object.fromEntries(
          Object.entries(prev).filter(([k]) => isEtudeLayerKey(k)),
        ) }));
        setOpenFam((prev) => ({ ...fam, ...prev, [ETUDE_FAMILY]: true }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAllPoolRunsList(200)
      .then((r) => {
        if (cancelled) return;
        setPoolRuns(r.runs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoolRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!etudeProjectId || !etudeRunId) {
      etudeFcRef.current = {};
      fittedEtudeRunRef.current = null;
      setEtudeLayers(emptyEtudeLayers());
      const map = mapRef.current;
      if (map?.isStyleLoaded()) {
        for (const placeholder of emptyEtudeLayers()) {
          if (map.getSource(sourceId(placeholder.key))) removeLayerFromMap(map, placeholder);
        }
      }
      setVisible((prev) => {
        const next = { ...prev };
        for (const def of ETUDE_LAYER_DEFS) next[def.key] = false;
        return next;
      });
      setLoaded((prev) => {
        const next = { ...prev };
        for (const def of ETUDE_LAYER_DEFS) delete next[def.key];
        return next;
      });
      return;
    }
    let cancelled = false;
    setEtudeBusy(true);
    const applyPayload = (payload: EtudeOverlayPayload, phase: "context" | "pool") => {
      etudeFcRef.current = payload.fcByKey;
      if (phase === "context") fittedEtudeRunRef.current = null;
      const map = mapRef.current;
      if (map?.isStyleLoaded()) {
        for (const l of payload.layers) {
          if (phase === "pool" && (l.key === "etude-foncier" || l.key === "etude-aoi")) continue;
          if (map.getSource(sourceId(l.key))) removeLayerFromMap(map, l);
        }
      }
      setEtudeLayers(payload.layers);
      setVisible((prev) => {
        const next = { ...prev };
        for (const l of payload.layers) next[l.key] = Boolean(l.default_visible && l.available);
        return next;
      });
      setLoaded((prev) => {
        const next = { ...prev };
        for (const l of payload.layers) {
          if (phase === "pool" && (l.key === "etude-foncier" || l.key === "etude-aoi") && prev[l.key]) {
            continue;
          }
          next[l.key] = false;
        }
        return next;
      });
      setOpenFam((prev) => ({ ...prev, [ETUDE_FAMILY]: true }));
    };

    void (async () => {
      let contextPayload: EtudeOverlayPayload | null = null;
      try {
        contextPayload = await loadEtudeContext(etudeProjectId);
        if (cancelled) return;
        applyPayload(contextPayload, "context");
      } catch {
        /* le pool peut quand même arriver */
      }
      try {
        const poolPayload = await loadEtudeOverlay(etudeProjectId, etudeRunId, contextPayload);
        if (cancelled) return;
        applyPayload(poolPayload, "pool");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setEtudeBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [etudeProjectId, etudeRunId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || layers.length === 0) return;

    let cancelled = false;
    const unloadKeys: string[] = [];
    (async () => {
      for (const layer of layers) {
        const live = mapRef.current;
        if (!live?.isStyleLoaded()) return;
        if (!visible[layer.key] || !layer.available) {
          if (isMvtLayer(layer) && live.getSource(sourceId(layer.key))) {
            removeLayerFromMap(live, layer);
            delete centroidsRef.current[layer.key];
            unloadKeys.push(layer.key);
          } else if (live.getSource(sourceId(layer.key))) {
            setLayerVisible(live, layer, false);
          }
          continue;
        }
        const alreadyOnMap = Boolean(live.getSource(sourceId(layer.key)));
        if (loaded[layer.key] && alreadyOnMap) continue;
        try {
          await loadLayer(layer);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        }
        if (cancelled) return;
      }
      if (cancelled) return;
      const live = mapRef.current;
      if (!live?.isStyleLoaded()) return;
      for (const layer of layers) {
        if (!isMvtLayer(layer) && live.getSource(sourceId(layer.key))) {
          setLayerVisible(live, layer, Boolean(visible[layer.key]));
        }
      }
      if (unloadKeys.length) {
        setLoaded((prev) => {
          const next = { ...prev };
          for (const k of unloadKeys) next[k] = false;
          return next;
        });
      }
      if (!didFit.current) {
        const boxes = layers
          .filter((l) => visible[l.key] && l.bounds && !isMvtLayer(l))
          .map((l) => l.bounds as [number, number, number, number]);
        if (boxes.length === 1) fitBounds(live, boxes[0]);
        else if (boxes.length > 1) {
          fitBounds(live, [
            Math.min(...boxes.map((b) => b[0])),
            Math.min(...boxes.map((b) => b[1])),
            Math.max(...boxes.map((b) => b[2])),
            Math.max(...boxes.map((b) => b[3])),
          ]);
        }
        didFit.current = true;
      }
      raiseEtudeLayers(live);
      raiseFaunaLayers(live);
    })();

    return () => {
      cancelled = true;
    };
  }, [layers, visible, loaded, loadLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !etudeRunId) return;
    if (fittedEtudeRunRef.current === etudeRunId) return;
    const boxes = etudeLayers
      .filter((l) => visible[l.key] && l.available && l.bounds)
      .map((l) => l.bounds as [number, number, number, number]);
    if (!boxes.length) return;
    const someLoaded = etudeLayers.some((l) => visible[l.key] && loaded[l.key]);
    if (!someLoaded) return;
    fitBounds(map, [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ]);
    fittedEtudeRunRef.current = etudeRunId;
  }, [etudeRunId, etudeLayers, visible, loaded, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    try {
      map.setLayoutProperty("osm", "visibility", baseMap === "plan" ? "visible" : "none");
      map.setLayoutProperty("satellite", "visibility", baseMap === "satellite" ? "visible" : "none");
    } catch {
      /* style pas encore prêt */
    }
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    for (const layer of layers) {
      if (!visible[layer.key] || !layer.color_property || !layer.class_colors) continue;
      applyClassFilter(map, layer, hiddenClasses);
      const full = centroidsRef.current[layer.key];
      if (full && map.getSource(ptsSourceId(layer.key))) {
        setSourceData(map, ptsSourceId(layer.key), filterFcByClass(full, layer, hiddenClasses));
      }
    }
  }, [hiddenClasses, layers, visible, loaded, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const hitLayers = () =>
      [
        ...layers.flatMap((l) => [
          `${sourceId(l.key)}-fill`,
          `${sourceId(l.key)}-line`,
          `${sourceId(l.key)}-circle`,
          `${sourceId(l.key)}-unclustered`,
        ]),
        `${USER_SOURCE}-fill`,
        `${USER_SOURCE}-line`,
        `${USER_SOURCE}-circle`,
      ].filter((id) => map.getLayer(id));

    const clusterLayers = () =>
      layers.map((l) => `${sourceId(l.key)}-cluster`).filter((id) => map.getLayer(id));

    const clearHover = () => {
      const prev = hoverRef.current;
      if (prev && map.getSource(prev.source)) {
        map.setFeatureState(featureStateSpec(prev), { hover: false });
      }
      hoverRef.current = null;
      map.getCanvas().style.cursor = "";
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (fauna.isDrawing()) return;
      if (map.queryRenderedFeatures(e.point, { layers: clusterLayers() }).length) {
        map.getCanvas().style.cursor = "pointer";
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: hitLayers() });
      const f = hits[0];
      if (!f) {
        clearHover();
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      if (f.id == null) return;
      const spec = {
        source: f.source,
        id: f.id,
        sourceLayer: f.sourceLayer || undefined,
      };
      const prev = hoverRef.current;
      if (prev && (prev.source !== spec.source || prev.id !== spec.id || prev.sourceLayer !== spec.sourceLayer)) {
        map.setFeatureState(featureStateSpec(prev), { hover: false });
      }
      hoverRef.current = spec;
      map.setFeatureState(featureStateSpec(spec), { hover: true });
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (fauna.isDrawing()) return;
      const faunaHitLayers = [`fauna-points-circle`, `fauna-points-clusters`].filter((id) => map.getLayer(id));
      if (faunaHitLayers.length && map.queryRenderedFeatures(e.point, { layers: faunaHitLayers }).length) {
        return;
      }
      const clusterHit = map.queryRenderedFeatures(e.point, { layers: clusterLayers() })[0];
      if (clusterHit && clusterHit.properties?.cluster_id != null) {
        const src = map.getSource(clusterHit.source) as maplibregl.GeoJSONSource;
        const cid = clusterHit.properties.cluster_id as number;
        const layerKey = clusterHit.source.replace(/^di-/, "").replace(/-pts$/, "");
        const layer = layers.find((l) => l.key === layerKey);
        const floor = layer?.min_zoom ?? 12;
        if (src?.getClusterExpansionZoom) {
          void src.getClusterExpansionZoom(cid).then((zExp) => {
            const coords = (clusterHit.geometry as GeoJSON.Point).coordinates as [number, number];
            const zoom = zExp >= floor - 0.51 ? Math.max(zExp, floor) : zExp;
            map.easeTo({ center: coords, zoom });
          });
        }
        return;
      }
      const unclusteredId = layers
        .map((l) => `${sourceId(l.key)}-unclustered`)
        .filter((id) => map.getLayer(id));
      const unclustered = unclusteredId.length
        ? map.queryRenderedFeatures(e.point, { layers: unclusteredId })[0]
        : undefined;
      if (unclustered) {
        const layerKey = unclustered.source.replace(/^di-/, "").replace(/-pts$/, "");
        const layer = layers.find((l) => l.key === layerKey);
        const floor = layer?.min_zoom ?? 12;
        if (map.getZoom() < floor) {
          const coords = (unclustered.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom: floor });
          return;
        }
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: hitLayers() });
      const f = hits[0];
      const props = f?.properties as Record<string, unknown> | undefined;
      if (!props) {
        inspectRef.current(null);
        return;
      }
      const src = String(f.source || "");
      const layerKey = src.replace(/^di-/, "").replace(/-pts$/, "");
      const layerLabel =
        src === USER_SOURCE
          ? userNameRef.current || "Import"
          : layers.find((l) => l.key === layerKey)?.label ?? null;
      inspectRef.current({
        title: featureTitle(props),
        layerLabel,
        rows: collectInspectRows(props),
      });
    };

    map.on("mousemove", onMove);
    map.on("click", onClick);
    map.on("mouseleave", clearHover);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.off("mouseleave", clearHover);
    };
  }, [layers, mapReady]);

  const toggleLayer = (key: string) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFamily = (id: string) => {
    setOpenFam((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectEtudePool = (runId: string) => {
    if (!runId) {
      setEtudeProjectId(null);
      setEtudeRunId(null);
      setSearchParams({}, { replace: true });
      return;
    }
    const run = poolRuns.find((r) => r.id === runId);
    if (!run) return;
    setEtudeProjectId(run.project_id);
    setEtudeRunId(run.id);
    setSearchParams({ etude: run.project_id, pool: run.id }, { replace: true });
  };

  const toggleTool = (id: string) => {
    setOpenTool((prev) => {
      const nextOpen = !prev[id];
      if (id === "fauna" && !nextOpen) fauna.resetDrawZone(false);
      return { ...prev, [id]: nextOpen };
    });
  };

  useEffect(() => {
    if (!openTool.fauna) return;
    if (fauna.extentKind === "point") {
      if (!fauna.searchPoint) fauna.startPlacePoint();
      return;
    }
    if ((fauna.extentKind === "bbox" || fauna.searchMode === "all_bbox") && !fauna.validatedBbox) {
      fauna.startDrawZone();
    }
    // Uniquement à l’ouverture de l’outil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTool.fauna]);

  const toggleClass = (layerKey: string, className: string) => {
    setHiddenClasses((prev) => {
      const bag = { ...(prev[layerKey] ?? {}) };
      if (bag[className]) delete bag[className];
      else bag[className] = true;
      return { ...prev, [layerKey]: bag };
    });
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const map = mapRef.current;
    if (!file || !map?.isStyleLoaded()) return;
    try {
      let fc: FeatureCollection;
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
        const parsed = JSON.parse(await file.text()) as Feature | FeatureCollection;
        fc =
          parsed.type === "FeatureCollection"
            ? parsed
            : { type: "FeatureCollection", features: [parsed as Feature] };
      } else {
        fc = await zipShapefileToFeatureCollection(await file.arrayBuffer());
      }
      setSourceData(map, USER_SOURCE, fc);
      setUserFc(fc);
      setUserName(file.name.replace(/\.(zip|geojson|json)$/i, ""));
      setUserVisible(true);
      for (const id of [`${USER_SOURCE}-fill`, `${USER_SOURCE}-line`, `${USER_SOURCE}-circle`]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      }
      fitBounds(map, bboxOfFc(fc));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const clearImport = () => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) setSourceData(map, USER_SOURCE, emptyFC());
    setUserFc(null);
    setUserName(null);
  };

  const toggleUser = () => {
    const map = mapRef.current;
    const next = !userVisible;
    setUserVisible(next);
    if (!map) return;
    const vis = next ? "visible" : "none";
    for (const id of [`${USER_SOURCE}-fill`, `${USER_SOURCE}-line`, `${USER_SOURCE}-circle`]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  };

  return (
    <div className="di-root">
      <div className="di-left">
        <aside className="di-sidebar" aria-label="Outils">
          <p className="di-kicker">Outils</p>
          <ul className="di-list">
            <li className="di-fam">
              <button
                type="button"
                className={`di-fam-btn${openTool.files ? " is-open" : ""}`}
                aria-expanded={Boolean(openTool.files)}
                onClick={() => toggleTool("files")}
              >
                <svg className="di-fam-caret" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="di-fam-label">Fichiers</span>
                <span className="di-fam-meta">{userFc ? userFc.features.length.toLocaleString("fr-FR") : ""}</span>
              </button>
              {openTool.files && (
                <div className="di-tool-body">
                  <button type="button" className="di-action" onClick={() => fileRef.current?.click()}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
                    </svg>
                    Charger une géométrie
                  </button>
                  <p className="di-hint">Shapefile (ZIP) ou GeoJSON, superposé aux couches en base.</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".zip,.geojson,.json,application/zip,application/geo+json,application/json"
                    hidden
                    onChange={(e) => void onImport(e)}
                  />
                  {userFc && (
                    <div className="di-import">
                      <div className="di-import__meta">
                        <strong>{userName ?? "Import"}</strong>
                        <span>
                          {userFc.features.length} entité{userFc.features.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="di-import__actions">
                        <button
                          type="button"
                          className="di-text-btn"
                          onClick={() => mapRef.current && fitBounds(mapRef.current, bboxOfFc(userFc))}
                        >
                          Recadrer
                        </button>
                        <button type="button" className="di-text-btn" onClick={toggleUser}>
                          {userVisible ? "Masquer" : "Afficher"}
                        </button>
                        <button type="button" className="di-text-btn" onClick={clearImport}>
                          Retirer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
            <li className="di-fam">
              <button
                type="button"
                className={`di-fam-btn${openTool.fauna ? " is-open" : ""}`}
                aria-expanded={Boolean(openTool.fauna)}
                onClick={() => toggleTool("fauna")}
              >
                <svg className="di-fam-caret" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="di-fam-label">Faune</span>
                <span className="di-fam-meta">
                  {fauna.lastResultCount > 0 ? fauna.lastResultCount.toLocaleString("fr-FR") : ""}
                </span>
              </button>
              {openTool.fauna && (
                <div className="di-tool-body di-fauna fauna-embed">
                  {fauna.lastResultCount > 0 && (
                    <button
                      type="button"
                      className={`di-row${fauna.obsVisible ? " is-on" : ""}`}
                      onClick={fauna.toggleObsVisible}
                    >
                      <span className="di-swatch" style={{ background: "#289f01", borderColor: "#289f01" }} />
                      <span className="di-row__text">
                        <span className="di-row__label">Observations</span>
                        <span className="di-row__meta">superposées à la carte</span>
                      </span>
                      <span className="di-row__count">{fauna.lastResultCount.toLocaleString("fr-FR")}</span>
                    </button>
                  )}
                  <FaunaQueryPanel fauna={fauna} showShapefile={false} compact />
                </div>
              )}
            </li>
          </ul>
          {error && <p className="di-error">{error}</p>}
        </aside>

        <aside className="di-legend" aria-label="Catalogue des couches">
          <p className="di-kicker">Catalogue</p>
          {busy && <p className="di-muted">Chargement…</p>}
          <ul className="di-list">
            {groupByFamily(layers).map((fam) => {
              const open = openFam[fam.id] !== false;
              const nOn = fam.layers.filter((l) => visible[l.key]).length;
              return (
                <li key={fam.id} className="di-fam">
                  <button
                    type="button"
                    className={`di-fam-btn${open ? " is-open" : ""}`}
                    aria-expanded={open}
                    onClick={() => toggleFamily(fam.id)}
                  >
                    <svg className="di-fam-caret" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="di-fam-label">{fam.label}</span>
                    <span className="di-fam-meta">
                      {nOn > 0 ? `${nOn}/${fam.layers.length}` : fam.layers.length}
                    </span>
                  </button>
                  {open && fam.id === ETUDE_FAMILY && (
                    <div className="di-etude-picker">
                      <label className="di-etude-picker__label">
                        Pool
                        <select
                          className="di-etude-picker__select"
                          value={etudeRunId ?? ""}
                          onChange={(e) => selectEtudePool(e.target.value)}
                        >
                          <option value="">Choisir un pool…</option>
                          {poolRuns.map((run) => {
                            const project = projects.find((p) => p.id === run.project_id);
                            const profile = getStudyProfile(normalizeStudyType(project?.study_type));
                            const when = new Date(run.created_at);
                            const whenLabel = Number.isNaN(when.getTime())
                              ? ""
                              : when.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
                            const name = project?.name?.trim() || project?.id.slice(0, 8) || "Projet";
                            return (
                              <option key={run.id} value={run.id}>
                                {name} · {profile.shortLabel} · {whenLabel} · {run.total_count} parc.
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {etudeBusy && <p className="di-muted">Chargement du pool…</p>}
                      {!etudeRunId && (
                        <p className="di-hint">Zone projet, AOI et parcelles du pool — sans dupliquer les couches SIG.</p>
                      )}
                    </div>
                  )}
                  {open && (
                    <ul className="di-fam-list">
                      {fam.layers.map((layer) => (
                        <li key={layer.key} className="di-cat-item">
                          <div className="di-cat-row">
                            <button
                              type="button"
                              className={`di-row${visible[layer.key] ? " is-on" : ""}`}
                              disabled={!layer.available}
                              onClick={() => toggleLayer(layer.key)}
                            >
                              <span className="di-swatch" style={{ background: layer.color, borderColor: layer.color }} />
                              <span className="di-row__text">
                                <span className="di-row__label">{layer.label}</span>
                                <span className="di-row__meta">{layerMeta(layer)}</span>
                              </span>
                              <span className="di-row__count">{layer.count.toLocaleString("fr-FR")}</span>
                            </button>
                            <button
                              type="button"
                              className="di-icon-btn"
                              title="Recadrer"
                              disabled={!layer.bounds || !visible[layer.key]}
                              onClick={() => mapRef.current && fitBounds(mapRef.current, layer.bounds)}
                            >
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                          {visible[layer.key] && layer.class_colors && Object.keys(layer.class_colors).length > 0 && (
                            <ul className="di-classes">
                              {Object.entries(layer.class_colors).map(([name, color]) => {
                                const off = Boolean(hiddenClasses[layer.key]?.[name]);
                                const label = layer.class_labels?.[name] ?? name;
                                return (
                                  <li key={name}>
                                    <button
                                      type="button"
                                      className={`di-class${off ? " is-off" : ""}`}
                                      aria-pressed={!off}
                                      title={off ? `Afficher « ${label} »` : `Masquer « ${label} »`}
                                      onClick={() => toggleClass(layer.key, name)}
                                    >
                                      <span className="di-swatch" style={{ background: color, borderColor: color }} />
                                      {label}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <div
        className={`di-map-wrap${fauna.drawActive ? (fauna.drawTool === "point" ? " is-drawing-point" : " is-drawing") : ""}${inspect ? " has-inspect" : ""}`}
      >
        <div ref={mapEl} className="di-map" />
        <button
          type="button"
          className={`di-basemap-btn${baseMap === "satellite" ? " is-sat" : ""}`}
          title={baseMap === "satellite" ? "Vue plan" : "Vue satellite"}
          aria-label={baseMap === "satellite" ? "Passer en vue plan" : "Passer en vue satellite"}
          onClick={() => setBaseMap((m) => (m === "plan" ? "satellite" : "plan"))}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <path d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Z" strokeLinejoin="round" />
            <path d="M4 12.5 12 17l8-4.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16.5 12 21l8-4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="di-zoom-level" aria-live="polite">
          z {zoom.toFixed(1)}
        </p>
        {(() => {
          const clustered = layers.filter(
            (l) => visible[l.key] && isMvtLayer(l) && layerStyle(l).cluster && zoom < (l.min_zoom ?? 12),
          );
          const bare = layers.filter(
            (l) => visible[l.key] && isMvtLayer(l) && !layerStyle(l).cluster && zoom < (l.min_zoom ?? 12),
          );
          if (clustered.length) {
            const z = Math.max(...clustered.map((l) => l.min_zoom ?? 12));
            return (
              <p className="di-zoom-hint">
                Cliquez un halo pour zoomer jusqu’aux mesures (z ≥ {z}).
              </p>
            );
          }
          if (bare.length) {
            const z = Math.max(...bare.map((l) => l.min_zoom ?? 12));
            return (
              <p className="di-zoom-hint">
                Zoomez jusqu’au niveau parcelle (z ≥ {z}) pour afficher la couche.
              </p>
            );
          }
          return null;
        })()}
        {(fauna.loadBusy || fauna.exportBusy) && (
          <div className="fauna-map-loader-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="fauna-map-hourglass-spinner" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
                <path d="M6 2h12v3l-4.5 5.5L18 16v6H6v-6l4.5-5.5L6 5V2zm2 2v.8L11 9.2v1.6L8 15.2V18h8v-2.8l-3-4.4V9.2L16 4.8V4H8z" />
              </svg>
            </div>
            <span className="fauna-map-loader-label">
              {fauna.exportBusy ? "Export en cours…" : "Chargement des observations…"}
            </span>
          </div>
        )}
        {fauna.drawActive && (
          <div className="fauna-map-draw-overlay" role="status">
            {fauna.drawTool === "point" ? "Clique pour placer le centre" : "Clic + glisser pour tracer"}
          </div>
        )}
        {fauna.selected.size > 0 && fauna.searchMode === "species" && fauna.lastResultCount > 0 && (
          <div className="fauna-map-legend">
            {[...fauna.selected.entries()].map(([tax, info]) => (
              <div key={tax} className="fauna-map-legend-row">
                <span className="swatch" style={{ background: info.color }} />
                <span>
                  {info.label}
                  {info.bufferM > 0 ? ` (${info.bufferM} m)` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <FeatureInspectSidebar inspect={inspect} onClose={() => setInspect(null)} />
      </div>
    </div>
  );
}
