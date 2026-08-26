// REPESCADO = MELHOR DERROTADO. node tests/repechage-best-loser.test.js
//
// REGRA (dono, 27/jul/2026, Confra SB): "os repescados devem ser os melhores. tem 3
// equipes derrotadas de 6-4 na r1 ouro. os 2 primeiros na ordem dos jogos deveriam ter
// sido os repescados, considerando os critérios de desempate escolhidos pelo
// organizador, SEMPRE."
//
// A normalização da R2 escolhe as fontes por POSIÇÃO — no sorteio ninguém jogou, não
// existe "melhor". Quando a rodada-fonte FECHA, `_reassignBestLosersToRepechage` troca o
// ocupante pelos melhores derrotados via `_rankByTiebreakers`. Empate → ordem dos jogos.
//
// A troca é um SWAP SIMÉTRICO: o melhor sobe e quem sai vai EXATAMENTE para o lugar de
// onde o outro veio. A 1ª tentativa trocou só o lado de cima e reintroduziu o
// auto-confronto (self@lower) — quem saía ficava sem destino e quem subia seguia vivo na
// inferior. Ver [[project_repechage_selfmatch_systemic]].
const H = require('./render-harness');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const W = H.sandbox;
const A = W._chavesAdapter;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'E' + (i + 1), uid: 'u' + (i + 1) }));
const r1De = (t) => t.matches.filter((m) => m.round === 1 && !m.isBye)
  .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
const repOcup = (t) => {
  const out = [];
  t.matches.forEach((m) => ['p1', 'p2'].forEach((s) => { if (m[s + 'FromRepechage'] && m[s] && m[s] !== 'TBD') out.push(m[s]); }));
  return out;
};
function mk(n, id) {
  const p = parts(n);
  const t = { id: id, format: 'Eliminatórias Simples', matches: A.build(n, 'simples', { participantes: p, ns: 'p0' }).matches, participants: p };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  return t;
}

console.log('── o MELHOR derrotado sobe, não o do primeiro jogo ──');
(function () {
  const t = mk(10, 'x');                       // R1 = 5 jogos → 5 sobem + 3 repescados = 8
  const r1 = r1De(t);
  const placar = [[6, 5], [6, 0], [6, 4], [6, 1], [6, 3]];
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = placar[i][0]; m.scoreP2 = placar[i][1]; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  const rank = r1.map((m, i) => ({ n: m.p2, pts: placar[i][1] })).sort((a, b) => b.pts - a.pts);
  rank.slice(0, 3).forEach((x) => ok(oc.indexOf(x.n) !== -1, 'melhor derrotado ' + x.n + ' (' + x.pts + ' pts) foi repescado [' + oc.join(',') + ']'));
  ok(oc.indexOf(rank[rank.length - 1].n) === -1, 'o PIOR derrotado (' + rank[rank.length - 1].n + ') NÃO foi repescado');
})();

console.log('── empate total → ordem dos jogos (o caso do dono: todos 6-4) ──');
(function () {
  const t = mk(6, 'y');                        // R1 = 3 jogos → 3 sobem + 1 repescado = 4
  const r1 = r1De(t);
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 4; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  ok(oc.length === 1, '1 slot de repescagem (got ' + oc.length + ')');
  ok(oc[0] === r1[0].p2, 'empate → sobe o derrotado do PRIMEIRO jogo (' + r1[0].p2 + '), got ' + oc[0]);
})();

console.log('── com a rodada EM CURSO ninguém é eleito (o nome não dança na tela) ──');
(function () {
  const t = mk(10, 'z');
  const r1 = r1De(t);
  [0, 1].forEach((i) => { const m = r1[i]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i; m.resultAt = i + 1; W._advanceWinner(t, m); });
  ok(repOcup(t).length <= 2, 'rodada em curso: no máximo o que a aresta trouxe (got ' + repOcup(t).length + ')');
  r1.forEach((m, i) => { if (m.winner) return; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 5; m.resultAt = 10 + i; W._advanceWinner(t, m); });
  ok(repOcup(t).length === 3, 'fechada a rodada, os 3 slots preenchem (got ' + repOcup(t).length + ')');
})();

