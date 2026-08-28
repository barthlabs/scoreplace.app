/* OS DOIS LANÇARAM JUNTOS, E CADA UM SE VIA COMO O AUTOR
 *   node tests/dois-lancam-juntos-um-so-vence.test.js
 *
 * RELATO DO DONO (27/ago/2026): _"mostraram para mim celulares que lançaram placares e
 * indicava que o usuário foi quem lançou os resultados, mas no celular do outro usuário da
 * mesma partida aparecia que quem tinha lançado o resultado era aquele outro usuário. assim,
 * como cada usuário constava como o apontador dos resultados, nenhum deles podia aprovar o
 * resultado que ficou pendente. organizador teve que aprovar."_
 *
 * A MECÂNICA, e por que a trava que já existia não pegava: quem propôs não vê o botão
 * Confirmar (não se aprova a própria proposta). A trava contra o 2º lançamento (incidente
 * 18/jul) perguntava pro `m` LOCAL — _"já tem proposta do outro lado?"_. Quando os dois
 * lançam quase juntos, o aparelho B ainda não recebeu o snapshot com a proposta de A: a
 * trava responde "não tem", e a transação gravava `fm.pendingResult` no doc FRESCO
 * INCONDICIONALMENTE. Resultado: o servidor fica com B, o aparelho de A segue pintando a
 * própria cópia otimista com A — e os dois esperam o outro confirmar.
 *
 * O CONSERTO é fazer a mesma pergunta onde mora a verdade: dentro da transação, sobre o doc
 * fresco. Este teste separa as duas cópias de propósito — `local` (o que B vê) e `servidor`
 * (o que já tem a proposta de A) —, que é exatamente o que a trava velha não sabia fazer.
 */
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const ORG = { uid: 'uid_org', email: 'org@x.com', displayName: 'Organizador' };
const A = { uid: 'uid_a', email: 'a@x.com', displayName: 'Catia' };      // time 1
const B = { uid: 'uid_b', email: 'b@x.com', displayName: 'Angelica' };   // time 2

function novoT() {
  return {
    id: 't1', name: 'Confra', sport: 'Beach Tennis', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', creatorUid: ORG.uid, creatorEmail: ORG.email, organizerEmail: ORG.email,
    coHosts: [], arbitros: [], checkedIn: {},
    resultEntry: 'all',
    scoring: { type: 'sets', gamesPerSet: 6, tiebreakEnabled: false, setsToWin: 1, countingType: 'tennis' },
    participants: [{ uid: A.uid, ligaActive: true }, { uid: B.uid, ligaActive: true }],
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [{
      name: 'R1 Grupo A', players: ['Catia', 'Angelica'], playersUids: [A.uid, B.uid] }],
      matches: [{
        id: 'm1', p1: 'Catia / Roberta', p2: 'Angelica / Lician',
        team1: ['Catia', 'Roberta'], team2: ['Angelica', 'Lician'],
        team1Uids: [A.uid, 'uid_rob'], team2Uids: [B.uid, 'uid_lic'],
        roundIndex: 0, monarchGroup: 0, isMonarch: true, winner: null
      }] }]
  };
}
const jogo = (t) => t.rounds[0].matches[0];

function propostaDe(user, s1, s2) {
  return { kind: 'inline', proposedBy: user.uid, proposedByEmail: user.email,
    proposedByName: user.displayName, proposedAt: 1787000000000,
    winner: s1 > s2 ? 'Catia / Roberta' : 'Angelica / Lician',
    scoreP1: s1, scoreP2: s2, useSets: false };
}

function montaDom(matchId, s1, s2) {
  const els = {};
  const inp = (v) => ({ value: v == null ? '' : String(v), style: {},
    setAttribute() {}, getAttribute() { return null; } });
  els['s1-' + matchId] = inp(s1);
  els['s2-' + matchId] = inp(s2);
  W.document.getElementById = (id) => els[id] || null;
}

let avisos = [];
// `local` = o que o aparelho de B tem em memória (STALE). `servidor` = o doc fresco que a
// transação lê. São dois objetos DIFERENTES de propósito — é essa diferença que o bug
// explora, e um harness que use o mesmo objeto pros dois nunca reproduziria a falha.
function boot(local, servidor, quem) {
  avisos = [];
  W.AppStore.tournaments = [local];
  W.AppStore.currentUser = quem;
  W.AppStore.mutate = (id, fn) => { fn(servidor); return Promise.resolve(true); };
  W.AppStore.commitTournamentTx = (id, fn) => {
    const r = fn(servidor);
    if (r === false) return Promise.resolve(true);   // mutator abortou: nada é gravado
    servidor.updatedAt = 'gravado';
    return Promise.resolve(true);
  };
  W.AppStore.logAction = () => {};
  W.showAlertDialog = (t2, m) => { avisos.push(String(t2) + ' :: ' + String(m)); };
  W.showNotification = (t2, m) => { avisos.push(String(t2) + ' :: ' + String(m)); };
  W.showConfirmDialog = (a, b, onOk) => { onOk && onOk(); };
  W._rerenderBracket = () => {};
  W._sendUserNotification = () => {};
}

