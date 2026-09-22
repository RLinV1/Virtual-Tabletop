import type { ReactNode } from "react";
import { navigate } from "../router";

/**
 * The top bar for the entry layer (DESIGN.md §11.3).
 *
 * Product name on the left, the auth pair on the right, and nothing else — a product with
 * three pages does not need a navigation menu. The table deliberately does not use this:
 * there the board owns the viewport and there is nowhere to navigate to.
 */
export function SiteChrome({ children, active }: { children: ReactNode; active?: "login" | "signup" }) {
  return (
    <div className="site">
      <header className="site-bar">
        <a
          className="site-name"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          Virtual Tabletop
        </a>
        <nav className="site-nav" aria-label="Account">
          <a
            className={active === "login" ? "site-link current" : "site-link"}
            href="/login"
            aria-current={active === "login" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("/login");
            }}
          >
            Log in
          </a>
          <a
            className={active === "signup" ? "site-link current" : "site-link"}
            href="/signup"
            aria-current={active === "signup" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("/signup");
            }}
          >
            Sign up
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}

/**
 * Says plainly that a surface has no backend yet, instead of a button that silently does
 * nothing. Prototypes that fake success are harder to reason about than ones that admit
 * what is missing.
 */
export function NotBuiltYet({ ticket, children }: { ticket: string; children: ReactNode }) {
  return (
    <p className="not-built" role="note">
      <span className="not-built-tag">Not built yet</span>
      {children} <span className="muted">({ticket})</span>
    </p>
  );
}
