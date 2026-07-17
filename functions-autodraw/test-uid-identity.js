// test-uid-identity.js — TRAVA do cânone de identidade.
//
// REGRA DO DONO (jul/2026), sem asterisco:
//   Participante é identificado por UID. SEMPRE.
//   ÚNICA exceção: o jogador FICTÍCIO — o que o organizador digitou à mão e não tem
//   conta. Sem uid, o nome é a única identidade que ele tem.
//   NUNCA identificar por nome / e-mail / celular quem tem uid.
//
// POR QUE ESTE ARQUIVO EXISTE: a varredura de uid já foi dada como concluída e mesmo
// assim o hack de nome voltou — a dupla era resolvida quebrando o rótulo "Ana / Bia" no
// '/', e a dupla que apareceu INTEIRA era mandada pra lista de espera. Promessa de
// varredura não trava conceito nenhum. Isto trava.
//
// COMO A TRAVA FUNCIONA: cada mapa é montado com uma chave-NOME que dá a resposta
// ERRADA e chaves-UID que dão a resposta CERTA. Se qualquer caminho olhar pro nome de
// quem tem uid — como fallback, desempate ou atalho — a resposta vira a errada e o teste
// fica VERMELHO. Não dá pra passar "quase certo".
//
// node test-uid-identity.js

const core = require('./draw-core.js');
const W = core._window;

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}

console.log('\n═══ CÂNONE: uid sempre; nome SÓ pra fictício ═══\n');

// ── ARMADILHA 1 · dupla presente que o nome diria ausente ────────────────────
console.log('Dupla com uid — o rótulo NÃO pode ser consultado:');
{
  const dupla = { p1Uid: 'a1', p1Name: 'Ana', p2Uid: 'b1', p2Name: 'Bia',
                  displayName: 'Ana / Bia', name: 'Ana / Bia' };
  const t = {
    id: 'x', enrollmentMode: 'time', teamSize: 2, participants: [dupla],
    // Os DOIS uids têm check-in ⇒ a dupla apareceu inteira ⇒ PRESENTE.
    // O rótulo NÃO está no mapa — quem ler o nome vai dizer "ausente" e errar.
    checkedIn: { a1: 1, b1: 1 }, absent: {}, waitlist: [],
  };
  ok('dupla 100% presente é PRESENTE (nome diria ausente)', W._entryIsPresent(t, dupla) === true);

  // Agora o inverso: o rótulo ESTÁ no mapa, mas os uids NÃO. Quem cair no nome diz
  // "presente" e erra — ninguém daquela dupla fez check-in.
  const t2 = Object.assign({}, t, { checkedIn: { 'Ana / Bia': 1 } });
  ok('rótulo no mapa NÃO faz a dupla presente (uid manda)', W._entryIsPresent(t2, dupla) === false);

  // Meia dupla: 1 slot presente, 1 não. Não joga.
  const t3 = Object.assign({}, t, { checkedIn: { a1: 1 } });
  ok('dupla com 1 slot ausente NÃO é presente', W._entryIsPresent(t3, dupla) === false);
}

// ── ARMADILHA 2 · homônimo — o motivo de o uid existir ───────────────────────
console.log('\nHomônimos — dois "João Silva", uids diferentes:');
{
  const joao1 = { uid: 'u1', displayName: 'João Silva', name: 'João Silva' };
  const joao2 = { uid: 'u2', displayName: 'João Silva', name: 'João Silva' };
  const t = { id: 'y', participants: [joao1, joao2], checkedIn: { u1: 1 }, absent: {}, waitlist: [] };
  ok('só o João do uid u1 está presente', W._entryIsPresent(t, joao1) === true);
  ok('o outro João (u2) NÃO herda a presença pelo nome', W._entryIsPresent(t, joao2) === false);
}

// ── ARMADILHA 3 · e-mail e celular não identificam ninguém ───────────────────
console.log('\nE-mail / celular NÃO são identidade de quem tem uid:');
{
  const p = { uid: 'u9', displayName: 'Rodrigo', name: 'Rodrigo',
              email: 'rod@x.com', phone: '+5511999998888' };
  const t = { id: 'z', participants: [p], absent: {}, waitlist: [],
              checkedIn: { 'rod@x.com': 1, '+5511999998888': 1, 'Rodrigo': 1 } };
  ok('check-in por e-mail/celular/nome NÃO vale — só o uid', W._entryIsPresent(t, p) === false);
  t.checkedIn = { u9: 1 };
  ok('check-in pelo uid vale', W._entryIsPresent(t, p) === true);
}