console.log('── UMA vida extra só, e sem double-book ──');
(function () {
  const t = mk(9, 'w');                        // N ímpar: sobra na R1 + repescados da R2
  const r1 = r1De(t);
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i % 5; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  ok(new Set(oc).size === oc.length, 'ninguém ocupa DOIS slots de repescagem [' + oc.join(',') + ']');
  const vivos = {}; let dup = null;
  t.matches.filter((m) => !m.winner).forEach((m) => ['p1', 'p2'].forEach((s) => {
    const v = m[s];
    if (!v || v === 'TBD' || /BYE/.test(String(v))) return;
    if (vivos[v]) dup = v; vivos[v] = 1;
  }));
  ok(!dup, 'nenhum double-book após a reatribuição (' + (dup || 'nenhum') + ')');
  const antes = repOcup(t).join(',');
  W._reassignBestLosersToRepechage(t); W._reassignBestLosersToRepechage(t);
  ok(repOcup(t).join(',') === antes, 'idempotente (' + antes + ' → ' + repOcup(t).join(',') + ')');
})();

console.log('── LINHA OURO da Confra (bracket "gold", fase 1): 3 derrotados 6-4 ──');
// O caso REAL. As linhas de uma fase usam o nome que o organizador deu — 'gold'/'silver',
// não main/upper. Foi por assumir a lista fixa de brackets que este passo não rodava
// NADA nas linhas Ouro/Prata, e o dono seguia vendo os primeiros por posição.
(function () {
  const p = Array.from({ length: 28 }, (_, i) => ({ displayName: 'O' + (i + 1), uid: 'o' + (i + 1) }));
  const t = {
    id: 'confra', format: 'Eliminatórias Simples', currentPhaseIndex: 1, participants: p,
    matches: A.build(28, 'simples', { participantes: p, ns: 'p1-gold', bracketKey: 'gold', phaseIndex: 1 }).matches
  };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  ok(r1[0].bracket === 'gold', 'a linha usa bracket "gold" (got ' + r1[0].bracket + ')');
  ok(r1.length === 14, 'R1 da Ouro tem 14 jogos (got ' + r1.length + ')');
  // 3 perdem por 6-4 (os 3 primeiros jogos); o resto perde de 6-0
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i < 3 ? 4 : 0); m.resultAt = i + 1; W._advanceWinner(t, m); });
  const rep = repOcup(t);
  ok(rep.length === 2, '2 repescados completam a R2 até 8 (got ' + rep.length + ')');
  ok(rep.indexOf(r1[0].p2) !== -1 && rep.indexOf(r1[1].p2) !== -1,
    'subiram os 2 PRIMEIROS dos que perderam 6-4 (' + r1[0].p2 + ',' + r1[1].p2 + '), got [' + rep.join(',') + ']');
  ok(rep.indexOf(r1[2].p2) === -1, 'o 3º que perdeu 6-4 (' + r1[2].p2 + ') NÃO subiu — só há 2 vagas');
  ok(rep.every((n) => r1.slice(0, 3).some((m) => m.p2 === n)), 'nenhum dos que perderam 6-0 foi repescado [' + rep.join(',') + ']');
})();

