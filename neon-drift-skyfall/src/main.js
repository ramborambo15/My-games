import * as THREE from "three";

const dom = {
  root: document.getElementById("game"),
  menu: document.getElementById("menu"),
  pause: document.getElementById("pause"),
  gameOver: document.getElementById("gameOver"),
  score: document.getElementById("score"),
  speed: document.getElementById("speed"),
  boostText: document.getElementById("boostText"),
  boostBar: document.getElementById("boostBar"),
  combo: document.getElementById("combo"),
  best: document.getElementById("best"),
  shards: document.getElementById("shards"),
  distance: document.getElementById("distance"),
  menuBest: document.getElementById("menuBest"),
  finalScore: document.getElementById("finalScore"),
  finalDistance: document.getElementById("finalDistance"),
  finalShards: document.getElementById("finalShards"),
  finalBest: document.getElementById("finalBest"),
  startBtn: document.getElementById("startBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  restartBtn: document.getElementById("restartBtn"),
  restartFromPauseBtn: document.getElementById("restartFromPauseBtn"),
  menuBtn: document.getElementById("menuBtn"),
  muteBtn: document.getElementById("muteBtn"),
  touchLeft: document.getElementById("touchLeft"),
  touchRight: document.getElementById("touchRight"),
  touchJump: document.getElementById("touchJump"),
  touchBoost: document.getElementById("touchBoost")
};

const COLORS = {
  cyan: 0x39e7ff,
  pink: 0xff3df2,
  violet: 0x8d5cff,
  red: 0xff335a,
  gold: 0xffe45e,
  track: 0x11172b,
  dark: 0x030511
};

const LANES = [-5.2, 0, 5.2];
const SEGMENT_LENGTH = 18;
const ACTIVE_SEGMENTS = 26;
const PLAYER_Z = 8;
const TRACK_Y = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060819);
scene.fog = new THREE.FogExp2(0x08112a, 0.018);

const camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, 0.1, 260);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
dom.root.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = new Set();
const pressed = new Set();
const world = {
  state: "menu",
  distance: 0,
  score: 0,
  shards: 0,
  combo: 1,
  comboTimer: 0,
  best: Number(localStorage.getItem("neonDriftBest") || 0),
  speed: 34,
  targetSpeed: 34,
  boost: 100,
  boostActive: false,
  shake: 0,
  flash: 0,
  muted: false,
  nextSegmentIndex: 0,
  lastSafeLane: 1,
  roadOffset: 0
};

const player = {
  lane: 1,
  targetLane: 1,
  x: LANES[1],
  y: 1.35,
  z: PLAYER_Z,
  vy: 0,
  grounded: true,
  invuln: 0,
  mesh: makeBike()
};

const groups = {
  track: new THREE.Group(),
  gameplay: new THREE.Group(),
  city: new THREE.Group(),
  particles: new THREE.Group(),
  speedLines: new THREE.Group()
};

const segments = [];
const obstacles = [];
const collectibles = [];
const particles = [];
const signs = [];
const pooledMaterials = makeMaterials();
let audio = null;

scene.add(groups.track, groups.gameplay, groups.city, groups.particles, groups.speedLines);
scene.add(player.mesh);

setupLights();
setupCity();
setupClouds();
setupSpeedLines();
resetRun();
setState("menu");
animate();

function makeMaterials() {
  return {
    track: new THREE.MeshStandardMaterial({ color: COLORS.track, roughness: 0.45, metalness: 0.25 }),
    trackEdge: new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 1.2 }),
    gapWarn: new THREE.MeshStandardMaterial({ color: COLORS.red, emissive: COLORS.red, emissiveIntensity: 1.1 }),
    obstacle: new THREE.MeshStandardMaterial({ color: 0x28152e, emissive: COLORS.red, emissiveIntensity: 0.65, roughness: 0.38, metalness: 0.15 }),
    lowObstacle: new THREE.MeshStandardMaterial({ color: 0x1b2848, emissive: COLORS.violet, emissiveIntensity: 0.72 }),
    shard: new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 1.7, roughness: 0.25 }),
    orb: new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 1.9, roughness: 0.2 }),
    particle: new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 1 }),
    line: new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.0 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xbfdfff, transparent: true, opacity: 0.2, depthWrite: false })
  };
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0x395dff, 0x090011, 1.4));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-12, 28, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  scene.add(key);

  const pink = new THREE.PointLight(COLORS.pink, 8, 48);
  pink.position.set(-12, 8, 6);
  scene.add(pink);

  const cyan = new THREE.PointLight(COLORS.cyan, 8, 48);
  cyan.position.set(12, 7, -6);
  scene.add(cyan);
}

