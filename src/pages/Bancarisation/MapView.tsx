import { useEffect, useRef, type FC } from 'react';
import maplibregl, { Map, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/* ─── Utils ─── */
function getCoords(geom: any): number[][] {
  const out: number[][] = [];
  const walk = (a: any) => { if (!a) return; if (typeof a[0] === 'number') out.push(a); else a.forEach(walk); };
  walk(geom?.coordinates);
  return out;
}

function boundsOf(features: GeoJSON.Feature[]): maplibregl.LngLatBoundsLike | null {
  const coords: number[][] = [];
  features.forEach((f) => coords.push(...getCoords((f.geometry as any))));
  if (!coords.length) return null;
  const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/* ─── Simplification RDP ─── */
function perpDist(p: number[], a: number[], b: number[]) {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  if (!dx && !dy) return Math.hypot(p[0]-a[0], p[1]-a[1]);
  const t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
function rdp(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length-1; i++) { const d = perpDist(pts[i], pts[0], pts[pts.length-1]); if (d > maxD) { maxD = d; maxI = i; } }
  if (maxD <= tol) return [pts[0], pts[pts.length-1]];
  return [...rdp(pts.slice(0, maxI+1), tol), ...rdp(pts.slice(maxI), tol).slice(1)];
}
function simplifyRing(r: number[][], tol: number) { if (tol===0||r.length<4) return r; const s=rdp(r,tol); if(s.length<4) return r; s[s.length-1]=s[0]; return s; }
function simplifyGeom(g: any, tol: number): any {
  if (!g||tol===0) return g;
  if (g.type==='Polygon') return {...g, coordinates: g.coordinates.map((r: number[][]) => simplifyRing(r, tol))};
  if (g.type==='MultiPolygon') return {...g, coordinates: g.coordinates.map((p: number[][][]) => p.map(r => simplifyRing(r, tol)))};
  return g;
}
function simplifyFC(fc: GeoJSON.FeatureCollection, tol: number): GeoJSON.FeatureCollection {
  if (tol===0) return fc;
  return {...fc, features: fc.features.map(f => ({...f, geometry: simplifyGeom(f.geometry, tol)}))};
}
// Plus de simplification : on renvoie toujours 0 pour garder la géométrie complète
function tolForZoom(_z: number) {
  return 0;
}

/* ─── Style satellite IGN ─── */
const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: { satellite: { type: 'raster', tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'], tileSize: 256, attribution: '© IGN', maxzoom: 19 } },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/* ─── Props ─── */
interface Props {
  /** GeoJSON des départements (toujours présent, fond de carte) */
  deptsFC: GeoJSON.FeatureCollection | null;
  /** GeoJSON des mesures du département sélectionné seulement */
  mesuresFC: GeoJSON.FeatureCollection | null;
  /** INSEE du département sélectionné */
  selectedDept: string | null;
  activeId: string | null;
  onSelectDept: (insee: string) => void;
  onSelectFeature: (id: string) => void;
  onBackToFrance: () => void;
}

const MapView: FC<Props> = ({ deptsFC, mesuresFC, selectedDept, activeId, onSelectDept, onSelectFeature, onBackToFrance }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<Map | null>(null);
  const rawMesuresRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const zoomTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Init carte ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let destroyed = false;

    const map = new maplibregl.Map({ container, style: SAT_STYLE, center: [2.4, 46.6], zoom: 5.2 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      if (destroyed) { map.remove(); return; }

      /* Sources */
      map.addSource('depts',   { type: 'geojson', data: EMPTY_FC, buffer: 2 });
      map.addSource('mesures', { type: 'geojson', data: EMPTY_FC, buffer: 4 });

      /* Couche départements — fond semi-transparent */
      map.addLayer({ id: 'depts-fill',    type: 'fill', source: 'depts', paint: { 'fill-color': '#64748b', 'fill-opacity': 0.08 } });
      map.addLayer({ id: 'depts-outline', type: 'line', source: 'depts', paint: { 'line-color': '#94a3b8', 'line-width': 1 } });
      /* Département sélectionné */
      map.addLayer({ id: 'depts-selected', type: 'fill', source: 'depts', filter: ['==', ['get', 'insee'], ''], paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } });

      /* Couche mesures */
      map.addLayer({ id: 'mesures-fill',          type: 'fill', source: 'mesures',                                    paint: { 'fill-color': '#10b981', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'mesures-fill-active',   type: 'fill', source: 'mesures', filter: ['==', ['get', 'id'], ''], paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.6  } });
      map.addLayer({ id: 'mesures-outline',       type: 'line', source: 'mesures',                                    paint: { 'line-color': '#059669', 'line-width': 1 } });
      map.addLayer({ id: 'mesures-outline-active', type: 'line', source: 'mesures', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#1d4ed8', 'line-width': 2.5 } });

      /* Clics */
      map.on('click', 'depts-fill', (e) => {
        const insee = String((e.features?.[0]?.properties as any)?.insee ?? '');
        if (insee) onSelectDept(insee);
      });
      map.on('click', 'mesures-fill', (e) => {
        const id = String((e.features?.[0]?.properties as any)?.id ?? '');
        if (id) onSelectFeature(id);
        e.originalEvent.stopPropagation();
      });
      map.on('mouseenter', 'depts-fill',   () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'depts-fill',   () => (map.getCanvas().style.cursor = ''));
      map.on('mouseenter', 'mesures-fill', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'mesures-fill', () => (map.getCanvas().style.cursor = ''));

      /* Re-simplification mesures au zoom */
      map.on('zoomend', () => {
        if (zoomTimer.current) clearTimeout(zoomTimer.current);
        zoomTimer.current = setTimeout(() => {
          const raw = rawMesuresRef.current;
          if (!raw) return;
          (map.getSource('mesures') as GeoJSONSource)?.setData(simplifyFC(raw, tolForZoom(map.getZoom())));
        }, 150);
      });
    });

    mapRef.current = map;
    return () => {
      destroyed = true;
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
      map.remove(); mapRef.current = null;
    };
  }, []);

  /* ── Mise à jour couche départements ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !deptsFC) return;
    const update = () => (map.getSource('depts') as GeoJSONSource)?.setData(deptsFC);
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [deptsFC]);

  /* ── Mise à jour couche mesures + zoom dept ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    rawMesuresRef.current = mesuresFC;

    const update = () => {
      /* Highlight département sélectionné */
      map.setFilter('depts-selected', ['==', ['get', 'insee'], selectedDept ?? '']);

      if (mesuresFC && mesuresFC.features.length > 0) {
        (map.getSource('mesures') as GeoJSONSource)?.setData(simplifyFC(mesuresFC, tolForZoom(map.getZoom())));
        /* Zoom sur les mesures du dept */
        const bounds = boundsOf(mesuresFC.features);
        if (bounds) map.fitBounds(bounds as any, { padding: 60, maxZoom: 14, duration: 700 });
      } else {
        (map.getSource('mesures') as GeoJSONSource)?.setData(EMPTY_FC);
        /* Si dept sélectionné sans mesures → zoom sur le dept quand même */
        if (selectedDept && deptsFC) {
          const feat = deptsFC.features.find(f => (f.properties as any)?.insee === selectedDept);
          if (feat) {
            const bounds = boundsOf([feat]);
            if (bounds) map.fitBounds(bounds as any, { padding: 60, maxZoom: 12, duration: 700 });
          }
        }
      }
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [mesuresFC, selectedDept, deptsFC]);

  /* ── Feature active ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      if (!map) return;
      map.setFilter('mesures-fill-active',    ['==', ['get', 'id'], activeId ?? '']);
      map.setFilter('mesures-outline-active', ['==', ['get', 'id'], activeId ?? '']);
      if (activeId && rawMesuresRef.current) {
        const feat = rawMesuresRef.current.features.find(
          f => String((f.properties as any)?.id) === activeId,
        );
        if (feat) {
          const b = boundsOf([feat]);
          if (b) map.fitBounds(b as any, { padding: 120, maxZoom: 18 });
        }
      }
    };

    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [activeId, mesuresFC]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Bouton retour France */}
      {selectedDept && (
        <button onClick={onBackToFrance} style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '7px 14px', fontSize: 13, fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif", color: '#2563eb',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ← Tous les départements
        </button>
      )}

      {/* Hint au survol si pas de dept sélectionné */}
      {!selectedDept && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.75)', color: 'white',
          borderRadius: 8, padding: '6px 14px', fontSize: 12,
          fontFamily: "'DM Sans', sans-serif", pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
        }}>
          Cliquer sur un département pour afficher ses mesures
        </div>
      )}
    </div>
  );
};

export default MapView;