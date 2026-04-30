import * as THREE from "three";

const dom = {
  root: document.getElementById("game"),
  menu: document.getElementById("menu"),
  blockName: document.getElementById("blockName"),
  mode: document.getElementById("mode"),
  pos: document.getElementById("pos"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  slots: [...document.querySelectorAll(".slot")]
};

const BLOCKS = [
  { id: 1, name: "Grass", color: 0x56b85a, top: 0x6ed36d },
  { id: 2, name: "Dirt", color: 0x8a603f },
  { id: 3, name: "Stone", color: 0x8d8f98 },
  { id: 4, name: "Sand", color: 0xc9a66b },
  { id: 5, name: "Water", color: 0x5ca3ff, transparent: true },
  { id: 6, name: "Wood", color: 0x5b3a24, top: 0x7b5130 }
];

const WORLD = {
  size: 48,
  height: 18,
  sea: 5,
  block: 1
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fcfff);
scene.fog = new THREE.Fog(0x8fcfff, 42, 120);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 160);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
dom.root.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = new Set();
const raycaster = new THREE.Raycaster();
const blocks = new Map();
const blockMeshes = new Map();
const materials = new Map();
const tempVec = new THREE.Vector3();
const target = { mesh: null, pos: null, normal: null };

const player = {
  position: new THREE.Vector3(0, 14, 0),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  grounded: false,
  selected: 0,
  playing: false,
  locked: false
};

const groups = {
  blocks: new THREE.Group(),
  effects: new THREE.Group(),
  clouds: new THREE.Group()
};
scene.add(groups.blocks, groups.effects, groups.clouds);

let audio = null;

setupLights();
setupMaterials();
setupClouds();
generateWorld();
updateHotbar();
animate();

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x547047, 1.45));

  const sun = new THREE.DirectionalLight(0xffffff, 2.15);
  sun.position.set(-22, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);
}

function setupMaterials() {
  for (const block of BLOCKS) {
    materials.set(block.id, new THREE.MeshStandardMaterial({
      color: block.color,
      transparent: Boolean(block.transparent),
      opacity: block.transparent ? 0.72 : 1,
      roughness: 0.82,
      metalness: 0.02
    }));
  }
  materials.set("highlight", new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, wireframe: true }));
}

function setupClouds() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false });
  for (let i = 0; i < 18; i += 1) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 4; p += 1) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 5, 1.3, 2.4 + Math.random() * 3), mat);
      cube.position.set(p * 3.2, Math.random() * 0.5, (Math.random() - 0.5) * 3);
      cloud.add(cube);
    }
    cloud.position.set((Math.random() - 0.5) * 90, 26 + Math.random() * 10, (Math.random() - 0.5) * 90);
    groups.clouds.add(cloud);
  }
}

function generateWorld() {
  clearWorld();
  const half = WORLD.size / 2;
  for (let x = -half; x < half; x += 1) {
    for (let z = -half; z < half; z += 1) {
      const h = terrainHeight(x, z);
      for (let y = 0; y <= h; y += 1) {
        const id = y === h ? 1 : y > h - 3 ? 2 : 3;
        setBlock(x, y, z, id, false);
      }
      if (h < WORLD.sea) {
        for (let y = h + 1; y <= WORLD.sea; y += 1) setBlock(x, y, z, 5, false);
        if (getBlock(x, h, z) === 1) setBlock(x, h, z, 4, false);
      }
      if (h > WORLD.sea + 1 && noise(x * 0.4 + 8, z * 0.4 - 2) > 0.76) addTree(x, h + 1, z);
    }
  }
  rebuildVisibleBlocks();
  player.position.set(0, terrainHeight(0, 0) + 4, 0);
}

function clearWorld() {
  blocks.clear();
  blockMeshes.clear();
  while (groups.blocks.children.length) groups.blocks.remove(groups.blocks.children[0]);
}

function terrainHeight(x, z) {
  const n =
    Math.sin(x * 0.23) * 2.2 +
    Math.cos(z * 0.19) * 2.0 +
    Math.sin((x + z) * 0.11) * 2.5 +
    noise(x * 0.13, z * 0.13) * 4;
  return Math.max(2, Math.min(WORLD.height - 3, Math.floor(6 + n)));
}

function noise(x, z) {
  return fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
}

function fract(v) {
  return v - Math.floor(v);
}

