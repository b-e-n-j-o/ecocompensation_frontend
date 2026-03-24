import { useEffect, useRef, useState } from "react";
import { createProjectFromParcelle, startFetch } from "../../api";
import type { FromParcelleBody } from "../../api";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { Slider } from "../../components/FilterPanel/primitives";
import { CartoAoi } from "./CartoAoi";
import "../../components/FilterPanel/filter-panel.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Ordre et libellés des couches
const LAYER_ORDER = [
  "unites_foncieres", "sous_ensembles",
  "parcelles", "geomce", "zone_de_vegetation", "zone_humide", "troncons_hydro",
  "routes", "voies_ferrees", "fragmentation", "zones_humides_probables", "surfaces_hydro",
  "ebc", "patrimoine_naturel", "znieff", "frayeres", "arrachage_vignes",
] as const;

const LAYER_LABELS: Record<string, string> = {
  unites_foncieres: "Unités foncières (personnes morales)",
  sous_ensembles: "Sous-ensembles UF (k=2..5)",
  parcelles: "Parcelles cadastrales",
  geomce: "Mesures compensatoires GEOMCE",
  zone_de_vegetation: "Zone de végétation",
  zone_humide: "Zone humide",
  troncons_hydro: "Tronçons hydrographiques",
  routes: "Tronçons de route",
  voies_ferrees: "Tronçons de voie ferrée",
  fragmentation: "Fragmentation (polygones)",
  zones_humides_probables: "Zones humides probables",
  surfaces_hydro: "Surfaces hydrographiques",
  ebc: "Espaces Boisés Classés",
  patrimoine_naturel: "Patrimoine naturel",
  znieff: "ZNIEFF",
  frayeres: "Frayères",
  arrachage_vignes: "Arrachage de vignes",
};

type LayerStatus = "pending" | "running" | "done" | "skipped" | "error";
type ParcelleFeature = Feature<Polygon | MultiPolygon>;

type LayerState = { status: LayerStatus; n_inserted?: number; message?: string };

type SummaryState = { n_ok: number; n_skip: number; n_err: number; total_s: number } | null;

