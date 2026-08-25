/* O W.O. É DO GRUPO ONDE ACONTECEU — NÃO SEGUE QUEM SUBSTITUIU (2.0.93)
 * node tests/wo-fica-no-grupo-onde-aconteceu.test.js
 *
 * Relato do dono (25/ago/2026, print do R1 Grupo I2 do Confra): _"4 formaram um novo
 * grupo. fabio, nina e carol vieram de wo. nao sei porque veio o grupo com um wo da
 * denise que nao tem nada a ver com esse grupo."_
 *
 * MEDIDO no doc ao vivo: a Carol substituiu a Denise no R1 Grupo A em 09/ago. Em 24/ago
 * ela voltou pra fila e caiu num grupo NOVO (I2). O rastro `woSubstituteFor` mora na
 * ENTRADA dela e viaja junto — e o I2, por ser novo, não tem registro no `woLog`, então
 * cai na reconstrução legada, que seguia o rastro e desenhava a Denise ali.
 * O registro guarda o `groupName` do dia: quando ele diz que o W.O. é de outro grupo,
 * o legado não tem o que dizer. Cenário abaixo espelha o real (anonimizado).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
win._nameForUid = (u) => ({ uc: 'Carol', ud: 'Denise', uf: 'Fábio' }[u] || '');
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
win.document = globalThis.document;
const carrega = (f) => new Function('window', 'document', fs.readFileSync(path.join(ROOT, 'js', 'views', f), 'utf8'))(win, globalThis.document);
carrega('wo-log.js');
carrega('liga-substitution.js');

ok(typeof win._woLogGrupoDoWo === 'function', 'falta window._woLogGrupoDoWo');

// grupo VELHO: onde o W.O. aconteceu, e onde o registro o coloca
const gA = { name: 'R1 Grupo A', players: ['Edu', 'Carol'], playersUids: ['ue', 'uc'] };
// grupo NOVO: a Carol entrou aqui DEPOIS, levando o rastro na entrada dela
const gI2 = { name: 'R1 Grupo I2', players: ['Fábio', 'Nina', 'Carol', 'Deborah'], playersUids: ['uf', 'un', 'uc', 'ude'] };

const t = {
  participants: [
    { uid: 'ue' }, { uid: 'un' }, { uid: 'ude' }, { uid: 'uf' },
    { uid: 'uc', woSubstituteFor: 'Denise', woSubstituteForUid: 'ud', woSubstituteAt: '2026-08-09T13:49:40.018Z' },
  ],
  rounds: [{ monarchGroups: [gA, gI2], matches: [] }],
  woLog: [{
    id: 'wo-0-R1_Grupo_A-ud-0', roundIndex: 0, groupName: 'R1 Grupo A',
    absentUid: 'ud', absentName: 'Denise', subUid: 'uc', subName: 'Carol',
    status: 'active', at: '2026-08-09T13:49:40.018Z', filledAt: '2026-08-09T13:49:40.018Z'
  }],
};

// ① o grupo NOVO não herda o W.O. de ninguém
const noI2 = win._ligaGroupWoList(t, gI2) || [];
ok(noI2.length === 0, 'grupo novo não pode listar W.O. nenhum, veio: ' + JSON.stringify(noI2.map(p => p.absentName)));
ok(!noI2.some(p => p.absentName === 'Denise'), 'a Denise não pode aparecer no grupo onde ela nunca esteve');

// ② o grupo ONDE ACONTECEU continua com o W.O. dela — a correção não pode APAGAR o fato
const noA = win._ligaGroupWoList(t, gA) || [];
ok(noA.length === 1 && noA[0].absentName === 'Denise' && noA[0].subName === 'Carol',
  'o Grupo A tem que manter Denise → Carol, veio: ' + JSON.stringify(noA));

// ③ SEM registro (doc anterior à 2.0.60) a reconstrução legada continua valendo — a trava
//    só cala o rastro quando o registro sabe de outro lugar, nunca por não saber de nada.
const velho = JSON.parse(JSON.stringify(t)); velho.woLog = [];
const gA2 = velho.rounds[0].monarchGroups[0], gI22 = velho.rounds[0].monarchGroups[1];
const legado = win._ligaGroupWoList(velho, gA2) || [];
ok(legado.length === 1 && legado[0].absentName === 'Denise',
  'sem registro, o legado ainda reconstrói pelo rastro, veio: ' + JSON.stringify(legado));
ok((win._ligaGroupWoList(velho, gI22) || []).length === 1,
  'sem registro nenhum, o comportamento antigo é preservado (nada de regressão silenciosa)');

// ④ W.O. REVERTIDO no outro grupo não trava nada: o evento não vale mais
const rev = JSON.parse(JSON.stringify(t)); rev.woLog[0].status = 'reverted';
ok(typeof win._woLogGrupoDoWo(rev, 'ud', 'Denise') === 'object' === false || win._woLogGrupoDoWo(rev, 'ud', 'Denise') === null,
  'evento revertido não conta como "aconteceu em outro grupo"');

console.log((fail ? '✗' : '✓') + ' wo-fica-no-grupo-onde-aconteceu: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
