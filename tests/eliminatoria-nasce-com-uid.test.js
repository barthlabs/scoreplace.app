// O CONFRONTO DA ELIMINATÓRIA NASCE COM UID — nunca só com o nome gravado.
//
// ORDEM DO DONO (14/ago/2026): "indicação por uid exclusivamente. sempre uid, que daí vai
// trazer todos os dados do participante, evitando as merdas de ele trocar o nome e continuar
// o nome antigo salvo por todo o programa sem propagação completa."
//
// MEDIDO ANTES DE MEXER, rodando `_advanceMultiPhase` sobre o sandbox do Confra: os 98 jogos
// da eliminatória saíam com `team1Uids: []` e `p1Uid: null` — 98 de 98, sem exceção. A chave
// que decide o campeão nasceria presa ao rótulo do dia do sorteio.
//
// CAUSA — uma linha, e é a divergência clássica de "duas regras pro mesmo dado":
// em `_computeMonarchStandings`, a CHAVE da linha resolvia o uid por TRÊS fontes
// (uid explícito → mapa dos JOGOS → mapa do elenco) e o CAMPO `uid` da mesma linha por
// DUAS — faltava o mapa dos jogos. A linha saía com `key: 'uid:XXX'` e `uid: null`: a tabela
// sabia quem era e não contava pra ninguém. A transição de fase monta as duplas lendo `m.uid`,
// recebia null, e o `mkTeam` gravava o time só com nome. O backfill `_slotUids` do
// phases-engine existia e estava certo — ele não tinha uid nenhum pra achar.
//
// Este teste roda a função REAL e trava as duas metades: identidade (uid) e propagação de
// NOME (o rótulo gravado nunca vence o perfil vivo). Contra o código anterior: 8 falhas.
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// perfil vivo: a pessoa se renomeou DEPOIS do sorteio (o caso real Fabi2401 → Dani Bataglia)
W._userProfileCache = { uidANA: { uid: 'uidANA', displayName: 'Dani Bataglia' } };
W._displayNameForUid = function (uid, fb) {
  const p = W._userProfileCache[uid];
  return (p && p.displayName) || fb || '';
};

// grupo Rei/Rainha real: 4 pessoas, 3 jogos de duplas rotativas.
// `playersUids` é OPCIONAL de propósito — é justamente o grupo SEM ele que expunha o bug,
// porque aí o uid só existe dentro dos jogos (team1Uids/team2Uids).
function grupo(comPlayersUids) {
  const g = {
    name: 'R1 Grupo A',
    players: ['Fabi2401', 'Bia', 'Caio', 'Davi'],   // rótulo GRAVADO no dia do sorteio
    matches: [
      { id: 'g1', team1: ['Fabi2401', 'Bia'], team1Uids: ['uidANA', 'uidBIA'],
        team2: ['Caio', 'Davi'], team2Uids: ['uidCAI', 'uidDAV'],
        p1: 'Fabi2401 / Bia', p2: 'Caio / Davi', scoreP1: 6, scoreP2: 2, winner: 'Fabi2401 / Bia' },
      { id: 'g2', team1: ['Fabi2401', 'Caio'], team1Uids: ['uidANA', 'uidCAI'],
        team2: ['Bia', 'Davi'], team2Uids: ['uidBIA', 'uidDAV'],
        p1: 'Fabi2401 / Caio', p2: 'Bia / Davi', scoreP1: 6, scoreP2: 4, winner: 'Fabi2401 / Caio' },
      { id: 'g3', team1: ['Fabi2401', 'Davi'], team1Uids: ['uidANA', 'uidDAV'],
        team2: ['Bia', 'Caio'], team2Uids: ['uidBIA', 'uidCAI'],
        p1: 'Fabi2401 / Davi', p2: 'Bia / Caio', scoreP1: 6, scoreP2: 1, winner: 'Fabi2401 / Davi' }
    ]
  };
  if (comPlayersUids) g.playersUids = ['uidANA', 'uidBIA', 'uidCAI', 'uidDAV'];
  return g;
}

