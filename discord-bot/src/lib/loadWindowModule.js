/* ============================================================
   Loads one of the site's assets/*.js files (which assign to
   window.X, since they're written for the browser) into Node by
   running the source in a vm sandbox with a plain `window` object.
   Keeps the bot reading the SAME data/logic as the website instead
   of a copy that can drift — these files are pure data + pure
   functions, no DOM access, so this is safe.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// extra: { window: {...} } adds to the sandbox's window (other modules it
// reads, a location), { globals: {...} } adds plain globals (e.g. fetch).
function loadWindowModule(relativePathFromAssets, globalName, extra = {}){
  const filePath = path.join(__dirname, "..", "..", "..", "assets", relativePathFromAssets);
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = Object.assign({ window: Object.assign({}, extra.window), Date, Math }, extra.globals);
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  const value = sandbox.window[globalName];
  if (!value){
    throw new Error(`${relativePathFromAssets} didn't set window.${globalName}`);
  }
  return value;
}

module.exports = { loadWindowModule };
