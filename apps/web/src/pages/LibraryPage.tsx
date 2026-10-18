import { GridFour, TextAa, Trash, X } from "@phosphor-icons/react";
import { IconAction } from "../ui/IconAction";
import { useEffect, useMemo, useState } from "react";
import { type AssetKind, type EncounterSummary, type LibraryAsset, type LibraryCreature } from "@vtt/shared";
import { Link } from "../Link";
import { api } from "../net/api";
import { builtinsMatching } from "../net/builtinAssets";
import { imageSize, nameFromFile } from "../net/imageFile";
import { Modal } from "../ui/Modal";
import { AccountMenu } from "../account/AccountPages";
import { RequireAccount } from "../account/RequireAccount";
import { LibraryMapEditor } from "./mapEditor/LibraryMapEditor";
import { AnimationsTab } from "./LibraryAnimations";
import { CreatureCard, CreatureForm } from "./LibraryCreatures";
import { EncounterCard } from "./LibraryEncounters";
import { LibraryPicker } from "./LibraryPicker";
import { startEncounterEdit } from "./encounterEdit/startEdit";
import { DiceLookCards, DiceLookModal, DiceSignInLine, SaveBrowserLooksOffer } from "./DiceLooks";
import { createDiceLook } from "../ui/diceSkinStore";

/**
 * Maps and token art are uploaded assets; creatures are reusable token setups (library-creatures);
 * dice are your dice looks, kept in this browser (dice-image-skins).
 */
type Tab = AssetKind | "creature" | "encounter" | "animation" | "dice";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "map", label: "Maps" },
  { tab: "token", label: "Token Art" },
  { tab: "creature", label: "Creatures" },
  { tab: "encounter", label: "Encounters" },
  { tab: "animation", label: "Animations" },
  { tab: "dice", label: "Dice" },
];

/** `/library?tab=dice` opens on the Dice tab: the room's Dice panel links there. */
const wantsDice = () => new URLSearchParams(location.search).get("tab") === "dice";

/**
 * The signed-in person's library, whether they host or only play (asset-library). It follows the
 * dashboard's entry rule (gm-dashboard): signed out goes to sign-in first.
 *
 * Dice looks are the exception: every player has dice, so the Dice tab opens on its own for a
 * signed-out browser, with the looks kept in that browser (dice-looks).
 */
export function LibraryPage() {
  const [diceOnly] = useState(wantsDice);
  return (
    <RequireAccount signedOut={diceOnly ? <DiceLibrary /> : undefined}>
      <Library />
    </RequireAccount>
  );
}

/** The Dice tab alone, for a player who isn't a GM here: the same toolbar, grid and editor. */
function DiceLibrary() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <main className="home gm-page">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
      </header>
      <h1>Dice looks</h1>
      <div className="library-toolbar">
        <input type="search" aria-label="Search by name" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" onClick={() => void createDiceLook().then(setEditing)}>
          New dice look
        </button>
      </div>
      <DiceSignInLine />
      <DiceLookCards query={query} onEdit={setEditing} />
      <DiceLookModal lookId={editing} onClose={() => setEditing(null)} />
    </main>
  );
}

