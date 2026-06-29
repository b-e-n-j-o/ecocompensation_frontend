import { Link } from "react-router-dom";
import { STUDY_PROFILES } from "../Etude/studyProfiles";
import "./MethodologyHub.css";

export function MethodologyHub() {
  const faune = STUDY_PROFILES.faune_buffer;
  const zh = STUDY_PROFILES.zones_humides_intra;

  return (
    <div className="methodology-hub">
      <h1 className="methodology-hub__title">Nouvelle étude d&apos;ecocompensation</h1>
      <p className="methodology-hub__intro">
        Choisissez la méthodologie de recherche de foncier compensatoire. Les deux parcours aboutissent
        au même espace de résultats (classement, carte, unités foncières).
      </p>

      <div className="methodology-hub__grid">
        <Link to="/ecocompensation/faune" className="methodology-card methodology-card--faune">
          <span className="methodology-card__icon" aria-hidden>
            {faune.hubIcon}
          </span>
          <h2 className="methodology-card__title">{faune.hubTitle}</h2>
          <p className="methodology-card__desc">{faune.hubDescription}</p>
          <span className="methodology-card__cta">Démarrer →</span>
        </Link>

        <Link to="/ecocompensation/zones-humides" className="methodology-card methodology-card--zh">
          <span className="methodology-card__icon" aria-hidden>
            {zh.hubIcon}
          </span>
          <h2 className="methodology-card__title">{zh.hubTitle}</h2>
          <p className="methodology-card__desc">{zh.hubDescription}</p>
          <span className="methodology-card__cta">Démarrer →</span>
        </Link>
      </div>
    </div>
  );
}
