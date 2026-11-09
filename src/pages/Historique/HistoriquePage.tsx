import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { deleteProject, fetchAllPoolRunsList, fetchHistoriqueMap, fetchProjectHistory } from "../../api";
import type { HistoriqueMapData, ProjectHistorySummary } from "../../api";
import type { PoolRunListItem } from "../../types";
import { normalizeProjectKind, projectKindLabel } from "../../types/studyTypes";
import { HistoriqueMap } from "./HistoriqueMap";
import { HistoriqueFiltrageDrawer } from "./HistoriqueFiltrageDrawer";

import "./historique.css";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

type ProjectRow = {
  project: ProjectHistorySummary;
  runs: PoolRunListItem[];
  latest: PoolRunListItem;
};

export function HistoriquePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectHistorySummary[]>([]);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [mapData, setMapData] = useState<HistoriqueMapData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dateDesc, setDateDesc] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<ProjectHistorySummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ projectId: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchProjectHistory(),
      fetchAllPoolRunsList(200),
      fetchHistoriqueMap().catch(() => null),
    ])
      .then(([list, runs, geo]) => {
        if (cancelled) return;
        setProjects(list);
        setPoolRuns(runs.runs ?? []);
        setMapData(geo);
      })
      .catch(() => {
        if (cancelled) return;
        setProjects([]);
        setPoolRuns([]);
        setMapData(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const byProject = new Map<string, PoolRunListItem[]>();
    for (const run of poolRuns) {
      const list = byProject.get(run.project_id) ?? [];
      list.push(run);
      byProject.set(run.project_id, list);
    }
    const grouped: ProjectRow[] = [];
    for (const project of projects) {
      const runs = (byProject.get(project.id) ?? []).sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      );
      if (runs.length === 0) continue;
      grouped.push({ project, runs, latest: runs[0] });
    }
    grouped.sort((a, b) => {
      const cmp = String(a.latest.created_at).localeCompare(String(b.latest.created_at));
      return dateDesc ? -cmp : cmp;
    });
    return grouped;
  }, [projects, poolRuns, dateDesc]);

  const latestRunByProject = useMemo(() => {
    const map = new Map<string, PoolRunListItem>();
    for (const row of rows) map.set(row.project.id, row.latest);
    return map;
  }, [rows]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedProjectId]);

  function toggleExpanded(e: MouseEvent, projectId: string) {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function askDelete(e: MouseEvent, projectId: string, name: string) {
    e.stopPropagation();
    if (deletingId) return;
    setDeleteError(null);
    setPendingDelete({ projectId, name });
  }

  function openFiltrage(e: MouseEvent, project: ProjectHistorySummary) {
    e.stopPropagation();
    setFilterProject(project);
  }

  async function confirmDelete() {
    if (!pendingDelete || deletingId) return;
    const { projectId } = pendingDelete;
    setDeletingId(projectId);
    setDeleteError(null);
    try {
      await deleteProject(projectId);
      setPoolRuns((prev) => prev.filter((r) => r.project_id !== projectId));
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setMapData((prev) =>
        prev
          ? {
              points: {
                ...prev.points,
                features: prev.points.features.filter((f) => String(f.properties?.project_id) !== projectId),
              },
              outlines: {
                ...prev.outlines,
                features: prev.outlines.features.filter((f) => String(f.properties?.project_id) !== projectId),
              },
            }
          : prev,
      );
      if (selectedProjectId === projectId) setSelectedProjectId(null);
      if (filterProject?.id === projectId) setFilterProject(null);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  function openStudy(projectId: string, poolId?: string) {
    if (openingId) return;
    const runId = poolId ?? latestRunByProject.get(projectId)?.id;
    if (!runId) return;
    setOpeningId(runId);
    navigate(`/projects/${projectId}/runs/${runId}`);
  }

  function onRowActivate(projectId: string, poolId: string) {
    if (selectedProjectId === projectId) openStudy(projectId, poolId);
    else setSelectedProjectId(projectId);
  }

  return (
    <div className="historique-page">
      <header className="historique-page__header">
        <div>
          <h1>Historique</h1>
          <p>Projets déjà réalisés — un clic pour localiser, un second pour ouvrir</p>
        </div>
        <button
          type="button"
          className="historique-page__new-study"
          onClick={() => navigate("/ecocompensation")}
        >
          Nouvelle étude
        </button>
      </header>

      {!loaded ? (
        <div className="historique-page__loading" role="status" aria-live="polite">
          Chargement des études…
        </div>
      ) : rows.length === 0 ? (
        <div className="historique-page__empty">
          <p>Aucune étude enregistrée</p>
          <button type="button" className="historique-page__primary" onClick={() => navigate("/ecocompensation")}>
            Nouvelle étude
          </button>
        </div>
      ) : (
        <div className={`historique-page__split${openingId ? " historique-page__split--opening" : ""}`}>
          {openingId ? (
            <div className="historique-page__loading historique-page__loading--overlay" role="status">
              Ouverture…
            </div>
          ) : null}
          <div className="historique-page__list">
            <table className="historique-page__table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="historique-page__sort"
                      onClick={() => setDateDesc((v) => !v)}
                    >
                      Date {dateDesc ? "↓" : "↑"}
                    </button>
                  </th>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Pool</th>
                  <th className="historique-page__col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { project, runs, latest } = row;
                  const name = project.name?.trim() || project.id.slice(0, 8);
                  const isDeleting = deletingId === project.id;
                  const isSelected = selectedProjectId === project.id;
                  const expanded = expandedIds.has(project.id);
                  const kind = projectKindLabel(normalizeProjectKind(project.study_type));
                  const extraRuns = runs.slice(1);
                  return (
                    <Fragment key={project.id}>
                      <tr
                        ref={isSelected ? selectedRowRef : undefined}
                        tabIndex={0}
                        className={isSelected ? "historique-page__row--selected" : undefined}
                        onClick={() => onRowActivate(project.id, latest.id)}
                        onDoubleClick={() => openStudy(project.id, latest.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowActivate(project.id, latest.id);
                          }
                        }}
                      >
                        <td>
                          <span className="historique-page__date-cell">
                            {extraRuns.length > 0 ? (
                              <button
                                type="button"
                                className="historique-page__fold"
                                aria-expanded={expanded}
                                aria-label={expanded ? "Replier les versions" : "Déplier les versions"}
                                onClick={(e) => toggleExpanded(e, project.id)}
                              >
                                {expanded ? "▾" : "▸"}
                              </button>
                            ) : (
                              <span className="historique-page__fold-spacer" />
                            )}
                            {formatWhen(latest.created_at)}
                          </span>
                        </td>
                        <td className="historique-page__name">{name}</td>
                        <td>{kind}</td>
                        <td>{latest.total_count.toLocaleString("fr-FR")}</td>
                        <td className="historique-page__col-actions">
                          <button
                            type="button"
                            className="historique-page__filter-btn"
                            title="Voir le filtre"
                            onClick={(e) => openFiltrage(e, project)}
                          >
                            Voir le filtre
                          </button>
                          <button
                            type="button"
                            className="historique-page__delete"
                            title={`Supprimer « ${name} »`}
                            aria-label={`Supprimer l’étude ${name}`}
                            disabled={isDeleting}
                            onClick={(e) => askDelete(e, project.id, name)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                      {expanded
                        ? extraRuns.map((run) => (
                            <tr
                              key={run.id}
                              className="historique-page__row--nested"
                              onClick={() => onRowActivate(project.id, run.id)}
                              onDoubleClick={() => openStudy(project.id, run.id)}
                            >
                              <td colSpan={2}>{formatWhen(run.created_at)}</td>
                              <td />
                              <td>{run.total_count.toLocaleString("fr-FR")}</td>
                              <td />
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <HistoriqueMap
            points={mapData?.points ?? null}
            outlines={mapData?.outlines ?? null}
            selectedProjectId={selectedProjectId}
            onSelect={setSelectedProjectId}
            onOpen={openStudy}
          />
        </div>
      )}

      {filterProject ? (
        <HistoriqueFiltrageDrawer
          projectName={filterProject.name?.trim() || filterProject.id.slice(0, 8)}
          rawConfig={filterProject.filter_config ?? filterProject.history.last_filter}
          onClose={() => setFilterProject(null)}
        />
      ) : null}

      {pendingDelete ? (
        <div
          className="historique-page__modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!deletingId) setPendingDelete(null);
          }}
        >
          <div
            className="historique-page__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="historique-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="historique-delete-title">Supprimer cette étude ?</h2>
            <p>
              L’étude « {pendingDelete.name} » et toutes les données associées (résultats, AOI, foncier, pools)
              seront définitivement supprimées.
            </p>
            {deleteError ? <p className="historique-page__error">{deleteError}</p> : null}
            <div className="historique-page__modal-actions">
              <button type="button" disabled={!!deletingId} onClick={() => setPendingDelete(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="historique-page__danger"
                disabled={!!deletingId}
                onClick={() => void confirmDelete()}
              >
                {deletingId ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
