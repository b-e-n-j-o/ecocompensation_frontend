/**
 * Panneau de filtrage écologique — une section par famille de critères (couche / thème).
 * Voir `layers/` pour adapter couche par couche sans fichier monolithique.
 */
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { DEFAULT_FILTER } from "../../types";
import type {
  ArrachageVignesMode,
  CarhabNomEunis,
  FauneCriterion,
  FilterOptions,
  LayerIntersectMode,
  ZoneHumideMode,
} from "../../types";
import { ProjectSelector } from "../ProjectSelector";
import {
  ExclusionsSection,
  FauneSection,
  VegetationHybrideSection,
  ArrachageVignesSection,
  ZoneHumideSection,
  RemonteeNappesSection,
  LayerIntersectSection,
  CarhabSection,
  HydroSection,
  GeometrySection,
} from "./layers";

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: 360,
  height: "100%",
  background: "#1a1d24",
  borderRight: "1px solid #2a2f3d",
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: "#e5e7eb",
};

interface FilterPanelProps {
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  onSubmit: (options: FilterOptions, scoreOnlyMode: boolean) => void;
  onNavigateToCreate?: () => void;
  isLoading?: boolean;
  loadingText?: string | null;
  disabled?: boolean;
  /** Hydratation des critères (ex. chargement d’un run historique). */
  initialOptions?: FilterOptions | null;
}

export function FilterPanel({
  projectId,
  onProjectChange,
  onSubmit,
  onNavigateToCreate,
  isLoading = false,
  loadingText = null,
  disabled = false,
  initialOptions = null,
}: FilterPanelProps) {
  const [opts, setOpts] = useState<FilterOptions>(DEFAULT_FILTER);
  const [scoreOnlyMode, setScoreOnlyMode] = useState(false);

  useEffect(() => {
    if (initialOptions) {
      setOpts({ ...DEFAULT_FILTER, ...initialOptions });
    }
  }, [initialOptions]);

  function patch(p: Partial<FilterOptions>) {
    setOpts((prev) => ({ ...prev, ...p }));
  }

  const runBtn = (
    <button
      type="button"
      onClick={() => onSubmit(opts, scoreOnlyMode)}
      disabled={disabled || isLoading}
      style={{
        width: 220,
        height: 34,
        background: isLoading ? "#262b36" : "#10b981",
        color: isLoading ? "#9ca3af" : "#fff",
        border: isLoading ? "1px solid #2a2f3d" : "none",
        borderRadius: 4,
        padding: "0 14px",
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled || isLoading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: disabled || isLoading ? 0.6 : 1,
      }}
    >
      {isLoading ? (
        <span className="loading-text-breathe" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          ⏳ {loadingText ?? "Filtrage en cours…"}
        </span>
      ) : (
        <>
          <span>▶</span>
          Lancer le filtre
        </>
      )}
    </button>
  );

  return (
    <aside style={shell}>
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid #2a2f3d",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "#9ca3af" }}>
          <span style={{ marginRight: 6 }}>⧖</span>
          Filtre
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
          {onNavigateToCreate && (
            <button
              type="button"
              onClick={onNavigateToCreate}
              title="Nouvelle étude"
              style={{
                background: "#2a2f3d",
                border: "1px solid #3b82f6",
                color: "#93c5fd",
                borderRadius: 4,
                width: 220,
                height: 32,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ◇ Créer une nouvelle étude
            </button>
          )}
          {runBtn}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <ProjectSelector value={projectId} onSelect={onProjectChange} disabled={isLoading} />

        <ExclusionsSection value={opts.excluded_layers} onChange={(v: string[]) => patch({ excluded_layers: v })} />

        <GeometrySection
          miller={opts.miller_threshold}
          minAreaHa={opts.min_area_ha}
          maxResults={opts.target_count}
          onChange={patch}
        />
        <FauneSection
          projectId={projectId}
          value={opts.faune_criteria}
          onChange={(v: FauneCriterion[]) => patch({ faune_criteria: v })}
        />

        <VegetationHybrideSection
          value={opts.vegetation_hybride}
          onChange={(v) => patch({ vegetation_hybride: v })}
        />

        <ZoneHumideSection
          value={opts.zone_humide_mode}
          onChange={(v: ZoneHumideMode) => patch({ zone_humide_mode: v })}
        />

        <RemonteeNappesSection
          value={opts.remontee_nappes_classefiab}
          onChange={(v: string[]) => patch({ remontee_nappes_classefiab: v })}
        />

        <LayerIntersectSection
          title="Espaces boisés classés (EBC)"
          icon="🌳"
          tableSqlName="ecocompensation_results.ebc"
          radioName="ebc-mode"
          value={opts.ebc_mode}
          onChange={(v: LayerIntersectMode) => patch({ ebc_mode: v })}
          accent="green"
        />
        <LayerIntersectSection
          title="Natura 2000"
          icon="🦋"
          tableSqlName="ecocompensation_results.natura2000"
          radioName="natura2000-mode"
          value={opts.natura2000_mode}
          onChange={(v: LayerIntersectMode) => patch({ natura2000_mode: v })}
          accent="purple"
        />
        <LayerIntersectSection
          title="Réserves naturelles"
          icon="🏞️"
          tableSqlName="ecocompensation_results.reserves_naturelles"
          radioName="reserves-naturelles-mode"
          value={opts.reserves_naturelles_mode}
          onChange={(v: LayerIntersectMode) => patch({ reserves_naturelles_mode: v })}
          accent="green"
        />
        <LayerIntersectSection
          title="ZNIEFF"
          icon="🌼"
          tableSqlName="ecocompensation_results.znieff"
          radioName="znieff-mode"
          value={opts.znieff_mode}
          onChange={(v: LayerIntersectMode) => patch({ znieff_mode: v })}
          accent="orange"
        />

        <HydroSection
          tronconMode={opts.troncon_hydro_mode}
          tronconRadius={opts.troncon_hydro_radius_m}
          surfaceMode={opts.surface_hydro_mode}
          surfaceRadius={opts.surface_hydro_radius_m}
          onChange={patch}
        />
        
        <ArrachageVignesSection
          value={opts.arrachage_vignes_mode}
          onChange={(v: ArrachageVignesMode) => patch({ arrachage_vignes_mode: v })}
        />

      <CarhabSection value={opts.carhab_nom_eunis} onChange={(v: CarhabNomEunis[]) => patch({ carhab_nom_eunis: v })} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={opts.funnel_mode !== false}
            onChange={(e) => patch({ funnel_mode: e.target.checked })}
          />
          Détail de filtrage (entonnoir)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={scoreOnlyMode}
            onChange={(e) => setScoreOnlyMode(e.target.checked)}
          />
          Recalculer uniquement le scoring (debug perf)
        </label>

      </div>

    </aside>
  );
}
