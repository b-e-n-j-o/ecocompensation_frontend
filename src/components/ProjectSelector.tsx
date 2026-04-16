import { useEffect, useState } from "react";
import { deleteProject, fetchProjectHistory, type ProjectHistorySummary } from "../api";

type ProjectSelectorProps = {
  value: string | null;
  onSelect: (projectId: string | null) => void;
  disabled?: boolean;
  className?: string;
};

export function ProjectSelector({
  value,
  onSelect,
  disabled = false,
  className = "",
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<ProjectHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  function loadProjects() {
    setLoading(true);
    setError(null);
    fetchProjectHistory()
      .then((list) => setProjects(list))
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur chargement projets"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProjects();
  }, []);

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
