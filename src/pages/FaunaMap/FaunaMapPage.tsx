import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import "./FaunaMapPage.css";
import FaunaQueryPanel from "./FaunaQueryPanel";
import { escapeHtml } from "./faunaMapShared";
import { useFaunaQuery } from "./useFaunaQuery";

export default function FaunaMapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const fauna = useFaunaQuery({ mapRef, mapReady, enableShapefile: true, autoDrawBbox: true });

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-0.58, 44.84],
      zoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    mapRef.current = map;

    const onLoad = () => setMapReady(true);
    map.on("load", onLoad);
    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  return (
    <div className="fauna-map-root">
      <aside className="fauna-map-sidebar">
        <FaunaQueryPanel fauna={fauna} showShapefile />
      </aside>

      <div
        className={`fauna-map-map-wrap${fauna.drawActive ? (fauna.drawTool === "point" ? " is-drawing-point" : " is-drawing") : ""}`}
      >
        <div ref={mapContainerRef} className="fauna-map-map" />
        {(fauna.loadBusy || fauna.exportBusy) && (
          <div className="fauna-map-loader-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="fauna-map-hourglass-spinner" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
                <path d="M6 2h12v3l-4.5 5.5L18 16v6H6v-6l4.5-5.5L6 5V2zm2 2v.8L11 9.2v1.6L8 15.2V18h8v-2.8l-3-4.4V9.2L16 4.8V4H8z" />
              </svg>
            </div>
            <span className="fauna-map-loader-label">
              {fauna.exportBusy ? "Export en cours…" : "Chargement des observations…"}
            </span>
          </div>
        )}
        {fauna.drawActive && (
          <div className="fauna-map-draw-overlay" role="status">
            {fauna.drawTool === "point" ? "Clique pour placer le centre" : "Clic + glisser pour tracer"}
          </div>
        )}
        {fauna.selected.size > 0 && fauna.searchMode === "species" && (
          <div className="fauna-map-legend">
            {[...fauna.selected.entries()].map(([tax, info]) => (
              <div key={tax} className="fauna-map-legend-row">
                <span className="swatch" style={{ background: info.color }} />
                <span>
                  {escapeHtml(info.label)}
                  {info.bufferM > 0 ? ` (${info.bufferM} m)` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
