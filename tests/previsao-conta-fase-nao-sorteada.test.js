/* A PREVISÃO DE DURAÇÃO CONTA O TORNEIO INTEIRO — inclusive a fase não sorteada.
 *
 * 25/ago/2026, o dono cortando um desenho meu:
 *   _"errado isso de não considerar o tempo por não ter sido sorteado. Por mais que
 *    não se saiba quem ocupará os slots, sabemos que esses jogos ocorrerão, então o
 *    tempo tem que estar alocado no torneio; num torneio com tardios isso precisa
 *    ser recalculado a cada novo grupo/jogo formado considerando novo desenho de
 *    repescagens/byes."_
 *   _"isso é fundamental num torneio, principalmente de 1 dia/3 dias."_
 *
 * A FALHA QUE ISTO REPRODUZ: `_estimateTournamentMinutes` somava só os jogos JÁ
 * MATERIALIZADOS. No Confra a eliminatória ainda não foi sorteada, então entrava com
 * ZERO — a previsão dava ~9h para um torneio que dura ~12h. A pergunta que o
 * organizador faz é "cabe no dia?", e essa conta responde errado, sempre pra MENOS
 * (que é o lado caro: quadra estourada e gente esperando).
 *
 * ⚠️ Este número alimenta o "término estimado" da tela de progresso E a janela de
 * sessão de presença (tournaments-enrollment.js) — que é justamente o torneio de
 * 1 dia. Subestimar fecha a presença antes de o torneio acabar.
 */
const HARNESS = require('./render-harness');
const W = HARNESS.window;
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const fmt = (m) => { const h = Math.floor(m / 60), x = Math.round(m % 60); return h ? (h + 'h' + (x ? String(x).padStart(2, '0') : '')) : (x + 'min'); };

console.log('──── a previsão conta o torneio INTEIRO (fase não sorteada inclusa) ────');

