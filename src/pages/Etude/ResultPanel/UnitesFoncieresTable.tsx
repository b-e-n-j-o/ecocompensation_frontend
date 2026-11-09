import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { auditUfCombinations, type UfCombinationsAudit } from "../../../api";
import { ExportEtudeMenu } from "./ExportEtudeMenu";
import { ResultInfoNote } from "./ResultInfoNote";
import type { SousEnsembleResult, UfFilterResponse } from "../../../types";
import {
  FilterEnrichBlock,
  PersonnesMoralesBlock,
  ScoreBlock,
  parsePersonnesMoralesPayload,
  type ParcelScorePayload,
} from "./RankingLine";
import {
  getBestScore,
  getUfParcelles,
  parcelleLabelFromIdu,
  type UfAvecParcelles,
  type UfParcelle,
} from "./ufParcelles";

const UF_PAGE_SIZE = 50;

type UfTab = "parcelles" | "combinaisons" | "proprietaire";

interface UnitesFoncieresTableProps {
  ufResults: UfFilterResponse;
  projectId: string | null;
  selectedSubsetId?: string | null;
  scrollToSubsetId?: string | null;
  scrollTableNonce?: number;
  onSubsetActivate?: (subsetId: string) => void;
  onUfActivate?: (ufId: string) => void;
  onSubsetHover?: (subsetId: string | null) => void;
  onUfHover?: (ufId: string | null) => void;
  /** Clic sur l'emprise d'une UF dans la carte : ouvre et fait défiler jusqu'à cette UF. */
  scrollToUfId?: string | null;
  /** Parcelle survolée (tableau ou carte), synchronisée avec SousEnsemblesMap. */
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
}

function scoreLabel(score: ParcelScorePayload | undefined): string {
  if (!score) return "—";
  return `${score.total_score}/${score.max_score}`;
}

function largestSubset(uf: { sous_ensembles: SousEnsembleResult[] }): SousEnsembleResult | null {
  return uf.sous_ensembles.reduce<SousEnsembleResult | null>((best, ss) => {
    if (!best) return ss;
    return (ss.idus?.length ?? ss.k) > (best.idus?.length ?? best.k) ? ss : best;
  }, null);
}

function UniteEnrichissement({ uf }: { uf: { sous_ensembles: SousEnsembleResult[] } }) {
  const ss = largestSubset(uf);
  if (!ss) return null;
  const n = ss.idus?.length ?? ss.k;
  const enrichPayload = {
    veg_libelles: ss.veg_libelles ?? [],
    veg_profile: ss.veg_profile,
    fauna_distances: ss.fauna_distances ?? {},
  };
  const hasProfile = Object.keys(ss.veg_profile ?? {}).length > 0;
  const hasEnrich =
    enrichPayload.veg_libelles.length > 0
    || hasProfile
    || Object.keys(enrichPayload.fauna_distances).length > 0;

  return (
    <section className="ranking-metric-block" style={{ marginBottom: 10 }}>
      <h4 className="ranking-metric-title">Occupation du sol de l&apos;unité foncière</h4>
      <p className="ranking-line-empty" style={{ marginTop: 0 }}>
        Mesurée sur l&apos;union des {n} parcelles de l&apos;unité, pas en moyenne des parcelles.
      </p>
      {hasEnrich ? (
        <FilterEnrichBlock payload={enrichPayload} part="sol" />
      ) : (
        <p className="ranking-line-empty">
          Profil CESBIO non encore calculé pour cette unité. Il apparaît après un nouveau filtrage.
        </p>
      )}
    </section>
  );
}

/** Présence d'une parcelle dans les combinaisons : 5 pastilles + k/n. */
function PresenceDots({ p, total }: { p: UfParcelle; total: number }) {
  const filled = Math.round(p.presence * 5);
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      title={`Présente dans ${p.nb_combinaisons} combinaison(s) sur ${total}`}
    >
      <span aria-hidden style={{ letterSpacing: 1, color: p.noyau ? "#1e3a8a" : "#3b82f6" }}>
        {"●".repeat(filled)}
        <span style={{ color: "#cbd5e1" }}>{"●".repeat(5 - filled)}</span>
      </span>
      <span className="mono">{p.nb_combinaisons}/{total}</span>
      {p.noyau && (
        <span
          style={{
            padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700,
            background: "rgba(30, 58, 138, 0.12)", color: "#1e3a8a",
          }}
        >
          Noyau
        </span>
      )}
    </span>
  );
}

