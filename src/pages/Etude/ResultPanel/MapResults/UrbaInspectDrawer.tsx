/**
 * Tiroir compact d'une entité d'urbanisme, calé au-dessus de la légende.
 */

import { useEffect, useState } from "react";
import type { UrbaInspectPayload, UrbaInspectRow } from "./urbaMapLayer";

const LONG_CHARS = 72;

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function InspectValue({ value }: { value: string }) {
  const url = isUrl(value);
  const long = !url && value.length > LONG_CHARS;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  if (url) {
    return (
      <a className="map-inspect__link" href={value} target="_blank" rel="noreferrer" title={value}>
        Ouvrir
      </a>
    );
  }

  if (!long) return <span className="map-inspect__val">{value}</span>;

  return (
    <span className="map-inspect__long">
      <span className={`map-inspect__val${expanded ? " is-full" : " is-clamp"}`}>{value}</span>
      <button type="button" className="map-inspect__more" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Réduire" : "Voir tout"}
      </button>
    </span>
  );
}

function InspectBody({ rows }: { rows: UrbaInspectRow[] }) {
  if (rows.length === 0) {
    return <p className="map-inspect__empty">Aucun attribut.</p>;
  }
  return (
    <dl className="map-inspect__list">
      {rows.map((row) => (
        <div key={row.key} className="map-inspect__row">
          <dt>{row.label}</dt>
          <dd>
            <InspectValue value={row.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Props = {
  inspect: UrbaInspectPayload | null;
  onClose: () => void;
};

export function UrbaInspectDrawer({ inspect, onClose }: Props) {
  const [shown, setShown] = useState<UrbaInspectPayload | null>(inspect);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (inspect) {
      setShown(inspect);
      setOpen(true);
      return;
    }
    setOpen(false);
  }, [inspect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`map-inspect${open ? " is-open" : ""}`}
      aria-hidden={!open}
      aria-label="Détail urbanisme"
      onTransitionEnd={(e) => {
        if (e.propertyName !== "transform") return;
        if (!inspect) setShown(null);
      }}
    >
      {shown && (
        <>
          <header className="map-inspect__head">
            <div className="map-inspect__head-text">
              {shown.layerLabel ? <p className="map-inspect__layer">{shown.layerLabel}</p> : null}
              <h2 className="map-inspect__title">{shown.title}</h2>
            </div>
            <button type="button" className="map-inspect__close" onClick={onClose} aria-label="Fermer le détail">
              ×
            </button>
          </header>
          <div className="map-inspect__body">
            <InspectBody rows={shown.rows} />
          </div>
        </>
      )}
    </aside>
  );
}
