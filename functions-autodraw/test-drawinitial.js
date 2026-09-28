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
const fs = require('fs');
const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

// REGRESSÃO: o contador que drawInitial devolve aparece no histórico/mensagem de
// sorteio. Quando a forma antiga não traz `roundMatchCount`, o fallback deve usar
// a mesma regra do gerador da fase: BYE e folga são marcadores, nunca jogos.
(() => {
  const server = fs.readFileSync(path.join(__dirname, 'draw-core.js'), 'utf8');
  const phaseSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'), 'utf8');
  const expected = /m && !m\.isSitOut && !m\.isBye/;
  ok('fallback do servidor exclui BYE e folga do matchCount', expected.test(server));
  ok('retorno de chave/grupo também exclui BYE e folga do matchCount',
    /_realFlatMatchCount[\s\S]{0,180}m && !m\.isSitOut && !m\.isBye/.test(server));
  ok('gerador da fase usa a mesma contagem de jogo real', expected.test(phaseSource));
})();

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

// Competição por times não é outro formato de chave: cada entrada continua uma
// dupla da sua categoria. Este guarda impede a regressão de sortear "times" antes
// de formar as duplas, ou de concentrar toda uma categoria no mesmo time.
(function () {
  function dupla(n, category) {
    return {
      displayName: 'A' + n + ' / B' + n,
      p1Uid: 'a' + n, p2Uid: 'b' + n,
      participants: [{ uid: 'a' + n }, { uid: 'b' + n }],
      category: category,
    };
  }
  const drawn = { participants: [dupla(1, 'A'), dupla(2, 'A'), dupla(3, 'A'), dupla(4, 'A')] };
  const cfg = { enabled: true, teamCount: 2, teamNames: ['Neon', 'Nightmare'], formation: 'draw', internalMatches: 'avoid', scoring: { win: 3, draw: 1, loss: 0 } };
  const assigned = core.assignCompetitionTeamsAtInitialDraw(drawn, cfg);
  const counts = drawn.participants.reduce(function (out, entry) {
    out[entry.competitionTeamId] = (out[entry.competitionTeamId] || 0) + 1; return out;
  }, {});
  ok('times sorteados só após as duplas e com IDs canônicos', assigned.ok && drawn.competitionTeams.length === 2 && Object.keys(counts).length === 2,
    JSON.stringify({ teams: drawn.competitionTeams, counts: counts }));
  ok('sorteio preserva os nomes escolhidos pelo organizador', drawn.competitionTeams[0].name === 'Neon' && drawn.competitionTeams[1].name === 'Nightmare',
    JSON.stringify(drawn.competitionTeams));
  ok('sorteio de times distribui uma categoria de forma balanceada', Object.keys(counts).every(function (id) { return counts[id] === 2; }), JSON.stringify(counts));

  const manual = { participants: [dupla(5, 'A')] };
  const rejected = core.assignCompetitionTeamsAtInitialDraw(manual, Object.assign({}, cfg, { formation: 'manual' }));
  ok('modo manual não inventa dono para dupla sem time', rejected.ok === false && rejected.reason === 'competition-teams-unassigned', JSON.stringify(rejected));

  const withoutNames = core.assignCompetitionTeamsAtInitialDraw({ participants: [dupla(6, 'A')] }, { enabled: true, teamNames: [], formation: 'draw' });
  ok('times vazios não permitem sorteio fictício', withoutNames.ok === false && withoutNames.reason === 'competition-team-names-required', JSON.stringify(withoutNames));
  const duplicateNames = core.assignCompetitionTeamsAtInitialDraw({ participants: [dupla(7, 'A')] }, { enabled: true, teamNames: ['Neon', 'neon'], formation: 'draw' });
  ok('homônimos não permitem sorteio ambíguo', duplicateNames.ok === false && duplicateNames.reason === 'competition-team-names-required', JSON.stringify(duplicateNames));

  const full = mkT('team-full', {
    format: 'Fase de Grupos', gruposCount: 1, gruposClassified: 1, teamSize: 2,
    teamCompetition: cfg,
  }, 8);
  const complete = core.drawInitial(full, { idStamp: 'team-regression' });
  const real = (full.matches || []).filter(function (m) { return m && !m.isBye && !m.isSitOut; });
  ok('sorteio completo grava times e carimba ambos os lados de todo jogo', complete.ok &&
    full.participants.every(function (entry) { return !!entry.competitionTeamId; }) &&
    real.every(function (match) { return !!match.p1CompetitionTeamId && !!match.p2CompetitionTeamId; }),
    JSON.stringify({ result: complete.ok, games: real.length }));
  ok('toggle de evitar não gera confronto entre duplas do mesmo time', real.every(function (match) {
    return match.p1CompetitionTeamId !== match.p2CompetitionTeamId;
  }), JSON.stringify(real.map(function (match) { return [match.p1CompetitionTeamId, match.p2CompetitionTeamId]; })));
})();

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

