const { loadWindowModule } = require("./loadWindowModule");

const HOUR_MS = 3600000;

function getDistortionUpdate(now = new Date()){
  const DistortionData = loadWindowModule("rotation-data.js", "DistortionData");

  const currentHourStart = DistortionData.currentHourStart(now);
  const current = DistortionData.destinationAt(currentHourStart);

  const upcoming = [];
  for (let i = 1; i <= 3; i++){
    const hourStart = currentHourStart + i * HOUR_MS;
    upcoming.push({
      hourStart,
      ...DistortionData.destinationAt(hourStart)
    });
  }

  return {
    hourIndex: Math.floor(currentHourStart / HOUR_MS), // stable, ever-increasing marker for state.json
    hourStart: currentHourStart,
    nextShiftAt: currentHourStart + HOUR_MS,
    current,
    upcoming
  };
}

// Discord renders <t:SECONDS:STYLE> in each viewer's own local time/locale
// client-side — computing a formatted string server-side (like the website
// does with toLocaleTimeString in the visitor's own browser) would instead
// bake in the Pi's timezone for every viewer, which is the bug this replaces.
function discordTimestamp(ms, style){
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatDistortionMessage({ current, upcoming, nextShiftAt }){
  const lines = [
    `**Distortion — live now:** ${current.name} (${current.loot})`,
    `Shifts ${discordTimestamp(nextShiftAt, "R")}`,
    "",
    "**Up next:**"
  ];
  upcoming.forEach(u => {
    lines.push(`• ${discordTimestamp(u.hourStart, "f")} — ${u.name} (${u.loot})`);
  });
  return lines.join("\n");
}

module.exports = { getDistortionUpdate, formatDistortionMessage };
