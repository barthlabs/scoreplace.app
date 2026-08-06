/* O ESPELHO DO ROSTER TEM QUE PEGAR QUEM ESTÁ NA ESPERA
 * node tests/espelho-do-roster-cobre-a-espera.test.js
 *
 * O espelho (`tournaments/{id}/participants/{uid}`) existe como REDE contra perda de
 * inscrito — foi a resposta ao incidente do Gersom (v1.7.29 / v1.7.40).
 *
 * MEDIDO em produção (Confra, 06/ago/2026): a subcoleção tinha 119 docs e **as três
 * inscrições daquele dia não estavam lá** — inclusive a da Vanessa, que deu certo. Os
 * únicos docs de gente na fila eram do backfill de 04/ago. A rede não pegava ninguém.
 *
 * TRÊS BURACOS, todos aqui travados:
 *  (1) `_mirrorRoster` só olhava `data.participants` — e quem está na LISTA DE ESPERA não
 *      está lá. Justamente quem é mais frágil (o inscrito tardio) ficava fora da rede.
 *  (2) `if (!antes) return` — a 1ª gravação da sessão não escrevia nada, e a inscrição da
 *      própria pessoa é, quase sempre, o primeiro save da sessão dela.
 *  (3) `_enrollParticipantTx` grava por `transaction.update` e NUNCA chamava o espelho —
 *      só `saveTournament` e `mutateTournament` chamavam. O fallback do cliente (que é o
 *      caminho que roda sempre que a CF falha) não deixava rastro nenhum.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

// Extrai o _mirrorRoster REAL (método de objeto — recorte por contagem de chaves).
function extraiMetodo(marca) {
  const ini = SRC.indexOf(marca);
  if (ini < 0) throw new Error('não achei ' + marca);
  let i = SRC.indexOf('{', ini + marca.length), n = 0, fim = -1;
  for (; i < SRC.length; i++) { if (SRC[i] === '{') n++; else if (SRC[i] === '}') { n--; if (!n) { fim = i + 1; break; } } }
  return SRC.slice(ini, fim);
}

// Firestore falso: registra cada set por doc.
function novoDb() {
  const escritas = [];
  return {
    escritas,
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (u) => ({ set: (payload) => { escritas.push(Object.assign({ _id: u }, payload)); } }),
        }),
      }),
    }),
  };
}
function novoEspelho(uidLogado) {
  const db = novoDb();
  global.window = { AppStore: { currentUser: { uid: uidLogado } },
                    _participantUids: (p) => [p && p.uid, p && p.p1Uid, p && p.p2Uid].filter(Boolean) };
  const alvo = { db: db, _rosterMirrorCache: {} };
  new Function('alvo', 'window', 'var o = { ' + extraiMetodo('_mirrorRoster(docId, data)') + ' }; alvo._mirrorRoster = o._mirrorRoster;')(alvo, global.window);
  return { alvo, db };
}

const EU = 'uid_eu', OUTRO = 'uid_outro', TERCEIRO = 'uid_terceiro';

// ── 1. A ESPERA ENTRA NO ESPELHO ────────────────────────────────────────────────
sec(function () {
  const { alvo, db } = novoEspelho(EU);
  // 1ª gravação (semeia) — depois alguém NOVO entra na fila
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [] });
  db.escritas.length = 0;
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [{ uid: TERCEIRO }] });
  const w = db.escritas.filter((e) => e._id === TERCEIRO);
  ok(w.length === 1, 'quem entra na LISTA DE ESPERA gera doc de espelho, gerou ' + w.length);
  ok(w[0] && w[0].status === 'waitlisted', 'e com status "waitlisted", veio "' + (w[0] && w[0].status) + '"');
  ok(w[0] && w[0].entry && w[0].entry.uid === TERCEIRO, 'com a entrada dela junto');
});

// ── 2. A 1ª GRAVAÇÃO DA SESSÃO ESPELHA O PRÓPRIO USUÁRIO ────────────────────────
sec(function () {
  // é o caso real: a pessoa abre o app, se inscreve, e esse é o 1º save da sessão dela
  const { alvo, db } = novoEspelho(EU);
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }, { uid: TERCEIRO }], standbyParticipants: [{ uid: EU }] });
  ok(db.escritas.length === 1, 'a 1ª gravação escreve 1 doc só (não despeja o roster inteiro), escreveu ' + db.escritas.length);
  ok(db.escritas[0] && db.escritas[0]._id === EU, 'e é o do PRÓPRIO usuário logado — o único evento que importa aqui');
  ok(db.escritas[0] && db.escritas[0].status === 'waitlisted', 'com o status certo (ele entrou na fila)');

  // quem não está no roster não gera escrita nenhuma na 1ª vez
  const b = novoEspelho('uid_visitante');
  b.alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [] });
  ok(b.db.escritas.length === 0, 'visitante que não está no roster não escreve nada');
});

// ── 3. MUDAR DE LUGAR (fila → elenco e elenco → fila) É REGISTRADO ──────────────
sec(function () {
  const { alvo, db } = novoEspelho(EU);
  alvo._mirrorRoster('T', { participants: [], standbyParticipants: [{ uid: OUTRO }] });
  db.escritas.length = 0;
  // o suplente assume: sai da fila e entra no elenco
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [] });
  ok(db.escritas.length === 1 && db.escritas[0].status === 'enrolled',
     'fila → elenco vira escrita com status "enrolled" (com booleano no cache isso não gerava nada)');
  db.escritas.length = 0;
  // W.O. com destino fila: volta pra espera
  alvo._mirrorRoster('T', { participants: [], standbyParticipants: [{ uid: OUTRO }] });
  ok(db.escritas.length === 1 && db.escritas[0].status === 'waitlisted', 'elenco → fila também é registrado');
  db.escritas.length = 0;
  // nada mudou → nenhuma escrita (a razão de existir o delta)
  alvo._mirrorRoster('T', { participants: [], standbyParticipants: [{ uid: OUTRO }] });
  ok(db.escritas.length === 0, 'save que não mexe no roster não gera escrita nenhuma');
});

// ── 4. QUEM SAI É MARCADO, NUNCA APAGADO ───────────────────────────────────────
sec(function () {
  const { alvo, db } = novoEspelho(EU);
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [] });
  db.escritas.length = 0;
  alvo._mirrorRoster('T', { participants: [{ uid: TERCEIRO }], standbyParticipants: [] });
  const saiu = db.escritas.filter((e) => e._id === OUTRO)[0];
  ok(saiu && saiu.status === 'left', 'quem sai é marcado "left" — o histórico é o que faltou no incidente');
  ok(saiu && saiu.leftAt, 'com a data da saída');
});

// ── 5. ESPELHA TUDO: participante · espera · DESATIVADO · W.O. ──────────────────
// Ordem do dono: "tem que espelhar tudo. participante, lista de espera, desativado, wo.
// tudo." Espelhar metade dos estados é ter uma rede que responde "não sei" justamente
// nos casos de borda — e é sempre de um estado de borda que a pessoa some.
sec(function () {
  const { alvo, db } = novoEspelho(EU);
  const doc = (extra) => Object.assign({
    participants: [{ uid: OUTRO }, { uid: TERCEIRO, ligaActive: false }],
    standbyParticipants: [{ uid: EU }], rounds: [],
  }, extra || {});
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [], rounds: [] });
  db.escritas.length = 0;
  alvo._mirrorRoster('T', doc());
  const de = (u) => db.escritas.filter((e) => e._id === u).slice(-1)[0];
  ok(de(TERCEIRO) && de(TERCEIRO).status === 'inactive',
     'DESATIVADO (ligaActive:false) é status próprio, veio "' + (de(TERCEIRO) || {}).status + '"');
  ok(de(EU) && de(EU).status === 'waitlisted', 'quem está na fila continua "waitlisted"');
  ok(de(TERCEIRO) && de(TERCEIRO).wo === false, 'sem W.O. na rodada, a marca vai como false — não fica ausente');

  // W.O. decretado na rodada corrente
  db.escritas.length = 0;
  alvo._mirrorRoster('T', doc({ rounds: [{ round: 1, matches: [
    { isSitOut: true, sitOutReason: 'wo', p1: 'quem for', p1Uid: TERCEIRO, team1Uids: [TERCEIRO] },
    { isSitOut: true, sitOutReason: 'inactive', p1Uid: OUTRO },
  ] }] }));
  ok(de(TERCEIRO) && de(TERCEIRO).wo === true, 'W.O. decretado marca wo:true');
  ok(de(TERCEIRO) && de(TERCEIRO).status === 'inactive',
     'e NÃO apaga o estado real — ele terminou nos desativados (o destino é a informação acionável)');
  ok(!de(OUTRO), 'folga por inatividade (sitOutReason "inactive") NÃO é W.O.');

  // decretar W.O. em quem não mudou de lugar tem que gerar escrita
  db.escritas.length = 0;
  alvo._mirrorRoster('T', doc({ rounds: [] }));
  ok(de(TERCEIRO) && de(TERCEIRO).wo === false,
     'tirar o W.O. também é registrado — o cache guarda status+wo, não só o status');
});

// ── 6. IDENTIDADE É O UID, SEMPRE — nada de casar por nome ──────────────────────
sec(function () {
  const corpo = extraiMetodo('_mirrorRoster(docId, data)')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');   // fora os comentários
  ok(!/_memberUidByName|_pName|displayName/.test(corpo),
     'o espelho NÃO resolve ninguém por nome — doc id é uid e ponto');
  ok(!/monarchWaitlist/.test(corpo),
     'e não lê o monarchWaitlist (mapa categoria→NOMES): quem está lá já vem por uid de standbyParticipants');
  const { alvo, db } = novoEspelho(EU);
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [], rounds: [] });
  db.escritas.length = 0;
  // entrada fictícia (só nome, sem uid) não vira doc — não existe conta pra espelhar
  alvo._mirrorRoster('T', { participants: [{ uid: OUTRO }], standbyParticipants: [{ name: 'Jogador X' }], rounds: [] });
  ok(db.escritas.length === 0, 'entrada sem uid (fictício) não gera doc de espelho, gerou ' + db.escritas.length);
});

// ── 7. O CAMINHO DE INSCRIÇÃO DO CLIENTE CHAMA O ESPELHO ────────────────────────
sec(function () {
  const ini = SRC.indexOf('async _enrollParticipantTx(');
  const fim = SRC.indexOf('\n  async deenrollParticipant(', ini);
  const corpo = SRC.slice(ini, fim > 0 ? fim : ini + 12000);
  ok(/_mirrorRoster\(String\(tournamentId\), out\._mirror\)/.test(corpo),
     'o fallback de inscrição do cliente espelha DEPOIS do commit da transação');
  ok((corpo.match(/_mirror: Object\.assign\(\{\}, data,/g) || []).length >= 2,
     'os DOIS desfechos que gravam (elenco e lista de espera) mandam o DOC INTEIRO — o espelho precisa de rounds (W.O.) e do resto, não só das listas');
  ok(corpo.indexOf('_mirrorRoster') > corpo.indexOf('transaction.update(docRef, updateData)'),
     'e o espelho roda depois da gravação, nunca dentro da transação');
});

console.log((fail === 0 ? '✅' : '❌') + ' espelho-do-roster-cobre-a-espera: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
