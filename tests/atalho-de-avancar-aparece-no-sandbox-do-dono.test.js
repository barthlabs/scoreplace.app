/* O ATALHO "AVANÇAR DE FASE" DAS FERRAMENTAS APARECE TAMBÉM NO SANDBOX DO DONO
 * node tests/atalho-de-avancar-aparece-no-sandbox-do-dono.test.js   (FIX.AVANCAR.P2)
 *
 * ⛔ O DEFEITO, reproduzido nos DOIS documentos REAIS de produção antes de mexer: no
 * sandbox, as Ferramentas do Organizador não mostravam o atalho "⏭️ Avançar de Fase",
 * enquanto o botão CONTEXTUAL da chave aparecia normalmente. Os dois gates são o MESMO
 * cálculo (`_isMultiPhase` + `_phasesPhaseComplete` + existe próxima fase) — então o
 * defeito não estava na regra, e sim no DADO que chegava a cada tela.
 *
 * ⭐ A CAUSA, medida: num torneio Rei/Rainha DIVIDIDO (o caso do Confra), o jogo mora uma
 * vez só em `round.matches` e o grupo guarda apenas `matchIds`. Quem religa os dois é
 * `_hydrateMonarchGroups` — e ela precisa rodar DEPOIS da montagem das partes, porque
 * `remontar` devolve um CLONE (o que fosse hidratado antes é descartado) e porque os jogos
 * só chegam ali. `_montaPesadosQueFaltam` não a chamava. Sem grupos religados,
 * `_phasesPhaseComplete` responde `false` PARA SEMPRE e o atalho nunca nasce.
 *   • O torneio real DISFARÇAVA: o ouvinte de `tournaments` reidrata a cada eco, e torneio
 *     vivo ecoa o tempo todo. O sandbox não ecoa — ninguém mais escreve nele.
 *   • A chave nunca sofreu porque `renderBracket` hidrata sozinha, no topo do render.
 *
 * ⛔ NENHUMA REGRA DE AVANÇO MUDOU. Mesma `_phaseCanAdvance`, mesma `_advanceMultiPhase`,
 * mesmo botão contextual. O que mudou é que o dado chega religado — pela MESMA função
 * canônica que o ouvinte, o cache, o `loadTournamentById` e a transação já chamavam.
 *
 * ⚠️ Este teste entra pelo CAMINHO REAL: documento MAGRO no ouvinte (`_sbIngest` /
 * `_montaPesadosQueFaltam`), partes servidas como o banco serviria, e só então o render.
 * Medir sobre um torneio já montado à mão não veria nada — foi exatamente o que escondeu
 * o defeito da primeira vez.
 */
'use strict';
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const S = require('../js/views/tournament-split-core.js');

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const tick = () => new Promise((r) => setTimeout(r, 0));

const DONO = { uid: 'uDono', email: 'rstbarth@hotmail.com', displayName: 'Dono' };   // identidade de teste real
const OUTRO = { uid: 'uOutro', email: 'outro@x.com', displayName: 'Outro' };

/* ── a Confra equivalente: Rei/Rainha de rodada única, 2 fases, fase 0 CONCLUÍDA ────── */
function jogo(id, a, b, c, d, gA, gB) {
  return { id: id, isMonarch: true, p1: a + ' / ' + b, p2: c + ' / ' + d,
    team1: [a, b], team1Uids: ['u-' + a, 'u-' + b], team2: [c, d], team2Uids: ['u-' + c, 'u-' + d],
    scoreP1: gA, scoreP2: gB, winner: gA > gB ? (a + ' / ' + b) : (c + ' / ' + d),
    sets: [{ gamesP1: gA, gamesP2: gB }], resultAt: 1000 };
}
function grupo(gi) {
  const P = ['A', 'B', 'C', 'D'].map((x) => 'G' + gi + x);
  const L = gi % 3;
  return { name: 'R1 Grupo ' + gi, players: P.slice(), playersUids: P.map((n) => 'u-' + n), matches: [
    jogo('m' + gi + '-1', P[0], P[1], P[2], P[3], 6, L),
    jogo('m' + gi + '-2', P[0], P[2], P[1], P[3], 6, L + 1),
    jogo('m' + gi + '-3', P[0], P[3], P[1], P[2], 6, L + 2)] };
}
function torneio(o) {
  o = o || {};
  const gs = [grupo(0), grupo(1), grupo(2), grupo(3)];
  const ms = []; gs.forEach((g) => g.matches.forEach((m) => ms.push(m)));
  const parts = []; gs.forEach((g) => g.players.forEach((n) => parts.push({ uid: 'u-' + n, name: n, displayName: n, ligaActive: true })));
  /* ⚠️ `concluida:false` tira os vencedores: a fase deixa de estar completa e ninguém pode
   * avançar. É o controle negativo — sem ele o teste não distingue "some quando deve" de
   * "some sempre". */
  if (o.concluida === false) gs.forEach((g) => g.matches.forEach((m) => { delete m.winner; delete m.resultAt; }));
  const t = {
    id: o.id, name: 'Confra equivalente', sport: 'Beach Tennis', status: 'in_progress',
    format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    drawFirstDate: '2026-08-02',
    /* ⭐ o DONO é o criador do original — é a configuração de produção (o sandbox nasce do
     * torneio de quem o pediu). O sandbox de OUTRA pessoa é montado no ⑤, trocando só o
     * `sandboxOwnerUid`. */
    organizerEmail: DONO.email, creatorUid: DONO.uid, adminUids: [DONO.uid],
    currentPhaseIndex: 0, teamSize: 2, participants: parts, matches: [],
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
      { name: 'Ouro/Prata', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
        source: { type: 'previous_phase', scope: 'per_group', mapping: [
          { dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
          { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }] } }
    ],
    rounds: [{ round: 1, format: 'liga', status: (o.concluida === false ? 'active' : 'complete'), matches: ms, monarchGroups: gs }]
  };
  if (o.sandbox) { t.isSandbox = true; t.sbState = 'ready'; t.sandboxOf = 'orig'; t.sandboxOwnerUid = o.sandbox; }
  return t;
}

