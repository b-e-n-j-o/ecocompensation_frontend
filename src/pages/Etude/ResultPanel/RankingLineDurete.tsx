/**
 * DureteScoreCard — visualisation décomposée du score de dureté foncière (pipeline V4).
 *
 * Exporte :
 *   <DureteScoreCard result={res} />   carte complète (onglet enrichissement)
 *   <DureteMiniBar   result={res} />   barre empilée compacte (listes / tableau du pool)
 *
 * Aucune dépendance hors React. Couleurs via variables CSS surchargeables (--durete-*),
 * fallback clair intégré. Mode sombre : redéfinir les --durete-* sous votre sélecteur dark.
 * Rétro-compatible : un résultat V3 (sans detail_axes.v4) est affiché à partir de axeN/axeN_note.
 */
import React, { useMemo, useState } from "react";
import { type DureteFonciereMetric, dureteSkipReasonLabel } from "../../../utils/poolMetrics";

/* ------------------------------------------------------------------ Types (sortie pipeline V4) */

export type Confiance = "haute" | "moyenne" | "faible";

export interface Facteur {
  axe: string;
  code: string;
  points: number;
  libelle: string;
  source: string; // annuaire | bodacc | dvf | rpg | gpu | parcelles | regle | input
  preuve?: Record<string, unknown> | null;
}

export interface Axe {
  score: number;
  max: number;
  note: string;
  confiance: Confiance;
  facteurs: Facteur[];
}

export interface ConstatWeb {
  constat: string;
  categorie: string;
  effet_durete: "hausse" | "baisse" | "neutre";
  date?: string | null;
  sources: { titre?: string | null; url?: string | null }[];
}

export interface ParcelleResultat {
  idu: string;
  surface_m2?: number | null;
  rpg?: { annees_agricoles?: number[]; nb_millesimes_observes?: number } | null;
  bail?: { points: number; code: string; libelle: string } | null;
  zonage?: { classe_dominante?: string | null; parts?: Record<string, number> } | null;
}

export interface DureteResult {
  siren: string;
  denomination: string;
  statut: "ok" | "erreur";
  erreur?: string;
  score_final: number;
  niveau_durete: string;
  explication?: string;
  indice_confiance?: number;
  confiance?: Confiance;
  score_fiable?: boolean;
  recommandations?: string[];
  leviers?: string[];
  points_blocage?: string[];
  avertissements?: string[];
  parcelles?: ParcelleResultat[];
  recherche_web?: { statut: string; constats: ConstatWeb[]; raison?: string } | null;
  detail_axes: {
    axe1: number; axe1_note: string;
    axe2: number; axe2_note: string;
    axe3: number; axe3_note: string;
    axe4: number; axe4_note: string;
    surcharges: number; surcharges_note: string;
    v4?: {
      axes: Record<AxeKey, Axe>;
      surcharges: Facteur[];
      signaux: Facteur[];
    };
  };
  _from_cache?: boolean;
}

type AxeKey = "axe1" | "axe2" | "axe3" | "axe4";

/* ------------------------------------------------------------------ Constantes visuelles */

const AXES: { key: AxeKey; label: string; max: number; color: string }[] = [
  { key: "axe1", label: "Nature de la PM", max: 40, color: "var(--durete-axe1, #2a78d6)" },
  { key: "axe2", label: "Gouvernance", max: 25, color: "var(--durete-axe2, #eb6834)" },
  { key: "axe3", label: "Situation financière", max: 20, color: "var(--durete-axe3, #1baf7a)" },
  { key: "axe4", label: "Ancienneté de détention", max: 15, color: "var(--durete-axe4, #eda100)" },
];
const COLOR_SURCHARGE = "var(--durete-surcharge, #e87ba4)";
const COLOR_BONUS = "var(--durete-bonus, #6250d6)"; // surcharges négatives (ORE, DIA…)

