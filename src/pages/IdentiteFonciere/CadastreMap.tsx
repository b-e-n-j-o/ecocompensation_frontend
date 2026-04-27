/**
 * CadastreMap.tsx
 *
 * Composant carte cadastrale interactive.
 * - Navigation libre sur la France (MapLibre GL JS)
 * - Clic sur la carte → fetch API backend (bbox 500m)
 * - Affichage des parcelles en overlay GeoJSON
 * - Clic sur une parcelle → callback onParcelleSelect avec ses métadonnées
 *
 * Dépendances : maplibre-gl (+ son CSS), installées séparément.
 * pnpm add maplibre-gl
 * pnpm add -D @types/maplibre-gl  (si nécessaire)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { Map, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  fetchCadastreCommuneGeojson,
  fetchCadastreCommuneMeta,
  type IdentiteFonciereParcelleInput,
} from "../../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CadastreMapProps {
  /** Appelé quand l'utilisateur clique sur une parcelle du cadastre affiché */
  onParcelleSelect: (p: IdentiteFonciereParcelleInput) => void;
  /** Parcelles déjà sélectionnées — pour les colorier différemment sur la carte */
  selectedParcelles: IdentiteFonciereParcelleInput[];
  communeToDisplay?: { insee: string; trigger: number } | null;
  className?: string;
  style?: React.CSSProperties;
}

interface WFSFeatureProps {
  /** Numéro de parcelle sur 4 caractères, ex: "0042" */
  numero: string;
  /** Section cadastrale, ex: "AC" */
  section: string;
  /** Nom de la commune */
  commune: string;
  /** Code INSEE 5 chiffres — champ principal Géoplateforme */
  code_insee: string;
  /** Identifiant complet IGN : code_insee + prefixe + section + numero */
  idu?: string;
  /** Champ alternatif selon version de couche */
  insee?: string;
  /** Surface en m² */
  contenance?: number;
  feuille?: number;
  prefixe?: string;
}

interface MunicipalityProps {
  name?: string;
  insee?: string;
  is_rnu?: boolean;
  is_deleted?: boolean;
  is_coastline?: boolean;
}

interface MunicipalityInfo {
  name: string;
  insee: string;
  is_rnu: boolean;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Endpoint WFS IGN utilisé uniquement pour la commune au clic
const IGN_WFS_URL = "https://data.geopf.fr/wfs/ows";
const CADASTRE_API =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://localhost:8000");
const BBOX_HALF_M = 250; // → bbox 500m×500m
const MUNICIPALITY_BBOX_HALF_M = 40; // petit bbox autour du clic

const SOURCE_ID = "cadastre";
const VT_SOURCE_ID = "cadastre-vt";
const BBOX_SOURCE_ID = "cadastre-bbox-preview";
const LAYER_FILL_ID = "cadastre-fill";
const LAYER_FILL_SELECTED_ID = "cadastre-fill-selected";
const LAYER_STROKE_ID = "cadastre-stroke";
const LAYER_HOVER_ID = "cadastre-hover";
const LAYER_LABEL_ID = "cadastre-label";
const VT_LAYER_FILL_ID = "cadastre-vt-fill";
const VT_LAYER_FILL_SELECTED_ID = "cadastre-vt-fill-selected";
const VT_LAYER_STROKE_ID = "cadastre-vt-stroke";
const VT_LAYER_HOVER_ID = "cadastre-vt-hover";
const VT_LAYER_LABEL_ID = "cadastre-vt-label";
const BBOX_FILL_LAYER_ID = "cadastre-bbox-fill";
const BBOX_STROKE_LAYER_ID = "cadastre-bbox-stroke";

// Fond de carte IGN Géoplateforme — Plan IGN (tuiles vectorielles, sans clé)
// Fallback raster PLAN IGN si le style vectoriel pose problème
const BASEMAP_STYLE_URL =
  "https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json";

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/**
 * Bbox WGS84 pour le WFS Géoplateforme.
 * On utilise CRS:84 (= WGS84 avec ordre lon/lat) : c'est ce que le WFS
 * data.geopf.fr retourne nativement sans reprojection côté client.
 * Format bbox : minLon,minLat,maxLon,maxLat (ordre CRS:84)
 */
function bboxWGS84(lng: number, lat: number, halfMeters: number): string {
  const dLat = halfMeters / 111320;
  const dLng = halfMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

function buildCadastreApiUrl(
  lng: number,
  lat: number,
  municipalityInsee?: string | null,
): string {
  const params = new URLSearchParams({
    lng: String(lng),
    lat: String(lat),
    half_m: String(BBOX_HALF_M),
    count: "300",
  });
  if (municipalityInsee) params.set("insee", municipalityInsee);
  return `${CADASTRE_API}/api/cadastre/parcelles?${params.toString()}`;
}

/** URL WFS IGN Urbanisme pour récupérer la commune au point cliqué */
function buildMunicipalityWFSUrl(lng: number, lat: number): string {
  const bbox = bboxWGS84(lng, lat, MUNICIPALITY_BBOX_HALF_M);
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    typeNames: "wfs_du:municipality",
    outputFormat: "application/json",
    SRSNAME: "CRS:84",
    BBOX: `${bbox},CRS:84`,
    COUNT: "10",
  });
  return `${IGN_WFS_URL}?${params.toString()}`;
}

