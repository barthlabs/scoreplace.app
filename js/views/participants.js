// ─── Participants View ────────────────────────────────────────────────────────
var _t = window._t || function(k) { return k; };

// ── Funções globais de check-in (disponíveis para qualquer view) ──
// v0.17.33: adicionado suporte a #bracket/ — Lista de Espera vive em
// bracket.js e o toggle Presente daí precisa re-renderizar a view de
// bracket pra atualizar o label "Ausente"/"Presente" (CSS reactive já
// flipa o toggle visual via :checked, mas o texto vem do render).
function _reRenderParticipants() {
  const hash = window.location.hash;
  const container = document.getElementById('view-container');
  if (!container) return;
  if (hash.startsWith('#participants/')) {
    const id = hash.split('/')[1];
    renderParticipants(container, id);
  } else if (hash.startsWith('#tournaments/')) {
    const id = hash.split('/')[1];
    if (typeof renderTournaments === 'function') renderTournaments(container, id);
  } else if (hash.startsWith('#bracket/')) {
    const id = hash.split('/')[1];
    // _rerenderBracket (NUNCA renderBracket cru): preserva o scroll ancorado no card
    // visível (restore síncrono + trava de altura) e suprime o soft-refresh seguinte
    // — o renderBracket cru fazia a tela PULAR ao clicar em Cheguei/W.O. no bracket.
    if (typeof window._rerenderBracket === 'function') window._rerenderBracket(id);
    else if (typeof renderBracket === 'function') renderBracket(container, id);
  }
}

// v1.3.80: re-render ESTÁVEL da tela de inscritos — MESMO caminho robusto do card estático (in-place),
// pros casos em que o in-place não se aplica (painel de check-in pós-sorteio, cujos cards não têm
// data-card-key). Preserva o scroll E suprime o eco do onSnapshot (o próprio write echoa → re-render
// com dado stale → "presente vira ausente, tem que clicar 3x" + pulinho). É a ÚNICA saída de re-render
// que os handlers de presença usam, pra que TODO caminho (individual, dupla, W.O. indiv/time) seja
// robusto igual. Dono (20/jul): "o caminho deve ser um só, robusto".
function _reRenderParticipantsStable() {
  var _y = 0;
  try { _y = window.scrollY || window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0; } catch (_e) {}
  // TRAVA DE ALTURA (mesma técnica do _rerenderBracket): `renderParticipants` faz
  // container.innerHTML = '' antes de repintar → o documento COLAPSA por 1 frame → o browser
  // clampa o scroll pra cima → o restore traz de volta = "sobe uma linha e desce rapidinho".
  // Segurar a altura atual do container durante o rebuild impede o colapso → zero pulinho.
  var _container = document.getElementById('view-container');
  var _lockH = 0;
  try { if (_container) _lockH = _container.offsetHeight; } catch (_e) {}
  if (_container && _lockH) { try { _container.style.minHeight = _lockH + 'px'; } catch (_e) {} }
  window._suppressSoftRefresh = true;
  clearTimeout(window._presenceRefreshRelease);
  window._presenceRefreshRelease = setTimeout(function () { window._suppressSoftRefresh = false; }, 1600);
  var _restore = function () { try { window.scrollTo(0, _y); } catch (_e) {} };
  var _solto = false;
  // enquanto esta trava está posta, ELA é a dona da altura do container —
  // `_autoKeepScroll` (store.js) não mexe. Ver o comentário lá.
  window._travaAlturaExterna = true;
  var _unlock = function () {
    if (_solto) return; _solto = true;
    window._travaAlturaExterna = false;
    try { var c = document.getElementById('view-container'); if (c) c.style.minHeight = ''; } catch (_e) {}
  };
  // ⚠️ A LISTA PASSOU A CHEGAR EM FATIAS → a trava de altura só sai quando a ÚLTIMA
  // entrar. Soltar nos 2 quadros de sempre encontraria o documento ainda CURTO (a lista
  // do Confra mede 15.600px; a 1ª fatia, ~1.400px): ele encolheria, o navegador clamparia
  // o scroll pra cima e o "sobe uma linha e desce rapidinho" voltaria — agora em tamanho
  // grande, porque falta muita lista. O gancho é lido por `renderParticipants` e disparado
  // quando a última fatia entra.
  window._inscritosPinturaCompleta = function () { _restore(); _unlock(); };
  _reRenderParticipants();
  // v1.3.92: acabou de re-renderizar com o estado atual → adianta a assinatura pro eco tardio do
  // snapshot ver "igual" e NÃO re-renderizar de novo (o pulinho que sobrava no fallback).
  try {
    var _tSig = window._findTournamentById && window._findTournamentById((window.location.hash || '').split('/')[1]);
    if (_tSig && window._participantsViewSig) window._pdetailSig = window._participantsViewSig(_tSig);
  } catch (_eSig) {}
  _restore();
  // rede OBRIGATÓRIA: trava de altura presa é pior que pulinho. Se a pintura não
  // completar (erro no meio, troca de tela, gancho engolido), solta assim mesmo.
  setTimeout(function () { _restore(); _unlock(); }, 4000);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () {
      _restore();
      requestAnimationFrame(function () {
        _restore();
        // ⚠️ PISO DE 2 QUADROS, como sempre foi. Só a espera pela última fatia é nova, e
        // ela vale SÓ quando há fatia em voo: um render que sai pelo caminho curto
        // (torneio não encontrado, lista vazia, seções de duplas) nunca chama o gancho —
        // sem este piso a trava ficaria posta segurando o documento até a rede de 4s.
        if (typeof window._inscritosPintandoEmFatias !== 'function' || !window._inscritosPintandoEmFatias()) _unlock();
      });
    });
  } else { _unlock(); }
}
window._reRenderParticipantsStable = _reRenderParticipantsStable;

// ─────────────────────────────────────────────────────────────────────────────
// A LISTA DE INSCRITOS CHEGA EM FATIAS — e a PRIMEIRA já preenche a tela
//
// Proposta do dono: _"renderizar em blocos — não precisa entregar os últimos jogos
// que vai ter que scrollar até lá; fica aceitável um processamento enquanto se lê
// ou digita"_.
//
// MEDIDO no Confra (111 inscritos, 390×844, Chromium):
//   • `renderParticipants` inteiro: 34,5ms  • `_partApplyFilter`: 25ms
//   • montar as strings dos cards ≈ 24ms; enfiar no DOM ≈ 10ms
//   • cabem 4 cards na tela (118px cada) — os outros 107 são trabalho que ninguém vê
// Fatiar leva a PRIMEIRA pintura de ~34,5ms pra ~4ms, porque tanto o montar quanto o
// enfiar passam a ser só do que se vê. O trabalho TOTAL é o mesmo; o que muda é quando.
//
// ⚠️ AS TRÊS ARMADILHAS QUE ESTA FUNÇÃO EXISTE PRA NÃO CAIR:
//
// 1. ⛔ NADA DE `content-visibility`. Ele reserva ESPAÇO e não entrega conteúdo: a
//    lista "vem cortada" ao rolar e o 1º toque é engolido (subárvore pulada não tem
//    layout nem atende o dedo). Está proibido no app inteiro e há teste recusando a
//    declaração ativa. A fatia entrega card REAL, nunca retângulo vazio.
//
// 2. ⛔ NUNCA DEPENDER DE UM AGENDADOR SÓ. `requestAnimationFrame` não dispara em aba
//    de fundo — e no painel de navegador ele pode não disparar NUNCA. Sem rede dupla, a
//    pessoa ficaria com 20 de 143 inscritos PRA SEMPRE, com a tela afirmando 143. Uma
//    lista incompleta que se diz completa é pior que uma lista lenta. Por isso rAF E
//    timeout, com trava `feito` (o que vier primeiro pinta, uma vez só) e a porta
//    síncrona `_flushInscritosPaint` pra quem precisa da lista inteira agora.
//
// 3. ⚠️ A FATIA 1 ACOMPANHA O SCROLL. Quem re-renderiza no meio da lista (marcar
//    presença com a tela em 8.000px) tem o scroll restaurado pra lá — entregar só os 20
//    primeiros deixaria BRANCO exatamente onde a pessoa está olhando. Por isso o corte
//    é medido a partir da posição ATUAL (+2,5 telas de folga): no topo dá ~20 cards, no
//    meio da lista dá quase tudo, e no fim dá tudo. Uma regra só, sem ramo.
//
// A ordem NÃO muda por causa disto: medido, a ordem natural de montagem já é idêntica à
// que `_partApplyFilter` produz (0 cards trocam de lugar), então anexar no fim é a mesma
// lista — não há remexida enquanto se lê.
// ─────────────────────────────────────────────────────────────────────────────
var _inscritosPend = [];
// ⚠️ CADA PINTURA TEM IDENTIDADE. Sem isto, as fatias ainda em voo de um render anterior
// anexam no grid do render NOVO (mesmo id) e a lista sai DUPLICADA — medido: 178 cards
// numa lista de 111, ao re-renderizar enquanto a pintura anterior não tinha terminado
// (dois toques seguidos em Presente fazem exatamente isso). Quem não é da geração atual
// desiste em silêncio: quem assumiu a tela cuida dela.
var _fatiaGeracao = 0;
window._inscritosNovaGeracao = function () { return ++_fatiaGeracao; };
window._inscritosGeracaoAtual = function () { return _fatiaGeracao; };
// Descarga síncrona: termina AGORA o que estiver pendente. É o que o teste headless usa
// (lá rAF/timeout são de mentira) e a rede pra quem precisa da lista completa no mesmo
// instante. Drena em laço porque cada fatia agenda a seguinte.
window._inscritosPintandoEmFatias = function () { return _inscritosPend.length > 0; };
window._flushInscritosPaint = function () {
  var giros = 0;
  while (_inscritosPend.length && giros++ < 500) {
    var f = _inscritosPend.shift();
    try { f(); } catch (e) {}
  }
};

// Quantos cards a 1ª fatia precisa levar pra cobrir o que se VÊ agora + 2,5 telas.
// Conservador de propósito: errar pra mais custa alguns ms; errar pra menos deixa
// buraco branco na tela.
function _inscritosPrimeiraFatia(total) {
  var vh = 800, y = 0, larg = 0;
  try { vh = window.innerHeight || 800; } catch (e) {}
  try { y = window.scrollY || window.pageYOffset || 0; } catch (e) {}
  try { var c = document.getElementById('view-container'); larg = c ? c.clientWidth : 0; } catch (e) {}
  var colunas = Math.max(1, Math.floor((larg || 390) / 240));   // o grid é minmax(240px,1fr)
  var ALTURA = 110;                                             // medido: 118px; 110 sobra a favor
  var precisa = Math.ceil((y + vh * 2.5) / ALTURA) * colunas;
  return Math.max(colunas * 6, Math.min(total, precisa));
}

// Anexa o RESTO da lista em lotes, um por quadro, dentro do grid que já está na tela.
// `jaNaTela` = quantos a 1ª fatia levou. `aoCompletar` roda UMA vez, quando o último
// card entrou — é lá que mora tudo que lê o DOM inteiro (filtro/ordenação, hidratação
// de nomes, fotos) e a soltura da trava de altura.
function _pintarInscritosEmFatias(gridId, itens, montaCard, jaNaTela, aoCompletar, geracao) {
  var i = jaNaTela;
  var LOTE = 24;
  var encerrar = function () { if (typeof aoCompletar === 'function') { try { aoCompletar(); } catch (e) {} } };
  if (!itens || i >= itens.length) { encerrar(); return; }
  var agenda;
  var passo = function () {
    // outro render assumiu a tela → esta pintura não tem mais dono (e anexar agora
    // duplicaria a lista dele)
    if (geracao !== _fatiaGeracao) return;
    var grid = document.getElementById(gridId);
    // a tela trocou (outra rota) → nada a fazer
    if (!grid) { encerrar(); return; }
    var fim = Math.min(itens.length, i + LOTE);
    var html = '';
    for (var k = i; k < fim; k++) {
      try { html += montaCard(itens[k], k); } catch (e) {}
    }
    try { grid.insertAdjacentHTML('beforeend', html); }
    catch (e) { if (window._error) window._error('[Inscritos] fatia:', e); }
    i = fim;
    if (i < itens.length) agenda(); else encerrar();
  };
  agenda = function () {
    var feito = false;
    var uma = function () {
      if (feito) return; feito = true;
      var ix = _inscritosPend.indexOf(uma); if (ix >= 0) _inscritosPend.splice(ix, 1);
      passo();
    };
    _inscritosPend.push(uma);
    try { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(uma); } catch (e) {}
    try { if (typeof setTimeout === 'function') setTimeout(uma, 32); } catch (e) {}
  };
  agenda();
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.0.87-beta: REDE DE SEGURANÇA — _processWoSubstitutions
// User: 'continua falhando em algum ponto. tem gente presente na lista de espera,
// mas ao colocar o WO a pessoa não é substituida no jogo (fica vermelha no jogo).
// arrume isso nem que seja colocando um loading até que o banco de dados esteja
// seguro de funcionar como se deve.'
//
// Função IDEMPOTENTE que processa TODAS as substituições pendentes a partir do
// estado FRESH do AppStore. Lê t.absent + t.checkedIn + t.standbyParticipants +
// t.waitlist + matches diretamente — sem closure, sem race. Pode ser chamada
// 1x ou 100x: efeito é o mesmo (só roda sub se ainda há absent sem replacedBy
// no match correspondente). Usa-se como rede de segurança em todo ponto onde
// estado pode ter mudado.
//
// Algoritmo:
// 1. Pra cada absent em t.absent
// 2. Achar o match onde o absent ainda está no team (não foi substituído)
// 3. Se Presente standby disponível → substituir
// 4. Atualizar match + partsArr + waitlists + checkedIn + woHistory
// 5. Sync no fim se houve qualquer mutação
// ─────────────────────────────────────────────────────────────────────────────
// Wrapper (fetch por tId + save) — pros callers que só têm o id e persistem
// direto (ex.: auto-sub do _toggleCheckIn). O núcleo PURO (_applyWoSubsToTournament)
// opera sobre o `t` passado, SEM fetch e SEM save, então é transaction-safe e
// reusável dentro de commitTournamentTx/AppStore.mutate (Fase B da blindagem).
window._processWoSubstitutions = function(tId) {
  const t = window._findTournamentById(tId);
  if (!t) return { ok: false, reason: 'no-tournament' };
  const r = window._applyWoSubsToTournament(t);
  if (r && r.subCount > 0) {
    // BLINDAGEM (project_concurrency_safe_saves): re-aplica as substituições no doc
    // FRESCO via portão (o núcleo é idempotente — absent já substituído = no-op), em
    // vez de syncImmediate (doc inteiro → lost-update com check-in/resultado concorrente).
    if (window.AppStore && typeof window.AppStore.mutate === 'function') {
      window.AppStore.mutate(tId, function (ft) { window._applyWoSubsToTournament(ft); });
    } else if (typeof window.AppStore.syncImmediate === 'function') window.AppStore.syncImmediate(tId);
    else window.AppStore.sync();
  }
  return r;
};

// ── O MOTOR DE W.O. MUDOU DE ARQUIVO (v1.8.0) ────────────────────────────────
// `_applyWoSubsToTournament` e `_applyWO` foram pra `js/views/wo-core.js`: são PURAS
// (mutam só o `t`, sem fetch/save/DOM) e precisavam sair desta VIEW pra poderem ser
// VENDORADAS pela Cloud Function — vendorar uma view arrastaria a interface junto.
// Mudança de endereço, não de comportamento. O wrapper `_processWoSubstitutions`
// (fetch+save) ficou aqui de propósito: ele é encanamento de cliente, não motor.


// v2.3.82: chokepoint de permissão da presença. Regras:
//   • organizador / co-org / árbitro confirmado → marca/retira de QUALQUER um;
//   • torneio com placar pelos participantes (resultEntry players/all) → o
//     jogador marca a PRÓPRIA presença, exigindo GPS no local pra MARCAR
//     presente (retirar a própria presença é livre);
//   • qualquer outro caso → bloqueado com aviso.
// O organizador sempre pode dar/retirar (cai no 1º caso).

// ─── Card de inscrito CANÔNICO — linha de ação (v3.0.88) ────────────────────
// Layout ÚNICO de TODO card de inscrito (individual, dupla, jogo sorteado), em
// qualquer lugar do programa:
//   • Linha 1: tipo de inscrição ("Inscrição Individual" / "...em Dupla" / badge
//     de lista de espera). Sozinha, completa, NÃO truncada por controles.
//   • Linha 2 (uma ABAIXO, alinhada à DIREITA): Presente/Ausente · toggle · W.O.
//     · 🗑️ remover — NESSA ORDEM. Sem chamada → só o 🗑️, no mesmo canto direito.
// Pôr a ação numa linha própria evita cobrir o nº de inscrição (marca d'água) e
// o texto do tipo. presenceGroupHtml DEVE vir na ordem: palavra + toggle + W.O.
// (o 🗑️ é passado à parte, em delBtnHtml, e fica sempre por último/à direita).
// v1.3.45: tipo (ex.: "Inscrição Individual") e ações (Presente/Ausente·toggle·W.O.·✕) na
// MESMA linha — tipo à esquerda, ações à direita (space-between). Economiza 1 linha por card
// (pedido do dono, recorrente). Degrada com graça: se não couber, a barra de ações quebra pra
// baixo (flex-wrap). CANÔNICO — as DUAS telas (participants + detalhe) passam por aqui.
window._inscritoActionRow = function (typeText, presenceGroupHtml, delBtnHtml) {
  var action = (presenceGroupHtml || '') + (delBtnHtml || '');
  if (!typeText && !action) return '';
  var typeSpan = '<div style="font-size:0.7rem;color:var(--text-muted);opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto;">' + (typeText || '') + '</div>';
  var actionSpan = action
    ? '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-shrink:0;flex-wrap:wrap;" onclick="event.stopPropagation();">' + action + '</div>'
    : '';
  return '<div style="margin-top:6px;display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;">' + typeSpan + actionSpan + '</div>';
};

// Feedback "salvando presença" no(s) card(s) do inscrito enquanto o write confirma (como o de
// formar dupla). A classe fica no ELEMENTO do card (sobrevive ao update in-place) → spinner ::after.
window._presenceCardBusy = function (key, on) {
  if (!key) return;
  try {
    var esc = String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // v1.5.8: card de DUPLA tem chave "pair:<uid1>~<uid2>" — o seletor exato nunca casava, e
    // marcar presença na chamada de duplas (SB Casais) não mostrava spinner nenhum. Agora o
    // card cuja chave CONTÉM a identidade da pessoa também entra (uid/nome não têm ~).
    var sel = '.participant-card[data-card-key="' + esc + '"], ' +
              '.participant-card[data-dupla-card="1"][data-card-key*="' + esc + '"]';
    var cards = document.querySelectorAll(sel);
    for (var i = 0; i < cards.length; i++) { if (on) cards[i].classList.add('presence-saving'); else cards[i].classList.remove('presence-saving'); }
  } catch (e) {}
};
// Marca busy e limpa quando a promise do write resolve (ou já, se não for promise).
window._presenceBusyUntil = function (key, done) {
  window._presenceCardBusy(key, true);
  var clear = function () { window._presenceCardBusy(key, false); };
  if (done && typeof done.then === 'function') done.then(clear, clear); else clear();
};

window._toggleCheckIn = function (tId, playerName, uid) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const user = window.AppStore && window.AppStore.currentUser;
  // uid only (dono, 18-jul): quando o render passa o uid, a presença é gravada/lida pela
  // chave-UID — homônimos não colidem mais. Sem uid (guest sem conta), cai no nome (exceção
  // canônica). _who é o objeto {uid} que _idMap* usa pra chavear por uid. playerName segue
  // só pro display/self-presence/notificação.
  const _who = uid ? { uid: uid, displayName: playerName } : playerName;

  // 1) Autoridade (org/co-org/árbitro): controla a presença de todos.
  if (window._canManagePresence && window._canManagePresence(t, user)) {
    return window._applyCheckInToggle(tId, playerName, uid);
  }

  // 2) Autopresença do PRÓPRIO participante (dono, jul/2026): disponível a QUALQUER inscrito —
  //    NÃO só nos torneios em que o participante lança o placar. Precisa ser o próprio nome.
  //    Verde = GPS confirma no local; azul = confirma fora do local (não bloqueia mais). Ver
  //    _applySelfPresence.
  const _canSelf = window._isMyOwnPlayerName && window._isMyOwnPlayerName(t, playerName, user);
  if (!_canSelf) {
    if (typeof showNotification === 'function') {
      showNotification('Presença', 'Só o organizador ou o árbitro pode marcar a presença de outra pessoa.', 'info');
    }
    return;
  }
  return window._applySelfPresence(tId, playerName, uid);
};

// Autopresença do PRÓPRIO participante — VERDE (presente, GPS no local) vs AZUL (confirmado,
// fora do local). Tocar de novo quando já verde/azul = SAIR. Só o VERDE (checkedIn) conta como
// presença; o AZUL (checkedInConfirmed) é um aviso "eu venho" que NÃO entra na % nem no sorteio.
window._applySelfPresence = function (tId, playerName, uid) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  const _who = uid ? { uid: uid, displayName: playerName } : playerName;
  const isGreen = window._idMapHas(t, t.checkedIn || {}, _who);
  const isBlue = window._idMapHas(t, t.checkedInConfirmed || {}, _who);
  if (isGreen || isBlue) {
    // Já marcado → tocar de novo = sair (remove verde E azul).
    var _mdOff = window.AppStore.mutate(tId, function (ft) {
      ft.checkedIn = ft.checkedIn || {}; ft.checkedInConfirmed = ft.checkedInConfirmed || {};
      window._idMapDel(ft, ft.checkedIn, _who);
      window._idMapDel(ft, ft.checkedInConfirmed, _who);
    });
    window._presenceBusyUntil(uid || playerName, _mdOff);
    _reRenderParticipantsStable();
    return;
  }
  if (typeof showNotification === 'function') {
    showNotification('📍 Verificando local…', 'Confirmando pelo GPS se você está no local.', 'info');
  }
  window._presenceCardBusy(uid || playerName, true); // spinner já durante o GPS + write
  window._isUserAtTournamentVenue(t).then(function (atVenue) {
    var _mdSelf = window.AppStore.mutate(tId, function (ft) {
      ft.checkedIn = ft.checkedIn || {}; ft.absent = ft.absent || {}; ft.checkedInConfirmed = ft.checkedInConfirmed || {};
      window._idMapDel(ft, ft.absent, _who);
      if (atVenue) { window._idMapSet(ft, ft.checkedIn, _who, Date.now()); window._idMapDel(ft, ft.checkedInConfirmed, _who); }
      else { window._idMapSet(ft, ft.checkedInConfirmed, _who, Date.now()); window._idMapDel(ft, ft.checkedIn, _who); }
    });
    window._presenceBusyUntil(uid || playerName, _mdSelf);
    if (typeof showNotification === 'function') {
      if (atVenue) showNotification('✅ Presente', 'O GPS confirmou você no local do torneio.', 'success');
      else showNotification('🔵 Presença confirmada', 'Você confirmou que vem. Ao chegar no local, vira "Presente" automaticamente.', 'info');
    }
    _reRenderParticipantsStable();
  });
};

// v1.3.46: atualiza a presença de UM card NO LUGAR (sem re-render da lista) → os cards ficam
// ESTÁTICOS ao marcar presença pré-sorteio (dono: "pulavam e voltavam"). Reconstrói só o card
// tocado via a FONTE ÚNICA _inscritoIndividualCard, com o ctx do último render. Retorna true se
// atualizou; false (→ fallback pro re-render completo) quando não dá: ctx ausente, card não
// achado, filtro muda a visibilidade, ou modo lista-de-espera (lateJoin) que DEVE reordenar.
window._updateCardPresenceInPlace = function (tId, uid, playerName) {
  try {
    var t = window._findTournamentById(tId); if (!t) return false;
    var stash = window._lastInscritoCardCtx;
    if (!stash || String(stash.tId) !== String(tId) || !stash.ctx) return false;
    var ctx = stash.ctx;
    if (ctx.lateJoin) return false;                            // espera reordena → re-render
    if (typeof ctx.cardPresence !== 'function') return false;  // sem presença → nada a fazer
    // v1.3.47: RECONSTRÓI a presença contra o `t` ATUAL (o snapshot troca o objeto de torneio;
    // o cardPresence do ctx guardado fechava sobre o `t` órfão → só a 1ª presença "pegava").
    if (typeof window._rollCallPresenceCtx === 'function' && window._lastRcOpts) {
      try {
        var _rc = window._rollCallPresenceCtx(t, window._lastRcOpts);
        var _merged = {};
        for (var _k in ctx) { if (Object.prototype.hasOwnProperty.call(ctx, _k)) _merged[_k] = ctx[_k]; }
        _merged.cardPresence = _rc.cardPresence;
        _merged.memberPresence = _rc.memberPresence;
        ctx = _merged;
      } catch (_eRc) {}
    }
    var key = String(uid || playerName || '');
    var _kEsc = (window.CSS && CSS.escape) ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
    var card = document.querySelector('.participant-card[data-card-key="' + _kEsc + '"]');
    if (!card) return false;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    var idx = parseInt(card.getAttribute('data-card-idx') || '', 10); if (isNaN(idx)) idx = 0;
    var p = null;
    for (var i = 0; i < parts.length; i++) {
      var pp = parts[i]; if (!pp) continue;
      if (uid && typeof pp === 'object' && pp.uid === uid) { p = pp; break; }
      var nm = (typeof pp === 'string') ? pp : (pp.displayName || pp.name || pp.email || '');
      if (!uid && nm === playerName) { p = pp; break; }
    }
    if (!p) return false;
    var pr = ctx.cardPresence(p);
    if (pr && pr.skip) return false;                           // filtro esconde/mostra → re-render
    var html = window._inscritoIndividualCard(t, p, idx, ctx);
    if (!html) return false;
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var fresh = tmp.firstElementChild; if (!fresh) return false;
    card.replaceWith(fresh);                                   // só ESTE card; os demais intactos
    if (typeof window._hydrateUidNames === 'function') { try { window._hydrateUidNames(fresh); } catch (_e) {} }
    try {
      var imgs = fresh.querySelectorAll('img[data-player-name]');
      imgs.forEach(function (img) { var n = (img.getAttribute('data-player-name') || '').toLowerCase(); var real = window._playerPhotoCache && window._playerPhotoCache[n]; if (real && real.indexOf('dicebear.com') === -1) img.src = real; });
    } catch (_e) {}
    return true;
  } catch (_e) { return false; }
};

