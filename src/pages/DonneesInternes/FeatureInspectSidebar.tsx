import { useEffect, useState } from "react";

const LONG_CHARS = 140;

export type InspectRow = {
  key: string;
  label: string;
  value: string;
  group?: string;
};

export type InspectPayload = {
  title: string;
  layerLabel: string | null;
  rows: InspectRow[];
};

function InspectValue({ value }: { value: string }) {
  const long = value.length > LONG_CHARS;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [value]);

  if (!long) {
    return <p className="di-inspect__val">{value}</p>;
  }

  return (
    <div className="di-inspect__long">
      <p className={`di-inspect__val${expanded ? " is-full" : " is-clamp"}`}>{value}</p>
      <button type="button" className="di-inspect__more" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Réduire" : "Voir tout"}
      </button>
    </div>
  );
}

function chunkInspectRows(rows: InspectRow[]): { group: string; rows: InspectRow[] }[] {
  const out: { group: string; rows: InspectRow[] }[] = [];
  for (const row of rows) {
    const group = row.group ?? "";
    const last = out[out.length - 1];
    if (!last || last.group !== group) out.push({ group, rows: [row] });
    else last.rows.push(row);
  }
  return out;
}

type Props = {
  inspect: InspectPayload | null;
  onClose: () => void;
};

export function FeatureInspectSidebar({ inspect, onClose }: Props) {
  const [shown, setShown] = useState<InspectPayload | null>(inspect);
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
      className={`di-inspect${open ? " is-open" : ""}`}
      aria-hidden={!open}
      aria-label="Détail de l'entité"
      onTransitionEnd={(e) => {
        if (e.propertyName !== "transform") return;
        if (!inspect) setShown(null);
      }}
    >
      {shown && (
        <>
          <header className="di-inspect__head">
            <div className="di-inspect__head-text">
              {shown.layerLabel ? <p className="di-inspect__layer">{shown.layerLabel}</p> : null}
              <h2 className="di-inspect__title">{shown.title}</h2>
            </div>
            <button type="button" className="di-inspect__close" onClick={onClose} aria-label="Fermer le détail">
              ×
            </button>
          </header>
          <div className="di-inspect__body">
            {shown.rows.length === 0 ? (
              <p className="di-inspect__empty">Aucun attribut sur cette entité.</p>
            ) : (
              <div className="di-inspect__sections">
                {chunkInspectRows(shown.rows).map((section) => (
                  <section key={section.group} className="di-inspect__section">
                    {section.group ? <h3 className="di-inspect__group">{section.group}</h3> : null}
                    <dl className="di-inspect__list">
                      {section.rows.map((row) => (
                        <div key={row.key} className="di-inspect__row">
                          <dt>{row.label}</dt>
                          <dd>
                            <InspectValue value={row.value} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
