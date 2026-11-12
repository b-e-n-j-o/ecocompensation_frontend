/**
 * UnitesFoncieresTable.tsx — résultats UF v2 : une carte par terrain.
 *
 * Un terrain = parcelles contiguës d'une même personne morale qui passent le filtre
 * (après retrait des parcelles exclues). La composition à la main vit dans UfRankingLine.
 */
import { useEffect, useMemo, useState } from "react";
import { ExportEtudeMenu } from "../ExportEtudeMenu";
import { ResultInfoNote } from "./ResultInfoNote";
import { type UfFilterResponse } from "../../../../types";
import { UfRankingLine } from "./UfRankingLine";

const UF_PAGE_SIZE = 50;

/** Clés de l'entonnoir (diagnostic) -> texte. */
const DIAG_LABELS: Record<string, string> = {
  isolee: "parcelle isolée (aucune voisine de la même société)",
  bloc_trop_petit: "bloc sous la surface minimale",
  isolee_apres_exclusions: "isolée après retrait des parcelles exclues",
  bloc_trop_petit_apres_exclusions: "bloc trop petit après retrait des parcelles exclues",
  search_mode: "emprise du projet",
  geomce: "mesure compensatoire existante (GEOMCE)",
  preemption_ens: "zone de préemption ENS",
  ens: "espace naturel sensible",
  natura_2000: "Natura 2000",
  znieff_1: "ZNIEFF de type 1",
  znieff_2: "ZNIEFF de type 2",
  ebc: "espace boisé classé",
  cesbio_libelles: "occupation du sol hors classes du filtre",
  zone_humide_mode: "zone humide",
  zones_humides_probables_mode: "zone humide probable",
  surface: "surface minimale",
  biodiversite: "faune / flore",
  miller: "compacité",
};

/** Entonnoir de construction des terrains (usage interne). */
function DiagnosticNote({ diag }: { diag?: Record<string, number> }) {
  if (!diag || !Object.keys(diag).length) return null;
  const COMPTEURS = new Set(["ppm_aoi", "ppm_siren_multi", "terrains_evalues", "terrains_retenus", "manuels", "secondes"]);
  const retraits = Object.entries(diag)
    .filter(([k, v]) => v > 0 && !COMPTEURS.has(k) && !k.startsWith("rejet:"))
    .map(([k, v]) => [k.replace(/^elimine:/, ""), v] as [string, number]);
  const rejets = Object.entries(diag)
    .filter(([k, v]) => k.startsWith("rejet:") && v > 0)
    .map(([k, v]) => [k.slice(6), v] as [string, number]);
  return (
    <details style={{ margin: "8px 12px 0", fontSize: 12, color: "#475569" }}>
      <summary style={{ cursor: "pointer" }}>Comment ces terrains ont été obtenus</summary>
      <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
        <li>{(diag.ppm_aoi ?? 0).toLocaleString("fr-FR")} parcelles de personnes morales dans la zone d&apos;étude,
          dont {(diag.ppm_siren_multi ?? 0).toLocaleString("fr-FR")} appartenant à une société qui en possède au moins deux.</li>
        {retraits.map(([k, v]) => (
          <li key={k}>{v.toLocaleString("fr-FR")} parcelle(s) écartée(s) : {DIAG_LABELS[k] ?? k}</li>
        ))}
        <li>{diag.terrains_evalues ?? 0} terrain(s) évalué(s), {diag.terrains_retenus ?? 0} retenu(s).</li>
        {rejets.map(([k, v]) => <li key={k}>{v} terrain(s) rejeté(s) : {DIAG_LABELS[k] ?? k}</li>)}
        {diag.secondes != null && <li>Calcul en {diag.secondes} s.</li>}
      </ul>
    </details>
  );
}

interface UnitesFoncieresTableProps {
  ufResults: UfFilterResponse;
  projectId: string | null;
  scrollTableNonce?: number;
  /** Clic sur l'emprise d'une UF dans la carte : ouvre et fait défiler jusqu'à cette UF. */
  scrollToUfId?: string | null;
  onUfActivate?: (ufId: string) => void;
  onUfHover?: (ufId: string | null) => void;
  hoverParcelleIdu?: string | null;
  onParcelleHover?: (idu: string | null) => void;
  onRemoveUf?: (ufId: string) => Promise<void> | void;
  exportJauge?: import("../ExportEtudeMenu").ExportJauge | null;
  pickedIdus?: string[];
  ecarteesByUf?: Record<string, string[]>;
  assembleUfId?: string | null;
  assembleBusy?: boolean;
  onEnterAssemble?: (ufId: string) => void;
  onExitAssemble?: () => void;
  onTogglePick?: (idu: string) => void;
  onClearPick?: () => void;
  onAssemble?: () => void;
  onEcarter?: (ufId: string, idu: string) => void;
  onReinclure?: (ufId: string, idu: string) => void;
  onAddPickToUf?: (ufId: string) => void;
}

