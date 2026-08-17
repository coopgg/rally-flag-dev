/* ============================================================
   Shared top nav + persistent theme/mode picker.
   Every page includes this file and a `<div id="site-nav"></div>`
   right after the opening <body> tag. Set `<body data-nav-group="...">`
   to control which top-level nav link is marked active:
     "distortions" | "setbonuses" | "guides" | "godrolls" | "artifacts" | "builds" | "puzzlehelper" | "codes" | "tracker" | "debug"

   Theme (element) and mode (dark/light) are stored in localStorage
   so they persist across every page on the site, not just the one
   you're on. First-ever visit picks a random element once, then
   remembers it from then on until changed via the menu.
   ============================================================ */
(function(){
  const THEMES = ["solar", "void", "arc", "stasis", "strand", "prismatic"];
  const THEME_LABELS = { solar: "Solar", void: "Void", arc: "Arc", stasis: "Stasis", strand: "Strand", prismatic: "Prismatic" };
  const STORAGE_THEME_KEY = "rallyflag_theme";
  const STORAGE_MODE_KEY = "rallyflag_mode";

  const NAV_ITEMS = [
    { label: "This Week", href: "this-week.html", group: "thisweek" },
    { label: "Guides", href: "guides.html", group: "guides" },
    { label: "Puzzle Helper", href: "puzzle-helper.html", group: "puzzlehelper" },
    { label: "Tracker", href: "tracker.html", group: "tracker" },
    { label: "Distortions", href: "distortions.html", group: "distortions" },
    { label: "Builds", href: "builds.html", group: "builds" },
    { label: "God Rolls", href: "god-rolls.html", group: "godrolls" },
    { label: "Armor Sets", href: "armor-set-bonuses.html", group: "setbonuses" },
    { label: "Artifacts", href: "artifacts.html", group: "artifacts" },
    { label: "Codes", href: "codes.html", group: "codes" },
    // Dev-branch only — links to throwaway/noindexed API test pages.
    // Remove this entry before merging toward the production branch/site.
    { label: "🐞 Debug", href: "debug.html", group: "debug" }
  ];

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

  function getStoredTheme(){
    let theme = localStorage.getItem(STORAGE_THEME_KEY);
    if (!theme || !THEMES.includes(theme)){
      theme = THEMES[Math.floor(Math.random() * THEMES.length)];
      localStorage.setItem(STORAGE_THEME_KEY, theme);
    }
    return theme;
  }

  function getStoredMode(){
    const mode = localStorage.getItem(STORAGE_MODE_KEY);
    return mode === "light" ? "light" : "dark";
  }

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    const btnIcon = document.getElementById("nav-menu-icon");
    if (btnIcon) btnIcon.innerHTML = '<img src="' + BUNGIE_ROOT + THEME_ICON_PATHS[theme] + '" alt="' + theme + '">';
    document.querySelectorAll(".element-swatch").forEach(el => {
      el.classList.toggle("active", el.dataset.theme === theme);
    });
  }

  function applyMode(mode){
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    const thumb = document.getElementById("mode-switch-thumb");
    if (thumb) thumb.classList.toggle("is-dark", mode === "dark");
  }

  function buildMenuPanel(){
    const swatchesHtml = THEMES.map(theme =>
      '<div class="element-swatch" data-theme="' + theme + '" title="' + THEME_LABELS[theme] + '" style="background:' + THEME_ACCENT_COLORS[theme] + '">' +
        '<img src="' + BUNGIE_ROOT + THEME_ICON_PATHS[theme] + '" alt="' + theme + '">' +
      '</div>'
    ).join("");

    return (
      '<div class="nav-menu-panel" id="nav-menu-panel">' +
        '<div class="nav-menu-section">' +
          '<div class="nav-menu-section-label">Appearance</div>' +
          '<button class="mode-switch" id="mode-switch" title="Toggle dark/light mode">' +
            '<span class="mode-switch-icon">\u2600\ufe0f</span>' +
            '<span class="mode-switch-icon">\ud83c\udf19</span>' +
            '<span class="mode-switch-thumb" id="mode-switch-thumb"></span>' +
          '</button>' +
        '</div>' +
        '<div class="nav-menu-section">' +
          '<div class="nav-menu-section-label">Subclass Theme</div>' +
          '<div class="element-grid">' + swatchesHtml + '</div>' +
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
    themeColor.content = "#07080a";
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

  function buildNav(){
    const activeGroup = document.body.getAttribute("data-nav-group") || "";
    const container = document.getElementById("site-nav");
    if (!container) return;

    const linksHtml = NAV_ITEMS.map(item =>
      '<a href="' + item.href + '"' + (item.group === activeGroup ? ' class="active"' : '') + '>' + item.label + '</a>'
    ).join("");

    container.innerHTML =
      '<nav class="site-nav">' +
        '<div class="nav-links-wrap">' +
          '<button class="nav-links-btn" id="nav-links-btn" title="Menu">\u2630</button>' +
          '<a href="index.html" class="brand"><span class="brand-mark"></span>RALLY FLAG</a>' +
          '<div class="nav-links-panel" id="nav-links-panel">' + linksHtml + '</div>' +
        '</div>' +
        '<div class="nav-menu-wrap">' +
          '<button class="nav-menu-btn" id="nav-menu-btn" title="Appearance settings">' +
            '<span class="nav-menu-burger">\u2630</span>' +
            '<span class="nav-menu-icon" id="nav-menu-icon"></span>' +
          '</button>' +
          buildMenuPanel() +
        '</div>' +
      '</nav>';

    const linksPanel = document.getElementById("nav-links-panel");
    const linksBtn = document.getElementById("nav-links-btn");
    linksBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      linksPanel.classList.toggle("open");
    });

    const panel = document.getElementById("nav-menu-panel");
    const btn = document.getElementById("nav-menu-btn");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn){
        panel.classList.remove("open");
      }
      if (!linksPanel.contains(e.target) && e.target !== linksBtn){
        linksPanel.classList.remove("open");
      }
    });

    const modeSwitch = document.getElementById("mode-switch");
    modeSwitch.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-mode") === "light" ? "light" : "dark";
      applyMode(current === "light" ? "dark" : "light");
    });
    document.querySelectorAll(".element-swatch").forEach(el => {
      el.addEventListener("click", () => applyTheme(el.dataset.theme));
    });
  }

  setupPWA();
  buildNav();
  applyTheme(getStoredTheme());
  applyMode(getStoredMode());

  ensureAuthReady().then(() => {
    renderAuthSection();
    RallyFlagAuth.onChange(renderAuthSection);
  }).catch(() => {});
})();