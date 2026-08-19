/* DUPLA DA PARTIDA CASUAL: 2×2 OU NÃO FORMOU — E NINGUÉM SOME
 * node tests/dupla-casual-nao-perde-jogador.test.js
 *
 * A FALHA REAL (print do dono, 18/ago/2026): na tela de formar duplas, "Toninho"
 * aparecia BRANCO — que é a cor de "sem time" — e mesmo assim ocupava a coluna da
 * direita, como se fosse o time 2. As duplas pareciam certas; a cor entregava que não.
 *
 * ⛔ E NÃO ERA COSMÉTICO. Toda composição de nome de time filtra por `p.team === 1` ou
 * `=== 2`. Jogador com `team === undefined` NÃO ENTRA EM NENHUMA das duas listas: ele
 * some de `p1Name`/`p2Name`. Como a tela de 1º sacador reconstrói os times FATIANDO
 * essas strings, ela montava dupla com quem sobrou — o relato "o Toninho ficava no meu
 * time em vez da Kelly". Um jogador sem time vira placar creditado errado.
 *
 * A CAUSA eram TRÊS definições de "duplas formadas" que discordavam:
 *   • a tela exigia os 4 índices definidos;
 *   • `_buildPlayers` se contentava com o índice 0 existir;
 *   • a divisão em colunas mandava pra direita tudo que não fosse 1 — juntando
 *     "time 2" com "SEM TIME" no mesmo `else`.
 *
 * O CONTRATO travado: uma regra só (`_duplasFormadas`), que exige os quatro atribuídos
 * E a divisão 2×2. Fora disso é "não formou" — nunca um meio-termo que vira placar.
 * Ver [[project_usuario_sempre_time_azul]] (nunca decidir time por índice de pairing).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++; console.log('  ✗ ' + msg);
}

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

console.log('\nDUPLA CASUAL: 2×2 OU NÃO FORMOU');

// ── 1. A REGRA EXISTE, NUMA FUNÇÃO SÓ ───────────────────────────────────────
const fn = (src.match(/function _duplasFormadas\(\)[\s\S]*?\n  \}/) || [''])[0];
ok(fn.length > 0, 'existe `_duplasFormadas` — a regra mora num lugar só');
ok(/return false/.test(fn), 'quem não tem time faz a regra devolver false (não "cai" pro time 2)');
ok(/n1 === 2 && n2 === 2/.test(fn), 'e a divisão precisa ser 2×2 (3×1 é inválida em duplas)');

// ── 2. EXECUTA A REGRA DE VERDADE (não só confere o texto) ──────────────────
// reencena a função sobre um `_teamAssignments` controlado.
function regra(asg) {
  const f = new Function('_teamAssignments', fn + '\n return _duplasFormadas();');
  return f(asg);
}
ok(regra({0:1,1:1,2:2,3:2}) === true, 'aceita 2×2');
ok(regra({0:1,1:2,2:1,3:2}) === true, 'aceita 2×2 em qualquer ordem');
ok(regra({0:1,1:1,2:2}) === false, 'recusa quando falta alguém (era o caso do print)');
ok(regra({0:1,1:1,2:1,3:2}) === false, 'recusa 3×1');
ok(regra({0:1,1:1,2:2,3:undefined}) === false, 'recusa `undefined` explícito');
ok(regra({}) === false, 'recusa vazio');

// ── 3. OS TRÊS PONTOS USAM A MESMA REGRA ────────────────────────────────────
ok(/var _teamsFormed = _duplasFormadas\(\);/.test(src),
   'a tela de formar duplas usa a regra única');
ok(/var hasTeamDnD = _duplasFormadas\(\);/.test(src),
   '`_buildPlayers` usa a MESMA regra (antes bastava o índice 0)');
// as definições fracas antigas não podem voltar
ok(!/_teamAssignments\[0\] !== undefined && _teamAssignments\[1\] !== undefined/.test(src),
   'a checagem antiga dos 4 índices soltos não voltou');
ok(!/var hasTeamDnD = _teamAssignments\[0\] !== undefined;/.test(src),
   'e nem a checagem de só o índice 0');

// ── 4. A DIVISÃO EM COLUNAS NÃO ADOTA ÓRFÃO ─────────────────────────────────
// O `else` solto era o que fazia "sem time" ocupar a coluna do time 2 no print.
const split = (src.match(/_t1Idxs\.push\(_gi\);[\s\S]{0,200}?_t2Idxs\.push\(_gi\);/) || [''])[0];
ok(split.length > 0, 'achei a divisão em colunas');
ok(/else if \(_teamAssignments\[_gi\] === 2\)/.test(split),
   'a coluna 2 exige time 2 explicitamente (o `else` solto adotava quem não tinha time)');

console.log(falhas === 0
  ? '\n✅ ou é 2×2, ou não formou — ninguém entra no placar sem time\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
