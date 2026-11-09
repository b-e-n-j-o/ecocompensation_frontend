import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchFaunaTaxa } from "../../api";
import { getApiBaseUrl } from "../../config/apiBase";
import { EntreEspeces } from "../../pages/FiltreEcologique/EntreEspeces";
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
  reloadToken?: number;
  aliases?: Record<string, string[]>;
  onAliasesChange?: (species: string, names: string[]) => void;
  zoneGeometry?: GeoJSON.Geometry | null;
  bufferM?: number;
  joins?: ("and" | "or")[];
  onJoinsChange?: (next: ("and" | "or")[]) => void;
}

export function FaunaSpeciesPicker({
  selectedSpecies,
  onChange,
  disabled = false,
  compact = false,
  distances,
  onDistanceChange,
  reloadToken = 0,
  aliases = {},
  onAliasesChange,
  zoneGeometry = null,
  bufferM = 0,
  joins = [],
  onJoinsChange,
}: FaunaSpeciesPickerProps) {
  const [closeNames, setCloseNames] = useState<Record<string, { nom: string; nb: number }[]>>({});
  const [zoneCounts, setZoneCounts] = useState<Record<string, number | null>>({});
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
  }, [reloadToken]);

  useEffect(() => {
    const missing = selectedSpecies.filter((name) => !(name in closeNames));
    if (!missing.length) return;
    let cancelled = false;
    missing.forEach((name) => {
      fetch(`${getApiBaseUrl()}/api/reserve-fonciere/faune/noms-proches?q=${encodeURIComponent(name)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: { nom: string; nb: number }[]) => {
          if (cancelled) return;
          setCloseNames((prev) => ({ ...prev, [name]: Array.isArray(rows) ? rows : [] }));
        })
        .catch(() => {
          if (!cancelled) setCloseNames((prev) => ({ ...prev, [name]: [] }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSpecies, closeNames]);

  useEffect(() => {
    if (!zoneGeometry || !selectedSpecies.length) {
      setZoneCounts({});
      return;
    }
    const ctrl = new AbortController();
    selectedSpecies.forEach((name) => {
      fetch(`${getApiBaseUrl()}/api/fauna/zone-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ species: name, buffer_m: bufferM, geometry: zoneGeometry }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { count?: number } | null) => {
          if (!data || typeof data.count !== "number") return;
          setZoneCounts((prev) => ({ ...prev, [name]: data.count as number }));
        })
        .catch(() => undefined);
    });
    return () => ctrl.abort();
  }, [selectedSpecies, zoneGeometry, bufferM]);

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
            placeholder={loading ? "Chargement…" : "Rechercher dans fauna…"}
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
          {selectedSpecies.map((s, index) => {
            const dist = distances?.[s] ?? DEFAULT_DIST_M;
            const lien = index < selectedSpecies.length - 1 && onJoinsChange ? (
              <EntreEspeces
                value={joins[index] ?? "or"}
                disabled={disabled}
                onChange={(op) => {
                  const next = joins.slice(0, selectedSpecies.length - 1);
                  while (next.length < selectedSpecies.length - 1) next.push("or");
                  next[index] = op;
                  onJoinsChange(next);
                }}
              />
            ) : null;
            if (!onDistanceChange) {
              return (
                <Fragment key={s}>
                <span className="fauna-species-picker__chip">
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
                {lien}
                </Fragment>
              );
            }
            return (
              <Fragment key={s}>
              <div className="fauna-species-picker__row">
                <div className="fauna-species-picker__row-head">
                  <span className="fauna-species-picker__chip-label">
                    {s}
                    {zoneGeometry && (
                      <em className="fauna-species-picker__zone">
                        {zoneCounts[s] == null ? "…" : `${zoneCounts[s]} dans Fauna`}
                      </em>
                    )}
                  </span>
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
                    min={0}
                    max={5000}
                    step={100}
                    value={dist}
                    disabled={disabled}
                    onChange={(e) => onDistanceChange(s, Number(e.target.value))}
                    aria-label={`Distance maximale pour ${s}`}
                  />
                </div>
                <OwnDataMatch
                  species={s}
                  ready={s in closeNames}
                  hits={closeNames[s] ?? []}
                  selected={aliases[s] ?? []}
                  disabled={disabled}
                  onToggle={(nom, on) => {
                    const current = aliases[s] ?? [];
                    const next = on ? [...current, nom] : current.filter((n) => n !== nom);
                    onAliasesChange?.(s, next);
                  }}
                />
              </div>
              {lien}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OwnDataMatch({
  species,
  ready,
  hits,
  selected,
  disabled,
  onToggle,
}: {
  species: string;
  ready: boolean;
  hits: { nom: string; nb: number }[];
  selected: string[];
  disabled?: boolean;
  onToggle: (nom: string, on: boolean) => void;
}) {
  const [refus, setRefus] = useState<string[]>([]);
  const same = hits.filter((hit) => hit.nom.toLowerCase() === species.toLowerCase());
  const others = hits.filter((hit) => hit.nom.toLowerCase() !== species.toLowerCase());
  const propos = [...same, ...others];
  return (
    <div className="fauna-own-data">
      <p className="fauna-own-data__title">Dans vos données</p>
      {!ready && <p className="fauna-species-picker__hint">Recherche en cours…</p>}
      {ready && propos.length === 0 && (
        <p className="fauna-species-picker__hint">Aucun nom correspondant. Le filtre utilisera seulement Fauna.</p>
      )}
      {ready && propos.length > 0 && (
        <>
        <p className="fauna-species-picker__hint">Neutre : le nom n&apos;entre pas dans le filtre. Cochez-le pour l&apos;utiliser.</p>
        <div className="fauna-own-data__choices">
          {propos.map((hit) => {
            const on = selected.includes(hit.nom);
            const off = !on && refus.includes(hit.nom);
            return (
              <div key={hit.nom} className={`fauna-own-data__row${on ? " is-on" : off ? " is-off" : ""}`}>
                <strong>{hit.nom}</strong>
                <em>{hit.nb} obs.</em>
                <span className="fauna-own-data__actions">
                  <button
                    type="button"
                    className={`fauna-own-data__yes${on ? " is-on" : ""}`}
                    aria-label={`Inclure ${hit.nom}`}
                    disabled={disabled}
                    onClick={() => {
                      if (on) {
                        onToggle(hit.nom, false);
                        return;
                      }
                      setRefus((prev) => prev.filter((n) => n !== hit.nom));
                      onToggle(hit.nom, true);
                    }}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={`fauna-own-data__no${off ? " is-on" : ""}`}
                    aria-label={`Ne pas inclure ${hit.nom}`}
                    disabled={disabled}
                    onClick={() => {
                      if (off) {
                        setRefus((prev) => prev.filter((n) => n !== hit.nom));
                        return;
                      }
                      setRefus((prev) => [...prev, hit.nom]);
                      onToggle(hit.nom, false);
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
