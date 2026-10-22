'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-candidate-'));
const write = (relative, value) => {
  const file = path.join(lab, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
};
const run = () => {
  try {
    return { status: 0, output: execFileSync(process.execPath, [path.join(lab, 'scripts/check-native-release-candidate.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) { return { status: error.status, output: String(error.stderr || '') }; }
};

try {
  write('scripts/check-native-release-candidate.js', fs.readFileSync(path.join(root, 'scripts/check-native-release-candidate.js')));
  write('version.txt', '2.5.29\n');
  write('capacitor.config.json', JSON.stringify({ webDir: 'www', server: {} }));
  write('ios/App/App.xcodeproj/project.pbxproj', 'MARKETING_VERSION = 2.5.29;\nCURRENT_PROJECT_VERSION = 289;\n');
  write('android/app/build.gradle', 'versionCode 176\nversionName "2.5.18"\n');
  write('android/wear/build.gradle', 'versionCode 177\nversionName "2.5.18"\n');
  let result = run();
  assert.equal(result.status, 0, result.output);
  write('android/wear/build.gradle', 'versionCode 177\nversionName "9.4.17"\n');
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.output, /divergem/);
  write('android/wear/build.gradle', 'versionCode 176\nversionName "2.5.18"\n');
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.output, /versionCode/);
  write('android/wear/build.gradle', 'versionCode 177\nversionName "2.5.18"\n');
  write('capacitor.config.json', JSON.stringify({ webDir: 'www', server: { url: 'https://example.test' } }));
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.output, /server\.url/);
  console.log('✓ candidato nativo: cortes independentes, builds únicos e bundle local obrigatórios');
} finally { fs.rmSync(lab, { recursive: true, force: true }); }
