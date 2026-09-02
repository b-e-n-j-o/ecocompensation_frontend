/**
 * ParcellesMap.tsx
 * ─────────────────
 * Carte MapLibre satellite affichant :
 *   1. Le foncier source (emprise projet, contour rose)
 *   2. Les parcelles résultats du filtre (colorées par score_norm : score parcelle v1 si dispo, sinon rang distance)
 *   3. Les couches thématiques de résultats (lazy, toggle légende)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import type * as GeoJSON from "geojson";
import { fetchResultsLayerGeojson } from "../../../api";
import type { ParcelPoolMetricRow } from "../../../types";
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
import { buildParcelHoverHtml } from "./ParcelHoverData";
import {
  createMapHoverPopup,
  hideMapHoverPopup,
  showMapHoverPopup,
} from "./mapHoverPopup";

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
  /** Run pool — critères CESBIO / faune pour les couches nationales clippées AOI. */
  poolRunId?: string | null;
  /** Clic simple sur une parcelle — liaison tableau. */
  onParcelleClick?: (idu: string) => void;
  /** Parcelle sélectionnée — surbrillance + centrage carte. */
  focusIdu?: string | null;
  /** Survol tableau — surbrillance instantanée, sans déplacer la caméra. */
  hoverIdu?: string | null;
  loadingMessage?: string | null;
  /** Préchargement après filtrage — affichage carte instantané au toggle (couches restent masquées). */
  preloadedThematic?: ResultsThematicPreload | null;
  /** Tant que le prefetch global des couches thématiques est en cours (légende). */
  thematicPreloadLoading?: boolean;
  /** Métriques pool préchargées, utilisées pour le détail score au hover. */
  poolMetricsByIdu?: Record<string, ParcelPoolMetricRow[]> | null;
  /** Clés des couches thématiques à afficher (selon type d'étude). */
  thematicLayerKeys?: string[];
  /** Nombre de parcelles indésirables (légende carte). */
  indesirableCount?: number;
}
type BaseMapMode = "satellite" | "plan";
type ScoreColorMode = "ecologique" | "foncier";

// ─── Helpers MapLibre ─────────────────────────────────────────────────────────

function scoreNormColorExpression(): unknown[] {
  return [
    // Seuils ratio score/max :
    // <20% gris, 20-50% orange, 50-80% vert, >=80% vert foncé.
    "step", ["coalesce", ["get", "score_ratio"], 0],
    "#6b7280", // < 0.2
    0.2, "#f59e0b", // 0.2 - 0.5
    0.5, "#16a34a", // 0.5 - 0.8
    0.8, "#166534", // >= 0.8
  ];
}

function foncierScoreColorExpression(): unknown[] {
  return [
    "case",
    // Si pas de score foncier, fallback sur la palette eco pour garder une carte lisible.
    ["<", ["coalesce", ["get", "foncier_score"], -1], 0],
    ["step", ["coalesce", ["get", "score_ratio"], 0], "#6b7280", 0.2, "#f59e0b", 0.5, "#16a34a", 0.8, "#166534"],
    ["step", ["coalesce", ["get", "foncier_score"], 0], "#065f46", 21, "#166534", 41, "#92400e", 61, "#b45309", 81, "#991b1b"],
  ];
}

