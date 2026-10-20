import type { Feature, FeatureCollection, Geometry } from "geojson";
import proj4 from "proj4";
import shp, { parseDbf, parseShp, parseZip } from "shpjs";

proj4.defs(
  "EPSG:2154",
  "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
);
proj4.defs(
  "EPSG:3857",
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs",
);

function isFeatureCollection(x: unknown): x is FeatureCollection {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as FeatureCollection).type === "FeatureCollection" &&
    Array.isArray((x as FeatureCollection).features)
  );
}

function asFeatureCollection(parsed: unknown): FeatureCollection {
  if (isFeatureCollection(parsed)) return parsed;
  if (Array.isArray(parsed)) {
    const features: Feature[] = [];
    for (const item of parsed) {
      if (isFeatureCollection(item)) features.push(...item.features);
    }
    if (!features.length) throw new Error("Aucune entité géographique dans le fichier.");
    return { type: "FeatureCollection", features };
  }
  throw new Error("Fichier sans couche shapefile / GeoJSON exploitable.");
}

function looksProjected(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x) > 180 || Math.abs(y) > 90);
}

function guessProjectedCrs(x: number, y: number): string {
  if (y > 5.4e6 && y < 7.4e6 && x > -2e5 && x < 1.4e6) return "EPSG:2154";
  return "EPSG:3857";
}

function firstXY(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    return [coords[0], coords[1]];
  }
  for (const item of coords) {
    const found = firstXY(item);
    if (found) return found;
  }
  return null;
}

function reprojectCoords(coords: unknown, from: string): unknown {
  if (!Array.isArray(coords) || coords.length < 2) return coords;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [lng, lat] = proj4(from, "EPSG:4326", [coords[0], coords[1]]);
    return [lng, lat, ...coords.slice(2)];
  }
  return coords.map((item) => reprojectCoords(item, from));
}

function reprojectGeometry(geom: Geometry, from: string): Geometry {
  if (geom.type === "GeometryCollection") {
    return {
      type: "GeometryCollection",
      geometries: geom.geometries.map((g) => reprojectGeometry(g, from)),
    };
  }
  if (!("coordinates" in geom)) return geom;
  return {
    ...geom,
    coordinates: reprojectCoords(geom.coordinates, from),
  } as Geometry;
}

export function ensureWgs84(fc: FeatureCollection): FeatureCollection {
  let from: string | null = null;
  for (const f of fc.features) {
    const geom = f.geometry;
    if (!geom) continue;
    const xy =
      geom.type === "GeometryCollection"
        ? firstXY(geom.geometries[0] && "coordinates" in geom.geometries[0] ? geom.geometries[0].coordinates : null)
        : "coordinates" in geom
          ? firstXY(geom.coordinates)
          : null;
    if (xy && looksProjected(xy[0], xy[1])) {
      from = guessProjectedCrs(xy[0], xy[1]);
      break;
    }
  }
  if (!from) return fc;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) =>
      f.geometry ? { ...f, geometry: reprojectGeometry(f.geometry, from) } : f,
    ),
  };
}

function layersFromParsed(parsed: unknown, fallbackName: string): ImportedGeometryLayer[] {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const out: ImportedGeometryLayer[] = [];
  for (const item of items) {
    if (!isFeatureCollection(item)) continue;
    const named =
      typeof (item as unknown as { fileName?: string }).fileName === "string"
        ? String((item as unknown as { fileName: string }).fileName).split("/").pop()
        : fallbackName;
    out.push({ name: named || fallbackName, fc: ensureWgs84(item) });
  }
  if (!out.length) {
    out.push({ name: fallbackName, fc: ensureWgs84(asFeatureCollection(parsed)) });
  }
  return out;
}

export async function zipShapefileToFeatureCollection(arrayBuffer: ArrayBuffer): Promise<FeatureCollection> {
  const parsed = await parseZip(arrayBuffer);
  const layers = layersFromParsed(parsed, "import");
  if (layers.length === 1) return layers[0].fc;
  return {
    type: "FeatureCollection",
    features: layers.flatMap((l) => l.fc.features),
  };
}

async function shapefilePartsToFeatureCollection(parts: {
  shp: File;
  dbf?: File;
  prj?: File;
  cpg?: File;
}): Promise<FeatureCollection> {
  const shpBuf = await parts.shp.arrayBuffer();
  const prj = parts.prj ? await parts.prj.text() : undefined;
  const geoms = parseShp(shpBuf, prj) as Geometry[];
  const props = parts.dbf
    ? (parseDbf(
        await parts.dbf.arrayBuffer(),
        parts.cpg ? await parts.cpg.arrayBuffer() : new ArrayBuffer(0),
      ) as Record<string, unknown>[])
    : [];
  return ensureWgs84({
    type: "FeatureCollection",
    features: geoms.filter(Boolean).map((geometry, i) => ({
      type: "Feature",
      geometry,
      properties: props[i] ?? {},
    })),
  });
}

async function parseGeoJsonFile(file: File): Promise<FeatureCollection> {
  const parsed = JSON.parse(await file.text()) as Feature | FeatureCollection;
  const fc: FeatureCollection =
    parsed.type === "FeatureCollection"
      ? parsed
      : { type: "FeatureCollection", features: [parsed as Feature] };
  return ensureWgs84(fc);
}

export type ImportedGeometryLayer = {
  name: string;
  fc: FeatureCollection;
};

/** ZIP, GeoJSON, ou composants shapefile (.shp + .dbf/.prj) déposés ensemble. */
export async function geometryFilesToLayers(files: File[]): Promise<ImportedGeometryLayer[]> {
  const out: ImportedGeometryLayer[] = [];
  const groups = new Map<string, { shp?: File; dbf?: File; prj?: File; cpg?: File; shx?: File }>();

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const base = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
    if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
      out.push({ name: base, fc: await parseGeoJsonFile(file) });
      continue;
    }
    if (lower.endsWith(".zip")) {
      const buf = await file.arrayBuffer();
      try {
        out.push(...layersFromParsed(await parseZip(buf), base));
      } catch {
        out.push(...layersFromParsed(await shp(buf), base));
      }
      continue;
    }
    const ext = lower.split(".").pop();
    if (ext === "shp" || ext === "dbf" || ext === "prj" || ext === "cpg" || ext === "shx") {
      const key = base.toLowerCase();
      const group = groups.get(key) ?? {};
      group[ext] = file;
      groups.set(key, group);
    }
  }

  for (const [base, parts] of groups) {
    if (!parts.shp) {
      throw new Error(`Fichier .shp manquant pour « ${base} » (ajoutez .shp, .dbf et .prj).`);
    }
    out.push({
      name: base,
      fc: await shapefilePartsToFeatureCollection({
        shp: parts.shp,
        dbf: parts.dbf,
        prj: parts.prj,
        cpg: parts.cpg,
      }),
    });
  }

  return out;
}