export function UnitesFoncieresTable({
  ufResults,
  projectId,
  scrollTableNonce = 0,
  scrollToUfId = null,
  onUfActivate,
  onUfHover,
  hoverParcelleIdu = null,
  onParcelleHover,
  onRemoveUf,
  exportJauge = null,
  pickedIdus = [],
  ecarteesByUf = {},
  assembleUfId = null,
  assembleBusy = false,
  onEnterAssemble,
  onExitAssemble,
  onTogglePick,
  onClearPick,
  onAssemble,
  onEcarter,
  onReinclure,
  onAddPickToUf,
}: UnitesFoncieresTableProps) {
  const [expandedUfId, setExpandedUfId] = useState<string | null>(null);
  const [visibleUfCount, setVisibleUfCount] = useState(UF_PAGE_SIZE);

  const ufs = useMemo(() => ufResults.unites_foncieres ?? [], [ufResults]);

  useEffect(() => {
    setVisibleUfCount(UF_PAGE_SIZE);
    setExpandedUfId(null);
  }, [ufResults]);

  useEffect(() => {
    if (!scrollToUfId) return;
    const idx = ufs.findIndex((uf) => uf.uf_id === scrollToUfId);
    if (idx < 0) return;
    setVisibleUfCount((c) => Math.max(c, idx + 1));
    setExpandedUfId(scrollToUfId);
    const id = scrollToUfId;
    window.setTimeout(() => {
      document.getElementById(`uf-block-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
  }, [scrollToUfId, scrollTableNonce, ufs]);

  const visibleUfs = ufs.slice(0, visibleUfCount);

  return (
    <div className="ranking-wrap">
      <div className="ranking-chrome">
        <div className="ranking-chrome__bar">
          {projectId && <ExportEtudeMenu projectId={projectId} page="uf" jauge={exportJauge} />}
          <span className="ranking-count mono">
            {Math.min(visibleUfCount, ufs.length)} / {ufResults.total_uf ?? ufs.length} UF
          </span>
        </div>
        <ResultInfoNote>
          <p>
            Une unité foncière est un terrain d&apos;un seul tenant appartenant à une même société
            (personne morale) : les parcelles qui se touchent et qui ne sont pas exclues par le filtre.
          </p>
          <p>
            Pour composer un groupe à la main, dépliez une unité puis lancez
            « Assembler une unité foncière en sélectionnant des parcelles ».
            L&apos;unité créée est marquée « Assemblée à la main » et ses métriques sont recalculées.
            La croix rouge écarte une parcelle de cette composition : elle ne part pas dans les indésirables.
          </p>
        </ResultInfoNote>
        <DiagnosticNote diag={ufResults.diagnostic} />
      </div>

      <div className="ranking-table-scroll uf-foncieres-scroll" style={{ padding: 12 }}>
        {ufs.length === 0 ? (
          <div className="uf-empty-msg">Aucune unité foncière ne passe le filtre.</div>
        ) : (
          <>
            {visibleUfs.map((uf) => (
              <UfRankingLine
                key={uf.uf_id}
                uf={uf}
                expanded={expandedUfId === uf.uf_id}
                hoverIdu={hoverParcelleIdu}
                pickedIdus={pickedIdus}
                ecartees={ecarteesByUf[uf.uf_id] ?? []}
                assembleMode={assembleUfId === uf.uf_id}
                busy={assembleBusy}
                onEnterAssemble={() => onEnterAssemble?.(uf.uf_id)}
                onExitAssemble={onExitAssemble}
                onAssemble={onAssemble}
                onClearPick={onClearPick}
                onToggle={() => setExpandedUfId(expandedUfId === uf.uf_id ? null : uf.uf_id)}
                onHoverUf={onUfHover}
                onHoverParcelle={onParcelleHover}
                onActivate={onUfActivate}
                onTogglePick={(idu) => onTogglePick?.(idu)}
                onEcarter={(idu) => onEcarter?.(uf.uf_id, idu)}
                onReinclure={(idu) => onReinclure?.(uf.uf_id, idu)}
                onAddPick={() => onAddPickToUf?.(uf.uf_id)}
                onRemoveUf={onRemoveUf}
              />
            ))}
            {ufs.length > visibleUfCount && (
              <div className="ranking-load-more" style={{ marginTop: 4, padding: "0 0 4px" }}>
                <button type="button" className="btn-load-more"
                  onClick={() => setVisibleUfCount((c) => Math.min(c + UF_PAGE_SIZE, ufs.length))}>
                  Afficher plus (+{Math.min(UF_PAGE_SIZE, ufs.length - visibleUfCount)} UF)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
