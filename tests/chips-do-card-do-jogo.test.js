/* OS DOIS CHIPS DO RODAPÉ DO CARD — "📅 Combinar jogo" e "💬 grupo de whats"
 *
 * POR QUE ESTE TESTE EXISTE (ago/2026): relato de REGRESSÃO na 1.7.76 — o
 * participante teria perdido os balõezinhos e o botão do grupo de WhatsApp nos
 * jogos. A investigação MEDIU e não achou regressão: `_cardFooterChips` tem UM
 * único commit na vida (v1.2.2) e o render nunca foi tocado; rodando o doc REAL
 * do Confra pelas funções REAIS, os 124 jogadores dos 31 grupos ativos viam os
 * dois chips. Ou seja: não havia o que restaurar.
 *
 * O que NÃO existia era ESTE teste. Os dois chips são irmãos com GATE COMUM
 * (jogador do confronto + rodada atual + jogo sem resultado), e o gate mora em
 * schedule-poll.js e é consumido por wa-group.js. Quem quebrar o gate derruba
 * OS DOIS DE UMA VEZ, em silêncio — todos os call sites são guardados por
 * `typeof === 'function'`, então função sumida não estoura: o botão só some.
 * É exatamente o tipo de falha que passa no gate e chega no dono.
 *
 * Trava aqui: (1) o comportamento nos dois formatos, (2) os recortes do gate que
 * DEVEM esconder, (3) a fiação — o render tem que continuar chamando os chips e
 * o wa-group tem que continuar usando o gate do schedule-poll em vez de
 * reimplementá-lo (duas cópias divergiriam e o dono veria um botão sem o outro).
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

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── chips-do-card-do-jogo ────');

// ─── cenário 1: Liga 1v1, rodada ativa, eu sou jogador ────────────────────────
function mkLiga() {
  return {
    id: 'T1', name: 'Liga', format: 'Liga', status: 'active', resultEntry: 'players',
    participants: [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u3' }, { uid: 'u4' }],
    matches: [],
    rounds: [{
      round: 1, status: 'active', matches: [
        { id: 'm1', p1: 'J1', p2: 'J2', team1Uids: ['u1'], team2Uids: ['u2'], round: 1 },
        { id: 'm2', p1: 'J3', p2: 'J4', team1Uids: ['u3'], team2Uids: ['u4'], round: 1 }
      ]
    }]
  };
}
function comUsuario(t, cu) {
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = cu;
  W._findTournamentById = () => t;
  W._currentBracketTournament = t;
}

let t = mkLiga();
let m = t.rounds[0].matches[0];
comUsuario(t, { uid: 'u1', displayName: 'J1', email: 'j1@x.com' });

ok(!!W._schCardChip(t, m), 'o chip "Combinar jogo" aparece pro jogador do confronto na rodada atual');
ok(!!W._waGrpCardChip(t, m), 'o chip do grupo de WhatsApp aparece pro jogador do confronto na rodada atual');

const cardHtml = W.renderMatchCard(m, true, t.id, 1);
ok(/Combinar/i.test(cardHtml), 'o card RENDERIZADO traz o "Combinar jogo" (fiação _cardFooterChips viva)');
// SEM link ainda, o rótulo é a AÇÃO ("Criar grupo dos seus jogos"); "de whats de
// jogo" só entra depois que o grupo existe (v1.7.24). Travo os DOIS estados.
ok(/Criar grupo/i.test(cardHtml), 'o card RENDERIZADO traz o botão de CRIAR o grupo (ainda sem link)');
ok(/_waGrpOpen\(/.test(cardHtml), 'o botão do grupo está fiado na ação real (_waGrpOpen)');

let tLink = mkLiga();
tLink.rounds[0].matches[0].waGroup = { link: 'https://chat.whatsapp.com/ABC123', byName: 'J1' };
comUsuario(tLink, { uid: 'u1', displayName: 'J1' });
const cardLink = W.renderMatchCard(tLink.rounds[0].matches[0], true, tLink.id, 1);
ok(/de whats de jogo/i.test(cardLink), 'com o grupo já criado, o card mostra "Seu grupo de whats de jogo"');
ok(/_waGrpOpenLink\(/.test(cardLink), 'com link, o clique ABRE o grupo direto (_waGrpOpenLink)');

// ─── cenário 2: os recortes do gate que DEVEM esconder ────────────────────────
// (a) não sou jogador deste confronto
const outro = t.rounds[0].matches[1];
ok(!W._schCardChip(t, outro), 'no jogo dos OUTROS o "Combinar" não aparece');
ok(!W._waGrpCardChip(t, outro), 'no jogo dos OUTROS o botão de grupo não aparece');

// (b) jogo já decidido
let tFim = mkLiga(); tFim.rounds[0].matches[0].winner = 'J1';
comUsuario(tFim, { uid: 'u1', displayName: 'J1' });
ok(!W._schCardChip(tFim, tFim.rounds[0].matches[0]), 'jogo com resultado não oferece "Combinar"');
ok(!W._waGrpCardChip(tFim, tFim.rounds[0].matches[0]), 'jogo com resultado não oferece grupo');

// (c) quem desligou WhatsApp no perfil perde SÓ o chip do grupo — o "Combinar
//     jogo" é enquete DENTRO do app e não depende do WhatsApp. Os dois gates são
//     independentes NESTE eixo; juntá-los tiraria a enquete de quem só não quer zap.
t = mkLiga(); m = t.rounds[0].matches[0];
comUsuario(t, { uid: 'u1', displayName: 'J1', notifyWhatsApp: false });
ok(!W._waGrpCardChip(t, m), 'notifyWhatsApp:false esconde o botão do grupo');
ok(!!W._schCardChip(t, m), 'notifyWhatsApp:false NÃO esconde o "Combinar jogo" (enquete é dentro do app)');

// ─── cenário 3: Rei/Rainha — o chip é ÚNICO por GRUPO, não por jogo ───────────
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '_confra-monarch-fixture.json'), 'utf8'));
const gms = FIX.matches.filter(x => x.monarchGroup === 0).map(x => JSON.parse(JSON.stringify(x)));
const players = [], puids = [];
gms.forEach(x => {
  (x.team1 || []).concat(x.team2 || []).forEach(n => { if (players.indexOf(n) < 0) players.push(n); });
  (x.team1Uids || []).concat(x.team2Uids || []).forEach(u => { if (puids.indexOf(u) < 0) puids.push(u); });
});
const tM = {
  id: 'tour_1780009816637', name: 'Confra', format: 'Liga', drawMode: 'rei_rainha',
  status: 'active', resultEntry: 'players',
  participants: JSON.parse(JSON.stringify(FIX.participants)), matches: [],
  rounds: [{
    round: 1, format: 'rei_rainha', status: 'active', matches: gms,
    monarchGroups: [{ name: 'R1 Grupo A', players: players, playersUids: puids, matches: gms }]
  }]
};
comUsuario(tM, { uid: puids[0], displayName: players[0] });
ok(!!W._schGroupChip(tM, gms), 'Rei/Rainha: o "Combinar jogos" aparece no cabeçalho do MEU grupo');
ok(!!W._waGrpGroupChip(tM, gms), 'Rei/Rainha: o botão do grupo aparece no cabeçalho do MEU grupo');
ok(!W._waGrpCardChip(tM, gms[0]), 'Rei/Rainha: o chip por JOGO é suprimido (é 1 por grupo, senão viram 3 iguais)');

// grupo inteiro concluído → o chip de grupo some
const gmsFim = gms.map(x => Object.assign({}, x, { winner: x.p1 }));
ok(!W._waGrpGroupChip(tM, gmsFim), 'Rei/Rainha: grupo concluído não oferece mais o grupo de whats');

// ─── cenário 3b: TROCOU O NOME depois do sorteio (a falha real do Confra) ─────
// `monarchGroups[i].players[]` guarda o RÓTULO DO DIA DO SORTEIO e ENVELHECE.
// Quem troca o displayName parava de casar no próprio grupo → sumia o selo
// "SEU GRUPO" e OS DOIS chips juntos. MEDIDO em produção (ago/2026): 5 dos 124
// jogadores nesse estado — Fabi2401@→Dani Bataglia, Marina Turri→Marina Cegal,
// RODRIGO UNGER PIRES DA SILVA→Rodrigo Unger, Mariana C→Mariana Ciocci,
// Adriana→Adriana Rosa. `playersUids` sempre esteve ali: identidade é o UID.
function renderComUsuario(tt, cu) {
  comUsuario(tt, cu);
  const c = {
    innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, scrollTo() {}, focus() {}
  };
  W.renderBracket(c, tt.id, false);
  return c.innerHTML || '';
}
// o participante do doc real NÃO tem nome (o save stripa) — só uid: é isso que
// impede o _sideBelongsToUser de resolver e joga tudo na comparação de string.
const htmlNomeVelho = renderComUsuario(tM, { uid: puids[0], displayName: players[0] });
ok(/SEU GRUPO/i.test(htmlNomeVelho), 'controle: com o nome do sorteio, o grupo é reconhecido');

const htmlRenomeado = renderComUsuario(tM, { uid: puids[0], displayName: 'Nome Trocado Depois' });
ok(/SEU GRUPO/i.test(htmlRenomeado),
  'quem TROCOU o displayName continua sendo reconhecido no próprio grupo (casa por uid, não por rótulo)');
ok(/Combinar<br>jogos/i.test(htmlRenomeado),
  'quem trocou o nome NÃO perde o "Combinar jogos"');
ok(/Criar grupo|de whats de jogo/i.test(htmlRenomeado),
  'quem trocou o nome NÃO perde o botão do grupo de whats');

// e o inverso continua valendo: quem não é do grupo segue de fora
const htmlEstranho = renderComUsuario(tM, { uid: 'uid-que-nao-joga', displayName: 'Estranho' });
ok(!/SEU GRUPO/i.test(htmlEstranho), 'quem não é do grupo continua sem "SEU GRUPO" (o uid não abre porta a estranho)');

// ─── cenário 4: FIAÇÃO — o que não pode sumir do código ───────────────────────
const braket = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
ok(/_cardFooterChips\s*\(\s*t\s*,\s*m\s*\)/.test(braket),
  'renderMatchCard continua chamando _cardFooterChips (o rodapé dos dois chips)');
ok(/_schCardChip/.test(braket) && /_waGrpCardChip/.test(braket),
  'o rodapé do card continua montando OS DOIS chips (nunca só um)');
ok(/_schGroupChip/.test(braket) && /_waGrpGroupChip/.test(braket),
  'o cabeçalho de grupo continua montando OS DOIS chips');

const wa = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wa-group.js'), 'utf8');
ok(/window\._schIsCurrentRoundMatch\s*\(/.test(wa),
  'wa-group usa o gate de rodada do schedule-poll — FONTE ÚNICA, não reimplementa');
ok(/window\._schUserIsPlayer\s*\(/.test(wa),
  'wa-group usa o "sou jogador?" do schedule-poll — mesma régua do irmão');

const sch = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8');
ok(/window\._schIsCurrentRoundMatch\s*=/.test(sch) && /window\._schUserIsPlayer\s*=/.test(sch),
  'schedule-poll continua EXPONDO o gate (sem isso o wa-group cai calado e os dois botões somem juntos)');

// os dois scripts precisam continuar carregados na página — script fora do
// index.html = função indefinida = chip some SEM erro (o call site é guardado).
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
ok(/js\/views\/schedule-poll\.js/.test(idx), 'schedule-poll.js continua no index.html');
ok(/js\/views\/wa-group\.js/.test(idx), 'wa-group.js continua no index.html');

console.log(`  ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
