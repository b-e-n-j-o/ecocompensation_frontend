/** Ancienne méthodologie (filtres / carte). Le projet en base utilise ProjectKind. */
export type StudyType = "faune_buffer" | "zones_humides_intra";

/** Rôle du projet : recherche (filtre) ou analyse (qualification d’un foncier connu). */
export type ProjectKind = "recherche" | "analyse";

export function normalizeProjectKind(value: string | null | undefined): ProjectKind {
  if (value === "analyse" || value === "analyse_de_foncier") return "analyse";
  return "recherche";
}

export function projectKindLabel(kind: ProjectKind): string {
  return kind === "analyse" ? "Analyse" : "Recherche";
}

export const STUDY_TYPES: StudyType[] = ["faune_buffer", "zones_humides_intra"];

export function isStudyType(value: string | null | undefined): value is StudyType {
  return value === "faune_buffer" || value === "zones_humides_intra";
}

export function normalizeStudyType(value: string | null | undefined): StudyType {
  return isStudyType(value) ? value : "faune_buffer";
}
