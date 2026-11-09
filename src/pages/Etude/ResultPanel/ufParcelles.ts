// Vue « parcelles » des UF personnes morales (miroir de backend uf_parcelles.py).
import type { UniteFoncieresResult } from "../../../types";

export interface UfParcelle {
  idu: string;
  surface_ha: number | null;
  nb_combinaisons: number;   // combinaisons retenues contenant la parcelle
  presence: number;          // nb_combinaisons / nb combinaisons de l'UF (0..1)
  noyau: boolean;            // présente dans toutes les combinaisons
  in_pool: boolean;          // aussi retenue dans l'onglet Parcelles
}

/** Champs ajoutés par attach_uf_parcelles (absents des résultats calculés avant le patch). */
export type UfAvecParcelles = UniteFoncieresResult & {
  parcelles?: UfParcelle[];
  nb_combinaisons?: number;
  nb_parcelles_retenues?: number;
  nb_parcelles_noyau?: number;
  surface_ha_parcelles?: number | null;
  best_score_eco?: { total_score: number; max_score: number } | null;
  best_subset_id?: string | null;
};

/** Parcelles de l'UF : champ backend si présent, sinon recalcul depuis les sous-ensembles (sans surface). */
export function getUfParcelles(uf: UfAvecParcelles): UfParcelle[] {
  if (uf.parcelles?.length) return uf.parcelles;
  const subsets = uf.sous_ensembles ?? [];
  const n = subsets.length;
  const counts = new Map<string, number>();
  for (const ss of subsets) for (const idu of new Set(ss.idus ?? [])) counts.set(idu, (counts.get(idu) ?? 0) + 1);
  return [...counts.entries()]
    .map(([idu, c]) => ({ idu, surface_ha: null, nb_combinaisons: c, presence: n ? c / n : 0, noyau: n > 0 && c === n, in_pool: false }))
    .sort((a, b) => b.presence - a.presence || a.idu.localeCompare(b.idu));
}

export function getBestScore(uf: UfAvecParcelles): { total_score: number; max_score: number } | null {
  if (uf.best_score_eco) return uf.best_score_eco;
  let best: { total_score: number; max_score: number } | null = null;
  for (const ss of uf.sous_ensembles ?? []) {
    const s = ss.score_eco as { total_score?: number; max_score?: number } | undefined;
    if (typeof s?.total_score === "number" && (!best || s.total_score > best.total_score)) {
      best = { total_score: s.total_score, max_score: s.max_score ?? 6 };
    }
  }
  return best;
}

/** « AB 12 » depuis un IDU cadastral (14 car. : INSEE 5 + préfixe 3 + section 2 + numéro 4). */
export function parcelleLabelFromIdu(idu: string): { label: string; insee: string | null } {
  if (idu.length === 14) {
    const section = idu.slice(8, 10).replace(/^0/, "");
    const numero = idu.slice(10).replace(/^0+/, "") || "0";
    return { label: `${section} ${numero}`, insee: idu.slice(0, 5) };
  }
  return { label: idu, insee: null };
}
