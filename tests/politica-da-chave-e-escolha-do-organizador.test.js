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

/* ── ④ DEPOIS DO SORTEIO, NÃO MUDA — E A TRAVA É DO SERVIDOR ─────────────────
 * ⭐ Eu tinha escrito esta trava no CLIENTE, lendo o objeto do formulário em vez do torneio gravado:
 * ela nunca via que já existia chave, e ainda seria contornável. Trava de cliente não é trava.
 * ⇒ `politicaDaChave` entra nas duas listas do servidor: a de campos que a ficha pode mandar, e a de
 * campos ESTRUTURAIS — que o servidor recusa alterar depois do sorteio, como já faz com formato,
 * esporte e tamanho de time. */
const ct = semCom(fs.readFileSync(path.join(ROOT, 'js/views/create-tournament.js'), 'utf8'));
const auto = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
const lista = (nome) => {
  const i = auto.indexOf('const ' + nome + ' = new Set([');
  return i < 0 ? '' : auto.slice(i, auto.indexOf(']);', i));
};
ok(/'politicaDaChave'/.test(lista('_CAMPOS_CONFIG_TORNEIO')),
  '④ ⛔⛔ o servidor ACEITA o campo — sem isto, criar ou editar com a escolha nova é recusado');
ok(/'politicaDaChave'/.test(lista('_CONFIG_ESTRUTURAL')),
  '④ ⛔⛔ e o trata como ESTRUTURAL: recusado depois do sorteio, no servidor');
ok(!/_jaSorteou/.test(ct),
  '④ ⛔ e a trava quebrada do cliente não existe mais');

/* ── ⑤ O W.O. TAMBÉM CONGELA A CLASSIFICAÇÃO FINAL ───────────────────────────
 * ⭐ Achado na mesma revisão: a gravação do retrato só existia no lançamento NORMAL de placar. Linha
 * decidida por W.O. encerrava sem retrato, e a classificação final — que é resultado — seguia sendo
 * recalculada para sempre. */
const wo = fs.readFileSync(path.join(ROOT, 'js/views/wo-core.js'), 'utf8');
ok(/_congelaLinhasEncerradas\(t\)/.test(wo),
  '⑤ ⛔⛔ o caminho do W.O. congela a classificação final da linha');
const ui2 = fs.readFileSync(path.join(ROOT, 'js/views/bracket-ui.js'), 'utf8');
ok(/_congelaLinhasEncerradas\(t\)/.test(ui2),
  '⑤ e o lançamento normal de placar continua congelando');

/* ── ⑥ O TEXTO DA TELA NÃO PODE PROMETER O QUE O MOTOR NÃO FAZ ───────────────
 * ⭐ Achado na revisão: eu escrevi "com 36 duplas são 36 jogos e 3 folgas no meio" e o motor faz DUAS
 * folgas e uma sobra que JOGA — porque folga é proibida perto da final. Número na tela é promessa; se
 * ninguém confere contra o motor, ela vira mentira na primeira mudança de desenho.
 * ⚠️ Este bloco não confere a prosa: confere os NÚMEROS que ela cita, contra o motor de verdade. */
H.load('bracket-model.js');
H.load('chaves.js');
const C = H.window._chaves;
const vc = (pol) => C.plano(36, 'simples', pol).rodadas.filter(function (r) { return r.fase === 'VC'; });
const jogos = (pol) => vc(pol).reduce(function (a, r) { return a + r.jogosReais; }, 0);
const pl = (pol) => C.plano(36, 'simples', pol);

const uiCru = fs.readFileSync(path.join(ROOT, 'js/views/format2-ui.js'), 'utf8');
const trecho = (chave) => {
  const i = uiCru.indexOf("['" + chave + "', '");
  return i < 0 ? '' : uiCru.slice(i, uiCru.indexOf("]", i));
};
/* repescagem: 50 jogos (49 + o de 3º) e 14 voltam */
ok(jogos('repescagem') + 1 === 50 && (pl('repescagem').repR2 + pl('repescagem').repescagens) === 14,
  '⑥ o motor confirma: repescagem com 36 duplas = 50 jogos e 14 voltam');
ok(/50 jogos/.test(trecho('repescagem')) && /14 das 18/.test(trecho('repescagem')),
  '⑥ e a tela diz exatamente isso');
/* folga: 36 jogos (35 + o de 3º) e 28 esperam */
ok(jogos('bye') + 1 === 36 && pl('bye').esperamNoPlayin === 28,
  '⑥ o motor confirma: folga com 36 duplas = 36 jogos e 28 esperam');
ok(/36 jogos/.test(trecho('bye')) && /28 delas/.test(trecho('bye')),
  '⑥ e a tela diz exatamente isso');
/* sobra única: 36 jogos, 2 folgas e 1 sobra que joga (não há jogo de 3º: penúltima com três) */
ok(jogos('sobra_unica') === 36 && pl('sobra_unica').byes === 2 && pl('sobra_unica').repescagens === 1,
  '⑥ ⛔ o motor faz 36 jogos, DUAS folgas e UMA sobra jogando (achei ' +
  jogos('sobra_unica') + '/' + pl('sobra_unica').byes + '/' + pl('sobra_unica').repescagens + ')');
ok(/36 jogos, duas folgas/.test(trecho('sobra_unica')),
  '⑥ ⛔⛔ e a tela diz DUAS folgas — dizia três, e três é o que o motor NÃO faz');
ok(!/3 folgas/.test(trecho('sobra_unica')),
  '⑥ e a promessa velha não voltou');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
