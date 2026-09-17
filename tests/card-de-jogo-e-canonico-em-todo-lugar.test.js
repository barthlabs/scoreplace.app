/* O CARD DE JOGO É CANÔNICO EM TODO LUGAR — não só na chave.
 *
 * Ordem do dono (23/ago/2026), depois de ver o card da chave certo e o da tela inicial
 * errado: _"implemente em todos os cards de forma canônica. Não só no Novidades, ou nos
 * Últimos Resultados, ou nas chaves dos torneios. Implemente em TODOS os cards de torneio."_
 *
 * A doença: existem DOIS desenhos de card de jogo, e isso é legítimo — o da chave tem coroa,
 * substituição e BYE; o da dashboard tem "(você)" e "Ir para o torneio". O que NÃO podia
 * existir em dois lugares eram os NÚMEROS. A dashboard tinha foto de 28px e nome de 0,8rem
 * CRAVADOS, e — o pior — `text-overflow:ellipsis`: ela CORTAVA o nome, que é exatamente o
 * que o cânone da caixa invisível proíbe ("o nome nunca é cortado; a caixa é igual pra todo
 * mundo e a FONTE é que cede").
 *
 * A cura: `window._cardNomeGeo(nMembros)` (bracket-model.js, o arquivo da régua) devolve
 * foto, altura da caixa, teto e piso da fonte. Os dois desenhos leem DE LÁ. O markup segue
 * sendo de cada um; os números, não.
 *
 * ⚠️ Este teste é de FONTE, não de tela: ele cobra que ninguém volte a cravar número no
 * próprio arquivo. A tela dessas caixas é medida em tests/placar-na-chave-nao-pula.test.js
 * e tests/placar-por-sets-no-card.test.js.
 *
 * Roda com: node tests/card-de-jogo-e-canonico-em-todo-lugar.test.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let ok = 0, falhas = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { falhas++; console.log('  ✗ ' + msg); }
}

const BR = read('js/views/bracket.js');
const DB = read('js/views/dashboard.js');
const MD = read('js/views/bracket-model.js');
const recentIni = DB.indexOf('// ── Últimos resultados confirmados');
const recentFim = DB.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const RECENT = DB.slice(recentIni, recentFim);

console.log('\n① A régua existe, e é UMA');
t(/window\._cardNomeGeo = function/.test(MD),
  '_cardNomeGeo mora no bracket-model.js — o arquivo onde vivem as réguas do card');
/* ⛔ recorte por ÂNCORA, não por orçamento de caracteres: a versão anterior media 200 chars
 * entre uma chave e a próxima e quebrou sozinha quando a régua ganhou um comentário — sem que
 * nada do comportamento mudasse. O que importa é que as QUATRO medidas saem daqui, nesta ordem. */
const _geoIni = MD.indexOf('window._cardNomeGeo = function');
const _geoFim = MD.indexOf('\n  };', _geoIni);
const GEO = (_geoIni > 0 && _geoFim > _geoIni) ? MD.slice(_geoIni, _geoFim) : '';
t(GEO && ['avatar:', 'boxH:', 'maxRem:', 'twoLineMaxRem:', 'minRem:'].every((k, i, arr) =>
    GEO.indexOf(k) > 0 && (i === 0 || GEO.indexOf(arr[i - 1]) < GEO.indexOf(k))),
  'e devolve foto, altura da caixa, teto de uma e duas linhas e piso da fonte');

console.log('\n② Os dois desenhos de card leem a régua (nenhum crava número)');
t(/window\._cardNomeGeo\(members\.length\)/.test(BR), 'o card da CHAVE lê _cardNomeGeo');
t(/window\._cardNomeGeo\(2\)/.test(DB), 'o card da DASHBOARD lê _cardNomeGeo');
t(!/const _nomeMaxRem = members\.length > 1 \? [\d.]+ : [\d.]+;/.test(BR),
  '⛔ a chave não tem mais o teto da fonte cravado no próprio arquivo');
t(!/width:28px;height:28px;border-radius:50%;object-fit:cover/.test(DB),
  '⛔ a dashboard não tem mais a foto de 28px cravada');

console.log('\n③ A caixa invisível e o ajuste de nome valem nos DOIS');
t(/class="sp-mc-box"/.test(BR) && RECENT.includes('window.renderMatchCard(m2'),
  'Últimos Resultados recebe a caixa de tamanho fixo do card canônico (.sp-mc-box)');
t(/sp-name-fit/.test(BR) && RECENT.includes('window.renderMatchCard(m2'),
  'Últimos Resultados recebe .sp-name-fit do card canônico — a fonte cede em vez de cortar');
t(/data-two-line-maxrem/.test(BR) && RECENT.includes('window.renderMatchCard(m2'),
  'Últimos Resultados recebe o teto de duas linhas do card canônico');
t(!/text-overflow:ellipsis;white-space:nowrap;"><span' \+ _uidAttr/.test(DB),
  '⛔ E A DASHBOARD PAROU DE CORTAR O NOME com reticências — era a violação mais grave');

console.log('\n④ A quebra é individual, não contagia o parceiro');
t(!/data-fit-group/.test(BR) && !/data-fit-group/.test(DB),
  'chave e dashboard não forçam o nome curto a quebrar junto com o nome longo');

console.log('\n⑤ O número do placar sai da mesma classe nos dois');
t(/class="sp-mc-num"/.test(BR), 'a chave usa .sp-mc-num');
t(RECENT.includes('window.renderMatchCard(m2') && /class="sp-mc-num"/.test(BR),
  'a dashboard recebe .sp-mc-num do card canônico no placar decidido');
t(!/font-size:1rem;font-weight:800;color:'\+_corPlacar2/.test(DB),
  '⛔ e não sobrou 1rem cravado no placar decidido da dashboard');
t(/\.sp-mc-num\{[^}]*font-size:var\(--sp-num-fs\)/.test(read('css/components.css')),
  'e a classe tira o tamanho de --sp-num-fs, que é a fonte única desse número');

console.log('\n' + (falhas ? '✗ ' + falhas + '/' + (ok + falhas) + ' falharam' : '✓ ' + ok + '/' + ok + ' passaram'));
process.exit(falhas ? 1 : 0);
