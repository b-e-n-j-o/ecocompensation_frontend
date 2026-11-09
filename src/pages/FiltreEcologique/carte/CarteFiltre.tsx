import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { getApiBaseUrl } from "../../../config/apiBase";
import { CartoAoi } from "../CartoAoi";
import type { FilterTilesOverlay } from "../filterTilesOverlay";
import { buffersAutour } from "./couches/buffersObservations";
import { LegendeCarte, type LegendeLigne } from "./LegendeCarte";

export interface CritereFloreCarte {
  taxon_key: string;
  label: string;
  dist_m: number;
}

export interface CarteFiltreProps {
  sourceFeature: Feature<Polygon | MultiPolygon> | null;
  initialZoneFeature?: Feature<Polygon | MultiPolygon> | null;
  bufferKm: number;
  isZh: boolean;
  bvPreviewNames: string[];
  tilesOverlay: FilterTilesOverlay;
  faunaSpecies: string[];
  faunaAliases: Record<string, string[]>;
  faunaDistBySpecies: Record<string, number>;
  floraCriteria: CritereFloreCarte[];
  tronconsHydroEnabled?: boolean;
  surfacesHydroEnabled?: boolean;
  tronconsHydroMaxDistM?: number;
  surfacesHydroMaxDistM?: number;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const COULEURS = ["#c47b2b", "#1d4ed8", "#0f766e", "#db2777", "#7c3aed", "#b45309", "#0369a1", "#be123c"];

function teinter(points: FeatureCollection | null, couleurDe: (nom: string) => string): FeatureCollection | null {
  if (!points) return null;
  return {
    type: "FeatureCollection",
    features: points.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        color: couleurDe(String(feature.properties?.nom ?? "")),
      },
    })),
  };
}

async function pointsDansZone(
  url: string,
  names: string[],
  bufferM: number,
  geometry: GeoJSON.Geometry,
  signal: AbortSignal,
  aliases: string[] = [],
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ names, aliases, buffer_m: bufferM, geometry }),
  });
  if (!response.ok) return EMPTY;
  const fc = (await response.json()) as FeatureCollection;
  return Array.isArray(fc.features) ? fc : EMPTY;
}

/**
 * Carte qui accompagne la construction du filtre.
 * Chaque famille de données (faune, flore) prépare ses points et ses buffers ici.
 */
