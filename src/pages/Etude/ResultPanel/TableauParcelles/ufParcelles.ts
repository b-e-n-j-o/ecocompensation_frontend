/** Découpe un IDU cadastral en libellé lisible (section + numéro) et code INSEE. */
export function parcelleLabelFromIdu(idu: string): { label: string; insee: string | null } {
  const raw = String(idu ?? "").trim();
  if (raw.length < 12) return { label: raw || "—", insee: null };
  const insee = raw.slice(0, 5);
  const section = raw.slice(8, 10);
  const numero = raw.slice(-4);
  return { label: `${section} ${numero}`, insee };
}
