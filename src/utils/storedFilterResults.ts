import { DEFAULT_FILTER, type CesbioLibelle, type FilterOptions, type FilterResponse } from "../types";
import type { ZoneHumideMode } from "../types";

/** Reconstitue un FilterResponse depuis projects.last_results (y compris 0 parcelle). */
export function parseStoredFilterResponse(lr: unknown): FilterResponse | null {
  if (!lr || typeof lr !== "object") return null;
  const o = lr as Record<string, unknown>;
  if (!Array.isArray(o.parcelles)) return null;

  const hasCompletedRun =
    typeof o.pool_run_id === "string" ||
    o.pipeline === "filter_v2" ||
    (Array.isArray(o.funnel) && o.funnel.length > 0) ||
    typeof o.total === "number";

  if (!hasCompletedRun && o.parcelles.length === 0) return null;

  return {
    total: typeof o.total === "number" ? o.total : o.parcelles.length,
    final_radius_km: typeof o.final_radius_km === "number" ? o.final_radius_km : 0,
    parcelles: o.parcelles as FilterResponse["parcelles"],
    funnel: Array.isArray(o.funnel) ? (o.funnel as FilterResponse["funnel"]) : [],
    filter_config:
      o.filter_config && typeof o.filter_config === "object"
        ? (o.filter_config as Record<string, unknown>)
        : null,
    pool_run_id: typeof o.pool_run_id === "string" ? o.pool_run_id : null,
    run_created_at: typeof o.run_created_at === "string" ? o.run_created_at : undefined,
  };
}

/** Reconstitue FilterOptions depuis projects.last_filter (faune, ZH, etc.). */
export function parseStoredLastFilter(raw: unknown): FilterOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const lf = raw as Record<string, unknown>;

  const isFilterV2 = lf.pipeline === "filter_v2";
  const isZh =
    lf.study_type === "zones_humides_intra" ||
    lf.zone_humide_mode != null ||
    lf.zones_humides_probables_mode != null;
  const hasCesbio = Array.isArray(lf.cesbio_libelles) && lf.cesbio_libelles.length > 0;
  const hasFaune = Array.isArray(lf.fauna_criteria) && lf.fauna_criteria.length > 0;

  if (!isFilterV2 && !isZh && !hasCesbio && !hasFaune) return null;

  const zhMode = (lf.zone_humide_mode as ZoneHumideMode | undefined) ?? DEFAULT_FILTER.zone_humide_mode;

  return {
    ...DEFAULT_FILTER,
    min_area_ha: Number(lf.min_area_ha ?? DEFAULT_FILTER.min_area_ha),
    miller_threshold: Number(
      lf.miller_thresh ?? lf.miller_threshold ?? DEFAULT_FILTER.miller_threshold,
    ),
    zone_humide_mode: zhMode,
    zones_humides_probables_mode:
      lf.zones_humides_probables_mode === "intersect"
      || lf.zones_humides_probables_mode === "exclude"
      || lf.zones_humides_probables_mode === "ignore"
        ? lf.zones_humides_probables_mode
        : "ignore",
    min_zone_humide_ha:
      typeof lf.min_zone_humide_ha === "number" ? lf.min_zone_humide_ha : undefined,
    troncons_hydros_max_dist_m:
      typeof lf.troncons_hydros_max_dist_m === "number"
        ? lf.troncons_hydros_max_dist_m
        : lf.troncons_hydros_max_dist_m === null
          ? null
          : undefined,
    surfaces_hydros_max_dist_m:
      typeof lf.surfaces_hydros_max_dist_m === "number"
        ? lf.surfaces_hydros_max_dist_m
        : lf.surfaces_hydros_max_dist_m === null
          ? null
          : undefined,
    vegetation_hybride: {
      ...DEFAULT_FILTER.vegetation_hybride,
      cesbio_libelles:
        (Array.isArray(lf.cesbio_libelles)
          ? (lf.cesbio_libelles as CesbioLibelle[])
          : DEFAULT_FILTER.vegetation_hybride.cesbio_libelles),
    },
    excluded_layers: Array.isArray(lf.excluded_layers)
      ? (lf.excluded_layers as string[])
      : DEFAULT_FILTER.excluded_layers,
    fauna_combine: lf.fauna_combine === "and" ? "and" : "or",
    faune_criteria: (
      (lf.fauna_criteria as Array<{
        species?: string;
        tax_nom_val?: string;
        dist_m?: number;
        radius_m?: number;
      }>) ?? []
    ).map((fc) => ({
      tax_nom_val: fc.tax_nom_val ?? fc.species ?? "",
      mode: "within_radius" as const,
      radius_m: fc.radius_m ?? fc.dist_m ?? 1000,
      sources: [],
    })),
    same_bassin_versant: Boolean(lf.same_bassin_versant),
    arrachage_vignes_mode: lf.arrachage_vignes ? "intersect" : DEFAULT_FILTER.arrachage_vignes_mode,
    ebc_mode: Array.isArray(lf.excluded_layers) && lf.excluded_layers.includes("ebc")
      ? "exclude"
      : (lf.ebc_mode as FilterOptions["ebc_mode"]) ?? DEFAULT_FILTER.ebc_mode,
    natura2000_mode:
      Array.isArray(lf.excluded_layers) && lf.excluded_layers.includes("natura_2000")
        ? "exclude"
        : (lf.natura2000_mode as FilterOptions["natura2000_mode"]) ?? DEFAULT_FILTER.natura2000_mode,
    znieff_mode:
      Array.isArray(lf.excluded_layers)
      && (lf.excluded_layers.includes("znieff_1") || lf.excluded_layers.includes("znieff_2"))
        ? "exclude"
        : DEFAULT_FILTER.znieff_mode,
    ...hydroFromSnapshot(lf),
  };
}