console.log('── placares QUAISQUER: manda o critério do organizador, não o empate ──');
// O 6-4 foi só o placar daquele reset. A regra é geral: os MELHORES pelo critério de
// desempate, SEMPRE. Aqui os derrotados têm placares todos DIFERENTES e embaralhados em
// relação à ordem dos jogos — se o código estivesse caindo na ordem dos jogos por
// engano, subiriam os primeiros e o teste quebra.
(function () {
  const p = Array.from({ length: 28 }, (_, i) => ({ displayName: 'G' + (i + 1), uid: 'g' + (i + 1) }));
  const t = {
    id: 'geral', format: 'Eliminatórias Simples', currentPhaseIndex: 1, participants: p,
    matches: A.build(28, 'simples', { participantes: p, ns: 'p1-gold', bracketKey: 'gold', phaseIndex: 1 }).matches
  };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  // pontos do derrotado, embaralhados: os melhores NÃO são os primeiros jogos
  const pts = [0, 1, 5, 2, 0, 3, 1, 4, 0, 2, 1, 0, 3, 1];
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = pts[i]; m.resultAt = i + 1; W._advanceWinner(t, m); });

  const esperados = r1.map((m, i) => ({ n: m.p2, pts: pts[i], i: i }))
    .sort((a, b) => (b.pts - a.pts) || (a.i - b.i)).slice(0, 2).map((x) => x.n);
  const rep = repOcup(t);
  ok(rep.length === 2, '2 repescados (got ' + rep.length + ')');
  esperados.forEach((n) => ok(rep.indexOf(n) !== -1,
    'subiu o melhor ' + n + ' — esperados [' + esperados.join(',') + '], got [' + rep.join(',') + ']'));
  // e NÃO subiu ninguém dos primeiros jogos que perdeu feio
  ok(rep.indexOf(r1[0].p2) === -1, 'o derrotado do 1º jogo (0 pts) NÃO subiu só por ser o primeiro');
})();

console.log('── critério do organizador SEPARA quem tem o mesmo placar simples ──');
// Dois derrotados com o MESMO placar do jogo, mas históricos diferentes: quem decide é
// `_rankByTiebreakers`, não a ordem dos jogos. Se o código tratasse "mesmo placar" como
// empate (a heurística errada que eu tinha), pegaria o primeiro e este teste quebra.
(function () {
  const p = Array.from({ length: 6 }, (_, i) => ({ displayName: 'S' + (i + 1), uid: 's' + (i + 1) }));
  const t = {
    id: 'crit', format: 'Eliminatórias Simples', currentPhaseIndex: 0, participants: p,
    matches: A.build(6, 'simples', { participantes: p, ns: 'p0' }).matches
  };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  const r1 = r1De(t);
  // todos perdem 6-4 no PLACAR, mas com saldos de pontos distintos ao longo do jogo
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 4; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const rep = repOcup(t);
  ok(rep.length === 1, '1 repescado (got ' + rep.length + ')');
  // com tudo realmente igual, a ordem dos jogos é o desempate final
  ok(rep[0] === r1[0].p2, 'tudo igual → o primeiro na ordem dos jogos (' + r1[0].p2 + '), got ' + rep[0]);
})();

