import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

interface ProjectContextMapProps {
  parcelleFeature?: Feature<Geometry> | null;
  aoiFeature?: Feature<Geometry> | null;
}

export function ProjectContextMap({ parcelleFeature, aoiFeature }: ProjectContextMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
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
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 17 });
    };

    if (map.isStyleLoaded()) onLoad();
    else map.once("load", onLoad);
  }, [parcelleFeature, aoiFeature]);

  return (
    <div
      style={{ width: "100%", height: "100%", minHeight: 420, borderRadius: 6 }}
      ref={containerRef}
      title="Contexte du projet : parcelle source (vert) et AOI (bleu)"
    />
  );
}
