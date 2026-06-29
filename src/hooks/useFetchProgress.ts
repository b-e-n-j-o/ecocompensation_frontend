import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProjectStoredResults } from "../api";
import { getWsBaseUrl } from "../config/apiBase";
import type { UfFilterResponse } from "../types";
import {
  applyWsToPipelineProgress,
  completedPipelineProgress,
  INITIAL_PIPELINE_PROGRESS,
  type PipelineProgress,
} from "../utils/pipelineProgress";

export interface FetchProgressEvent {
  event?: string;
  status?: string;
  layers_status?: Record<string, unknown>;
  message?: string;
  layer_key?: string;
  n_inserted?: number;
  n_final?: number;
}

import { parseStoredFilterResponse } from "../utils/storedFilterResults";

function countUf(lastResultsUf: unknown): number {
  if (!lastResultsUf || typeof lastResultsUf !== "object") return 0;
  const uf = lastResultsUf as UfFilterResponse;
  if (typeof uf.total_uf === "number") return uf.total_uf;
  return Array.isArray(uf.unites_foncieres) ? uf.unites_foncieres.length : 0;
}

export function useFetchProgress(projectId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<FetchProgressEvent | null>(null);
  const [parcellesReady, setParcellesReady] = useState(false);
  const [ufReady, setUfReady] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>(INITIAL_PIPELINE_PROGRESS);
  const socketRef = useRef<WebSocket | null>(null);
  const ufReadyRef = useRef(false);

  const resetFetchPhases = useCallback(() => {
    setParcellesReady(false);
    setUfReady(false);
    ufReadyRef.current = false;
    setPipelineProgress(INITIAL_PIPELINE_PROGRESS);
  }, []);

  const syncFromStored = useCallback(async (pid: string) => {
    try {
      const stored = await fetchProjectStoredResults(pid);
      const parsed = parseStoredFilterResponse(stored.last_results);
      const nParc = parsed?.total ?? 0;
      const nUf = countUf(stored.last_results_uf);

      if (parsed != null) {
        setParcellesReady(true);
      }
      if (nUf > 0) {
        setUfReady(true);
        ufReadyRef.current = true;
      }

      if (nParc > 0 || nUf > 0) {
        setPipelineProgress(completedPipelineProgress(nParc || undefined, nUf || undefined));
      }
      return { nParc, nUf, stored };
    } catch {
      return { nParc: 0, nUf: 0, stored: null };
    }
  }, []);

  useEffect(() => {
    if (!projectId) {
      resetFetchPhases();
      return;
    }

    void syncFromStored(projectId);

    const WS = getWsBaseUrl();
    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FetchProgressEvent;
        setProgress(data);

        const ev = data.event;
        if (ev === "start") {
          resetFetchPhases();
        } else if (ev === "phase:parcelles_ready") {
          setParcellesReady(true);
        } else if (ev === "phase:uf_ready") {
          setUfReady(true);
          ufReadyRef.current = true;
          void syncFromStored(projectId);
        }

        if (ev && ev !== "connected" && ev !== "ping") {
          setPipelineProgress((prev) => applyWsToPipelineProgress(prev, data));
        }
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
    };

    // Repli : UF terminée en base mais event WS manqué (navigation / reconnexion)
    const poll = window.setInterval(() => {
      if (ufReadyRef.current) return;
      void syncFromStored(projectId).then(({ nUf }) => {
        if (nUf > 0) ufReadyRef.current = true;
      });
    }, 4000);

    return () => {
      window.clearInterval(poll);
      ws.close();
    };
  }, [projectId, resetFetchPhases, syncFromStored]);

  return {
    connected,
    progress,
    parcellesReady,
    ufReady,
    pipelineProgress,
    resetFetchPhases,
    syncFromStored,
  };
}
