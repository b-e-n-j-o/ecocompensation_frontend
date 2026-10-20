import type { ParcelPoolMetricRow, VegetationHybrideValue } from "../types";

export type FilterEnrichPayload = {
  veg_libelles?: string[];
  fauna_distances?: Record<string, number>;
  zone_humide_ha?: number;
  zone_humide_m2?: number;
  zone_humide_pct?: number;
  zone_humide_intersects?: boolean;
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

export type EspacesBoisesClassesMetric = {
  parcelAreaHa: number;
  classes: Record<string, number>;
  classAreaHa: Record<string, number>;
  contrainteHa: number;
  contrainteRatio: number;
  mobilisableHa: number;
  mobilisableRatio: number;
  hasEbcACreer: boolean;
  ebcACreerHa: number;
  ebcACreerRatio: number;
};

function _num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _ratioMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, val] of Object.entries(raw)) {
    const n = _num(val);
    if (k.trim() && n > 0) out[k.trim()] = n;
  }
  return out;
}

export type Znieff2Site = {
  cle: string | null;
  nomSite: string | null;
  idMnhn: string | null;
  areaHa: number;
  ratio: number;
};

export type Znieff2Metric = {
  parcelAreaHa: number;
  znieff2Ha: number;
  znieff2Ratio: number;
  sites: Znieff2Site[];
};

export type UrbanismeGpuElement = {
  id: string;
  code: string | null;
  libelleCnig: string | null;
  libelle: string | null;
  pct: number | null;
  surfaceM2: number | null;
  longueurM: number | null;
  nbPoints: number | null;
  position: string | null;
  url: string | null;
};

export type UrbanismeScore = {
  profil: string | null;
  scoreGlobal: number | null;
  classe: string | null;
  libelleClasse: string | null;
  sousScores: { key: string; valeur: number }[];
  confiance: string | null;
  confianceValeur: number | null;
  vetos: { niveau: string; motif: string }[];
  resume: string[];
  pointsAVerifier: string[];
  contributions: { label: string; points: string }[];
};

export type UrbanismeGpuMetric = {
  surfaceM2: number | null;
  flags: string[];
  score: UrbanismeScore | null;
  zonages: { libelle: string | null; type: string | null; pct: number | null; surfaceM2: number | null }[];
  documents: { idurba: string | null; typedoc: string | null; date: string | null }[];
  couches: {
    layerKey: string;
    displayName: string;
    famille: string;
    geomKind: string | null;
    status: string;
    error: string | null;
    elements: UrbanismeGpuElement[];
  }[];
  runErrors: string[];
};

function _optNum(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function _optStr(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

const SOUS_SCORE_ORDER = ["perennite", "compatibilite", "synergie", "maitrise"];

function parseUrbanismeScore(raw: unknown): UrbanismeScore | null {
  if (!raw || typeof raw !== "object") return null;
  const score = raw as Record<string, unknown>;
  if (typeof score.score_global !== "number") return null;
  const sous = score.sous_scores && typeof score.sous_scores === "object"
    ? score.sous_scores as Record<string, unknown>
    : {};
  const keys = [
    ...SOUS_SCORE_ORDER.filter((k) => sous[k]),
    ...Object.keys(sous).filter((k) => !SOUS_SCORE_ORDER.includes(k)),
  ];
  const confiance = score.confiance && typeof score.confiance === "object"
    ? score.confiance as Record<string, unknown>
    : null;
  return {
    profil: _optStr(score.profil),
    scoreGlobal: score.score_global,
    classe: _optStr(score.classe),
    libelleClasse: _optStr(score.libelle_classe),
    sousScores: keys.flatMap((key) => {
      const item = sous[key];
      if (!item || typeof item !== "object") return [];
      const valeur = _optNum((item as Record<string, unknown>).valeur);
      return valeur == null ? [] : [{ key, valeur }];
    }),
    confiance: confiance ? _optStr(confiance.niveau) : null,
    confianceValeur: confiance ? _optNum(confiance.valeur) : null,
    vetos: Array.isArray(score.vetos)
      ? score.vetos.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const v = item as Record<string, unknown>;
          const motif = _optStr(v.motif);
          return motif ? [{ niveau: _optStr(v.niveau) ?? "majeur", motif }] : [];
        })
      : [],
    resume: Array.isArray(score.resume) ? score.resume.filter((x): x is string => typeof x === "string") : [],
    pointsAVerifier: Array.isArray(score.points_a_verifier)
      ? score.points_a_verifier.filter((x): x is string => typeof x === "string")
      : [],
    contributions: Array.isArray(score.contributions)
      ? score.contributions.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const c = item as Record<string, unknown>;
          const label = _optStr(c.label);
          if (!label) return [];
          const points = c.points && typeof c.points === "object" ? c.points as Record<string, unknown> : {};
          const total = Object.values(points).reduce<number>((acc, n) => acc + (typeof n === "number" ? n : 0), 0);
          const text = total === 0 ? "0" : `${total > 0 ? "+" : ""}${total.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`;
          return [{ label, points: text }];
        })
      : [],
  };
}

