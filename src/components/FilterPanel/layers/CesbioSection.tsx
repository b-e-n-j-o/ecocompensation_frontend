/**
 * Couverture sol CESBIO (OCS-GE) — au moins une classe en intersection.
 */
import type { CSSProperties } from "react";
import { CESBIO_LIBELLES } from "../../../types";
import type { CesbioLibelle } from "../../../types";
import { SectionCard, filterTheme, Hint } from "../shared";

interface CesbioSectionProps {
  value: CesbioLibelle[];
  onChange: (v: CesbioLibelle[]) => void;
}

export function CesbioSection({ value, onChange }: CesbioSectionProps) {
  function add(lib: CesbioLibelle) {
    if (!value.includes(lib)) onChange([...value, lib]);
  }
  function remove(lib: CesbioLibelle) {
    onChange(value.filter((x) => x !== lib));
  }
  const remaining = CESBIO_LIBELLES.filter((l) => !value.includes(l));

  const chipBtn: CSSProperties = {
    padding: "4px 10px",
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #ef4444",
    borderRadius: 4,
    fontSize: 11,
    color: "#ef4444",
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  };

  return (
    <SectionCard title="Couverture sol CESBIO" icon="▦" accent="orange" collapsible>
      <Hint>Intersection avec au moins une classe (même partielle). Sans sélection, ce critère est neutre.</Hint>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: filterTheme.muted }}>Ajouter une classe</span>
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
            const lib = e.target.value as CesbioLibelle;
            if (lib) add(lib);
            e.target.value = "";
          }}
        >
          <option value="">Choisir une classe…</option>
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
