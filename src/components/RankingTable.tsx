// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useState } from "react";
import type { ParcelleResult, ScoreDetail } from "../types";

const PAGE_SIZE = 50;

interface RankingTableProps {
  parcelles: ParcelleResult[];
  onHover?: (idu: string | null) => void;
  onSelect?: (idu: string | null) => void;
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

/** Même dégradé que la carte : 0 = plus mauvais, 1 = meilleur (adapté à tout barème de points). */
function scoreNormToColor(norm: number): string {
  if (norm <= 0) return "#333a4d";
  if (norm >= 1) return "#3ecf8e";
  if (norm <= 0.33) {
    const t = norm / 0.33;
    return interpolateHex("#333a4d", "#555f72", t);
  }
  if (norm <= 0.66) {
    const t = (norm - 0.33) / 0.33;
    return interpolateHex("#555f72", "#f59e0b", t);
  }
  const t = (norm - 0.66) / 0.34;
  return interpolateHex("#f59e0b", "#3ecf8e", t);
}

function interpolateHex(a: string, b: string, t: number): string {
  const r = Math.round(parseInt(a.slice(1, 3), 16) * (1 - t) + parseInt(b.slice(1, 3), 16) * t);
  const g = Math.round(parseInt(a.slice(3, 5), 16) * (1 - t) + parseInt(b.slice(3, 5), 16) * t);
  const bl = Math.round(parseInt(a.slice(5, 7), 16) * (1 - t) + parseInt(b.slice(5, 7), 16) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

const SCORE_BAR_PIPS = 10;

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const maxSafe = Math.max(max, 1);
  const filled = Math.round((score / maxSafe) * SCORE_BAR_PIPS);
  return (
    <div className="score-bar-wrap" title={`${score}/${maxSafe} pts`}>
      {Array.from({ length: SCORE_BAR_PIPS }).map((_, i) => (
        <div
          key={i}
          className="score-pip"
          style={{ background: i < filled ? color : undefined }}
        />
      ))}
    </div>
  );
}

function ScorePopover({ details }: { details: ScoreDetail[] }) {
  return (
    <div className="score-popover">
      {details.map((d) => (
        <div key={d.critere} className="sp-row">
          <span className="sp-critere">{d.critere}</span>
          <span
            className="sp-pts"
            style={{ color: d.points > 0 ? "var(--accent-green)" : "#000000" }}
          >
            {d.points > 0 ? `+${d.points}` : "0"}
          </span>
          <span className="sp-raison">{d.raison}</span>
        </div>
      ))}
    </div>
  );
}

export function RankingTable({
  parcelles,
  onHover,
  onSelect,
  selectedIdu,
  scrollToIdu,
}: RankingTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  const [expandedIdu, setExpandedIdu] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Nouveau jeu de parcelles (filtre / curseur) : repartir sur les 50 premières
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [parcelles]);

  // Aller à la ligne correspondant à scrollToIdu (depuis la carte) : charger assez de lignes
  useEffect(() => {
    if (!scrollToIdu) return;
    const idx = parcelles.findIndex((p) => p.idu === scrollToIdu);
    if (idx === -1) return;
    setVisibleCount((prev) => Math.max(prev, idx + 1));
    setExpandedIdu(scrollToIdu);
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
    const next = expandedIdu === idu ? null : idu;
    setExpandedIdu(next);
    onSelect?.(next);
  }

  if (!parcelles.length) return null;

  const visibleParcelles = parcelles.slice(0, visibleCount);
  const hasMore = parcelles.length > visibleCount;

  const scores = parcelles.map((p) => p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore || 1;

  function getScoreNorm(score: number): number {
    return (score - minScore) / scoreRange;
  }

  return (
    <div className="ranking-wrap">
      <div className="ranking-header">
        <span className="ranking-title">Classement</span>
        <span className="ranking-count mono">
          {visibleParcelles.length} / {parcelles.length} parcelles
        </span>
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
              <th className="col-score">Score</th>
              <th className="col-dist">Dist.</th>
              <th className="col-surf">Surface</th>
              <th className="col-miller">Miller</th>
              <th className="col-hydro">Hydro</th>
            </tr>
          </thead>
          <tbody>
            {visibleParcelles.map((p) => {
              const isHovered = hoveredIdu === p.idu;
              const isSelected = selectedIdu === p.idu || expandedIdu === p.idu;
              const scoreNorm = getScoreNorm(p.score);
              const color = scoreNormToColor(scoreNorm);
              const ref = parseIdu(p.idu, p.code_insee);

              return (
                <Fragment key={p.idu}>
                  <tr
                    id={`row-parcelle-${p.idu}`}
                    className={`ranking-row ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => handleHover(p.idu)}
                    onMouseLeave={() => handleHover(null)}
                    onClick={() => handleClick(p.idu)}
                  >
                    <td className="col-rank">
                      <span
                        className="rank-badge mono"
                        style={{ borderColor: color, color }}
                      >
                        {p.rank}
                      </span>
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
                    <td className="col-score">
                      <div className="score-cell">
                        <span className="score-num mono" style={{ color }}>
                          {p.score}
                        </span>
                        <ScoreBar score={p.score} max={maxScore} color={color} />
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
                    <td className="col-hydro mono">
                      {p.dist_hydro_m !== null
                        ? p.dist_hydro_m < 1
                          ? <span style={{ color: "var(--accent-green)" }}>0 m</span>
                          : `${Math.round(p.dist_hydro_m)} m`
                        : <span className="na">—</span>}
                    </td>
                  </tr>

                  {/* Détail score (expand) */}
                  {expandedIdu === p.idu && (
                    <tr className="detail-row">
                      <td colSpan={7}>
                        <ScorePopover details={p.score_details} />
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