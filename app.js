const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = {
  money: document.getElementById("money"),
  guests: document.getElementById("guests"),
  happy: document.getElementById("happy"),
  clean: document.getElementById("clean"),
  rating: document.getElementById("rating"),
  toolGrid: document.getElementById("toolGrid"),
  selection: document.getElementById("selection"),
  rideList: document.getElementById("rideList"),
  toast: document.getElementById("toast"),
  appealBar: document.getElementById("appealBar"),
  queueBar: document.getElementById("queueBar"),
  litterBar: document.getElementById("litterBar"),
  pauseBtn: document.getElementById("pauseBtn"),
};

const W = 24;
const H = 24;
const tileW = 72;
const tileH = 36;
const objects = new Map();
const paths = new Set();
const water = new Set();
const litter = new Set();
const guests = [];
const particles = [];
let selectedGroup = "build";
let selectedTool = "path";
let selectedTile = null;
let money = 4200;
let happiness = 82;
let cleanliness = 94;
let rating = 2;
let speed = 1;
let paused = false;
let last = performance.now();
let hover = null;
let dragging = false;
let pointerDown = false;
let dragStart = null;
let cameraStart = null;
let zoom = 1;
const camera = { x: 0, y: 0 };
const keys = new Set();

const TOOLS = {
  build: [
    { id: "path", name: "Path", cost: 15, icon: "P", desc: "Connects guests" },
    { id: "remove", name: "Remove", cost: 0, icon: "X", desc: "Refunds a little" },
    { id: "carousel", name: "Carousel", cost: 420, icon: "C", desc: "Gentle ride" },
    { id: "wheel", name: "Wheel", cost: 760, icon: "W", desc: "Big appeal" },
    { id: "coaster", name: "Mini Coaster", cost: 980, icon: "R", desc: "High thrill" },
    { id: "food", name: "Snack Stall", cost: 260, icon: "F", desc: "Happiness boost" },
  ],
  scenery: [
    { id: "tree", name: "Tree", cost: 35, icon: "T", desc: "Charm nearby" },
    { id: "flowers", name: "Flowers", cost: 28, icon: "*", desc: "Color pop" },
    { id: "bench", name: "Bench", cost: 45, icon: "B", desc: "Rest stop" },
    { id: "lamp", name: "Lamp", cost: 55, icon: "L", desc: "Premium glow" },
    { id: "bin", name: "Trash Bin", cost: 40, icon: "N", desc: "Cleaner paths" },
    { id: "fountain", name: "Fountain", cost: 180, icon: "O", desc: "Park centerpiece" },
  ],
  park: [
    { id: "water", name: "Water", cost: 30, icon: "~", desc: "Canal tile" },
    { id: "bridge", name: "Bridge", cost: 90, icon: "=", desc: "Path over water" },
    { id: "kiosk", name: "Kiosk", cost: 220, icon: "I", desc: "More guests" },
    { id: "janitor", name: "Cleaner", cost: 300, icon: "J", desc: "Removes litter" },
  ],
};

const objectInfo = {
  carousel: { name: "Carousel", size: 2, appeal: 16, capacity: 6, duration: 7, price: 18 },
  wheel: { name: "Sky Wheel", size: 2, appeal: 26, capacity: 8, duration: 10, price: 24 },
  coaster: { name: "Mini Coaster", size: 3, appeal: 34, capacity: 10, duration: 9, price: 30 },
  food: { name: "Snack Stall", size: 1, appeal: 10, capacity: 4, duration: 4, price: 10 },
  kiosk: { name: "Info Kiosk", size: 1, appeal: 8, capacity: 3, duration: 3, price: 8 },
  fountain: { name: "Fountain", size: 1, appeal: 12 },
  janitor: { name: "Cleaner", size: 1, appeal: 5 },
};

function key(x, y) { return `${x},${y}`; }
function inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

function worldToScreen(x, y, z = 0) {
  return {
    x: (x - y) * tileW / 2 * zoom + camera.x,
    y: (x + y) * tileH / 2 * zoom + camera.y - z * zoom,
  };
}

function screenToWorld(px, py) {
  const sx = (px - camera.x) / zoom;
  const sy = (py - camera.y) / zoom;
  const x = Math.floor((sy / (tileH / 2) + sx / (tileW / 2)) / 2);
  const y = Math.floor((sy / (tileH / 2) - sx / (tileW / 2)) / 2);
  return inside(x, y) ? { x, y } : null;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!camera.ready) {
    camera.x = r.width / 2;
    camera.y = 88;
    camera.ready = true;
  }
}