/** Rouge si parcelle marquée indésirable (propriété `pool_indesirable`), sinon couleur score. */
function parcelFillColorExpression(mode: ScoreColorMode): maplibregl.ExpressionSpecification {
  const byScore =
    (mode === "foncier" ? foncierScoreColorExpression() : scoreNormColorExpression()) as maplibregl.ExpressionSpecification;
  return [
    "case",
    ["==", ["coalesce", ["get", "pool_indesirable"], false], true],
    "#dc2626",
    byScore,
  ] as unknown as maplibregl.ExpressionSpecification;
}

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    },
    "osm-standard": {
      type: "raster",
      tiles: [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
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

function extendBoundsFromFeature(bounds: maplibregl.LngLatBounds, f: GeoJSON.Feature) {
  const geom = f.geometry;
  if (!geom) return;
  if (geom.type === "Polygon") {
    geom.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach((poly) => poly[0].forEach((c) => bounds.extend(c as [number, number])));
  }
}

function focusFilterForIdu(idu: string | null | undefined): maplibregl.FilterSpecification {
  if (!idu) return ["==", ["get", "idu"], "___none___"];
  return ["==", ["get", "idu"], idu];
}

const PARCEL_HIT_LAYERS = ["parcelles-fill"];

function pickParcelAtPoint(
  m: maplibregl.Map,
  point: maplibregl.PointLike,
): ParcelleProperties | null {
  try {
    if (!m.getLayer("parcelles-fill")) return null;
    const features = m.queryRenderedFeatures(point, { layers: PARCEL_HIT_LAYERS });
    if (!features.length) return null;
    return (features[0].properties ?? null) as ParcelleProperties | null;
  } catch {
    return null;
  }
}

function ensureHighlightOutlineLayer(m: maplibregl.Map) {
  if (!m.getLayer("parcelles-highlight-fill")) {
    m.addLayer({
      id: "parcelles-highlight-fill",
      type: "fill",
      source: "parcelles",
      filter: focusFilterForIdu(null),
      paint: {
        "fill-color": "#fbbf24",
        "fill-opacity": 0.38,
      },
    });
  }
  if (m.getLayer("parcelles-highlight-outline")) return;
  m.addLayer({
    id: "parcelles-highlight-outline",
    type: "line",
    source: "parcelles",
    filter: focusFilterForIdu(null),
    paint: {
      "line-color": "#fde68a",
      "line-width": 3.5,
      "line-opacity": 1,
    },
  });
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function ParcellesMap({
  geojson,
  foncierGeojson,
  projectId,
  poolRunId = null,
  onParcelleClick,
  focusIdu = null,
  hoverIdu = null,
  loadingMessage = null,
  preloadedThematic,
  thematicPreloadLoading = false,
  poolMetricsByIdu = null,
  thematicLayerKeys,
  indesirableCount = 0,
}: ParcellesMapProps) {
  const activeLayers = useMemo(
    () =>
      getResultsLayerDefs(
        thematicLayerKeys ?? RESULTS_LAYERS.map((d) => d.key),
      ),
    [thematicLayerKeys],
  );

  const mapContainer       = useRef<HTMLDivElement>(null);
  const map                = useRef<maplibregl.Map | null>(null);
  const onParcelleClickRef = useRef(onParcelleClick);
  onParcelleClickRef.current = onParcelleClick;
  const poolMetricsRef = useRef(poolMetricsByIdu);
  poolMetricsRef.current = poolMetricsByIdu;
  const parcellePopupRef = useRef<maplibregl.Popup | null>(null);
  const parcelHandlersBoundRef = useRef(false);
  const didInitialFitRef = useRef(false);
  const fetchedRef         = useRef<Set<string>>(new Set());

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(() =>
    buildInitialThematic(thematicLayerKeys),
  );
  const [parcellesVisible, setParcellesVisible] = useState(true);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");
  const [scoreColorMode, setScoreColorMode] = useState<ScoreColorMode>("ecologique");

  const geojsonWithScoreRatio = useMemo(() => {
    if (!geojson?.features?.length) return geojson;
    return {
      ...geojson,
      features: geojson.features.map((f) => {
        const idu = typeof f.properties?.idu === "string" ? f.properties.idu : "";
        const scoreMetric = (poolMetricsByIdu?.[idu] ?? []).find((m) => m.metric_key === "score_eco");
        const raw = (scoreMetric?.metric_value_jsonb ?? {}) as Record<string, unknown>;
        const totalScore = typeof raw.total_score === "number" ? raw.total_score : Number(raw.total_score ?? NaN);
        const maxScore = typeof raw.max_score === "number" ? raw.max_score : Number(raw.max_score ?? NaN);
        const ratio =
          Number.isFinite(totalScore) && Number.isFinite(maxScore) && maxScore > 0
            ? totalScore / maxScore
            : Number(f.properties?.score_norm ?? 0);
        const dureteMetric = (poolMetricsByIdu?.[idu] ?? []).find((m) => m.metric_key === "durete_fonciere");
        const rawD = (dureteMetric?.metric_value_jsonb ?? {}) as Record<string, unknown>;
        const scoreFinal = toFiniteNumber(rawD.score_final);
        const foncierScore =
          rawD.eligible === true && scoreFinal != null
            ? scoreFinal
            : -1;
        return {
          ...f,
          properties: {
            ...(f.properties ?? {}),
            score_ratio: Math.max(0, Math.min(1, ratio)),
            foncier_score: foncierScore,
          },
        };
      }),
    };
  }, [geojson, poolMetricsByIdu]);

  const foncierCoverage = useMemo(() => {
    const features = geojsonWithScoreRatio?.features ?? [];
    const total = features.length;
    if (total === 0) return { withFoncier: 0, total: 0 };
    let withFoncier = 0;
    for (const f of features) {
      const val = (f.properties as Record<string, unknown> | undefined)?.foncier_score;
      if (typeof val === "number" && Number.isFinite(val) && val >= 0) withFoncier += 1;
    }
    return { withFoncier, total };
  }, [geojsonWithScoreRatio]);

  // Reset au changement de projet ou de run pool (critères CESBIO / faune)
  useEffect(() => {
    setThematicState(buildInitialThematic(thematicLayerKeys));
    fetchedRef.current = new Set();
    setParcellesVisible(true);
    didInitialFitRef.current = false;
    parcelHandlersBoundRef.current = false;
  }, [projectId, poolRunId, thematicLayerKeys]);

  // Préchargement des couches thématiques (après filtrage) — données prêtes, visibilité inchangée
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
      parcelHandlersBoundRef.current = false;
      parcellePopupRef.current?.remove();
      parcellePopupRef.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Vue split 60/40 : MapLibre doit recalculer la taille du canvas
  useEffect(() => {
    const el = mapContainer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      map.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Sync parcelles + foncier ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !geojsonWithScoreRatio?.features?.length) return;

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
        (map.current.getSource("parcelles") as maplibregl.GeoJSONSource).setData(geojsonWithScoreRatio);
        ensureHighlightOutlineLayer(map.current);
      } else {
        map.current.addSource("parcelles", { type: "geojson", data: geojsonWithScoreRatio });
        map.current.addLayer({
          id: "parcelles-fill", type: "fill", source: "parcelles",
          paint: {
            "fill-color": parcelFillColorExpression(scoreColorMode),
            "fill-opacity": 0.4,
          },
        });
        map.current.addLayer({
          id: "parcelles-outline", type: "line", source: "parcelles",
          paint: {
            "line-color": parcelFillColorExpression(scoreColorMode),
            "line-width": 2,
          },
        });
        ensureHighlightOutlineLayer(map.current);

        // Couches thématiques — insérées AVANT parcelles (restent en dessous)
        for (const def of activeLayers) {
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
        const popup = createMapHoverPopup("260px");
        const thematicInteractiveIds = activeLayers.flatMap((d) => {
          const ids = thematicLayerIds(d.key);
          return [ids.fillId, ids.lineId, ids.circleId];
        });

        map.current.on("mousemove", (e) => {
          if (!map.current) return;
          const visible = thematicInteractiveIds.filter((id) => {
            try { return map.current!.getLayoutProperty(id, "visibility") === "visible"; } catch { return false; }
          });
          if (!visible.length) { hideMapHoverPopup(popup); return; }
          const features = map.current.queryRenderedFeatures(e.point, { layers: visible });
          if (!features.length) { hideMapHoverPopup(popup); return; }
          const f = features[0];
          const def = activeLayers.find((d) => {
            const ids = thematicLayerIds(d.key);
            return f.layer?.id === ids.fillId || f.layer?.id === ids.lineId || f.layer?.id === ids.circleId;
          });
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

      if (!parcelHandlersBoundRef.current && map.current.getLayer("parcelles-fill")) {
        const onParcelMove = (e: maplibregl.MapMouseEvent) => {
          if (!map.current) return;
          const props = pickParcelAtPoint(map.current, e.point);
          if (!props) {
            parcellePopupRef.current?.remove();
            map.current.getCanvas().style.cursor = "";
            return;
          }
          const idu = props.idu ? String(props.idu) : "—";
          const scoreRatio =
            typeof (props as Record<string, unknown>).score_ratio === "number"
              ? Number((props as Record<string, unknown>).score_ratio)
              : Number(props.score_norm ?? 0);
          if (!parcellePopupRef.current) {
            parcellePopupRef.current = createMapHoverPopup("560px");
          }
          showMapHoverPopup(
            parcellePopupRef.current,
            map.current,
            buildParcelHoverHtml(idu, poolMetricsRef.current?.[idu] ?? null, scoreRatio),
          );
          map.current.getCanvas().style.cursor = "pointer";
        };

        const onParcelLeave = () => {
          parcellePopupRef.current?.remove();
          map.current?.getCanvas().style.removeProperty("cursor");
        };

        const onParcelClick = (e: maplibregl.MapMouseEvent) => {
          if (!map.current) return;
          const props = pickParcelAtPoint(map.current, e.point);
          if (props?.idu && typeof props.idu === "string") {
            onParcelleClickRef.current?.(props.idu);
          }
        };

        map.current.on("mousemove", onParcelMove);
        map.current.on("mouseleave", onParcelLeave);
        map.current.on("click", onParcelClick);
        parcelHandlersBoundRef.current = true;
      }

      // Fit bounds (une seule fois par jeu de données / projet)
      if (!didInitialFitRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        geojsonWithScoreRatio.features.forEach((f: GeoJSON.Feature) => {
          extendBoundsFromFeature(bounds, f);
        });
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: 50 });
          didInitialFitRef.current = true;
        }
      }
    };

    if (map.current.isStyleLoaded()) apply(); else map.current.once("load", apply);
  }, [geojsonWithScoreRatio, foncierGeojson, scoreColorMode]);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const expr = parcelFillColorExpression(scoreColorMode);
    try {
      map.current.setPaintProperty("parcelles-fill", "fill-color", expr);
      map.current.setPaintProperty("parcelles-outline", "line-color", expr);
    } catch {
      // layers pas encore montées
    }
  }, [scoreColorMode, geojsonWithScoreRatio]);

  // ── Surbrillance (hover tableau prioritaire, sinon sélection — sans bouger la caméra) ─
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const filter = focusFilterForIdu(hoverIdu ?? focusIdu);
    try {
      ensureHighlightOutlineLayer(map.current);
      if (map.current.getLayer("parcelles-highlight-fill")) {
        map.current.setFilter("parcelles-highlight-fill", filter);
      }
      if (map.current.getLayer("parcelles-highlight-outline")) {
        map.current.setFilter("parcelles-highlight-outline", filter);
      }
    } catch {
      /* layers pas encore montées */
    }
  }, [focusIdu, hoverIdu, geojsonWithScoreRatio]);

  useEffect(() => {
    if (!map.current || !focusIdu || !geojsonWithScoreRatio?.features?.length) return;
    const feature = geojsonWithScoreRatio.features.find(
      (f) => String(f.properties?.idu ?? "") === focusIdu,
    );
    if (!feature) return;
    const bounds = new maplibregl.LngLatBounds();
    extendBoundsFromFeature(bounds, feature);
    if (bounds.isEmpty()) return;
    map.current.fitBounds(bounds, { padding: 72, maxZoom: 17, duration: 650 });
  }, [focusIdu, geojsonWithScoreRatio]);

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

  // ── Visibilité parcelles (toggle légende) ────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const vis = parcellesVisible ? "visible" : "none";
    try {
      map.current.setLayoutProperty("parcelles-fill", "visibility", vis);
      map.current.setLayoutProperty("parcelles-outline", "visibility", vis);
      if (map.current.getLayer("parcelles-highlight-fill")) {
        map.current.setLayoutProperty("parcelles-highlight-fill", "visibility", vis);
      }
      if (map.current.getLayer("parcelles-highlight-outline")) {
        map.current.setLayoutProperty("parcelles-highlight-outline", "visibility", vis);
      }
    } catch {
      /* layers pas encore montées */
    }
  }, [parcellesVisible, geojson]);

  // ── Sync couches thématiques ──────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    for (const def of activeLayers) {
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
        fetchResultsLayerGeojson(projectId, key, poolRunId)
          .then((data) => setThematicState((s) => ({ ...s, [key]: { ...s[key], loadState: "loaded", geojson: data, error: null } })))
          .catch((err) => {
            fetchedRef.current.delete(key);
            setThematicState((s) => ({ ...s, [key]: { ...s[key], loadState: "error", error: err instanceof Error ? err.message : "Erreur" } }));
          });
        return { ...prev, [key]: { ...cur, visible: true, loadState: "loading" } };
      }
      return { ...prev, [key]: { ...cur, visible: nextVisible } };
    });
  }, [projectId, poolRunId]);

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
        <div
          style={{
            width: 1,
            background: "#334155",
            margin: "0 2px",
          }}
        />
        <button
          type="button"
          onClick={() => setScoreColorMode("ecologique")}
          style={{
            border: "1px solid #475569",
            background: scoreColorMode === "ecologique" ? "#1d4ed8" : "#1f2937",
            color: "#e2e8f0",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
          title="Coloration des parcelles par score écologique (ratio score/max)"
        >
          Score éco
        </button>
        <button
          type="button"
          onClick={() => setScoreColorMode("foncier")}
          style={{
            border: "1px solid #475569",
            background: scoreColorMode === "foncier" ? "#1d4ed8" : "#1f2937",
            color: "#e2e8f0",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
          title="Coloration des parcelles par score de dureté foncière"
        >
          Score foncier
        </button>
        {scoreColorMode === "foncier" && (
          <span
            title="Parcelles avec un score foncier disponible"
            style={{
              marginLeft: 4,
              padding: "4px 6px",
              borderRadius: 4,
              border: "1px solid #475569",
              background: "rgba(15, 23, 42, 0.55)",
              color: "#cbd5e1",
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            Foncier dispo: {foncierCoverage.withFoncier}/{foncierCoverage.total}
          </span>
        )}
      </div>
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
        layers={activeLayers}
        layersState={thematicState}
        onToggle={toggleLayer}
        primaryLayer={{
          label: "Parcelles",
          visible: parcellesVisible,
          onToggle: () => setParcellesVisible((v) => !v),
          footnote:
            indesirableCount > 0 ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: "#dc2626",
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                />
                Indésirable ({indesirableCount}) — exclu du classement
              </span>
            ) : undefined,
        }}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
      />
    </div>
  );
}