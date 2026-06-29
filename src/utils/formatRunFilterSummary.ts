/**
 * Résumé lisible d’un run à partir de `parcelles_pool_runs.options_json`
 * (même schéma que `FilterOptions` / `FiltreOptionsDTO` côté API).
 */

import { exclusionLabel } from "../constants/nationalExclusionLayers";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function layerModeFr(m: unknown): string {
  const s = str(m).toLowerCase();
  if (s === "ignore") return "ignoré";
  if (s === "intersect") return "doit intersecter";
  if (s === "exclude") return "exclut si intersecte";
  return s || "—";
}

function hydroModeFr(mode: unknown, radiusM: unknown): string {
  const s = str(mode).toLowerCase();
  if (s === "none" || s === "") return "désactivé";
  if (s === "intersect") return "intersection directe";
  const r = typeof radiusM === "number" && Number.isFinite(radiusM) ? Math.round(radiusM) : "?";
  if (s === "within_radius") return `proximité ≤ ${r} m`;
  return s;
}

function readVegetation(opts: Record<string, unknown>): { mode: string; zdv: number; cesbio: number } {
  const raw = opts.vegetation_hybride;
  if (!raw || typeof raw !== "object") return { mode: "OR", zdv: 0, cesbio: 0 };
  const o = raw as Record<string, unknown>;
  const mode = str(o.mode || "OR").toUpperCase();
  const zdv = Array.isArray(o.zdv_natures) ? o.zdv_natures.length : 0;
  const cesbio = Array.isArray(o.cesbio_libelles) ? o.cesbio_libelles.length : 0;
  return { mode: mode === "AND" ? "AND" : "OR", zdv, cesbio };
}

/**
 * Lignes courtes pour l’encart UI (ProjectSelector). Pour un export détaillé, utiliser options_json brut.
 */
export function formatRunFilterSummaryLines(opts: Record<string, unknown> | undefined): string[] {
  if (!opts || typeof opts !== "object") return ["Options de filtre non disponibles."];

  const lines: string[] = [];

  const tc = opts.target_count;
  const minA = opts.min_area_ha;
  const mill = opts.miller_threshold;
  lines.push(
    [
      typeof tc === "number"
        ? tc === 0
          ? "Parcelles : illimité"
          : `≤ ${tc} parcelle(s) en sortie`
        : "cible ?",
      typeof minA === "number" ? `surface ≥ ${Number(minA).toFixed(1)} ha` : "surface min ?",
      typeof mill === "number" ? `Miller ≥ ${Number(mill).toFixed(2)}` : "Miller ?",
    ].join(" · "),
  );

  const funnel = opts.funnel_mode === true;
  const rs = opts.radius_start_km;
  const rmin = opts.radius_min_km;
  if (funnel) {
    lines.push("Entonnoir de filtrage : activé (compteurs par étape).");
  }
  if ((typeof rs === "number" && Number.isFinite(rs)) || (typeof rmin === "number" && Number.isFinite(rmin))) {
    lines.push(
      `Rayons ${typeof rs === "number" ? Number(rs).toFixed(1) : "?"} → ${typeof rmin === "number" ? Number(rmin).toFixed(1) : "?"} km (paramètres conservés — le filtre SQL utilise l’AOI du projet, pas un rétrécissement dynamique par rayon).`,
    );
  }

  const veg = readVegetation(opts);
  if (veg.zdv > 0 || veg.cesbio > 0) {
    lines.push(
      `Végétation hybride (${veg.mode}) : ${veg.zdv} nature(s) ZDV · ${veg.cesbio} libellé(s) CESBIO`,
    );
  } else {
    lines.push("Végétation hybride : aucun critère ZDV/CESBIO (étape neutre).");
  }

  const carhab = opts.carhab_nom_eunis;
  const nCarhab = Array.isArray(carhab) ? carhab.length : 0;
  lines.push(
    nCarhab > 0
      ? `CARHAB (EUNIS) : ${nCarhab} libellé(s) — doit intersecter au moins un habitat`
      : "CARHAB : aucun libellé EUNIS (étape neutre).",
  );

  lines.push(
    [
      `EBC : ${layerModeFr(opts.ebc_mode)}`,
      `Natura 2000 : ${layerModeFr(opts.natura2000_mode)}`,
      `Rés. naturelles : ${layerModeFr(opts.reserves_naturelles_mode)}`,
      `ZNIEFF : ${layerModeFr(opts.znieff_mode)}`,
    ].join(" · "),
  );

  lines.push(
    `Arrachage vignes : ${layerModeFr(opts.arrachage_vignes_mode)} · Zones humides : ${layerModeFr(opts.zone_humide_mode)}`,
  );

  const exLayers = Array.isArray(opts.excluded_layers) ? opts.excluded_layers.map(String) : [];
  if (exLayers.length > 0) {
    lines.push(
      `Exclusions actives : ${exLayers.map((k) => exclusionLabel(k)).join(" · ")}`,
    );
  }

  const minZh = opts.min_zone_humide_ha;
  if (opts.zone_humide_mode === "intersect" && typeof minZh === "number" && minZh > 0) {
    lines.push(`Surface ZH intersectée ≥ ${Number(minZh).toFixed(2)} ha`);
  }

  const hydroMax = opts.troncons_hydros_max_dist_m;
  if (typeof hydroMax === "number") {
    lines.push(
      hydroMax <= 0
        ? "Tronçons hydro : intersection directe"
        : `Tronçons hydro : ≤ ${Math.round(hydroMax)} m`,
    );
  }

  const surfMax = opts.surfaces_hydros_max_dist_m;
  if (typeof surfMax === "number") {
    lines.push(
      surfMax <= 0
        ? "Surfaces hydro : intersection directe"
        : `Surfaces hydro : ≤ ${Math.round(surfMax)} m`,
    );
  }

  const rdn = opts.remontee_nappes_classefiab;
  const nRdn = Array.isArray(rdn) ? rdn.length : 0;
  lines.push(
    nRdn > 0
      ? `Remontées de nappes : ${nRdn} valeur(s) classefiab`
      : "Remontées de nappes : critère neutre (aucune classefiab)",
  );

  const th = hydroModeFr(opts.troncon_hydro_mode, opts.troncon_hydro_radius_m);
  const sh = hydroModeFr(opts.surface_hydro_mode, opts.surface_hydro_radius_m);
  lines.push(`Hydrologie — tronçons : ${th} · surfaces : ${sh}`);

  const ex = opts.excluded_layers;
  if (Array.isArray(ex) && ex.length) {
    lines.push(`Exclusions automatiques : ${ex.map(String).join(", ")}`);
  }

  const faune = opts.faune_criteria;
  const nFaune = Array.isArray(faune) ? faune.length : 0;
  if (nFaune > 0) lines.push(`Faune : ${nFaune} espèce(s) / critère(s)`);

  return lines;
}
