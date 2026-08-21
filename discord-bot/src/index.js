require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
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

async function postDistortionUpdate(){
  if (!DISTORTION_CHANNEL_ID){
    console.warn("DISTORTION_CHANNEL_ID not set — skipping scheduled Distortion post.");
    return;
  }
  const update = getDistortionUpdate();
  const channel = await client.channels.fetch(DISTORTION_CHANNEL_ID);
  await channel.send(formatDistortionMessage(update));
  const state = readState();
  state.lastDistortionHourIndex = update.hourIndex;
  writeState(state);
}

async function postFeaturedUpdate(){
  if (!THISWEEK_CHANNEL_ID){
    console.warn("THISWEEK_CHANNEL_ID not set — skipping scheduled This Week post.");
    return;
  }
  const update = getFeaturedUpdate();
  const channel = await client.channels.fetch(THISWEEK_CHANNEL_ID);
  await channel.send(formatFeaturedMessage(update));
  const state = readState();
  state.lastFeaturedWeekIndex = update.weekIndex;
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
