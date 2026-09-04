# RINGFIRE
**A game by Caine**

Two modes, one dart.

- **SOL** — one player vs Mandate AI in a compact solar system. Open `index.html` (no server).
- **GALAXY** — internet team war on two computers. 25 planets, four races, host-authoritative MQTT rooms. Play at https://z3ph1rus.github.io/ringfire/

Inspired by 1973 PLATO Empire (John Daleske et al.) and 1983 Apple II solar-system war games. Original names, art, and code — not a clone of any commercial title, disk, or asset.

Silas Warner (later of Muse Software) helped with disk space on Empire I. Mentioned here only; nothing from Muse, Empire, Titan Empire, or Star Trek was copied.

## Run SOL
Open `index.html` in a browser, or the live page. No server, no install, no network. Hall of fame stays local (`localStorage`).

Live: **https://z3ph1rus.github.io/ringfire/**

## Run GALAXY (two computers)
Open **https://z3ph1rus.github.io/ringfire/** on **each computer** (same static page; GitHub Pages, no install).

1. Computer A: Title → **GALAXY — INTERNET ROOM** → **CREATE ROOM**. A 5-character code is shown large.
2. Computer B: same URL → **JOIN ROOM** and types that code.
3. Pick a race (required). Same race = teammates. **READY**. Host **START MATCH**. Optional **FILL EMPTY RACES WITH AI**. Cap 12.
4. The host tab/computer must stay open — it runs the simulation. Closing it ends the match.

Share text is: open https://z3ph1rus.github.io/ringfire/ on EACH COMPUTER, JOIN ROOM with this code. Host tab/computer must stay open.

**Two-tab test (same machine):** open the live URL twice. Tab A CREATE ROOM, tab B JOIN ROOM with the code. Two tabs still work, but the real path is two computers.

Both browsers make outbound WSS connections to a public MQTT broker (EMQX, HiveMQ fallback). That broker is only a matchmaking pipe — not our server. Do not put secrets in chat. No python, no same-Wi-Fi, no WebRTC, no port 7474.

If join says **no room with that code — is the host still on the page?**, the host left or the code is wrong. **could not reach matchmaking — retry** means the public broker or MQTT.js CDN was blocked.

## Optional: GALAXY on a LAN (python fallback)
Only if you want same-Wi-Fi play without the public broker:

```
cd ringfire
python3 server.py
```

Python 3 standard library only (no pip, no npm). The server binds `0.0.0.0:7474` (or the next free port) and prints a Wi-Fi URL. Everyone on that network opens it; race select is the first GALAXY screen (no room code). GitHub Pages always uses MQTT rooms.

## Races (GALAXY — pick one before spawn)
It is a **team**. Several humans may share a race.

| Race | Color | Ship |
| --- | --- | --- |
| **Helios** | gold / cream | Medium speed, medium weapons |
| **Veil** | green | Slowest, hardest-hitting phasers and photons |
| **Spark** | cyan | Fastest, weakest weapons |
| **Mandate** | amber / red | Medium speed, slightly heavier guns than Helios |

Cannot Ready or spawn without a race.

## GALAXY map
Five-spot die. Homes in the four corners (three adjacent planets each, **50 armies**, all Class-M). Two neutrals on each edge between neighboring homes. Five neutrals in the center. Neutrals start with **25 self-ruled armies** (hostile to everyone, no ships). 12 + 8 + 5 = 25.

Class-M (all homes + Axis): orbiting a friendly Class-M refuels much faster. Defenders can dump a photon blizzard; attackers hop in and detonate the pile.

**Win:** your race owns all 25. **Eliminated:** your race owns zero planets — no respawn. Armies aboard are lost on death. Respawn in a home system you still own, or a home system your team has conquered, or any owned world.

Owned planets slowly grow armies (neutrals barely).

## Pitch (SOL)
One ship, nine planets, moving moons, and a clock. The Mandate holds Titan. Retake every planet.

## How to play
1. Load armies from a friendly world (`B` in orbit — a garrison stays behind).
2. Warp (`1`–`9`). In SOL, keys also jump you toward numbered system bodies from habit; in GALAXY they only set warp. Near any planet you auto-enter orbit; break out with `A`/`D`, `H`, or any warp key (A/D is free — no fuel).
3. **Phasers** (`F` / `C` / right-click) for a cone in front. **Photons** (`SPACE`) travel and can be dodged (max 6 in flight). **Detonate** your own photons (`X` or `G`) for area damage.
4. **Hop** (`H`) — short burst along your nose, high fuel, brief invulnerability. Also **breaks auto-orbit**. Lead it or detonate into the landing.
5. Bombard a hostile disc until guns die, then `B`eam marines down. **20 marines** aboard at launch; **60 on the ground** captures the world.
6. Refuel is **automatic** in safe friendly orbit (Class-M in GALAXY is much faster). `U` extra dump. `R` repair.

