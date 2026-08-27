/* ═══ TODOS OS TORNEIOS DA PLATAFORMA (#todos-torneios) ═══════════════════════
 *
 * Ordem do dono (27/ago/2026): _"esse botao explorar deveria abrir um tela com todos,
 * absolutamente todos os torneios (apenas os dados basicos como nome, modalidade, local
 * etc) com a barra de ordenar e filtrar"_ — e, na sequência, o diagnóstico dele:
 * _"como está é absolutamente inutil que nao mostra nada alem do que ja esta na tela"_.
 * E ainda: _"no explorar podemos indicar tambem x privados ocultados"_.
 *
 * ⚠️ POR QUE ESTA TELA NÃO LÊ O POOL DA DASHBOARD. O "Explorar" era um MODO do filtro da
 * dashboard, servido por `AppStore.publicDiscovery` — e o pill dizia 3 num banco com 39
 * torneios públicos (MEDIDO em 27/ago: 40 resumos, 39 públicos, 1 privado, 0 sandbox).
 * A consulta em si é sadia: rodada no navegador, `tournaments_summary` com
 * `isPublic == true` devolve os 39. O que chegava torto era o POOL — carga assíncrona no
 * login, filtrada por memberUids, que a tela desenha antes de terminar. Uma tela cujo
 * propósito é "todos" não pode depender de um cache que às vezes tem 3: aqui ela BUSCA o
 * que promete, quando abre.
 *
 * ⛔ PRIVADO NÃO É LISTADO — decisão do dono, e é o que separa esta tela de um vazamento.
 * A regra do Firestore deixa qualquer logado LER qualquer resumo (inclusive privado), então
 * "absolutamente todos" era tecnicamente possível. Mas quem marcou o torneio como não
 * público não espera vê-lo numa vitrine. A saída que ele deu: listar os públicos e
 * INDICAR quantos ficaram de fora. A pessoa sabe que existe mais, sem ver o que é de
 * outrem.
 *
 * ⛔ DADOS BÁSICOS, e é literal: nome, modalidade, local, data, formato, status, nº de
 * inscritos. Nada de progresso/favorito/"seu grupo" — isso é do card da dashboard, que
 * fala do SEU círculo. Aqui a lista é da plataforma, e a linha rica prometeria uma relação
 * que a pessoa não tem com 35 destes torneios.
 *
 * A BARRA é a canônica (`_inscritosFilterBar`, mode 'tournaments') — a mesma da dashboard
 * e dos inscritos. Regra do dono: _"a administração disso está centralizada no app
 * justamente para vc não ficar tentando copiar o que já está feito e aprovado"_.
 */
