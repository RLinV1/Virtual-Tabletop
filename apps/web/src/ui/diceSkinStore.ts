import { useSyncExternalStore } from "react";
import type { BodyName } from "./diceGeometry";
import { keptSize, MAX_SKIN_FILE_BYTES, SHEET, SKIN_FILE_TYPES, skinLayoutFor, templateSvg, type DiceSkin, type DiceSkinImage } from "./diceSkin";

/**
 * This viewer's dice looks (dice-image-skins): made in the asset library's Dice tab, picked in
 * the room's Dice panel. They live in this browser only, so nobody else sees them yet.
 *
 * Pictures are kept in IndexedDB, which has room for several; which look is in use is a small
 * localStorage value. Other tabs hear about every change, so a look saved in the library shows
 * up in an open room at once. Without IndexedDB (a private window, say) looks last the visit.
 */
const DB_NAME = "vtt-dice-looks";
const STORE = "looks";
const ACTIVE_KEY = "vtt.diceLook.active";
/** Where the one-skin prototype kept its d6 picture; moved into a look on first load. */
const LEGACY_KEY = "vtt.diceSkin.d6";

interface State {
  looks: DiceSkin[];
  activeId: string | null;
  ready: boolean;
}

let state: State = { looks: [], activeId: readActiveId(), ready: false };
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DB_NAME);
channel?.addEventListener("message", () => void reload());

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

// ---------- IndexedDB ----------

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const request = work(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Only pictures this app re-encoded are ever shown. */
function isLook(value: unknown): value is DiceSkin {
  const look = value as DiceSkin;
  return (
    !!look &&
    typeof look.id === "string" &&
    typeof look.name === "string" &&
    typeof look.images === "object" &&
    Object.values(look.images).every((i) => !!i && typeof i.href === "string" && i.href.startsWith("data:image/") && skinLayoutFor(i.width, i.height) === i.layout)
  );
}

async function reload() {
  try {
    await migrateLegacy();
    const all = (await run("readonly", (s) => s.getAll())).filter(isLook);
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ looks: all, activeId: readActiveId(), ready: true });
  } catch {
    // No IndexedDB: keep whatever this visit made.
    set({ activeId: readActiveId(), ready: true });
  }
}

let migration: Promise<void> | null = null;

/** Once per page; see `moveLegacy`. */
function migrateLegacy(): Promise<void> {
  migration ??= moveLegacy();
  return migration;
}

async function moveLegacy() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
    // Taken before anything waits, so another tab loading at the same moment can't move it too.
    if (raw) localStorage.removeItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const old = JSON.parse(raw) as DiceSkinImage & { name?: string };
    const look: DiceSkin = { id: crypto.randomUUID(), name: "My d6 look", updatedAt: Date.now(), images: { d6: { href: old.href, width: old.width, height: old.height, layout: old.layout } } };
    if (isLook(look)) {
      await run("readwrite", (s) => s.put(look));
      if (!readActiveId()) writeActiveId(look.id);
    }
  } catch {
    // Unreadable: drop it.
  }
}

function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage blocked: the choice lasts this visit.
  }
}

void reload();

// ---------- the API ----------

export function useDiceLooks(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** The look in use, for drawing your own dice; null for the classic dice. */
export function useActiveDiceLook(): DiceSkin | null {
  const { looks, activeId } = useDiceLooks();
  return looks.find((l) => l.id === activeId) ?? null;
}

export function newDiceLook(name: string): DiceSkin {
  return { id: crypto.randomUUID(), name, updatedAt: Date.now(), images: {} };
}

/** Makes an empty look named "Dice look N" (the first free N) and returns its id. */
export async function createDiceLook(): Promise<string> {
  const names = new Set(state.looks.map((l) => l.name));
  let n = state.looks.length + 1;
  while (names.has(`Dice look ${n}`)) n++;
  const look = newDiceLook(`Dice look ${n}`);
  await saveDiceLook(look);
  return look.id;
}

export async function saveDiceLook(look: DiceSkin) {
  const saved = { ...look, updatedAt: Date.now() };
  set({ looks: [saved, ...state.looks.filter((l) => l.id !== saved.id)] });
  try {
    await run("readwrite", (s) => s.put(saved));
  } catch {
    // Kept for this visit only.
  }
  channel?.postMessage("changed");
}

export async function deleteDiceLook(id: string) {
  set({ looks: state.looks.filter((l) => l.id !== id) });
  if (state.activeId === id) setActiveDiceLook(null);
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    // Nothing stored to delete.
  }
  channel?.postMessage("changed");
}

export function setActiveDiceLook(id: string | null) {
  writeActiveId(id);
  set({ activeId: id });
  channel?.postMessage("changed");
}

/**
 * Turns an uploaded file into a die's picture, or says why it can't be one: a painted template
 * (3:2, like every template) or one square picture for every face. It is drawn onto a canvas and
 * re-encoded, so only plain pixels are kept, at no more than the size it needs.
 */
export async function readSkinFile(file: File): Promise<DiceSkinImage | string> {
  if (!(SKIN_FILE_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG or WebP picture";
  if (file.size > MAX_SKIN_FILE_BYTES) return "That picture is over 5 MB";
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "That picture couldn't be read";
  }
  const layout = skinLayoutFor(bitmap.width, bitmap.height);
  if (!layout) {
    bitmap.close();
    return `Use a painted template (${SHEET.width} × ${SHEET.height}, or the same 3:2 shape) or a square picture`;
  }
  const size = keptSize(bitmap.width, bitmap.height, layout);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  // WebP where the browser can write it; toDataURL falls back to PNG where it can't.
  return { href: canvas.toDataURL("image/webp", 0.9), width: size.width, height: size.height, layout };
}

/** The die's template as a PNG. */
async function templatePng(name: BodyName): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([templateSvg(name)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SHEET.width;
    canvas.height = SHEET.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The template couldn't be drawn");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function save(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Puts the die's template on the clipboard as an image, ready to paste into an image AI. Call it
 * straight from the click: browsers only allow clipboard writes during one. Where the clipboard
 * won't take an image, the template is saved as a file instead.
 */
export async function copyTemplate(name: BodyName): Promise<"copied" | "saved"> {
  const png = templatePng(name);
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("No image clipboard");
    // The item takes the promise, so the write starts inside the click.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "copied";
  } catch {
    save(await png, `${name}-skin-template.png`);
    return "saved";
  }
}

/** Puts text on the clipboard; false where the browser won't allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
