import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import "./FaunaMapPage.css";
import { zipShapefileToFeatureCollection } from "./faunaShpZip";

const API_BASE = "/api/fauna";
const USER_SHP_SOURCE = "user-shp";
const USER_SHP_CENTROID_SOURCE = "user-shp-centroid";
const DRAW_ZONE_SOURCE = "draw-zone";
const DRAW_BBOX_SOURCE = "draw-bbox-rect";
const SPECIES_PANEL_LIMIT = 150;
const ECO_POINT_COLOR = "#289f01";
/** Seuil mini (degrés) pour accepter un rectangle tracé à la souris. */
const MIN_BBOX_SPAN_DEG = 0.0008;

const PALETTE = [
  "#289f01",
  "#5c6bc0",
  "#ab47bc",
  "#ef5350",
  "#42a5f5",
  "#26a69a",
  "#ffa726",
  "#ff7043",
  "#8d6e63",
  "#ec407a",
  "#7e57c2",
  "#d4e157",
];

type SearchMode = "species" | "all_bbox";

type CatalogTaxon = {
  tax: string;
  protection_nationale?: string | null;
  niveau_patrimonialite?: string | null;
};

type SelectedInfo = { label: string; color: string; bufferM: number };

type AllSpeciesEntry = {
  name: string;
  count: number;
  color: string;
  visible: boolean;
};

type ObservationsPayload = Record<string, unknown>;

const GOLDEN_HUE_STEP = 137.508;

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function bboxLngLatFromFeatureCollection(fc: FeatureCollection): [number, number, number, number] | null {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  let count = 0;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const a = coords[0];
    const c = coords[1];
    if (typeof a === "number" && typeof c === "number") {
      w = Math.min(w, a);
      e = Math.max(e, a);
      s = Math.min(s, c);
      n = Math.max(n, c);
      count++;
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || g.type === "GeometryCollection") continue;
    if ("coordinates" in g) walk(g.coordinates);
  }
  if (count === 0 || !Number.isFinite(w) || !Number.isFinite(s)) return null;
  return [w, s, e, n];
}

function centroidMarkerFromBbox(bbox: [number, number, number, number]): FeatureCollection {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const feature: Feature = {
    type: "Feature",
    properties: { _importCentroid: true },
    geometry: {
      type: "Point",
      coordinates: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    },
  };
  return { type: "FeatureCollection", features: [feature] };
}

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  const ent: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(s).replace(/[&<>"']/g, (c) => ent[c] ?? c);
}

function normalizeForSearch(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function setGeoJSONSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection) {
  const src = map.getSource(sourceId);
  if (src && "setData" in src && typeof (src as maplibregl.GeoJSONSource).setData === "function") {
    (src as maplibregl.GeoJSONSource).setData(data);
  }
}

function buildBufferByTaxon(selected: Map<string, SelectedInfo>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tax, info] of selected) {
    if (info.bufferM > 0) out[tax] = info.bufferM;
  }
  return out;
}

function bboxFromCorners(a: [number, number], b: [number, number]): [number, number, number, number] {
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  return [Math.min(lngA, lngB), Math.min(latA, latB), Math.max(lngA, lngB), Math.max(latA, latB)];
}

function isBboxLargeEnough(bbox: [number, number, number, number]): boolean {
  const [w, s, e, n] = bbox;
  return e - w >= MIN_BBOX_SPAN_DEG && n - s >= MIN_BBOX_SPAN_DEG;
}

function formatBbox(bbox: [number, number, number, number]): string {
  const [w, s, e, n] = bbox;
  return `${w.toFixed(4)}°O · ${s.toFixed(4)}°S → ${e.toFixed(4)}°E · ${n.toFixed(4)}°N`;
}

function bboxRectFC(bbox: [number, number, number, number] | null): FeatureCollection {
  if (!bbox) return emptyFC();
  const [w, s, e, n] = bbox;
  const feature: Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  };
  return { type: "FeatureCollection", features: [feature] };
}

function syncDrawLayers(
  map: MapLibreMap,
  draftBbox: [number, number, number, number] | null,
  validatedBbox: [number, number, number, number] | null,
) {
  if (map.getSource(DRAW_ZONE_SOURCE)) {
    setGeoJSONSourceData(map, DRAW_ZONE_SOURCE, bboxRectFC(draftBbox));
  }
  if (map.getSource(DRAW_BBOX_SOURCE)) {
    setGeoJSONSourceData(map, DRAW_BBOX_SOURCE, bboxRectFC(validatedBbox));
  }
}

/** Couleurs distinctes stables pour N espèces (répartition en spirale dorée sur la roue HSL). */
function buildSpeciesColorMap(names: string[]): Map<string, string> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, "fr"));
  const out = new Map<string, string>();
  sorted.forEach((name, i) => {
    const hue = Math.round((i * GOLDEN_HUE_STEP) % 360);
    const sat = 58 + (i % 4) * 8;
    const light = 38 + (i % 3) * 6;
    out.set(name, `hsl(${hue}, ${sat}%, ${light}%)`);
  });
  return out;
}

function buildAllSpeciesEntries(points: FeatureCollection): Map<string, AllSpeciesEntry> {
  const counts = new Map<string, number>();
  for (const f of points.features) {
    const name = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "—").trim() || "—";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const colors = buildSpeciesColorMap([...counts.keys()]);
  const entries = new Map<string, AllSpeciesEntry>();
  for (const [name, count] of counts) {
    entries.set(name, {
      name,
      count,
      color: colors.get(name) ?? "#888888",
      visible: true,
    });
  }
  return entries;
}

