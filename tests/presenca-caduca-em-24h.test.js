/* PRESENÇA CADUCA EM 24h — EM TODO O PROGRAMA.
 *
 * ORDEM DO DONO (23/ago/2026): _"essas presenças estão inconsistentes. Uns tem presença
 * outros não e não consigo saber porque. Qualquer presença dada deveria caducar depois de
 * 24h. Isso deve resolver. Aplique isso sempre. Em todo o programa. Em torneios com rodadas
 * de mais de 24h a presença é irrelevante."_
 *
 * E, corrigindo o vocabulário que eu tinha usado: _"não existe marcação de ausência. Que
 * porra é essa. Todos estão ausentes até marcar presença, e em rodadas de mais de 24h isso
 * é irrelevante. Os jogos terão data e hora marcados."_
 *
 * O MODELO, ENTÃO: presença é sinal POSITIVO e PERECÍVEL, e é o ÚNICO estado. Ninguém é
 * marcado ausente — quem não tem presença fresca não tem presença. `t.absent` NÃO é
 * presença: é a máquina do W.O. (`_markAbsent` é o botão "Aplicar W.O."), tem vida própria
 * e NÃO caduca — este teste trava isso também, porque expirar W.O. ressuscitaria gente que
 * o organizador tirou do jogo.
 *
 * ONDE A REGRA MORA (e por que este teste cobre as duas portas): `_idMapGet` é o leitor
 * único de todo mapa por-pessoa — quem consulta UMA pessoa herda a validade de graça.
 * Quem CONTA ou ITERA o mapa (`Object.keys`, `m[u]` cru) não passa por lá; esses usam
 * `_presencaViva(t)`. Se qualquer uma das duas portas ficar de fora, metade do app segue
 * mostrando presença de ontem — que é exatamente o "uns tem, outros não" do relato.
 *
 * Roda com: node tests/presenca-caduca-em-24h.test.js
 */
const H = require('./render-harness');
const W = H.window;
// draw-decisions.js não entra no harness de render (é do painel de sorteio), mas é ele que
// tem `_entryAllInMap`/`_entryAnyInMap` — as perguntas que o SORTEIO faz sobre presença.
// Carrega no MESMO contexto pra o teste medir a função real, não uma cópia.
(function () {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'draw-decisions.js'), 'utf8'),
    W, { filename: 'draw-decisions.js' });
})();

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (obtido: ' + JSON.stringify(a) + ')'); }

const HORA = 3600 * 1000, DIA = 24 * HORA;
const agora = Date.now();
const hojeCedo = agora - 2 * HORA;
const ontem = agora - 25 * HORA;
const semanaPassada = agora - 7 * DIA;

function torneio() {
  return {
    id: 'T1', name: 'Teste', sport: 'Beach Tennis',
    participants: [
      { uid: 'uA', displayName: 'Ana' },
      { uid: 'uB', displayName: 'Bia' },
      { uid: 'uC', displayName: 'Cau' },
      { uid: 'uD', displayName: 'Dea' }
    ],
    checkedIn: { uA: hojeCedo, uB: ontem, uC: semanaPassada },
    checkedInConfirmed: { uA: hojeCedo, uB: ontem },
    absent: { uD: semanaPassada },
    matches: []
  };
}

/* ── ① a régua ────────────────────────────────────────────────────────────────────── */
(function () {
  console.log('\n① _presencaFresca — 24h de validade');
  ok(W._PRESENCA_TTL_MS === 24 * 3600 * 1000, 'a validade é 24h');
  ok(W._presencaFresca(agora) === true, 'marcada agora: vale');
  ok(W._presencaFresca(agora - 23 * HORA) === true, '23h atrás: ainda vale');
  ok(W._presencaFresca(agora - 25 * HORA) === false, '25h atrás: venceu');
  ok(W._presencaFresca(agora - 7 * DIA) === false, 'semana passada: venceu');
  ok(W._presencaFresca(null) === false, 'sem valor: não é presença');
  ok(W._presencaFresca(false) === false, 'false: não é presença');
  // formas legadas SEM carimbo de hora — não dá pra provar que são de hoje
  ok(W._presencaFresca(true) === false, 'presença gravada como `true` (legado) NÃO vale — não tem hora');
  ok(W._presencaFresca(1) === false, 'presença gravada como `1` (legado/teste) NÃO vale — não é carimbo');
  ok(W._presencaFresca(String(agora)) === true, 'carimbo em string ainda é carimbo');
})();

