// Vesper City — screenshot scenes behind ?shot=start|play|end|combat (&seed=N).
// Each stages a real game state and plays it forward in fixed 1/60 s steps with a
// scripted driver, so the frame is what short real play looks like and the same
// seed always gives the same frame.

'use strict';

const Shots = (() => {
  const STEP = 1 / 60;

  function driveStraight(seconds, laneX) {
    // hold W, steer gently back onto the lane line
    for (let i = 0; i < seconds / STEP; i += 1) {
      const car = G.player.car;
      G.keys.KeyW = true; G.keys.KeyS = false;
      if (car) {
        const off = car.x - laneX;
        const steer = clamp(-off * 0.06 - Math.sin(car.heading) * 1.2, -1, 1);
        G.keys.KeyA = steer > 0.15;
        G.keys.KeyD = steer < -0.15;
      }
      Main.stepWorld(STEP);
    }
    G.keys.KeyW = false; G.keys.KeyA = false; G.keys.KeyD = false;
  }

  function putPlayerInCarAt(x, z, heading, specificCar) {
    // teleport a car (the nearest one, or the one named) and the player into place
    let car = specificCar || null;
    if (!car) {
      let bestD = Infinity;
      for (const c of G.cars) {
        if (c.kind === 'police' || c.dead) continue;
        const d = dist2(c.x, c.z, x, z);
        if (d < bestD) { bestD = d; car = c; }
      }
    }
    if (!car) car = G.coupe;
    car.x = x; car.z = z; car.heading = heading; car.speed = 0;
    car.mesh.position.set(x, 0, z); car.mesh.rotation.y = heading;
    if (G.player.car && G.player.car !== car) { G.player.car.kind = 'parked'; }
    G.player.car = car; car.kind = 'player';
    G.player.onFoot = false; G.player.x = x; G.player.z = z; G.player.heading = heading;
    G.player.mesh.visible = false;
    G.cam.dist = 12;
    return car;
  }

  function stageStart() {
    G.state = 'title';
    Main.showScreen('screen-start');
    for (let i = 0; i < 5 / STEP; i += 1) {
      for (const car of G.cars) if (car.kind === 'traffic') Actors.updateTrafficCar(car, STEP);
      for (const ped of G.peds) Actors.updatePed(ped, STEP);
      G.time += STEP;
    }
    return 'title';
  }

  function stagePlay() {
    G.state = 'play';
    HUD.show(true);
    Missions.startMission(1); // Hot Wheels: steal the coupe
    const laneX = CFG.ROAD_X[4] + 2.6;
    // the player is in the coupe itself: the steal step completes, so the
    // screenshot shows the delivery leg with the garage marker up
    const car = putPlayerInCarAt(laneX, CFG.ROAD_X[3] - 40, 0, G.coupe);
    Missions.onEnterCar(car);
    // make sure a few traffic cars are on this road, ahead and behind
    let placed = 0;
    for (const c of G.cars) {
      if (placed >= 4) break;
      if (c.kind === 'traffic') {
        c.x = laneX + (placed % 2 === 0 ? 0 : -5.2);
        c.z = CFG.ROAD_X[3] - 40 + 26 + placed * 18;
        c.heading = 0; c.speed = 8; c.to = { x: CFG.ROAD_X[4], z: CFG.ROAD_X[6] };
        c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = 0;
        placed += 1;
      }
    }
    G.cam.yaw = 0; G.cam.pitch = 0.35;
    driveStraight(6, laneX);
    return 'play';
  }

  function stageEnd() {
    G.state = 'play';
    HUD.show(true);
    Missions.startMission(3); // Heat: lose the cops
    Actors.addWanted(3, 'Three stars. Every unit in Vesper City is rolling.');
    const laneX = CFG.ROAD_X[5] - 2.6;
    const z0 = CFG.ROAD_X[2] - 30;
    const car = putPlayerInCarAt(laneX, z0, 0);
    // The chase must be VISIBLE: one unit comes head-on down the same road,
    // one rides alongside, one closes from behind. Short drive so they stay close.
    const spots = [
      { dx: -5.2, dz: 80, heading: Math.PI, speed: 12 }, // oncoming, ahead (slow, stays in frame)
      { dx: 5.2, dz: 0, heading: 0, speed: 24 },        // alongside, right at the window
      { dx: -5.2, dz: -14, heading: 0, speed: 24 },     // closing from behind
    ];
    for (let i = 0; i < 3; i += 1) {
      const pc = Actors.spawnPoliceCar();
      if (!pc) break;
      pc.x = laneX + spots[i].dx; pc.z = z0 + spots[i].dz;
      pc.heading = spots[i].heading; pc.speed = spots[i].speed;
      pc.mesh.position.set(pc.x, 0, pc.z); pc.mesh.rotation.y = pc.heading;
    }
    G.cam.yaw = 0; G.cam.pitch = 0.3; G.cam.dist = 14;
    driveStraight(2.0, laneX);
    return 'play';
  }

  function stageCombat() {
    G.state = 'play';
    HUD.show(true);
    Missions.startMission(0); // Meet Marlowe — street-level, on foot
    const p = G.player;
    // stand in the middle of an intersection: no lamp post or building can
    // block the camera, and the road gives a clear line of fire
    p.x = CFG.ROAD_X[4]; p.z = CFG.ROAD_X[4];
    p.heading = 0; p.onFoot = true; p.car = null;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    // a pedestrian 12 m straight ahead, in the line of fire
    const ped = G.peds[0];
    ped.x = p.x; ped.z = p.z + 12; ped.dead = false;
    ped.mesh.rotation.x = 0; ped.mesh.position.set(ped.x, 0, ped.z);
    // a police car closing from the left lane of the same road, light bar
    // flashing — spawned AFTER the settle sim: updatePolice removes police
    // while the wanted level is 0, so it must arrive after the shot
    const cop = Actors.spawnPoliceCar();
    if (cop) {
      cop.x = CFG.ROAD_X[4] - 2.6; cop.z = p.z + 26; cop.heading = 0.2; cop.speed = 10;
      cop.mesh.position.set(cop.x, 0, cop.z); cop.mesh.rotation.y = cop.heading;
    }
    G.cam.yaw = 0; // view direction +z, straight at the ped
    G.cam.pitch = 0.3;
    // fire: the tracer and the muzzle flash are still alive when the frame
    // is painted, and the shot itself raises the wanted level to 1
    Actors.playerShoot();
    return 'play';
  }

  function stageShot(name) {
    if (name === 'play') return stagePlay();
    if (name === 'end') return stageEnd();
    if (name === 'combat') return stageCombat();
    return stageStart();
  }

  return { stageShot };
})();
