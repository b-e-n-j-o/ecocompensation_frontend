import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { FilterPanel } from "./components/FilterPanel/FilterPanel";
import { FunnelDisplay } from "./components/ResultPanel/FunnelDisplay";
import { RankingTable } from "./components/ResultPanel/RankingTable";
import { UnitesFoncieresTable } from "./components/ResultPanel/UnitesFoncieresTable";
import { ParcellesMap } from "./components/ResultPanel/MapResults/ParcellesMap";
import { SousEnsemblesMap } from "./components/ResultPanel/MapResults/SousEnsemblesMap";
import type { ParcellesGeoJSON } from "./components/ResultPanel/MapResults/ParcellesMap";
import {
  runFilter,
  runFilterUF,
  exportShp,
  exportCsv,
  fetchParcellesGeojson,
  fetchPoolRunMetricsBulk,
  computePoolRunMetrics,
  fetchProjectContextGeometry,
  fetchFoncierGeojson,
  fetchUfSubsetsGeojson,
  fetchSousEnsemblesStatus,
  prefetchAllResultsThematicLayers,
} from "./api";
import type { ResultsThematicPreload } from "./components/ResultPanel/MapResults/cartoCouchesRegistry";
import type {
  FilterOptions,
  FilterResponse,
  ParcelPoolMetricRow,
  RankingSortKey,
  UfFilterResponse,
} from "./types";
import {
  buildVegetationPriorityChain,
  compareByVegetationPriority,
  getDominantVegetationRatio,
} from "./utils/poolMetrics";
import { useFetchProgress } from "./hooks/useFetchProgress";
import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { ProjectContextMap } from "./components/ProjectContextMap";
import Bancarisation from "./pages/Bancarisation/page";
import AnalyseEcologiquePage from "./pages/AnalyseEcologique/page";

