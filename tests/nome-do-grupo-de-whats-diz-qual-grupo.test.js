/* O NOME SUGERIDO DO GRUPO DE WHATSAPP DIZ QUAL GRUPO É (2.0.93)
 * node tests/nome-do-grupo-de-whats-diz-qual-grupo.test.js
 *
 * Relato do dono (25/ago/2026): _"cliquei em criar grupo de whats do grupo I2 (que não é
 * o meu, mas sou organizador) e acabou abrindo no whats o meu grupo de participante"_.
 *
 * MEDIDO no doc ao vivo do Confra: o nome sugerido em modo GRUPO era "R{rodada}", então
 * os 35 grupos da rodada 1 recebiam o nome IDÊNTICO — "R1 · Beach Tennis · Confra ...".
 * 1 nome pra 35 grupos. O comentário do código dizia "sem colisão: cada pessoa está em um
 * só grupo por rodada", e isso valia quando só QUEM JOGAVA criava o grupo; desde a 2.0.57
 * é o ORGANIZADOR quem monta os grupos de todos.
 * O nome do grupo na chave ("R1 Grupo I2") já traz a rodada e resolve os dois.
 *
 * ⚠️ Este arquivo carrega o módulo INJETANDO a exportação DENTRO do IIFE. Sem isso o
 * `_groupName` que responde é outro, global, de outro módulo — e o teste mede a função
 * errada e passa achando que está certo. Foi o que aconteceu na primeira medição.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
win.document = globalThis.document;

let src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wa-group.js'), 'utf8');
const antes = src;
src = src.replace(/\n\}\)\(\);\s*$/, '\n  window.__nomeGrupo = _groupName;\n})();\n');
ok(src !== antes, 'não consegui injetar a exportação dentro do IIFE (o arquivo mudou de forma?)');
new Function('window', 'document', src)(win, globalThis.document);
ok(typeof win.__nomeGrupo === 'function', 'a exportação não chegou — o teste mediria outra função');

// torneio com DOIS grupos na MESMA rodada: é aí que o nome colidia
const g0 = { name: 'R1 Grupo A' }, g34 = { name: 'R1 Grupo I2' };
const mA = { id: 'm-a', isMonarch: true, round: 1, monarchGroup: 0 };
const mI2 = { id: 'm-i2', isMonarch: true, round: 1, monarchGroup: 1 };
const t = {
  id: 'tx', name: 'Confra BT 2026', sport: 'Beach Tennis',
  rounds: [{ monarchGroups: [g0, g34], matches: [mA, mI2] }],
};
const nomeA = win.__nomeGrupo({ t: t, m: mA, scope: 'match', groupMode: true });
const nomeI2 = win.__nomeGrupo({ t: t, m: mI2, scope: 'match', groupMode: true });

ok(nomeA !== nomeI2, 'dois grupos da MESMA rodada não podem sugerir o mesmo nome: ' + nomeA);
ok(/Grupo A/.test(nomeA), 'o nome tem que dizer o grupo, veio: ' + nomeA);
ok(/Grupo I2/.test(nomeI2), 'o nome tem que dizer o grupo, veio: ' + nomeI2);
ok(nomeI2.indexOf('Confra BT 2026') !== -1, 'o nome continua trazendo o torneio, veio: ' + nomeI2);
ok(nomeI2.indexOf('Beach Tennis') !== -1, 'o nome continua trazendo a modalidade, veio: ' + nomeI2);
// o grupo já traz a rodada — nada de "R1 · R1 Grupo I2"
ok(!/R1\s*·\s*R1/.test(nomeI2), 'a rodada não pode aparecer duas vezes, veio: ' + nomeI2);

// SEM âncora de grupo no jogo (doc legado) o fallback antigo continua valendo
const mSemIdx = { id: 'm-x', isMonarch: true, round: 2 };
const nomeFb = win.__nomeGrupo({ t: t, m: mSemIdx, scope: 'match', groupMode: true });
ok(/R2/.test(nomeFb), 'sem âncora, o fallback "R{rodada}" tem que continuar, veio: ' + nomeFb);

// jogo avulso (não é modo grupo) segue com "Jogo N"
const nomeJogo = win.__nomeGrupo({ t: t, m: { id: 'm-j', round: 1, _gameNum: 7 }, scope: 'match', groupMode: false });
ok(/Jogo 7/.test(nomeJogo), 'fora do modo grupo o nome continua sendo o do jogo, veio: ' + nomeJogo);

console.log((fail ? '✗' : '✓') + ' nome-do-grupo-de-whats-diz-qual-grupo: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
