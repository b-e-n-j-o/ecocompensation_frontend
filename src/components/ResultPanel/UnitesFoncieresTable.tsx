import { useEffect, useMemo, useState } from "react";
import { exportCsv, exportShp } from "../../api";
import type { UfFilterResponse } from "../../types";

const UF_PAGE_SIZE = 50;

interface UnitesFoncieresTableProps {
  ufResults: UfFilterResponse;
  projectId: string | null;
}

export function UnitesFoncieresTable({ ufResults, projectId }: UnitesFoncieresTableProps) {
  const [expandedUfId, setExpandedUfId] = useState<string | null>(null);
  const [visibleUfCount, setVisibleUfCount] = useState(UF_PAGE_SIZE);
  const [exportChoice, setExportChoice] = useState<"" | "csv" | "shp">("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setVisibleUfCount(UF_PAGE_SIZE);
    setExpandedUfId(ufResults.unites_foncieres?.[0]?.uf_id ?? null);
  }, [ufResults]);

  const ufCount = ufResults.total_uf ?? ufResults.unites_foncieres.length;

  const totalSousEnsembles = useMemo(() => {
    return ufResults.unites_foncieres.reduce((acc, uf) => acc + (uf.sous_ensembles?.length ?? 0), 0);
  }, [ufResults]);

  const ufs = ufResults.unites_foncieres;
  const visibleUfs = ufs.slice(0, visibleUfCount);
  const hasMoreUf = ufs.length > visibleUfCount;

  return (
    <div className="ranking-wrap">
      <div className="ranking-header">
        <span className="ranking-title">Unités foncières</span>
        <div className="ranking-header-actions">
          <label className="ranking-sort-label">
            Exporter
            <select
              value={exportChoice}
              disabled={!projectId || exporting}
              onChange={async (e) => {
                const v = e.target.value as "" | "csv" | "shp";
                if (!v || !projectId) return;
                setExportChoice(v);
                setExporting(true);
                try {
                  if (v === "csv") await exportCsv(projectId, "uf");
                  else await exportShp(projectId, "uf");
                } catch (err) {
                  console.error("Export classement UF:", err);
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
            >
              <option value="">—</option>
              <option value="csv">CSV</option>
              <option value="shp">Shapefile (ZIP)</option>
            </select>
          </label>
          <span className="ranking-count mono">
            {Math.min(visibleUfCount, ufs.length)} / {ufCount} UF · {totalSousEnsembles} sous-ensembles
          </span>
        </div>
      </div>

      <div className="ranking-table-scroll uf-foncieres-scroll" style={{ padding: 12 }}>
        {ufs.length === 0 ? (
          <div className="uf-empty-msg">Aucun résultat UF.</div>
        ) : (
          <>
          {visibleUfs.map((uf) => {
            const isExpanded = expandedUfId === uf.uf_id;

            return (
              <div key={uf.uf_id} style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setExpandedUfId(isExpanded ? null : uf.uf_id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="uf-foncier-title">
                      UF #{uf.rang} · {uf.uf_id}
                    </div>
                    <div className="uf-foncier-meta">
                      {uf.nb_parcelles} parcelles dans l'UF · {uf.sous_ensembles.length} combinaisons de sous-ensembles · dist centre {uf.distance_centre_km.toFixed(3)} km
                    </div>
                    {(uf.siren || uf.denomination) && (
                      <div className="uf-foncier-pm" title={[uf.denomination, uf.siren].filter(Boolean).join(" · ")}>
                        {uf.siren && <span className="mono">{uf.siren}</span>}
                        {uf.siren && uf.denomination ? " · " : ""}
                        {uf.denomination && <span>{uf.denomination}</span>}
                      </div>
                    )}
                  </div>
                  <span className="uf-foncier-toggle">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded && (
                  <div style={{ paddingTop: 8 }}>
                    <table className="ranking-table">
                      <thead>
                        <tr>
                          <th className="col-rank">#</th>
                          <th className="col-idu">subset_id</th>
                          <th className="col-uf-siren">SIREN</th>
                          <th className="col-uf-denom">Dénomination</th>
                          <th className="col-uf-nb-parcelles">Parcelles</th>
                          <th className="col-dist">Dist.</th>
                          <th className="col-surf">Surface</th>
                          <th className="col-miller">Miller</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uf.sous_ensembles.map((ss, idx) => (
                          <tr key={ss.subset_id} className="ranking-row">
                            <td className="col-rank">
                              <span className="rank-badge mono">{idx + 1}</span>
                            </td>
                            <td className="col-idu">
                              <div className="idu-cell">
                                <span className="idu-main mono">{ss.subset_id}</span>
                              </div>
                            </td>
                            <td className="col-uf-siren mono">
                              {ss.siren ?? "—"}
                            </td>
                            <td className="col-uf-denom" title={ss.denomination ?? undefined}>
                              {ss.denomination ?? "—"}
                            </td>
                            <td className="col-uf-nb-parcelles mono">
                              {ss.idus?.length ?? ss.k}<span className="unit"> parc.</span>
                            </td>
                            <td className="col-dist mono">
                              {ss.distance_centre_km.toFixed(3)}<span className="unit"> km</span>
                            </td>
                            <td className="col-surf mono">
                              {ss.surface_ha.toFixed(1)}<span className="unit"> ha</span>
                            </td>
                            <td className="col-miller mono">{ss.miller.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {hasMoreUf && (
            <div className="ranking-load-more" style={{ marginTop: 4, padding: "0 0 4px" }}>
              <button
                type="button"
                className="btn-load-more"
                onClick={() =>
                  setVisibleUfCount((c) => Math.min(c + UF_PAGE_SIZE, ufs.length))
                }
              >
                Afficher plus (+{Math.min(UF_PAGE_SIZE, ufs.length - visibleUfCount)} UF)
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

