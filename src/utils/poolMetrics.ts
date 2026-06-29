import type { ParcelPoolMetricRow, VegetationHybrideValue } from "../types";

export type FilterEnrichPayload = {
  veg_libelles?: string[];
  fauna_distances?: Record<string, number>;
  zone_humide_ha?: number;
  dist_hydro_m?: number;
  troncons_hydro_info?: Array<{
    cleabs?: string | null;
    nom?: string | null;
    nature?: string | null;
    classe_de_largeur?: string | null;
    numero_d_ordre?: number | null;
    dist_m?: number | null;
  }>;
  dist_surface_hydro_m?: number;
  surface_hydro_ha?: number;
  surfaces_hydro_info?: Array<{
    cleabs?: string | null;
    nom?: string | null;
    nature?: string | null;
    position_par_rapport_au_sol?: string | null;
    statut?: string | null;
    dist_m?: number | null;
    intersect_ha?: number | null;
  }>;
};

/** Métrique légère filter_v2 (zonage CESBIO + distances faune KNN). */
export function getFilterEnrich(
  metrics: ParcelPoolMetricRow[] | undefined,
): FilterEnrichPayload | null {
  const row = metrics?.find((m) => m.metric_key === "filter_enrich");
  const payload = row?.metric_value_jsonb;
  if (!payload || typeof payload !== "object") return null;
  return payload as FilterEnrichPayload;
}

export function getFilterEnrichCesbioLabel(
  metrics: ParcelPoolMetricRow[] | undefined,
): string | null {
  const veg = getFilterEnrich(metrics)?.veg_libelles;
  if (!Array.isArray(veg) || veg.length === 0) return null;
  const labels = veg.map((v) => String(v).trim()).filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

export type FilterEnrichFaunaCell = {
  espece: string | null;
  distanceM: number | null;
  /** Détail multi-espèces pour l’attribut title. */
  detail: string | null;
};

/** Espèce + distance depuis filter_enrich.fauna_distances (filter_v2). */
export function getFilterEnrichFaunaCell(
  metrics: ParcelPoolMetricRow[] | undefined,
): FilterEnrichFaunaCell {
  const fd = getFilterEnrich(metrics)?.fauna_distances;
  if (!fd || typeof fd !== "object") {
    return { espece: null, distanceM: null, detail: null };
  }

  const parsed = Object.entries(fd)
    .map(([species, distRaw]) => {
      const dist = typeof distRaw === "number" ? distRaw : Number(distRaw);
      return { species: species.trim(), dist };
    })
    .filter((e) => e.species);

  if (!parsed.length) {
    return { espece: null, distanceM: null, detail: null };
  }

  const valid = parsed.filter((e) => Number.isFinite(e.dist) && e.dist >= 0);
  const detail = parsed
    .map(({ species, dist }) =>
      Number.isFinite(dist) && dist >= 0
        ? `${species} : ${Math.round(dist).toLocaleString("fr-FR")} m`
        : `${species} : —`,
    )
    .join(" · ");

  if (!valid.length) {
    return {
      espece: parsed.length === 1 ? parsed[0].species : null,
      distanceM: null,
      detail,
    };
  }

  const best = [...valid].sort((a, b) => a.dist - b.dist)[0];
  return {
    espece: best.species,
    distanceM: best.dist,
    detail: parsed.length > 1 ? detail : null,
  };
}

export type FaunaTableEntry = {
  species: string;
  distanceM: number;
};

/** Liste espèce + distance (filter_v2 ou legacy) pour affichage tableau empilé. */
export function getFaunaTableEntries(
  metrics: ParcelPoolMetricRow[] | undefined,
): FaunaTableEntry[] {
  const fd = getFilterEnrich(metrics)?.fauna_distances;
  if (fd && typeof fd === "object") {
    const entries = Object.entries(fd)
      .map(([species, distRaw]) => {
        const dist = typeof distRaw === "number" ? distRaw : Number(distRaw);
        return { species: species.trim(), distanceM: dist };
      })
      .filter((e) => e.species && Number.isFinite(e.distanceM) && e.distanceM >= 0)
      .sort((a, b) => a.distanceM - b.distanceM || a.species.localeCompare(b.species, "fr"));
    if (entries.length) return entries;
  }

  const row = metrics?.find((m) => m.metric_key === "especes_faune");
  const payload = row?.metric_value_jsonb;
  if (!payload || typeof payload !== "object") return [];

  const rec = payload as Record<string, unknown>;
  const intersects = rec.intersects_any === true;
  const distRaw = rec.nearest_observation_distance_m;
  const distanceM =
    intersects
      ? 0
      : typeof distRaw === "number" && Number.isFinite(distRaw) && distRaw >= 0
        ? distRaw
        : null;

  const interRaw = rec.intersections_by_species;
  if (intersects && interRaw && typeof interRaw === "object") {
    const fromInter = Object.entries(interRaw as Record<string, unknown>)
      .map(([label, cnt]) => ({
        species: String(label ?? "").trim(),
        count: typeof cnt === "number" && Number.isFinite(cnt) ? cnt : 0,
      }))
      .filter((e) => e.species && e.count > 0)
      .sort((a, b) => (b.count === a.count ? a.species.localeCompare(b.species, "fr") : b.count - a.count))
      .map((e) => ({ species: e.species, distanceM: 0 }));
    if (fromInter.length) return fromInter;
  }

  const nearestRaw = rec.nearest_species;
  const nearest = typeof nearestRaw === "string" && nearestRaw.trim() ? nearestRaw.trim() : null;
  if (nearest && distanceM != null) {
    return [{ species: nearest, distanceM }];
  }
  return [];
}

export type PersonnesMoralesMetric = {
  intersects_pm_database: boolean;
  compensation_deja_realisee: boolean;
  parcelle_deja_en_mc: boolean | null;
  nb_mc_distinctes: number | null;
  nb_parcelles_deja_en_mc: number | null;
  surface_deja_en_mc_m2: number | null;
};

function parseOptionalMetricInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  return null;
}