/** Null tant que l'analyse urbanisme n'a pas été lancée sur cette parcelle. */
export function getUrbanismeGpuMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): UrbanismeGpuMetric | null {
  const row = metrics?.find((m) => m.metric_key === "urbanisme_gpu");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const zonages = Array.isArray(rec.zonages)
    ? rec.zonages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const z = item as Record<string, unknown>;
        return [{
          libelle: _optStr(z.libelle),
          type: _optStr(z.type),
          pct: _optNum(z.pct_cible),
          surfaceM2: _optNum(z.surface_m2),
        }];
      })
    : [];
  const documents = Array.isArray(rec.documents)
    ? rec.documents.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const d = item as Record<string, unknown>;
        return [{
          idurba: _optStr(d.idurba),
          typedoc: _optStr(d.typedoc),
          date: _optStr(d.date),
        }];
      })
    : [];
  const couches = Array.isArray(rec.couches)
    ? rec.couches.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const c = item as Record<string, unknown>;
        const elements = Array.isArray(c.elements)
          ? c.elements.flatMap((el) => {
              if (!el || typeof el !== "object") return [];
              const e = el as Record<string, unknown>;
              return [{
                id: _optStr(e.element_id) ?? "el",
                code: _optStr(e.code),
                libelleCnig: _optStr(e.libelle_cnig),
                libelle: _optStr(e.libelle),
                pct: _optNum(e.pct_cible),
                surfaceM2: _optNum(e.surface_m2),
                longueurM: _optNum(e.longueur_m),
                nbPoints: _optNum(e.nb_points),
                position: _optStr(e.position),
                url: _optStr(e.url),
              }];
            })
          : [];
        return [{
          layerKey: _optStr(c.layer_key) ?? "couche",
          displayName: _optStr(c.display_name) ?? "Couche",
          famille: _optStr(c.famille) ?? "",
          geomKind: _optStr(c.geom_kind),
          status: _optStr(c.status) ?? "not_intersected",
          error: _optStr(c.error),
          elements,
        }];
      })
    : [];
  return {
    surfaceM2: _optNum(rec.surface_m2),
    flags: Array.isArray(rec.flags) ? rec.flags.filter((f): f is string => typeof f === "string") : [],
    score: parseUrbanismeScore(rec.score),
    zonages,
    documents,
    couches,
    runErrors: Array.isArray(rec.run_errors)
      ? rec.run_errors.filter((f): f is string => typeof f === "string")
      : [],
  };
}

