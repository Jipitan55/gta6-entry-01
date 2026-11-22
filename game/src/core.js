// Vesper City — shared state, config, seeded RNG, input and collision helpers.
// One clear job: everything every other module needs, nothing more.

'use strict';

/* ---------- deterministic RNG (mulberry32) ---------- */
function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
function rngPick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

/* ---------- world config ---------- */
const CFG = {
  BLOCK: 52,          // block pitch (road centre to road centre)
  ROAD: 12,           // road width
  GRID: 9,            // blocks per side
  SAVE_KEY: 'vesper-city-save-v1',
  DEBT_START: 5000,
};
CFG.HALF = (CFG.GRID * CFG.BLOCK) / 2; // 234: roads run -HALF..HALF
CFG.ROAD_X = []; // road centre lines
for (let i = 0; i <= CFG.GRID; i += 1) CFG.ROAD_X.push(-CFG.HALF + i * CFG.BLOCK);

/* ---------- global game state ---------- */
const G = {
  seed: 1,
  rng: createRng(1),
  state: 'title',        // title | play | pause | wasted | busted | complete
  time: 0,               // seconds of play
  dayMinutes: 9 * 60,    // clock starts 09:00
  cash: 0,
  debt: CFG.DEBT_START,
  wanted: 0,
  wantedTimer: 0,        // counts down while unseen; then a star drops
  bustTimer: 0,          // counts up while a cop is close
  missionIdx: 0,
  missionStep: 0,
  missionDone: false,
  storyDone: false,
  muted: false,
  // player
  player: {
    x: 0, z: 0, heading: 0, hp: 100, onFoot: true, car: null,
    speed: 0, shootCd: 0, punchCd: 0, hurtCd: 0, mesh: null,
  },
  // camera
  cam: { yaw: 0, pitch: 0.42, dist: 9 },
  // world data filled by city.js / actors.js
  solids: [],            // building AABBs {x0,z0,x1,z1}
  cars: [],              // all cars (parked + traffic + police + player-driven)
  peds: [],              // pedestrians
  policeCars: [],
  policeFoot: [],
  marker: null,          // current mission marker {x, z, kind}
  markerMesh: null,
  coupe: null,           // the mission steal target
  three: null,           // {scene, camera, renderer, sun, ...}
  keys: {},
  shotMode: null,        // 'start' | 'play' | 'end' | 'combat' | null
  toastUntil: 0,
};

/* ---------- input ---------- */
function bindInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    G.keys[e.code] = true;
    if (e.code === 'KeyM') { G.muted = !G.muted; AudioSys.setMuted(G.muted); }
    if (e.code === 'Escape') Main.togglePause();
    if (e.code === 'Enter' && (G.state === 'wasted' || G.state === 'busted' || G.state === 'complete')) Main.respawn();
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    G.cam.yaw -= (e.clientX - lx) * 0.005;
    G.cam.pitch = clamp(G.cam.pitch + (e.clientY - ly) * 0.004, 0.08, 1.15);
    lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener('click', () => { if (G.state === 'play') Actors.playerShoot(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------- collision: circle vs building AABBs, with slide ---------- */
function collideCircle(x, z, r) {
  for (let i = 0; i < G.solids.length; i += 1) {
    const s = G.solids[i];
    if (x + r <= s.x0 || x - r >= s.x1 || z + r <= s.z0 || z - r >= s.z1) continue;
    // push out along the smallest penetration axis
    const dxl = x + r - s.x0, dxr = s.x1 - (x - r);
    const dzl = z + r - s.z0, dzr = s.z1 - (z - r);
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) x = s.x0 - r;
    else if (m === dxr) x = s.x1 + r;
    else if (m === dzl) z = s.z0 - r;
    else z = s.z1 + r;
    return { x, z, hit: true };
  }
  return { x, z, hit: false };
}
function insideSolid(x, z) {
  for (let i = 0; i < G.solids.length; i += 1) {
    const s = G.solids[i];
    if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return true;
  }
  return false;
}
function clampToCity(x, z) {
  const b = CFG.HALF + 20;
  return { x: clamp(x, -b, b), z: clamp(z, -b, b) };
}
/* nearest road centre line to a point, and the along-road coordinate */
function nearestRoadCoord(x, z) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < CFG.ROAD_X.length; i += 1) {
    const d = Math.abs(x - CFG.ROAD_X[i]);
    if (d < bestD) { bestD = d; best = { axis: 'x', line: CFG.ROAD_X[i], along: z, dist: d }; }
    const d2 = Math.abs(z - CFG.ROAD_X[i]);
    if (d2 < bestD) { bestD = d2; best = { axis: 'z', line: CFG.ROAD_X[i], along: x, dist: d2 }; }
  }
  return best;
}

/* ---------- save / load ---------- */
function saveGame() {
  try {
    const p = G.player;
    window.localStorage.setItem(CFG.SAVE_KEY, JSON.stringify({
      cash: G.cash, debt: G.debt, wanted: G.wanted,
      missionIdx: G.missionIdx, missionStep: G.missionStep,
      x: p.x, z: p.z, hp: p.hp, time: G.time, dayMinutes: G.dayMinutes,
    }));
  } catch (e) { /* storage can be off; the game still plays */ }
}
function loadSave() {
  try {
    const raw = window.localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function hasSave() { return loadSave() !== null; }
