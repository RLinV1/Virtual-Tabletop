import type { NextFunction, Request, RequestHandler, Response } from "express";
import { clearSessionCookie, readSessionCookie, type Sessions, type SignedIn } from "./sessions";

/**
 * Resolves the session cookie once per request (ADR 0017 C1). The result, or null, is on
 * `res.locals.signedIn` for every later handler. A cookie whose session has ended is cleared in
 * the response, so the browser stops sending it.
 */
export function attachAccount(sessions: Sessions): RequestHandler {
  return (req, res, next) => {
    res.locals.signedIn = null;
    const token = readSessionCookie(req.headers.cookie, sessions.cookie);
    if (!token) return next();
    sessions
      .resolve(token)
      .then((signedIn) => {
        if (signedIn) res.locals.signedIn = signedIn;
        else res.append("Set-Cookie", clearSessionCookie(sessions.cookie));
        next();
      })
      .catch(next);
  };
}

/** The signed-in account for this request, or null. */
export function signedIn(res: Response): SignedIn | null {
  return (res.locals.signedIn as SignedIn | null | undefined) ?? null;
}

/** Answers 401 and returns null when nobody is signed in. */
export function requireAccount(res: Response): SignedIn | null {
  const account = signedIn(res);
  if (!account) res.status(401).json({ error: "Sign in to do that" });
  return account;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The second layer behind `SameSite=Lax` (ADR 0017 I3). A request that changes state and carries
 * the session cookie must come from the app itself: its `Origin` names the host it was sent to,
 * or one listed in `CLIENT_ORIGIN`. Comparing with `Host` is what lets phones on the LAN through
 * Vite's proxy, which keeps the browser's `Host`. With no `Origin`, a browser's
 * `Sec-Fetch-Site: cross-site` still refuses it; other clients never hold the cookie.
 */
export function requireSameOrigin(sessions: Sessions, allowedOrigins: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!readSessionCookie(req.headers.cookie, sessions.cookie)) return next();
    const origin = req.headers.origin;
    if (origin) {
      if (allowedOrigins.includes(origin) || hostOf(origin) === req.headers.host) return next();
    } else if (req.headers["sec-fetch-site"] !== "cross-site") {
      return next();
    }
    res.status(403).json({ error: "This request didn't come from the app" });
  };
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
