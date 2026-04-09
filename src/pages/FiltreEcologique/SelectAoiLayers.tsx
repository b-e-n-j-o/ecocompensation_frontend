import type { LayerInfo } from "../../api";
import { isOptionalLayerKey, splitOptionalLayersByGroup } from "./aoiLayerKeys";
import "./SelectAoiLayers.css";

export interface SelectAoiLayersProps {
  layers: LayerInfo[];
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  /** Buffer AOI (km) : au-delà de 5 km, UF / sous-ensembles sont ignorés côté serveur. */
  bufferKm: number;
  ufEnabled: boolean;
  onUfEnabledChange: (value: boolean) => void;
  /** Nombre max de parcelles par UF pour sous-ensembles (5–10). */
  ufMaxParcelles: number;
  onUfMaxParcellesChange: (value: number) => void;
  /** Surface minimale UF (ha) pour garder une unité foncière au pré-filtre. */
  ufMinAreaHa: number;
  onUfMinAreaHaChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Couches optionnelles (cases) + bloc UF / unités foncières personnes morales (k).
 * Parcelles, GEOMCE : toujours incluses côté parent (pas listées ici).
 */
export function SelectAoiLayers({
  layers,
  selectedKeys,
  onSelectedKeysChange,
  bufferKm,
  ufEnabled,
  onUfEnabledChange,
  ufMaxParcelles,
  onUfMaxParcellesChange,
  ufMinAreaHa,
  onUfMinAreaHaChange,
  disabled = false,
}: SelectAoiLayersProps) {
  const optionalLayers = layers.filter((l) => isOptionalLayerKey(l.key));
  const grouped = splitOptionalLayersByGroup(optionalLayers);
  const selectedSet = new Set(selectedKeys);
  const allKeys = optionalLayers.map((l) => l.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
  const noneSelected = selectedKeys.length === 0;

  const ufBlockedByBuffer = bufferKm > 5;

  function toggleKey(key: string) {
    if (disabled) return;
    if (selectedSet.has(key)) {
      onSelectedKeysChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectedKeysChange([...selectedKeys, key]);
    }
  }

  function selectAll() {
    if (disabled) return;
    onSelectedKeysChange([...allKeys]);
  }

  function selectNone() {
    if (disabled) return;
    onSelectedKeysChange([]);
  }

  return (
    <div className="select-aoi-layers">
      <div className="section-header">
        <span className="section-title">Couches à récupérer</span>
      </div>
      <p className="select-aoi-layers__hint">Cochez les jeux de données à charger (parcelles cadastrales et mesures GEOMCE sont toujours incluses).</p>

      <div className="select-aoi-layers__toolbar">
        <button type="button" onClick={selectAll} disabled={disabled || allSelected}>
          Tout sélectionner
        </button>
        <button type="button" onClick={selectNone} disabled={disabled || noneSelected}>
          Tout désélectionner
        </button>
      </div>

      <div className="select-aoi-layers__group">
        <div className="select-aoi-layers__group-title">Couches primaires (cochées par défaut)</div>
        <div className="select-aoi-layers__list" role="list">
          {grouped.primary.map((layer) => {
            const checked = selectedSet.has(layer.key);
            return (
              <label key={layer.key} className="select-aoi-layers__row">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleKey(layer.key)}
                />
                <span className="select-aoi-layers__row-label">{layer.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="select-aoi-layers__group">
        <div className="select-aoi-layers__group-title">Couches secondaires (décochées par défaut)</div>
        <div className="select-aoi-layers__list" role="list">
          {grouped.secondary.map((layer) => {
            const checked = selectedSet.has(layer.key);
            return (
              <label key={layer.key} className="select-aoi-layers__row">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleKey(layer.key)}
                />
                <span className="select-aoi-layers__row-label">{layer.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className={`select-aoi-layers__uf-block ${ufBlockedByBuffer ? "select-aoi-layers__uf-block--blocked" : ""}`}>
        <div className="select-aoi-layers__uf-title">Unités foncières (personnes morales)</div>
        <label className="select-aoi-layers__uf-row">
          <input
            type="checkbox"
            checked={ufEnabled && !ufBlockedByBuffer}
            disabled={disabled || ufBlockedByBuffer}
            onChange={(e) => onUfEnabledChange(e.target.checked)}
          />
          <span className="select-aoi-layers__row-label">
            Chercher parmi les unités foncières de personnes morales
          </span>
        </label>
        <div className="select-aoi-layers__uf-k">
          <label htmlFor="select-aoi-uf-k" className="select-aoi-layers__uf-k-label">
            k = {ufMaxParcelles}
          </label>
          <input
            id="select-aoi-uf-k"
            type="range"
            min={5}
            max={10}
            step={1}
            value={ufMaxParcelles}
            disabled={disabled || !ufEnabled || ufBlockedByBuffer}
            onChange={(e) => onUfMaxParcellesChange(Number(e.target.value))}
          />
          <span className="select-aoi-layers__uf-k-range">5 — 10</span>
        </div>

        <div className="select-aoi-layers__uf-min-area">
          <label htmlFor="select-aoi-uf-min-area" className="select-aoi-layers__uf-k-label">
            Surface minimale UF (ha)
          </label>
          <input
            id="select-aoi-uf-min-area"
            type="number"
            min={1}
            step={0.5}
            value={ufMinAreaHa}
            disabled={disabled || !ufEnabled || ufBlockedByBuffer}
            onChange={(e) => onUfMinAreaHaChange(Number(e.target.value) || 1)}
          />
        </div>
        <p className="select-aoi-layers__uf-help">
          Nombre maximal de parcelles par unité foncière prises en compte pour énumérer les combinaisons
          possibles de sous-ensembles de parcelles (contiguës). Des valeurs plus élevées augmentent fortement
          le coût de calcul.
        </p>
        {ufBlockedByBuffer && (
          <p className="select-aoi-layers__uf-buffer-warn">
            Buffer AOI &gt; 5 km : les unités foncières et sous-ensembles ne sont pas calculés (serveur).
          </p>
        )}
      </div>
    </div>
  );
}
