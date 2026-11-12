import { useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";

import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { AnalyseFoncierPage } from "./pages/AnalyseFoncier";
import { EtudeResultats } from "./pages/Etude/EtudeResultats";
import { HistoriquePage } from "./pages/Historique/HistoriquePage";
import FaunaMapPage from "./pages/FaunaMap/FaunaMapPage";
import DonneesInternesPage from "./pages/DonneesInternes/DonneesInternesPage";
import AjoutFoncierPage from "./pages/DonneesInternes/AjoutDonnees/Foncier/AjoutFoncierPage";

import "./App.css";

const ROUTE_ECOCOMPENSATION = "/ecocompensation";
const ROUTE_ANALYSE = "/analyse-foncier";
const ROUTE_RESERVE = "/reserve-fonciere";
const ROUTE_AJOUT_FONCIER = "/reserve-fonciere/ajout";
const RAIL_COLLAPSED_KEY = "kerelia-rail-collapsed-v2";

function persistRailCollapsed(next: boolean) {
  try {
    localStorage.setItem(RAIL_COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    /* stockage indisponible */
  }
}

function readRailCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(RAIL_COLLAPSED_KEY);
    if (stored === null) return false;
    return stored === "1";
  } catch {
    return false;
  }
}

function CreateAoiRoutePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editProjectId = (location.state as { editProjectId?: string } | null)?.editProjectId ?? null;
  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <CreateAoiPage
        key={editProjectId ?? "new"}
        editProjectId={editProjectId}
        onDone={(id) => navigate(`/projects/${id}/filter`)}
      />
    </div>
  );
}

function ProjectFilterRoutePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  return (
    <EtudeResultats
      key={projectId ?? "none"}
      fixedProjectId={projectId ?? null}
      onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)}
    />
  );
}

function ProjectRunRoutePage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  return (
    <EtudeResultats
      key={`${projectId ?? ""}:${runId ?? ""}`}
      fixedProjectId={projectId ?? null}
      initialRunId={runId ?? null}
      onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)}
      onProjectChangeNavigate={(id) => navigate(`/projects/${id}/filter`)}
    />
  );
}

function StudyHomeRoutePage() {
  return <HistoriquePage />;
}

export default function App() {
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);

  function setRailOpen(nextCollapsed: boolean) {
    persistRailCollapsed(nextCollapsed);
    setRailCollapsed(nextCollapsed);
  }

  return (
    <div className={`kerelia-app${railCollapsed ? " kerelia-app--rail-collapsed" : ""}`}>
      <AppRail
        collapsed={railCollapsed}
        onCollapse={() => setRailOpen(true)}
        onExpand={() => setRailOpen(false)}
      />
      <div className="kerelia-app__body">
        <div className="kerelia-app__main">
          <Routes>
            <Route path="/" element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
            <Route path={ROUTE_ECOCOMPENSATION} element={<CreateAoiRoutePage />} />
            <Route path={ROUTE_ANALYSE} element={<AnalyseFoncierPage />} />
            <Route path={`${ROUTE_ECOCOMPENSATION}/faune`} element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
            <Route
              path={`${ROUTE_ECOCOMPENSATION}/zones-humides`}
              element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />}
            />
            <Route path="/create-aoi" element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
            <Route path="/etude" element={<StudyHomeRoutePage />} />
            <Route path="/etudes" element={<Navigate to="/etude" replace />} />
            <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
            <Route path="/projects/:projectId/runs/:runId" element={<ProjectRunRoutePage />} />
            <Route path="/faune" element={<FaunaMapPage />} />
            <Route path="/carte-faune" element={<Navigate to="/faune" replace />} />
            <Route path={ROUTE_AJOUT_FONCIER} element={<AjoutFoncierPage />} />
            <Route path={ROUTE_RESERVE} element={<DonneesInternesPage />} />
            <Route path="/donnees-internes" element={<Navigate to={ROUTE_RESERVE} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

const RAIL_ITEMS = [
  {
    to: ROUTE_ECOCOMPENSATION,
    label: "Rechercher",
    isActive: (path: string) =>
      path === "/" || (path.startsWith(ROUTE_ECOCOMPENSATION) && !path.startsWith(ROUTE_ANALYSE)),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="11" cy="11" r="6.2" />
        <path d="M16.2 16.2 20.5 20.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: ROUTE_ANALYSE,
    label: "Analyser",
    isActive: (path: string) => path.startsWith(ROUTE_ANALYSE),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <ellipse cx="12" cy="6.2" rx="7.2" ry="2.6" />
        <path d="M4.8 6.2v4.6c0 1.4 3.2 2.6 7.2 2.6s7.2-1.2 7.2-2.6V6.2" />
        <path d="M4.8 10.8v4.8c0 1.4 3.2 2.6 7.2 2.6s7.2-1.2 7.2-2.6v-4.8" />
      </svg>
    ),
  },
  {
    to: "/etude",
    label: "Historique",
    isActive: (path: string) =>
      path === "/etude" || path === "/etudes" || path.startsWith("/projects/"),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="2.2" />
        <path d="M8 9h8M8 12.5h8M8 16h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: ROUTE_RESERVE,
    label: "Réserve foncière",
    isActive: (path: string) => path.startsWith(ROUTE_RESERVE) || path.startsWith("/donnees-internes"),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 3 3.8 7.5 12 12l8.2-4.5L12 3Z" strokeLinejoin="round" />
        <path d="M3.8 12 12 16.5 20.2 12" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.8 16.5 12 21l8.2-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

function AppRail({
  collapsed,
  onCollapse,
  onExpand,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const { pathname } = useLocation();
  const ignoreHoverExpand = useRef(false);

  return (
    <nav
      className="kerelia-rail"
      aria-label="Navigation principale"
      onMouseEnter={() => {
        if (ignoreHoverExpand.current) return;
        if (collapsed) onExpand();
      }}
      onMouseLeave={() => {
        ignoreHoverExpand.current = false;
        if (!collapsed) onCollapse();
      }}
    >
      <NavLink to={ROUTE_ECOCOMPENSATION} className="kerelia-rail__brand" title="KERFoncier">
        <span className="kerelia-rail__brand-full">KERFoncier</span>
        <span className="kerelia-rail__brand-short" aria-hidden>
          KF
        </span>
      </NavLink>
      <button
        type="button"
        className="kerelia-rail__toggle"
        onClick={() => {
          if (collapsed) {
            ignoreHoverExpand.current = false;
            onExpand();
            return;
          }
          ignoreHoverExpand.current = true;
          onCollapse();
        }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
        title={collapsed ? "Déplier le menu" : "Replier le menu"}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          {collapsed ? (
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {RAIL_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={`kerelia-rail__item${item.isActive(pathname) ? " kerelia-rail__item--active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
