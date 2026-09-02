import { useEffect, useRef } from "react";
import buffer from "@turf/buffer";
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from "geojson";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { EMPTY_TILES_OVERLAY, tileRetention, type FilterTilesOverlay } from "./filterTilesOverlay";
import "./CartoAoi.css";

/** Centre approximatif du département de la Gironde (WGS84, [lon, lat]) */
const GIRONDE_CENTER_LONLAT: [number, number] = [-0.75, 44.58];
const DEFAULT_ZOOM = 8.4;

const TILES_SOURCE = "filter-tiles-source";
const TILES_FILL = "filter-tiles-fill";
const TILES_LINE = "filter-tiles-line";
const PULSE_PERIOD_MS = 2400;
const FADE_MS = 2000;

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
  /** Emprise principale (BV union en ZH, parcelle / fichier sinon). */
  parcelFeature?: Feature<Polygon | MultiPolygon> | null;
  /** Zone initiale uploadée — affichée en sous-couche discrète (ZH). */
  initialZoneFeature?: Feature<Polygon | MultiPolygon> | null;
  bufferKm?: number;
  tilesOverlay?: FilterTilesOverlay;
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

function tilesFillOpacity(fade: number): maplibregl.ExpressionSpecification {
  return [
    "*",
    fade,
    [
      "case",
      ["==", ["coalesce", ["feature-state", "status"], 0], 1],
      ["coalesce", ["feature-state", "pulse"], 0.4],
      ["==", ["coalesce", ["feature-state", "status"], 0], 2],
      ["+", 0.05, ["*", 0.34, ["coalesce", ["feature-state", "retention"], 1]]],
      0.38,
    ],
  ];
}

function tilesLineOpacity(fade: number): maplibregl.ExpressionSpecification {
  return [
    "*",
    fade,
    [
      "case",
      ["==", ["coalesce", ["feature-state", "status"], 0], 1],
      0.95,
      ["==", ["coalesce", ["feature-state", "status"], 0], 2],
      ["+", 0.22, ["*", 0.55, ["coalesce", ["feature-state", "retention"], 1]]],
      0.85,
    ],
  ];
}

function addTileLayers(map: maplibregl.Map) {
  if (map.getSource(TILES_SOURCE)) return;

  map.addSource(TILES_SOURCE, {
    type: "geojson",
    data: emptyFeatureCollection(),
    promoteId: "id",
  });
  map.addLayer(
    {
      id: TILES_FILL,
      type: "fill",
      source: TILES_SOURCE,
      paint: {
        "fill-color": [
          "case",
          ["==", ["coalesce", ["feature-state", "status"], 0], 1],
          "#f5c842",
          ["==", ["coalesce", ["feature-state", "status"], 0], 2],
          "#289f01",
          "#8b939c",
        ],
        "fill-opacity": tilesFillOpacity(1),
      },
    },
    "parcel-fill",
  );
  map.addLayer(
    {
      id: TILES_LINE,
      type: "line",
      source: TILES_SOURCE,
      paint: {
        "line-color": [
          "case",
          ["==", ["coalesce", ["feature-state", "status"], 0], 1],
          "#e4b008",
          ["==", ["coalesce", ["feature-state", "status"], 0], 2],
          "#1a7a01",
          "#6b7280",
        ],
        "line-width": [
          "case",
          ["==", ["coalesce", ["feature-state", "status"], 0], 1],
          2.4,
          1.3,
        ],
        "line-opacity": tilesLineOpacity(1),
      },
    },
    "parcel-line",
  );
}

