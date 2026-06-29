import { useEffect, useRef, useState } from "react";
import {
  createProjectFromParcelles,
  createProjectFromFoncierUpload,
  createProjectFromParcelle,
  fetchFilterPhases,
  fetchProjects,
  previewFoncierUpload,
  startFilterPipeline,
} from "../../api";
import type { FilterPhaseInfo, FromParcelleBody, ParcelleRef, ProjectSummary } from "../../api";
import type { CesbioLibelle } from "../../types";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CartoAoi } from "./CartoAoi";
import { SelectFilterCriteria } from "./SelectFilterCriteria";
import { SelectFilterCriteriaZonesHumides } from "./SelectFilterCriteriaZonesHumides";
import { PipelineProgressPanel } from "../../components/PipelineProgressPanel";
import type { StudyType } from "../../types/studyTypes";
import type { ZoneHumideMode } from "../../types";
import { DEFAULT_ZH_CRITERIA, getStudyProfile } from "../Etude/studyProfiles";
import { DEFAULT_EXCLUDED_LAYERS } from "../../constants/nationalExclusionLayers";
import {
  applyWsToPipelineProgress,
  INITIAL_PIPELINE_PROGRESS,
  type PipelineProgress,
} from "../../utils/pipelineProgress";
import { getWsBaseUrl } from "../../config/apiBase";
import "./createAoiPage.css";

type ParcelleFeature = Feature<Polygon | MultiPolygon>;

type SummaryState = { n_ok: number; n_skip: number; n_err: number; total_s: number } | null;

const DEFAULT_FILTER_PHASES: FilterPhaseInfo[] = [
  { key: "parcelles", label: "Parcelles candidates (tiling)" },
  { key: "filter", label: "Filtrage écologique" },
  { key: "purge", label: "Purge parcelles éliminées" },
  { key: "enrich", label: "Enrichissement léger" },
];

interface CreateAoiPageProps {
  studyType?: StudyType;
  onDone: (projectId: string) => void;
  onBack: () => void;
}

