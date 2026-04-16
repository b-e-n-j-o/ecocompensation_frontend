// ─── Types partagés ──────────────────────────────────────────────────────────

export type HydroMode = "none" | "intersect" | "within_radius";

/** Couche binaire/ternaire : ignorer, imposer une intersection, ou exclure si intersection. */
export type LayerIntersectMode = "ignore" | "intersect" | "exclude";
/** Arrachage de vignes : intersecter la couche, l’exclure, ou ignorer le critère. */
export type ArrachageVignesMode = LayerIntersectMode;
/** Zones humides : intersecter la couche, l’exclure, ou ignorer le critère. */
export type ZoneHumideMode = LayerIntersectMode;
export type FauneMode = "intersect" | "within_radius";
export type FauneObservationSource = "pct" | "lin" | "surf";

export const ZDV_NATURES = [
  "Bois",
  "Forêt fermée de conifères",
  "Forêt fermée de feuillus",
  "Forêt fermée mixte",
  "Forêt ouverte",
  "Haie",
  "Lande ligneuse",
  "Lande herbacée",
  "Peupleraie",
  "Verger",
  "Vigne",
] as const;

export type ZdvNature = (typeof ZDV_NATURES)[number];

/** Nomenclature CESBIO (OCS-GE), alignée sur le backend / migration SQL. */
export const CESBIO_LIBELLES = [
  "Bâtis denses",
  "Bâtis diffus",
  "Zones industrielles et commerciales",
  "Surfaces routes",
  "Colza",
  "Céréales à pailles",
  "Protéagineux",
  "Soja",
  "Tournesol",
  "Maïs",
  "Riz",
  "Tubercules/racines",
  "Prairies",
  "Vergers",
  "Vignes",
  "Forêts de feuillus",
  "Forêts de conifères",
  "Pelouses",
  "Landes ligneuses",
  "Surfaces minérales",
  "Plages et dunes",
  "Glaciers ou neiges",
  "Eau",
  "Autres",
  "Inconnu",
] as const;

export type CesbioLibelle = (typeof CESBIO_LIBELLES)[number];

export type VegetationHybrideMode = "OR" | "AND";

/**
 * Ordre dans `zdv_natures` puis `cesbio_libelles` = priorité (rang 1, 2…) pour scoring / tri résultats.
 * Persisté tel quel dans `last_filter` (JSON) côté projet.
 */
export interface VegetationHybrideValue {
  zdv_natures: ZdvNature[];
  cesbio_libelles: CesbioLibelle[];
  mode: VegetationHybrideMode;
}

export const DEFAULT_VEGETATION_HYBRIDE: VegetationHybrideValue = {
  zdv_natures: [],
  cesbio_libelles: [],
  mode: "OR",
};

/**
 * Libellés EUNIS (`nom_eunis`) proposés pour le filtre Carhab — alignés sur la nomenclature usuelle des données nationales.
 * Étendre la liste si vos jeux utilisent d’autres libellés exacts.
 */
export const CARHAB_NOM_EUNIS = [
  "Forêts caducifoliées",
  "Forêts de feuillus",
  "Forêts de conifères",
  "Forêts mixtes",
  "Forêts méditerranéennes",
  "Forêts alluviales",
  "Peuplements ripicoles",
  "Peuplements de ravins",
  "Forêts de Quercus",
  "Forêts de Fagus",
  "Pinèdes",
  "Peupleraies",
  "Haies",
  "Landes",
  "Landes humides",
  "Landes sèches",
  "Pelouses",
  "Pelouses calcaires",
  "Pelouses acidophiles",
  "Prairies mésophiles",
  "Prairies humides",
  "Prairies montagnardes",
  "Prairies de fauche",
  "Prairies permanentes",
  "Tourbières",
  "Tourbières boisées",
  "Marais",
  "Marais basiques",
  "Roselières",
  "Zones humides",
  "Végétation aquatique",
  "Vergers",
  "Vignes",
  "Cultures",
  "Cultures céréalières",
  "Jardins",
  "Parcs",
  "Zones urbaines",
  "Zones industrielles",
  "Carrières",
  "Falaises",
  "Rochers",
  "Sables",
  "Dunes",
  "Maquis",
  "Garrigues",
  "Estuaires",
  "Lagunes",
  "Zones côtières",
] as const;

export type CarhabNomEunis = (typeof CARHAB_NOM_EUNIS)[number];

export interface FauneCriterion {
  tax_nom_val: string;
  mode: FauneMode;
  radius_m: number;
  sources: FauneObservationSource[];
}

export interface FilterOptions {
  /** Active le calcul détaillé de l'entonnoir (plus lent). */
  funnel_mode: boolean;
  /** Filtre vegetation hybride (BD TOPO nature + CESBIO libelle). */
  vegetation_hybride: VegetationHybrideValue;

  /**
   * Arrachage de vignes (`ecocompensation_results.arrachage_vignes`) :
   * parcelle doit intersecter / ne doit pas intersecter / critère ignoré.
   */
  arrachage_vignes_mode: ArrachageVignesMode;
  /** Zones humides (`ecocompensation_results.zone_humide`) : intersecter, exclure, ou ignorer. */
  zone_humide_mode: ZoneHumideMode;

  /**
   * Remontées de nappes — `classefiab` dans `ecocompensation_results.remontee_de_nappes` ;
   * intersection avec au moins une entité dont la valeur est dans la liste ; [] = neutre.
   */
  remontee_nappes_classefiab: string[];

