import { Fragment, useEffect, useState } from "react";
import { getApiBaseUrl } from "../../config/apiBase";
import { EntreEspeces } from "./EntreEspeces";
import "../../components/FilterPanel/FaunaSpeciesPicker.css";

export type FloraPick = {
  taxon_key: string;
  label: string;
  dist_m: number;
};

type TaxonHit = {
  taxon_key: string;
  nom_scientifique: string | null;
  nom_vernaculaire: string | null;
};

const DEFAULT_DIST_M = 200;

function labelOf(hit: TaxonHit): string {
  const sci = hit.nom_scientifique || hit.taxon_key;
  return hit.nom_vernaculaire ? `${sci} — ${hit.nom_vernaculaire}` : sci;
}

export function FloraTaxonPicker({
  selected,
  onChange,
  disabled = false,
  joins = [],
  onJoinsChange,
  showDistance = true,
}: {
  selected: FloraPick[];
  onChange: (next: FloraPick[]) => void;
  joins?: ("and" | "or")[];
  onJoinsChange?: (next: ("and" | "or")[]) => void;
  disabled?: boolean;
  /** false = caractéristique (distance à l’observation la plus proche), pas un rayon de filtre. */
  showDistance?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TaxonHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      const url = `${getApiBaseUrl()}/api/flore/taxons?q=${encodeURIComponent(q.trim())}&limit=20`;
      fetch(url, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: TaxonHit[]) => setHits(Array.isArray(rows) ? rows : []))
        .catch(() => setHits([]));
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  function add(hit: TaxonHit) {
    if (selected.some((s) => s.taxon_key === hit.taxon_key)) return;
    onChange([...selected, { taxon_key: hit.taxon_key, label: labelOf(hit), dist_m: DEFAULT_DIST_M }]);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="fauna-species-picker">
      <div className="fauna-species-picker__search-wrap">
        <input
          type="text"
          className="create-aoi-input"
          placeholder="Rechercher un taxon…"
          value={q}
          disabled={disabled}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        {open && hits.length > 0 && (
          <div className="fauna-species-picker__suggestions" role="listbox">
            {hits.filter((h) => !selected.some((s) => s.taxon_key === h.taxon_key)).map((h) => (
              <div
                key={h.taxon_key}
                role="option"
                className="fauna-species-picker__suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(h)}
              >
                {labelOf(h)}
              </div>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="fauna-species-picker__rows">
          {selected.map((s, index) => (
            <Fragment key={s.taxon_key}>
            <div className="fauna-species-picker__row">
              <div className="fauna-species-picker__row-head">
                <span className="fauna-species-picker__chip-label">{s.label}</span>
                <button
                  type="button"
                  className="fauna-species-picker__chip-remove"
                  onClick={() => onChange(selected.filter((x) => x.taxon_key !== s.taxon_key))}
                  disabled={disabled}
                  title="Retirer"
                  aria-label={`Retirer ${s.label}`}
                >
                  ×
                </button>
              </div>
              {showDistance ? (
                <div className="eco-aoi-slider">
                  <div className="eco-aoi-slider-head">
                    <span className="eco-aoi-label">Distance max</span>
                    <span className="eco-aoi-slider-value">{s.dist_m.toFixed(0)} m</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={100}
                    value={s.dist_m}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(
                        selected.map((x) =>
                          x.taxon_key === s.taxon_key ? { ...x, dist_m: Number(e.target.value) } : x,
                        ),
                      )
                    }
                    aria-label={`Distance maximale pour ${s.label}`}
                  />
                </div>
              ) : (
                <p className="fauna-species-picker__hint">Distance à l’observation la plus proche.</p>
              )}
            </div>
            {showDistance && index < selected.length - 1 && onJoinsChange && (
              <EntreEspeces
                value={joins[index] ?? "or"}
                disabled={disabled}
                onChange={(op) => {
                  const next = joins.slice(0, selected.length - 1);
                  while (next.length < selected.length - 1) next.push("or");
                  next[index] = op;
                  onJoinsChange(next);
                }}
              />
            )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
