/* O "✏️ EDITAR" DO CARD NÃO PODE MORRER CALADO (leva 2.1.99)
 *
 * Relato do dono (02/set/2026): _"o botao editar no card do torneio nao esta funcionando"_.
 *
 * ⛔ MEDIDO EM PRODUÇÃO, em carga limpa da página: `window.openEditTournamentModal` vinha
 * `undefined`; o `typeof` dentro de `openEditModal` engolia; o clique não fazia NADA — sem
 * erro no console, sem Sentry. Depois de rodar `_garanteModal('modal-create-tournament')`
 * na mesma aba, a função passava a existir e o botão funcionava.
 *
 * A CAUSA: `openEditTournamentModal` (e outras 177 funções) nascem DENTRO de
 * `setupCreateTournamentModal`. A 2.0.84 tirou o `#modal-create-tournament` do arranque —
 * ele passou a ser montado sob demanda pela porta única `_garanteModal` (js/ui.js), porque
 * 76% do documento era janela que ninguém abriu. O ganho foi real; o efeito colateral é que
 * TODA porta de fora do formulário passou a depender de o modal já existir.
 * Quem tivesse aberto "criar torneio" antes via o Editar funcionar; quem não, não — daí
 * parecer intermitente, que é o relato mais caro de diagnosticar que existe.
 *
 * ⚠️ ESTE TESTE GUARDA AS DUAS METADES, e a segunda é a que importa a longo prazo:
 *   ① montar o modal antes de chamar (pela porta única, sem reimplementar);
 *   ② se ainda assim faltar, FALAR. Silêncio foi o que fez o defeito sobreviver.
 */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── "Editar" do card monta o modal antes ────');

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* Sandbox mínima: só o suficiente para o trecho de `tournaments.js` que define
 * `openEditModal` rodar. Não se carrega o app inteiro — o que está em teste é a PORTA. */
function cenario(opts) {
  const W = {};
  W.window = W;
  const chamado = { garante: [], editar: [], notificou: [], sentry: [] };
  W.showNotification = (t, m) => chamado.notificou.push(t + ' | ' + m);
  W._captureMessage = (m, n) => chamado.sentry.push(n + ': ' + m);
  /* a porta única: montar o modal DEFINE openEditTournamentModal — é exatamente o que
   * `setupCreateTournamentModal` faz no app real. */
  W._garanteModal = (id) => {
    chamado.garante.push(id);
    if (opts.montarFunciona && id === 'modal-create-tournament') {
      W.openEditTournamentModal = (tid) => chamado.editar.push(tid);
    }
  };
  if (opts.jaMontado) W.openEditTournamentModal = (tid) => chamado.editar.push(tid);
  if (opts.semGarante) delete W._garanteModal;

  // extrai e roda SÓ o bloco real do arquivo — nada de réplica
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
  const ini = src.indexOf('window.openEditModal = function');
  const fim = src.indexOf('window.editModalSetupDone = true;', ini);
  const bloco = src.slice(ini, fim);
  vm.createContext(W);
  vm.runInContext(bloco, W, { filename: 'openEditModal' });
  return { W, chamado };
}

// ── ① O CASO DO RELATO: modal ainda não montado ──────────────────────────────
const a = cenario({ montarFunciona: true });
ok(typeof a.W.openEditTournamentModal === 'undefined', '① parte-se do estado real: a função ainda NÃO existe');
a.W.openEditModal('tour_1');
ok(a.chamado.garante.indexOf('modal-create-tournament') !== -1,
   '① ⭐ manda montar o modal pela porta única `_garanteModal`');
ok(a.chamado.editar.length === 1 && a.chamado.editar[0] === 'tour_1',
   '① ⭐ e ABRE a edição do torneio certo — era isto que não acontecia');
ok(a.chamado.notificou.length === 0, '① sem alarme falso quando deu certo');

// ── ② quem já tinha o modal montado segue funcionando (sem regressão) ────────
const b = cenario({ jaMontado: true, montarFunciona: false });
b.W.openEditModal('tour_2');
ok(b.chamado.editar.length === 1 && b.chamado.editar[0] === 'tour_2',
   '② já montado: abre igual, sem depender do que a montagem faz');

// ── ③ ⛔ SE FALTAR MESMO ASSIM, FALA — silêncio foi a doença ─────────────────
const c = cenario({ montarFunciona: false });
c.W.openEditModal('tour_3');
ok(c.chamado.editar.length === 0, '③ não inventa: sem a função, não abre nada');
ok(c.chamado.notificou.length === 1, '③ ⭐ mas AVISA o usuário, em vez de não fazer nada');
ok(c.chamado.sentry.length === 1 && /error/.test(c.chamado.sentry[0]),
   '③ ⭐ e registra pra quem mantém — um botão morto tem de aparecer em algum lugar');

// ── ④ ambiente sem a porta única não derruba o clique ───────────────────────
const d = cenario({ semGarante: true, jaMontado: true });
let explodiu = false;
try { d.W.openEditModal('tour_4'); } catch (e) { explodiu = true; }
ok(!explodiu && d.chamado.editar.length === 1,
   '④ sem `_garanteModal` (ordem de carga), ainda abre — o try/catch não vira armadilha');

// ── ⑤ a fonte continua usando a porta única, não uma cópia ──────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const bloco = src.slice(src.indexOf('window.openEditModal = function'),
                        src.indexOf('window.editModalSetupDone = true;'));
ok(/_garanteModal\('modal-create-tournament'\)/.test(bloco),
   '⑤ chama `_garanteModal` — quem reimplementar a montagem aqui cria a segunda verdade');
ok(!/setupCreateTournamentModal\s*\(/.test(bloco),
   '⑤ e NÃO chama o setup direto: a porta única é quem decide se precisa montar');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
