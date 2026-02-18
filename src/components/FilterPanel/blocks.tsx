// ─── Blocs du FilterPanel ────────────────────────────────────────────────────
import { Slider, NumericInput, RadioGroup, SectionBlock, Badge } from "./primitives";
import { ZDV_NATURES } from "../../types";
import type { ZdvNature, HydroMode, FilterOptions } from "../../types";

// ── 1. Exclusions automatiques ────────────────────────────────────────────────
export function ExclusionsBlock() {
  return (
    <SectionBlock title="Exclusions automatiques" icon="⊘" accent="red" collapsible={false}>
      <div className="exclusion-chips">
        <div className="excl-chip">
          <span className="excl-icon">✕</span>
          <span>GEOMCE</span>
        </div>
        <div className="excl-chip">
          <span className="excl-icon">✕</span>
          <span>Patrimoine naturel</span>
        </div>
      </div>
    </SectionBlock>
  );
}

// ── 2. Zone de végétation ─────────────────────────────────────────────────────
interface ZdvBlockProps {
  value: ZdvNature[];
  onChange: (v: ZdvNature[]) => void;
}

export function ZdvBlock({ value, onChange }: ZdvBlockProps) {
  function toggleNature(n: ZdvNature) {
    if (value.includes(n)) {
      onChange(value.filter((x) => x !== n));
    } else {
      onChange([...value, n]);
    }
  }

  const noFilter = value.length === 0;

  return (
    <SectionBlock title="Zone de végétation" icon="🌲" accent="green" collapsible defaultOpen>
      <div className="zdv-grid">
        {ZDV_NATURES.map((n) => (
          <label key={n} className={`zdv-option ${value.includes(n) ? "selected" : ""}`}>
            <input type="checkbox" checked={value.includes(n)} onChange={() => toggleNature(n)} />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <label className="no-filter-toggle">
        <input type="checkbox" checked={noFilter} onChange={() => onChange(noFilter ? ["Forêt ouverte"] : [])} />
        <span>Ignorer ce filtre</span>
      </label>
    </SectionBlock>
  );
}

// ── 3. Hydrologie ─────────────────────────────────────────────────────────────
interface HydroBlockProps {
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

export function HydroBlock({ tronconMode, tronconRadius, surfaceMode, surfaceRadius, onChange }: HydroBlockProps) {
  return (
    <SectionBlock title="Hydrologie" icon="💧" accent="blue" collapsible defaultOpen>
      <div className="hydro-section">
        <div className="hydro-label">Cours d'eau</div>
        <RadioGroup name="troncon" value={tronconMode} options={HYDRO_OPTIONS} onChange={(v) => onChange({ troncon_hydro_mode: v })} />
        {tronconMode === "within_radius" && (
          <div className="hydro-slider">
            <Slider label="Rayon" value={tronconRadius} min={50} max={2000} step={50} onChange={(v) => onChange({ troncon_hydro_radius_m: v })} unit=" m" />
          </div>
        )}
      </div>
      
      <div className="hydro-divider" />

      <div className="hydro-section">
        <div className="hydro-label">Plans d'eau</div>
        <RadioGroup name="surface" value={surfaceMode} options={HYDRO_OPTIONS} onChange={(v) => onChange({ surface_hydro_mode: v })} />
        {surfaceMode === "within_radius" && (
          <div className="hydro-slider">
            <Slider label="Rayon" value={surfaceRadius} min={50} max={2000} step={50} onChange={(v) => onChange({ surface_hydro_radius_m: v })} unit=" m" />
          </div>
        )}
      </div>
    </SectionBlock>
  );
}

// ── 4. Géométrie ──────────────────────────────────────────────────────────────
interface GeometryBlockProps {
  miller: number;
  minAreaHa: number;
  onChange: (patch: Partial<FilterOptions>) => void;
}

export function GeometryBlock({ miller, minAreaHa, onChange }: GeometryBlockProps) {
  return (
    <SectionBlock title="Géométrie" icon="⬡" accent="purple" collapsible defaultOpen>
      <Slider
        label="Miller minimum"
        value={miller}
        min={0.1}
        max={0.9}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange({ miller_threshold: v })}
      />
      <NumericInput
        label="Surface minimale"
        value={minAreaHa}
        min={0.5}
        max={100}
        step={0.5}
        unit=" ha"
        onChange={(v) => onChange({ min_area_ha: v })}
      />
    </SectionBlock>
  );
}

// ── 5. Distance & cible ───────────────────────────────────────────────────────
interface DistanceBlockProps {
  radiusStart: number;
  radiusMin: number;
  targetCount: number;
  onChange: (patch: Partial<FilterOptions>) => void;
}

export function DistanceBlock({ radiusStart, radiusMin, targetCount, onChange }: DistanceBlockProps) {
  return (
    <SectionBlock title="Distance & cible" icon="⊙" accent="orange" collapsible defaultOpen>
      <Slider label="Rayon départ" value={radiusStart} min={1} max={25} step={1} onChange={(v) => onChange({ radius_start_km: v })} unit=" km" />
      <div className="distance-inputs">
        <NumericInput label="Rayon min" value={radiusMin} min={1} max={radiusStart} step={1} unit=" km" onChange={(v) => onChange({ radius_min_km: v })} />
        <NumericInput label="Cible max" value={targetCount} min={5} max={200} step={5} unit=" parc." onChange={(v) => onChange({ target_count: v })} />
      </div>
    </SectionBlock>
  );
}

// ── 6. Poids du scoring ───────────────────────────────────────────────────────
interface ScoringWeightsBlockProps {
  options: FilterOptions;
  onChange: (patch: Partial<FilterOptions>) => void;
}

export function ScoringWeightsBlock({ options, onChange }: ScoringWeightsBlockProps) {
  const maxPts =
    Math.max(options.score_dist_lt2km, options.score_dist_lt5km, options.score_dist_lt10km) +
    options.score_surface_ge20ha +
    options.score_miller_ge05 +
    options.score_hydro_lt100m;

  const weights: {
    key: keyof FilterOptions;
    label: string;
    sub: string;
    group: "dist" | "shape" | "eco";
  }[] = [
    { key: "score_dist_lt2km",     label: `< ${options.score_threshold_dist_2km} km du centre`,   sub: "Distance",  group: "dist"  },
    { key: "score_dist_lt5km",     label: `${options.score_threshold_dist_2km} – ${options.score_threshold_dist_5km} km`,           sub: "Distance",  group: "dist"  },
    { key: "score_dist_lt10km",    label: `${options.score_threshold_dist_5km} – 10 km`,          sub: "Distance",  group: "dist"  },
    { key: "score_surface_ge20ha", label: `≥ ${options.score_threshold_surface_ha} ha`,            sub: "Surface",   group: "shape" },
    { key: "score_miller_ge05",    label: `Miller ≥ ${options.score_threshold_miller}`,       sub: "Forme",     group: "shape" },
    { key: "score_hydro_lt100m",   label: `Hydro < ${options.score_threshold_hydro_m} m`,      sub: "Écologie",  group: "eco"   },
  ];

  return (
    <SectionBlock title="Poids du scoring" icon="⚖" accent="muted" collapsible defaultOpen>
      <div className="scoring-thresholds">
        <NumericInput
          label="Miller seuil"
          value={options.score_threshold_miller}
          min={0.1}
          max={0.9}
          step={0.05}
          onChange={(v) => onChange({ score_threshold_miller: v })}
        />
        <NumericInput
          label="Surface seuil"
          value={options.score_threshold_surface_ha}
          min={5}
          max={50}
          step={5}
          unit=" ha"
          onChange={(v) => onChange({ score_threshold_surface_ha: v })}
        />
        <NumericInput
          label="Hydro seuil"
          value={options.score_threshold_hydro_m}
          min={50}
          max={500}
          step={50}
          unit=" m"
          onChange={(v) => onChange({ score_threshold_hydro_m: v })}
        />
      </div>
      <div className="scoring-divider" />
      <div className="scoring-header">
        <span className="block-hint">Score max théorique :</span>
        <Badge variant="orange">{maxPts} pts</Badge>
      </div>
      <div className="scoring-grid">
        {weights.map(({ key, label, sub }) => (
          <div key={key} className="scoring-row">
            <div className="scoring-labels">
              <span className="scoring-sub">{sub}</span>
              <span className="scoring-label">{label}</span>
            </div>
            <div className="scoring-control">
              <button
                className="pts-btn"
                onClick={() => onChange({ [key]: Math.max(0, (options[key] as number) - 1) })}
              >−</button>
              <span className="pts-value mono">{options[key] as number}</span>
              <button
                className="pts-btn"
                onClick={() => onChange({ [key]: Math.min(10, (options[key] as number) + 1) })}
              >+</button>
              <span className="pts-unit">pt{(options[key] as number) !== 1 ? "s" : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}