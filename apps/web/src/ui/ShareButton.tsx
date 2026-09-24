import { useRef, useState } from "react";
import { PopoverButton } from "./Popover";

/**
 * The GM's invite link, behind a Share button in the panel header (room-sidebar-layout:
 * Share invite from the header). Rendered only for the GM, who is the only one holding an
 * invite code.
 */
export function ShareButton({ inviteCode }: { inviteCode: string }) {
  const url = `${location.origin}/join/${inviteCode}`;
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  return (
    <PopoverButton label="Share room" title="Invite players" align="right" className="share-button" tourId="share" buttonContent="Share">
      <div className="share-panel">
        <label htmlFor="invite-link">Anyone with this link can join as a player.</label>
        <div className="row">
          <input id="invite-link" ref={fieldRef} readOnly value={url} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard blocked: select the text so Ctrl+C works.
                fieldRef.current?.select();
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </PopoverButton>
  );
}
