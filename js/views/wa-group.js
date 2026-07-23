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
//  · NÃO expomos telefone de ninguém. O link de convite tornou isso desnecessário,
//    e é isso que mantém a feature fora de LGPD/consentimento.
//  · v1.2.9 — CORREÇÃO da linha acima: ela dizia "fora de ... toggle de perfil".
//    Não vale mais. O toggle `notifyWhatsApp` PASSA a valer aqui, e o motivo NÃO é
//    LGPD (segue sem telefone exposto): é que quem desliga não quer WhatsApp, ponto
//    — nem pra ser chamado, nem pra ser posto em grupo. Ele fica no e-mail + na
//    notificação da plataforma/celular. Vale igual pra ORGANIZADOR e PARTICIPANTE.
//    Gate de fonte única: _waAllowed(cu). Ver [[project_whatsapp_meta_2fa_block]].
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
  // Data/hora curta pra "Última notificação" (dd/mm às HH:MM).
  function _fmtNotifiedAt(ms) {
    try { var d = new Date(ms); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

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
  // v1.2.9: o toggle "WhatsApp" do perfil (notifyWhatsApp) vale pra ORGANIZADOR e
  // PARTICIPANTE por igual: ligado = pode ser contatado E incluído em grupo por
  // WhatsApp; desligado = fica no e-mail + notificação da plataforma/celular.
  // Desligado, nenhum chip de grupo aparece — nem criar, nem entrar. Não adianta
  // esconder só o "entrar": quem não quer WhatsApp também não hospeda grupo.
  // Default ON (!== false) pra ninguém perder a feature sem ter escolhido.
  // Gate de FONTE ÚNICA — todos os chips passam por aqui. Ver
  // project_whatsapp_meta_2fa_block.
  function _waAllowed(cu) {
    return !!cu && cu.notifyWhatsApp !== false;
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
      if (!sm || sm === m0) return;
      // Espelha os DOIS sentidos: criar/trocar copia, apagar APAGA. Sem o delete,
      // apagar no m0 deixaria os jogos irmãos com o link morto (o chip lê por match).
      if (m0.waGroup) sm.waGroup = m0.waGroup; else delete sm.waGroup;
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
    // Rei/Rainha (modo grupo): o grupo cobre os 3 jogos da RODADA daquele grupo —
    // "Jogo N" não serve (são três, e o m0 nem sempre tem _gameNum). Usa "R{rodada}",
    // a MESMA convenção que o motor já grava no label do jogo ('R' + roundNum, ver
    // bracket-logic). Sem colisão: cada pessoa está em um só grupo por rodada.
    if (ctx.groupMode) {
      return withSport([(m && m.round != null) ? ('R' + m.round) : 'Rodada']);
    }
    return withSport([(m && m._gameNum != null) ? ('Jogo ' + m._gameNum) : 'Jogo']);
  }

  // ─── chips ────────────────────────────────────────────────────────────────────
  // Label em DUAS LINHAS (<br>) de propósito: botão de 2 palavras numa linha só fica
  // largo e é o primeiro a ser empurrado pra linha de baixo, sozinho. Quebrado, ele
  // fica estreito e cabe junto dos outros. Mesmo shape do irmão "📅 Combinar<br>jogos"
  // (padding 4px 9px + line-height 1.05 + centro) pra os dois ficarem gêmeos.
  // RAIO CANÔNICO 10px (o mesmo de `.btn` em components.css). `.btn-micro` traz 6px — medido no
  // navegador: 6px aqui contra 10px em TODO botão do app, e o chip ficava visivelmente menos
  // arredondado que os vizinhos ("fora do padrão", dono 22/jul). O chip de ENTRAR já corrigia isso
  // inline, o que só provava a intenção. Agora é o default dos dois. Ver o cânone de botões no
  // CLAUDE.md (border-radius 10px).
  function _btn(label, onclick, extra) {
    return '<button type="button" class="btn btn-micro btn-shine hover-lift" onclick="' + onclick + '" ' +
      'style="background:' + WA_GREEN + ';color:#fff;font-size:0.72rem;font-weight:800;' +
      'padding:4px 9px;line-height:1.05;text-align:center;border-radius:10px;' + (extra || '') + '">' +
      _icon() + label + '</button>';
  }
  function _editBtn(onclick, title) {
    return '<button type="button" class="btn btn-micro hover-lift" title="' + title + '" onclick="' + onclick + '" ' +
      'style="background:rgba(255,255,255,0.08);color:var(--text-muted);font-size:0.72rem;font-weight:800;padding:4px 5px;">✎</button>';
  }

  // Chip do JOGO. Regra de exibição idêntica ao irmão (_schCardChip): só jogador do
  // confronto, só rodada atual, só enquanto o jogo não terminou. Com link, aparece
  // mesmo fora da rodada atual — quem já tem grupo continua achando ele.
  function _matchChip(t, m, groupMode) {
    var cu = _cu(); if (!cu || !cu.uid) return '';
    if (!_waAllowed(cu)) return '';
    if (!window._schUserIsPlayer(t, m, cu)) return '';
    var args = '\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\',' + (groupMode ? '1' : '0');
    var open = 'event.stopPropagation(); window._waGrpOpen(' + args + ')';
    if (m.waGroup && m.waGroup.link) {
      // "Abrir grupo" é VERBO — clicar faz o que diz (abre o WhatsApp), sem tela
      // intermediária. O ✎ ao lado é a saída pra trocar o link (grupo refeito).
      return '<span style="display:inline-flex;align-items:stretch;align-self:stretch;gap:2px;min-width:0;">' +
        _btn('Abrir<br>grupo', 'event.stopPropagation(); window._waGrpOpenLink(\'' + _attr(t.id) + '\',\'' + _attr(m.id) + '\')') +
        _editBtn(open, 'Trocar o link do grupo') + '</span>';
    }
    if (!window._schIsCurrentRoundMatch(t, m)) return '';
    return _btn('Criar<br>grupo', open);
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
      if (!_waAllowed(cu)) return '';
      if (!_isOrg(t, cu)) return '';
      var open = 'event.stopPropagation(); window._waGrpOpenTournament(\'' + _attr(t.id) + '\')';
      return _btn((t.waGroup && t.waGroup.link) ? 'Grupo do<br>torneio' : 'Criar grupo<br>do torneio', open);
    } catch (e) { return ''; }
  };

  // Chip do TORNEIO — ENTRAR (participante). Só inscrito (ou organizador), e só
  // quando o grupo existe: sem link não há o que entrar.
  window._waGrpTournamentJoinChip = function (t) {
    try {
      var cu = _cu(); if (!t || !cu || !cu.uid) return '';
      if (!_waAllowed(cu)) return '';
      if (!t.waGroup || !t.waGroup.link) return '';
      if (!_isEnrolled(t, cu) && !_isOrg(t, cu)) return '';
      // v1.3.100 (dono): texto COMPLETO "grupo oficial do torneio"; border-radius no PADRÃO do app
      // (.btn = 10px; o btn-micro herdado era 6px = "quadrado") e um pouco mais largo.
      return _btn('Entrar no grupo<br>oficial do torneio', 'event.stopPropagation(); window._waGrpOpenLink(\'' + _attr(t.id) + '\',\'\')', 'min-width:118px;padding:6px 14px;');
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
    o.innerHTML = '<div style="background:var(--bg-card,#0f172a);width:96%;max-width:460px;max-height:90%;overflow:auto;border-radius:16px;border:1px solid rgba(37,211,102,0.35);box-shadow:0 20px 60px rgba(0,0,0,0.6);">' + innerHtml + '</div>';
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
        // v1.3.17: organizador reenvia o link do grupo pra TODOS os inscritos (app + e-mail +
        // notificação nativa). Já dispara sozinho ao SALVAR o link; este botão é o reenvio
        // manual (ex.: inscritos que entraram depois). Só no torneio (o modal já é org-only).
        (isT ? '<button type="button" class="btn hover-lift" onclick="window._waGrpNotifyParticipants(' + idArgs + ', this)" style="background:rgba(37,211,102,0.14);border:1px solid rgba(37,211,102,0.5);color:#25D366;width:100%;justify-content:center;margin-top:8px;font-weight:700;">🔔 Notificar participantes</button>' +
          // v1.3.21: confirmação visual — quando foi a última notificação (+ nº de envios).
          (wg.notifiedAt
            ? '<div style="font-size:0.66rem;color:#34d399;font-weight:700;margin-top:7px;display:flex;align-items:center;gap:5px;justify-content:center;"><span>✅</span> Última notificação: ' + _fmtNotifiedAt(wg.notifiedAt) + ((wg.notifyCount > 1) ? ' · ' + wg.notifyCount + ' envios' : '') + '</div>'
            : '<div style="font-size:0.64rem;color:var(--text-muted);margin-top:7px;text-align:center;">Ainda não notificado.</div>') +
          '<div style="font-size:0.64rem;color:var(--text-muted);line-height:1.5;margin-top:6px;">Envia o link do grupo pra todos os inscritos — no app, por e-mail e por notificação. Já acontece sozinho quando você salva o link. O histórico fica em <b style="color:var(--text-bright);">Comunicar inscritos</b>.</div>' : '') +
        '</div>';
      if (isT) body += _permsHtml();
      body += '<details><summary style="font-size:0.72rem;color:var(--text-muted);cursor:pointer;padding:6px 2px;">Trocar o link (o grupo foi refeito)</summary>';
    } else {
      body += _step(1, 'Criar o grupo (vazio) no WhatsApp',
        '<input type="text" id="wa-grp-name" readonly value="' + _esc(gname).replace(/"/g, '&quot;') + '" ' +
        'style="width:100%;box-sizing:border-box;min-width:0;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);' +
        'border-radius:8px;padding:9px 10px;font-size:0.8rem;font-weight:600;color:var(--text-bright);">' +
        '<button type="button" class="btn hover-lift btn-shine" onclick="window._waGrpCopyName(' + idArgs + ',' + (ctx.groupMode ? '1' : '0') + ')" style="background:' + WA_GREEN + ';color:#fff;width:100%;justify-content:center;margin-top:8px;">' + _icon() + 'Copiar nome e abrir WhatsApp\u2197</button>',
        'Agora abra o WhatsApp: <b style="color:var(--text-bright);">Novo grupo → pule a escolha de participantes</b> → cole o nome. Não precisa salvar contato de ninguém.');
      if (isT) body += _permsHtml();
    }

    body += _step(wg && wg.link ? '✎' : (isT ? 3 : 2), 'Colar o link do convite',
      '<input type="text" id="wa-grp-link" placeholder="https://chat.whatsapp.com/..." ' +
        'style="width:100%;box-sizing:border-box;min-width:0;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-bright);border-radius:8px;padding:9px 10px;font-size:0.82rem;">' +
      '<button type="button" class="btn hover-lift" onclick="window._waGrpSaveLink(' + idArgs + ',' + (ctx.groupMode ? '1' : '0') + ', this)" style="background:#4f46e5;color:#fff;width:100%;justify-content:center;margin-top:8px;">Salvar link do grupo</button>',
      'No grupo: <b style="color:var(--text-bright);">Convidar via link → Copiar</b>. A partir daí ' +
      (isT ? 'os inscritos só clicam em "Entrar no grupo"' : 'os outros só clicam em "Abrir grupo"') + ' — ninguém mais monta nada.');

    if (wg && wg.link) {
      // Apagar SEM pôr outro no lugar: volta tudo ao estado anterior à criação do
      // grupo (o botão some do card e reaparece o "Criar grupo"). É a saída pro
      // grupo apagado no WhatsApp — o link fica órfão e não temos como detectar
      // isso sozinhos (o WhatsApp não devolve status pra nós).
      body += '<div style="border-top:1px solid var(--border-color);margin-top:6px;padding-top:10px;">' +
        '<button type="button" class="btn hover-lift" onclick="window._waGrpDeleteLink(' + idArgs + ',' + (ctx.groupMode ? '1' : '0') + ', this)" ' +
        'style="background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.45);color:#f87171;width:100%;justify-content:center;">🗑️ Apagar o link</button>' +
        '<div style="font-size:0.66rem;color:var(--text-muted);line-height:1.5;margin-top:6px;">Tira o link sem pôr outro no lugar — some o botão ' +
        (isT ? '"Entrar no grupo"' : '"Abrir grupo"') + ' e volta o "Criar grupo", como era antes. Use quando o grupo foi apagado no WhatsApp.</div>' +
        '</div>';
      body += '</details>';
    }

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

  // SÓ copia o nome. NÃO tenta abrir o WhatsApp.
  // Isto já foi `_openExt('https://wa.me/')` e era um BUG: wa.me exige um número de
  // destino, e sem ele o iOS responde "Não foi possível abrir este link" — no meio
  // de um fluxo em que a pessoa nem quer falar com ninguém, quer CRIAR um grupo.
  // Não existe deep link pra "novo grupo" (nem wa.me, nem whatsapp://) — a Meta não
  // expõe isso. Então o botão faz o que sabe fazer e o texto diz o resto.
  // ABRIR O WHATSAPP — o esquema importa, e a diferenca e DOCUMENTADA:
  //   · `whatsapp://` (esquema customizado) -> abre o WhatsApp BUSINESS por padrao.
  //     Testado no aparelho do dono (jul/2026): abriu o Business, que ele nem usa.
  //     NAO e aleatorio nem depende de qual app a pessoa usa — e o default do iOS.
  //   · `https://api.whatsapp.com/...` (Universal Link) -> abre o WhatsApp PESSOAL.
  //   · `https://wa.me/` -> mesma familia, MAS exige numero de destino; sem ele o iOS
  //     responde "Nao foi possivel abrir este link" (foi o 1o bug desta feature).
  // Por isso: universal link + `send?text=` (o text dispensa o numero e cai na lista de
  // contatos). Nao existe deep link pra "criar grupo" em nenhum dos dois — o maximo e
  // abrir o app CERTO com o nome ja no clipboard.
  function _openWhatsAppApp() {
    // SEM parametro. Cada peca aqui foi paga com um teste no aparelho do dono:
    //   · `?text=...`  -> abre o app CERTO, mas cai em "enviar pra quem?" (o text
    //                     dispara o fluxo de ENVIO). Sem ele, so abre o app.
    //   · `whatsapp://`-> esquema customizado: o iOS entrega pro BUSINESS por padrao.
    //   · `wa.me/`     -> deu "Nao foi possivel abrir este link".
    // Resta `https://api.whatsapp.com/` puro: universal link (=> WhatsApp PESSOAL,
    // e o default documentado) e sem params (=> nao pede pra enviar nada).
    // Deep link pra "criar grupo" NAO existe — o maximo e abrir o app com o nome ja
    // no clipboard. Nao inventar um; ja custou 3 tentativas.
    try { window.location.href = 'https://api.whatsapp.com/'; } catch (e) {}
  }

  window._waGrpCopyName = function (tId, matchId, groupMode) {
    var ctx = _ctx(tId, matchId, groupMode); if (!ctx) return;
    var el = document.getElementById('wa-grp-name');
    var name = (el && el.value) ? el.value : _groupName(ctx);

    var okThenOpen = function () {
      _notify('Nome copiado', 'Novo grupo -> pule os participantes -> cole o nome.', 'success');
      // So abre DEPOIS de copiar: abrir sem o nome no clipboard nao serve pra nada.
      _openWhatsAppApp();
    };
    // Ultima saida quando a copia falha: seleciona pra pessoa usar o "Copiar" do
    // celular. NAO roda no caminho feliz — rodar sempre era o que abria o teclado e
    // deixava o texto marcado (parecia que o botao so selecionava).
    var selectForManual = function () {
      if (!el) { _notify('Copie o nome', name, 'info'); return; }
      try {
        var wasRO = el.readOnly;
        el.readOnly = false;
        el.focus({ preventScroll: true });
        el.select();
        el.setSelectionRange(0, String(name).length);
        var selOk = (el.selectionEnd - el.selectionStart) === String(name).length;
        var ok = false;
        // execCommand SO conta com selecao real: sem o gate ele devolve TRUE com
        // selecao vazia e o app cantava "copiado" com a colagem vindo vazia.
        try { ok = selOk && !!document.execCommand('copy'); } catch (e) { ok = false; }
        el.readOnly = wasRO;
        if (ok) { okThenOpen(); return; }
      } catch (e) {}
      _notify('Toque em "Copiar"', 'O nome esta selecionado ai em cima — use o menu do celular.', 'warning');
    };

    // ORDEM: clipboard moderno PRIMEIRO (unico confiavel no iOS 13.4+). Antes o
    // execCommand vinha na frente e dava return no TRUE mentiroso dele.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(name).then(okThenOpen).catch(selectForManual);
    } else {
      selectForManual();
    }
  };

  // Botao cinza + spinner enquanto grava — helper CANONICO do app (_spinButton, o
  // mesmo do Sortear/Inscrever). No SUCESSO o overlay fecha e o botao some junto; no
  // ERRO precisa soltar, senao a pessoa nao consegue tentar de novo (o _spinButton
  // reverte sozinho, mas so em 8s — uma eternidade olhando pra tela).
  function _spin(btn, label) {
    if (!btn || typeof window._spinButton !== 'function') return function () {};
    var original = btn.innerHTML, f = btn.style.filter, c = btn.style.cursor, o = btn.style.opacity;
    window._spinButton(btn, label);
    return function () {
      try {
        if (!document.body.contains(btn)) return;
        btn.innerHTML = original; btn.disabled = false;
        btn.style.filter = f; btn.style.cursor = c; btn.style.opacity = o;
        btn.removeAttribute('data-spinning');
      } catch (e) {}
    };
  }

  window._waGrpSaveLink = function (tId, matchId, groupMode, btn) {
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

    var release = _spin(btn, 'Salvando…');
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
      release();
      ctx.target.waGroup = prev;
      if (ctx.groupMode) _mirror(ctx);
      var msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      _notify('⚠️ Não salvou', 'Não foi possível registrar no servidor (' + msg + ').', 'error');
      try { console.error('[wa-group] rejeitado:', err); } catch (e) {}
    });
  };

  // v1.3.17: reenvio MANUAL do convite do grupo pra todos os inscritos (só torneio, org).
  // Mesma notificação que dispara sozinho ao salvar (_notifyOthers): app + e-mail + nativa,
  // com o link do grupo. Útil pra inscritos que entraram depois de o link ter sido salvo.
  window._waGrpNotifyParticipants = function (tId, matchId, btn) {
    var ctx = _ctx(tId, '', 0); if (!ctx || ctx.scope !== 'tournament') return;
    var cu = _cu();
    if (!cu || !cu.uid || !_canManage(ctx, cu)) { _notify('Sem permissão', 'Só o organizador notifica os inscritos.', 'warning'); return; }
    var wg = ctx.target.waGroup;
    if (!wg || !wg.link) { _notify('Sem grupo', 'Salve o link do grupo primeiro.', 'warning'); return; }
    var release = _spin(btn, 'Notificando…');
    try { _notifyOthers(ctx); } catch (e) { try { console.error('[wa-group] notify participantes:', e); } catch (_e) {} }
    if (typeof release === 'function') release();
    _notify('✅ Participantes notificados', 'Os inscritos receberam o link do grupo — no app, por e-mail e por notificação.', 'success');
  };

  // Apaga o link — volta ao estado "sem grupo". Mesmo gate de quem pode criar
  // (jogador do confronto / organizador do torneio) e mesmo padrão otimista +
  // revert do save.
  window._waGrpDeleteLink = function (tId, matchId, groupMode, btn) {
    var ctx = _ctx(tId, matchId, groupMode); if (!ctx) return;
    var cu = _cu();
    if (!cu || !cu.uid || !_canManage(ctx, cu)) { _notify('Sem permissão', '', 'warning'); return; }
    var prev = ctx.target.waGroup;
    if (!prev || !prev.link) { window._waGrpClose(); return; }
    if (!window.confirm('Apagar o link do grupo? O botão some pra todo mundo e volta o "Criar grupo".')) return;

    var releaseD = _spin(btn, 'Apagando…');
    delete ctx.target.waGroup;
    if (ctx.groupMode) _mirror(ctx);

    _save(ctx.t).then(function () {
      window._waGrpClose();
      _notify('Link apagado', 'Voltou ao estado de antes do grupo.', 'success');
      if (typeof window._rerenderBracket === 'function' && ctx.scope === 'match') window._rerenderBracket(ctx.t.id);
      else if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }).catch(function (err) {
      releaseD();
      ctx.target.waGroup = prev;
      if (ctx.groupMode) _mirror(ctx);
      var msg = (err && (err.code || err.message)) ? String(err.code || err.message) : 'tente novamente';
      _notify('⚠️ Não apagou', 'Não foi possível registrar no servidor (' + msg + ').', 'error');
      try { console.error('[wa-group] delete rejeitado:', err); } catch (e) {}
    });
  };

  // Avisa quem interessa (push/in-app — nunca WhatsApp; esse canal depende de API
  // que a gente não tem). No jogo, uids via _schMatchUids → _participantUids, então
  // cada pessoa da dupla é avisada individualmente. No torneio, o helper canônico
  // que já respeita as preferências de cada inscrito.
  // v1.3.21: registra o ENVIO da notificação do grupo no próprio waGroup (notifiedAt +
  // notifyCount + notifyLog[]) e persiste — vira a confirmação visual ("Última notificação")
  // no card do grupo E o relatório na página de Comunicados. Guarda os 20 últimos.
  function _stampGroupNotify(ctx) {
    var wg = ctx.target && ctx.target.waGroup;
    if (!wg) return;
    var cu = _cu(); var now = Date.now();
    wg.notifiedAt = now;
    wg.notifyCount = (wg.notifyCount || 0) + 1;
    if (!Array.isArray(wg.notifyLog)) wg.notifyLog = [];
    wg.notifyLog.unshift({ at: now, byUid: (cu && cu.uid) || '', byName: (cu && (cu.displayName || cu.name)) || '' });
    if (wg.notifyLog.length > 20) wg.notifyLog = wg.notifyLog.slice(0, 20);
    if (ctx.groupMode) _mirror(ctx);
    try { _save(ctx.t).catch(function () {}); } catch (e) {}
  }

  function _notifyOthers(ctx) {
    var cu = _cu(); var mine = (cu && cu.uid) || '';
    var who = (cu && (cu.displayName || cu.name)) || 'Alguém';
    var _wlink = (ctx.target && ctx.target.waGroup && ctx.target.waGroup.link) || '';
    if (ctx.scope === 'tournament') {
      if (typeof window._notifyTournamentParticipants !== 'function') return;
      // v1.3.22 (dono): o convite do grupo TAMBÉM dispara pro ORGANIZADOR (igual o comunicado
      // do org "pra monitorar"). Sem excludeEmail (org entra na lista) + _allowSelf pra furar o
      // self-guard do _sendUserNotification. Assim ele recebe o link no app/e-mail/notificação.
      window._notifyTournamentParticipants(ctx.t, {
        type: 'wa_group', tournamentId: String(ctx.t.id), tournamentName: ctx.t.name || '',
        title: 'Grupo oficial do torneio no WhatsApp',
        message: who + ' convidou você pro grupo oficial de comunicações do torneio "' + (ctx.t.name || '') + '". Toque em "Entrar no grupo".',
        waGroupLink: _wlink, _allowSelf: true,
        level: 'fundamental', timestamp: Date.now()
      });
      _stampGroupNotify(ctx);
      return;
    }
    if (typeof window._sendUserNotification !== 'function') return;
    var m = ctx.m;
    var data = {
      type: 'wa_group', tournamentId: String(ctx.t.id), tournamentName: ctx.t.name || '', matchId: m.id,
      title: 'Grupo do jogo no WhatsApp',
      message: who + ' criou o grupo do WhatsApp de "' + (m.p1 || '') + ' vs ' + (m.p2 || '') + '". Toque em "Entrar no grupo".',
      waGroupLink: _wlink,
      level: 'fundamental', timestamp: Date.now()
    };
    (window._schMatchUids(ctx.t, m) || []).forEach(function (u) {
      if (u && u !== mine) window._sendUserNotification(u, data);
    });
    _stampGroupNotify(ctx);
  }
})();