function setupCity() {
  const buildingGeos = [
    new THREE.BoxGeometry(4, 18, 4),
    new THREE.BoxGeometry(6, 28, 5),
    new THREE.BoxGeometry(5, 38, 5)
  ];

  for (let row = 0; row < 42; row += 1) {
    const z = -row * 16 - 12;
    for (const side of [-1, 1]) {
      const heightPick = Math.floor(Math.random() * buildingGeos.length);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.62 + Math.random() * 0.16, 0.52, 0.12 + Math.random() * 0.08),
        emissive: Math.random() > 0.5 ? COLORS.pink : COLORS.cyan,
        emissiveIntensity: 0.08 + Math.random() * 0.18,
        roughness: 0.55,
        metalness: 0.25
      });
      const b = new THREE.Mesh(buildingGeos[heightPick], mat);
      b.position.set(side * (18 + Math.random() * 22), -9 + b.geometry.parameters.height / 2, z + Math.random() * 10);
      b.rotation.y = (Math.random() - 0.5) * 0.2;
      b.castShadow = true;
      b.receiveShadow = true;
      groups.city.add(b);

      if (Math.random() > 0.45) addSign(side, b.position.x, b.position.y + b.geometry.parameters.height * 0.32, b.position.z);
    }
  }
}

function addSign(side, x, y, z) {
  const sign = new THREE.Group();
  const color = Math.random() > 0.5 ? COLORS.pink : COLORS.cyan;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.1, 0.1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  panel.position.set(0, 0, 0);
  sign.add(panel);
  sign.position.set(x - side * 2.7, y, z);
  sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  sign.userData = { baseY: y, phase: Math.random() * Math.PI * 2 };
  groups.city.add(sign);
  signs.push(sign);
}

function setupClouds() {
  const cloudGeo = new THREE.PlaneGeometry(28, 8);
  for (let i = 0; i < 26; i += 1) {
    const cloud = new THREE.Mesh(cloudGeo, pooledMaterials.cloud.clone());
    cloud.position.set((Math.random() - 0.5) * 90, -7 - Math.random() * 7, -i * 20);
    cloud.rotation.x = -Math.PI / 2;
    cloud.rotation.z = Math.random() * Math.PI;
    cloud.scale.setScalar(0.8 + Math.random() * 1.8);
    cloud.userData = { drift: 0.5 + Math.random() * 1.2 };
    groups.city.add(cloud);
  }
}

function setupSpeedLines() {
  const geo = new THREE.BoxGeometry(0.035, 0.035, 6);
  for (let i = 0; i < 80; i += 1) {
    const line = new THREE.Mesh(geo, pooledMaterials.line.clone());
    resetSpeedLine(line, true);
    groups.speedLines.add(line);
  }
}

function resetSpeedLine(line, randomZ = false) {
  line.position.set((Math.random() - 0.5) * 24, 1 + Math.random() * 8, randomZ ? -Math.random() * 90 : -90);
  line.rotation.z = (Math.random() - 0.5) * 0.16;
}