/** Null si la parcelle n'intersecte pas de ZNIEFF de type 2. */
export function getZnieff2Metric(
  metrics: ParcelPoolMetricRow[] | undefined,
): Znieff2Metric | null {
  const row = metrics?.find((m) => m.metric_key === "znieff_2");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const znieff2Ha = _num(rec.znieff2_ha);
  if (znieff2Ha <= 0) return null;
  const sites: Znieff2Site[] = [];
  if (Array.isArray(rec.sites)) {
    for (const item of rec.sites) {
      if (!item || typeof item !== "object") continue;
      const site = item as Record<string, unknown>;
      const areaHa = _num(site.area_ha);
      if (areaHa <= 0) continue;
      sites.push({
        cle: typeof site.cle === "string" ? site.cle : null,
        nomSite: typeof site.nom_site === "string" && site.nom_site.trim() ? site.nom_site : null,
        idMnhn: typeof site.id_mnhn === "string" && site.id_mnhn.trim() ? site.id_mnhn : null,
        areaHa,
        ratio: _num(site.ratio),
      });
    }
  }
  return {
    parcelAreaHa: _num(rec.parcel_area_ha),
    znieff2Ha,
    znieff2Ratio: _num(rec.znieff2_ratio),
    sites,
  };
}

/** Null si la parcelle n'intersecte pas v_ebc. */
export function getEspacesBoisesClassesMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): EspacesBoisesClassesMetric | null {
  const row = metrics?.find((m) => m.metric_key === "espaces_boises_classes");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const classes = _ratioMap(rec.classes);
  const classAreaHa = _ratioMap(rec.class_area_ha);
  const mobilisableHa = _num(rec.mobilisable_ha);
  const contrainteHa = _num(rec.contrainte_ha);
  const ebcACreerHa = _num(rec.ebc_a_creer_ha);
  if (Object.keys(classes).length === 0 && contrainteHa <= 0 && ebcACreerHa <= 0) return null;
  return {
    parcelAreaHa: _num(rec.parcel_area_ha),
    classes,
    classAreaHa,
    contrainteHa,
    contrainteRatio: _num(rec.contrainte_ratio),
    mobilisableHa,
    mobilisableRatio: _num(rec.mobilisable_ratio),
    hasEbcACreer: rec.has_ebc_a_creer === true || ebcACreerHa > 0,
    ebcACreerHa,
    ebcACreerRatio: _num(rec.ebc_a_creer_ratio),
  };
}

export type ArrachageVignesMetric = {
  ratios: Record<string, number>;
  impactedAreaM2: number;
  impactedRatio: number;
};

/** Null si la parcelle n'intersecte pas la couche. */
export function getArrachageVignesMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): ArrachageVignesMetric | null {
  const row = metrics?.find((m) => m.metric_key === "arrachage_vignes_ratio");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const raw = rec.ratios;
  const ratios: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, val] of Object.entries(raw)) {
      const n = typeof val === "number" ? val : Number(val);
      if (k.trim() && Number.isFinite(n) && n > 0) ratios[k.trim()] = n;
    }
  }
  const impactedAreaM2 =
    typeof rec.impacted_area_m2 === "number" && Number.isFinite(rec.impacted_area_m2)
      ? rec.impacted_area_m2
      : 0;
  const impactedRatio =
    typeof rec.impacted_ratio === "number" && Number.isFinite(rec.impacted_ratio)
      ? rec.impacted_ratio
      : 0;
  if (impactedAreaM2 <= 0 && Object.keys(ratios).length === 0) return null;
  return { ratios, impactedAreaM2, impactedRatio };
}

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
      return "Propriétaire privé — dureté non estimable pour le moment";
    case "missing_or_invalid_siren":
      return "SIREN INSEE manquant ou invalide";
    case "public_entity_no_insee_siren":
      return "PM publique sans SIREN INSEE — score déterministe";
    case "pipeline_exception":
      return "Erreur pipeline (sources ou LLM)";
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

/** Plus grande part relative dans le zonage (0–1), pour tri. */
export function getDominantVegetationRatio(metrics: ParcelPoolMetricRow[] | undefined): number {
  const metric = getOccupationSolMetric(metrics);
  if (!metric) return 0;
  let max = 0;
  for (const v of Object.values(metric.ratios)) {
    if (Number.isFinite(v)) max = Math.max(max, v);
  }
  return max;
}

