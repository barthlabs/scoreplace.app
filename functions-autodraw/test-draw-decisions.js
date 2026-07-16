// test-draw-decisions.js — o SERVIDOR aplica as decisões do organizador ao ELENCO?
//
// REPRODUZ A FALHA REAL da v1.2.28 (por isso este teste existe): o cliente decidia
// "sem-dupla → lista de espera" e mutava o elenco SÓ EM MEMÓRIA; quem persistia era o
// delta do `_commitInitialDraw`. Trocando o commit pela CF, o delta some, o servidor lê
// o doc com o elenco VELHO e sorteia errado — 35 inscritos viraram chave de 32 com
// 14 BYEs, sem lista de espera, e os sem-dupla pareados violando a regra.
//
// O teste roda o MESMO cenário pelos dois caminhos e compara o ELENCO resultante:
//   VELHO  = servidor SEM o pacote de decisões  → tem que FALHAR (é o bug)
//   NOVO   = servidor COM o pacote de decisões  → tem que BATER com o cliente
//
// Cenário do dono: 16 duplas + 3 sem dupla → espera ⇒ 8 jogos na R1, ZERO BYE,
// zero repescagem, lista de espera preservada com os 3.
//
// node test-draw-decisions.js

const core = require('./draw-core.js');
const W = core._window;

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}

// ── Cenário: 16 duplas FORMADAS + 3 avulsos sem dupla (35 pessoas) ───────────
function mkT() {
  const parts = [];
  for (let i = 1; i <= 16; i++) {
    parts.push({
      p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i,
      displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i,
    });
  }
  for (let i = 1; i <= 3; i++) parts.push({ uid: 's' + i, displayName: 'Solo' + i, name: 'Solo' + i });
  return {
    id: 'tDec', name: 'Teste decisões', status: 'closed',
    sport: 'Beach Tennis', format: 'Eliminatórias Simples',
    enrollmentMode: 'time', teamSize: 2,
    participants: parts, waitlist: [], standbyParticipants: [],
    teamOrigins: {}, checkedIn: {}, absent: {},
    creatorUid: 'uOrg', organizerEmail: 'org@x.com',
  };
}
const clone = (t) => JSON.parse(JSON.stringify(t));

// A decisão que o organizador tomou no painel "3 sem dupla" → Lista de espera.
const DECISIONS = { solo: 'waitlist' };

// Contagem de PESSOAS (nunca `participants.length` — dupla é 2). Regra do dono.
function people(arr) {
  return (arr || []).reduce((s, p) => s + (W._entryTeamMembers(p) ? 2 : 1), 0);
}
// `t.matches` guarda a chave INTEIRA (round 1..N + 3º lugar), não só a R1 — a régua do
// dono ("8 jogos na R1") é por RODADA. Ex. 16 duplas: {1:8, 2:4, 3:2, 4:2(final+3º)}.
const r1 = (t) => (t.matches || []).filter((m) => m.round === 1 && !m.isBye && !m.isSitOut).length;
const byes = (t) => (t.matches || []).filter((m) => m.isBye).length;

console.log('\n═══ 16 duplas + 3 sem dupla → espera ═══\n');

// ── 1. VELHO: servidor sem o pacote — a falha que a v1.2.28 reverteu ─────────
console.log('VELHO (servidor sem o pacote de decisões) — deve reproduzir o bug:');
{
  const t = mkT();
  const res = core.drawInitial(t, { idStamp: 1 });
  // O servidor não soube da decisão → os 3 avulsos continuaram no elenco e o motor
  // formou dupla com eles → 18 entradas → chave de 32 → BYEs.
  ok('elenco NÃO respeita a decisão (avulsos continuam inscritos)',
     (t.waitlist || []).length === 0, 'waitlist=' + (t.waitlist || []).length + ' (0 = o bug)');
  ok('e por isso a chave sai com BYE (o sintoma relatado)',
     byes(t) > 0, 'byes=' + byes(t) + ', R1=' + r1(t) + ' (esperado 8), ok=' + (res && res.ok));
}

