import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { getApiBaseUrl } from "../../../../config/apiBase";

const SRC = "faune-obs";

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
  colonnes?: string[];
  colonne_espece?: string | null;
  colonne_date?: string | null;
  choix_requis?: boolean;
  gabarit?: string;
};

const LAYERS = ["faune-fill", "faune-line", "faune-circle"];

export function FauneDock({
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
  const api = `${getApiBaseUrl()}/api/reserve-fonciere/faune`;
  const [report, setReport] = useState<Report | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [gabarit, setGabarit] = useState<"sinp" | "libre">("libre");
  const [colEspece, setColEspece] = useState("");
  const [colDate, setColDate] = useState("");
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
        id: "faune-fill",
        type: "fill",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        paint: { "fill-color": "#c47b2b", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "faune-line",
        type: "line",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
        paint: { "line-color": "#8d5414", "line-width": 1.4 },
      });
      map.addLayer({
        id: "faune-circle",
        type: "circle",
        source: SRC,
        filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
        paint: { "circle-radius": 7, "circle-color": "#c47b2b", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
      for (const id of LAYERS) map.moveLayer(id);
      const vis = visible ? "visible" : "none";
      for (const id of LAYERS) map.setLayoutProperty(id, "visibility", vis);
      void reloadLayer();
    };
    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);
  }, [map, reloadLayer]);

  useEffect(() => {
    if (!map) return;
    const vis = visible ? "visible" : "none";
    for (const id of LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [map, visible]);

  useEffect(() => {
    if (!open) return;
    fetch(`${api}/imports`).then((r) => r.json()).then(setImports).catch(() => setImports([]));
  }, [open, api, msg]);

  async function dry(f: File, g = gabarit, espece = colEspece, dateCol = colDate) {
    setBusy(true);
    setMsg(null);
    setForceImport(false);
    const body = new FormData();
    body.append("file", f);
    const q = new URLSearchParams({ dry_run: "true", gabarit: g });
    if (espece) q.set("colonne_espece", espece);
    if (dateCol) q.set("colonne_date", dateCol);
    const res = await fetch(`${api}/import?${q}`, { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.detail || "Fichier refusé");
      setReport(null);
      return;
    }
    setReport(data);
    setColEspece(data.colonne_espece || "");
    setColDate(data.colonne_date || "");
  }

  async function commit() {
    if (!file || !colEspece) return;
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    const q = new URLSearchParams({ dry_run: "false", gabarit, colonne_espece: colEspece });
    if (colDate) q.set("colonne_date", colDate);
    const res = await fetch(`${api}/import?${q}`, { method: "POST", body });
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
    setColEspece("");
    setColDate("");
    dry(f, gabarit, "", "");
  };

  const crs = formatCrs(report?.crs_detecte);
  const colonnes = report?.colonnes ?? [];

  return (
    <div className="di-tool-body di-flore">
      <label className="di-faune-field">
        Gabarit
        <select
          value={gabarit}
          disabled={busy}
          onChange={(e) => {
            const g = e.target.value as "sinp" | "libre";
            setGabarit(g);
            if (file) dry(file, g, "", "");
          }}
        >
          <option value="sinp">SINP (Nom_Taxon, Date_Deb)</option>
          <option value="libre">Libre</option>
        </select>
      </label>
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
        aria-label="Déposer un fichier d'observations faune"
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

      {report && colonnes.length > 0 && (
        <label className="di-faune-field">
          Choisir la colonne qui sera le nom de l'espèce
          <select
            value={colEspece}
            disabled={busy}
            onChange={(e) => {
              setColEspece(e.target.value);
              if (file) dry(file, gabarit, e.target.value, colDate);
            }}
          >
            <option value="">Choisir une colonne</option>
            {colonnes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

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
          {report.choix_requis && (
            <p className="di-flore-crs">
              {report.nb_lignes} géométries lues, aucune rejetée. Choisissez la colonne du nom d'espèce pour les valider.
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
                  setColEspece("");
                  setColDate("");
                  setForceImport(false);
                  setMsg(null);
                }}
              >
                Ne pas importer
              </button>
            </div>
          ) : (
            <button type="button" className="di-flore-import" disabled={busy || report.nb_valides === 0 || !colEspece} onClick={commit}>
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
