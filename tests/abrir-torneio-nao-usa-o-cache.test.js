/* ABRIR O TORNEIO BUSCA O FRESCO — CACHE SERVE PRA PINTAR, NÃO PRA DECIDIR (2.0.97)
 * node tests/abrir-torneio-nao-usa-o-cache.test.js
 *
 * Relato do dono (25/ago/2026), logo depois de aprovar um placar:
 *   _"pelo que vejo foi aprovado, mas quando abri de novo não estava. Mas daí reiniciei e
 *    estava. inconsistência no load que não deveria acontecer"_
 *
 * CAUSA: `_ensureTournamentLoaded` tratava "não é resumo" como "já está carregado" e
 * devolvia o objeto de memória SEM buscar nada. Só que `_loadFromCache` enche
 * `AppStore.tournaments` com documentos COMPLETOS de até 24h atrás — e um completo velho
 * passa nesse teste. Resultado: abrir o torneio pintava o estado de ANTES da aprovação, e
 * só reiniciar (com o cache já trocado) mostrava o certo.
 *
 * ⛔ "Não é resumo" nunca quis dizer "está atualizado". Eram duas perguntas diferentes
 * respondidas pelo mesmo teste.
 *
 * O cache continua: ele pinta a lista na hora (é o ganho). O que muda é que ABRIR passa
 * a exigir o fresco.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// ① o cache marca o que entrega
ok(/_doCache = true/.test(src), '_loadFromCache marca os torneios que vieram do cache');
const carrega = src.slice(src.indexOf('_loadFromCache()'), src.indexOf('_loadFromCache()') + 2200);
ok(/_doCache = true/.test(carrega), 'e a marca é posta DENTRO do _loadFromCache (não em outro lugar)');

// ② abrir recusa tanto o resumo quanto o cache
const abrir = src.slice(src.indexOf('_ensureTournamentLoaded = function'),
                        src.indexOf('_ensureTournamentLoaded = function') + 1800);
ok(/_resumo === true\) local = null/.test(abrir), 'abrir continua recusando o RESUMO');
ok(/_doCache === true\) local = null/.test(abrir), 'e passa a recusar o que veio do CACHE');
ok(abrir.indexOf('_doCache === true') < abrir.indexOf('if (local) { cb(local); return; }'),
  'a recusa vem ANTES do atalho que devolve o objeto de memória');

// ③ a corrida: quem chegou primeiro só vale se for fresco
ok(/jaTem\._resumo !== true && jaTem\._doCache !== true/.test(abrir),
  'na corrida de duas buscas, o objeto já presente só serve se NÃO for resumo nem cache');

// ④ o cache não foi desligado — ele é o que pinta a lista na hora
ok(/_saveToCache\(\)/.test(src) && /localStorage\.setItem\(this\._cacheKey/.test(src),
  'o cache continua sendo gravado (o ganho de pintar rápido não se perde)');
ok(/86400000/.test(src), 'e continua valendo 24h para a LISTA');

console.log((fail ? '✗' : '✓') + ' abrir-torneio-nao-usa-o-cache: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
