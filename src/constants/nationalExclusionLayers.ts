/** Clés alignées sur excluded_layers côté API (tables ecocompensation.*). */
export type NationalExclusionKey = "geomce" | "preemption_ens" | "ens" | "natura_2000";

export type NationalExclusionLayer = {
  key: NationalExclusionKey;
  label: string;
  hint: string;
  table: string;
};

export const NATIONAL_EXCLUSION_LAYERS: NationalExclusionLayer[] = [
  {
    key: "geomce",
    label: "Mesures compensatoires (GEOMCE)",
    hint: "Exclut les parcelles intersectant une mesure compensatoire existante (surf, lin, pct).",
    table: "ecocompensation.geomce_surf / geomce_lin / geomce_pct",
  },
  {
    key: "preemption_ens",
    label: "Préemption espaces naturels sensibles",
    hint: "Exclut les parcelles intersectant une zone de préemption ENS.",
    table: "ecocompensation.preemption_espaces_naturels_sensibles",
  },
  {
    key: "ens",
    label: "Espaces naturels sensibles (ENS)",
    hint: "Exclut les parcelles intersectant un espace naturel sensible acquis.",
    table: "ecocompensation.espaces_naturels_sensibles_ens",
  },
  {
    key: "natura_2000",
    label: "Natura 2000",
    hint: "Exclut les parcelles intersectant le réseau Natura 2000 national (SIC / ZPS).",
    table: "ecocompensation.natura_2000",
  },
];

export const DEFAULT_EXCLUDED_LAYERS: NationalExclusionKey[] = [
  "geomce",
  "preemption_ens",
  "ens",
  "natura_2000",
];

export function exclusionLabel(key: string): string {
  return NATIONAL_EXCLUSION_LAYERS.find((l) => l.key === key)?.label ?? key;
}
