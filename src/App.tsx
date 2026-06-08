import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";

import { FunnelDisplay } from "./components/ResultPanel/FunnelDisplay";
import { ResultsToolbar } from "./components/ResultPanel/ResultsToolbar";
import { RankingTable } from "./components/ResultPanel/RankingTable";
import { IndesirablesTable } from "./components/ResultPanel/IndesirablesTable";
import { UnitesFoncieresTable } from "./components/ResultPanel/UnitesFoncieresTable";
import { ParcellesMap } from "./components/ResultPanel/MapResults/ParcellesMap";
import { SousEnsemblesMap } from "./components/ResultPanel/MapResults/SousEnsemblesMap";
import { PipelineProgressPanel } from "./components/PipelineProgressPanel";
import "./components/pipelineProgressPanel.css";
import type { ParcellesGeoJSON } from "./components/ResultPanel/MapResults/ParcellesMap";
import {
  fetchParcellesGeojson,
  fetchPoolRunMetricsBulk,
  fetchProjectContextGeometry,
  fetchFoncierGeojson,
  fetchUfSubsetsGeojson,
  fetchUfResults,
  fetchSousEnsemblesStatus,
  prefetchAllResultsThematicLayers,
  fetchPoolIndesirables,
  addPoolIndesirables,
  removePoolIndesirable,
  fetchPoolRunSnapshot,
  fetchPoolRunsList,
  fetchProjectStoredResults,
  fetchProjects,
} from "./api";
import type { ProjectSummary } from "./api";
import type { ResultsThematicPreload } from "./components/ResultPanel/MapResults/cartoCouchesRegistry";
import {
  DEFAULT_FILTER,
  type CesbioLibelle,
  type FilterOptions,
  type FilterResponse,
  type ParcelPoolMetricRow,
  type PoolRunListItem,
  type RankingSortKey,
  type UfFilterResponse,
} from "./types";
import {
  buildVegetationPriorityChain,
  compareByPmCompensation,
  compareByPmPersonneMorale,
  compareByPmProspectDetail,
  compareByVegetationPriority,
  getDominantVegetationRatio,
  normalizePoolMetricsByIdu,
} from "./utils/poolMetrics";
import { useFetchProgress } from "./hooks/useFetchProgress";
import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { ProjectContextMap } from "./components/ProjectContextMap";
import FaunaMapPage from "./pages/FaunaMap/FaunaMapPage";

const ROUTE_ECOCOMPENSATION = "/ecocompensation";

