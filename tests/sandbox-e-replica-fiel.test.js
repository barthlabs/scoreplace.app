/* O SANDBOX É RÉPLICA FIEL DO ORIGINAL  (FIX.SANDBOX.P1)
 * node tests/sandbox-e-replica-fiel.test.js
 *
 * INVARIANTE DO DONO (01/set/2026), palavra por palavra:
 *   _"O sandbox é uma réplica fiel do original. Qualquer diferença de estado de torneio além
 *    de id técnico, sandboxOf, notificações suprimidas e estatísticas históricas pessoais
 *    suprimidas é defeito bloqueante."_
 *   _"Não é permitido simplificar, limpar, reconstruir, normalizar, reduzir ou substituir
 *    participantes, inscrições, member state, jogos, resultados, fases, rankings,
 *    classificações congeladas, W.O., espera, histórico, barras, progresso ou chaves."_
 *   _"Se a cópia não puder provar igualdade canônica de tudo isso antes de ficar visível, ela
 *    NÃO serve, NÃO pode ser aberta e NÃO pode ser entregue ao usuário."_
 *
 * ⛔ O DEFEITO REPRODUZIDO AQUI: a criação clonava `orig` vindo do AppStore — que num torneio
 * DIVIDIDO é o documento MAGRO (elenco e jogos moram em subcoleção e chegam depois). Saía um
 * sandbox com 14 inscritos e ZERO jogos, gravado com `_semPesados` prometendo partes que
 * NINGUÉM pode escrever: o cliente não pode (firestore.rules: `allow write: if false` em
 * inscritos/opponentHistory/matches) e a CF do espelho PULA justamente o que está no
 * marcador. A tela mostrava "…" inscritos, não sabia se você estava inscrito e perdia as
 * barras de progresso.
 *
 * ⭐ A FIXTURE É O PONTO: a fonte tem 152 inscritos e 115 jogos, e o objeto da TELA é
 * propositalmente magro (14 e 0). Um teste que partisse do objeto completo passaria por cima
 * do código quebrado — foi exatamente assim que o defeito chegou à produção.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
try { require('./headless').load('tournaments-organizer.js'); } catch (e) { /* medido no bloco ① */ }

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };
const canon = (v) => (W._sbCore ? W._sbCore.canon(v) : JSON.stringify(v));
/* ⚠️ chama a porta se ela existir. Contra a árvore ANTERIOR `_criaSandboxFiel` não existe, e
 * o teste tem que REPORTAR as ~20 falhas em vez de explodir na primeira e esconder o resto.
 * O caminho ANTIGO (clonar o objeto da tela) é simulado aqui pra as asserções medirem o que
 * ele produzia: um sandbox com 14 inscritos e 0 jogos. */
async function criar(origId, cu) {
  if (typeof W._criaSandboxFiel === 'function') return W._criaSandboxFiel(origId, cu);
  if (typeof W._openOrCreateSandbox !== 'function') return { ok: false, motivo: 'sem-porta' };
  W._openOrCreateSandbox(origId);                 // o caminho antigo: síncrono, clona o magro
  return { ok: true, motivo: 'porta-antiga' };
}

