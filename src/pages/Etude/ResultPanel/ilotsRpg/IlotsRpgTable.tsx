/**
 * IlotsRpgTable.tsx
 * ─────────────────
 * Tableau plat des îlots agricoles RPG (une ligne = une UF = un îlot, pas de sous-ensembles).
 * Même structure que RankingTable (classes ranking-*), détail déplié avec onglets.
 * Liaison carte : onIlotActivate / onIlotHover / selectedIlotId / hoverIlotId / scrollToIlotId.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  FilterEnrichBlock,
  PersonnesMoralesBlock,
  ScoreBlock,
  parsePersonnesMoralesPayload,
  type ParcelScorePayload,
} from "../RankingLine";
import { catColor, catLabel, cultureLabel, ecoBadgeStyle, formatPct, ownerColor, parcelleLabel } from "./labels";
import { ExportEtudeMenu } from "../ExportEtudeMenu";
import { ResultInfoNote } from "../ResultInfoNote";
import {
  parcellesByIlot,
  type IlotRpgParcelle,
  type IlotRpgResult,
  type IlotsRpgGeojson,
  type IlotsRpgResponse,
  type IlotsRpgSortKey,
} from "./types";

const PAGE_SIZE = 50;
const COL_COUNT = 10;

type DetailTab = "composition" | "especes" | "sol" | "score" | "proprietaire";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "composition", label: "Composition" },
  { id: "especes", label: "Espèces animales" },
  { id: "sol", label: "Végétation" },
  { id: "score", label: "Scoring" },
  { id: "proprietaire", label: "Propriétaire" },
];

export interface IlotsRpgTableProps {
  results: IlotsRpgResponse;
  selectedIlotId?: string | null;
  hoverIlotId?: string | null;
  scrollToIlotId?: string | null;
  scrollTableNonce?: number;
  /** Afficher la surface zone humide (études ZH). */
  showZoneHumide?: boolean;
  onIlotActivate?: (numIlot: string) => void;
  onIlotHover?: (numIlot: string | null) => void;
  /** Clic sur un IDU dans le détail (ex. ouvrir la parcelle). */
  onParcelleClick?: (idu: string) => void;
  geojson?: IlotsRpgGeojson | null;
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
  projectId?: string | null;
}

function sortValue(il: IlotRpgResult, key: IlotsRpgSortKey): number {
  switch (key) {
    case "score": return il.score_eco?.total_score ?? -1;
    case "surface": return il.surface_ha;
    case "nb_parcelles": return il.nb_parcelles;
    case "distance": return il.distance_centre_km;
    default: return il.rang;
  }
}

function defaultDir(key: IlotsRpgSortKey): "asc" | "desc" {
  return key === "rang" || key === "distance" ? "asc" : "desc";
}

function Pill({ bg, fg, children, title }: { bg: string; fg: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      className="mono"
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 36, padding: "2px 8px", borderRadius: 999,
        background: bg, color: fg, fontWeight: 600, fontSize: 11, whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function CultureCell({ il }: { il: IlotRpgResult }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={catLabel(il.cat_dominante)}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: catColor(il.cat_dominante), flexShrink: 0 }} />
      <span>{cultureLabel(il.code_cultu_dominant)}</span>
    </span>
  );
}

function ProprietaireCell({ il }: { il: IlotRpgResult }) {
  if (il.pm_unique) {
    return (
      <Pill bg="rgba(29, 78, 216, 0.12)" fg="#1d4ed8" title={`Une seule personne morale détient l'îlot (SIREN ${il.pm_dominant ?? "?"})`}>
        PM unique
      </Pill>
    );
  }
  if (il.nb_pm > 0) {
    return (
      <Pill bg="#f3f4f6" fg="#374151" title="Personnes morales parmi les propriétaires (le reste : personnes physiques ou non identifié)">
        {il.nb_pm} PM
      </Pill>
    );
  }
  return <Pill bg="#f3f4f6" fg="#6b7280" title="Aucune personne morale identifiée">—</Pill>;
}

