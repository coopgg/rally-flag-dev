/* ============================================================
   Shared top nav + persistent theme/mode picker.
   Every page includes this file and a `<div id="site-nav"></div>`
   right after the opening <body> tag. Set `<body data-nav-group="...">`
   to control which top-level nav link is marked active:
     "distortions" | "setbonuses" | "guides" | "godrolls" | "artifacts" | "builds" | "puzzlehelper" | "codes" | "tracker" | "vendors" | "publicevents" | "debug"

   Theme (element) and mode (auto/light/dark) are stored in localStorage
   so they persist across every page on the site, not just the one
   you're on. First-ever visit picks a random element once, then
   remembers it from then on until changed via the menu.
   ============================================================ */
(function(){
  const THEMES = ["solar", "void", "arc", "stasis", "strand", "prismatic"];
  const THEME_LABELS = { solar: "Solar", void: "Void", arc: "Arc", stasis: "Stasis", strand: "Strand", prismatic: "Prismatic" };
  const STORAGE_THEME_KEY = "rallyflag_theme";
  // Mode preference: "light" or "dark" when the visitor picked one; no
  // value means Auto (follow the device's prefers-color-scheme).
  const STORAGE_MODE_PREF_KEY = "rallyflag_mode_pref";
  // Old key: written as "dark" on every visit before Auto existed, so
  // only a stored "light" reflects an actual choice. Migrated, then removed.
  const LEGACY_MODE_KEY = "rallyflag_mode";
  const MODE_PREFS = ["auto", "light", "dark"];
  const MODE_PREF_LABELS = { auto: "Auto", light: "Light", dark: "Dark" };
  const systemLightQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  // Grouped (rather than one flat list) once the link count grew past
  // ~10 — same labeled-section treatment the Appearance panel already
  // uses (.nav-menu-section/.nav-menu-section-label), reused here for
  // visual consistency between the two dropdown panels.
  const NAV_SECTIONS = [
    {
      label: "Live",
      items: [
        { label: "This Week", href: "this-week.html", group: "thisweek" },
        { label: "Tracker", href: "tracker.html", group: "tracker" },
        { label: "Vendors", href: "vendors.html", group: "vendors" },
        { label: "Distortions", href: "distortions.html", group: "distortions" }
      ]
    },
    {
      label: "Loadouts",
      items: [
        { label: "Builds", href: "builds.html", group: "builds" },
        { label: "God Rolls", href: "god-rolls.html", group: "godrolls" },
        { label: "Armor Sets", href: "armor-set-bonuses.html", group: "setbonuses" },
        { label: "Artifacts", href: "artifacts.html", group: "artifacts" }
      ]
    },
    {
      label: "Reference",
      items: [
        { label: "Guides", href: "guides.html", group: "guides" },
        { label: "Public Events", href: "public-events.html", group: "publicevents" },
        { label: "Puzzle Helper", href: "puzzle-helper.html", group: "puzzlehelper" },
        { label: "Codes", href: "codes.html", group: "codes" }
      ]
    }
  ];
  // Debug tools (debug.html and the throwaway/noindexed API test pages
  // it links to) only exist on the dev site. Hidden by hostname rather
  // than deleted so this exact file can ship to prod unmodified — no
  // manual "strip the Debug section" step at promotion time.
  if (window.location.hostname !== "rallyflag.gg"){
    NAV_SECTIONS.push({
      label: "Debug",
      items: [
        { label: "🐞 Debug", href: "debug.html", group: "debug" }
      ]
    });
  }
  const NAV_ITEMS = NAV_SECTIONS.flatMap(section => section.items);

  const DISCORD_INVITE_URL = "https://discord.gg/9rp2QAfNZs";
  // Inline SVG (not an <img>) so it recolors with currentColor like the
  // rest of the nav buttons in both light and dark mode, no extra asset.
  const DISCORD_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';

  const KOFI_URL = "https://ko-fi.com/coopgg";
  // Simple coffee-cup glyph, not Ko-fi's exact logo mark — reads clearly
  // as "support/coffee" at nav-icon size without risking an inaccurate
  // reproduction of their actual brand mark.
  const KOFI_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 4.5c-.6.6-.6 1.4 0 2s.6 1.4 0 2"/><path d="M12 4.5c-.6.6-.6 1.4 0 2s.6 1.4 0 2"/></svg>';

  // Gear outline (same 16px stroke style as the Ko-fi glyph) for the
  // settings button — a second ☰ here read as a duplicate of the site
  // menu button on the left.
  const SETTINGS_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  const BUNGIE_ROOT = "https://www.bungie.net";

  // Real subclass icons, sourced directly from Bungie's CDN (via Destiny
  // Item Manager's asset references) — static URLs, no API key needed.
  const THEME_ICON_PATHS = {
    solar:     "/common/destiny2_content/icons/8d9818f39c419bbe081d78397362406d.png",
    void:      "/common/destiny2_content/icons/6c9ea5cd14b20cd2af43522151a9ebbf.png",
    arc:       "/common/destiny2_content/icons/e0a4d33058adbb90c0499cf84444b4b0.png",
    stasis:    "/common/destiny2_content/icons/5724cfee09280d8d4f725e34281cec8b.png",
    strand:    "/common/destiny2_content/icons/e2f88241a0deb487b306679155c5cfeb.png",
    prismatic: "/common/destiny2_content/icons/8f8283c4f518dbd2239ba1f60b91d14f.png"
  };

  // Accent colors per theme, used as swatch backgrounds so icons stay
  // visible in both light and dark mode (unlike the neutral panel color).
  const THEME_ACCENT_COLORS = {
    solar: "#ff8f3f",
    void: "#b56bff",
    arc: "#3fd6ff",
    stasis: "#7fb9ff",
    strand: "#3ddc84",
    prismatic: "#ff6fd5"
  };

  // localStorage can throw (blocked site data, some private modes); the
  // nav must still render, just without remembering the choice.
  function storageGet(key){ try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value){ try { localStorage.setItem(key, value); } catch (e) {} }
  function storageRemove(key){ try { localStorage.removeItem(key); } catch (e) {} }

  // Each page's <head> has a tiny inline script that applies the stored
  // theme/mode before first paint (otherwise light-mode visitors saw a
  // dark, accent-less flash until this file ran). Keep its logic in sync
  // with getStoredTheme / getStoredModePref / resolveMode.
  function getStoredTheme(){
    let theme = storageGet(STORAGE_THEME_KEY);
    if (!theme || !THEMES.includes(theme)){
      theme = document.documentElement.getAttribute("data-theme");
      if (!THEMES.includes(theme)) theme = THEMES[Math.floor(Math.random() * THEMES.length)];
      storageSet(STORAGE_THEME_KEY, theme);
    }
    return theme;
  }

  function getStoredModePref(){
    let pref = storageGet(STORAGE_MODE_PREF_KEY);
    const legacy = storageGet(LEGACY_MODE_KEY);
    if (legacy !== null){
      if (pref !== "light" && pref !== "dark" && legacy === "light"){
        pref = "light";
        storageSet(STORAGE_MODE_PREF_KEY, pref);
      }
      storageRemove(LEGACY_MODE_KEY);
    }
    return pref === "light" || pref === "dark" ? pref : "auto";
  }

  function resolveMode(pref){
    if (pref !== "auto") return pref;
    return systemLightQuery && systemLightQuery.matches ? "light" : "dark";
  }

  // Browser UI color (mobile address bar, installed-app title bar)
  // follows light/dark mode — matches --bg in theme.css.
  const MODE_THEME_COLORS = { dark: "#07080a", light: "#f3f4f7" };

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    storageSet(STORAGE_THEME_KEY, theme);
    const btnIcon = document.getElementById("nav-menu-icon");
    if (btnIcon) btnIcon.innerHTML = '<img src="' + BUNGIE_ROOT + THEME_ICON_PATHS[theme] + '" alt="">';
    document.querySelectorAll(".element-swatch").forEach(el => {
      const isActive = el.dataset.theme === theme;
      el.classList.toggle("active", isActive);
      el.setAttribute("aria-pressed", String(isActive));
    });
  }

  let currentModePref = "auto";

  function applyModePref(pref){
    currentModePref = pref;
    if (pref === "auto") storageRemove(STORAGE_MODE_PREF_KEY);
    else storageSet(STORAGE_MODE_PREF_KEY, pref);
    const mode = resolveMode(pref);
    document.documentElement.setAttribute("data-mode", mode);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = MODE_THEME_COLORS[mode];
    document.querySelectorAll(".mode-option").forEach(el => {
      el.setAttribute("aria-pressed", String(el.dataset.modePref === pref));
    });
  }

  function buildMenuPanel(){
    const swatchesHtml = THEMES.map(theme =>
      // Real <button>s (not divs) so the swatches are reachable with Tab
      // and pickable with Enter/Space; aria-pressed marks the current one.
      '<button type="button" class="element-swatch" data-theme="' + theme + '" title="' + THEME_LABELS[theme] + '"' +
        ' aria-label="' + THEME_LABELS[theme] + ' theme" aria-pressed="false" style="background:' + THEME_ACCENT_COLORS[theme] + '">' +
        '<img src="' + BUNGIE_ROOT + THEME_ICON_PATHS[theme] + '" alt="">' +
      '</button>'
    ).join("");

    return (
      '<div class="nav-menu-panel" id="nav-menu-panel">' +
        '<div class="nav-menu-section">' +
          '<div class="nav-menu-section-label">Appearance</div>' +
          '<div class="mode-options" role="group" aria-label="Color mode">' +
            MODE_PREFS.map(pref =>
              '<button type="button" class="mode-option" data-mode-pref="' + pref + '" aria-pressed="false"' +
                (pref === "auto" ? ' title="Match your device setting"' : '') + '>' + MODE_PREF_LABELS[pref] + '</button>'
            ).join("") +
          '</div>' +
        '</div>' +
        '<div class="nav-menu-section">' +
          '<div class="nav-menu-section-label">Subclass Theme</div>' +
          '<div class="element-grid" role="group" aria-label="Subclass theme">' + swatchesHtml + '</div>' +
        '</div>' +
        '<div class="nav-menu-section" id="nav-auth-section"></div>' +
      '</div>'
    );
  }

  // Loads assets/api-keys.js and assets/oauth.js on demand so pages don't
  // have to remember to include them just to get the sign-in widget in
  // the menu — same "one place to maintain" idea as setupPWA() below.
  // Skips a script that's already on the page (several pages include
  // api-keys.js themselves for their own Bungie API calls).
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function ensureAuthReady(){
    const apiKeysReady = window.RallyFlagAPI ? Promise.resolve() : loadScript("assets/api-keys.js");
    return apiKeysReady
      .then(() => window.RallyFlagAuth ? Promise.resolve() : loadScript("assets/oauth.js"));
  }

  function renderAuthSection(){
    const section = document.getElementById("nav-auth-section");
    if (!section || !window.RallyFlagAuth) return;

    if (RallyFlagAuth.isSignedIn()){
      const name = RallyFlagAuth.getDisplayName() || "Signed in";
      section.innerHTML =
        '<div class="nav-menu-section-label">Bungie.net</div>' +
        '<div class="nav-auth-signed-in">' +
          '<span class="nav-auth-name" title="' + name + '">' + name + '</span>' +
          '<button class="nav-auth-signout" id="nav-auth-signout">Sign out</button>' +
        '</div>';
      document.getElementById("nav-auth-signout").addEventListener("click", () => RallyFlagAuth.signOut());
    } else {
      section.innerHTML =
        '<div class="nav-menu-section-label">Bungie.net</div>' +
        '<button class="nav-auth-btn" id="nav-auth-signin">Sign in with Bungie.net</button>';
      document.getElementById("nav-auth-signin").addEventListener("click", () => RallyFlagAuth.signIn());
    }
  }

  // Installs the manifest/icons/service worker on every page that loads
  // this file, so there's a single place to maintain "installable app"
  // behavior instead of duplicating <head> tags across every HTML file.
  function setupPWA(){
    const head = document.head;

    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "manifest.json";
    head.appendChild(manifestLink);

    const themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.content = MODE_THEME_COLORS.dark; // applyModePref() updates it
    head.appendChild(themeColor);

    const appleCapable = document.createElement("meta");
    appleCapable.name = "apple-mobile-web-app-capable";
    appleCapable.content = "yes";
    head.appendChild(appleCapable);

    const appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    appleTitle.content = "Rally Flag";
    head.appendChild(appleTitle);

    const appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = "assets/icon-192.png";
    head.appendChild(appleIcon);

    if ("serviceWorker" in navigator){
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
      });
    }
  }

  // Cloudflare Web Analytics — cookieless, no visitor data stored beyond
  // aggregate counts (matches privacy.html's existing "no stored user
  // data" claim). Only loads on the real domain so dev/testing traffic
  // doesn't skew the real site's numbers.
  function setupAnalytics(){
    if (window.location.hostname !== "rallyflag.gg") return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.setAttribute("data-cf-beacon", '{"token": "88388f52592a4b29aeb836f383009636"}');
    document.head.appendChild(script);
  }

  function buildNav(){
    const activeGroup = document.body.getAttribute("data-nav-group") || "";
    const container = document.getElementById("site-nav");
    if (!container) return;

    // Every section is rendered expanded (no collapsing) so any page is
    // a single tap from the menu button; theme.css lays the sections out
    // as columns on wide screens and stacks them on phones.
    const linksHtml = NAV_SECTIONS.map(section => {
      return (
        '<div class="nav-menu-section">' +
          '<div class="nav-menu-section-label">' + section.label + '</div>' +
          section.items.map(item =>
            '<a href="' + item.href + '"' + (item.group === activeGroup ? ' class="active" aria-current="page"' : '') + '>' + item.label + '</a>'
          ).join("") +
        '</div>'
      );
    }).join("");

    container.innerHTML =
      '<nav class="site-nav">' +
        '<div class="nav-links-wrap">' +
          '<button class="nav-links-btn" id="nav-links-btn" title="Menu" aria-label="Site menu">\u2630</button>' +
          // Panel sits right after its button (it's absolutely positioned,
          // so this doesn't move it) so Tab goes from the button into the links.
          '<div class="nav-links-panel" id="nav-links-panel" style="--nav-cols:' + NAV_SECTIONS.length + '">' + linksHtml + '</div>' +
          '<a href="index.html" class="brand"><span class="brand-mark"></span>RALLY FLAG</a>' +
        '</div>' +
        '<div class="nav-right-wrap">' +
          '<a class="nav-icon-btn" href="' + DISCORD_INVITE_URL + '" target="_blank" rel="noopener" title="Join the Discord">' + DISCORD_ICON_SVG + '</a>' +
          '<a class="nav-icon-btn" href="' + KOFI_URL + '" target="_blank" rel="noopener" title="Support us on Ko-fi">' + KOFI_ICON_SVG + '</a>' +
          '<div class="nav-menu-wrap">' +
            '<button class="nav-menu-btn" id="nav-menu-btn" title="Settings" aria-label="Settings">' +
              '<span class="nav-menu-gear">' + SETTINGS_ICON_SVG + '</span>' +
              '<span class="nav-menu-icon" id="nav-menu-icon"></span>' +
            '</button>' +
            buildMenuPanel() +
          '</div>' +
        '</div>' +
      '</nav>';

    // Both dropdowns share one open/close path so aria-expanded always
    // matches what's on screen, only one is open at a time, and Escape /
    // clicking outside / tabbing out all close them the same way.
    const menus = [
      { btn: document.getElementById("nav-links-btn"), panel: document.getElementById("nav-links-panel") },
      { btn: document.getElementById("nav-menu-btn"), panel: document.getElementById("nav-menu-panel") }
    ];
    function setMenuOpen(menu, open){
      menu.panel.classList.toggle("open", open);
      menu.btn.setAttribute("aria-expanded", String(open));
    }
    menus.forEach(menu => {
      menu.btn.setAttribute("aria-controls", menu.panel.id);
      menu.btn.setAttribute("aria-expanded", "false");
      menu.btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !menu.panel.classList.contains("open");
        menus.forEach(other => { if (other !== menu) setMenuOpen(other, false); });
        setMenuOpen(menu, open);
      });
      // Tabbing past the last item (or Shift+Tabbing above the button)
      // closes the panel. A null relatedTarget is a click on a non-
      // focusable spot inside the panel, so that leaves it open.
      [menu.btn, menu.panel].forEach(el => el.addEventListener("focusout", (e) => {
        const next = e.relatedTarget;
        if (next && !menu.btn.contains(next) && !menu.panel.contains(next)) setMenuOpen(menu, false);
      }));
    });
    document.addEventListener("click", (e) => {
      menus.forEach(menu => {
        if (!menu.panel.contains(e.target) && !menu.btn.contains(e.target)) setMenuOpen(menu, false);
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      menus.forEach(menu => {
        if (!menu.panel.classList.contains("open")) return;
        setMenuOpen(menu, false);
        menu.btn.focus();
      });
    });

    document.querySelectorAll(".mode-option").forEach(el => {
      el.addEventListener("click", () => applyModePref(el.dataset.modePref));
    });
    document.querySelectorAll(".element-swatch").forEach(el => {
      el.addEventListener("click", () => applyTheme(el.dataset.theme));
    });
  }

  setupPWA();
  setupAnalytics();
  buildNav();
  applyTheme(getStoredTheme());
  applyModePref(getStoredModePref());
  // In Auto, follow the device live (e.g. an OS that switches at sunset).
  if (systemLightQuery){
    const onSystemChange = () => { if (currentModePref === "auto") applyModePref("auto"); };
    if (systemLightQuery.addEventListener) systemLightQuery.addEventListener("change", onSystemChange);
    else if (systemLightQuery.addListener) systemLightQuery.addListener(onSystemChange);
  }

  ensureAuthReady().then(() => {
    renderAuthSection();
    RallyFlagAuth.onChange(renderAuthSection);
  }).catch(() => {});
})();