function UfParcellesTable({
  parcelles,
  total,
  hoverIdu,
  onHover,
}: {
  parcelles: UfParcelle[];
  total: number;
  hoverIdu: string | null;
  onHover?: (idu: string | null) => void;
}) {
  return (
    <table className="ranking-table uf-parcelles-table">
      <thead>
        <tr>
          <th>Parcelle</th>
          <th className="col-surf">Surface</th>
          <th title="Nombre de combinaisons retenues contenant la parcelle">Présence</th>
          <th title="Parcelle également retenue dans l'onglet Parcelles">Pool</th>
        </tr>
      </thead>
      <tbody>
        {parcelles.map((p) => {
          const { label, insee } = parcelleLabelFromIdu(p.idu);
          return (
            <tr
              key={p.idu}
              className={`ranking-row${hoverIdu === p.idu ? " hovered" : ""}`}
              onMouseEnter={() => onHover?.(p.idu)}
              onMouseLeave={() => onHover?.(null)}
            >
              <td className="mono" title={p.idu}>
                {label}
                {insee ? <span className="unit"> · {insee}</span> : null}
              </td>
              <td className="col-surf mono">
                {p.surface_ha != null ? <>{p.surface_ha.toFixed(2)}<span className="unit"> ha</span></> : <span className="na">—</span>}
              </td>
              <td><PresenceDots p={p} total={total} /></td>
              <td className="mono">{p.in_pool ? "oui" : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SousEnsembleDetail({ ss }: { ss: SousEnsembleResult }) {
  const enrichPayload = {
    veg_libelles: ss.veg_libelles ?? [],
    veg_profile: ss.veg_profile,
    fauna_distances: ss.fauna_distances ?? {},
  };
  const hasEnrich =
    enrichPayload.veg_libelles.length > 0
    || Object.keys(ss.veg_profile ?? {}).length > 0
    || Object.keys(enrichPayload.fauna_distances).length > 0;
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
  onSubsetHover,
  onUfHover,
  hoverParcelleIdu = null,
  onParcelleHover,
  scrollToUfId = null,
}: UnitesFoncieresTableProps) {
  const [expandedUfId, setExpandedUfId] = useState<string | null>(null);
  const [expandedSubsetId, setExpandedSubsetId] = useState<string | null>(null);
  const [hoveredSubsetId, setHoveredSubsetId] = useState<string | null>(null);
  const [visibleUfCount, setVisibleUfCount] = useState(UF_PAGE_SIZE);
  const [ufTab, setUfTab] = useState<UfTab>("parcelles");
  const [auditK, setAuditK] = useState(5);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState<UfCombinationsAudit | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    setVisibleUfCount(UF_PAGE_SIZE);
    setExpandedUfId(null);
    setExpandedSubsetId(null);
    setUfTab("parcelles");
  }, [ufResults]);

  const ufs = ufResults.unites_foncieres as UfAvecParcelles[];

  useEffect(() => {
    if (!scrollToSubsetId) return;
    const ufIdx = ufs.findIndex((uf) =>
      (uf.sous_ensembles ?? []).some((ss) => ss.subset_id === scrollToSubsetId),
    );
    if (ufIdx >= 0) {
      setVisibleUfCount((c) => Math.max(c, ufIdx + 1));
      setExpandedUfId(ufs[ufIdx].uf_id);
      setExpandedSubsetId(scrollToSubsetId);
      setUfTab("combinaisons");
    }
    const idToScroll = scrollToSubsetId;
    requestAnimationFrame(() => {
      rowRefs.current.get(idToScroll)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [scrollToSubsetId, scrollTableNonce, ufs]);

  useEffect(() => {
    if (!scrollToUfId) return;
    const ufIdx = ufs.findIndex((uf) => uf.uf_id === scrollToUfId);
    if (ufIdx < 0) return;
    setVisibleUfCount((c) => Math.max(c, ufIdx + 1));
    setExpandedUfId(scrollToUfId);
    setExpandedSubsetId(null);
    setUfTab("parcelles");
    const id = scrollToUfId;
    window.setTimeout(() => {
      document.getElementById(`uf-block-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  }, [scrollToUfId, scrollTableNonce, ufs]);

  const ufCount = ufResults.total_uf ?? ufResults.unites_foncieres.length;

  const parcellesByUf = useMemo(() => {
    const out: Record<string, UfParcelle[]> = {};
    for (const uf of ufs) out[uf.uf_id] = getUfParcelles(uf);
    return out;
  }, [ufs]);

  const visibleUfs = ufs.slice(0, visibleUfCount);
  const hasMoreUf = ufs.length > visibleUfCount;

  return (
    <div className="ranking-wrap">
      <div className="ranking-chrome">
        <div className="ranking-chrome__bar">
          {projectId && <ExportEtudeMenu projectId={projectId} page="uf" />}
          <span className="ranking-count mono">
            {Math.min(visibleUfCount, ufs.length)} / {ufCount} UF
          </span>
          {projectId && (
            <form
              style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}
              onSubmit={(e) => {
                e.preventDefault();
                setAuditLoading(true);
                setAuditError(null);
                auditUfCombinations(projectId, auditK)
                  .then(setAudit)
                  .catch((err: Error) => setAuditError(err.message))
                  .finally(() => setAuditLoading(false));
              }}
            >
              <label style={{ fontSize: 12, color: "#475569" }}>
                Taille max des combinaisons
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={auditK}
                  onChange={(e) => setAuditK(Number(e.target.value))}
                  style={{ width: 52, marginLeft: 6 }}
                />
              </label>
              <button type="submit" className="ranking-btn-select-mode" disabled={auditLoading}>
                {auditLoading ? "Comptage…" : "Estimer"}
              </button>
            </form>
          )}
        </div>
        {audit && (
          <p className="ranking-line-empty" style={{ margin: "8px 12px 0" }}>
            De 2 à {audit.max_k} parcelles : {audit.n_combinaisons_surface_ok.toLocaleString("fr-FR")} combinaisons
            qui passent la surface minimale ({audit.n_combinaisons.toLocaleString("fr-FR")} avant ce filtre),
            sur {audit.n_uf.toLocaleString("fr-FR")} UF, en {audit.secondes}s.
            {audit.n_uf_au_dela_du_plafond_actuel > 0
              ? ` ${audit.n_uf_au_dela_du_plafond_actuel} UF ont plus de ${audit.cap_parcelles_uf_actuel} parcelles : elles sont ignorées par le calcul actuel.`
              : ""}
            {" "}Les résultats affichés ne sont pas modifiés.
          </p>
        )}
        {auditError && (
          <p className="ranking-line-empty" style={{ margin: "8px 12px 0" }}>{auditError}</p>
        )}
        <ResultInfoNote>
          <p>
            Une unité foncière regroupe les parcelles cadastrales d&apos;une même société
            (personne morale), quand elles se touchent. C&apos;est le terrain qu&apos;on peut
            envisager d&apos;acheter ou de conventionner auprès d&apos;un seul propriétaire.
          </p>
          <p>
            La surface, l&apos;occupation du sol et les distances aux observations de faune
            portent sur l&apos;ensemble de ces parcelles réunies. Ce n&apos;est pas une moyenne
            des parcelles prises une par une. Le score écologique et la distance au projet
            servent à classer les unités.
          </p>
          <p>
            En ouvrant une unité, les parcelles listées sont celles qui la composent.
            Les combinaisons sont des regroupements plus petits, à l&apos;intérieur de la
            même propriété, qui respectent aussi les critères du filtre.
          </p>
        </ResultInfoNote>
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
            const parcelles = parcellesByUf[uf.uf_id] ?? [];
            const nbComb = uf.nb_combinaisons ?? uf.sous_ensembles.length;
            const nbNoyau = uf.nb_parcelles_noyau ?? parcelles.filter((p) => p.noyau).length;
            const surface = uf.surface_ha_parcelles ?? null;
            const best = getBestScore(uf);

            return (
              <div
                key={uf.uf_id}
                id={`uf-block-${uf.uf_id}`}
                style={{ marginBottom: 12 }}
                onMouseEnter={() => onUfHover?.(uf.uf_id)}
                onMouseLeave={() => {
                  onUfHover?.(null);
                  onSubsetHover?.(null);
                  onParcelleHover?.(null);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const nextExpanded = !isExpanded;
                    setExpandedUfId(nextExpanded ? uf.uf_id : null);
                    setExpandedSubsetId(null);
                    setUfTab("parcelles");
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
                      UF #{uf.rang}
                      {uf.denomination ? ` · ${uf.denomination}` : ` · ${uf.uf_id}`}
                      {isProspect && (
                        <span className="uf-prospect-badge" title="Personne morale ayant déjà compensé (autre foncier)">
                          Prospect compensation
                        </span>
                      )}
                    </div>
                    <div className="uf-foncier-meta">
                      {parcelles.length} parcelles retenues
                      {nbNoyau > 0 ? ` (dont ${nbNoyau} incontournable${nbNoyau > 1 ? "s" : ""})` : ""}
                      {surface != null ? ` · ${surface.toFixed(1)} ha` : ""}
                      {best ? ` · meilleur score éco ${best.total_score}/${best.max_score}` : ""}
                      {` · dist centre ${uf.distance_centre_km.toFixed(1)} km`}
                    </div>
                    {uf.siren && (
                      <div className="uf-foncier-pm" title={[uf.denomination, uf.siren].filter(Boolean).join(" · ")}>
                        <span className="mono">SIREN {uf.siren}</span>
                      </div>
                    )}
                  </div>
                  <span className="uf-foncier-toggle">
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded && (
                  <div style={{ paddingTop: 8 }}>
                    <div className="ranking-line-tabs" role="tablist" aria-label="Détail de l'unité foncière">
                      {([
                        ["parcelles", `Parcelles (${parcelles.length})`],
                        ["combinaisons", `Combinaisons (${nbComb})`],
                        ["proprietaire", "Propriétaire"],
                      ] as [UfTab, string][]).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          className={`ranking-line-tab${ufTab === id ? " is-active" : ""}`}
                          aria-selected={ufTab === id}
                          onClick={() => setUfTab(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {ufTab === "parcelles" && (
                      <>
                        <p className="filter-enrich-fauna-hint" style={{ margin: "6px 0" }}>
                          Parcelles de la société retenues dans au moins une combinaison valide.
                          Les parcelles <strong>« Noyau »</strong> sont présentes dans toutes les combinaisons :
                          elles sont incontournables. Les autres sont optionnelles.
                        </p>
                        <UniteEnrichissement uf={uf} />
                        <UfParcellesTable
                          parcelles={parcelles}
                          total={nbComb}
                          hoverIdu={hoverParcelleIdu}
                          onHover={onParcelleHover}
                        />
                      </>
                    )}

                    {ufTab === "proprietaire" && (
                      pmPayload ? (
                        <div style={{ marginTop: 6 }}>
                          <PersonnesMoralesBlock payload={pmPayload} />
                        </div>
                      ) : (
                        <p className="ranking-line-empty">Informations propriétaire non disponibles.</p>
                      )
                    )}

                    {ufTab === "combinaisons" && (
                    <>
                    <p className="filter-enrich-fauna-hint" style={{ margin: "6px 0" }}>
                      Regroupements de parcelles contiguës qui respectent chacun les critères du filtre
                      (surface, forme, végétation, faune). La liste des parcelles en est la synthèse.
                    </p>
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
                          const isHovered = hoveredSubsetId === ss.subset_id;
                          return (
                            <Fragment key={ss.subset_id}>
                              <tr
                                key={ss.subset_id}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(ss.subset_id, el);
                                  else rowRefs.current.delete(ss.subset_id);
                                }}
                                className={`ranking-row${detailOpen ? " ranking-row--expanded" : ""}${isSelected ? " selected" : ""}${isHovered ? " hovered" : ""}`}
                                onClick={() => {
                                  const open = !detailOpen;
                                  setExpandedSubsetId(open ? ss.subset_id : null);
                                  onSubsetActivate?.(ss.subset_id);
                                }}
                                onMouseEnter={() => {
                                  setHoveredSubsetId(ss.subset_id);
                                  onSubsetHover?.(ss.subset_id);
                                }}
                                onMouseLeave={() => {
                                  setHoveredSubsetId(null);
                                  onSubsetHover?.(null);
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
                                <tr
                                  key={`${ss.subset_id}-detail`}
                                  className="ranking-row-detail"
                                  onMouseEnter={() => {
                                    setHoveredSubsetId(ss.subset_id);
                                    onSubsetHover?.(ss.subset_id);
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredSubsetId(null);
                                    onSubsetHover?.(null);
                                  }}
                                >
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
                    </>
                    )}
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
