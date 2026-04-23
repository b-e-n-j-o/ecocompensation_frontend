/**
 * CadastreMap.tsx
 *
 * Composant carte cadastrale interactive.
 * - Navigation libre sur la France (MapLibre GL JS)
 * - Clic sur la carte → fetch WFS IGN parcellaire sur bbox 500m
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
import type { IdentiteFonciereParcelleInput } from "../../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CadastreMapProps {
  /** Appelé quand l'utilisateur clique sur une parcelle du cadastre affiché */
  onParcelleSelect: (p: IdentiteFonciereParcelleInput) => void;
  /** Parcelles déjà sélectionnées — pour les colorier différemment sur la carte */
  selectedParcelles: IdentiteFonciereParcelleInput[];
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

// Nouveau endpoint Géoplateforme IGN (l'ancien wxs.ign.fr est mort)
const IGN_WFS_URL = "https://data.geopf.fr/wfs/ows";
const BBOX_HALF_M = 250; // → bbox 500m×500m
const MUNICIPALITY_BBOX_HALF_M = 40; // petit bbox autour du clic

const SOURCE_ID = "cadastre";
const LAYER_FILL_ID = "cadastre-fill";
const LAYER_FILL_SELECTED_ID = "cadastre-fill-selected";
const LAYER_STROKE_ID = "cadastre-stroke";
const LAYER_HOVER_ID = "cadastre-hover";
const LAYER_LABEL_ID = "cadastre-label";

// Fond de carte IGN Géoplateforme — Plan IGN (tuiles vectorielles, sans clé)
// Fallback raster PLAN IGN si le style vectoriel pose problème
const BASEMAP_STYLE_URL =
  "https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json";

// Style raster de secours (orthophotos IGN, sans clé requise)
const BASEMAP_STYLE_ORTHO = {
  version: 8 as const,
  sources: {
    ortho: {
      type: "raster" as const,
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg&STYLE=normal",
      ],
      tileSize: 256,
      attribution: "© IGN Géoportail",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "ortho",
      type: "raster" as const,
      source: "ortho",
      paint: { "raster-saturation": -0.15 },
    },
  ],
};

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

