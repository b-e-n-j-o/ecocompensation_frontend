/**
 * UnitesFoncieresTable.tsx — résultats UF v2 : une carte par terrain.
 *
 * Un terrain = parcelles contiguës d'une même personne morale qui passent le filtre
 * (après retrait des parcelles exclues). Onglets : Parcelles · Critères · Occupation du sol
 * · Propriétaire. Plus de combinaisons.
 */
import { useEffect, useMemo, useState } from "react";
import { ExportEtudeMenu } from "../ExportEtudeMenu";
import { ResultInfoNote } from "./ResultInfoNote";
import {
  CESBIO_LIBELLE_COLORS,
  type UfCritereDetail,
  type UfFilterResponse,
  type UniteFoncieresResult,
} from "../../../../types";
import {
  FilterEnrichBlock,
  PersonnesMoralesBlock,
  ScoreBlock,
  parsePersonnesMoralesPayload,
  type ParcelScorePayload,
} from "./RankingLine";
import { parcelleLabelFromIdu } from "./ufParcelles";

const UF_PAGE_SIZE = 50;
type UfTab = "parcelles" | "criteres" | "sol" | "proprietaire";

/** Libellés plus lisibles que ceux de l'entonnoir backend. */
const LABEL_OVERRIDES: Record<string, string> = {
  cesbio_libelles: "Occupation du sol (classes du filtre)",
  search_mode: "Hors emprise du projet",
  surface: "Surface minimale",
  biodiversite: "Faune / flore",
  miller: "Compacité (Miller)",
};

/** Clés de l'entonnoir (diagnostic) -> texte. */
const DIAG_LABELS: Record<string, string> = {
  isolee: "parcelle isolée (aucune voisine de la même société)",
  bloc_trop_petit: "bloc sous la surface minimale",
  isolee_apres_exclusions: "isolée après retrait des parcelles exclues",
  bloc_trop_petit_apres_exclusions: "bloc trop petit après retrait des parcelles exclues",
  search_mode: "emprise du projet",
  geomce: "mesure compensatoire existante (GEOMCE)",
  preemption_ens: "zone de préemption ENS",
  ens: "espace naturel sensible",
  natura_2000: "Natura 2000",
  znieff_1: "ZNIEFF de type 1",
  znieff_2: "ZNIEFF de type 2",
  ebc: "espace boisé classé",
  cesbio_libelles: "occupation du sol hors classes du filtre",
  zone_humide_mode: "zone humide",
  zones_humides_probables_mode: "zone humide probable",
  surface: "surface minimale",
  biodiversite: "faune / flore",
  miller: "compacité",
};

function critereLabel(uf: UniteFoncieresResult, key: string): string {
  return LABEL_OVERRIDES[key] ?? uf.criteres?.[key]?.label ?? DIAG_LABELS[key] ?? key;
}

function sortedFauna(fd: Record<string, number> | undefined): [string, number][] {
  return Object.entries(fd ?? {})
    .filter(([, d]) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a[1] - b[1]);
}

function topClasses(profile: UniteFoncieresResult["veg_profile"], n = 2): [string, number][] {
  return Object.entries(profile ?? {})
    .map(([k, v]) => [k, Number(v?.pct ?? 0)] as [string, number])
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px",
  borderRadius: 999, fontSize: 11, background: "#f1f5f9", color: "#334155",
  border: "1px solid #e2e8f0", whiteSpace: "nowrap",
};

/** Résumé d'un coup d'œil sous le titre : faune, occupation dominante, zone humide. */
function CritereChips({ uf }: { uf: UniteFoncieresResult }) {
  const fauna = sortedFauna(uf.fauna_distances);
  const classes = topClasses(uf.veg_profile);
  const zh = uf.zone_humide_ha ?? 0;
  if (!fauna.length && !classes.length && zh <= 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {fauna.map(([name, d]) => (
        <span key={name} style={chipStyle} title={`Observation la plus proche du terrain`}>
          🦎 {name} · {d} m
        </span>
      ))}
      {classes.map(([lib, pct]) => (
        <span key={lib} style={chipStyle}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: CESBIO_LIBELLE_COLORS[lib] ?? "#9ca3af" }} />
          {lib} {pct.toFixed(0)} %
        </span>
      ))}
      {zh > 0 && <span style={chipStyle}>💧 ZH {zh.toFixed(2)} ha</span>}
    </div>
  );
}

