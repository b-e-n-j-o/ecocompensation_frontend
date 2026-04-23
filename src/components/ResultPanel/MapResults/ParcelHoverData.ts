import type { ParcelPoolMetricRow } from "../../../types";

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
    personnes_morales?: ParcelScoreBreakdownItem;
  };
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
  score_final?: number | null;
  niveau_durete?: string | null;
  explication?: string | null;
  siren?: string | null;
  denomination?: string | null;
  detail_axes?: DureteAxesPayload | null;
};

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function parseDureteFoncierePayload(v: Record<string, unknown>): DureteFoncierePayload | null {
  if (typeof v.eligible !== "boolean") return null;
  const axesRaw = v.detail_axes;
  const axes = axesRaw && typeof axesRaw === "object" ? (axesRaw as DureteAxesPayload) : null;
  return {
    eligible: v.eligible,
    score_final: typeof v.score_final === "number" && Number.isFinite(v.score_final) ? v.score_final : null,
    niveau_durete: typeof v.niveau_durete === "string" ? v.niveau_durete : null,
    explication: typeof v.explication === "string" ? v.explication : null,
    siren: typeof v.siren === "string" ? v.siren : null,
    denomination: typeof v.denomination === "string" ? v.denomination : null,
    detail_axes: axes,
  };
}

