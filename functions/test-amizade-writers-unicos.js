/* SÓ A AUTORIDADE ESCREVE O CACHE DE AMIZADE — teste FUNCIONAL (4ª auditoria, ponto 4).
 * node functions/test-amizade-writers-unicos.js
 *
 * Não basta ter tirado o writer do cliente: o backend tinha três caminhos genéricos capazes
 * de mexer nos quatro campos —
 *   A. `computeProfileMerge` unia os arrays na fusão de perfil;
 *   B. `_sweepAllCollectionsByUid` remapeava uid DENTRO deles;
 *   C. `deleteAccount` tinha limpeza manual em paralelo.
 * Aqui A e B são exercitados de verdade (as funções rodam), não por regex.
 */
const merge = require('./profile-merge-core');
const cols = require('./merge-collections-core');
const sweep = require('./uid-sweep');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const CAMPOS = ['friends', 'friendRequestsSent', 'friendRequestsReceived', 'friendRequestsSentAt'];

// ══ A) computeProfileMerge NÃO copia os quatro campos ════════════════════════
const surv = { displayName: 'Sobrevivente', friends: ['uid_x'], city: 'SP' };
const drop = {
  displayName: 'Absorvido', city: 'RJ', preferredSports: ['tenis'],
  friends: ['uid_y', 'uid_z'],
  friendRequestsSent: ['uid_w'],
  friendRequestsReceived: ['uid_v'],
  friendRequestsSentAt: { uid_w: '2026-01-01' },
};
const out = merge.computeProfileMerge(surv, drop);
CAMPOS.forEach((c) => {
  ok(out[c] === undefined,
    '⛔ computeProfileMerge NÃO copia `' + c + '` (é projeção do cânone, não dado de perfil) — veio ' + JSON.stringify(out[c]));
});
ok(out.preferredSports && out.preferredSports.includes('tenis'),
  'controle: campo normal do absorvido CONTINUA sendo copiado (não quebrei a fusão)');
CAMPOS.forEach((c) => ok(merge.NUNCA_COPIAR.has(c), '`' + c + '` está em NUNCA_COPIAR'));

// ══ B) a varredura genérica NÃO edita os quatro campos em `users` ═══════════
CAMPOS.forEach((c) => {
  ok(cols.shouldSweepUserField(c) === false, '⛔ o sweep NÃO edita `' + c + '` em users/');
});
ok(cols.shouldSweepUserField('memberUids') === true, 'controle: campo normal continua sendo varrido');
ok(cols.shouldSweepUserField('displayName') === true, 'controle: outro campo normal também');

/* E a PROVA de que a exclusão importa: sem ela o remapUid REESCREVERIA o array.
 * Isto roda o remap de verdade e mostra o que aconteceria — é por isso que o filtro existe. */
const docTerceiro = { friends: ['uid_old', 'uid_outro'], memberUids: ['uid_old'] };
const remapeado = sweep.remapUid(docTerceiro, 'uid_old', 'uid_keep');
ok(remapeado.changed === true, 'o remap genérico DE FATO mexeria no doc do terceiro');
ok(remapeado.value.friends.includes('uid_keep'),
  '⛔ e trocaria uid_old por uid_keep em `friends` — reinventando amizade que o cânone pode não ter');
// com o filtro aplicado (como o index.js faz), `friends` não entra no payload
const payload = {};
for (const k of Object.keys(remapeado.value)) {
  if (!cols.shouldSweepUserField(k)) continue;
  if (JSON.stringify(remapeado.value[k]) !== JSON.stringify(docTerceiro[k])) payload[k] = remapeado.value[k];
}
ok(payload.friends === undefined, '✅ com o filtro, `friends` fica FORA do payload da varredura');
ok(payload.memberUids !== undefined, 'e o campo legítimo continua sendo corrigido');

console.log(pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
