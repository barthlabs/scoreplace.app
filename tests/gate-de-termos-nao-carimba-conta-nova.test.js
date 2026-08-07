/* O GATE DE TERMOS NÃO PODE CARIMBAR QUEM ACABOU DE NASCER
 * node tests/gate-de-termos-nao-carimba-conta-nova.test.js
 *
 * RELATO DO DONO (07/ago/2026): "o modal de termos nunca aparece pra ninguem".
 *
 * MEDIDO na base: 205 perfis, 202 com acceptedTerms=true — e 188 deles GRANDFATHERED,
 * ou seja carimbados automaticamente. Só 14 aceites de verdade. Dos 188, 187 foram
 * carimbados a MENOS DE 10 SEGUNDOS do nascimento da conta:
 *
 *   Paula Vasconcelos  createdAt 23:33:53.787 → acceptedTermsAt 23:33:54.105  (318 ms)
 *   Fábio Simão        createdAt 18:18:59.000 → acceptedTermsAt 18:19:00.417  (1,4 s)
 *
 * Ninguém lê e aceita termos em 318 ms.
 *
 * CAUSA: o grandfather (v1.0.53) decide por "evidência de uso passado", e a lista incluía
 * campos que TODA conta tem no primeiro milissegundo, porque o próprio cadastro os escreve:
 * `createdAt`, `updatedAt`, `acceptFriendRequests`, `notifyLevel`. Qualquer um sozinho
 * disparava. `createdAt` como prova de uso passado nunca podia funcionar — ele é carimbado
 * no NASCIMENTO.
 *
 * Este teste extrai a expressão REAL do auth.js e a executa contra o perfil REAL da Paula
 * (recém-criada) e o de uma pessoa que de fato usou o app.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');

// ── Extrai a expressão de evidência REAL do arquivo ──────────────────────────
const marker = 'var _hasUsageEvidence = !!(';
const i = SRC.indexOf(marker);
ok(i !== -1, 'não achei a expressão de evidência no auth.js');
const expr = SRC.slice(i + marker.length, SRC.indexOf('\n    );', i));
const evidencia = new Function('_profile', 'return !!(' + expr + ');');

// ── O PERFIL REAL da Paula no instante em que o gate rodou ───────────────────
// (só o que o cadastro escreve: defaults + o que o provedor Apple entregou)
const RECEM_NASCIDA = {
  acceptFriendRequests: true, authProvider: 'apple.com',
  createdAt: '2026-08-06T23:33:53.787Z', updatedAt: '2026-08-06T23:33:53.787Z',
  displayName: 'Paula Vasconcelos', displayName_lower: 'paula vasconcelos',
  email: 'pauladevasconcelos@uol.com.br', email_lower: 'pauladevasconcelos@uol.com.br',
  notifyEmail: true, notifyLevel: 'todas', notifyPlatform: true, notifyWhatsApp: false,
  omitEmail: false, omitPhone: false, phoneCountry: '55',
  presenceAutoCheckin: false, presenceMuteDays: '7', presenceMuteUntil: '0',
  presenceVisibility: 'friends', refereeSports: [], canRefereeBySport: {}, skillBySport: {},
};
ok(evidencia(RECEM_NASCIDA) === false,
   'conta RECÉM-CRIADA não pode contar como "já usou o app" (era isso que carimbava 187 pessoas)');

// os quatro campos que faziam o carimbo, um a um — nenhum pode voltar a valer sozinho
[['createdAt', '2026-08-06T23:33:53.787Z'], ['updatedAt', '2026-08-06T23:33:53.787Z'],
 ['acceptFriendRequests', true], ['notifyLevel', 'todas'], ['phoneCountry', '55'],
 ['authProvider', 'apple.com'], ['displayName', 'Fulana'], ['email', 'a@b.com'],
 ['photoURL', 'https://x/y.jpg'], ['phone', '+5511999999999']].forEach(function (par) {
  const p = {}; p[par[0]] = par[1];
  ok(evidencia(p) === false, 'o campo "' + par[0] + '" sozinho NÃO é evidência de uso (o cadastro o escreve)');
});

// gênero/habilidade são atribuíveis pelo ORGANIZADOR (genderSetBy/skillSetBy) — nunca provam
// que a PESSOA usou o app
ok(evidencia({ gender: 'feminino', genderSetBy: 'uid_do_organizador' }) === false,
   'gênero atribuído pelo organizador não é evidência de uso da pessoa');
ok(evidencia({ skillBySport: { 'Beach Tennis': 'C' }, skillSetBy: 'uid_do_organizador' }) === false,
   'habilidade atribuída pelo organizador idem');

// ── O QUE CONTINUA valendo: ato deliberado DEPOIS do cadastro ────────────────
ok(evidencia({ friends: ['uid_amigo'] }) === true, 'ter amigo é uso real');
ok(evidencia({ preferredSports: ['Beach Tennis'] }) === true, 'modalidade preferida é uso real');
ok(evidencia({ preferredLocations: [{ label: 'Clube' }] }) === true, 'local preferido é uso real');
ok(evidencia({ matchHistory: [{ matchId: 'm1' }] }) === true, 'histórico de partida é uso real');
ok(evidencia({ letzplayHandle: '@fulano' }) === true, 'ter ligado o letzplay é uso real');
ok(evidencia({ plan: 'pro' }) === true, 'ser Pro é uso real');
// listas VAZIAS não valem (o cadastro cria algumas delas vazias)
ok(evidencia({ friends: [], preferredSports: [], preferredLocations: [], matchHistory: [] }) === false,
   'listas vazias não são evidência');

// ── A REDE do Auth metadata não pode virar bypass ────────────────────────────
// Com a lista corrigida, TODA segunda entrada tem lastSignIn − creation > 60s. Se essa rede
// rodasse sempre, quem fechou o modal na 1ª vez entraria carimbado na 2ª, sem aceitar nada.
(() => {
  const bloco = SRC.slice(SRC.indexOf('!_hasUsageEvidence &&'), SRC.indexOf('[terms-gate v1.7.64]') + 200);
  ok(/Object\.keys\(_profile\)\.length === 0/.test(bloco),
     'a rede do Auth metadata só vale com o perfil ILEGÍVEL — senão é bypass na 2ª entrada');
})();

// ── E o modal continua sendo chamado quando não há evidência ─────────────────
ok(SRC.indexOf('await window._showTermsAcceptanceModal()') !== -1,
   'o gate continua abrindo o modal de aceite');
ok(SRC.indexOf("acceptedTermsGrandfathered: true") !== -1,
   'o carimbo continua marcado como grandfather (analytics distingue do aceite real)');

console.log((fail === 0 ? '✅' : '❌') + ' gate-de-termos: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
