# RallyBot

Discord bot for [Rally Flag](../index.html). Two features, both reading the
site's own rotation data straight out of `../assets/` (see
[src/lib/loadWindowModule.js](src/lib/loadWindowModule.js)) so nothing drifts
from what the website shows:

- `/distortion` — current Distortion location + what's up next.
- `/thisweek` — this week's featured raid/dungeon + next week's predicted.

Plus scheduled auto-posts: Distortion hourly, This Week at the Tuesday
17:00 UTC reset.

## 1. Create the Discord application

Do this in your own Discord account:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it RallyBot.
2. **Bot** tab → **Reset Token** → copy it somewhere safe. This goes in `.env` as `DISCORD_TOKEN`, never anywhere else (not committed, not pasted into chat).
3. **General Information** tab → copy the **Application ID**. This is `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; bot permissions `Send Messages` + `Use Slash Commands` (`View Channel` too if the bot needs to see the target channels). Copy the generated URL, open it, and invite RallyBot to your server.
5. In Discord, with Developer Mode on (User Settings → Advanced), right-click your server icon → **Copy Server ID** (`DISCORD_GUILD_ID`), and right-click each channel you want updates posted to → **Copy Channel ID** (`DISTORTION_CHANNEL_ID`, `THISWEEK_CHANNEL_ID`).

## 2. Configure

```bash
cd discord-bot
cp .env.example .env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID,
# DISTORTION_CHANNEL_ID, THISWEEK_CHANNEL_ID
```

## 3. Run it locally first

Test against your real server before touching the Pi:

```bash
npm install
npm run deploy-commands   # registers /distortion and /thisweek — rerun only when commands change
npm start
```

In Discord, run `/distortion` and `/thisweek` and check the output against
what [distortions.html](../distortions.html) / [this-week.html](../this-week.html)
show right now. Ctrl+C to stop once it looks right.

## 4. Deploy to the Raspberry Pi 2

### Install Node.js

The Pi 2 is ARMv7 (32-bit/armhf) — an old architecture, so don't assume the
latest Node.js LTS has a build for it. On the Pi, check what's actually
available first:

```bash
uname -m                     # expect armv7l
apt-cache policy nodejs      # see what Raspberry Pi OS's own repo offers
```

If that's too old (Discord.js v14 needs Node 18+), use
[NodeSource's setup script](https://github.com/nodesource/distributions) or
[nvm](https://github.com/nvm-sh/nvm) instead of the OS package — but check
NodeSource's current release notes for armv7l support before picking a
version; if the newest LTS doesn't publish an armv7l build, install the
newest one that does. Tell me what `uname -m` and `node -v` (once installed)
report and I can help troubleshoot from there.

### Get the code onto the Pi and configure it

```bash
git clone <your repo URL> ~/rally-flag        # or `git pull` if it's already there
cd ~/rally-flag/discord-bot
npm install
cp .env.example .env
nano .env                                     # fill in the same values as step 2
npm run deploy-commands                       # only needed once, or after changing commands
```

### Run it as a systemd service (survives reboots/crashes)

[rallybot.service](rallybot.service) is a template — edit `User=` and
`WorkingDirectory=` if your Pi's username or clone path differ from
`pi` / `/home/pi/rally-flag/discord-bot`, and check `ExecStart`'s node path
matches `which node`. Then:

```bash
sudo cp rallybot.service /etc/systemd/system/rallybot.service
sudo systemctl daemon-reload
sudo systemctl enable --now rallybot
sudo systemctl status rallybot     # should show "active (running)"
journalctl -u rallybot -f          # live logs
```

RallyBot should now show Online in your server, and will keep posting
Distortion/This Week updates on schedule even through a reboot.

## Project layout

```
discord-bot/
  deploy-commands.js       registers slash commands with Discord (run manually, rarely)
  rallybot.service          systemd unit template, see step 4
  src/
    index.js                 bot bootstrap: login, command routing, cron schedules
    lib/
      loadWindowModule.js      loads ../assets/*.js (window.X files) into Node via vm
      distortion.js             builds Distortion embed data/text
      featuredRotation.js        builds This Week embed data/text
      state.js                   tracks last-posted hour/week index (state.json, gitignored)
    commands/
      distortion.js              /distortion
      thisweek.js                 /thisweek
```
