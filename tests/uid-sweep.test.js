/* VARREDURA CANÔNICA DE UID (functions/uid-sweep.js) — o merge/exclusão acham o uid
 * ONDE ELE ESTIVER, sem lista de campos.
 *
 * Regra do dono (jul/2026): "onde estiver o uid, merja ou exclui. TUDO" + "canonizar o merge
 * e o excluir pra que, quando o sistema criar/excluir campo, isso vá pro cânone".
 *
 * A lista à mão falhou 3 vezes só em jul/2026 (membro de dupla; mapas por uid; slot solo na
 * exclusão) — sempre de forma reativa, sempre depois do estrago. O teste central aqui é o
 * "CAMPO NOVO": um campo que ninguém previu tem que ser coberto automaticamente.
 *
 * node tests/uid-sweep.test.js
 */
const { remapUid, findUidPaths, isPlainContainer } = require('../functions/uid-sweep');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (veio ' + JSON.stringify(a) + ')');

const OLD = 'uid_MORTO', NEW = 'uid_VIVO';

// ── Doc de torneio realista: TODO lugar onde o uid vive hoje ──────────────────
const torneio = {
  name: 'Confra',
  creatorUid: 'uid_org',
  memberUids: ['uid_org', OLD, 'uid_x'],
  participants: [
    { uid: OLD, enrollSeq: 15, category: 'C' },                       // slot solo
    { p1Uid: 'uid_a', p2Uid: OLD, p1Seq: 12, p2Seq: 10 },             // membro de DUPLA
    { participants: [{ uid: 'uid_b' }, { uid: OLD }] },               // sub-participants
  ],
  checkedIn: { [OLD]: 1784100000000, uid_x: 1784100000001 },          // CHAVE de mapa
  absent: { [OLD]: true },
  opinionPolls: [{ id: 'p1', votes: { [OLD]: ['o1'], uid_x: ['o2'] } }],  // voto (2 níveis)
  rounds: [{
    matches: [{ id: 'm1', p1Uid: OLD, p2Uid: 'uid_a', team1Uids: [OLD, 'uid_b'], winnerUid: OLD }],
    monarchGroups: [{ name: 'G1', playersUids: ['uid_a', OLD] }],
  }],
};

const r = remapUid(torneio, OLD, NEW);
ok(r.changed === true, 'detecta que houve troca');
const t = r.value;

eq(t.participants[0].uid, NEW, 'slot solo trocado');
eq(t.participants[0].enrollSeq, 15, 'enrollSeq PRESERVADO (ordem de inscrição não muda)');
eq(t.participants[1].p2Uid, NEW, 'membro de DUPLA trocado (o buraco de jul/2026)');
eq(t.participants[1].p1Uid, 'uid_a', 'o parceiro não é tocado');
eq(t.participants[1].p2Seq, 10, 'p2Seq preservado (ordem por membro)');
eq(t.participants[2].participants[1].uid, NEW, 'sub-participants[] trocado');
eq(t.memberUids, ['uid_org', NEW, 'uid_x'], 'memberUids trocado');
ok(!(OLD in t.checkedIn) && t.checkedIn[NEW] === 1784100000000, 'CHAVE de checkedIn trocada, valor mantido');
ok(!(OLD in t.absent) && t.absent[NEW] === true, 'CHAVE de absent trocada');
ok(!(OLD in t.opinionPolls[0].votes) && JSON.stringify(t.opinionPolls[0].votes[NEW]) === '["o1"]',
  'voto de enquete trocado (2 níveis abaixo)');
eq(t.rounds[0].matches[0].p1Uid, NEW, 'slot de jogo trocado');
eq(t.rounds[0].matches[0].team1Uids, [NEW, 'uid_b'], 'team1Uids trocado');
eq(t.rounds[0].matches[0].winnerUid, NEW, 'winnerUid trocado');
eq(t.rounds[0].monarchGroups[0].playersUids, ['uid_a', NEW], 'playersUids do grupo trocado');

// ── O TESTE QUE IMPORTA: campo que ninguém previu ─────────────────────────────
// É a razão de existir o cânone. Uma lista à mão erraria isto por definição.
const futuro = {
  campoQueAindaNaoExiste: OLD,
  configNova: { donoUid: OLD, historico: [{ porUid: OLD, quando: 1 }] },
  mapaNovo: { [OLD]: { nota: 5 } },
};
const f = remapUid(futuro, OLD, NEW).value;
eq(f.campoQueAindaNaoExiste, NEW, 'CAMPO NOVO (string solta) coberto sem ninguém listar');
eq(f.configNova.donoUid, NEW, 'CAMPO NOVO aninhado coberto');
eq(f.configNova.historico[0].porUid, NEW, 'CAMPO NOVO dentro de array de objetos coberto');
ok(f.mapaNovo[NEW] && !(OLD in f.mapaNovo), 'MAPA NOVO chaveado por uid coberto');

