# Loadout sync (Cloudflare Worker + D1)

Keeps each signed-in player's Locker loadouts on Cloudflare, under their
Destiny account id, so they survive clearing site data and show up on every
device where they sign in. The Locker calls
`https://rallyflag-sync.rallyflag.workers.dev/loadouts/<destinyMembershipId>`
(`SYNC_URL` in `assets/locker.js`).

## What it stores

One row per Destiny account: the loadout list (names, item instance ids and
hashes, subclass/mod/shader/ornament plug hashes, timestamps), recent
deletions, a version number and when it was last saved. No names, emails
or tokens. The player's Bungie sign-in token is sent with each request so
the worker can ask Bungie which account it belongs to; it is used for that
one check (remembered for 10 minutes under a SHA-256 hash of the token) and
never stored or logged.

## Setup (Cloudflare dashboard, about 5 minutes)

1. **Create the database.** Storage & Databases → D1 SQL Database →
   Create → name it `rallyflag-sync` → Create.
2. **Create the table.** Open the database → Console, paste this and run it:

   ```sql
   CREATE TABLE loadouts (
     membership_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     version INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   ```
3. **Create the worker.** Workers & Pages → Create → Create Worker
   ("Hello World") → name it `rallyflag-sync` → Deploy.
4. **Paste the code.** Edit code → replace everything with `worker.js` →
   Deploy.
5. **Connect the database.** The worker → Settings → Bindings → Add →
   D1 database → Variable name `DB`, database `rallyflag-sync` → Save (it
   redeploys).
6. **Check it.** Open `https://rallyflag-sync.rallyflag.workers.dev/loadouts/1`
   in a browser: you should see `{"error":"This service is only for Rally
   Flag."}` (a browser tab sends no Rally Flag origin). That means it's
   running.

If the worker gets a different address, update `SYNC_URL` in
`assets/locker.js`.

## Limits

Free plan: D1 allows 5 million row reads and 100,000 row writes a day; the
Locker writes once per change (about a second after it) and reads on load
and when the tab comes back (at most once a minute). Each account's data is
capped at 256KB (a few hundred loadouts).

## API

    GET /loadouts/<id>  → { version, loadouts, deleted }
    PUT /loadouts/<id>  { base, loadouts, deleted } → { version } or 409 + the newer copy
    DELETE /loadouts/<id>  → { version: 0 } (row removed; the Locker's "Delete all my saved loadouts")

Requests need `Authorization: Bearer <Bungie access token>` and an Origin
of coopgg.github.io, rallyflag.gg or www.rallyflag.gg.
