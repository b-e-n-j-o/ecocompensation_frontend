// ─── filterCatalog ───────────────────────────────────────────────────────────
// Construit la liste des critères de filtrage (appliqués ou non) à partir de
// `ecocompensation.projects.filter_config`, avec libellés métier et paramètres
// lisibles. Les étapes du funnel sont rattachées aux critères par `key`
// (si le backend la fournit) ou, à défaut, par regex sur le label.

// ── Types FilterConfig (miroir de filter_pipeline.FilterConfig) ─────────────
export type ZhMode = "ignore" | "intersect" | "exclude";
export type SearchMode = "exclude_source" | "exclude_source_buffer" | "within_foncier" | string;

export interface FaunaCriterion {
  species: string;
  dist_m: number;
}

export interface FloraCriterion {
  taxon_key: string;
  label: string;
  dist_m: number;
}

export interface FilterConfig {
  /** Tampon AOI (km) autour du foncier déposé. 0 = recherche dans le périmètre seulement. */
  buffer_km?: number | null;
  min_area_ha?: number;
  miller_thresh?: number | null;
  cesbio_libelles?: string[];
  fauna_criteria?: FaunaCriterion[];
  fauna_combine?: "or" | "and";
  flora_criteria?: FloraCriterion[];
  flora_combine?: "or" | "and";
  search_mode?: SearchMode;
  zone_humide_mode?: ZhMode;
  min_zone_humide_ha?: number;
  zones_humides_probables_mode?: ZhMode;
  /** Clés des couches nationales d'exclusion cochées (geomce, natura_2000, …). */
  excluded_layers?: string[];
  troncons_hydros_max_dist_m?: number | null;
  surfaces_hydros_max_dist_m?: number | null;
  same_bassin_versant?: boolean;
  arrachage_vignes?: boolean;
  arrachage_vignes_types?: string[];
  include_unites_foncieres?: boolean;
  include_ilots_rpg?: boolean;
}

// ── Thèmes ───────────────────────────────────────────────────────────────────
export type FilterTheme = "surface" | "emprise" | "protections" | "ecologie" | "hydro" | "agricole" | "autre";

export const THEME_LABELS: Record<FilterTheme, string> = {
  surface: "Surface & forme",
  emprise: "Emprise du projet",
  protections: "Zonages & protections (exclusions)",
  ecologie: "Écologie & milieux",
  hydro: "Hydrologie",
  agricole: "Usages agricoles",
  autre: "Autres critères",
};

export const THEME_ORDER: FilterTheme[] = ["surface", "emprise", "protections", "ecologie", "hydro", "agricole", "autre"];

/** Ordre du panneau de filtrage (CreateAoiPage), pas l'ordre SQL de l'entonnoir. */
/** Critères calculés mais masqués dans le compte rendu (implicites pour l'utilisateur). */
export const HIDDEN_FROM_REPORT = new Set(["search_mode"]);

export const UI_CRITERION_ORDER: string[] = [
  "fauna_criteria",
  "flora_criteria",
  "min_area_ha",
  "miller_thresh",
  "cesbio_libelles",
  "zone_humide_mode",
  "zones_humides_probables_mode",
  "same_bassin_versant",
  "troncons_hydros_max_dist_m",
  "surfaces_hydros_max_dist_m",
  "arrachage_vignes",
  "geomce",
  "preemption_ens",
  "ens",
  "natura_2000",
  "znieff_1",
  "znieff_2",
  "ebc",
];

export function uiCriterionIndex(key: string): number {
  const i = UI_CRITERION_ORDER.indexOf(key);
  return i === -1 ? UI_CRITERION_ORDER.length : i;
}

// ── Spécification d'un critère ───────────────────────────────────────────────
export interface CriterionDetail {
  label: string;
  value: string;
}

export interface CriterionSpec {
  /** Nom du champ FilterConfig ou clé de couche d'exclusion. */
  key: string;
  theme: FilterTheme;
  /** Libellé avec paramètres (affiché quand le critère est appliqué). */
  label: string;
  /** Nom neutre (affiché dans « non appliqués »). */
  name: string;
  description: string;
  source?: string;
  details: CriterionDetail[];
  /** true / false si la config est connue, null sinon. */
  applied: boolean | null;
}

// ── Formatage ────────────────────────────────────────────────────────────────
const fmtNum = (n: number, d = 2) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });
const fmtDist = (m: number) => (m >= 1000 ? `${fmtNum(m / 1000, 1)} km` : `${fmtNum(m, 0)} m`);
const ZH_MODE_LABEL: Record<ZhMode, string> = {
  ignore: "Ignorées",
  intersect: "Doit intersecter",
  exclude: "Exclues",
};

