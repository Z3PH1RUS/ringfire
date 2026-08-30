# RINGFIRE
**A game by Caine**

Two modes, one dart.

- **SOL** — one player vs Mandate AI in a compact solar system. Open `index.html` (no server).
- **GALAXY** — internet team war. 25 planets, four races, host-authoritative rooms. Play at https://z3ph1rus.github.io/ringfire/

Inspired by 1973 PLATO Empire (John Daleske et al.) and 1983 Apple II solar-system war games. Original names, art, and code — not a clone of any commercial title, disk, or asset.

Silas Warner (later of Muse Software) helped with disk space on Empire I. Mentioned here only; nothing from Muse, Empire, Titan Empire, or Star Trek was copied.

## Run SOL
Open `index.html` in a browser, or the live page. No server, no install, no network. Hall of fame stays local (`localStorage`).

Live: **https://z3ph1rus.github.io/ringfire/**

## Run GALAXY (internet rooms)
Open **https://z3ph1rus.github.io/ringfire/** (or this same `index.html` from GitHub Pages / any static HTTP host).

1. Title → **GALAXY — INTERNET ROOM**.
2. One player **CREATE ROOM**. A 4-character code is shown large, plus the Pages URL. That tab is the host — it runs the simulation.
3. Everyone else **JOIN ROOM** and types the code.
4. Pick a race (required). Same race = teammates. **READY**. Host **START MATCH**. Optional **FILL EMPTY RACES WITH AI**. Cap 12.

**Two-tab test on the live URL:** open https://z3ph1rus.github.io/ringfire/ twice. Tab A: CREATE ROOM, copy the code, pick Helios, Ready. Tab B: JOIN ROOM, type the code, pick Spark, Ready. Tab A starts. Fly toward each other (~20–40s at cruise from a home cluster to a neighbor). Capture a neutral on the edge: bomb, detonate (`X`), beam down (`B`).

Rooms use the public PeerJS broker (`0.peerjs.com`) and WebRTC data channels. No API keys, no python, no LAN IP, no port 7474. Closing the host tab ends the match.

If the lobby says **could not reach matchmaking — retry**, the broker or CDN was blocked — try again, or another network.

Symmetric NATs / some campus firewalls need a TURN server we do not run; those peers may fail to connect even when the room code is correct.

## Optional: GALAXY on a LAN (python fallback)
Only if you want same-Wi-Fi play without the public broker:

```
cd ringfire
python3 server.py
```

Python 3 standard library only (no pip, no npm). The server binds `0.0.0.0:7474` (or the next free port) and prints a Wi-Fi URL. Everyone on that network opens it; race select is the first GALAXY screen (no room code). Internet rooms stay the default on GitHub Pages and any origin that is not this python server.

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
2. Warp (`1`–`9`). In SOL, keys also jump you toward numbered system bodies from habit; in GALAXY they only set warp.
3. **Phasers** (`F` / `C` / right-click) for a cone in front. **Photons** (`SPACE`) travel and can be dodged (max 6 in flight). **Detonate** your own photons (`X` or `G`) for area damage.
4. **Hop** (`H`) — short burst along your nose, high fuel, brief invulnerability. Lead it or detonate into the landing.
5. Bombard a hostile disc until guns die, then `B`eam armies down. Ground war resolves over a few seconds.
6. Refuel is **automatic** in safe friendly orbit (Class-M in GALAXY is much faster). `U` extra dump. `R` repair.

SOL: the Mandate also invades. You lose when no friendly planets remain. Win: all nine planets friendly. Fastest time → hall of fame.

GALAXY is keyboard-first (touch bar is for SOL). `Enter` types a short room chat.

## Controls
| Key | Action |
| --- | --- |
| `←` `→` or `A` `D` | Rotate |
| `1`–`9` | Set warp |
| `+` `-` | Warp up / down |
| `SPACE` | Photon torpedo (hold to repeat). Hits ships, or bombards a hostile disc. Limited in flight. |
| `F` / `C` / right-click | Phasers (cone, instant, costs fuel) |
| `X` / `G` | Detonate your photons (AoE) |
| `H` | Hyperjump / hop |
| `T` | Tracking missile (**SOL only**) |
| `S` | Shields on/off (drains fuel) |
| `B` | Beam armies up (friendly orbit) or down (hostile/neutral). Hold to keep transferring. |
| `U` | Extra refuel in friendly orbit (auto-refuel already runs there) |
| `R` | Repair hull (friendly orbit, costs fuel) |
| `[` `]` or `,` `.` | Radar zoom |
| `M` | Strategic map (SOL: action slows; GALAXY: everyone keeps moving) |
| `Enter` | Room chat (GALAXY) |
| Click | Lock planetary info sheet |
| `L` | Clear target lock |
| `P` / `ESC` | Pause (**SOL**) |
| `N` | Mute |
| `K` | Toggle Bubble (optional ship-computer one-liners; never blocks play) |

On a phone, on-screen buttons cover rotate, fire, phaser, detonate, hop, missile, warp, beam, shields, and map (SOL).

## Ship
- Dart-class hull. In GALAXY the dart is recolored by race so teams read in a dogfight. IFF is color + letter (H/V/S/M). Teammates get a ring.
- Fuel 0 → impulse crawl until you dock a friendly world.
- Hull 0 → destroyed. Armies/personnel aboard are **lost forever**.
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
