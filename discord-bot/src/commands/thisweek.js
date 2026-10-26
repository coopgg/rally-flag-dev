const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getFeaturedUpdate, getMasterSurges, formatThisWeekMessage } = require("../lib/featuredRotation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("thisweek")
    .setDescription("Show this week's featured raid/dungeon."),
  async execute(interaction){
    const update = getFeaturedUpdate(Date.now(), await getMasterSurges());
    await interaction.reply({ content: formatThisWeekMessage(update), flags: MessageFlags.SuppressEmbeds });
  }
};
