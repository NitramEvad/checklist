# CLAUDE.md — FlightDeck Checklist

Guidance for working on this repo in a Claude Code session. Read this first.

## What this is

A single-page web app used as a **website widget inside XCTrack** (paragliding
flight software) on a **landscape Samsung S22 Ultra** flight deck. The widget
takes ~2/3 of the screen width; XCTrack's own widgets fill the rest. It is a
cockpit-display-style (EICAS/ECAM-inspired) UI, driven by big glove-friendly
keys.

- **Live site:** https://nitramevad.github.io/checklist/ (GitHub Pages)
- **Repo:** `NitramEvad/checklist`
- **Owner/pilot flies in England (feet) and continental Europe (metres).**

## Architecture

Plain **HTML/CSS/JS PWA — no build step, no dependencies, no framework.** Just
static files served over HTTPS. Everything is client-side and works offline via
a service worker. Do not add a bundler/framework.

### File map
- `index.html` — shell: `<header>` title bar (`#pgnum` page box, `#title`,
  `#prog` progress, `#memo` annunciator, `#hkey` page key), `<main>` =
  `#col` (`#content` + the `#dataline` footer) beside the `#rail` of keys.
- `css/style.css` — all styling. Design rules are in the header comment; theme
  vars at the top (`--grn/--amb/--cyn/--red`, `--sans/--mono`) plus
  `--cam-inset` (left margin to clear the phone camera, px, not scaled).
- `fonts/` — B612 + B612 Mono (400/700, latin woff2), self-hosted so they work
  offline. SIL OFL 1.1 (`fonts/OFL.txt`). Precached by the service worker.
- `js/checklists.js` — **user-editable content**: `CHECKLISTS` array (the
  pages), `NOTES_DEFAULT` (music-page notes seed) and `QUICKPLAY_DEFAULT`
  (quick-start playlist seed). The pilot edits this file often, sometimes
  directly on `main` (see Git workflow).
- `js/app.js` — all app logic (IIFE). Pages, rendering, state, live readings,
  annunciator, flight data, sunset, synoptic, music panel, service-worker
  registration, force-update.
- `js/spotify.js` — Spotify Web API client (Auth Code + PKCE, no server/secret).
- `js/version.js` — build stamp. The repo copy says `dev`; the deploy workflow
  overwrites it with date + short SHA. Shown in the STATUS page's data line
  (`#build`), so the pilot (and you) can always tell which build the phone runs.
- `sw.js` — service worker (network-first, revalidating). Bump `CACHE_VERSION`
  only to force a hard cache drop; not needed for normal edits. **Any new
  static file the app needs offline must be added to its `ASSETS` list** (a
  missing file there fails the whole install).
- `manifest.webmanifest`, `icon.svg` — PWA bits.
- `.github/workflows/deploy-pages.yml` — deploys to Pages on push to `main`.

## Design language — keep to this

The pilot chose this look deliberately (from mockups). When adding anything:

- **Black ground, hairline dividers (`--line`), square keys** (4px radius,
  2px border). No rounded cards, no gradients, no filled panels.
- **Type:** B612 for titles/keys/labels, B612 Mono for list rows and values;
  capitals everywhere (checklist text is upper-cased by CSS, so the pilot can
  type it any way in `checklists.js`). Clock-style readouts (`#clock`,
  `#dLocal`…) use B612, not Mono: same fixed-width digits but a narrow colon
  (the mono colon reads as "13: 34"). Notes use B612 for the same reason
  ("143.725" must not read "143. 725").
- **Colour is meaning, never decoration:**
  cyan = to do / pilot-selected · green = done / normal · white = titles and
  the cursor · amber = caution · red = warning · grey (`--dim`, `--keyb`) =
  labels, inactive, **no data**. The cursor is a *white* box — never amber.
  A missing reading is a grey dash (`setVal()` / `.nodata`), never green.
  Forecast values we don't judge (wind) are white.
