// ─── FilterParamsTab ─────────────────────────────────────────────────────────
// Onglet « Paramètres de filtrage » : compte rendu des critères du pool.
import type { FilterConfig } from "./FilterCatalog";
import { FilterReport, type FunnelStepEnriched, type NormalizedCriterion } from "./FilterReport";
import "./FilterReport.css";

interface FilterParamsTabProps {
  steps: FunnelStepEnriched[];
  filterConfig?: FilterConfig | null;
  total: number;
  aoiTotal?: number | null;
  finalRadiusKm?: number;
  entityLabel?: string;
  computedAt?: string | Date | null;
  onShowExcluded?: (c: NormalizedCriterion) => void;
}

export function FilterParamsTab({
  steps,
  filterConfig = null,
  total,
  aoiTotal = null,
  finalRadiusKm = 0,
  entityLabel = "parcelles",
  computedAt = null,
  onShowExcluded,
}: FilterParamsTabProps) {
  return (
    <div className="fparams-tab">
      <h3 className="fparams-title">Compte rendu du filtrage</h3>
      <FilterReport
        steps={steps}
        filterConfig={filterConfig}
        total={total}
        aoiTotal={aoiTotal}
        finalRadiusKm={finalRadiusKm}
        entityLabel={entityLabel}
        computedAt={computedAt}
        onShowExcluded={onShowExcluded}
      />
    </div>
  );
}
