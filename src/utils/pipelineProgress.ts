import { isUfLayerKey } from "./layerProgress";

export type StageStatus = "pending" | "running" | "done" | "error";
export type SubStepKey = "analyse" | "sol" | "fauna";
export type MainStageKey = "parcelles" | "uf";

export type StageProgress = {
  status: StageStatus;
  nEntities?: number;
  substeps: Record<SubStepKey, StageStatus>;
};

export type PipelineProgress = Record<MainStageKey, StageProgress>;

export const SUBSTEP_LABELS: Record<SubStepKey, string> = {
  analyse: "Analyse des parcelles / unités foncières",
  sol: "Croisement avec occupation du sol",
  fauna: "Croisement avec données faune",
};

export const MAIN_STAGE_LABELS: Record<MainStageKey, string> = {
  parcelles: "Parcelles seules",
  uf: "Unités foncières personnes morales",
};

const SUBSTEP_ORDER: SubStepKey[] = ["analyse", "sol", "fauna"];

export const INITIAL_PIPELINE_PROGRESS: PipelineProgress = {
  parcelles: {
    status: "pending",
    substeps: { analyse: "pending", sol: "pending", fauna: "pending" },
  },
  uf: {
    status: "pending",
    substeps: { analyse: "pending", sol: "pending", fauna: "pending" },
  },
};

const ALL_SUBSTEPS_DONE: Record<SubStepKey, StageStatus> = {
  analyse: "done",
  sol: "done",
  fauna: "done",
};

/** Marque les deux grandes phases terminées (ex. reprise après navigation). */
export function completedPipelineProgress(
  parcellesN?: number,
  ufN?: number,
): PipelineProgress {
  return {
    parcelles: {
      status: "done",
      nEntities: parcellesN,
      substeps: { ...ALL_SUBSTEPS_DONE },
    },
    uf: {
      status: ufN != null && ufN > 0 ? "done" : "pending",
      nEntities: ufN,
      substeps: ufN != null && ufN > 0 ? { ...ALL_SUBSTEPS_DONE } : { analyse: "pending", sol: "pending", fauna: "pending" },
    },
  };
}

function cloneStage(stage: StageProgress): StageProgress {
  return {
    ...stage,
    substeps: { ...stage.substeps },
  };
}

function cloneProgress(prev: PipelineProgress): PipelineProgress {
  return {
    parcelles: cloneStage(prev.parcelles),
    uf: cloneStage(prev.uf),
  };
}

function setParcellesSubsteps(
  stage: StageProgress,
  substeps: Partial<Record<SubStepKey, StageStatus>>,
  nEntities?: number,
): StageProgress {
  return {
    ...stage,
    nEntities: nEntities ?? stage.nEntities,
    substeps: { ...stage.substeps, ...substeps },
  };
}

function setUfSubsteps(
  stage: StageProgress,
  substeps: Partial<Record<SubStepKey, StageStatus>>,
  nEntities?: number,
): StageProgress {
  return {
    ...stage,
    nEntities: nEntities ?? stage.nEntities,
    substeps: { ...stage.substeps, ...substeps },
  };
}

function isEnrichUfVeg(msg: string): boolean {
  return msg.includes("🌿") || /vég/i.test(msg) || /veg_libelles/i.test(msg);
}

function isEnrichUfFauna(msg: string): boolean {
  return msg.includes("🦎") || /fauna/i.test(msg) || /faune/i.test(msg);
}

