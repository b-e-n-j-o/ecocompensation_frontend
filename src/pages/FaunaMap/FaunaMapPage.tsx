import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import "./FaunaMapPage.css";
import { zipShapefileToFeatureCollection } from "./faunaShpZip";

const API_BASE = "/api/fauna";
/** Source GeoJSON pour un shapefile importé (ZIP), affiché sous les observations. */
const USER_SHP_SOURCE = "user-shp";
/** Point au centre de l’emprise importée (visible même fort dézoomé). */
const USER_SHP_CENTROID_SOURCE = "user-shp-centroid";
/** Nombre max de lignes affichées dans le panneau (filtre instantané sur le catalogue en mémoire). */
const SPECIES_PANEL_LIMIT = 150;

const PALETTE = [
  "#ef5350",
  "#ab47bc",
  "#5c6bc0",
  "#42a5f5",
  "#26a69a",
  "#66bb6a",
  "#d4e157",
  "#ffa726",
  "#ff7043",
  "#8d6e63",
  "#ec407a",
  "#7e57c2",
];

type CatalogTaxon = {
  tax: string;
  protection_nationale?: string | null;
  niveau_patrimonialite?: string | null;
};

type SelectedInfo = { label: string; color: string };

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** Bbox WGS84 [ouest, sud, est, nord] ou null si aucune coordonnée exploitable. */
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

/** Marqueur unique au centre de la bbox (repère si la géométrie est petite). */
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

/** Filtre insensible à la casse et aux accents latins courants (côté client). */
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

