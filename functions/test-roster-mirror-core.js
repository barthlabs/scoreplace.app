/* O ESPELHO DO ROSTER NO SERVIDOR — trava do functions/roster-mirror-core.js
 * node functions/test-roster-mirror-core.js
 *
 * Este espelho é a REDE contra perda de inscrito (incidente do Gersom, 1.7.29). Ele viveu
 * no CLIENTE até 10/ago/2026 e NUNCA funcionou lá: não existe regra pra a subcoleção
 * `tournaments/{id}/participants/{uid}`, e o Firestore nega por omissão — toda escrita
 * voltava `permission-denied` (e, como o try/catch não pega rejeição de promessa, virava a
 * issue nº1 do Sentry). Cânone do dono: tudo roda na CF, o cliente apenas dispara.
 *
 * O que este teste protege, além do óbvio:
 *  · o DELTA — 122 pessoas e uma mudança = UMA escrita, não 122 (senão derruba a quota);
 *  · quem SAI é MARCADO `left`, nunca apagado (a prova de quem saiu é o que faltou no
 *    incidente — apagar destruiria justamente o que a rede existe pra guardar);
 *  · o W.O. é MARCA separada do status (quem leva W.O. termina desativado OU na fila; um
 *    status "wo" apagaria em qual dos dois a pessoa está, que é o acionável);
 *  · identidade é o UID — inclusive os DOIS lados de uma dupla — e `monarchWaitlist`
 *    (mapa categoria→NOMES) NÃO entra, porque nome não é identidade.
 */
const { planRosterMirror, fotografar } = require('./roster-mirror-core');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const P = (uid, extra) => Object.assign({ uid, addedAt: '2026-08-01T00:00:00Z' }, extra || {});
const AT = '2026-08-10T20:00:00.000Z';
const porUid = (r) => { const o = {}; r.writes.forEach((w) => { o[w.uid] = w.doc; }); return o; };

console.log('──── espelho do roster (servidor) ────');

// ── (1) NADA MUDOU = NENHUMA ESCRITA ─────────────────────────────────────────
// É o que torna seguro rodar num gatilho que dispara em TODA escrita do torneio.
{
  const t = { participants: [P('u-a'), P('u-b')], standbyParticipants: [P('u-c')] };
  const r = planRosterMirror(t, JSON.parse(JSON.stringify(t)), AT);
  ok(r.total === 0, 'save que não mexe no roster não gera escrita nenhuma');
}

// ── (2) O DELTA: torneio grande, UMA mudança ────────────────────────────────
{
  const grande = { participants: [] };
  for (let i = 0; i < 122; i++) grande.participants.push(P('u-' + i));
  const depois = JSON.parse(JSON.stringify(grande));
  depois.participants.push(P('u-nova'));
  const r = planRosterMirror(grande, depois, AT);
  ok(r.total === 1, 'com 123 pessoas e 1 entrando, sai 1 escrita (não 123)');
  ok(r.writes[0].uid === 'u-nova' && r.writes[0].doc.status === 'enrolled',
     'e é o doc de quem entrou, com status enrolled');
}

// ── (3) O BURACO DA 1ª GRAVAÇÃO DA SESSÃO NÃO EXISTE MAIS ───────────────────
// No cliente, `if (!antes) return` fazia a 1ª gravação não escrever nada — e a inscrição
// da própria pessoa era, quase sempre, esse primeiro save. O gatilho recebe before E
// after do MESMO evento, então não há "primeira vez" cega.
{
  const antes  = { participants: [P('u-a')] };
  const depois = { participants: [P('u-a'), P('u-gersom')] };
  const r = planRosterMirror(antes, depois, AT);
  ok(r.total === 1 && r.writes[0].uid === 'u-gersom',
     'inscrição isolada é capturada na hora (era o buraco (2) do cliente)');
}

