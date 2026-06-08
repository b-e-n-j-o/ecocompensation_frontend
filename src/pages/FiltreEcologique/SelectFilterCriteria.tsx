import { CESBIO_LIBELLES } from "../../types";
import type { CesbioLibelle } from "../../types";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";

export type FaunaFilterCriterion = {
  species: string;
  dist_m: number;
};

type Props = {
  minAreaHa: number;
  onMinAreaHaChange: (v: number) => void;
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
  disabled?: boolean;
};

export function SelectFilterCriteria({
  minAreaHa,
  onMinAreaHaChange,
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
      <h2 className="eco-aoi-section-title">Critères de filtrage</h2>
      <p className="eco-aoi-intro">
        Sélectionnez les critères écologiques. Aucune couche SIG n&apos;est récupérée —
        le filtrage s&apos;applique directement sur les sources nationales.
      </p>

      <div className="eco-aoi-slider">
        <div className="eco-aoi-slider-head">
          <span className="eco-aoi-label">Surface minimale</span>
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

      <div className="eco-aoi-slider">
        <div className="eco-aoi-slider-head">
          <span className="eco-aoi-label">Indice de Miller (compacité)</span>
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

      <div className="eco-filter-block">
        <h3 className="eco-filter-block-title">Végétation CESBIO</h3>
        <p className="eco-aoi-slider-caption">
          Parcelles intersectant au moins une des classes sélectionnées.
        </p>
        <div className="eco-filter-chips">
          {CESBIO_LIBELLES.map((lib) => {
            const active = cesbioLibelles.includes(lib);
            return (
              <button
                key={lib}
                type="button"
                className={`eco-filter-chip${active ? " eco-filter-chip--active" : ""}`}
                disabled={disabled}
                onClick={() => toggleCesbio(lib)}
              >
                {lib}
              </button>
            );
          })}
        </div>
      </div>

      <div className="eco-filter-block">
        <label className="eco-filter-check">
          <input
            type="checkbox"
            checked={faunaEnabled}
            disabled={disabled}
            onChange={(e) => onFaunaEnabledChange(e.target.checked)}
          />
          <span>Filtrer par présence de faune (observations)</span>
        </label>

        {faunaEnabled && (
          <div className="eco-filter-fauna-detail">
            <FaunaSpeciesPicker
              selectedSpecies={faunaSpecies}
              onChange={onFaunaSpeciesChange}
              disabled={disabled}
            />
            <div className="eco-aoi-slider" style={{ marginTop: "0.75rem" }}>
              <div className="eco-aoi-slider-head">
                <span className="eco-aoi-label">Distance max à l&apos;observation</span>
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
