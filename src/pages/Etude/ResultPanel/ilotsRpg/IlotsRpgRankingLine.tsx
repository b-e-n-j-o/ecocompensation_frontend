/**
 * Ligne d'un îlot RPG : colonnes du tableau + panneau de dureté foncière.
 * Le score affiché est la moyenne pondérée par la surface des personnes morales.
 */
import { useState } from "react";
import { DureteFoncierePanel } from "../TableauParcelles/RankingLineDurete";
import { dureteBadgeStyle, dureteSkipReasonLabel, type DureteFonciereMetric } from "../../../../utils/poolMetrics";
import type { IlotRpgDuretePm, IlotRpgResult } from "./types";

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

function toMetric(pm: IlotRpgDuretePm): DureteFonciereMetric {
  return {
    eligible: pm.score_final != null,
    reason: pm.reason ?? null,
    score_final: pm.score_final,
    attractivite_fonciere: null,
    niveau_durete: pm.niveau_durete,
    explication: pm.explication,
    siren: pm.siren,
    denomination: pm.denomination,
    intersects_arrachage_vigne: pm.intersects_arrachage_vigne === true,
    detail_axes: (pm.detail_axes as DureteFonciereMetric["detail_axes"]) ?? null,
  };
}

export function DureteIlotCell({ il }: { il: IlotRpgResult }) {
  const d = il.durete_fonciere;
  if (!d) {
    return <span className="na">—</span>;
  }
  if (d.score_final == null) {
    return (
      <span className="na" title={dureteSkipReasonLabel(d.reason)}>
        —
      </span>
    );
  }
  const style = dureteBadgeStyle(d.score_final);
  const n = d.pms.length;
  return (
    <Pill
      bg={style.bg}
      fg={style.fg}
      title={
        n > 1
          ? `Moyenne pondérée de ${n} personnes morales (${d.surface_pm_pct ?? "?"} % du foncier)`
          : d.niveau_durete ?? "Dureté foncière"
      }
    >
      {Math.round(d.score_final)}
    </Pill>
  );
}

export function DureteIlotPanel({
  il,
  onCalculate,
  loading = false,
}: {
  il: IlotRpgResult;
  onCalculate?: () => void;
  loading?: boolean;
}) {
  const d = il.durete_fonciere;
  const [openSiren, setOpenSiren] = useState<string | null>(null);
  if (!d) {
    return (
      <div className="filter-enrich-block">
        <p className="ranking-line-empty">Dureté non calculée pour cet îlot.</p>
        {onCalculate && (
          <button type="button" className="ranking-btn-durete" disabled={loading} onClick={onCalculate}>
            {loading ? "Calcul…" : "Calculer la dureté"}
          </button>
        )}
      </div>
    );
  }
  if (!d.pms.length) {
    return <p className="ranking-line-empty">{dureteSkipReasonLabel(d.reason ?? "not_pm")}</p>;
  }
  return (
    <div className="filter-enrich-block">
      <p className="filter-enrich-fauna-hint">
        Score de l&apos;îlot : {d.score_final != null ? Math.round(d.score_final) : "—"}
        {d.niveau_durete ? ` · ${d.niveau_durete}` : ""}
        {d.surface_pm_pct != null ? ` · personnes morales sur ${d.surface_pm_pct} % du foncier` : ""}
        . Moyenne pondérée par la surface de chaque personne morale.
      </p>
      <ul className="filter-enrich-fauna-list">
        {d.pms.map((pm) => {
          const key = pm.siren || pm.denomination || "pm";
          const open = openSiren === key;
          const style = dureteBadgeStyle(pm.score_final);
          return (
            <li key={key} className="filter-enrich-fauna-row">
              <div className="filter-enrich-fauna-row-head">
                <span className="filter-enrich-fauna-species">
                  {pm.denomination || "Personne morale"}
                  {pm.siren ? <span className="mono"> · {pm.siren}</span> : null}
                </span>
                <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                  {pm.surface_pct != null ? `${pm.surface_pct} %` : "—"}
                </span>
                {pm.score_final != null ? (
                  <Pill bg={style.bg} fg={style.fg}>{Math.round(pm.score_final)}</Pill>
                ) : (
                  <span className="na" title={dureteSkipReasonLabel(pm.reason)}>—</span>
                )}
                <button type="button" className="ranking-line-tab" onClick={() => setOpenSiren(open ? null : key)}>
                  {open ? "Fermer" : "Étude"}
                </button>
              </div>
              {open && pm.score_final != null && <DureteFoncierePanel payload={toMetric(pm)} />}
              {open && pm.score_final == null && (
                <p className="ranking-line-empty">{dureteSkipReasonLabel(pm.reason)}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
