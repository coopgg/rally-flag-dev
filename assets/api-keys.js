/* ============================================================
   Shared API keys — the ONE place credentials live on this site.
   Pages that need an API key read it from window.RallyFlagAPI
   instead of holding their own copy.

   Keyed per-hostname rather than one flat set of values: each Bungie
   Application registration (bungie.net/en/Application) is tied to one
   fixed OAuth redirect URL, so dev (coopgg.github.io) and prod
   (rallyflag.gg) each need their own Application, and therefore their
   own API key + OAuth client ID — the two can't be shared. This file
   picks the right row at runtime off window.location.hostname, so the
   exact same file ships to both without edits. Promoting to prod is a
   plug-and-play swap: register a Bungie Application for rallyflag.gg,
   set its OAuth redirect URL to https://rallyflag.gg/oauth-callback.html,
   and paste the resulting API Key + OAuth Client ID into the
   "rallyflag.gg" row below. Nothing else in the codebase ever needs to
   change — every page reads window.RallyFlagAPI.* the same way
   regardless of which row this resolves to.

   Include this script BEFORE any other script that reads from
   window.RallyFlagAPI (e.g. before god-rolls.html's inline script).
   ============================================================ */
window.RallyFlagAPI = (function(){
  const CREDENTIALS_BY_HOST = {
    "coopgg.github.io": {
      BUNGIE_API_KEY: "910ddacf41f646a68fefdeb315f1c800",
      // Public OAuth client (bungie.net/en/Application) — no
      // client_secret, since this site has no server to keep one on.
      // Public client type means the authorization-code exchange
      // happens straight from the browser; see assets/oauth.js.
      BUNGIE_OAUTH_CLIENT_ID: "54476"
    },
    "rallyflag.gg": {
      // Not registered yet — fill these in once the prod Bungie
      // Application exists. Until then, anything on rallyflag.gg
      // falls back to the dev row below (safe: the dev key is
      // origin-restricted to coopgg.github.io, so it will simply fail
      // Bungie's origin check rather than silently working under the
      // wrong identity).
      BUNGIE_API_KEY: "REPLACE_WITH_PROD_BUNGIE_API_KEY",
      BUNGIE_OAUTH_CLIENT_ID: "REPLACE_WITH_PROD_BUNGIE_OAUTH_CLIENT_ID"
    }
  };

  const host = window.location.hostname;
  const isProdReady = host === "rallyflag.gg" && CREDENTIALS_BY_HOST["rallyflag.gg"].BUNGIE_API_KEY !== "REPLACE_WITH_PROD_BUNGIE_API_KEY";
  const creds = isProdReady ? CREDENTIALS_BY_HOST["rallyflag.gg"] : CREDENTIALS_BY_HOST["coopgg.github.io"];

  return {
    BUNGIE_API_KEY: creds.BUNGIE_API_KEY,
    BUNGIE_OAUTH_CLIENT_ID: creds.BUNGIE_OAUTH_CLIENT_ID
    // Add future API keys here as new ones come up — per-host if
    // they're domain-restricted the same way, or as a flat property
    // on this returned object if not.
  };
})();