  /** Espaces boisés classés — table `ecocompensation_results.ebc`. */
  ebc_mode: LayerIntersectMode;
  /** Sites Natura 2000 — table `ecocompensation_results.natura2000`. */
  natura2000_mode: LayerIntersectMode;
  /** Réserves naturelles — table `ecocompensation_results.reserves_naturelles`. */
  reserves_naturelles_mode: LayerIntersectMode;
  /** ZNIEFF (types I et II) — table `ecocompensation_results.znieff`. */
  znieff_mode: LayerIntersectMode;

  /** Carhab — libellés EUNIS (`nom_eunis`) ; intersection avec au moins un polygone ; [] = neutre. */
  carhab_nom_eunis: CarhabNomEunis[];

  // Exclusions de couches (par clé LAYER_REGISTRY)
  excluded_layers: string[];

  // Hydrologie
  troncon_hydro_mode: HydroMode;
  troncon_hydro_radius_m: number;
  surface_hydro_mode: HydroMode;
  surface_hydro_radius_m: number;

  // Faune
  faune_criteria: FauneCriterion[];

  // Géométrie
  miller_threshold: number;
  min_area_ha: number;

  // Distance & cible
  radius_start_km: number;
  radius_min_km: number;
  target_count: number;

}

export const DEFAULT_FILTER: FilterOptions = {
  funnel_mode: false,
  vegetation_hybride: DEFAULT_VEGETATION_HYBRIDE,
  arrachage_vignes_mode: "ignore",
  zone_humide_mode: "ignore",
  remontee_nappes_classefiab: [],
  ebc_mode: "ignore",
  natura2000_mode: "ignore",
  reserves_naturelles_mode: "ignore",
  znieff_mode: "ignore",
  carhab_nom_eunis: [],
  excluded_layers: ["geomce"],
  troncon_hydro_mode: "none",
  troncon_hydro_radius_m: 500,
  surface_hydro_mode: "none",
  surface_hydro_radius_m: 500,
  faune_criteria: [],
  miller_threshold: 0.4,
  min_area_ha: 1,
  radius_start_km: 10,
  radius_min_km: 1,
  target_count: 50,
};

// ─── Résultats ───────────────────────────────────────────────────────────────

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
  /** Run du pool persisté en base (métriques par parcelle). */
  pool_run_id?: string | null;
  /** Présent quand les résultats sont chargés depuis un run historique (GET snapshot). */
  run_created_at?: string | null;
}

/** Ligne de liste GET /pool/runs */
export interface PoolRunListItem {
  id: string;
  project_id: string;
  scope: string;
  options_json: Record<string, unknown>;
  total_count: number;
  created_at: string;
}

/** GET …/pool/runs/{run_id}/snapshot — reconstitue un filtre + résultats parcelles. */
export interface PoolRunSnapshot extends FilterResponse {
  filter_options: FilterOptions;
  run_created_at: string | null;
}

/** Ligne renvoyée par GET /pool/{idu}/metrics */
export interface ParcelPoolMetricRow {
  metric_key: string;
  metric_value_jsonb: Record<string, unknown>;
  updated_at?: string | null;
}

/**
 * Charge utile métrique `vegetation_hybride_ratio` (zonage relatif sur la parcelle).
 * Même forme pour `cosia_zonage_ratio` (COSIA / parcelle).
 * Pour `carhab_eunis_ratio` : `ratios` = part de la surface parcelle couverte par chaque
 * classe (recouvrements possibles) ; `total_intersection_area_m2` = surface parcelle (référence).
 */
export interface VegetationHybridePoolMetricPayload {
  ratios: Record<string, number>;
  total_intersection_area_m2: number;
}

/** Réponse GET /pool/metrics?run_id= (toutes les parcelles du run). */
export interface PoolMetricsBulkResponse {
  run_id: string;
  by_idu: Record<string, ParcelPoolMetricRow[]>;
  total_parcelles: number;
}

/** Tri du tableau de classement (parcelles). */
export type RankingSortKey =
  | "rank"
  | "composite_score"
  | "durete_score"
  | "distance"
  | "surface"
  | "miller"
  | "veg_dominant"
  /** Ordre décroissant des parts `libelle_prio` selon la chaîne BD TOPO puis CESBIO du dernier filtre. */
  | "veg_priority";

// ─── Résultats UF (unités foncières / sous-ensembles) ───────────────────────

export interface SousEnsembleResult {
  subset_id: string;
  k: number;
  idus: string[];
  surface_ha: number;
  miller: number;
  distance_centre_km: number;
  dist_hydro_m: number | null;
  /** Propriétaire personne morale (raison sociale) */
  denomination?: string | null;
  /** SIREN du propriétaire moral */
  siren?: string | null;
}

export interface UniteFoncieresResult {
  rang: number;
  uf_id: string;
  nb_parcelles: number;
  idus: string[];
  best_surface_ha: number;
  best_miller: number;
  distance_centre_km: number;
  denomination?: string | null;
  siren?: string | null;
  sous_ensembles: SousEnsembleResult[];
}

export interface UfFilterResponse {
  total_uf: number;
  total_sous_ensembles: number;
  unites_foncieres: UniteFoncieresResult[];
  funnel?: FunnelStep[];
  memory?: unknown;
}
