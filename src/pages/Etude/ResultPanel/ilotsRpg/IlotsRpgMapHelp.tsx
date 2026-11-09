/**
 * Encart « Comprendre la carte » des îlots agricoles RPG.
 */
import type { CSSProperties, ReactNode } from "react";
import { CAT_CULTURE_COLORS, OWNER_COLORS, OWNER_NONE_COLOR } from "./labels";

const swatch = (style: CSSProperties) => (
  <span style={{ display: "inline-block", width: 18, height: 12, borderRadius: 2, flexShrink: 0, ...style }} />
);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 6 }}>
      <h4 style={{ margin: 0, fontSize: 13, color: "#0f172a" }}>{title}</h4>
      {children}
    </section>
  );
}

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ marginTop: 3 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export function IlotsRpgMapHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Comprendre la carte des îlots agricoles"
      style={{
        position: "absolute", top: 52, left: 10, zIndex: 6, width: 400, maxWidth: "calc(100% - 20px)",
        maxHeight: "calc(100% - 70px)", overflowY: "auto",
        background: "rgba(255,255,255,0.98)", border: "1px solid #cbd5e1", borderRadius: 8,
        boxShadow: "0 8px 24px rgba(15,23,42,0.18)", padding: "12px 14px",
        fontSize: 12.5, lineHeight: 1.45, color: "#1e293b", display: "grid", gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Comprendre la carte des îlots agricoles</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", color: "#64748b", lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <Section title="Qu'est-ce qu'un îlot agricole ?">
        <p style={{ margin: 0 }}>
          Chaque année, les agriculteurs déclarent leurs terres à la PAC (Registre Parcellaire Graphique, RPG 2025).
          Un <strong>îlot</strong> est un ensemble de terres <strong>d&apos;un seul tenant exploitées par un même
          agriculteur</strong>, délimité par des routes, chemins, cours d&apos;eau, haies ou d&apos;autres exploitations.
        </p>
        <p style={{ margin: 0 }}>
          ⚠️ L&apos;exploitant n&apos;est pas forcément le propriétaire : une grande partie des terres est louée
          (fermage). Un îlot peut donc couvrir les terres de plusieurs propriétaires.
        </p>
      </Section>

      <Section title="Ce que montre la carte">
        <Item icon={swatch({ background: CAT_CULTURE_COLORS.PP, opacity: 0.7 })}>
          <strong>Zone colorée : l&apos;unité foncière proposée.</strong> Ce sont les parcelles cadastrales de
          l&apos;îlot, c&apos;est-à-dire le foncier qu&apos;on peut réellement acheter ou conventionner.
          La couleur suit la culture dominante.
        </Item>
        <Item icon={swatch({ border: "2px dashed #475569", background: "transparent" })}>
          <strong>Pointillés : l&apos;îlot déclaré à la PAC</strong>, tel que dessiné par l&apos;agriculteur. Il ne suit
          pas les limites du cadastre.
        </Item>
        <Item icon={swatch({ border: "1px solid #475569", background: "#f1f5f9" })}>
          <strong>Traits fins : les limites des parcelles cadastrales</strong> (en zoomant, ou pour l&apos;îlot sélectionné).
        </Item>
        <Item icon={swatch({ border: "3px solid #475569", background: "transparent" })}>
          <strong>Contour épais :</strong> une seule société (personne morale) détient au moins 95 % de l&apos;îlot.
        </Item>
      </Section>

      <Section title="Pourquoi la zone colorée et les pointillés ne coïncident pas ?">
        <p style={{ margin: 0 }}>
          Une parcelle cadastrale est rattachée à l&apos;îlot si <strong>au moins la moitié de sa surface</strong> est
          dedans. Les pointillés peuvent donc déborder (bouts de parcelles voisines exploités par l&apos;agriculteur
          mais non retenus), et la zone colorée aussi (fonds de parcelles, chemins, haies hors de la zone cultivée).
        </p>
      </Section>

      <Section title="Quand un îlot est sélectionné">
        <Item
          icon={
            <span style={{ display: "inline-flex", gap: 2 }}>
              {OWNER_COLORS.slice(0, 3).map((c) => <span key={c}>{swatch({ background: c, width: 8 })}</span>)}
              {swatch({ background: OWNER_NONE_COLOR, width: 8 })}
            </span>
          }
        >
          Ses parcelles sont <strong>colorées par propriétaire</strong> (une couleur par société, gris pour les
          particuliers ou propriétaires non identifiés). Le détail parcelle par parcelle est dans le tableau,
          onglet « Composition ».
        </Item>
      </Section>

      <Section title="À garder en tête">
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
          <li>Seules les terres <strong>déclarées à la PAC</strong> apparaissent : friches, terrains non déclarés ou hors aides sont absents.</li>
          <li>Seuls les <strong>propriétaires sociétés</strong> sont connus. Les particuliers ne sont pas identifiés.</li>
          <li>Seules les parcelles <strong>situées dans l&apos;aire d&apos;étude</strong> sont retenues : un îlot en limite peut être partiel.</li>
          <li>Les îlots changent chaque année. Les données reflètent la <strong>campagne PAC 2025</strong>.</li>
        </ul>
      </Section>
    </div>
  );
}
