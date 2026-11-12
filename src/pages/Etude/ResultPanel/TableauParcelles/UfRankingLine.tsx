/**
 * Ligne de classement d'une unité foncière.
 * La sélection et le retrait d'une parcelle servent à composer une UF à la main.
 * Ce n'est pas le statut « indésirable » du pool de parcelles.
 */
import { Fragment, useEffect, useState } from "react";
import {
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
import { DureteFoncierePanel } from "./RankingLineDurete";
import { parcelleLabelFromIdu } from "./ufParcelles";
import { dureteBadgeStyle, type DureteFonciereMetric } from "../../../../utils/poolMetrics";
import { ecoBadgeStyle } from "../ilotsRpg/labels";

type UfTab =
  | "score" | "especes" | "flore" | "sol" | "zh" | "hydros" | "environnement"
  | "durete" | "urbanisme" | "parcelles" | "criteres" | "proprietaire";

const UF_TABS: [UfTab, string][] = [
  ["score", "Scoring & Filtrage"],
  ["especes", "Espèces animales"],
  ["flore", "Flore"],
  ["sol", "Occupation du sol"],
  ["zh", "Zones humides"],
  ["hydros", "Hydros"],
  ["environnement", "Environnement"],
  ["durete", "Dureté foncière"],
  ["urbanisme", "Urbanisme"],
  ["parcelles", "Parcelles"],
  ["criteres", "Critères"],
  ["proprietaire", "Propriétaire"],
];

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

const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px",
  borderRadius: 999, fontSize: 11, background: "#f1f5f9", color: "#334155",
  border: "1px solid #e2e8f0", whiteSpace: "nowrap",
};

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
    <div>
      <p className="filter-enrich-fauna-hint" style={{ margin: "0 0 6px" }}>
        {uf.source === "manuel"
          ? "Unité assemblée à la main : les métriques sont recalculées sur les parcelles retenues."
          : "Les parcelles qui touchaient une exclusion ont été retirées avant de former ce terrain. Les autres critères sont satisfaits dès qu'une parcelle du terrain les remplit."}
      </p>
      <table className="ranking-table">
        <tbody>
          {entries.map(([k, d]) => <CritereRow key={k} uf={uf} k={k} d={d} />)}
        </tbody>
      </table>
    </div>
  );
}

function scoreForDisplay(uf: UniteFoncieresResult): UniteFoncieresResult["score_eco"] {
  const score = uf.score_eco;
  if (!score?.breakdown) return score;
  const especes = score.breakdown.especes as { nearest_species?: string } | undefined;
  if (especes?.nearest_species) return score;
  const closest = sortedFauna(uf.fauna_distances)[0];
  if (!closest) return score;
  return {
    ...score,
    breakdown: {
      ...score.breakdown,
      especes: { ...especes, nearest_species: closest[0] },
    },
  };
}

