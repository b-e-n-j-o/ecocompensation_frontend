// ─── FilterPanel — composant principal ───────────────────────────────────────
import { useState } from "react";
import { DEFAULT_FILTER } from "../../types";
import type { FilterOptions } from "../../types";
import {
  ExclusionsBlock,
  ZdvBlock,
  HydroBlock,
  GeometryBlock,
  DistanceBlock,
  ScoringWeightsBlock,
} from "./blocks";

interface FilterPanelProps {
  onSubmit: (options: FilterOptions) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function FilterPanel({ onSubmit, isLoading = false, disabled = false }: FilterPanelProps) {
  const [opts, setOpts] = useState<FilterOptions>(DEFAULT_FILTER);

  function patch(p: Partial<FilterOptions>) {
    setOpts((prev) => ({ ...prev, ...p }));
  }

  function reset() {
    setOpts(DEFAULT_FILTER);
  }

  return (
    <aside className="filter-panel">
      <div className="filter-panel-header">
        <div className="fph-title">
          <span className="fph-icon">⧖</span>
          <span>Paramètres du filtre</span>
        </div>
        <button className="btn-reset" onClick={reset} title="Réinitialiser">
          ↺
        </button>
      </div>

      <div className="filter-panel-body">
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
          onChange={patch}
        />
        <DistanceBlock
          radiusStart={opts.radius_start_km}
          radiusMin={opts.radius_min_km}
          targetCount={opts.target_count}
          onChange={patch}
        />
        <ScoringWeightsBlock options={opts} onChange={patch} />
      </div>

      <div className="filter-panel-footer">
        <button
          className={`btn-run ${isLoading ? "loading" : ""}`}
          onClick={() => onSubmit(opts)}
          disabled={disabled || isLoading}
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
      </div>
    </aside>
  );
}
