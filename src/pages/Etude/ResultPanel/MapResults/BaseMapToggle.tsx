import type { BaseMapMode } from "./resultsBasemap";

export function BaseMapToggle({
  mode,
  onToggle,
}: {
  mode: BaseMapMode;
  onToggle: () => void;
}) {
  const toPlan = mode === "satellite";
  return (
    <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5 }}>
      <button
        type="button"
        onClick={onToggle}
        title={toPlan ? "Passer au plan IGN" : "Passer à la vue satellite"}
        aria-label={toPlan ? "Passer au plan IGN" : "Passer à la vue satellite"}
        style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #334155",
          background: "rgba(15, 23, 42, 0.85)",
          color: "#e2e8f0",
          borderRadius: 8,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <rect x="1.5" y="9" width="11" height="7.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="5.5" y="5" width="11" height="7.5" rx="1.2" fill="rgba(15,23,42,0.85)" stroke="currentColor" strokeWidth="1.4" />
          <rect x="3.5" y="1.5" width="11" height="7.5" rx="1.2" fill="rgba(15,23,42,0.95)" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  );
}
