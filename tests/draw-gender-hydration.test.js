/* O "equilibrado" só equilibra se o app SOUBER o gênero — node tests/draw-gender-hydration.test.js
 *
 * A FALHA REAL, medida no Confra em 31/jul/2026 (sandbox, 105 inscritos): o motor conhecia
 * o gênero de 4 pessoas. As outras 101 tinham gênero no PERFIL (91 F / 14 M) e ninguém lia
 * — resultado na tela do dono: "de cara vejo 2 homens num mesmo grupo" e "vários grupos sem
 * homens. o equilíbrio e nada é a mesma coisa".
 *
 * O inscrito grava SÓ O UID (cânone: identity-core apaga gender/email/phone em todo save),
 * então o gênero vive no PERFIL — e o motor o resolve por uid no `_userProfileCache`. O que
 * faltava era CARREGAR o perfil antes de sortear: é o que `_hydrateParticipantGenders` faz.
 * No servidor quem re-resolve por uid é a CF (_enrichParticipantsFromProfiles), e por isso o
 * teste também exercita o motor com o cache VAZIO e o gênero em p.gender.
 */
const { window, load } = require('./headless.js');
load('bracket-logic.js');
load('tournaments-draw.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── cenário real: 91 mulheres + 14 homens, gênero SÓ no perfil ────────────────
const perfil = {};          // o que existe em users/{uid}
const parts = [];
for (let i = 0; i < 91; i++) { perfil['f' + i] = 'feminino'; }
for (let i = 0; i < 14; i++) { perfil['m' + i] = 'masculino'; }
// pior entrada possível: os homens todos juntos no fim (é onde eles se amontoam)
Object.keys(perfil).sort((a, b) => (a[0] === b[0] ? 0 : a[0] === 'f' ? -1 : 1))
  .forEach(uid => parts.push({ uid: uid, displayName: uid.toUpperCase() }));   // SEM gender no inscrito
const t = { id: 'tour_x', equilibrado: true, participants: parts };
const nomes = parts.map(p => p.displayName);
// a sobra (105 % 4 = 1) sai antes: o motor chama o espalhamento com numGroups*4 exatos
const lista = nomes.slice(1);            // 90 mulheres + os 14 homens = 104
const nGrupos = 26;                                    // 104 jogadores em grupos de 4
const homensPorGrupo = (lista) => {
  const out = [];
  for (let i = 0; i < nGrupos; i++) out.push(lista.slice(i * 4, i * 4 + 4).filter(n => /^M/.test(n)).length);
  return out;
};

// cache de perfil do app: começa VAZIO (é exatamente o estado do sorteio real)
let cache = {};
window._userProfileCache = cache;
window._genderForUid = (uid) => (cache[uid] && cache[uid].gender) || '';
window._preloadUserProfiles = function (uids) {
  uids.forEach(u => { if (perfil[u]) cache[u] = { gender: perfil[u] }; });
  return Promise.resolve();
};
window.AppStore = { tournaments: [t] };                // sem mutate → grava pelo FirestoreDB
let gravou = 0;
window.FirestoreDB = { saveTournament: function () { gravou++; return Promise.resolve(); } };

(async function () {
  // 1) ANTES: ninguém tem gênero conhecido → o espalhamento é um NO-OP. É a falha do dono.
  ok(parts.filter(p => p.gender).length === 0, 'nenhum inscrito tem gênero gravado (estado real)');
  const antes = window._spreadMinorityGender(t, lista, nGrupos);
  const hAntes = homensPorGrupo(antes);
  ok(Math.max(...hAntes) >= 2, 'sem gênero, o "equilibrado" deixa 2+ homens no mesmo grupo (a falha)');
  ok(hAntes.filter(x => x === 0).length > 20, 'e vários grupos sem nenhum homem');

  // 2) HIDRATA: carrega o perfil dos 105 e resolve o gênero
  const n = await window._hydrateParticipantGenders(t);
  ok(Object.keys(cache).length === 105, 'carregou o perfil dos 105 inscritos');
  ok(n === 105, 'e resolveu o gênero de todos (resolvidos: ' + n + ')');
  ok(parts.filter(p => p.gender === 'masculino').length === 14, 'os 14 homens ficaram marcados');
  ok(parts.filter(p => p.gender === 'feminino').length === 91, 'e as 91 mulheres também');
  ok(gravou === 0, 'sem gravar o torneio (o inscrito é só-uid — o save apagaria o gênero)');

  // 3) DEPOIS, COM O CACHE DE PERFIL VAZIO — é a situação do SERVIDOR, onde quem resolve
  //    por uid é a CF (_enrichParticipantsFromProfiles), escrevendo em p.gender.
  cache = {}; window._userProfileCache = cache;
  ok(window._monarchGenderOf(t, 'M0') === 'm', 'sem perfil nenhum, o motor lê o gênero do inscrito');
  const depois = window._spreadMinorityGender(t, lista, nGrupos);
  const hDepois = homensPorGrupo(depois);
  ok(Math.max(...hDepois) <= 1, 'nenhum grupo com 2 homens (máximo: ' + Math.max(...hDepois) + ')');
  ok(hDepois.filter(x => x === 1).length === 14, 'os 14 homens em 14 grupos distintos');

  // 4) rodar de novo não reescreve nada (idempotente — não vira gravação a cada sorteio)
  const n2 = await window._hydrateParticipantGenders(t);
  ok(n2 === 0 && gravou === 0, 'segunda passada não altera nada (idempotente)');

  console.log((fail ? '✗' : '✓') + ' draw-gender-hydration: ' + pass + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
})();
