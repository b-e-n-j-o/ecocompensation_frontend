import type { Feature, MultiPolygon, Polygon } from "geojson";

import { getApiBaseUrl } from "../../../config/apiBase";

const API_BASE = getApiBaseUrl();

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* corps non JSON */
    }
    const message =
      typeof detail === "string"
        ? detail
        : typeof detail === "object" && detail && "message" in detail
          ? String((detail as { message: unknown }).message)
          : `Erreur ${res.status}`;
    throw new ApiError(res.status, message, detail);
  }
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
export type ParcelleGeom = Polygon | MultiPolygon;

export type ParcelleProps = {
  idu: string;
  code_insee: string;
  nom_commune: string | null;
  section: string;
  numero: string;
  prefixe: string;
  contenance: number | null;
};

export type SearchResult = {
  refs_lues: { section: string; numero: string }[];
  features: Feature<ParcelleGeom, ParcelleProps>[];
  not_found: { section: string; numero: string; raison: string }[];
  multiples: string[];
  deja_en_reserve: { idu: string; ilot_id: number | null; ilot_nom: string | null }[];
};

export type Contact = {
  id: number;
  nom: string | null;
  organisme: string | null;
  role: string | null;
  telephone: string | null;
  email: string | null;
};

export type ContactInput = {
  id?: number;
  nom?: string | null;
  organisme?: string | null;
  role?: string | null;
  telephone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type SourceType = "RECHERCHE_IGN" | "IMPORT_FICHIER" | "ENVOI_ECOCOMP";
export type Statut = "A_ETUDIER" | "CONTACTE" | "EN_NEGOCIATION" | "VALIDE" | "REJETE";

export type IlotInput = {
  nom: string;
  source_type: SourceType;
  source_ref?: string | null;
  date_reception?: string | null; // YYYY-MM-DD
  statut_prospection: Statut;
  surface_annoncee_ha?: number | null;
  duree_blocage_ans?: number | null;
  contraintes?: string | null;
  description?: string | null;
};

export type ParcelleInput = {
  idu: string | null;
  section: string | null;
  numero: string | null;
  prefixe: string | null;
  codeinsee: string | null;
  nomcommune: string | null;
  surface_cadastrale: number | null;
  attributs_source: Record<string, unknown>;
  geometry: ParcelleGeom;
};

export type CreateIlotResult = {
  ilot_id: number;
  contact_id: number | null;
  nb_parcelles: number;
  surface_sig_ha: number;
};

export type Commune = { code: string; nom: string; codeDepartement: string };

/* ------------------------------------------------------------------ */
/* Appels                                                               */
/* ------------------------------------------------------------------ */

/** Autocomplétion commune — API Géo (appel direct, CORS ouvert). */
export async function searchCommunes(q: string, signal?: AbortSignal): Promise<Commune[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const fields = "fields=nom,code,codeDepartement";
  const url = /^\d{5}$/.test(s)
    ? `https://geo.api.gouv.fr/communes/${s}?${fields}`
    : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(s)}&${fields}&boost=population&limit=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : data?.code ? [data] : [];
}

export function searchParcelles(body: { code_insee: string; refs: string; prefixe?: string | null }) {
  return request<SearchResult>("/api/reserve-fonciere/parcelles/search", {
    method: "POST",
    body: JSON.stringify({ ...body, prefixe: body.prefixe || null }),
  });
}

/** Parcelles du PCI qui intersectent les polygones importés. */
export function intersectParcelles(geometries: ParcelleGeom[]) {
  return request<Pick<SearchResult, "features" | "deja_en_reserve">>("/api/reserve-fonciere/parcelles/intersect", {
    method: "POST",
    body: JSON.stringify({ geometries }),
  });
}

export function searchContacts(q: string) {
  return request<Contact[]>(`/api/reserve-fonciere/contacts?q=${encodeURIComponent(q)}`);
}

export function createIlot(body: { ilot: IlotInput; contact: ContactInput | null; parcelles: ParcelleInput[] }) {
  return request<CreateIlotResult>("/api/reserve-fonciere/ilots", { method: "POST", body: JSON.stringify(body) });
}