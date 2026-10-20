import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { AppDialog } from "./ResultPanel/AppDialog";
import { FunnelDisplay } from "./ResultPanel/FunnelDisplay";
import { ResultsToolbar, type ResultsToolbarStatus } from "./ResultPanel/ResultsToolbar";
import { PipelineProgressPanel } from "../../components/PipelineProgressPanel";
import {
  EtudeResultatsCombinedTable,
  EtudeResultatsParcellesTable,
  EtudeResultatsUnitesTable,
} from "./EtudeResultatsTable";
import { EtudeResultatsParcellesMap, EtudeResultatsUnitesMap, ResultsSplit, SplitMapFrame } from "./EtudeResultatsMap";
import "../../components/pipelineProgressPanel.css";
import type { ParcellesGeoJSON } from "./ResultPanel/MapResults/ParcellesMap";
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
  fetchAllPoolRunsList,
  fetchPoolRunsList,
  fetchProjectStoredResults,
  fetchProjects,
  deleteProject,
  computePoolRunDurete,
  computePoolRunUrbanisme,
  addParcellesToPoolRun,
  startUfSearch,
} from "../../api";
import type { ProjectSummary } from "../../api";
import type { ResultsThematicPreload } from "./ResultPanel/MapResults/cartoCouchesRegistry";
import {
  type FilterOptions,
  type FilterResponse,
  type ParcelPoolMetricRow,
  type PoolRunListItem,
  type RankingSortKey,
  type UfFilterResponse,
} from "../../types";
import {
  buildVegetationPriorityChain,
  compareByPmCompensation,
  compareByPmPersonneMorale,
  compareByPmProspectDetail,
  compareByVegetationPriority,
  getDominantVegetationRatio,
  normalizePoolMetricsByIdu,
} from "../../utils/poolMetrics";
import { useFetchProgress } from "../../hooks/useFetchProgress";
import { ProjectContextMap } from "../../components/ProjectContextMap";
import { getStudyProfile, getMapLayerKeys } from "./studyProfiles";
import { parseStoredFilterResponse, parseStoredLastFilter } from "../../utils/storedFilterResults";
import { normalizeStudyType } from "../../types/studyTypes";
import "./ResultPanel/results.css";
import "./ResultPanel/results-page.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

/** Onglets principaux : Parcelles | Unités foncières */
type MainResultsTab = "parcelles" | "unites" | "combine";
/** Sous-vues : tableau | carte */
type ResultsSubView = "classement" | "classement_combine" | "carte";
type FilterLoadingStage = "idle" | "filtering" | "profiling" | "metrics_loading";

/** Présence de lignes dans ecocompensation_results.sous_ensembles pour le projet (filtre UF possible). */
type SousEnsemblesStatus = "idle" | "loading" | "yes" | "no";

