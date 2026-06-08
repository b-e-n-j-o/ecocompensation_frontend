import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { exportCsv, exportShp } from "../../api";
import type { SousEnsembleResult, UfFilterResponse } from "../../types";
import {
  FilterEnrichBlock,
  PersonnesMoralesBlock,
  ScoreBlock,
  parsePersonnesMoralesPayload,
  type ParcelScorePayload,
} from "./RankingLine";

const UF_PAGE_SIZE = 50;

interface UnitesFoncieresTableProps {
  ufResults: UfFilterResponse;
  projectId: string | null;
  selectedSubsetId?: string | null;
  scrollToSubsetId?: string | null;
  scrollTableNonce?: number;
  onSubsetActivate?: (subsetId: string) => void;
  onUfActivate?: (ufId: string) => void;
}

function scoreLabel(score: ParcelScorePayload | undefined): string {
  if (!score) return "—";
  return `${score.total_score}/${score.max_score}`;
}

function SousEnsembleDetail({ ss }: { ss: SousEnsembleResult }) {
  const enrichPayload = {
    veg_libelles: ss.veg_libelles ?? [],
    fauna_distances: ss.fauna_distances ?? {},
  };
  const hasEnrich =
    enrichPayload.veg_libelles.length > 0 || Object.keys(enrichPayload.fauna_distances).length > 0;
  const scorePayload = ss.score_eco as ParcelScorePayload | undefined;

  return (
    <div className="ranking-line-detail uf-subset-detail" role="region" aria-label={`Détail ${ss.subset_id}`}>
      {hasEnrich ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Enrichissement écologique (union parcelles)</h4>
          <FilterEnrichBlock payload={enrichPayload} />
        </section>
      ) : (
        <p className="ranking-line-empty">Enrichissement CESBIO / faune non disponible pour ce sous-ensemble.</p>
      )}
      {scorePayload ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Score écologique</h4>
          <ScoreBlock payload={scorePayload} />
        </section>
      ) : null}
    </div>
  );
}

export function UnitesFoncieresTable({
  ufResults,
  projectId,
  selectedSubsetId = null,
  scrollToSubsetId = null,
  scrollTableNonce = 0,
  onSubsetActivate,
  onUfActivate,
}: UnitesFoncieresTableProps) {
  const [expandedUfId, setExpandedUfId] = useState<string | null>(null);
  const [expandedSubsetId, setExpandedSubsetId] = useState<string | null>(null);
  const [visibleUfCount, setVisibleUfCount] = useState(UF_PAGE_SIZE);
  const [exportChoice, setExportChoice] = useState<"" | "csv" | "shp">("");
  const [exporting, setExporting] = useState(false);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    setVisibleUfCount(UF_PAGE_SIZE);
    setExpandedUfId(ufResults.unites_foncieres?.[0]?.uf_id ?? null);
    setExpandedSubsetId(null);
  }, [ufResults]);

  const ufs = ufResults.unites_foncieres;

  useEffect(() => {
    if (!scrollToSubsetId) return;
    const ufIdx = ufs.findIndex((uf) =>
      (uf.sous_ensembles ?? []).some((ss) => ss.subset_id === scrollToSubsetId),
    );
    if (ufIdx >= 0) {
      setVisibleUfCount((c) => Math.max(c, ufIdx + 1));
      setExpandedUfId(ufs[ufIdx].uf_id);
      setExpandedSubsetId(scrollToSubsetId);
    }
    const idToScroll = scrollToSubsetId;
    requestAnimationFrame(() => {
      rowRefs.current.get(idToScroll)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [scrollToSubsetId, scrollTableNonce, ufs]);

  const ufCount = ufResults.total_uf ?? ufResults.unites_foncieres.length;

  const totalSousEnsembles = useMemo(() => {
    return ufResults.unites_foncieres.reduce((acc, uf) => acc + (uf.sous_ensembles?.length ?? 0), 0);
  }, [ufResults]);

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
            const pmPayload = uf.pm_prospect
              ? parsePersonnesMoralesPayload(uf.pm_prospect as Record<string, unknown>)
              : null;
            const isProspect = pmPayload?.compensation_deja_realisee === true;

            return (
              <div key={uf.uf_id} style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    const nextExpanded = !isExpanded;
                    setExpandedUfId(nextExpanded ? uf.uf_id : null);
                    setExpandedSubsetId(null);
                    onUfActivate?.(uf.uf_id);
                  }}
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
                      {isProspect && (
                        <span className="uf-prospect-badge" title="Personne morale ayant déjà compensé (autre foncier)">
                          Prospect compensation
                        </span>
                      )}
                    </div>
                    <div className="uf-foncier-meta">
                      {uf.nb_parcelles} parcelles dans l&apos;UF · {uf.sous_ensembles.length} combinaisons · dist centre {uf.distance_centre_km.toFixed(3)} km
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
                    {pmPayload && (
                      <section className="ranking-metric-block" style={{ marginBottom: 10 }}>
                        <h4 className="ranking-metric-title">Personne morale & prospect (une fois par SIREN)</h4>
                        <PersonnesMoralesBlock payload={pmPayload} />
                      </section>
                    )}
                    <table className="ranking-table">
                      <thead>
                        <tr>
                          <th className="col-rank">#</th>
                          <th className="col-idu">subset_id</th>
                          <th className="col-uf-nb-parcelles">Parcelles</th>
                          <th className="col-dist">Dist.</th>
                          <th className="col-surf">Surface</th>
                          <th className="col-miller">Miller</th>
                          <th className="col-score">Score éco</th>
                          <th className="col-detail" aria-label="Détail" />
                        </tr>
                      </thead>
                      <tbody>
                        {uf.sous_ensembles.map((ss, idx) => {
                          const detailOpen = expandedSubsetId === ss.subset_id;
                          const isSelected = selectedSubsetId === ss.subset_id;
                          return (
                            <Fragment key={ss.subset_id}>
                              <tr
                                key={ss.subset_id}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(ss.subset_id, el);
                                  else rowRefs.current.delete(ss.subset_id);
                                }}
                                className={`ranking-row${detailOpen ? " ranking-row--expanded" : ""}${isSelected ? " selected" : ""}`}
                                onClick={() => {
                                  const open = !detailOpen;
                                  setExpandedSubsetId(open ? ss.subset_id : null);
                                  onSubsetActivate?.(ss.subset_id);
                                }}
                                style={{ cursor: "pointer" }}
                              >
                                <td className="col-rank">
                                  <span className="rank-badge mono">{idx + 1}</span>
                                </td>
                                <td className="col-idu">
                                  <div className="idu-cell">
                                    <span className="idu-main mono">{ss.subset_id}</span>
                                  </div>
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
                                <td className="col-score mono">{scoreLabel(ss.score_eco as ParcelScorePayload | undefined)}</td>
                                <td className="col-detail mono" style={{ color: "#64748b" }}>
                                  {detailOpen ? "▾" : "▸"}
                                </td>
                              </tr>
                              {detailOpen && (
                                <tr key={`${ss.subset_id}-detail`} className="ranking-row-detail">
                                  <td colSpan={8}>
                                    <SousEnsembleDetail ss={ss} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
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
