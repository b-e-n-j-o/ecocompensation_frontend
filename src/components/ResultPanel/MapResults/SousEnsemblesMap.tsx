/**
 * SousEnsemblesMap.tsx
 * ─────────────────────
 * Carte MapLibre satellite affichant :
 *   1. Le foncier source (emprise projet)
 *   2. Les sous-ensembles UF colorés par score écologique (score_ratio)
 *   3. Les couches thématiques de résultats (lazy, même registry que ParcellesMap)
 * Liaison table ↔ carte via focusSubsetId / onSubsetClick (même modèle que ParcellesMap).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import type * as GeoJSON from "geojson";
import { fetchResultsLayerGeojson } from "../../../api";
import {
  RESULTS_LAYERS,
  buildInitialThematic,
  buildDiscriminantColorExpression,
  extractDistinctValues,
  getResultsLayerDefs,
  thematicLayerIds,
  type ResultsThematicPreload,
  type ThematicLayerState,
} from "./cartoCouchesRegistry";
import { LegendeMapResultats } from "./LegendeMapResultats";
import {
  createMapHoverPopup,
  hideMapHoverPopup,
  showMapHoverPopup,
} from "./mapHoverPopup";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreNormColorExpression(): unknown[] {
  return [
    "step", ["coalesce", ["get", "score_ratio"], 0],
    "#6b7280",
    0.2, "#f59e0b",
    0.5, "#16a34a",
    0.8, "#166534",
  ];
}

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    "osm-standard": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "basemap-satellite", type: "raster", source: "esri-satellite", layout: { visibility: "visible" } },
    { id: "basemap-plan", type: "raster", source: "osm-standard", layout: { visibility: "none" } },
  ],
};

function emptyFC(): FeatureCollection { return { type: "FeatureCollection", features: [] }; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extendBoundsFromFeature(bounds: maplibregl.LngLatBounds, f: GeoJSON.Feature) {
  const geom = f.geometry;
  if (!geom) return;
  if (geom.type === "Polygon") {
    geom.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach((poly) => poly[0].forEach((c) => bounds.extend(c as [number, number])));
  }
}

function focusFilterForSubsetId(subsetId: string | null | undefined): maplibregl.FilterSpecification {
  if (!subsetId) return ["==", ["get", "subset_id"], "___none___"];
  return ["==", ["get", "subset_id"], subsetId];
}

function ensureHighlightOutlineLayer(m: maplibregl.Map) {
  if (m.getLayer("uf-subsets-highlight-outline")) return;
  m.addLayer({
    id: "uf-subsets-highlight-outline",
    type: "line",
    source: "uf-subsets",
    filter: focusFilterForSubsetId(null),
    paint: {
      "line-color": "#fbbf24",
      "line-width": 4,
      "line-opacity": 1,
    },
  });
}

const SUBSET_HIT_LAYERS = ["uf-subsets-fill"];

function pickSubsetAtPoint(m: maplibregl.Map, point: maplibregl.PointLike): Record<string, unknown> | null {
  try {
    if (!m.getLayer("uf-subsets-fill")) return null;
    const features = m.queryRenderedFeatures(point, { layers: SUBSET_HIT_LAYERS });
    if (!features.length) return null;
    return (features[0].properties ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function subsetFillOpacityExpr(focusUfId: string | null): maplibregl.ExpressionSpecification {
  if (focusUfId) {
    return ["case", ["==", ["get", "uf_id"], focusUfId], 0.5, 0.15] as maplibregl.ExpressionSpecification;
  }
  return 0.4 as unknown as maplibregl.ExpressionSpecification;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SousEnsemblesMapProps {
  geojson: FeatureCollection<Geometry, Record<string, unknown>> | null;
  subsetScores?: Record<string, number> | null;
  foncierGeojson?: unknown;
  projectId?: string | null;
  preloadedThematic?: ResultsThematicPreload | null;
  thematicPreloadLoading?: boolean;
  /** Clés des couches thématiques à afficher (selon type d'étude). */
  thematicLayerKeys?: string[];
  focusSubsetId?: string | null;
  focusUfId?: string | null;
  onSubsetClick?: (subsetId: string) => void;
}
type BaseMapMode = "satellite" | "plan";

// ─── Composant ────────────────────────────────────────────────────────────────

