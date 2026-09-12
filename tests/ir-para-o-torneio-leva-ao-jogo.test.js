'use strict';
/* "Ir para o torneio" tem de cair NO JOGO — e a barra de busca da chave é UMA só.
 *
 * Relatos do dono (11/set/2026, 2.2.70 no ar):
 *  ① _"ao clicar em ir para o torneio, deveria ir para o jogo onde está o botão, e não foi"_ —
 *    o botão levava só o GRUPO (`sp_scrollToGroup`), e na fase ELIMINATÓRIA não há grupo.
 *  ② _"e aqui uma barra de busca/filtro duplicada"_ — dois emissores podem coincidir e nascem
 *    dois `#bracket-search`; `getElementById` devolve o primeiro e digitar no outro não filtra.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
const brk = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// ① o botão leva o jogo
must(/function _grupoHeadHtml\(grupo, tName, cor, attr, inline, tId, matchId\)/.test(dash),
  'o cabeçalho recebe o id do JOGO, não só o do torneio');
must(/sp_scrollToMatch/.test(dash), 'e grava `sp_scrollToMatch` no clique');
must(/sp_scrollToGroup/.test(dash), '⛔ sem perder o grupo — quem tem grupo continua caindo nele');
{
  const chamadas = dash.match(/_grupoHeadHtml\(/g) || [];
  must(chamadas.length >= 4, 'todas as chamadas continuam existindo (3 + a definição)');
  must(!/_grupoHeadHtml\([^)]*true, (it|u|g)\.tId\)/.test(dash.replace(/\s+/g, ' ')),
    '⛔ nenhuma chamada ficou sem passar o jogo');
}
// a chave consome o pedido
must(/getElementById\('card-' \+ String\(_pm\)\)/.test(brk), 'a chave procura o card do jogo pedido');
must(brk.indexOf("sessionStorage.getItem('sp_scrollToMatch')") < brk.indexOf("sessionStorage.getItem('sp_scrollToGroup')"),
  'o jogo é tentado ANTES do grupo — é o alvo mais específico');
must(/removeItem\('sp_scrollToGroup'\); sessionStorage\.removeItem\('sp_scrollToMatch'\)/.test(brk),
  '⛔ e o pedido é limpo no fim, senão a próxima entrada herda um alvo velho');

// ② a barra de busca não duplica
must(/querySelectorAll\('#fbwrap-chaves'\)/.test(store), 'o DOM é varrido atrás de barras repetidas');
must(/querySelectorAll\('#bracket-search-empty'\)/.test(store), 'e do aviso de "nenhum jogo" repetido');
must(/for \(var _i = 1; _i < _todas\.length; _i\+\+\)/.test(store),
  '⛔ sobra a PRIMEIRA barra — as demais saem (id repetido quebra o getElementById)');

console.log('✅ ' + ok + ' asserções — o botão leva ao jogo e a barra de busca é uma só');