export default function FaunaMapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shpZipInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const [speciesCatalog, setSpeciesCatalog] = useState<CatalogTaxon[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [highlightIdx, setHighlightIdx] = useState(-1);

  const [selected, setSelected] = useState(() => new Map<string, SelectedInfo>());
  const [bufferM, setBufferM] = useState(500);
  const [limitToViewport, setLimitToViewport] = useState(false);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [shpImportBusy, setShpImportBusy] = useState(false);
  const [shpImportNote, setShpImportNote] = useState("");
  const [shpImportNoteErr, setShpImportNoteErr] = useState(false);

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

  const fitMapToImportedFc = useCallback(
    (map: MapLibreMap, fc: FeatureCollection) => {
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
    },
    [],
  );

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
        // Reporter le cadrage après que la source ait pris en compte les données (évite fitBounds no-op).
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

  const loadObservations = useCallback(async () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      setStatusMsg("Carte en cours de chargement…", true);
      return;
    }
    if (selected.size === 0) {
      setStatusMsg("Sélectionne au moins une espèce.", true);
      return;
    }
    setLoadBusy(true);
    setStatusMsg("Chargement…", false);

    const payload: Record<string, unknown> = {
      taxa: [...selected.keys()],
      buffer_m: bufferM,
      date_min: dateMin || null,
      date_max: dateMax || null,
      limit: 20000,
    };
    if (limitToViewport) {
      const b = map.getBounds();
      payload.bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }

    try {
      const r = await fetch(`${API_BASE}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = (await r.json()) as { points?: FeatureCollection; buffers?: FeatureCollection };

      const points = data.points ?? emptyFC();
      for (const f of points.features) {
        const tax = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "");
        const info = selected.get(tax);
        if (f.properties && typeof f.properties === "object") {
          (f.properties as Record<string, unknown>)._color = info?.color ?? "#888";
        }
      }
      const buffers = data.buffers ?? emptyFC();
      for (const f of buffers.features) {
        const tax = String((f.properties as Record<string, unknown> | undefined)?.nom_vernaculaire ?? "");
        const info = selected.get(tax);
        if (f.properties && typeof f.properties === "object") {
          (f.properties as Record<string, unknown>)._color = info?.color ?? "#888";
        }
      }

      setGeoJSONSourceData(map, "points", points);
      setGeoJSONSourceData(map, "buffers", buffers);

      setStatusMsg(`${points.features.length} observation(s) chargée(s).`, false);
      if (!limitToViewport) fitToData(points);
    } catch (err) {
      setStatusMsg("Erreur : " + (err instanceof Error ? err.message : String(err)), true);
    } finally {
      setLoadBusy(false);
    }
  }, [selected, bufferM, dateMin, dateMax, limitToViewport, fitToData, setStatusMsg]);

  const clearMap = useCallback(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    setGeoJSONSourceData(map, "points", emptyFC());
    setGeoJSONSourceData(map, "buffers", emptyFC());
    setStatusMsg("", false);
  }, [setStatusMsg]);

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

      map.addSource("points", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "points-circle",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 7],
          "circle-color": ["get", "_color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0f1419",
        },
      });

      map.on("click", "points-circle", (e) => {
        const f = e.features?.[0];
        const p = f?.properties;
        if (!p || typeof p !== "object") return;
        const html = `
      <div style="font-size:12px; line-height:1.5;">
        <div style="font-weight:600; margin-bottom:4px;">${escapeHtml((p as Record<string, unknown>).nom_vernaculaire ?? "—")}</div>
        <div style="color:#666;">${escapeHtml((p as Record<string, unknown>).nom_taxref ?? "")}</div>
        <hr style="border:none; border-top:1px solid #eee; margin:6px 0;"/>
        <div><b>Classe:</b> ${escapeHtml((p as Record<string, unknown>).classe ?? "—")}</div>
        <div><b>Famille:</b> ${escapeHtml((p as Record<string, unknown>).famille ?? "—")}</div>
        <div><b>Date:</b> ${escapeHtml((p as Record<string, unknown>).date_debut ?? "—")}</div>
        <div><b>id_obs:</b> ${escapeHtml((p as Record<string, unknown>).id_obs ?? "—")}</div>
      </div>`;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on("mouseenter", "points-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "points-circle", () => {
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

  const addSpecies = useCallback(
    (s: CatalogTaxon) => {
      setSelected((prev) => {
        if (prev.has(s.tax)) return prev;
        const next = new Map(prev);
        const color = PALETTE[next.size % PALETTE.length];
        next.set(s.tax, { label: s.tax, color });
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
      ? `${speciesCatalog.length} taxon(s) depuis fauna_taxa_ref — tape pour filtrer (liste ▾ : max. ${SPECIES_PANEL_LIMIT} affichés).`
      : null;

  return (
    <div className="fauna-map-root">
      <aside className="fauna-map-sidebar">
        <div>
          <h1>Cartographie Faune</h1>
          <div className="fauna-map-hint">Sélectionne une ou plusieurs espèces, ajuste le buffer, charge.</div>
        </div>

        <div className="fauna-map-section">
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
                  Chargement du catalogue d'espèces…
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
              {!catalogLoading && !catalogError && speciesCatalog.length > 0 && hasQuery && filteredSuggestions.length === 0 && (
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
          <div className="fauna-map-chips">
            {[...selected.entries()].map(([tax, info]) => (
              <span key={tax} className="fauna-map-chip">
                <span className="swatch" style={{ background: info.color }} />
                {escapeHtml(info.label)}
                <button type="button" title="Retirer" onClick={() => removeSpecies(tax)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="fauna-map-section">
          <label htmlFor="fauna-buffer">Buffer autour des observations</label>
          <div className="fauna-map-range-wrap">
            <input
              id="fauna-buffer"
              type="range"
              min={0}
              max={5000}
              step={50}
              value={bufferM}
              onChange={(e) => setBufferM(parseInt(e.target.value, 10))}
            />
            <span className="fauna-map-range-val">{bufferM} m</span>
          </div>
        </div>

        <div className="fauna-map-section">
          <label className="fauna-map-check-row">
            <input
              type="checkbox"
              checked={limitToViewport}
              onChange={(e) => setLimitToViewport(e.target.checked)}
            />
            <span>
              Limiter la requête à la vue de la carte
            </span>
          </label>
        </div>

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
            ZIP avec les fichiers du shapefile (.shp, .shx, .dbf, idéalement .prj). La carte attend du WGS84 ; sans .prj,
            les coordonnées peuvent être fausses. La géométrie s’affiche en rouge ; un gros point rouge marque le centre de
            l’emprise pour la retrouver même fort dézoomé.
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
              {shpImportBusy ? "Lecture du ZIP…" : "Charger un ZIP (shapefile)"}
            </button>
            <button type="button" className="ghost" onClick={clearUserShpImport}>
              Retirer l’import
            </button>
          </div>
          {shpImportNote ? (
            <div className={`fauna-map-status fauna-map-shp-note${shpImportNoteErr ? " error" : ""}`}>{shpImportNote}</div>
          ) : null}
        </div>

        <div className="fauna-map-section">
          <button type="button" className="primary" disabled={loadBusy} onClick={() => void loadObservations()}>
            Charger les observations
          </button>
          <button type="button" className="ghost" onClick={clearMap}>
            Effacer la carte
          </button>
          <div className={`fauna-map-status${statusError ? " error" : ""}`}>{status}</div>
        </div>
      </aside>

      <div className="fauna-map-map-wrap">
        <div ref={mapContainerRef} className="fauna-map-map" />
        {selected.size > 0 && (
          <div className="fauna-map-legend">
            {[...selected.entries()].map(([tax, info]) => (
              <div key={tax} className="fauna-map-legend-row">
                <span className="swatch" style={{ background: info.color }} />
                <span>{escapeHtml(info.label)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
