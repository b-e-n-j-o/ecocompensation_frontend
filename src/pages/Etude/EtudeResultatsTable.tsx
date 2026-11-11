import { AjoutManuelTable } from "./ResultPanel/AjoutManuel/AjoutManuelTable";
import { IndesirablesTable } from "./ResultPanel/Indesirables/IndesirablesTable";
import { RankingTable } from "./ResultPanel/TableauParcelles/RankingTable";
import { UnitesFoncieresTable } from "./ResultPanel/TableauParcelles/UnitesFoncieresTable";
import type { ExportJauge } from "./ResultPanel/ExportEtudeMenu";
import type { FilterResponse, ParcelleResult, ParcelPoolMetricRow, RankingSortKey, UfFilterResponse } from "../../types";

type RankingShared = {
  projectId: string | null;
  poolRunId: string | null;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  rankingSortKey: RankingSortKey;
  rankingSortDir?: "asc" | "desc";
  onRankingSortChange: (k: RankingSortKey) => void;
  scrollToIdu: string | null;
  scrollTableNonce: number;
  detailFocus?: { idu: string; tab: "durete" | "urbanisme"; nonce: number } | null;
  selectedIdu: string | null;
  hoverIdu: string | null;
  onRowActivate: (idu: string) => void;
  onHover: (idu: string | null) => void;
  showZoneHumideColumn: boolean;
  showDistHydroColumn: boolean;
  showSurfaceHydroColumn: boolean;
  showFloraColumn?: boolean;
};

type ParcellesTableProps = RankingShared & {
  hideDistanceFilter: boolean;
  distanceMaxKm: number;
  distanceCursorKm: number;
  onDistanceChange: (km: number) => void;
  surfaceMinHa: number;
  surfaceMaxHa: number;
  onSurfaceMinChange: (ha: number) => void;
  parcelles: ParcelleResult[];
  isPoolMetricsPending: boolean;
  poolMetricsOverlayText: string;
  onMarkIndesirable: (idu: string) => void;
  onBatchMarkIndesirable: (idus: string[]) => Promise<void>;
  onRunDureteFonciere: (idus?: string[]) => void | Promise<void>;
  dureteFonciereLoading: boolean;
  dureteProgress?: { done: number; total: number; remaining: number; phase: string } | null;
  onRunUrbanisme: (idus?: string[]) => void | Promise<void>;
  urbanismeLoading: boolean;
  onAddParcelles: (idus: string[]) => void | Promise<void>;
  addParcellesLoading: boolean;
  indesirableParcelles: FilterResponse["parcelles"];
  indesirableMetricsByIdu: Record<string, ParcelPoolMetricRow[]>;
  onRestoreIndesirable: (idu: string) => void;
  ajoutManuelParcelles: ParcelleResult[];
  onIntegrateAjoutManuel: (idus: string[]) => Promise<void>;
};

type CombinedTableProps = Omit<RankingShared, "projectId"> & {
  parcelles: ParcelleResult[];
};

type UnitesTableProps = {
  ufResults: UfFilterResponse;
  projectId: string | null;
  scrollToUfId?: string | null;
  scrollTableNonce: number;
  hoverParcelleIdu?: string | null;
  onUfActivate: (ufId: string) => void;
  onUfHover: (ufId: string | null) => void;
  onParcelleHover?: (idu: string | null) => void;
  onRemoveUf?: (ufId: string) => Promise<void> | void;
  exportJauge?: ExportJauge | null;
};

