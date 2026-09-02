// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from "react";
import { exportCsv, exportRapportPdf, exportShp } from "../../api";
import type { ParcelleResult, ParcelPoolMetricRow, RankingSortKey } from "../../types";
import {
  type FaunaTableEntry,
  compositeBadgeStyle,
  dureteBadgeStyle,
  dureteSkipReasonLabel,
  getCompositeScoreMetric,
  getDureteFonciereMetric,
  getFaunaTableEntries,
  getPersonnesMoralesMetric,
} from "../../utils/poolMetrics";
import { RankingLine } from "./RankingLine";

const PAGE_SIZE = 50;

/** Colonnes fixes : #, éco, dureté, composite, surface, dist espèce, espèce, dist projet, IDU, PM, prospect. */
const RANKING_BASE_COL_COUNT = 11;

interface RankingTableProps {
  parcelles: ParcelleResult[];
  poolRunId?: string | null;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  poolMetricsLoading: boolean;
  rankingSortKey: RankingSortKey;
  onRankingSortChange: (k: RankingSortKey) => void;
  onHover?: (idu: string | null) => void;
  onSelect?: (idu: string | null) => void;
  /** Clic ligne : focus carte (App). */
  onRowActivate?: (idu: string) => void;
  selectedIdu?: string | null;
  scrollToIdu?: string | null;
  /** Compteur pour rejouer le scroll vers la même parcelle (clic carte). */
  scrollTableNonce?: number;
  onMarkIndesirable?: (idu: string) => void;
  /** Filtrage manuel : envoyer plusieurs IDU vers les indésirables. */
  onBatchMarkIndesirable?: (idus: string[]) => Promise<void>;
  /** Calcule la dureté foncière : tout le pool, ou les IDU fournis. */
  onRunDureteFonciere?: (idus?: string[]) => void | Promise<void>;
  dureteFonciereLoading?: boolean;
  /** Ajoute des IDU au pool (proposition foncière reçue après le calcul). */
  onAddParcelles?: (idus: string[]) => void | Promise<void>;
  addParcellesLoading?: boolean;
  projectId?: string | null;
  exportPoolRunId?: string | null;
  /** Affiche la colonne surface ZH intersectée (études zones humides). */
  showZoneHumideColumn?: boolean;
  /** Affiche la colonne distance au cours d'eau le plus proche. */
  showDistHydroColumn?: boolean;
  /** Affiche les colonnes surface / distance surfaces hydro. */
  showSurfaceHydroColumn?: boolean;
  /** Curseurs front : distance au projet / surface min. (filtrage à la volée du pool). */
  poolFilters?: {
    hideDistanceFilter: boolean;
    distanceMaxKm: number;
    distanceCursorKm: number;
    onDistanceChange: (km: number) => void;
    surfaceMinHa: number;
    surfaceMaxHa: number;
    onSurfaceMinChange: (ha: number) => void;
  };
}

function getEcologicalScore(metrics: ParcelPoolMetricRow[] | undefined): { score: number; max: number } | null {
  const row = (metrics ?? []).find((m) => m.metric_key === "score_eco");
  const rawScore = row?.metric_value_jsonb?.total_score;
  const rawMax = row?.metric_value_jsonb?.max_score;
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) return null;
  const max = typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 6;
  return { score: rawScore, max };
}

function ecologicalBadgeStyle(scorePayload: { score: number; max: number } | null): { bg: string; fg: string } {
  if (scorePayload == null) return { bg: "#e5e7eb", fg: "#374151" };
  const ratio = scorePayload.max > 0 ? scorePayload.score / scorePayload.max : 0;
  if (ratio >= 0.8) return { bg: "#dcfce7", fg: "#166534" };
  if (ratio >= 0.5) return { bg: "#bbf7d0", fg: "#166534" };
  if (ratio >= 0.2) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e5e7eb", fg: "#374151" };
}

function pmBadgeStyle(yes: boolean | null | undefined): { bg: string; fg: string; label: string } {
  if (yes === true) return { bg: "rgba(29, 78, 216, 0.12)", fg: "#1d4ed8", label: "Oui" };
  if (yes === false) return { bg: "#f3f4f6", fg: "#6b7280", label: "Non" };
  return { bg: "#e5e7eb", fg: "#374151", label: "—" };
}

function prospectBadgeStyle(yes: boolean | null | undefined): { bg: string; fg: string; label: string } {
  if (yes === true) return { bg: "rgba(180, 83, 9, 0.14)", fg: "#b45309", label: "Oui" };
  if (yes === false) return { bg: "#f3f4f6", fg: "#6b7280", label: "Non" };
  return { bg: "#e5e7eb", fg: "#374151", label: "—" };
}

