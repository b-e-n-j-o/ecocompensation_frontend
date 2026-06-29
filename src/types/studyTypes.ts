/** Méthodologie de recherche de foncier compensatoire. */
export type StudyType = "faune_buffer" | "zones_humides_intra";

export const STUDY_TYPES: StudyType[] = ["faune_buffer", "zones_humides_intra"];

export function isStudyType(value: string | null | undefined): value is StudyType {
  return value === "faune_buffer" || value === "zones_humides_intra";
}

export function normalizeStudyType(value: string | null | undefined): StudyType {
  return isStudyType(value) ? value : "faune_buffer";
}
