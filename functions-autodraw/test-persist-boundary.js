/* test-persist-boundary.js — o BOUNDARY DE ESCRITA existe no servidor?
 *
 * PORQUÊ (v1.2.25): a `drawRound` (Etapa 3 · fase B) vai PERSISTIR do servidor. O cliente
 * persiste o sorteio inicial por _commitInitialDraw → commitDrawTx → commitTournamentTx →
 * FirestoreDB.mutateTournament (firebase-db.js:297) — e ESSE é o cânone de escrita: hidrata
 * grupos Rei/Rainha, roda o mutator, recomputa denormalizados, folda os grupos e SANITIZA os
 * nomes das entradas com uid. Se o servidor gravar sem isso, doc do servidor ≠ doc do cliente
 * = exatamente o bug de duas versões que a canonização existe pra matar.
 *
 * O QUE ESTE TESTE REPRODUZ: antes desta versão `_stripStoredNamesForUidEntries` morava no
 * store.js e `_hydrateMonarchGroups` no bracket.js — NENHUM dos dois carrega em Node, nenhum
 * era vendorado. No servidor eles eram `undefined`, e como todo call site é guardado por
 * `typeof === 'function'`, a falha seria SILENCIOSA: o sorteio gravaria participants com o
 * nome de volta, furando o storage só-uid. Rodar este arquivo contra o código antigo dá
 * vermelho já na 1ª asserção.
 *
 * node test-persist-boundary.js
 */
const dc = require('./draw-core.js');
const w = dc._window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ FALHOU: ' + m); } }
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

console.log('──── 1. os helpers do boundary EXISTEM no servidor ────');
// Estes 4 são o que a drawRound precisa pra gravar igual ao cliente.
ok(typeof w._stripStoredNamesForUidEntries === 'function', '_stripStoredNamesForUidEntries alcançável (era store.js — não carrega em Node)');
ok(typeof w._hydrateMonarchGroups === 'function', '_hydrateMonarchGroups alcançável (era bracket.js — render, não vendorado)');
ok(typeof w._foldMonarchGroups === 'function', '_foldMonarchGroups alcançável');
ok(typeof w._nextOwedDrawMs === 'function', '_nextOwedDrawMs alcançável');

console.log('──── 2. o strip SANITIZA igual ao cliente (não é no-op) ────');
// _preloadDrawNames popula isto a partir de users/{uid}: só quem TEM perfil vivo entra.
w._profileNameByUid = { uA: 'Ana Lima', uB: 'Bruno Sá' };

const entradas = [
  { uid: 'uA', displayName: 'Ana Lima', name: 'Ana Lima' },
  { displayName: 'Zé Convidado' },
  { uid: 'uORF', displayName: 'Órfão Antigo' },
  { p1Uid: 'uA', p1Name: 'Ana Lima', p2Uid: 'uB', p2Name: 'Bruno Sá', displayName: 'Ana Lima / Bruno Sá' },
  { p1Uid: 'uA', p1Name: 'Ana Lima', p2Name: 'Guest Zé' },
];
const out = w._stripStoredNamesForUidEntries(entradas);

ok(!has(out[0], 'displayName') && !has(out[0], 'name'), 'conta com perfil → nome STRIPADO (display vem do users/ vivo)');
ok(out[0].uid === 'uA', 'conta com perfil → uid preservado (é a identidade)');
ok(out[1].displayName === 'Zé Convidado', 'guest sem uid → nome INTACTO (é a única identidade dele)');
// A regra do [[project_orphan_uid_entries]]: uid sem users/ + strip = o sorteio grava o uid COMO NOME.
ok(out[2].displayName === 'Órfão Antigo', 'uid ÓRFÃO (sem users/) → nome PRESERVADO');
ok(!has(out[3], 'p1Name') && !has(out[3], 'p2Name') && !has(out[3], 'displayName'), 'dupla c/ 2 perfis → nomes stripados');
ok(!has(out[4], 'p1Name') && out[4].p2Name === 'Guest Zé', 'dupla mista → stripa quem tem perfil, guarda o guest');
ok(entradas[0].displayName === 'Ana Lima', 'strip NÃO muta o original (grava cópia; sessão segue exibindo)');

console.log('──── 3. fold/hydrate são o PAR do schema Rei/Rainha (round-trip) ────');
// O jogo mora UMA vez em round.matches; o grupo guarda só matchIds. Gravar sem foldar
// duplicaria cada jogo no doc; ler sem hidratar deixaria group.matches vazio.
const m1 = { id: 'm1', p1: 'A / B', p2: 'C / D' };
const m2 = { id: 'm2', p1: 'A / C', p2: 'B / D' };
const doc = { rounds: [{ matches: [m1, m2], monarchGroups: [{ name: 'Grupo 1', matches: [m1, m2] }] }] };

w._foldMonarchGroups(doc);
const g = doc.rounds[0].monarchGroups[0];
ok(!has(g, 'matches'), 'fold: group.matches REMOVIDO do payload (fonte única = round.matches)');
ok(JSON.stringify(g.matchIds) === '["m1","m2"]', 'fold: guarda só os matchIds');
ok(doc.rounds[0].matches.length === 2, 'fold: os jogos seguem UMA vez em round.matches');

w._hydrateMonarchGroups(doc);
ok(g.matches && g.matches.length === 2, 'hydrate: group.matches reconstruído');
ok(g.matches[0] === doc.rounds[0].matches[0], 'hydrate: é a MESMA REFERÊNCIA do plano (divergência impossível)');

// Legado: doc antigo com cópia embutida e resultado só na cópia → hydrate migra e funde.
const flat = { id: 'x1', p1: 'A', p2: 'B' };
const copia = { id: 'x1', p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 3 };
const legado = { rounds: [{ matches: [flat], monarchGroups: [{ name: 'G', matches: [copia] }] }] };
w._hydrateMonarchGroups(legado);
ok(flat.winner === 'A' && flat.scoreP1 === 6, 'hydrate legado: placar que só existia na cópia é FUNDIDO no plano');

console.log('\n════════════════════════════════════════');
if (fail) { console.error(`❌ persist-boundary: ${pass} ok, ${fail} falharam`); process.exit(1); }
console.log(`✅ persist-boundary: ${pass} ok, 0 falharam`);
console.log('════════════════════════════════════════');
