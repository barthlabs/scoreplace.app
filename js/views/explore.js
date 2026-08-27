/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// ========================================
// scoreplace.app — Explorar (Buscar Usuários + Amizades)
// ========================================

// ⛔ 2.1.18 — O GRID DAS LISTAS DE PESSOA É UM SÓ. Ordem do dono, depois de eu errar isto
// na 2.1.17: _"os convites devem acompanhar as larguras dos amigos. 3 colunas de amigos, 3
// colunas de convites. qualquer que seja o numero de colunas de amigos nas diferentes
// larguras"_.
// O QUE EU FIZ DE ERRADO: dei aos convites um minmax MAIOR (13rem) que o dos amigos
// (9.7rem), raciocinando que o card de convite é horizontal e precisaria de mais espaço.
// Só que `auto-fill` calcula o número de colunas A PARTIR do minmax — com valores
// diferentes, as duas listas NUNCA cairiam no mesmo número de colunas. O pedido não era
// "convites mais largos", era "as duas listas com a MESMA divisão". Largura mínima
// diferente é exatamente o jeito de garantir que isso não aconteça.
// ⭐ Por isso virou CONSTANTE: enquanto o valor viver em dois lugares, ele volta a divergir.
// ⚠️ 2.1.20 — O MÍNIMO SUBIU DE 9.7rem PARA 15rem, e o motivo é LEITURA, não estética.
// Ordem do dono, olhando 4 colunas: _"porque 4 colunas? nesa largura é 3 para dar pra ler.
// nunca deve cortar a porra dos nomes. tem que poder ler"_.
// É este número que decide quantas colunas cabem (auto-fill divide a largura por ele), e
// ⚠️ E O `rem` AQUI NÃO É 16px: o app escala a fonte por ÁREA
// ([[project_web_area_scaling_canon]]) — MEDIDO no navegador, 1rem = 22.1px numa janela de
// 1200px. Então 9.7rem eram 214px (4 colunas apertadas em 900px, nome cortado) e 15rem
// seriam 331px (2 colunas, largas demais). 12rem ≈ 265px dá as 3 colunas que o dono pediu,
// com o nome inteiro. Calibrar isto "no olho" em px daria errado — a conta muda junto com
// a escala.
// ⛔ Continua sendo UM valor para as quatro listas (2.1.18) — mexer aqui mexe em todas
// juntas, que é exatamente o ponto.
var _GRID_PESSOAS = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(12rem,1fr));gap:8px;';
// exposta porque a tela #todas-pessoas (todas-pessoas.js) monta a QUARTA lista de pessoa —
// e o dono quer as quatro dividindo igual: "qualquer que seja o numero de colunas".
window._gridPessoas = _GRID_PESSOAS;

// ⛔ 2.1.20 — RESPONDER AO CONVITE EM DOIS BOTÕES REDONDOS, e o motivo é o NOME.
// Ordem do dono: _"nunca deve cortar a porra dos nomes. tem que poder ler"_.
// MEDIDO no navegador: num card de 295px, o par "Rejeitar"+"Aceitar" em texto ocupava
// 192px — sobravam ~50px pro nome, e só a seção de convites RECEBIDOS cortava (amigos e
// enviados, com ação de 20px, cabiam inteiros). O gargalo era a ação, não a largura do
// card: por isso a correção é aqui e não em mais uma mudança de grid.
// ⭐ O ✕ é o CANÔNICO (window._cancelXBtn) — rejeitar é recusar, mesmo símbolo de sempre.
// O ✓ é o irmão simétrico dele: mesma geometria, verde do sucesso. Sem rótulo visível, mas
// com title + aria-label, que é o que o leitor de tela usa.
window._exploreResponderConviteBtns = function (safeUid) {
  var _t = window._t || function (k) { return k; };
  var aceitar = '<button type="button" title="' + _t('explore.accept') + '" aria-label="' + _t('explore.accept') + '"' +
    ' onclick="event.stopPropagation(); window._spinButton(this, \'Aceitando...\'); _acceptFriend(\'' + safeUid + '\')"' +
    ' style="width:22px;height:22px;min-width:22px;min-height:22px;max-height:22px;padding:0;border-radius:50%;' +
    'background:var(--success-color);border:2px solid #fff;color:#fff;font-size:0.72rem;font-weight:900;line-height:1;' +
    'cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;' +
    'box-shadow:0 0 0 1px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.30);">✓</button>';
  var rejeitar = window._cancelXBtn(
    "event.stopPropagation(); window._spinButton(this, 'Rejeitando...'); _rejectFriend('" + safeUid + "')",
    _t('explore.reject'), { size: '22px' });
  return '<div style="display:flex;gap:6px;flex-shrink:0;align-items:center;">' + rejeitar + aceitar + '</div>';
};


// ⛔ 2.1.19 — AMIGO NÃO É CONVITE PENDENTE. Ordem do dono: _"amigos nao podem estar como
// convites pendetes. aceitou, virou amigo, nao tem convite pendente. em nenhuma dessas
// telas."_
//
// ⚠️ NÃO É BUG DE TELA — É DADO SUJO, e foi MEDIDO (27/ago/2026): 12 usuários da base têm
// alguém que JÁ É AMIGO ainda listado em friendRequestsSent/Received — 11 pares. O próprio
// dono tinha 11 amigos na lista de convites enviados, que é exatamente o que ele viu.
//
// A origem é HISTÓRICA: hoje os dois caminhos de aceite limpam os dois lados
// (acceptFriendRequest remove de received do aceitante E de sent do remetente, e o
// auto-aceite mútuo chama a mesma função), e a regra do Firestore permite a escrita
// cruzada nos três arrays (isFriendArrayDiff). Ou seja: o fluxo de hoje não produz isto —
// o que está lá veio de antes.
//
// ⭐ POR QUE A REDE É NA EXIBIÇÃO, e não só uma limpeza do banco: limpar o dado conserta
// os 11 pares de hoje; filtrar aqui conserta também os que vierem de qualquer caminho que
// eu não previ — corrida entre dois aparelhos, merge de contas, um fluxo futuro. A
// amizade é o estado FORTE: se as duas coisas se contradizem, quem manda é `friends`.
// (A limpeza do banco é escrita em dados reais e fica pro dono decidir — ver o relatório.)
window._exploreSemAmigos = function (ids) {
  var amigos = window._exploreMeusAmigos();
  return (Array.isArray(ids) ? ids : []).filter(function (id) {
    return amigos.indexOf(String(id)) === -1;
  });
};

function renderExplore(container) {
  var _t = window._t || function(k) { return k; };
  // Invalida o cache de convidáveis a cada entrada na página — pega novos
  // cadastros e mudanças no toggle acceptFriendRequests de outros usuários.
  window._exploreInvitableCache = null;
  var cu = window.AppStore.currentUser;
  if (!cu) {
    container.innerHTML = '<div class="card" style="padding: 2rem; text-align: center;">' +
      '<p style="color: var(--text-muted); font-size: 1.1rem;">' + _t('explore.loginRequired') + '</p>' +
      '<button class="btn btn-primary" onclick="if(typeof openModal===\'function\')openModal(\'modal-login\');" style="margin-top: 1rem;">' + _t('explore.login') + '</button>' +
    '</div>';
    return;
  }

  var myUid = cu.uid || cu.email;
  var myFriends = cu.friends || [];
  var mySent = cu.friendRequestsSent || [];
  var myReceived = cu.friendRequestsReceived || [];

  // v3.0.91: a barra de filtro/busca CANÔNICA (window._inscritosFilterBar — a mesma
  // dos Inscritos: A-Z/🕒 + gênero ⚥ + habilidade + 🔎 Buscar) agora é STICKY no
  // FLUXO do conteúdo (logo abaixo do título), NÃO mais fixa no belowHtml do
  // back-header. Rola junto com a página até bater no cabeçalho; aí gruda na base
  // dele (via --topbar-h/--hamburger-dd-h/--backheader-h). onChange →
  // _exploreApplyFilter (filtra/ordena TODAS as seções).
  var _exploreFilterBar = window._inscritosFilterBar({
    stateKey: 'explorePeople',
    searchId: 'explore-search-input',
    sortId: 'explore-sort',
    genderId: 'explore-gender',
    skillId: 'explore-skill',
    // ⭐ 2.1.14 — ALFABÉTICO POR PADRÃO. Ordem do dono: _"na tela de pessoas apenas os
    // amigos em ordem alfabetica por padrao (esta cronologica)"_. Faz sentido e é o
    // oposto do padrão de #todas-pessoas (cronológico): aqui é a SUA lista e você procura
    // um nome; lá é descoberta, e o que importa é quem apareceu por último.
    sort: 'name-asc',
    sticky: true,
    onChange: 'window._exploreApplyFilter()'
  });
  // ⭐ 2.1.14 — BOTÃO EXPLORAR, irmão do de torneios. O número é o total que a tela
  // #todas-pessoas apurou e guardou; antes da 1ª visita fica SEM número — mesmo desenho
  // (e mesma honestidade) da 2.1.11: melhor calar do que exibir um total de outra fonte.
  var _totalPessoasHtml = '';
  var _temTotal = false;
  try {
    var _tp = parseInt(localStorage.getItem('scoreplace_totalPessoas'), 10);
    if (_tp > 0) { _totalPessoasHtml = ' <span data-total-pessoas>' + _tp + '</span>'; _temTotal = true; }
  } catch (e) {}
  if (!_temTotal) _totalPessoasHtml = ' <span data-total-pessoas></span>';
  var _btnExplorar =
    '<div style="display:flex;justify-content:flex-start;margin-bottom:0.75rem;">' +
      '<button type="button" onclick="window.location.hash = \'#todas-pessoas\'" ' +
        'title="Ver todas as pessoas do scoreplace" ' +
        'style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;cursor:pointer;' +
        'font-size:0.8rem;font-weight:700;white-space:nowrap;' +
        'border:1px solid ' + window._spCor('rgba(255,255,255,0.18)', 'borda') + ';' +
        'background:' + window._spCor('rgba(255,255,255,0.06)', 'background') + ';color:var(--text-main);">' +
        '🔎 Explorar<span style="opacity:0.75;font-weight:600;">' + _totalPessoasHtml + '</span>' +
      '</button>' +
    '</div>';
  container.innerHTML =
    window._renderBackHeader({
      href: '#dashboard'
    }) +
    // ⚠️ 2.1.20 — 900px, IGUAL ao da tela #todas-pessoas. Não é capricho: o número de
    // colunas sai de (largura do container ÷ minmax). Com 800px aqui e 900px lá, o MESMO
    // grid daria 2 colunas numa tela e 3 na outra — e o dono pediu que as listas de pessoa
    // se dividissem igual. Grid igual só produz colunas iguais se o container for igual.
    '<div style="max-width: 900px; margin: 0 auto;">' +
      '<h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-bright);">' + _t('explore.title') + '</h2>' +
      _btnExplorar +
      _exploreFilterBar +

      // ⭐ 2.1.14 — A ORDEM DAS SEÇÕES MUDOU: amigos PRIMEIRO, convites ABAIXO.
      // Ordem do dono: _"apenas os amigos em ordem alfabetica por padrao e abaixo os
      // convites ainda nao eceitos"_. Antes os pedidos recebidos abriam a tela — o que faz
      // sentido quando há um, e enterra a lista de amigos quando não há nenhum.
      '<div id="explore-friends"></div>' +

      // Convites ainda não aceitos: os que EU recebo (respondo) e os que enviei (aguardo).
      '<div id="explore-pending"></div>' +
      '<div id="explore-sent"></div>' +

      // ⛔ #explore-results (os "outros usuários") SAIU DA TELA e virou #todas-pessoas.
      // O div fica, VAZIO e escondido, porque _exploreFilterAllSections e
      // _exploreApplyFilter varrem esta lista de ids — tirá-lo daqui exigiria mexer nos
      // dois, e um id ausente lá vira ramo morto silencioso. Ele nunca é preenchido.
      '<div id="explore-results" style="display:none;"></div>' +
    '</div>';

  // Amigos primeiro (é a lista da pessoa), convites depois.
  // ⛔ os convites passam pela rede: quem já é amigo NUNCA aparece como pendente.
  _renderMyFriends(myUid, myFriends);
  _renderPendingRequests(myUid, window._exploreSemAmigos(myReceived));
  _renderSentRequests(myUid, window._exploreSemAmigos(mySent));

  // v3.0.x: sincroniza estado inicial de sort/busca p/ a detecção de mudança em
  // _exploreApplyFilter (evita refetch/re-render redundante a cada keystroke). A
  // barra canônica chama _exploreApplyFilter via onChange; não há listener manual.
  var _fbSt = (window._filterBarState && window._filterBarState.explorePeople) || {};
  window._exploreLastSort = _fbSt.sort || 'name-asc';   // 2.1.14: alfabético por padrão
  window._exploreLastSearch = _fbSt.search || '';
  window._otrosSortMode = (window._exploreLastSort.indexOf('name') === 0 ? 'alpha' : 'date') + (window._exploreLastSort.indexOf('-desc') >= 0 ? '-desc' : '-asc');

  // ⭐ 2.1.15 — O NÚMERO DO BOTÃO APARECE NA PRIMEIRA VISITA. Relato do dono: _"cliquei
  // no exlorar (em pessoas) e nao tinha o numero ali… e dai apareceu o numero"_. O total
  // só existia depois de a outra tela ter aberto uma vez, e um botão que ganha número
  // sozinho depois parece defeito — com razão.
  // ⚠️ TRADE-OFF DECLARADO: isto traz de volta o scan da coleção `users`, que a 2.1.14
  // tinha tirado desta tela. Mas SÓ quando ainda não há total guardado (uma vez por
  // aparelho, na prática) e em SEGUNDO PLANO — a tela já pintou, ninguém espera. E o scan
  // tem cache de 5min em listInvitableUsers, então clicar em Explorar logo depois não
  // custa nada a mais: é a mesma leitura que aconteceria de qualquer jeito.
  if (!_temTotal && window.FirestoreDB && typeof window.FirestoreDB.listInvitableUsers === 'function') {
    window.FirestoreDB.listInvitableUsers().then(function (todos) {
      var meu = String(cu.uid || cu.email || '');
      var n = (todos || []).filter(function (u) {
        return u && String(u._docId || u.uid || u.email || '') !== meu;
      }).length;
      if (!n) return;
      try { localStorage.setItem('scoreplace_totalPessoas', String(n)); } catch (e) {}
      // pinta só o número — re-renderizar a tela inteira por causa dele tiraria a pessoa
      // do lugar onde ela já está lendo.
      var el = document.querySelector('[data-total-pessoas]');
      if (el && (window.location.hash || '').indexOf('#explore') === 0) el.textContent = ' ' + n;
    }).catch(function () {});
  }

  // ⛔ 2.1.14 — NÃO CARREGA MAIS "outros usuários" AQUI. Era um scan de até 2000 docs da
  // coleção `users` toda vez que a tela abria, pra montar uma seção que o dono tirou desta
  // tela ("apenas os amigos... e abaixo os convites"). Quem explora agora é
  // #todas-pessoas, e o scan acontece lá — quando a pessoa pede.
  // O filtro segue funcionando: _exploreFilterAllSections varre as seções que restaram.
  if (typeof window._exploreFilterAllSections === 'function') window._exploreFilterAllSections();

  // v2.3.41: tour de coachmarks da tela Pessoas (idle-driven, self-guardado)
  if (window._coach && typeof window._coach.startExploreTour === 'function') window._coach.startExploreTour();
}

