/* O REPLAY É O PLACAR AO VIVO — mesma tela, mesmo motor, pontos vindos do diário
 * node tests/replay-e-o-placar-ao-vivo.test.js
 *
 * ORDEM DO DONO (19/ago/2026): _"tem que ser como o placar ao vivo, mesma
 * apresentação, mesma mecânica, mas reproduzindo a ordem dos pontos da partida e
 * apresentando as estatísticas da partida ao final"_.
 *
 * ⚠️ ESTE ARQUIVO GUARDA O INVARIANTE, NÃO O MECANISMO — e a distinção é a lição de
 * 1.9.59: lá o replay tinha desenho PRÓPRIO, e foi a duplicação de apresentação que
 * produziu o bug. O invariante é:
 *
 *     REPRODUZIR UMA PARTIDA É REJOGÁ-LA NA MESMA TELA, PELO MESMO MOTOR,
 *     E REPRODUZIR NUNCA PODE ESCREVER NADA.
 *
 * Forma nova de quebrar isso entra NESTE arquivo — não num teste novo ao lado, que é
 * como o sintoma da tela branca voltou três vezes por caminhos diferentes.
 *
 * COMO ELE MEDE (nada é simulado): sobe o bracket-ui.js REAL num Chromium, JOGA uma
 * partida de verdade ponto a ponto, deixa o app GRAVAR o registro por conta própria,
 * e depois REPRODUZ esse registro pelo caminho público (`_openMatchReplayById`). O
 * que se compara é o estado final do motor nos dois casos.
 *
 * CONTROLE (o que fica vermelho no código anterior): até a 1.9.59 `_openLiveScoring`
 * não conhecia `opts.replay` — reproduzir abria uma partida NOVA em 0-0 e ela nunca
 * saía de lá. As asserções de "o replay chega no mesmo placar" e "o replay termina"
 * caem. Conferido rodando esta suíte contra o HEAD anterior.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// `require` simples (não `path.join(ROOT,'node_modules',…)`) de propósito: numa
// WORKTREE do git não existe `node_modules` próprio — o Node sobe até o do repo pai,
// e o caminho absoluto fixado na raiz da worktree quebraria. Mesma forma do
// tests/letzplay-big-profile.test.js.
const { chromium } = require('@playwright/test');

let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (obtido: ' + JSON.stringify(a) + ')'); }

const bui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const rep = fs.readFileSync(path.join(ROOT, 'js', 'views', 'match-replay.js'), 'utf8');

// ── Sequência de pontos da partida-cobaia. Determinística de propósito (nada de
//    aleatório): o mesmo jogo tem que sair igual em toda execução, senão o teste
//    passa a acusar sorte em vez de comportamento. 1 = time 1 marcou, 2 = time 2.
//    Escolhida pra ATRAVESSAR as transições que mais doem: viradas de game, um
//    game longo com vantagem, ida a 5-5 (empate → a pergunta de desempate no
//    casual) e o tie-break do Beach Tennis.
function sequencia() {
  const pts = [];
  const game = (quem, n) => { for (let i = 0; i < n; i++) pts.push(quem); };
  game(1, 4); game(2, 4); game(1, 4); game(2, 4);   // 2-2
  game(1, 4); game(2, 4); game(1, 4); game(2, 4);   // 4-4
  game(1, 4); game(2, 4);                            // 5-5 → empate: o motor pergunta
  // tie-break de Beach Tennis: 7 pontos com margem 2 → 7-3 fecha o set e a partida
  pts.push(1, 1, 2, 1, 2, 1, 2, 1, 1, 1);
  return pts;
}

(async () => {
  console.log('\nO REPLAY É O PLACAR AO VIVO (mesma tela, mesmo motor)\n');

  // ── 1. VARREDURA: as travas que não podem sumir ────────────────────────────
  console.log('1. As travas de escrita (o replay não pode gravar nada)');
  const saveFn = bui.slice(bui.indexOf('function _saveResult(opts)'), bui.indexOf('function _saveResult(opts)') + 1400);
  ok(/if\s*\(_replay\)\s*return;/.test(saveFn),
     '_saveResult sai na 1ª linha em replay — é o que protege _resultSaved/_liveRecId');
  const addFn = bui.slice(bui.indexOf('function _addPoint(player)'), bui.indexOf('function _addPoint(player)') + 900);
  ok(/if\s*\(_replay\s*&&\s*!_replayFeeding\)\s*return;/.test(addFn),
     'o dedo não marca ponto em replay — só o diário levanta _replayFeeding');
  ok(/function _lnSync\(\)[\s\S]{0,400}?if\s*\(_replay\)\s*return;/.test(bui),
     'reproduzir não publica ninguém na vitrine "ao vivo"');
  ok(/function _watchNotify\(\)[\s\S]{0,400}?if\s*\(_replay\)\s*return;/.test(bui),
     'reproduzir não sequestra o relógio no pulso');
  ok(/_haptic\s*&&\s*!_replay/.test(bui), 'sem vibração a cada ponto reproduzido');

  console.log('\n2. Uma tela só (o replay não redesenha placar por conta própria)');
  ok(!/_placarHtml|mr-placar|match-replay-overlay/.test(rep),
     'match-replay.js não tem mais overlay nem desenho de placar próprios');
  ok(/_openLiveScoring/.test(rep), 'ele delega pro placar ao vivo');
  ok(/replay:\s*rep/.test(rep), 'passando o diário como opts.replay');
  // A regra que a 1.9.59 pagou caro: quem desenha em tela cheia é quem ESTÁ em tela
  // cheia. Com uma tela só, o replay é o próprio placar — não há um segundo overlay
  // pra pendurar no lugar errado.
  ok(!/appendChild\(ov\)/.test(rep),
     'não há segundo overlay pra pendurar fora do escopo desenhado (a causa da 1.9.59)');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { falhas++; console.log('  ✗ erro de página: ' + e.message); });
  await page.goto('file://' + path.join(__dirname, 'replay-harness.html'));

  // ── 3. JOGA a partida de verdade e deixa o app gravar o registro ────────────
  console.log('\n3. Joga a partida no placar ao vivo e grava o registro');
  const jogo = await page.evaluate((pts) => {
    localStorage.clear();
    const cfg = window._resolveLiveScoring({}, 'Beach Tennis');
    window._openLiveScoring(null, null, {
      casual: true, p1Name: 'Ana / Bruno', p2Name: 'Caio / Dani',
      isDoubles: true, scoring: cfg, sportName: 'Beach Tennis'
    });
    // Sacador escolhido como na quadra. ⚠️ São DOIS eventos (selecionar + confirmar),
    // igual aos vetores de paridade do relógio — `_liveSetServer` sozinho NÃO fecha a
    // Tela 2 (quem levanta `secondServerPicked` é o confirmar), e a partida ficaria
    // parada no 1º game esperando alguém confirmar.
    const escolheSacador = () => {
      const st = window._getLiveScoreState();
      if (!st.servePickOpen) return;
      const elig = st.serveEligible || [];
      if (!elig.length) return;
      window._liveServeSelect(elig[0].team, elig[0].playerIdx);
      window._liveServeConfirm();
    };
    escolheSacador();                     // Tela 1: quem abre o saque
    for (const w of pts) {
      let st = window._getLiveScoreState();
      // A pergunta de desempate (5-5) aparece no casual: responde tie-break, que é
      // o que a sequência exercita adiante.
      if (st.tieRulePending) { window._liveResolveTie('tiebreak'); st = window._getLiveScoreState(); }
      if (st.servePickOpen) escolheSacador();   // Tela 2: 2º sacador, entre o 1º e o 2º game
      window._liveScorePoint(w);
    }
    const st = window._getLiveScoreState();
    window._liveScoreCloseStats();   // é este caminho que grava o registro
    const hist = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
    return { estado: st, registro: hist[0] || null, gravados: hist.length };
  }, sequencia());

  ok(!!jogo.registro, 'o app gravou o registro da partida');
  ok(jogo.estado.isFinished === true, 'a partida terminou de verdade');
  const r = jogo.registro && jogo.registro.replay;
  ok(!!r && Array.isArray(r.points) && r.points.length > 0, 'o registro tem o diário ponto a ponto');
  ok(r && r.v === 2, 'o diário é v:2 (condições iniciais gravadas)');
  ok(!!(r && r.so && r.so.length), 'a ordem de saque foi gravada — é ela que faz o saque sair idêntico');
  ok(!!(r && r.scoring && r.scoring.type === 'sets'),
     'a regra EFETIVA da partida foi gravada (sem ela o replay adivinharia a contagem)');

  // ── 4. REPRODUZ pelo caminho público e compara com a partida jogada ─────────
  console.log('\n4. Reproduz o registro — mesma tela, mesmo motor');
  const rep1 = await page.evaluate((registro) => {
    window._registerMatchReplay('X', registro);
    window._openMatchReplayById('X');
    const ov = document.getElementById('live-scoring-overlay');
    return {
      abriu: !!ov,
      marcado: ov ? ov.getAttribute('data-replay') : null,
      barra: !!document.getElementById('live-replay-bar'),
      selo: (function () {
        var h = ov && ov.querySelector('span[style*="letter-spacing"]');
        return h ? h.textContent : '';
      })(),
      comecaEmZero: JSON.stringify(window._getLiveScoreState().games) === JSON.stringify([0, 0])
    };
  }, jogo.registro);

  ok(rep1.abriu, 'o replay abre o overlay DO PLACAR AO VIVO (não um overlay próprio)');
  eq(rep1.marcado, '1', 'o overlay se declara em modo reprodução (data-replay)');
  ok(rep1.barra, 'a barra de controle da reprodução está na tela');
  // O selo do cabeçalho é a única coisa que NÃO pode ser igual à partida ao vivo:
  // "AO VIVO" num jogo antigo é a tela afirmando um fato falso.
  ok(/REPLAY/.test(rep1.selo) && !/AO VIVO/.test(rep1.selo),
     'o cabeçalho diz REPLAY, não "AO VIVO"  (obtido: ' + JSON.stringify(rep1.selo) + ')');
  ok(rep1.comecaEmZero, 'a reprodução começa em 0-0 — ela REJOGA, não redesenha o fim');

  // Pular percorre o resto pelo MESMO caminho (ponto a ponto, pelo motor).
  const fim = await page.evaluate(() => {
    window._liveScoreReplaySkip();
    const st = window._getLiveScoreState();
    const lab = document.getElementById('lr-label');
    return {
      estado: st,
      rotulo: lab ? lab.textContent : '',
      hist: JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]').length
    };
  });

  console.log('\n5. O placar reproduzido é o placar da partida');
  // O snapshot comparado é o MESMO que os vetores de paridade dos 3 motores usam
  // (`_getLiveScoreState`) — é a noção de "mesmo estado" que este projeto já adota.
  eq(fim.estado.games, jogo.estado.games, 'os games do set final saem idênticos');
  eq(fim.estado.sets, jogo.estado.sets, 'os sets ganhos saem idênticos');
  eq(fim.estado.points, jogo.estado.points, 'o placar do game final sai idêntico');
  eq(fim.estado.winner, jogo.estado.winner, 'o vencedor é o mesmo');
  eq(fim.estado.isFinished, true, 'a reprodução chega ao fim da partida');
  eq(fim.estado.setLabel, jogo.estado.setLabel, 'terminou no mesmo set');
  // ⚠️ A conferência ponto a ponto contra a testemunha gravada é feita pelo CÓDIGO DE
  // PRODUÇÃO (`_replayConfere`), não re-derivada aqui — o que o teste cobra é que ela
  // tenha passado limpa. É essa conferência que impede uma mudança futura no motor de
  // reescrever, calada, o passado de uma partida já jogada.
  ok(!/divergiu/.test(fim.rotulo),
     'o motor não divergiu da testemunha gravada em nenhum ponto');
  ok(/fim da reprodução · \d+ pontos/.test(fim.rotulo),
     'a reprodução consumiu o diário inteiro');
  // A rotação de saque decide as estatísticas de saque/quebra do fim.
  eq(fim.estado.server, jogo.estado.server, 'quem sacava ao fim é o mesmo');

  console.log('\n6. Reproduzir NÃO escreve nada');
  eq(fim.hist, jogo.gravados, 'nenhum registro novo no histórico — o replay não gravou partida');

  // A tela de estatísticas do fim é a MESMA do placar ao vivo (o pedido do dono).
  const stats = await page.evaluate(() => {
    const c = document.getElementById('live-score-content');
    return { txt: c ? c.textContent : '', temMomentum: !!document.getElementById('mom-replay-btn') };
  });
  ok(stats.temMomentum,
     'o fim cai na tela de estatísticas DO PLACAR AO VIVO (o gráfico de momentum está lá)');

  // ── 7. Registro v:1 (1.8.79–1.9.59) continua reproduzindo ───────────────────
  console.log('\n7. Registro antigo (v:1, sem condições iniciais) ainda reproduz');
  const velho = await page.evaluate((registro) => {
    // Rebaixa o registro pro formato antigo: sem `so`, sem `scoring`, v:1 — que é
    // exatamente o que está gravado nas partidas de 1.8.79 até 1.9.59.
    const r = JSON.parse(JSON.stringify(registro));
    r.replay.v = 1; delete r.replay.so; delete r.replay.scoring; delete r.replay.serveSkipped;
    window._registerMatchReplay('V', r);
    window._openMatchReplayById('V');
    window._liveScoreReplaySkip();
    const lab = document.getElementById('lr-label');
    return { estado: window._getLiveScoreState(), rotulo: lab ? lab.textContent : '' };
  }, jogo.registro);
  eq(velho.estado.sets, jogo.estado.sets, 'v:1 chega ao mesmo placar');
  eq(velho.estado.winner, jogo.estado.winner, 'v:1 chega ao mesmo vencedor');
  ok(/saque aproximado/.test(velho.rotulo),
     'e DECLARA que o saque é aproximado (v:1 não gravou a ordem) em vez de fingir precisão');

  // ── 8. O CARD DE "ÚLTIMAS PARTIDAS" DISPARA A REPRODUÇÃO ────────────────────
  // Ordem do dono (28/ago/2026): _"nas partidas casuais, nas últimas partidas, clicar
  // em uma delas deve disparar o replay da partida"_. Antes o card abria direto na
  // tela de estatísticas — o placar final sem o caminho até ele.
  //
  // ⚠️ O QUE ESTE BLOCO REALMENTE COBRA, e por que não é redundante com o item 4: o
  // card casual NÃO tem o `replay` compacto. Medido em produção (28/ago): das 15
  // partidas casuais, 13 têm `liveState.pointLog` (o diário CRU) e ZERO tem o campo
  // `replay`. Ou seja, este caminho passa por uma TRADUÇÃO que o item 4 não exercita.
  // O formato cru abaixo é transcrição do que está no banco, não invenção:
  //     team, server, serverTeam, p1Before, p2Before, isTiebreak, t  (+ g1,g2,si nos novos)
  //
  // ⭐ A asserção que impede a tradução de estar errada e passar: a reprodução tem que
  // chegar ao MESMO placar da partida que foi de fato jogada no item 3. Um mapeamento
  // trocado (w↔sv, a↔b) produz outro placar — o motor é quem confere, não o teste.
  console.log('\n8. Tocar o card de "Últimas Partidas" reproduz a partida');
  const casual = await page.evaluate((registro) => {
    // Monta o doc de `casualMatches` como ele existe no banco, a partir do diário da
    // partida jogada acima — reconstruindo o formato CRU do `liveState.pointLog`.
    const cru = registro.replay.points.map((p) => ({
      team: p.w, server: null, serverTeam: p.sv,
      p1Before: p.a, p2Before: p.b, isTiebreak: !!p.tb,
      g1: p.g1, g2: p.g2, si: p.si, t: p.t
    }));
    const doc = {
      _docId: 'doc1', roomCode: 'ABC123', status: 'finished',
      sport: 'Beach Tennis', isDoubles: true,
      players: registro.players,
      scoring: registro.replay.scoring,
      result: { winner: registro.winnerTeam },
      liveState: {
        pointLog: cru,
        sets: registro.sets,
        serveOrder: registro.replay.so.map((s) => ({ team: s.t, name: s.n })),
        serveSkipped: false
      }
    };
    window._casualPastMatchesCache = { ABC123: doc };
    const antesHist = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]').length;
    // ⚠️ Chama `_openCasualMatchReplay` e NÃO `_casualOpenPastMatch`, e a razão é
    // estrutural: o handler do card é definido DENTRO de `window._openCasualMatch`,
    // então só passa a existir depois que a tela casual abre — fora dali ele é
    // `undefined` ([[feedback_funcao_dentro_de_outra_nao_existe]]). O que ele faz com
    // o doc é o que está sendo medido aqui; QUE ele chame isto está travado logo
    // abaixo, por varredura do fonte.
    const abriu = window._openCasualMatchReplay(doc);   // ← o que o clique do card faz
    const ov = document.getElementById('live-scoring-overlay');
    const abriuComoReplay = ov ? ov.getAttribute('data-replay') : null;
    window._liveScoreReplaySkip();                    // corre até o fim
    const lab = document.getElementById('lr-label');
    return {
      retorno: abriu,
      abriuComoReplay: abriuComoReplay,
      barra: !!document.getElementById('live-replay-bar'),
      estado: window._getLiveScoreState(),
      rotulo: lab ? lab.textContent : '',
      hist: JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]').length,
      antesHist: antesHist,
      temMomentum: !!document.getElementById('mom-replay-btn')
    };
  }, jogo.registro);

  // A FIAÇÃO: que o clique do card passe por aqui ANTES de cair na tela de stats.
  // É varredura de fonte de propósito — o handler é aninhado e não existe fora da tela
  // casual (ver a nota acima). O que ele FAZ está medido ao vivo logo abaixo.
  const handler = bui.slice(bui.indexOf('window._casualOpenPastMatch = function'),
                            bui.indexOf('window._casualOpenPastMatch = function') + 1800);
  ok(/_openCasualMatchReplay\(match\)\)\s*return;/.test(handler),
     'o clique do card tenta a REPRODUÇÃO antes de qualquer outro caminho');
  ok(handler.indexOf('_openCasualMatchReplay') < handler.indexOf('_openLiveScoring'),
     'e a tela de estatísticas ficou como FALLBACK, depois dela');
  ok(!/Toque pra ver as estatísticas/.test(bui),
     'o rótulo do card não promete mais "estatísticas" — ele descreve o que o toque faz');

  ok(casual.retorno === true, 'o abridor confirma que reproduziu (devolveu true)');
  ok(!!casual.abriuComoReplay, 'o card abre o placar em modo REPRODUÇÃO (não na tela de stats)');
  ok(casual.barra, 'a barra de controle da reprodução está na tela');
  eq(casual.estado.sets, jogo.estado.sets, 'a reprodução chega ao mesmo placar da partida jogada');
  eq(casual.estado.winner, jogo.estado.winner, 'e ao mesmo vencedor');
  ok(!/divergiu/.test(casual.rotulo),
     'o motor não divergiu da testemunha — a tradução do diário cru está certa ponto a ponto');
  eq(casual.hist, casual.antesHist, 'reproduzir pelo card não gravou partida nenhuma');
  ok(casual.temMomentum, 'e desemboca na tela de estatísticas — o que o card fazia antes vira o DESTINO');

  // ── 9. Partida SEM diário continua abrindo as estatísticas ──────────────────
  // Medido: 2 das 15 partidas casuais em produção não têm `pointLog` (anteriores ao
  // diário). Para essas não há o que reproduzir, e abrir uma reprodução vazia seria
  // pior que o comportamento antigo — então elas seguem exatamente como eram.
  console.log('\n9. Partida antiga (sem diário) NÃO vira reprodução vazia');
  const semDiario = await page.evaluate(() => {
    const vazio = { _docId: 'd2', roomCode: 'NOLOG', status: 'finished', players: [],
                    liveState: { pointLog: [], sets: [] } };
    return {
      converteu: window._replayRecordFromCasualDoc(vazio),
      abriu: window._openCasualMatchReplay(vazio),
      semLiveState: window._replayRecordFromCasualDoc({ roomCode: 'X', status: 'finished' })
    };
  });
  eq(semDiario.converteu, null, 'sem pointLog a conversão devolve null (não um replay de 0 pontos)');
  eq(semDiario.abriu, false, 'e o abridor devolve false — quem chama cai no caminho antigo');
  eq(semDiario.semLiveState, null, 'doc sem liveState nenhum também devolve null, sem estourar');

  await browser.close();
  console.log(falhas === 0
    ? '\n✅ o replay é o placar ao vivo — e não grava nada\n'
    : '\n❌ ' + falhas + ' falha(s)\n');
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
