import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";

import { zipShapefileToFeatureCollection } from "./faunaShpZip";
import { addFaunaDrawLayers, addFaunaLayers, addFaunaObservationLayers, bindFaunaPointInteractions } from "./faunaMapLayers";
import {
  API_BASE,
  DEFAULT_RADIUS_KM,
  DRAW_ZONE_SOURCE,
  FAUNA_BUFFERS_SOURCE,
  FAUNA_COLOR_PROP,
  FAUNA_POINTS_SOURCE,
  PALETTE,
  SPECIES_PANEL_LIMIT,
  USER_SHP_CENTROID_SOURCE,
  USER_SHP_SOURCE,
  type AllSpeciesEntry,
  type CatalogTaxon,
  type DrawTool,
  type ExtentKind,
  type ObservationsPayload,
  type SearchMode,
  type SelectedInfo,
  bboxFromCorners,
  bboxLngLatFromFeatureCollection,
  buildAllSpeciesEntries,
  buffersFromPoints,
  centroidMarkerFromBbox,
  clampRadiusKm,
  emptyFC,
  formatBbox,
  formatPoint,
  formatRadiusKm,
  isBboxLargeEnough,
  lngLatFromClient,
  normalizeForSearch,
  pointsFcForAllSpecies,
  raiseFaunaLayers,
  radiusCircleFC,
  setFaunaLayersVisible,
  setGeoJSONSourceData,
  setMapDrawMode,
  syncExtentLayers,
} from "./faunaMapShared";

export type UseFaunaQueryOptions = {
  mapRef: RefObject<MapLibreMap | null>;
  mapReady: boolean;
  enableShapefile?: boolean;
  autoDrawBbox?: boolean;
};