/** Métrique `parcelles_personnes_morales` pour tri / affichage tableau. */
export function getPersonnesMoralesMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): PersonnesMoralesMetric | null {
  const row = metrics?.find((m) => m.metric_key === "parcelles_personnes_morales");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  return {
    intersects_pm_database: rec.intersects_pm_database === true,
    compensation_deja_realisee: rec.compensation_deja_realisee === true,
    parcelle_deja_en_mc: typeof rec.parcelle_deja_en_mc === "boolean" ? rec.parcelle_deja_en_mc : null,
    nb_mc_distinctes: parseOptionalMetricInt(rec.nb_mc_distinctes),
    nb_parcelles_deja_en_mc: parseOptionalMetricInt(rec.nb_parcelles_deja_en_mc),
    surface_deja_en_mc_m2:
      typeof rec.surface_deja_en_mc_m2 === "number" && Number.isFinite(rec.surface_deja_en_mc_m2)
        ? rec.surface_deja_en_mc_m2
        : null,
  };
}

export type DureteFonciereMetric = {
  eligible: boolean;
  reason: string | null;
  score_final: number | null;
  attractivite_fonciere: number | null;
  niveau_durete: string | null;
  explication: string | null;
  siren: string | null;
  denomination: string | null;
  intersects_arrachage_vigne: boolean;
  detail_axes: {
    axe1?: number | null;
    axe1_note?: string | null;
    axe2?: number | null;
    axe2_note?: string | null;
    axe3?: number | null;
    axe3_note?: string | null;
    axe4?: number | null;
    axe4_note?: string | null;
    surcharges?: number | null;
    surcharges_note?: string | null;
  } | null;
};

export type CompositeScoreMetric = {
  score_composite: number | null;
  composite_status: string | null;
  attractivite_fonciere: number | null;
  durete_fonciere: number | null;
  foncier_redhibitoire: boolean;
  message: string | null;
};

/** Score dureté 0–100 (plus élevé = plus difficile à acquérir). */
export function getDureteFonciereMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): DureteFonciereMetric | null {
  const row = metrics?.find((m) => m.metric_key === "durete_fonciere");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  if (typeof rec.eligible !== "boolean") return null;
  const score =
    typeof rec.score_final === "number" && Number.isFinite(rec.score_final) ? rec.score_final : null;
  const attractivite =
    score != null && score >= 0 && score <= 100 ? Math.round((100 - score) * 100) / 100 : null;
  const axesRaw = rec.detail_axes;
  const detail_axes =
    axesRaw && typeof axesRaw === "object" ? (axesRaw as DureteFonciereMetric["detail_axes"]) : null;
  return {
    eligible: rec.eligible,
    reason: typeof rec.reason === "string" ? rec.reason : null,
    score_final: score,
    attractivite_fonciere: attractivite,
    niveau_durete: typeof rec.niveau_durete === "string" ? rec.niveau_durete : null,
    explication: typeof rec.explication === "string" ? rec.explication : null,
    siren: typeof rec.siren === "string" ? rec.siren : rec.siren == null ? null : String(rec.siren),
    denomination:
      typeof rec.denomination === "string" ? rec.denomination : rec.denomination == null ? null : String(rec.denomination),
    intersects_arrachage_vigne: rec.intersects_arrachage_vigne === true,
    detail_axes,
  };
}

export function getCompositeScoreMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): CompositeScoreMetric | null {
  const row = metrics?.find((m) => m.metric_key === "composite_score_v1");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const score =
    typeof rec.score_composite === "number" && Number.isFinite(rec.score_composite)
      ? rec.score_composite
      : null;
  return {
    score_composite: score,
    composite_status: typeof rec.composite_status === "string" ? rec.composite_status : null,
    attractivite_fonciere:
      typeof rec.attractivite_fonciere === "number" && Number.isFinite(rec.attractivite_fonciere)
        ? rec.attractivite_fonciere
        : null,
    durete_fonciere:
      typeof rec.durete_fonciere === "number" && Number.isFinite(rec.durete_fonciere)
        ? rec.durete_fonciere
        : null,
    foncier_redhibitoire: rec.foncier_redhibitoire === true,
    message: typeof rec.message === "string" ? rec.message : null,
  };
}

