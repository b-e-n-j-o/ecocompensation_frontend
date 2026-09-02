import { CESBIO_LIBELLES, CESBIO_LIBELLE_COLORS } from "../../types";
import type { CesbioLibelle } from "../../types";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { SelectNationalExclusions } from "./SelectNationalExclusions";

export type FaunaFilterCriterion = {
  species: string;
  dist_m: number;
};

type Props = {
  minAreaHa: number;
  onMinAreaHaChange: (v: number) => void;
  millerEnabled: boolean;
  onMillerEnabledChange: (v: boolean) => void;
  millerThresh: number;
  onMillerThreshChange: (v: number) => void;
  cesbioLibelles: CesbioLibelle[];
  onCesbioLibellesChange: (v: CesbioLibelle[]) => void;
  faunaEnabled: boolean;
  onFaunaEnabledChange: (v: boolean) => void;
  faunaSpecies: string[];
  onFaunaSpeciesChange: (v: string[]) => void;
  faunaDistM: number;
  onFaunaDistMChange: (v: number) => void;
  excludedLayers: string[];
  onExcludedLayersChange: (v: string[]) => void;
  disabled?: boolean;
};

export function SelectFilterCriteria({
  minAreaHa,
  onMinAreaHaChange,
  millerEnabled,
  onMillerEnabledChange,
  millerThresh,
  onMillerThreshChange,
  cesbioLibelles,
  onCesbioLibellesChange,
  faunaEnabled,
  onFaunaEnabledChange,
  faunaSpecies,
  onFaunaSpeciesChange,
  faunaDistM,
  onFaunaDistMChange,
  excludedLayers,
  onExcludedLayersChange,
  disabled = false,
}: Props) {
  function toggleCesbio(lib: CesbioLibelle) {
    onCesbioLibellesChange(
      cesbioLibelles.includes(lib)
        ? cesbioLibelles.filter((x) => x !== lib)
        : [...cesbioLibelles, lib],
    );
  }

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
            onChange={(e) => onMinAreaHaChange(Number(e.target.value))}
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
              max={0.9}
              step={0.01}
              value={millerThresh}
              disabled={disabled}
              onChange={(e) => onMillerThreshChange(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="eco-filter-block">
        <h3 className="eco-filter-block-title">Occupation du sol</h3>
        <ul className="eco-layer-list eco-layer-list--classes">
          {CESBIO_LIBELLES.map((lib) => {
            const on = cesbioLibelles.includes(lib);
            const color = CESBIO_LIBELLE_COLORS[lib] ?? "#9e9e9e";
            return (
              <li key={lib}>
                <button
                  type="button"
                  className={`eco-layer-row eco-layer-row--class${on ? " is-on" : ""}`}
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => toggleCesbio(lib)}
                >
                  <span
                    className={`eco-dot${on ? " is-on" : ""}`}
                    style={{ background: on ? color : "transparent", borderColor: color }}
                    aria-hidden
                  />
                  <span className="eco-layer-row__label">{lib}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

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

      <SelectNationalExclusions
        excludedLayers={excludedLayers}
        onExcludedLayersChange={onExcludedLayersChange}
        disabled={disabled}
      />
    </div>
  );
}
