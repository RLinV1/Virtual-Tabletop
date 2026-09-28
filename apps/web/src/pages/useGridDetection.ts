import { useEffect, useRef, useState } from "react";
import type { GridDetectionStatus } from "@vtt/shared";
import { api } from "../net/api";

/** Mounted only by an open grid editor. All old polls are discarded on unmount or target change. */
export function useGridDetection(source: "library" | "room", token: string, id: string, mapUrl = "") {
  const [status, setStatus] = useState<GridDetectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const retrying = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let live = true;
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const poll = async () => {
      try {
        const next = source === "library"
          ? await api.detection.library(token, id, abort.signal)
          : await api.detection.room(id, token, mapUrl, abort.signal);
        if (!live || generation.current !== current) return;
        setStatus(next);
        setError(null);
        if (next?.status === "queued" || next?.status === "running") timer = setTimeout(() => { void poll(); }, 1500);
      } catch (err) {
        if (!live || generation.current !== current) return;
        setError(err instanceof Error ? err.message : "Could not check analysis");
        timer = setTimeout(() => { void poll(); }, 3000);
      }
    };
    void poll();
    return () => { live = false; generation.current++; abort.abort(); if (timer) clearTimeout(timer); };
  }, [source, token, id, mapUrl, revision]);

  const retry = async () => {
    if (retrying.current || status?.status !== "error") return;
    retrying.current = true;
    const current = ++generation.current;
    try {
      const next = source === "library"
        ? await api.detection.retryLibrary(token, id)
        : await api.detection.retryRoom(id, token, mapUrl);
      if (generation.current === current) {
        setStatus(next);
        setError(null);
        setRevision((n) => n + 1);
      }
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : "Could not retry analysis");
    } finally {
      retrying.current = false;
    }
  };

  return { status, error, retry };
}
