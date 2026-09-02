/* AVANÇAR DE FASE NÃO ENFILEIRA NINGUÉM — E NÃO INFLA OS INSCRITOS
 *
 * Relato do dono (24/ago/2026, sandbox do Confra): _"ao avançar de fase o sistema colocou em
 * lista de espera os inativos e os W.O. — que foi expressamente dito para não acontecer. O
 * código precisa estar certo... Também o número de inscritos pulou de 140 e poucos para 156.
 * Não tem como o SB na fase eliminatória ter mais gente do que a Confra real hoje."_
 *
 * DUAS CAUSAS, um mesmo caminho (a transição de fase escrevendo na fila):
 *
 * 1. QUEM LEVOU W.O. VINHA DE CARONA NA LISTA DE INATIVOS. W.O. sempre desativa
 *    (`woDeactivatedAt` + `ligaActive=false`), então `_phasePendingInactives` — que filtrava
 *    só por `ligaActive === false` — devolvia essa pessoa junto. A escolha feita para os
 *    inativos caía sobre ela e a levava pra fila: "desativado e na fila ao mesmo tempo", o
 *    estado que o cânone do W.O. chama de impossível de explicar.
 *
 * 2. A FILA RECEBIA O NOME, NÃO A ENTRADA. Quem está no elenco com uid tem o nome STRIPADO
 *    no save; `_countCompetitors` chaveia o elenco por `id:uid` e uma string por `n:nome`.
 *    Duas chaves = duas pessoas. Cada nome empurrado pra fila somava +1 aos INSCRITOS — 14
 *    nomes, 142 → 156.
 *
 * A REGRA: a fila é consequência de um ATO da pessoa (religar o toggle "Ativado"). O avanço
 * de fase decide entre MANTER a inscrição inativa e EXCLUIR definitivamente — nunca inclui
 * alguém por classificação nem enfileira.
 * [[project_wo_always_deactivates]] · [[project_sitout_vs_waitlist_canon]]
 */
const fs = require('fs'), path = require('path');
const { window: W, sandbox, load } = require('./headless');
const ROOT = path.join(__dirname, '..');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
sandbox.AppStore = { tournaments: [], currentUser: null, logAction: () => {}, sync: () => {} };
// headless.js já carrega waitlist-core + phases-engine; aqui entram os dois que faltam.
load('identity-core.js');
load('tournaments.js');
load('tournaments-draw-prep.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── avançar de fase não enfileira ninguém ────');

// ── 1. o W.O. fica FORA da resolução de inativos ─────────────────────────────────────
const t = { id: 'sb1', allowSelfDeactivation: true, participants: [
  { uid: 'u1' },                                                     // ativo
  { uid: 'u2', ligaActive: false },                                  // desativou por conta própria
  { uid: 'u3', ligaActive: false, woDeactivatedAt: '2026-08-20T10:00:00.000Z' }, // levou W.O.
  { uid: 'u4', ligaActive: false, woDeactivatedAt: '2026-08-21T10:00:00.000Z' }, // levou W.O.
] };
const pend = W._phasePendingInactives(t);
ok(pend.length === 1 && pend[0].uid === 'u2',
  'só o inativo POR ESCOLHA entra na resolução (got ' + pend.map(p => p.uid).join(',') + ')');
ok(!pend.some(p => p.woDeactivatedAt), '  → quem levou W.O. nunca entra');

// ── 2. não existe mais caminho pra fila no avanço de fase ────────────────────────────
const prep = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-draw-prep.js'), 'utf8');
ok(!/_resolvePhaseInactives = function[\s\S]{0,1400}standbyParticipants/.test(prep),
  '_resolvePhaseInactives não escreve em standbyParticipants');
ok(!/_optCard\('standby'/.test(prep), 'o painel de inativos não oferece "Lista de espera"');
ok(/_optCard\('keep'/.test(prep) && /_optCard\('remove'/.test(prep),
  '  → oferece Manter nas listas e Excluir definitivamente');
ok(!/_optCard\('include'/.test(prep) && !/Incluir na eliminatória/.test(prep),
  '  → não oferece inclusão na eliminatória');

// mesmo chamado à mão com 'standby', nada de fila (o caminho não existe)
W._findTournamentById = () => t2;
const t2 = { id: 'sb2', currentPhaseIndex: 0, allowSelfDeactivation: true, phases: [{}, {}],
  participants: [{ uid: 'x1', ligaActive: false }], standbyParticipants: [] };
W.FirestoreDB = { saveTournament: () => Promise.resolve() };
W._advanceMultiPhase = () => {};
W._resolvePhaseInactives('sb2', 'standby');
ok((t2.standbyParticipants || []).length === 0,
  'chamar com "standby" não enfileira ninguém (got ' + JSON.stringify(t2.standbyParticipants) + ')');
ok(t2._inactiveResolvedPhase === 1, '  → e a transição segue resolvida (não trava o avanço)');

// ── 3. a contagem de inscritos não infla ────────────────────────────────────────────
// O caso do sandbox: 3 pessoas no elenco (uid, nome stripado). Empurrar o NOME de uma delas
// pra fila faz o contador ver 4 pessoas — é o pulo de 142 → 156 em escala.
const tc = { participants: [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u3' }], standbyParticipants: [], waitlist: [] };
ok(W._countCompetitors(tc).people === 3, 'elenco de 3 conta 3');
tc.standbyParticipants = ['Lucia Souza'];
ok(W._countCompetitors(tc).people === 4,
  '  → (o bug, documentado) nome solto na fila conta a pessoa 2×');
tc.standbyParticipants = [];
ok(W._waitlistPushBack(tc, tc.participants[0]) === true, 'a porta canônica aceita a ENTRADA');
ok(W._countCompetitors(tc).people === 3,
  '  → e com a entrada (uid) a contagem NÃO infla (got ' + W._countCompetitors(tc).people + ')');
ok(W._waitlistPushBack(tc, { uid: 'u1' }) === false, '  → e deduplica por uid');

// ── 4. quem escreve na fila no avanço de fase usa a porta canônica ───────────────────
const eng = fs.readFileSync(path.join(ROOT, 'js', 'views', 'phases-engine.js'), 'utf8');
ok(/built\.waitlist\.forEach\(function \(tm\) \{[\s\S]{0,900}_waitlistPushBack\(t, tm\)/.test(eng),
  'storePhase empurra a ENTRADA via _waitlistPushBack (suplentes de grupo/corte)');
ok(!/_sb\.push\(nm\)/.test(eng), '  → e não empurra mais o NOME');

console.log(fail === 0
  ? '\n✅ avanco-de-fase-nao-enfileira: OK (' + pass + ')'
  : '\n❌ avanco-de-fase-nao-enfileira: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
