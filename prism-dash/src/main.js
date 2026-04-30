import * as THREE from "three";

const dom = {
  root: document.getElementById("game"),
  menu: document.getElementById("menu"),
  over: document.getElementById("over"),
  score: document.getElementById("score"),
  bolts: document.getElementById("bolts"),
  speed: document.getElementById("speed"),
  best: document.getElementById("best"),
  finalScore: document.getElementById("finalScore"),
  finalBolts: document.getElementById("finalBolts"),
  finalDistance: document.getElementById("finalDistance"),
  finalBest: document.getElementById("finalBest"),
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  menuBtn: document.getElementById("menuBtn"),
  soundBtn: document.getElementById("soundBtn")
};

const COLORS = {
  sky: 0x7ee9ff,
  cyan: 0x36e8ff,
  pink: 0xff4bd8,
  gold: 0xffe15d,
  green: 0x68ff9b,
  red: 0xff3d58,
  ground: 0x192a48,
  grass: 0x37f0aa
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x73dfff);
scene.fog = new THREE.Fog(0x83dfff, 38, 125);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
dom.root.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = new Set();
const pressed = new Set();

const groups = {
  world: new THREE.Group(),
  objects: new THREE.Group(),
  particles: new THREE.Group(),
  background: new THREE.Group()
};
scene.add(groups.world, groups.objects, groups.particles, groups.background);

const mats = makeMaterials();
const platforms = [];
const bolts = [];
const hazards = [];
const pads = [];
const particles = [];
const skyline = [];

const world = {
  state: "menu",
  score: 0,
  bolts: 0,
  distance: 0,
  best: Number(localStorage.getItem("prismDashBest") || 0),
  nextX: 0,
  lastY: 0,
  shake: 0,
  muted: false
};

const player = {
  x: 0,
  y: 4,
  z: 0,
  vx: 0,
  vy: 0,
  radius: 0.72,
  grounded: false,
  rolling: false,
  invuln: 0,
  mesh: makeRunner()
};
scene.add(player.mesh);

let audio = null;

setupLights();
setupBackground();
resetRun();
setState("menu");
animate();

function makeMaterials() {
  return {
    platform: new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.5, metalness: 0.18 }),
    platformTop: new THREE.MeshStandardMaterial({ color: COLORS.grass, emissive: 0x0a5b45, emissiveIntensity: 0.3, roughness: 0.48 }),
    edge: new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 1.35 }),
    bolt: new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 1.75, roughness: 0.22 }),
    hazard: new THREE.MeshStandardMaterial({ color: COLORS.red, emissive: COLORS.red, emissiveIntensity: 1.05, roughness: 0.35 }),
    pad: new THREE.MeshStandardMaterial({ color: COLORS.pink, emissive: COLORS.pink, emissiveIntensity: 1.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdff9ff, roughness: 0.2, metalness: 0.55 }),
    runner: new THREE.MeshStandardMaterial({ color: 0x215dff, emissive: 0x07165f, emissiveIntensity: 0.45, roughness: 0.24, metalness: 0.35 }),
    particle: new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 1 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false })
  };
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x446088, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-14, 28, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  scene.add(sun);

  const pink = new THREE.PointLight(COLORS.pink, 7, 42);
  pink.position.set(8, 8, 8);
  scene.add(pink);
}

function setupBackground() {
  const cloudGeo = new THREE.PlaneGeometry(14, 5);
  for (let i = 0; i < 22; i += 1) {
    const cloud = new THREE.Mesh(cloudGeo, mats.cloud.clone());
    cloud.position.set(i * 16 - 30, -5 - Math.random() * 8, -20 - Math.random() * 18);
    cloud.rotation.x = -0.22;
    cloud.scale.setScalar(0.7 + Math.random() * 1.5);
    groups.background.add(cloud);
  }

  for (let i = 0; i < 40; i += 1) {
    const h = 4 + Math.random() * 20;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2 + Math.random() * 3, h, 2 + Math.random() * 3),
      new THREE.MeshStandardMaterial({
        color: 0x24345f,
        emissive: Math.random() > 0.5 ? COLORS.cyan : COLORS.pink,
        emissiveIntensity: 0.08 + Math.random() * 0.18,
        roughness: 0.55,
        metalness: 0.22
      })
    );
    tower.position.set(i * 11 - 40, h / 2 - 9, -36 - Math.random() * 18);
    tower.castShadow = true;
    groups.background.add(tower);
    skyline.push(tower);
  }
}

