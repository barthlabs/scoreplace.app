// Ponte relógio ↔ celular (fase 4) — lado JS, fonte única de verdade.
// Contrato em docs/smartwatch-bridge.md. Arquitetura Opção A: o relógio é burro;
// aqui é onde a intenção (+1 / desfazer) dirige o motor GSM real do placar ao
// vivo (bracket-ui.js) e o estado resultante é empurrado de volta pro relógio.
//
// INERTE NA WEB: se não estamos num app nativo (Capacitor), o módulo faz
// early-return e NÃO define window.WatchBridge — então o gancho _watchNotify no
// motor (bracket-ui.js) vira no-op de custo zero. Zero efeito no placar do
// navegador. Só "liga" no app iOS/Android.
(function () {
  'use strict';

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  var seq = 0;
  // ÉPOCA da sessão: identifica ESTA carga da WebView. O `seq` zera a cada
  // recarga do app — e a regra antiga do relógio ("queda ≥ 20 = contador
  // reiniciou") tinha um buraco: com lastSeq pequeno (partida curta), a queda
  // ficava < 20 e TODO snapshot novo era descartado até o contador alcançar o
  // valor antigo — o relógio congelava na tela de fim de set mesmo com jogo
  // novo rolando no celular (incidente de 13/ago/2026). Com a época no
  // snapshot, o relógio compara: época diferente = app recarregou → aceita e
  // zera o lastSeq; mesma época = seq monotônico normal.
  var epoch = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var subscribers = [];
  var lastBody = null;      // último snapshot enviado (sem seq) pra dedup
  var seenIntents = {};     // dedup de intenções por id
  var seenCount = 0;

  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins
      && window.Capacitor.Plugins.ScoreplaceWatch) || null;
  }

  // Sem placar ao vivo aberto. Mas se a MONTAGEM da partida casual está no ar,
  // o relógio pode iniciá-la — então mandamos canStart + os nomes do lobby, e
  // ele troca "Aguardando…" por "Iniciar". Antes não havia como começar uma
  // partida sem pegar o celular.
  function inactiveState() {
    var s = { v: 1, type: 'state', active: false, isFinished: false, winner: null, canStart: false };
    if (typeof window._getCasualSetupState === 'function') {
      try {
        var setup = window._getCasualSetupState();
        if (setup && setup.canStart) {
          s.canStart = true;
          s.sportName = setup.sportName || '';
          s.isDoubles = !!setup.isDoubles;
          s.teams = setup.teams || {};
          // A montagem SÓ existe pra partida casual — sem este campo o relógio
          // desenhava 🏆 (torneio) no lugar de ⚡ na tela "Iniciar / 1º sacador".
          // O _getLiveScoreState já manda isCasual; o lobby tinha ficado de fora.
          s.isCasual = true;
        }
      } catch (e) {}
    }
    return s;
  }

  // Estado atual do motor, indexado por TIME (1/2). Se não há partida ao vivo
  // aberta, window._getLiveScoreState não existe → snapshot inativo.
  function currentState() {
    if (typeof window._getLiveScoreState === 'function') {
      try { return window._getLiveScoreState(); } catch (e) {}
    }
    return inactiveState();
  }

  // FC MÁXIMA pra o relógio saber em qual FAIXA DE QUEIMA (5 zonas) o batimento
  // está e pintar o box na cor da faixa. Fórmula clássica 220 − idade; a idade sai
  // do PERFIL (birthDate), que só existe aqui — o relógio é burro e nunca deriva
  // isso sozinho. Sem data de nascimento devolve 0, e o relógio simplesmente não
  // pinta faixa nenhuma (melhor não mostrar do que mostrar zona inventada).
  function hrMaxFromProfile() {
    try {
      var cu = window.AppStore && window.AppStore.currentUser;
      // FC máxima DECLARADA no perfil (v1.8.64) vence a fórmula: a Apple
      // personaliza as zonas do Atividade pela FC real da pessoa e não expõe
      // isso a terceiros — o campo do perfil é como o usuário calibra a régua.
      var declared = cu && parseInt(cu.hrMax, 10);
      if (declared && declared >= 100 && declared <= 230) return declared;
      var bd = cu && cu.birthDate;                 // ISO yyyy-mm-dd
      if (!bd) return 0;
      var p = String(bd).split('-');
      if (p.length < 3) return 0;
      var y = +p[0], m = +p[1], d = +p[2];
      if (!y || !m || !d) return 0;
      var now = new Date();
      var age = now.getFullYear() - y;
      if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
      if (age < 5 || age > 100) return 0;          // data absurda → não inventa zona
      return 220 - age;
    } catch (e) { return 0; }
  }

  // Empurra um snapshot pro relógio (via plugin) + assinantes locais.
  // Dedup pelo corpo (sem seq) pra não spammar snapshots idênticos; `force`
  // ignora o dedup (usado na resposta a "hello").
  function push(snapshot, force) {
    if (!snapshot) snapshot = currentState();
    // Carimbado ANTES do dedup pra fazer parte do corpo comparado.
    if (!snapshot.hrMax) snapshot.hrMax = hrMaxFromProfile();
    snapshot.epoch = epoch;   // constante nesta carga da WebView (ver topo)
    var body = JSON.stringify(snapshot);
    if (!force && body === lastBody) return;
    lastBody = body;
    snapshot.seq = ++seq;
    var p = plugin();
    if (p && p.sendState) {
      try { p.sendState({ snapshot: snapshot }); } catch (e) {}
    }
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](snapshot); } catch (e) {}
    }
  }

  // 1º sacador escolhido NO RELÓGIO enquanto ainda estávamos na montagem (o placar
  // não existia, então _liveSetServer ainda não). Aplicado no `start`.
  var _pendingServerPick = null;

  // Fecha o fluxo do "Iniciar pelo relógio": o celular abre "Quem saca primeiro?" e
  // espera confirmação — sem ela o serveOrder fica vazio e a partida não anda. Aplica
  // a escolha do relógio (se houve) e confirma, usando as MESMAS funções do celular.
  // O placar abre de forma assíncrona (render), então tenta por ~1s.
  function _confirmServeFromWatch(tries) {
    if (tries > 12) { _pendingServerPick = null; return; }
    setTimeout(function () {
      if (typeof window._liveServeConfirm !== 'function') { _confirmServeFromWatch(tries + 1); return; }
      try {
        if (_pendingServerPick && typeof window._liveServeSelect === 'function') {
          window._liveServeSelect(_pendingServerPick.team, _pendingServerPick.idx);
        }
        window._liveServeConfirm();
      } catch (e) {}
      _pendingServerPick = null;
      push(currentState(), true);   // relógio recebe o estado JÁ com sacador definido
    }, 80);
  }

  // Recebe uma intenção do relógio e dirige o motor GSM (nunca duplica regra).
  function applyIntent(intent) {
    if (!intent || typeof intent !== 'object') return;
    if (intent.id) {
      if (seenIntents[intent.id]) return;
      seenIntents[intent.id] = 1;
      if (++seenCount > 500) { seenIntents = {}; seenCount = 0; } // bound
    }
    switch (intent.type) {
      case 'point':
        if ((intent.team === 1 || intent.team === 2)
            && typeof window._liveScorePoint === 'function') {
          window._liveScorePoint(intent.team);
        }
        break;
      case 'undo':
        if (typeof window._liveScoreUndoLastPoint === 'function') {
          window._liveScoreUndoLastPoint();
        }
        break;
      case 'close':
        // ENCERRAR tocado no relógio (v1.7.67). Relato do dono: "quando clicamos
        // encerrar ao final da partida deveria voltar para a tela de configuração
        // no celular e o relógio voltar para a espera, mas o relogio fica travado
        // na tela de resultado da ultima partida".
        // A causa era estrutural: o botão só mexia em estado LOCAL do relógio
        // (`replayDismissed`) — nos DOIS sistemas, watchOS e Wear — e esta
        // intenção não existia, então a ordem não tinha por onde chegar aqui.
        // Fecha sem diálogo (o toque no relógio já é a confirmação) e o teardown
        // do fechamento empurra o estado inativo, que devolve o relógio à espera.
        if (typeof window._liveScoreCloseFromWatch === 'function') {
          window._liveScoreCloseFromWatch();
        }
        break;
      case 'replay':
        // "Jogar novamente" (casual) — já confirmado no relógio, pula o
        // diálogo do celular. intent.shuffle: re-sortear as duplas (true) ou
        // manter os mesmos times (false).
        if (typeof window._liveScoreRestart === 'function') {
          window._liveScoreRestart(true, !!intent.shuffle);
        }
        break;
      case 'resolveTie':
        // v4.5.43: empate 5-5/6-6/7-7… — o relógio escolheu prorrogar
        // (intent.rule='extend') ou tie-break ('tiebreak'). Dirige a MESMA
        // função do celular; a recorrência acontece no motor (prorrogar mantém
        // 'ask' → pergunta de novo no próximo empate).
        if ((intent.rule === 'extend' || intent.rule === 'tiebreak')
            && typeof window._liveResolveTie === 'function') {
          window._liveResolveTie(intent.rule);
        }
        break;
      case 'start':
        // "Iniciar" no relógio — dispara a MESMA função do botão do celular.
        // Só existe enquanto a montagem está aberta (canStart no snapshot).
        //
        // MAS iniciar não bastava: o celular abre a tela "Quem saca primeiro?" e FICA
        // PARADO nela esperando um toque que só existe lá. O relógio, que já tinha
        // escolhido o 1º sacador na própria tela "Iniciar", pulava pro placar — e a
        // partida NUNCA começava de verdade (serveOrder vazio ⇒ sem sacador ⇒ sem a
        // bolinha no nome). Era o "o início pelo relógio não aconteceu" do relato.
        // Agora o start APLICA a escolha do relógio e CONFIRMA a tela, fechando o fluxo.
        if (typeof window._casualStart === 'function') {
          window._casualStart();
          _confirmServeFromWatch(0);
        }
        break;
      case 'rrNext':
        // Rei/Rainha: avança pro próximo jogo da série de 3 (rotaciona as duplas
        // e zera o placar). Dirige a MESMA função do botão do celular — a
        // rotação e a contagem de vitórias vivem lá, nunca aqui.
        if (typeof window._reiRainhaNextRound === 'function') {
          window._reiRainhaNextRound();
        }
        break;
      case 'rrFinal':
        // Rei/Rainha: encerra a série e mostra a classificação final.
        if (typeof window._reiRainhaShowFinal === 'function') {
          window._reiRainhaShowFinal();
        }
        break;
      case 'rrActivate':
        // Sugestão de Rei/Rainha aceita no fim de jogo (toggle "👑 Rei/Rainha" +
        // Iniciar): ativa a série RETROATIVA (os 2 jogos já disputados viram
        // rodadas) e avança pro 3º jogo (par que falta). Reusa as MESMAS funções
        // do celular — a rotação/contagem vive lá, nunca aqui.
        if (typeof window._statsToggleReiRainha === 'function') {
          window._statsToggleReiRainha({ checked: true });
          if (typeof window._reiRainhaNextRound === 'function') {
            window._reiRainhaNextRound();
          }
        }
        break;
      case 'setServer':
        // Escolha do sacador nos 2 primeiros jogos (o equivalente no relógio ao
        // arrastar a bola no celular). Dirige a MESMA função — o hard lock de
        // "após 2 jogos ninguém muda" vive lá, nunca aqui.
        if ((intent.team === 1 || intent.team === 2) && typeof intent.playerIdx === 'number') {
          if (typeof window._liveSetServer === 'function') {
            window._liveSetServer(intent.team, intent.playerIdx);
          } else {
            // Ainda no LOBBY: o placar não abriu, então _liveSetServer nem existe e a
            // escolha do relógio caía no vazio. Guarda pra aplicar no `start`.
            _pendingServerPick = { team: intent.team, idx: intent.playerIdx };
          }
        }
        break;
      case 'hello':
        push(currentState(), true); // sempre responde, mesmo se igual
        return;
      default:
        return;
    }
    // point/undo já chamam _watchNotify no motor (→ push). Reforço defensivo
    // caso algum caminho não notifique; o dedup evita envio duplicado.
    push(currentState());
  }

  window.WatchBridge = {
    _onEngineState: function (snapshot) { push(snapshot); }, // chamado pelo motor
    applyIntent: applyIntent,
    currentState: currentState,
    pushCurrent: function () { push(currentState(), true); },
    pushInactive: function () { push(inactiveState(), true); }, // placar fechou
    onState: function (cb) { if (typeof cb === 'function') subscribers.push(cb); }
  };

  // Intenções vindas do plugin nativo (quando ele existir). Guardado: o plugin
  // ScoreplaceWatch será adicionado no próximo commit; até lá isto é inerte.
  var p = plugin();
  if (p && p.addListener) {
    try {
      p.addListener('watchIntent', function (ev) {
        applyIntent(ev && ev.intent ? ev.intent : ev);
      });
    } catch (e) {}
  }
})();