- **No emoji or symbol glyphs** (⏯ ▲ ⚙ ✓…): they render tiny and vary by
  handset, and B612 lacks most of them. Use the inline SVGs in `ICON`
  (app.js) / index.html.
- **One scale factor.** Everything is sized in `rem`; `html { font-size }` is
  derived from the widget (designed at 650×450 = 16px, `min(vh, vw)` based),
  so the layout shrinks/grows in proportion. Size new things in rem (borders
  and `--cam-inset` stay px).
- **Annunciator (`#memo`), one message, on every page**, by priority:
  `warn` red box (ON BATT) › `caution` amber box (BATT LOW) › `advisory`
  amber (OFFLINE) › `memo` green (KEEP AWAKE running). Add new conditions in
  `annunciations()`; keep it to things the pilot must know on any page.
- **Mode toggles state their CURRENT mode**, not the action (lamp + ON/OFF,
  toast "… NOW ON/OFF" in the same words). Tags beside tile labels do the
  same (AUTO/MAN, RUNNING/PAUSED, FCST/OLD).

## Key concepts

### Pages & navigation
`pages` = N checklist pages (from `CHECKLISTS`) + `STATUS` + `FLIGHT DATA` +
`SYSTEMS` + `MUSIC`. **Checklists must stay first in the array**: ticks are
saved by page index, so inserting anything ahead of them would discard them.
The rail's ▲/▼ (`#btnUp`/`#btnDown`) cycle pages (wrap around). The data line
shows a square per page (square = checklist, fills green when complete; round
= other page; the current one is larger with a white edge). `state` (page,
per-page checks, timer) is in `localStorage` (`pfc.state.v1`).

The rail's two middle keys (`#btnCheck`, `#btnAdv`) are relabelled per page by
`renderRail()`: CHECK + ADV on a checklist, GO TO + UPDATE on STATUS,
NOTES/LIST on MUSIC, hidden elsewhere. The title-bar key (`#hkey`) is RESET on
a checklist and RESET ALL on STATUS.

### Checklist items & the CHECK/ADV rail
Each item in `CHECKLISTS[n].items` is one of:
- `"Plain text"`
- `["Challenge", "RESPONSE"]` → `CHALLENGE ···· RESPONSE`
- `["Challenge", "RESPONSE", "live"]` → adds a live phone reading. `""` response
  is allowed (shows just the live value). Live keys: `battery` (red <30%,
  amber <90%, green ≥90%), `charging` (green CHG / red ON BATT — the pilot
  asked for red), `qnh` (green automatic, cyan hand-set).
- Rows: cyan = to do, green + tick = done, white box + ▶ = cursor. Every row
  has the same box model (the cursor only colours the border) so text never
  shifts. Rows share the height up to a max, so short lists sit at the top.
- **CHECK** ticks the active item and advances to the next unchecked one;
  when a page completes it auto-advances after 0.9 s — the last checklist
  advances to STATUS. **ADV** skips to the next unchecked item without
  ticking, crossing into the next page's first unchecked item (a real
  per-page cursor, `cursors[]`, drives this).
- A title like `"3 · X4"` is split by `splitTitle()` into the boxed page
  number and the name; titles without a leading number work too.

### STATUS page
All checklists on one screen with progress (`renderStatus`), the cursor on the
first open one, and a banner: amber `NOT READY · n CHECKLISTS OPEN` or green
`ALL CHECKLISTS COMPLETE`. GO TO → first open checklist; tapping a row opens
it. RESET ALL (title bar) and UPDATE (`forceRefresh`, rail) live here, and the
data line shows the BUILD stamp instead of page squares.

### FLIGHT DATA page
2 × 3 tiles divided by hairlines. Each tile: white label + cyan tag, big
value + cyan unit, one supporting line.
- **TIME** (local, small seconds; UTC below). **TIMER**: tap the tile to
  start/pause, `RST` key clears (white digits when not running).
