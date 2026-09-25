# Proposal

## Why

The asset library is a GM tool, but it is reachable two ways that bypass the GM flow:
- the home page's "Keep your maps for next time." section has an **Open the asset library** button;
- `/library` opens for anyone who types or bookmarks it.

The `gm-dashboard` change established one rule for entering GM surfaces: a recognised browser goes straight in, and any other goes to sign-in first. The library does not follow it. That matters now, and will matter more when accounts arrive and "Continue as guest" is removed, because the library would stay one URL away from anyone.

## What Changes

- **The home page's "Open the asset library" button is removed.** The GM dashboard's **Asset library** link becomes the only way into the library from the app.
- **`/library` follows the dashboard's entry rule.** A recognised browser (one that holds a GM identity or chose to continue as a guest) opens it as before. Any other browser is taken to the sign-in page first, with the history entry replaced so Back does not loop. Continuing as a guest from there opens the dashboard, as it does today.
- **The home page's library note points to the dashboard:** "You'll find it on your GM dashboard. No sign-in needed: it's saved in this browser until accounts arrive, so it won't follow you to another computer or phone yet."

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gm-dashboard`: the entry rule, until now stated for the dashboard only, applies to the asset library as well.

## Impact

- **apps/web:**
  - `pages/HomePage.tsx`: the button is removed and the note reworded;
  - `pages/LibraryPage.tsx`: the entry-rule redirect is added, reusing `isRecognised()` from `net/identity.ts`;
  - `styles.css`: only if the section's bottom row needs adjusting once the button is gone.
- **Specs not changed, and why:**
  - `gm-home`: its rule that the page must say the library is saved in this browser still applies, because the section still promotes the library, and the new note meets it;
  - `asset-library`: its "browsing without an identity shows an empty library" rule still holds for a guest who has not uploaded anything.
- **No server changes.** Library data is already GM-only and scoped to its owner on the server; this change is about where the page can be opened from, not who can read what.
