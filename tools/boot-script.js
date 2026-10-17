/* Rally Flag boot script: the single source for the inline <script> at
   the top of every page's <head>. Don't edit the copies in the pages; edit
   this file and run `node tools/sync-boot-script.js` (the site checks fail
   if any page's copy differs from this file).

   Runs before first paint, so it must stay inline (an external file would
   block rendering on a network request). It:
   - applies the saved subclass theme (a random one on a first visit, then
     saved), and light/dark mode: the saved choice, else the system setting.
     Keep in sync with getStoredTheme / getStoredModePref / resolveMode in
     assets/nav.js, which take over once the page loads;
   - adds .rf-boot, which keeps <main>/<footer> laid out but invisible
     until the page's own scripts have filled them and the web fonts are in
     (fonts capped at 400ms, 2.5s fallback), so nothing jumps while loading. */
(function(){
  var d = document.documentElement;
  // Valid saved themes; a first visit gets a random subclass (not Cosmic).
  var SUBCLASS_THEMES = ["solar", "void", "arc", "stasis", "strand", "prismatic"];
  var THEMES = SUBCLASS_THEMES.concat(["cosmic", "aurora", "eclipse"]);
  var theme = null, modePref = null, legacyMode = null;
  try {
    theme = localStorage.getItem("rallyflag_theme");
    if (THEMES.indexOf(theme) < 0){
      theme = SUBCLASS_THEMES[Math.floor(Math.random() * SUBCLASS_THEMES.length)];
      localStorage.setItem("rallyflag_theme", theme);
    }
    modePref = localStorage.getItem("rallyflag_mode_pref");
    legacyMode = localStorage.getItem("rallyflag_mode");
  } catch (e) {}
  if (THEMES.indexOf(theme) < 0) theme = SUBCLASS_THEMES[Math.floor(Math.random() * SUBCLASS_THEMES.length)];
  if (modePref !== "light" && modePref !== "dark"){
    modePref = legacyMode === "light" ? "light"
      : (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }
  d.setAttribute("data-theme", theme);
  d.setAttribute("data-mode", modePref);

  d.classList.add("rf-boot");
  var reveal = function(){ d.classList.remove("rf-boot"); };
  document.addEventListener("DOMContentLoaded", function(){
    Promise.race([
      document.fonts ? document.fonts.ready : 0,
      new Promise(function(r){ setTimeout(r, 400); })
    ]).then(function(){ requestAnimationFrame(reveal); });
  });
  setTimeout(reveal, 2500);
})();
