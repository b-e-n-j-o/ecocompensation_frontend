/**
 * SousEnsemblesMap.tsx
 * ─────────────────────
 * Carte MapLibre satellite affichant :
 *   1. Le foncier source (emprise projet)
 *   2. L'emprise de chaque UF = ses parcelles retenues (couleur = meilleur score de l'UF) ;
 *      pour l'UF active, parcelles colorées par présence dans les combinaisons (noyau foncé)
 *   2bis. Les sous-ensembles (combinaisons) : masqués par défaut, sauf la combinaison survolée /
 *      sélectionnée dans l'onglet « Combinaisons » ; bouton « Toutes les combinaisons » pour tout afficher
 *   3. Les couches thématiques de résultats (lazy, même registry que ParcellesMap)
 * Liaison table ↔ carte via focusSubsetId / onSubsetClick (même modèle que ParcellesMap).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import type * as GeoJSON from "geojson";
import { fetchResultsLayerGeojson, fetchPmParcellesSourceGeojson } from "../../../../api";
import {
  RESULTS_LAYERS,
  buildInitialThematic,
  DISCRIMINANT_PALETTE,
  buildDiscriminantColorExpression,
  extractDistinctValues,
  getResultsLayerDefs,
  thematicLayerIds,
  type ResultsThematicPreload,
  type ThematicLayerState,
} from "./cartoCouchesRegistry";
import {
  PM_PARCELLES_COLOR,
  PM_PARCELLES_FILL,
  PM_PARCELLES_LABEL,
  PM_PARCELLES_LINE,
  PM_PARCELLES_NAME_FIELD,
  PM_PARCELLES_SOURCE,
} from "./MapPersonnesMorales/pmParcellesSourceLayer";
import { BaseMapToggle } from "./BaseMapToggle";
import { LegendeMapResultats } from "./LegendeMapResultats";
import { RESULTS_BASEMAP_STYLE, applyBaseMapMode, type BaseMapMode } from "./resultsBasemap";
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

const BASE_STYLE = RESULTS_BASEMAP_STYLE;

function emptyFC(): FeatureCollection { return { type: "FeatureCollection", features: [] }; }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
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

function highlightFilterForUf(opts: {
  hoverSubsetId?: string | null;
  hoverUfId?: string | null;
  focusSubsetId?: string | null;
  focusUfId?: string | null;
}): maplibregl.FilterSpecification {
  if (opts.hoverSubsetId) return ["==", ["get", "subset_id"], opts.hoverSubsetId];
  if (opts.hoverUfId) return ["==", ["get", "uf_id"], opts.hoverUfId];
  if (opts.focusSubsetId) return ["==", ["get", "subset_id"], opts.focusSubsetId];
  if (opts.focusUfId) return ["==", ["get", "uf_id"], opts.focusUfId];
  return ["==", ["get", "subset_id"], "___none___"];
}

function ensureHighlightOutlineLayer(m: maplibregl.Map) {
  if (!m.getLayer("uf-subsets-highlight-fill")) {
    m.addLayer({
      id: "uf-subsets-highlight-fill",
      type: "fill",
      source: "uf-subsets",
      filter: focusFilterForSubsetId(null),
      paint: {
        "fill-color": "#fbbf24",
        "fill-opacity": 0.38,
      },
    });
  }
  if (m.getLayer("uf-subsets-highlight-outline")) return;
  m.addLayer({
    id: "uf-subsets-highlight-outline",
    type: "line",
    source: "uf-subsets",
    filter: focusFilterForSubsetId(null),
    paint: {
      "line-color": "#fde68a",
      "line-width": 3.5,
      "line-opacity": 1,
    },
  });
}

const SUBSET_HIT_LAYERS = ["uf-subsets-fill"];

const PARC = {
  src: "uf-parcelles",
  fill: "uf-parcelles-fill",
  line: "uf-parcelles-line",
  focus: "uf-parcelles-focus-fill",
  hover: "uf-parcelles-hover",
} as const;

/** Présence dans les combinaisons : occasionnelle < 50 % ≤ fréquente < 100 % = noyau. */
const PRESENCE_COLORS = { occasionnelle: "#bfdbfe", frequente: "#60a5fa", noyau: "#1e3a8a" };

function presenceColorExpression(): maplibregl.ExpressionSpecification {
  return [
    "step", ["coalesce", ["get", "presence"], 0],
    PRESENCE_COLORS.occasionnelle,
    0.5, PRESENCE_COLORS.frequente,
    0.999, PRESENCE_COLORS.noyau,
  ] as maplibregl.ExpressionSpecification;
}

