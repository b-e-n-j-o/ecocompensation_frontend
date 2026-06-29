import { Routes, Route, NavLink, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";

import { CreateAoiPage } from "./pages/FiltreEcologique/CreateAoiPage";
import { MethodologyHub } from "./pages/Ecocompensation/MethodologyHub";
import { EtudeResultats } from "./pages/Etude/EtudeResultats";
import FaunaMapPage from "./pages/FaunaMap/FaunaMapPage";
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
          <Route path="/projects/:projectId/filter" element={<ProjectFilterRoutePage />} />
          <Route path="/projects/:projectId/runs/:runId" element={<ProjectRunRoutePage />} />
          <Route path="/faune" element={<FaunaMapPage />} />
        </Routes>
      </div>
    </div>
  );
}

function AppHeader() {
  const location = useLocation();
  const etudeActive =
    location.pathname === "/etude" || location.pathname.startsWith("/projects/");

  return (
    <header className="kerelia-app__header">
      <NavLink to={ROUTE_ECOCOMPENSATION} className="kerelia-app__brand">
        <span className="kerelia-app__brand-dot" aria-hidden />
        <span className="kerelia-app__brand-name">KERELIA</span>
        <span className="kerelia-app__brand-sub">EcoCompensation</span>
      </NavLink>

      <nav className="kerelia-app__nav" aria-label="Navigation principale">
        <NavLink
          to={ROUTE_ECOCOMPENSATION}
          className={({ isActive }) =>
            `kerelia-app__nav-link${isActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Ecocompensation
        </NavLink>
        <NavLink
          to="/etude"
          className={() =>
            `kerelia-app__nav-link${etudeActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Étude
        </NavLink>
        <NavLink
          to="/faune"
          className={({ isActive }) =>
            `kerelia-app__nav-link${isActive ? " kerelia-app__nav-link--active" : ""}`
          }
        >
          Carte faune
        </NavLink>
      </nav>
    </header>
  );
}