export function useFaunaQuery({ mapRef, mapReady, enableShapefile = false, autoDrawBbox = false }: UseFaunaQueryOptions) {
  const shpZipInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExportPayloadRef = useRef<ObservationsPayload | null>(null);
  const allSpeciesRawRef = useRef<FeatureCollection | null>(null);
  const speciesPointsRef = useRef<FeatureCollection | null>(null);
  const drawActiveRef = useRef(autoDrawBbox);
  const drawToolRef = useRef<DrawTool>("bbox");
  const radiusKmRef = useRef(DEFAULT_RADIUS_KM);
  const draftBboxRef = useRef<[number, number, number, number] | null>(null);
  const drawAnchorRef = useRef<[number, number] | null>(null);
  const isDraggingRectRef = useRef(false);
  const layersBoundRef = useRef(false);
  const validatedBboxRef = useRef<[number, number, number, number] | null>(null);
  const searchPointRef = useRef<[number, number] | null>(null);
  const extentKindRef = useRef<ExtentKind>("bbox");

  const [searchMode, setSearchMode] = useState<SearchMode>("species");
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [speciesCatalog, setSpeciesCatalog] = useState<CatalogTaxon[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [selected, setSelected] = useState(() => new Map<string, SelectedInfo>());
  const [extentKind, setExtentKind] = useState<ExtentKind>("bbox");
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
  const [drawActive, setDrawActive] = useState(autoDrawBbox);
  const [drawTool, setDrawTool] = useState<DrawTool>("bbox");
  const [draftBbox, setDraftBbox] = useState<[number, number, number, number] | null>(null);
  const [hasDraftRect, setHasDraftRect] = useState(false);
  const [validatedBbox, setValidatedBbox] = useState<[number, number, number, number] | null>(null);
  const [searchPoint, setSearchPoint] = useState<[number, number] | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [allSpeciesEntries, setAllSpeciesEntries] = useState<Map<string, AllSpeciesEntry>>(new Map());
  const [allSpeciesFilterText, setAllSpeciesFilterText] = useState("");
  const [obsVisible, setObsVisible] = useState(true);

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
    if (!q) return speciesCatalog.slice(0, SPECIES_PANEL_LIMIT);
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
  }, [mapRef]);

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
  }, [mapRef]);

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
        if (bbox) setGeoJSONSourceData(map, USER_SHP_CENTROID_SOURCE, centroidMarkerFromBbox(bbox));
        else setGeoJSONSourceData(map, USER_SHP_CENTROID_SOURCE, emptyFC());
        window.setTimeout(() => {
          const m = mapRef.current;
          if (m?.isStyleLoaded()) fitMapToImportedFc(m, fc);
        }, 0);
        setShpImportNote(`${file.name} — ${fc.features.length} entité(s).`);
        setShpImportNoteErr(false);
      } catch (err) {
        setShpImportNote(err instanceof Error ? err.message : String(err));
        setShpImportNoteErr(true);
      } finally {
        setShpImportBusy(false);
      }
    },
    [fitMapToImportedFc, mapRef],
  );

  const applyAllSpeciesEntriesToMap = useCallback(
    (raw: FeatureCollection, entries: Map<string, AllSpeciesEntry>) => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      addFaunaObservationLayers(map);
      const visible = pointsFcForAllSpecies(raw, entries);
      setGeoJSONSourceData(map, FAUNA_POINTS_SOURCE, visible);
      setGeoJSONSourceData(map, FAUNA_BUFFERS_SOURCE, emptyFC());
      raiseFaunaLayers(map);
    },
    [mapRef],
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
      addFaunaObservationLayers(map);
      const points = data.points ?? emptyFC();

      if (mode === "all_bbox" && speciesEntries) {
        speciesPointsRef.current = null;
        applyAllSpeciesEntriesToMap(points, speciesEntries);
        return points.features.length;
      }

      for (const f of points.features) {
        const props =
          f.properties && typeof f.properties === "object"
            ? ({ ...f.properties } as Record<string, unknown>)
            : {};
        const tax = String(props.nom_vernaculaire ?? "");
        const info = selectedMap.get(tax);
        props[FAUNA_COLOR_PROP] = info?.color ?? "#888888";
        f.properties = props;
      }

      speciesPointsRef.current = points;
      const buffers = buffersFromPoints(points, selectedMap);
      setGeoJSONSourceData(map, FAUNA_POINTS_SOURCE, points);
      setGeoJSONSourceData(map, FAUNA_BUFFERS_SOURCE, buffers);
      raiseFaunaLayers(map);
      return points.features.length;
    },
    [applyAllSpeciesEntriesToMap, mapRef],
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

      const applyDrawnExtent = (): boolean => {
        if (extentKind === "point") {
          if (!searchPoint) return false;
          payload.center = searchPoint;
          payload.radius_m = Math.round(radiusKm * 1000);
          return true;
        }
        if (extentKind === "bbox") {
          if (!validatedBbox) return false;
          payload.bbox = validatedBbox;
          return true;
        }
        return false;
      };

      if (mode === "all_bbox") {
        payload.buffer_m = 0;
        if (!applyDrawnExtent()) return null;
        return payload;
      }

      if (selected.size === 0) return null;
      payload.taxa = [...selected.keys()];
      payload.buffer_m = 0;
      if (extentKind === "viewport") {
        const b = map.getBounds();
        payload.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      } else if (extentKind === "bbox" || extentKind === "point") {
        if (!applyDrawnExtent()) return null;
      }
      return payload;
    },
    [selected, extentKind, dateMin, dateMax, validatedBbox, searchPoint, radiusKm, mapRef],
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
      if (selected.size === 0) setStatusMsg("Sélectionne au moins une espèce.", true);
      else if (extentKind === "bbox") setStatusMsg("Trace et valide d'abord un rectangle (Valider BBOX).", true);
      else if (extentKind === "point") setStatusMsg("Place d'abord un point sur la carte.", true);
      else setStatusMsg("Impossible de construire la requête.", true);
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
      setObsVisible(true);
      setFaunaLayersVisible(map, true);
      setStatusMsg(`${count} observation(s) chargée(s).`, false);
      if (extentKind === "none") fitToData(data.points ?? emptyFC());
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
    extentKind,
    fitToData,
    setStatusMsg,
    mapRef,
  ]);

  const loadAllSpeciesInZone = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      setStatusMsg("Carte en cours de chargement…", true);
      return;
    }
    if (extentKind === "point") {
      if (!searchPoint) {
        setStatusMsg("Place d'abord un point sur la carte.", true);
        return;
      }
    } else if (!validatedBbox) {
      setStatusMsg("Trace et valide d'abord une zone (Valider BBOX).", true);
      return;
    }
    const payload = buildPayload("all_bbox");
    if (!payload) return;

    setLoadBusy(true);
    setStatusMsg(
      extentKind === "point"
        ? `Chargement de toutes les espèces dans un rayon de ${formatRadiusKm(radiusKm)}…`
        : "Chargement de toutes les espèces dans la zone…",
      false,
    );

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
      setObsVisible(true);
      setFaunaLayersVisible(map, true);
      setStatusMsg(`${count} observation(s) · ${entries.size} espèce(s) distincte(s) dans la zone.`, false);
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
    validatedBbox,
    searchPoint,
    extentKind,
    radiusKm,
    setStatusMsg,
    mapRef,
  ]);

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

  const resetDrawZone = useCallback(
    (clearValidated = true) => {
      const map = mapRef.current;
      draftBboxRef.current = null;
      drawAnchorRef.current = null;
      isDraggingRectRef.current = false;
      setDraftBbox(null);
      setHasDraftRect(false);
      setDrawActive(false);
      drawActiveRef.current = false;
      if (clearValidated) {
        setValidatedBbox(null);
        setSearchPoint(null);
      }
      if (map?.isStyleLoaded()) {
        setMapDrawMode(map, false);
        syncExtentLayers(map, {
          draftBbox: null,
          validatedBbox: clearValidated ? null : validatedBbox,
          searchPoint: clearValidated ? null : searchPoint,
          radiusKm,
          extentKind,
          drawActive: false,
          drawTool,
        });
      }
    },
    [validatedBbox, searchPoint, radiusKm, extentKind, drawTool, mapRef],
  );

  const startDrawZone = useCallback(() => {
    resetDrawZone(true);
    setExtentKind("bbox");
    setDrawTool("bbox");
    drawToolRef.current = "bbox";
    setDrawActive(true);
    drawActiveRef.current = true;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      addFaunaDrawLayers(map);
      setMapDrawMode(map, true);
    }
    setStatusMsg("", false);
  }, [resetDrawZone, setStatusMsg, mapRef]);

  const startPlacePoint = useCallback(() => {
    resetDrawZone(true);
    setExtentKind("point");
    setDrawTool("point");
    drawToolRef.current = "point";
    setDrawActive(true);
    drawActiveRef.current = true;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      addFaunaDrawLayers(map);
      setMapDrawMode(map, true);
    }
    setStatusMsg("", false);
  }, [resetDrawZone, setStatusMsg, mapRef]);

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
    setSearchPoint(null);
    setDrawActive(false);
    drawActiveRef.current = false;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      setMapDrawMode(map, false);
      syncExtentLayers(map, {
        draftBbox: null,
        validatedBbox: bbox,
        searchPoint: null,
        radiusKm,
        extentKind: "bbox",
        drawActive: false,
        drawTool: "bbox",
      });
    }
    setStatusMsg(`BBOX validée — ${formatBbox(bbox)}`, false);
  }, [hasDraftRect, radiusKm, setStatusMsg, mapRef]);

  const clearMap = useCallback(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    setGeoJSONSourceData(map, FAUNA_POINTS_SOURCE, emptyFC());
    setGeoJSONSourceData(map, FAUNA_BUFFERS_SOURCE, emptyFC());
    lastExportPayloadRef.current = null;
    setCanExport(false);
    setLastResultCount(0);
    speciesPointsRef.current = null;
    clearAllSpeciesResults();
    setStatusMsg("", false);
  }, [setStatusMsg, clearAllSpeciesResults, mapRef]);

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
      for (const [name, entry] of prev) next.set(name, { ...entry, visible });
      return next;
    });
  }, []);

  const toggleObsVisible = useCallback(() => {
    setObsVisible((prev) => {
      const next = !prev;
      const map = mapRef.current;
      if (map?.isStyleLoaded()) setFaunaLayersVisible(map, next);
      return next;
    });
  }, [mapRef]);

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
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    if (layersBoundRef.current) {
      addFaunaLayers(map, { shapefile: enableShapefile });
      raiseFaunaLayers(map);
      return;
    }
    addFaunaLayers(map, { shapefile: enableShapefile });
    const unbind = bindFaunaPointInteractions(map, () => drawActiveRef.current);
    layersBoundRef.current = true;
    return () => {
      unbind();
      layersBoundRef.current = false;
    };
  }, [mapReady, mapRef, enableShapefile]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!searchWrapRef.current?.contains(t)) setSearchFocused(false);
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
    drawToolRef.current = drawTool;
  }, [drawTool]);
  useEffect(() => {
    radiusKmRef.current = radiusKm;
  }, [radiusKm]);
  useEffect(() => {
    validatedBboxRef.current = validatedBbox;
  }, [validatedBbox]);
  useEffect(() => {
    searchPointRef.current = searchPoint;
  }, [searchPoint]);
  useEffect(() => {
    extentKindRef.current = extentKind;
  }, [extentKind]);

  useEffect(() => {
    if (searchMode === "all_bbox" && (extentKind === "viewport" || extentKind === "none")) {
      startDrawZone();
    }
  }, [searchMode, extentKind, startDrawZone]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    syncExtentLayers(map, {
      draftBbox,
      validatedBbox,
      searchPoint,
      radiusKm,
      extentKind,
      drawActive,
      drawTool,
    });
  }, [draftBbox, validatedBbox, searchPoint, radiusKm, extentKind, drawActive, drawTool, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded()) return;
    setMapDrawMode(map, drawActive);
  }, [drawActive, mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const el = map.getCanvasContainer();

    const applyDraft = (bbox: [number, number, number, number] | null) => {
      if (!map.getSource(DRAW_ZONE_SOURCE)) addFaunaDrawLayers(map);
      draftBboxRef.current = bbox;
      setDraftBbox(bbox);
      if (map.isStyleLoaded()) {
        syncExtentLayers(map, {
          draftBbox: bbox,
          validatedBbox: null,
          searchPoint: searchPointRef.current,
          radiusKm: radiusKmRef.current,
          extentKind: extentKindRef.current,
          drawActive: true,
          drawTool: "bbox",
        });
      }
    };

    const onDown = (ev: PointerEvent) => {
      if (!drawActiveRef.current || drawToolRef.current !== "bbox") return;
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.(".maplibregl-ctrl")) return;
      ev.preventDefault();
      const anchor = lngLatFromClient(map, ev.clientX, ev.clientY);
      drawAnchorRef.current = anchor;
      isDraggingRectRef.current = true;
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      applyDraft(bboxFromCorners(anchor, anchor));
    };

    const onMove = (ev: PointerEvent) => {
      if (!isDraggingRectRef.current || !drawAnchorRef.current) return;
      if (!drawActiveRef.current || drawToolRef.current !== "bbox") return;
      applyDraft(bboxFromCorners(drawAnchorRef.current, lngLatFromClient(map, ev.clientX, ev.clientY)));
    };

    const finishDrag = () => {
      if (!isDraggingRectRef.current) return;
      isDraggingRectRef.current = false;
      drawAnchorRef.current = null;
      if (!drawActiveRef.current || drawToolRef.current !== "bbox") return;
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
      if (map.isStyleLoaded()) {
        syncExtentLayers(map, {
          draftBbox: bbox,
          validatedBbox: null,
          searchPoint: searchPointRef.current,
          radiusKm: radiusKmRef.current,
          extentKind: "bbox",
          drawActive: false,
          drawTool: "bbox",
        });
      }
      setStatusMsg("Rectangle tracé — clique sur « Valider BBOX » pour confirmer.", false);
    };

    const onUp = (ev: PointerEvent) => {
      if (!isDraggingRectRef.current) return;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      finishDrag();
    };

    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      if (!drawActiveRef.current || drawToolRef.current !== "point") return;
      e.preventDefault();
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setSearchPoint(pt);
      setValidatedBbox(null);
      setDrawActive(false);
      drawActiveRef.current = false;
      setMapDrawMode(map, false);
      const circle = radiusCircleFC(pt, radiusKmRef.current);
      if (map.isStyleLoaded()) {
        syncExtentLayers(map, {
          draftBbox: null,
          validatedBbox: null,
          searchPoint: pt,
          radiusKm: radiusKmRef.current,
          extentKind: "point",
          drawActive: false,
          drawTool: "point",
        });
        const circleBbox = bboxLngLatFromFeatureCollection(circle);
        if (circleBbox) {
          const [w, s, east, n] = circleBbox;
          map.fitBounds(
            [
              [w, s],
              [east, n],
            ],
            { padding: 56, maxZoom: 14, duration: 500 },
          );
        }
      }
      setStatusMsg(`Point placé (${formatPoint(pt)}) — rayon ${formatRadiusKm(radiusKmRef.current)}.`, false);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    map.on("click", onPointClick);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      map.off("click", onPointClick);
    };
  }, [mapReady, mapRef, setStatusMsg]);

  const addSpecies = useCallback(
    (s: CatalogTaxon) => {
      setSelected((prev) => {
        if (prev.has(s.tax)) return prev;
        const next = new Map(prev);
        next.set(s.tax, { label: s.tax, color: PALETTE[next.size % PALETTE.length], bufferM: 0 });
        return next;
      });
      setSearchText("");
      clearBlurTimer();
      setSearchFocused(true);
      searchInputRef.current?.focus();
    },
    [clearBlurTimer],
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

  useEffect(() => {
    if (searchMode !== "species" || !speciesPointsRef.current) return;
    const points = speciesPointsRef.current;
    const t = window.setTimeout(() => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      setGeoJSONSourceData(map, FAUNA_BUFFERS_SOURCE, buffersFromPoints(points, selected));
    }, 80);
    return () => window.clearTimeout(t);
  }, [selected, searchMode, mapRef]);

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

  const onSelectExtent = (kind: ExtentKind) => {
    if (kind === "bbox") {
      startDrawZone();
      return;
    }
    setExtentKind(kind);
    setDrawActive(false);
    drawActiveRef.current = false;
    const map = mapRef.current;
    if (map?.isStyleLoaded()) setMapDrawMode(map, false);
  };

  return {
    searchMode,
    setSearchMode,
    searchText,
    setSearchText,
    searchFocused,
    speciesCatalog,
    catalogLoading,
    catalogError,
    highlightIdx,
    selected,
    extentKind,
    dateMin,
    setDateMin,
    dateMax,
    setDateMax,
    status,
    statusError,
    loadBusy,
    exportBusy,
    canExport,
    lastResultCount,
    shpImportBusy,
    shpImportNote,
    shpImportNoteErr,
    drawActive,
    drawTool,
    hasDraftRect,
    validatedBbox,
    searchPoint,
    radiusKm,
    setRadiusKm,
    allSpeciesEntries,
    allSpeciesFilterText,
    setAllSpeciesFilterText,
    allSpeciesStats,
    filteredAllSpeciesList,
    obsVisible,
    dropdownOpen,
    hasQuery,
    showPanelContent,
    filteredSuggestions,
    searchInputRef,
    searchWrapRef,
    shpZipInputRef,
    addSpecies,
    removeSpecies,
    setSpeciesBuffer,
    onSearchKeyDown,
    onSelectExtent,
    startDrawZone,
    startPlacePoint,
    resetDrawZone,
    validateDrawBbox,
    loadObservations,
    loadAllSpeciesInZone,
    exportObservationsShp,
    clearMap,
    toggleAllSpeciesVisible,
    setAllSpeciesVisibleBulk,
    toggleObsVisible,
    onShpZipSelected,
    clearUserShpImport,
    clearBlurTimer,
    scheduleCloseDropdown,
    setSearchFocused,
    isDrawing: () => drawActiveRef.current,
  };
}

export type FaunaQueryApi = ReturnType<typeof useFaunaQuery>;
