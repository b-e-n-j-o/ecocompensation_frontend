import { useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { analyseFoncier, previewFoncierUpload } from "../../api";
import { FaunaSpeciesPicker } from "../../components/FilterPanel/FaunaSpeciesPicker";
import { FloraTaxonPicker, type FloraPick } from "../FiltreEcologique/FloraTaxonPicker";
import { ObservationZipImport } from "../FiltreEcologique/ObservationZipImport";
import "../FiltreEcologique/createAoiPage.css";
import "./AnalyseFoncier.css";

const ACCEPT = ".gpkg,.zip";

type LoadedFile = { name: string; label: string; file: File };

async function readGeoLabel(file: File): Promise<string> {
  const preview = await previewFoncierUpload(file);
  const props = (preview.feature?.properties ?? {}) as Record<string, unknown>;
  const name = typeof props.name === "string" ? props.name : file.name;
  return name;
}

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
  const [coursEau, setCoursEau] = useState(true);
  const [plansEau, setPlansEau] = useState(true);
  const [fauna, setFauna] = useState<string[]>([]);
  const [faunaAliases, setFaunaAliases] = useState<Record<string, string[]>>({});
  const [faunaReload, setFaunaReload] = useState(0);
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
        hydroTroncons: coursEau,
        hydroSurfaces: plansEau,
        faunaSpecies: fauna,
        faunaAliases,
        flora: flora.map((item) => ({ taxon_key: item.taxon_key, label: item.label })),
      });
      navigate(`/projects/${res.project_id}/runs/${res.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La qualification a échoué.");
    } finally {
      setQualifying(false);
    }
  }

  function dropZone(
    kind: "projet" | "foncier",
    file: LoadedFile | null,
    inputRef: RefObject<HTMLInputElement | null>,
  ) {
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
          <span className="eco-aoi-dropzone-icon" aria-hidden>
            ↑
          </span>
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

  const locked = busy != null || qualifying;

  return (
    <div className="eco-aoi-form analyse-foncier">
      <p className="eco-aoi-intro">
        Le foncier est déjà connu. On calcule des caractéristiques (distances, milieux), sans rechercher ni écarter de
        parcelles.
      </p>

      <section className="eco-filter-block">
        <h3 className="eco-filter-block-title">Projet</h3>
        <p className="analyse-foncier__hint">Emprise géométrique du projet, comme pour une recherche.</p>
        {dropZone("projet", projet, projetRef)}
      </section>

      <section className="eco-filter-block">
        <h3 className="eco-filter-block-title">Foncier à analyser</h3>
        <p className="analyse-foncier__hint">Chaque géométrie du fichier sera croisée avec les couches choisies.</p>
        {dropZone("foncier", foncier, foncierRef)}
      </section>

      <div className="eco-filter-group">
        <section className="eco-filter-block eco-filter-block--first">
          <h3 className="eco-filter-block-title">Espèces (faune)</h3>
          <p className="analyse-foncier__hint">
            Distance à l’observation la plus proche. Cochez un nom interne pour l’associer au référentiel Fauna.
          </p>
          <FaunaSpeciesPicker
            selectedSpecies={fauna}
            onChange={(next) => {
              setFauna(next);
              setFaunaAliases((prev) => {
                const keep = { ...prev };
                for (const key of Object.keys(keep)) {
                  if (!next.includes(key)) delete keep[key];
                }
                return keep;
              });
            }}
            aliases={faunaAliases}
            onAliasesChange={(species, names) =>
              setFaunaAliases((prev) => ({ ...prev, [species]: names }))
            }
            compact
            showDistance={false}
            disabled={locked}
            reloadToken={faunaReload}
          />
          <ObservationZipImport kind="faune" disabled={locked} onImported={() => setFaunaReload((n) => n + 1)} />
        </section>

        <section className="eco-filter-block">
          <h3 className="eco-filter-block-title">Flore</h3>
          <p className="analyse-foncier__hint">Distance à l’observation la plus proche, à partir des taxons internes.</p>
          <FloraTaxonPicker selected={flora} onChange={setFlora} disabled={locked} showDistance={false} />
          <ObservationZipImport kind="flore" disabled={locked} />
        </section>
      </div>

      <section className="eco-filter-block eco-filter-block--break">
        <h3 className="eco-filter-block-title">Occupation du sol</h3>
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${sol ? " is-on" : ""}`}
          disabled={locked}
          aria-pressed={sol}
          onClick={() => setSol((v) => !v)}
        >
          <span className={`eco-dot${sol ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__label">Milieux CESBIO sur chaque géométrie</span>
        </button>
      </section>

      <section className="eco-filter-block eco-filter-block--break">
        <h3 className="eco-filter-block-title">Hydrographie</h3>
        <p className="analyse-foncier__hint">Distance au cours d’eau ou au plan d’eau le plus proche.</p>
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${coursEau ? " is-on" : ""}`}
          disabled={locked}
          aria-pressed={coursEau}
          onClick={() => setCoursEau((v) => !v)}
        >
          <span className={`eco-dot${coursEau ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__label">Cours d&apos;eau</span>
        </button>
        <button
          type="button"
          className={`eco-layer-row eco-layer-row--inset${plansEau ? " is-on" : ""}`}
          disabled={locked}
          aria-pressed={plansEau}
          onClick={() => setPlansEau((v) => !v)}
        >
          <span className={`eco-dot${plansEau ? " is-on" : ""}`} aria-hidden />
          <span className="eco-layer-row__label">Plans d&apos;eau</span>
        </button>
      </section>

      {error && <div className="eco-aoi-error">{error}</div>}
      <button
        type="button"
        className="eco-aoi-btn eco-aoi-btn--primary"
        disabled={!projet || !foncier || locked}
        onClick={() => void qualify()}
      >
        {qualifying ? "Qualification en cours…" : "Qualifier le foncier"}
      </button>
    </div>
  );
}
