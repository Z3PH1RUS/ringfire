/* RINGFIRE — original game by Caine
   Inspired by 1983 solar-system war games (Apple II) and 1973 PLATO Empire (Daleske et al.).
   Original code, original dart-class silhouette, original UI, original race names.
   file:// plays SOL. GALAXY is internet rooms (MQTT broker) or optional python3 server.py LAN. */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var FRIEND = "F";
  var ENEMY = "E";
  var LS_HOF = "ringfire-hof-v1";
  var LS_SEED = "ringfire-last-seed-v1";
  var LS_CFG = "ringfire-last-cfg-v1";
  var LS_SET = "ringfire-settings-v1";
  var PLAY_RATE = 0.48;      /* 40% slower than prior 0.8 pace (sim dt / speeds / cadence) */
  var BLAST_SCALE = 1.3;     /* explosions 30% bigger than prior blast size */
  var PLANET_ZOOM = 1.5;     /* 50% camera zoom-in near a planet, ship centered */
  var MAX_ASTEROIDS = 20;
  var ASTEROID_R = 10.5;     /* rocky bodies ~50% larger than dart ship */
  var BASE_FUEL = 100;
  var BASE_SHIELDS = 80;
  var BASE_ENEMY_HULL = 58;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
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
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function nowMs() { return performance.now(); }

  /* ---------- astronomy (real facts, compact distances) ---------- */
  var BODY_DEF = [
    { id: "sun", name: "SOL", kind: "star", parent: null, orbit: 0, period: 0, r: 42, color: "#ffd27a",
      fact: "The Sun is a G-type main-sequence star. It holds 99.8% of the Solar System's mass and fuses hydrogen into helium in its core.",
      owner0: null, armies0: 0, def0: 0, cap: 0, minG: 0 },
    { id: "mercury", name: "MERCURY", kind: "planet", parent: "sun", orbit: 165, period: 88, r: 6, color: "#b0b0b0",
      fact: "Mercury is the smallest planet and the closest to the Sun. A solar day lasts 176 Earth days; nights drop near −180°C.",
      owner0: FRIEND, armies0: 14, def0: 2, cap: 20, minG: 3 },
    { id: "venus", name: "VENUS", kind: "planet", parent: "sun", orbit: 250, period: 142, r: 9, color: "#e0c36a",
      fact: "Venus is the hottest planet. A runaway greenhouse of carbon dioxide keeps the surface near 465°C; it rotates backwards.",
      owner0: FRIEND, armies0: 18, def0: 3, cap: 24, minG: 3 },
    { id: "earth", name: "EARTH", kind: "planet", parent: "sun", orbit: 350, period: 200, r: 10, color: "#4a90d4",
      fact: "Earth is the only known world with liquid water oceans and life. Its nitrogen-oxygen atmosphere and magnetic field shield the surface.",
      owner0: FRIEND, armies0: 30, def0: 5, cap: 36, minG: 4 },
    { id: "luna", name: "LUNA", kind: "moon", parent: "earth", orbit: 34, period: 22, r: 4, color: "#c8c8c8",
      fact: "Earth's Moon is tidally locked, always showing one face. Giant-impact debris likely formed it; it drives Earth's tides.",
      owner0: FRIEND, armies0: 8, def0: 2, cap: 12, minG: 1 },
    { id: "mars", name: "MARS", kind: "planet", parent: "sun", orbit: 470, period: 290, r: 8, color: "#c45c3e",
      fact: "Mars is a cold desert planet rusted by iron oxide. Olympus Mons is the tallest volcano in the Solar System.",
      owner0: FRIEND, armies0: 16, def0: 3, cap: 22, minG: 3 },
    { id: "jupiter", name: "JUPITER", kind: "planet", parent: "sun", orbit: 980, period: 920, r: 22, color: "#d4a574",
      fact: "Jupiter is the largest planet, a gas giant. The Great Red Spot is an anticyclonic storm older than centuries of telescopes.",
      owner0: ENEMY, armies0: 20, def0: 6, cap: 28, minG: 4 },
    { id: "io", name: "IO", kind: "moon", parent: "jupiter", orbit: 38, period: 14, r: 4.2, color: "#e8d44a",
      fact: "Io is the most volcanically active body known. Jupiter's tides flex its interior and drive sulfur volcanism.",
      owner0: ENEMY, armies0: 7, def0: 3, cap: 12, minG: 1 },
    { id: "europa", name: "EUROPA", kind: "moon", parent: "jupiter", orbit: 50, period: 18, r: 4.4, color: "#d4e4f0",
      fact: "Europa's icy crust likely hides a global saltwater ocean. Tidal heat from Jupiter could keep that ocean liquid.",
      owner0: FRIEND, armies0: 6, def0: 2, cap: 12, minG: 1 },
    { id: "ganymede", name: "GANYMEDE", kind: "moon", parent: "jupiter", orbit: 64, period: 24, r: 5.4, color: "#a89880",
      fact: "Ganymede is the largest moon in the Solar System — bigger than Mercury — and the only moon with its own magnetic field.",
      owner0: ENEMY, armies0: 10, def0: 4, cap: 14, minG: 1 },
    { id: "callisto", name: "CALLISTO", kind: "moon", parent: "jupiter", orbit: 82, period: 32, r: 5, color: "#6a6058",
      fact: "Callisto is a heavily cratered ice-rock moon. Its ancient surface shows little geologic resurfacing.",
      owner0: ENEMY, armies0: 8, def0: 3, cap: 12, minG: 1 },
    { id: "saturn", name: "SATURN", kind: "planet", parent: "sun", orbit: 1680, period: 1480, r: 18, color: "#e6d4a0",
      fact: "Saturn is a gas giant famous for its ice-and-rock rings. Its average density is less than water.",
      owner0: ENEMY, armies0: 22, def0: 7, cap: 30, minG: 4 },
    { id: "titan", name: "TITAN", kind: "moon", parent: "saturn", orbit: 54, period: 20, r: 7, color: "#d4923a",
      fact: "Titan is Saturn's largest moon and the only moon with a thick atmosphere. Lakes of liquid methane and ethane pool on its surface.",
      owner0: ENEMY, armies0: 16, def0: 8, cap: 26, minG: 3, capital: true },
    { id: "uranus", name: "URANUS", kind: "planet", parent: "sun", orbit: 2380, period: 2100, r: 14, color: "#7ec8c8",
      fact: "Uranus is an ice giant tilted about 98 degrees, rolling on its side as it orbits the Sun. Methane gives it a cyan hue.",
      owner0: ENEMY, armies0: 14, def0: 5, cap: 22, minG: 3 },
    { id: "neptune", name: "NEPTUNE", kind: "planet", parent: "sun", orbit: 3080, period: 2680, r: 13, color: "#3a6fd4",
      fact: "Neptune is the windiest planet. Supersonic jets exceed 1,000 mph; methane in the atmosphere makes it deep blue.",
      owner0: ENEMY, armies0: 12, def0: 5, cap: 20, minG: 3 },
    { id: "triton", name: "TRITON", kind: "moon", parent: "neptune", orbit: 38, period: 16, r: 4.6, color: "#b0c4c8",
      fact: "Triton orbits Neptune backwards, a clue it was captured. Nitrogen geysers erupt from its icy crust.",
      owner0: ENEMY, armies0: 8, def0: 4, cap: 12, minG: 1 },
    { id: "pluto", name: "PLUTO", kind: "planet", parent: "sun", orbit: 3780, period: 3300, r: 5.5, color: "#c9b8a8",
      fact: "Pluto is a dwarf planet in the Kuiper Belt. Nitrogen ice plains and a thin atmosphere were imaged by New Horizons in 2015.",
      owner0: ENEMY, armies0: 10, def0: 3, cap: 16, minG: 2 }
  ];

  var PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

  var BUBBLE_LINES = [
    "Have you tried turning the Sun off and on again?",
    "Warp 9 is a lifestyle, not a setting.",
    "Drop the armies. All of them. Trust me.",
    "Titan looks friendly from this angle.",
    "Shields are a social construct.",
    "If Earth falls, just live on Io. Io is fine. Io is lava.",
    "Photon torpedoes: nature's handshake.",
    "The Mandate's flag is ugly. That is tactically relevant.",
    "Refuel later. The later is the strategy.",
    "Bubble recommends colliding with Jupiter. Bubble is a computer.",
    "Leave the garrison. What garrison.",
    "Tracking missiles enjoy being lonely. Fire one.",
    "Pluto is a planet in this program. Fight me.",
    "Orbit is just falling with style and gunfire.",
    "I have calculated your odds. I have hidden the number.",
    "Repair is for people who get hit. Be people who do not get hit.",
    "The rings of Saturn are edible. This is not verified.",
    "Beam down. Beam up. Forget which was which.",
    "Enemy ships are attracted to confidence and also to you.",
    "A moon is a planet that learned to orbit someone else's problem."
  ];

  /* ---------- audio (optional; fully silent is fine) ---------- */
  var audio = {
    ctx: null,
    muted: false,
    enabled: true,
    master: null,
    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
    },
    resume: function () {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    beep: function (freq, dur, type, vol, slide) {
      if (this.muted || !this.enabled) return;
      this.init();
      if (!this.ctx) return;
      var t = this.ctx.currentTime;
      var o = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
      g.gain.setValueAtTime((vol || 0.2) * 0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, vol) {
      if (this.muted || !this.enabled || !this.ctx) return;
      var n = Math.floor(this.ctx.sampleRate * dur);
      var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var s = this.ctx.createBufferSource();
      s.buffer = buf;
      var g = this.ctx.createGain();
      var t = this.ctx.currentTime;
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(g); g.connect(this.master);
      s.start();
    },
    warp: function (hop) {
      if (this.muted || !this.enabled) return;
      this.init();
      if (!this.ctx) return;
      if (hop) {
        this.noise(0.22, 0.2);
        this.beep(260, 0.28, "sawtooth", 0.16, 55);
        this.beep(110, 0.2, "square", 0.1, 40);
      } else {
        this.noise(0.16, 0.14);
        this.beep(90, 0.34, "sawtooth", 0.15, 480);
        this.beep(200, 0.18, "triangle", 0.1, 80);
      }
    }
  };

  /* ---------- DOM ---------- */
  var el = {
    title: document.getElementById("title"),
    how: document.getElementById("how"),
    hof: document.getElementById("hof"),
    game: document.getElementById("game"),
    end: document.getElementById("end"),
    canvas: document.getElementById("view"),
    side: document.getElementById("side"),
    hud: document.getElementById("hud"),
    banner: document.getElementById("banner"),
    bubblebox: document.getElementById("bubblebox"),
    pauseov: document.getElementById("pauseov"),
    titleMenu: document.getElementById("titleMenu"),
    titleBubble: document.getElementById("titleBubble"),
    hofEmpty: document.getElementById("hofEmpty"),
    hofTable: document.getElementById("hofTable"),
    endTitle: document.getElementById("endTitle"),
    endText: document.getElementById("endText"),
    namebox: document.getElementById("namebox"),
    nameIn: document.getElementById("nameIn"),
    saveName: document.getElementById("saveName"),
    touchbar: document.getElementById("touchbar"),
    lanNote: document.getElementById("lanNote"),
    gxlobby: document.getElementById("gxlobby"),
    gxend: document.getElementById("gxend"),
    gName: document.getElementById("gName"),
    raceGrid: document.getElementById("raceGrid"),
    plist: document.getElementById("plist"),
    fillAI: document.getElementById("fillAI"),
    hostStart: document.getElementById("hostStart"),
    readyBtn: document.getElementById("readyBtn"),
    gxHint: document.getElementById("gxHint"),
    gxendTitle: document.getElementById("gxendTitle"),
    gxendText: document.getElementById("gxendText"),
    chatlog: document.getElementById("chatlog"),
    chatin: document.getElementById("chatin"),
    chatIn: document.getElementById("chatIn"),
    iff: document.getElementById("iff"),
    galaxyItem: document.getElementById("galaxyItem")
  };
  var ctx = el.canvas.getContext("2d");

  /* ---------- persistent settings ---------- */
  var settings = { bubble: true, muted: false };
  try {
    var sraw = localStorage.getItem(LS_SET);
    if (sraw) {
      var sparsed = JSON.parse(sraw);
      if (typeof sparsed.bubble === "boolean") settings.bubble = sparsed.bubble;
      if (typeof sparsed.muted === "boolean") settings.muted = sparsed.muted;
    }
  } catch (e) {}
  audio.muted = settings.muted;
  var LAN_OK = false;
  var LAN_INFO = null;

  function saveSettings() {
    try { localStorage.setItem(LS_SET, JSON.stringify(settings)); } catch (e) {}
  }

  /* ---------- game state ---------- */
  var G = null;
  var screen = "title";
  var menuIndex = 0;
  var keys = Object.create(null);
  var just = Object.create(null);
  var pointer = { x: 0, y: 0, down: false, clicked: false };
  var lastTs = 0;
  var hudAcc = 0;
  var dpr = 1;
  var viewW = 800, viewH = 600;
  var stars = [];
  var titleSel = 0;

  var playMode = "sol";
  function showScreen(name) {
    screen = name;
    el.title.classList.toggle("on", name === "title");
    el.how.classList.toggle("on", name === "how");
    el.hof.classList.toggle("on", name === "hof");
    el.game.classList.toggle("on", name === "game" || name === "paused");
    el.end.classList.toggle("on", name === "end");
    if (el.gxlobby) el.gxlobby.classList.toggle("on", name === "gxlobby");
    if (el.gxend) el.gxend.classList.toggle("on", name === "gxend");
    el.pauseov.classList.toggle("on", name === "paused");
  }

  function warpSpeed(w) {
    if (w <= 0) return 9;
    return 8 + w * w * 0.82;
  }
  function turnRate(w) {
    return 3.15 - w * 0.2;
  }
  function fuelBurn(w, shields) {
    var b = 0.22 * w;
    if (w >= 7) b += (w - 6) * 0.35;
    if (shields) b += 0.7;
    return b;
  }

  function makeBody(def, rng) {
    var b = {
      id: def.id, name: def.name, kind: def.kind, parentId: def.parent,
      orbit: def.orbit, period: def.period, r: def.r, color: def.color,
      fact: def.fact, capital: !!def.capital,
      owner: def.owner0, armies: def.armies0, def: def.def0,
      cap: def.cap, minG: def.minG,
      angle: rng() * TAU,
      x: 0, y: 0, parent: null,
      gunCd: 0.4 + rng() * 0.8,
      recruit: rng() * 8,
      battle: null
    };
    return b;
  }

  function layoutBodies(bodies) {
    var map = Object.create(null);
    for (var i = 0; i < bodies.length; i++) map[bodies[i].id] = bodies[i];
    for (var j = 0; j < bodies.length; j++) {
      var b = bodies[j];
      b.parent = b.parentId ? map[b.parentId] : null;
    }
    function place(b) {
      if (b.kind === "star") { b.x = 0; b.y = 0; return; }
      if (b.parent) {
        b.x = b.parent.x + Math.cos(b.angle) * b.orbit;
        b.y = b.parent.y + Math.sin(b.angle) * b.orbit;
      }
    }
    for (var k = 0; k < 3; k++) for (var n = 0; n < bodies.length; n++) place(bodies[n]);
    return map;
  }

  function randomizeOwnership(bodies, rng) {
    var map = Object.create(null);
    for (var i = 0; i < bodies.length; i++) map[bodies[i].id] = bodies[i];
    map.titan.owner = ENEMY;
    map.saturn.owner = ENEMY;
    map.earth.owner = FRIEND;
    map.luna.owner = FRIEND;
    var inner = ["mercury", "venus", "mars"];
    var outer = ["jupiter", "uranus", "neptune", "pluto"];
    var moons = ["io", "europa", "ganymede", "callisto", "triton"];
    for (var a = 0; a < inner.length; a++) map[inner[a]].owner = rng() < 0.82 ? FRIEND : ENEMY;
    for (var b = 0; b < outer.length; b++) map[outer[b]].owner = rng() < 0.22 ? FRIEND : ENEMY;
    for (var c = 0; c < moons.length; c++) map[moons[c]].owner = rng() < 0.38 ? FRIEND : ENEMY;
    var fp = 0;
    for (var p = 0; p < PLANET_IDS.length; p++) if (map[PLANET_IDS[p]].owner === FRIEND) fp++;
    if (fp < 3) {
      map.venus.owner = FRIEND;
      map.mars.owner = FRIEND;
    }
    if (fp > 7) {
      map.jupiter.owner = ENEMY;
      map.uranus.owner = ENEMY;
    }
    for (var i2 = 0; i2 < bodies.length; i2++) {
      var bd = bodies[i2];
      if (!bd.owner) continue;
      if (bd.owner === FRIEND && bd.kind === "planet") {
        bd.armies = 12 + Math.floor(rng() * 12);
        bd.def = 2 + Math.floor(rng() * 3);
      } else if (bd.owner === ENEMY && bd.kind === "planet") {
        bd.armies = 10 + Math.floor(rng() * 12);
        bd.def = 3 + Math.floor(rng() * 5);
      } else if (bd.kind === "moon") {
        bd.armies = 5 + Math.floor(rng() * 7);
        bd.def = 2 + Math.floor(rng() * 3);
      }
    }
    map.titan.armies = 14 + Math.floor(rng() * 6);
    map.titan.def = 7 + Math.floor(rng() * 3);
    map.earth.armies = Math.max(map.earth.armies, 22);
  }

  function spawnEnemies(g) {
    var spots = [];
    function addSpot(id, n) {
      var b = g.map[id];
      if (!b) return;
      for (var i = 0; i < n; i++) spots.push({ x: b.x + 40 + i * 18, y: b.y - 20 + i * 12, home: id });
    }
    addSpot("titan", 2);
    addSpot("jupiter", 1);
    addSpot("saturn", 1);
    if (spots.length < 4) addSpot("neptune", 1);
    g.enemies = [];
    for (var i = 0; i < spots.length && i < 4; i++) {
      var s = spots[i];
      g.enemies.push({
        id: "M-" + (i + 1),
        x: s.x, y: s.y,
        ang: Math.atan2(s.y, s.x) + Math.PI,
        warp: 4,
        hull: 58,
        maxHull: 58,
        fuel: 80,
        armies: 8 + (i === 0 ? 4 : 0),
        maxArmies: 14,
        torpCd: 1.2 + i * 0.2,
        mis: 2,
        state: "patrol",
        targetBody: s.home,
        huntT: 0,
        alive: true,
        flash: 0,
        gunCd: 0,
        boss: false,
        dmgMul: 1
      });
    }
  }

  function resetPlayer(g, atBody) {
    var b = atBody || g.map.earth;
    var a = b.angle + 0.4;
    g.player = {
      x: b.x + Math.cos(a) * (b.r + 26),
      y: b.y + Math.sin(a) * (b.r + 26),
      ang: a + Math.PI * 0.5,
      warp: 1,
      hull: 100,
      maxHull: 100,
      fuel: 100,
      maxFuel: 100,
      shieldsOn: false,
      shields: 80,
      maxShields: 80,
      armies: 0,
      maxArmies: 18,
      missiles: 5,
      maxMissiles: 6,
      torpCd: 0,
      phaserCd: 0,
      hyperCd: 0,
      misCd: 0,
      beamCd: 0,
      misReload: 0,
      alive: true,
      spawnT: 0,
      flash: 0,
      invuln: 1.6,
      score: (g.score || 0),
      orbitLock: null,
      orbitAng: 0,
      orbitDist: 0,
      orbitSpd: 0
    };
    applyPlayerUpgrades(g);
  }

  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed;
    if (seed == null) seed = 1983;
    seed = seed >>> 0;
    var rng = mulberry32(seed);
    var bodies = [];
    for (var i = 0; i < BODY_DEF.length; i++) bodies.push(makeBody(BODY_DEF[i], rng));
    var map = layoutBodies(bodies);
    if (opts.randomOwn) randomizeOwnership(bodies, rng);
    var g = {
      seed: seed,
      randomOwn: !!opts.randomOwn,
      rng: rng,
      bodies: bodies,
      map: map,
      projectiles: [],
      particles: [],
      time: 0,
      zoom: 1.15,
      camX: 0, camY: 0,
      mapOpen: false,
      targetId: "earth",
      targetLock: false,
      banner: "RF-1 ONLINE — INNER WORLDS HOLD",
      bannerT: 4.5,
      bannerAlert: false,
      earthWasFriend: true,
      bubbleT: 0,
      bubbleMsg: "",
      status: "WARP READY",
      outcome: null,
      hofSaved: false,
      recruitClock: 0,
      lastNearFire: 0,
      rumble: 0,
      score: 0,
      upgradeTier: 0,
      bossesSpawned: 0,
      baseZoom: 1.15
    };
    spawnEnemies(g);
    resetPlayer(g, map.earth);
    initAsteroids(g);
    g.camX = g.player.x;
    g.camY = g.player.y;
    G = g;
    try {
      localStorage.setItem(LS_SEED, String(seed));
      localStorage.setItem(LS_CFG, JSON.stringify({ seed: seed, randomOwn: !!opts.randomOwn }));
    } catch (e) {}
    bubbleEvent("Ship computer Bubble online. Advice quality: recreational.");
    g.banner = "RF-1 OVER EARTH — EUROPA STILL FREE IN THE JOVIAN DARK";
    resize();
    paintSide();
    paintHud();
  }

  function lastCfg() {
    try {
      var r = localStorage.getItem(LS_CFG);
      if (r) return JSON.parse(r);
    } catch (e) {}
    var seed = 1983;
    try {
      var s = localStorage.getItem(LS_SEED);
      if (s) seed = parseInt(s, 10) || 1983;
    } catch (e2) {}
    return { seed: seed, randomOwn: false };
  }


  /* ---------- helpers on bodies ---------- */
  function orbitBand(b) {
    return b.r + (b.kind === "star" ? 70 : b.kind === "planet" ? 28 : 20);
  }
  function orbitCaptureDist(b) {
    return orbitBand(b) + 32;
  }
  function inOrbit(ship, b) {
    if (!b || b.kind === "star") return false;
    if (ship.orbitLock === b.id) return true;
    var d = dist(ship.x, ship.y, b.x, b.y);
    return d < orbitBand(b) + 18;
  }
  function orbitBody(ship) {
    if (!ship || !ship.orbitLock || !G) return null;
    return G.map[ship.orbitLock] || null;
  }
  function breakOrbit(ship, msg) {
    if (!ship || !ship.orbitLock) return false;
    ship.orbitLock = null;
    if (msg) G.status = msg;
    return true;
  }
  function tryCaptureOrbit(ship) {
    if (!ship || !ship.alive || ship.orbitLock) return;
    var best = null, bd = 1e9, i, b, d;
    for (i = 0; i < G.bodies.length; i++) {
      b = G.bodies[i];
      if (!b || b.kind === "star") continue;
      d = dist(ship.x, ship.y, b.x, b.y);
      if (d < orbitCaptureDist(b) && d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    ship.orbitLock = best.id;
    ship.orbitAng = Math.atan2(ship.y - best.y, ship.x - best.x);
    ship.orbitDist = clamp(bd, orbitBand(best) + 8, orbitBand(best) + 22);
    ship.orbitSpd = warpSpeed(3) / Math.max(ship.orbitDist, best.r + 10);
    ship.warp = 0;
    G.status = "AUTO ORBIT — " + best.name + "  (H or warp breaks)";
  }
  function updateAutoOrbit(ship, dt) {
    var b = orbitBody(ship);
    if (!b) { ship.orbitLock = null; return false; }
    if (ship.warp > 0) { breakOrbit(ship, "ORBIT BROKEN — THRUST"); return false; }
    ship.orbitAng += ship.orbitSpd * dt;
    ship.x = b.x + Math.cos(ship.orbitAng) * ship.orbitDist;
    ship.y = b.y + Math.sin(ship.orbitAng) * ship.orbitDist;
    ship.ang = ship.orbitAng + Math.PI * 0.5;
    if (keys.arrowleft || keys.a) ship.ang -= turnRate(0) * dt;
    if (keys.arrowright || keys.d) ship.ang += turnRate(0) * dt;
    return true;
  }
  function asteroidSpeed() {
    return warpSpeed(6);
  }
  function makeAsteroidVerts(rng) {
    var n = 7 + Math.floor(rng() * 3), verts = [], i, a, rad;
    for (i = 0; i < n; i++) {
      a = (i / n) * TAU + (rng() - 0.5) * 0.5;
      rad = 0.55 + rng() * 0.45;
      verts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    return verts;
  }
  function spawnAsteroid(g, rng, nearX, nearY) {
    var ang, rad, a;
    if (nearX != null) {
      ang = rng() * TAU;
      rad = 280 + rng() * 520;
      a = {
        x: nearX + Math.cos(ang) * rad,
        y: nearY + Math.sin(ang) * rad
      };
    } else {
      ang = rng() * TAU;
      rad = 220 + rng() * 3400;
      a = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
    }
    var spd = asteroidSpeed();
    ang = rng() * TAU;
    a.vx = Math.cos(ang) * spd;
    a.vy = Math.sin(ang) * spd;
    a.tumble = rng() * TAU;
    a.tumbleSpd = (rng() - 0.5) * 2.8;
    a.verts = makeAsteroidVerts(rng);
    g.asteroids.push(a);
  }
  function initAsteroids(g) {
    g.asteroids = [];
    var i;
    for (i = 0; i < MAX_ASTEROIDS; i++) spawnAsteroid(g, g.rng);
  }
  function maintainAsteroids(g) {
    var p = g.player, i, a, d, spd, cur, scale;
    if (!g.asteroids) g.asteroids = [];
    while (g.asteroids.length < MAX_ASTEROIDS) spawnAsteroid(g, g.rng, p.x, p.y);
    for (i = g.asteroids.length - 1; i >= 0; i--) {
      a = g.asteroids[i];
      d = dist(a.x, a.y, p.x, p.y);
      if (d > 2400) {
        g.asteroids.splice(i, 1);
        spawnAsteroid(g, g.rng, p.x, p.y);
      }
    }
  }
  function updateAsteroids(dt) {
    var i, j, a, b, d, pull, spd, cur, scale, p;
    if (!G.asteroids) return;
    maintainAsteroids(G);
    for (i = 0; i < G.asteroids.length; i++) {
      a = G.asteroids[i];
      for (j = 0; j < G.bodies.length; j++) {
        b = G.bodies[j];
        if (!b || b.kind === "star") continue;
        d = dist(a.x, a.y, b.x, b.y);
        if (d < b.r + 240 && d > b.r + 4) {
          pull = (b.r * 48) / (d * d);
          a.vx += ((b.x - a.x) / d) * pull * dt;
          a.vy += ((b.y - a.y) / d) * pull * dt;
        }
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.tumble += a.tumbleSpd * dt;
      spd = asteroidSpeed();
      cur = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1;
      scale = spd / cur;
      a.vx *= scale;
      a.vy *= scale;
    }
    p = G.player;
    if (!p.alive) return;
    for (i = 0; i < G.asteroids.length; i++) {
      a = G.asteroids[i];
      if (dist(p.x, p.y, a.x, a.y) < ASTEROID_R + 11) {
        if (!p.shieldsOn || p.shields <= 0) {
          p.hull = 0;
          hitShip(p, 0, true);
          G.status = "ASTEROID IMPACT — HULL BREACH";
        } else {
          hitShip(p, 28, true);
          var dx = p.x - a.x, dy = p.y - a.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
          p.x += (dx / dd) * 14;
          p.y += (dy / dd) * 14;
          a.vx -= (dx / dd) * 10;
          a.vy -= (dy / dd) * 10;
          G.status = "ASTEROID STRIKE — SHIELDS";
        }
      }
    }
  }
  function asteroidVertsFor(i) {
    if (!asteroidVertsFor._c) asteroidVertsFor._c = [];
    if (!asteroidVertsFor._c[i]) asteroidVertsFor._c[i] = makeAsteroidVerts(mulberry32((i + 1) * 7919));
    return asteroidVertsFor._c[i];
  }
  function drawAsteroid(sx, sy, a, zoom) {
    var r = ASTEROID_R * zoom, i, v;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a.tumble);
    ctx.beginPath();
    for (i = 0; i < a.verts.length; i++) {
      v = a.verts[i];
      if (i === 0) ctx.moveTo(v[0] * r, v[1] * r);
      else ctx.lineTo(v[0] * r, v[1] * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#5a4a38";
    ctx.strokeStyle = "#2e2820";
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(90,70,55,0.35)";
    ctx.beginPath();
    ctx.arc(r * 0.15, -r * 0.2, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function nearestBody(x, y, maxD) {
    var best = null, bd = maxD || 1e9;
    if (!G) return null;
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (b.kind === "star") continue;
      var d = dist(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function nearestFriendlyPlanet(x, y) {
    var best = null, bd = 1e12;
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (b.kind !== "planet" || b.owner !== FRIEND) continue;
      var d = dist(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function countPlanets(owner) {
    var n = 0;
    for (var i = 0; i < PLANET_IDS.length; i++) {
      var b = G.map[PLANET_IDS[i]];
      if (b && b.owner === owner) n++;
    }
    return n;
  }
  function weakFriendly() {
    var best = null, score = 1e9;
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (!b.owner || b.owner !== FRIEND) continue;
      var s = b.armies * 1.4 + b.def * 2 + (b.kind === "planet" ? 0 : 4);
      if (b.battle && b.battle.side === ENEMY) s -= 8;
      if (s < score) { score = s; best = b; }
    }
    return best;
  }
  function strongestEnemyDepot() {
    var best = null, score = -1;
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (b.owner !== ENEMY) continue;
      if (b.armies <= b.minG + 1) continue;
      var s = b.armies - b.minG;
      if (s > score) { score = s; best = b; }
    }
    return best || G.map.titan;
  }

  function addParticle(list, x, y, vx, vy, life, color, size, extra) {
    var q = { kind: "spark", x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, size: size || 2 };
    if (extra) {
      var k;
      for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) q[k] = extra[k];
    }
    list.push(q);
  }
  function spawnExplosion(list, x, y, color, power) {
    power = power == null ? 1 : power;
    var blast = BLAST_SCALE;
    var i, a, s, life, n, nd;
    n = Math.floor(22 * power);
    for (i = 0; i < n; i++) {
      a = Math.random() * TAU;
      s = (12 + Math.random() * 78) * blast * (0.7 + 0.3 * power);
      life = 0.55 + Math.random() * 0.75;
      addParticle(list, x, y, Math.cos(a) * s, Math.sin(a) * s, life, color, (1.6 + Math.random() * 2.6) * blast, { kind: "spark" });
    }
    nd = Math.floor(9 * power);
    for (i = 0; i < nd; i++) {
      a = Math.random() * TAU;
      s = (8 + Math.random() * 38) * blast;
      life = 0.95 + Math.random() * 0.95;
      addParticle(list, x, y, Math.cos(a) * s, Math.sin(a) * s, life, Math.random() < 0.45 ? "#c8a070" : color, (2.2 + Math.random() * 3.2) * blast, {
        kind: "debris", rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 9
      });
    }
    addParticle(list, x, y, 0, 0, 0.32, "#fff6d0", 18 * blast * power, { kind: "flash" });
    addParticle(list, x, y, 0, 0, 0.52, "#ffe8a0", 2, { kind: "ring", r0: 4, r1: 44 * blast * power, lw: 2.4 });
    addParticle(list, x, y, 0, 0, 0.82, color, 2, { kind: "ring", r0: 8, r1: 62 * blast * power, lw: 1.35 });
  }
  function burst(x, y, n, color, spd) {
    spawnExplosion(G.particles, x, y, color, Math.max(0.4, (n || 18) / 22));
  }
  function drawParticles(list, dt, wtsFn, zoom) {
    var i, q, qs, a, rad, fade;
    for (i = list.length - 1; i >= 0; i--) {
      q = list[i];
      q.life -= dt;
      q.x += (q.vx || 0) * dt;
      q.y += (q.vy || 0) * dt;
      if (q.kind === "debris") q.rot = (q.rot || 0) + (q.spin || 0) * dt;
      if (q.kind === "spark" || q.kind === "debris") {
        q.vx *= Math.max(0, 1 - 1.55 * dt);
        q.vy *= Math.max(0, 1 - 1.55 * dt);
      }
      if (q.life <= 0) { list.splice(i, 1); continue; }
      qs = wtsFn(q.x, q.y);
      fade = q.life / (q.max || 0.01);
      ctx.globalAlpha = fade;
      if (q.kind === "ring") {
        rad = (q.r0 || 4) + ((q.r1 || 40) - (q.r0 || 4)) * (1 - fade);
        ctx.strokeStyle = q.color;
        ctx.lineWidth = (q.lw || 1.5) * Math.max(0.6, fade);
        ctx.beginPath();
        ctx.arc(qs.x, qs.y, rad * zoom, 0, TAU);
        ctx.stroke();
      } else if (q.kind === "flash") {
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(qs.x, qs.y, (q.size || 14) * zoom * (0.45 + 0.55 * fade), 0, TAU);
        ctx.fill();
      } else if (q.kind === "debris") {
        ctx.save();
        ctx.translate(qs.x, qs.y);
        ctx.rotate(q.rot || 0);
        ctx.fillStyle = q.color;
        ctx.fillRect(-(q.size || 3), -(q.size || 3) * 0.28, (q.size || 3) * 2, (q.size || 3) * 0.55);
        ctx.restore();
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(qs.x, qs.y, q.size || 2, q.size || 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  function solUpgradeMul() {
    return 1 + Math.min(5, Math.floor(((G && G.score) || 0) / 10)) * 0.1;
  }
  function applyPlayerUpgrades(g) {
    if (!g || !g.player) return;
    var p = g.player;
    var tier = Math.min(5, Math.floor((g.score || 0) / 10));
    g.upgradeTier = tier;
    var mul = 1 + tier * 0.1;
    var nf = BASE_FUEL * mul;
    var ns = BASE_SHIELDS * mul;
    var df = nf - (p.maxFuel || BASE_FUEL);
    var ds = ns - (p.maxShields || BASE_SHIELDS);
    p.maxFuel = nf;
    p.maxShields = ns;
    if (df > 0) p.fuel = Math.min(p.maxFuel, p.fuel + df);
    if (ds > 0) p.shields = Math.min(p.maxShields, p.shields + ds);
  }
  function creditSolKill(en) {
    if (!G || !en || en._scored) return;
    en._scored = true;
    G.score = (G.score || 0) + 1;
    applyPlayerUpgrades(G);
  }
  function maybeSpawnSolBoss() {
    var need = ((G.bossesSpawned || 0) + 1) * 50;
    if ((G.score || 0) < need) return;
    var nAlive = 0, i;
    for (i = 0; i < G.enemies.length; i++) if (G.enemies[i].alive && G.enemies[i].boss) nAlive++;
    if (nAlive >= 3) return;
    G.bossesSpawned = (G.bossesSpawned || 0) + 1;
    var home = G.map.titan && G.map.titan.owner === ENEMY ? G.map.titan
      : (G.map.saturn && G.map.saturn.owner === ENEMY ? G.map.saturn : strongestEnemyDepot());
    if (!home) home = G.map.titan || G.bodies[1];
    var hull = Math.round(BASE_ENEMY_HULL * 1.4);
    G.enemies.push({
      id: "BOSS-" + G.bossesSpawned,
      x: home.x + 36, y: home.y - 28,
      ang: Math.atan2(home.y, home.x) + Math.PI,
      warp: 5,
      hull: hull, maxHull: hull,
      fuel: 110, armies: 12, maxArmies: 16,
      torpCd: 0.6, mis: 3, state: "hunt", targetBody: home.id,
      huntT: 12, alive: true, flash: 0, gunCd: 0,
      boss: true, dmgMul: 1.4, _scored: false
    });
    G.banner = "MANDATE BOSS SHIP INBOUND";
    G.bannerAlert = true;
    G.bannerT = 4.5;
    G.status = "BOSS CONTACT";
    spawnExplosion(G.particles, home.x + 36, home.y - 28, "#ffb020", 0.7);
  }

  var torpSeq = 1;
  function fireTorp(ship, side, ang, spd, dmg, life) {
    G.projectiles.push({
      id: torpSeq++,
      x: ship.x + Math.cos(ang) * 14,
      y: ship.y + Math.sin(ang) * 14,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: life || 1.15,
      dmg: dmg,
      kind: "torp",
      side: side,
      owner: ship,
      target: null,
      r: 2.4
    });
  }
  function countTorps(ship) {
    var n = 0, i, pr;
    for (i = 0; i < G.projectiles.length; i++) {
      pr = G.projectiles[i];
      if (pr.kind === "torp" && pr.owner === ship) n++;
    }
    return n;
  }
  function aoeBurst(x, y, radius, dmg, side, skipShip) {
    burst(x, y, 18, "#ffe080", 70);
    var i, en, d, p, b;
    for (i = 0; i < G.enemies.length; i++) {
      en = G.enemies[i];
      if (!en.alive) continue;
      d = dist(x, y, en.x, en.y);
      if (d < radius + 10) hitShip(en, dmg * (1 - 0.4 * d / (radius + 10)), false);
    }
    p = G.player;
    if (p.alive && p !== skipShip) {
      d = dist(x, y, p.x, p.y);
      if (d < radius + 10 && side !== "player") hitShip(p, dmg * (1 - 0.4 * d / (radius + 10)), true);
    }
    for (i = 0; i < G.bodies.length; i++) {
      b = G.bodies[i];
      if (b.kind === "star" || !b.owner) continue;
      if (side === "player" && b.owner === FRIEND) continue;
      if (side !== "player" && b.owner === ENEMY) continue;
      d = dist(x, y, b.x, b.y);
      if (d < radius + b.r) bombard(b, dmg * 0.85);
    }
  }
  function detonateOwn(ship, side) {
    var any = false, i, pr;
    for (i = G.projectiles.length - 1; i >= 0; i--) {
      pr = G.projectiles[i];
      if (pr.kind !== "torp" || pr.owner !== ship) continue;
      aoeBurst(pr.x, pr.y, 56, pr.dmg, side, ship);
      G.projectiles.splice(i, 1);
      any = true;
    }
    if (any) {
      audio.noise(0.12, 0.16);
      audio.beep(90, 0.1, "sawtooth", 0.12);
      G.status = "PHOTONS DETONATED";
    }
  }
  function firePhaser(ship, side) {
    var reach = 195, half = 0.46, i, en, d, want, fall, dmg;
    G.phaserFlash = { x: ship.x, y: ship.y, ang: ship.ang, t: 0.12, reach: reach, half: half };
    audio.beep(880, 0.06, "square", 0.1);
    audio.beep(420, 0.08, "sawtooth", 0.08, 180);
    if (side === "player") {
      for (i = 0; i < G.enemies.length; i++) {
        en = G.enemies[i];
        if (!en.alive) continue;
        d = dist(ship.x, ship.y, en.x, en.y);
        if (d > reach || d < 4) continue;
        want = angTo(ship.x, ship.y, en.x, en.y);
        if (Math.abs(angNorm(want - ship.ang)) > half) continue;
        fall = 1 - 0.55 * (d / reach);
        hitShip(en, 18 * fall, false);
      }
    } else {
      var p = G.player;
      if (!p.alive) return;
      d = dist(ship.x, ship.y, p.x, p.y);
      if (d > reach || d < 4) return;
      want = angTo(ship.x, ship.y, p.x, p.y);
      if (Math.abs(angNorm(want - ship.ang)) > half) return;
      fall = 1 - 0.55 * (d / reach);
      hitShip(p, 14 * (ship.dmgMul || 1) * fall, true);
    }
  }
  function fireMissile(ship, side, target) {
    var ang = ship.ang;
    G.projectiles.push({
      x: ship.x + Math.cos(ang) * 12,
      y: ship.y + Math.sin(ang) * 12,
      vx: Math.cos(ang) * 90,
      vy: Math.sin(ang) * 90,
      life: 3.2,
      dmg: 38,
      kind: "mis",
      side: side,
      target: target,
      r: 3
    });
  }
  function fireGun(b, target) {
    var a = angTo(b.x, b.y, target.x, target.y);
    var spd = 210;
    G.projectiles.push({
      x: b.x + Math.cos(a) * (b.r + 4),
      y: b.y + Math.sin(a) * (b.r + 4),
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.9,
      dmg: 5 + b.def * 0.9,
      kind: "gun",
      side: b.owner === FRIEND ? "worldF" : "worldE",
      target: null,
      fromId: b.id,
      r: 2
    });
  }

  function hitShip(ship, dmg, isPlayer) {
    if (isPlayer && ship.invuln > 0) return;
    if (isPlayer && ship.shieldsOn && ship.shields > 0) {
      var soak = Math.min(ship.shields, dmg * 0.85);
      ship.shields -= soak;
      dmg -= soak;
      ship.flash = 0.12;
      audio.beep(220, 0.06, "square", 0.12);
    }
    if (dmg > 0) {
      ship.hull -= dmg;
      ship.flash = 0.18;
      audio.noise(0.08, 0.1);
    }
    if (isPlayer) G.rumble = Math.min(1, G.rumble + 0.25);
    if (ship.hull <= 0) {
      ship.hull = 0;
      if (ship.alive) {
        ship.alive = false;
        burst(ship.x, ship.y, 28, isPlayer ? "#7dff7a" : "#e85a4a", 80);
        audio.noise(0.35, 0.22);
        audio.beep(90, 0.4, "sawtooth", 0.2, 40);
        if (isPlayer) playerDie();
        else creditSolKill(ship);
      }
    }
  }

  function bombard(b, dmg) {
    if (b.owner !== ENEMY && b.owner !== FRIEND) return;
    if (b.kind === "star") return;
    burst(b.x, b.y, 6, "#ffb070", 30);
    if (b.def > 0) {
      b.def = Math.max(0, b.def - (0.7 + dmg * 0.04));
      G.status = b.name + " GUNS HIT";
    } else if (b.armies > 0) {
      var lost = b.armies >= 3 ? 2 : 1;
      b.armies = Math.max(0, b.armies - lost);
      G.status = b.name + " GARRISON STRUCK";
    }
  }

  function startBattle(b, side, n) {
    if (n <= 0) return;
    if (!b.battle) {
      b.battle = { side: side, atk: n, t: 0 };
    } else if (b.battle.side === side) {
      b.battle.atk += n;
    } else {
      var clash = Math.min(b.battle.atk, n);
      b.battle.atk -= clash;
      n -= clash;
      if (b.battle.atk <= 0) {
        if (n > 0) b.battle = { side: side, atk: n, t: 0 };
        else b.battle = null;
      }
    }
  }

  function tickBattle(b, dt) {
    if (!b.battle) return;
    b.battle.t += dt;
    if (b.battle.t < 0.45) return;
    b.battle.t = 0;
    var atk = b.battle.atk;
    var defN = b.armies;
    var defP = defN + b.def * 0.55;
    var atkLoss = Math.max(1, Math.round(defP * 0.16));
    var defLoss = Math.max(1, Math.round(atk * 0.2));
    b.battle.atk = Math.max(0, atk - atkLoss);
    b.armies = Math.max(0, defN - defLoss);
    if (b.armies <= 0 && b.battle.atk > 0) {
      /* fall through to capture */
    } else if (b.battle.atk <= 0) {
      if (b.armies <= 0) b.armies = 1;
      b.battle = null;
      G.banner = b.name + " HOLDS";
      G.bannerT = 2.4;
      return;
    }
    if (b.armies <= 0) {
      var winner = b.battle.side;
      var leftover = Math.max(1, b.battle.atk);
      b.owner = winner;
      b.armies = leftover;
      b.def = winner === FRIEND ? 2 : 3;
      b.battle = null;
      if (winner === FRIEND) {
        G.banner = b.name + " LIBERATED";
        G.bannerAlert = false;
        audio.beep(520, 0.12, "square", 0.2);
        audio.beep(740, 0.18, "square", 0.16);
        if (b.capital) {
          G.banner = "TITAN FALLS — THE MANDATE SEAT IS OURS";
          bubbleEvent("You took their sofa. They will be irritating about it.");
        } else {
          bubbleEvent(pick(Math.random, [
            "A world is a closet for armies. Fill it.",
            "Good. Now do that eight more times.",
            "Leave a garrison this time. I am begging in binary."
          ]));
        }
      } else {
        G.banner = b.name + " FALLS TO THE MANDATE";
        G.bannerAlert = true;
        audio.beep(160, 0.25, "sawtooth", 0.18, 70);
        if (b.id === "earth") {
          G.banner = "EARTH HAS FALLEN — THE INNER LINE IS BROKEN";
          G.bannerT = 6;
          bubbleEvent("Earth is gone. The war is not. Find a rock and bleed them.");
        }
      }
      G.bannerT = Math.max(G.bannerT, 4);
      checkOutcome();
    }
  }

  function checkOutcome() {
    if (!G || G.outcome) return;
    var fp = countPlanets(FRIEND);
    if (fp >= 9) {
      G.outcome = "win";
      endGame(true);
    } else if (fp <= 0) {
      G.outcome = "lose";
      endGame(false);
    }
  }

  function playerDie() {
    var p = G.player;
    var lost = p.armies;
    p.armies = 0;
    p.alive = false;
    p.spawnT = 2.2;
    G.banner = lost > 0
      ? "RF-1 DESTROYED — " + lost + " ARMIES LOST FOREVER"
      : "RF-1 DESTROYED — REBUILDING AT NEAREST BASE";
    G.bannerAlert = true;
    G.bannerT = 4;
    bubbleEvent(pick(Math.random, [
      "You exploded. Classic.",
      "The personnel aboard would like a word. They cannot.",
      "Respawn is not a personality.",
      "Hull 0 is a lifestyle I do not recommend."
    ]));
  }

  function respawn() {
    var p = G.player;
    var b = nearestFriendlyPlanet(p.x, p.y);
    if (!b) {
      G.outcome = "lose";
      endGame(false);
      return;
    }
    resetPlayer(G, b);
    G.player.invuln = 2.2;
    G.banner = "RF-1 REBUILT OVER " + b.name;
    G.bannerAlert = false;
    G.bannerT = 3;
    G.status = "SYSTEMS GREEN";
  }

  /* ---------- beam / dock ---------- */
  function underFire() {
    if (!G.player.alive) return true;
    if (G.lastNearFire < 0.6) return true;
    var p = G.player;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      if (dist(p.x, p.y, e.x, e.y) < 110) return true;
    }
    return false;
  }

  function orbitingBody(ship) {
    var best = null, br = 1e9, i, b, d;
    for (i = 0; i < G.bodies.length; i++) {
      b = G.bodies[i];
      if (!b.owner) continue;
      if (!inOrbit(ship, b)) continue;
      d = dist(ship.x, ship.y, b.x, b.y);
      var score = d + b.r * 0.25;
      if (score < br) { br = score; best = b; }
    }
    return best;
  }

  function tryBeam() {
    var p = G.player;
    if (p.beamCd > 0 || !p.alive) return;
    var b = orbitingBody(p);
    if (!b) {
      G.status = "NO LOCK FOR BEAM";
      return;
    }
    if (b.owner === FRIEND) {
      var canTake = Math.max(0, b.armies - b.minG);
      if (canTake <= 0) { G.status = b.name + " NEEDS GARRISON"; return; }
      if (p.armies >= p.maxArmies) { G.status = "HOLD FULL"; return; }
      var n = Math.min(4, canTake, p.maxArmies - p.armies);
      b.armies -= n;
      p.armies += n;
      p.beamCd = 0.28;
      G.status = "BEAM UP " + n + " FROM " + b.name;
      audio.beep(640, 0.07, "square", 0.12);
      audio.beep(880, 0.08, "square", 0.1);
    } else if (b.owner === ENEMY) {
      if (p.armies <= 0) { G.status = "NO ARMIES TO DROP"; return; }
      var n2 = Math.min(4, p.armies);
      p.armies -= n2;
      startBattle(b, FRIEND, n2);
      p.beamCd = 0.28;
      G.status = "DROP " + n2 + " ON " + b.name;
      G.banner = "GROUND WAR — " + b.name;
      G.bannerT = 2.5;
      audio.beep(300, 0.08, "square", 0.12);
      audio.beep(180, 0.1, "square", 0.1);
    }
  }

  /* ---------- AI ---------- */
  function steerToward(e, tx, ty, dt, wantWarp) {
    var want = angTo(e.x, e.y, tx, ty);
    var diff = angNorm(want - e.ang);
    var tr = turnRate(e.warp);
    var step = tr * dt;
    if (diff > step) e.ang += step;
    else if (diff < -step) e.ang -= step;
    else e.ang = want;
    var d = dist(e.x, e.y, tx, ty);
    if (d < 70) e.warp = Math.min(wantWarp, 3);
    else if (d < 180) e.warp = Math.min(wantWarp, 5);
    else e.warp = wantWarp;
  }

  function enemyFire(e, target, dt) {
    e.torpCd -= dt;
    var a = angTo(e.x, e.y, target.x, target.y);
    var diff = Math.abs(angNorm(a - e.ang));
    var d = dist(e.x, e.y, target.x, target.y);
    if (d < 220 && diff < 0.28 && e.torpCd <= 0) {
      fireTorp(e, "enemy", e.ang, 340, 14 * (e.dmgMul || 1), 0.95);
      e.torpCd = 1.05 + Math.random() * 0.4;
      audio.beep(180, 0.04, "square", 0.06);
    }
    if (d < 180 && diff < 0.5 && Math.random() < 0.012) {
      firePhaser(e, "enemy");
    }
    if (e.mis > 0 && d < 280 && d > 80 && diff < 0.2 && Math.random() < 0.004) {
      fireMissile(e, "enemy", target);
      e.mis--;
    }
  }

  function updateEnemy(e, dt) {
    if (!e.alive) return;
    var p = G.player;
    var dPlayer = p.alive ? dist(e.x, e.y, p.x, p.y) : 1e9;
    if (dPlayer < 240) e.huntT = 2.4;
    if (e.huntT > 0) e.huntT -= dt;

    if (e.huntT > 0 && p.alive) {
      e.state = "hunt";
      var lead = warpSpeed(p.warp) * 0.25;
      steerToward(e, p.x + Math.cos(p.ang) * lead, p.y + Math.sin(p.ang) * lead, dt, 6);
      enemyFire(e, p, dt);
    } else if (e.armies <= 1) {
      e.state = "resupply";
      var depot = strongestEnemyDepot();
      e.targetBody = depot.id;
      steerToward(e, depot.x, depot.y, dt, 7);
      if (inOrbit(e, depot) && depot.owner === ENEMY) {
        e.warp = 1;
        var can = Math.max(0, depot.armies - depot.minG);
        if (can > 0 && e.armies < e.maxArmies) {
          var n = Math.min(3, can, e.maxArmies - e.armies);
          depot.armies -= n;
          e.armies += n;
        }
      }
    } else {
      var prey = weakFriendly();
      if (!prey) {
        e.state = "patrol";
        var home = G.map[e.targetBody] || G.map.titan;
        steerToward(e, home.x + 80, home.y, dt, 4);
      } else {
        e.state = "invade";
        e.targetBody = prey.id;
        steerToward(e, prey.x, prey.y, dt, 7);
        if (inOrbit(e, prey) && prey.owner === FRIEND) {
          e.warp = 1;
          if (e.armies > 1) {
            var drop = Math.min(4, e.armies - 1);
            e.armies -= drop;
            startBattle(prey, ENEMY, drop);
            if (G.bannerT < 1) {
              G.banner = prey.name + " UNDER INVASION";
              G.bannerAlert = true;
              G.bannerT = 3;
            }
          }
          if (prey.def > 0 && Math.random() < 0.02) bombard(prey, 10);
        }
      }
    }

    var sp = warpSpeed(e.warp);
    e.x += Math.cos(e.ang) * sp * dt;
    e.y += Math.sin(e.ang) * sp * dt;
    e.flash = Math.max(0, e.flash - dt);

    if (p.alive && dist(e.x, e.y, p.x, p.y) < 16) {
      hitShip(e, 18, false);
      hitShip(p, 22, true);
      burst((e.x + p.x) / 2, (e.y + p.y) / 2, 10, "#fff0a0", 50);
    }
    if (!e.alive && !e.deadAnnounced) {
      e.deadAnnounced = true;
      G.banner = e.boss ? "BOSS DESTROYED" : (e.id + " DESTROYED");
      G.bannerT = 2;
      G.bannerAlert = false;
      e.respawn = 48;
    }
  }

  function tickEnemyRespawn(dt) {
    var alive = 0;
    var i;
    for (i = 0; i < G.enemies.length; i++) if (G.enemies[i].alive && !G.enemies[i].boss) alive++;
    for (i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.alive) continue;
      if (e.boss) continue;
      e.respawn = (e.respawn == null ? 48 : e.respawn) - dt;
      if (e.respawn <= 0 && alive < 4) {
        var home = G.map.titan.owner === ENEMY ? G.map.titan
          : (G.map.saturn.owner === ENEMY ? G.map.saturn : strongestEnemyDepot());
        if (!home || home.owner !== ENEMY) continue;
        e.alive = true;
        e.hull = e.maxHull;
        e.armies = 6;
        e.mis = 2;
        e.x = home.x + 30;
        e.y = home.y + 24;
        e.ang = 0;
        e.state = "patrol";
        e.huntT = 0;
        e.respawn = null;
        e.deadAnnounced = false;
        e._scored = false;
        alive++;
        G.status = e.id + " SORTIE FROM " + home.name;
      }
    }
  }

  /* ---------- projectiles ---------- */
  function updateProjectiles(dt) {
    var list = G.projectiles;
    for (var i = list.length - 1; i >= 0; i--) {
      var pr = list[i];
      if (pr.kind === "mis" && pr.target && pr.target.alive) {
        var want = angTo(pr.x, pr.y, pr.target.x, pr.target.y);
        var cur = Math.atan2(pr.vy, pr.vx);
        var diff = angNorm(want - cur);
        var turn = 4.2 * dt;
        if (diff > turn) cur += turn;
        else if (diff < -turn) cur -= turn;
        else cur = want;
        var spd = 160;
        pr.vx = Math.cos(cur) * spd;
        pr.vy = Math.sin(cur) * spd;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      var hit = false;

      if (pr.side === "player" || pr.side === "worldF") {
        for (var e = 0; e < G.enemies.length; e++) {
          var en = G.enemies[e];
          if (!en.alive) continue;
          if (dist(pr.x, pr.y, en.x, en.y) < 10 + pr.r) {
            hitShip(en, pr.dmg, false);
            burst(pr.x, pr.y, 8, "#ffe080", 40);
            hit = true;
            break;
          }
        }
      }
      if (!hit && (pr.side === "enemy" || pr.side === "worldE" || pr.side === "worldF")) {
        var p = G.player;
        if (p.alive && dist(pr.x, pr.y, p.x, p.y) < 11 + pr.r) {
          if (pr.side !== "worldF") {
            hitShip(p, pr.dmg, true);
            burst(pr.x, pr.y, 8, "#ff8060", 40);
            G.lastNearFire = 0;
            hit = true;
          }
        }
      }
      if (!hit && pr.side === "player") {
        for (var b = 0; b < G.bodies.length; b++) {
          var bd = G.bodies[b];
          if (bd.kind === "star") {
            if (dist(pr.x, pr.y, bd.x, bd.y) < bd.r) { hit = true; break; }
            continue;
          }
          if (bd.owner !== ENEMY) continue;
          if (dist(pr.x, pr.y, bd.x, bd.y) < bd.r + 3) {
            bombard(bd, pr.dmg);
            hit = true;
            break;
          }
        }
      }
      if (hit || pr.life <= 0) list.splice(i, 1);
    }
  }

  function updateBodies(dt) {
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (b.period > 0) b.angle += (TAU / b.period) * dt;
      if (b.parent) {
        b.x = b.parent.x + Math.cos(b.angle) * b.orbit;
        b.y = b.parent.y + Math.sin(b.angle) * b.orbit;
      } else {
        b.x = 0; b.y = 0;
      }
      if (b.owner && b.armies < b.cap && !b.battle) {
        b.recruit += dt;
        var rate = b.kind === "planet" ? 22 : 32;
        if (b.capital) rate = 18;
        if (b.recruit >= rate) {
          b.recruit = 0;
          b.armies++;
        }
      }
      if (b.battle) tickBattle(b, dt);
      if (b.def > 0 && b.owner) {
        b.gunCd -= dt;
        var interval = 1.35 * (10 / (b.def + 4));
        if (b.gunCd <= 0) {
          b.gunCd = interval;
          var p = G.player;
          if (p.alive && inOrbit(p, b) && b.owner === ENEMY) {
            fireGun(b, p);
            G.lastNearFire = 0;
            audio.beep(110, 0.05, "square", 0.05);
          }
          for (var ei = 0; ei < G.enemies.length; ei++) {
            var en = G.enemies[ei];
            if (!en.alive) continue;
            if (inOrbit(en, b) && b.owner === FRIEND) fireGun(b, en);
          }
        }
      }
    }
  }

  function updatePlayer(dt) {
    var p = G.player;
    G.lastNearFire += dt;
    if (!p.alive) {
      p.spawnT -= dt;
      if (p.spawnT <= 0) respawn();
      return;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.torpCd = Math.max(0, p.torpCd - dt);
    p.phaserCd = Math.max(0, (p.phaserCd || 0) - dt);
    p.hyperCd = Math.max(0, (p.hyperCd || 0) - dt);
    p.misCd = Math.max(0, p.misCd - dt);
    p.beamCd = Math.max(0, p.beamCd - dt);

    if (keys.arrowleft || keys.a) p.ang -= turnRate(p.warp) * dt;
    if (keys.arrowright || keys.d) p.ang += turnRate(p.warp) * dt;

    if (p.fuel <= 0) {
      p.fuel = 0;
      p.warp = 0;
      p.shieldsOn = false;
      G.status = "FUEL ZERO — IMPULSE ONLY";
    }

    if (just.h && p.orbitLock) breakOrbit(p, "ORBIT BROKEN — HYPERJUMP");

    if (!p.orbitLock) tryCaptureOrbit(p);

    var orbiting = updateAutoOrbit(p, dt);
    if (!orbiting) {
      var sp = warpSpeed(p.warp);
      p.x += Math.cos(p.ang) * sp * dt;
      p.y += Math.sin(p.ang) * sp * dt;
    }

    var burn = fuelBurn(p.warp, p.shieldsOn);
    p.fuel -= burn * dt;
    if (p.fuel < 0) p.fuel = 0;
    if (p.shieldsOn) {
      p.shields = Math.min(p.maxShields, p.shields + 6 * dt);
    }

    var near = nearestBody(p.x, p.y, 400);
    if (!G.targetLock && near) G.targetId = near.id;

    var dock = near && inOrbit(p, near) ? near : null;
    var safeDock = dock && dock.owner === FRIEND && !underFire();

    if (safeDock) {
      p.fuel = Math.min(p.maxFuel, p.fuel + 16 * dt);
      p.misReload += dt;
      if (p.misReload > 3.2 && p.missiles < p.maxMissiles) {
        p.missiles++;
        p.misReload = 0;
      }
      if (keys.r) {
        if (p.hull < p.maxHull) {
          p.hull = Math.min(p.maxHull, p.hull + 10 * dt);
          p.fuel = Math.max(0, p.fuel - 1.6 * dt);
          G.status = "REPAIRING OVER " + dock.name;
        }
        p.shields = Math.min(p.maxShields, p.shields + 12 * dt);
      } else if (p.fuel < p.maxFuel - 0.5) {
        G.status = "REFUELING OVER " + dock.name;
      }
    } else {
      p.misReload += dt * 0.22;
      if (p.misReload > 18 && p.missiles < p.maxMissiles) {
        p.missiles++;
        p.misReload = 0;
      }
    }
    if ((keys.u || keys.f) && dock && dock.owner === FRIEND && keys.u) {
      if (underFire()) G.status = "UNDER FIRE — CANNOT DOCK SYSTEMS";
      else p.fuel = Math.min(p.maxFuel, p.fuel + 22 * dt);
    }
    if (!safeDock) {
      p.fuel = Math.min(p.maxFuel, p.fuel + 0.4 * dt);
    }

    if ((just.h) && (p.hyperCd || 0) <= 0 && p.fuel >= 18) {
      breakOrbit(p);
      var hop = 132;
      p.x += Math.cos(p.ang) * hop;
      p.y += Math.sin(p.ang) * hop;
      p.fuel -= 20;
      p.hyperCd = 1.12;
      p.invuln = Math.max(p.invuln, 0.32);
      burst(p.x, p.y, 12, "#6ec8ff", 60);
      audio.warp(true);
      G.status = "HYPERJUMP";
    }

    if (keys.space && p.torpCd <= 0 && countTorps(p) < 6 && p.fuel >= 2) {
      fireTorp(p, "player", p.ang, 420, 20, 1.35);
      p.torpCd = 0.36;
      p.fuel = Math.max(0, p.fuel - 2.2);
      audio.beep(420, 0.05, "square", 0.14);
      if (dock && dock.owner === ENEMY) bombard(dock, 20);
    }
    if ((just.x || just.g) ) {
      detonateOwn(p, "player");
    }
    if ((keys.f || keys.c || pointer.right) && (p.phaserCd || 0) <= 0 && p.fuel >= 6) {
      firePhaser(p, "player");
      p.phaserCd = 0.42;
      p.fuel -= 7;
    }
    if ((just.t || just.control) && p.misCd <= 0 && p.missiles > 0) {
      var tgt = null, td = 280;
      for (var i = 0; i < G.enemies.length; i++) {
        var en = G.enemies[i];
        if (!en.alive) continue;
        var d = dist(p.x, p.y, en.x, en.y);
        if (d < td) { td = d; tgt = en; }
      }
      if (tgt) {
        fireMissile(p, "player", tgt);
        p.missiles--;
        p.misCd = 0.7;
        audio.beep(240, 0.12, "sawtooth", 0.14, 120);
      } else {
        G.status = "NO MISSILE LOCK";
      }
    }
    if (just.s) {
      p.shieldsOn = !p.shieldsOn;
      if (p.fuel <= 0) p.shieldsOn = false;
      G.status = p.shieldsOn ? "SHIELDS UP" : "SHIELDS DOWN";
      audio.beep(p.shieldsOn ? 500 : 220, 0.08, "square", 0.1);
    }
    if (keys.b) tryBeam();

    var sun = G.map.sun;
    var ds = dist(p.x, p.y, sun.x, sun.y);
    if (ds < sun.r + 18) {
      hitShip(p, 28 * dt, true);
      G.status = "THERMAL ALARM — TOO CLOSE TO SOL";
    }

  }


  /* ---------- camera / resize ---------- */
  function resize() {
    var c = el.canvas;
    var w = c.clientWidth || (c.parentElement ? c.parentElement.clientWidth - 268 : 800);
    var h = c.clientHeight || 600;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w < 40) w = 800;
    if (h < 40) h = 500;
    viewW = w;
    viewH = h;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (stars.length === 0) seedStars();
  }
  function seedStars() {
    stars = [];
    var rng = mulberry32(4242);
    for (var i = 0; i < 220; i++) {
      stars.push({
        x: rng() * 8000 - 4000,
        y: rng() * 8000 - 4000,
        s: rng() < 0.15 ? 2 : 1,
        a: 0.35 + rng() * 0.65
      });
    }
  }
  function worldToScreen(x, y) {
    return {
      x: (x - G.camX) * G.zoom + viewW * 0.5,
      y: (y - G.camY) * G.zoom + viewH * 0.5
    };
  }
  function screenToWorld(sx, sy) {
    return {
      x: (sx - viewW * 0.5) / G.zoom + G.camX,
      y: (sy - viewH * 0.5) / G.zoom + G.camY
    };
  }

  /* ---------- drawing ---------- */
  function drawShipDart(x, y, ang, col, flash, engines, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-4, -8);
    ctx.lineTo(-7, -3.2);
    ctx.lineTo(-11, -4.6);
    ctx.lineTo(-11, -1.4);
    ctx.lineTo(-7, -0.8);
    ctx.lineTo(-7, 0.8);
    ctx.lineTo(-11, 1.4);
    ctx.lineTo(-11, 4.6);
    ctx.lineTo(-7, 3.2);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fillStyle = flash ? "#f4fff0" : col;
    ctx.strokeStyle = "#d5ffd0";
    ctx.fill();
    ctx.stroke();
    if (engines) {
      ctx.fillStyle = engines;
      ctx.fillRect(-13.5, -4.2, 3.2, 2.6);
      ctx.fillRect(-13.5, 1.6, 3.2, 2.6);
    }
    ctx.restore();
  }
  function drawEnemyShip(x, y, ang, col, flash, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(2, -5);
    ctx.lineTo(-10, -7);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 7);
    ctx.lineTo(2, 5);
    ctx.closePath();
    ctx.fillStyle = flash ? "#fff0e8" : col;
    ctx.strokeStyle = "#ffc8b8";
    ctx.lineWidth = 1.3;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  function drawPlanet(b, s, mapMode) {
    var rad = Math.max(mapMode ? 3 : 2.5, b.r * (mapMode ? Math.min(G.zoom, 0.22) * 8 : G.zoom));
    if (mapMode) rad = b.kind === "planet" ? (b.id === "jupiter" ? 7 : 5) : 3;
    if (b.capital) rad += 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, TAU);
    ctx.fillStyle = b.color;
    ctx.fill();
    if (!mapMode && rad > 5) {
      var g = ctx.createRadialGradient(s.x - rad * 0.3, s.y - rad * 0.3, rad * 0.1, s.x, s.y, rad);
      g.addColorStop(0, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, TAU);
      ctx.fill();
    }
    if (b.id === "saturn" && rad > 4) {
      ctx.save();
      ctx.strokeStyle = "rgba(230,210,160,0.7)";
      ctx.lineWidth = mapMode ? 1.2 : Math.max(1, rad * 0.18);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, rad * 1.85, rad * 0.45, -0.4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    if (b.owner) {
      ctx.strokeStyle = b.owner === FRIEND ? "#5ee07a" : "#e85a4a";
      ctx.lineWidth = b.capital ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad + 3, 0, TAU);
      ctx.stroke();
    }
    if (b.battle) {
      ctx.strokeStyle = "#ffc14a";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad + 7, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (G.targetId === b.id) {
      ctx.strokeStyle = "#ffc14a";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - rad - 6, s.y - rad - 6, (rad + 6) * 2, (rad + 6) * 2);
    }
  }
  function drawSun(s, mapMode) {
    var rad = mapMode ? 8 : Math.max(6, G.map.sun.r * G.zoom);
    var g = ctx.createRadialGradient(s.x, s.y, rad * 0.2, s.x, s.y, rad * 2.4);
    g.addColorStop(0, "rgba(255,230,140,0.95)");
    g.addColorStop(0.35, "rgba(255,180,60,0.45)");
    g.addColorStop(1, "rgba(255,120,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad * 2.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffe28a";
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, TAU);
    ctx.fill();
  }

  function drawWorld(dt) {
    ctx.fillStyle = "#020503";
    ctx.fillRect(0, 0, viewW, viewH);
    var wrap = 4000;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var sx = ((st.x - G.camX * 0.15) % wrap + wrap) % wrap;
      var sy = ((st.y - G.camY * 0.15) % wrap + wrap) % wrap;
      sx = (sx / wrap) * viewW;
      sy = (sy / wrap) * viewH;
      ctx.globalAlpha = st.a;
      ctx.fillStyle = "#c8ffc4";
      ctx.fillRect(sx, sy, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    if (G.mapOpen) {
      ctx.strokeStyle = "rgba(80,140,80,0.18)";
      ctx.lineWidth = 1;
      for (var o = 0; o < G.bodies.length; o++) {
        var ob = G.bodies[o];
        if (!ob.parent || ob.parent.kind !== "star") continue;
        var c = worldToScreen(0, 0);
        ctx.beginPath();
        ctx.arc(c.x, c.y, ob.orbit * G.zoom, 0, TAU);
        ctx.stroke();
      }
    }

    for (var bi = 0; bi < G.bodies.length; bi++) {
      var b = G.bodies[bi];
      var s = worldToScreen(b.x, b.y);
      if (s.x < -80 || s.y < -80 || s.x > viewW + 80 || s.y > viewH + 80) {
        if (!G.mapOpen) continue;
      }
      if (b.kind === "star") drawSun(s, G.mapOpen);
      else drawPlanet(b, s, G.mapOpen);
      if (G.mapOpen && b.kind === "planet") {
        ctx.fillStyle = b.owner === FRIEND ? "#7dff7a" : "#e88a80";
        ctx.font = "10px Lucida Console, monospace";
        ctx.fillText(b.name, s.x + 8, s.y - 6);
      } else if (!G.mapOpen && G.zoom > 0.7 && b.kind !== "star") {
        var scr = worldToScreen(b.x, b.y);
        if (dist(G.player.x, G.player.y, b.x, b.y) < 220 / G.zoom + 80) {
          ctx.fillStyle = "rgba(180,255,180,0.75)";
          ctx.font = "10px Lucida Console, monospace";
          ctx.fillText(b.name, scr.x + b.r * G.zoom + 6, scr.y - 4);
        }
      }
    }

    for (var pi = 0; pi < G.projectiles.length; pi++) {
      var pr = G.projectiles[pi];
      var ps = worldToScreen(pr.x, pr.y);
      ctx.fillStyle = pr.kind === "mis" ? "#ffc14a" : pr.kind === "gun" ? "#ff6a4a" : "#d0ffd0";
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, pr.kind === "mis" ? 3.2 : 2.1, 0, TAU);
      ctx.fill();
      if (pr.kind === "mis") {
        ctx.strokeStyle = "rgba(255,193,74,0.5)";
        ctx.beginPath();
        ctx.moveTo(ps.x, ps.y);
        ctx.lineTo(ps.x - pr.vx * 0.04 * G.zoom, ps.y - pr.vy * 0.04 * G.zoom);
        ctx.stroke();
      }
    }

    if (G.phaserFlash && G.phaserFlash.t > 0) {
      var pf = G.phaserFlash;
      var origin = worldToScreen(pf.x, pf.y);
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(pf.ang);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(pf.reach * G.zoom, -Math.tan(pf.half) * pf.reach * G.zoom);
      ctx.lineTo(pf.reach * G.zoom, Math.tan(pf.half) * pf.reach * G.zoom);
      ctx.closePath();
      ctx.fillStyle = "rgba(180,255,160," + (0.18 * pf.t / 0.12) + ")";
      ctx.fill();
      ctx.restore();
    }

    drawParticles(G.particles, dt, worldToScreen, G.zoom);

    if (G.asteroids && !G.mapOpen) {
      for (var ai = 0; ai < G.asteroids.length; ai++) {
        var ast = G.asteroids[ai];
        var as = worldToScreen(ast.x, ast.y);
        if (as.x < -60 || as.y < -60 || as.x > viewW + 60 || as.y > viewH + 60) continue;
        if (!ast.verts) ast.verts = asteroidVertsFor(ai);
        drawAsteroid(as.x, as.y, ast, G.zoom);
      }
    }

    for (var ei = 0; ei < G.enemies.length; ei++) {
      var en = G.enemies[ei];
      if (!en.alive) continue;
      var es = worldToScreen(en.x, en.y);
      if (G.mapOpen) {
        ctx.fillStyle = "#e85a4a";
        ctx.beginPath();
        ctx.moveTo(es.x + 5, es.y);
        ctx.lineTo(es.x - 4, es.y - 4);
        ctx.lineTo(es.x - 4, es.y + 4);
        ctx.closePath();
        ctx.fill();
      } else {
        drawEnemyShip(es.x, es.y, en.ang, en.flash > 0 ? "#fff" : (en.boss ? "#ffb020" : "#c94a3a"), en.flash > 0, en.boss ? 1.4 : 1);
        if (en.boss) {
          ctx.fillStyle = "#ffc14a";
          ctx.font = "11px Lucida Console, monospace";
          ctx.fillText("BOSS", es.x + 14, es.y - 12);
        }
      }
    }

    var p = G.player;
    if (p.alive) {
      var us = worldToScreen(p.x, p.y);
      if (G.mapOpen) {
        ctx.fillStyle = "#7dff7a";
        ctx.beginPath();
        ctx.moveTo(us.x + 6, us.y);
        ctx.lineTo(us.x - 5, us.y - 4);
        ctx.lineTo(us.x - 5, us.y + 4);
        ctx.closePath();
        ctx.fill();
      } else {
        var flame = p.warp > 0 ? (p.warp >= 7 ? "#6ec8ff" : "#7dff7a") : null;
        drawShipDart(us.x, us.y, p.ang, p.flash > 0 ? "#f4fff0" : "#9dff9a", p.flash > 0, flame);
        if (p.shieldsOn && p.shields > 0) {
          ctx.strokeStyle = "rgba(110,200,255," + (0.35 + 0.25 * Math.sin(G.time * 8)) + ")";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(us.x, us.y, 18, 0, TAU);
          ctx.stroke();
        }
      }
    }

    if (!G.mapOpen) {
      ctx.strokeStyle = "rgba(80,160,80,0.35)";
      ctx.strokeRect(8, 8, viewW - 16, viewH - 16);
      ctx.fillStyle = "#5a8a5a";
      ctx.font = "10px Lucida Console, monospace";
      var secX = (p.x / 80).toFixed(1);
      var secY = (p.y / 80).toFixed(1);
      ctx.fillText("SEC " + secX + " / " + secY + "   Z " + G.zoom.toFixed(2), 14, 22);
      if (G.mapOpen === false) {
        ctx.fillText(G.mapOpen ? "" : (p.warp > 0 ? "W" + p.warp : "IMPULSE"), 14, viewH - 14);
      }
    } else {
      ctx.fillStyle = "#ffc14a";
      ctx.font = "12px Lucida Console, monospace";
      ctx.fillText("SYSTEM MAP  —  click a body   M to close   (time dilated)", 14, 22);
      var legendY = viewH - 18;
      ctx.fillStyle = "#5ee07a";
      ctx.fillText("FRIENDLY", 14, legendY);
      ctx.fillStyle = "#e85a4a";
      ctx.fillText("MANDATE", 100, legendY);
      ctx.fillStyle = "#7dff7a";
      ctx.fillText("RF-1", 190, legendY);
    }
  }

  function paintSide() {
    if (!G) { el.side.innerHTML = ""; return; }
    var b = G.map[G.targetId] || nearestBody(G.player.x, G.player.y, 1e9);
    if (!b) { el.side.innerHTML = "<h3>NO TARGET</h3>"; return; }
    var owner = !b.owner ? "—" : (b.owner === FRIEND ? "FRIENDLY" : "MANDATE");
    var oc = !b.owner ? "" : (b.owner === FRIEND ? "owner-F" : "owner-E");
    var d = dist(G.player.x, G.player.y, b.x, b.y).toFixed(0);
    var orbit = p.orbitLock ? "AUTO ORBIT" : (inOrbit(G.player, b) ? "IN ORBIT" : "RANGE " + d);
    var guns = b.def ? b.def.toFixed(1) : "0";
    var battle = "";
    if (b.battle) {
      battle = "<div class='kv'><b>GROUND WAR</b> " +
        (b.battle.side === FRIEND ? "OURS" : "MANDATE") +
        " " + b.battle.atk + " vs GAR " + b.armies + "</div>";
    }
    var cap = b.capital ? "<div class='kv'><b>SEAT</b> MANDATE CAPITAL</div>" : "";
    el.side.innerHTML =
      "<h3>PLANETARY FILE</h3>" +
      "<div class='kv'><b>" + b.name + "</b>  " + b.kind.toUpperCase() + "</div>" +
      "<div class='kv'><b>OWNER</b> <span class='" + oc + "'>" + owner + "</span></div>" +
      "<div class='kv'><b>ARMIES</b> " + (b.armies | 0) + " / " + b.cap + "</div>" +
      "<div class='kv'><b>GUNS</b> " + guns + "</div>" +
      "<div class='kv'><b>STATUS</b> " + orbit + "</div>" +
      cap + battle +
      "<div class='fact'>" + b.fact + "</div>" +
      "<div class='fact' style='margin-top:14px;color:#6a9a6a'>CLICK BODY TO LOCK<br>H or warp breaks auto-orbit<br>[ / ] RADAR ZOOM<br>M SYSTEM MAP</div>";
  }

  function bar(n, max, w) {
    var k = Math.round((n / max) * w);
    var s = "";
    for (var i = 0; i < w; i++) s += i < k ? "█" : "░";
    return s;
  }
  function paintHud() {
    if (!G) { el.hud.innerHTML = ""; return; }
    var p = G.player;
    var fuelC = p.fuel < 20 ? "warn" : "";
    var hullC = p.hull < 30 ? "warn" : "";
    var sh = p.shieldsOn ? "UP" : "DN";
    var shC = p.shieldsOn ? "ok" : "";
    var tbody = G.map[G.targetId];
    var tname = tbody ? tbody.name : "—";
    var town = tbody && tbody.owner ? (tbody.owner === FRIEND ? "FRIEND" : "MANDATE") : "";
    var fp = countPlanets(FRIEND);
    el.hud.innerHTML =
      "<div class='cell'><b>WARP</b> " + (p.warp > 0 ? p.warp : "0 IMP") + "<br><b>FUEL</b> <span class='" + fuelC + "'>" + bar(p.fuel, p.maxFuel, 10) + " " + Math.floor(p.fuel) + "</span></div>" +
      "<div class='cell'><b>HULL</b> <span class='" + hullC + "'>" + bar(p.hull, p.maxHull, 10) + " " + Math.floor(p.hull) + "</span><br><b>SHLD</b> <span class='" + shC + "'>" + sh + " " + bar(p.shields, p.maxShields, 8) + "</span></div>" +
      "<div class='cell'><b>ARMIES</b> " + p.armies + "/" + p.maxArmies + "<br><b>MISSILES</b> " + p.missiles + "/" + p.maxMissiles + "</div>" +
      "<div class='cell'><b>SCORE</b> " + (G.score || 0) + "  <b>TIER</b> T" + (G.upgradeTier || 0) + (G.upgradeTier ? " +" + (G.upgradeTier * 10) + "%" : "") + "<br><b>TGT</b> " + tname + " " + town + "  <b>TIME</b> " + fmtTime(G.time) + "  <b>WORLDS</b> " + fp + "/9<br><span style='color:#9a9'>" + G.status + "</span></div>";
    if (G.bannerT > 0) {
      el.banner.textContent = G.banner;
      el.banner.className = G.bannerAlert ? "alert" : "";
    } else {
      el.banner.textContent = "";
    }
  }

  function bubbleEvent(msg) {
    if (!settings.bubble) return;
    G.bubbleMsg = msg;
    G.bubbleT = 4.2;
    el.bubblebox.textContent = "BUBBLE: " + msg;
    el.bubblebox.classList.add("on");
  }

  /* ---------- screens / HOF ---------- */
  function loadHof() {
    try {
      var r = localStorage.getItem(LS_HOF);
      if (r) return JSON.parse(r);
    } catch (e) {}
    return [];
  }
  function saveHof(list) {
    try { localStorage.setItem(LS_HOF, JSON.stringify(list.slice(0, 10))); } catch (e) {}
  }
  function renderHof() {
    var list = loadHof().slice().sort(function (a, b) { return a.time - b.time; });
    var tb = el.hofTable.querySelector("tbody");
    tb.innerHTML = "";
    if (!list.length) {
      el.hofEmpty.style.display = "block";
      el.hofTable.style.display = "none";
      return;
    }
    el.hofEmpty.style.display = "none";
    el.hofTable.style.display = "table";
    for (var i = 0; i < list.length; i++) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + escapeHtml(list[i].name) + "</td><td>" + fmtTime(list[i].time) + "</td><td>" + (list[i].score == null ? "—" : list[i].score) + "</td><td>" + (list[i].seed || "—") + "</td>";
      tb.appendChild(tr);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function endGame(win) {
    showScreen("end");
    if (win) {
      el.endTitle.textContent = "SOLAR SYSTEM SECURED";
      el.endText.textContent = "All nine planets fly friendly colors. Time " + fmtTime(G.time) +
        ". Score " + (G.score || 0) + ". The Mandate's ring is broken. Seed " + G.seed + ".";
      el.namebox.style.display = "block";
      setTimeout(function () { el.nameIn.focus(); }, 100);
    } else {
      el.endTitle.textContent = "THE RING CLOSES";
      el.endText.textContent = "No friendly planets remain. Nowhere to rebuild. The Mandate holds the system. Time " + fmtTime(G.time) + ".";
      el.namebox.style.display = "none";
    }
  }
  function commitHof() {
    if (!G || G.outcome !== "win" || G.hofSaved) return;
    var name = (el.nameIn.value || "ANON").toUpperCase().replace(/[^A-Z0-9 \-]/g, "").slice(0, 16) || "ANON";
    var list = loadHof();
    list.push({ name: name, time: Math.floor(G.time), seed: G.seed, score: G.score || 0, at: Date.now() });
    list.sort(function (a, b) { return a.time - b.time; });
    saveHof(list);
    G.hofSaved = true;
    el.namebox.style.display = "none";
    renderHof();
    showScreen("hof");
  }

  function refreshTitleMenu() {
    var items = el.titleMenu.querySelectorAll("li");
    var last = items.length;
    items[last - 2].textContent = "[ K ] SHIP COMPUTER (BUBBLE): " + (settings.bubble ? "ON" : "OFF");
    items[last - 1].textContent = "[ N ] AUDIO: " + (settings.muted ? "OFF" : "ON");
    if (el.galaxyItem) {
      el.galaxyItem.classList.remove("disabled");
      if (LAN_OK) el.galaxyItem.textContent = "[ G ] GALAXY — LAN (this server)";
      else el.galaxyItem.textContent = "[ G ] GALAXY — INTERNET ROOM";
    }
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("sel", i === titleSel);
  }

  function toggleMap() {
    if (!G) return;
    G.mapOpen = !G.mapOpen;
    if (G.mapOpen) {
      G.playZoom = G.baseZoom || G.zoom;
    } else if (G.playZoom) {
      G.baseZoom = G.playZoom;
    } else {
      G.baseZoom = 1.15;
    }
    audio.beep(300, 0.05, "square", 0.08);
  }

  function startFrom(mode) {
    audio.resume();
    playMode = "sol";
    showScreen("game");
    if (mode === "play") newGame({ seed: 1983, randomOwn: false });
    else if (mode === "same") {
      var c = lastCfg();
      newGame({ seed: c.seed, randomOwn: !!c.randomOwn });
    } else if (mode === "rand") {
      var seed = (Date.now() ^ (Math.floor(Math.random() * 1e9))) >>> 0;
      newGame({ seed: seed, randomOwn: true });
    }
    lastTs = 0;
    requestAnimationFrame(function () {
      resize();
      if (G) { G.camX = G.player.x; G.camY = G.player.y; }
    });
  }

  function handleTitleAct(act) {
    if (act === "play") startFrom("play");
    else if (act === "same") startFrom("same");
    else if (act === "rand") startFrom("rand");
    else if (act === "galaxy") gxOpenLobby();
    else if (act === "how") showScreen("how");
    else if (act === "hof") { renderHof(); showScreen("hof"); }
    else if (act === "bubble") { settings.bubble = !settings.bubble; saveSettings(); refreshTitleMenu(); }
    else if (act === "mute") { settings.muted = !settings.muted; audio.muted = settings.muted; saveSettings(); refreshTitleMenu(); }
  }


  /* ---------- input ---------- */
  function keyName(e) {
    var k = e.key;
    if (k === " ") return "space";
    if (k.length === 1) return k.toLowerCase();
    return k.toLowerCase();
  }
  window.addEventListener("keydown", function (e) {
    audio.resume();
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") {
      if (e.key === "Escape" && el.chatin && el.chatin.classList.contains("on")) gxCloseChat();
      return;
    }
    var k = keyName(e);
    if (!keys[k]) just[k] = true;
    keys[k] = true;
    if (playMode === "galaxy" && screen === "game") { gxOnKey(e); return; }
    if (screen === "gxlobby") { gxLobbyKey(e); return; }
    if (screen === "gxend") {
      if (k === "l") {
        GX.over = false;
        if (NET.kind === "lan") gxShowRaceLobby();
        else if (NET.role === "host" && HOST.game && GX.id) {
          HOST.game.hostCmd(GX.id, "reset");
          gxShowRaceLobby();
        } else { gxShowGate(false); showScreen("gxlobby"); }
      }
      if (k === "t" || k === "escape") { gxStop(); showScreen("title"); }
      return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "space", "/", "?"].indexOf(k) >= 0) e.preventDefault();
    if ((k === "escape" || k === "p") && playMode === "sol") {
      if (screen === "game") { showScreen("paused"); e.preventDefault(); }
      else if (screen === "paused") { showScreen("game"); lastTs = 0; e.preventDefault(); }
    }
    if (screen === "title") {
      var items = el.titleMenu.querySelectorAll("li");
      if (k === "arrowdown" || k === "s" && !e.metaKey) {
        if (k === "arrowdown") { titleSel = (titleSel + 1) % items.length; refreshTitleMenu(); e.preventDefault(); }
      }
      if (k === "arrowup") { titleSel = (titleSel + items.length - 1) % items.length; refreshTitleMenu(); e.preventDefault(); }
      if (k === "enter") { handleTitleAct(items[titleSel].getAttribute("data-act")); e.preventDefault(); }
      if (k === "p") handleTitleAct("play");
      if (k === "r") handleTitleAct("rand");
      if (k === "g") handleTitleAct("galaxy");
      if (k === "h") handleTitleAct("how");
      if (k === "f") handleTitleAct("hof");
      if (k === "k") handleTitleAct("bubble");
      if (k === "n") handleTitleAct("mute");
      if (k === "s") handleTitleAct("same");
    } else if (screen === "how" || screen === "hof") {
      if (k === "escape" || k === "backspace" || k === "t" || k === "enter") showScreen("title");
    } else if (screen === "end") {
      if (el.namebox.style.display !== "none" && (k === "enter")) { commitHof(); e.preventDefault(); return; }
      if (k === "p") { startFrom("same"); }
      if (k === "r") { startFrom("rand"); }
      if (k === "f") { renderHof(); showScreen("hof"); }
      if (k === "t" && el.namebox.style.display === "none") showScreen("title");
    } else if (screen === "game" || screen === "paused") {
      if (k === "m") {
        if (screen === "paused") return;
        toggleMap();
      }
      if (k === "n") {
        settings.muted = !settings.muted;
        audio.muted = settings.muted;
        saveSettings();
        if (G) G.status = settings.muted ? "AUDIO OFF" : "AUDIO ON";
      }
      if (k === "k") {
        settings.bubble = !settings.bubble;
        saveSettings();
        G.status = settings.bubble ? "BUBBLE ON" : "BUBBLE OFF";
        if (settings.bubble) bubbleEvent("I never left. I was only quiet.");
        else { el.bubblebox.classList.remove("on"); }
      }
      if (k === "h" && screen === "game" && playMode === "sol") {
        /* H is hyperjump in combat — pause is P / ESC */
      }
      if (screen === "game") applyWarpKeys(k);
    }
  });
  window.addEventListener("keyup", function (e) {
    keys[keyName(e)] = false;
  });

  function applyWarpKeys(k) {
    if (!G || !G.player || !G.player.alive) return;
    var prevW = G.player.warp;
    if (k >= "1" && k <= "9") {
      if (G.player.fuel > 0) G.player.warp = parseInt(k, 10);
    }
    if (k === "=" || k === "+") {
      if (G.player.fuel > 0) G.player.warp = Math.min(9, G.player.warp + 1);
    }
    if (k === "-" || k === "_") {
      G.player.warp = Math.max(0, G.player.warp - 1);
    }
    if (G.player.warp !== prevW && G.player.warp > 0) audio.warp(false);
    if (!G.mapOpen) {
      if (!G.baseZoom) G.baseZoom = G.zoom || 1.15;
      if (k === "[" || k === ",") G.baseZoom = clamp(G.baseZoom * 0.82, 0.35, 2.8);
      if (k === "]" || k === ".") G.baseZoom = clamp(G.baseZoom * 1.22, 0.35, 2.8);
    }
    if (k === "l") G.targetLock = false;
  }

  el.canvas.addEventListener("mousedown", function (e) {
    var r = el.canvas.getBoundingClientRect();
    if (e.button === 2) {
      pointer.right = true;
      e.preventDefault();
      return;
    }
    clickWorld(e.clientX - r.left, e.clientY - r.top);
  });
  el.canvas.addEventListener("mouseup", function (e) {
    if (e.button === 2) pointer.right = false;
  });
  el.canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  el.canvas.addEventListener("touchstart", function (e) {
    if (!e.changedTouches[0]) return;
    var r = el.canvas.getBoundingClientRect();
    var t = e.changedTouches[0];
    clickWorld(t.clientX - r.left, t.clientY - r.top);
  }, { passive: true });

  function clickWorld(sx, sy) {
    if (playMode === "galaxy") { gxClick(sx, sy); return; }
    if (!G || (screen !== "game" && screen !== "paused")) return;
    var w = screenToWorld(sx, sy);
    var best = null, bd = 1e9;
    for (var i = 0; i < G.bodies.length; i++) {
      var b = G.bodies[i];
      if (b.kind === "star") continue;
      var d = dist(w.x, w.y, b.x, b.y);
      var lim = (b.r + 20) / Math.max(G.zoom, 0.05) * (G.mapOpen ? 4 : 1);
      if (G.mapOpen) lim = 80 / G.zoom;
      if (d < bd && d < Math.max(lim, 30 / G.zoom)) { bd = d; best = b; }
    }
    if (best) {
      G.targetId = best.id;
      G.targetLock = true;
      G.status = "LOCKED " + best.name;
      paintSide();
    }
  }

  el.titleMenu.addEventListener("click", function (e) {
    var li = e.target.closest("li");
    if (!li) return;
    handleTitleAct(li.getAttribute("data-act"));
  });
  el.titleMenu.addEventListener("mousemove", function (e) {
    var li = e.target.closest("li");
    if (!li) return;
    var items = el.titleMenu.querySelectorAll("li");
    for (var i = 0; i < items.length; i++) if (items[i] === li) titleSel = i;
    refreshTitleMenu();
  });
  document.querySelectorAll("[data-back]").forEach(function (n) {
    n.addEventListener("click", function () { gxStop(); showScreen("title"); });
  });
  el.saveName.addEventListener("click", commitHof);
  el.nameIn.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.stopPropagation(); commitHof(); }
  });
  document.querySelector("#end .menu").addEventListener("click", function (e) {
    var li = e.target.closest("li");
    if (!li) return;
    var act = li.getAttribute("data-act");
    if (act === "again") startFrom("same");
    else if (act === "rand") startFrom("rand");
    else if (act === "hof") { renderHof(); showScreen("hof"); }
    else if (act === "title") showScreen("title");
  });

  /* ---------- touch bar ---------- */
  function buildTouch() {
    var spec = [
      ["◀", "hold", "arrowleft"],
      ["▶", "hold", "arrowright"],
      ["FIRE", "tap", "space"],
      ["PHAS", "tap", "f"],
      ["DET", "tap", "x"],
      ["HOP", "tap", "h"],
      ["MIS", "tap", "t"],
      ["B", "tap", "b"],
      ["W-", "tap", "-"],
      ["W+", "tap", "+"],
      ["S", "tap", "s"],
      ["MAP", "tap", "m"]
    ];
    el.touchbar.innerHTML = "";
    spec.forEach(function (row) {
      var btn = document.createElement("button");
      btn.className = "tbtn";
      btn.type = "button";
      btn.textContent = row[0];
      var kind = row[1], code = row[2];
      function down(ev) {
        ev.preventDefault();
        audio.resume();
        document.body.classList.add("touch");
        if (kind === "hold") keys[code] = true;
        else {
          just[code] = true;
          if (code === "m" && G && screen === "game") toggleMap();
          if (code === "-" || code === "+" || (code >= "1" && code <= "9")) applyWarpKeys(code);
          if (code === "space" || code === "t" || code === "b" || code === "s" || code === "f" || code === "x" || code === "h") {
            /* consumed in update via just[] */
          }
        }
      }
      function up(ev) {
        ev.preventDefault();
        if (kind === "hold") keys[code] = false;
      }
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      el.touchbar.appendChild(btn);
    });
  }
  buildTouch();
  window.addEventListener("touchstart", function () {
    document.body.classList.add("touch");
    audio.resume();
  }, { passive: true, once: false });

  /* ---------- camera follow / map camera ---------- */
  function planetZoomWant(px, py, bodies, getR, kindKey) {
    var near = false, i, b, d, r, lim;
    if (!bodies) return 1;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (kindKey && b[kindKey] === "star") continue;
      r = getR(b);
      if (!r) continue;
      d = dist(px, py, b.x, b.y);
      lim = r + Math.max(36, r * 1.15);
      if (d < lim) { near = true; break; }
    }
    return near ? PLANET_ZOOM : 1;
  }
  function updateCamera(dt) {
    var p = G.player;
    if (G.mapOpen) {
      G.camX = lerp(G.camX, 0, 1 - Math.pow(0.001, dt));
      G.camY = lerp(G.camY, 0, 1 - Math.pow(0.001, dt));
      var want = Math.min(viewW, viewH) / (3780 * 2.15);
      G._mapZoom = want;
      G.zoom = lerp(G.zoom, want, 1 - Math.pow(0.0002, dt));
    } else {
      G.camX = lerp(G.camX, p.x, 1 - Math.pow(0.0004, dt));
      G.camY = lerp(G.camY, p.y, 1 - Math.pow(0.0004, dt));
      if (!G.baseZoom) G.baseZoom = 1.15;
      var zMul = planetZoomWant(p.x, p.y, G.bodies, function (b) { return b.r; }, "kind");
      G.zoom = lerp(G.zoom, G.baseZoom * zMul, 1 - Math.pow(0.002, dt));
    }
  }

  /* ---------- rare bubble ---------- */
  function tickBubble(dt) {
    if (G.bubbleT > 0) {
      G.bubbleT -= dt;
      if (G.bubbleT <= 0) el.bubblebox.classList.remove("on");
    }
    if (!settings.bubble) return;
    if (G.time > 8 && Math.random() < dt * 0.015 && G.bubbleT <= 0) {
      bubbleEvent(BUBBLE_LINES[Math.floor(Math.random() * BUBBLE_LINES.length)]);
    }
    if (G.player.fuel < 15 && G.player.fuel > 14.7) bubbleEvent("Fuel is a letter you write to your future corpse.");
    if (G.player.warp === 9 && Math.random() < dt * 0.04 && G.bubbleT <= 0) bubbleEvent("Warp 9. Subtle.");
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.08) dt = 0.08;
    if (playMode === "galaxy" && (screen === "game" || screen === "gxlobby")) {
      gxFrame(dt, ts);
      just = Object.create(null);
      if (G && G.phaserFlash) G.phaserFlash.t = Math.max(0, G.phaserFlash.t - dt);
      return;
    }
    if (screen !== "game" || !G) {
      if (screen === "title") {
        if (!el.titleBubble._t || nowMs() - el.titleBubble._t > 5000) {
          el.titleBubble._t = nowMs();
          if (settings.bubble) {
            el.titleBubble.textContent = "BUBBLE: " + BUBBLE_LINES[Math.floor(Math.random() * BUBBLE_LINES.length)];
          } else el.titleBubble.textContent = "";
        }
      }
      if (screen === "paused" && G) {
        drawWorld(0.016);
      }
      just = Object.create(null);
      return;
    }

    var scale = (G.mapOpen ? 0.22 : 1) * PLAY_RATE;
    var sdt = dt * scale;
    G.time += sdt;
    G.bannerT = Math.max(0, G.bannerT - dt);
    G.rumble = Math.max(0, G.rumble - dt);
    if (G.phaserFlash) G.phaserFlash.t = Math.max(0, G.phaserFlash.t - dt);

    updateBodies(sdt);
    updatePlayer(sdt);
    updateAsteroids(sdt);
    for (var i = 0; i < G.enemies.length; i++) updateEnemy(G.enemies[i], sdt);
    tickEnemyRespawn(sdt);
    updateProjectiles(sdt);
    maybeSpawnSolBoss();
    updateCamera(dt);
    tickBubble(dt);
    if (G.earthWasFriend && G.map.earth.owner !== FRIEND) {
      G.earthWasFriend = false;
    }

    if (G.rumble > 0 && !G.mapOpen) {
      G.camX += (Math.random() - 0.5) * 6 * G.rumble;
      G.camY += (Math.random() - 0.5) * 6 * G.rumble;
    }

    drawWorld(sdt);
    hudAcc += dt;
    if (hudAcc > 0.12) {
      hudAcc = 0;
      paintHud();
      paintSide();
    }
    just = Object.create(null);
  }

  window.addEventListener("resize", function () {
    resize();
    if (G && screen === "game") drawWorld(0.016);
  });


  /* ========== GALAXY (LAN, server-authoritative) ========== */
  var RACE = {
    helios: { name: "HELIOS", color: "#e8d48a", stroke: "#fff4c8", engine: "#ffe080", letter: "H" },
    veil: { name: "VEIL", color: "#3dcc5c", stroke: "#b8ffc4", engine: "#7dff7a", letter: "V" },
    spark: { name: "SPARK", color: "#3ad4d4", stroke: "#c8ffff", engine: "#6ec8ff", letter: "S" },
    mandate: { name: "MANDATE", color: "#e07038", stroke: "#ffb090", engine: "#ff8060", letter: "M" }
  };
  var GX = {
    id: null, name: "", race: null, host: false, ready: false,
    snap: null, prev: null, snapAt: 0, warp: 0,
    mapOpen: false, zoom: 1.2, baseZoom: 1.2, camX: 800, camY: 800, targetId: null, targetLock: false,
    pollH: 0, inH: 0, chatting: false, lastEv: 0, joined: false,
    banner: "", bannerT: 0, status: "CHANNEL OPEN", particles: [], fx: [],
    seq: 0, lobby: null, over: false
  };

  var PAGES_URL = "https://z3ph1rus.github.io/ringfire/";
  var MQTT_CDNS = [
    "https://unpkg.com/mqtt/dist/mqtt.min.js",
    "https://cdn.jsdelivr.net/npm/mqtt/dist/mqtt.min.js"
  ];
  var MQTT_BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt"
  ];
  var MQTT_NS = "ringfire/z3ph1rus";
  var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var NET = {
    kind: "none", role: null, code: "",
    mqtt: null, broker: "", clientId: "",
    connMap: {}, pidMap: {},
    hostAlive: false, enteredLobby: false, joinTo: 0, deadTo: 0
  };
  var HOST = { game: null, tickH: 0, lobbyH: 0, acc: 0, last: 0, lastStatePub: 0, lastStateRaw: "" };

  function pagesUrl() {
    try {
      if (location.protocol === "http:" || location.protocol === "https:") {
        var h = location.hostname;
        if (h && h !== "localhost" && h !== "127.0.0.1") {
          var path = location.pathname.replace(/index\.html$/i, "");
          if (path.charAt(path.length - 1) !== "/") path += "/";
          return location.origin + path;
        }
      }
    } catch (e) {}
    return PAGES_URL;
  }
  function makeCode() {
    var s = "", i;
    for (i = 0; i < 5; i++) s += CODE_CHARS.charAt((Math.random() * CODE_CHARS.length) | 0);
    return s;
  }
  function normCode(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }
  function mqttTopic(tail) {
    return MQTT_NS + "/" + NET.code + (tail ? "/" + tail : "");
  }
  function mqttMakeId() {
    return "rf" + Math.random().toString(36).slice(2, 10);
  }
  function netParse(data) {
    if (data == null) return null;
    if (typeof data !== "string") {
      try { data = data.toString(); } catch (e) { return null; }
    }
    if (data === "alive" || data === "dead") return data;
    try { return JSON.parse(data); } catch (e2) { return null; }
  }
  function mqttText(payload) {
    if (payload == null) return "";
    if (typeof payload === "string") return payload;
    try { return payload.toString(); } catch (e) { return ""; }
  }
  function gxNetErr(msg) {
    var n = document.getElementById("gxNetErr");
    if (n) n.textContent = msg || "";
  }
  function gxShowGate(on) {
    var g = document.getElementById("gxRoomGate");
    var r = document.getElementById("gxRaceLobby");
    if (g) g.style.display = on ? "block" : "none";
    if (r) r.style.display = on ? "none" : "block";
  }
  function gxShareLine() {
    var url = pagesUrl();
    return "Open " + url + " on EACH COMPUTER, JOIN ROOM with this code. Host tab/computer must stay open.";
  }
  function gxPaintCode() {
    var big = document.getElementById("gxCodeBig");
    var url = document.getElementById("gxShareUrl");
    if (big) big.textContent = NET.code || (NET.kind === "lan" ? "LAN" : "————");
    if (url) {
      if (NET.kind === "mqtt" && NET.code) {
        url.textContent = gxShareLine();
      } else if (NET.kind === "lan") {
        url.textContent = "Share " + ((LAN_INFO && LAN_INFO.lan) || location.origin) + "  ·  this python server  ·  same Wi-Fi";
      }
    }
  }
  function loadMqttJs(cb) {
    if (typeof mqtt !== "undefined" && mqtt && typeof mqtt.connect === "function") { cb(null); return; }
    var i = 0;
    function tryNext() {
      if (i >= MQTT_CDNS.length) { cb("could not reach matchmaking — retry"); return; }
      var s = document.createElement("script");
      s.src = MQTT_CDNS[i++];
      s.onload = function () {
        if (typeof mqtt !== "undefined" && mqtt && typeof mqtt.connect === "function") cb(null);
        else tryNext();
      };
      s.onerror = function () { tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  }
  function mqttEnd(publishDead) {
    if (NET.joinTo) { clearTimeout(NET.joinTo); NET.joinTo = 0; }
    if (NET.deadTo) { clearTimeout(NET.deadTo); NET.deadTo = 0; }
    var c = NET.mqtt;
    NET.mqtt = null;
    if (!c) {
      NET.connMap = {};
      NET.pidMap = {};
      return;
    }
    function finish() {
      try { c.end(true); } catch (e2) {}
    }
    try {
      if (publishDead && NET.role === "host" && NET.code) {
        c.publish(mqttTopic("host"), "dead", { qos: 1, retain: true }, function () { finish(); });
        setTimeout(finish, 400);
        NET.connMap = {};
        NET.pidMap = {};
        return;
      }
    } catch (e) {}
    finish();
    NET.connMap = {};
    NET.pidMap = {};
  }
  function mqttPub(topic, obj, retain, qos) {
    if (!NET.mqtt) return;
    try {
      var payload = typeof obj === "string" ? obj : JSON.stringify(obj);
      NET.mqtt.publish(topic, payload, { qos: qos == null ? 0 : qos, retain: !!retain });
    } catch (e) {}
  }
  function gxNetSend(obj) {
    if (NET.kind !== "mqtt" || !NET.clientId || !NET.code) return;
    mqttPub(mqttTopic("c/" + NET.clientId), obj, false, 1);
  }
  function gxCompactState(st) {
    if (!st || typeof st !== "object") return st;
    var out = st, k, i, p, q, pls, s;
    if ((st.ev && st.ev.length > 6) || (st.ch && st.ch.length > 6)) {
      out = {};
      for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) out[k] = st[k];
      if (st.ev && st.ev.length > 6) out.ev = st.ev.slice(-6);
      if (st.ch && st.ch.length > 6) out.ch = st.ch.slice(-6);
    }
    try {
      s = JSON.stringify(out);
      if (s.length > 14000 && out.pl) {
        if (out === st) {
          out = {};
          for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) out[k] = st[k];
        }
        pls = [];
        for (i = 0; i < out.pl.length; i++) {
          p = out.pl[i];
          if (p && p.col) {
            q = {};
            for (k in p) if (Object.prototype.hasOwnProperty.call(p, k) && k !== "col") q[k] = p[k];
            pls.push(q);
          } else pls.push(p);
        }
        out.pl = pls;
      }
    } catch (e) {}
    return out;
  }
  function gxCollectKeys() {
    return {
      l: keys.arrowleft || keys.a ? 1 : 0,
      r: keys.arrowright || keys.d ? 1 : 0,
      sp: keys.space ? 1 : 0,
      f: (keys.f || keys.c || pointer.right) ? 1 : 0,
      x: (keys.x || keys.g) ? 1 : 0,
      h: keys.h ? 1 : 0,
      b: keys.b ? 1 : 0,
      s: keys.s ? 1 : 0,
      u: keys.u ? 1 : 0,
      rp: keys.r ? 1 : 0,
      w: GX.warp
    };
  }

  function mqttConnectFirst(will, cb) {
    var idx = 0;
    function next() {
      if (idx >= MQTT_BROKERS.length) {
        cb("could not reach matchmaking — retry");
        return;
      }
      var url = MQTT_BROKERS[idx++];
      var opts = {
        clientId: NET.clientId,
        clean: true,
        connectTimeout: 7000,
        reconnectPeriod: 0,
        keepalive: 25,
        protocolVersion: 4
      };
      if (will) opts.will = will;
      var client;
      try { client = mqtt.connect(url, opts); }
      catch (e) { next(); return; }
      var settled = false;
      var to = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { client.end(true); } catch (e2) {}
        next();
      }, 8000);
      client.on("connect", function () {
        if (settled) return;
        settled = true;
        clearTimeout(to);
        try { client.options.reconnectPeriod = 4000; } catch (e3) {}
        NET.broker = url;
        cb(null, client);
      });
      client.on("error", function () {});
      client.on("close", function () {
        if (settled) return;
        settled = true;
        clearTimeout(to);
        try { client.end(true); } catch (e4) {}
        next();
      });
    }
    next();
  }
  function gxBindMqtt(client) {
    NET.mqtt = client;
    client.on("message", function (topic, payload) {
      gxMqttOnMessage(topic, mqttText(payload));
    });
    client.on("connect", function () {
      if (NET.role === "host" && NET.code) {
        mqttPub(mqttTopic("host"), "alive", true, 1);
        if (HOST.game) gxHostPushLobby();
      }
    });
  }
  function gxMqttOnMessage(topic, text) {
    if (!NET.code) return;
    var hostT = mqttTopic("host");
    var lobbyT = mqttTopic("lobby");
    var stateT = mqttTopic("state");
    var cPrefix = mqttTopic("c") + "/";
    var gPrefix = mqttTopic("g") + "/";
    if (topic === hostT) {
      if (NET.role !== "guest") return;
      if (text === "alive") {
        NET.hostAlive = true;
        if (NET.deadTo) { clearTimeout(NET.deadTo); NET.deadTo = 0; }
        if (NET.joinTo) { clearTimeout(NET.joinTo); NET.joinTo = 0; }
        if (!NET.enteredLobby) {
          NET.enteredLobby = true;
          gxShowRaceLobby();
        }
      } else if (text === "dead") {
        if (NET.enteredLobby) {
          NET.hostAlive = false;
          if (NET.deadTo) clearTimeout(NET.deadTo);
          NET.deadTo = setTimeout(function () {
            NET.deadTo = 0;
            if (!NET.hostAlive) gxGuestHostGone();
          }, 2200);
        }
      }
      return;
    }
    var msg = netParse(text);
    if (!msg || typeof msg === "string") return;
    if (NET.role === "host") {
      if (topic.indexOf(cPrefix) === 0) {
        gxHostOnData(topic.slice(cPrefix.length), msg);
      }
      return;
    }
    if (topic === lobbyT || topic === stateT || topic.indexOf(gPrefix) === 0) {
      if (msg.t === "hello" || msg.t === "lobby" || msg.t === "state" || msg.t === "joined") {
        if (!NET.enteredLobby && (msg.t === "hello" || msg.t === "lobby" || msg.t === "state")) {
          NET.hostAlive = true;
          if (NET.joinTo) { clearTimeout(NET.joinTo); NET.joinTo = 0; }
          NET.enteredLobby = true;
          gxShowRaceLobby();
        }
      }
      gxGuestOnData(msg);
    }
  }

  function gxCreateRoom() {
    gxNetErr("");
    loadMqttJs(function (err) {
      if (err) { gxNetErr(err); return; }
      gxTryHost();
    });
  }
  function gxTryHost() {
    mqttEnd(false);
    var code = makeCode();
    NET.clientId = mqttMakeId();
    NET.code = code;
    NET.kind = "mqtt";
    NET.role = "host";
    var will = { topic: mqttTopic("host"), payload: "dead", qos: 1, retain: true };
    mqttConnectFirst(will, function (err, client) {
      if (err) {
        NET.kind = "none";
        NET.role = null;
        NET.code = "";
        gxNetErr(typeof err === "string" ? err : "could not reach matchmaking — retry");
        return;
      }
      gxBindMqtt(client);
      client.subscribe(mqttTopic("c/+"), { qos: 1 }, function (subErr) {
        if (subErr) {
          gxNetErr("could not reach matchmaking — retry");
          mqttEnd(false);
          return;
        }
        HOST.game = new GalaxySim.Game();
        HOST.game.hostLocked = true;
        mqttPub(mqttTopic("host"), "alive", true, 1);
        gxShowRaceLobby();
      });
    });
  }
  function gxHostDropClient(clientId) {
    var pid = NET.connMap[clientId];
    if (pid && HOST.game) {
      HOST.game.leave(pid);
      delete NET.connMap[clientId];
      delete NET.pidMap[pid];
      gxHostPushLobby();
    }
  }
  function gxHostOnData(clientId, msg) {
    if (!msg || !HOST.game || !clientId) return;
    var j;
    if (msg.t === "join") {
      j = HOST.game.join(msg.name, msg.race, msg.id);
      if (j.ok) {
        NET.connMap[clientId] = j.id;
        NET.pidMap[j.id] = clientId;
      }
      mqttPub(mqttTopic("g/" + clientId), { t: "joined", err: j.err, id: j.id, host: !!j.host }, false, 1);
      gxHostPushLobby();
      return;
    }
    if (msg.t === "ready") {
      HOST.game.setReady(msg.id, msg.ready !== false);
      gxHostPushLobby();
      return;
    }
    if (msg.t === "input") {
      HOST.game.applyInput(msg.id, msg);
      return;
    }
    if (msg.t === "ping") {
      if (msg.id) HOST.game.touch(msg.id);
      return;
    }
    if (msg.t === "leave") {
      HOST.game.leave(msg.id);
      if (NET.connMap[clientId]) {
        delete NET.pidMap[NET.connMap[clientId]];
        delete NET.connMap[clientId];
      }
      gxHostPushLobby();
    }
  }
  function gxHostPushLobby() {
    if (!HOST.game) return;
    var L = HOST.game.lobbyJson();
    GX.lobby = L;
    if (NET.kind === "mqtt") {
      mqttPub(mqttTopic("lobby"), { t: "lobby", L: L, code: NET.code }, true, 1);
    }
    if (screen === "gxlobby") gxPaintLobby();
  }
  function gxHostPubState(st) {
    if (NET.kind !== "mqtt") return;
    var packed = gxCompactState(st);
    var raw;
    try { raw = JSON.stringify({ t: "state", st: packed }); }
    catch (e) { return; }
    if (raw === HOST.lastStateRaw && packed.p !== "O") return;
    HOST.lastStateRaw = raw;
    mqttPub(mqttTopic("state"), { t: "state", st: packed }, false, 0);
  }
  function gxStartHostLoops() {
    if (HOST.tickH) clearInterval(HOST.tickH);
    HOST.acc = 0;
    HOST.last = performance.now();
    HOST.lastStatePub = 0;
    HOST.lastStateRaw = "";
    HOST.tickH = setInterval(function () {
      if (!HOST.game || NET.role !== "host") return;
      var now = performance.now();
      HOST.acc += (now - HOST.last) / 1000;
      HOST.last = now;
      if (HOST.acc > 0.25) HOST.acc = GalaxySim.DT;
      if (HOST.game.phase === "play" && GX.id && !GX.over) {
        GX.seq++;
        var body = { id: GX.id, seq: GX.seq, keys: gxCollectKeys() };
        if (GX.pendingChat) { body.chat = GX.pendingChat; GX.pendingChat = ""; }
        HOST.game.applyInput(GX.id, body);
      } else if (HOST.game.phase === "play" && GX.id) {
        HOST.game.touch(GX.id);
      }
      var n = 0;
      while (HOST.acc >= GalaxySim.DT && n < 3) {
        HOST.game.tick();
        HOST.acc -= GalaxySim.DT;
        n++;
      }
      if (HOST.game.phase === "play" || HOST.game.phase === "over") {
        var st = HOST.game.stateJson(GX.id);
        GX.prev = GX.snap;
        GX.snap = st;
        GX.snapAt = nowMs();
        gxEatEvents(st);
        if (now - HOST.lastStatePub >= 100) {
          HOST.lastStatePub = now;
          gxHostPubState(st);
        }
        if (st.p === "O") gxShowOver(st);
      }
    }, 31);
    if (HOST.lobbyH) clearInterval(HOST.lobbyH);
    HOST.lobbyH = setInterval(function () {
      if (HOST.game && HOST.game.phase === "lobby") gxHostPushLobby();
    }, 500);
  }

  function gxJoinRoom(code) {
    code = normCode(code);
    if (code.length < 5) { gxNetErr("Type the 5-character room code."); return; }
    gxNetErr("");
    loadMqttJs(function (err) {
      if (err) { gxNetErr(err); return; }
      mqttEnd(false);
      NET.clientId = mqttMakeId();
      NET.code = code;
      NET.kind = "mqtt";
      NET.role = "guest";
      NET.hostAlive = false;
      NET.enteredLobby = false;
      mqttConnectFirst(null, function (err2, client) {
        if (err2) {
          NET.kind = "none";
          NET.role = null;
          NET.code = "";
          gxNetErr(typeof err2 === "string" ? err2 : "could not reach matchmaking — retry");
          return;
        }
        gxBindMqtt(client);
        var topics = [
          mqttTopic("host"),
          mqttTopic("lobby"),
          mqttTopic("state"),
          mqttTopic("g/" + NET.clientId)
        ];
        client.subscribe(topics, { qos: 1 }, function (subErr) {
          if (subErr) {
            gxNetErr("could not reach matchmaking — retry");
            mqttEnd(false);
            return;
          }
          if (NET.joinTo) clearTimeout(NET.joinTo);
          NET.joinTo = setTimeout(function () {
            NET.joinTo = 0;
            if (NET.enteredLobby) return;
            gxNetErr("no room with that code — is the host still on the page?");
            mqttEnd(false);
            NET.kind = "none";
            NET.role = null;
            NET.code = "";
          }, 8000);
        });
      });
    });
  }
  function gxGuestOnData(msg) {
    if (!msg) return;
    if (msg.t === "hello" || msg.t === "lobby") {
      if (msg.code) NET.code = msg.code;
      GX.lobby = msg.L;
      gxPaintCode();
      if (screen === "gxlobby") gxPaintLobby();
      if (msg.L && msg.L.phase === "play") gxEnterMatch();
      if (msg.L && msg.L.phase === "over") gxShowOver(msg.L);
      return;
    }
    if (msg.t === "joined") {
      if (msg.err) { if (el.gxHint) el.gxHint.textContent = msg.err; return; }
      GX.id = msg.id;
      GX.host = !!msg.host;
      GX.joined = true;
      if (GX._wantReady) { GX._wantReady = false; gxSendReady(true); }
      return;
    }
    if (msg.t === "state") {
      var st = msg.st;
      if (!st) return;
      if (st.p === "L" || st.phase === "lobby") {
        if (screen === "game") { GX.over = false; showScreen("gxlobby"); gxShowGate(false); }
        return;
      }
      if (screen !== "game" && st.p === "P") gxEnterMatch();
      GX.prev = GX.snap;
      GX.snap = st;
      GX.snapAt = nowMs();
      gxEatEvents(st);
      if (st.p === "O") gxShowOver(st);
    }
  }
  function gxGuestHostGone() {
    if (NET.kind !== "mqtt" || NET.role !== "guest") return;
    if (GX.over && screen === "gxend") return;
    gxShowOver({ why: "HOST LEFT", reason: "HOST LEFT" });
  }


  function gxShowRaceLobby() {
    playMode = "galaxy";
    GX.over = false;
    if (NET.kind === "mqtt" && NET.role === "host") {
      GX.host = true;
      gxStartHostLoops();
      gxHostPushLobby();
    }
    gxShowGate(false);
    gxPaintCode();
    gxPaintRaces();
    gxPaintLobby();
    showScreen("gxlobby");
    if (NET.kind === "lan") {
      if (GX.pollH) clearInterval(GX.pollH);
      GX.pollH = setInterval(gxPollLobby, 500);
      gxPollLobby();
    } else if (NET.role === "guest") {
      if (GX.pollH) clearInterval(GX.pollH);
      GX.pollH = setInterval(function () {
        if (GX.id) gxNetSend({ t: "ping", id: GX.id });
      }, 500);
    }
  }
  function gxSendReady(ready) {
    GX.ready = !!ready;
    gxPaintRaces();
    if (NET.kind === "lan") {
      fetch("/api/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: GX.id, ready: ready })
      }).then(function () { gxPollLobby(); }).catch(function () {});
      return;
    }
    if (NET.role === "host" && HOST.game) {
      HOST.game.setReady(GX.id, ready);
      gxHostPushLobby();
    } else if (NET.kind === "mqtt") {
      gxNetSend({ t: "ready", id: GX.id, ready: ready });
    }
  }


  function raceCol(o) {
    if (!o || o === "N" || o === "gun") return "#8aa08a";
    return (RACE[o] && RACE[o].color) || "#aaa";
  }
  function internetNote() {
    if (el.lanNote) {
      el.lanNote.textContent = "GALAXY: two computers, same URL. CREATE ROOM / JOIN ROOM. Live: " + PAGES_URL;
      el.lanNote.classList.remove("dim");
    }
  }
  function flashLan() { internetNote(); }
  function probeLan() {
    LAN_OK = false;
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      internetNote();
      refreshTitleMenu();
      return;
    }
    fetch("/api/info").then(function (r) { return r.json(); }).then(function (info) {
      if (info && info.game === "ringfire") {
        LAN_OK = true;
        LAN_INFO = info;
        if (el.lanNote) {
          el.lanNote.textContent = "LAN server on this origin. Share " + (info.lan || location.origin) + "  ·  or use an internet room on " + PAGES_URL;
          el.lanNote.classList.remove("dim");
        }
      } else internetNote();
      refreshTitleMenu();
    }).catch(function () {
      internetNote();
      refreshTitleMenu();
    });
  }

  function gxStop() {
    if (GX.pollH) { clearInterval(GX.pollH); GX.pollH = 0; }
    if (GX.inH) { clearInterval(GX.inH); GX.inH = 0; }
    if (HOST.tickH) { clearInterval(HOST.tickH); HOST.tickH = 0; }
    if (HOST.lobbyH) { clearInterval(HOST.lobbyH); HOST.lobbyH = 0; }
    if (NET.kind === "lan" && GX.id) {
      try {
        fetch("/api/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: GX.id }),
          keepalive: true
        }).catch(function () {});
      } catch (e) {}
    }
    if (NET.kind === "mqtt" && NET.role === "guest" && GX.id) {
      gxNetSend({ t: "leave", id: GX.id });
    }
    mqttEnd(true);
    HOST.game = null;
    NET.kind = "none";
    NET.role = null;
    NET.code = "";
    NET.clientId = "";
    NET.broker = "";
    NET.hostAlive = false;
    NET.enteredLobby = false;
    GX.id = null;
    GX.host = false;
    GX.joined = false;
    GX.ready = false;
    playMode = "sol";
  }

  function gxOpenLobby() {
    audio.resume();
    playMode = "galaxy";
    GX.ready = false;
    GX.joined = false;
    GX.over = false;
    GX.snap = null;
    GX.lobby = null;
    GX.banner = "";
    GX.id = null;
    GX.host = false;
    if (el.gName && !el.gName.value) el.gName.value = GX.name || "";
    gxPaintRaces();
    if (LAN_OK) {
      NET.kind = "lan";
      NET.role = null;
      NET.code = "";
      gxShowRaceLobby();
      return;
    }
    NET.kind = "mqtt";
    gxShowGate(true);
    gxPaintCode();
    gxNetErr("");
    showScreen("gxlobby");
  }

  function gxPaintRaces() {
    if (!el.raceGrid) return;
    var cards = el.raceGrid.querySelectorAll(".race");
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("on", cards[i].getAttribute("data-race") === GX.race);
    }
    if (el.readyBtn) {
      el.readyBtn.textContent = GX.ready ? "[ ENTER ] READY  (waiting on host)" : "[ ENTER ] READY";
    }
  }

  function gxPaintLobby() {
    var L = GX.lobby;
    var html = "";
    if (!L || !L.players || !L.players.length) html = "<span class='empty'>NO ONE ON THE CHANNEL YET.</span>";
    else {
      for (var i = 0; i < L.players.length; i++) {
        var p = L.players[i];
        var rc = RACE[p.race];
        var col = rc ? rc.color : "#8aa08a";
        html += "<div><span style='color:" + col + "'>" + escapeHtml(p.name || "?") +
          "</span>  " + (rc ? rc.name : "NO RACE") +
          (p.host ? "  HOST" : "") +
          (p.ready ? "  READY" : "  …") +
          (p.ai ? "  AI" : "") + "</div>";
      }
    }
    if (el.plist) el.plist.innerHTML = html;
    var meHost = !!(L && L.hostId && L.hostId === GX.id) || GX.host || NET.role === "host";
    if (el.hostStart) el.hostStart.style.opacity = meHost ? "1" : "0.35";
    if (el.fillAI) {
      el.fillAI.disabled = !meHost;
      if (L && typeof L.fillAI === "boolean" && el.fillAI.checked !== L.fillAI && meHost === false) {
        el.fillAI.checked = L.fillAI;
      }
    }
    gxPaintCode();
    if (el.gxHint) {
      if (NET.kind === "mqtt" && NET.code) {
        el.gxHint.textContent = "Room " + NET.code + "  ·  " + gxShareLine();
      } else {
        var url = (LAN_INFO && LAN_INFO.lan) || location.origin;
        el.gxHint.textContent = "Share " + url + "  ·  same Wi-Fi  ·  host starts the match";
      }
    }
    gxPaintRaces();
    if (L && L.phase === "play") gxEnterMatch();
    if (L && L.phase === "over") gxShowOver(L);
  }

  function gxPollLobby() {
    fetch("/api/lobby").then(function (r) { return r.json(); }).then(function (L) {
      GX.lobby = L;
      if (screen === "gxlobby") gxPaintLobby();
      else if (L.phase === "play" && playMode === "galaxy" && screen !== "game") gxEnterMatch();
    }).catch(function () {});
  }

  function gxJoin(andReady) {
    var name = (el.gName && el.gName.value) || GX.name || "ANON";
    GX.name = name;
    if (!GX.race) {
      GX.status = "PICK A RACE";
      if (el.gxHint) el.gxHint.textContent = "Pick a race before ready. Helios, Veil, Spark, or Mandate.";
      return;
    }
    function afterJoin(j) {
      if (!j || j.err) { if (el.gxHint) el.gxHint.textContent = (j && j.err) || "join failed"; return; }
      GX.id = j.id;
      GX.host = !!j.host;
      GX.joined = true;
      if (andReady) gxSendReady(true);
      else if (NET.kind === "lan") gxPollLobby();
      else if (NET.role === "host") gxHostPushLobby();
    }
    if (NET.kind === "lan") {
      fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, race: GX.race, id: GX.id })
      }).then(function (r) { return r.json(); }).then(afterJoin).catch(function () {
        if (el.gxHint) el.gxHint.textContent = "Join failed — is server.py running?";
      });
      return;
    }
    if (NET.role === "host" && HOST.game) {
      afterJoin(HOST.game.join(name, GX.race, GX.id, { host: true }));
      return;
    }
    if (NET.kind === "mqtt") {
      GX._wantReady = !!andReady;
      gxNetSend({ t: "join", name: name, race: GX.race, id: GX.id });
    }
  }

  function gxDoStart() {
    var fill = !!(el.fillAI && el.fillAI.checked);
    if (NET.kind === "lan") {
      fetch("/api/host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: GX.id, op: "start", fillAI: fill })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.err) { if (el.gxHint) el.gxHint.textContent = j.err; return; }
        gxEnterMatch();
      }).catch(function () {});
      return;
    }
    if (NET.role !== "host" || !HOST.game || !GX.id) return;
    var j = HOST.game.hostCmd(GX.id, "start", fill);
    if (j.err) { if (el.gxHint) el.gxHint.textContent = j.err; return; }
    var st0 = HOST.game.stateJson(GX.id);
    GX.prev = null;
    GX.snap = st0;
    GX.snapAt = nowMs();
    gxHostPushLobby();
    gxHostPubState(st0);
    gxEnterMatch();
  }
  function gxStartMatch() {
    if (NET.role === "guest") return;
    if (!GX.race) { if (el.gxHint) el.gxHint.textContent = "Pick a race first."; return; }
    if (NET.kind === "mqtt" && NET.role === "host") {
      if (!GX.id) gxJoin(true);
      gxDoStart();
      return;
    }
    if (!GX.id) {
      var name = (el.gName && el.gName.value) || GX.name || "ANON";
      GX.name = name;
      fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, race: GX.race, id: GX.id })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.err) { if (el.gxHint) el.gxHint.textContent = j.err; return; }
        GX.id = j.id; GX.host = !!j.host; GX.joined = true;
        return fetch("/api/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: GX.id, ready: true })
        });
      }).then(function () { GX.ready = true; gxDoStart(); }).catch(function () {});
      return;
    }
    gxDoStart();
  }

  function gxEnterMatch() {
    if (screen === "game" && playMode === "galaxy") return;
    playMode = "galaxy";
    GX.over = false;
    GX.mapOpen = false;
    GX.zoom = 1.2;
    GX.baseZoom = 1.2;
    GX.particles = [];
    GX.fx = [];
    GX.lastEv = 0;
    GX.warp = 0;
    if (GX.pollH && NET.kind === "lan") { clearInterval(GX.pollH); GX.pollH = 0; }
    showScreen("game");
    resize();
    if (el.chatlog) el.chatlog.textContent = "";
    GX.banner = "GALAXY LIVE — TAKE ALL 25";
    GX.bannerT = 4;
    if (GX.inH) { clearInterval(GX.inH); GX.inH = 0; }
    if (NET.kind === "lan") {
      if (GX.pollH) clearInterval(GX.pollH);
      GX.pollH = setInterval(gxPollState, 55);
      GX.inH = setInterval(gxPostInput, 55);
      gxPollState();
    } else if (NET.role === "guest") {
      GX.inH = setInterval(gxPostInput, 55);
    }
  }

  function gxPollState() {
    if (!GX.id) return;
    fetch("/api/state?id=" + encodeURIComponent(GX.id)).then(function (r) { return r.json(); }).then(function (st) {
      if (st.p === "L" || st.phase === "lobby") {
        if (screen === "game") { showScreen("gxlobby"); }
        return;
      }
      GX.prev = GX.snap;
      GX.snap = st;
      GX.snapAt = nowMs();
      gxEatEvents(st);
      if (st.p === "O") gxShowOver(st);
    }).catch(function () {});
  }

  function gxPostInput() {
    if (!GX.id || GX.over) return;
    GX.seq++;
    var body = { id: GX.id, seq: GX.seq, keys: gxCollectKeys() };
    if (GX.pendingChat) {
      body.chat = GX.pendingChat;
      GX.pendingChat = "";
    }
    if (NET.kind === "lan") {
      fetch("/api/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).catch(function () {});
      return;
    }
    if (NET.role === "host" && HOST.game) {
      HOST.game.applyInput(GX.id, body);
      return;
    }
    if (NET.kind === "mqtt") gxNetSend({ t: "input", id: body.id, seq: body.seq, keys: body.keys, chat: body.chat });
  }

  function gxEatEvents(st) {
    var ev = st.ev || [];
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.i <= GX.lastEv) continue;
      GX.lastEv = e.i;
      if (e.k === "ph") GX.fx.push({ k: "ph", x: e.x, y: e.y, ang: e.ang, t: 0.12 });
      if (e.k === "boom") {
        spawnExplosion(GX.particles, e.x, e.y, "#ffe080", 0.85);
        audio.noise(0.08, 0.1);
      }
      if (e.k === "hop") audio.warp(true);
      if (e.k === "die") {
        spawnExplosion(GX.particles, e.x, e.y, e.B ? "#ffb020" : "#ff8060", e.B ? 1.35 : 1.15);
        GX.banner = (e.B ? "BOSS DESTROYED" : "SHIP LOST") + (e.n ? " — " + e.n + " ARMIES GONE" : "");
        GX.bannerT = 3;
        audio.noise(0.25, 0.18);
      }
      if (e.k === "boss") {
        GX.banner = "BOSS SHIP DETECTED";
        GX.bannerT = 4;
        audio.beep(90, 0.35, "sawtooth", 0.18, 40);
      }
      if (e.k === "cap") {
        GX.banner = (e.pid || "WORLD") + " TAKEN";
        GX.bannerT = 3;
        audio.beep(520, 0.1, "square", 0.16);
      }
    }
  }

  function gxBurst(x, y, n, color, spd) {
    spawnExplosion(GX.particles, x, y, color, Math.max(0.4, (n || 16) / 22));
  }

  function gxMe(st) {
    if (!st || !st.sh) return null;
    for (var i = 0; i < st.sh.length; i++) if (st.sh[i].id === GX.id) return st.sh[i];
    return null;
  }
  function gxLerpShip(id) {
    var st = GX.snap, pr = GX.prev;
    if (!st || !st.sh) return null;
    var a = null, b = null, i;
    for (i = 0; i < st.sh.length; i++) if (st.sh[i].id === id) b = st.sh[i];
    if (pr && pr.sh) for (i = 0; i < pr.sh.length; i++) if (pr.sh[i].id === id) a = pr.sh[i];
    if (!b) return a;
    if (!a) return b;
    var span = NET.kind === "mqtt" ? 100 : 55;
    var dt = (nowMs() - GX.snapAt) / span;
    var t = clamp(dt, 0, 1);
    return {
      id: b.id, n: b.n, r: b.r,
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
      a: a.a + angNorm(b.a - a.a) * t,
      w: b.w, h: b.h, H: b.H, f: b.f, F: b.F, m: b.m, M: b.M,
      s: b.s, S: b.S, v: b.v, i: b.i, z: b.z, ai: b.ai, el: b.el,
      k: b.k, u: b.u, B: b.B, Q: b.Q
    };
  }

  function gxWTS(x, y) {
    return { x: (x - GX.camX) * GX.zoom + viewW * 0.5, y: (y - GX.camY) * GX.zoom + viewH * 0.5 };
  }
  function gxSTW(sx, sy) {
    return { x: (sx - viewW * 0.5) / GX.zoom + GX.camX, y: (sy - viewH * 0.5) / GX.zoom + GX.camY };
  }

  function gxClick(sx, sy) {
    var st = GX.snap;
    if (!st || !st.pl) return;
    var w = gxSTW(sx, sy);
    var best = null, bd = 1e9, i, b, d, lim;
    for (i = 0; i < st.pl.length; i++) {
      b = st.pl[i];
      d = dist(w.x, w.y, b.x, b.y);
      lim = GX.mapOpen ? 80 / GX.zoom : Math.max(30 / GX.zoom, b.R + 20);
      if (d < bd && d < lim) { bd = d; best = b; }
    }
    if (best) {
      GX.targetId = best.id;
      GX.targetLock = true;
      GX.status = "LOCKED " + best.n;
    }
  }

  function gxOnKey(e) {
    var k = keyName(e);
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "space"].indexOf(k) >= 0) e.preventDefault();
    if (k === "enter") { gxOpenChat(); e.preventDefault(); return true; }
    var prevW = GX.warp;
    if (k >= "1" && k <= "9") GX.warp = parseInt(k, 10);
    if (k === "=" || k === "+") GX.warp = Math.min(9, GX.warp + 1);
    if (k === "-" || k === "_") GX.warp = Math.max(0, GX.warp - 1);
    if (GX.warp !== prevW && GX.warp > 0) audio.warp(false);
    if (!GX.mapOpen) {
      if (!GX.baseZoom) GX.baseZoom = GX.zoom || 1.2;
      if (k === "[" || k === ",") GX.baseZoom = clamp(GX.baseZoom * 0.82, 0.35, 2.8);
      if (k === "]" || k === ".") GX.baseZoom = clamp(GX.baseZoom * 1.22, 0.35, 2.8);
    }
    if (k === "m") GX.mapOpen = !GX.mapOpen;
    if (k === "l") GX.targetLock = false;
    if (k === "n") { settings.muted = !settings.muted; audio.muted = settings.muted; saveSettings(); }
    if (k === "escape") { /* no pause on host clock */ }
    return true;
  }

  function gxLobbyKey(e) {
    var k = keyName(e);
    var gate = document.getElementById("gxRoomGate");
    var gateOn = gate && gate.style.display !== "none";
    if (k === "escape") { gxStop(); showScreen("title"); return true; }
    if (gateOn) {
      if (k === "c") gxCreateRoom();
      if (k === "j") {
        var inp = document.getElementById("gxJoinCode");
        gxJoinRoom(inp ? inp.value : "");
      }
      return true;
    }
    if (k === "enter") { gxJoin(true); return true; }
    if (k === "l" && (GX.host || NET.role === "host")) { gxStartMatch(); return true; }
    if (k === "1") gxPick("helios");
    if (k === "2") gxPick("veil");
    if (k === "3") gxPick("spark");
    if (k === "4") gxPick("mandate");
    return true;
  }

  function gxPick(race) {
    GX.race = race;
    GX.ready = false;
    gxPaintRaces();
  }

  function gxOpenChat() {
    if (!el.chatin || !el.chatIn) return;
    GX.chatting = true;
    el.chatin.classList.add("on");
    el.chatIn.value = "";
    setTimeout(function () { el.chatIn.focus(); }, 30);
  }
  function gxCloseChat() {
    GX.chatting = false;
    if (el.chatin) el.chatin.classList.remove("on");
  }
  function gxSendChat() {
    var t = el.chatIn ? el.chatIn.value : "";
    gxCloseChat();
    if (t && t.trim()) GX.pendingChat = t.trim().slice(0, 72);
  }

  function gxShowOver(st) {
    if (GX.over && screen === "gxend") return;
    GX.over = true;
    if (GX.inH) { clearInterval(GX.inH); GX.inH = 0; }
    var why = st.why || st.reason || "";
    var win = st.w || st.winner;
    if (el.gxendTitle) el.gxendTitle.textContent = win ? ((RACE[win] && RACE[win].name) || win) + " HOLDS THE GALAXY" : "GALAXY QUIET";
    if (el.gxendText) el.gxendText.textContent = why || (win ? "All 25 worlds fly one color." : "The host left or the channel closed.");
    showScreen("gxend");
  }

  function gxFrame(dt, ts) {
    if (screen === "gxlobby") return;
    var st = GX.snap;
    if (!st) return;
    var me = gxLerpShip(GX.id) || gxMe(st);
    if (me && me.v) {
      if (GX.mapOpen) {
        GX.camX = lerp(GX.camX, 800, 1 - Math.pow(0.001, dt));
        GX.camY = lerp(GX.camY, 800, 1 - Math.pow(0.001, dt));
        var want = Math.min(viewW, viewH) / 1780;
        GX.zoom = lerp(GX.zoom, want, 1 - Math.pow(0.0003, dt));
      } else {
        GX.camX = lerp(GX.camX, me.x, 1 - Math.pow(0.0004, dt));
        GX.camY = lerp(GX.camY, me.y, 1 - Math.pow(0.0004, dt));
        if (!GX.baseZoom) GX.baseZoom = 1.2;
        var zMul = planetZoomWant(me.x, me.y, st.pl, function (b) { return b.R; }, null);
        GX.zoom = lerp(GX.zoom, GX.baseZoom * zMul, 1 - Math.pow(0.002, dt));
      }
    }
    if (!GX.targetLock && me) {
      var nb = gxNearest(st, me.x, me.y);
      if (nb) GX.targetId = nb.id;
    }
    GX.bannerT = Math.max(0, GX.bannerT - dt);
    gxDraw(dt, st, me);
    hudAcc += dt;
    if (hudAcc > 0.1) {
      hudAcc = 0;
      gxHud(st, me);
      gxSide(st, me);
      gxChatPaint(st);
    }
  }

  function gxNearest(st, x, y) {
    var best = null, bd = 1e9, i, b, d;
    if (!st.pl) return null;
    for (i = 0; i < st.pl.length; i++) {
      b = st.pl[i];
      d = dist(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function gxDraw(dt, st, me) {
    ctx.fillStyle = "#020503";
    ctx.fillRect(0, 0, viewW, viewH);
    var wrap = 4000, i;
    for (i = 0; i < stars.length; i++) {
      var stt = stars[i];
      var sx = ((stt.x - GX.camX * 0.15) % wrap + wrap) % wrap;
      var sy = ((stt.y - GX.camY * 0.15) % wrap + wrap) % wrap;
      sx = (sx / wrap) * viewW;
      sy = (sy / wrap) * viewH;
      ctx.globalAlpha = stt.a;
      ctx.fillStyle = "#c8ffc4";
      ctx.fillRect(sx, sy, stt.s, stt.s);
    }
    ctx.globalAlpha = 1;

    if (!st.pl) return;
    for (i = 0; i < st.pl.length; i++) {
      var b = st.pl[i];
      var s = gxWTS(b.x, b.y);
      if (!GX.mapOpen && (s.x < -80 || s.y < -80 || s.x > viewW + 80 || s.y > viewH + 80)) continue;
      var rad = GX.mapOpen ? (b.k ? 6 : 4.5) : Math.max(3, b.R * GX.zoom);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, TAU);
      ctx.fillStyle = b.col || "#889";
      ctx.fill();
      ctx.strokeStyle = raceCol(b.o);
      ctx.lineWidth = b.k ? 2 : 1.3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad + 3, 0, TAU);
      ctx.stroke();
      if (b.c) {
        ctx.strokeStyle = "rgba(255,255,200,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad + 6, 0, TAU);
        ctx.stroke();
      }
      if (b.b) {
        ctx.strokeStyle = "#ffc14a";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad + 8, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (GX.targetId === b.id) {
        ctx.strokeStyle = "#ffc14a";
        ctx.strokeRect(s.x - rad - 6, s.y - rad - 6, (rad + 6) * 2, (rad + 6) * 2);
      }
      if (GX.mapOpen || (me && dist(me.x, me.y, b.x, b.y) < 240 / GX.zoom + 80)) {
        ctx.fillStyle = raceCol(b.o);
        ctx.font = "10px Lucida Console, monospace";
        ctx.fillText(b.n + (b.c ? " M" : "") + " " + b.m, s.x + rad + 5, s.y - 3);
      }
    }

    var tr = st.tr || [];
    for (i = 0; i < tr.length; i++) {
      var t = tr[i];
      var ps = gxWTS(t.x, t.y);
      ctx.fillStyle = "#d0ffd0";
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, 2.2, 0, TAU);
      ctx.fill();
    }

    for (i = GX.fx.length - 1; i >= 0; i--) {
      var pf = GX.fx[i];
      pf.t -= dt;
      if (pf.t <= 0) { GX.fx.splice(i, 1); continue; }
      if (pf.k === "ph") {
        var origin = gxWTS(pf.x, pf.y);
        ctx.save();
        ctx.translate(origin.x, origin.y);
        ctx.rotate(pf.ang);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        var reach = 195 * GX.zoom, half = 0.46;
        ctx.lineTo(reach, -Math.tan(half) * reach);
        ctx.lineTo(reach, Math.tan(half) * reach);
        ctx.closePath();
        ctx.fillStyle = "rgba(180,255,160," + (0.2 * pf.t / 0.12) + ")";
        ctx.fill();
        ctx.restore();
      }
    }

    drawParticles(GX.particles, dt, gxWTS, GX.zoom);

    var astList = st.as || [];
    if (!GX.mapOpen) {
      for (i = 0; i < astList.length; i++) {
        var ast = astList[i];
        var asp = gxWTS(ast.x, ast.y);
        if (asp.x < -60 || asp.y < -60 || asp.x > viewW + 60 || asp.y > viewH + 60) continue;
        drawAsteroid(asp.x, asp.y, { tumble: ast.a || 0, verts: asteroidVertsFor(i) }, GX.zoom);
      }
    }

    var sh = st.sh || [];
    for (i = 0; i < sh.length; i++) {
      var ship = gxLerpShip(sh[i].id);
      if (!ship || !ship.v) continue;
      var es = gxWTS(ship.x, ship.y);
      var rc = RACE[ship.r] || RACE.helios;
      if (GX.mapOpen) {
        ctx.fillStyle = rc.color;
        ctx.beginPath();
        ctx.moveTo(es.x + 6, es.y);
        ctx.lineTo(es.x - 5, es.y - 4);
        ctx.lineTo(es.x - 5, es.y + 4);
        ctx.closePath();
        ctx.fill();
      } else {
        var flame = ship.w > 0 ? rc.engine : null;
        var bscale = ship.B ? 1.4 : 1;
        var col = ship.z > 0 ? "#fff" : (ship.B ? "#ffb020" : rc.color);
        drawShipDart(es.x, es.y, ship.a, col, ship.z > 0, flame, bscale);
        if (me && ship.r === me.r && ship.id !== me.id && !ship.B) {
          ctx.strokeStyle = rc.color;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(es.x, es.y, 16, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (ship.s) {
          ctx.strokeStyle = "rgba(110,200,255,0.45)";
          ctx.beginPath();
          ctx.arc(es.x, es.y, 18 * bscale, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = ship.B ? "#ffc14a" : rc.color;
        ctx.font = ship.B ? "11px Lucida Console, monospace" : "9px Lucida Console, monospace";
        ctx.fillText((ship.B ? "BOSS " : "") + (ship.id === GX.id ? "YOU " : "") + rc.letter + " " + (ship.n || ""), es.x + 10, es.y - 10);
      }
    }

    ctx.strokeStyle = "rgba(80,160,80,0.35)";
    ctx.strokeRect(8, 8, viewW - 16, viewH - 16);
    ctx.fillStyle = "#5a8a5a";
    ctx.font = "10px Lucida Console, monospace";
    if (GX.mapOpen) {
      ctx.fillStyle = "#ffc14a";
      ctx.font = "12px Lucida Console, monospace";
      ctx.fillText("STRATEGIC MAP  M close   gold ring = Class-M", 14, 22);
      var lx = 14, ly = viewH - 18;
      ["helios", "veil", "spark", "mandate"].forEach(function (rk, idx) {
        ctx.fillStyle = RACE[rk].color;
        ctx.fillText(RACE[rk].name, lx + idx * 90, ly);
      });
      ctx.fillStyle = "#8aa08a";
      ctx.fillText("NEUTRAL", lx + 360, ly);
    } else {
      ctx.fillText("SEC " + (GX.camX / 80).toFixed(1) + " / " + (GX.camY / 80).toFixed(1) + "   Z " + GX.zoom.toFixed(2) + "   W" + GX.warp, 14, 22);
    }
  }

  function gxHud(st, me) {
    if (!me) {
      el.hud.innerHTML = "<div class='cell'>AWAITING SHIP</div>";
      return;
    }
    var rc = RACE[me.r] || RACE.helios;
    var fuelC = me.f < 20 ? "warn" : "";
    var hullC = me.h < 30 ? "warn" : "";
    var sh = me.s ? "UP" : "DN";
    var tbody = null, i;
    if (st.pl) for (i = 0; i < st.pl.length; i++) if (st.pl[i].id === GX.targetId) tbody = st.pl[i];
    var tname = tbody ? tbody.n : "—";
    var town = tbody ? (tbody.o === "N" ? "NEUTRAL" : ((RACE[tbody.o] && RACE[tbody.o].name) || "")) : "";
    var sc = st.sc || {};
    var own = sc[me.r] || 0;
    el.hud.innerHTML =
      "<div class='cell'><b>WARP</b> " + (me.w > 0 ? me.w : "0 IMP") + "<br><b>FUEL</b> <span class='" + fuelC + "'>" + bar(me.f, me.F || 100, 10) + " " + Math.floor(me.f) + "</span></div>" +
      "<div class='cell'><b>HULL</b> <span class='" + hullC + "'>" + bar(me.h, me.H || 100, 10) + " " + Math.floor(me.h) + "</span><br><b>SHLD</b> " + sh + " " + bar(me.S || 0, me.Q || 70, 8) + "</div>" +
      "<div class='cell'><b>SCORE</b> " + (me.k || 0) + "  <b>TIER</b> T" + (me.u || 0) + ((me.u || 0) ? " +" + (me.u * 10) + "%" : "") + "<br><b>ARMIES</b> " + me.m + "/" + me.M + "</div>" +
      "<div class='cell'><b>TGT</b> " + tname + " " + town + "<br><b>TIME</b> " + fmtTime(st.t || 0) + "  <b>WORLDS</b> " + own + "/25<br><span style='color:#9a9'>" + GX.status + "</span></div>";
    if (GX.bannerT > 0) {
      el.banner.textContent = GX.banner;
      el.banner.className = "";
    } else el.banner.textContent = "";
    if (el.iff) {
      el.iff.innerHTML = "<span style='color:" + rc.color + "'>IFF " + rc.name + (me.v ? "" : "  —  REBUILDING") + (me.el ? "  ELIMINATED" : "") + "</span>";
    }
  }

  function gxSide(st, me) {
    var b = null, i;
    if (st.pl) for (i = 0; i < st.pl.length; i++) if (st.pl[i].id === GX.targetId) b = st.pl[i];
    if (!b) { el.side.innerHTML = "<h3>NO TARGET</h3>"; return; }
    var oc = b.o === "N" ? "owner-N" : (b.o === "helios" ? "owner-H" : b.o === "veil" ? "owner-V" : b.o === "spark" ? "owner-S" : "owner-M");
    var owner = b.o === "N" ? "NEUTRAL (SELF-RULED)" : ((RACE[b.o] && RACE[b.o].name) || b.o);
    var d = me ? dist(me.x, me.y, b.x, b.y).toFixed(0) : "—";
    var orbit = me && me.o ? "AUTO ORBIT" : (me && dist(me.x, me.y, b.x, b.y) < b.R + 38 ? "IN ORBIT" : "RANGE " + d);
    var battle = "";
    if (b.b) battle = "<div class='kv'><b>GROUND WAR</b> " + ((RACE[b.b.s] && RACE[b.b.s].name) || b.b.s) + " " + b.b.a + " vs GAR " + b.m + "</div>";
    var sc = st.sc || {};
    var score = "";
    ["helios", "veil", "spark", "mandate"].forEach(function (rk) {
      score += "<span style='color:" + RACE[rk].color + "'>" + RACE[rk].letter + " " + (sc[rk] || 0) + "</span>  ";
    });
    score += "<span class='owner-N'>N " + (st.n || 0) + "</span>";
    el.side.innerHTML =
      "<h3>PLANETARY FILE</h3>" +
      "<div class='kv'><b>" + b.n + "</b>  " + (b.c ? "CLASS-M" : "ROCK") + (b.k ? "  SEAT" : "") + "</div>" +
      "<div class='kv'><b>OWNER</b> <span class='" + oc + "'>" + owner + "</span></div>" +
      "<div class='kv'><b>ARMIES</b> " + b.m + "</div>" +
      "<div class='kv'><b>GUNS</b> " + (b.d || 0) + "</div>" +
      "<div class='kv'><b>STATUS</b> " + orbit + "</div>" +
      battle +
      "<div class='fact' style='margin-top:12px'>" + score + "</div>" +
      "<div class='fact' style='margin-top:12px;color:#6a9a6a'>SPACE photons  F phasers<br>X detonate  H hop/break orbit  B beam<br>U refuel  M map  Enter chat</div>";
  }

  function gxChatPaint(st) {
    if (!el.chatlog) return;
    var ch = st.ch || [];
    var s = "";
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      var col = raceCol(c.r);
      s += "<div><span style='color:" + col + "'>" + escapeHtml(c.n) + "</span> " + escapeHtml(c.m) + "</div>";
    }
    el.chatlog.innerHTML = s;
  }

  function gxBind() {
    if (el.raceGrid) {
      el.raceGrid.addEventListener("click", function (e) {
        var card = e.target.closest(".race");
        if (!card) return;
        gxPick(card.getAttribute("data-race"));
      });
    }
    if (el.readyBtn) el.readyBtn.addEventListener("click", function () { gxJoin(true); });
    if (el.hostStart) el.hostStart.addEventListener("click", function () { gxStartMatch(); });
    var gxCreate = document.getElementById("gxCreate");
    var gxJoinBtn = document.getElementById("gxJoinBtn");
    var gxJoinCode = document.getElementById("gxJoinCode");
    if (gxCreate) gxCreate.addEventListener("click", function () { gxCreateRoom(); });
    if (gxJoinBtn) gxJoinBtn.addEventListener("click", function () {
      gxJoinRoom(gxJoinCode ? gxJoinCode.value : "");
    });
    if (gxJoinCode) {
      gxJoinCode.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); gxJoinRoom(gxJoinCode.value); }
        e.stopPropagation();
      });
    }
    if (el.fillAI) el.fillAI.addEventListener("change", function () {
      if (!(GX.host || NET.role === "host")) return;
      if (NET.kind === "lan") {
        if (!GX.id) return;
        fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: GX.id, op: "fill", fillAI: !!el.fillAI.checked })
        }).catch(function () {});
        return;
      }
      if (HOST.game && GX.id) {
        HOST.game.hostCmd(GX.id, "fill", !!el.fillAI.checked);
        gxHostPushLobby();
      }
    });
    if (el.gxend) {
      el.gxend.addEventListener("click", function (e) {
        var li = e.target.closest("li");
        if (!li) return;
        var act = li.getAttribute("data-act");
        if (act === "gxlobby") {
          GX.over = false;
          if (NET.kind === "lan") {
            fetch("/api/host", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: GX.id, op: "reset" })
            }).catch(function () {});
            gxShowRaceLobby();
            return;
          }
          if (NET.role === "host" && HOST.game && GX.id) {
            HOST.game.hostCmd(GX.id, "reset");
            gxShowRaceLobby();
            return;
          }
          gxShowGate(false);
          showScreen("gxlobby");
        }
        if (act === "title") { gxStop(); showScreen("title"); }
      });
    }
    if (el.chatIn) {
      el.chatIn.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); gxSendChat(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); gxCloseChat(); }
      });
    }
    if (el.gName) {
      el.gName.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); gxJoin(true); }
        e.stopPropagation();
      });
    }
  }
  gxBind();

  /* also stop mute NPE in SOL if G gone */

  refreshTitleMenu();
  showScreen("title");
  probeLan();
  requestAnimationFrame(frame);
  try {
    if (/[?&]play=1(?:&|$)/.test(location.search || "")) {
      startFrom("play");
    }
  } catch (e) {}

  window.addEventListener("beforeunload", function () {
    if (playMode === "galaxy") gxStop();
  });

  window.RINGFIRE = {
    version: "2.3",
    getG: function () { return G; },
    newGame: newGame,
    countPlanets: function () { return G ? countPlanets(FRIEND) : 0; },
    lan: function () { return LAN_OK; },
    net: function () { return { kind: NET.kind, role: NET.role, code: NET.code, broker: NET.broker }; }
  };
})();
