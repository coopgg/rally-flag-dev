/* ============================================================
   Bungie.net sign-in — public OAuth client, entirely client-side
   (no server to hold a client_secret, so the app is registered as
   "Public" on bungie.net/en/Application). Include this file after
   assets/api-keys.js on any page that needs to know whether the
   visitor is signed in, or that wants to call an OAuth-protected
   Platform endpoint.

   Storage:
     sessionStorage "rallyflag_bungie_auth" — tokens + cached identity,
       gone the moment this tab/window closes (by request — no lingering
       sign-in across browser sessions). Within a still-open tab, Bungie's
       actual access token still has its own real expiry (see
       getAccessToken() below for how that's handled without feeling
       like a hard timeout).
     localStorage "rallyflag_oauth_pending" — CSRF state(s) for in-flight
       authorize round trips, each with the page to return to. Shared
       across tabs (not sessionStorage) because Bungie's login can bring
       the visitor back in a different tab/window than the one that
       started it (platform logins, the Bungie app on phones), which used
       to fail with a state mismatch. Entries expire after 15 minutes.
     localStorage "rallyflag_oauth_retry_at" — when oauth-callback.html
       last auto-restarted a failed sign-in, so it only does that once.
     localStorage "rallyflag_auth_handoff" — a just-completed sign-in,
       kept for 10 minutes so the tab/window that STARTED it can pick it
       up. On phones the callback often lands somewhere else: the
       installed app opens Bungie in an in-app browser panel (Android
       Custom Tab), and Bungie's login can come back in a new tab. Only a
       tab that called signIn() (sessionStorage "rallyflag_auth_awaiting")
       adopts it, so a sign-in never spreads to unrelated tabs.

   Other scripts can call:
     RallyFlagAuth.isSignedIn()
     RallyFlagAuth.getDisplayName()
     RallyFlagAuth.signIn(returnTo?)     -> returnTo defaults to this page
     RallyFlagAuth.signOut()
     RallyFlagAuth.getAccessToken()      -> Promise<string|null>, refreshes if needed
     RallyFlagAuth.authedFetch(path)     -> Promise<Response>, adds both headers
     RallyFlagAuth.onChange(fn)          -> fn() called after sign-in/out/refresh
   ============================================================ */
