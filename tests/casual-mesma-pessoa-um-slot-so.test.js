/* casual-mesma-pessoa-um-slot-so — ninguém joga contra si mesmo.
 *
 * 🔴 O RELATO (dono, 21/ago/2026, com print da partida casual ao vivo): "Rodrigo Barth"
 * aparecia no time AZUL e no time VERMELHO ao mesmo tempo, e as duas vagas restantes viravam
 * "Jogador 2" e "Jogador 4". Ou seja: ele jogando contra ele.
 *
 * A CAUSA, medida no código: a sala guarda quem está nela em TRÊS listas — `participants`,
 * `playerUids` e `players` — e o próprio firebase-db já documentava que elas dessincronizam
 * ("docs legados podem ter uid só em players; claim-slot não populava playerUids"). O guarda
 * de "já entrei?" do joinCasualMatch olhava SÓ `playerUids`. Numa sala dessincronizada ele
 * passava batido e empurrava a MESMA pessoa em `participants` outra vez — e é de
 * `participants` que os 4 slots da tela saem.
 *
 * Identidade é uid ([[project_uid_primary_identity]]): a pergunta tem que ser feita nas três.
 */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
console.log('──── na casual, a mesma pessoa ocupa UM slot só ────');

const db = fs.readFileSync(path.join(__dirname, '..', 'js/firebase-db.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-ui.js'), 'utf8');

// ── 1. ESCRITA: o guarda pergunta às TRÊS listas ─────────────────────────────
ok(/var jaEstou = playerUids\.indexOf\(uid\) !== -1 \|\| participants\.some\(_souEu\) \|\| players\.some\(_souEu\)/.test(db),
  'entrar numa sala consulta participants, playerUids E players — não só uma');
ok(!/\/\/ Already joined\?\s*\n\s*if \(playerUids\.indexOf\(uid\) !== -1\) return true;/.test(db),
  'e o guarda antigo (só playerUids) não voltou');
ok(/_vistos\[x\.uid\]/.test(db), 'toda gravação deduplica participants por uid');
ok(/if \(!x \|\| !x\.uid\) return true;/.test(db),
  'quem NÃO tem conta nunca é filtrado — ali a identidade é o nome, e homônimos são 2 pessoas');
ok(/if \(playerUids\.indexOf\(uid\) === -1\) playerUids\.push\(uid\)/.test(db),
  'e a divergência é CURADA: quem já estava ganha o uid na lista que faltava');

// ── 2. LEITURA: a tela nunca desenha a mesma pessoa duas vezes ───────────────
ok(/function _dedupPorUid/.test(ui), 'a lista do lobby passa por um dedup por uid');
ok(/_lobbyParticipants = _dedupPorUid\(newParts\)/.test(ui) && /_lobbyParticipants = _dedupPorUid\(_preserved\)/.test(ui),
  'nos DOIS ramos (entrada e saída de gente) — senão um deles seguiria duplicando');

// ── 3. O comportamento, com o caso REAL do print ─────────────────────────────
(function () {
  const dedup = new Function('lista', ui.slice(ui.indexOf('function _dedupPorUid'),
    ui.indexOf('\n  }', ui.indexOf('function _dedupPorUid')) + 4) + '\nreturn _dedupPorUid(lista);');
  const eu = { uid: 'u-rodrigo', displayName: 'Rodrigo Barth' };
  const r = dedup([eu, null, { uid: 'u-rodrigo', displayName: 'Rodrigo Barth' }, null]);
  ok(r[0] && r[0].uid === 'u-rodrigo', 'a 1ª aparição fica (o slot dele é o primeiro)');
  ok(r[2] === null, 'a 2ª vira slot LIVRE — ele deixa de jogar contra si mesmo');
  const guests = dedup([{ displayName: 'Ana' }, { displayName: 'Ana' }]);
  ok(guests[0] && guests[1], 'dois convidados de mesmo nome e SEM conta continuam sendo duas pessoas');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ casual-mesma-pessoa-um-slot-so FALHOU'); process.exit(1); }
console.log('✅ casual-mesma-pessoa-um-slot-so: OK');