function initialLayerResults(): Record<string, LayerState> {
  return Object.fromEntries(LAYER_ORDER.map((k) => [k, { status: "pending" }]));
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
  const [layerResults, setLayerResults] = useState<Record<string, LayerState>>(initialLayerResults());
  const [summary, setSummary] = useState<SummaryState>(null);
  const [parcelFeature, setParcelFeature] = useState<ParcelleFeature | null>(null);
  const [isSearchingParcel, setIsSearchingParcel] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [layerResults, summary]);

  useEffect(() => {
    if (step !== "fetching" || !projectId) return;
    setLayerResults(initialLayerResults());
    setSummary(null);
    const WS = API.replace(/^http/, "ws");
    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
    setLayerResults(initialLayerResults());
    setSummary(null);

    const body: FromParcelleBody = {
      code_insee: codeInsee.trim(),
      section: section.trim(),
      numero: numero.trim(),
      name: name.trim() || `PARCELLE_${codeInsee}_${section}_${numero}`,
      buffer_km: bufferKm,
    };

    if (!body.code_insee || !body.section || !body.numero) {
      setError("Renseignez INSEE, section et numéro.");
      return;
    }
    if (!parcelFeature) {
      setError("Recherchez d'abord la parcelle pour vérifier la géométrie sur la carte.");
      return;
    }

    setStep("creating");

    try {
      const res = await createProjectFromParcelle(body);
      setProjectId(res.project_id);
      setStep("fetching");
      await startFetch(res.project_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création projet");
      setStep("error");
      return;
    }
  }

  function handleGoToFilter() {
    if (projectId) onDone(projectId);
  }

  const canCreateAoi =
    step === "form" && !isSearchingParcel && !!parcelFeature && !!codeInsee.trim() && !!section.trim() && !!numero.trim();

  async function handleSearchParcelle() {
    setError(null);
    const insee = codeInsee.trim();
    const sec = section.trim().toUpperCase();
    const num = numero.trim();

    if (!insee || !sec || !num) {
      setError("Renseignez INSEE, section et numéro avant la recherche parcellaire.");
      return;
    }

    setIsSearchingParcel(true);
    try {
      const url = new URL("https://apicarto.ign.fr/api/cadastre/parcelle");
      url.searchParams.set("code_insee", insee);
      url.searchParams.set("section", sec);
      url.searchParams.set("numero", num);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`IGN a répondu ${res.status}`);
      }

      const data = (await res.json()) as {
        features?: Array<Feature>;
      };
      const feature = data.features?.[0];
      if (!feature || (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon")) {
        throw new Error("Parcelle introuvable pour cette référence.");
      }

      setParcelFeature(feature as ParcelleFeature);
    } catch (err) {
      setParcelFeature(null);
      setError(err instanceof Error ? err.message : "Erreur recherche parcellaire IGN");
    } finally {
      setIsSearchingParcel(false);
    }
  }

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
            Saisissez la référence cadastrale et le buffer. La carte (vue satellite, Gironde) servira
            bientôt à visualiser la parcelle cible et le périmètre d’étude.
          </p>
          <form id="create-aoi-form" onSubmit={handleSubmit} className="create-aoi-form">
            <div className="section-block create-aoi-block">
              <div className="section-header">
                <span className="section-title">Référence parcellaire</span>
              </div>
              <div className="section-body">
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
                  {isSearchingParcel ? "Recherche parcelle..." : "Rechercher parcelle (IGN)"}
                </button>
                <div className={`create-aoi-parcel-status ${parcelFeature ? "is-found" : "is-missing"}`}>
                  {parcelFeature ? "Parcelle trouvée et affichée sur la carte." : "Parcelle non recherchée."}
                </div>
                <div className="create-aoi-row">
                  <label className="create-aoi-label">Nom du projet</label>
                  <input
                    type="text"
                    className="create-aoi-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex. PARCELLE_33274_0D_0962"
                    disabled={step === "creating" || step === "fetching"}
                  />
                </div>
                <Slider
                  label="Buffer AOI"
                  value={bufferKm}
                  min={0}
                  max={10}
                  step={0.5}
                  format={(v) => v.toFixed(1)}
                  unit=" km"
                  onChange={setBufferKm}
                />
                <button type="submit" className="btn-run create-aoi-submit-inline" disabled={!canCreateAoi}>
                  Créer AOI (buffer) et lancer les couches
                </button>
              </div>
            </div>

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
                  {LAYER_ORDER.map((key) => {
                    const state = layerResults[key] ?? { status: "pending" };
                    const label = LAYER_LABELS[key] ?? key;
                    let cell: string;
                    if (state.status === "pending") cell = "—";
                    else if (state.status === "running") cell = "…";
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
                          {LAYER_ORDER.filter((k) => layerResults[k]?.status === "done").map((k) => LAYER_LABELS[k] ?? k).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="create-aoi-summary-line create-aoi-summary-skip">
                      <strong>Ignorées : {summary.n_skip}</strong>
                      {summary.n_skip > 0 && (
                        <span className="create-aoi-summary-list">
                          {LAYER_ORDER.filter((k) => layerResults[k]?.status === "skipped").map((k) => LAYER_LABELS[k] ?? k).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="create-aoi-summary-line create-aoi-summary-err">
                      <strong>Erreurs : {summary.n_err}</strong>
                      {summary.n_err > 0 && (
                        <span className="create-aoi-summary-list">
                          {LAYER_ORDER.filter((k) => layerResults[k]?.status === "error").map((k) => LAYER_LABELS[k] ?? k).join(", ")}
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
          {step === "form" && <div className="create-aoi-footer-hint">1) Rechercher parcelle → 2) Créer AOI</div>}
          {(step === "creating" || step === "fetching") && (
            <div className="create-aoi-loading">
              <span className="spinner" />
              {step === "creating" ? "Création du projet…" : "Intersection des couches en cours, le processus peut prendre jusqu'à 10 minutes"}
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
          <CartoAoi parcelFeature={parcelFeature} bufferKm={bufferKm} />
        </div>
      </div>
    </div>
  );
}
