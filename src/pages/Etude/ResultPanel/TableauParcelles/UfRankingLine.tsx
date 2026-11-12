/**
 * Ligne de classement d'une unité foncière.
 * La sélection et le retrait d'une parcelle servent à composer une UF à la main.
 * Ce n'est pas le statut « indésirable » du pool de parcelles.
 */
import { useEffect, useState } from "react";
import {
  CESBIO_LIBELLE_COLORS,
  type UfCritereDetail,
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

type UfTab = "parcelles" | "criteres" | "sol" | "proprietaire";

const LABEL_OVERRIDES: Record<string, string> = {
  cesbio_libelles: "Occupation du sol (classes du filtre)",
  search_mode: "Hors emprise du projet",
  surface: "Surface minimale",
  biodiversite: "Faune / flore",
  miller: "Compacité (Miller)",
};

function critereLabel(uf: UniteFoncieresResult, key: string): string {
  return LABEL_OVERRIDES[key] ?? uf.criteres?.[key]?.label ?? key;
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

function CritereChips({ uf }: { uf: UniteFoncieresResult }) {
  const fauna = sortedFauna(uf.fauna_distances);
  const classes = topClasses(uf.veg_profile);
  const zh = uf.zone_humide_ha ?? 0;
  if (!fauna.length && !classes.length && zh <= 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {fauna.map(([name, d]) => (
        <span key={name} style={chipStyle} title="Observation la plus proche du terrain">
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
          ? "Unité assemblée à la main : les métriques sont recalculées sur les parcelles retenues."
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

export interface UfRankingLineProps {
  uf: UniteFoncieresResult;
  expanded: boolean;
  hoverIdu: string | null;
  pickedIdus: string[];
  ecartees: string[];
  assembleMode: boolean;
  busy: boolean;
  onEnterAssemble?: (ufId: string) => void;
  onExitAssemble?: () => void;
  onAssemble?: () => void;
  onClearPick?: () => void;
  onToggle: () => void;
  onHoverUf?: (ufId: string | null) => void;
  onHoverParcelle?: (idu: string | null) => void;
  onActivate?: (ufId: string) => void;
  onTogglePick: (idu: string) => void;
  onEcarter: (idu: string) => void;
  onReinclure: (idu: string) => void;
  onAddPick: () => void;
  onRemoveUf?: (ufId: string) => Promise<void> | void;
}

export function UfRankingLine({
  uf,
  expanded,
  hoverIdu,
  pickedIdus,
  ecartees,
  assembleMode,
  busy,
  onEnterAssemble,
  onExitAssemble,
  onAssemble,
  onClearPick,
  onToggle,
  onHoverUf,
  onHoverParcelle,
  onActivate,
  onTogglePick,
  onEcarter,
  onReinclure,
  onAddPick,
  onRemoveUf,
}: UfRankingLineProps) {
  const [tab, setTab] = useState<UfTab>("parcelles");
  const [removing, setRemoving] = useState(false);
  const isManuel = uf.source === "manuel";
  const parcelles = uf.parcelles ?? [];
  const ecartee = new Set(ecartees);
  const picked = new Set(pickedIdus);
  const pickedHere = parcelles.filter((p) => picked.has(p.idu)).length;
  const outside = pickedIdus.filter((idu) => !parcelles.some((p) => p.idu === idu));
  const pm = uf.pm_prospect ? parsePersonnesMoralesPayload(uf.pm_prospect as Record<string, unknown>) : null;
  const isProspect = pm?.compensation_deja_realisee === true;
  const fails = uf.verdict === false;
  const score = uf.score_eco;
  const nbParc = parcelles.length || uf.nb_parcelles;

  useEffect(() => {
    if (expanded) setTab("parcelles");
  }, [expanded, uf.uf_id]);

  return (
    <div
      id={`uf-block-${uf.uf_id}`}
      style={{ marginBottom: 12 }}
      onMouseEnter={() => onHoverUf?.(uf.uf_id)}
      onMouseLeave={() => { onHoverUf?.(null); onHoverParcelle?.(null); }}
    >
      <div style={{
        background: "white", border: `1px solid ${fails ? "#fecaca" : "#e2e8f0"}`, borderRadius: 8,
        padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
      }}>
        <button
          type="button"
          onClick={() => { onToggle(); onActivate?.(uf.uf_id); }}
          style={{
            flex: 1, textAlign: "left", background: "transparent", border: "none", padding: 0,
            cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="uf-foncier-title">
              UF #{uf.rang} · {uf.denomination || uf.uf_id}
              {isManuel && <span className="uf-prospect-badge uf-handmade-badge">Assemblée à la main</span>}
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
              {assembleMode && ecartees.length > 0 ? ` · ${ecartees.length} écartée(s) de votre composition` : ""}
              {assembleMode && pickedHere > 0 ? ` · ${pickedHere} dans la sélection` : ""}
              {uf.surface_ha != null ? ` · ${uf.surface_ha.toFixed(1)} ha` : ""}
              {score ? ` · score éco ${score.total_score}/${score.max_score}` : ""}
              {` · ${uf.distance_centre_km.toFixed(1)} km du projet`}
            </div>
            <CritereChips uf={uf} />
            {uf.siren && !isManuel && (
              <div className="uf-foncier-pm"><span className="mono">SIREN {uf.siren}</span></div>
            )}
          </div>
          <span className="uf-foncier-toggle">{expanded ? "−" : "+"}</span>
        </button>
        {onRemoveUf && (
          <button
            type="button"
            className="cz-btn cz-btn--ghost"
            disabled={removing || busy}
            title="Retirer cette unité foncière du classement"
            onClick={async (ev) => {
              ev.stopPropagation();
              if (!window.confirm(`Retirer UF #${uf.rang} · ${uf.denomination || uf.uf_id} du classement ?`)) return;
              setRemoving(true);
              try { await onRemoveUf(uf.uf_id); } finally { setRemoving(false); }
            }}
          >
            {removing ? "…" : "Retirer"}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ paddingTop: 8 }}>
          <div className="uf-compose-tools">
            {assembleMode ? (
              <button
                type="button"
                className="uf-assemble-start-btn is-on"
                disabled={busy}
                onClick={onExitAssemble}
              >
                Quitter le mode édition
              </button>
            ) : (
              <button
                type="button"
                className="uf-assemble-start-btn"
                disabled={busy}
                onClick={() => { setTab("parcelles"); onEnterAssemble?.(uf.uf_id); }}
              >
                Découper une unité foncière en choisissant des parcelles
              </button>
            )}
            {assembleMode && (
              <div className="uf-assemble-bar uf-assemble-bar--in-card">
                <strong>
                  {pickedIdus.length > 0
                    ? `${pickedIdus.length} parcelle${pickedIdus.length > 1 ? "s" : ""} sélectionnée${pickedIdus.length > 1 ? "s" : ""}`
                    : "Aucune parcelle sélectionnée"}
                </strong>
                <button type="button" className={`uf-assemble-confirm-btn${busy ? " is-busy" : ""}`} disabled={busy || pickedIdus.length < 2} onClick={onAssemble}>
                  {busy && <span className="uf-assemble-confirm-spinner" aria-hidden />}
                  {busy ? "Croisement avec les couches" : "Assembler en une nouvelle unité foncière"}
                </button>
                <button type="button" className="cz-btn cz-btn--ghost" disabled={busy} onClick={onClearPick}>
                  Vider
                </button>
              </div>
            )}
          </div>
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
                className={`ranking-line-tab${tab === id ? " is-active" : ""}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "parcelles" && (
            <>
              {assembleMode && (
                <>
                  {isManuel && (
                    <div className="uf-compose-tools">
                      <button
                        type="button"
                        className="cz-btn"
                        disabled={busy || outside.length === 0}
                        title="Ajoute les parcelles cochées ailleurs et recalcule cette unité"
                        onClick={onAddPick}
                      >
                        Ajouter la sélection à cette unité{outside.length ? ` (${outside.length})` : ""}
                      </button>
                    </div>
                  )}
                  <p className="uf-compose-hint">
                    {isManuel
                      ? "La croix retire la parcelle de cette unité et recalcule ses métriques. Elle n'est pas marquée indésirable. Pour la passer dans une autre unité, cochez-la et ajoutez-la à l'unité cible avant de la retirer d'ici."
                      : "Cliquez les polygones ou les lignes, puis assemblez. La croix écarte une parcelle de votre composition, sans la rendre indésirable."}
                  </p>
                </>
              )}
              <table className="ranking-table uf-parcelles-table">
                <thead>
                  <tr>
                    {assembleMode && <th className="col-select" aria-label="Sélection">Sel.</th>}
                    <th>Parcelle</th>
                    <th className="col-surf">Surface</th>
                    <th title="Critères du filtre que cette parcelle apporte au terrain">Apporte</th>
                    <th title="Parcelle également retenue dans l'onglet Parcelles">Pool</th>
                    {assembleMode && <th aria-label="Composition" />}
                  </tr>
                </thead>
                <tbody>
                  {parcelles.map((p) => {
                    const { label, insee } = parcelleLabelFromIdu(p.idu);
                    const aside = ecartee.has(p.idu);
                    const checked = picked.has(p.idu) && !aside;
                    return (
                      <tr
                        key={p.idu}
                        className={`ranking-row${hoverIdu === p.idu ? " hovered" : ""}${checked ? " ranking-row--checked" : ""}${aside ? " uf-parcelle-ecarmee" : ""}${assembleMode && !aside && !busy ? " uf-parcelle-pickable" : ""}`}
                        onMouseEnter={() => onHoverParcelle?.(p.idu)}
                        onMouseLeave={() => onHoverParcelle?.(null)}
                        onClick={() => {
                          if (!assembleMode || aside || busy) return;
                          onTogglePick(p.idu);
                        }}
                      >
                        {assembleMode && (
                          <td className="col-select">
                            <input
                              type="checkbox"
                              className="ranking-row-checkbox"
                              checked={checked}
                              disabled={busy || aside}
                              aria-label={`Sélectionner ${label}`}
                              onClick={(ev) => ev.stopPropagation()}
                              onChange={() => onTogglePick(p.idu)}
                            />
                          </td>
                        )}
                        <td className="mono" title={p.idu}>
                          {label}{insee ? <span className="unit"> · {insee}</span> : null}
                          {assembleMode && aside && <span className="uf-aside-chip">Hors composition</span>}
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
                        {assembleMode && (
                          <td className="uf-parcelle-actions" onClick={(ev) => ev.stopPropagation()}>
                            {aside ? (
                              <button type="button" className="cz-btn cz-btn--ghost" disabled={busy} onClick={() => onReinclure(p.idu)}>
                                Réinclure
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="uf-x-btn"
                                disabled={busy}
                                title={isManuel ? "Retirer de cette unité assemblée" : "Ne pas inclure dans ma composition"}
                                aria-label={`Écarter ${label}`}
                                onClick={() => onEcarter(p.idu)}
                              >
                                ×
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          {tab === "criteres" && <CriteresTab uf={uf} />}
          {tab === "sol" && <SolTab uf={uf} onShowOnMap={() => onActivate?.(uf.uf_id)} />}
          {tab === "proprietaire" && (pm
            ? <div style={{ marginTop: 6 }}><PersonnesMoralesBlock payload={pm} /></div>
            : <p className="ranking-line-empty">Informations propriétaire non disponibles.</p>)}
        </div>
      )}
    </div>
  );
}