const NIVEAUX = [
  { max: 20, label: "Opportunité exceptionnelle", court: "opportunité", color: "#0ca30c" },
  { max: 40, label: "Dureté faible", court: "faible", color: "#97c459" },
  { max: 60, label: "Dureté modérée", court: "modérée", color: "#fab219" },
  { max: 80, label: "Dureté forte", court: "forte", color: "#ec835a" },
  { max: 100, label: "Dureté rédhibitoire", court: "rédhibitoire", color: "#d03b3b" },
];

const SOURCES: Record<string, string> = {
  annuaire: "Annuaire", bodacc: "BODACC", dvf: "DVF", rpg: "RPG", gpu: "GPU",
  parcelles: "Fichier PM", regle: "Règle", input: "Saisie",
};

const ETAT_AXE: Record<Confiance, { label: string; color: string }> = {
  haute: { label: "fiable", color: "var(--durete-ok, #3b6d11)" },
  moyenne: { label: "estimé", color: "var(--durete-warn, #854f0b)" },
  faible: { label: "neutre", color: "var(--durete-warn, #854f0b)" },
};

const T = {
  text: "var(--durete-text, #1f1e1d)",
  text2: "var(--durete-text-2, #52514e)",
  muted: "var(--durete-muted, #898781)",
  border: "var(--durete-border, rgba(11,11,11,0.10))",
  surface: "var(--durete-surface, #ffffff)",
  surface1: "var(--durete-surface-1, #f7f6f3)",
  serif: "var(--durete-serif, Georgia, 'Times New Roman', serif)",
};

/** Hachures = valeur neutre / estimée (donnée manquante). */
const hatch = (color: string): React.CSSProperties => ({
  backgroundColor: color,
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,0.55) 3px 5px)",
});

/* ------------------------------------------------------------------ Normalisation (V4 ou V3) */

interface VueScore {
  axes: (Axe & { key: AxeKey; label: string; color: string })[];
  surcharges: Facteur[];
  signaux: Facteur[];
}

export function normaliser(result: DureteResult): VueScore {
  const d = result.detail_axes;
  const v4 = d.v4;
  const axes = AXES.map((a) => {
    const src: Axe = v4?.axes?.[a.key] ?? {
      score: d[a.key] ?? 0,
      max: a.max,
      note: d[`${a.key}_note` as const] ?? "",
      confiance: "moyenne",
      facteurs: [],
    };
    return { ...src, max: src.max || a.max, key: a.key, label: a.label, color: a.color };
  });
  const surcharges: Facteur[] =
    v4?.surcharges ??
    (d.surcharges
      ? [{ axe: "surcharge", code: "V3", points: d.surcharges, libelle: d.surcharges_note, source: "regle" }]
      : []);
  return { axes, surcharges, signaux: v4?.signaux ?? [] };
}

const niveauDe = (score: number) => NIVEAUX.find((n) => score <= n.max) ?? NIVEAUX[NIVEAUX.length - 1];
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ Barre empilée 0-100 */

interface Segment { key: string; label: string; value: number; color: string; estime: boolean }

function segments(vue: VueScore): Segment[] {
  const s: Segment[] = vue.axes.map((a) => ({
    key: a.key, label: a.label, value: a.score, color: a.color, estime: a.confiance === "faible",
  }));
  vue.surcharges
    .filter((f) => f.points > 0)
    .forEach((f, i) => s.push({ key: `s${i}`, label: f.libelle, value: f.points, color: COLOR_SURCHARGE, estime: false }));
  return s;
}

