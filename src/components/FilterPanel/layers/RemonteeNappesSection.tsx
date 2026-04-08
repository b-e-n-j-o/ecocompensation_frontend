/**
 * Remontées de nappes — filtre sur `classefiab` (intersection avec la couche résultats projet).
 */
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { fetchRemonteeNappesClassefiab } from "../../../api";
import { SectionCard, filterTheme, Hint } from "../shared";

interface RemonteeNappesSectionProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function RemonteeNappesSection({ value, onChange }: RemonteeNappesSectionProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRemonteeNappesClassefiab()
      .then((vals) => {
        if (!cancelled) setOptions(vals);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Chargement impossible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function add(v: string) {
    if (!value.includes(v)) onChange([...value, v]);
  }
  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
  }
  const remaining = options.filter((o) => !value.includes(o));

  const chipBtn: CSSProperties = {
    padding: "4px 10px",
    background: "rgba(59, 130, 246, 0.15)",
    border: "1px solid #3b82f6",
    borderRadius: 4,
    fontSize: 11,
    color: "#93c5fd",
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  };

  return (
    <SectionCard title="Remontée de nappes (CLASSEFIAB)" icon="⬆" accent="blue" collapsible>
      <Hint>
        Parcelles intersectant au moins une remontée dont l&apos;attribut classefiab est parmi les valeurs
        choisies. Sans sélection, ce critère est neutre.
      </Hint>
      {loading && (
        <p style={{ margin: 0, fontSize: 11, color: filterTheme.muted }}>Chargement des valeurs…</p>
      )}
      {error && <p style={{ margin: 0, fontSize: 11, color: filterTheme.danger }}>{error}</p>}
      {!loading && !error && options.length === 0 && (
        <p style={{ margin: 0, fontSize: 11, color: filterTheme.muted }}>
          Aucune valeur en base (table ecocompensation.remontee_de_nappes vide ou absente).
        </p>
      )}
      {!loading && options.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11, color: filterTheme.muted }}>Ajouter une valeur classefiab</span>
          <select
            style={{
              flex: 1,
              maxWidth: 280,
              padding: "6px 10px",
              background: filterTheme.bgInput,
              border: `1px solid ${filterTheme.border}`,
              borderRadius: 999,
              color: filterTheme.text,
              fontSize: 12,
            }}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) add(v);
              e.target.value = "";
            }}
          >
            <option value="">Choisir une valeur…</option>
            {remaining.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {value.map((lib) => (
          <button key={lib} type="button" style={chipBtn} onClick={() => remove(lib)} title="Retirer du filtre">
            <span>✕</span>
            <span>{lib}</span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