export function applyWsToPipelineProgress(
  prev: PipelineProgress,
  data: {
    event?: string;
    layer_key?: string;
    message?: string;
    n_inserted?: number;
    n_final?: number;
  },
): PipelineProgress {
  const ev = data.event ?? "";
  const layerKey = data.layer_key ?? "";
  const msg = data.message ?? "";
  const next = cloneProgress(prev);

  if (ev === "start") {
    return {
      parcelles: {
        status: "running",
        substeps: { analyse: "running", sol: "pending", fauna: "pending" },
      },
      uf: {
        status: "pending",
        substeps: { analyse: "pending", sol: "pending", fauna: "pending" },
      },
    };
  }

  if (ev === "uf_start") {
    next.uf = {
      status: "running",
      nEntities: next.uf.nEntities,
      substeps: { analyse: "running", sol: "pending", fauna: "pending" },
    };
    return next;
  }

  if (ev === "uf_complete") return next;

  if (layerKey === "parcelles" || layerKey === "filter") {
    if (ev === "running" || ev === "progress") {
      next.parcelles.status = "running";
      next.parcelles = setParcellesSubsteps(next.parcelles, { analyse: "running" });
    }
  }

  if (layerKey === "enrich" || msg.startsWith("ENRICH_BATCH:")) {
    next.parcelles.status = "running";
    next.parcelles = setParcellesSubsteps(next.parcelles, {
      analyse: "done",
      sol: "running",
      fauna: "pending",
    });
  }

  if (layerKey === "profiling") {
    if (ev === "running" || ev === "progress") {
      next.parcelles.status = "running";
      next.parcelles = setParcellesSubsteps(next.parcelles, {
        analyse: "done",
        sol: "done",
        fauna: "running",
      });
    }
    if (ev === "done") {
      next.parcelles = setParcellesSubsteps(next.parcelles, {
        analyse: "done",
        sol: "done",
        fauna: "done",
      });
    }
  }

  if (ev === "done" && layerKey === "enrich" && typeof data.n_inserted === "number") {
    next.parcelles.nEntities = data.n_inserted;
  }

  if (ev === "phase:parcelles_ready") {
    next.parcelles.status = "done";
    next.parcelles = setParcellesSubsteps(next.parcelles, {
      analyse: "done",
      sol: "done",
      fauna: "done",
    });
  }

  if (ev === "complete") {
    next.parcelles.status = "done";
    const nFinal = typeof data.n_final === "number" ? data.n_final : undefined;
    if (nFinal !== undefined) next.parcelles.nEntities = nFinal;
    next.parcelles = setParcellesSubsteps(next.parcelles, {
      analyse: "done",
      sol: "done",
      fauna: "done",
    });
  }

  if (layerKey === "unites_foncieres" || layerKey === "sous_ensembles") {
    if (ev === "running" || ev === "progress") {
      next.uf.status = "running";
      next.uf = setUfSubsteps(next.uf, { analyse: "running", sol: "pending", fauna: "pending" });
    }
    if (ev === "done" && typeof data.n_inserted === "number") {
      next.uf.nEntities = data.n_inserted;
      next.uf = setUfSubsteps(next.uf, { analyse: "done", sol: "pending", fauna: "pending" });
    }
  }

  if (layerKey === "enrich_uf") {
    next.uf.status = "running";
    if (isEnrichUfFauna(msg)) {
      next.uf = setUfSubsteps(next.uf, { analyse: "done", sol: "done", fauna: "running" });
    } else if (isEnrichUfVeg(msg) || ev === "running" || ev === "progress") {
      next.uf = setUfSubsteps(next.uf, {
        analyse: "done",
        sol: "running",
        fauna: next.uf.substeps.fauna === "done" ? "done" : "pending",
      });
    }
    if (ev === "done" && typeof data.n_inserted === "number") {
      next.uf.nEntities = data.n_inserted;
      next.uf = setUfSubsteps(next.uf, { analyse: "done", sol: "done", fauna: "done" });
    }
  }

  if (ev === "phase:uf_ready") {
    next.uf.status = "done";
    next.uf = setUfSubsteps(next.uf, { analyse: "done", sol: "done", fauna: "done" });
  }

  if (ev === "error") {
    if (isUfLayerKey(layerKey)) {
      next.uf.status = "error";
    } else if (layerKey && layerKey !== "purge") {
      next.parcelles.status = "error";
    }
  }

  return next;
}

export function formatStageCount(stage: StageProgress): string | null {
  if (stage.status !== "done") return null;
  if (typeof stage.nEntities === "number" && stage.nEntities > 0) {
    return `${stage.nEntities.toLocaleString("fr-FR")} entité(s)`;
  }
  return "Terminé";
}

export { SUBSTEP_ORDER };
