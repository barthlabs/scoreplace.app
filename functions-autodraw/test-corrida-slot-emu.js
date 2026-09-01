/* test-corrida-slot-emu.js — A CORRIDA DE VERDADE: manual × automático no MESMO slot,
 * disputada no Firestore Emulator.   node functions-autodraw/test-corrida-slot-emu.js
 *
 * ⛔ POR QUE ESTE ARQUIVO EXISTE, e por que o outro teste NÃO BASTAVA.
 * `test-autodraw-dividido.js` prova a trava com um MODELO EM MEMÓRIA: chama
 * `reivindicarSlot` duas vezes no mesmo objeto e vê a segunda falhar. Isso prova a REGRA,
 * não o MECANISMO — e o mecanismo é o que importa aqui, porque quem impede a segunda
 * gravação em produção não é o `if` do módulo, é a TRANSAÇÃO do Firestore: dois caminhos
 * leem o mesmo documento ao mesmo tempo, os dois acham que podem, um commita, e o servidor
 * ABORTA o outro e o re-executa — e é na re-execução, lendo a marca já gravada, que o
 * perdedor desiste. Um modelo em memória não tem abort, não tem retry e não tem servidor:
 * ele testa AO REDOR do bug. Mesma lição de [[project_concurrency_safe_saves]] e de
 * [[feedback_a_trava_vale_onde_mora_a_verdade]] — trava só vale onde mora a verdade.
 *
 * O QUE ESTE ARQUIVO PROVA, contra o emulador REAL, repetindo a corrida N vezes:
 *   ① exatamente UMA das duas transações vence;
 *   ② `drawSlotAt` no banco é o slot disputado;
 *   ③ UMA rodada persistida — zero jogo duplicado;
 *   ④ a agenda avançou UMA única vez (contador `_avancos`);
 *   ⑤ o retry do VENCEDOR não duplica;
 *   ⑥ o perdedor não gravou NADA;
 *   ⑦ e nas duas ordens sequenciais (manual→auto e auto→manual) o segundo não gera.
 * Mais a asserção ESTRUTURAL de que os caminhos reais (`drawRound`, `closeRound`,
 * `autoDraw`) reivindicam o slot DENTRO de `db.runTransaction` e persistem por
 * `_gravaTorneio`.
 *
 * ⚠️ A BARREIRA É O QUE TORNA A CORRIDA REAL. Sem ela, uma transação pode commitar antes
 * de a outra ler, e aí não há disputa nenhuma — o teste passaria sem testar. A barreira
 * segura as duas DEPOIS do read e antes do write, só na primeira tentativa; no retry ela
 * já está aberta, que é exatamente o caminho que o Firestore percorre.
 *
 * Pré-requisitos: firebase CLI e Java (o próprio arquivo sobe e derruba o emulador).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const AQUI = __dirname;
const RAIZ = path.join(AQUI, '..');
const PORT = 8097;                 // 8080=concurrency · 8098/8099=rules — este é só nosso
const PROJECT = 'demo-scoreplace';
const CORRIDAS = 12;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* ── PARTE 1 · ESTRUTURAL (não precisa de emulador) ───────────────────────────────────
 * A corrida abaixo prova a SEMÂNTICA da trava. Esta parte prova que os caminhos de
 * PRODUÇÃO usam essa trava no lugar certo — dentro da transação que grava a rodada. Sem
 * ela, a prova de concorrência valeria pra um código que ninguém chama. */
