import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { geometryFilesToLayers } from "../../geo/importFichiers";
import FaunaQueryPanel from "../FaunaMap/FaunaQueryPanel";
import { useFaunaQuery } from "../FaunaMap/useFaunaQuery";
import { FAUNA_POINTS_SOURCE, raiseFaunaLayers } from "../FaunaMap/faunaMapShared";
import "../FaunaMap/FaunaMapPage.css";
import {
  fetchInternalLayerGeoJSON,
  fetchInternalLayerCentroids,
  fetchInternalLayers,
  fetchLayerNotes,
  internalLayerTileUrl,
  isMvtLayer,
  layerStyle,
  MVT_SOURCE_LAYER,
  saveLayerNote,
  type InternalLayerInfo,
  type LayerNote,
  type LayerStyle,
} from "./api";
import {
  emptyEtudeLayers,
  ETUDE_FAMILY,
  ETUDE_LAYER_DEFS,
  RESERVE_FONCIERE_FAMILY,
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
import { LayerInfoBtn, LayerNoteEditor } from "./LayerNoteEditor";

const USER_FAMILY = "fichiers";
const USER_FAMILY_LABEL = "Fichiers";
const USER_LAYER_COLORS = ["#111111", "#c2410c", "#7c3aed", "#0f766e", "#b45309", "#1d4ed8"];

function isUserLayerKey(key: string): boolean {
  return key.startsWith("user-");
}

function fileBaseName(name: string): string {
  return name.replace(/\.(zip|geojson|json|shp)$/i, "").trim() || "Import";
}

function uniqueLayerName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function withFeatureIds(fc: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f, i) => ({
      ...f,
      id: typeof f.id === "number" || typeof f.id === "string" ? f.id : i + 1,
    })),
  };
}

function addUserLayerOnMap(map: MapLibreMap, layer: InternalLayerInfo) {
  const sid = sourceId(layer.key);
  if (map.getSource(sid)) return;
  map.addSource(sid, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: `${sid}-fill`,
    type: "fill",
    source: sid,
    filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
    paint: { "fill-color": layer.color, "fill-opacity": 0.38 },
  });
  map.addLayer({
    id: `${sid}-line`,
    type: "line",
    source: sid,
    filter: [
      "any",
      ["==", ["geometry-type"], "LineString"],
      ["==", ["geometry-type"], "MultiLineString"],
      ["==", ["geometry-type"], "Polygon"],
      ["==", ["geometry-type"], "MultiPolygon"],
    ],
    paint: { "line-color": layer.color, "line-width": 2.2, "line-opacity": 0.95 },
  });
  map.addLayer({
    id: `${sid}-circle`,
    type: "circle",
    source: sid,
    filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
    paint: {
      "circle-color": layer.color,
      "circle-radius": 6,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": "#fff",
    },
  });
}

function raiseUserLayers(map: MapLibreMap, keys: string[]) {
  for (const key of keys) {
    for (const id of [`${sourceId(key)}-fill`, `${sourceId(key)}-line`, `${sourceId(key)}-circle`]) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  }
}

type UserImport = {
  key: string;
  name: string;
  color: string;
  fc: FeatureCollection;
};
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
  codeinsee: "INSEE",
  surface_cadastrale: "Surf. cadastrale (m²)",
  surface_sig: "Surf. SIG (m²)",
  source_type: "Source",
  statut_prospection: "Statut",
  contact_nom: "Contact",
  contact_email: "E-mail",
  description_site: "Description",
  ilot_nom: "Îlot",
  ilot_statut: "Statut de l'îlot",
  ilot_date_reception: "Reçu le",
  ilot_contraintes: "Contraintes",
  ilot_description: "Description de l'îlot",
  contact_organisme: "Organisme",
  contact_role: "Fonction",
  contact_telephone: "Téléphone",
  contact_notes: "Notes du contact",
  prefixe: "Préfixe",
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
  PARCELLE_SYNDICALE: "Parcelle syndicale",
  PROPRIETAIRE_PRIVE: "Propriétaire privé",
  COMMUNE: "Commune",
  A_ETUDIER: "À étudier",
  CONTACTE: "Contacté",
  VALIDE: "Validé",
  REJETE: "Rejeté",
  RECHERCHE_IGN: "Recherche cadastre",
  IMPORT_FICHIER: "Import de fichier",
  ENVOI_ECOCOMP: "Envoi Ecocompensation",
};

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function parseGeometry(geom: unknown): Feature["geometry"] | null {
  if (!geom) return null;
  if (typeof geom === "string") {
    try {
      return parseGeometry(JSON.parse(geom));
    } catch {
      return null;
    }
  }
  if (typeof geom === "object" && geom !== null && "type" in geom) {
    return geom as Feature["geometry"];
  }
  return null;
}

function normalizeFc(raw: FeatureCollection | null | undefined): FeatureCollection {
  const features: Feature[] = [];
  for (const [i, f] of (raw?.features ?? []).entries()) {
    const geometry = parseGeometry(f?.geometry);
    if (!geometry) continue;
    features.push({
      type: "Feature",
      id: typeof f.id === "number" || typeof f.id === "string" ? f.id : i + 1,
      properties: f.properties ?? {},
      geometry,
    });
  }
  return withFeatureIds({ type: "FeatureCollection", features });
}

