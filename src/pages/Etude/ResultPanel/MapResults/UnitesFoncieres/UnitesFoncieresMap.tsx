/**
 * UnitesFoncieresMap.tsx — carte des résultats UF v2 (remplace SousEnsemblesMap.tsx).
 *
 *   1. Foncier source (emprise projet)
 *   2. Parcelles de chaque terrain retenu, colorées par le score de leur terrain
 *   3. Terrain actif (clic carte / tableau) : contour, parcelles proches d'une observation
 *      faune du filtre soulignées en orange, occupation du sol CESBIO découpée sur le terrain
 *   4. Couches thématiques de résultats (lazy, même registry que ParcellesMap)
 *   5. Parcelles personnes morales sources (bouton de légende)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  fetchPmParcellesSourceGeojson,
  fetchResultsLayerGeojson,
  fetchUfOccupationSolGeojson,
} from "../../../../../api";
import { type UfFilterResponse } from "../../../../../types";
import { OccupationSolLegend, useOccupationSolLayer } from "../../TableauParcelles/occupationSol";
import {
  buildInitialThematic,
  DISCRIMINANT_PALETTE,
  buildDiscriminantColorExpression,
  extractDistinctValues,
  mapLayerKeysToEnsure,
  companionOf,
  styleForLayerKey,
  thematicLayerIds,
  type ResultsLayerDef,
  type ResultsThematicPreload,
  type ThematicLayerState,
} from "../cartoCouchesRegistry";
import {
  PM_PARCELLES_COLOR,
  PM_PARCELLES_FILL,
  PM_PARCELLES_LABEL,
  PM_PARCELLES_LINE,
  PM_PARCELLES_NAME_FIELD,
  PM_PARCELLES_SOURCE,
} from "./pmParcellesSourceLayer";
import { BaseMapToggle } from "../BaseMapToggle";
import { LegendeMapResultats } from "../LegendeMapResultats";
import { RESULTS_BASEMAP_STYLE, applyBaseMapMode, type BaseMapMode } from "../resultsBasemap";
import { createMapHoverPopup, hideMapHoverPopup, showMapHoverPopup } from "../mapHoverPopup";

type FC = FeatureCollection<Geometry, Record<string, unknown>>;

const PARC = {
  src: "uf-parcelles",
  fill: "uf-parcelles-fill",
  line: "uf-parcelles-line",
  active: "uf-parcelles-active",
  faune: "uf-parcelles-faune",
  hover: "uf-parcelles-hover",
  pick: "uf-parcelles-pick",
  pickFill: "uf-parcelles-pick-fill",
} as const;
const EMP = {
  src: "uf-emprises",
  fill: "uf-emprises-fill",
  line: "uf-emprises-line",
  active: "uf-emprises-active",
} as const;
const PICK_COLOR = "#4f46e5";
const FAUNE_COLOR = "#f97316";
const NONE = "___none___";

function emptyFC(): FC { return { type: "FeatureCollection", features: [] }; }

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function extendBounds(bounds: maplibregl.LngLatBounds, f: Feature) {
  const g = f.geometry;
  if (g?.type === "Polygon") g.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
  else if (g?.type === "MultiPolygon") g.coordinates.forEach((p) => p[0].forEach((c) => bounds.extend(c as [number, number])));
}

function scoreColorExpression(): maplibregl.ExpressionSpecification {
  return ["step", ["coalesce", ["get", "score_ratio"], 0],
    "#6b7280", 0.2, "#f59e0b", 0.5, "#16a34a", 0.8, "#166534"] as maplibregl.ExpressionSpecification;
}

function byUf(ufId: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "uf_id"], ufId ?? NONE];
}

function byUfFaune(ufId: string | null): maplibregl.FilterSpecification {
  return ["all", ["==", ["get", "uf_id"], ufId ?? NONE], ["==", ["get", "porte_faune"], true]];
}

interface UnitesFoncieresMapProps {
  parcellesGeojson: FC | null;
  ufResults?: UfFilterResponse | null;
  foncierGeojson?: unknown;
  projectId?: string | null;
  preloadedThematic?: ResultsThematicPreload | null;
  thematicPreloadLoading?: boolean;
  layerDefs: ResultsLayerDef[];
  focusUfId?: string | null;
  hoverUfId?: string | null;
  onUfClick?: (ufId: string) => void;
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
  pickedIdus?: string[];
  assembleMode?: boolean;
  assembleBusy?: boolean;
  onToggleParcelle?: (idu: string) => void;
  onAssemble?: () => void;
  onClearPick?: () => void;
  onExitAssemble?: () => void;
}

export function UnitesFoncieresMap({
  parcellesGeojson,
  ufResults = null,
  foncierGeojson,
  projectId,
  preloadedThematic,
  thematicPreloadLoading = false,
  layerDefs,
  focusUfId = null,
  hoverUfId = null,
  onUfClick,
  hoverParcelleIdu = null,
  onParcelleHover,
  pickedIdus = [],
  assembleMode = false,
  assembleBusy = false,
  onToggleParcelle,
  onAssemble,
  onClearPick,
  onExitAssemble,
}: UnitesFoncieresMapProps) {
  const activeLayers = layerDefs;
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[UnitesFoncieresMap] activeLayers", activeLayers.map((d) => [d.groupe, d.key]));
    }
  }, [activeLayers]);

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());
  const didFitRef = useRef(false);
  const parcHandlersRef = useRef(false);
  const pmHandlersRef = useRef(false);
  const pmPopupRef = useRef<maplibregl.Popup | null>(null);
  const onUfClickRef = useRef(onUfClick);
  onUfClickRef.current = onUfClick;
  const onParcHoverRef = useRef(onParcelleHover);
  onParcHoverRef.current = onParcelleHover;
  const onToggleParcelleRef = useRef(onToggleParcelle);
  onToggleParcelleRef.current = onToggleParcelle;
  const assembleModeRef = useRef(assembleMode);
  assembleModeRef.current = assembleMode;

  const [thematicState, setThematicState] = useState<Record<string, ThematicLayerState>>(
    () => buildInitialThematic(layerDefs),
  );
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");
  const [solVisible, setSolVisible] = useState(true);
  const [solLegendCollapsed, setSolLegendCollapsed] = useState(false);
  const [ufVisible, setUfVisible] = useState(true);
  const [parcVisible, setParcVisible] = useState(true);
  const [pmSourceVisible, setPmSourceVisible] = useState(false);
  const [pmColorByName, setPmColorByName] = useState(true);
  const [pmGeojson, setPmGeojson] = useState<FeatureCollection | null>(null);

  const activeUfId = hoverUfId ?? focusUfId;

  /** Libellés des critères par UF (popup parcelle). */
  const labelsByUf = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const uf of ufResults?.unites_foncieres ?? []) {
      out[uf.uf_id] = Object.fromEntries(Object.entries(uf.criteres ?? {}).map(([k, d]) => [k, d.label]));
    }
    return out;
  }, [ufResults]);
  const labelsRef = useRef(labelsByUf);
  labelsRef.current = labelsByUf;

  /** Propriétés aplaties pour MapLibre (pas de tableau dans les expressions). */
  const parcelles = useMemo<FC | null>(() => {
    if (!parcellesGeojson) return null;
    return {
      ...parcellesGeojson,
      features: parcellesGeojson.features.map((f) => {
        const p = f.properties ?? {};
        const portes = Array.isArray(p.criteres_portes) ? (p.criteres_portes as string[]) : [];
        return {
          ...f,
          properties: {
            ...p,
            criteres_portes: portes.join("|"),
            porte_faune: portes.some((k) => k.startsWith("faune_")),
          },
        };
      }),
    };
  }, [parcellesGeojson]);

  const emprises = useMemo<FC | null>(() => {
    const raw = (parcellesGeojson as (FC & { emprises?: FC }) | null)?.emprises;
    if (!raw?.features) return null;
    return raw;
  }, [parcellesGeojson]);

  const pmCategories = useMemo(() => {
    const names = extractDistinctValues(pmGeojson, PM_PARCELLES_NAME_FIELD);
    return names.map((label, i) => ({
      label,
      color: DISCRIMINANT_PALETTE[i % DISCRIMINANT_PALETTE.length],
      count: pmGeojson?.features.filter((f) => String(f.properties?.[PM_PARCELLES_NAME_FIELD] ?? "") === label).length ?? 0,
    }));
  }, [pmGeojson]);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({ container: container.current, style: RESULTS_BASEMAP_STYLE, center: [0, 47], zoom: 8 });
    map.current = m;
    m.once("load", () => setStyleReady(true));
    return () => {
      m.remove();
      map.current = null;
      parcHandlersRef.current = false;
      pmHandlersRef.current = false;
      setStyleReady(false);
    };
  }, []);

  // Reset au changement de projet
  useEffect(() => {
    setThematicState(buildInitialThematic(layerDefs));
    fetchedRef.current = new Set();
    didFitRef.current = false;
  }, [projectId, layerDefs]);

  // ── Couches thématiques préchargées ─────────────────────────────────────────
  useEffect(() => {
    if (preloadedThematic === undefined) return;
    if (preloadedThematic === null) {
      setThematicState(buildInitialThematic(layerDefs));
      fetchedRef.current = new Set();
      return;
    }
    setThematicState((prev) => {
      const next = { ...prev };
      for (const key of mapLayerKeysToEnsure(activeLayers)) {
        const p = preloadedThematic[key];
        if (!p) continue;
        const cur = prev[key];
        next[key] = p.error
          ? { visible: cur?.visible ?? false, loadState: "error", geojson: null, error: p.error }
          : p.geojson ? { visible: cur?.visible ?? false, loadState: "loaded", geojson: p.geojson, error: null, truncated: Boolean((p.geojson as { truncated?: boolean }).truncated) } : (cur ?? { visible: false, loadState: "idle", geojson: null, error: null });
        fetchedRef.current.add(key);
      }
      return next;
    });
  }, [preloadedThematic, activeLayers, layerDefs]);

  // ── Foncier source ──────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !foncierGeojson) return;
    const src = m.getSource("foncier") as maplibregl.GeoJSONSource | undefined;
    if (src) { src.setData(foncierGeojson as FeatureCollection); return; }
    m.addSource("foncier", { type: "geojson", data: foncierGeojson as FeatureCollection });
    m.addLayer({ id: "foncier-fill", type: "fill", source: "foncier", paint: { "fill-color": "#ff4fa3", "fill-opacity": 0.25 } });
    m.addLayer({ id: "foncier-outline", type: "line", source: "foncier", paint: { "line-color": "#ff4fa3", "line-width": 3 } });
  }, [styleReady, foncierGeojson]);

  // ── Sources thématiques (vides, sous les parcelles) + popup ─────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;
    for (const key of mapLayerKeysToEnsure(activeLayers)) {
      const def = styleForLayerKey(activeLayers, key);
      const { sourceId, fillId, lineId, circleId } = thematicLayerIds(key);
      if (m.getSource(sourceId)) continue;
      m.addSource(sourceId, { type: "geojson", data: emptyFC() });
      const before = m.getLayer(PARC.fill) ? PARC.fill : undefined;
      m.addLayer({ id: fillId, type: "fill", source: sourceId, paint: { "fill-color": def.fillColor, "fill-opacity": def.fillOpacity }, layout: { visibility: "none" } }, before);
      m.addLayer({ id: lineId, type: "line", source: sourceId, paint: { "line-color": def.lineColor, "line-width": def.lineWidth }, layout: { visibility: "none" } }, before);
      m.addLayer({
        id: circleId, type: "circle", source: sourceId,
        filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]] as maplibregl.ExpressionSpecification,
        paint: { "circle-color": def.fillColor, "circle-stroke-color": def.lineColor, "circle-stroke-width": 1, "circle-radius": 4, "circle-opacity": 0.9 },
        layout: { visibility: "none" },
      }, before);
    }
    const popup = createMapHoverPopup("260px");
    const fillIds = mapLayerKeysToEnsure(activeLayers).flatMap((k) => {
      const ids = thematicLayerIds(k);
      return [ids.fillId, ids.circleId];
    });
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const visible = fillIds.filter((id) => {
        try { return m.getLayoutProperty(id, "visibility") === "visible"; } catch { return false; }
      });
      if (!visible.length) { hideMapHoverPopup(popup); return; }
      const f = m.queryRenderedFeatures(e.point, { layers: visible })[0];
      const def = f && activeLayers.find((d) => {
        const keys = [d.key, ...(d.companionKey ? [d.companionKey] : [])];
        return keys.some((k) => {
          const ids = thematicLayerIds(k);
          return f.layer?.id === ids.fillId || f.layer?.id === ids.circleId;
        });
      });
      if (!def) { hideMapHoverPopup(popup); return; }
      const rows = def.popupFields
        .filter(({ field }) => f.properties?.[field] != null)
        .map(({ field, label }) => `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap">${label}</th><td>${f.properties![field]}</td></tr>`)
        .join("");
      showMapHoverPopup(popup, m, `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">${def.label}</div><table style="font-size:12px;border-collapse:collapse">${rows}</table>`);
    };
    m.on("mousemove", onMove);
    return () => { m.off("mousemove", onMove); popup.remove(); };
  }, [styleReady, activeLayers]);

  // ── Emprise fusionnée de chaque unité foncière ──────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !emprises) return;
    const src = m.getSource(EMP.src) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(emprises);
    else {
      m.addSource(EMP.src, { type: "geojson", data: emprises });
      const before = m.getLayer(PARC.fill) ? PARC.fill : undefined;
      m.addLayer({ id: EMP.fill, type: "fill", source: EMP.src,
        paint: { "fill-color": scoreColorExpression(), "fill-opacity": 0.5 } }, before);
      m.addLayer({ id: EMP.line, type: "line", source: EMP.src,
        paint: { "line-color": "#0f172a", "line-width": 1.6, "line-opacity": 0.9 } }, before);
      m.addLayer({ id: EMP.active, type: "line", source: EMP.src, filter: byUf(null),
        paint: { "line-color": "#fde68a", "line-width": 3 } }, before);
      m.on("click", EMP.fill, (e) => {
        const ufId = e.features?.[0]?.properties?.uf_id;
        if (ufId != null) onUfClickRef.current?.(String(ufId));
      });
      m.on("mousemove", EMP.fill, () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", EMP.fill, () => { m.getCanvas().style.removeProperty("cursor"); });
    }
  }, [styleReady, emprises]);

  // ── Parcelles des terrains ──────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !parcelles) return;
    const src = m.getSource(PARC.src) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(parcelles);
    } else {
      m.addSource(PARC.src, { type: "geojson", data: parcelles });
      m.addLayer({ id: PARC.fill, type: "fill", source: PARC.src,
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.01 } });
      m.addLayer({ id: PARC.line, type: "line", source: PARC.src,
        paint: { "line-color": "#f8fafc", "line-width": 1.1, "line-opacity": 0.95 } });
      m.addLayer({ id: PARC.faune, type: "line", source: PARC.src,
        filter: byUfFaune(null),
        paint: { "line-color": FAUNE_COLOR, "line-width": 3 } });
      m.addLayer({ id: PARC.active, type: "line", source: PARC.src, filter: byUf(null),
        paint: { "line-color": "#fde68a", "line-width": 1.6 } });
      m.addLayer({ id: PARC.pickFill, type: "fill", source: PARC.src,
        filter: ["in", ["get", "idu"], ["literal", [NONE]]],
        paint: { "fill-color": PICK_COLOR, "fill-opacity": 0.45 } });
      m.addLayer({ id: PARC.pick, type: "line", source: PARC.src,
        filter: ["in", ["get", "idu"], ["literal", [NONE]]],
        paint: { "line-color": PICK_COLOR, "line-width": 2.5 } });
      m.addLayer({ id: PARC.hover, type: "line", source: PARC.src,
        filter: ["==", ["get", "idu"], NONE], paint: { "line-color": "#facc15", "line-width": 3.5 } });
    }

    if (!parcHandlersRef.current) {
      const popup = createMapHoverPopup("320px");
      m.on("mousemove", PARC.fill, (e) => {
        const p = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
        const ufId = String(p.uf_id ?? "");
        const labels = labelsRef.current[ufId] ?? {};
        const portes = String(p.criteres_portes ?? "").split("|").filter(Boolean).map((k) => escapeHtml(labels[k] ?? k));
        const surface = Number(p.surface_ha);
        const row = (k: string, v: string) =>
          `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap;text-align:left">${k}</th><td>${v}</td></tr>`;
        showMapHoverPopup(popup, m,
          `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Parcelle de l'UF #${p.uf_rang ?? "?"}</div>` +
          `<table style="font-size:12px;border-collapse:collapse">` +
          row("IDU", `<span class="mono">${escapeHtml(String(p.idu ?? "—"))}</span>`) +
          row("Surface", Number.isFinite(surface) ? `${surface.toFixed(2)} ha` : "—") +
          row("Apporte", portes.length ? portes.join("<br/>") : "—") +
          row("Pool parcelles", p.in_pool === true ? "oui" : "non") +
          `</table>`);
        m.getCanvas().style.cursor = "pointer";
        onParcHoverRef.current?.(p.idu != null ? String(p.idu) : null);
      });
      m.on("mouseleave", PARC.fill, () => {
        hideMapHoverPopup(popup);
        m.getCanvas().style.removeProperty("cursor");
        onParcHoverRef.current?.(null);
      });
      m.on("click", PARC.fill, (e) => {
        const props = e.features?.[0]?.properties;
        const idu = props?.idu;
        const ufId = props?.uf_id;
        if (assembleModeRef.current && idu != null) onToggleParcelleRef.current?.(String(idu));
        if (ufId != null) onUfClickRef.current?.(String(ufId));
      });
      parcHandlersRef.current = true;
    }

    if (!didFitRef.current && parcelles.features.length) {
      const b = new maplibregl.LngLatBounds();
      parcelles.features.forEach((f) => extendBounds(b, f));
      if (!b.isEmpty()) { m.fitBounds(b, { padding: 50 }); didFitRef.current = true; }
    }
  }, [styleReady, parcelles]);

  const { data: solData, loading: solLoading, legend: solLegend } = useOccupationSolLayer(map, styleReady, {
    key: solVisible && ufVisible && focusUfId ? focusUfId : null,
    fetcher: (ufId) => fetchUfOccupationSolGeojson(projectId ?? "", ufId),
    visible: solVisible && ufVisible && !!focusUfId,
    beforeLayerId: PARC.line,
  });

  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;
    const visUf = ufVisible ? "visible" : "none";
    const visParc = parcVisible ? "visible" : "none";
    for (const id of [EMP.fill, EMP.line, EMP.active]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visUf);
    }
    for (const id of [PARC.fill, PARC.line, PARC.faune, PARC.active, PARC.hover, PARC.pick, PARC.pickFill]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visParc);
    }
  }, [styleReady, ufVisible, parcVisible, parcelles, emprises]);

  // ── Terrain actif : opacité, contours, survol parcelle ──────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !m.getLayer(PARC.fill)) return;
    if (m.getLayer(EMP.fill)) {
      m.setPaintProperty(EMP.fill, "fill-opacity", activeUfId
        ? ["case", ["==", ["get", "uf_id"], activeUfId], 0.62, 0.28]
        : 0.5);
    }
    if (m.getLayer(EMP.active)) m.setFilter(EMP.active, byUf(activeUfId));
    m.setFilter(PARC.active, byUf(activeUfId));
    m.setFilter(PARC.faune, byUfFaune(activeUfId));
    m.setFilter(PARC.hover, ["==", ["get", "idu"], hoverParcelleIdu ?? NONE]);
    const picked = assembleMode && pickedIdus.length ? pickedIdus : [NONE];
    const pickFilter = ["in", ["get", "idu"], ["literal", picked]] as maplibregl.FilterSpecification;
    if (m.getLayer(PARC.pick)) m.setFilter(PARC.pick, pickFilter);
    if (m.getLayer(PARC.pickFill)) m.setFilter(PARC.pickFill, pickFilter);
  }, [styleReady, activeUfId, hoverParcelleIdu, parcelles, solVisible, solData, pickedIdus, assembleMode]);

  // ── Cadrage sur le terrain sélectionné ──────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !focusUfId || !parcelles) return;
    const b = new maplibregl.LngLatBounds();
    parcelles.features.filter((f) => String(f.properties?.uf_id ?? "") === focusUfId).forEach((f) => extendBounds(b, f));
    if (!b.isEmpty()) m.fitBounds(b, { padding: 60, maxZoom: 16, duration: 650 });
  }, [styleReady, focusUfId, parcelles]);

  // ── Parcelles personnes morales sources ─────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady || !projectId) return;
    let cancelled = false;
    const vis = pmSourceVisible ? "visible" : "none";
    const setVis = () => {
      if (m.getLayer(PM_PARCELLES_FILL)) m.setLayoutProperty(PM_PARCELLES_FILL, "visibility", vis);
      if (m.getLayer(PM_PARCELLES_LINE)) m.setLayoutProperty(PM_PARCELLES_LINE, "visibility", vis);
    };
    if (!pmSourceVisible) { if (pmPopupRef.current) hideMapHoverPopup(pmPopupRef.current); setVis(); return; }
    void fetchPmParcellesSourceGeojson(projectId).then((data) => {
      if (cancelled || !map.current) return;
      setPmGeojson(data);
      const color = (pmColorByName
        ? buildDiscriminantColorExpression(PM_PARCELLES_NAME_FIELD, data, PM_PARCELLES_COLOR)
        : PM_PARCELLES_COLOR) as string | maplibregl.ExpressionSpecification;
      const existing = m.getSource(PM_PARCELLES_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(data);
      else {
        m.addSource(PM_PARCELLES_SOURCE, { type: "geojson", data });
        const before = m.getLayer(PARC.fill) ? PARC.fill : undefined;
        m.addLayer({ id: PM_PARCELLES_FILL, type: "fill", source: PM_PARCELLES_SOURCE, paint: { "fill-color": PM_PARCELLES_COLOR, "fill-opacity": 0.45 } }, before);
        m.addLayer({ id: PM_PARCELLES_LINE, type: "line", source: PM_PARCELLES_SOURCE, paint: { "line-color": PM_PARCELLES_COLOR, "line-width": 1.1 } }, before);
      }
      m.setPaintProperty(PM_PARCELLES_FILL, "fill-color", color);
      m.setPaintProperty(PM_PARCELLES_LINE, "line-color", color);
      if (!pmHandlersRef.current) {
        m.on("mousemove", PM_PARCELLES_FILL, (e) => {
          const p = e.features?.[0]?.properties;
          const nom = String(p?.[PM_PARCELLES_NAME_FIELD] ?? "").trim() || "Nom inconnu";
          const siren = String(p?.siren ?? "").trim();
          if (!pmPopupRef.current) pmPopupRef.current = createMapHoverPopup("280px");
          showMapHoverPopup(pmPopupRef.current, m,
            `<div style="font-size:12px;font-weight:650;color:#0f172a">${escapeHtml(nom)}</div>${siren ? `<div style="font-size:11px;color:#64748b;margin-top:2px">SIREN ${escapeHtml(siren)}</div>` : ""}`);
        });
        m.on("mouseleave", PM_PARCELLES_FILL, () => { if (pmPopupRef.current) hideMapHoverPopup(pmPopupRef.current); });
        pmHandlersRef.current = true;
      }
      setVis();
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [styleReady, pmSourceVisible, pmColorByName, projectId]);

  useEffect(() => { applyBaseMapMode(map.current, baseMapMode); }, [baseMapMode]);

  // ── Sync couches thématiques ────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;
    for (const key of mapLayerKeysToEnsure(activeLayers)) {
      const def = styleForLayerKey(activeLayers, key);
      const st = thematicState[key];
      if (!st) continue;
      const { sourceId, fillId, lineId, circleId } = thematicLayerIds(key);
      const src = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (!src) continue;
      if (st.geojson) {
        src.setData(st.geojson as FeatureCollection);
        if (def.discriminantField && st.loadState === "loaded") {
          try {
            m.setPaintProperty(fillId, "fill-color",
              buildDiscriminantColorExpression(def.discriminantField, st.geojson, def.fillColor) as maplibregl.ExpressionSpecification);
            const sel = st.selectedValues;
            const filter = (sel && sel.length
              ? ["in", ["to-string", ["get", def.discriminantField]], ["literal", sel]]
              : ["all"]) as maplibregl.ExpressionSpecification;
            m.setFilter(fillId, filter);
            m.setFilter(lineId, filter);
          } catch { /* layer pas monté */ }
        }
      }
      const owner = activeLayers.find((d) => d.key === key || d.companionKey === key);
      const ownerSt = owner ? thematicState[owner.key] : st;
      const vis = (ownerSt?.visible ?? st.visible) && st.loadState === "loaded" ? "visible" : "none";
      try {
        m.setLayoutProperty(fillId, "visibility", vis);
        m.setLayoutProperty(lineId, "visibility", vis);
        if (m.getLayer(circleId)) m.setLayoutProperty(circleId, "visibility", vis);
      } catch { /* layer pas monté */ }
    }
  }, [styleReady, thematicState, activeLayers]);

  const toggleLayer = useCallback((key: string) => {
    const companion = companionOf(activeLayers, key);
    setThematicState((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      const nextVisible = !cur.visible;
      const next = { ...prev, [key]: { ...cur, visible: nextVisible, loadState: nextVisible && cur.loadState === "idle" ? "loading" as const : cur.loadState } };
      if (companion && prev[companion]) {
        const c = prev[companion];
        next[companion] = { ...c, visible: nextVisible, loadState: nextVisible && c.loadState === "idle" ? "loading" as const : c.loadState };
      }
      if (nextVisible && projectId) {
        const toFetch = [key, ...(companion ? [companion] : [])].filter((k) => prev[k]?.loadState === "idle" && !fetchedRef.current.has(k));
        for (const k of toFetch) fetchedRef.current.add(k);
        for (const k of toFetch) {
          fetchResultsLayerGeojson(projectId, k)
            .then((data) => setThematicState((s) => ({ ...s, [k]: { ...s[k], loadState: "loaded", geojson: data, error: null, truncated: Boolean((data as { truncated?: boolean }).truncated) } })))
            .catch((err) => {
              fetchedRef.current.delete(k);
              setThematicState((s) => ({ ...s, [k]: { ...s[k], loadState: "error", error: err instanceof Error ? err.message : "Erreur" } }));
            });
        }
      }
      return next;
    });
  }, [projectId, activeLayers]);

  const toggleDiscriminantValue = useCallback((layerKey: string, value: string) => {
    setThematicState((prev) => {
      const cur = prev[layerKey];
      const def = activeLayers.find((d) => d.key === layerKey);
      if (!cur?.geojson || !def?.discriminantField) return prev;
      const all = extractDistinctValues(cur.geojson, def.discriminantField);
      const current = cur.selectedValues ?? all;
      const v = String(value);
      const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
      return { ...prev, [layerKey]: { ...cur, selectedValues: all.filter((x) => next.includes(x)) } };
    });
  }, [activeLayers]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <BaseMapToggle mode={baseMapMode} onToggle={() => setBaseMapMode((m) => (m === "satellite" ? "plan" : "satellite"))} />
      <button
        type="button"
        className="sol-toggle-btn"
        onClick={() => setSolVisible((v) => !v)}
        style={{
          position: "absolute", top: 10, left: 54, zIndex: 5, height: 36, padding: "0 10px",
          border: "1px solid #334155",
          color: "#e2e8f0", borderRadius: 8, fontSize: 11,
        }}
        data-on={solVisible ? "1" : "0"}
        title="Occupation du sol (CESBIO) découpée sur l'unité foncière sélectionnée"
      >
        Occupation du sol de l&apos;UF{solLoading ? " …" : ""}
      </button>

      {focusUfId && (solLegendCollapsed ? (
        <button
          type="button"
          className="map-legende map-legende--collapsed uf-focus-legend uf-focus-legend--collapsed"
          onClick={() => setSolLegendCollapsed(false)}
          title="Ouvrir la légende d'occupation du sol"
        >
          Occupation du sol
        </button>
      ) : (
        <div className="uf-focus-legend">
          <div className="uf-focus-legend__head">
            <strong>Unité foncière sélectionnée</strong>
            <button
              type="button"
              className="map-legende__collapse"
              onClick={() => setSolLegendCollapsed(true)}
              title="Réduire la légende"
            >
              −
            </button>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 0, borderTop: `3px solid ${FAUNE_COLOR}` }} />
            Parcelle proche d&apos;une observation faune du filtre
          </span>
          {solVisible && <OccupationSolLegend legend={solLegend} />}
        </div>
      ))}

      {assembleMode && (
        <div className="uf-assemble-bar uf-map-assemble">
          <strong>
            {pickedIdus.length > 0
              ? `${pickedIdus.length} parcelle${pickedIdus.length > 1 ? "s" : ""} sélectionnée${pickedIdus.length > 1 ? "s" : ""}`
              : "Mode assemblage"}
          </strong>
          <span>Cliquez un polygone pour l&apos;ajouter ou le retirer.</span>
          <button type="button" className={`uf-assemble-confirm-btn${assembleBusy ? " is-busy" : ""}`} disabled={assembleBusy || pickedIdus.length < 2} onClick={onAssemble}>
            {assembleBusy && <span className="uf-assemble-confirm-spinner" aria-hidden />}
            {assembleBusy ? "Croisement avec les couches" : "Assembler les parcelles en une nouvelle unité foncière"}
          </button>
          <button type="button" className="cz-btn cz-btn--ghost" disabled={assembleBusy} onClick={onClearPick}>
            Vider
          </button>
          <button type="button" className="cz-btn cz-btn--ghost" disabled={assembleBusy} onClick={onExitAssemble}>
            Quitter
          </button>
        </div>
      )}

      <div ref={container} className="parcelles-map" style={{ width: "100%", height: "100%" }}
        title="Unités foncières — cliquer une parcelle pour la sélectionner, puis assembler" />
      <LegendeMapResultats
        layers={activeLayers}
        layersState={thematicState}
        onToggle={toggleLayer}
        bulkLoading={thematicPreloadLoading}
        onToggleValue={toggleDiscriminantValue}
        primaryLayer={{
          label: "Unités foncières",
          visible: ufVisible,
          onToggle: () => setUfVisible((v) => !v),
        }}
        extraLayers={[{
          label: "Parcelles",
          visible: parcVisible,
          onToggle: () => setParcVisible((v) => !v),
          color: "#f8fafc",
        }, {
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
