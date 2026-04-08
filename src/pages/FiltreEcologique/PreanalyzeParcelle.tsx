import { useEffect, useRef, useState } from "react";
import { connectPreanalyzeParcelleStream } from "../../api";
import type { PreanalyzeLayerRow } from "../../api";

/** Ligne du tableau de pré-analyse (remplissage progressif). */
type PreanalyzeTableSlot = {
  key: string;
  label: string;
  phase: "pending" | "running" | "done";
  row?: PreanalyzeLayerRow;
};

type PreanalyzeParcelleMeta = {
  parcelle: {
    surface_ha: number;
    buffer_m: number;
    perimeter_m?: number;
    miller?: number;
  };
};

function formatEntityCount(slot: PreanalyzeTableSlot): { text: string; variant: "pending" | "running" | "has" | "zero" | "na" } {
  if (slot.phase === "pending") return { text: "—", variant: "pending" };
  if (slot.phase === "running") return { text: "…", variant: "running" };
  const row = slot.row;
  if (!row) return { text: "—", variant: "na" };
  if (row.status === "error" || row.status === "skipped") return { text: "—", variant: "na" };
  const n = typeof row.n === "number" ? row.n : 0;
  return { text: `${n} entité(s)`, variant: n > 0 ? "has" : "zero" };
}

