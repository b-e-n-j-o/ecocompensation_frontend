/**
 * Bloc de légende unique : onglets côte à côte, un contenu visible à la fois.
 */

import { useState, type ReactNode } from "react";

export interface MapLegendTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface MapLegendTabsProps {
  tabs: MapLegendTab[];
  defaultTabId?: string;
}

export function MapLegendTabs({ tabs, defaultTabId }: MapLegendTabsProps) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? "");
  const [collapsed, setCollapsed] = useState(false);

  if (tabs.length === 0) return null;

  const active = tabs.some((tab) => tab.id === activeId) ? activeId : tabs[0].id;

  if (collapsed) {
    return (
      <button
        type="button"
        className="map-legende map-legende--collapsed"
        onClick={() => setCollapsed(false)}
        title="Ouvrir la légende"
      >
        Légende
      </button>
    );
  }

  return (
    <div className="map-legende map-legende--tabs">
      <div className="map-legende__tabs" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`map-legende-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`map-legende-panel-${tab.id}`}
              className={`map-legende__tab${selected ? " is-active" : ""}`}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
        <button
          type="button"
          className="map-legende__collapse"
          onClick={() => setCollapsed(true)}
          title="Réduire la légende"
        >
          −
        </button>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`map-legende-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`map-legende-tab-${tab.id}`}
          className="map-legende__panel"
          hidden={tab.id !== active}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
