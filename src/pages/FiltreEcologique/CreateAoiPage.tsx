import { useEffect, useRef, useState } from "react";
import {
  createProjectFromParcelles,
  createProjectFromFoncierUpload,
  createProjectFromParcelle,
  fetchLayers,
  fetchProjects,
  previewFoncierUpload,
  startFetch,
} from "../../api";
import type { FromParcelleBody, LayerInfo, ParcelleRef, ProjectSummary } from "../../api";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { SliderField } from "../../components/FilterPanel/shared";
import { CartoAoi } from "./CartoAoi";
import { buildFetchLayerKeys, getDefaultOptionalLayerKeys } from "./aoiLayerKeys";
import { SelectAoiLayers } from "./SelectAoiLayers";
import "../../components/FilterPanel/filter-panel.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

type LayerStatus = "pending" | "running" | "done" | "skipped" | "error";
type ParcelleFeature = Feature<Polygon | MultiPolygon>;

type LayerState = { status: LayerStatus; n_inserted?: number; message?: string };

type SummaryState = { n_ok: number; n_skip: number; n_err: number; total_s: number } | null;

function labelForKey(registry: LayerInfo[], key: string): string {
  return registry.find((l) => l.key === key)?.label ?? key;
}

interface CreateAoiPageProps {
  onDone: (projectId: string) => void;
  onBack: () => void;
}