function makeBike() {
  const bike = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111729, roughness: 0.28, metalness: 0.62 });
  const cyanMat = new THREE.MeshStandardMaterial({ color: COLORS.cyan, emissive: COLORS.cyan, emissiveIntensity: 1.6, roughness: 0.22 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: COLORS.pink, emissive: COLORS.pink, emissiveIntensity: 1.5 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.45, 3.3), bodyMat);
  chassis.position.y = 0.5;
  chassis.castShadow = true;
  bike.add(chassis);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.35, 4), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 0.52, -2.18);
  nose.castShadow = true;
  bike.add(nose);

  for (const x of [-0.86, 0.86]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 2.35), cyanMat);
    wing.position.set(x, 0.36, -0.22);
    wing.castShadow = true;
    bike.add(wing);

    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 10), pinkMat);
    pod.position.set(x, 0.3, 1.2);
    bike.add(pod);
  }

  const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 8, 12), new THREE.MeshStandardMaterial({ color: 0xf2fbff, emissive: 0x122849, emissiveIntensity: 0.5 }));
  rider.position.set(0, 1.0, 0.08);
  rider.rotation.x = -0.45;
  rider.castShadow = true;
  bike.add(rider);

  const trailMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 2; i += 1) {
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 3.2, 16, 1, true), trailMat.clone());
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(i === 0 ? -0.42 : 0.42, 0.25, 2.55);
    trail.userData.trail = true;
    bike.add(trail);
  }

  bike.position.set(0, 1.35, PLAYER_Z);
  return bike;
}

function resetRun() {
  clearGroup(groups.track);
  clearGroup(groups.gameplay);
  clearGroup(groups.particles);
  groups.track.position.set(0, 0, 0);
  groups.gameplay.position.set(0, 0, 0);
  groups.particles.position.set(0, 0, 0);
  segments.length = 0;
  obstacles.length = 0;
  collectibles.length = 0;
  particles.length = 0;

  world.distance = 0;
  world.score = 0;
  world.shards = 0;
  world.combo = 1;
  world.comboTimer = 0;
  world.speed = 34;
  world.targetSpeed = 34;
  world.boost = 100;
  world.boostActive = false;
  world.shake = 0;
  world.flash = 0;
  world.nextSegmentIndex = 0;
  world.lastSafeLane = 1;
  world.roadOffset = 0;

  player.lane = 1;
  player.targetLane = 1;
  player.x = LANES[1];
  player.y = 1.35;
  player.vy = 0;
  player.grounded = true;
  player.mesh.position.set(player.x, player.y, PLAYER_Z);
  player.mesh.rotation.set(0, 0, 0);

  for (let i = 0; i < ACTIVE_SEGMENTS; i += 1) spawnSegment();
  updateHud();
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

// Procedural road generation keeps at least one safe lane and avoids impossible obstacle patterns.
function spawnSegment() {
  const index = world.nextSegmentIndex;
  const z = -index * SEGMENT_LENGTH;
  const difficulty = Math.min(1, index / 80);
  const segment = { z, lanes: [true, true, true], index, parts: [] };

  if (index > 5 && Math.random() < 0.18 + difficulty * 0.16) {
    const missing = Math.floor(Math.random() * 3);
    segment.lanes[missing] = false;
    world.lastSafeLane = segment.lanes[world.lastSafeLane] ? world.lastSafeLane : segment.lanes.findIndex(Boolean);
  }

  const safeLane = Math.floor(Math.random() * 3);
  segment.lanes[safeLane] = true;

  for (let lane = 0; lane < 3; lane += 1) {
    if (!segment.lanes[lane]) {
      segment.parts.push(addGapWarning(LANES[lane], z));
      continue;
    }
    segment.parts.push(...addRoadPiece(LANES[lane], z));
  }

  if (index > 3) populateSegment(segment, safeLane, difficulty);
  segments.push(segment);
  world.nextSegmentIndex += 1;
}

function addRoadPiece(x, z) {
  const parts = [];
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.36, SEGMENT_LENGTH - 0.9), pooledMaterials.track);
  slab.position.set(x, TRACK_Y, z);
  slab.receiveShadow = true;
  groups.track.add(slab);
  parts.push(slab);

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, SEGMENT_LENGTH - 1.4), pooledMaterials.trackEdge);
    edge.position.set(x + side * 2.32, 0.28, z);
    groups.track.add(edge);
    parts.push(edge);
  }
  return parts;
}

function addGapWarning(x, z) {
  const warn = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 0.6), pooledMaterials.gapWarn);
  warn.position.set(x, 0.18, z + SEGMENT_LENGTH * 0.34);
  groups.track.add(warn);
  return warn;
}

