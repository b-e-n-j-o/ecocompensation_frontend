/**
 * ParcellesMap.tsx
 * ─────────────────
 * Carte MapLibre satellite affichant :
 *   1. Le foncier source (emprise projet, contour rose)
 *   2. Les parcelles résultats du filtre (colorées par score_norm)
 *   3. Les couches thématiques de résultats (lazy, toggle légende)
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParcelleProperties = {
  idu?: string;
  score?: number;
  score_norm?: number;
  [key: string]: unknown;
};

export type ParcellesGeoJSON = FeatureCollection<Geometry, ParcelleProperties>;

interface ParcellesMapProps {
  geojson: ParcellesGeoJSON | null;
  foncierGeojson?: unknown;
  projectId?: string | null;
  onParcelleDoubleClick?: (idu: string) => void;
  loadingMessage?: string | null;
  /** Préchargement après filtrage — affichage carte instantané au toggle (couches restent masquées). */
  preloadedThematic?: ResultsThematicPreload | null;
  /** Tant que le prefetch global des couches thématiques est en cours (légende). */
  thematicPreloadLoading?: boolean;
}

// ─── Helpers MapLibre ─────────────────────────────────────────────────────────

function scoreNormColorExpression(): unknown[] {
  return [
    "interpolate", ["linear"], ["get", "score_norm"],
    0,    "#333a4d",
    0.33, "#555f72",
    0.66, "#f59e0b",
    1,    "#3ecf8e",
  ];
}

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri-satellite", type: "raster", source: "esri-satellite" }],
};

function emptyFC(): FeatureCollection { return { type: "FeatureCollection", features: [] }; }

// ─── Composant ────────────────────────────────────────────────────────────────

