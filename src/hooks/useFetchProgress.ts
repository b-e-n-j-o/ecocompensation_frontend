import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProjectStoredResults } from "../api";
import { getWsBaseUrl } from "../config/apiBase";
import type { IlotsRpgResponse, UfFilterResponse } from "../types";
import {
  applyWsToPipelineProgress,
  completedPipelineProgress,
  INITIAL_PIPELINE_PROGRESS,
  type PipelineProgress,
} from "../utils/pipelineProgress";
import { parseStoredFilterResponse } from "../utils/storedFilterResults";

export interface FetchProgressEvent {
  event?: string;
  status?: string;
  layers_status?: Record<string, unknown>;
  message?: string;
  layer_key?: string;
  n_inserted?: number;
  n_final?: number;
}

function countUf(lastResultsUf: unknown): number {
  if (!lastResultsUf || typeof lastResultsUf !== "object") return 0;
  const uf = lastResultsUf as UfFilterResponse;
  if (typeof uf.total_uf === "number") return uf.total_uf;
  return Array.isArray(uf.unites_foncieres) ? uf.unites_foncieres.length : 0;
}

function countIlots(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const il = raw as IlotsRpgResponse;
  if (typeof il.total_ilots === "number") return il.total_ilots;
  return Array.isArray(il.ilots) ? il.ilots.length : 0;
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 404;
}

export function useFetchProgress(projectId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<FetchProgressEvent | null>(null);
  const [parcellesReady, setParcellesReady] = useState(false);
  const [ufReady, setUfReady] = useState(false);
  const [ilotsRpgReady, setIlotsRpgReady] = useState(false);
  const [ilotsRpgError, setIlotsRpgError] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>(INITIAL_PIPELINE_PROGRESS);
  const socketRef = useRef<WebSocket | null>(null);
  const ufReadyRef = useRef(false);
  const stopPollRef = useRef(false);
  const activePidRef = useRef<string | null>(null);

  const resetFetchPhases = useCallback(() => {
    setParcellesReady(false);
    setUfReady(false);
    setIlotsRpgReady(false);
    setIlotsRpgError(null);
    ufReadyRef.current = false;
    setPipelineProgress(INITIAL_PIPELINE_PROGRESS);
  }, []);

  const syncFromStored = useCallback(async (pid: string) => {
    if (activePidRef.current !== pid) {
      return { nParc: 0, nUf: 0, stored: null, missing: false };
    }
    try {
      const stored = await fetchProjectStoredResults(pid);
      if (activePidRef.current !== pid) {
        return { nParc: 0, nUf: 0, stored: null, missing: false };
      }
      const parsed = parseStoredFilterResponse(stored.last_results);
      const nParc = parsed?.total ?? 0;
      const nUf = countUf(stored.last_results_uf);
      const nIlots = countIlots(stored.last_results_ilots_rpg);

      if (parsed != null) {
        setParcellesReady(true);
      }
      if (nUf > 0) {
        setUfReady(true);
        ufReadyRef.current = true;
        stopPollRef.current = true;
      }
      if (stored.last_results_ilots_rpg && typeof stored.last_results_ilots_rpg === "object") {
        setIlotsRpgReady(true);
      }

      if (nParc > 0 || nUf > 0 || nIlots > 0 || stored.last_results_ilots_rpg) {
        setPipelineProgress((prev) => {
          if (prev.uf.status === "running" || prev.ilots.status === "running") return prev;
          return completedPipelineProgress(nParc || undefined, nUf || undefined, nIlots || undefined);
        });
      }
      return { nParc, nUf, stored, missing: false };
    } catch (err) {
      if (isNotFound(err)) {
        stopPollRef.current = true;
        return { nParc: 0, nUf: 0, stored: null, missing: true };
      }
      return { nParc: 0, nUf: 0, stored: null, missing: false };
    }
  }, []);

  useEffect(() => {
    activePidRef.current = projectId;
    stopPollRef.current = false;
    ufReadyRef.current = false;

    if (!projectId) {
      resetFetchPhases();
      return;
    }

    void syncFromStored(projectId);

    const WS = getWsBaseUrl();
    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    socketRef.current = ws;
    const pid = projectId;

    ws.onopen = () => {
      if (activePidRef.current === pid) setConnected(true);
    };

    ws.onmessage = (event) => {
      if (activePidRef.current !== pid) return;
      try {
        const data = JSON.parse(event.data) as FetchProgressEvent;
        setProgress(data);

        const ev = data.event;
        if (ev === "start") {
          stopPollRef.current = false;
          resetFetchPhases();
        } else if (ev === "phase:parcelles_ready") {
          setParcellesReady(true);
        } else if (ev === "phase:uf_ready") {
          setUfReady(true);
          ufReadyRef.current = true;
          stopPollRef.current = true;
          void syncFromStored(pid);
        } else if (ev === "phase:ilots_rpg_ready") {
          setIlotsRpgReady(true);
          setIlotsRpgError(null);
          void syncFromStored(pid);
        } else if (ev === "error" && data.layer_key === "ilots_rpg") {
          setIlotsRpgError(typeof data.message === "string" ? data.message : "Erreur îlots agricoles");
        }

        if (ev && ev !== "connected" && ev !== "ping") {
          setPipelineProgress((prev) => applyWsToPipelineProgress(prev, data));
        }
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };

    ws.onclose = () => {
      if (activePidRef.current === pid) setConnected(false);
    };

    ws.onerror = () => {
      /* projet introuvable ou socket fermée : pas de spam console */
    };

    const poll = window.setInterval(() => {
      if (activePidRef.current !== pid || stopPollRef.current || ufReadyRef.current) {
        window.clearInterval(poll);
        return;
      }
      void syncFromStored(pid);
    }, 4000);

    return () => {
      activePidRef.current = null;
      stopPollRef.current = true;
      window.clearInterval(poll);
      ws.close();
    };
  }, [projectId, resetFetchPhases, syncFromStored]);

  return {
    connected,
    progress,
    parcellesReady,
    ufReady,
    ilotsRpgReady,
    ilotsRpgError,
    pipelineProgress,
    resetFetchPhases,
    syncFromStored,
  };
}
