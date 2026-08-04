// test-result-playthrough.js — JOGAR O TORNEIO INTEIRO pelo caminho NOVO, até o campeão.
//
// Os testes de autorização (test-result-core.js) provam quem PODE lançar. Este prova que,
// lançando SÓ pela CF, o torneio anda: vencedor avança, a chave fecha, sai campeão e não
// sobra jogo pendente. É o "jogar até o campeão antes de subir" — o motor de resultado é o
// caminho mais quente do app e o dono já cobrou não quebrá-lo mais de uma vez.
//
// Roda 100% no SERVIDOR (drawInitial + result-core), sem Firestore: o que está sob teste é
// a lógica que a CF executa dentro da transação, não o transporte.
//
// node test-result-playthrough.js

const draw = require('./draw-core.js');
const rcore = require('./result-core.js');
const win = rcore._window;

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? '  → ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? '  → ' + got : '')); }
}

const ORG = { uid: 'uOrg', email: 'org@x.com' };

function mkT(n, extra) {
  const parts = [];
  for (let i = 1; i <= n; i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  return Object.assign({
    id: 'tour_play', name: 'Play', status: 'open', participants: parts,
    creatorUid: ORG.uid, organizerEmail: ORG.email, sport: 'Beach Tennis',
    enrollmentMode: 'individual', teamSize: 1,
    resultEntry: 'organizer', history: []
  }, extra || {});
}

// Jogos REAIS ainda sem resultado (BYE/folga não contam — não se lança placar neles).
function pendentes(t) {
  const all = (typeof win._collectAllMatches === 'function') ? win._collectAllMatches(t) : [];
  return all.filter(function (m) {
    if (!m || m.isBye || m.isSitOut) return false;
    if (m.winner) return false;
    const a = m.p1, b = m.p2;
    if (!a || !b) return false;
    if (a === 'TBD' || b === 'TBD') return false;
    if (String(a).indexOf('BYE') === 0 || String(b).indexOf('BYE') === 0) return false;
    return true;
  });
}

console.log('\n──── play-through: eliminatória de 8, lançando SÓ pelo servidor ────');
{
  const t = mkT(8, { format: 'Eliminatórias Simples' });
  const d = draw.drawInitial(t, { idStamp: 1 });
  ok('sorteio inicial ok', d && d.ok, d && (d.reason || 'ok'));

  let voltas = 0, lancados = 0;
  // O laço para sozinho quando não há mais jogo jogável. Teto alto só como rede contra
  // laço infinito — se estourar, é bug de avanço (jogo que nunca fecha).
  while (voltas < 60) {
    const p = pendentes(t);
    if (!p.length) break;
    voltas++;
    p.forEach(function (m, i) {
      const r = rcore.applyResult(t, {
        matchId: m.id, actor: ORG, now: 1000 + lancados,
        payload: { s1: (i % 2 === 0) ? 6 : 3, s2: (i % 2 === 0) ? 3 : 6, useSets: false },
        logMessage: 'placar ' + m.id
      });
      if (r.ok && r.outcome === 'applied') lancados++;
      else ok('lançamento aceito em ' + m.id, false, JSON.stringify(r));
    });
  }
  ok('laço terminou sozinho (sem teto)', voltas < 60, 'voltas=' + voltas);
  // 8 participantes = 4 quartas + 2 semis + 1 final + 1 disputa de 3º = 8 jogos.
  // A disputa de 3º é SEMPRE gerada ([[project_third_place_always]]) — foi este teste que
  // me corrigiu: eu tinha escrito 7 supondo só a escada.
  ok('lançou 8 jogos (7 da escada + 3º lugar)', lancados === 8, 'lancados=' + lancados);
  ok('não sobrou jogo pendente', pendentes(t).length === 0, 'pendentes=' + pendentes(t).length);

  // Campeão = vencedor da FINAL. A disputa de 3º tem o mesmo `round` da final mas é jogo de
  // COLOCAÇÃO, não degrau da escada — por isso é excluída por isThirdPlace, nunca por round.
  const all = win._collectAllMatches(t).filter(function (m) { return m && m.winner && !m.isBye && !m.isSitOut; });
  const maxR = all.reduce(function (a, m) { return Math.max(a, (m.round || 0)); }, 0);
  const terceiro = all.filter(function (m) { return (m.round || 0) === maxR && m.isThirdPlace; });
  const finais = all.filter(function (m) { return (m.round || 0) === maxR && !m.isThirdPlace; });
  ok('disputa de 3º existe e foi decidida', terceiro.length === 1, 'terceiro=' + terceiro.length);
  ok('existe exatamente UMA final', finais.length === 1, 'finais=' + finais.length);
  const campeao = finais.length ? finais[0].winner : null;
  ok('saiu CAMPEÃO', !!campeao && campeao !== 'TBD' && String(campeao).indexOf('BYE') !== 0, String(campeao));
  ok('campeão ≠ vencedor do 3º lugar', !terceiro.length || campeao !== terceiro[0].winner,
     campeao + ' vs ' + (terceiro[0] && terceiro[0].winner));

  // Nenhum slot ficou órfão (TBD num jogo que já tem vencedor = avanço quebrado).
  const orfaos = all.filter(function (m) { return m.p1 === 'TBD' || m.p2 === 'TBD'; });
  ok('nenhum jogo decidido com slot TBD', orfaos.length === 0, 'orfaos=' + orfaos.length);

  // O histórico registrou cada lançamento (é o que a CF grava dentro da txn).
  ok('histórico registrou os lançamentos', (t.history || []).length >= 7, 'entradas=' + (t.history || []).length);
}

console.log('\n──── play-through: participante lança e o adversário confirma ────');
{
  const t = mkT(4, { format: 'Eliminatórias Simples', resultEntry: 'players',
                     phases: [{ name: 'Fase 1', resultEntry: 'players' }] });
  const d = draw.drawInitial(t, { idStamp: 2 });
  ok('sorteio ok', d && d.ok);

  const p = pendentes(t);
  ok('há jogo pra lançar', p.length >= 1, 'pendentes=' + p.length);
  const m = p[0];
  const u1 = (win._slotUids(m, 'p1') || [])[0];
  const u2 = (win._slotUids(m, 'p2') || [])[0];
  ok('os dois lados têm uid', !!u1 && !!u2, u1 + ' vs ' + u2);

  // Lado 1 propõe → pending (não decide).
  const r1 = rcore.applyResult(t, { matchId: m.id, actor: { uid: u1 }, now: 10,
    payload: { s1: 6, s2: 4, useSets: false, pending: { scoreP1: 6, scoreP2: 4 } } });
  ok('participante propõe → pending', r1.ok && r1.outcome === 'pending', JSON.stringify(r1));
  ok('jogo ainda sem vencedor', !win._findMatch(t, m.id).winner);

  // Lado 2 NÃO pode sobrescrever a proposta aberta.
  const r2 = rcore.applyResult(t, { matchId: m.id, actor: { uid: u2 }, now: 11,
    payload: { s1: 4, s2: 6, useSets: false } });
  ok('adversário não sobrescreve', r2.ok === false && r2.reason === 'pending-other-side', JSON.stringify(r2));

  // Organizador fecha (é a autoridade) → aplica de verdade.
  const r3 = rcore.applyResult(t, { matchId: m.id, actor: ORG, now: 12,
    payload: { s1: 6, s2: 4, useSets: false } });
  ok('organizador aplica', r3.ok && r3.outcome === 'applied', JSON.stringify(r3));
  const mm = win._findMatch(t, m.id);
  ok('vencedor definido', !!mm.winner && mm.winner !== 'TBD', String(mm.winner));
  ok('pendingResult limpo', !mm.pendingResult);
}

console.log('\n' + pass + ' asserts OK, ' + fail + ' falha(s)');
if (fail) { console.log('❌ result-playthrough: FALHOU'); process.exit(1); }
console.log('✅ result-playthrough: OK');
