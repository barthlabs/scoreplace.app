/* A Análise de Inscritos precisa enxergar a LISTA DE ESPERA — e gravar no lugar certo.
 *
 * O BUG (relato do dono, Confra, ago/2026): "os que se inscreveram depois do sorteio não
 * estão aparecendo na análise para podermos atribuir gênero e categoria". Causa: desde a
 * v1.6.86 quem entra depois do sorteio vai pra ESPERA e SAI de `t.participants` — e a
 * Análise lia só `participants`.
 *
 * O QUE ESTE TESTE DEFENDE, e é a parte perigosa do conserto: a linha da espera NÃO pode
 * cair no fallback POSICIONAL do save (`parts[order-1]`). Se cair, a categoria é gravada
 * em OUTRA PESSOA — silenciosamente. Aqui isso é provado com o formato REAL de produção:
 * as duas entradas da espera do Confra têm SÓ uid (displayName vem strippado desde a
 * v1.3.52), então qualquer resolução por nome falha e o posicional acerta a pessoa errada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
vm.createContext(sandbox);

// Nome vivo por uid — é o que _wlName usa pra nomear entrada só-uid (o perfil é a fonte).
const NOMES = { uid_espera_1: 'Marcos Tardio', uid_espera_2: 'Paulo Atrasado' };
sandbox._pName = function (e) {
  if (!e) return '';
  if (e.uid && NOMES[e.uid]) return NOMES[e.uid];
  return String(e.displayName || e.name || '');
};

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'waitlist-core.js'), 'utf8'), sandbox);

let ok = 0, fail = 0;
function t(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}

// ── Fixture com a FORMA de produção (tour_1780009816637) ────────────────────────────
// 111 inscritos no roster + 2 na espera, todos SÓ com uid (nome strippado).
const t0 = { id: 'tour_confra', participants: [], standbyParticipants: [], waitlist: [], monarchWaitlist: {} };
for (let i = 1; i <= 111; i++) t0.participants.push({ uid: 'u' + i, enrollSeq: i, categories: ['Fem C'] });
t0.standbyParticipants.push({ uid: 'uid_espera_1', addedAt: '2026-08-02T22:45:23.950Z' });
t0.standbyParticipants.push({ uid: 'uid_espera_2', addedAt: '2026-08-03T20:02:17.939Z' });

console.log('\n──── a espera aparece na Análise ────');
const wl = sandbox.window._getWaitlist(t0);
t('a fila tem as 2 pessoas', wl.length === 2, 'len=' + wl.length);
t('entrada só-uid ganha nome pelo perfil', wl[0] && sandbox._pName(wl[0]) === 'Marcos Tardio');
t('nenhuma delas está em participants',
  !t0.participants.some(p => p.uid === 'uid_espera_1' || p.uid === 'uid_espera_2'));

console.log('\n──── gravar na espera atinge o STORAGE, não uma cópia ────');
// _getWaitlist devolve a REFERÊNCIA — é isso que faz o save funcionar.
const alvo = wl.find(w => w.uid === 'uid_espera_2');
alvo.categories = ['Masc D']; alvo.category = 'Masc D'; alvo.categorySource = 'organizador';
t('mutar o resultado grava em standbyParticipants',
  t0.standbyParticipants[1].category === 'Masc D',
  JSON.stringify(t0.standbyParticipants[1]));
t('não vazou pra participants', !t0.participants.some(p => p.category === 'Masc D'));

console.log('\n──── a armadilha: fallback POSICIONAL grava na pessoa errada ────');
// Reproduz o que aconteceria SEM o guard: a linha da espera vem depois das 111 do roster,
// então `order` aponta pra fora de t.participants e o `parts[order-1]` do _erFindParticipant
// cairia em undefined OU, com roster menor, em um inscrito qualquer. Aqui provamos o
// princípio: resolver por POSIÇÃO nunca acha a pessoa da espera.
const order = 113;                       // 111 do roster + 2ª da espera
const posicional = t0.participants[order - 1];
t('posicional NÃO acha a pessoa da espera', !posicional || posicional.uid !== 'uid_espera_2',
  posicional ? posicional.uid : 'undefined');
// E o caminho correto (por uid) acha:
const porUid = sandbox.window._getWaitlist(t0).filter(w => String(w.uid) === 'uid_espera_2')[0];
t('por uid acha a pessoa certa', !!porUid && porUid.uid === 'uid_espera_2');

console.log('\n──── o código do save usa o caminho por uid ────');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
t('roster da Análise inclui _getWaitlist e marca a origem',
  /_getWaitlist\(t\)/.test(src) && /_wl\s*=\s*true/.test(src));
t('a marca chega na linha (_buildRows propaga _wl)', /_wl:\s*!!\(p && p\._wl\)/.test(src));
t('save trata linha da espera antes do lookup normal', /row\._wl/.test(src));
t('save exige uid na linha da espera (sem uid não grava)',
  /if\s*\(\s*row\s*&&\s*row\._wl\s*\)\s*\{[\s\S]{0,120}if\s*\(\s*!row\.uid\s*\)\s*return;/.test(src));

console.log('\n──── a espera é VISÍVEL como espera (não se mistura aos inscritos) ────');
t('linha da espera leva etiqueta', /\(r\._wl \?[\s\S]{0,900}>espera<\/span>/.test(src));
t('etiqueta explica que ainda não entrou',
  /title="Está na lista de espera — ainda não entrou no torneio"/.test(src));
// "N inscritos" NÃO pode contar quem está na fila — quem espera não está no torneio.
t('contagem de inscritos exclui a espera',
  /totalWaitlist = rows\.filter\([\s\S]{0,80}_wl/.test(src) &&
  /totalEnrolled = rows\.length - totalWaitlist/.test(src));
t('a espera é mostrada à parte, não somada', /\+ ' \+ totalWaitlist \+ ' na lista de espera/.test(src));

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) { console.log('❌ analise-lista-de-espera: FALHOU'); process.exit(1); }
console.log('✅ analise-lista-de-espera: OK');