/* ── ② a porta de quem consulta UMA pessoa ───────────────────────────────────────── */
(function () {
  console.log('\n② _idMapGet — consulta por pessoa');
  const t = torneio();
  ok(W._idMapHas(t, t.checkedIn, { uid: 'uA' }) === true, 'quem marcou hoje: PRESENTE');
  ok(W._idMapHas(t, t.checkedIn, { uid: 'uB' }) === false, 'quem marcou há 25h: não está presente');
  ok(W._idMapHas(t, t.checkedIn, { uid: 'uC' }) === false, 'quem marcou semana passada: não está presente');
  ok(W._idMapGet(t, t.checkedIn, { uid: 'uA' }) === hojeCedo, 'e o carimbo fresco continua legível (ordenação por hora segue valendo)');
  ok(W._idMapGet(t, t.checkedIn, { uid: 'uB' }) === undefined, 'o vencido some da leitura');
  ok(W._idMapHas(t, t.checkedInConfirmed, { uid: 'uB' }) === false, 'presença CONFIRMADA também caduca');

  console.log('\n   ⛔ e o que NÃO é presença não caduca');
  ok(W._idMapHas(t, t.absent, { uid: 'uD' }) === true,
    'W.O. (t.absent) de semana passada CONTINUA valendo — não é presença, é decisão do organizador');
  t.vips = { uD: semanaPassada };
  ok(W._idMapHas(t, t.vips, { uid: 'uD' }) === true, 'VIP também não caduca');
})();

/* ── ③ a porta de quem CONTA / ITERA ─────────────────────────────────────────────── */
(function () {
  console.log('\n③ _presencaViva — quem conta o mapa');
  const t = torneio();
  eq(Object.keys(W._presencaViva(t)).sort(), ['uA'], 'só quem marcou nas últimas 24h entra na contagem');
  eq(Object.keys(W._presencaViva(t, 'checkedInConfirmed')).sort(), ['uA'], 'idem na presença confirmada');
  ok(Object.keys(t.checkedIn).length === 3,
    '⛔ e o DADO GRAVADO não é tocado — a validade é de LEITURA, não varredura que apaga (3 chaves seguem lá)');
  const copia = W._presencaViva(t);
  copia.uZ = agora;
  ok(t.checkedIn.uZ === undefined, 'o mapa devolvido é CÓPIA — escrever nele não contamina o torneio');
})();

/* ── ④ o sorteio "só entre os presentes" ─────────────────────────────────────────── */
(function () {
  console.log('\n④ _entryAllInMap / _entryAnyInMap — o que o sorteio pergunta');
  const t = torneio();
  const dupla = { p1Uid: 'uA', p2Uid: 'uB', p1Name: 'Ana', p2Name: 'Bia' };
  ok(W._entryAllInMap(t, t.checkedIn, dupla) === false,
    'dupla com um presente e um vencido NÃO está inteira presente');
  ok(W._entryAnyInMap(t, t.checkedIn, dupla) === true, 'mas alguém dela está');
  const duplaFresca = { p1Uid: 'uA', p2Uid: 'uA2', p1Name: 'Ana', p2Name: 'Ana2' };
  t.checkedIn.uA2 = hojeCedo;
  ok(W._entryAllInMap(t, t.checkedIn, duplaFresca) === true, 'dupla com os dois frescos: presente');
  t.checkedIn.uA2 = ontem;
  ok(W._entryAllInMap(t, t.checkedIn, duplaFresca) === false, 'um deles vencendo já derruba');
  ok(W._entryAnyInMap(t, t.absent, { p1Uid: 'uD', p2Uid: 'uX' }) === true,
    '⛔ e o W.O. antigo segue de pé no mesmo caminho');
})();

/* ── ⑤ o caso que o dono descreveu: torneio de mais de 24h ───────────────────────── */
(function () {
  console.log('\n⑤ Torneio com rodada de mais de 24h — a presença fica irrelevante sozinha');
  const t = torneio();
  // todo mundo marcou presença no primeiro dia; a rodada seguinte é 3 dias depois
  t.checkedIn = { uA: agora - 3 * DIA, uB: agora - 3 * DIA, uC: agora - 3 * DIA, uD: agora - 3 * DIA };
  eq(Object.keys(W._presencaViva(t)), [], 'ninguém carrega presença do primeiro dia pro terceiro');
  ok(W._idMapHas(t, t.checkedIn, { uid: 'uA' }) === false, 'e nenhuma consulta individual acha presença');
  // e no MESMO dia continua funcionando normalmente
  t.checkedIn = { uA: agora - 3 * HORA, uB: agora - 20 * HORA };
  eq(Object.keys(W._presencaViva(t)).sort(), ['uA', 'uB'], 'no mesmo dia (3h e 20h) os dois seguem presentes');
})();

console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
process.exit(falhas ? 1 : 0);
