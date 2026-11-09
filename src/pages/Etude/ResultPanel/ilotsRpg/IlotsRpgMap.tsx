/**
 * IlotsRpgMap.tsx
 * ───────────────
 * Carte MapLibre des îlots agricoles RPG, en trois niveaux de lecture :
 *   1. UF (kind="uf")            remplie, couleur par culture ou par score, contour épais si PM unique
 *   2. Parcelles (kind="parcelle") limites cadastrales fines à l'intérieur de l'UF (à partir du zoom 13)
 *   3. Contour RPG (kind="ilot_rpg") pointillés : le dessin de l'exploitant à l'origine du regroupement
 * Sélection : l'îlot actif est surligné, les autres sont atténués. Liaison tableau par num_ilot.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import {
  CAT_CULTURE_COLORS,
  CAT_CULTURE_LABELS,
  OWNER_NONE_COLOR,
  catColorExpression,
  catLabel,
  cultureLabel,
  formatPct,
  ownerColor,
  ownerColorExpression,
  parcelleLabel,
} from "./labels";
import { IlotsRpgMapHelp } from "./IlotsRpgMapHelp";
import { parcellesByIlot, type IlotsRpgGeojson } from "./types";
import { BaseMapToggle } from "../MapResults/BaseMapToggle";
import { RESULTS_BASEMAP_STYLE, applyBaseMapMode, type BaseMapMode } from "../MapResults/resultsBasemap";

const SRC = "ilots-rpg";
const L = {
  rpg: "ilots-rpg-contour",
  fill: "ilots-rpg-uf-fill",
  outline: "ilots-rpg-uf-outline",
  parcelles: "ilots-rpg-parcelles",
  actFill: "ilots-rpg-parcelles-active-fill",
  actLine: "ilots-rpg-parcelles-active-line",
  parcHover: "ilots-rpg-parcelle-hover",
  hlFill: "ilots-rpg-highlight-fill",
  hlLine: "ilots-rpg-highlight-line",
} as const;

const BASE_STYLE = RESULTS_BASEMAP_STYLE;

const isKind = (k: string): maplibregl.FilterSpecification => ["==", ["get", "kind"], k];

function ilotFilter(kind: string, numIlot: string | null): maplibregl.FilterSpecification {
  return [
    "all",
    ["==", ["get", "kind"], kind],
    ["==", ["get", "num_ilot"], numIlot ?? "___none___"],
  ] as maplibregl.FilterSpecification;
}

function fillOpacityExpr(activeId: string | null): maplibregl.ExpressionSpecification {
  if (activeId) {
    return ["case", ["==", ["get", "num_ilot"], activeId], 0.1, 0.18] as maplibregl.ExpressionSpecification;
  }
  return 0.45 as unknown as maplibregl.ExpressionSpecification;
}

function colorExpr(): maplibregl.ExpressionSpecification {
  return catColorExpression() as maplibregl.ExpressionSpecification;
}

function extendBounds(bounds: maplibregl.LngLatBounds, f: Feature) {
  const g = f.geometry;
  if (!g) return;
  if (g.type === "Polygon") g.coordinates[0].forEach((c) => bounds.extend(c as [number, number]));
  else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p[0].forEach((c) => bounds.extend(c as [number, number])));
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parcellePopupHtml(p: Record<string, unknown>): string {
  const row = (k: string, v: string) =>
    `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap;text-align:left">${k}</th><td>${v}</td></tr>`;
  const surface = num(p.surface_ha);
  const label = parcelleLabel({
    section: (p.section as string | null) ?? null,
    numero: (p.numero as string | null) ?? null,
    idu: String(p.idu ?? ""),
  });
  const owner = p.proprietaire ? `PM <span class="mono">${p.proprietaire}</span>` : "Pers. physique / non identifié";
  return (
    `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Parcelle ${label}</div>` +
    `<table style="font-size:12px;border-collapse:collapse">` +
    row("IDU", `<span class="mono">${p.idu ?? "—"}</span>`) +
    row("Surface", surface != null ? `${surface.toFixed(2)} ha` : "—") +
    row("Part dans l'îlot", formatPct(num(p.part_parcelle))) +
    row("Propriétaire", owner) +
    row("Pool parcelles", p.in_pool === true ? "oui" : "non") +
    `</table>`
  );
}

function popupHtml(p: Record<string, unknown>): string {
  const row = (k: string, v: string) =>
    `<tr><th style="color:#64748b;padding-right:8px;font-weight:500;white-space:nowrap;text-align:left">${k}</th><td>${v}</td></tr>`;
  const surface = num(p.surface_ha);
  const score = num(p.score_eco);
  const scoreMax = num(p.score_eco_max) ?? 6;
  return (
    `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Îlot agricole #${p.rang ?? "?"}</div>` +
    `<table style="font-size:12px;border-collapse:collapse">` +
    row("Culture", `${cultureLabel(p.code_cultu_dominant as string | null)} · ${catLabel(p.cat_dominante as string | null)}`) +
    row("Surface", surface != null ? `${surface.toFixed(1)} ha` : "—") +
    row("Parcelles", String(p.nb_parcelles ?? "—")) +
    row("Propriétaire", p.pm_unique === true ? `PM unique <span class="mono">${p.pm_dominant ?? ""}</span>` : "—") +
    row("Score éco", score != null ? `${score}/${scoreMax}` : "—") +
    `</table>`
  );
}

export interface IlotsRpgMapProps {
  geojson: IlotsRpgGeojson | null;
  /** Emprise projet (même donnée que pour SousEnsemblesMap). */
  foncierGeojson?: unknown;
  projectId?: string | null;
  focusIlotId?: string | null;
  hoverIlotId?: string | null;
  onIlotClick?: (numIlot: string) => void;
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
}

