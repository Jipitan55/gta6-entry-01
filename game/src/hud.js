// Vesper City — the HUD: health, cash, debt, wanted stars, clock, objective text,
// toast messages, and the canvas minimap (streets, player, mission marker, police).

'use strict';

const HUD = (() => {
  const el = {};
  let lastStars = -1, lastObj = '', lastCash = -1, lastHp = -1;
  let mm = null, mmCtx = null;

  function init() {
    const ids = ['hud', 'healthfill', 'hp-text', 'cash', 'debt', 'stars', 'clock',
      'obj-title', 'obj-text', 'obj-dist', 'toast', 'crosshair', 'interact', 'minimap'];
    for (const id of ids) el[id] = document.getElementById(id);
    mm = el.minimap;
    mmCtx = mm.getContext('2d');
  }

  function show(on) { el.hud.classList.toggle('on', !!on); }

  function toast(title, sub) {
    el.toast.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    el.toast.style.display = 'block';
    G.toastUntil = G.time + 3.2;
  }
  function hideToast() { el.toast.style.display = 'none'; }

  function update(dt) {
    const p = G.player;
    // health
    const hp = Math.round(p.hp);
    if (hp !== lastHp) {
      lastHp = hp;
      el['hp-text'].textContent = hp;
      el.healthfill.style.width = hp + '%';
      el.healthfill.style.background = hp > 50 ? 'linear-gradient(90deg,#37d67a,#a8e063)'
        : hp > 25 ? 'linear-gradient(90deg,#e0a83c,#ffd23e)' : 'linear-gradient(90deg,#d83c3c,#ff7a5d)';
    }
    // cash / debt
    if (G.cash !== lastCash) {
      lastCash = G.cash;
      el.cash.textContent = '$' + G.cash.toLocaleString('en-US');
      el.debt.textContent = G.debt > 0 ? 'Debt to Marlowe: $' + G.debt.toLocaleString('en-US') : 'DEBT PAID — Vesper City is yours';
    }
    // wanted stars
    if (G.wanted !== lastStars) {
      lastStars = G.wanted;
      let s = '';
      for (let i = 0; i < 5; i += 1) s += i < G.wanted ? '★' : '<span class="off">★</span>';
      el.stars.innerHTML = s;
    }
    // clock: 1 game hour per 90 real seconds
    const mins = Math.floor(G.dayMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm2 = String(mins % 60).padStart(2, '0');
    el.clock.textContent = 'DAY 1 · ' + hh + ':' + mm2 + (G.wanted > 0 ? ' · WANTED' : '');
    // objective
    const o = Missions.objectiveText();
    const key = o.title + '|' + o.text + '|' + o.dist;
    if (key !== lastObj) {
      lastObj = key;
      el['obj-title'].textContent = o.title;
      el['obj-text'].textContent = o.text;
      el['obj-dist'].textContent = o.dist;
    }
    if (G.toastUntil && G.time > G.toastUntil) { G.toastUntil = 0; hideToast(); }
    // crosshair + interact prompt (on foot only)
    el.crosshair.style.display = p.onFoot && G.state === 'play' ? 'block' : 'none';
    let prompt = '';
    if (G.state === 'play') {
      if (p.onFoot) {
        const car = Actors.nearestStealableCar();
        if (car) prompt = car.isCoupe ? '[E] STEAL THE COUPE' : '[E] GET IN THE CAR';
      } else prompt = '[E] GET OUT';
    }
    el.interact.textContent = prompt;
    el.interact.style.display = prompt ? 'block' : 'none';
    drawMinimap();
  }

  function drawMinimap() {
    const c = mmCtx, S = 190, HALF = CFG.HALF + 24;
    const toMap = (x, z) => [(x / HALF) * (S / 2) + S / 2, (z / HALF) * (S / 2) + S / 2];
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(16,24,40,0.9)';
    c.fillRect(0, 0, S, S);
    // bay strip (south)
    c.fillStyle = '#2f7fb8';
    c.fillRect(0, S - 8, S, 8);
    // roads
    c.strokeStyle = 'rgba(200,205,215,0.55)';
    c.lineWidth = 3;
    for (const line of CFG.ROAD_X) {
      const [mx] = toMap(line, 0);
      c.beginPath(); c.moveTo(mx, 0); c.lineTo(mx, S); c.stroke();
      const [, mz] = toMap(0, line);
      c.beginPath(); c.moveTo(0, mz); c.lineTo(S, mz); c.stroke();
    }
    // traffic dots
    c.fillStyle = '#cfd6e2';
    for (const car of G.cars) {
      if (car.kind !== 'traffic') continue;
      const [mx, mz] = toMap(car.x, car.z);
      c.fillRect(mx - 1, mz - 1, 2, 2);
    }
    // pedestrians
    c.fillStyle = 'rgba(160,170,185,0.8)';
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const [mx, mz] = toMap(ped.x, ped.z);
      c.fillRect(mx - 1, mz - 1, 2, 2);
    }
    // mission marker (pulsing yellow diamond)
    if (G.marker) {
      const [mx, mz] = toMap(G.marker.x, G.marker.z);
      const r = 5 + Math.sin(G.time * 4) * 1.5;
      c.fillStyle = '#ffd23e';
      c.beginPath();
      c.moveTo(mx, mz - r); c.lineTo(mx + r, mz); c.lineTo(mx, mz + r); c.lineTo(mx - r, mz);
      c.closePath(); c.fill();
    }
    // police (flashing)
    const flash = Math.floor(G.time * 5) % 2 === 0;
    c.fillStyle = flash ? '#3a6cff' : '#ff3a3a';
    for (const car of G.policeCars) {
      if (car.hp <= 0) continue;
      const [mx, mz] = toMap(car.x, car.z);
      c.beginPath(); c.arc(mx, mz, 3, 0, Math.PI * 2); c.fill();
    }
    for (const cop of G.policeFoot) {
      if (cop.dead) continue;
      const [mx, mz] = toMap(cop.x, cop.z);
      c.beginPath(); c.arc(mx, mz, 2.5, 0, Math.PI * 2); c.fill();
    }
    // player arrow
    const [px, pz] = toMap(G.player.x, G.player.z);
    const a = G.player.heading;
    c.fillStyle = '#8dff9e';
    c.beginPath();
    c.moveTo(px + Math.sin(a) * 6, pz + Math.cos(a) * 6);
    c.lineTo(px + Math.sin(a + 2.5) * 5, pz + Math.cos(a + 2.5) * 5);
    c.lineTo(px + Math.sin(a - 2.5) * 5, pz + Math.cos(a - 2.5) * 5);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.stroke();
  }

  return { init, show, update, toast, hideToast };
})();