function populateSegment(segment, safeLane, difficulty) {
  const used = new Set();
  const obstacleCount = Math.random() < 0.42 + difficulty * 0.24 ? 1 : 0;
  for (let i = 0; i < obstacleCount; i += 1) {
    const possible = [0, 1, 2].filter((lane) => segment.lanes[lane] && lane !== safeLane && !used.has(lane));
    if (!possible.length) break;
    const lane = possible[Math.floor(Math.random() * possible.length)];
    used.add(lane);
    addObstacle(lane, segment.z + (Math.random() - 0.5) * 6, Math.random() < 0.35 ? "low" : "major");
  }

  if (Math.random() < 0.72) {
    const lane = segment.lanes[safeLane] ? safeLane : segment.lanes.findIndex(Boolean);
    addShardLine(lane, segment.z);
  }

  if (Math.random() < 0.12 + difficulty * 0.08) {
    const lanes = [0, 1, 2].filter((lane) => segment.lanes[lane] && !used.has(lane));
    if (lanes.length) addBoostOrb(lanes[Math.floor(Math.random() * lanes.length)], segment.z - 2);
  }
}

function addObstacle(lane, z, type) {
  const isLow = type === "low";
  const geo = isLow ? new THREE.BoxGeometry(3.4, 0.85, 1.0) : new THREE.BoxGeometry(3.4, 2.5, 1.25);
  const mesh = new THREE.Mesh(geo, isLow ? pooledMaterials.lowObstacle : pooledMaterials.obstacle);
  mesh.position.set(LANES[lane], isLow ? 0.65 : 1.45, z);
  mesh.castShadow = true;
  mesh.userData = { kind: "obstacle", lane, type };
  groups.gameplay.add(mesh);
  obstacles.push(mesh);
}

function addShardLine(lane, z) {
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), pooledMaterials.shard);
    shard.position.set(LANES[lane], 1.25 + Math.sin(i) * 0.15, z - 5 + i * 2.7);
    shard.rotation.set(Math.random(), Math.random(), Math.random());
    shard.userData = { kind: "shard", lane, phase: Math.random() * Math.PI * 2 };
    groups.gameplay.add(shard);
    collectibles.push(shard);
  }
}

function addBoostOrb(lane, z) {
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16), pooledMaterials.orb);
  orb.position.set(LANES[lane], 1.45, z);
  orb.userData = { kind: "boost", lane, phase: Math.random() * Math.PI * 2 };
  groups.gameplay.add(orb);
  collectibles.push(orb);
}

function setState(state) {
  world.state = state;
  dom.menu.hidden = state !== "menu";
  dom.pause.hidden = state !== "paused";
  dom.gameOver.hidden = state !== "gameover";
  dom.menuBest.textContent = `Best score ${world.best}`;
  dom.best.textContent = `Best ${world.best}`;
}

function startRun() {
  ensureAudio();
  resetRun();
  setState("playing");
  playTone(220, 0.08, "sawtooth", 0.03);
  playTone(440, 0.12, "triangle", 0.02, 0.05);
}

function endRun(reason) {
  if (world.state !== "playing") return;
  world.state = "gameover";
  world.shake = reason === "fall" ? 1.5 : 1.0;
  world.best = Math.max(world.best, Math.floor(world.score));
  localStorage.setItem("neonDriftBest", String(world.best));
  dom.finalScore.textContent = Math.floor(world.score);
  dom.finalDistance.textContent = `${Math.floor(world.distance)} m`;
  dom.finalShards.textContent = world.shards;
  dom.finalBest.textContent = world.best;
  spawnBurst(player.mesh.position, COLORS.red, 42, 1.5);
  playTone(72, 0.28, "sawtooth", 0.06);
  setState("gameover");
}

function togglePause() {
  if (world.state === "playing") setState("paused");
  else if (world.state === "paused") setState("playing");
}

