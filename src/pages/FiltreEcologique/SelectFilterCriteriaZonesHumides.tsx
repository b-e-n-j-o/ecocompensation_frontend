import type { ZoneHumideMode } from "../../types";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { SelectNationalExclusions } from "./SelectNationalExclusions";

type Props = {
  minAreaHa: number;
  onMinAreaHaChange: (v: number) => void;
  minZoneHumideHa: number;
  onMinZoneHumideHaChange: (v: number) => void;
  millerEnabled: boolean;
  onMillerEnabledChange: (v: boolean) => void;
  millerThresh: number;
  onMillerThreshChange: (v: number) => void;
  zonesHumidesProbablesMode: ZoneHumideMode;
  onZonesHumidesProbablesModeChange: (v: ZoneHumideMode) => void;
  excludedLayers: string[];
  onExcludedLayersChange: (v: string[]) => void;
  faunaEnabled: boolean;
  onFaunaEnabledChange: (v: boolean) => void;
  faunaSpecies: string[];
  onFaunaSpeciesChange: (v: string[]) => void;
  faunaDistM: number;
  onFaunaDistMChange: (v: number) => void;
  tronconsHydroEnabled: boolean;
  onTronconsHydroEnabledChange: (v: boolean) => void;
  tronconsHydroMaxDistM: number;
  onTronconsHydroMaxDistMChange: (v: number) => void;
  surfacesHydroEnabled: boolean;
  onSurfacesHydroEnabledChange: (v: boolean) => void;
  surfacesHydroMaxDistM: number;
  onSurfacesHydroMaxDistMChange: (v: number) => void;
  disabled?: boolean;
};

const MODE_OPTIONS: { value: ZoneHumideMode; label: string }[] = [
  { value: "ignore", label: "Ignorer" },
  { value: "intersect", label: "Intersecter" },
  { value: "exclude", label: "Exclure" },
];

