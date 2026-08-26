const { SlashCommandBuilder } = require("discord.js");
const { loadWindowModule } = require("../lib/loadWindowModule");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("builds")
    .setDescription("List all suggested builds, optionally filtered by class")
    .addStringOption(opt =>
      opt.setName("class")
        .setDescription("Filter by class")
        .setRequired(false)
        .addChoices(
          { name: "Titan", value: "Titan" },
          { name: "Hunter", value: "Hunter" },
          { name: "Warlock", value: "Warlock" }
        )
    ),
  async execute(interaction){
    const classFilter = interaction.options.getString("class");
    const { BUILDS } = loadWindowModule("builds-data.js", "BuildsData");
    const builds = classFilter ? BUILDS.filter(b => b.class === classFilter) : BUILDS;

    if (!builds.length){
      await interaction.reply({ content: "No builds found.", ephemeral: true });
      return;
    }

    // Include the tagline only when filtered down to one class — with all
    // 14 builds at once there isn't room under Discord's message limit.
    const lines = [`**Suggested Builds${classFilter ? " — " + classFilter : ""}**`];
    builds.forEach(b => {
      lines.push(classFilter
        ? `• **${b.title}** (${b.subclass}) — ${b.tagline}`
        : `• **${b.title}** — ${b.class} ${b.subclass}`);
    });
    lines.push("", "Look up the full breakdown with `/build <name>`.");

    await interaction.reply(lines.join("\n"));
  }
};
