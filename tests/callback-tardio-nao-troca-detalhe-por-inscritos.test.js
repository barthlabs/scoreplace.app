/* HOTFIX 2.1.47 — CALLBACK TARDIO NÃO PODE TROCAR O DETALHE PELOS INSCRITOS.
 *   node tests/callback-tardio-nao-troca-detalhe-por-inscritos.test.js
 *
 * ⛔ O BUG (relato do dono, produção 2.1.47): clicar no card do torneio levava a URL certa —
 * `#tournaments/<id>` — mas a tela mostrada era a lista de INSCRITOS. Sem o detalhe, sumiam
 * sorteio, edição, configurações e exclusão.
 *
 * A causa: `window._setParticipantSkillCategory` (participants.js) grava a categoria de nível
 * e, no `savePromise.then`, repintava `renderParticipants` SEM olhar a rota. Com a gravação
 * ainda em voo, bastava navegar para o detalhe: a promessa resolvia depois e pintava inscritos
 * por cima, deixando a URL mentindo. Os re-renders equivalentes em `tournaments.js` (626/687)
 * já tinham essa guarda; este não tinha.
 *
 * ⛔ ESTE TESTE EXERCITA O CÓDIGO REAL, não o texto dele. Carrega `js/views/participants.js`
 * no contexto do harness (como o `<script>` faz no browser), segura a promessa de gravação
 * ABERTA, troca o hash no meio, e só então resolve — que é exatamente a ordem que produzia o
 * bug. Teste de regex passaria com a guarda escrita no lugar errado.
 */
const { window: W } = require('./render-harness');
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8'),
  W, { filename: 'participants.js' });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const TID = 'tour_HOTFIX_1';
const OUTRO = 'tour_OUTRO_2';
const UID = 'uJogador';

/** Torneio mínimo com níveis, para o caminho chegar até o `savePromise`. */
function mkT() {
  return {
    id: TID, name: 'Confra', creatorUid: 'uOrg',
    skillCategories: ['A', 'B', 'C'],
    participants: [{ uid: UID, displayName: 'Jogador Um', category: 'A' }],
    checkedIn: {}, absent: {}, waitlist: [], standbyParticipants: [], matches: [],
  };
}

/** Prepara o mundo e devolve o controle da promessa de gravação (que fica ABERTA). */
function armar() {
  const t = mkT();
  W.AppStore = {
    tournaments: [t],
    currentUser: { uid: 'uOrg' },
    isCreator: () => true,
    getTournament: (id) => (String(id) === TID ? t : null),
    sync: () => {},
  };
  let resolver = null;
  // a gravação NÃO resolve sozinha: o teste decide quando (é a janela do bug)
  W.AppStore.syncImmediate = () => new Promise((res) => { resolver = res; });

  let pintouParticipantes = 0, ultimoTid = null;
  W.renderParticipants = function (container, tid) { pintouParticipantes++; ultimoTid = tid; };
  W.document.getElementById = function (id) { return (id === 'view-container') ? { id: 'view-container' } : null; };
  W._warn = function () {};

  return { t, soltar: () => { resolver(); }, contar: () => pintouParticipantes, tidPintado: () => ultimoTid };
}

// deixa o microtask do `.then` rodar antes de medir
const virarAVez = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  console.log('\n── callback tardio × rota atual ──');

  // ══ 1) O BUG: navegou para o DETALHE antes de a gravação voltar ═════════════
  {
    const c = armar();
    W.location.hash = '#participants/' + TID;          // a pessoa estava nos inscritos…
    W._setParticipantSkillCategory(TID, 'Jogador Um', 'B', UID);
    ok(c.t.participants[0].category === 'B', 'setup: o nível foi gravado no objeto');
    ok(c.contar() === 0, 'setup: nada foi repintado ainda (a gravação está em voo)');

    W.location.hash = '#tournaments/' + TID;           // …e clicou no torneio no meio
    c.soltar();
    await virarAVez();

    ok(c.contar() === 0,
      '⛔ com a rota em `#tournaments/<id>`, o callback tardio NÃO repinta inscritos');
    ok(W.location.hash === '#tournaments/' + TID,
      '⛔ e ele também NÃO mexe no hash (não rouba a navegação de quem já saiu)');
  }

  // ══ 2) O COMPORTAMENTO LEGÍTIMO SEGUE DE PÉ ════════════════════════════════
  {
    const c = armar();
    W.location.hash = '#participants/' + TID;
    W._setParticipantSkillCategory(TID, 'Jogador Um', 'C', UID);
    c.soltar();
    await virarAVez();

    ok(c.contar() === 1, '✅ na própria tela de inscritos, o re-render acontece');
    ok(String(c.tidPintado()) === TID, '   e para o torneio certo');
  }

  // ══ 3) HASH COM QUERY-STRING AINDA É A MESMA ROTA ══════════════════════════
  {
    const c = armar();
    W.location.hash = '#participants/' + TID + '?ref=uAlguem';
    W._setParticipantSkillCategory(TID, 'Jogador Um', 'B', UID);
    c.soltar();
    await virarAVez();

    ok(c.contar() === 1, '✅ `#participants/<id>?ref=…` continua sendo a tela de inscritos');
  }

  // ══ 4) INSCRITOS DE OUTRO TORNEIO NÃO CONTA ════════════════════════════════
  {
    const c = armar();
    W.location.hash = '#participants/' + TID;
    W._setParticipantSkillCategory(TID, 'Jogador Um', 'B', UID);
    W.location.hash = '#participants/' + OUTRO;        // navegou para OUTRO torneio
    c.soltar();
    await virarAVez();

    ok(c.contar() === 0, '⛔ inscritos de OUTRO torneio não recebem a repintura deste');
  }

  // ══ 5) `#participantes/<id>` (adicionar participante) é OUTRA TELA ═════════
  {
    const c = armar();
    W.location.hash = '#participants/' + TID;
    W._setParticipantSkillCategory(TID, 'Jogador Um', 'B', UID);
    W.location.hash = '#participantes/' + TID;         // formulário de adicionar
    c.soltar();
    await virarAVez();

    ok(c.contar() === 0, '⛔ `#participantes/<id>` não é `#participants/<id>` — nada é repintado');
  }

  // ══ 6) A GUARDA, DIRETO ════════════════════════════════════════════════════
  {
    const casos = [
      ['#participants/' + TID, true],
      ['#participants/' + TID + '?ref=x', true],
      ['#participants/' + TID + '&x=1', true],
      ['#tournaments/' + TID, false],
      ['#participantes/' + TID, false],
      ['#participants/' + OUTRO, false],
      ['#dashboard', false],
      ['#participants/', false],
      ['', false],
    ];
    let bateu = 0;
    casos.forEach(function (par) {
      W.location.hash = par[0];
      if (W._rotaEhParticipantesDe(TID) === par[1]) bateu++;
      else console.error('     hash "' + par[0] + '" devia dar ' + par[1]);
    });
    ok(bateu === casos.length, '✅ a guarda classifica os ' + casos.length + ' hashes corretamente');
  }

  console.log('\n  callback tardio: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
