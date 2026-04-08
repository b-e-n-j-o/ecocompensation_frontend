/**
 * Filtre ternaire sur une couche résultats : ignorer / intersecter / exclure si intersection.
 */
import type { LayerIntersectMode } from "../../../types";
import type { SectionAccent } from "../shared";
import { SectionCard, RadioRow, Hint } from "../shared";

const OPTIONS: { value: LayerIntersectMode; label: string }[] = [
  { value: "ignore", label: "Ignorer" },
  { value: "intersect", label: "Intersecte la couche" },
  { value: "exclude", label: "N’intersecte pas" },
];

export interface LayerIntersectSectionProps {
  title: string;
  icon: string;
  /** Nom de la table SQL affichée dans l’aide (ex. ecocompensation_results.ebc). */
  tableSqlName: string;
  /** Attribut `name` des radios (unicité dans le panneau). */
  radioName: string;
  value: LayerIntersectMode;
  onChange: (v: LayerIntersectMode) => void;
  accent?: SectionAccent;
}

export function LayerIntersectSection({
  title,
  icon,
  tableSqlName,
  radioName,
  value,
  onChange,
  accent = "blue",
}: LayerIntersectSectionProps) {
  return (
    <SectionCard title={title} icon={icon} accent={accent} collapsible>
      <Hint>
        Filtre sur l’intersection avec <code style={{ color: "#a5b4fc" }}>{tableSqlName}</code>.
      </Hint>
      <RadioRow name={radioName} value={value} options={OPTIONS} onChange={onChange} />
    </SectionCard>
  );
}
