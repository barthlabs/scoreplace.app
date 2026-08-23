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

console.log('\n① A régua existe, e é UMA');
t(/window\._cardNomeGeo = function/.test(MD),
  '_cardNomeGeo mora no bracket-model.js — o arquivo onde vivem as réguas do card');
t(/avatar:[^,]+,[\s\S]{0,200}?boxH:[\s\S]{0,200}?maxRem:[\s\S]{0,200}?minRem:/.test(MD),
  'e devolve as quatro medidas: foto, altura da caixa, teto e piso da fonte');

console.log('\n② Os dois desenhos de card leem a régua (nenhum crava número)');
t(/window\._cardNomeGeo\(members\.length\)/.test(BR), 'o card da CHAVE lê _cardNomeGeo');
t(/window\._cardNomeGeo\(2\)/.test(DB), 'o card da DASHBOARD lê _cardNomeGeo');
t(!/const _nomeMaxRem = members\.length > 1 \? [\d.]+ : [\d.]+;/.test(BR),
  '⛔ a chave não tem mais o teto da fonte cravado no próprio arquivo');
t(!/width:28px;height:28px;border-radius:50%;object-fit:cover/.test(DB),
  '⛔ a dashboard não tem mais a foto de 28px cravada');

console.log('\n③ A caixa invisível e o ajuste de nome valem nos DOIS');
t(/class="sp-mc-box"/.test(BR) && /class="sp-mc-box"/.test(DB),
  'os dois põem o nome dentro da caixa de tamanho fixo (.sp-mc-box)');
t(/sp-name-fit/.test(BR) && /sp-name-fit/.test(DB),
  'os dois marcam o nome com .sp-name-fit — é o que faz a fonte ceder em vez de cortar');
t(/data-fit-group/.test(BR) && /data-fit-group/.test(DB),
  'os dois marcam o grupo da dupla, pra os dois nomes do time quebrarem juntos');
t(!/text-overflow:ellipsis;white-space:nowrap;"><span' \+ _uidAttr/.test(DB),
  '⛔ E A DASHBOARD PAROU DE CORTAR O NOME com reticências — era a violação mais grave');

console.log('\n④ O grupo da quebra é por LADO, nunca por card');
t(/um grupo por LADO/.test(DB) && /_grupoMini = 'd' \+ window\._fitGroupSeq/.test(DB),
  'na dashboard o contador anda dentro de _teamHtml (um por time), não uma vez por card');
t(/window\._fitGroupSeq = \(window\._fitGroupSeq \|\| 0\) \+ 1;/.test(BR),
  'e na chave idem, dentro do desenho de um lado');

console.log('\n⑤ O número do placar sai da mesma classe nos dois');
t(/class="sp-mc-num"/.test(BR), 'a chave usa .sp-mc-num');
t((DB.match(/sp-mc-num/g) || []).length >= 4,
  'a dashboard usa .sp-mc-num no placar pendente E no decidido (' + (DB.match(/sp-mc-num/g) || []).length + ' usos)');
t(!/font-size:1rem;font-weight:800;color:'\+_corPlacar2/.test(DB),
  '⛔ e não sobrou 1rem cravado no placar decidido da dashboard');
t(/\.sp-mc-num\{[^}]*font-size:var\(--sp-num-fs\)/.test(read('css/components.css')),
  'e a classe tira o tamanho de --sp-num-fs, que é a fonte única desse número');

console.log('\n' + (falhas ? '✗ ' + falhas + '/' + (ok + falhas) + ' falharam' : '✓ ' + ok + '/' + ok + ' passaram'));
process.exit(falhas ? 1 : 0);