function hydroFromSnapshot(lf: Record<string, unknown>): Pick<
  FilterOptions,
  "troncon_hydro_mode" | "troncon_hydro_radius_m" | "surface_hydro_mode" | "surface_hydro_radius_m"
  | "troncons_hydros_max_dist_m" | "surfaces_hydros_max_dist_m"
> {
  const dTr = lf.troncons_hydros_max_dist_m;
  const dSu = lf.surfaces_hydros_max_dist_m;
  const tronconMode =
    typeof dTr === "number" ? (dTr <= 0 ? "intersect" : "within_radius") : DEFAULT_FILTER.troncon_hydro_mode;
  const surfaceMode =
    typeof dSu === "number" ? (dSu <= 0 ? "intersect" : "within_radius") : DEFAULT_FILTER.surface_hydro_mode;
  return {
    troncons_hydros_max_dist_m: typeof dTr === "number" || dTr === null ? (dTr as number | null) : undefined,
    surfaces_hydros_max_dist_m: typeof dSu === "number" || dSu === null ? (dSu as number | null) : undefined,
    troncon_hydro_mode: tronconMode,
    troncon_hydro_radius_m:
      typeof dTr === "number" && dTr > 0 ? dTr : DEFAULT_FILTER.troncon_hydro_radius_m,
    surface_hydro_mode: surfaceMode,
    surface_hydro_radius_m:
      typeof dSu === "number" && dSu > 0 ? dSu : DEFAULT_FILTER.surface_hydro_radius_m,
  };
}

export const FILTER_PRESET_KIND = "kerfoncier.filter_preset.v1";

export function serializeFilterPreset(options: FilterOptions): string {
  return JSON.stringify({ kind: FILTER_PRESET_KIND, options }, null, 2);
}

/** Accepte le JSON copié, un FilterOptions brut, ou un filter_config d'entonnoir. */
export function parseFilterPreset(raw: unknown): FilterOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === FILTER_PRESET_KIND && o.options && typeof o.options === "object") {
    return { ...DEFAULT_FILTER, ...(o.options as FilterOptions) };
  }
  if (o.options && typeof o.options === "object" && "min_area_ha" in (o.options as object)) {
    return { ...DEFAULT_FILTER, ...(o.options as FilterOptions) };
  }
  if ("faune_criteria" in o || "vegetation_hybride" in o) {
    return { ...DEFAULT_FILTER, ...(o as unknown as FilterOptions) };
  }
  return parseStoredLastFilter(raw);
}

export function parseFilterPresetText(text: string): FilterOptions | null {
  try {
    return parseFilterPreset(JSON.parse(text));
  } catch {
    return null;
  }
}
