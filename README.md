# FlightDeck Checklist

An EICAS-style pre-flight checklist and flight-deck web widget for
paragliding, built to be displayed inside **XCTrack**'s web-page widget on a
landscape phone (designed on a Samsung S22 Ultra, widget taking ~2/3 of the
screen width, XCTrack's own widgets filling the rest).

- **Pre-flight checklist pages** in challenge–response format
  (`Battery ···· 100%`), styled after an Airbus ECAM. Ticking an item advances
  the amber "active item" cursor to the next one, airliner-checklist style.
  Completing a page auto-advances to the next checklist. Fully customisable.
- **Dynamic (live) checklist items** — an item can show a real reading from
  the phone next to its target, turning green when it matches: `battery`
  (actual %) and `charging` (CHG / ON BATT). See "Customising the checklists".
- **▲ / ▼ buttons** cycle through all pages (checklists → flight data → music).
- **FLIGHT DATA page** — local/UTC clock, stopwatch timer, GPS altitude,
  **QNH** and outside **temperature**. Tap the QNH tile to set it by hand.
- **MUSIC page + persistent bottom bar** — previous / play-pause / next for
  the Spotify app playing in the background, plus your **editable notes**
  (tap, type, saved on the phone) beside the transport buttons. **Playback
  control needs Spotify Premium** (a per-account tier — never shared via
  Family/Duo); with Premium you can set `SHOW_TRACKLIST = true` in `js/app.js`
  to replace the notes with a selectable track list of the current playlist.
- **Works offline, updates promptly** — it's a PWA with a network-first
  service worker: when you have a signal it loads the latest (so a checklist
  you edited and redeployed shows on the very next open); when you don't, it
  falls back instantly to the cached copy. Checklist state / timer survive
  reloads in `localStorage`. Only the Spotify *control* needs internet
  (playback itself is the Spotify app's business — it keeps playing your
  downloaded music regardless).

No build step, no dependencies — plain HTML/CSS/JS.

## Hosting (GitHub Pages)

The included workflow (`.github/workflows/deploy-pages.yml`) publishes the
site on every push to `main`:

1. In the repo: **Settings → Pages → Source: GitHub Actions**.
2. Merge/push to `main`. The site appears at
   `https://<username>.github.io/checklist/`.

(Any static HTTPS host works — HTTPS is required for the service worker and
for Spotify auth.)

## XCTrack setup

1. Open the site once in the phone's browser **while online** so the service
   worker caches it (you'll see the green ● go red in the header when you
   test airplane mode — the app keeps working).
2. In XCTrack: layout editor → add the **web page / browser widget** and set
   its URL to the hosted site. Size it to roughly 2/3 of the landscape screen
   width, and fill the remaining third with XCTrack's own widgets (vario,
   altitude, airspace proximity, …).
3. The widget's WebView shares no storage with Chrome, so do the one-time
   Spotify connect (below) **inside the widget**, at home on Wi-Fi.

## Spotify remote control (one-time setup)

The music buttons remote-control the Spotify app already running on the
phone via the Spotify Web API. Requirements: **Spotify Premium** and internet
at the moment you press a button (patchy 4G is fine — each press is one tiny
request; when offline the bar shows `OFFLINE — NO MUSIC CONTROL`).

> **Premium is per-account and is *not* shared** by Spotify Family or Duo —
> each person keeps their own tier. On a free account the Web API refuses
> playback control (`SPOTIFY PREMIUM REQUIRED`). Because of that the MUSIC page
> ships with `SHOW_TRACKLIST = false` (in `js/app.js`), showing your editable
> notes beside the transport buttons instead of a track list. The whole rest
> of the app works fine regardless; flip the flag to `true` if you go Premium.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   (free), **Create app**.
2. Set the **Redirect URI** to the site's exact URL, e.g.
   `https://<username>.github.io/checklist/` — it must match exactly,
   including the trailing slash. Tick the *Web API* checkbox.
3. Copy the app's **Client ID**.
4. On the site, go to the **MUSIC** page (▼ past the data page, or tap the
   Spotify text in the bottom bar), paste the Client ID, hit
   **CONNECT SPOTIFY** and approve. Tokens refresh automatically after that.
5. Start some music in the Spotify app, and the bottom bar controls it from
   then on. If you see `NO DEVICE`, just open Spotify and press play once —
   the phone becomes the "active device".

## Customising the checklists

Edit [`js/checklists.js`](js/checklists.js) — one array entry per page. Each
item is one of:

- `"Plain text"` — a simple line
- `["Challenge", "RESPONSE"]` — `Challenge ···· RESPONSE`
- `["Challenge", "RESPONSE", "live"]` — adds a live phone reading just left of
  the target that turns green when it matches. `live` keys: `"battery"`
  (actual %) and `"charging"` (CHG / ON BATT).

Add or remove pages/items freely; the page dots, cycling and auto-advance
adapt. Changing a page's item count intentionally resets that page's saved
ticks.

**How your phone picks up edits:** commit to `main` → GitHub Actions
redeploys (~1 min) → the widget shows the new version the next time it loads
**with a signal** (the service worker is network-first, so no manual refresh
or cache-clearing). If you're offline it keeps showing the last version it
cached. You do **not** need to bump `CACHE_VERSION` in [`sw.js`](sw.js) for
content edits — that's only a lever to force every client to drop its cache.

If the front-camera punch-hole obscures anything on the left, adjust
`--cam-inset` at the top of [`css/style.css`](css/style.css) — it reserves a
left margin on every page (checklist boxes, the FLIGHT DATA tiles, and the
MUSIC transport buttons all shift right together).

### Notes

The **MUSIC page** holds free-text notes beside the transport buttons. You can
**edit them on the hill** — tap the text, type, and it saves to the phone
immediately (survives reloads and works offline). To pre-write a default, edit
`NOTES_DEFAULT` at the bottom of [`js/checklists.js`](js/checklists.js);
**RESET** on the MUSIC page restores it. On-device edits always take priority
over the default until you reset.

### QNH & temperature

Phones don't expose barometric pressure or outside-air temperature to a web
page, so the FLIGHT DATA page reads them from a free, keyless weather service
(open-meteo) by GPS position while online, and caches the last values for
offline use. **Tap the QNH tile** to enter a value by hand (e.g. the tower/ATIS
figure) — it shows amber while hand-set; clear it to return to automatic.

## Using it

| Control | Action |
| --- | --- |
| ▲ / ▼ | Previous / next page (wraps around) |
| CHECK ✓ | Tick the current (amber) checklist item and move to the next unchecked one |
| NEXT ▶ | Shown when a page is complete — jumps to next page |
| ADV | Skip to the next unchecked item **without** ticking — cycles through any items you skipped so you can come back and check/skip them |
| Tap any item | Toggle it (e.g. un-tick a mistake) |
| RESET | Clear the current page (top-right of each checklist) |
| RESET ALL CHECKLISTS | On the FLIGHT DATA page — do this before each flight |
| ⏮ ⏯ ⏭ (bottom bar) | Spotify previous / play-pause / next, on every page |
| On data & music pages | The big middle rail button becomes ⏯ play/pause |

## Local development

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(Spotify auth also works on `http://localhost` if you register
`http://localhost:8000/` as an additional redirect URI.)
