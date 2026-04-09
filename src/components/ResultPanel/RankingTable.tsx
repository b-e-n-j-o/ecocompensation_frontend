// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ParcelleResult, ParcelPoolMetricRow, RankingSortKey } from "../../types";
import { RankingLine } from "./RankingLine";

const PAGE_SIZE = 50;

/** Nombre de colonnes du tableau principal (ligne de détail en dessous). */
const RANKING_COL_COUNT = 8;

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
}: RankingTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  /** Plusieurs lignes peuvent rester dépliées pour comparer les métriques. */
  const [expandedIdus, setExpandedIdus] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
              <th className="col-dist">Dist.</th>
              <th className="col-surf">Surface</th>
              <th className="col-miller">Miller</th>
            </tr>
          </thead>
          <tbody>
            {visibleParcelles.map((p) => {
              const isHovered = hoveredIdu === p.idu;
              const isSelected = selectedIdu === p.idu || expandedIdus.has(p.idu);
              const ref = parseIdu(p.idu, p.code_insee);

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
                      <span className="rank-badge mono">{p.rank}</span>
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
                    <td className="col-dist mono">
                      {p.distance_km.toFixed(1)}<span className="unit"> km</span>
                    </td>
                    <td className="col-surf mono">
                      {p.surface_ha.toFixed(1)}<span className="unit"> ha</span>
                    </td>
                    <td className="col-miller mono">
                      {p.miller.toFixed(2)}
                    </td>
                  </tr>
                  {expandedIdus.has(p.idu) && (
                    <tr className="ranking-row-detail">
                      <td colSpan={RANKING_COL_COUNT} className="ranking-cell-detail">
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