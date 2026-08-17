/* ============================================================
   Bungie.net sign-in — public OAuth client, entirely client-side
   (no server to hold a client_secret, so the app is registered as
   "Public" on bungie.net/en/Application). Include this file after
   assets/api-keys.js on any page that needs to know whether the
   visitor is signed in, or that wants to call an OAuth-protected
   Platform endpoint.

   Storage:
     localStorage "rallyflag_bungie_auth" — tokens + cached identity,
       persists across visits until sign-out or refresh-token expiry.
     sessionStorage "rallyflag_oauth_state" — CSRF state for the one
       in-flight authorize round trip.
     sessionStorage "rallyflag_oauth_return" — page to bounce back to
       after oauth-callback.html finishes.

   Other scripts can call:
     RallyFlagAuth.isSignedIn()
     RallyFlagAuth.getDisplayName()
     RallyFlagAuth.signIn()
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
  const STATE_KEY = "rallyflag_oauth_state";
  const RETURN_KEY = "rallyflag_oauth_return";
  // Refresh this many ms before actual expiry so a call never races an
  // access token dying mid-request.
  const EXPIRY_BUFFER_MS = 60 * 1000;

  const listeners = [];
  function notifyChange(){ listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  function loadAuth(){
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveAuth(auth){
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    notifyChange();
  }

  function clearAuth(){
    localStorage.removeItem(AUTH_STORAGE_KEY);
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

  function randomState(){
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function signIn(){
    const clientId = window.RallyFlagAPI.BUNGIE_OAUTH_CLIENT_ID;
    const state = randomState();
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    const url = AUTHORIZE_URL + "?client_id=" + encodeURIComponent(clientId) +
      "&response_type=code&state=" + encodeURIComponent(state);
    window.location.href = url;
  }

  function signOut(){
    clearAuth();
  }

  // No X-API-Key here on purpose: the token endpoint identifies the app
  // via client_id in the body, and adding a custom header would force a
  // CORS preflight (OPTIONS) that this specific Bungie endpoint doesn't
  // handle, breaking the request with an opaque "Failed to fetch" even
  // though the same header works fine on every GET call elsewhere in
  // the site. Content-Type: application/x-www-form-urlencoded is a
  // CORS-safelisted value, so this stays a preflight-free simple request.
  async function exchangeToken(body){
    const clientId = window.RallyFlagAPI.BUNGIE_OAUTH_CLIENT_ID;
    const params = new URLSearchParams(Object.assign({ client_id: clientId }, body));
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error_description || data.error || ("HTTP " + res.status));
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
  async function completeCallback(){
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) throw new Error(params.get("error_description") || error);

    const code = params.get("code");
    const state = params.get("state");
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (!code) throw new Error("Bungie did not return an authorization code.");
    if (!state || state !== expectedState) throw new Error("OAuth state mismatch — possible CSRF, aborting sign-in.");

    const data = await exchangeToken({ grant_type: "authorization_code", code });
    let auth = tokenResponseToAuth(data, null);
    auth.display_name = await fetchDisplayName(auth.access_token);
    saveAuth(auth);

    const returnTo = sessionStorage.getItem(RETURN_KEY) || "index.html";
    sessionStorage.removeItem(RETURN_KEY);

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

  async function refresh(auth){
    const data = await exchangeToken({ grant_type: "refresh_token", refresh_token: auth.refresh_token });
    const next = tokenResponseToAuth(data, auth.display_name);
    saveAuth(next);
    return next;
  }

  // Returns a valid access token. If it's expired and a refresh token
  // exists, refreshes first. This app's token responses don't actually
  // include a refresh token (see tokenResponseToAuth), so in practice an
  // expired access token just means the session is over — the user has
  // to sign in again rather than getting a silent renewal.
  async function getAccessToken(){
    let auth = loadAuth();
    if (!auth || !auth.access_token) return null;

    if (Date.now() < auth.access_expires_at - EXPIRY_BUFFER_MS) {
      return auth.access_token;
    }

    if (!auth.refresh_token || (auth.refresh_expires_at && Date.now() >= auth.refresh_expires_at)) {
      clearAuth();
      return null;
    }
    try {
      auth = await refresh(auth);
      return auth.access_token;
    } catch (e) {
      clearAuth();
      return null;
    }
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

  return {
    isSignedIn,
    getDisplayName,
    signIn,
    signOut,
    completeCallback,
    getAccessToken,
    authedFetch,
    onChange
  };
})();
