// ─── FilterParamsTab ─────────────────────────────────────────────────────────
// Onglet « Paramètres de filtrage » de la page étude :
// compte rendu critère par critère (gauche) + entonnoir existant (droite).
import { FilterReport, type FunnelStepEnriched, type NormalizedCriterion } from "./FilterReport";
import { FunnelDisplay } from "./FunnelDisplay";

interface FilterParamsTabProps {
  steps: FunnelStepEnriched[];
  total: number;
  aoiTotal?: number | null;
  finalRadiusKm?: number;
  entityLabel?: string;
  computedAt?: string | Date | null;
  onShowExcluded?: (c: NormalizedCriterion) => void;
}

export function FilterParamsTab({
  steps,
  total,
  aoiTotal = null,
  finalRadiusKm = 0,
  entityLabel = "parcelles",
  computedAt = null,
  onShowExcluded,
}: FilterParamsTabProps) {
  return (
    <div className="fparams-tab">
      <div className="fparams-main">
        <h3 className="fparams-title">Compte rendu du filtrage</h3>
        <FilterReport
          steps={steps}
          total={total}
          aoiTotal={aoiTotal}
          finalRadiusKm={finalRadiusKm}
          entityLabel={entityLabel}
          computedAt={computedAt}
          onShowExcluded={onShowExcluded}
        />
      </div>
      <aside className="fparams-side">
        <FunnelDisplay
          steps={steps}
          total={total}
          finalRadiusKm={finalRadiusKm}
          entityLabel={entityLabel}
          title="Entonnoir"
          compact
        />
      </aside>
    </div>
  );
}