/** Extrait les métadonnées parcellaires depuis les propriétés WFS */
function extractParcelleInput(
  props: WFSFeatureProps,
  municipality: MunicipalityInfo | null = null,
): IdentiteFonciereParcelleInput | null {
  let insee = props.code_insee ?? props.insee ?? "";
  let section = props.section ?? "";
  let numero = props.numero ?? "";
  const commune = props.commune ?? municipality?.name ?? "";

  // Fallback sur le champ `idu` (format: IIIIISSSNNNN où I=insee, S=section, N=numero)
  // ex: "33522AC0042"
  if ((!insee || !section || !numero) && props.idu && props.idu.length >= 10) {
    const idu = props.idu;
    if (!insee) insee = idu.slice(0, 5);
    if (!section) section = idu.slice(5, 8).replace(/^0+/, "") || idu.slice(5, 8);
    if (!numero) numero = idu.slice(8);
  }

  if (!insee && municipality?.insee) insee = municipality.insee;
  if (!insee || !section || !numero) return null;
  return { commune: commune || insee, insee, section, numero };
}

/** Identifiant unique d'une parcelle pour la comparaison */
function parcelleKey(p: IdentiteFonciereParcelleInput): string {
  return `${p.insee}-${p.section}-${p.numero}`;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function CadastreMap({
  onParcelleSelect,
  selectedParcelles,
  communeToDisplay,
  className,
  style,
}: CadastreMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedKeysRef = useRef<Set<string>>(new Set());
  const previousSelectedKeysRef = useRef<Set<string>>(new Set());
  const activeCommuneInseeRef = useRef<string | null>(null);
  const activeCommuneModeRef = useRef<"geojson" | "mvt" | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [parcelleCount, setParcelleCount] = useState<number | null>(null);
  const [municipalityInfo, setMunicipalityInfo] = useState<MunicipalityInfo | null>(
    null,
  );
  const [displayModeLabel, setDisplayModeLabel] = useState<string | null>(null);
  const fetchMunicipality = useCallback(async (lng: number, lat: number) => {
    const url = buildMunicipalityWFSUrl(lng, lat);
    // Retry léger silencieux (WFS parfois instable).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Municipality WFS ${resp.status}`);
        const geojson = (await resp.json()) as {
          features?: Array<{ properties?: MunicipalityProps }>;
        };
        const candidates = (geojson.features ?? [])
          .map((f) => f.properties)
          .filter(
            (p): p is MunicipalityProps =>
              !!p &&
              !p.is_deleted &&
              typeof p.insee === "string" &&
              p.insee.trim() !== "",
          );
        const first = candidates[0];
        if (!first) return null;
        return {
          name: (first.name ?? "").trim() || first.insee!.trim(),
          insee: first.insee!.trim(),
          is_rnu: Boolean(first.is_rnu),
        } satisfies MunicipalityInfo;
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 180));
          continue;
        }
        return null;
      }
    }
    return null;
  }, []);


  // Set des clés sélectionnées (pour colorer sur la carte)
  const selectedKeys = new Set(selectedParcelles.map(parcelleKey));
  selectedKeysRef.current = selectedKeys;

  // -------------------------------------------------------------------------
  // Initialisation de la carte
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      // Style Plan IGN vectoriel. En cas d'échec CORS/réseau, on bascule sur ortho raster.
      style: BASEMAP_STYLE_URL,
      center: [2.35, 46.8], // France métropolitaine
      zoom: 5.5,
      attributionControl: false,
    });

    // Ne pas basculer automatiquement de style sur un `error` générique :
    // avec les couches MVT, certaines erreurs réseau ponctuelles peuvent survenir
    // sans invalider le style global. Un setStyle() ici ferait disparaître
    // temporairement les couches cadastre.
    map.on("error", (ev) => {
      console.warn("[CadastreMap] MapLibre error (style conservé):", ev.error);
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      // Preview visuel de la bbox de requête (500m x 500m)
      map.addSource(BBOX_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: BBOX_FILL_LAYER_ID,
        type: "fill",
        source: BBOX_SOURCE_ID,
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.06,
        },
      });
      map.addLayer({
        id: BBOX_STROKE_LAYER_ID,
        type: "line",
        source: BBOX_SOURCE_ID,
        paint: {
          "line-color": "#2563eb",
          "line-width": 1,
          "line-opacity": 0.45,
          "line-dasharray": [2, 2],
        },
      });

      // Source GeoJSON vide — sera mise à jour au clic
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: false, // on utilise nos propres IDs via feature-state
        promoteId: "id", // champ id dans les propriétés
      });
      map.addSource(VT_SOURCE_ID, {
        type: "vector",
        tiles: [],
        minzoom: 12,
        maxzoom: 22,
        promoteId: "idu",
      });

      // Remplissage de base
      map.addLayer({
        id: LAYER_FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.15,
        },
        filter: ["==", ["get", "selected"], false],
      });

      // Remplissage pour les parcelles sélectionnées
      map.addLayer({
        id: LAYER_FILL_SELECTED_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "#3b82f6",
          // On garde la parcelle sélectionnée visuellement (même intensité que le hover).
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.3,
            0,
          ],
        },
      });

      // Contours
      map.addLayer({
        id: LAYER_STROKE_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#1e3a5f",
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      // Hover
      map.addLayer({
        id: LAYER_HOVER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.3,
            0,
          ],
        },
      });

      // Labels section/numero
      map.addLayer({
        id: LAYER_LABEL_ID,
        type: "symbol",
        source: SOURCE_ID,
        minzoom: 16,
        layout: {
          "text-field": ["concat", ["get", "section"], ["get", "numero"]],
          "text-size": 10,
          "text-font": ["Open Sans Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      map.addLayer({
        id: VT_LAYER_FILL_ID,
        type: "fill",
        source: VT_SOURCE_ID,
        "source-layer": "parcelles",
        minzoom: 10,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0.15,
        },
      });
      map.addLayer({
        id: VT_LAYER_FILL_SELECTED_ID,
        type: "fill",
        source: VT_SOURCE_ID,
        "source-layer": "parcelles",
        minzoom: 10,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.3,
            0,
          ],
        },
      });
      map.addLayer({
        id: VT_LAYER_STROKE_ID,
        type: "line",
        source: VT_SOURCE_ID,
        "source-layer": "parcelles",
        minzoom: 10,
        layout: { visibility: "none" },
        paint: {
          "line-color": "#1e3a5f",
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: VT_LAYER_HOVER_ID,
        type: "fill",
        source: VT_SOURCE_ID,
        "source-layer": "parcelles",
        minzoom: 10,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.3,
            0,
          ],
        },
      });
      map.addLayer({
        id: VT_LAYER_LABEL_ID,
        type: "symbol",
        source: VT_SOURCE_ID,
        "source-layer": "parcelles",
        minzoom: 16,
        layout: {
          visibility: "none",
          "text-field": ["concat", ["get", "section"], ["get", "numero"]],
          "text-size": 10,
          "text-font": ["Open Sans Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Fetch API cadastre + mise à jour source
  // -------------------------------------------------------------------------
  const fetchCadastre = useCallback(
    async (lng: number, lat: number, municipalityInsee?: string | null) => {
      if (!mapRef.current) return;
      const map = mapRef.current;

      setLoading(true);
      setFetchError(null);
      setParcelleCount(null);

      try {
        const url = buildCadastreApiUrl(lng, lat, municipalityInsee);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`API cadastre ${resp.status}: ${resp.statusText}`);
        const geojson = await resp.json();
        setDisplayModeLabel(null);
        setLayerVisibility(map, false);

        if (!geojson.features?.length) {
          setParcelleCount(0);
          (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)?.setData({
            type: "FeatureCollection",
            features: [],
          });
          return;
        }

        // Ajouter un champ `id` et `selected` dans les propriétés
        const enriched = {
          ...geojson,
          features: geojson.features.map(
            (f: GeoJSON.Feature<GeoJSON.Geometry, WFSFeatureProps>) => {
              const props = f.properties ?? ({} as WFSFeatureProps);
              const key = `${props.code_insee ?? props.insee}-${props.section}-${props.numero}`;
              return {
                ...f,
                id: key,
                properties: {
                  ...props,
                  id: key,
                  selected: selectedKeysRef.current.has(key),
                },
              };
            },
          ),
        };

        (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)?.setData(
          enriched,
        );
        setParcelleCount(enriched.features.length);
      } catch (e) {
        setFetchError(
          e instanceof Error ? e.message : "Erreur lors du fetch API cadastre",
        );
      } finally {
        setLoading(false);
      }
    },
    // selectedKeys change si selectedParcelles change, on veut rerendre
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadCommuneCadastre = useCallback(
    async (insee: string) => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const inseeValue = insee.trim();
      if (!inseeValue) return;

      setLoading(true);
      setFetchError(null);
      setParcelleCount(null);
      try {
        const meta = await fetchCadastreCommuneMeta(inseeValue);
        setParcelleCount(meta.nb_parcelles);

        // Evite un rechargement inutile quand on redemande la même commune
        // déjà affichée dans le même mode.
        if (
          activeCommuneInseeRef.current === inseeValue &&
          activeCommuneModeRef.current === meta.mode
        ) {
          if (meta.mode === "mvt" && meta.bbox_wgs84) {
            fitToBoundsWithTargetZoom(map, meta.bbox_wgs84);
          }
          setDisplayModeLabel(
            `Commune ${inseeValue} - mode ${meta.mode === "geojson" ? "GeoJSON" : "tuiles vectorielles"}`,
          );
          return;
        }

        if (meta.mode === "geojson") {
          setLayerVisibility(map, false);
          const geojson = await fetchCadastreCommuneGeojson(inseeValue, meta.threshold);
          const enriched = {
            ...geojson,
            features: (geojson.features ?? []).map((f) => {
              const props = (f.properties ?? {}) as WFSFeatureProps;
              const key = `${props.code_insee ?? props.insee}-${props.section}-${props.numero}`;
              return {
                ...f,
                id: key,
                properties: {
                  ...props,
                  id: key,
                  selected: selectedKeysRef.current.has(key),
                },
              };
            }),
          };
          (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)?.setData(
            enriched as GeoJSON.FeatureCollection,
          );
          setDisplayModeLabel(`Commune ${inseeValue} - mode GeoJSON`);
          fitToGeojson(map, enriched as GeoJSON.FeatureCollection);
          activeCommuneInseeRef.current = inseeValue;
          activeCommuneModeRef.current = "geojson";
        } else {
          (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)?.setData({
            type: "FeatureCollection",
            features: [],
          });
          const tilesUrl = `${CADASTRE_API}/api/cadastre/tiles/{z}/{x}/{y}.mvt?insee=${encodeURIComponent(inseeValue)}`;
          const vtSource = map.getSource(VT_SOURCE_ID) as maplibregl.VectorTileSource | undefined;
          vtSource?.setTiles([tilesUrl]);
          setLayerVisibility(map, true);
          setDisplayModeLabel(`Commune ${inseeValue} - mode tuiles vectorielles`);
          if (meta.bbox_wgs84) {
            fitToBoundsWithTargetZoom(map, meta.bbox_wgs84);
          }
          activeCommuneInseeRef.current = inseeValue;
          activeCommuneModeRef.current = "mvt";
        }
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : "Erreur chargement commune");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Gestionnaires d'événements carte
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Attend que les couches soient chargées
    const onMapClick = async (e: MapMouseEvent) => {
      if (!map.isStyleLoaded()) return;
      setBboxPreview(map, e.lngLat.lng, e.lngLat.lat);

      const municipality = await fetchMunicipality(e.lngLat.lng, e.lngLat.lat);
      setMunicipalityInfo(municipality);

      // Vérifie si on a cliqué sur une parcelle déjà affichée
      const features = map.queryRenderedFeatures(e.point, {
        layers: [
          LAYER_FILL_ID,
          LAYER_FILL_SELECTED_ID,
          LAYER_HOVER_ID,
          VT_LAYER_FILL_ID,
          VT_LAYER_FILL_SELECTED_ID,
          VT_LAYER_HOVER_ID,
        ],
      });

      if (features.length > 0) {
        // Clic sur une parcelle → sélection
        const feat = features[0];
        const props = feat.properties as WFSFeatureProps & { selected?: boolean };
        const input = extractParcelleInput(props, municipality);
        if (input) {
          onParcelleSelect(input);
          // Met à jour visuellement `selected` dans la source
          refreshSelectedState(map, new Set([...selectedKeys, parcelleKey(input)]), [
            SOURCE_ID,
            VT_SOURCE_ID,
          ]);
        }
      } else {
        // Clic ailleurs → nouveau fetch
        activeCommuneInseeRef.current = null;
        activeCommuneModeRef.current = null;
        fetchCadastre(e.lngLat.lng, e.lngLat.lat, municipality?.insee ?? null);
        // Zoom si nécessaire
        if (map.getZoom() < 16) {
          map.flyTo({ center: e.lngLat, zoom: 16.5, speed: 1.2 });
        }
      }
    };

    const onMouseMove = (e: MapMouseEvent) => {
      if (!map.isStyleLoaded()) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_FILL_ID, LAYER_FILL_SELECTED_ID, VT_LAYER_FILL_ID, VT_LAYER_FILL_SELECTED_ID],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "crosshair";

      const sourceName = (features[0]?.layer?.source as string) || SOURCE_ID;
      const id = featureKeyFromRendered(features[0]);
      if (hoveredIdRef.current && hoveredIdRef.current !== id) {
        clearHoverState(map, hoveredIdRef.current);
        hoveredIdRef.current = null;
      }
      if (id) {
        setFeatureStateOnSource(map, sourceName, id, { hover: true });
        hoveredIdRef.current = id;
      }
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "crosshair";
      if (hoveredIdRef.current) {
        clearHoverState(map, hoveredIdRef.current);
        hoveredIdRef.current = null;
      }
    };

    // Applique le curseur crosshair par défaut
    map.getCanvas().style.cursor = "crosshair";

    map.on("click", onMapClick);
    map.on("mousemove", onMouseMove);
    map.on("mouseleave", LAYER_FILL_ID, onMouseLeave);
    map.on("mouseleave", VT_LAYER_FILL_ID, onMouseLeave);

    return () => {
      map.off("click", onMapClick);
      map.off("mousemove", onMouseMove);
      map.off("mouseleave", LAYER_FILL_ID, onMouseLeave);
      map.off("mouseleave", VT_LAYER_FILL_ID, onMouseLeave);
    };
  }, [fetchCadastre, fetchMunicipality, onParcelleSelect, selectedKeys]);

  useEffect(() => {
    if (!communeToDisplay?.insee || !mapRef.current?.isStyleLoaded()) return;
    loadCommuneCadastre(communeToDisplay.insee);
  }, [communeToDisplay?.insee, communeToDisplay?.trigger, loadCommuneCadastre]);

  // -------------------------------------------------------------------------
  // Mise à jour de l'état `selected` quand selectedParcelles change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current?.isStyleLoaded()) return;
    const map = mapRef.current;
    const prev = previousSelectedKeysRef.current;
    const next = selectedKeys;

    const added: string[] = [];
    const removed: string[] = [];
    next.forEach((k) => {
      if (!prev.has(k)) added.push(k);
    });
    prev.forEach((k) => {
      if (!next.has(k)) removed.push(k);
    });

    if (added.length || removed.length) {
      [SOURCE_ID, VT_SOURCE_ID].forEach((sourceId) => {
        added.forEach((id) => setFeatureStateOnSource(map, sourceId, id, { selected: true }));
        removed.forEach((id) => setFeatureStateOnSource(map, sourceId, id, { selected: false }));
      });
    }

    previousSelectedKeysRef.current = new Set(next);
  }, [selectedParcelles]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 10,
        overflow: "hidden",
        ...style,
      }}
      className={className}
    >
      {/* Conteneur carte */}
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {/* Indicateur de chargement */}
      {loading && (
        <div style={overlayPillStyle}>
          <Spinner /> Chargement du cadastre…
        </div>
      )}

      {/* Erreur */}
      {fetchError && !loading && (
        <div style={{ ...overlayPillStyle, background: "#fef2f2", color: "#b91c1c" }}>
          ⚠ {fetchError}
        </div>
      )}

      {/* Compteur de parcelles */}
      {parcelleCount !== null && !loading && !fetchError && (
        <div style={{ ...overlayPillStyle, background: "rgba(15,23,42,0.82)" }}>
          {parcelleCount === 0
            ? "Aucune parcelle dans cette zone"
            : `${parcelleCount} parcelle${parcelleCount > 1 ? "s" : ""} — cliquez pour sélectionner`}
        </div>
      )}
      {displayModeLabel && !loading && (
        <div style={{ ...overlayPillStyle, bottom: 44, background: "rgba(37,99,235,0.88)" }}>
          {displayModeLabel}
        </div>
      )}

      {/* Informations commune (couche municipality) */}
      {municipalityInfo && !loading && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: "rgba(255,255,255,0.95)",
            color: "#0f172a",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            lineHeight: 1.35,
            pointerEvents: "none",
            boxShadow: "0 2px 10px rgba(15,23,42,0.08)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{municipalityInfo.name}</div>
          <div style={{ color: "#475569" }}>
            INSEE {municipalityInfo.insee} ·{" "}
            {municipalityInfo.is_rnu ? "RNU" : "PLU / document d'urbanisme"}
          </div>
        </div>
      )}

      {/* Instruction initiale */}
      {parcelleCount === null && !loading && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15,23,42,0.72)",
            color: "#e2e8f0",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          Cliquez sur la carte pour charger le cadastre local
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function refreshSelectedState(map: Map, keys: Set<string>, sourceIds: string[]) {
  sourceIds.forEach((sourceId) => {
    try {
      const rendered =
        sourceId === VT_SOURCE_ID
          ? map.querySourceFeatures(sourceId, { sourceLayer: "parcelles" })
          : map.querySourceFeatures(sourceId);
      rendered.forEach((f) => {
        const props = (f.properties ?? {}) as WFSFeatureProps;
        const inferredId =
          (f.id as string | undefined) ??
          `${props.code_insee ?? props.insee}-${props.section}-${props.numero}`;
        if (!inferredId || inferredId.includes("undefined")) return;
        setFeatureStateOnSource(map, sourceId, inferredId, { selected: keys.has(inferredId) });
      });
    } catch {
      // Silencieux si source pas encore prête
    }
  });
}

