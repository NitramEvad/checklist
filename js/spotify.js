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
  // The playlist-read scopes let the track list show the pilot's own private
  // playlists; granted only when (re-)connecting, so adding one here needs a
  // one-time disconnect ✕ → CONNECT on the phone to take effect.
  const SCOPES = 'user-read-playback-state user-modify-playback-state ' +
                 'playlist-read-private playlist-read-collaborative';

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

  async function api(path, method = 'GET', body = null, retry = true) {
    await ensureToken();
    const opts = { method, headers: { Authorization: 'Bearer ' + cfg.access } };
    if (body != null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch('https://api.spotify.com/v1' + path, opts);
    if (res.status === 401 && retry) {
      cfg.exp = 0; // force refresh, then retry once
      return api(path, method, body, false);
    }
    if (res.status === 403) throw new Error('PREMIUM_REQUIRED');
    if (res.status === 404) throw new Error('NO_DEVICE');
    if (!res.ok && res.status !== 204) throw new Error('API_' + res.status);
    return res;
  }

  const artistsOf = t => (t.artists || []).map(a => a.name).join(', ');

  // ---- player controls ----

  // Pick a device to control: the active one, else any available device (the
  // phone's Spotify app is listed even when idle / not the active device).
  async function pickDevice() {
    const d = await (await api('/me/player/devices')).json();
    const list = (d && d.devices) || [];
    return list.find(x => x.is_active) || list[0] || null;
  }

  // Wake an idle device: transfer playback to it and start playing. This is
  // what the user otherwise does by hand (open Spotify, press play).
  async function activateAndPlay() {
    const dev = await pickDevice();
    if (!dev) throw new Error('NO_DEVICE');
    await api('/me/player', 'PUT', { device_ids: [dev.id], play: true });
  }

  // A skip that first wakes an idle device if the API reports none active.
  async function skip(path) {
    try {
      await api(path, 'POST');
    } catch (e) {
      if (e.message !== 'NO_DEVICE') throw e;
      await activateAndPlay();
      await api(path, 'POST');
    }
  }

  const next = () => skip('/me/player/next');
  const prev = () => skip('/me/player/previous');

  async function toggle() {
    const res = await api('/me/player');
    // 204 (or a payload with no device) = nothing active → wake a device & play.
    if (res.status === 204) { await activateAndPlay(); return; }
    const j = await res.json();
    if (!j || !j.device) { await activateAndPlay(); return; }
    await api('/me/player/' + (j.is_playing ? 'pause' : 'play'), 'PUT');
  }

  // Play a specific track. Within a playlist/album we pass its context so the
  // queue that follows is preserved — even a context we can't *read* (see
  // playlist()) can still be jumped within. Without a context we pass the
  // whole visible list (offset at the tapped track): playing one bare URI
  // would strand playback in a one-track context that stops after the song
  // and makes the queue endpoint report that track over and over.
  async function playAt(uri, contextUri, uris) {
    const listBody = (uris && uris.length > 1) ? { uris, offset: { uri } } : { uris: [uri] };
    if (!contextUri) { await api('/me/player/play', 'PUT', listBody); return; }
    try {
      await api('/me/player/play', 'PUT', { context_uri: contextUri, offset: { uri } });
    } catch (e) {
      // e.g. the tapped track was hand-queued and isn't in the context
      await api('/me/player/play', 'PUT', listBody);
    }
  }

  // Returns { playing, track, uri, context } or null when no active device.
  async function nowPlaying() {
    const res = await api('/me/player');
    if (res.status === 204) return null;
    const j = await res.json();
    if (!j || !j.item) return null;
    const artists = artistsOf(j.item);
    return {
      playing: !!j.is_playing,
      track: j.item.name + (artists ? ' — ' + artists : ''),
      uri: j.item.uri,
      context: (j.context && j.context.uri) || null,
    };
  }

  // The current playlist/album as a selectable list, or (if playback isn't
  // in a playlist context, or the context refuses API reads) the up-next
  // queue, marked queue: true (+ repeat state). Returns
  //   { contextUri, current, queue?, repeat?, tracks: [{uri, name, artist}] }
  // or null. contextUri is set whenever playback has a context — even in
  // queue mode, where it lets callers jump within an unreadable context.
  async function playlist() {
    const res = await api('/me/player');
    if (res.status === 204) return null;
    const j = await res.json();
    const ctx = j && j.context;
    const current = j && j.item && j.item.uri;

    if (ctx && (ctx.type === 'playlist' || ctx.type === 'album')) {
      const id = ctx.uri.split(':').pop();
      const path = ctx.type === 'playlist'
        ? `/playlists/${id}/tracks?limit=100&fields=items(track(uri,name,artists(name)))`
        : `/albums/${id}/tracks?limit=50`;
      try {
        const d = await (await api(path)).json();
        const raw = ctx.type === 'playlist' ? (d.items || []).map(i => i.track) : (d.items || []);
        return {
          contextUri: ctx.uri,
          current,
          tracks: raw.filter(Boolean).map(t => ({ uri: t.uri, name: t.name, artist: artistsOf(t) })),
        };
      } catch (e) {
        // Spotify refuses API reads of some playlists (its own editorial /
        // algorithmic ones, for newer dev apps) — degrade to the queue view
        // rather than showing an error while music is audibly playing.
      }
    }

    // Fallback: the up-next queue. contextUri still carries the playing
    // context (when there is one) so tap-to-jump can stay inside it even
    // though its track list can't be read.
    const q = await (await api('/me/player/queue')).json();
    const list = [q.currently_playing, ...(q.queue || [])].filter(Boolean);
    // With repeat-one or a one-track context, Spotify pads the queue with the
    // same track over and over — collapse those runs to a single row.
    const tracks = [];
    for (const t of list) {
      if (!tracks.length || tracks[tracks.length - 1].uri !== t.uri) {
        tracks.push({ uri: t.uri, name: t.name, artist: artistsOf(t) });
      }
    }
    return {
      contextUri: (ctx && ctx.uri) || null,
      current,
      queue: true,
      repeat: (j && j.repeat_state) || 'off',
      tracks,
    };
  }

  // Start playing a whole playlist/album by its context URI. If the API says
  // there's no active device, wake an idle-but-listed one the way skip()
  // does — but here the play command itself can carry the device target.
  async function playContext(contextUri) {
    const body = { context_uri: contextUri };
    try {
      await api('/me/player/play', 'PUT', body);
    } catch (e) {
      if (e.message !== 'NO_DEVICE') throw e;
      const dev = await pickDevice();
      if (!dev) throw new Error('NO_DEVICE');
      await api('/me/player/play?device_id=' + dev.id, 'PUT', body);
    }
  }

  // Best-effort display name of a playlist/album (some refuse API reads —
  // see playlist()); throws on failure, callers fall back to a generic label.
  async function contextName(type, id) {
    const path = type === 'playlist' ? `/playlists/${id}?fields=name` : `/albums/${id}`;
    const j = await (await api(path)).json();
    return (j && j.name) || null;
  }

  // Keep-alive: send a harmless, inaudible command to the active device so its
  // Spotify Connect idle timer keeps resetting (which otherwise deregisters an
  // idle/paused phone after ~10 min). Re-sets the volume to its current value.
  // Returns 'ok' | 'no-device' | 'no-volume'. Only works while a device is
  // still registered — it can't revive one that has already dropped off.
  async function keepAlive() {
    const res = await api('/me/player');
    if (res.status === 204) return 'no-device';
    const j = await res.json();
    const dev = j && j.device;
    if (!dev) return 'no-device';
    if (typeof dev.volume_percent !== 'number') return 'no-volume';
    await api('/me/player/volume?volume_percent=' + dev.volume_percent, 'PUT');
    return 'ok';
  }

  return {
    connected: () => !!cfg.refresh,
    clientId: () => cfg.clientId || '',
    login, logout, handleRedirect,
    toggle, next, prev, nowPlaying, playlist, playAt, playContext, contextName, keepAlive,
  };
})();
