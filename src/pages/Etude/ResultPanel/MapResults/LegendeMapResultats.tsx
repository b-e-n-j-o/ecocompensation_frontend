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
  extraLayers?: Array<{
    label: string;
    visible: boolean;
    onToggle: () => void;
    color?: string;
    categories?: Array<{ label: string; color: string; count: number }>;
    categorized?: boolean;
    onToggleCategorize?: () => void;
  }>;
  bulkLoading?: boolean;
  onToggleValue?: (layerKey: string, value: string) => void;
  /** Sans cadre ni titre : contenu seul, à placer dans un onglet. */
  embedded?: boolean;
}

export function LegendeMapResultats({
  layers,
  layersState,
  onToggle,
  primaryLayer,
  extraLayers = [],
  bulkLoading = false,
  onToggleValue,
  embedded = false,
}: LegendeMapResultatsProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (layers.length === 0 && extraLayers.length === 0 && !primaryLayer) return null;

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

  const body = (
    <>
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
        {extraLayers.map((layer) => {
          const isExpanded = expandedKeys.has(layer.label);
          const categories = layer.categories ?? [];
          return (
            <li key={layer.label}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  className={`map-legende__row${layer.visible ? " is-on" : " is-off"}`}
                  onClick={layer.onToggle}
                >
                  <span
                    className={`map-legende__dot${layer.visible ? " is-on" : ""}`}
                    style={{ ["--dot-color" as string]: layer.color ?? "#2f7d5b" }}
                  />
                  <span className="map-legende__label">{layer.label}</span>
                </button>
                {layer.visible && categories.length > 0 && (
                  <button
                    type="button"
                    className="map-legende__expand"
                    onClick={() => toggleExpand(layer.label)}
                    title={isExpanded ? "Replier" : "Par personne morale"}
                  >
                    {isExpanded ? "▴" : "▾"}
                  </button>
                )}
              </div>
              {layer.visible && layer.onToggleCategorize && (
                <button
                  type="button"
                  className="map-legende__value"
                  onClick={layer.onToggleCategorize}
                >
                  {layer.categorized ? "Couleur unique" : "Couleur par nom"}
                </button>
              )}
              {layer.visible && layer.categorized && isExpanded && categories.length > 0 && (
                <ul className="map-legende__values" style={{ maxHeight: 220, overflow: "auto" }}>
                  {categories.map((cat) => (
                    <li key={cat.label}>
                      <span className="map-legende__value">
                        <span
                          className="map-legende__swatch"
                          style={{ background: cat.color }}
                        />
                        <span className="map-legende__value-label">{cat.label}</span>
                        <span className="map-legende__meta">{cat.count.toLocaleString("fr-FR")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
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
    </>
  );

  if (embedded) return body;

  return (
    <div className="map-legende">
      <div className="map-legende__head">Couches</div>
      {body}
    </div>
  );
}
