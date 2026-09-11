/* REMOVER INSCRITO PRECISA DECLARAR A INTENÇÃO — SENÃO O GUARD O TRAZ DE VOLTA
 * node tests/remover-inscrito-declara-a-intencao.test.js
 *
 * RELATO DO DONO (28/ago/2026): _"removi o 1 e ele voltou como inscrito 8"_ — e antes,
 * _"remover o jogador está quebrado. removi e ele voltou."_
 *
 * ⭐ MEDIDO NO SENTRY, com o carimbo do minuto do relato:
 *     Error: roster shrink blocked: tour_1787962809278 (nome:jogador 01 (participants))
 *     15 ocorrências  ·  culprit: Object.saveTournament
 * Quinze tentativas dele, quinze recusas.
 *
 * A CAUSA — e não é um bug do guard, é o contrato dele não estar sendo cumprido:
 * `saveTournament` protege o elenco contra save de cópia ATRASADA (o "sumiço do Gersom"):
 * quem chega faltando no save é RESTAURADO do banco. A remoção INTENCIONAL tem porta
 * própria — `allowRosterRemoval` —, e o próprio aviso do guard diz isso em texto:
 *   "Se a remoção era intencional, o caminho precisa passar allowRosterRemoval."
 * ⛔ O botão ✕ do ORGANIZADOR nunca passava. Só o "sair do torneio" do próprio inscrito.
 * Ou seja: o organizador nunca conseguiu remover ninguém, e o restaurado ainda voltava
 * pro FIM da fila — o "voltou como inscrito 8".
 *
 * ⚠️ E o teste guarda os DOIS lados: declarar a intenção não pode virar hábito. Só os
 * três caminhos de remoção confirmada declaram: sair do torneio, remover pelo
 * organizador e excluir definitivamente quem não entra na próxima fase. Um save comum
 * que chegue sem gente continua sendo barrado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const _R = require('./recorte.js');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

console.log('\n① O caminho de remoção do ORGANIZADOR declara a intenção');
const i = src.indexOf('window.removeParticipantFunction = function');
ok(i > 0, 'achei removeParticipantFunction');
const corpo = _R.ateOFim(src, i).slice(0, 9000);
ok(/_callFn\('removeTournamentParticipant'/.test(corpo),
   'a remoção só declara a intenção à Cloud Function');
ok(!/saveTournament|commitTournamentTx|AppStore\.mutate/.test(corpo),
   '   e não sobrou escritor local que pudesse restaurar a cópia antiga');
const fn = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
ok(/exports\.removeTournamentParticipant/.test(fn) && /runTransaction/.test(fn) && /_gravaTorneio/.test(fn),
   'a Function reaplica a remoção no documento fresco antes de gravar');

console.log('\n② O guard continua existindo e continua sendo a regra');
ok(/roster shrink blocked/.test(db), 'o guard segue reportando quando barra alguém');
ok(/_allowRosterRemoval\s*=\s*!!\(options && options\.allowRosterRemoval\)/.test(db),
   'e a porta de saída é exatamente a opção — não um bypass novo');
ok(/if \(\(_tocaElenco \|\| _tocaFila\) && !_allowRosterRemoval\)/.test(db),
   '⛔ save SEM a declaração continua protegido — o guard não foi afrouxado');

console.log('\n③ Declarar a intenção NÃO pode virar hábito');
const todos = (fs.readdirSync(path.join(ROOT, 'js', 'views'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f: f, s: fs.readFileSync(path.join(ROOT, 'js', 'views', f), 'utf8') })));
let usos = [];
todos.forEach((x) => {
  const n = (x.s.match(/allowRosterRemoval:\s*true/g) || []).length;
  if (n) usos.push(x.f + '×' + n);
});
ok(usos.length === 0, '⛔ nenhuma tela declara bypass de remoção: a autorização fica só na Function — got ' + JSON.stringify(usos));

console.log(falhas === 0
  ? '\n✅ remover remove; e o que não é remoção continua protegido\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