function isoTile(x, y, fill, stroke = "rgba(24,36,58,.12)") {
  const p = worldToScreen(x, y);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + tileW / 2 * zoom, p.y + tileH / 2 * zoom);
  ctx.lineTo(p.x, p.y + tileH * zoom);
  ctx.lineTo(p.x - tileW / 2 * zoom, p.y + tileH / 2 * zoom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.stroke();
}

function ellipse(cx, cy, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * zoom, ry * zoom, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function rectIsoBase(x, y, w, h, color) {
  for (let ix = 0; ix < w; ix++) for (let iy = 0; iy < h; iy++) isoTile(x + ix, y + iy, color);
}

function drawBox(x, y, w, h, height, top, left, right) {
  const a = worldToScreen(x, y, height);
  const b = worldToScreen(x + w, y, height);
  const c = worldToScreen(x + w, y + h, height);
  const d = worldToScreen(x, y + h, height);
  const ab = worldToScreen(x + w, y, 0);
  const bc = worldToScreen(x + w, y + h, 0);
  const cd = worldToScreen(x, y + h, 0);
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right;
  ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(ab.x,ab.y); ctx.lineTo(bc.x,bc.y); ctx.lineTo(c.x,c.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = left;
  ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(bc.x,bc.y); ctx.lineTo(cd.x,cd.y); ctx.lineTo(d.x,d.y); ctx.closePath(); ctx.fill();
}

function drawObject(obj) {
  const { x, y, type } = obj;
  if (type === "tree") {
    const p = worldToScreen(x + .5, y + .5);
    drawBox(x + .38, y + .38, .24, .24, 18, "#9a653f", "#774b31", "#6b432a");
    ellipse(p.x, p.y - 25 * zoom, 19, 16, "#59ad6a");
    ellipse(p.x - 9 * zoom, p.y - 18 * zoom, 14, 12, "#72c472");
    ellipse(p.x + 10 * zoom, p.y - 17 * zoom, 13, 12, "#3f985b");
  } else if (type === "flowers") {
    const p = worldToScreen(x + .5, y + .5);
    ellipse(p.x, p.y + 8 * zoom, 24, 10, "#55a862");
    ["#ef6f5f","#f4c84b","#d88df0","#fff3d7"].forEach((c, i) => ellipse(p.x + (i * 10 - 15) * zoom, p.y + (i % 2 ? 5 : 11) * zoom, 4, 3, c));
  } else if (type === "bench") {
    drawBox(x + .2, y + .35, .62, .2, 10, "#c88756", "#9f6440", "#7d4d34");
    drawBox(x + .16, y + .52, .68, .13, 5, "#efb06d", "#bd7b4d", "#965d3b");
  } else if (type === "lamp") {
    const p = worldToScreen(x + .5, y + .5);
    ctx.strokeStyle = "#25334b"; ctx.lineWidth = 4 * zoom;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 9 * zoom); ctx.lineTo(p.x, p.y - 26 * zoom); ctx.stroke();
    ellipse(p.x, p.y - 30 * zoom, 7, 7, "#f4c84b");
  } else if (type === "bin") {
    drawBox(x + .36, y + .36, .28, .28, 16, "#20b4a7", "#15877f", "#116b68");
  } else if (type === "fountain") {
    const p = worldToScreen(x + .5, y + .5);
    ellipse(p.x, p.y + 10 * zoom, 26, 13, "#6bc5ed");
    ellipse(p.x, p.y + 7 * zoom, 18, 8, "#bfefff");
    ctx.strokeStyle = "#fff9eb"; ctx.lineWidth = 3 * zoom;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 3 * zoom); ctx.quadraticCurveTo(p.x + 8 * zoom, p.y - 24 * zoom, p.x, p.y - 33 * zoom); ctx.quadraticCurveTo(p.x - 8 * zoom, p.y - 24 * zoom, p.x, p.y + 3 * zoom); ctx.stroke();
  } else if (type === "janitor") {
    drawBuilding(x, y, "#62b970", "#fff3d7", "J");
  } else if (type === "kiosk") {
    drawBuilding(x, y, "#55a9e8", "#fff3d7", "i");
  } else if (type === "food") {
    drawBuilding(x, y, "#ef6f5f", "#f4c84b", "");
    const p = worldToScreen(x + .5, y + .5, 28);
    ctx.fillStyle = "#fff3d7";
    ctx.fillRect(p.x - 15 * zoom, p.y - 5 * zoom, 30 * zoom, 10 * zoom);
  } else if (type === "carousel") {
    rectIsoBase(x, y, 2, 2, "#eadfbe");
    const p = worldToScreen(x + 1, y + 1);
    ellipse(p.x, p.y + 18 * zoom, 45, 20, "#ef6f5f");
    ellipse(p.x, p.y - 12 * zoom, 36, 17, "#f4c84b");
    ctx.strokeStyle = "#fff9eb"; ctx.lineWidth = 5 * zoom;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(p.x + i * 20 * zoom, p.y - 8 * zoom); ctx.lineTo(p.x + i * 15 * zoom, p.y + 20 * zoom); ctx.stroke(); }
    ellipse(p.x, p.y - 30 * zoom, 34, 11, "#20b4a7");
  } else if (type === "wheel") {
    rectIsoBase(x, y, 2, 2, "#d8e4ca");
    const p = worldToScreen(x + 1, y + 1);
    ctx.strokeStyle = "#25334b"; ctx.lineWidth = 5 * zoom;
    ctx.beginPath(); ctx.moveTo(p.x - 30 * zoom, p.y + 18 * zoom); ctx.lineTo(p.x, p.y - 58 * zoom); ctx.lineTo(p.x + 30 * zoom, p.y + 18 * zoom); ctx.stroke();
    ctx.lineWidth = 4 * zoom;
    ctx.beginPath(); ctx.arc(p.x, p.y - 58 * zoom, 36 * zoom, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = performance.now() / 1700 + i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 58 * zoom); ctx.lineTo(p.x + Math.cos(a) * 36 * zoom, p.y - 58 * zoom + Math.sin(a) * 36 * zoom); ctx.stroke();
      ellipse(p.x + Math.cos(a) * 36 * zoom, p.y - 58 * zoom + Math.sin(a) * 36 * zoom, 6, 5, i % 2 ? "#ef6f5f" : "#f4c84b");
    }
  } else if (type === "coaster") {
    rectIsoBase(x, y, 3, 3, "#e9dfc1");
    const p = worldToScreen(x + 1.5, y + 1.5);
    ctx.strokeStyle = "#25334b"; ctx.lineWidth = 6 * zoom;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 18 * zoom, 72 * zoom, 34 * zoom, -0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ef6f5f"; ctx.lineWidth = 4 * zoom;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 20 * zoom, 61 * zoom, 27 * zoom, -0.35, 0, Math.PI * 2); ctx.stroke();
    const a = performance.now() / 850;
    ellipse(p.x + Math.cos(a) * 62 * zoom, p.y - 20 * zoom + Math.sin(a) * 27 * zoom, 10, 7, "#f4c84b");
  }
}

