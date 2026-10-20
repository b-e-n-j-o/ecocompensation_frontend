type Props = {
  label: string;
  draft: string;
  updatedAt: string | null;
  saving: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
};

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function LayerNoteEditor({
  label,
  draft,
  updatedAt,
  saving,
  error,
  onDraftChange,
  onSave,
  onClose,
}: Props) {
  const when = formatUpdatedAt(updatedAt);
  return (
    <div className="di-note" role="region" aria-label={`Note — ${label}`}>
      <div className="di-note__head">
        <p className="di-note__title">Note — {label}</p>
        <button type="button" className="di-icon-btn" onClick={onClose} aria-label="Fermer la note">
          ×
        </button>
      </div>
      <textarea
        className="di-note__field"
        value={draft}
        placeholder="Description, source, précautions d’usage…"
        maxLength={8000}
        disabled={saving}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className="di-note__foot">
        <span className="di-note__meta">
          {error ? error : when ? `Modifiée le ${when}` : "Aucune note enregistrée"}
        </span>
        <button type="button" className="di-note__save" disabled={saving} onClick={onSave}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

export function LayerInfoBtn({
  label,
  hasNote,
  open,
  onClick,
}: {
  label: string;
  hasNote: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`di-icon-btn di-info-btn${hasNote ? " has-note" : ""}${open ? " is-open" : ""}`}
      title={hasNote ? `Note — ${label}` : `Ajouter une note — ${label}`}
      aria-label={hasNote ? `Note de ${label}` : `Ajouter une note à ${label}`}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 11.2V17" strokeLinecap="round" />
        <circle cx="12" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
