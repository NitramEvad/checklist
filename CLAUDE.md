# CLAUDE.md — FlightDeck Checklist

Guidance for working on this repo in a Claude Code session. Read this first.

## What this is

A single-page web app used as a **website widget inside XCTrack** (paragliding
flight software) on a **landscape Samsung S22 Ultra** flight deck. The widget
takes ~2/3 of the screen width; XCTrack's own widgets fill the rest. It is an
EICAS/ECAM-style dark cockpit UI, driven by big glove-friendly buttons.

- **Live site:** https://nitramevad.github.io/checklist/ (GitHub Pages)
- **Repo:** `NitramEvad/checklist`
- **Owner/pilot flies in England (feet) and continental Europe (metres).**

## Architecture

Plain **HTML/CSS/JS PWA — no build step, no dependencies, no framework.** Just
static files served over HTTPS. Everything is client-side and works offline via
a service worker. Do not add a bundler/framework.

### File map
- `index.html` — shell: `<header>` (title, page dots, battery, clock, net dot,
  ⟳ update button), `<main>` (`#content` + right `#rail` of buttons). No footer.
- `css/style.css` — all styling. Theme vars at top (`--bg/--grn/--amb/--cyn/
  --red …`) plus `--cam-inset` (left margin to clear the phone camera).
- `js/checklists.js` — **user-editable content**: `CHECKLISTS` array (the
  pages), `NOTES_DEFAULT` (music-page notes seed) and `QUICKPLAY_DEFAULT`
  (quick-start playlist seed). The pilot edits this file often, sometimes
  directly on `main` (see Git workflow).
- `js/app.js` — all app logic (IIFE). Pages, rendering, state, live readings,
  flight data, music panel, service-worker registration, force-update.
- `js/spotify.js` — Spotify Web API client (Auth Code + PKCE, no server/secret).
- `js/version.js` — build stamp shown faintly in the header (`#build`). The
  repo copy says `dev`; the deploy workflow overwrites it with date + short
  SHA, so the pilot (and you) can always tell which build the phone runs.
- `sw.js` — service worker (network-first, revalidating). Bump `CACHE_VERSION`
  only to force a hard cache drop; not needed for normal edits.
- `manifest.webmanifest`, `icon.svg` — PWA bits.
- `.github/workflows/deploy-pages.yml` — deploys to Pages on push to `main`.

## Key concepts

### Pages & navigation
`pages` = N checklist pages (from `CHECKLISTS`) + `FLIGHT DATA` + `MUSIC`. The
rail's ▲/▼ (`#btnUp`/`#btnDown`) cycle pages (wrap around); header dots show
progress (green = page complete). `state` (page, per-page checks, timer) is in
`localStorage` (`pfc.state.v1`).

### Checklist items & the CHECK/ADV rail
Each item in `CHECKLISTS[n].items` is one of:
- `"Plain text"`
- `["Challenge", "RESPONSE"]` → `Challenge ···· RESPONSE`
- `["Challenge", "RESPONSE", "live"]` → adds a live phone reading. `""` response
  is allowed (shows just the live value). Live keys: `battery` (colour-coded:
  red <30%, amber <90%, green ≥90%), `charging` (CHG/ON BATT), `qnh` (hPa).
- Rail middle button = **CHECK** (tick active item, advance to next unchecked;
  auto-advances page when complete). **ADV** (below CHECK) skips to the next
  unchecked item without ticking, crossing into the next page's first unchecked
  item at the bottom (a real per-page cursor, `cursors[]`, drives this).
- Header of each checklist page: **RESET** (this page) and **RESET ALL** (amber,
  all pages).

### FLIGHT DATA page
2-column × 3-row tiles (big digits for poor eyesight): LOCAL, UTC, TIMER
(start/pause/reset stopwatch), ALT GPS, QNH, TEMP.
- **ALT GPS**: tap tile to cycle units AUTO→M→FT (`AltUnit`, saved). AUTO = feet
  in UK/US bounding boxes, metres elsewhere, from GPS. GPS fix accuracy shown in
  the tile.
- **QNH/TEMP**: phones don't expose these, so fetched from **open-meteo** (free,
  keyless) by GPS, cached offline (`Weather`). Tap QNH tile to hand-set it.

### MUSIC page
Left column = Spotify transport (⏮ ⏯ ⏭, ▶ quick-start, ⚙ SETUP). Right panel **toggles**
between **NOTES** (editable, `localStorage` `pfc.notes.v1`, seeded from
`NOTES_DEFAULT`) and **TRACKLIST** (Premium: now-playing header + selectable
current playlist). The now-playing header holds the ▶/⏸ icon still and shuttles
the track name (`fitTicker()`, CSS `.mnowtxt.roll`) when it overflows; it only
redraws when the text changes, so the 12 s poll doesn't restart the scroll. The **middle rail button** toggles the panel (`musicPanel`,
saved as `pfc.musicpanel`; shows "♫ LIST" / "✎ NOTES"). Both panels have ▲/▼
scroll buttons (touch-drag is unreliable in the WebView). The **⚙ SETUP**
button (transport column, below ▶ quick-start) opens an overlay (`setupOpen`,
not persisted, closed on page change) holding the rarely-used controls:
the **KEEP AWAKE** toggle and **✕ DISCONNECT SPOTIFY**. KEEP AWAKE is the
experimental Spotify keep-alive (see below). Its label
states the **current** mode, not the action — a lit green lamp (`.lamp` inside
`.minibtn.lamped`) plus "ON", or a dark ring plus "OFF"; the toast uses the same
words ("KEEP AWAKE NOW ON/OFF") so the two can't be read as contradicting each
other, and `.kstate` reserves room for the longer word so the button never
resizes. Keep that pattern for any future mode toggle whose label states state.