// v1.3.83: atualiza no LUGAR o card do PAINEL de check-in pós-sorteio (grade rica per-person, que
// NÃO passa por _inscritoIndividualCard). Reconstrói SÓ o card tocado via o builder stashado no
// render (_lastPanelCardCtx) — preserva a FOTO (o builder lê _playerPhotoCache, não re-hidrata do
// zero → fim da "bola bege") e não faz full re-render (fim do pulinho). Guard de staleness: o
// builder fecha sobre o `t` do render; se um snapshot trocou o objeto (tRef !== t atual), o builder
// ficou órfão e não veria a mutação → retorna false (cai no re-render, que refaz o stash). Dono
// (SB Casais): "fotos somem, vira bola bege, e continua o pulinho — o caminho tem que ser um só".
window._updatePanelCardInPlace = function (tId, uid, playerName) {
  try {
    var stash = window._lastPanelCardCtx;
    if (!stash || String(stash.tId) !== String(tId) || typeof stash.build !== 'function' || !Array.isArray(stash.list)) return false;
    var t = window._findTournamentById(tId); if (!t) return false;
    if (stash.tRef && stash.tRef !== t) return false;                     // objeto trocado por snapshot → re-render
    if ((window._checkInFilter || 'all') !== stash.filter) return false;  // filtro mudou → visibilidade muda → re-render
    var ind = null;
    for (var i = 0; i < stash.list.length; i++) {
      var it = stash.list[i]; if (!it) continue;
      if (uid && String(it.uid || '') === String(uid)) { ind = it; break; }
      if (!ind && playerName && String(it.name || '') === String(playerName)) ind = it;
    }
    if (!ind) return false;
    var html = stash.build(ind);
    if (!html || !String(html).trim()) return false;                      // filtro escondeu este card → re-render
    var keyStr = String(ind.uid || ind.name || '');
    var _kEsc = (window.CSS && CSS.escape) ? CSS.escape(keyStr) : keyStr.replace(/["\\]/g, '\\$&');
    var card = document.querySelector('.participant-card[data-panel-card="1"][data-card-key="' + _kEsc + '"]');
    if (!card) return false;
    var tmp = document.createElement('div'); tmp.innerHTML = String(html).trim();
    var fresh = tmp.firstElementChild; if (!fresh) return false;
    card.replaceWith(fresh);                                              // só ESTE card; os demais intactos → sem pulinho
    try {
      var imgs = fresh.querySelectorAll('img[data-player-name]');
      imgs.forEach(function (img) { var n = (img.getAttribute('data-player-name') || '').toLowerCase(); var real = window._playerPhotoCache && window._playerPhotoCache[n]; if (real && real.indexOf('dicebear.com') === -1) img.src = real; });
    } catch (_e) {}
    if (typeof window._hydrateUidNames === 'function') { try { window._hydrateUidNames(fresh); } catch (_e) {} }
    return true;
  } catch (_e) { return false; }
};

// v1.3.48: FONTE ÚNICA do expansor pessoa→uid (identidade). Reusado pela contagem no render
// E pela barra de chamada in-place. A presença é gravada por uid; casar por nome (que cai pro
// email quando o inscrito grava só uid) NÃO bate. Ver [[project_id_maps_uid_keyed]].
window._expandParticipantWho = function (p) {
  if (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) {
    return [
      { uid: p.p1Uid || '', name: ((window._displayName && window._displayName(p.p1Uid || '', p.p1Name || '')) || p.p1Name || '') },
      { uid: p.p2Uid || '', name: ((window._displayName && window._displayName(p.p2Uid || '', p.p2Name || '')) || p.p2Name || '') }
    ];
  }
  if (p && typeof p === 'object' && p.uid) return [{ uid: p.uid, name: window._pName(p) }];
  var n = window._pName(p);
  if (n && n.indexOf('/') !== -1) return n.split('/').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return { uid: '', name: s }; });
  return n ? [{ uid: '', name: n }] : [];
};

// v1.3.48: barra de chamada (Presentes/Ausentes/Aguardando + %) recomputada POR UID a partir do
// `t` fresco. FONTE ÚNICA usada no render E no update in-place (o card estático não re-renderiza
// a lista, então a barra é atualizada separadamente). mode: 'rollcall' (parts) | 'postdraw'
// (parts + lista de espera) | 'checkin'. Casa presença por uid (não por nome/email).
window._rollCallBarHtml = function (tId, mode) {
  var t = window._findTournamentById(tId); if (!t) return '';
  var checkedIn = t.checkedIn || {}, absent = t.absent || {};
  var seen = {}, total = 0, present = 0, abs = 0;
  var _add = function (arr) {
    (arr || []).forEach(function (p) {
      (window._expandParticipantWho(p) || []).forEach(function (w) {
        var k = ((w.uid || w.name) || '').toLowerCase(); if (!k || seen[k]) return; seen[k] = 1;
        var who = w.uid ? { uid: w.uid, displayName: w.name } : w.name;
        var isAbs = window._idMapHas(t, absent, who);
        var isPres = !isAbs && window._idMapHas(t, checkedIn, who);
        total++; if (isPres) present++; else if (isAbs) abs++;
      });
    });
  };
  _add(Array.isArray(t.participants) ? t.participants : []);
  if (mode === 'postdraw') { _add((typeof window._getWaitlist === 'function') ? window._getWaitlist(t) : (t.standbyParticipants || [])); }
  var pending = total - present - abs;
  var pct = total > 0 ? Math.round(present / total * 100) : 0;
  var cf = window._checkInFilter || 'all';
  var tIdS = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var dot = function (key, dotC, bg, bd, fg, count, label) {
    var a = (cf === key);
    return '<button type="button" class="btn" title="' + label + ' (' + count + ')" onclick="event.stopPropagation();window._setCheckInFilter(\'' + tIdS + '\',\'' + key + '\')" style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:0.8rem;font-weight:800;cursor:pointer;line-height:1;flex-shrink:0;background:' + (a ? bg : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (a ? bd : 'rgba(255,255,255,0.12)') + ';color:' + (a ? fg : 'var(--text-main)') + ';"><span style="width:9px;height:9px;border-radius:50%;background:' + dotC + ';flex-shrink:0;display:inline-block;"></span>' + count + '</button>';
  };
  return '<div id="rollcall-bar" data-rc-mode="' + (mode || 'rollcall') + '" style="display:flex;align-items:center;gap:6px;margin-top:8px;margin-bottom:4px;flex-wrap:wrap;">'
    + dot('all', '#60a5fa', 'rgba(96,165,250,0.22)', 'rgba(96,165,250,0.6)', '#93c5fd', total, 'Todos')
    + dot('present', '#10b981', 'rgba(16,185,129,0.22)', 'rgba(16,185,129,0.6)', '#4ade80', present, 'Presentes')
    + dot('pending', '#a78bfa', 'rgba(167,139,250,0.22)', 'rgba(167,139,250,0.6)', '#c4b5fd', pending, 'Aguardando')
    + dot('absent', '#ef4444', 'rgba(239,68,68,0.22)', 'rgba(239,68,68,0.6)', '#f87171', abs, 'W.O.')
    + '<div title="' + present + ' de ' + total + ' presentes" style="flex:1;min-width:50px;height:9px;border-radius:6px;overflow:hidden;display:flex;background:rgba(167,139,250,0.35);"><div style="width:' + pct + '%;background:linear-gradient(90deg,#10b981,#4ade80);transition:width 0.3s;"></div></div>'
    + '<span style="font-size:0.76rem;color:#94a3b8;font-weight:700;white-space:nowrap;flex-shrink:0;">' + present + '/' + total + ' · ' + pct + '%</span>'
    + '</div>';
};

window._applyCheckInToggle = function (tId, playerName, uid) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  // uid only: chaveia a presença pelo uid quando o render o forneceu (homônimo não colide);
  // guest sem conta cai no nome. Ver _toggleCheckIn.
  const _who = uid ? { uid: uid, displayName: playerName } : playerName;
  const wasCheckedIn = window._idMapHas(t, t.checkedIn, _who);

  // Guard v2.2.8: jogadores na lista de espera por ausência devem ser reativados
  // via botão "Reverter" — toggle fica desabilitado na UI, isso é um safety net.
  if (!wasCheckedIn && window._idMapHas(t, t.absent, _who)) {
    const _pnFor = p => (typeof p === 'string' ? p : (p && (p.displayName || p.name || p.email || '')));
    const _inStandby = (Array.isArray(t.standbyParticipants) &&
      t.standbyParticipants.some(p => _pnFor(p) === playerName)) ||
      (Array.isArray(t.waitlist) &&
      t.waitlist.some(p => _pnFor(p) === playerName));
    if (_inStandby) {
      if (typeof showNotification === 'function') {
        showNotification('ℹ️', 'Use o botão "Reverter" para reativar este jogador da lista de espera.', 'info');
      }
      return;
    }
  }

  // v4.0.117: toggle de presença + auto-sub de W.O. ATÔMICOS pelo portão
  // AppStore.mutate (Fase B da blindagem). Antes eram DOIS saves crus (toggle
  // saveTournament + _processWoSubstitutions syncImmediate) → dois pontos de
  // lost-update. Agora ambos rodam no MESMO doc fresco da transação, usando o
  // núcleo PURO _applyWoSubsToTournament (sem save próprio). `_was` recomputado
  // do doc fresco decide o toggle; o toast da sub vem da execução LOCAL.
  // ⚠️ MUTATOR IDEMPOTENTE (v1.3.152) — CAUSA-RAIZ do "presença pulando e desmarcando sozinha".
  // O mutator era um TOGGLE que lia o estado do doc FRESCO e INVERTIA. Mas ele roda MAIS DE UMA VEZ:
  //   (a) AppStore.mutate aplica no objeto LOCAL e de novo no doc fresco da transação;
  //   (b) commitTournamentTx faz RETRY (até 5×) em conflito transiente, re-executando o mutator;
  //   (c) o próprio Firestore re-executa a função da transação em contenção.
  // Cada re-execução INVERTIA de novo → nº PAR de aplicações = volta a DESMARCADO. Marcando 16-24
  // pessoas em rajada a contenção sobe, os retries acontecem e presenças caem sozinhas.
  // Agora o ALVO é decidido UMA vez (estado no clique) e o mutator SETA esse alvo absoluto —
  // aplicar N vezes dá exatamente o mesmo resultado. Ver [[project_concurrency_safe_saves]].
  var _wantPresent = !wasCheckedIn;
  var _presTs = Date.now();
  let _subResult;
  // ── CAMINHO RÁPIDO: escrita POR CAMPO (v1.3.157) ─────────────────────────────────────────
  // MEDIDO no Firestore real: doc-inteiro em rajada PERDE marcações (23/25); por campo é 25/25,
  // mesmo com a CF gravando junto. Marcar presença não precisa reescrever o torneio inteiro.
  // Só cai na transação (doc inteiro) quando há AUSENTES — aí a substituição de W.O.
  // (_applyWoSubsToTournament) precisa mexer na chave. Ver [[project_concurrency_safe_saves]].
  var _kPres = (typeof window._idMapKey === 'function') ? window._idMapKey(t, _who) : null;
  var _presKey = _kPres ? (_kPres.uid || _kPres.name) : null;
  var _temAusentes = !!(t.absent && Object.keys(t.absent).length);
  var _fieldDone = null;
  var _viaCampo = !!(_presKey && !_temAusentes &&
    window.FirestoreDB && typeof window.FirestoreDB.setPresenceFields === 'function');
  if (_viaCampo) {
    // estado local otimista (idêntico ao do mutator), depois UM update de campo
    if (!t.checkedIn) t.checkedIn = {};
    if (!t.absent) t.absent = {};
    if (!t.checkedInConfirmed) t.checkedInConfirmed = {};
    if (_wantPresent) {
      window._idMapSet(t, t.checkedIn, _who, _presTs);
      window._idMapDel(t, t.absent, _who);
      window._idMapDel(t, t.checkedInConfirmed, _who);
    } else {
      window._idMapDel(t, t.checkedIn, _who);
    }
    var _dels = _wantPresent
      ? [{ map: 'absent', key: _presKey }, { map: 'checkedInConfirmed', key: _presKey }]
      : [{ map: 'checkedIn', key: _presKey }];
    var _sets = _wantPresent ? [{ map: 'checkedIn', key: _presKey, value: _presTs }] : [];
    // chave-nome legada (quando há uid) some junto — mesma migração do _idMapSet
    if (_kPres && _kPres.uid && _kPres.name && _kPres.name !== _kPres.uid) {
      _dels.push({ map: 'checkedIn', key: _kPres.name });
    }
    _fieldDone = window.FirestoreDB.setPresenceFields(tId, _sets, _dels)
      .catch(function (e) {
        if (window._error) window._error('[presença por campo] falhou', e);
        if (typeof showNotification === 'function') showNotification('⚠️ Presença não salva', (e && e.message) || 'Tente de novo.', 'warning');
      });
    if (window._dtrace) window._dtrace('presField', { quem: String(_presKey).slice(0, 10), alvo: _wantPresent ? 'presente' : 'fora', total: Object.keys(t.checkedIn || {}).length });
  }
  // ── INSTRUMENTAÇÃO (v1.3.155, diagnóstico do "presença pulando") ─────────────────────────
  // Conta QUANTAS VEZES o mutator roda para ESTE clique (local + doc fresco + retries) e mostra a
  // contagem de presentes ANTES/DEPOIS de cada execução. É a medição que faltava: em vez de
  // deduzir, vemos a trajetória real (write parcial? re-execução? doc que volta zerado?).
  var _runN = 0;
  var _mutateDone = _viaCampo ? _fieldDone : window.AppStore.mutate(tId, function (ft) {
    _runN++;
    var _mb = Object.keys(ft.checkedIn || {}).length;
    if (!ft.checkedIn) ft.checkedIn = {};
    if (!ft.absent) ft.absent = {};
    if (!ft.checkedInConfirmed) ft.checkedInConfirmed = {};
    if (!_wantPresent) {
      window._idMapDel(ft, ft.checkedIn, _who);
    } else {
      window._idMapSet(ft, ft.checkedIn, _who, _presTs);
      window._idMapDel(ft, ft.absent, _who);
      // v1.3.19: marcar PRESENTE (verde) tira o "Confirmado" (azul) — o organizador confirma
      // que a pessoa está no local, então o aviso remoto some.
      window._idMapDel(ft, ft.checkedInConfirmed, _who);
      const r = window._applyWoSubsToTournament(ft); // núcleo puro, sem save
      if (_subResult === undefined) _subResult = r;
    }
    if (window._dtrace) {
      window._dtrace('presMut', { run: _runN, quem: String(uid || playerName).slice(0, 10),
        alvo: _wantPresent ? 'presente' : 'fora', antes: _mb, depois: Object.keys(ft.checkedIn || {}).length });
    }
  });
  // contagem LOCAL logo após o clique (antes de qualquer snapshot) — âncora da comparação
  try {
    if (window._dtrace) {
      var _tLoc = window._findTournamentById(tId);
      window._dtrace('presLocal', { presentes: _tLoc ? Object.keys(_tLoc.checkedIn || {}).length : -1, runs: _runN });
    }
  } catch (_eTr) {}
  // feedback "salvando presença" no card até o write confirmar (como formar dupla).
  window._presenceBusyUntil(uid || playerName, _mutateDone);
  var _woSub = !!(_subResult && _subResult.ok && _subResult.subCount > 0);
  if (_woSub) {
    _subResult.subDetails.forEach(d => {
      if (typeof showNotification === 'function') {
        showNotification('✅ Substituição W.O.',
          `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`,
          'success');
      }
    });
  }
  // v1.3.82: registra a INTENÇÃO otimista (present/absent/none) deste jogador pra ela SOBREVIVER
  // a snapshots stale do Firestore (o listener troca o objeto inteiro) até o write confirmar —
  // fim do "clica, aparece, apaga". Por-jogador, não reverte presença de outro organizador.
  try {
    if (typeof window._stampPresenceIntent === 'function') {
      var _fp = window._idMapHas(t, t.checkedIn || {}, _who);
      var _fa = window._idMapHas(t, t.absent || {}, _who);
      window._stampPresenceIntent(tId, _who, _fp ? 'present' : (_fa ? 'absent' : 'none'));
    }
  } catch (_eStamp) {}
  // v1.3.46: card ESTÁTICO — atualiza só o card tocado no lugar (sem re-render da lista) e
  // suprime o eco do onSnapshot (o próprio write), que re-renderizava e fazia os cards "pular e
  // voltar" (dono: "o certo é ficarem estáticos"). Se houve substituição de W.O. (muda a chave)
  // ou o in-place não deu, cai no re-render completo (correto).
  // v1.3.83/84: tenta atualizar SÓ o card tocado no lugar, em QUALQUER um dos 3 renderers de card
  // de presença — inscrito (grade), painel pós-sorteio (per-person), e DUPLA (chamada pré-sorteio,
  // o caso do SB Casais). Só cai no re-render completo se nenhum aplicar. Um caminho robusto.
  var _inPlace = !_woSub && (
    window._updateCardPresenceInPlace(tId, uid, playerName) ||
    (typeof window._updatePanelCardInPlace === 'function' && window._updatePanelCardInPlace(tId, uid, playerName)) ||
    (typeof window._updateDuplaCardInPlace === 'function' && window._updateDuplaCardInPlace(tId, uid, playerName))
  );
  if (_inPlace) {
    // atualiza a BARRA de chamada (Presentes/Ausentes/%) — recomputa por UID a partir do `t`
    // fresco, sem re-render da lista. Sem isto o card fica estático mas o contador não mexia.
    try {
      var _bar = document.getElementById('rollcall-bar');
      if (_bar) {
        var _mode = _bar.getAttribute('data-rc-mode') || 'rollcall';
        if (_mode === 'detail' && typeof window._detailCheckInBarHtml === 'function') {
          _bar.outerHTML = window._detailCheckInBarHtml(tId);           // barra do detalhe
        } else if (typeof window._rollCallBarHtml === 'function') {
          _bar.outerHTML = window._rollCallBarHtml(tId, _mode);         // barra do #participants
        }
      }
    } catch (_eBar) {}
    // v1.5.15: a faixa "N equipes para novo confronto" (e a etiqueta "aguardando mais 1") também
    // depende de QUEM está presente — sem isto ela ficava com o número do render anterior enquanto
    // o toast já dizia "Falta 1". Mesmo tratamento da barra: recomputa e troca só ela.
    try { if (typeof window._syncLateGrowthBanner === 'function') window._syncLateGrowthBanner(tId); } catch (_eGap) {}
    window._suppressSoftRefresh = true;
    clearTimeout(window._presenceRefreshRelease);
    window._presenceRefreshRelease = setTimeout(function () { window._suppressSoftRefresh = false; }, 1600);
    // v1.3.92: o card já foi atualizado in-place → adianta a assinatura da tela pro estado ATUAL, pra
    // o ECO tardio do snapshot (depois do suppress) ver "igual" e NÃO re-renderizar a lista (o pulinho
    // que sobrava). O gate de _softRefreshView compara com _pdetailSig; setando aqui, ele pula.
    // v1.3.96: adianta TAMBÉM _tdetailSig — a chamada de DUPLAS (_duplaCard) vive na view de DETALHE
    // (#tournaments/:id), cujo gate é _tournamentDetailSig. Sem isto, o toggle de dupla atualizava o
    // card in-place mas o eco re-renderizava o detalhe inteiro (o pulo que o dono via "ao colocar
    // presenças"). Adiantando ambas as assinaturas, o eco vê "igual" em qualquer uma das duas views.
    try { if (window._participantsViewSig) window._pdetailSig = window._participantsViewSig(t); } catch (_eSig) {}
    try { if (window._tournamentDetailSig) window._tdetailSig = window._tournamentDetailSig(t); } catch (_eSig2) {}
  } else {
    // in-place não se aplica (ex.: painel de check-in pós-sorteio) → re-render ESTÁVEL:
    // preserva scroll + suprime o eco do onSnapshot (mesmo robustez do card estático).
    _reRenderParticipantsStable();
  }
  // v1.3.95 (dono, SB Casais): marcar PRESENTE uma dupla/solo da LISTA DE ESPERA precisa disparar a
  // INTEGRAÇÃO TARDIA (CF integrateLateEntries) — que preenche o "a definir" existente ou cria o
  // confronto. Antes SÓ o RENDER do bracket (bracket.js:232) disparava; mas o toggle virou in-place
  // (fix do pulinho) e SUPRIME o re-render → a dupla presente atualizava o card mas NUNCA entrava na
  // chave. Aqui disparamos explicitamente, MAS só DEPOIS do commit (a CF lê o doc FRESCO do Firestore
  // — disparar antes faria a CF ver a dupla ainda ausente → nada a integrar). A CF faz TODO o
  // trabalho — cliente só dispara. Ver [[feedback_draw_is_cf_only]] / [[project_late_dupla_fills_awaiting_slot]].
  //
  // v1.3.96 (dono, "tela continua pulando ao colocar presenças"): o disparo agora é CIRÚRGICO —
  // SÓ quando a pessoa que acabou de ser marcada PERTENCE À LISTA DE ESPERA. Antes disparava em
  // TODO toggle (com espera+bracket), inclusive marcando presença de quem JÁ está na chave (a
  // chamada de rota normal): cada presença virava uma chamada de CF + eco → contribuía pro pulo.
  // A integração tardia só faz sentido pra quem está na espera; pra esses, o re-render que MOVE a
  // dupla pra chave é legítimo (e raro: só na 2ª marca, quando o par fica completo).
  try {
    var _canMng = !window._canManagePresence || window._canManagePresence(t, window.AppStore && window.AppStore.currentUser);
    var _hasBracket = (Array.isArray(t.matches) && t.matches.length) ||
                      (Array.isArray(t.rounds) && t.rounds.length) ||
                      (Array.isArray(t.groups) && t.groups.length);
    // a pessoa marcada está na ESPERA? (por uid de membro OU por nome) — só então integra.
    var _wl = (typeof window._getWaitlist === 'function') ? window._getWaitlist(t)
      : (t.standbyParticipants || []).concat(t.waitlist || []);
    var _toggledInWaitlist = Array.isArray(_wl) && _wl.some(function (e) {
      var _us = (typeof window._participantUids === 'function') ? window._participantUids(e) : [];
      if (uid && _us && _us.indexOf(uid) !== -1) return true;
      var _en = window._pName ? window._pName(e, '') : (e && (e.displayName || e.name)) || '';
      // nome do membro (par "A / B") OU nome inteiro da entrada
      if (playerName && _en) {
        if (_en === playerName) return true;
        if (_en.indexOf(' / ') !== -1 && _en.split(' / ').some(function (x) { return x.trim() === playerName; })) return true;
      }
      return false;
    });
    // v1.5.2 (dono, torneio AO VIVO 25/jul): a espera NÃO é a única origem de quem está FORA da
    // chave. Quem foi marcado AUSENTE antes do sorteio pode ter ficado em `t.participants` (fora da
    // chave) — marcar presença nele tem de gerar jogo igual. O gate agora é o que realmente importa:
    // a pessoa ficou PRESENTE e NÃO está na chave. Continua cirúrgico (quem já está na chave não
    // dispara nada). Ver [[project_late_dupla_fills_awaiting_slot]].
    var _toggledOutOfBracket = false;
    try {
      if (!_toggledInWaitlist && _wantPresent && typeof window._entryInBracket === 'function') {
        var _bset = window._bracketUidKeySet ? window._bracketUidKeySet(t) : null;
        _toggledOutOfBracket = (Array.isArray(t.participants) ? t.participants : []).some(function (p) {
          var _us = (typeof window._participantUids === 'function') ? window._participantUids(p) : [];
          var _mine = (uid && _us && _us.indexOf(uid) !== -1);
          if (!_mine && playerName) {
            var _pn = window._pName ? window._pName(p, '') : '';
            _mine = (_pn === playerName) ||
              (_pn.indexOf(' / ') !== -1 && _pn.split(' / ').some(function (x) { return x.trim() === playerName; }));
          }
          return _mine && !window._entryInBracket(t, p, _bset);
        });
      }
    } catch (_eOob) {}
    if (_canMng && _hasBracket && (_toggledInWaitlist || _toggledOutOfBracket) && typeof window._triggerLateIntegration === 'function') {
      var _fireLate = function () {
        try {
          var _ft = window._findTournamentById(tId) || t;
          // DEBOUNCE (v1.3.149): marcar presença em rajada (chamada de 20+ pessoas) coalesce numa
          // ÚNICA chamada de CF. Antes era 1 por toggle → enxurrada de docs + re-render = "presença
          // pulando/regredindo, instabilidade total".
          window._triggerLateIntegration(_ft, { force: true, debounce: true });
        } catch (_eFire) {}
      };
      if (_mutateDone && typeof _mutateDone.then === 'function') _mutateDone.then(_fireLate, _fireLate);
      else _fireLate();
    }
  } catch (_eLate) {}
};

