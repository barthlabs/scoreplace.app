/* A CLASSIFICAÇÃO DO TORNEIO É DERIVADA — NÃO SE GUARDA  (2.0.120)
 * node tests/classificacao-e-derivada-nao-vai-pro-banco.test.js
 *
 * ⛔ MEDIDO em produção (26/ago/2026): `t.standings` estava gravado em 2 dos 39 torneios,
 * 120 linhas ao todo, TODAS zeradas e NENHUMA com uid. No Confra eram 110 linhas — 12,5 KB,
 * 16% do documento — afirmando "0 jogo disputado" num torneio com 115 jogos disputados.
 * O cálculo sobre exatamente os mesmos dados dá 103 linhas, 95 com jogo e 103 com uid.
 *
 * ⭐ COMO O CADÁVER NASCE: `_computeStandings` lê os jogos de `t.rounds[].matches`. Num
 * torneio DIVIDIDO esses jogos moram numa subcoleção, e enquanto não chegam o array está
 * vazio — calcular ali devolve uma tabela inteira zerada COM CARA DE RESPOSTA LEGÍTIMA.
 * Sete sítios faziam `t.standings = _computeStandings(t)`; bastava um rodar cedo demais.
 *
 * Guardar um derivado é guardar uma segunda versão da verdade. Esta suíte guarda as duas
 * metades do conserto: a porta não mente, e o derivado não viaja pro banco.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'tests/render-harness')).sandbox;
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a classificação é derivada ────');

// ── ① a porta RECUSA responder quando os jogos não chegaram ────────────────────
const dividido = { id: 't1', _semPesados: ['matches'], _nJogos: 115, rounds: [{ matches: [] }] };
ok('⛔ torneio dividido SEM os jogos → a porta devolve null, não uma tabela zerada',
  W._standingsDoTorneio(dividido) === null,
  'devolver [] ou linhas zeradas é AFIRMAR que ninguém jogou — foi assim que o cadáver nasceu');
ok('  → e `_jogosFaltando` reconhece o buraco (0 de 115)', W._jogosFaltando(dividido) === true);

const marcado = { id: 't2', _semPesados: ['matches'], _faltamPesados: true, rounds: [{ matches: [] }] };
ok('  → e também quando o enxerto já marcou que não achou', W._standingsDoTorneio(marcado) === null);

// ⛔ A OUTRA METADE: torneio que de fato não tem jogo NÃO pode ser confundido com esse.
const semJogoMesmo = { id: 't3', rounds: [{ matches: [] }], participants: [] };
ok('⭐ torneio INTEIRO e sem jogo nenhum responde normalmente (vazio ≠ "não sei")',
  Array.isArray(W._standingsDoTorneio(semJogoMesmo)));

// ── ② a porta RESPONDE quando os jogos estão lá ────────────────────────────────
const j = (p1, p2, venc, u1, u2) => ({ id: p1 + p2, p1: p1, p2: p2, p1Uid: u1, p2Uid: u2,
  winner: venc, scoreP1: 6, scoreP2: 3, bracket: 'group' });
const cheio = { id: 't4', _semPesados: ['matches'], _nJogos: 2,
  rounds: [{ matches: [j('A', 'B', 'A', 'uA', 'uB'), j('A', 'C', 'A', 'uA', 'uC')] }] };
const st = W._standingsDoTorneio(cheio);
ok('⭐ com os 2 jogos presentes a porta responde', Array.isArray(st) && st.length > 0);
ok('  → e a resposta tem jogo disputado (não é a tabela zerada)',
  (st || []).some(x => x.played > 0));

// ── ③ a ESCRITA em memória nunca põe zero por cima ─────────────────────────────
const tinha = [{ name: 'A', uid: 'uA', played: 3, wins: 2 }];
const semJogos = { id: 't5', _semPesados: ['matches'], _nJogos: 115, rounds: [{ matches: [] }],
                   standings: tinha.slice() };
W._poeStandings(semJogos);
ok('⛔ `_poeStandings` sem os jogos NÃO sobrescreve o que já havia',
  semJogos.standings[0].played === 3,
  'era exatamente este o estrago: uma tabela boa trocada por 110 linhas de zero');
W._poeStandings(cheio);
ok('  → e com os jogos ele grava', Array.isArray(cheio.standings) && cheio.standings.length > 0);

// ── ④ ninguém escreve por fora da porta ────────────────────────────────────────
['js/views/bracket-logic.js', 'js/views/bracket-ui.js', 'js/views/tournaments-draw-prep.js'].forEach((f) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');   // ignora comentário
  ok('⛔ ' + f.split('/').pop() + ' não escreve `standings` por fora da porta',
    !/\.standings\s*=\s*(window\._)?_computeStandings\(/.test(src),
    'os 7 sítios espalhados eram o próprio defeito — um deles rodava cedo demais');
});

// ── ⑤ o derivado não viaja pro banco, nos DOIS lados ───────────────────────────
const db = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
const iSave = db.indexOf('async saveTournament(');
ok('⛔ o cliente apaga `standings` antes de gravar',
  /delete cleanData\.standings;/.test(db.slice(iSave, db.indexOf('\n  async ', iSave + 10))),
  'sem isto o derivado morto continua sendo reenviado a cada placar lançado');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
const iWb = cf.indexOf('function _applyWriteBoundary(');
ok('⛔ e o servidor também (lá o `tx.set` substitui, então isto APAGA de verdade)',
  /delete clean\.standings;/.test(cf.slice(iWb, cf.indexOf('\nfunction ', iWb + 10))));
const vend = fs.readFileSync(path.join(ROOT, 'functions-autodraw/vendor/bracket-logic.js'), 'utf8');
ok('  → e a porta existe no vendor do Cloud Function', /window\._standingsDoTorneio =/.test(vend));

console.log(falhas === 0 ? '\n✅ classificacao-e-derivada-nao-vai-pro-banco: OK'
                         : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