/** Ancien libellé serveur — rétrocompatibilité. */
function normalizeHydroExtrait(s: string): string {
  return s.replace(/^\s*Pas d'intersection\s*[—–-]\s*plus proche\s*:\s*/i, "Plus proche : ");
}

/**
 * Infos complémentaires : uniquement pour les modules qui en définissent (ZDV, hydro).
 * Les autres couches : cellule vide (le comptage suffit).
 */
function formatLayerInfos(slot: PreanalyzeTableSlot): { text: string; isError: boolean } {
  const row = slot.row;
  if (slot.phase !== "done" || !row) return { text: "", isError: false };
  if (row.status === "error" || row.status === "skipped") {
    return { text: row.error ?? "", isError: true };
  }

  const key = row.key;

  if (key === "zone_de_vegetation") {
    if (!row.intersects || (row.n ?? 0) === 0) return { text: "", isError: false };
    const d = row.detail as { natures?: Array<{ nature?: string }> } | undefined;
    const names = d?.natures?.map((x) => String(x.nature ?? "").trim()).filter(Boolean) ?? [];
    return { text: names.length ? names.join(", ") : "", isError: false };
  }

  if (key === "troncons_hydro" || key === "surfaces_hydro") {
    if (row.intersects) return { text: "", isError: false };
    const raw = row.samples?.map(normalizeHydroExtrait).filter(Boolean).join(" · ") ?? "";
    return { text: raw, isError: false };
  }

  return { text: "", isError: false };
}

export interface PreanalyzeParcelleProps {
  codeInsee: string;
  section: string;
  numero: string;
  /** true pendant création AOI / fetch (désactive le bouton). */
  aoiFlowBusy: boolean;
}

/**
 * Pré-analyse parcelle × couches (sans projet), flux WebSocket.
 * Bouton, métadonnées et tableau de rapport.
 */
export function PreanalyzeParcelle({
  codeInsee,
  section,
  numero,
  aoiFlowBusy,
}: PreanalyzeParcelleProps) {
  const [loading, setLoading] = useState(false);
  const [tableRows, setTableRows] = useState<PreanalyzeTableSlot[]>([]);
  const [meta, setMeta] = useState<PreanalyzeParcelleMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      closeRef.current?.();
      closeRef.current = null;
    };
  }, []);

  function handlePreanalyze() {
    setError(null);
    const insee = codeInsee.trim();
    const sec = section.trim();
    const num = numero.trim();
    if (!insee || !sec || !num) {
      setError("Renseignez INSEE, section et numéro.");
      return;
    }
    closeRef.current?.();
    closeRef.current = null;
    setLoading(true);
    setTableRows([]);
    setMeta(null);

    const close = connectPreanalyzeParcelleStream(
      {
        code_insee: insee,
        section: sec,
        numero: num,
        buffer_m: 50,
      },
      {
        onStart: (data) => {
          setMeta({
            parcelle: {
              surface_ha: data.parcelle.surface_ha,
              buffer_m: data.parcelle.buffer_m,
              perimeter_m: data.parcelle.perimeter_m,
              miller: data.parcelle.miller,
            },
          });
          setTableRows(
            data.layers_order.map((l) => ({
              key: l.key,
              label: l.label,
              phase: "pending",
            })),
          );
        },
        onRunning: (layerKey) => {
          setTableRows((prev) =>
            prev.map((r) => (r.key === layerKey ? { ...r, phase: "running" } : r)),
          );
        },
        onLayer: (layerRow) => {
          setTableRows((prev) =>
            prev.map((r) =>
              r.key === layerRow.key ? { ...r, phase: "done", row: layerRow } : r,
            ),
          );
        },
        onComplete: (data) => {
          setMeta({
            parcelle: {
              surface_ha: data.parcelle.surface_ha,
              buffer_m: data.parcelle.buffer_m,
              perimeter_m: data.parcelle.perimeter_m,
              miller: data.parcelle.miller,
            },
          });
          setLoading(false);
          closeRef.current = null;
        },
        onError: (message) => {
          setError(message);
          setLoading(false);
          closeRef.current = null;
        },
      },
    );
    closeRef.current = close;
  }

  const canClick =
    !loading &&
    !aoiFlowBusy &&
    !!codeInsee.trim() &&
    !!section.trim() &&
    !!numero.trim();

  return (
    <div className="create-aoi-preanalyze">
      <button
        type="button"
        className="btn-run create-aoi-preanalyze-btn"
        onClick={handlePreanalyze}
        disabled={!canClick}
        title="Intersections parcelle × couches SIG (BBOX = buffer 50 m pour le WFS). Peut prendre plusieurs minutes."
      >
        {loading ? "Pré-analyse en cours…" : "Pré-analyser la parcelle"}
      </button>
      {error && (
        <div className="create-aoi-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {(loading || tableRows.length > 0) && (
        <div className="create-aoi-preanalyze-report">
          {meta && (
            <div className="create-aoi-preanalyze-parcel-meta">
              <div className="create-aoi-preanalyze-parcel-line">
                Surface parcelle :{" "}
                <strong>{meta.parcelle.surface_ha.toFixed(4)} ha</strong>
              </div>
              {meta.parcelle.miller != null && (
                <div className="create-aoi-preanalyze-parcel-line">
                  Indice de Miller : <strong>{meta.parcelle.miller}</strong>
                </div>
              )}
            </div>
          )}
          {loading && tableRows.length === 0 && (
            <p className="create-aoi-preanalyze-connecting">Connexion au serveur…</p>
          )}
          {tableRows.length > 0 && (
            <div className="create-aoi-preanalyze-table-wrap">
              <table className="create-aoi-preanalyze-table">
                <thead>
                  <tr>
                    <th>Couche</th>
                    <th className="create-aoi-preanalyze-th-nb">Nb entités</th>
                    <th>Infos</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((slot) => {
                    const ec = formatEntityCount(slot);
                    const ex = formatLayerInfos(slot);
                    const countClass =
                      ec.variant === "has"
                        ? "create-aoi-preanalyze-count create-aoi-preanalyze-count--has"
                        : ec.variant === "zero"
                          ? "create-aoi-preanalyze-count create-aoi-preanalyze-count--zero"
                          : "create-aoi-preanalyze-count create-aoi-preanalyze-count--muted";
                    return (
                      <tr
                        key={slot.key}
                        className={
                          slot.phase === "running"
                            ? "create-aoi-preanalyze-tr--running"
                            : undefined
                        }
                      >
                        <td>{slot.label}</td>
                        <td className={countClass}>{ec.text}</td>
                        <td
                          className={
                            ex.isError
                              ? "create-aoi-preanalyze-infos create-aoi-preanalyze-infos--error"
                              : "create-aoi-preanalyze-infos"
                          }
                        >
                          {ex.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
