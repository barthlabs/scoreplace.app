/* A QUEDA DO PLACAR NÃO PODE SER SILENCIOSA — NEM QUEIMAR A COTA  (2.1.5)
 * node tests/queda-do-placar-nao-e-silenciosa.test.js
 *
 * Ordem do dono sobre a queda: _"NÃO FECHAR > fechar ERRADO — mas nunca em silêncio."_
 * [[feedback_fallback_local_recria_a_divergencia]]
 *
 * ⛔ O QUE ISSO ME CUSTOU (27/ago/2026): a entrada na fila só fazia `_warn`. Passei parte
 * da noite tratando "nenhum evento no Sentry" como prova de que a porta do placar dava
 * conta. Não provava nada — provava que ninguém estava olhando.
 *
 * ⚠️ E O LADO OPOSTO, QUE É TÃO FÁCIL DE ERRAR QUANTO: reportar TUDO queimaria a cota de
 * telemetria, que já venceu sem eu saber uma vez (2.0.81). Quadra sem sinal é o caso
 * ESPERADO — a fila existe exatamente pra isso desde a 2.0.103. Rede fora não é anomalia;
 * CF quebrada é. Por isso são DUAS regras opostas e as duas precisam de trava:
 *   • recusa do servidor  → reporta SEMPRE (ele examinou e disse não)
 *   • erro de rede        → NÃO reporta (é o desenho funcionando)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a queda do placar não é silenciosa ────');

const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');

/* Recorta o bloco da chamada da CF — ancorado no construto, nunca em janela fixa. */
const ini = src.indexOf("if (typeof window._callApplyMatchResult === 'function') {");
ok('⭐ achei o bloco da porta do placar', ini > 0);
const bloco = src.slice(ini, src.indexOf('\n    var r = true;', ini));
ok('  → e ele tem os dois ramos (recusa e exceção)',
  /recusou/.test(bloco) && /falhou \(/.test(bloco));

/* ── ① recusa do servidor sobe ─────────────────────────────────────────────── */
const iRec = bloco.indexOf('recusou');
const ramoRecusa = bloco.slice(iRec, bloco.indexOf('} catch (e) {', iRec));
ok('⭐⭐ RECUSA do servidor vai pro Sentry', /_captureException/.test(ramoRecusa),
  'sem isto, servidor negando placar é invisível — foi o buraco que me enganou');
ok('  → sem filtro: recusa reporta SEMPRE (não é caso esperado)',
  !/navigator\.onLine|unavailable/.test(ramoRecusa));

/* ── ② erro de rede NÃO sobe ───────────────────────────────────────────────── */
const ramoErro = bloco.slice(bloco.indexOf('} catch (e) {'));
ok('⭐⭐ o ramo de exceção também reporta', /_captureException/.test(ramoErro));
ok('⭐⭐ …mas FILTRA rede antes (cota de telemetria)',
  /navigator\.onLine/.test(ramoErro) && /unavailable/.test(ramoErro),
  'sem o filtro, cada quadra sem sinal vira evento e a cota vence — já aconteceu na 2.0.81');
ok('  → o filtro NEGA o envio (é guard, não enfeite)', /if \(!_semRede/.test(ramoErro));
ok('  → e o envio é protegido por try (telemetria nunca derruba o placar)',
  /try \{[\s\S]{0,200}_captureException/.test(ramoErro));

/* ── ③ a queda é a FILA, não o motor do cliente ────────────────────────────── */
// Regressão que este teste guarda: alguém "restaurar" o motor local aqui reabriria o
// que a 2.0.103 fechou — clientes de versões diferentes derivando avanço de chave.
// ⚠️ COMPARA SÓ CÓDIGO. A primeira versão desta asserção reprovou sozinha porque o bloco
// tem um comentário explicando ONDE o motor local FICAVA — a prosa que documenta a
// remoção casava com o padrão que procura a remoção. Teste que lê comentário como código
// falha sem defeito, e teste que falha sem defeito ensina a ignorar teste.
const semComentario = bloco
  .replace(/\/\*[\s\S]*?\*\//g, '')      // blocos /* … */
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
ok('⛔ a queda NÃO reintroduz o motor local do cliente',
  !/_applyResultToTournament/.test(semComentario),
  'ordem do dono: "imagina diferentes clientes com diferentes versões... de forma alguma. tudo na cf"');
ok('  → e a asserção olha CÓDIGO, não prosa (o comentário que cita o motor segue lá)',
  /_applyResultToTournament/.test(bloco) && !/_applyResultToTournament/.test(semComentario));

/* ── ④ o medidor não descreve mais o mundo antigo ──────────────────────────── */
const med = fs.readFileSync(path.join(ROOT, 'scripts/medir-porta-do-placar.js'), 'utf8');
ok('⭐ o script de medição declara que a queda é a FILA (o cabeçalho vencido me enganou)',
  /a queda é a FILA/.test(med));
ok('⭐ e declara que é cego a torneio dividido', /CEGO A TORNEIO DIVIDIDO/.test(med));

console.log(falhas === 0 ? '\n✅ queda-do-placar-nao-e-silenciosa: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
