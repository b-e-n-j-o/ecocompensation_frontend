import { AnalyseFoncierPanel } from "./AnalyseFoncierPanel";
import { CarteFiltre } from "../FiltreEcologique/carte/CarteFiltre";
import { EMPTY_TILES_OVERLAY } from "../FiltreEcologique/filterTilesOverlay";
import "../FiltreEcologique/createAoiPage.css";
import "./AnalyseFoncier.css";

export function AnalyseFoncierPage() {
  return (
    <div className="eco-aoi-page">
      <div className="eco-aoi-layout">
        <aside className="eco-aoi-sidebar">
          <div className="eco-aoi-sidebar-head">
            <h1>Analyse de foncier</h1>
          </div>
          <div className="eco-aoi-sidebar-main">
            <div className="eco-aoi-body">
              <AnalyseFoncierPanel />
            </div>
          </div>
        </aside>
        <CarteFiltre
          sourceFeature={null}
          bufferKm={0}
          isZh={false}
          bvPreviewNames={[]}
          tilesOverlay={EMPTY_TILES_OVERLAY}
          faunaSpecies={[]}
          faunaAliases={{}}
          faunaDistBySpecies={{}}
          floraCriteria={[]}
        />
      </div>
    </div>
  );
}
