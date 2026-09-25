/* "O SORTEIO DA FASE ATUAL É REI/RAINHA?" — não é a mesma pergunta que "este torneio é um
 * Rei/Rainha?". node tests/sorteio-da-fase-nao-e-do-torneio.test.js
 *
 * ⛔ O DEFEITO, MEDIDO NO DADO REAL em 25/set/2026 (coleção inteira, 78 torneios):
 *   Confra BT Alta da Clínica 2026
 *     topo:    format 'Liga' · ligaRoundFormat 'rei_rainha' · drawMode 'rei_rainha'  ← fase 0
 *     está em: currentPhaseIndex 1 → 'Eliminatória', reiRainha false, drawMode 'sorteio'
 *   76 dos 78 concordam; o divergente é o maior torneio do dono, e ele diverge nos DOIS eixos.
 *   `_isMonarchFormat` lê SÓ o topo ⇒ responde "parceiro rotativo" para uma fase que sorteia
 *   DUPLAS. É o que decide tamanho de time no sorteio, bloqueio de dupla formada e colunas.
 *
 * ⛔ E A PORTA DE CIMA NÃO PODE VIRAR SENSÍVEL À FASE: os 15 leitores têm DUAS intenções.
 *   · rótulo/identidade → "o Confra é um Rei/Rainha" é VERDADE, inclusive na eliminatória;
 *   · comportamento     → "a fase atual tem parceiro rotativo" é FALSO.
 *   Mudar a porta antiga trocaria o rótulo do torneio no meio do caminho. Duas portas, então —
 *   o mesmo padrão que este arquivo já usa em `_isLigaFormat` × `_faseCorrenteEhLiga`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o sorteio da FASE não é o do TORNEIO ────\n');

// ── ① uma casa só, ao lado das outras duas ───────────────────────────────────
function varrer(dir, re) {
  let hits = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { hits = hits.concat(varrer(p, re)); return; }
    if (!/\.js$/.test(e.name) || /\.test\.js$/.test(e.name)) return;
    const txt = fs.readFileSync(p, 'utf8');
    const m = txt.match(re);
    if (m) m.forEach(function () { hits.push(path.relative(ROOT, p)); });
  });
  return hits;
}
const casas = varrer(path.join(ROOT, 'js'), /window\._sorteioDaFaseEhReiRainha\s*=(?!=)/g);
ok(casas.length === 1 && casas[0] === 'js/views/tournaments-utils.js',
  '① uma casa só, e é a mesma das outras duas portas — ' + casas.join(', '));
ok(typeof W._sorteioDaFaseEhReiRainha === 'function', '① e ela chega ao navegador');

// ── ② A FORMA REAL DO CONFRA — não é fixture inventada ───────────────────────
const CONFRA = {
  id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026',
  format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
  currentPhaseIndex: 1,
  phases: [
    { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
    { name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples', reiRainha: false, drawMode: 'sorteio', rounds: 1 },
  ],
};
ok(W._isMonarchFormat(CONFRA) === true,
  '② ⭐ a porta do TORNEIO diz SIM — e está certa: o Confra é um Rei/Rainha');
ok(W._sorteioDaFaseEhReiRainha(CONFRA) === false,
  '② ⭐⭐ a porta da FASE diz NÃO — a fase 1 sorteia DUPLAS. É a divergência virando asserção');
ok(W._sorteioDaFaseEhReiRainha(CONFRA, 0) === true,
  '② e na fase 0 do MESMO torneio ela diz SIM');

// ── ③ o índice ───────────────────────────────────────────────────────────────
ok(W._sorteioDaFaseEhReiRainha(CONFRA, 2) === false,
  '③ ⛔ índice FORA da faixa é ausência de fase — não cai na fase 0, que trocaria a resposta calado');
ok(W._sorteioDaFaseEhReiRainha(CONFRA, -1) === false, '③ índice negativo idem');
const tres = { currentPhaseIndex: 1, phases: [
  { reiRainha: false, drawMode: 'sorteio' }, { reiRainha: true, drawMode: 'rei_rainha' }, { reiRainha: false, drawMode: 'sorteio' }] };
ok(W._sorteioDaFaseEhReiRainha(tres) === true && W._sorteioDaFaseEhReiRainha(tres, 2) === false,
  '③ três fases: responde pela fase pedida, não pela primeira');

// ── ④ legado sem lista de fases: o topo é a única fase que existe ────────────
ok(W._sorteioDaFaseEhReiRainha({ drawMode: 'rei_rainha' }) === true,
  '④ sem lista de fases, cai no topo — ali ele descreve a única fase que há');
ok(W._sorteioDaFaseEhReiRainha({ ligaRoundFormat: 'rei_rainha' }) === true,
  '④ e reconhece o outro campo legado, que responde a MESMA pergunta');
ok(W._sorteioDaFaseEhReiRainha({ format: 'Eliminatórias Simples' }) === false, '④ torneio comum: NÃO');
ok(W._sorteioDaFaseEhReiRainha(null) === false, '④ sem torneio: NÃO, sem quebrar');
ok(W._sorteioDaFaseEhReiRainha({ phases: [] }) === false, '④ lista de fases VAZIA não vira fase 0');
/* ⛔ FALSIFICAÇÃO DO CASO VAZIO — a asserção acima passava por VACUIDADE.
 * Sem os campos do topo, qualquer implementação responde `false` e o teste fica verde mesmo com o
 * defeito. Com eles, a versão que eu havia escrito respondia SIM: lista vazia caía no topo.
 * Lista vazia significa "este torneio TEM fases e a pedida não existe" — não "não tem fases". */
ok(W._sorteioDaFaseEhReiRainha({ phases: [], drawMode: 'rei_rainha' }) === false,
  '④ ⛔ lista VAZIA com o topo dizendo rei/rainha responde NÃO — era aqui que o meu teste dava falso verde');
ok(W._sorteioDaFaseEhReiRainha({ phases: [], ligaRoundFormat: 'rei_rainha' }) === false,
  '④ e idem com o outro campo do topo');
ok(W._sorteioDaFaseEhReiRainha({ phases: 'nao-e-lista', drawMode: 'rei_rainha' }) === true,
  '④ ⚠️ mas o que NÃO é lista conta como ausência — aí o topo é tudo que existe');

// ── ⑤ e ela ainda NÃO tem leitor ─────────────────────────────────────────────
/* Se alguém ligar um consumidor sem passar por uma leva, esta asserção cai — e é de propósito:
 * migrar os 15 de uma vez é o que já obrigou reversão neste projeto. */
const chamadas = varrer(path.join(ROOT, 'js'), /_sorteioDaFaseEhReiRainha\s*\(/g)
  .filter(function (f) { return f !== 'js/views/tournaments-utils.js'; });
ok(chamadas.length === 0, '⑤ ainda sem chamador — achei ' + chamadas.length + ': ' + chamadas.join(', '));

// ── ⑥ a porta antiga continua intocada ───────────────────────────────────────
const utils = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
ok(/window\._isMonarchFormat = window\._isMonarchFormat \|\| function/.test(utils),
  '⑥ ⛔ a porta do TORNEIO não foi alterada — mexer nela trocaria o rótulo do Confra no meio do torneio');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