/** Chaîne de priorité pour le tri : natures BD TOPO (ordre de clic), puis classes CESBIO (ordre de clic). */
export function buildVegetationPriorityChain(veg: VegetationHybrideValue | null | undefined): string[] {
  if (!veg) return [];
  return [...veg.zdv_natures, ...veg.cesbio_libelles];
}

export type OccupationSolSource = "vegetation_hybride_ratio" | "cesbio_profile";

export type OccupationSolShare = {
  label: string;
  /** Part 0–1 (parcelle pour CESBIO, intersection pour zonage hybride). */
  ratio: number;
  areaM2: number | null;
};

export type OccupationSolMetric = {
  source: OccupationSolSource;
  ratios: Record<string, number>;
  totalM2: number;
  shares: OccupationSolShare[];
};

function parseHybridRatioMetric(
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
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  return { ratios: out, totalM2 };
}

function parseCesbioProfileMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): { ratios: Record<string, number>; totalM2: number } | null {
  const row = metrics?.find((m) => m.metric_key === "cesbio_profile");
  const payload = row?.metric_value_jsonb;
  if (!payload || typeof payload !== "object") return null;
  const ratios: Record<string, number> = {};
  const areas: Record<string, number> = {};
  let areaSum = 0;
  let parcelM2 = 0;
  for (const [label, raw] of Object.entries(payload)) {
    if (!label.trim() || !raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const area =
      typeof rec.area_m2 === "number" && Number.isFinite(rec.area_m2) && rec.area_m2 > 0
        ? rec.area_m2
        : null;
    const pct = typeof rec.pct === "number" && Number.isFinite(rec.pct) && rec.pct > 0 ? rec.pct : null;
    if (area != null) {
      areas[label] = area;
      areaSum += area;
    }
    if (pct != null) {
      const ratio = pct > 1 ? pct / 100 : pct;
      if (ratio > 0) {
        ratios[label] = ratio;
        if (area != null && ratio > 0) {
          parcelM2 = Math.max(parcelM2, area / ratio);
        }
      }
    }
  }
  if (!Object.keys(ratios).length && areaSum > 0) {
    for (const [k, a] of Object.entries(areas)) {
      ratios[k] = a / areaSum;
    }
    return { ratios, totalM2: areaSum };
  }
  if (!Object.keys(ratios).length) return null;
  return { ratios, totalM2: parcelM2 > 0 ? parcelM2 : areaSum };
}

/** Ratios + surface de référence (m²) — hybride ZH, sinon CESBIO faune. */
function getVegetationHybridMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): { ratios: Record<string, number>; totalM2: number } | null {
  return parseHybridRatioMetric(metrics) ?? parseCesbioProfileMetric(metrics);
}

/** Occupation du sol pour le détail de ligne (parts + source). */
export function getOccupationSolMetric(
  metrics: ParcelPoolMetricRow[] | undefined,
): OccupationSolMetric | null {
  const hybrid = parseHybridRatioMetric(metrics);
  const parsed = hybrid ?? parseCesbioProfileMetric(metrics);
  if (!parsed) return null;
  const shares: OccupationSolShare[] = Object.entries(parsed.ratios)
    .filter(([, ratio]) => Number.isFinite(ratio) && ratio > 0)
    .map(([label, ratio]) => ({
      label,
      ratio,
      areaM2: parsed.totalM2 > 0 ? ratio * parsed.totalM2 : null,
    }))
    .sort((a, b) => b.ratio - a.ratio);
  if (!shares.length) return null;
  return {
    source: hybrid ? "vegetation_hybride_ratio" : "cesbio_profile",
    ratios: parsed.ratios,
    totalM2: parsed.totalM2,
    shares,
  };
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
