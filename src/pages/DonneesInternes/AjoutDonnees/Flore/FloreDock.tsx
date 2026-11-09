import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { getApiBaseUrl } from "../../../../config/apiBase";

const SRC = "flore-obs";

type ImportRow = { id: number; fichier: string; nb_inserees: number; created_at: string | null };
type Report = {
  nb_lignes: number;
  nb_valides: number;
  nb_rejetees: number;
  nb_doublons?: number;
  deja_en_base?: boolean;
  fichiers_deja?: string[];
  rejets: { ligne: number; raison: string }[];
  apercu: Record<string, unknown>[];
  crs_detecte?: string;
};

const FLORE_LAYERS = ["flore-fill", "flore-line", "flore-circle"];

export function FloreDock({
  map,
  open,
  visible,
  onStats,
}: {
  map: maplibregl.Map | null;
  open: boolean;
  visible: boolean;
  onStats?: (count: number, truncated: boolean) => void;
}) {
  const api = `${getApiBaseUrl()}/api/reserve-fonciere/flore`;
  const [report, setReport] = useState<Report | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [forceImport, setForceImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  const reloadLayer = useCallback(async () => {
    if (!map || !map.getSource(SRC)) return;
    const res = await fetch(`${api}/observations`);
    if (!res.ok) return;
    const fc = await res.json();
    (map.getSource(SRC) as maplibregl.GeoJSONSource).setData(fc);
    onStatsRef.current?.(fc.features?.length ?? 0, Boolean(fc.truncated));
  }, [map, api]);

  useEffect(() => {
    if (!map) return;
    const setup = () => {
      if (map.getSource(SRC)) return;
      map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "flore-fill",
        type: "fill",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: { "fill-color": "#2f7d5b", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "flore-line",
        type: "line",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
        paint: { "line-color": "#1f6b4a", "line-width": 1.4 },
      });
      map.addLayer({
        id: "flore-circle",
        type: "circle",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
        paint: { "circle-radius": 5, "circle-color": "#2f7d5b", "circle-stroke-width": 1, "circle-stroke-color": "#fff" },
      });
      map.on("click", "flore-circle", (e) => showPopup(map, e));
      map.on("click", "flore-fill", (e) => showPopup(map, e));
      map.on("click", "flore-line", (e) => showPopup(map, e));
      const vis = visible ? "visible" : "none";
      for (const id of FLORE_LAYERS) map.setLayoutProperty(id, "visibility", vis);
      void reloadLayer();
    };
    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);
  }, [map, reloadLayer]);

  useEffect(() => {
    if (!map) return;
    const vis = visible ? "visible" : "none";
    for (const id of FLORE_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [map, visible]);

  useEffect(() => {
    if (!open) return;
    fetch(`${api}/imports`).then((r) => r.json()).then(setImports).catch(() => setImports([]));
  }, [open, api, msg]);

  async function dry(f: File) {
    setBusy(true);
    setMsg(null);
    setForceImport(false);
    const body = new FormData();
    body.append("file", f);
    const res = await fetch(`${api}/import?dry_run=true`, { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.detail || "Fichier refusé");
      setReport(null);
      return;
    }
    setReport(data);
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${api}/import?dry_run=false`, { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.detail || "Import impossible");
      return;
    }
    setMsg(`${data.nb_inserees ?? 0} observation(s) importée(s), ${data.nb_doublons ?? 0} doublon(s).`);
    setReport(null);
    setFile(null);
    reloadLayer();
  }

  async function cancelImport(id: number) {
    if (!window.confirm("Annuler cet import et supprimer ses observations ?")) return;
    const res = await fetch(`${api}/imports/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg("Annulation impossible");
      return;
    }
    setMsg("Import annulé.");
    reloadLayer();
  }

  if (!open) return null;

  const takeFile = (f: File | undefined) => {
    if (!f || busy) return;
    setFile(f);
    dry(f);
  };

  const crs = formatCrs(report?.crs_detecte);

  return (
    <div className="di-tool-body di-flore">
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.gpkg,.geojson,.json"
        hidden
        onChange={(e) => {
          takeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        className={`di-dropzone${dragOver ? " is-over" : ""}${busy ? " is-busy" : ""}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Déposer un fichier d'observations flore"
        onClick={() => { if (!busy) fileRef.current?.click(); }}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          takeFile(e.dataTransfer.files?.[0]);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
        </svg>
        <strong>{busy && !report ? "Lecture du fichier…" : file ? file.name : "Glissez un ZIP, GeoPackage ou GeoJSON"}</strong>
        <span>ou cliquez pour parcourir</span>
      </div>

      {report && (
        <div className="di-flore-report">
          <div className="di-flore-stats">
            <span><strong>{report.nb_valides}</strong> valides</span>
            <span><strong>{report.nb_lignes}</strong> lignes</span>
            <span><strong>{report.nb_rejetees}</strong> rejets</span>
          </div>
          {crs && <p className="di-flore-crs">CRS {crs}</p>}
          {report.deja_en_base && (
            <p className="di-flore-warn">
              Ces géométries sont potentiellement déjà en base
              {report.fichiers_deja?.length
                ? ` sous le nom de fichier ${report.fichiers_deja.map((f) => `« ${f} »`).join(", ")}`
                : " (import précédent)"}
              . Les doublons spatiaux ne seront pas réécrits.
            </p>
          )}
          {!report.deja_en_base && (report.nb_doublons ?? 0) > 0 && (
            <p className="di-flore-warn">
              {report.nb_doublons} déjà en base
              {report.fichiers_deja?.length ? ` (${report.fichiers_deja.join(", ")})` : ""}
              , les autres seront ajoutées.
            </p>
          )}
          {report.rejets.length > 0 && (
            <ul className="di-flore-rejets">
              {report.rejets.slice(0, 6).map((r) => (
                <li key={`${r.ligne}-${r.raison}`}>Ligne {r.ligne} — {r.raison}</li>
              ))}
            </ul>
          )}
          {report.deja_en_base && !forceImport ? (
            <div className="di-flore-actions">
              <button type="button" className="di-flore-import di-flore-import--warn" disabled={busy} onClick={() => setForceImport(true)}>
                Importer quand même
              </button>
              <button
                type="button"
                className="di-flore-cancel"
                disabled={busy}
                onClick={() => {
                  setReport(null);
                  setFile(null);
                  setForceImport(false);
                  setMsg(null);
                }}
              >
                Ne pas importer
              </button>
            </div>
          ) : (
            <button type="button" className="di-flore-import" disabled={busy || report.nb_valides === 0} onClick={commit}>
              {busy ? "Import…" : `Importer ${report.nb_valides} observation${report.nb_valides > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}

      {msg && <p className={msg.includes("impossible") || msg.includes("refusé") ? "di-error" : "di-flore-ok"}>{msg}</p>}

      {imports.length > 0 && (
        <div className="di-flore-catalog">
          <div className="di-flore-catalog__head">
            <span>Fichiers en base</span>
            <span className="di-flore-catalog__count">{imports.length}</span>
          </div>
          <ul className={`di-flore-history${imports.length > 4 ? " is-scroll" : ""}`}>
            {imports.map((imp) => (
              <li key={imp.id}>
                <span className="di-flore-history__file" title={imp.fichier}>
                  <span className="di-flore-history__ext">{fileExt(imp.fichier)}</span>
                  <span className="di-flore-history__name">{imp.fichier}</span>
                  {imp.created_at && (
                    <span className="di-flore-history__date">{formatImportDate(imp.created_at)}</span>
                  )}
                </span>
                <span className="di-flore-history__n" title="Observations importées">
                  {imp.nb_inserees}
                </span>
                <button type="button" onClick={() => cancelImport(imp.id)}>
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function fileExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] ?? "file").toUpperCase();
}

function formatImportDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCrs(raw: string | undefined): string {
  if (!raw) return "";
  if (/2154/.test(raw)) return "EPSG:2154";
  if (/4326/.test(raw)) return "EPSG:4326";
  if (raw === "suppose_2154") return "EPSG:2154 (supposé)";
  return raw.replace(/^EPSG:/i, "EPSG:");
}

function showPopup(map: maplibregl.Map, e: maplibregl.MapLayerMouseEvent) {
  const p = e.features?.[0]?.properties;
  if (!p) return;
  const html = `<strong>${p.nom_scientifique || ""}</strong><br/>${p.nom_vernaculaire || ""}<br/>${p.date_observation || ""}<br/>${p.observateur || ""}<br/>${p.milieu || ""}`;
  new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
}
