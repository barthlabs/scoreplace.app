/* O grupo de WhatsApp é DO GRUPO — nunca do torneio inteiro.
 *
 * FALHA REAL QUE ESTE TESTE REPRODUZ (Confra BT Alta da Clínica 2026, 03/ago/2026):
 * a Raquel Unger (grupo 26) salvou o link do grupo dela e o app espelhou esse MESMO
 * link nos 81 jogos dos 27 grupos. A Catia Cavedon (grupo 13) clicava em "Abrir
 * grupo" e caía no grupo da Raquel. Medido no doc de produção antes do fix:
 * 81 jogos com waGroup.link, 1 link distinto, byName "Raquel Unger".
 *
 * CAUSA (duas camadas, as duas travadas aqui):
 *  1. `_schMatchUids` resolvia identidade por NOME (procurava em t.participants quem
 *     se chamasse assim). O save passa por `_stripUidEntryNames`, que REMOVE o nome
 *     de toda entrada com uid — em torneio real nenhum nome resolve. Medido: 111
 *     inscritos, 111 com uid, ZERO com nome. A função devolvia [] pra todo jogo.
 *  2. `_schGroupMatches` agrupava os irmãos por uma CHAVE DERIVADA desses uids. Com
 *     todos vazios, os 27 grupos tinham a mesma chave ('') → um grupo só → o espelho
 *     do link escreveu no torneio inteiro.
 *
 * O fixture é o dado REAL de produção (3 dos 27 grupos: g0, g13 da Catia, g26 da
 * Raquel), com o shape exato do doc: participante SÓ com uid, jogo com team1Uids/
 * team2Uids e monarchGroup.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'),
  sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wa-group.js'), 'utf8'),
  sandbox, { filename: 'wa-group.js' });
const W = sandbox;

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '_confra-monarch-fixture.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── wa-group-por-grupo ────');

function mkT() {
  return {
    id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026',
    format: 'Liga', drawMode: 'rei_rainha', status: 'active',
    participants: JSON.parse(JSON.stringify(FIX.participants)),
    matches: [],
    rounds: [{ round: 1, format: 'rei_rainha', status: 'active', matches: JSON.parse(JSON.stringify(FIX.matches)) }]
  };
}
const byGroup = (t, gi) => t.rounds[0].matches.filter(m => m.monarchGroup === gi);
const linked = (t) => t.rounds[0].matches.filter(m => m.waGroup && m.waGroup.link);

let t = mkT();
W.AppStore.tournaments = [t];
W._findTournamentById = () => t;
W.showNotification = () => {};
W._softRefreshView = () => {};
W._rerenderBracket = () => {};
W._sendUserNotification = () => {};
W._collectAllMatches = (tt) => (tt.rounds || []).reduce((a, r) => a.concat(r.matches || []), []);

// ─── o dado de produção é o que se pensa que é ────────────────────────────────
ok(t.rounds[0].matches.length === 9, 'fixture: 9 jogos (3 grupos × 3)');
ok(t.participants.every(p => !p.displayName && !p.name), 'fixture: NENHUM inscrito tem nome (strip do save) — a armadilha');
ok(t.participants.every(p => !!p.uid), 'fixture: todos têm uid — a identidade existe, só não era lida');

// ─── (1) identidade sai do SLOT, não do nome ──────────────────────────────────
const mCatia = byGroup(t, 13)[0];
const uidsCatia = W._schMatchUids(t, mCatia);
ok(uidsCatia.length === 4, 'uids do jogo saem do slot: 4 pessoas (antes do fix: 0)');
const slotU = W._slotUids(mCatia, 'p1').concat(W._slotUids(mCatia, 'p2'));
ok(slotU.every(u => uidsCatia.indexOf(u) !== -1), 'são exatamente os uids gravados em team1Uids/team2Uids');

// A REPRODUÇÃO da causa antiga: resolver por nome devolve vazio neste doc.
const porNome = (m) => {
  const out = {};
  (m.team1 || []).concat(m.team2 || []).forEach(nm => {
    const pp = t.participants.find(p => (p.displayName || p.name || '') === nm);
    if (pp && pp.uid) out[pp.uid] = 1;
  });
  return Object.keys(out);
};
ok(porNome(mCatia).length === 0, 'a leitura ANTIGA (por nome) devolve [] — era daí que vinha a chave vazia');

// ─── (2) irmãos de grupo = só os 3 jogos daquele grupo ────────────────────────
const sibs = W._schGroupMatches(t, mCatia);
ok(sibs.length === 3, 'grupo da Catia tem 3 jogos irmãos (antes do fix: 9 — o torneio inteiro)');
ok(sibs.every(m => m.monarchGroup === 13), 'todos os irmãos são do grupo 13');
ok(W._schGroupMatches(t, byGroup(t, 26)[0]).every(m => m.monarchGroup === 26), 'grupo da Raquel só enxerga o próprio');

// ─── (3) o BUG DO PRINT: salvar o link da Raquel não toca o grupo da Catia ────
const mRaquel = byGroup(t, 26)[0];
const LINK_R = 'https://chat.whatsapp.com/GoqnMxuZWSr7xPRBUi6IS0';
W.AppStore.currentUser = { uid: W._slotUids(mRaquel, 'p1')[0], displayName: 'Raquel Unger', notifyWhatsApp: true };
W.document.getElementById = (id) => (id === 'wa-grp-link' ? { value: LINK_R } : null);
let saved = null;
W.FirestoreDB = { saveTournament: (tt) => { saved = tt; return Promise.resolve(); } };

W._waGrpSaveLink(t.id, mRaquel.id, 1, null);

ok(linked(t).length === 3, 'o link ficou em 3 jogos — não nos 9 (o bug do print gravava em todos)');
ok(linked(t).every(m => m.monarchGroup === 26), 'os 3 são do grupo da Raquel');
ok(byGroup(t, 13).every(m => !m.waGroup), 'grupo da CATIA continua SEM link — ela vê "Criar grupo", não o grupo da Raquel');
ok(byGroup(t, 0).every(m => !m.waGroup), 'grupo 0 também intocado');

// E o chip da Catia não pode abrir o link de ninguém.
W.AppStore.currentUser = { uid: W._slotUids(mCatia, 'p2')[0], displayName: 'Catia Cavedon', notifyWhatsApp: true };
let aberto = null;
W._openExternalUrl = (u) => { aberto = u; };
W._waGrpOpenLink(t.id, mCatia.id);
ok(aberto === null, 'clicar no grupo da Catia NÃO abre o WhatsApp da Raquel');

// ─── (4) trava de sanidade: sem âncora e sem uid, nunca agrupa ────────────────
const t2 = mkT();
W._findTournamentById = () => t2;
t2.rounds[0].matches.forEach(m => { delete m.monarchGroup; delete m.groupIdx; delete m.team1Uids; delete m.team2Uids; });
const cego = W._schGroupMatches(t2, t2.rounds[0].matches[0]);
ok(cego.length === 1, 'sem índice de grupo E sem uid, o "grupo" é só o próprio jogo (chave vazia nunca agrupa)');

// Âncora presente mas dado corrompido (todos no mesmo índice): a trava de 3 segura.
const t3 = mkT();
W._findTournamentById = () => t3;
t3.rounds[0].matches.forEach(m => { m.monarchGroup = 0; });
const _err = console.error; console.error = () => {};
const demais = W._schGroupMatches(t3, t3.rounds[0].matches[0]);
console.error = _err;
ok(demais.length === 1, 'agrupamento com mais de 3 jogos é recusado — grupo Rei/Rainha é sempre 4 pessoas/3 jogos');

// ─── (5) de graça: o consenso da enquete volta a poder fechar ─────────────────
W._findTournamentById = () => t;
ok(W._schMatchUids(t, mCatia).length >= 2, 'a enquete de horário tem uids pra fechar consenso (antes: 0 → nunca agendava)');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