function update(dt) {
  const time = performance.now() / 1000;
  animateCity(dt, time);
  updateParticles(dt);

  if (world.state !== "playing") {
    updateCamera(dt);
    return;
  }

  const boosting = (keys.has("ShiftLeft") || keys.has("ShiftRight") || world.boostActive) && world.boost > 1;
  const difficultySpeed = 34 + Math.min(38, world.distance * 0.012);
  world.targetSpeed = difficultySpeed + (boosting ? 22 : 0);
  world.speed += (world.targetSpeed - world.speed) * Math.min(1, dt * 3.5);
  world.distance += world.speed * dt;
  world.score += world.speed * dt * (0.6 + world.combo * 0.07);
  world.comboTimer = Math.max(0, world.comboTimer - dt);
  if (world.comboTimer <= 0) world.combo = Math.max(1, world.combo - dt * 0.9);

  if (boosting) {
    world.boost = Math.max(0, world.boost - 27 * dt);
    spawnEngineParticles(2);
  } else {
    world.boost = Math.min(100, world.boost + 8 * dt);
  }

  handleInput();
  updatePlayer(dt);
  moveWorld(dt);
  checkCollisions();
  recycleWorld();
  updateCamera(dt);
  updateHud();
  updateSpeedLines(dt, boosting);
  updateAudio(dt, boosting);
}

function handleInput() {
  if (consume("ArrowLeft") || consume("KeyA")) player.targetLane = Math.max(0, player.targetLane - 1);
  if (consume("ArrowRight") || consume("KeyD")) player.targetLane = Math.min(2, player.targetLane + 1);
  if (consume("Space") && player.grounded) {
    player.vy = 15.5;
    player.grounded = false;
    playTone(330, 0.07, "triangle", 0.025);
    spawnBurst(player.mesh.position, COLORS.cyan, 12, 0.55);
  }
}

function consume(code) {
  if (!pressed.has(code)) return false;
  pressed.delete(code);
  return true;
}

function updatePlayer(dt) {
  player.x += (LANES[player.targetLane] - player.x) * Math.min(1, dt * 11);
  player.vy -= 31 * dt;
  player.y += player.vy * dt;
  if (player.y <= 1.35) {
    player.y = 1.35;
    player.vy = 0;
    player.grounded = true;
  }

  player.mesh.position.set(player.x, player.y, PLAYER_Z);
  const lean = (LANES[player.targetLane] - player.x) * -0.12;
  player.mesh.rotation.z += (lean - player.mesh.rotation.z) * Math.min(1, dt * 8);
  player.mesh.rotation.x = Math.sin(performance.now() / 90) * 0.025 + (world.targetSpeed - 34) * -0.002;
  player.mesh.traverse((child) => {
    if (child.userData.trail) child.scale.z = 1 + (world.speed - 34) * 0.022 + (world.targetSpeed > world.speed ? 0.4 : 0);
  });
}

function moveWorld(dt) {
  const dz = world.speed * dt;
  groups.track.position.z += dz;
  groups.gameplay.position.z += dz;
  world.roadOffset += dz;
}

function checkCollisions() {
  const playerWorldZ = PLAYER_Z - groups.gameplay.position.z;
  const lane = nearestLane(player.x);
  const segment = segments.find((s) => Math.abs(s.z - playerWorldZ) < SEGMENT_LENGTH * 0.5);
  if (segment && !segment.lanes[lane] && player.y < 2.05) {
    endRun("fall");
    return;
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    const z = obstacle.position.z + groups.gameplay.position.z;
    const dx = Math.abs(obstacle.position.x - player.x);
    const dz = Math.abs(z - PLAYER_Z);
    if (dx < 2.0 && dz < 1.55) {
      if (obstacle.userData.type === "low" && player.y > 2.05) continue;
      endRun("crash");
      return;
    }
  }

  for (let i = collectibles.length - 1; i >= 0; i -= 1) {
    const item = collectibles[i];
    const z = item.position.z + groups.gameplay.position.z;
    const dx = Math.abs(item.position.x - player.x);
    const dy = Math.abs(item.position.y - player.y);
    if (dx < 1.55 && Math.abs(z - PLAYER_Z) < 1.7 && dy < 2.1) {
      if (item.userData.kind === "shard") collectShard(item);
      else collectBoost(item);
      groups.gameplay.remove(item);
      collectibles.splice(i, 1);
    }
  }
}