// ── Suíço como RESOLUÇÃO de pow2 (Opção B: 2 fases, mas via CF) ──────────────────────
// ÂNCORA (vermelha até o drawInitial canonizar o Suíço; ver project_draw_canonization_cf
// _phase23_deferred): a resolução 'swiss' NÃO é "vira o torneio em Suíço" — são K rodadas
// Suíço classificatórias que reduzem o elenco a uma potência de 2 e entregam pra chave.
// Modelo (espelha o ramo client-side legado tournaments-draw.js): monta 2 FASES —
// fase 0 = Suíço classificatória (K rodadas), fase 1 = a eliminatória original puxando o
// top-lo (maior pow2 ≤ N) da classificação. HOJE isso roda 100% no cliente (drawInitial
// recusa 'swiss-not-canonical'); a canonização move pra CF. REPRODUZ A FALHA: falha
// enquanto drawInitial recusa, passa quando ele monta as fases + gera a rodada 1.
(function () {
  const N = 12;                    // não-pow2 → lo=8, K=ceil(log2(12))=4
  const lo = 8, half = Math.floor(N / 2);
  const t = mkT('sw', { format: 'Eliminatórias Simples', p2Resolution: 'swiss' }, N);
  const r = core.drawInitial(t);
  ok('Suíço-pow2 → servidor sorteia (não recusa)', r.ok === true, JSON.stringify(r).slice(0, 120));
  const phases = Array.isArray(t.phases) ? t.phases : [];
  const p0 = phases[0] || {}, p1 = phases[1] || {};
  ok('Suíço-pow2 → 2 fases (classificatória + elim)', phases.length === 2, 'phases=' + phases.length);
  ok('Suíço-pow2 → fase 0 é Suíço (formatCode liga, format Suíço)',
    p0.formatCode === 'liga' && /su[ií]ç?o|swiss/i.test(String(p0.format)),
    JSON.stringify({ fc: p0.formatCode, f: p0.format }));
  ok('Suíço-pow2 → fase 0 com K≥2 rodadas', (parseInt(p0.rounds, 10) || 0) >= 2, 'rounds=' + p0.rounds);
  ok('Suíço-pow2 → fase 1 puxa top-lo (rankTo=' + lo + ')',
    !!(p1.source && p1.source.type === 'previous_phase' && p1.source.mapping &&
       p1.source.mapping[0] && p1.source.mapping[0].rankTo === lo),
    JSON.stringify(p1.source));
  ok('Suíço-pow2 → currentPhaseIndex=0', t.currentPhaseIndex === 0, 'idx=' + t.currentPhaseIndex);
  ok('Suíço-pow2 → classifyFormat=swiss', t.classifyFormat === 'swiss', String(t.classifyFormat));
  ok('Suíço-pow2 → standings com N entradas', Array.isArray(t.standings) && t.standings.length === N,
    'standings=' + (t.standings && t.standings.length));
  ok('Suíço-pow2 → rodada 1 gerada (storage nativo t.rounds)', Array.isArray(t.rounds) && t.rounds.length === 1,
    'rounds=' + (t.rounds && t.rounds.length));
  const r1 = (t.rounds && t.rounds[0] && t.rounds[0].matches) || [];
  const r1real = r1.filter(function (m) { return !m.isSitOut && !m.isBye; });
  ok('Suíço-pow2 → R1 pareia todos (~floor(N/2)=' + half + ' jogos)', r1real.length === half, 'jogos=' + r1real.length);
  ok('Suíço-pow2 → status active', t.status === 'active', String(t.status));
  ok('Suíço-pow2 → p2Resolution limpo (gatilho legado morto)', t.p2Resolution == null, String(t.p2Resolution));
  ok('Suíço-pow2 → presença limpa', !!(t.checkedIn && Object.keys(t.checkedIn).length === 0));
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
