/**
 * Filtre végétation hybride — BD TOPO (nature) + CESBIO (libelle_classe)
 * sur la table ecocompensation_results.bd_topo_et_cesbio.
 *
 * L'utilisateur choisit :
 *   - des natures BD TOPO (checkboxes)
 *   - des classes CESBIO (chips)
 *   - le mode de combinaison : OR (l'un ou l'autre) | AND (les deux)
 */
import type { CSSProperties } from "react";
import { ZDV_NATURES, CESBIO_LIBELLES, DEFAULT_VEGETATION_HYBRIDE } from "../../../types";
import type { ZdvNature, CesbioLibelle, VegetationHybrideValue } from "../../../types";
import { SectionCard, filterTheme, Hint } from "../shared";

interface Props {
  value: VegetationHybrideValue;
  onChange: (v: VegetationHybrideValue) => void;
}

// ---------------------------------------------------------------------------
// Styles locaux
// ---------------------------------------------------------------------------

const modeBtn = (active: boolean, color: string): CSSProperties => ({
  flex: 1,
  padding: "6px 0",
  background: active ? `${color}22` : filterTheme.bgInput,
  border: `1px solid ${active ? color : filterTheme.border}`,
  borderRadius: 4,
  color: active ? color : filterTheme.muted,
  fontSize: 11,
  fontWeight: active ? 700 : 400,
  cursor: "pointer",
  transition: "all 0.15s",
});

const divider: CSSProperties = {
  borderTop: `1px solid ${filterTheme.border}`,
  margin: "10px 0 4px",
};

const subLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: filterTheme.muted,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const rankBadge = (color: string): CSSProperties => ({
  marginLeft: "auto",
  minWidth: 20,
  height: 20,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
  background: color,
  padding: "0 6px",
});

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function VegetationHybrideSection({ value, onChange }: Props) {
  const { zdv_natures, cesbio_libelles, mode } = value;

  function patch(p: Partial<VegetationHybrideValue>) {
    onChange({ ...value, ...p });
  }

  // BD TOPO
  function toggleNature(n: ZdvNature) {
    const next = zdv_natures.includes(n)
      ? zdv_natures.filter((x) => x !== n)
      : [...zdv_natures, n];
    patch({ zdv_natures: next });
  }

  // CESBIO
  function toggleLibelle(lib: CesbioLibelle) {
    const next = cesbio_libelles.includes(lib)
      ? cesbio_libelles.filter((x) => x !== lib)
      : [...cesbio_libelles, lib];
    patch({ cesbio_libelles: next });
  }

  const noFilter = zdv_natures.length === 0 && cesbio_libelles.length === 0;
  const hasZdv    = zdv_natures.length > 0;
  const hasCesbio = cesbio_libelles.length > 0;
  const hasBoth   = hasZdv && hasCesbio;

  return (
    <SectionCard title="Végétation (BD TOPO + CESBIO)" icon="🌿" accent="green" collapsible>

      <Hint>
        Sélectionnez des natures BD TOPO et/ou des classes CESBIO.
        Sans sélection, ce critère est ignoré.
      </Hint>
      <Hint>
        L&apos;ordre de clic définit la priorité : la 1re valeur cochée = rang 1, puis rang 2, etc. (BD TOPO
        puis CESBIO). Cette ordre est enregistré dans le filtre du projet et sert au tri « Priorité filtre
        végétation » dans le classement (surfaces d&apos;intersection en m² par classe, pas seulement les
        pourcentages).
      </Hint>

      {/* ── BD TOPO : natures ── */}
      <div style={divider} />
      <div style={subLabel}>🗺 BD TOPO — nature</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {ZDV_NATURES.map((n) => (
          (() => {
            const rank = zdv_natures.indexOf(n) + 1;
            const selected = rank > 0;
            return (
          <label
            key={n}
            style={{
              padding: "8px 10px",
              background: filterTheme.bgInput,
              border: `1px solid ${selected ? filterTheme.accentGreen : filterTheme.border}`,
              borderRadius: 4,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              color: selected ? filterTheme.accentGreen : filterTheme.text,
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleNature(n)}
              style={{ width: 14, height: 14, accentColor: filterTheme.accentGreen }}
            />
            <span>{n}</span>
            {selected && <span style={rankBadge("#16a34a")}>{rank}</span>}
          </label>
            );
          })()
        ))}
      </div>

      {/* ── CESBIO : libellés ── */}
      <div style={divider} />
      <div style={subLabel}>▦ CESBIO — classe</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {CESBIO_LIBELLES.map((lib) => (
          (() => {
            const rank = cesbio_libelles.indexOf(lib) + 1;
            const selected = rank > 0;
            return (
          <label
            key={lib}
            style={{
              padding: "8px 10px",
              background: filterTheme.bgInput,
              border: `1px solid ${selected ? "#a78bfa" : filterTheme.border}`,
              borderRadius: 4,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              color: selected ? "#c4b5fd" : filterTheme.text,
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleLibelle(lib)}
              style={{ width: 14, height: 14, accentColor: "#8b5cf6" }}
            />
            <span>{lib}</span>
            {selected && <span style={rankBadge("#7c3aed")}>{rank}</span>}
          </label>
            );
          })()
        ))}
      </div>

      {/* ── Mode OR / AND ── */}
      <div style={divider} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          type="button"
          style={modeBtn(mode === "OR", "#10b981")}
          onClick={() => patch({ mode: "OR" })}
          title="La parcelle intersecte au moins l'un des critères sélectionnés"
        >
          OU — l'un ou l'autre
        </button>
        <button
          type="button"
          style={modeBtn(mode === "AND", "#3b82f6")}
          onClick={() => patch({ mode: "AND" })}
          disabled={!hasBoth}
          title={
            hasBoth
              ? "La parcelle doit intersecter à la fois une nature BD TOPO ET une classe CESBIO"
              : "Sélectionnez au moins une nature ET une classe pour activer ce mode"
          }
        >
          ET — les deux
        </button>
      </div>

      {hasBoth && mode === "AND" && (
        <Hint>
          Mode strict : la parcelle doit intersecter <strong>à la fois</strong> une nature BD TOPO cochée
          et une classe CESBIO sélectionnée.
        </Hint>
      )}

      {/* ── Ignorer le filtre ── */}
      {!noFilter && (
        <>
          <div style={divider} />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: filterTheme.muted,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={false}
              onChange={() => onChange(DEFAULT_VEGETATION_HYBRIDE)}
            />
            <span>Ignorer ce filtre (tout réinitialiser)</span>
          </label>
        </>
      )}
    </SectionCard>
  );
}