function formatFaunaDistanceM(distM: number): string {
  if (distM <= 0) return "0 m";
  return `${Math.round(distM).toLocaleString("fr-FR")} m`;
}

function scrollTableRowToTop(idu: string) {
  const row = document.getElementById(`row-parcelle-${idu}`);
  if (!row) return;
  const container =
    (row.closest(".results-split__table-inner") as HTMLElement | null) ??
    (row.closest(".ranking-table-scroll") as HTMLElement | null);
  if (container) {
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = rowRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return;
  }
  row.scrollIntoView({ behavior: "smooth", block: "start" });
}

function FaunaDistanceStack({ entries }: { entries: FaunaTableEntry[] }) {
  if (!entries.length) return <span className="na">—</span>;
  return (
    <ul className="ranking-fauna-stack" aria-label="Distances aux espèces">
      {entries.map((e) => (
        <li key={e.species} className="ranking-fauna-stack__line mono">
          {formatFaunaDistanceM(e.distanceM)}
        </li>
      ))}
    </ul>
  );
}

function FaunaSpeciesStack({ entries }: { entries: FaunaTableEntry[] }) {
  if (!entries.length) return <span className="na">—</span>;
  return (
    <ul className="ranking-fauna-stack" aria-label="Espèces du filtre">
      {entries.map((e) => (
        <li key={e.species} className="ranking-fauna-stack__line" title={e.species}>
          {e.species}
        </li>
      ))}
    </ul>
  );
}

