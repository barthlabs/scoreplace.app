/* DOIS DEFEITOS DO NÚCLEO DO AVANÇO, PEGOS NA REVISÃO EXTERNA (leva 2.2)
 *
 * Nenhum dos dois foi achado por teste: foram achados LENDO o código que eu tinha acabado
 * de escrever. Este arquivo existe para que não voltem em silêncio.
 *
 * ── DEFEITO 1 · O INSTANTE NÃO ERA ESTÁVEL NO RETRY ─────────────────────────────────
 * `_gravaTorneio` calculava `agoraIso` com `new Date().toISOString()` DENTRO do callback de
 * `db.runTransaction`. O Firestore RE-EXECUTA esse callback quando a transação aborta — e a
 * segunda tentativa produzia um espelho de `results` e um plano DIFERENTES da primeira.
 * O retry deixava de ser idempotente, e o efeito só apareceria sob concorrência: o caso
 * mais caro de reproduzir depois.
 * CORREÇÃO: `_gravaTorneio` EXIGE `ctx.agoraIso`. Sem ele, lança. Cada chamador calcula o
 * instante uma vez, imediatamente antes de abrir a transação (9 pontos em index.js).
 *
 * ── DEFEITO 2 · ID DUPLICADO NUNCA ERA RECUSADO ─────────────────────────────────────
 * `verificaInvariantes` montava um Map por id e, ao achar repetição, fazia:
 *     if (porId.has(k) && porId.get(k) !== m) porId.set(k, m); else porId.set(k, m);
 * Os DOIS ramos fazem a mesma coisa. A duplicata nunca virava problema, e `porId.size`
 * mentia por construção — a contagem colapsava as chaves iguais e ainda batia com `_nJogos`.
 * CORREÇÃO com política explícita: o MESMO objeto alcançado por vários caminhos de coleta é
 * deduplicado por IDENTIDADE (é um jogo só, visto duas vezes — `_hydrateMonarchGroups` faz
 * `t.matches` e `rounds[].matches` compartilharem referência); dois objetos DISTINTOS com o
 * mesmo id são ERRO, com o id e os caminhos na mensagem.
 */
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', 'functions-autodraw', 'advance-core.js'));
const WP = require(path.join(__dirname, '..', 'functions-autodraw', 'write-plan.js'));
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── instante estável no retry · id duplicado recusado ────');

/* ═══ DEFEITO 1 ═══════════════════════════════════════════════════════════════════════ */

/* Torneio dividido mínimo: o plano normal só grava o jogo físico. */
function torneio(nJogos) {
  const matches = [];
  for (let i = 1; i <= nJogos; i++) {
    matches.push({ id: 'm' + i, round: 1, bracket: 'gold', phaseIndex: 1, winner: (i === 1 ? 'A' : null), p1: 'A', p2: 'B' });
  }
  return { id: 't1', _semPesados: ['matches'], matches: matches, participants: [], rounds: [], groups: [] };
}
const split = require(path.join(__dirname, '..', 'functions', 'vendor', 'tournament-split-core.js'));
const boundary = (d) => ({ persist: JSON.parse(JSON.stringify(d)) });
function planeja(agoraIso) {
  return WP.planWrites(null, torneio(3), {
    split: split, boundary: boundary, agoraIso: agoraIso, tournamentId: 't1'
  });
}

/* ① duas execuções do MESMO plano, byte a byte */
const p1 = planeja('2026-09-02T10:00:00.000Z');
const p2 = planeja('2026-09-02T10:00:00.000Z');
ok(JSON.stringify(p1.ops) === JSON.stringify(p2.ops),
   '① ⭐ mesmo instante ⇒ plano IDÊNTICO byte a byte');
ok(JSON.stringify(p1.totais) === JSON.stringify(p2.totais), '① e os mesmos totais');

const jogosDe = (p) => p.ops.filter((o) => o.colecao === 'matches');
ok(JSON.stringify(jogosDe(p1)) === JSON.stringify(jogosDe(p2)) && jogosDe(p1).length === 3,
   '① ⭐ os três jogos físicos são idênticos no retry');
