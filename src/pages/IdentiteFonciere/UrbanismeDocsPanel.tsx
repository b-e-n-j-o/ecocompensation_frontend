import { useEffect, useState } from "react";
import {
  fetchUrbanDocumentsForInsee,
  type UrbanDocsResponse,
} from "../../api";

type Props = {
  insee: string | null;
};

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
                  <div style={{ maxHeight: 110, overflowY: "auto", borderTop: "1px dashed #cbd5e1", paddingTop: 6 }}>
                    {docs.files.map((f) => (
                      <div key={f.name} style={{ marginBottom: 3 }}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block",
                            maxWidth: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={f.name}
                        >
                          {f.name}
                        </a>
                      </div>
                    ))}
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
