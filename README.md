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
  **QNH** and outside **temperature**. Tap the QNH tile to set it by hand; tap
  the ALT GPS tile to cycle its units (AUTO / metres / feet — AUTO reads feet
  in the UK/US and metres elsewhere, from your GPS position).
- **MUSIC page** — previous / play-pause / next for the Spotify app playing in
  the background, plus a right panel that **toggles between your editable NOTES
  and the Spotify TRACKLIST** (middle rail button). The track list shows the
  current playlist with a **now-playing header** and tap-to-jump; ▲/▼ scroll
  either panel. A track name too long for the header scrolls slowly back and
  forth like a ticker rather than being cut off.
  The green **▶ quick-start button** under the transport controls starts your
  own playlist with one tap (set it up by pasting the playlist's share link —
  Spotify → Share → Copy link — either in `js/checklists.js` as
  `QUICKPLAY_DEFAULT` or on the phone; tap the button while that playlist is
  already playing to change or clear the phone's link). Note the track list can
  only show playlists Spotify lets the API read: your own lists work (private
  ones after a one-time reconnect — ⚙ SETUP → DISCONNECT SPOTIFY, then
  CONNECT — to grant the
  playlist-read permission — the list itself tells you when that's needed),
  but Spotify-made ones (Daily Mix, radio, editorial) never do — for those the
  list shows plain play order starting at the current track, and for free play
  an **UP NEXT** queue view. Tapping a track always keeps the rest of the
  queue/playlist coming. The **⚙ SETUP** button opens a small dialog with the
  rarely-needed controls: the KEEP AWAKE toggle (shows the mode it is
  **currently in** — green lamp lit + "ON" while the keep-alive is running,
  dark lamp + "OFF" when it isn't) and DISCONNECT
  SPOTIFY. Spotify controls live *only* here, so the checklist pages stay
  focused on checklist items. **Playback control and the track list need
  Spotify Premium** (each Premium / Duo / Family member has their own full
  Premium account; a Free account can't control playback).
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

> **Premium is required for playback control and the track list.** Each member
> of a Premium **Duo** or **Family** plan has their own full Premium account,
> so those work too. A **Free** account can read what's playing but the Web API
> refuses control (`SPOTIFY PREMIUM REQUIRED`) and the track list — on Free,
> just use the NOTES side of the MUSIC page; the rest of the app is unaffected.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   (free), **Create app**.
2. Set the **Redirect URI** to the site's exact URL, e.g.
   `https://<username>.github.io/checklist/` — it must match exactly,
   including the trailing slash. Tick the *Web API* checkbox.
3. Copy the app's **Client ID**.
4. On the site, go to the **MUSIC** page (cycle ▼ to the last page), paste the
   Client ID, hit **CONNECT SPOTIFY** and approve. Tokens refresh automatically
   after that.
5. Start some music in the Spotify app, and the MUSIC page's buttons control it
   from then on.

Spotify's API only controls an **active device**. When the app goes idle it
disconnects from Spotify Connect and drops off the device list, so control
reports `NO DEVICE` until you bring Spotify back to the foreground and play
something. Pressing play here tries to wake an available device first, but if
the app has fully dropped off Connect there's nothing to wake — this is a
Spotify limitation, not tied to the app. Two things keep it working: keep a
track actually *playing* (a playing device stays on Connect; a long pause is
what drops it off), and set Android → Apps → Spotify → Battery → *Unrestricted*
so Android doesn't suspend it in the background.

(There's no reliable way to launch the Spotify app from inside XCTrack's
WebView — it blocks app-launch URLs — so there's no in-widget "open Spotify"
button. Switch to Spotify via Android's recent-apps if it has fully closed.)

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
**with a signal** (the service worker is network-first and revalidates every
file with the server, so no manual cache-clearing). If you're offline it keeps
showing the last version it cached. You do **not** need to bump `CACHE_VERSION`
in [`sw.js`](sw.js) for content edits — that's only a lever to force every
client to drop its cache.

**The ⟳ button (top-right of the header)** forces the very latest version on
demand: it drops the service worker and all caches and reloads past the
browser cache. Use it if a WebView (e.g. XCTrack's) is being stubborn about
updating — it pulls the new deploy **without** clearing all of XCTrack's data,
so you don't get logged out of your other widgets.

If the front-camera punch-hole obscures anything on the left, adjust
`--cam-inset` at the top of [`css/style.css`](css/style.css) — it reserves a
left margin on every page (checklist boxes, the FLIGHT DATA tiles, and the
MUSIC transport buttons all shift right together).

### Notes

The **MUSIC page** holds free-text notes beside the transport buttons. You can
**edit them on the hill** — tap the text, type, and it saves to the phone
immediately (survives reloads and works offline). Use the **▲/▼ buttons to the
right of the notes** to scroll long notes (touch-dragging inside the box is
unreliable in XCTrack's WebView). To pre-write a default, edit `NOTES_DEFAULT`
at the bottom of [`js/checklists.js`](js/checklists.js); **RESET** on the MUSIC
page restores it. On-device edits always take priority over the default until
you reset.

### QNH & temperature

Phones don't expose barometric pressure or outside-air temperature to a web
page, so the FLIGHT DATA page reads them from a free, keyless weather service
(open-meteo) by GPS position while online, and caches the last values for
offline use. **Tap the QNH tile** to enter a value by hand (e.g. the tower/ATIS
figure) — it shows amber while hand-set; clear it to return to automatic.

### Altitude units

XCTrack doesn't expose its unit setting to a web widget, so the ALT GPS tile
has its own. **Tap it** to cycle `AUTO → M → FT` (the current mode shows next
to the label). **AUTO** reads feet inside the UK/US bounding boxes — where
aviation altitude is flown in feet — and metres elsewhere, deduced live from
your GPS position, so it follows you between England and continental Europe.
Your choice is saved on the phone.

| Control | Action |
| --- | --- |
| ▲ / ▼ | Previous / next page (wraps around) |
| CHECK ✓ | Tick the current (amber) checklist item and move to the next unchecked one |
| NEXT ▶ | Shown when a page is complete — jumps to next page |
| ADV | Skip to the next unchecked item **without** ticking. Moves down the page and, once past its last unchecked item, carries on to the next page's first unchecked item (wrapping around all pages) — so you can cycle through everything you skipped |
| Tap any item | Toggle it (e.g. un-tick a mistake) |
| RESET | Clear the current page (top-right of each checklist) |
| RESET ALL | Clear every checklist — on each checklist page's header, left of RESET (amber). Do this before each flight |
| ⏮ ⏯ ⏭ (MUSIC page, left) | Spotify previous / play-pause / next (Premium only) |
| ♫ LIST / ✎ NOTES (MUSIC middle rail button) | Toggle the right panel between the track list and your notes |
| ⟳ (header, top-right) | Force the latest version — drops caches and reloads, without clearing XCTrack's data |

## Local development

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(Spotify auth also works on `http://localhost` if you register
`http://localhost:8000/` as an additional redirect URI.)
