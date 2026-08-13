// REGRA DO DONO (13/ago/2026): "antes de confirmar, deve aparecer o placar do tie-break em
// caso dos valores de disparo serem lançados" · "tem que funcionar em TODOS os caminhos.
// participantes e organizador".
//
// O relato foi num jogo com PROPOSTA PENDENTE (5×6): ali o card NÃO mostra os inputs normais
// (`showInputs` exige `!hasPending`), então quem edita cai em `_editPendingResult` — que
// montava só s1/s2, sem `tb1-`/`tb2-` e sem `oninput`. Como `_highlightWinner` começa com
// `if (tb1El && tb2El)`, ele virava no-op SILENCIOSO: os campos não existiam pra poder abrir.
// O mini-card do dashboard tinha a mesma falha (chamava _highlightWinner sem nunca renderizar
// os campos).
//
// INVENTÁRIO VIVO — 4 lugares onde se digita placar. Todos precisam dos campos do TB:
//   1. bracket.js  — card normal (participante e organizador lançam)      [já tinha]
//   2. _editResultInline     — editar placar JÁ salvo (autoridade)        [já tinha]
//   3. _editPendingResult    — editar PROPOSTA pendente (org E participante)  ← consertado
//   4. dashboard.js          — mini-card "Meus Resultados" (participante)     ← consertado
// Fora do inventário, por não receberem placar digitado: _contestResult (só marca disputa),
// placar AO VIVO (ponto a ponto, TB nativo) e _saveSetResult (código morto — sem chamador e
// sem renderer que crie `tb-p1`/`set-p1`).
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const ROOT = path.join(__dirname, '..', 'js', 'views');
const SRC = {
  bracket: fs.readFileSync(path.join(ROOT, 'bracket.js'), 'utf8'),
  bracketUi: fs.readFileSync(path.join(ROOT, 'bracket-ui.js'), 'utf8'),
  dashboard: fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8')
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. VARREDURA — onde nasce um input de placar, nasce o campo do tie-break
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n1. Todo renderizador de placar também renderiza o tie-break');

// acha cada bloco que cria um input com id s1-/s2- e confere que o MESMO arquivo
// cria tb1-/tb2- e fia o _highlightWinner
function contaInputs(src, re) { return (src.match(re) || []).length; }
const alvos = [
  ['bracket.js (card normal)', SRC.bracket],
  ['bracket-ui.js (edições)', SRC.bracketUi],
  ['dashboard.js (Meus Resultados)', SRC.dashboard]
];
alvos.forEach(function (par) {
  const nome = par[0], src = par[1];
  // ⚠️ `id="tb` cobre as DUAS formas de montar o id: literal (`id="tb1-${m.id}"`) e
  // construída por helper (`id="tb' + n + '-' + mId`). Casar só em `tb1-` daria falso
  // alarme no helper — e um teste que grita sem defeito é teste que ninguém lê.
  const s1 = contaInputs(src, /id=["']?s1-/g);
  const tb = contaInputs(src, /id="tb/g);
  ok(s1 > 0, nome + ': renderiza input de placar (âncora do teste)');
  ok(tb >= 1, nome + ': renderiza os campos do tie-break (achou ' + tb + ')');
  ok(/_highlightWinner/.test(src), nome + ': fia o _highlightWinner');
});
// nº de renderizadores de s1 no bracket-ui = 2 (_editPendingResult e _editResultInline);
// se aparecer um 3º sem TB, o teste acima já acusa pela contagem de tb1.
ok(contaInputs(SRC.bracketUi, /id=["']?s1-/g) === 2,
  'bracket-ui.js tem exatamente 2 renderizadores de placar (novo caminho exige revisar este teste)');

// o caminho da PROPOSTA PENDENTE especificamente
const iniPE = SRC.bracketUi.indexOf('window._editPendingResult = function');
const fimPE = SRC.bracketUi.indexOf('window._editResult = function', iniPE);
const PE = SRC.bracketUi.slice(iniPE, fimPE);
ok(iniPE > 0 && fimPE > iniPE, '_editPendingResult localizado');
ok(/id="tb/.test(PE), '_editPendingResult cria os campos do tie-break');
ok(/_peTbInput\(1[^)]*\)/.test(PE) && /_peTbInput\(2[^)]*\)/.test(PE), '_editPendingResult monta os DOIS lados');
ok(/oninput="window\._highlightWinner/.test(PE), '_editPendingResult fia oninput nos campos');
ok(/_highlightWinner\(matchId\)/.test(PE), '_editPendingResult revela ao MONTAR (proposta já no gatilho)');
ok(/isTiebreakEntry/.test(PE) && /tbP1/.test(PE) && /tbP2/.test(PE),
  '_editPendingResult grava o TB no pendingResult (senão o Confirmar descarta os pontos)');
// os DOIS desfechos (organizador finaliza · participante contra-propõe) levam o TB.
// ⚠️ Asserção pelo INVARIANTE, não por contagem de string: a versão anterior contava
// `isTiebreakEntry:` e quebrou sozinha quando o mesmo nome passou a aparecer também
// dentro das chamadas do builder — teste que quebra por refator sem defeito é ruído.
ok((PE.match(/_buildManualSet\(/g) || []).length === 2,
  'os DOIS desfechos montam o set pelo builder canônico (organizador E contra-proposta)');
ok(/m\.pendingResult\.sets\s*=/.test(PE), 'o desfecho do ORGANIZADOR anexa o set (com o TB)');
ok(/_counter\.sets\s*=/.test(PE), 'a CONTRA-PROPOSTA do participante anexa o set (com o TB)');

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMPORTAMENTO — o jogo REAL do relato (Confra, 5×6 pendente)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. O jogo real do relato: 5×6 pendente, Confra (Beach Tennis)');

const TID = 'tour_1780009816637';
const MID = 'match-rr-r1-g18-1-1785708005103';
// dado REAL lido do Firestore de produção em 13/ago/2026
function confra() {
  return {
    id: TID, name: 'Confra BT Alta da Clínica 2026', sport: 'Beach Tennis',
    format: 'Liga', drawMode: 'rei_rainha',
    creatorUid: 'B17n7JCXYOfqahlcLZ0fKxGGyUu1', creatorEmail: 'rstbarth@gmail.com',
    organizerEmail: 'rstbarth@gmail.com', coHosts: [], arbitros: [], participants: [],
    scoring: { type: 'sets', gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7,
      tiebreakMargin: 2, setsToWin: 1, countingType: 'tennis', advantageRule: false,
      superTiebreak: false, superTiebreakPoints: 10, fixedSet: false, fixedSetGames: 6 },
    phases: [{ name: 'Rei/Rainha' }, { name: 'Eliminatória' }],
    rounds: [{ number: 1, matches: [{
      id: MID, p1: 'Vanessa Bianchini / Luciana Marinho', p2: 'Bruna Arilla / Adriana Zalaf',
      team1: ['Vanessa Bianchini', 'Luciana Marinho'], team2: ['Bruna Arilla', 'Adriana Zalaf'],
      team1Uids: ['yjNjUNXdwheBfXxUCDxeBKVjDl52', 'V6HTAUxYPWZ76QTmgrSBYS6ns6S2'],
      team2Uids: ['GYRZ8fRJa7Vzz51BEPRlOEh73Ug1', 'Q480tHiDOnPyfJq8v5QKac6Fmsa2'],
      monarchGroup: 18, roundIndex: 0, winner: null,
      pendingResult: { kind: 'inline', scoreP1: 5, scoreP2: 6, draw: false,
        winner: 'Bruna Arilla / Adriana Zalaf', proposedBy: 'V6HTAUxYPWZ76QTmgrSBYS6ns6S2',
        proposedByEmail: 'lumarinho@hotmail.com', proposedByName: 'Luciana Marinho',
        proposedAt: 1786632603560, isCounterProposal: true,
        originalProposal: { proposedByName: 'Luciana Marinho', scoreP1: 5, scoreP2: 5 } }
    }] }]
  };
}

function fakeEl(html) {
  const e = { innerHTML: html || '', style: {}, dataset: {}, value: '',
    _listeners: {},
    addEventListener: function (ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    removeEventListener: function () {},
    setAttribute: function (k, v) { this['_' + k] = String(v); },
    getAttribute: function (k) { return ('_' + k) in this ? this['_' + k] : null; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    children: [], appendChild: function () {}, focus: function () {}, select: function () {},
    remove: function () {} };
  return e;
}

// Monta o DOM que o card pendente expõe e roda o _editPendingResult REAL.
function editarPendente(usuario) {
  const t = confra();
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = usuario;
  const nodes = {};
  nodes['score-p1-' + MID] = fakeEl();
  nodes['score-p2-' + MID] = fakeEl();
  nodes['header-btns-' + MID] = fakeEl();
  nodes['pending-banner-btns-' + MID] = fakeEl();
  nodes['card-' + MID] = fakeEl();
  W.document.getElementById = function (id) {
    if (nodes[id]) return nodes[id];
    // os inputs nascem DENTRO do innerHTML — o _highlightWinner os procura por id.
    // Simula o parse: cria o nó na 1ª busca, lendo value= do HTML que acabou de ser escrito.
    const m = /^(s1|s2|tb1|tb2)-/.exec(id);
    if (!m) return null;
    const lado = (m[1] === 's1' || m[1] === 'tb1') ? 'score-p1-' : 'score-p2-';
    const html = nodes[lado + MID].innerHTML || '';
    const re = new RegExp('<input[^>]*id="' + m[1] + '-' + MID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '"[^>]*>');
    const tag = (html.match(re) || [null])[0];
    if (!tag) return null;
    if (!nodes[id]) {
      nodes[id] = fakeEl();
      const v = /value="([^"]*)"/.exec(tag);
      nodes[id].value = v ? v[1] : '';
      if (/display:none/.test(tag)) nodes[id].style.display = 'none';
    }
    return nodes[id];
  };
  W._editPendingResult(TID, MID);
  const tb1 = W.document.getElementById('tb1-' + MID);
  const tb2 = W.document.getElementById('tb2-' + MID);
  return {
    nodes: nodes,
    campoTbExiste: !!(tb1 && tb2),
    campoTbVisivel: !!(tb1 && tb2 && tb1.style.display === 'inline-block' && tb2.style.display === 'inline-block'),
    s1: (W.document.getElementById('s1-' + MID) || {}).value,
    s2: (W.document.getElementById('s2-' + MID) || {}).value
  };
}

const ORGANIZADOR = { uid: 'B17n7JCXYOfqahlcLZ0fKxGGyUu1', email: 'rstbarth@gmail.com', displayName: 'Rodrigo Barth' };
// participante do time ADVERSÁRIO ao proponente (Bruna, time 2) — quem contra-propõe
const PARTICIPANTE = { uid: 'GYRZ8fRJa7Vzz51BEPRlOEh73Ug1', email: 'bruna@example.com', displayName: 'Bruna Arilla' };

const rOrg = editarPendente(ORGANIZADOR);
ok(rOrg.s1 === '5' && rOrg.s2 === '6', 'organizador: o card abre com o 5×6 da proposta');
ok(rOrg.campoTbExiste, 'organizador: os campos do tie-break EXISTEM (antes nem eram criados)');
ok(rOrg.campoTbVisivel, 'organizador: 5×6 é o gatilho (regra 5-5) → o tie-break JÁ ABRE, sem redigitar');

const rPart = editarPendente(PARTICIPANTE);
ok(rPart.campoTbExiste, 'participante adversário: os campos do tie-break EXISTEM');
ok(rPart.campoTbVisivel, 'participante adversário: 5×6 → o tie-break JÁ ABRE');

// e o campo NÃO aparece num placar que não é do gatilho
function editarComPlacar(usuario, a, b) {
  const t = confra();
  t.rounds[0].matches[0].pendingResult.scoreP1 = a;
  t.rounds[0].matches[0].pendingResult.scoreP2 = b;
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = usuario;
  const nodes = {};
  ['score-p1-', 'score-p2-', 'header-btns-', 'pending-banner-btns-', 'card-'].forEach(function (p) { nodes[p + MID] = fakeEl(); });
  W.document.getElementById = function (id) {
    if (nodes[id]) return nodes[id];
    const mm = /^(s1|s2|tb1|tb2)-/.exec(id); if (!mm) return null;
    const lado = (mm[1] === 's1' || mm[1] === 'tb1') ? 'score-p1-' : 'score-p2-';
    const re = new RegExp('<input[^>]*id="' + mm[1] + '-' + MID.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '"[^>]*>');
    const tag = ((nodes[lado + MID].innerHTML || '').match(re) || [null])[0];
    if (!tag) return null;
    if (!nodes[id]) { nodes[id] = fakeEl();
      const v = /value="([^"]*)"/.exec(tag); nodes[id].value = v ? v[1] : '';
      if (/display:none/.test(tag)) nodes[id].style.display = 'none'; }
    return nodes[id];
  };
  W._editPendingResult(TID, MID);
  const t1 = W.document.getElementById('tb1-' + MID);
  return !!(t1 && t1.style.display === 'inline-block');
}
ok(editarComPlacar(ORGANIZADOR, 6, 4) === false, 'placar 6×4 (vitória normal) NÃO abre o tie-break');
ok(editarComPlacar(ORGANIZADOR, 7, 6) === false, 'placar 7×6 NÃO abre em Beach Tennis (gatilho é 5-5)');
ok(editarComPlacar(ORGANIZADOR, 6, 5) === true, 'placar 6×5 abre (é o gatilho da regra 5-5)');

// ─────────────────────────────────────────────────────────────────────────────
// 3. O gatilho aqui é o MESMO dos outros caminhos (config do torneio)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Mesmo gatilho dos outros caminhos (config do torneio manda)');
ok(/_tbLoserGames\(/.test(PE), '_editPendingResult deriva o gatilho de _tbLoserGames (fonte única)');
ok(!/_isTiebreakSetScore\([^)]*,\s*\d+\s*\)/.test(PE), '_editPendingResult não crava o gatilho num número');
// config 6-6 no MESMO torneio inverte o comportamento
const tCfg = confra(); tCfg.scoring.tiebreakAt = 'g';
ok(W._tbLoserGames(tCfg.scoring, tCfg.sport) === 6, 'com tiebreakAt=g o gatilho vira 6 (set 7-6)');
ok(W._tbLoserGames(confra().scoring, 'Beach Tennis') === 5, 'sem config, Beach Tennis resolve 5 (set 6-5)');

console.log('\n' + (fail === 0 ? '✅ tiebreak-em-todos-os-caminhos: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach(function (f) { console.error('  ✗ ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
