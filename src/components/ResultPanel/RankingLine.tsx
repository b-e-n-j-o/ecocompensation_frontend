// ─── RankingLine — détail métriques pool (extensible) ─────────────────────────
import type { ParcelPoolMetricRow, VegetationHybridePoolMetricPayload } from "../../types";

const METRIC_LABELS: Record<string, string> = {
  vegetation_hybride_ratio: "Zonage hybride (BD TOPO / CESBIO)",
  cosia_zonage_ratio: "Zonage COSIA (IGN)",
  carhab_eunis_ratio: "Zonage CARHAB (EUNIS)",
  zone_humide: "Zones humides",
};

/** Ordre d’affichage des blocs métriques dans le détail de ligne. */
const METRIC_DISPLAY_ORDER = [
  "vegetation_hybride_ratio",
  "cosia_zonage_ratio",
  "carhab_eunis_ratio",
] as const;

function sortMetricsForDisplay(metrics: ParcelPoolMetricRow[]): ParcelPoolMetricRow[] {
  const priority = (key: string) => {
    const i = (METRIC_DISPLAY_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? 999 : i;
  };
  return [...metrics].sort((a, b) => {
    const d = priority(a.metric_key) - priority(b.metric_key);
    if (d !== 0) return d;
    return a.metric_key.localeCompare(b.metric_key);
  });
}

/** Parts de zonage affichées seulement si ≥ 1 % de l’intersection couche / parcelle. */
const MIN_ZONAGE_DISPLAY_RATIO = 0.01;

function parseVegetationPayload(v: Record<string, unknown>): VegetationHybridePoolMetricPayload | null {
  const raw = v.ratios;
  if (raw == null || typeof raw !== "object") return null;
  const ratios: Record<string, number> = {};
  for (const [k, val] of Object.entries(raw)) {
    if (typeof val === "number" && Number.isFinite(val)) ratios[k] = val;
  }
  const t = v.total_intersection_area_m2;
  return {
    ratios,
    total_intersection_area_m2: typeof t === "number" && Number.isFinite(t) ? t : 0,
  };
}

/** Couleur stable par libellé : même chaîne → même teinte sur toutes les lignes du tableau. */
function colorForZonageLabel(label: string): { fill: string; border: string } {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return {
    fill: `hsl(${hue} 46% 42%)`,
    border: `hsl(${hue} 46% 28%)`,
  };
}

/** COSIA / hybride : barre empilée (parts exclusives ~100 %). CARHAB : barres indépendantes (recouvrements possibles). */
type ZonageDisplayVariant = "stacked" | "carhab_independent";

function ZonageRatiosBlock({
  payload,
  emptyMessage = "Aucune intersection mesurée avec la couche hybride.",
  totalLineLabel = "Intersection couche / parcelle :",
  variant = "stacked",
}: {
  payload: VegetationHybridePoolMetricPayload;
  emptyMessage?: string;
  totalLineLabel?: string;
  variant?: ZonageDisplayVariant;
}) {
  const rawPositive = Object.entries(payload.ratios).filter(
    ([, r]) => typeof r === "number" && r > 0,
  );
  const entries = rawPositive
    .filter(([, r]) => typeof r === "number" && r >= MIN_ZONAGE_DISPLAY_RATIO)
    .sort((a, b) => b[1] - a[1]);
  const totalM2 = payload.total_intersection_area_m2;

  if (!entries.length) {
    if (rawPositive.length > 0) {
      return (
        <p className="ranking-line-empty">
          Aucune classe ne représente au moins 1 % de l’intersection (toutes les parts affichées seraient
          négligeables).
        </p>
      );
    }
    return <p className="ranking-line-empty">{emptyMessage}</p>;
  }

  const ariaLabel = entries
    .map(([label, r]) => `${label} ${(r * 100).toFixed(1)} pour cent`)
    .join(", ");

  if (variant === "carhab_independent") {
    return (
      <div className="ranking-metric-vegetation ranking-metric-vegetation--carhab">
        <div className="veg-zonage-head">
          {typeof totalM2 === "number" && Number.isFinite(totalM2) && totalM2 > 0 && (
            <span className="veg-zonage-total">
              {totalLineLabel}{" "}
              <span className="mono">{totalM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²</span>
            </span>
          )}
        </div>

        <div className="veg-carhab-histo" role="list" aria-label={`Couverture CARHAB par classe : ${ariaLabel}`}>
          {entries.map(([label, ratio]) => {
            const { fill, border } = colorForZonageLabel(label);
            const pctRaw = ratio * 100;
            const pctDisplay = pctRaw >= 10 ? pctRaw.toFixed(0) : pctRaw.toFixed(1);
            const barPct = Math.max(0, Math.min(100, pctRaw));
            const areaM2 =
              typeof totalM2 === "number" && Number.isFinite(totalM2) && totalM2 > 0
                ? ratio * totalM2
                : null;
            const tip =
              areaM2 != null
                ? `${label} — ${pctDisplay} % de la parcelle (${areaM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²)`
                : `${label} — ${pctDisplay} % de la parcelle`;
            return (
              <div key={label} className="veg-carhab-row" role="listitem">
                <span className="veg-carhab-label" title={label}>
                  {label}
                </span>
                <div className="veg-carhab-track-wrap">
                  <div className="veg-carhab-track" title={tip}>
                    <div
                      className="veg-carhab-fill"
                      style={{
                        width: `${barPct}%`,
                        background: fill,
                        boxShadow: `inset 0 0 0 1px ${border}`,
                      }}
                    />
                  </div>
                </div>
                <span className="veg-carhab-stats mono">
                  <span className="veg-carhab-pct">{pctDisplay} %</span>
                  {areaM2 != null && (
                    <>
                      <span className="veg-legend-sep" aria-hidden>
                        {" "}
                        ·{" "}
                      </span>
                      <span className="veg-carhab-m2">
                        {areaM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²
                      </span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="ranking-metric-vegetation">
      <div className="veg-zonage-head">
        {typeof totalM2 === "number" && Number.isFinite(totalM2) && totalM2 > 0 && (
          <span className="veg-zonage-total">
            {totalLineLabel}{" "}
            <span className="mono">{totalM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²</span>
          </span>
        )}
      </div>

      <div
        className="veg-stack-bar"
        role="img"
        aria-label={`Répartition du zonage : ${ariaLabel}`}
      >
        {entries.map(([label, ratio]) => {
          const { fill, border } = colorForZonageLabel(label);
          const pct = Math.max(0, Math.min(100, ratio * 100));
          const areaM2 =
            typeof totalM2 === "number" && Number.isFinite(totalM2) && totalM2 > 0
              ? ratio * totalM2
              : null;
          const tip =
            areaM2 != null
              ? `${label} — ${pct.toFixed(1)} % (${areaM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²)`
              : `${label} — ${pct.toFixed(1)} %`;
          return (
            <div
              key={label}
              className="veg-stack-segment"
              style={{
                width: `${pct}%`,
                background: fill,
                boxShadow: `inset 0 0 0 1px ${border}`,
              }}
              title={tip}
            />
          );
        })}
      </div>

      <ul className="veg-legend" aria-label="Détail par classe">
        {entries.map(([label, ratio]) => {
          const { fill, border } = colorForZonageLabel(label);
          const pct = ratio * 100;
          const areaM2 =
            typeof totalM2 === "number" && Number.isFinite(totalM2) && totalM2 > 0
              ? ratio * totalM2
              : null;
          return (
            <li key={label} className="veg-legend-item">
              <span
                className="veg-legend-swatch"
                style={{ background: fill, boxShadow: `inset 0 0 0 1px ${border}` }}
                aria-hidden
              />
              <span className="veg-legend-label" title={label}>
                {label}
              </span>
              <span className="veg-legend-stats mono">
                <span className="veg-legend-pct">
                  {(pct >= 10 ? pct.toFixed(0) : pct.toFixed(1))} %
                </span>
                {areaM2 != null && (
                  <>
                    <span className="veg-legend-sep" aria-hidden>
                      {" "}
                      ·{" "}
                    </span>
                    <span className="veg-legend-m2">
                      {areaM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GenericMetricBlock({ row }: { row: ParcelPoolMetricRow }) {
  return (
    <pre className="ranking-metric-raw mono">
      {JSON.stringify(row.metric_value_jsonb, null, 2)}
    </pre>
  );
}

export interface RankingLineProps {
  idu: string;
  expanded: boolean;
  /** Métriques préchargées (GET /pool/metrics) pour cette parcelle. */
  metrics: ParcelPoolMetricRow[];
  /** True tant que le bulk des métriques du run est en cours après filtrage. */
  metricsLoading: boolean;
  /** Pas de run pool (réponse filtre sans pool_run_id). */
  noPoolRun?: boolean;
}

export function RankingLine({
  idu,
  expanded,
  metrics,
  metricsLoading,
  noPoolRun = false,
}: RankingLineProps) {
  if (!expanded) return null;

  if (noPoolRun) {
    return (
      <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
        <p className="ranking-line-empty">
          Aucun run de pool associé à ce filtre (métriques non disponibles). Relancez le filtre ou vérifiez la
          persistance côté serveur.
        </p>
      </div>
    );
  }

  if (metricsLoading) {
    return (
      <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
        <p className="ranking-line-status">Chargement des métriques du pool…</p>
      </div>
    );
  }

  if (!metrics.length) {
    return (
      <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
        <p className="ranking-line-empty">Aucune métrique enregistrée pour cette parcelle sur ce run.</p>
      </div>
    );
  }

  const metricsOrdered = sortMetricsForDisplay(metrics);

  return (
    <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
      <div className="ranking-metrics-stack">
        {metricsOrdered.map((row) => {
          const title = METRIC_LABELS[row.metric_key] ?? row.metric_key;
          const val = row.metric_value_jsonb ?? {};
          const isZonageRatio =
            row.metric_key === "vegetation_hybride_ratio" ||
            row.metric_key === "cosia_zonage_ratio" ||
            row.metric_key === "carhab_eunis_ratio";
          const zonagePayload = isZonageRatio ? parseVegetationPayload(val) : null;

          return (
            <section key={row.metric_key} className="ranking-metric-block">
              <h4 className="ranking-metric-title">{title}</h4>
              {zonagePayload ? (
                <ZonageRatiosBlock
                  payload={zonagePayload}
                  {...(row.metric_key === "cosia_zonage_ratio"
                    ? {
                        emptyMessage: "Aucune intersection mesurée avec la couche COSIA (IGN).",
                        totalLineLabel: "Intersection COSIA / parcelle :",
                      }
                    : row.metric_key === "carhab_eunis_ratio"
                      ? {
                          emptyMessage: "Aucune intersection mesurée avec la couche CARHAB (EUNIS).",
                          totalLineLabel: "Surface parcelle (référence des % CARHAB) :",
                          variant: "carhab_independent" as const,
                        }
                      : {})}
                />
              ) : (
                <GenericMetricBlock row={row} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
