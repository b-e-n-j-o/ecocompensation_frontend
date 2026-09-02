// ─── Table des parcelles « pool indésirables » (sous le classement principal) ─
import { Fragment, useEffect, useMemo, useState } from "react";
import { exportCsv, exportShp } from "../../api";
import type { ParcelleResult, ParcelPoolMetricRow } from "../../types";
import { RankingLine } from "./RankingLine";

const COL_SPAN_DETAIL = 9;

type ParsedIdu = {
  insee: string;
  section: string;
  numero: string;
};

function parseIdu(idu: string, codeInseeFallback?: string): ParsedIdu {
  const raw = (idu ?? "").trim();
  const inseeFromIdu = raw.slice(0, 5);
  const section = raw.slice(8, 10);
  const numero = raw.slice(-4);
  return {
    insee: codeInseeFallback?.trim() || inseeFromIdu || "—",
    section: section || "—",
    numero: numero || "—",
  };
}

interface IndesirablesTableProps {
  projectId?: string | null;
  parcelles: ParcelleResult[];
  poolRunId: string;
  poolMetricsByIdu: Record<string, ParcelPoolMetricRow[]> | null;
  poolMetricsLoading: boolean;
  onRestore: (idu: string) => void;
  onRowActivate?: (idu: string) => void;
  onHover?: (idu: string | null) => void;
}

export function IndesirablesTable({
  projectId,
  parcelles,
  poolRunId,
  poolMetricsByIdu,
  poolMetricsLoading,
  onRestore,
  onRowActivate,
  onHover,
}: IndesirablesTableProps) {
  const [hoveredIdu, setHoveredIdu] = useState<string | null>(null);
  const [expandedIdus, setExpandedIdus] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const identity = useMemo(
    () => [...parcelles].map((p) => p.idu).sort().join("|"),
    [parcelles],
  );

  useEffect(() => {
    setExpandedIdus(new Set());
  }, [identity]);

  function handleClick(idu: string) {
    onRowActivate?.(idu);
    setExpandedIdus((prev) => {
      const next = new Set(prev);
      if (next.has(idu)) next.delete(idu);
      else next.add(idu);
      return next;
    });
  }

  if (!parcelles.length) return null;

  return (
    <div className="ranking-wrap indesirables-wrap">
      <div className={`ranking-chrome${toolsOpen ? " is-open" : ""}`}>
        <div className="ranking-chrome__bar">
          <span className="ranking-title ranking-title--indesirable">Pool indésirables</span>
          {projectId && (
            <button
              type="button"
              className="ranking-chrome__toggle"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
            >
              Exporter
              <span className="ranking-chrome__caret" aria-hidden>
                {toolsOpen ? "▴" : "▾"}
              </span>
            </button>
          )}
          {poolMetricsLoading && (
            <span className="ranking-chrome__status">Métriques…</span>
          )}
          <span className="ranking-count mono">
            {parcelles.length} exclue{parcelles.length > 1 ? "s" : ""}
          </span>
        </div>
        {toolsOpen && projectId && (
          <div className="ranking-tools" role="region" aria-label="Export indésirables">
            <div className="ranking-tools__actions">
              <button
                type="button"
                className="ranking-btn-export"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportCsv(projectId, "indesirables");
                  } catch (err) {
                    console.error("Export indésirables:", err);
                    alert(err instanceof Error ? err.message : "Erreur lors de l'export.");
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                CSV
              </button>
              <button
                type="button"
                className="ranking-btn-export"
                disabled={exporting}
                title="GeoPackage : parcelles + zone projet + aire d'étude"
                onClick={async () => {
                  setExporting(true);
                  try {
                    await exportShp(projectId, "indesirables");
                  } catch (err) {
                    console.error("Export indésirables:", err);
                    alert(err instanceof Error ? err.message : "Erreur lors de l'export.");
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                GPKG
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ranking-table-scroll">
        <table className="ranking-table ranking-table--indesirable">
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
              <th className="col-restore" title="Réintégrer au classement" aria-label="Réintégrer">
                ↩
              </th>
            </tr>
          </thead>
          <tbody>
            {parcelles.map((p, idx) => {
              const isHovered = hoveredIdu === p.idu;
              const isSelected = expandedIdus.has(p.idu);
              const ref = parseIdu(p.idu, p.code_insee);

              return (
                <Fragment key={p.idu}>
                  <tr
                    id={`row-parcelle-indesirable-${p.idu}`}
                    className={`ranking-row ranking-row--indesirable ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""}`}
                    onMouseEnter={() => {
                      setHoveredIdu(p.idu);
                      onHover?.(p.idu);
                    }}
                    onMouseLeave={() => {
                      setHoveredIdu(null);
                      onHover?.(null);
                    }}
                    onClick={() => handleClick(p.idu)}
                  >
                    <td className="col-rank">
                      <span className="rank-badge mono" title={`Rang initial filtre : ${p.rank}`}>
                        {idx + 1}
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
                    <td className="col-dist mono">
                      {p.distance_km.toFixed(1)}
                      <span className="unit"> km</span>
                    </td>
                    <td className="col-surf mono">
                      {p.surface_ha.toFixed(1)}
                      <span className="unit"> ha</span>
                    </td>
                    <td className="col-miller mono">{p.miller.toFixed(2)}</td>
                    <td className="col-restore">
                      <button
                        type="button"
                        className="ranking-btn-restore"
                        title="Réintégrer au classement"
                        aria-label={`Réintégrer la parcelle ${p.idu}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(p.idu);
                        }}
                      >
                        Réintégrer
                      </button>
                    </td>
                  </tr>
                  {expandedIdus.has(p.idu) && (
                    <tr
                      className="ranking-row-detail"
                      onMouseEnter={() => {
                        setHoveredIdu(p.idu);
                        onHover?.(p.idu);
                      }}
                      onMouseLeave={() => {
                        setHoveredIdu(null);
                        onHover?.(null);
                      }}
                    >
                      <td colSpan={COL_SPAN_DETAIL} className="ranking-cell-detail">
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
      </div>
    </div>
  );
}
