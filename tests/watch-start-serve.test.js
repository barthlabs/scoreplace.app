/* "Iniciar" pelo RELÓGIO não começava a partida (relato do dono, 25/jul/2026:
 * "o início pelo relógio não aconteceu").
 *
 * A FALHA (vista AO VIVO no simulador iPhone 17 Pro + Watch Series 11 pareados):
 *   1. o relógio escolhe o 1º sacador na própria tela "Iniciar" → intent `setServer`
 *      → mas `window._liveSetServer` NÃO EXISTE ainda (o placar não abriu), então a
 *      escolha caía no vazio;
 *   2. o relógio manda `start` → `_casualStart()` abre o placar, que abre a tela
 *      "Quem saca primeiro?" no CELULAR e FICA PARADO ali esperando um toque;
 *   3. o relógio pula pro placar e mostra 0×0 — mas `serveOrder` está vazio, então
 *      não há sacador, não há bolinha no nome, e a partida não anda.
 *
 * O fix guarda a escolha feita no lobby e, no `start`, APLICA + CONFIRMA usando as
 * MESMAS funções do celular (_liveServeSelect / _liveServeConfirm) — nunca duplicando
 * regra de saque. Este teste dirige o watch-bridge.js REAL.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── watch-start-serve ────');

// Sandbox mínimo: o watch-bridge só "liga" em plataforma nativa (Capacitor).
function loadBridge(opts) {
  const calls = [];
  const win = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: { ScoreplaceWatch: { sendState: () => {}, addListener: () => {} } }
    },
    _getLiveScoreState: undefined,
    _getCasualSetupState: () => ({ canStart: true, sportName: 'Beach Tennis', isDoubles: true,
      teams: { '1': { players: ['Rodrigo', 'Jogador 2'] }, '2': { players: ['Jogador 3', 'Jogador 4'] } } }),
    _casualStart: () => {
      calls.push('casualStart');
      // O placar abre e SÓ ENTÃO estas funções passam a existir — igual no app real.
      if (!opts || !opts.neverOpens) {
        win._liveServeSelect = (t, i) => calls.push('serveSelect:' + t + ',' + i);
        win._liveServeConfirm = () => calls.push('serveConfirm');
        win._liveSetServer = (t, i) => calls.push('setServer:' + t + ',' + i);
      }
    }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'watch-bridge.js'), 'utf8');
  vm.runInContext(src, ctx);
  return { win, calls };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── 1. Fluxo do relato: escolhe sacador NO LOBBY e manda Iniciar ──────────
  const a = loadBridge();
  ok(typeof a.win.WatchBridge === 'object', 'bridge carregou em plataforma nativa');

  // lobby: _liveSetServer ainda NÃO existe (o placar não abriu)
  ok(typeof a.win._liveSetServer !== 'function', 'pré-condição: _liveSetServer não existe no lobby');
  a.win.WatchBridge.applyIntent({ type: 'setServer', team: 2, playerIdx: 1, id: 'i1' });
  ok(a.calls.length === 0, 'escolha no lobby não explode nem chama nada ainda');

  a.win.WatchBridge.applyIntent({ type: 'start', id: 'i2' });
  ok(a.calls.indexOf('casualStart') !== -1, 'start dispara _casualStart (a MESMA função do botão do celular)');
  await wait(400);

  ok(a.calls.indexOf('serveSelect:2,1') !== -1,
     '🔒 a escolha de sacador feita NO RELÓGIO é aplicada (falhava no velho: caía no vazio)');
  ok(a.calls.indexOf('serveConfirm') !== -1,
     '🔒 a tela "Quem saca primeiro?" é CONFIRMADA (falhava no velho: celular ficava parado nela)');
  ok(a.calls.indexOf('serveSelect:2,1') < a.calls.indexOf('serveConfirm'),
     'ordem: seleciona ANTES de confirmar (senão confirma o sacador errado)');

  // ── 2. Iniciar SEM escolha prévia: confirma o padrão, nunca trava ─────────
  const b = loadBridge();
  b.win.WatchBridge.applyIntent({ type: 'start', id: 'i3' });
  await wait(400);
  ok(b.calls.indexOf('serveConfirm') !== -1, 'sem escolha prévia: confirma o padrão (não trava)');
  ok(b.calls.indexOf('serveSelect:') === -1 && !b.calls.some(c => c.indexOf('serveSelect') === 0),
     'sem escolha prévia: não força seleção nenhuma');

  // ── 3. Placar que nunca abre: desiste sem estourar (sem loop infinito) ────
  const c = loadBridge({ neverOpens: true });
  c.win.WatchBridge.applyIntent({ type: 'start', id: 'i4' });
  await wait(1400);
  ok(c.calls.indexOf('serveConfirm') === -1, 'placar não abriu: nada é confirmado');
  ok(c.calls.length === 1, 'placar não abriu: desiste em silêncio (sem retry infinito)');

  // ── 4. Com o placar JÁ aberto, setServer vai direto (comportamento antigo) ─
  const d = loadBridge();
  d.win.WatchBridge.applyIntent({ type: 'start', id: 'i5' });
  await wait(400);
  const before = d.calls.length;
  d.win.WatchBridge.applyIntent({ type: 'setServer', team: 1, playerIdx: 0, id: 'i6' });
  ok(d.calls.indexOf('setServer:1,0') !== -1,
     'com placar aberto, setServer dirige _liveSetServer direto (regra de saque segue no motor)');
  ok(d.calls.length > before, 'a intenção não foi engolida');

  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ watch-start-serve FALHOU'); process.exit(1); }
  console.log('✅ watch-start-serve: OK');
})();