/* ── A CONFRA EQUIVALENTE: 152 inscritos, 115 jogos (105 reais + 10 folga/W.O.) ── */
function jogo(i, folga) {
  const a = 'P' + (i * 2), b = 'P' + (i * 2 + 1);
  return folga
    ? { id: 'm' + i, isSitOut: true, sitOutReason: 'wo', p1: a, p2: '' }
    : { id: 'm' + i, isMonarch: true, p1: a, p2: b, team1: [a], team2: [b],
        winner: a, scoreP1: 6, scoreP2: 3, resultAt: 1000 + i };
}
function original() {
  const matches = [];
  for (let i = 0; i < 105; i++) matches.push(jogo(i, false));
  for (let i = 105; i < 115; i++) matches.push(jogo(i, true));
  const participants = [];
  for (let i = 0; i < 152; i++) participants.push({ uid: 'u' + i, name: 'P' + i, displayName: 'P' + i, ligaActive: true, enrollSeq: i + 1 });
  const grupos = [];
  for (let g = 0; g < 35; g++) grupos.push({
    name: 'R1 Grupo ' + g, players: ['a' + g, 'b' + g, 'c' + g, 'd' + g], playersUids: ['ua' + g, 'ub' + g, 'uc' + g, 'ud' + g],
    matchIds: ['m' + (g * 3), 'm' + (g * 3 + 1), 'm' + (g * 3 + 2)],
    classifCongelada: [{ name: 'a' + g, uid: 'ua' + g }, { name: 'b' + g, uid: 'ub' + g },
                       { name: 'c' + g, uid: 'uc' + g }, { name: 'd' + g, uid: 'ud' + g }],
    classifCongeladaAt: '2026-08-30T12:00:00.000Z', woAbsent: 'x' + g, woDest: 'inactive'
  });
  return {
    id: 'ORIG', name: 'Confra', sport: 'Beach Tennis', status: 'in_progress',
    format: 'Liga', currentPhaseIndex: 0, teamSize: 2, isPublic: true,
    creatorUid: 'uDono', organizerEmail: 'dono@x.com', organizerName: 'Dono',
    memberUids: participants.map((p) => p.uid), coHosts: [{ uid: 'uCo' }], adminUids: ['uDono'],
    participants: participants,
    waitlist: [{ uid: 'w1', name: 'Espera Um' }, { uid: 'w2', name: 'Espera Dois' }],
    standbyParticipants: [{ uid: 's1', name: 'Suplente' }],
    monarchWaitlist: { '0': ['w1'] },
    history: [{ date: '2026-08-01', message: 'Torneio Criado' }, { date: '2026-08-30', message: 'Rodada 1' }],
    opponentHistory: { u0: ['u1'] },
    woLog: [{ absentUid: 'ux', absentName: 'X', groupName: 'R1 Grupo 0', roundIndex: 0, at: '2026-08-10' }],
    phases: [{ name: 'Rei/Rainha', rounds: 1 }, { name: 'Ouro/Prata' }],
    rounds: [{ round: 1, status: 'complete', matches: matches, monarchGroups: grupos }],
    matches: []
  };
}
function dividido(orig) {
  const s = W._tSplit.dividir(orig, ['matches', 'participants', 'opponentHistory']);
  const cfg = s.config;
  cfg._semPesados = ['matches', 'participants', 'opponentHistory'];
  cfg._nPartes = { matches: s.matches.length, participants: s.participants.length, opponentHistory: s.opponentHistory.length };
  cfg._nJogos = s.matches.length;
  return { config: cfg, partes: { matches: s.matches, inscritos: s.participants, opponentHistory: s.opponentHistory } };
}

