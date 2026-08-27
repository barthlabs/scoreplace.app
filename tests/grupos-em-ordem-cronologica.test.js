/* A ORDEM DOS GRUPOS NA TELA — a agenda manda (leva 2.1.8)
 *
 * Ordem do dono (27/ago/2026): _"quando isso estiver definido os grupos devem ser mostrados
 * em ordem cronológica mostrando primeiro os proximos eventos (jogos) e depois os já
 * realizados em ordem alfabetica dos grupos e depois os sem data/hora definida tambem em
 * ordem alfabetica"_.
 *
 * Três decisões dele fecharam o desenho, e as três estão guardadas aqui porque nenhuma
 * delas se deduz do código:
 *
 *  1. O "SEU GRUPO" CONTINUA NO TOPO (v0.16.88, reconfirmado). A ordem por agenda é
 *     critério SECUNDÁRIO — nunca substitui o `me` que já existia nos 3 call sites.
 *  2. "REALIZADO" É JOGO DECIDIDO, não hora que passou. Consequência prática, e é o
 *     motivo da decisão: um grupo marcado pras 14h que às 15h ninguém jogou continua no
 *     balde dos próximos, e a ordem cronológica o joga pro TOPO — é onde o organizador
 *     precisa vê-lo. Pelo critério "hora passou = realizado" ele afundaria no meio dos
 *     concluídos, que é o oposto do que serve pra tocar o torneio.
 *  3. O horário ≈ESTIMADO conta como data. É o que a pessoa vê escrito na tela; ordenar
 *     por outra coisa mostraria uma grade que não bate com o texto.
 *
 * ⭐ E a ordenação é DETERMINÍSTICA: nada aqui lê o relógio. O balde sai de `winner` e da
 * existência de `scheduledAt`, então a tela não se reordena sozinha quando dá a hora —
 * ela muda quando o TORNEIO muda, que é o que a pessoa consegue entender.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'),
  sandbox, { filename: 'schedule-poll.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── grupos em ordem cronológica ────');

const ONTEM  = '2026-08-26T12:00:00.000Z';
const CEDO   = '2026-08-28T09:00:00.000Z';
const TARDE  = '2026-08-28T10:00:00.000Z';

// grupo = 3 jogos (Rei/Rainha). `quando` = data em todos; `feito` = todos decididos.
let _n = 0;
function grupo(name, quando, feito, kind) {
  const ms = [0, 1, 2].map(i => {
    const m = { id: 'm' + (++_n), isMonarch: true, p1: 'A', p2: 'B' };
    if (quando) { m.scheduledAt = quando; m.scheduledKind = kind || 'organizer'; }
    if (feito) m.winner = 'team1';
    return m;
  });
  return { name: name, matches: ms };
}

// ── um grupo de cada situação, embaralhados de propósito ──────────────────────
const gDelta   = grupo('Delta',   TARDE, false);            // balde 0 · mais tarde
const gAlfa    = grupo('Alfa',    CEDO,  false);            // balde 0 · mais cedo
const gEcho    = grupo('Echo',    ONTEM, false);            // balde 0 · ATRASADO → topo
const gZulu    = grupo('Zulu',    ONTEM, true);             // balde 1 · realizado
const gBravo   = grupo('Bravo',   null,  true);             // balde 1 · realizado sem data
const gYankee  = grupo('Yankee',  null,  false);            // balde 2 · sem data
const gCharlie = grupo('Charlie', null,  false);            // balde 2 · sem data
const TODOS = [gDelta, gAlfa, gEcho, gZulu, gBravo, gYankee, gCharlie];

const nomes = (arr) => arr.map(g => g.name).join(',');

// ── sem "meu grupo": os três baldes, na ordem pedida ──────────────────────────
ok(nomes(W._schOrdenarGrupos(TODOS, {})) === 'Echo,Alfa,Delta,Bravo,Zulu,Charlie,Yankee',
   'ordem: próximos (cronológico) → realizados (alfabético) → sem data (alfabético). Veio: ' +
   nomes(W._schOrdenarGrupos(TODOS, {})));

// cada regra, isolada — pra a falha dizer QUAL delas quebrou, não só "a ordem mudou"
const semMeu = W._schOrdenarGrupos(TODOS, {});
ok(semMeu.slice(0, 3).map(g => g.name).join(',') === 'Echo,Alfa,Delta',
   'balde dos PRÓXIMOS vem primeiro e é cronológico (o mais cedo na frente)');
ok(semMeu[0] === gEcho,
   '⛔ grupo ATRASADO (hora passou, ninguém jogou) fica no TOPO — decisão do dono, e é o ' +
   'que o organizador precisa ver. Se ele afundou, o critério virou "hora passou".');
ok(semMeu.slice(3, 5).map(g => g.name).join(',') === 'Bravo,Zulu',
   'realizados vêm depois, em ordem ALFABÉTICA (não cronológica)');
ok(semMeu.slice(5).map(g => g.name).join(',') === 'Charlie,Yankee',
   'sem data vêm por último, em ordem alfabética');

// ── ⛔ o SEU grupo continua no topo, mesmo sendo o último de todos os critérios ──
const comMeu = W._schOrdenarGrupos(TODOS, { meu: (g) => g === gYankee });
ok(comMeu[0] === gYankee,
   '⛔ o SEU GRUPO vai pro topo mesmo sem data e sem jogo — a agenda é critério SECUNDÁRIO');
ok(nomes(comMeu.slice(1)) === 'Echo,Alfa,Delta,Bravo,Zulu,Charlie',
   'e o resto segue exatamente a ordem por agenda. Veio: ' + nomes(comMeu.slice(1)));

// ── "Grupo 2" antes de "Grupo 10" ────────────────────────────────────────────
// Alfabético ingênuo põe o 10 na frente do 2, e num torneio de 35 grupos isso é a
// diferença entre uma lista legível e uma bagunça.
const numericos = [grupo('Grupo 10', null, false), grupo('Grupo 2', null, false), grupo('Grupo 1', null, false)];
ok(nomes(W._schOrdenarGrupos(numericos, {})) === 'Grupo 1,Grupo 2,Grupo 10',
   'ordem alfabética entende número: Grupo 2 antes de Grupo 10');

// ── o horário ESTIMADO conta como data (decisão do dono) ─────────────────────
// Em torneio de até 3 dias `_schAplicarGrade` carimba TODO jogo com kind 'estimate'.
// Se a estimativa não contasse, esses torneios teriam a tela inteira no balde "sem data" —
// ou seja, a feature não apareceria justamente onde ela foi pedida.
const gEst = grupo('Estimado', CEDO, false, 'estimate');
const gSem = grupo('Aberto', null, false);
ok(nomes(W._schOrdenarGrupos([gSem, gEst], {})) === 'Estimado,Aberto',
   'grupo com horário ≈estimado ordena como grupo COM data');
ok(W._schGrupoAgenda(gEst).balde === 0, 'estimado cai no balde dos próximos, não no "sem data"');

// ── o grupo vale pelo seu jogo MAIS CEDO ─────────────────────────────────────
const gMisto = { name: 'Misto', matches: [
  { id: 'x1', scheduledAt: TARDE, scheduledKind: 'organizer' },
  { id: 'x2', scheduledAt: CEDO,  scheduledKind: 'organizer' }
] };
ok(W._schGrupoAgenda(gMisto).ms === new Date(CEDO).getTime(),
   'com jogos em horas diferentes, o grupo vale pelo MAIS CEDO (é quando ele começa)');

// ── BYE/folga não conta como jogo ────────────────────────────────────────────
// Senão um grupo cujo único "jogo" é uma folga apareceria como pendente pra sempre.
const gFolga = { name: 'Folga', matches: [{ id: 'f1', isBye: true }, { id: 'f2', isSitOut: true }] };
ok(W._schGrupoAgenda(gFolga).balde === 2, 'grupo só com BYE/folga não vira "próximo evento"');
const gQuaseFeito = { name: 'Quase', matches: [
  { id: 'q1', winner: 'team1' }, { id: 'q2', isBye: true }
] };
ok(W._schGrupoAgenda(gQuaseFeito).balde === 1,
   'grupo com todos os jogos REAIS decididos é realizado, mesmo tendo um BYE junto');

// ── shape alternativo: grupos que guardam os jogos em rounds[] ───────────────
// renderGroupStage passa `sg.rounds[0].matches`; a rota Liga passa `g.matches`. A mesma
// função atende os dois — senão uma das telas ordenaria por nada e ninguém notaria.
const gRounds = { name: 'PorRounds', rounds: [{ matches: [{ id: 'r1', scheduledAt: CEDO }] }] };
ok(W._schGrupoAgenda(gRounds).balde === 0 && W._schGrupoAgenda(gRounds).ms === new Date(CEDO).getTime(),
   'grupo no shape rounds[].matches é lido igual ao shape matches[]');

// ── ordenação ESTÁVEL: empate total preserva a ordem de entrada ──────────────
const e1 = grupo('Igual', null, false), e2 = grupo('Igual', null, false);
const est = W._schOrdenarGrupos([e1, e2], {});
ok(est[0] === e1 && est[1] === e2, 'empate total mantém a ordem original (sort estável)');

// ── wrappers: o call site de renderGroupStage ordena objetos, não grupos ─────
// Ele precisa do `originalIdx` preservado — é o que mantém groups[gi] apontando pro doc
// certo e a numeração global dos jogos na ordem ORIGINAL.
const wrap = [{ sg: gYankee, originalIdx: 0 }, { sg: gAlfa, originalIdx: 1 }];
const wOrd = W._schOrdenarGrupos(wrap, { grupo: (w) => w.sg });
ok(wOrd[0].sg === gAlfa && wOrd[0].originalIdx === 1,
   'ordena por dentro do wrapper e devolve o wrapper INTEIRO (originalIdx intacto)');

// ── OS 3 PONTOS DE RENDER USAM A FONTE ÚNICA ────────────────────────────────
// Mesma lição da 2.1.7: a regra de "quem vê o botão" tinha duas cópias e elas divergiram
// em silêncio por três semanas. Listar grupos acontece em TRÊS lugares (Rei/Rainha, fase
// de grupos, rota Liga); se um deles voltar a ordenar por conta própria, a mesma tela
// mostra ordens diferentes conforme a rota que a desenhou. Isto acusa.
const srcB = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
const usos = (srcB.match(/window\._schOrdenarGrupos\(/g) || []).length;
ok(usos >= 3, 'os 3 pontos que listam grupos em bracket.js chamam window._schOrdenarGrupos (achei ' + usos + ')');
ok(!/\.sort\(function\(a, b\) \{\s*var aMe = _groupHasMe/.test(srcB),
   'o sort "só meu grupo" da rota Liga não voltou a existir em paralelo');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
