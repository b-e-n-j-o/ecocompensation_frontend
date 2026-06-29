import type { ProjectSummary } from "../../api";
import type { PoolRunListItem } from "../../types";
import type { StudyType } from "../../types/studyTypes";
import { getStudyProfile, studyTypeFilterLabel } from "../../pages/Etude/studyProfiles";
import { normalizeStudyType } from "../../types/studyTypes";

type StudyTypeFilter = "all" | StudyType;

type Props = {
  projectId: string | null;
  projects: ProjectSummary[];
  projectsLoading?: boolean;
  poolRuns: PoolRunListItem[];
  activeRunId: string | null;
  studyTypeFilter?: StudyTypeFilter;
  onStudyTypeFilterChange?: (filter: StudyTypeFilter) => void;
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
  studyTypeFilter = "all",
  onStudyTypeFilterChange,
  onNewStudy,
  onProjectChange,
  onRunChange,
}: Props) {
  const currentProject = projects.find((p) => p.id === projectId);
  const currentProfile = currentProject
    ? getStudyProfile(normalizeStudyType(currentProject.study_type))
    : null;

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
        {onStudyTypeFilterChange && (
          <label className="results-toolbar__field">
            <span className="results-toolbar__label">Type</span>
            <select
              className="results-toolbar__select"
              value={studyTypeFilter}
              onChange={(e) => onStudyTypeFilterChange(e.target.value as StudyTypeFilter)}
            >
              <option value="all">{studyTypeFilterLabel("all")}</option>
              <option value="faune_buffer">{studyTypeFilterLabel("faune_buffer")}</option>
              <option value="zones_humides_intra">{studyTypeFilterLabel("zones_humides_intra")}</option>
            </select>
          </label>
        )}

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
            {projects.map((p) => {
              const profile = getStudyProfile(normalizeStudyType(p.study_type));
              return (
                <option key={p.id} value={p.id}>
                  [{profile.shortLabel}] {p.name || p.id.slice(0, 8)}
                </option>
              );
            })}
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
        {currentProfile && (
          <span className={currentProfile.badgeClass} title={currentProfile.methodologyHint}>
            {currentProfile.badgeLabel}
          </span>
        )}
        {currentProject && (
          <span className="results-toolbar__meta">
            {currentProject.status === "ready" ? "Prêt" : currentProject.status}
          </span>
        )}
      </div>
    </header>
  );
}