/* ── COMO O BANCO GUARDA: dividido (`dividir`) e dobrado (`_foldMonarchGroups`) ────────
 * ⚠️ As DUAS funções são as de produção. Reescrever aqui o que o Firestore faz seria a
 * segunda fonte que este projeto já pagou caro — e, pior, um fixture "já religado"
 * esconderia justamente o defeito sob teste. */
const REGISTROS = {};
/* ⚠️ As MESMAS partes que o Confra tem fora (`_semPesados` medido em produção): os GRUPOS
 * ficam no documento — é por isso que eles chegam com `matchIds` apontando pra jogos que
 * ainda não vieram. Dividir os grupos também mudaria o caso e escondia o defeito. */
const PARTES_FORA = ['matches', 'participants', 'opponentHistory'];
function comoNoBanco(t) {
  const partes = S.dividir(t, PARTES_FORA);
  REGISTROS[String(t.id)] = partes;
  const magro = JSON.parse(JSON.stringify(partes.config));
  magro._semPesados = PARTES_FORA.slice();
  magro._nPartes = {};
  PARTES_FORA.forEach((n) => { magro._nPartes[n] = (partes[n] || []).length; });
  W._foldMonarchGroups(magro);          // grupo guarda só matchIds; o jogo mora em round.matches
  return magro;
}
/* o cliente monta por aqui — devolvemos exatamente o que a subcoleção daria */
W.FirestoreDB = W.FirestoreDB || {};
W.FirestoreDB._montaDeSubcolecoes = function (id, cfg, quais) {
  const p = REGISTROS[String(id)];
  return Promise.resolve(S.remontar(Object.assign({}, p, { config: JSON.parse(JSON.stringify(cfg)) })));
};

function caixa() {
  return { innerHTML: '', style: {}, dataset: {}, appendChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, addEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } };
}
/* ⭐ ENTRA MAGRO E MONTA — o caminho real. Sandbox pelo `_sbIngest`; torneio real pela
 * mesma dupla que o ouvinte de `tournaments` usa. */
async function ingerirEMontar(magro) {
  const id = String(magro.id);
  if (magro.isSandbox) {
    W._sbIngest([magro]);
  } else {
    const pronto = W._preservaPartesMontadas(magro, null);
    W.AppStore.tournaments.push(pronto);
    if (W._marcaPartesQueFaltam(pronto)) W.AppStore._montaPesadosQueFaltam([id]);
  }
  for (let i = 0; i < 6; i++) await tick();   // a montagem resolve em microtask
  return W.AppStore.tournaments.find((x) => String(x.id) === id);
}
function zerarStore(quem) {
  W.AppStore.tournaments = [];
  W.AppStore.currentUser = quem;
  ['_montandoPesados', '_ultimaMontagem', '_tentativasDePartes', '_retentandoPartes', '_partesEmErro']
    .forEach((m) => { W.AppStore[m] = {}; });
  W._sbIdsConhecidos = {};
}
function detalhe(t) { const c = caixa(); W.renderTournaments(c, String(t.id)); return c.innerHTML || ''; }
function chave(t) { const c = caixa(); try { W.renderBracket(c, String(t.id)); } catch (e) {} return c.innerHTML || ''; }
const atalhos = (html) => (html.match(/<button[^>]*_advanceMultiPhase[^>]*>[\s\S]*?<\/button>/g) || []);

