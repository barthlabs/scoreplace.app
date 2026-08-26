/* QUEM SAIU POR W.O. MOSTRA ONDE JOGA AGORA (2.0.117)
 * node tests/quem-saiu-por-wo-mostra-onde-joga-agora.test.js
 *
 * Pedido do dono (26/ago), com a Carol Moresco de exemplo: ela entrou no Grupo A por um
 * W.O. da Denise, tomou W.O., se reativou, foi pra espera e caiu num grupo NOVO.
 * _"numa busca você encontra o nome dela, mas vê que ela foi para outro grupo"_.
 *
 * ⭐ A linha dela CONTINUA no Grupo A — é o registro do que aconteceu ali, e some-la seria
 * apagar história. O que muda é que a linha passa a dizer PRA ONDE ela foi.
 * ⚠️ Na cor dos 1º–4º, NÃO na vermelha do nome: o vermelho conta o que aconteceu AQUI, a
 * indicação conta ONDE ela está. Duas informações diferentes não saem na mesma cor.
 *
 * Conferido contra o Confra REAL: Carol Moresco → R1 Grupo I2 (e mais dois que formaram o
 * mesmo grupo novo); os 7 que não reapareceram ficam sem indicação.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const i = src.indexOf('window._grupoAtualDoJogador = function');
ok(i > 0, 'a função existe');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(src.slice(i, src.indexOf('\n};', i) + 3) + '\nthis.f = window._grupoAtualDoJogador;', ctx);
const onde = ctx.f;

const t = { rounds: [{ monarchGroups: [{ name: 'R1 Grupo A' }, { name: 'R1 Grupo I2' }], matches: [
  { monarchGroup: 0, team1Uids: ['carol'], team2Uids: ['x'] },
  { monarchGroup: 1, team1Uids: ['carol'], team2Uids: ['y'] }
] }] };

ok(onde(t, 'carol', 'Carol', 'R1 Grupo A') === 'R1 Grupo I2',
  '⭐ olhando do Grupo A, a Carol aparece jogando no Grupo I2');
ok(onde(t, 'x', 'X', 'R1 Grupo A') === '',
  '⛔ quem NÃO mudou de grupo não ganha indicação — dizer "(Grupo A)" dentro do Grupo A não informa nada');

// ── por uid, nunca por nome (cânone do dono) ────────────────────────────────
const homonimos = { rounds: [{ monarchGroups: [{ name: 'G1' }, { name: 'G2' }], matches: [
  { monarchGroup: 0, team1Uids: ['uidA'], team1: ['Maria Silva'] },
  { monarchGroup: 1, team1Uids: ['uidB'], team1: ['Maria Silva'] }
] }] };
ok(onde(homonimos, 'uidA', 'Maria Silva', 'G2') === 'G1',
  '⭐ com uid, cada Maria Silva acha o SEU grupo — casar por nome daria o grupo da outra');

// ⭐ e o NOME ainda vale pra quem não tem uid — a exceção do dono
const digitada = { rounds: [{ monarchGroups: [{ name: 'G1' }, { name: 'G2' }], matches: [
  { monarchGroup: 1, team1: ['Fulana Digitada'], team2: ['Outra'] }
] }] };
ok(onde(digitada, '', 'Fulana Digitada', 'G1') === 'G2',
  '⭐ inscrito DIGITADO pelo organizador (sem uid) acha pelo nome — é a exceção do cânone');

// ── a rodada mais recente manda ─────────────────────────────────────────────
const duasRodadas = { rounds: [
  { monarchGroups: [{ name: 'R1 Grupo A' }], matches: [{ monarchGroup: 0, team1Uids: ['p'] }] },
  { monarchGroups: [{ name: 'R2 Grupo C' }], matches: [{ monarchGroup: 0, team1Uids: ['p'] }] }
] };
ok(onde(duasRodadas, 'p', 'P', 'R1 Grupo A') === 'R2 Grupo C',
  '⚠️ varre da ÚLTIMA rodada pra primeira — interessa onde joga AGORA, não onde apareceu antes');

// ── a fiação na linha da classificação ──────────────────────────────────────
ok(/_grupoNovoTag/.test(src), 'a linha da classificação usa a indicação');
const iTag = src.indexOf('var _grupoNovoTag');
const bloco = src.slice(iTag, iTag + 900);
ok(/\(_isRed \|\| _isAmb\)/.test(bloco),
  '⭐ só pra quem saiu por W.O. — não vira poluição nas linhas normais');
ok(/color:var\(--text-bright\)/.test(bloco),
  '⚠️ na cor dos 1º–4º, NÃO na vermelha do nome: são duas informações diferentes');
ok(/g\.name/.test(bloco),
  '⛔ e passa o grupo ATUAL pra ser ignorado — senão toda linha diria o próprio grupo');
ok(/s\.uid \|\| s\.p1Uid/.test(bloco), 'por uid primeiro');
ok(/_gstNameHtml\(s\) \+ _woTag \+ _grupoNovoTag/.test(src),
  '⭐ e sai DEPOIS da tag W.O., na mesma linha — quem busca o nome vê os dois fatos juntos');

console.log((fail ? '✗' : '✓') + ' quem-saiu-por-wo-mostra-onde-joga-agora: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
