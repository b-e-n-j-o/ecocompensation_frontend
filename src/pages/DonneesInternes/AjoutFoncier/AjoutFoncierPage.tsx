import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { geometryFilesToLayers } from "../../../geo/importFichiers";
import {
  ApiError,
  createIlot,
  searchCommunes,
  searchContacts,
  searchParcelles,
  intersectParcelles,
  type Commune,
  type Contact,
  type CreateIlotResult,
  type ParcelleGeom,
  type SearchResult,
  type SourceType,
  type Statut,
} from "./AjoutFoncierApi";
import "./AjoutFoncierStyle.css";

const CARTE_PATH = "/reserve-fonciere";

const GIRONDE: [number, number] = [-0.58, 44.84];
const SRC = "af-panier";

/* ================================================================== */
/* Types                                                               */
/* ================================================================== */
type Origine = "ign" | "import";
type AttrValue = string | number | boolean | null;

type Item = {
  uid: string;
  origine: Origine;
  idu: string | null;
  section: string | null;
  numero: string | null;
  prefixe: string | null;
  codeinsee: string | null;
  nomcommune: string | null;
  surface_cadastrale: number | null;
  surface_calc: number; // m², approx. géodésique pour l'affichage
  attributs: Record<string, AttrValue>;
  geometry: ParcelleGeom;
  deja: string | null; // libellé de l'îlot si déjà en réserve
};

type Step = 1 | 2 | 3;
type ContactMode = "aucun" | "existant" | "nouveau";

type IlotForm = {
  nom: string;
  source_type: SourceType;
  source_ref: string;
  date_reception: string;
  statut_prospection: Statut;
  surface_annoncee_ha: string;
  duree_blocage_ans: string;
  contraintes: string;
  description: string;
};

type NewContact = { nom: string; organisme: string; role: string; telephone: string; email: string };

const STATUTS: { v: Statut; l: string }[] = [
  { v: "VALIDE", l: "Validé" },
  { v: "A_ETUDIER", l: "À étudier" },
  { v: "CONTACTE", l: "Contacté" },
];

const EMPTY_ILOT: IlotForm = {
  nom: "",
  source_type: "RECHERCHE_IGN",
  source_ref: "",
  date_reception: new Date().toISOString().slice(0, 10),
  statut_prospection: "VALIDE",
  surface_annoncee_ha: "",
  duree_blocage_ans: "",
  contraintes: "",
  description: "",
};

const EMPTY_CONTACT: NewContact = { nom: "", organisme: "", role: "", telephone: "", email: "" };

/* ================================================================== */
/* Géométrie utilitaire (pas de dépendance turf)                       */
/* ================================================================== */
const R_EARTH = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

function ringArea(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    a += (rad(lon2) - rad(lon1)) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((a * R_EARTH * R_EARTH) / 2);
}

function polyArea(rings: number[][][]): number {
  if (!rings.length) return 0;
  return Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0));
}

function geomArea(g: ParcelleGeom): number {
  return g.type === "Polygon"
    ? polyArea(g.coordinates)
    : g.coordinates.reduce((s, p) => s + polyArea(p), 0);
}

