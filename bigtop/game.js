import * as THREE from "three";

const HS_KEY = "bubblePopBigTopHighScore";
const ACT_DURATION_MS = 30000;

const State = { TITLE: 0, PLAY: 1, GAMEOVER: 2 };

const TENT_R = 9;
const TENT_H = 7.5;
const RING_R = 5.2;
const EYE_H = 1.55;
const MOVE_SPEED = 4.2;

const viewport = document.getElementById("viewport");
const crosshair = document.getElementById("crosshair");
const hudEl = document.getElementById("hud");
const hudScore = document.getElementById("hud-score");
const hudBest = document.getElementById("hud-best");
const hudAct = document.getElementById("hud-act");
const hudLives = document.getElementById("hud-lives");
const hudCombo = document.getElementById("hud-combo");
const hudComboN = document.getElementById("hud-combo-n");
const hudMute = document.getElementById("hud-mute");
const bannerEl = document.getElementById("banner");
const overlayTitle = document.getElementById("overlay-title");
const overlayGameover = document.getElementById("overlay-gameover");
const titleBest = document.getElementById("title-best");
const goScore = document.getElementById("go-score");
const goBest = document.getElementById("go-best");

let state = State.TITLE;
let score = 0;
let highScore = 0;
let lives = 3;
let act = 1;
let actTimer = 0;
let combo = 0;
let comboTimer = 0;
let bannerTimer = 0;
let spawnAcc = 0;

let yaw = 0;
let pitch = 0;
let posX = 0;
let posZ = 0;
let keys = Object.create(null);
let lookDragging = false;
let lookStartX = 0;
let lookStartY = 0;
let lookStartYaw = 0;
let lookStartPitch = 0;
let pointerLockActive = false;
let clickDownX = 0;
let clickDownY = 0;

let audioCtx = null;
let muted = false;
let musicStarted = false;
let musicMaster = null;
let musicRaf = 0;
let musicStep = 0;
let musicNextBeat = 0;
let musicNextMelody = 0;
let musicMelodyStep = 0;

const bubbles = [];
const burstParts = [];
const raycaster = new THREE.Raycaster();
const ndcCenter = new THREE.Vector2(0, 0);

let scene;
let camera;
let renderer;
let clock;

const MELODY = [
  [523.25, 0.14],
  [659.25, 0.14],
  [783.99, 0.14],
  [659.25, 0.14],
  [587.33, 0.14],
  [659.25, 0.14],
  [783.99, 0.18],
  [698.46, 0.18],
  [659.25, 0.14],
  [587.33, 0.14],
  [523.25, 0.22],
  [0, 0.08],
];

function loadHighScore() {
  try {
    const v = localStorage.getItem(HS_KEY);
    highScore = v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  } catch (_) {
    highScore = 0;
  }
  titleBest.textContent = String(highScore);
  hudBest.textContent = String(highScore);
}

function saveHighScore() {
  try {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HS_KEY, String(highScore));
    }
  } catch (_) {}
  hudBest.textContent = String(highScore);
}

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function actSpeed() {
  return 1 + (act - 1) * 0.22;
}

function beatDuration() {
  return 0.52 / actSpeed();
}

function spawnRate() {
  return Math.max(0.32, 1.05 - act * 0.075);
}

function playTone(type, freq, t0, dur, vol, freqEnd) {
  const ac = ensureAudio();
  if (!ac || muted) return;
  if (ac.state === "suspended") ac.resume();
  const t = t0 ?? ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, freqEnd),
      t + dur
    );
  }
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function playPop(pitch) {
  playTone("sine", pitch || 520, null, 0.12, 0.14, 880);
}

function playGoldPop() {
  const ac = ensureAudio();
  if (!ac || muted) return;
  if (ac.state === "suspended") ac.resume();
  const t = ac.currentTime;
  [880, 1174.66, 1567.98, 2093].forEach((f, i) => {
    playTone("sine", f, t + i * 0.04, 0.18 - i * 0.02, 0.1 - i * 0.015);
  });
  playTone("triangle", 1760, t + 0.08, 0.25, 0.06);
}

function playGlitchPop() {
  const ac = ensureAudio();
  if (!ac || muted) return;
  if (ac.state === "suspended") ac.resume();
  const t = ac.currentTime;
  playTone("sawtooth", 120, t, 0.08, 0.1, 40);
  playTone("square", 90 + Math.random() * 30, t + 0.03, 0.12, 0.08, 55);
}

function playBad() {
  playTone("sawtooth", 90, null, 0.28, 0.12, 45);
}

function playLoseLife() {
  playBad();
  playTone("sine", 220, null, 0.35, 0.1, 110);
}

