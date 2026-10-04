import { useEffect, useSyncExternalStore } from "react";
import { DIE_NAMES, type DiceLookOnTable, type RoomState } from "@vtt/shared";
import { skinLayoutFor, type DiceSkin } from "./diceSkin";
import { isBoolean, readStored, writeStored, type KeyValueStorage } from "./usePersistentState";

/**
 * Dice looks on the table (shared-dice-looks, ADR 0018): each participant's look comes with the
 * room's state, and every viewer draws that participant's public rolls in it.
 */

/** A table look as `Die3D` draws one. */
export function tableSkin(look: DiceLookOnTable): DiceSkin {
  const images: DiceSkin["images"] = {};
  for (const die of DIE_NAMES) {
    const face = look.faces[die];
    const layout = face && skinLayoutFor(face.width, face.height);
    if (face && layout) images[die] = { href: face.url, width: face.width, height: face.height, layout };
  }
  return { id: look.lookId, name: "", updatedAt: look.version, images };
}

// ---------- pictures, loaded before a roll needs them ----------

type PictureState = "loading" | "ok" | "failed";
const pictures = new Map<string, PictureState>();
const listeners = new Set<() => void>();
let version = 0;

function settle(href: string, state: PictureState) {
  pictures.set(href, state);
  version++;
  listeners.forEach((fn) => fn());
}

/** Starts loading a picture once; data URLs (this browser's own looks) need no loading. */
function preload(href: string) {
  if (href.startsWith("data:") || pictures.has(href) || typeof Image === "undefined") return;
  pictures.set(href, "loading");
  const img = new Image();
  img.onload = () => settle(href, "ok");
  img.onerror = () => settle(href, "failed");
  img.src = href;
}

/**
 * The look with only the pictures that have loaded: a die whose picture is still loading, or
 * failed (deleted by its owner, say), is drawn classic rather than with a blank face.
 */
export function readySkin(skin: DiceSkin | null): DiceSkin | null {
  if (!skin) return null;
  const images: DiceSkin["images"] = {};
  for (const die of DIE_NAMES) {
    const image = skin.images[die];
    if (!image) continue;
    preload(image.href);
    if (image.href.startsWith("data:") || pictures.get(image.href) === "ok") images[die] = image;
  }
  return Object.keys(images).length > 0 ? { ...skin, images } : null;
}

/** Loads every table look's pictures as soon as it arrives, so the first roll in it is ready. */
export function usePreloadTableLooks(state: RoomState | null) {
  useEffect(() => {
    for (const p of Object.values(state?.participants ?? {})) {
      for (const face of Object.values(p.diceLook?.faces ?? {})) preload(face.url);
    }
  }, [state?.participants]);
  // Re-render when a picture settles, so what is drawn next uses it.
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => version,
  );
}

// ---------- the viewer's choice to see other players' looks ----------

const SHOW_OTHERS_KEY = "vtt.showOthersDice";
let showOthers = readStored(storage(), SHOW_OTHERS_KEY, true, isBoolean);
const showOthersListeners = new Set<() => void>();

function storage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Each viewer's own choice to see other players' dice looks, or classic dice for everyone else.
 * One value for the whole page: the Dice panel sets it and the room's rolls read it.
 */
export function useShowOthersDice(): readonly [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (fn) => {
      showOthersListeners.add(fn);
      return () => showOthersListeners.delete(fn);
    },
    () => showOthers,
    () => showOthers,
  );
  return [value, setShowOthersDice] as const;
}

function setShowOthersDice(next: boolean) {
  showOthers = next;
  writeStored(storage(), SHOW_OTHERS_KEY, next);
  showOthersListeners.forEach((fn) => fn());
}
