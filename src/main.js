const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const dom = {
  menu: document.getElementById("menu"),
  blockName: document.getElementById("blockName"),
  mode: document.getElementById("mode"),
  pos: document.getElementById("pos"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  slots: [...document.querySelectorAll(".slot")]
};

const BLOCKS = [
  { name: "Grass", top: "#69d36d", side: "#56b85a", dark: "#357a38" },
  { name: "Dirt", top: "#9a6d49", side: "#8a603f", dark: "#5a3d29" },
  { name: "Stone", top: "#a4a6af", side: "#8d8f98", dark: "#666873" },
  { name: "Sand", top: "#e2c17f", side: "#c9a66b", dark: "#96774a" },
  { name: "Water", top: "rgba(92,163,255,0.72)", side: "rgba(54,113,204,0.72)", dark: "rgba(33,78,154,0.72)" },
  { name: "Wood", top: "#7b5130", side: "#5b3a24", dark: "#3b2416" }
];

const world = {
  size: 42,
  sea: 4,
  blocks: new Map(),
  selected: 0,
  running: false,
  zoom: 28,
  cameraX: 0,
  cameraY: 0,
  target: null
};

const player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0
};

const keys = new Set();
const pointer = { x: 0, y: 0 };
const particles = [];

generateWorld();
resize();
requestAnimationFrame(loop);

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function getBlock(x, y, z) {
  return world.blocks.get(key(x, y, z));
}

function setBlock(x, y, z, id) {
  const k = key(x, y, z);
  if (id == null) world.blocks.delete(k);
  else world.blocks.set(k, id);
}

function generateWorld() {
  world.blocks.clear();
  const half = Math.floor(world.size / 2);
  for (let x = -half; x <= half; x++) {
    for (let y = -half; y <= half; y++) {
      const h = heightAt(x, y);
      for (let z = 0; z <= h; z++) {
        setBlock(x, y, z, z === h ? 0 : z > h - 3 ? 1 : 2);
      }
      if (h < world.sea) {
        for (let z = h + 1; z <= world.sea; z++) setBlock(x, y, z, 4);
        setBlock(x, y, h, 3);
      }
      if (h > world.sea + 1 && noise(x * 0.6 + 9, y * 0.6 - 4) > 0.82) addTree(x, y, h + 1);
    }
  }
  player.x = 0;
  player.y = 0;
  world.cameraX = 0;
  world.cameraY = 0;
  updateHotbar();
}

function heightAt(x, y) {
  const h = 5 + Math.sin(x * 0.35) * 2 + Math.cos(y * 0.31) * 2 + noise(x * 0.18, y * 0.18) * 4;
  return Math.max(1, Math.min(12, Math.floor(h)));
}

function noise(x, y) {
  return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

function fract(v) {
  return v - Math.floor(v);
}

function addTree(x, y, z) {
  for (let i = 0; i < 4; i++) setBlock(x, y, z + i, 5);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = 2; dz <= 4; dz++) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz - 3) < 5) setBlock(x + dx, y + dy, z + dz, 0);
      }
    }
  }
}

function start() {
  world.running = true;
  dom.menu.hidden = true;
}

function update(dt) {
  if (world.running) {
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 10 : 6;
    const ax = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    const ay = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    player.vx += (ax * speed - player.vx) * Math.min(1, dt * 10);
    player.vy += (ay * speed - player.vy) * Math.min(1, dt * 10);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    world.cameraX += (player.x - world.cameraX) * Math.min(1, dt * 7);
    world.cameraY += (player.y - world.cameraY) * Math.min(1, dt * 7);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  updateHud();
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#89c8ff");
  sky.addColorStop(0.62, "#d9f6ff");
  sky.addColorStop(1, "#6abb74");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  world.target = null;
  const entries = [...world.blocks.entries()].map(([k, id]) => {
    const [x, y, z] = k.split(",").map(Number);
    return { x, y, z, id, depth: x + y + z * 0.2 };
  }).sort((a, b) => a.depth - b.depth || a.z - b.z);

  for (const b of entries) {
    if (!isVisible(b.x, b.y, b.z)) continue;
    const p = project(b.x, b.y, b.z);
    if (p.x < -80 || p.x > w + 80 || p.y < -120 || p.y > h + 100) continue;
    drawCube(p.x, p.y, world.zoom, BLOCKS[b.id]);
    if (pointInDiamond(pointer.x, pointer.y, p.x, p.y - world.zoom * 0.5, world.zoom)) {
      world.target = b;
    }
  }

  const pp = project(Math.round(player.x), Math.round(player.y), topHeight(Math.round(player.x), Math.round(player.y)) + 1);
  drawPlayer(pp.x, pp.y - world.zoom * 0.45);

  if (world.target) {
    const p = project(world.target.x, world.target.y, world.target.z);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    drawTopDiamond(p.x, p.y, world.zoom + 4);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 5, 5);
    ctx.globalAlpha = 1;
  }
}