export interface EtudeResultatsProps {
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

function formatStudyWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

const OPEN_STUDY_MIN_MS = 450;

function PoolOpenLoading({ label = "Chargement du pool…" }: { label?: string }) {
  return (
    <div className="etude-open-loading" role="status" aria-live="polite">
      <span className="etude-open-loading__spinner" aria-hidden />
      <span className="etude-open-loading__label">{label}</span>
    </div>
  );
}

function EtudesHomeTable({
  poolRuns,
  projects,
  onOpen,
  onNewStudy,
  onDeleted,
  projectsLoaded = true,
}: {
  poolRuns: PoolRunListItem[];
  projects: ProjectSummary[];
  onOpen: (projectId: string, poolId: string) => void;
  onNewStudy?: () => void;
  onDeleted: (projectId: string) => void;
  projectsLoaded?: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ projectId: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const knownProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const rows = useMemo(
    () =>
      [...poolRuns]
        .filter((run) => knownProjectIds.has(run.project_id))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [poolRuns, knownProjectIds],
  );

  function askDelete(e: MouseEvent, projectId: string, name: string) {
    e.stopPropagation();
    if (deletingId) return;
    setDeleteError(null);
    setPendingDelete({ projectId, name });
  }

  async function confirmDelete() {
    if (!pendingDelete || deletingId) return;
    const { projectId } = pendingDelete;
    setDeletingId(projectId);
    setDeleteError(null);
    try {
      await deleteProject(projectId);
      onDeleted(projectId);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  if (!projectsLoaded) {
    return <PoolOpenLoading label="Chargement des études…" />;
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⬡</span>
        <span className="empty-text">Aucune étude enregistrée</span>
        {onNewStudy && (
          <button
            type="button"
            className="results-toolbar__btn results-toolbar__btn--primary"
            onClick={onNewStudy}
          >
            Nouvelle étude
          </button>
        )}
      </div>
    );
  }

  function openStudy(projectId: string, poolId: string) {
    if (openingId) return;
    setOpeningId(poolId);
    onOpen(projectId, poolId);
  }

  return (
    <div className={`etudes-home${openingId ? " etudes-home--opening" : ""}`}>
      {openingId && <PoolOpenLoading />}
      <table className="etudes-home__table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Nom</th>
            <th>Parcelles dans le pool</th>
            <th className="etudes-home__col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((run) => {
            const project = projects.find((p) => p.id === run.project_id);
            const name = project?.name?.trim() || project?.id.slice(0, 8) || "Étude";
            const isDeleting = deletingId === run.project_id;
            return (
              <tr
                key={run.id}
                tabIndex={0}
                onClick={() => openStudy(run.project_id, run.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openStudy(run.project_id, run.id);
                  }
                }}
              >
                <td>{formatStudyWhen(run.created_at)}</td>
                <td>{name}</td>
                <td>{run.total_count.toLocaleString("fr-FR")}</td>
                <td className="etudes-home__col-actions">
                  <button
                    type="button"
                    className="etudes-home__delete"
                    title={`Supprimer « ${name} »`}
                    aria-label={`Supprimer l’étude ${name}`}
                    disabled={isDeleting}
                    onClick={(e) => askDelete(e, run.project_id, name)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pendingDelete && (
        <div
          className="etudes-home-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!deletingId) setPendingDelete(null);
          }}
        >
          <div
            className="etudes-home-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="etude-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="etude-delete-title">Supprimer cette étude ?</h2>
            <p>
              L’étude « {pendingDelete.name} » et toutes les données associées (résultats, AOI,
              foncier, pools) seront définitivement supprimées.
            </p>
            {deleteError && <p className="etudes-home-modal__error">{deleteError}</p>}
            <div className="etudes-home-modal__actions">
              <button
                type="button"
                className="results-toolbar__btn"
                disabled={!!deletingId}
                onClick={() => setPendingDelete(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="etudes-home-modal__confirm"
                disabled={!!deletingId}
                onClick={() => void confirmDelete()}
              >
                {deletingId ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseIduParts(raw: string): { codeInsee: string; section: string; numero: string } {
  const idu = String(raw ?? "").trim();
  return {
    codeInsee: idu.slice(0, 5) || "",
    section: idu.slice(8, 10) || "",
    numero: idu.slice(-4) || "",
  };
}

export function EtudeResultats({
  fixedProjectId = null,
  initialRunId = null,
  onNavigateToCreate,
}: EtudeResultatsProps) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(fixedProjectId);
  const [poolRuns, setPoolRuns] = useState<PoolRunListItem[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(initialRunId));
  const [openStudyLoading, setOpenStudyLoading] = useState(() => Boolean(initialRunId));
  const [openStudyError, setOpenStudyError] = useState(false);
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
  const [tableShare, setTableShare] = useState(0.6);
  /** Sous-onglets Entonnoir / Classement / Carte pour Unités foncières */
  const [ufSubView, setUfSubView] = useState<ResultsSubView>("classement");
  const [scrollToIdu, setScrollToIdu] = useState<string | null>(null);
  const [detailFocus, setDetailFocus] = useState<{
    idu: string;
    tab: "durete" | "urbanisme";
    nonce: number;
  } | null>(null);
  const displayedIdusRef = useRef<string[]>([]);
  /** Incrémenté à chaque demande de scroll tableau (même IDU rejoué depuis la carte). */
  const [scrollTableNonce, setScrollTableNonce] = useState(0);
  /** Parcelle sélectionnée — surbrillance carte + ligne tableau. */
  const [linkedIdu, setLinkedIdu] = useState<string | null>(null);
  const [mapFocusNonce, setMapFocusNonce] = useState(0);
  /** Survol tableau — highlight carte sans bouger la caméra. */
  const [hoverIdu, setHoverIdu] = useState<string | null>(null);
  /** Sous-ensemble UF sélectionné — liaison table ↔ carte. */
  const [linkedSubsetId, setLinkedSubsetId] = useState<string | null>(null);
  const [linkedUfId, setLinkedUfId] = useState<string | null>(null);
  const [hoverSubsetId, setHoverSubsetId] = useState<string | null>(null);
  const [hoverUfId, setHoverUfId] = useState<string | null>(null);
  const [scrollToSubsetId, setScrollToSubsetId] = useState<string | null>(null);
  const [scrollUfTableNonce, setScrollUfTableNonce] = useState(0);
  const [distanceMaxKm, setDistanceMaxKm] = useState<number>(0);
  const [distanceCursorKm, setDistanceCursorKm] = useState<number>(0);
  const [surfaceMinHa, setSurfaceMinHa] = useState<number>(0);
  const [surfaceMaxHa, setSurfaceMaxHa] = useState<number>(0);
  const [sousEnsemblesStatus, setSousEnsemblesStatus] = useState<SousEnsemblesStatus>("idle");
  const [contextGeom, setContextGeom] = useState<Awaited<ReturnType<typeof fetchProjectContextGeometry>> | null>(null);
  const { connected, progress, parcellesReady, ufReady, pipelineProgress } =
    useFetchProgress(projectId);
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
  const [rankingSortDir, setRankingSortDir] = useState<"asc" | "desc">("desc");
  /** IDU exclus du classement (pool indésirables), aligné sur `results.pool_run_id`. */
  const [indesirableIdus, setIndesirableIdus] = useState<string[]>([]);
  const [indesirableParcellesStored, setIndesirableParcellesStored] = useState<FilterResponse["parcelles"]>([]);
  const [indesirableMetricsByIdu, setIndesirableMetricsByIdu] = useState<Record<string, ParcelPoolMetricRow[]>>({});
  const [dureteFonciereLoading, setDureteFonciereLoading] = useState(false);
  const [urbanismeLoading, setUrbanismeLoading] = useState(false);
  const [toolNotice, setToolNotice] = useState<{ title: string; body: string; error?: boolean } | null>(null);
  const [addParcellesLoading, setAddParcellesLoading] = useState(false);
  const [ufSearchLoading, setUfSearchLoading] = useState(false);
  const [metricsRefreshNonce, setMetricsRefreshNonce] = useState(0);
  const [ufPoolLoading, setUfPoolLoading] = useState(false);
  const [storedResultsLoading, setStoredResultsLoading] = useState(false);
  const [storedProjectStatus, setStoredProjectStatus] = useState<string | null>(null);
  const hasParcellesFunnel = (results?.funnel ?? []).some((s) => s.count >= 0);
  const hasUfFunnel = (ufResults?.funnel ?? []).some((s) => s.count >= 0);

  const currentStudyProfile = useMemo(() => {
    const current = projects.find((p) => p.id === projectId);
    return getStudyProfile(normalizeStudyType(current?.study_type));
  }, [projects, projectId]);

  const mapLayerKeys = useMemo(() => {
    const hasFauna = (lastFilterOptions?.faune_criteria?.length ?? 0) > 0;
    const keys = getMapLayerKeys(currentStudyProfile.id, hasFauna);
    if (
      typeof lastFilterOptions?.troncons_hydros_max_dist_m === "number"
      && !keys.includes("troncons_hydros")
    ) {
      keys.push("troncons_hydros");
    }
    if (
      typeof lastFilterOptions?.surfaces_hydros_max_dist_m === "number"
      && !keys.includes("surfaces_hydros")
    ) {
      keys.push("surfaces_hydros");
    }
    if (
      lastFilterOptions?.zone_humide_mode === "intersect"
      || lastFilterOptions?.zone_humide_mode === "exclude"
    ) {
      if (!keys.includes("zone_humide")) keys.push("zone_humide");
    }
    if (
      lastFilterOptions?.zones_humides_probables_mode === "intersect"
      || lastFilterOptions?.zones_humides_probables_mode === "exclude"
    ) {
      if (!keys.includes("zones_humides_probables")) keys.push("zones_humides_probables");
    }
    return keys;
  }, [
    currentStudyProfile.id,
    lastFilterOptions?.faune_criteria,
    lastFilterOptions?.troncons_hydros_max_dist_m,
    lastFilterOptions?.surfaces_hydros_max_dist_m,
    lastFilterOptions?.zone_humide_mode,
    lastFilterOptions?.zones_humides_probables_mode,
  ]);

  const isZhStudy = currentStudyProfile.id === "zones_humides_intra";
  const showZoneHumideColumn =
    isZhStudy
    || lastFilterOptions?.zone_humide_mode === "intersect"
    || lastFilterOptions?.zone_humide_mode === "exclude";
  const showDistHydroColumn =
    typeof lastFilterOptions?.troncons_hydros_max_dist_m === "number";
  const showSurfaceHydroColumn =
    typeof lastFilterOptions?.surfaces_hydros_max_dist_m === "number";

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    setProjectId(fixedProjectId ?? null);
  }, [fixedProjectId]);

  /** S’il existe des sous-ensembles en base pour ce projet, le pool UF est disponible. */
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
    if (ufReady) setUfSearchLoading(false);
  }, [ufReady]);

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
      study_type: currentStudyProfile.id,
      min_zone_humide_ha: lastFilterOptions?.min_zone_humide_ha,
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
  }, [projectId, ufReady, lastFilterOptions, currentStudyProfile.id]);

  useEffect(() => {
    let cancelled = false;
    fetchProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAllPoolRunsList(200)
      .then((r) => {
        if (cancelled) return;
        setPoolRuns(r.runs ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoolRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId || !initialRunId) return;

    // StrictMode : le 1er effet est démonté avant le 2e ; ne pas court-circuiter avec une ref
    // posée trop tôt (sinon aucun fetch métriques / geo, loading bloqué à l’infini).
    let active = true;
    const openedAt = Date.now();
    setOpenStudyError(false);
    setOpenStudyLoading(true);
    setLoading(true);
    setFilterLoadingStage("metrics_loading");
    thematicPrefetchSeqRef.current += 1;
    setThematicPreloadLoading(false);
    setThematicPreload(null);

    const releaseOpenLoader = async () => {
      const wait = Math.max(0, OPEN_STUDY_MIN_MS - (Date.now() - openedAt));
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
      if (active) setOpenStudyLoading(false);
    };

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
        await releaseOpenLoader();

        void loadStored();
      } catch (err) {
        console.error("Chargement run:", err);
        if (active) setOpenStudyError(true);
        alert(err instanceof Error ? err.message : "Impossible de charger ce run.");
        await releaseOpenLoader();
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

  /** Après filter_v2 (CreateAoiPage), charge last_results + UF sans relancer le pipeline. */
  useEffect(() => {
    if (!projectId || initialRunId) return;
    let cancelled = false;
    setStoredResultsLoading(true);
    void (async () => {
      try {
        const stored = await fetchProjectStoredResults(projectId);
        if (cancelled) return;
        setStoredProjectStatus(stored.status ?? null);

        let parsed = parseStoredFilterResponse(stored.last_results);
        const filterOpts = parseStoredLastFilter(stored.last_filter);
        let metricsFromSnapshot = false;

        if (!parsed) {
          try {
            const runsResp = await fetchPoolRunsList(projectId, 5);
            const latest = runsResp.runs?.find((r) => r.scope === "parcelles");
            if (latest && !cancelled) {
              const snap = await fetchPoolRunSnapshot(projectId, latest.id);
              if (!cancelled) {
                parsed = {
                  ...(snap as FilterResponse),
                  run_created_at: snap.run_created_at ?? undefined,
                };
                if (snap.filter_options) {
                  setLastFilterOptions(snap.filter_options as FilterOptions);
                }
                if (snap.by_idu) {
                  setPoolMetricsByIdu(normalizePoolMetricsByIdu(snap.by_idu));
                  metricsFromSnapshot = true;
                }
              }
            }
          } catch (e) {
            console.warn("Repli chargement run pool:", e);
          }
        }

        if (parsed && !cancelled) {
          setResults(parsed);
          if (!metricsFromSnapshot) {
            setPoolMetricsByIdu(null);
          }
        }

        if (filterOpts && !cancelled) {
          setLastFilterOptions(filterOpts);
        }

        const ufRaw = stored.last_results_uf;
        if (ufRaw && typeof ufRaw === "object" && !cancelled) {
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
      } catch (e) {
        console.warn("Chargement last_results:", e);
      } finally {
        if (!cancelled) setStoredResultsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialRunId]);

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
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length, results?.total, metricsRefreshNonce]);

  /** Précharge CESBIO / faune / buffers (couches nationales clippées AOI) pour la légende carte. */
  useEffect(() => {
    if (!projectId || !results?.parcelles?.length) return;
    const runId = initialRunId ?? results.pool_run_id ?? null;
    const pid = projectId;
    thematicPrefetchSeqRef.current += 1;
    const prefetchSeq = thematicPrefetchSeqRef.current;
    setThematicPreloadLoading(true);
    void prefetchAllResultsThematicLayers(pid, runId, mapLayerKeys)
      .then((data) => {
        if (projectIdRef.current !== pid) return;
        setThematicPreload(data);
      })
      .finally(() => {
        if (thematicPrefetchSeqRef.current !== prefetchSeq) return;
        setThematicPreloadLoading(false);
      });
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length, mapLayerKeys]);

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
  }, [projectId, initialRunId, results?.pool_run_id, results?.parcelles?.length, metricsRefreshNonce]);

  function openComputedRankingLine(tab: "durete" | "urbanisme", idus?: string[]) {
    const order = displayedIdusRef.current;
    const target =
      (idus ?? []).find((id) => order.includes(id)) ?? idus?.[0] ?? order[0] ?? null;
    if (!target) return;
    setMainResultsTab("parcelles");
    setScrollToIdu(target);
    setScrollTableNonce((n) => n + 1);
    setDetailFocus((prev) => ({ idu: target, tab, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  async function handleRunDureteFonciere(idus?: string[]) {
    const runId = initialRunId ?? results?.pool_run_id ?? null;
    if (!projectId || !runId) return;
    setDureteFonciereLoading(true);
    try {
      await computePoolRunDurete(projectId, runId, idus);
      setMetricsRefreshNonce((n) => n + 1);
      openComputedRankingLine("durete", idus);
    } catch (e) {
      setToolNotice({
        title: "Dureté foncière",
        body: e instanceof Error ? e.message : "Échec du calcul de dureté foncière.",
        error: true,
      });
    } finally {
      setDureteFonciereLoading(false);
    }
  }

  async function handleRunUrbanisme(idus?: string[]) {
    const runId = initialRunId ?? results?.pool_run_id ?? null;
    if (!projectId || !runId) return;
    setUrbanismeLoading(true);
    try {
      await computePoolRunUrbanisme(projectId, runId, idus);
      setMetricsRefreshNonce((n) => n + 1);
      openComputedRankingLine("urbanisme", idus);
    } catch (e) {
      setToolNotice({
        title: "Urbanisme",
        body: e instanceof Error ? e.message : "Échec du profil urbanisme.",
        error: true,
      });
    } finally {
      setUrbanismeLoading(false);
    }
  }

  async function handleAddParcelles(idus: string[]) {
    const runId = initialRunId ?? results?.pool_run_id ?? null;
    if (!projectId || !runId) return;
    setAddParcellesLoading(true);
    try {
      const resp = await addParcellesToPoolRun(projectId, runId, idus);
      const snap = await fetchPoolRunSnapshot(projectId, runId);
      const { filter_options, run_created_at, ...rest } = snap;
      setResults({
        ...(rest as FilterResponse),
        run_created_at: run_created_at ?? undefined,
      });
      if (filter_options) setLastFilterOptions(filter_options as FilterOptions);
      const next = await fetchPoolIndesirables(projectId);
      setIndesirableIdus(next.idus ?? []);
      setIndesirableParcellesStored(next.parcelles ?? []);
      setIndesirableMetricsByIdu(next.by_idu ?? {});
      setPoolRuns((prev) =>
        prev.map((r) => (r.id === runId ? { ...r, total_count: resp.total_count } : r)),
      );
      setMetricsRefreshNonce((n) => n + 1);
      const lines: string[] = [];
      if (resp.added.length) {
        lines.push(`${resp.added.length} parcelle(s) ajoutée(s) au pool.`);
      }
      if (resp.unstuck_indesirables.length) {
        lines.push(`${resp.unstuck_indesirables.length} retirée(s) des indésirables.`);
      }
      if (resp.already_in_pool.length) {
        lines.push(`Déjà dans le pool : ${resp.already_in_pool.join(", ")}`);
      }
      if (resp.not_found.length) {
        lines.push(`Introuvable : ${resp.not_found.join(", ")}`);
      }
      if (resp.invalid.length) {
        lines.push(`IDU invalide : ${resp.invalid.join(", ")}`);
      }
      if (!lines.length) {
        lines.push("Aucun ajout.");
      }
      alert(lines.join("\n"));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'ajouter la parcelle au pool.");
      throw e;
    } finally {
      setAddParcellesLoading(false);
    }
  }

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
    setMapFocusNonce((n) => n + 1);
  }

  function handleTableRowActivate(idu: string) {
    setLinkedIdu(idu);
    setMapFocusNonce((n) => n + 1);
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

  function handleToolbarPoolChange(poolProjectId: string, poolId: string) {
    navigate(`/projects/${poolProjectId}/runs/${poolId}`);
  }

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
    } else if (rankingSortKey === "urba_score") {
      const getUrba = (idu: string): number => {
        const rows = poolMetricsByIdu?.[idu] ?? [];
        const raw = rows.find((r) => r.metric_key === "urbanisme_gpu")?.metric_value_jsonb?.score;
        const score = raw && typeof raw === "object" ? (raw as { score_global?: unknown }).score_global : null;
        return typeof score === "number" && Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY;
      };
      list = [...list].sort((a, b) => getUrba(b.idu) - getUrba(a.idu) || a.rank - b.rank);
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
    } else if (rankingSortKey === "zone_humide_ha") {
      list = [...list].sort((a, b) => (b.zone_humide_ha ?? 0) - (a.zone_humide_ha ?? 0));
    } else if (rankingSortKey === "dist_hydro_m") {
      list = [...list].sort((a, b) => {
        const da = a.dist_hydro_m ?? Number.POSITIVE_INFINITY;
        const db = b.dist_hydro_m ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.rank - b.rank;
      });
    } else if (rankingSortKey === "surface_hydro_ha") {
      list = [...list].sort((a, b) => (b.surface_hydro_ha ?? 0) - (a.surface_hydro_ha ?? 0));
    } else if (rankingSortKey === "dist_surface_hydro_m") {
      list = [...list].sort((a, b) => {
        const da = a.dist_surface_hydro_m ?? Number.POSITIVE_INFINITY;
        const db = b.dist_surface_hydro_m ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return a.rank - b.rank;
      });
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
    if (rankingSortDir === "asc") list = [...list].reverse();
    return list;
  }, [
    results?.parcelles,
    distanceCursorKm,
    surfaceMinHa,
    rankingSortKey,
    rankingSortDir,
    poolMetricsByIdu,
    lastFilterOptions,
    indesirableIdus,
  ]);
  displayedIdusRef.current = displayedParcelles.map((p) => p.idu);

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
    dureteFonciereLoading
    || urbanismeLoading
    || addParcellesLoading
    || (!!results?.pool_run_id && loading && (filterLoadingStage === "profiling" || filterLoadingStage === "metrics_loading"));

  const poolMetricsOverlayText = addParcellesLoading
    ? "Ajout au pool et enrichissement…"
    : urbanismeLoading
    ? "Profil urbanisme en cours (Géoportail)…"
    : dureteFonciereLoading
    ? "Calcul de la dureté foncière en cours…"
    : (loadingStatusText ?? "Calcul des métriques en cours…");

  const activeRunId = initialRunId ?? results?.pool_run_id ?? null;
  const hasCombinedRanking = (ufResults?.unites_foncieres ?? []).some(
    (u) => (u.sous_ensembles ?? []).length > 0,
  );
  const isSplitParcelView = mainResultsTab === "parcelles" || mainResultsTab === "combine";
  const isSplitUfView = mainResultsTab === "unites" && !!ufResults;

  const resultsContentClass = `results-content${
    isSplitParcelView || isSplitUfView ? "" : " results-content--full"
  }`;

  const toolbarStatus: ResultsToolbarStatus = !connected
    ? { kind: "offline", label: "Connexion au serveur…" }
    : loadingStatusText
      ? { kind: "busy", label: loadingStatusText }
      : progress?.status === "fetching" || progress?.status === "filtering"
        ? {
            kind: "busy",
            label: progress.status === "filtering" ? "Filtrage…" : "Récupération…",
          }
        : results
          ? { kind: "ready" }
          : { kind: "idle" };

  const showStudyLoader =
    Boolean(initialRunId) && !openStudyError && (openStudyLoading || !results);

  const mapShared = {
    projectId,
    foncierGeojson,
    thematicPreload,
    thematicPreloadLoading,
    mapLayerKeys,
  };

  const parcellesMapPanel = (
    <EtudeResultatsParcellesMap
      {...mapShared}
      geojson={geojson}
      parcellesMapGeojson={parcellesMapGeojson}
      poolRunId={activeRunId}
      poolMetricsByIdu={poolMetricsByIdu}
      indesirableCount={indesirableIdus.length}
      loadingMessage={loadingStatusText}
      focusIdu={linkedIdu}
      focusZoomNonce={mapFocusNonce}
      hoverIdu={hoverIdu}
      onParcelleClick={handleMapParcelleClick}
      onParcelleHover={setHoverIdu}
      urbaRevision={metricsRefreshNonce}
    />
  );

  const ufMapPanel = (
    <EtudeResultatsUnitesMap
      {...mapShared}
      ufGeojson={ufGeojson}
      subsetScores={subsetScores}
      focusSubsetId={linkedSubsetId}
      focusUfId={linkedSubsetId ? null : linkedUfId}
      hoverSubsetId={hoverSubsetId}
      hoverUfId={hoverUfId}
      onSubsetClick={handleMapSubsetClick}
    />
  );

  return (
    <div className="results-page">
      {toolNotice && (
        <AppDialog title={toolNotice.title} onClose={() => setToolNotice(null)}>
          <p className={toolNotice.error ? "etudes-home-modal__error" : undefined}>{toolNotice.body}</p>
        </AppDialog>
      )}
      <ResultsToolbar
        projectId={projectId}
        projects={projects}
        poolRuns={poolRuns}
        activePoolId={activeRunId}
        poolCreatedAt={results?.run_created_at ?? null}
        parcelCount={results ? displayedParcelles.length : null}
        status={toolbarStatus}
        onNewStudy={onNavigateToCreate}
        onEditFilter={
          projectId
            ? () => navigate(`/ecocompensation`, { state: { editProjectId: projectId } })
            : undefined
        }
        onPoolChange={handleToolbarPoolChange}
        preferOpen={!!results && results.total === 0}
        hidePoolPicker={!projectId}
      >
        {hasParcellesFunnel && results && (
          <FunnelDisplay
            compact
            title="Entonnoir parcelles"
            steps={results.funnel ?? []}
            finalRadiusKm={results.final_radius_km}
            total={results.total}
          />
        )}
        {hasUfFunnel && ufResults && (
          <FunnelDisplay
            compact
            title="Entonnoir UF"
            steps={ufResults.funnel ?? []}
            finalRadiusKm={0}
            total={ufResults.total_sous_ensembles}
            entityLabel="sous-ensembles"
            extraSummary={`${ufResults.total_uf} UF`}
          />
        )}
      </ResultsToolbar>

      <div className="results-page__body">
        {showStudyLoader ? (
          <PoolOpenLoading />
        ) : results ? (
          <>
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
                Groupement de parcelles de personnes morales
                {!ufReady && parcellesReady && sousEnsemblesStatus !== "no" && (
                  <span className="results-tab-spinner" aria-hidden="true" />
                )}
              </button>
              {hasCombinedRanking && (
                <button
                  type="button"
                  className={`results-tab ${mainResultsTab === "combine" ? "active" : ""}`}
                  onClick={() => setMainResultsTab("combine")}
                >
                  Classement combiné
                </button>
              )}
              {(isSplitParcelView || isSplitUfView) && (
                <button
                  type="button"
                  className="results-split-map-toggle"
                  onClick={() => setSplitMapVisible((v) => !v)}
                  aria-pressed={splitMapVisible}
                >
                  {splitMapVisible ? "Masquer la carte" : "Afficher la carte"}
                </button>
              )}
            </div>

            <div className={resultsContentClass}>
              {mainResultsTab === "parcelles" && results.total === 0 && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Aucune parcelle retenue après filtrage. Ouvrez{" "}
                  <strong>Informations du pool</strong> pour voir à quelle étape elles ont été éliminées,
                  ou ajoutez un IDU via <strong>Outils</strong>.
                </div>
              )}

              {mainResultsTab === "parcelles" && (
                <ResultsSplit
                  mapVisible={splitMapVisible}
                  tableShare={tableShare}
                  onTableShareChange={setTableShare}
                  table={
                  <EtudeResultatsParcellesTable
                    hideDistanceFilter={currentStudyProfile.hideDistanceFilter}
                    distanceMaxKm={distanceMaxKm}
                    distanceCursorKm={distanceCursorKm}
                    onDistanceChange={setDistanceCursorKm}
                    surfaceMinHa={surfaceMinHa}
                    surfaceMaxHa={surfaceMaxHa}
                    onSurfaceMinChange={setSurfaceMinHa}
                    parcelles={displayedParcelles}
                    projectId={projectId}
                    poolRunId={results.pool_run_id ?? null}
                    poolMetricsByIdu={poolMetricsByIdu}
                    isPoolMetricsPending={isPoolMetricsPending}
                    poolMetricsOverlayText={poolMetricsOverlayText}
                    rankingSortKey={rankingSortKey}
                    rankingSortDir={rankingSortDir}
                    onRankingSortChange={(key) => {
                      if (key === rankingSortKey) setRankingSortDir((d) => (d === "desc" ? "asc" : "desc"));
                      else {
                        setRankingSortKey(key);
                        setRankingSortDir("desc");
                      }
                    }}
                    scrollToIdu={scrollToIdu}
                    scrollTableNonce={scrollTableNonce}
                    detailFocus={detailFocus}
                    selectedIdu={linkedIdu}
                    hoverIdu={hoverIdu}
                    onRowActivate={handleTableRowActivate}
                    onHover={setHoverIdu}
                    onMarkIndesirable={handleMarkIndesirable}
                    onBatchMarkIndesirable={handleBatchMarkIndesirable}
                    onRunDureteFonciere={handleRunDureteFonciere}
                    dureteFonciereLoading={dureteFonciereLoading}
                    onRunUrbanisme={handleRunUrbanisme}
                    urbanismeLoading={urbanismeLoading}
                    onAddParcelles={handleAddParcelles}
                    addParcellesLoading={addParcellesLoading}
                    showZoneHumideColumn={showZoneHumideColumn}
                    showDistHydroColumn={showDistHydroColumn}
                    showSurfaceHydroColumn={showSurfaceHydroColumn}
                    indesirableParcelles={indesirableParcelles}
                    indesirableMetricsByIdu={indesirableMetricsByIdu}
                    onRestoreIndesirable={handleRestoreIndesirable}
                  />
                  }
                  map={<SplitMapFrame>{parcellesMapPanel}</SplitMapFrame>}
                />
              )}

              {mainResultsTab === "combine" && hasCombinedRanking && (
                <ResultsSplit
                  mapVisible={splitMapVisible}
                  tableShare={tableShare}
                  onTableShareChange={setTableShare}
                  table={
                  <EtudeResultatsCombinedTable
                    parcelles={displayedCombinedCandidates}
                    poolRunId={results.pool_run_id ?? null}
                    poolMetricsByIdu={poolMetricsByIdu}
                    rankingSortKey={rankingSortKey}
                    onRankingSortChange={setRankingSortKey}
                    scrollToIdu={scrollToIdu}
                    scrollTableNonce={scrollTableNonce}
                    selectedIdu={linkedIdu}
                    hoverIdu={hoverIdu}
                    onRowActivate={handleTableRowActivate}
                    onHover={setHoverIdu}
                    showZoneHumideColumn={showZoneHumideColumn}
                    showDistHydroColumn={showDistHydroColumn}
                    showSurfaceHydroColumn={showSurfaceHydroColumn}
                  />
                  }
                  map={<SplitMapFrame>{parcellesMapPanel}</SplitMapFrame>}
                />
              )}

              {mainResultsTab === "unites" && ufResults && (
                <ResultsSplit
                  mapVisible={splitMapVisible}
                  tableShare={tableShare}
                  onTableShareChange={setTableShare}
                  table={
                  <EtudeResultatsUnitesTable
                    ufResults={ufResults}
                    projectId={projectId}
                    selectedSubsetId={linkedSubsetId}
                    scrollToSubsetId={scrollToSubsetId}
                    scrollTableNonce={scrollUfTableNonce}
                    onSubsetActivate={handleTableSubsetActivate}
                    onUfActivate={handleTableUfActivate}
                    onSubsetHover={setHoverSubsetId}
                    onUfHover={setHoverUfId}
                  />
                  }
                  map={<SplitMapFrame>{ufMapPanel}</SplitMapFrame>}
                />
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
              {mainResultsTab === "unites" && !ufResults && !ufPoolLoading && !ufReady && sousEnsemblesStatus === "no" && !ufSearchLoading && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13, display: "grid", gap: 10, justifyItems: "start" }}>
                  <p style={{ margin: 0 }}>
                    Ce filtrage a été lancé sur les parcelles seules. La recherche des groupements
                    reprend les mêmes critères, sans relancer le filtre parcelles.
                  </p>
                  <button
                    type="button"
                    className="ranking-line-run"
                    disabled={!projectId || ufSearchLoading}
                    onClick={() => {
                      if (!projectId) return;
                      setUfSearchLoading(true);
                      setSousEnsemblesStatus("loading");
                      void startUfSearch(projectId).catch((err) => {
                        setUfSearchLoading(false);
                        setSousEnsemblesStatus("no");
                        alert(err instanceof Error ? err.message : "Impossible de lancer la recherche.");
                      });
                    }}
                  >
                    Lancer la recherche parmi les groupements de personnes morales
                  </button>
                </div>
              )}
              {mainResultsTab === "unites" && !ufResults && !ufPoolLoading && !ufReady && sousEnsemblesStatus === "yes" && (
                <div style={{ padding: 12, color: "#000000", fontSize: 13 }}>
                  Lancez le filtre pour calculer et afficher les résultats unités foncières.
                </div>
              )}
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
                {storedResultsLoading || progress?.status === "filtering"
                  ? "Chargement des résultats du filtrage…"
                  : storedProjectStatus === "error"
                    ? "Le dernier filtrage a échoué côté serveur (aucun pool enregistré). Relancez une étude depuis le wizard zones humides."
                    : poolRuns.length > 0
                    ? "Impossible de charger les résultats. Ouvrez les informations du pool pour en sélectionner un."
                    : "Aucun pool de parcelles pour ce projet. Lancez une nouvelle étude ou sélectionnez un pool."}
              </span>
            </div>
          </div>
        ) : (
          <EtudesHomeTable
            poolRuns={poolRuns}
            projects={projects}
            projectsLoaded={projectsLoaded}
            onOpen={handleToolbarPoolChange}
            onNewStudy={onNavigateToCreate}
            onDeleted={(pid) => {
              setPoolRuns((prev) => prev.filter((r) => r.project_id !== pid));
              setProjects((prev) => prev.filter((p) => p.id !== pid));
            }}
          />
        )}
      </div>
    </div>
  );
}