function StackedBar({ vue, score, height = 22, bands = true, interactive = true }: {
  vue: VueScore; score: number; height?: number; bands?: boolean; interactive?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const segs = segments(vue);
  const negatifs = vue.surcharges.filter((f) => f.points < 0).reduce((t, f) => t + f.points, 0);
  let cumul = 0;
  const brut = segs.reduce((t, s) => t + s.value, 0);
  const echelle = brut > 100 ? 100 / brut : 1; // plafond à 100 : on compresse proportionnellement

  return (
    <div style={{ position: "relative", paddingTop: interactive ? 4 : 0 }}>
      <div
        role="img"
        aria-label={`Score ${score} sur 100 : ${segs.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        style={{ display: "flex", gap: 2, height, background: T.surface1, borderRadius: 4, overflow: "hidden" }}
      >
        {segs.map((s, i) => {
          const w = s.value * echelle;
          cumul += w;
          if (w <= 0) return null;
          return (
            <div
              key={s.key}
              title={`${s.label} : ${s.value > 0 && s.key.startsWith("s") ? "+" : ""}${s.value}${s.estime ? " (valeur neutre)" : ""}`}
              onMouseEnter={() => interactive && setHover(s.key)}
              onMouseLeave={() => interactive && setHover(null)}
              style={{
                width: `${w}%`,
                ...(s.estime ? hatch(s.color) : { background: s.color }),
                opacity: hover && hover !== s.key ? 0.35 : 1,
                transition: "opacity 120ms",
                borderRadius: i === segs.length - 1 ? "0 4px 4px 0" : undefined,
              }}
            />
          );
        })}
        {negatifs < 0 && (
          <div title={`Surcharges négatives : ${negatifs}`}
               style={{ width: `${-negatifs * echelle}%`, background: "transparent",
                        borderLeft: `2px dashed ${COLOR_BONUS}` }} />
        )}
      </div>

      {bands && (
        <>
          <div style={{ display: "flex", marginTop: 6, fontSize: 11, color: T.muted }}>
            {NIVEAUX.map((n) => (
              <div key={n.max} style={{ width: "20%", borderTop: `3px solid ${n.color}`, paddingTop: 3 }}>
                {n.court}
              </div>
            ))}
          </div>
          <div
            aria-hidden
            style={{ position: "absolute", left: `${clamp(score)}%`, top: 0, height: height + 12,
                     borderLeft: `2px solid ${T.text}` }}
          />
        </>
      )}
      {interactive && hover && (
        <div style={{ position: "absolute", right: 0, top: -18, fontSize: 12, color: T.text2 }}>
          {segs.find((s) => s.key === hover)?.label}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Sous-composants */

const Swatch = ({ color, estime }: { color: string; estime?: boolean }) => (
  <span style={{ width: 10, height: 10, borderRadius: 2, display: "inline-block", flex: "none",
                 ...(estime ? hatch(color) : { background: color }) }} />
);

function Legende({ vue }: { vue: VueScore }) {
  return (
    <div className="durete-legende">
      {vue.axes.map((a) => (
        <span key={a.key}>
          <Swatch color={a.color} estime={a.confiance === "faible"} /> {a.label} {a.score}
        </span>
      ))}
      {vue.surcharges.map((f, i) => (
        <span key={i}>
          <Swatch color={f.points < 0 ? COLOR_BONUS : COLOR_SURCHARGE} /> {libelleCourtSurcharge(f)} {f.points > 0 ? "+" : ""}{f.points}
        </span>
      ))}
    </div>
  );
}

function libelleCourtSurcharge(f: Facteur): string {
  const m: Record<string, string> = {
    BAIL_CERTAIN: "Bail rural", BAIL_PROBABLE: "Bail rural probable", BAIL_PONCTUEL: "Occupation agricole",
    BAIL_GFA: "Bail rural (GFA)", FAIRE_VALOIR_DIRECT: "Exploitation directe",
    DROIT_REEL_TIERS: "Droit réel tiers", ZONAGE_CONSTRUCTIBLE: "Zonage U/AU", DOMAINE_PUBLIC: "Domaine public",
  };
  return m[f.code] ?? f.libelle.split(" — ")[0].slice(0, 28);
}

function Ligne({ label, open, onToggle, jauge, valeur, etat, children }: {
  label: string; open: boolean; onToggle: () => void; jauge: React.ReactNode;
  valeur: string; etat?: { label: string; color: string }; children: React.ReactNode;
}) {
  return (
    <div className="durete-row">
      <button type="button" className="durete-row__btn" onClick={onToggle} aria-expanded={open}>
        <span className="durete-row__label">
          <span className="durete-row__chevron" aria-hidden>{open ? "–" : "+"}</span>
          {label}
        </span>
        {jauge}
        <span className="durete-row__valeur mono">{valeur}</span>
        {etat ? <span className="durete-chip" style={{ color: etat.color }}>{etat.label}</span> : <span />}
      </button>
      {open && <div className="durete-row__detail">{children}</div>}
    </div>
  );
}

function Jauge({ score, max, color, estime }: { score: number; max: number; color: string; estime: boolean }) {
  return (
    <div className="durete-jauge">
      <div
        className="durete-jauge__fill"
        style={{ width: `${clamp((score / max) * 100)}%`, ...(estime ? hatch(color) : { background: color }) }}
      />
    </div>
  );
}

function ListeFacteurs({ facteurs, fallback }: { facteurs: Facteur[]; fallback: string }) {
  if (!facteurs.length) return <p className="durete-facteur">{fallback}</p>;
  return (
    <ul className="durete-facteurs">
      {facteurs.map((f, i) => (
        <li key={i}>
          <span>{f.libelle}</span>
          <span className="durete-chip">{SOURCES[f.source] ?? f.source}</span>
          {f.points !== 0 && f.axe !== "signal" && (
            <span className="durete-chip">{f.points > 0 ? "+" : ""}{f.points} pts</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Frise PAC année par année (justifie visuellement la surcharge bail rural). */
function FrisePac({ parcelles }: { parcelles: ParcelleResultat[] }) {
  const annees = [2010, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const avecRpg = parcelles.filter((p) => p.rpg);
  if (!avecRpg.length) return null;
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
      {avecRpg.slice(0, 6).map((p) => {
        const agri = new Set(p.rpg?.annees_agricoles ?? []);
        return (
          <div key={p.idu} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 11, color: T.muted, width: 120, fontFamily: "monospace" }}>{p.idu}</span>
            {annees.map((y) => (
              <span key={y} title={`${y} : ${agri.has(y) ? "déclarée PAC" : "non déclarée"}`}
                    style={{ width: 10, height: 10, borderRadius: 2,
                             background: agri.has(y) ? COLOR_SURCHARGE : "var(--durete-empty, #d3d1c7)" }} />
            ))}
          </div>
        );
      })}
      <span style={{ fontSize: 11, color: T.muted, paddingLeft: 122 }}>2010 → 2024</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Composant principal */

export function DureteScoreCard({ result }: { result: DureteResult; defaultOpen?: string }) {
  const vue = useMemo(() => normaliser(result), [result]);
  const detailKeys = useMemo(
    () => [...vue.axes.map((a) => a.key), ...vue.surcharges.map((_, i) => `s${i}`)],
    [vue],
  );
  const [open, setOpen] = useState<Set<string>>(() => new Set(detailKeys));
  const toggle = (k: string) =>
    setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (result.statut !== "ok") {
    return <p className="ranking-line-empty">Analyse indisponible : {result.erreur ?? "erreur inconnue"}</p>;
  }

  const niveau = niveauDe(result.score_final);
  const nbNeutres = vue.axes.filter((a) => a.confiance === "faible").length;
  const constats = result.recherche_web?.constats ?? [];
  const leviers = result.leviers ?? [];
  const blocages = result.points_blocage ?? [];

  return (
    <div className="durete-card" aria-label={`Dureté foncière de ${result.denomination}`}>
      <section className="filter-enrich-section durete-section">
        <div className="durete-score">
          <div>
            <p className="durete-score__who">{result.denomination} · {result.siren}</p>
            <p className="durete-score__value">
              {result.score_final}
              <span className="durete-score__unit">/100</span>
            </p>
          </div>
          <div className="durete-score__aside">
            <span className="durete-badge" style={{ borderColor: niveau.color, color: niveau.color }}>
              {result.niveau_durete}
            </span>
            {result.indice_confiance != null && (
              <p className="durete-score__meta">
                Confiance {result.confiance} · {result.indice_confiance}/100
                {nbNeutres > 0 && ` · ${nbNeutres} axe${nbNeutres > 1 ? "s" : ""} sans donnée`}
                {result.score_fiable === false && " · score à compléter"}
              </p>
            )}
          </div>
        </div>
        <StackedBar vue={vue} score={result.score_final} />
        <Legende vue={vue} />
      </section>

      <section className="filter-enrich-section durete-section">
        <div className="filter-enrich-section-head">
          <span className="filter-enrich-section-title">Sous-scores</span>
          <span className="filter-enrich-section-count">Ce qui compose le score</span>
        </div>
        {vue.axes.map((a) => (
          <Ligne
            key={a.key}
            label={a.label}
            open={open.has(a.key)}
            onToggle={() => toggle(a.key)}
            jauge={<Jauge score={a.score} max={a.max} color={a.color} estime={a.confiance === "faible"} />}
            valeur={`${a.score}/${a.max}`}
            etat={ETAT_AXE[a.confiance]}
          >
            <ListeFacteurs facteurs={a.facteurs} fallback={a.note} />
          </Ligne>
        ))}
        {vue.surcharges.map((f, i) => (
          <Ligne
            key={`s${i}`}
            label={libelleCourtSurcharge(f)}
            open={open.has(`s${i}`)}
            onToggle={() => toggle(`s${i}`)}
            jauge={<Jauge score={Math.abs(f.points)} max={15} color={f.points < 0 ? COLOR_BONUS : COLOR_SURCHARGE} estime={false} />}
            valeur={`${f.points > 0 ? "+" : ""}${f.points}`}
          >
            <ListeFacteurs facteurs={[f]} fallback={f.libelle} />
            {f.source === "rpg" && <FrisePac parcelles={result.parcelles ?? []} />}
          </Ligne>
        ))}
      </section>

      {leviers.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--leviers">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Leviers</span>
          </div>
          <p className="durete-section__hint">Ce qui peut faciliter une cession ou une convention.</p>
          <ul className="durete-list">
            {leviers.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </section>
      )}

      {blocages.length > 0 && (
        <section className="filter-enrich-section durete-section durete-section--blocages">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Blocages</span>
          </div>
          <p className="durete-section__hint">Ce qui rend l’acquisition plus difficile.</p>
          <ul className="durete-list">
            {blocages.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </section>
      )}

      {!!result.recommandations?.length && (
        <section className="filter-enrich-section durete-section durete-section--maitrise">
          <div className="filter-enrich-section-head">
            <span className="filter-enrich-section-title">Mode de maîtrise conseillé</span>
          </div>
          <p className="durete-section__hint">Façon recommandée de sécuriser le foncier.</p>
          <ul className="durete-list">
            {result.recommandations.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </section>
      )}

      <section className="filter-enrich-section durete-section durete-section--web">
        <div className="filter-enrich-section-head">
          <span className="filter-enrich-section-title">Analyse web</span>
        </div>
        <p className="durete-section__hint">
          Informations publiques trouvées sur internet. Elles éclairent le dossier et ne modifient pas le score.
        </p>
        {constats.length > 0 ? (
          <ul className="durete-web">
            {constats.map((c, i) => (
              <li key={i}>
                <span className={`durete-chip durete-chip--${c.effet_durete}`}>
                  {c.effet_durete === "hausse" ? "Rend plus dur" : c.effet_durete === "baisse" ? "Rend plus facile" : "Neutre"}
                </span>
                <span>
                  {c.constat}
                  {c.date ? ` (${c.date})` : ""}
                </span>
                {c.sources.filter((s) => s.url).slice(0, 2).map((s, j) => (
                  <a key={j} href={s.url!} target="_blank" rel="noreferrer">
                    {s.titre || "source"}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ranking-line-empty">
            {result.recherche_web?.statut === "recherche_non_effectuee"
              ? "Recherche web non effectuée."
              : "Aucun signal web retenu pour cette personne morale."}
          </p>
        )}
      </section>
    </div>
  );
}

/** Branche la métrique pool (V3 ou V4) sur la carte d’indicateurs, et garde la synthèse textuelle. */
export function DureteFoncierePanel({ payload }: { payload: DureteFonciereMetric }) {
  if (!payload.eligible) {
    return (
      <p className="ranking-line-empty" style={{ margin: 0 }}>
        Dureté foncière non calculée : {dureteSkipReasonLabel(payload.reason)}.
      </p>
    );
  }
  if (payload.score_final == null) {
    return <p className="ranking-line-empty" style={{ margin: 0 }}>Score de dureté absent pour cette parcelle.</p>;
  }

  const result = dureteResultFromMetric(payload);

  return (
    <div className="durete-panel">
      {payload.explication ? (
        <p className="durete-panel__analyse">{payload.explication}</p>
      ) : null}
      {payload.intersects_arrachage_vigne ? (
        <p className="durete-panel__note">Bonus arrachage vigne appliqué sur le score de cette parcelle.</p>
      ) : null}
      <DureteScoreCard result={result} />
    </div>
  );
}

function dureteResultFromMetric(payload: DureteFonciereMetric): DureteResult {
  const raw = (payload.detail_axes ?? {}) as Record<string, unknown>;
  const v4 = (raw.v4 && typeof raw.v4 === "object" ? raw.v4 : null) as {
    indice_confiance?: number;
    confiance?: Confiance;
    axes?: NonNullable<DureteResult["detail_axes"]["v4"]>["axes"];
    surcharges?: Facteur[];
    signaux?: Facteur[];
    recommandations?: string[];
    synthese?: { leviers?: string[]; points_blocage?: string[] };
    recherche_web?: DureteResult["recherche_web"];
  } | null;
  const num = (key: string) => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const note = (key: string) => (typeof raw[key] === "string" ? raw[key] : "");
  return {
    siren: payload.siren ?? "",
    denomination: payload.denomination ?? "Personne morale",
    statut: "ok",
    score_final: Math.round(payload.score_final ?? 0),
    niveau_durete: payload.niveau_durete ?? "",
    explication: payload.explication ?? undefined,
    indice_confiance: v4?.indice_confiance,
    confiance: v4?.confiance,
    score_fiable: v4?.indice_confiance != null ? v4.indice_confiance >= 40 : undefined,
    recommandations: v4?.recommandations,
    leviers: v4?.synthese?.leviers,
    points_blocage: v4?.synthese?.points_blocage,
    recherche_web: v4?.recherche_web,
    detail_axes: {
      axe1: num("axe1"),
      axe1_note: note("axe1_note"),
      axe2: num("axe2"),
      axe2_note: note("axe2_note"),
      axe3: num("axe3"),
      axe3_note: note("axe3_note"),
      axe4: num("axe4"),
      axe4_note: note("axe4_note"),
      surcharges: num("surcharges"),
      surcharges_note: note("surcharges_note"),
      v4: v4?.axes
        ? { axes: v4.axes, surcharges: v4.surcharges ?? [], signaux: v4.signaux ?? [] }
        : undefined,
    },
  };
}

/* ------------------------------------------------------------------ Version compacte (liste du pool) */

export function DureteMiniBar({ result, width = 160 }: { result: DureteResult; width?: number }) {
  const vue = useMemo(() => normaliser(result), [result]);
  if (result.statut !== "ok") return <span style={{ fontSize: 12, color: T.muted }}>—</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, minWidth: 22, textAlign: "right",
                     color: result.score_fiable === false ? T.muted : T.text }}>
        {result.score_final}
      </span>
      <div style={{ width }}>
        <StackedBar vue={vue} score={result.score_final} height={8} bands={false} interactive={false} />
      </div>
    </div>
  );
}

export default DureteScoreCard;