import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

import { ParcellesMap, type ParcellesGeoJSON } from "./ResultPanel/MapResults/ParcellesMap";
import { UnitesFoncieresMap } from "./ResultPanel/MapResults/UnitesFoncieres/UnitesFoncieresMap";
import type { ResultsLayerDef, ResultsThematicPreload } from "./ResultPanel/MapResults/cartoCouchesRegistry";
import type { ParcelPoolMetricRow, UfFilterResponse } from "../../types";

type SharedMapProps = {
  projectId: string | null;
  foncierGeojson: unknown | null;
  thematicPreload: ResultsThematicPreload | null;
  thematicPreloadLoading: boolean;
  mapLayerDefs: ResultsLayerDef[];
};

type ParcellesMapPanelProps = SharedMapProps & {
  geojson: ParcellesGeoJSON | null;
  parcellesMapGeojson: ParcellesGeoJSON | null;
  poolRunId: string | null;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  indesirableCount: number;
  loadingMessage: string | null;
  focusIdu: string | null;
  focusZoomNonce?: number;
  hoverIdu?: string | null;
  onParcelleClick: (idu: string) => void;
  onParcelleHover?: (idu: string | null) => void;
  urbaRevision?: number;
  onAddToPool?: (idus: string[]) => Promise<void>;
  onAddAsUf?: (idus: string[]) => Promise<void>;
};

type UnitesMapPanelProps = SharedMapProps & {
  ufResults?: UfFilterResponse | null;
  parcellesGeojson?: FeatureCollection<Geometry, GeoJsonProperties> | null;
  focusUfId: string | null;
  hoverUfId?: string | null;
  hoverParcelleIdu?: string | null;
  onUfClick?: (ufId: string) => void;
  onParcelleHover?: (idu: string | null) => void;
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

const TABLE_SHARE_MIN = 0.28;
const TABLE_SHARE_MAX = 0.78;

export function ResultsSplit({
  mapVisible,
  tableShare,
  onTableShareChange,
  table,
  map,
}: {
  mapVisible: boolean;
  tableShare: number;
  onTableShareChange: (share: number) => void;
  table: ReactNode;
  map: ReactNode;
}) {
  const splitRef = useRef<HTMLDivElement>(null);

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const parent = splitRef.current;
    if (!parent) return;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (ev.clientX - rect.left) / rect.width;
      onTableShareChange(Math.min(TABLE_SHARE_MAX, Math.max(TABLE_SHARE_MIN, ratio)));
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const nudge = (delta: number) => {
    onTableShareChange(Math.min(TABLE_SHARE_MAX, Math.max(TABLE_SHARE_MIN, tableShare + delta)));
  };

  return (
    <div
      ref={splitRef}
      className={`results-split${mapVisible ? "" : " results-split--map-hidden"}`}
    >
      <div
        className="results-split__table"
        style={mapVisible ? { flexBasis: `${tableShare * 100}%` } : undefined}
      >
        {table}
      </div>
      {mapVisible && (
        <button
          type="button"
          className="results-split__handle"
          aria-label="Ajuster la largeur du tableau et de la carte"
          aria-orientation="vertical"
          aria-valuemin={Math.round(TABLE_SHARE_MIN * 100)}
          aria-valuemax={Math.round(TABLE_SHARE_MAX * 100)}
          aria-valuenow={Math.round(tableShare * 100)}
          onPointerDown={onHandlePointerDown}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              nudge(-0.04);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              nudge(0.04);
            }
          }}
        />
      )}
      {map}
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
  mapLayerDefs,
  poolMetricsByIdu,
  indesirableCount,
  loadingMessage,
  focusIdu,
  focusZoomNonce = 0,
  hoverIdu,
  onParcelleClick,
  onParcelleHover,
  urbaRevision = 0,
  onAddToPool,
  onAddAsUf,
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
      layerDefs={mapLayerDefs}
      poolMetricsByIdu={poolMetricsByIdu}
      indesirableCount={indesirableCount}
      loadingMessage={loadingMessage}
      focusIdu={focusIdu}
      focusZoomNonce={focusZoomNonce}
      hoverIdu={hoverIdu}
      onParcelleClick={onParcelleClick}
      onParcelleHover={onParcelleHover}
      urbaRevision={urbaRevision}
      onAddToPool={onAddToPool}
      onAddAsUf={onAddAsUf}
    />
  );
}

export function EtudeResultatsUnitesMap({
  ufResults = null,
  parcellesGeojson = null,
  foncierGeojson,
  projectId,
  thematicPreload,
  thematicPreloadLoading,
  mapLayerDefs,
  focusUfId,
  hoverUfId,
  hoverParcelleIdu = null,
  onUfClick,
  onParcelleHover,
}: UnitesMapPanelProps) {
  if (!parcellesGeojson) {
    return <MapEmpty>GeoJSON des unités foncières indisponible.</MapEmpty>;
  }
  return (
    <UnitesFoncieresMap
      parcellesGeojson={parcellesGeojson as FeatureCollection<Geometry, Record<string, unknown>>}
      ufResults={ufResults}
      foncierGeojson={foncierGeojson}
      projectId={projectId}
      preloadedThematic={thematicPreload}
      thematicPreloadLoading={thematicPreloadLoading}
      layerDefs={mapLayerDefs}
      focusUfId={focusUfId}
      hoverUfId={hoverUfId}
      onUfClick={onUfClick}
      hoverParcelleIdu={hoverParcelleIdu}
      onParcelleHover={onParcelleHover}
    />
  );
}
