// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from "react";
import { exportCsv, exportRapportPdf, exportShp } from "../../api";
import type { ParcelleResult, ParcelPoolMetricRow, RankingSortKey } from "../../types";
import { RankingLine } from "./RankingLine";

const PAGE_SIZE = 50;

/** Nombre de colonnes fixes du tableau principal (hors colonne indésirable optionnelle). */
const RANKING_BASE_COL_COUNT = 13;

interface RankingTableProps {
  parcelles: ParcelleResult[];
  /** Run renvoyé par le dernier filtre (`pool_run_id`). */
  poolRunId?: string | null;
  /** Métriques pool préchargées après filtrage (`null` = chargement bulk en cours). */
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  poolMetricsLoading: boolean;
  rankingSortKey: RankingSortKey;
  onRankingSortChange: (k: RankingSortKey) => void;
  onHover?: (idu: string | null) => void;
  onSelect?: (idu: string | null) => void;
  onRowDoubleClick?: (idu: string) => void;
  selectedIdu?: string | null;
  /** IDU à laquelle scroller (ex. après double-clic sur la carte) */
  scrollToIdu?: string | null;
  /** Marquer la parcelle comme indésirable (pool persisté, sans refiltrer). */
  onMarkIndesirable?: (idu: string) => void;
  /** Projet courant (export CSV / SHP classement parcelles). */
  projectId?: string | null;
  /** Run pool pour l’export (historique) — défaut côté API : dernier last_results. */
  exportPoolRunId?: string | null;
}

type ParsedIdu = {
  insee: string;
  section: string;
  numero: string;
};

function parseIdu(idu: string, codeInseeFallback?: string): ParsedIdu {
  const raw = (idu ?? "").trim();
  const inseeFromIdu = raw.slice(0, 5);
  const section = raw.slice(8, 10);
  const numero = raw.slice(-4); // conserver les zéros initiaux

  return {
    insee: codeInseeFallback?.trim() || inseeFromIdu || "—",
    section: section || "—",
    numero: numero || "—",
  };
}

function getDureteScore(metrics: ParcelPoolMetricRow[] | undefined): number | null {
  const row = (metrics ?? []).find((m) => m.metric_key === "durete_fonciere");
  const raw = row?.metric_value_jsonb?.score_final;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 100) return null;
  return raw;
}

function getEcologicalScore(metrics: ParcelPoolMetricRow[] | undefined): { score: number; max: number } | null {
  const row = (metrics ?? []).find((m) => m.metric_key === "score_eco");
  const rawScore = row?.metric_value_jsonb?.total_score;
  const rawMax = row?.metric_value_jsonb?.max_score;
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) return null;
  const max = typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 6;
  return { score: rawScore, max };
}

type EspecesCell = {
  espece: string | null;
  distanceM: number | null;
};

function getEspecesCell(metrics: ParcelPoolMetricRow[] | undefined): EspecesCell {
  const row = (metrics ?? []).find((m) => m.metric_key === "especes_faune");
  const payload = row?.metric_value_jsonb;
  if (!payload || typeof payload !== "object") {
    return { espece: null, distanceM: null };
  }

  const nearestRaw = (payload as { nearest_species?: unknown }).nearest_species;
  const nearest = typeof nearestRaw === "string" && nearestRaw.trim() ? nearestRaw.trim() : null;

  const distRaw = (payload as { nearest_observation_distance_m?: unknown }).nearest_observation_distance_m;
  const distanceMRaw =
    typeof distRaw === "number" && Number.isFinite(distRaw) && distRaw >= 0 ? distRaw : null;

  const intersects = (payload as { intersects_any?: unknown }).intersects_any === true;
  const interRaw = (payload as { intersections_by_species?: unknown }).intersections_by_species;
  let topIntersectionSpecies: string | null = null;
  if (intersects && interRaw && typeof interRaw === "object") {
    const ranked = Object.entries(interRaw as Record<string, unknown>)
      .map(([label, cnt]) => ({
        label: String(label ?? "").trim(),
        count: typeof cnt === "number" && Number.isFinite(cnt) ? cnt : Number.NaN,
      }))
      .filter((x) => x.label && Number.isFinite(x.count) && x.count > 0)
      .sort((a, b) => (b.count === a.count ? a.label.localeCompare(b.label, "fr") : b.count - a.count));
    topIntersectionSpecies = ranked.length ? ranked[0].label : null;
  }

  return {
    espece: topIntersectionSpecies ?? nearest,
    distanceM: intersects ? 0 : distanceMRaw,
  };
}

type CompositeCell =
  | { kind: "score"; score: number; redhibitoire: boolean }
  | { kind: "sans_foncier" }
  | { kind: "empty" };

