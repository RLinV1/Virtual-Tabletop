import { useEffect, useRef, useState } from "react";
import { api } from "../net/api";
import { loadCredentials, saveCredentials } from "../net/identity";
import { Modal } from "./Modal";

/**
 * The GM's Share button in the panel header. One click copies the invite link; there is no
 * popover to open first. Rendered only for the GM, who is the only one holding an invite code.
 *
 * The code is read from the server on each click, not from this browser's cache, so a reset
 * made in another tab or device is what gets copied (FR-GM-20). Beside it, "Reset link"
 * replaces the code so a leaked link stops admitting anyone new.
 */
export function ShareButton({ roomId, token }: { roomId: string; token: string }) {
  const [result, setResult] = useState<"copied" | "failed" | "reset" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (value: typeof result) => {
    setResult(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 1500);
  };

  /** Keeps this browser's cached code current, so it still recognises the link as the GM's. */
  const remember = (inviteCode: string) => {
    const creds = loadCredentials(roomId);
    if (creds && creds.inviteCode !== inviteCode) saveCredentials({ ...creds, inviteCode });
  };

  const copy = async () => {
    let url: string;
    try {
      const { inviteCode } = await api.getInvite(roomId, token);
      remember(inviteCode);
      url = `${location.origin}/join/${inviteCode}`;
    } catch {
      return flash("failed");
    }
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ok = legacyCopy(url);
    }
    flash(ok ? "copied" : "failed");
  };

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const { inviteCode } = await api.resetInvite(roomId, token);
      remember(inviteCode);
      setConfirming(false);
      flash("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the link");
    } finally {
      setBusy(false);
    }
  }

  const label =
    result === "copied" ? "Copied" : result === "failed" ? "Copy failed" : result === "reset" ? "Link reset" : "Share";

  return (
    <div className="share-group" data-tour="share">
      <button
        type="button"
        className="share-button"
        title="Copy the invite link"
        aria-label="Copy invite link. Anyone with it can join as a player."
        onClick={() => void copy()}
      >
        {label}
      </button>
      <button type="button" className="link share-reset" onClick={() => setConfirming(true)}>
        Reset link
      </button>
      <span className="sr-only" role="status">
        {result === "copied"
          ? "Invite link copied"
          : result === "failed"
            ? "Couldn't copy the invite link"
            : result === "reset"
              ? "Invite link reset. The old link no longer works."
              : ""}
      </span>
      <Modal
        open={confirming}
        title="Reset the invite link?"
        onClose={() => !busy && (setConfirming(false), setError(null))}
        initialFocus={cancelRef}
      >
        <div className="leave-confirm">
          <p>The current link stops working straight away. Anyone who opens it sees "Invite not found".</p>
          <p className="muted">
            Everyone already in the room stays connected and can come back as usual. Share the new link with anyone
            who still needs to join.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={cancelRef} type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="danger-fill" onClick={() => void reset()} disabled={busy}>
              {busy ? "Resetting…" : "Reset link"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Fallback for when the async clipboard API is unavailable (e.g. plain http on a LAN address). */
function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
