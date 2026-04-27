import { useEffect, useState } from "react";
import {
  fetchUrbanDocumentsForInsee,
  type UrbanDocsResponse,
} from "../../api";

type Props = {
  insee: string | null;
};

type ReglementTone = {
  border: string;
  background: string;
  badgeColor: string;
  statusColor: string;
};

function getReglementTone(
  verdict?: string | null,
  utilisable?: boolean | null,
): ReglementTone {
  if (utilisable === true || verdict === "TEXTUEL") {
    return {
      border: "1px solid #86efac",
      background: "#dcfce7",
      badgeColor: "#166534",
      statusColor: "#166534",
    };
  }

  if (verdict === "ERREUR_ANALYSE" || verdict === "INVALIDE" || verdict === "VIDE") {
    return {
      border: "1px solid #fca5a5",
      background: "#fee2e2",
      badgeColor: "#991b1b",
      statusColor: "#991b1b",
    };
  }

  return {
    border: "1px solid #fdba74",
    background: "#ffedd5",
    badgeColor: "#9a3412",
    statusColor: "#9a3412",
  };
}

function getVerdictLabel(verdict?: string | null, utilisable?: boolean | null): string {
  if (!verdict) return "Vérification en attente";
  if (utilisable === true || verdict === "TEXTUEL") return "Texte extractible";

  const mapping: Record<string, string> = {
    MIXTE: "Partiellement extractible",
    SCANNE: "Non extractible (scan)",
    TROP_COURT: "Non extractible (texte insuffisant)",
    VIDE: "Non extractible (document vide)",
    INVALIDE: "Document invalide",
    ERREUR_ANALYSE: "Analyse impossible",
  };
  return mapping[verdict] ?? `Verdict: ${verdict}`;
}

export default function UrbanismeDocsPanel({ insee }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<UrbanDocsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!insee) {
      setDocs(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDocs(null);
    setError(null);
    fetchUrbanDocumentsForInsee(insee)
      .then((data) => {
        if (cancelled) return;
        setDocs(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [insee]);

  if (!insee) return null;

  const files = docs?.files ?? [];
  const reglementUrl = docs?.reglement_url;

  return (
    <div
      style={{
        marginTop: 8,
        border: "1px solid #e2e8f0",
        borderRadius: 7,
        background: "#f8fafc",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: "8px 10px",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        Documents d'urbanisme (1) {open ? "▾" : "▸"}
      </button>

      {open && (
        <div style={{ padding: "0 8px 8px", display: "grid", gap: 6 }}>
          {loading && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              Chargement des documents GPU...
            </div>
          )}

          <details style={{ background: "#fff", borderRadius: 6, border: "1px solid #e2e8f0" }} open>
            <summary
              style={{
                cursor: "pointer",
                padding: "7px 8px",
                fontSize: 11,
                color: "#1e293b",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {docs?.commune || insee} ({insee})
              {docs?.typedoc ? ` — ${docs.typedoc}` : ""}
            </summary>
            <div style={{ padding: "0 8px 8px", fontSize: 11, color: "#334155" }}>
              {error && <div style={{ color: "#b91c1c", fontSize: 11 }}>{error}</div>}
              {docs && (
                <>
                  <div style={{ marginBottom: 6, lineHeight: 1.35 }}>
                    <strong>Règlement identifié :</strong>{" "}
                    {docs.reglement_url ? (
                      <a
                        href={docs.reglement_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          maxWidth: "100%",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          verticalAlign: "bottom",
                        }}
                        title={docs.reglement_name || "Ouvrir"}
                      >
                        {docs.reglement_name || "Ouvrir"}
                      </a>
                    ) : (
                      "non identifié"
                    )}
                  </div>
                  {docs.reglement_qualite_verdict && (
                    <div style={{ marginBottom: 6, lineHeight: 1.35 }}>
                      <strong>Qualité du règlement :</strong>{" "}
                      <span>
                        {docs.reglement_qualite_verdict}
                        {typeof docs.reglement_qualite_utilisable === "boolean"
                          ? docs.reglement_qualite_utilisable
                            ? " (utilisable)"
                            : " (non utilisable)"
                          : ""}
                      </span>
                      {docs.reglement_qualite_detail ? (
                        <div style={{ color: "#64748b" }}>{docs.reglement_qualite_detail}</div>
                      ) : null}
                    </div>
                  )}
                  <div
                    style={{
                      maxHeight: 170,
                      overflowY: "auto",
                      borderTop: "1px dashed #cbd5e1",
                      paddingTop: 8,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {files.map((f) => {
                      const isReglement = !!reglementUrl && f.url === reglementUrl;
                      const reglementTone = getReglementTone(
                        docs?.reglement_qualite_verdict,
                        docs?.reglement_qualite_utilisable,
                      );
                      return (
                        <a
                          key={f.name}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          title={f.name}
                          style={{
                            display: "block",
                            width: "100%",
                            boxSizing: "border-box",
                            borderRadius: 8,
                            border: isReglement ? reglementTone.border : "1px solid #e2e8f0",
                            background: isReglement ? reglementTone.background : "#f8fafc",
                            color: "#0f172a",
                            padding: "8px 10px",
                            textDecoration: "none",
                            lineHeight: 1.35,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.2,
                              textTransform: "uppercase",
                              color: isReglement ? reglementTone.badgeColor : "#64748b",
                              marginBottom: 2,
                            }}
                          >
                            {isReglement ? "Reglement elu" : "Document"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {f.name}
                          </div>
                          {isReglement && docs?.reglement_qualite_verdict && (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 10,
                                color: reglementTone.statusColor,
                                whiteSpace: "normal",
                              }}
                            >
                              {getVerdictLabel(
                                docs.reglement_qualite_verdict,
                                docs.reglement_qualite_utilisable,
                              )}
                            </div>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