// ── Couches nationales d'exclusion (ordre de l'entonnoir) ────────────────────
const EXCLUSION_LAYERS: Array<{ key: string; name: string; description: string; source: string }> = [
  {
    key: "geomce",
    name: "Mesures compensatoires existantes (GEOMCE)",
    description: "Exclut les parcelles intersectant une mesure compensatoire déjà déclarée (surfaces, linéaires, points actifs).",
    source: "GEOMCE",
  },
  {
    key: "preemption_ens",
    name: "Zones de préemption ENS",
    description: "Exclut les parcelles en zone de préemption au titre des Espaces Naturels Sensibles.",
    source: "Départements — préemption ENS",
  },
  {
    key: "ens",
    name: "Espaces Naturels Sensibles (ENS)",
    description: "Exclut les parcelles intersectant un site ENS.",
    source: "Départements — ENS",
  },
  {
    key: "natura_2000",
    name: "Sites Natura 2000",
    description: "Exclut les parcelles intersectant un site Natura 2000 (ZPS / ZSC).",
    source: "INPN — Natura 2000",
  },
  {
    key: "znieff_1",
    name: "ZNIEFF de type I",
    description: "Exclut les parcelles intersectant une ZNIEFF de type I.",
    source: "INPN — ZNIEFF",
  },
  {
    key: "znieff_2",
    name: "ZNIEFF de type II",
    description: "Exclut les parcelles intersectant une ZNIEFF de type II.",
    source: "INPN — ZNIEFF",
  },
  {
    key: "ebc",
    name: "Espaces Boisés Classés (EBC)",
    description: "Exclut les parcelles entièrement couvertes (100 %) par un EBC existant (hors EBC à créer).",
    source: "PLU — EBC",
  },
];

export const DEFAULT_EXCLUDED_LAYERS = ["geomce", "preemption_ens", "ens", "natura_2000", "znieff_1"];

