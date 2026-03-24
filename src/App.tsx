import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";

import { FilterPanel } from "./components/FilterPanel/FilterPanel";
import { FunnelDisplay } from "./components/FunnelDisplay";
import { RankingTable } from "./components/RankingTable";
import { UnitesFoncieresTable } from "./components/UnitesFoncieresTable";
import { ParcellesMap } from "./components/ParcellesMap";
import { SousEnsemblesMap } from "./components/SousEnsemblesMap";
import type { ParcellesGeoJSON } from "./components/ParcellesMap";
import {
  runFilter,
  runFilterUF,
  exportShp,
  exportCsv,
  fetchParcellesGeojson,
  fetchProjectContextGeometry,
  fetchFoncierGeojson,
  fetchUfSubsetsGeojson,
  fetchSousEnsemblesStatus,
} from "./api";
import type { FilterOptions, FilterResponse, UfFilterResponse } from "./types";
import { useFetchProgress } from "./hooks/useFetchProgress";
import { SkeletonResults } from "./components/SkeletonResults";
import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { ProjectContextMap } from "./components/ProjectContextMap";
import Bancarisation from "./pages/Bancarisation/page";
import AnalyseEcologiquePage from "./pages/AnalyseEcologique/page";

import "./App.css";
import "./components/FilterPanel/filter-panel.css";
import "./components/results.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/** Onglets principaux : Parcelles | Unités foncières */
type MainResultsTab = "parcelles" | "unites";
/** Sous-vues : entonnoir | tableau | carte */
type ResultsSubView = "entonnoir" | "classement" | "carte";

/** Présence de lignes dans ecocompensation_results.sous_ensembles pour le projet (filtre UF possible). */
type SousEnsemblesStatus = "idle" | "loading" | "yes" | "no";

/* =========================================================
   TON APPLICATION ACTUELLE (inchangée) devient une PAGE
   ========================================================= */

interface EcoCompensationAppProps {
  fixedProjectId?: string | null;
  onNavigateToCreate?: () => void;
}

