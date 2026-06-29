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
  };
}
