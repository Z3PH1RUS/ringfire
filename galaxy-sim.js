/* RINGFIRE GALAXY simulation — host-authoritative, runs in the HOST browser tab.
   Port of server.py Game. Snapshot/input JSON shapes match the LAN HTTP API. */
(function (root) {
  "use strict";

  var TAU = Math.PI * 2.0;
  var TICK_HZ = 20.0;
  var DT = 1.0 / TICK_HZ;
  var PLAY_RATE = 0.4; /* 50% slower fight vs prior pace: sim dt, speeds, weapon cadence */
  var MAX_PLAYERS = 12;
  var MAX_TORP_INFLIGHT = 6;
  var MAX_CHAT = 10;
  var STALE_SEC = 12.0;
  var HOST_STALE_SEC = 18.0;
  var BASE_FUEL = 140;
  var START_MARINES = 20;
  var CAPTURE_MARINES = 40;

  var CHAOS_RIFTS = [
    { id: "overdrive", name: "CRIMSON OVERDRIVE", phCd: 0.52, torpCd: 0.78 },
    { id: "phantom", name: "CYAN PHANTOM", hunt: 0.62, aim: 1.45 },
    { id: "siphon", name: "GOLD SIPHON", fuel: 8.0 }
  ];
  var CHAOS = {
    buffT: 9, riftMax: 2, riftRespawn: 22, riftPick: 28,
    streakWin: 6, streakBoostT: 2, streakSpeed: 1.22,
    podDrop: 0.45, podMax: 6, podLife: 20, podPick: 22, podMag: 34
  };

  var RACES = {
    helios: {
      name: "HELIOS", color: "#e8d48a",
      speed: 1.00, hull: 100, phaser: 1.00, torp: 1.00,
      fuel: BASE_FUEL, turn: 1.00, cx: 260, cy: 260
    },
    veil: {
      name: "VEIL", color: "#3dcc5c",
      speed: 0.80, hull: 122, phaser: 1.42, torp: 1.38,
      fuel: 157, turn: 0.86, cx: 260, cy: 1340
    },
    spark: {
      name: "SPARK", color: "#3ad4d4",
      speed: 1.34, hull: 78, phaser: 0.70, torp: 0.74,
      fuel: 123, turn: 1.22, cx: 1340, cy: 260
    },
    mandate: {
      name: "MANDATE", color: "#e07038",
      speed: 0.98, hull: 106, phaser: 1.14, torp: 1.16,
      fuel: 143, turn: 0.96, cx: 1340, cy: 1340
    }
  };
  var RACE_ORDER = ["helios", "veil", "spark", "mandate"];
  var N = "N";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function angNorm(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function warpSpeed(w, mul, fuel) {
    if (fuel == null) fuel = BASE_FUEL;
    if (w <= 0) return fuel <= 0 ? (7.0 * mul) : 0.0;
    return (12.0 + w * w * 1.05) * mul;
  }
  function turnRate(w, mul) { return (3.05 - w * 0.18) * mul; }
  function fuelBurn(w, shields) {
    var b = 0.28 * w;
    if (w >= 7) b += (w - 6) * 0.40;
    if (shields) b += 0.85;
    return b;
  }
  function r1(v) { return Math.round(Number(v) * 10) / 10; }
  function r2(v) { return Math.round(Number(v) * 100) / 100; }
  function nowSec() { return Date.now() / 1000; }
  function uid(n) {
    n = n || 10;
    var s = "", hex = "0123456789abcdef";
    for (var i = 0; i < n; i++) s += hex.charAt((Math.random() * 16) | 0);
    return s;
  }
  function vals(obj) {
    var out = [], k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(obj[k]);
    return out;
  }

  function homePts(cx, cy) {
    return [
      [cx - 50, cy - 34],
      [cx + 52, cy - 24],
      [cx + 2, cy + 54]
    ];
  }

  function buildPlanetDefs() {
    var homes = [
      ["helios", "Crown", "Aurel", "Solis"],
      ["veil", "Groves", "Thorn", "Moss"],
      ["spark", "Volt", "Gleam", "Ion"],
      ["mandate", "Ember", "Cinder", "Forge"]
    ];
    var out = [];
    var i, j, race, a, b, c, rc, pts, names, name;
    for (i = 0; i < homes.length; i++) {
      race = homes[i][0]; a = homes[i][1]; b = homes[i][2]; c = homes[i][3];
      rc = RACES[race];
      pts = homePts(rc.cx, rc.cy);
      names = [a, b, c];
      for (j = 0; j < 3; j++) {
        name = names[j];
        out.push({
          id: name.toLowerCase(), name: name.toUpperCase(),
          x: pts[j][0], y: pts[j][1],
          r: j === 0 ? 12 : 10,
          owner0: race, armies0: 50,
          def0: j === 0 ? 7 : 5,
          cap: 80, minG: 8, classM: true,
          seat: j === 0, home: race, color: rc.color
        });
      }
    }
    var neutrals = [
      ["drift", "DRIFT", 620, 330, false],
      ["halo", "HALO", 980, 330, false],
      ["ridge", "RIDGE", 1270, 620, false],
      ["spire", "SPIRE", 1270, 980, false],
      ["dusk", "DUSK", 620, 1270, false],
      ["vale", "VALE", 980, 1270, false],
      ["quarry", "QUARRY", 330, 620, false],
      ["fen", "FEN", 330, 980, false],
      ["axis", "AXIS", 800, 800, true],
      ["hub", "HUB", 800, 698, false],
      ["nexus", "NEXUS", 902, 800, false],
      ["well", "WELL", 698, 800, false],
      ["core", "CORE", 800, 902, false]
    ];
    var pid, x, y, cm;
    for (i = 0; i < neutrals.length; i++) {
      pid = neutrals[i][0]; name = neutrals[i][1]; x = neutrals[i][2]; y = neutrals[i][3]; cm = neutrals[i][4];
      out.push({
        id: pid, name: name, x: x, y: y,
        r: pid === "axis" ? 13 : 9,
        owner0: N, armies0: 25, def0: 4, cap: 40, minG: 4,
        classM: cm, seat: false, home: null,
        color: cm ? "#c8d4c0" : "#9aa8b0"
      });
    }
    if (out.length !== 25) throw new Error("planet count " + out.length);
    return out;
  }

  var PLANET_DEFS = buildPlanetDefs();

  function Game() {
    this.resetLobby(false);
  }

  Game.prototype.resetLobby = function (keepHumans) {
    var humans = [];
    var i, p;
    if (keepHumans && this.players) {
      humans = vals(this.players).filter(function (q) { return !q.ai; });
    }
    this.phase = "lobby";
    this.time = 0.0;
    this.winner = null;
    this.fillAI = false;
    var locked = !!this.hostLocked;
    var prevHost = this.hostId;
    this.hostId = null;
    this.hostLocked = locked;
    this.players = {};
    this.planets = [];
    this.torps = [];
    this.events = [];
    this.chat = [];
    this.seqEv = 0;
    this.torpSeq = 0;
    this.elim = {};
    this.overReason = "";
    this.tickN = 0;
    this.killCount = 0;
    this.bossSpawned = 0;
    this.rifts = [];
    this.pods = [];
    this.riftTimer = 6;
    if (humans.length) {
      for (i = 0; i < humans.length; i++) {
        p = humans[i];
        p.ready = false;
        p.alive = false;
        p.inp = {};
        p.seq = 0;
        this.players[p.id] = p;
      }
      if (locked && prevHost && this.players[prevHost]) this.hostId = prevHost;
      else this.hostId = humans[0].id;
      for (i = 0; i < humans.length; i++) humans[i].host = humans[i].id === this.hostId;
    }
  };

  Game.prototype.makePlanets = function () {
    var i, d;
    this.planets = [];
    for (i = 0; i < PLANET_DEFS.length; i++) {
      d = PLANET_DEFS[i];
      this.planets.push({
        id: d.id, name: d.name,
        x: d.x, y: d.y, r: d.r,
        owner: d.owner0, armies: d.armies0,
        def: d.def0, cap: d.cap, minG: d.minG,
        classM: d.classM, seat: d.seat, home: d.home,
        color: d.color,
        gunCd: 0.4 + Math.random() * 0.6,
        recruit: Math.random() * 6,
        battle: null
      });
    }
  };

  Game.prototype.planet = function (pid) {
    var i;
    for (i = 0; i < this.planets.length; i++) if (this.planets[i].id === pid) return this.planets[i];
    return null;
  };

  Game.prototype.racePlanets = function (race) {
    return this.planets.filter(function (p) { return p.owner === race; });
  };

  Game.prototype.counts = function () {
    var sc = { N: 0 }, i, p;
    for (i = 0; i < RACE_ORDER.length; i++) sc[RACE_ORDER[i]] = 0;
    for (i = 0; i < this.planets.length; i++) {
      p = this.planets[i];
      sc[p.owner] = (sc[p.owner] || 0) + 1;
    }
    return sc;
  };

  Game.prototype.emit = function (kind, extra) {
    this.seqEv += 1;
    var ev = { i: this.seqEv, k: kind, t: r1(this.time) };
    var k;
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
    this.events.push(ev);
    if (this.events.length > 24) this.events = this.events.slice(-24);
  };

  Game.prototype.addChat = function (name, race, text) {
    text = String(text || "").replace(/^\s+|\s+$/g, "").slice(0, 72);
    if (!text) return;
    this.chat.push({ t: r1(this.time), n: String(name).slice(0, 16), r: race, m: text });
    if (this.chat.length > MAX_CHAT) this.chat = this.chat.slice(-MAX_CHAT);
  };

  Game.prototype.humanList = function () {
    return vals(this.players).filter(function (p) { return !p.ai; });
  };

  Game.prototype.join = function (name, race, oldId, opts) {
    opts = opts || {};
    name = String(name || "ANON").replace(/^\s+|\s+$/g, "").toUpperCase().slice(0, 16);
    name = name.replace(/[^A-Z0-9 \-_]/g, "") || "ANON";
    if (!RACES[race]) return { err: "pick a race" };
    var p;
    if (this.phase !== "lobby") {
      if (oldId && this.players[oldId]) {
        p = this.players[oldId];
        p.last = nowSec();
        return { id: p.id, host: p.id === this.hostId, ok: 1 };
      }
      return { err: "match already running" };
    }
    var humans = this.humanList();
    if (oldId && this.players[oldId]) {
      p = this.players[oldId];
      p.name = name;
      p.race = race;
      p.last = nowSec();
      if (opts.host) this.hostId = p.id;
      p.host = p.id === this.hostId;
      return { id: p.id, host: p.host, ok: 1 };
    }
    if (humans.length >= MAX_PLAYERS) return { err: "server full (12)" };
    var pid = uid(10);
    var rec = {
      id: pid, name: name, race: race, ready: false,
      ai: false, host: false, alive: false,
      inp: {}, seq: 0, last: nowSec(),
      chatT: 0.0,
      didX: false, didH: false, didS: false, didM: false,
      score: 0, upgradeTier: 0, boss: 0, dmgMul: 1.0, lastHit: null,
      buff: null, buffT: 0, streak: 0, streakT: 0, streakBoostT: 0
    };
    if (opts.host) this.hostId = pid;
    else if (this.hostId == null && !this.hostLocked) this.hostId = pid;
    rec.host = pid === this.hostId;
    this.players[pid] = rec;
    return { id: pid, host: rec.host, ok: 1 };
  };

  Game.prototype.setReady = function (pid, ready) {
    var p = this.players[pid];
    if (!p || p.ai || this.phase !== "lobby") return { err: "no" };
    if (!p.race) return { err: "pick a race" };
    p.ready = !!ready;
    p.last = nowSec();
    return { ok: 1 };
  };

  Game.prototype.hostCmd = function (pid, op, fillAI) {
    var p = this.players[pid];
    if (!p || p.id !== this.hostId) return { err: "host only" };
    if (op === "fill") {
      this.fillAI = !!fillAI;
      return { ok: 1, fillAI: this.fillAI };
    }
    if (op === "start") {
      if (fillAI != null) this.fillAI = !!fillAI;
      return this.startMatch();
    }
    if (op === "reset") {
      this.resetLobby(true);
      return { ok: 1 };
    }
    if (op === "quit") {
      this.phase = "over";
      this.winner = null;
      this.overReason = "HOST QUIT";
      return { ok: 1 };
    }
    return { err: "unknown" };
  };

  Game.prototype.startMatch = function () {
    var humans = this.humanList();
    var ready = humans.filter(function (p) { return p.ready && RACES[p.race]; });
    if (!ready.length) ready = humans.filter(function (p) { return RACES[p.race]; });
    if (!ready.length) return { err: "need a race and a player" };
    var drop = [], id, i, p, present, r;
    for (id in this.players) {
      if (!Object.prototype.hasOwnProperty.call(this.players, id)) continue;
      p = this.players[id];
      if (!p.ai && !RACES[p.race]) drop.push(id);
    }
    for (i = 0; i < drop.length; i++) delete this.players[drop[i]];
    this.makePlanets();
    this.torps = [];
    this.events = [];
    this.elim = {};
    this.winner = null;
    this.overReason = "";
    this.time = 0.0;
    this.tickN = 0;
    this.killCount = 0;
    this.bossSpawned = 0;
    this.rifts = [];
    this.pods = [];
    this.riftTimer = 6;
    present = {};
    for (id in this.players) {
      p = this.players[id];
      if (RACES[p.race] && !p.ai) present[p.race] = 1;
    }
    if (this.fillAI) {
      for (i = 0; i < RACE_ORDER.length; i++) {
        r = RACE_ORDER[i];
        if (!present[r]) this.spawnAI(r);
      }
    }
    var list = vals(this.players);
    for (i = 0; i < list.length; i++) {
      list[i].score = 0;
      list[i].upgradeTier = 0;
      list[i].boss = 0;
      list[i].dmgMul = 1.0;
      list[i].lastHit = null;
      if (RACES[list[i].race]) this.spawnShip(list[i], true);
    }
    this.phase = "play";
    this.emit("start");
    this.addChat("RINGFIRE", "helios", "MATCH LIVE — TAKE ALL 25");
    return { ok: 1 };
  };

  Game.prototype.spawnAI = function (race) {
    var pid = "ai-" + race.slice(0, 3) + "-" + uid(4);
    var rec = {
      id: pid, name: RACES[race].name + "-AI", race: race,
      ready: true, ai: true, host: false, alive: false,
      inp: {}, seq: 0, last: nowSec(),
      state: "patrol", huntT: 0.0, tgt: null,
      didX: false, didH: false, didS: false,
      score: 0, upgradeTier: 0, boss: 0, dmgMul: 1.0, lastHit: null,
      buff: null, buffT: 0, streak: 0, streakT: 0, streakBoostT: 0
    };
    this.players[pid] = rec;
    return rec;
  };

  Game.prototype.spawnPoint = function (race) {
    var owned = this.racePlanets(race);
    if (!owned.length) return null;
    var homes = owned.filter(function (p) { return p.home === race; });
    if (homes.length) owned = homes;
    else {
      var conquered = owned.filter(function (p) { return p.home && p.home !== race; });
      if (conquered.length) owned = conquered;
    }
    var b = owned[(Math.random() * owned.length) | 0];
    var a = Math.random() * TAU;
    return { b: b, x: b.x + Math.cos(a) * (b.r + 28), y: b.y + Math.sin(a) * (b.r + 28), ang: a + Math.PI * 0.5 };
  };

  Game.prototype.hostile = function (a, b) {
    if (!a || !b || a === b) return false;
    if (a.boss || b.boss) return true;
    return a.race !== b.race;
  };

  Game.prototype.upgradeMul = function (p) {
    var tier = Math.min(5, Math.floor((p.score || 0) / 10));
    return 1.0 + tier * 0.1;
  };

  Game.prototype.applyUpgrade = function (p) {
    if (!p || !RACES[p.race] || p.boss) return;
    var rs = RACES[p.race];
    var tier = Math.min(5, Math.floor((p.score || 0) / 10));
    p.upgradeTier = tier;
    var mul = 1.0 + tier * 0.1;
    var nf = rs.fuel * mul;
    var ns = 70.0 * mul;
    var df = nf - (p.maxFuel || rs.fuel);
    var ds = ns - (p.maxShields || 70);
    p.maxFuel = nf;
    p.maxShields = ns;
    if (df > 0) p.fuel = Math.min(p.maxFuel, (p.fuel || 0) + df);
    if (ds > 0) p.shields = Math.min(p.maxShields, (p.shields || 0) + ds);
  };

  Game.prototype.chaosNearPlanet = function (x, y, pad) {
    pad = pad == null ? 110 : pad;
    var i, b;
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (dist(x, y, b.x, b.y) < b.r + pad) return true;
    }
    return false;
  };

  Game.prototype.chaosSpawnRift = function () {
    if (this.rifts.length >= CHAOS.riftMax) return;
    var x, y, t, tries = 0;
    while (tries++ < 24) {
      x = 180 + Math.random() * 1240;
      y = 180 + Math.random() * 1240;
      if (!this.chaosNearPlanet(x, y, 100)) break;
    }
    t = (Math.random() * CHAOS_RIFTS.length) | 0;
    this.rifts.push({ x: x, y: y, t: t, life: 14 + Math.random() * 6, pulse: Math.random() * TAU });
  };

  Game.prototype.chaosApplyBuff = function (p, tIdx) {
    if (!p || !p.alive) return;
    var def = CHAOS_RIFTS[tIdx];
    if (!def) return;
    p.buff = def.id;
    p.buffT = CHAOS.buffT;
    this.emit("rift", { sid: p.id, t: tIdx, n: def.name });
  };

  Game.prototype.chaosTryRift = function (p) {
    var i, r, d;
    for (i = this.rifts.length - 1; i >= 0; i--) {
      r = this.rifts[i];
      d = dist(p.x, p.y, r.x, r.y);
      if (d < CHAOS.riftPick) {
        this.chaosApplyBuff(p, r.t);
        this.rifts.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  Game.prototype.chaosSpawnPod = function (x, y) {
    if (this.pods.length >= CHAOS.podMax) return;
    this.pods.push({ x: x, y: y, life: CHAOS.podLife, wobble: Math.random() * TAU });
  };

  Game.prototype.chaosTryPod = function (p) {
    var i, pod, d, pull, reward, msg, n;
    for (i = this.pods.length - 1; i >= 0; i--) {
      pod = this.pods[i];
      d = dist(p.x, p.y, pod.x, pod.y);
      if (d < CHAOS.podMag && d > 4) {
        pull = (1 - d / CHAOS.podMag) * 48 * DT;
        pod.x += (p.x - pod.x) / d * pull;
        pod.y += (p.y - pod.y) / d * pull;
      }
      if (d < CHAOS.podPick) {
        reward = (Math.random() * 3) | 0;
        if (reward === 0) {
          p.fuel = Math.min(p.maxFuel, (p.fuel || 0) + 28);
          msg = "+FUEL";
        } else if (reward === 1) {
          n = Math.min(6, (p.maxArmies || 28) - (p.armies || 0));
          p.armies = (p.armies || 0) + n;
          msg = "+" + n + " MARINES";
        } else {
          p.shields = Math.min(p.maxShields, (p.shields || 0) + 22);
          msg = "SHIELDS TOP-UP";
        }
        this.emit("pod", { sid: p.id, m: msg });
        this.pods.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  Game.prototype.chaosOnKill = function (killer) {
    if (!killer) return;
    if ((killer.streakT || 0) > 0) killer.streak = (killer.streak || 0) + 1;
    else killer.streak = 1;
    killer.streakT = CHAOS.streakWin;
    if (killer.streak >= 3) {
      killer.streakBoostT = CHAOS.streakBoostT;
      var bonus = killer.streak >= 5 ? 2 : 1;
      killer.score = (killer.score || 0) + bonus;
      this.applyUpgrade(killer);
      this.emit("streak", { sid: killer.id, n: killer.streak });
    }
  };

  Game.prototype.chaosHasBuff = function (p, id) {
    return p && p.alive && p.buff === id && (p.buffT || 0) > 0;
  };

  Game.prototype.tickChaos = function (dt) {
    var list = vals(this.players), i, p;
    this.riftTimer = (this.riftTimer || 0) - dt;
    if (this.riftTimer <= 0) {
      this.chaosSpawnRift();
      if (this.rifts.length < CHAOS.riftMax && Math.random() < 0.45) this.chaosSpawnRift();
      this.riftTimer = CHAOS.riftRespawn;
    }
    for (i = this.rifts.length - 1; i >= 0; i--) {
      this.rifts[i].life -= dt;
      this.rifts[i].pulse += dt * 4;
      if (this.rifts[i].life <= 0) this.rifts.splice(i, 1);
    }
    for (i = this.pods.length - 1; i >= 0; i--) {
      this.pods[i].life -= dt;
      this.pods[i].wobble += dt * 5;
      if (this.pods[i].life <= 0) this.pods.splice(i, 1);
    }
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p.alive) continue;
      if ((p.buffT || 0) > 0) {
        p.buffT -= dt;
        if (p.buffT <= 0) { p.buff = null; p.buffT = 0; }
      }
      this.chaosTryRift(p);
      this.chaosTryPod(p);
      if ((p.streakT || 0) > 0) {
        p.streakT -= dt;
        if (p.streakT <= 0) { p.streak = 0; p.streakT = 0; }
      }
      if ((p.streakBoostT || 0) > 0) p.streakBoostT -= dt;
    }
  };

  Game.prototype.spawnShip = function (p, first) {
    var sp = this.spawnPoint(p.race);
    if (!sp) {
      p.alive = false;
      p.elim = true;
      return false;
    }
    var rs = RACES[p.race];
    var keepScore = p.score || 0;
    p.x = sp.x; p.y = sp.y; p.ang = sp.ang; p.warp = 0;
    p.hull = rs.hull; p.maxHull = rs.hull;
    p.fuel = rs.fuel; p.maxFuel = rs.fuel;
    p.armies = first ? START_MARINES : 0; p.maxArmies = 28;
    p.shieldsOn = false; p.shields = 70; p.maxShields = 70;
    p.alive = true; p.spawnT = 0.0; p.flash = 0.0;
    p.invuln = first ? 2.2 : 1.8;
    p.torpCd = 0.0; p.phaserCd = 0.0; p.beamCd = 0.0; p.hyperCd = 0.0;
    p.hyperI = 0.0; p.repairing = false; p.lostArmies = 0;
    p.score = keepScore;
    p.lastHit = null;
    p.dmgMul = 1.0;
    if (p.boss) {
      p.name = "BOSS";
      p.maxHull = Math.round(rs.hull * 1.4);
      p.hull = p.maxHull;
      p.maxFuel = rs.fuel * 1.4;
      p.fuel = p.maxFuel;
      p.maxShields = Math.round(70 * 1.4);
      p.shields = p.maxShields;
      p.dmgMul = 1.4;
      p.upgradeTier = 0;
    } else {
      this.applyUpgrade(p);
    }
    return true;
  };

  Game.prototype.inOrbit = function (x, y, b) {
    return dist(x, y, b.x, b.y) < b.r + 38;
  };

  Game.prototype.orbiting = function (ship) {
    var best = null, sc = 1e9, i, b, d;
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (!this.inOrbit(ship.x, ship.y, b)) continue;
      d = dist(ship.x, ship.y, b.x, b.y);
      if (d < sc) { sc = d; best = b; }
    }
    return best;
  };

  Game.prototype.countInflight = function (pid) {
    var n = 0, i;
    for (i = 0; i < this.torps.length; i++) if (this.torps[i].oid === pid) n++;
    return n;
  };

  Game.prototype.fireTorp = function (ship) {
    if (ship.torpCd > 0 || !ship.alive) return;
    if (ship.fuel < 2.5) return;
    if (this.countInflight(ship.id) >= MAX_TORP_INFLIGHT) return;
    var rs = RACES[ship.race];
    var ang = ship.ang;
    var spd = 390.0;
    this.torpSeq += 1;
    this.torps.push({
      id: this.torpSeq, oid: ship.id, race: ship.race,
      x: ship.x + Math.cos(ang) * 14,
      y: ship.y + Math.sin(ang) * 14,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: 1.85, dmg: 18.0 * rs.torp * (ship.dmgMul || 1), r: 2.6
    });
    ship.torpCd = 0.38 * (this.chaosHasBuff(ship, "overdrive") ? CHAOS_RIFTS[0].torpCd : 1);
    ship.fuel = Math.max(0.0, ship.fuel - 2.4);
    this.emit("torp", { sid: ship.id });
    var dock = this.orbiting(ship);
    if (dock && dock.owner !== ship.race) this.bombard(dock, 18.0 * rs.torp);
  };

  Game.prototype.firePhaser = function (ship) {
    if (ship.phaserCd > 0 || !ship.alive) return;
    if (ship.fuel < 6) return;
    var rs = RACES[ship.race];
    var reach = 195.0, half = 0.46;
    ship.phaserCd = 0.44 * (this.chaosHasBuff(ship, "overdrive") ? CHAOS_RIFTS[0].phCd : 1);
    ship.fuel = Math.max(0.0, ship.fuel - 7.0);
    this.emit("ph", { sid: ship.id, ang: r2(ship.ang), x: r1(ship.x), y: r1(ship.y) });
    var list = vals(this.players), i, o, d, want, fall, dmg;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === ship || !o.alive) continue;
      if (!this.hostile(ship, o)) continue;
      d = dist(ship.x, ship.y, o.x, o.y);
      if (d > reach || d < 4) continue;
      want = angTo(ship.x, ship.y, o.x, o.y);
      if (Math.abs(angNorm(want - ship.ang)) > half) continue;
      fall = 1.0 - 0.55 * (d / reach);
      dmg = 17.0 * rs.phaser * (ship.dmgMul || 1) * fall;
      this.hitShip(o, dmg, ship.id);
    }
  };

  Game.prototype.hyper = function (ship) {
    if (!ship.alive || ship.hyperCd > 0) return;
    if (ship.fuel < 18) return;
    var rs = RACES[ship.race];
    var hop = 118.0 + 40.0 * rs.speed;
    ship.x += Math.cos(ship.ang) * hop;
    ship.y += Math.sin(ship.ang) * hop;
    ship.fuel = Math.max(0.0, ship.fuel - 20.0);
    ship.hyperCd = 1.12;
    ship.hyperI = 0.32;
    ship.invuln = Math.max(ship.invuln || 0, 0.32);
    this.emit("hop", { sid: ship.id, x: r1(ship.x), y: r1(ship.y) });
  };

  Game.prototype.detonate = function (ship) {
    var mine = this.torps.filter(function (t) { return t.oid === ship.id; });
    if (!mine.length) return;
    var rs = RACES[ship.race];
    var keep = [], i, t;
    for (i = 0; i < this.torps.length; i++) {
      t = this.torps[i];
      if (t.oid === ship.id) {
        this.aoe(t.x, t.y, 56.0, 20.0 * rs.torp, ship.race, ship.id);
        this.emit("boom", { x: r1(t.x), y: r1(t.y) });
      } else keep.push(t);
    }
    this.torps = keep;
  };

  Game.prototype.aoe = function (x, y, radius, dmg, race, oid) {
    var list = vals(this.players), i, o, d, b;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (!o.alive) continue;
      if (o.id === oid) continue;
      var src = this.players[oid];
      if (!((src && src.boss) || o.boss) && o.race === race) continue;
      d = dist(x, y, o.x, o.y);
      if (d < radius + 10) {
        this.hitShip(o, dmg * (1.0 - 0.4 * (d / (radius + 10))), oid);
      }
    }
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (b.owner === race) continue;
      d = dist(x, y, b.x, b.y);
      if (d < radius + b.r) this.bombard(b, dmg * 0.85);
    }
  };

  Game.prototype.bombard = function (b, dmg) {
    if (b.def > 0) {
      b.def = Math.max(0.0, b.def - (0.65 + dmg * 0.035));
    } else if (b.armies > 0) {
      var lost = b.armies >= 3 ? 2 : 1;
      if (dmg > 24) lost += 1;
      b.armies = Math.max(0, b.armies - lost);
    }
  };

  Game.prototype.hitShip = function (ship, dmg, srcId) {
    if ((ship.invuln || 0) > 0 || (ship.hyperI || 0) > 0) return;
    if (srcId && this.players[srcId]) ship.lastHit = srcId;
    if (ship.shieldsOn && (ship.shields || 0) > 0) {
      var soak = Math.min(ship.shields, dmg * 0.82);
      ship.shields -= soak;
      dmg -= soak;
      ship.flash = 0.12;
    }
    if (dmg > 0) {
      ship.hull -= dmg;
      ship.flash = 0.18;
    }
    if (ship.hull <= 0 && ship.alive) this.killShip(ship);
  };

  Game.prototype.killShip = function (ship) {
    var lost = (ship.armies || 0) | 0;
    var wasBoss = !!ship.boss;
    ship.armies = 0;
    ship.alive = false;
    ship.hull = 0;
    ship.spawnT = wasBoss ? 0 : 2.3;
    ship.lostArmies = lost;
    var killer = this.players[ship.lastHit];
    if (killer && killer.id !== ship.id) {
      killer.score = (killer.score || 0) + 1;
      this.applyUpgrade(killer);
      this.chaosOnKill(killer);
    }
    this.killCount = (this.killCount || 0) + 1;
    if (!wasBoss && Math.random() < CHAOS.podDrop) this.chaosSpawnPod(ship.x, ship.y);
    this.emit("die", { sid: ship.id, n: lost, x: r1(ship.x || 0), y: r1(ship.y || 0), B: wasBoss ? 1 : 0 });
    var sid = ship.id;
    this.torps = this.torps.filter(function (t) { return t.oid !== sid; });
    if (wasBoss) ship.elim = true;
    this.maybeBoss();
  };

  Game.prototype.pickBossRace = function () {
    var humans = this.humanList(), used = {}, i, r;
    for (i = 0; i < humans.length; i++) used[humans[i].race] = 1;
    for (i = 0; i < RACE_ORDER.length; i++) {
      r = RACE_ORDER[i];
      if (!used[r] && this.racePlanets(r).length) return r;
    }
    for (i = 0; i < RACE_ORDER.length; i++) {
      r = RACE_ORDER[i];
      if (this.racePlanets(r).length) return r;
    }
    return "mandate";
  };

  Game.prototype.maybeBoss = function () {
    var need = ((this.bossSpawned || 0) + 1) * 50;
    if ((this.killCount || 0) < need) return;
    var list = vals(this.players), i, aliveB = 0;
    for (i = 0; i < list.length; i++) if (list[i].boss && list[i].alive) aliveB++;
    if (aliveB >= 3) return;
    this.bossSpawned = (this.bossSpawned || 0) + 1;
    var preferred = this.pickBossRace();
    var tries = RACE_ORDER.slice();
    tries.sort(function (a, b) { return a === preferred ? -1 : b === preferred ? 1 : 0; });
    var rec = null, race;
    for (i = 0; i < tries.length; i++) {
      race = tries[i];
      rec = this.spawnAI(race);
      rec.boss = 1;
      rec.name = "BOSS";
      if (this.spawnShip(rec, true)) break;
      delete this.players[rec.id];
      rec = null;
    }
    if (!rec || !rec.alive) return;
    rec.huntT = 10;
    rec.state = "hunt";
    this.emit("boss", { sid: rec.id, r: rec.race, x: r1(rec.x), y: r1(rec.y) });
    this.addChat("RINGFIRE", rec.race, "BOSS SHIP DETECTED");
  };

  Game.prototype.tryBeam = function (ship) {
    if ((ship.beamCd || 0) > 0 || !ship.alive) return;
    var b = this.orbiting(ship);
    if (!b) return;
    var can, n;
    if (b.owner === ship.race) {
      can = Math.max(0, b.armies - b.minG);
      if (can <= 0 || ship.armies >= ship.maxArmies) return;
      n = Math.min(4, can, ship.maxArmies - ship.armies);
      b.armies -= n;
      ship.armies += n;
      ship.beamCd = 0.28;
      this.emit("up", { sid: ship.id, n: n, pid: b.id });
    } else {
      if (ship.armies <= 0) return;
      n = Math.min(4, ship.armies);
      ship.armies -= n;
      this.startBattle(b, ship.race, n);
      ship.beamCd = 0.28;
      this.emit("dn", { sid: ship.id, n: n, pid: b.id });
    }
  };

  Game.prototype.capturePlanet = function (b, winner, leftover) {
    b.owner = winner;
    b.armies = Math.max(1, leftover | 0);
    b.def = 3.0;
    b.battle = null;
    this.emit("cap", { pid: b.id, r: winner });
    this.addChat("RINGFIRE", winner, b.name + " TAKEN BY " + RACES[winner].name);
  };

  Game.prototype.tryCaptureOverrun = function (b) {
    if (!b.battle || b.battle.atk < CAPTURE_MARINES) return false;
    this.capturePlanet(b, b.battle.side, b.battle.atk);
    return true;
  };

  Game.prototype.startBattle = function (b, side, n) {
    if (n <= 0) return;
    if (b.armies <= 0 && !b.battle) {
      this.capturePlanet(b, side, n);
      return;
    }
    if (!b.battle) {
      b.battle = { side: side, atk: n, t: 0.0 };
    } else if (b.battle.side === side) {
      b.battle.atk += n;
    } else {
      var clash = Math.min(b.battle.atk, n);
      b.battle.atk -= clash;
      n -= clash;
      if (b.battle.atk <= 0) b.battle = n > 0 ? { side: side, atk: n, t: 0.0 } : null;
    }
    this.tryCaptureOverrun(b);
  };

  Game.prototype.tickBattle = function (b, dt) {
    if (!b.battle) return;
    b.battle.t += dt;
    if (b.battle.t < 0.45) return;
    b.battle.t = 0.0;
    var atk = b.battle.atk;
    var defN = b.armies;
    var defP = defN + b.def * 0.55;
    var atkLoss = Math.max(1, Math.round(defP * 0.16));
    var defLoss = Math.max(1, Math.round(atk * 0.2));
    b.battle.atk = Math.max(0, atk - atkLoss);
    b.armies = Math.max(0, defN - defLoss);
    if (this.tryCaptureOverrun(b)) return;
    if (b.armies <= 0 && b.battle.atk > 0) {
      /* fall through to capture */
    } else if (b.battle.atk <= 0) {
      if (b.armies <= 0) b.armies = 1;
      b.battle = null;
      return;
    }
    if (b.armies <= 0) {
      this.capturePlanet(b, b.battle.side, b.battle.atk);
    }
  };

  Game.prototype.applyInput = function (pid, body) {
    var p = this.players[pid];
    if (!p || p.ai) return { err: "no" };
    p.last = nowSec();
    var seq = (body && body.seq) | 0;
    p.seq = seq;
    var keys = (body && (body.keys || body.k)) || {};
    p.inp = {
      l: !!(keys.l || keys.left),
      r: !!(keys.r || keys.right),
      sp: !!(keys.sp || keys.space),
      f: !!(keys.f || keys.c),
      x: !!(keys.x || keys.g || (body && body.detonate)),
      h: !!(keys.h || (body && body.hyper)),
      b: !!(keys.b || (body && body.beam)),
      s: !!keys.s,
      u: !!keys.u,
      rp: !!(keys.rp || keys.r),
      w: keys.w
    };
    if (keys.w != null) {
      var wi = parseInt(keys.w, 10);
      p.inp.w = isNaN(wi) ? null : wi;
    }
    var msg = body && (body.chat || body.msg);
    if (msg && this.phase === "play") {
      if (this.time - (p.chatT || 0) >= 0.6) {
        p.chatT = this.time;
        this.addChat(p.name, p.race, String(msg));
      }
    }
    return { ok: 1 };
  };

  Game.prototype.steer = function (e, tx, ty, dt, wantWarp) {
    var rs = RACES[e.race];
    var want = angTo(e.x, e.y, tx, ty);
    var diff = angNorm(want - e.ang);
    var tr = turnRate(e.warp || 4, rs.turn);
    var step = tr * dt;
    if (diff > step) e.ang += step;
    else if (diff < -step) e.ang -= step;
    else e.ang = want;
    var d = dist(e.x, e.y, tx, ty);
    if (d < 70) e.warp = Math.min(wantWarp, 3);
    else if (d < 180) e.warp = Math.min(wantWarp, 5);
    else e.warp = wantWarp;
  };

  Game.prototype.weakestTarget = function (race) {
    var best = null, score = 1e9, i, b, s;
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (b.owner === race) continue;
      s = b.armies * 1.3 + b.def * 2;
      if (b.owner === N) s -= 6;
      if (s < score) { score = s; best = b; }
    }
    return best;
  };

  Game.prototype.strongestDepot = function (race) {
    var best = null, score = -1, i, b, s;
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (b.owner !== race) continue;
      if (b.armies <= b.minG + 1) continue;
      s = b.armies - b.minG;
      if (s > score) { score = s; best = b; }
    }
    return best;
  };

  Game.prototype.nearestEnemyShip = function (e, lim) {
    if (lim == null) lim = 340;
    var best = null, bd = lim, list = vals(this.players), i, o, d, ol;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === e || !o.alive || !this.hostile(e, o)) continue;
      ol = lim;
      if (this.chaosHasBuff(o, "phantom")) ol *= CHAOS_RIFTS[1].hunt;
      d = dist(e.x, e.y, o.x, o.y);
      if (d < ol && d < bd) { bd = d; best = o; }
    }
    return best;
  };

  Game.prototype.updateAI = function (e, dt) {
    if (!e.alive) return;
    var prey = this.nearestEnemyShip(e);
    if (prey) e.huntT = 2.2;
    if ((e.huntT || 0) > 0) e.huntT -= dt;
    var d, diff, lead, depot, tgt;
    if (prey && (e.huntT || 0) > 0) {
      lead = warpSpeed(prey.warp || 3, RACES[prey.race].speed, prey.fuel || 50) * 0.22;
      this.steer(e, prey.x + Math.cos(prey.ang) * lead, prey.y + Math.sin(prey.ang) * lead, dt, 6);
      d = dist(e.x, e.y, prey.x, prey.y);
      diff = Math.abs(angNorm(angTo(e.x, e.y, prey.x, prey.y) - e.ang));
      var aimMul = this.chaosHasBuff(prey, "phantom") ? CHAOS_RIFTS[1].aim : 1;
      if (d < 190 && diff < 0.5 * aimMul) this.firePhaser(e);
      if (d < 260 && diff < 0.28 * aimMul) this.fireTorp(e);
      if (d < 90 && (e.hull || 1) < (e.maxHull || 100) * 0.4) this.hyper(e);
      return;
    }
    if ((e.armies || 0) <= 1) {
      depot = this.strongestDepot(e.race);
      if (depot) {
        this.steer(e, depot.x, depot.y, dt, 7);
        if (this.inOrbit(e.x, e.y, depot)) {
          e.warp = 1;
          e.inp = { b: true };
          this.tryBeam(e);
        }
        return;
      }
    }
    tgt = this.weakestTarget(e.race);
    if (!tgt) return;
    this.steer(e, tgt.x, tgt.y, dt, 7);
    if (this.inOrbit(e.x, e.y, tgt)) {
      e.warp = 1;
      if (tgt.owner !== e.race) {
        if (tgt.armies > 6 || tgt.def > 1) {
          this.fireTorp(e);
          if (Math.random() < 0.08) this.detonate(e);
        } else if ((e.armies || 0) > 1) {
          this.tryBeam(e);
        } else {
          this.fireTorp(e);
        }
      }
    }
  };

  Game.prototype.updateShip = function (p, dt) {
    if (!p.alive) {
      if ((p.spawnT || 0) > 0) {
        p.spawnT -= dt;
        if (p.spawnT <= 0) {
          if (p.boss) {
            p.elim = true;
          } else if (!this.racePlanets(p.race).length) {
            this.elim[p.race] = 1;
            p.elim = true;
          } else this.spawnShip(p, false);
        }
      }
      return;
    }
    var rs = RACES[p.race];
    var inp = p.inp || {};
    p.invuln = Math.max(0.0, (p.invuln || 0) - dt);
    p.hyperI = Math.max(0.0, (p.hyperI || 0) - dt);
    p.flash = Math.max(0.0, (p.flash || 0) - dt);
    p.torpCd = Math.max(0.0, (p.torpCd || 0) - dt);
    p.phaserCd = Math.max(0.0, (p.phaserCd || 0) - dt);
    p.beamCd = Math.max(0.0, (p.beamCd || 0) - dt);
    p.hyperCd = Math.max(0.0, (p.hyperCd || 0) - dt);

    if (inp.l) p.ang -= turnRate(p.warp || 0, rs.turn) * dt;
    if (inp.r) p.ang += turnRate(p.warp || 0, rs.turn) * dt;
    var w = inp.w;
    if (w != null && p.fuel > 0) p.warp = clamp(w | 0, 0, 9);
    if (p.fuel <= 0) {
      p.fuel = 0;
      p.warp = 0;
      p.shieldsOn = false;
    }

    var sp = warpSpeed(p.warp || 0, rs.speed, p.fuel || 0);
    if ((p.streakBoostT || 0) > 0 && (p.warp || 0) > 0) sp *= CHAOS.streakSpeed;
    p.x += Math.cos(p.ang) * sp * dt;
    p.y += Math.sin(p.ang) * sp * dt;
    p.x = clamp(p.x, -80, 1680);
    p.y = clamp(p.y, -80, 1680);

    p.fuel -= fuelBurn(p.warp || 0, p.shieldsOn) * dt;

    var dock = this.orbiting(p);
    if (dock && dock.owner === p.race) {
      var rate = dock.classM ? 22.0 : 5.5;
      p.fuel = Math.min(p.maxFuel, p.fuel + rate * dt);
      if (inp.rp && p.hull < p.maxHull) {
        p.hull = Math.min(p.maxHull, p.hull + 11 * dt);
        p.fuel = Math.max(0.0, p.fuel - 1.5 * dt);
      }
      if (inp.u) p.fuel = Math.min(p.maxFuel, p.fuel + 10 * dt);
    } else {
      p.fuel = Math.min(p.maxFuel, p.fuel + 0.42 * dt + (this.chaosHasBuff(p, "siphon") ? CHAOS_RIFTS[2].fuel * dt : 0));
    }

    if (p.fuel < 0) p.fuel = 0;
    if (p.shieldsOn) p.shields = Math.min(p.maxShields, p.shields + 7 * dt);

    if (inp.sp) this.fireTorp(p);
    if (inp.f) this.firePhaser(p);
    if (inp.x) {
      if (!p.didX) this.detonate(p);
      p.didX = true;
    } else p.didX = false;
    if (inp.h) {
      if (!p.didH) this.hyper(p);
      p.didH = true;
    } else p.didH = false;
    if (inp.s) {
      if (!p.didS) {
        p.shieldsOn = !p.shieldsOn;
        if (p.fuel <= 0) p.shieldsOn = false;
      }
      p.didS = true;
    } else p.didS = false;
    if (inp.b) this.tryBeam(p);
  };

  Game.prototype.updateTorps = function (dt) {
    var live = [], i, t, hit, j, o, b, list;
    list = vals(this.players);
    for (i = 0; i < this.torps.length; i++) {
      t = this.torps[i];
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.life -= dt;
      hit = false;
      for (j = 0; j < list.length; j++) {
        o = list[j];
        if (!o.alive || o.id === t.oid) continue;
        var shooter = this.players[t.oid];
        if (shooter) {
          if (!this.hostile(shooter, o)) continue;
        } else if (!o.boss && o.race === t.race) continue;
        if (dist(t.x, t.y, o.x, o.y) < 11 + t.r) {
          this.hitShip(o, t.dmg, t.oid);
          this.emit("boom", { x: r1(t.x), y: r1(t.y) });
          hit = true;
          break;
        }
      }
      if (!hit && String(t.oid || "").indexOf("gun-") !== 0) {
        for (j = 0; j < this.planets.length; j++) {
          b = this.planets[j];
          if (b.owner === t.race) continue;
          if (dist(t.x, t.y, b.x, b.y) < b.r + 3) {
            this.bombard(b, t.dmg);
            this.emit("boom", { x: r1(t.x), y: r1(t.y) });
            hit = true;
            break;
          }
        }
      }
      if (!hit && t.life > 0) live.push(t);
    }
    this.torps = live;
  };

  Game.prototype.updatePlanets = function (dt) {
    var i, b, interval, list, j, o, a, spd;
    list = vals(this.players);
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      if (b.owner !== N && b.armies < b.cap && !b.battle) {
        b.recruit += dt;
        var rate = b.home ? 12.0 : 16.0;
        if (b.recruit >= rate) {
          b.recruit = 0;
          b.armies += 1;
        }
      } else if (b.owner === N && b.armies < b.cap && !b.battle) {
        b.recruit += dt;
        if (b.recruit >= 90.0) {
          b.recruit = 0;
          b.armies += 1;
        }
      }
      if (b.battle) this.tickBattle(b, dt);
      if (b.def > 0) {
        b.gunCd -= dt;
        interval = 1.25 * (10 / (b.def + 4));
        if (b.gunCd <= 0) {
          b.gunCd = interval;
          for (j = 0; j < list.length; j++) {
            o = list[j];
            if (!o.alive) continue;
            if (o.race === b.owner) continue;
            if (this.inOrbit(o.x, o.y, b)) {
              a = angTo(b.x, b.y, o.x, o.y);
              spd = 220;
              this.torpSeq += 1;
              this.torps.push({
                id: this.torpSeq, oid: "gun-" + b.id,
                race: b.owner !== N ? b.owner : "gun",
                x: b.x + Math.cos(a) * (b.r + 4),
                y: b.y + Math.sin(a) * (b.r + 4),
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                life: 0.85, dmg: 5.5 + b.def * 0.8, r: 2.0
              });
              break;
            }
          }
        }
      }
    }
  };

  Game.prototype.checkOutcome = function () {
    var sc = this.counts(), i, r, n;
    for (i = 0; i < RACE_ORDER.length; i++) {
      r = RACE_ORDER[i];
      n = sc[r] || 0;
      if (n <= 0) this.elim[r] = 1;
      else if (this.elim[r] && n > 0) delete this.elim[r];
    }
    for (i = 0; i < RACE_ORDER.length; i++) {
      r = RACE_ORDER[i];
      if ((sc[r] || 0) >= 25) {
        this.phase = "over";
        this.winner = r;
        this.overReason = RACES[r].name + " HOLDS THE GALAXY";
        this.addChat("RINGFIRE", r, this.overReason);
        return;
      }
    }
  };

  Game.prototype.touch = function (pid) {
    var p = this.players[pid];
    if (p) p.last = nowSec();
  };

  Game.prototype.leave = function (pid) {
    var p = this.players[pid];
    if (!p || p.ai) return { ok: 1 };
    var wasHost = pid === this.hostId;
    delete this.players[pid];
    if (wasHost && this.phase === "play") {
      this.phase = "over";
      this.overReason = "HOST LEFT";
    } else if (wasHost) {
      var humans = this.humanList();
      this.hostId = humans.length ? humans[0].id : null;
      var list = vals(this.players), i;
      for (i = 0; i < list.length; i++) list[i].host = list[i].id === this.hostId;
    }
    return { ok: 1 };
  };

  Game.prototype.hostLeft = function () {
    this.phase = "over";
    this.winner = null;
    this.overReason = "HOST LEFT";
    this.addChat("RINGFIRE", "helios", "HOST LEFT — MATCH ENDS");
  };

  Game.prototype.sweepStale = function () {
    var now = nowSec(), pid, p, dead, i, wasHost, humans, q, list;
    if (this.phase === "lobby") {
      dead = [];
      for (pid in this.players) {
        if (!Object.prototype.hasOwnProperty.call(this.players, pid)) continue;
        p = this.players[pid];
        if (p.ai) continue;
        if (now - (p.last || now) > STALE_SEC) dead.push(pid);
      }
      for (i = 0; i < dead.length; i++) {
        pid = dead[i];
        wasHost = pid === this.hostId;
        delete this.players[pid];
        if (wasHost) {
          humans = this.humanList();
          this.hostId = humans.length ? humans[0].id : null;
          list = vals(this.players);
          for (q = 0; q < list.length; q++) list[q].host = list[q].id === this.hostId;
        }
      }
    } else if (this.phase === "play") {
      var host = this.players[this.hostId];
      if (host && !host.ai && now - (host.last || now) > HOST_STALE_SEC) this.hostLeft();
    }
  };

  Game.prototype.tick = function () {
    if (this.phase !== "play") {
      this.sweepStale();
      return;
    }
    var dt = DT * PLAY_RATE;
    this.time += dt;
    this.tickN += 1;
    var list = vals(this.players), i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.ai) {
        if (p.alive) {
          p.inp = {};
          this.updateAI(p, dt);
        }
      }
      this.updateShip(p, dt);
    }
    this.updateTorps(dt);
    this.updatePlanets(dt);
    this.tickChaos(dt);
    if (this.tickN % 8 === 0) this.checkOutcome();
    this.sweepStale();
  };

  Game.prototype.lobbyJson = function () {
    var pl = [], list = vals(this.players), i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.ai && this.phase === "lobby") continue;
      pl.push({
        id: p.id, name: p.name, race: p.race,
        ready: !!p.ready, host: p.id === this.hostId, ai: !!p.ai
      });
    }
    return {
      phase: this.phase,
      players: pl,
      fillAI: this.fillAI,
      max: MAX_PLAYERS,
      hostId: this.hostId,
      winner: this.winner,
      reason: this.overReason
    };
  };

  Game.prototype.stateJson = function (pid) {
    if (this.phase === "lobby") return this.lobbyJson();
    var ships = [], list = vals(this.players), i, p, b, rec, sc;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p.race) continue;
      ships.push({
        id: p.id, n: p.name, r: p.race,
        x: r1(p.x || 0), y: r1(p.y || 0),
        a: r2(p.ang || 0), w: (p.warp || 0) | 0,
        h: r1(p.hull || 0), H: (p.maxHull || 100) | 0,
        f: r1(p.fuel || 0), F: (p.maxFuel || BASE_FUEL) | 0,
        m: (p.armies || 0) | 0, M: (p.maxArmies || 28) | 0,
        s: p.shieldsOn ? 1 : 0,
        S: r1(p.shields || 0),
        v: p.alive ? 1 : 0,
        i: ((p.invuln || 0) > 0 || (p.hyperI || 0) > 0) ? 1 : 0,
        z: r1(p.flash || 0),
        ai: p.ai ? 1 : 0,
        el: this.elim[p.race] ? 1 : 0,
        k: (p.score || 0) | 0,
        u: (p.upgradeTier || 0) | 0,
        B: p.boss ? 1 : 0,
        Q: r1(p.maxShields || 70)
      });
      if (p.buff && (p.buffT || 0) > 0) {
        ships[ships.length - 1].bf = p.buff.charAt(0);
        ships[ships.length - 1].bt = r1(p.buffT);
      }
      if ((p.streak || 0) >= 2 && (p.streakT || 0) > 0) {
        ships[ships.length - 1].sk = p.streak | 0;
      }
      if ((p.streakBoostT || 0) > 0) ships[ships.length - 1].sb = r1(p.streakBoostT);
    }
    var planets = [];
    for (i = 0; i < this.planets.length; i++) {
      b = this.planets[i];
      rec = {
        id: b.id, n: b.name, x: b.x | 0, y: b.y | 0,
        R: b.r, o: b.owner, m: b.armies | 0,
        d: r1(b.def), c: b.classM ? 1 : 0,
        k: b.seat ? 1 : 0, col: b.color
      };
      if (b.battle) rec.b = { s: b.battle.side, a: b.battle.atk | 0 };
      planets.push(rec);
    }
    var torps = [];
    for (i = 0; i < this.torps.length; i++) {
      var t = this.torps[i];
      torps.push({ x: r1(t.x), y: r1(t.y), r: String(t.race).charAt(0), o: t.oid });
    }
    sc = this.counts();
    var elim = [];
    for (i = 0; i < RACE_ORDER.length; i++) if (this.elim[RACE_ORDER[i]]) elim.push(RACE_ORDER[i]);
    var rf = [], sp = [], ri, pod;
    for (ri = 0; ri < this.rifts.length; ri++) {
      rf.push([r1(this.rifts[ri].x), r1(this.rifts[ri].y), this.rifts[ri].t | 0]);
    }
    for (ri = 0; ri < this.pods.length; ri++) {
      pod = this.pods[ri];
      sp.push([r1(pod.x), r1(pod.y)]);
    }
    var out = {
      p: this.phase === "play" ? "P" : (this.phase === "over" ? "O" : "L"),
      t: r1(this.time),
      w: this.winner,
      why: this.overReason,
      you: pid && this.players[pid] ? pid : null,
      sh: ships,
      pl: planets,
      tr: torps,
      ch: this.chat.slice(-8),
      sc: (function () {
        var o = {}, j;
        for (j = 0; j < RACE_ORDER.length; j++) o[RACE_ORDER[j]] = sc[RACE_ORDER[j]] || 0;
        return o;
      })(),
      n: sc[N] || 0,
      ev: this.events.slice(-10),
      fillAI: this.fillAI,
      elim: elim,
      host: this.hostId
    };
    if (rf.length) out.rf = rf;
    if (sp.length) out.sp = sp;
    return out;
  };

  var api = {
    Game: Game,
    RACES: RACES,
    RACE_ORDER: RACE_ORDER,
    MAX_PLAYERS: MAX_PLAYERS,
    DT: DT,
    TICK_HZ: TICK_HZ,
    PLAY_RATE: PLAY_RATE,
    PLANET_DEFS: PLANET_DEFS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GalaxySim = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