export function CreateAoiPage({ onDone, onBack }: CreateAoiPageProps) {
  const [codeInsee, setCodeInsee] = useState("");
  const [section, setSection] = useState("");
  const [numero, setNumero] = useState("");
  const [name, setName] = useState("");
  const [bufferKm, setBufferKm] = useState(5);
  const [step, setStep] = useState<"form" | "creating" | "fetching" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [layerResults, setLayerResults] = useState<Record<string, LayerState>>({});
  const [summary, setSummary] = useState<SummaryState>(null);
  const [parcelFeature, setParcelFeature] = useState<ParcelleFeature | null>(null);
  const [isSearchingParcel, setIsSearchingParcel] = useState(false);
  const [sourceMode, setSourceMode] = useState<"parcelle" | "fichier">("parcelle");
  const [fileFormat, setFileFormat] = useState<"gpkg" | "shp_zip">("gpkg");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFeature, setUploadedFeature] = useState<ParcelleFeature | null>(null);
  const [isUploadingGeom, setIsUploadingGeom] = useState(false);
  const [registryLayers, setRegistryLayers] = useState<LayerInfo[]>([]);
  const [layersLoadError, setLayersLoadError] = useState<string | null>(null);
  const [faunaSpecies, setFaunaSpecies] = useState<string[]>([]);
  const [ufParcelles, setUfParcelles] = useState<ParcelleRef[]>([]);
  const [nameTouched, setNameTouched] = useState(false);
  /** Couches optionnelles cochées (hors parcelles, GEOMCE, UF — ces dernières via ufEnabled). */
  const [selectedLayerKeys, setSelectedLayerKeys] = useState<string[]>([]);
  const [ufEnabled, setUfEnabled] = useState(false);
  const [ufMaxParcelles, setUfMaxParcelles] = useState(5);
  const [ufMinAreaHa, setUfMinAreaHa] = useState(7);
  /** Couches du dernier fetch (ordre serveur) — alimente le tableau de suivi. */
  const [activeFetchKeys, setActiveFetchKeys] = useState<string[]>([]);
  const [historyProjects, setHistoryProjects] = useState<ProjectSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedExistingProjectId, setSelectedExistingProjectId] = useState<string>("");
  const lastFetchLayerKeysRef = useRef<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const faunaLayerSelected = selectedLayerKeys.includes("fauna");

  useEffect(() => {
    let cancelled = false;
    fetchLayers()
      .then((layers) => {
        if (cancelled) return;
        setRegistryLayers(layers);
        setSelectedLayerKeys(getDefaultOptionalLayerKeys(layers));
        setLayersLoadError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setLayersLoadError(e instanceof Error ? e.message : "Impossible de charger la liste des couches");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchProjects()
      .then((projects) => {
        if (cancelled) return;
        setHistoryProjects(projects);
      })
      .catch((e) => {
        if (!cancelled) {
          setHistoryError(e instanceof Error ? e.message : "Impossible de charger les projets existants");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (bufferKm > 5) setUfEnabled(false);
  }, [bufferKm]);

  useEffect(() => {
    if (!faunaLayerSelected && faunaSpecies.length > 0) {
      setFaunaSpecies([]);
    }
  }, [faunaLayerSelected, faunaSpecies.length]);

  const currentRefLabel = `${codeInsee.trim()}_${section.trim().toUpperCase()}_${numero.trim()}`.replace(/^_+|_+$/g, "");
  const firstUfRef = ufParcelles[0];
  const suggestedName = sourceMode === "fichier"
    ? (uploadedFile ? uploadedFile.name.replace(/\.(gpkg|zip)$/i, "") : "")
    : (ufParcelles.length > 1
        ? (firstUfRef ? `UF_${firstUfRef.code_insee}_${firstUfRef.section}_${firstUfRef.numero}` : "")
        : (currentRefLabel ? `PARCELLE_${currentRefLabel}` : ""));

  useEffect(() => {
    if (nameTouched) return;
    setName(suggestedName);
  }, [suggestedName, nameTouched]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [layerResults, summary]);

  useEffect(() => {
    if (step !== "fetching" || !projectId) return;
    const keys = lastFetchLayerKeysRef.current;
    setLayerResults(Object.fromEntries(keys.map((k) => [k, { status: "pending" as const }])));
    setSummary(null);
    const WS = API.replace(/^http/, "ws");
    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS event:", data.event, data.layer_key, data.message?.slice(0, 80));
        const ev = data.event;
        const layerKey = data.layer_key ?? "";
        const msg = data.message ?? "";

        if (ev === "connected" || ev === "ping") return;
        if (ev === "start") return;

        if (ev === "running" && layerKey) {
          setLayerResults((prev) => ({
            ...prev,
            [layerKey]: { ...prev[layerKey], status: "running" },
          }));
          return;
        }
        if (ev === "progress" && layerKey === "parcelles") {
          const raw: string = data.message ?? "";
          const match = raw.match(/^TILE_PROGRESS:(\d+)\/(\d+):(\d+)/);
          if (match) {
            const tile = parseInt(match[1], 10);
            const totalTiles = parseInt(match[2], 10);
            const n_inserted = parseInt(match[3], 10);
            const pct = totalTiles > 0 ? Math.min(100, Math.round((tile / totalTiles) * 100)) : 0;
            setLayerResults((prev) => ({
              ...prev,
              parcelles: {
                ...prev.parcelles,
                status: "running",
                message: `⟳ ${n_inserted.toLocaleString("fr-FR")} parcelles — ${pct}%`,
              },
            }));
          }
          return;
        }
        if (ev === "done" && layerKey) {
          const n = typeof data.n_inserted === "number" ? data.n_inserted : 0;
          setLayerResults((prev) => ({
            ...prev,
            [layerKey]: { status: "done", n_inserted: n },
          }));
          return;
        }
        if (ev === "skipped" && layerKey) {
          setLayerResults((prev) => ({
            ...prev,
            [layerKey]: { status: "skipped", n_inserted: 0 },
          }));
          return;
        }
        if (ev === "error" && layerKey) {
          setLayerResults((prev) => ({
            ...prev,
            [layerKey]: { status: "error", message: msg },
          }));
          return;
        }
        if (ev === "complete") {
          setSummary({
            n_ok: data.n_ok ?? 0,
            n_skip: data.n_skip ?? 0,
            n_err: data.n_err ?? 0,
            total_s: data.total_s ?? 0,
          });
          setStep("done");
          ws.close();
        }
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => {};

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [step, projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (faunaLayerSelected && faunaSpecies.length === 0) {
      setError("Sélectionnez au moins une espèce si la couche Faune est cochée.");
      return;
    }

    const ufActive = ufEnabled && bufferKm <= 5;
    const orderedKeys = buildFetchLayerKeys(
      registryLayers,
      new Set(selectedLayerKeys),
      ufActive,
    );
    if (orderedKeys.length === 0) {
      setError("Aucune couche à récupérer (vérifiez la sélection).");
      return;
    }

    const projectName = name.trim() || (suggestedName || "FONCIER_UPLOAD");

    if (sourceMode === "parcelle") {
      const hasUfRefs = ufParcelles.length > 0;
      if (!hasUfRefs && (!codeInsee.trim() || !section.trim() || !numero.trim())) {
        setError("Renseignez INSEE, section et numéro (ou composez une UF).");
        return;
      }
      if (!parcelFeature) {
        setError("Recherchez d'abord la géométrie source (parcelle ou UF) sur la carte.");
        return;
      }
    } else {
      if (!uploadedFile) {
        setError("Déposez un fichier ZIP (shapefile) ou GPKG avant de créer l'AOI.");
        return;
      }
      if (!uploadedFeature) {
        setError("Prévisualisez d'abord la géométrie du fichier sur la carte.");
        return;
      }
    }

    lastFetchLayerKeysRef.current = orderedKeys;
    setActiveFetchKeys(orderedKeys);
    setLayerResults(Object.fromEntries(orderedKeys.map((k) => [k, { status: "pending" }])));
    setSummary(null);

    setStep("creating");

    try {
      const parcellesForProject =
        ufParcelles.length > 0
          ? ufParcelles
          : [{
              code_insee: codeInsee.trim(),
              section: section.trim().toUpperCase(),
              numero: numero.trim(),
            }];
      const res =
        sourceMode === "parcelle"
          ? (
            parcellesForProject.length > 1
              ? await createProjectFromParcelles({
                  parcelles: parcellesForProject,
                  name: projectName,
                  buffer_km: bufferKm,
                })
              : await createProjectFromParcelle({
                  code_insee: parcellesForProject[0].code_insee,
                  section: parcellesForProject[0].section,
                  numero: parcellesForProject[0].numero,
                  name: projectName,
                  buffer_km: bufferKm,
                } satisfies FromParcelleBody)
          )
          : await createProjectFromFoncierUpload({
              name: projectName,
              buffer_km: bufferKm,
              file: uploadedFile as File,
            });
      setProjectId(res.project_id);
      setStep("fetching");
      await startFetch(res.project_id, {
        layers: orderedKeys,
        uf_max_parcelles: ufMaxParcelles,
        uf_min_area_ha: ufMinAreaHa,
        fauna_species: faunaLayerSelected && faunaSpecies.length ? faunaSpecies : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création projet");
      setStep("error");
      return;
    }
  }

  function handleGoToFilter() {
    if (projectId) onDone(projectId);
  }

  const layersReady = registryLayers.length > 0 && !layersLoadError;
  const sourceFeature = sourceMode === "parcelle" ? parcelFeature : uploadedFeature;
  const expectedFileLabel = fileFormat === "gpkg" ? "GeoPackage (.gpkg)" : "Shapefile zippé (.zip)";
  const fileInputAccept = fileFormat === "gpkg" ? ".gpkg" : ".zip";
  const canCreateAoi =
    step === "form" &&
    !isSearchingParcel &&
    !isUploadingGeom &&
    !!sourceFeature &&
    (!faunaLayerSelected || faunaSpecies.length > 0) &&
    (sourceMode === "parcelle" ? (ufParcelles.length > 0 || (!!codeInsee.trim() && !!section.trim() && !!numero.trim())) : !!uploadedFile) &&
    layersReady;
  const canLoadExistingProject = !!selectedExistingProjectId && step === "form";
  const willSkipUfLayers = bufferKm > 5;

  async function handleSearchParcelle() {
    setError(null);
    const insee = codeInsee.trim();
    const sec = section.trim().toUpperCase();
    const num = numero.trim();
    const refs: ParcelleRef[] =
      ufParcelles.length > 0
        ? ufParcelles
        : [{ code_insee: insee, section: sec, numero: num }];

    if (!refs.length || (!ufParcelles.length && (!insee || !sec || !num))) {
      setError("Renseignez INSEE/section/numéro ou ajoutez des parcelles à l'UF avant recherche.");
      return;
    }

    setIsSearchingParcel(true);
    try {
      const fetched: ParcelleFeature[] = [];
      for (const ref of refs) {
        const url = new URL("https://apicarto.ign.fr/api/cadastre/parcelle");
        url.searchParams.set("code_insee", ref.code_insee);
        url.searchParams.set("section", ref.section);
        url.searchParams.set("numero", ref.numero);
        const res = await fetch(url.toString());
        if (!res.ok) {
          throw new Error(`IGN a répondu ${res.status} pour ${ref.code_insee}/${ref.section}/${ref.numero}`);
        }
        const data = (await res.json()) as { features?: Array<Feature> };
        const feature = data.features?.[0];
        if (!feature || (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon")) {
          throw new Error(`Parcelle introuvable: ${ref.code_insee}/${ref.section}/${ref.numero}`);
        }
        fetched.push(feature as ParcelleFeature);
      }
      const multiCoords: number[][][][] = [];
      for (const f of fetched) {
        if (f.geometry.type === "Polygon") multiCoords.push(f.geometry.coordinates);
        else multiCoords.push(...f.geometry.coordinates);
      }
      setParcelFeature({
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: multiCoords },
        properties: {
          count: fetched.length,
          refs: refs.map((r) => `${r.code_insee}/${r.section}/${r.numero}`).join(", "),
        },
      } as ParcelleFeature);
    } catch (err) {
      setParcelFeature(null);
      setError(err instanceof Error ? err.message : "Erreur recherche parcellaire IGN");
    } finally {
      setIsSearchingParcel(false);
    }
  }

  function handleAddParcelleToUf() {
    setError(null);
    const insee = codeInsee.trim();
    const sec = section.trim().toUpperCase();
    const num = numero.trim();
    if (!insee || !sec || !num) {
      setError("Renseignez INSEE, section et numéro avant ajout à l'UF.");
      return;
    }
    const exists = ufParcelles.some(
      (p) => p.code_insee === insee && p.section === sec && p.numero === num
    );
    if (exists) return;
    setUfParcelles((prev) => [...prev, { code_insee: insee, section: sec, numero: num }]);
  }

  async function handleUploadGeometry(file: File) {
    setError(null);
    setIsUploadingGeom(true);
    try {
      const preview = await previewFoncierUpload(file);
      const geometryType = preview.feature.geometry?.type;
      if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
        throw new Error("La géométrie d'emprise doit être de type Polygon/MultiPolygon.");
      }
      setUploadedFile(file);
      setUploadedFeature(preview.feature as ParcelleFeature);
    } catch (err) {
      setUploadedFile(null);
      setUploadedFeature(null);
      setError(err instanceof Error ? err.message : "Erreur lecture du fichier géographique");
    } finally {
      setIsUploadingGeom(false);
    }
  }

  const progressKeys = activeFetchKeys.length > 0 ? activeFetchKeys : [];

  return (
    <div className="create-aoi-page">
      <div className="create-aoi-layout">
        <aside className="filter-panel create-aoi-panel create-aoi-sidebar">
        <div className="filter-panel-header">
          <div className="fph-title">
            <span className="fph-icon">◇</span>
            <span>Création AOI à partir d'une parcelle</span>
          </div>
          <button type="button" className="btn-reset" onClick={onBack} title="Retour au filtrage">
            ←
          </button>
        </div>

        <div className="filter-panel-body">
          <p className="create-aoi-intro">
            Choisissez une source (référence cadastrale ou fichier ZIP/GPKG), puis définissez le buffer AOI.
            La carte affiche la géométrie source et le périmètre bufferisé.
          </p>
          <div className="section-block create-aoi-block">
            <div className="section-header">
              <span className="section-title">Charger un projet existant</span>
            </div>
            <div className="section-body">
              {historyLoading ? (
                <div className="create-aoi-parcel-status is-missing">Chargement des projets…</div>
              ) : historyError ? (
                <div className="create-aoi-error">{historyError}</div>
              ) : historyProjects.length === 0 ? (
                <div className="create-aoi-parcel-status is-missing">Aucun projet existant.</div>
              ) : (
                <>
                  <div className="create-aoi-row">
                    <label className="create-aoi-label">Projet</label>
                    <select
                      className="create-aoi-input"
                      value={selectedExistingProjectId}
                      onChange={(e) => setSelectedExistingProjectId(e.target.value)}
                      disabled={step === "creating" || step === "fetching"}
                    >
                      <option value="">Sélectionner un projet…</option>
                      {historyProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {new Date(p.created_at).toLocaleDateString("fr-FR")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn-run create-aoi-search-btn"
                    disabled={!canLoadExistingProject}
                    onClick={() => {
                      if (!selectedExistingProjectId) return;
                      onDone(selectedExistingProjectId);
                    }}
                  >
                    Ouvrir le projet en filtrage
                  </button>
                </>
              )}
            </div>
          </div>
          <form id="create-aoi-form" onSubmit={handleSubmit} className="create-aoi-form">
            <div className="section-block create-aoi-block">
              <div className="section-header">
                <span className="section-title">Source géométrique</span>
              </div>
              <div className="section-body">
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Mode d'entrée</label>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <label>
                      <input
                        type="radio"
                        checked={sourceMode === "parcelle"}
                        disabled={step === "creating" || step === "fetching"}
                        onChange={() => setSourceMode("parcelle")}
                      />{" "}
                      Référence cadastrale
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={sourceMode === "fichier"}
                        disabled={step === "creating" || step === "fetching"}
                        onChange={() => setSourceMode("fichier")}
                      />{" "}
                      Fichier géographique
                    </label>
                  </div>
                </div>
                {sourceMode === "parcelle" ? (
                  <>
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Code INSEE</label>
                  <input
                    type="text"
                    className="create-aoi-input"
                    value={codeInsee}
                    onChange={(e) => setCodeInsee(e.target.value)}
                    placeholder="ex. 33274"
                    maxLength={5}
                    disabled={step === "creating" || step === "fetching"}
                  />
                </div>
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Section</label>
                  <input
                    type="text"
                    className="create-aoi-input"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    placeholder="ex. 0D"
                    disabled={step === "creating" || step === "fetching"}
                  />
                </div>
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Numéro</label>
                  <input
                    type="text"
                    className="create-aoi-input"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="ex. 0962"
                    disabled={step === "creating" || step === "fetching"}
                  />
                </div>
                <button
                  type="button"
                  className="btn-run create-aoi-search-btn"
                  onClick={handleSearchParcelle}
                  disabled={isSearchingParcel || step === "creating" || step === "fetching"}
                >
                  {isSearchingParcel ? "Recherche parcelle(s)..." : "Rechercher parcelle(s) (IGN)"}
                </button>
                <button
                  type="button"
                  className="btn-run create-aoi-search-btn"
                  onClick={handleAddParcelleToUf}
                  disabled={step === "creating" || step === "fetching"}
                >
                  Ajouter à l'unité foncière
                </button>
                {ufParcelles.length > 0 && (
                  <div className="create-aoi-parcel-status is-found">
                    UF composée ({ufParcelles.length}) :{" "}
                    {ufParcelles.map((p) => `${p.code_insee}/${p.section}/${p.numero}`).join(" · ")}
                  </div>
                )}
                <div className={`create-aoi-parcel-status ${parcelFeature ? "is-found" : "is-missing"}`}>
                  {parcelFeature ? "Géométrie source trouvée et affichée sur la carte." : "Parcelle/UF non recherchée."}
                </div>
                  </>
                ) : (
                  <>
                    <div className="create-aoi-row">
                      <label className="create-aoi-label">Format du fichier</label>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <label>
                          <input
                            type="radio"
                            checked={fileFormat === "gpkg"}
                            disabled={step === "creating" || step === "fetching" || isUploadingGeom}
                            onChange={() => {
                              setFileFormat("gpkg");
                              setUploadedFile(null);
                              setUploadedFeature(null);
                            }}
                          />{" "}
                          GeoPackage (.gpkg)
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={fileFormat === "shp_zip"}
                            disabled={step === "creating" || step === "fetching" || isUploadingGeom}
                            onChange={() => {
                              setFileFormat("shp_zip");
                              setUploadedFile(null);
                              setUploadedFeature(null);
                            }}
                          />{" "}
                          Shapefile zippé (.zip)
                        </label>
                      </div>
                    </div>
                    <div className="create-aoi-row">
                      <label className="create-aoi-label">Fichier source</label>
                      <input
                        type="file"
                        className="create-aoi-input"
                        accept={fileInputAccept}
                        disabled={step === "creating" || step === "fetching" || isUploadingGeom}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            void handleUploadGeometry(f);
                          }
                        }}
                      />
                    </div>
                    <div className="create-aoi-parcel-status is-missing">
                      Format attendu : <strong>{expectedFileLabel}</strong>
                      {fileFormat === "shp_zip"
                        ? " (inclure au minimum .shp, .dbf, .shx, .prj dans le zip)"
                        : ""}
                    </div>
                    <div className={`create-aoi-parcel-status ${uploadedFeature ? "is-found" : "is-missing"}`}>
                      {isUploadingGeom
                        ? "Analyse du fichier en cours..."
                        : uploadedFeature
                          ? `Emprise chargée : ${uploadedFile?.name ?? "fichier"}`
                          : "Aucun fichier analysé."}
                    </div>
                  </>
                )}
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Nom du projet</label>
                  <input
                    type="text"
                    className="create-aoi-input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameTouched(true);
                    }}
                    placeholder="ex. PARCELLE_33274_0D_0962"
                    disabled={step === "creating" || step === "fetching"}
                  />
                </div>
                <SliderField
                  label="Buffer AOI"
                  value={bufferKm}
                  min={0}
                  max={20}
                  step={0.5}
                  format={(v) => v.toFixed(1)}
                  unit=" km"
                  onChange={setBufferKm}
                />
                {willSkipUfLayers && (
                  <div className="create-aoi-parcel-status is-missing">
                    Buffer &gt; 5 km : les couches "Unités foncières" et "Sous-ensembles UF" seront ignorées.
                  </div>
                )}
              </div>
            </div>

            <div className="section-block create-aoi-block">
              {layersLoadError && (
                <div className="create-aoi-error" style={{ marginBottom: 8 }}>
                  Couches : {layersLoadError}
                </div>
              )}
              {registryLayers.length > 0 && (
                <SelectAoiLayers
                  layers={registryLayers}
                  selectedKeys={selectedLayerKeys}
                  onSelectedKeysChange={setSelectedLayerKeys}
                  bufferKm={bufferKm}
                  ufEnabled={ufEnabled}
                  onUfEnabledChange={setUfEnabled}
                  ufMaxParcelles={ufMaxParcelles}
                  onUfMaxParcellesChange={setUfMaxParcelles}
                  ufMinAreaHa={ufMinAreaHa}
                  onUfMinAreaHaChange={setUfMinAreaHa}
                  faunaSpecies={faunaSpecies}
                  onFaunaSpeciesChange={setFaunaSpecies}
                  disabled={step === "creating" || step === "fetching"}
                />
              )}
            </div>

                <button type="submit" className="btn-run create-aoi-submit-inline" disabled={!canCreateAoi}>
                  Créer AOI (buffer) et lancer les couches
                </button>

            {error && (
              <div className="create-aoi-error">
                {error}
              </div>
            )}

            {(step === "creating" || step === "fetching" || step === "done") && (
              <div className="create-aoi-logs">
                <div className="create-aoi-logs-title">
                  {step === "creating" ? "Création du projet…" : "Résultats par couche"}
                </div>
                <div className="create-aoi-layers-list">
                  {progressKeys.map((key) => {
                    const state = layerResults[key] ?? { status: "pending" };
                    const label = labelForKey(registryLayers, key);
                    let cell: string;
                    if (state.status === "pending") cell = "—";
                    else if (state.status === "running") cell = state.message ?? "…";
                    else if (state.status === "done") cell = `${state.n_inserted?.toLocaleString("fr-FR") ?? 0} entité(s)`;
                    else if (state.status === "skipped") cell = "0 (ignorée)";
                    else cell = "Erreur";
                    return (
                      <div key={key} className={`create-aoi-layer-row create-aoi-layer-row--${state.status}`}>
                        <span className="create-aoi-layer-label">{label}</span>
                        <span className="create-aoi-layer-count">{cell}</span>
                      </div>
                    );
                  })}
                </div>
                {summary && (
                  <div className="create-aoi-summary" ref={logEndRef}>
                    <div className="create-aoi-summary-title">Récapitulatif</div>
                    <div className="create-aoi-summary-line create-aoi-summary-ok">
                      <strong>Réussies : {summary.n_ok}</strong>
                      {summary.n_ok > 0 && (
                        <span className="create-aoi-summary-list">
                          {progressKeys.filter((k) => layerResults[k]?.status === "done").map((k) => labelForKey(registryLayers, k)).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="create-aoi-summary-line create-aoi-summary-skip">
                      <strong>Ignorées : {summary.n_skip}</strong>
                      {summary.n_skip > 0 && (
                        <span className="create-aoi-summary-list">
                          {progressKeys.filter((k) => layerResults[k]?.status === "skipped").map((k) => labelForKey(registryLayers, k)).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="create-aoi-summary-line create-aoi-summary-err">
                      <strong>Erreurs : {summary.n_err}</strong>
                      {summary.n_err > 0 && (
                        <span className="create-aoi-summary-list">
                          {progressKeys.filter((k) => layerResults[k]?.status === "error").map((k) => labelForKey(registryLayers, k)).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="create-aoi-summary-time">
                      Temps total : {summary.total_s} s
                    </div>
                  </div>
                )}
                {!summary && (step === "creating" || step === "fetching") && <div ref={logEndRef} />}
              </div>
            )}

            {step === "done" && (
              <div className="create-aoi-done">
                <p className="create-aoi-done-text">Orchestration terminée. Vous pouvez passer au filtrage.</p>
                <button type="button" className="btn-run" onClick={handleGoToFilter}>
                  Aller au filtrage →
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="filter-panel-footer">
          {step === "form" && <div className="create-aoi-footer-hint">1) Rechercher parcelle → 2) Choisir les couches → 3) Créer AOI</div>}
          {(step === "creating" || step === "fetching") && (
            <div className="create-aoi-loading">
              <span className="spinner" />
              {step === "creating" ? "Création du projet…" : "Intersection des couches en cours, le processus peut prendre jusqu'à 15 minutes"}
            </div>
          )}
          {step === "error" && (
            <button type="button" className="btn-run" onClick={() => { setStep("form"); setError(null); }}>
              Réessayer
            </button>
          )}
        </div>
        </aside>

        <div className="create-aoi-map-wrap">
          <CartoAoi parcelFeature={sourceFeature} bufferKm={bufferKm} />
        </div>
      </div>
    </div>
  );
}
