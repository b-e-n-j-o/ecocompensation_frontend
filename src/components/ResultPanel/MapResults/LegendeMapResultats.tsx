/**
 * LegendeMapResultats.tsx
 * ────────────────────────
 * Légende flottante partagée entre ParcellesMap et SousEnsemblesMap.
 * - Toggle ON/OFF par couche
 * - Sous-légende dépliable par valeur de discriminantField
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
  /** Toggle optionnel de la couche principale (parcelles / sous-ensembles). */
  primaryLayer?: {
    label: string;
    visible: boolean;
    onToggle: () => void;
    /** Sous-texte sous la ligne principale (ex. légende parcelles indésirables). */
    footnote?: ReactNode;
  };
  /** Préchargement global des couches après filtre — message + spinner dans la légende. */
  bulkLoading?: boolean;
  /** Toggle d'une valeur discriminante individuelle dans une couche. */
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
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function previewColor(def: ResultsLayerDef, st: ThematicLayerState): string {
    if (!def.discriminantField || st.loadState !== "loaded" || !st.geojson) return def.fillColor;
    const values = extractDistinctValues(st.geojson, def.discriminantField);
    if (!values.length) return def.fillColor;
    const selected = st.selectedValues;
    const active = selected && selected.length > 0
      ? values.find((v) => selected.includes(v))
      : values[0];
    const idx = values.indexOf(active ?? values[0]);
    return DISCRIMINANT_PALETTE[(idx >= 0 ? idx : 0) % DISCRIMINANT_PALETTE.length];
  }

  return (
    <div style={{
      position: "absolute", bottom: 36, right: 10, zIndex: 10,
      background: "rgba(255,255,255,0.96)", border: "1px solid #e2e8f0",
      borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      minWidth: 200, maxWidth: 260,
      fontFamily: "DM Sans, system-ui, sans-serif", overflow: "hidden",
    }}>
      <div style={{
        padding: "6px 10px", fontSize: 10, fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: "#64748b", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
      }}>
        Couches projet
      </div>

      {bulkLoading && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", fontSize: 12, color: "#334155",
            background: "#f1f5f9", borderBottom: "1px solid #e2e8f0",
          }}
          role="status"
          aria-live="polite"
        >
          <span
            style={{
              display: "inline-block", width: 14, height: 14, flexShrink: 0,
              border: "2px solid #e2e8f0", borderTopColor: "#3b82f6",
              borderRadius: "50%", animation: "rll-spin 0.7s linear infinite",
            }}
          />
          <span style={{ fontWeight: 500 }}>Chargement des entités…</span>
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: "4px 0" }}>
        {primaryLayer && (
          <li style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <button
              type="button"
              onClick={primaryLayer.onToggle}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                color: primaryLayer.visible ? "#0f172a" : "#475569",
              }}
            >
              <span style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 3,
                flexShrink: 0,
                border: `2px solid ${primaryLayer.visible ? "#10b981" : "#94a3b8"}`,
                background: primaryLayer.visible ? "#10b981" : "transparent",
                transition: "all 0.15s",
              }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: primaryLayer.visible ? 600 : 400 }}>
                {primaryLayer.label}
              </span>
            </button>
            {primaryLayer.footnote ? (
              <div
                style={{
                  padding: "4px 10px 8px",
                  fontSize: 10,
                  color: "#64748b",
                  lineHeight: 1.35,
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                {primaryLayer.footnote}
              </div>
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

          return (
            <li key={def.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {/* Toggle visibilité */}
                <button
                  type="button"
                  onClick={() => onToggle(def.key)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", background: "none", border: "none",
                    cursor: "pointer", textAlign: "left",
                    color: st.visible ? "#0f172a" : "#475569",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {(() => {
                    const swatchColor = previewColor(def, st);
                    return (
                  <span style={{
                    display: "inline-block", width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                    border: `2px solid ${st.visible ? swatchColor : "#94a3b8"}`,
                    background: st.visible ? swatchColor : "transparent",
                    transition: "all 0.15s",
                  }} />
                    );
                  })()}
                  <span style={{ flex: 1, fontSize: 12, fontWeight: st.visible ? 600 : 400 }}>
                    {def.label}
                  </span>
                  {st.loadState === "loading" && (
                    <span style={{
                      display: "inline-block", width: 10, height: 10, flexShrink: 0,
                      border: "2px solid #e2e8f0", borderTopColor: "#3b82f6",
                      borderRadius: "50%", animation: "rll-spin 0.7s linear infinite",
                    }} />
                  )}
                  {st.loadState === "error" && (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0, display: "inline-block" }} title={st.error ?? ""} />
                  )}
                  {st.loadState === "loaded" && st.geojson && !def.discriminantField && (
                    <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#94a3b8" }}>
                      {st.geojson.features.length.toLocaleString("fr-FR")}
                    </span>
                  )}
                </button>

                {/* Bouton dépliage sous-légende */}
                {hasDiscriminant && distinctValues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(def.key)}
                    title={isExpanded ? "Replier" : "Détail par valeur"}
                    style={{
                      padding: "6px 8px", background: "none", border: "none",
                      cursor: "pointer", color: "#94a3b8", fontSize: 14, lineHeight: 1, flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                  >
                    {isExpanded ? "▴" : "▾"}
                  </button>
                )}
              </div>

              {st.loadState === "error" && st.error && (
                <div style={{ padding: "2px 10px 4px 30px", fontSize: 10, color: "#ef4444" }}>
                  {st.error}
                </div>
              )}

              {/* Sous-légende par valeur discriminante */}
              {hasDiscriminant && isExpanded && distinctValues.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: "2px 10px 6px 30px", borderTop: "1px solid #f1f5f9" }}>
                  <li style={{ fontSize: 10, color: "#94a3b8", fontFamily: "IBM Plex Mono, monospace", padding: "2px 0 4px 0" }}>
                    {st.geojson!.features.length.toLocaleString("fr-FR")} entités
                  </li>
                  {distinctValues.map((val) => {
                    const idx = distinctValues.indexOf(val);
                    const color = DISCRIMINANT_PALETTE[(idx >= 0 ? idx : 0) % DISCRIMINANT_PALETTE.length];
                    const selected = st.selectedValues;
                    const isActive = !selected || selected.includes(val);
                    const count = st.geojson!.features.filter(
                      (f) => String(f.properties?.[def.discriminantField!] ?? "") === val
                    ).length;
                    return (
                      <li key={val} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                        <button
                          type="button"
                          onClick={() => onToggleValue?.(def.key, val)}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            border: isActive ? "2px solid #0f172a" : "2px solid #cbd5e1",
                            background: isActive ? "#0f172a" : "transparent",
                            padding: 0,
                            marginRight: 4,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                          title={isActive ? "Masquer cette valeur" : "Afficher cette valeur"}
                        />
                        <span style={{
                          display: "inline-block", width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                          background: color, border: `1.5px solid ${color}cc`,
                        }} />
                        <span style={{ flex: 1, fontSize: 11, color: "#374151" }}>{val}</span>
                        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#94a3b8" }}>
                          {count.toLocaleString("fr-FR")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <style>{`@keyframes rll-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}