// ── Colisão: os dois uids no mesmo lugar (a pessoa estava nos dois) ───────────
const colide = {
  memberUids: [OLD, NEW, 'uid_x'],
  checkedIn: { [OLD]: 111, [NEW]: 999 },
};
const c = remapUid(colide, OLD, NEW).value;
eq(c.memberUids, [NEW, 'uid_x'], 'array: dedup quando os dois uids estavam lá');
eq(c.checkedIn[NEW], 999, 'mapa: o valor do SOBREVIVENTE prevalece (não é sobrescrito pelo velho)');
ok(!(OLD in c.checkedIn), 'mapa: a chave morta some');

// ── Tipos não-plain passam INTACTOS (senão o deep-walk corrompe o doc) ────────
class FakeTimestamp { constructor(s) { this._seconds = s; } toDate() { return new Date(this._seconds * 1000); } }
const ts = new FakeTimestamp(1784100000);
const comTs = { criadoEm: ts, uid: OLD, nested: { quando: ts } };
const ct = remapUid(comTs, OLD, NEW).value;
ok(ct.criadoEm === ts, 'Timestamp devolvido POR REFERÊNCIA (não vira objeto plano)');
ok(ct.criadoEm instanceof FakeTimestamp, 'Timestamp mantém a classe');
ok(ct.nested.quando === ts, 'Timestamp aninhado intacto');
eq(ct.uid, NEW, 'e o uid ao lado do Timestamp foi trocado');
ok(isPlainContainer(ts) === false, 'isPlainContainer: Timestamp não é container plano');
ok(isPlainContainer({}) === true && isPlainContainer([]) === true, 'isPlainContainer: {} e [] são');


// ── CROSS-REALM: objeto plano vindo de outro realm ───────────────────────────
// `proto === Object.prototype` reprova objeto criado noutro realm (vm/worker/outro módulo
// com globals próprios) — e aí o walk o trata como Timestamp e devolve INTACTO, sem limpar
// nada. Pegou de verdade no E2E desta função: Object.assign({}, doc) feito dentro de um vm
// sandbox passava batido e o purge não removia o uid. Silencioso: nenhum erro, dado sujo.
const vm = require('vm');
const _sb = {}; vm.createContext(_sb);
const alienObj = vm.runInContext('({ uid: "' + OLD + '", nested: { uid: "' + OLD + '" } })', _sb);
const alienArr = vm.runInContext('([1, 2])', _sb);
ok(isPlainContainer(alienObj) === true, 'objeto de OUTRO realm é container plano');
ok(isPlainContainer(alienArr) === true, 'array de OUTRO realm é container plano');
const ar = remapUid(alienObj, OLD, NEW);
eq(ar.value.uid, NEW, 'cross-realm: uid trocado (não é devolvido intacto por engano)');
eq(ar.value.nested.uid, NEW, 'cross-realm: desce nos aninhados');
// e o que NÃO pode ser tratado como plano continua preservado
ok(isPlainContainer(new Date()) === false, 'Date preservado (não é plano)');
ok(isPlainContainer(Buffer.from('x')) === false, 'Buffer preservado');
ok(isPlainContainer(Object.create(null)) === true, 'Object.create(null) é plano');

// ── Não toca o que não é o uid ────────────────────────────────────────────────
const outros = { uid: 'uid_outro', nome: 'Fulano', memberUids: ['uid_a', 'uid_b'] };
const o = remapUid(outros, OLD, NEW);
ok(o.changed === false, 'sem o uid no doc → changed=false (não grava à toa)');
eq(o.value.memberUids, ['uid_a', 'uid_b'], 'outros uids intactos');
ok(remapUid({ p1: 'Fulano de Tal' }, OLD, NEW).changed === false, 'nome de pessoa não é confundido com uid');

// ── findUidPaths: auditoria (dry-run e exclusão consciente) ───────────────────
const paths = findUidPaths(torneio, OLD);
// Os 11: memberUids[1] · participants[0].uid · participants[1].p2Uid ·
// participants[2].participants[1].uid · checkedIn{key} · absent{key} ·
// opinionPolls[0].votes{key} · matches[0].p1Uid · .team1Uids[0] · .winnerUid ·
// monarchGroups[0].playersUids[1]. O número é conferência de cobertura: se o walk
// deixar de descer em algum nível, ele cai.
ok(paths.length === 11, 'findUidPaths acha os 11 lugares do doc real (veio ' + paths.length + ')');
ok(paths.includes('participants[1].p2Uid'), '  → aponta o membro de dupla');
ok(paths.includes('checkedIn.{key}'), '  → aponta a chave do mapa');
ok(paths.includes('opinionPolls[0].votes.{key}'), '  → aponta o voto da enquete');
ok(paths.includes('rounds[0].matches[0].team1Uids[0]'), '  → aponta o slot do jogo');
ok(findUidPaths({ a: 1 }, OLD).length === 0, 'findUidPaths: doc sem o uid → vazio');

// ── Imutabilidade: não muta a entrada ─────────────────────────────────────────
ok(torneio.participants[0].uid === OLD, 'a entrada NÃO é mutada (só a cópia muda)');
ok(torneio.checkedIn[OLD] === 1784100000000, 'mapa da entrada intacto');

console.log(fail === 0
  ? '✅ uid-sweep: ' + pass + ' ok, 0 falharam'
  : '❌ uid-sweep: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