function collectShard(item) {
  world.shards += 1;
  world.combo = Math.min(8, Math.floor(world.combo + 1));
  world.comboTimer = 2.8;
  world.score += 150 * world.combo;
  spawnBurst(item.position.clone().add(new THREE.Vector3(0, 0, groups.gameplay.position.z)), COLORS.gold, 18, 0.65);
  playTone(680 + world.combo * 35, 0.055, "sine", 0.025);
}

function collectBoost(item) {
  world.boost = Math.min(100, world.boost + 38);
  world.score += 250;
  spawnBurst(item.position.clone().add(new THREE.Vector3(0, 0, groups.gameplay.position.z)), COLORS.cyan, 24, 0.8);
  playTone(220, 0.06, "triangle", 0.025);
  playTone(520, 0.1, "triangle", 0.02, 0.04);
}

function nearestLane(x) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < LANES.length; i += 1) {
    const dist = Math.abs(x - LANES[i]);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

function recycleWorld() {
  while (segments.length && segments[0].z + groups.track.position.z > PLAYER_Z + SEGMENT_LENGTH) {
    const old = segments.shift();
    for (const part of old.parts) groups.track.remove(part);
    spawnSegment();
  }

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    if (obstacles[i].position.z + groups.gameplay.position.z > PLAYER_Z + 10) {
      groups.gameplay.remove(obstacles[i]);
      obstacles.splice(i, 1);
    }
  }

  for (let i = collectibles.length - 1; i >= 0; i -= 1) {
    if (collectibles[i].position.z + groups.gameplay.position.z > PLAYER_Z + 10) {
      world.combo = Math.max(1, world.combo - 0.5);
      groups.gameplay.remove(collectibles[i]);
      collectibles.splice(i, 1);
    }
  }
}

function animateCity(dt, time) {
  groups.city.position.z += world.state === "playing" ? world.speed * dt * 0.42 : dt * 5;
  if (groups.city.position.z > 16) groups.city.position.z -= 16;

  for (const sign of signs) {
    sign.position.y = sign.userData.baseY + Math.sin(time * 2 + sign.userData.phase) * 0.18;
    sign.children[0].material.opacity = 0.55 + Math.sin(time * 5 + sign.userData.phase) * 0.22;
  }

  for (const item of collectibles) {
    item.rotation.y += dt * 3.2;
    item.rotation.x += dt * 1.4;
    item.position.y += Math.sin(time * 4 + item.userData.phase) * dt * 0.6;
  }

  for (const obstacle of obstacles) {
    if (obstacle.userData.type === "major") obstacle.rotation.y += dt * 0.35;
  }
}

function updateCamera(dt) {
  const boostKick = world.targetSpeed > 50 ? 1.7 : 0;
  const desired = new THREE.Vector3(player.x * 0.45, 7.1 + boostKick * 0.25, PLAYER_Z + 15 + boostKick);
  camera.position.lerp(desired, Math.min(1, dt * 5.5));
  const look = new THREE.Vector3(player.x * 0.28, 1.9, PLAYER_Z - 16 - boostKick * 2.5);
  camera.lookAt(look);

  if (world.shake > 0) {
    const amount = world.shake * 0.45;
    camera.position.x += (Math.random() - 0.5) * amount;
    camera.position.y += (Math.random() - 0.5) * amount;
    world.shake = Math.max(0, world.shake - dt * 2.4);
  }
}

function updateSpeedLines(dt, boosting) {
  const targetOpacity = boosting || world.speed > 48 ? 0.55 : 0.12;
  for (const line of groups.speedLines.children) {
    line.material.opacity += (targetOpacity - line.material.opacity) * 0.08;
    line.position.z += world.speed * 1.7 * dt;
    if (line.position.z > 12) resetSpeedLine(line);
  }
}

function spawnEngineParticles(count) {
  for (let i = 0; i < count; i += 1) {
    const pos = player.mesh.position.clone();
    pos.x += (Math.random() - 0.5) * 1.4;
    pos.y += 0.1 + Math.random() * 0.4;
    pos.z += 2.3 + Math.random() * 0.6;
    spawnParticle(pos, Math.random() > 0.45 ? COLORS.cyan : COLORS.pink, 0.4, 0.7);
  }
}