function playActFanfare() {
  const ac = ensureAudio();
  if (!ac || muted) return;
  if (ac.state === "suspended") ac.resume();
  const t = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    playTone("square", f, t + i * 0.1, 0.22, 0.12);
    playTone("triangle", f * 0.5, t + i * 0.1, 0.28, 0.08);
  });
}

function playKick(t) {
  const ac = ensureAudio();
  if (!ac || muted) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain);
  gain.connect(musicMaster || ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

function playSnare(t) {
  const ac = ensureAudio();
  if (!ac || muted) return;
  const len = 2200;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 900;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  src.connect(filt);
  filt.connect(gain);
  gain.connect(musicMaster || ac.destination);
  src.start(t);
  src.stop(t + 0.12);
}

function scheduleMusic() {
  if (!musicStarted || !audioCtx) return;
  const ac = audioCtx;
  const now = ac.currentTime;
  const bd = beatDuration();

  while (musicNextBeat < now + 0.35) {
    const beatInBar = musicStep % 4;
    const bassFreq = beatInBar % 2 === 0 ? 65.41 : 98;
    playTone("triangle", bassFreq, musicNextBeat, bd * 0.9, 0.22);
    if (beatInBar === 0 || beatInBar === 2) playKick(musicNextBeat);
    if (beatInBar === 1 || beatInBar === 3) playSnare(musicNextBeat);
    musicNextBeat += bd;
    musicStep++;
  }

  while (musicNextMelody < now + 0.35) {
    const [freq, dur] = MELODY[musicMelodyStep % MELODY.length];
    const noteDur = dur * bd;
    if (freq > 0) {
      playTone("sine", freq, musicNextMelody, noteDur, 0.08);
      playTone("square", freq * 1.002, musicNextMelody, noteDur, 0.06);
      playTone("square", freq * 0.998, musicNextMelody, noteDur * 0.95, 0.05);
    }
    musicNextMelody += noteDur;
    musicMelodyStep++;
  }

  musicRaf = requestAnimationFrame(scheduleMusic);
}

function startMusic() {
  if (musicStarted) return;
  const ac = ensureAudio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  musicStarted = true;
  musicMaster = ac.createGain();
  musicMaster.gain.value = muted ? 0 : 1;
  musicMaster.connect(ac.destination);
  musicStep = 0;
  musicMelodyStep = 0;
  musicNextBeat = ac.currentTime + 0.05;
  musicNextMelody = ac.currentTime + 0.05;
  scheduleMusic();
}

function setMusicMute() {
  if (musicMaster) {
    musicMaster.gain.setTargetAtTime(
      muted ? 0 : 1,
      audioCtx.currentTime,
      0.05
    );
  }
}

function makeStripeTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const sw = 16;
  for (let x = 0; x < c.width; x += sw) {
    ctx.fillStyle = (x / sw) % 2 === 0 ? "#c41e3a" : "#f4c430";
    ctx.fillRect(x, 0, sw, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 2);
  return tex;
}

function makeRingTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5c3d2e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function buildTent(parent) {
  const stripeTex = makeStripeTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    side: THREE.BackSide,
    roughness: 0.85,
  });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(TENT_R, TENT_R, TENT_H, 48, 1, true),
    wallMat
  );
  wall.position.y = TENT_H * 0.5;
  parent.add(wall);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(TENT_R, 2.2, 48, 1, true),
    wallMat
  );
  roof.position.y = TENT_H + 1.1;
  parent.add(roof);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, TENT_H + 1.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.3, roughness: 0.6 })
  );
  pole.position.y = (TENT_H + 1.8) * 0.5;
  parent.add(pole);

  const ringTex = makeRingTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(RING_R, 64),
    new THREE.MeshStandardMaterial({
      map: ringTex,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  parent.add(floor);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(TENT_R * 0.98, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  parent.add(ground);

  const lightColors = [0xff4466, 0x44ff88, 0xffdd44, 0x44aaff, 0xff8844];
  const rings = [4.2, 5.5, 6.8];
  rings.forEach((r, ri) => {
    const n = 14 + ri * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.3;
      const y = 3.2 + ri * 1.1;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({
          color: lightColors[(i + ri) % lightColors.length],
          emissive: lightColors[(i + ri) % lightColors.length],
          emissiveIntensity: 1.2,
        })
      );
      bulb.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      parent.add(bulb);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4),
        new THREE.MeshBasicMaterial({ color: 0x222222 })
      );
      cord.position.copy(bulb.position);
      cord.position.y += 0.2;
      parent.add(cord);
    }
  });

  scene.add(new THREE.AmbientLight(0xffeedd, 0.35));
  const spot = new THREE.PointLight(0xffaa66, 1.2, 25);
  spot.position.set(0, TENT_H - 0.5, 0);
  parent.add(spot);
  const fill = new THREE.PointLight(0x8899ff, 0.4, 20);
  fill.position.set(-3, 2, 4);
  parent.add(fill);
}

