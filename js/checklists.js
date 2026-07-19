// ============================================================
//  YOUR PRE-FLIGHT CHECKLISTS — edit freely.
//
//  Each entry is one page: { title: "...", items: [...] }
//  An item is one of:
//    "Plain text"                      → a simple line
//    ["Challenge", "RESPONSE"]         → Challenge ···· RESPONSE
//    ["Challenge", "RESPONSE", "live"] → adds a live reading from the
//        phone shown just left of the target, which turns green when it
//        matches. Available "live" keys:
//          "battery"  → actual battery %  (green ≥ 95%)
//          "charging" → CHG / ON BATT     (green when charging)
//          "qnh"      → current QNH in hPa (from the FLIGHT DATA page —
//                       the auto weather value, or your hand-set one)
//  Keep it to ~5–9 items per page so text stays big and readable
//  on the flight deck. Add or remove pages as you like — the app
//  adapts automatically (page dots, cycling, auto-advance).
//
//  NOTE: changing the number of items on a page resets the saved
//  tick-state for that page (by design, so stale state can't lie
//  to you about a check you never did).
// ============================================================

const CHECKLISTS = [
  {
    title: "1 · FLIGHTDECK",
    items: [
      ["Battery", "~100%", "battery"],
      ["Battery cable", "CONNECTED"],
      ["Phone", "SECURE"],
      ["Phone Red Cable", "CONNECTED"],
      ["Phone Power", "CHARGING+ >80%", "charging"],
      ["Phone Volume", "UNMUTED"],
      ["Landscape", "SET"],
    ],
  },
  {
    title: "2 · ZELLO/AUDIO",
    items: [
      ["Spotify", "PLAYLIST PLAY/PAUSE"],
      ["Zello", "ON"],
      ["Helmet PTT", "-"],
      ["Zello", "PTT-Z Connected"],
      ["Mic", "POWER ON"],
      ["Zello ECHO", "TEST"],
      ["Zello Channel", "SET"],
    ],
  },
  {
    title: "3 · X4",
    items: [
      ["X4", "SECURED"],
      ["X4 Battery", "FULL"],
      ["X4 Lens cap", "STOWED"],
      ["X4 Mufflers", "BOTH"],
    ],
  },
  {
    title: "4 · XCTRACK",
    items: [
      ["XC Tracer", "ON / 5X BEEPS"],
      ["XC Tracer/Track", "CONNECTED"],
      ["Task", "SET"],
      ["Airspace", "ACTIVATED"],
      ["Pages", "CHECKED"],
      ["QNH/GPS Alt", "SET", "qnh"],
      ["XC Tracer Volume", "MUTE"],
    ],
  },
  {
    title: "5 · HARNESS - 1",
    items: [
      ["Flightdeck", "ZIPPED"],
      ["Radio Pocket", "RADIO/FOOD"],
      ["Left Pocket", "X4 SECURE"],
      ["Right Pocket", "CHARTS"],
      ["Speed Arms", "STOWED"],
      ["Water", "SEALED + FLOWING"],
      ["All Packed", "CHECKED"],
      ["Compartment", "ZIPPED"],
    ],
  },
  {
    title: "6 · HARNESS - 2",
    items: [
      ["Tow Bridle", "X2"],
      ["Wing", "ATTACHED"],
      ["Speedbar Maillons", "2X"],
      ["Reserve Pins & Handle", "CHECKED"],
      ["Radio", "ON + STOWED"],
      ["Lens Caps", "STOWED"],
    ],
  },
  {
    title: "7 · SELF + HELMET",
    items: [
      ["Shoes", "FASTENED"],
      ["Pockets", "ZIPPED"],
      ["Clipped"],
      ["Coms Check", "TEST"],
    ],
  },
  {
    title: "8 · FINAL · CLIPS + WING",
    items: [
      ["Red Clips", "X2"],
      ["White Clip", "CLIPPED"],
      ["Waist Clips", "X2"],
      ["Flightdeck Clip", "CLIPPED"],
      ["Maillons", "CLIPPED + FREE"],
      ["Speedbar", "FREE"],
      ["Reserve", "STOWED"],
      ["Crabs", "CLIPPED + CLEAR"],
    ],
  },
  {
    title: "9 · FINAL · GENERAL",
    items: [
      ["Shoes", "LACED"],
      ["Helmet", "CLIPPED"],
      ["XC Tracer", "AUDIO ON"],
      ["XC Track", "LIVE"],
      ["Phone", "SECURE"],
      ["Goggles", "ON"],
      ["Gloves", "ON"],
      ["Pockets", "SECURE"],
    ],
  },
];

// ============================================================
//  NOTES — shown (and editable) on the MUSIC page.
//
//  This is the text shown the FIRST time, and whenever you tap
//  RESET on the MUSIC page. You can also just edit the notes
//  live on the hill — tap the text, type, and it's saved on the
//  phone automatically (your on-device edits take priority over
//  this default until you RESET).
// ============================================================

const NOTES_DEFAULT = `SITE NOTES
Hill Farm Radio: 143.725

1. Aston Down -> G: 3,600
2. Cotswold <- CTR: 2,500
3. Highgrove -> R: 2,000
4. <- Malmsbury
5. Bristol <-> CTA: 4,500
6. <- Chippenham
7. Trowbridge
8. <- Westbury
9 Imber <- D:!!!
10. <- Warminster
11. -> Gillingham
12. -> Sturminster Newton
13. Wareham
`;