// ── ARMADILHA 4 · o fictício — a ÚNICA exceção ───────────────────────────────
console.log('\nJogador FICTÍCIO (digitado pelo organizador, sem conta) — nome é a identidade:');
{
  const ficticio = { displayName: 'Convidado do Zé', name: 'Convidado do Zé' }; // sem uid
  const t = { id: 'w', participants: [ficticio], checkedIn: { 'Convidado do Zé': 1 },
              absent: {}, waitlist: [] };
  ok('fictício resolve por nome (não tem outra identidade)', W._entryIsPresent(t, ficticio) === true);
  t.checkedIn = {};
  ok('fictício sem check-in é ausente', W._entryIsPresent(t, ficticio) === false);
}

// ── ARMADILHA 5 · "ausente" também é por uid, e QUALQUER slot derruba ────────
console.log('\nMarcar ausente é por uid; 1 slot ausente derruba a dupla:');
{
  const dupla = { p1Uid: 'a1', p1Name: 'Ana', p2Uid: 'b1', p2Name: 'Bia', displayName: 'Ana / Bia' };
  const t = { id: 'v', participants: [dupla], checkedIn: { a1: 1, b1: 1 },
              absent: { b1: 1 }, waitlist: [] };
  ok('dupla com 1 slot marcado ausente NÃO é presente', W._isParticipantPresent(t, dupla) === false);
  // O rótulo no mapa `absent` não pode derrubar quem tem uid limpo.
  const t2 = { id: 'v2', participants: [dupla], checkedIn: { a1: 1, b1: 1 },
               absent: { 'Ana / Bia': 1 }, waitlist: [] };
  ok('rótulo em `absent` NÃO derruba a dupla (uid manda)', W._isParticipantPresent(t2, dupla) === true);
}

// ── ARMADILHA 6 · a chamada pré-sorteio inteira, pelo uid ────────────────────
// O cenário do dono: "16 inscritos, só apareceram 10 → sorteia entre os 10; os 6 o
// organizador decide". Com o rótulo plantado no mapa pra pegar quem ler nome.
console.log('\nChamada pré-sorteio — 16 inscritos, 10 com presença:');
{
  const t = { id: 'r', participants: [], checkedIn: {}, absent: {}, waitlist: [] };
  for (let i = 1; i <= 16; i++) t.participants.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  for (let i = 1; i <= 10; i++) t.checkedIn['u' + i] = 1;
  // armadilha: o nome de um AUSENTE plantado no mapa. Quem ler nome leva 11 pra chave.
  t.checkedIn['J16'] = 1;
  const r = W._applyPresenceRoll(t, 'waitlist');
  ok('sorteia entre os 10 (J16 não entra pelo nome)', t.participants.length === 10,
     'na chave=' + t.participants.length);
  ok('os 6 ausentes vão pro destino escolhido', r.absent.length === 6 && t.waitlist.length === 6,
     'espera=' + t.waitlist.length);
  ok('J16 está entre os ausentes', t.waitlist.some((p) => p.uid === 'u16'));
}

// ── ARMADILHA 7 · duplas na chamada pré-sorteio ──────────────────────────────
console.log('\nChamada pré-sorteio com DUPLAS (2 slots, 2 uid):');
{
  const t = {
    id: 'd', enrollmentMode: 'time', teamSize: 2,
    participants: [
      { p1Uid: 'a1', p1Name: 'Ana', p2Uid: 'b1', p2Name: 'Bia', displayName: 'Ana / Bia' },
      { p1Uid: 'a2', p1Name: 'Caio', p2Uid: 'b2', p2Name: 'Duda', displayName: 'Caio / Duda' },
      { p1Uid: 'a3', p1Name: 'Eva', p2Uid: 'b3', p2Name: 'Fabio', displayName: 'Eva / Fabio' },
    ],
    checkedIn: { a1: 1, b1: 1, a2: 1 }, // dupla 1 inteira; dupla 2 com 1 só; dupla 3 ninguém
    absent: {}, waitlist: [],
  };
  const r = W._applyPresenceRoll(t, 'waitlist');
  ok('a dupla que apareceu INTEIRA fica na chave', t.participants.length === 1 &&
     t.participants[0].displayName === 'Ana / Bia',
     'na chave=' + (t.participants.map((p) => p.displayName).join('|') || 'NENHUMA'));
  ok('as outras 2 vão pro destino escolhido', r.absent.length === 2, 'espera=' + t.waitlist.length);
}

