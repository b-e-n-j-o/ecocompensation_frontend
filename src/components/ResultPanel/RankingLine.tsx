// ─── RankingLine — détail enrichissement filter_v2 ────────────────────────────
import type { ParcelPoolMetricRow } from "../../types";
import type { FilterEnrichPayload } from "../../utils/poolMetrics";
import {
  type CompositeScoreMetric,
  type DureteFonciereMetric,
  dureteSkipReasonLabel,
  getCompositeScoreMetric,
  getDureteFonciereMetric,
} from "../../utils/poolMetrics";

/** Métriques affichées dans le détail de ligne (filter_v2). */
const VISIBLE_METRIC_KEYS = new Set([
  "filter_enrich",
  "score_eco",
  "parcelles_personnes_morales",
  "durete_fonciere",
  "composite_score_v1",
]);

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

export function parseFilterEnrichPayload(v: Record<string, unknown>): FilterEnrichPayload | null {
  const veg = v.veg_libelles;
  const fauna = v.fauna_distances;
  const troncons = v.troncons_hydro_info;
  const veg_libelles = Array.isArray(veg)
    ? veg.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const fauna_distances: Record<string, number> = {};
  if (fauna && typeof fauna === "object") {
    for (const [k, val] of Object.entries(fauna)) {
      const n = typeof val === "number" ? val : Number(val);
      if (k.trim() && Number.isFinite(n) && n >= 0) fauna_distances[k.trim()] = n;
    }
  }
  const troncons_hydro_info = Array.isArray(troncons)
    ? troncons.filter((x) => x && typeof x === "object") as FilterEnrichPayload["troncons_hydro_info"]
    : [];
  const surfaces = v.surfaces_hydro_info;
  const surfaces_hydro_info = Array.isArray(surfaces)
    ? surfaces.filter((x) => x && typeof x === "object") as FilterEnrichPayload["surfaces_hydro_info"]
    : [];
  const dist_hydro_m = typeof v.dist_hydro_m === "number" && Number.isFinite(v.dist_hydro_m)
    ? v.dist_hydro_m
    : undefined;
  const dist_surface_hydro_m = typeof v.dist_surface_hydro_m === "number" && Number.isFinite(v.dist_surface_hydro_m)
    ? v.dist_surface_hydro_m
    : undefined;
  const zone_humide_ha = typeof v.zone_humide_ha === "number" && Number.isFinite(v.zone_humide_ha)
    ? v.zone_humide_ha
    : undefined;
  const surface_hydro_ha = typeof v.surface_hydro_ha === "number" && Number.isFinite(v.surface_hydro_ha)
    ? v.surface_hydro_ha
    : undefined;
  if (
    !veg_libelles.length
    && !Object.keys(fauna_distances).length
    && !troncons_hydro_info?.length
    && !surfaces_hydro_info?.length
    && dist_hydro_m == null
    && dist_surface_hydro_m == null
    && zone_humide_ha == null
    && surface_hydro_ha == null
  ) {
    return null;
  }
  return {
    veg_libelles,
    fauna_distances,
    troncons_hydro_info,
    surfaces_hydro_info,
    dist_hydro_m,
    dist_surface_hydro_m,
    zone_humide_ha,
    surface_hydro_ha,
  };
}

function faunaDistanceTone(distM: number): { bg: string; border: string; label: string } {
  if (distM <= 0) return { bg: "rgba(22,163,74,0.16)", border: "#16a34a", label: "Intersection" };
  if (distM <= 500) return { bg: "rgba(22,163,74,0.12)", border: "#22c55e", label: "Très proche" };
  if (distM <= 1000) return { bg: "rgba(245,158,11,0.14)", border: "#f59e0b", label: "Proche" };
  return { bg: "rgba(107,114,128,0.12)", border: "#9ca3af", label: "Éloignée" };
}

