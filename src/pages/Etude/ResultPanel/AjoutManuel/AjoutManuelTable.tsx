import { useState } from "react";
import type { ParcelleResult } from "../../../../types";

interface Props {
  parcelles: ParcelleResult[];
  onIntegrate: (idus: string[]) => Promise<void>;
  onRowActivate?: (idu: string) => void;
  onHover?: (idu: string | null) => void;
  hoverIdu?: string | null;
  selectedIdu?: string | null;
}

export function AjoutManuelTable({
  parcelles,
  onIntegrate,
  onRowActivate,
  onHover,
  hoverIdu,
  selectedIdu,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!parcelles.length) return null;

  const integrateAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await onIntegrate(parcelles.map((p) => p.idu));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Intégration impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ranking-wrap ajout-manuel-wrap">
      <div className="ranking-chrome">
        <div className="ranking-chrome__bar">
          <span className="ranking-title">Ajout manuel</span>
          <span className="ranking-count mono">
            {parcelles.length} en attente
          </span>
          <button type="button" className="ranking-chrome__toggle" disabled={busy} onClick={integrateAll}>
            {busy ? "Intégration…" : "Intégrer au classement"}
          </button>
        </div>
        {error && <div className="cz-msg cz-msg--err">{error}</div>}
      </div>
      <table className="ranking-table">
        <tbody>
          {parcelles.map((p) => (
            <tr
              key={p.idu}
              className={`ranking-row${hoverIdu === p.idu ? " hovered" : ""}${selectedIdu === p.idu ? " selected" : ""}`}
              onClick={() => onRowActivate?.(p.idu)}
              onMouseEnter={() => onHover?.(p.idu)}
              onMouseLeave={() => onHover?.(null)}
            >
              <td className="mono">{p.idu}</td>
              <td className="mono">{p.surface_ha.toFixed(2)} ha</td>
              <td>
                <span className="ajout-manuel-tag">Ajout manuel</span>
              </td>
              <td>
                <button
                  type="button"
                  className="ranking-chrome__toggle"
                  disabled={busy}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setBusy(true);
                    setError(null);
                    onIntegrate([p.idu])
                      .catch((e) => setError(e instanceof Error ? e.message : "Intégration impossible"))
                      .finally(() => setBusy(false));
                  }}
                >
                  Intégrer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
