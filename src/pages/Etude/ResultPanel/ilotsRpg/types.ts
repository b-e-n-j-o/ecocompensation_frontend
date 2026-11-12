// Types du module « Îlots agricoles RPG » (miroir de backend rpg_ilots/pool.py et api.py).
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export type {
  IlotRpgDurete,
  IlotRpgDuretePm,
  IlotRpgResult,
  IlotRpgScoreEco,
  IlotsRpgResponse,
} from "../../../../types";

/** GET /api/projects/{id}/geojson/ilots-rpg : entités kind = "uf" | "parcelle" | "ilot_rpg". */
export type IlotsRpgGeojson = FeatureCollection<Geometry, GeoJsonProperties>;

export type IlotsRpgSortKey = "rang" | "score" | "surface" | "nb_parcelles" | "distance" | "durete";

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
