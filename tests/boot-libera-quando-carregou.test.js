'use strict';
/* O SPLASH SÓ SAI QUANDO OS DADOS CARREGARAM — node tests/boot-libera-quando-carregou.test.js
 *
 * Ordem do dono (11/ago/2026), depois de pedir "várias vezes":
 *   "o programa abre sem ter tudo carregado e daí tentamos ir rapidamente para encontrar o
 *    torneio e fica travando tudo por uns 4segs e acaba com a experiência"
 *   "pode ficar mais tempo no carregando e só abrir quando tudo da dashboard estiver
 *    efetivamente carregado"
 *   "não tem que ter definição de tempo. tem que ser LIBERA QUANDO CARREGOU"
 *
 * POR QUE ESTE TESTE EXISTE: o mecanismo de esperar o primeiro snapshot JÁ EXISTIA e mesmo
 * assim o app abria vazio — porque por cima dele havia um TETO GLOBAL de 3,5s que revelava
 * "mesmo com dados lentos" (estava escrito assim no código). O relógio ganhava do dado.
 * Reação do dono ao ouvir que o mecanismo existia: "se existe não funciona".
 *
 * Estas asserções travam a INVERSÃO: dado manda; tempo só decide em FALHA. */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error('  ✗ ' + n); } };

const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('\n📋 Quem libera a tela é o DADO, não o relógio');

// 1) O teto global era o defeito — não pode voltar.
ok('não existe TETO GLOBAL revelando por tempo',
  !/_markBootReady\(\s*\d+\s*,\s*['"]global-cap/.test(store));
ok('  → e o motivo está registrado no lugar onde ele existia',
  /TETO GLOBAL DE 3,5s FOI REMOVIDO|NÃO reintroduzir um teto/.test(store));

// 2) NENHUM caminho de reveal aceita número de milissegundos.
const chamadas = (store + router).match(/_markBootReady\([^)]*\)/g) || [];
const comTempo = chamadas.filter((c) => /\d{3,}/.test(c));
ok('nenhuma chamada de _markBootReady passa tempo (' + chamadas.length + ' chamadas)',
  comTempo.length === 0);
if (comTempo.length) console.error('     → com tempo:', comTempo.join(' , '));

// 3) A assinatura não aceita mais piso — se aceitar, alguém volta a usar.
ok('a função assina só o rótulo (sem minMs)',
  /_markBootReady = function\(\s*_label\s*\)/.test(store));
ok('  → e não adia por tempo lá dentro (sem setTimeout de piso)',
  !/_markBootReady = function[\s\S]{0,700}setTimeout\([\s\S]{0,80}minMs/.test(store));

// 4) O piso do SHELL também segurava depois de carregar.
ok('o shell não tem piso de tempo (MIN_MS = 0)', /var MIN_MS = 0;/.test(shell));

// 5) O reveal por dados acontece DEPOIS do snapshot e do perfil.
ok('o reveal por dados vem depois do 1º snapshot',
  store.indexOf("_waitingForFirstSnapshot = false") < store.indexOf("_markBootReady('dados-prontos')"));
// (janela maior: entre o guard e o reveal há o desvio de deep-link)
ok('  → e espera o PERFIL carregar antes de revelar',
  store.indexOf('_profileLoaded !== true') > 0 &&
  store.indexOf('_profileLoaded !== true') < store.indexOf("_markBootReady('dados-prontos')"));

// 6) ⚠️ A ÚNICA saída por tempo é FALHA — e ela tem que continuar existindo, senão o app
//    fica preso no splash pra sempre quando o Firestore não responde.
ok('sobra a saída de FALHA do Firestore (senão trava pra sempre)',
  /_markBootReady\('5s-fallback'\)/.test(store));
ok('  → e ela está dentro do fallback de "servidor não respondeu"',
  /_waitingForFirstSnapshot[\s\S]{0,400}_markBootReady\('5s-fallback'\)/.test(store));

console.log((fail ? '✗' : '✅') + ' boot-libera-quando-carregou: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
