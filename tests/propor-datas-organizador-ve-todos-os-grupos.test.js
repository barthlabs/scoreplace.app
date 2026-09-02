/* "PROPOR DATAS" — QUEM VÊ O BOTÃO, E POR QUÊ (leva 2.1.7)
 *
 * Pedido do dono (25/ago/2026), em duas mensagens:
 *   1. _"pedi o botão de propor agenda (dos jogos em torneio) e isso deve aparecer em cada
 *      grupo para os membros do grupo apenas (botão apenas no seu grupo) e para os
 *      organizadores (o botão de todos os grupos). isso deveria estar ao lado do botão do
 *      whats do grupo em cada grupo e não vejo."_
 *   2. _"nem no meu grupo não aparece. a ideia é o organizador poder colocar a data pelos
 *      participantes… e para os demais saberem em que dia e hora será determinado jogo de
 *      cada grupo e assistirem."_
 *
 * São TRÊS públicos com TRÊS necessidades, e este teste guarda os três:
 *   (a) o JOGADOR propõe no grupo DELE — e só nele;
 *   (b) o ORGANIZADOR (e o CO-ORGANIZADOR) define em QUALQUER grupo;
 *   (c) QUALQUER pessoa vê a DATA já definida, pra saber quando ir assistir.
 *
 * ⚠️ POR QUE ESTE TESTE EXISTE, e não só o conserto: a regra de "quem pode mexer na
 * agenda de um jogo" tinha DUAS implementações. O comentário acima de
 * `_schIsCurrentRoundMatch` mandava o contrário — _"o gate de quem vê os dois TEM que ser
 * o mesmo — fonte única aqui, nunca reimplementado lá"_ — mas quando o dono pediu o chip
 * do WhatsApp pro organizador (2.0.57/2.0.60), a exceção nasceu SÓ em wa-group.js. O
 * irmão "📅 Propor datas" ficou com o gate de jogador, e ninguém percebeu porque um
 * comentário em bracket.js AFIRMAVA que ele tinha seguido junto.
 *
 * Medido no Confra antes do conserto: dos 35 grupos, o dono joga em 1 — e esse 1 já estava
 * todo decidido. Não existia UM grupo sequer onde o botão aparecesse pra ele.
 *
 * Por isso a última asserção não olha só o resultado: ela COMPARA `_schGroupChip` com
 * `_schPodeGerirJogo` pros 4 usuários. Se as duas portas divergirem de novo, o teste acusa
 * — que é o único jeito de a lição não depender de alguém lembrar dela.
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
console.log('──── "Propor datas": jogador no grupo dele, organizador em todos ────');

// ── os 4 usuários do cenário ──────────────────────────────────────────────────
const ORG     = { uid: 'u-org',  displayName: 'Organizador' }; // organiza e NÃO joga
const COHOST  = { uid: 'u-co',   displayName: 'Co-org' };      // co-host ativo, NÃO joga
const JOGADOR = { uid: 'u-j1',   displayName: 'Jogador G1' };  // joga só o grupo 1
const ESTRANHO= { uid: 'u-x',    displayName: 'Estranho' };    // inscrito, joga nada aqui

// ── 2 grupos Rei/Rainha (4 jogadores, 3 jogos cada) ───────────────────────────
function mkGrupo(gi, uids) {
  const [a, b, c, d] = uids;
  const par = (x, y, z, w, n) => ({
    id: 'g' + gi + 'm' + n, isMonarch: true, round: 1, groupIdx: gi, phaseIndex: 0,
    team1: ['P' + x.slice(-2), 'P' + y.slice(-2)], team2: ['P' + z.slice(-2), 'P' + w.slice(-2)],
    team1Uids: [x, y], team2Uids: [z, w], p1: 'dupla A', p2: 'dupla B'
  });
  return [par(a, b, c, d, 1), par(a, c, b, d, 2), par(a, d, b, c, 3)];
}
const G1 = mkGrupo(0, ['u-j1', 'u-j2', 'u-j3', 'u-j4']);
const G2 = mkGrupo(1, ['u-k1', 'u-k2', 'u-k3', 'u-k4']);

function mkTorneio(id) {
  return {
    id: id, format: 'Liga', status: 'active',
    creatorUid: ORG.uid,
    coHosts: [{ uid: COHOST.uid, status: 'active' }],
    participants: [],
    matches: G1.concat(G2)
  };
}
let T = mkTorneio('T-AGENDA');
W.AppStore.tournaments = [T];
W._collectAllMatches = (t) => t.matches;
// rodada atual = a rodada 1 (os 6 jogos). O cache de `_currentRoundIdSet` é por t.id,
// então cada cenário que muda a rodada usa um id novo.
W._schCurrentRoundMatches = (t) => ({ round: 1, matches: t.matches, col: null });

const como = (u) => { W.AppStore.currentUser = u; };
const chip = (grupo) => W._schGroupChip(T, grupo) || '';
const temBotao = (h) => h.indexOf('Propor') !== -1;

// ── (a) o JOGADOR: só no grupo DELE ───────────────────────────────────────────
como(JOGADOR);
ok(temBotao(chip(G1)), 'jogador deveria ver "Propor datas" no grupo DELE');
ok(!temBotao(chip(G2)), 'jogador NÃO pode ver o botão no grupo dos outros');

// ── (b) ORGANIZADOR e CO-ORGANIZADOR: nos DOIS grupos ─────────────────────────
// Era exatamente isto que faltava: o organizador quase nunca joga o grupo que precisa
// organizar, então o gate "só quem joga" o deixava sem botão no torneio inteiro.
como(ORG);
ok(temBotao(chip(G1)), 'ORGANIZADOR deveria ver o botão no grupo 1');
ok(temBotao(chip(G2)), 'ORGANIZADOR deveria ver o botão no grupo 2 (o de todos)');
como(COHOST);
ok(temBotao(chip(G1)), 'CO-ORGANIZADOR tem o mesmo poder: grupo 1');
ok(temBotao(chip(G2)), 'CO-ORGANIZADOR tem o mesmo poder: grupo 2');

// ── quem não é nem jogador nem admin não mexe na agenda de ninguém ────────────
como(ESTRANHO);
ok(!temBotao(chip(G1)) && !temBotao(chip(G2)), 'estranho não propõe data em grupo nenhum');
como(null);
ok(chip(G1) === '', 'deslogado não vê botão');

// ── (c) A DATA DEFINIDA É PÚBLICA — vem ANTES de qualquer gate ────────────────
// _"para os demais saberem em que dia e hora será determinado jogo de cada grupo e
// assistirem"_. Não regredir: quem olha de fora tem que ver QUANDO o grupo joga.
const ISO = '2026-09-01T17:00:00.000Z';
G2.forEach(m => { m.scheduledAt = ISO; m.scheduledKind = 'organizer'; });
como(ESTRANHO);
const hEstranho = chip(G2);
ok(hEstranho.indexOf('📅') !== -1 && !temBotao(hEstranho),
   'estranho tem que VER a data definida do grupo 2 (pílula), sem ganhar o botão de propor');
como(null);
ok((chip(G2) || '').indexOf('📅') !== -1, 'até deslogado vê a data — é informação do torneio');
como(JOGADOR);
ok(chip(G2).indexOf('📅') !== -1, 'jogador de outro grupo também vê a data');
G2.forEach(m => { delete m.scheduledAt; delete m.scheduledKind; });

// ── (5 do pedido) grupo TODO decidido: sem botão pra NINGUÉM, nem pro organizador ──
// É regra legítima, não é o bug — não há agenda a marcar pra jogo que já aconteceu.
// (Difere do chip do WhatsApp DE PROPÓSITO: o grupo sobrevive ao jogo, a agenda não.)
G1.forEach(m => { m.winner = 'team1'; });
[JOGADOR, ORG, COHOST].forEach(u => {
  como(u);
  ok(!temBotao(chip(G1)), 'grupo encerrado não mostra "Propor datas" nem pra ' + u.displayName);
});
G1.forEach(m => { delete m.winner; });

// ── rodada futura com as duplas já definidas: OS DOIS veem ────────────────────
// ⚠️ ASSERÇÃO INVERTIDA DE PROPÓSITO em 2.1.98. Antes: _"jogador não propõe data em rodada
// que ainda não é a vez dele"_. Ordem do dono (02/set/2026): _"os botões têm que aparecer
// no jogo (todos os botões) assim que tem as duplas definidas"_ — o gate deixou de ser a
// rodada (`_schIsCurrentRoundMatch`, apagado) e passou a ser `_schJogoLiberado`. Por isso
// mexer em `_schCurrentRoundMatches` não muda mais nada aqui: é o que a última asserção
// deste bloco prova, pra ninguém "consertar" isto reintroduzindo o gate de rodada.
T = mkTorneio('T-RODADA-FUTURA');
W.AppStore.tournaments = [T];
W._schCurrentRoundMatches = () => ({ round: 9, matches: [], col: null }); // nada é "atual"
como(JOGADOR);
ok(temBotao(chip(G1)), '⭐ duplas definidas: o jogador propõe data mesmo fora da rodada atual');
como(ORG);
ok(temBotao(chip(G1)), 'ORGANIZADOR prepara a grade antes de a rodada abrir');
ok(typeof W._schJogoLiberado === 'function' && W._schIsCurrentRoundMatch === undefined,
   'o gate de rodada foi APAGADO — sobrou uma porta só, e é a das duplas definidas');
W._schCurrentRoundMatches = (t) => ({ round: 1, matches: t.matches, col: null });

// ── AS DUAS PORTAS NÃO PODEM DIVERGIR DE NOVO ─────────────────────────────────
// Esta é a asserção que existe por causa da HISTÓRIA, não do sintoma: o botão do
// WhatsApp e o de agenda já divergiram uma vez, em silêncio, por reimplementação.
// Se `_schGroupChip` voltar a decidir por conta própria, isto acusa na hora.
T = mkTorneio('T-PORTAS');
W.AppStore.tournaments = [T];
[[ORG, true], [COHOST, true], [JOGADOR, true], [ESTRANHO, false]].forEach(([u]) => {
  como(u);
  [[G1, 'grupo 1'], [G2, 'grupo 2']].forEach(([g, nome]) => {
    const porta = !!W._schPodeGerirJogo(T, g[0], u);
    ok(temBotao(chip(g)) === porta,
       'porta única divergiu de _schGroupChip para ' + u.displayName + ' no ' + nome +
       ' (porta=' + porta + ', botão=' + temBotao(chip(g)) + ')');
  });
});
// e o wa-group tem que estar DELEGANDO — não reimplementando
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wa-group.js'), 'utf8'),
  sandbox, { filename: 'wa-group.js' });
const srcWa = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wa-group.js'), 'utf8');
ok(/_podeGerirJogo[\s\S]{0,400}window\._schPodeGerirJogo/.test(srcWa),
   'wa-group._podeGerirJogo tem que DELEGAR pra window._schPodeGerirJogo (fonte única)');

// ── o organizador tem caminho pra GRAVAR, não só propor ───────────────────────
// _"a ideia é o organizador poder colocar a data pelos participantes"_ — já existe desde a
// 2.0.75 (_schOrgDefinir grava scheduledKind:'organizer'). O que faltava era CHEGAR nele:
// o overlay abre pelo chip, e o chip estava escondido. Guardado aqui pra que "definir
// direto" não seja reinventado como um segundo caminho.
ok(typeof W._schOrgDefinir === 'function', 'o organizador tem caminho de DEFINIR a data direto');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
