import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../../config/apiBase";

type Report = {
  nb_lignes: number;
  nb_valides: number;
  nb_rejetees: number;
  nb_doublons?: number;
  deja_en_base?: boolean;
  fichiers_deja?: string[];
  rejets?: { ligne: number; raison: string }[];
  colonnes?: string[];
  colonne_espece?: string | null;
  colonne_nom?: string | null;
  choix_requis?: boolean;
  gabarit?: string;
};

type ImportRow = { id: number; fichier: string; nb_inserees: number };

type Props = {
  kind: "faune" | "flore";
  disabled?: boolean;
  onImported?: () => void;
};

export function ObservationZipImport({ kind, disabled, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [column, setColumn] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [forceImport, setForceImport] = useState(false);
  const api = `${getApiBaseUrl()}/api/reserve-fonciere/${kind}`;
  const label = kind === "faune" ? "faune" : "flore";

  useEffect(() => {
    let cancelled = false;
    fetch(`${api}/imports`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ImportRow[]) => {
        if (!cancelled) setImports(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setImports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, msg]);

  async function dry(f: File, col = "") {
    setBusy(true);
    setMsg(null);
    const body = new FormData();
    body.append("file", f);
    const q = new URLSearchParams({ dry_run: "true" });
    if (kind === "faune") q.set("gabarit", "libre");
    if (col) q.set(kind === "faune" ? "colonne_espece" : "colonne_nom", col);
    const res = await fetch(`${api}/import?${q}`, { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setReport(null);
      setMsg(typeof data.detail === "string" ? data.detail : "Fichier refusé");
      return;
    }
    setReport(data);
    setColumn(data.colonne_espece || data.colonne_nom || col || "");
  }

  async function commit() {
    if (!file || !column) return;
    setBusy(true);
    setMsg(null);
    const body = new FormData();
    body.append("file", file);
    const q = new URLSearchParams({ dry_run: "false" });
    if (kind === "faune") q.set("gabarit", "libre");
    q.set(kind === "faune" ? "colonne_espece" : "colonne_nom", column);
    const res = await fetch(`${api}/import?${q}`, { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(typeof data.detail === "string" ? data.detail : "Import impossible");
      return;
    }
    setMsg(`${data.nb_inserees ?? 0} observation(s) enregistrée(s). Elles restent en base pour les prochains filtres.`);
    setReport(null);
    setFile(null);
    setColumn("");
    onImported?.();
  }

  function abortImport() {
    setFile(null);
    setReport(null);
    setColumn("");
    setForceImport(false);
    setMsg(null);
    setBusy(false);
  }

  const colonnes = report?.colonnes ?? [];
  const shown = imports.slice(0, 2);
  const rest = imports.slice(2);

  return (
    <div className="eco-obs-import">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.gpkg,.geojson,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setFile(f);
          setColumn("");
          setForceImport(false);
          void dry(f, "");
        }}
      />
      <button
        type="button"
        className={`eco-obs-import__toggle${file ? " is-open" : ""}`}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <span className="eco-obs-import__plus" aria-hidden>+</span>
        {busy && !report ? "Lecture du fichier…" : `Importer vos données ${label}`}
      </button>
      {imports.length > 0 && (
        <div className="eco-imports">
          <button type="button" className="eco-imports__toggle" aria-expanded={showFiles} onClick={() => setShowFiles((v) => !v)}>
            Voir vos données ({imports.length})
          </button>
          {showFiles && (
            <div className="eco-imports__list">
              {shown.map((imp) => (
                <span key={imp.id} className="eco-imports__chip" title={imp.fichier}>
                  {imp.fichier}
                  <em>{imp.nb_inserees}</em>
                </span>
              ))}
              {rest.length > 0 && (
                <select className="eco-imports__more" defaultValue="" aria-label="Autres fichiers importés">
                  <option value="">{rest.length} autre{rest.length > 1 ? "s" : ""} fichier{rest.length > 1 ? "s" : ""}</option>
                  {rest.map((imp) => (
                    <option key={imp.id} value={imp.id}>{imp.fichier} ({imp.nb_inserees})</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}
      {file && <p className="eco-aoi-slider-caption">{file.name}</p>}
      {report?.deja_en_base && (
        <p className="eco-obs-import__warn">
          Ces géométries sont potentiellement déjà en base
          {report.fichiers_deja?.length
            ? ` sous le nom de fichier ${report.fichiers_deja.map((f) => `« ${f} »`).join(", ")}`
            : " (import précédent)"}
          . Les doublons spatiaux ne seront pas réécrits.
        </p>
      )}
      {report && !report.deja_en_base && (report.nb_doublons ?? 0) > 0 && (
        <p className="eco-obs-import__warn">
          {report.nb_doublons} observation(s) déjà présentes
          {report.fichiers_deja?.length ? ` (${report.fichiers_deja.join(", ")})` : ""}
          , les autres seront ajoutées.
        </p>
      )}
      {report?.deja_en_base && !forceImport && (
        <div className="eco-obs-import__actions">
          <button type="button" className="eco-obs-import__force" disabled={disabled || busy} onClick={() => setForceImport(true)}>
            Importer quand même
          </button>
          <button type="button" className="eco-obs-import__cancel" disabled={disabled || busy} onClick={abortImport}>
            Ne pas importer
          </button>
        </div>
      )}
      {colonnes.length > 0 && (
        <label className="eco-obs-import__field">
          Colonne du nom d'espèce
          <select
            value={column}
            disabled={disabled || busy}
            onChange={(e) => {
              setColumn(e.target.value);
              if (file) void dry(file, e.target.value);
            }}
          >
            <option value="">Choisir la colonne</option>
            {colonnes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span>Ce nom sera celui retrouvé ensuite dans vos données, quand vous chercherez l'espèce.</span>
        </label>
      )}
      {report && (
        <p className="eco-aoi-slider-caption">
          {report.nb_valides} valides · {report.nb_lignes} lignes · {report.nb_rejetees} rejets
          {report.choix_requis ? " — choisissez la colonne du nom pour valider le fichier." : ""}
        </p>
      )}
      {report && (report.rejets ?? []).slice(0, 3).map((r) => (
        <p key={`${r.ligne}-${r.raison}`} className="eco-aoi-slider-caption">Ligne {r.ligne} — {r.raison}</p>
      ))}
      {report && column && report.nb_valides > 0 && (!report.deja_en_base || forceImport) && (
        <button type="button" className="eco-layer-row eco-layer-row--inset" disabled={disabled || busy} onClick={() => void commit()}>
          {busy ? "Enregistrement…" : `Enregistrer ${report.nb_valides} observation${report.nb_valides > 1 ? "s" : ""}`}
        </button>
      )}
      {msg && <p className="eco-aoi-slider-caption">{msg}</p>}
    </div>
  );
}
