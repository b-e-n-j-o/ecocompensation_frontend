import { useState } from "react";
import { FilterPanel } from "./components/FilterPanel/FilterPanel";
import { FunnelDisplay } from "./components/FunnelDisplay";
import { RankingTable } from "./components/RankingTable";
import { ParcellesMap } from "./components/ParcellesMap";
import type { ParcellesGeoJSON } from "./components/ParcellesMap";
import { runFilter, exportShp, exportCsv, fetchParcellesGeojson } from "./api";
import type { FilterOptions, FilterResponse } from "./types";
import "./App.css";
import "./components/FilterPanel/filter-panel.css";
import "./components/results.css";

// Remplace par l'ID réel du projet (récupéré depuis l'URL ou le contexte)
const PROJECT_ID = "54987c59-ad94-46b2-9f20-aa679dbcf3a1";

type ResultsView = "classement" | "carte";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [exportingShp, setExportingShp] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [results, setResults] = useState<FilterResponse | null>(null);
  const [geojson, setGeojson] = useState<ParcellesGeoJSON | null>(null);
  const [resultsView, setResultsView] = useState<ResultsView>("classement");
  const [scrollToIdu, setScrollToIdu] = useState<string | null>(null);

  async function handleSubmit(opts: FilterOptions) {
    setLoading(true);
    setGeojson(null);
    try {
      const data = await runFilter(PROJECT_ID, opts);
      setResults(data);
      const geo = await fetchParcellesGeojson(PROJECT_ID);
      setGeojson(geo as ParcellesGeoJSON);
    } catch (err) {
      console.error("Erreur filtre:", err);
      alert("Erreur lors du filtrage. Voir console.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportShp() {
    if (!results) return;
    setExportingShp(true);
    try {
      await exportShp(PROJECT_ID);
    } catch (err) {
      console.error("Erreur export SHP:", err);
      alert("Erreur lors de l'export SHP. Voir console.");
    } finally {
      setExportingShp(false);
    }
  }

  function handleParcelleDoubleClickFromMap(idu: string) {
    setResultsView("classement");
    setScrollToIdu(idu);
  }

  async function handleExportCsv() {
    if (!results) return;
    setExportingCsv(true);
    try {
      await exportCsv(PROJECT_ID);
    } catch (err) {
      console.error("Erreur export CSV:", err);
      alert("Erreur lors de l'export CSV. Voir console.");
    } finally {
      setExportingCsv(false);
    }
  }

  return (
    <div className="app-layout">
      <FilterPanel onSubmit={handleSubmit} isLoading={loading} />
      <main className="results-panel">
        {results ? (
          <>
            {results.funnel && (
              <FunnelDisplay
                steps={results.funnel}
                finalRadiusKm={results.final_radius_km}
                total={results.total}
              />
            )}
            <div className="results-header">
              <h2 className="results-title">Résultats ({results.total} parcelles)</h2>
              <div className="export-buttons">
                <button
                  className="btn-export btn-export-csv"
                  onClick={handleExportCsv}
                  disabled={exportingCsv || !results}
                  title="Télécharger le CSV"
                >
                  {exportingCsv ? "⏳" : "📊"} CSV
                </button>
                <button
                  className="btn-export btn-export-shp"
                  onClick={handleExportShp}
                  disabled={exportingShp || !results}
                  title="Télécharger le Shapefile"
                >
                  {exportingShp ? "⏳" : "📥"} SHP
                </button>
              </div>
            </div>
            <div className="results-tabs">
              <button
                type="button"
                className={`results-tab ${resultsView === "classement" ? "active" : ""}`}
                onClick={() => setResultsView("classement")}
              >
                Classement
              </button>
              <button
                type="button"
                className={`results-tab ${resultsView === "carte" ? "active" : ""}`}
                onClick={() => {
                  setResultsView("carte");
                  setScrollToIdu(null);
                }}
              >
                Carte
              </button>
            </div>
            <div className="results-content">
              {resultsView === "classement" && (
                <RankingTable
                  parcelles={results.parcelles}
                  scrollToIdu={scrollToIdu}
                  selectedIdu={scrollToIdu}
                />
              )}
              {resultsView === "carte" && geojson && (
                <ParcellesMap
                  geojson={geojson}
                  onParcelleDoubleClick={handleParcelleDoubleClickFromMap}
                />
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">⬡</span>
            <span className="empty-text">Configurez et lancez le filtre</span>
          </div>
        )}
      </main>
    </div>
  );
}