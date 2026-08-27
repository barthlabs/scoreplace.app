/* ═══ TODAS AS PESSOAS (#todas-pessoas) ══════════════════════════════════════
 *
 * Ordem do dono (27/ago/2026): _"vamos colocar no pessoas o mesmo botao explorar que
 * criamos para os torneios com relacao às pessoas. ali o numero total de pessoas… o
 * explorar x, abre outra tela com a ordem cronologica por padrao com sorters e filtros
 * (como fazemos no torneio). a primeira sessao tem as pessoas que jogam nos seus locais
 * preferidos e depois em outros locais."_
 *
 * É a irmã de #todos-torneios, e de propósito: mesmo botão, mesma barra canônica, mesmo
 * jeito de guardar o total pro rótulo. O que muda é o eixo do agrupamento — lá é o estado
 * da inscrição, aqui é ONDE a pessoa joga.
 *
 * ⛔ O CARD E O BOTÃO DE AÇÃO SÃO OS DO #explore (window._explorePersonCard). Escrever um
 * card próprio aqui significaria repetir as três ramificações de "já convidei / me
 * convidou / posso convidar" — e é assim que duas telas passam a discordar sobre o mesmo
 * relacionamento. Foi o erro que custou 4 levas hoje; aqui ele já nasce fechado.
 *
 * ⚠️ O QUE O DADO PERMITE, medido em 27/ago/2026 e não suposto: dos 259 perfis, só 40
 * (15%) declaram `preferredLocations`. Então a 1ª seção é pequena por natureza e a 2ª
 * carrega quase todo mundo — inclusive quem NÃO declarou local. Pôr só "quem declarou
 * outro local" na 2ª seção esconderia 219 pessoas de uma tela cujo nome é explorar.
 */