function drawBuilding(x, y, color, roof, mark) {
  drawBox(x + .15, y + .15, .7, .7, 28, color, shade(color, -25), shade(color, -40));
  const a = worldToScreen(x + .1, y + .1, 32);
  const b = worldToScreen(x + .9, y + .1, 32);
  const c = worldToScreen(x + .9, y + .9, 32);
  const d = worldToScreen(x + .1, y + .9, 32);
  const top = worldToScreen(x + .5, y + .5, 50);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(top.x,top.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(roof, -20);
  ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(c.x,c.y); ctx.lineTo(top.x,top.y); ctx.closePath(); ctx.fill();
  if (mark) {
    const p = worldToScreen(x + .5, y + .5, 23);
    ctx.fillStyle = "#18243a"; ctx.font = `${18 * zoom}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(mark, p.x, p.y);
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawGuest(g) {
  const p = worldToScreen(g.x + .5, g.y + .5, 9);
  ellipse(p.x, p.y + 7 * zoom, 7, 4, "rgba(24,36,58,.18)");
  ellipse(p.x, p.y, 6, 8, g.color);
  ellipse(p.x, p.y - 9 * zoom, 5, 5, "#f1bd8a");
}

function render() {
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.fillStyle = "#c8e7eb";
  ctx.fillRect(0, 0, r.width, r.height);

  for (let s = 0; s < W + H; s++) {
    for (let x = 0; x < W; x++) {
      const y = s - x;
      if (!inside(x, y)) continue;
      const k = key(x, y);
      let fill = "#78c875";
      if ((x + y) % 2) fill = "#6fbe6d";
      if (water.has(k)) fill = "#55a9e8";
      if (paths.has(k)) fill = "#eadfbe";
      isoTile(x, y, fill);
      if (paths.has(k)) drawPathDetails(x, y);
      if (litter.has(k)) drawLitter(x, y);
      const obj = objects.get(k);
      if (obj && obj.anchor) drawObject(obj);
    }
  }

  guests.forEach(drawGuest);
  particles.forEach(drawParticle);
  if (hover) drawPlacement(hover.x, hover.y);
}

function drawPathDetails(x, y) {
  const p = worldToScreen(x + .5, y + .5);
  ctx.strokeStyle = "rgba(141,112,77,.32)";
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(p.x - 20 * zoom, p.y);
  ctx.lineTo(p.x + 20 * zoom, p.y);
  ctx.moveTo(p.x, p.y - 10 * zoom);
  ctx.lineTo(p.x, p.y + 10 * zoom);
  ctx.stroke();
}

function drawLitter(x, y) {
  const p = worldToScreen(x + .5, y + .5);
  ctx.fillStyle = "#ef6f5f";
  ctx.fillRect(p.x + 7 * zoom, p.y + 4 * zoom, 7 * zoom, 3 * zoom);
  ctx.fillStyle = "#fff3d7";
  ctx.fillRect(p.x - 12 * zoom, p.y + 6 * zoom, 6 * zoom, 3 * zoom);
}

function drawParticle(p) {
  const s = worldToScreen(p.x, p.y, p.z);
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.fillStyle = p.color;
  ctx.font = `${16 * zoom}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(p.text, s.x, s.y);
  ctx.globalAlpha = 1;
}

function drawPlacement(x, y) {
  const tool = currentTool();
  const size = objectInfo[selectedTool]?.size || 1;
  const valid = canPlace(x, y, selectedTool);
  ctx.globalAlpha = .45;
  for (let ix = 0; ix < size; ix++) for (let iy = 0; iy < size; iy++) {
    if (inside(x + ix, y + iy)) isoTile(x + ix, y + iy, valid ? "#20b4a7" : "#ef6f5f", "rgba(24,36,58,.35)");
  }
  ctx.globalAlpha = 1;
  ui.selection.innerHTML = `<strong>${tool.name}</strong><br>Tile ${x + 1}, ${y + 1}<br>Cost $${tool.cost}`;
}

function currentTool() {
  return Object.values(TOOLS).flat().find(t => t.id === selectedTool) || TOOLS.build[0];
}

function canPlace(x, y, type) {
  if (!inside(x, y)) return false;
  if (type === "remove") return true;
  if (type === "path") return !objects.has(key(x, y)) && !water.has(key(x, y));
  if (type === "water") return !objects.has(key(x, y)) && !paths.has(key(x, y));
  if (type === "bridge") return water.has(key(x, y)) && !objects.has(key(x, y));
  const size = objectInfo[type]?.size || 1;
  for (let ix = 0; ix < size; ix++) for (let iy = 0; iy < size; iy++) {
    const k = key(x + ix, y + iy);
    if (!inside(x + ix, y + iy) || objects.has(k) || paths.has(k) || water.has(k)) return false;
  }
  return adjacentToPath(x, y, size);
}

function adjacentToPath(x, y, size = 1) {
  for (let ix = -1; ix <= size; ix++) for (let iy = -1; iy <= size; iy++) {
    if ((ix >= 0 && ix < size && iy >= 0 && iy < size)) continue;
    if (paths.has(key(x + ix, y + iy))) return true;
  }
  return false;
}

function place(x, y) {
  const tool = currentTool();
  if (tool.id === "remove") return removeAt(x, y);
  if (!canPlace(x, y, tool.id)) return toast("That spot needs open land and a nearby path.");
  if (money < tool.cost) return toast("Not enough funds yet. Rides and happy guests earn more.");
  money -= tool.cost;
  if (tool.id === "path") paths.add(key(x, y));
  else if (tool.id === "water") water.add(key(x, y));
  else if (tool.id === "bridge") { water.delete(key(x, y)); paths.add(key(x, y)); }
  else {
    const size = objectInfo[tool.id]?.size || 1;
    const obj = { type: tool.id, x, y, size, anchor: true, queue: [], riders: 0, cycle: 0, served: 0 };
    for (let ix = 0; ix < size; ix++) for (let iy = 0; iy < size; iy++) objects.set(key(x + ix, y + iy), ix || iy ? { ...obj, anchor: false, parent: key(x, y) } : obj);
    burst(x + size / 2, y + size / 2, "+");
  }
  selectedTile = { x, y };
  updateStats();
}

function removeAt(x, y) {
  const k = key(x, y);
  if (paths.has(k)) { paths.delete(k); money += 4; toast("Path removed."); return; }
  if (water.has(k)) { water.delete(k); money += 3; toast("Water tile reclaimed."); return; }
  const obj = objects.get(k);
  if (!obj) return toast("Nothing to remove here.");
  const root = obj.anchor ? obj : objects.get(obj.parent);
  for (let ix = 0; ix < root.size; ix++) for (let iy = 0; iy < root.size; iy++) objects.delete(key(root.x + ix, root.y + iy));
  money += Math.floor((currentCost(root.type) || 80) * .35);
  toast(`${objectInfo[root.type]?.name || "Object"} removed.`);
  updateStats();
}

function currentCost(type) {
  return Object.values(TOOLS).flat().find(t => t.id === type)?.cost;
}

function burst(x, y, text, color = "#f4c84b") {
  particles.push({ x, y, z: 38, text, color, life: 1 });
}

function seedPark() {
  for (let x = 9; x <= 14; x++) paths.add(key(x, 22));
  for (let y = 15; y <= 22; y++) paths.add(key(11, y));
  for (let x = 8; x <= 14; x++) paths.add(key(x, 16));
  paths.add(key(9, 15));
  paths.add(key(10, 15));
  [["tree", 7, 17], ["tree", 14, 18], ["flowers", 8, 15], ["bench", 12, 18], ["lamp", 10, 19], ["bin", 12, 20]].forEach(([type, x, y]) => objects.set(key(x, y), { type, x, y, size: 1, anchor: true }));
  placeFree("carousel", 8, 13);
  for (let x = 16; x < 20; x++) for (let y = 10; y < 14; y++) water.add(key(x, y));
  for (let i = 0; i < 10; i++) spawnGuest();
}

function placeFree(type, x, y) {
  const size = objectInfo[type].size || 1;
  const obj = { type, x, y, size, anchor: true, queue: [], riders: 0, cycle: 0, served: 0 };
  for (let ix = 0; ix < size; ix++) for (let iy = 0; iy < size; iy++) objects.set(key(x + ix, y + iy), ix || iy ? { ...obj, anchor: false, parent: key(x, y) } : obj);
}

function spawnGuest() {
  const start = { x: 11, y: 22 };
  guests.push({
    x: start.x, y: start.y, tx: start.x, ty: start.y, path: [],
    state: "wandering", wait: 0, target: null,
    color: ["#ef6f5f", "#20b4a7", "#f4c84b", "#55a9e8", "#7d6ae8"][Math.floor(Math.random() * 5)],
    happy: 78 + Math.random() * 18,
  });
}

function sim(dt) {
  if (paused) return;
  dt *= speed;
  camera.x += ((keys.has("ArrowRight") || keys.has("d")) - (keys.has("ArrowLeft") || keys.has("a"))) * 420 * dt;
  camera.y += ((keys.has("ArrowDown") || keys.has("s")) - (keys.has("ArrowUp") || keys.has("w"))) * 420 * dt;
  if (guests.length < Math.min(95, 12 + parkAppeal() * .9) && Math.random() < dt * (.45 + rating * .12)) spawnGuest();
  guests.forEach(g => updateGuest(g, dt));
  updateRides(dt);
  updateCleanliness(dt);
  particles.forEach(p => { p.z += 20 * dt; p.life -= dt * .75; });
  while (particles.length && particles[0].life <= 0) particles.shift();
  updateStats();
}

function updateGuest(g, dt) {
  if (g.state === "queued") return;
  if (g.wait > 0) { g.wait -= dt; return; }
  if (Math.abs(g.x - g.tx) < .03 && Math.abs(g.y - g.ty) < .03) {
    g.x = g.tx; g.y = g.ty;
    if (g.path.length) {
      const n = g.path.shift(); g.tx = n.x; g.ty = n.y;
    } else {
      chooseGuestGoal(g);
    }
  } else {
    const dx = g.tx - g.x, dy = g.ty - g.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = dt * (1.7 + g.happy / 120);
    g.x += dx / d * Math.min(step, d);
    g.y += dy / d * Math.min(step, d);
  }
}

function chooseGuestGoal(g) {
  const attractions = [...objects.values()].filter(o => o.anchor && objectInfo[o.type]?.capacity && adjacentPathFor(o));
  if (attractions.length && Math.random() < .72) {
    const weighted = attractions.sort((a, b) => (b.served || 0) - (a.served || 0));
    const target = weighted[Math.floor(Math.random() * Math.min(weighted.length, 4))];
    const tile = adjacentPathFor(target);
    const path = findPath({ x: Math.round(g.x), y: Math.round(g.y) }, tile);
    if (path) {
      g.target = target;
      g.path = path;
      return;
    }
  }
  const p = [...paths].map(k => k.split(",").map(Number));
  if (!p.length) return;
  const [x, y] = p[Math.floor(Math.random() * p.length)];
  g.path = findPath({ x: Math.round(g.x), y: Math.round(g.y) }, { x, y }) || [];
  g.wait = Math.random() * 1.4;
}

function updateRides(dt) {
  for (const obj of [...objects.values()].filter(o => o.anchor && objectInfo[o.type]?.capacity)) {
    for (const g of guests) {
      if (g.target === obj && g.state !== "queued" && Math.round(g.x) === g.tx && Math.round(g.y) === g.ty && !g.path.length) {
        g.state = "queued"; obj.queue.push(g); g.target = null;
      }
    }
    const info = objectInfo[obj.type];
    if (obj.cycle > 0) {
      obj.cycle -= dt;
      if (obj.cycle <= 0) {
        money += obj.riders * info.price;
        obj.served += obj.riders;
        for (let i = 0; i < obj.riders; i++) {
          const g = obj.onRide?.pop();
          if (g) { g.state = "wandering"; g.happy = Math.min(100, g.happy + (obj.type === "food" ? 10 : 7)); chooseGuestGoal(g); }
        }
        obj.riders = 0;
        burst(obj.x + obj.size / 2, obj.y + obj.size / 2, `$${info.price}`);
      }
    }
    if (obj.cycle <= 0 && obj.queue.length) {
      obj.riders = Math.min(info.capacity, obj.queue.length);
      obj.onRide = obj.queue.splice(0, obj.riders);
      obj.cycle = info.duration;
      if (obj.queue.length > 8) happiness -= dt * .1;
    }
  }
}

function updateCleanliness(dt) {
  if (Math.random() < dt * guests.length * .006) {
    const p = [...paths];
    if (p.length) litter.add(p[Math.floor(Math.random() * p.length)]);
  }
  const cleaners = [...objects.values()].filter(o => o.anchor && o.type === "janitor").length;
  if (cleaners && litter.size && Math.random() < dt * cleaners * .8) litter.delete([...litter][0]);
  const bins = [...objects.values()].filter(o => o.anchor && o.type === "bin").length;
  cleanliness = Math.max(35, Math.min(100, 100 - litter.size * 3.5 + bins * 2));
  happiness = Math.max(38, Math.min(100, averageGuestHappy() - Math.max(0, 80 - cleanliness) * .25 - queuePressure() * .55));
  rating = Math.max(1, Math.min(5, (parkAppeal() / 28 + happiness / 25 + cleanliness / 35) / 3 * 2.4));
}

function averageGuestHappy() {
  if (!guests.length) return 82;
  return guests.reduce((a, g) => a + g.happy, 0) / guests.length;
}

function queuePressure() {
  return [...objects.values()].filter(o => o.anchor).reduce((a, o) => a + (o.queue?.length || 0), 0);
}

function parkAppeal() {
  return [...objects.values()].filter(o => o.anchor).reduce((a, o) => a + (objectInfo[o.type]?.appeal || (["tree","flowers","bench","lamp","bin"].includes(o.type) ? 3 : 0)), 0);
}

function adjacentPathFor(obj) {
  for (let ix = -1; ix <= obj.size; ix++) for (let iy = -1; iy <= obj.size; iy++) {
    if (ix >= 0 && ix < obj.size && iy >= 0 && iy < obj.size) continue;
    const x = obj.x + ix, y = obj.y + iy;
    if (paths.has(key(x, y))) return { x, y };
  }
  return null;
}

function findPath(start, end) {
  if (!paths.has(key(start.x, start.y)) || !paths.has(key(end.x, end.y))) return null;
  const q = [start], seen = new Set([key(start.x, start.y)]), prev = new Map();
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c.x === end.x && c.y === end.y) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      const nk = key(n.x, n.y);
      if (!seen.has(nk) && paths.has(nk)) { seen.add(nk); prev.set(nk, c); q.push(n); }
    }
  }
  if (!seen.has(key(end.x, end.y))) return null;
  const out = [];
  let c = end;
  while (c.x !== start.x || c.y !== start.y) {
    out.unshift(c);
    c = prev.get(key(c.x, c.y));
  }
  return out;
}