/** The GM's maps, token art and creatures, managed before a session (asset-library, library-creatures). */
function Library() {
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [creatures, setCreatures] = useState<LibraryCreature[] | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>(() => (wantsDice() ? "dice" : "map"));
  const kind: AssetKind = tab === "map" ? "map" : "token";
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The creature open in the New/Edit form. */
  const [creatureTarget, setCreatureTarget] = useState<LibraryCreature | "new" | null>(null);
  /** The dice look open in its editor (dice-image-skins). */
  const [diceTarget, setDiceTarget] = useState<string | null>(null);
  /** The owned map whose grid is open in the editor. */
  const [gridTarget, setGridTarget] = useState<LibraryAsset | null>(null);
  /** New encounter: choosing its map (ADR 0033). */
  const [pickingEncounterMap, setPickingEncounterMap] = useState(false);
  /** The map a new encounter waits on while its grid is set up first. */
  const [encounterMapAwaitingGrid, setEncounterMapAwaitingGrid] = useState<string | null>(null);
  const [startingEncounter, setStartingEncounter] = useState(false);

  /** Opens a new encounter on one of the GM's maps in a temporary room; a map with no grid gets one first. */
  async function newEncounterOn(map: LibraryAsset) {
    setPickingEncounterMap(false);
    if (!map.grid) {
      setEncounterMapAwaitingGrid(map.id);
      setGridTarget(map);
      return;
    }
    setStartingEncounter(true);
    setError(null);
    try {
      await startEncounterEdit({ mapAssetId: map.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a new encounter");
      setStartingEncounter(false);
    }
  }

  useEffect(() => {
    let live = true;
    api.library.list().then(
      (list) => live && setAssets(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load the library"),
    );
    api.library.creatures.list().then(
      (list) => live && setCreatures(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load your creatures"),
    );
    api.library.encounters.list().then(
      (list) => live && setEncounters(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load your encounter templates"),
    );
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((a) => a.kind === kind && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, kind, query]);

  const builtins = useMemo(() => (tab === "creature" || tab === "encounter" || tab === "animation" || tab === "dice" || kind === "map" ? [] : builtinsMatching(kind, query)), [tab, kind, query]);

  const shownCreatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (creatures ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [creatures, query]);

  const shownEncounters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (encounters ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [encounters, query]);

  const replace = (next: LibraryAsset) => setAssets((all) => (all ?? []).map((a) => (a.id === next.id ? next : a)));

  return (
    <main className="home gm-page">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
        <nav className="home-nav">
          <Link href="/gm-dashboard">My rooms</Link>
          <AccountMenu />
        </nav>
      </header>
      <h1>Asset library</h1>
      {error && <p role="alert" className="error">{error}</p>}

      <div className="library-toolbar">
        <div role="tablist" aria-label="Asset type" className="tabs">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              aria-selected={tab === t.tab}
              className={tab === t.tab ? "tab active" : "tab"}
              onClick={() => {
                setTab(t.tab);
                // Keep the Dice tab in the address, so reloading or sharing lands back on it.
                history.replaceState(null, "", t.tab === "dice" ? "/library?tab=dice" : "/library");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search by name"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {tab === "dice" ? (
          <button type="button" onClick={() => void createDiceLook().then(setDiceTarget)}>New dice look</button>
        ) : tab === "creature" ? (
          <button type="button" onClick={() => setCreatureTarget("new")}>New creature</button>
        ) : tab === "encounter" ? (
          <button type="button" disabled={startingEncounter} onClick={() => setPickingEncounterMap(true)}>
            {startingEncounter ? "Opening…" : "New encounter"}
          </button>
        ) : tab === "animation" ? null : (
          <UploadButton
            kind={kind}
            onUploaded={(a) => {
              setAssets((all) => [a, ...(all ?? [])]);
              if (a.kind === "map" && !a.grid) setGridTarget(a);
            }}
            onError={setError}
          />
        )}
      </div>

      {tab === "dice" ? (
        <>
          <SaveBrowserLooksOffer />
          <DiceLookCards query={query} onEdit={setDiceTarget} />
        </>
      ) : tab === "animation" ? (
        <AnimationsTab query={query} onError={setError} />
      ) : tab === "encounter" ? (
        <>
          {!encounters && !error && <p className="muted" aria-busy="true">Loading…</p>}
          {encounters && shownEncounters.length === 0 && (
            <p className="muted">
              {query
                ? "None of your encounter templates match that search."
                : "You haven't saved any encounter templates yet. Use New encounter to place creatures and fog on one of your maps, or save a room you run from the Encounter templates section of its Manage tab."}
            </p>
          )}
          <ul className="plain asset-grid" role="tabpanel">
            {shownEncounters.map((encounter) => (
              <EncounterCard
                key={encounter.id}
                encounter={encounter}
                onChanged={(next) => setEncounters((all) => (all ?? []).map((e) => (e.id === next.id ? next : e)))}
                onDeleted={() => setEncounters((all) => (all ?? []).filter((e) => e.id !== encounter.id))}
              />
            ))}
          </ul>
        </>
      ) : tab === "creature" ? (
        <>
          {!creatures && !error && <p className="muted" aria-busy="true">Loading…</p>}
          {creatures && shownCreatures.length === 0 && (
            <p className="muted">
              {query
                ? "None of your creatures match that search."
                : "You haven't made any creatures yet. A creature saves a name, size, HP and AC, so you can place it from Add token without setting it up again."}
            </p>
          )}
          <ul className="plain asset-grid" role="tabpanel">
            {shownCreatures.map((creature) => (
                <CreatureCard
                  key={creature.id}
                  creature={creature}
                  onEdit={() => setCreatureTarget(creature)}
                  onDeleted={() => setCreatures((all) => (all ?? []).filter((c) => c.id !== creature.id))}
                />
              ))}
          </ul>
        </>
      ) : (
        <>
          {!assets && !error && <p className="muted" aria-busy="true">Loading…</p>}
          {assets && shown.length === 0 && (
            <p className="muted">
              {query
                ? "None of your uploads match that search."
                : `You haven't uploaded any ${kind === "map" ? "maps" : "token art"} yet. The ones below are ready to use.`}
            </p>
          )}
          <ul className="plain asset-grid" role="tabpanel">
            {shown.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onChanged={replace}
                  onEditGrid={() => setGridTarget(asset)}
                  onDeleted={() => {
                    setAssets((all) => (all ?? []).filter((a) => a.id !== asset.id));
                    // The server cleared the link; creatures that used this art are now colour discs.
                    setCreatures((all) => (all ?? []).map((c) => (c.imageAssetId === asset.id ? { ...c, imageAssetId: null, imageUrl: null } : c)));
                  }}
                />
              ))}
          </ul>
        </>
      )}

      {builtins.length > 0 && (
        <section className="builtin-assets" aria-labelledby="builtin-heading">
          <h2 id="builtin-heading">Included with the app</h2>
          <p className="muted">Every GM has these. Place them from “From library” in any room.</p>
          {kind === "token" && <p className="muted small-print">Hand-drawn portraits by The Battle for Wesnoth artists. <a href="/img/tokens/enemies/CREDITS.md" target="_blank" rel="noreferrer">Art credits and license</a></p>}
          <ul className="plain asset-grid">
            {builtins.map((asset) => (
              <BuiltinCard key={asset.id} asset={asset} />
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={creatureTarget !== null}
        title={creatureTarget === "new" ? "New creature" : "Edit creature"}
        onClose={() => setCreatureTarget(null)}
      >
        {creatureTarget !== null && (
          <CreatureForm
            key={creatureTarget === "new" ? "new" : creatureTarget.id}
            creature={creatureTarget === "new" ? null : creatureTarget}
            onCancel={() => setCreatureTarget(null)}
            onSaved={(saved) => {
              setCreatures((all) => [saved, ...(all ?? []).filter((c) => c.id !== saved.id)]);
              setCreatureTarget(null);
            }}
          />
        )}
      </Modal>

      <DiceLookModal lookId={diceTarget} onClose={() => setDiceTarget(null)} />

      <Modal open={pickingEncounterMap} title="Choose a map for the encounter" onClose={() => setPickingEncounterMap(false)}>
        {/* Only the GM's own maps: a template keeps its map by library id (ADR 0024). */}
        <LibraryPicker kind="map" includeBuiltins={false} onPick={(map) => void newEncounterOn(map)} />
      </Modal>
      <LibraryMapEditor
        asset={gridTarget}
        onSaved={(saved) => { replace(saved); setGridTarget(saved); }}
        onClose={(saved) => {
          setGridTarget(null);
          setEncounterMapAwaitingGrid(null);
          if (encounterMapAwaitingGrid === saved.id && saved.grid) void newEncounterOn(saved);
        }}
      />
    </main>
  );
}

/** A built-in asset: the same card, without Rename or Delete (builtin-library-assets). */
function BuiltinCard({ asset }: { asset: LibraryAsset }) {
  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        <img src={asset.url} alt="" loading="lazy" decoding="async" />
      </div>
      <strong className="asset-name" title={asset.name}>
        {asset.name}
      </strong>
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && ` · ${asset.grid.cellSize}px grid`}
      </span>
    </li>
  );
}

function UploadButton(props: {
  kind: AssetKind;
  onUploaded: (asset: LibraryAsset) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    props.onError(null);
    try {
      const { width, height } = await imageSize(file);
      props.onUploaded(await api.library.upload(file, { kind: props.kind, name: nameFromFile(file), width, height }));
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="upload-button">
      <span>{busy ? "Uploading…" : props.kind === "map" ? "Upload map" : "Upload token art"}</span>
      <input
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

type DeleteState =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "confirm"; rooms: { id: string; name: string }[]; creatures: { id: string; name: string }[]; encounters: { id: string; name: string }[] }
  | { step: "deleting" };

function AssetCard(props: {
  asset: LibraryAsset;
  onChanged: (asset: LibraryAsset) => void;
  onEditGrid: () => void;
  onDeleted: () => void;
}) {
  const { asset } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [del, setDel] = useState<DeleteState>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) return setEditing(false);
    try {
      props.onChanged(await api.library.update(asset.id, { name: trimmed }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function startDelete() {
    setError(null);
    setDel({ step: "checking" });
    try {
      // Ask the server who uses it now, so the warning is never stale (asset-library).
      const { rooms, creatures, encounters } = await api.library.usage(asset.id);
      setDel({ step: "confirm", rooms, creatures, encounters });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check where this is used");
      setDel({ step: "idle" });
    }
  }

  async function confirmDelete() {
    setDel({ step: "deleting" });
    try {
      await api.library.remove(asset.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDel({ step: "idle" });
    }
  }

  const standIn = asset.kind === "map" ? "a blank map of the same size" : "a plain coloured token";

  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        <img src={asset.url} alt="" loading="lazy" />
      </div>
      {editing ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <input aria-label="Name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="small">
            Save
          </button>
        </form>
      ) : (
        <strong className="asset-name" title={asset.name}>
          {asset.name}
        </strong>
      )}
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && ` · ${asset.grid.cellSize}px grid`}
      </span>
      {error && <p role="alert" className="error">{error}</p>}

      {del.step === "confirm" ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${asset.name}?`}>
          {del.rooms.length > 0 && (
            <p>
              Used in {del.rooms.length === 1 ? "1 room" : `${del.rooms.length} rooms`}:{" "}
              <strong>{del.rooms.map((r) => r.name || "Untitled room").join(", ")}</strong>. They will show {standIn} instead.
            </p>
          )}
          {del.creatures.length > 0 && (
            <p>
              Used by {del.creatures.length === 1 ? "1 creature" : `${del.creatures.length} creatures`}:{" "}
              <strong>{del.creatures.map((c) => c.name).join(", ")}</strong>. {del.creatures.length === 1 ? "It" : "They"} will lose {del.creatures.length === 1 ? "its" : "their"} image.
            </p>
          )}
          {del.encounters.length > 0 && (
            <p>
              Used by {del.encounters.length === 1 ? "1 encounter template" : `${del.encounters.length} encounter templates`}:{" "}
              <strong>{del.encounters.map((e) => e.name).join(", ")}</strong>. {del.encounters.length === 1 ? "It" : "They"} can't be used until saved again with another map.
            </p>
          )}
          {del.rooms.length === 0 && del.creatures.length === 0 && del.encounters.length === 0 && <p>Delete “{asset.name}”? This can't be undone.</p>}
          <div className="row">
            <button type="button" className="secondary small" onClick={() => setDel({ step: "idle" })}>
              Cancel
            </button>
            <button type="button" className="small danger-fill" onClick={() => void confirmDelete()}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <IconAction icon={editing ? <X size={16} aria-hidden="true" /> : <TextAa size={16} aria-hidden="true" />} label={editing ? "Cancel" : "Rename"} onClick={() => setEditing(!editing)} />
          {asset.kind === "map" && <IconAction icon={<GridFour size={16} aria-hidden="true" />} label="Edit grid" onClick={props.onEditGrid} />}
          <IconAction
            icon={<Trash size={16} aria-hidden="true" />}
            label={del.step === "checking" ? "Checking…" : del.step === "deleting" ? "Deleting…" : "Delete"}
            danger
            disabled={del.step !== "idle"}
            onClick={() => void startDelete()}
          />
        </div>
      )}
    </li>
  );
}
