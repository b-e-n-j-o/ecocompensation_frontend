// ─── CadastreZoneControls ────────────────────────────────────────────────────
// Panneau flottant sur la carte : charger le cadastre d'une zone, sélectionner,
// ajouter la sélection au pool (via l'endpoint d'ajout existant, add_parcelles.py).
import { useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useCadastreZone } from "./useCadastreZone";
import "./cadastreZone.css";

interface Props {
  map: maplibregl.Map | null;
  apiBase: string;
  poolIdus: Set<string>;
  poolLayerIds?: string[];
  /** Dessine le cadastre au-dessus des résultats (cartes UF et îlots). */
  drawAboveResults?: boolean;
  /** Appelle l'endpoint d'ajout existant avec les idu ; doit recharger le pool ensuite. */
  onAddToPool?: (idus: string[]) => Promise<void>;
}

export function CadastreZoneControls({ map, apiBase, poolIdus, poolLayerIds, drawAboveResults, onAddToPool }: Props) {
  const cz = useCadastreZone({ map, apiBase, poolIdus, poolLayerIds, drawAboveResults });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState<{ x: number; y: number } | null>(null);
  const n = cz.selection.size;

  useEffect(() => {
    if (!cz.armed || !map) {
      setFollow(null);
      return;
    }
    const canvas = map.getCanvas();
    canvas.classList.add("cz-map-armed");
    const onMove = (e: MouseEvent) => setFollow({ x: e.clientX, y: e.clientY });
    const onLeave = () => setFollow(null);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.classList.remove("cz-map-armed");
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [cz.armed, map]);

  const add = async () => {
    if (!onAddToPool) return;
    setAdding(true);
    setError(null);
    try {
      await onAddToPool(cz.selectedIdus);
      cz.clearSelection();
    } catch (e) {
      setError(`Ajout impossible : ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="cz-panel">
      {cz.armed && follow && (
        <div
          className="cz-follow"
          style={{ left: follow.x, top: follow.y }}
          aria-hidden
        >
          <span className="cz-follow-target" />
          Cliquez ici pour afficher le cadastre
        </div>
      )}
      <div className="cz-row">
        {cz.armed ? (
          <button className="cz-btn cz-btn--ghost" onClick={cz.cancel}>Annuler</button>
        ) : (
          <button
            className="cz-btn"
            onClick={cz.arm}
            disabled={cz.loading}
          >
            {cz.loading ? "Chargement…" : "Afficher le cadastre"}
          </button>
        )}
        {cz.loadedCount > 0 && !cz.armed && (
          <button className="cz-btn cz-btn--ghost" onClick={cz.clearAll} title="Masquer le cadastre chargé">
            Masquer
          </button>
        )}
      </div>

      {cz.message && <div className="cz-msg">{cz.message}</div>}

      {n > 0 && (
        <div className="cz-selection">
          <div className="cz-sel-head">
            <strong>{n}</strong> parcelle{n > 1 ? "s" : ""} ·{" "}
            {cz.selectedAreaHa.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha
          </div>
          <ul className="cz-sel-list">
            {Array.from(cz.selection.values()).slice(0, 6).map((p) => (
              <li key={p.idu}>
                {p.nom_com} {p.section}-{p.numero}{" "}
                <span>{((p.contenance ?? 0) / 10_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha</span>
              </li>
            ))}
            {n > 6 && <li className="cz-more">+ {n - 6} autre(s)</li>}
          </ul>
          <div className="cz-row">
            {onAddToPool ? (
              <button className="cz-btn cz-btn--primary" onClick={add} disabled={adding}>
                {adding ? "Ajout…" : "Ajouter au pool"}
              </button>
            ) : null}
            <button className="cz-btn cz-btn--ghost" onClick={cz.clearSelection} disabled={adding}>
              Désélectionner
            </button>
          </div>
          {error && <div className="cz-msg cz-msg--err">{error}</div>}
        </div>
      )}
    </div>
  );
}
