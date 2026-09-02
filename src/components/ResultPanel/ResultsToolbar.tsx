import { Children, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ProjectSummary } from "../../api";
import type { PoolRunListItem } from "../../types";
import { getStudyProfile } from "../../pages/Etude/studyProfiles";
import { normalizeStudyType } from "../../types/studyTypes";
import { ResultsPickList, type ResultsPickItem } from "./ResultsPickList";

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
  onPoolChange: (projectId: string, poolId: string) => void;
  preferOpen?: boolean;
  children?: ReactNode;
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
  onPoolChange,
  preferOpen = false,
  children,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(!projectId || preferOpen);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (preferOpen) setInfoOpen(true);
  }, [preferOpen]);

  const currentProject = projects.find((p) => p.id === projectId);
  const currentProfile = currentProject
    ? getStudyProfile(normalizeStudyType(currentProject.study_type))
    : null;
  const activePool = poolRuns.find((r) => r.id === activePoolId);
  const poolWhen = formatPoolWhen(poolCreatedAt ?? activePool?.created_at);
  const count = parcelCount ?? activePool?.total_count ?? null;
  const projectName = currentProject?.name || (projectId ? projectId.slice(0, 8) : null);

  const poolItems: ResultsPickItem[] = useMemo(() => {
    return [...poolRuns]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((run) => {
        const project = projects.find((p) => p.id === run.project_id);
        const profile = getStudyProfile(normalizeStudyType(project?.study_type));
        const when = formatPoolWhen(run.created_at) ?? "";
        const title = project?.name?.trim() || project?.id.slice(0, 8) || "Projet";
        return {
          id: run.id,
          title,
          badge: profile.shortLabel,
          badgeClass: profile.badgeClass,
          meta: `${when} · ${run.total_count} parc.`,
          searchText: `${title} ${profile.shortLabel} ${when} ${run.total_count}`,
        };
      });
  }, [poolRuns, projects]);

  async function copyPoolId() {
    if (!activePoolId) return;
    try {
      await navigator.clipboard.writeText(activePoolId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  const statusTitle =
    status.kind === "offline" || status.kind === "busy"
      ? status.label
      : status.kind === "ready"
        ? "Données prêtes"
        : undefined;

  return (
    <header className={`results-toolbar${infoOpen ? " is-open" : ""}`}>
      <div className="results-toolbar__bar">
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
          {currentProfile && (
            <span className={currentProfile.badgeClass} title={currentProfile.methodologyHint}>
              {currentProfile.shortLabel}
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

        <button
          type="button"
          className="results-toolbar__info-toggle"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
        >
          Informations du pool
          <span className="results-toolbar__caret" aria-hidden>
            {infoOpen ? "▴" : "▾"}
          </span>
        </button>
      </div>

      {infoOpen && (
        <div className="results-toolbar__panel" role="region" aria-label="Informations du pool">
          {onNewStudy && (
            <button type="button" className="results-toolbar__btn results-toolbar__btn--primary" onClick={onNewStudy}>
              Nouvelle étude
            </button>
          )}

          <ResultsPickList
            label="Pool"
            placeholder="Rechercher un pool…"
            items={poolItems}
            value={activePoolId}
            emptyLabel={poolItems.length === 0 ? "Aucun pool enregistré" : "Choisir un pool"}
            onChange={(poolId) => {
              const pool = poolRuns.find((r) => r.id === poolId);
              if (!pool) return;
              onPoolChange(pool.project_id, pool.id);
            }}
          />

          {activePoolId && projectId && (
            <Link
              to={`/donnees-internes?etude=${encodeURIComponent(projectId)}&pool=${encodeURIComponent(activePoolId)}`}
              className="results-toolbar__btn"
              title="Superposer ce pool sur la carte Données internes"
            >
              Données internes
            </Link>
          )}

          {activePoolId && (
            <div className="results-toolbar__run-id-wrap">
              <span className="results-toolbar__label">ID du pool</span>
              <button
                type="button"
                className="results-toolbar__run-id-btn"
                onClick={() => void copyPoolId()}
                title="Copier l’identifiant"
              >
                <code className="results-toolbar__run-id mono">{activePoolId}</code>
                <span className="results-toolbar__copy">{copied ? "Copié" : "Copier"}</span>
              </button>
            </div>
          )}
          {Children.toArray(children).some(Boolean) && (
            <div className="results-toolbar__funnel">
              {children}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
