// Vesper City — everyone who moves: the player (on foot and in a car), traffic,
// pedestrians, police, combat and the wanted system. One clear job: actors.

'use strict';

const Actors = (() => {
  // ---- shared geometries / materials (reused, never rebuilt) ----
  let carBodyGeo, carCabinGeo, wheelGeo, headGeo, tailGeo, lightBarGeo;
  let pedBodyGeo, pedHeadGeo, pedLegsGeo, playerBodyGeo, playerHeadGeo;
  const carMats = {}, glassMat = new THREE.MeshLambertMaterial({ color: 0x141c26 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
  const skinMats = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const shirtMats = [0xd84a4a, 0x4a7dd8, 0x4ad87a, 0xe0c040, 0x9a5fd0, 0xe08a40, 0xdddddd, 0x3a3a3a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0x2e8f86 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x23283a });
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  function initGeos() {
    if (carBodyGeo) return;
    carBodyGeo = new THREE.BoxGeometry(2.0, 0.55, 4.2);
    carCabinGeo = new THREE.BoxGeometry(1.7, 0.5, 2.0);
    wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    headGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
    tailGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
    lightBarGeo = new THREE.BoxGeometry(0.7, 0.22, 0.5);
    pedBodyGeo = new THREE.BoxGeometry(0.62, 0.85, 0.36);
    pedHeadGeo = new THREE.SphereGeometry(0.26, 8, 6);
    pedLegsGeo = new THREE.BoxGeometry(0.5, 0.75, 0.32);
    playerBodyGeo = new THREE.BoxGeometry(0.72, 1.05, 0.42);
    playerHeadGeo = new THREE.SphereGeometry(0.28, 10, 8);
  }
  function carMat(color) {
    if (!carMats[color]) carMats[color] = new THREE.MeshLambertMaterial({ color });
    return carMats[color];
  }

  function makeCarMesh(color, police) {
    initGeos();
    const g = new THREE.Group();
    const body = new THREE.Mesh(carBodyGeo, carMat(color));
    body.position.y = 0.55; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(carCabinGeo, glassMat);
    cabin.position.set(0, 1.05, -0.2); cabin.castShadow = true; g.add(cabin);
    const wheels = [];
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w); wheels.push(w);
    }
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    for (const hx of [-0.6, 0.6]) {
      const h = new THREE.Mesh(headGeo, hl); h.position.set(hx, 0.6, 2.12); g.add(h);
    }
    const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    for (const tx of [-0.6, 0.6]) {
      const t = new THREE.Mesh(tailGeo, tl); t.position.set(tx, 0.6, -2.12); g.add(t);
    }
    let barL = null, barR = null;
    if (police) {
      barL = new THREE.Mesh(lightBarGeo, new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      barL.position.set(-0.45, 1.42, -0.2); g.add(barL);
      barR = new THREE.Mesh(lightBarGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      barR.position.set(0.45, 1.42, -0.2); g.add(barR);
    }
    g.userData = { wheels, barL, barR };
    return g;
  }

  function makePedMesh() {
    initGeos();
    const g = new THREE.Group();
    const body = new THREE.Mesh(pedBodyGeo, shirtMats[Math.floor(G.rng() * shirtMats.length)]);
    body.position.y = 1.25; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(pedHeadGeo, skinMats[Math.floor(G.rng() * skinMats.length)]);
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    const legs = new THREE.Mesh(pedLegsGeo, pantsMat);
    legs.position.y = 0.42; g.add(legs);
    return g;
  }
  function makePlayerMesh() {
    initGeos();
    const g = new THREE.Group();
    const body = new THREE.Mesh(playerBodyGeo, jacketMat);
    body.position.y = 1.2; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(playerHeadGeo, skinMats[3]);
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    const legs = new THREE.Mesh(pedLegsGeo, pantsMat);
    legs.position.y = 0.42; g.add(legs);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.55), gunMat);
    gun.position.set(0.3, 1.35, 0.35); gun.name = 'gun'; g.add(gun);
    return g;
  }

  /* ---------------- cars ---------------- */
  function spawnCar(x, z, heading, color, kind) {
    const mesh = makeCarMesh(color, kind === 'police');
    mesh.position.set(x, 0, z); mesh.rotation.y = heading;
    G.three.scene.add(mesh);
    const car = {
      mesh, x, z, heading, speed: 0, color, kind,
      hp: kind === 'police' ? 150 : 100,
      target: null, from: null, lane: 2.6, laneTarget: 2.6,
      stopTimer: 0, ramCd: 0, honkCd: 0, driver: null, dead: false,
    };
    G.cars.push(car);
    if (kind === 'police') G.policeCars.push(car);
    return car;
  }
  function pickNextNode(car) {
    const rx = CFG.ROAD_X, n = rx.length;
    const cx = car.to ? car.to.x : car.x, cz = car.to ? car.to.z : car.z;
    let ix = 0, iz = 0, bd = Infinity;
    for (let i = 0; i < n; i += 1) { const d = Math.abs(rx[i] - cx); if (d < bd) { bd = d; ix = i; } }
    bd = Infinity;
    for (let j = 0; j < n; j += 1) { const d = Math.abs(rx[j] - cz); if (d < bd) { bd = d; iz = j; } }
    const opts = [];
    if (ix > 0) opts.push({ x: rx[ix - 1], z: rx[iz] });
    if (ix < n - 1) opts.push({ x: rx[ix + 1], z: rx[iz] });
    if (iz > 0) opts.push({ x: rx[ix], z: rx[iz - 1] });
    if (iz < n - 1) opts.push({ x: rx[ix], z: rx[iz + 1] });
    // avoid U-turn: drop the node we came from
    const filtered = car.from ? opts.filter((o) => !(Math.abs(o.x - car.from.x) < 1 && Math.abs(o.z - car.from.z) < 1)) : opts;
    const pick = (filtered.length ? filtered : opts)[Math.floor(G.rng() * (filtered.length ? filtered.length : opts.length))];
    car.from = car.to ? { x: car.to.x, z: car.to.z } : { x: car.x, z: car.z };
    car.to = pick;
  }
  function carAheadBlocked(car, look) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (let i = 0; i < G.cars.length; i += 1) {
      const o = G.cars[i];
      if (o === car || o.dead) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < look && Math.abs(dx * fz - dz * fx) < 2.4) return true;
    }
    for (let i = 0; i < G.peds.length; i += 1) {
      const p = G.peds[i];
      if (p.dead) continue;
      const dx = p.x - car.x, dz = p.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 6 && Math.abs(dx * fz - dz * fx) < 2.2) return true;
    }
    const p = G.player;
    if (p.onFoot) {
      const dx = p.x - car.x, dz = p.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 6 && Math.abs(dx * fz - dz * fx) < 2.2) return true;
    }
    return false;
  }
  function updateTrafficCar(car, dt) {
    if (car.kind !== 'traffic') return;
    if (!car.to) pickNextNode(car);
    const dx = car.to.x - car.x, dz = car.to.z - car.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 3) { pickNextNode(car); return; }
    const wantHeading = Math.atan2(dx, dz);
    car.heading += clamp(angDiff(car.heading, wantHeading), -2.4 * dt, 2.4 * dt);
    const blocked = carAheadBlocked(car, 11);
    const targetSpeed = blocked ? 0 : 9 + (car.cruise || 0);
    car.speed = lerp(car.speed, targetSpeed, clamp(dt * (blocked ? 6 : 1.2), 0, 1));
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const c = collideCircle(car.x, car.z, 1.7);
    car.x = c.x; car.z = c.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.6;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }
  function updateCarVsCar(car) {
    for (let i = 0; i < G.cars.length; i += 1) {
      const o = G.cars[i];
      if (o === car || o.dead) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.01 && d < 3.4) {
        const push = (3.4 - d) / 2, nx = dx / d, nz = dz / d;
        car.x -= nx * push; car.z -= nz * push;
        o.x += nx * push; o.z += nz * push;
        if (car.kind === 'player' && Math.abs(car.speed) > 6 && car.ramCd <= 0) {
          car.ramCd = 0.5; car.speed *= 0.55; AudioSys.crash();
          if (o.kind === 'traffic' && G.rng() < 0.5) AudioSys.honk();
        }
        if (o.kind === 'player') { o.speed *= 0.6; }
        o.mesh.position.set(o.x, 0, o.z);
      }
    }
  }

  /* ---------------- pedestrians ---------------- */
  function spawnPed(x, z) {
    const mesh = makePedMesh();
    mesh.position.set(x, 0, z);
    G.three.scene.add(mesh);
    const ped = {
      mesh, x, z, heading: G.rng() * Math.PI * 2, speed: 0, hp: 50,
      state: 'walk', tx: x, tz: z, fleeT: 0, dead: false, deadT: 0, walkPhase: G.rng() * 6,
    };
    pickPedTarget(ped);
    G.peds.push(ped);
    return ped;
  }
  function pickPedTarget(ped) {
    const rx = CFG.ROAD_X;
    const ix = Math.floor(G.rng() * rx.length), iz = Math.floor(G.rng() * rx.length);
    const side = G.rng() < 0.5 ? -1 : 1;
    ped.tx = rx[ix] + side * (CFG.ROAD / 2 + 2.5);
    ped.tz = rx[iz] + (G.rng() < 0.5 ? -1 : 1) * (CFG.ROAD / 2 + 2.5);
  }
  function updatePed(ped, dt) {
    if (ped.dead) { ped.deadT += dt; return; }
    let speed = 1.5;
    if (ped.state === 'flee') {
      speed = 3.8; ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.state = 'walk';
    }
    const dx = ped.tx - ped.x, dz = ped.tz - ped.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 2) { pickPedTarget(ped); return; }
    const want = Math.atan2(dx, dz);
    ped.heading += clamp(angDiff(ped.heading, want), -3 * dt, 3 * dt);
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    const c = collideCircle(ped.x, ped.z, 0.4);
    ped.x = c.x; ped.z = c.z;
    ped.walkPhase += dt * speed * 2.4;
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.06, ped.z);
    ped.mesh.rotation.y = ped.heading;
    const p = G.player;
    if (!p.onFoot && p.car && Math.abs(p.car.speed) > 8) {
      const dd = dist2(ped.x, ped.z, p.car.x, p.car.z);
      if (dd < 7 && ped.state !== 'flee') {
        ped.state = 'flee'; ped.fleeT = 3.5;
        ped.tx = ped.x + (ped.x - p.car.x) * 3; ped.tz = ped.z + (ped.z - p.car.z) * 3;
      }
    }
  }
  function scarePeds(x, z, radius) {
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist2(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee'; ped.fleeT = 4;
        ped.tx = ped.x + (ped.x - x) * 4; ped.tz = ped.z + (ped.z - z) * 4;
      }
    }
  }

  /* ---------------- police ---------------- */
  function wantedTarget() {
    if (G.wanted <= 0) return 0;
    return Math.min(1 + G.wanted, 4); // police cars wanted
  }
  function spawnPoliceCar() {
    const p = G.player;
    for (let tries = 0; tries < 12; tries += 1) {
      const ang = G.rng() * Math.PI * 2;
      const d = 60 + G.rng() * 35;
      const rc = nearestRoadCoord(p.x + Math.cos(ang) * d, p.z + Math.sin(ang) * d);
      const x = rc.axis === 'x' ? rc.line : p.x + Math.cos(ang) * d;
      const z = rc.axis === 'z' ? rc.line : p.z + Math.sin(ang) * d;
      if (dist2(x, z, p.x, p.z) > 45 && !insideSolid(x, z)) {
        const car = spawnCar(x, z, G.rng() * Math.PI * 2, 0xf2f2f2, 'police');
        car.cruise = 0;
        return car;
      }
    }
    return null;
  }
  function spawnPoliceFoot(x, z) {
    const mesh = makePedMesh();
    mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1d3a6e });
    mesh.position.set(x, 0, z);
    G.three.scene.add(mesh);
    const cop = { mesh, x, z, heading: 0, hp: 100, state: 'chase', dead: false, deadT: 0, walkPhase: 0 };
    G.policeFoot.push(cop);
    return cop;
  }
  function updatePoliceCar(car, dt) {
    if (car.hp <= 0) { // disabled wreck: a foot cop climbs out once
      if (!car.wreckHandled) {
        car.wreckHandled = true;
        spawnPoliceFoot(car.x + 2, car.z + 2);
      }
      car.speed = lerp(car.speed, 0, dt * 3);
      car.mesh.position.set(car.x, 0, car.z);
      return;
    }
    const p = G.player;
    const tx = p.car ? p.car.x : p.x, tz = p.car ? p.car.z : p.z;
    const dx = tx - car.x, dz = tz - car.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const wantHeading = Math.atan2(dx, dz);
    car.heading += clamp(angDiff(car.heading, wantHeading), -2.6 * dt, 2.6 * dt);
    const blocked = carAheadBlocked(car, 9) && d > 12;
    const targetSpeed = blocked ? 0 : Math.min(25, 10 + d * 0.55);
    car.speed = lerp(car.speed, targetSpeed, clamp(dt * 1.5, 0, 1));
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const c = collideCircle(car.x, car.z, 1.7);
    if (c.hit && Math.abs(car.speed) > 5) { car.speed *= 0.5; }
    car.x = c.x; car.z = c.z;
    if (d < 4.2 && car.ramCd <= 0) {
      car.ramCd = 1.2;
      if (p.car) { p.car.speed *= 0.75; hurtPlayer(6); }
      else hurtPlayer(10);
      AudioSys.crash();
    }
    car.ramCd -= dt;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const phase = Math.floor(G.time * 6) % 2 === 0;
    if (car.mesh.userData.barL) car.mesh.userData.barL.visible = phase;
    if (car.mesh.userData.barR) car.mesh.userData.barR.visible = !phase;
    const spin = car.speed * dt * 2.6;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }
  function updatePoliceFoot(cop, dt) {
    if (cop.dead) { cop.deadT += dt; return; }
    const p = G.player;
    const dx = p.x - cop.x, dz = p.z - cop.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const want = Math.atan2(dx, dz);
    cop.heading += clamp(angDiff(cop.heading, want), -4 * dt, 4 * dt);
    const speed = p.onFoot ? 5.4 : 3.2;
    cop.x += Math.sin(cop.heading) * speed * dt;
    cop.z += Math.cos(cop.heading) * speed * dt;
    const c = collideCircle(cop.x, cop.z, 0.4);
    cop.x = c.x; cop.z = c.z;
    cop.walkPhase += dt * speed * 2.4;
    cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.walkPhase)) * 0.06, cop.z);
    cop.mesh.rotation.y = cop.heading;
    const near = p.onFoot ? d < 2.4 : (d < 3 && p.car && Math.abs(p.car.speed) < 1);
    if (near) { G.bustTimer += dt; if (G.bustTimer > 2.5) Main.busted(); }
    else G.bustTimer = Math.max(0, G.bustTimer - dt * 2);
  }
  function updatePolice(dt) {
    if (G.wanted > 0) {
      const alive = G.policeCars.filter((c) => c.hp > 0).length;
      if (alive < wantedTarget() && G.rng() < dt * 0.8) spawnPoliceCar();
      if (G.player.onFoot && G.policeFoot.filter((c) => !c.dead).length < 2 && G.rng() < dt * 0.5) {
        const p = G.player;
        spawnPoliceFoot(p.x + (G.rng() < 0.5 ? -30 : 30), p.z + (G.rng() < 0.5 ? -30 : 30));
      }
    }
    for (const car of G.policeCars) updatePoliceCar(car, dt);
    for (const cop of G.policeFoot) updatePoliceFoot(cop, dt);
    if (G.wanted > 0) {
      let seen = false;
      for (const car of G.policeCars) if (car.hp > 0 && dist2(car.x, car.z, G.player.x, G.player.z) < 45) seen = true;
      for (const cop of G.policeFoot) if (!cop.dead && dist2(cop.x, cop.z, G.player.x, G.player.z) < 30) seen = true;
      if (!seen) {
        G.wantedTimer += dt;
        if (G.wantedTimer > 12) { G.wanted = Math.max(0, G.wanted - 1); G.wantedTimer = 0; HUD.toast('HEAT DYING DOWN', G.wanted === 0 ? 'The cops lost you.' : G.wanted + ' star' + (G.wanted > 1 ? 's' : '') + ' left.'); }
      } else G.wantedTimer = 0;
    }
    if (G.wanted === 0) {
      for (const car of G.policeCars) { G.three.scene.remove(car.mesh); car.dead = true; }
      G.policeCars = G.policeCars.filter((c) => !c.dead);
      for (const cop of G.policeFoot) { G.three.scene.remove(cop.mesh); cop.dead = true; }
      G.policeFoot = [];
    }
    for (let i = G.peds.length - 1; i >= 0; i -= 1) {
      const ped = G.peds[i];
      if (ped.dead && ped.deadT > 6) {
        G.three.scene.remove(ped.mesh);
        G.peds.splice(i, 1);
      }
    }
    while (G.peds.filter((p) => !p.dead).length < 22) {
      const a = G.rng() * Math.PI * 2, d = 30 + G.rng() * 90;
      const x = clamp(G.player.x + Math.cos(a) * d, -CFG.HALF, CFG.HALF);
      const z = clamp(G.player.z + Math.sin(a) * d, -CFG.HALF, CFG.HALF);
      if (!insideSolid(x, z)) spawnPed(x, z);
    }
  }

  /* ---------------- wanted / crimes ---------------- */
  function witnessNear(x, z, radius) {
    for (const ped of G.peds) if (!ped.dead && dist2(ped.x, ped.z, x, z) < radius) return true;
    for (const car of G.policeCars) if (car.hp > 0 && dist2(car.x, car.z, x, z) < radius) return true;
    for (const cop of G.policeFoot) if (!cop.dead && dist2(cop.x, cop.z, x, z) < radius) return true;
    return false;
  }
  let lastShotStar = -99;
  function addWanted(n, reason) {
    const before = G.wanted;
    G.wanted = clamp(G.wanted + n, 0, 5);
    if (G.wanted > before) {
      G.wantedTimer = 0;
      HUD.toast('WANTED — ' + G.wanted + ' STAR' + (G.wanted > 1 ? 'S' : ''), reason || 'The law is coming.');
      AudioSys.setSiren(true);
    }
    if (G.wanted === 0) AudioSys.setSiren(false);
  }
  function crimeShot(x, z) {
    if (G.time - lastShotStar > 3 && witnessNear(x, z, 38)) {
      lastShotStar = G.time;
      addWanted(1, 'Someone saw you pull the trigger.');
    }
  }
  function crimeKill(x, z) {
    if (witnessNear(x, z, 38)) addWanted(1, 'A body on the pavement. Witnesses called it in.');
  }

  /* ---------------- player ---------------- */
  function hurtPlayer(dmg) {
    const p = G.player;
    if (p.hurtCd > 0 || G.state !== 'play') return;
    p.hp -= dmg;
    p.hurtCd = 0.4;
    if (p.hp <= 0) { p.hp = 0; Main.wasted(); }
  }
  function playerShoot() {
    const p = G.player;
    if (!p.onFoot || p.shootCd > 0 || G.state !== 'play') return;
    p.shootCd = 0.28;
    AudioSys.shoot();
    AudioSys.unlock();
    const fx = Math.sin(G.cam.yaw), fz = Math.cos(G.cam.yaw);
    Main.spawnTracer(p.x, 1.4, p.z, fx, fz);
    scarePeds(p.x, p.z, 26);
    crimeShot(p.x, p.z);
    let best = null, bestD = 46;
    const consider = (x, z, obj, dmg) => {
      const dx = x - p.x, dz = z - p.z;
      const along = dx * fx + dz * fz;
      if (along < 1 || along > bestD) return;
      const perp = Math.abs(dx * fz - dz * fx);
      if (perp < 1.6) { best = { obj, dmg, along }; bestD = along; }
    };
    for (const ped of G.peds) if (!ped.dead) consider(ped.x, ped.z, ped, 34);
    for (const cop of G.policeFoot) if (!cop.dead) consider(cop.x, cop.z, cop, 34);
    for (const car of G.cars) if (car.kind === 'police' && car.hp > 0) consider(car.x, car.z, car, 25);
    if (best) {
      const o = best.obj;
      o.hp -= best.dmg;
      if (o.hp <= 0) {
        if (o.kind === 'police') { o.hp = 0; /* wreck handled in update */ }
        else {
          o.dead = true;
          o.mesh.rotation.x = -Math.PI / 2; o.mesh.position.y = 0.3;
          crimeKill(o.x, o.z);
        }
      } else if (o.state) {
        if (o.state === 'walk') { o.state = 'flee'; o.fleeT = 5; o.tx = o.x + (o.x - p.x) * 4; o.tz = o.z + (o.z - p.z) * 4; }
      }
    }
  }
  function playerPunch() {
    const p = G.player;
    if (!p.onFoot || p.punchCd > 0 || G.state !== 'play') return;
    p.punchCd = 0.45;
    AudioSys.punch();
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    for (const ped of G.peds) {
      if (ped.dead) continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < 2.4 && Math.abs(dx * fz - dz * fx) < 1.2) {
        ped.hp -= 30;
        ped.x += fx * 2.5; ped.z += fz * 2.5;
        scarePeds(ped.x, ped.z, 12);
        if (ped.hp <= 0) { ped.dead = true; ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.3; crimeKill(ped.x, ped.z); }
      }
    }
    for (const cop of G.policeFoot) {
      if (cop.dead) continue;
      const dx = cop.x - p.x, dz = cop.z - p.z;
      if (Math.sqrt(dx * dx + dz * dz) < 2.4) { cop.hp -= 30; if (cop.hp <= 0) { cop.dead = true; cop.mesh.rotation.x = -Math.PI / 2; } }
    }
  }
  function nearestStealableCar() {
    const p = G.player;
    let best = null, bestD = 4.2;
    for (const car of G.cars) {
      if (car.kind === 'police' || car.kind === 'player' || car.dead) continue;
      if (car.kind === 'traffic' && Math.abs(car.speed) > 2.5) continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
  function enterCar(car) {
    const p = G.player;
    const wasTraffic = car.kind === 'traffic';
    if (wasTraffic) {
      const d = spawnPed(car.x + 2, car.z + 2);
      d.state = 'flee'; d.fleeT = 6; d.tx = d.x + 20; d.tz = d.z + 20;
      if (witnessNear(car.x, car.z, 30)) addWanted(1, 'Carjacking, in broad daylight. Nice.');
    } else if (car.kind === 'parked') {
      if (witnessNear(car.x, car.z, 30)) addWanted(1, 'Someone saw you boost that car.');
    }
    car.kind = 'player';
    p.car = car; p.onFoot = false;
    p.mesh.visible = false;
    G.cam.dist = 12;
    AudioSys.unlock();
    Missions.onEnterCar(car);
  }
  function exitCar() {
    const p = G.player;
    if (!p.car) return;
    const car = p.car;
    car.kind = 'parked';
    car.speed = 0;
    const sx = car.x + Math.cos(car.heading) * 3, sz = car.z - Math.sin(car.heading) * 3;
    const c = collideCircle(sx, sz, 0.5);
    p.x = c.x; p.z = c.z;
    p.heading = car.heading;
    p.car = null; p.onFoot = true;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    G.cam.dist = 9;
  }
  function updatePlayerCar(dt) {
    const p = G.player, car = p.car;
    const k = G.keys;
    let throttle = 0;
    if (k.KeyW || k.ArrowUp) throttle = 1;
    if (k.KeyS || k.ArrowDown) throttle = -1;
    const steerInput = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
    const maxSpeed = 30;
    if (throttle > 0) car.speed += 15 * dt;
    else if (throttle < 0) {
      car.speed -= (car.speed > 0.5 ? 32 : 9) * dt;
      if (car.speed < -9) car.speed = -9;
    } else car.speed = lerp(car.speed, 0, clamp(dt * 1.4, 0, 1));
    if (car.speed > maxSpeed) car.speed = maxSpeed;
    const steer = steerInput * 0.62 * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.heading += steer * dt * (car.speed >= 0 ? 1 : -1) * 1.4;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = Math.abs(car.speed);
    const c = collideCircle(nx, nz, 1.7);
    if (c.hit && before > 7) { AudioSys.crash(); car.speed *= 0.35; hurtPlayer(before * 0.12); }
    else if (c.hit) car.speed *= 0.6;
    car.x = c.x; car.z = c.z;
    const cl = clampToCity(car.x, car.z);
    car.x = cl.x; car.z = cl.z;
    updateCarVsCar(car);
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist2(ped.x, ped.z, car.x, car.z) < 2.2 && Math.abs(car.speed) > 3) {
        ped.hp = 0; ped.dead = true;
        ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.3;
        ped.x += Math.sin(car.heading) * 3; ped.z += Math.cos(car.heading) * 3;
        addWanted(1, 'You ran someone down. Witnesses called it in.');
        car.speed *= 0.8;
      }
    }
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.6;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    AudioSys.setEngine(true, car.speed / maxSpeed);
    Missions.onDrive(car, dt);
  }
  function updatePlayerFoot(dt) {
    const p = G.player;
    const k = G.keys;
    let ix = 0, iz = 0;
    if (k.KeyW || k.ArrowUp) iz += 1;
    if (k.KeyS || k.ArrowDown) iz -= 1;
    if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const sprint = k.ShiftLeft || k.ShiftRight;
    const speed = sprint ? 7 : 4.2;
    if (moving) {
      // camera-relative movement: forward is away from camera
      const yaw = G.cam.yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = -Math.cos(yaw), rz = Math.sin(yaw);
      let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
      const ml = Math.sqrt(mx * mx + mz * mz);
      mx /= ml; mz /= ml;
      p.heading = Math.atan2(mx, mz);
      const nx = p.x + mx * speed * dt, nz = p.z + mz * speed * dt;
      const c = collideCircle(nx, nz, 0.5);
      p.x = c.x; p.z = c.z;
      const cl = clampToCity(p.x, p.z);
      p.x = cl.x; p.z = cl.z;
      p.walkPhase = (p.walkPhase || 0) + dt * speed * 2.2;
    }
    p.mesh.position.set(p.x, moving ? Math.abs(Math.sin(p.walkPhase || 0)) * 0.07 : 0, p.z);
    p.mesh.rotation.y = p.heading;
    p.shootCd -= dt; p.punchCd -= dt;
    if (k.KeyF) playerPunch();
    AudioSys.setEngine(false, 0);
  }
  function updatePlayer(dt) {
    const p = G.player;
    p.hurtCd -= dt;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.onFoot) updatePlayerFoot(dt);
    else updatePlayerCar(dt);
    if (G.wanted === 0 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 3 * dt);
  }

  /* ---------------- world population ---------------- */
  function populate() {
    const rng = G.rng;
    const p = G.player;
    p.x = CFG.ROAD_X[4] + 2; p.z = CFG.ROAD_X[5] + 2;
    p.heading = 0; p.hp = 100; p.onFoot = true; p.car = null;
    p.mesh = makePlayerMesh();
    p.mesh.position.set(p.x, 0, p.z);
    G.three.scene.add(p.mesh);
    const parkedColors = [0xc23b3b, 0x3b6ec2, 0x3bc25a, 0xd8d8d8, 0x2a2a2a, 0xe08a2a, 0x7a4ac2, 0x4ac2c2];
    for (let i = 0; i < 10; i += 1) {
      const rx = CFG.ROAD_X[1 + Math.floor(rng() * 7)];
      const rz = CFG.ROAD_X[1 + Math.floor(rng() * 7)];
      const alongRoad = rng() < 0.5;
      const x = alongRoad ? rx + (rng() < 0.5 ? -1 : 1) * 4.6 : rx + rngRange(rng, -CFG.HALF + 20, CFG.HALF - 20);
      const z = alongRoad ? rz + rngRange(rng, -CFG.HALF + 20, CFG.HALF - 20) : rz + (rng() < 0.5 ? -1 : 1) * 4.6;
      if (insideSolid(x, z) || dist2(x, z, p.x, p.z) < 12) continue;
      // face along the road the car is parked on: vertical road -> face +/-z,
      // horizontal road -> face +/-x
      const heading = alongRoad ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = spawnCar(x, z, heading, parkedColors[i % parkedColors.length], 'parked');
      car.speed = 0;
    }
    // the mission coupe: bright yellow, parked by the marina lot
    const coupe = spawnCar(CFG.ROAD_X[6] + 4.6, CFG.ROAD_X[7] - 30, Math.PI / 2, 0xffd23e, 'parked');
    coupe.isCoupe = true;
    G.coupe = coupe;
    for (let i = 0; i < 14; i += 1) {
      const rx = CFG.ROAD_X[1 + Math.floor(rng() * 7)];
      const rz = CFG.ROAD_X[1 + Math.floor(rng() * 7)];
      const car = spawnCar(rx, rz, Math.floor(rng() * 4) * Math.PI / 2, parkedColors[Math.floor(rng() * parkedColors.length)], 'traffic');
      car.cruise = rngRange(rng, -2, 3);
      car.to = { x: rx, z: rz };
      pickNextNode(car);
    }
    for (let i = 0; i < 24; i += 1) {
      const rx = CFG.ROAD_X[Math.floor(rng() * CFG.ROAD_X.length)];
      const rz = CFG.ROAD_X[Math.floor(rng() * CFG.ROAD_X.length)];
      spawnPed(rx + rngRange(rng, -8, 8), rz + rngRange(rng, -8, 8));
    }
  }

  return {
    populate, updatePlayer, updatePlayerFoot, updatePlayerCar,
    updateTrafficCar, updatePed, updatePolice, spawnCar, spawnPed, spawnPoliceCar,
    nearestStealableCar, enterCar, exitCar, playerShoot, playerPunch,
    addWanted, scarePeds, hurtPlayer, witnessNear, updateCarVsCar,
  };
})();