function makeRunner() {
  const group = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 20), mats.runner);
  orb.castShadow = true;
  group.add(orb);

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.08), mats.chrome);
  face.position.set(0, 0.12, -0.67);
  group.add(face);

  for (const x of [-0.48, 0.48]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.82), new THREE.MeshStandardMaterial({
      color: x < 0 ? COLORS.pink : COLORS.cyan,
      emissive: x < 0 ? COLORS.pink : COLORS.cyan,
      emissiveIntensity: 1.0
    }));
    shoe.position.set(x, -0.72, 0.1);
    shoe.castShadow = true;
    group.add(shoe);
  }

  const trailMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.55, depthWrite: false });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.38, 3.4, 18, 1, true), trailMat);
  trail.rotation.z = Math.PI / 2;
  trail.position.set(-1.8, 0, 0.15);
  trail.userData.trail = true;
  group.add(trail);
  return group;
}

function resetRun() {
  clearGroup(groups.world);
  clearGroup(groups.objects);
  clearGroup(groups.particles);
  platforms.length = 0;
  bolts.length = 0;
  hazards.length = 0;
  pads.length = 0;
  particles.length = 0;

  world.score = 0;
  world.bolts = 0;
  world.distance = 0;
  world.nextX = -8;
  world.lastY = 0;
  world.shake = 0;

  player.x = 0;
  player.y = 4;
  player.z = 0;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.rolling = false;
  player.invuln = 0;
  player.mesh.position.set(player.x, player.y, player.z);

  for (let i = 0; i < 24; i += 1) spawnChunk(i < 5);
  updateHud();
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

// Procedural chunks create a readable high-speed route with gaps, slopes, bolts, hazards, and boost pads.
function spawnChunk(safe = false) {
  const length = safe ? 12 : 8 + Math.random() * 9;
  const gap = safe ? 0 : Math.random() < 0.22 ? 2.8 + Math.random() * 3.8 : 0;
  const yShift = safe ? 0 : (Math.random() - 0.42) * 1.8;
  const y = clamp(world.lastY + yShift, -2.8, 3.8);
  const x = world.nextX + gap + length / 2;
  const slope = safe ? 0 : (Math.random() - 0.5) * 0.28;

  const platform = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(length, 1.25, 5.2), mats.platform);
  base.position.y = y - 0.7;
  base.receiveShadow = true;
  base.castShadow = true;
  platform.add(base);

  const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 5.35), mats.platformTop);
  top.position.y = y;
  top.receiveShadow = true;
  platform.add(top);

  for (const z of [-2.72, 2.72]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.12), mats.edge);
    rail.position.set(0, y + 0.2, z);
    platform.add(rail);
  }

  platform.position.x = x;
  platform.rotation.z = slope;
  groups.world.add(platform);
  platforms.push({ group: platform, x, y, length, slope });

  if (!safe) {
    if (Math.random() < 0.72) addBolts(x, y, length);
    if (Math.random() < 0.42) addHazard(x + (Math.random() - 0.5) * length * 0.5, y + 0.72);
    if (Math.random() < 0.22) addBoostPad(x + (Math.random() - 0.5) * length * 0.45, y + 0.16);
  }

  world.nextX += gap + length;
  world.lastY = y;
}

function addBolts(x, y, length) {
  const count = 3 + Math.floor(Math.random() * 5);
  const start = x - length * 0.34;
  for (let i = 0; i < count; i += 1) {
    const bolt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 10, 22), mats.bolt);
    bolt.position.set(start + i * 1.35, y + 1.35 + Math.sin(i * 0.7) * 0.22, 0);
    bolt.rotation.y = Math.PI / 2;
    bolt.userData.phase = Math.random() * Math.PI * 2;
    groups.objects.add(bolt);
    bolts.push(bolt);
  }
}