// ── (4) A ESPERA ENTRA — era o buraco (1) do cliente ────────────────────────
{
  const antes  = { participants: [P('u-a')] };
  const depois = { participants: [P('u-a')], standbyParticipants: [P('u-fila')], waitlist: [P('u-fila2')] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-fila'] && d['u-fila'].status === 'waitlisted', 'standbyParticipants vira waitlisted');
  ok(d['u-fila2'] && d['u-fila2'].status === 'waitlisted', 'waitlist também');
}

// ── (5) DESATIVADO é estado próprio ─────────────────────────────────────────
{
  const antes  = { participants: [P('u-a')] };
  const depois = { participants: [P('u-a', { ligaActive: false })] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-a'] && d['u-a'].status === 'inactive',
     'ligaActive:false vira `inactive` — "sumiu" e "desativado" não podem ser iguais');
}

// ── (6) MOVER-SE entre listas gera escrita (o W.O. faz isso) ────────────────
{
  const antes  = { participants: [P('u-x')], standbyParticipants: [] };
  const depois = { participants: [], standbyParticipants: [P('u-x')] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-x'] && d['u-x'].status === 'waitlisted', 'elenco → fila é registrado');
  ok(d['u-x'].status !== 'left', 'e NÃO é confundido com saída — a pessoa continua no torneio');
}

// ── (7) QUEM SAI É MARCADO, NUNCA APAGADO ──────────────────────────────────
{
  const antes  = { participants: [P('u-a'), P('u-vai')] };
  const depois = { participants: [P('u-a')] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-vai'] && d['u-vai'].status === 'left', 'quem sai vira `left`');
  ok(d['u-vai'].leftAt === AT, 'com a hora da saída — é a prova que faltou no incidente');
}

// ── (8) W.O. é MARCA, não status ───────────────────────────────────────────
{
  const antes  = { participants: [P('u-a'), P('u-wo')] };
  const depois = { participants: [P('u-a'), P('u-wo', { ligaActive: false })],
    rounds: [{ round: 1, matches: [
      { id: 'wo1', isSitOut: true, sitOutReason: 'wo', p1Uid: 'u-wo' }] }] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-wo'] && d['u-wo'].wo === true, 'quem levou W.O. é marcado com wo:true');
  ok(d['u-wo'].status === 'inactive',
     'e o STATUS segue dizendo ONDE ela está (desativada) — é o acionável');
}

// ── (9) FOLGA COMUM NÃO É W.O. ─────────────────────────────────────────────
{
  const antes  = { participants: [P('u-a')] };
  const depois = { participants: [P('u-a')],
    rounds: [{ round: 1, matches: [{ id: 's1', isSitOut: true, sitOutReason: 'inactive', p1Uid: 'u-a' }] }] };
  const r = planRosterMirror(antes, depois, AT);
  ok(r.total === 0, 'folga de inativo não marca W.O. nem gera escrita');
}

// ── (10) DUPLA: os DOIS lados têm doc ──────────────────────────────────────
{
  const antes  = { participants: [] };
  const depois = { participants: [{ p1Uid: 'u-p1', p2Uid: 'u-p2' }] };
  const d = porUid(planRosterMirror(antes, depois, AT));
  ok(d['u-p1'] && d['u-p2'], 'os dois membros da dupla ganham doc próprio');
}

// ── (11) NOME NUNCA VIRA IDENTIDADE ────────────────────────────────────────
{
  const depois = { participants: [], monarchWaitlist: { _default_: ['Renato Oshima'] } };
  const r = planRosterMirror({ participants: [] }, depois, AT);
  ok(r.total === 0, 'monarchWaitlist (mapa de NOMES) não vira doc — identidade é o uid');
}
{
  const depois = { participants: [{ displayName: 'Fulano Sem Conta' }] };
  const r = planRosterMirror({ participants: [] }, depois, AT);
  ok(r.total === 0, 'fictício (sem uid) não tem doc — não tem conta, não tem identidade estável');
}

// ── (12) ELENCO VENCE FILA quando a pessoa aparece nos dois (resíduo) ──────
{
  const depois = { participants: [P('u-d')], standbyParticipants: [P('u-d')] };
  const d = porUid(planRosterMirror({ participants: [] }, depois, AT));
  ok(d['u-d'].status === 'enrolled', 'quem está nas duas listas conta como inscrito');
}

// ── (13) TORNEIO CRIADO (before inexistente) ──────────────────────────────
{
  const r = planRosterMirror(null, { participants: [P('u-org')] }, AT);
  ok(r.total === 1 && r.writes[0].doc.status === 'enrolled',
     'criação do torneio espelha quem já nasce nele');
}

// ── (14) A FOTO é estável (mesma entrada → mesmo resultado) ───────────────
{
  const t = { participants: [P('u-a', { ligaActive: false })], standbyParticipants: [P('u-b')] };
  ok(JSON.stringify(fotografar(t)) === JSON.stringify(fotografar(t)),
     'fotografar é determinístico');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
