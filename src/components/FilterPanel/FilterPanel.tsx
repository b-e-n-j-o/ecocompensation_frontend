/**
 * Panneau de filtrage écologique — une section par famille de critères (couche / thème).
 * Voir `layers/` pour adapter couche par couche sans fichier monolithique.
 */
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { buildFilterRequestPayload } from "../../api";
import { DEFAULT_FILTER } from "../../types";
import type {
  FauneCriterion,
  FilterOptions,
  LayerIntersectMode,
  VegetationHybrideValue,
} from "../../types";
import { ProjectSelector } from "../ProjectSelector";
import {
  ExclusionsSection,
  FauneSection,
  LayerIntersectSection,
  HydroSection,
  GeometrySection,
  VegetationHybrideSection,
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
  onOpenRun?: (projectId: string, runId: string) => void;
  /** Run affiché côté résultats (URL ou dernier filtre) — aligne le sélecteur de runs. */
  activeRunId?: string | null;
  onSubmit: (options: FilterOptions, scoreOnlyMode: boolean, ufOnlyMode: boolean) => void;
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
  onOpenRun,
  activeRunId = null,
  onSubmit,
  onNavigateToCreate,
  isLoading = false,
  loadingText = null,
  disabled = false,
  initialOptions = null,
}: FilterPanelProps) {
  const [opts, setOpts] = useState<FilterOptions>(DEFAULT_FILTER);
  const [scoreOnlyMode, setScoreOnlyMode] = useState(false);
  const [ufOnlyMode, setUfOnlyMode] = useState(false);
  const [showDebugPayload, setShowDebugPayload] = useState(false);

  useEffect(() => {
    if (initialOptions) {
      setOpts({ ...DEFAULT_FILTER, ...initialOptions });
    }
  }, [initialOptions]);

  function patch(p: Partial<FilterOptions>) {
    setOpts((prev) => ({ ...prev, ...p }));
  }

  const debugPayloadText = useMemo(() => {
    const payload = buildFilterRequestPayload(opts);
    return JSON.stringify(
      {
        endpoint: ufOnlyMode ? "/api/projects/{project_id}/filter/uf" : "/api/projects/{project_id}/filter",
        payload,
        scoreOnlyMode,
        ufOnlyMode,
      },
      null,
      2,
    );
  }, [opts, scoreOnlyMode, ufOnlyMode]);

  const runBtn = (
    <button
      type="button"
      onClick={() => onSubmit(opts, scoreOnlyMode, ufOnlyMode)}
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
          {ufOnlyMode ? "Lancer le filtre UF" : "Lancer le filtre"}
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
        <ProjectSelector
          value={projectId}
          onSelect={onProjectChange}
          onOpenRun={onOpenRun}
          activeRunId={activeRunId}
          disabled={isLoading}
        />

        <ExclusionsSection
          projectId={projectId}
          value={opts.excluded_layers}
          onChange={(v: string[]) => patch({ excluded_layers: v })}
        />

        <VegetationHybrideSection
          value={opts.vegetation_hybride}
          onChange={(v: VegetationHybrideValue) => patch({ vegetation_hybride: v })}
        />

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

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={ufOnlyMode}
            onChange={(e) => setUfOnlyMode(e.target.checked)}
          />
          Lancer uniquement le filtrage unités foncières (UF)
        </label>

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

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showDebugPayload}
            onChange={(e) => setShowDebugPayload(e.target.checked)}
          />
          Afficher payload backend (debug 422)
        </label>

        {showDebugPayload && (
          <div
            style={{
              marginTop: 4,
              border: "1px solid #2a2f3d",
              borderRadius: 6,
              background: "#111827",
              padding: 8,
            }}
          >
            <div style={{ fontSize: 11, color: "#93c5fd", marginBottom: 6 }}>
              Requête réellement envoyée par le front
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 11,
                lineHeight: 1.35,
                color: "#cbd5e1",
              }}
            >
              {debugPayloadText}
            </pre>
          </div>
        )}

      </div>

    </aside>
  );
}
