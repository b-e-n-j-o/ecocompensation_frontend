import {
  DEFAULT_EXCLUDED_LAYERS,
  NATIONAL_EXCLUSION_LAYERS,
  type NationalExclusionKey,
} from "../../constants/nationalExclusionLayers";

type Props = {
  excludedLayers: string[];
  onExcludedLayersChange: (v: string[]) => void;
  disabled?: boolean;
};

export function SelectNationalExclusions({
  excludedLayers,
  onExcludedLayersChange,
  disabled = false,
}: Props) {
  function toggle(key: NationalExclusionKey) {
    if (excludedLayers.includes(key)) {
      onExcludedLayersChange(excludedLayers.filter((k) => k !== key));
    } else {
      onExcludedLayersChange([...excludedLayers, key]);
    }
  }

  return (
    <div className="eco-filter-block">
      <h3 className="eco-filter-block-title">Exclusions automatiques</h3>
      <p className="eco-aoi-slider-caption">
        Parcelles intersectant une couche cochée seront éliminées. Toutes les couches sont
        activées par défaut.
      </p>
      <div className="eco-national-exclusions">
        {NATIONAL_EXCLUSION_LAYERS.map((layer) => {
          const active = excludedLayers.includes(layer.key);
          return (
            <label key={layer.key} className="eco-filter-check eco-national-exclusion-item">
              <input
                type="checkbox"
                checked={active}
                disabled={disabled}
                onChange={() => toggle(layer.key)}
              />
              <span className="eco-national-exclusion-text">
                <strong>{layer.label}</strong>
                <span className="eco-aoi-slider-caption" style={{ margin: 0 }}>
                  {layer.hint}
                </span>
                <code style={{ fontSize: "0.8em", opacity: 0.85 }}>{layer.table}</code>
              </span>
            </label>
          );
        })}
      </div>
      {!disabled && excludedLayers.length === 0 && (
        <p className="eco-aoi-slider-caption" style={{ color: "#b45309" }}>
          Aucune exclusion active — les parcelles ne seront pas filtrées sur ces couches.
        </p>
      )}
    </div>
  );
}

export { DEFAULT_EXCLUDED_LAYERS };
