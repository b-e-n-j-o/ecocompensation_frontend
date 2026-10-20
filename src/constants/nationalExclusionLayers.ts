/** Clés alignées sur excluded_layers côté API (tables ecocompensation.*). */
export type NationalExclusionKey =
  | "geomce"
  | "preemption_ens"
  | "ens"
  | "natura_2000"
  | "znieff_1"
  | "znieff_2"
  | "ebc";

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
  {
    key: "znieff_1",
    label: "ZNIEFF type 1",
    hint: "Exclut toute parcelle qui intersecte une ZNIEFF de type 1. Biodiversité déjà remarquable : le gain écologique y est en pratique impossible à démontrer.",
    table: "ecocompensation.znieff · type_znieff = 1",
  },
  {
    key: "znieff_2",
    label: "ZNIEFF type 2",
    hint: "Optionnel. Grand ensemble : une parcelle dégradée à l’intérieur peut encore porter une compensation, sous réserve d’instruction DREAL.",
    table: "ecocompensation.znieff · type_znieff = 2",
  },
  {
    key: "ebc",
    label: "Espaces boisés classés (couverture totale)",
    hint: "Exclut seulement les parcelles couvertes à 100 % par un EBC, un EBC littoral ou un EBC présumé. L’EBC à créer reste dans le pool.",
    table: "ecocompensation.v_ebc · exclusion seulement si couverture 100 %",
  },
];

export const DEFAULT_EXCLUDED_LAYERS: NationalExclusionKey[] = [
  "geomce",
  "preemption_ens",
  "ens",
  "natura_2000",
  "znieff_1",
];

export function exclusionLabel(key: string): string {
  return NATIONAL_EXCLUSION_LAYERS.find((l) => l.key === key)?.label ?? key;
}
