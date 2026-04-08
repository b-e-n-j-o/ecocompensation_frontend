/**
 * Hydrologie : tronçons et plans d'eau (modes intersect / proximité).
 */
import type { HydroMode } from "../../../types";
import type { FilterOptions } from "../../../types";
import { SectionCard, SliderField, RadioRow, filterTheme, Hint } from "../shared";

interface HydroSectionProps {
  tronconMode: HydroMode;
  tronconRadius: number;
  surfaceMode: HydroMode;
  surfaceRadius: number;
  onChange: (patch: Partial<FilterOptions>) => void;
}

const HYDRO_OPTIONS: { value: HydroMode; label: string }[] = [
  { value: "none", label: "Ignorer" },
  { value: "intersect", label: "Intersecte" },
  { value: "within_radius", label: "Proximité" },
];

export function HydroSection({
  tronconMode,
  tronconRadius,
  surfaceMode,
  surfaceRadius,
  onChange,
}: HydroSectionProps) {
  return (
    <SectionCard title="Hydrologie" icon="💧" accent="blue" collapsible>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#d1d5db" }}>Cours d&apos;eau</div>
        <RadioRow name="troncon" value={tronconMode} options={HYDRO_OPTIONS} onChange={(v) => onChange({ troncon_hydro_mode: v })} />
        {tronconMode === "within_radius" && (
          <SliderField
            label="Rayon"
            value={tronconRadius}
            min={50}
            max={2000}
            step={50}
            onChange={(v) => onChange({ troncon_hydro_radius_m: v })}
            unit=" m"
          />
        )}
      </div>

      <div style={{ height: 1, background: filterTheme.border, margin: "4px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#d1d5db" }}>Plans d&apos;eau</div>
        <RadioRow name="surface" value={surfaceMode} options={HYDRO_OPTIONS} onChange={(v) => onChange({ surface_hydro_mode: v })} />
        {surfaceMode === "within_radius" && (
          <SliderField
            label="Rayon"
            value={surfaceRadius}
            min={50}
            max={2000}
            step={50}
            onChange={(v) => onChange({ surface_hydro_radius_m: v })}
            unit=" m"
          />
        )}
      </div>
      <Hint>Les modes « Proximité » utilisent le rayon indiqué autour de la parcelle.</Hint>
    </SectionCard>
  );
}
