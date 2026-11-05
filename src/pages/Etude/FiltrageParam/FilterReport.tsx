// ─── FilterReport ────────────────────────────────────────────────────────────
// Compte rendu du filtrage : synthèse + critères appliqués par thème (avec
// paramètres issus de filter_config) + critères non appliqués.
// La barre représente le nombre de parcelles RETIRÉES par chaque critère.
import { useMemo, useState } from "react";
import type { FunnelStep } from "../../../types";
import {
  buildCriteria,
  HIDDEN_FROM_REPORT,
  matchStepKey,
  uiCriterionIndex,
  type CriterionDetail,
  type CriterionSpec,
  type FilterConfig,
  type FilterTheme,
} from "./FilterCatalog";

/** Champs optionnels que le backend pourra ajouter à FunnelStep. */
export interface FunnelStepEnriched extends FunnelStep {
  /** Clé stable = nom du champ FilterConfig ou clé de couche (natura_2000…). */
  key?: string;
  params?: Record<string, unknown>;
}

export interface NormalizedCriterion {
  idx: number;
  key: string;
  theme: FilterTheme;
  label: string;
  rawLabel: string;
  description: string | null;
  source: string | null;
  details: CriterionDetail[];
  countIn: number | null;
  countOut: number | null;
  removed: number | null;
  missingCount: boolean;
}

const paramsToDetails = (p?: Record<string, unknown>): CriterionDetail[] =>
  p ? Object.entries(p).map(([k, v]) => ({ label: k, value: Array.isArray(v) ? v.join(", ") : String(v) })) : [];

/**
 * - rattache chaque étape à un critère (key ou regex),
 * - supprime les doublons consécutifs (même critère + même count),
 * - calcule entrées / sorties / retirées.
 */