// ── 2. NOVO: servidor COM o pacote ───────────────────────────────────────────
console.log('\nNOVO (servidor aplica o pacote com as MESMAS funções do cliente):');
const S = mkT();
const sres = core.drawInitial(S, { idStamp: 2, decisions: DECISIONS });
{
  ok('sorteou', sres && sres.ok === true, 'reason=' + (sres && sres.reason || '—'));
  ok('R1 tem 8 jogos', r1(S) === 8, 'R1=' + r1(S));
  ok('ZERO BYE', byes(S) === 0, 'byes=' + byes(S));
  ok('lista de espera preservada com os 3 sem-dupla', (S.waitlist || []).length === 3,
     'waitlist=' + (S.waitlist || []).map((p) => p.displayName).join(','));
  ok('16 entradas na chave (32 pessoas)', S.participants.length === 16 && people(S.participants) === 32,
     'entradas=' + S.participants.length + ', pessoas=' + people(S.participants));
  ok('nenhum sem-dupla foi pareado', !S.participants.some((p) => /Solo/.test(p.p1Name || '') || /Solo/.test(p.p2Name || '')));
}

// ── 3. CLIENTE × SERVIDOR: o mesmo pacote dá o mesmo ELENCO? ─────────────────
// O cliente aplica a decisão pelo handler (_soloResolveWaitlist → _soloMoveOut); o
// servidor, pelo pacote. É a MESMA função — o elenco tem que bater entrada a entrada.
console.log('\nCLIENTE × SERVIDOR (mesmo cenário, mesma decisão):');
{
  const C = mkT();
  W._soloMoveOut(C, true); // exatamente o que _soloResolveWaitlist chama no cliente
  const Sv = mkT();
  W._applyDrawDecisions(Sv, DECISIONS);
  const key = (arr) => (arr || []).map((p) => p.displayName || p.name).sort().join('|');
  ok('participants idênticos', key(C.participants) === key(Sv.participants),
     C.participants.length + ' vs ' + Sv.participants.length);
  ok('waitlist idêntica', key(C.waitlist) === key(Sv.waitlist),
     key(C.waitlist) + ' vs ' + key(Sv.waitlist));
  ok('pessoas idênticas', people(C.participants) === people(Sv.participants),
     people(C.participants) + ' vs ' + people(Sv.participants));
}

// ── 4. Idempotência: re-aplicar o pacote não move ninguém a mais ─────────────
// A CF pode reexecutar a transação (contention do Firestore) — o pacote TEM que ser
// idempotente, senão a 2ª passada come mais gente do elenco.
console.log('\nIdempotência (a transação da CF pode reexecutar):');
{
  const t = mkT();
  W._applyDrawDecisions(t, DECISIONS);
  const p1 = t.participants.length, w1 = t.waitlist.length;
  W._applyDrawDecisions(t, DECISIONS);
  ok('2ª aplicação não muda o elenco', t.participants.length === p1 && t.waitlist.length === w1,
     p1 + '/' + w1 + ' → ' + t.participants.length + '/' + t.waitlist.length);
}

// ── 5. RESTO: 19 avulsos (dupla) → 8 duplas jogam, 3 pessoas pra espera ──────
// Núcleo _applyRemainderRemoval, método 'last' (determinístico — 'random' usa Math.random).
console.log('\nRESTO — 19 avulsos, sorteio de duplas, método "últimos inscritos":');
{
  const t = mkT();
  t.participants = [];
  for (let i = 1; i <= 19; i++) t.participants.push({ uid: 'x' + i, displayName: 'P' + i, name: 'P' + i });
  const r = W._applyRemainderRemoval(t, 'standby', 'last');
  ok('mantém 16 pessoas (8 duplas — potência de 2, sem BYE)', people(t.participants) === 16,
     'pessoas=' + people(t.participants));
  ok('manda 3 pra lista de espera', (t.waitlist || []).length === 3, 'waitlist=' + t.waitlist.length);
  ok('remove os ÚLTIMOS (P17,P18,P19)', r.removedNames === 'P17, P18, P19', r.removedNames);
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
