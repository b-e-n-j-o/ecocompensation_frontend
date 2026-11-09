import { useMemo, useState } from "react";

import { exportFicheFiltragePdf } from "../../api";
import { parseStoredLastFilter, serializeFilterPreset } from "../../utils/storedFilterResults";
import {
  buildCriteria,
  HIDDEN_FROM_REPORT,
  readFilterConfig,
  THEME_LABELS,
  THEME_ORDER,
  type CriterionSpec,
  type FilterTheme,
} from "../Etude/FiltrageParam/FilterCatalog";

export function HistoriqueFiltrageDrawer({
  projectId,
  projectName,
  rawConfig,
  onClose,
}: {
  projectId: string;
  projectName: string;
  rawConfig: unknown;
  onClose: () => void;
}) {
  const criteria = useMemo(() => {
    const config = readFilterConfig(rawConfig);
    return buildCriteria(config).filter((c) => !HIDDEN_FROM_REPORT.has(c.key));
  }, [rawConfig]);

  const byTheme = useMemo(() => {
    const groups: { theme: FilterTheme; label: string; items: CriterionSpec[]; anyOn: boolean }[] = [];
    for (const theme of THEME_ORDER) {
      const items = criteria.filter((c) => c.theme === theme);
      if (items.length) {
        groups.push({
          theme,
          label: THEME_LABELS[theme],
          items,
          anyOn: items.some((c) => c.applied === true),
        });
      }
    }
    return groups;
  }, [criteria]);

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copyParams() {
    const options = parseStoredLastFilter(
      rawConfig && typeof rawConfig === "object"
        ? { pipeline: "filter_v2", ...(rawConfig as object) }
        : rawConfig,
    );
    if (!options) {
      alert("Aucun paramètre de filtrage enregistré à copier.");
      return;
    }
    const text = serializeFilterPreset(options);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copiez ce JSON de paramètres :", text);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function exportFiche() {
    if (!projectId) return;
    setBusy(true);
    try {
      await exportFicheFiltragePdf(projectId);
    } catch (err) {
      console.error("Fiche filtrage:", err);
      alert(err instanceof Error ? err.message : "Erreur lors de l'export de la fiche.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="historique-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="historique-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historique-filtrage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="historique-drawer__head">
          <div>
            <div className="historique-drawer__kicker">Kerelia · KerFoncier</div>
            <h2 id="historique-filtrage-title">Paramètres de filtrage</h2>
            <p>{projectName}</p>
          </div>
          <div className="historique-drawer__head-actions">
            <div className="historique-drawer__head-buttons">
              <button
                type="button"
                className="fparams-copy"
                disabled={!rawConfig}
                onClick={() => void copyParams()}
                title="Copie un JSON collable dans le panneau de filtrage"
              >
                {copied ? "Copié" : "Copier le filtre"}
              </button>
              <button
                type="button"
                className="fparams-export"
                disabled={busy || !projectId}
                onClick={() => void exportFiche()}
                title="PDF A4 des critères réellement exécutés"
              >
                {busy ? "Export…" : "Exporter la fiche"}
              </button>
            </div>
            <button type="button" className="historique-drawer__close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </header>
        <div className="historique-drawer__body">
          {byTheme.length === 0 ? (
            <p className="historique-drawer__empty">Aucun filtrage enregistré pour ce projet.</p>
          ) : (
            byTheme.map((group) => (
              <section
                key={group.theme}
                className={`historique-fiche__block${group.anyOn ? "" : " historique-fiche__block--off"}`}
              >
                <div className="historique-fiche__bt">
                  <span>{group.label}</span>
                  {group.anyOn ? null : <span>non utilisé</span>}
                </div>
                {group.items.map((item) => {
                  const on = item.applied === true;
                  return (
                    <div key={item.key} className={`historique-fiche__row${on ? "" : " historique-fiche__row--off"}`}>
                      <span className={`historique-fiche__pill ${on ? "is-on" : "is-off"}`}>
                        {on ? "ON" : "OFF"}
                      </span>
                      <span className="historique-fiche__lab">
                        {on ? item.label : item.name}
                        {on && item.details.length > 0 ? (
                          <span className="historique-fiche__val">
                            {item.details.map((d) => (
                              <span key={`${item.key}-${d.label}`} className="historique-fiche__chip">
                                {d.label ? <i>{d.label}</i> : null} <b>{d.value}</b>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </section>
            ))
          )}
          {byTheme.length > 0 ? (
            <p className="historique-fiche__legend">
              ON / OFF : état de chaque critère au moment du calcul. Les valeurs indiquées sont celles réglées dans le panneau de filtrage.
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