// ---- Helper: check if a participant entry matches a given user (by email OR displayName) ----
function _participantMatchesUser(p, email, displayName, uid) {
  // v2.8.80: uid é a identidade primária — casa por uid antes de email/nome.
  if (uid && p && typeof p === 'object') {
    if (typeof window._participantUids === 'function') {
      try { if (window._participantUids(p).indexOf(uid) !== -1) return true; } catch (e) {}
    }
    if (p.uid === uid || p.p1Uid === uid || p.p2Uid === uid) return true;
  }
  if (typeof p === 'string') {
    // Post-draw: participant is a team string like "Rodrigo Barth / Eduardo Mange".
    // v3.0.x: match EXATO por membro (split por " / ") — antes o substring fazia
    // "Ana" casar "Ana Paula" e inflar torneios-em-comum / confrontos no Explorar.
    if (email && p === email) return true;
    if (displayName) {
      var _dl = displayName.toLowerCase();
      var _mem = p.split(/\s*\/\s*/).map(function (s) { return s.trim().toLowerCase(); });
      if (_mem.indexOf(_dl) !== -1) return true;
    }
    return false;
  }
  // Object with email/displayName/name fields
  var pEmail = p.email || '';
  var pName = p.displayName || p.name || '';
  if (email && pEmail === email) return true;
  // v3.0.x: match EXATO por membro (não substring), e removido o match do NOME
  // dentro do campo EMAIL (heurística que dava falso-positivo).
  if (displayName && pName) {
    var _dl2 = displayName.toLowerCase();
    var _mem2 = pName.split(/\s*\/\s*/).map(function (s) { return s.trim().toLowerCase(); });
    if (_mem2.indexOf(_dl2) !== -1) return true;
  }
  return false;
}

// ---- User card HTML builder ----
function _isRealPhoto(url) {
  return url && url.indexOf('dicebear.com') === -1 && url.indexOf('placeholder') === -1;
}

// Returns {line1, line2} for a name: line1 = first token, line2 = last token.
// Splits on spaces for display names; falls back to . @ _ - for usernames.
// Emails and phone-number strings are kept on a single line to avoid
// confusing splits like "joao | com" from "joao@gmail.com".
function _nameLines(raw) {
  if (!raw) return { line1: '', line2: '' };
  var trimmed = raw.trim();
  // Email address → always single line (split at @ would give "joao" | "com")
  if (trimmed.indexOf('@') !== -1) return { line1: trimmed, line2: '' };
  // Purely numeric / phone → single line
  if (/^[\d\s\+\-\(\)]+$/.test(trimmed)) return { line1: trimmed, line2: '' };
  var tokens = trimmed.split(/\s+/).filter(function(t) { return t.length > 0; });
  if (tokens.length <= 1) {
    tokens = trimmed.split(/[.@_\-]/).filter(function(t) { return t.length > 0; });
  }
  if (tokens.length <= 1) return { line1: tokens[0] || trimmed, line2: '' };
  return { line1: tokens[0], line2: tokens[tokens.length - 1] };
}

// Builds the 2-line name HTML block used inside all person cards.
// CÂNONE fit-name-to-box (jul/2026) DENTRO da escala por área: o nome vive num
// box de altura FIXA em --sp-u (escala por área, [[project_web_area_scaling_canon]]);
// a fonte encolhe (rem) pra caber nome longo em vez de ser cortada com "…".
// Ver window._fitNames (store.js). Marcado com `.sp-name-fit`.
function _nameHtml(line1, line2) {
  var inner = '<div style="font-weight:700;line-height:1.2;">' + window._safeHtml(line1) + '</div>' +
    (line2 ? '<div style="font-weight:600;line-height:1.15;opacity:0.82;">' + window._safeHtml(line2) + '</div>' : '');
  return '<div style="height:calc(var(--sp-u) * 2.15);overflow:hidden;display:flex;flex-direction:column;justify-content:center;">' +
    '<div class="sp-name-fit" data-maxrem="0.82" data-minrem="0.55" style="color:var(--text-bright);font-size:0.82rem;width:100%;">' + inner + '</div>' +
  '</div>';
}

