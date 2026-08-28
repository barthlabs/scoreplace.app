/* O FILTRO NÃO ESCONDE QUEM NÃO TEM O DADO — E NUNCA ESVAZIA A TELA CALADO
 * node tests/filtro-nao-esconde-quem-nao-tem-o-dado.test.js
 *
 * RELATO DO DONO (28/ago/2026): criou um torneio, inscreveu 8 placeholders, e a tela de
 * inscritos veio VAZIA — com os contadores dizendo "Todos (8)". Conclusão natural de quem
 * está olhando: "os inscritos sumiram".
 *
 * ⭐ NADA SUMIU. Medido no banco na hora: os 8 estavam no documento
 * (`{name:'Jogador 01', displayName:'Jogador 01', isPlaceholder:true}`) E na subcoleção
 * `inscritos`. Os CARDS também estavam no DOM. O que os apagou foi
 * `c.style.display = 'none'` — o filtro de GÊNERO.
 *
 * A CAUSA: placeholder é vaga sem conta, então não tem gênero, e `data-part-gender` cai
 * em `'none'`. Com o ♂ aceso, `g === gf` é falso pros oito e todos somem.
 * ⛔ Filtrar por ♂ quer dizer "me mostre os homens". Um placeholder NÃO É "não-homem" —
 * é DESCONHECIDO. Esconder o desconhecido é tratar "não sei" como "não é", que é
 * exatamente o erro que no MESMO DIA apagou placar já confirmado
 * ([[project_proposta_apagava_resultado_confirmado]]). Duas telas, um vício.
 *
 * ⚠️ E o estrago passava de estético: sem a lista, o organizador não alcança o botão de
 * sortear. O torneio recém-criado ficava intransitável.
 *
 * ⛔ A SEGUNDA METADE DO DEFEITO: a linha que avisaria ("part-search-empty") existia desde
 * sempre, mas o elemento NUNCA era renderizado por ninguém — `grep` em js/views/ dava UMA
 * ocorrência, a que o lê. O `if (empty)` engolia a ausência em silêncio. Intenção de
 * avisar escrita, aviso inexistente: o pior dos dois mundos, porque parece coberto.
 *
 * COMO ELE MEDE: extrai a REGRA DE FILTRO real do participants.js e a executa. Não é
 * varredura de fonte — mudar o comportamento derruba as asserções.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'participants.js'), 'utf8');

// ── a regra REAL, extraída e executável ──────────────────────────────────────────
const i = src.indexOf('var okSearch = !q || nm.indexOf(q) !== -1;');
const j = src.indexOf('var okActive =', i);
ok(i > 0 && j > i, 'achei a regra de filtro no participants.js');
const corpo = src.slice(i, j);
const visivel = new Function('q', 'nm', 'gf', 'g', 'sk', 's', 'isMulti',
  corpo + ' return okSearch && okGender && okSkill;');

console.log('\n① O caso do relato: placeholder sem gênero, filtro de gênero aceso');
ok(visivel('', 'jogador 01', 'male', 'none', 'all', 'none', false),
   '⛔ com ♂ aceso, o placeholder APARECE — era isto que esvaziava a tela');
ok(visivel('', 'jogador 01', 'female', 'none', 'all', 'none', false),
   'e com ♀ também: "sem gênero" não é o oposto de nenhum gênero');
ok(visivel('', 'jogador 01', 'male', '', 'all', 'none', false),
   'atributo vazio (não só a string "none") tem o mesmo tratamento');

console.log('\n② Mas o filtro CONTINUA filtrando quem tem o dado');
ok(!visivel('', 'maria', 'male', 'female', 'all', 'none', false),
   '⛔ ♂ ainda esconde quem é female — senão o filtro não serviria pra nada');
ok(visivel('', 'joao', 'male', 'male', 'all', 'none', false),
   'e mostra quem é male');

console.log('\n③ Vale igual pro nível — mesma classe de dado ausente');
ok(visivel('', 'jogador 01', 'all', 'none', 'B', 'none', false),
   'quem não tem nível não é escondido pelo filtro de nível');
ok(!visivel('', 'joao', 'all', 'male', 'B', 'C', false),
   'mas quem é C continua fora do filtro B');

console.log('\n④ A BUSCA não foi afrouxada junto');
ok(!visivel('zzz', 'joao', 'all', 'male', 'all', 'none', false),
   '⛔ busca que não casa continua escondendo — o afrouxamento é só do dado AUSENTE');
ok(visivel('joa', 'joao', 'all', 'male', 'all', 'none', false), 'e a que casa mostra');

console.log('\n⑤ A tela nunca mais esvazia calada');
const trecho = src.slice(src.indexOf("var empty = document.getElementById('part-search-empty')"),
                         src.indexOf("var empty = document.getElementById('part-search-empty')") + 1400);
ok(/document\.createElement\('div'\)/.test(trecho),
   '⛔ o aviso é CRIADO quando falta — antes ele era só lido, e nunca existia');
ok(/insertBefore/.test(trecho), 'e entra antes do primeiro card, onde a pessoa está olhando');
ok(/ocultos/.test(trecho), 'dizendo quantos estão ocultos, não só "vazio"');
ok(/Limpe a busca ou os filtros/.test(trecho), 'e o que fazer pra vê-los');

console.log(falhas === 0
  ? '\n✅ o filtro esconde quem NÃO É, nunca quem NÃO SE SABE\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