export function EtudeResultatsParcellesTable({
  hideDistanceFilter,
  distanceMaxKm,
  distanceCursorKm,
  onDistanceChange,
  surfaceMinHa,
  surfaceMaxHa,
  onSurfaceMinChange,
  parcelles,
  projectId,
  poolRunId,
  poolMetricsByIdu,
  isPoolMetricsPending,
  poolMetricsOverlayText,
  rankingSortKey,
  rankingSortDir = "desc",
  onRankingSortChange,
  scrollToIdu,
  scrollTableNonce,
  detailFocus = null,
  selectedIdu,
  hoverIdu,
  onRowActivate,
  onHover,
  onMarkIndesirable,
  onBatchMarkIndesirable,
  onRunDureteFonciere,
  dureteFonciereLoading,
  dureteProgress = null,
  onRunUrbanisme,
  urbanismeLoading,
  onAddParcelles,
  addParcellesLoading,
  showZoneHumideColumn,
  showDistHydroColumn,
  showSurfaceHydroColumn,
  showFloraColumn = false,
  indesirableParcelles,
  indesirableMetricsByIdu,
  onRestoreIndesirable,
  ajoutManuelParcelles,
  onIntegrateAjoutManuel,
}: ParcellesTableProps) {
  const metricsLoading = !!poolRunId && poolMetricsByIdu === null;
  return (
    <div className="results-split__table-fill">
      <div className="results-split__table-inner">
        <div className={`ranking-table-shell${isPoolMetricsPending ? " ranking-table-shell--loading" : ""}`}>
          <RankingTable
            parcelles={parcelles}
            projectId={projectId}
            exportPoolRunId={poolRunId}
            poolRunId={poolRunId}
            poolMetricsByIdu={poolMetricsByIdu}
            poolMetricsLoading={metricsLoading}
            rankingSortKey={rankingSortKey}
            rankingSortDir={rankingSortDir}
            onRankingSortChange={onRankingSortChange}
            scrollToIdu={scrollToIdu}
            scrollTableNonce={scrollTableNonce}
            detailFocus={detailFocus}
            selectedIdu={selectedIdu}
            hoverIdu={hoverIdu}
            onRowActivate={onRowActivate}
            onHover={onHover}
            onMarkIndesirable={onMarkIndesirable}
            onBatchMarkIndesirable={onBatchMarkIndesirable}
            onRunDureteFonciere={onRunDureteFonciere}
            dureteFonciereLoading={dureteFonciereLoading}
            dureteProgress={dureteProgress}
            onRunUrbanisme={onRunUrbanisme}
            urbanismeLoading={urbanismeLoading}
            onAddParcelles={onAddParcelles}
            addParcellesLoading={addParcellesLoading}
            showZoneHumideColumn={showZoneHumideColumn}
            showDistHydroColumn={showDistHydroColumn}
            showSurfaceHydroColumn={showSurfaceHydroColumn}
            showFloraColumn={showFloraColumn}
            poolFilters={{
              hideDistanceFilter,
              distanceMaxKm,
              distanceCursorKm,
              onDistanceChange,
              surfaceMinHa,
              surfaceMaxHa,
              onSurfaceMinChange,
            }}
          />
          {isPoolMetricsPending && (
            <div className="ranking-table-loading-overlay" aria-live="polite">
              <div className="ranking-table-loading-card">
                <span className="parcelles-map-spinner" />
                <span className="loading-text-breathe">{poolMetricsOverlayText}</span>
              </div>
            </div>
          )}
        </div>
        {poolRunId && (
          <AjoutManuelTable
            parcelles={ajoutManuelParcelles}
            onIntegrate={onIntegrateAjoutManuel}
            onRowActivate={onRowActivate}
            onHover={onHover}
            hoverIdu={hoverIdu}
            selectedIdu={selectedIdu}
          />
        )}
        {poolRunId && (
          <IndesirablesTable
            projectId={projectId}
            parcelles={indesirableParcelles}
            poolRunId={poolRunId}
            poolMetricsByIdu={indesirableMetricsByIdu}
            poolMetricsLoading={metricsLoading}
            onRestore={onRestoreIndesirable}
            onRowActivate={onRowActivate}
            onHover={onHover}
            hoverIdu={hoverIdu}
            scrollToIdu={scrollToIdu}
            scrollTableNonce={scrollTableNonce}
          />
        )}
      </div>
    </div>
  );
}

export function EtudeResultatsCombinedTable({
  parcelles,
  poolRunId,
  poolMetricsByIdu,
  rankingSortKey,
  rankingSortDir = "desc",
  onRankingSortChange,
  scrollToIdu,
  scrollTableNonce,
  selectedIdu,
  hoverIdu,
  onRowActivate,
  onHover,
  showZoneHumideColumn,
  showDistHydroColumn,
  showSurfaceHydroColumn,
}: CombinedTableProps) {
  return (
    <div className="results-split__table-fill">
      <div className="results-split__table-inner">
        <div className="ranking-table-shell">
          <RankingTable
            parcelles={parcelles}
            projectId={null}
            exportPoolRunId={null}
            poolRunId={poolRunId}
            poolMetricsByIdu={poolMetricsByIdu}
            poolMetricsLoading={!!poolRunId && poolMetricsByIdu === null}
            rankingSortKey={rankingSortKey}
            rankingSortDir={rankingSortDir}
            onRankingSortChange={onRankingSortChange}
            scrollToIdu={scrollToIdu}
            scrollTableNonce={scrollTableNonce}
            selectedIdu={selectedIdu}
            hoverIdu={hoverIdu}
            onRowActivate={onRowActivate}
            onHover={onHover}
            onMarkIndesirable={undefined}
            showZoneHumideColumn={showZoneHumideColumn}
            showDistHydroColumn={showDistHydroColumn}
            showSurfaceHydroColumn={showSurfaceHydroColumn}
          />
        </div>
      </div>
    </div>
  );
}

export function EtudeResultatsUnitesTable({
  ufResults,
  projectId,
  scrollToUfId = null,
  scrollTableNonce,
  hoverParcelleIdu = null,
  onUfActivate,
  onUfHover,
  onParcelleHover,
  onRemoveUf,
  exportJauge = null,
}: UnitesTableProps) {
  return (
    <div className="results-split__table-fill">
      <div className="results-split__table-inner">
        <UnitesFoncieresTable
          ufResults={ufResults}
          projectId={projectId}
          scrollToUfId={scrollToUfId}
          scrollTableNonce={scrollTableNonce}
          hoverParcelleIdu={hoverParcelleIdu}
          onUfActivate={onUfActivate}
          onRemoveUf={onRemoveUf}
          onUfHover={onUfHover}
          onParcelleHover={onParcelleHover}
          exportJauge={exportJauge}
        />
      </div>
    </div>
  );
}