ok(!p1.ops.some((o) => o.colecao === 'results' || o.colecao === 'resultsSandbox'),
   '① nenhuma edição normal cria segunda fonte de placar');
const scored = torneio(1);
Object.assign(scored.matches[0], { scoreP1: 6, scoreP2: 4, winner: 'A',
  wo: true, woAbsentSide: 'p2' });
const scorePlan = WP.planWrites(null, scored, {
  split, boundary, tournamentId: 't1', agoraIso: '2026-09-02T10:00:00.000Z'
});
const physicalScore = scorePlan.ops.find(o => o.colecao === 'matches' && o.chave === 'm1');
ok(!!physicalScore && physicalScore.doc.jogo.scoreP1 === 6 &&
   physicalScore.doc.jogo.winner === 'A' && physicalScore.doc.jogo.wo === true &&
   physicalScore.doc.jogo.pendingResult === undefined &&
   !scorePlan.ops.some(o => o.colecao === 'results'),
   '① jogo físico decidido guarda placar e W.O. sem espelho');
const pending = torneio(1);
delete pending.matches[0].winner;
pending.matches[0].pendingResult = { scoreP1: 6, scoreP2: 4 };
const pendingPlan = WP.planWrites(null, pending, {
  split, boundary, tournamentId: 't1', agoraIso: '2026-09-02T10:00:00.000Z'
});
ok(pendingPlan.ops.some(o => o.colecao === 'matches' && o.chave === 'm1' &&
  o.doc.jogo.pendingResult.scoreP1 === 6 && !o.doc.jogo.winner),
  '① proposta pendente vive no jogo físico sem vencedor confirmado');
const written = [];
const baseRef = { path: 'tournaments/t1', collection(col) { return {
  doc(id) { return { path: 'tournaments/t1/' + col + '/' + id }; }
}; } };
const tx = { set(ref, doc) { written.push([ref.path, doc]); }, delete(ref) { written.push([ref.path, null]); } };
WP.applyPlan(tx, baseRef, scorePlan, { FieldValue: { increment: () => 1, delete: () => null } });
ok(written.some(([p]) => p === 'tournaments/t1/matches/m1') &&
   !written.some(([p]) => p.includes('/results/')),
   '① applyPlan envia somente o jogo físico');
const sandboxPlan = WP.planWrites(null, Object.assign(torneio(2), { isSandbox: true }), {
  split: split, boundary: boundary, agoraIso: '2026-09-02T10:00:00.000Z',
  tournamentId: 'sb_t1', resultCollection: 'resultsSandbox'
});
ok(sandboxPlan.ops.some(op => op.colecao === 'matches' && op.chave === 'm1') &&
   !sandboxPlan.ops.some(op => op.colecao === 'resultsSandbox' || op.colecao === 'results'),
   '① sandbox também grava só o jogo físico');
const oculto = torneio(3);
oculto.organizerOnly = true;
const planoOculto = WP.planWrites(null, oculto, {
  split: split, boundary: boundary, agoraIso: '2026-09-02T10:00:00.000Z', tournamentId: 't1'
});
ok(!planoOculto.ops.some(o => o.colecao === 'results') && planoOculto.ops.some(o => o.colecao === 'matches'),
   '① torneio oculto guarda jogos canônicos sem resultado global');

/* ② sem carimbo de espelho, o plano físico não varia com o instante externo. */
const p3 = planeja('2026-09-02T10:00:01.000Z');
ok(JSON.stringify(p1.ops) === JSON.stringify(p3.ops),
   '② ⭐ jogo físico não depende de carimbo do espelho aposentado');

