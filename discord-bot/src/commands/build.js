const { SlashCommandBuilder } = require("discord.js");
const { findBuild, searchBuilds, formatBuildMessage } = require("../lib/builds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Look up a suggested build")
    .addStringOption(opt =>
      opt.setName("name")
        .setDescription("Build name")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async autocomplete(interaction){
    const focused = interaction.options.getFocused();
    const matches = searchBuilds(focused).slice(0, 25);
    await interaction.respond(matches.map(b => ({ name: `${b.title} (${b.class} ${b.subclass})`, value: b.slug })));
  },
  async execute(interaction){
    const query = interaction.options.getString("name");
    const build = findBuild(query);
    if (!build){
      await interaction.reply({ content: `Couldn't find a build called "${query}". Check the spelling, or browse https://rallyflag.gg/builds.html`, ephemeral: true });
      return;
    }
    await interaction.reply(formatBuildMessage(build));
  }
};
