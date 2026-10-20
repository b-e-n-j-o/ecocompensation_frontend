import type { EspacesBoisesClassesMetric, Znieff2Metric } from "../../../utils/poolMetrics";

const CLASSE_LABELS: Record<string, string> = {
  ebc: "EBC",
  ebc_littoral: "EBC littoral",
  ebc_presume: "EBC présumé",
  ebc_a_creer: "EBC à créer",
};

function pct(ratio: number): string {
  const value = ratio * 100;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value >= 10 ? 0 : 1 })} %`;
}

function ha(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha`;
}

function Znieff2Block({ payload }: { payload: Znieff2Metric | null }) {
  if (!payload) {
    return (
      <p className="ranking-line-empty">
        Cette parcelle n’intersecte pas de ZNIEFF de type 2.
      </p>
    );
  }

  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">ZNIEFF type 2</span>
        <span className="filter-enrich-pill filter-enrich-pill--muted mono">
          {ha(payload.znieff2Ha)}
        </span>
      </div>
      <p className="filter-enrich-fauna-hint" style={{ color: "#b45309" }}>
        {pct(payload.znieff2Ratio)} de la parcelle
        {payload.parcelAreaHa > 0 ? ` (${ha(payload.parcelAreaHa)})` : ""}.
        {" "}Alerte : la parcelle est dans le pool, l’instruction DREAL reste incertaine.
      </p>
      {payload.sites.length > 0 && (
        <ul className="filter-enrich-fauna-list" aria-label="Sites ZNIEFF de type 2">
          {payload.sites.map((site) => (
            <li key={site.cle ?? site.idMnhn ?? site.nomSite} className="filter-enrich-fauna-row">
              <div className="filter-enrich-fauna-row-head">
                <span className="filter-enrich-fauna-species">
                  {site.nomSite ?? site.idMnhn ?? "Site ZNIEFF 2"}
                </span>
                <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                  {ha(site.areaHa)} · {pct(site.ratio)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EnvironnementTab({
  ebc,
  znieff2,
}: {
  ebc: EspacesBoisesClassesMetric | null;
  znieff2: Znieff2Metric | null;
}) {
  return (
    <>
      <EbcEnvironnementBlock payload={ebc} />
      <Znieff2Block payload={znieff2} />
    </>
  );
}

export function EbcEnvironnementBlock({ payload }: { payload: EspacesBoisesClassesMetric | null }) {
  if (!payload) {
    return (
      <p className="ranking-line-empty">
        Cette parcelle n’intersecte pas d’espace boisé classé.
      </p>
    );
  }

  const classes = Object.entries(payload.classes)
    .filter(([classe]) => classe !== "ebc_a_creer")
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="filter-enrich-section">
      <div className="filter-enrich-section-head">
        <span className="filter-enrich-section-title">Espaces boisés classés</span>
        <span className="filter-enrich-pill filter-enrich-pill--faune mono">
          {pct(payload.mobilisableRatio)} mobilisable
        </span>
      </div>
      <p className="filter-enrich-fauna-hint">
        {ha(payload.mobilisableHa)} hors EBC
        {payload.parcelAreaHa > 0 ? ` sur ${ha(payload.parcelAreaHa)}` : ""}.
        {" "}Couverture EBC : {pct(payload.contrainteRatio)} ({ha(payload.contrainteHa)}).
      </p>
      {classes.length > 0 && (
        <ul className="filter-enrich-fauna-list" aria-label="Classes EBC intersectant la parcelle">
          {classes.map(([classe, ratio]) => (
            <li key={classe} className="filter-enrich-fauna-row">
              <div className="filter-enrich-fauna-row-head">
                <span className="filter-enrich-fauna-species">
                  {CLASSE_LABELS[classe] ?? classe}
                </span>
                <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                  {pct(ratio)}
                  {payload.classAreaHa[classe] != null ? ` · ${ha(payload.classAreaHa[classe])}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {payload.hasEbcACreer && (
        <p className="filter-enrich-fauna-hint" style={{ color: "#166534" }}>
          EBC à créer : {ha(payload.ebcACreerHa)} ({pct(payload.ebcACreerRatio)}).
          Opportunité de boisement, non déduite de la surface mobilisable.
        </p>
      )}
    </div>
  );
}
