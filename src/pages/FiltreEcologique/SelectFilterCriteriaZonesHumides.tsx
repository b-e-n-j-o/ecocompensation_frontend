import type { ZoneHumideMode } from "../../types";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { SelectNationalExclusions } from "./SelectNationalExclusions";

type Props = {
  minAreaHa: number;
  onMinAreaHaChange: (v: number) => void;
  minZoneHumideHa: number;
  onMinZoneHumideHaChange: (v: number) => void;
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
  { value: "intersect", label: "Doit intersecter" },
  { value: "exclude", label: "Ne doit pas intersecter" },
];

function ModeField({
  name,
  title,
  hint,
  value,
  onChange,
  disabled,
}: {
  name: string;
  title: string;
  hint: string;
  value: ZoneHumideMode;
  onChange: (v: ZoneHumideMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="eco-zh-fieldset" disabled={disabled}>
      <legend className="eco-aoi-label">{title}</legend>
      <p className="eco-aoi-intro" style={{ marginTop: 0 }}>
        {hint}
      </p>
      <div className="eco-zh-modes">
        {MODE_OPTIONS.map((opt) => (
          <label key={opt.value} className="eco-zh-mode">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SelectFilterCriteriaZonesHumides({
  minAreaHa,
  onMinAreaHaChange,
  minZoneHumideHa,
  onMinZoneHumideHaChange,
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
      <h2 className="eco-aoi-section-title">Critères zones humides</h2>
      <p className="eco-aoi-intro">
        Les parcelles candidates seront recherchées{" "}
        <strong>dans l&apos;union des bassins versants (masses d&apos;eau) intersectant votre zone initiale</strong>
        {" "}(entités BV complètes, pas seulement la zone de recouvrement).
        Les couches zones humides sont chargées automatiquement avant le filtrage.
      </p>

      <div className="eco-aoi-slider">
        <div className="eco-aoi-slider-head">
          <span className="eco-aoi-label">Surface minimale parcelle</span>
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
        <p className="eco-aoi-slider-caption">
          Surface cadastrale totale de la parcelle (emprise pure).
        </p>
      </div>

      <div className="eco-aoi-slider">
        <div className="eco-aoi-slider-head">
          <span className="eco-aoi-label">Zones humides (RPDZH) — surface min. sur parcelle</span>
          <span className="eco-aoi-slider-value">
            {minZoneHumideHa <= 0 ? "Critère ignoré" : `${minZoneHumideHa.toFixed(2)} ha`}
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
        <p className="eco-aoi-slider-caption">
          Filtre sur{" "}
          <code style={{ fontSize: "0.85em" }}>ecocompensation_results.zone_humide</code>.
          {" "}0 = pas de filtre ZH établies ; au-delà de 0, la parcelle est retenue si la somme des
          intersections parcelle ∩ zone humide atteint ce seuil (ha).
        </p>
      </div>

      <div className="eco-aoi-slider">
        <div className="eco-aoi-slider-head">
          <span className="eco-aoi-label">Indice de Miller (forme)</span>
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

      <ModeField
        name="zones-humides-probables-mode"
        title="Zones humides probables"
        hint="Filtre sur ecocompensation_results.zones_humides_probables."
        value={zonesHumidesProbablesMode}
        onChange={onZonesHumidesProbablesModeChange}
        disabled={disabled}
      />

      <div className="eco-filter-block">
        <label className="eco-filter-check">
          <input
            type="checkbox"
            checked={tronconsHydroEnabled}
            disabled={disabled}
            onChange={(e) => onTronconsHydroEnabledChange(e.target.checked)}
          />
          <span>Proximité d&apos;un cours d&apos;eau (tronçons hydro BD TOPO)</span>
        </label>
        {tronconsHydroEnabled && (
          <div className="eco-filter-fauna-detail">
            <div className="eco-aoi-slider" style={{ marginTop: "0.75rem" }}>
              <div className="eco-aoi-slider-head">
                <span className="eco-aoi-label">Distance max au cours d&apos;eau</span>
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
              <p className="eco-aoi-slider-caption">
                Parcelles retenues si elles intersectent un tronçon ou en ont un à ≤ cette distance
                (<code style={{ fontSize: "0.85em" }}>ecocompensation.troncons_hydros</code>).
                0 m = intersection directe uniquement.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="eco-filter-block">
        <label className="eco-filter-check">
          <input
            type="checkbox"
            checked={surfacesHydroEnabled}
            disabled={disabled}
            onChange={(e) => onSurfacesHydroEnabledChange(e.target.checked)}
          />
          <span>Proximité d&apos;une surface hydrographique (plans d&apos;eau, étangs…)</span>
        </label>
        {surfacesHydroEnabled && (
          <div className="eco-filter-fauna-detail">
            <div className="eco-aoi-slider" style={{ marginTop: "0.75rem" }}>
              <div className="eco-aoi-slider-head">
                <span className="eco-aoi-label">Distance max à la surface hydro</span>
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
              <p className="eco-aoi-slider-caption">
                Parcelles retenues si elles intersectent une surface ou en ont une à ≤ cette distance
                (<code style={{ fontSize: "0.85em" }}>ecocompensation.surfaces_hydros</code>).
                La surface intersectée (ha) est calculée en enrichissement.
              </p>
            </div>
          </div>
        )}
      </div>

      <SelectNationalExclusions
        excludedLayers={excludedLayers}
        onExcludedLayersChange={onExcludedLayersChange}
        disabled={disabled}
      />

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