/* ③ extras (recibo/outbox) entram no plano e são estáveis */
const comExtras = (agora) => WP.planWrites(null, torneio(2), {
  split: split, boundary: boundary, agoraIso: agora, tournamentId: 't1',
  extras: [
    { colecao: 'advanceReceipts', chave: 'op1', doc: { criadoEm: agora } },
    { colecao: 'outbox', chave: 'adv-t1-1-op1', doc: { criadoEm: agora } }
  ]
});
const e1 = comExtras('2026-09-02T10:00:00.000Z');
const e2 = comExtras('2026-09-02T10:00:00.000Z');
ok(JSON.stringify(e1.ops) === JSON.stringify(e2.ops), '③ ⭐ os extras também são idênticos entre execuções');
ok(e1.ops.some((o) => o.colecao === 'advanceReceipts') && e1.ops.some((o) => o.colecao === 'outbox'),
   '③ recibo e outbox estão NO PLANO (contam no teto e aparecem no teste)');

/* ④ sem instante, falha fechada — nunca um fallback silencioso */
let lancou = false;
try { WP.planWrites(null, torneio(1), { split: split, boundary: boundary }); }
catch (e) { lancou = /agoraIso/.test(String(e && e.message)); }
ok(lancou, '④ ⭐ planWrites sem agoraIso LANÇA — sem fallback dentro do caminho transacional');

/* ④b marcador legado ausente NÃO transforma o torneio em inteiro. A leitura pode vir de
 * cache/versão antiga sem esse campo; a escrita continua usando as partes canônicas e o
 * repõe para o nativo que ainda depende dele. */
const semMarcador = torneio(1);
delete semMarcador._semPesados;
const planoSemMarcador = WP.planWrites(null, semMarcador, {
  split: split, boundary: boundary, agoraIso: '2026-09-02T10:00:00.000Z', tournamentId: 't1'
});
const configSemMarcador = planoSemMarcador.ops.find((op) => op.colecao === null);
ok(planoSemMarcador.ops.some((op) => op.colecao === 'matches' && op.chave === 'm1'),
   '④b ⭐ sem marcador, o jogo continua planejado na subcoleção canônica');
ok(configSemMarcador && Array.isArray(configSemMarcador.doc._semPesados) &&
   configSemMarcador.doc._semPesados.indexOf('matches') !== -1,
   '④b e a gravação repõe o marcador de compatibilidade sem devolver o jogo ao documento');

