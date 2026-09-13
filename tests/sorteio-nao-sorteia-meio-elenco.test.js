'use strict';
/* ⛔⛔ O SORTEIO NÃO ACONTECE COM MEIO ELENCO.
 *
 * Esta é a consequência mais cara da família "parte que não chegou vira lista vazia" — e a
 * única em que o estrago não é perder um dado, é montar a CHAVE ERRADA de um evento.
 *
 * O elenco mora FORA do documento em **41 dos 61 torneios** (medido em 13/set/2026) e volta
 * por uma subcoleção. Entre o documento chegar e a subcoleção chegar, `t.participants` é uma
 * lista PARCIAL. E `js/views/tournaments-draw.js` tem **cinco** `if
 * (!Array.isArray(t.participants)) t.participants = []` — ele não distingue "elenco vazio"
 * de "elenco ainda não chegou". Sem porta, o sorteio montava a chave com quem estivesse na
 * mão: gente de fora, e um evento inteiro para refazer.
 *
 * ⭐ A MÁQUINA QUE RESPONDE ISSO JÁ EXISTIA — `_elencoCarregado`, escrita para o "estou
 * inscrito?" — e o sorteio nunca perguntou. Varredura antes de escrever a porta: ZERO
 * ocorrências de `_elencoCarregado`, `_parteFalta` ou `_faltamPesados` em
 * `tournaments-draw.js` e `tournaments-draw-prep.js`. Rede que cobre a LEITURA e não cobre a
 * AÇÃO. [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]
 *
 * ⚠️ E RECUSAR NÃO BASTA: a porta manda BUSCAR o que falta e SOLTA o botão. Recusa sem
 * caminho de volta vira "o botão não funciona"; recusa que deixa o spinner girando vira
 * "travou".
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

console.log('\n──── o sorteio não sorteia meio elenco ────\n');

/* ── ① A PORTA RODANDO DE VERDADE, com elenco parcial e com elenco completo ── */
const STORE = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const DRAW = fs.readFileSync(path.join(raiz, 'js/views/tournaments-draw.js'), 'utf8');

const W = {};
W.window = W;
// as duas peças reais que a porta usa
[['window._marcaPartesQueFaltam = function', '\n};'],
 ['window._parteFalta = function', '\n};'],
 ['window._elencoCarregado = function', '\n};']].forEach(([ini, fim]) => {
  const i = STORE.indexOf(ini);
  assert.ok(i > 0, 'achei ' + ini);
  vm.runInNewContext(STORE.slice(i, STORE.indexOf(fim, i) + fim.length),
    { window: W, Array, Object, String, JSON });
});

// a porta, recortada do arquivo real (do início da função até o fim do bloco de recusa)
const iP = DRAW.indexOf('window.generateDrawFunction = function (tId) {');
must(iP > 0, '① a função do sorteio existe');
const fimP = DRAW.indexOf('\n    }', DRAW.indexOf("_dtrace('generateDraw:ELENCO-INCOMPLETO'", iP)) + 6;
const porta = DRAW.slice(iP, fimP) + '\n};';

const cenario = (t) => {
  const eventos = { montou: null, avisou: null, soltou: false, seguiu: false };
  const ctx = {
    window: {
      _findTournamentById: () => t,
      _elencoCarregado: W._elencoCarregado,
      _parteFalta: W._parteFalta,
      _marcaPartesQueFaltam: W._marcaPartesQueFaltam,
      AppStore: { _montaPesadosQueFaltam: (ids) => { eventos.montou = ids; } },
      showNotification: (a, b, c) => { eventos.avisou = { a, b, c }; },
      _drawBtnDone: () => { eventos.soltou = true; },
      _dtrace: null,
    },
    Array, Object, String, JSON,
  };
  ctx.window.window = ctx.window;
  vm.runInNewContext(porta, ctx);
  ctx.window.generateDrawFunction('tour_x');
  // se a porta NÃO recusou, a execução cairia no resto da função (que não está no recorte):
  // então "não avisou" == "seguiu para o sorteio".
  eventos.seguiu = !eventos.avisou;
  return eventos;
};

