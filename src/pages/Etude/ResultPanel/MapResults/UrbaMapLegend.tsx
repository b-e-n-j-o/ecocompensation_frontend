/**
 * Légende urbanisme : famille, puis couche, puis code CNIG.
 */

import { useMemo, useState } from "react";
import {
  urbaToggleKey,
  type UrbaFeatureCollection,
} from "./urbaMapLayer";

const FAMILLE_ORDER = ["zonage", "prescription", "information", "servitude"];
const FAMILLE_LABEL: Record<string, string> = {
  zonage: "Zonage",
  prescription: "Prescriptions",
  information: "Informations",
  servitude: "Servitudes",
};

type CodeNode = { code: string; label: string; count: number; key: string };
type LayerNode = { layerKey: string; label: string; count: number; codes: CodeNode[] };
type FamilleNode = { famille: string; label: string; count: number; layers: LayerNode[] };

function buildTree(data: UrbaFeatureCollection): FamilleNode[] {
  const familles = new Map<string, Map<string, Map<string, { label: string; count: number }>>>();
  const layerLabels = new Map<string, string>();
  for (const feature of data.features) {
    const props = feature.properties ?? {};
    const famille = props.famille || "autre";
    const layerKey = props.layer_key || "couche";
    const code = props.code || "";
    const label = props.libelle_cnig || props.libelle || (code ? code : "sans code");
    layerLabels.set(layerKey, props.display_name || layerKey);
    const byLayer = familles.get(famille) ?? new Map();
    const byCode = byLayer.get(layerKey) ?? new Map();
    const prev = byCode.get(code);
    byCode.set(code, { label, count: (prev?.count ?? 0) + 1 });
    byLayer.set(layerKey, byCode);
    familles.set(famille, byLayer);
  }
  const order = [
    ...FAMILLE_ORDER.filter((f) => familles.has(f)),
    ...[...familles.keys()].filter((f) => !FAMILLE_ORDER.includes(f)),
  ];
  return order.map((famille) => {
    const layers: LayerNode[] = [...(familles.get(famille)?.entries() ?? [])].map(
      ([layerKey, codes]) => {
        const codeNodes: CodeNode[] = [...codes.entries()]
          .map(([code, info]) => ({
            code,
            label: code ? `${code} ${info.label}` : info.label,
            count: info.count,
            key: urbaToggleKey(famille, layerKey, code),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "fr"));
        return {
          layerKey,
          label: layerLabels.get(layerKey) || layerKey,
          count: codeNodes.reduce((sum, node) => sum + node.count, 0),
          codes: codeNodes,
        };
      },
    );
    layers.sort((a, b) => a.label.localeCompare(b.label, "fr"));
    return {
      famille,
      label: FAMILLE_LABEL[famille] || famille,
      count: layers.reduce((sum, layer) => sum + layer.count, 0),
      layers,
    };
  });
}

interface UrbaMapLegendProps {
  data: UrbaFeatureCollection;
  hidden: Set<string>;
  loading: boolean;
  error: string | null;
  onToggleKeys: (keys: string[], visible: boolean) => void;
  /** Sans cadre ni titre : contenu seul, à placer dans un onglet. */
  embedded?: boolean;
}

export function UrbaMapLegend({
  data,
  hidden,
  loading,
  error,
  onToggleKeys,
  embedded = false,
}: UrbaMapLegendProps) {
  const tree = useMemo(() => buildTree(data), [data]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(["zonage"]));

  function isOn(key: string) {
    return !hidden.has(key);
  }

  function groupOn(keys: string[]) {
    return keys.some((key) => isOn(key));
  }

  function toggleGroup(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const body = (
    <>
      {loading && (
        <div className="map-legende__busy" role="status">
          <span className="parcelles-map-spinner" aria-hidden />
          Chargement…
        </div>
      )}
      {error && <p className="map-legende__empty">{error}</p>}
      {!loading && !error && tree.length === 0 && (
        <p className="map-legende__empty">
          Aucune entité enregistrée. Lancez le profil urbanisme depuis le classement.
        </p>
      )}
      <ul className="map-legende__list">
        {tree.map((famille) => {
          const familleKeys = famille.layers.flatMap((layer) => layer.codes.map((code) => code.key));
          const familleOpen = open.has(famille.famille);
          return (
            <li key={famille.famille}>
              <div className="map-legende__branch">
                <button
                  type="button"
                  className="map-legende__expand"
                  aria-expanded={familleOpen}
                  onClick={() => toggleGroup(famille.famille)}
                >
                  {familleOpen ? "–" : "+"}
                </button>
                <button
                  type="button"
                  className={`map-legende__row${groupOn(familleKeys) ? " is-on" : " is-off"}`}
                  onClick={() => onToggleKeys(familleKeys, !groupOn(familleKeys))}
                >
                  <span className="map-legende__label">{famille.label}</span>
                  <span className="map-legende__count">{famille.count}</span>
                </button>
              </div>
              {familleOpen && (
                <ul className="map-legende__sub">
                  {famille.layers.map((layer) => {
                    const layerKeys = layer.codes.map((code) => code.key);
                    const layerId = `${famille.famille}:${layer.layerKey}`;
                    const layerOpen = open.has(layerId);
                    return (
                      <li key={layer.layerKey}>
                        <div className="map-legende__branch">
                          <button
                            type="button"
                            className="map-legende__expand"
                            aria-expanded={layerOpen}
                            onClick={() => toggleGroup(layerId)}
                          >
                            {layerOpen ? "–" : "+"}
                          </button>
                          <button
                            type="button"
                            className={`map-legende__row${groupOn(layerKeys) ? " is-on" : " is-off"}`}
                            onClick={() => onToggleKeys(layerKeys, !groupOn(layerKeys))}
                          >
                            <span className="map-legende__label">{layer.label}</span>
                            <span className="map-legende__count">{layer.count}</span>
                          </button>
                        </div>
                        {layerOpen && (
                          <ul className="map-legende__sub">
                            {layer.codes.map((code) => (
                              <li key={code.key}>
                                <button
                                  type="button"
                                  className={`map-legende__row${isOn(code.key) ? " is-on" : " is-off"}`}
                                  onClick={() => onToggleKeys([code.key], !isOn(code.key))}
                                >
                                  <span className="map-legende__label">{code.label}</span>
                                  <span className="map-legende__count">{code.count}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (embedded) return body;

  return (
    <div className="map-legende map-legende--urba">
      <div className="map-legende__head">Urbanisme</div>
      {body}
    </div>
  );
}
