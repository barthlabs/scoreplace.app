'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');

const ROOT = path.join(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 10000);
const PROJECT = 'demo-scoreplace-draw-checkpoint';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-draw-checkpoint-'));
const config = path.join(dir, 'firebase.json');
fs.writeFileSync(config, JSON.stringify({ firestore:{ rules:path.join(ROOT, 'firestore.rules') },
  emulators:{ firestore:{ host:'127.0.0.1', port:PORT }, ui:{ enabled:false }, singleProjectMode:true } }));
try {
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', PROJECT, 'node functions-autodraw/test-draw-checkpoint-emu.js'], {
    cwd:ROOT, encoding:'utf8', stdio:['ignore','pipe','pipe'],
    env:Object.assign({}, process.env, { PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH })
  });
  assert.match(output, /✅ checkpoint pós-sorteio: reset repetível, recuperação e integridade no Firestore Emulator/,
    'driver de checkpoint não concluiu: ' + output.slice(-1400));
  console.log('draw-checkpoint-emulator: restauração repetível e retomada verificadas');
} finally {
  fs.rmSync(dir, { recursive:true, force:true });
}
