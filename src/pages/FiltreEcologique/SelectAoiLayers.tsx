import type { LayerInfo } from "../../api";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { FAUNA_LAYER_KEY, isOptionalLayerKey, splitOptionalLayersByGroup } from "./aoiLayerKeys";
import "./SelectAoiLayers.css";

export interface SelectAoiLayersProps {
  layers: LayerInfo[];
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  /** Buffer AOI (km), conservé pour affichage/compatibilité. */
  bufferKm: number;
  ufEnabled: boolean;
  onUfEnabledChange: (value: boolean) => void;
  ufMaxParcelles: number;
  onUfMaxParcellesChange: (value: number) => void;
  ufMinAreaHa: number;
  onUfMinAreaHaChange: (value: number) => void;
  faunaSpecies: string[];
  onFaunaSpeciesChange: (species: string[]) => void;
  disabled?: boolean;
}

/**
 * Couches optionnelles (interrupteurs) + bloc UF.
 * Parcelles, GEOMCE : toujours incluses côté parent.
 */
export function SelectAoiLayers({
  layers,
  selectedKeys,
  onSelectedKeysChange,
  bufferKm: _bufferKm,
  ufEnabled,
  onUfEnabledChange,
  ufMaxParcelles,
  onUfMaxParcellesChange,
  ufMinAreaHa,
  onUfMinAreaHaChange,
  faunaSpecies,
  onFaunaSpeciesChange,
  disabled = false,
}: SelectAoiLayersProps) {
  const optionalLayers = layers.filter((l) => isOptionalLayerKey(l.key));
  const faunaLayer = optionalLayers.find((l) => l.key === FAUNA_LAYER_KEY);
  const grouped = splitOptionalLayersByGroup(optionalLayers.filter((l) => l.key !== FAUNA_LAYER_KEY));
  const selectedSet = new Set(selectedKeys);
  const allKeys = optionalLayers.map((l) => l.key);
  const faunaSelected = selectedSet.has(FAUNA_LAYER_KEY);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
  const noneSelected = selectedKeys.length === 0;

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
      <p className="select-aoi-layers__hint">
        Activez les jeux de données à charger (parcelles cadastrales et mesures GEOMCE sont toujours incluses).
      </p>

      <div className="select-aoi-layers__toolbar">
        <button type="button" onClick={selectAll} disabled={disabled || allSelected}>
          Tout activer
        </button>
        <button type="button" onClick={selectNone} disabled={disabled || noneSelected}>
          Tout désactiver
        </button>
      </div>

      {faunaLayer && (
        <div className="select-aoi-layers__group">
          <div className="select-aoi-layers__group-title">Faune</div>
          <div className="select-aoi-layers__list" role="list">
            <ToggleSwitch
              id="layer-fauna"
              checked={faunaSelected}
              disabled={disabled}
              onChange={() => toggleKey(FAUNA_LAYER_KEY)}
              label={faunaLayer.label}
            />
          </div>
          <div
            className={`select-aoi-layers__fauna-picker ${!faunaSelected || disabled ? "select-aoi-layers__fauna-picker--disabled" : ""}`}
          >
            <FaunaSpeciesPicker
              selectedSpecies={faunaSpecies}
              onChange={onFaunaSpeciesChange}
              disabled={!faunaSelected || disabled}
            />
          </div>
          {faunaSelected && faunaSpecies.length === 0 && (
            <p className="select-aoi-layers__fauna-warn">
              Sélectionnez au moins une espèce pour lancer la couche Faune.
            </p>
          )}
        </div>
      )}

      <div className="select-aoi-layers__group">
        <div className="select-aoi-layers__group-title">Couches primaires (activées par défaut)</div>
        <div className="select-aoi-layers__list" role="list">
          {grouped.primary.map((layer) => (
            <ToggleSwitch
              key={layer.key}
              id={`layer-${layer.key}`}
              checked={selectedSet.has(layer.key)}
              disabled={disabled}
              onChange={() => toggleKey(layer.key)}
              label={layer.label}
            />
          ))}
        </div>
      </div>

      <div className="select-aoi-layers__group">
        <div className="select-aoi-layers__group-title">Couches secondaires (désactivées par défaut)</div>
        <div className="select-aoi-layers__list" role="list">
          {grouped.secondary.map((layer) => (
            <ToggleSwitch
              key={layer.key}
              id={`layer-${layer.key}`}
              checked={selectedSet.has(layer.key)}
              disabled={disabled}
              onChange={() => toggleKey(layer.key)}
              label={layer.label}
            />
          ))}
        </div>
      </div>

      <div className="select-aoi-layers__uf-block">
        <div className="select-aoi-layers__uf-title">Unités foncières (personnes morales)</div>
        <ToggleSwitch
          id="layer-uf"
          checked={ufEnabled}
          disabled={disabled}
          onChange={onUfEnabledChange}
          label="Chercher parmi les unités foncières de personnes morales"
        />
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
            disabled={disabled || !ufEnabled}
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
            disabled={disabled || !ufEnabled}
            onChange={(e) => onUfMinAreaHaChange(Number(e.target.value) || 1)}
          />
        </div>
        <p className="select-aoi-layers__uf-help">
          Nombre maximal de parcelles par unité foncière pour énumérer les sous-ensembles contigus.
          Des valeurs plus élevées augmentent fortement le coût de calcul.
        </p>
      </div>
    </div>
  );
}
