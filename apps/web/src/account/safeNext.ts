/** Where sign-in and sign-up go when they have no usable `next`. */
export const DEFAULT_NEXT = "/gm-dashboard";

/**
 * The `next` destination for sign-in and sign-up, only when it is a path on this site
 * (gm-home: Account screens). Anything that could leave the site (`https://…`, `//host`, `/\host`,
 * `javascript:`) falls back to the dashboard.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_NEXT;
  try {
    const url = new URL(raw, "http://same.invalid");
    if (url.origin !== "http://same.invalid") return DEFAULT_NEXT;
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT_NEXT;
  }
}

/** The sign-in URL that comes back to `path` afterwards. */
export const signInFor = (path: string) => `/signin?next=${encodeURIComponent(path)}`;