console.log('──── 1. a linha da classificação carrega o uid ────');
[['COM playersUids (o Confra de hoje)', true], ['SEM playersUids (grupo legado)', false]].forEach(function (cs) {
  const linhas = W._computeMonarchStandings(grupo(cs[1]));
  ok(linhas.length === 4, cs[0] + ': 4 linhas (veio ' + linhas.length + ')');
  ok(linhas.every(function (l) { return !!l.uid; }),
    cs[0] + ': TODA linha tem uid — era aqui que saía null com a chave já sendo uid:');
  ok(linhas.every(function (l) { return l.key === 'uid:' + l.uid; }),
    cs[0] + ': a CHAVE e o CAMPO uid concordam (eram duas resoluções diferentes)');
});

console.log('──── 2. o nome vem do PERFIL, o rótulo gravado é só reserva ────');
[['COM playersUids', true], ['SEM playersUids', false]].forEach(function (cs) {
  const l = W._computeMonarchStandings(grupo(cs[1]));
  const alvo = l.filter(function (x) { return x.uid === 'uidANA'; })[0];
  ok(!!alvo, cs[0] + ': achou a pessoa pelo uid');
  ok(alvo && alvo.name === 'Dani Bataglia',
    cs[0] + ': nome propagado do perfil (veio "' + (alvo && alvo.name) + '", gravado era "Fabi2401")');
});

console.log('──── 3. quem NÃO tem conta continua existindo pelo nome ────');
// Exceção legítima e obrigatória: fictício/convidado não tem uid, e a linha dele não pode
// sumir. Se este bloco quebrar, o "sempre uid" virou "só quem tem conta joga".
const fic = W._computeMonarchStandings({
  name: 'G', players: ['Convidado X', 'Bia'],
  matches: [{ id: 'f1', team1: ['Convidado X'], team2: ['Bia'], team2Uids: ['uidBIA'],
    p1: 'Convidado X', p2: 'Bia', scoreP1: 6, scoreP2: 0, winner: 'Convidado X' }]
});
const cx = fic.filter(function (x) { return x.name === 'Convidado X'; })[0];
ok(!!cx, 'fictício sem conta continua na tabela');
ok(cx && cx.uid === null, 'fictício não ganha uid inventado');
ok(cx && cx.key === 'name:Convidado X', 'fictício é chaveado por nome (única identidade que tem)');

console.log('──── 4. o time montado pra eliminatória herda o uid ────');
// É o elo que quebrava: mkTeam (phases-engine) lê `m.uid` de cada linha. Com uid null ele
// gravava só p1Name, e o slot da eliminatória nascia sem identidade. Aqui exercitamos o
// contrato que o phases-engine consome, sem reimplementá-lo.
const linhas = W._computeMonarchStandings(grupo(true));
const dupla = linhas.slice(0, 2);
ok(dupla.every(function (l) { return !!l.uid; }),
  'as 2 primeiras colocadas (que viram dupla na eliminatória) têm uid');
ok(typeof W._slotUids === 'function', '_slotUids existe (é ele que o backfill do phases-engine usa)');
const slotFake = {
  team1Obj: {
    displayName: dupla[0].name + ' / ' + dupla[1].name,
    p1Name: dupla[0].name, p1Uid: dupla[0].uid,
    p2Name: dupla[1].name, p2Uid: dupla[1].uid,
    participants: [{ name: dupla[0].name, uid: dupla[0].uid }, { name: dupla[1].name, uid: dupla[1].uid }],
    fixedPair: true
  }
};
const uidsDoSlot = W._slotUids(slotFake, 'p1') || [];
ok(uidsDoSlot.length === 2, '_slotUids resolve os 2 uids do slot (veio ' + uidsDoSlot.length + ')');
ok(uidsDoSlot.indexOf('uidANA') !== -1, 'o uid da pessoa renomeada está no slot');

console.log('──── 5. varredura: a resolução do uid é UMA SÓ no arquivo ────');
// Foi ter duas cópias da mesma resolução que causou o bug. Se alguém reintroduzir a versão
// curta (sem o mapa dos jogos) no campo `uid`, isto fica vermelho antes de chegar em produção.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
ok(/function _monUid\s*\(/.test(src), 'existe a fonte única _monUid');
ok(!/uid:\s*\(uid \|\| _n2uMon\[name\] \|\| null\)/.test(src),
  'a resolução curta (sem o mapa dos jogos) não voltou pro campo uid');
ok((src.match(/_monUid\(name, uid\)/g) || []).length >= 2,
  'a chave E o campo uid passam pela MESMA função');

console.log('');
if (fail) { console.log('❌ eliminatoria-nasce-com-uid: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ eliminatoria-nasce-com-uid: ' + pass + ' asserções, 0 falha(s)');
