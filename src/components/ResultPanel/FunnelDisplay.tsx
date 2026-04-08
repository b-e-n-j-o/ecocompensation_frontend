// ─── FunnelDisplay ───────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { FunnelStep } from "../../types";

interface FunnelDisplayProps {
  steps: FunnelStep[];
  finalRadiusKm: number;
  total: number;
  /** Libellé de l’entité comptée (ex. « parcelles », « sous-ensembles »). */
  entityLabel?: string;
  /** Texte optionnel après « dans l’AOI » (ex. « 12 UF »). */
  extraSummary?: string | null;
}

export function FunnelDisplay({
  steps,
  finalRadiusKm,
  total,
  entityLabel = "parcelles",
  extraSummary = null,
}: FunnelDisplayProps) {
  const validSteps = useMemo(() => steps.filter((s) => s.count >= 0), [steps]);
  const [visible, setVisible] = useState(0);

  // Animation d'apparition séquentielle
  useEffect(() => {
    setVisible(0);
    if (!validSteps.length) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= validSteps.length) clearInterval(timer);
    }, 80);
    return () => clearInterval(timer);
  }, [steps]);

  if (!validSteps.length) return null;

  const maxCount = validSteps[0]?.count ?? 1;

  return (
    <div className="funnel-wrap">
      <div className="funnel-header">
        <span className="funnel-title">Entonnoir de filtre</span>
        <span className="funnel-result">
          <span className="funnel-count">{total}</span>
          <span className="funnel-sub">
            {" "}
            {entityLabel} ·{" "}
            {finalRadiusKm > 0 ? `rayon ${finalRadiusKm} km` : "dans l'AOI"}
            {extraSummary ? ` · ${extraSummary}` : ""}
          </span>
        </span>
      </div>

      <div className="funnel-steps">
        {validSteps.map((step, idx) => {
          const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
          const isLast = idx === validSteps.length - 1;
          const show = idx < visible;

          return (
            <div
              key={step.step}
              className={`funnel-step ${show ? "show" : ""} ${isLast ? "final" : ""}`}
              style={{ "--delay": `${idx * 80}ms` } as React.CSSProperties}
            >
              <div className="fstep-left">
                <span className="fstep-idx mono">{step.step}</span>
                <span className="fstep-label">{step.label}</span>
              </div>
              <div className="fstep-right">
                <div className="fstep-bar-wrap">
                  <div
                    className="fstep-bar"
                    style={{ width: show ? `${pct}%` : "0%" }}
                  />
                </div>
                <span className="fstep-count mono">{step.count.toLocaleString("fr-FR")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}