export function FilterEnrichBlock({ payload }: { payload: FilterEnrichPayload }) {
  const vegLabels = payload.veg_libelles ?? [];
  const faunaEntries = Object.entries(payload.fauna_distances ?? {}).sort((a, b) => a[1] - b[1]);
  const maxFaunaDist = faunaEntries.length ? Math.max(...faunaEntries.map(([, d]) => d), 1) : 1;
  const troncons = payload.troncons_hydro_info ?? [];
  const surfaces = payload.surfaces_hydro_info ?? [];

  return (
    <div className="filter-enrich-block">
      <div className="filter-enrich-section">
        <div className="filter-enrich-section-head">
          <span className="filter-enrich-section-title">Végétation CESBIO</span>
          <span className="filter-enrich-section-count mono">
            {vegLabels.length ? `${vegLabels.length} libellé(s)` : "—"}
          </span>
        </div>
        {vegLabels.length ? (
          <ul className="filter-enrich-cesbio-list" aria-label="Libellés CESBIO intersectant la parcelle">
            {vegLabels.map((label) => {
              const { fill, border } = colorForZonageLabel(label);
              return (
                <li key={label} className="filter-enrich-cesbio-chip" style={{ borderColor: border, background: fill }}>
                  {label}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ranking-line-empty">Aucun libellé CESBIO du filtre sur cette parcelle.</p>
        )}
      </div>

      <div className="filter-enrich-section">
        <div className="filter-enrich-section-head">
          <span className="filter-enrich-section-title">Faune (filtre)</span>
          <span className="filter-enrich-section-count mono">
            {faunaEntries.length ? `${faunaEntries.length} espèce(s)` : "—"}
          </span>
        </div>
        {faunaEntries.length ? (
          <ul className="filter-enrich-fauna-list" aria-label="Distances aux observations par espèce">
            {faunaEntries.map(([species, distM]) => {
              const tone = faunaDistanceTone(distM);
              const pct = Math.max(4, Math.round((1 - distM / maxFaunaDist) * 100));
              return (
                <li key={species} className="filter-enrich-fauna-row">
                  <div className="filter-enrich-fauna-row-head">
                    <span className="filter-enrich-fauna-species" title={species}>
                      {species}
                    </span>
                    <span
                      className="filter-enrich-fauna-badge mono"
                      style={{ background: tone.bg, borderColor: tone.border, color: "#111827" }}
                    >
                      {distM <= 0 ? "0 m · intersection" : `${Math.round(distM).toLocaleString("fr-FR")} m`}
                    </span>
                  </div>
                  <div className="filter-enrich-fauna-bar-track" aria-hidden>
                    <div
                      className="filter-enrich-fauna-bar-fill"
                      style={{ width: `${pct}%`, background: tone.border }}
                    />
                  </div>
                  <span className="filter-enrich-fauna-hint">{tone.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ranking-line-empty">Aucune distance faune enregistrée pour cette parcelle.</p>
        )}
      </div>

      {(payload.dist_hydro_m != null || troncons.length > 0) && (
        <div className="filter-enrich-section">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Cours d&apos;eau (tronçons hydro)</span>
            <span className="filter-enrich-section-count mono">
              {payload.dist_hydro_m != null
                ? `${Math.round(payload.dist_hydro_m).toLocaleString("fr-FR")} m`
                : "—"}
            </span>
          </div>
          {troncons.length ? (
            <ul className="filter-enrich-fauna-list" aria-label="Tronçons hydro retenus par le filtre">
              {troncons.map((t, idx) => {
                const label = t.nom?.trim() || t.nature?.trim() || t.cleabs || `Tronçon ${idx + 1}`;
                const distM = typeof t.dist_m === "number" ? t.dist_m : payload.dist_hydro_m ?? 0;
                const tone = faunaDistanceTone(distM);
                return (
                  <li key={`${t.cleabs ?? idx}-${label}`} className="filter-enrich-fauna-row">
                    <div className="filter-enrich-fauna-row-head">
                      <span className="filter-enrich-fauna-species" title={label}>
                        {label}
                      </span>
                      <span
                        className="filter-enrich-fauna-badge mono"
                        style={{ background: tone.bg, borderColor: tone.border, color: "#111827" }}
                      >
                        {distM <= 0 ? "0 m · intersection" : `${Math.round(distM).toLocaleString("fr-FR")} m`}
                      </span>
                    </div>
                    <p className="filter-enrich-fauna-hint">
                      {[t.nature, t.classe_de_largeur, t.numero_d_ordre != null ? `ordre ${t.numero_d_ordre}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Attributs non renseignés"}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ranking-line-empty">Distance au cours d&apos;eau la plus proche enregistrée.</p>
          )}
        </div>
      )}

      {(payload.dist_surface_hydro_m != null || payload.surface_hydro_ha != null || surfaces.length > 0) && (
        <div className="filter-enrich-section">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Surfaces hydrographiques</span>
            <span className="filter-enrich-section-count mono">
              {typeof payload.surface_hydro_ha === "number" && payload.surface_hydro_ha > 0
                ? `${payload.surface_hydro_ha.toFixed(2)} ha intersectés`
                : payload.dist_surface_hydro_m != null
                  ? `${Math.round(payload.dist_surface_hydro_m).toLocaleString("fr-FR")} m`
                  : "—"}
            </span>
          </div>
          {surfaces.length ? (
            <ul className="filter-enrich-fauna-list" aria-label="Surfaces hydro retenues par le filtre">
              {surfaces.map((s, idx) => {
                const label = s.nom?.trim() || s.nature?.trim() || s.cleabs || `Surface ${idx + 1}`;
                const distM = typeof s.dist_m === "number" ? s.dist_m : payload.dist_surface_hydro_m ?? 0;
                const tone = faunaDistanceTone(distM);
                return (
                  <li key={`${s.cleabs ?? idx}-${label}`} className="filter-enrich-fauna-row">
                    <div className="filter-enrich-fauna-row-head">
                      <span className="filter-enrich-fauna-species" title={label}>
                        {label}
                      </span>
                      <span
                        className="filter-enrich-fauna-badge mono"
                        style={{ background: tone.bg, borderColor: tone.border, color: "#111827" }}
                      >
                        {typeof s.intersect_ha === "number" && s.intersect_ha > 0
                          ? `${s.intersect_ha.toFixed(2)} ha`
                          : distM <= 0
                            ? "0 m · intersection"
                            : `${Math.round(distM).toLocaleString("fr-FR")} m`}
                      </span>
                    </div>
                    <p className="filter-enrich-fauna-hint">
                      {[s.nature, s.position_par_rapport_au_sol, s.statut]
                        .filter(Boolean)
                        .join(" · ") || "Attributs non renseignés"}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ranking-line-empty">Distance ou surface hydro enregistrée pour cette parcelle.</p>
          )}
        </div>
      )}
    </div>
  );
}

type ParcelScoreBreakdownItem = {
  points: number;
  reason?: string;
  distance_km?: number;
  bucket?: string;
  nearest_observation_distance_m?: number;
  buffer_radius_max_m?: number;
  buffer_half_m?: number;
};

export type ParcelScorePayload = {
  total_score: number;
  max_score: number;
  breakdown: {
    especes: ParcelScoreBreakdownItem;
    distance: ParcelScoreBreakdownItem;
  };
};

export function parseParcelScorePayload(v: Record<string, unknown>): ParcelScorePayload | null {
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
      nearest_observation_distance_m:
        typeof rec.nearest_observation_distance_m === "number" && Number.isFinite(rec.nearest_observation_distance_m)
          ? rec.nearest_observation_distance_m
          : undefined,
      buffer_radius_max_m:
        typeof rec.buffer_radius_max_m === "number" && Number.isFinite(rec.buffer_radius_max_m)
          ? rec.buffer_radius_max_m
          : undefined,
      buffer_half_m:
        typeof rec.buffer_half_m === "number" && Number.isFinite(rec.buffer_half_m) ? rec.buffer_half_m : undefined,
    };
  };

  return {
    total_score: v.total_score,
    max_score: v.max_score,
    breakdown: {
      especes: getItem("especes"),
      distance: getItem("distance"),
    },
  };
}

/** Texte lisible sur fond clair (évite blanc sur blanc). */
const SCORE_TEXT = "#111827";
const SCORE_TEXT_MUTED = "#4b5563";
const SCORE_ACCENT = "#15803d";

export function ScoreBlock({ payload }: { payload: ParcelScorePayload }) {
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

  const es = payload.breakdown.especes;
  const esDetail = (() => {
    const r = es.reason;
    if (r === "intersection") return "Observation dans la parcelle";
    if (r === "within_half_buffer") {
      const d = es.nearest_observation_distance_m;
      const h = es.buffer_half_m;
      return `Plus proche observation ≤ demi-buffer (${d != null ? `${Math.round(d)} m` : "?"} / ${h != null ? `${Math.round(h)} m` : "?"})`;
    }
    if (r === "within_buffer") {
      const d = es.nearest_observation_distance_m;
      const b = es.buffer_radius_max_m;
      return `Plus proche observation dans le buffer (${d != null ? `${Math.round(d)} m` : "?"} ≤ ${b != null ? `${Math.round(b)} m` : "?"})`;
    }
    if (r === "beyond_buffer") return "Observation au-delà du buffer du filtre";
    if (r === "no_faune_criteria") return "Aucune espèce ciblée dans le filtre";
    if (r === "no_buffer_in_filter") return "Buffer non défini (mode filtre sans rayon)";
    if (r === "no_observation") return "Pas d'observation géolocalisée pour les espèces du filtre";
    const sp = (es as { nearest_species?: string }).nearest_species;
    if (sp && es.nearest_observation_distance_m != null) {
      return `Plus proche : ${sp} (${Math.round(es.nearest_observation_distance_m)} m)`;
    }
    return "Hors critères";
  })();

  const lines: { label: string; points: number; detail: string }[] = [
    {
      label: "Espèces faune (proximité)",
      points: es.points,
      detail: esDetail,
    },
    {
      label: "Distance au projet",
      points: payload.breakdown.distance.points,
      detail: `${payload.breakdown.distance.distance_km?.toFixed(1) ?? "?"} km (${payload.breakdown.distance.bucket ?? "n/a"})`,
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

export type PersonnesMoralesPayload = {
  intersects_pm_database: boolean;
  siren?: string | null;
  denomination?: string | null;
  forme_juridique?: string | null;
  compensation_deja_realisee: boolean;
  parcelle_deja_en_mc?: boolean | null;
  nb_mc_distinctes?: number | null;
  nb_parcelles_deja_en_mc?: number | null;
  surface_deja_en_mc_m2?: number | null;
};

function parseOptionalInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  return null;
}

export function parsePersonnesMoralesPayload(v: Record<string, unknown>): PersonnesMoralesPayload {
  const intersects = v.intersects_pm_database === true;
  const compensation = v.compensation_deja_realisee === true;
  return {
    intersects_pm_database: intersects,
    siren: typeof v.siren === "string" ? v.siren : v.siren == null ? null : String(v.siren),
    denomination:
      typeof v.denomination === "string" ? v.denomination : v.denomination == null ? null : String(v.denomination),
    forme_juridique:
      typeof v.forme_juridique === "string"
        ? v.forme_juridique
        : v.forme_juridique == null
          ? null
          : String(v.forme_juridique),
    compensation_deja_realisee: compensation,
    parcelle_deja_en_mc: typeof v.parcelle_deja_en_mc === "boolean" ? v.parcelle_deja_en_mc : null,
    nb_mc_distinctes: parseOptionalInt(v.nb_mc_distinctes),
    nb_parcelles_deja_en_mc: parseOptionalInt(v.nb_parcelles_deja_en_mc),
    surface_deja_en_mc_m2:
      typeof v.surface_deja_en_mc_m2 === "number" && Number.isFinite(v.surface_deja_en_mc_m2)
        ? v.surface_deja_en_mc_m2
        : null,
  };
}

function formatCountFr(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("fr-FR");
}

function formatSurfaceM2Fr(m2: number | null | undefined): string {
  return m2 == null ? "—" : `${m2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²`;
}

export function PersonnesMoralesBlock({ payload }: { payload: PersonnesMoralesPayload }) {
  const compensation = payload.compensation_deja_realisee === true;
  const borderColor = compensation ? "#b45309" : payload.intersects_pm_database ? "#1d4ed8" : "#d1d5db";
  const bg = compensation ? "rgba(180, 83, 9, 0.08)" : "rgba(15, 23, 42, 0.04)";

  return (
    <div
      className="ranking-metric-vegetation ranking-metric-vegetation--carhab"
      style={{ border: `1px solid ${borderColor}`, borderRadius: 8, background: bg, padding: 10 }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div>
          <span style={{ color: "#6b7280" }}>Répertoire personnes morales</span>{" "}
          <strong style={{ color: payload.intersects_pm_database ? "#1d4ed8" : "#6b7280" }}>
            {payload.intersects_pm_database ? "Oui" : "Non"}
          </strong>
        </div>
        {payload.intersects_pm_database && (
          <>
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
          </>
        )}
        <div>
          <span style={{ color: "#6b7280" }}>Propriétaire ayant déjà compensé (autre foncier)</span>{" "}
          <strong style={{ color: compensation ? "#b45309" : "#6b7280" }}>{compensation ? "Oui" : "Non"}</strong>
        </div>
        {compensation && (
          <>
            {payload.parcelle_deja_en_mc != null && (
              <div>
                <span style={{ color: "#6b7280" }}>Cette parcelle déjà en mesure de compensation</span>{" "}
                <span style={{ color: "#111827" }}>{payload.parcelle_deja_en_mc ? "Oui" : "Non"}</span>
              </div>
            )}
            <div>
              <span style={{ color: "#6b7280" }}>Mesures compensatoires distinctes (propriétaire)</span>{" "}
              <span className="mono" style={{ color: "#111827" }}>
                {formatCountFr(payload.nb_mc_distinctes)}
              </span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Parcelles du propriétaire déjà en MC</span>{" "}
              <span className="mono" style={{ color: "#111827" }}>
                {formatCountFr(payload.nb_parcelles_deja_en_mc)}
              </span>
            </div>
            <div>
              <span style={{ color: "#6b7280" }}>Surface totale concernée par les MC (propriétaire)</span>{" "}
              <span className="mono" style={{ color: "#111827" }}>
                {formatSurfaceM2Fr(payload.surface_deja_en_mc_m2)}
              </span>
            </div>
            <p className="ranking-line-empty" style={{ margin: 0 }}>
              Parcelle issue de la liste filtrée des prospects dont le propriétaire a déjà exercé de la
              compensation sur d’autres parcelles.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function formatDureteAxis(label: string, score: number | null | undefined, note: string | null | undefined) {
  if (score == null || !Number.isFinite(score)) return null;
  return (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color: "#111827", fontSize: 13 }}>
        {label} — <span style={{ color: "#4b5563" }}>{note?.trim() || "—"}</span>
      </span>
      <span className="mono" style={{ color: "#5b21b6", flexShrink: 0 }}>
        {Math.round(score)}/100
      </span>
    </div>
  );
}

export function DureteFonciereBlock({ payload }: { payload: DureteFonciereMetric }) {
  if (!payload.eligible) {
    return (
      <p className="ranking-line-empty" style={{ margin: 0 }}>
        Dureté foncière non calculée : {dureteSkipReasonLabel(payload.reason)}.
      </p>
    );
  }

  const score = payload.score_final;
  const style = score != null && score >= 61 ? "#991b1b" : score != null && score >= 41 ? "#b45309" : "#166534";
  const bg =
    score != null && score >= 61
      ? "rgba(153,27,27,0.08)"
      : score != null && score >= 41
        ? "rgba(180,83,9,0.08)"
        : "rgba(22,101,52,0.08)";
  const axes = payload.detail_axes;
  const axisLines = axes
    ? [
        formatDureteAxis("Axe 1 — Structure", axes.axe1, axes.axe1_note),
        formatDureteAxis("Axe 2 — Dynamique", axes.axe2, axes.axe2_note),
        formatDureteAxis("Axe 3 — Contexte", axes.axe3, axes.axe3_note),
        formatDureteAxis("Axe 4 — Risques", axes.axe4, axes.axe4_note),
        formatDureteAxis("Surcharges", axes.surcharges, axes.surcharges_note),
      ].filter(Boolean)
    : [];

  return (
    <div style={{ border: `1px solid ${style}`, borderRadius: 8, background: bg, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ color: "#111827", fontSize: 14 }}>
          Dureté : {score != null ? `${Math.round(score)}/100` : "—"}
        </strong>
        <span style={{ color: style, fontSize: 12, fontWeight: 600 }}>{payload.niveau_durete ?? "—"}</span>
      </div>
      <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#4b5563" }}>
          Attractivité foncière :{" "}
          <strong style={{ color: "#111827" }}>
            {payload.attractivite_fonciere != null ? `${Math.round(payload.attractivite_fonciere)}/100` : "—"}
          </strong>
        </div>
        {payload.siren && (
          <div style={{ fontSize: 12, color: "#4b5563" }}>
            SIREN <span className="mono">{payload.siren}</span>
            {payload.denomination ? ` — ${payload.denomination}` : ""}
          </div>
        )}
        {payload.intersects_arrachage_vigne && (
          <div style={{ fontSize: 12, color: "#b45309" }}>Bonus arrachage vigne (+15 pts) appliqué si éligible.</div>
        )}
      </div>
      {payload.explication ? (
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#374151", lineHeight: 1.45 }}>{payload.explication}</p>
      ) : null}
      {axisLines.length ? <div style={{ display: "grid", gap: 6 }}>{axisLines}</div> : null}
    </div>
  );
}

export function CompositeScoreBlock({ payload }: { payload: CompositeScoreMetric }) {
  const score = payload.score_composite;
  const color = score != null && score >= 60 ? "#166534" : score != null && score >= 40 ? "#b45309" : "#991b1b";
  const bg =
    score != null && score >= 60
      ? "rgba(22,101,52,0.08)"
      : score != null && score >= 40
        ? "rgba(180,83,9,0.08)"
        : "rgba(153,27,27,0.08)";

  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, background: bg, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong style={{ color: "#111827", fontSize: 14 }}>
          Composite : {score != null ? `${Math.round(score)}/100` : "—"}
        </strong>
        {payload.foncier_redhibitoire && (
          <span style={{ fontSize: 11, color: "#991b1b", fontWeight: 700 }}>Foncier rédhibitoire</span>
        )}
      </div>
      {payload.message ? (
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", lineHeight: 1.4 }}>{payload.message}</p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563" }}>
          60 % score éco + 40 % attractivité foncière
          {payload.attractivite_fonciere != null ? ` (attractivité ${Math.round(payload.attractivite_fonciere)}/100)` : ""}.
        </p>
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

  const pmRow = metrics.find((row) => row.metric_key === "parcelles_personnes_morales");
  const pmPayload = pmRow
    ? parsePersonnesMoralesPayload((pmRow.metric_value_jsonb ?? {}) as Record<string, unknown>)
    : undefined;

  const filterEnrichRow = metrics.find((row) => row.metric_key === "filter_enrich");
  const filterEnrichPayload = filterEnrichRow
    ? parseFilterEnrichPayload((filterEnrichRow.metric_value_jsonb ?? {}) as Record<string, unknown>)
    : null;

  const scoreRow = metrics.find((row) => row.metric_key === "score_eco");
  const scorePayload = scoreRow
    ? parseParcelScorePayload((scoreRow.metric_value_jsonb ?? {}) as Record<string, unknown>)
    : null;

  const duretePayload = getDureteFonciereMetric(metrics);
  const compositePayload = getCompositeScoreMetric(metrics);

  const hasVisibleMetrics = metrics.some((m) => VISIBLE_METRIC_KEYS.has(m.metric_key));

  return (
    <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
      {filterEnrichPayload ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Enrichissement écologique (filtre)</h4>
          <FilterEnrichBlock payload={filterEnrichPayload} />
        </section>
      ) : null}

      {scorePayload ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Score écologique</h4>
          <ScoreBlock payload={scorePayload} />
        </section>
      ) : null}

      {duretePayload ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Dureté & attractivité foncière</h4>
          <DureteFonciereBlock payload={duretePayload} />
        </section>
      ) : null}

      {compositePayload ? (
        <section className="ranking-metric-block">
          <h4 className="ranking-metric-title">Score composite</h4>
          <CompositeScoreBlock payload={compositePayload} />
        </section>
      ) : null}

      <section className="ranking-metric-block">
        <h4 className="ranking-metric-title">Personnes morales & prospects compensation</h4>
        {pmPayload ? (
          <PersonnesMoralesBlock payload={pmPayload} />
        ) : (
          <p className="ranking-line-empty">
            {hasVisibleMetrics
              ? "Croisement PM / prospects non disponible pour cette parcelle."
              : "Profilage non encore calculé — relancez un filtrage ou POST …/recompute-metrics."}
          </p>
        )}
      </section>
    </div>
  );
}
