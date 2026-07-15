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

  const activeIndex  = pi => state.checks[pi].findIndex(v => !v); // -1 = complete
  const pageComplete = pi => pages[pi].type === 'checklist' && state.checks[pi].every(Boolean);

  function toggleItem(pi, ii) {
    state.checks[pi][ii] = !state.checks[pi][ii];
    save();
    render();
    maybeAdvance(pi);
  }

  // CHECK button: tick the active item; on a completed checklist go to
  // the next page; on data/music pages act as play/pause.
  function checkAction() {
    const pi = state.page;
    if (pages[pi].type !== 'checklist') { spCmd('toggle'); return; }
    const idx = activeIndex(pi);
    if (idx === -1) { go(1); return; }
    state.checks[pi][idx] = true;
    save();
    render();
    maybeAdvance(pi);
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
    $('#btnCheck').textContent =
      p.type === 'checklist' ? (pageComplete(state.page) ? 'NEXT ▶' : 'CHECK ✓') : '⏯';
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
        ${p.items.map((it, i) => `
          <li class="${chk[i] ? 'done' : (i === act ? 'active' : '')}" data-i="${i}">
            <span class="box">${chk[i] ? '✓' : (i === act ? '▶' : '')}</span>
            <span class="lbl">${esc(it)}</span>
          </li>`).join('')}
      </ul>`;
    c.querySelectorAll('li').forEach(li =>
      li.addEventListener('click', () => toggleItem(pi, Number(li.dataset.i))));
    $('#resetPage').addEventListener('click', () => {
      state.checks[pi] = p.items.map(() => false);
      save();
      render();
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
        <div class="tile"><div class="tl">ALT GPS</div><div class="tv" id="dAlt">—</div></div>
        <div class="tile"><div class="tl">SPEED</div><div class="tv" id="dSpd">—</div></div>
        <div class="tile"><div class="tl">HEADING</div><div class="tv" id="dHdg">—</div></div>
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
    updateGeo();
  }

  function renderMusic(c) {
    if (Spotify.connected()) {
      c.innerHTML = `
        <div class="music">
          <div class="mtrack" id="mTrack">…</div>
          <div class="mbtns">
            <button class="bigbtn" id="mPrev">⏮</button>
            <button class="bigbtn grn" id="mToggle">⏯</button>
            <button class="bigbtn" id="mNext">⏭</button>
          </div>
          <div class="drow">
            <span class="dim">Connected to Spotify — controls the app playing in the background</span>
            <button class="minibtn warn" id="mLogout">DISCONNECT</button>
          </div>
        </div>`;
      $('#mPrev').addEventListener('click', () => spCmd('prev'));
      $('#mNext').addEventListener('click', () => spCmd('next'));
      $('#mToggle').addEventListener('click', () => spCmd('toggle'));
      $('#mLogout').addEventListener('click', () => {
        Spotify.logout();
        render();
        updateFooterIdle();
      });
      refreshNowPlaying();
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

  // ---- spotify glue ----

  function spErrMsg(e) {
    if (!navigator.onLine)                return 'OFFLINE — NO MUSIC CONTROL';
    if (e.message === 'NO_DEVICE')        return 'NO DEVICE — OPEN SPOTIFY APP FIRST';
    if (e.message === 'PREMIUM_REQUIRED') return 'SPOTIFY PREMIUM REQUIRED';
    if (e.message === 'NOT_CONNECTED')    return 'SPOTIFY: NOT CONNECTED';
    return 'SPOTIFY ERROR (' + e.message + ')';
  }

  function setSpStatus(txt, warn) {
    const el = $('#spTrack');
    el.textContent = txt;
    el.classList.toggle('warn', !!warn);
  }
  function updateFooterIdle() {
    setSpStatus(Spotify.connected() ? 'SPOTIFY: CONNECTED' : 'SPOTIFY: NOT CONNECTED — TAP HERE', false);
  }

  async function spCmd(cmd) {
    if (!Spotify.connected()) { goTo(pages.length - 1); return; } // jump to MUSIC setup
    try {
      await Spotify[cmd]();
      setTimeout(refreshNowPlaying, 700);
    } catch (e) {
      setSpStatus(spErrMsg(e), true);
    }
  }

  async function refreshNowPlaying() {
    if (!Spotify.connected() || !navigator.onLine) return;
    try {
      const s = await Spotify.nowPlaying();
      const txt = s ? (s.playing ? '▶ ' : '⏸ ') + s.track : 'NO ACTIVE DEVICE — OPEN SPOTIFY APP';
      setSpStatus(txt, !s);
      setTxt('#mTrack', s ? txt : 'No active device');
    } catch (e) {
      setSpStatus(spErrMsg(e), true);
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

  function initBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(b => {
      const show = () => setTxt('#batt', '⚡' + Math.round(b.level * 100) + '%');
      b.addEventListener('levelchange', show);
      show();
    }).catch(() => {});
  }

  let geoId = null, lastFix = null;
  function startGeo() {
    if (geoId !== null) return;
    if (!navigator.geolocation) { setTxt('#dGps', 'GPS: not available in this browser'); return; }
    geoId = navigator.geolocation.watchPosition(
      pos => { lastFix = pos; updateGeo(); },
      err => setTxt('#dGps', 'GPS: ' + err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }
  function stopGeo() {
    if (geoId !== null) { navigator.geolocation.clearWatch(geoId); geoId = null; }
  }
  function updateGeo() {
    if (!lastFix) return;
    const c = lastFix.coords;
    setTxt('#dAlt', c.altitude == null ? '—' : Math.round(c.altitude) + ' m');
    setTxt('#dSpd', c.speed == null ? '—' : Math.round(c.speed * 3.6) + ' km/h');
    setTxt('#dHdg', c.heading == null || isNaN(c.heading) ? '—' : Math.round(c.heading) + '°');
    setTxt('#dGps', 'GPS: fix ±' + Math.round(c.accuracy) + ' m');
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
    $('#spPrev').addEventListener('click', () => spCmd('prev'));
    $('#spNext').addEventListener('click', () => spCmd('next'));
    $('#spToggle').addEventListener('click', () => spCmd('toggle'));
    $('#spTrack').addEventListener('click', () => goTo(pages.length - 1));
    window.addEventListener('online', () => { updateNet(); refreshNowPlaying(); });
    window.addEventListener('offline', updateNet);
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   go(-1);
      if (e.key === 'ArrowDown') go(1);
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          checkAction();
        }
      }
    });
  }

  async function init() {
    bindUI();
    updateNet();
    initBattery();
    // Returning from the Spotify OAuth redirect? Land on the MUSIC page.
    try {
      if (await Spotify.handleRedirect()) {
        state.page = pages.length - 1;
        save();
        toast('SPOTIFY CONNECTED ✓');
      }
    } catch (e) {
      toast('SPOTIFY AUTH FAILED');
    }
    render();
    updateFooterIdle();
    refreshNowPlaying();
    setInterval(tick, 1000);
    setInterval(refreshNowPlaying, 12000);
    // Offline capability: cache the whole app on first visit.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
