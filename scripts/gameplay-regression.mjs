import { readFileSync } from 'node:fs';

const files = {
  engine: 'artifacts/killer-pool/src/game/engine.ts',
  network: 'artifacts/killer-pool/src/auth/NetworkContext.tsx',
  app: 'artifacts/killer-pool/src/App.tsx',
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
);

const checks = [
  ['engine exposes ball-in-hand state', /ballInHand/ , source.engine],
  ['engine clamps cue-ball placement', /clampCueBallToBaulk|baulk|ballInHand/, source.engine],
  ['engine resets spin at turn start', /currentSpin\s*=\s*\{\s*x:\s*0\s*,\s*z:\s*0\s*\}/, source.engine],
  ['engine has explicit shot execution', /executeShot/, source.engine],
  ['network publishes active aim', /activeAim/, source.network],
  ['network sends a cue-ball placement with aim state', /sendAimState[\s\S]*pos/, source.network],
  ['network has rematch votes', /rematchVotes/, source.network],
  ['network has presence/heartbeat support', /heartbeatAt|onDisconnect|presence/, source.network],
  ['application supports orientation changes', /orientationchange|resize/, source.app],
];

let failed = 0;
for (const [label, pattern, text] of checks) {
  if (pattern.test(text)) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} gameplay regression contract(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} gameplay regression contracts passed.`);
