import {
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  clampRadiusKm,
  escapeHtml,
  formatBbox,
  formatPoint,
  formatRadiusKm,
} from "./faunaMapShared";
import type { FaunaQueryApi } from "./useFaunaQuery";

type Props = {
  fauna: FaunaQueryApi;
  showShapefile?: boolean;
  compact?: boolean;
};

export default function FaunaQueryPanel({ fauna, showShapefile = true, compact = false }: Props) {
  const {
    searchMode,
    setSearchMode,
    searchText,
    setSearchText,
    catalogLoading,
    catalogError,
    speciesCatalog,
    highlightIdx,
    selected,
    extentKind,
    dateMin,
    setDateMin,
    dateMax,
    setDateMax,
    status,
    statusError,
    loadBusy,
    exportBusy,
    canExport,
    shpImportBusy,
    shpImportNote,
    shpImportNoteErr,
    drawActive,
    drawTool,
    hasDraftRect,
    validatedBbox,
    searchPoint,
    radiusKm,
    setRadiusKm,
    allSpeciesEntries,
    allSpeciesFilterText,
    setAllSpeciesFilterText,
    allSpeciesStats,
    filteredAllSpeciesList,
    dropdownOpen,
    hasQuery,
    showPanelContent,
    filteredSuggestions,
    searchInputRef,
    searchWrapRef,
    shpZipInputRef,
    addSpecies,
    removeSpecies,
    setSpeciesBuffer,
    onSearchKeyDown,
    onSelectExtent,
    startDrawZone,
    startPlacePoint,
    resetDrawZone,
    validateDrawBbox,
    loadObservations,
    loadAllSpeciesInZone,
    exportObservationsShp,
    clearMap,
    toggleAllSpeciesVisible,
    setAllSpeciesVisibleBulk,
    onShpZipSelected,
    clearUserShpImport,
    clearBlurTimer,
    scheduleCloseDropdown,
    setSearchFocused,
  } = fauna;

  const extentDrawPanel = (
    <>
      {(extentKind === "bbox" || searchMode === "all_bbox") && extentKind !== "point" && (
        <>
          <div className="fauna-map-draw-actions">
            <button
              type="button"
              className={drawActive && drawTool === "bbox" ? "primary" : "ghost"}
              disabled={drawActive && drawTool === "bbox"}
              onClick={startDrawZone}
            >
              {drawActive && drawTool === "bbox" ? "Tracé en cours…" : "Tracer le rectangle"}
            </button>
            <button type="button" className="ghost" onClick={() => resetDrawZone(true)}>
              Effacer
            </button>
          </div>
          {hasDraftRect && !validatedBbox && !drawActive && (
            <button type="button" className="primary" onClick={validateDrawBbox}>
              Valider BBOX
            </button>
          )}
          {validatedBbox && (
            <div className="fauna-map-bbox-validated">
              <span className="fauna-map-bbox-label">BBOX validée</span>
              <span className="fauna-map-bbox-coords">{formatBbox(validatedBbox)}</span>
            </div>
          )}
        </>
      )}

      {extentKind === "point" && (
        <>
          <div className="fauna-map-draw-actions">
            <button
              type="button"
              className={drawActive && drawTool === "point" ? "primary" : "ghost"}
              disabled={drawActive && drawTool === "point"}
              onClick={startPlacePoint}
            >
              {drawActive && drawTool === "point" ? "Clique sur la carte…" : "Placer un point"}
            </button>
            <button type="button" className="ghost" onClick={() => resetDrawZone(true)}>
              Effacer
            </button>
          </div>
          <label htmlFor="fauna-radius-km">Rayon</label>
          <div className="fauna-map-range-wrap">
            <input
              id="fauna-radius-km"
              type="range"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(clampRadiusKm(parseFloat(e.target.value)))}
            />
            <span className="fauna-map-range-val">{formatRadiusKm(radiusKm)}</span>
          </div>
          <div className="fauna-map-row">
            <input
              type="number"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(clampRadiusKm(parseFloat(e.target.value)))}
              aria-label="Rayon en kilomètres"
            />
            <span className="fauna-map-range-val">km</span>
          </div>
          {searchPoint && (
            <div className="fauna-map-bbox-validated fauna-map-bbox-validated--point">
              <span className="fauna-map-bbox-label">Point + rayon</span>
              <span className="fauna-map-bbox-coords">
                {formatPoint(searchPoint)} · {formatRadiusKm(radiusKm)}
              </span>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className={`fauna-query-panel${compact ? " is-compact" : ""}`}>
      {!compact && (
        <div className="fauna-map-sidebar-head">
          <h1>Cartographie Faune</h1>
        </div>
      )}

      <div className="fauna-map-section">
        <div className="fauna-map-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "species"}
            className={`fauna-map-tab${searchMode === "species" ? " fauna-map-tab--active" : ""}`}
            onClick={() => setSearchMode("species")}
          >
            Par espèce
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "all_bbox"}
            className={`fauna-map-tab${searchMode === "all_bbox" ? " fauna-map-tab--active" : ""}`}
            onClick={() => setSearchMode("all_bbox")}
          >
            Toutes espèces (zone)
          </button>
        </div>
      </div>

      {searchMode === "species" ? (
        <>
          <div className="fauna-map-section fauna-map-section--accent">
            <label htmlFor="fauna-search">Espèce</label>
            <div ref={searchWrapRef} className="fauna-map-search-wrap">
              <input
                ref={searchInputRef}
                id="fauna-search"
                type="text"
                placeholder="Rechercher…"
                autoComplete="off"
                role="combobox"
                aria-expanded={dropdownOpen}
                aria-controls="fauna-species-listbox"
                aria-autocomplete="list"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={onSearchKeyDown}
                onFocus={() => {
                  clearBlurTimer();
                  setSearchFocused(true);
                }}
                onBlur={scheduleCloseDropdown}
              />
              <div
                id="fauna-species-listbox"
                role="listbox"
                className={`fauna-map-suggestions${dropdownOpen && showPanelContent ? " open" : ""}`}
              >
                {catalogLoading && (
                  <div className="fauna-map-suggestion muted" role="presentation">
                    Chargement du catalogue…
                  </div>
                )}
                {!catalogLoading && catalogError && (
                  <div className="fauna-map-suggestion muted error" role="alert">
                    {escapeHtml(catalogError)}
                  </div>
                )}
                {!catalogLoading && !catalogError && speciesCatalog.length === 0 && (
                  <div className="fauna-map-suggestion muted" role="presentation">
                    Aucune espèce disponible.
                  </div>
                )}
                {!catalogLoading &&
                  !catalogError &&
                  speciesCatalog.length > 0 &&
                  hasQuery &&
                  filteredSuggestions.length === 0 && (
                    <div className="fauna-map-suggestion muted" role="presentation">
                      Aucune espèce ne correspond à « {escapeHtml(searchText.trim())} ».
                    </div>
                  )}
                {!catalogLoading &&
                  !catalogError &&
                  filteredSuggestions.map((s, i) => (
                    <div
                      key={s.tax}
                      role="option"
                      aria-selected={i === highlightIdx}
                      className={`fauna-map-suggestion${i === highlightIdx ? " active" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addSpecies(s)}
                    >
                      {escapeHtml(s.tax)}{" "}
                      <span className="sub">
                        {escapeHtml(s.protection_nationale ?? "")} · {escapeHtml(s.niveau_patrimonialite ?? "")}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {selected.size > 0 && (
              <div className="fauna-map-chips">
                {[...selected.entries()].map(([tax, info]) => (
                  <div key={tax} className="fauna-map-chip-row">
                    <span className="fauna-map-chip-main fauna-map-chip">
                      <span className="swatch" style={{ background: info.color }} />
                      {escapeHtml(info.label)}
                      <button type="button" title="Retirer" onClick={() => removeSpecies(tax)}>
                        ×
                      </button>
                    </span>
                    <label className="fauna-map-chip-buffer">
                      Buffer
                      <input
                        type="number"
                        min={0}
                        max={50000}
                        step={50}
                        value={info.bufferM}
                        onChange={(e) => setSpeciesBuffer(tax, parseInt(e.target.value, 10) || 0)}
                      />
                      m
                    </label>
                    <input
                      type="range"
                      className="fauna-map-chip-buffer-range"
                      min={0}
                      max={5000}
                      step={50}
                      value={Math.min(info.bufferM, 5000)}
                      onChange={(e) => setSpeciesBuffer(tax, parseInt(e.target.value, 10))}
                      aria-label={`Buffer ${info.label} en mètres`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="fauna-map-section">
            <span>Emprise</span>
            <label className="fauna-map-check-row">
              <input
                type="radio"
                name="fauna-extent"
                checked={extentKind === "viewport"}
                onChange={() => onSelectExtent("viewport")}
              />
              <span>Vue de la carte</span>
            </label>
            <label className="fauna-map-check-row">
              <input
                type="radio"
                name="fauna-extent"
                checked={extentKind === "bbox"}
                onChange={() => onSelectExtent("bbox")}
              />
              <span>Rectangle tracé (bbox)</span>
            </label>
            <label className="fauna-map-check-row">
              <input
                type="radio"
                name="fauna-extent"
                checked={extentKind === "point"}
                onChange={() => onSelectExtent("point")}
              />
              <span>Point + rayon (km)</span>
            </label>
            <label className="fauna-map-check-row">
              <input
                type="radio"
                name="fauna-extent"
                checked={extentKind === "none"}
                onChange={() => onSelectExtent("none")}
              />
              <span>Toute l&apos;espèce (sans filtre spatial)</span>
            </label>
            {extentDrawPanel}
          </div>
        </>
      ) : (
        <div className="fauna-map-section fauna-map-section--accent">
          <span>Zone de recherche</span>
          <label className="fauna-map-check-row">
            <input
              type="radio"
              name="fauna-extent-all"
              checked={extentKind === "bbox"}
              onChange={() => onSelectExtent("bbox")}
            />
            <span>Rectangle tracé (bbox)</span>
          </label>
          <label className="fauna-map-check-row">
            <input
              type="radio"
              name="fauna-extent-all"
              checked={extentKind === "point"}
              onChange={() => onSelectExtent("point")}
            />
            <span>Point + rayon (km)</span>
          </label>

          {extentDrawPanel}

          <button
            type="button"
            className="primary"
            disabled={loadBusy || (extentKind === "point" ? !searchPoint : !validatedBbox)}
            onClick={() => void loadAllSpeciesInZone()}
          >
            Charger toutes les espèces
          </button>

          {allSpeciesEntries.size > 0 && (
            <>
              <div className="fauna-map-stats">
                <div className="fauna-map-stat">
                  <span className="fauna-map-stat-value">{allSpeciesStats.totalObs.toLocaleString("fr-FR")}</span>
                  <span className="fauna-map-stat-label">Observations</span>
                </div>
                <div className="fauna-map-stat">
                  <span className="fauna-map-stat-value">{allSpeciesStats.distinctSpecies.toLocaleString("fr-FR")}</span>
                  <span className="fauna-map-stat-label">Espèces distinctes</span>
                </div>
                <div className="fauna-map-stat">
                  <span className="fauna-map-stat-value">{allSpeciesStats.visibleObs.toLocaleString("fr-FR")}</span>
                  <span className="fauna-map-stat-label">Affichées</span>
                </div>
              </div>

              <div className="fauna-map-species-filter">
                <div className="fauna-map-species-filter-head">
                  <span>Filtrer par espèce</span>
                  <div className="fauna-map-species-filter-bulk">
                    <button type="button" className="ghost" onClick={() => setAllSpeciesVisibleBulk(true)}>
                      Tout cocher
                    </button>
                    <button type="button" className="ghost" onClick={() => setAllSpeciesVisibleBulk(false)}>
                      Tout décocher
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  className="fauna-map-species-filter-search"
                  placeholder="Rechercher une espèce…"
                  value={allSpeciesFilterText}
                  onChange={(e) => setAllSpeciesFilterText(e.target.value)}
                />
                <div className="fauna-map-species-filter-list" role="list">
                  {filteredAllSpeciesList.map((entry) => (
                    <label key={entry.name} className="fauna-map-species-filter-row" role="listitem">
                      <input
                        type="checkbox"
                        checked={entry.visible}
                        onChange={(e) => toggleAllSpeciesVisible(entry.name, e.target.checked)}
                      />
                      <span className="swatch" style={{ background: entry.color }} />
                      <span className="fauna-map-species-filter-name">{escapeHtml(entry.name)}</span>
                      <span className="fauna-map-species-filter-count">{entry.count}</span>
                    </label>
                  ))}
                  {filteredAllSpeciesList.length === 0 && (
                    <div className="fauna-map-species-filter-empty">Aucune espèce ne correspond.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="fauna-map-section">
        <span>Période (optionnel)</span>
        <div className="fauna-map-row">
          <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} />
          <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} />
        </div>
      </div>

      {showShapefile && (
        <div className="fauna-map-section">
          <span>Shapefile</span>
          <input
            ref={shpZipInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            aria-label="Choisir un fichier ZIP contenant un shapefile"
            onChange={(e) => void onShpZipSelected(e)}
          />
          <div className="fauna-map-row fauna-map-shp-actions">
            <button
              type="button"
              className="ghost"
              disabled={shpImportBusy}
              onClick={() => shpZipInputRef.current?.click()}
            >
              {shpImportBusy ? "Lecture du ZIP…" : "Importer un shapefile"}
            </button>
            <button type="button" className="ghost" onClick={clearUserShpImport}>
              Retirer
            </button>
          </div>
          {shpImportNote ? (
            <div className={`fauna-map-status fauna-map-shp-note${shpImportNoteErr ? " error" : ""}`}>
              {shpImportNote}
            </div>
          ) : null}
        </div>
      )}

      <div className="fauna-map-section">
        <div className="fauna-map-actions">
          {searchMode === "species" && (
            <button
              type="button"
              className="primary"
              disabled={
                loadBusy ||
                selected.size === 0 ||
                (extentKind === "bbox" && !validatedBbox) ||
                (extentKind === "point" && !searchPoint)
              }
              onClick={() => void loadObservations()}
            >
              Charger les observations
            </button>
          )}
          <button
            type="button"
            className="ghost"
            disabled={!canExport || exportBusy}
            onClick={() => void exportObservationsShp()}
            title="Télécharge un ZIP shapefile avec tous les attributs de la table fauna"
          >
            {exportBusy ? "Export…" : "Exporter (ZIP)"}
          </button>
          <button type="button" className="ghost" onClick={clearMap}>
            Effacer
          </button>
        </div>
        {status ? <div className={`fauna-map-status${statusError ? " error" : ""}`}>{status}</div> : null}
      </div>
    </div>
  );
}