function isVisible(x, y, z) {
  return !getBlock(x, y, z + 1) || !getBlock(x + 1, y, z) || !getBlock(x, y + 1, z);
}

function topHeight(x, y) {
  for (let z = 20; z >= 0; z--) {
    if (getBlock(x, y, z) != null) return z;
  }
  return 0;
}

function project(x, y, z) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 120;
  const dx = x - world.cameraX;
  const dy = y - world.cameraY;
  return {
    x: cx + (dx - dy) * world.zoom,
    y: cy + (dx + dy) * world.zoom * 0.5 - z * world.zoom * 0.72
  };
}

function drawCube(x, y, s, block) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.5);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s * 0.5);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fillStyle = block.top;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x, y + s * 0.5);
  ctx.lineTo(x, y + s * 1.2);
  ctx.lineTo(x - s, y + s * 0.7);
  ctx.closePath();
  ctx.fillStyle = block.side;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x, y + s * 0.5);
  ctx.lineTo(x, y + s * 1.2);
  ctx.lineTo(x + s, y + s * 0.7);
  ctx.closePath();
  ctx.fillStyle = block.dark;
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = 1;
  drawTopDiamond(x, y, s);
}

function drawTopDiamond(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.5);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s * 0.5);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.stroke();
}

function drawPlayer(x, y) {
  ctx.fillStyle = "#f7fbff";
  ctx.beginPath();
  ctx.arc(x, y - 17, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d62ff";
  ctx.fillRect(x - 9, y - 8, 18, 24);
  ctx.fillStyle = "#1b2550";
  ctx.fillRect(x - 13, y + 12, 9, 16);
  ctx.fillRect(x + 4, y + 12, 9, 16);
}

function pointInDiamond(px, py, x, y, s) {
  return Math.abs(px - x) / s + Math.abs(py - y) / (s * 0.5) < 0.9;
}

function mine() {
  if (!world.target) return;
  const { x, y, z, id } = world.target;
  if (z <= 0) return;
  setBlock(x, y, z, null);
  burst(project(x, y, z), BLOCKS[id].top);
}

function place() {
  if (!world.target) return;
  const { x, y, z } = world.target;
  setBlock(x, y, z + 1, world.selected);
  burst(project(x, y, z + 1), BLOCKS[world.selected].top);
}

function burst(pos, color) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 70 + Math.random() * 120;
    const life = 0.25 + Math.random() * 0.25;
    particles.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, life, max: life });
  }
}

function updateHud() {
  dom.blockName.textContent = BLOCKS[world.selected].name;
  dom.mode.textContent = world.running ? "Build" : "Menu";
  dom.pos.textContent = `${Math.floor(player.x)} ${Math.floor(player.y)}`;
}

function updateHotbar() {
  dom.slots.forEach((slot, i) => slot.classList.toggle("active", i === world.selected));
  dom.blockName.textContent = BLOCKS[world.selected].name;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function loop(time) {
  const dt = Math.min(0.033, ((time - (loop.last || time)) / 1000) || 0);
  loop.last = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (/^Digit[1-6]$/.test(event.code)) {
    world.selected = Number(event.code.slice(5)) - 1;
    updateHotbar();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("mousemove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
window.addEventListener("mousedown", (event) => {
  if (!world.running) start();
  if (event.button === 0) mine();
  if (event.button === 2) place();
});
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("wheel", (event) => {
  world.zoom = Math.max(18, Math.min(44, world.zoom - Math.sign(event.deltaY) * 2));
});

dom.startBtn.addEventListener("click", start);
dom.resetBtn.addEventListener("click", generateWorld);
dom.slots.forEach((slot, i) => {
  slot.addEventListener("click", () => {
    world.selected = i;
    updateHotbar();
  });
});
