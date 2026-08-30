/* UID SEM CONTA MOSTRA O NOME GRAVADO — em vez de "…" pra sempre
 * node tests/uid-sem-conta-mostra-nome-gravado.test.js
 *
 * O QUE ACONTECEU (30/ago/2026, Confra ao vivo, print do dono). No card do jogo, a
 * Loraine Soares aparecia como "…". Medido: o uid dela (`aune9…`) NÃO tem documento em
 * `users/` — e não existe nenhuma conta "Loraine" no banco inteiro. O nome dela está
 * gravado no próprio jogo (`p1: "... / Loraine Soares"`, `team1: [..., "Loraine Soares"]`).
 * Ou seja: a tela tinha o nome à mão e mostrava reticências.
 *
 * POR QUE "…". O cânone (v4.5.63) proíbe o nome gravado como fallback: quem tem uid resolve
 * SÓ pelo perfil vivo, o span `[data-uid-name]` nasce VAZIO e o CSS pinta "…" enquanto
 * carrega (`[data-uid-name]:empty::after { content: "…" }`). A regra é boa e protege contra
 * nome velho piscando na tela — mas ela assume que o perfil EXISTE e só está atrasado.
 * Quando não existe conta nenhuma, "…" deixa de ser "carregando" e vira PARA SEMPRE.
 *
 * A DISTINÇÃO QUE FALTAVA, e que o código já tinha sem usar: `_preloadUserProfiles` grava
 * um perfil VAZIO pra uid sem doc (_"uid sem doc: entra vazio"_). Então:
 *   • cache SEM entrada  → ainda não procurei  → "…" é honesto;
 *   • cache COM entrada e displayName vazio → PROCUREI E NÃO EXISTE → o nome gravado entra.
 *
 * ⛔ POR QUE NÃO BASTA TESTAR "aparece o nome": o risco desta mudança não é ela falhar, é
 * ela funcionar DEMAIS — servir nome gravado por cima de perfil vivo (que envelhece) ou
 * durante a carga (o piscar que o cânone proíbe). Os dois casos estão travados aqui.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* recorta as duas funções REAIS do store.js — réplica é o que deixa suíte verde sobre
 * código revertido ([[feedback_green_tests_still_broken]]). */
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
function recorta(assinatura, fim) {
  const i = SRC.indexOf(assinatura);
  if (i === -1) return null;
  const j = SRC.indexOf(fim, i);
  return SRC.slice(i, j);
}
/* ⚠️ começa na declaração do MAPA, não na função: `_nomeGravadoPorUid` é criado uma linha
 * antes, e recortar só a função deixava o mapa indefinido no sandbox — o teste morria com
 * TypeError em vez de medir o que veio medir. */
const NAME_FOR_UID = recorta('window._nomeGravadoPorUid = window._nomeGravadoPorUid || {};', 'window._emailForUid');
ok(!!NAME_FOR_UID && NAME_FOR_UID.indexOf('window._nameForUid = function') !== -1,
  'achei `_nomeGravadoPorUid` + `_nameForUid` no store.js');
/* ⚠️ a marca de FIM tem que existir de verdade: `indexOf` devolve -1 quando não acha, e
 * `slice(i, -1)` recorta o ARQUIVO INTEIRO — o sandbox então tentava rodar o store todo e
 * morria em `document is not defined`, longe da causa. */
const FIM_RESOLVE = 'window._tournamentIsSameDay';
ok(SRC.indexOf(FIM_RESOLVE) !== -1, 'a marca de fim do recorte existe (senão o recorte pega o arquivo inteiro)');
const RESOLVE = recorta('window._resolveSideLive = function (t, sideStr, uidHint) {', FIM_RESOLVE);

const ctx = { window: {}, Array: Array, Object: Object, String: String, JSON: JSON, console: console };
ctx.globalThis = ctx; ctx.window._userProfileCache = {}; ctx.window._profileNameByUid = {};
vm.createContext(ctx);
vm.runInContext(NAME_FOR_UID, ctx);
const W = ctx.window;
const UID = 'aune9TtJkGcVUydoAAaZbTvXNVS2';   // o uid real da Loraine, sem conta

console.log('\n① o caso da Loraine: uid sem conta em users/\n');

// ainda não procurei → "…" é honesto
W._nomeGravadoPorUid[UID] = 'Loraine Soares';
ok(W._nameForUid(UID) === '', 'sem entrada no cache (ainda carregando) devolve VAZIO — o "…" é honesto');

// procurei e não existe → o nome gravado entra
W._userProfileCache[UID] = { displayName: '', email: '', phone: '', photoURL: '' };
ok(W._nameForUid(UID) === 'Loraine Soares', '⭐ com perfil VAZIO no cache (procurei e não existe) devolve o nome gravado');

// perfil vivo SEMPRE ganha do gravado
W._userProfileCache[UID] = { displayName: 'Loraine S. Soares' };
ok(W._nameForUid(UID) === 'Loraine S. Soares', '⛔ perfil VIVO nunca é sobrescrito pelo nome gravado (o gravado envelhece)');

// uid sem nome gravado continua devolvendo vazio
W._userProfileCache['outro'] = { displayName: '' };
ok(W._nameForUid('outro') === '', 'uid sem conta E sem nome gravado segue vazio — não invento nome');

console.log('\n② a colheita: o nome só é aprendido quando o vivo NÃO resolveu\n');

if (!RESOLVE) { ok(false, 'achei `_resolveSideLive` no store.js'); }
else {
  const ctx2 = { window: {}, Array: Array, Object: Object, String: String, JSON: JSON, console: console };
  ctx2.globalThis = ctx2; ctx2.window._userProfileCache = {}; ctx2.window._profileNameByUid = {};
  vm.createContext(ctx2);
  vm.runInContext(NAME_FOR_UID, ctx2);
  vm.runInContext(RESOLVE, ctx2);
  const W2 = ctx2.window;
  const t = { participants: [] };

  // dois slots: um com perfil vivo, outro órfão
  W2._userProfileCache['uidVivo'] = { displayName: 'Luigi Perri' };
  const saida = W2._resolveSideLive(t, 'Luigi Perri / Loraine Soares', ['uidVivo', UID]);
  ok(saida === 'Luigi Perri / Loraine Soares', 'a string do card sai completa (já saía — o "…" nascia no span, não aqui)');
  ok(W2._nomeGravadoPorUid[UID] === 'Loraine Soares', '⭐ colheu o nome do uid ÓRFÃO — é daqui que a reserva se abastece');
  ok(W2._nomeGravadoPorUid['uidVivo'] === undefined, '⛔ NÃO colheu do uid que já resolve — perfil vivo não vira rótulo gravado');

  // e agora o span daquele uid tem o que mostrar
  W2._userProfileCache[UID] = { displayName: '' };
  ok(W2._nameForUid(UID) === 'Loraine Soares', '⭐ depois da colheita + preload, a hidratação tem nome pra escrever no span');

  // não sobrescreve o que já colheu (o primeiro nome pareado vence; nada de vaivém)
  W2._resolveSideLive(t, 'Luigi Perri / Loraine S', ['uidVivo', UID]);
  ok(W2._nomeGravadoPorUid[UID] === 'Loraine Soares', 'colheita não fica trocando de nome a cada render');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exit(fail ? 1 : 0);
