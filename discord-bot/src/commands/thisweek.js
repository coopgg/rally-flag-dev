const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getFeaturedUpdate, formatThisWeekMessage, formatNextWeekMessage } = require("../lib/featuredRotation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("thisweek")
    .setDescription("Show this week's featured raid/dungeon, and next week's predicted picks."),
  async execute(interaction){
    const update = getFeaturedUpdate();
    await interaction.reply({ content: formatThisWeekMessage(update), flags: MessageFlags.SuppressEmbeds });
    await interaction.followUp({ content: formatNextWeekMessage(update), flags: MessageFlags.SuppressEmbeds });
  }
};