function clearHoverState(map: Map, featureId: string) {
  [SOURCE_ID, VT_SOURCE_ID].forEach((sourceId) => {
    try {
      setFeatureStateOnSource(map, sourceId, featureId, { hover: false });
    } catch {
      // ignore
    }
  });
}

function setLayerVisibility(map: Map, useVectorTiles: boolean) {
  const geoVisibility: "visible" | "none" = useVectorTiles ? "none" : "visible";
  const vtVisibility: "visible" | "none" = useVectorTiles ? "visible" : "none";
  [LAYER_FILL_ID, LAYER_FILL_SELECTED_ID, LAYER_STROKE_ID, LAYER_HOVER_ID, LAYER_LABEL_ID].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", geoVisibility);
    },
  );
  [VT_LAYER_FILL_ID, VT_LAYER_FILL_SELECTED_ID, VT_LAYER_STROKE_ID, VT_LAYER_HOVER_ID, VT_LAYER_LABEL_ID].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", vtVisibility);
    },
  );
}

function featureKeyFromRendered(feature?: maplibregl.MapGeoJSONFeature): string | undefined {
  if (!feature) return undefined;
  const fromId = feature.id;
  if (typeof fromId === "string" && fromId) return fromId;
  if (typeof fromId === "number") return String(fromId);
  const props = (feature.properties ?? {}) as WFSFeatureProps;
  const key = `${props.code_insee ?? props.insee}-${props.section}-${props.numero}`;
  return key.includes("undefined") ? undefined : key;
}