function addHazard(x, y) {
  const hazard = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 2.7), mats.hazard);
  hazard.add(base);
  for (let i = -1; i <= 1; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 5), mats.hazard);
    spike.position.set(0, 0.58, i * 0.72);
    spike.castShadow = true;
    hazard.add(spike);
  }
  hazard.position.set(x, y, 0);
  groups.objects.add(hazard);
  hazards.push(hazard);
}

function addBoostPad(x, y) {
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.4), mats.pad);
  pad.position.set(x, y, 0);
  pad.userData.phase = Math.random() * Math.PI * 2;
  groups.objects.add(pad);
  pads.push(pad);
}

function setState(state) {
  world.state = state;
  dom.menu.hidden = state !== "menu";
  dom.over.hidden = state !== "over";
  dom.best.textContent = world.best;
}

function start() {
  ensureAudio();
  resetRun();
  setState("playing");
  tone(260, 0.08, "sawtooth", 0.035);
  tone(520, 0.12, "triangle", 0.025, 0.05);
}

function gameOver() {
  if (world.state !== "playing") return;
  world.best = Math.max(world.best, Math.floor(world.score));
  localStorage.setItem("prismDashBest", String(world.best));
  dom.finalScore.textContent = Math.floor(world.score);
  dom.finalBolts.textContent = world.bolts;
  dom.finalDistance.textContent = `${Math.floor(world.distance)} m`;
  dom.finalBest.textContent = world.best;
  spawnBurst(player.mesh.position, COLORS.red, 46, 1.2);
  world.shake = 1.2;
  tone(80, 0.24, "sawtooth", 0.055);
  setState("over");
}

function update(dt) {
  const time = performance.now() / 1000;
  animateBackground(dt, time);
  animateObjects(dt, time);
  updateParticles(dt);

  if (world.state !== "playing") {
    updateCamera(dt);
    renderer.render(scene, camera);
    return;
  }

  const accel = keys.has("ArrowRight") || keys.has("KeyD") ? 32 : 14;
  const brake = keys.has("ArrowLeft") || keys.has("KeyA") ? 34 : 0;
  const rolling = keys.has("ArrowDown") || keys.has("KeyS");
  player.rolling = rolling;
  player.vx += accel * dt;
  player.vx -= brake * dt;
  player.vx -= (player.grounded ? 4.0 : 1.4) * dt;
  if (rolling && player.grounded) player.vx += 18 * dt;
  player.vx = clamp(player.vx, -8, 38 + world.distance * 0.01);

  if (consume("Space") && player.grounded) {
    player.vy = 15.8 + Math.min(5, Math.max(0, player.vx - 16) * 0.16);
    player.grounded = false;
    tone(360, 0.07, "triangle", 0.028);
    spawnBurst(player.mesh.position, COLORS.cyan, 12, 0.45);
  }

  player.vy -= 32 * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.z += (0 - player.z) * Math.min(1, dt * 8);
  resolveGround();
  handleCollections();
  handleHazards();
  recycle();

  world.distance = Math.max(world.distance, player.x);
  world.score += Math.max(0, player.vx) * dt * 3.2 + world.bolts * dt * 0.7;
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.y < -14) gameOver();

  updatePlayerVisual(dt);
  updateCamera(dt);
  updateHud();
  updateAudio();
  renderer.render(scene, camera);
}

function resolveGround() {
  player.grounded = false;
  for (const p of platforms) {
    const localX = player.x - p.x;
    if (Math.abs(localX) > p.length / 2 + player.radius) continue;
    const groundY = p.y + Math.tan(p.slope) * localX + player.radius;
    if (player.vy <= 0 && player.y >= groundY - 1.1 && player.y <= groundY + 0.8) {
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
      player.vx += Math.sin(p.slope) * 10 * 0.016;
      break;
    }
  }
}

