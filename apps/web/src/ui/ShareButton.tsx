import { useEffect, useRef, useState } from "react";

/**
 * The GM's Share button in the panel header. One click copies the invite link; there is no
 * popover to open first. Rendered only for the GM, who is the only one holding an invite code.
 */
export function ShareButton({ inviteCode }: { inviteCode: string }) {
  const url = `${location.origin}/join/${inviteCode}`;
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      ok = legacyCopy(url);
    }
    setResult(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 1500);
  };

  return (
    <div data-tour="share">
      <button
        type="button"
        className="share-button"
        title={`Copy invite link: ${url}`}
        aria-label="Copy invite link. Anyone with it can join as a player."
        onClick={copy}
      >
        {result === "copied" ? "Copied" : result === "failed" ? "Copy failed" : "Share"}
      </button>
      <span className="sr-only" role="status">
        {result === "copied" ? "Invite link copied" : result === "failed" ? "Couldn't copy the invite link" : ""}
      </span>
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
