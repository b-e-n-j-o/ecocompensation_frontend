import type { ReactNode } from "react";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

import { ParcellesMap, type ParcellesGeoJSON } from "../../components/ResultPanel/MapResults/ParcellesMap";
import { SousEnsemblesMap } from "../../components/ResultPanel/MapResults/SousEnsemblesMap";
import type { ResultsThematicPreload } from "../../components/ResultPanel/MapResults/cartoCouchesRegistry";
import type { ParcelPoolMetricRow } from "../../types";

type SharedMapProps = {
  projectId: string | null;
  foncierGeojson: unknown | null;
  thematicPreload: ResultsThematicPreload | null;
  thematicPreloadLoading: boolean;
  mapLayerKeys: string[];
};

type ParcellesMapPanelProps = SharedMapProps & {
  geojson: ParcellesGeoJSON | null;
  parcellesMapGeojson: ParcellesGeoJSON | null;
  poolRunId: string | null;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  indesirableCount: number;
  loadingMessage: string | null;
  focusIdu: string | null;
  hoverIdu?: string | null;
  onParcelleClick: (idu: string) => void;
};

type UnitesMapPanelProps = SharedMapProps & {
  ufGeojson: FeatureCollection<Geometry, GeoJsonProperties> | null;
  subsetScores: Record<string, number> | null;
  focusSubsetId: string | null;
  focusUfId: string | null;
  hoverSubsetId?: string | null;
  hoverUfId?: string | null;
  onSubsetClick: (subsetId: string) => void;
};

function MapEmpty({ children }: { children: string }) {
  return <div className="results-split__map-empty">{children}</div>;
}

export function SplitMapFrame({ children }: { children: ReactNode }) {
  return (
    <div className="results-split__map">
      <div className="results-split__map-inner">{children}</div>
    </div>
  );
}

export function EtudeResultatsParcellesMap({
  geojson,
  parcellesMapGeojson,
  foncierGeojson,
  projectId,
  poolRunId,
  thematicPreload,
  thematicPreloadLoading,
  mapLayerKeys,
  poolMetricsByIdu,
  indesirableCount,
  loadingMessage,
  focusIdu,
  hoverIdu,
  onParcelleClick,
}: ParcellesMapPanelProps) {
  if (!geojson) {
    return <MapEmpty>GeoJSON parcelles indisponible.</MapEmpty>;
  }
  return (
    <ParcellesMap
      geojson={parcellesMapGeojson ?? geojson}
      foncierGeojson={foncierGeojson}
      projectId={projectId}
      poolRunId={poolRunId}
      preloadedThematic={thematicPreload}
      thematicPreloadLoading={thematicPreloadLoading}
      thematicLayerKeys={mapLayerKeys}
      poolMetricsByIdu={poolMetricsByIdu}
      indesirableCount={indesirableCount}
      loadingMessage={loadingMessage}
      focusIdu={focusIdu}
      hoverIdu={hoverIdu}
      onParcelleClick={onParcelleClick}
    />
  );
}

export function EtudeResultatsUnitesMap({
  ufGeojson,
  subsetScores,
  foncierGeojson,
  projectId,
  thematicPreload,
  thematicPreloadLoading,
  mapLayerKeys,
  focusSubsetId,
  focusUfId,
  hoverSubsetId,
  hoverUfId,
  onSubsetClick,
}: UnitesMapPanelProps) {
  if (!ufGeojson) {
    return <MapEmpty>GeoJSON des sous-ensembles indisponible.</MapEmpty>;
  }
  return (
    <SousEnsemblesMap
      geojson={ufGeojson as FeatureCollection<Geometry, Record<string, unknown>>}
      subsetScores={subsetScores}
      foncierGeojson={foncierGeojson}
      projectId={projectId}
      preloadedThematic={thematicPreload}
      thematicPreloadLoading={thematicPreloadLoading}
      thematicLayerKeys={mapLayerKeys}
      focusSubsetId={focusSubsetId}
      focusUfId={focusUfId}
      hoverSubsetId={hoverSubsetId}
      hoverUfId={hoverUfId}
      onSubsetClick={onSubsetClick}
    />
  );
}