function addTree(x, y, z) {
  for (let i = 0; i < 4; i += 1) setBlock(x, y + i, z, 6, false);
  for (let lx = -2; lx <= 2; lx += 1) {
    for (let lz = -2; lz <= 2; lz += 1) {
      for (let ly = 2; ly <= 4; ly += 1) {
        if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - 3) < 5) setBlock(x + lx, y + ly, z + lz, 1, false);
      }
    }
  }
}

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function getBlock(x, y, z) {
  return blocks.get(key(x, y, z)) || 0;
}

function setBlock(x, y, z, id, rebuild = true) {
  if (y < 0 || y >= WORLD.height + 8) return;
  const k = key(x, y, z);
  if (id === 0) blocks.delete(k);
  else blocks.set(k, id);
  if (rebuild) rebuildAround(x, y, z);
}

function rebuildVisibleBlocks() {
  for (const [k, id] of blocks) {
    const [x, y, z] = k.split(",").map(Number);
    if (isVisible(x, y, z)) createMesh(x, y, z, id);
  }
}

function rebuildAround(x, y, z) {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bx = x + dx;
        const by = y + dy;
        const bz = z + dz;
        const k = key(bx, by, bz);
        const existing = blockMeshes.get(k);
        if (existing) {
          groups.blocks.remove(existing);
          blockMeshes.delete(k);
        }
        const id = getBlock(bx, by, bz);
        if (id && isVisible(bx, by, bz)) createMesh(bx, by, bz, id);
      }
    }
  }
}

function isVisible(x, y, z) {
  return [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
  ].some(([dx, dy, dz]) => getBlock(x + dx, y + dy, z + dz) === 0 || getBlock(x + dx, y + dy, z + dz) === 5);
}

function createMesh(x, y, z, id) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.get(id));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = id !== 5;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, id };
  groups.blocks.add(mesh);
  blockMeshes.set(key(x, y, z), mesh);
}

function start() {
  ensureAudio();
  player.playing = true;
  dom.menu.hidden = true;
  lockPointer();
}

function lockPointer() {
  const request = renderer.domElement.requestPointerLock?.();
  if (request?.catch) request.catch(() => {
    player.locked = false;
  });
}

function update(dt) {
  updateMovement(dt);
  updateTarget();
  updateHud();
  animateWorld(dt);
  renderer.render(scene, camera);
}

function updateMovement(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw) * -1);
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys.has("KeyW")) wish.add(forward);
  if (keys.has("KeyS")) wish.sub(forward);
  if (keys.has("KeyD")) wish.add(right);
  if (keys.has("KeyA")) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7.2 : 4.9;
  player.velocity.x += (wish.x * speed - player.velocity.x) * Math.min(1, dt * 9);
  player.velocity.z += (wish.z * speed - player.velocity.z) * Math.min(1, dt * 9);
  player.velocity.y -= 22 * dt;

  if (keys.has("Space") && player.grounded) {
    player.velocity.y = 8.6;
    player.grounded = false;
    tone(340, 0.06, "triangle", 0.018);
  }

  moveAxis("x", player.velocity.x * dt);
  moveAxis("z", player.velocity.z * dt);
  moveAxis("y", player.velocity.y * dt);

  camera.position.copy(player.position);
  camera.position.y += 1.62;
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  if (player.position.y < -12) {
    player.position.set(0, terrainHeight(0, 0) + 4, 0);
    player.velocity.set(0, 0, 0);
  }
}

function moveAxis(axis, amount) {
  player.position[axis] += amount;
  const collision = collides(player.position);
  if (!collision) {
    if (axis === "y") player.grounded = false;
    return;
  }
  const dir = Math.sign(amount);
  while (collides(player.position)) player.position[axis] -= dir * 0.025;
  player.velocity[axis] = 0;
  if (axis === "y" && dir < 0) player.grounded = true;
}

function collides(pos) {
  const r = 0.32;
  const minX = Math.floor(pos.x - r);
  const maxX = Math.floor(pos.x + r);
  const minY = Math.floor(pos.y);
  const maxY = Math.floor(pos.y + 1.78);
  const minZ = Math.floor(pos.z - r);
  const maxZ = Math.floor(pos.z + r);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const id = getBlock(x, y, z);
        if (id && id !== 5) return true;
      }
    }
  }
  return false;
}

