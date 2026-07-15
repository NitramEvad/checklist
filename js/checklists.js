// ============================================================
//  YOUR PRE-FLIGHT CHECKLISTS — edit freely.
//
//  Each entry is one page: { title: "...", items: ["...", ...] }
//  Keep it to ~5–7 items per page so text stays big and readable
//  on the flight deck. Add or remove pages as you like — the app
//  adapts automatically (page dots, cycling, auto-advance).
//
//  NOTE: changing the number of items on a page resets the saved
//  tick-state for that page (by design, so stale state can't lie
//  to you about a check you never did).
// ============================================================

const CHECKLISTS = [
  {
    title: "1 · GEAR CHECK",
    items: [
      "Reserve — pin secure, handle seated",
      "Helmet on — chin strap clicked",
      "Harness buckles — legs ×2 + chest",
      "Carabiners closed and locked",
      "Speed system connected, not tangled",
      "Instruments mounted and charged",
    ],
  },
  {
    title: "2 · WING & LINES",
    items: [
      "Wing laid out in arc, centre loaded",
      "Lines separated — no knots or tangles",
      "No sticks / debris in the lines",
      "Risers straight — no twists",
      "Brake lines free to the pulleys",
      "A-risers identified and in hand",
    ],
  },
  {
    title: "3 · HOOK-IN & PILOT",
    items: [
      "LEG LOOPS ×2 — CONFIRMED",
      "Chest strap set to correct width",
      "Risers hooked in — correct sides",
      "No twist between harness and wing",
      "Brake toggles in hands, correct side",
      "Radio / phone check",
    ],
  },
  {
    title: "4 · WIND & AIRSPACE",
    items: [
      "Wind direction on launch — OK",
      "Wind strength within my limits",
      "Cycles / thermal timing judged",
      "Launch and approach clear of traffic",
      "Airspace and NOTAMs checked",
      "Landing options identified",
    ],
  },
  {
    title: "5 · FINAL — BEFORE LAUNCH",
    items: [
      "Helmet and visor — final touch check",
      "All zips and pockets closed",
      "XCTrack ready — track recording armed",
      "Camera on (optional)",
      "Airspace ahead clear — \"CLEAR!\"",
      "Committed — fly the wing",
    ],
  },
];
