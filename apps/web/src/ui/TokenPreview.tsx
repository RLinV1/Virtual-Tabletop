import { useState } from "react";

/**
 * A token image as the board will draw it (token-image-preview): a fixed circle filled with
 * the token's colour, the image centred with its short edge filling the diameter (the same
 * crop as `BoardView.fitTokenImage`), and dimmed like the board's hidden tokens. A failed
 * image leaves the colour disc, as on the board.
 */
export function TokenPreview({ url, color, hidden = false }: { url: string; color: string; hidden?: boolean }) {
  // The URL that failed, not a flag, so choosing another image tries again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={hidden ? "token-preview is-hidden" : "token-preview"} style={{ background: color }} aria-hidden="true">
      {failedUrl !== url && <img src={url} alt="" onError={() => setFailedUrl(url)} />}
    </span>
  );
}
