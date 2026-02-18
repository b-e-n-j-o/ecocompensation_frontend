import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";

export type ParcelleProperties = {
  idu?: string;
  score?: number;
  score_norm?: number;
  [key: string]: unknown;
};

export type ParcellesGeoJSON = FeatureCollection<Geometry, ParcelleProperties>;

/**
 * Couleur par score normalisé (0 = plus mauvais, 1 = meilleur).
 * Interpolation continue : pas de valeurs de score en dur, adapté à tout barème (0–3, 0–10, 0–15…).
 */
function scoreNormColorExpression(): unknown[] {
  return [
    "interpolate",
    ["linear"],
    ["get", "score_norm"],
    0,
    "#333a4d",   /* plus bas = gris très foncé */
    0.33,
    "#555f72",
    0.66,
    "#f59e0b",   /* milieu = orange */
    1,
    "#3ecf8e",   /* plus haut = vert */
  ];
}

interface ParcellesMapProps {
  geojson: ParcellesGeoJSON | null;
  /** Double-clic sur une parcelle : idu envoyé pour aller à la ligne dans le tableau */
  onParcelleDoubleClick?: (idu: string) => void;
}

export function ParcellesMap({ geojson, onParcelleDoubleClick }: ParcellesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const onDoubleClickRef = useRef(onParcelleDoubleClick);
  onDoubleClickRef.current = onParcelleDoubleClick;

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [0, 47],
      zoom: 8,
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !geojson?.features?.length) return;

    const onLoad = () => {
      if (!map.current) return;

      if (map.current.getSource("parcelles")) {
        (map.current.getSource("parcelles") as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.current.addSource("parcelles", { type: "geojson", data: geojson });

        map.current.addLayer({
          id: "parcelles-fill",
          type: "fill",
          source: "parcelles",
          paint: {
            "fill-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.4,
          },
        });

        map.current.addLayer({
          id: "parcelles-outline",
          type: "line",
          source: "parcelles",
          paint: {
            "line-color": scoreNormColorExpression() as maplibregl.ExpressionSpecification,
            "line-width": 2,
          },
        });

        // Double-clic : aller à la ligne dans le tableau
        map.current.on("dblclick", "parcelles-fill", (e) => {
          const props = e.features?.[0]?.properties as ParcelleProperties | undefined;
          const idu = props?.idu;
          if (idu && typeof idu === "string") onDoubleClickRef.current?.(idu);
        });

        // Curseur pointeur sur les parcelles
        map.current.on("mouseenter", "parcelles-fill", () => {
          map.current?.getCanvas().style.setProperty("cursor", "pointer");
        });
        map.current.on("mouseleave", "parcelles-fill", () => {
          map.current?.getCanvas().style.removeProperty("cursor");
        });
      }

      const bounds = new maplibregl.LngLatBounds();
      geojson.features.forEach((f) => {
        if (f.geometry.type === "Polygon") {
          f.geometry.coordinates[0].forEach((coord: number[]) =>
            bounds.extend(coord as [number, number])
          );
        } else if (f.geometry.type === "MultiPolygon") {
          f.geometry.coordinates.forEach((ring) =>
            ring[0].forEach((coord: number[]) =>
              bounds.extend(coord as [number, number])
            )
          );
        }
      });

      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { padding: 50 });
      }
    };

    if (map.current.isStyleLoaded()) {
      onLoad();
    } else {
      map.current.once("load", onLoad);
    }
  }, [geojson]);

  return (
    <div
      ref={mapContainer}
      className="parcelles-map"
      style={{ width: "100%", height: "400px", borderRadius: "6px" }}
      title="Double-cliquez sur une parcelle pour afficher sa ligne dans le classement"
    />
  );
}
