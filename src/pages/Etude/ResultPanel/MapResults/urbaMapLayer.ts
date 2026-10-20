/**
 * Couche MapLibre des entités d'urbanisme (GPU) d'un run de pool.
 * Une source GeoJSON, styles par famille et par code CNIG.
 */

import type { FeatureCollection, Geometry } from "geojson";
import maplibregl from "maplibre-gl";

export type UrbaEntiteProps = {
  uid?: string;
  fid?: string;
  layer_key?: string;
  display_name?: string | null;
  famille?: string;
  geom_kind?: string | null;
  code?: string | null;
  libelle_cnig?: string | null;
  libelle?: string | null;
  attributs?: Record<string, unknown> | string | null;
  flags?: string[] | string | null;
  idus?: string[] | string | null;
};

export type UrbaFeatureCollection = FeatureCollection<Geometry, UrbaEntiteProps>;

export const URBA_SOURCE_ID = "urba-entites";

const FILL_ID = "urba-fill";
const EBC_ID = "urba-ebc";
const LINE_ID = "urba-line";
const SUP_ID = "urba-sup";
const CIRCLE_ID = "urba-circle";

export const URBA_LAYER_IDS = [FILL_ID, EBC_ID, LINE_ID, SUP_ID, CIRCLE_ID] as const;

const POLYGON_FILTER: maplibregl.FilterSpecification = [
  "in",
  ["geometry-type"],
  ["literal", ["Polygon", "MultiPolygon"]],
];

const EBC_CODE: maplibregl.FilterSpecification = [
  "==",
  ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 2],
  "01",
];

const KEY_EXPR: maplibregl.ExpressionSpecification = [
  "concat",
  ["coalesce", ["get", "famille"], ""],
  "|",
  ["coalesce", ["get", "layer_key"], ""],
  "|",
  ["coalesce", ["get", "code"], ""],
];

const FILL_COLOR: maplibregl.ExpressionSpecification = [
  "case",
  ["==", ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 2], "05"],
  "#e07a1f",
  ["==", ["get", "famille"], "zonage"],
  [
    "case",
    ["==", ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 2], "AU"],
    "#e6b325",
    ["==", ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 1], "U"],
    "#d4533b",
    ["==", ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 1], "A"],
    "#efe07a",
    ["==", ["slice", ["upcase", ["to-string", ["coalesce", ["get", "code"], ""]]], 0, 1], "N"],
    "#6aaa4f",
    "#94a3b8",
  ],
  ["==", ["get", "famille"], "information"],
  "#3d8bfd",
  ["==", ["get", "famille"], "servitude"],
  "#2563eb",
  "#c2410c",
];

export function urbaToggleKey(famille: string, layerKey: string, code: string): string {
  return `${famille}|${layerKey}|${code}`;
}

function hiddenClause(hidden: string[]): maplibregl.FilterSpecification | null {
  if (!hidden.length) return null;
  return ["!", ["in", KEY_EXPR, ["literal", hidden]]];
}

function combine(
  base: maplibregl.FilterSpecification,
  hidden: string[],
): maplibregl.FilterSpecification {
  const clause = hiddenClause(hidden);
  if (!clause) return base;
  // FilterSpecification est une union trop large pour que ["all", ...]
  // reste inférable ; le résultat est bien un filtre MapLibre.
  return ["all", base, clause] as maplibregl.FilterSpecification;
}

function ensureHatch(map: maplibregl.Map) {
  if (map.hasImage("urba-ebc-hatch")) return;
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#1f7a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-4, 6);
  ctx.lineTo(6, -4);
  ctx.moveTo(size - 6, size + 4);
  ctx.lineTo(size + 4, size - 6);
  ctx.stroke();
  // ImageData explicite : un canvas hors DOM a une taille CSS de 0,
  // et MapLibre lève « mismatched image size » puis fait tomber la carte.
  const image = ctx.getImageData(0, 0, size, size);
  map.addImage("urba-ebc-hatch", image, { pixelRatio: 1 });
}