import "./App.css";
import "./components/FilterPanel/filter-panel.css";
import "./components/ResultPanel/results.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/** Onglets principaux : Parcelles | Unités foncières */
type MainResultsTab = "parcelles" | "unites";
/** Sous-vues : entonnoir | tableau | carte */
type ResultsSubView = "entonnoir" | "classement" | "carte";
type FilterLoadingStage = "idle" | "filtering" | "profiling" | "metrics_loading";

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
  const [filterLoadingStage, setFilterLoadingStage] = useState<FilterLoadingStage>("idle");
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
  const [, setMapFocusIdu] = useState<string | null>(null);
  const [distanceMaxKm, setDistanceMaxKm] = useState<number>(0);
  const [distanceCursorKm, setDistanceCursorKm] = useState<number>(0);
  const [surfaceMinHa, setSurfaceMinHa] = useState<number>(0);
  const [surfaceMaxHa, setSurfaceMaxHa] = useState<number>(0);
  const [sousEnsemblesStatus, setSousEnsemblesStatus] = useState<SousEnsemblesStatus>("idle");
  const [contextGeom, setContextGeom] = useState<Awaited<ReturnType<typeof fetchProjectContextGeometry>> | null>(null);
  const { connected, progress } = useFetchProgress(projectId ?? "");
  const projectIdRef = useRef<string | null>(null);
  const thematicPrefetchSeqRef = useRef(0);
  const [thematicPreload, setThematicPreload] = useState<ResultsThematicPreload | null>(null);
  /** True tant que le prefetch des couches thématiques (ZDV, CESBIO, …) n’est pas terminé après un filtre. */
  const [thematicPreloadLoading, setThematicPreloadLoading] = useState(false);
  /** Métriques pool (bulk après filtrage) ; null = chargement en cours ou pas encore de filtre. */
  const [poolMetricsByIdu, setPoolMetricsByIdu] = useState<Record<string, ParcelPoolMetricRow[]> | null>(null);
  /** Options du dernier filtre réussi (pour tri priorité végétation = même ordre que `last_filter` en base). */
  const [lastFilterOptions, setLastFilterOptions] = useState<FilterOptions | null>(null);
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("rank");
  const hasParcellesFunnel = (results?.funnel ?? []).some((s) => s.count >= 0);
  const hasUfFunnel = (ufResults?.funnel ?? []).some((s) => s.count >= 0);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

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
    setMapFocusIdu(null);
    setDistanceMaxKm(0);
    setDistanceCursorKm(0);
    setSurfaceMinHa(0);
    setSurfaceMaxHa(0);
    setMainResultsTab("parcelles");
    setParcelSubView("classement");
    setUfSubView("classement");
    setContextGeom(null);
    thematicPrefetchSeqRef.current += 1;
    setThematicPreloadLoading(false);
    setThematicPreload(null);
    setPoolMetricsByIdu(null);
    setLastFilterOptions(null);
    setRankingSortKey("rank");
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
    setFilterLoadingStage("filtering");
    thematicPrefetchSeqRef.current += 1;
    setThematicPreloadLoading(false);
    setThematicPreload(null);
    setUfResults(null);
    setUfGeojson(null);
    setPoolMetricsByIdu(null);
    setLastFilterOptions(null);
    setRankingSortKey("rank");
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
      setLastFilterOptions(opts);

      if (data.pool_run_id) {
        setFilterLoadingStage("profiling");
        try {
          await computePoolRunMetrics(projectId, data.pool_run_id);
        } catch (e) {
          console.warn("Calcul métriques pool):", e);
        }
        setFilterLoadingStage("metrics_loading");
        try {
          const bulk = await fetchPoolRunMetricsBulk(projectId, data.pool_run_id);
          setPoolMetricsByIdu(bulk.by_idu);
        } catch (e) {
          console.warn("Métriques pool (bulk):", e);
          setPoolMetricsByIdu({});
        }
      } else {
        setPoolMetricsByIdu({});
      }

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

      // Couches thématiques (ZDV, faune, CESBIO, …) en arrière-plan — prêtes au toggle carte sans attente
      const pid = projectId;
      const prefetchSeq = thematicPrefetchSeqRef.current;
      setThematicPreloadLoading(true);
      void prefetchAllResultsThematicLayers(pid)
        .then((data) => {
          if (projectIdRef.current !== pid) return;
          setThematicPreload(data);
        })
        .finally(() => {
          if (thematicPrefetchSeqRef.current !== prefetchSeq) return;
          setThematicPreloadLoading(false);
        });
    } catch (err) {
      console.error("Erreur filtre:", err);
      alert("Erreur lors du filtrage. Voir console.");
    } finally {
      setFilterLoadingStage("idle");
      setLoading(false);
    }
  }

  const loadingStatusText = useMemo(() => {
    if (!loading) return null;
    if (filterLoadingStage === "profiling") {
      return "Filtrage terminé. Calcul des métriques des parcelles du pool en cours…";
    }
    if (filterLoadingStage === "metrics_loading") {
      return "Récupération des métriques…";
    }
    return "Filtrage en cours…";
  }, [loading, filterLoadingStage]);

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

  function handleTableRowDoubleClick(idu: string) {
    setMainResultsTab("parcelles");
    setParcelSubView("carte");
    setMapFocusIdu(idu);
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
      const n = (uf.sous_ensembles ?? []).length;
      for (const [idx, ss] of (uf.sous_ensembles ?? []).entries()) {
        // Valeur de "qualité" dérivée du rang local : le 1er sous-ensemble est le meilleur.
        m[ss.subset_id] = Math.max(1, n - idx);
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

    const maxSurface = Math.max(
      0,
      ...parcelles.map((p) => (Number.isFinite(p.surface_ha) ? p.surface_ha : 0)),
    );
    setSurfaceMaxHa(maxSurface);
    setSurfaceMinHa(0);
  }, [results?.parcelles]);

  const displayedParcelles = useMemo(() => {
    if (!results?.parcelles?.length) return [];
    const cap = Math.max(1, distanceCursorKm);
    let list = results.parcelles.filter(
      (p) => (p.distance_km ?? 0) <= cap && (p.surface_ha ?? 0) >= surfaceMinHa,
    );
    if (rankingSortKey === "rank") {
      list = [...list].sort((a, b) => a.rank - b.rank);
    } else if (rankingSortKey === "distance") {
      list = [...list].sort((a, b) => a.distance_km - b.distance_km);
    } else if (rankingSortKey === "surface") {
      list = [...list].sort((a, b) => b.surface_ha - a.surface_ha);
    } else if (rankingSortKey === "miller") {
      list = [...list].sort((a, b) => b.miller - a.miller);
    } else if (rankingSortKey === "veg_dominant") {
      list = [...list].sort((a, b) => {
        const ra = poolMetricsByIdu ? getDominantVegetationRatio(poolMetricsByIdu[a.idu]) : 0;
        const rb = poolMetricsByIdu ? getDominantVegetationRatio(poolMetricsByIdu[b.idu]) : 0;
        return rb - ra;
      });
    } else if (rankingSortKey === "veg_priority") {
      const chain = buildVegetationPriorityChain(lastFilterOptions?.vegetation_hybride);
      if (!chain.length) {
        list = [...list].sort((a, b) => a.rank - b.rank);
      } else {
        list = [...list].sort((a, b) =>
          compareByVegetationPriority(a.idu, b.idu, chain, poolMetricsByIdu),
        );
      }
    }
    return list;
  }, [
    results?.parcelles,
    distanceCursorKm,
    surfaceMinHa,
    rankingSortKey,
    poolMetricsByIdu,
    lastFilterOptions,
  ]);
  const isPoolMetricsPending =
    !!results?.pool_run_id && loading && (filterLoadingStage === "profiling" || filterLoadingStage === "metrics_loading");

  return (
    <div className="app-layout">
      <FilterPanel
        projectId={projectId}
        onProjectChange={handleProjectChange}
        onSubmit={handleSubmit}
        onNavigateToCreate={onNavigateToCreate}
        isLoading={loading}
        loadingText={loadingStatusText}
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

        {loadingStatusText && (
          <div className="loading-status-banner loading-text-breathe">{loadingStatusText}</div>
        )}

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
                  disabled={!hasParcellesFunnel}
                  title={!hasParcellesFunnel ? "Aucun entonnoir disponible" : ""}
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
                  disabled={!hasUfFunnel}
                  title={!hasUfFunnel ? "Aucun entonnoir disponible" : ""}
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
              {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && hasParcellesFunnel && (
                <FunnelDisplay
                  steps={results.funnel ?? []}
                  finalRadiusKm={results.final_radius_km}
                  total={results.total}
                />
              )}
              {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && !hasParcellesFunnel && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucune donnée d&apos;entonnoir pour ce filtre.
                </div>
              )}

              {mainResultsTab === "unites" && ufResults && ufSubView === "entonnoir" && hasUfFunnel && (
                <FunnelDisplay
                  steps={ufResults.funnel ?? []}
                  finalRadiusKm={0}
                  total={ufResults.total_sous_ensembles}
                  entityLabel="sous-ensembles candidats"
                  extraSummary={`${ufResults.total_uf} UF`}
                />
              )}
              {mainResultsTab === "unites" && ufResults && ufSubView === "entonnoir" && !hasUfFunnel && (
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
                      <div style={{ fontSize: 13, color: "#000000", marginTop: 6 }}>
                        Surface minimale :{" "}
                        <span style={{ color: "#166534", fontWeight: 600 }}>
                          {surfaceMinHa.toFixed(1)} ha
                        </span>{" "}
                        (curseur)
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, surfaceMaxHa)}
                        step={0.1}
                        value={Math.min(Math.max(surfaceMinHa, 0), Math.max(1, surfaceMaxHa))}
                        onChange={(e) => setSurfaceMinHa(parseFloat(e.target.value))}
                        style={{ accentColor: "#16a34a" }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#000000" }}>
                        <span>0 ha</span>
                        <span>{Math.max(1, surfaceMaxHa).toFixed(1)} ha</span>
                      </div>
                    </div>
                  )}
                  <div className={`ranking-table-shell${isPoolMetricsPending ? " ranking-table-shell--loading" : ""}`}>
                    <RankingTable
                      parcelles={displayedParcelles}
                      poolRunId={results.pool_run_id ?? null}
                      poolMetricsByIdu={poolMetricsByIdu}
                      poolMetricsLoading={!!results.pool_run_id && poolMetricsByIdu === null}
                      rankingSortKey={rankingSortKey}
                      onRankingSortChange={setRankingSortKey}
                      scrollToIdu={scrollToIdu}
                      selectedIdu={scrollToIdu}
                      onRowDoubleClick={handleTableRowDoubleClick}
                    />
                    {isPoolMetricsPending && (
                      <div className="ranking-table-loading-overlay" aria-live="polite">
                        <div className="ranking-table-loading-card">
                          <span className="parcelles-map-spinner" />
                          <span className="loading-text-breathe">
                            {loadingStatusText ?? "Calcul des métriques en cours…"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "carte" && geojson && (
                <ParcellesMap
                  geojson={geojson}
                  foncierGeojson={foncierGeojson}
                  projectId={projectId}
                  preloadedThematic={thematicPreload}
                  thematicPreloadLoading={thematicPreloadLoading}
                  loadingMessage={loadingStatusText}
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
                <SousEnsemblesMap
                  geojson={ufGeojson as FeatureCollection<Geometry, Record<string, unknown>>}
                  subsetScores={subsetScores}
                  projectId={projectId}
                  preloadedThematic={thematicPreload}
                  thematicPreloadLoading={thematicPreloadLoading}
                />
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
          <Route path="/" element={<Navigate to="/create-aoi" replace />} />
          <Route path="/create-aoi" element={<CreateAoiRoutePage />} />
          <Route path="/etude" element={<StudyHomeRoutePage />} />
          <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
          <Route path="/ideco" element={<AnalyseEcologiquePage />} />
          <Route path="/bancarisation" element={<Bancarisation />} />
        </Routes>
      </div>
    </div>
  );
}