/* Gerador dos vetores de paridade (Caminho B, Leva 1).
 * Dirige o motor GSM REAL (bracket-ui.js no harness.html, Chromium headless) com
 * as sequências de tests/watch-engine/scenarios.js e captura o snapshot
 * (_getLiveScoreState) depois de CADA evento.
 *
 *   node tests/watch-engine/generate.js            → compara com os vetores gravados
 *   node tests/watch-engine/generate.js --write    → (re)grava tests/watch-engine/vectors/
 *
 * A comparação também roda no npm test (tests/watch-engine-vectors.test.js):
 * mudança de comportamento no motor JS fica VERMELHA até alguém regravar os
 * vetores DE PROPÓSITO — e regravar significa re-validar os motores nativos
 * (Swift/Kotlin) contra os vetores novos. É o gate anti-drift dos três motores.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VEC_DIR = path.join(__dirname, 'vectors');
const scenarios = require('./scenarios.js');

// Node não resolve @playwright/test a partir de /tmp — mas aqui estamos no repo.
const { chromium } = require(path.join(ROOT, 'node_modules', '@playwright', 'test'));

async function runScenario(page, sc) {
  await page.goto('file://' + path.join(__dirname, 'harness.html'));
  return await page.evaluate((s) => {
    // resolve a config REAL do esporte pelo resolvedor canônico (sport-rules.js)
    const cfg = window._resolveLiveScoring({}, s.sport);
    window._openLiveScoring(null, null, {
      casual: true,
      p1Name: s.players.p1Name,
      p2Name: s.players.p2Name,
      isDoubles: !!s.players.isDoubles,
      scoring: cfg,
      sportName: s.sport
    });
    // ⚠️ CAMPOS DE TRANSPORTE SAEM DO VETOR, e isso é decisão, não descuido:
    //  · `matchEpoch` é IDENTIDADE DE SESSÃO (novo a cada abertura/recomeço) —
    //    dentro do vetor ele destruiria o determinismo, que é o que dá valor a
    //    esta bateria; quem o exercita é o teste do receptor de diário.
    //  · `scoring` é a config, já gravada UMA vez no topo do vetor (`config`) —
    //    repeti-la em cada passo seria redundância que os motores nativos
    //    (que não a re-emitem) teriam de imitar sem ganho nenhum.
    //  · `shuffleOn`/`mixedOn`/`canMix` são os INTERRUPTORES da tela de fim
    //    (🎲/👑/⚥, 1.8.77). São preferência da sessão, não placar: o motor não
    //    os lê nem os produz, e os nativos os copiam do espelho. Deixá-los no
    //    vetor obrigaria os 3 motores a reproduzir um estado de UI — e a
    //    bateria ficaria vermelha a cada opção nova de tela, que é ruído, não
    //    drift. Quem os cobre é tests/relogio-tres-chaves.test.js.
    // O que fica é só o ESTADO DE PLACAR, que é o que os 3 motores têm que
    // reproduzir igual.
    const snap = () => {
      const s = JSON.parse(JSON.stringify(window._getLiveScoreState()));
      delete s.matchEpoch;
      delete s.scoring;
      delete s.shuffleOn;
      delete s.mixedOn;
      delete s.canMix;
      return s;
    };
    const steps = [{ event: { kind: 'open' }, state: snap() }];
    for (const ev of s.events) {
      switch (ev.kind) {
        case 'serveSelect': window._liveServeSelect(ev.team, ev.idx); break;
        case 'serveConfirm': window._liveServeConfirm(); break;
        case 'point': window._liveScorePoint(ev.team); break;
        case 'undo': window._liveScoreUndoLastPoint(); break;
        case 'resolveTie': window._liveResolveTie(ev.rule); break;
        default: throw new Error('evento desconhecido: ' + ev.kind);
      }
      steps.push({ event: ev, state: snap() });
    }
    return { config: cfg, steps: steps };
  }, sc);
}

async function generateAll() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  const out = [];
  for (const sc of scenarios) {
    const r = await runScenario(page, sc);
    out.push({
      name: sc.name,
      sport: sc.sport,
      note: sc.note,
      players: sc.players,
      config: r.config,
      steps: r.steps
    });
  }
  await browser.close();
  if (pageErrors.length) {
    throw new Error('erro de página durante a geração (o motor real explodiu): ' + pageErrors.join(' | '));
  }
  return out;
}

// Comparação estável (ordena chaves — Firestore-lesson: ordem de chave não é dado)
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

async function main() {
  const write = process.argv.indexOf('--write') !== -1;
  const vectors = await generateAll();
  if (write) {
    fs.mkdirSync(VEC_DIR, { recursive: true });
    for (const v of vectors) {
      fs.writeFileSync(path.join(VEC_DIR, v.name + '.json'), JSON.stringify(v, null, 1) + '\n');
    }
    console.log('✓ gravados', vectors.length, 'vetores em tests/watch-engine/vectors/');
    return 0;
  }
  let bad = 0;
  for (const v of vectors) {
    const f = path.join(VEC_DIR, v.name + '.json');
    if (!fs.existsSync(f)) { console.error('✗ vetor AUSENTE:', v.name, '(rode com --write)'); bad++; continue; }
    const disk = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (stable(disk) !== stable(v)) {
      // aponta o primeiro passo divergente pra depuração dirigida
      let at = -1;
      for (let i = 0; i < Math.max(disk.steps.length, v.steps.length); i++) {
        if (!disk.steps[i] || !v.steps[i] || stable(disk.steps[i]) !== stable(v.steps[i])) { at = i; break; }
      }
      console.error('✗ vetor DIVERGE do motor atual:', v.name, '· primeiro passo divergente:', at,
        '\n  gravado:', at >= 0 && disk.steps[at] ? JSON.stringify(disk.steps[at].state) : '(fim)',
        '\n  motor  :', at >= 0 && v.steps[at] ? JSON.stringify(v.steps[at].state) : '(fim)');
      bad++;
    }
  }
  if (!bad) console.log('✓', vectors.length, 'vetores batem com o motor GSM atual');
  return bad ? 1 : 0;
}

if (require.main === module) {
  main().then(c => process.exit(c)).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { generateAll: generateAll, stable: stable };
