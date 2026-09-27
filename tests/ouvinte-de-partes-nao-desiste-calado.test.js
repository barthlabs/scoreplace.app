'use strict';
/* O OUVINTE DAS PARTES NÃO DESISTE CALADO.
 * node tests/ouvinte-de-partes-nao-desiste-calado.test.js
 *
 * ⛔⛔ RELATO DO DONO, 27/set/2026: _"tem que ser certo em tempo real sem essa merda de cache que
 * caga tudo"_, depois de ver a MESMA tela dizer "35º, eliminado" na classificação e, logo abaixo,
 * a mesma dupla jogando com tarja de repescagem. Quando eu disse que faltava ouvinte, ele cortou:
 * _"se ja existe nao resolve porra nenhuma. resolva"_ — e estava certo: o ouvinte existe desde a
 * 2.0.112 e mesmo assim a tela ficava velha.
 *
 * ⛔ O FURO, MEDIDO: numa abertura DIRETA (link, recarregar já na chave, notificação) o roteador
 * liga o ouvinte ANTES de o torneio existir na lista em memória. Sem o torneio, a lista de partes
 * vem vazia e a função saía pelo `return` de "torneio inteiro" — o mesmo `return` que significa
 * "não há nada a ouvir, está tudo no documento". Duas coisas OPOSTAS pela mesma porta muda.
 * E como o roteador só liga ao ENTRAR na rota, e a entrada já tinha acontecido, nunca mais havia
 * segunda chance: a tela ficava com o retrato do primeiro instante pela sessão inteira.
 *
 * ⇒ torneio ausente é ESPERA, não resposta: retenta. E toda desistência passa a ter voz.
 * [[feedback_engolir_erro_custa_horas_do_dono]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o ouvinte das partes não desiste calado ────\n');

const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const i0 = st.indexOf('ouvirPartesDoTorneio(tournamentId) {');
const bloco = i0 < 0 ? '' : st.slice(i0, st.indexOf('\n    var self = this, uns = [];', i0));
ok(bloco.length > 400, '① o ouvinte foi achado pelo identificador');

/* ── ① TORNEIO AUSENTE RETENTA, EM VEZ DE DESISTIR ─────────────────────────── */
ok(/if \(!t\) \{/.test(bloco),
  '① ⛔⛔ "torneio ainda não chegou" virou um caso PRÓPRIO, separado de "não é dividido"');
ok(/setTimeout\([\s\S]{0,200}ouvirPartesDoTorneio\(id\)/.test(bloco),
  '① ⛔⛔ e ele RETENTA — sem isso a abertura direta nunca mais liga o ouvinte');
ok(/_tentouOuvirPartes/.test(bloco),
  '① com contador de tentativas: retentar para sempre é laço, não conserto');
ok(/delete this\._tentouOuvirPartes\[id\]/.test(bloco),
  '① ⛔ e o contador é ZERADO ao achar o torneio — senão a próxima abertura já nasce no limite');

/* ── ② AS DESISTÊNCIAS TÊM VOZ ─────────────────────────────────────────────── */
const falas = (bloco.match(/window\._(warn|error)\(/g) || []).length;
ok(falas >= 3,
  '② ⛔⛔ cada desistência fala (achei ' + falas + ') — saída muda foi a causa deste defeito');
ok(/desisti de ouvir as partes/.test(bloco),
  '② e a de "o torneio nunca chegou" diz exatamente isso');
ok(/retrato do primeiro instante/.test(bloco),
  '② dizendo também a CONSEQUÊNCIA, que é o que faz alguém agir');

/* ── ③ "NÃO É DIVIDIDO" SEGUE SENDO SAÍDA LEGÍTIMA E MUDA ──────────────────
 * ⛔ Não se põe voz aqui: torneio inteiro tem ouvinte no documento, não falta nada. Gritar neste
 * caminho encheria o console de aviso falso e ensinaria todo mundo a ignorar os de verdade. */
const iFora = bloco.indexOf('if (!fora.length) return;');
ok(iFora > 0, '③ o caso do torneio inteiro continua existindo');
ok(/if \(!fora\.length\) return;\s*\/\/ torneio INTEIRO/.test(bloco),
  '③ ⛔ e continua MUDO de propósito — aviso falso ensina a ignorar aviso');
const iT = bloco.indexOf('if (!t) {');
ok(iT > 0 && iT < iFora,
  '③ ⛔⛔ e o caso do torneio ausente vem ANTES dele — era essa ordem que confundia os dois');

/* ── ④ A CHAVE NÃO PERDE O OUVINTE ────────────────────────────────────────── */
const rt = fs.readFileSync(path.join(ROOT, 'js/router.js'), 'utf8');
ok(/_telaDeTorneio\s*=\s*\(view === 'tournaments' \|\| view === 'bracket'\)/.test(rt),
  '④ ⛔⛔ a chave conta como tela de torneio — antes o roteador soltava o ouvinte nela');
ok(/&& !_telaDeTorneio\) window\.AppStore\.pararDeOuvirJogos\(\)/.test(rt),
  '④ e só solta fora dessas duas');

/* ── ⑤ ABRIR A CHAVE TAMBÉM LIGA O OUVINTE ────────────────────────────────── */
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
ok(/AS\.ouvirJogosDoTorneio\(id\)/.test(br),
  '⑤ ⛔ a porta que monta a chave também liga o ouvinte — montar é retrato, ouvir é o resto');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
