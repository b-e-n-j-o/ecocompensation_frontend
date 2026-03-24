import { useEffect, useState } from "react";
import { fetchProjects, deleteProject, type ProjectSummary } from "../api";

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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadProjects() {
    setLoading(true);
    setError(null);
    fetchProjects()
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

  return (
    <div className={`project-selector-block ${className}`}>
      <div className="section-header">
        <span className="section-title">Projet</span>
      </div>
      <div className="section-body">
        <label className="project-selector">
          <span className="project-selector__label">Choisir le projet</span>
          <select
            className="project-selector__select"
            value={value ?? ""}
            onChange={(e) => onSelect(e.target.value || null)}
            disabled={disabled}
            title="Choisir le projet sur lequel effectuer le filtrage"
          >
            <option value="">— Sélectionner —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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