function handleCollections() {
  for (let i = bolts.length - 1; i >= 0; i -= 1) {
    const bolt = bolts[i];
    if (bolt.position.distanceTo(player.mesh.position) < 1.35) {
      groups.objects.remove(bolt);
      bolts.splice(i, 1);
      world.bolts += 1;
      world.score += 120;
      player.vx = Math.min(player.vx + 0.8, 44);
      spawnBurst(bolt.position, COLORS.gold, 16, 0.55);
      tone(720 + Math.min(12, world.bolts) * 12, 0.045, "sine", 0.023);
    }
  }

  for (let i = pads.length - 1; i >= 0; i -= 1) {
    const pad = pads[i];
    if (Math.abs(pad.position.x - player.x) < 1.5 && Math.abs(pad.position.y + 0.4 - player.y) < 1.4) {
      player.vx = Math.max(player.vx, 42);
      player.vy = Math.max(player.vy, 5);
      spawnBurst(pad.position, COLORS.pink, 24, 0.75);
      tone(220, 0.06, "sawtooth", 0.026);
      tone(620, 0.1, "triangle", 0.022, 0.04);
    }
  }
}

function handleHazards() {
  if (player.invuln > 0) return;
  for (const hazard of hazards) {
    const dx = Math.abs(hazard.position.x - player.x);
    const dy = Math.abs(hazard.position.y + 0.35 - player.y);
    if (dx < 1.15 && dy < 1.25) {
      if (player.rolling || player.vy < -6) {
        hazard.visible = false;
        groups.objects.remove(hazard);
        const idx = hazards.indexOf(hazard);
        if (idx >= 0) hazards.splice(idx, 1);
        player.vx += 8;
        player.vy = 8;
        world.score += 350;
        spawnBurst(hazard.position, COLORS.green, 28, 0.9);
        tone(420, 0.08, "square", 0.025);
      } else if (world.bolts > 0) {
        const lost = Math.min(world.bolts, 12);
        world.bolts -= lost;
        player.vx *= 0.42;
        player.vy = 8;
        player.invuln = 1.2;
        world.shake = 0.55;
        spawnBurst(player.mesh.position, COLORS.gold, 22, 0.9);
        tone(130, 0.11, "sawtooth", 0.035);
      } else {
        gameOver();
      }
      break;
    }
  }
}

function recycle() {
  while (world.nextX < player.x + 160) spawnChunk();

  for (let i = platforms.length - 1; i >= 0; i -= 1) {
    if (platforms[i].x + platforms[i].length < player.x - 45) {
      groups.world.remove(platforms[i].group);
      platforms.splice(i, 1);
    }
  }

  for (let i = bolts.length - 1; i >= 0; i -= 1) {
    if (bolts[i].position.x < player.x - 45) {
      groups.objects.remove(bolts[i]);
      bolts.splice(i, 1);
    }
  }

  for (let i = hazards.length - 1; i >= 0; i -= 1) {
    if (hazards[i].position.x < player.x - 45) {
      groups.objects.remove(hazards[i]);
      hazards.splice(i, 1);
    }
  }
}

function updatePlayerVisual(dt) {
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.z -= player.vx * dt * 1.6;
  player.mesh.rotation.y += (player.rolling ? 1.2 : 0 - player.mesh.rotation.y) * Math.min(1, dt * 5);
  player.mesh.scale.y += ((player.rolling ? 0.78 : 1) - player.mesh.scale.y) * Math.min(1, dt * 9);
  player.mesh.scale.x += ((player.rolling ? 1.08 : 1) - player.mesh.scale.x) * Math.min(1, dt * 9);
  player.mesh.traverse((child) => {
    if (child.userData.trail) child.scale.y = 1 + Math.max(0, player.vx - 18) * 0.04;
  });
  if (player.vx > 25 && Math.random() < 0.8) spawnTrail();
}

function updateCamera(dt) {
  const desired = new THREE.Vector3(player.x + 7, player.y + 5.4, 15 + Math.max(0, player.vx - 20) * 0.12);
  camera.position.lerp(desired, Math.min(1, dt * 4.8));
  camera.lookAt(player.x + 8 + player.vx * 0.28, player.y + 1.1, 0);
  if (world.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * world.shake;
    camera.position.y += (Math.random() - 0.5) * world.shake;
    world.shake = Math.max(0, world.shake - dt * 2.5);
  }
}

