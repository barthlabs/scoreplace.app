/* W.O. DO ORGANIZADOR — ESCOLHA 1×2 DO DESTINO + NOTIFICAÇÃO NO FIM DO CICLO
 * node tests/wo-destino-ciclo-notifica.test.js
 *
 * REGRA DO DONO (ago/2026): (1) o organizador escolhe entre mandar quem levou W.O. pros
 * DESATIVADOS ou pro FIM da lista de espera; o primeiro da fila assume e ocupa a posição
 * até o final do torneio; quem foi pros desativados entra na ÚLTIMA posição da fila ao
 * reativar. (2) _"no que esse ciclo completar precisa disparar notificação para todos os
 * envolvidos dizendo o que aconteceu e instruindo a pessoa que tomou o wo do que precisa
 * fazer para voltar a lista de espera."_
 *
 * ONDE ISSO TEM QUE ESTAR: no diálogo "Substituto" (_ligaPickFill) — o caminho REAL do
 * botão é wo-claim.js → _woResolveApply → _ligaPickFill. A v1.6.88 construiu a escolha em
 * _ligaAbsentFlow, que nada chama nesse fluxo; foi o erro que fez o dono ver o diálogo
 * antigo. Este teste dispara pelo caminho real e falha se alguém mover de novo.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const LIGA_SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');
const PERFIL = { uid_sandra: 'Sandra', uid_paulo: 'Paulo Oriente', uid_thereza: 'Thereza', uid_fabiana: 'FABIANA VIEIRA', uid_flavia: 'Flávia Barchetta', uid_suely: 'Suely' };
const N2U = {}; Object.keys(PERFIL).forEach((u) => { N2U[PERFIL[u]] = u; });

function novoT() {
  const jogos = [{ id: 'g22-0', team1: ['Thereza', 'FABIANA VIEIRA'], team1Uids: ['uid_thereza', 'uid_fabiana'], team2: ['Flávia Barchetta', 'Suely'], team2Uids: ['uid_flavia', 'uid_suely'], p1: 'Thereza / FABIANA VIEIRA', p2: 'Flávia Barchetta / Suely', round: 1, roundIndex: 0, isMonarch: true, monarchGroup: 22, winner: null }];
  const g = { name: 'R1 Grupo W', players: ['Thereza', 'FABIANA VIEIRA', 'Flávia Barchetta', 'Suely'], playersUids: ['uid_thereza', 'uid_fabiana', 'uid_flavia', 'uid_suely'], matches: jogos };
  return {
    id: 'confra', name: 'Confra', format: 'Liga', ligaRoundFormat: 'rei_rainha', creatorUid: 'org', combinedCategories: [],
    participants: [
      { uid: 'uid_thereza', ligaActive: true }, { uid: 'uid_fabiana', ligaActive: true },
      { uid: 'uid_flavia', ligaActive: true }, { uid: 'uid_suely', ligaActive: true },
    ],
    standbyParticipants: [{ uid: 'uid_sandra', ligaActive: true }, { uid: 'uid_paulo', ligaActive: true }],
    waitlist: [], monarchWaitlist: { _default_: [] }, ligaSubInvites: [],
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [g], matches: jogos.slice() }], matches: [], groups: [],
  };
}

let CAP = null, NOTIFS = [], DOM = {};
function boot(t, quemSou) {
  CAP = null; NOTIFS = []; DOM = {};
  win.AppStore = { tournaments: [t], currentUser: { uid: quemSou || 'org' }, mutate: (i, f) => { f(t); return Promise.resolve(true); }, isOrganizer: () => true };
  win._findTournamentById = () => t;
  win._canManagePresence = () => true;
  win.showAlertDialog = (title, html) => { CAP = { title, html }; DOM = parseDom(html); };
  win.showConfirmDialog = (a, b, onOk) => { onOk && onOk(); };
  win.showInputDialog = (a, b, onOk) => { onOk && onOk('Jogador X'); };
  win.showNotification = () => {};
  win._safeHtml = (s) => String(s == null ? '' : s);
  win._pName = (e, fb) => { if (!e) return fb || ''; if (typeof e === 'string') return e; return PERFIL[e.uid] || e.displayName || e.name || fb || ''; };
  win._displayNameForUid = (u, fb) => PERFIL[u] || fb || '';
  win._buildNameToUid = () => N2U;
  win._participantInCategory = () => true;
  win._displayCategoryName = (c) => c;
  win._softRefreshView = () => {};
  win._sendUserNotification = (uid, data) => { NOTIFS.push({ uid, data }); };
  // DOM mínimo: o diálogo é lido por querySelector/querySelectorAll
  globalThis.document = {
    getElementById: (id) => DOM.byId[id] || null,
    querySelector: (sel) => (DOM.query(sel) || [])[0] || null,
    querySelectorAll: (sel) => DOM.query(sel) || [],
  };
  win.document = globalThis.document;
  new Function('window', 'document', LIGA_SRC)(win, globalThis.document);
}
// parser bem simples: só o que o código consulta (candidatos e destino)
function parseDom(html) {
  const cands = [];
  html.replace(/<button[^>]*data-cand="1"[^>]*>/g, (tag) => {
    const at = (n) => (tag.match(new RegExp(n + '="([^"]*)"')) || [])[1] || '';
    cands.push({ _on: at('data-on'), getAttribute: (k) => at(k), setAttribute: () => {}, style: {}, innerHTML: '' });
    return tag;
  });
  const dests = [];
  html.replace(/<button[^>]*data-dest="([^"]*)"[^>]*data-on="([^"]*)"[^>]*>/g, (tag, d, on) => {
    dests.push({ d, on, getAttribute: (k) => (k === 'data-dest' ? d : (k === 'data-on' ? on : '')), setAttribute: () => {}, style: {} });
    return tag;
  });
  return {
    byId: { 'liga-wo-dest': { querySelectorAll: () => dests } },
    query: (sel) => {
      if (sel.indexOf('liga-fill-cands') !== -1) return cands.filter((c) => c._on === '1');
      if (sel.indexOf('liga-wo-dest') !== -1) return dests.filter((x) => x.on === '1');
      return [];
    },
    _dests: dests,
  };
}
const nomes = (arr) => (arr || []).map((p) => (typeof p === 'string' ? p : (PERFIL[p.uid] || p.displayName || p.name)));

// ── 1. A escolha 1×2 está NO DIÁLOGO REAL ───────────────────────────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  ok(!!CAP, 'o diálogo Substituto tem que abrir');
  ok(CAP.html.indexOf('pra onde vai?') !== -1, 'a pergunta de destino tem que estar no diálogo do caminho REAL');
  ok(CAP.html.indexOf('1 · 🔴 Desativados') !== -1, 'opção 1 — Desativados');
  ok(CAP.html.indexOf('2 · 📋 Fim da lista de espera') !== -1, 'opção 2 — Fim da lista de espera');
  ok(CAP.html.indexOf('data-dest="waitlist" data-on="1"') !== -1, 'default é a FILA (menos punitivo); tirar alguém do torneio é escolha explícita');
  ok(CAP.html.indexOf('Sandra') !== -1 && CAP.html.indexOf('Jogador X') !== -1, 'e a fila + Jogador X continuam ali');
});

// ── 2. Destino 2 (fila) + convite: o ausente vai pro FIM da fila ────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo W', 'Thereza');   // default = waitlist
  ok(!nomes(t.participants).includes('Thereza'), 'com destino "fila", sai do elenco');
  const fila = nomes(win._getWaitlist(t));
  ok(fila[fila.length - 1] === 'Thereza', 'entra no FIM da fila, fila=' + fila.join('|'));
  ok(t.rounds[0].monarchGroups[0].woDest === 'waitlist', 'o destino escolhido fica gravado no grupo');
  ok((t.ligaSubInvites || []).length >= 1, 'os convites foram disparados');
});

// ── 3. Destino 1 (desativados) ──────────────────────────────────────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  DOM._dests.forEach((d) => { d.on = (d.d === 'inactive') ? '1' : '0'; });   // organizador clica na 1
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo W', 'Thereza');
  const th = t.participants.filter((p) => p.uid === 'uid_thereza')[0];
  ok(!!th && th.ligaActive === false, 'com destino "desativados", FICA no elenco e vira inativa');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'e NÃO entra na fila agora (só ao reativar)');
  ok(t.rounds[0].monarchGroups[0].woDest === 'inactive', 'o destino escolhido fica gravado no grupo');
});

// ── 4. O SUPLENTE assume e FICA (entra no elenco) ao aceitar ────────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo W', 'Thereza');
  const iv = t.ligaSubInvites.filter((x) => x.inviteeUid === 'uid_sandra')[0];
  ok(!!iv, 'a Sandra devia ter recebido convite');
  boot(t, 'uid_sandra');                       // agora quem age é ela
  win._ligaAcceptSub(t.id, iv.id);
  const g = t.rounds[0].monarchGroups[0];
  ok(g.players.includes('Sandra'), 'entra no grupo');
  ok(!g.players.includes('Thereza'), 'e a ausente sai do grupo');
  ok(g.playersUids[g.players.indexOf('Sandra')] === 'uid_sandra', 'o uid do slot é o dela (não pode ficar null)');
  ok(nomes(t.participants).includes('Sandra'), 'ENTRA NO ELENCO — é o que a faz jogar até o fim do torneio');
  ok(!nomes(win._getWaitlist(t)).includes('Sandra'), 'e sai da fila');
  const ativos = t.participants.filter((p) => p.ligaActive !== false);
  ok(nomes(ativos).includes('Sandra'), 'entra ATIVA no sorteio da próxima rodada');
});

// ── 5. FIM DO CICLO pelo ACEITE: todo mundo é avisado ───────────────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo W', 'Thereza');
  const iv = t.ligaSubInvites.filter((x) => x.inviteeUid === 'uid_sandra')[0];
  boot(t, 'uid_sandra'); NOTIFS = [];
  win._ligaAcceptSub(t.id, iv.id);

  const paraAusente = NOTIFS.filter((n) => n.uid === 'uid_thereza');
  ok(paraAusente.length >= 1, 'quem levou o W.O. TEM que ser notificada');
  const msg = paraAusente.map((n) => n.data.message).join(' ');
  ok(msg.indexOf('W.O.') !== -1, 'a mensagem diz o que aconteceu');
  ok(msg.indexOf('lista de espera') !== -1, 'e fala da lista de espera');
  ok(/não precisa fazer nada|Não precisa fazer nada/.test(msg), 'no destino "fila", a instrução é que ela já está na fila');
  ok(paraAusente[0].data.level === 'fundamental', 'aviso de W.O. é nível fundamental');

  ok(NOTIFS.some((n) => n.uid === 'uid_sandra'), 'o suplente é avisado de que entrou');
  ok(NOTIFS.filter((n) => n.uid === 'uid_sandra')[0].data.message.indexOf('até o fim do torneio') !== -1,
    'e de que a vaga é dele até o fim do torneio');

  ['uid_fabiana', 'uid_flavia', 'uid_suely'].forEach((u) => {
    ok(NOTIFS.some((n) => n.uid === u), 'o resto do grupo tem que saber com quem vai jogar (' + u + ')');
  });
  // O Paulo foi CONVIDADO junto (multi-convite) e recebe o aviso legítimo de que a vaga
  // já foi preenchida — comportamento que já existia. O que ele NÃO pode receber é o
  // aviso de "mudança no seu grupo", porque ele não está no grupo.
  const doPaulo = NOTIFS.filter((n) => n.uid === 'uid_paulo').map((n) => n.data.message).join(' ');
  ok(doPaulo.indexOf('já foi preenchida') !== -1, 'quem foi convidado e perdeu a vaga tem que ser avisado');
  ok(doPaulo.indexOf('Mudança no') === -1, 'quem não está no grupo NÃO recebe o aviso de mudança de grupo');
});

// ── 6. Instrução MUDA quando o destino é "desativados" ──────────────────────
sec(function () {
  const t = novoT(); boot(t);
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  DOM._dests.forEach((d) => { d.on = (d.d === 'inactive') ? '1' : '0'; });
  win._ligaInviteSelected(t.id, 0, 'R1 Grupo W', 'Thereza');
  const iv = t.ligaSubInvites.filter((x) => x.inviteeUid === 'uid_sandra')[0];
  boot(t, 'uid_sandra'); NOTIFS = [];
  win._ligaAcceptSub(t.id, iv.id);
  const msg = NOTIFS.filter((n) => n.uid === 'uid_thereza').map((n) => n.data.message).join(' ');
  ok(msg.indexOf('DESATIVADO') !== -1, 'tem que dizer que ela ficou desativada');
  ok(msg.indexOf('Ativado') !== -1, 'e ENSINAR o caminho de volta: ligar o botão Ativado');
  ok(msg.indexOf('FIM da lista de espera') !== -1, 'dizendo que isso a põe no FIM da fila');
});

// ── 7. FIM DO CICLO pelo JOGADOR X também notifica ─────────────────────────
sec(function () {
  const t = novoT(); boot(t); NOTIFS = [];
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  win._ligaFillGuestPrompt(t.id, 0, 'R1 Grupo W', 'Thereza');   // stubs confirmam sozinhos
  ok(t.rounds[0].monarchGroups[0].subIsGuest === true, 'Jogador X entrou');
  ok(NOTIFS.some((n) => n.uid === 'uid_thereza'), 'a ausente é avisada também no caminho do Jogador X');
  ok(NOTIFS.filter((n) => n.uid === 'uid_thereza')[0].data.message.indexOf('Jogador X') !== -1, 'e sabe que foi um Jogador X');
  ['uid_fabiana', 'uid_flavia', 'uid_suely'].forEach((u) => {
    ok(NOTIFS.some((n) => n.uid === u), 'o grupo é avisado (' + u + ')');
  });
  ok(!nomes(t.participants).includes('Thereza'), 'o destino também vale no caminho do Jogador X');
});

// ── 8. Escopo: wo-claim.js segue sem o fluxo do organizador ─────────────────
sec(function () {
  const claim = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wo-claim.js'), 'utf8');
  ok(claim.indexOf('_ligaPickFill') !== -1, 'wo-claim continua delegando pro _ligaPickFill (é o caminho real)');
});

// ── 9. ORGANIZADOR SUBSTITUI DIRETO; PARTICIPANTE só CONVIDA ────────────────
// Regra do dono: "no fluxo dos participantes eles convidam os da lista de espera. No
// fluxo do organizador ele substitui diretamente se quiser. Pode convidar, mas pode
// substituir diretamente."
sec(function () {
  // (a) o ORGANIZADOR vê o botão de colocar direto
  const t = novoT(); boot(t, 'org');
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  ok(CAP.html.indexOf('_ligaSubstituteNow') !== -1, 'organizador tem que ver "Colocar" (substituição direta)');
  ok(CAP.html.indexOf('Convidar selecionados') !== -1, 'e o convite CONTINUA disponível pra ele');

  // (b) o PARTICIPANTE do grupo NÃO vê — ele só convida
  const t2 = novoT(); boot(t2, 'uid_fabiana');
  win._canManagePresence = () => false;         // participante, não autoridade
  win._ligaPickFill(t2.id, 0, 'R1 Grupo W', 'Thereza');
  ok(CAP.html.indexOf('_ligaSubstituteNow') === -1, 'participante NÃO pode substituir direto — só convidar');
  ok(CAP.html.indexOf('Convidar selecionados') !== -1, 'mas convida normalmente');
});

// ── 10. A substituição direta fecha o ciclo inteiro na hora ─────────────────
sec(function () {
  const t = novoT(); boot(t, 'org'); NOTIFS = [];
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  win._ligaSubstituteNow(t.id, 0, 'R1 Grupo W', 'Thereza', 'uid_sandra', 'Sandra');

  const g = t.rounds[0].monarchGroups[0];
  ok(g.players.includes('Sandra') && !g.players.includes('Thereza'), 'a troca acontece no grupo NA HORA, sem aceite');
  ok(g.playersUids[g.players.indexOf('Sandra')] === 'uid_sandra', 'com o uid certo no slot');
  ok(g.subStatus === 'filled' && g.subName === 'Sandra', 'o grupo fica preenchido');
  ok(nomes(t.participants).includes('Sandra'), 'a suplente entra no ELENCO (fica até o fim do torneio)');
  ok(!nomes(win._getWaitlist(t)).includes('Sandra'), 'e sai da fila');
  ok(!nomes(t.participants).includes('Thereza'), 'a ausente vai pro destino escolhido (default = fila)');
  const fila = nomes(win._getWaitlist(t));
  ok(fila[fila.length - 1] === 'Thereza', 'no FIM da fila, fila=' + fila.join('|'));
  ok((t.rounds[0].matches || []).some((m) => m.isSitOut && m.sitOutReason === 'wo' && m.p1 === 'Thereza'), 'o marcador de W.O. existe');
  ok((t.ligaSubInvites || []).every((iv) => iv.status !== 'pending'), 'convite pendente do grupo é cancelado (vaga resolvida na mão)');
  // e o ciclo AVISA todo mundo, igual ao caminho do aceite
  ok(NOTIFS.some((n) => n.uid === 'uid_thereza'), 'a ausente é notificada');
  ok(NOTIFS.some((n) => n.uid === 'uid_sandra'), 'a suplente é notificada');
  ['uid_fabiana', 'uid_flavia', 'uid_suely'].forEach((u) => {
    ok(NOTIFS.some((n) => n.uid === u), 'o grupo é notificado (' + u + ')');
  });
});

// ── 11. Substituição direta respeita o destino 1 ────────────────────────────
sec(function () {
  const t = novoT(); boot(t, 'org');
  win._ligaPickFill(t.id, 0, 'R1 Grupo W', 'Thereza');
  DOM._dests.forEach((d) => { d.on = (d.d === 'inactive') ? '1' : '0'; });
  win._ligaSubstituteNow(t.id, 0, 'R1 Grupo W', 'Thereza', 'uid_sandra', 'Sandra');
  const th = t.participants.filter((p) => p.uid === 'uid_thereza')[0];
  ok(!!th && th.ligaActive === false, 'destino 1 na substituição direta: fica inativa no elenco');
  ok(!nomes(win._getWaitlist(t)).includes('Thereza'), 'e não entra na fila agora');
});

// ── 12. Quem NÃO é autoridade não consegue chamar a função direto ───────────
sec(function () {
  const t = novoT(); boot(t, 'uid_fabiana');
  win._canManagePresence = () => false;
  win._ligaSubstituteNow(t.id, 0, 'R1 Grupo W', 'Thereza', 'uid_sandra', 'Sandra');
  ok(t.rounds[0].monarchGroups[0].players.includes('Thereza'), 'sem autoridade, a substituição direta é RECUSADA (não basta esconder o botão)');
});

// ── 13. O diálogo tem que CABER na tela (scroll no corpo) ───────────────────
sec(function () {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'notifications.js'), 'utf8');
  const i = src.indexOf('function showAlertDialog');
  const corpo = src.slice(i, i + 4000);
  ok(/max-height:\s*92%/.test(corpo), 'o card do alert precisa de max-height — senão o rodapé sai do viewport');
  ok(/overflow-y:\s*auto/.test(corpo), 'o CORPO do alert precisa rolar');
  ok(corpo.indexOf('flex-direction: column') !== -1, 'coluna flex: cabeçalho e botão fixos, corpo rolando');
  ok(!/max-height:\s*\d+vh/.test(corpo), 'percentual, não vh (sob zoom no body o vh estoura)');

  // GUARDA DO FOOTGUN: uma ASPA DUPLA dentro de um comentário CSS que mora no atributo
  // style="..." FECHA o atributo — o navegador descarta silenciosamente tudo o que vem
  // depois. Foi assim que a 1ª tentativa deste fix nasceu morta (medido no navegador:
  // computed max-height 'none', display 'block', overflow 'visible', card estourando o
  // viewport). Varre o app inteiro, não só este arquivo.
  const glob = require('fs').readdirSync(path.join(ROOT, 'js', 'views')).filter((f) => f.endsWith('.js'))
    .map((f) => path.join(ROOT, 'js', 'views', f)).concat([path.join(ROOT, 'js', 'notifications.js')]);
  let maus = [];
  glob.forEach((f) => {
    const txt = require('fs').readFileSync(f, 'utf8');
    const re = /style="(?:[^"]|\n)*?\/\*(?:[^*]|\*(?!\/))*?"/g;
    if (re.test(txt)) maus.push(path.basename(f));
  });
  ok(maus.length === 0, 'aspa dupla dentro de comentário CSS no atributo style (quebra o atributo): ' + maus.join(', '));
});

console.log((fail === 0 ? '✅' : '❌') + ' wo-destino-ciclo-notifica: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
