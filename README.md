# FlightDeck Checklist

An EICAS-style pre-flight checklist and flight-deck web widget for
paragliding, built to be displayed inside **XCTrack**'s web-page widget on a
landscape phone (designed on a Samsung S22 Ultra, widget taking ~2/3 of the
screen width, XCTrack's own widgets filling the rest).

- **5 pre-flight checklist pages** — ticking an item advances the amber
  "active item" cursor to the next one, airliner-checklist style. Completing
  a page auto-advances to the next checklist. Fully customisable.
- **▲ / ▼ buttons** cycle through all pages (checklists → flight data → music).
- **FLIGHT DATA page** — local/UTC clock, stopwatch timer, GPS altitude /
  speed / heading (from the phone's GPS, works offline), battery in the header.
- **MUSIC page + persistent bottom bar** — previous / play-pause / next for
  the Spotify app playing in the background (see setup below).
- **Works offline** — it's a PWA: after the first visit the whole app is
  cached by a service worker, and checklist state / timer survive reloads in
  `localStorage`. Only the Spotify *control* needs internet (playback itself
  is the Spotify app's business — it keeps playing your downloaded music
  regardless).

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

Edit [`js/checklists.js`](js/checklists.js) — plain text, one array entry per
page. Add or remove pages/items freely; the page dots, cycling and
auto-advance adapt. Changing a page's item count intentionally resets that
page's saved ticks. After deploying changes, bump `CACHE_VERSION` in
[`sw.js`](sw.js) so cached clients pick up the new version next time they're
online.

## Using it

| Control | Action |
| --- | --- |
| ▲ / ▼ | Previous / next page (wraps around) |
| CHECK ✓ | Tick the current (amber) checklist item |
| NEXT ▶ | Shown when a page is complete — jumps to next page |
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