// uid = IDENTIDADE (3º arg, igual _toggleCheckIn). Sem ele, os mapas caíam em _memberUidByName,
// que num roster SÓ-UID com cache frio devolve '' → o W.O. era gravado na CHAVE-NOME em vez da
// chave-uid (estado fantasma, homônimo colidindo). Nome = só fictício sem conta.
// [[project_uid_identity_canon_locked]] / [[project_id_maps_uid_keyed]]
window._markAbsent = function (tId, playerName, uid) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  // `uid` aceita 1 identidade (pessoa) ou VÁRIAS separadas por '|' — o W.O. DO TIME chaveia pelos
  // DOIS MEMBROS (regra do dono), nunca pelo nome do time. Token 'u:<uid>' = conta, 'n:<nome>' =
  // fictício (sem conta, a única exceção); token cru = uid (compat com os call sites de 1 pessoa).
  // Assim a dupla MISTA (um com conta + um fictício) marca os dois pelo que cada um é.
  const _whos = window._absenceIdentities(uid, playerName);
  const _who = _whos[0];
  // v2.3.82: W.O. (declarar ausente / reverter) só por autoridade (org/co-org/
  // árbitro). O W.O. por consenso entre participantes virá num próximo passo.
  if (window._canManagePresence && !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (typeof showNotification === 'function') {
      showNotification('W.O.', 'Apenas o organizador ou o árbitro pode declarar W.O.', 'info');
    }
    return;
  }
  // pre-check: se o jogo do W.O. já foi jogado, não reverte — toast + aborta ANTES
  // de mutar/gravar (a trava dentro de _applyAbsenceToggle é a defesa silenciosa).
  for (var _pi = 0; _pi < _whos.length; _pi++) {
    const _woMetaPre = window._woHistGet(t, _whos[_pi]);
    if ((window._idMapHas(t, t.absent, _whos[_pi]) || _woMetaPre) && _woMetaPre && _woMetaPre.matchNum && typeof window._matchHasRealPlay === 'function') {
      const _allPre = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (Array.isArray(t.matches) ? t.matches.slice() : []);
      const _mPre = _allPre[_woMetaPre.matchNum - 1];
      if (_mPre && window._matchHasRealPlay(_mPre)) {
        if (typeof showNotification === 'function') showNotification('W.O. não pode ser revertido', 'A partida já foi jogada (placar lançado ou placar ao vivo iniciado). O W.O. não é mais reversível.', 'warning');
        return;
      }
    }
  }
  // mutação (toggle ausência / revert de W.O.) ATÔMICA pelo portão AppStore.mutate
  // alvo decidido UMA vez, do estado LOCAL no clique (o mutator pode re-executar em retry).
  // TIME: se QUALQUER membro já está fora, o clique REVERTE os dois; senão marca os dois.
  var _wantAbs = !_whos.some(function (w) {
    return window._idMapHas(t, t.absent || {}, w) || window._woHistGet(t, w);
  });
  window.AppStore.mutate(tId, function (ft) {
    _whos.forEach(function (w) { window._applyAbsenceToggle(ft, w, _wantAbs); });
  });
  // v1.3.82: intenção otimista sobrevive a snapshot stale (aparece/apaga). Chaveada pelo uid.
  try {
    if (typeof window._stampPresenceIntent === 'function') {
      _whos.forEach(function (w) {
        var _key = (w && typeof w === 'object') ? w.uid : w;
        var _ma = window._idMapHas(t, t.absent || {}, w);
        var _mp = window._idMapHas(t, t.checkedIn || {}, w);
        window._stampPresenceIntent(tId, _key, _ma ? 'absent' : (_mp ? 'present' : 'none'));
      });
    }
  } catch (_eStamp) {}
  _reRenderParticipantsStable();
};

// Traduz o argumento de identidade do W.O. numa LISTA de identidades pros mapas (uid-keyed).
// '' → [nome] (fictício/legado) · 'UID' → [{uid}] · 'u:U1|n:Convidado' → [{uid:U1}, 'Convidado'].
window._absenceIdentities = function (uid, playerName) {
  var raw = String(uid == null ? '' : uid).trim();
  if (!raw) return [playerName];
  var out = [];
  raw.split('|').forEach(function (tok) {
    tok = String(tok || '').trim();
    if (!tok) return;
    if (tok.indexOf('n:') === 0) { var nm = tok.slice(2).trim(); if (nm) out.push(nm); return; }
    var u = (tok.indexOf('u:') === 0) ? tok.slice(2).trim() : tok;
    if (u) out.push({ uid: u });
  });
  if (!out.length) return [playerName];
  // 1 pessoa: leva o nome junto (display/meta do woHistory). Time: cada membro resolve o SEU nome
  // pelo uid dentro do _applyAbsenceToggle — o nome do TIME não serve de identidade pra ninguém.
  if (out.length === 1 && out[0] && typeof out[0] === 'object') out[0].displayName = playerName;
  return out;
};

// Mutação PURA de ausência (marcar/reverter W.O.) — muta só o `t` passado, sem
// save (transaction-safe). Extraída de _markAbsent na blindagem (v4.0.117). A
// trava "não reverte se já jogou" aqui é SILENCIOSA (toast no pre-check acima).
// v1.3.154: IDEMPOTENTE. `wantAbsent` = alvo ABSOLUTO decidido pelo CHAMADOR (estado no clique).
// Sem ele, mantém o toggle antigo (compat). Este mutator roda dentro de AppStore.mutate →
// commitTournamentTx, que RE-EXECUTA em retry de conflito; um toggle ali se auto-inverte
// (mesma bomba da presença na v1.3.152). A guarda "já está no alvo → no-op" torna N execuções
// equivalentes a 1, SEM alterar a lógica de reverter W.O. Ver [[project_concurrency_safe_saves]].
window._applyAbsenceToggle = function (t, who, wantAbsent) {
  if (!t.absent) t.absent = {};
  if (!t.checkedIn) t.checkedIn = {};
  // `who` = IDENTIDADE ({uid} do card) ou nome (fictício sem conta / chamadores legados).
  // Os MAPAS (absent/checkedIn/woHistory) são chaveados por `who` — uid quando existe. O
  // `playerName` abaixo serve SÓ pras operações de string do revert de substituição (nome do
  // time na chave), nunca como identidade. [[project_id_maps_uid_keyed]]
  var playerName = (who && typeof who === 'object') ? String(who.displayName || who.name || '') : String(who == null ? '' : who);
  if (!playerName && who && who.uid && typeof window._displayNameForUid === 'function') {
    playerName = window._displayNameForUid(who.uid, '');
  }
  // v1.0.79-beta: revert completo. Detecta orphan (W.O.'d via woHistory) e,
  // se há replacedBy, desfaz substituição: restaura time original, remove
  // substituto da chave, devolve ele à waitlist se aplicável.
  const _woMeta = window._woHistGet(t, who); // uid-first, nome fallback
  var _isAbsNow = !!(window._idMapHas(t, t.absent, who) || _woMeta);
  var _want = (wantAbsent === undefined || wantAbsent === null) ? !_isAbsNow : !!wantAbsent;
  if (_want === _isAbsNow) return;   // JÁ está no alvo → no-op (idempotência)
  if (!_want) {
    // Trava: se o jogo do W.O. já foi jogado de verdade (placar lançado / placar
    // ao vivo iniciado), não dá pra reverter — reverter zeraria um resultado real.
    if (_woMeta && _woMeta.matchNum && typeof window._matchHasRealPlay === 'function') {
      const _allMchk = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t)
        : (Array.isArray(t.matches) ? t.matches.slice() : []);
      const _woMatchChk = _allMchk[_woMeta.matchNum - 1];
      if (_woMatchChk && window._matchHasRealPlay(_woMatchChk)) {
        return; // trava SILENCIOSA (o toast é no pre-check do _markAbsent, fora da txn)
      }
    }
    // Desmarcar ausência → volta ao estado "sem confirmação"
    window._idMapDel(t, t.absent, who);
    if (_woMeta) {
      const _replacedBy = _woMeta.replacedBy;
      const _origTeam = _woMeta.originalTeam;
      const _matchNum = _woMeta.matchNum;
      if (_replacedBy && _origTeam && _matchNum) {
        // Restaura time original em todas as estruturas
        try {
          const _allM = (typeof window._collectAllMatches === 'function')
            ? window._collectAllMatches(t)
            : (Array.isArray(t.matches) ? t.matches.slice() : []);
          const _origMatch = _allM[_matchNum - 1];
          if (_origMatch && !_origMatch.winner) {
            // Substring "playerName" estava em substituto. Restaurar.
            const _sep = _origTeam.includes(' / ') ? ' / ' : '/';
            const _curTeam = _origMatch.p1 && _origMatch.p1.includes(_replacedBy) ? _origMatch.p1
                          : (_origMatch.p2 && _origMatch.p2.includes(_replacedBy) ? _origMatch.p2 : null);
            if (_curTeam) {
              const _restoredTeam = _curTeam.split(_sep).map(n => n.trim() === _replacedBy ? playerName : n.trim()).join(' / ');
              _allM.forEach(function(m) {
                if (!m) return;
                if (m.p1 === _curTeam) m.p1 = _restoredTeam;
                if (m.p2 === _curTeam) m.p2 = _restoredTeam;
                if (Array.isArray(m.team1)) {
                  const ti = m.team1.indexOf(_replacedBy);
                  if (ti !== -1) m.team1[ti] = playerName;
                }
                if (Array.isArray(m.team2)) {
                  const ti2 = m.team2.indexOf(_replacedBy);
                  if (ti2 !== -1) m.team2[ti2] = playerName;
                }
              });
              // Substituto sai do checkedIn (já que volta ao standby)
              window._idMapDel(t, t.checkedIn, _replacedBy);
              // Devolve substituto à waitlist se ele veio de lá
              const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
              const _subIdx = partsArr.findIndex(function(p) {
                const _n = window._pName(p);
                return _n === _replacedBy;
              });
              // Adiciona à waitlist (só se não tava lá)
              if (!Array.isArray(t.waitlist)) t.waitlist = [];
              const _alreadyInWaitlist = t.waitlist.some(function(w) {
                const _wn = window._pName(w);
                return _wn === _replacedBy;
              });
              if (!_alreadyInWaitlist && _subIdx >= 0) {
                t.waitlist.push(partsArr[_subIdx]);
              }
            }
          }
        } catch (_e) { window._warn('[markAbsent revert] failed:', _e); }
      }
      // Sempre limpa woHistory após revert (uid-key + nome legado)
      window._woHistDel(t, who);
    }
  } else {
    // Marcar ausente → limpa presença se existia
    window._idMapSet(t, t.absent, who, Date.now());
    window._idMapDel(t, t.checkedIn, who);
  }
};

window._resetCheckIn = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  window.AppStore.mutate(tId, function (ft) { ft.checkedIn = {}; ft.absent = {}; ft.checkedInConfirmed = {}; });
  _reRenderParticipants();
  if (typeof showNotification === 'function') showNotification(_t('participants.resetCheckin'), _t('participants.resetCheckinMsg'), 'info');
};

// ════════════════════════════════════════════════════════════════════════════
// v2.1.86: CHAMADA pré-sorteio → sortear apenas entre os presentes.
// Fluxo: organizador marca presença na lista de inscritos, clica "Sortear entre
// os presentes". Os que não confirmaram presença (ausentes/aguardando) são
// resolvidos via diálogo de 3 opções: enviar à lista de espera, desclassificar
// ou cancelar. Em seguida o pipeline normal de sorteio roda só com os presentes.
// ════════════════════════════════════════════════════════════════════════════
window._drawPresentOnly = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.checkedIn) t.checkedIn = {};
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const present = [];
  const absentees = [];
  parts.forEach(function (p) {
    const en = window._pName(p);
    if (window._idMapHas(t, t.checkedIn, p)) present.push(p);
    else absentees.push(p);
  });

  if (present.length === 0) {
    if (typeof showAlertDialog === 'function') {
      showAlertDialog('Nenhum presente confirmado',
        'Marque ao menos um inscrito como <b>Presente</b> antes de sortear entre os presentes.',
        null, { type: 'warning' });
    }
    return;
  }

  // proceed: encerra inscrições (exceto modos de inscrição tardia) e dispara o
  // pipeline de sorteio normal (potência de 2, resto, grupos, etc.) sobre a
  // lista já filtrada. isAberto=false → vai direto pro _startDraw sem 2º diálogo.
  const proceed = function () {
    const t2 = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
    if (t2) {
      const _le = window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t2) : t2.lateEnrollment;
      const lateMode = (_le === 'standby' || _le === 'expand');
      if (!lateMode && t2.status !== 'closed' && t2.status !== 'finished') t2.status = 'closed';
    }
    if (typeof window._handleSortearClick === 'function') {
      // skipGates=TRUE: a presença JÁ foi resolvida aqui (_drawPresentOnly + diálogo de
      // ausentes). Sem isto, em torneio 'expand'/'standby' (inscrições seguem abertas) o
      // status fica 'open' e _handleSortearClick reabre _showPresenceDrawChoice — um 2º
      // diálogo de presença REDUNDANTE. O usuário cancelava esse 2º diálogo achando que
      // era loop → o sorteio nunca chegava em _startDraw (sem tela equilibrado/livre nem
      // pow2, sem chaves), mesmo com o toast "Chamada concluída" já exibido. Pular o gate
      // leva direto pro _startDraw (painéis + sorteio).
      window._handleSortearClick(tId, false, true);
    } else if (typeof window.showUnifiedResolutionPanel === 'function') {
      window.showUnifiedResolutionPanel(tId);
    }
  };

  if (absentees.length === 0) { proceed(); return; }

  window._showAbsenteeResolutionDialog(tId, present, absentees, proceed);
};

// Diálogo de 3 opções para o destino dos ausentes.
window._showAbsenteeResolutionDialog = function (tId, present, absentees, proceed) {
  const existing = document.getElementById('absentee-resolution-dialog');
  if (existing) existing.remove();

  const names = absentees.map(function (p) { return window._pName(p, '?'); });
  const _safe = (window._safeHtml || function (s) { return s; });
  const preview = names.slice(0, 8).map(function (n) { return _safe(n); }).join(', ') +
    (names.length > 8 ? ' e mais ' + (names.length - 8) : '');

  const dialog = document.createElement('div');
  dialog.id = 'absentee-resolution-dialog';
  dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:100012;padding:16px;';
  dialog.innerHTML =
    '<div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="background:rgba(245,158,11,0.1);border-bottom:1px solid var(--border-color);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:1.8rem;">📋</span>' +
        '<div style="font-size:1.05rem;font-weight:800;color:var(--text-color);">Sortear entre os presentes</div>' +
      '</div>' +
      '<div style="padding:1.1rem 1.25rem;color:var(--text-muted);font-size:0.9rem;line-height:1.55;">' +
        '<p style="margin:0 0 8px;"><b style="color:#4ade80;">' + present.length + '</b> presente(s) entrarão no sorteio.</p>' +
        '<p style="margin:0 0 6px;"><b style="color:#f87171;">' + absentees.length + '</b> não confirmaram presença:</p>' +
        '<p style="margin:0;font-size:0.82rem;opacity:0.85;">' + preview + '</p>' +
        '<p style="margin:12px 0 0;font-weight:700;color:var(--text-color);">O que fazer com os ausentes?</p>' +
      '</div>' +
      '<div style="padding:0 1.25rem 1.25rem;display:flex;flex-direction:column;gap:8px;">' +
        '<button id="absres-waitlist" class="btn hover-lift" style="background:rgba(251,191,36,0.18);color:#fbbf24;border:1px solid rgba(251,191,36,0.5);font-weight:800;padding:11px;border-radius:10px;">🕐 Enviar à Lista de Espera</button>' +
        '<button id="absres-dq" class="btn hover-lift" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.5);font-weight:800;padding:11px;border-radius:10px;">🚫 Desclassificar</button>' +
        '<button id="absres-cancel" class="btn" style="background:rgba(239,68,68,0.10);color:#ef4444;font-weight:700;border:1px solid rgba(239,68,68,0.45);padding:10px;border-radius:10px;">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dialog);

  const close = function () { dialog.remove(); };
  dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
  const _cancel = document.getElementById('absres-cancel');
  const _wl = document.getElementById('absres-waitlist');
  const _dq = document.getElementById('absres-dq');
  if (_cancel) _cancel.onclick = close;
  if (_wl) _wl.onclick = function () { close(); window._resolveAbsenteesThenDraw(tId, 'waitlist', proceed); };
  if (_dq) _dq.onclick = function () { close(); window._resolveAbsenteesThenDraw(tId, 'disqualify', proceed); };
};

// Aplica o destino dos ausentes (lista de espera ou desclassificação), filtra
// t.participants para os presentes, persiste e dispara `proceed` (o sorteio).
window._resolveAbsenteesThenDraw = function (tId, mode, proceed) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  // Núcleo PURO da chamada pré-sorteio: EXTRAÍDO pra draw-decisions.js
  // (window._applyPresenceRoll) — a CF `drawRound` aplica a MESMA função sobre o doc
  // fresco quando o pacote de decisões traz `absentees`. Aqui era uma closure local:
  // o servidor não conseguia chamá-la e teria que reimplementar a partição (2ª versão
  // do código = o bug que a canonização mata). Ver docs/sorteio-ciclo-decisoes.md.
  var _applyRoll = function (tt) { return window._applyPresenceRoll(tt, mode); };
  var _rc = _applyRoll(t); // local otimista + arrays pra UI/log
  var present = _rc.present, absentees = _rc.absent;

  if (window.AppStore && typeof window.AppStore.logAction === 'function') {
    window.AppStore.logAction(tId, 'Chamada pré-sorteio: ' + present.length + ' presente(s), ' +
      absentees.length + (mode === 'waitlist' ? ' à lista de espera' : ' desclassificado(s)'));
  }

  // v1.3.x (migração→CF): NÃO persiste mais a chamada aqui. A decisão `absentees` viaja no
  // pacote e a CF RE-aplica _applyPresenceRoll sobre o roster ORIGINAL restaurado no despacho
  // (usando o checkedIn persistido) → autoridade no servidor, independente da versão do app.
  // O _applyRoll(t) acima é só preview/feedback (arrays pra UI/log). Elimina o mutate do sorteio.
  window._setDrawDecision(tId, { absentees: mode });
  if (window._dtrace) window._dtrace('roll:decision', { mode: mode, present: present.length, absent: absentees.length });
  if (typeof showNotification === 'function') {
    showNotification('✅ Chamada concluída',
      present.length + ' no sorteio · ' + absentees.length +
      (mode === 'waitlist' ? ' na lista de espera' : ' desclassificado(s)'), 'success');
  }
  if (typeof proceed === 'function') proceed();
};

// ── Inline name editing for organizers ──
window._editParticipantName = function(tId, oldName) {
  var span = event.target;
  if (span.getAttribute('contenteditable') === 'true') return; // already editing
  span.setAttribute('contenteditable', 'true');
  span.style.background = 'rgba(255,255,255,0.1)';
  span.style.borderRadius = '4px';
  span.style.padding = '1px 4px';
  span.style.outline = '1px solid rgba(99,102,241,0.5)';
  span.style.minWidth = '60px';
  span.focus();
  // Select all text
  var range = document.createRange();
  range.selectNodeContents(span);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  var _save = function() {
    span.setAttribute('contenteditable', 'false');
    span.style.background = '';
    span.style.padding = '';
    span.style.outline = '';
    var newName = span.textContent.trim();
    if (!newName || newName === oldName) {
      span.textContent = oldName; // revert
      return;
    }
    var t = window._findTournamentById(tId);
    if (!t) return;
    // Update in participants array
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p, idx) {
      if (typeof p === 'string') {
        if (p === oldName) parts[idx] = newName;
        else if (p.indexOf(' / ') !== -1) {
          var updated = p.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (updated !== p) parts[idx] = updated;
        }
      } else if (p && typeof p === 'object') {
        if (p.displayName === oldName) p.displayName = newName;
        if (p.name === oldName) p.name = newName;
      }
    });
    // Update in matches, rounds, groups
    var _updateMatch = function(m) {
      if (!m) return;
      if (m.p1 === oldName) m.p1 = newName;
      if (m.p2 === oldName) m.p2 = newName;
      if (m.winner === oldName) m.winner = newName;
      // Team names with " / "
      ['p1', 'p2', 'winner'].forEach(function(field) {
        if (m[field] && m[field].indexOf(oldName) !== -1 && m[field].indexOf(' / ') !== -1) {
          var upd = m[field].split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (upd !== m[field]) m[field] = upd;
        }
      });
      if (Array.isArray(m.team1)) { var i1 = m.team1.indexOf(oldName); if (i1 !== -1) m.team1[i1] = newName; }
      if (Array.isArray(m.team2)) { var i2 = m.team2.indexOf(oldName); if (i2 !== -1) m.team2[i2] = newName; }
    };
    // Update every match across all shapes (by-reference, mutations persist).
    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(_updateMatch);
    } else {
      // Defensive fallback: bracket-model.js not loaded.
      if (Array.isArray(t.matches)) t.matches.forEach(_updateMatch);
      if (t.thirdPlaceMatch) _updateMatch(t.thirdPlaceMatch);
      if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); });
      if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
        if (!g) return;
        if (Array.isArray(g.matches)) g.matches.forEach(_updateMatch);
        if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_updateMatch); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_updateMatch); });
      });
      if (Array.isArray(t.rodadas)) t.rodadas.forEach(function(r) { if (Array.isArray(r)) r.forEach(_updateMatch); else if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); });
    }
    // g.players is a roster field (not a match), handled separately.
    if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
      if (g && Array.isArray(g.players)) {
        var pi = g.players.indexOf(oldName);
        if (pi !== -1) g.players[pi] = newName;
      }
    });
    // Update checkedIn, absent, vips, standings, classification, sorteioRealizado
    ['checkedIn', 'absent', 'vips'].forEach(function(field) {
      if (!t[field]) return;
      if (t[field][oldName] !== undefined) { t[field][newName] = t[field][oldName]; delete t[field][oldName]; }
      Object.keys(t[field]).forEach(function(k) {
        if (k.indexOf(oldName) !== -1 && k.indexOf(' / ') !== -1) {
          var newKey = k.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newKey !== k) { t[field][newKey] = t[field][k]; delete t[field][k]; }
        }
      });
    });
    if (t.classification && t.classification[oldName] !== undefined) { t.classification[newName] = t.classification[oldName]; delete t.classification[oldName]; }
    if (Array.isArray(t.standings)) t.standings.forEach(function(s) { if (s.name === oldName) s.name = newName; if (s.player === oldName) s.player = newName; });
    if (Array.isArray(t.sorteioRealizado)) t.sorteioRealizado.forEach(function(item, idx2) {
      if (typeof item === 'string') {
        if (item === oldName) t.sorteioRealizado[idx2] = newName;
        else if (item.indexOf(oldName) !== -1 && item.indexOf(' / ') !== -1) {
          var newSR = item.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newSR !== item) t.sorteioRealizado[idx2] = newSR;
        }
      } else if (typeof item === 'object' && item) { if (item.name === oldName) item.name = newName; if (item.displayName === oldName) item.displayName = newName; }
    });

    window.FirestoreDB.saveTournament(t);
    window.AppStore.logAction(tId, 'Nome editado: "' + oldName + '" → "' + newName + '"');
    if (typeof showNotification === 'function') showNotification(_t('participants.nameUpdated'), _t('participants.nameUpdatedMsg', { old: oldName, 'new': newName }), 'success');
    _reRenderParticipants();
  };

  span.addEventListener('blur', _save, { once: true });
  span.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      span.blur();
    }
    if (e.key === 'Escape') {
      span.textContent = oldName;
      span.blur();
    }
  });
};

window._startTournament = function (tId) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  t.tournamentStarted = Date.now();
  // Se não houver data de início, preencher com a data atual
  if (!t.startDate) {
    const now = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    t.startDate = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  }
  // Status passa a ser em andamento
  t.status = 'in_progress';
  window.AppStore.sync();
  if (typeof showNotification === 'function') showNotification(_t('participants.tournamentStarted'), _t('participants.tournamentStartedMsg'), 'success');
  // Re-render current view
  const hash = window.location.hash;
  const container = document.getElementById('view-container');
  if (container && hash.startsWith('#bracket/')) {
    if (typeof renderBracket === 'function') renderBracket(container, tId);
  } else {
    _reRenderParticipants();
  }
};

window._setCheckInFilter = function (tId, filter) {
  window._checkInFilter = filter;
  _reRenderParticipants();
};

