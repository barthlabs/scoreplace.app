// test-drawinitial.js — o SORTEIO INICIAL do servidor bate com o do cliente?
//
// draw-core.drawInitial espelha o trecho do MOTOR de generateDrawFunction
// (tournaments-draw.js:1539-1642). Este teste roda o MESMO torneio pelos dois lados e
// compara a ESTRUTURA da chave.
//
// POR QUE ESTRUTURA E NÃO O PAREAMENTO EXATO: o sorteio usa Math.random de propósito —
// duas execuções do MESMO lado já dão pareamentos diferentes. O que precisa bater é o
// FORMATO do resultado (nº de jogos, storage nativo × flat, status, flags), que é o que
// difere quando os dois lados rodam VERSÕES diferentes do motor. É esse o bug que a
// canonização mata.
//
// node test-drawinitial.js

const path = require('path');
const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

// ── CLIENTE: o render-harness carrega store.js/tournaments-draw.js/bracket.js REAIS
//    e expõe generateDrawFunction (o MESMO caminho do app). ─────────────────────────
const CW = require(path.resolve(__dirname, '..', 'tests', 'render-harness')).window;

function mkT(id, extra, n) {
  const parts = [];
  for (let i = 1; i <= (n || 8); i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  return Object.assign({
    id: id, name: 'T', status: 'open', participants: parts,
    creatorUid: 'uOrg', organizerEmail: 'org@x.com', sport: 'Beach Tennis',
  }, extra || {});
}

function structure(t) {
  const flat = Array.isArray(t.matches) ? t.matches.filter(function (m) { return !m.isBye && !m.isSitOut; }).length : 0;
  const nativeRounds = Array.isArray(t.rounds) ? t.rounds.length : 0;
  const r0 = (t.rounds && t.rounds[0] && t.rounds[0].matches) || [];
  const all = r0.length ? r0 : (Array.isArray(t.matches) ? t.matches : []);
  const real = all.filter(function (m) { return !m.isSitOut && !m.isBye; });
  // Nº de PESSOAS em cada lado do 1º jogo. É o que denuncia o bug do Confra: com a trava
  // do Rei/Rainha desligada, o pool-prep forma duplas e o gerador junta 2 duplas num lado
  // ("time de 4") — a CONTAGEM de jogos não muda, só quem joga com quem. Sem este sinal o
  // comparador é grosso demais (provado: injetei _isMon0=false e o teste passava).
  function side(m, k) {
    if (!m) return 0;
    if (Array.isArray(m['team' + k])) return m['team' + k].length;
    const s = m['p' + k];
    return (typeof s === 'string' && s) ? s.split(/\s*\/\s*/).filter(Boolean).length : (s ? 1 : 0);
  }
  return {
    storage: nativeRounds > 0 ? 'nativo(rounds)' : 'flat(matches)',
    jogosFlat: flat,
    rodadas: nativeRounds,
    jogosR0: r0.filter(function (m) { return !m.isSitOut && !m.isBye; }).length,
    // entradas APÓS o pool-prep: 8 indivíduos × 4 duplas é a diferença que importa
    entradasNoPool: Array.isArray(t.participants) ? t.participants.length : 0,
    pessoasPorLado: real.length ? [side(real[0], 1), side(real[0], 2)] : [],
    status: t.status,
    canonico: !!t._canonicalDraw,
    temStandings: !!t.standings,
    presencaLimpa: !!(t.checkedIn && Object.keys(t.checkedIn).length === 0),
  };
}

// Cenários que exercitam os ramos reais do motor.
const CASES = [
  ['Eliminatórias Simples · 8 individuais', { format: 'Eliminatórias Simples' }, 8],
  ['Eliminatórias Simples · 16 individuais', { format: 'Eliminatórias Simples' }, 16],
  ['Liga · 8 individuais (storage NATIVO)', { format: 'Liga', ligaRoundFormat: 'standard', ligaDrawMode: 'standard', drawManual: true }, 8],
  ['Liga Rei/Rainha · 8 (grupos de 4)', { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', ligaDrawMode: 'standard', drawManual: true }, 8],
  // ⚠️ O CENÁRIO DO CONFRA: Rei/Rainha num torneio de DUPLAS (teamSize 2 / inscrição time).
  // Sem a trava `_isMon0` o pool-prep forma duplas e o gerador junta 2 duplas num "time de
  // 4". O caso SEM teamSize acima NÃO exercita a trava (_ts0 já é 1 por outro caminho) —
  // provado injetando `_isMon0=false` no servidor: o teste passava. Este pega.
  ['Liga Rei/Rainha · 8 · DUPLAS (trava do Confra)', { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', ligaDrawMode: 'standard', drawManual: true, teamSize: 2, enrollmentMode: 'teams' }, 8],
  ['Dupla Eliminatória · 8', { format: 'Dupla Eliminatória' }, 8],
  ['Fase de Grupos · 8 · duplas', { format: 'Fase de Grupos', gruposCount: 2, gruposClassified: 2, teamSize: 2, enrollmentMode: 'individual' }, 8],
];

console.log('════════════════════════════════════════');
console.log('CLIENTE × SERVIDOR — estrutura da chave');
console.log('════════════════════════════════════════');

CASES.forEach(function (row) {
  const label = row[0], extra = row[1], n = row[2];

  // lado CLIENTE (generateDrawFunction real, via harness)
  const tC = mkT('C_' + label.slice(0, 6), JSON.parse(JSON.stringify(extra)), n);
  CW.AppStore.tournaments = [tC];
  CW.AppStore.currentUser = { uid: 'uOrg', email: 'org@x.com', displayName: 'Org' };
  let cliErr = null;
  try { CW.generateDrawFunction(tC.id); } catch (e) { cliErr = e.message; }

  // lado SERVIDOR (draw-core.drawInitial)
  const tS = mkT('S_' + label.slice(0, 6), JSON.parse(JSON.stringify(extra)), n);
  const res = core.drawInitial(tS);

  if (cliErr) { ok(label + ' — cliente não estourou', false, cliErr); return; }
  ok(label + ' — servidor sorteou', res.ok === true, res.ok ? undefined : JSON.stringify(res));
  if (!res.ok) return;

  const sc = structure(tC), ss = structure(tS);
  const keys = Object.keys(sc);
  const diff = keys.filter(function (k) { return JSON.stringify(sc[k]) !== JSON.stringify(ss[k]); });
  ok(label + ' — MESMA estrutura', diff.length === 0,
    diff.length === 0 ? ss.storage + ', ' + (ss.rodadas ? ss.jogosR0 + ' jogos/R0' : ss.jogosFlat + ' jogos')
      : '\n      difere em: ' + diff.map(function (k) { return k + ' cliente=' + JSON.stringify(sc[k]) + ' servidor=' + JSON.stringify(ss[k]); }).join('\n      '));
});

console.log('');
console.log('════════════════════════════════════════');
console.log('GUARDS');
console.log('════════════════════════════════════════');

// Nunca re-sortear: re-sorteio é decisão do organizador no cliente.
(function () {
  const t = mkT('já', { format: 'Eliminatórias Simples', matches: [{ id: 'm1' }] }, 8);
  const r = core.drawInitial(t);
  ok('chave já existe → recusa (already-drawn)', r.ok === false && r.reason === 'already-drawn', JSON.stringify(r));
})();

// Suíço-classificatório ainda não é canônico — não fingir que sabe.
(function () {
  const t = mkT('sw', { format: 'Eliminatórias Simples', p2Resolution: 'swiss' }, 8);
  const r = core.drawInitial(t);
  ok('p2Resolution=swiss → recusa (swiss-not-canonical)', r.ok === false && r.reason === 'swiss-not-canonical', JSON.stringify(r));
})();

// O sorteio LIMPA a presença (v4.1.30).
(function () {
  const t = mkT('pres', { format: 'Eliminatórias Simples', checkedIn: { uA: 1 }, absent: { uB: 1 } }, 8);
  const r = core.drawInitial(t);
  ok('sorteio limpa presença (checkedIn/absent)', r.ok && Object.keys(t.checkedIn).length === 0 && Object.keys(t.absent).length === 0);
})();

console.log('');
console.log('════════════════════════════════════════');
if (fail === 0) { console.log('✅ drawInitial: ' + pass + ' ok, 0 falharam'); }
else { console.log('❌ drawInitial: ' + pass + ' ok, ' + fail + ' FALHARAM'); process.exit(1); }
