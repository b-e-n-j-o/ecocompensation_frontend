import type { ParcelPoolMetricRow, VegetationHybrideValue } from "../types";

/** Plus grande part relative dans le zonage hybride (0–1), pour tri. */
export function getDominantVegetationRatio(metrics: ParcelPoolMetricRow[] | undefined): number {
  if (!metrics?.length) return 0;
  const row = metrics.find((m) => m.metric_key === "vegetation_hybride_ratio");
  const raw = row?.metric_value_jsonb?.ratios;
  if (!raw || typeof raw !== "object") return 0;
  let max = 0;
  for (const v of Object.values(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) max = Math.max(max, v);
  }
  return max;
}

/** Chaîne de priorité pour le tri : natures BD TOPO (ordre de clic), puis classes CESBIO (ordre de clic). */
export function buildVegetationPriorityChain(veg: VegetationHybrideValue | null | undefined): string[] {
  if (!veg) return [];
  return [...veg.zdv_natures, ...veg.cesbio_libelles];
}

/** Ratios + surface totale d’intersection (m²) — pour passer des parts relatives aux surfaces par classe. */
function getVegetationHybridMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): { ratios: Record<string, number>; totalM2: number } | null {
  const row = metrics?.find((m) => m.metric_key === "vegetation_hybride_ratio");
  const payload = row?.metric_value_jsonb;
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { ratios?: unknown; total_intersection_area_m2?: unknown }).ratios;
  const totalRaw = (payload as { total_intersection_area_m2?: unknown }).total_intersection_area_m2;
  if (!raw || typeof raw !== "object") return null;
  const totalM2 =
    typeof totalRaw === "number" && Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : 0;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  return { ratios: out, totalM2 };
}

/** Ratio pour un libellé filtre vs clés `libelle_prio` des métriques (exact puis insensible à la casse). */
function ratioForLabel(ratios: Record<string, number>, wanted: string): number {
  if (ratios[wanted] != null) return ratios[wanted];
  const w = wanted.trim().toLowerCase();
  for (const [k, v] of Object.entries(ratios)) {
    if (k.trim().toLowerCase() === w) return v;
  }
  return 0;
}

/** Surface (m²) de la classe `wanted` dans l’intersection couche / parcelle. */
function intersectionM2ForLabel(
  ratios: Record<string, number>,
  totalM2: number,
  wanted: string,
): number {
  return ratioForLabel(ratios, wanted) * totalM2;
}

/**
 * Tri lexicographique décroissant sur les **surfaces d’intersection (m²)** par classe prioritaire,
 * pas sur les pourcentages seuls (évite de favoriser 100 % sur une toute petite intersection totale).
 */
export function compareByVegetationPriority(
  iduA: string,
  iduB: string,
  priorityChain: string[],
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null | undefined,
): number {
  const ma = getVegetationHybridMetric(poolMetricsByIdu?.[iduA]);
  const mb = getVegetationHybridMetric(poolMetricsByIdu?.[iduB]);
  if (!ma && !mb) return 0;
  if (!ma) return 1;
  if (!mb) return -1;
  for (const label of priorityChain) {
    const va = intersectionM2ForLabel(ma.ratios, ma.totalM2, label);
    const vb = intersectionM2ForLabel(mb.ratios, mb.totalM2, label);
    const diff = vb - va;
    if (Math.abs(diff) > 1e-3) return diff;
  }
  return 0;
}