function updateTarget() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(groups.blocks.children, false).filter((hit) => hit.object.userData.id !== 5);
  target.mesh = null;
  target.pos = null;
  target.normal = null;
  if (!hits.length || hits[0].distance > 7) return;
  const hit = hits[0];
  target.mesh = hit.object;
  target.pos = hit.object.userData;
  target.normal = hit.face.normal.clone().applyEuler(hit.object.rotation).round();
}

function mineBlock() {
  if (!target.pos) return;
  const { x, y, z, id } = target.pos;
  if (y <= 0) return;
  setBlock(x, y, z, 0);
  burst(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), blockColor(id));
  tone(150, 0.045, "square", 0.022);
}

function placeBlock() {
  if (!target.pos || !target.normal) return;
  const x = target.pos.x + target.normal.x;
  const y = target.pos.y + target.normal.y;
  const z = target.pos.z + target.normal.z;
  if (getBlock(x, y, z)) return;
  const check = new THREE.Vector3(x + 0.5, y, z + 0.5);
  if (Math.abs(check.x - player.position.x) < 0.7 && Math.abs(check.z - player.position.z) < 0.7 && y < player.position.y + 1.9 && y > player.position.y - 0.4) return;
  setBlock(x, y, z, BLOCKS[player.selected].id);
  tone(220, 0.045, "triangle", 0.018);
}

function blockColor(id) {
  return BLOCKS.find((b) => b.id === id)?.color || 0xffffff;
}

function burst(position, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  for (let i = 0; i < 12; i += 1) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat.clone());
    p.position.copy(position);
    p.userData = {
      life: 0.35 + Math.random() * 0.25,
      vel: new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3)
    };
    groups.effects.add(p);
  }
}

function animateWorld(dt) {
  groups.clouds.children.forEach((cloud) => {
    cloud.position.x += dt * 0.8;
    if (cloud.position.x > 58) cloud.position.x = -58;
  });

  for (let i = groups.effects.children.length - 1; i >= 0; i -= 1) {
    const p = groups.effects.children[i];
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.vel.y -= 8 * dt;
    p.userData.life -= dt;
    p.material.opacity = Math.max(0, p.userData.life / 0.55);
    if (p.userData.life <= 0) groups.effects.remove(p);
  }

  if (target.mesh) {
    target.mesh.scale.setScalar(1 + Math.sin(performance.now() / 90) * 0.015);
  }
}

function updateHud() {
  const block = BLOCKS[player.selected];
  dom.blockName.textContent = block.name;
  dom.mode.textContent = player.locked ? "Build" : player.playing ? "Click" : "Menu";
  dom.pos.textContent = `${Math.floor(player.position.x)} ${Math.floor(player.position.y)} ${Math.floor(player.position.z)}`;
}

function updateHotbar() {
  dom.slots.forEach((slot, i) => slot.classList.toggle("active", i === player.selected));
  dom.blockName.textContent = BLOCKS[player.selected].name;
}

function ensureAudio() {
  if (audio) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio = { ctx: new Ctx() };
}

function tone(freq, duration, type, gain) {
  ensureAudio();
  if (!audio) return;
  const osc = audio.ctx.createOscillator();
  const vol = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.value = gain;
  vol.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + duration);
  osc.connect(vol);
  vol.connect(audio.ctx.destination);
  osc.start();
  osc.stop(audio.ctx.currentTime + duration);
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

document.addEventListener("pointerlockchange", () => {
  player.locked = document.pointerLockElement === renderer.domElement;
  dom.menu.hidden = player.playing;
});

window.addEventListener("mousemove", (event) => {
  if (!player.locked) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0022;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (/^Digit[1-6]$/.test(event.code)) {
    player.selected = Number(event.code.slice(5)) - 1;
    updateHotbar();
  }
  if (event.code === "Escape") document.exitPointerLock?.();
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("mousedown", (event) => {
  if (!player.playing) {
    start();
    return;
  }
  if (!player.locked) {
    lockPointer();
    return;
  }
  if (event.button === 0) mineBlock();
  if (event.button === 2) placeBlock();
});

window.addEventListener("contextmenu", (event) => event.preventDefault());

dom.startBtn.addEventListener("click", start);
dom.resetBtn.addEventListener("click", generateWorld);
renderer.domElement.addEventListener("click", () => {
  if (!player.playing) start();
  else if (!player.locked) lockPointer();
});
dom.slots.forEach((slot, i) => {
  slot.addEventListener("click", () => {
    player.selected = i;
    updateHotbar();
  });
});
