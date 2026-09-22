import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "./router";

/** In-app link: a real <a> (middle-click, copy link) that navigates without a reload. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