function parcellesFillOpacityExpr(activeUfId: string | null): maplibregl.ExpressionSpecification {
  if (activeUfId) {
    return ["case", ["==", ["get", "uf_id"], activeUfId], 0, 0.15] as maplibregl.ExpressionSpecification;
  }
  return 0.4 as unknown as maplibregl.ExpressionSpecification;
}

function ufFilter(ufId: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "uf_id"], ufId ?? "___none___"];
}

/** Sous-ensembles masqués : seule la combinaison survolée / sélectionnée reste visible. */
function subsetLayerFilter(showAll: boolean, subsetId: string | null): maplibregl.FilterSpecification | null {
  if (showAll) return null;
  return ["==", ["get", "subset_id"], subsetId ?? "___none___"];
}

function parcellePopupHtml(p: Record<string, unknown>): string {
  const row = (k: string, v: string) =>
    `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap;text-align:left">${k}</th><td>${v}</td></tr>`;
  const surface = toFiniteNumber(p.surface_ha);
  const nb = toFiniteNumber(p.nb_combinaisons);
  const tot = toFiniteNumber(p.nb_combinaisons_uf);
  return (
    `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Parcelle de l'UF #${p.uf_rang ?? "?"}</div>` +
    `<table style="font-size:12px;border-collapse:collapse">` +
    row("IDU", `<span class="mono">${p.idu ?? "—"}</span>`) +
    row("Surface", surface != null ? `${surface.toFixed(2)} ha` : "—") +
    row("Présence", nb != null && tot != null ? `${nb}/${tot} combinaisons${p.noyau === true ? " · noyau" : ""}` : "—") +
    row("Pool parcelles", p.in_pool === true ? "oui" : "non") +
    `</table>`
  );
}

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
  /** Survol tableau — surbrillance instantanée, sans déplacer la caméra. */
  hoverSubsetId?: string | null;
  hoverUfId?: string | null;
  onSubsetClick?: (subsetId: string) => void;
  /** GET /geojson/uf-parcelles : parcelles retenues de chaque UF (vue par défaut). */
  parcellesGeojson?: FeatureCollection<Geometry, Record<string, unknown>> | null;
  /** Clic sur l'emprise d'une UF. */
  onUfClick?: (ufId: string) => void;
  /** Parcelle survolée (tableau ou carte), synchronisée avec UnitesFoncieresTable. */
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
}

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
  hoverSubsetId = null,
  hoverUfId = null,
  onSubsetClick,
  parcellesGeojson = null,
  onUfClick,
  hoverParcelleIdu = null,
  onParcelleHover,
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
  const didParcelsFitRef = useRef(false);
  const parcHandlersBoundRef = useRef(false);
  const onUfClickRef = useRef(onUfClick);
  onUfClickRef.current = onUfClick;
  const onParcHoverRef = useRef(onParcelleHover);
  onParcHoverRef.current = onParcelleHover;

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(() =>
    buildInitialThematic(thematicLayerKeys),
  );
  const [subsetsVisible, setSubsetsVisible] = useState(false);
  const [pmSourceVisible, setPmSourceVisible] = useState(false);
  const [pmColorByName, setPmColorByName] = useState(true);
  const [pmGeojson, setPmGeojson] = useState<FeatureCollection | null>(null);
  const pmPopupRef = useRef<maplibregl.Popup | null>(null);
  const pmHandlersBoundRef = useRef(false);
  const pmCategories = useMemo(() => {
    const names = extractDistinctValues(pmGeojson, PM_PARCELLES_NAME_FIELD);
    return names.map((label, i) => ({
      label,
      color: DISCRIMINANT_PALETTE[i % DISCRIMINANT_PALETTE.length],
      count: pmGeojson?.features.filter(
        (f) => String(f.properties?.[PM_PARCELLES_NAME_FIELD] ?? "") === label,
      ).length ?? 0,
    }));
  }, [pmGeojson]);
  const activeUfId = hoverUfId ?? focusUfId;
  const activeSubsetId = hoverSubsetId ?? focusSubsetId;
  const showAllSubsets = subsetsVisible || !parcellesGeojson?.features?.length;
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");

  // Reset au changement de projet
  useEffect(() => {
    setThematicState(buildInitialThematic(thematicLayerKeys));
    fetchedRef.current = new Set();
    didInitialFitRef.current = false;
    didParcelsFitRef.current = false;
    setSubsetsVisible(false);
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
      parcHandlersBoundRef.current = false;
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
        const subsetFilter = subsetLayerFilter(showAllSubsets, activeSubsetId);
        map.current.addLayer({
          id: "uf-subsets-fill", type: "fill", source: "uf-subsets",
          ...(subsetFilter ? { filter: subsetFilter } : {}),
          paint: {
            "fill-color": colorExpr,
            "fill-opacity": fillOpacityExpr,
          },
        });
        map.current.addLayer({
          id: "uf-subsets-outline", type: "line", source: "uf-subsets",
          ...(subsetFilter ? { filter: subsetFilter } : {}),
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

      if (!didInitialFitRef.current && !parcellesGeojson?.features?.length) {
        const bounds = new maplibregl.LngLatBounds();
        geojsonWithScores.features.forEach((f: GeoJSON.Feature) => extendBoundsFromFeature(bounds, f));
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: 50 });
          didInitialFitRef.current = true;
        }
      }
    };

    if (map.current.isStyleLoaded()) apply(); else map.current.once("load", apply);
  }, [geojsonWithScores, foncierGeojson, focusUfId, showAllSubsets, activeSubsetId, parcellesGeojson]);

  // ── Parcelles personnes morales sources (table du pipeline UF) ──────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !projectId) return;
    let cancelled = false;

    const paintColor = (data: FeatureCollection) =>
      (pmColorByName
        ? buildDiscriminantColorExpression(PM_PARCELLES_NAME_FIELD, data, PM_PARCELLES_COLOR)
        : PM_PARCELLES_COLOR) as string | maplibregl.ExpressionSpecification;

    const applyPaint = (mapNow: maplibregl.Map, data: FeatureCollection) => {
      const color = paintColor(data);
      if (mapNow.getLayer(PM_PARCELLES_FILL)) mapNow.setPaintProperty(PM_PARCELLES_FILL, "fill-color", color);
      if (mapNow.getLayer(PM_PARCELLES_LINE)) mapNow.setPaintProperty(PM_PARCELLES_LINE, "line-color", color);
    };

    const setVisibility = () => {
      const vis = pmSourceVisible ? "visible" : "none";
      if (m.getLayer(PM_PARCELLES_FILL)) m.setLayoutProperty(PM_PARCELLES_FILL, "visibility", vis);
      if (m.getLayer(PM_PARCELLES_LINE)) m.setLayoutProperty(PM_PARCELLES_LINE, "visibility", vis);
    };

    const bindHover = (mapNow: maplibregl.Map) => {
      if (pmHandlersBoundRef.current) return;
      const onMove = (e: maplibregl.MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties;
        const nom = String(props?.[PM_PARCELLES_NAME_FIELD] ?? "").trim() || "Nom inconnu";
        const siren = String(props?.siren ?? "").trim();
        if (!pmPopupRef.current) pmPopupRef.current = createMapHoverPopup("280px");
        showMapHoverPopup(
          pmPopupRef.current,
          mapNow,
          `<div style="font-size:12px;font-weight:650;color:#0f172a">${escapeHtml(nom)}</div>${
            siren ? `<div style="font-size:11px;color:#64748b;margin-top:2px">SIREN ${escapeHtml(siren)}</div>` : ""
          }`,
        );
        mapNow.getCanvas().style.cursor = "pointer";
      };
      const onLeave = () => {
        if (pmPopupRef.current) hideMapHoverPopup(pmPopupRef.current);
        mapNow.getCanvas().style.removeProperty("cursor");
      };
      mapNow.on("mousemove", PM_PARCELLES_FILL, onMove);
      mapNow.on("mouseleave", PM_PARCELLES_FILL, onLeave);
      pmHandlersBoundRef.current = true;
    };

    const mount = () => {
      if (!pmSourceVisible) {
        if (pmPopupRef.current) hideMapHoverPopup(pmPopupRef.current);
        setVisibility();
        return;
      }
      void fetchPmParcellesSourceGeojson(projectId).then((data) => {
        if (cancelled || !map.current) return;
        const mapNow = map.current;
        setPmGeojson(data);
        const existing = mapNow.getSource(PM_PARCELLES_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (existing) existing.setData(data);
        else {
          mapNow.addSource(PM_PARCELLES_SOURCE, { type: "geojson", data });
          const before = mapNow.getLayer("uf-subsets-fill") ? "uf-subsets-fill" : undefined;
          mapNow.addLayer({
            id: PM_PARCELLES_FILL,
            type: "fill",
            source: PM_PARCELLES_SOURCE,
            paint: { "fill-color": PM_PARCELLES_COLOR, "fill-opacity": 0.45 },
          }, before);
          mapNow.addLayer({
            id: PM_PARCELLES_LINE,
            type: "line",
            source: PM_PARCELLES_SOURCE,
            paint: { "line-color": PM_PARCELLES_COLOR, "line-width": 1.1 },
          }, before);
          bindHover(mapNow);
        }
        applyPaint(mapNow, data);
        setVisibility();
      }).catch(() => undefined);
    };

    if (m.isStyleLoaded()) mount();
    else m.once("load", mount);
    return () => { cancelled = true; };
  }, [pmSourceVisible, pmColorByName, projectId]);

  // ── Opacité UF focus / hover (sans recréer les layers) ─────────────────────
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    try {
      map.current.setPaintProperty(
        "uf-subsets-fill",
        "fill-opacity",
        subsetFillOpacityExpr(hoverUfId ?? focusUfId),
      );
    } catch { /* layer pas monté */ }
  }, [focusUfId, hoverUfId]);

  // ── Surbrillance (hover tableau prioritaire, sinon sélection — sans bouger la caméra) ─
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const filter = highlightFilterForUf({
      hoverSubsetId,
      hoverUfId: subsetsVisible ? hoverUfId : null,
      focusSubsetId,
      focusUfId: subsetsVisible ? focusUfId : null,
    });
    try {
      ensureHighlightOutlineLayer(map.current);
      if (map.current.getLayer("uf-subsets-highlight-fill")) {
        map.current.setFilter("uf-subsets-highlight-fill", filter);
      }
      if (map.current.getLayer("uf-subsets-highlight-outline")) {
        map.current.setFilter("uf-subsets-highlight-outline", filter);
      }
    } catch { /* layers pas encore montées */ }
  }, [hoverSubsetId, hoverUfId, focusSubsetId, focusUfId, geojsonWithScores, subsetsVisible]);

  useEffect(() => {
    const m = map.current;
    if (!m?.getLayer("uf-subsets-fill")) return;
    const f = subsetLayerFilter(showAllSubsets, activeSubsetId);
    m.setFilter("uf-subsets-fill", f);
    m.setFilter("uf-subsets-outline", f);
  }, [showAllSubsets, activeSubsetId, geojsonWithScores]);

  useEffect(() => {
    const m = map.current;
    if (!m || !parcellesGeojson) return;
    const apply = () => {
      const src = m.getSource(PARC.src) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(parcellesGeojson as FeatureCollection);
      } else {
        m.addSource(PARC.src, { type: "geojson", data: parcellesGeojson as FeatureCollection });
        const before = m.getLayer("uf-subsets-fill") ? "uf-subsets-fill" : undefined;
        m.addLayer({
          id: PARC.fill, type: "fill", source: PARC.src,
          paint: {
            "fill-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "fill-opacity": parcellesFillOpacityExpr(activeUfId),
          },
        }, before);
        m.addLayer({
          id: PARC.focus, type: "fill", source: PARC.src, filter: ufFilter(activeUfId),
          paint: { "fill-color": presenceColorExpression(), "fill-opacity": 0.7 },
        }, before);
        m.addLayer({
          id: PARC.line, type: "line", source: PARC.src,
          paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.85 },
        }, before);
        m.addLayer({
          id: PARC.hover, type: "line", source: PARC.src,
          filter: ["==", ["get", "idu"], "___none___"],
          paint: { "line-color": "#facc15", "line-width": 3 },
        }, before);
      }

      if (!parcHandlersBoundRef.current && m.getLayer(PARC.fill)) {
        const popup = createMapHoverPopup("320px");
        m.on("mousemove", PARC.focus, (e) => {
          const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          showMapHoverPopup(popup, m, parcellePopupHtml(props));
          m.getCanvas().style.cursor = "pointer";
          onParcHoverRef.current?.(props.idu != null ? String(props.idu) : null);
        });
        m.on("mouseleave", PARC.focus, () => {
          hideMapHoverPopup(popup);
          m.getCanvas().style.removeProperty("cursor");
          onParcHoverRef.current?.(null);
        });
        m.on("mousemove", PARC.fill, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", PARC.fill, () => { m.getCanvas().style.removeProperty("cursor"); });
        m.on("click", PARC.fill, (e) => {
          if (m.getLayer("uf-subsets-fill") && m.queryRenderedFeatures(e.point, { layers: ["uf-subsets-fill"] }).length) return;
          const ufId = e.features?.[0]?.properties?.uf_id;
          if (ufId != null) onUfClickRef.current?.(String(ufId));
        });
        parcHandlersBoundRef.current = true;
      }

      if (!didParcelsFitRef.current && parcellesGeojson.features.length) {
        const bounds = new maplibregl.LngLatBounds();
        parcellesGeojson.features.forEach((f: GeoJSON.Feature) => extendBoundsFromFeature(bounds, f));
        if (!bounds.isEmpty()) {
          m.fitBounds(bounds, { padding: 50 });
          didParcelsFitRef.current = true;
          didInitialFitRef.current = true;
        }
      }
    };
    if (m.isStyleLoaded()) apply(); else m.once("load", apply);
  }, [parcellesGeojson, activeUfId]);

  useEffect(() => {
    const m = map.current;
    if (!m?.getLayer(PARC.fill)) return;
    m.setPaintProperty(PARC.fill, "fill-opacity", parcellesFillOpacityExpr(activeUfId));
    m.setFilter(PARC.focus, ufFilter(activeUfId));
    m.setFilter(PARC.hover, ["==", ["get", "idu"], hoverParcelleIdu ?? "___none___"]);
  }, [activeUfId, hoverParcelleIdu, parcellesGeojson]);

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
      const parcelFeatures = (parcellesGeojson?.features ?? []).filter(
        (f) => String(f.properties?.uf_id ?? "") === focusUfId,
      );
      const features = parcelFeatures.length
        ? parcelFeatures
        : geojsonWithScores.features.filter((f) => String(f.properties?.uf_id ?? "") === focusUfId);
      features.forEach((f) => extendBoundsFromFeature(bounds, f));
      if (bounds.isEmpty()) return;
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 650 });
    }
  }, [focusSubsetId, focusUfId, geojsonWithScores, parcellesGeojson]);

  useEffect(() => {
    applyBaseMapMode(map.current, baseMapMode);
  }, [baseMapMode]);

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

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <BaseMapToggle
        mode={baseMapMode}
        onToggle={() => setBaseMapMode((m) => (m === "satellite" ? "plan" : "satellite"))}
      />
      <button
        type="button"
        onClick={() => setSubsetsVisible((v) => !v)}
        style={{
          position: "absolute",
          top: 10,
          left: 54,
          zIndex: 5,
          height: 36,
          padding: "0 10px",
          border: "1px solid #334155",
          background: subsetsVisible ? "#1e3a8a" : "rgba(15, 23, 42, 0.85)",
          color: "#e2e8f0",
          borderRadius: 8,
          fontSize: 11,
          cursor: "pointer",
        }}
        title={subsetsVisible
          ? "Masquer les combinaisons (seule la combinaison sélectionnée reste affichée)"
          : "Afficher toutes les combinaisons de parcelles calculées"}
      >
        Toutes les combinaisons
      </button>
      {parcellesGeojson && activeUfId && (
        <div
          style={{
            position: "absolute", top: 54, left: 10, zIndex: 5,
            background: "rgba(255,255,255,0.94)", border: "1px solid #cbd5e1", borderRadius: 6,
            padding: "6px 8px", fontSize: 11, color: "#0f172a", display: "grid", gap: 3,
          }}
        >
          <strong style={{ fontSize: 11 }}>Parcelles de l&apos;UF</strong>
          {([
            [PRESENCE_COLORS.noyau, "Noyau (toutes les combinaisons)"],
            [PRESENCE_COLORS.frequente, "Fréquente (≥ 50 %)"],
            [PRESENCE_COLORS.occasionnelle, "Occasionnelle (< 50 %)"],
          ] as const).map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />{l}
            </span>
          ))}
        </div>
      )}
      <div
        ref={mapContainer}
        className="parcelles-map"
        style={{ width: "100%", height: "100%" }}
        title="Unités foncières — parcelles colorées par score, détail de présence sur l'UF active"
      />
      <LegendeMapResultats
        layers={activeLayers}
        layersState={thematicState}
        onToggle={toggleLayer}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
        extraLayers={[{
          label: PM_PARCELLES_LABEL,
          visible: pmSourceVisible,
          onToggle: () => setPmSourceVisible((v) => !v),
          color: PM_PARCELLES_COLOR,
          categories: pmCategories,
          categorized: pmColorByName,
          onToggleCategorize: () => setPmColorByName((v) => !v),
        }]}
      />
    </div>
  );
}
