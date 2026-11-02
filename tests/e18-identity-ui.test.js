/* E18: a ficha e as estatísticas não atribuem identidade por nome. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const harness = require('./render-harness');
const W = harness.window;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/views/tournaments-analytics.js'), 'utf8'), harness.sandbox);

async function main() {
  const old = {
    create: W.document.createElement, get: W.document.getElementById,
    db: W.FirestoreDB, stats: W._statsEligibleTournaments,
    render: W._renderPersistentMatchStats, photo: W._profilePhotoForUid,
    user: W.AppStore.currentUser, hash: W.location.hash, box: W._boxStat,
    standings: W._computeStandings, userVivo: W._userVivo
  };
  const made = [];
  const ppoBody = { innerHTML: '' };
  W.document.createElement = function(tag) {
    const el = old.create(tag);
    made.push(el);
    return el;
  };
  W.document.getElementById = id => id === 'ppo-body' ? ppoBody : null;
  W.AppStore.currentUser = { uid: 'a', displayName: 'Alex', photoURL: 'photo://a' };
  W._profilePhotoForUid = uid => 'photo://' + uid;
  W._renderPersistentMatchStats = undefined; // expose the tournament counters in legacy metric HTML
  let metrics = {};
  W._boxStat = function(label, value, icon, accent) {
    metrics[label] = value;
    return old.box(label, value, icon, accent);
  };
  W.FirestoreDB = null;
  const match = { p1: 'Alex', p2: 'Alex', p1Uid: 'a', p2Uid: 'b', winner: 'Alex', winnerUid: 'b', scoreP1: 1, scoreP2: 6 };
  const t = { id: 'fixture', name: 'Teste E18', format: 'Eliminatórias Simples', status: 'active', teamSize: 1,
    participants: [{ uid: 'a', displayName: 'Alex' }, { uid: 'b', displayName: 'Alex' }, { displayName: 'Alex' }],
    matches: [match] };
  W._statsEligibleTournaments = () => [t];
  const modal = () => made.filter(el => typeof el.innerHTML === 'string' && el.innerHTML.includes('player-stats-persistent')).at(-1);
  try {
    W._showPlayerStats('Alex', t.id, 'a');
    const a = modal().innerHTML;
    assert(a.includes('Teste E18') && a.includes('1 torneio'), 'UID a participa do torneio');
    assert.strictEqual(metrics['Vitórias'], 0, 'UID a não herda vitória do homônimo');
    assert.strictEqual(Number(metrics['Derrotas']), 1, 'UID a perde para o outro homônimo');
    metrics = {};
    W._showPlayerStats('Alex', t.id, 'b');
    const b = modal().innerHTML;
    assert(b.includes('Teste E18') && b.includes('1 torneio'), 'UID b participa do torneio');
    assert.strictEqual(metrics['Vitórias'], 1, 'UID b vence apesar do mesmo rótulo');
    assert.strictEqual(Number(metrics['Derrotas']), 0, 'UID b não herda derrota do homônimo');
    const left = W._statsMatchSide(match, 'p1', t), right = W._statsMatchSide(match, 'p2', t);
    assert.strictEqual(W._matchWinnerSide(match), 2,
      'motor prioriza winnerUid quando os dois lados têm o mesmo rótulo');
    assert.strictEqual(W._matchWinnerSide({ p1: 'Alex', p2: 'Alex', p1Uid: 'a', p2Uid: 'a',
      winner: 'Alex', winnerUid: 'a' }), null, 'UID vencedor presente nos dois lados não escolhe primeiro');
    assert.strictEqual(W._matchWinnerSide({ p1: 'Alex', p2: 'Alex', team1Uids: ['a'], team2Uids: ['d'],
      winner: 'Alex', winnerUids: ['a', 'c'] }), null, 'dupla parcial não casa lista de vencedor');
    assert.strictEqual(W._matchWinnerSide({ p1: 'Alex', p2: 'Bia', p1Uid: 'a', p2Uid: 'b',
      winner: '', winnerUid: 'b' }), null, 'UID sem vencedor textual preserva jogo não encerrado');
    assert.strictEqual(W._matchWinnerSide({ p1: 'Ana', p2: 'Bia', winner: 'Bia', winnerUid: 'b' }), 2,
      'jogo legado sem UIDs de lado conserva vencedor textual inequívoco');
    assert.strictEqual(W._matchWinnerSide({ p1: 'Ana / Alex', p2: 'Duda / Eva',
      team1: ['Ana', 'Alex'], team2: ['Duda', 'Eva'],
      team1Uids: ['c', 'a'], team2Uids: ['d', 'e'], winner: 'Ana / Alex', winnerUid: 'a' }), 1,
      'winnerUid de um membro identifica a dupla completa');
    assert.strictEqual(W._statsWinnerSide({ score1: 2, score2: 2 }, left, right), 0,
      'placar igual jogado, sem vencedor declarado, conta empate');
    assert.strictEqual(W._statsWinnerSide({ winner: 'Alex', score1: 2, score2: 2 }, left, right), null,
      'texto ambíguo com placar igual não inventa empate');
    assert.strictEqual(W._statsWinnerSide({ winner: 'Alex', wo: true }, left, right), null,
      'WO somente por rótulo não escolhe um homônimo');
    W._showPlayerStats('Alex', t.id);
    const anonymous = modal().innerHTML;
    assert(!anonymous.includes('Teste E18'), 'nome igual sem UID não herda torneio');
    assert(!anonymous.includes('photo://a'), 'nome igual sem UID não herda foto');
    W._showPlayerStats('Alex');
    assert(!modal().innerHTML.includes('Teste E18'), 'chamada global sem UID também é neutra');
    W._showPlayerStats('Alex', null, 'a');
    assert(modal().innerHTML.includes('Teste E18') && modal().innerHTML.includes('photo://a'),
      'botões globais com UID preservam torneio e foto da conta própria');

    const candidates = W._soloPartnerCandidates([
      { uid: 'a', displayName: 'Alex' }, { uid: 'b', displayName: 'Alex' },
      { displayName: 'Alex' }, null
    ], 'a');
    assert.strictEqual(candidates.length, 2, 'seletor conserva homônimo de outro UID e manual');
    assert(candidates.some(p => p.uid === 'b') && candidates.some(p => !p.uid),
      'seletor só exclui o próprio UID');

    // Um UID parcial de uma dupla não prova a identidade do lado inteiro.
    const partial = { p1: 'Alex / Outra', p2: 'Alex', team1: ['Alex', 'Outra'], team1Uids: ['a', ''],
      p2Uid: 'b', winner: 'Alex / Outra', scoreP1: 6, scoreP2: 1 };
    assert.strictEqual(W._statsMatchSide(partial, 'p1', t).complete, false,
      'lado com UID parcial não é atribuível');
    t.matches = [partial];
    metrics = {};
    W._showPlayerStats('Alex', t.id, 'a');
    assert.strictEqual(metrics['Partidas'], 0, 'dupla com UID parcial não recebe partida');

    const complete = { p1: 'Outra / Alex', p2: 'Duda / Eva',
      team1: ['Outra', 'Alex'], team2: ['Duda', 'Eva'],
      team1Uids: ['c', 'a'], team2Uids: ['d', 'e'],
      winner: 'Outra / Alex', winnerUids: ['c', 'a'], scoreP1: 6, scoreP2: 1 };
    t.participants = [{ p1Uid: 'c', p2Uid: 'a', p1Name: 'Outra', p2Name: 'Alex' },
      { p1Uid: 'd', p2Uid: 'e', p1Name: 'Duda', p2Name: 'Eva' }];
    t.matches = [complete];
    metrics = {};
    W._showPlayerStats('Alex', t.id, 'a');
    assert.strictEqual(metrics['Partidas'], 1, 'segundo UID da dupla recebe a partida');
    assert.strictEqual(metrics['Vitórias'], 1, 'segundo UID da dupla recebe a vitória estrutural');

    // O motor REAL de Liga ainda produz linha de dupla com chave por nome e uid:null.
    // A modal conta seus jogos pelos slots estruturais sem trocar a classificação.
    t.format = 'Liga';
    t.rounds = [{ matches: [complete] }];
    t.matches = [];
    const pairRows = W._computeStandings(t);
    assert(pairRows.some(row => row.uid == null && row.key === 'Outra / Alex'),
      'fixture reproduz a linha real de dupla sem UID individual');
    metrics = {};
    W._showPlayerStats('Alex', t.id, 'a');
    assert.strictEqual(metrics['Vitórias'], 1, 'segundo membro recebe vitória pelo jogo estrutural');
    assert.strictEqual(metrics['Partidas'], 1, 'dupla é contada sem atribuição por linha de nome');
    t.participants = [{ uid: 'a', displayName: 'Alex' }, { uid: 'b', displayName: 'Alex' }];
    t.rounds = [{ matches: [match] }];
    const homonymRows = W._computeStandings(t);
    assert(homonymRows.some(row => row.uid === 'a') && homonymRows.some(row => row.uid === 'b'),
      'motor preserva as duas linhas homônimas por UID');
    assert.strictEqual(homonymRows.find(row => row.uid === 'b').wins, 1,
      'classificação real dá vitória ao UID vencedor');
    assert.strictEqual(homonymRows.find(row => row.uid === 'a').losses, 1,
      'classificação real dá derrota ao outro UID');
    metrics = {};
    W._showPlayerStats('Alex', t.id, 'b');
    assert.strictEqual(metrics['Vitórias'], 1, 'UID b recebe somente sua linha da Liga');
    assert.strictEqual(metrics['Partidas'], 1, 'UID b não soma partida do UID a');
    t.format = 'Eliminatórias Simples';

    // Históricos locais anteriores à identidade estrutural não ganham UID por nome.
    const oldV1 = W.localStorage.getItem('scoreplace_casual_history');
    const oldV2 = W.localStorage.getItem('scoreplace_casual_history_v2');
    try {
      W.localStorage.setItem('scoreplace_casual_history', JSON.stringify([
        { p1: 'Alex', p2: 'Bia', winner: 'Alex' }
      ]));
      W.localStorage.setItem('scoreplace_casual_history_v2', JSON.stringify([
        { matchType: 'casual', players: [{ name: 'Alex', team: 1 }], winnerTeam: 1 }
      ]));
      W._statsEligibleTournaments = () => [];
      W._showPlayerStats('Alex', null, 'a');
      assert(modal().innerHTML.includes('Nenhuma partida registrada ainda'),
        'histórico v1 sem playerUid não é associado por nome');
      const oldTotals = W._totaisVD(JSON.parse(W.localStorage.getItem('scoreplace_casual_history_v2')), 'a', '');
      assert.strictEqual(oldTotals.wins + oldTotals.losses, 0,
        'cache v2 sem UID não entra no contador próprio');
    } finally {
      if (oldV1 == null) W.localStorage.removeItem('scoreplace_casual_history');
      else W.localStorage.setItem('scoreplace_casual_history', oldV1);
      if (oldV2 == null) W.localStorage.removeItem('scoreplace_casual_history_v2');
      else W.localStorage.setItem('scoreplace_casual_history_v2', oldV2);
      W._statsEligibleTournaments = () => [t];
    }

    // Mesmo nome da conta logada, mas perfil manual sem UID: ficha neutra.
    W.location.hash = '#tournaments/fixture';
    W._openPlayerProfile('Alex', { tournamentId: t.id });
    assert.strictEqual(W.location.hash, '#tournaments/fixture', 'manual homônimo não abre perfil próprio');
    assert(!ppoBody.innerHTML.includes('Histórico juntos'), 'manual homônimo não herda histórico');

    let collections = [];
    W.FirestoreDB = { db: { collection(name) {
      collections.push(name);
      assert.strictEqual(name, 'usersPublic');
      return { doc(uid) { assert.strictEqual(uid, 'b'); return { get: async () => { throw new Error('permission-denied'); } }; } };
    } } };
    W._openPlayerProfile('Alex', { uid: 'b', tournamentId: t.id });
    await new Promise(setImmediate);
    assert.deepStrictEqual(collections, ['usersPublic'], 'perfil recusado não consulta users privado');
    assert.strictEqual(W.location.hash, '#tournaments/fixture', 'outro homônimo não vira perfil próprio');
    assert(!ppoBody.innerHTML.includes('photo://a'), 'perfil recusado não usa foto de homônimo');
    W._userVivo = async () => ({ uid: 'b', data: { displayName: 'Alex Novo', photoURL: 'photo://b-new' } });
    W.FirestoreDB.db.collection = name => {
      collections.push(name);
      assert.strictEqual(name, 'usersPublic');
      return { doc: uid => ({ get: async () => ({ exists: true, id: uid }) }) };
    };
    W._openPlayerProfile('Alex', { uid: 'b', tournamentId: t.id });
    await new Promise(setImmediate);
    assert.strictEqual(W._userProfileCache.b.photoURL, 'photo://b-new',
      'nome e foto atualizados ficam apenas no cache por UID');
    assert(ppoBody.innerHTML.includes('Alex Novo'), 'ficha mostra o nome novo do mesmo UID');
    process.stdout.write('✓ E18: homônimos, UID ausente, dupla parcial, conta própria e perfil recusado\n');
  } finally {
    W.document.createElement = old.create; W.document.getElementById = old.get;
    W.FirestoreDB = old.db; W._statsEligibleTournaments = old.stats;
    W._renderPersistentMatchStats = old.render; W._profilePhotoForUid = old.photo;
    W._boxStat = old.box;
    W.AppStore.currentUser = old.user; W.location.hash = old.hash;
    W._computeStandings = old.standings; W._userVivo = old.userVivo;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
