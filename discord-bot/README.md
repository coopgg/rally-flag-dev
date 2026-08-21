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

## 4. Deploy to the Raspberry Pi

The bot currently runs on a first-generation **Raspberry Pi Model B Rev 2**
(2012 hardware — single-core ARM1176 @ 700MHz, ARMv6, 512MB RAM), not the
Pi 2 originally assumed. `uname -m` reports `armv6l`. That matters because
official Node.js dropped ARMv6 builds years ago, and this hardware is
noticeably slower than any Pi 2/3/4 — expect `npm install` to take several
minutes and every SSH command to feel sluggish.

### Install Node.js

Official Node has no ARMv6 build, but the community-maintained
[unofficial-builds.nodejs.org](https://unofficial-builds.nodejs.org/download/release/)
project still publishes current LTS `linux-armv6l` tarballs. This is what's
installed on the Pi right now (Node v22.23.2):

```bash
cd /tmp
curl -fsSL -o node.tar.xz https://unofficial-builds.nodejs.org/download/release/v22.23.2/node-v22.23.2-linux-armv6l.tar.xz
sudo mkdir -p /opt/nodejs
sudo tar -xJf node.tar.xz -C /opt/nodejs --strip-components=1
sudo ln -sf /opt/nodejs/bin/node /usr/local/bin/node
sudo ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
sudo ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
rm node.tar.xz
node -v && npm -v
```

Check that page for a newer LTS release before reusing this on a fresh
setup — just confirm the version you pick has a `linux-armv6l` tarball
before downloading.

### Get the code onto the Pi and configure it

Git isn't preinstalled on a fresh Raspberry Pi OS image either:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <your repo URL> ~/rally-flag        # or `git pull` if it's already there
cd ~/rally-flag/discord-bot
npm install
cp .env.example .env
nano .env                                     # fill in the same values as step 2
npm run deploy-commands                       # only needed once, or after changing commands
```

The bot also needs to actually be invited to your server (Developer Portal
→ OAuth2 → URL Generator → open the generated link) — creating the
application and having a valid token is not the same as the bot being a
guild member. If slash commands or scheduled posts fail with a Discord
`50001 Missing Access` error, that's the first thing to check: confirm the
bot shows up in your server's member list, not just that an invite dialog
said "Success."

### Run it as a systemd service (survives reboots/crashes)

[rallybot.service](rallybot.service) is already filled in for this Pi
(`User=nick`, `/home/nick/rally-flag/discord-bot`, `/usr/local/bin/node`) —
edit those three if you're setting this up somewhere else. Then:

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
