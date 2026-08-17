/* ============================================================
   Shared API keys — the ONE place credentials live on this site.
   Pages that need an API key read it from window.RallyFlagAPI
   instead of holding their own copy. This file should basically
   never need to be touched again once your keys are in place —
   when Claude rebuilds a page's logic, this file is untouched,
   so keys never get reset back to a placeholder by accident.

   Include this script BEFORE any other script that reads from
   window.RallyFlagAPI (e.g. before god-rolls.html's inline script).
   ============================================================ */
window.RallyFlagAPI = {
  BUNGIE_API_KEY: "910ddacf41f646a68fefdeb315f1c800",
  // Public OAuth client (bungie.net/en/Application) — no client_secret,
  // since this site has no server to keep one on. Public client type
  // means the authorization-code exchange happens straight from the
  // browser; see assets/oauth.js.
  BUNGIE_OAUTH_CLIENT_ID: "54476"
  // Add future API keys here as new ones come up, e.g.:
  // SOME_OTHER_API_KEY: "PASTE_HERE"
};
