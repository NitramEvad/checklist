// ============================================================
//  FlightDeck Checklist — main app.
//  Pages: N checklist pages (from js/checklists.js) + STATUS +
//  FLIGHT DATA + SYSTEMS + MUSIC. UP/DOWN cycle pages, CHECK ticks
//  the active item. All state persists in localStorage; the
//  service worker keeps the whole site working with no internet.
// ============================================================

'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const LS_KEY = 'pfc.state.v1';

  // ---- pages ----

  // Checklists MUST stay first: saved ticks are stored by page index, so
  // anything inserted ahead of them would shift (and so discard) them.
  const pages = [
    ...CHECKLISTS.map(c => ({ type: 'checklist', title: c.title, items: c.items })),
    { type: 'status',  title: 'STATUS' },
    { type: 'data',    title: 'FLIGHT DATA' },
    { type: 'systems', title: 'SYSTEMS' },
    { type: 'music',   title: 'MUSIC' },
  ];
  const CL_COUNT = CHECKLISTS.length;
  const MUSIC_PAGE = pages.findIndex(p => p.type === 'music');

  // "3 · X4" → { num: '3', name: 'X4' }; a title without a leading number
  // keeps its whole text. Lets the title bar box the number without the
  // pilot having to change how titles are typed in checklists.js.
  const splitTitle = t => {
    const m = /^\s*(\d+)\s*[·•.:–-]\s*(.+)$/.exec(t);
    return m ? { num: m[1], name: m[2] } : { num: '', name: t };
  };

  // Inline icons (no emoji: they render tiny and vary by handset). `s` = stroked.
  const ICON = {
    up:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 21 19H3z"/></svg>',
    down:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19 21 5H3z"/></svg>',
    tick:  '<svg class="s" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5 7.5 14 15 4.5"/></svg>',
    cur:   '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 2.5 15 9 4 15.5z"/></svg>',
    prev:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3v16H5zM20 4 9 12l11 8z"/></svg>',
    next:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l11 8-11 8zM16 4h3v16h-3z"/></svg>',
    playpause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4l10 8-10 8zM14 4h3v16h-3zM19 4h3v16h-3z"/></svg>',
    play:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l15 9-15 9z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h5v16H5zM14 4h5v16h-5z"/></svg>',
    minus: '<svg class="s" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus:  '<svg class="s" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
  };

  // The MUSIC page's right panel toggles between editable NOTES and the Spotify
  // TRACKLIST (the latter needs Premium). The middle rail button switches them;
  // the choice persists. Track list = 'tracklist', notes = 'notes'.
  let musicPanel = localStorage.getItem('pfc.musicpanel') || 'notes';
  const setMusicPanel = v => { musicPanel = v; localStorage.setItem('pfc.musicpanel', v); };
  const onTracklist = () => pages[state.page].type === 'music' && musicPanel === 'tracklist';

  // Keep-alive: experimental attempt to stop the Spotify app deregistering from
  // Connect after ~10 min idle. When on, a harmless inaudible command is sent
  // to the active device every few minutes to reset its idle timer.
  let keepAwake = localStorage.getItem('pfc.keepawake') === '1';
  const setKeepAwake = v => { keepAwake = v; localStorage.setItem('pfc.keepawake', v ? '1' : '0'); };

  // MUSIC ⚙ SETUP overlay (keep-awake toggle + disconnect). Not persisted;
  // closes when navigating off the page so it can't lurk under a checklist.
  let setupOpen = false;

  // Quick-start playlist for the MUSIC page's ▶ button: one tap starts the
  // pilot's own playlist playing on the phone. Seeded from QUICKPLAY_DEFAULT
  // in js/checklists.js; a link pasted on the phone (stored locally) wins.
  const QUICK_KEY = 'pfc.quickplay.v1';
  const QUICK_RE = /(?:open\.spotify\.com\/(?:[a-z-]+\/)?(playlist|album)\/|spotify:(playlist|album):)([A-Za-z0-9]+)/;
  const parseQuick = (link, name) => {
    const m = String(link || '').match(QUICK_RE);
    if (!m) return null;
    const type = m[1] || m[2];
    return { uri: `spotify:${type}:${m[3]}`, name: (name || type).toUpperCase(), link };
  };
  function getQuick() {
    try {
      const v = JSON.parse(localStorage.getItem(QUICK_KEY));
      if (v && v.uri) return v;
    } catch (e) {}
    return (typeof QUICKPLAY_DEFAULT === 'object' && QUICKPLAY_DEFAULT)
      ? parseQuick(QUICKPLAY_DEFAULT.link, QUICKPLAY_DEFAULT.name) : null;
  }
  const setQuick = q => q ? localStorage.setItem(QUICK_KEY, JSON.stringify(q))
                          : localStorage.removeItem(QUICK_KEY);

  // Notes: on-device edits (localStorage) take priority over NOTES_DEFAULT.
  const NOTES_KEY = 'pfc.notes.v1';
  const DEFAULT_NOTES = (typeof NOTES_DEFAULT === 'string') ? NOTES_DEFAULT : '';
  const getNotes = () => {
    const v = localStorage.getItem(NOTES_KEY);
    return v == null ? DEFAULT_NOTES : v;
  };

  // ---- state ----

  const defaultState = () => ({
    page: 0,
    checks: pages.map(p => p.type === 'checklist' ? p.items.map(() => false) : null),
    timerStart: null, // ms epoch while running, else null
    timerAcc: 0,      // accumulated ms while paused
  });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (!s) return null;
      const d = defaultState();
      d.page = Math.min(Math.max(s.page || 0, 0), pages.length - 1);
      pages.forEach((p, i) => {
        // only restore ticks if the page still has the same item count
        if (p.type === 'checklist' && Array.isArray(s.checks?.[i]) &&
            s.checks[i].length === p.items.length) {
          d.checks[i] = s.checks[i].map(Boolean);
        }
      });
      d.timerStart = s.timerStart || null;
      d.timerAcc = s.timerAcc || 0;
      return d;
    } catch (e) { return null; }
  }

  let state = load() || defaultState();
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));

  // ---- helpers ----

  const esc = s => s.replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setTxt = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  // Write a reading. With no data it shows a grey dash — never the normal
  // green, which would claim the value is fine.
  const setVal = (sel, v) => {
    const el = $(sel);
    if (!el) return;
    const none = v == null || v === '';
    el.textContent = none ? '—' : v;
    el.classList.toggle('nodata', none);
  };
  const pad = n => String(n).padStart(2, '0');

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  // ---- navigation ----

  function go(delta) {
    state.page = (state.page + delta + pages.length) % pages.length;
    setupOpen = false;
    save();
    render();
  }
  function goTo(i) { state.page = i; setupOpen = false; save(); render(); }

  // ---- checklist logic ----

  // Runtime highlight position ("cursor") for each page — normally the first
  // unchecked item, but ADV can move it forward so you can skip items and come
  // back to them. Not persisted; snaps back to the first unchecked on reload.
  const cursors = pages.map(() => 0);

  const pageComplete = pi => pages[pi].type === 'checklist' && state.checks[pi].every(Boolean);

  // Index of the next unchecked item at/after `from`, wrapping; -1 if none.
  function nextUnchecked(pi, from) {
    const chk = state.checks[pi];
    const n = chk.length;
    for (let k = 0; k < n; k++) {
      const j = ((from % n) + n + k) % n;
      if (!chk[j]) return j;
    }
    return -1;
  }

  // The highlighted item: the cursor if it still points at an unchecked item,
  // otherwise the first unchecked item. -1 when the page is complete.
  function activeIndex(pi) {
    const chk = state.checks[pi];
    if (chk.every(Boolean)) return -1;
    let c = cursors[pi];
    if (typeof c !== 'number' || c < 0 || c >= chk.length || chk[c]) {
      c = chk.findIndex(v => !v);
      cursors[pi] = c;
    }
    return c;
  }

  function toggleItem(pi, ii) {
    state.checks[pi][ii] = !state.checks[pi][ii];
    save();
    render();
    maybeAdvance(pi);
  }

  // First checklist that still has an unchecked item, or -1 if all are done.
  const firstOpenChecklist = () => {
    for (let i = 0; i < CL_COUNT; i++) if (!pageComplete(i)) return i;
    return -1;
  };

  // Middle rail key. CHECK on a checklist: tick the active item and move to
  // the next unchecked item (on a completed checklist, go to the next page).
  // GO TO on STATUS: jump to the first checklist with anything open. On MUSIC
  // it toggles the panel (notes ⇄ track list). Nothing on other pages.
  function checkAction() {
    const pi = state.page;
    if (pages[pi].type === 'music') {
      setMusicPanel(musicPanel === 'tracklist' ? 'notes' : 'tracklist');
      render();
      return;
    }
    if (pages[pi].type === 'status') {
      const open = firstOpenChecklist();
      if (open === -1) toast('ALL CHECKLISTS COMPLETE');
      else goTo(open);
      return;
    }
    if (pages[pi].type !== 'checklist') return;
    const idx = activeIndex(pi);
    if (idx === -1) { go(1); return; }
    state.checks[pi][idx] = true;
    cursors[pi] = nextUnchecked(pi, idx + 1);
    save();
    render();
    maybeAdvance(pi);
  }

  // Next unchecked item anywhere, scanning forward from (startPage, startItem)
  // across the checklist pages and wrapping around the whole set. Returns
  // { page, item } or null if nothing is unchecked anywhere.
  function nextUncheckedGlobal(startPage, startItem) {
    const total = CL_COUNT; // checklist pages occupy indices 0 .. CL_COUNT-1
    const cur = state.checks[startPage];
    // rest of the current page, below the cursor
    for (let j = startItem + 1; j < cur.length; j++) {
      if (!cur[j]) return { page: startPage, item: j };
    }
    // then following pages (wrapping), finishing with the head of the start
    // page (items 0..startItem) so earlier skipped items are still reachable
    for (let step = 1; step <= total; step++) {
      const p = (startPage + step) % total;
      const chk = state.checks[p];
      const limit = (p === startPage) ? startItem + 1 : chk.length;
      for (let j = 0; j < limit; j++) {
        if (!chk[j]) return { page: p, item: j };
      }
    }
    return null;
  }

  // ADV button: jump to the next unchecked item WITHOUT ticking. Moves down the
  // current page and, once past its last unchecked item, carries on to the next
  // page's first unchecked item (wrapping around all pages). On STATUS the
  // same key is UPDATE: pull the latest deployed version.
  function advAction() {
    const pi = state.page;
    if (pages[pi].type === 'status') { forceRefresh(); return; }
    if (pages[pi].type !== 'checklist') return;
    const found = nextUncheckedGlobal(pi, activeIndex(pi));
    if (!found) return; // nothing unchecked anywhere
    cursors[found.page] = found.item;
    if (found.page !== pi) goTo(found.page);
    else render();
  }

  // When a checklist page completes, advance automatically after a short
  // green pause — to the next checklist, or from the last one to STATUS,
  // which then shows the readiness banner.
  function maybeAdvance(pi) {
    if (!pageComplete(pi)) return;
    setTimeout(() => {
      if (state.page === pi && pageComplete(pi)) go(1);
    }, 900);
  }

  // ---- rendering ----

  function render() {
    const p = pages[state.page];
    renderHeader();
    renderDots();
    stopGeo();
    const c = $('#content');
    if (p.type === 'checklist')      renderChecklist(c, state.page);
    else if (p.type === 'status')    renderStatus(c);
    else if (p.type === 'data')    { renderData(c); startGeo(); }
    else if (p.type === 'systems') { renderSystems(c); startGeo(); pollSpotify(); }
    else                             renderMusic(c);
    renderRail();
    tick();
  }

  // Title bar: boxed page number + underlined title, progress, the
  // annunciator, and one page key (RESET on a checklist, RESET ALL on STATUS).
  function renderHeader() {
    const pi = state.page, p = pages[pi];
    const t = p.type === 'checklist' ? splitTitle(p.title) : { num: '', name: p.title };
    const num = $('#pgnum');
    num.hidden = !t.num;
    num.textContent = t.num;
    $('#title').textContent = t.name;

    const prog = $('#prog');
    if (p.type === 'checklist') {
      const chk = state.checks[pi];
      prog.textContent = chk.filter(Boolean).length + '/' + chk.length;
      prog.className = pageComplete(pi) ? 'ok' : '';
    } else if (p.type === 'status') {
      const done = CL_COUNT - openChecklists();
      prog.textContent = done + '/' + CL_COUNT;
      prog.className = done === CL_COUNT ? 'ok' : '';
    } else {
      prog.textContent = '';
      prog.className = '';
    }

    const key = $('#hkey');
    key.hidden = !(p.type === 'checklist' || p.type === 'status');
    key.className = p.type === 'status' ? 'all' : '';
    key.innerHTML = p.type === 'status' ? 'RESET<br>ALL' : 'RESET';
    updateMemo();
  }

  // Rail middle keys change with the page: CHECK + ADV on a checklist,
  // GO TO + UPDATE on STATUS, NOTES/LIST on MUSIC, none elsewhere.
  function renderRail() {
    const p = pages[state.page];
    const mid = $('#btnCheck'), low = $('#btnAdv');
    const set = (el, cls, label, aria) => {
      el.hidden = false;
      el.className = 'railbtn ' + cls;
      el.textContent = label;
      el.setAttribute('aria-label', aria || label);
    };
    if (p.type === 'checklist') {
      const done = pageComplete(state.page);
      set(mid, 'check', done ? 'NEXT' : 'CHECK', done ? 'next page' : 'check item');
      set(low, 'adv', 'ADV', 'skip to next unchecked item');
    } else if (p.type === 'status') {
      set(mid, 'goto', 'GO TO', 'go to the first open checklist');
      set(low, 'plain', 'UPDATE', 'update to the latest version');
    } else if (p.type === 'music') {
      const toNotes = musicPanel === 'tracklist';
      set(mid, 'swap', toNotes ? 'NOTES' : 'LIST', toNotes ? 'show notes' : 'show track list');
      low.hidden = true;
    } else {
      mid.hidden = true;
      low.hidden = true;
    }
  }

  // Annunciator: the single most important message, shown in the title bar
  // of every page. Listed in priority order — warn (red box) › caution
  // (amber box) › advisory (amber) › memo (green: a mode that is running).
  function annunciations() {
    const out = [];
    const b = Live.batt();
    if (b && !b.charging) out.push({ level: 'warn', text: 'ON BATT' });
    else if (b && b.level < 0.30) out.push({ level: 'caution', text: 'BATT LOW' });
    if (!navigator.onLine) out.push({ level: 'advisory', text: 'OFFLINE' });
    if (keepAwake && Spotify.connected()) out.push({ level: 'memo', text: 'KEEP AWAKE' });
    return out;
  }
  function updateMemo() {
    const el = $('#memo'), a = annunciations()[0];
    el.className = a ? a.level : '';
    el.textContent = a ? a.text : '';
  }

  // Page squares in the data line (square = checklist, round = other page).
  // STATUS lists every checklist itself, so there the build stamp takes over.
  function renderDots() {
    const onStatus = pages[state.page].type === 'status';
    $('#dots').hidden = onStatus;
    $('#buildWrap').hidden = !onStatus;
    $('#dots').innerHTML = pages.map((p, i) => {
      const cls = ['dot'];
      if (p.type !== 'checklist') cls.push('aux');
      if (i === state.page) cls.push('cur');
      if (p.type === 'checklist' && pageComplete(i)) cls.push('ok');
      return `<span class="${cls.join(' ')}"></span>`;
    }).join('');
  }

  function renderChecklist(c, pi) {
    const p = pages[pi];
    const chk = state.checks[pi];
    const act = activeIndex(pi);
    // Row states: done = green + tick, active = white cursor box, else cyan.
    c.innerHTML = `
      <ul class="cl">
        ${p.items.map((it, i) => {
          // item is "text" | ["Challenge","RESPONSE"] | ["Challenge","RESPONSE","live"]
          // RESPONSE may be "" to show just a live reading with no target text.
          const [lbl, resp, live] = Array.isArray(it) ? it : [it, '', ''];
          return `
          <li class="${chk[i] ? 'done' : (i === act ? 'active' : '')}" data-i="${i}">
            <span class="mk">${chk[i] ? ICON.tick : (i === act ? ICON.cur : '')}</span>
            <span class="lbl">${esc(lbl)}</span>
            ${(resp || live) ? `<span class="leader"></span>
              ${live ? `<span class="live" data-live="${esc(live)}">—</span>` : ''}
              ${resp ? `<span class="resp">${esc(resp)}</span>` : ''}` : ''}
          </li>`;
        }).join('')}
      </ul>`;
    c.querySelectorAll('li').forEach(li =>
      li.addEventListener('click', () => toggleItem(pi, Number(li.dataset.i))));
    updateLiveItems();
  }

  // Reset the checklist page being shown (the title-bar RESET key).
  function resetPage(pi) {
    state.checks[pi] = pages[pi].items.map(() => false);
    cursors[pi] = 0;
    save();
    render();
  }

  // Number of checklists that still have something unchecked.
  const openChecklists = () =>
    pages.filter((p, i) => p.type === 'checklist' && !pageComplete(i)).length;

  // STATUS: every checklist on one page with its progress, the cursor on the
  // first one still open (where GO TO jumps), and a readiness banner. Tapping
  // a row opens that checklist.
  function renderStatus(c) {
    const open = firstOpenChecklist();
    const n = openChecklists();
    c.innerHTML = `
      <ul class="cl stl">
        ${pages.map((p, i) => {
          if (p.type !== 'checklist') return '';
          const chk = state.checks[i];
          const done = chk.filter(Boolean).length;
          const ok = done === chk.length;
          const t = splitTitle(p.title);
          return `
          <li class="${ok ? 'done' : (i === open ? 'active' : '')}" data-p="${i}">
            <span class="mk">${ok ? ICON.tick : (i === open ? ICON.cur : '')}</span>
            <span class="lbl">${esc((t.num ? t.num + ' ' : '') + t.name)}</span>
            <span class="leader"></span>
            <span class="resp">${ok ? 'COMPLETE' : done + '/' + chk.length}</span>
          </li>`;
        }).join('')}
      </ul>
      <div class="banner ${n ? '' : 'ok'}">${n
        ? 'NOT READY · ' + n + ' CHECKLIST' + (n > 1 ? 'S' : '') + ' OPEN'
        : 'ALL CHECKLISTS COMPLETE'}</div>`;
    c.querySelectorAll('li').forEach(li =>
      li.addEventListener('click', () => goTo(Number(li.dataset.p))));
  }

  // Clear every checklist page (the RESET ALL key on the STATUS page).
  function resetAllChecklists() {
    pages.forEach((p, i) => {
      if (p.type === 'checklist') { state.checks[i] = p.items.map(() => false); cursors[i] = 0; }
    });
    save();
    render();
    toast('ALL CHECKLISTS RESET');
  }

  // Refresh every live reading currently on screen (battery %, charging…).
  function updateLiveItems() {
    document.querySelectorAll('#content [data-live]').forEach(el => {
      const v = Live.value(el.dataset.live);
      el.textContent = v ? v.text : '—';
      el.classList.remove('lv-red', 'lv-amber', 'lv-green', 'lv-cyan');
      if (v && v.cls) el.classList.add('lv-' + v.cls);
    });
  }

  // FLIGHT DATA: six tiles. Each is  LABEL + cyan tag (mode/source) · big
  // value with a cyan unit · one supporting line. Values are green when
  // normal; wind is shown white because it is a forecast we don't judge.
  function renderData(c) {
    c.innerHTML = `
      <div class="tiles">
        <div class="tile">
          <div class="tl"><span>TIME</span><span class="tag">LCL</span></div>
          <div class="tv"><span id="dLocal">--:--</span><span class="tsec" id="dSec">:--</span></div>
          <div class="ts"><span>UTC</span><span class="v" id="dUtc">--:--</span></div>
        </div>
        <div class="tile tap" id="tileTimer">
          <div class="tl"><span>TIMER</span><span class="tag" id="tState"></span></div>
          <div class="tvrow">
            <div class="tv" id="tVal"><span id="dTimer">0:00</span><span class="tsec" id="dTsec">:00</span></div>
            <button class="tkey" id="tReset" aria-label="reset timer">RST</button>
          </div>
          <div class="ts" id="tHint">TAP TILE TO START</div>
        </div>
        <div class="tile tap" id="tileAlt">
          <div class="tl"><span>ALT GPS</span><span class="tag" id="altMode"></span></div>
          <div class="tv"><span id="dAlt" class="nodata">—</span><span class="tu" id="dAltU"></span></div>
          <div class="ts" id="dGps">GPS: WAITING…</div>
        </div>
        <div class="tile">
          <div class="tl"><span>SUNSET</span><span class="tag">LCL</span></div>
          <div class="tv"><span id="dSun" class="nodata">—</span></div>
          <div class="ts"><span>DAYLIGHT</span><span class="v" id="dDay">—</span></div>
        </div>
        <div class="tile two">
          <div class="tb tap" id="tileQnh">
            <div class="tl"><span>QNH</span><span class="tag" id="qMode"></span></div>
            <div class="tv"><span id="dQnh" class="nodata">—</span></div>
            <div class="ts"><span class="lv-cyan">HPA</span></div>
          </div>
          <div class="tb">
            <div class="tl"><span>TEMP</span><span class="tag">FCST</span></div>
            <div class="tv"><span id="dTemp" class="nodata">—</span><span class="tu">°C</span></div>
            <div class="ts">&nbsp;</div>
          </div>
        </div>
        <div class="tile tap" id="tileWind">
          <div class="tl"><span>WIND</span><span class="tag" id="wTag">FCST</span></div>
          <div class="tv white"><span id="wSpd" class="nodata">—</span><span class="gap" id="wGst"></span><span class="tu" id="wUnit"></span></div>
          <div class="ts"><span>FROM</span><span class="v white nodata" id="wDir">—</span><span class="lv-cyan" id="wCmp"></span></div>
        </div>
      </div>`;
    // Tap the TIMER tile to start / pause; RST clears it.
    $('#tileTimer').addEventListener('click', () => {
      if (state.timerStart) {
        state.timerAcc += Date.now() - state.timerStart;
        state.timerStart = null;
      } else {
        state.timerStart = Date.now();
      }
      save();
      tick();
    });
    $('#tReset').addEventListener('click', e => {
      e.stopPropagation(); // the key sits inside the tappable tile
      state.timerStart = null;
      state.timerAcc = 0;
      save();
      tick();
    });
    // Tap the ALT GPS tile to cycle its units: AUTO → M → FT.
    $('#tileAlt').addEventListener('click', () => {
      AltUnit.cycle();
      updateGeo();
      toast('ALT UNITS: ' + AltUnit.get().toUpperCase());
    });
    // Tap QNH to set it by hand (like winding an altimeter); blank clears
    // the manual value and returns to the automatic weather reading.
    $('#tileQnh').addEventListener('click', () => {
      const cur = Weather.qnh();
      const v = prompt('QNH (hPa) — leave blank for automatic:', cur == null ? '' : cur);
      if (v === null) return;
      Weather.setManualQnh(v.trim() === '' ? null : parseInt(v, 10));
      updateWeather();
    });
    // Tap the WIND tile to cycle its units: KM/H → MPH → KT.
    $('#tileWind').addEventListener('click', () => {
      WindUnit.cycle();
      updateWeather();
      toast('WIND UNITS: ' + WindUnit.label());
    });
    updateGeo();
    updateWeather();
  }

  // SYSTEMS: a synoptic of the links the deck depends on. Cards are placed
  // in % and the lines drawn in the same 552×370 coordinate space, so they
  // stay joined at any size. Colour = state (green ok, amber/red not, grey
  // unknown). The phone can't see the power bank itself — only whether it
  // is being charged — so that card reports supply, not a charge level.
  function renderSystems(c) {
    c.innerHTML = `
      <div class="syn">
        <svg class="synl" viewBox="0 0 552 370" preserveAspectRatio="none" aria-hidden="true">
          <line id="lnPwr" x1="190" y1="84" x2="330" y2="84"/>
          <line x1="420" y1="138" x2="420" y2="195"/>
          <line x1="102" y1="195" x2="450" y2="195"/>
          <line id="lnNet" x1="102" y1="195" x2="102" y2="252"/>
          <line id="lnGps" x1="276" y1="195" x2="276" y2="252"/>
          <line id="lnSp" x1="450" y1="195" x2="450" y2="252"/>
        </svg>
        <div class="card" id="cdPwr" style="left:7.25%;top:11.9%;width:27.2%;height:21.6%">
          <span class="ct">PWR BANK</span><span class="cv" id="syPwr">—</span></div>
        <div class="card" id="cdBat" style="left:59.8%;top:8.1%;width:32.6%;height:29.2%">
          <span class="ct">PHONE BATT</span><span class="big" id="syBat">—</span><span class="cv" id="syChg">—</span></div>
        <div class="card" id="cdNet" style="left:7.25%;top:68.1%;width:22.5%;height:21.6%">
          <span class="ct">NET</span><span class="cv" id="syNet">—</span></div>
        <div class="card" id="cdGps" style="left:38.8%;top:68.1%;width:22.5%;height:21.6%">
          <span class="ct">GPS</span><span class="cv" id="syGps">—</span></div>
        <div class="card" id="cdSp" style="left:70.3%;top:68.1%;width:22.5%;height:21.6%">
          <span class="ct">SPOTIFY</span><span class="cv" id="sySp">—</span></div>
        <div class="synlbl" style="left:47.1%;top:14.3%">USB</div>
        <div class="synlbl" id="syUsb" style="left:47.1%;top:25.9%"></div>
      </div>`;
    updateSystems();
  }

  function updateSystems() {
    if (!$('#cdPwr')) return; // not on the SYSTEMS page
    const put = (id, base, text, lv) => {
      const el = $(id);
      el.textContent = text;
      el.className = base + (lv ? ' lv-' + lv : '');
    };
    const card = (id, st) => { $(id).className = 'card' + (st ? ' ' + st : ''); };
    const line = (id, st) => { $(id).setAttribute('class', st || ''); };

    // power: bank → phone
    const b = Live.batt();
    if (!b) {
      put('#syPwr', 'cv', 'NO DATA', 'dim');  card('#cdPwr', 'unk');
      put('#syBat', 'big', '—', 'dim');
      put('#syChg', 'cv', 'NO DATA', 'dim');  card('#cdBat', 'unk');
      line('#lnPwr', 'unk');
      put('#syUsb', 'synlbl', '', '');
    } else {
      put('#syBat', 'big', Math.round(b.level * 100) + '%',
          b.level < 0.30 ? 'red' : b.level < 0.90 ? 'amber' : 'green');
      if (b.charging) {
        put('#syPwr', 'cv', 'SUPPLYING', 'green');  card('#cdPwr', '');
        put('#syChg', 'cv', 'CHG', 'green');        card('#cdBat', '');
        line('#lnPwr', '');
        put('#syUsb', 'synlbl', 'CHARGING', 'green');
      } else {
        put('#syPwr', 'cv', 'NO SUPPLY', 'red');    card('#cdPwr', 'bad');
        put('#syChg', 'cv', 'ON BATT', 'red');      card('#cdBat', 'bad');
        line('#lnPwr', 'bad');
        put('#syUsb', 'synlbl', 'NOT CHARGING', 'red');
      }
    }

    // network
    const on = navigator.onLine;
    put('#syNet', 'cv', on ? 'ONLINE' : 'OFFLINE', on ? 'green' : 'amber');
    card('#cdNet', on ? '' : 'off');
    line('#lnNet', on ? '' : 'off');

    // gps (a fix counts while it is under a minute old)
    const fresh = lastFix && Date.now() - lastFixAt < 60000;
    if (!navigator.geolocation) {
      put('#syGps', 'cv', 'N/A', 'dim');  card('#cdGps', 'unk');  line('#lnGps', 'unk');
    } else if (fresh) {
      put('#syGps', 'cv', 'FIX ±' + Math.round(lastFix.coords.accuracy) + ' M', 'green');
      card('#cdGps', '');  line('#lnGps', '');
    } else if (geoErr) {
      put('#syGps', 'cv', 'NO FIX', 'amber');  card('#cdGps', 'off');  line('#lnGps', 'off');
    } else {
      put('#syGps', 'cv', 'ACQUIRING', 'cyan');  card('#cdGps', 'unk');  line('#lnGps', 'unk');
    }

    // spotify
    const SP = {
      playing:  ['PLAYING', 'green', ''],
      paused:   ['PAUSED', 'green', ''],
      nodevice: ['NO DEVICE', 'amber', 'off'],
      premium:  ['NO PREMIUM', 'amber', 'off'],
      error:    ['ERROR', 'amber', 'off'],
    };
    const sp = !Spotify.connected() ? ['NOT LINKED', 'dim', 'unk']
             : !on                  ? ['NO LINK', 'amber', 'off']
             : SP[spState]          || ['CHECKING', 'cyan', 'unk'];
    put('#sySp', 'cv', sp[0], sp[1]);
    card('#cdSp', sp[2]);
    line('#lnSp', sp[2]);
  }

  // Spotify link state for the SYSTEMS page. Self-gates to that page; the
  // MUSIC page's own now-playing refresh keeps the same variable current.
  let spState = null; // 'playing' | 'paused' | 'nodevice' | 'premium' | 'error'
  const spStateOf = e => e.message === 'NO_DEVICE' ? 'nodevice'
                       : e.message === 'PREMIUM_REQUIRED' ? 'premium' : 'error';
  async function pollSpotify() {
    if (pages[state.page].type !== 'systems') return;
    if (Spotify.connected() && navigator.onLine) {
      try {
        const s = await Spotify.nowPlaying();
        spState = s ? (s.playing ? 'playing' : 'paused') : 'nodevice';
      } catch (e) { spState = spStateOf(e); }
    }
    updateSystems();
  }

  function renderMusic(c) {
    if (Spotify.connected()) {
      const quick = getQuick();
      // Layout: transport column · middle (now-playing, position, volume,
      // track list — or the notes editor) · scroll keys for the middle.
      c.innerHTML = `
        <div class="player">
          <div class="pleft">
            <button class="pbtn" id="mPrev" aria-label="previous track">${ICON.prev}</button>
            <button class="pbtn grn" id="mToggle" aria-label="play or pause">${ICON.playpause}</button>
            <button class="pbtn" id="mNext" aria-label="next track">${ICON.next}</button>
            <button class="minikey grn" id="mQuick">${quick
              ? ICON.play + `<span class="ell">${esc(quick.name)}</span>`
              : '<span class="ell">+ PLAYLIST</span>'}</button>
            <button class="minikey" id="mSetup">SETUP</button>
          </div>
          ${musicPanel === 'tracklist' ? `
          <div class="pmid">
            <div class="mnow" id="mNow"><span class="mnowclip"><span class="mnowtxt">…</span></span></div>
            <div class="mprog">
              <span id="mPos">-:--</span>
              <div class="bar"><div class="fill" id="mBar"></div></div>
              <span id="mDur">-:--</span>
            </div>
            <div class="mvol na">
              <button class="vkey" id="mVolDn" aria-label="volume down">${ICON.minus}</button>
              <span class="vl">VOL</span>
              <div class="segs">${'<span class="seg"></span>'.repeat(10)}</div>
              <span id="mVolN">--</span>
              <button class="vkey" id="mVolUp" aria-label="volume up">${ICON.plus}</button>
            </div>
            <ul class="tracklist" id="mList"><li class="tldim">Loading playlist…</li></ul>
          </div>
          <div class="nscroll">
            <button class="nbtn" id="mListUp" aria-label="scroll up">${ICON.up}</button>
            <button class="nbtn" id="mListDown" aria-label="scroll down">${ICON.down}</button>
          </div>`
          : notesEditorHtml('mNotes', 'mNotesReset', 'NOTES — SAVED ON THIS PHONE')}
        </div>
        ${!setupOpen ? '' : `
        <div class="overlay" id="mSetupOv">
          <div class="setup">
            <div class="setuphead">MUSIC SETUP</div>
            <button class="minikey ${keepAwake ? 'on' : ''}" id="mKeep"><span class="lamp"></span><span>KEEP AWAKE</span><span class="kstate">${keepAwake ? 'ON' : 'OFF'}</span></button>
            <button class="minikey warn" id="mLogout">DISCONNECT SPOTIFY</button>
            <button class="minikey cyn" id="mSetupClose">CLOSE</button>
          </div>
        </div>`}`;
      $('#mPrev').addEventListener('click', () => spCmd('prev', true));
      $('#mNext').addEventListener('click', () => spCmd('next', true));
      $('#mToggle').addEventListener('click', () => spCmd('toggle'));
      $('#mQuick').addEventListener('click', quickPlay);
      $('#mSetup').addEventListener('click', () => { setupOpen = true; render(); });
      if (setupOpen) {
        $('#mKeep').addEventListener('click', () => {
          setKeepAwake(!keepAwake);
          render();
          // Same words as the button, and "NOW" makes clear the toast is
          // reporting the state you just switched into, not an instruction.
          if (keepAwake) { toast('KEEP AWAKE NOW ON — TESTING…'); doKeepAlive(); }
          else toast('KEEP AWAKE NOW OFF');
        });
        $('#mLogout').addEventListener('click', () => {
          setupOpen = false;
          Spotify.logout();
          render();
        });
        $('#mSetupClose').addEventListener('click', () => { setupOpen = false; render(); });
        // a tap on the dimmed backdrop (outside the panel) also closes
        $('#mSetupOv').addEventListener('click', e => {
          if (e.target.id === 'mSetupOv') { setupOpen = false; render(); }
        });
      }
      if (musicPanel === 'tracklist') {
        nowShown = null; // header was just rebuilt — force the next refresh to draw
        bindScroll('mListUp', 'mListDown', '#mList');
        $('#mVolDn').addEventListener('click', () => changeVolume(-10));
        $('#mVolUp').addEventListener('click', () => changeVolume(10));
        updateProgress(); // redraw from what we already know while the
        updateVolume();   // fresh reading is on its way
        refreshNowPlaying();
        refreshPlaylist();
      } else {
        bindNotesEditor('mNotes', 'mNotesReset');
      }
    } else {
      c.innerHTML = `
        <div class="music">
          <p>Remote-controls the Spotify app playing in the background on this phone.
             One-time setup (needs internet + Spotify Premium): create a free app at
             developer.spotify.com, register this page's URL as the redirect URI,
             then paste the Client ID below — details in the README.</p>
          <input id="mCid" placeholder="Spotify Client ID"
                 value="${esc(Spotify.clientId())}" autocomplete="off" spellcheck="false">
          <button class="bigkey" id="mConnect">CONNECT SPOTIFY</button>
        </div>`;
      $('#mConnect').addEventListener('click', () => {
        const v = $('#mCid').value.trim();
        if (!v) { toast('PASTE YOUR CLIENT ID FIRST'); return; }
        if (!navigator.onLine) { toast('NEED INTERNET TO CONNECT'); return; }
        Spotify.login(v).catch(() => toast('SPOTIFY LOGIN FAILED'));
      });
    }
  }

  // ---- notes page ----

  // Editable-notes block for the MUSIC page. Includes ▲/▼ scroll buttons since
  // touch-dragging inside the textarea isn't reliable in XCTrack's WebView.
  const notesEditorHtml = (taId, resetId, header) => `
    <div class="pmid">
      <div class="nhead">
        <span class="nlbl">${header}</span>
        <button class="minikey warn" id="${resetId}">RESET</button>
      </div>
      <textarea id="${taId}" class="notesArea" spellcheck="false"
        placeholder="Your notes…">${esc(getNotes())}</textarea>
    </div>
    <div class="nscroll">
      <button class="nbtn" id="${taId}Up" aria-label="scroll notes up">${ICON.up}</button>
      <button class="nbtn" id="${taId}Down" aria-label="scroll notes down">${ICON.down}</button>
    </div>`;

  // Wire ▲/▼ buttons to scroll a target element (touch-drag is unreliable in
  // XCTrack's WebView), used by both the notes textarea and the track list.
  function bindScroll(upId, downId, sel) {
    const el = $(sel);
    if (!el) return;
    const by = dir => () => { el.scrollTop += dir * el.clientHeight * 0.6; };
    $('#' + upId).addEventListener('click', by(-1));
    $('#' + downId).addEventListener('click', by(1));
  }

  function bindNotesEditor(taId, resetId) {
    const ta = $('#' + taId);
    ta.addEventListener('input', () => localStorage.setItem(NOTES_KEY, ta.value));
    $('#' + resetId).addEventListener('click', () => {
      if (!confirm('Reset notes to the default from checklists.js?')) return;
      localStorage.removeItem(NOTES_KEY);
      ta.value = getNotes();
    });
    bindScroll(taId + 'Up', taId + 'Down', '#' + taId);
  }

  // Read-only notes, shown in the track-list area when the list can't load
  // (offline / no active device). Escaped; newlines preserved via CSS.
  const notesReadonlyHtml = () =>
    `<li class="tlnotes"><div class="tlnotes-h">NOTES</div>` +
    `<div class="tlnotes-b">${esc(getNotes()) || '<span class="tldim">No notes yet</span>'}</div></li>`;

  // ---- spotify glue ----

  function spErrMsg(e) {
    if (!navigator.onLine)                return 'OFFLINE — NO MUSIC CONTROL';
    if (e.message === 'NO_DEVICE')        return 'NO DEVICE — PRESS PLAY IN SPOTIFY ONCE';
    if (e.message === 'PREMIUM_REQUIRED') return 'SPOTIFY PREMIUM REQUIRED';
    if (e.message === 'NOT_CONNECTED')    return 'SPOTIFY: NOT CONNECTED';
    return 'SPOTIFY ERROR (' + e.message + ')';
  }

  // Keep-alive tick: nudge the active device so it doesn't drop off Connect.
  // Runs on a timer while enabled; also fired once when the toggle is switched
  // on (which surfaces whether a device is actually reachable right now).
  let keepAliveShownNoDevice = false;
  async function doKeepAlive() {
    if (!keepAwake || !Spotify.connected() || !navigator.onLine) return;
    try {
      const r = await Spotify.keepAlive();
      if (r === 'no-device' && !keepAliveShownNoDevice && onTracklist()) {
        keepAliveShownNoDevice = true;
        toast('KEEP AWAKE: NO DEVICE YET — PRESS PLAY IN SPOTIFY ONCE');
      } else if (r === 'ok') {
        keepAliveShownNoDevice = false;
      }
    } catch (e) { /* transient; try again next tick */ }
  }

  async function spCmd(cmd, refreshList) {
    if (!Spotify.connected()) { goTo(MUSIC_PAGE); return; } // jump to MUSIC setup
    try {
      await Spotify[cmd]();
      if (onTracklist()) {
        setTimeout(refreshNowPlaying, 700);
        if (refreshList) setTimeout(refreshPlaylist, 800);
      }
    } catch (e) {
      toast(spErrMsg(e));
    }
  }

  // ---- quick-start playlist (the ▶ FLIGHT button) ----

  // Tap = start the pinned playlist on the phone (waking an idle-but-listed
  // device if needed). If that playlist is already playing, the tap instead
  // offers to change the pinned link — the one moment the button has no other
  // job, so a mid-flight tap can never open a keyboard by surprise.
  async function quickPlay() {
    if (!navigator.onLine) { toast('NEED INTERNET TO CONTROL SPOTIFY'); return; }
    let quick = getQuick();
    if (quick) {
      let s = null;
      try { s = await Spotify.nowPlaying(); } catch (e) { /* just try to start it */ }
      if (s && s.context === quick.uri) {
        if (!s.playing) { spCmd('toggle'); return; } // right playlist, paused → resume
        quick = quickSetup(quick);                   // already playing → offer change
      }
    } else {
      quick = quickSetup(null);
    }
    if (!quick) return;
    try {
      toast('STARTING ' + quick.name + '…');
      await Spotify.playContext(quick.uri);
      setTimeout(refreshNowPlaying, 700);
      setTimeout(refreshPlaylist, 900);
    } catch (e) { toast(spErrMsg(e)); }
  }

  // One-time (or change-of-heart) setup: paste the playlist's share link.
  // Blank reverts to the QUICKPLAY_DEFAULT from js/checklists.js (if any).
  function quickSetup(cur) {
    const v = prompt(
      'Spotify playlist link for this button\n(in Spotify: Share → Copy link)' +
      (cur ? '\nLeave blank to reset:' : ':'),
      cur ? cur.link : '');
    if (v === null) return null;                              // cancelled
    if (!v.trim()) { setQuick(null); render(); return null; } // back to default
    const q = parseQuick(v.trim(), null);
    if (!q) { toast("THAT ISN'T A SPOTIFY PLAYLIST LINK"); return null; }
    setQuick(q);
    render();
    // Best-effort real name for the label (some lists refuse API reads).
    Spotify.contextName(q.uri.split(':')[1], q.uri.split(':')[2])
      .then(n => { if (n) { q.name = n.toUpperCase(); setQuick(q); render(); } })
      .catch(() => {});
    return q;
  }

  // Keeps the track list's "now playing" header + highlight in sync. Only runs
  // while the TRACKLIST panel is visible; no-op otherwise.
  let curUri = null;
  async function refreshNowPlaying() {
    if (!onTracklist() || !Spotify.connected() || !navigator.onLine) return;
    try {
      const s = await Spotify.nowPlaying();
      if (s) {
        setNowPlaying(s.playing ? 'play' : 'pause', s.track);
        np = { progress: s.progress, duration: s.duration, playing: s.playing, at: Date.now() };
        vol = { v: s.volume, can: s.canVolume };
        spState = s.playing ? 'playing' : 'paused';
      } else {
        setNowPlaying('', 'NOTHING PLAYING — PRESS PLAY IN SPOTIFY');
        np = null;
        spState = 'nodevice';
      }
      const newUri = s ? s.uri : null;
      if (newUri !== curUri) { curUri = newUri; highlightCurrent(); }
    } catch (e) {
      setNowPlaying('', spErrMsg(e));
      np = null;
      spState = spStateOf(e);
    }
    updateProgress();
    updateVolume();
  }

  // Writes the now-playing strip. Only touches the DOM when the text actually
  // changes, so the 12 s poll doesn't restart the ticker mid-scroll.
  // icon: 'play' | 'pause' | '' (a message rather than a track).
  let nowShown = null;
  function setNowPlaying(icon, text) {
    const key = icon + ' ' + text;
    if (key === nowShown) return;
    const el = $('#mNow');
    if (!el) return;
    nowShown = key;
    el.innerHTML = (icon ? `<span class="mnowicon">${ICON[icon]}</span>` : '') +
      `<span class="mnowclip"><span class="mnowtxt">${esc(text)}</span></span>`;
    fitTicker();
  }

  // Track position. Spotify is only polled every 12 s, so between polls the
  // bar is advanced locally from the last reading (once a second, from tick).
  let np = null; // { progress, duration (ms), playing, at (ms epoch of reading) }
  const mmss = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + pad(s % 60);
  };
  function updateProgress() {
    const bar = $('#mBar');
    if (!bar) return;
    if (!np || !np.duration) {
      bar.style.width = '0';
      setTxt('#mPos', '-:--');
      setTxt('#mDur', '-:--');
      return;
    }
    const pos = Math.min(np.duration, np.progress + (np.playing ? Date.now() - np.at : 0));
    bar.style.width = (100 * pos / np.duration).toFixed(1) + '%';
    setTxt('#mPos', mmss(pos));
    setTxt('#mDur', mmss(np.duration));
    // Reached the end: the next track has started — fetch it now rather than
    // sitting on a full bar until the next poll.
    if (np.playing && pos >= np.duration) {
      np.playing = false;
      setTimeout(refreshNowPlaying, 800);
    }
  }

  // Volume, in steps of 10. Not every device lets Spotify set its volume;
  // when it doesn't, the row greys out and the keys say so.
  let vol = null; // { v: 0..100 | null, can: bool }
  const volOk = () => !!(vol && vol.can && typeof vol.v === 'number');
  function updateVolume() {
    const row = $('.mvol');
    if (!row) return;
    const ok = volOk();
    row.classList.toggle('na', !ok);
    setTxt('#mVolN', ok ? vol.v : '--');
    row.querySelectorAll('.seg').forEach((s, i) =>
      s.classList.toggle('on', ok && vol.v >= (i + 1) * 10 - 5));
  }
  async function changeVolume(d) {
    if (!navigator.onLine) { toast('OFFLINE — NO MUSIC CONTROL'); return; }
    if (!vol) { toast('NO DEVICE YET — PRESS PLAY IN SPOTIFY ONCE'); return; }
    if (!volOk()) { toast("THIS DEVICE WON'T LET SPOTIFY SET ITS VOLUME"); return; }
    const was = vol.v;
    vol.v = Math.max(0, Math.min(100, Math.round((was + d) / 10) * 10));
    updateVolume(); // show the change at once; undo it if Spotify refuses
    try {
      await Spotify.setVolume(vol.v);
    } catch (e) {
      vol.v = was;
      updateVolume();
      toast(spErrMsg(e));
    }
  }

  // Track names are routinely wider than the now-playing strip, so scroll
  // them back and forth instead of truncating. Travel and
  // duration are measured per name to keep the reading speed constant; a name
  // that already fits is left still.
  const TICKER_PXPS = 50;   // px/second while moving
  const TICKER_MOVE = 0.64; // share of the cycle spent moving (rest = dwell)
  function fitTicker() {
    const clip = $('#mNow .mnowclip');
    const txt  = $('#mNow .mnowtxt');
    if (!clip || !txt) return;
    txt.classList.remove('roll');
    clip.classList.remove('fade');
    const over = txt.getBoundingClientRect().width - clip.clientWidth;
    if (over <= 1) return;               // fits — nothing to scroll
    const travel = Math.ceil(over) + 14; // clear the fade at the far edge
    txt.style.setProperty('--mshift', -travel + 'px');
    txt.style.setProperty('--mdur',
      Math.max(4, travel / TICKER_PXPS / TICKER_MOVE).toFixed(1) + 's');
    txt.classList.add('roll');
    clip.classList.add('fade');
  }

  function highlightCurrent() {
    document.querySelectorAll('#mList li[data-uri]').forEach(li =>
      li.classList.toggle('cur', li.dataset.uri === curUri));
  }

  async function refreshPlaylist() {
    const list = $('#mList');
    if (!list) return; // not on the music page
    // When the track list can't load (offline, no Premium, no device), reuse
    // the space to show your notes read-only rather than a bare error line.
    const showNotes = (msg) => {
      list.innerHTML = `<li class="tldim">${esc(msg)}</li>` + notesReadonlyHtml();
    };
    if (!navigator.onLine) { showNotes('Offline — track list unavailable'); return; }
    try {
      const pl = await Spotify.playlist();
      if (!pl || !pl.tracks.length) {
        showNotes('No active device — open Spotify and press play');
        return;
      }
      curUri = pl.current;
      // Queue fallback header. An unreadable playlist usually just means the
      // playlist-read permission hasn't been granted yet (it only arrives on a
      // fresh CONNECT) — say so, actionably. Once granted, a still-unreadable
      // list is a Spotify-side block (editorial lists): show plain play order
      // with no explanation row. Free play keeps its label so autoplay
      // recommendations can't be mistaken for a playlist.
      const needScope = pl.contextUri && !Spotify.hasScope('playlist-read-private');
      const head = !pl.queue ? '' :
        pl.repeat === 'track'
          ? '<li class="tldim">UP NEXT — repeat-1 is on, one track loops</li>'
        : needScope
          ? '<li class="tldim">To show the playlist: SETUP, DISCONNECT, then CONNECT once (new permission)</li>'
        : pl.contextUri ? ''
        : '<li class="tldim">UP NEXT — not playing from a playlist</li>';
      list.innerHTML = head + pl.tracks.map(t => `
        <li data-uri="${esc(t.uri)}" class="${t.uri === pl.current ? 'cur' : ''}">
          <span class="tname">${esc(t.name)}</span>
          <span class="tart">${esc(t.artist)}</span>
        </li>`).join('');
      list.querySelectorAll('li[data-uri]').forEach(li =>
        li.addEventListener('click', async () => {
          try {
            await Spotify.playAt(li.dataset.uri, pl.contextUri,
                                 pl.queue ? pl.tracks.map(x => x.uri) : null);
            curUri = li.dataset.uri;
            highlightCurrent();
            setTimeout(refreshNowPlaying, 700);
          } catch (e) { toast(spErrMsg(e)); }
        }));
      // scroll the current track into view
      const cur = list.querySelector('li.cur');
      if (cur) cur.scrollIntoView({ block: 'center' });
    } catch (e) {
      showNotes(spErrMsg(e));
    }
  }

  // ---- flight data: clock / timer / battery / gps ----

  // Once a second: clocks, the timer, daylight remaining, track position.
  function tick() {
    const now = new Date();
    const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    setTxt('#clock', hm);
    setTxt('#dLocal', hm);
    setTxt('#dSec', ':' + pad(now.getSeconds()));
    setTxt('#dUtc', pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()));

    // timer as H:MM with small :SS
    const running = !!state.timerStart;
    const ms = state.timerAcc + (running ? Date.now() - state.timerStart : 0);
    const totalS = Math.floor(ms / 1000);
    setTxt('#dTimer', Math.floor(totalS / 3600) + ':' + pad(Math.floor((totalS % 3600) / 60)));
    setTxt('#dTsec', ':' + pad(totalS % 60));
    const ts = $('#tState');
    if (ts) {
      ts.textContent = running ? 'RUNNING' : (ms > 0 ? 'PAUSED' : 'STOPPED');
      ts.className = 'tag' + (running ? ' lv-green' : '');
      $('#tVal').classList.toggle('white', !running); // green only while counting
      setTxt('#tHint', running ? 'TAP TILE TO PAUSE' : 'TAP TILE TO START');
    }

    updateSun(now);
    updateProgress();
  }

  // ---- sunset ----

  // Sunrise and sunset for the solar day nearest `date`, at lat/lon (degrees,
  // east positive). Standard low-precision solar position — good to a minute
  // or two, and needs no network. Returns null where the sun doesn't cross
  // the horizon that day (polar day / night).
  function sunTimes(date, lat, lon) {
    const rad = Math.PI / 180, DAY = 86400000, J1970 = 2440588, J2000 = 2451545;
    const d = date.getTime() / DAY - 0.5 + J1970 - J2000;
    const lw = -lon * rad, phi = lat * rad;
    const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
    const ds = 0.0009 + lw / (2 * Math.PI) + n;          // approx. solar noon
    const M = rad * (357.5291 + 0.98560028 * ds);         // mean anomaly
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;           // ecliptic longitude
    const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
    const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    // -0.833° = sun's upper edge on the horizon, allowing for refraction
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) /
                 (Math.cos(phi) * Math.cos(dec));
    if (cosH < -1 || cosH > 1) return null;
    const H = Math.acos(cosH) / (2 * Math.PI);
    const toDate = j => new Date((j + 0.5 - J1970) * DAY);
    return { rise: toDate(noon - H), set: toDate(noon + H) };
  }

  // SUNSET tile: today's sunset (local time) and the daylight left — amber
  // inside the last hour, red once the sun is down. Uses the last known
  // position, so it works straight away and offline.
  function updateSun(now) {
    const el = $('#dSun');
    if (!el) return;
    const day = $('#dDay');
    const p = Pos.get();
    const t = p ? sunTimes(now, p.lat, p.lon) : null;
    if (!t) {
      setVal('#dSun', null);
      day.textContent = p ? 'N/A' : 'NO POSITION YET';
      day.className = 'v lv-dim';
      return;
    }
    setVal('#dSun', pad(t.set.getHours()) + ':' + pad(t.set.getMinutes()));
    const left = t.set - now;
    if (now < t.rise || left <= 0) {
      day.textContent = 'NIGHT';
      day.className = 'v lv-red';
    } else {
      const mins = Math.floor(left / 60000);
      day.textContent = Math.floor(mins / 60) + 'H' + pad(mins % 60);
      day.className = 'v' + (mins < 60 ? ' lv-amber' : '');
    }
  }

  // ---- live phone readings (battery / charging) ----

  const Live = (() => {
    let batt = null; // { level: 0..1, charging: bool }
    const subs = [];
    function init() {
      if (!navigator.getBattery) return;
      navigator.getBattery().then(b => {
        const upd = () => { batt = { level: b.level, charging: b.charging }; subs.forEach(f => f()); };
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
        upd();
      }).catch(() => {});
    }
    // Returns { text, cls } where cls is 'red' | 'amber' | 'green' for colour.
    function value(key) {
      // QNH comes from the Weather module (not the battery), so handle it first.
      // Green = automatic reading, cyan = set by the pilot.
      if (key === 'qnh') {
        const q = Weather.qnh();
        return q == null ? null : { text: String(q), cls: Weather.isManual() ? 'cyan' : 'green' };
      }
      if (!batt) return null;
      if (key === 'battery') {
        // red < 30%, amber < 90%, green ≥ 90%
        const cls = batt.level < 0.30 ? 'red' : batt.level < 0.90 ? 'amber' : 'green';
        return { text: Math.round(batt.level * 100) + '%', cls };
      }
      // red when unplugged — on the deck the phone should be on the powerbank
      if (key === 'charging') return { text: batt.charging ? 'CHG' : 'ON BATT', cls: batt.charging ? 'green' : 'red' };
      return null;
    }
    return { init, onChange: f => subs.push(f), value, batt: () => batt };
  })();

  // Battery changed: data-line figure (in its state colour), the annunciator
  // (ON BATT / BATT LOW) and the SYSTEMS page if it is showing.
  function updateBattery() {
    const b = Live.value('battery');
    if (b) {
      const el = $('#batt');
      el.textContent = b.text;
      el.className = 'dv lv-' + b.cls;
    }
    updateMemo();
    updateSystems();
  }

  // ---- weather (QNH + outside temp) ----
  // Phones don't expose barometric pressure or outside-air temperature to a
  // web page, so we read them from a free, keyless weather API (open-meteo)
  // by GPS position while online, and cache the last values for offline use.
  // QNH can also be set by hand, which overrides the fetched value.

  const Weather = (() => {
    const LSW = 'pfc.wx.v1';
    let wx = {};
    try { wx = JSON.parse(localStorage.getItem(LSW) || '{}'); } catch (e) { wx = {}; }
    const save = () => localStorage.setItem(LSW, JSON.stringify(wx));

    let lastLat = null, lastLon = null, lastAt = 0, inFlight = false;

    async function maybeFetch(coords, done) {
      if (!navigator.onLine) return;
      const now = Date.now();
      const moved = lastLat == null ||
        Math.abs(coords.latitude - lastLat) > 0.05 || Math.abs(coords.longitude - lastLon) > 0.05;
      if (inFlight || (!moved && now - lastAt < 10 * 60 * 1000)) return; // ≤ every 10 min
      inFlight = true;
      try {
        // Wind comes back in km/h (the API default); WindUnit converts for display.
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
          coords.latitude.toFixed(3) + '&longitude=' + coords.longitude.toFixed(3) +
          '&current=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
        const r = await fetch(url);
        const j = await r.json();
        if (j && j.current) {
          const cur = j.current;
          if (cur.pressure_msl != null) wx.qnh = Math.round(cur.pressure_msl);
          if (cur.temperature_2m != null) wx.temp = Math.round(cur.temperature_2m);
          wx.wind = cur.wind_speed_10m != null ? cur.wind_speed_10m : null;
          wx.gust = cur.wind_gusts_10m != null ? cur.wind_gusts_10m : null;
          wx.wdir = cur.wind_direction_10m != null ? cur.wind_direction_10m : null;
          wx.ts = now;
          save();
          lastLat = coords.latitude; lastLon = coords.longitude; lastAt = now;
          if (done) done();
        }
      } catch (e) { /* stay on cached values */ }
      finally { inFlight = false; }
    }

    return {
      maybeFetch,
      qnh:  () => (wx.manualQnh != null ? wx.manualQnh : (wx.qnh != null ? wx.qnh : null)),
      temp: () => (wx.temp != null ? wx.temp : null),
      // { spd, gust, dir } — km/h and degrees the wind blows FROM — or null
      wind: () => (wx.wind != null ? { spd: wx.wind, gust: wx.gust, dir: wx.wdir } : null),
      age: () => (wx.ts ? Date.now() - wx.ts : Infinity), // ms since the last fetch
      isManual: () => wx.manualQnh != null,
      setManualQnh: v => {
        if (v == null || isNaN(v)) delete wx.manualQnh; else wx.manualQnh = v;
        save();
      },
    };
  })();

  // Last known position, kept across restarts so SUNSET has something to work
  // from at once (and offline). Only rewritten when it has moved or aged, so
  // a 1 Hz GPS watch isn't a 1 Hz storage write.
  const Pos = (() => {
    const KEY = 'pfc.pos.v1';
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) { p = null; }
    return {
      get: () => (p && typeof p.lat === 'number' && typeof p.lon === 'number') ? p : null,
      set: c => {
        const now = Date.now();
        if (p && Math.abs(c.latitude - p.lat) < 0.01 && Math.abs(c.longitude - p.lon) < 0.01 &&
            now - p.ts < 5 * 60 * 1000) return;
        p = { lat: c.latitude, lon: c.longitude, ts: now };
        localStorage.setItem(KEY, JSON.stringify(p));
      },
    };
  })();

  // GPS is watched only while a page that shows it is up (FLIGHT DATA, SYSTEMS).
  let geoId = null, lastFix = null, lastFixAt = 0, geoErr = null;
  function startGeo() {
    if (geoId !== null) return;
    if (!navigator.geolocation) { setTxt('#dGps', 'GPS: NOT AVAILABLE'); return; }
    geoId = navigator.geolocation.watchPosition(
      pos => {
        lastFix = pos;
        lastFixAt = Date.now();
        geoErr = null;
        Pos.set(pos.coords);
        updateGeo();
        Weather.maybeFetch(pos.coords, updateWeather);
      },
      err => {
        geoErr = err.message || 'error';
        setTxt('#dGps', 'GPS: ' + geoErr);
        updateSystems();
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }
  function stopGeo() {
    if (geoId !== null) { navigator.geolocation.clearWatch(geoId); geoId = null; }
  }

  // Altitude units. Mode: 'auto' | 'm' | 'ft'. AUTO reads feet inside the UK/US
  // (where aviation altitude is flown in feet) and metres elsewhere, deduced
  // from the current GPS position — so it follows you between England and
  // Europe. Tap the ALT GPS tile to cycle AUTO → M → FT.
  const AltUnit = (() => {
    const KEY = 'pfc.altunit';
    const get = () => localStorage.getItem(KEY) || 'auto';
    const set = v => localStorage.setItem(KEY, v);
    const autoFor = c => {
      if (!c) return 'm';
      const inUK = c.latitude >= 49.8 && c.latitude <= 61.1 && c.longitude >= -8.7 && c.longitude <= 2.1;
      const inUS = c.latitude >= 24.4 && c.latitude <= 49.5 && c.longitude >= -125 && c.longitude <= -66.5;
      return (inUK || inUS) ? 'ft' : 'm';
    };
    const resolved = c => { const m = get(); return (m === 'm' || m === 'ft') ? m : autoFor(c); };
    return {
      get,
      cycle: () => { const o = ['auto', 'm', 'ft']; set(o[(o.indexOf(get()) + 1) % o.length]); },
      // value and unit separately: the unit is drawn smaller, in cyan
      parts: (metres, c) => metres == null ? { v: null, u: '' }
        : resolved(c) === 'ft' ? { v: Math.round(metres * 3.28084), u: 'FT' }
        : { v: Math.round(metres), u: 'M' },
    };
  })();

  // Wind units. Tap the WIND tile to cycle KM/H → MPH → KT. The weather feed
  // is km/h; this only converts for display.
  const WindUnit = (() => {
    const KEY = 'pfc.windunit', ORDER = ['kmh', 'mph', 'kt'];
    const FACTOR = { kmh: 1, mph: 0.621371, kt: 0.539957 };
    const LABEL = { kmh: 'KM/H', mph: 'MPH', kt: 'KT' };
    const get = () => {
      const v = localStorage.getItem(KEY);
      return ORDER.includes(v) ? v : 'kmh';
    };
    return {
      cycle: () => localStorage.setItem(KEY, ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]),
      conv: kmh => Math.round(kmh * FACTOR[get()]),
      label: () => LABEL[get()],
    };
  })();

  // 16-point compass name for a bearing in degrees.
  const compass = deg => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW',
    'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  function updateGeo() {
    setTxt('#altMode', AltUnit.get().toUpperCase());
    if (lastFix) {
      const c = lastFix.coords;
      const a = AltUnit.parts(c.altitude, c);
      setVal('#dAlt', a.v);
      setTxt('#dAltU', a.u);
      const g = $('#dGps');
      if (g) g.innerHTML = `<span>FIX</span><span class="v">±${Math.round(c.accuracy)} M</span>`;
    }
    updateSystems();
  }

  // Weather readings: FLIGHT DATA tiles, the data line's QNH, and the live
  // QNH item on the checklist. QNH is green when automatic, cyan when the
  // pilot set it by hand.
  function updateWeather() {
    const q = Weather.qnh(), t = Weather.temp(), man = Weather.isManual();

    const fq = $('#fQnh');
    fq.textContent = q == null ? '—' : q;
    fq.className = 'dv' + (q == null ? ' lv-dim' : man ? ' lv-cyan' : '');

    const qEl = $('#dQnh');
    if (qEl) {
      setVal('#dQnh', q);
      qEl.classList.toggle('lv-cyan', man && q != null);
      setTxt('#qMode', man ? 'MAN' : 'AUTO');
      setVal('#dTemp', t);

      // Wind is a forecast for this position, not a measurement — and a
      // stale one is worse than none, so flag it once it is over 90 min old.
      const w = Weather.wind();
      setVal('#wSpd', w ? WindUnit.conv(w.spd) : null);
      setTxt('#wGst', w && w.gust != null ? 'G' + WindUnit.conv(w.gust) : '');
      setTxt('#wUnit', WindUnit.label());
      setVal('#wDir', w && w.dir != null ? String(Math.round(w.dir)).padStart(3, '0') + '°' : null);
      setTxt('#wCmp', w && w.dir != null ? compass(w.dir) : '');
      const old = !!w && Weather.age() > 90 * 60 * 1000;
      const tag = $('#wTag');
      tag.textContent = old ? 'OLD' : 'FCST';
      tag.className = 'tag' + (old ? ' lv-amber' : '');
    }
    updateLiveItems(); // refresh the QNH reading on the XCTRACK checklist too
  }

  // Fetch weather once at startup (independent of the FLIGHT DATA page's live
  // GPS watch) so the checklist QNH reading is populated from the first visit.
  function primeWeather() {
    if (!navigator.geolocation || !navigator.onLine) return;
    navigator.geolocation.getCurrentPosition(
      pos => { Pos.set(pos.coords); Weather.maybeFetch(pos.coords, updateWeather); },
      () => {}, { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 }
    );
  }

  // Online state changed: the annunciator (OFFLINE) and the SYSTEMS page.
  function updateNet() {
    updateMemo();
    updateSystems();
  }

  // Force the very latest version: drop the service worker + all caches, then
  // reload past the WebView's HTTP cache. Lets you pull a new deploy without
  // clearing all of XCTrack's data (which would log you out of every widget).
  async function forceRefresh() {
    if (!navigator.onLine) { toast('OFFLINE — CONNECT TO UPDATE'); return; }
    toast('UPDATING…');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) { /* best effort */ }
    // Cache-busting query forces the WebView to re-fetch the document itself.
    location.replace(location.pathname + '?u=' + Date.now());
  }

  // ---- wiring ----

  function bindUI() {
    $('#btnUp').addEventListener('click', () => go(-1));
    $('#btnDown').addEventListener('click', () => go(1));
    $('#btnCheck').addEventListener('click', checkAction);
    $('#btnAdv').addEventListener('click', advAction);
    // Title-bar page key: RESET (this checklist) or, on STATUS, RESET ALL.
    $('#hkey').addEventListener('click', () => {
      const p = pages[state.page];
      if (p.type === 'status') resetAllChecklists();
      else if (p.type === 'checklist') resetPage(state.page);
    });
    window.addEventListener('online', () => { updateNet(); refreshNowPlaying(); pollSpotify(); });
    window.addEventListener('offline', updateNet);
    window.addEventListener('resize', fitTicker); // re-measure the ticker travel
    document.addEventListener('keydown', e => {
      // Don't hijack keys while editing a text field (notes / Spotify ID).
      const editing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (editing) return;
      if (e.key === 'ArrowUp')   go(-1);
      if (e.key === 'ArrowDown') go(1);
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          checkAction();
        }
      }
    });
  }

  async function init() {
    bindUI();
    // Build stamp (js/version.js, deploy-time), shown in the STATUS page's
    // data line. Identifies the running version at a glance — the antidote
    // to "did UPDATE actually update it?".
    setTxt('#build', typeof BUILD === 'string' ? BUILD : '?');
    Live.init();
    Live.onChange(updateBattery);
    Live.onChange(updateLiveItems);
    // Returning from the Spotify OAuth redirect? Land on the MUSIC page.
    try {
      if (await Spotify.handleRedirect()) {
        state.page = MUSIC_PAGE;
        save();
        toast('SPOTIFY CONNECTED');
      }
    } catch (e) {
      toast('SPOTIFY AUTH FAILED');
    }
    render();
    updateWeather(); // show the cached QNH in the data line straight away
    primeWeather();
    setInterval(tick, 1000);
    setInterval(refreshNowPlaying, 12000); // self-gates to the visible track list
    setInterval(pollSpotify, 12000);       // self-gates to the SYSTEMS page
    setInterval(doKeepAlive, 240000);      // every 4 min; self-gates on keepAwake
    // Offline capability: cache the whole app on first visit.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
