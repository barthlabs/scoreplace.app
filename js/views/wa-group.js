// scoreplace.app — Grupo no WhatsApp (do JOGO e do TORNEIO)
//
// POR QUE ESTE MÓDULO EXISTE (ler antes de mexer):
// No Brasil o jogo amador é combinado NO GRUPO do WhatsApp, não no app. O
// letzplay entrega os telefones dos outros 3 e a pessoa monta o grupo na mão.
// Aqui a gente entrega o mesmo resultado SEM depender da Meta:
//   1. O dono do grupo cria um grupo VAZIO no WhatsApp dele (a Meta liberou criar
//      grupo sem escolher participantes — é isso que mata a agenda do caminho).
//   2. Cola o link de convite de volta no app.
//   3. O link vira DADO (m.waGroup / t.waGroup) → os outros só clicam e entram.
//
// DOIS NÍVEIS, MESMA MECÂNICA, GATES OPOSTOS:
//   · JOGO    → quem cria/vê são os JOGADORES daquele confronto. É negociação:
//               todo mundo escreve, senão o grupo não serve pra combinar.
//   · TORNEIO → quem cria é o ORGANIZADOR; quem entra é o INSCRITO. É mural:
//               faz sentido "só admin escreve".
//
// CONSEQUÊNCIAS DE DESENHO — não "otimizar" isso sem entender:
//  · NÃO expomos telefone de ninguém. O link de convite tornou desnecessário, e
//    é isso que mantém a feature fora de LGPD/consentimento/toggle de perfil.
//  · NÃO existe API, WABA, portfólio, token nem selo verde no caminho. O
//    transporte é o WhatsApp do PRÓPRIO usuário (mesma filosofia do "copiar
//    convite" e do e-mail que sai do usuário). Zero custo, zero risco de ban.
//  · A Groups API oficial faria isso sozinha, mas exige Official Business
//    Account (selo verde) ou 100k msgs/dia — inalcançável. Ver
//    [[project_whatsapp_meta_2fa_block]].
//  · O link é um token AO PORTADOR: quem tiver, entra. Nosso gate controla a
//    DISTRIBUIÇÃO (só inscrito/jogador vê o botão), não o acesso. A trava real é
//    "Aprovar novos membros", do lado do WhatsApp — por isso a gente ENSINA.
//
// GATE do nível JOGO = FONTE ÚNICA no schedule-poll.js. O "📅 Combinar jogo" é o
// IRMÃO deste botão (mesmo slot, mesma intenção, mesma regra de quem vê). NUNCA
// reimplementar a regra aqui — as duas divergiriam e o dono veria um botão sem o
// outro no mesmo card.
(function () {
  'use strict';

  var OVERLAY_ID = 'wa-group-overlay';
  var WA_GREEN = 'linear-gradient(135deg,#25D366,#128C7E)';

  function _esc(s) { return (window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s)); }
  function _attr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function _cu() { return window.AppStore && window.AppStore.currentUser; }
  function _findT(tId) {
    if (typeof window._findTournamentById === 'function') return window._findTournamentById(tId);
    return window.AppStore && (window.AppStore.tournaments || []).find(function (x) { return String(x.id) === String(tId); });
  }
  // Promise do save — NUNCA engolir rejeição (classe do bug Confra; mesma regra
  // do _save do schedule-poll.js).
  function _save(t) {
    try {
      if (window.FirestoreDB && window.FirestoreDB.saveTournament) return Promise.resolve(window.FirestoreDB.saveTournament(t));
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('FirestoreDB indisponível'));
  }
  function _notify(a, b, k) { if (typeof showNotification === 'function') showNotification(a, b || '', k || 'info'); }

  // Extrai o link de convite de uma colagem. O "Convidar via link → Copiar" do
  // WhatsApp copia a URL limpa, MAS o "Compartilhar" manda com texto em volta
  // ("Entre no meu grupo...: https://chat.whatsapp.com/XXX"). Aceitar os dois é
  // de graça e evita um "link inválido" que o usuário não entenderia.
  function _normalizeLink(raw) {
    var m = String(raw == null ? '' : raw).match(/https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{6,})/);
    return m ? 'https://chat.whatsapp.com/' + m[1] : '';
  }
  // Exposto: é a FONTE ÚNICA do que aceitamos como link de grupo, e o ponto onde
  // um erro é invisível na UI (aceitar lixo → botão "Abrir grupo" que não abre
  // nada; recusar link bom → usuário travado sem entender). Coberto por
  // tests/wa-group-link.test.js.
  window._waGrpNormalizeLink = _normalizeLink;

  // Ícone CANÔNICO do WhatsApp (tournaments-organizer.js). Lazy de propósito: lido
  // no render, não no load — não depende da ordem dos <script>. `.btn` já alinha
  // ícone+texto sozinho (inline-flex + gap), então não precisa de style extra.
  function _icon() { return window._WA_ICON_SVG || ''; }

  function _openExt(url) {
    if (typeof window._openExternalUrl === 'function') window._openExternalUrl(url);
    else window.open(url, '_blank', 'noopener');
  }

  // ─── contexto: JOGO ou TORNEIO ────────────────────────────────────────────────
  // O shape do dado é o MESMO nos dois níveis (waGroup) e o overlay é o mesmo.
  // Muda o DONO do dado, o GATE e as instruções. matchId vazio = torneio.
  function _ctx(tId, matchId, groupMode) {
    var t = _findT(tId); if (!t) return null;
    if (!matchId) return { t: t, target: t, scope: 'tournament', groupMode: false };
    var m = window._schFindMatch(t, matchId); if (!m) return null;
    return { t: t, target: m, m: m, scope: 'match', groupMode: !!(groupMode && groupMode !== '0') };
  }
  function _isOrg(t, cu) {
    return !!(typeof window._isUserOrgOrCoHost === 'function' && window._isUserOrgOrCoHost(t, cu));
  }
  function _isEnrolled(t, cu) {
    return !!(typeof window._isUserEnrolledInTournament === 'function' && window._isUserEnrolledInTournament(cu, t));
  }
  // Quem pode CRIAR/TROCAR o link. Jogo: qualquer jogador do confronto (o grupo é
  // deles; quem chegar primeiro monta). Torneio: só organizador/co-host — o grupo
  // é oficial do evento.
  function _canManage(ctx, cu) {
    if (!cu || !cu.uid) return false;
    if (ctx.scope === 'match') return window._schUserIsPlayer(ctx.t, ctx.m, cu);
    return _isOrg(ctx.t, cu);
  }

  // ─── Rei/Rainha: o grupo é do GRUPO, não do jogo ──────────────────────────────
  // Os 3 jogos do grupo têm as MESMAS 4 pessoas → um grupo de WhatsApp só. O
  // portador é o m0 (mesma regra do _schMirrorToGroup). Espelha pros irmãos pra
  // que qualquer card do grupo mostre "Abrir grupo".
  function _mirror(ctx) {
    var m0 = ctx.m; if (!m0 || !m0.isMonarch) return;
    (window._schGroupMatches(ctx.t, m0) || []).forEach(function (sm) {
      if (sm && sm !== m0) sm.waGroup = m0.waGroup;
    });
  }

  // Nome sugerido do grupo. No jogo, "JOGO N" é a numeração canônica do torneio
  // (m._gameNum, carimbada no render) — o mesmo número que a pessoa vê no card,
  // então o grupo bate com o app sem ela traduzir nada.
  function _groupName(ctx) {
    var t = ctx.t;
    var sport = (t && t.sport) ? String(t.sport) : '';
    var tname = (t && t.name) ? String(t.name) : '';
    // Torneio quase sempre já tem a modalidade no nome ("Copa Verão de Beach
    // Tennis") — repetir daria "... Beach Tennis · Copa Verão de Beach Tennis".
    var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var withSport = function (bits) {
      if (sport && !(tname && norm(tname).indexOf(norm(sport)) !== -1)) bits.push(sport);
      if (tname) bits.push(tname);
      return bits.join(' · ');
    };
    if (ctx.scope === 'tournament') return withSport([]) || 'Torneio';
    var m = ctx.m;
    return withSport([(m && m._gameNum != null) ? ('Jogo ' + m._gameNum) : 'Jogo']);
  }

  // ─── chips ────────────────────────────────────────────────────────────────────
  function _btn(label, onclick, extra) {
    return '<button type="button" class="btn btn-micro btn-shine hover-lift" onclick="' + onclick + '" ' +
      'style="background:' + WA_GREEN + ';color:#fff;font-size:0.72rem;font-weight:800;' + (extra || '') + '">' +
      _icon() + label + '</button>';
  }
  function _editBtn(onclick, title) {
    return '<button type="button" class="btn btn-micro hover-lift" title="' + title + '" onclick="' + onclick + '" ' +
      'style="background:rgba(255,255,255,0.08);color:var(--text-muted);font-size:0.72rem;font-weight:800;padding:4px 8px;">✎</button>';
  }

  // Chip do JOGO. Regra de exibição idêntica ao irmão (_schCardChip): só jogador do
  // confronto, só rodada atual, só enquanto o jogo não terminou. Com link, aparece
  // mesmo fora da rodada atual — quem já tem grupo continua achando ele.
  function _matchChip(t, m, groupMode) {
    var cu = _cu(); if (!cu || !cu.uid) return '';
    if (!window._schUserIsPlayer(t, m, cu)) return '';
    var args = '\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\',' + (groupMode ? '1' : '0');
    var open = 'event.stopPropagation(); window._waGrpOpen(' + args + ')';
    if (m.waGroup && m.waGroup.link) {
      // "Abrir grupo" é VERBO — clicar faz o que diz (abre o WhatsApp), sem tela
      // intermediária. O ✎ ao lado é a saída pra trocar o link (grupo refeito).
      return '<span style="display:inline-flex;align-items:stretch;gap:3px;">' +
        _btn('Abrir grupo', 'event.stopPropagation(); window._waGrpOpenLink(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')') +
        _editBtn(open, 'Trocar o link do grupo') + '</span>';
    }
    if (!window._schIsCurrentRoundMatch(t, m)) return '';
    return _btn('Criar grupo', open);
  }

  window._waGrpCardChip = function (t, m) {
    try {
      if (!t || !m) return '';
      // Rei/Rainha: o chip é ÚNICO por grupo (cabeçalho, via _waGrpGroupChip) —
      // não um por jogo. Mesma supressão do _schCardChip.
      if (m.isMonarch) return '';
      if (m.winner || m.isBye || m.isSitOut) return '';
      if (!m.p1 || !m.p2 || m.p1 === 'BYE' || m.p2 === 'BYE' || m.p1 === 'TBD' || m.p2 === 'TBD') return '';
      return _matchChip(t, m, false);
    } catch (e) { return ''; }
  };

  window._waGrpGroupChip = function (t, groupMatches) {
    try {
      if (!t || !Array.isArray(groupMatches) || !groupMatches.length) return '';
      var m0 = groupMatches.find(function (m) { return m && !m.isBye && !m.isSitOut; }) || groupMatches[0];
      if (!m0) return '';
      if (groupMatches.every(function (m) { return m.winner || m.isBye || m.isSitOut; })) return '';
      return _matchChip(t, m0, true);
    } catch (e) { return ''; }
  };

  // Chip do TORNEIO — FERRAMENTAS DO ORGANIZADOR (criar/trocar). Só organizador.
  window._waGrpTournamentOrgChip = function (t) {
    try {
      var cu = _cu(); if (!t || !cu || !cu.uid) return '';
      if (!_isOrg(t, cu)) return '';
      var open = 'event.stopPropagation(); window._waGrpOpenTournament(\'' + _attr(t.id) + '\')';
      return _btn((t.waGroup && t.waGroup.link) ? 'Grupo do torneio' : 'Criar grupo do torneio', open);
    } catch (e) { return ''; }
  };

  // Chip do TORNEIO — ENTRAR (participante). Só inscrito (ou organizador), e só
  // quando o grupo existe: sem link não há o que entrar.
  window._waGrpTournamentJoinChip = function (t) {
    try {
      var cu = _cu(); if (!t || !cu || !cu.uid) return '';
      if (!t.waGroup || !t.waGroup.link) return '';
      if (!_isEnrolled(t, cu) && !_isOrg(t, cu)) return '';
      return _btn('Entrar no grupo', 'event.stopPropagation(); window._waGrpOpenLink(\'' + _attr(t.id) + '\',\'\')');
    } catch (e) { return ''; }
  };

  // ─── abrir o grupo (ação de 1 clique) ─────────────────────────────────────────
  window._waGrpOpenLink = function (tId, matchId) {
    var ctx = _ctx(tId, matchId); if (!ctx) return;
    var wg = ctx.target.waGroup;
    if (!wg || !wg.link) return;
    _openExt(wg.link);
  };

  // ─── overlay ──────────────────────────────────────────────────────────────────
  // ATENÇÃO: o id está na safe-list do _softRefreshView (store.js) — sem isso o
  // snapshot do Firestore disparado pelo NOSSO PRÓPRIO save varre o overlay no meio
  // do fluxo ("abre e fecha sozinho"). Ver [[project_overlay_softrefresh_detection]].
  function _overlay(innerHtml) {
    var ex = document.getElementById(OVERLAY_ID); if (ex) ex.remove();
    var o = document.createElement('div');
    o.id = OVERLAY_ID;
    o.style.cssText = 'position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:460px;max-height:90vh;overflow:auto;border-radius:16px;border:1px solid rgba(37,211,102,0.35);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }
  window._waGrpClose = function () { var o = document.getElementById(OVERLAY_ID); if (o) o.remove(); };

  function _step(n, title, bodyHtml, note) {
    return '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:12px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:rgba(37,211,102,0.18);border:1px solid rgba(37,211,102,0.5);color:#25D366;font-size:0.68rem;font-weight:800;flex-shrink:0;">' + n + '</span>' +
        '<span style="font-size:0.8rem;font-weight:700;color:var(--text-bright);">' + title + '</span>' +
      '</div>' + bodyHtml +
      (note ? '<div style="font-size:0.66rem;color:var(--text-muted);line-height:1.5;margin-top:6px;">' + note + '</div>' : '') +
      '</div>';
  }

  // Aviso de permissões — SÓ no nível TORNEIO (o grupo do jogo é conversa entre 4;
  // mural e aprovação só atrapalhariam lá).
  //
  // ⚠️ TESTADO NO APARELHO (dono, jul/2026) — não reescrever sem testar de novo:
  //  1. Desligar "Adicionar membros" / "Convidar via link ou QR code" REDEFINE o
  //     link na hora (diálogo "O link do grupo será redefinido"). Só afeta os
  //     MEMBROS: o ADMIN continua com "Convidar via link ou QR code" na tela do
  //     grupo. Por isso a ordem importa — configurar ANTES de copiar o link.
  //  2. Com os dois desligados, só o admin distribui o link → o app entrega pros
  //     inscritos e mais ninguém. "Aprovar novos membros" fecha o resto (o link é
  //     token ao portador; se um inscrito repassar, a aprovação segura).
  function _permsHtml() {
    var row = function (verb, color, name, body) {
      return '<div style="display:flex;gap:7px;align-items:baseline;margin-bottom:7px;">' +
        '<span style="flex-shrink:0;font-size:0.6rem;font-weight:800;color:' + color + ';border:1px solid ' + color + ';border-radius:4px;padding:1px 5px;letter-spacing:0.03em;">' + verb + '</span>' +
        '<div style="font-size:0.7rem;line-height:1.5;color:var(--text-muted);">' +
          '<b style="color:var(--text-bright);">' + name + '</b> — ' + body + '</div></div>';
    };
    return '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:12px;margin-bottom:10px;">' +
      '<div style="font-size:0.8rem;font-weight:700;color:var(--text-bright);margin-bottom:4px;">⚙️ Deixe o grupo só seu (recomendado)</div>' +
      '<div style="font-size:0.68rem;line-height:1.5;color:#fbbf24;margin-bottom:10px;">Faça isto <b>antes</b> de copiar o link: mexer nessas opções <b>redefine o link</b>, e o que já estiver salvo aqui para de funcionar.</div>' +
      '<div style="font-size:0.64rem;color:var(--text-muted);margin-bottom:6px;">Nome do grupo → <b style="color:var(--text-bright);">Permissões do grupo</b> → "Os membros do grupo podem":</div>' +
      row('DESLIGUE', '#f87171', 'Enviar novas mensagens', 'o grupo vira mural: só você avisa, os inscritos leem.') +
      row('DESLIGUE', '#f87171', 'Adicionar membros', 'ninguém põe gente de fora no grupo.') +
      row('DESLIGUE', '#f87171', 'Convidar via link ou QR code', 'só você distribui o link — e o app entrega ele só pros inscritos.') +
      '<div style="font-size:0.64rem;color:var(--text-muted);margin:10px 0 6px;">Em "Os admins do grupo podem":</div>' +
      row('LIGUE', '#4ade80', 'Aprovar novos membros', 'a trava final: quem chegar pelo link cai em "Participantes pendentes" e só entra se você aprovar. É o que segura se um inscrito repassar o link.') +
      '<div style="font-size:0.64rem;color:var(--text-muted);line-height:1.5;margin-top:4px;padding-top:8px;border-top:1px solid var(--border-color);">' +
      'Só depois: tela do grupo → <b style="color:var(--text-bright);">Convidar via link ou QR code</b> → Copiar. Mesmo com tudo desligado, o link continua aí <b>pra você</b> — o desligado vale pros membros.</div>' +
      '</div>';
  }

  function _render(ctx) {
    var t = ctx.t, isT = ctx.scope === 'tournament';
    var wg = ctx.target.waGroup;
    var gname = _groupName(ctx);
    var title = isT ? 'Grupo do torneio' : (ctx.groupMode ? 'Grupo do seu grupo' : 'Grupo do jogo');
    var sub = isT ? _esc(t.name || '')
      : ((ctx.groupMode ? 'Os 3 jogos do grupo' : (_esc(ctx.m.p1 || '') + ' vs ' + _esc(ctx.m.p2 || ''))) + ' · ' + _esc(t.name || ''));
    var idArgs = '\'' + _attr(t.id) + '\',\'' + (isT ? '' : _attr(ctx.m.id)) + '\'';

    var header =
      '<div style="padding:0.85rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid var(--border-color);background:linear-gradient(135deg,#128C7E,#075E54);border-radius:16px 16px 0 0;position:sticky;top:0;z-index:2;">' +
        '<div style="min-width:0;">' +
          '<div style="font-size:0.95rem;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px;">' + _icon() + title + '</div>' +
          '<div style="font-size:0.68rem;color:rgba(255,255,255,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + sub + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-micro" onclick="window._waGrpClose()" style="background:rgba(255,255,255,0.15);color:#fff;flex-shrink:0;">Fechar</button>' +
      '</div>';

    var body = '';

    if (wg && wg.link) {
      body += '<div style="background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.4);border-radius:12px;padding:12px;margin-bottom:10px;">' +
        '<div style="font-size:0.8rem;font-weight:700;color:#25D366;margin-bottom:4px;">✅ O grupo já existe</div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);">Criado por <b style="color:var(--text-bright);">' + _esc(wg.byName || 'um jogador') + '</b>. ' +
          (isT ? 'Todos os inscritos entram pelo mesmo link.' : 'Todos deste jogo entram pelo mesmo link.') + '</div>' +
        '<button type="button" class="btn hover-lift btn-shine" onclick="window._waGrpOpenLink(' + idArgs + ')" style="background:' + WA_GREEN + ';color:#fff;width:100%;justify-content:center;margin-top:10px;">' + _icon() + 'Abrir grupo no WhatsApp ↗</button>' +
        '</div>';
      if (isT) body += _permsHtml();
      body += '<details><summary style="font-size:0.72rem;color:var(--text-muted);cursor:pointer;padding:6px 2px;">Trocar o link (o grupo foi refeito)</summary>';
    } else {
      body += _step(1, 'Criar o grupo (vazio) no WhatsApp',
        '<div style="background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;padding:9px 10px;font-size:0.8rem;font-weight:600;color:var(--text-bright);word-break:break-word;">' + _esc(gname) + '</div>' +
        '<button type="button" class="btn hover-lift btn-shine" onclick="window._waGrpCopyAndOpen(' + idArgs + ')" style="background:' + WA_GREEN + ';color:#fff;width:100%;justify-content:center;margin-top:8px;">' + _icon() + 'Copiar nome e abrir WhatsApp ↗</button>',
        'No WhatsApp: <b style="color:var(--text-bright);">Novo grupo → pule a escolha de participantes</b> → cole o nome. Não precisa salvar contato de ninguém.');
      if (isT) body += _permsHtml();
    }

    body += _step(wg && wg.link ? '✎' : (isT ? 3 : 2), 'Colar o link do convite',
      '<input type="text" id="wa-grp-link" placeholder="https://chat.whatsapp.com/..." ' +
        'style="width:100%;box-sizing:border-box;min-width:0;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-bright);border-radius:8px;padding:9px 10px;font-size:0.82rem;">' +
      '<button type="button" class="btn hover-lift" onclick="window._waGrpSaveLink(' + idArgs + ',' + (ctx.groupMode ? '1' : '0') + ')" style="background:#4f46e5;color:#fff;width:100%;justify-content:center;margin-top:8px;">Salvar link do grupo</button>',
      'No grupo: <b style="color:var(--text-bright);">Convidar via link → Copiar</b>. A partir daí ' +
      (isT ? 'os inscritos só clicam em "Entrar no grupo"' : 'os outros só clicam em "Abrir grupo"') + ' — ninguém mais monta nada.');

    if (wg && wg.link) body += '</details>';

    _overlay(header + '<div style="padding:1rem;">' + body + '</div>');
  }

  function _open(tId, matchId, groupMode) {
    var ctx = _ctx(tId, matchId, groupMode); if (!ctx) return;
    var cu = _cu();
    if (!cu || !cu.uid) { _notify('Entre pra criar o grupo', 'Faça login pra montar o grupo.', 'warning'); return; }
    if (!_canManage(ctx, cu)) {
      _notify(ctx.scope === 'tournament' ? 'Só o organizador' : 'Só os jogadores',
        ctx.scope === 'tournament' ? 'Só o organizador do torneio pode criar o grupo.' : 'Só quem joga este confronto pode criar o grupo.', 'warning');
      return;
    }
    _render(ctx);
  }
  window._waGrpOpen = function (tId, matchId, groupMode) { _open(tId, matchId, groupMode); };
  window._waGrpOpenTournament = function (tId) { _open(tId, '', false); };

  window._waGrpCopyAndOpen = function (tId, matchId) {
    var ctx = _ctx(tId, matchId); if (!ctx) return;
    var name = _groupName(ctx);
    // O clipboard é assíncrono, mas o WhatsApp PRECISA abrir dentro do gesto de
    // clique (iOS Safari suprime a navegação fora dele) — mesma regra do
    // _contactOrganizerDirect. Por isso: copia sem await e abre já.
    try { if (navigator.clipboard) navigator.clipboard.writeText(name); } catch (e) {}
    _openExt('https://wa.me/');
    _notify('Nome copiado', 'Crie o grupo vazio, cole o nome e volte com o link.', 'success');
  };

  window._waGrpSaveLink = function (tId, matchId, groupMode) {
    var ctx = _ctx(tId, matchId, groupMode); if (!ctx) return;
    var cu = _cu();
    if (!cu || !cu.uid) { _notify('Entre pra salvar', '', 'warning'); return; }
    if (!_canManage(ctx, cu)) { _notify('Sem permissão', '', 'warning'); return; }

    var el = document.getElementById('wa-grp-link');
    var link = _normalizeLink(el && el.value);
    if (!link) { _notify('Link inválido', 'Cole o link que começa com chat.whatsapp.com — é o "Convidar via link" do grupo.', 'warning'); return; }

    // Concorrência: se outro jogador colou um link enquanto este estava com o
    // overlay aberto, não sobrescreve calado. Qualquer jogador PODE trocar o link
    // (o grupo pode ser refeito), então aqui é confirmação — não bloqueio.
    var prev = ctx.target.waGroup;
    if (prev && prev.link && prev.link !== link && prev.byUid !== cu.uid) {
      if (!window.confirm((prev.byName || 'Outra pessoa') + ' já criou um grupo aqui. Substituir pelo seu link?')) return;
    }

    ctx.target.waGroup = { link: link, byUid: cu.uid, byName: (cu.displayName || cu.name || ''), at: Date.now() };
    if (ctx.groupMode) _mirror(ctx);

    _save(ctx.t).then(function () {
      window._waGrpClose();
      _notify('Grupo salvo', ctx.scope === 'tournament'
        ? 'Os inscritos já veem "Entrar no grupo".' : 'Os outros jogadores já veem "Abrir grupo".', 'success');
      try { _notifyOthers(ctx); } catch (e) {}
      if (typeof window._rerenderBracket === 'function' && ctx.scope === 'match') window._rerenderBracket(ctx.t.id);
      else if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }).catch(function (err) {
      // Reverte o otimista — mesmo padrão do _saveSchedule.
      ctx.target.waGroup = prev;
      if (ctx.groupMode) _mirror(ctx);
      var msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      _notify('⚠️ Não salvou', 'Não foi possível registrar no servidor (' + msg + ').', 'error');
      try { console.error('[wa-group] rejeitado:', err); } catch (e) {}
    });
  };

  // Avisa quem interessa (push/in-app — nunca WhatsApp; esse canal depende de API
  // que a gente não tem). No jogo, uids via _schMatchUids → _participantUids, então
  // cada pessoa da dupla é avisada individualmente. No torneio, o helper canônico
  // que já respeita as preferências de cada inscrito.
  function _notifyOthers(ctx) {
    var cu = _cu(); var mine = (cu && cu.uid) || '';
    var who = (cu && (cu.displayName || cu.name)) || 'Alguém';
    if (ctx.scope === 'tournament') {
      if (typeof window._notifyTournamentParticipants !== 'function') return;
      window._notifyTournamentParticipants(ctx.t, {
        type: 'wa_group', tournamentId: String(ctx.t.id), tournamentName: ctx.t.name || '',
        title: 'Grupo do torneio no WhatsApp',
        message: who + ' criou o grupo do WhatsApp de "' + (ctx.t.name || '') + '". Entre pelo link no app.',
        level: 'fundamental', timestamp: Date.now()
      }, cu && cu.email);
      return;
    }
    if (typeof window._sendUserNotification !== 'function') return;
    var m = ctx.m;
    var data = {
      type: 'wa_group', tournamentId: String(ctx.t.id), tournamentName: ctx.t.name || '', matchId: m.id,
      title: 'Grupo do jogo criado',
      message: who + ' criou o grupo do WhatsApp de "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '". Entre pelo link no app.',
      level: 'fundamental', timestamp: Date.now()
    };
    (window._schMatchUids(ctx.t, m) || []).forEach(function (u) {
      if (u && u !== mine) window._sendUserNotification(u, data);
    });
  }
})();
