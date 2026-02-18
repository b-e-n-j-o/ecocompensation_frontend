import { useEffect, useRef, useState } from "react";

export interface FetchProgressEvent {
  event?: string;
  status?: string;
  layers_status?: Record<string, unknown>;
  message?: string;
}

export function useFetchProgress(projectId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<FetchProgressEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const API = import.meta.env.VITE_API_URL as string;
    const WS = API.replace(/^http/, "ws");

    const ws = new WebSocket(`${WS}/ws/projects/${projectId}/fetch-progress`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };

    ws.onclose = () => {
      console.log("WS closed");
      setConnected(false);
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
    };

    return () => {
      ws.close();
    };
  }, [projectId]);

  return { connected, progress };
}