// v1.3.25-beta: normaliza cidade pra comparar — strip acentos via NFD
// + lowercase + trim. "Sao Paulo" === "São Paulo" === "são paulo"  ===
// "Sao paulo  " — todas iguais. Bug reportado: cards de Flavio/Raquel
// mostravam "Sao Paulo" mesmo o usuário também sendo de São Paulo,
// porque a comparação anterior usava só toLowerCase() (acento bate).
function _normalizeCity(s) {
  if (!s) return '';
  // ̀-ͯ = combining diacritical marks (acentos isolados após NFD).
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// True quando a cidade do outro user é a mesma do logado (ignorando acento/case/espaços).
function _isSameCityAsMe(theirCity) {
  var cu = window.AppStore && window.AppStore.currentUser ? window.AppStore.currentUser : {};
  return _normalizeCity(theirCity) === _normalizeCity(cu.city);
}

// Compact card for the "Meus Amigos" section only. Drops the extra action
// button area in favor of a tiny ✕ at top-right for unfriending; shows just
// photo + name + city (when different from mine) + preferred sport — no age.
// Falls back to the larger _userCardHtml for other sections.
function _friendCompactCardHtml(u, uid) {
  var cu = window.AppStore.currentUser || {};
  var _nl = _nameLines((window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário')));
  var avatarSeed = encodeURIComponent((_nl.line1 + (_nl.line2 ? ' ' + _nl.line2 : '')) || uid || 'User');
  var initialsUrl = 'https://api.dicebear.com/9.x/initials/svg?seed=' + avatarSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
  var photo = _isRealPhoto(u.photoURL) ? u.photoURL : initialsUrl;
  var fallbackPhoto = initialsUrl;

  // City: only show if present AND different from mine (case + accent + trim
  // insensitive — v1.3.25-beta usa _normalizeCity p/ "Sao Paulo" === "São Paulo").
  var subtitleChips = [];
  var theirCity = (u.city || '').toString().trim();
  if (theirCity && !_isSameCityAsMe(theirCity)) subtitleChips.push(theirCity);
  // Sport: first preferred sport (normalized, no emoji).
  if (u.preferredSports) {
    var firstSport = String(u.preferredSports).split(/[,;]/)[0].trim();
    var clean = window.PresenceDB && typeof window.PresenceDB.normalizeSport === 'function'
      ? window.PresenceDB.normalizeSport(firstSport)
      : firstSport.replace(/^[^\w\u00C0-\u024F]+/u, '').trim();
    if (clean) subtitleChips.push(clean);
  }
  var subtitle = subtitleChips.join(' · ');

  var safeUid = (uid || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");

  window._exploreProfileCache = window._exploreProfileCache || {};
  window._exploreProfileCache[uid] = u;

  return '<div class="card hover-lift"' + _personFilterAttrs(u) + ' onclick="window._openUserProfile(\'' + safeUid + '\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(34,197,94,0.06);border:1px solid var(--success-color);border-radius:10px;min-width:0;">' +
    '<img src="' + photo + '" onerror="this.onerror=null;this.src=\'' + fallbackPhoto + '\'" style="width:2.125rem;height:2.125rem;border-radius:50%;object-fit:cover;border:2px solid var(--success-color);flex-shrink:0;">' +
    '<div style="flex:1;min-width:0;">' +
      _nameHtml(_nl.line1, _nl.line2) +
      (subtitle ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(subtitle) + '</div>' : '') +
    '</div>' +
    // ⛔ 2.1.17 — O ✕ CANÔNICO TAMBÉM AQUI. Ordem do dono: _"cade o cancelar paaro aqui
    // porra?"_ — ele acabara de ver o círculo vermelho nos convites e este continuava um
    // ✕ cinza com opacity 0.5, quase invisível. Desfazer amizade é remoção: mesmo símbolo.
    // ⚠️ E o teste do cânone NÃO pegava este: ele exigia `onclick` e `>✕<` na MESMA linha,
    // e aqui o markup estava quebrado em três. O furo foi fechado junto (ver o teste).
    window._cancelXBtn("event.stopPropagation(); _removeFriend('" + safeUid + "')", 'Desfazer amizade', { size: '20px' }) +
  '</div>';
}

function _userCardHtml(u, uid, actionHtml, variant, onClickFn) {
  var _nl = _nameLines((window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário')));
  var avatarSeed = encodeURIComponent((_nl.line1 + (_nl.line2 ? ' ' + _nl.line2 : '')) || uid || 'User');
  var initialsUrl = 'https://api.dicebear.com/9.x/initials/svg?seed=' + avatarSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
  var photo = _isRealPhoto(u.photoURL) ? u.photoURL : initialsUrl;
  var fallbackPhoto = initialsUrl;
  var infoChips = [];
  // v1.3.25-beta: cidade só aparece quando diferente da minha (mesma regra
  // de _friendCompactCardHtml). Antes essa variant sempre empurrava cidade
  // — bug paralelo nas seções "Outros Usuários" / "Conhecidos".
  if (u.city && !_isSameCityAsMe(u.city)) infoChips.push(u.city);
  // preferredSports: aceita array (forma moderna) ou string CSV (legacy).
  if (u.preferredSports) {
    var _sportsStr = Array.isArray(u.preferredSports)
      ? u.preferredSports.join(', ')
      : String(u.preferredSports);
    if (_sportsStr) infoChips.push(_sportsStr);
  }
  // age deliberately omitted — never show.

  var borderColor = variant === 'friend' ? 'var(--success-color)' : variant === 'pending' ? 'rgba(245,158,11,0.45)' : 'var(--border-color)';
  var bgTint = variant === 'friend' ? 'rgba(34,197,94,0.06)' : variant === 'pending' ? 'rgba(245,158,11,0.06)' : 'transparent';

  var _cardClick = onClickFn ? ' onclick="' + onClickFn + '"' : '';
  var _cardCursor = onClickFn ? 'cursor:pointer;' : '';
  return '<div class="card"' + _personFilterAttrs(u) + _cardClick + ' style="' + _cardCursor + 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:' + window._spCor(bgTint, 'background') + ';border:1px solid ' + window._spCor(borderColor, 'borda') + ';border-radius:10px;min-width:0;">' +
    '<img src="' + photo + '" onerror="this.onerror=null;this.src=\'' + fallbackPhoto + '\'" style="width:2.125rem;height:2.125rem;border-radius:50%;object-fit:cover;border:2px solid ' + window._spCor(borderColor, 'borda') + ';flex-shrink:0;">' +
    '<div style="flex:1;min-width:0;">' +
      _nameHtml(_nl.line1, _nl.line2) +
      (infoChips.length > 0 ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(infoChips.join(' · ')) + '</div>' : '') +
    '</div>' +
    '<div style="flex-shrink:0;">' + actionHtml + '</div>' +
  '</div>';
}

// ---- Sort helpers for OUTROS USUÁRIOS ----
function _sortOtrosArray(arr, mode) {
  if (mode === 'alpha-asc') {
    arr.sort(function(a, b) {
      return ((a.displayName || a.email || '')).localeCompare((b.displayName || b.email || ''), 'pt-BR', { sensitivity: 'base' });
    });
  } else if (mode === 'alpha-desc') {
    arr.sort(function(a, b) {
      return ((b.displayName || b.email || '')).localeCompare((a.displayName || a.email || ''), 'pt-BR', { sensitivity: 'base' });
    });
  } else if (mode === 'date-asc') {
    arr.sort(function(a, b) {
      return (a._latestTs || 0) - (b._latestTs || 0);
    });
  } else {
    // 'date-desc' — most recent encounter / profile activity first
    arr.sort(function(a, b) {
      return (b._latestTs || 0) - (a._latestTs || 0);
    });
  }
}

function _computeSharedInfo(user, myEmail, myName, myUid) {
  var email = user.email || '';
  var name = user.displayName || '';
  var uUid = user.uid || user._docId || '';
  var tournaments = window.AppStore.tournaments || [];
  var latest = 0;
  var count = 0;
  for (var i = 0; i < tournaments.length; i++) {
    var t = tournaments[i];
    var parts = Array.isArray(t.participants) ? t.participants : [];
    // ⛔ só uid: e-mail não identifica ninguém (cânone do dono)
    var hasMe = (myUid && t.creatorUid === myUid) || parts.some(function(p) {
      return _participantMatchesUser(p, myEmail, myName, myUid);
    });
    if (!hasMe) continue;
    var hasUser = parts.some(function(p) {
      return _participantMatchesUser(p, email, name, uUid);
    });
    if (!hasUser) continue;
    count++;
    var rawDate = t.startDate || t.createdAt || t.updatedAt;
    if (rawDate) {
      var parsed = new Date(rawDate).getTime();
      if (!isNaN(parsed) && parsed > latest) latest = parsed;
    }
  }
  return { count: count, latest: latest };
}

// ---- Search non-friend users ----
// Drop users the caller already has a relationship with so they don't appear
// twice (they're already in the friends / received / sent sections above).
function _dedupeAgainstRelationships(users, myUid, myFriends, mySent, myReceived) {
  var friendEmails = window._friendEmails || [];
  var friendNames = window._friendNames || [];
  return (users || []).filter(function(u) {
    var uid = u._docId || u.uid || u.email;
    var email = u.email || '';
    var name = u.displayName || '';
    if (uid === myUid) return false;
    if (myFriends.indexOf(uid) !== -1) return false;
    if (email && myFriends.indexOf(email) !== -1) return false;
    if (email && friendEmails.indexOf(email) !== -1) return false;
    if (name && friendNames.indexOf(name) !== -1) return false;
    if (mySent.indexOf(uid) !== -1) return false;
    if (email && mySent.indexOf(email) !== -1) return false;
    if (myReceived.indexOf(uid) !== -1) return false;
    if (email && myReceived.indexOf(email) !== -1) return false;
    return true;
  });
}

// Shared renderer for the "recently active" empty-state path. Enriches
// timestamps + shared-tournament info the same way the search path does so
// sort and card rendering work identically. Appends an "Ampliar busca" button
// at the bottom when showing the recent-users default so the user can widen
// the time window without retyping.
// v2.1.1: filtra a lista de usuários convidáveis. NÃO usa filtro por nome
// (ghosts são removidos na fonte/banco). Exclui: (a) duplicatas já mescladas
// (mergedInto) — não são usuários ativos; (b) quem desativou "aceitar convites
// de amizade" no perfil (acceptFriendRequests === false) — a lista é de Convidar.
function _filterInvitableUsers(users) {
  return (users || []).filter(function(u) {
    if (!u) return false;
    if (u.mergedInto) return false;
    if (u.acceptFriendRequests === false) return false;
    return true;
  });
}

function _renderSearchResults(resultsDiv, users, query, recentDays) {
  var _t = window._t || function(k) { return k; };
  users = _filterInvitableUsers(users);
  if (users.length === 0) {
    var emptyMsg = recentDays
      ? 'Nenhum usuário nos últimos ' + recentDays + ' dias.'
      : _t('explore.noUsers');
    resultsDiv.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">' + emptyMsg + '</div>' +
      _renderExpandButton(recentDays);
    return;
  }
  var cu = window.AppStore.currentUser || {};
  var _myEmail = cu.email || '';
  var _myName = cu.displayName || '';
  users.forEach(function(u) {
    var shareInfo = _computeSharedInfo(u, _myEmail, _myName, cu.uid || ''); // v2.8.80: uid
    u._sharedCount = shareInfo.count;
    if (shareInfo.latest > 0) {
      u._latestTs = shareInfo.latest;
      u._hasShared = true;
    } else {
      var ts = 0;
      var raw = u.updatedAt || u.createdAt || u.lastSeenAt;
      if (raw) { var parsed = new Date(raw).getTime(); if (!isNaN(parsed)) ts = parsed; }
      u._latestTs = ts;
      u._hasShared = false;
    }
  });
  var sortMode = window._otrosSortMode || 'date-desc';
  _sortOtrosArray(users, sortMode);
  window._otrosUsers = users;
  _renderOtrosCards(resultsDiv, users);
  if (recentDays) {
    // Append the expand CTA below the rendered grid so it's easy to find.
    var btnHtml = _renderExpandButton(recentDays);
    if (btnHtml) resultsDiv.insertAdjacentHTML('beforeend', btnHtml);
  }
}

// Button that widens the recent-users window (7 → 30 → 90 → ∞). Hides once
// we already fetched without a cutoff (nothing more to expand to).
function _renderExpandButton(currentDays) {
  if (!currentDays) return '';
  var next = currentDays < 30 ? 30 : (currentDays < 90 ? 90 : 365);
  var label = currentDays < 30 ? 'Ampliar para 30 dias'
    : currentDays < 90 ? 'Ampliar para 90 dias'
    : 'Ampliar para o ano todo';
  return '<div style="text-align:center;margin-top:1rem;">' +
    '<button class="btn btn-outline btn-sm hover-lift" onclick="window._exploreExpandRecent(' + next + ')" style="font-size:0.82rem;padding:8px 18px;">🔎 ' + label + '</button>' +
  '</div>';
}

window._exploreExpandRecent = function(days) {
  window._exploreRecentDays = days;
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;
  var input = document.getElementById('explore-search-input');
  var q = input ? input.value.trim() : '';
  _performUserSearch(q, myUid, cu.friends || [], cu.friendRequestsSent || [], cu.friendRequestsReceived || []);
};

// v3.0.x: data-attrs de filtro+sort em cada card de pessoa, lidos por
// _exploreFilterAllSections (gênero/habilidade) e _exploreSortAllSections
// (nome/timestamp). skill = união dos níveis declarados em skillBySport (a pessoa
// "tem" o nível B se jogar B em qualquer modalidade); sem dado → vazio (cai no
// filtro "🚫 sem habilidade"). data-pname = nome (A-Z); data-pts = encontro mais
// recente (Outros) ou atividade do perfil (amigos/convites) p/ a ordem cronológica.
function _personFilterAttrs(u) {
  var esc = window._safeHtml || function (s) { return s == null ? '' : String(s); };
  var g = (typeof window._canonGender === 'function') ? window._canonGender(u && u.gender) : 'none';
  var levels = {};
  if (u && u.skillBySport && typeof u.skillBySport === 'object') {
    Object.keys(u.skillBySport).forEach(function (k) {
      var v = u.skillBySport[k];
      if (v) levels[String(v).trim().toUpperCase()] = true;
    });
  }
  var nm = (window._friendlyDisplayName ? window._friendlyDisplayName(u) : ((u && (u.displayName || u.email)) || ''));
  var pts = 0;
  if (u && u._latestTs) pts = u._latestTs;
  else if (u) {
    var raw = u.updatedAt || u.createdAt || u.lastSeenAt;
    if (raw) { var p = new Date(raw).getTime(); if (!isNaN(p)) pts = p; }
  }
  return ' data-person-card data-pgender="' + esc(g) + '" data-pskill="' + esc(Object.keys(levels).join(',')) +
    '" data-pname="' + esc(String(nm).toLowerCase()) + '" data-pts="' + pts + '"';
}

// v3.0.x: reordena (no DOM, sem refetch) os cards das seções convites/amigos pela
// ordenação ativa da barra canônica (_otrosSortMode). NÃO toca em #explore-results
// (Outros) — esse é re-renderizado por _renderOtrosCards com agrupamento por dia.
// Reordena dentro do parent comum dos cards de cada seção (tolera estruturas
// diferentes: grid de amigos, lista de convites).
window._exploreSortAllSections = function () {
  var mode = window._otrosSortMode || 'date-desc';
  var dim = mode.indexOf('alpha') === 0 ? 'alpha' : 'date';
  var dir = mode.indexOf('-desc') >= 0 ? 'desc' : 'asc';
  ['explore-pending', 'explore-friends', 'explore-sent'].forEach(function (secId) {
    var sec = document.getElementById(secId);
    if (!sec) return;
    var cards = Array.prototype.slice.call(sec.querySelectorAll('[data-person-card]'));
    if (cards.length < 2) return;
    var parent = cards[0].parentNode;
    cards = cards.filter(function (c) { return c.parentNode === parent; });
    if (cards.length < 2) return;
    cards.sort(function (a, b) {
      if (dim === 'alpha') {
        var r = (a.getAttribute('data-pname') || '').localeCompare(b.getAttribute('data-pname') || '', 'pt-BR', { sensitivity: 'base' });
        return dir === 'desc' ? -r : r;
      }
      var ta = parseFloat(a.getAttribute('data-pts') || '0') || 0;
      var tb = parseFloat(b.getAttribute('data-pts') || '0') || 0;
      return dir === 'desc' ? (tb - ta) : (ta - tb);
    });
    cards.forEach(function (c) { parent.appendChild(c); });
  });
};

// v3.0.x: filtra/oculta cards em TODAS as seções (convites recebidos, amigos,
// convites enviados, outros) conforme a barra canônica — texto (nome/cidade/
// esporte via textContent) + gênero + habilidade. Esconde o cabeçalho da seção
// quando, com filtro ativo, nada casa. Classe .sp-explore-hidden = display:none.
window._exploreFilterAllSections = function () {
  // ordena as seções (amigos/convites) ANTES de filtrar — assim qualquer caller
  // (render de seção, _renderOtrosCards, _exploreApplyFilter) reflete a ordenação.
  if (window._exploreSortAllSections) window._exploreSortAllSections();
  if (!document.getElementById('_explore-filter-style')) {
    var stEl = document.createElement('style');
    stEl.id = '_explore-filter-style';
    stEl.textContent = '.sp-explore-hidden{display:none !important;}';
    document.head.appendChild(stEl);
  }
  var fb = (window._filterBarState && window._filterBarState.explorePeople) || {};
  var q = String(fb.search || '').trim().toLowerCase();
  var gender = fb.gender || 'all';
  var skill = fb.skill || 'all';
  var anyFilter = !!q || gender !== 'all' || skill !== 'all';
  ['explore-pending', 'explore-friends', 'explore-sent', 'explore-results'].forEach(function (secId) {
    var sec = document.getElementById(secId);
    if (!sec) return;
    var cards = sec.querySelectorAll('[data-person-card]');
    if (!cards.length) { sec.classList.remove('sp-explore-hidden'); return; }
    var anyVisible = false;
    cards.forEach(function (card) {
      var okText = !q || ((card.textContent || '').toLowerCase().indexOf(q) !== -1);
      var cg = card.getAttribute('data-pgender') || 'none';
      var okGender = (gender === 'all') || (cg === gender);
      var cs = card.getAttribute('data-pskill') || '';
      var okSkill;
      if (skill === 'all') okSkill = true;
      else if (skill === 'none') okSkill = !cs;
      else okSkill = (',' + cs + ',').indexOf(',' + skill + ',') !== -1;
      var vis = okText && okGender && okSkill;
      if (vis) { card.classList.remove('sp-explore-hidden'); anyVisible = true; }
      else card.classList.add('sp-explore-hidden');
    });
    // Com filtro ativo e nada casando → esconde a seção inteira (inclui o
    // cabeçalho "MEUS AMIGOS (N)" etc) pra não deixar título órfão.
    if (anyFilter && !anyVisible) sec.classList.add('sp-explore-hidden');
    else sec.classList.remove('sp-explore-hidden');
  });
  // v3.0.97: não pula a tela / a barra sticky não sai do lugar quando o filtro esvazia.
  // v3.1.41: com BUSCA ATIVA, leva o 1º resultado pra logo abaixo da barra (sem tela preta).
  try { if (window._stickyFilterKeepRoom) window._stickyFilterKeepRoom(null, !!q); } catch (e) {}
  // CÂNONE fit-name-to-box: ajusta a fonte dos nomes ao box fixo dos cards. Roda
  // após TODO render de seção de pessoas e após cada mudança de visibilidade do
  // filtro — cards que só agora ganharam dimensão (deixaram de ser display:none) fitam.
  if (typeof window._fitNames === 'function') { try { window._fitNames(document); } catch (e) {} }
};

// v3.0.x: onChange da barra canônica. Mapeia o sort canônico (name/order × asc/
// desc) pro _otrosSortMode do explore (alpha/date); re-ordena a lista de Outros
// SÓ quando o sort muda; refetcha os não-amigos (debounced) SÓ quando o texto
// muda; e aplica o filtro client-side (gênero/habilidade/texto) em todas as seções.
window._exploreApplyDebounce = null;
window._exploreApplyFilter = function () {
  var fb = (window._filterBarState && window._filterBarState.explorePeople) || {};
  var sort = fb.sort || 'order-desc';
  window._otrosSortMode = (sort.indexOf('name') === 0 ? 'alpha' : 'date') + (sort.indexOf('-desc') >= 0 ? '-desc' : '-asc');

  var resultsDiv = document.getElementById('explore-results');
  var sortChanged = (sort !== window._exploreLastSort);
  window._exploreLastSort = sort;
  if (sortChanged && window._otrosUsers && resultsDiv && typeof _sortOtrosArray === 'function') {
    _sortOtrosArray(window._otrosUsers, window._otrosSortMode);
    _renderOtrosCards(resultsDiv, window._otrosUsers);
  }

  var searchVal = String(fb.search || '').trim();
  var searchChanged = (searchVal !== window._exploreLastSearch);
  window._exploreLastSearch = searchVal;
  var cu = window.AppStore && window.AppStore.currentUser;
  if (searchChanged && cu) {
    var myUid = cu.uid || cu.email;
    if (window._exploreApplyDebounce) clearTimeout(window._exploreApplyDebounce);
    window._exploreApplyDebounce = setTimeout(function () {
      _performUserSearch(searchVal, myUid, cu.friends || [], cu.friendRequestsSent || [], cu.friendRequestsReceived || []);
    }, 250);
  }

  window._exploreFilterAllSections();
};

function _performUserSearch(query, myUid, myFriends, mySent, myReceived) {
  var resultsDiv = document.getElementById('explore-results');
  if (!resultsDiv) return;
  var _t = window._t || function(k) { return k; };
  resultsDiv.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--text-muted);">' + _t('explore.searching') + '</div>';

  // Empty search box — lean on "recently active users" so the page never feels
  // like a dead-end. User can expand the window via the button rendered below.
  var q = String(query || '').trim();
  if (!q) {
    var days = window._exploreRecentDays || 7;
    window.FirestoreDB.listRecentUsers(days, 30).then(function(users) {
      users = _dedupeAgainstRelationships(users, myUid, myFriends, mySent, myReceived);
      _renderSearchResults(resultsDiv, users, '', days);
    }).catch(function(err) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--danger-color);">' + _t('explore.searchError') + ': ' + window._safeHtml(err.message || err.toString()) + '</div>';
    });
    return;
  }

  // Busca por SUBSTRING sobre todos que aceitam pedido de amizade (toggle do
  // perfil). O searchUsers padrão só faz prefix match em displayName_lower —
  // não acha "Vieira" em "Fabiana Vieira" nem "Cerri" em "Fernando Cerri".
  // Carregamos a lista de convidáveis 1× (cache) e filtramos client-side por
  // qualquer parte do nome/email/cidade/esporte. Usuário pediu: "mostrar todos
  // que atendem a busca e aceitam pedido de amizade".
  var _qLower = q.toLowerCase();
  function _matchUser(u) {
    var hay = [
      u.displayName, u.email, u.city,
      (Array.isArray(u.preferredSports) ? u.preferredSports.join(' ') : u.preferredSports)
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(_qLower) !== -1;
  }
  function _renderFromList(users) {
    users = _dedupeAgainstRelationships(users, myUid, myFriends, mySent, myReceived);
    _continueSearchRender(users, query, resultsDiv, _t);
  }
  function _runSubstringSearch() {
    var matched = (window._exploreInvitableCache || []).filter(_matchUser);
    _renderFromList(matched);
  }
  // v3.1.65: cache PERSISTENTE (localStorage, TTL 30min) da lista de convidáveis.
  // Antes o cache era só em memória → cada reload/reabertura do PWA refazia o scan
  // de TODA a coleção users (Sentry WEB-5E: ~302 reads/abertura). Agora o scan roda
  // no máximo ~1x/30min por aparelho. Dados já vêm sanitizados (campos públicos).
  var _INV_CACHE_KEY = 'scoreplace_invitable_v1';
  var _INV_CACHE_TTL = 30 * 60 * 1000;
  if (!Array.isArray(window._exploreInvitableCache)) {
    try {
      var _rawC = localStorage.getItem(_INV_CACHE_KEY);
      if (_rawC) {
        var _objC = JSON.parse(_rawC);
        if (_objC && _objC.t && Array.isArray(_objC.users) && (Date.now() - _objC.t) < _INV_CACHE_TTL) {
          window._exploreInvitableCache = _objC.users;
        }
      }
    } catch (_ce) {}
  }
  if (Array.isArray(window._exploreInvitableCache)) {
    _runSubstringSearch();
  } else {
    window.FirestoreDB.listInvitableUsers().then(function(all) {
      window._exploreInvitableCache = all || [];
      try { localStorage.setItem(_INV_CACHE_KEY, JSON.stringify({ t: Date.now(), users: all || [] })); } catch (_se) {}
      _runSubstringSearch();
    }).catch(function(err) {
      // Fallback: prefix search remoto se o load-all falhar
      window.FirestoreDB.searchUsers(query).then(function(users) {
        _renderFromList(users);
      }).catch(function(e2) {
        resultsDiv.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--danger-color);">' + _t('explore.searchError') + ': ' + window._safeHtml((err && err.message) || String(err)) + '</div>';
      });
    });
  }
  return;
}

// Render compartilhado da lista de resultados de busca (após dedupe). Extraído
// de _performUserSearch para ser reusado pelo caminho de substring.
function _continueSearchRender(users, query, resultsDiv, _t) {
  {
    users = _filterInvitableUsers(users);
    if (users.length === 0) {
      resultsDiv.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">' +
        _t('explore.noResultsFor') + ' "' + window._safeHtml(query) + '"' +
      '</div>';
      return;
    }

    // Compute timestamps + shared tournament count: latest shared tournament (preferred) or profile updatedAt/createdAt
    var cu = window.AppStore.currentUser || {};
    var _myEmail = cu.email || '';
    var _myName = cu.displayName || '';
    users.forEach(function(u) {
      var shareInfo = _computeSharedInfo(u, _myEmail, _myName, cu.uid || ''); // v2.8.80: uid
      u._sharedCount = shareInfo.count;
      if (shareInfo.latest > 0) {
        u._latestTs = shareInfo.latest;
        u._hasShared = true;
      } else {
        var ts = 0;
        var raw = u.updatedAt || u.createdAt || u.lastSeenAt;
        if (raw) {
          var parsed = new Date(raw).getTime();
          if (!isNaN(parsed)) ts = parsed;
        }
        u._latestTs = ts;
        u._hasShared = false;
      }
    });

    var sortMode = window._otrosSortMode || 'date-desc';
    _sortOtrosArray(users, sortMode);
    window._otrosUsers = users;
    _renderOtrosCards(resultsDiv, users);
  }
}

function _renderOtrosCards(resultsDiv, users) {
  var _t = window._t || function(k) { return k; };
  var cu = window.AppStore.currentUser || {};
  var mySent = cu.friendRequestsSent || [];
  var myReceived = cu.friendRequestsReceived || [];
  var sortMode = window._otrosSortMode || 'date-desc';
  var _sortParts = sortMode.split('-');
  var _sortDim = _sortParts[0];
  var _sortDir = _sortParts[1] || 'desc';

  // v3.0.x: os toggles de ordenação (A-Z/🕒) agora vivem na barra canônica do
  // topo (_inscritosFilterBar) — aqui fica só o rótulo da seção. _sortDim/_sortDir
  // continuam guiando o agrupamento por dia abaixo.
  var html = '<div style="margin-bottom: 0.75rem;">' +
    '<div style="font-weight: 600; font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">' + _t('explore.otherUsers') + ' (' + users.length + ')</div>' +
  '</div>';

  // Action-button builder reused by both grouping paths.
  // ⭐ 2.1.14: o corpo virou `window._explorePersonActionBtn` (fim do arquivo) pra que a
  // tela #todas-pessoas use o MESMO botão — mesma decisão de "já convidei / me convidou /
  // posso convidar". Um segundo botão lá teria as mesmas 3 ramificações escritas de novo,
  // e é assim que duas telas passam a discordar sobre o mesmo relacionamento.
  function _actionBtnFor(u) { return window._explorePersonActionBtn(u, mySent, myReceived); }

  var _lang = (window._lang === 'en' ? 'en-US' : 'pt-BR');
  var _noDateLabel = _t('explore.noEncounterDate');
  if (_noDateLabel === 'explore.noEncounterDate') {
    _noDateLabel = (window._lang === 'en' ? 'No encounter date' : 'Sem encontros registrados');
  }

  function _dayKey(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return window._formatYYYYMMDD(d);
  }
  function _dayLabel(ts) {
    var d = new Date(ts);
    try {
      return d.toLocaleDateString(_lang, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return d.toISOString().slice(0,10); }
  }

  function _renderGroupHeader(label) {
    return '<div style="margin-top:14px;margin-bottom:8px;padding:6px 2px;font-size:0.78rem;font-weight:700;color:var(--text-bright);text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid var(--border-color);">' +
      '📅 ' + window._safeHtml(label) +
    '</div>';
  }
  function _renderCardGrid(groupUsers) {
    var inner = '<div style="display:flex;flex-direction:column;gap:6px;">';
    groupUsers.forEach(function(u) {
      var uid = u._docId || u.uid || u.email;
      window._exploreProfileCache = window._exploreProfileCache || {};
      if (uid) window._exploreProfileCache[uid] = u;
      inner += _userCardWithEncounterHtml(u, uid, _actionBtnFor(u));
    });
    inner += '</div>';
    return inner;
  }

  if (_sortDim === 'date') {
    // Group by day of latest encounter / profile activity. Order groups by the
    // chosen direction (desc = newest first, asc = oldest first). Users with no
    // timestamp collect in a trailing "sem data" group.
    var buckets = {};
    var bucketOrder = [];
    var noDate = [];
    users.forEach(function(u) {
      if (!u._latestTs) { noDate.push(u); return; }
      var k = _dayKey(u._latestTs);
      if (!k) { noDate.push(u); return; }
      if (!buckets[k]) {
        buckets[k] = { key: k, ts: u._latestTs, label: _dayLabel(u._latestTs), users: [] };
        bucketOrder.push(k);
      }
      buckets[k].users.push(u);
    });
    // Ensure each bucket tracks its max ts (for sort) — keep first seen ts as representative
    bucketOrder.sort(function(a, b) { return buckets[a].key < buckets[b].key ? -1 : (buckets[a].key > buckets[b].key ? 1 : 0); });
    if (_sortDir === 'desc') bucketOrder.reverse();

    bucketOrder.forEach(function(k) {
      var g = buckets[k];
      html += _renderGroupHeader(g.label);
      html += _renderCardGrid(g.users);
    });
    if (noDate.length > 0) {
      html += _renderGroupHeader(_noDateLabel);
      html += _renderCardGrid(noDate);
    }
  } else {
    // Alpha mode — no grouping, just one grid
    html += _renderCardGrid(users);
  }

  resultsDiv.innerHTML = html;
  // v3.0.x: reaplica gênero/habilidade/texto da barra canônica nos cards recém-renderizados.
  if (window._exploreFilterAllSections) window._exploreFilterAllSections();
}

// Renders a user card that shows shared-tournament count + latest encounter date when applicable
function _userCardWithEncounterHtml(u, uid, actionHtml) {
  var _t = window._t || function(k){return k;};
  var _nl = _nameLines((window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário')));
  var avatarSeed = encodeURIComponent((_nl.line1 + (_nl.line2 ? ' ' + _nl.line2 : '')) || uid || 'User');
  var initialsUrl = 'https://api.dicebear.com/9.x/initials/svg?seed=' + avatarSeed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
  var photo = _isRealPhoto(u.photoURL) ? u.photoURL : initialsUrl;
  var fallbackPhoto = initialsUrl;

  var hasShared = !!u._hasShared;
  var borderColor = hasShared ? 'rgba(245,158,11,0.45)' : 'var(--border-color)';
  var bgTint = hasShared ? 'rgba(245, 158, 11, 0.06)' : 'transparent';
  var avatarBorder = hasShared ? 'rgba(245,158,11,0.45)' : 'var(--border-color)';

  var sharedLine = '';
  if (hasShared) {
    var sharedLabel = _t('explore.sharedTournaments');
    if (sharedLabel === 'explore.sharedTournaments') sharedLabel = 'torneio(s) em comum';
    sharedLine = '<div style="font-size: 0.65rem; color: var(--sp-c-f59e0b,#f59e0b); margin-top: 2px;">' + (u._sharedCount || 0) + ' ' + sharedLabel + '</div>';
  }

  var _safeUidEnc = (uid || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  window._exploreProfileCache = window._exploreProfileCache || {};
  window._exploreProfileCache[uid] = u;

  // Date is shown as a group header above a batch of cards (see _renderOtrosCards),
  // so we don't repeat it on each individual card.
  return '<div class="card"' + _personFilterAttrs(u) + ' onclick="window._openUserProfile(\'' + _safeUidEnc + '\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 10px;background:' + window._spCor(bgTint, 'background') + ';border:1px solid ' + window._spCor(borderColor, 'borda') + ';border-radius:10px;min-width:0;">' +
    '<img src="' + photo + '" onerror="this.onerror=null;this.src=\'' + fallbackPhoto + '\'" style="width:2.125rem;height:2.125rem;border-radius:50%;object-fit:cover;border:2px solid ' + window._spCor(avatarBorder, 'borda') + ';flex-shrink:0;">' +
    '<div style="flex:1;min-width:0;">' +
      _nameHtml(_nl.line1, _nl.line2) +
      sharedLine +
    '</div>' +
    '<div style="flex-shrink:0;">' + actionHtml + '</div>' +
  '</div>';
}

// ---- Pending friend requests ----
function _renderPendingRequests(myUid, receivedIds) {
  var div = document.getElementById('explore-pending');
  if (!div || !receivedIds || receivedIds.length === 0) { if (div) div.innerHTML = ''; return; }

  var promises = receivedIds.map(function(uid) {
    return window.FirestoreDB.loadUserProfile(uid).then(function(profile) {
      if (profile) profile._docId = uid;
      return profile;
    });
  });

  Promise.all(promises).then(function(profiles) {
    profiles = profiles.filter(function(p) { return p; });
    if (profiles.length === 0) { div.innerHTML = ''; return; }

    var _tR = window._t || function(k){return k;};
    var receivedLabel = _tR('explore.receivedInvites');
    if (receivedLabel === 'explore.receivedInvites') receivedLabel = 'Convites Recebidos';
    var html = '<div style="margin-bottom: 1.25rem;">' +
      '<div style="font-weight: 600; font-size: 0.9rem; color: var(--sp-c-f59e0b,#f59e0b); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">' + receivedLabel + ' (' + profiles.length + ')</div>' +
      // 2.1.18: os RECEBIDOS também — eles não tinham grid nenhum (cards empilhados um por
      // linha). "Qualquer que seja o número de colunas de amigos" vale para as três listas.
      '<div style="' + _GRID_PESSOAS + '">';

    profiles.forEach(function(u) {
      var uid = u._docId;
      var _nlP = _nameLines(window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário'));
      var initialsUrlP = 'https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent((_nlP.line1 + (_nlP.line2 ? ' ' + _nlP.line2 : '')) || uid || 'User') + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
      var photo = _isRealPhoto(u.photoURL) ? u.photoURL : initialsUrlP;
      var fallbackPhoto2 = initialsUrlP;

      var safeUidPending = (uid || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      window._exploreProfileCache = window._exploreProfileCache || {};
      if (uid) window._exploreProfileCache[uid] = u;
      html += '<div class="card"' + _personFilterAttrs(u) + ' onclick="window._openUserProfile(\'' + safeUidPending + '\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.45);border-radius:10px;min-width:0;">' +
        '<img src="' + photo + '" onerror="this.onerror=null;this.src=\'' + fallbackPhoto2 + '\'" style="width:2.125rem;height:2.125rem;border-radius:50%;object-fit:cover;border:2px solid rgba(245,158,11,0.45);flex-shrink:0;">' +
        '<div style="flex:1;min-width:0;">' +
          _nameHtml(_nlP.line1, _nlP.line2) +
          '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:1px;">' + (window._t || function(k){return k;})('explore.wantsToBeFriend') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          window._exploreResponderConviteBtns(safeUidPending) +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    div.innerHTML = html;
    if (window._exploreFilterAllSections) window._exploreFilterAllSections();
  });
}

// ---- Sent friend requests (outgoing, awaiting their response) ----
function _renderSentRequests(myUid, sentIds) {
  var div = document.getElementById('explore-sent');
  if (!div || !sentIds || sentIds.length === 0) { if (div) div.innerHTML = ''; return; }
  var _t = window._t || function(k){return k;};

  var promises = sentIds.map(function(uid) {
    return window.FirestoreDB.loadUserProfile(uid).then(function(profile) {
      if (profile) profile._docId = uid;
      return profile;
    }).catch(function() { return null; });
  });

  Promise.all(promises).then(function(profiles) {
    profiles = profiles.filter(function(p) { return p; });
    if (profiles.length === 0) { div.innerHTML = ''; return; }

    // v1.0.15-beta: dedup por email. Bug reportado: convidei amigo, aparece
    // duplicado em "Convites Pendentes". Causa: destinatário tem 2 user docs
    // no Firestore — um keyed por email (legacy, pré-uid migration) e um
    // keyed por uid (atual). friendRequestsSent fica com ambos os ids; cada
    // um carrega um profile separado mas com mesmo email. Render mostra 2
    // cards.
    //
    // Fix: agrupa por email-lower. Pra cada email, escolhe o doc cujo
    // _docId NÃO parece email (preferindo o uid real). cancelBtn cancela
    // TODOS os uids do grupo de uma vez.
    var byEmail = {};
    profiles.forEach(function(p) {
      var email = (p.email || '').toLowerCase();
      if (!email) {
        // sem email — usa o _docId como chave única (não dedup)
        byEmail['_no_email_' + p._docId] = { profile: p, uids: [p._docId] };
        return;
      }
      if (!byEmail[email]) {
        byEmail[email] = { profile: p, uids: [p._docId] };
      } else {
        byEmail[email].uids.push(p._docId);
        // Prefere doc cujo _docId NÃO parece email (uid real é mais robusto)
        var existingLooksLikeEmail = (byEmail[email].profile._docId || '').indexOf('@') !== -1;
        var newLooksLikeEmail = (p._docId || '').indexOf('@') !== -1;
        if (existingLooksLikeEmail && !newLooksLikeEmail) {
          byEmail[email].profile = p;
        }
      }
    });
    var dedupedGroups = Object.keys(byEmail).map(function(k) { return byEmail[k]; });

    // Cache profiles + store invite groups + sentAt timestamps for instant sheet open
    var _sentAtMap = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.friendRequestsSentAt) || {};
    window._exploreInviteSentAt = window._exploreInviteSentAt || {};
    dedupedGroups.forEach(function(group) {
      var u = group.profile;
      var uid = u._docId;
      window._exploreProfileCache = window._exploreProfileCache || {};
      window._exploreInviteGroups = window._exploreInviteGroups || {};
      if (uid) {
        window._exploreProfileCache[uid] = u;
        // Store sentAt: check every uid in the group (legacy email key + current uid key)
        var sentAt = null;
        group.uids.forEach(function(id) {
          if (!sentAt && _sentAtMap[id]) sentAt = _sentAtMap[id];
          window._exploreInviteGroups[id] = group.uids;
          if (sentAt) window._exploreInviteSentAt[id] = sentAt;
        });
        if (sentAt) window._exploreInviteSentAt[uid] = sentAt;
      }
    });

    var titleLabel = _t('explore.sentPending');
    if (titleLabel === 'explore.sentPending') titleLabel = 'Convites Pendentes';

    // ⛔ 2.1.18 — A CAIXA ÂMBAR EM VOLTA SAIU, e o motivo é largura, não estética.
    // Ela tinha `padding:12px` + borda: 26px a menos de espaço para o grid interno. Com
    // `auto-fill`, isso derruba UMA COLUNA no limiar — MEDIDO em 700px: amigos 3,
    // recebidos 3, enviados 2. O dono foi explícito: _"qualquer que seja o numero de
    // colunas de amigos nas diferentes larguras"_. Enquanto uma das listas tiver recuo
    // próprio, a conta do auto-fill diverge em alguma largura.
    // ⚠️ O ÂMBAR NÃO SE PERDEU: ele continua no TÍTULO da seção e em cada card (variant
    // 'pending'), que é onde o dono pediu ("convites pendentes em ambar"). O que saiu foi
    // só o retângulo em volta — as três seções agora são estruturalmente idênticas.
    var html = '<div style="margin-bottom: 1.5rem;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:0.75rem;">' +
        '<span style="font-size:1rem;">✉️</span>' +
        '<div style="font-weight:700;font-size:0.88rem;color:var(--sp-c-f59e0b,#f59e0b);text-transform:uppercase;letter-spacing:0.5px;">' + titleLabel + ' (' + dedupedGroups.length + ')</div>' +
      '</div>' +
      '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">Aguardando resposta. Clique em ✕ no card para cancelar.</div>' +
      // as três listas de pessoa (amigos, convites recebidos, convites enviados) usam
      // EXATAMENTE o mesmo grid — ver _GRID_PESSOAS no topo do arquivo.
      '<div style="' + _GRID_PESSOAS + '">';

    dedupedGroups.forEach(function(group) {
      var u = group.profile;
      var uid = u._docId;
      var safeUid = (uid || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
      // Cancel passa todos os uids do grupo (legacy + atual) pra cancelar
      // ambos de uma vez. Evita user clicar ✕ e ainda aparecer outro card.
      var allUidsArg = group.uids.map(function(u){ return "'" + u.replace(/'/g, "\\'").replace(/\\/g, "\\\\") + "'"; }).join(',');
      // ⛔ 2.1.16 — o ✕ CANÔNICO aqui também. Ordem do dono: _"esse cancelar na tela dos
      // amigos tambem"_. Mesma razão do irmão em _explorePersonActionBtn: o components.css
      // manda usar window._cancelXBtn e não reintroduzir ✕ solto colorido.
      var _cancelJs = "event.stopPropagation(); window._spinButton(this, 'Cancelando...'); _cancelFriendRequestMulti([" + allUidsArg + "])";
      var cancelBtn = window._cancelXBtn(_cancelJs, _t('explore.cancelInviteTitle'), { size: '22px' });
      html += _userCardHtml(u, uid, cancelBtn, 'pending', 'window._openPendingInviteDetail(\'' + safeUid + '\')');
    });

    html += '</div></div>';
    div.innerHTML = html;
    if (window._exploreFilterAllSections) window._exploreFilterAllSections();
  });
}

// ---- My friends (card grid, sorted by interaction) ----
function _renderMyFriends(myUid, friendIds) {
  var div = document.getElementById('explore-friends');
  if (!div || !friendIds || friendIds.length === 0) {
    if (div) div.innerHTML = '';
    window._friendEmails = [];
    window._friendNames = [];
    return Promise.resolve();
  }

  div.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--text-muted);">' + (window._t || function(k){return k;})('explore.loadingFriends') + '</div>';

  var promises = friendIds.map(function(uid) {
    return window.FirestoreDB.loadUserProfile(uid).then(function(profile) {
      if (profile) profile._docId = uid;
      return profile;
    });
  });

  return Promise.all(promises).then(function(profiles) {
    // v1.9.90: descarta perfis-fantasma — sem nome, sem e-mail e sem telefone
    // (contas deletadas/órfãs) apareciam como "Usuário" na lista de amigos.
    profiles = profiles.filter(function(p) {
      if (!p) return false;
      var hasId = (p.displayName && String(p.displayName).trim()) ||
                  (p.email && String(p.email).trim()) ||
                  (p.phone && String(p.phone).trim());
      return !!hasId;
    });

    // Cache profiles for instant sheet
    profiles.forEach(function(p) {
      var uid = p._docId;
      if (uid) { window._exploreProfileCache = window._exploreProfileCache || {}; window._exploreProfileCache[uid] = p; }
    });

    // Store friend emails and names for dedup in conhecidos/search
    window._friendEmails = [];
    window._friendNames = [];
    profiles.forEach(function(p) {
      if (p.email) window._friendEmails.push(p.email);
      if (p.displayName) window._friendNames.push(p.displayName);
    });

    if (profiles.length === 0) { div.innerHTML = ''; return; }

    // Sort by interaction: users with more shared tournaments first,
    // then by most recently updated profile
    var myTournaments = window.AppStore.tournaments || [];
    var _myEmail = (window.AppStore.currentUser && window.AppStore.currentUser.email) || '';
    var _myName = (window.AppStore.currentUser && window.AppStore.currentUser.displayName) || '';
    var _myUid = (window.AppStore.currentUser && window.AppStore.currentUser.uid) || ''; // v2.8.80
    profiles.forEach(function(p) {
      var uid = p._docId;
      var sharedCount = 0;
      myTournaments.forEach(function(t) {
        var parts = Array.isArray(t.participants) ? t.participants : [];
        // ⛔ só uid: e-mail não identifica ninguém (cânone do dono)
        var hasMe = (_myUid && t.creatorUid === _myUid) || parts.some(function(pp) {
          return _participantMatchesUser(pp, _myEmail, _myName, _myUid);
        });
        var hasFriend = parts.some(function(pp) {
          return _participantMatchesUser(pp, p.email || '', p.displayName || '', uid);
        });
        if (hasMe && hasFriend) sharedCount++;
      });
      p._sharedTournaments = sharedCount;
    });

    profiles.sort(function(a, b) {
      if (b._sharedTournaments !== a._sharedTournaments) return b._sharedTournaments - a._sharedTournaments;
      // Fallback: alphabetical
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

    var html = '<div style="margin-bottom: 1.5rem;">' +
      '<div style="font-weight: 600; font-size: 0.9rem; color: var(--success-color); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">' + (window._t || function(k){return k;})('explore.myFriends') + ' (' + profiles.length + ')</div>' +
      '<div style="' + _GRID_PESSOAS + '">';

    profiles.forEach(function(u) {
      var uid = u._docId;
      html += _friendCompactCardHtml(u, uid);
    });

    html += '</div></div>';
    div.innerHTML = html;
    if (window._exploreFilterAllSections) window._exploreFilterAllSections();
  });
}

// ---- Global action functions ----

window._cancelFriendRequest = function(toUid) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;

  // Update local state
  cu.friendRequestsSent = (cu.friendRequestsSent || []).filter(function(id) { return id !== toUid; });

  window.FirestoreDB.cancelFriendRequest(myUid, toUid).then(function() {
    if (typeof showNotification !== 'undefined') {
      showNotification((window._t||function(k){return k;})('explore.notifInviteCancelled'), (window._t||function(k){return k;})('explore.notifInviteCancelledMsg'), 'info');
    }
    var container = document.getElementById('view-container');
    if (container) window._exploreScrollSafeRender(container);
  });
};

// v1.0.15-beta: cancela múltiplos uids do mesmo grupo (legacy email-keyed +
// atual uid-keyed pra mesma pessoa). Chama cancelFriendRequest pra cada
// uid em paralelo. Atualiza estado local removendo todos. Notif única.
window._cancelFriendRequestMulti = function(toUids) {
  var cu = window.AppStore.currentUser;
  if (!cu || !Array.isArray(toUids) || toUids.length === 0) return;
  var myUid = cu.uid || cu.email;

  // Update local state — remove all uids in the group
  cu.friendRequestsSent = (cu.friendRequestsSent || []).filter(function(id) {
    return toUids.indexOf(id) === -1;
  });

  // Cancel all in parallel — Firestore arrayRemove é idempotente, sem risco
  var promises = toUids.map(function(toUid) {
    return window.FirestoreDB.cancelFriendRequest(myUid, toUid).catch(function(e) {
      window._warn('[cancelFriendRequest] failed for', toUid, e);
    });
  });

  Promise.all(promises).then(function() {
    if (typeof showNotification !== 'undefined') {
      showNotification((window._t||function(k){return k;})('explore.notifInviteCancelled'), (window._t||function(k){return k;})('explore.notifInviteCancelledMsg'), 'info');
    }
    var container = document.getElementById('view-container');
    if (container) window._exploreScrollSafeRender(container);
  });
};

// v2.1.42: re-render mantendo a posição de scroll — ações de amizade (reenviar,
// aceitar, recusar, remover) re-renderizam a tela toda; sem isto o usuário perde
// onde estava (volta pro topo). Restaura o scrollY após o render.
// ⛔ 2.1.15 — ESTE REDESENHO TEM QUE RESPEITAR A ROTA ATUAL.
// Bug relatado pelo dono: _"convidei um novo amigo e voltou pra pagina dos amigos…
// deveria ficar na pagina explorar até clicar em voltar"_.
// A causa: esta função chamava `renderExplore(container)` sempre — ela nasceu quando só
// existia UMA tela de pessoas. Com #todas-pessoas (2.1.14) usando as MESMAS ações
// (convidar / aceitar / rejeitar / cancelar), qualquer clique lá redesenhava a tela de
// Pessoas por cima: a pessoa era teleportada pra fora do que estava fazendo.
// ⚠️ E não era só o convite — TODAS as ações passam por aqui, então o conserto é num
// lugar só, que é o motivo de a função existir.
// Em #todas-pessoas basta reaplicar o filtro: os estados de convite saem de
// `cu.friendRequestsSent/Received`, que a ação acabou de atualizar em memória — o card
// se redesenha com o botão certo, sem refazer a busca e sem perder a rolagem.
window._exploreScrollSafeRender = function(container) {
  if (!container) return;
  if ((window.location.hash || '').indexOf('#todas-pessoas') === 0) {
    if (typeof window._todasPessoasAplicarFiltro === 'function') window._todasPessoasAplicarFiltro();
    return;
  }
  var _sy = window.scrollY || document.documentElement.scrollTop || 0;
  renderExplore(container);
  window.scrollTo(0, _sy);
  requestAnimationFrame(function() { window.scrollTo(0, _sy); });
};

window._sendFriendRequest = function(toUid) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;

  window.FirestoreDB.sendFriendRequest(myUid, toUid, {
    displayName: cu.displayName,
    photoURL: cu.photoURL,
    email: cu.email
  }).then(function(result) {
    if (result === 'auto-accepted') {
      // Mutual request auto-accepted — update local state
      if (!cu.friends) cu.friends = [];
      if (cu.friends.indexOf(toUid) === -1) cu.friends.push(toUid);
      cu.friendRequestsSent = (cu.friendRequestsSent || []).filter(function(id) { return id !== toUid; });
      cu.friendRequestsReceived = (cu.friendRequestsReceived || []).filter(function(id) { return id !== toUid; });
      // v3.0.x: convite mútuo auto-aceito É uma amizade formada — conta no GA4
      // igual ao caminho de _acceptFriend (antes só o aceite manual era contado).
      try { if (typeof window._trackFriendAdded === 'function') window._trackFriendAdded(); } catch (_e) {}
      if (typeof showNotification !== 'undefined') {
        showNotification((window._t||function(k){return k;})('explore.notifFriendshipFormed'), (window._t||function(k){return k;})('explore.notifFriendshipFormedMsg'), 'success');
      }
    } else {
      // Normal request sent
      if (!cu.friendRequestsSent) cu.friendRequestsSent = [];
      // v1.0.15-beta: dedup defensivo — antes push direto, possibilitando
      // double-tap rápido criar entrada duplicada no array local. Firestore
      // já é idempotente via arrayUnion, mas o estado local pode divergir.
      if (cu.friendRequestsSent.indexOf(toUid) === -1) {
        cu.friendRequestsSent.push(toUid);
      }
      if (typeof showNotification !== 'undefined') {
        showNotification((window._t||function(k){return k;})('explore.notifInviteSent'), (window._t||function(k){return k;})('explore.notifInviteSentMsg'), 'success');
      }
    }
    var container = document.getElementById('view-container');
    if (container) window._exploreScrollSafeRender(container);
  });
};

window._acceptFriend = function(friendUid) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;

  if (!cu.friends) cu.friends = [];
  // Prevent duplicate: only add if not already in friends list
  if (cu.friends.indexOf(friendUid) === -1) {
    cu.friends.push(friendUid);
  }
  cu.friendRequestsReceived = (cu.friendRequestsReceived || []).filter(function(id) { return id !== friendUid; });

  window.FirestoreDB.acceptFriendRequest(myUid, friendUid).then(function() {
    // v1.0.59-beta: GA4 — friend_added (só conta na aceitação, não no envio)
    try {
      if (typeof window._trackFriendAdded === 'function') window._trackFriendAdded();
    } catch (_e) {}
    if (typeof showNotification !== 'undefined') {
      showNotification((window._t||function(k){return k;})('explore.notifFriendAccepted'), (window._t||function(k){return k;})('explore.notifFriendAcceptedMsg'), 'success');
    }
    if (typeof _updateNotificationBadge === 'function') _updateNotificationBadge();
    var container = document.getElementById('view-container');
    if (container) window._exploreScrollSafeRender(container);
  });
};

window._rejectFriend = function(friendUid) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;

  cu.friendRequestsReceived = (cu.friendRequestsReceived || []).filter(function(id) { return id !== friendUid; });

  window.FirestoreDB.rejectFriendRequest(myUid, friendUid).then(function() {
    if (typeof showNotification !== 'undefined') {
      showNotification((window._t||function(k){return k;})('explore.notifInviteRejected'), (window._t||function(k){return k;})('explore.notifInviteRejectedMsg'), 'info');
    }
    var container = document.getElementById('view-container');
    if (container) window._exploreScrollSafeRender(container);
  });
};

window._removeFriend = function(friendUid) {
  var cu = window.AppStore.currentUser;
  if (!cu) return;
  var myUid = cu.uid || cu.email;

  // Confirm before removing
  if (typeof showAlertDialog === 'function') {
    showAlertDialog((window._t||function(k){return k;})('explore.unfriendTitle'), (window._t||function(k){return k;})('explore.unfriendConfirm'), function() {
      // Update local state
      cu.friends = (cu.friends || []).filter(function(id) { return id !== friendUid; });

      window.FirestoreDB.removeFriend(myUid, friendUid).then(function() {
        if (typeof showNotification !== 'undefined') {
          showNotification((window._t||function(k){return k;})('explore.notifUnfriended'), (window._t||function(k){return k;})('explore.notifUnfriendedMsg'), 'info');
        }
        var container = document.getElementById('view-container');
        if (container) window._exploreScrollSafeRender(container);
      });
    }, { type: 'warning', confirmText: (window._t||function(k){return k;})('explore.unfriendYes'), cancelText: (window._t||function(k){return k;})('explore.cancel') });
  } else {
    // Fallback without dialog
    cu.friends = (cu.friends || []).filter(function(id) { return id !== friendUid; });
    window.FirestoreDB.removeFriend(myUid, friendUid).then(function() {
      var container = document.getElementById('view-container');
      if (container) window._exploreScrollSafeRender(container);
    });
  }
};

// ──────────────────────────────────────────────────────────
// Profile / invite-detail bottom sheet (opens on card click)
// ──────────────────────────────────────────────────────────

window._exploreProfileCache = window._exploreProfileCache || {};
window._exploreInviteGroups = window._exploreInviteGroups || {};

window._closeUserProfileSheet = function () {
  var sheet = document.getElementById('user-profile-sheet');
  var backdrop = document.getElementById('user-profile-sheet-backdrop');
  if (sheet) {
    sheet.style.transform = 'translateY(100%)';
    setTimeout(function () { if (backdrop) backdrop.remove(); }, 300);
  } else if (backdrop) {
    backdrop.remove();
  }
};

window._openUserProfile = function (uid) {
  if (!uid) return;
  var cached = window._exploreProfileCache && window._exploreProfileCache[uid];
  if (cached) { _renderUserProfileSheet(cached); return; }
  window.FirestoreDB.loadUserProfile(uid)
    .then(function (p) {
      if (p) { p._docId = uid; window._exploreProfileCache = window._exploreProfileCache || {}; window._exploreProfileCache[uid] = p; }
      _renderUserProfileSheet(p || { _docId: uid, displayName: 'Usuário' });
    })
    .catch(function () { _renderUserProfileSheet({ _docId: uid, displayName: 'Usuário' }); });
};

window._openPendingInviteDetail = function (uid) {
  if (!uid) return;
  var cached = window._exploreProfileCache && window._exploreProfileCache[uid];
  if (cached) { _renderInviteDetailSheet(cached); return; }
  window.FirestoreDB.loadUserProfile(uid)
    .then(function (p) {
      if (p) { p._docId = uid; window._exploreProfileCache = window._exploreProfileCache || {}; window._exploreProfileCache[uid] = p; }
      _renderInviteDetailSheet(p || { _docId: uid, displayName: 'Usuário' });
    })
    .catch(function () { _renderInviteDetailSheet({ _docId: uid, displayName: 'Usuário' }); });
};

// ── Profile sheet helpers ─────────────────────────────────────────────────

// Async: loads matchHistory from Firestore, renders dual-bar comparison layout
// (same visual language as end-of-casual-match stats screen).
function _loadAndRenderFriendStats(friendUid, hr) {
  if (!window.FirestoreDB || !friendUid) return;
  var cu = window.AppStore ? (window.AppStore.currentUser || {}) : {};
  var myUid = cu.uid;
  if (!myUid) {
    var el = document.getElementById('friend-stats-section');
    if (el) el.innerHTML = '';
    return;
  }

  // ── Visual helpers — mirror _diffBarRow / _sectionShell from tournaments-analytics.js ──
  // Section container — same visual language as _sectionShell in tournaments-analytics.js
  var _sectionBox = function(title, icon, accent, badge, bodyHtml) {
    return (
      '<div style="margin-top:10px;padding:12px;border-radius:14px;background:var(--info-box-bg,rgba(255,255,255,0.04));border:1px solid ' + window._spCor(accent, 'borda') + '44;display:flex;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:1rem;">' + icon + '</span>' +
          '<span style="font-size:0.85rem;font-weight:900;color:' + window._spCor(accent, 'color') + ';text-transform:uppercase;letter-spacing:0.8px;">' + title + '</span>' +
          '<span style="margin-left:auto;font-size:0.78rem;color:var(--text-bright,#fff);font-weight:700;opacity:0.75;">' + badge + '</span>' +
        '</div>' +
        bodyHtml +
      '</div>'
    );
  };

  // Stat box — same visual as _boxStat in tournaments-analytics.js
  var _statBox = function(label, value, icon, accent) {
    return (
      '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 6px;border-radius:10px;background:var(--stat-box-bg,rgba(255,255,255,0.05));border:1px solid var(--border-color,rgba(255,255,255,0.08));">' +
        '<span style="font-size:1rem;">' + icon + '</span>' +
        '<span style="font-size:1.15rem;font-weight:900;color:' + window._spCor(accent, 'color') + ';font-variant-numeric:tabular-nums;line-height:1;">' + value + '</span>' +
        '<span style="font-size:0.55rem;font-weight:700;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.5px;text-align:center;">' + label + '</span>' +
      '</div>'
    );
  };

  // Matchup bar — mirrors _diffBarRow in tournaments-analytics.js but for a single
  // value per side (no casual/tournament split — comparing two people, not two sources).
  // 3-column header: leftLabel | CENTERMETRIC | rightLabel
  // Numbers: "XX% (N)" — pct prominent (data-stat-count), absolute in parens.
  // Bars: diverge from center, share-of-total (sum = 100%).
  // Animated on-scroll via data-stat-bar + data-stat-count (window._initStatsAnimation).
  var _matchupBar = function(centerLabel, leftLabel, rightLabel, leftVal, rightVal, leftClr, rightClr) {
    var sum = (leftVal || 0) + (rightVal || 0);
    var lp = sum > 0 ? Math.round((leftVal || 0) / sum * 100) : 0;
    var rp = sum > 0 ? (100 - lp) : 0;
    var col = function(pct, n, clr) {
      if (sum === 0) {
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
          '<span style="font-size:0.9rem;font-weight:900;color:' + window._spCor(clr, 'color') + ';">–</span>' +
        '</div>';
      }
      return (
        '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
          '<div style="display:flex;align-items:baseline;gap:2px;">' +
            '<span data-stat-count="' + pct + '" data-stat-count-suffix="%" style="font-size:0.9rem;font-weight:900;color:' + window._spCor(clr, 'color') + ';font-variant-numeric:tabular-nums;line-height:1;">0%</span>' +
            '<span data-stat-count="' + (n || 0) + '" data-stat-count-prefix="(" data-stat-count-suffix=")" style="font-size:0.58rem;font-weight:600;color:' + window._spCor(clr, 'color') + ';opacity:0.65;font-variant-numeric:tabular-nums;line-height:1;">(0)</span>' +
          '</div>' +
        '</div>'
      );
    };
    return (
      '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0;">' +
        // 3-column header: [left label] [center metric] [right label]
        '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:baseline;">' +
          '<div style="font-size:0.62rem;font-weight:700;color:' + window._spCor(leftClr, 'color') + ';text-transform:uppercase;letter-spacing:0.6px;text-align:left;">' + (leftLabel || '') + '</div>' +
          '<div style="font-size:0.72rem;font-weight:800;color:var(--text-bright,#fff);text-transform:uppercase;letter-spacing:0.8px;text-align:center;white-space:nowrap;">' + (centerLabel || '') + '</div>' +
          '<div style="font-size:0.62rem;font-weight:700;color:' + window._spCor(rightClr, 'color') + ';text-transform:uppercase;letter-spacing:0.6px;text-align:right;">' + (rightLabel || '') + '</div>' +
        '</div>' +
        // Numbers row — pushed to extreme edges
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:end;">' +
          '<div style="display:flex;justify-content:flex-start;">' + col(lp, leftVal || 0, leftClr) + '</div>' +
          '<div style="display:flex;justify-content:flex-end;">' + col(rp, rightVal || 0, rightClr) + '</div>' +
        '</div>' +
        // Bars diverge from center
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:center;">' +
          '<div style="height:8px;border-radius:4px 0 0 4px;background:var(--stat-box-bg,rgba(255,255,255,0.05));display:flex;justify-content:flex-end;overflow:hidden;">' +
            '<div data-stat-bar="' + lp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + leftClr + '44,' + leftClr + ');transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
          '</div>' +
          '<div style="height:8px;border-radius:0 4px 4px 0;background:var(--stat-box-bg,rgba(255,255,255,0.05));display:flex;justify-content:flex-start;overflow:hidden;border-left:2px solid var(--border-color,rgba(255,255,255,0.12));">' +
            '<div data-stat-bar="' + rp + '" style="width:0%;height:100%;background:linear-gradient(90deg,' + rightClr + ',' + rightClr + '44);transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  };

  window.FirestoreDB.loadUserMatchHistory(myUid, { limit: 200 })
    .then(function(history) {
      var shared = history.filter(function(r) {
        return Array.isArray(r.playerUids) && r.playerUids.indexOf(friendUid) !== -1;
      });

      var stats = {
        tournaments: 0, tournamentNames: [],
        casual: 0,
        confrontos: {
          total: 0, casual: 0, tournaments: 0,
          myWins: 0, frWins: 0,
          myPoints: 0, frPoints: 0,
          myGames: 0,  frGames: 0,
          mySets: 0,   frSets: 0
        },
        parcerias: { total: 0, casual: 0, tournaments: 0, wins: 0, losses: 0 }
      };
      var seenT = {};

      shared.forEach(function(r) {
        if (r.matchType === 'tournament' && r.tournamentId) {
          if (!seenT[r.tournamentId]) {
            seenT[r.tournamentId] = true;
            stats.tournaments++;
            if (stats.tournamentNames.length < 3 && r.tournamentName) {
              stats.tournamentNames.push(window._safeHtml(r.tournamentName));
            }
          }
        } else if (r.matchType === 'casual') {
          stats.casual++;
        }

        var myTeam = 0, frTeam = 0;
        if (Array.isArray(r.players)) {
          r.players.forEach(function(p) {
            if (!p) return;
            if (p.uid === myUid)     myTeam = p.team || 0;
            if (p.uid === friendUid) frTeam = p.team || 0;
          });
        }
        if (!myTeam || !frTeam) return;

        var myTS = r.stats && (myTeam === 1 ? r.stats.team1 : r.stats.team2);
        var frTS = r.stats && (frTeam === 1 ? r.stats.team1 : r.stats.team2);

        if (myTeam === frTeam) {
          stats.parcerias.total++;
          if (r.matchType === 'casual') stats.parcerias.casual++;
          else if (r.matchType === 'tournament') stats.parcerias.tournaments++;
          if (r.winnerTeam) {
            if (r.winnerTeam === myTeam) stats.parcerias.wins++;
            else stats.parcerias.losses++;
          }
        } else {
          stats.confrontos.total++;
          if (r.matchType === 'casual') stats.confrontos.casual++;
          else if (r.matchType === 'tournament') stats.confrontos.tournaments++;
          if (r.winnerTeam === myTeam)     stats.confrontos.myWins++;
          else if (r.winnerTeam === frTeam) stats.confrontos.frWins++;
          if (myTS) {
            stats.confrontos.myPoints += myTS.points || 0;
            stats.confrontos.myGames  += myTS.games  || 0;
            stats.confrontos.mySets   += myTS.sets   || 0;
          }
          if (frTS) {
            stats.confrontos.frPoints += frTS.points || 0;
            stats.confrontos.frGames  += frTS.games  || 0;
            stats.confrontos.frSets   += frTS.sets   || 0;
          }
        }
      });

      var el = document.getElementById('friend-stats-section');
      if (!el) return;

      var hasAny = stats.confrontos.total > 0 || stats.parcerias.total > 0 || stats.casual > 0 || stats.tournaments > 0;
      if (!hasAny) {
        el.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);text-align:center;font-style:italic;padding:4px 0;">Ainda não jogaram partidas juntos</div>';
        return;
      }

      var cu2 = window.AppStore ? (window.AppStore.currentUser || {}) : {};
      // Use friendly display name; take first word only for the bar label (keeps it compact)
      var _myFriendlyDN = (window._friendlyDisplayName ? window._friendlyDisplayName(cu2) : (cu2.displayName || 'Você'));
      var myFirstName = _myFriendlyDN.split(/[\s@]+/)[0];

      // Colors: red for friend (left), green for me (right)
      var myClr = '#22c55e';
      var frClr = '#ef4444';

      var _frCached = (window._exploreProfileCache && window._exploreProfileCache[friendUid]) || {};
      var _frFriendlyDN = window._friendlyDisplayName ? window._friendlyDisplayName(_frCached) : (_frCached.displayName || _frCached.email || 'Amigo');
      var frFirstName = window._safeHtml(_frFriendlyDN.split(/[\s@]+/)[0] || 'Amigo');
      var html = '';

      // ── Confrontos block ──────────────────────────────────────────────────
      if (stats.confrontos.total > 0) {
        var c = stats.confrontos;
        var hasGames  = (c.myGames  + c.frGames)  > 0;
        var hasSets   = (c.mySets   + c.frSets)   > 0;
        var hasPoints = (c.myPoints + c.frPoints)  > 0;
        var cExtra = c.total - c.myWins - c.frWins;
        var cTypeParts = [];
        if (c.tournaments > 0) cTypeParts.push('🏆 ' + c.tournaments);
        if (c.casual > 0)      cTypeParts.push('⚡ ' + c.casual);
        var cBadge = (cTypeParts.length ? cTypeParts.join(' · ') : c.total + ' partida' + (c.total !== 1 ? 's' : '')) + (cExtra > 0 ? ' · ' + cExtra + ' s/res.' : '');
        // Friend LEFT (red), Me RIGHT (green). Names only on first row.
        var confrontosBody =
          '<div style="display:flex;flex-direction:column;gap:2px;margin-top:2px;">' +
            _matchupBar('Vitórias', frFirstName, window._safeHtml(myFirstName), c.frWins,   c.myWins,   frClr, myClr) +
            (hasPoints ? _matchupBar('Pontos',  '', '', c.frPoints, c.myPoints, frClr, myClr) : '') +
            (hasGames  ? _matchupBar('Games',   '', '', c.frGames,  c.myGames,  frClr, myClr) : '') +
            (hasSets   ? _matchupBar('Sets',    '', '', c.frSets,   c.mySets,   frClr, myClr) : '') +
          '</div>';
        html += _sectionBox('Confrontos Diretos', '⚔️', '#6366f1', cBadge, confrontosBody);
      }

      // ── Parcerias block ───────────────────────────────────────────────────
      if (stats.parcerias.total > 0) {
        var p = stats.parcerias;
        var pExtra = p.total - p.wins - p.losses;
        var pTypeParts = [];
        if (p.tournaments > 0) pTypeParts.push('🏆 ' + p.tournaments);
        if (p.casual > 0)      pTypeParts.push('⚡ ' + p.casual);
        var pBadge = (pTypeParts.length ? pTypeParts.join(' · ') : p.total + ' partida' + (p.total !== 1 ? 's' : '')) + (pExtra > 0 ? ' · ' + pExtra + ' s/res.' : '');
        var parceriasBody =
          '<div style="margin-top:2px;">' +
            _matchupBar('Como Dupla', 'Derrotas', 'Vitórias', p.losses, p.wins, '#ef4444', '#22c55e') +
          '</div>';
        html += _sectionBox('Parcerias', '🤝', '#22c55e', pBadge, parceriasBody);
      }

      // ── Tournament names footnote (no redundant stat boxes) ───────────────
      if (stats.tournamentNames.length > 0) {
        html +=
          '<div style="text-align:center;font-size:0.68rem;color:var(--text-muted,#94a3b8);opacity:0.75;margin-top:4px;">' +
            stats.tournamentNames.join(' · ') +
            (stats.tournaments > stats.tournamentNames.length ? ' · +' + (stats.tournaments - stats.tournamentNames.length) : '') +
          '</div>';
      }

      el.innerHTML = html;
      if (typeof window._initStatsAnimation === 'function') window._initStatsAnimation(el);
    })
    .catch(function(e) {
      window._warn('[FriendStats]', e);
      var el = document.getElementById('friend-stats-section');
      if (el) el.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;font-style:italic;">Histórico indisponível</div>';
    });
}

function _profileSheetAvatarHtml(u, uid, size, borderColor) {
  var nl = _nameLines((window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário')));
  var seed = encodeURIComponent((nl.line1 + (nl.line2 ? ' ' + nl.line2 : '')) || uid || 'User');
  var fallback = 'https://api.dicebear.com/9.x/initials/svg?seed=' + seed + '&backgroundColor=c0aede,d1d4f9,b6e3f4,ffd5dc,ffdfbf';
  var src = _isRealPhoto(u.photoURL) ? u.photoURL : fallback;
  var s = size || 72; var bc = borderColor || 'var(--primary-color)';
  return '<img src="' + src + '" onerror="this.onerror=null;this.src=\'' + fallback + '\'" style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;object-fit:cover;border:3px solid ' + window._spCor(bc, 'borda') + ';margin-bottom:12px;">';
}

function _profileSheetSportsHtml(u) {
  var sportIcon = window._sportIcon || function() { return '🏅'; };
  // Resolve sports list — skillBySport takes precedence, fallback to preferredSports
  var sportsList = [];
  if (u.skillBySport && typeof u.skillBySport === 'object') {
    sportsList = Object.keys(u.skillBySport);
  } else if (Array.isArray(u.preferredSports)) {
    sportsList = u.preferredSports;
  } else if (u.preferredSports) {
    sportsList = String(u.preferredSports).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }
  if (!sportsList.length) return '';
  var pills = sportsList.map(function(sport) {
    var icon = sportIcon(sport);
    var lvl = u.skillBySport && u.skillBySport[sport];
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:4px 11px;font-size:0.78rem;color:var(--text-bright);">' +
      '<span style="vertical-align:middle;flex-shrink:0;">' + icon + '</span>' +
      '<span style="vertical-align:middle;">' + window._safeHtml(sport) + (lvl ? ' <b style="opacity:0.85;">' + window._safeHtml(String(lvl)) + '</b>' : '') + '</span>' +
    '</span>';
  }).join('');
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">' + pills + '</div>';
}

function _mountProfileSheet(innerHtml) {
  var existing = document.getElementById('user-profile-sheet-backdrop');
  if (existing) existing.remove();
  var outer = document.createElement('div');
  outer.id = 'user-profile-sheet-backdrop';
  outer.setAttribute('onclick', 'window._closeUserProfileSheet()');
  outer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10050;display:flex;align-items:flex-end;justify-content:center;';
  var panel = document.createElement('div');
  panel.id = 'user-profile-sheet';
  panel.setAttribute('onclick', 'event.stopPropagation()');
  panel.style.cssText = 'background:var(--bg-card);border-radius:20px 20px 0 0;padding:0 0 36px;width:100%;max-width:480px;box-shadow:0 -4px 40px rgba(0,0,0,0.4);transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.32,0.72,0,1);overflow-y:auto;max-height:90%;';
  var backRow =
    '<div style="display:flex;align-items:center;padding:14px 20px 0;margin-bottom:6px;">' +
      '<button onclick="window._closeUserProfileSheet()" style="display:inline-flex;align-items:center;gap:6px;background:var(--sp-g-255-255-255-008,rgba(255,255,255,0.08));border:none;border-radius:20px;padding:7px 16px;color:var(--text-muted,#94a3b8);font-size:0.85rem;font-weight:600;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.13)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.08)\'">' +
        '<span style="font-size:0.8rem;">←</span> Voltar' +
      '</button>' +
    '</div>' +
    '<div style="padding:0 20px 0;">';
  panel.innerHTML = backRow + innerHtml + '</div>';
  outer.appendChild(panel);
  document.body.appendChild(outer);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { panel.style.transform = 'translateY(0)'; });
  });
}

function _renderUserProfileSheet(u) {
  var cu = window.AppStore ? (window.AppStore.currentUser || {}) : {};
  var myFriends = cu.friends || [];
  var mySent = cu.friendRequestsSent || [];
  var uid = u._docId || u.uid || u.email;
  var isFriend = myFriends.indexOf(uid) !== -1;
  var isSent = mySent.indexOf(uid) !== -1;
  var isMe = uid === (cu.uid || cu.email);
  var safeUid = String(uid || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var fullName = window._safeHtml(window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário'));
  var borderColor = isFriend ? 'var(--success-color)' : 'var(--primary-color)';
  var hr = '<div style="height:1px;background:var(--sp-g-255-255-255-007,rgba(255,255,255,0.07));margin:12px 0;"></div>';

  // ── Location ──────────────────────────────────────────────
  var locationParts = [u.city, u.state].filter(Boolean).map(function(s) { return window._safeHtml(s); });
  var cityLabel = locationParts.join(', ');

  // ── Birthday dd/mm (no year, no age) ──────────────────────
  var birthdayLabel = '';
  if (u.birthDate) {
    try {
      var bdParts = String(u.birthDate).split('/');
      if (bdParts.length >= 2) birthdayLabel = '🎂 ' + window._safeHtml(bdParts[0] + '/' + bdParts[1]);
    } catch(e) {}
  }

  // ── Gender ────────────────────────────────────────────────
  var genderMap = { 'feminino': '♀️ Feminino', 'masculino': '♂️ Masculino', 'nao-binario': '⚧️ Não-binário', 'prefiro-nao-dizer': '' };
  var genderLabel = (u.gender && genderMap[u.gender]) ? genderMap[u.gender] : '';

  // ── Second line: gender · city · birthday ─────────────────
  // Each token is a <span> inside a flex row so emoji aligns with text baseline
  var line2Parts = [];
  if (genderLabel) line2Parts.push('<span style="display:inline-flex;align-items:center;gap:3px;">' + genderLabel + '</span>');
  if (cityLabel)   line2Parts.push('<span style="display:inline-flex;align-items:center;gap:3px;"><span>📍</span><span>' + cityLabel + '</span></span>');
  if (birthdayLabel) line2Parts.push('<span style="display:inline-flex;align-items:center;gap:3px;">' + birthdayLabel + '</span>');
  var dot = '<span style="opacity:0.35;">·</span>';
  var line2Html = line2Parts.length
    ? '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px 6px;font-size:0.78rem;color:var(--text-muted);margin-top:4px;">' + line2Parts.join(dot) + '</div>'
    : '';

  // ── Member since ──────────────────────────────────────────
  var sinceHtml = '';
  if (u.createdAt) {
    try {
      var sd = new Date(u.createdAt);
      var _mns = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      sinceHtml = '<div style="display:flex;align-items:center;gap:4px;font-size:0.73rem;color:var(--text-muted);margin-top:3px;opacity:0.8;"><span>🗓️</span><span>Membro desde ' + _mns[sd.getMonth()] + ' ' + sd.getFullYear() + '</span></div>';
    } catch(e) {}
  }

  // ── Sports / skill pills ──────────────────────────────────
  var sportsHtml = _profileSheetSportsHtml(u);

  // ── Stats placeholder — filled async by _loadAndRenderFriendStats ─────────
  // Section always rendered for friends; async fetch replaces the spinner.
  var statsHtml = isFriend
    ? hr + '<div id="friend-stats-section" style="text-align:center;font-size:0.75rem;color:var(--text-muted);padding:6px 0;">⏳ Carregando histórico...</div>'
    : '';

  // ── Empty state when profile is bare ─────────────────────
  var hasBasicInfo = cityLabel || genderLabel || sportsHtml;
  var emptyHint = !hasBasicInfo ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:10px;font-style:italic;">Perfil ainda não preenchido</div>' : '';

  // ── Actions ───────────────────────────────────────────────
  var actionsHtml = '';
  if (!isMe) {
    if (isFriend) {
      actionsHtml = '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">' +
        '<button class="btn btn-danger btn-sm" onclick="window._closeUserProfileSheet(); window._removeFriend(\'' + safeUid + '\')">Desfazer amizade</button>' +
      '</div>';
    } else if (isSent) {
      actionsHtml = '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">' +
        '<button class="btn btn-ghost btn-sm" style="opacity:0.8;pointer-events:none;">✉️ Convite enviado</button>' +
        '<button class="btn btn-danger btn-sm" onclick="window._closeUserProfileSheet(); window._spinButton(this,\'Cancelando...\'); _cancelFriendRequest(\'' + safeUid + '\')">Cancelar</button>' +
      '</div>';
    } else if (u.acceptFriendRequests !== false) {
      actionsHtml = '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">' +
        '<button class="btn btn-primary" onclick="window._closeUserProfileSheet(); window._spinButton(this,\'Enviando...\'); _sendFriendRequest(\'' + safeUid + '\')">Convidar para amigos</button>' +
      '</div>';
    }
  }

  // ── Header: avatar left + name/info right ─────────────────
  var headerHtml =
    '<div style="display:flex;align-items:flex-start;gap:14px;padding-bottom:14px;">' +
      _profileSheetAvatarHtml(u, uid, 62, borderColor) +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + fullName + '</div>' +
        line2Html +
        sinceHtml +
        emptyHint +
      '</div>' +
    '</div>';

  _mountProfileSheet(
    headerHtml +
    (sportsHtml ? hr + sportsHtml : '') +
    statsHtml +
    actionsHtml
  );

  // Kick off async stats load AFTER sheet is in DOM
  if (isFriend) { _loadAndRenderFriendStats(uid, hr); }
}

function _renderInviteDetailSheet(u) {
  var uid = u._docId || u.uid || u.email;
  var allUids = (window._exploreInviteGroups && window._exploreInviteGroups[uid]) || [uid];
  var safeUid = String(uid || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var allUidsJs = allUids.map(function (id) {
    return "'" + String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }).join(',');
  var fullName = window._safeHtml(window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || 'Usuário'));
  var cityHtml = u.city ? '<div style="font-size:0.84rem;color:var(--text-muted);margin-top:5px;">📍 ' + window._safeHtml(u.city) + '</div>' : '';
  var sportsHtml = _profileSheetSportsHtml(u);

  // Sent-at timestamp — available from v1.3.93-beta onwards; older requests show "data não disponível"
  var sentAtRaw = window._exploreInviteSentAt && window._exploreInviteSentAt[uid];
  var sentAtHtml = '';
  if (sentAtRaw) {
    try {
      var d = new Date(sentAtRaw);
      var day = String(d.getDate()).padStart(2, '0');
      var mon = String(d.getMonth() + 1).padStart(2, '0');
      var yr = d.getFullYear();
      sentAtHtml = '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:5px;">📅 Enviado em ' + day + '/' + mon + '/' + yr + '</div>';
    } catch (e) {}
  }

  // Sem ✕ próprio: _mountProfileSheet já prepende o "← Voltar" canônico
  // (mesmo padrão do sheet de perfil) — antes havia dois controles de fechar.
  _mountProfileSheet(
    '<div style="text-align:center;">' +
      _profileSheetAvatarHtml(u, uid, 64, 'rgba(245,158,11,0.7)') +
      '<div style="font-size:1.1rem;font-weight:700;color:var(--text-bright);">' + fullName + '</div>' +
      cityHtml +
      sportsHtml +
      '<div style="margin-top:14px;padding:10px 16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;font-size:0.82rem;color:var(--sp-c-fbbf24,#fbbf24);">✉️ Convite enviado — aguardando resposta' + (sentAtHtml ? '<br>' + sentAtHtml : '') + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">' +
      '<button class="btn btn-warning btn-sm hover-lift" onclick="window._closeUserProfileSheet(); window._spinButton(this,\'Reenviando...\'); _sendFriendRequest(\'' + safeUid + '\')">🔄 Reenviar</button>' +
      '<button class="btn btn-danger btn-sm" onclick="window._closeUserProfileSheet(); _cancelFriendRequestMulti([' + allUidsJs + '])">✕ Cancelar convite</button>' +
    '</div>'
  );
}


// ═══ REUSO PELA TELA #todas-pessoas (2.1.14) ═════════════════════════════════
// A tela nova precisa do MESMO card e do MESMO botão de ação. Expor é o oposto de
// duplicar: se o card mudar (foto, nome em duas linhas, chips de cidade/esporte), muda
// nos dois lugares de uma vez. Ver a nota em _actionBtnFor.
// Lista de uids dos meus amigos, tolerando as duas formas gravadas (uid solto ou
// objeto {uid}). Sem isto, "já é meu amigo?" daria false pra quem foi salvo como objeto.
window._exploreMeusAmigos = function () {
  var cu = (window.AppStore && window.AppStore.currentUser) || {};
  var raw = Array.isArray(cu.friends) ? cu.friends : [];
  return raw.map(function (f) { return (typeof f === 'string') ? f : (f && (f.uid || f.id) || ''); })
            .filter(Boolean).map(String);
};
window._explorePersonActionBtn = function (u, mySent, myReceived, myFriends) {
  var _t = window._t || function (k) { return k; };
  mySent = mySent || []; myReceived = myReceived || [];
  myFriends = myFriends || window._exploreMeusAmigos();
  var uid = u._docId || u.uid || u.email;
  var isFriend = myFriends.indexOf(String(uid)) !== -1;
  var isSent = mySent.indexOf(uid) !== -1;
  var isReceived = myReceived.indexOf(uid) !== -1;
  var safeUid = (uid || '').replace(/'/g, "\\'").replace(/\\/g, "\\\\");
  var btnClass = u._hasShared ? 'btn btn-warning btn-sm hover-lift' : 'btn btn-primary btn-sm hover-lift';
  // ⛔ 2.1.16 — JÁ É AMIGO: SELO VERDE, NUNCA "CONVIDAR". Ordem do dono: _"no explorar
  // pessoas, os já amigos devem aparecer ali verdes já como amigos nao com o convidar
  // (novamente)"_. Na tela de Pessoas os amigos eram REMOVIDOS da lista de desconhecidos
  // (_dedupeAgainstRelationships), então esta ramificação nunca fez falta lá. A tela
  // #todas-pessoas mostra TODO MUNDO — e sem este ramo ela oferecia convidar de novo
  // quem já é amigo, que além de errado é confuso.
  // ⛔ 2.1.20 — AMIGO NÃO GANHA SELO: A COR JÁ DIZ. Ordem do dono, olhando a tela cheia:
  // _"a cor aqui ja indica ser amigo (nao coloque essa tag que impede a leitura dos
  // nomes)"_. Ele está certo, e o custo era MEDÍVEL: o selo "✓ Amigos" é um bloco fixo de
  // ~90px que não encolhe, dentro de um card de 9.7rem — sobrava tão pouco para o nome que
  // "Fernando Bernacchi" virava "Fernar Bernac…".
  // ⚠️ NÃO É VOLTA ATRÁS DA 2.1.16: o que ele pediu lá foi que amigo PARASSE de aparecer
  // com "Convidar". Isso continua — o que sai é só o rótulo redundante. O card segue verde
  // (variant 'friend'), e verde já quer dizer amigo nas quatro listas.
  // ⛔ E devolver string vazia é de propósito: o rodapé de ação de _userCardHtml colapsa
  // sozinho (flex-shrink:0 sobre conteúdo vazio = largura 0), então o nome fica com a
  // largura inteira do card.
  if (isFriend) return '';
  if (isSent) {
    // ⛔ O ✕ CANÔNICO (círculo vermelho, aro branco, X branco) — window._cancelXBtn.
    // O components.css avisa em letras maiúsculas: "NUNCA reintroduzir ✕ solto colorido —
    // usar sempre esta classe ou window._cancelXBtn". Aqui havia um "✉️ ✕" improvisado.
    // ⛔ SEM FALLBACK: `_cancelXBtn` vive em store.js, que carrega ANTES desta view — um
    // "senão desenha um ✕ simples" seria justamente o ✕ solto que o cânone proíbe, e o
    // teste tests/cancel-x-canon.test.js pegou os dois que eu tinha escrito aqui.
    return window._cancelXBtn(
      "event.stopPropagation(); window._spinButton(this, 'Cancelando...'); _cancelFriendRequest('" + safeUid + "')",
      _t('explore.cancelInviteTitle'), { size: '22px' });
  }
  if (isReceived) {
    return window._exploreResponderConviteBtns(safeUid);
  }
  return '<button class="' + btnClass + '" onclick="event.stopPropagation(); window._spinButton(this, \'Enviando...\'); _sendFriendRequest(\'' + safeUid + '\')">' + _t('explore.invite') + '</button>';
};
window._explorePersonCard = function (u, mySent, myReceived, myFriends) {
  var uid = u._docId || u.uid || u.email;
  var safeUid = String(uid || '').replace(/'/g, "\\'");
  myFriends = myFriends || window._exploreMeusAmigos();
  // ⛔ A COR DIZ O ESTADO, e ela é a MESMA das seções da tela de Pessoas:
  //   verde  = já é amigo        (igual à seção "Meus amigos")
  //   âmbar  = convite pendente  (igual à seção "Convites pendentes") — ordem do dono
  //            (27/ago): _"convites pendentes em ambar"_
  //   neutro = desconhecido
  // Sem o ramo âmbar, quem tinha convite em aberto ficava com o card cinza dos
  // desconhecidos e só o ✕ vermelho denunciava o estado — a cor contava outra história.
  var _mySent = mySent || [], _myRecv = myReceived || [];
  var variant = (myFriends.indexOf(String(uid)) !== -1) ? 'friend'
    : ((_mySent.indexOf(uid) !== -1 || _myRecv.indexOf(uid) !== -1) ? 'pending' : 'other');
  return _userCardHtml(u, uid, window._explorePersonActionBtn(u, mySent, myReceived, myFriends), variant,
    "window._openUserProfile('" + safeUid + "')");
};
