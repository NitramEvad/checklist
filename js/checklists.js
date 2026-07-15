// ============================================================
//  YOUR PRE-FLIGHT CHECKLISTS — edit freely.
//
//  Each entry is one page: { title: "...", items: [...] }
//  An item is either:
//    ["Challenge", "RESPONSE"]  → rendered as   Challenge ···· RESPONSE
//    "Plain text"               → rendered as a simple line
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
      ["Battery", "~100%"],
      ["Battery", "STOWED+CONNECTED"],
      ["Phone", "SECURE"],
      ["Phone Red Cable", "CONNECTED"],
      ["Phone Power", "CHARGING/100%"],
      ["Phone Volume", "UNMUTED"],
    ],
  },
  {
    title: "2 · SYSTEMS",
    items: [
      ["Landscape", "SET"],
      ["Spotify", "PLAY/PAUSE"],
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
      ["XC Tracer", "ON / 5X"],
      ["XC Tracer", "CONNECTED"],
      ["Task", "SET"],
      ["Airspace", "ACTIVATED"],
      ["Pages", "CHECKED"],
      ["QNH/GPS Alt", "SET"],
      ["XC Tracer Volume", "MUTE"],
    ],
  },
  {
    title: "5 · HARNESS - 1",
    items: [
      ["Flightdeck", "ZIPPED"],
      ["Radio Pocket", "CHOCS"],
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
      ["Speedbar", "X2 + FREE"],
      ["Reserve Pins & Handle", "CHECKED"],
      ["Lens Caps", "STOWED"],
      ["Radio", "ON + STOWED"],
      ["Lens Caps", "STOWED"],
    ],
  },
  {
    title: "7 · SELF + HELMET",
    items: [
      ["Shoes", "FASTENED"],
      ["Pockets", "ZIPPED"],
      ["PTT", "-"],
      ["Mic", "POWER ON"],
      ["Clipped"],
      ["Coms Check", "ECHO TEST"],
      ["Zello", "CHANNEL SET"],
    ],
  },
  {
    title: "8 · FINAL · CLIPS + WING",
    items: [
      ["Red Clips", "X2"],
      ["White Clip", "CLIPPED"],
      ["Chest Clips", "X2"],
      ["Flightdeck Clip", "CLIPPED"],
      ["Speedbar", "FREE"],
      ["Maillons", "CLIPPED + FREE"],
      ["Reserve", "STOWED"],
      ["Crabs", "CLIPPED + CLEAR"],
    ],
  },
  {
    title: "9 · FINAL · GENERAL",
    items: [
      ["Shoes", "LACED"],
      ["Helmet", "CLIPPED"],
      ["Coms Check", "CHECKED"],
      ["XC Tracer", "AUDIO ON"],
      ["XC Track", "LIVE"],
      ["Phone", "SECURE"],
      ["Goggles", "ON"],
      ["Gloves", "ON"],
      ["Pockets", "SECURE"],
    ],
  },
];
