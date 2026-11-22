// Vesper City — builds the 3D city: ground, road grid, sidewalks, buildings with
// lit windows, lamps, palms and props. Reuses a few geometries and materials so the
// scene stays cheap. Also owns the mission marker beacon.

'use strict';

const City = (() => {
  let windowTex = null;

  function makeWindowTexture() {
    // One shared canvas texture: a facade of lit and dark windows.
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#20242e'; g.fillRect(0, 0, 128, 256);
    const rng = createRng(99);
    for (let y = 8; y < 248; y += 22) {
      for (let x = 8; x < 120; x += 20) {
        const lit = rng() < 0.42;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd0ff') : '#12151d';
        g.fillRect(x, y, 12, 14);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function build() {
    const rng = G.rng;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ec9ee);
    scene.fog = new THREE.Fog(0x8ec9ee, 320, 620);
    const camera = new THREE.PerspectiveCamera(62, 1280 / 800, 0.1, 1200);
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sun = new THREE.DirectionalLight(0xfff2d0, 1.35);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xbfd9ff, 0.55));
    scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x3a2f26, 0.35));

    windowTex = makeWindowTexture();

    // Materials (shared)
    const matGround = new THREE.MeshLambertMaterial({ color: 0x3d4450 });
    const matRoad = new THREE.MeshLambertMaterial({ color: 0x2c313a });
    const matWalk = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const matCurb = new THREE.MeshLambertMaterial({ color: 0x6f6a62 });
    const matTrunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const matPalm = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    const matLamp = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
    const matLampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const palette = [0xd8c9a8, 0xb8c4cc, 0xc9a689, 0xa8b8a0, 0xd0a0a0, 0x9fb4c9, 0xcbb98a, 0xb0a8c0];

    // Ground + road strips
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF * 2 + 60, CFG.HALF * 2 + 60), matGround);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const roadGeoH = new THREE.PlaneGeometry(CFG.HALF * 2 + 60, CFG.ROAD);
    const roadGeoV = new THREE.PlaneGeometry(CFG.ROAD, CFG.HALF * 2 + 60);
    for (let i = 0; i < CFG.ROAD_X.length; i += 1) {
      const c = CFG.ROAD_X[i];
      const rh = new THREE.Mesh(roadGeoH, matRoad);
      rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.02, c); rh.receiveShadow = true; scene.add(rh);
      const rv = new THREE.Mesh(roadGeoV, matRoad);
      rv.rotation.x = -Math.PI / 2; rv.position.set(c, 0.02, 0); rv.receiveShadow = true; scene.add(rv);
    }
    // Centre dashes
    const dashGeo = new THREE.PlaneGeometry(3, 0.5);
    const matDash = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
    for (let i = 0; i < CFG.ROAD_X.length; i += 1) {
      for (let d = -CFG.HALF + 14; d < CFG.HALF; d += 28) {
        const dh = new THREE.Mesh(dashGeo, matDash);
        dh.rotation.x = -Math.PI / 2; dh.position.set(d, 0.04, CFG.ROAD_X[i]); scene.add(dh);
        const dv = new THREE.Mesh(dashGeo, matDash);
        dv.rotation.x = -Math.PI / 2; dv.rotation.z = Math.PI / 2; dv.position.set(CFG.ROAD_X[i], 0.04, d); scene.add(dv);
      }
    }

    // Blocks: sidewalk slab, buildings, palms, lamps
    const walkGeo = new THREE.BoxGeometry(CFG.BLOCK - CFG.ROAD + 4, 0.35, CFG.BLOCK - CFG.ROAD + 4);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6);
    const palmGeo = new THREE.SphereGeometry(1.9, 7, 5);
    const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
    const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const buildingMats = palette.map((col) => new THREE.MeshLambertMaterial({ color: col, map: windowTex }));

    for (let bx = 0; bx < CFG.GRID; bx += 1) {
      for (let bz = 0; bz < CFG.GRID; bz += 1) {
        const cx = -CFG.HALF + CFG.BLOCK / 2 + bx * CFG.BLOCK;
        const cz = -CFG.HALF + CFG.BLOCK / 2 + bz * CFG.BLOCK;
        const walk = new THREE.Mesh(walkGeo, matWalk);
        walk.position.set(cx, 0.17, cz); walk.receiveShadow = true; scene.add(walk);
        // 1-3 buildings per block, leaving a plaza gap on some blocks
        const nB = 1 + Math.floor(rng() * 3);
        const spots = [
          [-9, -9, 14, 14], [10, -10, 12, 16], [-10, 10, 16, 12], [9, 9, 13, 13],
        ];
        for (let b = 0; b < nB; b += 1) {
          const s = spots[(bx * 3 + bz + b) % spots.length];
          const w = s[2] + rng() * 4, d = s[3] + rng() * 4;
          const h = 7 + rng() * rng() * 34; // mostly low, a few towers
          const geo = new THREE.BoxGeometry(w, h, d);
          const mat = buildingMats[Math.floor(rng() * buildingMats.length)];
          const bld = new THREE.Mesh(geo, mat);
          const px = cx + s[0], pz = cz + s[1];
          bld.position.set(px, h / 2 + 0.35, pz);
          bld.castShadow = true; bld.receiveShadow = true;
          scene.add(bld);
          G.solids.push({ x0: px - w / 2, x1: px + w / 2, z0: pz - d / 2, z1: pz + d / 2 });
          // rooftop box on tall towers
          if (h > 26) {
            const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 4), matCurb);
            roof.position.set(px, h + 1.5, pz); roof.castShadow = true; scene.add(roof);
          }
        }
        // palms on block corners
        if (rng() < 0.75) {
          const px = cx + (rng() < 0.5 ? -17 : 17), pz = cz + (rng() < 0.5 ? -17 : 17);
          const trunk = new THREE.Mesh(trunkGeo, matTrunk);
          trunk.position.set(px, 2, pz); trunk.castShadow = true; scene.add(trunk);
          const top = new THREE.Mesh(palmGeo, matPalm);
          top.position.set(px, 4.4, pz); top.scale.y = 0.7; top.castShadow = true; scene.add(top);
        }
        // lamps at two corners of each block
        for (const [ox, oz] of [[-19, -19], [19, 19]]) {
          const pole = new THREE.Mesh(lampPoleGeo, matLamp);
          pole.position.set(cx + ox, 2.9, cz + oz); scene.add(pole);
          const head = new THREE.Mesh(lampHeadGeo, matLampGlow);
          head.position.set(cx + ox, 5.6, cz + oz); scene.add(head);
        }
      }
    }

    // The bay: a blue strip along the south edge, beyond the grid
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF * 2 + 220, 90),
      new THREE.MeshLambertMaterial({ color: 0x2f7fb8 }));
    bay.rotation.x = -Math.PI / 2; bay.position.set(0, 0.01, CFG.HALF + 62); scene.add(bay);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 46), matCurb);
    pier.position.set(60, 0.3, CFG.HALF + 40); scene.add(pier);

    // Mission marker beacon: light pillar + spinning diamond, moved by missions.js
    const markerGroup = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    pillar.position.y = 30; markerGroup.add(pillar);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    diamond.position.y = 7; markerGroup.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; markerGroup.add(ring);
    markerGroup.visible = false;
    scene.add(markerGroup);
    G.markerMesh = markerGroup;
    G.markerDiamond = diamond;
    G.markerRing = ring;

    G.three = { scene, camera, renderer, sun };
    return G.three;
  }

  function setMarker(x, z, visible) {
    if (!G.markerMesh) return;
    G.markerMesh.visible = !!visible;
    if (visible) { G.markerMesh.position.set(x, 0, z); G.marker = { x, z }; }
    else G.marker = null;
  }

  function animateMarker(t) {
    if (!G.markerMesh || !G.markerMesh.visible) return;
    G.markerDiamond.rotation.y = t * 1.6;
    G.markerDiamond.position.y = 7 + Math.sin(t * 2.2) * 0.7;
    const s = 1 + Math.sin(t * 3) * 0.12;
    G.markerRing.scale.set(s, s, 1);
  }

  function resize() {
    if (!G.three) return;
    const w = window.innerWidth, h = window.innerHeight;
    G.three.camera.aspect = w / h;
    G.three.camera.updateProjectionMatrix();
    G.three.renderer.setSize(w, h);
  }

  return { build, setMarker, animateMarker, resize };
})();
