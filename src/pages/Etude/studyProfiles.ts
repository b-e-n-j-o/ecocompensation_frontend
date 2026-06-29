import type { StudyType } from "../../types/studyTypes";
import type { ZoneHumideMode } from "../../types";

export type StudyProfile = {
  id: StudyType;
  shortLabel: string;
  badgeLabel: string;
  badgeClass: string;
  hubTitle: string;
  hubDescription: string;
  hubIcon: string;
  resultsTitlePrefix: string;
  methodologyHint: string;
  /** Masquer le curseur distance AOI en résultats (peu pertinent en intra-foncier). */
  hideDistanceFilter: boolean;
  /** Couches thématiques prioritaires sur la carte résultats. */
  primaryMapLayers: string[];
};

export const STUDY_PROFILES: Record<StudyType, StudyProfile> = {
  faune_buffer: {
    id: "faune_buffer",
    shortLabel: "Faune",
    badgeLabel: "Faune · buffer",
    badgeClass: "study-badge study-badge--faune",
    hubTitle: "Compensation faunistique",
    hubDescription:
      "Recherche de parcelles compensatoires dans un buffer autour de la zone d'étude, filtrées par espèces animales et végétation.",
    hubIcon: "🦎",
    resultsTitlePrefix: "Compensation faunistique",
    methodologyHint: "Recherche autour du foncier (buffer)",
    hideDistanceFilter: false,
    primaryMapLayers: ["fauna_buffer", "cesbio"],
  },
  zones_humides_intra: {
    id: "zones_humides_intra",
    shortLabel: "Zones humides",
    badgeLabel: "ZH · bassins versants",
    badgeClass: "study-badge study-badge--zh",
    hubTitle: "Compensation zones humides",
    hubDescription:
      "Recherche de parcelles compensatoires dans les bassins versants (masses d'eau) intersectant votre zone initiale, filtrées par zones humides établies ou probables.",
    hubIcon: "💧",
    resultsTitlePrefix: "Compensation zones humides",
    methodologyHint: "Recherche dans les bassins versants retenus",
    hideDistanceFilter: true,
    primaryMapLayers: ["zone_humide", "zones_humides_probables"],
  },
};

export function getStudyProfile(studyType: StudyType | string | null | undefined): StudyProfile {
  if (studyType === "zones_humides_intra") return STUDY_PROFILES.zones_humides_intra;
  return STUDY_PROFILES.faune_buffer;
}

export function studyTypeFilterLabel(filter: "all" | StudyType): string {
  if (filter === "all") return "Toutes les études";
  return getStudyProfile(filter).shortLabel;
}

export function getMapLayerKeys(studyType: StudyType | string | null | undefined, hasFauna = false): string[] {
  if (studyType === "zones_humides_intra") {
    const keys = [
      "zone_humide",
      "zones_humides_probables",
      "espaces_naturels_sensibles_ens",
      "preemption_ens",
    ];
    if (hasFauna) keys.push("fauna", "fauna_buffer");
    return keys;
  }
  return ["cesbio", "fauna", "fauna_buffer"];
}

export const DEFAULT_ZH_CRITERIA: {
  zones_humides_probables_mode: ZoneHumideMode;
  min_zone_humide_ha: number;
  troncons_hydro_enabled: boolean;
  troncons_hydro_max_dist_m: number;
  surfaces_hydro_enabled: boolean;
  surfaces_hydro_max_dist_m: number;
} = {
  zones_humides_probables_mode: "ignore",
  min_zone_humide_ha: 1,
  troncons_hydro_enabled: true,
  troncons_hydro_max_dist_m: 100,
  surfaces_hydro_enabled: false,
  surfaces_hydro_max_dist_m: 100,
};