The green **▶ quick-start button** (`#mQuick`, under ⏭ in the transport
column) starts the pilot's pinned playlist in one tap via
`Spotify.playContext()` (wakes an idle-but-listed device). Pin sources:
`QUICKPLAY_DEFAULT` in `js/checklists.js` (the pilot-editable seed — currently
their "Flight" playlist), overridden by a link pasted on the phone
(`pfc.quickplay.v1`). Tapping while the pinned list is already playing opens
the change/clear prompt (the only moment a tap has no other job); tapping
while it's paused resumes it.

### Offline & updates (important — was a recurring pain)
- `sw.js` is **network-first** and fetches with `cache: 'no-cache'` so it
  revalidates every file with the server (GitHub Pages' `max-age` otherwise
  serves stale files ~10 min; XCTrack's WebView caches even harder).
- The header **⟳ button** (`forceRefresh`) unregisters the SW, clears all
  caches, and reloads past the browser cache — the reliable "get latest" that
  does NOT clear XCTrack's cookies/data (so other widgets stay logged in).
- After deploying a change, the pilot uses ⟳ to pull it. A first-time bootstrap
  onto a new SW version can still need one XCTrack "Clear All Data".
- The faint header build stamp (date + short SHA, from `js/version.js`) is how
  to check what the phone is actually running — compare it against the latest
  commit before debugging "it didn't update".

## Spotify integration — read before touching it

Uses the Web API as a **remote control** of the Spotify app already playing on
the phone (it does not stream audio). PKCE, no server. Scopes:
`user-read-playback-state user-modify-playback-state playlist-read-private
playlist-read-collaborative` (the playlist-read pair lets the track list show
the pilot's private playlists; scopes are granted at connect time, so adding
one needs a one-time SETUP → DISCONNECT → CONNECT on the phone). Setup: pilot registers a
free Spotify dev app, redirect URI = the site URL, pastes the Client ID on the
MUSIC page. Tokens auto-refresh.

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
   missing playlist-read scope → an actionable "SETUP → DISCONNECT, then
   CONNECT" hint;
   scope granted but still blocked → no row at all (play order, pilot asked
   for no explanation banner); free play / repeat-1 keep their labels. The
   queue is deduped by URI (repeat-context wraps it around, repeat-1 pads
   it). The fallback still carries `contextUri`, so tap-to-jump plays
   within the real context; a context-free tap sends the whole visible queue
   (never one bare URI — a one-track context stops after the song and makes
   `/me/player/queue` report the current track over and over, which the
   fallback also dedupes).

## Dev & test workflow

No build. To run locally: `python3 -m http.server 8000` then open the URL.

**Always verify UI changes visually with Playwright screenshots** at the widget
size before committing (Chromium is preinstalled at `/opt/pw-browsers/chromium`;
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Pattern used throughout:
- viewport `{ width: 650, height: 450 }` (≈ the XCTrack widget at 2/3 width),
  `serviceWorkers: 'block'` for deterministic loads.
- Mock what the headless browser lacks via `addInitScript`: `navigator.getBattery`,
  `navigator.geolocation` (via `Object.defineProperty` — it's not directly
  assignable, and Playwright can't set GPS *altitude*), and `window.fetch` for
  open-meteo / Spotify endpoints. Seed `localStorage 'pfc.spotify.v1'` with a
  fake refresh token to simulate "connected".
- **204 responses in mocks must be `new Response(null, {status:204})`** — an
  empty-string body with 204 throws and silently breaks the mock.
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
  changed (e.g. `curl -s https://nitramevad.github.io/checklist/js/app.js | grep …`);
  the CDN can lag a few seconds.
- Commit trailers/branch specifics come from the session's own instructions.

## Constraints & gotchas
- **XCTrack WebView**: caches aggressively (hence ⟳ + no-cache SW); blocks
  external app-launch URLs; touch-drag scrolling inside textareas/lists is
  unreliable (hence ▲/▼ scroll buttons).
- **Camera**: the front punch-hole obscures the left edge — `--cam-inset`
  reserves a left margin on every page. Adjust that one var if needed.
- Keep it **big and glove-friendly**; the pilot has poor eyesight (prefer larger
  type; FLIGHT DATA uses a 2-col layout for this reason).

## localStorage keys
`pfc.state.v1` (page/checks/timer), `pfc.notes.v1` (notes text),
`pfc.musicpanel` (notes|tracklist), `pfc.keepawake` (0|1), `pfc.quickplay.v1`
(pinned quick-start playlist `{uri, name, link}` — overrides
`QUICKPLAY_DEFAULT`), `pfc.altunit` (auto|m|ft), `pfc.wx.v1` (cached QNH/temp
+ manual QNH), `pfc.spotify.v1` (Spotify client id + tokens).

## Open / recent items
- **KEEP AWAKE** keep-alive is experimental and awaiting the pilot's real-device
  verdict; if it doesn't prevent the drop-off, the fallback idea is a
  "silent-pause" (keep playing at volume 0) — has tradeoffs (data + playlist
  advances), so discuss before building.
- Everything else in `README.md` reflects current behaviour; keep both docs in
  sync when you change features.