- **ALT GPS**: tap to cycle units AUTO→M→FT (`AltUnit`, saved). AUTO = feet
  in UK/US bounding boxes, metres elsewhere, from GPS.
- **SUNSET** (`sunTimes()`, computed on-device from the last known position
  `Pos` — no network). DAYLIGHT: amber in the last hour, red NIGHT after.
- **QNH | TEMP**: phones don't expose these, so they come from **open-meteo**
  (free, keyless) by GPS, cached offline (`Weather`). Tap QNH to hand-set it
  (cyan, tag MAN).
- **WIND**: forecast surface wind + gust from the same call, white, tag FCST
  (amber OLD past 90 min). Tap to cycle KM/H→MPH→KT (`WindUnit`). **No
  green/amber thresholds on wind** — limits are the pilot's call; ask before
  adding any.

### SYSTEMS page
A synoptic (`renderSystems` / `updateSystems`): PWR BANK → PHONE BATT, then
NET / GPS / SPOTIFY. Cards are placed in % and the lines drawn in an SVG with
the same 552×370 coordinates (`preserveAspectRatio="none"`,
`vector-effect: non-scaling-stroke`), so they stay joined at any size — keep
the two in step if you move anything. State classes: none = green, `off` =
amber dashed, `bad` = red dashed, `unk` = grey. The phone can't see the power
bank, only whether it is charging, so that card reports supply, not a level.
GPS is watched only while FLIGHT DATA or SYSTEMS is showing.

### MUSIC page
Grid: transport column (prev / play-pause / next SVG keys, the green
quick-start key, SETUP) · middle panel · scroll keys. The **middle rail key**
toggles the middle panel (`musicPanel`, saved as `pfc.musicpanel`) between
**TRACKLIST** (now-playing ticker, position bar, volume row, selectable
current playlist) and **NOTES** (editable, `pfc.notes.v1`, seeded from
`NOTES_DEFAULT`). Both have ▲/▼ scroll keys (touch-drag is unreliable in the
WebView).
- The now-playing ticker holds the play/pause mark still and shuttles the
  track name (`fitTicker()`, CSS `.mnowtxt.roll`) when it overflows; it only
  redraws when the text changes, so the 12 s poll doesn't restart the scroll.
- **Position bar**: `np` holds the last reading; `updateProgress()` advances
  it locally each second and refetches when a track ends.
- **Volume** (`vol`, `changeVolume`, `Spotify.setVolume`): steps of 10,
  optimistic. If the device doesn't report a settable volume the row greys
  out and the keys explain why. **Unverified on the pilot's phone** — the
  KEEP AWAKE trick uses the same API call, so it probably works.
- **SETUP** opens an overlay (`setupOpen`, not persisted, closed on page
  change) with the rarely-used controls: the **KEEP AWAKE** toggle and
  **DISCONNECT SPOTIFY**.
- The green **quick-start key** (`#mQuick`) starts the pilot's pinned
  playlist in one tap via `Spotify.playContext()` (wakes an idle-but-listed
  device). Pin sources: `QUICKPLAY_DEFAULT` in `js/checklists.js` (currently
  their "Flight" playlist), overridden by a link pasted on the phone
  (`pfc.quickplay.v1`). Tapping while the pinned list is already playing
  opens the change/clear prompt (the only moment a tap has no other job);
  tapping while it's paused resumes it.

### Offline & updates (important — was a recurring pain)
- `sw.js` is **network-first** and fetches with `cache: 'no-cache'` so it
  revalidates every file with the server (GitHub Pages' `max-age` otherwise
  serves stale files ~10 min; XCTrack's WebView caches even harder).
- The **UPDATE key on the STATUS page** (`forceRefresh`) unregisters the SW,
  clears all caches, and reloads past the browser cache — the reliable "get
  latest" that does NOT clear XCTrack's cookies/data (so other widgets stay
  logged in). (Older builds had this as a ⟳ button in the header.)
