import { useEffect, useMemo, useState } from "react";
import { fetchFaunaTaxa } from "../../api";

interface FaunaSpeciesPickerProps {
  selectedSpecies: string[];
  onChange: (v: string[]) => void;
}

export function FaunaSpeciesPicker({ selectedSpecies, onChange }: FaunaSpeciesPickerProps) {
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
    if (!taxon) return;
    if (selectedSpecies.includes(taxon)) return;
    onChange([...selectedSpecies, taxon]);
    setSearch("");
    setShowSuggestions(false);
  }

  function removeSpecies(taxon: string) {
    onChange(selectedSpecies.filter((s) => s !== taxon));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label className="create-aoi-label">Filtrage par espèce</label>

        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="create-aoi-input"
            placeholder={loading ? "Chargement des espèces..." : "Rechercher une espèce..."}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Petit délai pour laisser le clic sur une suggestion.
              window.setTimeout(() => setShowSuggestions(false), 150);
            }}
            disabled={loading}
          />

          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: "#12151c",
                border: "1px solid #2a2f3d",
                borderRadius: 6,
                padding: 6,
                maxHeight: 260,
                overflow: "auto",
              }}
            >
              {suggestions.map((s) => (
                <div
                  key={s}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 5,
                    cursor: "pointer",
                    color: "#e5e7eb",
                  }}
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
        <p className="block-hint" style={{ margin: 0 }}>
          Aucun taxon sélectionné : le fetch Faune ne sera pas filtré.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {selectedSpecies.map((s) => (
            <span
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.35)",
                color: "#bfdbfe",
                fontSize: 12,
              }}
            >
              <span>{s}</span>
              <button
                type="button"
                onClick={() => removeSpecies(s)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "transparent",
                  border: "1px solid rgba(59, 130, 246, 0.6)",
                  color: "#bfdbfe",
                  cursor: "pointer",
                  lineHeight: "18px",
                  padding: 0,
                }}
                title="Retirer"
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

