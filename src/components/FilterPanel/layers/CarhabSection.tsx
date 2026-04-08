/**
 * Habitats Carhab — au moins un libellé EUNIS (`nom_eunis`) en intersection avec la couche résultats.
 */
import type { CSSProperties } from "react";
import { CARHAB_NOM_EUNIS, type CarhabNomEunis } from "../../../types";
import { SectionCard, filterTheme, Hint } from "../shared";

interface CarhabSectionProps {
  value: CarhabNomEunis[];
  onChange: (v: CarhabNomEunis[]) => void;
}

export function CarhabSection({ value, onChange }: CarhabSectionProps) {
  function add(lib: CarhabNomEunis) {
    if (!value.includes(lib)) onChange([...value, lib]);
  }
  function remove(lib: CarhabNomEunis) {
    onChange(value.filter((x) => x !== lib));
  }
  const remaining = CARHAB_NOM_EUNIS.filter((l) => !value.includes(l));

  const chipBtn: CSSProperties = {
    padding: "4px 10px",
    background: "rgba(245, 158, 11, 0.15)",
    border: "1px solid rgba(245, 158, 11, 0.55)",
    borderRadius: 4,
    fontSize: 11,
    color: "#fbbf24",
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  };

  return (
    <SectionCard title="Habitats Carhab" icon="🌿" accent="orange" collapsible>
      <Hint>
        Intersection avec au moins un polygone dont le champ{" "}
        <code style={{ color: "#a5b4fc" }}>nom_eunis</code> est dans la liste. Sans sélection, ce critère est neutre.
      </Hint>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: filterTheme.muted }}>Ajouter un habitat (EUNIS)</span>
        <select
          style={{
            flex: 1,
            maxWidth: 240,
            padding: "6px 10px",
            background: filterTheme.bgInput,
            border: `1px solid ${filterTheme.border}`,
            borderRadius: 999,
            color: filterTheme.text,
            fontSize: 12,
          }}
          value=""
          onChange={(e) => {
            const lib = e.target.value as CarhabNomEunis;
            if (lib) add(lib);
            e.target.value = "";
          }}
        >
          <option value="">Choisir un libellé…</option>
          {remaining.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
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
