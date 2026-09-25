/**
 * One-shot entrance for home page sections (client-render-performance).
 *
 * Replaces a scroll-driven `animation-timeline: view()`, which re-ran the animation on
 * every scroll frame over sections holding large blurred images. One shared observer,
 * no scroll listener: a section is marked once when it first comes into view and never
 * animates again. Without motion preference, or without JavaScript, the CSS leaves every
 * section visible (see `.reveal-pending` in styles.css).
 */

let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("revealed");
        observer!.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  return observer;
}

/** Ref callback: `<section ref={revealOnEnter}>`. */
export function revealOnEnter(el: HTMLElement | null) {
  if (!el || typeof IntersectionObserver === "undefined") return;
  el.classList.add("reveal-pending");
  shared().observe(el);
  return () => observer?.unobserve(el);
}
