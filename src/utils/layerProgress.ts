export type LayerStatus = "pending" | "running" | "done" | "skipped" | "error";

export type LayerState = { status: LayerStatus; n_inserted?: number; message?: string };

const UF_LAYER_KEYS = new Set(["unites_foncieres", "sous_ensembles", "enrich_uf"]);

export function isUfLayerKey(key: string): boolean {
  return UF_LAYER_KEYS.has(key);
}

/** Met à jour l'état d'une couche à partir d'un événement WS fetch-progress / filter-pipeline. */
export function applyWsLayerEvent(
  prev: Record<string, LayerState>,
  data: {
    event?: string;
    layer_key?: string;
    message?: string;
    n_inserted?: number;
  },
): Record<string, LayerState> | null {
  const ev = data.event ?? "";
  const layerKey = data.layer_key ?? "";
  const msg = data.message ?? "";

  if (ev === "running" && layerKey) {
    return { ...prev, [layerKey]: { ...prev[layerKey], status: "running" } };
  }

  if (ev === "progress" && layerKey) {
    const tileMatch = msg.match(/^TILE_PROGRESS:(\d+)\/(\d+):(\d+)/);
    if (tileMatch) {
      const tile = parseInt(tileMatch[1], 10);
      const totalTiles = parseInt(tileMatch[2], 10);
      const nInserted = parseInt(tileMatch[3], 10);
      const pct = totalTiles > 0 ? Math.min(100, Math.round((tile / totalTiles) * 100)) : 0;
      const suffix = msg.includes("🌿") ? " vég" : msg.includes("🦎") ? " faune" : "";
      return {
        ...prev,
        [layerKey]: {
          ...prev[layerKey],
          status: "running",
          message: `⟳ ${nInserted.toLocaleString("fr-FR")}${suffix} — ${pct}%`,
        },
      };
    }

    const filterMatch = msg.match(/^FILTER_STEP:([^:]+):(\d+):/);
    if (filterMatch && layerKey === "filter") {
      return {
        ...prev,
        filter: {
          status: "running",
          message: `${filterMatch[1]} → ${parseInt(filterMatch[2], 10).toLocaleString("fr-FR")}`,
        },
      };
    }

    const phaseDone = msg.match(/^PHASE:(\w+):done:(\d+)/);
    if (phaseDone) {
      const phaseKey = phaseDone[1];
      const count = parseInt(phaseDone[2], 10);
      return {
        ...prev,
        [phaseKey]: {
          status: "done",
          n_inserted: count,
          message: `${count.toLocaleString("fr-FR")} entité(s)`,
        },
      };
    }

    if (msg.startsWith("PHASE:") || msg.startsWith("ENRICH_BATCH:") || msg.startsWith("[ENRICH_UF]")) {
      const display = msg.startsWith("[ENRICH_UF]") ? msg.replace("[ENRICH_UF] ", "") : msg.slice(0, 60);
      return {
        ...prev,
        [layerKey]: { ...prev[layerKey], status: "running", message: display },
      };
    }

    if (msg.trim() && !msg.startsWith("TILE_PROGRESS:")) {
      const short = msg.replace(/\n/g, " ").trim().slice(0, 72);
      return {
        ...prev,
        [layerKey]: { ...prev[layerKey], status: "running", message: short },
      };
    }
    return null;
  }

  if (ev === "done" && layerKey) {
    const n = typeof data.n_inserted === "number" ? data.n_inserted : 0;
    return { ...prev, [layerKey]: { status: "done", n_inserted: n } };
  }

  if (ev === "skipped" && layerKey) {
    return { ...prev, [layerKey]: { status: "skipped", n_inserted: 0 } };
  }

  if (ev === "error" && layerKey) {
    return { ...prev, [layerKey]: { status: "error", message: msg } };
  }

  return null;
}

export const DEFAULT_UF_PHASES = [
  { key: "unites_foncieres", label: "Unités foncières (PPM + clustering)" },
  { key: "sous_ensembles", label: "Sous-ensembles contigus" },
  { key: "enrich_uf", label: "Enrichissement UF (végétation / faune)" },
] as const;