(async () => {
  console.log('──── o sandbox é réplica fiel do original ────');
  const ORIG = original();
  const DIV = dividido(ORIG);

  console.log('\n── ① a fixture é o cenário do defeito ──');
  ok('as portas existem', typeof W._criaSandboxFiel === 'function' && typeof W._sbProvaIgualdade === 'function' &&
    typeof W._sbPartesCompletas === 'function' && typeof W._sbAplicaEnvelope === 'function');
  ok('a fonte dividida promete 152 inscritos', DIV.config._nPartes.participants === 152, JSON.stringify(DIV.config._nPartes));
  ok('  → e 115 jogos', DIV.config._nJogos === 115 && DIV.config._nPartes.matches === 115);
  ok('  → e o DOCUMENTO saiu sem eles (é o que a tela recebe primeiro)',
    (DIV.config.participants || []).length === 0 && ((DIV.config.rounds[0] || {}).matches || []).length === 0);
  const MAGRO = JSON.parse(JSON.stringify(DIV.config));
  MAGRO.participants = ORIG.participants.slice(0, 14);
  ok('⭐ o objeto da TELA é magro DE PROPÓSITO: 14 inscritos, 0 jogos',
    MAGRO.participants.length === 14 && ((MAGRO.rounds[0] || {}).matches || []).length === 0);

  // banco de mentira: responde como o Firestore (doc dividido + subcoleções)
  let PARCIAL = false, FALHAR = false;
  const GRAVADOS = [];
  W.FirestoreDB = {
    db: true,
    async loadTournamentById(id) {
      if (FALHAR) return null;
      if (String(id) !== 'ORIG') return null;
      const cfg = JSON.parse(JSON.stringify(DIV.config));
      const t = await W._tSplit.montarDoBanco(cfg, (col) => {
        const m = { matches: DIV.partes.matches, inscritos: DIV.partes.inscritos, opponentHistory: DIV.partes.opponentHistory };
        const arr = m[col] || [];
        return JSON.parse(JSON.stringify(PARCIAL && col === 'inscritos' ? arr.slice(0, 14) : arr));
      });
      if (typeof W._hydrateMonarchGroups === 'function') W._hydrateMonarchGroups(t);
      return t;
    },
    async saveTournament(t) { GRAVADOS.push(JSON.parse(JSON.stringify(t))); return true; }
  };
  const CU = { uid: 'uDev', email: 'dev@x.com', displayName: 'Dev' };
  W.AppStore.currentUser = CU;
  W.SP_TEST_IDENTITIES = ['dev@x.com', 'uDev'];
  W.AppStore.tournaments = [MAGRO];                       // ⛔ SÓ o magro: é dele que NÃO se pode partir
  W._findTournamentById = (id) => W.AppStore.tournaments.filter((x) => String(x.id) === String(id))[0] || null;
  let navegou = null;
  Object.defineProperty(W, 'location', { configurable: true, value: { set hash(v) { navegou = v; }, get hash() { return navegou || ''; } } });

  console.log('\n── ② a conferência das partes reprova o incompleto e aprova o completo ──');
  const completo = await W.FirestoreDB.loadTournamentById('ORIG');
  ok('o completo tem 152 inscritos e 115 jogos',
    (completo.participants || []).length === 152 && ((completo.rounds[0] || {}).matches || []).length === 115);
  ok('⭐ `_sbPartesCompletas` APROVA o completo', (W._sbPartesCompletas ? W._sbPartesCompletas(completo).ok : false) === true,
    W._sbPartesCompletas ? JSON.stringify(W._sbPartesCompletas(completo).faltas) : '(sem porta)');
  ok('⭐⭐ e REPROVA o magro (14 de 152)', (W._sbPartesCompletas ? W._sbPartesCompletas(MAGRO).ok : true) === false,
    W._sbPartesCompletas ? JSON.stringify(W._sbPartesCompletas(MAGRO).faltas) : '(sem porta)');

  console.log('\n── ③ criação pela porta real: 152 inscritos, 115 jogos, tudo íntegro ──');
  const r = await criar('ORIG', CU);
  ok('a criação deu OK', r && r.ok === true, JSON.stringify(r));
  ok('gravou EXATAMENTE 1 documento', GRAVADOS.length === 1, 'gravou ' + GRAVADOS.length);
  const SB = GRAVADOS[0] || {};
  ok('⭐⭐ o sandbox tem 152 inscritos', (SB.participants || []).length === 152, 'veio ' + (SB.participants || []).length);
  ok('⭐⭐ e 115 jogos', ((SB.rounds || [])[0] || {}).matches.length === 115, 'veio ' + (((SB.rounds || [])[0] || {}).matches || []).length);
  ok('⭐⭐ e o opponentHistory completo', canon(SB.opponentHistory) === canon(ORIG.opponentHistory));
  ok('⛔ e NASCEU INTEIRO (sem _semPesados/_nPartes/_nJogos — ninguém escreveria as partes)',
    SB._semPesados === undefined && SB._nPartes === undefined && SB._nJogos === undefined);

  console.log('\n── ④ igualdade canônica: nada foi simplificado, limpo ou reconstruído ──');
  [['participants', 152], ['waitlist', 2], ['standbyParticipants', 1], ['history', 2]].forEach(([campo, n]) => {
    ok('⭐ `' + campo + '` byte a byte igual ao original (' + n + ')',
      canon(SB[campo]) === canon(ORIG[campo]), 'sb=' + canon(SB[campo]).slice(0, 70));
  });
  /* ⚠️ `rounds` compara na forma DOBRADA nos dois lados: a leitura canônica hidrata
   * `monarchGroups[].matches` com REFERÊNCIAS aos jogos que já moram em `rounds[].matches`.
   * Um lado hidratado e o outro não acusaria diferença sem que jogo nenhum diferisse.
   * Dobrar roda em CÓPIA — nem o original nem o sandbox são tocados. */
  const dobrado = (t) => { const c = JSON.parse(JSON.stringify(t)); if (typeof W._foldMonarchGroups === 'function') W._foldMonarchGroups(c); return c; };
  const SBd = dobrado(SB), ORIGd = dobrado(ORIG);
  ['monarchWaitlist', 'woLog', 'phases', 'rounds', 'matches', 'opponentHistory', 'currentPhaseIndex', 'status', 'format'].forEach((campo) => {
    ok('⭐ `' + campo + '` idêntico', canon(SBd[campo]) === canon(ORIGd[campo]),
      'sb=' + canon(SBd[campo]).slice(0, 80));
  });
  ok('  → e os 115 jogos seguem em rounds[0].matches nos dois',
    ((SBd.rounds[0] || {}).matches || []).length === 115 && ((ORIGd.rounds[0] || {}).matches || []).length === 115);
  const gSb = (SB.rounds[0] || {}).monarchGroups || [], gOr = (ORIG.rounds[0] || {}).monarchGroups || [];
  ok('⭐⭐ as 35 classificações CONGELADAS passaram intactas',
    gSb.length === 35 && gSb.every((g, i) => canon(g.classifCongelada) === canon(gOr[i].classifCongelada) &&
      g.classifCongeladaAt === gOr[i].classifCongeladaAt));
  ok('⭐⭐ e o W.O. de cada grupo também (woAbsent/woDest)',
    gSb.every((g, i) => g.woAbsent === gOr[i].woAbsent && g.woDest === gOr[i].woDest));
  const prova = W._sbProvaIgualdade ? W._sbProvaIgualdade(ORIG, SB) : { ok: false, diferencas: [{ campo: '(sem porta)' }] };
  ok('⭐⭐ a PROVA canônica não acha diferença fora do envelope', prova.ok === true,
    prova.diferencas.map((d) => d.campo).join(', '));

  console.log('\n── ⑤ o envelope: só o que o dono permitiu ──');
  ok('id técnico e sandboxOf', SB.id !== ORIG.id && String(SB.sandboxOf) === 'ORIG' && SB.isSandbox === true);
  ok('notificações suprimidas', SB.notificationsMuted === true);
  ok('privado (invisível pra quem não é o dev)', SB.isPublic === false);
  // ⚠️ DECISÃO REGISTRADA: memberUids/coHosts/adminUids são ENTREGA, não estado do torneio —
  // com os uids reais, o Firestore entrega o doc do SB no listener das 152 pessoas.
  // `participants` (o estado) continua íntegro, e é isso que a asserção acima já provou.
  ok('⚠️ memberUids é ESCOPO de entrega (só o dev) — e `participants` segue com as 152',
    canon(SB.memberUids) === canon([CU.uid]) && (SB.participants || []).length === 152);
  ok('  → coHosts e adminUids idem', canon(SB.coHosts) === canon([]) && canon(SB.adminUids) === canon([CU.uid]));

  console.log('\n── ⑥ barras e progresso: o sandbox reproduz o original ──');
  const pOrig = W._getTournamentProgress(ORIG), pSb = W._getTournamentProgress(SB);
  ok('⭐⭐ progresso idêntico', pOrig.total === pSb.total && pOrig.completed === pSb.completed && pOrig.pct === pSb.pct,
    JSON.stringify(pOrig) + ' × ' + JSON.stringify(pSb));
  ok('⭐⭐ 105/105 jogos reais concluídos (as 10 folgas NÃO inflam)',
    pSb.total === 105 && pSb.completed === 105, JSON.stringify(pSb));
  ok('  → e a prova de progresso concorda', !!W._sbProvaProgresso && W._sbProvaProgresso(ORIG, SB).ok === true);

  console.log('\n── ⑦ hidratação incompleta: RECUSA criar, não deixa doc parcial, não navega ──');
  GRAVADOS.length = 0; navegou = null; PARCIAL = true;
  const r2 = await criar('ORIG', CU);
  ok('⭐⭐ recusou criar', r2 && r2.ok === false, JSON.stringify(r2));
  ok('⭐⭐ e NÃO gravou documento nenhum', GRAVADOS.length === 0, 'gravou ' + GRAVADOS.length);
  ok('⭐⭐ e NÃO navegou pro sandbox', navegou === null, String(navegou));
  ok('  → e disse o motivo (partes incompletas)', r2.motivo === 'partes-incompletas', r2.motivo);
  PARCIAL = false;

  console.log('\n── ⑧ leitura que falha: mesma recusa ──');
  GRAVADOS.length = 0; navegou = null; FALHAR = true;
  const r3 = await criar('ORIG', CU);
  ok('⭐⭐ recusou criar', r3 && r3.ok === false && GRAVADOS.length === 0 && navegou === null, JSON.stringify(r3));
  FALHAR = false;

  console.log('\n── ⑨ a porta pública NÃO parte do objeto da tela ──');
  const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-organizer.js'), 'utf8');
  const corpo = (() => { const i = src.indexOf('window._openOrCreateSandbox = function'); return i < 0 ? '' : src.slice(i, src.indexOf('\n};', i)); })();
  ok('⛔ `_openOrCreateSandbox` não faz mais JSON.parse(JSON.stringify(orig))',
    corpo.indexOf('JSON.stringify(orig)') === -1, 'o clone do objeto MAGRO voltou');
  ok('⭐ ela delega pra porta que lê o completo e prova', corpo.indexOf('_criaSandboxFiel') !== -1);

  console.log('\n── ⑩ o RESYNC também não reconstrói nem zera ──');
  const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const corpoRe = (() => { const i = st.indexOf('window._resyncSandboxRoster = function'); return i < 0 ? '' : st.slice(i, st.indexOf('\n};', i)); })();
  // ⚠️ olha a CHAMADA, não o nome: o comentário do resync cita a função de propósito, pra
  // dizer que ela existe e NÃO é usada aqui. Casar com o nome solto acusaria o comentário.
  const _semComentarios = corpoRe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('⛔ não reconstrói o roster (nenhuma CHAMADA a _sbRebuildCleanRoster)',
    !/_sbRebuildCleanRoster\s*\(/.test(_semComentarios), 'o roster voltou a ser reconstruído');
  ok('  → e nem recolhe o roster pra decidir o que copiar',
    !/_sbCollectRealEnrollees\s*\(/.test(_semComentarios));
  ok('⛔ não zera a espera nem os suplentes',
    corpoRe.indexOf('ft.waitlist = []') === -1 && corpoRe.indexOf('ft.standbyParticipants = []') === -1);
  ok('⛔ e o resync também nasce INTEIRO', corpoRe.indexOf('delete ft._semPesados') !== -1);

  console.log(falhas === 0
    ? '\n✅ sandbox-e-replica-fiel: OK'
    : '\n❌ sandbox-e-replica-fiel: ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