// ── Construction des critères à partir de la config ──────────────────────────
export function buildCriteria(config: FilterConfig | null | undefined): CriterionSpec[] {
  const c = config ?? null;
  const known = c != null;
  const ap = (cond: boolean): boolean | null => (known ? cond : null);
  const specs: CriterionSpec[] = [];

  // Surface minimale
  const minArea = c?.min_area_ha;
  specs.push({
    key: "min_area_ha",
    theme: "surface",
    name: "Surface minimale",
    label: minArea != null ? `Surface ≥ ${fmtNum(minArea)} ha` : "Surface minimale",
    description: "Seul le foncier atteignant la surface minimale recherchée est conservé.",
    source: "Cadastre (PCI)",
    details: minArea != null ? [{ label: "Seuil", value: `${fmtNum(minArea)} ha` }] : [],
    applied: ap(true),
  });

  // Indice de Miller
  const miller = c?.miller_thresh ?? null;
  specs.push({
    key: "miller_thresh",
    theme: "surface",
    name: "Compacité (indice de Miller)",
    label: miller != null ? `Forme compacte (Miller ≥ ${fmtNum(miller)})` : "Compacité (indice de Miller)",
    description: "Écarte les parcelles trop allongées ou découpées. Indice = 4π × aire / périmètre² (1 = cercle parfait).",
    details: miller != null ? [{ label: "Seuil", value: fmtNum(miller) }] : [],
    applied: ap(miller != null),
  });

  // Mode spatial
  const mode = c?.search_mode ?? null;
  const within = mode === "within_foncier";
  specs.push({
    key: "search_mode",
    theme: "emprise",
    name: "Position par rapport au projet",
    label: within ? "Dans le foncier du projet" : "Hors emprise du projet",
    description: within
      ? "Conserve uniquement les parcelles intersectant le foncier / l'AOI du projet."
      : "Exclut les parcelles du foncier déposé (parcelles sources) du projet impactant" +
        (mode === "exclude_source_buffer" ? ", tampon inclus." : "."),
    details: mode ? [{ label: "Mode", value: mode }] : [],
    applied: ap(true),
  });

  // Couches d'exclusion
  const layers = c?.excluded_layers ?? null;
  for (const l of EXCLUSION_LAYERS) {
    specs.push({
      key: l.key,
      theme: "protections",
      name: l.name,
      label: `Hors ${l.name.charAt(0).toLowerCase()}${l.name.slice(1)}`,
      description: l.description,
      source: l.source,
      details: [],
      applied: layers ? layers.includes(l.key) : null,
    });
  }

  // Occupation du sol (CESBIO)
  const libs = c?.cesbio_libelles ?? [];
  specs.push({
    key: "cesbio_libelles",
    theme: "ecologie",
    name: "Occupation du sol (CESBIO)",
    label: libs.length
      ? libs.length <= 2
        ? `Occupation du sol : ${libs.join(", ")}`
        : `Occupation du sol : ${libs.length} milieux acceptés`
      : "Occupation du sol (CESBIO)",
    description: "Conserve les parcelles intersectant au moins un des milieux sélectionnés.",
    source: "CESBIO — OSO / BD TOPO",
    details: libs.length ? [{ label: "Milieux acceptés", value: libs.join(", ") }] : [],
    applied: ap(libs.length > 0),
  });

  // Faune
  const fauna = c?.fauna_criteria ?? [];
  const faunaAnd = c?.fauna_combine === "and";
  specs.push({
    key: "fauna_criteria",
    theme: "ecologie",
    name: "Présence d'espèces",
    label:
      fauna.length === 1
        ? `Présence : ${fauna[0].species} (≤ ${fmtDist(fauna[0].dist_m)})`
        : fauna.length > 1
          ? faunaAnd
            ? `Présence de toutes les espèces cibles (${fauna.length}, ET)`
            : `Présence d'au moins une espèce cible (${fauna.length}, OU)`
          : "Présence d'espèces",
    description:
      fauna.length > 1
        ? faunaAnd
          ? "Conserve les parcelles proches d'une observation de chacune des espèces (ET)."
          : "Conserve les parcelles proches d'une observation d'au moins une des espèces (OU)."
        : "Conserve les parcelles proches d'une observation de l'espèce cible.",
    details: [
      ...(fauna.length > 1 ? [{ label: "Combinaison", value: faunaAnd ? "ET (toutes)" : "OU (au moins une)" }] : []),
      ...fauna.map((f) => ({ label: f.species, value: `observation à ≤ ${fmtDist(f.dist_m)}` })),
    ],
    applied: ap(fauna.length > 0),
  });

  const flora = c?.flora_criteria ?? [];
  const floraAnd = c?.flora_combine === "and";
  specs.push({
    key: "flora_criteria",
    theme: "ecologie",
    name: "Présence de flore",
    label:
      flora.length === 1
        ? `Présence : ${flora[0].label} (≤ ${fmtDist(flora[0].dist_m)})`
        : flora.length > 1
          ? floraAnd
            ? `Présence de tous les taxons cibles (${flora.length})`
            : `Présence d'au moins un taxon cible (${flora.length})`
          : "Présence de flore",
    description:
      flora.length > 1
        ? floraAnd
          ? "Conserve les parcelles proches d'une observation de chacun des taxons (ET)."
          : "Conserve les parcelles proches d'une observation d'au moins un des taxons (OU)."
        : "Conserve les parcelles proches d'une observation du taxon cible.",
    details: [
      ...(flora.length > 1 ? [{ label: "Combinaison", value: floraAnd ? "ET (tous)" : "OU (au moins un)" }] : []),
      ...flora.map((f) => ({ label: f.label, value: `observation à ≤ ${fmtDist(f.dist_m)}` })),
    ],
    applied: ap(flora.length > 0),
  });

  // Zones humides établies
  const zh = c?.zone_humide_mode ?? null;
  const zhMin = c?.min_zone_humide_ha ?? 0;
  specs.push({
    key: "zone_humide_mode",
    theme: "ecologie",
    name: "Zones humides établies",
    label:
      zh === "intersect"
        ? `Intersecte une zone humide établie${zhMin > 0 ? ` (≥ ${fmtNum(zhMin)} ha)` : ""}`
        : zh === "exclude"
          ? "Hors zones humides établies"
          : "Zones humides établies",
    description:
      zh === "exclude"
        ? "Exclut les parcelles intersectant une zone humide établie."
        : "Conserve les parcelles intersectant une zone humide établie" +
          (zhMin > 0 ? " sur une surface minimale." : "."),
    details: zh
      ? [
          { label: "Mode", value: ZH_MODE_LABEL[zh] },
          ...(zh === "intersect" && zhMin > 0 ? [{ label: "Surface min.", value: `${fmtNum(zhMin)} ha` }] : []),
        ]
      : [],
    applied: ap(zh != null && zh !== "ignore"),
  });

  // Zones humides probables
  const zhp = c?.zones_humides_probables_mode ?? null;
  specs.push({
    key: "zones_humides_probables_mode",
    theme: "ecologie",
    name: "Zones humides probables",
    label:
      zhp === "intersect"
        ? "Intersecte une zone humide probable"
        : zhp === "exclude"
          ? "Hors zones humides probables"
          : "Zones humides probables",
    description:
      zhp === "exclude"
        ? "Exclut les parcelles intersectant une zone humide probable."
        : "Conserve les parcelles intersectant une zone humide probable.",
    details: zhp ? [{ label: "Mode", value: ZH_MODE_LABEL[zhp] }] : [],
    applied: ap(zhp != null && zhp !== "ignore"),
  });

  // Bassin versant
  specs.push({
    key: "same_bassin_versant",
    theme: "hydro",
    name: "Même bassin versant",
    label: "Même bassin versant que le projet",
    description: "Conserve les parcelles situées dans un bassin versant touchant le foncier du projet.",
    source: "BV masses d'eau (SPE)",
    details: [],
    applied: ap(!!c?.same_bassin_versant),
  });

  // Cours d'eau
  const dTr = c?.troncons_hydros_max_dist_m ?? null;
  specs.push({
    key: "troncons_hydros_max_dist_m",
    theme: "hydro",
    name: "Proximité d'un cours d'eau",
    label: dTr == null ? "Proximité d'un cours d'eau" : dTr <= 0 ? "Intersecte un cours d'eau" : `À ≤ ${fmtDist(dTr)} d'un cours d'eau`,
    description: "Conserve les parcelles proches du réseau de cours d'eau.",
    source: "BD TOPO — tronçons hydrographiques",
    details: dTr != null ? [{ label: "Distance max.", value: dTr <= 0 ? "intersection" : fmtDist(dTr) }] : [],
    applied: ap(dTr != null),
  });

  // Plans d'eau
  const dSu = c?.surfaces_hydros_max_dist_m ?? null;
  specs.push({
    key: "surfaces_hydros_max_dist_m",
    theme: "hydro",
    name: "Proximité d'un plan d'eau",
    label: dSu == null ? "Proximité d'un plan d'eau" : dSu <= 0 ? "Intersecte un plan d'eau" : `À ≤ ${fmtDist(dSu)} d'un plan d'eau`,
    description: "Conserve les parcelles proches d'un plan d'eau.",
    source: "BD TOPO — surfaces hydrographiques",
    details: dSu != null ? [{ label: "Distance max.", value: dSu <= 0 ? "intersection" : fmtDist(dSu) }] : [],
    applied: ap(dSu != null),
  });

  // Arrachage de vignes
  const vTypes = c?.arrachage_vignes_types ?? [];
  specs.push({
    key: "arrachage_vignes",
    theme: "agricole",
    name: "Arrachage de vignes",
    label: "Parcelles en arrachage de vignes",
    description: "Conserve les parcelles intersectant une déclaration d'arrachage de vignes.",
    details: c?.arrachage_vignes ? [{ label: "Types", value: vTypes.length ? vTypes.join(", ") : "tous" }] : [],
    applied: ap(!!c?.arrachage_vignes),
  });

  return [...specs].sort((a, b) => uiCriterionIndex(a.key) - uiCriterionIndex(b.key));
}

