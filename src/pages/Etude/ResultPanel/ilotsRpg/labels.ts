// Libellés et couleurs des cultures RPG (provisoire : compléter depuis REF_CULTURES_2025.csv).

export const CAT_CULTURE_LABELS: Record<string, string> = {
  TA: "Terres arables",
  CP: "Cultures permanentes",
  PP: "Prairies permanentes",
  NA: "Cultures diverses",
  SB: "Surfaces boisées",
  NC: "Non cultivé",
};

/** Couleurs par catégorie dominante (carte + pastilles du tableau). */
export const CAT_CULTURE_COLORS: Record<string, string> = {
  PP: "#16a34a",
  TA: "#eab308",
  CP: "#9333ea",
  NA: "#64748b",
  SB: "#065f46",
  NC: "#94a3b8",
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

export function catKey(cat: string | null | undefined): string {
  return cat && CAT_CULTURE_LABELS[cat] ? cat : "NC";
}

export function catLabel(cat: string | null | undefined): string {
  return CAT_CULTURE_LABELS[catKey(cat)];
}

export function catColor(cat: string | null | undefined): string {
  return CAT_CULTURE_COLORS[catKey(cat)];
}

export function cultureLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return CODE_CULTURE_LABELS[code] ?? code;
}

/** Expression MapLibre : couleur par cat_dominante. */
export function catColorExpression(): unknown[] {
  const match: unknown[] = ["match", ["get", "cat_dominante"]];
  for (const [k, c] of Object.entries(CAT_CULTURE_COLORS)) match.push(k, c);
  match.push(CAT_CULTURE_COLORS.NC);
  return match;
}

/** Expression MapLibre : couleur par score éco normalisé (mêmes seuils que SousEnsemblesMap). */
export function scoreColorExpression(): unknown[] {
  return [
    "step", ["coalesce", ["get", "score_ratio"], 0],
    "#6b7280",
    0.2, "#f59e0b",
    0.5, "#16a34a",
    0.8, "#166534",
  ];
}

/** Couleurs des propriétaires dans un îlot (owner_index 0 = PM principale). Gris = pers. physique / NI. */
export const OWNER_COLORS = ["#2563eb", "#db2777", "#0891b2", "#ea580c", "#7c3aed", "#65a30d", "#be123c", "#0d9488"];
export const OWNER_NONE_COLOR = "#9ca3af";

export function ownerColor(index: number | null | undefined): string {
  if (index == null || index < 0) return OWNER_NONE_COLOR;
  return OWNER_COLORS[index % OWNER_COLORS.length];
}

/** Expression MapLibre : couleur par owner_index (même palette que ownerColor). */
export function ownerColorExpression(): unknown[] {
  const match: unknown[] = ["match", ["coalesce", ["get", "owner_index"], -1], -1, OWNER_NONE_COLOR];
  for (let i = 0; i < 32; i++) match.push(i, OWNER_COLORS[i % OWNER_COLORS.length]);
  match.push(OWNER_COLORS[0]);
  return match;
}

export function parcelleLabel(p: { section: string | null; numero: string | null; idu: string }): string {
  if (p.section && p.numero) return `${p.section} ${p.numero.replace(/^0+/, "") || "0"}`;
  return p.idu;
}

export function ecoBadgeStyle(score: number | null | undefined, max: number | null | undefined): { bg: string; fg: string } {
  if (score == null || !max) return { bg: "#e5e7eb", fg: "#374151" };
  const ratio = score / max;
  if (ratio >= 0.8) return { bg: "#dcfce7", fg: "#166534" };
  if (ratio >= 0.5) return { bg: "#bbf7d0", fg: "#166534" };
  if (ratio >= 0.2) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e5e7eb", fg: "#374151" };
}

export function formatPct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  const pct = ratio * 100;
  return `${pct.toLocaleString("fr-FR", { maximumFractionDigits: pct >= 10 || pct === 0 ? 0 : 1 })} %`;
}