function SolTab({ uf, onShowOnMap }: { uf: UniteFoncieresResult; onShowOnMap?: () => void }) {
  const payload = { veg_libelles: uf.veg_libelles ?? [], veg_profile: uf.veg_profile };
  const hasSol = payload.veg_libelles.length > 0 || Object.keys(uf.veg_profile ?? {}).length > 0;
  return (
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
  onRunDurete?: (ufId: string) => void | Promise<void>;
  dureteLoading?: boolean;
  onRunUrbanisme?: (idus: string[]) => void | Promise<void>;
  urbanismeLoading?: boolean;
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
  onRunDurete,
  dureteLoading = false,
  onRunUrbanisme,
  urbanismeLoading = false,
}: UfRankingLineProps) {
  const [tab, setTab] = useState<UfTab>("score");
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
  const closestFauna = sortedFauna(uf.fauna_distances)[0];
  const eco = ecoBadgeStyle(score?.total_score, score?.max_score);
  const durete = uf.durete_fonciere?.score_final;
  const dureteStyle = dureteBadgeStyle(durete);

  useEffect(() => {
    if (expanded) setTab("score");
  }, [expanded, uf.uf_id]);

  return (
    <Fragment>
      <tr
        id={`uf-block-${uf.uf_id}`}
        className={`ranking-row${expanded ? " ranking-row--expanded" : ""}${fails ? " ranking-row--fail" : ""}`}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => onHoverUf?.(uf.uf_id)}
        onMouseLeave={() => { onHoverUf?.(null); onHoverParcelle?.(null); }}
        onClick={() => { onToggle(); onActivate?.(uf.uf_id); }}
      >
        <td>
          <div className="uf-foncier-title">
            {uf.denomination || uf.uf_id}
            {isManuel && <span className="uf-prospect-badge uf-handmade-badge">Assemblée à la main</span>}
            {fails && (
              <span className="uf-prospect-badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>
                Ne passe pas
              </span>
            )}
            {isProspect && <span className="uf-prospect-badge">Prospect</span>}
          </div>
          {assembleMode && (ecartees.length > 0 || pickedHere > 0) && (
            <div className="uf-foncier-meta">
              {ecartees.length > 0 ? `${ecartees.length} écartée(s)` : ""}
              {ecartees.length > 0 && pickedHere > 0 ? " · " : ""}
              {pickedHere > 0 ? `${pickedHere} sélectionnée(s)` : ""}
            </div>
          )}
        </td>
        <td className="mono">{nbParc}</td>
        <td className="mono">{uf.surface_ha != null ? <>{uf.surface_ha.toFixed(1)}<span className="unit"> ha</span></> : "—"}</td>
        <td>
          <span className="mono" style={{ fontWeight: 700, color: eco.fg }}>
            {score ? `${score.total_score}/${score.max_score}` : "—"}
          </span>
        </td>
        <td>{closestFauna ? closestFauna[0] : <span className="na">—</span>}</td>
        <td className="mono">
          {closestFauna ? <>{closestFauna[1].toLocaleString("fr-FR")}<span className="unit"> m</span></> : <span className="na">—</span>}
        </td>
        <td className="mono">{uf.distance_centre_km.toFixed(1)}<span className="unit"> km</span></td>
        <td className="mono" style={{ color: durete != null ? dureteStyle.fg : undefined, fontWeight: 700 }}>
          {durete != null ? Math.round(durete) : <span className="na">—</span>}
        </td>
        <td className="col-detail mono" style={{ color: "#64748b" }}>{expanded ? "▾" : "▸"}</td>
        {onRemoveUf && (
          <td className="col-indesirable" onClick={(ev) => ev.stopPropagation()}>
            <button
              type="button"
              className="ranking-btn-indesirable"
              disabled={removing || busy}
              title="Retirer cette unité du classement"
              aria-label={`Retirer UF ${uf.rang} du classement`}
              onClick={async () => {
                if (!window.confirm(`Retirer UF #${uf.rang} · ${uf.denomination || uf.uf_id} du classement ?`)) return;
                setRemoving(true);
                try { await onRemoveUf(uf.uf_id); } finally { setRemoving(false); }
              }}
            >
              {removing ? "…" : "🗑"}
            </button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="ranking-row-detail">
          <td colSpan={onRemoveUf ? 10 : 9}>
        <div>
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
            {UF_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`ranking-line-tab${tab === id ? " is-active" : ""}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {id === "parcelles" ? `Parcelles (${nbParc})` : label}
              </button>
            ))}
          </div>

          {tab === "score" && (
            <div className="ranking-score-split">
              <section className="ranking-score-pane">
                <h4 className="ranking-score-pane__title">Scores</h4>
              <div style={{ display: "grid", gap: 8 }}>
                {uf.score_eco ? (
                  <ScoreBlock payload={scoreForDisplay(uf) as unknown as ParcelScorePayload} />
                ) : (
                  <p className="ranking-line-empty">Score écologique non calculé pour cette unité.</p>
                )}
                {uf.durete_fonciere?.score_final != null ? (
                  <p className="ranking-line-empty">
                    Dureté foncière : {Math.round(uf.durete_fonciere.score_final)}
                    {uf.durete_fonciere.niveau_durete ? ` · ${uf.durete_fonciere.niveau_durete}` : ""}
                    {" "}
                    <button type="button" className="ranking-line-run" onClick={() => setTab("durete")}>Voir le détail</button>
                  </p>
                ) : (
                  <div className="ranking-line-empty-action">
                    <p className="ranking-line-empty">Score de dureté foncière non calculé pour cette unité.</p>
                    {onRunDurete && uf.siren && !isManuel && (
                      <button type="button" className="ranking-btn-durete" disabled={dureteLoading} onClick={() => void onRunDurete(uf.uf_id)}>
                        {dureteLoading ? "Calcul…" : "Calculer la dureté"}
                      </button>
                    )}
                  </div>
                )}
                <div className="ranking-line-empty-action">
                  <p className="ranking-line-empty">Score urbanistique non calculé pour cette unité.</p>
                  {onRunUrbanisme && (
                    <button
                      type="button"
                      className="ranking-line-run"
                      disabled={urbanismeLoading || parcelles.length === 0}
                      onClick={() => void onRunUrbanisme(parcelles.map((p) => p.idu))}
                    >
                      {urbanismeLoading ? "Calcul…" : "Calculer le score urba"}
                    </button>
                  )}
                </div>
                <p className="ranking-line-empty">Score composite non calculé pour cette unité.</p>
              </div>
              </section>
              <section className="ranking-score-pane">
                <h4 className="ranking-score-pane__title">Résumé de filtrage</h4>
                <CriteresTab uf={uf} />
              </section>
            </div>
          )}
          {tab === "especes" && (
            sortedFauna(uf.fauna_distances).length
              ? <FilterEnrichBlock payload={{ fauna_distances: uf.fauna_distances }} part="faune" />
              : <p className="ranking-line-empty">Aucune espèce animale enregistrée pour cette unité.</p>
          )}
          {tab === "flore" && <p className="ranking-line-empty">Aucune observation flore enregistrée pour cette unité.</p>}
          {tab === "sol" && <SolTab uf={uf} onShowOnMap={() => onActivate?.(uf.uf_id)} />}
          {tab === "zh" && (
            uf.zone_humide_ha != null
              ? <FilterEnrichBlock payload={{ zone_humide_ha: uf.zone_humide_ha, zone_humide_intersects: uf.zone_humide_ha > 0 }} part="zh" parcelSurfaceHa={uf.surface_ha} />
              : <p className="ranking-line-empty">Aucune zone humide établie enregistrée pour cette unité.</p>
          )}
          {tab === "hydros" && <p className="ranking-line-empty">Aucun cours d&apos;eau ni surface d&apos;eau retenu pour cette unité.</p>}
          {tab === "environnement" && <p className="ranking-line-empty">Aucun indicateur environnemental (EBC, ZNIEFF) calculé pour cette unité. Les exclusions du filtre sont dans Scoring.</p>}
          {tab === "urbanisme" && (
            <div className="ranking-line-empty-action">
              <p className="ranking-line-empty">Score urbanistique non calculé pour cette unité.</p>
              {onRunUrbanisme && (
                <button
                  type="button"
                  className="ranking-line-run"
                  disabled={urbanismeLoading || parcelles.length === 0}
                  onClick={() => void onRunUrbanisme(parcelles.map((p) => p.idu))}
                >
                  {urbanismeLoading ? "Calcul…" : "Calculer le score urba"}
                </button>
              )}
            </div>
          )}
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
          {tab === "durete" && (
            <div style={{ marginTop: 6 }}>
              {!uf.siren || isManuel ? (
                <p className="ranking-line-empty">Dureté calculable pour une unité d&apos;une personne morale identifiée.</p>
              ) : uf.durete_fonciere?.score_final != null ? (
                <DureteFoncierePanel payload={uf.durete_fonciere as DureteFonciereMetric} />
              ) : (
                <>
                  <p className="ranking-line-empty">Dureté non calculée pour cette unité.</p>
                  {onRunDurete && (
                    <button
                      type="button"
                      className="ranking-btn-durete"
                      disabled={dureteLoading}
                      onClick={() => void onRunDurete(uf.uf_id)}
                    >
                      {dureteLoading ? (
                        <>
                          <span className="parcelles-map-spinner" aria-hidden="true" />
                          {" "}Calcul de la dureté foncière en arrière plan...
                        </>
                      ) : (
                        "Calculer la dureté"
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