export function RankingTable({
  parcelles,
  poolRunId,
  poolMetricsByIdu,
  poolMetricsLoading,
  rankingSortKey,
  onRankingSortChange,
  onHover,
  onSelect,
  onRowActivate,
  selectedIdu,
  scrollToIdu,
  scrollTableNonce = 0,
  onMarkIndesirable,
  onBatchMarkIndesirable,
  onRunDureteFonciere,
  dureteFonciereLoading = false,
  onAddParcelles,
  addParcellesLoading = false,
  projectId,
  exportPoolRunId,
  showZoneHumideColumn = false,
  showDistHydroColumn = false,
  showSurfaceHydroColumn = false,
  poolFilters,
}: RankingTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  const [expandedIdus, setExpandedIdus] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastPdfRssDeltaMb, setLastPdfRssDeltaMb] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(() => parcelles.length === 0);
  const [selectionIntent, setSelectionIntent] = useState<"indesirables" | "durete" | null>(null);
  const [checkedIdus, setCheckedIdus] = useState<Set<string>>(() => new Set());
  const [applyingSelection, setApplyingSelection] = useState(false);
  const [addDraft, setAddDraft] = useState("");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [dureteMenuOpen, setDureteMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const selectionMode = selectionIntent != null;
  const manualSelectionEnabled = !!(onBatchMarkIndesirable && poolRunId && projectId);

  const parcellesIdentity = useMemo(
    () => [...parcelles].map((p) => p.idu).sort().join("|"),
    [parcelles],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedIdus(new Set());
    setSelectionIntent(null);
    setCheckedIdus(new Set());
    setAddPanelOpen(false);
    setDureteMenuOpen(false);
    setExportMenuOpen(false);
  }, [parcellesIdentity]);

  useEffect(() => {
    if (!scrollToIdu) return;
    const idx = parcelles.findIndex((p) => p.idu === scrollToIdu);
    if (idx === -1) return;
    setVisibleCount((prev) => Math.max(prev, idx + 1));
    setExpandedIdus((prev) => new Set(prev).add(scrollToIdu));
    const iduToScroll = scrollToIdu;
    window.setTimeout(() => {
      scrollTableRowToTop(iduToScroll);
    }, 50);
  }, [scrollToIdu, scrollTableNonce, parcelles]);

  function handleHover(idu: string | null) {
    setHoveredIdu(idu);
    onHover?.(idu);
  }

  function handleClick(idu: string) {
    onRowActivate?.(idu);
    const wasExpanded = expandedIdus.has(idu);
    setExpandedIdus((prev) => {
      const next = new Set(prev);
      if (next.has(idu)) next.delete(idu);
      else next.add(idu);
      return next;
    });
    onSelect?.(!wasExpanded ? idu : null);
  }

  function toggleChecked(idu: string, checked: boolean) {
    setCheckedIdus((prev) => {
      const next = new Set(prev);
      if (checked) next.add(idu);
      else next.delete(idu);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionIntent(null);
    setCheckedIdus(new Set());
  }

  function enterSelection(intent: "indesirables" | "durete") {
    setSelectionIntent(intent);
    setCheckedIdus(new Set());
    setToolsOpen(false);
    setAddPanelOpen(false);
    setDureteMenuOpen(false);
    setExportMenuOpen(false);
  }

  async function handleExport(kind: "csv" | "shp") {
    if (!projectId) return;
    setExporting(true);
    try {
      if (kind === "csv") await exportCsv(projectId, "parcelles", exportPoolRunId ?? null);
      else await exportShp(projectId, "parcelles", exportPoolRunId ?? null);
    } catch (err) {
      console.error("Export classement:", err);
      alert(err instanceof Error ? err.message : "Erreur lors de l'export. Voir la console.");
    } finally {
      setExporting(false);
    }
  }

  async function handlePdf() {
    if (!projectId) return;
    setExportingPdf(true);
    setLastPdfRssDeltaMb(null);
    try {
      const { rssDeltaMb } = await exportRapportPdf(projectId, exportPoolRunId ?? null);
      setLastPdfRssDeltaMb(rssDeltaMb);
    } catch (err) {
      console.error("Rapport PDF:", err);
      alert(err instanceof Error ? err.message : "Erreur lors de la génération du rapport PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleKeepSelectedOnly() {
    if (!onBatchMarkIndesirable) return;
    if (checkedIdus.size === 0) {
      alert("Cochez au moins une parcelle à conserver dans le classement.");
      return;
    }
    const rejectIdus = parcelles.filter((p) => !checkedIdus.has(p.idu)).map((p) => p.idu);
    if (!rejectIdus.length) {
      exitSelectionMode();
      return;
    }
    const ok = window.confirm(
      `Conserver ${checkedIdus.size} parcelle(s) dans le classement et déplacer ${rejectIdus.length} parcelle(s) vers les indésirables ?\n\nLes parcelles rejetées restent accessibles dans le tableau « Pool indésirables » et restent exportables séparément.`,
    );
    if (!ok) return;
    setApplyingSelection(true);
    try {
      await onBatchMarkIndesirable(rejectIdus);
      exitSelectionMode();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'appliquer la sélection.");
    } finally {
      setApplyingSelection(false);
    }
  }

  async function handleDureteSelected() {
    if (!onRunDureteFonciere) return;
    if (checkedIdus.size === 0) {
      alert("Cochez au moins une parcelle pour calculer la dureté foncière.");
      return;
    }
    const idus = [...checkedIdus];
    exitSelectionMode();
    await onRunDureteFonciere(idus);
  }

  function handleDureteAll() {
    if (!onRunDureteFonciere) return;
    const ok = window.confirm(
      `Calculer la dureté foncière pour les ${parcelles.length} parcelle(s) du classement (hors indésirables) ?`,
    );
    if (!ok) return;
    setDureteMenuOpen(false);
    void onRunDureteFonciere();
  }

  async function handleAddParcellesSubmit() {
    if (!onAddParcelles) return;
    const idus = [
      ...new Set(
        addDraft
          .split(/[\s,;]+/)
          .map((s) => s.trim().toUpperCase().replace(/-/g, ""))
          .filter(Boolean),
      ),
    ];
    if (!idus.length) {
      alert("Saisissez au moins un IDU (un par ligne).");
      return;
    }
    try {
      await onAddParcelles(idus);
      setAddDraft("");
      setAddPanelOpen(false);
    } catch {
      /* message déjà affiché par la page */
    }
  }

  const hasAdd = !!(onAddParcelles && poolRunId && projectId);
  if (!parcelles.length && !hasAdd) return null;

  const visibleParcelles = parcelles.slice(0, visibleCount);
  const hasMore = parcelles.length > visibleCount;
  const showTrashColumn = !!(onMarkIndesirable && poolRunId && !selectionMode);
  const rankingColCount =
    RANKING_BASE_COL_COUNT +
    (showZoneHumideColumn ? 1 : 0) +
    (showDistHydroColumn ? 1 : 0) +
    (showSurfaceHydroColumn ? 2 : 0) +
    (selectionMode ? 1 : 0) +
    (showTrashColumn ? 1 : 0);

  const showDistanceSlider =
    !!poolFilters && !poolFilters.hideDistanceFilter && poolFilters.distanceMaxKm > 0;
  const surfMax = poolFilters ? Math.max(1, poolFilters.surfaceMaxHa) : 1;
  const showSurfaceSlider = showDistanceSlider;
  const hasPoolFilters = showDistanceSlider || showSurfaceSlider;
  const distanceActive =
    showDistanceSlider &&
    poolFilters.distanceCursorKm < poolFilters.distanceMaxKm - 0.05;
  const surfaceActive = showSurfaceSlider && poolFilters.surfaceMinHa > 0.05;
  const hasExport = !!projectId;
  const hasDurete = !!(onRunDureteFonciere && poolRunId && projectId);
  const hasActions = hasDurete || manualSelectionEnabled || hasExport || hasAdd;
  const showTools = hasPoolFilters || hasActions;

  const sortSelect = (
    <label className="ranking-sort-label">
      Trier
      <select
        value={rankingSortKey}
        onChange={(e) => onRankingSortChange(e.target.value as RankingSortKey)}
        onClick={(ev) => ev.stopPropagation()}
      >
        <option value="rank">Rang (score)</option>
        <option value="composite_score">Score composite</option>
        <option value="durete_score">Dureté foncière</option>
        <option value="distance">Distance projet</option>
        <option value="surface">Surface</option>
        {showZoneHumideColumn && (
          <option value="zone_humide_ha">Surface ZH</option>
        )}
        {showDistHydroColumn && (
          <option value="dist_hydro_m">Dist. cours d&apos;eau</option>
        )}
        {showSurfaceHydroColumn && (
          <>
            <option value="surface_hydro_ha">Surf. hydro</option>
            <option value="dist_surface_hydro_m">Dist. surface hydro</option>
          </>
        )}
        <option value="miller">Miller</option>
        <option value="veg_dominant">Part dominante</option>
        <option value="veg_priority">Priorité végétation</option>
        <optgroup label="Personnes morales">
          <option value="pm_personne_morale">Personne morale</option>
          <option value="pm_compensation">Déjà compensé</option>
          <option value="pm_prospect_detail">Prospect détaillé</option>
        </optgroup>
      </select>
    </label>
  );

  return (
    <div className="ranking-wrap">
      <div className={`ranking-chrome${toolsOpen ? " is-open" : ""}`}>
        <div className="ranking-chrome__bar">
          {showTools && (
            <button
              type="button"
              className="ranking-chrome__toggle"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
            >
              Outils
              <span className="ranking-chrome__caret" aria-hidden>
                {toolsOpen ? "▴" : "▾"}
              </span>
            </button>
          )}
          {distanceActive && poolFilters && (
            <span className="ranking-chrome__chip">≤ {poolFilters.distanceCursorKm.toFixed(1)} km</span>
          )}
          {surfaceActive && poolFilters && (
            <span className="ranking-chrome__chip">≥ {poolFilters.surfaceMinHa.toFixed(1)} ha</span>
          )}
          {dureteFonciereLoading && (
            <span className="ranking-chrome__status">Dureté…</span>
          )}
          {addParcellesLoading && (
            <span className="ranking-chrome__status">Ajout…</span>
          )}
          {exportingPdf && (
            <span className="ranking-chrome__status">Rapport…</span>
          )}
          {poolMetricsLoading && (
            <span className="ranking-chrome__status">Métriques…</span>
          )}
          {sortSelect}
          <span className="ranking-count mono">
            {visibleParcelles.length} / {parcelles.length}
          </span>
        </div>

        {toolsOpen && showTools && (
          <div className="ranking-tools" role="region" aria-label="Outils du classement">
            {hasPoolFilters && (
              <div className="ranking-tools__block">
                <div className="ranking-tools__label">Ajuster le pool</div>
                <div className="results-split-filters">
                  {showDistanceSlider && poolFilters && (
                    <label className="results-split-filters__item">
                      <span className="results-split-filters__label">Distance au projet</span>
                      <input
                        type="range"
                        min={1}
                        max={poolFilters.distanceMaxKm}
                        step={0.1}
                        value={Math.min(
                          Math.max(poolFilters.distanceCursorKm, 1),
                          poolFilters.distanceMaxKm,
                        )}
                        onChange={(e) => poolFilters.onDistanceChange(parseFloat(e.target.value))}
                      />
                      <span className="results-split-filters__value">
                        {poolFilters.distanceCursorKm.toFixed(1)} km
                      </span>
                    </label>
                  )}
                  {showSurfaceSlider && poolFilters && (
                    <label className="results-split-filters__item">
                      <span className="results-split-filters__label">Surface min.</span>
                      <input
                        type="range"
                        min={0}
                        max={surfMax}
                        step={0.1}
                        value={Math.min(Math.max(poolFilters.surfaceMinHa, 0), surfMax)}
                        onChange={(e) => poolFilters.onSurfaceMinChange(parseFloat(e.target.value))}
                      />
                      <span className="results-split-filters__value">
                        {poolFilters.surfaceMinHa.toFixed(1)} ha
                      </span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {hasActions && (
              <div className="ranking-tools__block">
                <div className="ranking-tools__label">Opérations</div>
                <div className="ranking-tools__actions">
                  {hasDurete && (
                    <button
                      type="button"
                      className={`ranking-btn-durete${dureteMenuOpen ? " is-on" : ""}`}
                      disabled={dureteFonciereLoading || addParcellesLoading || selectionMode || poolMetricsLoading}
                      title="Calculer la dureté foncière sur le pool ou une sélection"
                      onClick={() => {
                        setDureteMenuOpen((v) => !v);
                        setAddPanelOpen(false);
                        setExportMenuOpen(false);
                      }}
                    >
                      {dureteFonciereLoading ? "Dureté…" : "Dureté foncière"}
                    </button>
                  )}
                  {hasAdd && (
                    <button
                      type="button"
                      className={`ranking-btn-add-pool${addPanelOpen ? " is-on" : ""}`}
                      disabled={addParcellesLoading || dureteFonciereLoading || selectionMode}
                      title="Ajouter une parcelle au pool (IDU)"
                      onClick={() => {
                        setAddPanelOpen((v) => !v);
                        setDureteMenuOpen(false);
                        setExportMenuOpen(false);
                      }}
                    >
                      {addParcellesLoading ? "Ajout…" : "Ajouter du foncier"}
                    </button>
                  )}
                  {manualSelectionEnabled && !selectionMode && (
                    <button
                      type="button"
                      className="ranking-btn-select-mode"
                      onClick={() => enterSelection("indesirables")}
                      title="Cocher les parcelles à conserver, les autres iront dans les indésirables"
                    >
                      Sélectionner
                    </button>
                  )}
                  {hasExport && (
                    <>
                      <button
                        type="button"
                        className="ranking-btn-pdf"
                        disabled={exporting || exportingPdf}
                        title="Rapport PDF du pool (même périmètre que CSV / SHP)"
                        onClick={() => void handlePdf()}
                      >
                        {exportingPdf ? "Rapport…" : "Rapport PDF"}
                      </button>
                      <button
                        type="button"
                        className={`ranking-btn-export${exportMenuOpen ? " is-on" : ""}`}
                        disabled={exporting || exportingPdf || selectionMode}
                        title="Exporter le classement"
                        onClick={() => {
                          setExportMenuOpen((v) => !v);
                          setDureteMenuOpen(false);
                          setAddPanelOpen(false);
                        }}
                      >
                        {exporting ? "Export…" : "Export"}
                      </button>
                    </>
                  )}
                  {lastPdfRssDeltaMb != null && Number.isFinite(lastPdfRssDeltaMb) && (
                    <span
                      className="ranking-pdf-rss-hint mono"
                      title="Δ RSS processus serveur pendant export SHP + PDF"
                    >
                      Δ RAM ~{lastPdfRssDeltaMb.toFixed(1)} Mo
                    </span>
                  )}
                </div>
                {hasExport && exportMenuOpen && (
                  <div className="ranking-tools__reveal">
                    <button
                      type="button"
                      className="ranking-btn-export"
                      disabled={exporting || exportingPdf}
                      onClick={() => void handleExport("csv")}
                    >
                      {exporting ? "Export…" : "CSV"}
                    </button>
                    <button
                      type="button"
                      className="ranking-btn-export"
                      disabled={exporting || exportingPdf}
                      onClick={() => void handleExport("shp")}
                    >
                      Shapefile
                    </button>
                  </div>
                )}
                {hasDurete && dureteMenuOpen && (
                  <div className="ranking-tools__reveal">
                    <button
                      type="button"
                      className="ranking-btn-durete"
                      disabled={dureteFonciereLoading || poolMetricsLoading}
                      onClick={handleDureteAll}
                    >
                      Tout le pool
                    </button>
                    <button
                      type="button"
                      className="ranking-btn-durete ranking-btn-durete--select"
                      disabled={dureteFonciereLoading || poolMetricsLoading}
                      onClick={() => enterSelection("durete")}
                    >
                      Choisir des parcelles
                    </button>
                  </div>
                )}
                {hasAdd && addPanelOpen && (
                  <form
                    className="ranking-tools__reveal ranking-add-pool"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAddParcellesSubmit();
                    }}
                  >
                    <input
                      className="ranking-add-pool__input"
                      value={addDraft}
                      onChange={(e) => setAddDraft(e.target.value)}
                      disabled={addParcellesLoading || dureteFonciereLoading}
                      placeholder="IDU — ex. 330770000E0121"
                      spellCheck={false}
                      autoFocus
                      aria-label="IDU de la parcelle"
                    />
                    <button
                      type="submit"
                      className="ranking-btn-add-pool"
                      disabled={addParcellesLoading || dureteFonciereLoading || !addDraft.trim()}
                    >
                      {addParcellesLoading ? "Ajout…" : "Ajouter"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectionMode && (
        <div
          className={`ranking-selection-bar${selectionIntent === "durete" ? " ranking-selection-bar--durete" : ""}`}
        >
          <span className="ranking-selection-count mono">
            {checkedIdus.size} / {parcelles.length} cochée(s)
          </span>
          <button
            type="button"
            className="ranking-btn-select-all"
            onClick={() => setCheckedIdus(new Set(parcelles.map((p) => p.idu)))}
          >
            Tout cocher
          </button>
          <button
            type="button"
            className="ranking-btn-select-all"
            onClick={() => setCheckedIdus(new Set())}
          >
            Tout décocher
          </button>
          {selectionIntent === "durete" ? (
            <button
              type="button"
              className="ranking-btn-durete"
              disabled={dureteFonciereLoading || checkedIdus.size === 0}
              onClick={() => void handleDureteSelected()}
            >
              {dureteFonciereLoading
                ? "Calcul…"
                : `Calculer la dureté (${checkedIdus.size})`}
            </button>
          ) : (
            <button
              type="button"
              className="ranking-btn-keep-selected"
              disabled={applyingSelection || checkedIdus.size === 0}
              onClick={() => void handleKeepSelectedOnly()}
            >
              {applyingSelection ? "Application…" : "Conserver la sélection"}
            </button>
          )}
          <button
            type="button"
            className="ranking-btn-select-cancel"
            disabled={applyingSelection || dureteFonciereLoading}
            onClick={exitSelectionMode}
          >
            Annuler
          </button>
        </div>
      )}

      {selectionMode && (
        <p className="ranking-selection-hint">
          {selectionIntent === "durete"
            ? "Cochez les parcelles à analyser ; les autres gardent leur dureté actuelle."
            : "Cochez les parcelles à conserver ; les autres iront aux indésirables."}
        </p>
      )}

      <div className={`ranking-table-scroll${selectionMode ? " ranking-table-scroll--selection" : ""}`}>
        <table className="ranking-table">
          <thead>
            <tr>
              {selectionMode && (
                <th className="col-select" aria-label={selectionIntent === "durete" ? "Analyser" : "Conserver"}>
                  ✓
                </th>
              )}
              <th className="col-rank">#</th>
              <th className="col-eco">Score éco</th>
              <th className="col-durete" title="Dureté foncière (0 = facile, 100 = difficile)">
                Dureté
              </th>
              <th className="col-composite" title="Score composite (éco + attractivité foncière)">
                Comp.
              </th>
              <th className="col-surf">Surface</th>
              {showZoneHumideColumn && (
                <th className="col-zh" title="Surface de zone humide intersectée sur la parcelle">
                  Surf. ZH
                </th>
              )}
              {showDistHydroColumn && (
                <th className="col-hydro" title="Distance au cours d'eau le plus proche">
                  Dist. eau
                </th>
              )}
              {showSurfaceHydroColumn && (
                <>
                  <th className="col-surf-hydro" title="Surface de parcelle intersectant une surface hydro">
                    Surf. hydro
                  </th>
                  <th className="col-dist-surf-hydro" title="Distance à la surface hydro la plus proche">
                    Dist. surf.
                  </th>
                </>
              )}
              <th className="col-dist-espece">Dist espèce</th>
              <th className="col-espece">Espèce</th>
              <th className="col-dist">Dist projet</th>
              <th className="col-idu">IDU</th>
              <th className="col-pm" title="Répertoire personnes morales">
                PM
              </th>
              <th className="col-prospect" title="Propriétaire ayant déjà compensé (autre foncier)">
                Prospect
              </th>
              {showTrashColumn && (
                <th className="col-indesirable" title="Exclure du classement (pool indésirables)" aria-label="Indésirable">
                  ⊘
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {!visibleParcelles.length && (
              <tr>
                <td colSpan={rankingColCount} className="ranking-empty">
                  {hasAdd
                    ? "Aucune parcelle dans le classement. Ajoutez un IDU via Outils."
                    : "Aucune parcelle dans le classement."}
                </td>
              </tr>
            )}
            {visibleParcelles.map((p, idx) => {
              const isHovered = hoveredIdu === p.idu;
              const isSelected = selectedIdu === p.idu || expandedIdus.has(p.idu);
              const isChecked = checkedIdus.has(p.idu);
              const ecoScore = getEcologicalScore(poolMetricsByIdu?.[p.idu]);
              const ecoStyle = ecologicalBadgeStyle(ecoScore);
              const dureteMetric = getDureteFonciereMetric(poolMetricsByIdu?.[p.idu]);
              const dureteStyle = dureteBadgeStyle(dureteMetric?.score_final);
              const compositeMetric = getCompositeScoreMetric(poolMetricsByIdu?.[p.idu]);
              const compositeStyle = compositeBadgeStyle(compositeMetric?.score_composite);
              const faunaEntries = getFaunaTableEntries(poolMetricsByIdu?.[p.idu]);
              const pmMetric = getPersonnesMoralesMetric(poolMetricsByIdu?.[p.idu]);
              const pmStyle = pmBadgeStyle(
                pmMetric == null ? null : pmMetric.intersects_pm_database,
              );
              const prospectStyle = prospectBadgeStyle(
                pmMetric == null ? null : pmMetric.compensation_deja_realisee,
              );

              return (
                <Fragment key={p.idu}>
                  <tr
                    id={`row-parcelle-${p.idu}`}
                    className={`ranking-row ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""} ${selectionMode && isChecked ? "ranking-row--checked" : ""}`}
                    onMouseEnter={() => handleHover(p.idu)}
                    onMouseLeave={() => handleHover(null)}
                    onClick={() => handleClick(p.idu)}
                  >
                    {selectionMode && (
                      <td className="col-select" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="ranking-row-checkbox"
                          checked={isChecked}
                          aria-label={`Conserver la parcelle ${p.idu}`}
                          onChange={(e) => toggleChecked(p.idu, e.target.checked)}
                        />
                      </td>
                    )}
                    <td className="col-rank">
                      <span className="rank-badge mono">{idx + 1}</span>
                    </td>
                    <td className="col-eco">
                      <span
                        className="mono"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 42,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: ecoStyle.bg,
                          color: ecoStyle.fg,
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                        title={
                          ecoScore == null
                            ? "Score écologique non disponible"
                            : `Score écologique: ${ecoScore.score}/${ecoScore.max}`
                        }
                      >
                        {ecoScore == null ? "—" : ecoScore.score}
                      </span>
                    </td>
                    <td className="col-durete">
                      {dureteMetric == null ? (
                        <span className="mono" style={{ color: "#9ca3af" }}>—</span>
                      ) : dureteMetric.eligible && dureteMetric.score_final != null ? (
                        <span
                          className="mono"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 42,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: dureteStyle.bg,
                            color: dureteStyle.fg,
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                          title={[
                            dureteMetric.niveau_durete,
                            dureteMetric.attractivite_fonciere != null
                              ? `Attractivité ${Math.round(dureteMetric.attractivite_fonciere)}/100`
                              : null,
                            dureteMetric.denomination,
                          ].filter(Boolean).join(" · ")}
                        >
                          {Math.round(dureteMetric.score_final)}
                        </span>
                      ) : (
                        <span
                          className="mono"
                          style={{ fontSize: 11, color: "#9ca3af" }}
                          title={dureteSkipReasonLabel(dureteMetric.reason)}
                        >
                          n/a
                        </span>
                      )}
                    </td>
                    <td className="col-composite">
                      {compositeMetric?.score_composite != null ? (
                        <span
                          className="mono"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 42,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: compositeStyle.bg,
                            color: compositeStyle.fg,
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                          title={
                            compositeMetric.foncier_redhibitoire
                              ? "Foncier rédhibitoire (attractivité < 20)"
                              : compositeMetric.message ?? "Score composite"
                          }
                        >
                          {Math.round(compositeMetric.score_composite)}
                        </span>
                      ) : (
                        <span className="mono" style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td className="col-surf mono">
                      {p.surface_ha.toFixed(1)}<span className="unit"> ha</span>
                    </td>
                    {showZoneHumideColumn && (
                      <td className="col-zh mono">
                        {typeof p.zone_humide_ha === "number" && Number.isFinite(p.zone_humide_ha)
                          ? (
                              <>
                                {p.zone_humide_ha.toFixed(2)}
                                <span className="unit"> ha</span>
                              </>
                            )
                          : <span className="na">—</span>}
                      </td>
                    )}
                    {showDistHydroColumn && (
                      <td
                        className="col-hydro mono"
                        title={
                          p.troncons_hydro_info?.length
                            ? p.troncons_hydro_info
                                .map((t) => {
                                  const label = t.nom?.trim() || t.nature?.trim() || t.cleabs || "Tronçon";
                                  const dist = typeof t.dist_m === "number" ? `${t.dist_m} m` : "?";
                                  return `${label} (${dist})`;
                                })
                                .join(" · ")
                            : undefined
                        }
                      >
                        {typeof p.dist_hydro_m === "number" && Number.isFinite(p.dist_hydro_m)
                          ? (
                              <>
                                {Math.round(p.dist_hydro_m).toLocaleString("fr-FR")}
                                <span className="unit"> m</span>
                              </>
                            )
                          : <span className="na">—</span>}
                      </td>
                    )}
                    {showSurfaceHydroColumn && (
                      <>
                        <td
                          className="col-surf-hydro mono"
                          title={
                            p.surfaces_hydro_info?.length
                              ? p.surfaces_hydro_info
                                  .map((s) => {
                                    const label = s.nom?.trim() || s.nature?.trim() || s.cleabs || "Surface";
                                    const ha = typeof s.intersect_ha === "number" ? `${s.intersect_ha} ha` : "0 ha";
                                    return `${label} (${ha})`;
                                  })
                                  .join(" · ")
                              : undefined
                          }
                        >
                          {typeof p.surface_hydro_ha === "number" && Number.isFinite(p.surface_hydro_ha) && p.surface_hydro_ha > 0
                            ? (
                                <>
                                  {p.surface_hydro_ha.toFixed(2)}
                                  <span className="unit"> ha</span>
                                </>
                              )
                            : <span className="na">—</span>}
                        </td>
                        <td className="col-dist-surf-hydro mono">
                          {typeof p.dist_surface_hydro_m === "number" && Number.isFinite(p.dist_surface_hydro_m)
                            ? (
                                <>
                                  {Math.round(p.dist_surface_hydro_m).toLocaleString("fr-FR")}
                                  <span className="unit"> m</span>
                                </>
                              )
                            : <span className="na">—</span>}
                        </td>
                      </>
                    )}
                    <td className="col-dist-espece">
                      <FaunaDistanceStack entries={faunaEntries} />
                    </td>
                    <td className="col-espece">
                      <FaunaSpeciesStack entries={faunaEntries} />
                    </td>
                    <td className="col-dist mono">
                      {p.distance_km.toFixed(1)}<span className="unit"> km</span>
                    </td>
                    <td className="col-idu">
                      <span className="idu-main mono">{p.idu}</span>
                    </td>
                    <td className="col-pm">
                      <span
                        className="mono"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 36,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: pmStyle.bg,
                          color: pmStyle.fg,
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                        title={
                          pmMetric == null
                            ? "Métrique PM non calculée"
                            : pmMetric.intersects_pm_database
                              ? "Parcelle rattachée au répertoire personnes morales"
                              : "Parcelle absente du répertoire personnes morales"
                        }
                      >
                        {pmStyle.label}
                      </span>
                    </td>
                    <td className="col-prospect">
                      <span
                        className="mono"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 36,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: prospectStyle.bg,
                          color: prospectStyle.fg,
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                        title={
                          pmMetric == null
                            ? "Métrique prospects non calculée"
                            : pmMetric.compensation_deja_realisee
                              ? "Propriétaire ayant déjà compensé sur un autre foncier"
                              : "Propriétaire sans compensation antérieure connue"
                        }
                      >
                        {prospectStyle.label}
                      </span>
                    </td>
                    {showTrashColumn && (
                      <td className="col-indesirable">
                        <button
                          type="button"
                          className="ranking-btn-indesirable"
                          title="Marquer comme indésirable (hors classement, carte en rouge)"
                          aria-label={`Marquer la parcelle ${p.idu} comme indésirable`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkIndesirable(p.idu);
                          }}
                        >
                          🗑
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedIdus.has(p.idu) && (
                    <tr
                      className="ranking-row-detail"
                      onMouseEnter={() => handleHover(p.idu)}
                      onMouseLeave={() => handleHover(null)}
                    >
                      <td colSpan={rankingColCount} className="ranking-cell-detail">
                        <RankingLine
                          idu={p.idu}
                          expanded={expandedIdus.has(p.idu)}
                          metrics={
                            poolMetricsByIdu != null ? (poolMetricsByIdu[p.idu] ?? []) : []
                          }
                          metricsLoading={poolMetricsLoading}
                          noPoolRun={!poolRunId}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {hasMore && (
          <div className="ranking-load-more">
            <button
              type="button"
              className="btn-load-more"
              onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, parcelles.length))}
            >
              Afficher plus (+{Math.min(PAGE_SIZE, parcelles.length - visibleCount)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
