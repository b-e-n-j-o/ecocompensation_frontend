/**
 * Filtre sur les zones de végétation (résultats ZDV intersectant la parcelle).
 */
import { ZDV_NATURES } from "../../../types";
import type { ZdvNature } from "../../../types";
import { SectionCard, filterTheme, Hint } from "../shared";

interface ZoneVegetationSectionProps {
  value: ZdvNature[];
  onChange: (v: ZdvNature[]) => void;
}

export function ZoneVegetationSection({ value, onChange }: ZoneVegetationSectionProps) {
  function toggleNature(n: ZdvNature) {
    if (value.includes(n)) onChange(value.filter((x) => x !== n));
    else onChange([...value, n]);
  }

  const noFilter = value.length === 0;

  return (
    <SectionCard title="Zone de végétation" icon="🌲" accent="green" collapsible>
      <Hint>La parcelle doit intersecter une ZDV d’au moins une des natures cochées. Liste vide = critère ignoré.</Hint>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {ZDV_NATURES.map((n) => (
          <label
            key={n}
            style={{
              padding: "8px 10px",
              background: filterTheme.bgInput,
              border: `1px solid ${value.includes(n) ? filterTheme.accentGreen : filterTheme.border}`,
              borderRadius: 4,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              color: value.includes(n) ? filterTheme.accentGreen : filterTheme.text,
            }}
          >
            <input
              type="checkbox"
              checked={value.includes(n)}
              onChange={() => toggleNature(n)}
              style={{ width: 14, height: 14, accentColor: filterTheme.accentGreen }}
            />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <label
        style={{
          paddingTop: 12,
          borderTop: `1px solid ${filterTheme.border}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: filterTheme.muted,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={noFilter}
          onChange={() => onChange(noFilter ? ["Forêt ouverte"] : [])}
        />
        <span>Ignorer ce filtre</span>
      </label>
    </SectionCard>
  );
}