export function buildParcelHoverHtml(
  idu: string,
  metrics: ParcelPoolMetricRow[] | null | undefined,
  scoreRatio?: number | null,
): string {
  const scoreRow = metrics?.find((m) => m.metric_key === "score_eco");
  const scorePayload = scoreRow ? parseParcelScorePayload(scoreRow.metric_value_jsonb ?? {}) : null;
  const dureteRow = metrics?.find((m) => m.metric_key === "durete_fonciere");
  const duretePayload = dureteRow ? parseDureteFoncierePayload(dureteRow.metric_value_jsonb ?? {}) : null;
  const normFromScore =
    scorePayload && scorePayload.max_score > 0 && Number.isFinite(scorePayload.total_score)
      ? scorePayload.total_score / scorePayload.max_score
      : 0;
  const norm = typeof scoreRatio === "number" && Number.isFinite(scoreRatio) ? scoreRatio : normFromScore;
  const ecoColor = norm >= 0.8 ? "#166534" : norm >= 0.5 ? "#16a34a" : norm >= 0.2 ? "#f59e0b" : "#6b7280";
  const ecoBg =
    norm >= 0.8
      ? "rgba(22,101,52,0.14)"
      : norm >= 0.5
        ? "rgba(22,163,74,0.12)"
        : norm >= 0.2
          ? "rgba(245,158,11,0.14)"
          : "rgba(107,114,128,0.12)";
  const ecoAccent = norm >= 0.8 ? "#14532d" : norm >= 0.5 ? "#15803d" : norm >= 0.2 ? "#b45309" : "#4b5563";

  let ecoDetails = `<div style="font-size:11.5px;color:#4b5563">Score non disponible</div>`;
  if (scorePayload) {
    const pm = scorePayload.breakdown.personnes_morales;
    const pmPoints = pm?.points ?? 0;
    const pmDetail =
      pm === undefined
        ? "(non inclus dans cet ancien calcul de score)"
        : pm.reason === "repertoire_pm"
          ? "Parcelle repertoriee en base personnes morales"
          : "Non repertoriee en base personnes morales";
    const lines: { label: string; detail: string; points: number }[] = [
      {
        label: "Especes",
        points: scorePayload.breakdown.especes.points,
        detail:
          scorePayload.breakdown.especes.reason === "intersection"
            ? "Observation dans la parcelle"
            : scorePayload.breakdown.especes.reason === "adjacent_to_intersection"
              ? "Parcelle adjacente a une parcelle avec observation"
              : scorePayload.breakdown.especes.reason === "within_buffer"
                ? "Observation dans le buffer du filtre"
                : "Hors buffer / aucune observation",
      },
      {
        label: "Distance",
        points: scorePayload.breakdown.distance.points,
        detail: `${scorePayload.breakdown.distance.distance_km?.toFixed(1) ?? "?"} km (${scorePayload.breakdown.distance.bucket ?? "n/a"})`,
      },
      {
        label: "Surface",
        points: scorePayload.breakdown.surface.points,
        detail: `${scorePayload.breakdown.surface.surface_ha?.toFixed(2) ?? "?"} ha (cible ${scorePayload.breakdown.surface.target_ha?.toFixed(2) ?? "?"} ha)`,
      },
      {
        label: "Arrachage",
        points: scorePayload.breakdown.arrachage.points,
        detail:
          scorePayload.breakdown.arrachage.reason === "renaturation"
            ? "Concernee (renaturation)"
            : "Non concernee",
      },
      {
        label: "PPM",
        points: pmPoints,
        detail: pmDetail,
      },
    ];
    ecoDetails = lines
      .map(
        (l) => `
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;line-height:1.2">
        <span style="color:#111827;font-size:11.5px">${escapeHtml(l.label)} - <span style="color:#4b5563">${escapeHtml(l.detail)}</span></span>
        <span class="mono" style="color:${ecoAccent};flex-shrink:0">+${escapeHtml(l.points)}</span>
      </div>`,
      )
      .join("");
  }

  const foncierColor =
    duretePayload?.score_final == null
      ? "#6b7280"
      : duretePayload.score_final >= 81
        ? "#991b1b"
        : duretePayload.score_final >= 61
          ? "#b45309"
          : duretePayload.score_final >= 41
            ? "#92400e"
            : duretePayload.score_final >= 21
              ? "#166534"
              : "#065f46";
  const foncierBg = "rgba(15,23,42,0.04)";
  const foncierAxes = duretePayload?.detail_axes
    ? [
        ["A1", duretePayload.detail_axes.axe1, duretePayload.detail_axes.axe1_note],
        ["A2", duretePayload.detail_axes.axe2, duretePayload.detail_axes.axe2_note],
        ["A3", duretePayload.detail_axes.axe3, duretePayload.detail_axes.axe3_note],
        ["A4", duretePayload.detail_axes.axe4, duretePayload.detail_axes.axe4_note],
        ["S", duretePayload.detail_axes.surcharges, duretePayload.detail_axes.surcharges_note],
      ]
    : [];
  const foncierAxesHtml = foncierAxes
    .map(
      ([label, val, note]) => `
      <div style="display:flex;justify-content:space-between;gap:6px;line-height:1.2">
        <span style="font-size:11.5px;color:#111827">${escapeHtml(label)} - <span style="color:#4b5563">${escapeHtml(note ?? "non renseigné")}</span></span>
        <span class="mono" style="font-size:11.5px;color:#111827;flex-shrink:0">${escapeHtml(typeof val === "number" ? val : "?")}</span>
      </div>`,
    )
    .join("");

  const foncierDetails =
    duretePayload && duretePayload.eligible
      ? `<div style="display:grid;gap:2px;margin-bottom:6px">
          <div style="font-size:11px;color:#4b5563">SIREN: <span class="mono">${escapeHtml(duretePayload.siren ?? "—")}</span></div>
          <div style="font-size:11px;color:#4b5563">PM: ${escapeHtml(duretePayload.denomination ?? "—")}</div>
        </div>
        <div style="display:grid;gap:4px">${foncierAxesHtml}</div>`
      : `<div style="font-size:11.5px;color:#4b5563">Score foncier non disponible pour cette parcelle.</div>`;

  return `<div style="font-size:12px">
    <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Parcelle <span class="mono">${escapeHtml(idu)}</span></div>
    <div style="display:flex;gap:8px;align-items:stretch">
      <div style="flex:1;min-width:0;border:1px solid ${ecoColor};border-radius:8px;background:${ecoBg};padding:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:#111827;font-size:12.5px">Eco : ${escapeHtml(scorePayload ? `${scorePayload.total_score} / ${scorePayload.max_score}` : "? / ?")}</strong>
        </div>
        <div style="display:grid;gap:5px">${ecoDetails}</div>
      </div>
      <div style="flex:1;min-width:0;border:1px solid ${foncierColor};border-radius:8px;background:${foncierBg};padding:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="color:${foncierColor};font-size:12.5px">${
            duretePayload && duretePayload.eligible
              ? `Foncier : ${escapeHtml(duretePayload.score_final ?? "?")}/100`
              : "Foncier : parcelle a proprietaire prive, non personne morale"
          }</strong>
          <span class="mono" style="font-size:11px;color:#374151">${escapeHtml(duretePayload?.niveau_durete ?? "niveau inconnu")}</span>
        </div>
        ${foncierDetails}
      </div>
    </div>
  </div>`;
}

