const { SlashCommandBuilder } = require("discord.js");
const { getDistortionUpdate, formatDistortionMessage } = require("../lib/distortion");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("distortion")
    .setDescription("Show the current Distortion location and what's up next."),
  async execute(interaction){
    const update = getDistortionUpdate();
    await interaction.reply(formatDistortionMessage(update));
  }
};
