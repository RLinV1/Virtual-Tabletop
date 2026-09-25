import { useEffect, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import type { HistoryResponse } from "@vtt/shared";
import { api } from "../net/api";
import { Modal } from "../ui/Modal";

/** Mounted only for the GM. The endpoint independently enforces room membership/role. */
export function ActivityLog({ roomId, token, seq }: { roomId: string; token: string; seq: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="tool-button" onClick={() => setOpen(true)}>Activity log</button>
    <Modal open={open} title="Activity log" onClose={() => setOpen(false)}>
      {open && <History key={roomId} roomId={roomId} token={token} seq={seq} />}
    </Modal>
  </>;
}

function History({ roomId, token, seq }: { roomId: string; token: string; seq: number }) {
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<HistoryResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedSeq, setLoadedSeq] = useState(seq);
  const latestSeq = useRef(seq);
  latestSeq.current = seq;
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPage(null);
    setError(null);
    const timer = window.setTimeout(() => {
      const atSeq = latestSeq.current;
      void api.history(roomId, token, search.trim(), undefined, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setPage(result);
        setLoadedSeq(atSeq);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load activity.");
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      request.current?.abort();
    };
  }, [roomId, token, search, refresh]);

  const loadOlder = async () => {
    if (!page?.nextBefore || busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const older = await api.history(roomId, token, search.trim(), page.nextBefore, controller.signal);
      if (!controller.signal.aborted) setPage({ entries: [...page.entries, ...older.entries], nextBefore: older.nextBefore });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load activity.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <div className="activity-log">
    <label htmlFor="activity-player">Search by player</label>
    <div className="activity-search">
      <input id="activity-player" type="search" maxLength={40} value={search}
        placeholder="Player or GM name" onChange={(e) => {
          request.current?.abort();
          setBusy(true);
          setSearch(e.target.value);
        }} />
      <button type="button" className="activity-refresh" aria-label="Refresh" title="Refresh"
        onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
        <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
    <p className="muted">Committed actions, newest first. Search uses names at the time of each action.</p>
    {seq > loadedSeq && <p role="status">New activity is available. Refresh to see it.</p>}
    {error && <p role="alert" className="error">{error} Try refreshing or loading older entries again.</p>}
    {busy && <p role="status">Loading activity…</p>}
    {page && page.entries.length === 0 && <p>No {search.trim() ? "matching " : ""}activity.</p>}
    <ol className="plain activity-entries" aria-busy={busy}>
      {page?.entries.map(({ committed, sentence }) => <li key={committed.seq}>
        <p>{sentence}</p>
        <small className="muted"><time dateTime={committed.at}>{new Date(committed.at).toLocaleString()}</time> · #{committed.seq}</small>
      </li>)}
    </ol>
    {page?.nextBefore && <button type="button" disabled={busy} onClick={() => void loadOlder()}>Load older</button>}
  </div>;
}
