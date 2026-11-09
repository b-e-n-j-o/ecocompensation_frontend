import { useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { analyseFoncier, previewFoncierUpload } from "../../api";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { FloraTaxonPicker, type FloraPick } from "./FloraTaxonPicker";

const ACCEPT = ".gpkg,.zip";

type LoadedFile = { name: string; label: string; file: File };

async function readGeoLabel(file: File): Promise<string> {
  const preview = await previewFoncierUpload(file);
  const props = (preview.feature?.properties ?? {}) as Record<string, unknown>;
  const name = typeof props.name === "string" ? props.name : file.name;
  return name;
}

/** Ébauche : qualifier un foncier connu (pas de recherche). Le croisement n'est pas encore lancé. */
export function AnalyseFoncierPanel() {
  const navigate = useNavigate();
  const projetRef = useRef<HTMLInputElement>(null);
  const foncierRef = useRef<HTMLInputElement>(null);
  const [projet, setProjet] = useState<LoadedFile | null>(null);
  const [foncier, setFoncier] = useState<LoadedFile | null>(null);
  const [busy, setBusy] = useState<"projet" | "foncier" | null>(null);
  const [drag, setDrag] = useState<"projet" | "foncier" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sol, setSol] = useState(true);
  const [hydro, setHydro] = useState(true);
  const [fauna, setFauna] = useState<string[]>([]);
  const [flora, setFlora] = useState<FloraPick[]>([]);
  const [qualifying, setQualifying] = useState(false);

  async function load(kind: "projet" | "foncier", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      const label = await readGeoLabel(file);
      const loaded = { name: file.name, label, file };
      if (kind === "projet") setProjet(loaded);
      else setFoncier(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture du fichier impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function qualify() {
    if (!projet || !foncier) return;
    setQualifying(true);
    setError(null);
    try {
      const res = await analyseFoncier({
        projet: projet.file,
        foncier: foncier.file,
        occupationSol: sol,
        hydro,
        faunaSpecies: fauna,
        flora: flora.map((item) => ({ taxon_key: item.taxon_key, label: item.label })),
      });
      navigate(`/projects/${res.project_id}/runs/${res.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La qualification a échoué.");
    } finally {
      setQualifying(false);
    }
  }

  function dropZone(kind: "projet" | "foncier", file: LoadedFile | null, inputRef: RefObject<HTMLInputElement | null>) {
    const locked = busy != null || qualifying;
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          className="eco-aoi-file-input-hidden"
          accept={ACCEPT}
          disabled={locked}
          onChange={(e) => {
            void load(kind, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div
          className={`eco-aoi-dropzone${drag === kind ? " eco-aoi-dropzone--active" : ""}${file ? " eco-aoi-dropzone--filled" : ""}`}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-disabled={locked}
          aria-label={kind === "projet" ? "Déposer le fichier du projet" : "Déposer le foncier à analyser"}
          onKeyDown={(e) => {
            if (locked) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onClick={() => {
            if (!locked) inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!locked) setDrag(kind);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(null);
            if (locked) return;
            void load(kind, e.dataTransfer.files?.[0]);
          }}
        >
          <span className="eco-aoi-dropzone-icon" aria-hidden>↑</span>
          {busy === kind ? (
            <span className="eco-aoi-dropzone-title">Analyse du fichier en cours…</span>
          ) : file ? (
            <>
              <span className="eco-aoi-dropzone-title">{file.name}</span>
              <span className="eco-aoi-dropzone-hint">Cliquez ou déposez un autre fichier pour remplacer</span>
            </>
          ) : (
            <>
              <span className="eco-aoi-dropzone-title">Glissez-déposez votre fichier ici</span>
              <span className="eco-aoi-dropzone-hint">ou cliquez pour parcourir vos fichiers</span>
            </>
          )}
          <span className="eco-aoi-dropzone-formats">GeoPackage (.gpkg) ou Shapefile zippé (.zip)</span>
        </div>
      </>
    );
  }

  return (
    <div className="eco-aoi-form analyse-foncier">
      <p className="eco-aoi-intro">
        Le foncier est déjà connu. On le qualifie par rapport au projet, sans rechercher de nouvelles parcelles.
      </p>

      <section className="eco-filter-block">
        <h3 className="eco-filter-block-title">Projet</h3>
        <p className="analyse-foncier__hint">Même emprise que pour une recherche : le contexte géométrique du projet.</p>
        {dropZone("projet", projet, projetRef)}
      </section>

      <section className="eco-filter-block">
        <h3 className="eco-filter-block-title">Foncier à analyser</h3>
        <p className="analyse-foncier__hint">Chaque géométrie du fichier sera croisée avec les couches d&apos;enrichissement.</p>
        {dropZone("foncier", foncier, foncierRef)}
      </section>

      <section className="eco-filter-block">
        <h3 className="eco-filter-block-title">Qualification</h3>
        <label className="analyse-foncier__check">
          <input type="checkbox" checked={sol} onChange={(e) => setSol(e.target.checked)} />
          Occupation du sol
        </label>
        <label className="analyse-foncier__check">
          <input type="checkbox" checked={hydro} onChange={(e) => setHydro(e.target.checked)} />
          Hydrographie
        </label>
        <p className="analyse-foncier__hint">Espèces : pas de rayon. Distance à l&apos;observation la plus proche, pour chaque géométrie.</p>
        <FaunaSpeciesPicker selectedSpecies={fauna} onChange={setFauna} compact />
        <div className="analyse-foncier__flora">
          <FloraTaxonPicker selected={flora} onChange={setFlora} />
        </div>
      </section>

      {error && <div className="eco-aoi-error">{error}</div>}
      <button
        type="button"
        className="eco-aoi-btn eco-aoi-btn--primary"
        disabled={!projet || !foncier || busy != null || qualifying}
        onClick={() => void qualify()}
      >
        {qualifying ? "Qualification en cours…" : "Qualifier le foncier"}
      </button>
    </div>
  );
}