export function SousEnsemblesMap({
  geojson,
  subsetScores,
  foncierGeojson,
  projectId,
  preloadedThematic,
  thematicPreloadLoading = false,
  thematicLayerKeys,
  focusSubsetId = null,
  focusUfId = null,
  onSubsetClick,
}: SousEnsemblesMapProps) {
  const activeLayers = useMemo(
    () =>
      getResultsLayerDefs(
        thematicLayerKeys ?? RESULTS_LAYERS.map((d) => d.key),
      ),
    [thematicLayerKeys],
  );

  const mapContainer = useRef<HTMLDivElement>(null);
  const map          = useRef<maplibregl.Map | null>(null);
  const fetchedRef   = useRef<Set<string>>(new Set());
  const onSubsetClickRef = useRef(onSubsetClick);
  onSubsetClickRef.current = onSubsetClick;
  const subsetPopupRef = useRef<maplibregl.Popup | null>(null);
  const subsetHandlersBoundRef = useRef(false);
  const didInitialFitRef = useRef(false);

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(() =>
    buildInitialThematic(thematicLayerKeys),
  );
  const [subsetsVisible, setSubsetsVisible] = useState(true);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");

  // Reset au changement de projet
  useEffect(() => {
    setThematicState(buildInitialThematic(thematicLayerKeys));
    fetchedRef.current = new Set();
    didInitialFitRef.current = false;
  }, [projectId, thematicLayerKeys]);

  useEffect(() => {
    if (preloadedThematic === undefined) return;
    if (preloadedThematic === null) {
      setThematicState(buildInitialThematic(thematicLayerKeys));
      fetchedRef.current = new Set();
      return;
    }
    setThematicState((prev) => {
      const next = { ...prev };
      for (const def of activeLayers) {
        const p = preloadedThematic[def.key];
        if (!p) continue;
        const cur = prev[def.key];
        if (p.error) {
          next[def.key] = {
            visible: cur.visible,
            loadState: "error",
            geojson: null,
            error: p.error,
          };
        } else if (p.geojson) {
          next[def.key] = {
            visible: cur.visible,
            loadState: "loaded",
            geojson: p.geojson,
            error: null,
          };
        }
        fetchedRef.current.add(def.key);
      }
      return next;
    });
  }, [preloadedThematic, activeLayers, thematicLayerKeys]);

  const geojsonWithScores = useMemo(() => {
    if (!geojson?.features?.length) return null;
    const scores = Object.values(subsetScores ?? {});
    const minS = scores.length ? Math.min(...scores) : 0;
    const maxS = scores.length ? Math.max(...scores) : 1;
    const rng = maxS - minS || 1;

    return {
      ...geojson,
      features: geojson.features.map((f) => {
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const sid = props.subset_id ? String(props.subset_id) : undefined;
        let scoreRatio = toFiniteNumber(props.score_ratio);
        if (scoreRatio == null && sid && subsetScores && sid in subsetScores) {
          scoreRatio = round4((subsetScores[sid] - minS) / rng);
        }
        const scoreEco = toFiniteNumber(props.score_eco);
        const scoreMax = toFiniteNumber(props.score_eco_max) ?? 6;
        if (scoreRatio == null && scoreEco != null && scoreMax > 0) {
          scoreRatio = round4(scoreEco / scoreMax);
        }
        return {
          ...f,
          properties: {
            ...props,
            subset_id: sid,
            score_ratio: scoreRatio ?? 0,
            score_norm: scoreRatio ?? 0,
          } as Record<string, unknown>,
        };
      }),
    };
  }, [geojson, subsetScores]);

  // ── Init carte ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: BASE_STYLE,
      center: [0, 47],
      zoom: 8,
    });
    return () => {
      map.current?.remove();
      map.current = null;
      subsetHandlersBoundRef.current = false;
    };
  }, []);

  // ── Sync sous-ensembles + foncier ─────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !geojsonWithScores?.features?.length) return;

    const apply = () => {
      if (!map.current) return;

      if (foncierGeojson) {
        if (map.current.getSource("foncier")) {
          (map.current.getSource("foncier") as maplibregl.GeoJSONSource).setData(foncierGeojson as FeatureCollection);
        } else {
          map.current.addSource("foncier", { type: "geojson", data: foncierGeojson as FeatureCollection });
          map.current.addLayer({ id: "foncier-fill", type: "fill", source: "foncier", paint: { "fill-color": "#ff4fa3", "fill-opacity": 0.25 } });
          map.current.addLayer({ id: "foncier-outline", type: "line", source: "foncier", paint: { "line-color": "#ff4fa3", "line-width": 3 } });
        }
      }

      const colorExpr = scoreNormColorExpression() as maplibregl.ExpressionSpecification;
      const fillOpacityExpr = subsetFillOpacityExpr(focusUfId);

      if (map.current.getSource("uf-subsets")) {
        (map.current.getSource("uf-subsets") as maplibregl.GeoJSONSource).setData(geojsonWithScores as unknown as FeatureCollection);
        try {
          map.current.setPaintProperty("uf-subsets-fill", "fill-color", colorExpr);
          map.current.setPaintProperty("uf-subsets-outline", "line-color", colorExpr);
          map.current.setPaintProperty("uf-subsets-fill", "fill-opacity", fillOpacityExpr);
        } catch { /* layers pas encore montées */ }
      } else {
        map.current.addSource("uf-subsets", { type: "geojson", data: geojsonWithScores as unknown as FeatureCollection });
        map.current.addLayer({
          id: "uf-subsets-fill", type: "fill", source: "uf-subsets",
          paint: {
            "fill-color": colorExpr,
            "fill-opacity": fillOpacityExpr,
          },
        });
        map.current.addLayer({
          id: "uf-subsets-outline", type: "line", source: "uf-subsets",
          paint: {
            "line-color": colorExpr,
            "line-width": 2,
          },
        });
        ensureHighlightOutlineLayer(map.current);

        for (const def of activeLayers) {
          const { sourceId, fillId, lineId } = thematicLayerIds(def.key);
          if (!map.current.getSource(sourceId)) {
            map.current.addSource(sourceId, { type: "geojson", data: emptyFC() });
            map.current.addLayer(
              { id: fillId, type: "fill", source: sourceId, paint: { "fill-color": def.fillColor, "fill-opacity": def.fillOpacity }, layout: { visibility: "none" } },
              "uf-subsets-fill",
            );
            map.current.addLayer(
              { id: lineId, type: "line", source: sourceId, paint: { "line-color": def.lineColor, "line-width": def.lineWidth }, layout: { visibility: "none" } },
              "uf-subsets-fill",
            );
          }
        }

        const popup = createMapHoverPopup("260px");
        const thematicFillIds = activeLayers.map((d) => thematicLayerIds(d.key).fillId);

        map.current.on("mousemove", (e) => {
          if (!map.current) return;
          const visible = thematicFillIds.filter((id) => {
            try { return map.current!.getLayoutProperty(id, "visibility") === "visible"; } catch { return false; }
          });
          if (!visible.length) { hideMapHoverPopup(popup); return; }
          const features = map.current.queryRenderedFeatures(e.point, { layers: visible });
          if (!features.length) { hideMapHoverPopup(popup); return; }
          const f = features[0];
          const def = activeLayers.find((d) => thematicLayerIds(d.key).fillId === f.layer?.id);
          if (!def) return;
          const rows = def.popupFields
            .filter(({ field }) => f.properties?.[field] != null)
            .map(({ field, label }) =>
              `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">${label}</th><td>${f.properties![field]}</td></tr>`
            ).join("");
          showMapHoverPopup(
            popup,
            map.current,
            `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">${def.label}</div><table style="font-size:12px;border-collapse:collapse">${rows}</table>`,
          );
        });
        map.current.on("mouseleave", () => { hideMapHoverPopup(popup); });
      }

      if (!subsetHandlersBoundRef.current && map.current.getLayer("uf-subsets-fill")) {
        const onSubsetMove = (e: maplibregl.MapLayerMouseEvent) => {
          if (!map.current) return;
          const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          const subsetId = props.subset_id ? String(props.subset_id) : "—";
          const ufId = props.uf_id ? String(props.uf_id) : "—";
          const siren = props.siren ? String(props.siren) : "—";
          const denomination = props.denomination ? String(props.denomination) : "—";
          const scoreEco = toFiniteNumber(props.score_eco);
          const scoreMax = toFiniteNumber(props.score_eco_max) ?? 6;
          const scoreRatio = toFiniteNumber(props.score_ratio);
          const surface = toFiniteNumber(props.surface_ha);
          const miller = toFiniteNumber(props.miller);

          const rows = [
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">subset_id</th><td class="mono">${subsetId}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">UF</th><td class="mono">${ufId}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">SIREN</th><td class="mono">${siren}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Dénomination</th><td>${denomination}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Score éco</th><td>${scoreEco != null ? `${scoreEco.toFixed(2)}/${scoreMax}` : "—"}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Ratio</th><td>${scoreRatio != null ? scoreRatio.toFixed(4) : "—"}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Surface</th><td>${surface != null ? `${surface.toFixed(1)} ha` : "—"}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Miller</th><td>${miller != null ? miller.toFixed(3) : "—"}</td></tr>`,
          ].join("");

          if (!subsetPopupRef.current) {
            subsetPopupRef.current = createMapHoverPopup("360px");
          }
          showMapHoverPopup(
            subsetPopupRef.current,
            map.current,
            `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Sous-ensemble UF</div><table style="font-size:12px;border-collapse:collapse">${rows}</table>`,
          );
          map.current.getCanvas().style.cursor = "pointer";
        };

        const onSubsetLeave = () => {
          subsetPopupRef.current?.remove();
          map.current?.getCanvas().style.removeProperty("cursor");
        };

        const onSubsetClickHandler = (e: maplibregl.MapMouseEvent) => {
          if (!map.current) return;
          const props = pickSubsetAtPoint(map.current, e.point);
          const sid = props?.subset_id;
          if (sid && typeof sid === "string") {
            onSubsetClickRef.current?.(sid);
          }
        };

        map.current.on("mousemove", "uf-subsets-fill", onSubsetMove);
        map.current.on("mouseleave", "uf-subsets-fill", onSubsetLeave);
        map.current.on("click", "uf-subsets-fill", onSubsetClickHandler);
        subsetHandlersBoundRef.current = true;
      }

      if (!didInitialFitRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        geojsonWithScores.features.forEach((f: GeoJSON.Feature) => extendBoundsFromFeature(bounds, f));
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: 50 });
          didInitialFitRef.current = true;
        }
      }
    };

    if (map.current.isStyleLoaded()) apply(); else map.current.once("load", apply);
  }, [geojsonWithScores, foncierGeojson, focusUfId]);

  // ── Opacité UF focus (sans recréer les layers) ────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    try {
      map.current.setPaintProperty("uf-subsets-fill", "fill-opacity", subsetFillOpacityExpr(focusUfId));
    } catch { /* layer pas monté */ }
  }, [focusUfId]);

  // ── Surbrillance sous-ensemble sélectionné ──────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    try {
      ensureHighlightOutlineLayer(map.current);
      map.current.setFilter("uf-subsets-highlight-outline", focusFilterForSubsetId(focusSubsetId));
    } catch { /* layers pas encore montées */ }
  }, [focusSubsetId]);

  useEffect(() => {
    if (!map.current || !geojsonWithScores?.features?.length) return;

    if (focusSubsetId) {
      const feature = geojsonWithScores.features.find(
        (f) => String(f.properties?.subset_id ?? "") === focusSubsetId,
      );
      if (!feature) return;
      const bounds = new maplibregl.LngLatBounds();
      extendBoundsFromFeature(bounds, feature);
      if (bounds.isEmpty()) return;
      map.current.fitBounds(bounds, { padding: 72, maxZoom: 17, duration: 650 });
      return;
    }

    if (focusUfId) {
      const bounds = new maplibregl.LngLatBounds();
      geojsonWithScores.features
        .filter((f) => String(f.properties?.uf_id ?? "") === focusUfId)
        .forEach((f) => extendBoundsFromFeature(bounds, f));
      if (bounds.isEmpty()) return;
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 650 });
    }
  }, [focusSubsetId, focusUfId, geojsonWithScores]);

  // ── Fond de carte (satellite/plan) ────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const satVis = baseMapMode === "satellite" ? "visible" : "none";
    const planVis = baseMapMode === "plan" ? "visible" : "none";
    try {
      map.current.setLayoutProperty("basemap-satellite", "visibility", satVis);
      map.current.setLayoutProperty("basemap-plan", "visibility", planVis);
    } catch {
      /* layers pas encore montées */
    }
  }, [baseMapMode]);

  // ── Visibilité sous-ensembles ───────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const vis = subsetsVisible ? "visible" : "none";
    try {
      map.current.setLayoutProperty("uf-subsets-fill", "visibility", vis);
      map.current.setLayoutProperty("uf-subsets-outline", "visibility", vis);
      if (map.current.getLayer("uf-subsets-highlight-outline")) {
        map.current.setLayoutProperty("uf-subsets-highlight-outline", "visibility", vis);
      }
    } catch { /* layers pas encore montées */ }
  }, [subsetsVisible]);

  // ── Sync couches thématiques ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    for (const def of activeLayers) {
      const st = thematicState[def.key];
      if (!st) continue;
      const { sourceId, fillId, lineId } = thematicLayerIds(def.key);
      const src = map.current.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      if (st.geojson) {
        src.setData(st.geojson as FeatureCollection);
        if (def.discriminantField && st.loadState === "loaded") {
          try {
            map.current.setPaintProperty(
              fillId, "fill-color",
              buildDiscriminantColorExpression(def.discriminantField, st.geojson, def.fillColor) as maplibregl.ExpressionSpecification,
            );

            const selected = st.selectedValues;
            let filter: maplibregl.ExpressionSpecification;
            if (selected && selected.length > 0) {
              filter = [
                "in",
                ["to-string", ["get", def.discriminantField]],
                ["literal", selected],
              ] as maplibregl.ExpressionSpecification;
            } else {
              filter = ["all"] as maplibregl.ExpressionSpecification;
            }
            map.current.setFilter(fillId, filter);
            map.current.setFilter(lineId, filter);
          } catch { /* layer pas encore monté */ }
        }
      }
      const vis = st.visible && st.loadState === "loaded" ? "visible" : "none";
      try {
        map.current.setLayoutProperty(fillId, "visibility", vis);
        map.current.setLayoutProperty(lineId, "visibility", vis);
      } catch { /* layer pas encore monté */ }
    }
  }, [thematicState]);

  // ── Toggle + fetch lazy ───────────────────────────────────────────────────
  const toggleLayer = useCallback((key: string) => {
    setThematicState((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      const nextVisible = !cur.visible;
      if (nextVisible && cur.loadState === "idle" && projectId && !fetchedRef.current.has(key)) {
        fetchedRef.current.add(key);
        fetchResultsLayerGeojson(projectId, key)
          .then((data) => setThematicState((s) => ({ ...s, [key]: { ...s[key], loadState: "loaded", geojson: data, error: null } })))
          .catch((err) => {
            fetchedRef.current.delete(key);
            setThematicState((s) => ({ ...s, [key]: { ...s[key], loadState: "error", error: err instanceof Error ? err.message : "Erreur" } }));
          });
        return { ...prev, [key]: { ...cur, visible: true, loadState: "loading" } };
      }
      return { ...prev, [key]: { ...cur, visible: nextVisible } };
    });
  }, [projectId]);

  const toggleDiscriminantValue = useCallback((layerKey: string, value: string) => {
    setThematicState((prev) => {
      const cur = prev[layerKey];
      if (!cur || !cur.geojson) return prev;
      const def = activeLayers.find((d) => d.key === layerKey);
      if (!def?.discriminantField) return prev;

      const allValues = extractDistinctValues(cur.geojson, def.discriminantField);
      const current = cur.selectedValues ?? allValues;
      const v = String(value);
      let next = current.includes(v)
        ? current.filter((x) => x !== v)
        : [...current, v];

      next = allValues.filter((x) => next.includes(x));

      return {
        ...prev,
        [layerKey]: { ...cur, selectedValues: next },
      };
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 5,
          display: "flex",
          gap: 6,
          background: "rgba(15, 23, 42, 0.78)",
          border: "1px solid #334155",
          borderRadius: 6,
          padding: 4,
        }}
      >
        <button
          type="button"
          onClick={() => setBaseMapMode("satellite")}
          style={{
            border: "1px solid #475569",
            background: baseMapMode === "satellite" ? "#1d4ed8" : "#1f2937",
            color: "#e2e8f0",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Satellite
        </button>
        <button
          type="button"
          onClick={() => setBaseMapMode("plan")}
          style={{
            border: "1px solid #475569",
            background: baseMapMode === "plan" ? "#1d4ed8" : "#1f2937",
            color: "#e2e8f0",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => setSubsetsVisible((v) => !v)}
          style={{
            border: "1px solid #475569",
            background: subsetsVisible ? "#1d4ed8" : "#1f2937",
            color: "#e2e8f0",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
          title={subsetsVisible ? "Masquer les sous-ensembles UF" : "Afficher les sous-ensembles UF"}
        >
          Sous-ensembles
        </button>
      </div>
      <div
        ref={mapContainer}
        className="parcelles-map"
        style={{ width: "100%", height: "100%" }}
        title="Sous-ensembles UF — colorés par score écologique"
      />
      <LegendeMapResultats
        layers={activeLayers}
        layersState={thematicState}
        onToggle={toggleLayer}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
      />
    </div>
  );
}
