// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from "react";
import { exportCsv, exportRapportPdf, exportShp } from "../../api";
import type { ParcelleResult, ParcelPoolMetricRow, RankingSortKey } from "../../types";
import {
  type FaunaTableEntry,
  getFaunaTableEntries,
  getPersonnesMoralesMetric,
} from "../../utils/poolMetrics";
import { RankingLine } from "./RankingLine";

const PAGE_SIZE = 50;

/** Colonnes fixes : #, éco, surface, dist espèce, espèce, dist projet, IDU, PM, prospect. */
const RANKING_BASE_COL_COUNT = 9;

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
  projectId?: string | null;
  exportPoolRunId?: string | null;
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
  projectId,
  exportPoolRunId,
}: RankingTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  const [expandedIdus, setExpandedIdus] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exportChoice, setExportChoice] = useState<"" | "csv" | "shp">("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastPdfRssDeltaMb, setLastPdfRssDeltaMb] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIdus, setCheckedIdus] = useState<Set<string>>(() => new Set());
  const [applyingSelection, setApplyingSelection] = useState(false);

  const manualSelectionEnabled = !!(onBatchMarkIndesirable && poolRunId && projectId);

  const parcellesIdentity = useMemo(
    () => [...parcelles].map((p) => p.idu).sort().join("|"),
    [parcelles],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedIdus(new Set());
    setSelectionMode(false);
    setCheckedIdus(new Set());
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
    setSelectionMode(false);
    setCheckedIdus(new Set());
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

  if (!parcelles.length) return null;

  const visibleParcelles = parcelles.slice(0, visibleCount);
  const hasMore = parcelles.length > visibleCount;
  const showTrashColumn = !!(onMarkIndesirable && poolRunId && !selectionMode);
  const rankingColCount =
    RANKING_BASE_COL_COUNT + (selectionMode ? 1 : 0) + (showTrashColumn ? 1 : 0);

  return (
    <div className="ranking-wrap">
      <div className="ranking-header">
        <span className="ranking-title">Classement</span>
        <div className="ranking-header-actions">
          {manualSelectionEnabled && !selectionMode && (
            <button
              type="button"
              className="ranking-btn-select-mode"
              onClick={() => {
                setSelectionMode(true);
                setCheckedIdus(new Set());
              }}
              title="Cocher les parcelles à conserver, les autres iront dans les indésirables"
            >
              Sélectionner des parcelles
            </button>
          )}
          {selectionMode && (
            <div className="ranking-selection-bar">
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
              <button
                type="button"
                className="ranking-btn-keep-selected"
                disabled={applyingSelection || checkedIdus.size === 0}
                onClick={() => void handleKeepSelectedOnly()}
              >
                {applyingSelection ? "Application…" : "Conserver uniquement ces parcelles"}
              </button>
              <button
                type="button"
                className="ranking-btn-select-cancel"
                disabled={applyingSelection}
                onClick={exitSelectionMode}
              >
                Annuler
              </button>
            </div>
          )}
          <label className="ranking-sort-label">
            Trier par
            <select
              value={rankingSortKey}
              onChange={(e) => onRankingSortChange(e.target.value as RankingSortKey)}
              onClick={(ev) => ev.stopPropagation()}
            >
              <option value="rank">Rang (score)</option>
              <option value="composite_score">Score composite (décroissant)</option>
              <option value="durete_score">Dureté foncière (croissant)</option>
              <option value="distance">Distance projet</option>
              <option value="surface">Surface</option>
              <option value="miller">Miller</option>
              <option value="veg_dominant">Part dominante (zonage hybride)</option>
              <option
                value="veg_priority"
                title="Tri par surfaces m² d’intersection par classe (ordre de priorité), pas par % seuls"
              >
                Priorité filtre végétation (BD TOPO → CESBIO)
              </option>
              <optgroup label="Personnes morales & prospects">
                <option value="pm_personne_morale" title="Parcelles rattachées au répertoire PM en tête">
                  Personne morale (oui d&apos;abord)
                </option>
                <option
                  value="pm_compensation"
                  title="Propriétaires ayant déjà compensé sur un autre foncier en tête"
                >
                  Déjà compensé — autre foncier (oui d&apos;abord)
                </option>
                <option
                  value="pm_prospect_detail"
                  title="Compensation → parcelle déjà en MC → nb MC → surface MC → PM"
                >
                  Prospect détaillé (compensation + MC)
                </option>
              </optgroup>
            </select>
          </label>
          <label className="ranking-sort-label">
            Exporter
            <select
              value={exportChoice}
              disabled={!projectId || exporting || exportingPdf || selectionMode}
              title="Exporte les parcelles du classement actuel (hors indésirables)"
              onChange={async (e) => {
                const v = e.target.value as "" | "csv" | "shp";
                if (!v || !projectId) return;
                setExportChoice(v);
                setExporting(true);
                try {
                  if (v === "csv") await exportCsv(projectId, "parcelles", exportPoolRunId ?? null);
                  else await exportShp(projectId, "parcelles", exportPoolRunId ?? null);
                } catch (err) {
                  console.error("Export classement:", err);
                  alert(
                    err instanceof Error
                      ? err.message
                      : "Erreur lors de l'export. Voir la console.",
                  );
                } finally {
                  setExporting(false);
                  setExportChoice("");
                }
              }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <option value="">—</option>
              <option value="csv">CSV</option>
              <option value="shp">Shapefile (ZIP)</option>
            </select>
          </label>
          <button
            type="button"
            className="ranking-btn-pdf"
            disabled={!projectId || exporting || exportingPdf}
            title="Génère le rapport PDF (même périmètre que CSV / SHP pour ce run)"
            onClick={async (e) => {
              e.stopPropagation();
              if (!projectId) return;
              setExportingPdf(true);
              setLastPdfRssDeltaMb(null);
              try {
                const { rssDeltaMb } = await exportRapportPdf(projectId, exportPoolRunId ?? null);
                setLastPdfRssDeltaMb(rssDeltaMb);
              } catch (err) {
                console.error("Rapport PDF:", err);
                alert(
                  err instanceof Error
                    ? err.message
                    : "Erreur lors de la génération du rapport PDF.",
                );
              } finally {
                setExportingPdf(false);
              }
            }}
          >
            {exportingPdf
              ? "Génération du rapport… (téléchargement)"
              : "Rapport PDF"}
          </button>
          {lastPdfRssDeltaMb != null && Number.isFinite(lastPdfRssDeltaMb) && (
            <span
              className="ranking-pdf-rss-hint mono"
              title="Δ RSS processus serveur pendant export SHP + PDF (approximation, pas pic mémoire)"
            >
              Δ RAM serveur ~{lastPdfRssDeltaMb.toFixed(1)} Mo
            </span>
          )}
          {poolMetricsLoading && (
            <span className="ranking-pool-loading" title="Chargement des métriques du pool">
              Métriques…
            </span>
          )}
          <span className="ranking-count mono">
            {visibleParcelles.length} / {parcelles.length} parcelles
            {poolRunId && (
              <span className="ranking-pool-hint mono" title="UUID du run pool (requêtes SQL)">
                {" "}
                · run {poolRunId}
              </span>
            )}
          </span>
        </div>
      </div>

      {selectionMode && (
        <p className="ranking-selection-hint">
          Mode sélection manuelle — cochez les parcelles à <strong>conserver</strong> dans le classement.
          Les autres seront déplacées vers le pool indésirables (récupérables depuis le tableau en bas).
        </p>
      )}

      <div className={`ranking-table-scroll${selectionMode ? " ranking-table-scroll--selection" : ""}`}>
        <table className="ranking-table">
          <thead>
            <tr>
              {selectionMode && (
                <th className="col-select" aria-label="Conserver">
                  ✓
                </th>
              )}
              <th className="col-rank">#</th>
              <th className="col-eco">Score éco</th>
              <th className="col-surf">Surface</th>
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
            {visibleParcelles.map((p, idx) => {
              const isHovered = hoveredIdu === p.idu;
              const isSelected = selectedIdu === p.idu || expandedIdus.has(p.idu);
              const isChecked = checkedIdus.has(p.idu);
              const ecoScore = getEcologicalScore(poolMetricsByIdu?.[p.idu]);
              const ecoStyle = ecologicalBadgeStyle(ecoScore);
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
                    <td className="col-surf mono">
                      {p.surface_ha.toFixed(1)}<span className="unit"> ha</span>
                    </td>
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
                    <tr className="ranking-row-detail">
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