function updateStats() {
  ui.money.textContent = `$${Math.floor(money).toLocaleString()}`;
  ui.guests.textContent = `${guests.length}`;
  ui.happy.textContent = `${Math.round(happiness)}%`;
  ui.clean.textContent = `${Math.round(cleanliness)}%`;
  ui.rating.textContent = rating.toFixed(1);
  ui.appealBar.style.width = `${Math.min(100, parkAppeal())}%`;
  ui.queueBar.style.width = `${Math.min(100, queuePressure() * 7)}%`;
  ui.litterBar.style.width = `${Math.min(100, litter.size * 9)}%`;
  ui.rideList.innerHTML = [...objects.values()].filter(o => o.anchor && objectInfo[o.type]?.capacity).map(o => {
    const info = objectInfo[o.type];
    return `<div class="ride"><strong>${info.name}</strong><span>Queue ${o.queue.length} | riders ${o.riders || 0}/${info.capacity} | served ${o.served || 0}</span></div>`;
  }).join("") || `<div class="selection">Build a connected ride to see live status.</div>`;
}

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.style.opacity = 1;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ui.toast.style.opacity = .82, 1800);
}

function buildTools() {
  ui.toolGrid.innerHTML = TOOLS[selectedGroup].map(t => `
    <button class="tool ${t.id === selectedTool ? "active" : ""}" data-tool="${t.id}">
      <span class="tool-icon">${t.icon}</span>
      <b>${t.name}</b>
      <small>$${t.cost} - ${t.desc}</small>
    </button>
  `).join("");
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedGroup = btn.dataset.group;
  selectedTool = TOOLS[selectedGroup][0].id;
  buildTools();
}));