console.log('\n① os caminhos REAIS reivindicam o slot DENTRO da transação\n');
{
  const src = fs.readFileSync(path.join(AQUI, 'index.js'), 'utf8');
  const corpo = (nome, fim) => {
    const i = src.indexOf(nome);
    if (i < 0) return '';
    const j = fim ? src.indexOf(fim, i + 10) : -1;
    return src.slice(i, j > i ? j : Math.min(src.length, i + 20000));
  };

  const auto = corpo('exports.autoDraw = onSchedule', '\nasync function _autoDrawIncrementalPhaseRound');
  ok(auto.length > 500, 'achei o corpo de exports.autoDraw');
  ok(/db\.runTransaction\(/.test(auto), 'autoDraw abre db.runTransaction');
  ok(/reivindicarSlot\(/.test(auto), 'autoDraw reivindica o slot');
  ok(auto.indexOf('reivindicarSlot(') > auto.indexOf('db.runTransaction('),
    '⭐ e a reivindicação vem DEPOIS de abrir a transação (está dentro dela)');
  ok(/_gravaTorneio\(tx,/.test(auto), 'autoDraw persiste por _gravaTorneio(tx, …)');

  const dr = corpo('exports.drawRound = onCall', '\nexports.integrateLateEntries');
  ok(dr.length > 500, 'achei o corpo de exports.drawRound');
  ok(/db\.runTransaction\(/.test(dr) && /_consumirSlotAgendado\(/.test(dr),
    'drawRound consome o slot agendado e roda em transação');
  ok(dr.indexOf('_consumirSlotAgendado(') > dr.indexOf('db.runTransaction('),
    '⭐ e o consumo está DENTRO da transação');
  ok(dr.indexOf('_consumirSlotAgendado(') < dr.indexOf('_gravaTorneio(tx,'),
    '⭐ e ANTES do _gravaTorneio — mesma transação que grava a rodada');

  const cr = corpo('exports.closeRound = onCall', '\nexports.autoDraw');
  ok(cr.length > 500, 'achei o corpo de exports.closeRound');
  ok(/db\.runTransaction\(/.test(cr) && /_consumirSlotAgendado\(/.test(cr),
    'closeRound consome o slot agendado e roda em transação');
  ok(cr.indexOf('_consumirSlotAgendado(') > cr.indexOf('db.runTransaction('),
    '⭐ e o consumo está DENTRO da transação');
  ok(cr.indexOf('_consumirSlotAgendado(') < cr.indexOf('_gravaTorneio(tx,'),
    '⭐ e ANTES do _gravaTorneio');

  const helper = corpo('function _consumirSlotAgendado', '\n/* ── L6.R1 · O `nextDrawAt`');
  ok(/_agenda\.reivindicarSlot\(/.test(helper) || /reivindicarSlot\(/.test(helper),
    'e _consumirSlotAgendado usa a MESMA `reivindicarSlot` do agenda-core');
}

/* ── PARTE 2 · A CORRIDA NO EMULADOR ──────────────────────────────────────────────────
 * O driver roda DENTRO de `firebase emulators:exec`, com o Admin SDK apontado pro
 * emulador (é o mesmo SDK que a Cloud Function usa) e a `reivindicarSlot` REAL. */
const DRIVER = `
'use strict';
const admin = require(${JSON.stringify(path.join(AQUI, 'node_modules', 'firebase-admin'))});
const A = require(${JSON.stringify(path.join(AQUI, 'agenda-core.js'))});
admin.initializeApp({ projectId: ${JSON.stringify(PROJECT)} });
const db = admin.firestore();

const TZ = 'America/Sao_Paulo';
const CFG = { drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7 };
const SLOT = A.slotK(CFG, 0, TZ);
const PROX = A.slotK(CFG, 1, TZ);
const ref = db.collection('tournaments').doc('tour_corrida');

async function semear() {
  await ref.set({
    id: 'tour_corrida', format: 'Liga', status: 'active', creatorUid: 'org1',
    drawFirstDate: CFG.drawFirstDate, drawFirstTime: CFG.drawFirstTime, drawIntervalDays: 7,
    timeZone: TZ, participants: [{ uid: 'u1' }, { uid: 'u2' }],
    rounds: [], _avancos: 0, nextDrawAt: SLOT
  });
}

/* Segura as duas DEPOIS do read e antes do write — só na 1ª tentativa. No retry a
 * barreira já está aberta, que é exatamente o caminho do Firestore. */
function novaBarreira(n) {
  let chegaram = 0, aberta = false, solta;
  const p = new Promise((r) => { solta = r; });
  return { chegou: async () => { if (aberta) return; chegaram++; if (chegaram >= n) { aberta = true; solta(); } return p; } };
}

/* Um corredor = um caminho (automático ou manual). Lê, tenta reivindicar o MESMO slot e
 * grava a consequência NO MESMO documento, tudo dentro da transação. */
function corredor(quem, barreira, tentativas) {
  return db.runTransaction(async (tx) => {
    tentativas[quem] = (tentativas[quem] || 0) + 1;
    const snap = await tx.get(ref);
    const t = snap.data();
    await barreira.chegou();
    if (!A.reivindicarSlot(t, SLOT)) return { quem, venceu: false };
    t.rounds = (t.rounds || []).concat([{ round: (t.rounds || []).length + 1, por: quem,
      matches: [{ id: 'm-' + SLOT, p1: 'u1', p2: 'u2' }] }]);
    t.nextDrawAt = PROX;
    t._avancos = (t._avancos || 0) + 1;
    tx.set(ref, t);
    return { quem, venceu: true };
  });
}

(async () => {
  const out = { slot: SLOT, prox: PROX, corridas: [], retry: null, seq: [] };

  for (let i = 0; i < ${CORRIDAS}; i++) {
    await semear();
    const barreira = novaBarreira(2);
    const tentativas = {};
    const r = await Promise.all([
      corredor('auto', barreira, tentativas),
      corredor('manual', barreira, tentativas)
    ]);
    const d = (await ref.get()).data();
    const jogos = (d.rounds || []).reduce((n, x) => n + ((x.matches || []).length), 0);
    out.corridas.push({
      venceram: r.filter((x) => x.venceu).map((x) => x.quem),
      perderam: r.filter((x) => !x.venceu).map((x) => x.quem),
      drawSlotAt: Number(d.drawSlotAt),
      rodadas: (d.rounds || []).length,
      jogos: jogos,
      idsDistintos: new Set((d.rounds || []).flatMap((x) => (x.matches || []).map((m) => m.id))).size,
      avancos: d._avancos,
      nextDrawAt: Number(d.nextDrawAt),
      tentativas: tentativas
    });
  }

  // ⑤ retry do VENCEDOR: a MESMA ação de novo não pode duplicar
  {
    const antes = (await ref.get()).data();
    const b = novaBarreira(1);
    const t2 = {};
    const r = await corredor('auto', b, t2);
    const dep = (await ref.get()).data();
    out.retry = {
      venceu: r.venceu,
      rodadasAntes: (antes.rounds || []).length, rodadasDepois: (dep.rounds || []).length,
      avancosAntes: antes._avancos, avancosDepois: dep._avancos
    };
  }

  // ⑦ ordens SEQUENCIAIS: manual→auto e auto→manual
  for (const ordem of [['manual', 'auto'], ['auto', 'manual']]) {
    await semear();
    const b1 = novaBarreira(1), b2 = novaBarreira(1);
    const p = await corredor(ordem[0], b1, {});
    const s = await corredor(ordem[1], b2, {});
    const d = (await ref.get()).data();
    out.seq.push({ ordem: ordem.join('→'), primeiro: p.venceu, segundo: s.venceu,
      rodadas: (d.rounds || []).length, avancos: d._avancos, nextDrawAt: Number(d.nextDrawAt) });
  }

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.error('DRIVER EXPLODIU:', e && e.stack || e); process.exit(1); });
`;

console.log('\n② a corrida REAL no Firestore Emulator (' + CORRIDAS + ' disputas)\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spcorrida-'));
const cfg = path.join(tmp, 'firebase.json');
const drv = path.join(tmp, 'driver.js');
fs.writeFileSync(cfg, JSON.stringify({
  firestore: { rules: path.join(RAIZ, 'tests', 'concurrency', 'firestore.allow.rules') },
  emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true }
}));
fs.writeFileSync(drv, DRIVER);

let R = null;
try {
  const saida = execFileSync('firebase', [
    'emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT,
    'node ' + JSON.stringify(drv)
  ], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH })
  });
  const m = /__JSON__(\{[\s\S]*\})/.exec(saida);
  if (!m) throw new Error('driver não devolveu resultado:\n' + saida.slice(-1200));
  R = JSON.parse(m[1]);
} catch (e) {
  console.error('  ✗ o emulador não rodou: ' + ((e && e.message) || e));
  console.error('    (o teste EXIGE emulador real — não existe versão com mock desta prova)');
  process.exit(1);
}

let umVencedor = 0, umaRodada = 0, umAvanco = 0, semDuplicata = 0, slotCerto = 0, agendaCerta = 0, houveRetry = 0;
R.corridas.forEach(function (c) {
  if (c.venceram.length === 1 && c.perderam.length === 1) umVencedor++;
  if (c.rodadas === 1) umaRodada++;
  if (c.avancos === 1) umAvanco++;
  if (c.jogos === 1 && c.idsDistintos === 1) semDuplicata++;
  if (c.drawSlotAt === R.slot) slotCerto++;
  if (c.nextDrawAt === R.prox) agendaCerta++;
  if ((c.tentativas.auto || 0) + (c.tentativas.manual || 0) > 2) houveRetry++;
});
const N = R.corridas.length;

ok(N === CORRIDAS, N + ' corridas disputadas de verdade no emulador');
ok(umVencedor === N, '① exatamente UMA venceu em todas as ' + N + ' (venceram=1 & perderam=1 em ' + umVencedor + ')');
ok(slotCerto === N, '② `drawSlotAt` gravado é o slot disputado, nas ' + slotCerto + '/' + N);
ok(umaRodada === N, '③ UMA rodada persistida em ' + umaRodada + '/' + N);
ok(semDuplicata === N, '③b zero jogo duplicado (1 jogo, 1 id distinto) em ' + semDuplicata + '/' + N);
ok(umAvanco === N, '④ a agenda avançou UMA única vez em ' + umAvanco + '/' + N + ' (contador _avancos)');
ok(agendaCerta === N, '④b e parou no próximo slot de CALENDÁRIO em ' + agendaCerta + '/' + N);
ok(houveRetry > 0, '⚠️ e houve re-execução de transação de verdade em ' + houveRetry + '/' + N +
  ' corridas — é o abort do servidor, que o modelo em memória não tem');

ok(R.retry && R.retry.venceu === false, '⑤ retry do VENCEDOR não vence de novo');
ok(R.retry && R.retry.rodadasDepois === R.retry.rodadasAntes,
  '⑤b e não criou rodada nova (' + (R.retry && R.retry.rodadasAntes) + ' → ' + (R.retry && R.retry.rodadasDepois) + ')');
ok(R.retry && R.retry.avancosDepois === R.retry.avancosAntes,
  '⑥ o perdedor/retry NÃO GRAVOU NADA — _avancos intacto (' +
  (R.retry && R.retry.avancosAntes) + ' → ' + (R.retry && R.retry.avancosDepois) + ')');

R.seq.forEach(function (s) {
  ok(s.primeiro === true && s.segundo === false, '⑦ ' + s.ordem + ': o primeiro gera, o segundo NÃO');
  ok(s.rodadas === 1, '⑦b ' + s.ordem + ': uma rodada só');
  ok(s.avancos === 1 && s.nextDrawAt === R.prox, '⑦c ' + s.ordem + ': agenda avançou uma vez, pro slot seguinte');
});

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
