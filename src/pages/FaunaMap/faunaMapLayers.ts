import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import {
  DRAW_BBOX_SOURCE,
  DRAW_POINT_SOURCE,
  DRAW_RADIUS_SOURCE,
  DRAW_ZONE_SOURCE,
  ECO_POINT_COLOR,
  FAUNA_BUFFERS_SOURCE,
  FAUNA_COLOR_PROP,
  FAUNA_POINTS_SOURCE,
  USER_SHP_CENTROID_SOURCE,
  USER_SHP_SOURCE,
  emptyFC,
  escapeHtml,
} from "./faunaMapShared";

export function addFaunaDrawLayers(map: MapLibreMap) {
  if (map.getSource(DRAW_ZONE_SOURCE)) return;

  map.addSource(DRAW_ZONE_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "fauna-draw-zone-fill",
    type: "fill",
    source: DRAW_ZONE_SOURCE,
    paint: { "fill-color": "#85e372", "fill-opacity": 0.28 },
  });
  map.addLayer({
    id: "fauna-draw-zone-line",
    type: "line",
    source: DRAW_ZONE_SOURCE,
    paint: { "line-color": "#289f01", "line-width": 2.5, "line-dasharray": [2, 1.5] },
  });

  map.addSource(DRAW_BBOX_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "fauna-draw-bbox-fill",
    type: "fill",
    source: DRAW_BBOX_SOURCE,
    paint: { "fill-color": "#85e372", "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "fauna-draw-bbox-line",
    type: "line",
    source: DRAW_BBOX_SOURCE,
    paint: { "line-color": "#289f01", "line-width": 2.5 },
  });

  map.addSource(DRAW_RADIUS_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "fauna-draw-radius-fill",
    type: "fill",
    source: DRAW_RADIUS_SOURCE,
    paint: { "fill-color": "#42a5f5", "fill-opacity": 0.14 },
  });
  map.addLayer({
    id: "fauna-draw-radius-line",
    type: "line",
    source: DRAW_RADIUS_SOURCE,
    paint: { "line-color": "#1565c0", "line-width": 2, "line-dasharray": [2, 2] },
  });

  map.addSource(DRAW_POINT_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "fauna-draw-point-halo",
    type: "circle",
    source: DRAW_POINT_SOURCE,
    paint: { "circle-radius": 10, "circle-color": "#42a5f5", "circle-opacity": 0.35 },
  });
  map.addLayer({
    id: "fauna-draw-point-core",
    type: "circle",
    source: DRAW_POINT_SOURCE,
    paint: {
      "circle-radius": 5,
      "circle-color": "#1565c0",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

export function addFaunaShpLayers(map: MapLibreMap) {
  if (map.getSource(USER_SHP_SOURCE)) return;

  map.addSource(USER_SHP_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "user-shp-fill",
    type: "fill",
    source: USER_SHP_SOURCE,
    filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
    paint: { "fill-color": "#e53935", "fill-opacity": 0.28, "fill-outline-color": "#b71c1c" },
  });
  map.addLayer({
    id: "user-shp-line",
    type: "line",
    source: USER_SHP_SOURCE,
    filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
    paint: { "line-color": "#c62828", "line-width": 2.5 },
  });
  map.addLayer({
    id: "user-shp-circle",
    type: "circle",
    source: USER_SHP_SOURCE,
    filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7, 10, 5, 16, 4],
      "circle-color": "#ff1744",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#3e2723",
    },
  });

  map.addSource(USER_SHP_CENTROID_SOURCE, { type: "geojson", data: emptyFC() });
  map.addLayer({
    id: "user-shp-centroid-halo",
    type: "circle",
    source: USER_SHP_CENTROID_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 32, 4, 26, 7, 20, 11, 16, 16, 12],
      "circle-color": "#ff5252",
      "circle-opacity": 0.5,
      "circle-blur": 0.5,
    },
  });
  map.addLayer({
    id: "user-shp-centroid-core",
    type: "circle",
    source: USER_SHP_CENTROID_SOURCE,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 4, 12, 7, 9, 11, 7, 16, 6],
      "circle-color": "#b71c1c",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 2, 4, 7, 3, 16, 2],
      "circle-stroke-color": "#ffffff",
    },
  });
}

const faunaColorExpr: maplibregl.ExpressionSpecification = [
  "coalesce",
  ["get", FAUNA_COLOR_PROP],
  ECO_POINT_COLOR,
];

