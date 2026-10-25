import { useEffect, useRef, useState } from "react";
import type { GridDetectionStatus } from "@vtt/shared";
import { api, ApiError } from "../net/api";

/** Mounted only by an open grid editor. All old polls are discarded on unmount or target change. */
export function useGridDetection(source: "library" | "room", token: string, id: string, mapUrl = "") {
  const key = JSON.stringify([source, token, id, mapUrl]);
  const [view, setView] = useState<{
    key: string; status: GridDetectionStatus | null; error: string | null; accessDenied: boolean;
  }>(() => ({ key, status: null, error: null, accessDenied: false }));
  const status = view.key === key ? view.status : null;
  const error = view.key === key ? view.error : null;
  const accessDenied = view.key === key && view.accessDenied;
  const [revision, setRevision] = useState(0);
  const retrying = useRef<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let live = true;
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const poll = async () => {
      if (!live || generation.current !== current) return;
      try {
        const next = source === "library"
          ? await api.detection.library(id, abort.signal)
          : await api.detection.room(id, token, mapUrl, abort.signal);
        if (!live || generation.current !== current) return;
        setView({ key, status: next, error: null, accessDenied: false });
        if (next?.status === "queued" || next?.status === "running") timer = setTimeout(() => { void poll(); }, 1500);
      } catch (err) {
        if (!live || generation.current !== current) return;
        const denied = err instanceof ApiError && (err.status === 401 || err.status === 403);
        setView((previous) => ({
          key, status: denied ? null : previous.key === key ? previous.status : null, accessDenied: denied,
          error: err instanceof Error ? err.message : "Could not check analysis",
        }));
        if (!denied) timer = setTimeout(() => { void poll(); }, 3000);
      }
    };
    void poll();
    return () => { live = false; generation.current++; abort.abort(); if (timer) clearTimeout(timer); };
  }, [source, token, id, mapUrl, key, revision]);

  const retry = async () => {
    if (retrying.current === key || status?.status !== "error") return;
    retrying.current = key;
    const current = ++generation.current;
    try {
      const next = source === "library"
        ? await api.detection.retryLibrary(id)
        : await api.detection.retryRoom(id, token, mapUrl);
      if (generation.current === current) {
        setView({ key, status: next, error: null, accessDenied: false });
        setRevision((n) => n + 1);
      }
    } catch (err) {
      if (generation.current === current) setView({
        key, status, error: err instanceof Error ? err.message : "Could not retry analysis",
        accessDenied: err instanceof ApiError && (err.status === 401 || err.status === 403),
      });
    } finally {
      if (retrying.current === key) retrying.current = null;
    }
  };

  return { status, error, accessDenied, retry };
}