// ── Rattachement étape du funnel → critère ───────────────────────────────────
// Ordre = du plus spécifique au plus générique (préemption avant ENS, etc.).
const STEP_MATCHERS: Array<[string, RegExp]> = [
  ["preemption_ens", /pr[ée]emption/i],
  ["zones_humides_probables_mode", /humides?\s+probables?/i],
  ["zone_humide_mode", /zones?\s+humides?/i],
  ["surfaces_hydros_max_dist_m", /surfaces?\s+hydro|plans?\s+d['’]eau/i],
  ["troncons_hydros_max_dist_m", /tron[çc]ons?|cours\s+d['’]eau/i],
  ["same_bassin_versant", /bassin/i],
  ["arrachage_vignes", /vigne/i],
  ["geomce", /geomce|mesures?\s+compensatoires?/i],
  ["znieff_2", /znieff\D*(2|ii)\b/i],
  ["znieff_1", /znieff/i],
  ["natura_2000", /natura/i],
  ["ebc", /\bebc\b|bois[ée]s?\s+class/i],
  ["ens", /\bens\b|espaces?\s+naturels?\s+sensibles/i],
  ["miller_thresh", /miller|compacit/i],
  ["cesbio_libelles", /cesbio|occupation/i],
  ["flora_criteria", /flore/i],
  ["fauna_criteria", /faune|esp[èe]ces?/i],
  ["search_mode", /emprise|source|within/i],
  ["min_area_ha", /candidats|surface/i],
];

export function matchStepKey(step: { key?: string; label: string }): string | null {
  if (step.key) return step.key;
  return STEP_MATCHERS.find(([, re]) => re.test(step.label))?.[0] ?? null;
}

/** Config réellement utilisée pour un pool (last_results.filter_config, options du run, ou last_filter). */
export function readFilterConfig(raw: unknown): FilterConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested = o.filter_config;
  const src =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : o;
  const looksLikeConfig =
    "min_area_ha" in src
    || "fauna_criteria" in src
    || "excluded_layers" in src
    || "zone_humide_mode" in src
    || src.pipeline === "filter_v2";
  if (!looksLikeConfig) return null;
  return src as FilterConfig;
}