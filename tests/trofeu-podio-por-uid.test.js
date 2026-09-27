'use strict';
/* PÓDIO DO TROFÉU USA O UID DO RETRATO FINAL — node tests/trofeu-podio-por-uid.test.js
 *
 * Regressão: `classification` ainda é um mapa legado por rótulo. Duas entradas
 * com o mesmo nome podem coexistir; o troféu precisa olhar primeiro o retrato
 * congelado que registra a identidade do time. Jogador manual sem UID continua
 * somente no fallback por nome: não se inventa uma conta para ele.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window: W } = require('./headless');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'trophies.js'), 'utf8');
vm.runInContext(src, W, { filename: path.join(ROOT, 'js', 'trophies.js') });

let fail = 0;
function ok(value, message) { if (value) console.log('  ✓ ' + message); else { fail++; console.error('  ✗ ' + message); } }

const t = {
  participants: [
    { uid: 'uid-ana', displayName: 'Ana' },
    { uid: 'uid-bia', displayName: 'Ana' }
  ],
  /* O mapa legado não distingue as Anas: propositalmente coloca o nome em 1º.
   * O retrato diz que a Ana da conta uid-bia terminou em 5º. */
  classification: { Ana: 1 },
  classifFinalDaLinha: {
    main: [
      { name: 'Ana', pos: 1, uids: ['uid-ana'] },
      { name: 'Ana', pos: 5, uids: ['uid-bia'] },
      { name: 'Convidada', pos: 2, uids: [] }
    ]
  }
};

console.log('──── troféu de pódio por UID ────');
ok(W._userPodiumedInTournament(t, 'uid-ana') === true,
  '① a conta que está no retrato em 1º recebe pódio');
ok(W._userPodiumedInTournament(t, 'uid-bia') === false,
  '② ⛔ homônima em 5º não herda o 1º do mapa legado');

/* Sem UID no retrato não há identidade a inferir; preserva o caminho legado
 * para a pessoa digitada manualmente. */
const manual = { participants: [{ displayName: 'Convidada' }], classification: { Convidada: 2 }, classifFinalDaLinha: { main: [{ name: 'Convidada', pos: 5, uids: [] }] } };
ok(W._userPodiumedInTournament(manual, 'uid-inexistente') === false,
  '③ entrada manual sem UID não é associada a uma conta inventada');

console.log(fail ? '❌ ' + fail + ' falha(s)' : '✅ troféu de pódio por UID: OK');
process.exit(fail ? 1 : 0);
