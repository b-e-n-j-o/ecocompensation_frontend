import type { ProjectSummary } from "../../../../api";
import type { PoolRunListItem } from "../../../../types";
import { Link } from "react-router-dom";

export type ResultsToolbarStatus =
  | { kind: "offline"; label: string }
  | { kind: "busy"; label: string }
  | { kind: "ready" }
  | { kind: "idle" };

type Props = {
  projectId: string | null;
  projects: ProjectSummary[];
  poolRuns: PoolRunListItem[];
  activePoolId: string | null;
  poolCreatedAt?: string | null;
  parcelCount?: number | null;
  status?: ResultsToolbarStatus;
  onNewStudy?: () => void;
  onEditFilter?: () => void;
  filterParamsOpen?: boolean;
  onToggleFilterParams?: () => void;
  hidePoolPicker?: boolean;
};

function formatPoolWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function ResultsToolbar({
  projectId,
  projects,
  poolRuns,
  activePoolId,
  poolCreatedAt = null,
  parcelCount = null,
  status = { kind: "idle" },
  onNewStudy,
  onEditFilter,
  filterParamsOpen = false,
  onToggleFilterParams,
  hidePoolPicker = false,
}: Props) {
  const currentProject = projects.find((p) => p.id === projectId);
  const activePool = poolRuns.find((r) => r.id === activePoolId);
  const poolWhen = formatPoolWhen(poolCreatedAt ?? activePool?.created_at);
  const count = parcelCount ?? activePool?.total_count ?? null;
  const projectName = currentProject?.name || (projectId ? projectId.slice(0, 8) : null);

  const statusTitle =
    status.kind === "offline" || status.kind === "busy"
      ? status.label
      : status.kind === "ready"
        ? "Données prêtes"
        : undefined;

  return (
    <header className="results-toolbar">
      <div className="results-toolbar__bar">
        {hidePoolPicker ? (
          <div className="results-toolbar__context">
            <span className="results-toolbar__project">Études</span>
          </div>
        ) : (
          <div className="results-toolbar__context">
            <span
              className={`results-status-dot results-status-dot--${status.kind}`}
              title={statusTitle}
              aria-label={statusTitle ?? "Statut"}
            />
            {projectName ? (
              <span className="results-toolbar__project" title={projectName}>
                {projectName}
              </span>
            ) : (
              <span className="results-toolbar__project results-toolbar__project--empty">
                Aucun projet
              </span>
            )}
            {(poolWhen || count != null) && (
              <span className="results-toolbar__run-meta">
                {poolWhen}
                {poolWhen && count != null ? " · " : null}
                {count != null ? `${count} parc.` : null}
              </span>
            )}
            {(status.kind === "busy" || status.kind === "offline") && (
              <span className="results-toolbar__status-label">{status.label}</span>
            )}
          </div>
        )}

        {onToggleFilterParams && (
          <button
            type="button"
            className={`results-toolbar__btn${filterParamsOpen ? " is-on" : ""}`}
            aria-pressed={filterParamsOpen}
            onClick={onToggleFilterParams}
          >
            Paramètres de filtrage
          </button>
        )}

        {onEditFilter && (
          <button type="button" className="results-toolbar__btn results-toolbar__btn--edit" onClick={onEditFilter}>
            Modifier le filtre
          </button>
        )}

        {activePoolId && projectId && !hidePoolPicker && (
          <Link
            to={`/reserve-fonciere?etude=${encodeURIComponent(projectId)}&pool=${encodeURIComponent(activePoolId)}`}
            className="results-toolbar__btn"
            title="Superposer ce pool sur la carte Réserve foncière"
          >
            Visualiser le pool dans la réserve foncière
          </Link>
        )}

        {onNewStudy && (
          <button type="button" className="results-toolbar__btn" onClick={onNewStudy}>
            Nouvelle étude
          </button>
        )}
      </div>
    </header>
  );
}