import "./App.css";
import "./components/ResultPanel/results.css";
import "./components/ResultPanel/results-page.css";
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
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
  /** Carte visible dans la vue split Classement (60/40) — masquable pour tableau pleine largeur. */
  const [splitMapVisible, setSplitMapVisible] = useState(true);
  /** Sous-onglets Entonnoir / Classement / Carte pour Unités foncières */
  const [ufSubView, setUfSubView] = useState<ResultsSubView>("classement");
  const [scrollToIdu, setScrollToIdu] = useState<string | null>(null);
  /** Incrémenté à chaque demande de scroll tableau (même IDU rejoué depuis la carte). */
  const [scrollTableNonce, setScrollTableNonce] = useState(0);
  /** Parcelle sélectionnée — surbrillance carte + ligne tableau. */
  const [linkedIdu, setLinkedIdu] = useState<string | null>(null);
  /** Sous-ensemble UF sélectionné — liaison table ↔ carte. */
  const [linkedSubsetId, setLinkedSubsetId] = useState<string | null>(null);
  const [linkedUfId, setLinkedUfId] = useState<string | null>(null);
  const [scrollToSubsetId, setScrollToSubsetId] = useState<string | null>(null);
  const [scrollUfTableNonce, setScrollUfTableNonce] = useState(0);
  const [distanceMaxKm, setDistanceMaxKm] = useState<number>(0);
  const [distanceCursorKm, setDistanceCursorKm] = useState<number>(0);
  const [surfaceMinHa, setSurfaceMinHa] = useState<number>(0);
  const [surfaceMaxHa, setSurfaceMaxHa] = useState<number>(0);
  const [sousEnsemblesStatus, setSousEnsemblesStatus] = useState<SousEnsemblesStatus>("idle");
  const [contextGeom, setContextGeom] = useState<Awaited<ReturnType<typeof fetchProjectContextGeometry>> | null>(null);
  const { connected, progress, parcellesReady, ufReady, pipelineProgress } =
    useFetchProgress(projectId ?? "");
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
  const [ufPoolLoading, setUfPoolLoading] = useState(false);
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
    if (!projectId || !ufReady) return;

    let cancelled = false;
    setUfPoolLoading(true);

    const cesbioLibelles =
      lastFilterOptions?.vegetation_hybride?.cesbio_libelles?.filter(Boolean) ?? [
        "Forêts de conifères",
        "Forêts de feuillus",
      ];
    const faunaSpecies = lastFilterOptions?.faune_criteria?.[0]?.tax_nom_val?.trim() || "";

    void fetchUfResults(projectId, {
      fauna_species: faunaSpecies || undefined,
      cesbio_libelles: cesbioLibelles,
      miller_thresh: lastFilterOptions?.miller_threshold ?? 0.39,
    })
      .then(async (uf) => {
        if (cancelled) return;
        setUfResults(uf);
        setSousEnsemblesStatus("yes");
        const hasSubsets = (uf.unites_foncieres ?? []).some(
          (u) => (u.sous_ensembles ?? []).length > 0,
        );
        if (hasSubsets) {
          try {
            const ufGeo = await fetchUfSubsetsGeojson(projectId);
            if (!cancelled) setUfGeojson(ufGeo);
          } catch {
            if (!cancelled) setUfGeojson(null);
          }
        }
      })
      .catch((err) => {
        console.warn("Pool UF (enrich_uf):", err);
      })
      .finally(() => {
        if (!cancelled) setUfPoolLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, ufReady, lastFilterOptions]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    fetchProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

        void loadStored();
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

  /** Après le nouveau pipeline (CreateAoiPage), charge last_results + UF sans relancer /filter. */
  useEffect(() => {
    if (!projectId || initialRunId || results) return;
    let cancelled = false;
    void (async () => {
      try {
        const stored = await fetchProjectStoredResults(projectId);
        if (cancelled) return;
        const lr = stored.last_results;
        if (
          lr &&
          typeof lr === "object" &&
          Array.isArray((lr as FilterResponse).parcelles) &&
          (lr as FilterResponse).parcelles.length > 0
        ) {
          setResults(lr as FilterResponse);
          setPoolMetricsByIdu(null);
        }

        const lf = stored.last_filter;
        if (lf && typeof lf === "object" && !lastFilterOptions) {
          const raw = lf as Record<string, unknown>;
          if (Array.isArray(raw.cesbio_libelles) || Array.isArray(raw.fauna_criteria)) {
            setLastFilterOptions({
              ...DEFAULT_FILTER,
              min_area_ha: Number(raw.min_area_ha ?? DEFAULT_FILTER.min_area_ha),
              miller_threshold: Number(
                raw.miller_thresh ?? raw.miller_threshold ?? DEFAULT_FILTER.miller_threshold,
              ),
              vegetation_hybride: {
                ...DEFAULT_FILTER.vegetation_hybride,
                cesbio_libelles:
                  (raw.cesbio_libelles as CesbioLibelle[]) ??
                  DEFAULT_FILTER.vegetation_hybride.cesbio_libelles,
              },
              faune_criteria: (
                (raw.fauna_criteria as Array<{
                  species?: string;
                  tax_nom_val?: string;
                  dist_m?: number;
                  radius_m?: number;
                }>) ?? []
              ).map((fc) => ({
                tax_nom_val: fc.tax_nom_val ?? fc.species ?? "",
                mode: "within_radius" as const,
                radius_m: fc.radius_m ?? fc.dist_m ?? 1000,
                sources: [],
              })),
            });
          }
        }

        const ufRaw = stored.last_results_uf;
        if (ufRaw && typeof ufRaw === "object") {
          setUfResults(ufRaw as UfFilterResponse);
          const hasSubsets = (ufRaw as UfFilterResponse).unites_foncieres?.some(
            (u) => (u.sous_ensembles ?? []).length > 0,
          );
          if (hasSubsets) {
            try {
              const ufGeo = await fetchUfSubsetsGeojson(projectId);
              if (!cancelled) setUfGeojson(ufGeo);
            } catch {
              if (!cancelled) setUfGeojson(null);
            }
          }
        }
      } catch {
        /* pas encore de résultats */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialRunId, results, lastFilterOptions]);

  /**
   * GeoJSON carte : toujours via GET /geojson?run_id=… quand un pool_run_id est connu.
   * Sinon fallback last_results (même endpoint sans run_id).
   */
  useEffect(() => {
    if (!projectId || !results?.parcelles?.length) {
      setGeojson(null);
      return;
    }
    const runId = initialRunId ?? results.pool_run_id ?? null;
    let cancelled = false;
    void (async () => {
      try {
        const geo = await fetchParcellesGeojson(projectId, runId);
        if (!cancelled) setGeojson(geo as ParcellesGeoJSON);
      } catch (err) {
        console.warn("GeoJSON parcelles (pool):", err);
        if (!cancelled) setGeojson(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length, results?.total]);

  /** Précharge CESBIO / faune / buffers (couches nationales clippées AOI) pour la légende carte. */
  useEffect(() => {
    if (!projectId || !results?.parcelles?.length) return;
    const runId = initialRunId ?? results.pool_run_id ?? null;
    const pid = projectId;
    thematicPrefetchSeqRef.current += 1;
    const prefetchSeq = thematicPrefetchSeqRef.current;
    setThematicPreloadLoading(true);
    void prefetchAllResultsThematicLayers(pid, runId)
      .then((data) => {
        if (projectIdRef.current !== pid) return;
        setThematicPreload(data);
      })
      .finally(() => {
        if (thematicPrefetchSeqRef.current !== prefetchSeq) return;
        setThematicPreloadLoading(false);
      });
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length]);

  /** Métriques pool (filter_enrich, scores…) — bulk par run_id. */
  useEffect(() => {
    const runId = initialRunId ?? results?.pool_run_id ?? null;
    if (!projectId || !runId || !results?.parcelles?.length) return;

    let cancelled = false;
    setPoolMetricsByIdu(null);

    void (async () => {
      try {
        const bulk = await fetchPoolRunMetricsBulk(projectId, runId);
        if (cancelled) return;
        setPoolMetricsByIdu(normalizePoolMetricsByIdu(bulk.by_idu));
      } catch (e) {
        console.warn("Métriques pool (bulk):", e);
        if (!cancelled) setPoolMetricsByIdu({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length]);

  useEffect(() => {
    if (!projectId) {
      setFoncierGeojson(null);
      return;
    }
    let cancelled = false;
    fetchFoncierGeojson(projectId)
      .then((f) => {
        if (!cancelled) setFoncierGeojson(f);
      })
      .catch(() => {
        if (!cancelled) setFoncierGeojson(null);
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

  async function handleBatchMarkIndesirable(idus: string[]) {
    if (!projectId || !results?.pool_run_id || !idus.length) return;
    await addPoolIndesirables(projectId, results.pool_run_id, idus);
    const next = await fetchPoolIndesirables(projectId);
    setIndesirableIdus(next.idus ?? []);
    setIndesirableParcellesStored(next.parcelles ?? []);
    setIndesirableMetricsByIdu(next.by_idu ?? {});
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

  function handleMapParcelleClick(idu: string) {
    setMainResultsTab("parcelles");
    if (parcelSubView !== "classement" && parcelSubView !== "classement_combine") {
      setParcelSubView("classement");
    }
    if (!splitMapVisible) {
      setSplitMapVisible(true);
    }
    setLinkedIdu(idu);
    setScrollToIdu(idu);
    setScrollTableNonce((n) => n + 1);
  }

  function handleTableRowActivate(idu: string) {
    setLinkedIdu(idu);
    if (!splitMapVisible) {
      setSplitMapVisible(true);
    }
  }

  function findUfIdForSubset(subsetId: string): string | null {
    for (const uf of ufResults?.unites_foncieres ?? []) {
      if ((uf.sous_ensembles ?? []).some((ss) => ss.subset_id === subsetId)) {
        return uf.uf_id;
      }
    }
    return null;
  }

  function handleMapSubsetClick(subsetId: string) {
    setMainResultsTab("unites");
    if (ufSubView !== "classement") {
      setUfSubView("classement");
    }
    if (!splitMapVisible) {
      setSplitMapVisible(true);
    }
    setLinkedSubsetId(subsetId);
    setLinkedUfId(findUfIdForSubset(subsetId));
    setScrollToSubsetId(subsetId);
    setScrollUfTableNonce((n) => n + 1);
  }

  function handleTableSubsetActivate(subsetId: string) {
    setLinkedSubsetId(subsetId);
    setLinkedUfId(findUfIdForSubset(subsetId));
    if (!splitMapVisible) {
      setSplitMapVisible(true);
    }
  }

  function handleTableUfActivate(ufId: string) {
    setLinkedUfId(ufId);
    setLinkedSubsetId(null);
    if (!splitMapVisible) {
      setSplitMapVisible(true);
    }
  }

  function handleToolbarProjectChange(newProjectId: string) {
    if (initialRunId && onProjectChangeNavigate) {
      onProjectChangeNavigate(newProjectId);
      return;
    }
    navigate(`/projects/${newProjectId}/filter`);
  }

  function handleToolbarRunChange(runId: string) {
    if (!projectId) return;
    navigate(`/projects/${projectId}/runs/${runId}`);
  }

  /** Scroll interne entonnoir (liste d’étapes longue) */
  const isEntonnoirScroll =
    (mainResultsTab === "parcelles" && parcelSubView === "entonnoir") ||
    (mainResultsTab === "unites" && ufSubView === "entonnoir");

  const subsetScores = useMemo(() => {
    if (!ufResults) return null;
    const m: Record<string, number> = {};
    for (const uf of ufResults.unites_foncieres ?? []) {
      for (const ss of uf.sous_ensembles ?? []) {
        const scoreEco = ss.score_eco as { total_score?: number } | undefined;
        if (typeof scoreEco?.total_score === "number") {
          m[ss.subset_id] = scoreEco.total_score;
        }
      }
    }
    if (Object.keys(m).length > 0) return m;
    for (const uf of ufResults.unites_foncieres ?? []) {
      const n = (uf.sous_ensembles ?? []).length;
      for (const [idx, ss] of (uf.sous_ensembles ?? []).entries()) {
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
    } else if (rankingSortKey === "pm_personne_morale") {
      list = [...list].sort((a, b) =>
        compareByPmPersonneMorale(a.idu, b.idu, poolMetricsByIdu, a.rank, b.rank),
      );
    } else if (rankingSortKey === "pm_compensation") {
      list = [...list].sort((a, b) =>
        compareByPmCompensation(a.idu, b.idu, poolMetricsByIdu, a.rank, b.rank),
      );
    } else if (rankingSortKey === "pm_prospect_detail") {
      list = [...list].sort((a, b) =>
        compareByPmProspectDetail(a.idu, b.idu, poolMetricsByIdu, a.rank, b.rank),
      );
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

  const activeRunId = initialRunId ?? results?.pool_run_id ?? null;
  const isSplitParcelView =
    mainResultsTab === "parcelles" &&
    (parcelSubView === "classement" || parcelSubView === "classement_combine");
  const isSplitUfView = mainResultsTab === "unites" && ufSubView === "classement";

  const resultsSplitClassName = `results-split${splitMapVisible ? "" : " results-split--map-hidden"}`;

  const resultsContentClass = `results-content${
    isEntonnoirScroll
      ? " results-content--entonnoir"
      : isSplitParcelView || isSplitUfView
        ? ""
        : " results-content--full"
  }`;

  const parcellesMapPanel = geojson ? (
    <ParcellesMap
      geojson={parcellesMapGeojson ?? geojson}
      foncierGeojson={foncierGeojson}
      projectId={projectId}
      poolRunId={activeRunId}
      preloadedThematic={thematicPreload}
      thematicPreloadLoading={thematicPreloadLoading}
      poolMetricsByIdu={poolMetricsByIdu}
      indesirableCount={indesirableIdus.length}
      loadingMessage={loadingStatusText}
      focusIdu={linkedIdu}
      onParcelleClick={handleMapParcelleClick}
    />
  ) : (
    <div style={{ padding: 12, fontSize: 13, color: "#4b4b4b" }}>
      GeoJSON parcelles indisponible ou aucune géométrie.
    </div>
  );

  const ufMapPanel = ufGeojson ? (
    <SousEnsemblesMap
      geojson={ufGeojson as FeatureCollection<Geometry, Record<string, unknown>>}
      subsetScores={subsetScores}
      foncierGeojson={foncierGeojson}
      projectId={projectId}
      preloadedThematic={thematicPreload}
      thematicPreloadLoading={thematicPreloadLoading}
      focusSubsetId={linkedSubsetId}
      focusUfId={linkedSubsetId ? null : linkedUfId}
      onSubsetClick={handleMapSubsetClick}
    />
  ) : (
    <div style={{ padding: 12, fontSize: 13, color: "#4b4b4b" }}>
      GeoJSON des sous-ensembles indisponible ou vide.
    </div>
  );

  return (
    <div className="results-page">
      <ResultsToolbar
        projectId={projectId}
        projects={projects}
        projectsLoading={projectsLoading}
        poolRuns={poolRuns}
        activeRunId={activeRunId}
        onNewStudy={() => onNavigateToCreate?.()}
        onProjectChange={handleToolbarProjectChange}
        onRunChange={handleToolbarRunChange}
      />

      <div className="results-page__body">
        {!connected && (
          <div className="results-status results-status--loading">Connexion au serveur…</div>
        )}

        {(progress?.status === "fetching" || progress?.status === "filtering") && (
          <div className="results-status results-status--warn">
            {progress?.status === "filtering"
              ? "Filtrage écologique en cours…"
              : "Récupération des données en cours…"}
          </div>
        )}

        {progress?.status === "ready" && results && (
          <div className="results-status results-status--ok">Données prêtes</div>
        )}

        {loadingStatusText && (
          <div className="results-status results-status--loading loading-text-breathe">
            {loadingStatusText}
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
                disabled={!parcellesReady && !ufReady && sousEnsemblesStatus !== "yes"}
                onClick={() => setMainResultsTab("unites")}
                title={
                  !parcellesReady && !ufReady && sousEnsemblesStatus === "no"
                    ? "Unités foncières en cours de calcul ou absentes."
                    : sousEnsemblesStatus === "loading"
                      ? "Vérification des données UF…"
                      : !ufResults && !ufPoolLoading && ufReady
                        ? "Chargement du classement UF…"
                        : !ufResults && !ufReady && sousEnsemblesStatus === "yes"
                          ? "Lancez le filtre pour calculer les résultats UF."
                          : ""
                }
              >
                Unités foncières
                {!ufReady && parcellesReady && (
                  <span className="results-tab-spinner" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Sous-onglets : Entonnoir | Classement | Carte */}
            {mainResultsTab === "parcelles" && (
              <div className="results-tabs results-tabs-sub results-tabs-sub--split-actions">
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
                {isSplitParcelView && (
                  <button
                    type="button"
                    className="results-split-map-toggle"
                    onClick={() => setSplitMapVisible((v) => !v)}
                    aria-pressed={splitMapVisible}
                    title={
                      splitMapVisible
                        ? "Masquer la carte pour afficher le tableau sur toute la largeur"
                        : "Réafficher la carte à côté du tableau"
                    }
                  >
                    {splitMapVisible ? "Masquer la carte" : "Afficher la carte"}
                  </button>
                )}
              </div>
            )}
            {mainResultsTab === "unites" && sousEnsemblesStatus === "yes" && ufResults && (
              <div className="results-tabs results-tabs-sub results-tabs-sub--split-actions">
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
                {isSplitUfView && (
                  <button
                    type="button"
                    className="results-split-map-toggle"
                    onClick={() => setSplitMapVisible((v) => !v)}
                    aria-pressed={splitMapVisible}
                    title={
                      splitMapVisible
                        ? "Masquer la carte pour afficher le tableau sur toute la largeur"
                        : "Réafficher la carte à côté du tableau"
                    }
                  >
                    {splitMapVisible ? "Masquer la carte" : "Afficher la carte"}
                  </button>
                )}
              </div>
            )}

            <div className={resultsContentClass}>
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
                <div className={resultsSplitClassName}>
                  <div className="results-split__table">
                    <div className="results-split__table-inner">
                      {distanceMaxKm > 0 && (
                        <div style={{ padding: "0 0 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 12, color: "#111" }}>
                            Distance AOI :{" "}
                            <strong>{distanceCursorKm.toFixed(1)} km</strong>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={distanceMaxKm}
                            step={0.1}
                            value={Math.min(Math.max(distanceCursorKm, 1), distanceMaxKm)}
                            onChange={(e) => setDistanceCursorKm(parseFloat(e.target.value))}
                          />
                          <div style={{ fontSize: 12, color: "#111" }}>
                            Surface min. : <strong>{surfaceMinHa.toFixed(1)} ha</strong>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(1, surfaceMaxHa)}
                            step={0.1}
                            value={Math.min(Math.max(surfaceMinHa, 0), Math.max(1, surfaceMaxHa))}
                            onChange={(e) => setSurfaceMinHa(parseFloat(e.target.value))}
                          />
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
                          scrollTableNonce={scrollTableNonce}
                          selectedIdu={linkedIdu}
                          onRowActivate={handleTableRowActivate}
                          onMarkIndesirable={handleMarkIndesirable}
                          onBatchMarkIndesirable={handleBatchMarkIndesirable}
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
                          onRowActivate={handleTableRowActivate}
                        />
                      )}
                    </div>
                  </div>
                  <div className="results-split__map">
                    <div className="results-split__map-label">Carte</div>
                    <div className="results-split__map-inner">{parcellesMapPanel}</div>
                  </div>
                </div>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "classement_combine" && (
                <div className={resultsSplitClassName}>
                  <div className="results-split__table">
                    <div className="results-split__table-inner">
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
                          scrollTableNonce={scrollTableNonce}
                          selectedIdu={linkedIdu}
                          onRowActivate={handleTableRowActivate}
                          onMarkIndesirable={undefined}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="results-split__map">
                    <div className="results-split__map-label">Carte</div>
                    <div className="results-split__map-inner">{parcellesMapPanel}</div>
                  </div>
                </div>
              )}

              {mainResultsTab === "parcelles" && parcelSubView === "carte" && parcellesMapPanel}

              {mainResultsTab === "unites" && ufResults && ufSubView === "classement" && (
                <div className={resultsSplitClassName}>
                  <div className="results-split__table">
                    <div className="results-split__table-inner">
                      <UnitesFoncieresTable
                        ufResults={ufResults}
                        projectId={projectId}
                        selectedSubsetId={linkedSubsetId}
                        scrollToSubsetId={scrollToSubsetId}
                        scrollTableNonce={scrollUfTableNonce}
                        onSubsetActivate={handleTableSubsetActivate}
                        onUfActivate={handleTableUfActivate}
                      />
                    </div>
                  </div>
                  <div className="results-split__map">
                    <div className="results-split__map-label">Carte</div>
                    <div className="results-split__map-inner">{ufMapPanel}</div>
                  </div>
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && (ufPoolLoading || (!ufReady && parcellesReady && sousEnsemblesStatus !== "no")) && (
                <div className="uf-loading">
                  <span className="parcelles-map-spinner" aria-hidden="true" />
                  <p>Calcul des unités foncières en cours…</p>
                  <p className="uf-loading-hint">
                    Les parcelles individuelles sont déjà disponibles dans l&apos;onglet Parcelles.
                  </p>
                  <PipelineProgressPanel progress={pipelineProgress} compact />
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && !ufPoolLoading && ufReady && sousEnsemblesStatus === "yes" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucune unité foncière ne correspond aux critères (végétation / faune / Miller).
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && !ufPoolLoading && !ufReady && sousEnsemblesStatus === "no" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucun sous-ensemble en base pour ce projet. Générez la couche « sous-ensembles » (unités
                  foncières) en amont, puis relancez le filtre — seul le classement parcelles sera disponible
                  tant qu’il n’y a pas de lignes dans{" "}
                  <code style={{ fontSize: 12 }}>ecocompensation_results.sous_ensembles</code>.
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && !ufPoolLoading && !ufReady && sousEnsemblesStatus === "yes" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Lancez le filtre pour calculer et afficher les résultats unités foncières.
                </div>
              )}
              {mainResultsTab === "unites" && ufResults && ufSubView === "carte" && ufMapPanel}
            </div>
          </>
        ) : projectId ? (
          <div className="results-content results-content--full" style={{ minHeight: 420 }}>
            <ProjectContextMap
              parcelleFeature={contextGeom?.parcelle_source ?? null}
              aoiFeature={contextGeom?.aoi ?? null}
              foncierFeature={contextGeom?.foncier ?? null}
            />
            <div className="empty-state" style={{ padding: "2rem" }}>
              <span className="empty-text">
                Aucun pool de parcelles pour ce projet. Lancez une nouvelle étude ou sélectionnez un run.
              </span>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">⬡</span>
            <span className="empty-text">Sélectionnez un projet ou créez une nouvelle étude</span>
            {onNavigateToCreate && (
              <button
                type="button"
                className="results-toolbar__btn results-toolbar__btn--primary"
                onClick={onNavigateToCreate}
              >
                Nouvelle étude
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateAoiRoutePage() {
  const navigate = useNavigate();
  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <CreateAoiPage
        onDone={(id) => navigate(`/projects/${id}/filter`)}
        onBack={() => navigate("/")}
      />
    </div>
  );
}

function ProjectFilterRoutePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  return (
    <EcoCompensationApp
      fixedProjectId={projectId ?? null}
      onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)}
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
      onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)}
      onProjectChangeNavigate={(id) => navigate(`/projects/${id}/filter`)}
    />
  );
}

function StudyHomeRoutePage() {
  const navigate = useNavigate();
  return <EcoCompensationApp onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)} />;
}

/* =========================================================
   LE VRAI APP = ROUTEUR
   ========================================================= */

export default function App() {
  return (
    <div className="kerelia-app">
      <AppHeader />

      <div className="kerelia-app__main">
        <Routes>
          <Route path="/" element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
          <Route path={ROUTE_ECOCOMPENSATION} element={<CreateAoiRoutePage />} />
          <Route path="/create-aoi" element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
          <Route path="/etude" element={<StudyHomeRoutePage />} />
          <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
          <Route path="/projects/:projectId/runs/:runId" element={<ProjectRunRoutePage />} />
          <Route path="/faune" element={<FaunaMapPage />} />
        </Routes>
      </div>
    </div>
  );
}

function AppHeader() {
  const location = useLocation();
  const etudeActive =
    location.pathname === "/etude" || location.pathname.startsWith("/projects/");

  return (
    <header className="kerelia-app__header">
      <NavLink to={ROUTE_ECOCOMPENSATION} className="kerelia-app__brand">
        <span className="kerelia-app__brand-dot" aria-hidden />
        <span className="kerelia-app__brand-name">KERELIA</span>
        <span className="kerelia-app__brand-sub">EcoCompensation</span>
      </NavLink>

      <nav className="kerelia-app__nav" aria-label="Navigation principale">
        <NavLink
          to={ROUTE_ECOCOMPENSATION}
          className={({ isActive }) =>
            `kerelia-app__nav-link${isActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Ecocompensation
        </NavLink>
        <NavLink
          to="/etude"
          className={() =>
            `kerelia-app__nav-link${etudeActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Étude
        </NavLink>
        <NavLink
          to="/faune"
          className={({ isActive }) =>
            `kerelia-app__nav-link${isActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Carte faune
        </NavLink>
      </nav>
    </header>
  );
}