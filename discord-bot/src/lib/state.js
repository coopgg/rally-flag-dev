const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "..", "state.json");

function readState(){
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (err){
    return { lastDistortionHourIndex: null, lastFeaturedWeekIndex: null };
  }
}

function writeState(state){
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

module.exports = { readState, writeState };
