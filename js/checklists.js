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
      ["Battery", "100%"],
      ["Spare Battery", "STOWED"],
      ["Attachments", "SECURED"],
      ["Phone Power", "CHARGING"],
      ["Phone Volume", "UNMUTED"],
      ["Zello", "ON"],
      ["XC Tracer", "ON"],
      ["XC Tracer Volume", "MUTE"],
    ],
  },
  {
    title: "2 · X4",
    items: [
      ["X4", "SECURED"],
      ["X4 Battery", "FULL"],
      ["Bluetooth", "RED O"],
      ["Bluetooth Pairing", "A + O"],
      ["X4 Standby", "A"],
    ],
  },
  {
    title: "3 · XCTRACK",
    items: [
      ["XC Tracer", "CONNECTED"],
      ["Task", "SET"],
      ["Airspace", "ACTIVATED"],
      ["QNH/GPS Alt", "ALIGN"],
      ["Pages", "CHECKED"],
    ],
  },
  {
    title: "4 · HARNESS",
    items: [
      ["Flightdeck", "ZIPPED"],
      ["Radio Pocket", "CHOCS"],
      ["Left Pocket", "X4 SECURE"],
      ["Right Pocket", "AS NEEDED"],
      ["Speed Arms", "STOWED"],
      ["Water", "SEALED + FLOWING"],
      ["All Packed", "CHECKED"],
      ["Compartment", "ZIPPED"],
    ],
  },
  {
    title: "5 · HARNESS / GENERAL",
    items: [
      ["Speedbar", "CHECKED"],
      ["Tow Bridle", "2X"],
      ["Wing", "ATTACHED"],
      ["Speedbar Maillons", "2X"],
      ["Reserve Pins & Handle", "CHECKED"],
      ["Shoes", "FASTENED"],
      ["Pockets", "ZIPPED"],
      ["Lens Cap", "STOWED"],
    ],
  },
  {
    title: "6 · HELMET",
    items: [
      ["PTT", "DOWN (|)"],
      ["Mic", "POWER ON"],
      ["Clipped", "DOWN"],
      ["Coms Check", "ECHO TEST"],
      ["Zello", "CHANNEL SET"],
    ],
  },
  {
    title: "7 · FINAL · CLIPS + WING",
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
    title: "8 · FINAL · GENERAL",
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
