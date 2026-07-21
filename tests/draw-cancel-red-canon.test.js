// draw-cancel-red-canon.test.js — TRAVA: botões CANCELAR do fluxo de sorteio são VERMELHOS (#dc2626).
//
// Dono (jul/2026): "os botões cancelar em TODAS as telas desse fluxo devem ser VERMELHAS e não
// transparentes. isso deve ser assim em TODO o app, em TODOS os torneios." Regrediam pra transparente.
//
// Varre os painéis do fluxo (presença, sem-dupla, resto, pow2, grupos, reabrir, confrontos tardios)
// e exige que cada botão de cancelar/voltar tenha background:#dc2626 e NÃO seja transparente/escuro.
//
// node tests/draw-cancel-red-canon.test.js

const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}

const files = ['js/views/tournaments.js', 'js/views/tournaments-draw-prep.js'];
// handlers de CANCELAR/voltar do fluxo de sorteio
const CANCEL_RE = /<button[^>]*(?:window\._cancelDrawResolution|window\._cancelUnifiedPanel|window\._cancelGroupsConfig|window\._cancelRemainderPanel|window\._lateConfrontosCancel|id="pdc-cancel")[^>]*>/g;
const BAD_BG = /background:\s*(transparent|none|rgba\(0,\s*0,\s*0|rgba\(255,\s*255,\s*255,\s*0\.0?5)/i;

let total = 0, red = 0, bad = [];
files.forEach(function (f) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  let m;
  while ((m = CANCEL_RE.exec(src)) !== null) {
    total++;
    const btn = m[0];
    const isRed = btn.indexOf('#dc2626') !== -1;
    const isBad = BAD_BG.test(btn);
    if (isRed && !isBad) red++;
    else bad.push(f + ': ' + btn.slice(0, 120));
  }
});

ok('achou botões de cancelar do fluxo (>=5)', total >= 5, 'total=' + total);
ok('TODOS os cancelar do fluxo são vermelhos (#dc2626, sem bg transparente/escuro)', bad.length === 0, bad.join(' | '));

console.log('\n' + '='.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' draw-cancel-red-canon: ' + red + '/' + total + ' vermelhos, ' + pass + ' ok, ' + fail + ' falharam');
console.log('='.repeat(40));
if (fail > 0) process.exit(1);
