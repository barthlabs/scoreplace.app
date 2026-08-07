// test-integrate-late.js — INTEGRAÇÃO DE TARDIOS no SERVIDOR (draw-core.integrateLateEntries).
//
// O cliente rodava _createExtraGamesFromWaitlist / _integrateLateDuplas / _expandMonarch-
// FromWaitlist em bracket.js ao abrir o bracket. A v1.2.57 move a sistemática pro servidor:
// draw-core.integrateLateEntries roda as MESMAS funções vendoradas sobre o doc. Este teste
// dirige a entrada do servidor direto (como test-drawinitial dirige drawInitial):
//   • Eliminatória Simples de DUPLAS + 2 duplas pré-formadas tardias → changed=true, 1 jogo novo;
//   • sem tardio → changed=false (idempotente, a CF não grava).
//
// node functions-autodraw/test-integrate-late.js

const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b };
}
function latePair(a, b) { return Object.assign(pair(a, b), { _lateJoin: true }); }

// Eliminatória Simples de DUPLAS: 4 duplas iniciais → R1 (2 jogos) + final TBD.
function mkSingleElim() {
  const A = pair('A1', 'A2'), B = pair('B1', 'B2'), C = pair('C1', 'C2'), D = pair('D1', 'D2');
  return {
    id: 'SE-cf', name: 'T', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
    lateEnrollment: 'expand', currentPhaseIndex: 0, status: 'active',
    creatorUid: 'uOrg', organizerEmail: 'org@x.com',
    participants: [A, B, C, D],
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
    // Chave montada pelo MOTOR REAL (chaves.js), com ids ESTRUTURAIS e seeds — é o
    // que a produção passa a ter. A fixture antiga era feita à mão ('m1','m2','mf',
    // sem p1Seed): nesse formato o recálculo não consegue derivar a ordem do sorteio
    // e, corretamente, não mexe na chave.
    matches: core._window._chavesAdapter
      .build(4, 'simples', { participantes: [A, B, C, D], ns: 'p0' }).matches,
  };
}
const R1 = (t) => (t.matches || []).filter((m) => m && m.round === 1);

// ── 2 duplas pré-formadas tardias → integra no servidor ─────────────────────
(function () {
  const t = mkSingleElim();
  t.standbyParticipants = [latePair('LA', 'LB'), latePair('LC', 'LD')];
  // Presença é POR MEMBRO (uid), nunca pelo nome COMBINADO da dupla — o nome combinado
  // não existe em `checkedIn` na produção, e o coletor canônico (_collectLateCandidates)
  // rejeita de propósito. A fixture antiga marcava 'LA / LB' e por isso as duplas nem
  // chegavam a ser coletadas. Ver [[project_late_dupla_fills_awaiting_slot]].
  t.checkedIn = { la: 1, lb: 1, lc: 1, ld: 1 };
  const before = R1(t).length;

  const res = core.integrateLateEntries(t, {});
  ok('res.ok', !!(res && res.ok), res && res.reason);
  ok('changed=true (integrou)', res && res.changed === true, res && res.changed);
  // `placed` é o contador do caminho novo (recálculo). `extra` era do
  // _createExtraGamesFromWaitlist, que foi removido junto com a cirurgia.
  ok('placed=2 (as 2 duplas tardias entraram)', res && res.placed === 2, res && res.placed);
  ok('R1 cresceu', R1(t).length > before, before + '→' + R1(t).length);
  const temJogo = (dn) => (t.matches || []).some((m) =>
    (m.p1 === dn || m.p2 === dn) && m.p1 !== 'TBD' && m.p2 !== 'TBD' && !/BYE/.test(String(m.p1)) && !/BYE/.test(String(m.p2)));
  ok('LA / LB tem jogo de verdade', temJogo('LA / LB'));
  ok('LC / LD tem jogo de verdade', temJogo('LC / LD'));
  const inParts = (dn) => (t.participants || []).some((p) => (p && (p.displayName || p.name)) === dn);
  ok('duplas viraram inscritas', inParts('LA / LB') && inParts('LC / LD'));
  // repFill deixou de existir: a repescagem virou ESTRUTURAL (decidida no desenho,
  // não por ranqueamento posterior). Ver tests/repechage.test.js.
  ok('sem repFill pendente (repescagem é estrutural agora)',
    !(t.matches || []).some(function (m) { return m.repFill && m.repFill.length; }), true);
  ok('saíram da Lista de Espera',
    !(t.standbyParticipants || []).some(function (p) { return /^L/.test(String(p && p.p1Name || '')); }));
})();