window.RallyFlagAuth = (function(){
  const BUNGIE_ROOT = "https://www.bungie.net";
  const AUTHORIZE_URL = BUNGIE_ROOT + "/en/OAuth/Authorize";
  const TOKEN_URL = BUNGIE_ROOT + "/Platform/App/OAuth/token/";
  const AUTH_STORAGE_KEY = "rallyflag_bungie_auth";
  const PENDING_KEY = "rallyflag_oauth_pending";
  const RETRY_AT_KEY = "rallyflag_oauth_retry_at";
  const LAST_RETURN_KEY = "rallyflag_oauth_last_return";
  const STARTED_AT_KEY = "rallyflag_oauth_started_at";
  const HANDOFF_KEY = "rallyflag_auth_handoff";
  const AWAITING_KEY = "rallyflag_auth_awaiting";
  const HANDOFF_TTL_MS = 10 * 60 * 1000;
  const PENDING_TTL_MS = 15 * 60 * 1000;
  const AUTO_RETRY_COOLDOWN_MS = 2 * 60 * 1000;
  // Refresh this many ms before actual expiry so a call never races an
  // access token dying mid-request.
  const EXPIRY_BUFFER_MS = 60 * 1000;

  const listeners = [];
  function notifyChange(){ listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  function loadAuth(){
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveAuth(auth){
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    notifyChange();
  }

  function clearAuth(){
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    notifyChange();
  }

  // This app's token responses don't include a refresh_token (confirmed
  // live — Bungie only sends access_token/token_type/expires_in/
  // membership_id here), so "signed in" has to key off the access
  // token's own lifetime rather than assuming a refresh token exists.
  function isSignedIn(){
    const auth = loadAuth();
    return !!(auth && auth.access_token && Date.now() < auth.access_expires_at);
  }

  function getDisplayName(){
    const auth = loadAuth();
    return (auth && auth.display_name) || null;
  }

  // localStorage when available (shared across tabs), else sessionStorage.
  function sharedGet(key){
    try { return localStorage.getItem(key); } catch (e) {}
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function sharedSet(key, value){
    try { localStorage.setItem(key, value); return; } catch (e) {}
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }
  function sharedRemove(key){
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  // { [state]: { returnTo, at } }, pruned of expired entries on read.
  function loadPending(){
    let pending = {};
    try { pending = JSON.parse(sharedGet(PENDING_KEY) || "{}") || {}; } catch (e) {}
    const now = Date.now();
    for (const state of Object.keys(pending)){
      if (!pending[state] || now - pending[state].at > PENDING_TTL_MS) delete pending[state];
    }
    return pending;
  }
  function savePending(pending){
    if (Object.keys(pending).length) sharedSet(PENDING_KEY, JSON.stringify(pending));
    else sharedRemove(PENDING_KEY);
  }

  function authError(kind, message, extra){
    const err = new Error(message);
    err.kind = kind;
    return Object.assign(err, extra);
  }

  function randomState(){
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function signIn(returnTo){
    const clientId = window.RallyFlagAPI.BUNGIE_OAUTH_CLIENT_ID;
    const state = randomState();
    returnTo = returnTo || (window.location.pathname + window.location.search);
    const pending = loadPending();
    pending[state] = { returnTo, at: Date.now() };
    savePending(pending);
    sharedSet(LAST_RETURN_KEY, returnTo);
    sharedSet(STARTED_AT_KEY, String(Date.now()));
    try { sessionStorage.setItem(AWAITING_KEY, String(Date.now())); } catch (e) {}
    const url = AUTHORIZE_URL + "?client_id=" + encodeURIComponent(clientId) +
      "&response_type=code&state=" + encodeURIComponent(state);
    window.location.href = url;
  }

  function signOut(){
    sharedRemove(HANDOFF_KEY);
    try { sessionStorage.removeItem(AWAITING_KEY); } catch (e) {}
    clearAuth();
  }

  // If this tab started a sign-in that finished somewhere else (see
  // HANDOFF_KEY above), take that sign-in over. Returns true if it did.
  function adoptHandoff(){
    let awaitingSince = 0;
    try { awaitingSince = Number(sessionStorage.getItem(AWAITING_KEY)) || 0; } catch (e) {}
    if (!awaitingSince || isSignedIn()) return false;
    let handoff = null;
    try { handoff = JSON.parse(sharedGet(HANDOFF_KEY) || "null"); } catch (e) {}
    if (!handoff || !handoff.auth || Date.now() - handoff.at > HANDOFF_TTL_MS || handoff.at < awaitingSince){
      if (Date.now() - awaitingSince > HANDOFF_TTL_MS + 5 * 60 * 1000){
        try { sessionStorage.removeItem(AWAITING_KEY); } catch (e) {}
      }
      return false;
    }
    try { sessionStorage.removeItem(AWAITING_KEY); } catch (e) {}
    try { sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(handoff.auth)); } catch (e) { return false; }
    return isSignedIn();
  }

  // No X-API-Key here on purpose: the token endpoint identifies the app
  // via client_id in the body, and adding a custom header would force a
  // CORS preflight (OPTIONS) that this specific Bungie endpoint doesn't
  // handle, breaking the request with an opaque "Failed to fetch" even
  // though the same header works fine on every GET call elsewhere in
  // the site. Content-Type: application/x-www-form-urlencoded is a
  // CORS-safelisted value, so this stays a preflight-free simple request.
  //
  // A network-level failure (fetch rejects: dropped connection, blip)
  // is retried once after a short pause before giving up.
  async function exchangeToken(body){
    const clientId = window.RallyFlagAPI.BUNGIE_OAUTH_CLIENT_ID;
    const params = new URLSearchParams(Object.assign({ client_id: clientId }, body));
    let res;
    for (let attempt = 0; ; attempt++){
      try {
        res = await fetch(TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        });
        break;
      } catch (e) {
        if (attempt >= 1) throw authError("network", "Couldn't reach Bungie.net (" + e.message + ").");
        await new Promise(r => setTimeout(r, 800));
      }
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || data.error) {
      // invalid_grant = the one-time code was already used or expired.
      const kind = data.error === "invalid_grant" ? "code" : "exchange";
      throw authError(kind, data.error_description || data.error || ("HTTP " + res.status));
    }
    return data;
  }

  function tokenResponseToAuth(data, previousDisplayName){
    const now = Date.now();
    return {
      access_token: data.access_token,
      // Not present in this app's responses, but handled in case Bungie
      // ever starts including one (e.g. a future scope/consent change).
      refresh_token: data.refresh_token || null,
      access_expires_at: now + (data.expires_in * 1000),
      refresh_expires_at: data.refresh_expires_in ? now + (data.refresh_expires_in * 1000) : null,
      membership_id: data.membership_id,
      display_name: previousDisplayName || null
    };
  }

  // Best-effort — pulls a human-readable name to show in the nav. Not
  // required for API calls to work, so failures here are swallowed.
  async function fetchDisplayName(accessToken){
    try {
      const res = await fetch(BUNGIE_ROOT + "/Platform/User/GetMembershipsForCurrentUser/", {
        headers: {
          "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY,
          "Authorization": "Bearer " + accessToken
        }
      });
      const data = await res.json();
      if (!res.ok || data.ErrorCode !== 1) return null;
      const user = data.Response && data.Response.bungieNetUser;
      return (user && (user.uniqueName || user.displayName)) || null;
    } catch (e) {
      return null;
    }
  }

  // Called only from oauth-callback.html after Bungie redirects back
  // with ?code=&state=.
  //
  // Failures throw an Error with .kind, which oauth-callback.html uses to
  // decide between a silent restart, a friendly message, or skipping
  // straight back (see there):
  //   "cancelled" — the visitor declined on Bungie's consent screen
  //   "state"     — no matching in-flight sign-in (expired, already
  //                 completed, or a forged callback); the code is NOT used
  //   "code"      — Bungie rejected the code (already used / expired)
  //   "network" | "exchange" — the token request itself failed
  // .returnTo is set whenever the page to go back to is known.
  async function completeCallback(){
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state");
    const pending = loadPending();
    const entry = state ? pending[state] : null;
    if (entry){ delete pending[state]; savePending(pending); }
    const returnTo = entry ? safeReturnTo(entry.returnTo) : getLastReturnTo();

    const error = params.get("error");
    if (error){
      const kind = error === "access_denied" ? "cancelled" : "exchange";
      throw authError(kind, params.get("error_description") || error, { returnTo });
    }

    const code = params.get("code");
    if (!code) throw authError("exchange", "Bungie did not return an authorization code.", { returnTo });
    if (!entry){
      const startedHere = Date.now() - (Number(sharedGet(STARTED_AT_KEY)) || 0) < PENDING_TTL_MS;
      throw authError("state", "No matching sign-in in progress (state mismatch).", { returnTo, startedElsewhere: !startedHere });
    }

    let data;
    try {
      data = await exchangeToken({ grant_type: "authorization_code", code });
    } catch (e) {
      e.returnTo = returnTo;
      throw e;
    }
    let auth = tokenResponseToAuth(data, null);
    auth.display_name = await fetchDisplayName(auth.access_token);
    saveAuth(auth);
    sharedRemove(RETRY_AT_KEY);
    try { sessionStorage.removeItem(AWAITING_KEY); } catch (e) {}
    sharedSet(HANDOFF_KEY, JSON.stringify({ auth, at: Date.now() }));

    // Diagnostic summary for oauth-callback.html to display — Bungie's
    // token response field names are assumed (access_token, expires_in,
    // refresh_token, refresh_expires_in); this surfaces what actually
    // came back so a mismatch is visible instead of silently producing
    // an auth object that reads as "signed out".
    return {
      returnTo,
      displayName: auth.display_name,
      responseKeys: Object.keys(data || {}),
      hasAccessToken: !!auth.access_token,
      hasRefreshToken: !!auth.refresh_token,
      accessExpiresInSec: typeof data.expires_in === "number" ? data.expires_in : null,
      refreshExpiresInSec: typeof data.refresh_expires_in === "number" ? data.refresh_expires_in : null,
      isSignedIn: isSignedIn()
    };
  }

  // Only ever redirect to a path on this site ("/..." but not "//host").
  function safeReturnTo(path){
    return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "index.html";
  }

  function getLastReturnTo(){
    return safeReturnTo(sharedGet(LAST_RETURN_KEY));
  }

  // oauth-callback.html restarts a recoverable failed sign-in on its own
  // (the visitor's bungie.net session usually exists by then, so it
  // completes with no login form) — but only once per cooldown, so a
  // persistent failure ends on an error message instead of looping.
  // Only when this browser actually started a sign-in recently, so
  // opening a stale or someone else's callback link doesn't kick off a
  // sign-in the visitor never asked for.
  function claimAutoRetry(){
    const startedAt = Number(sharedGet(STARTED_AT_KEY)) || 0;
    if (Date.now() - startedAt > PENDING_TTL_MS) return false;
    const last = Number(sharedGet(RETRY_AT_KEY)) || 0;
    if (Date.now() - last < AUTO_RETRY_COOLDOWN_MS) return false;
    sharedSet(RETRY_AT_KEY, String(Date.now()));
    return true;
  }

  async function refresh(auth){
    const data = await exchangeToken({ grant_type: "refresh_token", refresh_token: auth.refresh_token });
    const next = tokenResponseToAuth(data, auth.display_name);
    saveAuth(next);
    return next;
  }

  // Returns a valid access token. If it's expired and a refresh token
  // exists, refreshes first. This app's token responses don't actually
  // include a refresh token (see tokenResponseToAuth) — Bungie's public
  // OAuth clients only ever get an access_token, which is short-lived.
  // Rather than treating that expiry as "you're logged out, go click
  // sign in again," this silently re-runs the same authorize round trip
  // instead: the browser almost always still has an active bungie.net
  // session, so it completes with no login form and bounces right back
  // to the current page (signIn()'s returnTo). Effectively, staying
  // signed in lasts as long as this tab stays open — it only actually
  // ends when the tab/window closes (auth lives in sessionStorage now)
  // or sign-out is explicit.
  async function getAccessToken(){
    let auth = loadAuth();
    if (!auth || !auth.access_token) return null;

    if (Date.now() < auth.access_expires_at - EXPIRY_BUFFER_MS) {
      return auth.access_token;
    }

    if (auth.refresh_token && !(auth.refresh_expires_at && Date.now() >= auth.refresh_expires_at)) {
      try {
        auth = await refresh(auth);
        return auth.access_token;
      } catch (e) {
        clearAuth();
      }
    }

    signIn();
    return null;
  }

  // The current token if it's still good, else null. Never redirects, so
  // background work (the Locker's loadout sync) can use it safely.
  function peekAccessToken(){
    const auth = loadAuth();
    return auth && auth.access_token && Date.now() < auth.access_expires_at - EXPIRY_BUFFER_MS ? auth.access_token : null;
  }

  // Convenience wrapper for pages that need to hit an OAuth-protected
  // Platform endpoint — attaches both required headers. `path` is
  // relative to the Bungie root, e.g. "/Platform/Destiny2/...".
  async function authedFetch(path, options){
    const token = await getAccessToken();
    if (!token) throw new Error("Not signed in to Bungie.net.");
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({
      "X-API-Key": window.RallyFlagAPI.BUNGIE_API_KEY,
      "Authorization": "Bearer " + token
    }, options && options.headers);
    return fetch(BUNGIE_ROOT + path, opts);
  }

  function onChange(fn){
    listeners.push(fn);
  }

  // Picked up at load (no reload needed — nothing has rendered from auth
  // state yet), and whenever this tab comes back to the foreground or
  // another tab writes the handoff. A later pickup reloads the page so
  // everything renders signed in (pages read sign-in state as they load).
  adoptHandoff();
  function adoptAndReload(){ if (adoptHandoff()) window.location.reload(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") adoptAndReload(); });
  window.addEventListener("focus", adoptAndReload);
  window.addEventListener("pageshow", (e) => { if (e.persisted) adoptAndReload(); });
  window.addEventListener("storage", (e) => { if (e.key === HANDOFF_KEY) adoptAndReload(); });

  return {
    isSignedIn,
    getDisplayName,
    signIn,
    signOut,
    completeCallback,
    claimAutoRetry,
    getLastReturnTo,
    getAccessToken,
    peekAccessToken,
    authedFetch,
    onChange
  };
})();