function animateBackground(dt, time) {
  groups.background.position.x = player.x * 0.55;
  for (const tower of skyline) {
    tower.material.emissiveIntensity = 0.08 + Math.sin(time * 2 + tower.position.x) * 0.05;
  }
}

function animateObjects(dt, time) {
  for (const bolt of bolts) {
    bolt.rotation.z += dt * 4.5;
    bolt.position.z = Math.sin(time * 3 + bolt.userData.phase) * 0.35;
  }
  for (const pad of pads) {
    pad.material.emissiveIntensity = 1.1 + Math.sin(time * 6 + pad.userData.phase) * 0.35;
  }
}

function spawnTrail() {
  const pos = player.mesh.position.clone();
  pos.x -= 0.8;
  pos.y -= 0.05;
  spawnParticle(pos, Math.random() > 0.5 ? COLORS.cyan : COLORS.pink, 0.32, 0.6);
}

function spawnBurst(position, color, count, power) {
  for (let i = 0; i < count; i += 1) spawnParticle(position, color, 0.35 + Math.random() * 0.25, power);
}

function spawnParticle(position, color, life, power) {
  const mat = mats.particle.clone();
  mat.color.setHex(color);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.11, 8, 6), mat);
  mesh.position.copy(position);
  groups.particles.add(mesh);
  particles.push({
    mesh,
    life,
    max: life,
    vel: new THREE.Vector3((Math.random() - 0.5) * 7 - player.vx * 0.05, (Math.random() - 0.1) * 5, (Math.random() - 0.5) * 2).multiplyScalar(power)
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 6 * dt;
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) {
      groups.particles.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

function updateHud() {
  dom.score.textContent = Math.floor(world.score);
  dom.bolts.textContent = world.bolts;
  dom.speed.textContent = Math.floor(Math.max(0, player.vx) * 8);
  dom.best.textContent = world.best;
}

function ensureAudio() {
  if (audio || world.muted) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const gain = ctx.createGain();
  gain.gain.value = 0.028;
  gain.connect(ctx.destination);
  const bass = ctx.createOscillator();
  bass.type = "sawtooth";
  bass.frequency.value = 82;
  bass.connect(gain);
  bass.start();
  const pad = ctx.createOscillator();
  pad.type = "triangle";
  pad.frequency.value = 164;
  pad.connect(gain);
  pad.start();
  audio = { ctx, gain, bass, pad };
}

function updateAudio() {
  if (!audio || world.muted) return;
  const now = audio.ctx.currentTime;
  audio.gain.gain.setTargetAtTime(0.024 + Math.min(0.026, player.vx * 0.0008), now, 0.1);
  audio.bass.frequency.setTargetAtTime(82 + player.vx * 0.8, now, 0.08);
  audio.pad.frequency.setTargetAtTime(164 + Math.sin(performance.now() / 650) * 8, now, 0.12);
}

function tone(freq, duration, type, gain, delay = 0) {
  if (world.muted) return;
  ensureAudio();
  if (!audio) return;
  const osc = audio.ctx.createOscillator();
  const vol = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.value = gain;
  vol.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + delay + duration);
  osc.connect(vol);
  vol.connect(audio.ctx.destination);
  osc.start(audio.ctx.currentTime + delay);
  osc.stop(audio.ctx.currentTime + delay + duration);
}

function consume(code) {
  if (!pressed.has(code)) return false;
  pressed.delete(code);
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  update(dt);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (event) => {
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyR" && world.state === "over") start();
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

dom.startBtn.addEventListener("click", start);
dom.restartBtn.addEventListener("click", start);
dom.menuBtn.addEventListener("click", () => setState("menu"));
dom.soundBtn.addEventListener("click", () => {
  world.muted = !world.muted;
  dom.soundBtn.textContent = world.muted ? "Sound Off" : "Sound On";
  dom.soundBtn.setAttribute("aria-pressed", String(!world.muted));
  if (audio) audio.gain.gain.value = world.muted ? 0 : 0.028;
});