export function CreateAoiPage({
  studyType = "faune_buffer",
  onDone,
  onBack,
}: CreateAoiPageProps) {
  const isZh = studyType === "zones_humides_intra";
  const profile = getStudyProfile(studyType);
  const [codeInsee, setCodeInsee] = useState("");
  const [section, setSection] = useState("");
  const [numero, setNumero] = useState("");
  const [name, setName] = useState("");
  const [bufferKm, setBufferKm] = useState(3);
  const [step, setStep] = useState<"form" | "creating" | "fetching" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>(INITIAL_PIPELINE_PROGRESS);
  const [summary, setSummary] = useState<SummaryState>(null);
  const [parcelFeature, setParcelFeature] = useState<ParcelleFeature | null>(null);
  const [isSearchingParcel, setIsSearchingParcel] = useState(false);
  const [sourceMode, setSourceMode] = useState<"parcelle" | "fichier">(isZh ? "fichier" : "fichier");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFeature, setUploadedFeature] = useState<ParcelleFeature | null>(null);
  const [initialUploadFeature, setInitialUploadFeature] = useState<ParcelleFeature | null>(null);
  const [bvPreviewCount, setBvPreviewCount] = useState<number | null>(null);
  const [bvPreviewNames, setBvPreviewNames] = useState<string[]>([]);
  const [isUploadingGeom, setIsUploadingGeom] = useState(false);
  const [filterPhases, setFilterPhases] = useState<FilterPhaseInfo[]>(DEFAULT_FILTER_PHASES);
  const [phasesLoadError, setPhasesLoadError] = useState<string | null>(null);
  const [minAreaHa, setMinAreaHa] = useState(7);
  const [millerThresh, setMillerThresh] = useState(0.39);
  const [cesbioLibelles, setCesbioLibelles] = useState<CesbioLibelle[]>([
    "Forêts de conifères",
    "Forêts de feuillus",
  ]);
  const [faunaEnabled, setFaunaEnabled] = useState(true);
  const [faunaSpecies, setFaunaSpecies] = useState<string[]>([]);
  const [faunaDistM, setFaunaDistM] = useState(1000);
  const [ufParcelles, setUfParcelles] = useState<ParcelleRef[]>([]);
  const [nameTouched, setNameTouched] = useState(false);
  const [historyProjects, setHistoryProjects] = useState<ProjectSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedExistingProjectId, setSelectedExistingProjectId] = useState<string>("");
  const [projectTab, setProjectTab] = useState<"new" | "existing">("new");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const wsRef = useRef<WebSocket | null>(null);
  const [filterSession, setFilterSession] = useState(0);
  const [ufInProgress, setUfInProgress] = useState(false);
  const [zonesHumidesProbablesMode, setZonesHumidesProbablesMode] = useState<ZoneHumideMode>(
    DEFAULT_ZH_CRITERIA.zones_humides_probables_mode,
  );
  const [minZoneHumideHa, setMinZoneHumideHa] = useState(DEFAULT_ZH_CRITERIA.min_zone_humide_ha);
  const [tronconsHydroEnabled, setTronconsHydroEnabled] = useState(DEFAULT_ZH_CRITERIA.troncons_hydro_enabled);
  const [tronconsHydroMaxDistM, setTronconsHydroMaxDistM] = useState(DEFAULT_ZH_CRITERIA.troncons_hydro_max_dist_m);
  const [surfacesHydroEnabled, setSurfacesHydroEnabled] = useState(DEFAULT_ZH_CRITERIA.surfaces_hydro_enabled);
  const [surfacesHydroMaxDistM, setSurfacesHydroMaxDistM] = useState(DEFAULT_ZH_CRITERIA.surfaces_hydro_max_dist_m);
  const [excludedLayers, setExcludedLayers] = useState<string[]>([...DEFAULT_EXCLUDED_LAYERS]);

  useEffect(() => {
    let cancelled = false;
    fetchFilterPhases()
      .then((phases) => {
        if (cancelled) return;
        setFilterPhases(phases);
        setPhasesLoadError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setPhasesLoadError(
            e instanceof Error ? e.message : "Impossible de charger les phases de filtrage",
          );
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
    if (!faunaEnabled && faunaSpecies.length > 0) {
      setFaunaSpecies([]);
    }
  }, [faunaEnabled, faunaSpecies.length]);

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
    if (!projectId || filterSession === 0) return;
    setPipelineProgress(INITIAL_PIPELINE_PROGRESS);
    setSummary(null);
    setUfInProgress(false);
    const WS = getWsBaseUrl();
    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS event:", data.event, data.layer_key, data.message?.slice(0, 80));
        const ev = data.event;

        if (ev === "connected" || ev === "ping") return;
        if (ev === "start") return;

        if (ev === "uf_start") {
          setUfInProgress(true);
          return;
        }

        if (ev === "uf_complete") return;

        if (ev === "phase:parcelles_ready") {
          setUfInProgress(true);
          return;
        }

        if (ev === "phase:uf_ready") {
          setUfInProgress(false);
          ws.close();
          return;
        }

        setPipelineProgress((prev) => applyWsToPipelineProgress(prev, data));

        if (ev === "error") {
          setStep("error");
          setError(typeof data.message === "string" ? data.message : "Erreur pendant le filtrage.");
          setUfInProgress(false);
          return;
        }

        if (ev === "complete") {
          setSummary({
            n_ok: data.n_ok ?? 0,
            n_skip: data.n_skip ?? 0,
            n_err: data.n_err ?? 0,
            total_s: data.total_s ?? 0,
          });
          if ((data.n_err ?? 0) > 0) {
            setStep("error");
            setError(
              typeof data.message === "string"
                ? data.message
                : "Le filtrage a échoué côté serveur. Relancez l'étude après correction.",
            );
            setUfInProgress(false);
            return;
          }
          setStep("done");
          setUfInProgress(true);
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
  }, [projectId, filterSession]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isZh) {
      if (
        minZoneHumideHa <= 0
        && zonesHumidesProbablesMode === "ignore"
        && !tronconsHydroEnabled
        && !surfacesHydroEnabled
        && !(faunaEnabled && faunaSpecies.length > 0)
      ) {
        setError("Activez au moins un critère zones humides, hydrographique ou faunistique.");
        return;
      }
      if (sourceMode !== "fichier" || !uploadedFile || !uploadedFeature) {
        setError("Le mode zones humides requiert une zone initiale (SHP/ZIP ou GPKG).");
        return;
      }
    } else if (cesbioLibelles.length === 0 && (!faunaEnabled || faunaSpecies.length === 0)) {
      setError("Sélectionnez au moins un libellé CESBIO ou une espèce faune.");
      return;
    }
    if (isZh && faunaEnabled && faunaSpecies.length === 0) {
      setError("Sélectionnez au moins une espèce si le filtre faune est activé.");
      return;
    }
    if (!isZh && faunaEnabled && faunaSpecies.length === 0) {
      setError("Sélectionnez au moins une espèce si le filtre faune est activé.");
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

    setPipelineProgress(INITIAL_PIPELINE_PROGRESS);
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
      const effectiveBufferKm = isZh ? 0 : bufferKm;
      const res =
        sourceMode === "parcelle"
          ? (
            parcellesForProject.length > 1
              ? await createProjectFromParcelles({
                  parcelles: parcellesForProject,
                  name: projectName,
                  buffer_km: effectiveBufferKm,
                  study_type: studyType,
                })
              : await createProjectFromParcelle({
                  code_insee: parcellesForProject[0].code_insee,
                  section: parcellesForProject[0].section,
                  numero: parcellesForProject[0].numero,
                  name: projectName,
                  buffer_km: effectiveBufferKm,
                  study_type: studyType,
                } satisfies FromParcelleBody)
          )
          : await createProjectFromFoncierUpload({
              name: projectName,
              buffer_km: effectiveBufferKm,
              study_type: studyType,
              file: uploadedFile as File,
            });
      setProjectId(res.project_id);
      setStep("fetching");
      setFilterSession((s) => s + 1);
      await startFilterPipeline(res.project_id, isZh
        ? {
            min_area_ha: minAreaHa,
            miller_thresh: millerThresh,
            cesbio_libelles: [],
            fauna_criteria: faunaEnabled
              ? faunaSpecies.map((species) => ({ species, dist_m: faunaDistM }))
              : [],
            zone_humide_mode: minZoneHumideHa > 0 ? "intersect" : "ignore",
            zones_humides_probables_mode: zonesHumidesProbablesMode,
            min_zone_humide_ha: minZoneHumideHa,
            excluded_layers: excludedLayers,
            troncons_hydros_max_dist_m: tronconsHydroEnabled ? tronconsHydroMaxDistM : null,
            surfaces_hydros_max_dist_m: surfacesHydroEnabled ? surfacesHydroMaxDistM : null,
          }
        : {
            min_area_ha: minAreaHa,
            miller_thresh: millerThresh,
            cesbio_libelles: cesbioLibelles,
            fauna_criteria: faunaEnabled
              ? faunaSpecies.map((species) => ({ species, dist_m: faunaDistM }))
              : [],
            excluded_layers: excludedLayers,
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

  const phasesReady = filterPhases.length > 0 && !phasesLoadError;
  const sourceFeature = sourceMode === "parcelle" ? parcelFeature : uploadedFeature;
  const geoFileAccept = ".gpkg,.zip";
  const hasFilterCriteria = isZh
    ? minZoneHumideHa > 0
      || zonesHumidesProbablesMode !== "ignore"
      || tronconsHydroEnabled
      || surfacesHydroEnabled
      || (faunaEnabled && faunaSpecies.length > 0)
    : cesbioLibelles.length > 0 || (faunaEnabled && faunaSpecies.length > 0);
  const canCreateAoi =
    step === "form" &&
    !isSearchingParcel &&
    !isUploadingGeom &&
    !!sourceFeature &&
    hasFilterCriteria &&
    (!faunaEnabled || faunaSpecies.length > 0) &&
    (isZh
      ? !!uploadedFile
      : sourceMode === "parcelle"
        ? (ufParcelles.length > 0 || (!!codeInsee.trim() && !!section.trim() && !!numero.trim()))
        : !!uploadedFile) &&
    phasesReady;
  const canLoadExistingProject = !!selectedExistingProjectId && step === "form";
  const parcelFormFilled =
    sourceMode === "parcelle"
      ? ufParcelles.length > 0 || (!!codeInsee.trim() && !!section.trim() && !!numero.trim())
      : !!uploadedFile;
  const canAdvanceFromStep1 = !!sourceFeature && parcelFormFilled;
  const isWizardLocked = step !== "form";

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

  function pickGeometryFile(file: File | undefined) {
    if (!file || isWizardLocked || isUploadingGeom) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".gpkg") && !lower.endsWith(".zip")) {
      setError("Format non reconnu : utilisez un fichier .gpkg ou une archive .zip (shapefile).");
      return;
    }
    setError(null);
    void handleUploadGeometry(file);
  }

  async function handleUploadGeometry(file: File) {
    setError(null);
    setIsUploadingGeom(true);
    try {
      const preview = await previewFoncierUpload(file, isZh ? studyType : undefined);
      const geometryType = preview.feature.geometry?.type;
      if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
        throw new Error("La géométrie d'emprise doit être de type Polygon/MultiPolygon.");
      }
      setUploadedFile(file);
      setUploadedFeature(preview.feature as ParcelleFeature);
      setInitialUploadFeature(
        isZh && preview.upload_feature
          ? (preview.upload_feature as ParcelleFeature)
          : null,
      );
      setBvPreviewCount(isZh ? (preview.bv_count ?? null) : null);
      setBvPreviewNames(isZh ? (preview.bv_names ?? []) : []);
    } catch (err) {
      setUploadedFile(null);
      setUploadedFeature(null);
      setInitialUploadFeature(null);
      setBvPreviewCount(null);
      setBvPreviewNames([]);
      setError(err instanceof Error ? err.message : "Erreur lecture du fichier géographique");
    } finally {
      setIsUploadingGeom(false);
    }
  }

  const stepLabels: Record<1 | 2 | 3, string> = isZh
    ? {
        1: "Zone initiale",
        2: "Nommer le projet",
        3: "Critères zones humides",
      }
    : {
        1: "Charger le projet",
        2: "Définir la zone de recherche",
        3: "Critères de filtrage",
      };

  function renderParcelStep() {
    return (
      <>
        <h2 className="eco-aoi-section-title">{isZh ? "Zone initiale" : "Source géométrique"}</h2>
        {isZh && (
          <p className="eco-aoi-intro">
            Importez la zone initiale. Le périmètre de recherche sera l&apos;union des bassins versants
            (masses d&apos;eau) qui l&apos;intersectent — entités BV complètes, pas seulement la zone de recouvrement.
          </p>
        )}
        {!isZh && (
        <div className="eco-aoi-tabs eco-aoi-tabs--inline" role="tablist" aria-label="Type de source">
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "fichier"}
            className={`eco-aoi-tab${sourceMode === "fichier" ? " eco-aoi-tab--active" : ""}`}
            disabled={isWizardLocked}
            onClick={() => setSourceMode("fichier")}
          >
            Fichier géographique
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === "parcelle"}
            className={`eco-aoi-tab${sourceMode === "parcelle" ? " eco-aoi-tab--active" : ""}`}
            disabled={isWizardLocked}
            onClick={() => setSourceMode("parcelle")}
          >
            Référence cadastrale
          </button>
        </div>
        )}
        {(isZh || sourceMode === "fichier") ? (
          <>
            <input
              ref={fileInputRef}
              id="aoi-file"
              type="file"
              className="eco-aoi-file-input-hidden"
              accept={geoFileAccept}
              disabled={isWizardLocked || isUploadingGeom}
              onChange={(e) => {
                pickGeometryFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div
              className={`eco-aoi-dropzone${isDragOver ? " eco-aoi-dropzone--active" : ""}${uploadedFeature ? " eco-aoi-dropzone--filled" : ""}`}
              role="button"
              tabIndex={isWizardLocked || isUploadingGeom ? -1 : 0}
              aria-label="Déposer ou choisir un fichier géographique"
              aria-disabled={isWizardLocked || isUploadingGeom}
              onKeyDown={(e) => {
                if (isWizardLocked || isUploadingGeom) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => {
                if (!isWizardLocked && !isUploadingGeom) fileInputRef.current?.click();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!isWizardLocked && !isUploadingGeom) setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (isWizardLocked || isUploadingGeom) return;
                pickGeometryFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="eco-aoi-dropzone-icon" aria-hidden>
                ↑
              </span>
              {isUploadingGeom ? (
                <span className="eco-aoi-dropzone-title">Analyse du fichier en cours…</span>
              ) : uploadedFile ? (
                <>
                  <span className="eco-aoi-dropzone-title">{uploadedFile.name}</span>
                  <span className="eco-aoi-dropzone-hint">Cliquez ou déposez un autre fichier pour remplacer</span>
                </>
              ) : (
                <>
                  <span className="eco-aoi-dropzone-title">Glissez-déposez votre fichier ici</span>
                  <span className="eco-aoi-dropzone-hint">ou cliquez pour parcourir vos fichiers</span>
                </>
              )}
              <span className="eco-aoi-dropzone-formats">
                Formats acceptés : GeoPackage (.gpkg) ou Shapefile zippé (.zip, avec .shp .dbf .shx .prj)
              </span>
            </div>
            <div className={`eco-aoi-status ${uploadedFeature ? "eco-aoi-status--ok" : "eco-aoi-status--muted"}`}>
              {isUploadingGeom
                ? "Analyse du fichier et sélection des bassins versants…"
                : uploadedFeature
                  ? isZh && bvPreviewCount != null
                    ? `Zone de recherche : ${bvPreviewCount} bassin(s) versant(s) retenu(s)`
                    : `Emprise chargée : ${uploadedFile?.name ?? "fichier"}`
                  : "Aucun fichier analysé."}
            </div>
            {isZh && bvPreviewNames.length > 0 && (
              <ul className="eco-aoi-bv-names" aria-label="Bassins versants retenus">
                {bvPreviewNames.map((bvName) => (
                  <li key={bvName}>{bvName}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="eco-aoi-row">
              <label className="create-aoi-label" htmlFor="aoi-insee">Code INSEE</label>
              <input
                id="aoi-insee"
                type="text"
                className="create-aoi-input"
                value={codeInsee}
                onChange={(e) => setCodeInsee(e.target.value)}
                placeholder="ex. 33274"
                maxLength={5}
                disabled={isWizardLocked}
              />
            </div>
            <div className="eco-aoi-row">
              <label className="create-aoi-label" htmlFor="aoi-section">Section</label>
              <input
                id="aoi-section"
                type="text"
                className="create-aoi-input"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="ex. 0D"
                disabled={isWizardLocked}
              />
            </div>
            <div className="eco-aoi-row">
              <label className="create-aoi-label" htmlFor="aoi-numero">Numéro</label>
              <input
                id="aoi-numero"
                type="text"
                className="create-aoi-input"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="ex. 0962"
                disabled={isWizardLocked}
              />
            </div>
            <button
              type="button"
              className="eco-aoi-btn"
              onClick={() => void handleSearchParcelle()}
              disabled={isSearchingParcel || isWizardLocked}
            >
              {isSearchingParcel ? "Recherche parcelle(s)…" : "Rechercher parcelle(s) (IGN)"}
            </button>
            <button
              type="button"
              className="eco-aoi-btn"
              onClick={handleAddParcelleToUf}
              disabled={isWizardLocked}
            >
              Ajouter à l&apos;unité foncière
            </button>
            {ufParcelles.length > 0 && (
              <div className="eco-aoi-status eco-aoi-status--ok">
                UF composée ({ufParcelles.length}) :{" "}
                {ufParcelles.map((p) => `${p.code_insee}/${p.section}/${p.numero}`).join(" · ")}
              </div>
            )}
            <div className={`eco-aoi-status ${parcelFeature ? "eco-aoi-status--ok" : "eco-aoi-status--muted"}`}>
              {parcelFeature
                ? "Géométrie source trouvée et affichée sur la carte."
                : "Parcelle ou UF non recherchée."}
            </div>
          </>
        )}
      </>
    );
  }

  function renderZoneStep() {
    return (
      <>
        <p className="eco-aoi-intro">
          {isZh
            ? "Nommez le projet. La recherche de parcelles se fera dans l'union des bassins versants retenus (pas de buffer)."
            : "Nommez le projet et ajustez la zone de recherche. Le contour vert en pointillés sur la carte correspond au buffer autour de la parcelle."}
        </p>
        <h2 className="eco-aoi-section-title">{isZh ? "Projet" : "Zone de recherche"}</h2>
        <div className="eco-aoi-row">
          <label className="create-aoi-label" htmlFor="aoi-name">Nom du projet</label>
          <input
            id="aoi-name"
            type="text"
            className="create-aoi-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder={isZh ? "ex. DOMAINE_MARENSIN_ZH" : "ex. PARCELLE_33274_0D_0962"}
            disabled={isWizardLocked}
          />
        </div>
        {!isZh && (
          <div className="eco-aoi-slider">
            <div className="eco-aoi-slider-head">
              <span className="eco-aoi-label">Zone de recherche (Buffer)</span>
              <span className="eco-aoi-slider-value">{bufferKm.toFixed(1)} km</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={bufferKm}
              disabled={isWizardLocked}
              onChange={(e) => setBufferKm(Number(e.target.value))}
            />
            <div className="eco-aoi-slider-hints">
              <span>0 km</span>
              <span>20 km</span>
            </div>
            <p className="eco-aoi-slider-caption">
              Distance ajoutée autour de l&apos;emprise du projet (zone d&apos;étude AOI).
            </p>
          </div>
        )}
        {isZh && (
          <p className="eco-aoi-slider-caption">
            Périmètre de recherche = union des bassins versants intersectant la zone initiale.
          </p>
        )}
      </>
    );
  }

  function renderDataStep() {
    return (
      <>
        {phasesLoadError && <div className="eco-aoi-error">Phases : {phasesLoadError}</div>}
        {isZh ? (
          <SelectFilterCriteriaZonesHumides
            minAreaHa={minAreaHa}
            onMinAreaHaChange={setMinAreaHa}
            minZoneHumideHa={minZoneHumideHa}
            onMinZoneHumideHaChange={setMinZoneHumideHa}
            millerThresh={millerThresh}
            onMillerThreshChange={setMillerThresh}
            zonesHumidesProbablesMode={zonesHumidesProbablesMode}
            onZonesHumidesProbablesModeChange={setZonesHumidesProbablesMode}
            excludedLayers={excludedLayers}
            onExcludedLayersChange={setExcludedLayers}
            faunaEnabled={faunaEnabled}
            onFaunaEnabledChange={setFaunaEnabled}
            faunaSpecies={faunaSpecies}
            onFaunaSpeciesChange={setFaunaSpecies}
            faunaDistM={faunaDistM}
            onFaunaDistMChange={setFaunaDistM}
            tronconsHydroEnabled={tronconsHydroEnabled}
            onTronconsHydroEnabledChange={setTronconsHydroEnabled}
            tronconsHydroMaxDistM={tronconsHydroMaxDistM}
            onTronconsHydroMaxDistMChange={setTronconsHydroMaxDistM}
            surfacesHydroEnabled={surfacesHydroEnabled}
            onSurfacesHydroEnabledChange={setSurfacesHydroEnabled}
            surfacesHydroMaxDistM={surfacesHydroMaxDistM}
            onSurfacesHydroMaxDistMChange={setSurfacesHydroMaxDistM}
            disabled={isWizardLocked}
          />
        ) : (
          <SelectFilterCriteria
            minAreaHa={minAreaHa}
            onMinAreaHaChange={setMinAreaHa}
            millerThresh={millerThresh}
            onMillerThreshChange={setMillerThresh}
            cesbioLibelles={cesbioLibelles}
            onCesbioLibellesChange={setCesbioLibelles}
            faunaEnabled={faunaEnabled}
            onFaunaEnabledChange={setFaunaEnabled}
            faunaSpecies={faunaSpecies}
            onFaunaSpeciesChange={setFaunaSpecies}
            faunaDistM={faunaDistM}
            onFaunaDistMChange={setFaunaDistM}
            excludedLayers={excludedLayers}
            onExcludedLayersChange={setExcludedLayers}
            disabled={isWizardLocked}
          />
        )}
        <button type="submit" className="eco-aoi-btn eco-aoi-btn--primary" disabled={!canCreateAoi}>
          Lancer le filtrage
        </button>
      </>
    );
  }

  function renderProgressBlock() {
    if (step !== "creating" && step !== "fetching" && step !== "done") return null;
    const showSpinner =
      step === "creating" ||
      (step === "fetching" && !summary) ||
      (step === "done" && ufInProgress);
    const progressTitle =
      step === "creating"
        ? "Création du projet…"
        : ufInProgress && summary
          ? "Filtrage parcelles terminé — unités foncières en cours…"
          : "Progression du filtrage";
    return (
      <div className="eco-aoi-logs">
        <div className="eco-aoi-logs-title">
          {showSpinner && (
            <span className="eco-aoi-logs-spinner" aria-hidden="true" />
          )}
          <span>{progressTitle}</span>
          {showSpinner && (
            <span className="eco-aoi-sr-only" role="status" aria-live="polite">
              Chargement en cours
            </span>
          )}
        </div>
        <PipelineProgressPanel progress={pipelineProgress} />
        {summary && (
          <div className="eco-aoi-summary">
            <p>
              <strong>Réussies : {summary.n_ok}</strong>
              {" · "}
              <strong>Ignorées : {summary.n_skip}</strong>
              {" · "}
              <strong>Erreurs : {summary.n_err}</strong>
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "var(--eco-text-muted)" }}>
              Temps total : {summary.total_s} s
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="eco-aoi-page">
      <div className="eco-aoi-layout">
        <aside className="eco-aoi-sidebar">
          <div className="eco-aoi-sidebar-head">
            <button type="button" className="eco-aoi-icon-btn" onClick={onBack} title="Retour au filtrage" aria-label="Retour">
              ←
            </button>
            <h1>{profile.hubTitle}</h1>
          </div>

          <div className="eco-aoi-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={projectTab === "new"}
              className={`eco-aoi-tab${projectTab === "new" ? " eco-aoi-tab--active" : ""}`}
              disabled={isWizardLocked}
              onClick={() => setProjectTab("new")}
            >
              Nouveau projet
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={projectTab === "existing"}
              className={`eco-aoi-tab${projectTab === "existing" ? " eco-aoi-tab--active" : ""}`}
              disabled={isWizardLocked}
              onClick={() => setProjectTab("existing")}
            >
              Projet existant
            </button>
          </div>

          {projectTab === "new" ? (
            <div className="eco-aoi-sidebar-main">
              <nav className="eco-aoi-steps" aria-label="Étapes de création">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`eco-aoi-step${wizardStep === n ? " eco-aoi-step--active" : ""}${n < wizardStep && canAdvanceFromStep1 ? " eco-aoi-step--done" : ""}`}
                    disabled={isWizardLocked || ((n === 2 || n === 3) && !canAdvanceFromStep1)}
                    onClick={() => {
                      if ((n === 2 || n === 3) && !canAdvanceFromStep1) return;
                      setWizardStep(n);
                    }}
                  >
                    <span className="eco-aoi-step-num">{n}</span>
                    <span>{stepLabels[n]}</span>
                  </button>
                ))}
              </nav>

              <div className="eco-aoi-body">
                <form id="create-aoi-form" onSubmit={handleSubmit} className="eco-aoi-form">
                  {wizardStep === 1 && renderParcelStep()}
                  {wizardStep === 2 && renderZoneStep()}
                  {wizardStep === 3 && renderDataStep()}
                  {error && <div className="eco-aoi-error">{error}</div>}
                  {renderProgressBlock()}
                  {step === "done" && (
                    <div className="eco-aoi-done">
                      <p>
                        {ufInProgress
                          ? "Les parcelles retenues sont prêtes. Le calcul des unités foncières se poursuit en arrière-plan."
                          : "Filtrage terminé. Les parcelles et unités foncières sont prêtes à être consultées."}
                      </p>
                      <button type="button" className="eco-aoi-btn eco-aoi-btn--primary" onClick={handleGoToFilter}>
                        Voir les résultats →
                      </button>
                    </div>
                  )}
                </form>
              </div>

              <div className="eco-aoi-sidebar-foot">
                {step === "form" ? (
                  <div className="eco-aoi-foot-nav">
                    {wizardStep > 1 && (
                      <button
                        type="button"
                        className="eco-aoi-btn eco-aoi-btn--secondary"
                        onClick={() => setWizardStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                      >
                        Précédent
                      </button>
                    )}
                    {wizardStep < 3 && (() => {
                      const suivantEnabled =
                        wizardStep !== 1 || canAdvanceFromStep1;
                      return (
                        <button
                          type="button"
                          className={`eco-aoi-btn${suivantEnabled ? " eco-aoi-btn--ready" : " eco-aoi-btn--primary"}`}
                          disabled={!suivantEnabled}
                          onClick={() => {
                            if (!suivantEnabled) return;
                            setWizardStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
                          }}
                        >
                          Suivant
                        </button>
                      );
                    })()}
                  </div>
                ) : null}
                {step === "form" && (
                  <p className="eco-aoi-foot-hint">
                    Étape {wizardStep}/3 — {stepLabels[wizardStep]}
                  </p>
                )}
                {(step === "creating" || step === "fetching") && (
                  <div className="eco-aoi-loading">
                    {step === "creating"
                      ? "Création du projet…"
                      : "Filtrage écologique en cours…"}
                  </div>
                )}
                {step === "error" && (
                  <button
                    type="button"
                    className="eco-aoi-btn eco-aoi-btn--primary"
                    onClick={() => {
                      setStep("form");
                      setError(null);
                    }}
                  >
                    Réessayer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="eco-aoi-sidebar-main">
              <div className="eco-aoi-body">
                <div className="eco-aoi-existing-panel">
                  <h2>Projet existant</h2>
                  <p className="eco-aoi-intro">
                    Choisissez un projet déjà créé pour reprendre le filtrage écologique.
                  </p>
                  {historyLoading ? (
                    <div className="eco-aoi-status eco-aoi-status--muted">Chargement des projets…</div>
                  ) : historyError ? (
                    <div className="eco-aoi-error">{historyError}</div>
                  ) : historyProjects.length === 0 ? (
                    <div className="eco-aoi-status eco-aoi-status--muted">Aucun projet existant.</div>
                  ) : (
                    <div className="eco-aoi-row">
                      <label className="create-aoi-label" htmlFor="existing-project">
                        Projet
                      </label>
                      <select
                        id="existing-project"
                        className="create-aoi-input"
                        value={selectedExistingProjectId}
                        onChange={(e) => setSelectedExistingProjectId(e.target.value)}
                        disabled={isWizardLocked}
                      >
                        <option value="">Sélectionner un projet…</option>
                        {historyProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {new Date(p.created_at).toLocaleDateString("fr-FR")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              {historyProjects.length > 0 && !historyLoading && !historyError && (
                <div className="eco-aoi-sidebar-foot">
                  <button
                    type="button"
                    className="eco-aoi-btn eco-aoi-btn--primary"
                    disabled={!canLoadExistingProject}
                    onClick={() => {
                      if (selectedExistingProjectId) onDone(selectedExistingProjectId);
                    }}
                  >
                    Ouvrir en filtrage
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        <div className="eco-aoi-map-wrap">
          {projectTab === "new" && sourceFeature && (
            <div className="eco-aoi-map-legend" aria-hidden>
              {!isZh && (
                <div className="eco-aoi-legend-item">
                  <span className="eco-aoi-legend-swatch eco-aoi-legend-swatch--parcel" />
                  Parcelle / emprise
                </div>
              )}
              {isZh && initialUploadFeature && (
                <div className="eco-aoi-legend-item">
                  <span className="eco-aoi-legend-swatch eco-aoi-legend-swatch--initial" />
                  Zone initiale uploadée
                </div>
              )}
              {!isZh && bufferKm > 0 && (
                <div className="eco-aoi-legend-item">
                  <span className="eco-aoi-legend-swatch eco-aoi-legend-swatch--buffer" />
                  Zone de recherche ({bufferKm.toFixed(1)} km)
                </div>
              )}
              {isZh && (
                <div className="eco-aoi-legend-item">
                  <span className="eco-aoi-legend-swatch eco-aoi-legend-swatch--parcel" />
                  {bvPreviewNames.length === 1
                    ? bvPreviewNames[0]
                    : bvPreviewNames.length > 1
                      ? `Périmètre BV (${bvPreviewNames.length})`
                      : "Périmètre de recherche (bassins versants)"}
                </div>
              )}
            </div>
          )}

          <CartoAoi
            parcelFeature={sourceFeature}
            initialZoneFeature={isZh ? initialUploadFeature : null}
            bufferKm={isZh ? 0 : bufferKm}
          />
        </div>
      </div>
    </div>
  );
}
