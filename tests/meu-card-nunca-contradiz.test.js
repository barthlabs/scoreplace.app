/* O CARD "EU ESTOU INSCRITO?" NUNCA PODE CONTRADIZER O TORNEIO
 * node tests/meu-card-nunca-contradiz.test.js
 *
 * BUG REAL (dono, 06/ago/2026, com print): a **danielacsimao** abriu o Confra e leu
 * _"Você não está inscrito neste torneio"_ — estando na LISTA DE ESPERA. O card só
 * procurava em `t.participants`, e quem está na espera NÃO está lá: é o que a v1.6.86
 * canonizou (inscrição pós-sorteio vai pra fila) e o que o W.O. com destino 'waitlist'
 * faz (a pessoa SAI do elenco, v1.6.90). O card respondia "não" pra quem o próprio app
 * trata como inscrito — e mandava a pessoa perguntar ao organizador, que é exatamente o
 * que ele existe pra evitar.
 *
 * REGRA DO DONO: _"se está inscrita, na lista de espera, inativado, ou com WO decretado.
 * isso tem que estar nesse card aí."_
 *
 * O FIXTURE É DADO REAL DE PRODUÇÃO (tour_1780009816637, medido em 06/ago/2026 via REST):
 * a fila com os 6 de `standbyParticipants` + o "Renato Oshima" só-nome do `monarchWaitlist`,
 * a Thereza com W.O. na rodada 1 (`sitOutReason:'wo'`) + `ligaActive:false` +
 * `woDeactivatedAt`, um desativado SEM W.O. e um inscrito normal.
 *
 * Contra o código publicado (1.7.54) este arquivo fica VERMELHO na 1ª seção.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '_meu-card-fixture.json'), 'utf8'));
const clona = () => JSON.parse(JSON.stringify(FIX));

// ── Carrega as DUAS funções REAIS do store.js (nada de réplica: réplica já deixou suíte
// verde com o arquivo revertido). O store.js inteiro não é require-ável (toca document no
// load), então extraímos os dois blocos por contagem de chaves.
const win = {};
// ⭐ 2.0.94 — a tabela de cor (js/paleta-tabela.js) não existe aqui: este teste extrai
// um TRECHO do arquivo, então a linha de guarda que o topo do arquivo tem fica de fora.
// Identidade devolve a cor crua, que é o comportamento anterior à tabela — que é o que
// este teste afirma.
win._spCor = function (c) { return c; };
// `obrigatoria:false` → some sem estourar. É o que faz este arquivo ficar vermelho pela
// ASSERÇÃO CERTA contra o código anterior (que não tinha `_meuStatusNoTorneio`): sem a
// função de status, o card ainda é exercido e acusa o "não está inscrito" do print, em vez
// de morrer no carregamento dizendo só "não achei".
function extrai(marca, obrigatoria) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const ini = src.indexOf(marca);
  if (ini < 0) {
    if (obrigatoria === false) return false;
    throw new Error('não achei ' + marca + ' no store.js');
  }
  let i = src.indexOf('{', ini + marca.length), nivel = 0, fim = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') { nivel--; if (nivel === 0) { fim = i + 1; break; } }
  }
  new Function('window', 'with (window) { ' + src.slice(ini, fim) + '; }')(win);
  return true;
}
// Dependências reais (mesmas do app), carregadas do arquivo canônico.
new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'views', 'identity-core.js'), 'utf8'))(win);
new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'views', 'waitlist-core.js'), 'utf8'))(win);
win._safeHtml = (s) => String(s == null ? '' : s);
win._getCompetitors = (t) => (Array.isArray(t.participants) ? t.participants.slice() : []);
win._profileAvatarUrl = () => '';
win._profileMetaIsLight = () => false;
// Espelha o app: o nome sai do uid; sem perfil vivo, o rótulo guardado (ou um marcador).
const PERFIS = {
  NUhmEsQAHyQXdz7gcpQv67jvCjp2: 'danielacsimao',
  lvTw5AiGnTYSOnljux78XlJ7f1v2: 'Thereza',
  B17n7JCXYOfqahlcLZ0fKxGGyUu1: 'Inscrita Normal',
  Y38ZNYLFF1XlkvO1GJO96NNJr5G2: 'Desativada',
};
win._displayNameForUid = (uid, guardado) => PERFIS[uid] || guardado || (uid ? 'Sem perfil (' + String(uid).slice(0, 4) + ')' : '');
win._pName = (p, fb) => {
  if (typeof p === 'string') return p;
  if (!p) return fb || '';
  return win._displayNameForUid(p.uid, p.displayName || p.name) || fb || '';
};
const TEM_STATUS = extrai('window._meuStatusNoTorneio = function', false);
extrai('window._meuCardNoTopo = function');
if (!TEM_STATUS) {
  fail++; console.error('  ✗ store.js não expõe _meuStatusNoTorneio — a leitura do estado tem que ser fonte ÚNICA');
  win._meuStatusNoTorneio = function () { return { code: '(inexistente)', wo: false }; };
}

function como(uid, nome) {
  win.AppStore = { currentUser: { uid: uid, displayName: nome || 'Fulano' } };
}
// Texto visível do card, sem depender de DOM.
function texto(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const DANI = 'NUhmEsQAHyQXdz7gcpQv67jvCjp2';
const THEREZA = 'lvTw5AiGnTYSOnljux78XlJ7f1v2';
const NORMAL = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const DESATIVADA = 'Y38ZNYLFF1XlkvO1GJO96NNJr5G2';

// ── 1. O BUG DO PRINT: quem está na fila NÃO pode ler "não está inscrito" ────────
sec(function () {
  const t = clona();
  como(DANI, 'danielacsimao');
  const st = win._meuStatusNoTorneio(t);
  const html = win._meuCardNoTopo(t);
  ok(st.code === 'waitlist', 'danielacsimao (standbyParticipants[3]) tem que dar code "waitlist", deu "' + st.code + '"');
  ok(!/não está inscrito/i.test(html), 'o card NÃO pode dizer "não está inscrito" pra quem está na lista de espera');
  ok(/lista de espera/i.test(html), 'o card tem que dizer que ela está na LISTA DE ESPERA');
  ok(st.pos === 4, 'posição na fila = 4 (é a 4ª entrada de _getWaitlist), deu ' + st.pos);
  ok(st.total === 7, 'total da fila = 7 (6 standby + Renato Oshima do monarchWaitlist), deu ' + st.total);
  ok(/4º de 7/.test(texto(html)), 'o card mostra a posição: "4º de 7"');
  ok(html.indexOf('data-meu-status="waitlist"') !== -1, 'o card carrega data-meu-status="waitlist"');
});

// ── 2. DESATIVADO: inscrito, mas fora dos sorteios — e a instrução de volta ──────
sec(function () {
  const t = clona();
  como(DESATIVADA, 'Desativada');
  const st = win._meuStatusNoTorneio(t);
  const html = win._meuCardNoTopo(t);
  ok(st.code === 'inactive', 'ligaActive===false tem que dar "inactive", deu "' + st.code + '"');
  ok(!st.wo, 'esta pessoa NÃO levou W.O. — o selo não pode aparecer');
  ok(!/não está inscrito/i.test(html), 'desativado É inscrito — o card não pode negar');
  ok(/desativado/i.test(texto(html)), 'o card tem que dizer DESATIVADO');
  ok(/Ativado/.test(texto(html)), 'tem que dizer COMO voltar (ligar o botão Ativado)');
  ok(html.indexOf('⚠️ W.O.') === -1, 'sem W.O., sem selo de W.O.');
});

// ── 3. W.O. DECRETADO é SELO em cima do estado, com a instrução do DESTINO ───────
sec(function () {
  const t = clona();
  como(THEREZA, 'Thereza');
  const st = win._meuStatusNoTorneio(t);
  const html = win._meuCardNoTopo(t);
  ok(st.wo === true, 'a Thereza tem W.O. na rodada 1 (sitOutReason:"wo", team1Uids com o uid dela)');
  ok(st.woDest === 'inactive', 'o destino gravado é "inactive" (woDeactivatedAt), deu "' + st.woDest + '"');
  ok(st.code === 'inactive', 'o estado-base continua sendo o real (desativada), não "wo"');
  ok(/W\.O\. decretado/.test(texto(html)), 'o card tem que mostrar o selo "W.O. decretado"');
  ok(/Ligue o botão Ativado/.test(texto(html)), 'a instrução de volta do destino DESATIVADOS');
  ok(html.indexOf('data-meu-wo="1"') !== -1, 'o card carrega data-meu-wo="1"');
});

// ── 4. O W.O. É DA RODADA CORRENTE — não carimba pra sempre ──────────────────────
sec(function () {
  const t = clona();
  // rodada 2 sem W.O. nenhum, e a marca de destino apagada: o selo tem que sumir.
  t.rounds.push({ round: 2, matches: [] });
  t.participants.forEach(function (p) { if (p.uid === THEREZA) { delete p.woDeactivatedAt; p.ligaActive = true; } });
  como(THEREZA, 'Thereza');
  const st = win._meuStatusNoTorneio(t);
  ok(st.wo === false, 'W.O. da rodada 1 não pode aparecer quando a rodada corrente é a 2');
  ok(st.code === 'enrolled', 'reativada e sem W.O. na rodada corrente → "enrolled", deu "' + st.code + '"');
});

// ── 5. QUEM FOI PRA FILA POR W.O.: fila + selo + a instrução CERTA ───────────────
sec(function () {
  const t = clona();
  t.standbyParticipants[3].woSentToWaitlistAt = '2026-08-06T12:00:00.000Z';
  como(DANI, 'danielacsimao');
  const st = win._meuStatusNoTorneio(t);
  const txt = texto(win._meuCardNoTopo(t));
  ok(st.code === 'waitlist', 'continua na fila');
  ok(st.wo === true && st.woDest === 'waitlist', 'W.O. com destino "waitlist"');
  ok(/fim da fila/.test(txt), 'a instrução do destino FILA: foi para o fim da fila');
  ok(/não precisa fazer nada/.test(txt), 'e que ela não precisa fazer nada — é chamada na vez dela');
  ok(!/Ligue o botão Ativado/.test(txt), 'NÃO pode mandar ligar o toggle: ela não está desativada');
});

// ── 6. O QUE NÃO PODE REGREDIR: inscrito normal e estranho ao torneio ────────────
sec(function () {
  const t = clona();
  como(NORMAL, 'Inscrita Normal');
  const st1 = win._meuStatusNoTorneio(t);
  const h1 = win._meuCardNoTopo(t);
  ok(st1.code === 'enrolled', 'inscrito ativo continua "enrolled"');
  ok(/você está inscrito/.test(texto(h1)), 'e continua lendo "você está inscrito"');
  ok(/nº 1/.test(texto(h1)), 'o número de inscrição continua aparecendo');

  como('UID_QUE_NAO_EXISTE', 'Estranho');
  const st2 = win._meuStatusNoTorneio(t);
  const h2 = win._meuCardNoTopo(t);
  ok(st2.code === 'none', 'quem não está em lugar nenhum continua "none"');
  ok(/não está inscrito/.test(texto(h2)), '"não está inscrito" TEM que continuar existindo — é resposta legítima');
});

// ── 7. IDENTIDADE É O UID — nome nunca decide ───────────────────────────────────
sec(function () {
  const t = clona();
  // homônimo: outra conta com o MESMO displayName da pessoa da fila
  como('OUTRO_UID_MESMO_NOME', 'danielacsimao');
  const st = win._meuStatusNoTorneio(t);
  ok(st.code === 'none', 'homônimo com uid diferente NÃO herda a inscrição alheia, deu "' + st.code + '"');

  // e sem login não existe card nenhum
  win.AppStore = { currentUser: null };
  ok(win._meuStatusNoTorneio(t) === null, 'sem usuário logado, sem status');
  ok(win._meuCardNoTopo(t) === '', 'sem usuário logado, sem card');
});

// ── 8. DUPLA: o p2 também é dono da inscrição ────────────────────────────────────
sec(function () {
  const t = clona();
  t.participants.push({ p1Uid: 'uid_p1', p1Name: 'Alfa', p2Uid: 'uid_p2', p2Name: 'Beta',
    displayName: 'Alfa / Beta', ligaActive: true, category: 'Fem D' });
  como('uid_p2', 'Beta');
  const st = win._meuStatusNoTorneio(t);
  ok(st.code === 'enrolled', 'o p2 da dupla está inscrito (via _participantUids), deu "' + st.code + '"');
  ok(/com Alfa/.test(texto(win._meuCardNoTopo(t))), 'e o card mostra o parceiro');
});

console.log((fail === 0 ? '✅' : '❌') + ' meu-card-nunca-contradiz: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
