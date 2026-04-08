import type { LayerInfo } from "../../api";

/** Toujours exécutées — pas de case à cocher. */
export const ALWAYS_FETCH_KEYS = new Set(["parcelles", "geomce"]);

/** Liées : une seule option pour les deux. */
export const UF_BUNDLE_KEYS = ["unites_foncieres", "sous_ensembles"] as const;

export function isOptionalLayerKey(key: string): boolean {
  if (ALWAYS_FETCH_KEYS.has(key)) return false;
  return !(UF_BUNDLE_KEYS as readonly string[]).includes(key);
}

/**
 * Clés de fetch dans l’ordre du registre serveur : UF (si activé), puis parcelles / geomce
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
