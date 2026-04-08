/**
 * Faune — logique distincte : une espèce = un bloc avec mode intersect / rayon, sources d'observation (PCT/LIN/SURF).
 * Les taxons proposés viennent des données déjà chargées pour le projet (`/api/projects/{id}/fauna/taxa`).
 */
import { useEffect, useMemo, useState } from "react";
import { fetchProjectFaunaTaxa } from "../../../api";
import type { FauneCriterion, FauneMode, FauneObservationSource } from "../../../types";
import { SectionCard, SliderField, RadioRow, filterTheme, Hint } from "../shared";

interface FauneSectionProps {
  projectId: string | null;
  value: FauneCriterion[];
  onChange: (v: FauneCriterion[]) => void;
}

const FAUNE_OPTIONS: { value: FauneMode; label: string }[] = [
  { value: "intersect", label: "Intersecte" },
  { value: "within_radius", label: "Dans un rayon" },
];

const OBS_SOURCES: { key: FauneObservationSource; label: string }[] = [
  { key: "pct", label: "Ponctuel (PCT)" },
  { key: "lin", label: "Linéaire (LIN)" },
  { key: "surf", label: "Surfacique (SURF)" },
];

const DEFAULT_SOURCES: FauneObservationSource[] = ["pct", "lin", "surf"];

function isFauneSource(v: string): v is FauneObservationSource {
  return v === "pct" || v === "lin" || v === "surf";
}

function normalizeSources(sources: FauneCriterion["sources"]): FauneObservationSource[] {
  const next = Array.isArray(sources) ? sources.filter(isFauneSource) : [];
  return next.length > 0 ? next : DEFAULT_SOURCES;
}

export function FauneSection({ projectId, value, onChange }: FauneSectionProps) {
  const [taxa, setTaxa] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaxon, setSelectedTaxon] = useState("");

  useEffect(() => {
    if (!projectId) {
      setTaxa([]);
      setLoading(false);
      setError(null);
      setSelectedTaxon("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchProjectFaunaTaxa(projectId)
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
  }, [projectId]);

  const availableTaxa = useMemo(
    () => taxa.filter((t) => !value.some((c) => c.tax_nom_val === t)),
    [taxa, value],
  );

  function addCriterion() {
    if (!selectedTaxon) return;
    onChange([
      ...value,
      {
        tax_nom_val: selectedTaxon,
        mode: "intersect",
        radius_m: 500,
        sources: ["pct", "lin", "surf"],
      },
    ]);
    setSelectedTaxon("");
  }

  function removeCriterion(taxon: string) {
    onChange(value.filter((c) => c.tax_nom_val !== taxon));
  }

  function patchCriterion(taxon: string, patch: Partial<FauneCriterion>) {
    onChange(value.map((c) => (c.tax_nom_val === taxon ? { ...c, ...patch } : c)));
  }

  function toggleSource(taxon: string, source: FauneObservationSource, checked: boolean) {
    const crit = value.find((c) => c.tax_nom_val === taxon);
    if (!crit) return;
    const prev = normalizeSources(crit.sources);
    if (!checked && prev.length === 1 && prev[0] === source) return;
    const next: FauneObservationSource[] = checked
      ? Array.from(new Set<FauneObservationSource>([...prev, source]))
      : prev.filter((s) => s !== source);
    patchCriterion(taxon, { sources: next });
  }

  return (
    <SectionCard title="Faune" icon="🦉" accent="orange" collapsible>
      <Hint>
        Contrairement aux autres couches, chaque espèce ajoutée crée un critère indépendant (intersection ou tampon, types
        d&apos;observations).
      </Hint>

      <div style={{ display: "flex", gap: 8 }}>
        <select
          style={{
            flex: 1,
            padding: "7px 10px",
            background: filterTheme.bgInput,
            border: `1px solid ${filterTheme.border}`,
            borderRadius: 4,
            color: filterTheme.text,
            fontSize: 12,
          }}
          value={selectedTaxon}
          onChange={(e) => setSelectedTaxon(e.target.value)}
          disabled={!projectId || loading || availableTaxa.length === 0}
        >
          <option value="">
            {!projectId ? "Sélectionnez d'abord un projet" : "Choisir une espèce (TaxNomVal)…"}
          </option>
          {availableTaxa.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addCriterion}
          disabled={!projectId || !selectedTaxon}
          style={{
            padding: "7px 10px",
            background: "#262b36",
            border: `1px solid ${filterTheme.accentBlue}`,
            borderRadius: 4,
            color: "#93c5fd",
            fontSize: 11,
            cursor: !projectId || !selectedTaxon ? "not-allowed" : "pointer",
            opacity: !projectId || !selectedTaxon ? 0.5 : 1,
          }}
        >
          Ajouter
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: filterTheme.danger }}>{error}</div>
      )}

      {value.length === 0 && !loading && (
        <p style={{ margin: 0, fontSize: 11, color: filterTheme.muted }}>Aucune espèce sélectionnée : ce filtre est ignoré.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {value.map((c) => (
          <div
            key={c.tax_nom_val}
            style={{
              background: filterTheme.bgInput,
              border: `1px solid ${filterTheme.border}`,
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: filterTheme.text, fontWeight: 500 }}>{c.tax_nom_val}</span>
              <button
                type="button"
                onClick={() => removeCriterion(c.tax_nom_val)}
                title="Retirer l'espèce"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: "1px solid #7f1d1d",
                  color: filterTheme.danger,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <RadioRow
              name={`faune-mode-${c.tax_nom_val}`}
              value={c.mode}
              options={FAUNE_OPTIONS}
              onChange={(mode) => patchCriterion(c.tax_nom_val, { mode })}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: filterTheme.muted }}>Types d&apos;observations</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                {OBS_SOURCES.map((src) => {
                  const activeSources = normalizeSources(c.sources);
                  const selected = activeSources.includes(src.key);
                  return (
                    <label
                      key={src.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        border: `1px solid ${selected ? filterTheme.accentBlue : filterTheme.border}`,
                        borderRadius: 4,
                        fontSize: 11,
                        color: selected ? "#bfdbfe" : "#d1d5db",
                        background: selected ? "rgba(59, 130, 246, 0.12)" : "#161a21",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleSource(c.tax_nom_val, src.key, e.target.checked)}
                      />
                      <span>{src.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {c.mode === "within_radius" && (
              <SliderField
                label="Rayon"
                value={c.radius_m}
                min={0}
                max={2000}
                step={50}
                onChange={(v) => patchCriterion(c.tax_nom_val, { radius_m: v })}
                unit=" m"
              />
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