// ── ARMADILHA 8 · A FORMA REAL DO DOC: entrada SÓ-UID, sem nome nenhum ──────
// `_stripUidEntryNames` NÃO grava o nome de quem tem perfil vivo. Então no Firestore a
// entrada é literalmente {p1Uid,p2Uid} / {uid} — sem p1Name, sem displayName. É ISSO que
// a CF lê. Todo código que dependia de `p.displayName||p.name` virava no-op silencioso
// aqui: ninguém saía do elenco, ninguém entrava na espera, e o sorteio seguia com os
// ausentes dentro. Fixture com nome é ficção; esta é a forma de produção.
console.log('\nFORMA REAL DO DOC (só uid, ZERO nome — é o que a CF lê):');
{
  const t = {
    id: 'real', enrollmentMode: 'time', teamSize: 2,
    participants: [
      { p1Uid: 'a1', p2Uid: 'b1' },   // dupla inteira presente
      { p1Uid: 'a2', p2Uid: 'b2' },   // 1 slot presente
      { p1Uid: 'a3', p2Uid: 'b3' },   // ninguém
    ],
    checkedIn: { a1: 1, b1: 1, a2: 1 }, absent: {}, waitlist: [],
  };
  const uidsOf = (p) => W._participantUids(p).join('+');
  const r = W._applyPresenceRoll(t, 'waitlist');
  ok('a dupla presente [a1+b1] fica na chave',
     t.participants.length === 1 && uidsOf(t.participants[0]) === 'a1+b1',
     'na chave=[' + (t.participants.map(uidsOf).join('] [') || '') + ']');
  ok('as outras 2 vão pra espera', t.waitlist.length === 2,
     'espera=[' + t.waitlist.map(uidsOf).join('] [') + ']');
}

// Sem-dupla, forma real: avulso {uid} sem nome TEM que ir pra espera.
{
  const t = {
    id: 'real2', enrollmentMode: 'time', teamSize: 2,
    participants: [{ p1Uid: 'a1', p2Uid: 'b1' }, { uid: 's1' }, { uid: 's2' }],
    waitlist: [], checkedIn: {}, absent: {},
  };
  const moved = W._soloMoveOut(t, true);
  ok('avulso só-uid vai pra espera (nome vazio não pode barrar)', moved === 2 && t.waitlist.length === 2,
     'moveu=' + moved + ', espera=[' + t.waitlist.map((p) => W._participantUids(p).join('+')).join('] [') + ']');
  ok('a dupla continua no elenco', t.participants.length === 1);
}

// Ausente → standby, forma real.
{
  const t = {
    id: 'real3', participants: [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u3' }],
    absent: { u2: 1 }, checkedIn: {}, standbyParticipants: [],
  };
  const moved = W._autoMoveAbsentToStandby(t);
  ok('ausente só-uid sai do elenco e vai pro standby',
     moved === 1 && t.participants.length === 2 && t.standbyParticipants[0].uid === 'u2',
     'elenco=[' + t.participants.map((p) => p.uid).join(',') + '] standby=[' +
     t.standbyParticipants.map((p) => p.uid).join(',') + ']');
}

// ── ARMADILHA 9 · dedup por uid, não por nome (homônimo na espera) ──────────
console.log('\nDedup da lista de espera é por uid — homônimo não pode sumir:');
{
  const t = {
    id: 'h', participants: [
      { uid: 'u1', displayName: 'João Silva' },
      { uid: 'u2', displayName: 'João Silva' },  // homônimo, uid diferente
    ],
    checkedIn: {}, absent: {}, waitlist: [],
  };
  const r = W._applyPresenceRoll(t, 'waitlist');
  ok('os DOIS Joãos entram na espera (dedup por nome descartaria o 2º)',
     t.waitlist.length === 2 && t.waitlist[0].uid === 'u1' && t.waitlist[1].uid === 'u2',
     'espera=[' + t.waitlist.map((p) => p.uid).join(',') + ']');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
