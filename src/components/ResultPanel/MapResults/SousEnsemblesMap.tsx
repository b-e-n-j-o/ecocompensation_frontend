/**
 * SousEnsemblesMap.tsx
 * ─────────────────────
 * Carte MapLibre satellite affichant :
 *   1. Les sous-ensembles UF (lots de parcelles) colorés par score_norm
 *   2. Les couches thématiques de résultats (lazy, même registry que ParcellesMap)
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
  thematicLayerIds,
  type ResultsThematicPreload,
  type ThematicLayerState,
} from "./cartoCouchesRegistry";
import { LegendeMapResultats } from "./LegendeMapResultats";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreNormColorExpression(): unknown[] {
  return [
    "interpolate", ["linear"], ["get", "score_norm"],
    0,    "#333a4d",
    0.33, "#555f72",
    0.66, "#f59e0b",
    1,    "#3ecf8e",
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SousEnsemblesMapProps {
  geojson: FeatureCollection<Geometry, Record<string, unknown>> | null;
  subsetScores: Record<string, number> | null;
  projectId?: string | null;
  preloadedThematic?: ResultsThematicPreload | null;
  thematicPreloadLoading?: boolean;
}
type BaseMapMode = "satellite" | "plan";

// ─── Composant ────────────────────────────────────────────────────────────────

export function SousEnsemblesMap({ geojson, subsetScores, projectId, preloadedThematic, thematicPreloadLoading = false }: SousEnsemblesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map          = useRef<maplibregl.Map | null>(null);
  const fetchedRef   = useRef<Set<string>>(new Set());

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(buildInitialThematic);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");

  // Reset au changement de projet
  useEffect(() => {
    setThematicState(buildInitialThematic());
    fetchedRef.current = new Set();
  }, [projectId]);

  useEffect(() => {
    if (preloadedThematic === undefined) return;
    if (preloadedThematic === null) {
      setThematicState(buildInitialThematic());
      fetchedRef.current = new Set();
      return;
    }
    setThematicState((prev) => {
      const next = { ...prev };
      for (const def of RESULTS_LAYERS) {
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
  }, [preloadedThematic]);

  // Normalisation des scores sur les features
  const coloredGeojson = useMemo(() => {
    if (!geojson?.features?.length) return null;
    const scores = Object.values(subsetScores ?? {});
    const minS = scores.length ? Math.min(...scores) : 0;
    const maxS = scores.length ? Math.max(...scores) : 1;
    const rng = maxS - minS || 1;
    return {
      ...geojson,
      features: geojson.features.map((f) => {
        const sid = f.properties?.subset_id as string | undefined;
        const score = sid && subsetScores ? subsetScores[sid] ?? 0 : 0;
        return {
          ...f,
          properties: { ...(f.properties ?? {}), subset_id: sid, score, score_norm: round4((score - minS) / rng) },
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
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // ── Sync sous-ensembles ───────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !coloredGeojson?.features?.length) return;

    const apply = () => {
      if (!map.current) return;

      // Sous-ensembles UF
      if (map.current.getSource("uf-subsets")) {
        (map.current.getSource("uf-subsets") as maplibregl.GeoJSONSource).setData(coloredGeojson as unknown as FeatureCollection);
      } else {
        map.current.addSource("uf-subsets", { type: "geojson", data: coloredGeojson as unknown as FeatureCollection });
        map.current.addLayer({
          id: "uf-subsets-fill", type: "fill", source: "uf-subsets",
          paint: {
            "fill-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.4,
          },
        });
        map.current.addLayer({
          id: "uf-subsets-outline", type: "line", source: "uf-subsets",
          paint: {
            "line-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "line-width": 2,
          },
        });

        // Couches thématiques — insérées AVANT uf-subsets (restent en dessous)
        for (const def of RESULTS_LAYERS) {
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

        // Popup hover couches thématiques
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "260px" });
        const thematicFillIds = RESULTS_LAYERS.map((d) => thematicLayerIds(d.key).fillId);

        map.current.on("mousemove", (e) => {
          if (!map.current) return;
          const visible = thematicFillIds.filter((id) => {
            try { return map.current!.getLayoutProperty(id, "visibility") === "visible"; } catch { return false; }
          });
          if (!visible.length) { popup.remove(); return; }
          const features = map.current.queryRenderedFeatures(e.point, { layers: visible });
          if (!features.length) { popup.remove(); return; }
          const f = features[0];
          const def = RESULTS_LAYERS.find((d) => thematicLayerIds(d.key).fillId === f.layer?.id);
          if (!def) return;
          const rows = def.popupFields
            .filter(({ field }) => f.properties?.[field] != null)
            .map(({ field, label }) =>
              `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">${label}</th><td>${f.properties![field]}</td></tr>`
            ).join("");
          popup.setLngLat(e.lngLat)
            .setHTML(`<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">${def.label}</div><table style="font-size:12px;border-collapse:collapse">${rows}</table>`)
            .addTo(map.current);
        });
        map.current.on("mouseleave", () => { popup.remove(); });

        const subsetPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "340px" });
        map.current.on("mousemove", "uf-subsets-fill", (e) => {
          if (!map.current) return;
          const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          const subsetId = props.subset_id ? String(props.subset_id) : "—";
          const siren = props.siren ? String(props.siren) : "—";
          const denomination = props.denomination ? String(props.denomination) : "—";
          const score = typeof props.score === "number" ? props.score : Number(props.score ?? NaN);
          const scoreNorm = typeof props.score_norm === "number" ? props.score_norm : Number(props.score_norm ?? NaN);

          const rows = [
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">subset_id</th><td class="mono">${subsetId}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">SIREN</th><td class="mono">${siren}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Dénomination</th><td>${denomination}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Score</th><td>${Number.isFinite(score) ? score.toFixed(4) : "—"}</td></tr>`,
            `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">Score norm.</th><td>${Number.isFinite(scoreNorm) ? scoreNorm.toFixed(4) : "—"}</td></tr>`,
          ].join("");

          subsetPopup
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Sous-ensemble UF</div><table style="font-size:12px;border-collapse:collapse">${rows}</table>`)
            .addTo(map.current);
        });
        map.current.on("mouseenter", "uf-subsets-fill", () => map.current?.getCanvas().style.setProperty("cursor", "pointer"));
        map.current.on("mouseleave", "uf-subsets-fill", () => {
          map.current?.getCanvas().style.removeProperty("cursor");
          subsetPopup.remove();
        });
      }

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds();
      coloredGeojson.features.forEach((f: GeoJSON.Feature) => {
        if (!f.geometry) return;
        if (f.geometry.type === "Polygon") {
          f.geometry.coordinates[0].forEach((c: number[]) => bounds.extend(c as [number, number]));
        } else if (f.geometry.type === "MultiPolygon") {
          (f.geometry.coordinates as number[][][][]).forEach((ring) =>
            ring[0].forEach((c) => bounds.extend(c as [number, number]))
          );
        }
      });
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 50 });
    };

    if (map.current.isStyleLoaded()) apply(); else map.current.once("load", apply);
  }, [coloredGeojson]);

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

  // ── Sync couches thématiques ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    for (const def of RESULTS_LAYERS) {
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
      const def = RESULTS_LAYERS.find((d) => d.key === layerKey);
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
      </div>
      <div
        ref={mapContainer}
        className="parcelles-map"
        style={{ width: "100%", height: "100%" }}
        title="Sous-ensembles UF (unités foncières) — colorés par score"
      />
      <LegendeMapResultats
        layers={RESULTS_LAYERS}
        layersState={thematicState}
        onToggle={toggleLayer}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
      />
    </div>
  );
}