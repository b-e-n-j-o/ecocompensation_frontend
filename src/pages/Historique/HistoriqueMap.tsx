import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

import { BaseMapToggle } from "../Etude/ResultPanel/MapResults/BaseMapToggle";
import {
  RESULTS_BASEMAP_STYLE,
  applyBaseMapMode,
  type BaseMapMode,
} from "../Etude/ResultPanel/MapResults/resultsBasemap";

const EMPTY: FeatureCollection<Geometry, GeoJsonProperties> = { type: "FeatureCollection", features: [] };

export function HistoriqueMap({
  points,
  outlines,
  selectedProjectId,
  onSelect,
  onOpen,
}: {
  points: FeatureCollection<Geometry, GeoJsonProperties> | null;
  outlines: FeatureCollection<Geometry, GeoJsonProperties> | null;
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onOpen: (projectId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const fittedRef = useRef(false);
  const selectedRef = useRef(selectedProjectId);
  const onSelectRef = useRef(onSelect);
  const onOpenRef = useRef(onOpen);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");

  selectedRef.current = selectedProjectId;
  onSelectRef.current = onSelect;
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: RESULTS_BASEMAP_STYLE,
      center: [-0.75, 44.58],
      zoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    mapRef.current = map;
    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    applyBaseMapMode(mapRef.current, baseMapMode);
  }, [baseMapMode]);

  useEffect(() => {
    const map = mapRef.current;
    const pts = points ?? EMPTY;
    const outs = outlines ?? EMPTY;
    if (!map) return;

    const apply = () => {
      if (map.getSource("historique-outlines")) {
        (map.getSource("historique-outlines") as maplibregl.GeoJSONSource).setData(outs);
      } else {
        map.addSource("historique-outlines", { type: "geojson", data: outs });
        map.addLayer({
          id: "historique-outline-fill",
          type: "fill",
          source: "historique-outlines",
          paint: { "fill-color": "#85e372", "fill-opacity": 0.22 },
        });
        map.addLayer({
          id: "historique-outline-line",
          type: "line",
          source: "historique-outlines",
          paint: { "line-color": "#289f01", "line-width": 1.6 },
        });
      }

      if (map.getSource("historique-points")) {
        (map.getSource("historique-points") as maplibregl.GeoJSONSource).setData(pts);
      } else {
        map.addSource("historique-points", { type: "geojson", data: pts });
        map.addLayer({
          id: "historique-pings",
          type: "circle",
          source: "historique-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "project_id"], selectedRef.current ?? ""], 9, 6],
            "circle-color": "#85e372",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.on("mouseenter", "historique-pings", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f || !popupRef.current) return;
          const name = String(f.properties?.name ?? "Projet");
          popupRef.current.setLngLat(e.lngLat).setHTML(`<strong>${escapeHtml(name)}</strong>`).addTo(map);
        });
        map.on("mouseleave", "historique-pings", () => {
          map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
        });
        map.on("click", "historique-pings", (e) => {
          const id = String(e.features?.[0]?.properties?.project_id ?? "");
          if (!id) return;
          e.originalEvent.stopPropagation();
          if (selectedRef.current === id) onOpenRef.current(id);
          else onSelectRef.current(id);
        });
        map.on("click", "historique-outline-fill", (e) => {
          const id = String(e.features?.[0]?.properties?.project_id ?? "");
          if (!id) return;
          e.originalEvent.stopPropagation();
          if (selectedRef.current === id) onOpenRef.current(id);
          else onSelectRef.current(id);
        });
        map.on("dblclick", "historique-pings", (e) => {
          const id = String(e.features?.[0]?.properties?.project_id ?? "");
          if (id) onOpenRef.current(id);
        });
      }

      if (!fittedRef.current && pts.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const f of pts.features) {
          if (f.geometry?.type === "Point") {
            const [lng, lat] = f.geometry.coordinates;
            bounds.extend([lng, lat]);
          }
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
          fittedRef.current = true;
        }
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points, outlines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("historique-pings")) return;
    map.setPaintProperty("historique-pings", "circle-radius", [
      "case",
      ["==", ["get", "project_id"], selectedProjectId ?? ""],
      9,
      6,
    ]);
    if (map.getLayer("historique-outline-line")) {
      map.setPaintProperty("historique-outline-line", "line-width", [
        "case",
        ["==", ["get", "project_id"], selectedProjectId ?? ""],
        3,
        1.6,
      ]);
    }

    if (!selectedProjectId || !points) return;
    const feat = points.features.find((f) => String(f.properties?.project_id) === selectedProjectId);
    if (feat?.geometry?.type === "Point") {
      const [lng, lat] = feat.geometry.coordinates;
      map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11), duration: 450 });
    }
  }, [selectedProjectId, points]);

  return (
    <div className="historique-page__map">
      <div ref={containerRef} className="historique-page__map-canvas" />
      <BaseMapToggle
        mode={baseMapMode}
        onToggle={() => setBaseMapMode((m) => (m === "satellite" ? "plan" : "satellite"))}
      />
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
