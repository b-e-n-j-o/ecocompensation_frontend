import { useEffect, useRef, type FC } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/* ─── Types ─── */
interface ParcelleRef {
  insee: string;
  section: string;
  numero: string;
}

interface LayerConfig {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  data?: GeoJSON.FeatureCollection;
}

type ResultTab = 'synthese' | 'hydrologie' | 'reglementaire' | 'vegetation' | 'occupation';

interface Props {
  parcelleRef: ParcelleRef | null;
  bufferM: number;
  visibleLayers: Record<ResultTab, LayerConfig[]> | null;
  activeTab: ResultTab;
  onParcelleSelect?: (ref: ParcelleRef) => void;
}

/* ─── Style satellite IGN ─── */
const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      ],
      tileSize: 256,
      attribution: '© IGN',
      maxzoom: 19,
    },
    cadastre: {
      type: 'vector',
      tiles: [
        'https://data.geopf.fr/tms/1.0.0/CADASTRALPARCELS.PARCELLAIRE_EXPRESS/{z}/{x}/{y}.pbf',
      ],
      minzoom: 12,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
  ],
};

/* ─── Centre Gironde (Latresne) ─── */
const GIRONDE_CENTER: [number, number] = [-0.4833, 44.7833];
const INITIAL_ZOOM = 14;

/* ─── Données locales Latresne ─── */
const PARCELLES_LATRESNE_URL = new URL('./parcelles_latresne.geojson', import.meta.url).href;

