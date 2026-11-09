import buffer from "@turf/buffer";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Tampons autour des géométries. 0 m ne dessine rien. */
export function buffersAutour(
  points: FeatureCollection | null,
  rayonM: number | ((nom: string) => number),
  colorDefaut = "#c47b2b",
): FeatureCollection<Polygon | MultiPolygon> {
  if (typeof rayonM === "number" && rayonM <= 0) {
    return { type: "FeatureCollection", features: [] };
  }
  if (!points?.features.length) return EMPTY;
  const features: Feature<Polygon | MultiPolygon>[] = [];
  for (const feature of points.features) {
    const nom = String(feature.properties?.nom ?? "");
    const metres = typeof rayonM === "function" ? rayonM(nom) : rayonM;
    if (metres <= 0 || !feature.geometry) continue;
    const disque = buffer(feature as Feature, metres / 1000, { units: "kilometers" });
    if (!disque) continue;
    features.push({
      type: "Feature",
      properties: { nom, color: feature.properties?.color ?? colorDefaut },
      geometry: disque.geometry,
    });
  }
  return { type: "FeatureCollection", features };
}