function ProspectCell({ il }: { il: IlotRpgResult }) {
  const pm = il.pm_prospect ? parsePersonnesMoralesPayload(il.pm_prospect) : null;
  if (!pm || !pm.intersects_pm_database) return <Pill bg="#e5e7eb" fg="#374151">—</Pill>;
  return pm.compensation_deja_realisee
    ? <Pill bg="rgba(180, 83, 9, 0.14)" fg="#b45309" title="La PM dominante a déjà compensé sur un autre foncier">Oui</Pill>
    : <Pill bg="#f3f4f6" fg="#6b7280">Non</Pill>;
}

function PartBar({ label, ratio, color }: { label: string; ratio: number; color: string }) {
  if (!ratio) return null;
  return (
    <li className="filter-enrich-fauna-row">
      <div className="filter-enrich-fauna-row-head">
        <span className="filter-enrich-fauna-species">{label}</span>
        <span className="filter-enrich-pill filter-enrich-pill--muted mono">{formatPct(ratio)}</span>
      </div>
      <div className="occ-sol-track" aria-hidden>
        <span className="occ-sol-fill" style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%`, background: color }} />
      </div>
    </li>
  );
}

function ParcellesTable({
  parcelles,
  hoverIdu,
  onHover,
  onClick,
}: {
  parcelles: IlotRpgParcelle[];
  hoverIdu: string | null;
  onHover?: (idu: string | null) => void;
  onClick?: (idu: string) => void;
}) {
  return (
    <table className="ranking-table ilots-rpg-parcelles" style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th>Parcelle</th>
          <th>Surface</th>
          <th title="Part de la parcelle comprise dans l'îlot (membre si ≥ 50 %)">Part dans l'îlot</th>
          <th>Propriétaire</th>
          <th title="Parcelle également retenue dans l'onglet Parcelles">Pool</th>
        </tr>
      </thead>
      <tbody>
        {parcelles.map((p) => (
          <tr
            key={p.idu}
            className={`ranking-row${hoverIdu === p.idu ? " hovered" : ""}`}
            style={{ cursor: onClick ? "pointer" : undefined }}
            onMouseEnter={() => onHover?.(p.idu)}
            onMouseLeave={() => onHover?.(null)}
            onClick={(e) => {
              e.stopPropagation();
              onClick?.(p.idu);
            }}
          >
            <td className="mono" title={p.idu}>
              {parcelleLabel(p)}
              {p.code_insee ? <span className="unit"> · {p.code_insee}</span> : null}
            </td>
            <td className="mono">{p.surface_ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}<span className="unit"> ha</span></td>
            <td className="mono">{formatPct(p.part_parcelle)}</td>
            <td>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ownerColor(p.owner_index), flexShrink: 0 }} />
                {p.proprietaire ? (
                  <span className="mono" title={p.nb_proprietaires_pm > 1 ? `${p.nb_proprietaires_pm} personnes morales sur cette parcelle` : undefined}>
                    PM {p.proprietaire}{p.nb_proprietaires_pm > 1 ? ` +${p.nb_proprietaires_pm - 1}` : ""}
                  </span>
                ) : (
                  <span style={{ color: "#6b7280" }}>Pers. physique / non identifié</span>
                )}
              </span>
            </td>
            <td className="mono">{p.in_pool ? "oui" : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IlotDetail({
  il,
  showZoneHumide,
  parcelles,
  hoverParcelleIdu,
  onParcelleHover,
  onParcelleClick,
}: {
  il: IlotRpgResult;
  showZoneHumide: boolean;
  parcelles?: IlotRpgParcelle[];
  hoverParcelleIdu: string | null;
  onParcelleHover?: (idu: string | null) => void;
  onParcelleClick?: (idu: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("composition");
  const enrich = {
    veg_libelles: il.veg_libelles ?? [],
    veg_profile: il.veg_profile,
    fauna_distances: il.fauna_distances ?? {},
  };
  const pmPayload = il.pm_prospect ? parsePersonnesMoralesPayload(il.pm_prospect) : null;
  const scorePayload = il.score_eco as unknown as ParcelScorePayload | undefined;

  return (
    <div className="ranking-line-detail" role="region" aria-label={`Détail îlot ${il.num_ilot}`}>
      <p className="ranking-line-idu">
        <span className="ranking-line-idu__label">Îlot RPG</span>
        <span className="mono">{il.num_ilot}</span>
      </p>
      <section className="ranking-metric-block">
        <h4 className="ranking-metric-title">Occupation du sol de l&apos;îlot</h4>
        <p className="ranking-line-empty" style={{ marginTop: 0 }}>
          Mesurée sur l&apos;union des {il.nb_parcelles} parcelles de l&apos;îlot, pas en moyenne des parcelles.
        </p>
        {(il.veg_libelles?.length || Object.keys(il.veg_profile ?? {}).length || Object.keys(il.fauna_distances ?? {}).length) ? (
          <FilterEnrichBlock payload={enrich} part="sol" />
        ) : (
          <p className="ranking-line-empty">
            Profil CESBIO non encore calculé pour cet îlot. Il apparaît après un nouveau filtrage.
          </p>
        )}
      </section>
      <div className="ranking-line-tabs" role="tablist" aria-label="Détail de l'îlot">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`ranking-line-tab${tab === t.id ? " is-active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "composition" && (
        <div className="filter-enrich-block">
          <div className="filter-enrich-section">
            <div className="filter-enrich-section-head">
              <span className="filter-enrich-section-title">Culture dominante</span>
              <span className="filter-enrich-section-count">{catLabel(il.cat_dominante)}</span>
            </div>
            <p className="filter-enrich-fauna-hint">
              {cultureLabel(il.code_cultu_dominant)}
              {il.code_cultu_dominant ? <span className="mono"> ({il.code_cultu_dominant})</span> : null}
              {" · "}{il.surface_ha.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ha
              {" · "}Miller {il.miller.toFixed(3)}
              {showZoneHumide && il.zone_humide_ha > 0
                ? ` · zone humide ${il.zone_humide_ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha`
                : ""}
            </p>
            <ul className="filter-enrich-fauna-list" aria-label="Répartition des usages de l'îlot">
              <PartBar label="Prairies permanentes" ratio={il.part_pp} color="#16a34a" />
              <PartBar label="Jachères" ratio={il.part_jachere} color="#a3a3a3" />
              <PartBar label="Vigne" ratio={il.part_vigne} color="#9333ea" />
            </ul>
          </div>
          <div className="filter-enrich-section">
            <div className="filter-enrich-section-head">
              <span className="filter-enrich-section-title">Parcelles cadastrales</span>
              <span className="filter-enrich-section-count mono">{il.idus.length}</span>
            </div>
            <p className="filter-enrich-fauna-hint">
              Parcelles exploitées ensemble par un même agriculteur (au moins 50 % de leur surface dans l&apos;îlot).
              Les couleurs correspondent aux propriétaires sur la carte.
            </p>
            {parcelles?.length ? (
              <ParcellesTable
                parcelles={parcelles}
                hoverIdu={hoverParcelleIdu}
                onHover={onParcelleHover}
                onClick={onParcelleClick}
              />
            ) : (
            <ul className="filter-enrich-cesbio-list" aria-label="Parcelles de l'îlot">
              {il.idus.map((idu) => (
                <li key={idu} className="filter-enrich-cesbio-chip mono" style={{ background: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" }}>
                  {onParcelleClick ? (
                    <button type="button" className="ranking-line-idu__map" onClick={() => onParcelleClick(idu)}>{idu}</button>
                  ) : idu}
                </li>
              ))}
            </ul>
            )}
          </div>
        </div>
      )}

      {tab === "especes" && <FilterEnrichBlock payload={enrich} part="faune" />}
      {tab === "sol" && <FilterEnrichBlock payload={enrich} part="sol" />}
      {tab === "score" && (scorePayload
        ? <ScoreBlock payload={scorePayload} />
        : <p className="ranking-line-empty">Score écologique non calculé pour cet îlot.</p>)}
      {tab === "proprietaire" && (
        <div style={{ display: "grid", gap: 8 }}>
          <p className="ranking-line-empty" style={{ margin: 0 }}>
            {il.pm_unique
              ? "Une seule personne morale détient au moins 95 % de la surface de l'îlot."
              : il.nb_pm > 0
                ? `${il.nb_pm} personne(s) morale(s) parmi les propriétaires ; la PM dominante détient la plus grande surface. Le reste est détenu par des personnes physiques ou non identifié.`
                : "Aucune personne morale identifiée (propriétaires personnes physiques ou non identifiés)."}
          </p>
          {pmPayload ? <PersonnesMoralesBlock payload={pmPayload} /> : null}
        </div>
      )}
    </div>
  );
}

export function IlotsRpgTable({
  results,
  selectedIlotId = null,
  hoverIlotId = null,
  scrollToIlotId = null,
  scrollTableNonce = 0,
  showZoneHumide = false,
  onIlotActivate,
  onIlotHover,
  onParcelleClick,
  geojson = null,
  hoverParcelleIdu = null,
  onParcelleHover,
  projectId = null,
}: IlotsRpgTableProps) {
  const parcelles = useMemo(() => parcellesByIlot(geojson), [geojson]);
  const [sortKey, setSortKey] = useState<IlotsRpgSortKey>("rang");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const ilots = useMemo(() => {
    const list = [...(results.ilots ?? [])];
    const sign = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => sign * (sortValue(a, sortKey) - sortValue(b, sortKey)) || a.rang - b.rang);
    return list;
  }, [results, sortKey, sortDir]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedId(null);
  }, [results]);

  useEffect(() => {
    if (!scrollToIlotId) return;
    const idx = ilots.findIndex((il) => il.num_ilot === scrollToIlotId);
    if (idx < 0) return;
    setVisibleCount((c) => Math.max(c, idx + 1));
    setExpandedId(scrollToIlotId);
    const id = scrollToIlotId;
    window.setTimeout(() => {
      const row = document.getElementById(`row-ilot-rpg-${id}`);
      if (!row) return;
      const container =
        (row.closest(".results-split__table-inner") as HTMLElement | null)
        ?? (row.closest(".ranking-table-scroll") as HTMLElement | null);
      if (!container) {
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = rowRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 50);
  }, [scrollToIlotId, scrollTableNonce, ilots]);

  function onSort(key: IlotsRpgSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(defaultDir(key));
    }
  }

  function hover(id: string | null) {
    setHoveredId(id);
    onIlotHover?.(id);
  }

  const SortTh = ({ label, k, className, title }: { label: string; k: IlotsRpgSortKey; className?: string; title?: string }) => (
    <th className={`ranking-sort-cell${className ? ` ${className}` : ""}`} title={title}>
      <button type="button" className={`ranking-sort-th${sortKey === k ? " is-active" : ""}`} onClick={() => onSort(k)}>
        {label}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  const visible = ilots.slice(0, visibleCount);
  const hasMore = ilots.length > visibleCount;

  return (
    <div className="ranking-wrap">
      <div className="ranking-chrome">
        <div className="ranking-chrome__bar">
          {projectId && <ExportEtudeMenu projectId={projectId} page="ilots" />}
          <span className="ranking-filter__current" title="Îlots agricoles déclarés à la PAC, convertis en parcelles cadastrales">
            Îlots agricoles RPG {results.millesime}
          </span>
          <span
            className="ranking-count mono"
            title={`${results.total_candidats} îlots candidats dans l'aire d'étude, ${results.total_ilots} passent les critères du filtre`}
          >
            {visible.length} / {results.total_ilots} îlots · {results.total_candidats} candidats
          </span>
        </div>
        <ResultInfoNote>
          <p>
            Un îlot agricole est un bloc de terres d&apos;un seul tenant déclaré par un
            même exploitant à la PAC (Registre parcellaire graphique). L&apos;exploitant
            n&apos;est pas forcément le propriétaire : beaucoup de terres sont louées.
          </p>
          <p>
            Le tableau classe ces îlots. La surface et la culture sont celles de
            l&apos;îlot. La colonne propriétaire indique la société qui détient la plus
            grande part des parcelles cadastrales retenues, pas l&apos;exploitant.
            Les particuliers ne sont pas identifiés.
          </p>
          <p>
            Sur la carte, la zone colorée correspond aux parcelles cadastrales
            rattachées à l&apos;îlot (le foncier qu&apos;on peut acquérir). Les pointillés
            suivent le dessin déclaré à la PAC, qui ne colle pas au cadastre.
            Le bouton d&apos;aide de la carte détaille les couleurs et les limites.
          </p>
        </ResultInfoNote>
      </div>

      <div className="ranking-table-scroll">
        <table className="ranking-table">
          <thead>
            <tr>
              <SortTh label="#" k="rang" className="col-rank" title="Rang (score éco puis surface)" />
              <SortTh label="Score éco" k="score" className="col-eco" />
              <th className="col-culture">Culture</th>
              <SortTh label="Surface" k="surface" className="col-surf" />
              <SortTh label="Parcelles" k="nb_parcelles" className="col-uf-nb-parcelles" />
              <th className="col-pm" title="Propriété personnes morales de l'îlot">Propriétaire</th>
              <th className="col-prospect" title="La PM dominante a-t-elle déjà compensé ?">Déjà compensé ?</th>
              <th className="col-dist-espece">Dist espèce</th>
              <SortTh label="Dist projet" k="distance" className="col-dist" />
              <th className="col-detail" aria-label="Détail" />
            </tr>
          </thead>
          <tbody>
            {!visible.length && (
              <tr>
                <td colSpan={COL_COUNT} className="ranking-empty">
                  Aucun îlot agricole ne passe les critères du filtre.
                </td>
              </tr>
            )}
            {visible.map((il) => {
              const open = expandedId === il.num_ilot;
              const isSelected = selectedIlotId === il.num_ilot || open;
              const isHovered = hoveredId === il.num_ilot || hoverIlotId === il.num_ilot;
              const eco = ecoBadgeStyle(il.score_eco?.total_score, il.score_eco?.max_score);
              return (
                <Fragment key={il.num_ilot}>
                  <tr
                    id={`row-ilot-rpg-${il.num_ilot}`}
                    className={`ranking-row${open ? " ranking-row--expanded" : ""}${isSelected ? " selected" : ""}${isHovered ? " hovered" : ""}`}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => hover(il.num_ilot)}
                    onMouseLeave={() => hover(null)}
                    onClick={() => {
                      setExpandedId(open ? null : il.num_ilot);
                      onIlotActivate?.(il.num_ilot);
                    }}
                  >
                    <td className="col-rank"><span className="rank-badge mono">{il.rang}</span></td>
                    <td className="col-eco">
                      <Pill bg={eco.bg} fg={eco.fg} title="Score écologique">
                        {il.score_eco ? `${il.score_eco.total_score}/${il.score_eco.max_score}` : "—"}
                      </Pill>
                    </td>
                    <td className="col-culture"><CultureCell il={il} /></td>
                    <td className="col-surf mono">{il.surface_ha.toFixed(1)}<span className="unit"> ha</span></td>
                    <td className="col-uf-nb-parcelles mono">{il.nb_parcelles}<span className="unit"> parc.</span></td>
                    <td className="col-pm"><ProprietaireCell il={il} /></td>
                    <td className="col-prospect"><ProspectCell il={il} /></td>
                    <td className="col-dist-espece mono">
                      {il.dist_fauna_m != null && il.dist_fauna_m >= 0
                        ? <>{Math.round(il.dist_fauna_m).toLocaleString("fr-FR")}<span className="unit"> m</span></>
                        : <span className="na">—</span>}
                    </td>
                    <td className="col-dist mono">{il.distance_centre_km.toFixed(1)}<span className="unit"> km</span></td>
                    <td className="col-detail mono" style={{ color: "#64748b" }}>{open ? "▾" : "▸"}</td>
                  </tr>
                  {open && (
                    <tr
                      className="ranking-row-detail"
                      onMouseEnter={() => hover(il.num_ilot)}
                      onMouseLeave={() => hover(null)}
                    >
                      <td colSpan={COL_COUNT} className="ranking-cell-detail">
                        <IlotDetail
                          il={il}
                          showZoneHumide={showZoneHumide}
                          parcelles={parcelles[il.num_ilot]}
                          hoverParcelleIdu={hoverParcelleIdu}
                          onParcelleHover={onParcelleHover}
                          onParcelleClick={onParcelleClick}
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
              onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, ilots.length))}
            >
              Afficher plus (+{Math.min(PAGE_SIZE, ilots.length - visibleCount)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
