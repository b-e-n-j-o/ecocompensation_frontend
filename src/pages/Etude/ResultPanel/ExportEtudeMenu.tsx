import { useState } from "react";
import { exportEtudeGpkg, type EtudeExportLayer } from "../../../api";

const OPTIONS: { id: EtudeExportLayer; label: string; hint: string }[] = [
  { id: "parcelles", label: "Parcelles", hint: "Classement du pool" },
  { id: "uf", label: "Unités foncières", hint: "UF + parcelles + combinaisons" },
  { id: "ilots", label: "Îlots RPG", hint: "Îlot + parcelles cadastrales" },
];

const ALL_PICKED: Record<EtudeExportLayer, boolean> = {
  parcelles: true,
  uf: true,
  ilots: true,
};

/** Bornes de la jauge résultats. null = curseur au maximum, pas de réduction. */
export type ExportJauge = {
  maxDistanceKm: number | null;
  minSurfaceHa: number | null;
};

export function exportJaugeFrom(input: {
  hideDistanceFilter?: boolean;
  distanceMaxKm: number;
  distanceCursorKm: number;
  surfaceMinHa: number;
} | null | undefined): ExportJauge | null {
  if (!input) return null;
  const distanceActive = !input.hideDistanceFilter
    && input.distanceMaxKm > 0
    && input.distanceCursorKm < input.distanceMaxKm - 0.05;
  const surfaceActive = input.surfaceMinHa > 0.05;
  if (!distanceActive && !surfaceActive) return null;
  return {
    maxDistanceKm: distanceActive ? input.distanceCursorKm : null,
    minSurfaceHa: surfaceActive ? input.surfaceMinHa : null,
  };
}

/** Bouton vert : tout est coché par défaut, on peut décocher pour n’exporter que certaines couches. */
export function ExportEtudeMenu({
  projectId,
  poolRunId = null,
  disabled = false,
  page = "parcelles",
  jauge = null,
}: {
  projectId?: string | null;
  poolRunId?: string | null;
  disabled?: boolean;
  page?: EtudeExportLayer;
  jauge?: ExportJauge | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<EtudeExportLayer, boolean>>(ALL_PICKED);

  const selected = OPTIONS.map((o) => o.id).filter((id) => picked[id]);
  const allOn = selected.length === OPTIONS.length;

  async function run(layers: EtudeExportLayer[]) {
    if (!projectId || !layers.length) return;
    const active = jauge && (jauge.maxDistanceKm != null || (jauge.minSurfaceHa != null && jauge.minSurfaceHa > 0));
    let apply = false;
    if (active && jauge) {
      const bits: string[] = [];
      if (jauge.maxDistanceKm != null) bits.push(`à ${jauge.maxDistanceKm.toFixed(1)} km ou moins du projet`);
      if (jauge.minSurfaceHa != null && jauge.minSurfaceHa > 0) bits.push(`d'au moins ${jauge.minSurfaceHa.toFixed(1)} ha`);
      apply = window.confirm(
        `La jauge est active. Exporter seulement les parcelles, unités foncières et îlots ${bits.join(" et ")} ?\n\nOK : uniquement ces éléments.\nAnnuler : tout le pool.`,
      );
    }
    setBusy(true);
    try {
      await exportEtudeGpkg(
        projectId,
        layers,
        poolRunId,
        apply && jauge ? jauge : null,
      );
      setOpen(false);
    } catch (err) {
      console.error("Export étude:", err);
      alert(err instanceof Error ? err.message : "Erreur lors de l'export.");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setOpen((was) => {
      const next = !was;
      if (next) setPicked(ALL_PICKED);
      return next;
    });
  }

  if (!projectId) return null;

  return (
    <div className="ranking-export">
      <button
        type="button"
        className={`ranking-btn-export-sig${open ? " is-on" : ""}`}
        disabled={disabled || busy}
        aria-expanded={open}
        title="GeoPackage QGIS (zone projet et aire d'étude incluses)"
        onClick={toggle}
      >
        {busy ? "Export…" : "Exporter SIG"}
      </button>
      {open && (
        <div className="ranking-export__menu" role="menu">
          <label className={`ranking-export__opt${allOn ? " is-page" : ""}`}>
            <input
              type="checkbox"
              checked={allOn}
              disabled={busy}
              onChange={() => setPicked(allOn ? { parcelles: false, uf: false, ilots: false } : ALL_PICKED)}
            />
            <span>
              Tout exporter
              <span className="ranking-line-empty" style={{ display: "block", fontSize: 10 }}>
                Parcelles, UF et îlots RPG
              </span>
            </span>
          </label>
          <div className="ranking-export__hint">
            Couches (cette page : {OPTIONS.find((o) => o.id === page)?.label})
          </div>
          {OPTIONS.map((o) => (
            <label key={o.id} className={`ranking-export__opt${o.id === page ? " is-page" : ""}`}>
              <input
                type="checkbox"
                checked={picked[o.id]}
                disabled={busy}
                onChange={() => setPicked((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
              />
              <span>
                {o.label}
                <span className="ranking-line-empty" style={{ display: "block", fontSize: 10 }}>{o.hint}</span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="ranking-btn-export-sig ranking-export__go"
            disabled={busy || selected.length === 0}
            onClick={() => void run(selected)}
          >
            {busy ? "Export…" : "Exporter"}
          </button>
        </div>
      )}
    </div>
  );
}
