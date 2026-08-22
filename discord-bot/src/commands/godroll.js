const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { findWeapon, searchWeapons, formatWeaponMessage } = require("../lib/godrolls");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("godroll")
    .setDescription("Look up a curated weapon god roll")
    .addStringOption(opt =>
      opt.setName("weapon")
        .setDescription("Weapon name")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async autocomplete(interaction){
    const focused = interaction.options.getFocused();
    const matches = searchWeapons(focused).slice(0, 25);
    await interaction.respond(matches.map(w => ({ name: w.name, value: w.slug })));
  },
  async execute(interaction){
    const query = interaction.options.getString("weapon");
    const weapon = findWeapon(query);
    if (!weapon){
      await interaction.reply({ content: `Couldn't find a curated roll for "${query}". Check the spelling, or browse https://rallyflag.gg/god-rolls.html`, flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds });
      return;
    }
    await interaction.reply({ content: formatWeaponMessage(weapon), flags: MessageFlags.SuppressEmbeds });
  }
};