- After deploying a change, the pilot uses UPDATE to pull it. A first-time
  bootstrap onto a new SW version can still need one XCTrack "Clear All Data".
- The BUILD stamp (date + short SHA, from `js/version.js`) in the STATUS data
  line is how to check what the phone is actually running — compare it
  against the latest commit before debugging "it didn't update".

## Spotify integration — read before touching it

Uses the Web API as a **remote control** of the Spotify app already playing on
the phone (it does not stream audio). PKCE, no server. Scopes:
`user-read-playback-state user-modify-playback-state playlist-read-private
playlist-read-collaborative` (the playlist-read pair lets the track list show
the pilot's private playlists; scopes are granted at connect time, so adding
one needs a one-time SETUP → DISCONNECT → CONNECT on the phone). Setup: pilot
registers a free Spotify dev app, redirect URI = the site URL, pastes the
Client ID on the MUSIC page. Tokens auto-refresh. `Spotify.nowPlaying()`
returns track, context, progress/duration and device volume in one call.

**Hard limitations (all confirmed on the real device — don't try to "fix" these
in code; they're platform constraints):**
1. **Premium required** for playback control and the track list. The pilot has
   **Premium Duo** (each member has full Premium), so it works. A Free account
   gets `403 PREMIUM_REQUIRED`.
2. **Active-device requirement:** the API can only control a device with a live
   playback session. Merely *opening* Spotify isn't enough — the pilot must
   **press Play once** to register the phone as the active Connect device. The
   message says exactly this. `toggle()` tries to auto-wake an idle-but-listed
   device (transfer + play), but can't revive one that's dropped off.
3. **Idle drop-off:** a paused/idle Spotify app deregisters from Connect after
   ~10 min, and then there's **no device to control** (independent of battery
   settings). The **KEEP AWAKE** toggle is a best-effort mitigation: every 4 min
   it re-sets the device volume to its current value (inaudible) to reset the
   idle timer. **Experimental — unverified whether it actually prevents the
   drop-off; awaiting real-device testing by the pilot.**
4. **Can't launch the Spotify app** from XCTrack's WebView (it blocks
   `spotify://` and `intent://`), so there is intentionally no "open Spotify"
   button.
5. **Some playlists are API-unreadable**: Spotify-owned ones (Daily Mix,
   radio, editorial — 404/403 on `/playlists/{id}` since the Nov 2024 API
   restrictions) always; the pilot's own *private* lists too until they
   reconnect with the playlist-read scopes. `Spotify.playlist()` therefore
   degrades to the up-next queue view (marked `queue: true`) instead of
   erroring while music is audibly playing. Its header row is state-aware
   via `Spotify.hasScope()` (granted scopes are stored off token responses):
   missing playlist-read scope → an actionable "SETUP, DISCONNECT, then
   CONNECT" hint; scope granted but still blocked → no row at all (play
   order, pilot asked for no explanation banner); free play / repeat-1 keep
   their labels. The queue is deduped by URI (repeat-context wraps it around,
   repeat-1 pads it). The fallback still carries `contextUri`, so tap-to-jump
   plays within the real context; a context-free tap sends the whole visible
   queue (never one bare URI — a one-track context stops after the song and
   makes `/me/player/queue` report the current track over and over, which the
   fallback also dedupes).

## Dev & test workflow

No build. To run locally: `python3 -m http.server 8000` then open the URL.

