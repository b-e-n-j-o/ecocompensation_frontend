// ─── FilterParamsTab ─────────────────────────────────────────────────────────
// Onglet « Paramètres de filtrage » : compte rendu des critères du pool.
import { useState } from "react";
import { exportFicheFiltragePdf } from "../../../api";
import { parseStoredLastFilter, serializeFilterPreset } from "../../../utils/storedFilterResults";
import type { FilterConfig } from "./FilterCatalog";
import { FilterReport, type FunnelStepEnriched, type NormalizedCriterion } from "./FilterReport";
import "./FilterReport.css";

interface FilterParamsTabProps {
  projectId?: string | null;
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
  projectId = null,
  steps,
  filterConfig = null,
  total,
  aoiTotal = null,
  finalRadiusKm = 0,
  entityLabel = "parcelles",
  computedAt = null,
  onShowExcluded,
}: FilterParamsTabProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function exportFiche() {
    if (!projectId) return;
    setBusy(true);
    try {
      await exportFicheFiltragePdf(projectId);
    } catch (err) {
      console.error("Fiche filtrage:", err);
      alert(err instanceof Error ? err.message : "Erreur lors de l'export de la fiche.");
    } finally {
      setBusy(false);
    }
  }

  async function copyParams() {
    const options = parseStoredLastFilter(
      filterConfig && typeof filterConfig === "object"
        ? { pipeline: "filter_v2", ...filterConfig }
        : filterConfig,
    );
    if (!options) {
      alert("Aucun paramètre de filtrage enregistré à copier.");
      return;
    }
    const text = serializeFilterPreset(options);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copiez ce JSON de paramètres :", text);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fparams-tab">
      <div className="fparams-head">
        <h3 className="fparams-title">Compte rendu du filtrage</h3>
        <div className="fparams-actions">
          <button
            type="button"
            className="fparams-copy"
            disabled={!filterConfig}
            onClick={() => void copyParams()}
            title="Copie un JSON collable dans le panneau de filtrage"
          >
            {copied ? "Copié" : "Copier paramètres"}
          </button>
          {projectId && (
            <button
              type="button"
              className="fparams-export"
              disabled={busy}
              onClick={() => void exportFiche()}
              title="PDF A4 des critères réellement exécutés"
            >
              {busy ? "Export…" : "Exporter la fiche"}
            </button>
          )}
        </div>
      </div>
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
