/* ============================================================
   Dungeon data — single source of truth for dungeons.html and dungeon-guide.html.
   Add a new dungeon by adding an entry here — no new HTML page needed.
   `armorSlugs` link back to the matching entries in sets-data.js.
   `summary` and `encounters` are left blank for you to fill in —
   write them the same way you did the FAQ, in your own words.
   `art` is the dungeon's official image path (pgcrImage from Bungie's
   DestinyActivityDefinition); window.rallyFlagArtUrl() turns it into a URL.
   ============================================================ */
window.DungeonsData = (function(){
  const DUNGEONS = [
    { name:"Shattered Throne", slug:"shattered-throne", art:"/img/destiny_content/pgcr/mission_labyrinth.jpg", armorSlugs:["techeuns-regalia"],
      summary:"Shattered Throne was Destiny 2's first dungeon, and it plays like a compact, three-player raid: no elaborate mechanics, but tight arenas, real add pressure, and bosses that punish sloppy positioning. Strong players can solo it, but going in as a full three-person team is the sane way to learn it.",
      encounters:[
        { name:"Erebus",
          objective:"Find your way through a maze of ruined towers by killing waves of enemies and following a trail of matching symbols.",
          roles:"No fixed roles. Stick together and clear as a group.",
          steps:[
            "Defeat the tougher enemy and its escort in the starting building to reveal a symbol.",
            "Search the surrounding towers and paths for a building marked with that same symbol.",
            "Clear the enemies guarding it to reveal the next symbol, and repeat.",
            "When you find a symbol showing a bird, that one points you back toward the start, so clear it to unlock the way down to the next area."
          ],
          wipe:"There's no hard wipe mechanic here, just enemy pressure. The real risk is getting spread out and picked off individually while searching for the next symbol." },
        { name:"Vorgeth, the Boundless Hunger",
          objective:"Kill four Wizards to collect a stacking buff, then use it to snuff out one of the boss's protective flames and damage him while he's exposed.",
          roles:"No fixed roles. Clear support enemies as a group, then focus Wizards together.",
          steps:[
            "Clear the smaller enemies escorting each Wizard first rather than engaging the Wizards directly.",
            "Kill the Wizards one at a time, picking up the buff each one drops, which stacks up to four times and has a short return-to-zero timer.",
            "Get a player to four stacks to upgrade the buff, then have them extinguish one of the flames around Vorgeth to drop his shield.",
            "While he's exposed, unload as much damage as possible, and shoot down or dodge the homing projectiles he throws out.",
            "If his shield isn't broken the first time, repeat the whole Wizard-and-buff cycle until he's dead."
          ],
          wipe:"Letting the buff timer hit zero costs you all your stacks and forces a restart on that attempt. Pace Wizard kills so you're not left stranded with a countdown you can't beat." },
        { name:"Dul Incaru, the Eternal Return",
          objective:"Whittle down three Hive Knights, collect the buff they drop on death, and use it to damage Dul Incaru before it expires.",
          roles:"No fixed roles. Split attention between managing adds and focusing the Knights together.",
          steps:[
            "Chip away at all three Knights' health around the same time rather than killing them one at a time.",
            "Destroy the protective crystal that spawns near a badly-hurt Knight to strip its shield back off. This also spawns a wave of Taken to deal with.",
            "Finish off the Knights in close succession so their buffs stack together instead of running out individually.",
            "With the buff active, unload on Dul Incaru, but return to the central point to cleanse the buff before its timer expires.",
            "Keep clearing the enemy waves that spawn on the side ledges throughout, since they can overwhelm the team if ignored.",
            "Repeat the whole Knight-buff-damage cycle until she's dead."
          ],
          wipe:"Letting the damage buff's timer run out kills whoever's holding it, so always know where the cleansing point is before you commit to a big damage push." }
      ] },
    { name:"Pit of Heresy", slug:"pit-of-heresy", art:"/img/destiny_content/pgcr/dungeon_pit_of_heresy.jpg", armorSlugs:["apostates-blade"],
      summary:"Pit of Heresy leans hard on one recurring idea: pick up a Hive relic sword, then use its light attack, heavy attack, or block to match whichever miniboss type you're facing. Learn that pattern once and most of the dungeon's puzzle rooms fall into place.",
      encounters:[
        { name:"Necropolis",
          objective:"Find three symbol-marked rooms and use a Hive relic sword to defeat the specific miniboss guarding each one.",
          roles:"No fixed roles. Clear as a group and share relic sword duty.",
          steps:[
            "Look at the symbols in the starting room, then head out to find matching giant holograms around the area.",
            "Defeat one of the patrolling Knights to claim a Hive relic sword. Watch out, some travel with an Ogre escort.",
            "Bring the sword into each symbol room and use the correct attack for that miniboss: light attack for the Knight, heavy ranged blast for the Wizard, and guard for the Shrieker.",
            "Clear all three rooms to break their chains and open the way forward."
          ],
          wipe:"There's no hard wipe mechanic here. The main danger is losing the relic sword to a bad fight or getting caught by an Ogre while unarmed." },
        { name:"Tunnels of Despair",
          objective:"Kill Knights for a collectible orb and use it to snuff out three doors, while avoiding invincible Ogres patrolling the tunnels.",
          roles:"No fixed roles. Move carefully and share lookout duty for Ogres.",
          steps:[
            "Shoot through the webbing blocking the tunnel entrance.",
            "Defeat a Knight to claim the orb it drops.",
            "Carry the orb to one of the three doors and use it to extinguish that door's seal.",
            "Repeat for the other two doors, staying alert for the Ogres patrolling the main tunnels."
          ],
          wipe:"The Ogres here can't be killed and hit hard. There's no wipe condition tied to them directly, but getting caught out in the open is a fast way to lose a teammate." },
        { name:"Chamber of Suffering",
          objective:"Defend a totem plate while collecting orbs from Knights, then use six orbs to open the door forward, all while a stacking debuff punishes taking too long.",
          roles:"One player holds the totem plate; the others clear enemies and funnel orbs back.",
          steps:[
            "Have one player stand on the plate beneath the totem to keep it from wiping the team.",
            "Defeat the Knights that spawn and collect the orbs they drop.",
            "Deposit six orbs total at the door behind the totem to clear the encounter.",
            "Prioritize any Knights that spawn on high ledges immediately, since they'll bombard the plate holder from range."
          ],
          wipe:"A stacking debuff builds the longer you're in the room, eventually making almost any hit lethal, so treat this encounter as a speed run, not a slow clear." },
        { name:"The Harrow",
          objective:"Find three symbols scattered through a maze of traps and defeat the Wizard guarding each one to break a seal.",
          roles:"No fixed roles. Move carefully as a group.",
          steps:[
            "Note the three symbols shown at the entrance.",
            "Search the surrounding maze for matching symbols.",
            "Defeat the Wizard standing near each one to break its seal.",
            "Break all three seals to complete the encounter."
          ],
          wipe:"The real threat here is the maze itself: falling to your death or getting caught by a hard-hitting Wizard is a bigger risk than any dedicated wipe mechanic." },
        { name:"Zulmak, Instrument of Torment",
          objective:"Use relic swords to defeat three minibosses around the arena, extinguish a central pedestal with their orbs, then damage Zulmak before retreating from his charge attack.",
          roles:"No fixed roles. Share sword duty and coordinate who's clearing the arena versus who's fighting minibosses.",
          steps:[
            "Defeat a Knight near the center to claim a relic sword.",
            "Use the sword's correct attack on one of the three miniboss types stationed around the arena: Knight, Wizard, or Shrieker.",
            "Take the orb it drops to the central pedestal and extinguish it.",
            "Repeat for the other two minibosses, then damage Zulmak once all three orbs are used.",
            "Watch for his line-of-fire attack and relocate if it's headed your way.",
            "When he kneels to charge a crystal, get out of the arena before it detonates, then repeat the whole cycle until he's dead."
          ],
          wipe:"Staying inside the arena when Zulmak's charged crystal goes off kills anyone still standing there, so always confirm everyone's clear before it detonates." }
      ] },
    { name:"Prophecy", slug:"prophecy", art:"/img/destiny_content/pgcr/dungeon_prophecy.jpg", armorSlugs:["coda"],
      summary:"Prophecy is built around one core mechanic repeated three times: kill specific enemies while standing in light or shadow to collect Light or Dark motes, then use those motes to cleanse matching plates. Once you understand mote collection, every encounter in this dungeon is a variation on the same idea.",
      encounters:[
        { name:"Phalanx Echo",
          objective:"Cleanse four plates using collected Light and Dark motes, then damage the boss during its exposed window.",
          roles:"No fixed roles. Coordinate on which mote type to farm together to avoid resetting each other's charges.",
          steps:[
            "Defeat the enemies that drop motes while standing in light for Light motes, or in shadow for Dark motes.",
            "Collect five of the same mote type to build a usable charge.",
            "Use that charge on the matching colored plate to cleanse it. A Light charge only works on a Light plate, and vice versa.",
            "Repeat until all four plates are cleansed, then focus fire on the boss while it's exposed.",
            "When it goes immune again, return to cleansing plates and repeat the whole cycle."
          ],
          wipe:"Picking up a mote of the wrong type resets your current charge progress. There's no instant wipe here, but sloppy coordination just means a much longer fight." },
        { name:"Hexahedron",
          objective:"Repeatedly cleanse the correct plate to rotate a floating cube through all six of its sides, clearing waves of enemies between each rotation.",
          roles:"No fixed roles. Clear adds together and rotate mote-collection duty.",
          steps:[
            "Clear the enemies that spawn, prioritizing the tougher snipers, since killing one spawns an easier enemy that drops motes.",
            "Find the floating light source to see which side of the room needs to be lit next.",
            "Collect the matching mote type and cleanse the plate on that side.",
            "Repeat this process for all six sides of the cube.",
            "On the final rotation, defeat two enemies instead of collecting motes to finish the encounter."
          ],
          wipe:"There's no dedicated wipe mechanic here. The challenge is just staying alive against the snipers while you're focused on finding the right plate." },
        { name:"Kell Echo",
          objective:"Cleanse three plates around a room full of boss copies, then chase the real boss down a long hallway, damaging it whenever it stops.",
          roles:"No fixed roles. Clear one plate area at a time and regroup for the chase.",
          steps:[
            "Approach the light source in the center to start the fight and spawn three boss copies.",
            "Collect the correct mote type and cleanse the first plate, then defeat the tough enemy guarding it.",
            "Repeat for the other two plates. The room gets easier as each boss copy's area clears out.",
            "Once all three plates are cleansed, regroup in the center to begin the chase.",
            "Follow the real boss down the long hallway, damaging it throughout but saving your heaviest hits for when it stops at either end.",
            "Repeat the whole plate-and-chase cycle until it's dead."
          ],
          wipe:"A stacking debuff builds if you're caught outside the boss's safe zone during the chase, and it kills you at max stacks, so stay in the marked area as you push down the hallway." }
      ] },
    { name:"Grasp of Avarice", slug:"grasp-of-avarice", art:"/img/destiny_content/pgcr/30th-anniversary-grasp-of-avarice.jpg", armorSlugs:["yearning-echo"],
      summary:"Grasp of Avarice takes place in the Cosmodrome's old loot cave, and it's built around one repeating idea: kill enemies for a stacking buff called Burdened by Riches, then carry it to a crystal to drain it before the timer kills you. That same loop shows up again and again, layered with traps, a vehicle chase, and a couple of proper boss fights.",
      encounters:[
        { name:"Skywatch",
          objective:"Farm a stacking buff from enemies and deposit it at a crystal repeatedly until it's satisfied.",
          roles:"No fixed roles. Just clear enemies together and take turns depositing.",
          steps:[
            "Defeat the enemies pouring out of the cave, which drop engrams that grant a stacking buff called Burdened by Riches.",
            "Collect as many stacks as you can before the buff's timer runs out.",
            "Head to the nearby crystal and stand next to it to drain your stacks.",
            "Repeat until an on-screen message confirms the area is cleared."
          ],
          wipe:"Letting the Burdened by Riches timer hit zero kills you outright, so don't wander far from the crystal while you're holding a big stack." },
        { name:"Rusted Gangplank",
          objective:"Navigate a series of switches, pressure plates, and hidden paths to reach and open the main door, without triggering any of the instant-kill traps.",
          roles:"No fixed roles. Move carefully and communicate what you see.",
          steps:[
            "Work through each room by finding the safe path and throwing the lever or switch inside.",
            "Watch for obvious pressure plates and platforms that look like they might drop you: most are traps.",
            "Use each newly opened door or path to progress toward the far side of the area.",
            "Continue flipping switches until the main gate opens."
          ],
          wipe:"Most of the traps here kill instantly rather than wiping the team. Go slow, and if you're not sure a platform is safe, assume it isn't." },
        { name:"Phry'zhia the Insatiable",
          objective:"Use a special cannon to power generators that open side rooms, then farm the Burdened by Riches buff from the enemies inside and deposit it to break the boss's shield.",
          roles:"No fixed roles. Rotate who's carrying the cannon and who's clearing rooms.",
          steps:[
            "Defeat the enemy carrying the special cannon and pick it up.",
            "Fire a shot into a generator to power open one of the side rooms.",
            "Clear the enemies inside and collect the Burdened by Riches buff they drop.",
            "Deposit the buff at the central crystal to chip away at the boss's shield.",
            "Repeat opening rooms and depositing the buff until the shield fully drops, then unload damage on the exposed boss."
          ],
          wipe:"There's no instant wipe here, but letting your Burdened by Riches timer run out while ferrying it to the crystal still kills you, so don't overload past what you can safely deliver." },
        { name:"Shroud",
          objective:"Race along a vehicle track while disarming a series of mines before their timers expire.",
          roles:"No fixed roles. Everyone rides together and watches for the timer-extending buttons along the route.",
          steps:[
            "Summon a vehicle and follow the marked path through the area.",
            "Look for buttons along the route: driving near them extends the timer on the next mine.",
            "Reach each mine before its timer expires to defuse it automatically.",
            "Continue through all the mines to reach the end of the track."
          ],
          wipe:"Letting a mine's timer hit zero fails that section. Memorize where the extender buttons are so you're not caught short on time." },
        { name:"Sunken Lair",
          objective:"Use gravity cannons to launch between platforms, farm the Burdened by Riches buff to expose a shielded enemy, then use its remains to knock out a shielding node.",
          roles:"No fixed roles. Split up to man different platforms and gravity cannons.",
          steps:[
            "Grab a special cannon from a nearby enemy and use it to power a gravity cannon in the direction you want to travel.",
            "Launch yourself to a platform, clear the enemies there, and collect the Burdened by Riches buff.",
            "Deposit that buff at the crystal until the shielded enemy there is exposed, then defeat it.",
            "Push its remains onto the gravity cannon's platform, aim the cannon at the central structure, and fire to destroy one of its shielding nodes.",
            "Repeat this across all four platforms until the central shield fully drops."
          ],
          wipe:"There's no hard wipe mechanic here, just enemy pressure at each platform. The process resets if the remains aren't launched correctly, so double check the cannon's aim before firing." },
        { name:"Captain Avarokk the Covetous",
          objective:"Power generators to release the Burdened by Riches buff around the arena, then deposit enough of it at the central crystal to break the boss's shield and open a damage window.",
          roles:"No fixed roles. Clear enemies together and funnel buffs back to the crystal.",
          steps:[
            "Defeat the enemy carrying the special cannon and take it.",
            "Fire it into one of the three generators around the stage to release the buff-granting engrams.",
            "Collect as much of the buff as you safely can and deposit it at the central crystal.",
            "Repeat activating generators and depositing the buff until enough has been banked to break the boss's shield.",
            "Unload damage during the short window before the boss resists again and the shield returns.",
            "Repeat the whole cycle until he's defeated."
          ],
          wipe:"There's no instant wipe here either, but letting your own Burdened by Riches timer expire mid-run still kills you, so don't hoard more than you can deliver in time." }
      ] },
    { name:"Duality", slug:"duality", art:"/img/destiny_content/pgcr/dungeon_duality.jpg", armorSlugs:["deep-explorer"],
      summary:"Duality takes place inside Calus's memories, and it runs on one shared idea: shoot a Bell of Conquest to flip between reality and a nightmare version of the same room, collect motes and essences on one side, then bring them back to progress on the other. Once that flip mechanic clicks, most of this dungeon explains itself.",
      encounters:[
        { name:"Navigate the Mindscape",
          objective:"Find and shoot a series of Bells of Conquest to flip between reality and the nightmare mindscape, working your way toward the first boss.",
          roles:"No fixed roles. Stay together and take turns shooting.",
          steps:[
            "Shoot the bell in view to flip everyone between reality and the nightmare version of the room.",
            "While in reality, stay close to the bell when it's shot: anyone too far away when the flip happens dies.",
            "Explore each new area for the next bell, using access tunnels and rafters as needed.",
            "Repeat flipping and exploring until you reach the hatch that drops down to the first boss."
          ],
          wipe:"There's no team-wide wipe mechanic here, but standing too far from the bell when it's shot while in reality kills that player instantly, so always regroup before someone pulls the trigger." },
        { name:"Nightmare of Gahlran, Sorrow-Bearer",
          objective:"Collect essences from the nightmare realm, deposit them on matching plates in reality, then damage the boss during a timed nightmare window.",
          roles:"Split into pairs to clear side rooms and collect essences; regroup for the boss damage phase.",
          steps:[
            "Shoot the Bell of Conquest to enter the nightmare and split up to find and defeat the enemies guarding essences in the side rooms.",
            "Bring collected essences back to reality and deposit each one on its matching plate.",
            "When enough essences are deposited, side rooms open. Clear the enemies inside, then use the bell there to teleport into a sealed nightmare room.",
            "Fight through the enemies in that room to unlock access to the boss.",
            "Clear the remaining enemies and damage the boss quickly, since you're on a countdown the entire time you're in the nightmare.",
            "Use the bell to escape back to reality before time runs out, and repeat the whole cycle until he's dead."
          ],
          wipe:"The nightmare countdown wipes the whole team if it reaches zero while you're still inside, so always know where your escape bell is before you commit to a damage push." },
        { name:"Open the Vault",
          objective:"Defeat three Nightmare bosses in sequence by collecting and depositing six total essences, two per boss, to make each one vulnerable.",
          roles:"No fixed roles. Split up to collect essences and clear enemies together.",
          steps:[
            "Note the symbols marked on the ground to know which essences you need.",
            "Shoot the bell to enter the nightmare and head to the area matching your symbol.",
            "Defeat the enemies guarding that area to spawn a Standard Bearer, then collect the essence it drops.",
            "Return to reality and deposit the essence. After two are deposited, the current Nightmare boss becomes vulnerable and can be defeated.",
            "Repeat this whole process for the next two Nightmare bosses in turn."
          ],
          wipe:"There's no hard timer here, so there's no need to rush. Take the time to clear enemies safely before committing to each essence run." },
        { name:"Nightmare of Caiatl, Princess-Imperial",
          objective:"Collect four essences from matching balconies, deposit them to trigger a damage phase, then chase Caiatl between three bells to stun her and deal damage.",
          roles:"Split up to collect essences from balconies; regroup for the bell-chasing damage phase.",
          steps:[
            "Note the symbols shown near the deposit chains to know which balconies to check in the nightmare.",
            "Shoot the bell to flip to the nightmare and defeat the correctly-symbol-matched enemies on your balcony to spawn an essence.",
            "Return to reality with the essence and deposit it on the matching chain.",
            "Repeat until all four essences are deposited, which lets you shoot a chain to start the damage phase.",
            "In the nightmare damage phase, watch which bell Caiatl runs toward and get there before her: shooting the bell as she arrives stuns her and grants your team a damage buff.",
            "Repeat this across all three bells before the phase ends, then repeat the whole essence-and-chase cycle until she's dead."
          ],
          wipe:"There's no instant team wipe in this fight, but the damage phase ends early if Caiatl reaches a bell before you do. Missing a bell just means a longer fight, not a reset, so stay calm and keep chasing." }
      ] },
    { name:"Spire of the Watcher", slug:"spire-of-the-watcher", art:"/img/destiny_content/pgcr/dungeon_spire_of_the_watcher.jpg", armorSlugs:["tm-custom"],
      summary:"Spire of the Watcher runs on a single mechanic the whole way through: kill Conduit Minotaurs for a buff called Arctrician, then use it to power nodes in the correct sequence along a cable. Once you're comfortable tracing cables and chaining nodes, the whole dungeon opens up.",
      encounters:[
        { name:"Reestablish Power",
          objective:"Power four sets of nodes in sequence, following the cables from each generator, to unlock the way forward.",
          roles:"No fixed roles. Split up to cover different cable paths.",
          steps:[
            "Defeat Conduit Minotaurs to collect the Arctrician buff, which lasts 30 seconds and lets you activate nodes.",
            "Find the starting node at a generator (it's marked with flashing arrows) and shoot it while buffed.",
            "Follow the cable to the next node and shoot it in sequence, continuing until you reach the end of that line.",
            "Watch for Cyclops along the ridgeline and Goblins and Harpies swarming the middle while you work.",
            "Repeat this for all four cable paths until every node is active."
          ],
          wipe:"Skipping a node or hitting the wrong one out of sequence deactivates the whole chain after a few seconds. There's no wipe here, just a reset on that cable, so trace it carefully before you start shooting." },
        { name:"Ascend the Spire",
          objective:"Repeat the same node-charging process while climbing the tower, using charged elevators to reach the top.",
          roles:"No fixed roles. Same as before, split up to trace cables.",
          steps:[
            "Defeat Conduit Minotaurs for the Arctrician buff.",
            "Find the starting node and follow the cable in sequence, same as the previous encounter.",
            "Once a set of nodes is fully charged, step onto the elevator it powers to ascend to the next level.",
            "Repeat the whole process at each new level until you reach the top."
          ],
          wipe:"Same rule as before: skip a node and the chain resets, but nothing here wipes the team outright." },
        { name:"Akelous, the Siren's Current",
          objective:"Charge four boardwalk nodes starting from the center, then shoot the boss's eyes and exposed core during its damage window.",
          roles:"No fixed roles. Split up to power boardwalks, then regroup for damage.",
          steps:[
            "Defeat Conduit Minotaurs for the Arctrician buff.",
            "Starting from the center, charge the nodes out along each boardwalk to its fuel rod.",
            "Once all four fuel rods are lit, the boss moves to one and becomes vulnerable.",
            "Shoot its glowing eyes first, then its central mass once exposed.",
            "Watch for a large knockback blast at the end of the damage phase, and get away from the edge before it hits.",
            "Repeat charging boardwalks and damaging the boss until it's dead."
          ],
          wipe:"There's no instant wipe, but getting knocked off the boardwalk by the end-of-phase blast can cost you a life if you're not braced for it, so reposition away from ledges as the damage window winds down." },
        { name:"Persys, Primordial Ruin",
          objective:"Use nodes to trigger a reactor purge, seal the boss inside it from a safe room, then damage it once the purge completes.",
          roles:"No fixed roles. Split between clearing the reactor room and managing the safe room nodes.",
          steps:[
            "Clear the enemies in the room, including the tougher enemies that spawn Conduit Minotaurs when defeated.",
            "Collect the Arctrician buff and use it to open the path into the reactor room.",
            "Charge the nodes that start the reactor purge, then lure the boss into the reactor room before it begins.",
            "Retreat to the safe room and use the buff to seal the door, locking the boss inside with the purge.",
            "Wait for the purge to complete, which drops the boss's shield.",
            "When the door reopens, damage the exposed boss, then repeat the whole cycle until it's dead."
          ],
          wipe:"If the boss isn't actually inside the reactor room when the purge finishes, its shield won't drop and you'll need to reset the whole sequence, so always confirm it followed you in before sealing that door." }
      ] },
    { name:"Ghosts of the Deep", slug:"ghosts-of-the-deep", art:"/img/destiny_content/pgcr/dungeon_ghosts_of_the_deep.jpg", armorSlugs:["taken-king"],
      summary:"Ghosts of the Deep leans on one repeating idea: track down a Hive rune symbol, defeat a Lightbearer to claim a Vestige of Light buff, then imbue the correct matching statue before the buff's timer runs out. Every encounter builds on that same rune-and-imbue loop.",
      encounters:[
        { name:"Hive Ritual Disrupted",
          objective:"Track a trail of Hive runes to find and defeat a Lightbearer, then imbue the matching statue with the buff it drops, four times total.",
          roles:"No fixed roles. Move together and share lookout duty for the rune symbol.",
          steps:[
            "Defeat the enemies by the door to spawn a tougher enemy, then follow the trail it leaves toward a Hive rune in the sky, and remember the symbol.",
            "Clear the enemies at that location to reveal the next point in the trail, and repeat until you reach a Lightbearer.",
            "Defeat the Lightbearer, then immediately defeat its Ghost. Whoever gets that kill receives the Vestige of Light buff.",
            "Return to the starting door and defeat the Wizard guarding it.",
            "Reveal the illusion on the ground to grant the team a short window of Deepsight.",
            "While that's active, the Vestige of Light holder interacts with the statue matching the symbol you tracked earlier.",
            "Repeat this whole sequence four times to open the door."
          ],
          wipe:"Imbuing the wrong statue kills whoever's holding the buff and resets that attempt, so don't rush the interaction if you're not sure you remembered the symbol correctly." },
        { name:"Ecthar, the Shield of Savathûn",
          objective:"Track three underwater runes while dodging the boss, then collect the Vestige of Light from three Lightbearers to imbue three statues and trigger a damage phase.",
          roles:"One or more players go underwater to find runes and lead the boss away; the rest hold the main room and clear adds.",
          steps:[
            "Defeat the enemies praying near the fountain to spawn the boss, along with the enemy that unlocks a Deepsight window.",
            "Use Deepsight to note three lit Hive rune symbols on the walls.",
            "Send at least one player underwater (this pulls the boss along with them) to find and touch all three matching runes.",
            "While that's happening, the rest of the team clears the adds spawning in the main room.",
            "Back on the surface, defeat the Lightbearer Wizards that appear, then defeat each one's Ghost to claim the Vestige of Light buff.",
            "Carry that buff to one of the three statues and imbue it, then repeat for all three.",
            "Once the third statue is imbued, defeat the Knight that spawns and step into the pool it leaves to break the boss's shield and begin the damage phase.",
            "Damage the boss until it goes immune, then repeat the whole cycle."
          ],
          wipe:"There's no instant wipe here, but losing track of the underwater player or letting adds overwhelm the surface team can stall progress badly. A Well of Radiance or similar support makes a real difference in this room." },
        { name:"Simmumah ur-Nokru, Lucent Necromancer",
          objective:"Reveal three linked locations, lure a specific enemy to each while standing in them to unlock Hive runes, then imbue all three using Vestiges collected from side chambers before starting a damage phase.",
          roles:"No fixed roles. Coordinate on which location each player is luring the enemy to, and who's collecting Vestiges.",
          steps:[
            "Crush the Ghost near the boss to start the encounter, then reveal the illusion to gain Deepsight and spot three connected locations.",
            "Stand at one location so it glows, then defeat Vorlog, Risen in Heresy while standing inside that glow to reveal a Hive rune there.",
            "Repeat for the other two locations. The heart location must always be done last in this part of the sequence.",
            "Enter one of the water chambers to find a Lightbearer, defeat it and its Ghost to claim a Vestige buff, and note the Hive rune symbol in that room.",
            "Return to the main area, use Deepsight again, and imbue the matching location with the Vestige before its 60-second timer runs out.",
            "Repeat this chamber-and-imbue process for all three locations, then begin the damage phase.",
            "Stand inside one of the three locations to drop the boss's shield, then unload damage until it goes immune.",
            "Repeat the whole rune-and-damage cycle. The required locations shift each round, so re-check with Deepsight every time."
          ],
          wipe:"Letting a Vestige of Light buff's 60-second timer expire before you imbue the correct location kills whoever's holding it, so always confirm the symbol match through Deepsight before committing to the run back." }
      ] },
    { name:"Warlord's Ruin", slug:"warlords-ruin", art:"/img/destiny_content/pgcr/dungeon_ridgeline.jpg", armorSlugs:["dark-age"],
      summary:"Warlord's Ruin repeats one core idea across all three boss fights: stand near Taken totems to turn them into Stasis totems, which builds toward a damage phase timer called Naeem's Wish Empowerment. Once you understand that loop, each boss just adds one new wrinkle on top of it.",
      encounters:[
        { name:"Rathil, First Broken Knight of Fikrul",
          objective:"Escape a cage by shooting glowing eyes, then cleanse Taken totems to build toward a damage phase on the boss.",
          roles:"No fixed roles. Help each other spot eyes in nearby cages.",
          steps:[
            "Clear the enemies at the start, then look around your cage for three glowing Acolyte Eyes and shoot them all to break free.",
            "Once free, stand within a Taken totem's circle for a few seconds to convert it into a Stasis totem. Standing between two overlapping circles can cleanse both at once.",
            "Cleanse as many totems as you can before the Imminent Wish timer runs out: more totems means a longer damage phase.",
            "When the timer hits zero, focus damage on Rathil, who's an easy target on the ground with an exposed weak point.",
            "Repeat the whole cage-and-totem cycle until he's dead."
          ],
          wipe:"There's no dedicated wipe mechanic in this fight. The real cost of a slow totem cleanse is just a shorter damage phase, so treat speed as the priority." },
        { name:"Prison Puzzle",
          objective:"Spin six dials to match a set of tally marks, then unlock the cell doors.",
          roles:"No fixed roles. Split up the dials and call out your progress.",
          steps:[
            "Find the skeleton nearby with white and dark tally marks: the number of white marks tells you how many dials need to spin clockwise.",
            "Shoot a dial once to start it spinning, again to stop it, and a third time to reverse its direction.",
            "Set the correct number of dials clockwise and the rest counter-clockwise to match the tally marks.",
            "Shoot the lock mechanism once all dials are spinning the right way to open the cells."
          ],
          wipe:"There's no wipe mechanic here. It's a pure logic puzzle, so take your time getting the dial directions right before shooting the lock." },
        { name:"Locus of Wailing Grief",
          objective:"Cleanse Taken totems to generate Solar Charges, deposit four of them at braziers around the boss, then damage it while managing a stacking cold debuff.",
          roles:"No fixed roles. Split up to cleanse totems and carry charges to braziers.",
          steps:[
            "Shoot the Acolyte Eye to start the fight and summon the boss.",
            "Destroy the next wave of Acolyte Eyes to bring out Broken Knights, which spawn Taken totems.",
            "Cleanse the totems into Stasis totems. Each one generates a Solar Charge once the Imminent Wish timer expires.",
            "Carry the Solar Charges to the four braziers around the arena and deposit one at each.",
            "Once all four braziers are lit, damage the boss while standing near a brazier, then move to the next brazier when the buff runs out.",
            "Return to the standards (the flags on poles) periodically to clear a stacking cold debuff, then repeat the whole cycle."
          ],
          wipe:"The Biting Cold debuff kills you outright at ten stacks, so don't stay away from the standards for too long while you're focused on totems and charges." },
        { name:"Hefnd's Vengeance, Blighted Chimaera",
          objective:"Cleanse totems while managing a corruption debuff passed between players, damage the boss across three rising land masses, then finish it off in an untimed final stand.",
          roles:"No fixed roles. Split between clearing Acolyte Eyes, cleansing totems, and managing the corruption debuff hand-off.",
          steps:[
            "Destroy the Taken Blight to start the fight, then clear the Acolyte Eyes and Blights that follow.",
            "Destroy Acolyte Eyes to summon Broken Knights, which spawn Taken totems. Cleanse them into Stasis totems as before.",
            "Melee a Corrupted Hex-Drinker to pass a short debuff onto it instead of letting it build up on you, and don't let it melee you back.",
            "When the Imminent Wish timer ends, damage the boss until it drops below a health threshold, forcing it up to the next land mass.",
            "Repeat this across three rising sections, then reach the final ring of three islands at the top.",
            "On each island, damage the boss and destroy any Acolyte Eyes you can to extend the window before it moves, and coordinate so your team spreads across all three islands.",
            "After using all three islands, repeat the loop until the boss reaches its last stretch of health, then finish it off in an untimed final stand."
          ],
          wipe:"Letting the Hex of Vengeful Corruption debuff run out on you is a personal death sentence, not a team wipe, so pass it off to a Hex-Drinker quickly and don't let one melee you back to reclaim it." }
      ] },
    { name:"Vesper's Host", slug:"vespers-host", art:"/img/destiny_content/pgcr/vespers_host.jpg", armorSlugs:["spacewalk"],
      summary:"Vesper's Host reuses the Scanner and Operator buffs from Deep Stone Crypt and adds a new one, Suppressor, layered with a nuke-carrying mechanic. If you already know Scanner-finds-it, Operator-shoots-it, you're most of the way to understanding this dungeon.",
      encounters:[
        { name:"Activation",
          objective:"Use Scanner and Operator buffs to activate the correct panels in three separate rooms, releasing a nuclear core each time to carry back and deposit.",
          roles:"One player carries Scanner to identify safe panels; one carries Operator to shoot them; everyone else clears enemies and helps carry nukes.",
          steps:[
            "Interact with the sphere in the center to start, then defeat enemies until a carrier drops the Scanner buff.",
            "Head down the hallway, clearing enemies, until another carrier drops the Operator buff.",
            "Approach panels with Scanner active: if a panel disappears from your radar up close, it's dangerous and shouldn't be shot.",
            "Have the Operator shoot the safe panels to spawn a nuclear core in a nearby bucket.",
            "Carry the core back to the main room. It stacks a Radiation debuff the longer you hold it, so pass it to a teammate or drop it if you need to slow the stacking.",
            "Defeat the Brig guarding the deposit point to remove its shield, then deposit the core.",
            "Repeat this whole process two more times for a total of three cores."
          ],
          wipe:"Radiation stacks kill you outright at ten, so don't be a hero carrying the nuke solo across the whole map. Pass it along or drop it to let the stacks decay." },
        { name:"Integration & Nukes",
          objective:"Open and close doors using a collected charge to find nukes hidden in a maze, then deposit them into numbered buckets in the correct order, all while avoiding the boss's wipe attack.",
          roles:"No fixed roles. Move as a group and pass the nuke around to manage Radiation.",
          steps:[
            "Collect a Power Reserves charge from Fallen terminals and use it to open or close doors in the maze.",
            "Find the nuke matching the next numbered bucket and carry it there, passing it between teammates to keep Radiation stacks low.",
            "Defeat the Captain that spawns after each deposit, which drops the next nuke you'll need.",
            "Watch for Raneiks Unified roaming the halls: if it connects a beam to you, break line of sight immediately by ducking behind cover.",
            "Repeat finding and depositing nukes in order until the encounter ends."
          ],
          wipe:"Getting caught in Raneiks Unified's beam attack without breaking line of sight wipes the team, so always know where the nearest cover is while you're moving through the maze." },
        { name:"Raneiks Unified",
          objective:"Track two pairs of numbered Servitors across two trips upstairs, then shoot the matching panels below to force the boss to split apart for a timed damage phase.",
          roles:"No fixed roles. Clear enemies together, then rotate through buff collection for the panel and damage sequence.",
          steps:[
            "Clear enemies in the starting room, then defeat the tougher enemy that spawns to teleport the team upstairs.",
            "Upstairs, clear the Shanks until a special one drops the Suppressor buff.",
            "Use the Suppressor's grenade near the boss to spawn a decoy, then destroy the decoy to split the boss into individual Servitors.",
            "Look for the two Servitors with extra lights on their face and remember their numbers.",
            "Return downstairs and repeat the whole process to get two more numbers, for four total.",
            "Grab the Operator buff and shoot the four panels matching the numbers you collected to start the damage phase.",
            "Defeat the Suppressor Shank that spawns, use its buff on the boss again to split it, then unload damage. You only have 25 seconds before it reforms.",
            "Repeat the whole cycle until it's dead."
          ],
          wipe:"There's no instant wipe here, but mixing up which Servitor numbers you saw wastes an entire panel attempt, so confirm the numbers with your team before committing to the shot." },
        { name:"Corrupted Puppeteer",
          objective:"Use all three buffs together (Suppressor, Scanner, and Operator) to identify and activate panels, deposit two nukes to strip the boss's shield, then finish it in a multi-stage damage phase.",
          roles:"No fixed roles. Rotate through all three buffs as they're needed.",
          steps:[
            "Defeat enemies to claim the Suppressor buff, then use it near a Broken Puppet and destroy its decoy to strip its immunity and clear its radiation field.",
            "Defeat Broken Puppets to spawn carriers for the Scanner and Operator buffs, claiming both.",
            "Have the Scanner check the four center panels to find the one correct panel, matched by a blue number.",
            "The Operator shoots that panel, then find and shoot the matching blue number on panels elsewhere in the room.",
            "Once the correct panels are lit, head down through the flashing red side to the lower area.",
            "In the next room, the Operator activates all the panels, spawning boss copies. The Scanner checks each one, and any that turn white on the radar should be destroyed.",
            "Defeat the correct copy to drop a nuke, then carry it to the bucket in that section.",
            "Repeat this process in the connected room, then once two nukes are deposited, the boss's shield drops.",
            "Take the elevator to the boss arena and begin the damage phase across the center and side platforms.",
            "Look for the unique Broken Puppet during the fight: defeating it drops a nuke you can deposit in the left bunker while the boss is immune, extending your damage window.",
            "Repeat until the boss is dead."
          ],
          wipe:"Radiation stacks and the boss's lightning damage both punish standing still too long, so keep moving between panel duties instead of camping one spot." }
      ] },
    { name:"Sundered Doctrine", slug:"sundered-doctrine", art:"/img/destiny_content/pgcr/dungeon_delver.jpg", armorSlugs:["flain"],
      summary:"Sundered Doctrine takes place in Rhulk's pyramid, and it runs on symbols and light beams: using lenses to redirect Darkness beams onto the correct wall symbol shows up in every encounter. The mechanics get layered with new twists each time, but the beam-and-symbol foundation never changes.",
      encounters:[
        { name:"Riddle",
          objective:"Identify the missing symbol on a wall wheel, then redirect a Darkness beam through lenses to light it up. You'll do this three times, with more beams each round.",
          roles:"No fixed roles. Split up across the four side rooms and clear enemies together.",
          steps:[
            "Rotate the central lens to start the encounter and note the two symbols shown on the wheel: the third, missing one is your target.",
            "Defeat the tough enemy that spawns to reveal which symbol is correct.",
            "Defeat Subjugators to collect lenses, then use them to extend and redirect the beam path toward the correct symbol.",
            "Rotate lenses carefully before placing them, since an already-active lens will break after being rotated three times.",
            "Once the beam hits the correct symbol, the round completes. Repeat for two more rounds, each with more beams active at once."
          ],
          wipe:"Hitting the wrong symbol with a beam spawns a Tormentor instead of progressing. There's no team wipe, but it adds a tough fight you didn't need, so double check the missing symbol before committing a beam." },
        { name:"Zoetic Lockset",
          objective:"Manage which of several rotating symbol wheels is active, since the wheel locked in when a shared meter fills determines what happens next: some help you, some spawn enemies, and one lets you deal damage.",
          roles:"No fixed roles. Split up to defend wheels and clear whatever the locked symbol spawns.",
          steps:[
            "Approach the wheels and note that a shared meter (Lockset Progression) fills as the fight goes on, shifting which wheel is currently adjustable.",
            "Rotate the active wheel's symbols to try to lock in the effect you want when the meter fills.",
            "Locking in 'Stop' prevents enemies from spawning, and locking in 'Commune' lets you damage the boss. Those are the two outcomes worth aiming for.",
            "Locking in 'Hive' or 'Remember' spawns tougher enemies instead, so clear them quickly if that's what comes up.",
            "Repeat cycling the wheels and reacting to whatever locks in until the boss is defeated."
          ],
          wipe:"There's no instant wipe here, but letting the wrong symbol lock in repeatedly just prolongs the fight with harder adds, so treat wheel management as a priority, not an afterthought." },
        { name:"Kerrev, The Erased",
          objective:"Figure out which of two symbol sets is the Lie, then use lenses to light up all three Lie symbols while removing light from the Truth symbols, to break the boss's shield for damage.",
          roles:"Split across the left, center, and right rooms to manage lenses and figure out the correct symbol set.",
          steps:[
            "Note the two sets of three symbols behind the boss: one set is the Truth, the other is a Lie.",
            "Find the Truthspeaker-type enemy in either the left or right room (never the middle) to help confirm which set is false.",
            "Illuminate all three Lie symbols using the room's lenses, and make sure no light is hitting the Truth symbols.",
            "Defeat any Unwritten Attendants guarding Strand-locked lenses or buttons to unlock them if needed.",
            "Once the Lie symbols are lit and the Truth symbols are dark, the boss's shield drops, so unload damage until it goes immune again.",
            "Repeat identifying the Lie and relighting the correct symbols until the boss is dead."
          ],
          wipe:"Lighting up a Truth symbol undoes your progress on that round rather than wiping the team outright. It costs time, not lives, so it's worth double-checking the correct set before committing to a full relight." }
      ] },
    { name:"Equilibrium", slug:"equilibrium", art:"/img/destiny_content/pgcr/dungeon_equilibrium.jpg", armorSlugs:["sage-protector"],
      summary:"Equilibrium is Renegades' launch dungeon, and it's built almost entirely around one mechanic, Gathering Shadow, that keeps getting more demanding as you go. You'll spend the whole run picking up Darkness pools to build a stacking buff, then spending that buff on doors, shields, and eventually the final boss's own throne world. Learn the buff economy in the first encounter and the rest of the dungeon is the same idea with more steps bolted on.",
      encounters:[
        { name:"Barant Imperium Forces",
          objective:"Break the shields on six Nameless Apprentices using a Darkness-fueled grenade, while managing a fireteam-killing debuff in the tunnels where you earn it.",
          roles:"A couple of players ride Sparrows through the side tunnels collecting Gathering Shadow while everyone else holds the main arena and manages Apprentices.",
          steps:[
            "Lure an Apprentice to one of the three Cabal devices near the arena's red barriers, then activate the pylon at either end of that device.",
            "Get close enough that the Apprentice starts charging Darkness energy: if they unleash their attack while the pylon is up, it charges the device and drops that barrier.",
            "Send a player (or two) into the tunnels beyond on a Sparrow to collect Gathering Shadow pools. The Creeping Shadow debuff will kill you if you linger too long between pickups, so keep moving and grabbing pools to reset it.",
            "Once you've collected enough to reach Shadow Novice, your grenade swaps into a special Shadow attack, and Shadow Novice also cancels the Creeping Shadow debuff outright.",
            "When an Apprentice throws out its Darkness attack, use the Shadow grenade on it to strip the shield, then finish it off.",
            "Every Apprentice kill drops a Cabal pod carrying more adds and a yellow-bar Behemoth walker. Get out from under the pod itself, since it kills on landing.",
            "Repeat until all six Apprentices and every Behemoth are dead to spawn the loot chest."
          ],
          wipe:"No hard wipe: the danger is a drop pod landing on someone, or losing whoever's in the tunnels to the Creeping Shadow debuff if they run dry on Gathering Shadow pickups." },
        { name:"Search for Imperial Intelligence",
          objective:"A platforming section through the Harvester jump ship's hangar and maintenance tunnels to reach the first boss arena.",
          roles:"No fixed roles. Move as a group, since at least one door needs the full fireteam standing at it to open.",
          steps:[
            "Climb from the red-lit hangar onto the hanging platform above it, then across to a smaller platform with a breakable grate, then shoot it out to drop down.",
            "Wait at the door ahead until all three lights above it turn green, which only happens once the whole fireteam has arrived.",
            "Work through the hallways beyond, shooting fuses to open barriers and drop into the marked maintenance shaft when you reach it.",
            "Continue through to the breakable grates near a small barricade, which leads into the first boss arena.",
            "Don't shoot out the window you'll pass: it vents you into space."
          ],
          wipe:"No wipe mechanic. This is pure traversal, though a badly timed jump or an explosive trapped hatch can still kill you outright." },
        { name:"Harrow, Dredgen-Apprentice",
          objective:"Break a dual-blade-wielding Gladiator's shield using the Shadow buff twice over, then chase him down after he tries to flee partway through his health bar.",
          roles:"Everyone clears adds and hunts Lackeys together; whoever reaches Shadow Apprentice handles closing the Darkness panels and triggering the shield-break mechanisms.",
          steps:[
            "Shoot the fuse in the Rally Flag room to drop into the arena and start the fight.",
            "Clear the first wave of enemies, then wait for more to open side doors leading into the surrounding hallways.",
            "Hunt down Lackey enemies in those side rooms, which drop the Darkness energy needed to reach Shadow Novice, then Shadow Apprentice (roughly double the Shadow of Novice).",
            "With Shadow Apprentice, use your special grenade on the correct Darkness-covered panel in each of the three side rooms: three panels closed per room, confirmed by the door lights turning green.",
            "Back in the main arena, drop Harrow's shield one of two ways: lure him onto the red bay doors and shoot the nearby fuse to open a floor hole he falls into, or light up the four corner pylons via the Darkness devices and bait one of his own attacks into hitting a pylon.",
            "Once his shield drops, you have about 30 seconds to deal damage before he goes immune again, and the pylons/fuses don't reset, so you likely only get three total damage phases.",
            "At the health split, his shield resets and he cuts through the back wall to flee. Chase him down the hallway immediately, since his shield falters again there and gives you a short window to finish him."
          ],
          wipe:"No instant wipe, but running out of intact pylons/fuses before he's dead means starting the encounter over, and hesitating when he breaches the back wall can let him escape the damage window entirely." },
        { name:"Board the Malphas Contemptus and Infiltrate the Command Ship",
          objective:"A second platforming stretch across the Harvester's hull and into the Malphas Contemptus, ending at the final boss's door.",
          roles:"No fixed roles. Move together, and have someone hold at least the Shadow Apprentice buff to open the panel that reveals the path forward.",
          steps:[
            "Use Shadow Apprentice on one of the Darkness panels near where you fought Harrow to reveal a switch, then flip it to open the bay door.",
            "Jump down onto the Malphas Contemptus as it pulls in below, then work through the red-lit switches, blast doors, and platforms along its underside.",
            "Find the correct grate among several identical-looking ones at the bottom of a shaft (most are dead ends), then continue up through the ship's interior.",
            "Rebuild Shadow Apprentice to reach a high pipe across a large chamber. There are multiple ways up if you've got strand grapple, an Eager Edge sword, or similar mobility tools.",
            "Clear the two Praetorians guarding the hallway just past the pipe to reach the final boss door."
          ],
          wipe:"No wipe mechanic. Again, pure traversal, but the timing window on the Darkness panel near the high pipe is tight enough to cost you a lot of backtracking if you miss it." },
        { name:"Dredgen Sere",
          objective:"Cycle between building Gathering Shadow to Shadow Master, clearing a Taken mirror of the arena, and destroying five Taken orbs in both planes to earn a damage phase on the final boss.",
          roles:"Split attention between building Shadow, hunting Nameless Apprentices to open orbs, and Compelling the five Blistered Shadows once teleported into the Taken realm.",
          steps:[
            "Approach or shoot Dredgen Sere or his kneeling Apprentices to start the encounter, but don't stand too close, since his opening slam can kill you outright.",
            "A 45-second Lure of the Dark timer begins immediately. Use it to build Gathering Shadow toward Shadow Master and kill Apprentices to start destroying the five Taken orbs in the arena's center.",
            "When the timer hits zero, your fireteam is pulled into a Taken mirror of the arena containing five Blistered Shadows (shades of Sere) and more Gathering Shadow pools.",
            "With Shadow Master, Compel each Blistered Shadow in turn. Every successful Compel grants a Lure of the Dark stack and lets you shoot one of the Taken orbs. Killing two of the Blistered Shadows instead lowers how many stacks you need and boosts the damage window.",
            "Hit one of the Darkness-corrupted devices to spawn phantasmal platforms leading up to the fifth Blistered Shadow, which hides above the main arena.",
            "With full Lure of the Dark stacks, you're returned to the real arena. Kill Apprentices to destroy the remaining Taken orbs there. All five orbs need to go down in both planes, and the very last one should be destroyed somewhere you can actually reach Sere, or you'll waste time getting into position.",
            "During the damage phase, shoot Sere's glowing hands while he's channeling lightning to interrupt and stun him.",
            "If he survives the damage phase, retreat to the arena's edges immediately: the center floods with lethal Arc energy. Stop the pylons feeding it by hitting a nearby Darkness panel with your special grenade while holding at least Shadow Novice.",
            "Repeat the whole Lure of the Dark and orb-destruction cycle until Sere finally collapses."
          ],
          wipe:"Standing in the center once the Arc energy floods in after a damage phase kills you outright, and destroying the final orb somewhere you can't immediately follow up on costs you a full damage window rather than the run itself." }
      ] }
  ];

  return { DUNGEONS };
})();