**Always verify UI changes visually with Playwright screenshots** at the widget
size before committing (Chromium is preinstalled at `/opt/pw-browsers/chromium`;
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Pattern used throughout:
- viewport `{ width: 650, height: 450 }` (the design size); also check
  ~600×410 and ~570×384, nearer the real widget. `serviceWorkers: 'block'` for
  deterministic loads (and one run with it allowed, to prove the SW installs).
- Page indices: checklists `0..N-1`, then STATUS, FLIGHT DATA, SYSTEMS, MUSIC
  (9, 10, 11, 12 with the current nine checklists). Seed
  `localStorage 'pfc.state.v1'` `{ page, checks }` to open on a page.
- Mock what the headless browser lacks via `addInitScript`: `navigator.getBattery`
  (keep a handle so tests can flip `charging` and fire `chargingchange`),
  `navigator.geolocation` (via `Object.defineProperty` — it's not directly
  assignable, and Playwright can't set GPS *altitude*), `window.fetch` for
  open-meteo / Spotify endpoints, and `Date` (fixed clock, for sunset/daylight).
  Seed `localStorage 'pfc.spotify.v1'` with a fake refresh token to simulate
  "connected".
- **204 responses in mocks must be `new Response(null, {status:204})`** — an
  empty-string body with 204 throws and silently breaks the mock.
- Check for overflow programmatically (anything off-screen, or
  `scrollWidth > clientWidth` on an element that hides overflow), not just by
  eye, and in the fault states too (ON BATT + longest title, offline, no GPS).
- Put temp test scripts/screenshots in the scratchpad dir, not the repo.
- Syntax-check with `node --check js/app.js` (and spotify.js/checklists.js/sw.js).

## Git & deploy workflow

- Work on the branch given in the session's instructions; also mirror to `main`
  (that's what deploys). Typical push: work branch **and**
  `git push origin <branch>:main`.
- **The pilot edits `js/checklists.js` (and `NOTES_DEFAULT`) directly on `main`
  between sessions.** So `main` frequently moves ahead. Before/after committing,
  `git fetch origin main`; if it diverged, **rebase your commit onto
  origin/main** (your code changes never touch `checklists.js`, so it's a clean
  rebase), then force-with-lease the work branch. Never clobber their content.
- Deploy = push to `main` → Actions builds Pages (~1 min). Verify the live file
  changed (e.g. `curl -s https://nitramevad.github.io/checklist/js/version.js`
  shows the new SHA); the CDN can lag a few seconds.
- Commit trailers/branch specifics come from the session's own instructions.

## Constraints & gotchas
- **XCTrack WebView**: caches aggressively (hence UPDATE + no-cache SW); blocks
  external app-launch URLs; touch-drag scrolling inside textareas/lists is
  unreliable (hence ▲/▼ scroll keys).
- **Camera**: the front punch-hole obscures the left edge — `--cam-inset`
  reserves a left margin on every page. Adjust that one var if needed.
- Keep it **big and glove-friendly**; the pilot has poor eyesight (prefer larger
  type; don't shrink the FLIGHT DATA digits to fit more in).
- B612 Mono is wide (0.65em per character) — check long checklist rows still
  fit when changing row type size.

## localStorage keys
`pfc.state.v1` (page/checks/timer), `pfc.notes.v1` (notes text),
`pfc.musicpanel` (notes|tracklist), `pfc.keepawake` (0|1), `pfc.quickplay.v1`
(pinned quick-start playlist `{uri, name, link}` — overrides
`QUICKPLAY_DEFAULT`), `pfc.altunit` (auto|m|ft), `pfc.windunit` (kmh|mph|kt),
`pfc.pos.v1` (last known position, for sunset), `pfc.wx.v1` (cached
QNH/temp/wind + manual QNH), `pfc.spotify.v1` (Spotify client id + tokens).

## Open / recent items
- **KEEP AWAKE** keep-alive is experimental and awaiting the pilot's real-device
  verdict; if it doesn't prevent the drop-off, the fallback idea is a
  "silent-pause" (keep playing at volume 0) — has tradeoffs (data + playlist
  advances), so discuss before building.
- **Volume keys** are untested on the real phone (see MUSIC page).
- Offered to the pilot but **not** built (ask before adding): a two-step
  guard on RESET ALL, vibration on CHECK, and auto-ticking of sensed items.
- Everything else in `README.md` reflects current behaviour; keep both docs in
  sync when you change features.
