'use strict';
/* A POLÍTICA DA CHAVE É ESCOLHA DO ORGANIZADOR — da tela até o sorteio, e congelada depois.
 * node tests/politica-da-chave-e-escolha-do-organizador.test.js
 *
 * ⛔⛔ POR QUE EXISTE: o motor aprendeu a desenhar os três desenhos (repescagem, folga e sobra única)
 * e ficou INERTE por várias revisões — não havia onde escolher, nada gravava o campo, e o sorteio
 * lia `null` e voltava para repescagem. Motor que sabe e produção que não usa é pior que não ter:
 * dá a impressão de funcionalidade entregue.
 *
 * ⛔ A CORRENTE INTEIRA, e faltando um elo nada funciona:
 *   ① a tela oferece os três e chama o setter;
 *   ② o normalizador fecha o valor (torto → repescagem) e força repescagem na dupla eliminatória,
 *      onde "repescagem" é o próprio formato e não tratamento de resto;
 *   ③ o compilador leva a escolha para o TOPO do torneio — é de lá que o sorteio da FASE 0 lê — e
 *      também para cada fase eliminatória;
 *   ④ depois do sorteio, não muda mais.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./headless.js');
H.load('format2.js');
const F = H.window.FORMAT2;
const semCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a política da chave é escolha do organizador ────\n');

/* ── ① A TELA OFERECE OS TRÊS ──────────────────────────────────────────────── */
const ui = semCom(fs.readFileSync(path.join(ROOT, 'js/views/format2-ui.js'), 'utf8'));
ok(/window\._f2PoliticaDaChave = function/.test(ui), '① a tela tem o setter da escolha');
['repescagem', 'bye', 'sobra_unica'].forEach(function (v) {
  ok(ui.indexOf("'" + v + "'") !== -1, '① e oferece "' + v + '"');
});
ok(/_f2PoliticaDaChave\('/.test(ui), '① os botões chamam o setter');
/* ⛔ e a escolha NÃO aparece na dupla eliminatória: ali ela não muda nada */
const iDupla = ui.indexOf('if (!e.dupla) {');
ok(iDupla > 0 && ui.indexOf('_f2PoliticaDaChave', iDupla) > iDupla,
  '① ⛔ a escolha só aparece na eliminatória SIMPLES');

/* ── ② O NORMALIZADOR FECHA O VALOR ────────────────────────────────────────── */
const norm = (o) => F.normalize({ eliminatoria: Object.assign({ ativa: true }, o) }).eliminatoria.politicaDaChave;
ok(norm({}) === 'repescagem', '② ausente = repescagem, que é o que todo torneio existente já é');
ok(norm({ politicaDaChave: 'bye' }) === 'bye', '② "bye" é aceito');
ok(norm({ politicaDaChave: 'sobra_unica' }) === 'sobra_unica', '② "sobra_unica" é aceito');
ok(norm({ politicaDaChave: 'lixo' }) === 'repescagem',
  '② ⛔ valor torto cai no default — configuração antiga não pode virar outra chave em silêncio');
ok(norm({ dupla: true, politicaDaChave: 'bye' }) === 'repescagem',
  '② ⛔ na DUPLA eliminatória é forçado: ali "repescagem" é o formato, não tratamento de resto');

/* ── ③ O COMPILADOR LEVA AO TOPO E ÀS FASES ────────────────────────────────── */
['repescagem', 'bye', 'sobra_unica'].forEach(function (v) {
  const r = F.compileToPhases(F.normalize({ eliminatoria: { ativa: true, politicaDaChave: v } }));
  ok(r && r.topLevel && r.topLevel.politicaDaChave === v,
    '③ ⛔⛔ "' + v + '" chega ao TOPO do torneio — é de lá que o sorteio da FASE 0 lê');
  const elim = (r.phases || []).filter(function (p) { return p && p.kind === 'elimination'; });
  ok(elim.length > 0 && elim.every(function (p) { return p.politicaDaChave === v; }),
    '③ e a cada fase eliminatória (' + elim.length + ')');
});
/* ⛔ O sorteio da fase 0 tem de LER do documento — foi o último elo que eu enxerguei. */
const draw = semCom(fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw.js'), 'utf8'));
ok(/politicaDaChave: t\.politicaDaChave/.test(draw),
  '③ ⛔⛔ o sorteio da FASE 0 lê a política do documento do torneio');

/* ── ④ DEPOIS DO SORTEIO, NÃO MUDA ─────────────────────────────────────────── */
const ct = semCom(fs.readFileSync(path.join(ROOT, 'js/views/create-tournament.js'), 'utf8'));
ok(/_jaSorteou/.test(ct), '④ o salvar sabe se o torneio já foi sorteado');
ok(/tourData\.politicaDaChave = _politicaGravada/.test(ct),
  '④ ⛔⛔ e com a chave sorteada, o que está GRAVADO manda — o compilador não sobrescreve');
ok(/p\.kind === 'elimination'\) p\.politicaDaChave = _politicaGravada/.test(ct),
  '④ ⛔ inclusive nas fases, senão o topo e a fase discordariam');
const iAssign = ct.indexOf('Object.assign(tourData, _f2out.topLevel)');
const iGuarda = ct.indexOf('_politicaGravada = tourData.politicaDaChave');
ok(iGuarda > 0 && iGuarda < iAssign,
  '④ e a política gravada é lida ANTES do Object.assign que a sobrescreveria');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
