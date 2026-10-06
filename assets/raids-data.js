/* ============================================================
   Raid data — single source of truth for raids.html and raid-guide.html.
   Add a new raid by adding an entry here — no new HTML page needed.
   `armorSlugs` link back to the matching entries in sets-data.js.
   `summary` and `encounters` are left blank for you to fill in —
   write them the same way you did the FAQ, in your own words.
   ============================================================ */
window.RaidsData = (function(){
  const RAIDS = [
    { name:"Last Wish", slug:"last-wish", armorSlugs:["great-hunt"],
      puzzleHelper:{ slug:"wall-of-wishes", title:"Wall of Wishes Reference", blurb:"Look up any of the 15 wishes: plate location, effect, and the button pattern to shoot." },
      summary:"Last Wish was Destiny 2's first true modern raid, and it still has a reputation as one of the most mentally demanding raids in the series, not because the combat is brutal, but because nearly every encounter is a puzzle that needs constant callouts. If your team doesn't talk, this raid grinds to a halt fast.",
      encounters:[
        { name:"Kalli, the Corrupted",
          objective:"Match six symbols around the room to matching floor plates, defend each plate long enough to spawn a Knight, then damage Kalli in short bursts while hiding from her wipe attack.",
          roles:"One player per symbol, each responsible for finding and clearing their one matching plate.",
          steps:[
            "Note the six symbols hanging around the central arena and assign one player to each symbol.",
            "Find the matching symbol on a plate elsewhere in the room and stand on the safe section of that plate.",
            "Survive three explosions from the plate, then kill the Knight that spawns to clear it.",
            "Once all six plates are cleared, group up in the center and damage Kalli.",
            "When she prepares her wipe attack, immediately take cover in one of the safe rooms that unlock below her. You'll do this a few times per damage phase.",
            "Repeat the whole cycle with a new set of symbols until Kalli is dead."
          ],
          wipe:"Standing on the wrong section of a plate when it explodes kills you instantly, and failing to reach a safe room before Kalli's wipe attack fires kills the whole team. Stepping onto a plate that doesn't actually match a symbol currently in the center also spawns an Ogre instead of clearing anything, so double check you've got the right plate before committing to it." },
        { name:"Shuro Chi, the Corrupted",
          objective:"Break Shuro Chi's shield using a laser weapon, damage her, interrupt her wipe attack, then solve a picture puzzle, all within a four-minute timer, three times over.",
          roles:"One player collects a special item to interrupt her wipe attack; others handle the laser weapon and the puzzle room.",
          steps:[
            "Push forward and clear enemies until you reach Shuro Chi, then defeat a specific enemy that drops an item needed to interrupt her later.",
            "Pick up the laser-type weapon, get into position, and form a triangle of laser fire with your team to strip her shield.",
            "Damage her until a chunk of health is removed, then have the item-holder use their ability the moment she starts her wipe attack to interrupt it.",
            "Enter the puzzle room, split up to man the floor buttons, and recreate each picture in sequence to reset the timer.",
            "Climb up to the next level and repeat the entire process: three times total, once per level of the building."
          ],
          wipe:"The four-minute timer wipes the team if it runs out before the puzzle is solved, and failing to interrupt her wipe attack in time does the same. Speed matters as much as accuracy here." },
        { name:"Morgeth, the Spirekeeper",
          objective:"Collect a set of orbs before the boss reaches full power, then damage him while managing who's allowed to carry what.",
          roles:"Split into two groups covering each side of the arena; one player is responsible for rescuing anyone who gets locked down.",
          steps:[
            "Collect orbs of energy that spawn around the arena before Morgeth absorbs them. Each player can safely hold two at once.",
            "If someone gets stuck holding too many and becomes locked in place, another player needs to kill a specific enemy, grab the item it drops, and use it to free them.",
            "Once every orb is collected, group up and unload damage on Morgeth's exposed weak point.",
            "Watch for homing projectiles during the damage phase and shoot them down before they connect.",
            "When Morgeth's power meter gets close to full, the same freeing ability must be used on him directly to prevent a wipe."
          ],
          wipe:"Picking up a third orb instantly kills you, and letting Morgeth's power hit maximum wipes the whole team. Both are avoidable with clear callouts about who's carrying what." },
        { name:"The Vault",
          objective:"Identify matching symbols across three rooms and cleanse the correct locks with the correct type of energy, all within a tight timer.",
          roles:"Three players each hold down one room and read out their symbols; whoever kills the right enemy carries the cleansing energy to the correct lock.",
          steps:[
            "Stand on the three locks at once to reveal symbols, then call out your center symbol and figure out which other room has a matching duplicate.",
            "Kill the enemy that spawns to collect an energy type, which tells you whether the matching lock needs to be cleansed on the left-duplicate or right-duplicate side.",
            "Carry that energy through the connecting tunnels to the correct lock and cleanse it.",
            "Repeat until all three locks are cleared, which opens a beam of light and restarts the whole process.",
            "Do this a total of three times to fully open the vault door."
          ],
          wipe:"Using the wrong energy type on a lock kills you and anyone nearby, and letting an enemy Knight reach and strike an active lock wipes the team. This is a math-and-communication encounter more than a combat one." },
        { name:"Riven of a Thousand Voices",
          objective:"Split into two rooms to cleanse symbols and call out Riven's glowing eyes, repeat that on a second floor, then finish with a long multi-stage damage sequence.",
          roles:"Two teams of three cover separate rooms early on; later, the whole team works together calling out and remembering assigned eyes.",
          steps:[
            "Split into two groups of three and head into separate rooms below the starting platform.",
            "In whichever room Riven appears, damage her until she staggers and two of her eyes start glowing, then call those out to the other room immediately.",
            "In whichever room an Eye of Riven enemy appears instead, kill it, grab the item it drops, and use callouts from a teammate to cleanse the correct symbol.",
            "When Riven enters a room with her mouth open, damage the glowing target inside it, then destroy the correct eyes the instant her mouth closes.",
            "Move up a level and repeat the same process a second time.",
            "On the top floor, work together as one team, damaging Riven and remembering an assigned eye each of the three times she appears, then destroy your assigned eye during the final damage window.",
            "Ride down together shooting her exposed weak points as you descend, and repeat the whole cycle until her health is nearly gone.",
            "Once she's almost dead, work through a jumping section under a slowly-draining health debuff to reach a light at the top, then return for her final stand and finish the damage before dashing into her mouth to destroy her heart."
          ],
          wipe:"Destroying the wrong eyes (or missing the short window to destroy the right ones) wipes the team almost every time this fight goes wrong, so treat the callouts as more important than your own damage numbers." },
        { name:"Riven's Heart",
          objective:"Carry Riven's heart back through the raid to the altar near the Vault, passing it off between players as the timer runs out.",
          roles:"One player carries the heart at a time; everyone else stays close to avoid a stacking debuff, and clears the path ahead.",
          steps:[
            "Whoever is chosen picks up the heart and starts moving. Everyone else needs to stay within its glow or they'll build up a stacking debuff that eventually kills them.",
            "When the carrier's timer runs low, they'll vanish into another realm, where collecting a set of light beams together can reset their clock once.",
            "As soon as one carrier disappears, the next player is automatically chosen to pick up the heart and keep moving.",
            "Clear a path back through the raid toward the Vault section, since the heart carrier can only walk and single-jump.",
            "Continue the relay of carriers until the heart reaches the altar, which ends the raid automatically."
          ],
          wipe:"Letting the Creeping Darkness debuff reach its max stack kills whoever's affected, and losing too many carriers to enemies mid-transport can stall the whole relay. Keep the path clear ahead of whoever's currently carrying it." }
      ] },
    { name:"Garden of Salvation", slug:"garden-of-salvation", armorSlugs:["kentarch-3"],
      summary:"Garden of Salvation is short compared to most raids (just four encounters), but it makes up for that with pure endurance. There's very little in the way of puzzles here; it's mostly about managing timers, buffs, and constant enemy pressure without anyone getting overwhelmed.",
      encounters:[
        { name:"Evade the Consecrated Mind",
          objective:"Push through three barriers while dodging a slow-moving boss, then sprint through an open field to finish.",
          roles:"Split into a forward group opening barriers and a rear group babysitting the boss, leapfrogging forward as the boss advances.",
          steps:[
            "Have a few players shoot a floating box near the start to form a tether that opens the first door and starts the encounter.",
            "Send a group ahead to fight through to each barrier, killing a shielded flying enemy and using a nearby box to tether the barrier open.",
            "Keep a group near the boss collecting the orbs it periodically drops, since leaving one alone for too long wipes the team.",
            "As the boss advances into a cleared area, have the trailing group leapfrog past it to the next barrier.",
            "At the final barrier, all three tethers need to go up at once, since it takes three separate locks to open.",
            "Once it's down, everyone pushes into the open field together, killing what you can and running the rest of the way to the end."
          ],
          wipe:"Ignoring one of the boss's orb-drops for too long kills the whole team, so always keep someone assigned to grab it no matter what else is going on." },
        { name:"Summon the Consecrated Mind",
          objective:"Secure four relay points around the map, then hold a fifth in the center until the boss is fully summoned.",
          roles:"Rotate around the map clockwise as a group, leaving one or two defenders behind at each relay you clear.",
          steps:[
            "Kill the enemies in the center to start the fight.",
            "Push clockwise as a group, clearing a relay, tethering it for a buff, then leaving one or two players behind to defend it before moving to the next.",
            "Repeat until all four corner relays are active and defended.",
            "Once all four are up, waves of flying enemies attack each relay in turn, and clear them using the buff to break their shields.",
            "When all of those waves are cleared, the center opens up, and everyone regroups there to defend one final relay until the encounter ends."
          ],
          wipe:"Losing a relay to enemies while it's undefended forces you to reclaim it from scratch. It's not an instant wipe, but it can snowball into one if multiple points fall at once, so don't leave a relay with zero defenders for long." },
        { name:"Defeat Consecrated Mind",
          objective:"Bank motes to trigger damage phases, while a separate team manages a debuff that requires calling out which of the boss's eyes to shoot.",
          roles:"Three players farm and deposit motes; three players follow the boss, with one holding the debuff and calling out eye positions while the other two shoot them.",
          steps:[
            "Tether the starting relay to begin the fight.",
            "Have one group kill the enemies that drop motes and deposit them at the glowing relay, aiming for 10 at a time before the pickup timer expires.",
            "Have the other group follow the boss, and whoever picks up its dropped charge gets locked in place and must call out which of the glowing eyes are lit.",
            "The two free players shoot the called-out eyes to free their trapped teammate.",
            "Once 30 motes are banked, follow the boss to the relay for a damage phase: shine all its eyes red, then shoot its exposed core as it backs away.",
            "Repeat the whole mote-and-eye cycle until the boss is dead."
          ],
          wipe:"Failing to shoot the correct eyes in time kills whoever's holding the charge, and if all three chase-team players end up unable to pick up the charge at once, rotate someone in from the mote team immediately or the cycle stalls." },
        { name:"Defeat Sanctified Mind",
          objective:"Fill two relays with 30 motes each by sending players through temporary portals, then use those relays to stun the boss and deal damage.",
          roles:"Two pairs collect motes on each side of the arena; one pair manages the relays, rebuilds broken platforms, and clears enemies.",
          steps:[
            "Damage the boss and clear the enemies that spawn, including a shielded flyer that unlocks the relays.",
            "Destroy the boss's shoulder or knee to open a portal, sending a pair through to collect motes on that side.",
            "Destroy the same shoulder or knee again to pull that pair back, then immediately send the next pair through.",
            "Deposit collected motes into the matching colored relay each time a pair returns, until both relays hit 30.",
            "When the boss shows a colored symbol, use the matching relay to tether and break it, then immediately switch to the opposite relay to break the second symbol.",
            "With both symbols broken, group up and unload damage on the boss's stomach before it resets, then repeat the whole cycle."
          ],
          wipe:"Standing on a platform when the boss destroys it kills you instantly, so use the relay tether to rebuild broken platforms before they're needed again, and always know which platforms are safe before you need to cross them." }
      ] },
    { name:"Deep Stone Crypt", slug:"deep-stone-crypt", armorSlugs:["legacys-oath"],
      summary:"Deep Stone Crypt introduced two buffs, Scanner and Operator, that show up again and again through the raid: Scanner lets you see something hidden that other players can't, and Operator lets you interact with terminals and free trapped teammates. Nearly every encounter comes down to the same loop: find the right target, tell someone else, and don't let the timers run out.",
      encounters:[
        { name:"Pike & Sparrow",
          objective:"Ride vehicles across an icy field, bubble to bubble, to reach the entrance without freezing to death.",
          roles:"No fixed roles, just keep moving as a group.",
          steps:[
            "Grab a Pike or Sparrow at the start and follow the marked path across the ice.",
            "Duck into each shielded bubble along the way to clear a freezing debuff before it stacks too high.",
            "Clear out the Fallen defending each bubble as you go.",
            "Push through to the final bubble, which is guarded by tougher enemies, then continue on to the entrance."
          ],
          wipe:"Staying out in the storm too long stacks a freezing debuff that kills you at max stacks, so don't skip bubbles even if you think you can make it." },
        { name:"Crypt Security",
          objective:"Use two rotating buffs, Scanner and Operator, to identify and destroy six hidden fuses, split between an upstairs team and a basement teammate.",
          roles:"Split into two teams of three (light side and dark side); one player goes alone into the basement as Operator.",
          steps:[
            "One player grabs the Operator buff from the terminal and heads to the basement alone.",
            "Defeat the enemy that drops the Scanner buff and use it to look through the floor and call out which basement keypads are lit on your side.",
            "Pass the Scanner buff across to the other side using the terminal so they can call out their two keypads.",
            "The Operator shoots all four called-out keypads from the basement.",
            "Pass the Operator buff back upstairs and give the Scanner buff to whoever's now in the basement.",
            "The new basement Scanner calls out which of six fuses is lit; everyone upstairs on that side shoots the matching fuse.",
            "Repeat calling out and destroying fuses one at a time until all six are gone."
          ],
          wipe:"There's no instant wipe here, but the basement player only has a few minutes before the room floods with fire and kills them, so swap out whoever's down there if the fight is dragging on." },
        { name:"Atraks-1, Fallen Exo",
          objective:"Split between the Crypt and a space area to find the correct enemy copy, defeat it, and eject a stacking debuff out an airlock, repeating until enough copies are cleared for a final stand.",
          roles:"Three players in space, three in the Crypt; one Scanner locates the correct enemy copy, one Operator manages airlocks and frees debuffed players.",
          steps:[
            "Split into two teams of three: one heads to space, one stays in the Crypt.",
            "Each team defeats an enemy to claim either the Scanner or Operator buff, then shares buffs between areas using the terminals so both teams get access to each.",
            "The Scanner finds the one glowing enemy copy out of several identical ones and calls it out for the team to kill.",
            "Whoever kills it picks up a stacking debuff and needs to get to an airlock the Operator has unlocked before time runs out.",
            "Stand in the airlock and have the Operator shoot the debuff off your head to clear it safely into space.",
            "Pass the Scanner buff back and forth between space and the Crypt to repeat this process until eight debuffs are ejected total.",
            "For the final stand, everyone moves to space, and the Scanner calls out each glowing copy in sequence until the boss is dead."
          ],
          wipe:"The debuff kills whoever's carrying it if it isn't ejected through an airlock in time, so always have the Operator ready and watching for stranded players before the timer runs out." },
        { name:"Descent",
          objective:"Navigate a jumping puzzle along the outside of the station back to solid ground.",
          roles:"No fixed roles, just take it carefully.",
          steps:[
            "Work your way along the platforms on the outside of the station, following the path back toward the interior.",
            "Take your time on tricky jumps rather than rushing. There's no enemy pressure here, just the fall.",
            "Grab the hidden chest on a platform to the left if your team wants it before continuing."
          ],
          wipe:"Falling just costs you the climb, not the raid. There's no wipe mechanic here, just don't fall." },
        { name:"Taniks, Reborn",
          objective:"Collect three buffs, identify which buckets need Nuclear Cores, and stun Taniks long enough to deposit them, repeating until a hatch opens.",
          roles:"One Scanner calls out which buckets are active, one Operator releases Nuclear Cores, one Suppressor stuns Taniks.",
          steps:[
            "Defeat the enemies that drop the Scanner, Operator, and Suppressor buffs.",
            "The Scanner calls out which buckets around the room are lit up and need a Nuclear Core.",
            "The Operator shoots the keypad near the core dispenser to release Nuclear Cores for two players to grab.",
            "The Suppressor moves under each of three drones in sequence, shooting Taniks from underneath each one to stun him.",
            "Once Taniks is stunned, the core carriers deposit their Nuclear Cores into the correct buckets.",
            "When a core is deposited, one buff gets disabled at random, so swap it to a new player using the terminal.",
            "Repeat until enough cores are deposited to open the center hatch, then everyone drops down and runs to the end before Taniks catches up."
          ],
          wipe:"Holding a Nuclear Core too long builds up a radiation debuff that kills you, so pass it to a teammate before it maxes out, and don't dawdle once the hatch opens, since Taniks will kill anyone he catches." },
        { name:"Taniks, the Abomination",
          objective:"Combine the Scanner, Operator, and Suppressor roles from the previous fight to deposit Nuclear Cores across three zones, then burn down Taniks in a multi-part damage phase.",
          roles:"Three pairs, one per zone; one Scanner calls out active buckets, one Operator frees trapped players, one Suppressor stuns Taniks.",
          steps:[
            "Split into three pairs and send one to each of the three zones around the arena.",
            "Defeat enemies to claim the Scanner, Operator, and Suppressor buffs.",
            "The Scanner calls out which two Nuclear Core buckets are currently active.",
            "Everyone focuses Taniks' wings to knock loose Nuclear Cores, then two players carry them toward the correct buckets.",
            "Swap a Nuclear Core to a fresh carrier before the radiation debuff maxes out on whoever's holding it.",
            "The Suppressor moves under three drones in sequence, stunning Taniks each time so the cores can actually be deposited.",
            "The Operator frees any core carrier who gets trapped in a barrier during this process.",
            "Repeat until four cores are deposited, at which point Taniks moves to the center for a damage phase: jump past the outer ring but stay inside the inner one to deal damage.",
            "Repeat the whole core-and-damage cycle until his final health chunk, when he starts teleporting around the arena, then chase him down and finish the fight."
          ],
          wipe:"This fight punishes indecision: letting radiation max out on a core carrier kills them, and running out of time in the final teleporting phase is a hard wipe with no second chances, so keep pushing damage even when things feel chaotic." }
      ] },
    { name:"Vault of Glass", slug:"vault-of-glass", armorSlugs:["atheons-memory"],
      summary:"Vault of Glass is Destiny's oldest raid, brought back from the original game. The whole thing is built around Vex time-travel shenanigans: if you get pulled through a portal alone, that's supposed to happen, not a sign you messed up. A few ideas repeat through every encounter: one person carries a special item called the Relic that does something different in each fight, callouts matter more than damage, and almost every encounter has a specific 'do this wrong and the raid wipes' rule. Learn that one rule per encounter and the rest takes care of itself.",
      encounters:[
        { name:"Opening the Vault of Glass",
          objective:"Activate and hold three Vex sync plates until a central Spire finishes forming and the vault door opens.",
          roles:"Split into three pairs, one pair per plate.",
          strategyImage:{ url:"raid-assets/entrance-formation.svg", label:"Our plate formation" },
          steps:[
            "Head to the three sync plates around the starting area (one to the left, one straight ahead near the door, one to the right) and send a pair to each.",
            "Stand on each plate to build the connection between them.",
            "Small Vex like Goblins and Hobgoblins can't take a plate back. Only Praetorians can, so focus them down before they reach your plate.",
            "Watch for Cyclops enemies spawning in the open area. They hit hard, so drop them fast with Supers or heavy weapons.",
            "Keep the pressure off all three plates until the Spire in the center fully forms and the door opens."
          ],
          wipe:"Losing a plate to a Praetorian resets that plate's progress, and an unchecked Cyclops can wipe a two-person team fast, so don't let either one go unanswered." },
        { name:"Confluxes",
          objective:"Defend one Conflux, then two, then three, as Vex enemies march in to sacrifice themselves into them.",
          roles:"Stay together for the single-Conflux phase, then split into pairs as more Confluxes appear.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107249516/A9A5DB62D1DFF46C7E8E6AE335554F27AEB0A3CF/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "In the opening phase there's only one Conflux, so stay together and clear whatever rushes in.",
            "When it splits into two, divide the team in half and defend one Conflux each.",
            "In the final phase there are three Confluxes, so pair up, two players per Conflux.",
            "Prioritize Wyverns and any tougher Champion-type enemies the instant they appear over regular Vex.",
            "Watch for glowing pools left behind by defeated enemies. Standing in one marks you for Negation, and there's a cleansing well in the center of the arena to clear the debuff."
          ],
          wipe:"Letting too many regular Vex sacrifice into a Conflux fails it, but letting even one Wyvern sacrifice is an instant wipe, so kill Wyverns the moment you see them, no exceptions." },
        { name:"Oracles",
          objective:"Destroy Oracles in the exact order they spawn, across five rounds that each add one more (3, then 4, 5, 6, and 7).",
          roles:"Assign each player to watch one or two specific spawn points and call out a number the instant theirs appears.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107250689/361F55C723836144DD2C3036F36F02E6CD1AECF1/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "Spread out so every spawn point has someone watching it. With six players, one or two people will need to cover two spots each.",
            "When an Oracle spawns, that player immediately calls out its position in the sequence.",
            "Destroy them strictly in that order, not whichever one is closest.",
            "Watch for Hobgoblins sniping from the edges of the room while you work through the sequence.",
            "Repeat for all five rounds, with one more Oracle live each time."
          ],
          wipe:"Destroying Oracles out of order marks the team, and running out of time before finishing a round wipes everyone, so a clear labeling system (like L1-L3 and R1-R4) matters more than raw damage here." },
        { name:"Templar",
          objective:"Break Templar's shield using the Relic, damage him during his exposed window, and repeat until he's dead.",
          roles:"One player carries the Relic and handles Oracles, shield removal, and rescuing anyone detained; everyone else deals damage once the shield drops.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107252829/2713C834D61CAD2B64849A34F5BABFE453C3FA10/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "Pick up the Relic to start the fight. Three Oracles spawn immediately and must be destroyed in order, same rule as the Oracles encounter.",
            "Once those Oracles are down, the Relic holder uses its charged attack to knock off Templar's shield.",
            "With the shield down, everyone except the Relic holder focuses Templar's weak point until he drops a teleport ring on the ground.",
            "Optionally, the Relic holder can stand inside that ring to block the teleport and extend the damage window, but this spawns extra Praetorians that need clearing.",
            "If Templar does teleport, he regains his shield, so repeat the Oracle-shield-damage cycle until he's dead."
          ],
          wipe:"If the Relic gets dropped, someone needs to grab it again within about 10 seconds or it wipes the team, so protect the Relic holder like they're the only objective that matters." },
        { name:"Gorgon's Labyrinth",
          objective:"Cross a fog-filled maze patrolled by giant Harpies called Gorgons without being spotted. There's no combat here, just stealth and patience.",
          roles:"No special roles, move together and stay low.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107259811/2BCB8A8C794B555D30F500FC86053F0BB50DC5F9/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "Stay crouched and hug cover as you move through the maze.",
            "If a Gorgon notices you, it enrages, so freeze and wait it out rather than panicking or running.",
            "The large rocks on the left side of the maze let you jump across and avoid several Gorgons at once, which tends to be the most consistent route.",
            "Exit on the left-hand side of the maze relative to where you came in."
          ],
          wipe:"Being spotted by a Gorgon is the only way to lose progress here. There's no timer, so it's always better to move slowly than rush and get caught." },
        { name:"Gatekeeper",
          objective:"Relay the Relic between two portals to clear shielded Praetorians on each side, then defend a Conflux that spawns in the main room.",
          roles:"One player starts with the Relic; two players hold the portals and call out enemy spawns; one or two guard the sync plates keeping the portals open.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107255642/CE946B2A3857144E19B63AE2D3B2F32B56A6F265/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          secondaryMapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107256333/AC131C9AFCE287E3FBA447ABED099DFCE3FBB4C6/", credit:"Map by SCA, Mars/Venus portal variant", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "Defeat the Gatekeeper enemy in the center of the room, then grab the Relic that spawns where it died.",
            "While that's happening, the rest of the team activates both portals by standing on their sync plates.",
            "Send one player into each portal. They call out as soon as a shielded Praetorian appears on their side.",
            "The Relic holder rushes into whichever portal has the Praetorian, breaks its shield, then drops the Relic for the player already inside to pick up.",
            "That player carries the Relic back out and across to the opposite portal, where the process repeats.",
            "Watch the sync plates: if an Overload Minotaur reaches one, it shuts that portal down until it's cleared.",
            "Once enough Praetorians are cleared this way, a Conflux appears in the main room. Regroup there and defend it, including a few Wyverns that show up near the end, until the encounter ends."
          ],
          wipe:"The Relic can only pass through one portal at a time before it has to be dropped for someone else to carry. Holding it too long, or losing the Relic holder mid-handoff, stalls the whole rotation." },
        { name:"Atheon, Time's Conflux",
          objective:"Coordinate between a team that gets teleported away and a team that stays behind, matching an Oracle order across both sides, to earn a damage window on Atheon.",
          roles:"Three players stay in the main room calling out Oracle order and managing portals; three get teleported and must report which side they landed on, then handle Oracles and Relic duty inside.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107258175/8D357A073AF855EA7415F27884AD60BFECE050BA/", credit:"Map by SCA", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          secondaryMapImage:{ url:"https://images.steamusercontent.com/ugc/2049741439107258764/8848A884536F56C0B7D4AEC44B031508DC3D0DB1/", credit:"Map by SCA, Mars/Venus portal variant", creditUrl:"https://steamcommunity.com/sharedfiles/filedetails/?id=2955271467" },
          steps:[
            "Destroy the floating Vex cube to start the fight. This spawns Atheon along with waves of Harpies.",
            "Clear Harpies until three players get randomly teleported away.",
            "The teleported players immediately call out which side they're on.",
            "The team left behind opens the matching portal and calls out the order Oracles are spawning above them, so the teleported group can destroy their own Oracles in the same order.",
            "One teleported player grabs a Relic on their side to clear Praetorians and cleanse a blinding debuff from the group.",
            "After nine Oracles are destroyed across three rounds, the teleported players escape back through the portal.",
            "Everyone gets a short buff that opens a damage window on Atheon. Focus fire immediately since it doesn't last long.",
            "Repeat the whole cycle until Atheon is dead. There's no separate final stand phase."
          ],
          wipe:"Getting the Oracle order wrong on either side, or running out of time before the teleported players escape, ends the run. Clean callouts between the inside and outside teams matter more here than anywhere else in the raid." }
      ] },
    { name:"Vow of the Disciple", slug:"vow-of-the-disciple", armorSlugs:["resonant-fury"],
      summary:"Vow of the Disciple hinges on symbol callouts more than any raid before it. Nearly every encounter has you finding two or three symbols, matching them to a target, and acting fast once you do. It also introduces a stacking darkness debuff that follows you through the whole raid, so managing that matters as much as the mechanics themselves.",
      encounters:[
        { name:"Payload",
          objective:"Escort a moving payload across the map by collecting a buff from defeated enemies and depositing it to keep the payload rolling forward.",
          roles:"No fixed roles, split up to clear enemies and keep the payload fed.",
          steps:[
            "Defeat the large enemies that drop a collectible buff along the route.",
            "Pick up the buff and deposit it at the payload to push it forward.",
            "Stay near the payload periodically to clear a stacking darkness debuff that builds up as you travel.",
            "Keep clearing enemies and feeding the payload until it reaches the end of the path."
          ],
          wipe:"The darkness debuff kills you outright if it maxes out, so don't wander too far from the payload for too long." },
        { name:"Acquisition",
          objective:"Identify a hidden three-symbol code for each of three obelisks by clearing rooms and reading callouts, then shoot the right symbols before the room's own meter forces a wipe.",
          roles:"Split into pairs, one pair per obelisk, working together to solve their obelisk's code.",
          steps:[
            "Shoot the central crystal to start the encounter and get the doors moving.",
            "Watch a reference pillar near your obelisk: it lights up to tell you which side of the room to check, and defeating the enemy there reveals which room to enter.",
            "Clear the enemies inside that room, which reveals a matching pair of symbols; a callout on the pillar tells you which of the two to remember.",
            "Repeat this two more times until you've collected three symbols total.",
            "Find all three symbols on your obelisk and shoot them in quick succession.",
            "Repeat the entire process two more times, once for each obelisk."
          ],
          wipe:"The obelisk fills a hidden meter as the fight goes on, faster if you shoot wrong symbols or let enemies attack it. If it fills completely, the team wipes, so speed and accuracy both matter." },
        { name:"The Caretaker",
          objective:"Stun a boss to keep him from reaching a central obelisk, collect symbols from a dark side room to unlock a damage phase, then repeat across three floors.",
          roles:"Two players keep the boss's attention and stun him, two clear enemies and support, two rotate through a dark room collecting symbols.",
          steps:[
            "Have two players bait the boss and take turns shooting him in the face to stun him, then his back to stop him from summoning obstacles.",
            "Send the other two players in and out of a dark room one at a time, each grabbing three symbols before shooting them onto the central obelisk.",
            "Watch a stacking darkness debuff while inside the dark room. It clears once you're back outside.",
            "Once all nine symbols are collected and delivered, a damage phase begins on three rotating floor plates.",
            "Stand on each plate as it activates, damage the boss, and rotate to the next plate when it deactivates.",
            "Repeat this whole loop on each of the raid's three floors, then finish with a final stand in a hallway with its own set of plates."
          ],
          wipe:"Letting the boss reach the obelisk while unstunned wipes the team, and running out of plates during the final stand without finishing him off does the same. This fight is a straight damage race as much as a mechanics one." },
        { name:"The Upended",
          objective:"Carry one or more artifacts through several rooms, find matching symbols in each, and deposit the artifacts before a shared timer runs out.",
          roles:"Split into two groups of three to clear each room; different artifacts unlock different actions, so track who's holding what.",
          steps:[
            "Clear each room's enemies, noting the symbols that appear. Some symbols are only visible while holding an artifact.",
            "Work out which symbols match and shoot them on the door at the room's exit to unlock the next area.",
            "Carry the artifact(s) with you as you go, since depositing one at the end of a room adds time to the shared clock.",
            "Defeat the enemy that spawns partway through each room for another chunk of extra time.",
            "Continue through each room, passing artifacts to new carriers as needed, until you reach the end."
          ],
          wipe:"The shared timer wipes the whole team if it hits zero. Killing the time-adding enemy and depositing artifacts promptly are the only ways to keep pace with it." },
        { name:"Rhulk, Disciple of the Witness",
          objective:"Cycle a shared buff between players to build a matching debuff, deposit it at the correct location based on symbol callouts, then damage the boss across several rounds before his final stand.",
          roles:"Two players juggle the base buff back and forth; two more turn it into the deliverable version and carry it to a called-out location.",
          steps:[
            "Shoot the central crystal or the boss's weapon to gain the base buff, then pass it to teammates by shooting nearby crystals so multiple people can cycle it.",
            "Have two players stand in one of the boss's darkness blasts while holding the buff to convert it into the deliverable version.",
            "Watch for symbols that appear as enemies are cleared, call out which one matches, then figure out which location it corresponds to.",
            "Deposit the converted buff at the correct location, then repeat until enough have been delivered.",
            "Once the boss is exposed, group up and deal damage until he resets, then repeat the whole cycle.",
            "Save your strongest abilities for his final stand, where he moves constantly and a darkness debuff starts stacking on the whole team."
          ],
          wipe:"Letting the darkness debuff max out during the final stand wipes the team, and losing track of the buff entirely (no one holding it) forces you to restart that portion of the cycle. Clear, fast callouts are what keep this fight moving." }
      ] },
    { name:"King's Fall", slug:"kings-fall", armorSlugs:["oryxs-memory"],
      summary:"King's Fall reintroduces a lot of ideas from Destiny's original raids: statues, totems, and boss fights that hinge on trading a single buff back and forth between a handful of players. Nothing here is subtle: if a role isn't being covered, you'll know almost immediately.",
      encounters:[
        { name:"Relics & Opening the Gate",
          objective:"Carry glowing orbs from two side rooms back to a central set of statues to unlock the path forward.",
          roles:"Split into two groups of three, one per side, each with a dedicated orb carrier.",
          steps:[
            "Send one group left and one right, with one player per group responsible for grabbing the orb.",
            "Have the other two players in each group clear enemies and destroy barriers blocking the return path.",
            "Carry the orb back to the central statues and deposit it there.",
            "Repeat, since orbs spawn slightly farther away each time and expire if held too long.",
            "Once all orbs are deposited, clear the remaining enemies near the portal to open it."
          ],
          wipe:"Orbs expire if carried too long without being deposited. If a carrier goes down or gets cut off, grab it quickly or the timer will force a restart on that run." },
        { name:"Annihilator Totems",
          objective:"Keep a totem in each of two side rooms defended at all times while cycling a buff between teammates to charge a central plate.",
          roles:"Two teams of three, one per side room, constantly passing a buff and defending their totem.",
          steps:[
            "Send half the team to each side room.",
            "Have one player grab the buff and stand near their totem getting kills to build charge.",
            "Send another player to defeat a specific enemy elsewhere in the room, which drops an item that lets them steal the buff from the current holder.",
            "Once someone has built up charge, send them to the center room to drain it at the plate.",
            "Cycle the buff continuously between your three players so someone is always defending the totem.",
            "Repeat this loop until the encounter ends. There's no boss here, just constant buff management."
          ],
          wipe:"Leaving a totem completely undefended wipes the team after a few seconds, so even mid-rotation, always make sure someone's covering it." },
        { name:"The Warpriest",
          objective:"Read a hidden sequence of glowing plates to earn a damage buff, then burn the boss down while managing who's exposed to a room-clearing blast.",
          roles:"Split into three pairs across the room; whoever ends up on the final plate gets the damage buff and needs it passed along by teammates.",
          steps:[
            "Clear enemies until a specific enemy type spawns and dies, which starts a sequence.",
            "Stand on the center plate to see which side plate lights up first, then move to that plate.",
            "From there, call out which plate lights up next, and repeat until three plates have been used in sequence.",
            "Whoever stood on the final plate gets a damage buff, so group up and burn the boss while it's active.",
            "When the buff's timer runs low, have someone grab an item from a specific enemy to pass the buff to a new player, keeping the damage phase going.",
            "When the boss unleashes his room-clearing attack, take cover behind one of the pillars to avoid it, then repeat the whole sequence."
          ],
          wipe:"Letting the damage buff's timer expire with nobody ready to take it over stalls the whole encounter, and getting caught without cover during the boss's blast can wipe the team outright." },
        { name:"Golgoroth",
          objective:"Juggle a boss's attention between two players while the rest of the team shoots down orbs and deals damage from special pools on the ground.",
          roles:"Two players trade the boss's aggro back and forth; everyone else destroys orbs, stands in the resulting pools, and deals damage.",
          steps:[
            "Have one player shoot the boss's back to draw his attention, giving the team a safe window.",
            "While that's active, other players destroy an overhead orb, which creates a damage pool on the ground.",
            "Stand in the pool to damage the boss's exposed weak point.",
            "Just before the aggro timer runs out, the second player takes over the boss's attention so the first can rotate to safety.",
            "Repeat with a new orb and pool each time the aggro swaps, watching for a debuff that will explode on whoever's affected, so move away from allies if you get marked.",
            "Continue until either all the available orbs are used or the boss is defeated."
          ],
          wipe:"Failing to pass the boss's attention in time gets whoever's exposed killed, and letting too many orbs go unused across the fight eventually wipes the whole team. Both are about timing, not damage." },
        { name:"Daughters of Oryx",
          objective:"Repeatedly build a path across the arena to collect pieces of a buff, then use it to steal an aura from one of two bosses and burn her down before a timer expires.",
          roles:"One player gets randomly selected each round to cross the path and collect the buff piece; everyone else manages the plates and clears adds.",
          steps:[
            "Stand on the glowing plate to reveal which second plate needs to be activated, forming a path across the room.",
            "The randomly chosen player crosses that path to collect a piece of a shared buff.",
            "Repeat this three times to gather all the pieces needed.",
            "On the third piece, the same player uses it to steal the boss's protective aura while she's using her wipe attack.",
            "With the aura stolen, the whole team groups up inside it and burns the boss down.",
            "Repeat the entire process for the second boss."
          ],
          wipe:"The boss's song wipes the team automatically if nobody steals her aura in time. The whole encounter is a race to build the path and grab the buff pieces fast enough to make that deadline every round." },
        { name:"Oryx, The Taken King",
          objective:"Repeat a path-and-buff cycle similar to the Daughters fight to steal an aura, use it to safely detonate bombs that stun Oryx, then damage his exposed chest, across several long rounds.",
          roles:"One player gets randomly selected each round to cross the path; a few players are responsible for triggering bombs during the stun window; everyone else clears enemies and supports.",
          steps:[
            "Build the path and send the selected player across to collect a piece of a shared buff, repeating this three times as in the earlier fight.",
            "Defeat the large enemies that drop stun bombs around the room, along with the smaller enemies that try to disarm them.",
            "On the third piece, use it to steal the protective aura from a specific target.",
            "When the boss begins his wipe attack, everyone must be standing near the bombs to trigger them at once, then retreat into the stolen aura for protection from the resulting blast.",
            "With Oryx stunned, unload damage on his exposed chest.",
            "After the damage window ends, either survive a wave of extra attacks or fight through a side challenge, depending on which one triggers, then repeat the whole cycle until his health is low enough for the final stand.",
            "In the final stand, repeat the bomb-and-damage cycle one last time to finish him off."
          ],
          wipe:"Missing the bomb detonation window during his wipe attack, or failing to reach the protective aura in time, both end the run. This is one of the longest fights in the game, so pace your ammo and your patience accordingly." }
      ] },
    { name:"Root of Nightmares", slug:"root-of-nightmares", armorSlugs:["nezarecs-nightmare"],
      puzzleHelper:{ slug:"nezarec-extra-chest", title:"Nezarec's Extra Chest", blurb:"Note the reference wall's Light/Dark pattern at the start, then work out which orbs to connect in each of the raid's three hidden rooms." },
      summary:"Root of Nightmares runs almost entirely on one shared idea: building a network of glowing nodes by carrying a short-lived buff from one to the next. Once you understand that loop, every encounter in this raid is a variation on the same theme, just with a different twist bolted on.",
      encounters:[
        { name:"Cataclysm",
          objective:"Build a network of nodes by carrying a buff between them while the rest of the team holds off waves of enemies.",
          roles:"Two players manage the node network; everyone else focuses on add-clear.",
          steps:[
            "Have two players grab a short-lived buff from the glowing node and use it to activate the next node in the sequence.",
            "Return to the aura to refresh the buff before moving to activate each subsequent node. Don't refresh early, or you can accidentally strip the buff from a teammate mid-route.",
            "Continue until the whole network for that section is connected.",
            "Meanwhile, everyone else defeats enemy pairs as they appear. Killing both spawns a tough enemy that, when defeated, buys the network builders extra time.",
            "Repeat across the arena until all sections are complete."
          ],
          wipe:"A shared timer wipes the team if it runs out. Finishing a network pauses it, so the faster your two builders work, the less pressure everyone else is under." },
        { name:"Scission",
          objective:"Build two zig-zagging node networks across a gap by jumping back and forth with a buff, while clearing enemies that can only be damaged by whoever's holding it.",
          roles:"One dedicated jumper per side who crosses the gap repeatedly; everyone else clears enemies and can relay-run nodes on their own side.",
          steps:[
            "Grab your side's buff and use a jump mechanism to cross to the other side.",
            "Activate the next node in the sequence on the far side, then return to refresh your buff before crossing again.",
            "Have a teammate on your home side pick up any newly-available near node while you're mid-crossing, to save time.",
            "Defeat the enemies that spawn, prioritizing the type that only takes damage from whoever's holding the buff.",
            "Once a full network on a level is done, a tougher version of that same enemy spawns, so defeat it to unlock the next level and repeat."
          ],
          wipe:"There's no instant wipe here, but stacking distractions slows your builders down against the encounter's shared timer, so keep the crossing player's job as simple as possible and handle everything else around them." },
        { name:"Zo'Aurc, Explicator of Planets",
          objective:"Swap mismatched planets to their correct sides using a special vision buff, then deliver the right combination to a set of central plates for a damage phase.",
          roles:"Two pairs handle planet-swapping on each side; the rest handle add-clear and later plate positioning.",
          steps:[
            "Defeat specific enemies to earn a buff that reveals a planet's true side.",
            "Find the planets that don't belong on their current side, carry them across, and swap them with a partner doing the same from the other direction.",
            "Once all mismatched planets are swapped, defeat more enemies to reveal the color pattern needed on three central plates.",
            "Carry matching planets from the sides to the correct central plate based on that pattern.",
            "Stand on whichever plate matches the boss's current shield type to deal bonus damage, and rotate to the next one as its shield changes.",
            "Repeat the whole cycle until the boss is defeated."
          ],
          wipe:"Nothing here directly wipes the team, but failing to deal enough damage during a plate rotation means you can't cycle through all of them. Slow, correct swaps beat fast, wrong ones." },
        { name:"Nezarec, Final God of Pain",
          objective:"Build two networks of nodes (one of each energy type) while periodically stunning the boss, then burn him down in short damage phases across multiple rounds.",
          roles:"Two players build the node networks; everyone else keeps Nezarec's weak points cracked to prevent his wipe attack.",
          steps:[
            "Assign two players to build a Light network and a Dark network simultaneously, same node logic as earlier encounters.",
            "While that's happening, shoot Nezarec's shoulders and chest as he roams to keep him stunned.",
            "If his wipe attack goes off before both networks are finished, take a differently-colored energy buff to an opposite-colored node to create a temporary safe zone, and stand in it to survive.",
            "Once both networks are complete, group up as he's exposed and unload as much damage as possible before he goes immune.",
            "Reset and repeat: each round gives you less time before his wipe attack triggers, so move faster each time.",
            "Continue until his final stand, where you'll need to finish him off before he wipes the team outright."
          ],
          wipe:"Getting caught outside a safe zone during his wipe attack kills everyone who isn't protected. The fastest way to avoid needing one at all is finishing both node networks before his patience runs out." }
      ] },
    { name:"Crota's End", slug:"crotas-end", armorSlugs:["crotas-memory"],
      summary:"Crota's End is built entirely around one shared item, the Chalice of Light. Whoever holds it slowly charges up, and handing it off gives the new holder a buff called Enlightened, which lets you do whatever the current encounter needs: light lanterns, pick up Hive swords, cross bridges, or damage the final boss. The whole raid is really just different ways of passing that buff around your team at the right moment.",
      encounters:[
        { name:"Descend into the Hellmouth",
          objective:"Get everyone through the short opening section by charging the Chalice of Light and using it to build a bridge forward.",
          roles:"No fixed roles yet, just pass the Chalice around so people take turns getting Enlightened.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2041874640882803054/E6954CEF5E31D87A1E20B0D93E63C421FD7BFB80/", credit:"Map by pryanie", creditUrl:"https://www.reddit.com/r/raidsecrets/comments/16ccxr0/destiny_2_crotas_end_raid_maps_guide_loot_table/" },
          steps:[
            "Pick up the Chalice of Light and hold it. It charges up the longer you hold it.",
            "Once it's charged, have another player take it from you, which gives them the Enlightened buff.",
            "Use Enlightened on the plate ahead to start building the bridge forward.",
            "Keep passing the Chalice and repeating until the bridge finishes and the path opens."
          ],
          wipe:"Holding the Chalice too long after it's fully charged kills you, so always have someone ready to take it before that happens." },
        { name:"Traverse the Abyss",
          objective:"Move through a dark tunnel, lighting lanterns along the way to survive, until you reach the far side and start building a bridge.",
          roles:"Move as a group; whoever's Enlightened lights the next lantern.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2093666667264642171/B42423D9F60C8F405413A3A428BC327D3B7773D4/", credit:"Map by pryanie", creditUrl:"https://www.reddit.com/r/raidsecrets/comments/16ccxr0/destiny_2_crotas_end_raid_maps_guide_loot_table/" },
          steps:[
            "Pass the Chalice of Light around as you move so someone stays Enlightened at all times.",
            "Use Enlightened to ignite each lantern you reach. This resets the Engulfed in Darkness timer for the whole team and starts clearing everyone's Weight of Darkness stacks.",
            "Watch for a preservation node next to certain lanterns. Depositing the Chalice there also resets Engulfed in Darkness and unlocks the next set of lanterns ahead, though it won't touch Weight of Darkness on its own.",
            "Stay together as a group, since lighting an actual lantern is the only thing that brings Weight of Darkness back down once it's built up.",
            "At the end of the path, use Enlightened on the plate to start building the bridge, then survive the enemies that rush in until it finishes."
          ],
          wipe:"Engulfed in Darkness is a visible 60-second timer on your screen that kills the whole team if it reaches zero. Lighting a lantern resets it, and so does depositing the Chalice at a preservation node. Separately, Weight of Darkness stacks up to 10 times the longer you go without lighting a lantern, slowing your movement. Preserving the Chalice resets the death timer but does nothing for this stack, only actually lighting a lantern clears it.",
          advancedTactics:[
            "You don't need to light every lantern along the path. Since depositing the Chalice at a preservation node resets Engulfed in Darkness on its own, a fast team can skip several lanterns in a row and just preserve often enough to stay ahead of the timer.",
            "The catch is Weight of Darkness: preserving doesn't clear it, so skipping too many lanterns in a row leaves the whole team slowed even though the death timer is fine. Budget in an actual lantern light every so often specifically to knock that stack back down, not just to reset the timer."
          ] },
        { name:"The Bridge",
          objective:"Build a bridge across a chasm, send players across using Hive swords, and clear the far side until the whole team has crossed.",
          roles:"Some players hold the Chalice and stand on the construction plate; some guard fixed positions under totems; others carry swords across to fight Gatekeepers.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2093666667264642468/C0FDEDD4103FF6D3717A880509A63F106C64FE05/", credit:"Map by pryanie", creditUrl:"https://www.reddit.com/r/raidsecrets/comments/16ccxr0/destiny_2_crotas_end_raid_maps_guide_loot_table/" },
          strategyImage:{ url:"raid-assets/bridge-flowchart.svg", label:"Our chalice rotation" },
          steps:[
            "Get Enlightened and use it on the bridge plate to start construction.",
            "Keep at least one player standing under each Annihilator Totem at all times while the plate is active.",
            "Kill the Swordbearer enemy that spawns. It drops a Hive sword that only an Enlightened player can pick up.",
            "Send the sword-carrier across the bridge to fight the Gatekeeper, since only a Hive sword can damage it.",
            "After the Gatekeeper dies, a new Swordbearer spawns, so repeat sending players across until three are on the far side.",
            "Once three players are across, the far side takes over plate and totem duty while the rest finish crossing.",
            "With everyone across, defeat a final wave of Gatekeepers using swords to close out the encounter."
          ],
          wipe:"Leaving an Annihilator Totem unguarded while the plate is active kills the whole team instantly. This matters more than anything else in the fight." },
        { name:"The Thrallway",
          objective:"Push through a short corridor of Thrall and Shriekers using the Enlightened buff to pass through barriers.",
          roles:"No fixed roles, just keep pushing forward as a group.",
          steps:[
            "Get Enlightened to pass through the glowing barriers blocking the path.",
            "Destroy the Shrieker behind each barrier to clear the way forward.",
            "Repeat up the corridor until you reach the top and deposit the Chalice to open the way to the next encounter."
          ],
          wipe:"There's no hard wipe mechanic here. The risk is just getting overwhelmed by Thrall if Shriekers aren't cleared quickly." },
        { name:"Ir Yut, the Deathsinger",
          objective:"Kill Hive Wizards hiding behind barriers to break Ir Yut's shield, then damage her enough before a countdown reaches zero.",
          roles:"Split into two teams of three to clear each side of the room; a caller tracks which rooms the Wizards are hiding in.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2041874640882815055/2BE115F81A5B9D98F9A1A08F9A5D919B1B8495E2/", credit:"Map by pryanie", creditUrl:"https://www.reddit.com/r/raidsecrets/comments/16ccxr0/destiny_2_crotas_end_raid_maps_guide_loot_table/" },
          steps:[
            "Split into two groups and clear enemies on each side to open access to the Wizard rooms.",
            "Get three players Enlightened, then send them to kill the Wizards. One is hiding in each of several candidate rooms.",
            "Try to kill all the Wizards at nearly the same time, since Ir Yut's shield drops the moment they're all dead.",
            "With her shield down, the whole team focuses damage, aiming to hit a specific notch in her health bar before time runs out.",
            "Each round adds one more Wizard to find and kill (three, then four, then five)."
          ],
          wipe:"A countdown called the Dark Liturgy starts automatically a few minutes in. If it hits zero before you've dealt enough damage, the team wipes." },
        { name:"Crota, Son of Oryx",
          objective:"Break Crota's shield with Hive swords, burn his health across several damage phases, and manage a recurring hazard called the Oversoul, until his final stand.",
          roles:"Some players clear adds in the two towers; one focuses on finishing the Swordbearer each round; several rotate through the Chalice to stay Enlightened for swords, damage, and Oversoul duty.",
          mapImage:{ url:"https://images.steamusercontent.com/ugc/2041874640882815568/256CF39CEE16D75F4738CB31718E681525F47BD5/", credit:"Map by pryanie", creditUrl:"https://www.reddit.com/r/raidsecrets/comments/16ccxr0/destiny_2_crotas_end_raid_maps_guide_loot_table/" },
          steps:[
            "Clear the Hive Knights in both towers to spawn a Swordbearer in the middle door.",
            "Get Enlightened and defeat the Swordbearer to claim a Hive sword. It takes two to three swords' worth of hits to break Crota's shield.",
            "Once the shield drops, the team piles on damage until Crota resets and the round ends.",
            "During each damage phase, Crota also summons an Oversoul that wipes the team if left alone too long. An Enlightened player has to destroy it, though doing so ends the damage phase early, so it's worth waiting as long as safely possible.",
            "Repeat the shield-break-and-damage cycle across several rounds until Crota reaches his final stand, a shorter and more dangerous last phase.",
            "After his final stand ends, back away from Crota immediately. He's briefly invulnerable and can still one-shot anyone standing too close."
          ],
          wipe:"Letting the Oversoul run out without destroying it wipes the whole team, so always keep at least one Enlightened player free to handle it instead of spending every buff on swords or damage." }
      ] },
    { name:"Salvation's Edge", slug:"salvations-edge", armorSlugs:["promised"],
      puzzleHelper:{ slug:"witness-extra-chest", title:"Witness's Extra Chest", blurb:"Note the reference column's shapes at the start, then check all 5 hidden rooms across the raid, and deposit the right shape at whichever 3 turn out active." },
      summary:"Salvation's Edge is the final raid of the original Light and Darkness saga, and it plays like it: five long, intricate encounters that layer symbol logic, split teams, and shared timers on top of each other. It's widely considered one of the most mechanically demanding raids ever made, so take each encounter slowly the first time through.",
      encounters:[
        { name:"Substratum",
          objective:"Split into two teams, fight through a ring of side rooms to unlock six generator nodes, then bounce a signal between plates to collect resources and lock each one.",
          roles:"Two teams of three, each clearing rooms in opposite directions around the center.",
          steps:[
            "Grab the starting resource and deposit it in the central box to begin, then split into two teams heading through opposite doors.",
            "Fight through a set of rooms, defeating a tough enemy near the end of each team's path. Clearing it unlocks a door for the other team's side.",
            "After a group of rooms is cleared, defeat the tougher enemy that spawns in the center to lock the area down again and unlock the next set of rooms.",
            "When you reach the room with an active plate, one player sends a signal to a matching plate elsewhere while another stands ready to send it back. Each round-trip creates a collectible resource.",
            "Collect three resources per player before using them to lock the local generator.",
            "Repeat this whole loop until all six generators around the map are locked and your collected resources are deposited at the end."
          ],
          wipe:"Ignoring a plate that's just received a signal spawns a tough enemy in that room instead of progressing, and letting the shared timer expire wipes the team, so always have someone ready to answer a signal." },
        { name:"Dissipation",
          objective:"Split into three zones to fight a boss, cycle a special buff to unlock exposed weak points, then use plates in each zone to lock generators while managing a boss timer.",
          roles:"Three pairs, one per zone; a rotating group earns the ability to damage the boss directly.",
          steps:[
            "Split into three pairs, one to the middle and one to each side of the arena, and start the fight by damaging a target in the center.",
            "Clear enemies in each zone until a tougher enemy appears. Defeating the first one summons three players to gain the ability to damage the boss's head.",
            "Those three players shoot the boss's head to expose smaller targets, destroy those, then damage the head again to earn a buff that reveals hidden information at the plates.",
            "With that buff, return to your zone and use it to see which shape is needed at your generator.",
            "Bounce a signal between plates in your zone to collect matching resources, then lock the generator once you have enough and the correct type.",
            "Once all three zone generators are locked, deposit your resources in the middle for a damage phase on the boss, then repeat the cycle until his final stand."
          ],
          wipe:"Failing to answer a plate that's received a signal spawns extra enemies, and letting the shared timer expire ends the attempt, so pace your rotations instead of chasing perfection in one zone." },
        { name:"Repository",
          objective:"Push through three rooms, each with three generators requiring a specific shape, using the same signal-and-lock system from earlier encounters.",
          roles:"Three pairs, one per lane, coordinating to figure out which generator needs which resource.",
          steps:[
            "Split into three pairs and take a lane each: left, middle, and right.",
            "Defeat the tough enemy in your lane to earn a buff that reveals which shape your lane's generator needs.",
            "Bounce the signal between your lane's plates to build up resources.",
            "Since a lane's plates don't always feed its own generator, be ready to carry resources to a different lane's generator if that's where they're needed.",
            "Lock all three generators, then clear the remaining enemies and defeat the miniboss to open the door forward.",
            "Repeat this whole process for the next two rooms. The layout changes each time, so stay alert for a different plate-to-generator setup."
          ],
          wipe:"Sending resources to the wrong generator wastes the trip but isn't fatal. The real risk is running out of time or letting rooms overrun with enemies while you're still solving the shape puzzle." },
        { name:"Verity",
          puzzleHelper:{ slug:"verity-solver", title:"Verity Tools", blurb:"Dissection Solver works out the minimum swap sequence for Outside; Fireteam Fashion shows everyone's gear for the Ghost phase." },
          objective:"Split into two teams with completely different jobs (three players go Outside dissecting statues, three get pulled Inside to solve their own shape puzzle) and work together to free the Inside players, three separate times, before the encounter ends.",
          roles:"Outside (Dissection team): stays together in the main room, listens to what each Inside player calls out, and rebuilds three statues into the matching 3D shapes by trading 2D shape pieces between them. Inside (Solo players): three players get teleported into fully separate, isolated rooms and can't see or help each other directly. Each works out their own shape puzzle and has to escape by building the right item to match what Outside builds for them.",
          steps:[
            "At the start, three players are pulled Inside into their own isolated rooms. Each Inside player checks which of Circle, Square, or Triangle their own statue is holding, then calls it out by position (Left, Middle, Right) to the Outside team. There are only three shapes and no repeats, so once two are known the third is a given.",
            "Outside immediately knows what to build: each statue's target is the 3D shape made from the two 2D shapes that Inside statue is NOT holding (Circle needs Prism, Square needs Cone, Triangle needs Cylinder). Outside statues start already holding some shape, so the job is trading individual 2D pieces between two statues at a time: kill a Knight to collect the piece you want off one statue, hand it to the other, then do the reverse for the piece it's missing. The Dissection Solver, part of our Verity Tools on the Puzzle Helper page, works out this exact swap sequence for you.",
            "Separately, Inside players are solving their own puzzle: each one looks at the wall behind their statue, which previews whatever their own two Knights currently hold. Killing a Knight drops that shape. If the wall already shows your own statue's shape doubled (Statue = Circle, Wall = Circle/Circle), skip straight to the final step below. Otherwise the wall shows two different shapes at first, and phase one is trading them away: kill a Knight, and whatever it drops, hand it to whichever of the other two Inside players' statues (visible in your own room) actually holds that shape. You're giving pieces away, not keeping them. The other two players are doing the same for you at the same time, so you end up receiving your own statue's shape twice in return. Once that's done, your wall flips to showing your own shape doubled.",
            "Phase two reverses the direction: now give away one of your doubled pair to each of the other two Inside players, one shape to each. They're doing the same back to you, so you receive one of each of the two shapes you don't hold. Your wall flips again, this time to the two shapes your statue ISN'T holding, the same pairing Outside is using to build your statue's 3D target. Kill your Knights one last time, collect both, and they combine into the item that matches what Outside is building for your lane.",
            "At some point during this shape-trading (usually a few rounds of Knight kills and hand-offs in), the Witness will \"kill\" all three Inside players at once. This is a scripted fake wipe, not a mistake. Their Ghosts appear to the Outside team, and each one needs to be carried to the correct statue among several possible pedestals to revive that player. The catch: the arrangement of which player is at which pedestal isn't fixed. \"Dead\" Inside players can see the location of one of the other dead players through the spectator camera, so they should call that out to help Outside sort out who goes where quickly.",
            "Once revived, Inside players finish combining their two collected shapes into the matching item, and Outside finishes building the corresponding statue. When an Inside player's held item matches what Outside has built for their lane, that player is freed and rejoins the group.",
            "With all three Inside players out, Outside finishes clearing remaining adds, including a pair of Unstoppable Ogres. Once that's done, the Witness triggers a second, separate fake-wipe: everyone except one player gets hit with a status that plays out like a death (Catatonic Decimation). The one player left standing has roughly a minute to find and deliver Ghosts to revive everyone (exactly the same statue-matching mechanic as the Inside revival, just now applied to the whole team) before the timer becomes a real wipe (Imminent End). If your team struggles to tell each other apart in the panic of this moment, Fireteam Fashion (the other half of our Verity Tools on the Puzzle Helper page) shows everyone's currently equipped gear side by side ahead of time, so the one survivor already knows who's who.",
            "Repeat this entire loop (new players get pulled Inside, shapes get traded, both fake-wipes happen again) a total of three times before the encounter ends and the path forward opens."
          ],
          wipe:"Reviving a downed player at the wrong statue kills them again instead of helping, so don't guess: confirm the pedestal before committing. The two fake-wipes are not real wipes by themselves, but running out the ~1-minute timer on the final all-but-one revival (once Catatonic Decimation flips into Imminent End) is a genuine wipe. This encounter punishes under-communication more than almost anything else in the raid, so over-explain what you're holding and what you're missing rather than assume it's obvious." },
        { name:"Zenith",
          objective:"Earn the ability to break the Witness's glyphs by standing in specific attacks to collect matching energy, use it to crack a glyph, and repeat until all six are gone, then survive a long, mobile damage phase.",
          roles:"Multiple players cycle through collecting energy and cracking glyphs; everyone needs to react fast to the boss's periodic pattern challenge.",
          steps:[
            "Stand in one of the boss's telegraphed arm attacks to reveal which type of energy you need to go collect from a different attack.",
            "Get that energy by briefly standing in the correct attack zone without staying so long that you actually get hit by it.",
            "Return to the first attack and stand in it again to crack that glyph, which grants the ability to destroy it.",
            "Try to have a few players ready to destroy glyphs around the same time, since doing so limits how many extra enemies spawn.",
            "When the boss periodically tests the team with a field of nodes, shoot down the extras so the remaining ones form the shape matching whichever attack was most recently used. Get this wrong and it wipes the team.",
            "Once all six glyphs are destroyed, a damage phase begins where the boss attacks large sections of the arena in alternating patterns. Stay mobile, and jump clear before his finishing slam."
          ],
          wipe:"Building the wrong shape during the boss's pattern test wipes the whole team instantly. This one has zero room for guessing, so make sure whoever's calling out the shape is confident before anyone shoots." }
      ] },
    { name:"The Desert Perpetual", slug:"the-desert-perpetual", armorSlugs:["collective-psyche","wayward-psyche-set"],
      summary:"The Desert Perpetual is built around a hub-and-spoke structure: you clear three boss encounters in whatever order you like before the final fight. Nearly everything in this raid runs on the same core loop: collect a resource called Chronons, bank them to buy time, and use buffs to reveal information only certain players can see.",
      encounters:[
        { name:"Predestination",
          objective:"Reach a central hub platform and pick which of the raid's three optional boss encounters to tackle first.",
          roles:"No fixed roles, this is a traversal section.",
          steps:[
            "Push through the opening area to reach a platform in the center with three interactive spheres.",
            "Interact with whichever sphere corresponds to the boss you want to fight first. Each lights a path toward a different door.",
            "Follow that path to reach the chosen encounter.",
            "After finishing a boss encounter, you'll return to this hub to pick the next one."
          ],
          wipe:"There's no wipe risk here. It's purely about choosing an order and getting your team there." },
        { name:"Epoptes, Lord of Quanta",
          objective:"Split into three groups to solve callouts across two side rooms and the main arena, unlocking the boss's shield before a rotating damage phase.",
          roles:"Two pairs head into side rooms carrying a buff; two players hold the middle, clear enemies, and relay callouts.",
          steps:[
            "Defeat the tough enemies that spawn to reveal two buff plates, and send a pair to each side room.",
            "Inside each side room, watch for a lit symbol overhead and call it out to the other room, then shoot the enemy shield-eye that your counterpart calls back to you.",
            "Meanwhile, the two players in the middle read a set of markers near the central pillar and call out which one is unlit.",
            "Side room players shoot the correct orb based on that callout.",
            "Everyone regroups in the middle to clear enemies again, finish off any remaining shield-eyes, then destroy the central glowing eye.",
            "Return to the middle to trigger a damage phase, extending it by handling additional eye call-outs as they appear."
          ],
          wipe:"Shield-eyes that aren't shot at nearly the same moment will seal back up, usually forcing a restart on that step. The whole encounter lives and dies on tight, simultaneous callouts between rooms." },
        { name:"Iatros, Inward-Tuned",
          objective:"Defeat waves of enemies to bank a resource, use it to briefly empower a set of shooters, and reach a climbing plate for a damage phase, all before a shared timer runs out.",
          roles:"A couple of players run add-clear and bank resources; a small team shoots targets together on cue; one player handles a platforming section.",
          steps:[
            "Clear the first wave of enemies and collect the resource they drop, then deposit it through a glowing ring to start the clock.",
            "Assign runners to keep killing enemies and banking their drops throughout the fight to extend your time.",
            "Send a player up a set of platforms while a couple of teammates wait at a nearby group of targets.",
            "When the platforming player calls for it, the target-shooters fire at the same moment while empowered. Timing matters more than aim here.",
            "Repeat this across each set of platforms until all are complete, then regroup on the platforming player's position to deal damage.",
            "Keep runners banking resources throughout the damage phase to avoid running out of time."
          ],
          wipe:"Letting the shared resource clock hit zero wipes the team. This fight is a speed test as much as anything, so don't let add-clear slip while people are focused on the shooting sequence." },
        { name:"Agraios, Inherent",
          objective:"Activate a set of portals using a collected resource, use callouts to determine which portals need charging, then use a temporary ability to block the boss's attack and force a damage phase.",
          roles:"Three players hold different information-revealing buffs; the rest bank resources and charge portals based on callouts.",
          steps:[
            "Defeat the enemies that spawn to collect a resource, then walk it through the portals scattered around the arena to activate them.",
            "Have three players grab different buffs in the middle, then check which of several snipers on the upper platforms matches their buff's name.",
            "Whoever matches runs underneath that sniper's platform to lock in an alignment.",
            "The other two buffed players call out which portals are marked, and the rest of the team charges those specific portals by running resources through them.",
            "One unaligned player then runs through all the charged portals to gain a special ability that can block the boss's dangerous sniper shot.",
            "Use that ability at the right moment to force the boss down for a damage phase, repeating the block-and-damage cycle a few times before it resets."
          ],
          wipe:"Failing to block the boss's sniper attack in time can wipe exposed players. Missing the alignment or portal-charging steps just means restarting that phase, so don't rush past a callout you didn't fully catch." },
        { name:"Keregos, The Worldline",
          objective:"Manage buffs and callouts across a lower platform to bank a shared resource, then repeat a similar process on an upper platform to unlock and sustain a long damage phase.",
          roles:"Players split by buff type to read hidden information about mines and a central ring below; above, three buffed players activate crystal pillars while others manage adds and additional resources.",
          steps:[
            "On the lower platform, split into buff groups so different players can see the color of scattered mines, whether they're active, and the current color of a central ring.",
            "Stand together on a marked plate to briefly gain the ability to compare that information, then destroy any mine matching the ring's current color while it's active.",
            "Collect the resource it drops and repeat this multiple times to fill the shared meter, while a couple of players handle the boss's dangerous turrets in the background.",
            "Once the meter is full, move up to the boss's upper platform.",
            "Three differently-buffed players identify a shared marker between their pairs and interact with it, repeating this a few times to expose the boss's real weak points.",
            "With the boss vulnerable, the team unloads damage while one player keeps banking resources through a ring to extend the fight, avoiding hazards on the ground and from above."
          ],
          wipe:"Ignoring the boss's turrets or hazard zones during either phase gets people killed fast, and letting the shared resource run dry cuts your damage window short. This fight demands the most multitasking in the raid, so keep your assigned job simple and stick to it." }
      ] },
    { name:"Pantheon", slug:"pantheon", armorSlugs:["pantheos-resplendent"],
      summary:"Pantheon isn't a traditional raid — it's three ways to fight vaulted raid bosses without running the full raids. Calus Resplendent runs the three Leviathan-era bosses (Argos, Gahlran, Emperor Calus) close to their original encounters. Morgeth Surpassing takes three bosses from three different raids — Warpriest (King's Fall), Consecrated Mind (Garden of Salvation), and Morgeth (Last Wish) — and merges each one with the non-boss encounter that originally came right before it. The Gauntlet strings all six of those together and caps it off with a seventh boss, Insurrection Prime: not new, but the returning final boss of the vaulted Scourge of the Past raid. Since the roster can keep changing over time, treat this as a snapshot rather than a fixed lineup.",
      encounters:[
        { name:"Argos, Planetary Core (Calus Resplendent)",
          objective:"Charge three elemental resources to match the shield's current combination, detonate them together to open a damage window, then destroy several weak points before a follow-up timer runs out.",
          roles:"Three pairs, one per elemental station, each with a runner and a defender.",
          steps:[
            "Split into three pairs and take a station each: one per element.",
            "Watch the boss's shield for the combination of elements it's currently displaying.",
            "Charge your station's resource with the correct element and carry it to the matching orb on the shield.",
            "Once all three are in place, they detonate together to drop the shield and grant a team-wide damage buff.",
            "During the damage window, spread out to avoid a tether attack that can chain between clustered players, and focus the glowing weak points. They're the only points that take real damage.",
            "After the damage phase, destroy the additional weak points that appear before the follow-up timer expires."
          ],
          wipe:"Bringing the wrong combination of charged elements wastes that attempt entirely, and you only get a handful of tries before the encounter fails outright, so confirm the shield's combination out loud before committing resources to it." },
        { name:"Gahlran, the Sorrow-Bearer (Calus Resplendent)",
          objective:"Manage a shared, timed buff across three sections of the arena to survive, damage shielded targets, and eventually expose the real boss among decoys.",
          roles:"Three pairs, one buffed and one unbuffed player each, managing their own section.",
          steps:[
            "Split into three pairs and take a section of the arena each.",
            "One player in each pair picks up a timed buff. Enemies in that section can only be damaged by whichever player has the matching buff state.",
            "Before the buff's timer runs out, both partners shoot the same target together to safely pass it between them.",
            "Clear the waves of enemies this way, then work together to lure a small target to your section's platform and stun it with a simultaneous melee.",
            "Shoot the hand and head of the boss copy in your section as it's revealed. Two of the three copies will turn out to be decoys.",
            "Once the real boss is identified, the whole team regroups on it, shooting its hands whenever it turns immune to keep damage going."
          ],
          wipe:"Letting the buff timer hit zero kills whoever's holding it, and ignoring the enemies that only the opposite buff state can damage lets a section get overrun. This fight punishes anyone who lets the buff-swap habit slip, even for a few seconds." },
        { name:"Emperor Calus (Calus Resplendent)",
          objective:"Split into a Throne Room team and a Shadow Realm team to solve symbol callouts and stack a damage buff, then reunite for rotating damage phases.",
          roles:"Three players hold the Throne Room and kill a called-out target; three players survive the Shadow Realm and farm the damage buff.",
          steps:[
            "Shoot the object out of Calus's hand to start the fight and clear the first wave of enemies.",
            "When Calus claps, the team splits: three players jump through orbs back to the Throne Room, three stay behind in the Shadow Realm.",
            "Each Shadow Realm player watches for a symbol appearing on Calus's forehead and calls it out.",
            "The Throne Room team finds the one symbol plate that wasn't called out and kills the enemy standing on it. This is what advances the fight.",
            "While that repeats, the Shadow Realm team defeats shielded enemies to stack a damage buff, aiming for a large number of stacks before coming back.",
            "Once the buff is high enough, the Throne Room team breaks Calus's shield to recall the Shadow Realm team, and everyone rotates through marked platforms to deal damage."
          ],
          wipe:"Killing the wrong enemy in the Throne Room during a symbol round wipes the team, so always double check which plate wasn't called before committing to a kill." },
        { name:"Warpriest (Morgeth Surpassing)",
          objective:"Run the totem puzzle that used to be its own encounter directly into the Warpriest fight: build a resource under your totem, steal the buff that lets you deposit it, then bank enough on the arena's plates to force a damage phase.",
          roles:"Two teams of three, one per totem room, splitting buff-holder, buff-stealer, and plate-guard duty.",
          steps:[
            "Split into two groups of three and head to a totem room on each side.",
            "One player grabs the totem's buff, stands under it, and kills enemies there to build up a stacking resource.",
            "To free that player up, a teammate kills the room's marked enemy for a claim item, then uses it to steal the buff off them so the first player can go deposit.",
            "Carry the banked resource to the Warpriest room and deposit it on one of the three plates, keeping a clear path for whoever's running stacks in.",
            "Once enough has been deposited, Warpriest is drawn in for a damage phase — stay on him until he grows tired, then take cover behind a solid pillar to avoid the wipe attack.",
            "Repeat the whole totem-to-plate cycle until he's dead."
          ],
          wipe:"Letting the totem resource pile up with nobody free to carry it stalls the room badly, and staying exposed during Warpriest's tired-out attack wipes the team, so always know who's stealing the buff next before you commit to add-clear elsewhere." },
        { name:"Consecrated Mind, Sol Inherent (Morgeth Surpassing)",
          objective:"Defend five relay points while a dedicated runner banks a resource from marked enemies into the center, then shoot the boss's hidden weak points — visible only to whoever's holding its roaming debuff — to force it into a real damage phase.",
          roles:"Five players hold a relay each; a sixth runs the arena clearing the marked enemy in each area and feeding the center relay.",
          steps:[
            "Clear the enemy guarding the starting relay and tether it to activate the area.",
            "Assign one player as the dedicated runner, clearing the marked enemy in each outer area for its resource drop and carrying it to the center relay.",
            "Have players stationed at each relay refresh their own defensive buff regularly so their position doesn't fall.",
            "When the boss spits a puddle near a relay, have one player step into it — they're the only one who can see its hidden weak points for the next couple of minutes.",
            "Once the center relay is overloaded, the boss is drawn to it. Group up and have the debuffed player call out and shoot its exposed weak points to cleanse it.",
            "With it cleansed, the boss backs off from the center for the real damage window — chase it to wherever it moves next and repeat the whole process until it's dead."
          ],
          wipe:"Letting a relay go undefended for too long lets enemies overrun it, which slows the whole run down badly even if it isn't an instant wipe. Without someone holding the roaming debuff, nobody can see the weak points to cleanse the boss, so don't skip picking it up." },
        { name:"Morgeth, the Spirekeeper (Morgeth Surpassing)",
          objective:"Collect a stacking resource without overloading, free trapped teammates so they can push into a side realm guided by callouts from the team outside, then survive a jumping-puzzle gauntlet before the final damage phase.",
          roles:"Pairs split collection duty; whoever frees a trapped teammate goes with them into the side realm, while everyone left outside calls out symbols to avoid.",
          steps:[
            "Collect the floating resource around the arena in pairs. Each player can safely hold two stacks, and a third stack kills you instantly.",
            "When a player holding two stacks gets trapped by the boss, a teammate frees them — this pulls both of you into a side realm cut off from the rest of the team.",
            "Inside, fight through adds and keep collecting the resource while the team still outside watches the wall behind the boss for the symbols that appear and calls them out so you know which ones to avoid.",
            "Repeat resource collection and trapped-player rescues until enough has been banked to start the boss's damage phase.",
            "When his health drops low enough, the floor opens into a short jumping-puzzle gauntlet — survive it to reach the final arena.",
            "In the final arena, collect every stack of the resource scattered around him before he's vulnerable, then finish him off before the enrage timer runs out."
          ],
          wipe:"Picking up a third stack of the resource kills you outright, missing an avoid-callout can wipe whoever's inside the side realm, and running out of time during the final stand wipes the whole team, so pace your resource collection instead of grabbing everything you see." },
        { name:"Insurrection Prime (The Gauntlet only)",
          objective:"Split into scouting, sniping, and resource-running roles to power the arena, shoot out the boss's shield panels and stun it with a captured vehicle, then arrange a set of matching buffs into the correct formation to sustain damage.",
          roles:"One player reads a map to direct the team; two hold sniping positions and clear threats; three run the arena collecting resources and depositing them at generators.",
          steps:[
            "Send battery runners to hunt down the mini-bosses that carry resources, then deposit them at the generators around the map.",
            "Have snipers clear persistent enemies from rooftops and shoot out the boss's shield panels as they're exposed.",
            "Once all the shield panels are down, use a captured vehicle to stun the boss and open a setup window.",
            "During the setup window, gather a set of three different buffs from an underground area.",
            "Arrange yourselves so that only players sharing the same buff stand near each other. Touching a teammate with a different buff kills you both.",
            "With the buff formation set, focus fire on the boss's exposed core.",
            "Watch for the boss shifting position or triggering a pulse that rearranges everyone's assigned spot. Relocate immediately if your assignment changes."
          ],
          wipe:"Standing next to a teammate with a mismatched buff kills you both instantly, and this fight has no checkpoint between the setup and the boss itself. Treat the whole thing as one long attempt and stay alert for reassignments throughout." }
      ] }
  
  ];

  return { RAIDS };
})();