/**
 * Exclusions automatiques : retire des critères les données issues de certaines couches (clés LAYER_REGISTRY).
 * Natura 2000 n’est pas proposé ici : le filtre dédié (mode intersect / exclure / ignorer) suffit.
 */
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard, filterTheme, Hint } from "../shared";

interface LayerInfo {
  key: string;
  label: string;
  fast: boolean;
}

interface ExclusionsSectionProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function ExclusionsSection({ value, onChange }: ExclusionsSectionProps) {
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const strippedLegacyNatura = useRef(false);

  /** Natura 2000 : filtre dédié plus bas, pas dans les exclusions scoring. */
  const selectableLayers = useMemo(() => layers.filter((l) => l.key !== "natura2000"), [layers]);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
    fetch(`${API}/api/layers`)
      .then((res) => res.json())
      .then((data: LayerInfo[]) => setLayers(data))
      .catch(() => {});
  }, []);

  /** Ancien état pouvait contenir natura2000 : on le retire du modèle (une fois). */
  useEffect(() => {
    if (strippedLegacyNatura.current || !value.includes("natura2000")) return;
    strippedLegacyNatura.current = true;
    onChange(value.filter((k) => k !== "natura2000"));
  }, [value, onChange]);

  function toggleLayer(key: string) {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  }

  const chipStyle = (selected: boolean): CSSProperties => ({
    padding: "4px 10px",
    background: selected ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.05)",
    border: `1px solid ${selected ? "#ef4444" : "rgba(239, 68, 68, 0.3)"}`,
    borderRadius: 4,
    fontSize: 11,
    color: "#ef4444",
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
  });

  const visibleKeys = value.filter((k) => k !== "natura2000");

  return (
    <SectionCard title="Exclusions automatiques" icon="⊘" accent="red" collapsible>
      <Hint>
        Les parcelles ne seront pas pénalisées par les données des couches listées (ex. masquer le GEOMCE du scoring).
        Natura 2000 se règle dans la section « Natura 2000 » du filtre, pas ici.
      </Hint>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: filterTheme.muted }}>Ajouter une couche à exclure</span>
        <select
          style={{
            flex: 1,
            maxWidth: 220,
            padding: "6px 10px",
            background: filterTheme.bgInput,
            border: `1px solid ${filterTheme.border}`,
            borderRadius: 999,
            color: filterTheme.text,
            fontSize: 12,
          }}
          value=""
          onChange={(e) => {
            const key = e.target.value;
            if (!key) return;
            toggleLayer(key);
            e.target.value = "";
          }}
        >
          <option value="">Choisir une couche…</option>
          {selectableLayers
            .filter((l) => !value.includes(l.key))
            .map((layer) => (
              <option key={layer.key} value={layer.key}>
                {layer.label}
              </option>
            ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {visibleKeys.map((key) => {
          const layer = layers.find((l) => l.key === key);
          const label = layer?.label ?? key;
          return (
            <button
              key={key}
              type="button"
              style={chipStyle(true)}
              onClick={() => toggleLayer(key)}
              title={layer?.fast != null ? (layer.fast ? "Couche rapide" : "Couche longue / WFS") : ""}
            >
              <span>✕</span>
              <span>{label}</span>
            </button>
          );
        })}
        {layers.length === 0 && visibleKeys.length === 0 && (
          <button type="button" style={chipStyle(true)} onClick={() => toggleLayer("geomce")}>
            <span>✕</span>
            <span>GEOMCE</span>
          </button>
        )}
      </div>
    </SectionCard>
  );
}