function getCompositeScore(metrics: ParcelPoolMetricRow[] | undefined): CompositeCell {
  const row = (metrics ?? []).find((m) => m.metric_key === "composite_score_v1");
  const v = row?.metric_value_jsonb;
  if (!v || typeof v !== "object") return { kind: "empty" };
  const rawScore = (v as { score_composite?: unknown }).score_composite;
  const rawRedhib = (v as { foncier_redhibitoire?: unknown }).foncier_redhibitoire;
  const status = (v as { composite_status?: unknown }).composite_status;
  if (
    typeof rawScore === "number" &&
    Number.isFinite(rawScore) &&
    rawScore >= 0 &&
    rawScore <= 100
  ) {
    return { kind: "score", score: rawScore, redhibitoire: rawRedhib === true };
  }
  if (status === "sans_foncier") {
    return { kind: "sans_foncier" };
  }
  return { kind: "empty" };
}

function ecologicalBadgeStyle(scorePayload: { score: number; max: number } | null): { bg: string; fg: string } {
  if (scorePayload == null) return { bg: "#e5e7eb", fg: "#374151" };
  const ratio = scorePayload.max > 0 ? scorePayload.score / scorePayload.max : 0;
  if (ratio >= 0.8) return { bg: "#dcfce7", fg: "#166534" };
  if (ratio >= 0.5) return { bg: "#bbf7d0", fg: "#166534" };
  if (ratio >= 0.2) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e5e7eb", fg: "#374151" };
}

function dureteBadgeStyle(score: number | null): { bg: string; fg: string } {
  if (score == null) return { bg: "#e5e7eb", fg: "#374151" };
  if (score >= 81) return { bg: "#fee2e2", fg: "#991b1b" };
  if (score >= 61) return { bg: "#ffedd5", fg: "#9a3412" };
  if (score >= 41) return { bg: "#fef3c7", fg: "#92400e" };
  if (score >= 21) return { bg: "#dcfce7", fg: "#166534" };
  return { bg: "#d1fae5", fg: "#065f46" };
}

