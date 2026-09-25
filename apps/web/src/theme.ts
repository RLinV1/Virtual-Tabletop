import { useEffect, useState } from "react";

/**
 * Light or dark ground, for the home page only (DESIGN.md §11.9: density and treatment
 * vary by layer). The table at /r/:roomId stays dark, because the board is a lit surface
 * and Pixi renders against it.
 *
 * The attribute goes on <html> so the page background follows it, and the effect removes
 * it on unmount — otherwise navigating to a room would carry a light ground into the table.
 */
export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "vtt.theme";
const CHOICES: ThemeChoice[] = ["auto", "light", "dark"];

export function loadThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    return CHOICES.includes(raw as ThemeChoice) ? (raw as ThemeChoice) : "auto";
  } catch {
    // Storage unavailable (private mode): follow the system for this page load.
    return "auto";
  }
}

function saveThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* ignore */
  }
}

const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

/** The choice, a setter, and what that choice resolves to right now. */
export function useGroundTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice);
  const [system, setSystem] = useState<"light" | "dark">(() => (lightQuery().matches ? "light" : "dark"));

  useEffect(() => {
    const mq = lightQuery();
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = choice === "auto" ? system : choice;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [resolved]);

  function choose(next: ThemeChoice) {
    setChoice(next);
    saveThemeChoice(next);
  }

  return { choice, choose, resolved };
}