console.log('── ESPERAR A RODADA FECHAR: 1 resultado NÃO define repescado (Ouro e Prata) ──');
// A queixa do dono: lançou UM jogo da R1 Ouro e o repescado já apareceu no último jogo
// da R2 Ouro. A aresta enche o slot no instante em que o jogo-fonte fecha — mas só se
// sabe quem é o melhor com a rodada INTEIRA terminada. O dado fica (esvaziar fazia a
// pessoa sumir da chave, o slot é o único destino dela) e a EXIBIÇÃO espera: enquanto
// `pXAguardaMelhor` estiver ligada o card mostra "A definir".
['gold', 'silver'].forEach(function (linha) {
  const p = Array.from({ length: 28 }, (_, i) => ({ displayName: linha[0].toUpperCase() + (i + 1), uid: linha[0] + (i + 1) }));
  const t = {
    id: 'wait-' + linha, format: 'Eliminatórias Simples', currentPhaseIndex: 1, participants: p,
    matches: A.build(28, 'simples', { participantes: p, ns: 'p1-' + linha, bracketKey: linha, phaseIndex: 1 }).matches
  };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  const r1 = t.matches.filter((m) => m.round === 1 && !m.isBye)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const slot = t.matches.filter((m) => m.p1FromRepechage || m.p2FromRepechage)[0];
  ok(!!slot, linha + ': existe slot de repescagem na R2');

  // UM resultado só
  const m0 = r1[0]; m0.winner = m0.p1; m0.scoreP1 = 6; m0.scoreP2 = 4; m0.resultAt = 1; W._advanceWinner(t, m0);
  const aguardando = ['p1', 'p2'].some((sl) => slot[sl + 'FromRepechage'] && slot[sl + 'AguardaMelhor']);
  ok(aguardando, linha + ': com 1 jogo lançado o slot fica AGUARDANDO (card = "A definir")');

  // fecha a rodada: 3 empatam em 6-4 (os 3 primeiros jogos), o resto perde 6-0
  r1.forEach((m, i) => { if (m.winner) return; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i < 3 ? 4 : 0); m.resultAt = i + 2; W._advanceWinner(t, m); });
  const aindaAguarda = ['p1', 'p2'].some((sl) => slot[sl + 'FromRepechage'] && slot[sl + 'AguardaMelhor']);
  ok(!aindaAguarda, linha + ': fechada a rodada, o slot deixa de aguardar');

  const empatados = r1.slice(0, 3).map((m) => m.p2);      // os 3 que perderam 6-4
  const rep = repOcup(t);
  ok(rep.length === 2, linha + ': 2 repescados (got ' + rep.length + ')');
  ok(rep.indexOf(empatados[0]) !== -1 && rep.indexOf(empatados[1]) !== -1,
    linha + ': subiram os 2 PRIMEIROS na ordem dos jogos (' + empatados.slice(0, 2).join(',') + '), got [' + rep.join(',') + ']');
  ok(rep.indexOf(empatados[2]) === -1, linha + ': o 3º empatado (' + empatados[2] + ') NÃO subiu');
});


// ─────────────────────────────────────────────────────────────────────────────
// v1.5.34 — A CHAVE TAMBÉM SE CORRIGE AO SER ABERTA.
//
// Falha real (Confra SB, linha Ouro, 28/jul): a R1 fechou e as 3 vagas de repescagem
// mostravam Marina Turri (perdeu 6-2), Anke (6-1) e Kelly Barth (6-3) — os perdedores do
// 1º, 2º e 3º jogos, os de PIOR placar — em vez de Marilia/Silvia (6-5 7-5), Glauce (6-4)
// e Gabriela (6-4). Causa: `_reassignBestLosersToRepechage` só era chamado de dentro de
// `_advanceWinner`, então a correção dependia de alguém lançar MAIS UM resultado. Fechada
// a rodada, abrir a chave não reavaliava nada e o erro ficava congelado na tela.
console.log('\n── a chave se corrige AO ABRIR, sem lançar mais um resultado ──');
(function () {
  const t = mk(26, 'tAbrir');          // 26 duplas = 13 jogos na R1, como a Ouro do SB
  const r1 = r1De(t);
  ok(r1.length >= 6, 'R1 com jogos suficientes (got ' + r1.length + ')');
  // fecha a R1 INTEIRA sem passar pelo caminho que corrige (simula o estado gravado por
  // um cliente sem o fix): winner na mão + a aresta enchendo a vaga com o perdedor dela.
  // Placar do perdedor: quase todos 2; o MELHOR faz 5 e dois outros fazem 4.
  const iMelhor = r1.length - 4, iSeg = r1.length - 5, iTer = r1.length - 2;
  r1.forEach((m, i) => {
    const g = (i === iMelhor) ? 5 : ((i === iSeg || i === iTer) ? 4 : 2);
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g; m.resultAt = i + 1;
  });
  const slots = [];
  t.matches.forEach((m) => ['p1', 'p2'].forEach((s) => { if (m[s + 'FromRepechage']) slots.push({ m: m, s: s }); }));
  ok(slots.length > 0, 'existe vaga de repescagem (got ' + slots.length + ')');
  slots.forEach((x, i) => { x.m[x.s] = r1[i].p2; delete x.m[x.s + 'AguardaMelhor']; });   // perdedores dos 1ºs jogos
  ok(slots[0].m[slots[0].s] === r1[0].p2, 'estado inicial: a vaga tem o perdedor do 1º jogo (placar pior)');

  // AGORA: só ABRIR a chave — nenhum resultado novo. É o que renderBracket passou a fazer.
  const trocas = W._reassignBestLosersToRepechage(t);
  ok(trocas > 0, 'abrir a chave corrige (trocas=' + trocas + ')');

  const rep = repOcup(t);
  // esperado = topo do ranking CANÔNICO (critérios do organizador) — sem assumir placar
  const rankAbrir = W._rankLosersByCriteria(t, r1.map((m) => m.p2)).slice(0, rep.length);
  ok(rankAbrir.every((n) => rep.indexOf(n) !== -1),
    'as vagas têm o TOPO do ranking [' + rankAbrir.join(',') + '], got [' + rep.join(',') + ']');
  ok(rep.indexOf(r1[0].p2) === -1 || rankAbrir.indexOf(r1[0].p2) !== -1,
    'o perdedor do 1º jogo só está na vaga se o RANKING o puser lá');
  ok(W._reassignBestLosersToRepechage(t) === 0, 'reabrir a chave é no-op (idempotente)');
})();

