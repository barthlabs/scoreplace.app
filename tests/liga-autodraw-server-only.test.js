/* O SORTEIO AGENDADO DA LIGA É DO SERVIDOR — o cliente NÃO sorteia (v1.2.11).
 *
 * FALHA CONCRETA QUE ISTO REPRODUZ (a corrida que existia em produção):
 * o poller do cliente (_checkLigaAutoDraws → _fireLigaAutoDraw) e a CF autoDraw
 * (cron 1min) faziam a MESMA coisa e disputavam o gate `lastAutoDrawAt` — quem
 * disparasse primeiro vencia. Com o app nas lojas, um binário de meses atrás no
 * aparelho do organizador podia ganhar a corrida e gerar a rodada pelo ALGORITMO
 * VELHO. Os dois lados estavam "certos", mas eram VERSÕES diferentes.
 *
 * FALHA no antigo: com uma Liga agendada e vencida, o poller GERAVA t.rounds[0].
 * PASSA no novo: o poller não toca em t.rounds — quem sorteia é a CF.
 *
 * Decisão do dono (jul/2026): "os cânones rodam em CF, disparados pelo app — assim
 * evita cada usuário rodar uma função diferente com app desatualizado".
 * Ver project_draw_canonization_cf / project_autodraw_server_parity.
 *
 * node tests/liga-autodraw-server-only.test.js
 */
const W = require('./render-harness').window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } }

// ── Liga agendada e VENCIDA: o slot passou e nunca foi sorteado ────────────────
function mkLigaDueForDraw() {
  const ontem = new Date(Date.now() - 86400000);
  const yyyy = ontem.getFullYear(), mm = String(ontem.getMonth() + 1).padStart(2, '0'), dd = String(ontem.getDate()).padStart(2, '0');
  const parts = [];
  for (let i = 1; i <= 8; i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  return {
    id: 'liga_due', name: 'Liga Agendada', format: 'Liga',
    creatorUid: 'uOrg', organizerEmail: 'org@x.com',
    status: 'open', participants: parts,
    drawManual: false,                       // AUTO — é o caminho da corrida
    drawFirstDate: yyyy + '-' + mm + '-' + dd, // ONTEM → slot vencido
    drawFirstTime: '19:00',
    drawIntervalDays: 7,
    ligaRoundFormat: 'standard', ligaDrawMode: 'standard',
    // lastAutoDrawAt AUSENTE → o gate do poller antigo deixaria passar e sortear
  };
}

W.AppStore.currentUser = { uid: 'uOrg', email: 'org@x.com', displayName: 'Org' };
W.AppStore.isOrganizer = function () { return true; };  // o poller só disparava p/ o org

(async function () {
  const t = mkLigaDueForDraw();
  W.AppStore.tournaments = [t];

  ok(typeof W._checkLigaAutoDraws === 'function', '_checkLigaAutoDraws existe');
  ok(!!(W._isLigaFormat && W._isLigaFormat(t)), 'o cenário É uma Liga (senão o teste não prova nada)');

  // Pré-condição: o slot está REALMENTE vencido — é isto que fazia o poller antigo sortear.
  const firstDraw = new Date(t.drawFirstDate + 'T' + t.drawFirstTime);
  ok(firstDraw < new Date(), 'o horário agendado JÁ passou (slot devido)');
  ok(!t.lastAutoDrawAt, 'nunca foi sorteado (lastAutoDrawAt ausente)');

  const roundsAntes = Array.isArray(t.rounds) ? t.rounds.length : 0;
  ok(roundsAntes === 0, 'começa sem rodadas');

  await W._checkLigaAutoDraws();

  const roundsDepois = Array.isArray(t.rounds) ? t.rounds.length : 0;

  // ── O CONTRATO ──────────────────────────────────────────────────────────────
  ok(roundsDepois === 0, 'CLIENTE NÃO SORTEOU: t.rounds continua vazio (antes: ' + roundsAntes + ', depois: ' + roundsDepois + ')');
  ok(!t.lastAutoDrawAt, 'CLIENTE NÃO tocou lastAutoDrawAt (o gate é do servidor)');
  ok(!t.standings, 'CLIENTE NÃO semeou standings');
  ok(t.status === 'open', 'CLIENTE NÃO ativou o torneio (status segue "open", veio "' + t.status + '")');

  // As funções de sorteio do cliente foram REMOVIDAS (não só desligadas) — se
  // voltarem a existir, alguém religou a corrida.
  ok(typeof W._fireLigaAutoDraw !== 'function', '_fireLigaAutoDraw NÃO existe mais no cliente');
  ok(typeof W._firePhaseLigaAutoDrawIfDue !== 'function', '_firePhaseLigaAutoDrawIfDue NÃO existe mais no cliente');

  // O MOTOR continua no cliente de propósito: render de classificação + sorteio
  // MANUAL (t.drawManual) usam _generateNextRound. Só o AGENDADO saiu.
  ok(typeof W._generateNextRound === 'function', 'o motor (_generateNextRound) SEGUE no cliente — manual e render dependem dele');
  ok(typeof W._computeStandings === 'function', '_computeStandings segue no cliente (render da classificação)');

  console.log('');
  if (fail === 0) { console.log('✅ liga-autodraw-server-only: ' + pass + ' ok, 0 falharam'); }
  else { console.error('❌ liga-autodraw-server-only: ' + pass + ' ok, ' + fail + ' FALHARAM'); process.exit(1); }
})();
