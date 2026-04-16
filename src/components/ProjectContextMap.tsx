import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type BaseMapMode = "satellite" | "plan";

const CONTEXT_BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
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

interface ProjectContextMapProps {
  parcelleFeature?: Feature<Geometry> | null;
  aoiFeature?: Feature<Geometry> | null;
  foncierFeature?: Feature<Geometry> | null;
}

export function ProjectContextMap({ parcelleFeature, aoiFeature, foncierFeature }: ProjectContextMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("satellite");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: CONTEXT_BASE_STYLE,
      center: [-0.75, 44.58],
      zoom: 9,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onLoad = () => {
      const fcParcelle: FeatureCollection = {
        type: "FeatureCollection",
        features: parcelleFeature ? [parcelleFeature] : [],
      };
      const fcAoi: FeatureCollection = {
        type: "FeatureCollection",
        features: aoiFeature ? [aoiFeature] : [],
      };
      const fcFoncier: FeatureCollection = {
        type: "FeatureCollection",
        features: foncierFeature ? [foncierFeature] : [],
      };

      if (map.getSource("context-parcelle")) {
        (map.getSource("context-parcelle") as maplibregl.GeoJSONSource).setData(fcParcelle);
      } else {
        map.addSource("context-parcelle", { type: "geojson", data: fcParcelle });
        map.addLayer({
          id: "context-parcelle-fill",
          type: "fill",
          source: "context-parcelle",
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.35 },
        });
        map.addLayer({
          id: "context-parcelle-line",
          type: "line",
          source: "context-parcelle",
          paint: { "line-color": "#16a34a", "line-width": 2.5 },
        });
      }

      if (map.getSource("context-aoi")) {
        (map.getSource("context-aoi") as maplibregl.GeoJSONSource).setData(fcAoi);
      } else {
        map.addSource("context-aoi", { type: "geojson", data: fcAoi });
        map.addLayer({
          id: "context-aoi-fill",
          type: "fill",
          source: "context-aoi",
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "context-aoi-line",
          type: "line",
          source: "context-aoi",
          paint: { "line-color": "#60a5fa", "line-width": 2 },
        });
      }

      if (map.getSource("context-foncier")) {
        (map.getSource("context-foncier") as maplibregl.GeoJSONSource).setData(fcFoncier);
      } else {
        map.addSource("context-foncier", { type: "geojson", data: fcFoncier });
        map.addLayer({
          id: "context-foncier-fill",
          type: "fill",
          source: "context-foncier",
          paint: { "fill-color": "#ff4fa3", "fill-opacity": 0.22 },
        });
        map.addLayer({
          id: "context-foncier-line",
          type: "line",
          source: "context-foncier",
          paint: { "line-color": "#ff4fa3", "line-width": 2.5 },
        });
      }

      const bounds = new maplibregl.LngLatBounds();
      const collect = (coords: unknown): void => {
        if (!Array.isArray(coords)) return;
        if (coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
          bounds.extend([coords[0], coords[1]]);
          return;
        }
        coords.forEach(collect);
      };
      const collectGeometry = (geometry?: Geometry): void => {
        if (!geometry) return;
        if ("coordinates" in geometry) {
          collect(geometry.coordinates);
          return;
        }
        if (geometry.type === "GeometryCollection") {
          geometry.geometries.forEach(collectGeometry);
        }
      };
      collectGeometry(aoiFeature?.geometry);
      collectGeometry(parcelleFeature?.geometry);
      collectGeometry(foncierFeature?.geometry);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 17 });
    };

    if (map.isStyleLoaded()) onLoad();
    else map.once("load", onLoad);
  }, [parcelleFeature, aoiFeature, foncierFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const satVis = baseMapMode === "satellite" ? "visible" : "none";
    const planVis = baseMapMode === "plan" ? "visible" : "none";
    try {
      map.setLayoutProperty("basemap-satellite", "visibility", satVis);
      map.setLayoutProperty("basemap-plan", "visibility", planVis);
    } catch {
      // Style/layer pas encore prêt
    }
  }, [baseMapMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 420, borderRadius: 6 }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 2,
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
        style={{ width: "100%", height: "100%", minHeight: 420, borderRadius: 6 }}
        ref={containerRef}
        title="Contexte du projet : parcelle source (vert), AOI (bleu) et foncier (rose)"
      />
    </div>
  );
}
