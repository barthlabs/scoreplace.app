/* Driver da PARIDADE do motor Java do Wear (Caminho B, Leva 2).
 * Compila o ScoreEngine.java REAL do :wear + o ParityMain e reproduz os
 * vetores de tests/watch-engine/vectors/ — cada evento tem que produzir o
 * snapshot CANÔNICO idêntico ao gravado do motor JS.
 *
 *   node tests/watch-engine/run-java-parity.js
 *   (ou tests/watch-engine/run-java-parity.sh, que arruma o JAVA_HOME)
 *
 * ⚠️ Fora do npm test de propósito (exige JDK; a CI não tem) — mesmo regime do
 * runner Swift. Gate obrigatório pré-build do Wear e a cada regravação de vetores.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const VEC_DIR = path.join(__dirname, 'vectors');
const OUT = '/tmp/sp-watch-parity-java';

// mesma régua canônica do generate.js (chaves ordenadas)
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

function main() {
  const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  const javac = path.join(javaHome, 'bin', 'javac');
  const java = path.join(javaHome, 'bin', 'java');
  if (!fs.existsSync(javac)) {
    console.error('✗ JDK não encontrado em', javaHome, '— exporte JAVA_HOME (openjdk@21 do Homebrew)');
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(javac, ['-encoding', 'UTF-8', '-d', OUT,
    path.join(ROOT, 'android', 'wear', 'src', 'main', 'java', 'app', 'scoreplace', 'wear', 'ScoreEngine.java'),
    path.join(__dirname, 'java', 'ParityMain.java')], { stdio: 'inherit' });

  const files = fs.readdirSync(VEC_DIR).filter(f => f.endsWith('.json')).sort();
  if (!files.length) { console.error('✗ nenhum vetor em', VEC_DIR); process.exit(1); }

  // monta o protocolo de linhas com TODOS os vetores numa sessão só
  const lines = [];
  const vectors = [];
  for (const f of files) {
    const v = JSON.parse(fs.readFileSync(path.join(VEC_DIR, f), 'utf8'));
    vectors.push(v);
    lines.push('VECTOR ' + v.name);
    lines.push('P1 ' + v.players.p1Name);
    lines.push('P2 ' + v.players.p2Name);
    lines.push('DOUBLES ' + (v.players.isDoubles ? 1 : 0));
    lines.push('SPORT ' + v.sport);
    for (const [k, val] of Object.entries(v.config)) lines.push('CFG ' + k + ' ' + val);
    for (const step of v.steps) {
      const ev = step.event;
      if (ev.kind === 'open') lines.push('OPEN');
      else if (ev.kind === 'point') lines.push('EV point ' + ev.team);
      else if (ev.kind === 'undo') lines.push('EV undo');
      else if (ev.kind === 'serveSelect') lines.push('EV serveSelect ' + ev.team + ' ' + ev.idx);
      else if (ev.kind === 'serveConfirm') lines.push('EV serveConfirm');
      else if (ev.kind === 'resolveTie') lines.push('EV resolveTie ' + ev.rule);
      else { console.error('✗ evento desconhecido no vetor:', ev.kind); process.exit(1); }
    }
  }

  const r = spawnSync(java, ['-cp', OUT, 'ParityMain'],
    { input: lines.join('\n') + '\n', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error('✗ runner Java falhou:', (r.stderr || '').slice(0, 2000));
    process.exit(1);
  }
  const outLines = r.stdout.split('\n').filter(Boolean);

  let idx = 0, totalSteps = 0, badVectors = 0;
  for (const v of vectors) {
    let divergiu = -1;
    for (let i = 0; i < v.steps.length; i++) {
      const mine = outLines[idx++];
      const ref = stable(v.steps[i].state);
      totalSteps++;
      if (mine !== ref) {
        divergiu = i;
        console.error('✗ ' + v.name + ': DIVERGE no passo ' + i + ' (evento ' + v.steps[i].event.kind + ')');
        console.error('  JS  :', ref);
        console.error('  Java:', mine);
        idx += v.steps.length - i - 1;   // pula o resto deste vetor no stream
        break;
      }
    }
    if (divergiu === -1) console.log('✓ ' + v.name + ': ' + v.steps.length + ' passos idênticos');
    else badVectors++;
  }
  if (badVectors > 0) { console.error('✗', badVectors, 'vetor(es) divergente(s)'); process.exit(1); }
  console.log('✓ PARIDADE Java×JS: ' + vectors.length + ' vetores, ' + totalSteps + ' snapshots idênticos');
}

main();