SOL: the Mandate also invades. You lose when no friendly planets remain. Win: all nine planets friendly. Fastest time → hall of fame.

GALAXY is keyboard-first (touch bar is for SOL). `Enter` types a short room chat.

## Combat feel
Explosions use multi-layer particles, shock rings, debris, and glow (cinematic, performant). Near a planet the client camera zooms in 50% with the ship centered, then eases out. Approach a planet and you auto-enter orbit until you break out with `A`/`D`, `H`, or warp. Twenty asteroids tumble at warp-6 speed; planet gravity pulls them; unshielded hits destroy your ship. Procedural Web Audio: cinematic ambient loop plus warp/hyper whoosh (SFX ~2× prior loudness; `N` mutes all). The whole fight runs about 40% slower than the prior release (on top of the earlier pace reduction).

## Score and bosses
HUD always shows **SCORE** (1 per enemy ship destroyed). Kill-score **no longer** raises max fuel or shields. A visibly larger **BOSS** (40% stronger) spawns at 50 kills, then every +50. SOL hall of fame records score with the time. GALAXY score is per player; the host spawns bosses.

## Controls
| Key | Action |
| --- | --- |
| `←` `→` or `A` `D` | Rotate; **also breaks auto-orbit** (no fuel) |
| `1`–`9` | Set warp |
| `+` `-` | Warp up / down |
| `SPACE` | Photon torpedo (hold to repeat). Hits ships, or bombards a hostile disc. Limited in flight. |
| `F` / `C` / right-click | Phasers (cone, instant, costs fuel) |
| `X` / `G` | Detonate your photons (AoE) |
| `H` | Hyperjump / hop (also breaks auto-orbit) |
| `N` | Mute SFX + ambient music |
| `T` | Tracking missile (**SOL only**) |
| `S` | Shields on/off (drains fuel) |
| `B` | Beam marines up (friendly orbit) or down (hostile/neutral). Hold to keep transferring. |
| `U` | Extra refuel in friendly orbit (auto-refuel already runs there) |
| `R` | Repair hull (friendly orbit, costs fuel) |
| `[` `]` or `,` `.` | Radar zoom |
| `M` | Strategic map (SOL: action slows; GALAXY: everyone keeps moving) |
| `Enter` | Room chat (GALAXY) |
| Click | Lock planetary info sheet |
| `L` | Clear target lock |
| `P` / `ESC` | Pause (**SOL**) |
| `K` | Toggle Bubble (optional ship-computer one-liners; never blocks play) |

On a phone, on-screen buttons cover rotate, fire, phaser, detonate, hop, missile, warp, beam, shields, and map (SOL).

## Ship
- Dart-class hull. In GALAXY the dart is recolored by race so teams read in a dogfight. IFF is color + letter (H/V/S/M). Teammates get a ring.
- **130 fuel** at launch (max baseline). Fuel 0 → **limp warp 2** (keys `1`–`2`, no burn) until you dock a friendly world.
- Hull 0 → destroyed. Marines aboard are **lost forever** on death (20 marines at first launch only).
- Photons and phasers cost fuel. Space regen is slow. Class-M orbit is the gas station.

## Default SOL political map
Friendly: Mercury, Venus, Earth, Luna, Mars, and a Jovian outpost on Europa.
Mandate: Jupiter, Io, Ganymede, Callisto, Saturn, **Titan (capital)**, Uranus, Neptune, Triton, Pluto.

## Credits
- Game by **Caine**
- Inspired by **1973 PLATO Empire** (John Daleske, later Empire IV by Chuck Miller, Gary Fritz, Jim Battin, and others)
- Inspired by 1983 Apple II solar-system war games
- Silas Warner (later Muse Software) helped Empire I with lesson space — credits only
- Planetary blurbs in SOL are real astronomy, shortened
- Bubble is fictional ship-computer flavor
- Original race names: Helios, Veil, Spark, Mandate (the 1973 authors themselves renamed a fourth side over copyright; we did not use those names)

No Muse Software, Empire, Titan Empire, or Star Trek assets, titles, graphics, music, or manual text were used.
