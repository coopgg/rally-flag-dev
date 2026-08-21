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

function loadWindowModule(relativePathFromAssets, globalName){
  const filePath = path.join(__dirname, "..", "..", "..", "assets", relativePathFromAssets);
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {}, Date, Math };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  const value = sandbox.window[globalName];
  if (!value){
    throw new Error(`${relativePathFromAssets} didn't set window.${globalName}`);
  }
  return value;
}

module.exports = { loadWindowModule };