function waitStyleReady(map: MapLibreMap): Promise<void> {
  if (map.isStyleLoaded()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      map.off("load", done);
      map.off("idle", done);
      resolve();
    };
    const timer = window.setTimeout(done, 4000);
    map.once("load", done);
    map.once("idle", done);
  });
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
  const push = (key: string, group?: string) => {
    if (!(key in props) || SKIP_PROP_KEYS.has(key) || seen.has(key)) return;
    const val = formatPropValue(props[key]);
    if (!val) return;
    seen.add(key);
    rows.push({ key, label: PROP_LABELS[key] ?? humanizeKey(key), value: val, group });
  };
  for (const key of [
    "idu", "section", "numero", "prefixe", "nomcommune", "nom_commune", "codeinsee", "code_insee",
    "surface_cadastrale", "surface_sig", "source_type", "statut_prospection",
  ]) push(key, "Parcelle");
  for (const key of ["ilot_nom", "ilot_statut", "ilot_date_reception", "ilot_contraintes", "ilot_description"]) {
    push(key, "Îlot");
  }
  for (const key of [
    "contact_organisme", "contact_nom", "contact_role", "contact_telephone", "contact_email", "contact_notes",
  ]) push(key, "Contact");
  for (const [key, label] of Object.entries(PROP_LABELS)) {
    if (!(key in props) || SKIP_PROP_KEYS.has(key) || seen.has(key)) continue;
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
  const hoverOp: number = cover ? 0.38 : 0.4;
  const hoverW: maplibregl.ExpressionSpecification = [
    "case",
    ["boolean", ["feature-state", "hover"], false],
    2.8,
    cover ? 0.9 : 2.2,
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
    map.addSource(sid, { type: "geojson", data: emptyFC() });

    if (layer.geometry_type === "polygon") {
      map.addLayer({
        id: `${sid}-fill`,
        type: "fill",
        source: sid,
        paint: { "fill-color": fillColor, "fill-opacity": hoverOp },
      });
      map.addLayer({
        id: `${sid}-line`,
        type: "line",
        source: sid,
        paint: {
          "line-color": fillColor,
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

function raiseLayer(map: MapLibreMap, key: string) {
  for (const id of layerIds(key)) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

function fitPadding(map: MapLibreMap): number {
  const w = map.getContainer().clientWidth;
  const h = map.getContainer().clientHeight;
  const maxPad = Math.max(0, Math.floor(Math.min(w, h) / 4) - 4);
  return Math.min(72, maxPad);
}

function fitBounds(map: MapLibreMap, bounds: [number, number, number, number] | null) {
  if (!bounds) return;
  const [w, s, e, n] = bounds;
  if (![w, s, e, n].every(Number.isFinite)) return;
  const lonSpan = e - w;
  const latSpan = n - s;
  if (lonSpan < 1e-8 && latSpan < 1e-8) {
    map.easeTo({ center: [w, s], zoom: 16, duration: 550 });
    return;
  }
  const padLon = lonSpan < 1e-5 ? 0.002 : 0;
  const padLat = latSpan < 1e-5 ? 0.002 : 0;
  try {
    map.fitBounds(
      [
        [w - padLon, s - padLat],
        [e + padLon, n + padLat],
      ],
      { padding: fitPadding(map), maxZoom: 16, duration: 650 },
    );
  } catch {
    map.easeTo({ center: [(w + e) / 2, (s + n) / 2], zoom: 14, duration: 550 });
  }
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
  const walkGeom = (g: Feature["geometry"] | null | undefined) => {
    if (!g) return;
    if (g.type === "GeometryCollection") {
      for (const part of g.geometries) walkGeom(part);
      return;
    }
    if ("coordinates" in g) walk(g.coordinates);
  };
  for (const f of fc.features) walkGeom(f.geometry);
  return ok ? [w, s, e, n] : null;
}

function extendBoundsFromCoords(bounds: maplibregl.LngLatBounds, coords: unknown) {
  if (!Array.isArray(coords)) return;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    bounds.extend([coords[0], coords[1]]);
    return;
  }
  for (const item of coords) extendBoundsFromCoords(bounds, item);
}

/** Même schéma que CartoAoi : setData puis fitBounds sur les coordonnées, dans le même tick. */
function fitToCollection(map: MapLibreMap, collections: FeatureCollection[]) {
  const bounds = new maplibregl.LngLatBounds();
  for (const fc of collections) {
    for (const f of fc.features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === "GeometryCollection") {
        for (const part of g.geometries) {
          if ("coordinates" in part) extendBoundsFromCoords(bounds, part.coordinates);
        }
      } else if ("coordinates" in g) {
        extendBoundsFromCoords(bounds, g.coordinates);
      }
    }
  }
  if (bounds.isEmpty()) return;
  const side = Math.min(map.getContainer().clientWidth, map.getContainer().clientHeight);
  const padding = Math.min(56, Math.max(8, Math.floor(side / 6)));
  try {
    map.fitBounds(bounds, { padding, duration: 700, maxZoom: 14 });
  } catch {
    const c = bounds.getCenter();
    map.easeTo({ center: [c.lng, c.lat], zoom: 14, duration: 550 });
  }
}

function unionBoxes(boxes: [number, number, number, number][]): [number, number, number, number] | null {
  if (!boxes.length) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      {open ? (
        <>
          <path d="M2.2 12S5.6 5.8 12 5.8 21.8 12 21.8 12 18.4 18.2 12 18.2 2.2 12 2.2 12Z" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3.1" />
        </>
      ) : (
        <>
          <path d="M3.2 3.2l17.6 17.6" strokeLinecap="round" />
          <path d="M9.7 5.9A11 11 0 0 1 12 5.8C18.4 5.8 21.8 12 21.8 12a12 12 0 0 1-4.4 4.8" strokeLinejoin="round" />
          <path d="M6.5 7.5C4.2 9.1 2.2 12 2.2 12a12 12 0 0 0 7 5.9" strokeLinejoin="round" />
          <path d="M9.9 9.9a3.1 3.1 0 0 0 4.2 4.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function VisibilityBtn({
  label,
  visible,
  disabled,
  onClick,
}: {
  label: string;
  visible: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`di-icon-btn di-vis-btn${visible ? " is-on" : ""}`}
      title={visible ? `Masquer « ${label} »` : `Afficher « ${label} »`}
      aria-label={visible ? `Masquer ${label}` : `Afficher ${label}`}
      aria-pressed={visible}
      disabled={disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
    >
      <EyeIcon open={visible} />
    </button>
  );
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
  if (isUserLayerKey(layer.key) || isEtudeLayerKey(layer.key)) {
    return layer.available ? `${layer.count.toLocaleString("fr-FR")} entités` : "—";
  }
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
  const didFit = useRef(false);
  const runSeqRef = useRef(0);
  const userSeqRef = useRef(0);
  const lockFit = () => {
    didFit.current = true;
  };
  const [mapReady, setMapReady] = useState(false);
  const [inspect, setInspect] = useState<InspectPayload | null>(null);
  inspectRef.current = setInspect;

  const [openTool, setOpenTool] = useState<Record<string, boolean>>({ fauna: false });
  const fauna = useFaunaQuery({
    mapRef,
    mapReady,
    enableShapefile: false,
    enabled: Boolean(openTool.fauna),
  });

  const [catalog, setCatalog] = useState<InternalLayerInfo[]>([]);
  const [etudeLayers, setEtudeLayers] = useState<InternalLayerInfo[]>(() => emptyEtudeLayers());
  const [userImports, setUserImports] = useState<UserImport[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const userLayers = useMemo(
    () =>
      userImports.map((imp) => ({
        key: imp.key,
        label: imp.name,
        geometry_type: "polygon" as const,
        color: imp.color,
        default_visible: true,
        count: imp.fc.features.length,
        bounds: bboxOfFc(imp.fc),
        available: true,
        delivery: "geojson",
        family: USER_FAMILY,
        family_label: USER_FAMILY_LABEL,
      })) satisfies InternalLayerInfo[],
    [userImports],
  );
  const layers = useMemo(
    (): InternalLayerInfo[] => [...userLayers, ...etudeLayers, ...catalog],
    [userLayers, etudeLayers, catalog],
  );
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(8.4);
  const [openFam, setOpenFam] = useState<Record<string, boolean>>({});
  const [baseMap, setBaseMap] = useState<"plan" | "satellite">("plan");
  const [hiddenClasses, setHiddenClasses] = useState<HiddenClasses>({});
  const hiddenClassesRef = useRef<HiddenClasses>({});
  hiddenClassesRef.current = hiddenClasses;
  const centroidsRef = useRef<Record<string, FeatureCollection>>({});
  const geojsonCacheRef = useRef<Record<string, FeatureCollection>>({});
  const loadedRef = useRef<Record<string, boolean>>({});
  loadedRef.current = loaded;
  const etudeFcRef = useRef<Record<string, FeatureCollection>>({});
  const userFcRef = useRef<Record<string, FeatureCollection>>({});
  userFcRef.current = Object.fromEntries(userImports.map((u) => [u.key, u.fc]));
  const fittedEtudeRunRef = useRef<string | null>(null);
  const pendingFitKey = useRef<string | null>(null);
  const etudeListsLoadedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [etudeProjectId, setEtudeProjectId] = useState<string | null>(() => searchParams.get("etude"));
  const [etudeRunId, setEtudeRunId] = useState<string | null>(() => searchParams.get("pool"));
  const [etudeBusy, setEtudeBusy] = useState(false);
  const [layerNotes, setLayerNotes] = useState<Record<string, LayerNote>>({});
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const extentOfLayer = (layer: InternalLayerInfo): [number, number, number, number] | null => {
    if (layer.bounds) return layer.bounds;
    const etude = etudeFcRef.current[layer.key];
    if (etude?.features.length) return bboxOfFc(etude);
    const user = userFcRef.current[layer.key];
    if (user?.features.length) return bboxOfFc(user);
    const pts = centroidsRef.current[layer.key];
    if (pts?.features.length) return bboxOfFc(pts);
    return null;
  };

  const loadLayer = useCallback(async (layer: InternalLayerInfo) => {
    const map0 = mapRef.current;
    if (!map0 || !layer.available) return;
    await waitStyleReady(map0);
    const mapReadyNow = mapRef.current;
    if (!mapReadyNow) return;
    const hidden = hiddenClassesRef.current;
    const markLoaded = () => {
      const live = mapRef.current;
      loadedRef.current[layer.key] = true;
      setLoaded((prev) => (prev[layer.key] ? prev : { ...prev, [layer.key]: true }));
      if (!live) return;
      raiseLayer(live, layer.key);
      raiseUserLayers(live, Object.keys(userFcRef.current));
      raiseEtudeLayers(live);
      raiseFaunaLayers(live);
      live.triggerRepaint();
    };
    if (isEtudeLayerKey(layer.key)) {
      ensureLayerOnMap(mapReadyNow, layer);
      setSourceData(mapReadyNow, sourceId(layer.key), etudeFcRef.current[layer.key] ?? emptyFC());
      setLayerVisible(mapReadyNow, layer, true);
      markLoaded();
      return;
    }
    if (isUserLayerKey(layer.key)) {
      addUserLayerOnMap(mapReadyNow, layer);
      setSourceData(mapReadyNow, sourceId(layer.key), normalizeFc(userFcRef.current[layer.key]));
      setLayerVisible(mapReadyNow, layer, true);
      markLoaded();
      return;
    }
    if (isMvtLayer(layer)) {
      ensureLayerOnMap(mapReadyNow, layer);
      applyClassFilter(mapReadyNow, layer, hidden);
      setLayerVisible(mapReadyNow, layer, true);
      if (layerStyle(layer).cluster) {
        const pts = await fetchInternalLayerCentroids(layer.key);
        const map = mapRef.current;
        if (!map) return;
        await waitStyleReady(map);
        ensureLayerOnMap(map, layer);
        applyClassFilter(map, layer, hidden);
        centroidsRef.current[layer.key] = pts;
        if (map.getSource(ptsSourceId(layer.key))) {
          setSourceData(map, ptsSourceId(layer.key), filterFcByClass(pts, layer, hidden));
        }
        setLayerVisible(map, layer, true);
      }
      markLoaded();
      return;
    }
    ensureLayerOnMap(mapReadyNow, layer);
    const cached = geojsonCacheRef.current[layer.key];
    const fc = cached ?? normalizeFc(await fetchInternalLayerGeoJSON(layer.key));
    geojsonCacheRef.current[layer.key] = fc;
    const map = mapRef.current;
    if (!map) return;
    await waitStyleReady(map);
    ensureLayerOnMap(map, layer);
    applyClassFilter(map, layer, hidden);
    setSourceData(map, sourceId(layer.key), fc);
    setLayerVisible(map, layer, true);
    if (layerStyle(layer).cluster && map.getSource(ptsSourceId(layer.key))) {
      const pts = centroidsFc(fc);
      centroidsRef.current[layer.key] = pts;
      setSourceData(map, ptsSourceId(layer.key), filterFcByClass(pts, layer, hidden));
    }
    markLoaded();
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
      setMapReady(true);
      setZoom(map.getZoom());
    };

    map.on("load", onLoad);
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoom", onZoom);
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(el);
    map.resize();
    return () => {
      ro.disconnect();
      map.off("load", onLoad);
      map.off("zoom", onZoom);
      map.remove();
      mapRef.current = null;
      didFit.current = false;
      runSeqRef.current += 1;
      setLoaded({});
      loadedRef.current = {};
      geojsonCacheRef.current = {};
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const [catalog, notes] = await Promise.all([
          fetchInternalLayers(),
          fetchLayerNotes().catch(() => ({} as Record<string, LayerNote>)),
        ]);
        if (cancelled) return;
        setCatalog(catalog);
        setLayerNotes(notes);
        const vis: Record<string, boolean> = {};
        const fam: Record<string, boolean> = { [ETUDE_FAMILY]: false };
        for (const def of ETUDE_LAYER_DEFS) vis[def.key] = false;
        for (const l of catalog) {
          vis[l.key] = l.default_visible && l.available;
          const fid = l.family || "_";
          if (fam[fid] == null) fam[fid] = false;
          if (vis[l.key]) fam[fid] = true;
        }
        setVisible((prev) => ({ ...vis, ...Object.fromEntries(
          Object.entries(prev).filter(([k]) => isEtudeLayerKey(k) || isUserLayerKey(k)),
        ) }));
        setOpenFam((prev) => ({ ...fam, ...prev, [ETUDE_FAMILY]: prev[ETUDE_FAMILY] === true }));
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
    if (openFam[ETUDE_FAMILY] !== true) return;
    if (etudeListsLoadedRef.current) return;
    let cancelled = false;
    void Promise.all([fetchProjects(), fetchAllPoolRunsList(200)])
      .then(([list, r]) => {
        if (cancelled) return;
        etudeListsLoadedRef.current = true;
        setProjects(list);
        setPoolRuns(r.runs ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setPoolRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openFam]);

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
      setOpenFam((prev) => ({ ...prev, [ETUDE_FAMILY]: prev[ETUDE_FAMILY] === true }));
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
    if (!map || !mapReady || busy || didFit.current) return;
    const boxes = catalog
      .filter((l) => l.default_visible && l.available && l.bounds && !isMvtLayer(l))
      .map((l) => l.bounds as [number, number, number, number]);
    const initial = unionBoxes(boxes);
    if (initial) fitBounds(map, initial);
    didFit.current = true;
  }, [mapReady, busy, catalog]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || layers.length === 0) return;
    const run = ++runSeqRef.current;
    const stale = () => runSeqRef.current !== run || mapRef.current !== map;
    const unloadKeys: string[] = [];
    void (async () => {
      await waitStyleReady(map);
      if (stale()) return;
      for (const layer of layers) {
        if (stale()) return;
        const live = mapRef.current;
        if (!live) return;
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
        if (loadedRef.current[layer.key] && alreadyOnMap) {
          setLayerVisible(live, layer, true);
          raiseLayer(live, layer.key);
          continue;
        }
        try {
          await loadLayer(layer);
        } catch (e) {
          if (!stale()) setError(e instanceof Error ? e.message : String(e));
        }
      }
      if (stale()) return;
      const live = mapRef.current;
      if (!live) return;
      for (const layer of layers) {
        if (live.getSource(sourceId(layer.key))) {
          setLayerVisible(live, layer, Boolean(visible[layer.key]));
        }
      }
      if (unloadKeys.length) {
        setLoaded((prev) => {
          const next = { ...prev };
          for (const k of unloadKeys) {
            next[k] = false;
            loadedRef.current[k] = false;
          }
          return next;
        });
      }
      const fitKey = pendingFitKey.current;
      if (fitKey && visible[fitKey]) {
        const layer = layers.find((l) => l.key === fitKey);
        if (layer && live.getSource(sourceId(fitKey))) {
          fitBounds(live, extentOfLayer(layer));
          pendingFitKey.current = null;
        }
      }
      raiseUserLayers(live, Object.keys(userFcRef.current));
      raiseEtudeLayers(live);
      raiseFaunaLayers(live);
      live.triggerRepaint();
    })();
  }, [layers, visible, loadLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !etudeRunId) return;
    if (fittedEtudeRunRef.current === etudeRunId) return;
    const boxes = etudeLayers
      .filter((l) => visible[l.key] && l.available && l.bounds)
      .map((l) => l.bounds as [number, number, number, number]);
    const foncier = etudeLayers.find((l) => l.key === "etude-foncier" && l.available && l.bounds);
    const aoi = etudeLayers.find((l) => l.key === "etude-aoi" && l.available && l.bounds);
    const target = foncier?.bounds ?? aoi?.bounds ?? unionBoxes(boxes);
    if (!target) return;
    const someLoaded = etudeLayers.some((l) => visible[l.key] && loaded[l.key]);
    if (!someLoaded) return;
    fitBounds(map, target);
    fittedEtudeRunRef.current = etudeRunId;
    lockFit();
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
      layers
        .flatMap((l) => [
          `${sourceId(l.key)}-fill`,
          `${sourceId(l.key)}-line`,
          `${sourceId(l.key)}-circle`,
          `${sourceId(l.key)}-unclustered`,
        ])
        .filter((id) => map.getLayer(id));

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
      const layerLabel = layers.find((l) => l.key === layerKey)?.label ?? null;
      if (f.geometry) {
        fitBounds(
          map,
          bboxOfFc({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: f.geometry, properties: {} }],
          }),
        );
      }
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

  const focusLayer = (layer: InternalLayerInfo) => {
    const map = mapRef.current;
    lockFit();
    if (!visible[layer.key]) {
      pendingFitKey.current = layer.key;
      setVisible((prev) => ({ ...prev, [layer.key]: true }));
    }
    if (!map) return;
    const fc =
      userFcRef.current[layer.key] ??
      geojsonCacheRef.current[layer.key] ??
      etudeFcRef.current[layer.key];
    if (fc?.features.length) fitToCollection(map, [fc]);
    else fitBounds(map, extentOfLayer(layer));
  };

  const renameUserLayer = (key: string, name: string, allowEmpty = false) => {
    const next = name.trim();
    if (!next && !allowEmpty) return;
    setUserImports((prev) => prev.map((u) => (u.key === key ? { ...u, name: allowEmpty ? name : next } : u)));
  };

  const removeUserLayer = (key: string) => {
    const map = mapRef.current;
    const layer = userLayers.find((l) => l.key === key);
    if (map && layer) removeLayerFromMap(map, layer);
    setUserImports((prev) => prev.filter((u) => u.key !== key));
    setVisible((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setLoaded((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addGeometryFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? [...fileList] : [];
    if (!files.length || fileBusy) return;
    setFileBusy(true);
    setFileError(null);
    try {
      const imported = await geometryFilesToLayers(files);
      if (!imported.length) {
        setFileError("Déposez un ZIP shapefile, un GeoJSON, ou les fichiers .shp / .dbf / .prj.");
        return;
      }
      const added: UserImport[] = [];
      for (const layer of imported) {
        const fc = normalizeFc(layer.fc);
        if (!fc.features.length) throw new Error(`Aucune entité dans « ${layer.name} ».`);
        userSeqRef.current += 1;
        added.push({
          key: `user-${userSeqRef.current}`,
          name: uniqueLayerName(
            fileBaseName(layer.name),
            [...userImports, ...added].map((u) => u.name),
          ),
          color: USER_LAYER_COLORS[(userSeqRef.current - 1) % USER_LAYER_COLORS.length],
          fc,
        });
      }
      for (const u of added) userFcRef.current[u.key] = u.fc;
      lockFit();
      const map = mapRef.current;
      if (map) {
        await waitStyleReady(map);
        for (const u of added) {
          addUserLayerOnMap(map, {
            key: u.key,
            label: u.name,
            geometry_type: "polygon",
            color: u.color,
            default_visible: true,
            count: u.fc.features.length,
            bounds: bboxOfFc(u.fc),
            available: true,
            delivery: "geojson",
            family: USER_FAMILY,
            family_label: USER_FAMILY_LABEL,
          });
          setSourceData(map, sourceId(u.key), u.fc);
          loadedRef.current[u.key] = true;
        }
        setLoaded((prev) => {
          const next = { ...prev };
          for (const u of added) next[u.key] = true;
          return next;
        });
        raiseUserLayers(map, added.map((u) => u.key));
        map.triggerRepaint();
        fitToCollection(map, added.map((u) => u.fc));
      }
      setUserImports((prev) => [...prev, ...added]);
      setVisible((prev) => ({
        ...prev,
        ...Object.fromEntries(added.map((u) => [u.key, true])),
      }));
      setOpenFam((prev) => ({ ...prev, [USER_FAMILY]: true }));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileBusy(false);
    }
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? [...e.target.files] : [];
    e.target.value = "";
    void addGeometryFiles(files);
  };

  const focusFaunaObservations = () => {
    const map = mapRef.current;
    if (!map) return;
    if (fauna.validatedBbox) {
      fitBounds(map, fauna.validatedBbox);
      return;
    }
    try {
      const feats = map.querySourceFeatures(FAUNA_POINTS_SOURCE);
      if (!feats.length) return;
      fitBounds(map, bboxOfFc({ type: "FeatureCollection", features: feats as Feature[] }));
    } catch {
      /* source absente */
    }
  };

  const toggleFamily = (id: string) => {
    setOpenFam((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFamilyLayers = (fam: LayerFamily) => {
    const available = fam.layers.filter((l) => l.available);
    if (!available.length) return;
    const nextOn = !available.some((l) => visible[l.key]);
    setVisible((prev) => {
      const next = { ...prev };
      for (const l of available) next[l.key] = nextOn;
      return next;
    });
  };

  const focusFamily = (fam: LayerFamily) => {
    const available = fam.layers.filter((l) => l.available);
    if (!available.length) return;
    lockFit();
    if (!available.some((l) => visible[l.key])) {
      pendingFitKey.current = available[0]?.key ?? null;
      setVisible((prev) => {
        const next = { ...prev };
        for (const l of available) next[l.key] = true;
        return next;
      });
    }
    const map = mapRef.current;
    const boxes = available
      .map((l) => extentOfLayer(l))
      .filter((b): b is [number, number, number, number] => Boolean(b));
    if (map) fitBounds(map, unionBoxes(boxes));
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

  const focusClass = (layer: InternalLayerInfo, className: string) => {
    const map = mapRef.current;
    const prop = layer.color_property;
    if (!map || !prop) return;
    const want = className.trim();
    const same = (props?: GeoJSON.GeoJsonProperties | null) => String(props?.[prop] ?? "").trim() === want;
    const sid = sourceId(layer.key);

    const pick = (features: Feature[]) => features.filter((f) => same(f.properties));
    let features = pick(geojsonCacheRef.current[layer.key]?.features ?? []);
    if (!features.length && map.getSource(sid)) {
      features = pick(map.querySourceFeatures(sid) as Feature[]);
    }
    const apply = (found: Feature[]) => {
      if (!found.length) return;
      lockFit();
      fitBounds(map, bboxOfFc({ type: "FeatureCollection", features: found }));
    };
    if (features.length) {
      apply(features);
      return;
    }
    void fetchInternalLayerGeoJSON(layer.key).then((raw) => {
      const fc = normalizeFc(raw);
      geojsonCacheRef.current[layer.key] = fc;
      if (map.getSource(sid)) setSourceData(map, sid, fc);
      apply(pick(fc.features));
    });
  };

  const openLayerNote = (key: string) => {
    if (noteKey === key) {
      setNoteKey(null);
      setNoteError(null);
      return;
    }
    setNoteKey(key);
    setNoteDraft(layerNotes[key]?.note ?? "");
    setNoteError(null);
  };

  const saveOpenNote = async () => {
    if (!noteKey) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const saved = await saveLayerNote(noteKey, noteDraft);
      setLayerNotes((prev) => {
        const next = { ...prev };
        if (saved.note) next[noteKey] = saved;
        else delete next[noteKey];
        return next;
      });
      setNoteDraft(saved.note);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setNoteSaving(false);
    }
  };

  useEffect(() => {
    if (!noteKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNoteKey(null);
        setNoteError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [noteKey]);

  const onFilesDragOver = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!fileBusy) setFileDragOver(true);
  };
  const onFilesDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDragOver(false);
  };
  const onFilesDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    if (!fileBusy) void addGeometryFiles(e.dataTransfer.files);
  };

  const families = groupByFamily(layers);
  const dataFamilies = families.filter((fam) => fam.id !== RESERVE_FONCIERE_FAMILY);
  const reserveFamilies = families.filter((fam) => fam.id === RESERVE_FONCIERE_FAMILY);

  return (
    <div
      className={`di-root${fileDragOver ? " is-file-over" : ""}`}
      onDragEnter={onFilesDragOver}
      onDragOver={onFilesDragOver}
      onDragLeave={onFilesDragLeave}
      onDrop={onFilesDrop}
    >
      <div className="di-left">
        <aside className="di-sidebar" aria-label="Outils">
          <p className="di-kicker">Outils</p>
          <Link to="/reserve-fonciere/ajout" className="di-fam-btn" style={{ textDecoration: "none" }}>
            <span className="di-fam-label">Ajouter du foncier</span>
          </Link>
          <ul className="di-list">
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
                    <div className="di-cat-row">
                      <button
                        type="button"
                        className={`di-row${fauna.obsVisible ? " is-on" : ""}`}
                        title="Aller aux observations"
                        onClick={() => {
                          if (!fauna.obsVisible) fauna.toggleObsVisible();
                          focusFaunaObservations();
                        }}
                      >
                        <span className="di-swatch" style={{ background: "#289f01", borderColor: "#289f01" }} />
                        <span className="di-row__text">
                          <span className="di-row__label">Observations</span>
                          <span className="di-row__meta">superposées à la carte</span>
                        </span>
                        <span className="di-row__count">{fauna.lastResultCount.toLocaleString("fr-FR")}</span>
                      </button>
                      <VisibilityBtn
                        label="Observations"
                        visible={fauna.obsVisible}
                        onClick={fauna.toggleObsVisible}
                      />
                    </div>
                  )}
                  <FaunaQueryPanel fauna={fauna} showShapefile={false} compact />
                </div>
              )}
            </li>
          </ul>
          {error && <p className="di-error">{error}</p>}
        </aside>

        {[
          { key: "data", label: "Couches de données", items: dataFamilies, showBusy: true },
          { key: "reserve", label: "Réserve foncière", items: reserveFamilies, showBusy: false },
        ].map((section) => (
        <aside key={section.key} className="di-legend" aria-label={section.label}>
          <p className="di-kicker">{section.label}</p>
          {section.showBusy && busy && <p className="di-muted">Chargement…</p>}
          <ul className="di-list">
            {section.items.map((fam) => {
              const open = fam.id === ETUDE_FAMILY ? openFam[fam.id] === true : openFam[fam.id] !== false;
              const nOn = fam.layers.filter((l) => visible[l.key]).length;
              const unified = fam.id === RESERVE_FONCIERE_FAMILY;
              const familyOn = nOn > 0;
              return (
                <li key={fam.id} className="di-fam">
                  <div className="di-fam-head">
                    <button
                      type="button"
                      className={`di-fam-caret-btn${open ? " is-open" : ""}`}
                      aria-expanded={open}
                      title={open ? "Replier" : "Déplier"}
                      onClick={() => toggleFamily(fam.id)}
                    >
                      <svg className="di-fam-caret" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`di-fam-btn${open ? " is-open" : ""}${familyOn ? " is-on" : ""}`}
                      onClick={() => (unified ? focusFamily(fam) : toggleFamily(fam.id))}
                      title={
                        unified
                          ? `Aller à « ${fam.label} »`
                          : open
                            ? "Replier"
                            : "Déplier"
                      }
                    >
                      <span className="di-fam-label">{fam.label}</span>
                      <span className="di-fam-meta">
                        {nOn > 0 ? `${nOn}/${fam.layers.length}` : fam.layers.length}
                      </span>
                    </button>
                    {unified && (
                      <VisibilityBtn
                        label={fam.label}
                        visible={familyOn}
                        disabled={!fam.layers.some((l) => l.available)}
                        onClick={() => toggleFamilyLayers(fam)}
                      />
                    )}
                  </div>
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
                            {isUserLayerKey(layer.key) ? (
                              <div
                                className={`di-row${visible[layer.key] ? " is-on" : ""}`}
                                role="button"
                                tabIndex={0}
                                title={`Aller à « ${layer.label} »`}
                                onClick={() => focusLayer(layer)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    focusLayer(layer);
                                  }
                                }}
                              >
                                <span className="di-swatch" style={{ background: layer.color, borderColor: layer.color }} />
                                <span className="di-row__text">
                                  {editingKey === layer.key ? (
                                    <input
                                      className="di-row__name"
                                      autoFocus
                                      value={layer.label}
                                      aria-label="Nom de la couche"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter" || e.key === "Escape") {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      onChange={(e) => renameUserLayer(layer.key, e.target.value, true)}
                                      onBlur={(e) => {
                                        renameUserLayer(layer.key, e.target.value.trim() || "Import");
                                        setEditingKey(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="di-row__label"
                                      title="Double-clic pour renommer"
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setEditingKey(layer.key);
                                      }}
                                    >
                                      {layer.label}
                                    </span>
                                  )}
                                  <span className="di-row__meta">{layerMeta(layer)}</span>
                                </span>
                                <span className="di-row__count">{layer.count.toLocaleString("fr-FR")}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`di-row${visible[layer.key] ? " is-on" : ""}`}
                                disabled={!layer.available}
                                title={layer.available ? `Aller à « ${layer.label} »` : undefined}
                                onClick={() => focusLayer(layer)}
                              >
                                <span className="di-swatch" style={{ background: layer.color, borderColor: layer.color }} />
                                <span className="di-row__text">
                                  <span className="di-row__label">{layer.label}</span>
                                  <span className="di-row__meta">{layerMeta(layer)}</span>
                                </span>
                                <span className="di-row__count">{layer.count.toLocaleString("fr-FR")}</span>
                              </button>
                            )}
                            <VisibilityBtn
                              label={layer.label}
                              visible={Boolean(visible[layer.key])}
                              disabled={!layer.available}
                              onClick={() => toggleLayer(layer.key)}
                            />
                            <LayerInfoBtn
                              label={layer.label}
                              hasNote={Boolean(layerNotes[layer.key]?.note)}
                              open={noteKey === layer.key}
                              onClick={() => openLayerNote(layer.key)}
                            />
                            {isUserLayerKey(layer.key) && (
                              <button
                                type="button"
                                className="di-icon-btn"
                                title="Retirer la couche"
                                aria-label={`Retirer ${layer.label}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeUserLayer(layer.key);
                                }}
                              >
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                                  <path d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 12h8l1-12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {noteKey === layer.key && (
                            <LayerNoteEditor
                              label={layer.label}
                              draft={noteDraft}
                              updatedAt={layerNotes[layer.key]?.updated_at ?? null}
                              saving={noteSaving}
                              error={noteError}
                              onDraftChange={setNoteDraft}
                              onSave={() => void saveOpenNote()}
                              onClose={() => {
                                setNoteKey(null);
                                setNoteError(null);
                              }}
                            />
                          )}
                          {visible[layer.key] && layer.class_colors && Object.keys(layer.class_colors).length > 0 && (
                            <ul className="di-classes">
                              {Object.entries(layer.class_colors).map(([name, color]) => {
                                const off = Boolean(hiddenClasses[layer.key]?.[name]);
                                const label = layer.class_labels?.[name] ?? name;
                                const isIlot = layer.color_property === "ilot_nom";
                                return (
                                  <li key={name}>
                                    <button
                                      type="button"
                                      className={`di-class${off ? " is-off" : ""}`}
                                      aria-pressed={!off}
                                      title={isIlot ? `Voir « ${label} »` : off ? `Afficher « ${label} »` : `Masquer « ${label} »`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isIlot) focusClass(layer, name);
                                        else toggleClass(layer.key, name);
                                      }}
                                    >
                                      <span className="di-swatch" style={{ background: color, borderColor: color }} />
                                      {label}
                                    </button>
                                    {isIlot && (
                                      <VisibilityBtn
                                        label={label}
                                        visible={!off}
                                        onClick={() => toggleClass(layer.key, name)}
                                      />
                                    )}
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
        ))}

        <aside className="di-files" aria-label="Fichiers">
          <p className="di-kicker">Fichiers</p>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.geojson,.json,.shp,.dbf,.prj,.shx,.cpg,application/zip,application/geo+json,application/json"
            hidden
            multiple
            onChange={(e) => void onImport(e)}
          />
          <div
            className={`di-dropzone${fileDragOver ? " is-over" : ""}${fileBusy ? " is-busy" : ""}`}
            role="button"
            tabIndex={fileBusy ? -1 : 0}
            aria-label="Déposer ou choisir un fichier géographique"
            aria-disabled={fileBusy}
            onKeyDown={(e) => {
              if (fileBusy) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onClick={() => {
              if (!fileBusy) fileRef.current?.click();
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
            </svg>
            <strong>{fileBusy ? "Chargement…" : "Glissez un ZIP, GeoJSON ou shapefile"}</strong>
            <span>ou cliquez pour parcourir — chaque fichier devient une couche</span>
          </div>
          {fileError && <p className="di-error">{fileError}</p>}
        </aside>
      </div>

      <div
        className={`di-map-wrap${fauna.drawActive ? (fauna.drawTool === "point" ? " is-drawing-point" : " is-drawing") : ""}${inspect ? " has-inspect" : ""}${fileDragOver ? " is-file-over" : ""}`}
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
        {fileDragOver && (
          <p className="di-file-drop-hint" role="status">
            Déposez le ZIP, GeoJSON ou shapefile pour l’ajouter au catalogue
          </p>
        )}
        {fileError && <p className="di-file-map-error">{fileError}</p>}
        <FeatureInspectSidebar inspect={inspect} onClose={() => setInspect(null)} />
      </div>
    </div>
  );
}
