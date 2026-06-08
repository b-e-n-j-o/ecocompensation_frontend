import { useEffect, useMemo, useState } from "react";
import { fetchFaunaTaxa } from "../../api";
import "./FaunaSpeciesPicker.css";

interface FaunaSpeciesPickerProps {
  selectedSpecies: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}

export function FaunaSpeciesPicker({ selectedSpecies, onChange, disabled = false }: FaunaSpeciesPickerProps) {
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
        <label className="create-aoi-label" htmlFor="fauna-species-search">
          Filtrage par espèce
        </label>

        <div className="fauna-species-picker__search-wrap">
          <input
            id="fauna-species-search"
            type="text"
            className="create-aoi-input"
            placeholder={loading ? "Chargement des espèces…" : "Rechercher une espèce…"}
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
        <p className="fauna-species-picker__hint">
          Aucun taxon sélectionné : le fetch Faune ne sera pas filtré.
        </p>
      ) : (
        <div className="fauna-species-picker__chips">
          {selectedSpecies.map((s) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
