/* O CLIENTE DISPARA A PORTA — não escreve o grupo do jogo por conta própria
 * node tests/o-cliente-dispara-a-porta-do-grupo.test.js
 *
 * ⛔ O INCIDENTE: `_waGrpSaveLink` gravava `m.waGroup` em memória e chamava
 * `FirestoreDB.saveTournament(t)` — `.set(merge:true)` NO DOCUMENTO. Num torneio DIVIDIDO
 * (`_semPesados` contém 'matches') o jogo não mora mais no documento: mora na subcoleção,
 * onde `firestore.rules:434` diz `allow write: if false` pro cliente. O `saveTournament`
 * gravava a config (sem os jogos), voltava OK, o app dizia "Grupo salvo" — e o link não
 * existia em lugar nenhum. Um sucesso ANUNCIADO sobre uma escrita que caiu no vazio é
 * pior que um erro: ninguém tenta de novo.
 *
 * ⇒ Ordem do dono, que é a arquitetura do projeto: _"tudo em CF apenas disparado pelo
 * cliente"_. O nível JOGO passa por `setMatchWhatsAppGroup`; o nível TORNEIO continua no
 * documento, porque `t.waGroup` nunca esteve dividido.
 *
 * ESTA SUÍTE RODA O CÓDIGO REAL de js/views/wa-group.js no harness de render (mesmo
 * caminho de tests/wa-group-por-grupo.test.js) e mede COMPORTAMENTO: quem é chamado,
 * com que payload, em que ordem, e o que acontece quando a rede falha.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { sandbox } = require('./render-harness');

vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/schedule-poll.js'), 'utf8'), sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/wa-group.js'), 'utf8'), sandbox, { filename: 'wa-group.js' });
const W = sandbox;

let falhas = 0, passou = 0;
const ok = (n, c, extra) => {
  if (c) { passou++; console.log('  ✓ ' + n); }
  else { falhas++; console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); }
};
// deixa as microtasks correrem (o fluxo é todo em promessa)
const respira = () => new Promise((r) => setImmediate(r));

// ── o torneio de teste: 1 jogo comum, 2 jogadores por lado ───────────────────
const LINK = 'https://chat.whatsapp.com/AbCdEfGhIjK';
const LINK2 = 'https://chat.whatsapp.com/ZzYyXxWwVvU';
function torneio() {
  return {
    id: 'T1', name: 'Copa de Teste', creatorUid: 'uOrg',
    participants: [{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }, { uid: 'uD' }],
    waGroup: null,
    rounds: [{ round: 1, matches: [{ id: 'm1', p1: 'Ana/Bia', p2: 'Cida/Dora', team1Uids: ['uA', 'uB'], team2Uids: ['uC', 'uD'] }] }],
  };
}
let T = torneio();
const jogo = () => T.rounds[0].matches[0];

W.AppStore = W.AppStore || {};
W.AppStore.tournaments = [T];
W._findTournamentById = () => T;
W._collectAllMatches = (t) => (t.rounds || []).reduce((a, r) => a.concat(r.matches || []), []);
W._isUserOrgOrCoHost = (t, u) => !!(u && u.uid === 'uOrg');
W._softRefreshView = () => {};
W._rerenderBracket = () => {};
W.confirm = () => true;
W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana', notifyWhatsApp: true };

// captura de notificações e de escritas
let avisos = [];
W.showNotification = (a, b, k) => { avisos.push({ t: a, k: k }); };
let chamadas = [], saves = 0, pendente = null;
function reset(campo) {
  avisos = []; chamadas = []; saves = 0; pendente = null;
  T = torneio(); W.AppStore.tournaments = [T];
  if (campo) T.rounds[0].matches[0].waGroup = campo;
  W.document.getElementById = (id) => (id === 'wa-grp-link' ? { value: LINK } : null);
}
W.FirestoreDB = {
  saveTournament: function () { saves++; return Promise.resolve(); },
  _callFn: function (nome, payload) {
    chamadas.push({ nome: nome, payload: JSON.parse(JSON.stringify(payload)) });
    return new Promise(function (res, rej) { pendente = { res: res, rej: rej }; });
  },
};
// resposta padrão do servidor: o estado CONFIRMADO
const respostaOk = (link, extra) => Object.assign({
  ok: true, jaAplicado: false, espelhados: [],
  waGroup: link === null ? null : { link: link, byUid: 'uA', byName: 'Ana (do perfil)', at: 12345, opId: 'servidor' },
}, extra || {});

const UUID_V4_SERVIDOR = (function () {
  // A MESMA expressão que a CF usa pra recusar — extraída do arquivo, não redigitada.
  const src = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
  const m = src.match(/const _WA_UUID_V4_RE = (\/\^.*?\/i);/);
  if (!m) { console.error('  ✗ não achei _WA_UUID_V4_RE em functions/index.js'); process.exit(1); }
  return eval(m[1]);   // eslint-disable-line no-eval
})();

(async () => {
  console.log('──── o cliente dispara a porta do grupo ────');

  // ═══ ① SALVAR O LINK DE UM JOGO ══════════════════════════════════════════
  console.log('\n① salvar o link de um JOGO vai pela CF, nunca pelo saveTournament');
  {
    reset();
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⭐ chamou UMA função de servidor', chamadas.length === 1, JSON.stringify(chamadas));
    ok('⭐ e é a porta do grupo', chamadas[0] && chamadas[0].nome === 'setMatchWhatsAppGroup', chamadas[0] && chamadas[0].nome);
    ok('⛔ e NÃO gravou o torneio pelo caminho velho (era o buraco)', saves === 0);
    const p = chamadas[0].payload;
    ok('  → payload leva tournamentId e matchId', p.tournamentId === 'T1' && p.matchId === 'm1');
    ok('  → e o link JÁ NORMALIZADO', p.link === LINK);
    ok('  → e um operationId que o servidor aceita (UUID v4 estrito)',
      UUID_V4_SERVIDOR.test(String(p.operationId)), String(p.operationId));

    ok('⛔ ANTES da resposta não há sucesso anunciado',
      avisos.filter((a) => a.k === 'success').length === 0, JSON.stringify(avisos));
    pendente.res(respostaOk(LINK));
    await respira();
    ok('⭐ só DEPOIS do retorno confirmado o app diz "Grupo salvo"',
      avisos.filter((a) => a.k === 'success').length === 1, JSON.stringify(avisos));
    ok('⭐ e o estado em memória é o que o SERVIDOR confirmou, não o otimista',
      jogo().waGroup.byName === 'Ana (do perfil)' && jogo().waGroup.at === 12345,
      JSON.stringify(jogo().waGroup));
  }

  // ═══ ② FALHA: reverte, avisa, e o retry reusa o MESMO operationId ═════════
  console.log('\n② quando o servidor recusa');
  {
    reset();
    W._waGrpSaveLink('T1', 'm1', 0, null);
    const op1 = chamadas[0].payload.operationId;
    ok('⭐ a pintura otimista aparece na hora', !!(jogo().waGroup && jogo().waGroup.link === LINK));
    pendente.rej(Object.assign(new Error('sem rede'), { code: 'functions/unavailable' }));
    await respira();
    ok('⛔ o otimista é REVERTIDO — a tela não fica prometendo um grupo que não existe',
      !jogo().waGroup, JSON.stringify(jogo().waGroup));
    ok('⛔ e o erro é dito', avisos.some((a) => a.k === 'error'));
    ok('⛔ nenhum "sucesso" foi anunciado', !avisos.some((a) => a.k === 'success'));

    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⭐ o RETRY manda o MESMO operationId — é o que faz a CF reconhecer o retry',
      chamadas.length === 2 && chamadas[1].payload.operationId === op1,
      op1 + ' × ' + (chamadas[1] && chamadas[1].payload.operationId));
    pendente.res(respostaOk(LINK));
    await respira();

    // depois do SUCESSO o id é queimado: a próxima gravação é OUTRA operação
    W.document.getElementById = (id) => (id === 'wa-grp-link' ? { value: LINK2 } : null);
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⭐ e depois do sucesso a operação SEGUINTE ganha um id novo',
      chamadas.length === 3 && chamadas[2].payload.operationId !== op1,
      op1 + ' × ' + (chamadas[2] && chamadas[2].payload.operationId));
    pendente.res(respostaOk(LINK2));
    await respira();
  }

  // ═══ ③ DUPLO CLIQUE ══════════════════════════════════════════════════════
  console.log('\n③ duplo clique não vira duas gravações');
  {
    reset();
    W._waGrpSaveLink('T1', 'm1', 0, null);
    W._waGrpSaveLink('T1', 'm1', 0, null);
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⛔ três cliques em voo → UMA chamada só', chamadas.length === 1, 'chamadas: ' + chamadas.length);
    pendente.res(respostaOk(LINK));
    await respira();
    W.document.getElementById = (id) => (id === 'wa-grp-link' ? { value: LINK2 } : null);
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⭐ e a trava SOLTA quando a operação termina', chamadas.length === 2);
    pendente.res(respostaOk(LINK2));
    await respira();
  }

  // ═══ ④ APAGAR usa a MESMA porta, com link null ═══════════════════════════
  console.log('\n④ apagar o link');
  {
    reset({ link: LINK, byUid: 'uA', byName: 'Ana', at: 1 });
    W._waGrpDeleteLink('T1', 'm1', 0, null);
    ok('⭐ apagar também vai pela porta', chamadas.length === 1 && chamadas[0].nome === 'setMatchWhatsAppGroup');
    ok('⭐ e o pedido é `link: null` — um caminho de escrita só', chamadas[0].payload.link === null);
    ok('⛔ sem saveTournament', saves === 0);
    ok('⛔ e nenhum sucesso antes da confirmação', !avisos.some((a) => a.k === 'success'));
    pendente.res(respostaOk(null));
    await respira();
    ok('⭐ confirmado: o campo some do jogo', !('waGroup' in jogo()));
    ok('⭐ e agora sim o app avisa', avisos.some((a) => a.k === 'success'));
  }
  {
    // e a falha ao apagar devolve o link (a pessoa não perde o grupo por causa da rede)
    reset({ link: LINK, byUid: 'uA', byName: 'Ana', at: 1 });
    W._waGrpDeleteLink('T1', 'm1', 0, null);
    pendente.rej(new Error('offline'));
    await respira();
    ok('⛔ apagar que falhou devolve o link', !!(jogo().waGroup && jogo().waGroup.link === LINK));
  }

  // ═══ ⑤ O NÍVEL TORNEIO NÃO MUDOU ═════════════════════════════════════════
  console.log('\n⑤ o grupo GERAL do torneio continua no documento');
  {
    reset();
    W.AppStore.currentUser = { uid: 'uOrg', displayName: 'Olga', notifyWhatsApp: true };
    W._waGrpSaveLink('T1', '', 0, null);
    ok('⭐ escopo TORNEIO segue pelo saveTournament (t.waGroup nunca foi dividido)',
      saves === 1 && chamadas.length === 0, 'saves=' + saves + ' chamadas=' + chamadas.length);
    await respira();
    ok('  → e o link ficou no torneio, não no jogo', T.waGroup && T.waGroup.link === LINK && !jogo().waGroup);
    W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana', notifyWhatsApp: true };
  }

  // ═══ ⑥ GATE: quem não pode nem chega a chamar ════════════════════════════
  console.log('\n⑥ o gate continua ANTES da chamada');
  {
    reset();
    W.AppStore.currentUser = { uid: 'uZ', displayName: 'Zé', notifyWhatsApp: true };
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⛔ quem não joga nem organiza não gasta uma chamada de servidor', chamadas.length === 0);
    W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana', notifyWhatsApp: true };

    reset();
    W.document.getElementById = (id) => (id === 'wa-grp-link' ? { value: 'https://scoreplace.app/#dashboard' } : null);
    W._waGrpSaveLink('T1', 'm1', 0, null);
    ok('⛔ link inválido é recusado no cliente também (sem ida ao servidor)', chamadas.length === 0);
    ok('  → e o jogo não foi tocado', !jogo().waGroup);
  }

  // ═══ ⑦ O operationId É SEMPRE UM UUID v4 QUE O SERVIDOR ACEITA ═══════════
  // ⛔ A CF recusa qualquer outra forma. O gerador tem TRÊS caminhos (randomUUID,
  // getRandomValues, Math.random) e o terceiro é o que roda no aparelho velho — justamente
  // onde um erro só apareceria em produção, como "invalid-argument" sem explicação.
  console.log('\n⑦ os três caminhos do gerador produzem UUID v4 que a CF aceita');
  {
    const cenarios = [
      ['sem crypto (aparelho velho → Math.random)', undefined, 120],
      ['crypto.getRandomValues', { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); return b; } }, 120],
      ['crypto.randomUUID', { randomUUID: () => require('crypto').randomUUID() }, 40],
    ];
    for (const [rot, cripto, n] of cenarios) {
      W.crypto = cripto;
      const vistos = {};
      let ruins = 0;
      for (let i = 0; i < n; i++) {
        reset();
        W._waGrpSaveLink('T1', 'm1', 0, null);
        const op = String(chamadas[0].payload.operationId);
        if (!UUID_V4_SERVIDOR.test(op)) { ruins++; if (ruins === 1) console.log('      exemplo ruim: ' + op); }
        vistos[op] = 1;
        pendente.res(respostaOk(LINK));
        await respira();
      }
      ok('⭐ ' + rot + ': ' + n + '/' + n + ' aceitos pela regra da CF', ruins === 0, ruins + ' recusados');
      ok('  → e todos distintos (nenhuma colisão em ' + n + ')', Object.keys(vistos).length === n);
    }
    delete W.crypto;
  }

  // ═══ ⑧ A REGRA DO LINK É UMA SÓ (cliente × servidor) ═════════════════════
  // A CF não pode importar um arquivo de browser, então a expressão está nos dois lados.
  // Duas cópias de uma regra divergem — e divergir AQUI significa o app aceitar um link
  // que o servidor recusa (ou o contrário), com a pessoa travada sem entender.
  console.log('\n⑧ o que é um link de grupo: uma regra, duas cópias, iguais');
  {
    const cli = fs.readFileSync(path.join(ROOT, 'js/views/wa-group.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    // captura o LITERAL inteiro (até a barra final seguida de `)` / `;`)
    const reCli = (cli.match(/\.match\((\/https:\\\/\\\/chat[^\n]*?\/)\)/) || [])[1];
    const reSrv = (srv.match(/const _WA_GRUPO_LINK_RE = (\/https:\\\/\\\/chat[^\n]*?\/);/) || [])[1];
    ok('achei a expressão no cliente', !!reCli, String(reCli));
    ok('achei a expressão no servidor', !!reSrv, String(reSrv));
    ok('⛔ e as duas são a MESMA, caractere por caractere', !!reCli && reCli === reSrv,
      'cliente: ' + reCli + '\n      servidor: ' + reSrv);

    // e o comportamento bate nas entradas que importam
    const casos = [
      [LINK, LINK],
      ['Entre no meu grupo: ' + LINK + ' agora', LINK],
      [LINK + '?mode=ac_t', LINK],
      ['https://wa.me/5511999998888', ''],
      ['http://chat.whatsapp.com/AbCdEfGhIjK', ''],
      ['https://chat.whatsapp.evil.com/AbCdEfGhIjK', ''],
      ['https://chat.whatsapp.com/abc', ''],
      ['', ''],
    ];
    const normSrv = (raw) => {
      const m = String(raw == null ? '' : raw).match(eval(reSrv));   // eslint-disable-line no-eval
      return m ? 'https://chat.whatsapp.com/' + m[1] : '';
    };
    let diverg = 0;
    casos.forEach(([entrada, esperado]) => {
      const a = W._waGrpNormalizeLink(entrada), b = normSrv(entrada);
      if (a !== esperado || b !== esperado) diverg++;
    });
    ok('⛔ e as duas decidem igual nas 8 colagens que o WhatsApp produz de verdade', diverg === 0, diverg + ' divergências');
  }

  console.log('\n' + (falhas === 0 ? '✅ o-cliente-dispara-a-porta-do-grupo: ' + passou + ' ok' : '❌ ' + falhas + ' falha(s) em ' + (passou + falhas)));
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('EXPLODIU:', e); process.exit(1); });
