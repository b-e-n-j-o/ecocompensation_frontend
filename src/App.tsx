import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { FilterPanel } from "./components/FilterPanel/FilterPanel";
import { FunnelDisplay } from "./components/ResultPanel/FunnelDisplay";
import { RankingTable } from "./components/ResultPanel/RankingTable";
import { IndesirablesTable } from "./components/ResultPanel/IndesirablesTable";
import { UnitesFoncieresTable } from "./components/ResultPanel/UnitesFoncieresTable";
import { ParcellesMap } from "./components/ResultPanel/MapResults/ParcellesMap";
import { SousEnsemblesMap } from "./components/ResultPanel/MapResults/SousEnsemblesMap";
import type { ParcellesGeoJSON } from "./components/ResultPanel/MapResults/ParcellesMap";
import {
  runFilter,
  runFilterUF,
  fetchParcellesGeojson,
  fetchPoolRunMetricsBulk,
  computePoolRunMetrics,
  computePoolRunScoreOnly,
  fetchProjectContextGeometry,
  fetchFoncierGeojson,
  fetchUfSubsetsGeojson,
  fetchSousEnsemblesStatus,
  prefetchAllResultsThematicLayers,
  fetchPoolIndesirables,
  addPoolIndesirables,
  removePoolIndesirable,
  fetchPoolRunSnapshot,
  fetchPoolRunsList,
  fetchProjectStoredResults,
} from "./api";
import type { ResultsThematicPreload } from "./components/ResultPanel/MapResults/cartoCouchesRegistry";
import type {
  FilterOptions,
  FilterResponse,
  ParcelPoolMetricRow,
  PoolRunListItem,
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
import IdentiteFoncierePage from "./pages/IdentiteFonciere/page";

import "./App.css";
import "./components/FilterPanel/filter-panel.css";
import "./components/ResultPanel/results.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/** Onglets principaux : Parcelles | Unités foncières */
type MainResultsTab = "parcelles" | "unites";
/** Sous-vues : entonnoir | tableau | carte */
type ResultsSubView = "entonnoir" | "classement" | "classement_combine" | "carte";
type FilterLoadingStage = "idle" | "filtering" | "profiling" | "metrics_loading";

/** Présence de lignes dans ecocompensation_results.sous_ensembles pour le projet (filtre UF possible). */
type SousEnsemblesStatus = "idle" | "loading" | "yes" | "no";

/* =========================================================
   TON APPLICATION ACTUELLE (inchangée) devient une PAGE
   ========================================================= */

interface EcoCompensationAppProps {
  fixedProjectId?: string | null;
  /** Si renseigné : hydrate les résultats depuis ce run pool (URL partageable). */
  initialRunId?: string | null;
  /** Appelé quand l’utilisateur change de projet depuis le sélecteur alors qu’on affiche un run (`initialRunId`). */
  onProjectChangeNavigate?: (newProjectId: string) => void;
  onNavigateToCreate?: () => void;
}

/**
 * Recalcule `score_norm` (0–1, meilleur = plus vert sur la carte) à partir de `score_eco`
 * dès que les métriques pool sont chargées, sans refaire un GET /geojson.
 */
function applyScoreEcoToParcellesGeojson(
  base: ParcellesGeoJSON | null,
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null,
): ParcellesGeoJSON | null {
  if (!base?.features?.length || !poolMetricsByIdu) return base;

  const scoreByIdu = new Map<string, number>();
  for (const f of base.features) {
    const idu = String(f.properties?.idu ?? "");
    if (!idu) continue;
    const rows = poolMetricsByIdu[idu];
    const row = rows?.find((r) => r.metric_key === "score_eco");
    const raw = row?.metric_value_jsonb;
    const ts =
      raw && typeof raw === "object" && raw !== null && "total_score" in raw
        ? (raw as { total_score?: unknown }).total_score
        : undefined;
    if (typeof ts === "number" && Number.isFinite(ts)) {
      scoreByIdu.set(idu, ts);
    }
  }
  if (scoreByIdu.size === 0) return base;

  const vals = [...scoreByIdu.values()];
  const minT = Math.min(...vals);
  const maxT = Math.max(...vals);
  const rng = maxT - minT || 1;

  return {
    ...base,
    features: base.features.map((f) => {
      const idu = String(f.properties?.idu ?? "");
      const t = scoreByIdu.get(idu);
      if (t === undefined) return f;
      const score_norm = Math.round(((t - minT) / rng) * 10000) / 10000;
      return {
        ...f,
        properties: {
          ...f.properties,
          total_score: t,
          score_norm,
          score_norm_source: "score_eco",
        },
      };
    }),
  };
}

/** Marque les parcelles indésirables sur le GeoJSON (couleur rouge carte + hors classement). */
function applyPoolIndesirableToParcellesGeojson(
  base: ParcellesGeoJSON | null,
  indesirableIdus: readonly string[],
): ParcellesGeoJSON | null {
  if (!base?.features?.length) return base;
  const set = new Set(indesirableIdus);
  return {
    ...base,
    features: base.features.map((f) => {
      const idu = String(f.properties?.idu ?? "");
      return {
        ...f,
        properties: {
          ...f.properties,
          pool_indesirable: set.has(idu),
        },
      };
    }),
  };
}

function parseIduParts(raw: string): { codeInsee: string; section: string; numero: string } {
  const idu = String(raw ?? "").trim();
  return {
    codeInsee: idu.slice(0, 5) || "",
    section: idu.slice(8, 10) || "",
    numero: idu.slice(-4) || "",
  };
}

function EcoCompensationApp({
  fixedProjectId = null,
  initialRunId = null,
  onProjectChangeNavigate,
  onNavigateToCreate,
}: EcoCompensationAppProps) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(fixedProjectId);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterLoadingStage, setFilterLoadingStage] = useState<FilterLoadingStage>("idle");
  const [ufResults, setUfResults] = useState<UfFilterResponse | null>(null);
  const [ufGeojson, setUfGeojson] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
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
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("composite_score");
  /** IDU exclus du classement (pool indésirables), aligné sur `results.pool_run_id`. */
  const [indesirableIdus, setIndesirableIdus] = useState<string[]>([]);
  const [indesirableParcellesStored, setIndesirableParcellesStored] = useState<FilterResponse["parcelles"]>([]);
  const [indesirableMetricsByIdu, setIndesirableMetricsByIdu] = useState<Record<string, ParcelPoolMetricRow[]>>({});
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

  useEffect(() => {
    if (!projectId) {
      setPoolRuns([]);
      return;
    }
    let cancelled = false;
    fetchPoolRunsList(projectId, 100)
      .then((r) => {
        if (!cancelled) {
          setPoolRuns((r.runs ?? []).filter((x) => x.scope === "parcelles"));
        }
      })
      .catch(() => {
        if (!cancelled) setPoolRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !initialRunId) return;

    // StrictMode : le 1er effet est démonté avant le 2e ; ne pas court-circuiter avec une ref
    // posée trop tôt (sinon aucun fetch métriques / geo, loading bloqué à l’infini).
    let active = true;
    setLoading(true);
    setFilterLoadingStage("metrics_loading");
    thematicPrefetchSeqRef.current += 1;
    setThematicPreloadLoading(false);
    setThematicPreload(null);

    void (async () => {
      try {
        const snap = await fetchPoolRunSnapshot(projectId, initialRunId);
        if (!active) return;
        const { filter_options, run_created_at, ...rest } = snap;
        setPoolMetricsByIdu(null);
        setResults({
          ...(rest as FilterResponse),
          run_created_at: run_created_at ?? undefined,
        });
        setLastFilterOptions(filter_options as FilterOptions);

        if (active) {
          setLoading(false);
          setFilterLoadingStage("idle");
        }

        const rid = snap.pool_run_id;
        const runIdForGeo = snap.pool_run_id ?? initialRunId;

        const loadMetrics = async () => {
          if (snap.by_idu && typeof snap.by_idu === "object") {
            const normalized: Record<string, ParcelPoolMetricRow[]> = {};
            for (const [idu, rows] of Object.entries(snap.by_idu)) {
              normalized[idu] = (rows as ParcelPoolMetricRow[]).map((row) => ({
                metric_key: String(row.metric_key),
                metric_value_jsonb:
                  typeof row.metric_value_jsonb === "object" && row.metric_value_jsonb !== null
                    ? (row.metric_value_jsonb as Record<string, unknown>)
                    : {},
                updated_at: row.updated_at ?? null,
              }));
            }
            if (active) setPoolMetricsByIdu(normalized);
            return;
          }
          if (!rid) {
            if (active) setPoolMetricsByIdu({});
            return;
          }
          try {
            const bulk = await fetchPoolRunMetricsBulk(projectId, rid);
            if (!active) return;
            const by = bulk.by_idu ?? {};
            const normalized: Record<string, ParcelPoolMetricRow[]> = {};
            for (const [idu, rows] of Object.entries(by)) {
              normalized[idu] = (rows as ParcelPoolMetricRow[]).map((row) => ({
                metric_key: String(row.metric_key),
                metric_value_jsonb:
                  typeof row.metric_value_jsonb === "object" && row.metric_value_jsonb !== null
                    ? (row.metric_value_jsonb as Record<string, unknown>)
                    : {},
                updated_at: row.updated_at ?? null,
              }));
            }
            setPoolMetricsByIdu(normalized);
          } catch (e) {
            console.warn("Métriques run historique:", e);
            if (active) setPoolMetricsByIdu({});
          }
        };

        const loadGeo = async () => {
          try {
            const geo = await fetchParcellesGeojson(projectId, runIdForGeo);
            if (active) setGeojson(geo as ParcellesGeoJSON);
          } catch (err) {
            console.warn("GeoJSON parcelles (run):", err);
            if (active) setGeojson(null);
          }
        };

        const loadFoncier = async () => {
          try {
            const foncier = await fetchFoncierGeojson(projectId);
            if (active) setFoncierGeojson(foncier);
          } catch (err) {
            console.warn("GeoJSON foncier:", err);
            if (active) setFoncierGeojson(null);
          }
        };

        const loadStored = async () => {
          try {
            const stored = await fetchProjectStoredResults(projectId);
            if (!active) return;
            const ufRaw = stored.last_results_uf;
            if (ufRaw && typeof ufRaw === "object") {
              setUfResults(ufRaw as UfFilterResponse);
              const hasSubsets = (ufRaw as UfFilterResponse).unites_foncieres?.some(
                (u) => (u.sous_ensembles ?? []).length > 0,
              );
              if (hasSubsets) {
                try {
                  const ufGeo = await fetchUfSubsetsGeojson(projectId);
                  if (active) setUfGeojson(ufGeo);
                } catch {
                  if (active) setUfGeojson(null);
                }
              } else {
                setUfGeojson(null);
              }
            } else {
              setUfResults(null);
              setUfGeojson(null);
            }
          } catch {
            if (active) {
              setUfResults(null);
              setUfGeojson(null);
            }
          }
        };

        // Indésirables : useEffect sur [projectId, results.pool_run_id] après setResults.
        // Métriques d’abord (tableau + RankingLine) ; géométries / UF stockées sans bloquer.
        await loadMetrics();

        const pid = projectId;
        const prefetchSeq = thematicPrefetchSeqRef.current;
        if (active) {
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
        }

        void Promise.all([loadGeo(), loadFoncier(), loadStored()]);
      } catch (err) {
        console.error("Chargement run:", err);
        alert(err instanceof Error ? err.message : "Impossible de charger ce run.");
      } finally {
        if (active) {
          setFilterLoadingStage("idle");
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [projectId, initialRunId]);

  function handleProjectChange(newProjectId: string | null) {
    if (initialRunId && onProjectChangeNavigate && newProjectId) {
      onProjectChangeNavigate(newProjectId);
      return;
    }
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
    setRankingSortKey("composite_score");
    setIndesirableIdus([]);
    setIndesirableParcellesStored([]);
    setIndesirableMetricsByIdu({});
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

  useEffect(() => {
    if (!projectId) {
      setIndesirableIdus([]);
      setIndesirableParcellesStored([]);
      setIndesirableMetricsByIdu({});
      return;
    }
    let cancelled = false;
    fetchPoolIndesirables(projectId)
      .then((r) => {
        if (!cancelled) {
          setIndesirableIdus(r.idus ?? []);
          setIndesirableParcellesStored(r.parcelles ?? []);
          setIndesirableMetricsByIdu(r.by_idu ?? {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIndesirableIdus([]);
          setIndesirableParcellesStored([]);
          setIndesirableMetricsByIdu({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleMarkIndesirable(idu: string) {
    if (!projectId || !results?.pool_run_id) return;
    try {
      await addPoolIndesirables(projectId, results.pool_run_id, [idu]);
      const next = await fetchPoolIndesirables(projectId);
      setIndesirableIdus(next.idus ?? []);
      setIndesirableParcellesStored(next.parcelles ?? []);
      setIndesirableMetricsByIdu(next.by_idu ?? {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible de marquer la parcelle comme indésirable.");
    }
  }

  async function handleRestoreIndesirable(idu: string) {
    if (!projectId) return;
    try {
      await removePoolIndesirable(projectId, idu);
      const next = await fetchPoolIndesirables(projectId);
      setIndesirableIdus(next.idus ?? []);
      setIndesirableParcellesStored(next.parcelles ?? []);
      setIndesirableMetricsByIdu(next.by_idu ?? {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible de réintégrer la parcelle au classement.");
    }
  }

  async function handleSubmit(opts: FilterOptions, scoreOnlyMode = false, ufOnlyMode = false) {
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
    setRankingSortKey("composite_score");
    setIndesirableIdus([]);
    setIndesirableParcellesStored([]);
    setIndesirableMetricsByIdu({});
    try {
      let createdPoolRunId: string | null = null;
      let runUf = false;
      if (sousEnsemblesStatus === "yes") {
        runUf = true;
      } else if (sousEnsemblesStatus === "loading") {
        const st = await fetchSousEnsemblesStatus(projectId);
        runUf = st.has_sous_ensembles;
        setSousEnsemblesStatus(st.has_sous_ensembles ? "yes" : "no");
      }

      if (!ufOnlyMode) {
        const data = await runFilter(projectId, opts);
        setResults(data);
        setLastFilterOptions(opts);
        createdPoolRunId = data.pool_run_id ?? null;

        if (data.pool_run_id) {
          setFilterLoadingStage("profiling");
          try {
            if (scoreOnlyMode) await computePoolRunScoreOnly(projectId, data.pool_run_id);
            else await computePoolRunMetrics(projectId, data.pool_run_id);
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
      } else {
        // Mode UF-only : on garde un shell de résultats pour afficher le panneau résultats.
        setResults({
          total: 0,
          final_radius_km: 0,
          parcelles: [],
          funnel: [],
          pool_run_id: null,
        });
        setPoolMetricsByIdu({});
      }

      if (runUf) {
        const uf = await runFilterUF(projectId, opts);
        const ufTyped = uf as UfFilterResponse;
        setUfResults(ufTyped);
        if (ufOnlyMode) {
          setMainResultsTab("unites");
          setUfSubView("classement");
        }

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

      // URL persistante partageable : /projects/:projectId/runs/:runId
      if (createdPoolRunId) {
        navigate(`/projects/${projectId}/runs/${createdPoolRunId}`);
      }
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
    const indesirableSet = new Set(indesirableIdus);
    const getParcelScore = (idu: string): number => {
      const rows = poolMetricsByIdu?.[idu] ?? [];
      const scoreRow = rows.find((r) => r.metric_key === "score_eco");
      const raw = scoreRow?.metric_value_jsonb?.total_score;
      return typeof raw === "number" && Number.isFinite(raw) ? raw : Number.NEGATIVE_INFINITY;
    };
    const getDureteScore = (idu: string): number => {
      const rows = poolMetricsByIdu?.[idu] ?? [];
      const dRow = rows.find((r) => r.metric_key === "durete_fonciere");
      const raw = dRow?.metric_value_jsonb?.score_final;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return Number.POSITIVE_INFINITY;
      if (raw < 0 || raw > 100) return Number.POSITIVE_INFINITY;
      return raw;
    };
    const getCompositeScore = (idu: string): number => {
      const rows = poolMetricsByIdu?.[idu] ?? [];
      const cRow = rows.find((r) => r.metric_key === "composite_score_v1");
      const raw = cRow?.metric_value_jsonb?.score_composite;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return Number.NEGATIVE_INFINITY;
      if (raw < 0 || raw > 100) return Number.NEGATIVE_INFINITY;
      return raw;
    };
    const cap = Math.max(1, distanceCursorKm);
    let list = results.parcelles.filter(
      (p) =>
        !indesirableSet.has(p.idu) &&
        (p.distance_km ?? 0) <= cap &&
        (p.surface_ha ?? 0) >= surfaceMinHa,
    );
    if (rankingSortKey === "rank") {
      list = [...list].sort((a, b) => {
        const sa = getParcelScore(a.idu);
        const sb = getParcelScore(b.idu);
        if (sa !== sb) return sb - sa; // score élevé en premier
        return a.rank - b.rank; // fallback stable
      });
    } else if (rankingSortKey === "durete_score") {
      list = [...list].sort((a, b) => {
        const da = getDureteScore(a.idu);
        const db = getDureteScore(b.idu);
        if (da !== db) return da - db; // plus petit score de dureté = meilleur
        return a.rank - b.rank;
      });
    } else if (rankingSortKey === "composite_score") {
      list = [...list].sort((a, b) => {
        const ca = getCompositeScore(a.idu);
        const cb = getCompositeScore(b.idu);
        if (ca !== cb) return cb - ca; // score composite élevé en premier
        return a.rank - b.rank;
      });
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
    indesirableIdus,
  ]);

  const displayedCombinedCandidates = useMemo(() => {
    const parcelles = displayedParcelles;
    if (!ufResults?.unites_foncieres?.length) return parcelles;

    const subsetCandidates = ufResults.unites_foncieres.flatMap((uf) =>
      (uf.sous_ensembles ?? []).map((ss, idx) => {
        const firstIdu = ss.idus?.[0] ?? "";
        const ref = parseIduParts(firstIdu);
        return {
          rank: parcelles.length + idx + 1 + uf.rang * 1000,
          idu: `UF:${ss.subset_id}`,
          code_insee: ref.codeInsee || "UF",
          section: ref.section || "",
          numero: ref.numero || "",
          surface_ha: Number(ss.surface_ha ?? 0),
          miller: Number(ss.miller ?? 0),
          distance_km: Number(ss.distance_centre_km ?? 0),
          dist_hydro_m: ss.dist_hydro_m ?? null,
        };
      }),
    );

    return [...parcelles, ...subsetCandidates];
  }, [displayedParcelles, ufResults]);

  const indesirableParcelles = useMemo(() => {
    return [...indesirableParcellesStored].sort((a, b) => a.rank - b.rank);
  }, [indesirableParcellesStored]);

  /** Carte : couleurs = score v1 normalisé dès que les métriques sont là ; sinon /geojson (rang distance). */
  const parcellesMapGeojson = useMemo(() => {
    const withScore = applyScoreEcoToParcellesGeojson(geojson, poolMetricsByIdu);
    return applyPoolIndesirableToParcellesGeojson(withScore, indesirableIdus);
  }, [geojson, poolMetricsByIdu, indesirableIdus]);

  const isPoolMetricsPending =
    !!results?.pool_run_id && loading && (filterLoadingStage === "profiling" || filterLoadingStage === "metrics_loading");

  return (
    <div className="app-layout">
      <FilterPanel
        projectId={projectId}
        onProjectChange={handleProjectChange}
        onOpenRun={(pid, runId) => navigate(`/projects/${pid}/runs/${runId}`)}
        activeRunId={initialRunId ?? results?.pool_run_id ?? null}
        onSubmit={handleSubmit}
        onNavigateToCreate={onNavigateToCreate}
        isLoading={loading}
        loadingText={loadingStatusText}
        disabled={!projectId}
        initialOptions={lastFilterOptions}
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

        {projectId && poolRuns.length > 0 && (
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              background: "#fafafa",
            }}
          >
            <label style={{ fontSize: 12, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
              Run archivé
              <select
                className="mono"
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}
                value={results?.pool_run_id ?? initialRunId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v || !projectId) return;
                  navigate(`/projects/${projectId}/runs/${v}`);
                }}
                title="Charger un filtre parcelles déjà exécuté (même tableau / carte / métriques)"
              >
                {poolRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    ({run.total_count} parc.)
                  </option>
                ))}
              </select>
            </label>
            {initialRunId && (
              <Link
                to={`/projects/${projectId}/filter`}
                style={{ fontSize: 12, color: "#2563eb" }}
                title="Quitter la vue run : page filtre du projet"
              >
                Page filtre
              </Link>
            )}
          </div>
        )}

        {results ? (
          <>
            <div className="results-header">
              <h2 className="results-title">
                {mainResultsTab === "parcelles" && parcelSubView === "entonnoir" && "Parcelles — entonnoir de filtre"}
                {mainResultsTab === "parcelles" && parcelSubView === "classement" &&
                  `Parcelles — classement (${displayedParcelles.length})`}
                {mainResultsTab === "parcelles" && parcelSubView === "classement_combine" &&
                  `Classement combiné — parcelles + subsets (${displayedCombinedCandidates.length})`}
                {mainResultsTab === "parcelles" && parcelSubView === "carte" &&
                  `Parcelles — carte (${results.total})`}
                {mainResultsTab === "unites" && ufSubView === "entonnoir" &&
                  "Unités foncières — entonnoir de filtre"}
                {mainResultsTab === "unites" && ufSubView === "classement" &&
                  `Unités foncières — classement (${ufResults?.total_uf ?? 0})`}
                {mainResultsTab === "unites" && ufSubView === "carte" &&
                  `Unités foncières — carte (${ufResults?.total_uf ?? 0})`}
                {results.run_created_at && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: "#64748b", marginLeft: 8 }}>
                    · run du {new Date(results.run_created_at).toLocaleString("fr-FR")}
                  </span>
                )}
              </h2>
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
                  className={`results-tab ${parcelSubView === "classement_combine" ? "active" : ""}`}
                  onClick={() => setParcelSubView("classement_combine")}
                  title="Candidats combinés : parcelles seules + sous-ensembles UF"
                >
                  Classement combiné
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
                      projectId={projectId}
                      exportPoolRunId={results.pool_run_id ?? null}
                      poolRunId={results.pool_run_id ?? null}
                      poolMetricsByIdu={poolMetricsByIdu}
                      poolMetricsLoading={!!results.pool_run_id && poolMetricsByIdu === null}
                      rankingSortKey={rankingSortKey}
                      onRankingSortChange={setRankingSortKey}
                      scrollToIdu={scrollToIdu}
                      selectedIdu={scrollToIdu}
                      onRowDoubleClick={handleTableRowDoubleClick}
                      onMarkIndesirable={handleMarkIndesirable}
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
                  {results.pool_run_id && (
                    <IndesirablesTable
                      projectId={projectId}
                      parcelles={indesirableParcelles}
                      poolRunId={results.pool_run_id}
                      poolMetricsByIdu={indesirableMetricsByIdu}
                      poolMetricsLoading={!!results.pool_run_id && poolMetricsByIdu === null}
                      onRestore={handleRestoreIndesirable}
                      onRowDoubleClick={handleTableRowDoubleClick}
                    />
                  )}
                </>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "classement_combine" && (
                <div className="ranking-table-shell">
                  <RankingTable
                    parcelles={displayedCombinedCandidates}
                    projectId={null}
                    exportPoolRunId={null}
                    poolRunId={results.pool_run_id ?? null}
                    poolMetricsByIdu={poolMetricsByIdu}
                    poolMetricsLoading={!!results.pool_run_id && poolMetricsByIdu === null}
                    rankingSortKey={rankingSortKey}
                    onRankingSortChange={setRankingSortKey}
                    scrollToIdu={scrollToIdu}
                    selectedIdu={scrollToIdu}
                    onMarkIndesirable={undefined}
                  />
                </div>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "carte" && geojson && (
                <ParcellesMap
                  geojson={parcellesMapGeojson ?? geojson}
                  foncierGeojson={foncierGeojson}
                  projectId={projectId}
                  preloadedThematic={thematicPreload}
                  thematicPreloadLoading={thematicPreloadLoading}
                  poolMetricsByIdu={poolMetricsByIdu}
                  indesirableCount={indesirableIdus.length}
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
                <UnitesFoncieresTable ufResults={ufResults} projectId={projectId} />
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
              foncierFeature={contextGeom?.foncier ?? null}
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

function ProjectRunRoutePage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  return (
    <EcoCompensationApp
      fixedProjectId={projectId ?? null}
      initialRunId={runId ?? null}
      onNavigateToCreate={() => navigate("/create-aoi")}
      onProjectChangeNavigate={(id) => navigate(`/projects/${id}/filter`)}
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
          <Link to="/cif" style={{ textDecoration: "none" }}>CIF</Link>
        </nav>
      </header>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/create-aoi" replace />} />
          <Route path="/create-aoi" element={<CreateAoiRoutePage />} />
          <Route path="/etude" element={<StudyHomeRoutePage />} />
          <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
          <Route path="/projects/:projectId/runs/:runId" element={<ProjectRunRoutePage />} />
          <Route path="/ideco" element={<AnalyseEcologiquePage />} />
          <Route path="/bancarisation" element={<Bancarisation />} />
          <Route path="/cif" element={<IdentiteFoncierePage />} />
        </Routes>
      </div>
    </div>
  );
}