export function CarteFiltre({
  sourceFeature,
  initialZoneFeature = null,
  bufferKm,
  isZh,
  bvPreviewNames,
  tilesOverlay,
  faunaSpecies,
  faunaAliases,
  faunaDistBySpecies,
  floraCriteria,
  tronconsHydroEnabled = false,
  surfacesHydroEnabled = false,
  tronconsHydroMaxDistM = 0,
  surfacesHydroMaxDistM = 0,
}: CarteFiltreProps) {
  const [faunaPoints, setFaunaPoints] = useState<FeatureCollection | null>(null);
  const [floraPoints, setFloraPoints] = useState<FeatureCollection | null>(null);
  const [faunaLoading, setFaunaLoading] = useState(false);
  const [floraLoading, setFloraLoading] = useState(false);
  const [tronconsHydro, setTronconsHydro] = useState<FeatureCollection | null>(null);
  const [surfacesHydro, setSurfacesHydro] = useState<FeatureCollection | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({
    zone: true,
    emprise: true,
    "faune-points": true,
    "flore-points": true,
    "cours-eau": true,
    "plans-eau": true,
    "zone-initiale": true,
    tuiles: true,
  });
  const effectiveBufferKm = isZh ? 0 : bufferKm;

  useEffect(() => {
    const geometry = sourceFeature?.geometry;
    const names = faunaSpecies;
    const aliases = faunaSpecies.flatMap((species) => faunaAliases[species] ?? []);
    if (!geometry || names.length === 0) {
      setFaunaPoints(null);
      setFaunaLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setFaunaLoading(true);
    pointsDansZone(
      `${getApiBaseUrl()}/api/fauna/zone-points`,
      names,
      effectiveBufferKm * 1000,
      geometry,
      ctrl.signal,
      aliases,
    )
      .then((fc) => {
        if (!cancelled) setFaunaPoints(fc);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFaunaLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sourceFeature, faunaSpecies, faunaAliases, effectiveBufferKm]);

  useEffect(() => {
    const geometry = sourceFeature?.geometry;
    const names = floraCriteria.flatMap((item) => [item.taxon_key, item.label]);
    if (!geometry || floraCriteria.length === 0) {
      setFloraPoints(null);
      setFloraLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setFloraLoading(true);
    pointsDansZone(`${getApiBaseUrl()}/api/reserve-fonciere/flore/zone-points`, names, effectiveBufferKm * 1000, geometry, ctrl.signal)
      .then((fc) => {
        if (!cancelled) setFloraPoints(fc);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFloraLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [sourceFeature, floraCriteria, effectiveBufferKm]);

  useEffect(() => {
    const geometry = sourceFeature?.geometry;
    if (!geometry || !tronconsHydroEnabled) {
      setTronconsHydro(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`${getApiBaseUrl()}/api/hydro/zone-features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ kind: "troncons", buffer_m: effectiveBufferKm * 1000, geometry }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: FeatureCollection | null) => {
        if (fc && Array.isArray(fc.features)) setTronconsHydro(fc);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [sourceFeature, tronconsHydroEnabled, effectiveBufferKm]);

  useEffect(() => {
    const geometry = sourceFeature?.geometry;
    if (!geometry || !surfacesHydroEnabled) {
      setSurfacesHydro(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`${getApiBaseUrl()}/api/hydro/zone-features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ kind: "surfaces", buffer_m: effectiveBufferKm * 1000, geometry }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: FeatureCollection | null) => {
        if (fc && Array.isArray(fc.features)) setSurfacesHydro(fc);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [sourceFeature, surfacesHydroEnabled, effectiveBufferKm]);

  const rayonFaune = (nom: string) => {
    if (typeof faunaDistBySpecies[nom] === "number") return faunaDistBySpecies[nom];
    const parent = faunaSpecies.find((species) => (faunaAliases[species] ?? []).includes(nom));
    return parent ? (faunaDistBySpecies[parent] ?? 1000) : 0;
  };
  const rayonFlore = (nom: string) =>
    floraCriteria.find((item) => item.taxon_key === nom || item.label === nom)?.dist_m ?? 0;

  const couleurFaune = (nom: string) => {
    const index = faunaSpecies.findIndex((species) => species === nom || (faunaAliases[species] ?? []).includes(nom));
    return COULEURS[(index < 0 ? 0 : index) % COULEURS.length];
  };
  const couleurFlore = (nom: string) => {
    const index = floraCriteria.findIndex((item) => item.taxon_key === nom || item.label === nom);
    return COULEURS[((index < 0 ? 0 : index) + faunaSpecies.length) % COULEURS.length];
  };

  const faunaColories = useMemo(() => teinter(faunaPoints, couleurFaune), [faunaPoints, faunaSpecies, faunaAliases]);
  const floraColories = useMemo(() => teinter(floraPoints, couleurFlore), [floraPoints, floraCriteria]);
  const faunaBuffers = useMemo(
    () => ((faunaColories?.features.length ?? 0) > 80 ? { type: "FeatureCollection" as const, features: [] } : buffersAutour(faunaColories, rayonFaune)),
    [faunaColories, faunaDistBySpecies, faunaAliases, faunaSpecies],
  );
  const floraBuffers = useMemo(() => buffersAutour(floraColories, rayonFlore), [floraColories, floraCriteria]);
  const [tronconsHydroBuffers, setTronconsHydroBuffers] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [surfacesHydroBuffers, setSurfacesHydroBuffers] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });

  useEffect(() => {
    if (!tronconsHydroEnabled || tronconsHydroMaxDistM <= 0) {
      setTronconsHydroBuffers({ type: "FeatureCollection", features: [] });
      return;
    }
    const timer = window.setTimeout(() => {
      setTronconsHydroBuffers(buffersAutour(tronconsHydro, tronconsHydroMaxDistM, "#0369a1"));
    }, 80);
    return () => window.clearTimeout(timer);
  }, [tronconsHydro, tronconsHydroEnabled, tronconsHydroMaxDistM]);

  useEffect(() => {
    if (!surfacesHydroEnabled || surfacesHydroMaxDistM <= 0) {
      setSurfacesHydroBuffers({ type: "FeatureCollection", features: [] });
      return;
    }
    const timer = window.setTimeout(() => {
      setSurfacesHydroBuffers(buffersAutour(surfacesHydro, surfacesHydroMaxDistM, "#38bdf8"));
    }, 80);
    return () => window.clearTimeout(timer);
  }, [surfacesHydro, surfacesHydroEnabled, surfacesHydroMaxDistM]);

  const toggle = (id: string) => setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const lignes: LegendeLigne[] = [];
  if (sourceFeature && !isZh) {
    lignes.push({ id: "emprise", label: "Parcelle / emprise", swatchClass: "eco-aoi-legend-swatch--parcel" });
  }
  if (isZh && initialZoneFeature) {
    lignes.push({ id: "zone-initiale", label: "Zone initiale uploadée", swatchClass: "eco-aoi-legend-swatch--initial" });
  }
  if (sourceFeature && !isZh && bufferKm > 0) {
    lignes.push({ id: "zone", label: `Zone de recherche (${bufferKm.toFixed(1)} km)`, swatchClass: "eco-aoi-legend-swatch--buffer" });
  }
  if (faunaSpecies.length > 0) {
    lignes.push({
      id: "faune-points",
      label: "Observations faune",
      color: "#c47b2b",
      notes: faunaSpecies.map((species, index) => ({ label: species, color: COULEURS[index % COULEURS.length] })),
    });
  }
  if (floraCriteria.length > 0) {
    lignes.push({
      id: "flore-points",
      label: "Observations flore",
      color: "#7c3aed",
      notes: floraCriteria.map((item, index) => ({
        label: item.label,
        color: COULEURS[(index + faunaSpecies.length) % COULEURS.length],
      })),
    });
  }
  if (tronconsHydroEnabled) {
    lignes.push({ id: "cours-eau", label: "Cours d'eau", color: "#0369a1" });
  }
  if (surfacesHydroEnabled) {
    lignes.push({ id: "plans-eau", label: "Plans d'eau", color: "#38bdf8" });
  }
  if (isZh) {
    lignes.push({
      id: "emprise",
      label:
        bvPreviewNames.length === 1
          ? bvPreviewNames[0]
          : bvPreviewNames.length > 1
            ? `Périmètre BV (${bvPreviewNames.length})`
            : "Périmètre de recherche (bassins versants)",
      swatchClass: "eco-aoi-legend-swatch--parcel",
    });
  }
  if (tilesOverlay.phase !== "hidden" && tilesOverlay.tiles.length > 0) {
    lignes.push({
      id: "tuiles",
      label: tilesOverlay.phase === "filter" ? "Rétention par tuile" : "Tuiles du filtre",
      swatchClass: "eco-aoi-legend-swatch--tile-done",
    });
  }

  return (
    <div className="eco-aoi-map-wrap">
      {(faunaLoading || floraLoading) && (
        <div className="eco-aoi-map-loading" role="status">
          <span className="eco-aoi-map-loading__dots" aria-hidden>…</span>
          Chargement des observations
        </div>
      )}
      {sourceFeature && <LegendeCarte lignes={lignes} visible={visible} onToggle={toggle} />}

      <CartoAoi
        parcelFeature={sourceFeature}
        initialZoneFeature={isZh ? initialZoneFeature : null}
        bufferKm={effectiveBufferKm}
        tilesOverlay={tilesOverlay}
        observationPoints={faunaColories}
        floraPoints={floraColories}
        faunaBuffers={faunaBuffers}
        floraBuffers={floraBuffers}
        tronconsHydro={tronconsHydro}
        surfacesHydro={surfacesHydro}
        tronconsHydroBuffers={tronconsHydroBuffers}
        surfacesHydroBuffers={surfacesHydroBuffers}
        visible={visible}
      />
    </div>
  );
}
