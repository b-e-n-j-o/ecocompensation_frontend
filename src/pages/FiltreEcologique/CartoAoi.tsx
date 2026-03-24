import { useEffect, useRef } from "react";
import buffer from "@turf/buffer";
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from "geojson";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import "./CartoAoi.css";

/** Centre approximatif du département de la Gironde (WGS84, [lon, lat]) */
const GIRONDE_CENTER_LONLAT: [number, number] = [-0.75, 44.58];
const DEFAULT_ZOOM = 8.4;

/**
 * Style raster satellite (Esri World Imagery, tuiles publiques).
 * Pas de clé API requise ; mention légale dans l'attribution.
 */
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> — Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [
    {
      id: "esri",
      type: "raster",
      source: "esri",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export interface CartoAoiProps {
  className?: string;
  parcelFeature?: Feature<Polygon | MultiPolygon> | null;
  bufferKm?: number;
}

/**
 * Carte MapLibre : vue satellite, centrée sur la Gironde par défaut.
 * Les couches parcelle / buffer seront branchées ici ensuite.
 */
function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function extendBoundsFromCoords(
  bounds: maplibregl.LngLatBounds,
  coords: unknown,
) {
  if (!Array.isArray(coords)) return;
  if (coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    bounds.extend([coords[0], coords[1]]);
    return;
  }
  for (const item of coords) extendBoundsFromCoords(bounds, item);
}

export function CartoAoi({ className, parcelFeature, bufferKm = 0 }: CartoAoiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: GIRONDE_CENTER_LONLAT,
      zoom: DEFAULT_ZOOM,
      maxPitch: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.addSource("parcel-source", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });
      map.addSource("aoi-buffer-source", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: "aoi-buffer-fill",
        type: "fill",
        source: "aoi-buffer-source",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: "aoi-buffer-line",
        type: "line",
        source: "aoi-buffer-source",
        paint: {
          "line-color": "#60a5fa",
          "line-width": 2,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcel-source",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.3,
        },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcel-source",
        paint: {
          "line-color": "#16a34a",
          "line-width": 2.2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("parcel-source") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!parcelFeature) {
      source.setData(emptyFeatureCollection());
      return;
    }

    source.setData({
      type: "FeatureCollection",
      features: [parcelFeature],
    });

    const bounds = new maplibregl.LngLatBounds();
    extendBoundsFromCoords(bounds, parcelFeature.geometry.coordinates);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 50, duration: 700, maxZoom: 17 });
    }
  }, [parcelFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("aoi-buffer-source") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!parcelFeature || bufferKm <= 0) {
      source.setData(emptyFeatureCollection());
      return;
    }

    const buffered = buffer(parcelFeature as Feature<Polygon | MultiPolygon, GeoJsonProperties>, bufferKm, {
      units: "kilometers",
    });

    source.setData({
      type: "FeatureCollection",
      features: buffered ? [buffered] : [],
    });
  }, [parcelFeature, bufferKm]);

  return (
    <div
      ref={containerRef}
      className={["carto-aoi", className].filter(Boolean).join(" ")}
      role="presentation"
      aria-label="Carte satellite — zone d’étude"
    />
  );
}