function CritereRow({ uf, k, d }: { uf: UniteFoncieresResult; k: string; d: UfCritereDetail }) {
  const idus = d.idus ?? [];
  let detail = "";
  if (d.type === "surface") detail = `${d.valeur_ha?.toFixed(2)} ha`;
  else if (d.type === "zh_surface") detail = `${d.valeur_ha?.toFixed(2)} ha de zone humide`;
  else if (d.type === "forme") detail = `${d.valeur?.toFixed(3)}${d.seuil != null ? ` (seuil ${d.seuil})` : ""}${d.bloquant ? "" : " · indicatif"}`;
  else if (d.type === "eliminatoire") detail = d.ok ? "aucune parcelle concernée" : `${idus.length} parcelle(s) en cause`;
  else if (d.type === "combinaison") detail = [d.faune_ok != null ? `faune ${d.faune_ok ? "✓" : "✗"}` : "", d.flore_ok != null ? `flore ${d.flore_ok ? "✓" : "✗"}` : ""].filter(Boolean).join(" · ");
  else detail = d.ok ? `porté par ${idus.length} parcelle(s)` : "aucune parcelle";
  const neutral = d.type === "forme" && !d.bloquant;
  return (
    <tr className="ranking-row">
      <td style={{ width: 24, color: neutral ? "#64748b" : d.ok ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
        {neutral ? "i" : d.ok ? "✓" : "✗"}
      </td>
      <td>{critereLabel(uf, k)}</td>
      <td className="mono" style={{ color: "#475569" }} title={idus.join(", ")}>{detail}</td>
    </tr>
  );
}

function CriteresTab({ uf }: { uf: UniteFoncieresResult }) {
  const entries = Object.entries(uf.criteres ?? {});
  if (!entries.length) return <p className="ranking-line-empty">Détail des critères non disponible.</p>;
  return (
    <>
      <p className="filter-enrich-fauna-hint" style={{ margin: "6px 0" }}>
        {uf.source === "manuel"
          ? "Unité dessinée à la main : chaque critère du filtre est vérifié sur ses parcelles."
          : "Les parcelles qui touchaient une exclusion ont été retirées avant de former ce terrain. Les autres critères sont satisfaits dès qu'une parcelle du terrain les remplit."}
      </p>
      <table className="ranking-table">
        <tbody>
          {entries.map(([k, d]) => <CritereRow key={k} uf={uf} k={k} d={d} />)}
        </tbody>
      </table>
    </>
  );
}

function ParcellesTab({ uf, hoverIdu, onHover }: {
  uf: UniteFoncieresResult; hoverIdu: string | null; onHover?: (idu: string | null) => void;
}) {
  const parcelles = uf.parcelles ?? [];
  return (
    <table className="ranking-table uf-parcelles-table">
      <thead>
        <tr>
          <th>Parcelle</th>
          <th className="col-surf">Surface</th>
          <th title="Critères du filtre que cette parcelle apporte au terrain">Apporte</th>
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
                {label}{insee ? <span className="unit"> · {insee}</span> : null}
              </td>
              <td className="col-surf mono">{p.surface_ha.toFixed(2)}<span className="unit"> ha</span></td>
              <td>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {p.criteres_portes.length
                    ? p.criteres_portes.map((k) => <span key={k} style={chipStyle}>{critereLabel(uf, k)}</span>)
                    : <span className="na">—</span>}
                </div>
              </td>
              <td className="mono">{p.in_pool ? "oui" : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SolTab({ uf, onShowOnMap }: { uf: UniteFoncieresResult; onShowOnMap?: () => void }) {
  const payload = { veg_libelles: uf.veg_libelles ?? [], veg_profile: uf.veg_profile, fauna_distances: uf.fauna_distances ?? {} };
  const hasSol = payload.veg_libelles.length > 0 || Object.keys(uf.veg_profile ?? {}).length > 0;
  const hasFaune = sortedFauna(uf.fauna_distances).length > 0;
  return (
    <>
      <section className="ranking-metric-block" style={{ marginBottom: 10 }}>
        <h4 className="ranking-metric-title">Occupation du sol du terrain</h4>
        <p className="ranking-line-empty" style={{ marginTop: 0 }}>
          Somme des {uf.nb_parcelles} parcelles.{" "}
          {onShowOnMap && (
            <button type="button" className="cz-btn cz-btn--ghost" onClick={onShowOnMap}>Voir sur la carte</button>
          )}
        </p>
        {hasSol ? <FilterEnrichBlock payload={payload} part="sol" /> : <p className="ranking-line-empty">Profil non calculé.</p>}
      </section>
      {hasFaune && (
        <section className="ranking-metric-block" style={{ marginBottom: 10 }}>
          <FilterEnrichBlock payload={payload} part="faune" />
        </section>
      )}
      {uf.score_eco && (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Score écologique</h4>
          <ScoreBlock payload={uf.score_eco as unknown as ParcelScorePayload} />
        </section>
      )}
    </>
  );
}

/** Entonnoir de construction des terrains (usage interne). */
function DiagnosticNote({ diag }: { diag?: Record<string, number> }) {
  if (!diag || !Object.keys(diag).length) return null;
  const COMPTEURS = new Set(["ppm_aoi", "ppm_siren_multi", "terrains_evalues", "terrains_retenus", "manuels", "secondes"]);
  const retraits = Object.entries(diag)
    .filter(([k, v]) => v > 0 && !COMPTEURS.has(k) && !k.startsWith("rejet:"))
    .map(([k, v]) => [k.replace(/^elimine:/, ""), v] as [string, number]);
  const rejets = Object.entries(diag)
    .filter(([k, v]) => k.startsWith("rejet:") && v > 0)
    .map(([k, v]) => [k.slice(6), v] as [string, number]);
  return (
    <details style={{ margin: "8px 12px 0", fontSize: 12, color: "#475569" }}>
      <summary style={{ cursor: "pointer" }}>Comment ces terrains ont été obtenus</summary>
      <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
        <li>{(diag.ppm_aoi ?? 0).toLocaleString("fr-FR")} parcelles de personnes morales dans la zone d&apos;étude,
          dont {(diag.ppm_siren_multi ?? 0).toLocaleString("fr-FR")} appartenant à une société qui en possède au moins deux.</li>
        {retraits.map(([k, v]) => (
          <li key={k}>{v.toLocaleString("fr-FR")} parcelle(s) écartée(s) : {DIAG_LABELS[k] ?? k}</li>
        ))}
        <li>{diag.terrains_evalues ?? 0} terrain(s) évalué(s), {diag.terrains_retenus ?? 0} retenu(s).</li>
        {rejets.map(([k, v]) => <li key={k}>{v} terrain(s) rejeté(s) : {DIAG_LABELS[k] ?? k}</li>)}
        {diag.secondes != null && <li>Calcul en {diag.secondes} s.</li>}
      </ul>
    </details>
  );
}

interface UnitesFoncieresTableProps {
  ufResults: UfFilterResponse;
  projectId: string | null;
  scrollTableNonce?: number;
  /** Clic sur l'emprise d'une UF dans la carte : ouvre et fait défiler jusqu'à cette UF. */
  scrollToUfId?: string | null;
  onUfActivate?: (ufId: string) => void;
  onUfHover?: (ufId: string | null) => void;
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
  onRemoveUf?: (ufId: string) => Promise<void> | void;
  exportJauge?: import("../ExportEtudeMenu").ExportJauge | null;
}

export function UnitesFoncieresTable({
  ufResults,
  projectId,
  scrollTableNonce = 0,
  scrollToUfId = null,
  onUfActivate,
  onUfHover,
  hoverParcelleIdu = null,
  onParcelleHover,
  onRemoveUf,
  exportJauge = null,
}: UnitesFoncieresTableProps) {
  const [expandedUfId, setExpandedUfId] = useState<string | null>(null);
  const [visibleUfCount, setVisibleUfCount] = useState(UF_PAGE_SIZE);
  const [ufTab, setUfTab] = useState<UfTab>("parcelles");
  const [removingUfId, setRemovingUfId] = useState<string | null>(null);

  const ufs = useMemo(() => ufResults.unites_foncieres ?? [], [ufResults]);

  useEffect(() => {
    setVisibleUfCount(UF_PAGE_SIZE);
    setExpandedUfId(null);
    setUfTab("parcelles");
  }, [ufResults]);

  useEffect(() => {
    if (!scrollToUfId) return;
    const idx = ufs.findIndex((uf) => uf.uf_id === scrollToUfId);
    if (idx < 0) return;
    setVisibleUfCount((c) => Math.max(c, idx + 1));
    setExpandedUfId(scrollToUfId);
    setUfTab("parcelles");
    const id = scrollToUfId;
    window.setTimeout(() => {
      document.getElementById(`uf-block-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  }, [scrollToUfId, scrollTableNonce, ufs]);

  const visibleUfs = ufs.slice(0, visibleUfCount);

  return (
    <div className="ranking-wrap">
      <div className="ranking-chrome">
        <div className="ranking-chrome__bar">
          {projectId && <ExportEtudeMenu projectId={projectId} page="uf" jauge={exportJauge} />}
          <span className="ranking-count mono">
            {Math.min(visibleUfCount, ufs.length)} / {ufResults.total_uf ?? ufs.length} UF
          </span>
        </div>
        <ResultInfoNote>
          <p>
            Une unité foncière est un terrain d&apos;un seul tenant appartenant à une même société
            (personne morale) : les parcelles qui se touchent et qui ne sont pas exclues par le filtre.
            C&apos;est ce qu&apos;on peut demander à ce propriétaire.
          </p>
          <p>
            Une parcelle qui touche une zone d&apos;exclusion (mesure compensatoire existante, ENS,
            Natura 2000…) ou qui n&apos;a pas l&apos;occupation du sol recherchée est retirée avant de
            former le terrain. Les critères de proximité (faune, flore, eau) sont remplis dès qu&apos;une
            parcelle du terrain les remplit : l&apos;onglet « Critères » indique lesquelles.
          </p>
        </ResultInfoNote>
        <DiagnosticNote diag={ufResults.diagnostic} />
      </div>

      <div className="ranking-table-scroll uf-foncieres-scroll" style={{ padding: 12 }}>
        {ufs.length === 0 ? (
          <div className="uf-empty-msg">Aucune unité foncière ne passe le filtre.</div>
        ) : (
          <>
            {visibleUfs.map((uf) => {
              const isExpanded = expandedUfId === uf.uf_id;
              const pm = uf.pm_prospect ? parsePersonnesMoralesPayload(uf.pm_prospect as Record<string, unknown>) : null;
              const isProspect = pm?.compensation_deja_realisee === true;
              const isManuel = uf.source === "manuel";
              const fails = uf.verdict === false;
              const score = uf.score_eco;
              const nbParc = uf.parcelles?.length ?? uf.nb_parcelles;

              return (
                <div
                  key={uf.uf_id}
                  id={`uf-block-${uf.uf_id}`}
                  style={{ marginBottom: 12 }}
                  onMouseEnter={() => onUfHover?.(uf.uf_id)}
                  onMouseLeave={() => { onUfHover?.(null); onParcelleHover?.(null); }}
                >
                  <div style={{
                    background: "white", border: `1px solid ${fails ? "#fecaca" : "#e2e8f0"}`, borderRadius: 8,
                    padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedUfId(isExpanded ? null : uf.uf_id);
                        setUfTab("parcelles");
                        onUfActivate?.(uf.uf_id);
                      }}
                      style={{
                        flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0,
                        cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div className="uf-foncier-title">
                          UF #{uf.rang} · {uf.denomination || uf.uf_id}
                          {isManuel && <span className="uf-prospect-badge" style={{ background: "#e0e7ff", color: "#3730a3" }}>Ajout manuel</span>}
                          {fails && (
                            <span className="uf-prospect-badge" style={{ background: "#fee2e2", color: "#b91c1c" }}
                              title="Ce terrain ne passe pas le filtre">
                              Ne passe pas : {uf.motif_rejet ? critereLabel(uf, uf.motif_rejet) : "?"}
                            </span>
                          )}
                          {isProspect && (
                            <span className="uf-prospect-badge" title="Personne morale ayant déjà compensé (autre foncier)">
                              Prospect compensation
                            </span>
                          )}
                        </div>
                        <div className="uf-foncier-meta">
                          {nbParc} parcelles
                          {uf.surface_ha != null ? ` · ${uf.surface_ha.toFixed(1)} ha` : ""}
                          {score ? ` · score éco ${score.total_score}/${score.max_score}` : ""}
                          {` · ${uf.distance_centre_km.toFixed(1)} km du projet`}
                        </div>
                        <CritereChips uf={uf} />
                        {uf.siren && !isManuel && (
                          <div className="uf-foncier-pm"><span className="mono">SIREN {uf.siren}</span></div>
                        )}
                      </div>
                      <span className="uf-foncier-toggle">{isExpanded ? "−" : "+"}</span>
                    </button>
                    {onRemoveUf && (
                      <button
                        type="button"
                        className="cz-btn cz-btn--ghost"
                        disabled={removingUfId === uf.uf_id}
                        title="Retirer cette unité foncière du classement"
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          if (!window.confirm(`Retirer UF #${uf.rang} · ${uf.denomination || uf.uf_id} du classement ?`)) return;
                          setRemovingUfId(uf.uf_id);
                          try {
                            await onRemoveUf(uf.uf_id);
                            if (expandedUfId === uf.uf_id) setExpandedUfId(null);
                          } finally {
                            setRemovingUfId(null);
                          }
                        }}
                      >
                        {removingUfId === uf.uf_id ? "…" : "Retirer"}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div style={{ paddingTop: 8 }}>
                      <div className="ranking-line-tabs" role="tablist" aria-label="Détail de l'unité foncière">
                        {([
                          ["parcelles", `Parcelles (${nbParc})`],
                          ["criteres", "Critères"],
                          ["sol", "Occupation du sol"],
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
                      {ufTab === "parcelles" && <ParcellesTab uf={uf} hoverIdu={hoverParcelleIdu} onHover={onParcelleHover} />}
                      {ufTab === "criteres" && <CriteresTab uf={uf} />}
                      {ufTab === "sol" && <SolTab uf={uf} onShowOnMap={() => onUfActivate?.(uf.uf_id)} />}
                      {ufTab === "proprietaire" && (pm
                        ? <div style={{ marginTop: 6 }}><PersonnesMoralesBlock payload={pm} /></div>
                        : <p className="ranking-line-empty">Informations propriétaire non disponibles.</p>)}
                    </div>
                  )}
                </div>
              );
            })}
            {ufs.length > visibleUfCount && (
              <div className="ranking-load-more" style={{ marginTop: 4, padding: "0 0 4px" }}>
                <button type="button" className="btn-load-more"
                  onClick={() => setVisibleUfCount((c) => Math.min(c + UF_PAGE_SIZE, ufs.length))}>
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
