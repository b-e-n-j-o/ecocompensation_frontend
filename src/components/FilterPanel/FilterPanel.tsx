// ─── FilterPanel — composant principal ───────────────────────────────────────
import { useState } from "react";
import { DEFAULT_FILTER } from "../../types";
import type { FilterOptions } from "../../types";
import { ProjectSelector } from "../ProjectSelector";
import {
  ExclusionsBlock,
  ZdvBlock,
  HydroBlock,
  GeometryBlock,
  ScoringWeightsBlock,
} from "./blocks";

interface FilterPanelProps {
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  onSubmit: (options: FilterOptions) => void;
  onNavigateToCreate?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function FilterPanel({
  projectId,
  onProjectChange,
  onSubmit,
  onNavigateToCreate,
  isLoading = false,
  disabled = false,
}: FilterPanelProps) {
  const [opts, setOpts] = useState<FilterOptions>(DEFAULT_FILTER);

  function patch(p: Partial<FilterOptions>) {
    setOpts((prev) => ({ ...prev, ...p }));
  }

  function reset() {
    setOpts(DEFAULT_FILTER);
  }

  const runBtn = (
    <button
      type="button"
      className={`btn-run ${isLoading ? "loading" : ""}`}
      onClick={() => onSubmit(opts)}
      disabled={disabled || isLoading}
      title="Lancer le filtre"
    >
      {isLoading ? (
        <>
          <span className="spinner" />
          Filtrage en cours…
        </>
      ) : (
        <>
          <span>▶</span>
          Lancer le filtre
        </>
      )}
    </button>
  );

  return (
    <aside className="filter-panel">
      <div className="filter-panel-header">
        <div className="fph-title">
          <span className="fph-icon">⧖</span>
        </div>
        <div className="fph-actions">
          {onNavigateToCreate && (
            <button
              type="button"
              className="btn-create-aoi"
              onClick={onNavigateToCreate}
              title="Créer une AOI à partir d'une parcelle"
            >
              ◇ Créer une AOI
            </button>
          )}
          <button className="btn-reset" onClick={reset} title="Réinitialiser">
            ↺
          </button>
          {runBtn}
        </div>
      </div>

      <div className="filter-panel-body">
        <ProjectSelector
          value={projectId}
          onSelect={onProjectChange}
          disabled={isLoading}
        />
        <ExclusionsBlock
          value={opts.excluded_layers}
          onChange={(v) => patch({ excluded_layers: v })}
        />
        <ZdvBlock
          value={opts.zdv_natures}
          onChange={(v) => patch({ zdv_natures: v })}
        />
        <HydroBlock
          tronconMode={opts.troncon_hydro_mode}
          tronconRadius={opts.troncon_hydro_radius_m}
          surfaceMode={opts.surface_hydro_mode}
          surfaceRadius={opts.surface_hydro_radius_m}
          onChange={patch}
        />
        <GeometryBlock
          miller={opts.miller_threshold}
          minAreaHa={opts.min_area_ha}
          maxResults={opts.target_count}
          onChange={patch}
        />
        <ScoringWeightsBlock options={opts} onChange={patch} />
      </div>

      <div className="filter-panel-footer">
        {runBtn}
      </div>
    </aside>
  );
}
