import {
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
      <h3 className="eco-filter-block-title">Couches d&apos;exclusion</h3>
      <ul className="eco-layer-list">
        {NATIONAL_EXCLUSION_LAYERS.map((layer) => {
          const on = excludedLayers.includes(layer.key);
          return (
            <li key={layer.key}>
              <button
                type="button"
                className={`eco-layer-row${on ? " is-on" : ""}`}
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggle(layer.key)}
              >
                <span className={`eco-dot${on ? " is-on" : ""}`} aria-hidden />
                <span className="eco-layer-row__text">
                  <span className="eco-layer-row__label">{layer.label}</span>
                  <span className="eco-layer-row__meta">{layer.table}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { DEFAULT_EXCLUDED_LAYERS } from "../../constants/nationalExclusionLayers";
