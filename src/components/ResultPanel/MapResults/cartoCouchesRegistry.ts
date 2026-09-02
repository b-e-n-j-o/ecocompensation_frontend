/**
 * cartoCouchesRegistry.ts
 * ────────────────────────
 * Registry partagé des couches thématiques de résultats.
 * Importé par ParcellesMap.tsx et SousEnsemblesMap.tsx.
 *
 * Couches filter_v2 (nationales, clippées AOI) : cesbio, fauna, fauna_buffer
 * → backend/map_layers.py + GET /geojson/results/{key}?run_id=…
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
      key: "cesbio",
      label: "Végétation CESBIO",
      fillColor: "#86efac",
      lineColor: "#15803d",
      fillOpacity: 0.22,
      lineWidth: 1.5,
      discriminantField: "libelle_prio",
      popupFields: [
        { field: "libelle_prio", label: "Libellé prioritaire" },
        { field: "libelle", label: "Libellé" },
        { field: "nature", label: "Nature" },
        { field: "source", label: "Source" },
      ],
    },
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
      key: "fauna_buffer",
      label: "Buffers faune",
      fillColor: "#f472b6",
      lineColor: "#db2777",
      fillOpacity: 0.08,
      lineWidth: 1,
      discriminantField: "nom_vernaculaire",
      popupFields: [
        { field: "nom_vernaculaire", label: "Espèce" },
        { field: "buffer_m", label: "Buffer (m)" },
        { field: "id_obs", label: "ID observation" },
      ],
    },
  ];

/** Couches thématiques zones humides (ecocompensation_results.*). */
export const ZH_RESULTS_LAYERS: ResultsLayerDef[] = [
  {
    key: "zone_humide",
    label: "Zones humides établies",
    fillColor: "#38bdf8",
    lineColor: "#0369a1",
    fillOpacity: 0.28,
    lineWidth: 1.5,
    popupFields: [
      { field: "libelle", label: "Libellé" },
      { field: "source", label: "Source" },
      { field: "inv_nom", label: "Inventaire" },
    ],
  },
  {
    key: "zones_humides_probables",
    label: "Zones humides probables",
    fillColor: "#67e8f9",
    lineColor: "#0891b2",
    fillOpacity: 0.2,
    lineWidth: 1,
    discriminantField: "value",
    popupFields: [
      { field: "value", label: "Probabilité" },
      { field: "rid", label: "Tuile raster" },
    ],
  },
  {
    key: "espaces_naturels_sensibles_ens",
    label: "Espaces naturels sensibles (ENS)",
    fillColor: "#4ade80",
    lineColor: "#15803d",
    fillOpacity: 0.22,
    lineWidth: 1.5,
    discriminantField: "nom_site",
    popupFields: [
      { field: "nom_site", label: "Site" },
      { field: "commune", label: "Commune" },
      { field: "texte", label: "Texte" },
    ],
  },
  {
    key: "preemption_ens",
    label: "Préemption ENS",
    fillColor: "#fbbf24",
    lineColor: "#b45309",
    fillOpacity: 0.18,
    lineWidth: 1.5,
    discriminantField: "nom_zpens",
    popupFields: [
      { field: "nom_zpens", label: "Zone préemption" },
      { field: "commune", label: "Commune" },
      { field: "texte", label: "Texte" },
    ],
  },
  {
    key: "troncons_hydros",
    label: "Cours d'eau (tronçons hydro)",
    fillColor: "transparent",
    lineColor: "#2563eb",
    fillOpacity: 0,
    lineWidth: 2.5,
    discriminantField: "nature",
    popupFields: [
      { field: "nom", label: "Nom" },
      { field: "nature", label: "Nature" },
      { field: "classe_de_largeur", label: "Classe de largeur" },
      { field: "numero_d_ordre", label: "N° d'ordre" },
      { field: "code_hydrographique", label: "Code hydro" },
      { field: "type_de_bras", label: "Type de bras" },
    ],
  },
  {
    key: "surfaces_hydros",
    label: "Surfaces hydrographiques",
    fillColor: "#7dd3fc",
    lineColor: "#0284c7",
    fillOpacity: 0.35,
    lineWidth: 1.5,
    discriminantField: "nature",
    popupFields: [
      { field: "nom", label: "Nom" },
      { field: "nature", label: "Nature" },
      { field: "position_par_rapport_au_sol", label: "Position / sol" },
      { field: "statut", label: "Statut" },
      { field: "code_hydrographique", label: "Code hydro" },
    ],
  },
];

export const ALL_RESULTS_LAYERS: ResultsLayerDef[] = [
  ...RESULTS_LAYERS,
  ...ZH_RESULTS_LAYERS.filter((z) => !RESULTS_LAYERS.some((r) => r.key === z.key)),
];

export function getResultsLayerDefs(keys: string[]): ResultsLayerDef[] {
  return keys
    .map((key) => ALL_RESULTS_LAYERS.find((d) => d.key === key))
    .filter((d): d is ResultsLayerDef => !!d);
}

/** Construit l'état initial des couches thématiques */
export function buildInitialThematic(layerKeys?: string[]): Record<string, ThematicLayerState> {
  const defs = layerKeys ? getResultsLayerDefs(layerKeys) : ALL_RESULTS_LAYERS;
  return Object.fromEntries(
    defs.map((d) => [
      d.key,
      { visible: false, loadState: "idle" as LayerLoadState, geojson: null, error: null },
    ]),
  );
}

/** @deprecated Utiliser buildInitialThematic(keys) */
export function buildInitialThematicLegacy(): Record<string, ThematicLayerState> {
  return buildInitialThematic(RESULTS_LAYERS.map((d) => d.key));
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