function pointsFcForAllSpecies(
  raw: FeatureCollection,
  entries: Map<string, AllSpeciesEntry>,
): FeatureCollection {
  const features = raw.features
    .filter((f) => {
      const name = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "—").trim() || "—";
      return entries.get(name)?.visible ?? false;
    })
    .map((f) => {
      const props = { ...(f.properties as Record<string, unknown>) };
      const name = String(props.nom_vernaculaire ?? "—").trim() || "—";
      const entry = entries.get(name);
      props._color = entry?.color ?? "#888888";
      return { ...f, properties: props };
    });
  return { type: "FeatureCollection", features };
}

function setMapDrawMode(map: MapLibreMap, enabled: boolean) {
  if (enabled) {
    map.dragPan.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.keyboard.disable();
    map.getCanvas().style.cursor = "crosshair";
  } else {
    map.dragPan.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.keyboard.enable();
    map.getCanvas().style.cursor = "";
  }
}

export default function FaunaMapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shpZipInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExportPayloadRef = useRef<ObservationsPayload | null>(null);
  const allSpeciesRawRef = useRef<FeatureCollection | null>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("species");
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const [speciesCatalog, setSpeciesCatalog] = useState<CatalogTaxon[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [highlightIdx, setHighlightIdx] = useState(-1);

  const [selected, setSelected] = useState(() => new Map<string, SelectedInfo>());
  const [defaultBufferM, setDefaultBufferM] = useState(0);
  const [limitToViewport, setLimitToViewport] = useState(true);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [lastResultCount, setLastResultCount] = useState(0);
  const [shpImportBusy, setShpImportBusy] = useState(false);
  const [shpImportNote, setShpImportNote] = useState("");
  const [shpImportNoteErr, setShpImportNoteErr] = useState(false);

  const [drawActive, setDrawActive] = useState(false);
  const [draftBbox, setDraftBbox] = useState<[number, number, number, number] | null>(null);
  const [hasDraftRect, setHasDraftRect] = useState(false);
  const [validatedBbox, setValidatedBbox] = useState<[number, number, number, number] | null>(null);
  const draftBboxRef = useRef<[number, number, number, number] | null>(null);
  const drawAnchorRef = useRef<[number, number] | null>(null);
  const isDraggingRectRef = useRef(false);
  const drawActiveRef = useRef(false);

  const [allSpeciesEntries, setAllSpeciesEntries] = useState<Map<string, AllSpeciesEntry>>(new Map());
  const [allSpeciesFilterText, setAllSpeciesFilterText] = useState("");

  const setStatusMsg = useCallback((msg: string, isError = false) => {
    setStatus(msg);
    setStatusError(isError);
  }, []);

  const clearBlurTimer = useCallback(() => {
    if (blurCloseTimer.current != null) {
      clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
  }, []);

  const scheduleCloseDropdown = useCallback(() => {
    clearBlurTimer();
    blurCloseTimer.current = setTimeout(() => setSearchFocused(false), 200);
  }, [clearBlurTimer]);

  const openSpeciesDropdown = useCallback(() => {
    clearBlurTimer();
    setSearchFocused(true);
    searchInputRef.current?.focus();
  }, [clearBlurTimer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const r = await fetch(`${API_BASE}/species`);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = (await r.json()) as CatalogTaxon[];
        if (!cancelled) {
          setSpeciesCatalog(data);
          if (data.length === 0) {
            setStatusMsg("Aucune ligne dans ecocompensation.fauna_taxa_ref (colonne tax).", true);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setCatalogError(msg);
          setStatusMsg("Impossible de charger le catalogue d'espèces : " + msg, true);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setStatusMsg]);

  const filteredSuggestions = useMemo(() => {
    if (!speciesCatalog.length) return [];
    const q = normalizeForSearch(searchText.trim());
    if (!q) {
      return speciesCatalog.slice(0, SPECIES_PANEL_LIMIT);
    }
    let pool = speciesCatalog.filter((s) => {
      const haystack = [
        normalizeForSearch(s.tax),
        normalizeForSearch(s.protection_nationale ?? ""),
        normalizeForSearch(s.niveau_patrimonialite ?? ""),
      ].join(" ");
      return haystack.includes(q);
    });
    pool = [...pool].sort((a, b) => a.tax.localeCompare(b.tax, "fr"));
    return pool.slice(0, SPECIES_PANEL_LIMIT);
  }, [speciesCatalog, searchText]);

  useEffect(() => {
    setHighlightIdx(filteredSuggestions.length > 0 ? 0 : -1);
  }, [filteredSuggestions]);

  const fitToData = useCallback((fc: FeatureCollection) => {
    const map = mapRef.current;
    if (!map || !fc.features.length) return;
    const b = new maplibregl.LngLatBounds();
    for (const f of fc.features) {
      if (f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates)) {
        b.extend(f.geometry.coordinates as [number, number]);
      }
    }
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 14 });
  }, []);

  const fitMapToImportedFc = useCallback((map: MapLibreMap, fc: FeatureCollection) => {
    if (!map.isStyleLoaded() || !fc.features.length) return;
    const bbox = bboxLngLatFromFeatureCollection(fc);
    if (!bbox) return;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const lonSpan = maxLng - minLng;
    const latSpan = maxLat - minLat;
    const tiny = lonSpan < 1e-8 && latSpan < 1e-8;
    if (tiny) {
      map.easeTo({ center: [minLng, minLat], zoom: 16, duration: 500 });
      return;
    }
    const padLon = lonSpan < 1e-6 ? 0.002 : 0;
    const padLat = latSpan < 1e-6 ? 0.002 : 0;
    map.fitBounds(
      [
        [minLng - padLon, minLat - padLat],
        [maxLng + padLon, maxLat + padLat],
      ],
      { padding: 64, maxZoom: 18, duration: 600 },
    );
  }, []);

  const clearUserShpImport = useCallback(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource(USER_SHP_SOURCE)) return;
    setGeoJSONSourceData(map, USER_SHP_SOURCE, emptyFC());
    if (map.getSource(USER_SHP_CENTROID_SOURCE)) {
      setGeoJSONSourceData(map, USER_SHP_CENTROID_SOURCE, emptyFC());
    }
    setShpImportNote("");
    setShpImportNoteErr(false);
  }, []);

  const onShpZipSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const map = mapRef.current;
      if (!map?.isStyleLoaded() || !map.getSource(USER_SHP_SOURCE) || !map.getSource(USER_SHP_CENTROID_SOURCE)) {
        setShpImportNote("Carte pas encore prête — réessaie dans un instant.");
        setShpImportNoteErr(true);
        return;
      }
      setShpImportBusy(true);
      setShpImportNote("");
      setShpImportNoteErr(false);
      try {
        const buf = await file.arrayBuffer();
        const fc = await zipShapefileToFeatureCollection(buf);
        setGeoJSONSourceData(map, USER_SHP_SOURCE, fc);
        const bbox = bboxLngLatFromFeatureCollection(fc);
        if (bbox) {
          setGeoJSONSourceData(map, USER_SHP_CENTROID_SOURCE, centroidMarkerFromBbox(bbox));
        } else {
          setGeoJSONSourceData(map, USER_SHP_CENTROID_SOURCE, emptyFC());
        }
        window.setTimeout(() => {
          const m = mapRef.current;
          if (m?.isStyleLoaded()) fitMapToImportedFc(m, fc);
        }, 0);
        setShpImportNote(
          `${file.name} — ${fc.features.length} entité(s), rouge sur la carte + repère central (WGS84 si .prj présent).`,
        );
        setShpImportNoteErr(false);
      } catch (err) {
        setShpImportNote(err instanceof Error ? err.message : String(err));
        setShpImportNoteErr(true);
      } finally {
        setShpImportBusy(false);
      }
    },
    [fitMapToImportedFc],
  );

  const applyAllSpeciesEntriesToMap = useCallback(
    (raw: FeatureCollection, entries: Map<string, AllSpeciesEntry>) => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      const visible = pointsFcForAllSpecies(raw, entries);
      setGeoJSONSourceData(map, "points", visible);
      setGeoJSONSourceData(map, "buffers", emptyFC());
    },
    [],
  );

  const clearAllSpeciesResults = useCallback(() => {
    allSpeciesRawRef.current = null;
    setAllSpeciesEntries(new Map());
    setAllSpeciesFilterText("");
  }, []);

  const applyObservationsToMap = useCallback(
    (
      data: { points?: FeatureCollection; buffers?: FeatureCollection },
      mode: SearchMode,
      selectedMap: Map<string, SelectedInfo>,
      speciesEntries?: Map<string, AllSpeciesEntry>,
    ) => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return 0;

      const points = data.points ?? emptyFC();

      if (mode === "all_bbox" && speciesEntries) {
        applyAllSpeciesEntriesToMap(points, speciesEntries);
        return points.features.length;
      }

      for (const f of points.features) {
        const tax = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "");
        const info = selectedMap.get(tax);
        if (f.properties && typeof f.properties === "object") {
          (f.properties as Record<string, unknown>)._color = info?.color ?? "#888";
        }
      }

      const buffers = data.buffers ?? emptyFC();
      for (const f of buffers.features) {
        const tax = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "");
        const info = selectedMap.get(tax);
        if (f.properties && typeof f.properties === "object") {
          (f.properties as Record<string, unknown>)._color = info?.color ?? ECO_POINT_COLOR;
        }
      }

      setGeoJSONSourceData(map, "points", points);
      setGeoJSONSourceData(map, "buffers", buffers);
      return points.features.length;
    },
    [applyAllSpeciesEntriesToMap],
  );

  const buildPayload = useCallback(
    (mode: SearchMode): ObservationsPayload | null => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return null;

      const payload: ObservationsPayload = {
        date_min: dateMin || null,
        date_max: dateMax || null,
        limit: 20000,
      };

      if (mode === "all_bbox") {
        if (!validatedBbox) return null;
        payload.bbox = validatedBbox;
        payload.buffer_m = 0;
        return payload;
      }

      if (selected.size === 0) return null;

      payload.taxa = [...selected.keys()];
      payload.buffer_m = defaultBufferM;
      const bufByTaxon = buildBufferByTaxon(selected);
      if (Object.keys(bufByTaxon).length > 0) {
        payload.buffer_by_taxon = bufByTaxon;
      }
      if (limitToViewport) {
        const b = map.getBounds();
        payload.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      }
      return payload;
    },
    [selected, defaultBufferM, limitToViewport, dateMin, dateMax, validatedBbox],
  );

  const fetchObservations = useCallback(async (payload: ObservationsPayload) => {
    const r = await fetch(`${API_BASE}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(errBody || "HTTP " + r.status);
    }
    return (await r.json()) as { points?: FeatureCollection; buffers?: FeatureCollection };
  }, []);

  const loadObservations = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      setStatusMsg("Carte en cours de chargement…", true);
      return;
    }
    const payload = buildPayload("species");
    if (!payload) {
      setStatusMsg("Sélectionne au moins une espèce.", true);
      return;
    }

    setLoadBusy(true);
    setStatusMsg("Chargement…", false);

    try {
      const data = await fetchObservations(payload);
      const count = applyObservationsToMap(data, "species", selected);
      lastExportPayloadRef.current = payload;
      setCanExport(count > 0);
      setLastResultCount(count);
      setStatusMsg(`${count} observation(s) chargée(s).`, false);
      if (!limitToViewport) fitToData(data.points ?? emptyFC());
    } catch (err) {
      setCanExport(false);
      setStatusMsg("Erreur : " + (err instanceof Error ? err.message : String(err)), true);
    } finally {
      setLoadBusy(false);
    }
  }, [
    buildPayload,
    fetchObservations,
    applyObservationsToMap,
    selected,
    limitToViewport,
    fitToData,
    setStatusMsg,
  ]);

  const loadAllSpeciesInZone = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      setStatusMsg("Carte en cours de chargement…", true);
      return;
    }
    if (!validatedBbox) {
      setStatusMsg("Trace et valide d'abord une zone (Valider BBOX).", true);
      return;
    }
    const payload = buildPayload("all_bbox");
    if (!payload) return;

    setLoadBusy(true);
    setStatusMsg("Chargement de toutes les espèces dans la zone…", false);

    try {
      const data = await fetchObservations(payload);
      const raw = data.points ?? emptyFC();
      const entries = buildAllSpeciesEntries(raw);
      allSpeciesRawRef.current = raw;
      setAllSpeciesEntries(entries);
      setAllSpeciesFilterText("");
      const count = applyObservationsToMap(data, "all_bbox", selected, entries);
      lastExportPayloadRef.current = payload;
      setCanExport(count > 0);
      setLastResultCount(count);
      const distinct = entries.size;
      setStatusMsg(
        `${count} observation(s) · ${distinct} espèce(s) distincte(s) dans la zone.`,
        false,
      );
    } catch (err) {
      setCanExport(false);
      setStatusMsg("Erreur : " + (err instanceof Error ? err.message : String(err)), true);
    } finally {
      setLoadBusy(false);
    }
  }, [buildPayload, fetchObservations, applyObservationsToMap, selected, validatedBbox, setStatusMsg]);

  const exportObservationsShp = useCallback(async () => {
    const payload = lastExportPayloadRef.current;
    if (!payload) {
      setStatusMsg("Charge d'abord des observations avant d'exporter.", true);
      return;
    }
    setExportBusy(true);
    setStatusMsg("Export shapefile…", false);
    try {
      const r = await fetch(`${API_BASE}/observations/export/shp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const errBody = await r.text();
        throw new Error(errBody || "HTTP " + r.status);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fauna_observations.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(`Export ZIP téléchargé (${lastResultCount} observation(s)).`, false);
    } catch (err) {
      setStatusMsg("Export : " + (err instanceof Error ? err.message : String(err)), true);
    } finally {
      setExportBusy(false);
    }
  }, [lastResultCount, setStatusMsg]);

  const resetDrawZone = useCallback((clearValidated = true) => {
    const map = mapRef.current;
    draftBboxRef.current = null;
    drawAnchorRef.current = null;
    isDraggingRectRef.current = false;
    setDraftBbox(null);
    setHasDraftRect(false);
    setDrawActive(false);
    drawActiveRef.current = false;
    if (clearValidated) setValidatedBbox(null);
    if (map?.isStyleLoaded()) {
      setMapDrawMode(map, false);
      syncDrawLayers(map, null, clearValidated ? null : validatedBbox);
    }
  }, [validatedBbox]);

  const startDrawZone = useCallback(() => {
    resetDrawZone(true);
    setDrawActive(true);
    drawActiveRef.current = true;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) setMapDrawMode(map, true);
    setStatusMsg("Maintiens le clic et tire pour dessiner un rectangle sur la carte.", false);
  }, [resetDrawZone, setStatusMsg]);

  const validateDrawBbox = useCallback(() => {
    const bbox = draftBboxRef.current;
    if (!bbox || !hasDraftRect) {
      setStatusMsg("Trace d'abord un rectangle sur la carte.", true);
      return;
    }
    if (!isBboxLargeEnough(bbox)) {
      setStatusMsg("Rectangle trop petit — trace une zone plus grande.", true);
      return;
    }
    setValidatedBbox(bbox);
    setDrawActive(false);
    drawActiveRef.current = false;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      setMapDrawMode(map, false);
      syncDrawLayers(map, null, bbox);
    }
    setStatusMsg(`BBOX validée — ${formatBbox(bbox)}`, false);
  }, [hasDraftRect, setStatusMsg]);

  const clearMap = useCallback(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    setGeoJSONSourceData(map, "points", emptyFC());
    setGeoJSONSourceData(map, "buffers", emptyFC());
    lastExportPayloadRef.current = null;
    setCanExport(false);
    setLastResultCount(0);
    clearAllSpeciesResults();
    setStatusMsg("", false);
  }, [setStatusMsg, clearAllSpeciesResults]);

  const toggleAllSpeciesVisible = useCallback((name: string, visible: boolean) => {
    setAllSpeciesEntries((prev) => {
      const entry = prev.get(name);
      if (!entry) return prev;
      const next = new Map(prev);
      next.set(name, { ...entry, visible });
      return next;
    });
  }, []);

  const setAllSpeciesVisibleBulk = useCallback((visible: boolean) => {
    setAllSpeciesEntries((prev) => {
      const next = new Map(prev);
      for (const [name, entry] of prev) {
        next.set(name, { ...entry, visible });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const raw = allSpeciesRawRef.current;
    if (!raw || allSpeciesEntries.size === 0) return;
    applyAllSpeciesEntriesToMap(raw, allSpeciesEntries);
  }, [allSpeciesEntries, applyAllSpeciesEntriesToMap]);

  const allSpeciesStats = useMemo(() => {
    const totalObs = lastResultCount;
    const distinctSpecies = allSpeciesEntries.size;
    let visibleObs = 0;
    let visibleSpecies = 0;
    for (const e of allSpeciesEntries.values()) {
      if (e.visible) {
        visibleSpecies++;
        visibleObs += e.count;
      }
    }
    return { totalObs, distinctSpecies, visibleObs, visibleSpecies };
  }, [allSpeciesEntries, lastResultCount]);

  const filteredAllSpeciesList = useMemo(() => {
    const q = normalizeForSearch(allSpeciesFilterText.trim());
    let list = [...allSpeciesEntries.values()];
    if (q) list = list.filter((e) => normalizeForSearch(e.name).includes(q));
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
    return list;
  }, [allSpeciesEntries, allSpeciesFilterText]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-0.58, 44.84],
      zoom: 8,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    mapRef.current = map;

    const onLoad = () => {
      map.addSource("buffers", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "buffers-fill",
        type: "fill",
        source: "buffers",
        paint: {
          "fill-color": ["get", "_color"],
          "fill-opacity": 0.15,
        },
      });
      map.addLayer({
        id: "buffers-line",
        type: "line",
        source: "buffers",
        paint: {
          "line-color": ["get", "_color"],
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource(USER_SHP_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "user-shp-fill",
        type: "fill",
        source: USER_SHP_SOURCE,
        filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
        paint: {
          "fill-color": "#e53935",
          "fill-opacity": 0.28,
          "fill-outline-color": "#b71c1c",
        },
      });
      map.addLayer({
        id: "user-shp-line",
        type: "line",
        source: USER_SHP_SOURCE,
        filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
        paint: {
          "line-color": "#c62828",
          "line-width": 2.5,
        },
      });
      map.addLayer({
        id: "user-shp-circle",
        type: "circle",
        source: USER_SHP_SOURCE,
        filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7, 10, 5, 16, 4],
          "circle-color": "#ff1744",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#3e2723",
        },
      });

      map.addSource(USER_SHP_CENTROID_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "user-shp-centroid-halo",
        type: "circle",
        source: USER_SHP_CENTROID_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 32, 4, 26, 7, 20, 11, 16, 16, 12],
          "circle-color": "#ff5252",
          "circle-opacity": 0.5,
          "circle-blur": 0.5,
        },
      });
      map.addLayer({
        id: "user-shp-centroid-core",
        type: "circle",
        source: USER_SHP_CENTROID_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 4, 12, 7, 9, 11, 7, 16, 6],
          "circle-color": "#b71c1c",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 2, 4, 7, 3, 16, 2],
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addSource(DRAW_ZONE_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-zone-fill",
        type: "fill",
        source: DRAW_ZONE_SOURCE,
        paint: {
          "fill-color": "#85e372",
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: "draw-zone-line",
        type: "line",
        source: DRAW_ZONE_SOURCE,
        paint: {
          "line-color": "#289f01",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });

      map.addSource(DRAW_BBOX_SOURCE, { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "draw-bbox-fill",
        type: "fill",
        source: DRAW_BBOX_SOURCE,
        paint: {
          "fill-color": "#85e372",
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "draw-bbox-line",
        type: "line",
        source: DRAW_BBOX_SOURCE,
        paint: {
          "line-color": "#289f01",
          "line-width": 2.5,
        },
      });

      map.addSource("points", {
        type: "geojson",
        data: emptyFC(),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48,
      });

      map.addLayer({
        id: "points-clusters",
        type: "circle",
        source: "points",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ECO_POINT_COLOR,
          "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 24],
          "circle-opacity": 0.82,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "points-cluster-count",
        type: "symbol",
        source: "points",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 11,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#111111" },
      });

      map.addLayer({
        id: "points-circle",
        type: "circle",
        source: "points",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 7],
          "circle-color": ["get", "_color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "points-circle", (e) => {
        const f = e.features?.[0];
        const p = f?.properties;
        if (!p || typeof p !== "object") return;
        const props = p as Record<string, unknown>;
        const html = `
      <div style="font-size:12px; line-height:1.5; color:#111;">
        <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(props.nom_vernaculaire ?? "—")}</div>
        <div style="color:#4b4b4b;">${escapeHtml(props.nom_taxref ?? "")}</div>
        <hr style="border:none; border-top:1px solid #e8e8e8; margin:6px 0;"/>
        <div><b>Classe:</b> ${escapeHtml(props.classe ?? "—")}</div>
        <div><b>Famille:</b> ${escapeHtml(props.famille ?? "—")}</div>
        <div><b>Date:</b> ${escapeHtml(props.date_debut ?? "—")}</div>
        <div><b>id_obs:</b> ${escapeHtml(props.id_obs ?? "—")}</div>
        <div><b>cd_ref:</b> ${escapeHtml(props.cd_ref ?? "—")}</div>
      </div>`;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });

      map.on("click", "points-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["points-clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("points") as maplibregl.GeoJSONSource;
        if (clusterId == null || !source?.getClusterExpansionZoom) return;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        });
      });

      map.on("mouseenter", "points-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "points-circle", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "points-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "points-clusters", () => {
        map.getCanvas().style.cursor = "";
      });
    };

    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!searchWrapRef.current?.contains(t)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => () => clearBlurTimer(), [clearBlurTimer]);

  useEffect(() => {
    draftBboxRef.current = draftBbox;
  }, [draftBbox]);

  useEffect(() => {
    drawActiveRef.current = drawActive;
  }, [drawActive]);

  useEffect(() => {
    if (searchMode !== "all_bbox") resetDrawZone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset uniquement au changement d'onglet
  }, [searchMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || searchMode !== "all_bbox") return;

    const applyDraft = (bbox: [number, number, number, number] | null) => {
      draftBboxRef.current = bbox;
      setDraftBbox(bbox);
      if (map.isStyleLoaded()) syncDrawLayers(map, bbox, validatedBbox);
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!drawActiveRef.current) return;
      e.preventDefault();
      const anchor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      drawAnchorRef.current = anchor;
      isDraggingRectRef.current = true;
      applyDraft(bboxFromCorners(anchor, anchor));
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!drawActiveRef.current || !isDraggingRectRef.current || !drawAnchorRef.current) return;
      const current: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      applyDraft(bboxFromCorners(drawAnchorRef.current, current));
    };

    const finishDrag = () => {
      if (!isDraggingRectRef.current) return;
      isDraggingRectRef.current = false;
      drawAnchorRef.current = null;
      if (!drawActiveRef.current) return;

      const bbox = draftBboxRef.current;
      if (!bbox || !isBboxLargeEnough(bbox)) {
        applyDraft(null);
        setHasDraftRect(false);
        setStatusMsg("Rectangle trop petit — réessaie en traçant plus grand.", true);
        return;
      }

      setDrawActive(false);
      drawActiveRef.current = false;
      setMapDrawMode(map, false);
      setHasDraftRect(true);
      setStatusMsg("Rectangle tracé — clique sur « Valider BBOX » pour confirmer.", false);
    };

    const onMouseUp = () => finishDrag();
    const onWindowMouseUp = () => finishDrag();

    const onLoad = () => {
      if (drawActiveRef.current) setMapDrawMode(map, true);
    };

    if (map.isStyleLoaded()) onLoad();
    else map.once("load", onLoad);
    if (map.isStyleLoaded() && drawActive) setMapDrawMode(map, true);

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    window.addEventListener("mouseup", onWindowMouseUp);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      window.removeEventListener("mouseup", onWindowMouseUp);
      if (map.isStyleLoaded()) setMapDrawMode(map, false);
    };
  }, [searchMode, drawActive, validatedBbox, setStatusMsg]);

  const addSpecies = useCallback(
    (s: CatalogTaxon) => {
      setSelected((prev) => {
        if (prev.has(s.tax)) return prev;
        const next = new Map(prev);
        const color = PALETTE[next.size % PALETTE.length];
        next.set(s.tax, { label: s.tax, color, bufferM: defaultBufferM });
        return next;
      });
      setSearchText("");
      clearBlurTimer();
      setSearchFocused(true);
      searchInputRef.current?.focus();
    },
    [clearBlurTimer, defaultBufferM],
  );

  const removeSpecies = useCallback((tax: string) => {
    setSelected((prev) => {
      if (!prev.has(tax)) return prev;
      const next = new Map(prev);
      next.delete(tax);
      return next;
    });
  }, []);

  const setSpeciesBuffer = useCallback((tax: string, bufferM: number) => {
    setSelected((prev) => {
      const info = prev.get(tax);
      if (!info) return prev;
      const next = new Map(prev);
      next.set(tax, { ...info, bufferM: Math.max(0, bufferM) });
      return next;
    });
  }, []);

  const dropdownOpen = searchFocused;
  const hasQuery = searchText.trim().length > 0;
  const showPanelContent = catalogLoading || catalogError != null || speciesCatalog.length > 0;

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || !filteredSuggestions.length) {
      if (e.key === "Escape") setSearchFocused(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && filteredSuggestions[highlightIdx]) addSpecies(filteredSuggestions[highlightIdx]);
    } else if (e.key === "Escape") {
      setSearchFocused(false);
    }
  };

  const catalogHint =
    !catalogLoading && !catalogError && speciesCatalog.length > 0
      ? `${speciesCatalog.length} taxon(s) — tape pour filtrer (max. ${SPECIES_PANEL_LIMIT} affichés).`
      : null;

  return (
    <div className="fauna-map-root">
      <aside className="fauna-map-sidebar">
        <div className="fauna-map-sidebar-head">
          <h1>Cartographie Faune</h1>
          <div className="fauna-map-hint">
            Recherche par espèce, ou toutes les observations dans une zone tracée sur la carte.
          </div>
        </div>

        <div className="fauna-map-section">
          <div className="fauna-map-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "species"}
              className={`fauna-map-tab${searchMode === "species" ? " fauna-map-tab--active" : ""}`}
              onClick={() => setSearchMode("species")}
            >
              Par espèce
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchMode === "all_bbox"}
              className={`fauna-map-tab${searchMode === "all_bbox" ? " fauna-map-tab--active" : ""}`}
              onClick={() => setSearchMode("all_bbox")}
            >
              Toutes espèces (zone)
            </button>
          </div>
        </div>

        {searchMode === "species" ? (
          <>
            <div className="fauna-map-section fauna-map-section--accent">
              <label htmlFor="fauna-search">Rechercher une espèce</label>
              {catalogHint && <div className="fauna-map-catalog-hint">{catalogHint}</div>}
              <div ref={searchWrapRef} className="fauna-map-search-wrap">
                <div className="fauna-map-search-row">
                  <input
                    ref={searchInputRef}
                    id="fauna-search"
                    type="text"
                    placeholder="Tape un nom, ou ouvre la liste ▾"
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-controls="fauna-species-listbox"
                    aria-autocomplete="list"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    onFocus={() => {
                      clearBlurTimer();
                      setSearchFocused(true);
                    }}
                    onBlur={scheduleCloseDropdown}
                  />
                  <button
                    type="button"
                    className="ghost fauna-map-search-trigger"
                    title="Afficher la liste des espèces"
                    aria-label="Afficher la liste des espèces"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={openSpeciesDropdown}
                  >
                    ▾
                  </button>
                </div>
                <div
                  id="fauna-species-listbox"
                  role="listbox"
                  className={`fauna-map-suggestions${dropdownOpen && showPanelContent ? " open" : ""}`}
                >
                  {catalogLoading && (
                    <div className="fauna-map-suggestion muted" role="presentation">
                      Chargement du catalogue…
                    </div>
                  )}
                  {!catalogLoading && catalogError && (
                    <div className="fauna-map-suggestion muted error" role="alert">
                      {escapeHtml(catalogError)}
                    </div>
                  )}
                  {!catalogLoading && !catalogError && speciesCatalog.length === 0 && (
                    <div className="fauna-map-suggestion muted" role="presentation">
                      Aucune espèce disponible.
                    </div>
                  )}
                  {!catalogLoading &&
                    !catalogError &&
                    speciesCatalog.length > 0 &&
                    hasQuery &&
                    filteredSuggestions.length === 0 && (
                      <div className="fauna-map-suggestion muted" role="presentation">
                        Aucune espèce ne correspond à « {escapeHtml(searchText.trim())} ».
                      </div>
                    )}
                  {!catalogLoading &&
                    !catalogError &&
                    filteredSuggestions.map((s, i) => (
                      <div
                        key={s.tax}
                        role="option"
                        aria-selected={i === highlightIdx}
                        className={`fauna-map-suggestion${i === highlightIdx ? " active" : ""}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSpecies(s)}
                      >
                        {escapeHtml(s.tax)}{" "}
                        <span className="sub">
                          {escapeHtml(s.protection_nationale ?? "")} · {escapeHtml(s.niveau_patrimonialite ?? "")}
                        </span>
                      </div>
                    ))}
                  {!catalogLoading && !catalogError && speciesCatalog.length > SPECIES_PANEL_LIMIT && !hasQuery && (
                    <div className="fauna-map-suggestion muted" role="presentation">
                      … {speciesCatalog.length - SPECIES_PANEL_LIMIT} espèce(s) de plus : tape pour affiner.
                    </div>
                  )}
                </div>
              </div>

              {selected.size > 0 && (
                <div className="fauna-map-chips">
                  {[...selected.entries()].map(([tax, info]) => (
                    <div key={tax} className="fauna-map-chip-row">
                      <span className="fauna-map-chip-main fauna-map-chip">
                        <span className="swatch" style={{ background: info.color }} />
                        {escapeHtml(info.label)}
                        <button type="button" title="Retirer" onClick={() => removeSpecies(tax)}>
                          ×
                        </button>
                      </span>
                      <label className="fauna-map-chip-buffer">
                        Buffer
                        <input
                          type="number"
                          min={0}
                          max={50000}
                          step={50}
                          value={info.bufferM}
                          onChange={(e) => setSpeciesBuffer(tax, parseInt(e.target.value, 10) || 0)}
                          title="Buffer en mètres pour cette espèce (0 = aucun)"
                        />
                        m
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fauna-map-section">
              <label htmlFor="fauna-default-buffer">Buffer par défaut (nouvelles espèces)</label>
              <div className="fauna-map-range-wrap">
                <input
                  id="fauna-default-buffer"
                  type="range"
                  min={0}
                  max={5000}
                  step={50}
                  value={defaultBufferM}
                  onChange={(e) => setDefaultBufferM(parseInt(e.target.value, 10))}
                />
                <span className="fauna-map-range-val">{defaultBufferM} m</span>
              </div>
            </div>

            <div className="fauna-map-section">
              <label className="fauna-map-check-row">
                <input
                  type="checkbox"
                  checked={limitToViewport}
                  onChange={(e) => setLimitToViewport(e.target.checked)}
                />
                <span>Limiter la requête à la vue de la carte</span>
              </label>
            </div>
          </>
        ) : (
          <div className="fauna-map-section fauna-map-section--accent">
            <span>Zone de recherche (rectangle)</span>
            <div className="fauna-map-hint">
              Clique sur « Tracer la zone », puis maintiens le clic sur la carte et tire pour dessiner un rectangle
              (bbox). Valide avant de charger — pas de buffer, uniquement les points d'observation.
            </div>

            <div className="fauna-map-draw-actions">
              <button
                type="button"
                className={drawActive ? "primary" : "ghost"}
                disabled={drawActive}
                onClick={startDrawZone}
              >
                {drawActive ? "Trace le rectangle…" : "Tracer la zone"}
              </button>
              <button type="button" className="ghost" onClick={() => resetDrawZone(true)}>
                Effacer
              </button>
            </div>

            {drawActive && (
              <div className="fauna-map-draw-hint">
                Maintiens le clic et tire pour dessiner le rectangle. Relâche pour terminer.
              </div>
            )}

            {hasDraftRect && !validatedBbox && !drawActive && (
              <button type="button" className="primary" onClick={validateDrawBbox}>
                Valider BBOX
              </button>
            )}

            {validatedBbox && (
              <div className="fauna-map-bbox-validated">
                <span className="fauna-map-bbox-label">BBOX validée</span>
                <span className="fauna-map-bbox-coords">{formatBbox(validatedBbox)}</span>
              </div>
            )}

            <button
              type="button"
              className="primary"
              disabled={loadBusy || !validatedBbox}
              onClick={() => void loadAllSpeciesInZone()}
            >
              Charger toutes les espèces
            </button>

            {allSpeciesEntries.size > 0 && (
              <>
                <div className="fauna-map-stats">
                  <div className="fauna-map-stat">
                    <span className="fauna-map-stat-value">{allSpeciesStats.totalObs.toLocaleString("fr-FR")}</span>
                    <span className="fauna-map-stat-label">Observations</span>
                  </div>
                  <div className="fauna-map-stat">
                    <span className="fauna-map-stat-value">{allSpeciesStats.distinctSpecies.toLocaleString("fr-FR")}</span>
                    <span className="fauna-map-stat-label">Espèces distinctes</span>
                  </div>
                  <div className="fauna-map-stat">
                    <span className="fauna-map-stat-value">{allSpeciesStats.visibleObs.toLocaleString("fr-FR")}</span>
                    <span className="fauna-map-stat-label">Affichées</span>
                  </div>
                </div>

                <div className="fauna-map-species-filter">
                  <div className="fauna-map-species-filter-head">
                    <span>Filtrer par espèce</span>
                    <div className="fauna-map-species-filter-bulk">
                      <button type="button" className="ghost" onClick={() => setAllSpeciesVisibleBulk(true)}>
                        Tout cocher
                      </button>
                      <button type="button" className="ghost" onClick={() => setAllSpeciesVisibleBulk(false)}>
                        Tout décocher
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="fauna-map-species-filter-search"
                    placeholder="Rechercher une espèce…"
                    value={allSpeciesFilterText}
                    onChange={(e) => setAllSpeciesFilterText(e.target.value)}
                  />
                  <div className="fauna-map-species-filter-list" role="list">
                    {filteredAllSpeciesList.map((entry) => (
                      <label key={entry.name} className="fauna-map-species-filter-row" role="listitem">
                        <input
                          type="checkbox"
                          checked={entry.visible}
                          onChange={(e) => toggleAllSpeciesVisible(entry.name, e.target.checked)}
                        />
                        <span className="swatch" style={{ background: entry.color }} />
                        <span className="fauna-map-species-filter-name">{escapeHtml(entry.name)}</span>
                        <span className="fauna-map-species-filter-count">{entry.count}</span>
                      </label>
                    ))}
                    {filteredAllSpeciesList.length === 0 && (
                      <div className="fauna-map-species-filter-empty">Aucune espèce ne correspond.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="fauna-map-section">
          <span>Période (optionnel)</span>
          <div className="fauna-map-row">
            <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} />
            <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} />
          </div>
        </div>

        <div className="fauna-map-section">
          <span>Comparaison — shapefile (ZIP)</span>
          <div className="fauna-map-hint fauna-map-shp-hint">
            ZIP avec .shp, .shx, .dbf, idéalement .prj. Géométrie en rouge sur la carte.
          </div>
          <input
            ref={shpZipInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            aria-label="Choisir un fichier ZIP contenant un shapefile"
            onChange={(e) => void onShpZipSelected(e)}
          />
          <div className="fauna-map-row fauna-map-shp-actions">
            <button
              type="button"
              className="ghost"
              disabled={shpImportBusy}
              onClick={() => shpZipInputRef.current?.click()}
            >
              {shpImportBusy ? "Lecture du ZIP…" : "Importer un shapefile"}
            </button>
            <button type="button" className="ghost" onClick={clearUserShpImport}>
              Retirer
            </button>
          </div>
          {shpImportNote ? (
            <div className={`fauna-map-status fauna-map-shp-note${shpImportNoteErr ? " error" : ""}`}>
              {shpImportNote}
            </div>
          ) : null}
        </div>

        <div className="fauna-map-section">
          <div className="fauna-map-actions">
            {searchMode === "species" && (
              <button type="button" className="primary" disabled={loadBusy} onClick={() => void loadObservations()}>
                Charger les observations
              </button>
            )}
            <button
              type="button"
              className="ghost"
              disabled={!canExport || exportBusy}
              onClick={() => void exportObservationsShp()}
              title="Télécharge un ZIP shapefile avec tous les attributs de la table fauna"
            >
              {exportBusy ? "Export en cours…" : "Exporter en shapefile (ZIP)"}
            </button>
            <button type="button" className="ghost" onClick={clearMap}>
              Effacer la carte
            </button>
          </div>
          <div className={`fauna-map-status${statusError ? " error" : ""}`}>{status}</div>
        </div>
      </aside>

      <div className="fauna-map-map-wrap">
        <div ref={mapContainerRef} className="fauna-map-map" />
        {(loadBusy || exportBusy) && (
          <div className="fauna-map-loader-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="fauna-map-hourglass-spinner" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
                <path d="M6 2h12v3l-4.5 5.5L18 16v6H6v-6l4.5-5.5L6 5V2zm2 2v.8L11 9.2v1.6L8 15.2V18h8v-2.8l-3-4.4V9.2L16 4.8V4H8z" />
              </svg>
            </div>
            <span className="fauna-map-loader-label">
              {exportBusy ? "Export en cours…" : "Chargement des observations…"}
            </span>
          </div>
        )}
        {drawActive && (
          <div className="fauna-map-draw-overlay" role="status">
            Mode tracé — maintiens le clic et tire pour dessiner le rectangle
          </div>
        )}
        {selected.size > 0 && searchMode === "species" && (
          <div className="fauna-map-legend">
            {[...selected.entries()].map(([tax, info]) => (
              <div key={tax} className="fauna-map-legend-row">
                <span className="swatch" style={{ background: info.color }} />
                <span>
                  {escapeHtml(info.label)}
                  {info.bufferM > 0 ? ` (${info.bufferM} m)` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
