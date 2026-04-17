import { useEffect, useState } from "react";
import {
  deleteProject,
  fetchProjectHistory,
  fetchPoolRunsList,
  fetchProjects,
  type ProjectHistorySummary,
  type ProjectSummary,
} from "../api";
import type { PoolRunListItem } from "../types";

type ProjectSelectorProps = {
  value: string | null;
  onSelect: (projectId: string | null) => void;
  onOpenRun?: (projectId: string, runId: string) => void;
  disabled?: boolean;
  className?: string;
};

export function ProjectSelector({
  value,
  onSelect,
  onOpenRun,
  disabled = false,
  className = "",
}: ProjectSelectorProps) {
  type ProjectLike = ProjectHistorySummary | (ProjectSummary & { history?: null });
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [poolRunsLoading, setPoolRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  function loadProjects() {
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await fetchProjectHistory();
        setProjects(list);
      } catch {
        // Fallback robuste si /api/projects/history est en timeout côté backend.
        // On garde une liste chargeable pour que l'UI filtre reste utilisable.
        try {
          const basic = await fetchProjects();
          setProjects(basic);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur chargement projets");
        }
      } finally {
        setLoading(false);
      }
    })();
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!value) {
      setPoolRuns([]);
      setSelectedRunId(null);
      setPoolRunsLoading(false);
      return;
    }
    let cancelled = false;
    setPoolRunsLoading(true);
    setPoolRuns([]);
    setSelectedRunId(null);
    fetchPoolRunsList(value, 100)
      .then((r) => {
        if (cancelled) return;
        const runs = (r.runs ?? []).filter((x) => x.scope === "parcelles");
        setPoolRuns(runs);
        setSelectedRunId(runs[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPoolRuns([]);
        setSelectedRunId(null);
      })
      .finally(() => {
        if (!cancelled) setPoolRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (loading) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="section-header">
          <span className="section-title">Projet</span>
        </div>
        <div className="section-body">
          <div className="project-selector project-selector--loading">
            <span>Chargement des projets…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="section-header">
          <span className="section-title">Projet</span>
        </div>
        <div className="section-body">
          <div className="project-selector project-selector--error">
            <span>{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="section-header">
          <span className="section-title">Projet</span>
        </div>
        <div className="section-body">
          <div className="project-selector project-selector--empty">
            <span>Aucun projet</span>
          </div>
        </div>
      </div>
    );
  }

  const formatList = (values: string[] | undefined): string =>
    Array.isArray(values) && values.length > 0 ? values.join(", ") : "aucun";

  return (
    <div className={`project-selector-block ${className}`}>
      <div className="section-header">
        <span className="section-title">Projet</span>
      </div>
      <div className="section-body">
        <div className="project-selector">
          <span className="project-selector__label">Historique des projets</span>
          <button
            type="button"
            className="project-history-toggle"
            onClick={() => setShowHistory((v) => !v)}
            disabled={disabled || deletingId !== null}
            title={showHistory ? "Masquer l'historique détaillé" : "Afficher l'historique détaillé"}
          >
            {showHistory ? "Masquer l'historique" : "Afficher l'historique"}
          </button>
          <button
            type="button"
            className={`project-history-item ${value === null ? "project-history-item--selected" : ""}`}
            onClick={() => onSelect(null)}
            disabled={disabled}
            title="Réinitialiser la sélection"
          >
            <span className="project-history-item__title">— Aucun projet sélectionné —</span>
          </button>

          {showHistory && (
            <div className="project-history-list">
              {projects.map((p) => {
                const isSelected = p.id === value;
                const lastFilter = p.history?.last_filter;
                const vegetation = lastFilter?.vegetation_hybride;
                const fauneCount = Array.isArray(lastFilter?.faune_criteria) ? lastFilter?.faune_criteria.length : 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`project-history-item ${isSelected ? "project-history-item--selected" : ""}`}
                    onClick={() => onSelect(p.id)}
                    disabled={disabled || deletingId !== null}
                    title="Charger ce projet"
                  >
                    <span className="project-history-item__title">{p.name}</span>
                    <span className="project-history-item__meta">
                      Buffer: {p.history?.buffer_km ?? "?"} km • Foncier: {p.history?.foncier_area_ha ?? "?"} ha
                    </span>
                    <span className="project-history-item__meta">
                      Pool: {p.history?.pool_total_count ?? 0} parcelles • Min area: {lastFilter?.min_area_ha ?? "?"} ha
                    </span>
                    <span className="project-history-item__meta">
                      Miller: {lastFilter?.miller_threshold ?? "?"} • Rayon départ: {lastFilter?.radius_start_km ?? "?"} km • Cible: {lastFilter?.target_count ?? "?"}
                    </span>
                    <span className="project-history-item__meta">
                      Végétation ({vegetation?.mode ?? "OR"}): ZDV [{formatList(vegetation?.zdv_natures)}] ; CESBIO [{formatList(vegetation?.cesbio_libelles)}]
                    </span>
                    <span className="project-history-item__meta">Faune: {fauneCount} critère(s)</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {value && (
          <div className="project-selector-actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Run pool du projet sélectionné</span>
              <select
                value={selectedRunId ?? ""}
                onChange={(e) => setSelectedRunId(e.target.value || null)}
                disabled={disabled || deletingId !== null || poolRunsLoading || poolRuns.length === 0}
                title="Sélectionner un run à consulter"
                style={{ minHeight: 32 }}
              >
                {!poolRuns.length && (
                  <option value="">
                    {poolRunsLoading ? "Chargement des runs…" : "Aucun run disponible"}
                  </option>
                )}
                {poolRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    ({run.total_count} parc.)
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="project-history-toggle"
                onClick={() => {
                  if (!value || !selectedRunId || !onOpenRun) return;
                  onOpenRun(value, selectedRunId);
                }}
                disabled={
                  disabled ||
                  deletingId !== null ||
                  poolRunsLoading ||
                  !value ||
                  !selectedRunId ||
                  !onOpenRun
                }
                title="Ouvrir la page de résultats du run sélectionné"
              >
                Consulter le pool du run
              </button>
            </div>
            <button
              type="button"
              className="project-selector-delete"
              onClick={() => {
                const name = projects.find((p) => p.id === value)?.name ?? value;
                if (!window.confirm(`Supprimer le projet « ${name} » ?\n\nToutes les données associées (résultats, AOI, foncier) seront supprimées.`)) return;
                setDeletingId(value);
                deleteProject(value)
                  .then(() => {
                    onSelect(null);
                    loadProjects();
                  })
                  .catch((err) => {
                    alert(err instanceof Error ? err.message : "Erreur lors de la suppression");
                  })
                  .finally(() => setDeletingId(null));
              }}
              disabled={disabled || deletingId !== null}
              title="Supprimer ce projet et toutes ses données"
            >
              {deletingId === value ? "Suppression…" : "Supprimer le projet"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
