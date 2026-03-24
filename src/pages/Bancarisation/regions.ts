export type RegionKey =
  | 'nord'
  | 'nord-ouest'
  | 'nord-est'
  | 'ouest'
  | 'centre'
  | 'est'
  | 'sud-ouest'
  | 'sud'
  | 'sud-est'
  | 'outre-mer';

export interface RegionDef {
  label: string;
  emoji: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  center: [number, number]; // [lon, lat]
}

export const REGIONS: Record<RegionKey, RegionDef> = {
  'nord':       { label: 'Nord',       emoji: '⬆️',  bbox: [-2.5,  49.8,  4,    51.5], center: [2.5,  50.6] },
  'nord-ouest': { label: 'Nord-Ouest', emoji: '↖️',  bbox: [-5.2,  47.5, -0.5,  50],   center: [-2.5, 48.6] },
  'nord-est':   { label: 'Nord-Est',   emoji: '↗️',  bbox: [4,     48,    8.3,  51.5], center: [6.5,  49.2] },
  'ouest':      { label: 'Ouest',      emoji: '⬅️',  bbox: [-5.2,  45,   -0.5,  47.5], center: [-2,   46.5] },
  'centre':     { label: 'Centre',     emoji: '🎯',  bbox: [-0.5,  45.5,  4,    48],   center: [1.8,  47]   },
  'est':        { label: 'Est',        emoji: '➡️',  bbox: [4,     45,    8.3,  48],   center: [6,    46.5] },
  'sud-ouest':  { label: 'Sud-Ouest',  emoji: '↙️',  bbox: [-2,    42.3,  2,    45],   center: [0.3,  43.8] },
  'sud':        { label: 'Sud',        emoji: '⬇️',  bbox: [2,     42.3,  5,    44.5], center: [3.5,  43.4] },
  'sud-est':    { label: 'Sud-Est',    emoji: '↘️',  bbox: [5,     42.3,  8.3,  45],   center: [6.8,  43.8] },
  'outre-mer':  { label: 'Outre-Mer',  emoji: '🌊',  bbox: [-180, -90,  180,   90],    center: [2,    14]   },
};

// Ordre de priorité : les régions métropoliaires d'abord, outre-mer en dernier (catch-all)
const REGION_KEYS_ORDERED: RegionKey[] = [
  'nord', 'nord-ouest', 'nord-est',
  'ouest', 'centre', 'est',
  'sud-ouest', 'sud', 'sud-est',
  'outre-mer',
];

export function assignRegion(lon: number, lat: number): RegionKey {
  for (const key of REGION_KEYS_ORDERED) {
    const [minLon, minLat, maxLon, maxLat] = REGIONS[key].bbox;
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) return key;
  }
  return 'outre-mer';
}

/** Centre géographique d'une FeatureCollection (moyenne des coordonnées) */
export function collectionCenter(features: GeoJSON.Feature[]): [number, number] {
  let sumLon = 0, sumLat = 0, count = 0;
  function walk(arr: any) {
    if (!arr) return;
    if (typeof arr[0] === 'number') { sumLon += arr[0]; sumLat += arr[1]; count++; }
    else arr.forEach(walk);
  }
  features.forEach((f: any) => walk(f.geometry?.coordinates));
  return count > 0 ? [sumLon / count, sumLat / count] : [2.4, 46.6];
}