export function CartoAoi({
  className,
  parcelFeature,
  initialZoneFeature,
  bufferKm = 0,
  tilesOverlay = EMPTY_TILES_OVERLAY,
}: CartoAoiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const tilesGeomKeyRef = useRef("");
  const pulseRafRef = useRef<number>(0);
  const fadeRafRef = useRef<number>(0);
  const fadeStartedRef = useRef(false);

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
      map.addSource("initial-zone-source", {
        type: "geojson",
        data: emptyFeatureCollection(),
      });

      map.addLayer({
        id: "aoi-buffer-fill",
        type: "fill",
        source: "aoi-buffer-source",
        paint: {
          "fill-color": "#85e372",
          "fill-opacity": 0.22,
        },
      });
      map.addLayer({
        id: "aoi-buffer-line",
        type: "line",
        source: "aoi-buffer-source",
        paint: {
          "line-color": "#289f01",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "initial-zone-fill",
        type: "fill",
        source: "initial-zone-source",
        paint: {
          "fill-color": "#f5c842",
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: "initial-zone-line",
        type: "line",
        source: "initial-zone-source",
        paint: {
          "line-color": "#d4a012",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "parcel-source",
        paint: {
          "fill-color": "#289f01",
          "fill-opacity": 0.42,
        },
      });
      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "parcel-source",
        paint: {
          "line-color": "#1a7a01",
          "line-width": 2.5,
        },
      });
      addTileLayers(map);
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(pulseRafRef.current);
      cancelAnimationFrame(fadeRafRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const parcelSource = map.getSource("parcel-source") as maplibregl.GeoJSONSource | undefined;
    const bufferSource = map.getSource("aoi-buffer-source") as maplibregl.GeoJSONSource | undefined;
    const initialZoneSource = map.getSource("initial-zone-source") as maplibregl.GeoJSONSource | undefined;
    if (!parcelSource || !bufferSource || !initialZoneSource) return;

    if (!parcelFeature) {
      parcelSource.setData(emptyFeatureCollection());
      bufferSource.setData(emptyFeatureCollection());
      initialZoneSource.setData(emptyFeatureCollection());
      return;
    }

    parcelSource.setData({
      type: "FeatureCollection",
      features: [parcelFeature],
    });

    initialZoneSource.setData({
      type: "FeatureCollection",
      features: initialZoneFeature ? [initialZoneFeature] : [],
    });

    let bufferedFeature: Feature<Polygon | MultiPolygon> | null = null;
    if (bufferKm > 0) {
      bufferedFeature = buffer(
        parcelFeature as Feature<Polygon | MultiPolygon, GeoJsonProperties>,
        bufferKm,
        { units: "kilometers" },
      ) as Feature<Polygon | MultiPolygon> | null;
    }

    bufferSource.setData({
      type: "FeatureCollection",
      features: bufferedFeature ? [bufferedFeature] : [],
    });

    const bounds = new maplibregl.LngLatBounds();
    extendBoundsFromCoords(bounds, parcelFeature.geometry.coordinates);
    if (initialZoneFeature?.geometry) {
      extendBoundsFromCoords(bounds, initialZoneFeature.geometry.coordinates);
    }
    if (bufferedFeature?.geometry) {
      extendBoundsFromCoords(bounds, bufferedFeature.geometry.coordinates);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 56, duration: 700, maxZoom: 14 });
    }
  }, [parcelFeature, initialZoneFeature, bufferKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer("parcel-fill")) return;
      addTileLayers(map);
      const source = map.getSource(TILES_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      const stopPulse = () => {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = 0;
      };
      const stopFade = () => {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = 0;
      };

      if (tilesOverlay.phase === "hidden" || tilesOverlay.tiles.length === 0) {
        stopPulse();
        stopFade();
        fadeStartedRef.current = false;
        tilesGeomKeyRef.current = "";
        source.setData(emptyFeatureCollection());
        if (map.getLayer(TILES_FILL)) {
          map.setPaintProperty(TILES_FILL, "fill-opacity", tilesFillOpacity(1));
          map.setPaintProperty(TILES_LINE, "line-opacity", tilesLineOpacity(1));
        }
        return;
      }

      const geomKey = tilesOverlay.tiles.map((t) => t.id).join(",");
      if (geomKey !== tilesGeomKeyRef.current) {
        source.setData({
          type: "FeatureCollection",
          features: tilesOverlay.tiles.map((tile) => ({
            type: "Feature" as const,
            id: tile.id,
            properties: { id: tile.id },
            geometry: tile.geometry,
          })),
        });
        tilesGeomKeyRef.current = geomKey;
      }

      for (const tile of tilesOverlay.tiles) {
        const status = tile.status === "pending" ? 0 : tile.status === "active" ? 1 : 2;
        map.setFeatureState(
          { source: TILES_SOURCE, id: tile.id },
          { status, retention: tileRetention(tile) },
        );
      }

      const activeTile = tilesOverlay.tiles.find((t) => t.status === "active");
      stopPulse();
      if (tilesOverlay.phase === "tiling" && activeTile) {
        const tick = (now: number) => {
          const wave = 0.5 + 0.5 * Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2);
          const pulse = 0.2 + 0.32 * wave;
          if (map.getSource(TILES_SOURCE)) {
            map.setFeatureState(
              { source: TILES_SOURCE, id: activeTile.id },
              { pulse, status: 1, retention: tileRetention(activeTile) },
            );
          }
          pulseRafRef.current = requestAnimationFrame(tick);
        };
        pulseRafRef.current = requestAnimationFrame(tick);
      }

      if (tilesOverlay.phase === "fade") {
        if (!fadeStartedRef.current) {
          fadeStartedRef.current = true;
          stopPulse();
          const t0 = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / FADE_MS);
            const fade = 1 - t;
            if (map.getLayer(TILES_FILL)) {
              map.setPaintProperty(TILES_FILL, "fill-opacity", tilesFillOpacity(fade));
              map.setPaintProperty(TILES_LINE, "line-opacity", tilesLineOpacity(fade));
            }
            if (t < 1) {
              fadeRafRef.current = requestAnimationFrame(tick);
            } else {
              source.setData(emptyFeatureCollection());
              tilesGeomKeyRef.current = "";
            }
          };
          fadeRafRef.current = requestAnimationFrame(tick);
        }
      } else {
        fadeStartedRef.current = false;
        stopFade();
        if (map.getLayer(TILES_FILL)) {
          map.setPaintProperty(TILES_FILL, "fill-opacity", tilesFillOpacity(1));
          map.setPaintProperty(TILES_LINE, "line-opacity", tilesLineOpacity(1));
        }
      }
    };

    if (!map.isStyleLoaded() || !map.getLayer("parcel-fill")) {
      map.once("load", apply);
      return;
    }
    apply();

    return () => {
      cancelAnimationFrame(pulseRafRef.current);
      pulseRafRef.current = 0;
    };
  }, [tilesOverlay]);

  return (
    <div
      ref={containerRef}
      className={["carto-aoi", className].filter(Boolean).join(" ")}
      role="presentation"
      aria-label="Carte satellite — zone d’étude"
    />
  );
}