ui.toolGrid.addEventListener("click", e => {
  const btn = e.target.closest("[data-tool]");
  if (!btn) return;
  selectedTool = btn.dataset.tool;
  buildTools();
  toast(`${currentTool().name} selected.`);
});

document.querySelectorAll("[data-speed]").forEach(btn => btn.addEventListener("click", () => {
  speed = Number(btn.dataset.speed);
  document.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("active", b === btn));
}));

ui.pauseBtn.addEventListener("click", () => {
  paused = !paused;
  ui.pauseBtn.textContent = paused ? ">" : "II";
  ui.pauseBtn.classList.toggle("active", paused);
});

canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  const p = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (pointerDown && !dragging && Math.hypot(p.x - dragStart.x, p.y - dragStart.y) > 5) dragging = true;
  if (dragging) {
    camera.x = cameraStart.x + p.x - dragStart.x;
    camera.y = cameraStart.y + p.y - dragStart.y;
    return;
  }
  hover = screenToWorld(p.x, p.y);
});

canvas.addEventListener("mousedown", e => {
  const r = canvas.getBoundingClientRect();
  const p = { x: e.clientX - r.left, y: e.clientY - r.top };
  pointerDown = true;
  dragging = e.button === 1 || e.shiftKey || e.buttons === 4;
  dragStart = p;
  cameraStart = { ...camera };
});

canvas.addEventListener("mouseup", e => {
  pointerDown = false;
  if (dragging) { dragging = false; return; }
  if (hover) place(hover.x, hover.y);
});

canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  if (hover) removeAt(hover.x, hover.y);
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const old = zoom;
  zoom = Math.max(.62, Math.min(1.65, zoom + (e.deltaY > 0 ? -.08 : .08)));
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  camera.x = mx - (mx - camera.x) * (zoom / old);
  camera.y = my - (my - camera.y) * (zoom / old);
}, { passive: false });

window.addEventListener("keydown", e => keys.add(e.key));
window.addEventListener("keyup", e => keys.delete(e.key));
window.addEventListener("resize", resize);

function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  sim(dt);
  render();
  requestAnimationFrame(loop);
}

resize();
buildTools();
seedPark();
updateStats();
requestAnimationFrame(loop);
