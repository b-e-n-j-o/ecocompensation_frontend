import type { Polygon, MultiPolygon } from "geojson";

export type FilterTileStatus = "pending" | "active" | "done";
export type FilterTilesPhase = "hidden" | "tiling" | "filter" | "fade";

export type FilterTile = {
  id: number;
  geometry: Polygon | MultiPolygon;
  status: FilterTileStatus;
  nTiled: number;
  nCurrent: number | null;
};

export type FilterTilesOverlay = {
  phase: FilterTilesPhase;
  tiles: FilterTile[];
};

export const EMPTY_TILES_OVERLAY: FilterTilesOverlay = {
  phase: "hidden",
  tiles: [],
};

export type TilesWsPayload = {
  message?: string;
  tiles_grid?: {
    tiles?: Array<{ id: number; geometry: Polygon | MultiPolygon }>;
  };
  tile_start?: { id: number; total: number };
  tile_progress?: {
    id: number;
    total: number;
    n_inserted: number;
    n_tile: number;
  };
  filter_tiles?: { step?: number; counts?: Record<string, number> };
  tiles_fade?: boolean;
};

function markActive(tiles: FilterTile[], id: number): FilterTile[] {
  return tiles.map((tile) => {
    if (tile.id === id) return { ...tile, status: "active" };
    if (tile.status === "active") return { ...tile, status: "done" };
    return tile;
  });
}

export function tileRetention(tile: FilterTile): number {
  if (tile.nTiled <= 0) return 0;
  if (tile.nCurrent == null) return tile.status === "pending" ? 0 : 1;
  return Math.max(0, Math.min(1, tile.nCurrent / tile.nTiled));
}

export function applyWsToTilesOverlay(
  prev: FilterTilesOverlay,
  data: TilesWsPayload,
): FilterTilesOverlay {
  const msg = data.message ?? "";

  if (data.tiles_grid?.tiles?.length) {
    return {
      phase: "tiling",
      tiles: data.tiles_grid.tiles
        .filter((t) => t?.geometry && typeof t.id === "number")
        .map((t) => ({
          id: t.id,
          geometry: t.geometry,
          status: "pending",
          nTiled: 0,
          nCurrent: null,
        })),
    };
  }

  if (prev.phase === "hidden" || prev.tiles.length === 0) {
    return prev;
  }

  if (data.tiles_fade || msg.startsWith("PHASE:purge:")) {
    if (prev.phase === "fade") return prev;
    return { ...prev, phase: "fade" };
  }

  if (data.tile_start && prev.phase === "tiling") {
    return { ...prev, tiles: markActive(prev.tiles, data.tile_start.id) };
  }

  if (data.tile_progress && (prev.phase === "tiling" || prev.phase === "filter")) {
    return {
      ...prev,
      tiles: prev.tiles.map((tile) =>
        tile.id === data.tile_progress!.id
          ? {
              ...tile,
              status: "done",
              nTiled: data.tile_progress!.n_tile,
              nCurrent: data.tile_progress!.n_tile,
            }
          : tile.status === "active" && tile.id !== data.tile_progress!.id
            ? { ...tile, status: "done" }
            : tile,
      ),
    };
  }

  if (msg.startsWith("PHASE:filter:") && prev.phase === "tiling") {
    return {
      phase: "filter",
      tiles: prev.tiles.map((tile) => ({ ...tile, status: "done" })),
    };
  }

  if (data.filter_tiles?.counts) {
    const counts = data.filter_tiles.counts;
    return {
      phase: "filter",
      tiles: prev.tiles.map((tile) => ({
        ...tile,
        status: "done",
        nCurrent: counts[String(tile.id)] ?? 0,
      })),
    };
  }

  return prev;
}
