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

/* Torneio dividido mínimo, com espelho ligado — é o espelho que carimbava o instante. */
function torneio(nJogos) {
  const matches = [];
  for (let i = 1; i <= nJogos; i++) {
    matches.push({ id: 'm' + i, round: 1, bracket: 'gold', phaseIndex: 1, winner: (i === 1 ? 'A' : null), p1: 'A', p2: 'B' });
  }
  return { id: 't1', _semPesados: ['matches'], matches: matches, participants: [], rounds: [], groups: [] };
}
const split = require(path.join(__dirname, '..', 'functions', 'vendor', 'tournament-split-core.js'));
const boundary = (d) => ({ persist: JSON.parse(JSON.stringify(d)) });
const espelho = {
  buildMirrorDoc: (t, jogo, tid, agoraIso) => ({ id: jogo.id, at: agoraIso, playerUids: ['u1'] })
};

function planeja(agoraIso) {
  return WP.planWrites(null, torneio(3), {
    split: split, boundary: boundary, agoraIso: agoraIso, espelho: espelho, tournamentId: 't1'
  });
}

/* ① duas execuções do MESMO plano, byte a byte */
const p1 = planeja('2026-09-02T10:00:00.000Z');
const p2 = planeja('2026-09-02T10:00:00.000Z');
ok(JSON.stringify(p1.ops) === JSON.stringify(p2.ops),
   '① ⭐ mesmo instante ⇒ plano IDÊNTICO byte a byte');
ok(JSON.stringify(p1.totais) === JSON.stringify(p2.totais), '① e os mesmos totais');

const espelhoDe = (p) => p.ops.filter((o) => o.colecao === 'results');
ok(JSON.stringify(espelhoDe(p1)) === JSON.stringify(espelhoDe(p2)),
   '① ⭐ o documento de `results` é idêntico — inclusive o carimbo do espelho');
ok(espelhoDe(p1).length > 0, '① (e o espelho realmente foi planejado, senão a asserção acima é vazia)');
ok(espelhoDe(p1)[0].doc.at === '2026-09-02T10:00:00.000Z', '① o carimbo é o instante RECEBIDO, não um novo');

/* ② instante diferente ⇒ plano diferente. É o que provaria a divergência entre tentativas
 *    se o `new Date()` tivesse ficado dentro do callback. */
const p3 = planeja('2026-09-02T10:00:01.000Z');
ok(JSON.stringify(espelhoDe(p1)) !== JSON.stringify(espelhoDe(p3)),
   '② ⭐ instante diferente muda o espelho — é exatamente o que o retry produzia antes');

/* ③ extras (recibo/outbox) entram no plano e são estáveis */
const comExtras = (agora) => WP.planWrites(null, torneio(2), {
  split: split, boundary: boundary, agoraIso: agora, espelho: espelho, tournamentId: 't1',
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
try { WP.planWrites(null, torneio(1), { split: split, boundary: boundary, espelho: espelho }); }
catch (e) { lancou = /agoraIso/.test(String(e && e.message)); }
ok(lancou, '④ ⭐ planWrites sem agoraIso LANÇA — sem fallback dentro do caminho transacional');

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
const bom = { _semPesados: [], matches: [{ id: 'a' }, { id: 'b' }], rounds: [] };
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
