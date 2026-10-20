type Props = {
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  confirmKind?: "ok" | "danger";
  busy?: boolean;
};

export function AppDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  onConfirm,
  onClose,
  confirmKind = "ok",
  busy = false,
}: Props) {
  return (
    <div
      className="etudes-home-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="etudes-home-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-dialog-title">{title}</h2>
        {children}
        <div className="etudes-home-modal__actions">
          {onConfirm ? (
            <>
              <button type="button" className="results-toolbar__btn" disabled={busy} onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className={
                  confirmKind === "danger"
                    ? "etudes-home-modal__confirm"
                    : "etudes-home-modal__confirm etudes-home-modal__confirm--ok"
                }
                disabled={busy}
                onClick={onConfirm}
              >
                {confirmLabel ?? "Confirmer"}
              </button>
            </>
          ) : (
            <button type="button" className="results-toolbar__btn" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