export function normalizeSteps(
  steps: FunnelStepEnriched[],
  specs: CriterionSpec[],
  aoiTotal?: number | null,
): NormalizedCriterion[] {
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const keyed = steps.map((s) => ({ s, key: matchStepKey(s) ?? `step_${s.step}` }));
  const dedup = keyed.filter((k, i) => !(i > 0 && keyed[i - 1].key === k.key && keyed[i - 1].s.count === k.s.count));

  let lastKnown: number | null = aoiTotal ?? null;
  return dedup.map(({ s, key }, i) => {
    const spec = byKey.get(key);
    const hasCount = typeof s.count === "number" && s.count >= 0;
    const countIn = lastKnown;
    const countOut = hasCount ? s.count : null;
    if (hasCount) lastKnown = s.count;
    return {
      idx: i + 1,
      key,
      theme: spec?.theme ?? "autre",
      label: spec?.label ?? s.label,
      rawLabel: s.label,
      description: spec?.description ?? null,
      source: spec?.source ?? null,
      details: [...(spec?.details ?? []), ...paramsToDetails(s.params)],
      countIn,
      countOut,
      removed: countIn != null && countOut != null ? countIn - countOut : null,
      missingCount: !hasCount,
    };
  });
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR"));

interface FilterReportProps {
  steps: FunnelStepEnriched[];
  /** Config de filtrage utilisée (snapshot du calcul, pas le panneau courant). */
  filterConfig?: FilterConfig | null;
  /** Nb de parcelles retenues au final (fait foi si le dernier step n'a pas de count). */
  total: number;
  /** Nb total de parcelles dans l'AOI avant tout filtre, si connu. */
  aoiTotal?: number | null;
  finalRadiusKm?: number;
  entityLabel?: string;
  computedAt?: string | Date | null;
  /** Futur : afficher sur la carte les parcelles retirées par ce critère. */
  onShowExcluded?: (c: NormalizedCriterion) => void;
}

export function FilterReport({
  steps,
  filterConfig = null,
  total,
  aoiTotal = null,
  finalRadiusKm = 0,
  entityLabel = "parcelles",
  onShowExcluded,
}: FilterReportProps) {
  const specs = useMemo(() => buildCriteria(filterConfig), [filterConfig]);
  const criteria = useMemo(() => normalizeSteps(steps, specs, aoiTotal), [steps, specs, aoiTotal]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Dernière étape sans count → on prend `total`.
  const enriched = useMemo(() => {
    if (!criteria.length) return criteria;
    const last = criteria[criteria.length - 1];
    if (last.missingCount && last.countIn != null) {
      return [...criteria.slice(0, -1), { ...last, countOut: total, removed: last.countIn - total, missingCount: false }];
    }
    return criteria;
  }, [criteria, total]);

  const visible = (key: string) => !HIDDEN_FROM_REPORT.has(key);
  const matched = new Set(enriched.map((c) => c.key));
  const listed = [...enriched]
    .filter((c) => visible(c.key))
    .sort((a, b) => uiCriterionIndex(a.key) - uiCriterionIndex(b.key));
  const appliedByKey = new Map(listed.map((c) => [c.key, c]));
  const rows = specs.filter((s) => visible(s.key)).map((spec) => ({
    spec,
    applied: appliedByKey.get(spec.key) ?? null,
  }));
  const activeButMissing = specs.filter((s) => s.applied === true && !matched.has(s.key) && visible(s.key));

  const start = aoiTotal ?? enriched[0]?.countOut ?? null;
  const maxRemoved = Math.max(1, ...listed.map((c) => c.removed ?? 0));
  const lastOut = enriched[enriched.length - 1]?.countOut;
  const inconsistent = lastOut != null && lastOut !== total;

  if (!enriched.length) {
    return <div className="freport-empty">Aucun filtrage enregistré pour cette étude.</div>;
  }

  const radiusLabel = finalRadiusKm > 0
    ? `Rayon de recherche : ${finalRadiusKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`
    : filterConfig?.search_mode === "within_foncier"
      ? "Rayon de recherche : 0 km"
      : null;

  return (
    <div className="freport">
      <div className="freport-summary">
        {radiusLabel && <div className="freport-aoi">{radiusLabel}</div>}
        <div className="freport-flow">
          <span className="freport-big mono">{fmt(start)}</span>
          <span className="freport-flow-label">
            {aoiTotal != null ? `${entityLabel} dans l'AOI` : `${entityLabel} candidates`}
          </span>
          <span className="freport-arrow">→</span>
          <span className="freport-big freport-big--final mono">{fmt(total)}</span>
          <span className="freport-flow-label">retenues</span>
        </div>
        {inconsistent && (
          <div className="freport-warn">
            ⚠ Le nombre final de l'entonnoir ({fmt(lastOut)}) diffère du nombre de {entityLabel} retenues ({fmt(total)}).
          </div>
        )}
      </div>

      <div className="freport-groups">
        <section className="freport-group">
          <ul className="freport-list">
            {rows.map(({ spec, applied: c }) => {
              if (!c) {
                return (
                  <li key={spec.key} className="freport-item off">
                    <div className="freport-row freport-row--off">
                      <span className="freport-check" aria-hidden>–</span>
                      <span className="freport-label" title={spec.description}>{spec.name}</span>
                      <span className="freport-bar-wrap" />
                      <span className="freport-off-badge">Non pris en compte</span>
                      <span className="freport-remaining" />
                      <span className="freport-chevron" />
                    </div>
                  </li>
                );
              }
              const id = `${c.key}-${c.idx}`;
              const open = openKey === id;
              const pct = c.removed != null ? (c.removed / maxRemoved) * 100 : 0;
              const pctOfIn = c.countIn && c.removed != null ? Math.round((c.removed / c.countIn) * 100) : null;
              return (
                <li key={id} className={`freport-item${open ? " open" : ""}`}>
                  <button type="button" className="freport-row" onClick={() => setOpenKey(open ? null : id)} aria-expanded={open}>
                    <span className="freport-check" aria-hidden>✓</span>
                    <span className="freport-label" title={c.label}>{c.label}</span>
                    <span
                      className="freport-bar-wrap"
                      title={pctOfIn != null ? `${pctOfIn} % des ${entityLabel} en entrée` : undefined}
                    >
                      <span className="freport-bar" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="freport-removed mono">
                      {c.missingCount ? "n.c." : c.removed != null ? `−${fmt(c.removed)}` : fmt(c.countOut)}
                    </span>
                    <span className="freport-remaining mono">{fmt(c.countOut)}</span>
                    <span className="freport-chevron" aria-hidden>{open ? "▾" : "▸"}</span>
                  </button>

                  {open && (
                    <div className="freport-detail">
                      {c.description && <p className="freport-desc">{c.description}</p>}
                      <dl className="freport-dl">
                        {c.details.map((d) => (
                          <span key={d.label} style={{ display: "contents" }}>
                            <dt>{d.label}</dt>
                            <dd>{d.value}</dd>
                          </span>
                        ))}
                        <dt>Entrée</dt>
                        <dd className="mono">{fmt(c.countIn)} {entityLabel}</dd>
                        <dt>Retirées</dt>
                        <dd className="mono">
                          {c.removed != null ? `${fmt(c.removed)}${pctOfIn != null ? ` (${pctOfIn} %)` : ""}` : "—"}
                        </dd>
                        <dt>Conservées</dt>
                        <dd className="mono">{fmt(c.countOut)}</dd>
                        {c.source && (
                          <>
                            <dt>Source</dt>
                            <dd>{c.source}</dd>
                          </>
                        )}
                      </dl>
                      <div className="freport-raw">
                        Étape technique : <span className="mono">{c.rawLabel}</span>
                      </div>
                      {onShowExcluded && (c.removed ?? 0) > 0 && (
                        <button type="button" className="freport-action" onClick={() => onShowExcluded(c)}>
                          Voir les {entityLabel} retirées sur la carte
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {activeButMissing.length > 0 && (
        <div className="freport-warn">
          ⚠ Critère(s) actif(s) dans la configuration mais absent(s) de l'entonnoir :{" "}
          {activeButMissing.map((s) => s.name).join(", ")}. La configuration a peut-être été modifiée après le calcul.
        </div>
      )}

      <div className="freport-legend">
        <span>La barre indique le nombre de {entityLabel} <strong>retirées</strong> par chaque critère.</span>
        <span>Colonne de droite : {entityLabel} restantes après le critère.</span>
      </div>
    </div>
  );
}
