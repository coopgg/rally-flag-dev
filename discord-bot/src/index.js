require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, MessageFlags } = require("discord.js");
const cron = require("node-cron");

const { getDistortionUpdate, formatDistortionMessage } = require("./lib/distortion");
const { getFeaturedUpdate, formatFeaturedMessage } = require("./lib/featuredRotation");
const { readState, writeState } = require("./lib/state");

const {
  DISCORD_TOKEN,
  DISTORTION_CHANNEL_ID,
  THISWEEK_CHANNEL_ID
} = process.env;

if (!DISCORD_TOKEN){
  console.error("Missing DISCORD_TOKEN in .env — see .env.example.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
fs.readdirSync(commandsDir)
  .filter(file => file.endsWith(".js"))
  .forEach(file => {
    const command = require(path.join(commandsDir, file));
    client.commands.set(command.data.name, command);
  });

client.on("interactionCreate", async interaction => {
  if (interaction.isAutocomplete()){
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (err){
      console.error(`Error handling autocomplete for /${interaction.commandName}:`, err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err){
    console.error(`Error handling /${interaction.commandName}:`, err);
    const reply = { content: "Something went wrong running that command.", ephemeral: true };
    if (interaction.replied || interaction.deferred){
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Deletes the bot's own previous post in a channel, if any, before a new
// one goes up — otherwise hourly Distortion posts especially would just
// pile up forever. Deleting your own message only needs Send Messages
// (Manage Messages is only required to delete *other* users' messages),
// so this doesn't need any extra bot permission. Tolerant of the old
// message already being gone (manually deleted, channel purged, etc).
async function deletePreviousPost(channel, messageId){
  if (!messageId) return;
  try {
    await channel.messages.delete(messageId);
  } catch (err){
    if (err.code !== 10008) console.error("Couldn't delete previous post:", err); // 10008 = Unknown Message
  }
}

async function postDistortionUpdate(){
  if (!DISTORTION_CHANNEL_ID){
    console.warn("DISTORTION_CHANNEL_ID not set — skipping scheduled Distortion post.");
    return;
  }
  const update = getDistortionUpdate();
  const channel = await client.channels.fetch(DISTORTION_CHANNEL_ID);
  const state = readState();
  await deletePreviousPost(channel, state.lastDistortionMessageId);
  const message = await channel.send({ content: formatDistortionMessage(update), flags: MessageFlags.SuppressEmbeds });
  state.lastDistortionHourIndex = update.hourIndex;
  state.lastDistortionMessageId = message.id;
  writeState(state);
}

async function postFeaturedUpdate(){
  if (!THISWEEK_CHANNEL_ID){
    console.warn("THISWEEK_CHANNEL_ID not set — skipping scheduled This Week post.");
    return;
  }
  const update = getFeaturedUpdate();
  const channel = await client.channels.fetch(THISWEEK_CHANNEL_ID);
  const state = readState();
  await deletePreviousPost(channel, state.lastFeaturedMessageId);
  const message = await channel.send({ content: formatFeaturedMessage(update), flags: MessageFlags.SuppressEmbeds });
  state.lastFeaturedWeekIndex = update.weekIndex;
  state.lastFeaturedMessageId = message.id;
  writeState(state);
}

// Catches up on any post missed while the bot was offline (e.g. a Pi
// reboot landing right on an hour/week boundary) before the regular
// cron schedules take over.
async function catchUpMissedPosts(){
  const state = readState();

  const distortionNow = getDistortionUpdate();
  if (DISTORTION_CHANNEL_ID && state.lastDistortionHourIndex !== distortionNow.hourIndex){
    console.log("Distortion post missed while offline — posting now.");
    await postDistortionUpdate();
  }

  const featuredNow = getFeaturedUpdate();
  if (THISWEEK_CHANNEL_ID && state.lastFeaturedWeekIndex !== featuredNow.weekIndex){
    console.log("This Week post missed while offline — posting now.");
    await postFeaturedUpdate();
  }
}

client.once("clientReady", async () => {
  console.log(`RallyBot online as ${client.user.tag}.`);

  await catchUpMissedPosts().catch(err => console.error("Catch-up post failed:", err));

  // Top of every hour — Distortion rotates hourly.
  cron.schedule("0 * * * *", () => {
    postDistortionUpdate().catch(err => console.error("Scheduled Distortion post failed:", err));
  }, { timezone: "UTC" });

  // Tuesdays 17:00 UTC — matches the site's own weekly reset anchor
  // (assets/featured-rotation-data.js RESET_EPOCH_UTC).
  cron.schedule("0 17 * * 2", () => {
    postFeaturedUpdate().catch(err => console.error("Scheduled This Week post failed:", err));
  }, { timezone: "UTC" });
});

client.login(DISCORD_TOKEN);
