import { IndesirablesTable } from "../../components/ResultPanel/IndesirablesTable";
import { RankingTable } from "../../components/ResultPanel/RankingTable";
import { UnitesFoncieresTable } from "../../components/ResultPanel/UnitesFoncieresTable";
import type { FilterResponse, ParcelleResult, ParcelPoolMetricRow, RankingSortKey, UfFilterResponse } from "../../types";

type RankingShared = {
  projectId: string | null;
  poolRunId: string | null;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  rankingSortKey: RankingSortKey;
  onRankingSortChange: (k: RankingSortKey) => void;
  scrollToIdu: string | null;
  scrollTableNonce: number;
  selectedIdu: string | null;
  onRowActivate: (idu: string) => void;
  onHover: (idu: string | null) => void;
  showZoneHumideColumn: boolean;
  showDistHydroColumn: boolean;
  showSurfaceHydroColumn: boolean;
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
  onAddParcelles: (idus: string[]) => void | Promise<void>;
  addParcellesLoading: boolean;
  indesirableParcelles: FilterResponse["parcelles"];
  indesirableMetricsByIdu: Record<string, ParcelPoolMetricRow[]>;
  onRestoreIndesirable: (idu: string) => void;
};

type CombinedTableProps = Omit<RankingShared, "projectId"> & {
  parcelles: ParcelleResult[];
};

type UnitesTableProps = {
  ufResults: UfFilterResponse;
  projectId: string | null;
  selectedSubsetId: string | null;
  scrollToSubsetId: string | null;
  scrollTableNonce: number;
  onSubsetActivate: (subsetId: string) => void;
  onUfActivate: (ufId: string) => void;
  onSubsetHover: (subsetId: string | null) => void;
  onUfHover: (ufId: string | null) => void;
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
  onRankingSortChange,
  scrollToIdu,
  scrollTableNonce,
  selectedIdu,
  onRowActivate,
  onHover,
  onMarkIndesirable,
  onBatchMarkIndesirable,
  onRunDureteFonciere,
  dureteFonciereLoading,
  onAddParcelles,
  addParcellesLoading,
  showZoneHumideColumn,
  showDistHydroColumn,
  showSurfaceHydroColumn,
  indesirableParcelles,
  indesirableMetricsByIdu,
  onRestoreIndesirable,
}: ParcellesTableProps) {
  const metricsLoading = !!poolRunId && poolMetricsByIdu === null;
  return (
    <div className="results-split__table">
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
            onRankingSortChange={onRankingSortChange}
            scrollToIdu={scrollToIdu}
            scrollTableNonce={scrollTableNonce}
            selectedIdu={selectedIdu}
            onRowActivate={onRowActivate}
            onHover={onHover}
            onMarkIndesirable={onMarkIndesirable}
            onBatchMarkIndesirable={onBatchMarkIndesirable}
            onRunDureteFonciere={onRunDureteFonciere}
            dureteFonciereLoading={dureteFonciereLoading}
            onAddParcelles={onAddParcelles}
            addParcellesLoading={addParcellesLoading}
            showZoneHumideColumn={showZoneHumideColumn}
            showDistHydroColumn={showDistHydroColumn}
            showSurfaceHydroColumn={showSurfaceHydroColumn}
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
          <IndesirablesTable
            projectId={projectId}
            parcelles={indesirableParcelles}
            poolRunId={poolRunId}
            poolMetricsByIdu={indesirableMetricsByIdu}
            poolMetricsLoading={metricsLoading}
            onRestore={onRestoreIndesirable}
            onRowActivate={onRowActivate}
            onHover={onHover}
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
  onRankingSortChange,
  scrollToIdu,
  scrollTableNonce,
  selectedIdu,
  onRowActivate,
  onHover,
  showZoneHumideColumn,
  showDistHydroColumn,
  showSurfaceHydroColumn,
}: CombinedTableProps) {
  return (
    <div className="results-split__table">
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
            onRankingSortChange={onRankingSortChange}
            scrollToIdu={scrollToIdu}
            scrollTableNonce={scrollTableNonce}
            selectedIdu={selectedIdu}
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
  selectedSubsetId,
  scrollToSubsetId,
  scrollTableNonce,
  onSubsetActivate,
  onUfActivate,
  onSubsetHover,
  onUfHover,
}: UnitesTableProps) {
  return (
    <div className="results-split__table">
      <div className="results-split__table-inner">
        <UnitesFoncieresTable
          ufResults={ufResults}
          projectId={projectId}
          selectedSubsetId={selectedSubsetId}
          scrollToSubsetId={scrollToSubsetId}
          scrollTableNonce={scrollTableNonce}
          onSubsetActivate={onSubsetActivate}
          onUfActivate={onUfActivate}
          onSubsetHover={onSubsetHover}
          onUfHover={onUfHover}
        />
      </div>
    </div>
  );
}