export function addFaunaObservationLayers(map: MapLibreMap) {
  if (!map.getSource(FAUNA_BUFFERS_SOURCE)) {
    map.addSource(FAUNA_BUFFERS_SOURCE, { type: "geojson", data: emptyFC() });
  }
  if (!map.getLayer(`${FAUNA_BUFFERS_SOURCE}-fill`)) {
    map.addLayer({
      id: `${FAUNA_BUFFERS_SOURCE}-fill`,
      type: "fill",
      source: FAUNA_BUFFERS_SOURCE,
      paint: { "fill-color": faunaColorExpr, "fill-opacity": 0.15 },
    });
  }
  if (!map.getLayer(`${FAUNA_BUFFERS_SOURCE}-line`)) {
    map.addLayer({
      id: `${FAUNA_BUFFERS_SOURCE}-line`,
      type: "line",
      source: FAUNA_BUFFERS_SOURCE,
      paint: { "line-color": faunaColorExpr, "line-width": 1.5, "line-dasharray": [2, 2] },
    });
  }

  if (!map.getSource(FAUNA_POINTS_SOURCE)) {
    map.addSource(FAUNA_POINTS_SOURCE, {
      type: "geojson",
      data: emptyFC(),
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 48,
    });
  }

  if (!map.getLayer(`${FAUNA_POINTS_SOURCE}-clusters`)) {
    map.addLayer({
      id: `${FAUNA_POINTS_SOURCE}-clusters`,
      type: "circle",
      source: FAUNA_POINTS_SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ECO_POINT_COLOR,
        "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 24],
        "circle-opacity": 0.82,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer(`${FAUNA_POINTS_SOURCE}-cluster-count`)) {
    try {
      map.addLayer({
        id: `${FAUNA_POINTS_SOURCE}-cluster-count`,
        type: "symbol",
        source: FAUNA_POINTS_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["to-string", ["get", "point_count"]],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#111111" },
      });
    } catch {
      /* glyphs indisponibles */
    }
  }

  if (!map.getLayer(`${FAUNA_POINTS_SOURCE}-circle`)) {
    map.addLayer({
      id: `${FAUNA_POINTS_SOURCE}-circle`,
      type: "circle",
      source: FAUNA_POINTS_SOURCE,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 7, 16, 9],
        "circle-color": faunaColorExpr,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    });
  } else {
    map.setPaintProperty(`${FAUNA_POINTS_SOURCE}-circle`, "circle-color", faunaColorExpr);
  }
  if (map.getLayer(`${FAUNA_BUFFERS_SOURCE}-fill`)) {
    map.setPaintProperty(`${FAUNA_BUFFERS_SOURCE}-fill`, "fill-color", faunaColorExpr);
  }
  if (map.getLayer(`${FAUNA_BUFFERS_SOURCE}-line`)) {
    map.setPaintProperty(`${FAUNA_BUFFERS_SOURCE}-line`, "line-color", faunaColorExpr);
  }
}

export function bindFaunaPointInteractions(map: MapLibreMap, isDrawing: () => boolean) {
  const circleId = `${FAUNA_POINTS_SOURCE}-circle`;
  const clusterId = `${FAUNA_POINTS_SOURCE}-clusters`;

  const onPointClick = (e: maplibregl.MapLayerMouseEvent) => {
    if (isDrawing()) return;
    const f = e.features?.[0];
    const p = f?.properties;
    if (!p || typeof p !== "object") return;
    const props = p as Record<string, unknown>;
    const html = `
      <div class="di-popup" style="font-size:12px; line-height:1.5; color:#111;">
        <strong>${escapeHtml(props.nom_vernaculaire ?? "—")}</strong>
        <div style="color:#4b4b4b;">${escapeHtml(props.nom_taxref ?? "")}</div>
        <div><span>Classe</span><b>${escapeHtml(props.classe ?? "—")}</b></div>
        <div><span>Famille</span><b>${escapeHtml(props.famille ?? "—")}</b></div>
        <div><span>Date</span><b>${escapeHtml(props.date_debut ?? "—")}</b></div>
        <div><span>id_obs</span><b>${escapeHtml(props.id_obs ?? "—")}</b></div>
        <div><span>cd_ref</span><b>${escapeHtml(props.cd_ref ?? "—")}</b></div>
      </div>`;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
  };

  const onClusterClick = (e: maplibregl.MapLayerMouseEvent) => {
    if (isDrawing()) return;
    const features = map.queryRenderedFeatures(e.point, { layers: [clusterId] });
    const clusterKey = features[0]?.properties?.cluster_id;
    const source = map.getSource(FAUNA_POINTS_SOURCE) as maplibregl.GeoJSONSource;
    if (clusterKey == null || !source?.getClusterExpansionZoom) return;
    void source.getClusterExpansionZoom(clusterKey).then((zoom) => {
      const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      map.easeTo({ center: coords, zoom });
    });
  };

  const pointer = () => {
    if (!isDrawing()) map.getCanvas().style.cursor = "pointer";
  };
  const unpointer = () => {
    if (!isDrawing()) map.getCanvas().style.cursor = "";
  };

  map.on("click", circleId, onPointClick);
  map.on("click", clusterId, onClusterClick);
  map.on("mouseenter", circleId, pointer);
  map.on("mouseleave", circleId, unpointer);
  map.on("mouseenter", clusterId, pointer);
  map.on("mouseleave", clusterId, unpointer);

  return () => {
    map.off("click", circleId, onPointClick);
    map.off("click", clusterId, onClusterClick);
    map.off("mouseenter", circleId, pointer);
    map.off("mouseleave", circleId, unpointer);
    map.off("mouseenter", clusterId, pointer);
    map.off("mouseleave", clusterId, unpointer);
  };
}

export type AddFaunaLayersOptions = {
  shapefile?: boolean;
};

export function addFaunaLayers(map: MapLibreMap, options: AddFaunaLayersOptions = {}) {
  addFaunaObservationLayers(map);
  addFaunaDrawLayers(map);
  if (options.shapefile) addFaunaShpLayers(map);
}

export function faunaSourceHasData(map: MapLibreMap): boolean {
  const src = map.getSource(FAUNA_POINTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src || !("serialize" in src)) return false;
  try {
    const data = (src as unknown as { _data?: FeatureCollection })._data;
    return Boolean(data?.features?.length);
  } catch {
    return false;
  }
}