const IDECOMapView: FC<Props> = ({ parcelleRef, bufferM, onParcelleSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const selectedFeatureRef = useRef<GeoJSON.Feature | null>(null);

  const updateBufferAroundFeature = (map: Map, feature: GeoJSON.Feature, bufferRadiusM: number) => {
    const geom = feature.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') || bufferRadiusM <= 0) {
      const bufferSource = map.getSource('parcelle-buffer') as maplibregl.GeoJSONSource | undefined;
      if (bufferSource) {
        bufferSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const coords =
      geom.type === 'Polygon'
        ? geom.coordinates[0]
        : geom.coordinates[0][0];

    if (!coords || !coords.length) return;

    const centerLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const centerLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

    const bufferDeg = bufferRadiusM / 111000;
    const steps = 32;
    const bufferCoords: number[][] = [];

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      bufferCoords.push([
        centerLng + bufferDeg * Math.cos(angle) * 1.5,
        centerLat + bufferDeg * Math.sin(angle),
      ]);
    }

    const bufferSource = map.getSource('parcelle-buffer') as maplibregl.GeoJSONSource | undefined;
    if (!bufferSource) return;

    bufferSource.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [bufferCoords],
          },
        },
      ],
    });
  };

  /* ── Init carte ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let destroyed = false;

    const map = new maplibregl.Map({
      container,
      style: SAT_STYLE,
      center: GIRONDE_CENTER,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150 }), 'bottom-right');

    map.on('load', () => {
      if (destroyed) {
        map.remove();
        return;
      }

      /* Couche cadastre IGN (contours nationaux) */
      map.addLayer({
        id: 'cadastre-parcelles',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'parcelle',
        minzoom: 14,
        paint: {
          'line-color': '#f59e0b',
          'line-width': 1,
          'line-opacity': 0.6,
        },
      });

      /* Cadastre local Latresne (GeoJSON embarqué) */
      map.addSource('cadastre-latresne', {
        type: 'geojson',
        data: PARCELLES_LATRESNE_URL,
        // Assure que chaque feature a un id numérique stable,
        // nécessaire pour feature-state (hover / selected)
        generateId: true,
      });

      map.addLayer({
        id: 'cadastre-latresne-fill',
        type: 'fill',
        source: 'cadastre-latresne',
        paint: {
          // selected > hover > défaut
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#f97316', // orange sélection
            ['boolean', ['feature-state', 'hover'], false],
            '#fb923c', // orange clair hover
            '#f59e0b',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.45,
            ['boolean', ['feature-state', 'hover'], false],
            0.25,
            0.12,
          ],
        },
      });

      map.addLayer({
        id: 'cadastre-latresne-line',
        type: 'line',
        source: 'cadastre-latresne',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#ea580c',
            ['boolean', ['feature-state', 'hover'], false],
            '#f97316',
            '#f97316',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['boolean', ['feature-state', 'hover'], false],
            2,
            1.2,
          ],
        },
      });

      // Gestion des états hover / selected via feature-state
      let hoveredId: string | number | null = null;
      let selectedId: string | number | null = null;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });

      /* Source pour le buffer */
      map.addSource('parcelle-buffer', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'parcelle-buffer-outline',
        type: 'line',
        source: 'parcelle-buffer',
        paint: {
          // On garde la logique de buffer côté données mais on ne l'affiche pas
          'line-color': '#000000',
          'line-width': 0,
          'line-dasharray': [4, 2],
          'line-opacity': 0,
        },
      });

      /* Interaction sur les parcelles de Latresne */
      map.on('mousemove', 'cadastre-latresne-fill', (e) => {
        const f = e.features?.[0] as GeoJSON.Feature | undefined;
        if (!f) return;

        const id = f.id as string | number | undefined;
        if (id === undefined || id === null) return;

        // Hover state
        if (hoveredId !== null && hoveredId !== id) {
          map.setFeatureState(
            { source: 'cadastre-latresne', id: hoveredId },
            { hover: false }
          );
        }
        hoveredId = id;
        map.setFeatureState(
          { source: 'cadastre-latresne', id },
          { hover: true }
        );

        const props = (f.properties || {}) as any;
        const section = (props.section ?? '').toString();
        const numero = (props.numero ?? '').toString();

        map.getCanvas().style.cursor = 'pointer';

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:DM Sans,sans-serif;font-size-sm:12px;color:#020617">
              <b>${section}${numero}</b>
            </div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', 'cadastre-latresne-fill', () => {
        map.getCanvas().style.cursor = '';

        if (hoveredId !== null) {
          map.setFeatureState(
            { source: 'cadastre-latresne', id: hoveredId },
            { hover: false }
          );
        }
        hoveredId = null;

        popup.remove();
      });

      map.on('click', 'cadastre-latresne-fill', (e) => {
        const feature = e.features?.[0] as GeoJSON.Feature | undefined;
        if (!feature) return;

        const id = feature.id as string | number | undefined;
        if (id === undefined || id === null) return;

        const props = (feature.properties || {}) as any;
        const insee = '33234';
        const section = (props.section || '').toString();
        const numero = (props.numero || '').toString();
        if (!section || !numero) return;

        // Désélection de l'ancienne parcelle
        if (selectedId !== null && selectedId !== id) {
          map.setFeatureState(
            { source: 'cadastre-latresne', id: selectedId },
            { selected: false }
          );
        }

        // Nouvelle sélection
        selectedId = id;
        map.setFeatureState(
          { source: 'cadastre-latresne', id },
          { selected: true }
        );

        const geom = feature.geometry;
        if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
          const coords =
            geom.type === 'Polygon'
              ? geom.coordinates[0]
              : geom.coordinates[0][0];

          if (coords && coords.length) {
            const lngs = coords.map((c) => c[0]);
            const lats = coords.map((c) => c[1]);
            const bounds: maplibregl.LngLatBoundsLike = [
              Math.min(...lngs),
              Math.min(...lats),
              Math.max(...lngs),
              Math.max(...lats),
            ];
            map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 600 });
          }
        }

        selectedFeatureRef.current = feature;
        updateBufferAroundFeature(map, feature, bufferM);

        if (onParcelleSelect) {
          onParcelleSelect({ insee, section, numero });
        }
      });

      /* Sources pour les couches de résultats */
      const resultLayerIds = [
        'hydrologie',
        'reglementaire',
        'vegetation',
        'occupation',
      ];

      resultLayerIds.forEach((layerId) => {
        map.addSource(`layer-${layerId}`, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: `layer-${layerId}-fill`,
          type: 'fill',
          source: `layer-${layerId}`,
          paint: {
            'fill-color': '#22c55e',
            'fill-opacity': 0.25,
          },
        });

        map.addLayer({
          id: `layer-${layerId}-line`,
          type: 'line',
          source: `layer-${layerId}`,
          paint: {
            'line-color': '#15803d',
            'line-width': 1.5,
          },
        });
      });
    });

    mapRef.current = map;

    return () => {
      destroyed = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Mise à jour parcelle sélectionnée ──
     On laisse la gestion de la géométrie sélectionnée au handler de clic
     sur la couche 'cadastre-latresne-fill', pour éviter d'effacer
     la sélection dès que le parent passe parcelleRef = null. */
  useEffect(() => {
    // Effet conservé pour réagir à un futur besoin,
    // mais sans écraser la sélection actuelle.
  }, [parcelleRef]);

  /* ── Mise à jour buffer ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const feature = selectedFeatureRef.current;
    if (!feature) return;

    updateBufferAroundFeature(map, feature, bufferM);
  }, [bufferM]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Indicateur de chargement parcelles */}
      {!parcelleRef && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15,23,42,0.75)',
            color: 'white',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📍</span>
          Saisissez une référence cadastrale pour lancer l'analyse
        </div>
      )}

      {/* Badge buffer */}
      {parcelleRef && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'white',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#2563eb',
              border: '2px solid white',
              boxShadow: '0 0 0 1px #2563eb',
            }}
          />
          <span style={{ color: '#0f172a', fontWeight: 500 }}>
            Buffer : {bufferM}m
          </span>
        </div>
      )}

    </div>
  );
};

export default IDECOMapView;