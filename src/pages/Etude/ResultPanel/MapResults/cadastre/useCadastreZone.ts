// ─── useCadastreZone ─────────────────────────────────────────────────────────
// « Afficher les parcelles de cette zone » : l'utilisateur arme le mode, clique
// sur la carte → GET /cadastre/autour (carré de 1 km) → couche cadastre ajoutée.
// Les clics suivants sur une parcelle cadastre la (dé)sélectionnent.
// Les zones chargées s'accumulent (fusion par idu).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { createMapHoverPopup, hideMapHoverPopup, showMapHoverPopup } from "../mapHoverPopup";

export const CADASTRE_SOURCE = "cadastre-zone";
export const CADASTRE_FILL = "cadastre-zone-fill";
export const CADASTRE_LINE = "cadastre-zone-line";

/** Remonte le cadastre au-dessus des couches de résultat (UF, îlots). */
export function raiseCadastreZone(map: maplibregl.Map | null | undefined) {
  if (!map?.getStyle()) return;
  if (!map.getLayer(CADASTRE_FILL) || !map.getLayer(CADASTRE_LINE)) return;
  try {
    map.moveLayer(CADASTRE_FILL);
    map.moveLayer(CADASTRE_LINE);
  } catch {
    /* style en cours de mise à jour */
  }
}

export interface CadastreProps {
  idu: string;
  code_insee: string | null;
  nom_com: string | null;
  section: string | null;
  numero: string | null;
  contenance: number | null; // m²
}

type CadastreFeature = GeoJSON.Feature<GeoJSON.Geometry, CadastreProps>;

interface Options {
  map: maplibregl.Map | null;
  apiBase: string;
  /** idu déjà présents dans le pool (non sélectionnables, affichés comme tels). */
  poolIdus: Set<string>;
  /** Couches du pool : le cadastre est inséré sous la première, et un clic sur le pool n'est pas intercepté. */
  poolLayerIds?: string[];
  /** Run affiché : permet d'indiquer pourquoi une parcelle du cadastre a été écartée. */
  projectId?: string | null;
  poolRunId?: string | null;
  /**
   * Cartes UF / îlots : l'emprise et les polygones recouvrent tout le carré.
   * Le cadastre est dessiné au-dessus, y compris les parcelles déjà dans le résultat.
   */
  drawAboveResults?: boolean;
  radiusM?: number;
}

