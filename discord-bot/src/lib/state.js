const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "..", "state.json");

function readState(){
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (err){
    return {
      lastDistortionHourIndex: null,
      lastDistortionMessageId: null,
      lastFeaturedWeekIndex: null,
      lastFeaturedMessageIds: []
    };
  }
}

function writeState(state){
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Read-modify-write in one synchronous step. The Distortion and This Week
// posts both fire at 17:00 UTC on Tuesdays and await network calls midway;
// if each kept its own copy of the whole state across those awaits and wrote
// it back afterwards, whichever finished last would overwrite the other's
// fields with stale values — which is what froze the weekly message IDs on
// Sep 1 while posts kept going out. Re-reading right before the write, with
// no await in between, means each caller only changes its own fields.
function updateState(mutate){
  const state = readState();
  mutate(state);
  writeState(state);
  return state;
}

module.exports = { readState, writeState, updateState };
