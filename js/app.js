// ============================================================
//  FlightDeck Checklist — main app.
//  Pages: N checklist pages (from js/checklists.js) + FLIGHT DATA
//  + MUSIC. UP/DOWN cycle pages, CHECK ticks the active item
//  EICAS-style. All state persists in localStorage; the service
//  worker keeps the whole site working with no internet.
// ============================================================

'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const LS_KEY = 'pfc.state.v1';

  // ---- pages ----

  const pages = [
    ...CHECKLISTS.map(c => ({ type: 'checklist', title: c.title, items: c.items })),
    { type: 'data',  title: 'FLIGHT DATA' },
    { type: 'music', title: 'MUSIC' },
  ];
  const CL_COUNT = CHECKLISTS.length;
  const MUSIC_PAGE = pages.findIndex(p => p.type === 'music');

  // The Spotify track list needs a Premium account. With no Premium, show the
  // editable notes on the MUSIC page instead. Flip to true if you go Premium.
  const SHOW_TRACKLIST = false;

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
    save();
    render();
  }
  function goTo(i) { state.page = i; save(); render(); }

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

  // CHECK button: tick the active item and move to the next unchecked item; on
  // a completed checklist go to the next page. On the MUSIC page it's play/pause;
  // on other pages it does nothing (Spotify control lives only on MUSIC).
  function checkAction() {
    const pi = state.page;
    const t = pages[pi].type;
    if (t !== 'checklist') { if (t === 'music') spCmd('toggle'); return; }
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
  // page's first unchecked item (wrapping around all pages).
  function advAction() {
    const pi = state.page;
    if (pages[pi].type !== 'checklist') return;
    const found = nextUncheckedGlobal(pi, activeIndex(pi));
    if (!found) return; // nothing unchecked anywhere
    cursors[found.page] = found.item;
    if (found.page !== pi) goTo(found.page);
    else render();
  }

  // EICAS-style flow: when a checklist page completes, advance to the
  // next checklist automatically after a short green pause.
  function maybeAdvance(pi) {
    if (!pageComplete(pi) || pi >= CL_COUNT - 1) return;
    setTimeout(() => {
      if (state.page === pi && pageComplete(pi)) go(1);
    }, 900);
  }

  // ---- rendering ----

  function render() {
    const p = pages[state.page];
    $('#title').textContent = p.title;
    renderDots();
    stopGeo();
    const c = $('#content');
    if (p.type === 'checklist')   renderChecklist(c, state.page);
    else if (p.type === 'data') { renderData(c); startGeo(); }
    else                          renderMusic(c);
    // Middle rail button: CHECK/NEXT on checklists, play/pause on MUSIC, and
    // nothing on FLIGHT DATA (Spotify control lives only on the MUSIC page).
    const btnCheck = $('#btnCheck');
    if (p.type === 'checklist') {
      btnCheck.style.display = '';
      btnCheck.textContent = pageComplete(state.page) ? 'NEXT ▶' : 'CHECK ✓';
    } else if (p.type === 'music') {
      btnCheck.style.display = '';
      btnCheck.textContent = '⏯';
    } else {
      btnCheck.style.display = 'none';
    }
    // ADV (skip to next unchecked item) only makes sense on checklist pages.
    $('#btnAdv').style.display = p.type === 'checklist' ? '' : 'none';
    tick();
  }

  function renderDots() {
    $('#dots').innerHTML = pages.map((p, i) => {
      const cls = ['dot'];
      if (i === state.page) cls.push('cur');
      if (p.type === 'checklist' && pageComplete(i)) cls.push('ok');
      return `<span class="${cls.join(' ')}"></span>`;
    }).join('');
  }

  function renderChecklist(c, pi) {
    const p = pages[pi];
    const chk = state.checks[pi];
    const act = activeIndex(pi);
    const done = chk.filter(Boolean).length;
    c.innerHTML = `
      <div class="clhead">
        <span class="prog ${act === -1 ? 'ok' : ''}">
          ${act === -1 ? 'PAGE COMPLETE ✓' : done + ' / ' + chk.length}
        </span>
        <button class="minibtn" id="resetPage">RESET</button>
      </div>
      <ul class="cl">
        ${p.items.map((it, i) => {
          // item is "text" | ["Challenge","RESPONSE"] | ["Challenge","RESPONSE","live"]
          const [lbl, resp, live] = Array.isArray(it) ? it : [it, '', ''];
          return `
          <li class="${chk[i] ? 'done' : (i === act ? 'active' : '')}" data-i="${i}">
            <span class="box">${chk[i] ? '✓' : (i === act ? '▶' : '')}</span>
            <span class="lbl">${esc(lbl)}</span>
            ${resp ? `<span class="leader"></span>
              ${live ? `<span class="live" data-live="${esc(live)}">—</span>` : ''}
              <span class="resp">${esc(resp)}</span>` : ''}
          </li>`;
        }).join('')}
      </ul>`;
    c.querySelectorAll('li').forEach(li =>
      li.addEventListener('click', () => toggleItem(pi, Number(li.dataset.i))));
    $('#resetPage').addEventListener('click', () => {
      state.checks[pi] = p.items.map(() => false);
      save();
      render();
    });
    updateLiveItems();
  }

  // Refresh every live reading currently on screen (battery %, charging…).
  function updateLiveItems() {
    document.querySelectorAll('#content [data-live]').forEach(el => {
      const v = Live.value(el.dataset.live);
      el.textContent = v ? v.text : '—';
      el.classList.toggle('ok', !!(v && v.ok));
    });
  }

  function renderData(c) {
    c.innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="tl">LOCAL</div><div class="tv" id="dLocal">--:--</div></div>
        <div class="tile"><div class="tl">UTC</div><div class="tv" id="dUtc">--:--</div></div>
        <div class="tile"><div class="tl">TIMER</div><div class="tv" id="dTimer">0:00</div>
          <div class="trow">
            <button class="minibtn" id="tStart">START</button>
            <button class="minibtn" id="tReset">RESET</button>
          </div>
        </div>
        <div class="tile" id="tileAlt"><div class="tl">ALT GPS <span id="altMode" class="unittag"></span></div><div class="tv" id="dAlt">—</div></div>
        <div class="tile" id="tileQnh"><div class="tl">QNH ⤶</div><div class="tv" id="dQnh">—</div></div>
        <div class="tile"><div class="tl">TEMP</div><div class="tv" id="dTemp">—</div></div>
      </div>
      <div class="drow">
        <span class="dim" id="dGps">GPS: waiting for fix…</span>
        <button class="minibtn warn" id="resetAll">RESET ALL CHECKLISTS</button>
      </div>`;
    $('#tStart').addEventListener('click', () => {
      if (state.timerStart) {
        state.timerAcc += Date.now() - state.timerStart;
        state.timerStart = null;
      } else {
        state.timerStart = Date.now();
      }
      save();
      tick();
    });
    $('#tReset').addEventListener('click', () => {
      state.timerStart = null;
      state.timerAcc = 0;
      save();
      tick();
    });
    $('#resetAll').addEventListener('click', () => {
      pages.forEach((p, i) => {
        if (p.type === 'checklist') state.checks[i] = p.items.map(() => false);
      });
      save();
      renderDots();
      toast('ALL CHECKLISTS RESET');
    });
    // Tap the ALT GPS tile to cycle its units: AUTO → M → FT.
    $('#tileAlt').addEventListener('click', () => {
      AltUnit.cycle();
      updateGeo();
      toast('ALT UNITS: ' + AltUnit.get().toUpperCase());
    });
    // Tap the QNH tile to set it by hand (like winding an altimeter);
    // blank clears the manual value and returns to the auto weather reading.
    $('#tileQnh').addEventListener('click', () => {
      const cur = Weather.qnh();
      const v = prompt('QNH (hPa) — leave blank for automatic:', cur == null ? '' : cur);
      if (v === null) return;
      Weather.setManualQnh(v.trim() === '' ? null : parseInt(v, 10));
      updateWeather();
    });
    updateGeo();
    updateWeather();
  }

  function renderMusic(c) {
    if (Spotify.connected()) {
      c.innerHTML = `
        <div class="player">
          <div class="pleft">
            <button class="pbtn" id="mPrev">⏮</button>
            <button class="pbtn grn" id="mToggle">⏯</button>
            <button class="pbtn" id="mNext">⏭</button>
            <button class="minibtn warn" id="mLogout">✕</button>
          </div>
          ${SHOW_TRACKLIST
            ? `<ul class="tracklist" id="mList"><li class="tldim">Loading playlist…</li></ul>`
            : notesEditorHtml('mNotes', 'mNotesReset', 'NOTES — SAVED ON THIS PHONE')}
        </div>`;
      $('#mPrev').addEventListener('click', () => spCmd('prev', true));
      $('#mNext').addEventListener('click', () => spCmd('next', true));
      $('#mToggle').addEventListener('click', () => spCmd('toggle'));
      $('#mLogout').addEventListener('click', () => {
        Spotify.logout();
        render();
      });
      if (SHOW_TRACKLIST) { refreshNowPlaying(); refreshPlaylist(); }
      else bindNotesEditor('mNotes', 'mNotesReset');
    } else {
      c.innerHTML = `
        <div class="music">
          <p>Remote-controls the Spotify app playing in the background on this phone.
             One-time setup (needs internet + Spotify Premium): create a free app at
             developer.spotify.com, register this page's URL as the redirect URI,
             then paste the Client ID below — details in the README.</p>
          <input id="mCid" placeholder="Spotify Client ID"
                 value="${esc(Spotify.clientId())}" autocomplete="off" spellcheck="false">
          <button class="bigbtn grn" id="mConnect">CONNECT SPOTIFY</button>
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

  // Reusable editable-notes block — shared by the NOTES page and (when there's
  // no Spotify Premium) the MUSIC page. Both edit the same stored text, so they
  // always show the same notes.
  const notesEditorHtml = (taId, resetId, header) => `
    <div class="notes">
      <div class="clhead">
        <span class="prog">${header}</span>
        <button class="minibtn warn" id="${resetId}">RESET</button>
      </div>
      <textarea id="${taId}" class="notesArea" spellcheck="false"
        placeholder="Your notes…">${esc(getNotes())}</textarea>
    </div>`;

  function bindNotesEditor(taId, resetId) {
    const ta = $('#' + taId);
    ta.addEventListener('input', () => localStorage.setItem(NOTES_KEY, ta.value));
    $('#' + resetId).addEventListener('click', () => {
      if (!confirm('Reset notes to the default from checklists.js?')) return;
      localStorage.removeItem(NOTES_KEY);
      ta.value = getNotes();
    });
  }

  // Read-only notes, shown in the track-list area only when SHOW_TRACKLIST is
  // on but the list can't load (e.g. no active device). Escaped; newlines via CSS.
  const notesReadonlyHtml = () =>
    `<li class="tlnotes"><div class="tlnotes-h">NOTES</div>` +
    `<div class="tlnotes-b">${esc(getNotes()) || '<span class="tldim">No notes yet</span>'}</div></li>`;

  // ---- spotify glue ----

  function spErrMsg(e) {
    if (!navigator.onLine)                return 'OFFLINE — NO MUSIC CONTROL';
    if (e.message === 'NO_DEVICE')        return 'NO DEVICE — OPEN SPOTIFY APP FIRST';
    if (e.message === 'PREMIUM_REQUIRED') return 'SPOTIFY PREMIUM REQUIRED';
    if (e.message === 'NOT_CONNECTED')    return 'SPOTIFY: NOT CONNECTED';
    return 'SPOTIFY ERROR (' + e.message + ')';
  }

  async function spCmd(cmd, refreshList) {
    if (!Spotify.connected()) { goTo(MUSIC_PAGE); return; } // jump to MUSIC setup
    try {
      await Spotify[cmd]();
      if (SHOW_TRACKLIST) {
        setTimeout(refreshNowPlaying, 700);
        if (refreshList) setTimeout(refreshPlaylist, 800);
      }
    } catch (e) {
      toast(spErrMsg(e));
    }
  }

  // Only relevant when the track list is shown (Premium) — keeps its "now
  // playing" highlight in sync. No-op otherwise.
  let curUri = null;
  async function refreshNowPlaying() {
    if (!SHOW_TRACKLIST || !Spotify.connected() || !navigator.onLine) return;
    try {
      const s = await Spotify.nowPlaying();
      const newUri = s ? s.uri : null;
      if (newUri !== curUri) { curUri = newUri; highlightCurrent(); }
    } catch (e) { /* ignore */ }
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
      list.innerHTML = pl.tracks.map(t => `
        <li data-uri="${esc(t.uri)}" class="${t.uri === pl.current ? 'cur' : ''}">
          <span class="tname">${esc(t.name)}</span>
          <span class="tart">${esc(t.artist)}</span>
        </li>`).join('');
      list.querySelectorAll('li[data-uri]').forEach(li =>
        li.addEventListener('click', async () => {
          try {
            await Spotify.playAt(li.dataset.uri, pl.contextUri);
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

  function tick() {
    const now = new Date();
    setTxt('#clock', pad(now.getHours()) + ':' + pad(now.getMinutes()));
    setTxt('#dLocal', pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()));
    setTxt('#dUtc', pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()));
    const ms = state.timerAcc + (state.timerStart ? Date.now() - state.timerStart : 0);
    const totalS = Math.floor(ms / 1000);
    const h = Math.floor(totalS / 3600), m = Math.floor((totalS % 3600) / 60), sec = totalS % 60;
    setTxt('#dTimer', h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`);
    setTxt('#tStart', state.timerStart ? 'PAUSE' : 'START');
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
    function value(key) {
      // QNH comes from the Weather module (not the battery), so handle it first.
      if (key === 'qnh') {
        const q = Weather.qnh();
        return q == null ? null : { text: q + ' hPa', ok: false }; // informational
      }
      if (!batt) return null;
      if (key === 'battery')  return { text: Math.round(batt.level * 100) + '%', ok: batt.level >= 0.95 };
      if (key === 'charging') return { text: batt.charging ? 'CHG' : 'ON BATT', ok: batt.charging };
      return null;
    }
    return { init, onChange: f => subs.push(f), value };
  })();

  function updateHeaderBattery() {
    const b = Live.value('battery');
    const c = Live.value('charging');
    if (b) setTxt('#batt', (c && c.text === 'CHG' ? '⚡' : '') + b.text);
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
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
          coords.latitude.toFixed(3) + '&longitude=' + coords.longitude.toFixed(3) +
          '&current=temperature_2m,pressure_msl';
        const r = await fetch(url);
        const j = await r.json();
        if (j && j.current) {
          if (j.current.pressure_msl != null) wx.qnh = Math.round(j.current.pressure_msl);
          if (j.current.temperature_2m != null) wx.temp = Math.round(j.current.temperature_2m);
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
      isManual: () => wx.manualQnh != null,
      setManualQnh: v => {
        if (v == null || isNaN(v)) delete wx.manualQnh; else wx.manualQnh = v;
        save();
      },
    };
  })();

  let geoId = null, lastFix = null;
  function startGeo() {
    if (geoId !== null) return;
    if (!navigator.geolocation) { setTxt('#dGps', 'GPS: not available in this browser'); return; }
    geoId = navigator.geolocation.watchPosition(
      pos => { lastFix = pos; updateGeo(); Weather.maybeFetch(pos.coords, updateWeather); },
      err => setTxt('#dGps', 'GPS: ' + err.message),
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
      fmt: (metres, c) => metres == null ? '—'
        : resolved(c) === 'ft' ? Math.round(metres * 3.28084) + ' ft'
        : Math.round(metres) + ' m',
    };
  })();

  function updateGeo() {
    const tag = document.querySelector('#altMode');
    if (tag) tag.textContent = AltUnit.get().toUpperCase();
    if (!lastFix) return;
    const c = lastFix.coords;
    setTxt('#dAlt', AltUnit.fmt(c.altitude, c));
    setTxt('#dGps', 'GPS: fix ±' + Math.round(c.accuracy) + ' m');
  }

  function updateWeather() {
    const q = Weather.qnh();
    const t = Weather.temp();
    const qEl = $('#dQnh'), tEl = $('#dTemp');
    if (qEl) {
      qEl.textContent = q == null ? '—' : q;
      qEl.classList.toggle('manual', Weather.isManual());
    }
    if (tEl) tEl.textContent = t == null ? '—' : t + '°';
    updateLiveItems(); // refresh the QNH reading on the XCTRACK checklist too
  }

  // Fetch weather once at startup (independent of the FLIGHT DATA page's live
  // GPS watch) so the checklist QNH reading is populated from the first visit.
  function primeWeather() {
    if (!navigator.geolocation || !navigator.onLine) return;
    navigator.geolocation.getCurrentPosition(
      pos => Weather.maybeFetch(pos.coords, updateWeather),
      () => {}, { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 }
    );
  }

  function updateNet() {
    const el = $('#net');
    el.className = navigator.onLine ? 'ok' : 'off';
    el.title = navigator.onLine ? 'online' : 'offline (checklist still works)';
  }

  // ---- wiring ----

  function bindUI() {
    $('#btnUp').addEventListener('click', () => go(-1));
    $('#btnDown').addEventListener('click', () => go(1));
    $('#btnCheck').addEventListener('click', checkAction);
    $('#btnAdv').addEventListener('click', advAction);
    window.addEventListener('online', () => { updateNet(); refreshNowPlaying(); });
    window.addEventListener('offline', updateNet);
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
    updateNet();
    Live.init();
    Live.onChange(updateHeaderBattery);
    Live.onChange(updateLiveItems);
    // Returning from the Spotify OAuth redirect? Land on the MUSIC page.
    try {
      if (await Spotify.handleRedirect()) {
        state.page = MUSIC_PAGE;
        save();
        toast('SPOTIFY CONNECTED ✓');
      }
    } catch (e) {
      toast('SPOTIFY AUTH FAILED');
    }
    render();
    primeWeather();
    setInterval(tick, 1000);
    if (SHOW_TRACKLIST) setInterval(refreshNowPlaying, 12000);
    // Offline capability: cache the whole app on first visit.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
