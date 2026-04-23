import { useEffect, useMemo, useState } from "react";
import {
  deleteProject,
  fetchProjectHistory,
  fetchPoolRunsList,
  fetchProjects,
  type ProjectHistorySummary,
  type ProjectSummary,
} from "../api";
import type { PoolRunListItem } from "../types";
import { formatRunFilterSummaryLines as formatRunFilterSummary } from "../utils/formatRunFilterSummary";

type ProjectSelectorProps = {
  value: string | null;
  onSelect: (projectId: string | null) => void;
  onOpenRun?: (projectId: string, runId: string) => void;
  /** Run actuellement affiché (URL `/runs/:id` ou dernier filtre) — synchronise le 2e sélecteur. */
  activeRunId?: string | null;
  disabled?: boolean;
  className?: string;
};

type ProjectLike = ProjectHistorySummary | (ProjectSummary & { history?: null });

export function ProjectSelector({
  value,
  onSelect,
  onOpenRun,
  activeRunId = null,
  disabled = false,
  className = "",
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [poolRunsLoading, setPoolRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === value) ?? null,
    [projects, value],
  );

  function loadProjects() {
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await fetchProjectHistory();
        setProjects(list);
      } catch {
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
    fetchPoolRunsList(value, 100)
      .then((r) => {
        if (cancelled) return;
        const runs = (r.runs ?? []).filter((x) => x.scope === "parcelles");
        setPoolRuns(runs);
      })
      .catch(() => {
        if (cancelled) return;
        setPoolRuns([]);
      })
      .finally(() => {
        if (!cancelled) setPoolRunsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!poolRuns.length) {
      setSelectedRunId(null);
      return;
    }
    if (activeRunId && poolRuns.some((r) => r.id === activeRunId)) {
      setSelectedRunId(activeRunId);
      return;
    }
    setSelectedRunId((prev) => (prev && poolRuns.some((r) => r.id === prev) ? prev : poolRuns[0]!.id));
  }, [poolRuns, activeRunId]);

  const selectedRun = useMemo(
    () => poolRuns.find((r) => r.id === selectedRunId) ?? null,
    [poolRuns, selectedRunId],
  );

  const runSummaryLines = useMemo(
    () => formatRunFilterSummary(selectedRun?.options_json),
    [selectedRun],
  );

  if (loading) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="ps-stack">
          <div className="ps-card ps-card--muted">
            <span className="ps-muted">Chargement des projets…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="ps-stack">
          <div className="ps-card ps-card--error">{error}</div>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`project-selector-block ${className}`}>
        <div className="ps-stack">
          <div className="ps-card ps-card--muted">Aucun projet en base.</div>
        </div>
      </div>
    );
  }

  const unknownProject = value && !currentProject;

  return (
    <div className={`project-selector-block ${className}`}>
      <div className="ps-stack">
        <div className="ps-card">
          <label className="ps-label" htmlFor="ps-project-select">
            Projet actif
          </label>
          <select
            id="ps-project-select"
            className="ps-select"
            value={value ?? ""}
            onChange={(e) => onSelect(e.target.value ? e.target.value : null)}
            disabled={disabled || deletingId !== null}
            aria-label="Choisir le projet"
          >
            <option value="">— Choisir un projet —</option>
            {unknownProject && (
              <option value={value!}>
                Projet {value!.slice(0, 8)}… (chargement du nom)
              </option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {currentProject && (
            <p className="ps-hint mono" title={currentProject.id}>
              ID {currentProject.id.slice(0, 8)}…
            </p>
          )}
        </div>

        {value && (
          <div className="ps-card">
            <label className="ps-label" htmlFor="ps-run-select">
              Run parcelles (historique)
            </label>
            <p className="ps-sub">
              Les filtres de chaque run sont stockés en base dans{" "}
              <span className="mono">parcelles_pool_runs.options_json</span>.
            </p>
            <select
              id="ps-run-select"
              className="ps-select"
              value={selectedRunId ?? ""}
              onChange={(e) => setSelectedRunId(e.target.value || null)}
              disabled={disabled || deletingId !== null || poolRunsLoading || poolRuns.length === 0}
              aria-label="Choisir un run de filtre"
            >
              {!poolRuns.length && (
                <option value="">
                  {poolRunsLoading ? "Chargement des runs…" : "Aucun run enregistré"}
                </option>
              )}
              {poolRuns.map((run) => {
                const d = new Date(run.created_at).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                });
                return (
                  <option key={run.id} value={run.id} title={formatRunFilterSummary(run.options_json).join("\n")}>
                    {d} · {run.total_count} parcelle{run.total_count > 1 ? "s" : ""}
                  </option>
                );
              })}
            </select>

            {selectedRun && (
              <div className="ps-run-filter-wrap">
                <div className="ps-run-filter-label">Filtre appliqué (résumé)</div>
                <ul className="ps-run-detail" aria-label="Paramètres du filtre pour ce run">
                  {runSummaryLines.map((line, i) => (
                    <li key={i} className="ps-run-line">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              className="ps-btn-primary"
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
            >
              Ouvrir les résultats de ce run
            </button>
          </div>
        )}

        {value && (
          <button
            type="button"
            className="ps-btn-danger"
            onClick={() => {
              const name = currentProject?.name ?? value;
              if (
                !window.confirm(
                  `Supprimer le projet « ${name} » ?\n\nToutes les données associées (résultats, AOI, foncier) seront supprimées.`,
                )
              )
                return;
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
          >
            {deletingId === value ? "Suppression…" : "Supprimer ce projet"}
          </button>
        )}
      </div>
    </div>
  );
}