function setFeatureStateOnSource(
  map: Map,
  sourceId: string,
  id: string,
  state: { hover?: boolean; selected?: boolean },
) {
  if (sourceId === VT_SOURCE_ID) {
    map.setFeatureState({ source: sourceId, sourceLayer: "parcelles", id }, state);
    return;
  }
  map.setFeatureState({ source: sourceId, id }, state);
}

function fitToGeojson(map: Map, fc: GeoJSON.FeatureCollection) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0] as number;
      const y = coords[1] as number;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    coords.forEach((c) => walk(c));
  };
  const walkGeometry = (geometry: GeoJSON.Geometry | null) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach((g) => walkGeometry(g));
      return;
    }
    walk((geometry as Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>).coordinates);
  };
  fc.features.forEach((f) => walkGeometry((f.geometry as GeoJSON.Geometry | null) ?? null));
  if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 40, duration: 500 },
    );
  }
}

function fitToBoundsWithTargetZoom(
  map: Map,
  bbox: [number, number, number, number],
  targetZoom = 13,
) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    {
      padding: 48,
      duration: 1100,
      maxZoom: 14,
      // easing "easeInOutCubic" pour un déplacement doux.
      easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    },
  );
  map.once("moveend", () => {
    if (map.getZoom() < targetZoom) {
      map.easeTo({ zoom: targetZoom, duration: 260 });
    }
  });
}

function setBboxPreview(map: Map, lng: number, lat: number) {
  const source = map.getSource(BBOX_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  source.setData(buildBboxFeatureCollection(lng, lat, BBOX_HALF_M));
}

function buildBboxFeatureCollection(lng: number, lat: number, halfMeters: number): GeoJSON.FeatureCollection {
  const dLat = halfMeters / 111320;
  const dLng = halfMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const minLng = lng - dLng;
  const minLat = lat - dLat;
  const maxLng = lng + dLng;
  const maxLat = lat + dLat;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat],
          ]],
        },
      },
    ],
  };
}

const overlayPillStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(15,23,42,0.82)",
  color: "#e2e8f0",
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="2"
        strokeDasharray="16 6"
      />
    </svg>
  );
}