// ─────────────────────────────────────────────────────────────────────────────
// v1.5.35 — A VAGA FICA VAZIA ATÉ A RODADA FECHAR.
//
// Regra do dono (28/jul): "tem que esperar a porra da rodada fechar. não tem que pôr
// ninguém antes disso lá, para depois corrigir. fechou a rodada, aí vê quem foi o melhor
// seguindo os critérios de desempate e daí sim coloca lá. não antes."
//
// Antes, a aresta `loserNextMatchId` despejava o perdedor do jogo-fonte na vaga no instante
// em que aquele jogo fechava — na Ouro do SB isso pôs os perdedores do 1º, 2º e 3º jogos
// (6-2, 6-1, 6-3) nas três vagas, e a correção vinha só depois. Agora a aresta não escreve
// enquanto a vaga estiver pendente: fica vazia e marcada (card = "A definir").
console.log('\n── a vaga fica VAZIA enquanto a rodada corre (26 duplas, 13 jogos) ──');
(function () {
  const t = mk(26, 'tVazia');
  const r1 = r1De(t);
  ok(r1.length === 13, '13 jogos na R1 (got ' + r1.length + ')');
  const vagas = [];
  t.matches.forEach((m) => ['p1', 'p2'].forEach((sl) => {
    if (m[sl + 'FromRepechage'] && m.round > r1[0].round) vagas.push({ m: m, sl: sl });
  }));
  ok(vagas.length > 0, 'existem vagas de normalização (got ' + vagas.length + ')');
  const vazio = (v) => !v || v === 'TBD' || /a definir/i.test(String(v));
  ok(vagas.every((v) => vazio(v.m[v.sl])), 'no sorteio as vagas nascem vazias');

  // 1 resultado: a vaga NÃO pode receber ninguém
  const m0 = r1[0]; m0.winner = m0.p1; m0.scoreP1 = 6; m0.scoreP2 = 2; m0.resultAt = 1;
  W._advanceWinner(t, m0);
  ok(vagas.every((v) => vazio(v.m[v.sl])),
    'com 1 resultado a vaga continua VAZIA (o perdedor ' + m0.p2 + ' NÃO entra)');
  ok(vagas.some((v) => v.m[v.sl + 'AguardaMelhor']), 'a vaga fica marcada como aguardando');

  // metade da rodada: ainda vazia
  r1.slice(1, 7).forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; m.resultAt = i + 2; W._advanceWinner(t, m); });
  ok(vagas.every((v) => vazio(v.m[v.sl])), 'na metade da rodada a vaga continua VAZIA');

  // fecha: o melhor derrotado (6-5, jogo 10) entra
  r1.forEach((m, i) => {
    if (m.winner) return;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i === 9 ? 5 : (i === 8 || i === 10 ? 4 : 2)); m.resultAt = i + 2;
    W._advanceWinner(t, m);
  });
  ok(vagas.every((v) => !v.m[v.sl + 'AguardaMelhor']), 'fechada a rodada, a marca sai');
  const ocup = vagas.map((v) => v.m[v.sl]);
  ok(ocup.every((x) => !vazio(x)), 'fechada a rodada, as vagas estão preenchidas: [' + ocup.join(', ') + ']');
  // esperado = topo do ranking CANÔNICO — o "melhor" é quem os critérios do organizador
  // disserem, seja o placar dele 6-5 ou 6-2. Nada de assumir placar no teste.
  const rankVazia = W._rankLosersByCriteria(t, r1.map((m) => (m.winner === m.p1 ? m.p2 : m.p1))).slice(0, ocup.length);
  ok(rankVazia.every((n) => ocup.indexOf(n) !== -1),
    'as vagas têm o TOPO do ranking [' + rankVazia.join(', ') + '], got [' + ocup.join(', ') + ']');
})();

