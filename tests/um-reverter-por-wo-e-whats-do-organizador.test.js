/* UM "REVERTER" POR W.O. · E O WHATSAPP DO GRUPO NA MÃO DO ORGANIZADOR
 * node tests/um-reverter-por-wo-e-whats-do-organizador.test.js
 *
 * DUAS ORDENS DO DONO (24/ago/2026, print do R1 Grupo A da Confra na mão):
 *   1. _"ainda falta os botões do whatsapp dos grupos de jogos para os organizadores
 *      poderem criar os grupos e entrar nos grupos"_
 *   2. _"e o reverter wo deveria ser 1 para cada wo dado."_
 *
 * O QUE O PRINT MOSTRAVA: o Grupo A tinha TRÊS pílulas de W.O. (a 2.0.53 já as listava
 * todas) e UM ÚNICO botão "Reverter W.O." — que sempre desfazia o W.O. do ESTADO do
 * grupo (`woAbsent`/`subName`, slot único). Os outros dois não tinham como ser desfeitos,
 * e o botão solto no fim da linha nem dizia de quem era.
 *
 * E MOSTRAVA UM TERCEIRO DEFEITO, que ninguém pediu mas estava na tela: "Carol Moresco
 * W.O. → Karla Lia" aparecia DUAS VEZES. A lista casava o ausente por uid quando o
 * marcador de W.O. da rodada existia e por NOME quando não — e o marcador da Carol tinha
 * saído (2.0.57: quem reativa pra fila com a vaga preenchida perde o marcador). Duas
 * chaves para a mesma pessoa = pílula duplicada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
const ROOT = path.join(__dirname, '..');

vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'schedule-poll.js'), 'utf8'), sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'wa-group.js'), 'utf8'), sandbox, { filename: 'wa-group.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8'), sandbox, { filename: 'liga-substitution.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const sec = (nome, fn) => { try { fn(); } catch (e) { fail++; console.error('  ✗ [' + nome + '] estourou:', e && e.stack); } };

console.log('──── um reverter por W.O. · whatsapp do grupo pro organizador ────');

// ── o Grupo A do print: 2 W.O.s em slots DIFERENTES, os dois com substituta ──────
// Claudia → Bruna (rastro, via woSubstituteFor) · Carol → Karla (estado do grupo).
function torneio() {
  const t = {
    id: 'T', name: 'Confra', format: 'Liga', drawMode: 'rei_rainha', status: 'active',
    organizerEmail: 'org@x.com', organizerUid: 'u_org',
    participants: [
      { uid: 'u_fer', displayName: 'Fernanda Biojone' },
      { uid: 'u_edu', displayName: 'Eduardo Mange' },
      { uid: 'u_karla', displayName: 'Karla Lia', woSubstituteFor: 'Carol Moresco', woSubstituteAt: '2026-08-24T13:00:00Z' },
      { uid: 'u_bruna', displayName: 'Bruna Verga Sá', woSubstituteFor: 'Claudia Kohl Pessoal', woSubstituteAt: '2026-08-24T12:00:00Z' },
      { uid: 'u_carol', displayName: 'Carol Moresco' },
      { uid: 'u_claudia', displayName: 'Claudia Kohl Pessoal' },
    ],
    matches: [], groups: [],
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [], matches: [] }],
  };
  const g = {
    gi: 0, name: 'R1 Grupo A',
    players: ['Fernanda Biojone', 'Eduardo Mange', 'Karla Lia', 'Bruna Verga Sá'],
    playersUids: ['u_fer', 'u_edu', 'u_karla', 'u_bruna'],
    woAbsent: 'Carol Moresco', woAbsentUid: 'u_carol', subStatus: 'filled', subName: 'Karla Lia', subUid: 'u_karla',
    matches: [
      { id: 'm1', isMonarch: true, round: 1, groupName: 'R1 Grupo A', monarchGroup: 0,
        team1: ['Fernanda Biojone', 'Eduardo Mange'], team1Uids: ['u_fer', 'u_edu'],
        team2: ['Karla Lia', 'Bruna Verga Sá'], team2Uids: ['u_karla', 'u_bruna'],
        p1: 'Fernanda Biojone / Eduardo Mange', p2: 'Karla Lia / Bruna Verga Sá' },
    ],
  };
  t.rounds[0].monarchGroups = [g];
  t.rounds[0].matches = g.matches.concat([
    // marcador de W.O. só da Claudia — o da Carol saiu quando ela foi pra fila (2.0.57)
    { id: 'wo-claudia', round: 1, roundIndex: 0, p1: 'Claudia Kohl Pessoal', p2: 'W.O.',
      isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0, p1Uid: 'u_claudia', team1Uids: ['u_claudia'] },
  ]);
  return { t, g };
}
function comoOrganizador(t) {
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'u_org', email: 'org@x.com', displayName: 'Organizador', notifyWhatsApp: true };
  W._findTournamentById = () => t;
  W._isUserOrgOrCoHost = (tt, cu) => !!(cu && cu.uid === 'u_org');
  W._canManagePresence = (tt, cu) => !!(cu && cu.uid === 'u_org');
  W.showNotification = () => {};
  W.showConfirmDialog = (a, b, onOk) => { onOk(); };   // confirma direto
  W._rerenderBracket = () => {};
  W._softRefreshView = () => {};
  W._collectAllMatches = (tt) => (tt.rounds || []).reduce((a, r) => a.concat(r.matches || []), []);
}

// ── 1. A LISTA: dois W.O.s, sem duplicata ────────────────────────────────────────
sec('lista sem duplicata', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  const lista = W._ligaGroupWoList(t, g);
  const nomes = lista.map((x) => x.absentName);
  ok(lista.length === 2, 'dois W.O.s no grupo — veio ' + lista.length + ': ' + nomes.join(' · '));
  ok(nomes.filter((n) => n === 'Carol Moresco').length === 1,
     'a Carol aparece UMA vez (sem marcador, o uid vem do elenco — era a pílula duplicada do print)');
  const carol = lista.filter((x) => x.absentName === 'Carol Moresco')[0];
  ok(carol && carol.absentUid === 'u_carol', 'e ela carrega o uid mesmo sem marcador de W.O.');
  ok(carol && carol.subName === 'Karla Lia', 'com a substituta certa');
  const cla = lista.filter((x) => x.absentName === 'Claudia Kohl Pessoal')[0];
  ok(cla && cla.subName === 'Bruna Verga Sá', 'e o W.O. do rastro (Claudia → Bruna) também está lá');
});

// ── 2. O RENDER: um botão Reverter POR W.O., cada um com o seu alvo ──────────────
sec('um reverter por W.O.', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  const html = W._ligaGroupControlsHtml(t, 0, g);
  const reverts = (html.match(/window\._ligaRevertWo\(/g) || []).length;
  ok(reverts === 2, 'dois botões Reverter — um por W.O. (veio ' + reverts + ')');
  ok(/_ligaRevertWo\('T',0,'R1 Grupo A','u_carol','Carol Moresco'\)/.test(html),
     'o da Carol carrega o alvo dela (uid + nome)');
  ok(/_ligaRevertWo\('T',0,'R1 Grupo A','u_claudia','Claudia Kohl Pessoal'\)/.test(html),
     'o da Claudia carrega o alvo dela');
  ok(html.indexOf('Desfazer o W.O. de Carol Moresco') !== -1, 'e o title diz de quem é o botão');
  ok((html.match(/🔁/g) || []).length === 2, 'as duas pílulas continuam na tela');
});

// ── 3. REVERTER O DO RASTRO não mexe no W.O. do estado ──────────────────────────
sec('reverter o do rastro', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'u_claudia', 'Claudia Kohl Pessoal');
  const g2 = t.rounds[0].monarchGroups[0];
  ok(g2.players.indexOf('Claudia Kohl Pessoal') !== -1, 'a Claudia voltou pro grupo');
  ok(g2.players.indexOf('Bruna Verga Sá') === -1, 'e a Bruna saiu');
  ok((g2.playersUids || []).indexOf('u_claudia') !== -1, 'o slot aponta pro uid dela (identidade, não rótulo)');
  ok(!(t.rounds[0].matches || []).some((m) => m.isSitOut && m.sitOutReason === 'wo' && m.p1Uid === 'u_claudia'),
     'o marcador de W.O. dela saiu');
  ok((t.rounds[0].matches || []).some((m) => m.isSitOut && m.sitOutReason === 'remainder' && m.p1 === 'Bruna Verga Sá'),
     'e a Bruna voltou a ser folga da rodada');
  ok(g2.woAbsent === 'Carol Moresco' && g2.subStatus === 'filled' && g2.subName === 'Karla Lia',
     'o W.O. do ESTADO (Carol → Karla) segue intacto — reverter um não desfaz o outro');
  const bruna = t.participants.filter((p) => p.uid === 'u_bruna')[0];
  ok(!bruna.woSubstituteFor, 'o rastro daquele elo sumiu (senão a lista o mostraria de novo)');
  ok(W._ligaGroupWoList(t, g2).length === 1, 'e a lista passa a ter um W.O. só');
});

// ── 4. REVERTER O DO ESTADO segue funcionando como sempre ───────────────────────
sec('reverter o do estado', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'u_carol', 'Carol Moresco');
  const g2 = t.rounds[0].monarchGroups[0];
  ok(!g2.woAbsent && !g2.subStatus && !g2.subName, 'o estado do grupo foi limpo');
  ok(g2.players.indexOf('Carol Moresco') !== -1, 'a Carol voltou');
  ok(g2.players.indexOf('Karla Lia') === -1, 'a Karla saiu');
  ok(W._ligaGroupWoList(t, g2).some((x) => x.absentName === 'Claudia Kohl Pessoal'),
     'e o W.O. da Claudia continua listado (não foi arrastado junto)');
});

// ── 5. CADEIA: elo antigo não pula a fila — nasce desabilitado dizendo a ordem ───
sec('cadeia respeita a ordem', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  // Denise → Carol → Karla: a Karla entrou no lugar da Carol, que entrara no da Denise.
  t.participants.push({ uid: 'u_denise', displayName: 'Denise Mamesso' });
  t.participants.filter((p) => p.uid === 'u_carol')[0].woSubstituteFor = 'Denise Mamesso';
  t.participants.filter((p) => p.uid === 'u_carol')[0].woSubstituteAt = '2026-08-24T11:00:00Z';
  const lista = W._ligaGroupWoList(t, g);
  const elo = lista.filter((x) => x.absentName === 'Denise Mamesso')[0];
  ok(!!elo, 'o elo mais antigo (Denise → Carol) aparece na lista');
  const bloq = W._ligaRevertWoBloqueadoPor(t, g, elo);
  ok(bloq === 'Carol Moresco', 'e ele está bloqueado pela Carol (o lugar dela está com a Karla) — veio: ' + bloq);
  const html = W._ligaGroupControlsHtml(t, 0, g);
  ok(html.indexOf('disabled') !== -1, 'o botão dele nasce desabilitado, não falhando calado');
  ok(html.indexOf('Reverta antes o W.O. de Carol Moresco') !== -1, 'e o title diz o que reverter primeiro');
  // e clicar mesmo assim não estraga nada
  const antes = JSON.stringify(t.rounds[0].monarchGroups[0].players);
  W._ligaRevertWo('T', 0, 'R1 Grupo A', 'u_denise', 'Denise Mamesso');
  ok(JSON.stringify(t.rounds[0].monarchGroups[0].players) === antes, 'clicar fora de ordem não muda o grupo');
});

// ── 5b. O CASO REAL: a Carol está na LISTA DE ESPERA e o elo dela tem que aparecer ──
// Ordem do dono (24/ago/2026, sobre o mesmo Grupo A): _"carol entrou substituindo outro
// wo anterior e isso deveria estar registrado o histórico aqui com o nome de quem ela
// substituiu, constando o 7o nesse caso"_ — a 7ª linha da classificação é justamente
// quem a Carol substituiu. O rastro mora na ENTRADA dela, e ela saiu de `participants`
// quando reativou pra fila: lendo só o elenco, a cadeia morria e o elo sumia da tela.
sec('cadeia atravessa a lista de espera', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  // a Carol levou W.O., reativou e foi pra ESPERA — levando o rastro dela junto
  t.participants = t.participants.filter((p) => p.uid !== 'u_carol');
  t.standbyParticipants = [{
    uid: 'u_carol', displayName: 'Carol Moresco', ligaActive: true,
    woSentToWaitlistAt: '2026-08-24T14:00:00Z',
    woSubstituteFor: 'Denise Mamesso', woSubstituteAt: '2026-08-24T11:00:00Z',
  }];
  t.participants.push({ uid: 'u_denise', displayName: 'Denise Mamesso' });
  const lista = W._ligaGroupWoList(t, g);
  const nomes = lista.map((x) => x.absentName);
  ok(nomes.indexOf('Denise Mamesso') !== -1,
     'o elo anterior aparece mesmo com a Carol na espera — ficou: ' + nomes.join(' · '));
  const elo = lista.filter((x) => x.absentName === 'Denise Mamesso')[0];
  ok(elo && elo.subName === 'Carol Moresco', 'e o histórico diz QUEM ela substituiu (Denise → Carol)');
  ok(nomes.filter((n) => n === 'Carol Moresco').length === 1, 'a Carol segue sem duplicar');
  ok(nomes.indexOf('Denise Mamesso') < nomes.indexOf('Carol Moresco'),
     'do mais antigo pro mais novo: a Denise vem antes');
  // é essa lista que o bracket.js empurra pra classificação — com 3 W.O.s, 3 linhas extras
  ok(lista.length === 3, 'três W.O.s no histórico do grupo (Denise · Claudia · Carol) — veio ' + lista.length);
  const html = W._ligaGroupControlsHtml(t, 0, g);
  ok(html.indexOf('Denise Mamesso W.O.') !== -1, 'e a pílula dele está na tela');
});

// ── 6. WHATSAPP DO GRUPO: o ORGANIZADOR vê o botão mesmo sem jogar ──────────────
sec('whatsapp pro organizador', function () {
  const { t, g } = torneio();
  comoOrganizador(t);   // u_org NÃO está em nenhum slot do grupo
  const chip = W._waGrpGroupChip(t, g.matches);
  ok(!!chip, 'o organizador vê o chip do grupo de jogos (antes: vazio — só jogador via)');
  ok(chip.indexOf('Criar grupo') !== -1, 'e é o botão de CRIAR (ainda não há link)');
  ok(chip.indexOf('seus jogos') === -1, 'sem o possessivo "seus jogos" — ele não joga este grupo');
  // com link, ele ENTRA no grupo
  g.matches[0].waGroup = { link: 'https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAAAAAA' };
  const chip2 = W._waGrpGroupChip(t, g.matches);
  ok(chip2.indexOf('_waGrpOpenLink') !== -1, 'com link, o botão dele abre o grupo');
});

// ── 7. …e quem NÃO é organizador nem joga continua sem ver nada ─────────────────
sec('estranho não vê', function () {
  const { t, g } = torneio();
  comoOrganizador(t);
  W.AppStore.currentUser = { uid: 'u_estranho', displayName: 'Estranho', notifyWhatsApp: true };
  ok(W._waGrpGroupChip(t, g.matches) === '', 'quem não joga o grupo nem organiza não vê o chip');
  // e o jogador do grupo segue vendo o SEU
  W.AppStore.currentUser = { uid: 'u_fer', displayName: 'Fernanda Biojone', notifyWhatsApp: true };
  const chipJog = W._waGrpGroupChip(t, g.matches);
  ok(chipJog.indexOf('seus jogos') !== -1, 'e pro jogador o rótulo segue possessivo ("dos seus jogos")');
  // o toggle do perfil continua mandando, inclusive no organizador
  W.AppStore.currentUser = { uid: 'u_org', displayName: 'Organizador', notifyWhatsApp: false };
  ok(W._waGrpGroupChip(t, g.matches) === '', 'organizador com WhatsApp desligado no perfil não vê chip nenhum');
});

console.log('  ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
