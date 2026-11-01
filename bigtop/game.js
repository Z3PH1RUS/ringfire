(function () {
  "use strict";

  const HS_KEY = "bubblePopBigTopHighScore";
  const ACT_DURATION_MS = 30000;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 800;
  let H = 600;
  let dpr = 1;

  const State = { TITLE: 0, PLAY: 1, GAMEOVER: 2 };
  let state = State.TITLE;

  let score = 0;
  let highScore = 0;
  let lives = 3;
  let act = 1;
  let actTimer = 0;
  let combo = 0;
  let comboTimer = 0;
  let bannerText = "";
  let bannerTimer = 0;

  let bubbles = [];
  let confetti = [];
  let particles = [];
  let spawnAcc = 0;

  let keys = Object.create(null);
  let pointerX = null;
  let pointerDown = false;
  let fireHeld = false;
  let fireCooldown = 0;

  let audioCtx = null;
  let muted = false;
  let musicStarted = false;
  let musicNodes = null;

  const player = {
    x: 400,
    y: 0,
    w: 56,
    h: 72,
    speed: 320,
    targetX: null,
  };

  function loadHighScore() {
    try {
      const v = localStorage.getItem(HS_KEY);
      highScore = v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    } catch (_) {
      highScore = 0;
    }
  }

  function saveHighScore() {
    try {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem(HS_KEY, String(highScore));
      }
    } catch (_) {}
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.y = H - player.h - 24;
    if (state === State.TITLE) player.x = W / 2;
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }

  function playPop(pitch) {
    const ac = ensureAudio();
    if (!ac || muted) return;
    if (ac.state === "suspended") ac.resume();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch || 520, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  function playBad() {
    const ac = ensureAudio();
    if (!ac || muted) return;
    if (ac.state === "suspended") ac.resume();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.linearRampToValueAtTime(45, t + 0.25);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  function playGold() {
    playPop(660);
    setTimeout(() => playPop(880), 50);
  }

  const MELODY = [
    [523.25, 0.15],
    [659.25, 0.15],
    [783.99, 0.15],
    [659.25, 0.15],
    [587.33, 0.15],
    [659.25, 0.15],
    [783.99, 0.2],
    [698.46, 0.2],
    [659.25, 0.15],
    [587.33, 0.15],
    [523.25, 0.25],
    [0, 0.1],
  ];

  function startMusic() {
    if (musicStarted || muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    musicStarted = true;

    const master = ac.createGain();
    master.gain.value = muted ? 0 : 0.08;
    master.connect(ac.destination);

    const bass = ac.createOscillator();
    const bassGain = ac.createGain();
    bass.type = "triangle";
    bass.frequency.value = 130.81;
    bassGain.gain.value = 0.4;
    bass.connect(bassGain);
    bassGain.connect(master);
    bass.start();

    let step = 0;
    let nextNote = ac.currentTime + 0.05;

    function scheduleLoop() {
      if (!musicStarted || !audioCtx) return;
      const now = audioCtx.currentTime;
      while (nextNote < now + 0.4) {
        const [freq, dur] = MELODY[step % MELODY.length];
        if (freq > 0) {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "square";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, nextNote);
          g.gain.linearRampToValueAtTime(0.35, nextNote + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, nextNote + dur);
          o.connect(g);
          g.connect(master);
          o.start(nextNote);
          o.stop(nextNote + dur + 0.05);
        }
        nextNote += dur;
        step++;
      }
      musicNodes = { master, bass, scheduleId: requestAnimationFrame(scheduleLoop) };
    }
    scheduleLoop();
  }

  function setMusicMute() {
    if (musicNodes && musicNodes.master) {
      musicNodes.master.gain.setTargetAtTime(
        muted ? 0 : 0.08,
        audioCtx.currentTime,
        0.05
      );
    }
  }

  function actSpeed() {
    return 1 + (act - 1) * 0.22;
  }

  function spawnRate() {
    return Math.max(0.35, 1.1 - act * 0.08);
  }

  function randomBubbleColor() {
    const hues = [0, 30, 200, 280, 120, 320];
    return hues[(Math.random() * hues.length) | 0];
  }

  function spawnBubble() {
    const r = 14 + Math.random() * 22;
    const roll = Math.random();
    let type = "normal";
    if (roll < 0.08 + act * 0.01) type = "glitch";
    else if (roll < 0.2) type = "gold";

    bubbles.push({
      x: r + Math.random() * (W - 2 * r),
      y: -r - 10,
      r,
      vx: (Math.random() - 0.5) * 40 * actSpeed(),
      vy: (35 + Math.random() * 45) * actSpeed(),
      wobble: Math.random() * Math.PI * 2,
      hue: type === "normal" ? randomBubbleColor() : 0,
      type,
      glitchPhase: Math.random() * 10,
    });
  }

  function spawnConfetti(x) {
    const px = x != null ? x : player.x;
    for (let i = 0; i < 5; i++) {
      confetti.push({
        x: px + (Math.random() - 0.5) * 20,
        y: player.y + 10,
        vx: (Math.random() - 0.5) * 120,
        vy: -380 - Math.random() * 120,
        life: 1.2,
        hue: (Math.random() * 360) | 0,
        size: 4 + Math.random() * 4,
      });
    }
    fireCooldown = 0.12;
  }

  function burstParticles(x, y, hue, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        hue: hue + (Math.random() - 0.5) * 30,
        size: 2 + Math.random() * 5,
      });
    }
  }

  function popBubble(b, idx) {
    bubbles.splice(idx, 1);
    if (b.type === "glitch") return;

    let pts = 10 + act * 2;
    if (b.type === "gold") {
      combo = Math.min(combo + 1, 12);
      comboTimer = 2.5;
      pts = 50 + combo * 15;
      playGold();
    } else {
      comboTimer = Math.max(comboTimer - 0.1, 0);
      if (comboTimer <= 0) combo = 0;
      playPop(400 + b.hue);
    }
    score += pts;
    burstParticles(b.x, b.y, b.type === "gold" ? 45 : b.hue, 18);
  }

  function resetGame() {
    score = 0;
    lives = 3;
    act = 1;
    actTimer = 0;
    combo = 0;
    comboTimer = 0;
    bannerText = "";
    bannerTimer = 0;
    bubbles = [];
    confetti = [];
    particles = [];
    spawnAcc = 0;
    player.x = W / 2;
    player.targetX = null;
    fireCooldown = 0;
  }

  function startPlay() {
    resetGame();
    state = State.PLAY;
    startMusic();
  }

  function gameOver() {
    state = State.GAMEOVER;
    saveHighScore();
    playBad();
  }

  function showActBanner() {
    act++;
    bannerText = "ACT " + act + "!";
    bannerTimer = 2.8;
    for (let i = 0; i < 24; i++) {
      burstParticles(W / 2, H * 0.35, 45 + i * 8, 1);
    }
  }

  function update(dt) {
    if (state === State.PLAY) {
      actTimer += dt;
      if (actTimer >= ACT_DURATION_MS / 1000) {
        actTimer = 0;
        showActBanner();
      }
      if (bannerTimer > 0) bannerTimer -= dt;
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) combo = 0;
      }

      let move = 0;
      if (keys.ArrowLeft || keys.a || keys.A) move -= 1;
      if (keys.ArrowRight || keys.d || keys.D) move += 1;
      if (player.targetX != null) {
        const dx = player.targetX - player.x;
        if (Math.abs(dx) < 8) player.x = player.targetX;
        else player.x += Math.sign(dx) * player.speed * dt;
      } else if (move) {
        player.x += move * player.speed * dt;
      }
      player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

      if (fireCooldown > 0) fireCooldown -= dt;
      if ((keys[" "] || fireHeld || pointerDown) && fireCooldown <= 0) {
        spawnConfetti(pointerX != null && pointerDown ? pointerX : player.x);
      }

      spawnAcc += dt;
      while (spawnAcc >= spawnRate()) {
        spawnAcc -= spawnRate();
        spawnBubble();
      }

      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.vy += 420 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.life -= dt;
        if (c.life <= 0 || c.y < -20) confetti.splice(i, 1);
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.wobble += dt * 2;
        b.x += (b.vx + Math.sin(b.wobble) * 25) * dt;
        b.y += b.vy * dt;
        if (b.type === "glitch") b.glitchPhase += dt * 12;

        if (b.x < b.r) {
          b.x = b.r;
          b.vx *= -0.5;
        }
        if (b.x > W - b.r) {
          b.x = W - b.r;
          b.vx *= -0.5;
        }

        const pr = player.w * 0.35;
        const py = player.y + player.h * 0.4;
        const dx = b.x - player.x;
        const dy = b.y - py;
        if (dx * dx + dy * dy < (b.r + pr) * (b.r + pr)) {
          if (b.type === "glitch") {
            bubbles.splice(i, 1);
            lives--;
            combo = 0;
            comboTimer = 0;
            burstParticles(b.x, b.y, 0, 22);
            playBad();
            if (lives <= 0) gameOver();
          }
          continue;
        }

        for (let j = confetti.length - 1; j >= 0; j--) {
          const c = confetti[j];
          const ddx = c.x - b.x;
          const ddy = c.y - b.y;
          if (ddx * ddx + ddy * ddy < (b.r + 6) * (b.r + 6)) {
            if (b.type !== "glitch") popBubble(b, i);
            else {
              confetti.splice(j, 1);
              playBad();
            }
            break;
          }
        }

        if (b.y > H + b.r + 40) bubbles.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += 180 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }
  }

  function drawTentBackground() {
    const stripeW = 48;
    for (let x = 0; x < W + stripeW; x += stripeW) {
      ctx.fillStyle = (x / stripeW) % 2 === 0 ? "#c41e3a" : "#f4c430";
      ctx.fillRect(x - (W % stripeW) * 0.5, 0, stripeW, H);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(20,10,30,0.55)");
    g.addColorStop(0.5, "rgba(0,0,0,0.15)");
    g.addColorStop(1, "rgba(40,20,10,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2, -20);
      ctx.lineTo((W / 8) * i, H * 0.85);
      ctx.stroke();
    }
  }

  function drawBubble(b) {
    ctx.save();
    if (b.type === "glitch") {
      const jx = Math.sin(b.glitchPhase * 3) * 3;
      const jy = Math.cos(b.glitchPhase * 5) * 3;
      ctx.translate(jx, jy);
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff0044";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + Math.max(10, b.r * 0.9) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(">:(" , b.x, b.y);
    } else if (b.type === "gold") {
      const grd = ctx.createRadialGradient(
        b.x - b.r * 0.3,
        b.y - b.r * 0.3,
        b.r * 0.1,
        b.x,
        b.y,
        b.r
      );
      grd.addColorStop(0, "#fff8c0");
      grd.addColorStop(0.4, "#ffd700");
      grd.addColorStop(1, "#b8860b");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#5c4a00";
      ctx.font = "bold " + Math.max(9, b.r * 0.55) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", b.x, b.y + 1);
    } else {
      const grd = ctx.createRadialGradient(
        b.x - b.r * 0.35,
        b.y - b.r * 0.35,
        b.r * 0.05,
        b.x,
        b.y,
        b.r
      );
      grd.addColorStop(0, "hsla(" + b.hue + ",90%,85%,0.95)");
      grd.addColorStop(0.5, "hsla(" + b.hue + ",75%,55%,0.5)");
      grd.addColorStop(1, "hsla(" + b.hue + ",80%,45%,0.25)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "hsla(" + b.hue + ",70%,90%,0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCaine() {
    const x = player.x;
    const y = player.y;
    const w = player.w;
    const h = player.h;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(-w * 0.35, h * 0.55, w * 0.28, h * 0.45);
    ctx.fillRect(w * 0.07, h * 0.55, w * 0.28, h * 0.45);

    ctx.fillStyle = "#c41e3a";
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, h * 0.58);
    ctx.lineTo(w * 0.42, h * 0.58);
    ctx.lineTo(w * 0.35, h * 0.95);
    ctx.lineTo(-w * 0.35, h * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#f5d0a9";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.32, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.08, w * 0.38, h * 0.14, 0, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = "#c41e3a";
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, h * 0.02);
    ctx.lineTo(0, -h * 0.35);
    ctx.lineTo(w * 0.45, h * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.08, -h * 0.35);
    ctx.lineTo(w * 0.08, -h * 0.35);
    ctx.stroke();

    ctx.fillStyle = "#ffd700";
    ctx.fillRect(-w * 0.12, h * 0.26, w * 0.24, h * 0.06);

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.08, h * 0.3);
    ctx.lineTo(-w * 0.2, h * 0.5);
    ctx.moveTo(w * 0.08, h * 0.3);
    ctx.lineTo(w * 0.2, h * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawConfetti() {
    for (const c of confetti) {
      ctx.fillStyle = "hsl(" + c.hue + ",85%,55%)";
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.life * 8);
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = "hsl(" + p.hue + ",90%,60%)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(8, 8, 200, 72);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 200, 72);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 18, 34);
    ctx.fillText("Best: " + highScore, 18, 58);
    ctx.font = "16px sans-serif";
    ctx.fillText("Act " + act, 120, 34);

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < lives ? "#ff4466" : "rgba(80,40,40,0.5)";
      ctx.beginPath();
      ctx.arc(W - 30 - i * 28, 28, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    if (combo > 1) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("COMBO x" + combo, W / 2, 40);
    }

    if (muted) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(W - 70, H - 36, 62, 26);
      ctx.fillStyle = "#ccc";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("MUTE", W - 39, H - 18);
    }
  }

  function drawBanner() {
    if (bannerTimer <= 0 || !bannerText) return;
    const a = Math.min(1, bannerTimer / 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(W * 0.1, H * 0.28, W * 0.8, 80);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    ctx.strokeRect(W * 0.1, H * 0.28, W * 0.8, 80);
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold " + Math.min(52, W * 0.08) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(bannerText, W / 2, H * 0.28 + 40);
    ctx.restore();
  }

  function drawTitle() {
    drawTentBackground();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "#c41e3a";
    ctx.lineWidth = 6;
    ctx.font = "bold " + Math.min(56, W * 0.1) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.strokeText("Bubble Pop", W / 2, H * 0.28);
    ctx.fillText("Bubble Pop", W / 2, H * 0.28);

    ctx.font = "bold " + Math.min(44, W * 0.08) + "px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.strokeText("Big Top", W / 2, H * 0.38);
    ctx.fillText("Big Top", W / 2, H * 0.38);

    ctx.font = Math.min(22, W * 0.045) + "px sans-serif";
    ctx.fillStyle = "#ffe";
    const pulse = 0.65 + Math.sin(performance.now() / 400) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillText("Press Space / tap to start", W / 2, H * 0.55);
    ctx.globalAlpha = 1;

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Caine the ringmaster vs. the bubbles!", W / 2, H * 0.64);
    ctx.fillText("Best: " + highScore, W / 2, H * 0.72);

    drawCaine();
  }

  function drawGameOver() {
    drawTentBackground();
    for (const b of bubbles) drawBubble(b);
    drawParticles();
    drawCaine();

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff4466";
    ctx.font = "bold " + Math.min(48, W * 0.09) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Show's Over!", W / 2, H * 0.38);

    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.fillText("Score: " + score, W / 2, H * 0.48);
    ctx.fillText("Best: " + highScore, W / 2, H * 0.55);

    ctx.fillStyle = "#ffd700";
    ctx.font = "20px sans-serif";
    const pulse = 0.65 + Math.sin(performance.now() / 350) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillText("Space / tap to restart", W / 2, H * 0.68);
    ctx.globalAlpha = 1;
  }

  function drawPlay() {
    drawTentBackground();
    for (const b of bubbles) drawBubble(b);
    drawConfetti();
    drawParticles();
    drawCaine();
    drawHUD();
    drawBanner();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (state === State.TITLE) drawTitle();
    else if (state === State.PLAY) drawPlay();
    else drawGameOver();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function clientX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  function onPointerDown(e) {
    e.preventDefault();
    ensureAudio();
    const x = clientX(e);
    pointerX = x;
    pointerDown = true;
    if (state === State.TITLE || state === State.GAMEOVER) {
      startPlay();
      return;
    }
    player.targetX = x;
    spawnConfetti(x);
  }

  function onPointerMove(e) {
    pointerX = clientX(e);
    if (state === State.PLAY && pointerDown) player.targetX = pointerX;
  }

  function onPointerUp() {
    pointerDown = false;
    player.targetX = null;
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyM") {
      muted = !muted;
      setMusicMute();
      return;
    }
    keys[e.code] = true;
    if (e.code === "Space") {
      e.preventDefault();
      ensureAudio();
      if (state === State.TITLE || state === State.GAMEOVER) startPlay();
      else fireHeld = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    if (e.code === "Space") fireHeld = false;
  });

  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches[0]) onPointerDown(e.touches[0]);
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches[0]) onPointerMove(e.touches[0]);
    },
    { passive: false }
  );
  window.addEventListener("touchend", onPointerUp);

  window.addEventListener("resize", resize);
  loadHighScore();
  resize();
  requestAnimationFrame(loop);
})();