function EcoCompensationApp({ fixedProjectId = null, onNavigateToCreate }: EcoCompensationAppProps) {
  const [projectId, setProjectId] = useState<string | null>(fixedProjectId);
  const [loading, setLoading] = useState(false);
  const [ufResults, setUfResults] = useState<UfFilterResponse | null>(null);
  const [ufGeojson, setUfGeojson] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [exportingShp, setExportingShp] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [results, setResults] = useState<FilterResponse | null>(null);
  const [geojson, setGeojson] = useState<ParcellesGeoJSON | null>(null);
  const [foncierGeojson, setFoncierGeojson] = useState<unknown | null>(null);
  const [mainResultsTab, setMainResultsTab] = useState<MainResultsTab>("parcelles");
  /** Sous-onglets Entonnoir / Classement / Carte pour Parcelles */
  const [parcelSubView, setParcelSubView] = useState<ResultsSubView>("classement");
  /** Sous-onglets Entonnoir / Classement / Carte pour Unités foncières */
  const [ufSubView, setUfSubView] = useState<ResultsSubView>("classement");
  const [scrollToIdu, setScrollToIdu] = useState<string | null>(null);
  const [distanceMaxKm, setDistanceMaxKm] = useState<number>(0);
  const [distanceCursorKm, setDistanceCursorKm] = useState<number>(0);
  const [sousEnsemblesStatus, setSousEnsemblesStatus] = useState<SousEnsemblesStatus>("idle");
  const [contextGeom, setContextGeom] = useState<Awaited<ReturnType<typeof fetchProjectContextGeometry>> | null>(null);
  const { connected, progress } = useFetchProgress(projectId ?? "");

  useEffect(() => {
    setProjectId(fixedProjectId ?? null);
  }, [fixedProjectId]);

  /** S’il existe des sous-ensembles en base pour ce projet, le filtre peut aussi appeler /filter/uf */
  useEffect(() => {
    if (!projectId) {
      setSousEnsemblesStatus("idle");
      return;
    }
    let cancelled = false;
    setSousEnsemblesStatus("loading");
    fetchSousEnsemblesStatus(projectId)
      .then((r) => {
        if (!cancelled) setSousEnsemblesStatus(r.has_sous_ensembles ? "yes" : "no");
      })
      .catch(() => {
        if (!cancelled) setSousEnsemblesStatus("no");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleProjectChange(newProjectId: string | null) {
    setProjectId(newProjectId);
    setResults(null);
    setUfResults(null);
    setUfGeojson(null);
    setGeojson(null);
    setFoncierGeojson(null);
    setScrollToIdu(null);
    setDistanceMaxKm(0);
    setDistanceCursorKm(0);
    setMainResultsTab("parcelles");
    setParcelSubView("classement");
    setUfSubView("classement");
    setContextGeom(null);
  }

  useEffect(() => {
    if (!projectId) {
      setContextGeom(null);
      return;
    }
    let cancelled = false;
    fetchProjectContextGeometry(projectId)
      .then((ctx) => {
        if (!cancelled) setContextGeom(ctx);
      })
      .catch(() => {
        if (!cancelled) setContextGeom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleSubmit(opts: FilterOptions) {
    if (!projectId) return;
    setLoading(true);
    setGeojson(null);
    setFoncierGeojson(null);
    setUfResults(null);
    setUfGeojson(null);
    try {
      let runUf = false;
      if (sousEnsemblesStatus === "yes") {
        runUf = true;
      } else if (sousEnsemblesStatus === "loading") {
        const st = await fetchSousEnsemblesStatus(projectId);
        runUf = st.has_sous_ensembles;
        setSousEnsemblesStatus(st.has_sous_ensembles ? "yes" : "no");
      }

      const data = await runFilter(projectId, opts);
      setResults(data);

      // GeoJSON seulement si des parcelles sont présentes
      if (data.parcelles?.length) {
        try {
          const geo = await fetchParcellesGeojson(projectId);
          setGeojson(geo as ParcellesGeoJSON);
        } catch (err) {
          console.warn("GeoJSON parcelles indisponible:", err);
          setGeojson(null);
        }
      }

      // Foncier : best-effort (peut être null si aucun foncier)
      try {
        const foncier = await fetchFoncierGeojson(projectId);
        setFoncierGeojson(foncier);
      } catch (err) {
        console.warn("GeoJSON foncier indisponible:", err);
      }

      if (runUf) {
        const uf = await runFilterUF(projectId, opts);
        const ufTyped = uf as UfFilterResponse;
        setUfResults(ufTyped);

        const hasSubsets = (ufTyped.unites_foncieres ?? []).some(
          (u) => (u.sous_ensembles ?? []).length > 0,
        );
        if (hasSubsets) {
          try {
            const ufGeo = await fetchUfSubsetsGeojson(projectId);
            setUfGeojson(ufGeo);
          } catch (err) {
            console.warn("GeoJSON UF indisponible:", err);
            setUfGeojson(null);
          }
        }
      }
    } catch (err) {
      console.error("Erreur filtre:", err);
      alert("Erreur lors du filtrage. Voir console.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExportShp() {
    if (!projectId) return;
    if (mainResultsTab === "parcelles" && !results) return;
    if (mainResultsTab === "unites" && !ufResults) return;
    setExportingShp(true);
    try {
      const scope = mainResultsTab === "unites" ? "uf" : "parcelles";
      await exportShp(projectId, scope);
    } catch (err) {
      console.error("Erreur export SHP:", err);
      alert(
        err instanceof Error ? err.message : "Erreur lors de l'export SHP. Voir console.",
      );
    } finally {
      setExportingShp(false);
    }
  }

  function handleParcelleDoubleClickFromMap(idu: string) {
    setMainResultsTab("parcelles");
    setParcelSubView("classement");
    setScrollToIdu(idu);
  }

  /** Scroll interne entonnoir (liste d’étapes longue) */
  const isEntonnoirScroll =
    (mainResultsTab === "parcelles" && parcelSubView === "entonnoir") ||
    (mainResultsTab === "unites" && ufSubView === "entonnoir");

  async function handleExportCsv() {
    if (!projectId) return;
    if (mainResultsTab === "parcelles" && !results) return;
    if (mainResultsTab === "unites" && !ufResults) return;
    setExportingCsv(true);
    try {
      const scope = mainResultsTab === "unites" ? "uf" : "parcelles";
      await exportCsv(projectId, scope);
    } catch (err) {
      console.error("Erreur export CSV:", err);
      alert(
        err instanceof Error ? err.message : "Erreur lors de l'export CSV. Voir console.",
      );
    } finally {
      setExportingCsv(false);
    }
  }

  const subsetScores = useMemo(() => {
    if (!ufResults) return null;
    const m: Record<string, number> = {};
    for (const uf of ufResults.unites_foncieres ?? []) {
      for (const ss of uf.sous_ensembles ?? []) {
        m[ss.subset_id] = ss.score;
      }
    }
    return m;
  }, [ufResults]);

  // Curseur distance : on adapte la borne max à la distance maximale observée
  // dans les parcelles retournées (donc "jusqu'au rayon de l'AOI" de facto).
  useEffect(() => {
    const parcelles = results?.parcelles ?? [];
    if (!parcelles.length) {
      setDistanceMaxKm(0);
      setDistanceCursorKm(0);
      return;
    }
    const maxVal = Math.max(
      0,
      ...parcelles.map((p) => (Number.isFinite(p.distance_km) ? p.distance_km : 0)),
    );
    const safeMax = Math.max(1, maxVal || 1);
    setDistanceMaxKm(safeMax);
    setDistanceCursorKm(safeMax); // par défaut : afficher toutes les parcelles retournées
  }, [results?.parcelles]);

  const displayedParcelles = useMemo(() => {
    if (!results?.parcelles?.length) return [];
    const cap = Math.max(1, distanceCursorKm);
    return results.parcelles.filter((p) => (p.distance_km ?? 0) <= cap);
  }, [results?.parcelles, distanceCursorKm]);

  return (
    <div className="app-layout">
      <FilterPanel
        projectId={projectId}
        onProjectChange={handleProjectChange}
        onSubmit={handleSubmit}
        onNavigateToCreate={onNavigateToCreate}
        isLoading={loading}
        disabled={!projectId}
      />

      <main className="results-panel">

        {!connected && (
          <div style={{ padding: 10, color: "#888" }}>
            Connexion au serveur...
          </div>
        )}

        {progress?.status === "fetching" && (
          <div style={{ padding: 10, color: "#f59e0b" }}>
            Récupération des données en cours...
          </div>
        )}

        {progress?.status === "ready" && (
          <div style={{ padding: 10, color: "#3ecf8e" }}>
            Données prêtes ✔
          </div>
        )}

        {loading && <SkeletonResults />}

        {results ? (
          <>
            <div className="results-header">
              <h2 className="results-title">
                {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && "Parcelles — entonnoir de filtre"}
                {mainResultsTab === "parcelles" && parcelSubView === "classement" &&
                  `Parcelles — classement (${displayedParcelles.length})`}
                {mainResultsTab === "parcelles" && parcelSubView === "carte" &&
                  `Parcelles — carte (${results.total})`}
                {mainResultsTab === "unites" && ufSubView === "entonnoir" &&
                  "Unités foncières — entonnoir de filtre"}
                {mainResultsTab === "unites" && ufSubView === "classement" &&
                  `Unités foncières — classement (${ufResults?.total_uf ?? 0})`}
                {mainResultsTab === "unites" && ufSubView === "carte" &&
                  `Unités foncières — carte (${ufResults?.total_uf ?? 0})`}
              </h2>
              <div className="export-buttons">
                {mainResultsTab === "parcelles" && parcelSubView === "classement" && (
                  <>
                    <button className="btn-export btn-export-csv" onClick={handleExportCsv}>
                      {exportingCsv ? "⏳" : "📊"} CSV parcelles
                    </button>
                    <button className="btn-export btn-export-shp" onClick={handleExportShp}>
                      {exportingShp ? "⏳" : "📥"} SHP parcelles
                    </button>
                  </>
                )}
                {mainResultsTab === "unites" &&
                  ufSubView === "classement" &&
                  sousEnsemblesStatus === "yes" &&
                  ufResults && (
                  <>
                    <button className="btn-export btn-export-csv" onClick={handleExportCsv}>
                      {exportingCsv ? "⏳" : "📊"} CSV UF
                    </button>
                    <button className="btn-export btn-export-shp" onClick={handleExportShp}>
                      {exportingShp ? "⏳" : "📥"} SHP UF
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Onglets principaux : Parcelles | Unités foncières */}
            <div className="results-tabs results-tabs-main">
              <button
                type="button"
                className={`results-tab ${mainResultsTab === "parcelles" ? "active" : ""}`}
                onClick={() => setMainResultsTab("parcelles")}
              >
                Parcelles
              </button>
              <button
                type="button"
                className={`results-tab ${mainResultsTab === "unites" ? "active" : ""}`}
                disabled={sousEnsemblesStatus !== "yes"}
                onClick={() => setMainResultsTab("unites")}
                title={
                  sousEnsemblesStatus === "no"
                    ? "Aucun sous-ensemble en base pour ce projet — générez la couche « sous-ensembles » en amont."
                    : sousEnsemblesStatus === "loading"
                      ? "Vérification des données UF…"
                      : !ufResults
                        ? "Lancez le filtre pour calculer les résultats UF."
                        : ""
                }
              >
                Unités foncières
              </button>
            </div>

            {/* Sous-onglets : Entonnoir | Classement | Carte */}
            {mainResultsTab === "parcelles" && (
              <div className="results-tabs results-tabs-sub">
                <button
                  type="button"
                  className={`results-tab ${parcelSubView === "entonnoir" ? "active" : ""}`}
                  onClick={() => setParcelSubView("entonnoir")}
                  disabled={!results.funnel?.length}
                  title={!results.funnel?.length ? "Aucun entonnoir disponible" : ""}
                >
                  Entonnoir
                </button>
                <button
                  type="button"
                  className={`results-tab ${parcelSubView === "classement" ? "active" : ""}`}
                  onClick={() => setParcelSubView("classement")}
                >
                  Classement
                </button>
                <button
                  type="button"
                  className={`results-tab ${parcelSubView === "carte" ? "active" : ""}`}
                  onClick={() => setParcelSubView("carte")}
                >
                  Carte
                </button>
              </div>
            )}
            {mainResultsTab === "unites" && sousEnsemblesStatus === "yes" && ufResults && (
              <div className="results-tabs results-tabs-sub">
                <button
                  type="button"
                  className={`results-tab ${ufSubView === "entonnoir" ? "active" : ""}`}
                  onClick={() => setUfSubView("entonnoir")}
                  disabled={!ufResults.funnel?.length}
                  title={!ufResults.funnel?.length ? "Aucun entonnoir disponible" : ""}
                >
                  Entonnoir
                </button>
                <button
                  type="button"
                  className={`results-tab ${ufSubView === "classement" ? "active" : ""}`}
                  onClick={() => setUfSubView("classement")}
                >
                  Classement
                </button>
                <button
                  type="button"
                  className={`results-tab ${ufSubView === "carte" ? "active" : ""}`}
                  onClick={() => setUfSubView("carte")}
                >
                  Carte
                </button>
              </div>
            )}

            <div
              className={`results-content${isEntonnoirScroll ? " results-content--entonnoir" : ""}`}
            >
              {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && results.funnel && results.funnel.length > 0 && (
                <FunnelDisplay
                  steps={results.funnel}
                  finalRadiusKm={results.final_radius_km}
                  total={results.total}
                />
              )}
              {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && (!results.funnel || results.funnel.length === 0) && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucune donnée d&apos;entonnoir pour ce filtre.
                </div>
              )}

              {mainResultsTab === "unites" && ufResults && ufSubView === "entonnoir" && ufResults.funnel && ufResults.funnel.length > 0 && (
                <FunnelDisplay
                  steps={ufResults.funnel}
                  finalRadiusKm={0}
                  total={ufResults.total_sous_ensembles}
                  entityLabel="sous-ensembles candidats"
                  extraSummary={`${ufResults.total_uf} UF`}
                />
              )}
              {mainResultsTab === "unites" && ufResults && ufSubView === "entonnoir" && (!ufResults.funnel || ufResults.funnel.length === 0) && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucune donnée d&apos;entonnoir pour ce filtre UF.
                </div>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "classement" && (
                <>
                  {distanceMaxKm > 0 && (
                    <div
                      style={{
                        padding: "8px 8px 0 8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#000000" }}>
                        Distance au centre AOI :{" "}
                        <span style={{ color: "#0f172a", fontWeight: 600 }}>
                          {distanceCursorKm.toFixed(1)} km
                        </span>{" "}
                        (curseur)
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={distanceMaxKm}
                        step={0.1}
                        value={Math.min(Math.max(distanceCursorKm, 1), distanceMaxKm)}
                        onChange={(e) => setDistanceCursorKm(parseFloat(e.target.value))}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#000000" }}>
                        <span>1 km</span>
                        <span>{distanceMaxKm.toFixed(1)} km</span>
                      </div>
                    </div>
                  )}
                  <RankingTable
                    parcelles={displayedParcelles}
                    scrollToIdu={scrollToIdu}
                    selectedIdu={scrollToIdu}
                  />
                </>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "carte" && geojson && (
                <ParcellesMap
                  geojson={geojson}
                  foncierGeojson={foncierGeojson}
                  onParcelleDoubleClick={handleParcelleDoubleClickFromMap}
                />
              )}
              {mainResultsTab === "parcelles" && parcelSubView === "carte" && !geojson && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  GeoJSON parcelles indisponible ou aucune géométrie.
                </div>
              )}

              {mainResultsTab === "unites" && ufResults && ufSubView === "classement" && (
                <UnitesFoncieresTable ufResults={ufResults} />
              )}
              {mainResultsTab === "unites" && !ufResults && sousEnsemblesStatus === "no" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucun sous-ensemble en base pour ce projet. Générez la couche « sous-ensembles » (unités
                  foncières) en amont, puis relancez le filtre — seul le classement parcelles sera disponible
                  tant qu’il n’y a pas de lignes dans{" "}
                  <code style={{ fontSize: 12 }}>ecocompensation_results.sous_ensembles</code>.
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && sousEnsemblesStatus === "yes" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Lancez le filtre pour calculer et afficher les résultats unités foncières.
                </div>
              )}
              {mainResultsTab === "unites" && ufResults && ufSubView === "carte" && ufGeojson && (
                <SousEnsemblesMap geojson={ufGeojson} subsetScores={subsetScores} />
              )}
              {mainResultsTab === "unites" && ufResults && ufSubView === "carte" && !ufGeojson && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  GeoJSON des sous-ensembles indisponible ou vide.
                </div>
              )}
            </div>
          </>
        ) : projectId ? (
          <div style={{ height: "100%", minHeight: 420 }}>
            <ProjectContextMap
              parcelleFeature={contextGeom?.parcelle_source ?? null}
              aoiFeature={contextGeom?.aoi ?? null}
            />
          </div>
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

function CreateAoiRoutePage() {
  const navigate = useNavigate();
  return (
    <CreateAoiPage
      onDone={(id) => navigate(`/projects/${id}/filter`)}
      onBack={() => navigate("/")}
    />
  );
}

function ProjectFilterRoutePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  return (
    <EcoCompensationApp
      fixedProjectId={projectId ?? null}
      onNavigateToCreate={() => navigate("/create-aoi")}
    />
  );
}

function StudyHomeRoutePage() {
  const navigate = useNavigate();
  return <EcoCompensationApp onNavigateToCreate={() => navigate("/create-aoi")} />;
}

/* =========================================================
   LE VRAI APP = ROUTEUR
   ========================================================= */

export default function App() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* Header application */}
      <header
        style={{
          height: 52,
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 20,
          background: "white"
        }}
      >
        <div style={{ fontWeight: 600 }}>KERELIA</div>

        <nav style={{ display: "flex", gap: 14 }}>
          <Link to="/" style={{ textDecoration: "none" }}>Étude</Link>
          <Link to="/ideco" style={{ textDecoration: "none" }}>Pré analyse écologique</Link>
          <Link to="/bancarisation" style={{ textDecoration: "none" }}>Bancarisation</Link>
        </nav>
      </header>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <Routes>
          <Route path="/" element={<StudyHomeRoutePage />} />
          <Route path="/create-aoi" element={<CreateAoiRoutePage />} />
          <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
          <Route path="/ideco" element={<AnalyseEcologiquePage />} />
          <Route path="/bancarisation" element={<Bancarisation />} />
        </Routes>
      </div>
    </div>
  );
}