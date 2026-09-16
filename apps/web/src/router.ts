import { useSyncExternalStore } from "react";

export type Route =
  | { page: "home" }
  | { page: "join"; inviteCode: string }
  | { page: "room"; roomId: string }
  | { page: "notFound" };

function parse(pathname: string): Route {
  if (pathname === "/") return { page: "home" };
  const join = pathname.match(/^\/join\/([^/]+)\/?$/);
  if (join) return { page: "join", inviteCode: decodeURIComponent(join[1]!) };
  const room = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (room) return { page: "room", roomId: decodeURIComponent(room[1]!) };
  return { page: "notFound" };
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((fn) => fn()));

export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  listeners.forEach((fn) => fn());
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => location.pathname,
  );
  return parse(pathname);
}