function compositeBadgeStyle(cell: CompositeCell): { bg: string; fg: string } {
  if (cell.kind === "empty") return { bg: "#e5e7eb", fg: "#374151" };
  if (cell.kind === "sans_foncier") return { bg: "#e0e7ff", fg: "#3730a3" };
  if (cell.redhibitoire) return { bg: "#fee2e2", fg: "#991b1b" };
  const s = cell.score;
  if (s >= 75) return { bg: "#dcfce7", fg: "#166534" };
  if (s >= 55) return { bg: "#bbf7d0", fg: "#166534" };
  if (s >= 35) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e5e7eb", fg: "#374151" };
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
  onRowDoubleClick,
  selectedIdu,
  scrollToIdu,
  onMarkIndesirable,
  projectId,
  exportPoolRunId,
}: RankingTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  /** Plusieurs lignes peuvent rester dépliées pour comparer les métriques. */
  const [expandedIdus, setExpandedIdus] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exportChoice, setExportChoice] = useState<"" | "csv" | "shp">("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  /** Δ RSS serveur (Mo) pour la dernière génération PDF réussie — voir en-tête `X-Rapport-Rss-Delta-Mb`. */
  const [lastPdfRssDeltaMb, setLastPdfRssDeltaMb] = useState<number | null>(null);

  /** Identifiant stable du jeu de parcelles affiché (ordre ignoré) — pour ne pas fermer les déploiements au seul changement de tri. */
  const parcellesIdentity = useMemo(
    () => [...parcelles].map((p) => p.idu).sort().join("|"),
    [parcelles],
  );

  // Nouveau jeu de parcelles (filtre / curseur) : repartir sur les 50 premières ; fermer les déploiements si l’ensemble d’IDU change (pas au seul tri).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedIdus(new Set());
  }, [parcellesIdentity]);

  // Aller à la ligne correspondant à scrollToIdu (depuis la carte) : charger assez de lignes
  useEffect(() => {
    if (!scrollToIdu) return;
    const idx = parcelles.findIndex((p) => p.idu === scrollToIdu);
    if (idx === -1) return;
    setVisibleCount((prev) => Math.max(prev, idx + 1));
    setExpandedIdus((prev) => new Set(prev).add(scrollToIdu));
    requestAnimationFrame(() => {
      document.getElementById(`row-parcelle-${scrollToIdu}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [scrollToIdu, parcelles]);

  function handleHover(idu: string | null) {
    setHoveredIdu(idu);
    onHover?.(idu);
  }

  function handleClick(idu: string) {
    const wasExpanded = expandedIdus.has(idu);
    setExpandedIdus((prev) => {
      const next = new Set(prev);
      if (next.has(idu)) next.delete(idu);
      else next.add(idu);
      return next;
    });
    onSelect?.(!wasExpanded ? idu : null);
  }

  if (!parcelles.length) return null;

  const visibleParcelles = parcelles.slice(0, visibleCount);
  const hasMore = parcelles.length > visibleCount;
  const rankingColCount = RANKING_BASE_COL_COUNT + (onMarkIndesirable && poolRunId ? 1 : 0);

  return (
    <div className="ranking-wrap">
      <div className="ranking-header">
        <span className="ranking-title">Classement</span>
        <div className="ranking-header-actions">
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
              <option value="distance">Distance</option>
              <option value="surface">Surface</option>
              <option value="miller">Miller</option>
              <option value="veg_dominant">Part dominante (zonage hybride)</option>
              <option
                value="veg_priority"
                title="Tri par surfaces m² d’intersection par classe (ordre de priorité), pas par % seuls"
              >
                Priorité filtre végétation (BD TOPO → CESBIO)
              </option>
            </select>
          </label>
          <label className="ranking-sort-label">
            Exporter
            <select
              value={exportChoice}
              disabled={!projectId || exporting || exportingPdf}
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
              <span className="ranking-pool-hint" title="Run du pool de métriques">
                {" "}
                · run {poolRunId.slice(0, 8)}…
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="ranking-table-scroll">
        <table className="ranking-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-insee">INSEE</th>
              <th className="col-section">Section</th>
              <th className="col-numero">Numéro</th>
              <th className="col-idu">IDU</th>
              <th className="col-espece">Espèce</th>
              <th className="col-dist-espece">Dist espèce</th>
              <th className="col-dist">Dist.</th>
              <th className="col-eco">Score éco</th>
              <th className="col-composite">Composite</th>
              <th className="col-durete">Dureté</th>
              <th className="col-surf">Surface</th>
              <th className="col-miller">Miller</th>
              {onMarkIndesirable && poolRunId && (
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
              const ref = parseIdu(p.idu, p.code_insee);
              const ecoScore = getEcologicalScore(poolMetricsByIdu?.[p.idu]);
              const ecoStyle = ecologicalBadgeStyle(ecoScore);
              const compositeScore = getCompositeScore(poolMetricsByIdu?.[p.idu]);
              const compositeStyle = compositeBadgeStyle(compositeScore);
              const dureteScore = getDureteScore(poolMetricsByIdu?.[p.idu]);
              const dureteStyle = dureteBadgeStyle(dureteScore);
              const especesCell = getEspecesCell(poolMetricsByIdu?.[p.idu]);

              return (
                <Fragment key={p.idu}>
                  <tr
                    id={`row-parcelle-${p.idu}`}
                    className={`ranking-row ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => handleHover(p.idu)}
                    onMouseLeave={() => handleHover(null)}
                    onClick={() => handleClick(p.idu)}
                    onDoubleClick={() => onRowDoubleClick?.(p.idu)}
                  >
                    <td className="col-rank">
                      <span className="rank-badge mono">{idx + 1}</span>
                    </td>
                    <td className="col-insee mono">{ref.insee}</td>
                    <td className="col-section mono">{ref.section}</td>
                    <td className="col-numero mono">{ref.numero}</td>
                    <td className="col-idu">
                      <div className="idu-cell">
                        <span className="idu-main mono">{p.idu}</span>
                        <span className="idu-sub">{p.code_insee}</span>
                      </div>
                    </td>
                    <td className="col-espece" title={especesCell.espece ?? "Espèce non renseignée"}>
                      {especesCell.espece ?? "—"}
                    </td>
                    <td className="col-dist-espece mono">
                      {especesCell.distanceM == null ? (
                        "—"
                      ) : (
                        <>
                          {Math.round(especesCell.distanceM).toLocaleString("fr-FR")}
                          <span className="unit"> m</span>
                        </>
                      )}
                    </td>
                    <td className="col-dist mono">
                      {p.distance_km.toFixed(1)}<span className="unit"> km</span>
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
                    <td className="col-composite">
                      <span
                        className="mono"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 52,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: compositeStyle.bg,
                          color: compositeStyle.fg,
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                        title={
                          compositeScore.kind === "empty"
                            ? "Score composite non disponible"
                            : compositeScore.kind === "sans_foncier"
                              ? "Score composite non calculé : dureté foncière non applicable (hors personnes morales). Voir le score écologique."
                              : compositeScore.redhibitoire
                                ? `Score composite: ${compositeScore.score}/100 — dureté rédhibitoire`
                                : `Score composite: ${compositeScore.score}/100`
                        }
                      >
                        {compositeScore.kind === "empty"
                          ? "—"
                          : compositeScore.kind === "sans_foncier"
                            ? "n/c"
                            : compositeScore.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="col-durete">
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
                        title={
                          dureteScore == null
                            ? "Score de dureté non disponible"
                            : `Score de dureté foncière: ${dureteScore}/100`
                        }
                      >
                        {dureteScore == null ? "—" : dureteScore}
                      </span>
                    </td>
                    <td className="col-surf mono">
                      {p.surface_ha.toFixed(1)}<span className="unit"> ha</span>
                    </td>
                    <td className="col-miller mono">
                      {p.miller.toFixed(2)}
                    </td>
                    {onMarkIndesirable && poolRunId && (
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