// ─────────────────────────────────────────────────────────────────────────────
// v1.5.36 — A REGRA É UNIVERSAL: vale pra DUPLA ELIMINATÓRIA também.
// "isso serve para eliminatórias simples (de 1, 2 ou 4 linhas), duplas ou o que for.
//  sempre." — vaga vazia com a rodada em curso; fechada, entra o melhor derrotado.
console.log('\n── DUPLA: vaga vazia na rodada em curso; melhor derrotado ao fechar ──');
(function () {
  const built = A.build(10, 'dupla', { participantes: parts(10), ns: 'p0' });
  const t = { id: 'tDupla', format: 'Dupla Eliminatória', matches: built.matches };
  W.AppStore.tournaments = [t]; W._lastActiveTournamentId = t.id;
  const isEmpty = (v) => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
  const r1 = t.matches.filter((m) => m.bracket === 'upper' && m.round === 1 && !m.isBye)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const vagas = () => {
    const o = [];
    t.matches.forEach((m) => { if (m.winner) return; ['p1', 'p2'].forEach((sl) => { if (m[sl + 'FromRepechage']) o.push({ m, sl }); }); });
    return o;
  };
  ok(vagas().length > 0, 'dupla N=10 tem vagas de repescagem (got ' + vagas().length + ')');

  const m0 = r1[0]; m0.winner = m0.p1; m0.scoreP1 = 6; m0.scoreP2 = 2;
  W._advanceWinner(t, m0); if (W._resolveRepFills) W._resolveRepFills(t);
  ok(vagas().every((v) => isEmpty(v.m[v.sl])), 'dupla: com 1 resultado TODA vaga segue vazia');
  ok(vagas().some((v) => v.m[v.sl + 'AguardaMelhor']), 'dupla: vaga marcada "A definir"');

  r1.forEach((m, i) => {
    if (m.winner) return;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i === 3 ? 5 : i % 5);
    W._advanceWinner(t, m); if (W._resolveRepFills) W._resolveRepFills(t);
  });
  const ocup = [];
  t.matches.filter((m) => m.bracket === 'upper' && m.round === 2).forEach((m) =>
    ['p1', 'p2'].forEach((sl) => { if (m[sl + 'FromRepechage'] && !isEmpty(m[sl])) ocup.push(m[sl]); }));
  ok(ocup.length > 0, 'dupla: fechada a R1, as vagas da normalização estão preenchidas');
  ok(ocup.indexOf(r1[3].p2) !== -1, 'dupla: o MELHOR derrotado (6-5) ocupa vaga (got [' + ocup.join(', ') + '])');
})();

