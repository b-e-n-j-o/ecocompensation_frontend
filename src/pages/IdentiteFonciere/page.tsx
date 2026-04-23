/**
 * IdentiteFoncierePage.tsx  — v2
 *
 * Layout split :
 *   Gauche  — panneau de gestion des parcelles + génération PDF
 *   Droite  — carte cadastrale interactive (CadastreMap)
 *
 * Les parcelles sélectionnées via la carte alimentent directement
 * le payload du POST /rapport.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateIdentiteFoncierePdf,
  type IdentiteFonciereParcelleInput,
} from "../../api";
import CadastreMap from "./CadastreMap";
import UrbanismeDocsPanel from "./UrbanismeDocsPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parcelleKey(p: IdentiteFonciereParcelleInput): string {
  return `${p.insee}-${p.section}-${p.numero}`;
}

function parcelleLabel(p: IdentiteFonciereParcelleInput): string {
  return `${p.commune} · ${p.section} ${p.numero}`;
}

// ---------------------------------------------------------------------------
// Sous-composant : badge parcelle dans la liste
// ---------------------------------------------------------------------------

function ParcelleBadge({
  parcelle,
  onRemove,
}: {
  parcelle: IdentiteFonciereParcelleInput;
  onRemove: () => void;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 10px",
        borderRadius: 7,
        background: "#f0f6ff",
        border: "1px solid #bfdbfe",
        fontSize: 13,
        gap: 8,
      }}
    >
      <span style={{ color: "#1e3a5f", fontFamily: "ui-monospace, Menlo, monospace" }}>
        {parcelleLabel(parcelle)}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "#64748b",
          flexShrink: 0,
        }}
      >
        {parcelle.insee}
      </span>
      <button
        type="button"
        onClick={onRemove}
        title="Retirer cette parcelle"
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "#94a3b8",
          padding: "0 2px",
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        ×
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function IdentiteFoncierePage() {
  const [parcelles, setParcelles] = useState<IdentiteFonciereParcelleInput[]>(
    [],
  );
  const [manualInsee, setManualInsee] = useState("");
  const [manualSection, setManualSection] = useState("");
  const [manualNumero, setManualNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>("identite_fonciere.pdf");
  const selectedInsee = useMemo(
    () => {
      const last = parcelles[parcelles.length - 1];
      return last?.insee?.trim() || null;
    },
    [parcelles],
  );

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        window.URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  // ---- Gestion de la liste ----

  const handleParcelleSelect = useCallback(
    (p: IdentiteFonciereParcelleInput) => {
      const key = parcelleKey(p);
      setParcelles((prev) => {
        if (prev.some((x) => parcelleKey(x) === key)) return prev; // déjà présente
        return [...prev, p];
      });
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const handleParcelleRemove = useCallback((key: string) => {
    setParcelles((prev) => prev.filter((p) => parcelleKey(p) !== key));
  }, []);

  const handleClear = () => {
    setParcelles([]);
    setError(null);
    setSuccess(null);
  };

  const handleAddManualParcelle = useCallback(() => {
    const insee = manualInsee.trim();
    const section = manualSection.trim().toUpperCase().padStart(2, "0");
    const numero = manualNumero.trim().padStart(4, "0");

    if (!insee || !section || !numero) {
      setError("Renseignez INSEE, section et numéro.");
      setSuccess(null);
      return;
    }

    const p: IdentiteFonciereParcelleInput = {
      commune: insee, // fallback visuel si commune inconnue
      insee,
      section,
      numero,
    };
    const key = parcelleKey(p);
    setParcelles((prev) => {
      if (prev.some((x) => parcelleKey(x) === key)) return prev;
      return [...prev, p];
    });
    setManualSection("");
    setManualNumero("");
    setError(null);
    setSuccess(null);
  }, [manualInsee, manualNumero, manualSection]);

  // ---- Génération PDF ----

  async function handleGenerateReport() {
    if (parcelles.length === 0) {
      setError("Sélectionnez au moins une parcelle sur la carte.");
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { blob, filename } = await generateIdentiteFoncierePdf({
        parcelles,
      });
      const nextUrl = window.URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) window.URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setPdfFilename(filename || "identite_fonciere.pdf");
      setSuccess(`Rapport généré (${parcelles.length} parcelle${parcelles.length > 1 ? "s" : ""}) — aperçu prêt.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "calc(100vh - 64px)", // adapte selon la hauteur de ta topbar
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* ================================================================ */}
      {/* PANNEAU GAUCHE                                                   */}
      {/* ================================================================ */}
      <aside
        style={{
          width: 320,
          minWidth: 280,
          maxWidth: 380,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #e2e8f0",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        {/* En-tête */}
        <div
          style={{
            padding: "20px 20px 14px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: "#0f172a",
              letterSpacing: "-0.3px",
            }}
          >
            Identité foncière
          </h1>
          <div
            style={{
              marginTop: 12,
              padding: 10,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <input
              placeholder="INSEE"
              value={manualInsee}
              onChange={(e) => setManualInsee(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <input
              placeholder="Section"
              value={manualSection}
              onChange={(e) => setManualSection(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <input
              placeholder="Numéro"
              value={manualNumero}
              onChange={(e) => setManualNumero(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={handleAddManualParcelle}
              style={{
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#fff",
                borderRadius: 6,
                padding: "9px 10px",
                fontSize: 12,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Ajouter
            </button>
          </div>
        </div>

        {/* Liste des parcelles sélectionnées */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px",
          }}
        >
          <UrbanismeDocsPanel insee={selectedInsee} />
          {parcelles.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
                marginTop: 32,
                lineHeight: 1.6,
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                style={{ display: "block", margin: "0 auto 10px" }}
              >
                <rect x="3" y="3" width="8" height="8" rx="1" />
                <rect x="13" y="3" width="8" height="8" rx="1" />
                <rect x="3" y="13" width="8" height="8" rx="1" />
                <rect x="13" y="13" width="8" height="8" rx="1" />
              </svg>
              Aucune parcelle sélectionnée
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Parcelles ({parcelles.length})
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "#94a3b8",
                    padding: 0,
                  }}
                >
                  Tout effacer
                </button>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                {parcelles.map((p) => (
                  <ParcelleBadge
                    key={parcelleKey(p)}
                    parcelle={p}
                    onRemove={() => handleParcelleRemove(parcelleKey(p))}
                  />
                ))}
              </ul>

              {/* Résumé UF */}
              {parcelles.length > 1 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 10px",
                    background: "#f8fafc",
                    borderRadius: 7,
                    fontSize: 12,
                    color: "#475569",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>
                    {parcelles.length} parcelles
                  </strong>{" "}
                  constitueront l'unité foncière.
                </div>
              )}
            </>
          )}
        </div>

        {/* Pied — actions */}
        <div
          style={{
            padding: "14px 16px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {error && (
            <div
              style={{
                fontSize: 12,
                color: "#b91c1c",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                padding: "7px 10px",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                fontSize: 12,
                color: "#166534",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 6,
                padding: "7px 10px",
              }}
            >
              {success}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={loading || parcelles.length === 0}
            style={{
              border: "1px solid",
              borderColor:
                loading || parcelles.length === 0 ? "#cbd5e1" : "#0f172a",
              background:
                loading || parcelles.length === 0 ? "#f8fafc" : "#0f172a",
              color:
                loading || parcelles.length === 0 ? "#94a3b8" : "#ffffff",
              borderRadius: 8,
              padding: "11px 14px",
              cursor:
                loading || parcelles.length === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s",
              width: "100%",
            }}
          >
            {loading ? (
              <>
                <SpinnerInline /> Génération en cours…
              </>
            ) : (
              <>
                <PdfIcon />
                Générer le rapport PDF
              </>
            )}
          </button>

          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "#94a3b8",
              textAlign: "center",
            }}
          >
            Clic sur une parcelle pour la désélectionner sur la carte
          </p>
        </div>
      </aside>

      {/* ================================================================ */}
      {/* CARTE CADASTRALE                                                 */}
      {/* ================================================================ */}
      <main style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <CadastreMap
          onParcelleSelect={handleParcelleSelect}
          selectedParcelles={parcelles}
          style={{ height: "100%" }}
        />
        {pdfPreviewUrl && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              bottom: 8,
              left: 8,
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              boxShadow: "0 14px 38px rgba(2,6,23,0.20)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 500,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
                gap: 8,
              }}
            >
              <strong
                style={{
                  fontSize: 12,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={pdfFilename}
              >
                Aperçu PDF — {pdfFilename}
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <a
                  href={pdfPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11,
                    color: "#334155",
                    textDecoration: "none",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "4px 8px",
                    background: "#fff",
                  }}
                >
                  Ouvrir
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPdfPreviewUrl((prev) => {
                      if (prev) window.URL.revokeObjectURL(prev);
                      return null;
                    });
                  }}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 11,
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            </div>
            <iframe
              title="Aperçu rapport identité foncière"
              src={pdfPreviewUrl}
              style={{ width: "100%", height: "100%", border: "none", background: "#f1f5f9" }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icônes inline
// ---------------------------------------------------------------------------

function PdfIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

function SpinnerInline() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="16 6"
      />
    </svg>
  );
}