function spawnBurst(position, color, count, power) {
  const worldPosition = position.clone();
  for (let i = 0; i < count; i += 1) {
    spawnParticle(worldPosition, color, 0.42 + Math.random() * 0.3, power);
  }
}

function spawnParticle(position, color, life, power) {
  const material = pooledMaterials.particle.clone();
  material.color.setHex(color);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.09, 8, 6), material);
  mesh.position.copy(position);
  groups.particles.add(mesh);
  particles.push({
    mesh,
    life,
    max: life,
    vel: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.2) * 3, (Math.random() - 0.5) * 5).multiplyScalar(power)
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 4 * dt;
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.max);
    p.mesh.scale.setScalar(Math.max(0.05, p.life / p.max));
    if (p.life <= 0) {
      groups.particles.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

function updateHud() {
  dom.score.textContent = Math.floor(world.score);
  dom.speed.textContent = Math.floor(world.speed * 3);
  dom.boostText.textContent = `${Math.floor(world.boost)}%`;
  dom.boostBar.style.transform = `scaleX(${Math.max(0, Math.min(1, world.boost / 100))})`;
  dom.combo.textContent = `x${Math.max(1, Math.floor(world.combo))}`;
  dom.best.textContent = `Best ${world.best}`;
  dom.shards.textContent = `Shards ${world.shards}`;
  dom.distance.textContent = `${Math.floor(world.distance)} m`;
}

function ensureAudio() {
  if (audio || world.muted) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio = {
    ctx: new Ctx(),
    musicGain: null,
    bass: null,
    pad: null,
    lfo: null
  };
  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = 0.035;
  audio.musicGain.connect(audio.ctx.destination);

  audio.bass = audio.ctx.createOscillator();
  audio.bass.type = "sawtooth";
  audio.bass.frequency.value = 55;
  audio.bass.connect(audio.musicGain);
  audio.bass.start();

  audio.pad = audio.ctx.createOscillator();
  audio.pad.type = "triangle";
  audio.pad.frequency.value = 110;
  audio.pad.connect(audio.musicGain);
  audio.pad.start();
}

function updateAudio(dt, boosting) {
  if (!audio || world.muted) return;
  const now = audio.ctx.currentTime;
  const gain = boosting ? 0.055 : 0.035;
  audio.musicGain.gain.setTargetAtTime(gain, now, 0.08);
  audio.bass.frequency.setTargetAtTime(55 + (world.speed - 34) * 0.35, now, 0.05);
  audio.pad.frequency.setTargetAtTime(110 + Math.sin(performance.now() / 700) * 6, now, 0.15);
}

function playTone(freq, duration, type, gain, delay = 0) {
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

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  update(dt);
  renderer.render(scene, camera);
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
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "Escape") togglePause();
  if (event.code === "KeyR" && world.state === "gameover") startRun();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

dom.startBtn.addEventListener("click", startRun);
dom.restartBtn.addEventListener("click", startRun);
dom.restartFromPauseBtn.addEventListener("click", startRun);
dom.resumeBtn.addEventListener("click", () => setState("playing"));
dom.menuBtn.addEventListener("click", () => setState("menu"));
dom.muteBtn.addEventListener("click", () => {
  world.muted = !world.muted;
  dom.muteBtn.textContent = world.muted ? "Sound Off" : "Sound On";
  dom.muteBtn.setAttribute("aria-pressed", String(world.muted));
  if (audio) audio.musicGain.gain.value = world.muted ? 0 : 0.035;
});

bindTouch(dom.touchLeft, () => pressed.add("ArrowLeft"));
bindTouch(dom.touchRight, () => pressed.add("ArrowRight"));
bindTouch(dom.touchJump, () => pressed.add("Space"));
bindTouch(dom.touchBoost, null, (down) => {
  world.boostActive = down;
});

function bindTouch(button, tap, hold) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (tap) tap();
    if (hold) hold(true);
  });
  button.addEventListener("pointerup", () => hold?.(false));
  button.addEventListener("pointercancel", () => hold?.(false));
  button.addEventListener("pointerleave", () => hold?.(false));
}