// ── idempotente: sem tardio → changed=false (a CF não grava) ─────────────────
(function () {
  const t = mkSingleElim();
  const res = core.integrateLateEntries(t, {});
  ok('sem tardio: ok', !!(res && res.ok));
  ok('sem tardio: changed=false', res && res.changed === false, res && res.changed);
  ok('sem tardio: R1 intacta (2 jogos)', R1(t).length === 2, R1(t).length);
})();

// ── sem chave ainda → recusa (no-bracket) ───────────────────────────────────
(function () {
  const t = mkSingleElim(); t.matches = [];
  const res = core.integrateLateEntries(t, {});
  ok('sem chave: ok=false reason=no-bracket', res && res.ok === false && res.reason === 'no-bracket', res && res.reason);
})();

// ── A VARREDURA FORMA GRUPO SOZINHA E AVISA OS ENVOLVIDOS (v1.7.61/62) ──────────
// Ordem do dono: _"automatize… sem eu precisar ficar dando prompts"_ e _"toda vez que
// criar grupo novo precisa disparar notificação para os envolvidos"_.
//
// MEDIDO — por que virou prompt: o único gatilho era do CLIENTE, rodava só quando o
// ORGANIZADOR abria a chave, e no Confra a callable foi chamada pela última vez com 3 na
// fila; ela chegou a 4 e nada mais rodou. Este bloco é VARREDURA DE FIAÇÃO: garante que o
// disparo mora no agendador (não numa tela) e que o aviso usa os MESMOS canais do sorteio
// automático — se alguém remover a chamada, fica vermelho.
(() => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('a formação da espera existe no servidor', src.includes('async function _formarGruposDaEspera'));
  ok('e é chamada pela varredura agendada (não por uma tela)',
     /autoDrawReconcile[\s\S]{0,4000}_formarGruposDaEspera\(doc\)/.test(src));
  const corpo = src.slice(src.indexOf('async function _formarGruposDaEspera'),
                          src.indexOf('exports.autoDrawReconcile'));
  ok('só toca Rei/Rainha (o formato que a fila serve)', corpo.includes("ligaRoundFormat !== 'rei_rainha'"));
  ok('nem carrega perfil sem 4 na fila (custo zero no caso comum)', corpo.includes('_fila < 4'));
  ok('resolve nome e gênero por uid ANTES do motor', corpo.includes('_preloadDrawNames(') && corpo.includes('_enrichParticipantsFromProfiles('));
  ok('persiste dentro de transação com write-boundary', corpo.includes('runTransaction') && corpo.includes('_applyWriteBoundary'));
  ok('best-effort por torneio (um doc ruim não derruba a varredura)', corpo.includes('catch'));
  ok('avisa depois de formar', corpo.includes('_avisarGrupoFormado('));

  const aviso = src.slice(src.indexOf('async function _avisarGrupoFormado'),
                          src.indexOf('async function _formarGruposDaEspera'));
  ok('o aviso é in-app na coleção canônica', aviso.includes("collection('notifications')"));
  ok('e e-mail pela MESMA fila do resto do app', aviso.includes('_queueDrawEmail('));
  ok('e-mail FORA do gate de notifyPlatform (opt-outs independentes)',
     aviso.indexOf('_queueDrawEmail(') > aviso.indexOf('notifyPlatform !== false') &&
     !/notifyPlatform !== false[\s\S]*?_queueDrawEmail\([\s\S]*?\n      \}/.test(aviso));
  ok('avisa só quem NASCEU no grupo novo, não a rodada inteira', aviso.includes('novos'));
  ok('a mensagem é personalizada (cada um lê "você")', aviso.includes('você está no'));
  ok('identidade dos avisados é o UID', aviso.includes('g.uids') && aviso.includes("String(uids[i])"));
})();

console.log('\n════════════════════════════════════════');
console.log((fail === 0 ? '✅' : '❌') + ` integrateLateEntries: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
