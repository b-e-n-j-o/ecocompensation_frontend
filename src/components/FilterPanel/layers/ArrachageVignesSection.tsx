/**
 * Arrachage de vignes — critère binaire sur l’intersection avec la couche résultats.
 */
import type { ArrachageVignesMode } from "../../../types";
import { SectionCard, RadioRow, Hint } from "../shared";

interface ArrachageVignesSectionProps {
  value: ArrachageVignesMode;
  onChange: (v: ArrachageVignesMode) => void;
}

const OPTIONS: { value: ArrachageVignesMode; label: string }[] = [
  { value: "ignore", label: "Ignorer" },
  { value: "intersect", label: "Intersecte la couche" },
  { value: "exclude", label: "N’intersecte pas" },
];

export function ArrachageVignesSection({ value, onChange }: ArrachageVignesSectionProps) {
  return (
    <SectionCard title="Arrachage de vignes" icon="🍇" accent="purple" collapsible>
      <Hint>
        Filtre sur les parcelles qui croisent (ou non) les polygones d’arrachage chargés pour le projet dans{" "}
        <code style={{ color: "#a5b4fc" }}>ecocompensation_results.arrachage_vignes</code>.
      </Hint>
      <RadioRow name="arrachage-vignes-mode" value={value} options={OPTIONS} onChange={onChange} />
    </SectionCard>
  );
}
