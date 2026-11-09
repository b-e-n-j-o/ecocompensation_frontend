import type maplibregl from "maplibre-gl";

export type BaseMapMode = "satellite" | "plan";

export const RESULTS_BASEMAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    },
    "ign-plan": {
      type: "raster",
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
          "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png" +
          "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      ],
      tileSize: 256,
      attribution: "© IGN — Géoplateforme (Plan IGN)",
    },
  },
  layers: [
    { id: "basemap-satellite", type: "raster", source: "esri-satellite", layout: { visibility: "visible" } },
    { id: "basemap-plan", type: "raster", source: "ign-plan", layout: { visibility: "none" } },
  ],
};

export function applyBaseMapMode(map: maplibregl.Map | null, mode: BaseMapMode) {
  if (!map?.isStyleLoaded()) return;
  const satVis = mode === "satellite" ? "visible" : "none";
  const planVis = mode === "plan" ? "visible" : "none";
  try {
    map.setLayoutProperty("basemap-satellite", "visibility", satVis);
    map.setLayoutProperty("basemap-plan", "visibility", planVis);
  } catch {
    /* couches pas encore montées */
  }
}
