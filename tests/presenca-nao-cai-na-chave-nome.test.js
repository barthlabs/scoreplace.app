/* A PRESENÇA NÃO PODE CAIR NA CHAVE-NOME POR DESISTÊNCIA  (2.1.6)
 * node tests/presenca-nao-cai-na-chave-nome.test.js
 *
 * ⛔ MEDIDO NO CONFRA (27/ago/2026, torneio AO VIVO): das 9 presenças VIVAS (<24h), OITO
 * estavam gravadas com o NOME como chave — marcadas naquele mesmo dia. Não era legado, era
 * o caminho de hoje. E o dono confirmou: _"nao existe digitado na confra"_ — ou seja, toda
 * chave-nome ali é DEFEITO. A única legítima é o coringa "Jogador X", que não tem uid.
 *
 * COMO ACONTECIA: os chamadores passam `(pObj && pObj.uid) || ''`. Num torneio DIVIDIDO o
 * elenco mora na subcoleção; com ele não hidratado o uid vem VAZIO, e a porta caía no nome.
 * O `_memberUidByName` também não salvava — ele lê `t.participants`, que é exatamente o que
 * não está carregado. [[feedback_cache_quente_satisfaz_metade_da_pergunta]]
 *
 * ⭐ A SAÍDA: os JOGOS sempre estão na tela, e os slots trazem `team1Uids`/`team2Uids`
 * alinhados aos nomes. Quem aparece num jogo tem uid recuperável ali.
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** PROÍBE: a chave-nome em si. Ela é a exceção canônica do
 * fictício/coringa sem conta ([[feedback_uid_controls_everything_name_only_ficticio]]).
 * O que ele proíbe é chegar nela por DESISTÊNCIA, tendo uid disponível a um passo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── presença não cai na chave-nome por desistência ────');

const src = fs.readFileSync(path.join(ROOT, 'js/views/participants.js'), 'utf8');
const ini = src.indexOf('window._uidParaPresenca = function');
ok('⭐ `_uidParaPresenca` existe', ini > 0);

global.window = {};
// eslint-disable-next-line no-eval
eval(src.slice(ini, src.indexOf('\n};', ini) + 3));
const resolve = global.window._uidParaPresenca;

/* Torneio DIVIDIDO como o Confra: elenco NÃO hidratado (participants vazio), jogos na tela. */
const UID = 'fuQ4MbHS03eI1G4yCk4WoDwKLTD2';
const tDividido = {
  _semPesados: ['matches', 'participants', 'opponentHistory'],
  participants: [],
  matches: [{
    id: 'm1',
    team1: ['Zilda Quintas', 'Jogador X'], team1Uids: [UID, null],
    team2: ['Fernando Bernacchi', 'Rostanda'], team2Uids: ['uid-fer', 'uid-ros'],
  }],
};
global.window._collectAllMatches = (t) => t.matches || [];

/* ── ① o caminho feliz continua intocado ──────────────────────────────────── */
ok('⛔ uid do chamador MANDA (não vai buscar nada)', resolve(tDividido, 'Zilda Quintas', 'uid-explicito') === 'uid-explicito');

/* ── ② o elenco resolve quando está carregado ─────────────────────────────── */
global.window._memberUidByName = (t, n) => (n === 'Zilda Quintas' ? 'uid-do-elenco' : '');
ok('⭐ sem uid, o ELENCO resolve primeiro', resolve(tDividido, 'Zilda Quintas', '') === 'uid-do-elenco');

/* ── ③ o cenário REAL: elenco não hidratado, jogos salvam ─────────────────── */
global.window._memberUidByName = () => '';        // é o que acontece no torneio dividido
ok('⭐⭐ elenco vazio → o uid vem dos JOGOS', resolve(tDividido, 'Zilda Quintas', '') === UID,
  'ESTE é o caso do Confra: sem esta fonte, 8 presenças viraram chave-nome');
ok('  → e casa sem depender de caixa/espaço', resolve(tDividido, '  zilda quintas ', '') === UID);
ok('  → acha em qualquer um dos dois times', resolve(tDividido, 'Rostanda', '') === 'uid-ros');

/* ── ④ o coringa CONTINUA por nome — é a exceção canônica ─────────────────── */
ok('⭐⭐ "Jogador X" (slot com uid null) NÃO inventa uid', resolve(tDividido, 'Jogador X', '') === '',
  'inventar uid pro fictício seria pior que a chave-nome');
ok('⛔ quem não está em lugar nenhum também devolve vazio', resolve(tDividido, 'Ninguém', '') === '');

/* ── ⑤ robustez: nada disso pode derrubar a marcação de presença ──────────── */
ok('⛔ torneio nulo não explode', (function () { try { return resolve(null, 'X', '') === ''; } catch (e) { return false; } })());
ok('⛔ nome vazio não explode', (function () { try { return resolve(tDividido, '', '') === ''; } catch (e) { return false; } })());
ok('⛔ resolvedor que joga exceção não derruba (cai pro próximo)', (function () {
  global.window._memberUidByName = () => { throw new Error('cache frio'); };
  try { return resolve(tDividido, 'Zilda Quintas', '') === UID; } catch (e) { return false; }
})());

/* ── ⑥ a porta USA o resolvedor (senão ele é enfeite) ─────────────────────── */
const iTog = src.indexOf('window._toggleCheckIn = function');
const corpo = src.slice(iTog, src.indexOf('\n};', iTog));
ok('⭐⭐ `_toggleCheckIn` resolve o uid ANTES de decidir', /_uidParaPresenca\(/.test(corpo),
  'sem isto o resolvedor existe e ninguém chama — o bug volta inteiro');

console.log(falhas === 0 ? '\n✅ presenca-nao-cai-na-chave-nome: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
