import type { PoolRunListItem, ProjectSummary } from "../../api";

type Props = {
  projectId: string | null;
  projects: ProjectSummary[];
  projectsLoading?: boolean;
  poolRuns: PoolRunListItem[];
  activeRunId: string | null;
  onNewStudy?: () => void;
  onProjectChange: (projectId: string) => void;
  onRunChange: (runId: string) => void;
};

export function ResultsToolbar({
  projectId,
  projects,
  projectsLoading = false,
  poolRuns,
  activeRunId,
  onNewStudy,
  onProjectChange,
  onRunChange,
}: Props) {
  const currentProject = projects.find((p) => p.id === projectId);

  return (
    <header className="results-toolbar">
      <div className="results-toolbar__left">
        {onNewStudy && (
          <button type="button" className="results-toolbar__btn results-toolbar__btn--primary" onClick={onNewStudy}>
            Nouvelle étude
          </button>
        )}
      </div>

      <div className="results-toolbar__center">
        <label className="results-toolbar__field">
          <span className="results-toolbar__label">Projet</span>
          <select
            className="results-toolbar__select"
            value={projectId ?? ""}
            disabled={projectsLoading || projects.length === 0}
            onChange={(e) => {
              const id = e.target.value;
              if (id) onProjectChange(id);
            }}
          >
            {!projectId && <option value="">— Sélectionner —</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <label className="results-toolbar__field">
          <span className="results-toolbar__label">Pool / run</span>
          <select
            className="results-toolbar__select"
            value={activeRunId ?? ""}
            disabled={!projectId || poolRuns.length === 0}
            onChange={(e) => {
              const runId = e.target.value;
              if (runId) onRunChange(runId);
            }}
            title="Charger un pool de parcelles déjà filtré"
          >
            {poolRuns.length === 0 ? (
              <option value="">Aucun run enregistré</option>
            ) : (
              poolRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {new Date(run.created_at).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · {run.total_count} parc.
                </option>
              ))
            )}
          </select>
        </label>

        {activeRunId && (
          <div className="results-toolbar__run-id-wrap">
            <span className="results-toolbar__label">Run ID</span>
            <code className="results-toolbar__run-id mono" title="UUID pour requêtes SQL">
              {activeRunId}
            </code>
          </div>
        )}
      </div>

      <div className="results-toolbar__right">
        {currentProject && (
          <span className="results-toolbar__meta">
            {currentProject.status === "ready" ? "Prêt" : currentProject.status}
          </span>
        )}
      </div>
    </header>
  );
}
