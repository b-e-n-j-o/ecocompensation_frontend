/**
 * Miller, surface min, limite de résultats après classement.
 */
import type { FilterOptions } from "../../../types";
import { SectionCard, SliderField, NumericField, Hint } from "../shared";

interface GeometrySectionProps {
  miller: number;
  minAreaHa: number;
  maxResults: number;
  onChange: (patch: Partial<FilterOptions>) => void;
}

export function GeometrySection({ miller, minAreaHa, maxResults, onChange }: GeometrySectionProps) {
  return (
    <SectionCard title="Géométrie & classement" icon="⬡" accent="purple" collapsible defaultOpen>
      <SliderField
        label="Miller minimum"
        value={miller}
        min={0.4}
        max={0.9}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange({ miller_threshold: v })}
      />
      <NumericField
        label="Surface minimale"
        value={minAreaHa}
        min={1}
        max={100}
        step={1}
        unit=" ha"
        onChange={(v) => onChange({ min_area_ha: v })}
      />
      <NumericField
        label="Max. résultats"
        value={maxResults}
        min={0}
        max={20000}
        step={10}
        onChange={(v) => onChange({ target_count: Math.round(v) })}
      />
      <Hint>
        Limite les meilleures parcelles / UF après classement. <strong style={{ color: "#d1d5db" }}>0</strong> = pas de
        limite.
      </Hint>
    </SectionCard>
  );
}
