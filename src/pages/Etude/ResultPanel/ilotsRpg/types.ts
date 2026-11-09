// Types du module « Îlots agricoles RPG » (miroir de backend rpg_ilots/pool.py et api.py).
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export interface IlotRpgScoreEco {
  total_score: number;
  max_score: number;
  breakdown?: Record<string, unknown>;
}

export interface IlotRpgResult {
  rang: number;
  num_ilot: string;
  idus: string[];
  nb_parcelles: number;
  surface_ha: number;
  miller: number;
  distance_centre_km: number;
  cat_dominante: string | null;        // TA | CP | PP | NA | SB | null (non cultivé)
  code_group_dominant: number | null;
  code_cultu_dominant: string | null;
  part_pp: number;                     // 0..1
  part_jachere: number;
  part_vigne: number;
  nb_pm: number;
  pm_dominant: string | null;          // SIREN de la PM détenant le plus de surface
  pm_unique: boolean;                  // 1 PM détient >= 95 % de la surface
  veg_libelles: string[];
  veg_profile?: Record<string, { area_m2?: number; pct?: number }>;
  fauna_distances: Record<string, number>;
  dist_fauna_m: number | null;
  zone_humide_ha: number;
  score_eco?: IlotRpgScoreEco;
  pm_prospect?: Record<string, unknown> | null;
}

export interface IlotsRpgResponse {
  source: "rpg_ilots";
  millesime: string;
  total_candidats: number;
  total_ilots: number;
  ilots: IlotRpgResult[];
}

/** GET /api/projects/{id}/geojson/ilots-rpg : entités kind = "uf" | "parcelle" | "ilot_rpg". */
export type IlotsRpgGeojson = FeatureCollection<Geometry, GeoJsonProperties>;

export type IlotsRpgSortKey = "rang" | "score" | "surface" | "nb_parcelles" | "distance";

/** Détail d'une parcelle cadastrale d'un îlot (propriétés des entités kind="parcelle" du GeoJSON). */
export interface IlotRpgParcelle {
  idu: string;
  num_ilot: string;
  code_insee: string | null;
  section: string | null;
  numero: string | null;
  surface_ha: number;
  part_parcelle: number | null;
  proprietaire: string | null;
  nb_proprietaires_pm: number;
  owner_index: number;
  in_pool: boolean;
}

/** Regroupe les parcelles du GeoJSON par îlot, triées par surface décroissante. */
export function parcellesByIlot(geojson: IlotsRpgGeojson | null | undefined): Record<string, IlotRpgParcelle[]> {
  const out: Record<string, IlotRpgParcelle[]> = {};
  for (const f of geojson?.features ?? []) {
    const p = f.properties ?? {};
    if (p.kind !== "parcelle") continue;
    const num = String(p.num_ilot ?? "");
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    (out[num] ??= []).push({
      idu: String(p.idu ?? ""),
      num_ilot: num,
      code_insee: (p.code_insee as string | null) ?? null,
      section: (p.section as string | null) ?? null,
      numero: (p.numero as string | null) ?? null,
      surface_ha: n(p.surface_ha) ?? 0,
      part_parcelle: n(p.part_parcelle),
      proprietaire: (p.proprietaire as string | null) ?? null,
      nb_proprietaires_pm: n(p.nb_proprietaires_pm) ?? 0,
      owner_index: n(p.owner_index) ?? -1,
      in_pool: p.in_pool === true,
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.surface_ha - a.surface_ha);
  return out;
}