export function SelectFilterCriteriaZonesHumides({
  minAreaHa,
  onMinAreaHaChange,
  minZoneHumideHa,
  onMinZoneHumideHaChange,
  millerEnabled,
  onMillerEnabledChange,
  millerThresh,
  onMillerThreshChange,
  zonesHumidesProbablesMode,
  onZonesHumidesProbablesModeChange,
  excludedLayers,
  onExcludedLayersChange,
  faunaEnabled,
  onFaunaEnabledChange,
  faunaSpecies,
  onFaunaSpeciesChange,
  faunaDistM,
  onFaunaDistMChange,
  tronconsHydroEnabled,
  onTronconsHydroEnabledChange,
  tronconsHydroMaxDistM,
  onTronconsHydroMaxDistMChange,
  surfacesHydroEnabled,
  onSurfacesHydroEnabledChange,
  surfacesHydroMaxDistM,
  onSurfacesHydroMaxDistMChange,
  disabled = false,
}: Props) {
  return (
    <div className="eco-filter-criteria">
      <div className="eco-filter-block eco-filter-block--first">
        <h3 className="eco-filter-block-title">Filtre géométrique</h3>
        <div className="eco-aoi-slider">
          <div className="eco-aoi-slider-head">
            <span className="eco-aoi-label">Surface minimale du foncier recherché</span>
            <span className="eco-aoi-slider-value">{minAreaHa.toFixed(1)} ha</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            step={0.5}
            value={minAreaHa}
            disabled={disabled}
            onChange={(e) => onMinAreaHaChange(parseFloat(e.target.value))}
          />
        </div>
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${millerEnabled ? " is-on" : ""}`}
          disabled={disabled}
          aria-pressed={millerEnabled}
          onClick={() => onMillerEnabledChange(!millerEnabled)}
        >
          <span className={`eco-dot${millerEnabled ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__label">Indice de Miller</span>
        </button>
        {millerEnabled && (
          <div className="eco-aoi-slider eco-filter-nested">
            <div className="eco-aoi-slider-head">
              <span className="eco-aoi-label">Compacité minimale</span>
              <span className="eco-aoi-slider-value">{millerThresh.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.8}
              step={0.01}
              value={millerThresh}
              disabled={disabled}
              onChange={(e) => onMillerThreshChange(parseFloat(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="eco-filter-block">
        <h3 className="eco-filter-block-title">Zones humides</h3>
        <div className="eco-aoi-slider">
          <div className="eco-aoi-slider-head">
            <span className="eco-aoi-label">Surface min. ZH établies</span>
            <span className="eco-aoi-slider-value">
              {minZoneHumideHa <= 0 ? "Off" : `${minZoneHumideHa.toFixed(2)} ha`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.05}
            value={minZoneHumideHa}
            disabled={disabled}
            onChange={(e) => onMinZoneHumideHaChange(parseFloat(e.target.value))}
          />
        </div>
        <fieldset className="eco-zh-fieldset" disabled={disabled}>
          <legend className="eco-aoi-label">ZH probables</legend>
          <div className="eco-zh-modes">
            {MODE_OPTIONS.map((opt) => (
              <label key={opt.value} className="eco-zh-mode">
                <input
                  type="radio"
                  name="zones-humides-probables-mode"
                  value={opt.value}
                  checked={zonesHumidesProbablesMode === opt.value}
                  onChange={() => onZonesHumidesProbablesModeChange(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="eco-filter-block">
        <h3 className="eco-filter-block-title">Hydrographie</h3>
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${tronconsHydroEnabled ? " is-on" : ""}`}
          disabled={disabled}
          aria-pressed={tronconsHydroEnabled}
          onClick={() => onTronconsHydroEnabledChange(!tronconsHydroEnabled)}
        >
          <span className={`eco-dot${tronconsHydroEnabled ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__text">
            <span className="eco-layer-row__label">Cours d&apos;eau</span>
            <span className="eco-layer-row__meta">ecocompensation.troncons_hydros</span>
          </span>
        </button>
        {tronconsHydroEnabled && (
          <div className="eco-aoi-slider eco-filter-nested">
            <div className="eco-aoi-slider-head">
              <span className="eco-aoi-label">Distance max</span>
              <span className="eco-aoi-slider-value">
                {tronconsHydroMaxDistM <= 0 ? "Intersection" : `${tronconsHydroMaxDistM.toFixed(0)} m`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={25}
              value={tronconsHydroMaxDistM}
              disabled={disabled}
              onChange={(e) => onTronconsHydroMaxDistMChange(Number(e.target.value))}
            />
          </div>
        )}
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${surfacesHydroEnabled ? " is-on" : ""}`}
          disabled={disabled}
          aria-pressed={surfacesHydroEnabled}
          onClick={() => onSurfacesHydroEnabledChange(!surfacesHydroEnabled)}
        >
          <span className={`eco-dot${surfacesHydroEnabled ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__text">
            <span className="eco-layer-row__label">Plans d&apos;eau</span>
            <span className="eco-layer-row__meta">ecocompensation.surfaces_hydros</span>
          </span>
        </button>
        {surfacesHydroEnabled && (
          <div className="eco-aoi-slider eco-filter-nested">
            <div className="eco-aoi-slider-head">
              <span className="eco-aoi-label">Distance max</span>
              <span className="eco-aoi-slider-value">
                {surfacesHydroMaxDistM <= 0 ? "Intersection" : `${surfacesHydroMaxDistM.toFixed(0)} m`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={25}
              value={surfacesHydroMaxDistM}
              disabled={disabled}
              onChange={(e) => onSurfacesHydroMaxDistMChange(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <SelectNationalExclusions
        excludedLayers={excludedLayers}
        onExcludedLayersChange={onExcludedLayersChange}
        disabled={disabled}
      />

      <div className="eco-filter-block">
        <button
          type="button"
          className={`eco-filter-block-toggle${faunaEnabled ? " is-on" : ""}`}
          disabled={disabled}
          aria-pressed={faunaEnabled}
          onClick={() => onFaunaEnabledChange(!faunaEnabled)}
        >
          <span className={`eco-dot${faunaEnabled ? " is-on" : ""}`} aria-hidden />
          <h3 className="eco-filter-block-title">Présence d&apos;espèce(s)</h3>
        </button>
        {faunaEnabled && (
          <div className="eco-filter-nested">
            <FaunaSpeciesPicker
              selectedSpecies={faunaSpecies}
              onChange={onFaunaSpeciesChange}
              disabled={disabled}
              compact
            />
            <div className="eco-aoi-slider" style={{ marginTop: "0.65rem" }}>
              <div className="eco-aoi-slider-head">
                <span className="eco-aoi-label">Distance max</span>
                <span className="eco-aoi-slider-value">{faunaDistM.toFixed(0)} m</span>
              </div>
              <input
                type="range"
                min={100}
                max={5000}
                step={100}
                value={faunaDistM}
                disabled={disabled}
                onChange={(e) => onFaunaDistMChange(Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
