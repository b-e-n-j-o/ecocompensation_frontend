// ─── RankingLine — détail enrichissement filter_v2 ────────────────────────────
import { useEffect, useState } from "react";
import { CESBIO_LIBELLE_COLORS, type ParcelPoolMetricRow } from "../../../types";
import {
  type ArrachageVignesMetric,
  type CompositeScoreMetric,
  type FilterEnrichPayload,
  type OccupationSolMetric,
  type OccupationSolShare,
  getArrachageVignesMetric,
  getCompositeScoreMetric,
  getDureteFonciereMetric,
  getEspacesBoisesClassesMetric,
  getOccupationSolMetric,
  getPersonnesMoralesMetric,
  getUrbanismeGpuMetric,
  getZnieff2Metric,
} from "../../../utils/poolMetrics";
import { EnvironnementTab } from "./RankingLineEnvironnement";
import { DureteFoncierePanel } from "./RankingLineDurete";
import { UrbanismeBlock } from "./RankingLineUrbanisme";

/** Couleur stable par libellé : catalogue CESBIO si connu, sinon teinte hashée. */
function colorForZonageLabel(label: string): { fill: string; border: string } {
  const known = CESBIO_LIBELLE_COLORS[label];
  if (known) {
    return { fill: known, border: known };
  }
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

function formatOccSolPct(ratio: number): string {
  const pct = ratio * 100;
  const digits = pct >= 10 || pct === 0 ? 0 : 1;
  return `${pct.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} %`;
}

function formatOccSolHa(areaM2: number | null): string | null {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const ha = areaM2 / 10_000;
  const digits = ha >= 10 ? 1 : 2;
  return `${ha.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ha`;
}

function OccupancySolBlock({ metric }: { metric: OccupationSolMetric }) {
  const rows: OccupationSolShare[] = metric.shares.filter((s) => s.ratio > 0);
  const hint =
    metric.source === "cesbio_profile"
      ? "Classes CESBIO sur la parcelle. Elles peuvent se recouvrir."
      : "Classes de l’intersection BD TOPO / CESBIO. Elles peuvent se recouvrir.";

  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Occupation du sol</span>
        <span className="filter-enrich-section-count mono">
          {metric.totalM2 > 0 ? formatOccSolHa(metric.totalM2) : `${rows.length} classe${rows.length > 1 ? "s" : ""}`}
        </span>
      </div>
      <p className="filter-enrich-fauna-hint">{hint}</p>
      <ul className="filter-enrich-fauna-list" aria-label="Occupation du sol par classe">
        {rows.map((s) => {
          const { fill } = colorForZonageLabel(s.label);
          const ha = formatOccSolHa(s.areaM2);
          const width = `${Math.max(2, Math.min(100, s.ratio * 100))}%`;
          return (
            <li key={s.label} className="filter-enrich-fauna-row">
              <div className="filter-enrich-fauna-row-head">
                <span className="occ-sol-swatch" style={{ background: fill }} />
                <span className="filter-enrich-fauna-species" title={s.label}>
                  {s.label}
                </span>
                <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                  {formatOccSolPct(s.ratio)}
                  {ha ? ` · ${ha}` : ""}
                </span>
              </div>
              <div className="occ-sol-track" aria-hidden>
                <span className="occ-sol-fill" style={{ width, background: fill }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const zone_humide_m2 = typeof v.zone_humide_m2 === "number" && Number.isFinite(v.zone_humide_m2)
    ? v.zone_humide_m2
    : undefined;
  const zone_humide_pct = typeof v.zone_humide_pct === "number" && Number.isFinite(v.zone_humide_pct)
    ? v.zone_humide_pct
    : undefined;
  const zone_humide_intersects =
    typeof v.zone_humide_intersects === "boolean" ? v.zone_humide_intersects : undefined;
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
    && zone_humide_m2 == null
    && zone_humide_pct == null
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
    zone_humide_m2,
    zone_humide_pct,
    zone_humide_intersects,
    surface_hydro_ha,
  };
}

function faunaDistanceTone(distM: number): { bg: string; border: string; label: string } {
  if (distM <= 0) return { bg: "rgba(22,163,74,0.16)", border: "#16a34a", label: "Intersection" };
  if (distM <= 500) return { bg: "rgba(22,163,74,0.12)", border: "#22c55e", label: "Très proche" };
  if (distM <= 1000) return { bg: "rgba(245,158,11,0.14)", border: "#f59e0b", label: "Proche" };
  return { bg: "rgba(107,114,128,0.12)", border: "#9ca3af", label: "Éloignée" };
}

function ZoneHumideIntersectBlock({
  ha,
  m2,
  pct,
  intersects,
  parcelSurfaceHa,
}: {
  ha: number;
  m2?: number;
  pct?: number;
  intersects?: boolean;
  parcelSurfaceHa?: number | null;
}) {
  const hit = intersects ?? ha > 0;
  const areaM2 = m2 != null && Number.isFinite(m2) ? m2 : ha * 10_000;
  const sharePct =
    pct != null && Number.isFinite(pct)
      ? pct
      : parcelSurfaceHa != null && parcelSurfaceHa > 0
        ? Math.min(100, (ha / parcelSurfaceHa) * 100)
        : null;
  const pctLabel =
    sharePct == null
      ? null
      : `${sharePct.toLocaleString("fr-FR", { maximumFractionDigits: sharePct >= 10 ? 0 : 1 })} %`;
  const m2Label = `${Math.round(areaM2).toLocaleString("fr-FR")} m²`;

  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Zone humide</span>
        {hit ? (
          <span className="filter-enrich-pill filter-enrich-pill--zh mono">
            {ha > 0 ? `${ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha` : m2Label}
          </span>
        ) : (
          <span className="filter-enrich-pill filter-enrich-pill--muted mono">Aucune</span>
        )}
      </div>
      {hit ? (
        <p className="filter-enrich-fauna-hint">
          {[pctLabel ? `${pctLabel} de la parcelle` : null, m2Label].filter(Boolean).join(" · ")}
        </p>
      ) : (
        <p className="ranking-line-empty">Cette parcelle n’intersecte pas la zone humide établie.</p>
      )}
    </div>
  );
}

function nearestFirst<T extends { dist_m?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = typeof a.dist_m === "number" ? a.dist_m : Number.POSITIVE_INFINITY;
    const db = typeof b.dist_m === "number" ? b.dist_m : Number.POSITIVE_INFINITY;
    return da - db;
  });
}

function HydroDetailToggle({
  count,
  open,
  onToggle,
  label,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  if (count <= 1) return null;
  return (
    <button
      type="button"
      className="filter-enrich-more"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? `Masquer les détails ${label}` : `Voir les détails ${label}`}
    >
      {open ? "Masquer les détails" : "Voir les détails"}
      <span aria-hidden>{open ? " ▴" : " ▾"}</span>
    </button>
  );
}

function TronconHydroRow({
  item,
  index,
  fallbackDist,
}: {
  item: NonNullable<FilterEnrichPayload["troncons_hydro_info"]>[number];
  index: number;
  fallbackDist: number;
}) {
  const label = item.nom?.trim() || item.nature?.trim() || item.cleabs || `Tronçon ${index + 1}`;
  const distM = typeof item.dist_m === "number" ? item.dist_m : fallbackDist;
  const tone = faunaDistanceTone(distM);
  return (
    <li className="filter-enrich-fauna-row">
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
        {[item.nature, item.classe_de_largeur, item.numero_d_ordre != null ? `ordre ${item.numero_d_ordre}` : null]
          .filter(Boolean)
          .join(" · ") || "Attributs non renseignés"}
      </p>
    </li>
  );
}

function SurfaceHydroRow({
  item,
  index,
  fallbackDist,
}: {
  item: NonNullable<FilterEnrichPayload["surfaces_hydro_info"]>[number];
  index: number;
  fallbackDist: number;
}) {
  const label = item.nom?.trim() || item.nature?.trim() || item.cleabs || `Surface ${index + 1}`;
  const distM = typeof item.dist_m === "number" ? item.dist_m : fallbackDist;
  const tone = faunaDistanceTone(distM);
  return (
    <li className="filter-enrich-fauna-row">
      <div className="filter-enrich-fauna-row-head">
        <span className="filter-enrich-fauna-species" title={label}>
          {label}
        </span>
        <span
          className="filter-enrich-fauna-badge mono"
          style={{ background: tone.bg, borderColor: tone.border, color: "#111827" }}
        >
          {typeof item.intersect_ha === "number" && item.intersect_ha > 0
            ? `${item.intersect_ha.toFixed(2)} ha`
            : distM <= 0
              ? "0 m · intersection"
              : `${Math.round(distM).toLocaleString("fr-FR")} m`}
        </span>
      </div>
      <p className="filter-enrich-fauna-hint">
        {[item.nature, item.position_par_rapport_au_sol, item.statut]
          .filter(Boolean)
          .join(" · ") || "Attributs non renseignés"}
      </p>
    </li>
  );
}

function TronconsHydroSection({
  troncons,
  distHydroM,
}: {
  troncons: NonNullable<FilterEnrichPayload["troncons_hydro_info"]>;
  distHydroM?: number;
}) {
  const [open, setOpen] = useState(false);
  const ordered = nearestFirst(troncons);
  const nearest = ordered[0];
  const fallback = distHydroM ?? 0;
  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Cours d&apos;eau</span>
        <span className="filter-enrich-section-count mono">
          {troncons.length
            ? `${troncons.length} retenu${troncons.length > 1 ? "s" : ""}`
            : distHydroM != null
              ? `${Math.round(distHydroM).toLocaleString("fr-FR")} m`
              : "—"}
        </span>
      </div>
      {nearest ? (
        <>
          <p className="filter-enrich-nearest-label">Le plus proche</p>
          <ul className="filter-enrich-fauna-list" aria-label="Cours d'eau le plus proche">
            <TronconHydroRow item={nearest} index={0} fallbackDist={fallback} />
          </ul>
          <HydroDetailToggle
            count={troncons.length}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            label="des cours d'eau retenus"
          />
          {open && ordered.length > 1 && (
            <ul className="filter-enrich-fauna-list" aria-label="Autres cours d'eau retenus">
              {ordered.slice(1).map((t, idx) => (
                <TronconHydroRow
                  key={`${t.cleabs ?? idx}-${t.nom ?? t.nature ?? idx}`}
                  item={t}
                  index={idx + 1}
                  fallbackDist={fallback}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="ranking-line-empty">Distance au cours d&apos;eau la plus proche enregistrée.</p>
      )}
    </div>
  );
}

function SurfacesHydroSection({
  surfaces,
  distSurfaceM,
  surfaceHydroHa,
}: {
  surfaces: NonNullable<FilterEnrichPayload["surfaces_hydro_info"]>;
  distSurfaceM?: number;
  surfaceHydroHa?: number;
}) {
  const [open, setOpen] = useState(false);
  const ordered = nearestFirst(surfaces);
  const nearest = ordered[0];
  const fallback = distSurfaceM ?? 0;
  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Surfaces d&apos;eau</span>
        <span className="filter-enrich-section-count mono">
          {surfaces.length
            ? `${surfaces.length} retenue${surfaces.length > 1 ? "s" : ""}`
            : typeof surfaceHydroHa === "number" && surfaceHydroHa > 0
              ? `${surfaceHydroHa.toFixed(2)} ha intersectés`
              : distSurfaceM != null
                ? `${Math.round(distSurfaceM).toLocaleString("fr-FR")} m`
                : "—"}
        </span>
      </div>
      {nearest ? (
        <>
          <p className="filter-enrich-nearest-label">La plus proche</p>
          <ul className="filter-enrich-fauna-list" aria-label="Surface d'eau la plus proche">
            <SurfaceHydroRow item={nearest} index={0} fallbackDist={fallback} />
          </ul>
          <HydroDetailToggle
            count={surfaces.length}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            label="des surfaces d'eau retenues"
          />
          {open && ordered.length > 1 && (
            <ul className="filter-enrich-fauna-list" aria-label="Autres surfaces d'eau retenues">
              {ordered.slice(1).map((s, idx) => (
                <SurfaceHydroRow
                  key={`${s.cleabs ?? idx}-${s.nom ?? s.nature ?? idx}`}
                  item={s}
                  index={idx + 1}
                  fallbackDist={fallback}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="ranking-line-empty">Distance ou surface hydro enregistrée pour cette parcelle.</p>
      )}
    </div>
  );
}

export function FilterEnrichBlock({
  payload,
  hideCesbio = false,
  parcelSurfaceHa = null,
  part = "all",
}: {
  payload: FilterEnrichPayload;
  /** Masqué si l’occupation du sol (parts) est déjà affichée au-dessus. */
  hideCesbio?: boolean;
  /** Surface parcelle (ha) pour le % ZH si la métrique n’a pas `zone_humide_pct`. */
  parcelSurfaceHa?: number | null;
  /** Limite l’affichage à une famille, pour les onglets de la fiche parcelle. */
  part?: "all" | "faune" | "sol" | "hydro" | "zh";
}) {
  const vegLabels = payload.veg_libelles ?? [];
  const faunaEntries = Object.entries(payload.fauna_distances ?? {}).sort((a, b) => a[1] - b[1]);
  const troncons = payload.troncons_hydro_info ?? [];
  const surfaces = payload.surfaces_hydro_info ?? [];
  const zhHa = payload.zone_humide_ha;
  const hasZh = zhHa != null || payload.zone_humide_intersects != null;
  const showSol = part === "all" || part === "sol";
  const showZh = part === "all" || part === "zh";
  const showFaune = part === "all" || part === "faune";
  const showHydro = part === "all" || part === "hydro";

  return (
    <div className="filter-enrich-block">
      {!hideCesbio && showSol && (
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
      )}

      {showFaune && (
      <div className="filter-enrich-section">
        <div className="filter-enrich-section-head">
          <span className="filter-enrich-section-title">Faune (filtre)</span>
          <span className="filter-enrich-section-count mono">
            {faunaEntries.length
              ? `${faunaEntries.length} espèce${faunaEntries.length > 1 ? "s" : ""}`
              : "—"}
          </span>
        </div>
        {faunaEntries.length ? (
          <ul className="filter-enrich-fauna-list" aria-label="Distances aux observations par espèce">
            {faunaEntries.map(([species, distM]) => {
              const tone = faunaDistanceTone(distM);
              return (
                <li key={species} className="filter-enrich-fauna-row">
                  <div className="filter-enrich-fauna-row-head">
                    <span className="filter-enrich-fauna-species" title={species}>
                      {species}
                    </span>
                    <span className="filter-enrich-proximity">{tone.label}</span>
                    <span className="filter-enrich-pill filter-enrich-pill--faune mono">
                      {distM <= 0 ? "0 m" : `${Math.round(distM).toLocaleString("fr-FR")} m`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ranking-line-empty">Aucune distance faune enregistrée pour cette parcelle.</p>
        )}
      </div>
      )}

      {showZh && hasZh && (
        <ZoneHumideIntersectBlock
          ha={zhHa ?? 0}
          m2={payload.zone_humide_m2}
          pct={payload.zone_humide_pct}
          intersects={payload.zone_humide_intersects}
          parcelSurfaceHa={parcelSurfaceHa}
        />
      )}

      {showHydro && (payload.dist_hydro_m != null || troncons.length > 0) && (
        <TronconsHydroSection troncons={troncons} distHydroM={payload.dist_hydro_m} />
      )}

      {showHydro && (payload.dist_surface_hydro_m != null || payload.surface_hydro_ha != null || surfaces.length > 0) && (
        <SurfacesHydroSection
          surfaces={surfaces}
          distSurfaceM={payload.dist_surface_hydro_m}
          surfaceHydroHa={payload.surface_hydro_ha}
        />
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
          Score éco : {payload.total_score} / {payload.max_score}
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

function FoncierScoreBlock({
  payload,
  onShowDetails,
}: {
  payload: NonNullable<ReturnType<typeof getDureteFonciereMetric>>;
  onShowDetails: () => void;
}) {
  const score = payload.score_final;
  const color = score != null && score >= 60 ? "#991b1b" : score != null && score >= 40 ? "#b45309" : "#166534";
  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, background: "rgba(15, 23, 42, 0.04)", padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ color: SCORE_TEXT, fontSize: 14 }}>
          Score de dureté foncière : {score != null ? `${Math.round(score)}/100` : "—"}
          {payload.niveau_durete ? ` · ${payload.niveau_durete}` : ""}
        </strong>
        <button type="button" className="ranking-line-run" onClick={onShowDetails}>
          Voir détails
        </button>
      </div>
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
          50 % score éco, 30 % attractivité foncière, 20 % score urbanistique.
          Un score absent n’est pas remplacé : son poids est réparti sur les scores présents.
        </p>
      )}
    </div>
  );
}


function ArrachageVignesBlock({ payload }: { payload: ArrachageVignesMetric }) {
  const ha = payload.impactedAreaM2 / 10_000;
  const pct = payload.impactedRatio * 100;
  const classes = Object.entries(payload.ratios).sort((a, b) => b[1] - a[1]);
  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Arrachage de vignes</span>
        <span className="filter-enrich-pill filter-enrich-pill--faune mono">
          {ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha
        </span>
      </div>
      <p className="filter-enrich-fauna-hint">
        {pct.toLocaleString("fr-FR", { maximumFractionDigits: pct >= 10 ? 0 : 1 })} % de la parcelle
      </p>
      {classes.length > 0 && (
        <ul className="filter-enrich-fauna-list" aria-label="Types de renaturation">
          {classes.map(([label, ratio]) => (
            <li key={label} className="filter-enrich-fauna-row">
              <div className="filter-enrich-fauna-row-head">
                <span className="filter-enrich-fauna-species" title={label}>{label}</span>
                <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                  {(ratio * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "score", label: "Scoring" },
  { id: "especes", label: "Espèces animales" },
  { id: "sol", label: "Occupation du sol" },
  { id: "zh", label: "Zones humides" },
  { id: "hydros", label: "Hydros" },
  { id: "environnement", label: "Environnement" },
  { id: "vignes", label: "Vignes" },
  { id: "durete", label: "Dureté foncière" },
  { id: "urbanisme", label: "Urbanisme" },
];

type DetailTab =
  | "score"
  | "especes"
  | "sol"
  | "zh"
  | "hydros"
  | "environnement"
  | "vignes"
  | "durete"
  | "urbanisme";

export interface RankingLineProps {
  idu: string;
  expanded: boolean;
  /** Métriques préchargées (GET /pool/metrics) pour cette parcelle. */
  metrics: ParcelPoolMetricRow[];
  /** True tant que le bulk des métriques du run est en cours après filtrage. */
  metricsLoading: boolean;
  /** Pas de run pool (réponse filtre sans pool_run_id). */
  noPoolRun?: boolean;
  /** Surface parcelle (ha) — pour le % d’intersection zone humide. */
  parcelSurfaceHa?: number | null;
  onRunDureteFonciere?: (idu: string) => void | Promise<void>;
  onRunUrbanisme?: (idu: string) => void | Promise<void>;
  /** Zoome la carte sur cette parcelle. */
  onShowOnMap?: (idu: string) => void;
  dureteFonciereLoading?: boolean;
  urbanismeLoading?: boolean;
  /** Onglet à afficher après un calcul (dureté ou urbanisme). */
  focusTab?: DetailTab | null;
  focusNonce?: number;
}

export function RankingLine({
  idu,
  expanded,
  metrics,
  metricsLoading,
  noPoolRun = false,
  parcelSurfaceHa = null,
  onRunDureteFonciere,
  onRunUrbanisme,
  onShowOnMap,
  dureteFonciereLoading = false,
  urbanismeLoading = false,
  focusTab = null,
  focusNonce = 0,
}: RankingLineProps) {
  const [tab, setTab] = useState<DetailTab>("especes");
  useEffect(() => {
    if (focusTab) setTab(focusTab);
  }, [focusTab, focusNonce]);
  if (!expanded) return null;

  const header = (
    <p className="ranking-line-idu">
      <span className="ranking-line-idu__label">IDU</span>
      <span className="mono">{idu}</span>
      {onShowOnMap && (
        <button
          type="button"
          className="ranking-line-idu__map"
          onClick={() => onShowOnMap(idu)}
        >
          Voir parcelle
        </button>
      )}
    </p>
  );

  if (noPoolRun) {
    return (
      <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
        {header}
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
        {header}
        <p className="ranking-line-status">Chargement des métriques du pool…</p>
      </div>
    );
  }

  if (!metrics.length) {
    return (
      <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
        {header}
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
  const isPersonneMorale = getPersonnesMoralesMetric(metrics)?.intersects_pm_database === true;
  const vignesPayload = getArrachageVignesMetric(metrics);
  const ebcPayload = getEspacesBoisesClassesMetric(metrics);
  const urbanismePayload = getUrbanismeGpuMetric(metrics);
  const znieff2Payload = getZnieff2Metric(metrics);
  const compositePayload = getCompositeScoreMetric(metrics);
  const occSolMetric = getOccupationSolMetric(metrics);

  return (
    <div className="ranking-line-detail" role="region" aria-label={`Détail parcelle ${idu}`}>
      {header}
      <div className="ranking-line-tabs" role="tablist" aria-label="Détail de la parcelle">
        {DETAIL_TABS.filter((item) => item.id !== "vignes" || vignesPayload).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`ranking-line-tab${tab === item.id ? " is-active" : ""}`}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "especes" && (
        filterEnrichPayload ? (
          <FilterEnrichBlock payload={filterEnrichPayload} part="faune" />
        ) : (
          <p className="ranking-line-empty">Aucune espèce enregistrée pour cette parcelle.</p>
        )
      )}

      {tab === "sol" && (
        <>
          {occSolMetric ? <OccupancySolBlock metric={occSolMetric} /> : null}
          {filterEnrichPayload ? (
            <FilterEnrichBlock
              payload={filterEnrichPayload}
              part="sol"
              hideCesbio={Boolean(occSolMetric)}
              parcelSurfaceHa={parcelSurfaceHa}
            />
          ) : !occSolMetric ? (
            <p className="ranking-line-empty">Occupation du sol non disponible pour cette parcelle.</p>
          ) : null}
        </>
      )}

      {tab === "zh" && (
        filterEnrichPayload && (
          filterEnrichPayload.zone_humide_ha != null
          || filterEnrichPayload.zone_humide_intersects != null
        ) ? (
          <FilterEnrichBlock
            payload={filterEnrichPayload}
            part="zh"
            parcelSurfaceHa={parcelSurfaceHa}
          />
        ) : (
          <p className="ranking-line-empty">Aucune zone humide établie enregistrée pour cette parcelle.</p>
        )
      )}

      {tab === "hydros" && (
        filterEnrichPayload && (
          filterEnrichPayload.dist_hydro_m != null
          || filterEnrichPayload.dist_surface_hydro_m != null
          || filterEnrichPayload.surface_hydro_ha != null
          || (filterEnrichPayload.troncons_hydro_info?.length ?? 0) > 0
          || (filterEnrichPayload.surfaces_hydro_info?.length ?? 0) > 0
        ) ? (
          <FilterEnrichBlock payload={filterEnrichPayload} part="hydro" />
        ) : (
          <p className="ranking-line-empty">Aucun cours d’eau ni surface d’eau retenu pour cette parcelle.</p>
        )
      )}

      {tab === "environnement" && (
        <EnvironnementTab ebc={ebcPayload} znieff2={znieff2Payload} />
      )}

      {tab === "vignes" && vignesPayload && (
        <ArrachageVignesBlock payload={vignesPayload} />
      )}

      {tab === "score" && (
        <div style={{ display: "grid", gap: 8 }}>
          {scorePayload ? <ScoreBlock payload={scorePayload} /> : (
            <p className="ranking-line-empty">Score écologique non calculé pour cette parcelle.</p>
          )}
          {duretePayload?.eligible && duretePayload.score_final != null ? (
            <FoncierScoreBlock payload={duretePayload} onShowDetails={() => setTab("durete")} />
          ) : (
            <p className="ranking-line-empty">Score de dureté foncière non calculé pour cette parcelle.</p>
          )}
          {urbanismePayload?.score?.scoreGlobal != null ? (
            <div style={{ border: "1px solid #1d4ed8", borderRadius: 8, background: "rgba(29, 78, 216, 0.06)", padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong style={{ color: SCORE_TEXT, fontSize: 14 }}>
                  Score urbanistique : {Math.round(urbanismePayload.score.scoreGlobal)}/100
                  {urbanismePayload.score.classe ? ` · classe ${urbanismePayload.score.classe}` : ""}
                  {urbanismePayload.score.libelleClasse ? ` · ${urbanismePayload.score.libelleClasse}` : ""}
                </strong>
                <button type="button" className="ranking-line-run" onClick={() => setTab("urbanisme")}>
                  Voir détails
                </button>
              </div>
            </div>
          ) : (
            <p className="ranking-line-empty">Score urbanistique non calculé pour cette parcelle.</p>
          )}
          {compositePayload ? <CompositeScoreBlock payload={compositePayload} /> : (
            <p className="ranking-line-empty">Score composite non calculé pour cette parcelle.</p>
          )}
        </div>
      )}

      {tab === "urbanisme" && (
        <UrbanismeBlock
          payload={urbanismePayload}
          onCompute={onRunUrbanisme ? () => void onRunUrbanisme(idu) : undefined}
          computing={urbanismeLoading}
        />
      )}

      {tab === "durete" && (
        <div style={{ display: "grid", gap: 8 }}>
        {pmPayload ? <PersonnesMoralesBlock payload={pmPayload} /> : null}
        {duretePayload ? (
          <DureteFoncierePanel payload={duretePayload} />
        ) : isPersonneMorale && onRunDureteFonciere ? (
          <div className="ranking-line-empty-action">
            <p className="ranking-line-empty">Dureté foncière non calculée pour cette parcelle.</p>
            <button
              type="button"
              className="ranking-line-run"
              disabled={dureteFonciereLoading}
              onClick={() => void onRunDureteFonciere(idu)}
            >
              {dureteFonciereLoading ? "Calcul…" : "Calculer la dureté"}
            </button>
          </div>
        ) : (
          <p className="ranking-line-empty">
            {isPersonneMorale
              ? "Dureté foncière non calculée. Lancez l’analyse depuis les outils du classement."
              : "Dureté foncière réservée aux parcelles personnes morales."}
          </p>
        )}
        </div>
      )}
    </div>
  );
}
