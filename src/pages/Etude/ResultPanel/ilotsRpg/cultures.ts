export const CAT_CULTURE_LABELS: Record<string, string> = {
  TA: "Terres arables",
  CP: "Cultures permanentes",
  PP: "Prairies permanentes",
  NA: "Cultures diverses",
  SB: "Surfaces boisées",
};

export const CODE_CULTURE_LABELS: Record<string, string> = {
  VRC: "Vigne",
  PPH: "Prairie permanente",
  PTR: "Prairie temporaire",
  BTH: "Blé tendre d'hiver",
  MIS: "Maïs",
  TRN: "Tournesol",
  JAC: "Jachère",
};

export const CAT_CULTURE_COLORS: Record<string, string> = {
  PP: "#3d8b4f",
  TA: "#d4a017",
  CP: "#7c3aed",
  NA: "#6b7280",
  SB: "#166534",
};

export function cultureLabel(cat: string | null, code: string | null): string {
  if (!cat) return "Non cultivé";
  const catLabel = CAT_CULTURE_LABELS[cat] ?? cat;
  if (!code) return catLabel;
  const codeLabel = CODE_CULTURE_LABELS[code] ?? code;
  return `${catLabel} · ${codeLabel}`;
}