export function ParcellesMap({
  geojson,
  foncierGeojson,
  projectId,
  onParcelleDoubleClick,
  loadingMessage = null,
  preloadedThematic,
  thematicPreloadLoading = false,
}: ParcellesMapProps) {
  const mapContainer       = useRef<HTMLDivElement>(null);
  const map                = useRef<maplibregl.Map | null>(null);
  const onDoubleClickRef   = useRef(onParcelleDoubleClick);
  onDoubleClickRef.current = onParcelleDoubleClick;
  const fetchedRef         = useRef<Set<string>>(new Set());

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(buildInitialThematic);
  const [parcellesVisible, setParcellesVisible] = useState(true);

  // Reset au changement de projet
  useEffect(() => {
    setThematicState(buildInitialThematic());
    fetchedRef.current = new Set();
    setParcellesVisible(true);
  }, [projectId]);

  // Préchargement des couches thématiques (après filtrage) — données prêtes, visibilité inchangée
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

  // ── Init carte ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: SATELLITE_STYLE,
      center: [0, 47],
      zoom: 8,
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // ── Sync parcelles + foncier ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !geojson?.features?.length) return;

    const apply = () => {
      if (!map.current) return;

      // Foncier
      if (foncierGeojson) {
        if (map.current.getSource("foncier")) {
          (map.current.getSource("foncier") as maplibregl.GeoJSONSource).setData(foncierGeojson as FeatureCollection);
        } else {
          map.current.addSource("foncier", { type: "geojson", data: foncierGeojson as FeatureCollection });
          map.current.addLayer({ id: "foncier-fill",    type: "fill", source: "foncier", paint: { "fill-color": "#ff4fa3", "fill-opacity": 0.25 } });
          map.current.addLayer({ id: "foncier-outline", type: "line", source: "foncier", paint: { "line-color": "#ff4fa3", "line-width": 3 } });
        }
      }

      // Parcelles
      if (map.current.getSource("parcelles")) {
        (map.current.getSource("parcelles") as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.current.addSource("parcelles", { type: "geojson", data: geojson });
        map.current.addLayer({
          id: "parcelles-fill", type: "fill", source: "parcelles",
          paint: {
            "fill-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.4,
          },
        });
        map.current.addLayer({
          id: "parcelles-outline", type: "line", source: "parcelles",
          paint: {
            "line-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "line-width": 2,
          },
        });

        // Couches thématiques — insérées AVANT parcelles (restent en dessous)
        for (const def of RESULTS_LAYERS) {
          const { sourceId, fillId, lineId, circleId } = thematicLayerIds(def.key);
          if (!map.current.getSource(sourceId)) {
            map.current.addSource(sourceId, { type: "geojson", data: emptyFC() });
            map.current.addLayer(
              { id: fillId, type: "fill", source: sourceId, paint: { "fill-color": def.fillColor, "fill-opacity": def.fillOpacity }, layout: { visibility: "none" } },
              "parcelles-fill",
            );
            map.current.addLayer(
              { id: lineId, type: "line", source: sourceId, paint: { "line-color": def.lineColor, "line-width": def.lineWidth }, layout: { visibility: "none" } },
              "parcelles-fill",
            );
            map.current.addLayer(
              {
                id: circleId,
                type: "circle",
                source: sourceId,
                filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]] as maplibregl.ExpressionSpecification,
                paint: {
                  "circle-color": def.fillColor,
                  "circle-stroke-color": def.lineColor,
                  "circle-stroke-width": 1,
                  "circle-radius": 4,
                  "circle-opacity": 0.9,
                },
                layout: { visibility: "none" },
              },
              "parcelles-fill",
            );
          }
        }

        // Popup hover couches thématiques
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "260px" });
        const thematicInteractiveIds = RESULTS_LAYERS.flatMap((d) => {
          const ids = thematicLayerIds(d.key);
          return [ids.fillId, ids.lineId, ids.circleId];
        });

        map.current.on("mousemove", (e) => {
          if (!map.current) return;
          const visible = thematicInteractiveIds.filter((id) => {
            try { return map.current!.getLayoutProperty(id, "visibility") === "visible"; } catch { return false; }
          });
          if (!visible.length) { map.current.getCanvas().style.cursor = ""; popup.remove(); return; }
          const features = map.current.queryRenderedFeatures(e.point, { layers: visible });
          if (!features.length) { map.current.getCanvas().style.cursor = ""; popup.remove(); return; }
          map.current.getCanvas().style.cursor = "pointer";
          const f = features[0];
          const def = RESULTS_LAYERS.find((d) => {
            const ids = thematicLayerIds(d.key);
            return f.layer?.id === ids.fillId || f.layer?.id === ids.lineId || f.layer?.id === ids.circleId;
          });
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
        map.current.on("mouseleave", () => { map.current?.getCanvas().style.removeProperty("cursor"); popup.remove(); });

        map.current.on("dblclick", "parcelles-fill", (e) => {
          const props = e.features?.[0]?.properties as ParcelleProperties | undefined;
          if (props?.idu && typeof props.idu === "string") onDoubleClickRef.current?.(props.idu);
        });
        map.current.on("mouseenter", "parcelles-fill", () => map.current?.getCanvas().style.setProperty("cursor", "pointer"));
        map.current.on("mouseleave", "parcelles-fill", () => map.current?.getCanvas().style.removeProperty("cursor"));
      }

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds();
      geojson.features.forEach((f: GeoJSON.Feature) => {
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
  }, [geojson, foncierGeojson]);

  // ── Visibilité parcelles (toggle légende) ────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const vis = parcellesVisible ? "visible" : "none";
    try {
      map.current.setLayoutProperty("parcelles-fill", "visibility", vis);
      map.current.setLayoutProperty("parcelles-outline", "visibility", vis);
    } catch {
      /* layers pas encore montées */
    }
  }, [parcellesVisible, geojson]);

  // ── Sync couches thématiques ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    for (const def of RESULTS_LAYERS) {
      const st = thematicState[def.key];
      if (!st) continue;
      const { sourceId, fillId, lineId, circleId } = thematicLayerIds(def.key);
      const src = map.current.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      if (st.geojson) {
        src.setData(st.geojson as FeatureCollection);
        if (def.discriminantField && st.loadState === "loaded") {
          try {
            const colorExpr = buildDiscriminantColorExpression(
              def.discriminantField,
              st.geojson,
              def.fillColor,
            ) as maplibregl.ExpressionSpecification;
            map.current.setPaintProperty(
              fillId, "fill-color",
              colorExpr,
            );
            map.current.setPaintProperty(circleId, "circle-color", colorExpr);
            map.current.setPaintProperty(lineId, "line-color", colorExpr);

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
        map.current.setLayoutProperty(circleId, "visibility", vis);
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

      // On garde l'ordre naturel des valeurs
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
        ref={mapContainer}
        className={`parcelles-map${loadingMessage ? " parcelles-map--loading" : ""}`}
        style={{ width: "100%", height: "100%" }}
        title="Double-cliquez sur une parcelle pour afficher sa ligne dans le classement"
      />
      {loadingMessage && (
        <div className="parcelles-map-loading-overlay" aria-live="polite">
          <div className="parcelles-map-loading-card">
            <span className="parcelles-map-spinner" />
            <span className="loading-text-breathe">{loadingMessage}</span>
          </div>
        </div>
      )}
      <LegendeMapResultats
        layers={RESULTS_LAYERS}
        layersState={thematicState}
        onToggle={toggleLayer}
        primaryLayer={{
          label: "Parcelles résultats",
          visible: parcellesVisible,
          onToggle: () => setParcellesVisible((v) => !v),
        }}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
      />
    </div>
  );
}