// Factory CANÔNICO dos callbacks de presença da CHAMADA (roll-call) — v1.3.16. Extraído de
// renderParticipants pra ser reusado TAMBÉM no DETALHE do torneio (tournaments.js) sem duplicar
// a lógica. Retorna {cardPresence, memberPresence} pra passar como ctx ao
// _buildDoublesInscritosSection (seção canônica de duplas). Assim a CHAMADA de duplas aparece
// igual no detalhe e no #participants. `active` = chamada pré-sorteio (org marca presença);
// `postDraw` = pós-sorteio antes de iniciar (mostra estado, W.O. individual). uid only: os toggles
// passam o uid da pessoa; a presença é lida por _idMapHas (uid-first). Ver
// [[project_two_participant_card_renderers]] e [[project_id_maps_uid_keyed]].
window._rollCallPresenceCtx = function (t, opts) {
  opts = opts || {};
  // v1.3.47: guarda os OPTS do último ctx de chamada → o update in-place (após o snapshot
  // TROCAR o objeto de torneio em store.tournaments) reconstrói a presença contra o `t` ATUAL,
  // não contra o `t` órfão capturado no build. Sem isto, só a 1ª presença "pegava".
  try { window._lastRcOpts = opts; } catch (_eO) {}
  var isOrg = !!opts.isOrg;
  var active = !!opts.active;       // canRollCall (chamada pré-sorteio)
  var postDraw = !!opts.postDraw;   // postDrawPresence (pós-sorteio, antes de iniciar)
  var woScope = ((opts.woScope || t.woScope || 'individual') === 'individual') ? 'individual' : 'team';
  var ci = t.checkedIn || {}, ab = t.absent || {}, conf = t.checkedInConfirmed || {};
  var _pres = function (who) { return !!window._idMapHas(t, ci, who) && !window._idMapHas(t, ab, who); };
  var _abs = function (who) { return !!window._idMapHas(t, ab, who); };
  // v1.3.19: AZUL = confirmado remoto (checkedInConfirmed) e NÃO presente (verde vence).
  var _conf = function (who) { return !!window._idMapHas(t, conf, who) && !window._idMapHas(t, ci, who); };
  // CORES CANÔNICAS (store.js `_PRESENCE_TONES`): PRESENTE=verde · AUSENTE=azul · Confirmado=âmbar;
  // DUPLA=tom escuro ('pair') · INDIVIDUAL=tom claro ('solo'). NUNCA hardcodar hex aqui — o dono
  // canonizou pra ficar consistente em qualquer torneio. Ver [[project_inscrito_card_canonical]].
  var _sty = function (state, scope) { return window._presenceCardStyle ? window._presenceCardStyle(state, scope) : ''; };
  var _txt = function (state, scope) { return window._presenceTextColor ? window._presenceTextColor(state, scope) : '#4ade80'; };
  var _tgl = function (state, scope) { return window._presenceToggleColor ? window._presenceToggleColor(state, scope) : '#10b981'; };
  var _cf = function () { return window._checkInFilter || 'all'; };
  return {
    cardPresence: function (p) {
      if (!(active || postDraw)) return { skip: false, styleExtra: '', rowHtml: '' };
      var currentFilter = _cf();
      var _pairKeys = null;
      if (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) _pairKeys = [(p.p1Uid || String(p.p1Name || '').trim()), (p.p2Uid || String(p.p2Name || '').trim())];
      else { var _nmC = (typeof p === 'string' ? p : (p && (p.displayName || p.name)) || ''); if (_nmC.indexOf('/') !== -1) { var _pp = _nmC.split('/').map(function (s) { return s.trim(); }).filter(Boolean); if (_pp.length >= 2) _pairKeys = _pp; } }
      if (_pairKeys) {
        var _q1 = _pres(_pairKeys[0]), _z1 = !_q1 && _abs(_pairKeys[0]);
        var _q2 = _pres(_pairKeys[1]), _z2 = !_q2 && _abs(_pairKeys[1]);
        var _both = _q1 && _q2, _anyAbs = _z1 || _z2;
        if (currentFilter === 'present' && !_both) return { skip: true };
        if (currentFilter === 'absent' && !_anyAbs) return { skip: true };
        if (currentFilter === 'pending' && (_both || _anyAbs)) return { skip: true };
        var _teamRow = '';
        if (active && isOrg && woScope === 'team') {
          var _tEntry = window._pName(p);
          var _tAbs = _anyAbs || _abs(_tEntry);
          var _tE = String(_tEntry).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          // W.O. DO TIME chaveia pelos DOIS MEMBROS (dono, 22/jul), nunca pelo nome do time: cada
          // um vai como 'u:<uid>' (conta) ou 'n:<nome>' (fictício sem conta — a única exceção).
          // Dupla mista marca os dois pelo que cada um é. [[project_id_maps_uid_keyed]]
          var _tIds = [
            (p && p.p1Uid) ? ('u:' + p.p1Uid) : (p && p.p1Name ? ('n:' + String(p.p1Name).trim()) : ''),
            (p && p.p2Uid) ? ('u:' + p.p2Uid) : (p && p.p2Name ? ('n:' + String(p.p2Name).trim()) : '')
          ].filter(Boolean).join('|').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          _teamRow = window._woBtnHtml("event.stopPropagation(); window._markAbsent('" + t.id + "', '" + _tE + "', '" + _tIds + "');", !_tAbs, { label: _tAbs ? 'Reverter' : 'W.O. do time', size: 'btn-micro', fontSize: '0.68rem', extraStyle: 'min-height:0;height:24px;line-height:1;' });
        }
        // DUPLA → tom ESCURO ('pair'): VERDE só quando os DOIS estão presentes; qualquer outro
        // caso (ausente OU ainda não marcado) = AZUL. Antes o "pendente" não pintava nada e o card
        // caía no fundo VERDE base — uma dupla rotulada "Ausente" aparecia verde, igual a uma
        // presente (o print do dono: "as cores dos presentes e ausentes está muito parecido").
        // Rótulo e cor agora SEMPRE concordam: o card já escreve "Ausente" pra quem não marcou.
        // v1.3.147 (dono): TRÊS estados na dupla — os DOIS presentes = VERDE; UM presente e outro
        // não = ÂMBAR ("falta um"); NENHUM presente (ausente ou pendente) = AZUL. Antes o parcial
        // caía no MESMO azul do "nenhum": no print, Eduardo(ausente)/Ciça(PRESENTE) ficava idêntico
        // a Kelly(ausente)/Rodrigo(ausente).
        var _anyPres = _q1 || _q2;
        return {
          skip: false,
          styleExtra: _both ? _sty('present', 'pair') : (_anyPres ? _sty('partial', 'pair') : _sty('absent', 'pair')),
          rowHtml: _teamRow
        };
      }
      // SOLO
      var entry = window._pName(p);
      var mc = _pres(entry);
      var blu = !mc && _conf(entry);
      var abs = !mc && !blu && _abs(entry);
      var pend = !mc && !blu && !abs;
      if (currentFilter === 'present' && !mc) return { skip: true };
      if (currentFilter === 'confirmed' && !blu) return { skip: true };
      if (currentFilter === 'absent' && !(abs || pend)) return { skip: true };
      if (currentFilter === 'pending' && !pend) return { skip: true };
      // INDIVIDUAL → tom CLARO ('solo'). Mesma regra da dupla: VERDE só presente; ausente E
      // pendente = AZUL (o card já rotula os dois como "Ausente"), Confirmado = âmbar.
      var styleExtra = mc ? _sty('present', 'solo') : (blu ? _sty('confirmed', 'solo') : _sty('absent', 'solo'));
      var rowHtml = '';
      var _puid = String((p && p.uid) || '').replace(/'/g, "\\'");
      if (active) {
        var _rcEntry = entry.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var label = mc ? 'Presente' : (blu ? 'Confirmado' : 'Ausente');
        var color = mc ? _txt('present', 'solo') : (blu ? _txt('confirmed', 'solo') : _txt('absent', 'solo'));
        var _onc = mc ? _tgl('present', 'solo') : (blu ? _tgl('confirmed', 'solo') : _tgl('absent', 'solo'));
        var wo = (!mc && !blu && isOrg)
          ? window._woBtnHtml("event.stopPropagation(); window._markAbsent('" + t.id + "', '" + _rcEntry + "', '" + _puid + "');", !abs, { label: abs ? 'Reverter' : 'W.O.', size: 'btn-micro', fontSize: '0.68rem', extraStyle: 'min-height:0;height:24px;line-height:1;' })
          : '';
        rowHtml = '<span style="font-size:0.74rem;font-weight:800;color:' + color + ';white-space:nowrap;">' + label + '</span>' +
          '<label class="toggle-switch toggle-sm" style="--toggle-on-bg:' + _onc + ';--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:' + _onc + ';flex-shrink:0;" onclick="event.stopPropagation();"><input type="checkbox" ' + ((mc || blu) ? 'checked' : '') + ' onclick="event.stopPropagation(); window._toggleCheckIn(\'' + t.id + '\', \'' + _rcEntry + '\', \'' + _puid + '\');"><span class="toggle-slider"></span></label>' + wo;
      } else {
        var l2 = mc ? 'Presente' : (blu ? 'Confirmado' : 'Ausente');
        var c2 = mc ? _txt('present', 'solo') : (blu ? _txt('confirmed', 'solo') : _txt('absent', 'solo'));
        var ic = mc ? '✅' : (blu ? '🟡' : '🔵');
        rowHtml = '<span style="font-size:0.74rem;font-weight:800;color:' + c2 + ';white-space:nowrap;">' + ic + ' ' + l2 + '</span>';
      }
      return { skip: false, styleExtra: styleExtra, rowHtml: rowHtml };
    },
    memberPresence: function (member, right) {
      if (!(active || postDraw)) return { html: '' };
      var keyName = (member && member.guest) ? String(member.guest).trim()
        : (window._displayName ? window._displayName(member && member.uid, member && member.guest) : '');
      if (!keyName) return { html: '' };
      var _mWho = (member && member.uid) ? { uid: member.uid, displayName: keyName } : keyName;
      var _mUidEsc = String((member && member.uid) || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var mc = _pres(_mWho);
      var blu = !mc && _conf(_mWho);
      var abs = !mc && !blu && _abs(_mWho);
      var label = mc ? 'Presente' : (blu ? 'Confirmado' : 'Ausente');
      // membro vive DENTRO do card de dupla (fundo escuro) → tom 'pair' (texto mais claro, contraste)
      var color = mc ? _txt('present', 'pair') : (blu ? _txt('confirmed', 'pair') : _txt('absent', 'pair'));
      if (!active) {
        var ic = mc ? '✅' : (blu ? '🟡' : '🔵');
        return { present: mc, absent: abs, html: '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;' + (right ? 'justify-content:flex-end;' : '') + '"><span style="font-size:0.7rem;font-weight:800;color:' + color + ';white-space:nowrap;">' + ic + ' ' + label + '</span></div>' };
      }
      var _e = keyName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var _oncM = mc ? _tgl('present', 'pair') : (blu ? _tgl('confirmed', 'pair') : _tgl('absent', 'pair'));
      var wo = (!mc && !blu && isOrg && woScope === 'individual')
        ? window._woBtnHtml("event.stopPropagation(); window._markAbsent('" + t.id + "', '" + _e + "', '" + _mUidEsc + "');", !abs, { label: abs ? 'Reverter' : 'W.O.', size: 'btn-micro', fontSize: '0.66rem', extraStyle: 'min-height:0;height:22px;line-height:1;' })
        : '';
      var word = '<span style="font-size:0.7rem;font-weight:800;color:' + color + ';white-space:nowrap;">' + label + '</span>';
      var toggle = '<label class="toggle-switch toggle-sm" style="--toggle-on-bg:' + _oncM + ';--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:' + _oncM + ';flex-shrink:0;" onclick="event.stopPropagation();"><input type="checkbox" ' + ((mc || blu) ? 'checked' : '') + ' onclick="event.stopPropagation(); window._toggleCheckIn(\'' + t.id + '\', \'' + _e + '\', \'' + _mUidEsc + '\');"><span class="toggle-slider"></span></label>';
      var inner = right ? (wo + toggle + word) : (word + toggle + wo);
      return { present: mc, absent: abs, html: '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap;' + (right ? 'justify-content:flex-end;' : '') + '" onclick="event.stopPropagation();">' + inner + '</div>' };
    }
  };
};

// v2.6.108: tela de Inscritos usa a BARRA CANÔNICA (window._inscritosFilterBar) —
// mesma da Análise: busca + Ordenar (Inscrição ↑↓ / Nome A→Z/Z→A) + Gênero + Habilidade.
// Tudo DOM (sem re-render → não perde foco): busca/gênero/habilidade escondem cards;
// Ordenar reordena os nós no container. window._partSearch persiste o texto entre renders.
window._partSearch = window._partSearch || '';
window._partApplyFilter = function () {
  // ⚠️ FILTRAR EXIGE A LISTA INTEIRA. Com fatias ainda em voo, as que chegam DEPOIS
  // nascem sem o `display` do filtro e aparecem mesmo sem casar com a busca — quem
  // digitou "Kelly" veria estranhos pipocando por ~150ms. Então quem filtra primeiro
  // termina a pintura: a primeira tecla paga o resto da lista (~50ms) e o que a tela
  // mostra passa a ser verdade em todo instante. Sem recursão: no fim da descarga não
  // resta fatia, e é por isso que a checagem vem antes de qualquer leitura de DOM.
  try { if (window._inscritosPintandoEmFatias && window._inscritosPintandoEmFatias() && window._flushInscritosPaint) window._flushInscritosPaint(); } catch (e) {}
  var _docEl = document.scrollingElement || document.documentElement;
  var _keepY = _docEl.scrollTop;
  var inp = document.getElementById('part-search');
  if (inp) window._partSearch = inp.value;
  var q = (window._partSearch || '').trim().toLowerCase();
  var sort = (document.getElementById('part-sort') || {}).value || 'name-asc';
  var gf = (document.getElementById('part-gender') || {}).value || 'all';
  var sk = (document.getElementById('part-skill') || {}).value || 'all';
  // v4.4.65: FILTRO ativos/inativos (bola verde/vermelha). all=todos, active=só ativos,
  // inactive=só inativos. Lê data-part-inactive (1=inativo).
  var af = (document.getElementById('part-active') || {}).value || 'all';
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-part-card]'));
  if (!cards.length) return;
  var shown = 0;
  cards.forEach(function (c) {
    var nm = c.getAttribute('data-part-name') || '';
    var g = c.getAttribute('data-part-gender') || 'none';
    var s = c.getAttribute('data-part-skill') || 'none';
    // v3.1.x: card de DUPLA (data-part-multi="1") = 2 pessoas. Gênero/habilidade não
    // se aplicam a um PAR (cada membro tem o seu) — viram wildcard; só a BUSCA filtra
    // (data-part-name casa qualquer um dos nomes). Pra solo, mantém o casamento exato,
    // tolerando também valor multi (g/s separados por vírgula) por segurança.
    var isMulti = c.getAttribute('data-part-multi') === '1';
    var _inact = c.getAttribute('data-part-inactive') === '1';
    var okSearch = !q || nm.indexOf(q) !== -1;
    var okGender = isMulti || gf === 'all' || g === gf || g.split(',').indexOf(gf) !== -1;
    var okSkill = isMulti || sk === 'all' || s === sk || s.split(',').indexOf(sk) !== -1;
    var okActive = af === 'all' || (af === 'active' ? !_inact : _inact);
    var ok = okSearch && okGender && okSkill && okActive;
    c.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  // Ordenar: reordena os nós no container (DOM, focus-safe). v3.1.x: agrupa por
  // parentNode e ordena DENTRO de cada container — telas com DUAS seções (ex.:
  // duplas pré-sorteio: "Sem dupla" + "Duplas formadas") mantêm cada card na sua
  // seção. Telas de seção única ficam idênticas (1 grupo só).
  var _cmp = function (a, b) {
    // v2.7.37: ORGANIZADORES sempre no topo (acima até dos VIPs), independente do
    // sort/filtro. Depois VIPs. Depois o sort escolhido (v2.7.29).
    var ga = a.getAttribute('data-part-org') === '1' ? 1 : 0;
    var gb = b.getAttribute('data-part-org') === '1' ? 1 : 0;
    if (ga !== gb) return gb - ga;
    var va = a.getAttribute('data-part-vip') === '1' ? 1 : 0;
    var vb = b.getAttribute('data-part-vip') === '1' ? 1 : 0;
    if (va !== vb) return vb - va;
    // v2.7.53: LISTA DE ESPERA NÃO é mais fixada no rodapé — ela entra na ordem
    // normal (alfabética/cronológica) junto com os demais inscritos, só em âmbar.
    if (sort === 'name-asc' || sort === 'name-desc') {
      // v1.3.51 (CANON do dono): a chave de ordem PUXA O NOME PELO UID. Só cai pro nome
      // gravado quando NÃO há uid (jogador fictício/guest). Nunca ordena por email — o email
      // no lugar do nome era sinal de que a resolução por uid não estava sendo aplicada no
      // sort. Resolvido AQUI (no comparador) → robusto a timing; quando o perfil carrega,
      // _hydrateUidNames re-dispara _partApplyFilter e reordena. Ver [[project_uid_identity_canon_locked]].
      var _sn = function (el) {
        var u = el.getAttribute('data-part-uid') || '';
        var byUid = (u && typeof window._nameForUid === 'function') ? window._nameForUid(u) : '';
        return (byUid || el.getAttribute('data-part-name') || '').toLowerCase();
      };
      var r = _sn(a).localeCompare(_sn(b), 'pt-BR', { sensitivity: 'base' });
      return sort === 'name-desc' ? -r : r;
    }
    // v4.4.65: ativo/inativo virou FILTRO (acima), não sort — sort era imperceptível.
    var oa = parseInt(a.getAttribute('data-part-order') || '0', 10), ob = parseInt(b.getAttribute('data-part-order') || '0', 10);
    return sort === 'order-desc' ? (ob - oa) : (oa - ob);
  };
  var _groups = [];
  cards.forEach(function (c) {
    var pr = c.parentNode; if (!pr) return;
    var grp = null;
    for (var gi = 0; gi < _groups.length; gi++) { if (_groups[gi].parent === pr) { grp = _groups[gi]; break; } }
    if (!grp) { grp = { parent: pr, items: [] }; _groups.push(grp); }
    grp.items.push(c);
  });
  _groups.forEach(function (grp) {
    grp.items.slice().sort(_cmp).forEach(function (c) { grp.parent.appendChild(c); });
  });
  var empty = document.getElementById('part-search-empty');
  if (empty) empty.style.display = (shown === 0 && cards.length > 0) ? '' : 'none';
  // v3.0.97: não pula a tela / a barra sticky não sai do lugar quando o filtro esvazia.
  // v3.1.41: com BUSCA ATIVA, leva o 1º resultado pra logo abaixo da barra (nunca tela
  // preta embaixo tendo que rolar pra cima).
  try { if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(_keepY, !!q); } catch (e) {}
};

window._toggleVip = function (tId, participantName, uid) {
  const t = window._findTournamentById(tId);
  if (!t) return;
  if (!t.vips) t.vips = {};
  // uid-first: resolve a ENTRADA pra pegar todos os uids (solo = 1; dupla =
  // p1Uid+p2Uid). VIP fica marcado em cada uid → os readers que fazem
  // members.some(m => _vips[m]) acham, e dois jogadores de mesmo nome não
  // colidem. Jogador informal (sem uid) continua pelo nome (fallback).
  const partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  // A ENTRADA é achada pelo UID (3º arg, mandado pelo card). Casar por nome só funcionava
  // enquanto o nome resolvia igual dos dois lados — num roster só-uid com cache frio, não
  // resolve, `entry` vinha undefined e o VIP ia parar numa CHAVE-NOME órfã.
  const entry = (uid ? partsArr.find(p => p && typeof p === 'object' &&
                   (p.uid === uid || p.p1Uid === uid || p.p2Uid === uid)) : null)
             || partsArr.find(p => window._pName(p) === participantName);
  const uids = (entry && typeof window._participantUids === 'function') ? window._participantUids(entry) : [];
  let isVip = false;
  uids.forEach(u => { if (t.vips[u]) isVip = true; });
  if (!uids.length && t.vips[participantName]) isVip = true;
  if (isVip) {
    uids.forEach(u => { delete t.vips[u]; });
    delete t.vips[participantName]; // limpa chave-nome legada
  } else if (uids.length) {
    uids.forEach(u => { t.vips[u] = Date.now(); });
    delete t.vips[participantName]; // migra: sai do nome, entra no uid
  } else {
    t.vips[participantName] = Date.now();
  }
  window.FirestoreDB.saveTournament(t);
  _reRenderParticipants();
};

// ── Declarar ausência de participante ──
window._declareAbsent = function (tId, playerName) {
  // v1.0.85-beta: t/partsArr/standby/matchEntry agora são `let` (não `const`)
  // porque a confirm callback re-fetcha e re-deriva tudo a partir do t mais
  // recente do AppStore — onSnapshot pode ter substituído store.tournaments
  // entre dialog-open e confirm.
  let t = window._findTournamentById(tId);
  if (!t) return;
  // v2.3.82: W.O. só por autoridade (org/co-org/árbitro). Consenso de
  // participantes virá num próximo passo.
  if (window._canManagePresence && !window._canManagePresence(t, window.AppStore && window.AppStore.currentUser)) {
    if (typeof showNotification === 'function') {
      showNotification('W.O.', 'Apenas o organizador ou o árbitro pode declarar W.O.', 'info');
    }
    return;
  }

  // Encontrar o time/entry e o match deste participante
  let partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  let teamName = null;
  partsArr.forEach(p => {
    const pName = window._pName(p);
    if (pName.includes('/')) {
      const members = pName.split('/').map(n => n.trim()).filter(n => n);
      if (members.includes(playerName)) teamName = pName;
    } else if (pName === playerName) {
      teamName = pName;
    }
  });

  if (!teamName) return;

  // Encontrar o match onde este time joga — scan todas as shapes via helper canônico.
  // Para elim, a ordem do helper começa com t.matches, preservando o índice amigável.
  // Para Liga/Suíço/Grupos, o índice flat ao menos localiza a partida (antes: silent miss).
  let matchEntry = null;
  let matchIdx = -1;
  let matchSide = null; // 'p1' or 'p2'
  const _allForWO = (typeof window._collectAllMatches === 'function')
    ? window._collectAllMatches(t)
    : (Array.isArray(t.matches) ? t.matches.slice() : []);
  const _normTeam = (s) => (s || '').replace(/\s*\/\s*/g, '/').trim();
  const _teamNameNorm = _normTeam(teamName);
  _allForWO.forEach((m, mi) => {
    if (!m || m.winner) return; // já decidido
    if (matchEntry) return; // já encontrado
    if (_normTeam(m.p1) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p1'; }
    else if (_normTeam(m.p2) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p2'; }
  });

  // Pool de standby CANÔNICO (store.js) — mesmo merge que _processWoSubstitutions.
  const _getName = p => window._pName(p);
  let standby = window._getStandbyPool(t);
  const _removeFromWaitlists = (name) => {
    if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(p => _getName(p) !== name);
    if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(p => _getName(p) !== name);
  };
  let hasStandby = standby.length > 0;
  let friendlyNum = matchIdx >= 0 ? matchIdx + 1 : '?';
  let opponentSide = matchSide === 'p1' ? 'p2' : 'p1';
  let opponent = matchEntry ? matchEntry[opponentSide] : null;

  const woScope = t.woScope || 'individual';
  const isTeamEntry = teamName.includes('/') || teamName.includes(' / ');
  const isIndividualWO = woScope === 'individual' && isTeamEntry;

  let confirmTitle, confirmMsg, confirmBtn;

  if (isIndividualWO) {
    confirmTitle = _t('participants.declareAbsence');
    confirmMsg = _t('participants.absenceMsgIndStandby', {player: playerName, num: friendlyNum});
    confirmBtn = _t('participants.btnSubstInd');
  } else if (hasStandby && !isTeamEntry) {
    // v4.1.38: só o inscrito SOLO (torneio individual) recebe substituto da espera.
    // Dupla em escopo TIME não substitui — faltou 1 → time inteiro leva W.O. (cai no
    // else abaixo). Dupla em escopo INDIVIDUAL já foi tratada no isIndividualWO acima.
    confirmTitle = _t('participants.declareAbsence');
    confirmMsg = _t('participants.absenceMsgTeamStandby', {player: playerName, team: teamName, num: friendlyNum});
    confirmBtn = _t('participants.btnSubstStandby');
  } else {
    confirmTitle = _t('participants.declareAbsenceWO');
    confirmMsg = _t('participants.absenceMsgWO', {player: playerName, team: teamName, num: friendlyNum, opponent: opponent || _t('common.opponent')});
    confirmBtn = _t('participants.btnConfirmWO');
  }

  showConfirmDialog(confirmTitle, confirmMsg, function () {
    // v1.0.85-beta: RE-FETCH t fresh from AppStore. Entre o open do dialog e
    // o confirm do usuário, o onSnapshot do Firestore pode ter substituído
    // store.tournaments (toggle Presente do substituto, por exemplo, dispara
    // write→snapshot→replace em ~200ms). Closure t do escopo externo fica
    // detached — mutations não propagam pra store.tournaments[i] e o sync
    // grava o objeto NOVO sem nossas mutations.
    // Fix: pegar t mais recente AGORA, e re-derivar standby/checkedIn/etc.
    // a partir dele. Match e teamName ainda são válidos (referenciamos por
    // nome/id, não por ref de objeto).
    const _tFresh = window._findTournamentById(tId);
    if (_tFresh) t = _tFresh;
    // Re-derivar standby a partir do t fresh:
    const _spFresh = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
    const _wlFresh = Array.isArray(t.waitlist) ? t.waitlist : [];
    const _spNamesFresh = new Set(_spFresh.map(_getName));
    standby = _spFresh.slice();
    _wlFresh.forEach(w => { const wn = _getName(w); if (wn && !_spNamesFresh.has(wn)) standby.push(w); });
    // Re-find matchEntry no t fresh — match.p1/p2 podem ter mudado em snapshot
    const _allFreshWO = (typeof window._collectAllMatches === 'function')
      ? window._collectAllMatches(t)
      : (Array.isArray(t.matches) ? t.matches.slice() : []);
    matchEntry = null; matchIdx = -1; matchSide = null;
    _allFreshWO.forEach((m, mi) => {
      if (!m || m.winner) return;
      if (matchEntry) return;
      if (_normTeam(m.p1) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p1'; }
      else if (_normTeam(m.p2) === _teamNameNorm) { matchEntry = m; matchIdx = mi; matchSide = 'p2'; }
    });
    // Re-derivar partsArr (alias t.participants atualizado)
    partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    // Recompute derived state que depende de matchEntry/matchSide/standby
    hasStandby = standby.length > 0;
    friendlyNum = matchIdx >= 0 ? matchIdx + 1 : '?';
    opponentSide = matchSide === 'p1' ? 'p2' : 'p1';
    opponent = matchEntry ? matchEntry[opponentSide] : null;

    // v4.0.115: aplicação de W.O. canonizada no motor único window._applyWO E
    // BLINDADA pelo portão AppStore.mutate (Fase B): o motor é PURO (muta o `t`
    // passado, sem save), e mutate o re-aplica ATOMICAMENTE sobre o doc fresco da
    // transação → dois W.O. concorrentes não se sobrescrevem. O organizador é o
    // gatilho FINO: valida permissão + mostra o diálogo (acima). noSubBehavior
    // 'wait' = org espera substituto presente (lista não-vazia, ninguém presente);
    // o claim de jogador usa 'escalate'. Sub, escala, TBD-guard e parceiro→espera
    // vivem no motor. Outcome capturado da execução LOCAL (síncrona) pro toast.
    let _woRes;
    window.AppStore.mutate(tId, function (freshT) {
      const _r = window._applyWO(freshT, { absentName: playerName, scope: 'match', noSubBehavior: 'wait', woScope: freshT.woScope || 'individual' });
      if (_woRes === undefined) _woRes = _r; // 1ª exec (local) = outcome pra UI
    });
    if (_woRes === undefined) _woRes = { ok: false, outcome: 'noMatch' };
    if (typeof showNotification === 'function') {
      const _o = _woRes && _woRes.outcome;
      if (_woRes && _woRes.ok && _o === 'subbed') {
        (_woRes.subDetails || []).forEach(d => showNotification('✅ Substituição W.O.',
          `${d.sub} substituiu ${d.absent} — Jogo ${d.matchNum}`, 'success'));
      } else if (_o === 'waited') {
        showNotification('⚠️ Aguardando substituto presente',
          `Lista de espera tem ${_woRes.poolCount} pessoa(s), 0 presente. ${playerName} marcado ausente.`, 'warning');
      } else if (_o === 'waitedTBD') {
        showNotification('⚠️ Ausente registrado',
          `${playerName} marcado ausente. Adversário ainda não definido — W.O. será aplicado quando o jogo estiver completo.`, 'warning');
      } else if (_o === 'woApplied') {
        if (_woRes.partnerToWaitlist) showNotification('🔄 Parceiro na lista de espera',
          `${_woRes.partnerToWaitlist} foi adicionado à lista de espera para encontrar novo parceiro.`, 'info');
        showNotification('🏆 W.O. — oponente vence', `${_woRes.winner} vence por W.O.`, 'warning');
      } else {
        showNotification('⚠️ Sem jogo pendente', `${playerName} marcado ausente.`, 'warning');
      }
    }
    _reRenderParticipants();
    return;

  }, null, { type: 'warning', confirmText: confirmBtn, cancelText: _t('btn.waitMore') });
};

// ─── CARD DE INSCRITO INDIVIDUAL — FONTE ÚNICA (v1.3.35) ─────────────────────
// O CANÔNICO extraído do renderParticipants pra virar chamável pelas DUAS telas
// (#participants E detalhe do torneio), matando a divergência que fazia o SB testar
// um caminho e a produção outro (dono: "não tem que ter outra opção; a pirata morre").
// Presença (Presente/Ausente·toggle·W.O. + fundo verde/vermelho) vem do MESMO factory
// _rollCallPresenceCtx via ctx.cardPresence — caminho único até na presença.
// ctx = { isOrg, drawDone, canRollCall, postDrawPresence, enrollOrderMap, nameToParticipant,
//         waitSet, cardPresence }. Ver [[project_two_participant_card_renderers]],
// [[project_inscrito_card_canonical]], [[feedback_unify_dual_entry_points]].
window._inscritoIndividualCard = function (t, p, idx, ctx) {
  ctx = ctx || {};
  // v1.3.46: guarda o ctx do último render dos cards de inscrito → o toggle de presença
  // reconstrói SÓ o card tocado no lugar (window._updateCardPresenceInPlace), sem re-render
  // da lista (que fazia os cards "pularem e voltarem" — dono). Todos os cards de UM render
  // compartilham o MESMO ctx, então guardar em toda chamada é idempotente.
  try { window._lastInscritoCardCtx = { tId: (t && t.id), ctx: ctx }; } catch (_eStash) {}
  var isOrg = !!ctx.isOrg, drawDone = !!ctx.drawDone;
  var canRollCall = !!ctx.canRollCall, postDrawPresence = !!ctx.postDrawPresence;
  var _nameToParticipant = ctx.nameToParticipant || {};
  var _enrollOrderMap = ctx.enrollOrderMap || {};
  var _gridWaitSet = ctx.waitSet || {};
  var _T = window._t || function (k) { return k; };
  // IDENTIDADE DO CARD = uid. Só o FICTÍCIO (digitado pelo organizador, sem conta) não tem uid e
  // é controlado pelo nome — regra do dono: quem tem uid é controlado EXCLUSIVAMENTE pelo uid.
  // Vazio de propósito quando a entrada é uma DUPLA: aí o card representa a ENTRADA inteira, e as
  // ações de pessoa (VIP/nível/excluir) valem pra entrada. [[project_uid_identity_canon_locked]]
  var _cardUid = (p && typeof p === 'object' && p.uid && !p.p1Uid && !p.p2Uid && !p.p1Name && !p.p2Name)
    ? String(p.uid).replace(/'/g, "\\'") : '';
  // v1.3.67: resolve o nome pelo UID ANTES do fallback "Participante N"/email. Entrada só-uid
  // (nome stripado no save — cânone: identidade é uid) caía direto no "Participante N" e o card
  // (e o data-lj-name do drag de formar dupla) mostrava "Participante 2" no lugar do nome real.
  // Ver [[project_uid_identity_canon_locked]].
  var _pUidN = (p && typeof p === 'object') ? (p.uid || '') : '';
  var pName = (typeof p === 'string') ? p
    : (p.displayName || p.name
       || (_pUidN && typeof window._displayNameForUid === 'function' ? window._displayNameForUid(_pUidN, '') : '')
       || p.email || _T('participants.participant', { n: idx + 1 }));
  var isTeam = !!window._entryTeamMembers(p);
  var _isOrgP = (typeof window._isOrgPlayer === 'function') && window._isOrgPlayer(t, pName, p);
  var _orgStar = _isOrgP ? '<span title="Organizador" aria-label="Organizador" style="flex-shrink:0;color:#fbbf24;font-size:0.95rem;line-height:1;">⭐</span>' : '';

  // Presença via factory compartilhado (rowHtml = Presente/Ausente·toggle·W.O.; styleExtra
  // = fundo verde/vermelho; skip = filtro presente/ausente/aguardando). Caminho ÚNICO.
  var _pr = (typeof ctx.cardPresence === 'function') ? ctx.cardPresence(p) : null;
  if (_pr && _pr.skip) return '';
  var _presenceGroup = _pr ? (_pr.rowHtml || '') : '';
  var _rcCardExtra = _pr ? (_pr.styleExtra || '') : '';

  var _isStandbyEntry = !!(p && typeof p === 'object' && p._isStandbyEntry) || !!_gridWaitSet[(pName || '').toLowerCase().trim()];
  var isVip = window._entryHasVip(t, p || pName);
  var cardStyle = '';
  if (isVip) cardStyle = 'background: linear-gradient(135deg, rgba(161,98,7,0.5) 0%, rgba(234,179,8,0.35) 100%); border: 2px solid rgba(251,191,36,0.7); box-shadow: 0 0 12px rgba(251,191,36,0.15);';
  else if (_isStandbyEntry) cardStyle = 'background: linear-gradient(135deg, rgba(146,64,14,0.55) 0%, rgba(245,158,11,0.42) 100%); border: 2px solid rgba(251,191,36,0.55);';
  else if (isTeam) cardStyle = 'background: linear-gradient(135deg, rgba(15, 118, 110, 0.6) 0%, rgba(20, 184, 166, 0.6) 100%); border: 1px solid rgba(20, 184, 166, 0.5);';
  else cardStyle = 'background: linear-gradient(135deg, rgba(67, 56, 202, 0.6) 0%, rgba(99, 102, 241, 0.6) 100%); border: 1px solid rgba(99, 102, 241, 0.5);';
  // v1.3.36: modo PAREAMENTO TARDIO (lista de espera pós-sorteio, _renderLateJoinPairing) —
  // âmbar de propósito (janela de formar dupla na R1). Card canônico, só muda a pele + o arraste.
  if (ctx.lateJoin) cardStyle = 'background:linear-gradient(135deg,rgba(180,120,20,0.32),rgba(245,158,11,0.26));border:1px solid rgba(245,158,11,0.5);' + (ctx.lateJoin.canPair ? 'cursor:grab;-webkit-user-select:none;user-select:none;' : '');

  var _FONT = window._INSCRITO_NAME_FONT_PX || 17;
  var pNameHtml = '';
  if (isTeam) {
    pNameHtml = pName.split('/').map(function (n) {
      var _nm = n.trim();
      var _nmSafe = _nm.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      var _mSeed = encodeURIComponent(_nm);
      var _mCached = (window._playerPhotoCache && window._playerPhotoCache[_nm.toLowerCase()] && window._playerPhotoCache[_nm.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[_nm.toLowerCase()] : '';
      var _mInitials = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _mSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
      var _mPhoto = _mCached || _mInitials;
      var _mErr = 'onerror="this.onerror=null;this.src=\'' + _mInitials + '\'"';
      var _nmH = window._safeHtml(_nm);
      var _mPart = _nameToParticipant && _nameToParticipant[_nm];
      var _mUid = '';
      if (_mPart && typeof _mPart === 'object') {
        if (_mPart.p1Name && _nm === String(_mPart.p1Name).trim()) _mUid = _mPart.p1Uid || '';
        else if (_mPart.p2Name && _nm === String(_mPart.p2Name).trim()) _mUid = _mPart.p2Uid || '';
        else _mUid = _mPart.uid || '';
      }
      var _mUidJs = _mUid ? (',{uid:\'' + _mUid + '\',tournamentId:\'' + t.id + '\'}') : (',{tournamentId:\'' + t.id + '\'}');
      var _mDisp = _mUid ? window._safeHtml(window._displayName(_mUid, _nm)) : _nmH;
      var _mUidAttr = _mUid ? ' data-uid-name="' + window._safeHtml(_mUid) + '"' : '';
      var _editAttr = isOrg ? 'onclick="event.stopPropagation();window._editParticipantName(\'' + t.id + '\',\'' + _nmSafe + '\')" title="Clique para editar" style="font-weight:700;font-size:' + _FONT + 'px;color:var(--text-bright);white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;cursor:text;"' : 'style="font-weight:700;font-size:' + _FONT + 'px;color:var(--text-bright);white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile===\'function\')window._openPlayerProfile(\'' + _nmSafe + '\'' + _mUidJs + ');else if(typeof window._showPlayerStats===\'function\')window._showPlayerStats(\'' + _nmSafe + '\')" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" title="Ver perfil de ' + _nmH + '"';
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;overflow:hidden;"><img src="' + _mPhoto + '" ' + _mErr + ' data-player-name="' + _nmH + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span' + _mUidAttr + ' ' + _editAttr + '>' + _mDisp + '</span></div>';
    }).join('') + (_orgStar ? '<div style="margin-top:2px;">' + _orgStar + '</div>' : '');
  } else {
    var _pSafe = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var _pSeedN = encodeURIComponent(pName);
    var _pCachedN = (window._playerPhotoCache && window._playerPhotoCache[pName.toLowerCase()] && window._playerPhotoCache[pName.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[pName.toLowerCase()] : '';
    var _pInitialsN = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeedN + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
    var _pPhotoN = _pCachedN || _pInitialsN;
    var _pErrN = 'onerror="this.onerror=null;this.src=\'' + _pInitialsN + '\'"';
    var _pNameH = window._safeHtml(pName);
    // v1.3.38: uid vem DIRETO de p (fonte da verdade). Antes buscava _nameToParticipant[pName],
    // mas com displayName/name stripados (contas com uid) pName cai pro EMAIL e o mapa é chaveado
    // pelo NOME resolvido → lookup falha → _pUid vazio → nome preso no email/"Participante N" e SEM
    // data-uid-name (não re-hidrata). p.uid resolve sempre; mapa só fallback p/ p string.
    var _pPart = _nameToParticipant && _nameToParticipant[pName];
    var _pUid = (typeof p === 'object' && p && p.uid) ? p.uid : ((_pPart && typeof _pPart === 'object') ? (_pPart.uid || '') : '');
    var _pUidJs = _pUid ? (',{uid:\'' + _pUid + '\',tournamentId:\'' + t.id + '\'}') : (',{tournamentId:\'' + t.id + '\'}');
    var _pDisp = _pUid ? window._safeHtml(window._displayName(_pUid, pName)) : _pNameH;
    var _pUidAttr = _pUid ? ' data-uid-name="' + window._safeHtml(_pUid) + '"' : '';
    var _editAttrN = isOrg ? 'onclick="event.stopPropagation();window._editParticipantName(\'' + t.id + '\',\'' + _pSafe + '\')" title="Clique para editar" style="font-weight:700;font-size:' + _FONT + 'px;color:var(--text-bright);white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;cursor:text;"' : 'style="font-weight:700;font-size:' + _FONT + 'px;color:var(--text-bright);white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;cursor:pointer;" onclick="event.stopPropagation();if(typeof window._openPlayerProfile===\'function\')window._openPlayerProfile(\'' + _pSafe + '\'' + _pUidJs + ');else if(typeof window._showPlayerStats===\'function\')window._showPlayerStats(\'' + _pSafe + '\')" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" title="Ver perfil de ' + _pNameH + '"';
    pNameHtml = '<div style="display:flex;align-items:center;gap:8px;overflow:hidden;"><img src="' + _pPhotoN + '" ' + _pErrN + ' data-player-name="' + _pNameH + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;"><span' + _pUidAttr + ' ' + _editAttrN + '>' + _pDisp + '</span>' + _orgStar + '</div>';
  }

  var safeP = pName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var teamOrigins = t.teamOrigins || {};
  var teamLabel = _T('participants.teamIndividual');
  if (isTeam) {
    var origin = teamOrigins[pName];
    if (origin === 'inscrita') teamLabel = _T('tourn.teamEnrolled');
    else if (origin === 'sorteada') teamLabel = _T('tourn.teamDrawn');
    else teamLabel = _T('tourn.teamFormed');
  }
  var _standbyBadge = _isStandbyEntry ? '<span style="background:linear-gradient(135deg,#92400e,#f59e0b);color:#1a1a2e;font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;">🕐 Lista de Espera</span>' : '';
  var typeText = _isStandbyEntry ? _standbyBadge : teamLabel;
  if (ctx.lateJoin && !isTeam) typeText = '<span style="font-size:0.62rem;color:rgba(255,255,255,0.5);">' + (ctx.lateJoin.canPair ? 'Segure e arraste sobre outro card para formar dupla' : 'Sem dupla') + '</span>';

  var _nmSkillCats = t.skillCategories || [];
  var _nmSkillHtml = '';
  if (_nmSkillCats.length > 0) {
    var _nmCatStr = (typeof p === 'object' && p !== null) ? (p.category || '') : '';
    var _nmCurrentSkill = '';
    for (var _si = 0; _si < _nmSkillCats.length; _si++) { var _sk = _nmSkillCats[_si]; if (_nmCatStr === _sk || _nmCatStr.endsWith(' ' + _sk)) { _nmCurrentSkill = _sk; break; } }
    if (isOrg && !_isStandbyEntry) {
      var _nmOpts = _nmSkillCats.map(function (sk) { return '<option value="' + sk + '" ' + (_nmCurrentSkill === sk ? 'selected' : '') + '>' + sk + '</option>'; }).join('');
      _nmSkillHtml = '<select onchange="event.stopPropagation();window._setParticipantSkillCategory(\'' + t.id + '\',\'' + safeP + '\',this.value,\'' + _cardUid + '\')" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:4px;"><option value="" ' + (!_nmCurrentSkill ? 'selected' : '') + '>— nível</option>' + _nmOpts + '</select>';
    }
  }

  var dragProps = '', _vipBtn = '', _delBtn = '', _splitBtn = '', undoMergeBtn = '';
  if (isOrg && p && typeof p === 'object' && p._mergedFrom) {
    undoMergeBtn = '<button class="btn btn-micro" title="Desfazer mesclagem" style="background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px dashed rgba(251,191,36,0.5);" onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'none\'" onclick="event.stopPropagation(); window._undoMergeParticipant(\'' + t.id + '\', \'' + safeP + '\');">↩️</button>';
  }
  if (isOrg && !_isStandbyEntry) {
    dragProps = 'draggable="true" ondragstart="window.handleDragStart(event, ' + idx + ', \'' + t.id + '\')" ondragend="window.handleDragEnd(event)" ondragover="window.handleDragOver(event)" ondragenter="window.handleDragEnter(event)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDropTeam(event, ' + idx + ')"';
    if (!drawDone) {
      _vipBtn = '<button class="btn btn-micro" title="' + (isVip ? _T('tourn.removeVip') : _T('tourn.markVip')) + '" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;flex-shrink:0;background: ' + (isVip ? 'linear-gradient(135deg,rgba(234,179,8,0.35),rgba(251,191,36,0.25))' : 'rgba(234,179,8,0.08)') + '; color: ' + (isVip ? '#fbbf24' : '#a3842a') + '; border: 1px ' + (isVip ? 'solid' : 'dashed') + ' ' + (isVip ? 'rgba(251,191,36,0.6)' : 'rgba(234,179,8,0.3)') + ';" onclick="event.stopPropagation(); window._toggleVip(\'' + t.id + '\', \'' + safeP + '\', \'' + _cardUid + '\');">💎 VIP</button>';
      // Este ✕ é da ENTRADA inteira (dupla sai inteira) → NÃO manda uid de membro: mandar
      // p.uid (que numa dupla é o uid do p1) tiraria só uma pessoa e deixaria a outra.
      _delBtn = '<button type="button" class="cancel-x-btn" title="' + _T('btn.remove') + '" style="--cx-size:22px;" onclick="event.stopPropagation(); window.removeParticipantFunction(\'' + t.id + '\', \'' + safeP + '\', \'' + _cardUid + '\');">✕</button>';
      if (window._entryTeamMembers(p)) {
        _splitBtn = '<button class="btn btn-micro" title="' + _T('participants.splitTeam') + '" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.7rem;font-weight:800;flex-shrink:0;background: rgba(14,165,233,0.1); color: #38bdf8; border: 1px dashed #0ea5e9;" onclick="event.stopPropagation(); window.splitParticipantFunction(\'' + t.id + '\', \'' + safeP + '\');">✂️</button>';
      }
    }
  }
  // v1.3.36: pareamento tardio → arraste pointer-drag (data-lj-*), NÃO HTML5 DnD (trava no
  // touch). VIP/✂️/🗑️ já saem sozinhos (drawDone=true). Mantém o handler exato do painel.
  if (ctx.lateJoin) {
    dragProps = ctx.lateJoin.canPair
      ? ('data-lj-card="1" data-lj-key="' + window._safeHtml(String((p && typeof p === 'object' && p.uid) || pName)) + '" data-lj-tid="' + window._safeHtml(t.id) + '" data-lj-name="' + window._safeHtml(pName) + '"')
      : '';
  }

  var _gPart = (typeof p === 'object' && p !== null) ? p : (_nameToParticipant && _nameToParticipant[pName]);
  var _fGender = (typeof window._canonGender === 'function') ? window._canonGender(window._pGender(_gPart)) : 'none'; // v1.3.39: perfil-first
  var _fSkill = 'none';
  var _fSkillCats = t.skillCategories || [];
  var _fCatStr = (_gPart && typeof _gPart === 'object') ? (_gPart.category || '') : '';
  for (var _fi = 0; _fi < _fSkillCats.length; _fi++) { if (_fCatStr === _fSkillCats[_fi] || _fCatStr.endsWith(' ' + _fSkillCats[_fi])) { _fSkill = _fSkillCats[_fi]; break; } }
  var _fEnrollNum = (typeof window._enrollNumber === 'function') ? window._enrollNumber(_enrollOrderMap, _gPart || pName) : '';
  var _fOrder = (_fEnrollNum !== '' && _fEnrollNum != null) ? (_fEnrollNum - 1) : idx;
  // v1.3.45/48: _dragName = nome de EXIBIÇÃO resolvido POR UID (perfil vivo). Usado em:
  // (a) data-participant-name — o CSS do modo compacto de arraste
  // (body.sp-drag-compact .participant-card::before) le ESTE atributo pra mostrar só o nome ao
  // arrastar (a extração v1.3.35 tinha dropado → nome sumia); (b) data-part-name — a CHAVE de
  // ORDENAÇÃO/BUSCA. Como o inscrito grava SÓ uid (nome stripado, canon), `pName` cai pro EMAIL
  // → ordenar/buscar por pName ordenava por email (Angelica Reck sob "m" de mangelica@...).
  // Ambos são RE-HIDRATADOS por uid em _hydrateUidNames (+ re-sort) quando o perfil chega.
  var _dragName = isTeam ? pName : (function () {
    var _u = (typeof p === 'object' && p && p.uid) ? p.uid : '';
    return (_u && typeof window._displayName === 'function') ? window._displayName(_u, pName) : pName;
  })();
  var _fNameAttr = (_dragName || pName || '').toLowerCase().replace(/"/g, '&quot;');
  var _fInactive = (t.allowSelfDeactivation !== false && _gPart && _gPart.ligaActive === false) ? '1' : '0';
  var _metaSlots = (typeof window._profileMetaSlots === 'function') ? window._profileMetaSlots(p, pName, isTeam, t, isOrg, { inline: true }) : '';
  var _wmNum = (function () { var _n = (typeof _fOrder === 'number') ? (_fOrder + 1) : ''; return (typeof window._enrollNumberBadge === 'function') ? window._enrollNumberBadge(_n, 'right') : ''; })();

  return '' +
    '<div class="participant-card" data-part-card="1" data-part-org="' + (_isOrgP ? '1' : '0') + '" data-part-vip="' + (isVip ? '1' : '0') + '" data-part-standby="' + (_isStandbyEntry ? '1' : '0') + '" data-part-name="' + _fNameAttr + '" data-participant-name="' + window._safeHtml(_dragName) + '" data-card-key="' + window._safeHtml(String((typeof p === 'object' && p && p.uid) ? p.uid : pName)) + '" data-card-idx="' + idx + '" data-part-uid="' + window._safeHtml(String((typeof p === 'object' && p && p.uid && !isTeam) ? p.uid : '')) + '" data-part-inactive="' + _fInactive + '" data-part-gender="' + _fGender + '" data-part-skill="' + String(_fSkill).replace(/"/g, '&quot;') + '" data-part-order="' + _fOrder + '" ' + dragProps + ' style="' + cardStyle + ' border-radius:12px;padding:12px;position:relative;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);transition:all 0.2s;' + (isOrg ? 'cursor:grab;' : '') + _rcCardExtra + '" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'">' +
      _wmNum +
      '<div style="position:relative;z-index:1;">' +
        pNameHtml +
        '<div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' + (ctx.lateJoin ? 'justify-content:space-between;' : '') + '">' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;' + (ctx.lateJoin ? 'flex:1 1 auto;' : '') + '" onclick="event.stopPropagation();">' + _vipBtn + _metaSlots + _nmSkillHtml + '</div>' +
          // v1.3.55: no pareamento tardio ("Sem dupla") a AÇÃO (Presente/Ausente·toggle·W.O.·✕)
          // vem na MESMA linha das categorias (economiza 1 linha) — o hint "arraste…" fica sozinho
          // abaixo. Fora do lateJoin, a ação segue no _inscritoActionRow (tipo+ação mesma linha).
          (ctx.lateJoin
            ? ('<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;" onclick="event.stopPropagation();">' + _presenceGroup + _delBtn + '</div>')
            : ((_splitBtn || undoMergeBtn) ? '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto;flex-wrap:wrap;" onclick="event.stopPropagation();">' + _splitBtn + undoMergeBtn + '</div>' : '')) +
        '</div>' +
        (ctx.lateJoin
          ? (typeText ? '<div style="margin-top:5px;">' + typeText + '</div>' : '')
          : window._inscritoActionRow(typeText, _presenceGroup, _delBtn)) +
      '</div>' +
    '</div>';
};

function renderParticipants(container, tournamentId) {
  if (window._autoKeepScroll) window._autoKeepScroll(); // v2.8.82: re-render por ação não pula scroll
  const tId = tournamentId;
  const t = tId && window.AppStore ? window._findTournamentById(tId) : null;

  var _t = window._t || function(k) { return k; };
  if (!t) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:3rem;"><h3>${_t('participants.notFound')}</h3><a href="#dashboard" class="btn btn-primary" style="margin-top:1rem;display:inline-block;">Dashboard</a></div>`;
    return;
  }

  // v4.5.64: PERFIS DOS PARTICIPANTES = PRÉ-REQUISITO DO RENDER. Nome resolve vivo por
  // uid (users/{uid}); sem fallback pra nome gravado. Garante os perfis e re-renderiza
  // (soft) quando chegam. Cache persiste → revisita quente. Guard evita loop.
  (function _ensureProfilesP() {
    if (typeof window._preloadUserProfiles !== 'function') return;
    var _need = [];
    var _push = function(u){ if (u && typeof u === 'string' && u.indexOf(' ') === -1 && !window._userProfileCache[u]) _need.push(u); };
    var _pl = (t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : []);
    _pl.forEach(function(p){ if (typeof window._participantUids === 'function') { (window._participantUids(p) || []).forEach(_push); } else if (p && typeof p === 'object') { _push(p.uid); _push(p.p1Uid); _push(p.p2Uid); } });
    if (Array.isArray(t.memberUids)) t.memberUids.forEach(_push);
    if (!_need.length) return;
    var _k = '_tprofP_' + (t.id || '');
    if (window[_k]) return;
    window[_k] = true;
    window._preloadUserProfiles(_need).then(function(){ window[_k] = false; if ((window.location.hash || '').indexOf('participants') !== -1 && typeof window._softRefreshView === 'function') { try { window._softRefreshView(); } catch (e) {} } }).catch(function(){ window[_k] = false; });
  })();
  function _hydrateNamesP() { if (typeof window._hydrateUidNames === 'function') { try { window._hydrateUidNames(container); } catch (e) {} } }
  // Pre-load player photos from Firestore (async update after render)
  if (typeof _preloadPlayerPhotos === 'function') {
    window._aplicarFotosInscritos = function() {
      var pImgs = container.querySelectorAll('img[data-player-name]');
      pImgs.forEach(function(img) {
        var nm = img.getAttribute('data-player-name');
        var real = window._playerPhotoCache && window._playerPhotoCache[(nm || '').toLowerCase()];
        if (real && real.indexOf('dicebear.com') === -1 && img.src.indexOf('dicebear.com') !== -1) {
          var fb = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
          img.onerror = function() { this.onerror = null; this.src = fb; };
          img.src = real;
        }
      });
    };
    _preloadPlayerPhotos(t).then(window._aplicarFotosInscritos).catch(function() {}).then(_hydrateNamesP);
  } else { setTimeout(_hydrateNamesP, 0); }

  const isOrg = typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t);
  const parts = typeof window._getCompetitors === 'function' ? window._getCompetitors(t) : (t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : []);

  // v4.5.78: expande uma entrada em NOMES DE PESSOAS — dupla ESTRUTURAL (p1Name/
  // p2Name) = 2, "A / B" legado = 2, solo = 1. NÃO usa só _pName(p): em dupla formada
  // por convite o _pName devolve só o p1 → contava dupla como 1. Ver
  // [[project_count_people_not_entries]].
  const _expandMemberNames = (p) => {
    if (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) return [(window._displayName(p.p1Uid || '', p.p1Name || '') || p.p1Uid || ''), (window._displayName(p.p2Uid || '', p.p2Name || '') || p.p2Uid || '')].filter(Boolean); // v4.5.86: uid OU nome (migração ITEM 3/Fase 4 apaga nome de quem tem uid)
    const n = window._pName(p);
    if (n && n.indexOf('/') !== -1) return n.split('/').map(s => s.trim()).filter(Boolean);
    return n ? [n] : [];
  };
  // v1.3.48: expande a PESSOA com o UID (identidade). A presença é gravada por uid; contar/
  // casar por NOME (que cai pro email quando o inscrito grava só uid) NÃO bate → o count ficava
  // errado ("Presentes (4)" com 16 gravados). `who` = {uid, name} → _idMapHas resolve por uid;
  // guest sem uid cai no nome. Ver [[project_id_maps_uid_keyed]] / [[project_uid_identity_canon_locked]].
  // Delega à FONTE ÚNICA global (evita drift entre a contagem do render e a barra in-place).
  const _expandMemberWho = window._expandParticipantWho;
  // `who` pronto pro _idMap*/_entryPresent: objeto {uid,displayName} quando há uid; senão o nome.
  const _whoOf = (w) => (w && w.uid) ? { uid: w.uid, displayName: w.name } : (w ? w.name : '');
  const _whoKey = (w) => ((w && (w.uid || w.name)) || '').toLowerCase();
  let individualCount = 0;
  parts.forEach(p => { individualCount += _expandMemberNames(p).length; });

  // Ordenar: Times primeiro, depois individuais
  parts.sort((a, b) => {
    const nameA = window._pName(a);
    const nameB = window._pName(b);
    const isTeamA = nameA.includes('/');
    const isTeamB = nameB.includes('/');
    if (isTeamA && !isTeamB) return -1;
    if (!isTeamA && isTeamB) return 1;
    return 0;
  });
  t.participants = parts;

  // v2.3.52: meta de perfil (gênero · nível · faixa etária) abaixo do nome no
  // card de inscritos — só pro ORGANIZADOR. Helpers compartilhados em store.js
  // (window._profileMetaSlots / _loadParticipantProfilesByName /
  // _patchProfileMetaSlots) pra a mesma lógica valer aqui e na seção "Inscritos
  // Confirmados" do detalhe do torneio (tournaments.js), sem divergir.
  function _metaSlotsFor(p, pName, isTeam, opts) {
    return (typeof window._profileMetaSlots === 'function')
      ? window._profileMetaSlots(p, pName, isTeam, t, isOrg, opts) : '';
  }
  // v2.4.70: hidrata os badges de meta (gênero/nível/idade) pra TODOS os inscritos,
  // não só o organizador — as categorias são informação pública da chave.
  // v1.3.50: garante o perfil POR UID (gênero/skill/idade em _userProfileCache) ANTES do patch —
  // o loader por-nome pulava as entradas só-uid (nome vazio) → gênero/categoria sumiam. Espera
  // os dois (nome + uid) e então aplica os badges (o patch resolve por uid primeiro).
  if (typeof window._patchProfileMetaSlots === 'function') {
    var _mUids = [];
    parts.forEach(function (p) { if (typeof window._participantUids === 'function') (window._participantUids(p) || []).forEach(function (u) { if (u) _mUids.push(u); }); });
    var _patch = function () { try { window._patchProfileMetaSlots(container, t); } catch (e) {} };
    var _pName = (typeof window._loadParticipantProfilesByName === 'function') ? window._loadParticipantProfilesByName(parts) : Promise.resolve();
    var _pUid = (_mUids.length && typeof window._preloadUserProfiles === 'function') ? window._preloadUserProfiles(_mUids) : Promise.resolve();
    Promise.all([Promise.resolve(_pName), Promise.resolve(_pUid)]).then(_patch).catch(_patch);
  }

  // ── Check-in logic ──
  const hasMatches = (t.matches && t.matches.length > 0) || (t.rounds && t.rounds.length > 0) || (t.groups && t.groups.length > 0);
  const drawDone = hasMatches || t.status === 'started' || t.status === 'in_progress';
  const canCheckIn = drawDone && !!t.tournamentStarted;

  // v2.1.86: CHAMADA pré-sorteio (roll-call). O organizador acessa os inscritos
  // ANTES do sorteio, marca quem está presente e decide o destino dos ausentes
  // (desclassificar ou enviar à lista de espera). O sorteio roda só entre os
  // presentes. Diferente do check-in pós-início (canCheckIn), aqui a presença é
  // marcada por ENTRY (time ou individual) — a unidade que entra no sorteio.
  const isFinished = t.status === 'finished';
  // v2.4.31: Liga com SORTEIO AUTOMÁTICO (drawManual !== true + data/periodicidade
  // configurada) NÃO tem chamada nem botão de sortear — o sorteio roda sozinho no
  // horário agendado. A chamada pré-sorteio (roll-call) só vale pro sorteio
  // MANUAL. Mesma regra de isLigaAutoDraw em tournaments.js:1508.
  const _isLigaAutoDraw = window._isLigaAutoDraw(t); // v2.7.5: canônico (store.js)
  const canRollCall = isOrg && !drawDone && !isFinished && !_isLigaAutoDraw;

  if (!t.checkedIn) t.checkedIn = {};
  if (!t.absent) t.absent = {};
  const checkedIn = t.checkedIn;
  const absent = t.absent;

  // v2.2.40: presença da CHAMADA continua visível DEPOIS do sorteio (antes de
  // iniciar). Quem foi marcado presente na chamada permanece presente na lista
  // de inscritos. Detecção é por ENTRY (nome direto) OU, sendo dupla "A / B",
  // por todos os membros — cobre duplas formadas no sorteio a partir de
  // indivíduos (o check-in foi feito nos nomes individuais).
  // Aceita OBJETO {uid} (chaveia por uid — homônimo não colide) OU string nome (guest/dupla "A / B").
  const _entryPresent = (who) => {
    if (!who) return false;
    if (window._idMapHas(t, absent, who)) return false;
    if (window._idMapHas(t, checkedIn, who)) return true;
    if (typeof who === 'string' && who.indexOf('/') !== -1) {
      const ms = who.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.every(m => window._idMapHas(t, checkedIn, m))) return true;
    }
    return false;
  };
  const _entryAbsent = (who) => {
    if (!who) return false;
    if (window._idMapHas(t, absent, who)) return true;
    if (typeof who === 'string' && who.indexOf('/') !== -1) {
      const ms = who.split('/').map(s => s.trim()).filter(Boolean);
      if (ms.length >= 2 && ms.some(m => window._idMapHas(t, absent, m))) return true;
    }
    return false;
  };
  // Pós-sorteio antes de iniciar: presença visível em modo somente leitura
  // (a chamada já foi feita; alterações de presença vêm pelo check-in pós-início).
  // Só ativa se HOUVE chamada (algum check-in/ausência) — torneios que não usam
  // chamada mantêm a grade normal pós-sorteio, sem rótulos de presença.
  const _hasRollCallData = Object.keys(checkedIn).length > 0 || Object.keys(absent).length > 0;
  const postDrawPresence = isOrg && drawDone && !canCheckIn && !isFinished && _hasRollCallData;

  // v2.7.52: LISTA DE ESPERA CANÔNICA — _getWaitlist une os 3 storages
  // (waitlist + standbyParticipants + monarchWaitlist por categoria). Antes lia só
  // os 2 primeiros e a espera do Rei/Rainha (monarchWaitlist) sumia dos Inscritos.
  const _getStandbyName = p => window._pName(p);
  const standbyParts = (typeof window._getWaitlist === 'function')
    ? window._getWaitlist(t)
    : (Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : []);

  // Count stats (includes standby): 3 states — presente, ausente, sem confirmação
  let totalIndividuals = 0;
  let checkedCount = 0;
  let absentConfirmedCount = 0;
  // v3.0.x: conta PESSOAS distintas (dedup por nome) — solo que está nos inscritos E na
  // lista de espera conta 1×. E conta a espera SEMPRE que há sorteio (a grade pós-sorteio
  // é por indivíduo): antes só em canCheckIn, deixando o total por ENTRADA (53 duplas+solos)
  // em vez de por PESSOA (103). Mantém 103 consistente com os cards.
  const _countedNames = {};
  const countIndividuals = (arr) => {
    arr.forEach(p => {
      _expandMemberWho(p).forEach(w => {
        const k = _whoKey(w);
        if (!k || _countedNames[k]) return;
        _countedNames[k] = 1;
        totalIndividuals++;
        const who = _whoOf(w); // uid-first: a presença é gravada por uid
        if (window._idMapHas(t, checkedIn, who)) checkedCount++; else if (window._idMapHas(t, absent, who)) absentConfirmedCount++;
      });
    });
  };
  countIndividuals(parts);
  if (drawDone) countIndividuals(standbyParts);

  // ── Contagem da CHAMADA por PESSOA (dupla = 2), dedup — a presença é por jogador
  //    (toggle por membro), então a barra conta gente, não entradas. v4.5.78.
  let rcTotal = 0, rcPresent = 0, rcAbsent = 0;
  if (canRollCall || postDrawPresence) {
    const _seenRc = {};
    parts.forEach(p => {
      _expandMemberWho(p).forEach(w => {
        const k = _whoKey(w);
        if (!k || _seenRc[k]) return;
        _seenRc[k] = 1;
        rcTotal++;
        const who = _whoOf(w); // uid-first
        if (_entryPresent(who)) rcPresent++;
        else if (_entryAbsent(who)) rcAbsent++;
      });
    });
  }
  const rcPending = rcTotal - rcPresent - rcAbsent;

  const currentFilter = window._checkInFilter || 'all';

  // ── Build cards ──
  let cardsStr = '';
  // itens + construtor da lista fatiável (null = caminho que não fatia, ex.: seções de duplas)
  let _fatiaItens = null, _fatiaMonta = null;
  let gridStyle = '';

  // v2.1.3: mapa nome→participante usado tanto no modo check-in quanto na GRADE
  // (foto/perfil do jogador). Antes era declarado só dentro do if (canCheckIn),
  // então a grade (else — torneio pré-sorteio OU sorteado-não-iniciado) dava
  // ReferenceError ao usá-lo → tela de Inscritos ficava preta. Agora vive no
  // escopo da função, disponível pros dois caminhos.
  const _nameToParticipant = {};
  (t.participants || []).forEach(function(p) {
    if (!p) return;
    const pn = window._pName(p);
    if (pn) _nameToParticipant[pn] = p;
    if (typeof p === 'object' && pn && pn.includes('/')) {
      pn.split('/').forEach(function(nm) { const t2 = nm.trim(); if (t2) _nameToParticipant[t2] = p; });
    }
  });

  if (drawDone) {
    // v3.0.x: SEMPRE que há sorteio (jogos criados) mostra a grade RICA canônica —
    // cada jogador com seu PRIMEIRO JOGO (parceiro + adversários + Jogo N) — mesmo
    // antes de "Iniciar Torneio". Antes exigia tournamentStarted (canCheckIn), então
    // sorteado-mas-não-iniciado caía na grade simples "Equipe Sorteada" sem o jogo.
    // ── Check-in mode: individual list with checkboxes ──
    // v2.7.28: card ÚNICO — pós-sorteio usa a MESMA grade rica do pré-sorteio.
    // v2.7.39: o card pós-sorteio é mais largo (jogo/parceiro/adversários) → grade
    // de cards LARGOS: 1 coluna no mobile, 2-3 nas telas maiores (não muitas estreitas).
    // min(100%,440px) garante 1 coluna sem overflow em telas estreitas.
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(min(100%, 440px), 1fr));gap:1rem;';

    // v0.17.36: lookup é POR NOME DE MEMBRO, não por team string. Quando
    // substituição W.O. acontece, o match é atualizado pra novo team
    // ("Bot 04 / [sub]") mas t.participants pode ficar fora de sincronia
    // por race condition ou string mismatch — o lookup por team name falha
    // e o card do parceiro perde matchNum/opponent. Indexando por member
    // direto, encontramos sempre o match atual independente do team string.
    // Bonus: memberToTeam dá o team string da MATCH (source of truth pra
    // composição atual), não do t.participants (pode ser stale).
    const memberToMatch = {};
    const memberToMatchDecided = {};
    const memberToOpponent = {};
    const memberToTeam = {};
    const _allForCheckin = (typeof window._collectAllMatches === 'function')
      ? window._collectAllMatches(t)
      : (Array.isArray(t.matches) ? t.matches.slice() : []);
    _allForCheckin.forEach((m, mi) => {
      if (!m) return;
      const num = mi + 1;
      ['p1', 'p2'].forEach(slot => {
        const teamStr = m[slot];
        if (!teamStr || teamStr === 'TBD' || teamStr === 'BYE') return;
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const opp = m[oppSlot];
        const oppValid = opp && opp !== 'TBD' && opp !== 'BYE' ? opp : null;
        const members = teamStr.includes('/') ? teamStr.split('/').map(n => n.trim()).filter(n => n) : [teamStr];
        members.forEach(memberName => {
          // Não sobrescrever — primeiro match em que o membro aparece vence.
          // (Caso edge: jogador em múltiplos matches no mesmo bracket — raro
          // mas possível em Liga/Rei-Rainha.)
          if (memberToMatch[memberName] != null) return;
          memberToMatch[memberName] = num;
          memberToMatchDecided[memberName] = !!m.winner;
          memberToOpponent[memberName] = oppValid;
          memberToTeam[memberName] = teamStr;
        });
      });
    });

    const allIndividuals = [];
    const _indivByName = {}; // v3.0.x: dedup — nome → objeto já adicionado
    // v0.17.35: jogadores em t.woHistory são pulados aqui — eles aparecem
    // só via card solo de orphan (loop abaixo). Evita aparecer 2x. O skip usa
    // window._woHistHas (uid-first) — woHistory é chaveado por uid (v3.0.78).
    parts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || _t('participants.participant', {n: idx + 1}));
      const isTeam = !!window._entryTeamMembers(p); // v3.0.x: time por estrutura (slots), não por '/'
      const namesToProcess = isTeam ? pName.split('/').map(n => n.trim()).filter(n => n) : [pName];
      namesToProcess.forEach(n => {
        if (window._woHistHas(t, n)) return; // skip W.O.'d member (uid-first) — solo card via woHistory loop
        if (_indivByName[n.toLowerCase()]) return; // já adicionado
        // v0.17.36: lookup por nome do membro (source of truth: match atual).
        // memberToTeam dá o team string da match — pode diferir de pName se
        // t.participants estiver stale após substituição.
        const matchNum = memberToMatch[n] || null;
        const matchDecided = !!memberToMatchDecided[n];
        const opponent = memberToOpponent[n] || null;
        const currentTeam = memberToTeam[n] || (isTeam ? pName : null);
        // v4.5.64: uid ESTRUTURAL do slot (não lookup por nome — imune a nome gravado
        // corrompido). Nome exibido resolve do perfil vivo por esse uid.
        let _slotUid = '';
        if (p && typeof p === 'object') {
          if (p.p1Name && n === String(p.p1Name).trim()) _slotUid = p.p1Uid || '';
          else if (p.p2Name && n === String(p.p2Name).trim()) _slotUid = p.p2Uid || '';
          else _slotUid = p.uid || '';
        }
        const _obj = { name: n, uid: _slotUid, teamName: currentTeam, teamIdx: idx, matchNum, matchDecided, opponent };
        allIndividuals.push(_obj);
        _indivByName[n.toLowerCase()] = _obj;
      });
    });

    // Add standby participants — v3.0.x: DEDUP. Quem já está nos inscritos (ex.: solo que
    // não fechou dupla e foi pra espera) NÃO vira card novo; só ganha a marca de espera.
    standbyParts.forEach((p, idx) => {
      const pName = typeof p === 'string' ? p : (p.displayName || p.name || p.email || 'Espera ' + (idx + 1));
      const names = window._entryTeamMembers(p) || (pName ? [pName] : []); // v3.0.x: membros por estrutura, não por '/'
      names.forEach(n => {
        const ex = _indivByName[n.toLowerCase()];
        if (ex) { ex.isStandby = true; return; }
        let _slotUidSb = '';
        if (p && typeof p === 'object') {
          if (p.p1Name && n === String(p.p1Name).trim()) _slotUidSb = p.p1Uid || '';
          else if (p.p2Name && n === String(p.p2Name).trim()) _slotUidSb = p.p2Uid || '';
          else _slotUidSb = p.uid || '';
        }
        const _obj = { name: n, uid: _slotUidSb, teamName: pName.includes('/') ? pName : null, teamIdx: -1, matchNum: null, matchDecided: false, opponent: null, isStandby: true };
        allIndividuals.push(_obj);
        _indivByName[n.toLowerCase()] = _obj;
      });
    });

    // v0.17.34: Add W.O.'d orphan players (out of team, displayed solo with
    // note "Estava no Jogo N com [partner]"). Pedido do usuário: o jogador
    // que teve W.O. decretado deve sair do time e ter card solo mencionando
    // o jogo e parceiro original.
    if (t.woHistory && typeof t.woHistory === 'object') {
      Object.keys(t.woHistory).forEach(woKey => {
        if (!woKey) return;
        const meta = t.woHistory[woKey];
        if (!meta || typeof meta !== 'object') return;
        // woKey agora é o uid da pessoa W.O.'d → traduz pro nome de exibição
        // (meta.name é canônico; fallback uid→nome, senão a própria chave legada).
        const woName = window._woHistDisplayName(t, woKey, meta);
        allIndividuals.push({
          name: woName,
          teamName: null,
          teamIdx: -1,
          matchNum: null,
          matchDecided: false,
          opponent: null,
          isWOOrphan: true,
          woMeta: meta
        });
      });
    }

    // ── Deduplicate by name: if same person appears as individual AND in a team, keep team version ──
    const _seenNames = {};
    const _dedupedIndividuals = [];
    allIndividuals.forEach(ind => {
      const key = ind.name.toLowerCase().trim();
      if (_seenNames[key]) {
        // Duplicate — keep the one with more info (team > solo, matchNum > null)
        const prev = _seenNames[key];
        if (!prev.teamName && ind.teamName) {
          // Replace: new one has team info
          const prevIdx = _dedupedIndividuals.indexOf(prev);
          if (prevIdx !== -1) _dedupedIndividuals[prevIdx] = ind;
          _seenNames[key] = ind;
        } else if (!prev.matchNum && ind.matchNum) {
          const prevIdx = _dedupedIndividuals.indexOf(prev);
          if (prevIdx !== -1) _dedupedIndividuals[prevIdx] = ind;
          _seenNames[key] = ind;
        }
        // else keep previous (already has team/match info)
      } else {
        _seenNames[key] = ind;
        _dedupedIndividuals.push(ind);
      }
    });

    // v2.7.50: quem está na LISTA DE ESPERA mas TAMBÉM em t.participants → a dedup
    // acima mantém a versão sem isStandby (a de parts) e o card sai roxo, não âmbar.
    // Marca isStandby no resultado SE não estiver num jogo real (com matchNum já foi
    // promovido). Assim todo mundo da espera fica âmbar, esteja só na espera ou em ambos.
    (function () {
      var _sbSet = {};
      standbyParts.forEach(function (p) {
        var _m = window._entryTeamMembers(p); // v3.0.x: membros da dupla por estrutura, não por '/'
        if (_m) { _m.forEach(function (x) { var k = String(x).trim().toLowerCase(); if (k) _sbSet[k] = 1; }); return; }
        var n = String((typeof p === 'string') ? p : (p && (p.displayName || p.name || p.email)) || '');
        var k = n.trim().toLowerCase(); if (k) _sbSet[k] = 1;
      });
      _dedupedIndividuals.forEach(function (ind) {
        if (!ind.isStandby && !ind.matchNum && _sbSet[(ind.name || '').toLowerCase().trim()]) ind.isStandby = true;
      });
    })();

    // v1.0.83-beta: SAFETY NET — todo substituto (replacedBy em t.woHistory)
    // deve aparecer na lista geral em sua posição alfabética, mesmo se algum
    // path upstream esqueceu de adicioná-lo a t.participants. User: "na lista
    // geral dos inscritos ele deve se manter em sua posição sempre".
    // Cobre 4 cenários onde o substituto poderia sumir:
    //   (a) v1.0.78/v1.0.81 push falhou por race/string mismatch
    //   (b) entry foi pushed mas dedup descartou por algum bug não previsto
    //   (c) t.participants foi resetado por save/load do Firestore
    //   (d) caminho NOVO de substituição que esqueceu de fazer o push
    // Em qualquer caso, se woHistory.replacedBy diz "Bot 05 substituiu Bot 06",
    // Bot 05 PRECISA ter um card. Se não tem, criamos aqui.
    if (t.woHistory && typeof t.woHistory === 'object') {
      const _seenAfterDedup = new Set(_dedupedIndividuals.map(i => i.name.toLowerCase().trim()));
      Object.keys(t.woHistory).forEach(woName => {
        const meta = t.woHistory[woName];
        if (!meta || typeof meta !== 'object') return;
        const subName = meta.replacedBy;
        if (!subName) return;
        const subKey = subName.toLowerCase().trim();
        if (_seenAfterDedup.has(subKey)) return; // já tem card ✓
        // FALTANDO — adicionar card do substituto.
        const subTeam = memberToTeam[subName] || null;
        const subMatch = memberToMatch[subName] || null;
        const subOpp = memberToOpponent[subName] || null;
        const subDecided = !!memberToMatchDecided[subName];
        _dedupedIndividuals.push({
          name: subName,
          teamName: subTeam,
          teamIdx: -1,
          matchNum: subMatch,
          matchDecided: subDecided,
          opponent: subOpp,
          isStandby: false,
          _safetyAdded: true // marcador pra debug
        });
        _seenAfterDedup.add(subKey);
      });
    }

    // v0.17.38: lista regular = alfabético total (regulares + waitlist + W.O.
    // orphans intermixados). Pedido do usuário: "os da lista de espera deve
    // estar na lista de espera na ordem de chegada, mas devem aparecer
    // também na lista regular (para facilitar o registro da presença)."
    // O painel "Lista de Espera" em bracket.js continua em ordem de chegada
    // (timestamp de check-in ascendente). Aqui na lista regular, alfabético
    // facilita encontrar pelo nome ao marcar Presente.
    // v2.6.108: ordenação inicial = alfabética; o reordenar de verdade é DOM via
    // a barra canônica (_partApplyFilter lê o dropdown "Ordenar").
    _dedupedIndividuals.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    // v2.6.108: índice de inscrição (ordem em t.participants) por nome — pro sort "Inscrição".
    // v2.7.54: indexa por TODAS as formas do nome (cru displayName/name/email + formatado
    // via _pName) — senão um participante cujo ind.name é cru (ex.: telefone
    // "+5511981933576") não casa com a chave formatada e perde o número da ordem.
    // v2.7.92: ordem de inscrição CANÔNICA — helper único (uid-first; nome só fallback
    // pra participante SEM conta), inclui a lista de espera. Substitui o índice por-nome
    // antigo e alinha #participants aos cards do detalhe (mesmo número em todo lugar).
    var _enrollOrderMap = (typeof window._buildEnrollOrderMap === 'function') ? window._buildEnrollOrderMap(t) : {};

    // v1.0.83-beta: diagnóstico observável — se Bot 05 ainda sumir, podemos
    // inspecionar window._debugLastParticipantsRender no console pra ver
    // exatamente o que aconteceu.
    try {
      window._debugLastParticipantsRender = {
        tournamentId: tId,
        version: window.SCOREPLACE_VERSION,
        at: new Date().toISOString(),
        partsCount: parts.length,
        partsNames: parts.map(p => window._pName(p, '?')),
        standbyCount: standbyParts.length,
        standbyNames: standbyParts.map(p => window._pName(p, '?')),
        woHistory: t.woHistory ? Object.keys(t.woHistory).map(k => ({
          woKey: k, // uid (ou nome legado)
          woName: window._woHistDisplayName(t, k, t.woHistory[k]),
          replacedBy: t.woHistory[k] && t.woHistory[k].replacedBy,
          partner: t.woHistory[k] && t.woHistory[k].partner,
          matchNum: t.woHistory[k] && t.woHistory[k].matchNum
        })) : [],
        dedupedCount: _dedupedIndividuals.length,
        dedupedNames: _dedupedIndividuals.map(i => i.name + (i._safetyAdded ? ' [safety]' : '') + (i.isWOOrphan ? ' [orphan]' : '') + (i.isStandby ? ' [standby]' : '')),
        currentFilter
      };
    } catch (_e) {}

    // v2.1.3: _nameToParticipant agora é definido no escopo da função (acima).
    // v1.3.83: builder NOMEADO (era map inline) pra o toggle de presença reconstruir SÓ o card
    // tocado no lugar (in-place) — sem full re-render. Fim do pulinho + da foto virando bola bege
    // (o rebuild usa o cache _playerPhotoCache, não re-hidrata do zero). Ver _updatePanelCardInPlace.
    const _panelCardBuild = (ind) => {
      const mc = window._idMapHas(t, checkedIn, ind.name);
      // v0.17.34: W.O. orphan = jogador que teve W.O. decretado e foi
      // substituído. Foi removido do time, agora é solo com nota.
      const isWOOrphan = !!ind.isWOOrphan;
      const isAbsent = isWOOrphan ? true : window._idMapHas(t, absent, ind.name);
      const isPending = !mc && !isAbsent;
      if (currentFilter === 'present' && !mc) return '';
      if (currentFilter === 'absent' && !isAbsent) return '';
      if (currentFilter === 'pending' && !isPending) return '';

      // v3.0.x: escape robusto — antes só `'`. Em onclick="...('${safeName}')" um `"`
      // no nome fechava o atributo (XSS/quebra). `\`→`\\` e `'`→`\'` (string JS), `"`→&quot; (atributo).
      const safeName = ind.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      // v2.7.37: estrela do organizador (sempre) + pin no topo (data-part-org).
      const _isOrgPC = (typeof window._isOrgPlayer === 'function') && window._isOrgPlayer(t, ind.name, _nameToParticipant[ind.name]);
      const _orgStarC = _isOrgPC ? '<span title="Organizador" aria-label="Organizador" style="flex-shrink:0;color:#fbbf24;font-size:0.9rem;line-height:1;">⭐</span>' : '';

      // Build sub-info with presence dots (3 states: green=presente, red=ausente, gray=aguardando)
      // `name` é a CHAVE (o rótulo gravado no jogo — é por ele que presença/ausência são
      // indexadas); `disp` é o que se MOSTRA. Separar os dois é o que permite exibir o nome
      // VIVO do perfil sem quebrar o casamento por nome que o resto desta tela usa.
      const dotHtml = (name, disp) => {
        const p = window._idMapHas(t, checkedIn, name);
        const a = window._idMapHas(t, absent, name);
        const dotColor = p ? '#10b981' : a ? '#ef4444' : '#64748b';
        const textColor = p ? '#4ade80' : a ? '#f87171' : '#94a3b8';
        const _txt = window._safeHtml(disp || name);
        return `<span style="display:inline-flex;align-items:center;gap:2px;"><span style="width:5px;height:5px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0;"></span><span style="font-size:0.66rem;color:${textColor};">${_txt}</span></span>`;
      };

      // Standby puro (ainda não substituiu ninguém) = sem parceiro/jogo/adversário
      const isStandbyPure = !!ind.isStandby && !ind.matchNum;

      // v1.0.84-beta: ordem padronizada — sempre p1 em cima, p2 embaixo,
      // independente de qual time é o do jogador. Antes mostrava o time do
      // jogador em cima e o oponente embaixo, gerando "inversão" do mesmo
      // jogo entre cards. User: 'no card do bot02 consta bot02/bot31 vs
      // bot27/bot04; mas no card do bot04 consta bot27/bot04 vs bot02/bot31
      // (invertido). Vamos escolher uma forma de mostrar e mostrar sempre
      // na mesma ordem em todos os cards dos participantes'.
      // Cores das bolinhas continuam refletindo presença individual, então
      // o jogador identifica seu time pelos nomes/dots — só a posição fica
      // estável.
      const _matchObj = (ind.matchNum && Array.isArray(_allForCheckin)) ? _allForCheckin[ind.matchNum - 1] : null;
      const _p1Team = _matchObj && _matchObj.p1 && _matchObj.p1 !== 'TBD' && _matchObj.p1 !== 'BYE' ? _matchObj.p1 : null;
      const _p2Team = _matchObj && _matchObj.p2 && _matchObj.p2 !== 'TBD' && _matchObj.p2 !== 'BYE' ? _matchObj.p2 : null;

      // v0.17.35: oculta membros W.O.'d do team line (se algum) — eles
      // aparecem como cards solo separados, não devem poluir time do parceiro.
      // ── O NOME AQUI TAMBÉM VEM DO PERFIL (1.8.30) ──────────────────────────
      // Relato do dono: _"a mescla da angelica reck ficou inconsistente. aparece maria em
      // alguns pontos e angelica em outros"_. MEDIDO: o perfil dela (uid 0Jmn…) é
      // "angelica reck", e o jogo guarda o rótulo do dia do sorteio, "Maria Reck". O título
      // do card resolvia por uid (angelica) e ESTA linha imprimia o rótulo (Maria) — a mesma
      // pessoa com dois nomes na mesma tela.
      // Agora a posição i do time casa com o uid i do slot (`_slotUids`, o resolvedor
      // canônico) e mostra o nome do perfil. O rótulo gravado continua sendo a CHAVE de
      // presença/W.O. — só deixou de ser o que se lê. Sem uid naquela posição (fictício), o
      // rótulo é a identidade e segue aparecendo.
      const _renderTeamDots = (teamStr, slot) => {
        if (!teamStr) return '';
        // POSICIONAL: é `team1Obj`/`team2Obj` que guarda uid por POSIÇÃO da dupla (o
        // `team*Uids` vem null em jogo formado pelo motor antigo — medido neste torneio).
        // É o mesmo resolvedor que o card da chave usa; usar o outro devolvia lista vazia
        // e a linha continuaria no rótulo gravado.
        const _slotFn = (typeof window._slotUidsPositional === 'function') ? window._slotUidsPositional
                      : (typeof window._slotUids === 'function' ? window._slotUids : null);
        const _uids = (_matchObj && slot && _slotFn) ? (_slotFn(_matchObj, slot) || []) : [];
        // ── W.O. TEM ESCOPO DE JOGO (1.8.30) ──────────────────────────────────
        // Relato do dono: _"carolina entrou em time com leila que tomou wo apenas na
        // disputa de 3o e isso deveria refletir corretamente"_.
        // MEDIDO: `woClaims[0]` tem `scope:"match"` + `matchId` do 3º lugar, e
        // `woHistory[uid da Leila].matchNum = 8`. Mas o filtro daqui era `_woHistHas`, um
        // booleano SEM escopo — então ela sumia de TODAS as linhas, inclusive do jogo 4
        // (1ª rodada), que ela jogou e VENCEU com a Carolina. Esconder de um jogo que
        // aconteceu é apagar história.
        // Agora só some do jogo em que o W.O. foi decretado. W.O. sem `matchNum` (legado,
        // ou decretado pro torneio) continua sumindo de tudo, como antes.
        const _woEsconde = (nome) => {
          const _h = (typeof window._woHistGet === 'function') ? window._woHistGet(t, nome) : null;
          if (!_h) return false;
          if (_h.matchNum == null) return true;                 // sem escopo → comportamento antigo
          return Number(_h.matchNum) === Number(ind.matchNum);  // só no jogo do W.O.
        };
        const members = (teamStr.includes('/') ? teamStr.split('/').map(n => n.trim()).filter(n => n) : [teamStr])
          .map((n, i) => ({ nome: n, uid: _uids[i] || null }))
          .filter(x => !_woEsconde(x.nome));
        return members.map(function (x) {
          const vivo = (x.uid && typeof window._nameForUid === 'function') ? (window._nameForUid(x.uid) || '') : '';
          return dotHtml(x.nome, vivo || x.nome);
        }).join('<span style="color:rgba(255,255,255,0.15);margin:0 2px;">/</span>');
      };

      // Top line = p1, bottom line = p2. Standby puro continua sem times.
      let teamLine = '';
      let opponentLine = '';
      if (!isStandbyPure) {
        teamLine = _renderTeamDots(_p1Team, 'p1');
        opponentLine = _renderTeamDots(_p2Team, 'p2');
        // Fallback pra cards sem matchObj resolvido (ex: ind.teamName setado
        // mas matchNum null por algum edge case): usa ind.teamName/ind.opponent
        // como antes pra não regredir o display.
        if (!teamLine && !opponentLine && ind.teamName) {
          teamLine = _renderTeamDots(ind.teamName);
          opponentLine = ind.opponent ? _renderTeamDots(ind.opponent) : '';
        }
      }

      const matchLabel = (!isStandbyPure && ind.matchNum) ? `Jogo ${ind.matchNum}` : '';
      const standbyLabel = ind.isStandby ? '<span style="font-weight:700;color:#fbbf24;opacity:0.8;">Lista de Espera</span>' : '';

      // Matchup cells (used in the card-level grid, where the player name sits
      // on the same row as team 1 / "vs"). Team 2 lives inside teamsCell on its
      // own row, so the card becomes 2 lines total (name+team1+vs / team2).
      const jogoCell = matchLabel
        ? `<span style="font-weight:700;color:var(--text-muted);opacity:0.6;font-size:0.72rem;white-space:nowrap;align-self:center;">${matchLabel}</span>`
        : '';
      const vsCell = (teamLine && opponentLine)
        ? `<span style="font-size:0.62rem;font-weight:700;color:rgba(255,255,255,0.45);letter-spacing:1px;text-transform:uppercase;font-style:italic;align-self:start;padding-top:1px;">vs</span>`
        : '';
      let teamsCell = '';
      if (teamLine && opponentLine) {
        teamsCell = `<div style="display:flex;flex-direction:column;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${teamLine}</div><div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${opponentLine}</div></div>`;
      } else if (teamLine) {
        teamsCell = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;">${teamLine}</div>`;
      } else if (opponentLine) {
        teamsCell = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;line-height:1.3;font-size:0.72rem;color:var(--text-muted);opacity:0.95;min-width:0;">${opponentLine}</div>`;
      }
      const standbyHeader = (ind.isStandby && !matchLabel && standbyLabel)
        ? `<div style="font-size:0.7rem;margin-top:2px;">${standbyLabel}</div>`
        : '';
      const hasMatchup = !!(jogoCell || teamsCell || vsCell);

      // W.O. check
      const woMatch = ind.matchNum && t.matches ? t.matches[ind.matchNum - 1] : null;
      const isWO = woMatch && woMatch.wo && woMatch.winner && woMatch.winner !== (ind.teamName || ind.name);

      const isStandby = !!ind.isStandby;

      // Action buttons — toggle Presente + botão W.O.
      const canAct = isStandby ? true : (!ind.matchDecided && !isWO);

      // Toggle "Presente" — sempre renderizado para todo participante,
      // independente de o jogo já ter resultado ou W.O. (check-in é independente do resultado)
      // v2.2.8: standby players marcados como ausentes ficam com toggle desabilitado — usar "Reverter"
      const isAbsentStandby = isStandby && isAbsent;
      // v2.7.42: switch e palavra SEPARADOS (pra montar "Ausente [toggle] W.O." numa linha).
      const _toggleSwitch = `<label class="toggle-switch toggle-sm" style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;${isAbsentStandby ? 'opacity:0.35;cursor:not-allowed;pointer-events:none;' : ''}" onclick="event.stopPropagation();"><input type="checkbox" ${mc ? 'checked' : ''} ${isAbsentStandby ? 'disabled' : `onclick="event.stopPropagation(); window._toggleCheckIn('${tId}', '${safeName}', '${String(ind.uid || '').replace(/'/g, "\\'")}');"`}><span class="toggle-slider"></span></label>`;
      const _presenceWord = `<span style="font-size:0.68rem;font-weight:700;color:${mc ? '#4ade80' : '#94a3b8'};white-space:nowrap;">${mc ? 'Presente' : 'Ausente'}</span>`;

      // W.O. button — marca W.O. / reverte W.O.
      // Standby players use simple toggle; active participants always go through the
      // dialog (_declareAbsent uses _collectAllMatches which is more robust than ind.matchNum).
      const woAction = isAbsent
        ? `window._markAbsent('${tId}', '${safeName}', '${ind.uid || ''}')`
        : (isStandby
          ? `window._markAbsent('${tId}', '${safeName}', '${ind.uid || ''}')`
          : `window._declareAbsent('${tId}', '${safeName}')`);
      const woLabel = isAbsent ? 'Reverter' : 'W.O.';
      // Regra simples: botão W.O./Reverter aparece para todo participante que
      // NÃO está com o toggle Presente ativado (!mc). Quando isAbsent=true →
      // mostra "Reverter"; quando !mc && !isAbsent → mostra "W.O.".
      // Remover a restrição !isWO que escondia o botão para jogadores cujo
      // jogo já foi resolvido por W.O. mas que ainda não estão marcados ausentes.
      const _showWoBtn = isOrg && !mc;
      const woBtn = _showWoBtn
        ? window._woBtnHtml('event.stopPropagation(); ' + woAction, !isAbsent, { label: woLabel, size: 'btn-micro', fontSize: '0.7rem', extraStyle: 'min-height:0;height:24px;line-height:1;padding:0 12px;' })
        : '';
      // v2.2.0: badge W.O. só aparece quando ESTE jogador está em t.absent —
      // não deve aparecer no parceiro presente nem em quem simplesmente não
      // fez check-in. A partida ter wo:true é info de resultado do jogo, não
      // de status individual do jogador.
      const woBadge = isAbsent ? `<div style="font-size:0.66rem;font-weight:800;height:22px;line-height:22px;padding:0 10px;border-radius:7px;background:rgba(239,68,68,0.15);color:#f87171;flex-shrink:0;border:1px solid rgba(239,68,68,0.3);">W.O.</div>` : '';

      // Colors: 3 estados + standby amarelo
      // v2.2.0: isWO (match-level) removido dos visuais — só isAbsent torna o card
      // vermelho/riscado. Antes, todo jogador no lado perdedor de um W.O. ficava
      // vermelho, mesmo estando Presente ou apenas sem check-in.
      const presenceDotColor = mc ? '#10b981' : isAbsent ? '#3b82f6' : '#64748b';  // CANON: ausente=azul
      const presenceDot = `<span style="width:8px;height:8px;border-radius:50%;background:${presenceDotColor};display:inline-block;flex-shrink:0;"></span>`;
      const nameColor = isStandby ? '#fbbf24' : (mc ? window._presenceTextColor('present','solo') : isAbsent ? window._presenceTextColor('absent','solo') : 'var(--text-bright)');
      const cardBg = isStandby
        ? (mc ? 'rgba(251,191,36,0.12)' : isAbsent ? 'rgba(59,130,246,0.10)' : 'rgba(251,191,36,0.06)')
        : (mc ? 'rgba(16,185,129,0.12)' : isAbsent ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.03)');
      const cardBorder = isStandby
        ? (mc ? 'rgba(251,191,36,0.3)' : isAbsent ? 'rgba(59,130,246,0.30)' : 'rgba(251,191,36,0.15)')
        : (mc ? 'rgba(16,185,129,0.3)' : isAbsent ? 'rgba(59,130,246,0.30)' : 'rgba(255,255,255,0.06)');

      // VIP check — uid-aware (v3.0.78: t.vips é uid-keyed desde v3.0.74; ler
      // direto por nome (vipMap[ind.name]) MISSAVA a chave-uid → tag VIP sumia).
      // _idMapHas resolve o uid do indivíduo; _entryHasVip cobre a dupla (string).
      const isVipPlayer = window._idMapHas(t, t.vips || {}, ind.name) ||
        (ind.teamName ? window._entryHasVip(t, ind.teamName) : false);
      const vipTag = isVipPlayer ? '<span style="background:linear-gradient(135deg,#eab308,#fbbf24);color:#1a1a2e;font-size:0.55rem;font-weight:900;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;flex-shrink:0;">💎 VIP</span>' : '';
      // v2.7.40: botão VIP ao lado do W.O. — SÓ pro organizador (toggle marca/desmarca).
      const _vipBtnC = isOrg ? `<button type="button" class="btn btn-micro" onclick="event.stopPropagation();window._toggleVip('${tId}','${safeName}','${ind.uid || ''}')" title="${isVipPlayer ? 'Remover VIP' : 'Marcar VIP'}" style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;border-radius:7px;flex-shrink:0;background:${isVipPlayer ? 'linear-gradient(135deg,rgba(234,179,8,0.4),rgba(251,191,36,0.28))' : 'rgba(234,179,8,0.1)'};color:${isVipPlayer ? '#fbbf24' : '#d4a72a'};border:1px ${isVipPlayer ? 'solid rgba(251,191,36,0.65)' : 'dashed rgba(234,179,8,0.4)'};">💎 VIP</button>` : '';
      // ── v1.9.97 · CAMADA 3: REGISTRAR O CONTATO DE QUEM O SMS NÃO ALCANÇA ────
      // Caso Leila Arida (20/ago/2026): pediu o código, o Google entregou o SMS à
      // operadora (HTTP 200) e nada chegou no aparelho — sem saída, ela ficava fora da
      // campanha de celular pra sempre. Aqui o organizador, que já falou com ela,
      // registra o contato — e o dado guarda QUEM registrou.
      // ⛔ NÃO é "salvar sem verificar": o número entra como `phoneSource:'organizer'`,
      // nunca vira identidade (login/recuperação/fusão) e a pessoa é NOTIFICADA.
      // Só aparece pra quem tem uid — sem identidade não há perfil onde gravar.
      var _profTel = (window._userProfileCache && ind.uid) ? window._userProfileCache[ind.uid] : null;
      var _telJa = String((_profTel && _profTel.phone) || '').replace(/\D/g, '').length >= 8;
      var _telOrg = _profTel && _profTel.phoneSource === 'organizer';
      var _telTitulo = !_profTel ? 'Contato do participante'
        : (_telJa ? (_telOrg ? 'Contato registrado por organizador — clique para corrigir'
                             : 'Celular verificado pela própria pessoa')
                  : 'Sem contato — clique para registrar o celular');
      var _telCor = !_telJa ? 'rgba(245,158,11,0.12);color:#fbbf24;border:1px dashed rgba(245,158,11,0.45)'
        : (_telOrg ? 'rgba(245,158,11,0.22);color:#fcd34d;border:1px solid rgba(245,158,11,0.5)'
                   : 'rgba(16,185,129,0.14);color:#6ee7b7;border:1px solid rgba(16,185,129,0.35)');
      const _telBtnC = (isOrg && ind.uid) ? ('<button type="button" class="btn btn-micro" ' +
        'onclick="event.stopPropagation();window._orgSetContactPhone(\'' + tId + '\',\'' + window._safeHtml(ind.uid) + '\',\'' + safeName + '\')" ' +
        'title="' + window._safeHtml(_telTitulo) + '" ' +
        'style="min-height:0;height:24px;line-height:1;padding:0 9px;font-size:0.66rem;font-weight:800;border-radius:7px;flex-shrink:0;background:' + _telCor + ';">' +
        '📱' + (_telJa ? '' : ' contato') + '</button>') : '';

      // v2.7.54: botão de REMOVER inscrito (só organizador) — poder de tirar qualquer
      // jogador do card, inclusive os da lista de espera. A remoção (tournaments.js)
      // tira de participants E dos storages da espera, casando nome cru/formatado.
      // 3º argumento = o UID da PESSOA deste card. Sem ele, excluir quem está em dupla era
      // no-op (o nome da entrada é "A / B", nunca "A"). [[project_uid_identity_canon_locked]]
      const _delBtnC = isOrg ? `<button type="button" class="cancel-x-btn" onclick="event.stopPropagation();window.removeParticipantFunction('${tId}','${safeName}','${window._safeHtml(ind.uid || '')}')" title="Remover inscrito" style="--cx-size:22px;">✕</button>` : '';

      const _safeName = (ind.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      const _pSeed = encodeURIComponent(ind.name);
      const _pCached = (window._playerPhotoCache && window._playerPhotoCache[ind.name.toLowerCase()] && window._playerPhotoCache[ind.name.toLowerCase()].indexOf('dicebear.com') === -1) ? window._playerPhotoCache[ind.name.toLowerCase()] : '';
      const _pInitials = 'https://api.dicebear.com/9.x/initials/svg?seed=' + _pSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
      const _pAvatar = _pCached || _pInitials;
      const _pAvatarErr = `onerror="this.onerror=null;this.src='${_pInitials}'"` ;

      // "Jogo N" color reflects match-level attendance: green when all players present, amber when partial, muted when none.
      let _jogoColor = 'var(--text-muted)';
      let _jogoOpacity = '0.55';
      let _jogoWeight = '700';
      if (matchLabel && ind.matchNum && !isStandbyPure) {
        const _mm = [];
        if (ind.teamName) ind.teamName.split(/\s*\/\s*/).forEach(n => { if (n && n.trim()) _mm.push(n.trim()); });
        else if (ind.name) _mm.push(ind.name);
        if (ind.opponent) ind.opponent.split(/\s*\/\s*/).forEach(n => { if (n && n.trim()) _mm.push(n.trim()); });
        const _uniq = Array.from(new Set(_mm));
        if (_uniq.length > 0) {
          const _presentCount = _uniq.filter(n => window._idMapHas(t, checkedIn, n)).length;
          if (_presentCount === _uniq.length) { _jogoColor = '#4ade80'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
          else if (_presentCount > 0) { _jogoColor = '#fbbf24'; _jogoOpacity = '0.95'; _jogoWeight = '800'; }
        }
      }
      const jogoInline = matchLabel
        ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;margin-left:6px;">${matchLabel}</span>`
        : '';
      // v2.2.0: strikethrough só quando isAbsent (player em t.absent) —
      // não quando isWO (match-level). Parceiro presente não deve ter riscado.
      // v2.7.39: NOME COMPLETO — nunca trunca (quebra linha se preciso). Jogo N saiu
      // da linha do nome e foi pra coluna da direita (não disputa espaço com o nome).
      // v4.5.64: nome resolve VIVO por uid (perfil users/{uid}); nome gravado só p/ guest sem uid.
      const _niUid = ind.uid || '';
      const _niUidAttr = _niUid ? ` data-uid-name="${window._safeHtml(_niUid)}"` : '';
      const _niDisp = _niUid ? window._safeHtml(window._displayName(_niUid, ind.name)) : _safeName;
      const _nameRow = `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;"><span${_niUidAttr} style="font-weight:600;font-size:0.92rem;color:${nameColor};line-height:1.18;word-break:break-word;${isAbsent ? 'text-decoration:line-through;text-decoration-color:rgba(248,113,113,0.4);' : ''}${isOrg ? 'cursor:text;' : ''}" ${isOrg ? `onclick="event.stopPropagation();window._editParticipantName('${tId}','${safeName}')" title="Clique para editar"` : ''}>${_niDisp}</span>${_orgStarC}${isStandby ? presenceDot : ''}</div>`;
      const _jogoTop = matchLabel ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;">${matchLabel}</span>` : '';
      // Faixa do jogo FULL-WIDTH abaixo do header (libera largura pros nomes dos times).
      let _matchStrip = '';
      if (isWOOrphan && ind.woMeta) {
        const _woNameSafe = (ind.woMeta.partner || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const _woMatchNum = ind.woMeta.matchNum || '?';
        _matchStrip = `<div style="font-size:0.68rem;color:#f87171;margin-top:6px;font-weight:600;">❌ W.O. — Estava no Jogo ${_woMatchNum}${_woNameSafe ? ` com <span style="color:#94a3b8;font-weight:500;">${_woNameSafe}</span>` : ''}</div>`;
      } else if (teamLine || opponentLine) {
        // v2.7.43: "vs" na linha do 1º time, "Jogo N" alinhado à direita na linha do 2º.
        var _jR = matchLabel ? `<span style="font-weight:${_jogoWeight};color:${_jogoColor};opacity:${_jogoOpacity};font-size:0.72rem;white-space:nowrap;flex-shrink:0;">${matchLabel}</span>` : '';
        var _row = function (line, right) {
          // v2.7.44: font-size + line-height tight no container (antes herdava 16px →
          // caixas de linha de ~25px e os times ficavam longe). Volta à distância apertada.
          return `<div style="display:flex;align-items:center;gap:8px;font-size:0.66rem;line-height:1.2;"><div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:3px 6px;">${line || ''}</div><div style="flex-shrink:0;">${right || ''}</div></div>`;
        };
        _matchStrip = (teamLine && opponentLine)
          ? `<div style="margin-top:7px;display:flex;flex-direction:column;gap:2px;">${_row(teamLine, vsCell || '')}${_row(opponentLine, _jR)}</div>`
          : `<div style="margin-top:7px;">${_row(teamLine || opponentLine, _jR)}</div>`;
      }
      // v2.1.96: todos os W.O. devem ter Reverter disponível — sem restrição
      // por status do jogo. User: "aqui todos os WO deveriam estar com o
      // reverter disponível. Alguns estão sem o reverter disponível."
      const _showActions = true;

      // Skill category badge/dropdown for check-in mode
      const _ciSkillCats = t.skillCategories || [];
      let _ciSkillHtml = '';
      let _ciCurrentSkill = ''; // v2.7.28: hoisted — usado fora do bloco (data-part-skill); antes dava ReferenceError
      if (_ciSkillCats.length > 0) {
        const _ciPObj = _nameToParticipant[ind.name];
        const _ciCatStr = (_ciPObj && typeof _ciPObj === 'object') ? (_ciPObj.category || '') : '';
        for (let _si = 0; _si < _ciSkillCats.length; _si++) {
          const _sk = _ciSkillCats[_si];
          if (_ciCatStr === _sk || _ciCatStr.endsWith(' ' + _sk)) { _ciCurrentSkill = _sk; break; }
        }
        const _ciNameSafe = ind.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (isOrg) {
          // v2.3.51: dropdown de atribuição de nível pelo org. O nível também
          // aparece no badge de meta (gênero · nível · idade) abaixo do nome —
          // não duplica como pill read-only pra não-org.
          const _ciOpts = _ciSkillCats.map(sk => `<option value="${sk}" ${_ciCurrentSkill === sk ? 'selected' : ''}>${sk}</option>`).join('');
          _ciSkillHtml = `<select onchange="event.stopPropagation();window._setParticipantSkillCategory('${tId}','${_ciNameSafe}',this.value,'${ind.uid || ''}')" onclick="event.stopPropagation()" style="font-size:0.68rem;font-weight:700;padding:1px 4px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);cursor:pointer;margin-top:0;"><option value="" ${!_ciCurrentSkill ? 'selected' : ''}>— nível</option>${_ciOpts}</select>`;
        }
      }

      const _ciPart = _nameToParticipant[ind.name];
      const _ciInactive = (t.allowSelfDeactivation !== false && _ciPart && _ciPart.ligaActive === false) ? '1' : '0';
      const _ciGender = (typeof window._canonGender === 'function') ? window._canonGender(window._pGender(_ciPart)) : 'none'; // v1.3.39: perfil-first
      const _ciSkillVal = _ciCurrentSkill || 'none';
      const _ciEnrollNum = (typeof window._enrollNumber === 'function') ? window._enrollNumber(_enrollOrderMap, _ciPart || (ind && ind.name) || '') : '';
      const _ciOrder = (_ciEnrollNum !== '' && _ciEnrollNum != null) ? (_ciEnrollNum - 1) : 9999;
      // v2.7.28: CARD ÚNICO — mesmo shell rico do pré-sorteio (gradiente roxo/VIP +
      // nº de inscrição em marca d'água), mas com o jogo/parceiro/adversários
      // (infoBlock) + toggle Presente + W.O. dentro dele. Presença vira borda/glow
      // (verde=presente, vermelho=ausente, âmbar=lista de espera) — sem perder a
      // leitura rápida de quem está presente.
      // v2.7.45: cor do CARD por status. VIP DOURADO sempre tem prioridade; senão
      // presente=verde, W.O.(ausente declarado)=vermelho, lista de espera=âmbar,
      // aguardando=roxo (mantido). A borda acompanha o status (mesmo no VIP dourado).
      // v2.7.52: LISTA DE ESPERA tem prioridade na cor — quem está na espera é SEMPRE
      // âmbar, mesmo presente/ausente (antes presente pintava verde por cima). VIP
      // dourado só vence pra VIP de verdade (isVipPlayer).
      const _statusGrad = isStandby ? 'linear-gradient(135deg, rgba(146,64,14,0.58) 0%, rgba(245,158,11,0.45) 100%)'
        : mc ? 'linear-gradient(135deg, rgba(6,95,70,0.6) 0%, rgba(16,185,129,0.5) 100%)'
        : isAbsent ? 'linear-gradient(135deg, rgba(30,58,138,0.62) 0%, rgba(37,99,235,0.5) 100%)'
        : 'linear-gradient(135deg, rgba(67,56,202,0.6) 0%, rgba(99,102,241,0.6) 100%)';
      const _riGrad = (isVipPlayer && !isStandby)
        ? 'linear-gradient(135deg, rgba(161,98,7,0.6) 0%, rgba(234,179,8,0.45) 100%)'
        : _statusGrad;
      const _riBorder = isStandby ? '2px solid rgba(251,191,36,0.6)'
        : mc ? '2px solid rgba(16,185,129,0.7)'
        : isAbsent ? '2px solid rgba(59,130,246,0.6)'
        : isVipPlayer ? '2px solid rgba(251,191,36,0.6)'
        : '1px solid rgba(99,102,241,0.5)';
      const _riGlow = mc ? 'box-shadow:0 0 0 1px rgba(16,185,129,0.45),0 4px 10px rgba(0,0,0,0.12);' : 'box-shadow:0 4px 10px rgba(0,0,0,0.1);';
      const _riDim = isAbsent ? 'opacity:0.62;' : (isWOOrphan ? 'opacity:0.75;' : '');
      const _riNum = (typeof _ciOrder === 'number' && _ciOrder !== 9999) ? (_ciOrder + 1) : '';
      const _riWoBadge = isWOOrphan ? '<div style="font-size:0.64rem;font-weight:800;padding:3px 9px;border-radius:8px;background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.35);">W.O.</div>' : woBadge;
      return `
        <div class="participant-card" data-part-card="1" data-panel-card="1" data-card-key="${String(ind.uid || ind.name || '').replace(/"/g, '&quot;')}" data-part-org="${_isOrgPC ? '1' : '0'}" data-part-vip="${isVipPlayer ? '1' : '0'}" data-part-standby="${isStandby ? '1' : '0'}" data-part-name="${(ind.name || '').toLowerCase().replace(/"/g, '&quot;')}" data-part-inactive="${_ciInactive}" data-part-gender="${_ciGender}" data-part-skill="${String(_ciSkillVal).replace(/"/g, '&quot;')}" data-part-order="${_ciOrder}" style="background:${_riGrad};border:${_riBorder};border-radius:12px;padding:12px;position:relative;overflow:hidden;${_riGlow}${_riDim}transition:all 0.2s;">
            ${(typeof window._enrollNumberBadge === 'function') ? window._enrollNumberBadge(_riNum, 'right') : ''}
            <div style="position:relative;z-index:1;">
                <!-- HEADER: avatar + nome + estrela (Jogo N foi pro match strip, na linha do 2º time) -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <img src="${_pAvatar}" ${_pAvatarErr} data-player-name="${_safeName}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${mc ? 'rgba(16,185,129,0.5)' : isAbsent ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.18)'};${isWOOrphan ? 'filter:grayscale(0.5);' : ''}" />
                    <div style="flex:1;min-width:0;">${standbyHeader}${_nameRow}</div>
                </div>
                <!-- Meta: VIP + categorias + nível (à esquerda). O 🗑️ saiu daqui — -->
                <!-- vai pra linha de ação canônica abaixo (junto da presença). -->
                <div style="margin-top:6px;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;" onclick="event.stopPropagation();">${_vipBtnC}${_telBtnC}${_metaSlotsFor(_nameToParticipant[ind.name], ind.name, false, {inline:true})}${_ciSkillHtml}</div>
                <!-- CARD CANÔNICO: ação (Presente/Ausente · toggle · W.O. · 🗑️) à direita. -->
                ${window._inscritoActionRow('', _presenceWord + (isAbsent ? _riWoBadge : _toggleSwitch) + woBtn, _delBtnC)}
                ${_matchStrip}
            </div>
        </div>`;
    };
    _fatiaItens = _dedupedIndividuals; _fatiaMonta = function (ind) { return _panelCardBuild(ind); };
    // v1.3.83: stash do builder + lista → o toggle reconstrói SÓ o card tocado (in-place),
    // sem full re-render (fim do pulinho + foto→bola bege). Ver _updatePanelCardInPlace.
    try { window._lastPanelCardCtx = { tId: t.id, tRef: t, build: _panelCardBuild, list: _dedupedIndividuals.slice(), filter: (window._checkInFilter || 'all') }; } catch (_ePc) {}

  } else {
    // v4.5.74: torneio de DUPLAS pré-sorteio → SEÇÃO CANÔNICA (Sem dupla / Duplas
    // formadas), a MESMA da tela de detalhe do torneio, agora com o toggle Presente
    // injetado via ctx.cardPresence. Extirpa o grid antigo ("Equipe Formada" /
    // "Inscrição Individual"). Ver [[project_two_participant_card_renderers]].
    var _orgEmailsP = {}; var _orgUidsP = {};
    if (t.organizerEmail) _orgEmailsP[t.organizerEmail] = true;
    if (t.creatorUid) _orgUidsP[t.creatorUid] = true;
    if (Array.isArray(t.coHosts)) t.coHosts.forEach(function (ch) { if (ch && ch.status === 'active' && ch.uid) _orgUidsP[ch.uid] = true; }); // co-host SÓ por uid (jul/2026)
    var _hasTournCatsP = (t.combinedCategories && t.combinedCategories.length > 0) || (t.genderCategories && t.genderCategories.length > 0) || (t.skillCategories && t.skillCategories.length > 0) || (t.ageCategories && t.ageCategories.length > 0);
    // v4.5.76: escopo do W.O. — 'individual' → W.O. POR MEMBRO (2, esq/dir, igual aos
    // toggles); 'team'/'time' → UM W.O. do time (falta 1 → time inteiro leva W.O.).
    // Ver [[project_wo_scope_individual_vs_team]].
    var woScopeP = (t.woScope || 'individual') === 'individual' ? 'individual' : 'team';
    // v1.3.16: callbacks de presença da CHAMADA agora vêm do factory CANÔNICO
    // window._rollCallPresenceCtx (definido acima) — a MESMA lógica reusada no detalhe do
    // torneio (tournaments.js). Antes vivia inline aqui (duplicada). woScopeP/canRollCall/
    // postDrawPresence viram os params active/postDraw/woScope. Ver [[project_two_participant_card_renderers]].
    var _rcCtxP = (typeof window._rollCallPresenceCtx === 'function')
      ? window._rollCallPresenceCtx(t, { isOrg: isOrg, active: canRollCall, postDraw: postDrawPresence, woScope: woScopeP })
      : {};
    var _dsecP = (typeof window._buildDoublesInscritosSection === 'function')
      ? window._buildDoublesInscritosSection(t, {
          isOrg: isOrg, drawDone: drawDone,
          orgUids: _orgUidsP, orgEmails: _orgEmailsP, hasTournCats: _hasTournCatsP,
          chrome: false,
          cardPresence: _rcCtxP.cardPresence,
          memberPresence: _rcCtxP.memberPresence
        })
      : null;
    if (_dsecP && _dsecP.isDoubles) {
      gridStyle = '';
      cardsStr = _dsecP.html;
    } else {
    // ── Normal mode: team cards with drag/split/delete ──
    gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;';

    // v2.7.49: inclui os da LISTA DE ESPERA no grid pré-sorteio (antes só apareciam
    // no painel de Lista de Espera, sumindo dos Inscritos). Intercalados, com badge
    // âmbar "Lista de Espera" e SEM as ações de inscrito (gestão é no painel).
    const _gridSeen = {};
    parts.forEach(function (p) { var n = window._pName(p); if (n) _gridSeen[n.toLowerCase().trim()] = 1; });
    const _gridParts = parts.slice();
    standbyParts.forEach(function (p) {
      var n = window._pName(p); if (!n) return; var k = n.toLowerCase().trim();
      if (_gridSeen[k]) return; _gridSeen[k] = 1;
      var o = (p && typeof p === 'object') ? Object.assign({}, p) : { displayName: String(p), name: String(p) };
      o._isStandbyEntry = true; _gridParts.push(o);
    });
    // v2.7.52: quem está em inscritos E na espera também é espera (âmbar) — sem
    // mutar o objeto de parts; o card consulta este set.
    const _gridWaitSet = (typeof window._waitlistNameSet === 'function') ? window._waitlistNameSet(t) : {};

    var _icPresCtx = (typeof window._rollCallPresenceCtx === 'function' && (canRollCall || postDrawPresence))
      ? window._rollCallPresenceCtx(t, { isOrg: isOrg, active: canRollCall, postDraw: postDrawPresence, woScope: t.woScope })
      : null;
    // v1.3.35: CARD ÚNICO — o #participants passa a renderizar o inscrito individual pela
    // MESMA função que o detalhe usa (window._inscritoIndividualCard). Zero código duplicado.
    var _icCtx = { isOrg: isOrg, drawDone: drawDone, canRollCall: canRollCall, postDrawPresence: postDrawPresence, enrollOrderMap: _enrollOrderMap, nameToParticipant: _nameToParticipant, waitSet: _gridWaitSet, cardPresence: _icPresCtx ? _icPresCtx.cardPresence : null };
    _fatiaItens = _gridParts; _fatiaMonta = function (p, idx) { return window._inscritoIndividualCard(t, p, idx, _icCtx); };
    }
  }

  // ── Filter controls (only when check-in active) ──
  const pendingCount = totalIndividuals - checkedCount - absentConfirmedCount;
  const pctPresent = totalIndividuals > 0 ? Math.round(checkedCount / totalIndividuals * 100) : 0;

  // v2.7.46: chamada ENXUTA e CANÔNICA — bolinhas coloridas + nº (azul=todos,
  // verde=presentes, roxa=aguardando, vermelha=W.O.), clicáveis pra filtrar, + barra
  // (roxa cheia no início → vai virando verde conforme a presença chega) com nº/%.
  // Tudo numa linha.
  function _rollCallBar(total, present, absent, pending) {
    var pct = total > 0 ? Math.round(present / total * 100) : 0;
    function dot(key, dotC, bg, bd, fg, count, label) {
      var a = (currentFilter === key);
      return '<button type="button" class="btn" title="' + label + ' (' + count + ')" onclick="event.stopPropagation();window._setCheckInFilter(\'' + tId + '\',\'' + key + '\')" style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:0.8rem;font-weight:800;cursor:pointer;line-height:1;flex-shrink:0;background:' + (a ? bg : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (a ? bd : 'rgba(255,255,255,0.12)') + ';color:' + (a ? fg : 'var(--text-main)') + ';"><span style="width:9px;height:9px;border-radius:50%;background:' + dotC + ';flex-shrink:0;display:inline-block;"></span>' + count + '</button>';
    }
    return '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;margin-bottom:4px;flex-wrap:wrap;">'
      + dot('all', '#60a5fa', 'rgba(96,165,250,0.22)', 'rgba(96,165,250,0.6)', '#93c5fd', total, 'Todos')
      + dot('present', '#10b981', 'rgba(16,185,129,0.22)', 'rgba(16,185,129,0.6)', '#4ade80', present, 'Presentes')
      + dot('pending', '#a78bfa', 'rgba(167,139,250,0.22)', 'rgba(167,139,250,0.6)', '#c4b5fd', pending, 'Aguardando')
      + dot('absent', '#ef4444', 'rgba(239,68,68,0.22)', 'rgba(239,68,68,0.6)', '#f87171', absent, 'W.O.')
      + '<div title="' + present + ' de ' + total + ' presentes" style="flex:1;min-width:50px;height:9px;border-radius:6px;overflow:hidden;display:flex;background:rgba(167,139,250,0.35);"><div style="width:' + pct + '%;background:linear-gradient(90deg,#10b981,#4ade80);transition:width 0.3s;"></div></div>'
      + '<span style="font-size:0.76rem;color:#94a3b8;font-weight:700;white-space:nowrap;flex-shrink:0;">' + present + '/' + total + ' · ' + pct + '%</span>'
    + '</div>';
  }
  // v1.3.48: barra pela FONTE ÚNICA global (window._rollCallBarHtml) — reconta por UID e é a
  // MESMA usada no refresh in-place ao marcar presença (card estático não re-renderiza a lista).
  const checkInControls = canCheckIn ? window._rollCallBarHtml(tId, drawDone ? 'postdraw' : 'checkin') : '';
  const rollCallControls = canRollCall
    ? window._rollCallBarHtml(tId, 'rollcall')
    : (postDrawPresence ? window._rollCallBarHtml(tId, 'postdraw') : '');

  // v1.3.15 (dono): box "Chamada antes do sorteio" + "Sortear entre os presentes" REMOVIDO —
  // o sorteio tem tela própria no fluxo (org sorteia pelo botão "🎲 Sortear" das ferramentas,
  // que já resolve presentes/ausentes via _handleSortearClick). A contagem que trava abaixo do
  // cabeçalho (_rollCallBar → rollCallControls, belowHtml) permanece. `_drawPresentOnly` segue
  // existindo pra quem chamar direto, só não há mais este botão.
  const rollCallBanner = '';

  // ── "Iniciar Torneio" banner (after draw, before start) ──
  const startBanner = (isOrg && drawDone && !t.tournamentStarted && !(window._hasAnyMatchResult && window._hasAnyMatchResult(t))) ? `
    <div style="margin-bottom:1.5rem;padding:20px;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.1));border:2px solid rgba(16,185,129,0.4);border-radius:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:12px;">${_t('participants.drawDoneMsg')}</p>
        <button class="btn btn-success btn-cta hover-lift" onclick="window._startTournament('${tId}')">
            ▶ ${_t('participants.startTournament')}
        </button>
    </div>` : '';

  // ── Started badge ──
  const startedBadge = t.tournamentStarted ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;">
        <span style="width:10px;height:10px;border-radius:50%;background:#10b981;display:inline-block;"></span>
        <span style="font-size:0.85rem;font-weight:700;color:#4ade80;">${_t('participants.inProgressBadge')}</span>
    </div>` : '';

  // Ready matches banner (check-in: jogos prontos para chamar)
  const readyBannerHtml = (typeof window._renderReadyMatchesBanner === 'function') ? window._renderReadyMatchesBanner(t) : '';

  // Standby / waitlist panel
  const standbyPanelHtml = (typeof window._renderStandbyPanel === 'function') ? window._renderStandbyPanel(t, isOrg) : '';

  // v3.0.91: barra de busca/sort/filtro CANÔNICA, agora STICKY no fluxo do conteúdo
  // (rola junto até o cabeçalho e gruda nele) — antes ia fixa no belowHtml do
  // back-header. Aparece com >1 card (pedido do usuário). A mensagem de "nenhum
  // encontrado" fica perto dos cards.
  // v3.1.47: preset CANÔNICO window._inscritosBar (store.js) — o MESMO usado na tela
  // de detalhe do torneio (modo individual e modo duplas). A barra viaja junto com os
  // cards de inscrito; nunca recriar o bloco de opções localmente. Default A-Z (mais
  // fácil de achar na chamada). Já inclui o slot "Nenhum inscrito encontrado".
  const _filterBarCtrls = (typeof window._inscritosBar === 'function')
    ? window._inscritosBar(t, parts.length > 1)
    : '';

  // 1ª FATIA: só o que a pessoa vê agora. O resto entra por `_pintarInscritosEmFatias`
  // logo abaixo, sem nunca reconstruir o que já está na tela.
  var _jaNaTela = 0;
  if (_fatiaItens && _fatiaItens.length) {
    _jaNaTela = _inscritosPrimeiraFatia(_fatiaItens.length);
    cardsStr = '';
    for (var _fi = 0; _fi < _jaNaTela; _fi++) {
      try { cardsStr += _fatiaMonta(_fatiaItens[_fi], _fi); } catch (_eF) {}
    }
  }

  container.innerHTML = `
    ${(typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
          href: '#tournaments/' + t.id,
          extraStyle: 'padding-bottom:0;',
          middleHtml: '<div style="flex:1;min-width:0;overflow:hidden;">' +
            '<h2 style="margin:0;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
              _t('participants.title') + ' — ' + window._safeHtml(t.name) +
            '</h2>' +
          '</div>',
          rightHtml: '<div style="display:flex;gap:4px;flex-shrink:0;">' +
            '<span class="badge badge-info" style="font-size:0.65rem;">' + ((window._formatLabel && t.format) ? window._formatLabel(t) : (t.format || _t('participants.defaultFormat'))) + '</span>' +
            '<span class="badge" style="background:rgba(255,255,255,0.1);color:var(--text-muted);font-size:0.65rem;">' + individualCount + '</span>' +
          '</div>',
          belowHtml: (checkInControls || rollCallControls)
        })
      : ''}
    ${(typeof window._meuCardNoTopo === 'function') ? window._meuCardNoTopo(t) : ''}
    ${rollCallBanner}
    ${startBanner}
    ${startedBadge}
    ${readyBannerHtml}
    ${_filterBarCtrls}
    ${parts.length > 0 ? `
      <div id="inscritos-grid" style="${gridStyle}">
        ${cardsStr}
      </div>
    ` : `
      <div style="text-align:center;padding:3rem;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:16px;">
        <p class="text-muted">Nenhum inscrito ainda.</p>
      </div>
    `}
    ${standbyPanelHtml}
  `;
  var _geracao = window._inscritosNovaGeracao();

  // ── DEPOIS QUE A ÚLTIMA FATIA ENTROU ────────────────────────────────────────
  // Tudo que lê a lista INTEIRA mora aqui: rodar no meio das fatias veria meia lista
  // (o filtro esconderia gente que ainda não chegou e a ordenação remexeria o que a
  // pessoa está lendo). `_inscritosPinturaCompleta` é o gancho da trava de altura —
  // ver `_reRenderParticipantsStable`.
  var _depoisDaLista = function () {
    // pintura velha: quem assumiu a tela roda o seu próprio "depois" — inclusive a
    // soltura da trava de altura, que soltada por uma geração vencida encontraria a
    // lista NOVA ainda pela metade e derrubaria o documento.
    if (_geracao !== window._inscritosGeracaoAtual()) return;
    // v2.6.101: reaplica busca + filtro ativo/inativo após o (re)render.
    try { if (window._partApplyFilter) window._partApplyFilter(); } catch (e) {}
    try { if (window._aplicarFotosInscritos) window._aplicarFotosInscritos(); } catch (e) {}
    _hydrateNamesP();
    var _h = window._inscritosPinturaCompleta;
    if (typeof _h === 'function') { window._inscritosPinturaCompleta = null; try { _h(); } catch (e) {} }
  };
  if (_fatiaItens && _jaNaTela < _fatiaItens.length) {
    _pintarInscritosEmFatias('inscritos-grid', _fatiaItens, _fatiaMonta, _jaNaTela, _depoisDaLista, _geracao);
  } else {
    setTimeout(_depoisDaLista, 0);
  }
}

// ── Skill category assignment from participant cards ──────────────────────────
window._setParticipantSkillCategory = function(tId, pName, newSkill, uid) {
  const t = window.AppStore && window.AppStore.getTournament ? window.AppStore.getTournament(tId) : null;
  if (!t) return;
  const skillCats = t.skillCategories || [];
  if (!skillCats.length) return;

  // Acha o inscrito pelo UID (identidade). O nome só resolve fictício sem conta / doc legado —
  // num roster só-uid o nome pode nem existir, e o nível ia pro vazio sem aviso.
  let found = false;
  (t.participants || []).forEach(function(p) {
    if (!p) return;
    if (uid) {
      if (!(typeof p === 'object' && (p.uid === uid || p.p1Uid === uid || p.p2Uid === uid))) return;
    } else {
      const pn = window._pName(p);
      // Also match individual names inside a team "A/B" entry
      const memberNames = pn.includes('/') ? pn.split('/').map(n => n.trim()) : [pn];
      if (pn !== pName && !memberNames.includes(pName)) return;
    }
    if (typeof p === 'string') return; // can't attach category to string entries

    const existingCat = p.category || '';
    // Extract gender prefix (everything before the skill token)
    let genderPrefix = '';
    for (let i = 0; i < skillCats.length; i++) {
      const sk = skillCats[i];
      if (existingCat === sk) { genderPrefix = ''; break; }
      if (existingCat.endsWith(' ' + sk)) { genderPrefix = existingCat.slice(0, existingCat.length - sk.length - 1); break; }
    }
    // Build new combined category
    const newCat = newSkill ? (genderPrefix ? genderPrefix + ' ' + newSkill : newSkill) : genderPrefix;
    p.category = newCat;
    p.categorySource = 'organizador';
    found = true;
  });

  if (!found) return;

  // Save and re-render
  const savePromise = (window.AppStore && window.AppStore.syncImmediate)
    ? window.AppStore.syncImmediate(tId)
    : (window.FirestoreDB ? window.FirestoreDB.saveTournament(t) : Promise.resolve());

  savePromise.then(function() {
    const container = document.getElementById('view-container');
    if (container && typeof window.renderParticipants === 'function') {
      window.renderParticipants(container, tId);
    }
  }).catch(function(e) {
    window._warn('[Participants] skill save failed:', e);
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// v1.9.97 · CAMADA 3 — O ORGANIZADOR REGISTRA O CONTATO
//
// Caso Leila Arida (20/ago/2026): pediu o código de verificação, o Identity Toolkit
// devolveu HTTP 200 (o SMS saiu pra operadora) e nada chegou no aparelho. Sem isto, ela
// ficaria fora da campanha de celular da Confra pra sempre.
//
// ⛔ NÃO É "SALVAR SEM VERIFICAR". O dono derrubou essa ideia, com razão: _"e se a
// pessoa colocar o numero de outro? sequestra o numero do outro para contatos. e se
// errar a digitação, ninguem recebe nada e acha que esta tudo bem"_. O que muda aqui é a
// PROCEDÊNCIA — quem registra é o organizador, que já falou com a pessoa, e o uid dele
// fica gravado no dado (`phoneSource:'organizer'` + `phoneSetBy`). A pessoa é NOTIFICADA.
//
// Quem decide é o SERVIDOR (setParticipantContactPhone): esta tela só coleta o número.
// As travas — ser organizador DESTE torneio, o alvo estar no elenco, nunca sobrescrever
// celular verificado — moram em functions/contact-phone-core.js e valem mesmo que
// alguém chame a função por fora.
// ═══════════════════════════════════════════════════════════════════════════
window._orgSetContactPhone = function (tId, uid, nome) {
  var _fmtBR = function (d) {
    var s = String(d || '').replace(/\D/g, '').slice(-11);
    if (s.length === 11) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 7) + '-' + s.slice(7);
    if (s.length === 10) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 6) + '-' + s.slice(6);
    return s;
  };
  var prof = (window._userProfileCache && window._userProfileCache[uid]) || null;
  var atual = String((prof && prof.phone) || '');
  var verificado = atual.replace(/\D/g, '').length >= 8 && (!prof || prof.phoneSource !== 'organizer');

  // Celular que a PRÓPRIA pessoa verificou por SMS não se toca. Só ela manda no número
  // dela — o organizador registra contato de quem não tem, não corrige quem tem.
  if (verificado) {
    if (typeof showAlertDialog === 'function') {
      showAlertDialog('Celular já verificado',
        (nome || 'Essa pessoa') + ' já confirmou o celular por SMS: ' + _fmtBR(atual) + '.\n\n' +
        'Só ela pode trocar esse número, no próprio perfil.', null, { type: 'info' });
    }
    return;
  }

  var jaRegistrado = atual.replace(/\D/g, '').length >= 8;
  var corpo =
    '<div style="font-size:0.86rem;line-height:1.5;color:var(--text-muted);">' +
      (jaRegistrado
        ? '<p style="margin:0 0 10px;">Hoje está registrado <b style="color:var(--text-bright);">' + window._safeHtml(_fmtBR(atual)) + '</b>, colocado por um organizador. Você pode corrigir.</p>'
        : '<p style="margin:0 0 10px;">Use isto quando o SMS de verificação não chegar pra pessoa. Confirme o número <b>com ela</b> antes.</p>') +
      '<div style="display:flex;gap:8px;align-items:center;margin:12px 0 10px;">' +
        '<span style="font-weight:700;color:var(--text-bright);">+55</span>' +
        '<input id="org-contact-phone-input" class="form-control" inputmode="numeric" ' +
          'placeholder="(11) 99999-9999" value="' + window._safeHtml(_fmtBR(atual)) + '" ' +
          'style="flex:1;min-width:0;font-size:1rem;letter-spacing:0.5px;">' +
      '</div>' +
      '<div style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:9px 11px;font-size:0.76rem;color:#fbbf24;">' +
        'Fica registrado que <b>você</b> colocou este número, e ' + window._safeHtml(nome || 'a pessoa') + ' recebe um aviso. ' +
        'Ele vale só para <b>contato</b> — não serve para entrar no app nem para recuperar senha; para isso ela precisa confirmar por SMS.' +
      '</div>' +
    '</div>';

  if (typeof showConfirmDialog !== 'function') return;
  showConfirmDialog('📱 Registrar contato de ' + (nome || 'participante'), corpo, function () {
    var el = document.getElementById('org-contact-phone-input');
    var digits = el ? String(el.value || '').replace(/\D/g, '') : '';
    if (digits.length < 10) {
      if (typeof showNotification === 'function') showNotification('Número incompleto', 'Digite DDD + número do celular.', 'warning');
      return;
    }
    if (typeof showNotification === 'function') showNotification('Registrando…', 'Salvando o contato de ' + (nome || '') + '.', 'info');
    firebase.functions().httpsCallable('setParticipantContactPhone')({
      tournamentId: String(tId), uid: String(uid), phone: digits, country: '55',
    }).then(function (res) {
      var r = (res && res.data) || {};
      // O cache local acompanha na hora — senão o botão continua "sem contato" até o
      // próximo carregamento e parece que não salvou.
      if (window._userProfileCache && window._userProfileCache[uid]) {
        window._userProfileCache[uid].phone = r.phone || ('+55' + digits);
        window._userProfileCache[uid].phoneSource = 'organizer';
      }
      if (typeof showNotification === 'function') {
        showNotification('Contato registrado', (nome || 'A pessoa') + ' foi avisada de que você registrou o celular dela.', 'success');
      }
      if (typeof window._softRefreshView === 'function') { try { window._softRefreshView(); } catch (e) {} }
    }).catch(function (err) {
      var msg = (err && (err.message || err.code)) || 'erro';
      if (typeof showAlertDialog === 'function') showAlertDialog('Não deu pra registrar', String(msg), null, { type: 'error' });
      else if (typeof showNotification === 'function') showNotification('Não deu pra registrar', String(msg), 'error');
    });
  }, null, { confirmText: 'Registrar', cancelText: 'Cancelar', type: 'info', maxWidth: '460px' });
};
