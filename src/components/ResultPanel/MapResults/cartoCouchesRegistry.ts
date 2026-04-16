/**
 * cartoCouchesRegistry.ts
 * ────────────────────────
 * Registry partagé des couches thématiques de résultats.
 * Importé par ParcellesMap.tsx et SousEnsemblesMap.tsx.
 *
 * Pour ajouter une couche :
 *   1) Ajouter une entrée dans RESULTS_LAYERS ici
 *   2) Ajouter dans LAYER_TABLE_MAP + LAYER_PROPERTIES côté backend (results_geojson_router.py)
 */

import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

/** Données préchargées après filtrage (toutes les couches RESULTS_LAYERS en parallèle). */
export type ResultsThematicPreload = Record<
  string,
  { geojson: FeatureCollection<Geometry, GeoJsonProperties> | null; error: string | null }
>;

export interface ResultsLayerDef {
    /** Clé URL backend — doit matcher LAYER_TABLE_MAP dans results_geojson_router.py */
    key: string;
    /** Label affiché dans la légende */
    label: string;
    /** Couleur de remplissage par défaut (utilisée si pas de discriminantField) */
    fillColor: string;
    /** Couleur du contour */
    lineColor: string;
    fillOpacity: number;
    lineWidth: number;
    /**
     * Si défini, les entités sont colorées selon les valeurs distinctes de cet attribut.
     * La légende affiche une sous-légende dépliable par valeur.
     */
    discriminantField?: string;
    /** Champs affichés dans le popup au survol */
    popupFields: { field: string; label: string }[];
  }
  
  export type LayerLoadState = "idle" | "loading" | "loaded" | "error";
  
  export interface ThematicLayerState {
    visible: boolean;
    loadState: LayerLoadState;
    geojson: { type: "FeatureCollection"; features: { properties?: Record<string, unknown> | null }[] } | null;
    error: string | null;
    /** Valeurs discriminantes actuellement actives ; null/undefined = toutes. */
    selectedValues?: string[] | null;
  }
  
  /** Palette de couleurs pour la coloration par discriminantField */
  export const DISCRIMINANT_PALETTE = [
    "#84cc16", "#38bdf8", "#f59e0b", "#a78bfa",
    "#f472b6", "#34d399", "#fb923c", "#60a5fa",
    "#e879f9", "#4ade80", "#fbbf24", "#818cf8",
  ];
  
  export const RESULTS_LAYERS: ResultsLayerDef[] = [
    {
      key: "fauna",
      label: "Observations faune",
      fillColor: "#f97316",
      lineColor: "#c2410c",
      fillOpacity: 0.15,
      lineWidth: 1.5,
      discriminantField: "nom_vernaculaire",
      popupFields: [
        { field: "nom_vernaculaire", label: "Nom vernaculaire" },
        { field: "nom_taxref", label: "Nom taxref" },
        { field: "niveau_patrimonialite", label: "Niveau patrimonialité" },
        { field: "protection_nationale", label: "Protection nationale" },
        { field: "cd_ref", label: "CD_REF" },
        { field: "geom_type", label: "Type géométrie" },
        { field: "date_debut", label: "Date début" },
        { field: "date_fin", label: "Date fin" },
      ],
    },
    {
      key: "vegetation_hybride",
      label: "Végétation hybride (BD TOPO + CESBIO)",
      fillColor: "#86efac",
      lineColor: "#15803d",
      fillOpacity: 0.2,
      lineWidth: 1.5,
      discriminantField: "libelle_prio",
      popupFields: [
        { field: "libelle_prio", label: "Libellé" },
        { field: "source", label: "Source" },
      ],
    },
    {
      key: "zone_humide",
      label: "Zones humides",
      fillColor: "#38bdf8",
      lineColor: "#0369a1",
      fillOpacity: 0.25,
      lineWidth: 1.5,
      discriminantField: "source",
      popupFields: [
        { field: "source", label: "Source" },
        { field: "libelle", label: "Libellé" },
        { field: "inv_nom", label: "Inventaire" },
      ],
    },
    {
      key: "ebc",
      label: "Espaces boisés classés",
      fillColor: "#22c55e",
      lineColor: "#166534",
      fillOpacity: 0.15,
      lineWidth: 1.5,
      discriminantField: "libelle",
      popupFields: [{ field: "libelle", label: "Libellé" }],
    },
    // Décommenter quand backend prêt :
    // {
    //   key: "troncons_hydro",
    //   label: "Tronçons hydrologiques",
    //   fillColor: "#60a5fa", lineColor: "#1d4ed8",
    //   fillOpacity: 0.2, lineWidth: 2,
    //   popupFields: [{ field: "nature", label: "Nature" }],
    // },
  ];
  
  /** Construit l'état initial des couches thématiques */
  export function buildInitialThematic(): Record<string, ThematicLayerState> {
    return Object.fromEntries(
      RESULTS_LAYERS.map((d) => [
        d.key,
        { visible: false, loadState: "idle" as LayerLoadState, geojson: null, error: null },
      ])
    );
  }
  
  /** Extrait les valeurs distinctes d'un champ dans un GeoJSON */
  export function extractDistinctValues(
    geojson: ThematicLayerState["geojson"],
    field: string,
  ): string[] {
    if (!geojson) return [];
    const seen = new Set<string>();
    for (const f of geojson.features) {
      const v = f.properties?.[field];
      if (v != null && String(v).trim() !== "") seen.add(String(v));
    }
    return Array.from(seen).sort();
  }
  
  /** Génère une couleur stable pour une valeur de discriminant */
  export function discriminantColor(value: string, palette: string[]): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }
  
  /** Identifiants MapLibre pour une couche thématique */
  export function thematicLayerIds(key: string) {
    return {
      sourceId: `results-${key}`,
      fillId:   `results-${key}-fill`,
      lineId:   `results-${key}-line`,
    circleId: `results-${key}-circle`,
    };
  }
  
  /** Expression MapLibre "match" pour coloration par valeur discriminante */
  export function buildDiscriminantColorExpression(
    field: string,
    geojson: ThematicLayerState["geojson"],
    fallbackColor: string,
  ): unknown[] {
    const values = extractDistinctValues(geojson, field);
    const expr: unknown[] = ["match", ["to-string", ["get", field]]];
    values.forEach((val, i) => {
      expr.push(val, DISCRIMINANT_PALETTE[i % DISCRIMINANT_PALETTE.length]);
    });
    expr.push(fallbackColor);
    return expr;
  }