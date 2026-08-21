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
      time: DistortionData.fmtTime(hourStart),
      day: DistortionData.fmtDay(hourStart),
      ...DistortionData.destinationAt(hourStart)
    });
  }

  return {
    hourIndex: Math.floor(currentHourStart / HOUR_MS), // stable, ever-increasing marker for state.json
    hourStart: currentHourStart,
    current,
    upcoming
  };
}

function formatDistortionMessage({ current, upcoming }){
  const lines = [
    `**Distortion — live now:** ${current.name} (${current.loot})`,
    "",
    "**Up next:**"
  ];
  upcoming.forEach(u => {
    lines.push(`• ${u.time} ${u.day} — ${u.name} (${u.loot})`);
  });
  return lines.join("\n");
}

module.exports = { getDistortionUpdate, formatDistortionMessage };
