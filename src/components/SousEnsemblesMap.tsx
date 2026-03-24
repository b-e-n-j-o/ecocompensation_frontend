import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import type * as GeoJSON from "geojson";

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
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
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esri-satellite",
    },
  ],
};

function scoreNormColorExpression(): unknown[] {
  return [
    "interpolate",
    ["linear"],
    ["get", "score_norm"],
    0,
    "#333a4d",
    0.33,
    "#555f72",
    0.66,
    "#f59e0b",
    1,
    "#3ecf8e",
  ];
}

interface SousEnsemblesMapProps {
  geojson: FeatureCollection<Geometry, any> | null;
  subsetScores: Record<string, number> | null;
}

export function SousEnsemblesMap({ geojson, subsetScores }: SousEnsemblesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  const coloredGeojson = useMemo(() => {
    if (!geojson?.features?.length) return null;
    const scores = Object.values(subsetScores ?? {});
    const minS = scores.length ? Math.min(...scores) : 0;
    const maxS = scores.length ? Math.max(...scores) : 1;
    const rng = maxS - minS || 1;

    const features = geojson.features.map((f) => {
      const sid = (f.properties as any)?.subset_id as string | undefined;
      const score = sid && subsetScores ? subsetScores[sid] ?? 0 : 0;
      const score_norm = (score - minS) / rng;
      return {
        ...f,
        properties: {
          ...(f.properties ?? {}),
          subset_id: sid,
          score,
          score_norm: round4(score_norm),
        },
      };
    });

    return { ...geojson, features };
  }, [geojson, subsetScores]);

  function round4(n: number) {
    return Math.round(n * 10000) / 10000;
  }

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: SATELLITE_STYLE,
      center: [0, 47],
      zoom: 8,
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !coloredGeojson?.features?.length) return;
    const m = map.current;

    const onLoadOrUpdate = () => {
      if (!coloredGeojson?.features?.length) return;

      const sourceId = "uf-subsets";
      const fillLayerId = "uf-subsets-fill";
      const outlineLayerId = "uf-subsets-outline";

      if (m.getSource(sourceId)) {
        (m.getSource(sourceId) as maplibregl.GeoJSONSource).setData(coloredGeojson as any);
      } else {
        m.addSource(sourceId, { type: "geojson", data: coloredGeojson as any });
        m.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.4,
          },
        });
        m.addLayer({
          id: outlineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "line-width": 2,
          },
        });
      }

      // Cursor pointeur sur survol
      if (m.getLayer(fillLayerId)) {
        m.on("mouseenter", fillLayerId, () => {
          m?.getCanvas().style.setProperty("cursor", "pointer");
        });
        m.on("mouseleave", fillLayerId, () => {
          m?.getCanvas().style.removeProperty("cursor");
        });
      }

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds();
      coloredGeojson.features.forEach((f: GeoJSON.Feature) => {
        if (!f.geometry) return;
        if (f.geometry.type === "Polygon") {
          f.geometry.coordinates[0].forEach((coord: number[]) => bounds.extend(coord as [number, number]));
        } else if (f.geometry.type === "MultiPolygon") {
          (f.geometry.coordinates as number[][][][]).forEach((ring: number[][][]) =>
            ring[0].forEach((coord: number[]) => bounds.extend(coord as [number, number]))
          );
        }
      });
      if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 50 });
    };

    if (m.isStyleLoaded()) onLoadOrUpdate();
    else m.once("load", onLoadOrUpdate);
  }, [coloredGeojson]);

  return (
    <div
      ref={mapContainer}
      className="parcelles-map"
      style={{ width: "100%", height: "400px", borderRadius: "6px" }}
      title="Sous-ensembles UF (unités foncières) — colorés par score"
    />
  );
}

