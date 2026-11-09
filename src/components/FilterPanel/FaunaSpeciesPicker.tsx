import { useEffect, useMemo, useState } from "react";
import { fetchFaunaTaxa } from "../../api";
import "./FaunaSpeciesPicker.css";

const DEFAULT_DIST_M = 1000;

interface FaunaSpeciesPickerProps {
  selectedSpecies: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Distance max (m) observation ↔ parcelle, par espèce. */
  distances?: Record<string, number>;
  onDistanceChange?: (species: string, distM: number) => void;
}

export function FaunaSpeciesPicker({
  selectedSpecies,
  onChange,
  disabled = false,
  compact = false,
  distances,
  onDistanceChange,
}: FaunaSpeciesPickerProps) {
  const [taxa, setTaxa] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFaunaTaxa()
      .then((items) => {
        if (cancelled) return;
        setTaxa(items);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Impossible de charger les espèces");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const selected = new Set(selectedSpecies);
    return taxa
      .filter((t) => !selected.has(t) && t.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, taxa, selectedSpecies]);

  function addSpecies(taxon: string) {
    if (disabled) return;
    if (!taxon) return;
    if (selectedSpecies.includes(taxon)) return;
    onChange([...selectedSpecies, taxon]);
    setSearch("");
    setShowSuggestions(false);
  }

  function removeSpecies(taxon: string) {
    if (disabled) return;
    onChange(selectedSpecies.filter((s) => s !== taxon));
  }

  return (
    <div className="fauna-species-picker">
      <div className="fauna-species-picker__field">
        {!compact && (
          <label className="create-aoi-label" htmlFor="fauna-species-search">
            Filtrage par espèce
          </label>
        )}

        <div className="fauna-species-picker__search-wrap">
          <input
            id="fauna-species-search"
            type="text"
            className="create-aoi-input"
            aria-label={compact ? "Rechercher une espèce" : undefined}
            placeholder={loading ? "Chargement…" : compact ? "Rechercher…" : "Rechercher une espèce…"}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              window.setTimeout(() => setShowSuggestions(false), 150);
            }}
            disabled={loading || disabled}
          />

          {!disabled && showSuggestions && suggestions.length > 0 && (
            <div className="fauna-species-picker__suggestions" role="listbox">
              {suggestions.map((s) => (
                <div
                  key={s}
                  role="option"
                  className="fauna-species-picker__suggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addSpecies(s)}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="create-aoi-error">{error}</div>}
      </div>

      {selectedSpecies.length === 0 ? (
        compact ? null : (
          <p className="fauna-species-picker__hint">
            Aucun taxon sélectionné : le fetch Faune ne sera pas filtré.
          </p>
        )
      ) : (
        <div className={onDistanceChange ? "fauna-species-picker__rows" : "fauna-species-picker__chips"}>
          {selectedSpecies.map((s) => {
            const dist = distances?.[s] ?? DEFAULT_DIST_M;
            if (!onDistanceChange) {
              return (
                <span key={s} className="fauna-species-picker__chip">
                  <span className="fauna-species-picker__chip-label">{s}</span>
                  <button
                    type="button"
                    className="fauna-species-picker__chip-remove"
                    onClick={() => removeSpecies(s)}
                    disabled={disabled}
                    title="Retirer"
                    aria-label={`Retirer ${s}`}
                  >
                    ×
                  </button>
                </span>
              );
            }
            return (
              <div key={s} className="fauna-species-picker__row">
                <div className="fauna-species-picker__row-head">
                  <span className="fauna-species-picker__chip-label">{s}</span>
                  <button
                    type="button"
                    className="fauna-species-picker__chip-remove"
                    onClick={() => removeSpecies(s)}
                    disabled={disabled}
                    title="Retirer"
                    aria-label={`Retirer ${s}`}
                  >
                    ×
                  </button>
                </div>
                <div className="eco-aoi-slider">
                  <div className="eco-aoi-slider-head">
                    <span className="eco-aoi-label">Distance max</span>
                    <span className="eco-aoi-slider-value">{dist.toFixed(0)} m</span>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={5000}
                    step={100}
                    value={dist}
                    disabled={disabled}
                    onChange={(e) => onDistanceChange(s, Number(e.target.value))}
                    aria-label={`Distance maximale pour ${s}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