(function () {
  'use strict';

  var _t = function (k) { return (typeof window._t === 'function') ? window._t(k) : k; };
  var _esc = function (s) { return (typeof window._safeHtml === 'function') ? window._safeHtml(s) : String(s == null ? '' : s); };
  var CHAVE = 'todasPessoas';

  var E = { estado: 'zero', pessoas: [], erro: '' };

  // ⛔ A CHAVE DE LOCAL É A DO APP, não uma minha. `window._chaveLocal` (dashboard.js) já
  // resolve o caso real: o perfil grava "Clube X — Av. Tal, 60" e o torneio grava
  // "Clube X, São Paulo". Reimplementar aqui daria um terceiro jeito de comparar local.
  function _chave(v) {
    if (typeof window._chaveLocal === 'function') return window._chaveLocal(v);
    return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split('—')[0].split(',')[0].replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase();
  }
  function _locaisDe(u) {
    var raw = (u && Array.isArray(u.preferredLocations)) ? u.preferredLocations : [];
    return raw.map(function (p) { return _chave(p && (p.label || p.name)); }).filter(Boolean);
  }
  function _meusLocais() {
    var cu = window.AppStore && window.AppStore.currentUser;
    var set = {};
    _locaisDe(cu).forEach(function (k) { set[k] = 1; });
    return set;
  }

  async function _buscar() {
    E.estado = 'carregando';
    if (!window.FirestoreDB || typeof window.FirestoreDB.listInvitableUsers !== 'function') {
      E.estado = 'erro'; E.erro = 'sem-conexao'; return;
    }
    try {
      var todos = await window.FirestoreDB.listInvitableUsers();
      var cu = (window.AppStore && window.AppStore.currentUser) || {};
      var meu = String(cu.uid || cu.email || '');
      E.pessoas = (todos || []).filter(function (u) {
        return u && String(u._docId || u.uid || u.email || '') !== meu;   // eu não me exploro
      });
      E.estado = 'ok';
      // ⭐ guarda o total pro botão da tela de Pessoas — MESMO desenho de #todos-torneios.
      // O número é o que ESTA lista mostra, nunca um total de outra fonte: foi exatamente
      // a divergência que fez o botão de torneios dizer 3 tendo 39 (ver 2.1.11).
      try { localStorage.setItem('scoreplace_totalPessoas', String(E.pessoas.length)); } catch (e) {}
    } catch (e) {
      E.estado = 'erro';
      E.erro = (e && e.code) || 'falhou';
      try { window._warn('[todas-pessoas] falhou:', e && e.message); } catch (_) {}
    }
  }

  function _ts(u) {
    var raw = u.lastSeenAt || u.updatedAt || u.createdAt;
    var ms = raw ? new Date(raw).getTime() : NaN;
    return isNaN(ms) ? 0 : ms;
  }
  function _nome(u) {
    return String((window._friendlyDisplayName ? window._friendlyDisplayName(u) : (u.displayName || u.email || '')) || '');
  }

  // filtra + ordena conforme a barra canônica (mesmo contrato de #todos-torneios)
  function _visiveis() {
    var st = (window._filterBarState && window._filterBarState[CHAVE]) || {};
    var q = String(st.search || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var arr = E.pessoas.filter(function (u) {
      if (!q) return true;
      var blob = [_nome(u), u.city, Array.isArray(u.preferredSports) ? u.preferredSports.join(' ') : u.preferredSports]
        .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return blob.indexOf(q) !== -1;
    });
    // ⚠️ PADRÃO CRONOLÓGICO (ordem do dono) — ao contrário da tela de Pessoas, que ele
    // pediu alfabética. São telas com propósitos diferentes: lá é a sua lista (procura-se
    // um nome), aqui é descoberta (quem apareceu por último).
    var sort = st.sort || 'order-desc';
    var dir = (sort.indexOf('-desc') >= 0) ? -1 : 1;
    var porNome = (sort.indexOf('name') === 0);
    return arr.map(function (u, i) { return { u: u, i: i }; })
      .sort(function (a, b) {
        var c = porNome
          ? dir * _nome(a.u).localeCompare(_nome(b.u), 'pt-BR', { sensitivity: 'base' })
          : dir * (_ts(a.u) - _ts(b.u));
        return c || (a.i - b.i);
      })
      .map(function (o) { return o.u; });
  }

  function _secao(titulo, subtitulo, arr, mySent, myReceived) {
    if (!arr.length) return '';
    return '<div style="margin-top:14px;">' +
      '<div style="font-size:0.78rem;font-weight:800;color:var(--text-bright);text-transform:uppercase;letter-spacing:0.6px;">' + _esc(titulo) + ' (' + arr.length + ')</div>' +
      (subtitulo ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">' + _esc(subtitulo) + '</div>' : '') +
      // ⛔ 2.1.18 — O MESMO GRID DAS OUTRAS LISTAS DE PESSOA. Ordem do dono: _"3 colunas de
      // amigos, 3 colunas de convites. qualquer que seja o numero de colunas de amigos nas
      // diferentes larguras"_ — e depois, olhando ESTA tela: _"a mesma coisa aqui"_.
      // A constante mora em explore.js (window._gridPessoas): enquanto o valor viver em mais
      // de um lugar ele volta a divergir, que foi exatamente o erro da 2.1.17.
      '<div style="' + (window._gridPessoas || 'display:grid;grid-template-columns:repeat(auto-fill,minmax(9.7rem,1fr));gap:8px;') + 'margin-top:8px;">' +
        arr.map(function (u) { return window._explorePersonCard(u, mySent, myReceived); }).join('') +
      '</div></div>';
  }

  function _corpo() {
    var cu = (window.AppStore && window.AppStore.currentUser) || {};
    // ⛔ 2.1.19 — a MESMA rede da tela de Pessoas: quem já é amigo não é convite pendente.
    // Aqui o card já daria verde (o ramo isFriend vem primeiro), mas passar pela rede
    // deixa as duas telas com a MESMA entrada — e evita que uma mudança futura na ordem
    // dos ramos ressuscite o âmbar em cima de um amigo.
    var _rede = window._exploreSemAmigos || function (x) { return x || []; };
    var mySent = _rede(cu.friendRequestsSent || []);
    var myReceived = _rede(cu.friendRequestsReceived || []);
    var meus = _meusLocais();
    var temMeus = Object.keys(meus).length > 0;
    var vis = _visiveis();
    var daqui = [], outros = [];
    vis.forEach(function (u) {
      var casa = temMeus && _locaisDe(u).some(function (k) { return !!meus[k]; });
      (casa ? daqui : outros).push(u);
    });
    if (!vis.length) {
      return '<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;">Ninguém com esse filtro.</div>';
    }
    // Sem locais preferidos no MEU perfil não há como haver 1ª seção — e aí o certo é
    // dizer por quê, não mostrar uma lista só e deixar a pessoa achar que é isso mesmo.
    var aviso = (!temMeus)
      ? '<div style="margin-top:10px;font-size:0.72rem;color:var(--text-muted);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:8px 10px;">' +
        '📍 Cadastre seus <b>locais preferidos</b> no perfil pra ver primeiro quem joga onde você joga.</div>'
      : '';
    return aviso +
      _secao('Jogam nos seus locais', 'Pessoas que escolheram os mesmos locais que você', daqui, mySent, myReceived) +
      _secao(daqui.length ? 'Em outros locais' : 'Pessoas', '', outros, mySent, myReceived);
  }

  window._todasPessoasAplicarFiltro = function () {
    var el = document.getElementById('todas-pessoas-lista');
    if (el) el.innerHTML = _corpo();
    var c = document.getElementById('todas-pessoas-conta');
    if (c) c.innerHTML = '<b style="color:var(--text-bright);">' + _visiveis().length + '</b> ' + (_visiveis().length === 1 ? 'pessoa' : 'pessoas');
    if (typeof window._fitNames === 'function') { try { window._fitNames(document); } catch (e) {} }
  };

  window.renderAllPeoplePage = function (container) {
    if (!container) return;
    // ⛔ 2.1.15: SEM `label`. Ordem do dono: _"inves do voltar esta todos os torneios
    // escrito no botao que deveria ser apenas voltar"_. O `label` do _renderBackHeader é o
    // TEXTO DO BOTÃO, não o título da tela — passar o nome da página ali fazia o botão
    // dizer onde você ESTÁ em vez de para onde ele leva. O default já é "Voltar", e o nome
    // da tela é o <h2> logo abaixo.
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#explore' }) : '';
    var barra = (typeof window._inscritosFilterBar === 'function')
      ? window._inscritosFilterBar({
          stateKey: CHAVE, sticky: true, sort: 'order-desc',
          searchId: 'todas-pessoas-search', sortId: 'todas-pessoas-sort',
          genderId: 'todas-pessoas-gender', skillId: 'todas-pessoas-skill',
          onChange: 'window._todasPessoasAplicarFiltro()'
        })
      : '';
    function pinta(miolo, conta) {
      container.innerHTML = hdr +
        '<div style="max-width:900px;margin:0 auto;">' +
          '<h2 style="font-size:1.3rem;font-weight:800;margin:0 0 2px;color:var(--text-bright);">Todas as pessoas</h2>' +
          '<div id="todas-pessoas-conta" style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">' + (conta || '') + '</div>' +
          barra +
          '<div id="todas-pessoas-lista">' + miolo + '</div>' +
        '</div>';
    }
    pinta('<div style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);font-size:0.9rem;">Carregando as pessoas…</div>', '');
    _buscar().then(function () {
      if ((window.location.hash || '').indexOf('#todas-pessoas') !== 0) return;
      if (E.estado === 'erro') {
        pinta('<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;">Não consegui carregar a lista.</div>', '');
        return;
      }
      pinta(_corpo(), '<b style="color:var(--text-bright);">' + _visiveis().length + '</b> ' + (_visiveis().length === 1 ? 'pessoa' : 'pessoas'));
      if (typeof window._fitNames === 'function') { try { window._fitNames(document); } catch (e) {} }
    });
  };
})();
