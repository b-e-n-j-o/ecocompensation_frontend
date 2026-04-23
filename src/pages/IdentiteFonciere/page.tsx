import { useMemo, useState } from "react";
import {
  generateIdentiteFoncierePdf,
  type IdentiteFonciereParcelleInput,
} from "../../api";

const SAMPLE_INPUT = `Latresne;33522;AC;0042
Latresne;33522;AC;0043`;

function parseParcellesInput(raw: string): IdentiteFonciereParcelleInput[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, idx) => {
    const parts = line.split(/[;,]/).map((p) => p.trim());
    if (parts.length < 4) {
      throw new Error(
        `Ligne ${idx + 1}: format invalide. Attendu: commune;insee;section;numero`,
      );
    }
    const [commune, insee, section, numero] = parts;
    if (!commune || !insee || !section || !numero) {
      throw new Error(
        `Ligne ${idx + 1}: champs manquants. Format: commune;insee;section;numero`,
      );
    }
    return { commune, insee, section, numero };
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "identite_fonciere.pdf";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function IdentiteFoncierePage() {
  const [rawParcelles, setRawParcelles] = useState(SAMPLE_INPUT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const nbLignes = useMemo(
    () =>
      rawParcelles
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean).length,
    [rawParcelles],
  );

  async function handleGenerateReport() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const parcelles = parseParcellesInput(rawParcelles);
      const { blob, filename } = await generateIdentiteFoncierePdf({ parcelles });
      triggerDownload(blob, filename);
      setSuccess(`Rapport généré (${parcelles.length} parcelle(s)).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <h1 style={{ marginTop: 0 }}>Carte d&apos;identité foncière</h1>
      <p style={{ marginTop: 0, color: "#334155" }}>
        Saisis une ligne par parcelle au format <code>commune;insee;section;numero</code>, puis
        génère le PDF.
      </p>

      <label
        htmlFor="cif-parcelles"
        style={{ display: "block", fontWeight: 600, marginBottom: 8 }}
      >
        Parcelles ({nbLignes})
      </label>
      <textarea
        id="cif-parcelles"
        value={rawParcelles}
        onChange={(e) => setRawParcelles(e.target.value)}
        rows={10}
        spellCheck={false}
        style={{
          width: "100%",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: 10,
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 18 }}>
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={loading}
          style={{
            border: "1px solid #0f172a",
            background: loading ? "#94a3b8" : "#0f172a",
            color: "white",
            borderRadius: 8,
            padding: "10px 14px",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Génération en cours..." : "Générer le rapport PDF"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#b91c1c", whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}
      {success && <div style={{ marginTop: 12, color: "#166534" }}>{success}</div>}
    </div>
  );
}