(async () => {
console.log('──── o atalho de avançar aparece no sandbox do dono ────');

console.log('\n── ① o fixture chega MAGRO e DOBRADO, como o banco guarda (senão não medimos nada) ──');
const magroReal = comoNoBanco(torneio({ id: 'tr-real' }));
const g0 = ((magroReal.rounds || [])[0] || {});
ok('o documento magro não traz os jogos (foram pra subcoleção)', (g0.matches || []).length === 0);
ok('e o grupo guarda só matchIds — sem cópia do jogo',
  (g0.monarchGroups || []).length === 4 &&
  (g0.monarchGroups || []).every((g) => Array.isArray(g.matchIds) && g.matchIds.length === 3 && !(g.matches || []).length));
ok('⛔ CONTROLE: sobre o magro, a fase NÃO se diz completa (é o estado do defeito)',
  W._phasesPhaseComplete(magroReal) === false);

console.log('\n── ② torneio REAL elegível: exatamente UM atalho e UM contextual ──');
zerarStore(DONO);
const tReal = await ingerirEMontar(magroReal);
ok('montou: os jogos voltaram pro round', (((tReal.rounds || [])[0] || {}).matches || []).length === 12);
ok('⭐ e os grupos foram RELIGADOS aos jogos (matchIds → refs)',
  (((tReal.rounds || [])[0] || {}).monarchGroups || []).every((g) => (g.matches || []).length === 3));
ok('a fase agora se diz completa', W._phasesPhaseComplete(tReal) === true);
ok('sou organizador dele', W.AppStore.isOrganizer(tReal) === true);
const hReal = detalhe(tReal), bReal = chave(tReal);
ok('⭐⭐ EXATAMENTE UM atalho nas Ferramentas', atalhos(hReal).length === 1,
  atalhos(hReal).map((b) => b.replace(/\s+/g, ' ').slice(0, 110)).join(' | '));
ok('⭐⭐ e EXATAMENTE UM contextual na chave', atalhos(bReal).length === 1,
  atalhos(bReal).map((b) => b.replace(/\s+/g, ' ').slice(0, 110)).join(' | '));

console.log('\n── ③ SANDBOX DO DONO elegível: exatamente UM atalho e UM contextual ──');
zerarStore(DONO);
const magroSb = comoNoBanco(torneio({ id: 'tr-sb', sandbox: DONO.uid }));
const tSb = await ingerirEMontar(magroSb);
ok('o sandbox entrou na lista pelo ouvinte', !!tSb && tSb.isSandbox === true);
ok('⭐ os grupos do sandbox também foram religados',
  (((tSb.rounds || [])[0] || {}).monarchGroups || []).every((g) => (g.matches || []).length === 3));
ok('a fase do sandbox se diz completa', W._phasesPhaseComplete(tSb) === true);
ok('o dono manda no próprio sandbox', W.AppStore.isOrganizer(tSb) === true && W._souDonoDoSandbox(tSb) === true);
const hSb = detalhe(tSb), bSb = chave(tSb);
ok('⭐⭐ EXATAMENTE UM atalho nas Ferramentas (era ZERO — é o defeito desta leva)',
  atalhos(hSb).length === 1, atalhos(hSb).map((b) => b.replace(/\s+/g, ' ').slice(0, 110)).join(' | '));
ok('⭐⭐ e EXATAMENTE UM contextual na chave (esse nunca quebrou)', atalhos(bSb).length === 1);

console.log('\n── ④ o atalho chama a MESMA ação canônica do contextual ──');
const aAtalho = (atalhos(hSb)[0] || '').match(/window\._advanceMultiPhase\('([^']*)'\)/);
const aContext = (atalhos(bSb)[0] || '').match(/window\._advanceMultiPhase\('([^']*)'\)/);
ok('⭐ os dois chamam _advanceMultiPhase com o MESMO id',
  !!aAtalho && !!aContext && aAtalho[1] === aContext[1] && aAtalho[1] === String(tSb.id),
  'atalho=' + (aAtalho && aAtalho[1]) + ' · contextual=' + (aContext && aContext[1]));
ok('  → e o atalho é o das Ferramentas (⏭️, com o title que ele carrega)',
  /⏭️ Avançar de Fase/.test(atalhos(hSb)[0] || '') && /title="Sorteia /.test(atalhos(hSb)[0] || ''));

console.log('\n── ⑤ sandbox de OUTRA pessoa: nenhum atalho de organizador ──');
zerarStore(OUTRO);
const magroAlheio = comoNoBanco(torneio({ id: 'tr-sb-alheio', sandbox: 'uTerceiro' }));
/* ⚠️ entra por `_preservaPartesMontadas` + montagem, e não pelo `_sbIngest`: o ouvinte só
 * traz sandbox DO usuário. Sandbox alheio só chega por link direto — e é exatamente esse
 * o caso que precisa não dar poder a ninguém. */
W.AppStore.tournaments.push(W._preservaPartesMontadas(magroAlheio, null));
if (W._marcaPartesQueFaltam(W.AppStore.tournaments[0])) W.AppStore._montaPesadosQueFaltam(['tr-sb-alheio']);
for (let i = 0; i < 6; i++) await tick();
const tAlheio = W.AppStore.tournaments.find((x) => String(x.id) === 'tr-sb-alheio');
ok('o cenário continua elegível em si (o que muda é QUEM olha)', W._phasesPhaseComplete(tAlheio) === true);
ok('não sou dono nem organizador dele',
  W._souDonoDoSandbox(tAlheio) === false && W.AppStore.isOrganizer(tAlheio) === false);
ok('⭐⭐ nenhum atalho de avanço no detalhe', atalhos(detalhe(tAlheio)).length === 0);
ok('  → e nem o texto do botão aparece', detalhe(tAlheio).indexOf('Avançar de Fase') === -1);

console.log('\n── ⑥ fase ainda NÃO elegível: nem atalho, nem contextual ──');
zerarStore(DONO);
const magroSbInc = comoNoBanco(torneio({ id: 'tr-sb-inc', sandbox: DONO.uid, concluida: false }));
const tInc = await ingerirEMontar(magroSbInc);
ok('os grupos foram religados (a montagem funcionou)',
  (((tInc.rounds || [])[0] || {}).monarchGroups || []).every((g) => (g.matches || []).length === 3));
ok('a fase NÃO está completa (controle)', W._phasesPhaseComplete(tInc) === false);
ok('⭐⭐ nenhum atalho nas Ferramentas', atalhos(detalhe(tInc)).length === 0);
ok('⭐⭐ nenhum contextual na chave', atalhos(chave(tInc)).length === 0);

console.log('\n── ⑦ nunca DOIS "Avançar de fase" dentro das Ferramentas ──');
/* ⛔ é o que a 2.1.85 corrigiu; esta leva não pode reintroduzir a segunda renderização. */
const src = require('fs').readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const renders = (src.match(/<button[^>]*window\._advanceMultiPhase\(/g) || []);
ok('tournaments.js renderiza o avanço UMA vez só (achei ' + renders.length + ')', renders.length === 1);
ok('⭐ e o HTML do sandbox tem UM só rótulo de avanço',
  (hSb.match(/Avançar de [Ff]ase/g) || []).length === 1,
  (hSb.match(/Avançar de [Ff]ase/g) || []).join(' | '));

console.log('\n── ⑧ CONTROLE VERMELHO: sem religar os grupos na montagem, o atalho some ──');
/* ⚠️ Não é leitura de fonte: é o MESMO caminho, com a porta canônica neutralizada. Se um
 * dia alguém tirar a hidratação de `_montaPesadosQueFaltam`, ② e ③ caem — e este item
 * prova que são ELES que a cobram, e não outra coisa qualquer. */
const hidrataReal = W._hydrateMonarchGroups;
W._hydrateMonarchGroups = function (t) { return t; };            // desliga a porta
zerarStore(DONO);
const magroSbSem = comoNoBanco(torneio({ id: 'tr-sb-sem', sandbox: DONO.uid }));
const tSem = await ingerirEMontar(magroSbSem);
W._hydrateMonarchGroups = hidrataReal;                            // religa antes de medir a tela
ok('montou os jogos do mesmo jeito', (((tSem.rounds || [])[0] || {}).matches || []).length === 12);
ok('⛔ mas os grupos ficaram SEM os jogos (só matchIds)',
  (((tSem.rounds || [])[0] || {}).monarchGroups || []).every((g) => !(g.matches || []).length));
ok('⛔ e por isso a fase se diz incompleta — mesmo com todo jogo decidido',
  W._phasesPhaseComplete(tSem) === false);
ok('⭐⭐ CONTROLE: o atalho NÃO nasce (é exatamente o defeito reportado)',
  atalhos(detalhe(tSem)).length === 0);

console.log(falhas === 0
  ? '\n✅ atalho-de-avancar-aparece-no-sandbox-do-dono: OK'
  : '\n❌ atalho-de-avancar-aparece-no-sandbox-do-dono: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO no teste:', e && e.stack || e); process.exit(1); });