export function syncUrbaLayers(
  map: maplibregl.Map,
  data: UrbaFeatureCollection,
  hidden: string[],
) {
  ensureHatch(map);
  const existing = map.getSource(URBA_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!existing) {
    map.addSource(URBA_SOURCE_ID, {
      type: "geojson",
      data,
      promoteId: "uid",
    });
    const before = map.getLayer("parcelles-fill") ? "parcelles-fill" : undefined;
    map.addLayer(
      {
        id: FILL_ID,
        type: "fill",
        source: URBA_SOURCE_ID,
        filter: combine(
          ["all", POLYGON_FILTER, ["!", EBC_CODE]] as maplibregl.FilterSpecification,
          hidden,
        ),
        paint: {
          "fill-color": FILL_COLOR,
          "fill-opacity": ["case", ["boolean", ["feature-state", "highlighted"], false], 0.55, 0.28],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: EBC_ID,
        type: "fill",
        source: URBA_SOURCE_ID,
        filter: combine(
          ["all", POLYGON_FILTER, EBC_CODE] as maplibregl.FilterSpecification,
          hidden,
        ),
        paint: {
          "fill-color": "#1f7a3a",
          "fill-opacity": ["case", ["boolean", ["feature-state", "highlighted"], false], 0.35, 0.16],
          "fill-pattern": "urba-ebc-hatch",
        },
      },
      before,
    );
    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: URBA_SOURCE_ID,
      filter: combine(["!=", ["get", "famille"], "servitude"], hidden),
      paint: {
        "line-color": FILL_COLOR,
        "line-width": ["case", ["boolean", ["feature-state", "highlighted"], false], 3.2, 1.35],
      },
    });
    map.addLayer({
      id: SUP_ID,
      type: "line",
      source: URBA_SOURCE_ID,
      filter: combine(["==", ["get", "famille"], "servitude"], hidden),
      paint: {
        "line-color": "#2563eb",
        "line-width": ["case", ["boolean", ["feature-state", "highlighted"], false], 3.2, 1.5],
        "line-dasharray": [2, 1.4],
      },
    });
    map.addLayer({
      id: CIRCLE_ID,
      type: "circle",
      source: URBA_SOURCE_ID,
      filter: combine(
        ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
        hidden,
      ),
      paint: {
        "circle-color": FILL_COLOR,
        "circle-radius": ["case", ["boolean", ["feature-state", "highlighted"], false], 7, 4.5],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
    return;
  }
  existing.setData(data);
  if (map.getLayer(FILL_ID)) {
    map.setFilter(
      FILL_ID,
      combine(
        ["all", POLYGON_FILTER, ["!", EBC_CODE]] as maplibregl.FilterSpecification,
        hidden,
      ),
    );
  }
  if (map.getLayer(EBC_ID)) {
    map.setFilter(
      EBC_ID,
      combine(["all", POLYGON_FILTER, EBC_CODE] as maplibregl.FilterSpecification, hidden),
    );
  }
  if (map.getLayer(LINE_ID)) {
    map.setFilter(LINE_ID, combine(["!=", ["get", "famille"], "servitude"], hidden));
  }
  if (map.getLayer(SUP_ID)) {
    map.setFilter(SUP_ID, combine(["==", ["get", "famille"], "servitude"], hidden));
  }
  if (map.getLayer(CIRCLE_ID)) {
    map.setFilter(
      CIRCLE_ID,
      combine(["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]], hidden),
    );
  }
}

export function applyUrbaHighlight(
  map: maplibregl.Map,
  data: UrbaFeatureCollection,
  focusIdu: string | null,
  previous: string[],
): string[] {
  if (!map.getSource(URBA_SOURCE_ID)) return [];
  for (const id of previous) {
    try {
      map.removeFeatureState({ source: URBA_SOURCE_ID, id });
    } catch {
      /* source pas encore prête */
    }
  }
  if (!focusIdu) return [];
  const next: string[] = [];
  for (const feature of data.features) {
    const props = feature.properties;
    const uid = props?.uid;
    const idus = readStringList(props?.idus);
    if (!uid || !idus.includes(focusIdu)) continue;
    map.setFeatureState({ source: URBA_SOURCE_ID, id: uid }, { highlighted: true });
    next.push(uid);
  }
  return next;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return value.split(",").map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function readObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

export type UrbaInspectRow = {
  key: string;
  label: string;
  value: string;
};

export type UrbaInspectPayload = {
  title: string;
  layerLabel: string;
  rows: UrbaInspectRow[];
};

const FIELD_LABEL: Record<string, string> = {
  libelle: "Libellé",
  libelong: "Libellé long",
  typezone: "Type de zone",
  urlfic: "Règlement",
  nomfic: "Fichier",
  datappro: "Approbation",
  datvalid: "Validation",
  idurba: "Document",
  partition: "Partition",
  insee: "INSEE",
  txt: "Texte",
  typepsc: "Type",
  stypepsc: "Sous-type",
};

function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/_/g, " ");
}

function formatAttr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function urbaInspectFromProps(props: UrbaEntiteProps): UrbaInspectPayload {
  const attributs = readObject(props.attributs);
  const idus = readStringList(props.idus);
  const title = [props.code, props.libelle_cnig || props.libelle].filter(Boolean).join(" · ");
  const rows: UrbaInspectRow[] = Object.entries(attributs)
    .map(([key, value]) => ({ key, label: fieldLabel(key), value: formatAttr(value) }))
    .filter((row) => row.value !== "");
  if (idus.length) {
    rows.push({ key: "idus", label: "Parcelles", value: idus.join(", ") });
  }
  return {
    title: title || props.display_name || "Entité",
    layerLabel: props.display_name || props.famille || "",
    rows,
  };
}

export function bindUrbaClick(
  map: maplibregl.Map,
  onInspect: (payload: UrbaInspectPayload | null) => void,
): () => void {
  const onClick = (event: maplibregl.MapMouseEvent) => {
    const layers = URBA_LAYER_IDS.filter((id) => map.getLayer(id));
    if (!layers.length) return;
    const features = map.queryRenderedFeatures(event.point, { layers });
    if (!features.length) {
      onInspect(null);
      return;
    }
    onInspect(urbaInspectFromProps((features[0].properties ?? {}) as UrbaEntiteProps));
  };
  map.on("click", onClick);
  return () => {
    map.off("click", onClick);
  };
}

export function urbaFeatureAt(
  map: maplibregl.Map,
  point: maplibregl.PointLike,
): boolean {
  const layers = URBA_LAYER_IDS.filter((id) => {
    try {
      return Boolean(map.getLayer(id));
    } catch {
      return false;
    }
  });
  if (!layers.length) return false;
  return map.queryRenderedFeatures(point, { layers }).length > 0;
}
