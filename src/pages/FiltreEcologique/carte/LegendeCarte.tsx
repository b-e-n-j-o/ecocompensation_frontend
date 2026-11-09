import "./LegendeCarte.css";

export interface LegendeLigne {
  id: string;
  label: string;
  color?: string;
  swatchClass?: string;
  /** Sous-lignes (couleurs d'espèces) : pastille seulement, pas d'œil. */
  notes?: { label: string; color: string }[];
}

export function LegendeCarte({
  lignes,
  visible,
  onToggle,
}: {
  lignes: LegendeLigne[];
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  if (lignes.length === 0) return null;
  return (
    <div className="eco-legende" aria-label="Légende de la carte">
      {lignes.map((ligne) => {
        const on = visible[ligne.id] !== false;
        return (
          <div key={ligne.id} className="eco-legende__bloc">
            <button
              type="button"
              className={`eco-legende__ligne${on ? "" : " is-off"}`}
              aria-pressed={on}
              aria-label={on ? `Masquer ${ligne.label}` : `Afficher ${ligne.label}`}
              onClick={() => onToggle(ligne.id)}
            >
              <span
                className={`eco-aoi-legend-swatch${ligne.swatchClass ? ` ${ligne.swatchClass}` : ""}`}
                style={ligne.color ? { background: ligne.color } : undefined}
              />
              <span className="eco-legende__label">{ligne.label}</span>
              <Oeil ouvert={on} />
            </button>
            {on && ligne.notes?.map((note) => (
              <div key={note.label} className="eco-legende__note">
                <span className="eco-aoi-legend-swatch" style={{ background: note.color }} />
                {note.label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Oeil({ ouvert }: { ouvert: boolean }) {
  return (
    <svg className="eco-legende__oeil" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M12 5c-5.5 0-9.5 4.2-10.7 6.4a1.5 1.5 0 0 0 0 1.2C2.5 14.8 6.5 19 12 19s9.5-4.2 10.7-6.4a1.5 1.5 0 0 0 0-1.2C21.5 9.2 17.5 5 12 5zm0 12c-4.3 0-7.6-3.2-8.7-5C4.4 10.2 7.7 7 12 7s7.6 3.2 8.7 5c-1.1 1.8-4.4 5-8.7 5zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
      {!ouvert && (
        <path fill="currentColor" d="M4.2 3.4 20.6 19.8l-1.4 1.4L2.8 4.8z" />
      )}
    </svg>
  );
}
