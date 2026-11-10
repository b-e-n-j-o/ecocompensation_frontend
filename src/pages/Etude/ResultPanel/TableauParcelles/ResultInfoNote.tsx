import type { ReactNode } from "react";

export function ResultInfoNote({ children }: { children: ReactNode }) {
  return (
    <details className="result-info">
      <summary>Informations</summary>
      <div className="result-info__body">{children}</div>
    </details>
  );
}
