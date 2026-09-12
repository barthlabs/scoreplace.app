'use strict';
/* ⛔ RECARREGAR PRA DENTRO DO MESMO DEFEITO NÃO É RECUPERAR.
 * Relato do dono (12/set/2026, emulador Android): _"o problema continua na emular"_ — a tela
 * "Não consegui desenhar sua tela", e recarregar caía nela de novo.
 * MEDIDO: `FIRESTORE (12.17.1) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)
 * CONTEXT: {"rl":"Failed to read large IndexedDB value"}` — o SDK não consegue LER um valor que
 * ele mesmo gravou em pedaços no cache. Dois buracos, ambos necessários:
 *   ① o erro estourava DENTRO do render e a rede de erro do router o ENGOLIA: nunca chegava ao
 *     `window.onerror`, que é a única porta onde a recuperação estava ligada;
 *   ② e a recuperação só recarregava — relendo o MESMO valor quebrado.
 * O cache do Firestore é espelho do servidor: é DESCARTÁVEL. Joga fora e recarrega.
 * [[feedback_init_que_morre_no_meio_e_silencioso]] · [[feedback_try_catch_nao_pega_promessa]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const SEN = fs.readFileSync(path.join(raiz, 'js/sentry-init.js'), 'utf8');
const ROT = fs.readFileSync(path.join(raiz, 'js/router.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
/* comparar CÓDIGO, não comentário: os comentários CITAM o padrão antigo pra explicar o defeito */
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① quem ENGOLE o erro tem de mostrá-lo ao detector ───────────────────────
const iniR = ROT.indexOf('} catch (_erroRender) {');
assert.ok(iniR > 0, 'âncora: a rede de erro do router');
const rede = semComentario(ROT.slice(iniR, iniR + 2400));
must(/window\._recuperarFirestoreSePreciso/.test(rede),
  '① a rede de erro do router entrega o erro ao detector do Firestore');
must(/_erroRender && _erroRender\.message/.test(rede),
  '① e entrega a MENSAGEM (é nela que a assertiva do Firestore aparece)');
must(/typeof window\._recuperarFirestoreSePreciso === 'function'/.test(rede),
  '① guardado por typeof: se o sentry-init não carregou, a tela de erro ainda pinta');

// ── ② o detector é PÚBLICO — senão só o onerror o alcança ───────────────────
const sen = semComentario(SEN);
must(/window\._recuperarFirestoreSePreciso = function/.test(sen),
  '② o detector está exposto em window, ao alcance de quem captura fora do onerror');

// ── ③ e a recuperação JOGA O CACHE FORA antes de recarregar ─────────────────
const iniL = SEN.indexOf('function _limparCacheDoFirestore');
assert.ok(iniL > 0, 'âncora: a limpeza do cache');
const limpa = semComentario(SEN.slice(iniL, SEN.indexOf('function _maybeRecoverFirestore')));
must(/\.terminate\(\)/.test(limpa), '③ solta o IndexedDB (terminate) antes de apagar');
must(/\.clearPersistence\(\)/.test(limpa), '③ apaga o cache pela porta do SDK (clearPersistence)');
must(/_apagarBancosDoFirestore\(\)/.test(limpa),
  '③ e, se a porta do SDK falhar, apaga o banco na unha — o defeito é justamente o SDK travado');
const iniA = SEN.indexOf('function _apagarBancosDoFirestore');
assert.ok(iniA > 0 && iniA < iniL, 'âncora: a remoção na unha');
const unha = semComentario(SEN.slice(iniA, iniL));
must(/indexedDB\.databases\(\)/.test(unha),
  '③ ⛔ o nome do banco se ENUMERA, não se chuta (o SDK o monta com o projectId e a base)');
must(/indexOf\('firestore\/'\) === 0/.test(unha), '③ e só bancos do Firestore são apagados');
must(!/scoreplace-app/.test(unha),
  '③ ⛔ nenhum projectId cravado à mão — erraria calado em staging e em 2ª base');
must(/indexedDB\.deleteDatabase\(nome\)/.test(unha), '③ apaga cada um pelo nome que encontrou');
must(/onblocked = _menos/.test(unha),
  '③ e banco BLOQUEADO não pendura a recuperação (outra aba segurando a conexão)');
must(/setTimeout\(pronto, 3000\)/.test(limpa),
  '③ com teto de tempo: recuperação que trava seria pior que a doença');

const iniM = SEN.indexOf('function _maybeRecoverFirestore');
const rec = semComentario(SEN.slice(iniM, iniM + 2000));
const posLimpa = rec.indexOf('_limparCacheDoFirestore()');
const posReload = rec.indexOf('window.location.reload()');
must(posLimpa > 0 && posReload > posLimpa,
  '③ ⛔ a ordem importa: limpa PRIMEIRO, recarrega DEPOIS (recarregar antes relê o valor podre)');
must(/sessionStorage\.getItem\('sp_fsRecovered'\)/.test(rec),
  '③ uma recuperação por sessão: nunca vira laço de recarregar');

// ── ④ o detector reconhece ESTE erro ────────────────────────────────────────
const iniF = SEN.indexOf('function _fsFatal');
const detector = SEN.slice(iniF, iniF + 500);
const re = /\/([^/]+)\/i/.exec(detector);
assert.ok(re, 'âncora: a expressão do detector');
const regra = new RegExp(re[1], 'i');
must(regra.test('FIRESTORE (12.17.1) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) '
  + 'CONTEXT: {"rl":"Failed to read large IndexedDB value"}'),
  '④ o erro REAL do emulador casa com o detector');
must(!regra.test('TypeError: undefined is not a function'),
  '④ ⛔ e um erro comum de render NÃO dispara limpeza de cache');

console.log('\n✅ cache podre do Firestore se joga fora — ' + ok + ' verificações');
