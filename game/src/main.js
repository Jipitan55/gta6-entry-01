// Vesper City — boot and the one loop: input every frame, the world advances in
// fixed 1/60 s steps, the camera follows, and the screens (title / play / pause /
// wasted / busted / complete) switch. ?seed=N fixes the city; ?shot=start|play|
// end|combat stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

'use strict';

const Main = (() => {
  const STEP = 1 / 60;
  const MAX_FRAME = 0.25;
  let tracers = [];
  let saveTimer = 0;
  let lastTs = 0;

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

  function $(id) { return document.getElementById(id); }

  function showScreen(name) {
    for (const id of ['screen-start', 'screen-pause', 'screen-over']) $(id).classList.remove('on');
    if (name) $(name).classList.add('on');
  }

  function updateCamera(dt) {
    const t = G.three;
    const p = G.player;
    if (G.state === 'title') {
      const a = G.time * 0.045 + 0.6;
      t.camera.position.set(Math.sin(a) * 200, 92, Math.cos(a) * 200);
      t.camera.lookAt(0, 18, 0);
      return;
    }
    const yaw = G.cam.yaw, pitch = G.cam.pitch, dist = G.cam.dist;
    const cx = p.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = p.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = 2.2 + Math.sin(pitch) * dist;
    // keep the camera out of buildings: lift it when blocked
    let camY = cy;
    if (insideSolid(cx, cz) && camY < 26) camY = 26;
    t.camera.position.set(cx, camY, cz);
    t.camera.lookAt(p.x, 1.6, p.z);
  }

  function spawnTracer(x, y, z, fx, fz) {
    const t = G.three;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x + fx * 1.2, y, z + fz * 1.2),
      new THREE.Vector3(x + fx * 42, y, z + fz * 42),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    t.scene.add(line);
    tracers.push({ line, ttl: 0.12 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    flash.position.set(x + fx * 1.4, y, z + fz * 1.4);
    t.scene.add(flash);
    tracers.push({ line: flash, ttl: 0.06, isMesh: true });
  }
  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const tr = tracers[i];
      tr.ttl -= dt;
      if (tr.ttl <= 0) {
        G.three.scene.remove(tr.line);
        tracers.splice(i, 1);
      } else if (!tr.isMesh) tr.line.material.opacity = tr.ttl / 0.12;
    }
  }

  function stepWorld(dt) {
    if (G.state !== 'play') return;
    G.time += dt;
    G.dayMinutes += dt * (60 / 90); // 1 game hour per 90 real seconds
    // E to enter / exit a car (rising edge)
    if (G.keys.KeyE && !G._ePrev) {
      if (G.player.onFoot) {
        const car = Actors.nearestStealableCar();
        if (car) Actors.enterCar(car);
      } else Actors.exitCar();
    }
    G._ePrev = !!G.keys.KeyE;
    Actors.updatePlayer(dt);
    for (const car of G.cars) if (car.kind === 'traffic') Actors.updateTrafficCar(car, dt);
    for (const car of G.cars) if (car.kind === 'player') Actors.updateCarVsCar(car);
    for (const ped of G.peds) Actors.updatePed(ped, dt);
    Actors.updatePolice(dt);
    Missions.checkStep(dt);
    City.animateMarker(G.time);
    updateTracers(dt);
    HUD.update(dt);
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; saveGame(); }
  }

  function renderFrame(dt) {
    updateCamera(dt);
    G.three.renderer.render(G.three.scene, G.three.camera);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTs) / 1000 || STEP, MAX_FRAME);
    lastTs = ts;
    if (G.state === 'play') {
      let acc = dt;
      while (acc > 0) { stepWorld(Math.min(acc, STEP)); acc -= STEP; }
    } else if (G.state === 'title') {
      G.time += dt;
      for (const car of G.cars) if (car.kind === 'traffic') Actors.updateTrafficCar(car, dt);
      for (const ped of G.peds) Actors.updatePed(ped, dt);
      City.animateMarker(G.time);
      updateTracers(dt);
    }
    renderFrame(dt);
  }

  /* ---------- state changes ---------- */
  function startNewGame() {
    AudioSys.unlock();
    G.cash = 0; G.debt = CFG.DEBT_START; G.wanted = 0; G.wantedTimer = 0;
    G.missionIdx = 0; G.missionStep = 0; G.storyDone = false; G.missionDone = false;
    G.time = 0; G.dayMinutes = 9 * 60;
    G.player.hp = 100;
    G.state = 'play';
    showScreen(null);
    HUD.show(true);
    Missions.startMission(0);
    saveGame();
  }
  function continueGame() {
    const s = loadSave();
    if (!s) { startNewGame(); return; }
    AudioSys.unlock();
    G.cash = s.cash; G.debt = s.debt; G.wanted = 0; G.wantedTimer = 0;
    G.missionIdx = s.missionIdx; G.missionStep = s.missionStep;
    G.time = s.time || 0; G.dayMinutes = s.dayMinutes || 9 * 60;
    G.player.hp = s.hp || 100;
    G.player.x = s.x; G.player.z = s.z;
    G.player.mesh.position.set(s.x, 0, s.z);
    G.storyDone = false;
    G.state = 'play';
    showScreen(null);
    HUD.show(true);
    const m = Missions.current();
    if (m) HUD.toast(m.title, 'Welcome back, Rook. ' + m.brief);
    Missions.refreshMarker();
  }
  function togglePause() {
    if (G.state === 'play') {
      G.state = 'pause';
      showScreen('screen-pause');
      AudioSys.setEngine(false, 0); AudioSys.setSiren(false);
    } else if (G.state === 'pause') {
      G.state = 'play';
      showScreen(null);
    }
  }
  function quitToTitle() {
    saveGame();
    G.state = 'title';
    HUD.show(false);
    showScreen('screen-start');
    $('btn-continue').style.display = hasSave() ? 'block' : 'none';
    AudioSys.setEngine(false, 0); AudioSys.setSiren(false);
  }
  function endScreen(kind, title, text) {
    G.state = kind;
    AudioSys.fail();
    AudioSys.setEngine(false, 0); AudioSys.setSiren(false);
    const h = $('over-title');
    h.textContent = title;
    h.className = kind === 'wasted' ? 'wasted' : kind === 'busted' ? 'busted' : 'done';
    $('over-text').textContent = text;
    $('btn-again').textContent = kind === 'complete' ? 'KEEP PLAYING' : 'GET BACK UP';
    showScreen('screen-over');
    HUD.show(false);
  }
  function wasted() {
    if (G.state !== 'play') return;
    endScreen('wasted', 'WASTED', 'The city got the better of you, Rook. The medics patched you up at St. Anselm’s — and kept 10% of your cash for the trouble.');
  }
  function busted() {
    if (G.state !== 'play') return;
    endScreen('busted', 'BUSTED', 'The Vesper City PD has you. A night in the cells, a fine worth 10% of your cash, and Marlowe still wants her money.');
  }
  function storyComplete() {
    if (G.state !== 'play') return;
    endScreen('complete', 'DEBT PAID', 'Four jobs, one very annoyed police department, and Marlowe is square. Vesper City is yours now, Rook — keep the engine running.');
  }
  function respawn() {
    if (G.state === 'complete') {
      // keep playing in free roam
      G.state = 'play';
      showScreen(null);
      HUD.show(true);
      return;
    }
    if (G.state !== 'wasted' && G.state !== 'busted') return;
    G.cash = Math.floor(G.cash * 0.9);
    G.wanted = 0; G.wantedTimer = 0; G.bustTimer = 0;
    const p = G.player;
    if (p.car) { p.car.kind = 'parked'; p.car.speed = 0; p.car = null; }
    p.onFoot = true; p.hp = 100; p.mesh.visible = true;
    p.x = CFG.ROAD_X[6]; p.z = CFG.ROAD_X[2]; // outside St. Anselm's
    p.mesh.position.set(p.x, 0, p.z);
    G.cam.dist = 9;
    G.state = 'play';
    showScreen(null);
    HUD.show(true);
    Missions.refreshMarker();
    saveGame();
  }

  /* ---------- boot ---------- */
  function boot() {
    G.seed = seed;
    G.rng = createRng(seed);
    City.build();
    Actors.populate();
    HUD.init();
    bindInput($('game'));
    window.addEventListener('resize', City.resize);
    City.resize();
    $('btn-start').addEventListener('click', startNewGame);
    $('btn-continue').addEventListener('click', continueGame);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-save-quit').addEventListener('click', quitToTitle);
    $('btn-again').addEventListener('click', respawn);
    $('btn-continue').style.display = hasSave() ? 'block' : 'none';

    if (shot) {
      G.shotMode = shot;
      const scene = Shots.stageShot(shot);
      HUD.update(0);
      let painted = 0;
      (function paint() {
        renderFrame(STEP);
        painted += 1;
        if (painted < 2) requestAnimationFrame(paint);
        else window.__shotReady = true;
      })();
      return;
    }
    // normal play: title screen over the living city. Do NOT startMission here:
    // it would saveGame() and clobber an existing save before the player chooses.
    G.state = 'title';
    Missions.refreshMarker();
    showScreen('screen-start');
    requestAnimationFrame((ts) => { lastTs = ts; loop(ts); });
  }

  return {
    boot, stepWorld, spawnTracer, togglePause, respawn, wasted, busted,
    storyComplete, startNewGame, continueGame, quitToTitle, showScreen,
  };
})();

window.addEventListener('DOMContentLoaded', Main.boot);
