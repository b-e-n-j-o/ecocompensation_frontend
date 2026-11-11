import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { CESBIO_LIBELLE_COLORS } from "../../../../types";
import { createMapHoverPopup, hideMapHoverPopup, showMapHoverPopup } from "../MapResults/mapHoverPopup";

type FC = FeatureCollection<Geometry, Record<string, unknown>>;

export type OccupationSolLegendRow = [string, number];

function emptyFC(): FC {
  return { type: "FeatureCollection", features: [] };
}

export function cesbioColorExpression(): maplibregl.ExpressionSpecification {
  const pairs = Object.entries(CESBIO_LIBELLE_COLORS).flat();
  return ["match", ["get", "libelle"], ...pairs, "#9ca3af"] as unknown as maplibregl.ExpressionSpecification;
}

export function useOccupationSolLayer(
  map: RefObject<maplibregl.Map | null>,
  styleReady: boolean,
  opts: {
    key: string | null;
    fetcher: (key: string) => Promise<FeatureCollection>;
    visible: boolean;
    beforeLayerId?: string;
  },
): { data: FC | null; loading: boolean; legend: OccupationSolLegendRow[] } {
  const cache = useRef(new Map<string, FC>());
  const [data, setData] = useState<FC | null>(null);
  const [loading, setLoading] = useState(false);
  const { key, fetcher, visible, beforeLayerId } = opts;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hoverBoundRef = useRef(false);

  useEffect(() => {
    if (!key || !visible) {
      setData(null);
      setLoading(false);
      return;
    }
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetcherRef.current(key)
      .then((fc) => {
        const next = fc as FC;
        cache.current.set(key, next);
        if (!cancelled) setData(next);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, visible]);

  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady) return;
    const shown = visible ? (data ?? emptyFC()) : emptyFC();
    const srcId = "occupation-sol";
    const fillId = "occupation-sol-fill";
    const lineId = "occupation-sol-line";
    const before = beforeLayerId && m.getLayer(beforeLayerId) ? beforeLayerId : undefined;
    const src = m.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(shown);
      if (before && m.getLayer(fillId)) {
        m.moveLayer(fillId, before);
        if (m.getLayer(lineId)) m.moveLayer(lineId, before);
      }
    } else {
      m.addSource(srcId, { type: "geojson", data: shown });
      m.addLayer({
        id: fillId, type: "fill", source: srcId,
        paint: { "fill-color": cesbioColorExpression(), "fill-opacity": 0.75 },
      }, before);
      m.addLayer({
        id: lineId, type: "line", source: srcId,
        paint: { "line-color": "#0f172a", "line-width": 0.4, "line-opacity": 0.5 },
      }, before);
    }

    if (!hoverBoundRef.current && m.getLayer(fillId)) {
      hoverBoundRef.current = true;
      const popup = createMapHoverPopup("240px");
      popupRef.current = popup;
      const onMove = (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties;
        const lib = p?.libelle != null ? String(p.libelle) : "";
        if (!lib) { hideMapHoverPopup(popup); return; }
        const ha = Number(p?.surface_ha);
        const surface = Number.isFinite(ha) ? `${ha.toFixed(2)} ha` : "";
        const safe = lib.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
        showMapHoverPopup(
          popup,
          m,
          `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:2px">Occupation du sol</div><div style="font-size:12px">${safe}${surface ? ` <span style="color:#64748b">${surface}</span>` : ""}</div>`,
        );
        m.getCanvas().style.cursor = "pointer";
      };
      const onLeave = () => {
        hideMapHoverPopup(popup);
        m.getCanvas().style.removeProperty("cursor");
      };
      m.on("mousemove", fillId, onMove);
      m.on("mouseleave", fillId, onLeave);
    }
  }, [map, styleReady, data, visible, beforeLayerId]);

  useEffect(() => {
    if (!visible && popupRef.current) hideMapHoverPopup(popupRef.current);
  }, [visible]);

  const legend = useMemo(() => {
    const ha: Record<string, number> = {};
    for (const f of data?.features ?? []) {
      const lib = String(f.properties?.libelle ?? "");
      ha[lib] = (ha[lib] ?? 0) + Number(f.properties?.surface_ha ?? 0);
    }
    return Object.entries(ha).sort((a, b) => b[1] - a[1]) as OccupationSolLegendRow[];
  }, [data]);

  return { data, loading, legend };
}

export function OccupationSolLegend({ legend }: { legend: OccupationSolLegendRow[] }) {
  if (!legend.length) return null;
  return (
    <>
      <strong style={{ marginTop: 4 }}>Occupation du sol</strong>
      {legend.map(([lib, ha]) => (
        <span key={lib} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, flex: "none", background: CESBIO_LIBELLE_COLORS[lib] ?? "#9ca3af" }} />
          {lib} <span className="mono" style={{ marginLeft: "auto" }}>{ha.toFixed(1)} ha</span>
        </span>
      ))}
    </>
  );
}
