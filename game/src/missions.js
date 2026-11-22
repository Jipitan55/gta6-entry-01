// Vesper City — the story: an intro and a chain of missions with on-screen
// objectives, map markers and cash rewards, ending in a completion state.

'use strict';

const Missions = (() => {
  const RX = CFG.ROAD_X;
  // Fixed story locations (street corners of the grid)
  const LOC = {
    bar: { x: RX[2], z: RX[2], name: 'The Rusty Anchor, Harrow St' },
    garage: { x: RX[7], z: RX[3], name: 'Vesper Garage, Dockside' },
    dock: { x: RX[1], z: RX[8], name: 'Pier 9, the docks' },
    dropoff: { x: RX[8], z: RX[1], name: 'The Coral Motel, north end' },
    safehouse: { x: RX[3], z: RX[6], name: 'Safehouse, Coral St' },
  };

  const LIST = [
    {
      id: 'meet', title: 'MISSION 1 — MEET MARLOWE',
      brief: 'Marlowe is waiting at The Rusty Anchor. Go and hear what she wants.',
      reward: 100,
      steps: [
        { type: 'goto', loc: 'bar', label: 'Go to The Rusty Anchor' },
      ],
    },
    {
      id: 'hotwheels', title: 'MISSION 2 — HOT WHEELS',
      brief: 'A yellow coupe is parked by the marina lot. Boost it and bring it to Vesper Garage. Try not to get seen.',
      reward: 300,
      steps: [
        { type: 'steal', label: 'Steal the yellow coupe by the marina' },
        { type: 'goto', loc: 'garage', inCar: true, label: 'Deliver the coupe to Vesper Garage' },
      ],
    },
    {
      id: 'package', title: 'MISSION 3 — THE PACKAGE',
      brief: 'Pick up the package at Pier 9 and run it to the Coral Motel. The docks are watched — expect heat.',
      reward: 500,
      steps: [
        { type: 'goto', loc: 'dock', label: 'Pick up the package at Pier 9' },
        { type: 'goto', loc: 'dropoff', label: 'Deliver the package to the Coral Motel' },
      ],
    },
    {
      id: 'heat', title: 'MISSION 4 — HEAT',
      brief: 'The whole city is looking for you now. Lose the cops, then disappear to the safehouse on Coral St.',
      reward: 800,
      steps: [
        { type: 'lose', label: 'Lose the cops — break line of sight until the stars drop' },
        { type: 'goto', loc: 'safehouse', label: 'Reach the safehouse on Coral St' },
      ],
    },
  ];

  function current() { return LIST[G.missionIdx] || null; }
  function currentStep() {
    const m = current();
    return m ? m.steps[G.missionStep] : null;
  }
  function missionPos(step) {
    if (!step || !step.loc) return null;
    return LOC[step.loc];
  }

  function refreshMarker() {
    const step = currentStep();
    if (!step) { City.setMarker(0, 0, false); return; }
    if (step.type === 'goto') {
      const loc = LOC[step.loc];
      City.setMarker(loc.x, loc.z, true);
    } else if (step.type === 'steal') {
      const c = G.coupe;
      City.setMarker(c ? c.x : 0, c ? c.z : 0, true);
    } else {
      City.setMarker(0, 0, false);
    }
  }

  function startMission(idx) {
    G.missionIdx = idx;
    G.missionStep = 0;
    const m = current();
    if (m) {
      HUD.toast(m.title, m.brief);
      AudioSys.mission();
    }
    refreshMarker();
    saveGame();
  }

  function completeStep() {
    const m = current();
    const step = currentStep();
    if (!m || !step) return;
    if (step.type === 'goto' && step.loc === 'dock') {
      // picking up the package draws heat
      Actors.addWanted(1, 'The docks are watched. You have company now.');
    }
    G.missionStep += 1;
    AudioSys.pickup();
    if (G.missionStep >= m.steps.length) completeMission();
    else refreshMarker();
    saveGame();
  }

  function completeMission() {
    const m = current();
    G.cash += m.reward;
    G.debt = Math.max(0, G.debt - m.reward);
    HUD.toast('MISSION COMPLETE', m.title + ' — +$' + m.reward + (G.debt > 0 ? '  ·  Debt left: $' + G.debt : '  ·  Debt paid off!'));
    AudioSys.mission();
    if (G.missionIdx + 1 >= LIST.length) {
      G.storyDone = true;
      G.missionDone = true;
      setTimeout(() => Main.storyComplete(), 1800);
    } else {
      setTimeout(() => startMission(G.missionIdx + 1), 1500);
    }
    saveGame();
  }

  function checkStep(dt) {
    if (G.state !== 'play' || G.storyDone) return;
    const step = currentStep();
    if (!step) return;
    const p = G.player;
    if (step.type === 'goto') {
      const loc = LOC[step.loc];
      const d = dist2(p.x, p.z, loc.x, loc.z);
      if (d < 6 && (!step.inCar || !p.onFoot)) completeStep();
    } else if (step.type === 'steal') {
      // completes on entering the coupe (onEnterCar), but also re-checks here:
      // the player may already be sitting in it when the mission starts
      if (!p.onFoot && p.car && p.car.isCoupe) completeStep();
    } else if (step.type === 'lose') {
      if (G.wanted === 0) completeStep();
    }
  }

  function onEnterCar(car) {
    const step = currentStep();
    if (step && step.type === 'steal' && car.isCoupe) completeStep();
  }
  function onDrive(car, dt) {
    // no per-frame mission logic needed yet; kept for the driving checks hook
  }

  function objectiveText() {
    const m = current();
    if (!m) return { title: 'FREE ROAM', text: 'Vesper City is yours. Steal cars, dodge the law, make money.', dist: '' };
    const step = currentStep();
    const loc = step ? missionPos(step) : null;
    let dist = '';
    if (loc) {
      const d = Math.round(dist2(G.player.x, G.player.z, loc.x, loc.z));
      dist = d + 'm · ' + loc.name;
    } else if (step && step.type === 'steal' && G.coupe) {
      dist = Math.round(dist2(G.player.x, G.player.z, G.coupe.x, G.coupe.z)) + 'm · Marina lot';
    } else if (step && step.type === 'lose') {
      dist = G.wanted > 0 ? 'Wanted level: ' + G.wanted + '★ — stay out of sight' : 'Clean — go to the safehouse';
    }
    return { title: m.title, text: step ? step.label : m.brief, dist };
  }

  return {
    LIST, LOC, current, currentStep, startMission, completeStep, completeMission,
    checkStep, onEnterCar, onDrive, objectiveText, refreshMarker,
  };
})();
