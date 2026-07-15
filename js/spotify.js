// ============================================================
//  Spotify remote control via the Web API (Authorization Code
//  flow with PKCE — no server, no client secret needed).
//
//  This does NOT stream audio; it remote-controls the Spotify
//  app already playing in the background on the same phone.
//  Requirements: Spotify Premium + a (free) Spotify developer
//  app whose Client ID you paste into the MUSIC page. Control
//  needs internet; everything else in this site works offline.
// ============================================================

'use strict';

const Spotify = (() => {
  const LS = 'pfc.spotify.v1';
  const SCOPES = 'user-read-playback-state user-modify-playback-state';

  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { cfg = {}; }
  const save = () => localStorage.setItem(LS, JSON.stringify(cfg));

  // Redirect URI must exactly match one registered in the Spotify
  // developer dashboard: the app's own URL, without query/hash.
  const redirectUri = () => location.origin + location.pathname;

  function randStr(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, b => chars[b % chars.length]).join('');
  }

  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function login(clientId) {
    cfg.clientId = clientId;
    save();
    const verifier = randStr(64);
    sessionStorage.setItem('pfc.pkce', verifier);
    const challenge = await pkceChallenge(verifier);
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
  }

  function logout() {
    cfg = { clientId: cfg.clientId }; // keep the ID for easy re-connect
    save();
  }

  async function tokenRequest(params) {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, ...params }),
    });
    if (!res.ok) throw new Error('AUTH_' + res.status);
    const j = await res.json();
    cfg.access = j.access_token;
    if (j.refresh_token) cfg.refresh = j.refresh_token;
    cfg.exp = Date.now() + (j.expires_in - 60) * 1000;
    save();
  }

  // Returns true if the page was loaded as an OAuth redirect and
  // the token exchange succeeded (app.js then jumps to MUSIC page).
  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const err = params.get('error');
    if (!code && !err) return false;
    history.replaceState({}, '', redirectUri()); // clean the URL either way
    if (err) throw new Error('AUTH_DENIED');
    const verifier = sessionStorage.getItem('pfc.pkce');
    sessionStorage.removeItem('pfc.pkce');
    if (!verifier) throw new Error('AUTH_NO_VERIFIER');
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
    return true;
  }

  async function ensureToken() {
    if (!cfg.refresh) throw new Error('NOT_CONNECTED');
    if (!cfg.access || Date.now() >= (cfg.exp || 0)) {
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: cfg.refresh });
    }
  }

  async function api(path, method = 'GET', retry = true) {
    await ensureToken();
    const res = await fetch('https://api.spotify.com/v1' + path, {
      method,
      headers: { Authorization: 'Bearer ' + cfg.access },
    });
    if (res.status === 401 && retry) {
      cfg.exp = 0; // force refresh, then retry once
      return api(path, method, false);
    }
    if (res.status === 403) throw new Error('PREMIUM_REQUIRED');
    if (res.status === 404) throw new Error('NO_DEVICE');
    if (!res.ok && res.status !== 204) throw new Error('API_' + res.status);
    return res;
  }

  // ---- player controls ----

  const next = () => api('/me/player/next', 'POST');
  const prev = () => api('/me/player/previous', 'POST');

  async function toggle() {
    const state = await nowPlaying();
    if (!state) throw new Error('NO_DEVICE');
    await api('/me/player/' + (state.playing ? 'pause' : 'play'), 'PUT');
  }

  // Returns { playing, track } or null when no active device.
  async function nowPlaying() {
    const res = await api('/me/player');
    if (res.status === 204) return null;
    const j = await res.json();
    if (!j || !j.item) return null;
    const artists = (j.item.artists || []).map(a => a.name).join(', ');
    return {
      playing: !!j.is_playing,
      track: j.item.name + (artists ? ' — ' + artists : ''),
    };
  }

  return {
    connected: () => !!cfg.refresh,
    clientId: () => cfg.clientId || '',
    login, logout, handleRedirect,
    toggle, next, prev, nowPlaying,
  };
})();
