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
  // a completed checklist go to the next page. On MUSIC it toggles the panel
  // (notes ⇄ track list); does nothing on other pages.
  function checkAction() {
    const pi = state.page;
    if (pages[pi].type === 'music') {
      setMusicPanel(musicPanel === 'tracklist' ? 'notes' : 'tracklist');
      render();
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
    // Middle rail button: CHECK/NEXT on checklists; on MUSIC it toggles the
    // right panel between NOTES and the track LIST; hidden on FLIGHT DATA.
    const btnCheck = $('#btnCheck');
    if (p.type === 'checklist') {
      btnCheck.style.display = '';
      btnCheck.className = 'railbtn check';
      btnCheck.textContent = pageComplete(state.page) ? 'NEXT ▶' : 'CHECK ✓';
    } else if (p.type === 'music') {
      btnCheck.style.display = '';
      btnCheck.className = 'railbtn swap';
      btnCheck.innerHTML = musicPanel === 'tracklist' ? '✎<br>NOTES' : '♫<br>LIST';
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
        <div class="clbtns">
          <button class="minibtn warn" id="resetAll">RESET ALL</button>
          <button class="minibtn" id="resetPage">RESET</button>
        </div>
      </div>
      <ul class="cl">
        ${p.items.map((it, i) => {
          // item is "text" | ["Challenge","RESPONSE"] | ["Challenge","RESPONSE","live"]
          // RESPONSE may be "" to show just a live reading with no target text.
          const [lbl, resp, live] = Array.isArray(it) ? it : [it, '', ''];
          return `
          <li class="${chk[i] ? 'done' : (i === act ? 'active' : '')}" data-i="${i}">
            <span class="box">${chk[i] ? '✓' : (i === act ? '▶' : '')}</span>
            <span class="lbl">${esc(lbl)}</span>
            ${(resp || live) ? `<span class="leader"></span>
              ${live ? `<span class="live" data-live="${esc(live)}">—</span>` : ''}
              ${resp ? `<span class="resp">${esc(resp)}</span>` : ''}` : ''}
          </li>`;
        }).join('')}
      </ul>`;
    c.querySelectorAll('li').forEach(li =>
      li.addEventListener('click', () => toggleItem(pi, Number(li.dataset.i))));
    $('#resetPage').addEventListener('click', () => {
      state.checks[pi] = p.items.map(() => false);
      cursors[pi] = 0;
      save();
      render();
    });
    $('#resetAll').addEventListener('click', resetAllChecklists);
    updateLiveItems();
  }

  // Clear every checklist page (available on each checklist page's header).
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
      el.classList.remove('lv-red', 'lv-amber', 'lv-green');
      if (v && v.cls) el.classList.add('lv-' + v.cls);
    });
  }

  function renderData(c) {
    c.innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="tl">LOCAL</div><div class="tv" id="dLocal">--:--</div></div>
        <div class="tile"><div class="tl">UTC</div><div class="tv" id="dUtc">--:--</div></div>
        <div class="tile"><div class="tl">TIMER</div><div class="tv" id="dTimer">0:00</div>
          <div class="trow">
            <button class="minibtn tbig" id="tStart">START</button>
            <button class="minibtn tbig" id="tReset">RESET</button>
          </div>
        </div>
        <div class="tile" id="tileAlt">
          <div class="tl">ALT GPS <span id="altMode" class="unittag"></span></div>
          <div class="tv" id="dAlt">—</div>
          <div class="tsub" id="dGps">GPS: waiting…</div>
        </div>
        <div class="tile" id="tileQnh"><div class="tl">QNH ⤶</div><div class="tv" id="dQnh">—</div></div>
        <div class="tile"><div class="tl">TEMP</div><div class="tv" id="dTemp">—</div></div>
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
      const quick = getQuick();
      c.innerHTML = `
        <div class="player">
          <div class="pleft">
            <button class="pbtn" id="mPrev">⏮</button>
            <button class="pbtn grn" id="mToggle">⏯</button>
            <button class="pbtn" id="mNext">⏭</button>
            <button class="minibtn grn" id="mQuick">${quick ? '▶ ' + esc(quick.name) : '＋ PLAYLIST'}</button>
            <button class="minibtn warn" id="mLogout">✕</button>
          </div>
          ${musicPanel === 'tracklist'
            ? `<div class="notes">
                 <div class="clhead">
                   <div class="mnow" id="mNow"><span class="mnowclip"><span class="mnowtxt">…</span></span></div>
                   <button class="minibtn lamped ${keepAwake ? 'on' : ''}" id="mKeep"><span class="lamp"></span>KEEP AWAKE <span class="kstate">${keepAwake ? 'ON' : 'OFF'}</span></button>
                 </div>
                 <div class="notesbody">
                   <ul class="tracklist" id="mList"><li class="tldim">Loading playlist…</li></ul>
                   <div class="nscroll">
                     <button class="nbtn" id="mListUp" aria-label="scroll up">▲</button>
                     <button class="nbtn" id="mListDown" aria-label="scroll down">▼</button>
                   </div>
                 </div>
               </div>`
            : notesEditorHtml('mNotes', 'mNotesReset', 'NOTES — SAVED ON THIS PHONE')}
        </div>`;
      $('#mPrev').addEventListener('click', () => spCmd('prev', true));
      $('#mNext').addEventListener('click', () => spCmd('next', true));
      $('#mToggle').addEventListener('click', () => spCmd('toggle'));
      $('#mQuick').addEventListener('click', quickPlay);
      $('#mLogout').addEventListener('click', () => {
        Spotify.logout();
        render();
      });
      if (musicPanel === 'tracklist') {
        nowShown = null; // header was just rebuilt — force the next refresh to draw
        bindScroll('mListUp', 'mListDown', '#mList');
        $('#mKeep').addEventListener('click', () => {
          setKeepAwake(!keepAwake);
          render();
          // Same words as the button, and "NOW" makes clear the toast is
          // reporting the state you just switched into, not an instruction.
          if (keepAwake) { toast('KEEP AWAKE NOW ON — TESTING…'); doKeepAlive(); }
          else toast('KEEP AWAKE NOW OFF');
        });
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

  // Editable-notes block for the MUSIC page. Includes ▲/▼ scroll buttons since
  // touch-dragging inside the textarea isn't reliable in XCTrack's WebView.
  const notesEditorHtml = (taId, resetId, header) => `
    <div class="notes">
      <div class="clhead">
        <span class="prog">${header}</span>
        <button class="minibtn warn" id="${resetId}">RESET</button>
      </div>
      <div class="notesbody">
        <textarea id="${taId}" class="notesArea" spellcheck="false"
          placeholder="Your notes…">${esc(getNotes())}</textarea>
        <div class="nscroll">
          <button class="nbtn" id="${taId}Up" aria-label="scroll notes up">▲</button>
          <button class="nbtn" id="${taId}Down" aria-label="scroll notes down">▼</button>
        </div>
      </div>
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
      if (s) setNowPlaying(s.playing ? '▶' : '⏸', s.track);
      else   setNowPlaying('', 'NOTHING PLAYING — PRESS PLAY IN SPOTIFY');
      const newUri = s ? s.uri : null;
      if (newUri !== curUri) { curUri = newUri; highlightCurrent(); }
    } catch (e) { setNowPlaying('', spErrMsg(e)); }
  }

  // Writes the now-playing strip. Only touches the DOM when the text actually
  // changes, so the 12 s poll doesn't restart the ticker mid-scroll.
  let nowShown = null;
  function setNowPlaying(icon, text) {
    const key = icon + ' ' + text;
    if (key === nowShown) return;
    const el = $('#mNow');
    if (!el) return;
    nowShown = key;
    el.innerHTML = (icon ? `<span class="mnowicon">${esc(icon)}</span>` : '') +
      `<span class="mnowclip"><span class="mnowtxt">${esc(text)}</span></span>`;
    fitTicker();
  }

  // Track names are routinely wider than the strip beside the KEEP AWAKE
  // button, so scroll them back and forth instead of truncating. Travel and
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
      // Queue fallback (no readable playlist context): label it so a pile of
      // autoplay recommendations can't be mistaken for one of your playlists —
      // and say which of the three reasons put us here.
      const head = pl.queue
        ? `<li class="tldim">${
            pl.repeat === 'track' ? 'UP NEXT — repeat-1 is on, one track loops'
            : pl.contextUri       ? "UP NEXT — Spotify won't let this list be read"
                                  : 'UP NEXT — not playing from a playlist'}</li>`
        : '';
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
    // Returns { text, cls } where cls is 'red' | 'amber' | 'green' for colour.
    function value(key) {
      // QNH comes from the Weather module (not the battery), so handle it first.
      if (key === 'qnh') {
        const q = Weather.qnh();
        return q == null ? null : { text: q + ' hPa', cls: 'amber' }; // informational
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
    setTxt('#dGps', 'FIX ±' + Math.round(c.accuracy) + ' m');
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
    $('#btnRefresh').addEventListener('click', forceRefresh);
    window.addEventListener('online', () => { updateNet(); refreshNowPlaying(); });
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
    setInterval(refreshNowPlaying, 12000); // self-gates to the visible track list
    setInterval(doKeepAlive, 240000);      // every 4 min; self-gates on keepAwake
    // Offline capability: cache the whole app on first visit.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
