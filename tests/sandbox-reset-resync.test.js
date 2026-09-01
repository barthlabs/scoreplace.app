/* Sandbox — o RESYNC do cliente está DESLIGADO.  (FIX.SANDBOX.P2, 2.1.87)
 * node tests/sandbox-reset-resync.test.js
 *
 * ⚠️ ESTE ARQUIVO MUDOU DE LADO DUAS VEZES, e as duas por ordem do dono. Vale registrar,
 * porque a segunda mudança desfaz o que a primeira exigia:
 *
 *   · ATÉ 2.1.85 ele EXIGIA reconstrução: com o original degradado, o resync mantinha os
 *     inscritos que o SB tinha capturado, DESMONTAVA duplas de teste em pessoas, DROPAVA o
 *     placeholder sem uid e REORDENAVA por enrollSeq;
 *   · na 2.1.86 o dono proibiu isso em letra — _"não é permitido simplificar, limpar,
 *     reconstruir, normalizar, reduzir ou substituir participantes […] espera […]"_ — e o
 *     bloco passou a exigir cópia fiel;
 *   · na 2.1.87 o sandbox foi pra `sandboxes/` preservando a FORMA persistida, e aí o resync
 *     do cliente deixou de fazer sentido: re-sincronizar é copiar do ORIGINAL, e o original
 *     é um torneio real cujas subcoleções o cliente não lê inteiras nem escreve. Quem tem o
 *     original inteiro na mão é o servidor.
 *     ⚠️ Isto não é o mesmo que "o cliente não escreve no sandbox": dentro de
 *     `sandboxes/{id}` o dono escreve (é assim que ele lança placar e avança fase). O que
 *     ele não faz é RE-COPIAR do original por conta própria.
 *
 * ⭐ Quem re-sincroniza é o SERVIDOR: `createSandbox` lê o original inteiro, prova a
 * igualdade canônica e escreve as partes. Re-sincronizar = pedir de novo por lá.
 * Medido em 01/set/2026: existem ZERO sandboxes legados em `tournaments`.
 *
 * ⛔ O que este arquivo trava agora: que o resync do cliente NÃO volte a mexer em estado.
 * É o guarda contra alguém "reativar" a função e ressuscitar a reconstrução proibida.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-reset-resync ────');

ok(typeof W._resyncSandboxRoster === 'function', '_resyncSandboxRoster ainda existe (call-sites antigos não quebram)');

// Um SB com estado de teste: se o resync ainda mexesse, isto mudaria.
const orig = { id: 'ORIG', name: 'Copa', isPublic: true, creatorUid: 'uORG',
  participants: [{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }], memberUids: ['uORG', 'uA', 'uB', 'uC'] };
const sb = { id: 'sb_ORIG_1', name: '(SB) Copa', isSandbox: true, sandboxOf: 'ORIG',
  notificationsMuted: true, isPublic: false, sandboxOwnerUid: 'uDEV', creatorUid: 'uDEV',
  participants: [{ uid: 'uA' }, { uid: 'uTEST' }],
  waitlist: [{ uid: 'w1' }], standbyParticipants: [{ uid: 's1' }], monarchWaitlist: { '0': ['w1'] },
  memberUids: ['uORG', 'uA', 'uB', 'uC'], coHosts: [{ uid: 'uCo' }], adminUids: ['uORG'],
  _semPesados: ['matches', 'participants'], _nPartes: { matches: 3, participants: 2 }, _nJogos: 3,
  matches: [{ id: 'm1' }], status: 'active' };
W.AppStore.tournaments = [orig, sb];
const antes = JSON.stringify(sb);

W._resyncSandboxRoster(sb);

ok(JSON.stringify(sb) === antes, '⭐⭐ o resync do cliente NÃO altera NADA do sandbox');
ok(JSON.stringify(sb.participants) === JSON.stringify([{ uid: 'uA' }, { uid: 'uTEST' }]),
  '  ⛔ não reconstrói o elenco (nem dropa a adição de teste)');
ok(sb.waitlist.length === 1 && sb.standbyParticipants.length === 1,
  '  ⛔ não zera espera nem suplentes');
ok(JSON.stringify(sb.memberUids) === JSON.stringify(['uORG', 'uA', 'uB', 'uC']),
  '  ⛔ não mexe em memberUids (membership é estado, não chave de entrega)');
ok(JSON.stringify(sb.coHosts) === JSON.stringify([{ uid: 'uCo' }]) &&
   JSON.stringify(sb.adminUids) === JSON.stringify(['uORG']), '  ⛔ nem em coHosts/adminUids');
ok(JSON.stringify(sb._semPesados) === JSON.stringify(['matches', 'participants']) &&
   sb._nJogos === 3, '⭐⭐ e NÃO mexe na FORMA persistida (dividido continua dividido)');
ok(JSON.stringify(orig.participants) === JSON.stringify([{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }]),
  'original intocado');

// ── ESTRUTURAL: a reconstrução proibida não pode voltar ──
const st = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = st.indexOf('window._resyncSandboxRoster = function');
const corpo = i < 0 ? '' : st.slice(i, st.indexOf('\n};', i));
const semComentarios = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(!/_sbRebuildCleanRoster\s*\(/.test(semComentarios), '⛔ nenhuma CHAMADA a _sbRebuildCleanRoster');
ok(!/ft\.waitlist\s*=\s*\[\]/.test(semComentarios), '⛔ não zera waitlist');
ok(!/ft\.standbyParticipants\s*=\s*\[\]/.test(semComentarios), '⛔ não zera standbyParticipants');
ok(!/delete ft\._semPesados/.test(semComentarios), '⛔ não apaga a forma persistida');
ok(/resync do cliente está desligado/.test(corpo), '⭐ e o motivo está escrito no código');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-reset-resync FALHOU'); process.exit(1); }
console.log('✅ sandbox-reset-resync: OK');
