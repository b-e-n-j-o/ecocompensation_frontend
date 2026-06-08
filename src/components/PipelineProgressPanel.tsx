import {
  formatStageCount,
  MAIN_STAGE_LABELS,
  SUBSTEP_LABELS,
  SUBSTEP_ORDER,
  type MainStageKey,
  type PipelineProgress,
  type StageProgress,
  type SubStepKey,
} from "../utils/pipelineProgress";
import "./pipelineProgressPanel.css";

interface PipelineProgressPanelProps {
  progress: PipelineProgress;
  compact?: boolean;
}

function SubstepIcon({ status }: { status: StageProgress["substeps"][SubStepKey] }) {
  if (status === "running") {
    return <span className="pipeline-substep-icon pipeline-substep-icon--running" aria-hidden="true" />;
  }
  if (status === "done") {
    return <span className="pipeline-substep-icon pipeline-substep-icon--done" aria-hidden="true">✓</span>;
  }
  if (status === "error") {
    return <span className="pipeline-substep-icon pipeline-substep-icon--error" aria-hidden="true">!</span>;
  }
  return <span className="pipeline-substep-icon pipeline-substep-icon--pending" aria-hidden="true" />;
}

function StageBlock({ stageKey, stage }: { stageKey: MainStageKey; stage: StageProgress }) {
  const count = formatStageCount(stage);
  const showSpinner = stage.status === "running";

  return (
    <div className={`pipeline-stage pipeline-stage--${stage.status}`}>
      <div className="pipeline-stage-head">
        {showSpinner && <span className="pipeline-stage-spinner" aria-hidden="true" />}
        <span className="pipeline-stage-title">{MAIN_STAGE_LABELS[stageKey]}</span>
        {count && <span className="pipeline-stage-count">{count}</span>}
      </div>
      <ul className="pipeline-substeps">
        {SUBSTEP_ORDER.map((key) => (
          <li
            key={key}
            className={`pipeline-substep pipeline-substep--${stage.substeps[key]}`}
          >
            <SubstepIcon status={stage.substeps[key]} />
            <span>{SUBSTEP_LABELS[key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PipelineProgressPanel({ progress, compact = false }: PipelineProgressPanelProps) {
  return (
    <div className={`pipeline-progress${compact ? " pipeline-progress--compact" : ""}`}>
      <StageBlock stageKey="parcelles" stage={progress.parcelles} />
      <StageBlock stageKey="uf" stage={progress.uf} />
    </div>
  );
}