export function IlotsRpgMap({
  geojson,
  foncierGeojson,
  projectId,
  focusIlotId = null,
  hoverIlotId = null,
  onIlotClick,
  hoverParcelleIdu = null,
  onParcelleHover,
}: IlotsRpgMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const handlersBound = useRef(false);
  const didFit = useRef(false);
  const onClickRef = useRef(onIlotClick);
  onClickRef.current = onIlotClick;
  const onParcHoverRef = useRef(onParcelleHover);
  onParcHoverRef.current = onParcelleHover;

  const [baseMap, setBaseMap] = useState<BaseMapMode>("satellite");
  const [helpOpen, setHelpOpen] = useState(false);

  const data = useMemo<FeatureCollection | null>(
    () => (geojson?.features?.length ? (geojson as FeatureCollection) : null),
    [geojson],
  );
  const activeId = hoverIlotId ?? focusIlotId;
  const detailId = focusIlotId ?? hoverIlotId;
  const owners = useMemo(() => {
    if (!detailId) return [];
    const seen = new Map<number, string | null>();
    for (const p of parcellesByIlot(geojson)[detailId] ?? []) {
      if (!seen.has(p.owner_index)) seen.set(p.owner_index, p.proprietaire);
    }
    return [...seen.entries()].sort((a, b) => (a[0] < 0 ? 1 : b[0] < 0 ? -1 : a[0] - b[0]));
  }, [geojson, detailId]);

  useEffect(() => {
    didFit.current = false;
  }, [projectId]);

  // Init carte
  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = new maplibregl.Map({ container: container.current, style: BASE_STYLE, center: [0, 45], zoom: 8 });
    return () => {
      map.current?.remove();
      map.current = null;
      handlersBound.current = false;
    };
  }, []);

  // Données + couches
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    const apply = () => {
      if (foncierGeojson) {
        const src = m.getSource("foncier") as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(foncierGeojson as FeatureCollection);
        else {
          m.addSource("foncier", { type: "geojson", data: foncierGeojson as FeatureCollection });
          m.addLayer({ id: "foncier-fill", type: "fill", source: "foncier", paint: { "fill-color": "#ff4fa3", "fill-opacity": 0.25 } });
          m.addLayer({ id: "foncier-outline", type: "line", source: "foncier", paint: { "line-color": "#ff4fa3", "line-width": 3 } });
        }
      }

      const src = m.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
      } else {
        m.addSource(SRC, { type: "geojson", data });
        m.addLayer({
          id: L.fill, type: "fill", source: SRC, filter: isKind("uf"),
          paint: { "fill-color": colorExpr(), "fill-opacity": fillOpacityExpr(activeId) },
        });
        m.addLayer({
          id: L.outline, type: "line", source: SRC, filter: isKind("uf"),
          paint: {
            "line-color": colorExpr(),
            "line-width": ["case", ["==", ["get", "pm_unique"], true], 3.5, 2] as maplibregl.ExpressionSpecification,
          },
        });
        m.addLayer({
          id: L.parcelles, type: "line", source: SRC, filter: isKind("parcelle"), minzoom: 13,
          paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.85 },
        });
        m.addLayer({
          id: L.rpg, type: "line", source: SRC, filter: isKind("ilot_rpg"),
          paint: { "line-color": "#f8fafc", "line-width": 1.5, "line-dasharray": [2, 2], "line-opacity": 0.9 },
        });
        m.addLayer({
          id: L.actFill, type: "fill", source: SRC, filter: ilotFilter("parcelle", null),
          paint: { "fill-color": ownerColorExpression() as maplibregl.ExpressionSpecification, "fill-opacity": 0.55 },
        });
        m.addLayer({
          id: L.actLine, type: "line", source: SRC, filter: ilotFilter("parcelle", null),
          paint: { "line-color": "#ffffff", "line-width": 1.5 },
        });
        m.addLayer({
          id: L.hlFill, type: "fill", source: SRC, filter: ilotFilter("uf", null),
          paint: { "fill-color": "#fbbf24", "fill-opacity": 0.08 },
        });
        m.addLayer({
          id: L.hlLine, type: "line", source: SRC, filter: ilotFilter("uf", null),
          paint: { "line-color": "#fde68a", "line-width": 3.5 },
        });
        m.addLayer({
          id: L.parcHover, type: "line", source: SRC,
          filter: ["==", ["get", "idu"], "___none___"] as maplibregl.FilterSpecification,
          paint: { "line-color": "#facc15", "line-width": 3 },
        });
      }

      if (!handlersBound.current) {
        popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "320px" });
        m.on("mousemove", L.actFill, (e) => {
          const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          popup.current?.setLngLat(e.lngLat).setHTML(parcellePopupHtml(props)).addTo(m);
          m.getCanvas().style.cursor = "pointer";
          onParcHoverRef.current?.(props.idu != null ? String(props.idu) : null);
        });
        m.on("mouseleave", L.actFill, () => {
          onParcHoverRef.current?.(null);
        });
        m.on("click", L.actFill, (e) => {
          const id = e.features?.[0]?.properties?.num_ilot;
          if (id != null) onClickRef.current?.(String(id));
        });
        m.on("mousemove", L.fill, (e) => {
          if (m.getLayer(L.actFill) && m.queryRenderedFeatures(e.point, { layers: [L.actFill] }).length) return;
          const props = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          popup.current?.setLngLat(e.lngLat).setHTML(popupHtml(props)).addTo(m);
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", L.fill, () => {
          popup.current?.remove();
          m.getCanvas().style.removeProperty("cursor");
        });
        m.on("click", L.fill, (e) => {
          const id = e.features?.[0]?.properties?.num_ilot;
          if (id != null) onClickRef.current?.(String(id));
        });
        handlersBound.current = true;
      }

      if (!didFit.current) {
        const b = new maplibregl.LngLatBounds();
        data.features.filter((f) => f.properties?.kind === "uf").forEach((f) => extendBounds(b, f));
        if (!b.isEmpty()) {
          m.fitBounds(b, { padding: 50 });
          didFit.current = true;
        }
      }
    };
    if (m.isStyleLoaded()) apply(); else m.once("load", apply);
    // colorMode / activeId sont appliqués par leurs propres effets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, foncierGeojson]);

  useEffect(() => {
    applyBaseMapMode(map.current, baseMap);
  }, [baseMap]);

  // Surbrillance + atténuation (sans bouger la caméra)
  useEffect(() => {
    const m = map.current;
    if (!m?.getLayer(L.fill)) return;
    m.setPaintProperty(L.fill, "fill-opacity", fillOpacityExpr(activeId));
    m.setFilter(L.hlFill, ilotFilter("uf", activeId));
    m.setFilter(L.hlLine, ilotFilter("uf", activeId));
  }, [activeId, data]);

  useEffect(() => {
    const m = map.current;
    if (!m?.getLayer(L.actFill)) return;
    m.setFilter(L.actFill, ilotFilter("parcelle", detailId));
    m.setFilter(L.actLine, ilotFilter("parcelle", detailId));
    m.setFilter(L.parcHover, [
      "all",
      ["==", ["get", "kind"], "parcelle"],
      ["==", ["get", "idu"], hoverParcelleIdu ?? "___none___"],
    ] as maplibregl.FilterSpecification);
  }, [detailId, hoverParcelleIdu, data]);

  // Zoom sur l'îlot sélectionné
  useEffect(() => {
    const m = map.current;
    if (!m || !data || !focusIlotId) return;
    const b = new maplibregl.LngLatBounds();
    data.features
      .filter((f) => f.properties?.kind === "uf" && String(f.properties?.num_ilot) === focusIlotId)
      .forEach((f) => extendBounds(b, f));
    if (!b.isEmpty()) m.fitBounds(b, { padding: 72, maxZoom: 17, duration: 650 });
  }, [focusIlotId, data]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <BaseMapToggle
        mode={baseMap}
        onToggle={() => setBaseMap((m) => (m === "satellite" ? "plan" : "satellite"))}
      />
      <button
        type="button"
        onClick={() => setHelpOpen((v) => !v)}
        aria-expanded={helpOpen}
        title="Explications sur les îlots agricoles et les couches de la carte"
        style={{
          position: "absolute", top: 10, left: 54, zIndex: 6,
          display: "inline-flex", alignItems: "center", gap: 6,
          border: "1px solid #1d4ed8", background: helpOpen ? "#1d4ed8" : "#ffffff",
          color: helpOpen ? "#ffffff" : "#1d4ed8", borderRadius: 999, padding: "5px 12px",
          fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(15,23,42,0.18)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16,
            borderRadius: 999, border: "1.5px solid currentColor", fontSize: 11, fontStyle: "italic", fontFamily: "serif",
          }}
        >
          i
        </span>
        Comprendre la carte
      </button>
      {helpOpen && <IlotsRpgMapHelp onClose={() => setHelpOpen(false)} />}

      <div ref={container} className="parcelles-map" style={{ width: "100%", height: "100%" }} />

      <div
        style={{
          position: "absolute", bottom: 24, left: 10, zIndex: 5,
          background: "rgba(255,255,255,0.94)", border: "1px solid #cbd5e1", borderRadius: 6,
          padding: "6px 8px", fontSize: 11, color: "#0f172a", display: "grid", gap: 3, maxWidth: 230,
        }}
      >
        {Object.entries(CAT_CULTURE_COLORS).map(([k, c]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />{CAT_CULTURE_LABELS[k]}
            </span>
          ))}
        <span style={{ borderTop: "1px solid #e2e8f0", marginTop: 2, paddingTop: 3, color: "#475569" }}>
          Contour épais : propriétaire PM unique
        </span>
        {owners.length > 0 && (
          <>
            <span style={{ borderTop: "1px solid #e2e8f0", marginTop: 2, paddingTop: 3, fontWeight: 600 }}>
              Propriétaires de l&apos;îlot
            </span>
            {owners.slice(0, 8).map(([idx, siren]) => (
              <span key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, background: idx < 0 ? OWNER_NONE_COLOR : ownerColor(idx), borderRadius: 2 }} />
                {siren ? <span className="mono">PM {siren}</span> : "Pers. physique / non identifié"}
              </span>
            ))}
            {owners.length > 8 && <span style={{ color: "#64748b" }}>+{owners.length - 8} autres</span>}
          </>
        )}
      </div>
    </div>
  );
}