// ⚠️ o torneio PARCIAL é o estado real: o marcador diz que há 152, o objeto tem 3.
const parcial = { id: 'tour_x', _semPesados: ['participants'], _nPartes: { participants: 152 },
  participants: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], memberUids: ['a', 'b', 'c'] };
const completo = { id: 'tour_x', _semPesados: ['participants'], _nPartes: { participants: 3 },
  participants: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], memberUids: ['a', 'b', 'c'] };
const naoDividido = { id: 'tour_x', participants: [{ uid: 'a' }, { uid: 'b' }] };

const rP = cenario(parcial);
must(!rP.seguiu, '① ⭐⭐ com 3 de 152 inscritos, o sorteio NÃO acontece');
must(rP.avisou && /carregando/i.test(rP.avisou.a + ' ' + rP.avisou.b),
  '① ⭐ e o organizador é avisado de que o elenco ainda está chegando');
must(Array.isArray(rP.montou) && rP.montou[0] === 'tour_x',
  '① ⭐ a porta MANDA BUSCAR o que falta — recusa sem caminho de volta vira "o botão não funciona"');
must(rP.soltou === true,
  '① ⭐ e SOLTA o botão — recusa com spinner girando vira "travou"');

const rC = cenario(completo);
must(rC.seguiu, '① ⛔ CONTROLE: com o elenco COMPLETO, o sorteio segue normalmente');
must(!rC.avisou && !rC.montou, '① e não avisa nem busca nada à toa');

const rN = cenario(naoDividido);
must(rN.seguiu, '① ⛔ CONTROLE: torneio NÃO dividido passa reto — a porta não custa nada a quem não usa partes');

/* ── ② a porta vem ANTES de qualquer leitura do elenco ────────────────────── */
/* ⚠️ SOBRE O CÓDIGO, NÃO SOBRE O COMENTÁRIO. Escrevi esta asserção lendo o arquivo cru e ela
 * reprovou: o comentário que EU pus para explicar a porta cita `t.participants`, e a citação
 * ficava ANTES da linha de guarda. É a terceira vez em um dia que um comentário meu envenena
 * uma varredura minha — o texto que descreve a trava não pode acionar a trava. */
const codigo = DRAW.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const iPc = codigo.indexOf('window.generateDrawFunction = function (tId) {');
const iGuarda = codigo.indexOf('_elencoCarregado', iPc);
const iPrimeiroUso = codigo.indexOf('t.participants', iPc);
must(iGuarda > 0 && iGuarda < iPrimeiroUso,
  '② ⭐ a porta roda ANTES do primeiro `t.participants` — depois já seria tarde');

/* ── ③ o defeito que ela cobre segue lá, e é por isso que ela existe ──────── */
const inventa = (codigo.match(/if \(!Array\.isArray\(t\.participants\)\) t\.participants = \[\];/g) || []).length;
must(inventa >= 5,
  '③ ⛔ o arquivo ainda tem ' + inventa + ' pontos que INVENTAM elenco vazio — é o que a porta protege');

/* ── ④ CONTROLE: sem a porta, o sorteio seguiria com 3 de 152 ─────────────── */
const semPorta = porta.replace(/if \(typeof window\._elencoCarregado === 'function'[\s\S]*?\n    \}/, '');
must(semPorta.length < porta.length, '④ o controle de fato removeu a porta');
const ctx2 = { window: { _findTournamentById: () => parcial, showNotification: () => { ctx2.window.__avisou = true; },
  AppStore: {}, _drawBtnDone: () => {} }, Array, Object, String, JSON };
ctx2.window.window = ctx2.window;
vm.runInNewContext(semPorta, ctx2);
ctx2.window.generateDrawFunction('tour_x');
must(!ctx2.window.__avisou,
  '④ ⭐ sem a porta, a MESMA entrada de 3 de 152 seguiria para o sorteio sem uma palavra');

console.log('\n✅ ' + ok + ' verificações');
