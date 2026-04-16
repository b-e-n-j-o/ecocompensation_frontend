// ─── RankingLine — détail métriques pool (extensible) ─────────────────────────
import type { ParcelPoolMetricRow, VegetationHybridePoolMetricPayload } from "../../types";

const METRIC_LABELS: Record<string, string> = {
  parcel_score_v1: "Score parcelle",
  composite_score_v1: "Score composite",
  durete_fonciere: "Dureté foncière (personne morale)",
  especes_faune: "Espèces faune",
  vegetation_hybride_ratio: "Zonage hybride (BD TOPO / CESBIO)",
  cosia_zonage_ratio: "Zonage COSIA (IGN)",
  carhab_eunis_ratio: "Zonage CARHAB (EUNIS)",
  arrachage_vignes_ratio: "Arrachage de vignes",
  zone_humide: "Zones humides",
};

/** Ordre d’affichage des blocs métriques dans le détail de ligne. */
const METRIC_DISPLAY_ORDER = [
  "parcel_score_v1",
  "composite_score_v1",
  "durete_fonciere",
  "especes_faune",
  "vegetation_hybride_ratio",
  "cosia_zonage_ratio",
  "carhab_eunis_ratio",
  "arrachage_vignes_ratio",
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

type ParcelScoreBreakdownItem = {
  points: number;
  reason?: string;
  distance_km?: number;
  bucket?: string;
  surface_ha?: number;
  target_ha?: number;
};

type ParcelScorePayload = {
  total_score: number;
  max_score: number;
  breakdown: {
    especes: ParcelScoreBreakdownItem;
    distance: ParcelScoreBreakdownItem;
    surface: ParcelScoreBreakdownItem;
    arrachage: ParcelScoreBreakdownItem;
    /** +1 si parcelle répertoriée base PPM (absent sur anciens scores max 8) */
    personnes_morales?: ParcelScoreBreakdownItem;
  };
};

function parseParcelScorePayload(v: Record<string, unknown>): ParcelScorePayload | null {
  if (typeof v.total_score !== "number" || typeof v.max_score !== "number") return null;
  const b = v.breakdown;
  if (!b || typeof b !== "object") return null;

  const getItem = (key: string): ParcelScoreBreakdownItem => {
    const item = (b as Record<string, unknown>)[key];
    if (!item || typeof item !== "object") return { points: 0 };
    const rec = item as Record<string, unknown>;
    return {
      points: typeof rec.points === "number" && Number.isFinite(rec.points) ? rec.points : 0,
      reason: typeof rec.reason === "string" ? rec.reason : undefined,
      distance_km: typeof rec.distance_km === "number" && Number.isFinite(rec.distance_km) ? rec.distance_km : undefined,
      bucket: typeof rec.bucket === "string" ? rec.bucket : undefined,
      surface_ha: typeof rec.surface_ha === "number" && Number.isFinite(rec.surface_ha) ? rec.surface_ha : undefined,
      target_ha: typeof rec.target_ha === "number" && Number.isFinite(rec.target_ha) ? rec.target_ha : undefined,
    };
  };

  const br = b as Record<string, unknown>;
  return {
    total_score: v.total_score,
    max_score: v.max_score,
    breakdown: {
      especes: getItem("especes"),
      distance: getItem("distance"),
      surface: getItem("surface"),
      arrachage: getItem("arrachage"),
      ...(Object.prototype.hasOwnProperty.call(br, "personnes_morales")
        ? { personnes_morales: getItem("personnes_morales") }
        : {}),
    },
  };
}

/** Texte lisible sur fond clair (évite blanc sur blanc). */
const SCORE_TEXT = "#111827";
const SCORE_TEXT_MUTED = "#4b5563";
const SCORE_ACCENT = "#15803d";

function ScoreBlock({ payload }: { payload: ParcelScorePayload }) {
  const ratio = payload.max_score > 0 ? payload.total_score / payload.max_score : 0;
  const color = ratio >= 0.8 ? "#166534" : ratio >= 0.5 ? "#16a34a" : ratio >= 0.2 ? "#f59e0b" : "#6b7280";
  const bg =
    ratio >= 0.8
      ? "rgba(22,101,52,0.14)"
      : ratio >= 0.5
        ? "rgba(22,163,74,0.12)"
        : ratio >= 0.2
          ? "rgba(245,158,11,0.14)"
          : "rgba(107,114,128,0.12)";

  const pm = payload.breakdown.personnes_morales;
  const pmPoints = pm?.points ?? 0;
  const pmDetail =
    pm === undefined
      ? "(non inclus dans cet ancien calcul de score)"
      : pm.reason === "repertoire_pm"
        ? "Parcelle répertoriée en base personnes morales"
        : "Non répertoriée en base personnes morales";

  const lines: { label: string; points: number; detail: string }[] = [
    {
      label: "Espèces faune",
      points: payload.breakdown.especes.points,
      detail:
        payload.breakdown.especes.reason === "intersection"
          ? "Observation dans la parcelle"
          : payload.breakdown.especes.reason === "adjacent_to_intersection"
            ? "Parcelle adjacente à une parcelle avec observation"
            : payload.breakdown.especes.reason === "within_buffer"
              ? "Observation dans le buffer du filtre"
              : "Hors buffer / aucune observation",
    },
    {
      label: "Distance au centre",
      points: payload.breakdown.distance.points,
      detail: `${payload.breakdown.distance.distance_km?.toFixed(1) ?? "?"} km (${payload.breakdown.distance.bucket ?? "n/a"})`,
    },
    {
      label: "Superficie",
      points: payload.breakdown.surface.points,
      detail: `${payload.breakdown.surface.surface_ha?.toFixed(2) ?? "?"} ha (cible ${payload.breakdown.surface.target_ha?.toFixed(2) ?? "?"} ha)`,
    },
    {
      label: "Arrachage vigne",
      points: payload.breakdown.arrachage.points,
      detail:
        payload.breakdown.arrachage.reason === "renaturation"
          ? "Concernée par arrachage (renaturation)"
          : "N'est pas concernée par l'arrachage de vigne",
    },
    {
      label: "Personnes morales (PPM)",
      points: pmPoints,
      detail: pmDetail,
    },
  ];

  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, background: bg, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: SCORE_TEXT, fontSize: 14 }}>
          Score : {payload.total_score} / {payload.max_score}
        </strong>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {lines.map((l) => (
          <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: SCORE_TEXT, fontSize: 13 }}>
              {l.label} — <span style={{ color: SCORE_TEXT_MUTED }}>{l.detail}</span>
            </span>
            <span className="mono" style={{ color: SCORE_ACCENT, flexShrink: 0 }}>
              +{l.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type EspecesFaunePayload = {
  intersects_any: boolean;
  nearest_species?: string | null;
  selected_species?: string[];
  intersections_by_species?: Record<string, number>;
  intersection_observation_count?: number;
  nearest_observation_distance_m?: number | null;
  buffer_radius_max_m?: number | null;
  within_buffer_any?: boolean;
};

type DureteAxesPayload = {
  axe1?: number | null;
  axe1_note?: string | null;
  axe2?: number | null;
  axe2_note?: string | null;
  axe3?: number | null;
  axe3_note?: string | null;
  axe4?: number | null;
  axe4_note?: string | null;
  surcharges?: number | null;
  surcharges_note?: string | null;
};

type DureteFoncierePayload = {
  eligible: boolean;
  reason?: string | null;
  statut?: string | null;
  siren?: string | null;
  denomination?: string | null;
  forme_juridique?: string | null;
  score_final?: number | null;
  niveau_durete?: string | null;
  explication?: string | null;
  detail_axes?: DureteAxesPayload | null;
  avertissements?: string[];
};

type CompositeScorePayload = {
  score_composite?: number | null;
  eco_score_raw?: number | null;
  eco_score_max?: number | null;
  eco_score_norm?: number | null;
  durete_fonciere?: number | null;
  attractivite_fonciere?: number | null;
  foncier_redhibitoire?: boolean;
  redhibitoire_threshold?: number | null;
};

function parseCompositeScorePayload(v: Record<string, unknown>): CompositeScorePayload | null {
  const score = v.score_composite;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return {
    score_composite: score,
    eco_score_raw: typeof v.eco_score_raw === "number" && Number.isFinite(v.eco_score_raw) ? v.eco_score_raw : null,
    eco_score_max: typeof v.eco_score_max === "number" && Number.isFinite(v.eco_score_max) ? v.eco_score_max : null,
    eco_score_norm: typeof v.eco_score_norm === "number" && Number.isFinite(v.eco_score_norm) ? v.eco_score_norm : null,
    durete_fonciere:
      typeof v.durete_fonciere === "number" && Number.isFinite(v.durete_fonciere) ? v.durete_fonciere : null,
    attractivite_fonciere:
      typeof v.attractivite_fonciere === "number" && Number.isFinite(v.attractivite_fonciere)
        ? v.attractivite_fonciere
        : null,
    foncier_redhibitoire: v.foncier_redhibitoire === true,
    redhibitoire_threshold:
      typeof v.redhibitoire_threshold === "number" && Number.isFinite(v.redhibitoire_threshold)
        ? v.redhibitoire_threshold
        : null,
  };
}

function parseDureteFoncierePayload(v: Record<string, unknown>): DureteFoncierePayload | null {
  if (typeof v.eligible !== "boolean") return null;
  const axesRaw = v.detail_axes;
  const axes =
    axesRaw && typeof axesRaw === "object"
      ? (axesRaw as DureteAxesPayload)
      : null;
  return {
    eligible: v.eligible,
    reason: typeof v.reason === "string" ? v.reason : null,
    statut: typeof v.statut === "string" ? v.statut : null,
    siren: typeof v.siren === "string" ? v.siren : v.siren == null ? null : String(v.siren),
    denomination:
      typeof v.denomination === "string" ? v.denomination : v.denomination == null ? null : String(v.denomination),
    forme_juridique:
      typeof v.forme_juridique === "string"
        ? v.forme_juridique
        : v.forme_juridique == null
          ? null
          : String(v.forme_juridique),
    score_final: typeof v.score_final === "number" && Number.isFinite(v.score_final) ? v.score_final : null,
    niveau_durete:
      typeof v.niveau_durete === "string" ? v.niveau_durete : v.niveau_durete == null ? null : String(v.niveau_durete),
    explication: typeof v.explication === "string" ? v.explication : null,
    detail_axes: axes,
    avertissements: Array.isArray(v.avertissements)
      ? v.avertissements.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function DureteFonciereBlock({ payload }: { payload: DureteFoncierePayload }) {
  if (!payload.eligible) {
    return (
      <p className="ranking-line-empty">
        Non concernée par la dureté foncière (raison: {payload.reason ?? "not_pm"}).
      </p>
    );
  }

  const score = payload.score_final;
  const color =
    typeof score === "number" && Number.isFinite(score)
      ? score >= 81
        ? "#991b1b"
        : score >= 61
          ? "#b45309"
          : score >= 41
            ? "#92400e"
            : score >= 21
              ? "#166534"
              : "#065f46"
      : "#374151";

  const cardBg = "rgba(15, 23, 42, 0.04)";
  const axes = payload.detail_axes;
  const rows =
    axes == null
      ? []
      : [
          { label: "Axe 1", score: axes.axe1, note: axes.axe1_note },
          { label: "Axe 2", score: axes.axe2, note: axes.axe2_note },
          { label: "Axe 3", score: axes.axe3, note: axes.axe3_note },
          { label: "Axe 4", score: axes.axe4, note: axes.axe4_note },
          { label: "Surcharges", score: axes.surcharges, note: axes.surcharges_note },
        ];

  return (
    <div
      className="ranking-metric-vegetation ranking-metric-vegetation--carhab"
      style={{ border: `1px solid ${color}`, borderRadius: 8, background: cardBg, padding: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color, fontSize: 14 }}>
          Score dureté: {score ?? "?"}/100
        </strong>
        <span className="mono" style={{ color: "#374151", fontSize: 12 }}>
          {payload.niveau_durete ?? "niveau inconnu"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        <div>
          <span style={{ color: "#6b7280" }}>SIREN</span>{" "}
          <span className="mono" style={{ color: "#111827" }}>
            {payload.siren ?? "—"}
          </span>
        </div>
        <div>
          <span style={{ color: "#6b7280" }}>Dénomination</span>{" "}
          <span style={{ color: "#111827" }}>{payload.denomination ?? "—"}</span>
        </div>
        <div>
          <span style={{ color: "#6b7280" }}>Forme juridique</span>{" "}
          <span style={{ color: "#111827" }}>{payload.forme_juridique ?? "—"}</span>
        </div>
      </div>

      {!!rows.length && (
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#111827", fontSize: 13 }}>
                {r.label} — <span style={{ color: "#4b5563" }}>{r.note ?? "non renseigné"}</span>
              </span>
              <span className="mono" style={{ color: "#111827", flexShrink: 0 }}>
                {typeof r.score === "number" ? r.score : "?"}
              </span>
            </div>
          ))}
        </div>
      )}

      {payload.explication && (
        <p className="ranking-line-empty" style={{ marginBottom: 0 }}>
          {payload.explication}
        </p>
      )}
    </div>
  );
}

function CompositeScoreBlock({ payload }: { payload: CompositeScorePayload }) {
  const score = payload.score_composite ?? null;
  const redhib = payload.foncier_redhibitoire === true;
  const color = redhib ? "#991b1b" : score != null && score >= 75 ? "#166534" : score != null && score >= 55 ? "#15803d" : "#374151";
  const bg = redhib ? "rgba(127,29,29,0.08)" : "rgba(15, 23, 42, 0.04)";
  const threshold = payload.redhibitoire_threshold ?? 20;

  return (
    <div
      className="ranking-metric-vegetation ranking-metric-vegetation--carhab"
      style={{ border: `1px solid ${color}`, borderRadius: 8, background: bg, padding: 10 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color, fontSize: 14 }}>
          Score composite: {score == null ? "?" : score.toFixed(1)}/100
        </strong>
        {redhib && (
          <span className="mono" style={{ color: "#991b1b", fontSize: 12 }}>
            Dureté rédhibitoire
          </span>
        )}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div>
          <span style={{ color: "#6b7280" }}>Score éco normalisé</span>{" "}
          <span className="mono" style={{ color: "#111827" }}>
            {payload.eco_score_norm == null ? "—" : `${payload.eco_score_norm.toFixed(1)}/100`}
          </span>
          <span style={{ color: "#6b7280" }}>
            {" "}
            ({payload.eco_score_raw ?? "?"}/{payload.eco_score_max ?? "?"})
          </span>
        </div>
        <div>
          <span style={{ color: "#6b7280" }}>Attractivité foncière</span>{" "}
          <span className="mono" style={{ color: "#111827" }}>
            {payload.attractivite_fonciere == null ? "—" : `${payload.attractivite_fonciere.toFixed(1)}/100`}
          </span>
          <span style={{ color: "#6b7280" }}>
            {" "}
            (dureté {payload.durete_fonciere == null ? "—" : `${payload.durete_fonciere.toFixed(1)}/100`})
          </span>
        </div>
        {redhib && (
          <p className="ranking-line-empty" style={{ margin: 0 }}>
            Attractivité foncière &lt; {threshold}/100: parcelle marquée comme potentiellement rédhibitoire.
          </p>
        )}
      </div>
    </div>
  );
}

function parseEspecesFaunePayload(v: Record<string, unknown>): EspecesFaunePayload | null {
  if (typeof v.intersects_any !== "boolean") return null;
  const rawInter = v.intersections_by_species;
  const intersections_by_species: Record<string, number> = {};
  if (rawInter && typeof rawInter === "object") {
    for (const [k, val] of Object.entries(rawInter)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) intersections_by_species[k] = val;
    }
  }
  return {
    intersects_any: v.intersects_any,
    nearest_species: typeof v.nearest_species === "string" ? v.nearest_species : null,
    selected_species: Array.isArray(v.selected_species)
      ? v.selected_species.filter((x): x is string => typeof x === "string")
      : [],
    intersections_by_species,
    intersection_observation_count:
      typeof v.intersection_observation_count === "number" && Number.isFinite(v.intersection_observation_count)
        ? v.intersection_observation_count
        : 0,
    nearest_observation_distance_m:
      typeof v.nearest_observation_distance_m === "number" && Number.isFinite(v.nearest_observation_distance_m)
        ? v.nearest_observation_distance_m
        : null,
    buffer_radius_max_m:
      typeof v.buffer_radius_max_m === "number" && Number.isFinite(v.buffer_radius_max_m) ? v.buffer_radius_max_m : null,
    within_buffer_any: v.within_buffer_any === true,
  };
}

function EspecesFauneBlock({ payload }: { payload: EspecesFaunePayload }) {
  const entries = Object.entries(payload.intersections_by_species ?? {}).sort((a, b) => b[1] - a[1]);
  const isGreen = payload.intersects_any;
  const isOrange = !payload.intersects_any && payload.within_buffer_any;
  const cardBg = isGreen ? "rgba(22, 163, 74, 0.16)" : isOrange ? "rgba(245, 158, 11, 0.18)" : "rgba(55, 65, 81, 0.22)";
  const cardBorder = isGreen ? "#16a34a" : isOrange ? "#f59e0b" : "#4b5563";
  const badgeBg = isGreen ? "#166534" : isOrange ? "#92400e" : "#374151";
  const badgeColor = isGreen ? "#dcfce7" : isOrange ? "#ffedd5" : "#e5e7eb";
  const statusLabel = isGreen ? "✓ Validation" : isOrange ? "⚠ Proximité buffer" : "Aucune proximité";
  const scoreLabel = isGreen ? "Score +3" : isOrange ? "Score +2" : null;

  return (
    <div
      className="ranking-metric-vegetation ranking-metric-vegetation--carhab"
      style={{ border: `1px solid ${cardBorder}`, borderRadius: 8, background: cardBg, padding: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span
          className="mono"
          style={{ background: badgeBg, color: badgeColor, borderRadius: 999, padding: "3px 10px", fontSize: 12 }}
        >
          {statusLabel}
        </span>
        {scoreLabel && (
          <span className="mono" style={{ color: badgeColor, background: badgeBg, borderRadius: 999, padding: "3px 10px", fontSize: 12 }}>
            {scoreLabel}
          </span>
        )}
      </div>

      <p
        className="ranking-line-empty"
        style={{
          marginBottom: 8,
          color: isGreen ? "#166534" : isOrange ? "#9a3412" : "#374151",
        }}
      >
        {isGreen
          ? "Excellente correspondance : la parcelle intersecte des observations des espèces ciblées."
          : isOrange
            ? "Pas d'intersection directe, mais une observation est présente dans le buffer du filtre."
            : "La parcelle n’intersecte aucune observation des espèces sélectionnées."}
      </p>

      {payload.nearest_observation_distance_m != null && (
        <p className="ranking-line-empty" style={{ marginBottom: 8 }}>
          Observation la plus proche :{" "}
          <span className="mono">
            {payload.nearest_observation_distance_m.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m
          </span>
          {payload.nearest_species ? ` (${payload.nearest_species})` : ""}
          {payload.buffer_radius_max_m != null ? (
            <>
              {" "}
              • rayon max filtre :{" "}
              <span className="mono">
                {payload.buffer_radius_max_m.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m
              </span>
            </>
          ) : null}
        </p>
      )}

      {!!entries.length && (
        <div className="veg-carhab-histo" role="list" aria-label="Observations intersectées par espèce">
          {entries.map(([label, count]) => (
            <div key={label} className="veg-carhab-row" role="listitem">
              <span className="veg-carhab-label" title={label}>
                {label}
              </span>
              <span className="veg-carhab-stats mono">{count} obs.</span>
            </div>
          ))}
        </div>
      )}
    </div>
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

  const metricsOrdered = sortMetricsForDisplay(
    metrics.filter((row) => row.metric_key !== "parcelles_personnes_morales"),
  );

  return (
    <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
      <div className="ranking-metrics-stack">
        {metricsOrdered.map((row) => {
          const title = METRIC_LABELS[row.metric_key] ?? row.metric_key;
          const val = row.metric_value_jsonb ?? {};
          const isZonageRatio =
            row.metric_key === "vegetation_hybride_ratio" ||
            row.metric_key === "cosia_zonage_ratio" ||
            row.metric_key === "carhab_eunis_ratio" ||
            row.metric_key === "arrachage_vignes_ratio";
          const zonagePayload = isZonageRatio ? parseVegetationPayload(val) : null;
          const scorePayload = row.metric_key === "parcel_score_v1" ? parseParcelScorePayload(val) : null;
          const compositePayload = row.metric_key === "composite_score_v1" ? parseCompositeScorePayload(val) : null;
          const especesFaunePayload = row.metric_key === "especes_faune" ? parseEspecesFaunePayload(val) : null;
          const dureteFoncierePayload =
            row.metric_key === "durete_fonciere" ? parseDureteFoncierePayload(val) : null;

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
                      : row.metric_key === "arrachage_vignes_ratio"
                        ? {
                            emptyMessage: "Aucune intersection mesurée avec la couche arrachage de vignes.",
                            totalLineLabel: "Surface parcelle (référence des % arrachage) :",
                            variant: "carhab_independent" as const,
                          }
                      : {})}
                />
              ) : scorePayload ? (
                <ScoreBlock payload={scorePayload} />
              ) : compositePayload ? (
                <CompositeScoreBlock payload={compositePayload} />
              ) : especesFaunePayload ? (
                <EspecesFauneBlock payload={especesFaunePayload} />
              ) : dureteFoncierePayload ? (
                <DureteFonciereBlock payload={dureteFoncierePayload} />
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
