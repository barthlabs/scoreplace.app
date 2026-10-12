/* Regressão: reabrir inscrições de torneio com `registrations` canônicas não
 * pode tentar promover o espelho legado e falhar. O Neon migrado preserva as
 * 48 duplas; a operação só reabre a janela para os próximos inscritos. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const marker = 'function _promoteWaitlistsWhenOpeningEnrollment(t) {';
const start = src.indexOf(marker);
if (start < 0) throw new Error('não encontrou _promoteWaitlistsWhenOpeningEnrollment');
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
}
if (end < 0) throw new Error('função de reabertura incompleta');
let calls = { legacy: 0, promoted: 0 };
const context = {
  _assertLegacyRosterMutationAllowed: () => { calls.legacy++; },
  _promoteWaitlists: () => { calls.promoted++; return 7; }
};
vm.createContext(context);
vm.runInContext(src.slice(start, end) + '\nglobalThis.reopen = _promoteWaitlistsWhenOpeningEnrollment;', context);
const ok = (condition, message) => {
  if (!condition) { console.error('✗ ' + message); process.exitCode = 1; }
  else console.log('✓ ' + message);
};

const neon = { canonicalRegistrationMigration: { fingerprint: 'neon-roster', registrationCount: 96 } };
ok(context.reopen(neon) === 0, 'torneio canônico reabre sem promoção legada');
ok(calls.legacy === 0 && calls.promoted === 0, 'torneio canônico não toca no espelho de elenco');

calls = { legacy: 0, promoted: 0 };
ok(context.reopen({}) === 7, 'torneio pré-migração mantém promoção histórica');
ok(calls.legacy === 1 && calls.promoted === 1, 'fluxo legado permanece protegido e íntegro');

/* Integração da callable: a rota real de `open` deve usar exclusivamente o
 * guarda canônico. Uma futura edição que volte a chamar `_promoteWaitlists`
 * ou a barreira legada diretamente no handler volta a quebrar o Neon. */
const handlerStart = src.indexOf('exports.setTournamentEnrollmentStatus = onCall(');
const handlerEnd = src.indexOf('\nexports.runEnrollmentSlotsDraw = onCall(', handlerStart);
const handler = src.slice(handlerStart, handlerEnd);
ok(handlerStart >= 0 && handlerEnd > handlerStart, 'callable de status de inscrições localizada');
ok(handler.includes('promoted = _promoteWaitlistsWhenOpeningEnrollment(t);'),
  'callable de reabertura passa pelo guarda canônico');
ok(!handler.includes('_assertLegacyRosterMutationAllowed(t, \'promoção legada da lista de espera\')') &&
   !handler.includes('promoted = _promoteWaitlists(t);'),
  'callable não reintroduz mutação do espelho legado');

const callSites = [...src.matchAll(/_promoteWaitlists\(/g)].map((match) => match.index);
ok(callSites.length === 2, 'a promoção legada só existe na implementação e no guarda; reaberturas usam o guarda');

if (process.exitCode) process.exit(process.exitCode);
console.log('✅ regressão de reabertura de inscrições aprovada');
