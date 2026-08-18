/* A CHAVE PINTA EM DUAS TACADAS — e nenhuma delas pode ficar pelo caminho (1.9.40).
 *
 * Medido no navegador, na chave real do Confra (102 jogos, ~6.000 nós):
 *   • tela inteira de uma vez: ~1.500ms até aparecer QUALQUER coisa;
 *   • só o cabeçalho + o 1º grupo: 57ms;
 *   • e, com `content-visibility` ligado, remover TODO o estilo inline restante
 *     (291 KB) economiza 49ms — ou seja, o custo restante é a QUANTIDADE de nós.
 * Daí a pintura em etapas. O risco dela é entregar meia tela — que é exatamente o
 * defeito que o dono relatou hoje ("renderiza um pedaço e corta o resto"). Este teste
 * guarda as três coisas que impedem isso.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== a chave pinta em etapas ==');

// 1. o corpo não pode depender de UM agendador só
const fn = (src.match(/function _pintarEmEtapas[\s\S]*?\n}/) || [''])[0];
ok(/requestAnimationFrame/.test(fn), 'agenda por quadro (rAF) — a tacada 2 não trava a primeira pintura');
ok(/setTimeout\(/.test(fn), 'E por timeout: rAF NÃO dispara em aba de fundo — sem esta rede a pessoa ficaria só com o cabeçalho');
ok(/feito\s*=\s*true/.test(fn) || /if \(feito\) return/.test(fn), 'trava de uma-vez-só: os dois agendadores não pintam o corpo duas vezes');
ok(/insertAdjacentHTML/.test(fn), 'a 2ª tacada ANEXA (não reescreve o que já está na tela)');
ok(/catch[\s\S]{0,80}innerHTML = leve \+ pesado/.test(fn), 'se o anexo falhar, cai pro HTML inteiro — nunca fica meia tela');

// 2. existe descarga síncrona (é o que o headless usa pra medir a chave inteira)
ok(/window\._flushBracketPaint\s*=\s*function/.test(src), 'há uma porta síncrona pra pintar o corpo agora');

// 3. o que lê o DOM inteiro roda DEPOIS da 2ª tacada, nunca entre elas
// (contagem simples em vez de casar o bloco inteiro: a chamada pesada tem parênteses
// aninhados — `renderStandings(…)` — e qualquer regex "até o primeiro );" mede errado.)
const nEtapas = (src.match(/(?<!function )_pintarEmEtapas\(container/g) || []).length;   // a definição não conta
const nDepois = (src.match(/,\s*_applyMyMatchesFilter\);/g) || []).length;
ok(nEtapas >= 3, 'os ramos pesados da chave usam a pintura em etapas (achei ' + nEtapas + ')');
ok(nDepois === nEtapas,
   'todo ramo entrega o filtro como "depois" (' + nDepois + '/' + nEtapas + ') — rodá-lo entre as tacadas veria meia chave');

// 4. a ORDEM na tela não muda: quem vinha depois do corpo viaja com o corpo
ok(/return renderGroupStage\([^)]*\) \+ standbyHtml;/.test(src),
   'lista de espera não pula pra cima dos grupos (ela vem DEPOIS do corpo, então viaja com ele)');

console.log((fail ? '❌' : '✅') + ' chave-pinta-em-etapas: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