/** Badge tableau : dureté élevée = rouge, faible = vert. */
export function dureteBadgeStyle(score: number | null | undefined): { bg: string; fg: string } {
  if (score == null || !Number.isFinite(score)) return { bg: "#e5e7eb", fg: "#374151" };
  if (score >= 81) return { bg: "#fee2e2", fg: "#991b1b" };
  if (score >= 61) return { bg: "#ffedd5", fg: "#c2410c" };
  if (score >= 41) return { bg: "#fef3c7", fg: "#92400e" };
  if (score >= 21) return { bg: "#dcfce7", fg: "#166534" };
  return { bg: "#d1fae5", fg: "#065f46" };
}

export function compositeBadgeStyle(score: number | null | undefined): { bg: string; fg: string } {
  if (score == null || !Number.isFinite(score)) return { bg: "#e5e7eb", fg: "#374151" };
  if (score >= 80) return { bg: "#dcfce7", fg: "#166534" };
  if (score >= 60) return { bg: "#bbf7d0", fg: "#15803d" };
  if (score >= 40) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#fee2e2", fg: "#991b1b" };
}

export function dureteSkipReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "not_pm":
      return "Hors personne morale";
    case "missing_or_invalid_siren":
      return "SIREN invalide";
    case "pipeline_exception":
      return "Erreur pipeline";
    default:
      return reason?.trim() ? reason : "Non éligible";
  }
}

function boolDesc(a: boolean, b: boolean): number {
  return Number(b) - Number(a);
}

function numDesc(a: number | null | undefined, b: number | null | undefined): number {
  const va = a == null ? Number.NEGATIVE_INFINITY : a;
  const vb = b == null ? Number.NEGATIVE_INFINITY : b;
  return vb - va;
}

/** Personne morale (oui) en tête ; compensation en second critère. */
export function compareByPmPersonneMorale(
  iduA: string,
  iduB: string,
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null | undefined,
  rankA: number,
  rankB: number,
): number {
  const ma = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduA]);
  const mb = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduB]);
  const pmDiff = boolDesc(
    ma?.intersects_pm_database ?? false,
    mb?.intersects_pm_database ?? false,
  );
  if (pmDiff !== 0) return pmDiff;
  const compDiff = boolDesc(
    ma?.compensation_deja_realisee ?? false,
    mb?.compensation_deja_realisee ?? false,
  );
  if (compDiff !== 0) return compDiff;
  return rankA - rankB;
}

/** Propriétaire ayant déjà compensé (oui) en tête. */
export function compareByPmCompensation(
  iduA: string,
  iduB: string,
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null | undefined,
  rankA: number,
  rankB: number,
): number {
  const ma = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduA]);
  const mb = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduB]);
  const compDiff = boolDesc(
    ma?.compensation_deja_realisee ?? false,
    mb?.compensation_deja_realisee ?? false,
  );
  if (compDiff !== 0) return compDiff;
  const pmDiff = boolDesc(
    ma?.intersects_pm_database ?? false,
    mb?.intersects_pm_database ?? false,
  );
  if (pmDiff !== 0) return pmDiff;
  return rankA - rankB;
}

/**
 * Tri prospect détaillé : compensation → parcelle déjà en MC → nb MC → surface MC → PM → rang.
 */
export function compareByPmProspectDetail(
  iduA: string,
  iduB: string,
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null | undefined,
  rankA: number,
  rankB: number,
): number {
  const ma = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduA]);
  const mb = getPersonnesMoralesMetric(poolMetricsByIdu?.[iduB]);

  const steps: number[] = [
    boolDesc(ma?.compensation_deja_realisee ?? false, mb?.compensation_deja_realisee ?? false),
    boolDesc(ma?.parcelle_deja_en_mc ?? false, mb?.parcelle_deja_en_mc ?? false),
    numDesc(ma?.nb_mc_distinctes, mb?.nb_mc_distinctes),
    numDesc(ma?.nb_parcelles_deja_en_mc, mb?.nb_parcelles_deja_en_mc),
    numDesc(ma?.surface_deja_en_mc_m2, mb?.surface_deja_en_mc_m2),
    boolDesc(ma?.intersects_pm_database ?? false, mb?.intersects_pm_database ?? false),
  ];
  for (const d of steps) {
    if (d !== 0) return d;
  }
  return rankA - rankB;
}

export function normalizePoolMetricsByIdu(
  byIdu: Record<string, ParcelPoolMetricRow[]> | undefined | null,
): Record<string, ParcelPoolMetricRow[]> {
  const out: Record<string, ParcelPoolMetricRow[]> = {};
  if (!byIdu) return out;
  for (const [idu, rows] of Object.entries(byIdu)) {
    out[idu] = (rows ?? []).map((row) => ({
      metric_key: String(row.metric_key),
      metric_value_jsonb:
        typeof row.metric_value_jsonb === "object" && row.metric_value_jsonb !== null
          ? (row.metric_value_jsonb as Record<string, unknown>)
          : {},
      updated_at: row.updated_at ?? null,
    }));
  }
  return out;
}

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