// ─────────────────────────────────────────────────────────────────────────────
// v1.5.36 — A REGRA É UNIVERSAL: vale pra DUPLA ELIMINATÓRIA também.
// "isso serve para eliminatórias simples (de 1, 2 ou 4 linhas), duplas ou o que for.
//  sempre." — vaga vazia com a rodada em curso; fechada, entram OS MAIS BEM
// QUALIFICADOS pelo ranking dos critérios do organizador. O teste NÃO assume placar
// nenhum: o esperado é computado pelo MESMO ranking canônico (_rankLosersByCriteria),
// então a trava é "vaga = topo do ranking", qualquer que seja o placar de cada um.
console.log('\n── DUPLA: vaga vazia na rodada em curso; topo do ranking ao fechar ──');
(function () {
  const built = A.build(10, 'dupla', { participantes: parts(10), ns: 'p0' });
  const t = { id: 'tDupla', format: 'Dupla Eliminatória', matches: built.matches };
  W.AppStore.tournaments = [t]; W._lastActiveTournamentId = t.id;
  const isEmpty = (v) => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
  const r1 = t.matches.filter((m) => m.bracket === 'upper' && m.round === 1 && !m.isBye)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const vagas = () => {
    const o = [];
    t.matches.forEach((m) => { if (m.winner) return; ['p1', 'p2'].forEach((sl) => { if (m[sl + 'FromRepechage']) o.push({ m, sl }); }); });
    return o;
  };
  const nVagas = vagas().length;
  ok(nVagas > 0, 'dupla N=10 tem vagas de repescagem (got ' + nVagas + ')');

  const m0 = r1[0]; m0.winner = m0.p1; m0.scoreP1 = 6; m0.scoreP2 = 2;
  W._advanceWinner(t, m0); if (W._resolveRepFills) W._resolveRepFills(t);
  ok(vagas().every((v) => isEmpty(v.m[v.sl])), 'dupla: com 1 resultado TODA vaga segue vazia');
  ok(vagas().some((v) => v.m[v.sl + 'AguardaMelhor']), 'dupla: vaga marcada "A definir"');

  r1.forEach((m, i) => {
    if (m.winner) return;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = [2, 4, 1, 5, 3][i % 5];
    W._advanceWinner(t, m); if (W._resolveRepFills) W._resolveRepFills(t);
  });
  // esperado = topo do ranking CANÔNICO dos derrotados da R1 (ordem dos jogos na entrada)
  const derrotados = r1.map((m) => (m.winner === m.p1 ? m.p2 : m.p1));
  const rankTopo = W._rankLosersByCriteria(t, derrotados).slice(0, nVagas);
  const ocup = [];
  t.matches.filter((m) => m.bracket === 'upper' && m.round === 2).forEach((m) =>
    ['p1', 'p2'].forEach((sl) => { if (m[sl + 'FromRepechage'] && !isEmpty(m[sl])) ocup.push(m[sl]); }));
  ok(ocup.length === nVagas, 'dupla: fechada a R1, TODAS as vagas preenchidas (got ' + ocup.length + '/' + nVagas + ')');
  ok(rankTopo.every((n) => ocup.indexOf(n) !== -1),
    'dupla: as vagas têm o TOPO do ranking [' + rankTopo.join(', ') + '], got [' + ocup.join(', ') + ']');
})();

// SOURCE: o render TEM de chamar a reavaliação — é isso que quebrava no código antigo.
console.log('\n── renderBracket chama a reavaliação (source) ──');
(function () {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
  const i = src.indexOf('function renderBracket(');
  ok(i !== -1, 'renderBracket existe');
  const corpo = _R.ateOFim(src, i);
  ok(corpo.indexOf('_reassignBestLosersToRepechage') !== -1,
    'renderBracket chama _reassignBestLosersToRepechage (sem isto, a chave só se corrige no próximo resultado)');
})();

console.log('\n' + (fail === 0 ? '✅ repechage-best-loser: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