(function () {
  'use strict';

  var _t = function (k, v) { return (typeof window._t === 'function') ? window._t(k, v) : k; };
  var _esc = function (s) { return (typeof window._safeHtml === 'function') ? window._safeHtml(s) : String(s == null ? '' : s); };
  var CHAVE = 'todosTorneios';   // stateKey da barra canônica

  // teto de leitura. Não é enfeite: sem ele um banco grande vira uma consulta que a pessoa
  // paga em espera e em cota. Quando estourar, a tela DIZ que estourou (ver `_aviso`) —
  // silenciar o corte seria a lista mentindo que é "todos".
  var TETO = 300;
  var TETO_PRIVADOS = 200;

  var E = { estado: 'zero', torneios: [], privados: 0, cortou: false, erro: '' };

  function _db() { return (window.FirestoreDB && window.FirestoreDB.db) || null; }

  // ── busca ───────────────────────────────────────────────────────────────────
  // Duas consultas de campo único (índice que o Firestore cria sozinho): os públicos pra
  // listar, e os privados só pra CONTAR. A segunda só roda logado — deslogado a regra nega,
  // e é certo que negue.
  async function _buscar() {
    var db = _db();
    if (!db) { E.estado = 'erro'; E.erro = 'sem-conexao'; return; }
    E.estado = 'carregando';
    try {
      var snap = await db.collection('tournaments_summary')
        .where('isPublic', '==', true).limit(TETO + 1).get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'todos-torneios'); } catch (e) {}
      var out = [];
      snap.forEach(function (doc) {
        var d = doc.data(); if (!d) return;
        if (d.isSandbox) return;                  // o torneio de teste do dev não é da vitrine
        if (!d.id) d.id = doc.id;
        // sentinela do resumo: se alguém pedir jogo/inscrito a este doc leve, o app avisa
        if (typeof window._marcaResumo === 'function') window._marcaResumo(d);
        out.push(d);
      });
      E.cortou = out.length > TETO;
      E.torneios = E.cortou ? out.slice(0, TETO) : out;
      E.estado = 'ok';
    } catch (e) {
      E.estado = 'erro';
      E.erro = (e && e.code) || 'falhou';
      try { window._warn('[todos-torneios] falhou:', e && e.message); } catch (_) {}
      return;
    }
    // contagem dos privados — os documentos NÃO ficam guardados nem desenhados.
    E.privados = 0;
    if (window.AppStore && window.AppStore.currentUser) {
      try {
        var sp = await db.collection('tournaments_summary')
          .where('isPublic', '==', false).limit(TETO_PRIVADOS).get();
        var n = 0;
        sp.forEach(function (doc) { var d = doc.data(); if (d && !d.isSandbox) n++; });
        E.privados = n;
      } catch (e) { E.privados = 0; }   // sem permissão → não promete número nenhum
    }
  }

  // ── ordenar/filtrar: lê o ESTADO da barra canônica, não o DOM ───────────────
  // O DOM some a cada redesenho; o estado da barra sobrevive (window._filterBarState).
  function _visiveis() {
    var st = (window._filterBarState && window._filterBarState[CHAVE]) || {};
    var q = String(st.search || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var sp = st.sport || 'all';
    var arr = E.torneios.filter(function (t) {
      if (sp !== 'all') {
        var s = String(t.sport || '');
        if (typeof window._canonSport === 'function') {
          if (window._canonSport(s) !== window._canonSport(sp)) return false;
        } else if (s !== sp) return false;
      }
      if (!q) return true;
      var blob = [t.name, t.sport, t.venueName, t.format].join(' ').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return blob.indexOf(q) !== -1;
    });
    var sort = st.sort || 'order-desc';
    var dir = (sort.indexOf('-desc') >= 0) ? -1 : 1;
    var porNome = (sort.indexOf('name') === 0);
    return arr.sort(function (a, b) {
      if (porNome) return dir * String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
      var am = new Date(a.startDate || a.createdAt || 0).getTime() || 0;
      var bm = new Date(b.startDate || b.createdAt || 0).getTime() || 0;
      return dir * (am - bm);
    });
  }

  window._todosTornAplicarFiltro = function () {
    var el = document.getElementById('todos-torn-lista');
    if (el) el.innerHTML = _lista(_visiveis());
    var c = document.getElementById('todos-torn-conta');
    if (c) c.innerHTML = _conta(_visiveis().length);
  };

  // ── a linha: dados básicos, e só ────────────────────────────────────────────
  function _linha(t) {
    var st = String(t.status || '');
    var cor = (st === 'finished') ? '#94a3b8'
      : (t.tournamentStarted || st === 'in_progress') ? '#4ade80'
      : (st === 'closed') ? '#fca5a5' : '#60a5fa';
    var rot = (st === 'finished') ? _t('status.finished')
      : (t.tournamentStarted || st === 'in_progress') ? _t('status.active')
      : (st === 'closed') ? _t('status.closed') : _t('status.open');
    var data = '';
    if (t.startDate) {
      try { data = new Date(t.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) {}
    }
    // ⚠️ O NOME DO FORMATO É SÓ EXIBIÇÃO: t.format guarda 'Liga', a tela diz "Pontos
    // Corridos". Passa pelo tradutor canônico — nunca imprimir t.format cru.
    var fmt = (typeof window._formatDisplayName === 'function') ? window._formatDisplayName(t.format) : (t.format || '');
    var n = (typeof t.competitorsCount === 'number') ? t.competitorsCount
      : (typeof t.participantsCount === 'number') ? t.participantsCount : null;
    var meta = [];
    if (t.sport) meta.push('🎾 ' + _esc(t.sport));
    if (t.venueName) meta.push('📍 ' + _esc(t.venueName));
    if (data) meta.push('📅 ' + _esc(data));
    if (fmt) meta.push('🏆 ' + _esc(fmt));
    if (n != null) meta.push('👥 ' + n);
    return '<button type="button" onclick="window._todosTornAbrir(\'' + _esc(String(t.id)) + '\')" ' +
      'style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;cursor:pointer;' +
      'background:' + window._spCor('rgba(255,255,255,0.03)', 'background') + ';' +
      'border:1px solid ' + window._spCor('rgba(255,255,255,0.10)', 'borda') + ';">' +
      '<span style="flex:1;min-width:0;">' +
        '<span style="display:block;font-weight:800;font-size:0.92rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(t.name || 'Torneio') + '</span>' +
        '<span style="display:block;margin-top:3px;font-size:0.72rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + meta.join(' · ') + '</span>' +
      '</span>' +
      '<span style="flex-shrink:0;font-size:0.62rem;font-weight:800;padding:3px 8px;border-radius:6px;white-space:nowrap;' +
        'background:' + window._spCor('rgba(255,255,255,0.06)', 'background') + ';color:' + window._spCor(cor, 'color') + ';">' + _esc(rot) + '</span>' +
    '</button>';
  }

  function _lista(arr) {
    if (!arr.length) {
      return '<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;">Nenhum torneio com esse filtro.</div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:6px;">' + arr.map(_linha).join('') + '</div>';
  }

  function _conta(n) {
    var p = [];
    p.push('<b style="color:var(--text-bright);">' + n + '</b> ' + (n === 1 ? 'torneio' : 'torneios'));
    // ⭐ "x privados ocultados" (ordem do dono). Só aparece quando há — dizer "0 privados
    // ocultados" seria ruído sobre uma decisão que não afetou nada nesta tela.
    if (E.privados > 0) {
      p.push('<span title="Torneios não públicos não entram na lista — só a contagem.">🔒 ' +
        E.privados + ' privado' + (E.privados === 1 ? '' : 's') + ' ocultado' + (E.privados === 1 ? '' : 's') + '</span>');
    }
    if (E.cortou) p.push('<span title="A lista para em ' + TETO + ' — use a busca pra achar o que falta.">⚠️ mostrando os ' + TETO + ' primeiros</span>');
    return p.join(' · ');
  }

  window._todosTornAbrir = function (id) {
    if (typeof window._navTorneioComAviso === 'function') return window._navTorneioComAviso(id);
    window.location.hash = '#tournaments/' + id;
  };

  // ── a página (padrão canônico de page-route: back-header + conteúdo) ─────────
  window.renderAllTournamentsPage = function (container) {
    if (!container) return;
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Todos os torneios' }) : '';
    var barra = (typeof window._inscritosFilterBar === 'function')
      ? window._inscritosFilterBar({
          stateKey: CHAVE, mode: 'tournaments', sticky: true,
          sort: 'order-desc',
          searchId: 'todos-torn-search', sortId: 'todos-torn-sort',
          genderId: 'todos-torn-gender', sportId: 'todos-torn-sport',
          onChange: 'window._todosTornAplicarFiltro()'
        })
      : '';
    function pinta(miolo, conta) {
      container.innerHTML = hdr +
        '<div style="max-width:900px;margin:0 auto;">' +
          '<h2 style="font-size:1.3rem;font-weight:800;margin:0 0 2px;color:var(--text-bright);">Todos os torneios</h2>' +
          '<div id="todos-torn-conta" style="font-size:0.76rem;color:var(--text-muted);margin-bottom:10px;">' + (conta || '') + '</div>' +
          barra +
          '<div id="todos-torn-lista">' + miolo + '</div>' +
        '</div>';
    }
    pinta('<div style="text-align:center;padding:2.5rem 1rem;color:var(--text-muted);font-size:0.9rem;">Carregando os torneios da plataforma…</div>', '');
    _buscar().then(function () {
      // a pessoa pode ter saído da tela enquanto a rede respondia
      var h = window.location.hash || '';
      if (h.indexOf('#todos-torneios') !== 0) return;
      if (E.estado === 'erro') {
        pinta('<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;">' +
          'Não consegui carregar a lista' + (E.erro === 'permission-denied' ? ' (entre na sua conta pra ver tudo).' : '.') +
          '<br><button type="button" class="btn btn-sm" style="margin-top:10px;" onclick="window.renderAllTournamentsPage(document.getElementById(\'view-container\'))">Tentar de novo</button>' +
        '</div>', '');
        return;
      }
      var vis = _visiveis();
      pinta(_lista(vis), _conta(vis.length));
    });
  };
})();
