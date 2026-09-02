/**
 * LegendeMapResultats.tsx
 * ────────────────────────
 * Légende flottante partagée entre ParcellesMap et SousEnsemblesMap.
 * Pastilles rondes (même langage que Données internes / critères d’étude).
 */

import { useState, type ReactNode } from "react";
import {
  DISCRIMINANT_PALETTE,
  extractDistinctValues,
  type ResultsLayerDef,
  type ThematicLayerState,
} from "./cartoCouchesRegistry";

interface LegendeMapResultatsProps {
  layers: ResultsLayerDef[];
  layersState: Record<string, ThematicLayerState>;
  onToggle: (key: string) => void;
  primaryLayer?: {
    label: string;
    visible: boolean;
    onToggle: () => void;
    footnote?: ReactNode;
  };
  bulkLoading?: boolean;
  onToggleValue?: (layerKey: string, value: string) => void;
}

export function LegendeMapResultats({
  layers,
  layersState,
  onToggle,
  primaryLayer,
  bulkLoading = false,
  onToggleValue,
}: LegendeMapResultatsProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (layers.length === 0) return null;

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function previewColor(def: ResultsLayerDef, st: ThematicLayerState): string {
    if (!def.discriminantField || st.loadState !== "loaded" || !st.geojson) return def.fillColor;
    const values = extractDistinctValues(st.geojson, def.discriminantField);
    if (!values.length) return def.fillColor;
    const selected = st.selectedValues;
    const active =
      selected && selected.length > 0 ? values.find((v) => selected.includes(v)) : values[0];
    const idx = values.indexOf(active ?? values[0]);
    return DISCRIMINANT_PALETTE[(idx >= 0 ? idx : 0) % DISCRIMINANT_PALETTE.length];
  }

  return (
    <div className="map-legende">
      <div className="map-legende__head">Couches</div>

      {bulkLoading && (
        <div className="map-legende__busy" role="status" aria-live="polite">
          <span className="parcelles-map-spinner" aria-hidden />
          Chargement…
        </div>
      )}

      <ul className="map-legende__list">
        {primaryLayer && (
          <li>
            <button
              type="button"
              className={`map-legende__row${primaryLayer.visible ? " is-on" : " is-off"}`}
              onClick={primaryLayer.onToggle}
            >
              <span
                className={`map-legende__dot${primaryLayer.visible ? " is-on" : ""}`}
                style={{ ["--dot-color" as string]: "#289f01" }}
              />
              <span className="map-legende__label">{primaryLayer.label}</span>
            </button>
            {primaryLayer.footnote ? (
              <div className="map-legende__footnote">{primaryLayer.footnote}</div>
            ) : null}
          </li>
        )}
        {layers.map((def) => {
          const st = layersState[def.key];
          if (!st) return null;

          const isExpanded = expandedKeys.has(def.key);
          const hasDiscriminant = !!def.discriminantField && st.loadState === "loaded" && !!st.geojson;
          const distinctValues = hasDiscriminant
            ? extractDistinctValues(st.geojson, def.discriminantField!)
            : [];
          const swatchColor = previewColor(def, st);

          return (
            <li key={def.key}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  className={`map-legende__row${st.visible ? " is-on" : " is-off"}`}
                  onClick={() => onToggle(def.key)}
                >
                  <span
                    className={`map-legende__dot${st.visible ? " is-on" : ""}`}
                    style={{ ["--dot-color" as string]: swatchColor }}
                  />
                  <span className="map-legende__label">{def.label}</span>
                  {st.loadState === "loading" && (
                    <span className="parcelles-map-spinner" aria-hidden />
                  )}
                  {st.loadState === "error" && (
                    <span
                      className="map-legende__dot is-on"
                      style={{ ["--dot-color" as string]: "#dc2626" }}
                      title={st.error ?? ""}
                    />
                  )}
                  {st.loadState === "loaded" && st.geojson && !def.discriminantField && (
                    <span className="map-legende__meta">
                      {st.geojson.features.length.toLocaleString("fr-FR")}
                    </span>
                  )}
                </button>
                {hasDiscriminant && distinctValues.length > 0 && (
                  <button
                    type="button"
                    className="map-legende__expand"
                    onClick={() => toggleExpand(def.key)}
                    title={isExpanded ? "Replier" : "Détail"}
                  >
                    {isExpanded ? "▴" : "▾"}
                  </button>
                )}
              </div>

              {st.loadState === "error" && st.error && (
                <div className="map-legende__error">{st.error}</div>
              )}

              {hasDiscriminant && isExpanded && distinctValues.length > 0 && (
                <ul className="map-legende__values">
                  {distinctValues.map((val) => {
                    const idx = distinctValues.indexOf(val);
                    const color = DISCRIMINANT_PALETTE[(idx >= 0 ? idx : 0) % DISCRIMINANT_PALETTE.length];
                    const selected = st.selectedValues;
                    const isActive = !selected || selected.includes(val);
                    const count = st.geojson!.features.filter(
                      (f) => String(f.properties?.[def.discriminantField!] ?? "") === val,
                    ).length;
                    return (
                      <li key={val}>
                        <button
                          type="button"
                          className="map-legende__value"
                          onClick={() => onToggleValue?.(def.key, val)}
                          title={isActive ? "Masquer" : "Afficher"}
                        >
                          <span
                            className={`map-legende__dot${isActive ? " is-on" : ""}`}
                            style={{ ["--dot-color" as string]: color }}
                          />
                          <span
                            className="map-legende__swatch"
                            style={{ background: color }}
                          />
                          <span className="map-legende__value-label">{val}</span>
                          <span className="map-legende__meta">{count.toLocaleString("fr-FR")}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