export function useCadastreZone({
  map,
  apiBase,
  poolIdus,
  poolLayerIds = [],
  projectId = null,
  poolRunId = null,
  drawAboveResults = false,
  radiusM = 500,
}: Options) {
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [selection, setSelection] = useState<Map<string, CadastreProps>>(new Map());

  const featuresRef = useRef(new Map<string, CadastreFeature>());
  const rejetsRef = useRef(new Map<string, string>());
  const raiseRef = useRef<() => void>(() => {});
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const poolRef = useRef(poolIdus);
  poolRef.current = poolIdus;

  // ── Source + couches (une fois la carte prête) ────────────────────────────
  useEffect(() => {
    if (!map) return;

    const placeAboveBasemap = () => {
      if (!map.getStyle()) return;
      if (!map.getLayer(CADASTRE_FILL) || !map.getLayer(CADASTRE_LINE)) return;
      try {
        if (drawAboveResults) {
          const layers = map.getStyle()?.layers ?? [];
          const top = layers[layers.length - 1]?.id;
          const under = layers[layers.length - 2]?.id;
          if (top === CADASTRE_LINE && under === CADASTRE_FILL) return;
          map.moveLayer(CADASTRE_FILL);
          map.moveLayer(CADASTRE_LINE);
          return;
        }
        const beforeId = poolLayerIds.find((id) => map.getLayer(id));
        if (beforeId) {
          map.moveLayer(CADASTRE_FILL, beforeId);
          map.moveLayer(CADASTRE_LINE, beforeId);
        }
      } catch {
        /* style en cours de mise à jour */
      }
    };
    raiseRef.current = placeAboveBasemap;

    const setup = () => {
      if (!map.getSource(CADASTRE_SOURCE)) {
        map.addSource(CADASTRE_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          promoteId: "idu",
        });
      }
      const beforeId = drawAboveResults ? undefined : poolLayerIds.find((id) => map.getLayer(id));
      if (!map.getLayer(CADASTRE_FILL)) {
        map.addLayer(
          {
            id: CADASTRE_FILL,
            type: "fill",
            source: CADASTRE_SOURCE,
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false], "#e8a33d",
                ["boolean", ["feature-state", "hover"], false], "#f0c078",
                "#f4b942",
              ],
              "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false], 0.62,
                ["boolean", ["feature-state", "hover"], false], 0.5,
                drawAboveResults ? 0.5 : 0.28,
              ],
            },
          },
          beforeId,
        );
      }
      if (!map.getLayer(CADASTRE_LINE)) {
        map.addLayer(
          {
            id: CADASTRE_LINE,
            type: "line",
            source: CADASTRE_SOURCE,
            paint: {
              "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#c45a00", "#e07a12"],
              "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.6, drawAboveResults ? 2 : 1.4],
            },
          },
          beforeId,
        );
      }
      placeAboveBasemap();
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);
    // Cartes UF / îlots : leurs couches arrivent après le cadastre → on le remonte à chaque ajout.
    // Pas de boucle : placeAboveBasemap ne fait rien s'il est déjà au sommet.
    if (drawAboveResults) map.on("styledata", placeAboveBasemap);
    return () => {
      map.off("load", setup);
      map.off("styledata", placeAboveBasemap);
      raiseRef.current = () => {};
    };
  }, [map, poolLayerIds, drawAboveResults]);

  // Parcelles déjà dans le pool : non dessinées par la couche cadastre (le pool les affiche déjà).
  // (line-dasharray n'est pas data-driven dans MapLibre → on filtre plutôt la couche.)
  useEffect(() => {
    if (!map || !map.getLayer(CADASTRE_FILL)) return;
    if (drawAboveResults) {
      // Tout afficher : aucun filtre (["has","idu"] peut tout masquer avec promoteId: "idu").
      map.setFilter(CADASTRE_FILL, null);
      map.setFilter(CADASTRE_LINE, null);
      return;
    }
    const ids = Array.from(poolIdus);
    const filter: maplibregl.FilterSpecification | null = ids.length
      ? ["!", ["in", ["get", "idu"], ["literal", ids]]]
      : null;
    map.setFilter(CADASTRE_FILL, filter);
    map.setFilter(CADASTRE_LINE, filter);
  }, [map, poolIdus, loadedCount, drawAboveResults]);

  const pushData = useCallback(() => {
    if (!map) return;
    const apply = () => {
      const src = map.getSource(CADASTRE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return false;
      src.setData({ type: "FeatureCollection", features: Array.from(featuresRef.current.values()) });
      raiseRef.current();
      if (drawAboveResults) requestAnimationFrame(() => raiseCadastreZone(map));
      return true;
    };
    if (!apply()) {
      const retry = () => { if (apply()) setLoadedCount(featuresRef.current.size); };
      if (map.isStyleLoaded()) map.once("idle", retry);
      else map.once("load", retry);
    }
    setLoadedCount(featuresRef.current.size);
  }, [map, drawAboveResults]);

  // ── Chargement d'une zone ─────────────────────────────────────────────────
  const loadAt = useCallback(
    async (lng: number, lat: number) => {
      if (!map) return;
      setLoading(true);
      setMessage(null);
      try {
        const url = `${apiBase}/cadastre/autour?lon=${lng.toFixed(6)}&lat=${lat.toFixed(6)}&r=${radiusM}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc: GeoJSON.FeatureCollection<GeoJSON.Geometry, CadastreProps> & { truncated?: boolean } =
          await res.json();
        if (!fc.features.length) {
          setMessage("Cadastre non disponible sur ce secteur.");
          return;
        }
        let added = 0;
        for (const raw of fc.features) {
          const geometry = typeof raw.geometry === "string"
            ? JSON.parse(raw.geometry) as GeoJSON.Geometry
            : raw.geometry;
          const idu = raw.properties?.idu != null ? String(raw.properties.idu) : "";
          if (!geometry || !idu) continue;
          const f: CadastreFeature = {
            ...raw,
            geometry,
            properties: { ...raw.properties, idu },
          };
          if (!featuresRef.current.has(idu)) added++;
          featuresRef.current.set(idu, f);
        }
        pushData();
        if (projectId && poolRunId) {
          const idus = fc.features
            .map((f) => (f.properties?.idu != null ? String(f.properties.idu) : ""))
            .filter(Boolean);
          void fetch(`${apiBase}/projects/${projectId}/filtre-rejets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: poolRunId, idus }),
          })
            .then((r) => (r.ok ? r.json() : { rejets: {} }))
            .then((data: { rejets?: Record<string, string> }) => {
              for (const [idu, label] of Object.entries(data.rejets ?? {})) {
                rejetsRef.current.set(idu, label);
              }
            })
            .catch(() => {});
        }
        setMessage(
          fc.truncated
            ? "Zone dense : seules les 5 000 premières parcelles sont affichées."
            : `${added} parcelle(s) chargée(s). Cliquez pour sélectionner.`,
        );
      } catch (e) {
        setMessage(`Erreur de chargement du cadastre (${(e as Error).message}).`);
      } finally {
        setLoading(false);
        setArmed(false);
      }
    },
    [map, apiBase, radiusM, pushData, projectId, poolRunId],
  );

  // ── Clic / survol ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    let hovered: string | null = null;
    const popup = createMapHoverPopup("280px");

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (armedRef.current) {
        loadAt(e.lngLat.lng, e.lngLat.lat);
        return;
      }
      if (!map.getLayer(CADASTRE_FILL)) return;
      // Un clic sur une parcelle du pool reste géré par la carte existante
      const poolLayers = poolLayerIds.filter((id) => map.getLayer(id));
      if (poolLayers.length && map.queryRenderedFeatures(e.point, { layers: poolLayers }).length) return;

      const f = map.queryRenderedFeatures(e.point, { layers: [CADASTRE_FILL] })[0];
      if (!f) return;
      const props = f.properties as CadastreProps;
      if (poolRef.current.has(props.idu)) {
        setMessage(`${props.idu} est déjà dans le pool.`);
        return;
      }
      setSelection((prev) => {
        const next = new Map(prev);
        if (next.has(props.idu)) next.delete(props.idu);
        else next.set(props.idu, props);
        map.setFeatureState({ source: CADASTRE_SOURCE, id: props.idu }, { selected: next.has(props.idu) });
        return next;
      });
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(CADASTRE_FILL)) return;
      const f = map.queryRenderedFeatures(e.point, { layers: [CADASTRE_FILL] })[0];
      const id = (f?.properties as CadastreProps | undefined)?.idu ?? null;
      if (id === hovered) return;
      if (hovered) map.setFeatureState({ source: CADASTRE_SOURCE, id: hovered }, { hover: false });
      hovered = id;
      if (id) map.setFeatureState({ source: CADASTRE_SOURCE, id }, { hover: true });
      const raison = id ? rejetsRef.current.get(id) : undefined;
      if (id && raison && !poolRef.current.has(id)) {
        const safe = raison.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
        showMapHoverPopup(popup, map, `<strong>${id}</strong><br/>Non retenue : ${safe}`);
      } else {
        hideMapHoverPopup(popup);
      }
      map.getCanvas().style.cursor = armedRef.current ? "crosshair" : id ? "pointer" : "";
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    return () => {
      hideMapHoverPopup(popup);
      map.off("click", onClick);
      map.off("mousemove", onMove);
    };
  }, [map, loadAt, poolLayerIds]);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = armed ? "crosshair" : "";
  }, [map, armed]);

  // ── Actions exposées ──────────────────────────────────────────────────────
  const clearSelection = useCallback(() => {
    if (map?.getSource(CADASTRE_SOURCE)) {
      selection.forEach((_, idu) => map.setFeatureState({ source: CADASTRE_SOURCE, id: idu }, { selected: false }));
    }
    setSelection(new Map());
  }, [map, selection]);

  const clearAll = useCallback(() => {
    clearSelection();
    featuresRef.current.clear();
    pushData();
    setMessage(null);
  }, [clearSelection, pushData]);

  const selectedAreaHa = useMemo(
    () => Array.from(selection.values()).reduce((s, p) => s + (p.contenance ?? 0), 0) / 10_000,
    [selection],
  );

  return {
    armed,
    arm: () => {
      setArmed(true);
      setMessage("Cliquez sur la carte à l’endroit où vous voulez afficher le cadastre.");
    },
    cancel: () => { setArmed(false); setMessage(null); },
    loading,
    message,
    loadedCount,
    selection,
    selectedIdus: Array.from(selection.keys()),
    selectedAreaHa,
    clearSelection,
    clearAll,
  };
}