/* ⑤ e a porta do servidor exige o mesmo, sem fallback interno */
const src = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
const corpo = src.slice(src.indexOf('function _gravaTorneio('), src.indexOf('function _applyWriteBoundary('));
const semComentario = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/new Date\(|Date\.now\(/.test(semComentario),
   '⑤ ⭐ nenhum `new Date()`/`Date.now()` dentro de _gravaTorneio');
ok(/ctx && ctx\.agoraIso/.test(semComentario) && /throw new Error/.test(semComentario),
   '⑤ a porta exige ctx.agoraIso e falha fechada');
const decls = (src.match(/const _agoraIsoTx = new Date\(\)\.toISOString\(\);/g) || []).length;
const usos = (src.match(/agoraIso: _agoraIsoTx/g) || []).length;
ok(decls >= 9, '⑤ cada transação que grava declara o instante ANTES do callback (achei ' + decls + ')');
ok(usos >= 10, '⑤ e cada chamada de _gravaTorneio o repassa (achei ' + usos + ')');
/* a declaração tem de vir ANTES do runTransaction, nunca dentro do callback */
const linhas = src.split('\n');
let forasDeLugar = 0;
linhas.forEach((l, i) => {
  if (l.indexOf('const _agoraIsoTx') === -1) return;
  const seguinte = linhas.slice(i + 1, i + 4).join(' ');
  if (seguinte.indexOf('runTransaction') === -1) forasDeLugar++;
});
ok(forasDeLugar === 0, '⑤ ⭐ toda declaração do instante fica imediatamente antes de runTransaction');

/* ═══ DEFEITO 2 ═══════════════════════════════════════════════════════════════════════ */

const inv = (t) => A.verificaInvariantes(t, {});
const temProblema = (probs, re) => probs.some((p) => re.test(p));

/* ⑥ dois objetos DISTINTOS com o mesmo id ⇒ falha, dizendo id e caminhos */
const dois = {
  _semPesados: [],
  matches: [{ id: 'x', p1: 'A' }],
  rounds: [{ matches: [{ id: 'x', p1: 'B' }] }]     // objeto DIFERENTE, mesmo id
};
const pd = inv(dois);
ok(temProblema(pd, /id de jogo duplicado/), '⑥ ⭐ dois objetos distintos com o mesmo id são RECUSADOS');
ok(temProblema(pd, /"x"/) && temProblema(pd, /t\.matches\[0\]/) && temProblema(pd, /t\.rounds\[0\]\.matches\[0\]/),
   '⑥ ⭐ e o erro diz o id E os dois caminhos conflitantes');

/* ⑦ o MESMO objeto alcançado por dois caminhos ⇒ política definida: é um jogo só */
const compartilhado = { id: 'y', p1: 'A' };
const mesmo = { _semPesados: [], matches: [compartilhado], rounds: [{ matches: [compartilhado] }] };
ok(!temProblema(inv(mesmo), /duplicado/),
   '⑦ ⭐ mesma REFERÊNCIA por dois caminhos não é duplicata — é `_hydrateMonarchGroups` compartilhando');

/* ⑧ id ausente ⇒ falha, com o caminho */
const semId = { _semPesados: [], matches: [{ p1: 'A' }] };
ok(temProblema(inv(semId), /jogo sem id em t\.matches\[0\]/), '⑧ id ausente falha, dizendo onde');
const idVazio = { _semPesados: [], matches: [{ id: '', p1: 'A' }] };
ok(temProblema(inv(idVazio), /jogo sem id/), '⑧ id string vazia também falha');

/* ⑨ ids únicos ⇒ passa */
const bom = { _semPesados: [], matches: [], participants: [], opponentHistory: [], rounds: [] };
ok(inv(bom).length === 0, '⑨ ids únicos não geram problema (achei: ' + inv(bom).join(' | ') + ')');

/* ⑩ `_nJogos` é conferido contra IDENTIDADES DISTINTAS, nunca contra o tamanho do Map */
const compartilhado2 = { id: 'z' };
const contagem = {
  _semPesados: ['matches'], _nJogos: 1,
  matches: [compartilhado2], rounds: [{ matches: [compartilhado2] }]
};
ok(!temProblema(inv(contagem), /_nJogos/),
   '⑩ ⭐ o mesmo jogo visto 2× conta como 1 — a conta é por identidade');
const contagemRuim = { _semPesados: ['matches'], _nJogos: 5, matches: [{ id: 'a' }, { id: 'b' }] };
ok(temProblema(inv(contagemRuim), /_nJogos=5 diverge/), '⑩ e contador mentiroso é recusado');

/* ⑪ parte pesada no lugar errado */
ok(temProblema(inv({ _semPesados: ['matches'], _nJogos: 2, matches: [{ id: 'a' }, { id: 'b' }] }),
               /parte pesada no lugar errado/),
   '⑪ jogos no doc raiz de torneio dividido são recusados');
ok(temProblema(inv({ _nJogos: 2, matches: [{ id: 'a' }, { id: 'b' }] }),
               /parte pesada no lugar errado/),
   '⑪b ⛔ sem marcador legado continua recusando jogos no documento');

/* ⑫ referência quebrada na fiação */
ok(temProblema(inv({ _semPesados: [], matches: [{ id: 'a', nextMatchId: 'zzz' }] }), /aponta nextMatchId/),
   '⑫ referência para jogo inexistente é recusada');

/* ⑬ e o hash continua recusando a mesma ambiguidade, por outro caminho */
let cod = null;
try { A.revisionOf({ t: { matches: [{ id: 'x', w: 1 }, { id: 'x', w: 2 }] } }); }
catch (e) { cod = e.codigo; }
ok(cod === 'revisao-ambigua', '⑬ ⭐ revisionOf também falha fechada com revisao-ambigua');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
