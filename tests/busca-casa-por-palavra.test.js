/* A BUSCA CASA POR PALAVRA, NÃO POR TRECHO CONTÍGUO.
 *   node tests/busca-casa-por-palavra.test.js
 *
 * ⛔ O BUG (relato do dono, produção 2.1.105): _"se escreve por exemplo ana r, deveria
 * aparecer ana r… mas está sumindo tudo. deveria aparecer ana ribeiro, mesmo se
 * escrevêssemos só rib"_. O matcher era `indexOf` do trecho INTEIRO: bastava a consulta
 * cruzar uma fronteira do palheiro (o " / " da dupla, o " | " que separa os nomes no
 * `data-players`, um nome do meio) pra "ana r" não existir como trecho — e aí a busca
 * escondia TUDO, que é o pior resultado possível: parece que a pessoa não está no torneio.
 *
 * ⛔ POR QUE PASSOU BATIDO: `tests/cabecalho-e-busca-fixos-no-celular.test.js` exercita a
 * busca de ponta a ponta em navegador REAL — mas só com consulta de UMA palavra
 * ("Fulano7", "Beltrano3"). Consulta com espaço nunca rodou. Teste verde com a busca
 * quebrada. Este arquivo fecha exatamente essa lacuna.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { window: {}, console: console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const norm = src.match(/window\._bracketNorm = function[\s\S]*?\n};/);
const casa = src.match(/window\._buscaCasa = function[\s\S]*?\n};/);
if (!norm || !casa) { console.error('✗ não achei _bracketNorm/_buscaCasa em js/views/bracket.js'); process.exit(1); }
vm.runInContext(norm[0] + '\n' + casa[0], ctx);
const _casa = (h, q) => ctx.window._buscaCasa(h, q);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n── o caso do dono: "ana r" e "rib" acham Ana Ribeiro ──');
const dupla = 'ANDREYA NOVAZZI / Ana Ribeiro | ANDREYA NOVAZZI | Ana Ribeiro';
ok(_casa(dupla, 'ana'), '"ana" acha');
ok(_casa(dupla, 'ana r'), '⭐ "ana r" acha — era isto que sumia tudo');
ok(_casa(dupla, 'rib'), '⭐ "rib" acha pelo meio da palavra');
ok(_casa(dupla, 'ana ribeiro'), '"ana ribeiro" acha');

console.log('\n── as fronteiras que o trecho contíguo não vencia ──');
ok(_casa('Ana | Ribeiro Souza', 'ana r'), '⛔ nome cruzando o "|" da lista de nomes');
ok(_casa('Ana Maria Ribeiro', 'ana rib'), '⛔ nome do meio entre os dois termos');
ok(_casa('Ribeiro, Ana', 'ana ribeiro'), '⛔ ordem trocada no palheiro');
ok(_casa('ANDREYA NOVAZZI / Ana Ribeiro', 'ribeiro andreya'), '⛔ termos de lados opostos da dupla');

console.log('\n── e continua FILTRANDO (não virou "mostra tudo") ──');
ok(!_casa(dupla, 'zzz'), 'quem não está não aparece');
ok(!_casa(dupla, 'ana zzz'), '⭐ TODA palavra precisa aparecer — uma só não basta');
ok(!_casa('', 'ana'), 'palheiro vazio não casa');
ok(_casa(dupla, ''), 'consulta vazia casa com todos (é o estado sem filtro)');
ok(_casa(dupla, '   '), 'consulta só de espaços idem');

console.log('\n── acento e caixa, como o resto do app ──');
ok(_casa('Tiago Lucía Peçanha', 'lucia'), 'acento no palheiro não atrapalha');
ok(_casa('Tiago Lucia Pecanha', 'LUCÍA'), 'acento e caixa na consulta idem');

console.log('\n' + (fail ? '❌ ' + fail + ' FALHA(S)' : '✅ busca-casa-por-palavra: OK') + '  (' + pass + ' asserts ok)');
if (fail) process.exit(1);
