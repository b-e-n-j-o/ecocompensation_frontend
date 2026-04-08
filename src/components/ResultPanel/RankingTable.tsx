// ─── RankingTable ─────────────────────────────────────────────────────────────
import { Fragment, useEffect, useState } from "react";
import type { ParcelleResult } from "../../types";

const PAGE_SIZE = 50;

interface RankingTableProps {
  parcelles: ParcelleResult[];
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
  onHover,
  onSelect,
  onRowDoubleClick,
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
                    <td className="col-hydro mono">
                      {p.dist_hydro_m !== null
                        ? p.dist_hydro_m < 1
                          ? <span style={{ color: "var(--accent-green)" }}>0 m</span>
                          : `${Math.round(p.dist_hydro_m)} m`
                        : <span className="na">—</span>}
                    </td>
                  </tr>

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