// Torneio de 2 fases: a 1ª sorteada, a 2ª só configurada. É a forma EXATA do Confra:
// `source.qualifyMode:'all'` (todos avançam), eliminatória simples com 3º lugar.
function torneioDuasFases(jogosFase0) {
  return {
    id: 'tst', sport: 'Beach Tennis', name: 'Teste', format: 'Liga',
    gameDuration: 30, callTime: 5, warmupTime: 5, courtCount: 9,
    ligaRoundFormat: 'rei_rainha',
    participants: Array.from({ length: 32 }, (_, i) => ({ uid: 'u' + i, name: 'P' + i })),
    phases: [
      { formatCode: 'liga', format: 'Liga', name: 'Rei/Rainha', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
      { formatCode: 'elim_simples', format: 'Eliminatórias Simples', name: 'Eliminatória',
        reiRainha: false, fixedPairs: true, thirdPlace: true, grandFinal: false,
        scoring: { type: 'sets', setsToWin: 2 },
        // ⚠️ Quem o motor de fases LÊ é o `mapping` (destinos + faixas de colocação) —
        // `qualifyMode`/`qualifyTopN` são só de UI. Fase sem `mapping` planeja ZERO.
        source: { type: 'previous_phase', fromPhaseOffset: 1, qualifyMode: 'all', qualifyQuantity: 'all',
                  scope: 'overall', flatOverall: true,
                  mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' }] } }
    ],
    rounds: [{ round: 1, format: 'liga', status: 'active',
      // ⚠️ `monarchGroups` NÃO é enfeite: é por ele que o motor (prevPhaseGroups)
      // descobre quem sai da fase 1 pra fase 2. Sem isso a simulação devolve null e o
      // teste "passa" medindo zero — foi o que aconteceu na 1ª versão desta fixture.
      monarchGroups: Array.from({ length: Math.ceil(jogosFase0 / 3) }, (_, g) => ({
        name: 'R1 Grupo ' + g,
        players: ['P' + (g * 4), 'P' + (g * 4 + 1), 'P' + (g * 4 + 2), 'P' + (g * 4 + 3)],
        matchIds: [0, 1, 2].map((k) => 'm' + (g * 3 + k))
      })),
      matches: Array.from({ length: jogosFase0 }, (_, i) => ({
        id: 'm' + i, isMonarch: true, monarchGroup: Math.floor(i / 3),
        p1: 'A' + i + ' / B' + i, p2: 'C' + i + ' / D' + i })) }]
  };
}

// ── ① a fase não sorteada NÃO pode valer zero ────────────────────────────────
{
  const t = torneioDuasFases(24);
  const total = W._estimateTournamentMinutes(t);

  // O mesmo torneio SEM a 2ª fase: é essa a conta que o código antigo fazia.
  const soFase0 = JSON.parse(JSON.stringify(t));
  soFase0.phases = [soFase0.phases[0]];
  const parcial = W._estimateTournamentMinutes(soFase0);

  ok(total > parcial,
     '⛔ com a eliminatória CONFIGURADA a previsão é maior que só a classificatória (' +
     fmt(parcial) + ' → ' + fmt(total) + ')');
  ok(parcial > 0, '(e a classificatória sozinha já vale alguma coisa: ' + fmt(parcial) + ')');
}

// ── ② e o número não pode DEPENDER de a fase ter sido sorteada ───────────────
// Sortear a eliminatória não pode fazer a previsão pular: o tempo já estava alocado.
{
  const antes = torneioDuasFases(24);
  const previsaoAntes = W._estimateTournamentMinutes(antes);

  const depois = JSON.parse(JSON.stringify(antes));
  // 16 duplas classificadas → chave de 16: 15 jogos + 3º lugar = 16.
  depois.matches = Array.from({ length: 16 }, (_, i) => ({
    id: 'e' + i, phaseIndex: 1, p1: 'X' + i, p2: 'Y' + i }));
  const previsaoDepois = W._estimateTournamentMinutes(depois);

  const desvio = Math.abs(previsaoDepois - previsaoAntes) / Math.max(previsaoDepois, 1);
  ok(desvio < 0.2,
     '⭐ sortear a eliminatória NÃO muda muito a previsão (' + fmt(previsaoAntes) + ' → ' +
     fmt(previsaoDepois) + ', desvio ' + Math.round(desvio * 100) + '%) — o tempo já estava alocado');
}

// ── ③ mais inscritos ⇒ mais tempo, sem sortear nada ──────────────────────────
// É o "recalculado a cada novo grupo/jogo formado" com inscrição tardia.
{
  const pequeno = torneioDuasFases(12);
  const grande = torneioDuasFases(48);
  ok(W._estimateTournamentMinutes(grande) > W._estimateTournamentMinutes(pequeno),
     '⛔ torneio com mais jogos formados prevê mais tempo (' +
     fmt(W._estimateTournamentMinutes(pequeno)) + ' → ' + fmt(W._estimateTournamentMinutes(grande)) + ')');
}

// ── ④ no CONFRA real: a eliminatória tem que pesar ───────────────────────────
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  const t = JSON.parse(JSON.stringify(fx.tournament || fx));
  // A fixture é enxuta; devolve os campos que o documento real tem.
  t.sport = 'Beach Tennis'; t.gameDuration = 30; t.callTime = 5; t.warmupTime = 5; t.courtCount = 9;
  // A fixture foi capturada com `phases[1].source` NULL (a fase 2 ainda não estava
  // configurada). Devolve a forma real do documento — inclusive o `mapping` de duas
  // linhas (Ouro/Prata), que é o que o motor de fases realmente lê.
  if (t.phases && t.phases[1]) {
    t.phases[1].scoring = { type: 'sets', setsToWin: 2 };
    t.phases[1].thirdPlace = true;
    t.phases[1].fixedPairs = true;
    t.phases[1].source = t.phases[1].source || {
      type: 'previous_phase', fromPhaseOffset: 1, qualifyMode: 'all', qualifyQuantity: 'all',
      scope: 'overall', flatOverall: true,
      mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
                { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }]
    };
  }
  const comElim = W._estimateTournamentMinutes(t);
  const semElim = (function () { const c = JSON.parse(JSON.stringify(t)); c.phases = [c.phases[0]]; return W._estimateTournamentMinutes(c); })();
  ok(comElim > semElim,
     '⛔ Confra: a eliminatória não sorteada ENTRA na conta (' + fmt(semElim) + ' → ' + fmt(comElim) + ')');
}

// ── ⑤ ⛔ nunca cresce sem limite nem devolve lixo ────────────────────────────
{
  const t = torneioDuasFases(24);
  const v = W._estimateTournamentMinutes(t);
  ok(Number.isFinite(v) && v > 0 && v < 60 * 24 * 30,
     'o resultado é um número finito e plausível (' + fmt(v) + ')');
  ok(W._estimateTournamentMinutes({ id: 'x' }) === 0,
     'torneio vazio devolve 0 — não inventa duração');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
