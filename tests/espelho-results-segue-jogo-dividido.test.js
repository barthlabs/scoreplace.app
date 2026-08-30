/* O gatilho do espelho precisa partir da subcoleção canônica, não do doc magro. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/exports\.syncSplitMatchResult\s*=\s*onDocumentWritten/.test(src), 'há gatilho próprio para matches divididos');
ok(/document:\s*"tournaments\/\{tid\}\/matches\/\{matchId\}"/.test(src), 'gatilho observa cada documento de jogo');
ok(/_tSplitFn\.montarDoBanco\(/.test(src), 'gatilho remonta a fonte pelo núcleo canônico');
ok(/_splitResultMirror\.planoDoEspelho\(/.test(src), 'decisão de set/skip/delete vem do núcleo puro');
ok(/const fora = Array\.isArray\(config\._semPesados\)[\s\S]*fora\.indexOf\('matches'\) === -1/.test(src),
  'torneio não dividido não entra neste caminho');
ok(/async function _montarTorneioCanonico[\s\S]*_tSplitFn\.montarDoBanco/.test(src),
  'gatilho e reparo compartilham uma única montagem canônica');
ok(/t = await _montarTorneioCanonico\(tdoc\.ref, bruto\)/.test(src),
  'backfill também alcança jogos que vivem na subcoleção');
ok(/buildMirrorDoc\(t, m, tdoc\.id, null, existingData\[id\]\)/.test(src),
  'backfill force preserva replay ao corrigir um results existente');

console.log((fail ? '✗' : '✓') + ' espelho-results-segue-jogo-dividido: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
