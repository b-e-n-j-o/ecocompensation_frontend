// ─── Types partagés ──────────────────────────────────────────────────────────

export type HydroMode = "none" | "intersect" | "within_radius";

export const ZDV_NATURES = [
  "Bois",
  "Forêt fermée de conifères",
  "Forêt fermée de feuillus",
  "Forêt fermée mixte",
  "Forêt ouverte",
  "Haie",
  "Lande ligneuse",
  "Peupleraie",
  "Verger",
  "Vigne",
] as const;

export type ZdvNature = (typeof ZDV_NATURES)[number];

export interface FilterOptions {
  // ZDV
  zdv_natures: ZdvNature[];

  // Exclusions de couches (par clé LAYER_REGISTRY)
  excluded_layers: string[];

  // Hydrologie
  troncon_hydro_mode: HydroMode;
  troncon_hydro_radius_m: number;
  surface_hydro_mode: HydroMode;
  surface_hydro_radius_m: number;

  // Géométrie
  miller_threshold: number;
  min_area_ha: number;

  // Distance & cible
  radius_start_km: number;
  radius_min_km: number;
  target_count: number;

  // Poids scoring
  score_dist_lt2km: number;
  score_dist_lt5km: number;
  score_dist_lt10km: number;
  score_surface_ge20ha: number;
  score_miller_ge05: number;
  score_hydro_lt100m: number;

  // Seuils du scoring (configurables)
  score_threshold_miller: number;
  score_threshold_surface_ha: number;
  score_threshold_hydro_m: number;
  score_threshold_dist_2km: number;
  score_threshold_dist_5km: number;
}

export const DEFAULT_FILTER: FilterOptions = {
  zdv_natures: ["Forêt ouverte"],
  excluded_layers: ["geomce", "patrimoine_naturel"],
  troncon_hydro_mode: "intersect",
  troncon_hydro_radius_m: 500,
  surface_hydro_mode: "within_radius",
  surface_hydro_radius_m: 500,
  miller_threshold: 0.39,
  min_area_ha: 7,
  radius_start_km: 10,
  radius_min_km: 1,
  target_count: 50,
  score_dist_lt2km: 3,
  score_dist_lt5km: 2,
  score_dist_lt10km: 1,
  score_surface_ge20ha: 1,
  score_miller_ge05: 1,
  score_hydro_lt100m: 1,
  score_threshold_miller: 0.5,
  score_threshold_surface_ha: 20,
  score_threshold_hydro_m: 100,
  score_threshold_dist_2km: 2,
  score_threshold_dist_5km: 5,
};

// ─── Résultats ───────────────────────────────────────────────────────────────

export interface ScoreDetail {
  critere: string;
  points: number;
  raison: string;
}

export interface ParcelleResult {
  rank: number;
  idu: string;
  code_insee: string;
  section: string;
  numero: string;
  surface_ha: number;
  miller: number;
  distance_km: number;
  dist_hydro_m: number | null;
  score: number;
  score_details: ScoreDetail[];
}

export interface FunnelStep {
  step: number;
  label: string;
  count: number;
}

export interface FilterResponse {
  total: number;
  final_radius_km: number;
  parcelles: ParcelleResult[];
  funnel?: FunnelStep[];
}
