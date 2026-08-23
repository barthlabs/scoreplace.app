/* O AJUSTE DE NOME NÃO TRAVA MAIS A THREAD (o "trem" das builds 78-81)
 * node tests/ajuste-de-nome-nao-trava-a-thread.test.js
 *
 * A CAÇADA (o método, pra ninguém desfazer sem entender):
 *   • builds 78-81 mediram, NO IPHONE DO DONO, travadas de ~0,5-1,5s repetidas a
 *     cada ~1,2s: scroll morto ("pode tentar o quanto for"), chave cortada ao
 *     rolar, toque no card sem feedback por 2-3s;
 *   • a build 81 levou um perfilador que cronometra TODO setTimeout/setInterval:
 *     o relato voltou com "trechos: countdown-tick=0ms" — ou seja NENHUM timer
 *     passava de 180ms, e mesmo assim travava 1562ms. Isso ELIMINOU timers e
 *     deixou dois pontos cegos: requestAnimationFrame e observers;
 *   • é exatamente onde `_fitNames` roda (fatias por rAF + IntersectionObserver
 *     durante o scroll). MEDIDO no preview com 400 nomes (a chave do Confra tem
 *     ~408): 486ms por passada — 1,5s no iPhone — a cada render, ATÉ 12× pelo
 *     retry de 60ms, e de novo a cada rolagem.
 *   • CAUSA: layout thrashing. `_fitOne` escrevia `fontSize` e lia `scrollWidth`
 *     alternadamente, POR ELEMENTO — cada troca força um reflow SÍNCRONO — num
 *     laço de até 200 passos por nome.
 *
 * O CONSERTO (1.9.82) e o que este teste trava:
 *   1. o lote roda em FASES separadas (escreve todos → lê todos → escreve todos):
 *      reflow por LOTE, não por elemento;
 *   2. a convergência é BUSCA BINÁRIA em lote (≤7 iterações), não varredura
 *      linear de 200 passos — PROVADO no preview: tamanho final IDÊNTICO ao
 *      algoritmo antigo nos 400 nomes, 0 estouros de caixa, 486ms → 123ms;
 *   3. o retry caiu de 12× a 60ms para 3× a 220ms (quem nasce sem caixa é coberto
 *      por IntersectionObserver/ResizeObserver, que já existiam);
 *   4. as fatias correm rAF × timeout (rAF não dispara em aba de fundo — sozinho,
 *      deixaria metade dos nomes CORTADOS até a pessoa voltar ao app);
 *   5. a regra visual da v1.7.77 continua: no piso e ainda estourando, quebra linha
 *      (nunca vaza).
 *
 * ⚠️ ATUALIZADO EM 2.0.30 — este cabeçalho dizia "Altura estourada NÃO quebra (quebrar
 * aumentaria a altura)". A quebra deixou de ser último recurso: hoje TODO nome que não
 * cabe inteiro no TETO da fonte em uma linha vai para duas linhas equilibradas
 * (`_tentaDuasLinhasEmLote`), e a fonte só encolhe depois que duas linhas se esgotam.
 * A regra e o porquê estão em tests/nome-longo-quebra-em-duas-linhas.test.js.
 * O que ESTE teste guarda é o CUSTO: a forma nova também roda em lote, com leitura e
 * escrita em fases e busca binária com teto — senão volta o trem de travadas das 78-81.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── ajuste de nome não trava a thread ────');

const iLote = src.indexOf('var _fitEmLote = function (els) {');
ok(iLote > 0, 'existe o ajuste EM LOTE (_fitEmLote)');
const lote = src.slice(iLote, src.indexOf('window._fitNamesLote', iLote) + 60);

// 1. fases separadas: nenhuma leitura de layout entre escritas do mesmo passo
ok(/fase 1[\s\S]*?fase 2[\s\S]*?fase 3[\s\S]*?fase 4[\s\S]*?fase 5/.test(lote),
   'o lote roda em FASES (escreve todos → lê todos → escreve todos)');
ok(/dados\.forEach\(function \(d\) \{ d\.bw = d\.box\.clientWidth; d\.bh = d\.box\.clientHeight; \}\)/.test(lote),
   'as caixas são medidas numa varredura só (um layout para o lote)');

// 2. busca binária em lote, com teto de iterações
ok(/for \(var it = 0; it < 7 && vivos\.length; it\+\+\)/.test(lote),
   'convergência por BUSCA BINÁRIA em lote, com teto de 7 passos');
ok(/d\.mid = Math\.max\(d\.minR, Math\.floor\(\(\(d\.lo \+ d\.hi\) \/ 2\) \/ 0\.03\) \* 0\.03\)/.test(lote),
   'o passo é a MESMA grade de 0.03rem do algoritmo antigo (resultado idêntico)');
ok(/vivos\.forEach\(function \(d\) \{\s*d\.mid[\s\S]{0,200}\}\);\s*var restam = \[\];/.test(lote),
   'escrita do passo e leitura do passo ficam em varreduras SEPARADAS');

// ⛔ o laço linear com reflow por iteração não pode voltar
const iOne = src.indexOf('function _fitOne(el)');
const one = src.slice(iOne, src.indexOf('window._fitNameToBox', iOne));
ok(!/while \(guard\+\+ < 200/.test(one),
   'a varredura linear de 200 passos (um reflow por passo) NÃO existe mais');

// 3. retry curto
ok(/if \(pending && \(retry \|\| 0\) < 3\)/.test(src), 'o retry caiu para 3 tentativas');
ok(/window\._fitNames\(root, \(retry \|\| 0\) \+ 1\); \}, 220\)/.test(src), 'e ficou mais espaçado (220ms)');

// 4. fatias com corrida rAF × timeout e trava de uma vez
const iLo = src.indexOf('var _lote = function (fila, aoFim) {');
const lo = src.slice(iLo, iLo + 1200);
ok(/if \(seguiu\) return; seguiu = true;/.test(lo), 'a fatia seguinte tem trava de uma-vez-só');
ok(/requestAnimationFrame\(_segue\);[\s\S]{0,60}setTimeout\(_segue, 16\)/.test(lo),
   'e corre rAF × timeout (rAF não dispara em aba de fundo)');
ok(/> 8\)/.test(lo), 'o lote respeita orçamento de quadro (~8ms)');

// 5. regra visual preservada — a quebra existe, e é DELEGADA a quem sabe medi-la
ok(/d\.fsFinal < d\.maxR - 0\.001/.test(lote),
   'quem não coube no TETO da fonte em uma linha vai pra quebra (a regra da v1.7.77, ampliada)');
ok(/_tentaDuasLinhasEmLote\(_pQuebrar\)/.test(lote),
   'e a quebra é delegada ao helper que mede as duas linhas');

// 5b. o helper paga o MESMO pedágio: leitura e escrita em fases, busca binária com teto.
// Sem isto ele reintroduz o layout thrashing por outro caminho.
const iQ = src.indexOf('function _tentaDuasLinhasEmLote(itens) {');
ok(iQ > 0, 'existe o helper das duas linhas (_tentaDuasLinhasEmLote)');
const q = src.slice(iQ, src.indexOf('\n  }', iQ) + 4);
ok(/\(a\) só ESCRITA[\s\S]{0,600}\(b\) só LEITURA/.test(q),
   'escrita e leitura em fases separadas (um reflow por LOTE, não por elemento)');
ok(/d\.bw2 = d\.box\.clientWidth; d\.bh2 = d\.box\.clientHeight;/.test(q),
   'mede as caixas numa varredura só');
ok(/for \(var it = 0; it < 7 && vivos\.length; it\+\+\)/.test(q),
   'e converge por busca binária em lote, com o mesmo teto de 7 passos');
// ⛔ e a peneira de entrada tem que continuar existindo: sem ela TODO nome pagaria a
// busca extra, e medir layout é exatamente o que custou caro nas builds 78-81.
ok(/var temEspaco = \/\\s\/\.test/.test(lote),
   'nome sem espaço nem tenta duas linhas (não há onde quebrar — seria busca jogada fora)');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