function bboxOf(items: Item[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
      return;
    }
    for (const p of c) walk(p);
  };
  for (const it of items) walk(it.geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/* ================================================================== */
/* Formatage / conversion                                              */
/* ================================================================== */
const fmtHa = (m2: number) => (m2 / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const fmtM2 = (m2: number | null) => (m2 == null ? "—" : Math.round(m2).toLocaleString("fr-FR"));

function cellToValue(raw: string): AttrValue {
  const s = raw.trim();
  if (s === "") return null;
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(",", "."));
  return raw;
}

function valueToCell(v: AttrValue | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function itemTitle(it: Item): string {
  if (it.section && it.numero) return `${it.section} ${it.numero}`;
  if (it.idu) return it.idu;
  return "Polygone importé";
}

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */
export default function AjoutFoncierPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hoverUid, setHoverUid] = useState<string | null>(null);

  /* --- carte --- */
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [baseMap, setBaseMap] = useState<"plan" | "satellite">("plan");
  const [showCadastre, setShowCadastre] = useState(true);
  const hoverRef = useRef<string | null>(null);

  /* --- recherche --- */
  const [tab, setTab] = useState<"recherche" | "import">("recherche");
  const [communeQuery, setCommuneQuery] = useState("");
  const [communeSuggest, setCommuneSuggest] = useState<Commune[]>([]);
  const [commune, setCommune] = useState<Commune | null>(null);
  const [refsText, setRefsText] = useState("");
  const [prefixe, setPrefixe] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchResult | null>(null);

  /* --- import --- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /* --- îlot / contact --- */
  const [ilot, setIlot] = useState<IlotForm>(EMPTY_ILOT);
  const [contactMode, setContactMode] = useState<ContactMode>("nouveau");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactPicked, setContactPicked] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState<NewContact>(EMPTY_CONTACT);

  /* --- attributs / enregistrement --- */
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [newCol, setNewCol] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<CreateIlotResult | null>(null);

  /* ---------------------------------------------------------------- */
  /* Dérivés                                                           */
  /* ---------------------------------------------------------------- */
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) for (const k of Object.keys(it.attributs)) set.add(k);
    for (const c of extraCols) set.add(c);
    return [...set];
  }, [items, extraCols]);

  const totalM2 = useMemo(() => items.reduce((s, it) => s + it.surface_calc, 0), [items]);
  const ilotItems = useMemo(
    () => (step === 1 ? items : items.filter((it) => selected.has(it.uid))),
    [items, selected, step],
  );
  const ilotM2 = useMemo(() => ilotItems.reduce((s, it) => s + it.surface_calc, 0), [ilotItems]);
  const dejaItems = ilotItems.filter((it) => it.deja);
  const sansIdu = ilotItems.filter((it) => !it.idu).length;

  /* ---------------------------------------------------------------- */
  /* Carte                                                             */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
          satellite: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© Esri",
          },
          cadastre: {
            type: "raster",
            tiles: [
              "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
                "&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur" +
                "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
            ],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 19,
            attribution: "© IGN – PCI Express",
          },
        },
        layers: [
          { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
          { id: "osm", type: "raster", source: "osm" },
          { id: "cadastre", type: "raster", source: "cadastre", minzoom: 14 },
        ],
      },
      center: GIRONDE,
      zoom: 8.4,
      maxPitch: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "uid" });
      const color: maplibregl.ExpressionSpecification = [
        "case",
        ["boolean", ["get", "deja"], false], "#dc2626",
        ["==", ["get", "origine"], "import"], "#7c3aed",
        "#0f766e",
      ];
      map.addLayer({
        id: `${SRC}-fill`,
        type: "fill",
        source: SRC,
        paint: {
          "fill-color": color,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.6,
            ["boolean", ["get", "inIlot"], true],
            0.32,
            0.08,
          ],
        },
      });
      map.addLayer({
        id: `${SRC}-line`,
        type: "line",
        source: SRC,
        paint: {
          "line-color": color,
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.8],
        },
      });
      map.on("mousemove", `${SRC}-fill`, (e) => {
        const id = e.features?.[0]?.id;
        map.getCanvas().style.cursor = "pointer";
        if (id != null) setHoverUid(String(id));
      });
      map.on("mouseleave", `${SRC}-fill`, () => {
        map.getCanvas().style.cursor = "";
        setHoverUid(null);
      });
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Données du panier → carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: items.map(
        (it): Feature => ({
          type: "Feature",
          id: it.uid,
          properties: {
            uid: it.uid,
            origine: it.origine,
            deja: Boolean(it.deja),
            inIlot: step === 1 || selected.has(it.uid),
          },
          geometry: it.geometry,
        }),
      ),
    };
    (map.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
  }, [items, mapReady, selected, step]);

  // Survol ligne ↔ carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource(SRC)) return;
    const prev = hoverRef.current;
    if (prev && prev !== hoverUid) map.setFeatureState({ source: SRC, id: prev }, { hover: false });
    if (hoverUid) map.setFeatureState({ source: SRC, id: hoverUid }, { hover: true });
    hoverRef.current = hoverUid;
  }, [hoverUid, mapReady]);

  // Fonds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty("osm", "visibility", baseMap === "plan" ? "visible" : "none");
    map.setLayoutProperty("satellite", "visibility", baseMap === "satellite" ? "visible" : "none");
    map.setLayoutProperty("cadastre", "visibility", showCadastre ? "visible" : "none");
  }, [baseMap, showCadastre, mapReady]);

  const fitTo = (list: Item[]) => {
    const map = mapRef.current;
    const b = bboxOf(list);
    if (!map || !b) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, maxZoom: 17, duration: 600 });
  };

  /* ---------------------------------------------------------------- */
  /* Commune (autocomplétion)                                          */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (commune && communeQuery === `${commune.nom} (${commune.code})`) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      searchCommunes(communeQuery, ctrl.signal)
        .then(setCommuneSuggest)
        .catch(() => setCommuneSuggest([]));
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [communeQuery, commune]);

  const pickCommune = (c: Commune) => {
    setCommune(c);
    setCommuneQuery(`${c.nom} (${c.code})`);
    setCommuneSuggest([]);
  };

  /* ---------------------------------------------------------------- */
  /* Recherche de parcelles                                            */
  /* ---------------------------------------------------------------- */
  const runSearch = async () => {
    if (!commune || !refsText.trim() || searching) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const res = await searchParcelles({ code_insee: commune.code, refs: refsText, prefixe: prefixe || null });
      setLastSearch(res);
      const dejaMap = new Map(res.deja_en_reserve.map((d) => [d.idu, d.ilot_nom || `îlot ${d.ilot_id ?? "?"}`]));
      const incoming: Item[] = res.features.map((f) => {
        const p = f.properties;
        return {
          uid: p.idu,
          origine: "ign" as const,
          idu: p.idu,
          section: p.section,
          numero: p.numero,
          prefixe: p.prefixe,
          codeinsee: p.code_insee,
          nomcommune: p.nom_commune ?? commune.nom,
          surface_cadastrale: p.contenance,
          surface_calc: geomArea(f.geometry),
          attributs: {},
          geometry: f.geometry,
          deja: dejaMap.get(p.idu) ?? null,
        };
      });
      setItems((prev) => {
        const known = new Set(prev.map((p) => p.uid));
        return [...prev, ...incoming.filter((it) => it.uid && !known.has(it.uid))];
      });
      if (res.features.length) fitTo(res.features.map((f) => ({ geometry: f.geometry }) as Item));
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Import de fichiers                                                */
  /* ---------------------------------------------------------------- */
  const importFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? [...fileList] : [];
    if (!files.length || importBusy) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const layers = await geometryFilesToLayers(files);
      const geoms: ParcelleGeom[] = [];
      let nSkipped = 0;
      for (const layer of layers) {
        for (const f of layer.fc.features) {
          const g = f.geometry;
          if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
            nSkipped += 1;
            continue;
          }
          geoms.push(g);
        }
      }
      if (!geoms.length) {
        setImportMsg({ ok: false, text: "Aucun polygone trouvé dans le(s) fichier(s)." });
        return;
      }

      const res = await intersectParcelles(geoms);
      const dejaMap = new Map(res.deja_en_reserve.map((d) => [d.idu, d.ilot_nom || `îlot ${d.ilot_id ?? "?"}`]));
      const incoming: Item[] = res.features.map((f) => {
        const p = f.properties;
        return {
          uid: p.idu,
          origine: "ign" as const,
          idu: p.idu,
          section: p.section,
          numero: p.numero,
          prefixe: p.prefixe,
          codeinsee: p.code_insee,
          nomcommune: p.nom_commune,
          surface_cadastrale: p.contenance,
          surface_calc: geomArea(f.geometry),
          attributs: {},
          geometry: f.geometry,
          deja: dejaMap.get(p.idu) ?? null,
        };
      });
      if (!incoming.length) {
        setImportMsg({
          ok: false,
          text: "Le cadastre ne renvoie aucune parcelle sur cette emprise. Complétez avec la recherche par référence.",
        });
        return;
      }
      setItems((prev) => {
        const known = new Set(prev.map((p) => p.uid));
        return [...prev, ...incoming.filter((it) => it.uid && !known.has(it.uid))];
      });
      fitTo(incoming);
      setImportMsg({
        ok: true,
        text:
          `${incoming.length} parcelle(s) cadastrale(s) intersectée(s)` +
          (nSkipped ? ` · ${nSkipped} géométrie(s) ignorée(s)` : "") +
          ". Retirez les faux positifs, ou ajoutez les manquantes via la recherche.",
      });
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setImportBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Panier                                                            */
  /* ---------------------------------------------------------------- */
  const removeItem = (uid: string) => {
    setItems((prev) => prev.filter((p) => p.uid !== uid));
    setSelected((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  };

  const toggleSelected = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const setCell = (uid: string, key: string, raw: string) =>
    setItems((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, attributs: { ...p.attributs, [key]: cellToValue(raw) } } : p)),
    );

  const addColumn = () => {
    const k = newCol.trim();
    if (!k || columns.includes(k)) return;
    setExtraCols((c) => [...c, k]);
    setNewCol("");
  };

  const removeColumn = (key: string) => {
    setExtraCols((c) => c.filter((x) => x !== key));
    setItems((prev) =>
      prev.map((p) => {
        if (!(key in p.attributs)) return p;
        const next = { ...p.attributs };
        delete next[key];
        return { ...p, attributs: next };
      }),
    );
  };

  const fillColumn = (key: string) => {
    const v = window.prompt(`Valeur à appliquer à toutes les parcelles pour « ${key} » :`);
    if (v == null) return;
    setItems((prev) => prev.map((p) => ({ ...p, attributs: { ...p.attributs, [key]: cellToValue(v) } })));
  };

  /* ---------------------------------------------------------------- */
  /* Navigation entre étapes                                           */
  /* ---------------------------------------------------------------- */
  const goStep2 = () => {
    if (!items.length) return;
    const origines = new Set(items.map((i) => i.origine));
    const communes = [...new Set(items.map((i) => i.nomcommune).filter(Boolean))];
    setIlot((s) => ({
      ...s,
      source_type: origines.size === 1 && origines.has("import") ? "IMPORT_FICHIER" : s.source_type === "ENVOI_ECOCOMP" ? s.source_type : "RECHERCHE_IGN",
      nom: s.nom || `${communes.slice(0, 2).join(" / ") || "Îlot"} – ${fmtHa(totalM2)} ha`,
    }));
    setSelected(new Set(items.map((it) => it.uid)));
    setStep(2);
  };

  // Contacts existants
  useEffect(() => {
    if (step !== 2 || contactMode !== "existant") return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchContacts(contactQuery)
        .then((r) => !cancelled && setContactResults(r))
        .catch(() => !cancelled && setContactResults([]));
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [contactQuery, contactMode, step]);

  const step2Valid =
    ilot.nom.trim().length > 0 &&
    ilotItems.length > 0 &&
    (contactMode !== "existant" || contactPicked != null) &&
    (contactMode !== "nouveau" || newContact.nom.trim() !== "" || newContact.organisme.trim() !== "");

  /* ---------------------------------------------------------------- */
  /* Enregistrement                                                    */
  /* ---------------------------------------------------------------- */
  const save = async () => {
    if (saving || !ilotItems.length || dejaItems.length) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const nz = (s: string) => (s.trim() ? s.trim() : null);
      const contact =
        contactMode === "existant" && contactPicked
          ? { id: contactPicked.id }
          : contactMode === "nouveau"
            ? {
                nom: nz(newContact.nom),
                organisme: nz(newContact.organisme),
                role: nz(newContact.role),
                telephone: nz(newContact.telephone),
                email: nz(newContact.email),
              }
            : null;
      const res = await createIlot({
        ilot: {
          nom: ilot.nom.trim(),
          source_type: ilot.source_type,
          source_ref: null,
          date_reception: ilot.date_reception || null,
          statut_prospection: ilot.statut_prospection,
          surface_annoncee_ha: null,
          duree_blocage_ans: null,
          contraintes: nz(ilot.contraintes),
          description: nz(ilot.description),
        },
        contact,
        parcelles: ilotItems.map((it) => ({
          idu: it.idu,
          section: it.section,
          numero: it.numero,
          prefixe: it.prefixe,
          codeinsee: it.codeinsee,
          nomcommune: it.nomcommune,
          surface_cadastrale: it.surface_cadastrale,
          attributs_source: Object.fromEntries(Object.entries(it.attributs).filter(([, v]) => v != null && v !== "")),
          geometry: it.geometry,
        })),
      });
      setSaved(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const idus = (e.detail as { idus?: string[] } | null)?.idus ?? [];
        setItems((prev) => prev.map((p) => (p.idu && idus.includes(p.idu) ? { ...p, deja: "déjà en réserve" } : p)));
        setSaveErr(`${e.message} Retirez-les du panier : ${idus.join(", ")}`);
      } else {
        setSaveErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setItems([]);
    setStep(1);
    setIlot(EMPTY_ILOT);
    setContactMode("nouveau");
    setContactPicked(null);
    setNewContact(EMPTY_CONTACT);
    setExtraCols([]);
    setLastSearch(null);
    setRefsText("");
    setImportMsg(null);
    setSelected(new Set());
    setSaved(null);
    setSaveErr(null);
  };

  const nextIlot = () => {
    const left = items.filter((it) => !selected.has(it.uid));
    setItems(left);
    setSelected(new Set(left.map((it) => it.uid)));
    setIlot((s) => ({ ...EMPTY_ILOT, source_type: s.source_type }));
    setContactMode("nouveau");
    setContactPicked(null);
    setNewContact(EMPTY_CONTACT);
    setSaved(null);
    setSaveErr(null);
    setStep(2);
  };

  /* ================================================================ */
  /* Rendu                                                             */
  /* ================================================================ */
  return (
    <div className={`af-root${step === 3 ? " is-wide" : ""}`}>
      <section className="af-panel">
        <header className="af-head">
          <h1>Ajouter du foncier</h1>
          <ol className="af-steps">
            {(["Parcelles", "Îlot & contact", "Attributs & validation"] as const).map((l, i) => (
              <li key={l} className={step === i + 1 ? "is-current" : step > i + 1 ? "is-done" : ""}>
                <span>{i + 1}</span>
                {l}
              </li>
            ))}
          </ol>
        </header>

        {saved ? (
          <div className="af-body af-success">
            <h2>Îlot enregistré</h2>
            <p>
              {saved.nb_parcelles} parcelle(s) · {saved.surface_sig_ha.toLocaleString("fr-FR")} ha ajoutée(s) à la
              réserve foncière.
            </p>
            <div className="af-actions">
              {items.some((it) => !selected.has(it.uid)) && (
                <button type="button" className="af-btn af-btn--primary" onClick={nextIlot}>
                  Composer l'îlot suivant ({items.filter((it) => !selected.has(it.uid)).length})
                </button>
              )}
              <button type="button" className="af-btn" onClick={resetAll}>
                Nouveau stock
              </button>
              <button type="button" className="af-btn" onClick={() => navigate(CARTE_PATH)}>
                Voir sur la carte
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ------------------------- ÉTAPE 1 ------------------------- */}
            {step === 1 && (
              <div className="af-body">
                <div className="af-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "recherche"}
                    className={tab === "recherche" ? "is-on" : ""}
                    onClick={() => setTab("recherche")}
                  >
                    Rechercher au cadastre
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "import"}
                    className={tab === "import" ? "is-on" : ""}
                    onClick={() => setTab("import")}
                  >
                    Importer un fichier
                  </button>
                </div>

                {tab === "recherche" ? (
                  <div className="af-form">
                    <label className="af-field af-field--suggest">
                      <span>Commune</span>
                      <input
                        value={communeQuery}
                        placeholder="Mongauzy ou 33287"
                        onChange={(e) => {
                          setCommuneQuery(e.target.value);
                          setCommune(null);
                        }}
                      />
                      {communeSuggest.length > 0 && !commune && (
                        <ul className="af-suggest">
                          {communeSuggest.map((c) => (
                            <li key={c.code}>
                              <button type="button" onClick={() => pickCommune(c)}>
                                {c.nom} <small>{c.code}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </label>
                    <label className="af-field">
                      <span>Références (section + numéro)</span>
                      <textarea
                        rows={3}
                        value={refsText}
                        placeholder="ZB0175 / ZB0176 / ZB0177 — ou ZB 12, 13, 14"
                        onChange={(e) => setRefsText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void runSearch();
                        }}
                      />
                    </label>
                    <div className="af-row">
                      <label className="af-field af-field--sm">
                        <span>Préfixe</span>
                        <input
                          value={prefixe}
                          placeholder="000"
                          maxLength={3}
                          onChange={(e) => setPrefixe(e.target.value.replace(/\D/g, ""))}
                        />
                      </label>
                      <button
                        type="button"
                        className="af-btn af-btn--primary"
                        disabled={!commune || !refsText.trim() || searching}
                        onClick={() => void runSearch()}
                      >
                        {searching ? "Recherche…" : "Chercher"}
                      </button>
                    </div>
                    {searchErr && <p className="af-error">{searchErr}</p>}
                    {lastSearch && (
                      <div className="af-report">
                        <p>
                          Lu : {lastSearch.refs_lues.map((r) => `${r.section}${r.numero}`).join(", ")} ·{" "}
                          <strong>{lastSearch.features.length} trouvée(s)</strong>
                        </p>
                        {lastSearch.not_found.length > 0 && (
                          <p className="af-warn">
                            Introuvable(s) : {lastSearch.not_found.map((r) => `${r.section}${r.numero}`).join(", ")} —
                            vérifiez la référence (coquille, numéro tronqué ?).
                          </p>
                        )}
                        {lastSearch.multiples.length > 0 && (
                          <p className="af-warn">
                            Plusieurs parcelles pour {lastSearch.multiples.join(", ")} (communes associées) : retirez
                            celles en trop ou précisez le préfixe.
                          </p>
                        )}
                        {lastSearch.deja_en_reserve.length > 0 && (
                          <p className="af-error">
                            Déjà en réserve : {lastSearch.deja_en_reserve.map((d) => d.idu).join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="af-form">
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      multiple
                      accept=".zip,.geojson,.json,.shp,.dbf,.prj,.shx,.cpg"
                      onChange={(e) => {
                        const f = e.target.files ? [...e.target.files] : [];
                        e.target.value = "";
                        void importFiles(f);
                      }}
                    />
                    <div
                      className={`af-drop${dragOver ? " is-over" : ""}${importBusy ? " is-busy" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => !importBusy && fileRef.current?.click()}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !importBusy) fileRef.current?.click();
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        void importFiles(e.dataTransfer.files);
                      }}
                    >
                      <strong>{importBusy ? "Lecture…" : "Glissez un ZIP shapefile ou un GeoJSON"}</strong>
                      <span>ou cliquez pour parcourir · les attributs seront éditables à l'étape 3</span>
                    </div>
                    {importMsg && <p className={importMsg.ok ? "af-ok" : "af-error"}>{importMsg.text}</p>}
                  </div>
                )}

                <Panier
                  items={items}
                  totalM2={totalM2}
                  hoverUid={hoverUid}
                  onHover={setHoverUid}
                  onRemove={removeItem}
                  onFit={() => fitTo(items)}
                />
                <p className="af-muted">
                  Changez de commune et cherchez à nouveau : les parcelles déjà trouvées restent dans ce stock.
                  La répartition en îlots se fait à l'étape suivante.
                </p>

                <div className="af-actions">
                  <span />
                  <button
                    type="button"
                    className="af-btn af-btn--primary"
                    disabled={!items.length}
                    onClick={goStep2}
                  >
                    Continuer ({items.length})
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------- ÉTAPE 2 ------------------------- */}
            {step === 2 && (
              <div className="af-body">
                <h2 className="af-h2">Parcelles de cet îlot</h2>
                <p className="af-muted">
                  {ilotItems.length} sur {items.length} · ≈ {fmtHa(ilotM2)} ha
                </p>
                <ul className="af-pick">
                  {items.map((it) => (
                    <li key={it.uid}>
                      <button
                        type="button"
                        className={selected.has(it.uid) ? "is-on" : ""}
                        onClick={() => toggleSelected(it.uid)}
                        onMouseEnter={() => setHoverUid(it.uid)}
                        onMouseLeave={() => setHoverUid(null)}
                      >
                        <strong>{itemTitle(it)}</strong>
                        <span>
                          {[it.nomcommune, `${fmtM2(it.surface_calc)} m²`].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="af-row">
                  <button type="button" className="af-link" onClick={() => setSelected(new Set(items.map((it) => it.uid)))}>
                    Tout sélectionner
                  </button>
                  <button type="button" className="af-link" onClick={() => setSelected(new Set())}>
                    Tout retirer
                  </button>
                </div>

                <h2 className="af-h2">Îlot</h2>
                <div className="af-form">
                  <label className="af-field">
                    <span>Nom *</span>
                    <input value={ilot.nom} onChange={(e) => setIlot({ ...ilot, nom: e.target.value })} />
                  </label>
                  <div className="af-grid2">
                    <label className="af-field">
                      <span>Statut</span>
                      <select
                        value={ilot.statut_prospection}
                        onChange={(e) => setIlot({ ...ilot, statut_prospection: e.target.value as Statut })}
                      >
                        {STATUTS.map((s) => (
                          <option key={s.v} value={s.v}>
                            {s.l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="af-field">
                      <span>Reçu le</span>
                      <input
                        type="date"
                        value={ilot.date_reception}
                        onChange={(e) => setIlot({ ...ilot, date_reception: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="af-field">
                    <span>Contraintes</span>
                    <input
                      value={ilot.contraintes}
                      placeholder="Facultatif"
                      onChange={(e) => setIlot({ ...ilot, contraintes: e.target.value })}
                    />
                  </label>
                  <label className="af-field">
                    <span>Description</span>
                    <textarea
                      rows={2}
                      value={ilot.description}
                      placeholder="Durée de blocage, accords, précisions…"
                      onChange={(e) => setIlot({ ...ilot, description: e.target.value })}
                    />
                  </label>
                </div>

                <h2 className="af-h2">Contact</h2>
                <div className="af-seg">
                  {(["nouveau", "existant", "aucun"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={contactMode === m ? "is-on" : ""}
                      onClick={() => setContactMode(m)}
                    >
                      {m === "nouveau" ? "Nouveau" : m === "existant" ? "Existant" : "Aucun"}
                    </button>
                  ))}
                </div>
                {contactMode === "nouveau" && (
                  <div className="af-form af-grid2">
                    <label className="af-field">
                      <span>Organisme</span>
                      <input
                        value={newContact.organisme}
                        placeholder="Syndicat, propriétaire…"
                        onChange={(e) => setNewContact({ ...newContact, organisme: e.target.value })}
                      />
                    </label>
                    <label className="af-field">
                      <span>Nom</span>
                      <input value={newContact.nom} onChange={(e) => setNewContact({ ...newContact, nom: e.target.value })} />
                    </label>
                    <label className="af-field">
                      <span>Fonction</span>
                      <input value={newContact.role} onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} />
                    </label>
                    <label className="af-field">
                      <span>Téléphone</span>
                      <input
                        type="tel"
                        value={newContact.telephone}
                        onChange={(e) => setNewContact({ ...newContact, telephone: e.target.value })}
                      />
                    </label>
                    <label className="af-field af-span2">
                      <span>E-mail</span>
                      <input
                        type="email"
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                      />
                    </label>
                  </div>
                )}
                {contactMode === "existant" && (
                  <div className="af-form">
                    <input
                      className="af-input"
                      value={contactQuery}
                      placeholder="Rechercher un nom, un organisme, un e-mail…"
                      onChange={(e) => setContactQuery(e.target.value)}
                    />
                    <ul className="af-contacts">
                      {contactResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={contactPicked?.id === c.id ? "is-on" : ""}
                            onClick={() => setContactPicked(c)}
                          >
                            <strong>{c.organisme || c.nom}</strong>
                            <span>{[c.organisme ? c.nom : null, c.telephone, c.email].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                      {!contactResults.length && <li className="af-muted">Aucun contact trouvé.</li>}
                    </ul>
                  </div>
                )}

                <div className="af-actions">
                  <button type="button" className="af-btn" onClick={() => setStep(1)}>
                    Retour
                  </button>
                  <button
                    type="button"
                    className="af-btn af-btn--primary"
                    disabled={!step2Valid}
                    onClick={() => setStep(3)}
                  >
                    Continuer
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------- ÉTAPE 3 ------------------------- */}
            {step === 3 && (
              <div className="af-body">
                <div className="af-summary">
                  <div>
                    <small>Îlot</small>
                    <strong>{ilot.nom}</strong>
                  </div>
                  <div>
                    <small>Parcelles</small>
                    <strong>{ilotItems.length}</strong>
                  </div>
                  <div>
                    <small>Surface SIG ≈</small>
                    <strong>{fmtHa(ilotM2)} ha</strong>
                  </div>
                </div>

                {dejaItems.length > 0 && (
                  <p className="af-error">
                    {dejaItems.length} parcelle(s) déjà en réserve (en rouge) : retirez-les pour enregistrer.
                  </p>
                )}
                {sansIdu > 0 && (
                  <p className="af-muted">
                    {sansIdu} polygone(s) sans IDU : ils seront enregistrés tels quels, sans référence cadastrale.
                  </p>
                )}

                <div className="af-table-wrap">
                  <table className="af-table">
                    <thead>
                      <tr>
                        <th>Parcelle</th>
                        <th>Commune</th>
                        <th className="num">Cad. (m²)</th>
                        <th className="num">SIG ≈ (m²)</th>
                        {columns.map((c) => (
                          <th key={c} className="af-col">
                            <span>{c}</span>
                            <button type="button" title="Remplir toute la colonne" onClick={() => fillColumn(c)}>
                              ⇣
                            </button>
                            <button type="button" title="Supprimer la colonne" onClick={() => removeColumn(c)}>
                              ×
                            </button>
                          </th>
                        ))}
                        <th className="af-col-add">
                          <input
                            value={newCol}
                            placeholder="+ colonne"
                            onChange={(e) => setNewCol(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addColumn()}
                            onBlur={addColumn}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ilotItems.map((it) => (
                        <tr
                          key={it.uid}
                          className={`${it.deja ? "is-deja" : ""}${hoverUid === it.uid ? " is-hover" : ""}`}
                          onMouseEnter={() => setHoverUid(it.uid)}
                          onMouseLeave={() => setHoverUid(null)}
                        >
                          <td title={it.idu ?? undefined}>{itemTitle(it)}</td>
                          <td>{it.nomcommune ?? "—"}</td>
                          <td className="num">{fmtM2(it.surface_cadastrale)}</td>
                          <td className="num">{fmtM2(it.surface_calc)}</td>
                          {columns.map((c) => (
                            <td key={c}>
                              <input
                                value={valueToCell(it.attributs[c])}
                                onChange={(e) => setCell(it.uid, c, e.target.value)}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="af-icon"
                              title="Retirer"
                              onClick={() => removeItem(it.uid)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {saveErr && <p className="af-error">{saveErr}</p>}
                <div className="af-actions">
                  <button type="button" className="af-btn" onClick={() => setStep(2)}>
                    Retour
                  </button>
                  <button
                    type="button"
                    className="af-btn af-btn--primary"
                    disabled={saving || !ilotItems.length || dejaItems.length > 0}
                    onClick={() => void save()}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer dans la réserve"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="af-map-wrap">
        <div ref={mapEl} className="af-map" />
        <div className="af-map-tools">
          <button type="button" onClick={() => setBaseMap((m) => (m === "plan" ? "satellite" : "plan"))}>
            {baseMap === "plan" ? "Satellite" : "Plan"}
          </button>
          <button type="button" className={showCadastre ? "is-on" : ""} onClick={() => setShowCadastre((v) => !v)}>
            Cadastre
          </button>
        </div>
        <div className="af-legend">
          <span><i style={{ background: "#0f766e" }} />Cadastre IGN</span>
          <span><i style={{ background: "#7c3aed" }} />Import</span>
          <span><i style={{ background: "#dc2626" }} />Déjà en réserve</span>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* Panier (liste des géométries sélectionnées)                         */
/* ================================================================== */
function Panier({
  items,
  totalM2,
  hoverUid,
  onHover,
  onRemove,
  onFit,
}: {
  items: Item[];
  totalM2: number;
  hoverUid: string | null;
  onHover: (uid: string | null) => void;
  onRemove: (uid: string) => void;
  onFit: () => void;
}) {
  if (!items.length) {
    return <p className="af-muted af-empty">Aucune parcelle sélectionnée pour l'instant.</p>;
  }
  return (
    <div className="af-cart">
      <div className="af-cart__head">
        <strong>
          {items.length} géométrie(s) · ≈ {fmtHa(totalM2)} ha
        </strong>
        <button type="button" className="af-link" onClick={onFit}>
          Recentrer
        </button>
      </div>
      <ul>
        {items.map((it) => (
          <li
            key={it.uid}
            className={`${it.deja ? "is-deja" : ""}${hoverUid === it.uid ? " is-hover" : ""}`}
            onMouseEnter={() => onHover(it.uid)}
            onMouseLeave={() => onHover(null)}
          >
            <span className={`af-dot af-dot--${it.deja ? "deja" : it.origine}`} />
            <span className="af-cart__label">
              {itemTitle(it)}
              <small>
                {it.nomcommune ?? ""}
                {it.deja ? ` · déjà en réserve (${it.deja})` : ""}
              </small>
            </span>
            <span className="af-cart__surf">{fmtM2(it.surface_calc)} m²</span>
            <button type="button" className="af-icon" title="Retirer" onClick={() => onRemove(it.uid)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}