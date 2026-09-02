import { Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";

import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { MethodologyHub } from "./pages/Ecocompensation/MethodologyHub";
import { EtudeResultats } from "./pages/Etude/EtudeResultats";
import FaunaMapPage from "./pages/FaunaMap/FaunaMapPage";
import DonneesInternesPage from "./pages/DonneesInternes/DonneesInternesPage";
import type { StudyType } from "./types/studyTypes";

import "./App.css";

const ROUTE_ECOCOMPENSATION = "/ecocompensation";

function CreateAoiRoutePage({ studyType }: { studyType: StudyType }) {
  const navigate = useNavigate();
  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <CreateAoiPage
        studyType={studyType}
        onDone={(id) => navigate(`/projects/${id}/filter`)}
        onBack={() => navigate(ROUTE_ECOCOMPENSATION)}
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
      fixedProjectId={projectId ?? null}
      initialRunId={runId ?? null}
      onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)}
      onProjectChangeNavigate={(id) => navigate(`/projects/${id}/filter`)}
    />
  );
}

function StudyHomeRoutePage() {
  const navigate = useNavigate();
  return <EtudeResultats onNavigateToCreate={() => navigate(ROUTE_ECOCOMPENSATION)} />;
}

export default function App() {
  return (
    <div className="kerelia-app">
      <AppRail />
      <div className="kerelia-app__body">
        <AppHeader />

        <div className="kerelia-app__main">
          <Routes>
            <Route path="/" element={<Navigate to={ROUTE_ECOCOMPENSATION} replace />} />
            <Route path={ROUTE_ECOCOMPENSATION} element={<MethodologyHub />} />
            <Route path={`${ROUTE_ECOCOMPENSATION}/faune`} element={<CreateAoiRoutePage studyType="faune_buffer" />} />
            <Route
              path={`${ROUTE_ECOCOMPENSATION}/zones-humides`}
              element={<CreateAoiRoutePage studyType="zones_humides_intra" />}
            />
            <Route path="/create-aoi" element={<Navigate to={`${ROUTE_ECOCOMPENSATION}/faune`} replace />} />
            <Route path="/etude" element={<StudyHomeRoutePage />} />
            <Route path="/etudes" element={<Navigate to="/etude" replace />} />
            <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
            <Route path="/projects/:projectId/runs/:runId" element={<ProjectRunRoutePage />} />
            <Route path="/faune" element={<FaunaMapPage />} />
            <Route path="/carte-faune" element={<Navigate to="/faune" replace />} />
            <Route path="/donnees-internes" element={<DonneesInternesPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

const RAIL_ITEMS = [
  {
    to: ROUTE_ECOCOMPENSATION,
    label: "Ecocompensation",
    isActive: (path: string) => path === "/" || path.startsWith(ROUTE_ECOCOMPENSATION),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 21c0-6 4-9 8-9-1 6-5 9-8 9Z" strokeLinejoin="round" />
        <path d="M12 21c0-8-5-12-9-13 2 7 6 11 9 13Z" strokeLinejoin="round" />
        <path d="M12 21V8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/etude",
    label: "Étude",
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
    to: "/donnees-internes",
    label: "Données internes",
    isActive: (path: string) => path.startsWith("/donnees-internes"),
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 3 3.8 7.5 12 12l8.2-4.5L12 3Z" strokeLinejoin="round" />
        <path d="M3.8 12 12 16.5 20.2 12" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.8 16.5 12 21l8.2-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

function AppRail() {
  const { pathname } = useLocation();

  return (
    <nav className="kerelia-rail" aria-label="Navigation principale">
      {RAIL_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`kerelia-rail__item${item.isActive(pathname) ? " kerelia-rail__item--active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function AppHeader() {
  return (
    <header className="kerelia-app__header">
      <NavLink to={ROUTE_ECOCOMPENSATION} className="kerelia-app__brand">
        <span className="kerelia-app__brand-dot" aria-hidden />
        <span className="kerelia-app__brand-name">KERELIA</span>
        <span className="kerelia-app__brand-sub">EcoCompensation</span>
      </NavLink>
    </header>
  );
}
