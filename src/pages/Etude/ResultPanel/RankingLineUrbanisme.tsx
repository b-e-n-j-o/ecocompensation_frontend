import type { UrbanismeGpuMetric, UrbanismeScore } from "../../../utils/poolMetrics";

const SOUS_SCORE_LABEL: Record<string, string> = {
  perennite: "Pérennité",
  compatibilite: "Compatibilité",
  synergie: "Synergie",
  maitrise: "Maîtrise",
};

const SOUS_SCORE_COLOR: Record<string, string> = {
  perennite: "#1d4ed8",
  compatibilite: "#0f766e",
  synergie: "#15803d",
  maitrise: "#b45309",
};

function ScoreUrbaPanel({ score }: { score: UrbanismeScore }) {
  const value = score.scoreGlobal ?? 0;
  return (
    <>
      <section className="filter-enrich-section durete-section urba-section--score">
        <div className="durete-score">
          <div>
            <p className="durete-score__who">
              Score urbanistique{score.profil ? ` · ${score.profil.replaceAll("_", " ")}` : ""}
            </p>
            <p className="durete-score__value">
              {Math.round(value)}
              <span className="durete-score__unit">/100</span>
            </p>
          </div>
          <div className="durete-score__aside">
            {score.classe && (
              <span className="durete-badge">{score.classe}{score.libelleClasse ? ` · ${score.libelleClasse}` : ""}</span>
            )}
            {score.confiance && (
              <p className="durete-score__meta">
                Confiance {score.confiance}
                {score.confianceValeur != null ? ` · ${Math.round(score.confianceValeur)}/100` : ""}
              </p>
            )}
          </div>
        </div>
      </section>

      {score.sousScores.length > 0 && (
        <section className="filter-enrich-section durete-section">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Sous-scores</span>
          </div>
          <ul className="filter-enrich-fauna-list" aria-label="Sous-scores urbanisme">
            {score.sousScores.map((item) => (
              <li key={item.key} className="filter-enrich-fauna-row">
                <div className="filter-enrich-fauna-row-head">
                  <span className="occ-sol-swatch" style={{ background: SOUS_SCORE_COLOR[item.key] ?? "#334155" }} />
                  <span className="filter-enrich-fauna-species">{SOUS_SCORE_LABEL[item.key] ?? item.key}</span>
                  <span className="filter-enrich-pill filter-enrich-pill--muted mono">{Math.round(item.valeur)}/100</span>
                </div>
                <div className="occ-sol-track" aria-hidden>
                  <span
                    className="occ-sol-fill"
                    style={{ width: `${Math.max(0, Math.min(100, item.valeur))}%`, background: SOUS_SCORE_COLOR[item.key] ?? "#334155" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {score.vetos.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--blocages">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Vetos</span>
          </div>
          <p className="durete-section__hint">Plafonds appliqués au score global.</p>
          <ul className="durete-list">
            {score.vetos.map((veto) => (
              <li key={veto.motif}>
                <span className={`durete-chip durete-chip--${veto.niveau === "bloquant" ? "hausse" : "neutre"}`}>
                  {veto.niveau === "bloquant" ? "Bloquant" : "Majeur"}
                </span>{" "}
                {veto.motif}
              </li>
            ))}
          </ul>
        </section>
      )}

      {score.resume.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--maitrise">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Lecture</span>
          </div>
          <ul className="durete-list">
            {score.resume.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}

      {score.contributions.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--leviers">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Contributions</span>
          </div>
          <p className="durete-section__hint">Ce qui fait monter ou baisser le score.</p>
          <ul className="filter-enrich-fauna-list">
            {score.contributions.map((item) => (
              <li key={item.label} className="filter-enrich-fauna-row">
                <div className="filter-enrich-fauna-row-head">
                  <span className="filter-enrich-fauna-species">{item.label}</span>
                  <span className="filter-enrich-pill filter-enrich-pill--muted mono">{item.points}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {score.pointsAVerifier.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--web">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">À vérifier</span>
          </div>
          <ul className="durete-list">
            {score.pointsAVerifier.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
    </>
  );
}

function coucheKind(
  couche: UrbanismeGpuMetric["couches"][number],
): "surf" | "lin" | "pct" {
  if (couche.geomKind === "lin" || couche.geomKind === "pct" || couche.geomKind === "surf") {
    return couche.geomKind;
  }
  const key = couche.layerKey;
  const name = couche.displayName.toLowerCase();
  if (key.endsWith("_lin") || key.endsWith("_l") || name.includes("linéaire")) return "lin";
  if (key.endsWith("_pct") || key.endsWith("_p") || name.includes("ponctuel")) return "pct";
  return "surf";
}

function mesureLabel(
  el: UrbanismeGpuMetric["couches"][number]["elements"][number],
  kind: "surf" | "lin" | "pct",
): string {
  if (kind === "lin") {
    if (el.longueurM != null) {
      return `${el.longueurM.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m`;
    }
    return el.position === "limite" ? "en limite" : el.position ?? "linéaire";
  }
  if (kind === "pct") {
    if (el.nbPoints != null) return `${el.nbPoints} point${el.nbPoints > 1 ? "s" : ""}`;
    return el.position ?? "ponctuel";
  }
  if (el.pct != null) {
    const ha =
      el.surfaceM2 != null
        ? ` · ${(el.surfaceM2 / 10_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha`
        : "";
    return `${el.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %${ha}`;
  }
  return el.position ?? "";
}

const FAMILLE_ORDER = ["zonage", "prescription", "information", "servitude"];

const FAMILLE_SECTION: Record<string, string> = {
  zonage: "urba-section--zonage",
  prescription: "urba-section--prescription",
  information: "urba-section--information",
  servitude: "urba-section--servitude",
};

const ABSENCE_FAMILLE: Record<string, string> = {
  zonage: "Pas de zonage sur la parcelle",
  prescription: "Pas de prescription sur la parcelle",
  information: "Pas d’élément informationnel sur la parcelle",
  servitude: "Pas de servitude sur la parcelle",
};

function absenceParFamille(payload: UrbanismeGpuMetric): string[] {
  const byFamille = new Map<string, UrbanismeGpuMetric["couches"]>();
  for (const couche of payload.couches) {
    const famille = couche.famille || "autre";
    const list = byFamille.get(famille) ?? [];
    list.push(couche);
    byFamille.set(famille, list);
  }
  const order = [
    ...FAMILLE_ORDER.filter((f) => byFamille.has(f)),
    ...[...byFamille.keys()].filter((f) => !FAMILLE_ORDER.includes(f)),
  ];
  const messages: string[] = [];
  for (const famille of order) {
    const couches = byFamille.get(famille) ?? [];
    const hasElements = couches.some((c) => c.elements.length > 0);
    const hasError = couches.some((c) => c.status === "error");
    if (hasElements || hasError) continue;
    if (famille === "zonage" && payload.zonages.length > 0) continue;
    messages.push(ABSENCE_FAMILLE[famille] ?? `Pas de ${famille} sur la parcelle`);
  }
  return messages;
}

export function UrbanismeBlock({
  payload,
  onCompute,
  computing = false,
}: {
  payload: UrbanismeGpuMetric | null;
  onCompute?: () => void;
  computing?: boolean;
}) {
  if (!payload) {
    return (
      <div className="ranking-line-empty-action">
        <p className="ranking-line-empty">Contexte urbanisme non calculé pour cette parcelle.</p>
        {onCompute && (
          <button
            type="button"
            className="ranking-line-run"
            disabled={computing}
            onClick={onCompute}
          >
            {computing ? "Calcul…" : "Calculer l’urbanisme"}
          </button>
        )}
      </div>
    );
  }

  const couches = payload.couches.filter((c) => c.elements.length > 0 || c.status === "error");
  const absences = absenceParFamille(payload);

  return (
    <div className="durete-card">
      {payload.zonages.length > 0 && (
        <div className="filter-enrich-section durete-section urba-section--zonage">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Zonage</span>
          </div>
          <ul className="filter-enrich-fauna-list">
            {payload.zonages.map((z, i) => (
              <li key={`${z.libelle ?? z.type ?? "z"}-${i}`} className="filter-enrich-fauna-row">
                <div className="filter-enrich-fauna-row-head">
                  <span className="filter-enrich-fauna-species">
                    {z.libelle ?? "Zone"}{z.type ? ` · ${z.type}` : ""}
                  </span>
                  <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                    {z.pct != null ? `${z.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.documents.length > 0 && (
        <p className="filter-enrich-fauna-hint">
          {payload.documents.map((d) => [d.typedoc, d.idurba, d.date].filter(Boolean).join(" · ")).join(" — ")}
        </p>
      )}

      {payload.flags.length > 0 && (
        <p className="filter-enrich-fauna-hint" style={{ color: "#b45309" }}>
          {payload.flags.join(" · ")}
        </p>
      )}

      {couches.map((couche) => (
        <div key={couche.layerKey} className={`filter-enrich-section durete-section ${FAMILLE_SECTION[couche.famille] ?? ""}`}>
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">{couche.displayName}</span>
            <span className="filter-enrich-section-count mono">{couche.famille}</span>
          </div>
          {couche.status === "error" ? (
            <p className="ranking-line-empty">{couche.error ?? "Couche indisponible."}</p>
          ) : (
            <ul className="filter-enrich-fauna-list">
              {couche.elements.map((el) => (
                <li key={el.id} className="filter-enrich-fauna-row">
                  <div className="filter-enrich-fauna-row-head">
                    <span className="filter-enrich-fauna-species">
                      {el.libelleCnig ?? el.libelle ?? el.code ?? "Élément"}
                      {el.code && el.libelleCnig ? ` (${el.code})` : ""}
                    </span>
                    <span className="filter-enrich-pill filter-enrich-pill--muted mono">
                      {mesureLabel(el, coucheKind(couche))}
                    </span>
                  </div>
                  {el.url && (
                    <a href={el.url} target="_blank" rel="noreferrer" className="filter-enrich-fauna-hint">
                      Règlement
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {absences.length > 0 && (
        <section className="filter-enrich-section durete-section urba-section--absence">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Absences</span>
          </div>
          <ul className="durete-list">
            {absences.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </section>
      )}
      {couches.length === 0 && absences.length === 0 && payload.zonages.length === 0 && (
        <p className="ranking-line-empty">Aucune prescription ni zonage GPU retenu sur cette parcelle.</p>
      )}
      {payload.runErrors.length > 0 && (
        <p className="ranking-line-empty">{payload.runErrors.join(" · ")}</p>
      )}
      {payload.score ? <ScoreUrbaPanel score={payload.score} /> : (
        <p className="ranking-line-empty">Score urbanistique non disponible pour cette parcelle.</p>
      )}
    </div>
  );
}
