/**
 * Popups MapLibre au survol — ne bloquent pas la souris (navigation carte).
 *
 * - trackPointer() : le popup suit le curseur
 * - pointer-events: none (CSS) : la souris « traverse » le popup
 * - ancrage bottom-left : le popup s'affiche au-dessus / à droite du curseur
 */

import maplibregl from "maplibre-gl";

export const MAP_HOVER_POPUP_CLASS = "map-hover-popup";

const HOVER_OFFSET = 16;

export function createMapHoverPopup(maxWidth: string): maplibregl.Popup {
  return new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: MAP_HOVER_POPUP_CLASS,
    anchor: "bottom-left",
    offset: [HOVER_OFFSET, HOVER_OFFSET],
    maxWidth,
  });
}

/**
 * Affiche ou met à jour un popup hover (HTML + suivi curseur).
 */
export function showMapHoverPopup(
  popup: maplibregl.Popup,
  map: maplibregl.Map,
  html: string,
): void {
  const wasOpen = popup.isOpen();
  popup.setHTML(html);
  if (!wasOpen) {
    popup.trackPointer().addTo(map);
  }
}

export function hideMapHoverPopup(popup: maplibregl.Popup): void {
  popup.remove();
}
