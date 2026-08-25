/* OCULTAR (E FAVORITAR) NÃO "TEIMA EM VOLTAR".
 *
 * RELATO DO DONO (25/ago/2026): _"um torneio que teima em voltar"_ depois de ocultado.
 *
 * A CORRIDA (a mesma do aprovar-pelo-feed, ver
 * [[project_mutacao_otimista_morre_no_carregamento_em_voo]]):
 *   1. `_toggleHidden` muda `currentUser.hiddenTournaments` na hora (otimista) e manda
 *      gravar por trás (`_prefPersist`, arrayUnion);
 *   2. um `loadUserProfile` que JÁ ESTAVA EM VOO aterrissa e faz
 *      `currentUser.hiddenTournaments = profile.hiddenTournaments` — a lista do
 *      SERVIDOR, que ainda não tem a gravação. O torneio REAPARECE.
 *
 * O CONSERTO (2.0.69): a INTENÇÃO fica registrada (`_prefIntent`) e é re-aplicada em
 * cima de toda lista que chega do servidor (`_prefComIntents`). E se apaga SOZINHA no
 * instante em que o servidor concorda — sem prazo mágico e sem varredura.
 *
 * ⚠️ Vale para `hiddenTournaments` E `favorites`: os dois tinham exatamente o mesmo bug.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── ocultar/favoritar não teima em voltar ────');

// ── ① o motor REAL, extraído do store.js (não é réplica) ────────────────────────
const i = src.indexOf('function _prefIntent(field, id, add) {');
const j = src.indexOf('window._prefComIntents = _prefComIntents;');
ok(i > 0 && j > i, 'achou o motor de intenções no store.js');
const window = { _prefIntents: {} };
// eslint-disable-next-line no-eval
eval(src.slice(i, j + 41));

// ── ② o cenário do dono, passo a passo ─────────────────────────────────────────
_prefIntent('hiddenTournaments', 'T9', true);
let lista = _prefComIntents('hiddenTournaments', ['T1', 'T2']);   // servidor AINDA sem T9
ok(lista.indexOf('T9') !== -1,
   'perfil VELHO chegando não faz o torneio ocultado voltar (é o relato do dono)');

lista = _prefComIntents('hiddenTournaments', ['T1', 'T2', 'T9']); // servidor já gravou
ok(lista.indexOf('T9') !== -1, 'com o servidor em dia, ele segue oculto');
ok(Object.keys(window._prefIntents.hiddenTournaments || {}).length === 0,
   '⭐ e a intenção se APAGA SOZINHA quando o servidor concorda (sem prazo, sem varredura)');

// ── ③ o caminho inverso (desocultar) tem que valer igual ───────────────────────
_prefIntent('hiddenTournaments', 'T9', false);
lista = _prefComIntents('hiddenTournaments', ['T1', 'T9']);       // servidor ainda diz oculto
ok(lista.indexOf('T9') === -1, 'desocultar também sobrevive ao perfil velho');

// ── ④ favoritos usam o MESMO motor (tinham o mesmo bug) ────────────────────────
_prefIntent('favorites', 'F1', true);
ok(_prefComIntents('favorites', []).indexOf('F1') !== -1,
   'favoritar sobrevive ao perfil velho pelo mesmo caminho');

// ── ⑤ e o CÓDIGO DE PRODUÇÃO tem que estar ligado nos quatro pontos ────────────
ok(/_prefIntent\('hiddenTournaments', id, nowHidden\)/.test(src), 'ocultar REGISTRA a intenção');
ok(/_prefIntent\('hiddenTournaments', id, !nowHidden\)/.test(src),
   'e a DESFAZ quando a gravação falha (senão a tela mentiria ao contrário)');
ok(/_prefIntent\('favorites', id, nowFav\)/.test(src), 'favoritar REGISTRA a intenção');
ok(/_prefComIntents\('hiddenTournaments', profile\.hiddenTournaments/.test(src),
   '⛔ e o merge do perfil PASSA pelas intenções — é aqui que a lista do servidor sobrescrevia');
ok(/_prefComIntents\('favorites', profile\.favorites/.test(src),
   '⛔ idem para favoritos');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
