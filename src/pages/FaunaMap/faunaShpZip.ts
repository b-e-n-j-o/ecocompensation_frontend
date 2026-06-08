import type { Feature, FeatureCollection } from "geojson";
import { parseZip } from "shpjs";

function isFeatureCollection(x: unknown): x is FeatureCollection {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as FeatureCollection).type === "FeatureCollection" &&
    Array.isArray((x as FeatureCollection).features)
  );
}

/**
 * Lit un ZIP shapefile via shpjs (reprojection WGS84 si .prj présent).
 * Fusionne plusieurs couches du même ZIP en une seule FeatureCollection.
 */
export async function zipShapefileToFeatureCollection(arrayBuffer: ArrayBuffer): Promise<FeatureCollection> {
  const parsed = await parseZip(arrayBuffer);
  if (isFeatureCollection(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    const features: Feature[] = [];
    for (const item of parsed) {
      if (isFeatureCollection(item)) {
        features.push(...item.features);
      }
    }
    if (!features.length) {
      throw new Error("Aucune entité GeoJSON dans le ZIP.");
    }
    return { type: "FeatureCollection", features };
  }
  throw new Error("ZIP sans couche shapefile exploitable.");
}
