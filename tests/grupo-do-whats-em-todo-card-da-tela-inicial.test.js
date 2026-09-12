'use strict';
/* ⛔ O CHIP DO GRUPO SÓ PODE SE CALAR ONDE ALGUÉM MAIS O CARREGA.
 * Relato do dono (12/set/2026, tela inicial): _"alguns jogos sem o botão de grupo do whats"_.
 * Os "alguns" eram os de Rei/Rainha — a Fase 1 do Confra. Na CHAVE isso é de propósito: lá o
 * chip é único por grupo (no cabeçalho, `_waGrpGroupChip`), e um por jogo seriam três botões
 * idênticos lado a lado. Mas em "Novidades" e "Seus últimos resultados" o card aparece SOZINHO:
 * não há cabeçalho de grupo ali, então calar o chip não evita repetição — só tira o acesso.
 * Quem sabe se existe cabeçalho é a TELA, e é ela que diz.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const WA = fs.readFileSync(path.join(root, 'js/views/wa-group.js'), 'utf8');
const BRK = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ── ① o comportamento, rodando o recorte real ───────────────────────────────
const ini = WA.indexOf('  window._waGrpCardChip = function (t, m, opts) {');
const fim = WA.indexOf('\n  };', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do chip do card');
const ctx = {
  window: {
    _schUserIsPlayer: () => true,
    _isOrg: () => false
  },
  chamadasDoChip: 0
};
ctx.window._matchChip = function () { ctx.chamadasDoChip++; return '<botao/>'; };
// o recorte usa helpers do módulo: `_isOrg`, `_cu`, `_matchChip` — todos stubados aqui
vm.runInNewContext(
  'function _isOrg(){return false;} function _cu(){return {uid:"u1"};}\n' +
  'function _matchChip(){ return window._matchChip(); }\n' +
  WA.slice(ini, fim + 4), ctx);
const chip = ctx.window._waGrpCardChip;

const t = { id: 't1' };
const reiRainha = { id: 'm1', p1: 'A / B', p2: 'C / D', isMonarch: true };
const comum = { id: 'm2', p1: 'A / B', p2: 'C / D' };

must(chip(t, reiRainha) === '', '① na CHAVE (sem aviso da tela) o jogo de Rei/Rainha segue sem chip — quem carrega é o cabeçalho do grupo');
must(chip(t, reiRainha, { semCabecalhoDeGrupo: true }) !== '',
  '① ⭐ na tela SEM cabeçalho de grupo, o mesmo jogo GANHA o chip — era este o botão que sumia');
must(chip(t, comum) !== '', '① jogo comum continua com chip nos dois contextos');
must(chip(t, { id: 'm3', p1: 'A', p2: 'BYE' }, { semCabecalhoDeGrupo: true }) === '',
  '① ⛔ e BYE continua sem chip em qualquer tela — folga não é jogo');
must(chip(t, { id: 'm4', p1: 'TBD', p2: 'C / D' }, { semCabecalhoDeGrupo: true }) === '',
  '① ⛔ nem jogo com lado indefinido');

// ── ② a fiação: quem avisa é a tela inicial ─────────────────────────────────
must(/_cardFooterChips\(t, m, \{ semCabecalhoDeGrupo: _dashConsensus \}\)/.test(BRK),
  '② ⭐ o card avisa que está na tela inicial (é lá que `dashConsensus` vale)');
must(/function _cardFooterChips\(t, m, opts\)/.test(BRK) && /_waGrpCardChip\(t, m, opts\)/.test(BRK),
  '② e o rodapé repassa o aviso — sem ele o chip não teria como saber');

console.log('✅ ' + ok + ' asserções — o chip do grupo aparece onde ninguém mais o carrega');