function hslColor(h) {
  const c = new THREE.Color();
  c.setHSL(h / 360, 0.75, 0.55);
  return c;
}

function createBubbleMesh(type, hue) {
  const group = new THREE.Group();
  const r = 0.22 + Math.random() * 0.28;
  group.userData = { type, hue, radius: r, wobble: Math.random() * 10, glitchPhase: 0 };

  if (type === "glitch") {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x111122,
        transparent: true,
        opacity: 0.75,
        roughness: 0.2,
        metalness: 0.6,
        clearcoat: 0.8,
      })
    );
    group.add(shell);
    const eyeGeo = new THREE.SphereGeometry(r * 0.18, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-r * 0.35, r * 0.1, r * 0.75);
    const eyeR = eyeL.clone();
    eyeR.position.x = r * 0.35;
    group.add(eyeL, eyeR);
    group.userData.eyes = [eyeL, eyeR];
  } else if (type === "gold") {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.55,
        roughness: 0.05,
        metalness: 0.85,
        clearcoat: 1,
        transmission: 0.35,
        ior: 1.4,
      })
    );
    group.add(shell);
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(r * 0.35, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfff8c0,
        emissive: 0xffcc00,
        emissiveIntensity: 0.5,
        metalness: 0.9,
      })
    );
    group.add(star);
  } else {
    const col = hslColor(hue);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 32),
      new THREE.MeshPhysicalMaterial({
        color: col,
        transparent: true,
        opacity: 0.42,
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1,
        transmission: 0.92,
        thickness: 0.5,
        ior: 1.33,
        reflectivity: 1,
      })
    );
    group.add(shell);
    const highlight = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.25, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      })
    );
    highlight.position.set(-r * 0.35, r * 0.35, r * 0.6);
    group.add(highlight);
  }

  group.userData.hitMesh = group.children[0];
  return group;
}

function randomBubbleColor() {
  const hues = [0, 30, 200, 280, 120, 320];
  return hues[(Math.random() * hues.length) | 0];
}

function spawnBubble() {
  const typeRoll = Math.random();
  let type = "normal";
  if (typeRoll < 0.08 + act * 0.01) type = "glitch";
  else if (typeRoll < 0.22) type = "gold";

  const hue = type === "normal" ? randomBubbleColor() : 0;
  const mesh = createBubbleMesh(type, hue);
  const ang = Math.random() * Math.PI * 2;
  const dist = 1.5 + Math.random() * (RING_R - 1);
  mesh.position.set(
    posX + Math.cos(ang) * dist,
    1 + Math.random() * (TENT_H - 2),
    posZ + Math.sin(ang) * dist
  );

  const sp = actSpeed();
  mesh.userData.vel = new THREE.Vector3(
    (Math.random() - 0.5) * 0.8 * sp,
    (Math.random() - 0.5) * 0.4 * sp,
    (Math.random() - 0.5) * 0.8 * sp
  );
  scene.add(mesh);
  bubbles.push(mesh);
}

function burstAt(pos, hue, n) {
  const col = typeof hue === "number" ? hslColor(hue) : new THREE.Color(hue || 0xffd700);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.05, 6, 6),
      new THREE.MeshBasicMaterial({
        color: col.clone().offsetHSL((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.1),
        transparent: true,
        opacity: 1,
      })
    );
    m.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI;
    const sp = 1.5 + Math.random() * 3.5;
    m.userData = {
      vel: new THREE.Vector3(
        Math.sin(b) * Math.cos(a) * sp,
        Math.cos(b) * sp + 0.5,
        Math.sin(b) * Math.sin(a) * sp
      ),
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
    };
    scene.add(m);
    burstParts.push(m);
  }
}

function removeBubble(idx) {
  const b = bubbles[idx];
  scene.remove(b);
  bubbles.splice(idx, 1);
}

function popBubble(idx) {
  const b = bubbles[idx];
  const ud = b.userData;
  const p = b.position.clone();
  removeBubble(idx);

  if (ud.type === "glitch") {
    playGlitchPop();
    burstAt(p, 0xff0044, 16);
    return;
  }

  let pts = 10 + act * 2;
  if (ud.type === "gold") {
    combo = Math.min(combo + 1, 12);
    comboTimer = 2.5;
    pts = 50 + combo * 15;
    playGoldPop();
    burstAt(p, 45, 22);
  } else {
    comboTimer = Math.max(comboTimer - 0.1, 0);
    if (comboTimer <= 0) combo = 0;
    playPop(400 + ud.hue);
    burstAt(p, ud.hue, 18);
  }
  score += pts;
  updateHud();
}

