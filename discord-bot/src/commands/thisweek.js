const { SlashCommandBuilder } = require("discord.js");
const { getFeaturedUpdate, formatFeaturedMessage } = require("../lib/featuredRotation");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("thisweek")
    .setDescription("Show this week's featured raid/dungeon, and next week's predicted picks."),
  async execute(interaction){
    const update = getFeaturedUpdate();
    await interaction.reply(formatFeaturedMessage(update));
  }
};
