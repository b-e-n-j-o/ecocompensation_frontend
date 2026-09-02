import type { LayerInfo } from "../../api";

/** Toujours exécutées — pas de case à cocher. */
export const ALWAYS_FETCH_KEYS = new Set(["parcelles"]);

/** Cluster PPM → sous-ensembles, toujours exécuté avec le fetch UF. */
export const UF_BUNDLE_KEYS = ["sous_ensembles"] as const;
export const FAUNA_LAYER_KEY = "fauna" as const;

export const PRIMARY_OPTIONAL_LAYER_KEYS = [
  "bd_topo_et_cesbio",
  "zone_humide",
  "espaces_naturels_sensibles_ens",
  "preemption_ens",
] as const;

export const SECONDARY_OPTIONAL_LAYER_KEYS = [
  "zones_humides_probables",
  "troncons_hydros",
  "surfaces_hydros",
] as const;

const PRIMARY_SET = new Set<string>(PRIMARY_OPTIONAL_LAYER_KEYS);
const SECONDARY_SET = new Set<string>(SECONDARY_OPTIONAL_LAYER_KEYS);

export function isOptionalLayerKey(key: string): boolean {
  if (ALWAYS_FETCH_KEYS.has(key)) return false;
  return !(UF_BUNDLE_KEYS as readonly string[]).includes(key);
}

export function getDefaultOptionalLayerKeys(registryLayers: LayerInfo[]): string[] {
  const available = new Set(registryLayers.map((l) => l.key));
  const defaults: string[] = [];
  if (available.has(FAUNA_LAYER_KEY)) defaults.push(FAUNA_LAYER_KEY);
  defaults.push(...PRIMARY_OPTIONAL_LAYER_KEYS.filter((k) => available.has(k)));
  return defaults;
}

export function splitOptionalLayersByGroup(optionalLayers: LayerInfo[]): {
  primary: LayerInfo[];
  secondary: LayerInfo[];
} {
  const byKey = new Map(optionalLayers.map((l) => [l.key, l]));
  const primary: LayerInfo[] = PRIMARY_OPTIONAL_LAYER_KEYS
    .map((key) => byKey.get(key))
    .filter((l): l is LayerInfo => Boolean(l));
  const secondary: LayerInfo[] = SECONDARY_OPTIONAL_LAYER_KEYS
    .map((key) => byKey.get(key))
    .filter((l): l is LayerInfo => Boolean(l));

  // Garde-fou: si une couche optionnelle n'est pas listée, elle est affichée en secondaire.
  const remaining = optionalLayers.filter((l) => !PRIMARY_SET.has(l.key) && !SECONDARY_SET.has(l.key));
  return { primary, secondary: [...secondary, ...remaining] };
}

/**
 * Clés de fetch dans l’ordre du registre serveur : UF (si activé), puis parcelles
 * obligatoires, puis les couches optionnelles cochées.
 */
export function buildFetchLayerKeys(
  registryOrder: LayerInfo[],
  optionalSelectedKeys: Set<string>,
  ufEnabled: boolean,
): string[] {
  const order = registryOrder.map((l) => l.key);
  const out: string[] = [];
  for (const k of order) {
    if ((UF_BUNDLE_KEYS as readonly string[]).includes(k)) {
      if (ufEnabled) out.push(k);
      continue;
    }
    if (ALWAYS_FETCH_KEYS.has(k)) {
      out.push(k);
      continue;
    }
    if (optionalSelectedKeys.has(k)) out.push(k);
  }
  return out;
}