function tryPopRaycast() {
  if (state !== State.PLAY) return;
  raycaster.setFromCamera(ndcCenter, camera);
  const hits = [];
  for (let i = 0; i < bubbles.length; i++) {
    const hm = bubbles[i].userData.hitMesh;
    if (hm) hits.push({ mesh: hm, idx: i, bubble: bubbles[i] });
  }
  const meshes = hits.map((h) => h.mesh);
  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length) {
    const hit = intersects[0].object;
    const found = hits.find((h) => h.mesh === hit);
    if (found) popBubble(found.idx);
  }
}

function showActBanner() {
  act++;
  bannerEl.textContent = "ACT " + act + "!";
  bannerEl.classList.remove("hidden");
  bannerTimer = 2.8;
  playActFanfare();
  burstAt(new THREE.Vector3(posX, 3, posZ), 0xffd700, 30);
  updateHud();
}

function resetGame() {
  score = 0;
  lives = 3;
  act = 1;
  actTimer = 0;
  combo = 0;
  comboTimer = 0;
  bannerTimer = 0;
  spawnAcc = 0;
  posX = 0;
  posZ = 0;
  yaw = 0;
  pitch = 0;
  while (bubbles.length) removeBubble(0);
  while (burstParts.length) {
    scene.remove(burstParts.pop());
  }
  bannerEl.classList.add("hidden");
  updateHud();
  updateCamera();
}

function startPlay() {
  resetGame();
  state = State.PLAY;
  overlayTitle.classList.add("hidden");
  overlayGameover.classList.add("hidden");
  hudEl.classList.remove("hidden");
  crosshair.classList.remove("title-mode", "gameover-mode");
  startMusic();
}

function gameOver() {
  state = State.GAMEOVER;
  saveHighScore();
  goScore.textContent = String(score);
  goBest.textContent = String(highScore);
  overlayGameover.classList.remove("hidden");
  crosshair.classList.add("gameover-mode");
  playBad();
}

function updateHud() {
  hudScore.textContent = String(score);
  hudAct.textContent = String(act);
  hudLives.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = "life-dot" + (i < lives ? "" : " dead");
    hudLives.appendChild(d);
  }
  if (combo > 1) {
    hudCombo.classList.remove("hidden");
    hudComboN.textContent = String(combo);
  } else {
    hudCombo.classList.add("hidden");
  }
  hudMute.classList.toggle("hidden", !muted);
}

