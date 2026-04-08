/**
 * Zones humides — critère binaire sur l’intersection avec la couche résultats.
 */
import type { ZoneHumideMode } from "../../../types";
import { SectionCard, RadioRow, Hint } from "../shared";

interface ZoneHumideSectionProps {
  value: ZoneHumideMode;
  onChange: (v: ZoneHumideMode) => void;
}

const OPTIONS: { value: ZoneHumideMode; label: string }[] = [
  { value: "ignore", label: "Ignorer" },
  { value: "intersect", label: "Intersecte la couche" },
  { value: "exclude", label: "N’intersecte pas" },
];

export function ZoneHumideSection({ value, onChange }: ZoneHumideSectionProps) {
  return (
    <SectionCard title="Zones humides (établies)" icon="💧" accent="blue" collapsible>
      <Hint>
        Filtre sur l’intersection avec <code style={{ color: "#a5b4fc" }}>ecocompensation_results.zone_humide</code>.
      </Hint>
      <RadioRow name="zone-humide-mode" value={value} options={OPTIONS} onChange={onChange} />
    </SectionCard>
  );
}
