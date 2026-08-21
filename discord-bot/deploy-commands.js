/* ============================================================
   Registers the slash commands with Discord. Run this once after
   adding/changing a command in src/commands/ — normal bot restarts
   don't need it.

   Registers guild-scoped commands (instant) when DISCORD_GUILD_ID is
   set, which is what you want during setup/testing. For production
   you can switch to global registration (drop the guild ID from the
   route below) once things look right — global commands take up to
   an hour to propagate.
   ============================================================ */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID){
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env — see .env.example.");
  process.exit(1);
}

const commandsDir = path.join(__dirname, "src", "commands");
const commands = fs.readdirSync(commandsDir)
  .filter(file => file.endsWith(".js"))
  .map(file => require(path.join(commandsDir, file)).data.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    const route = DISCORD_GUILD_ID
      ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
      : Routes.applicationCommands(DISCORD_CLIENT_ID);

    const data = await rest.put(route, { body: commands });
    console.log(`Registered ${data.length} command(s)${DISCORD_GUILD_ID ? " (guild-scoped)" : " (global)"}.`);
  } catch (err){
    console.error(err);
    process.exit(1);
  }
})();