function updateCamera() {
  camera.position.set(posX, EYE_H, posZ);
  const cy = Math.cos(pitch);
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function clampMove() {
  const d = Math.hypot(posX, posZ);
  if (d > RING_R - 0.5) {
    const s = (RING_R - 0.5) / d;
    posX *= s;
    posZ *= s;
  }
}

function updatePlay(dt) {
  actTimer += dt;
  if (actTimer >= ACT_DURATION_MS / 1000) {
    actTimer = 0;
    showActBanner();
  }
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.add("hidden");
  }
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      updateHud();
    }
  }

  let mx = 0;
  let mz = 0;
  if (keys.ArrowLeft || keys.KeyA) mx -= 1;
  if (keys.ArrowRight || keys.KeyD) mx += 1;
  if (keys.ArrowUp || keys.KeyW) mz -= 1;
  if (keys.ArrowDown || keys.KeyS) mz += 1;
  if (mx || mz) {
    const len = Math.hypot(mx, mz) || 1;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    posX += ((right.x * mx) / len + (fwd.x * mz) / len) * MOVE_SPEED * dt;
    posZ += ((right.z * mx) / len + (fwd.z * mz) / len) * MOVE_SPEED * dt;
    clampMove();
  }

  spawnAcc += dt;
  while (spawnAcc >= spawnRate()) {
    spawnAcc -= spawnRate();
    if (bubbles.length < 40) spawnBubble();
  }

  const playerPos = new THREE.Vector3(posX, EYE_H, posZ);

  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    const ud = b.userData;
    ud.wobble += dt * 2;
    const wob = Math.sin(ud.wobble) * 0.15;
    b.position.x += (ud.vel.x + wob) * dt;
    b.position.y += ud.vel.y * dt;
    b.position.z += (ud.vel.z + Math.cos(ud.wobble) * 0.12) * dt;

    if (ud.type === "glitch") {
      ud.glitchPhase += dt * 10;
      b.position.x += Math.sin(ud.glitchPhase * 3) * 0.02;
      b.position.y += Math.cos(ud.glitchPhase * 5) * 0.02;
      const toP = playerPos.clone().sub(b.position);
      const dist = toP.length();
      if (dist > 0.01) {
        toP.normalize().multiplyScalar(1.2 * actSpeed() * dt);
        b.position.add(toP);
      }
      if (ud.eyes) {
        ud.eyes.forEach((eye) => {
          eye.material.color.setHex(
            Math.sin(ud.glitchPhase * 8) > 0 ? 0xff0033 : 0xaa0022
          );
        });
      }
      const hitDist = b.position.distanceTo(playerPos);
      if (hitDist < ud.radius + 0.55) {
        removeBubble(i);
        lives--;
        combo = 0;
        comboTimer = 0;
        burstAt(b.position, 0xff0044, 22);
        playLoseLife();
        updateHud();
        if (lives <= 0) gameOver();
      }
    }

    const dx = b.position.x - posX;
    const dz = b.position.z - posZ;
    if (Math.hypot(dx, dz) > TENT_R - 1) {
      ud.vel.x *= -0.5;
      ud.vel.z *= -0.5;
    }
    if (b.position.y < 0.5 || b.position.y > TENT_H - 0.5) {
      ud.vel.y *= -0.6;
      b.position.y = THREE.MathUtils.clamp(b.position.y, 0.5, TENT_H - 0.5);
    }
  }

  for (let i = burstParts.length - 1; i >= 0; i--) {
    const p = burstParts[i];
    p.userData.life -= dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.vel.y -= 2.5 * dt;
    const a = p.userData.life / p.userData.maxLife;
    p.material.opacity = Math.max(0, a);
    p.scale.setScalar(0.5 + a);
    if (p.userData.life <= 0) {
      scene.remove(p);
      burstParts.splice(i, 1);
    }
  }

  updateCamera();
  updateHud();
}

function onResize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a0a12);
  scene.fog = new THREE.FogExp2(0x1a0a12, 0.035);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.appendChild(renderer.domElement);
  clock = new THREE.Clock();

  const tentRoot = new THREE.Group();
  buildTent(tentRoot);
  scene.add(tentRoot);

  onResize();
  updateCamera();
}

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  if (state === State.PLAY) updatePlay(dt);
  else updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function handleStartGesture() {
  ensureAudio();
  if (state === State.TITLE) startPlay();
  else if (state === State.GAMEOVER) startPlay();
}

function onPointerDown(e) {
  if (e.target.closest(".overlay") && state !== State.PLAY) {
    handleStartGesture();
    return;
  }
  if (state !== State.PLAY) return;
  e.preventDefault();
  clickDownX = e.clientX;
  clickDownY = e.clientY;
  lookDragging = true;
  lookStartX = e.clientX;
  lookStartY = e.clientY;
  lookStartYaw = yaw;
  lookStartPitch = pitch;
  ensureAudio();
}

function onPointerMove(e) {
  if (!lookDragging || state !== State.PLAY) return;
  const sens = pointerLockActive ? 0.0022 : 0.0035;
  let dx;
  let dy;
  if (pointerLockActive) {
    dx = e.movementX;
    dy = e.movementY;
    yaw -= dx * sens;
    pitch -= dy * sens;
  } else {
    dx = e.clientX - lookStartX;
    dy = e.clientY - lookStartY;
    yaw = lookStartYaw - dx * sens;
    pitch = lookStartPitch - dy * sens;
  }
  pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
}

function onPointerUp(e) {
  if (state !== State.PLAY) return;
  const moved = Math.hypot(e.clientX - clickDownX, e.clientY - clickDownY);
  lookDragging = false;
  if (moved < 12) tryPopRaycast();
}

function onDblClick() {
  if (state !== State.PLAY) return;
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  } else {
    renderer.domElement.requestPointerLock();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM") {
    muted = !muted;
    setMusicMute();
    updateHud();
    return;
  }
  keys[e.code] = true;
  if (e.code === "Space") {
    e.preventDefault();
    handleStartGesture();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

rendererSetup();

function rendererSetup() {
  initThree();
  document.addEventListener("pointerlockchange", () => {
    pointerLockActive = document.pointerLockElement === renderer.domElement;
  });
  loadHighScore();
  window.addEventListener("resize", onResize);
  viewport.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("dblclick", onDblClick);
  overlayTitle.addEventListener("click", handleStartGesture);
  overlayGameover.addEventListener("click", handleStartGesture);
  crosshair.classList.add("title-mode");
  animate();
}