/** Construit l'URL WFS Géoplateforme pour la couche parcellaire */
function buildWFSUrl(lng: number, lat: number): string {
  const bbox = bboxWGS84(lng, lat, BBOX_HALF_M);
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    // Géoplateforme : typeNames (pas TYPENAMES) en WFS 2.0
    typeNames: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
    outputFormat: "application/json",
    // CRS:84 = WGS84 lon/lat — retourne du GeoJSON en lon/lat directement
    SRSNAME: "CRS:84",
    BBOX: `${bbox},CRS:84`,
    COUNT: "300",
  });
  return `${IGN_WFS_URL}?${params.toString()}`;
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
  className,
  style,
}: CadastreMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [parcelleCount, setParcelleCount] = useState<number | null>(null);
  const [municipalityInfo, setMunicipalityInfo] = useState<MunicipalityInfo | null>(
    null,
  );
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

    // Fallback : si le style vectoriel IGN échoue (CORS en dev, etc.), bascule sur raster
    map.once("error", () => {
      console.warn("[CadastreMap] Style vectoriel IGN inaccessible, bascule sur ortho raster");
      map.setStyle(BASEMAP_STYLE_ORTHO as Parameters<typeof map.setStyle>[0]);
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      // Source GeoJSON vide — sera mise à jour au clic
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: false, // on utilise nos propres IDs via feature-state
        promoteId: "id", // champ id dans les propriétés
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
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Fetch WFS + mise à jour source
  // -------------------------------------------------------------------------
  const fetchCadastre = useCallback(
    async (lng: number, lat: number) => {
      if (!mapRef.current) return;
      const map = mapRef.current;

      setLoading(true);
      setFetchError(null);
      setParcelleCount(null);

      try {
        const url = buildWFSUrl(lng, lat);
        const resp = await fetch(url);
        if (!resp.ok)
          throw new Error(`WFS ${resp.status}: ${resp.statusText}`);
        const geojson = await resp.json();

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
                  selected: selectedKeys.has(key),
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
          e instanceof Error ? e.message : "Erreur lors du fetch WFS",
        );
      } finally {
        setLoading(false);
      }
    },
    // selectedKeys change si selectedParcelles change, on veut rerendre
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedParcelles],
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

      const municipality = await fetchMunicipality(e.lngLat.lng, e.lngLat.lat);
      setMunicipalityInfo(municipality);

      // Vérifie si on a cliqué sur une parcelle déjà affichée
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_FILL_ID, LAYER_FILL_SELECTED_ID, LAYER_HOVER_ID],
      });

      if (features.length > 0) {
        // Clic sur une parcelle → sélection
        const feat = features[0];
        const props = feat.properties as WFSFeatureProps & { selected?: boolean };
        const input = extractParcelleInput(props, municipality);
        if (input) {
          onParcelleSelect(input);
          // Met à jour visuellement `selected` dans la source
          refreshSelectedState(map, new Set([...selectedKeys, parcelleKey(input)]));
        }
      } else {
        // Clic ailleurs → nouveau fetch
        fetchCadastre(e.lngLat.lng, e.lngLat.lat);
        // Zoom si nécessaire
        if (map.getZoom() < 16) {
          map.flyTo({ center: e.lngLat, zoom: 16.5, speed: 1.2 });
        }
      }
    };

    const onMouseMove = (e: MapMouseEvent) => {
      if (!map.isStyleLoaded()) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_FILL_ID, LAYER_FILL_SELECTED_ID],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "crosshair";

      const id = features[0]?.id as string | undefined;
      if (hoveredIdRef.current && hoveredIdRef.current !== id) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false },
        );
        hoveredIdRef.current = null;
      }
      if (id) {
        map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
        hoveredIdRef.current = id;
      }
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "crosshair";
      if (hoveredIdRef.current) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false },
        );
        hoveredIdRef.current = null;
      }
    };

    // Applique le curseur crosshair par défaut
    map.getCanvas().style.cursor = "crosshair";

    map.on("click", onMapClick);
    map.on("mousemove", onMouseMove);
    map.on("mouseleave", LAYER_FILL_ID, onMouseLeave);

    return () => {
      map.off("click", onMapClick);
      map.off("mousemove", onMouseMove);
      map.off("mouseleave", LAYER_FILL_ID, onMouseLeave);
    };
  }, [fetchCadastre, fetchMunicipality, onParcelleSelect, selectedKeys]);

  // -------------------------------------------------------------------------
  // Mise à jour de l'état `selected` quand selectedParcelles change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current?.isStyleLoaded()) return;
    refreshSelectedState(mapRef.current, selectedKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function refreshSelectedState(map: Map, keys: Set<string>) {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  // Récupère les données actuelles et met à jour le champ `selected`
  // Note: MapLibre ne permet pas de lire les données d'une source GeoJSON directement,
  // on passe par setData en reconstruisant. On stocke les données en dehors.
  // Approche pragmatique : on utilise setFeatureState à la place (plus propre).
  // Le filtre des layers est basé sur la propriété `selected` donc on doit
  // passer par querySourceFeatures.
  // → Alternative : on maintient un cache local des features courantes.
  // Pour l'instant, on déclenche un re-fetch optionnel via l'effet.
  // Les feature-state sont réinitialisés par setData(), donc on refait:
  try {
    const rendered = map.querySourceFeatures(SOURCE_ID);
    rendered.forEach((f) => {
      const id = f.id as string;
      if (!id) return;
      const isSelected = keys.has(id);
      map.setFeatureState({ source: SOURCE_ID, id }, { selected: isSelected });
    });
  } catch {
    // Silencieux si source pas encore prête
  }
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