async function main() {
  console.log('──── os dois lançam juntos: um só vence ────');

  console.log('\n1. A pergunta "o outro lado já propôs?" existe e é por UID');
  {
    const t = novoT();
    ok(typeof W._propostaDoOutroLado === 'function', 'a pergunta está exposta pro app inteiro');
    const m = jogo(t);
    ok(W._propostaDoOutroLado(t, m, B) === false, 'sem proposta nenhuma → não há corrida');
    m.pendingResult = propostaDe(A, 6, 4);
    ok(W._propostaDoOutroLado(t, m, B) === true, 'proposta de A, perguntando por B → é do OUTRO lado');
    ok(W._propostaDoOutroLado(t, m, A) === false, 'proposta de A, perguntando por A → é o MESMO lado (relançar é dele)');
    m.pendingResult.disputed = true;
    ok(W._propostaDoOutroLado(t, m, B) === false, 'proposta EM DISPUTA não trava ninguém (quem decide é o organizador)');
  }

  console.log('\n2. A CORRIDA: B lança sem ter recebido a proposta de A');
  {
    const local = novoT();                     // o aparelho de B: jogo limpo (snapshot atrasado)
    const servidor = novoT();                  // o servidor: A já propôs 6×4
    jogo(servidor).pendingResult = propostaDe(A, 6, 4);
    boot(local, servidor, B);
    montaDom('m1', 3, 6);                      // B digita 3×6 e manda
    W._saveResultInline('t1', 'm1');

    // o local é mutado otimista ANTES da transação — é isso que o aparelho pinta
    ok(jogo(local).pendingResult && jogo(local).pendingResult.proposedBy === B.uid,
      'antes da transação, o aparelho de B mostra B como autor (a cópia otimista)');

    await new Promise((r) => setTimeout(r, 0));   // deixa a transação resolver

    ok(jogo(servidor).pendingResult.proposedBy === A.uid,
      '⭐ o SERVIDOR mantém a proposta de A — o 2º lançamento NÃO grava por cima');
    ok(jogo(servidor).pendingResult.scoreP1 === 6 && jogo(servidor).pendingResult.scoreP2 === 4,
      '  → com o placar de A intacto (6×4), não o de B (3×6)');
    ok(servidor.updatedAt !== 'gravado', '  → e a transação nem chegou a escrever (abortou)');

    ok(jogo(local).pendingResult.proposedBy === A.uid,
      '⭐ e a TELA DE B é curada: passa a mostrar A como autor — é o que devolve o Confirmar a B');
    ok(jogo(local).pendingResult.scoreP1 === 6 && jogo(local).pendingResult.scoreP2 === 4,
      '  → com o placar que vale');
    ok(avisos.some((a) => /outro time lançou primeiro/i.test(a)),
      '  → e B é avisado do que aconteceu, em vez de ficar achando que mandou');
  }

  console.log('\n3. O CAMINHO NORMAL segue igual: sem corrida, a proposta grava');
  {
    const local = novoT(), servidor = novoT();
    boot(local, servidor, B);
    montaDom('m1', 3, 6);
    W._saveResultInline('t1', 'm1');
    await new Promise((r) => setTimeout(r, 0));
    ok(jogo(servidor).pendingResult && jogo(servidor).pendingResult.proposedBy === B.uid,
      'sem proposta do outro lado, a de B grava normalmente');
    ok(servidor.updatedAt === 'gravado', '  → e a transação escreveu de verdade');
  }

  console.log('\n4. RELANÇAR A PRÓPRIA proposta continua permitido (mesmo lado)');
  {
    const local = novoT(), servidor = novoT();
    jogo(local).pendingResult = propostaDe(B, 3, 6);
    jogo(servidor).pendingResult = propostaDe(B, 3, 6);
    boot(local, servidor, B);
    montaDom('m1', 2, 6);                       // B corrige o próprio placar
    W._saveResultInline('t1', 'm1');
    await new Promise((r) => setTimeout(r, 0));
    ok(jogo(servidor).pendingResult.scoreP2 === 6 && jogo(servidor).pendingResult.scoreP1 === 2,
      'o próprio proponente corrige a própria proposta (2×6)');
    ok(servidor.updatedAt === 'gravado', '  → e isso grava');
  }

  console.log('');
  if (fail) {
    console.log('❌ dois-lancam-juntos-um-so-vence: ' + pass + ' ok, ' + fail + ' falha(s)');
    fails.forEach((f) => console.log('   • ' + f));
    process.exit(1);
  }
  console.log('✅ dois-lancam-juntos-um-so-vence: ' + pass + ' asserções, 0 falha(s)');
}

main().catch((e) => { console.log('❌ erro: ' + (e && e.stack || e)); process.exit(1); });
