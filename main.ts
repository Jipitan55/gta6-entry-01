// Vesper City — the gta6-01 entry handover (Node 22, standard library only).
// The game is this directory's game/ folder: an original open-world crime game
// ("Vesper City", three.js vendored as game/vendor/three.min.js) that a desktop
// browser loads offline from game/index.html with no network request. This program
// hands it in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Screenshots are real renders of the game's own code, taken
// headless at 1280x800 (?shot=start|play|end|combat&seed=1, see shots.json):
// the title over the city, driving the stolen coupe, a 3-star police chase, and
// on-foot combat. Then it prints a one-line handover summary (counts and bytes)
// so a local run shows at a glance what was handed in.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Handover summary: what was handed in, at a glance. Counts the game files and
// screenshots actually written, so a local run shows the shape of the entry.
function countTree(dir) {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { const sub = countTree(path); files += sub.files; bytes += sub.bytes; }
    else if (entry.isFile()) { files += 1; bytes += statSync(path).size; }
  }
  return { files, bytes };
}
const gameCount = countTree(join(out, 'game'));
const shotCount = countTree(join(out, 'screenshots'));
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `Vesper City handed in: ${gameCount.files} game files (${gameCount.bytes} bytes), ` +
  `${shotCount.files} screenshots (${shotCount.bytes} bytes), dossier.json (${dossierBytes} bytes)`,
);
