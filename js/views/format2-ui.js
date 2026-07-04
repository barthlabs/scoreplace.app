// ─────────────────────────────────────────────────────────────────────────────
// format2-ui.js — UI do CONFIGURADOR ÚNICO (reescrita v4.4.x)
//
// Renderiza os controles de window.FORMAT2 em DOIS modos:
//   • FORM (v4.4.3+): embutido no #fase1-box do editar/criar torneio — o formato
//     é configurado AQUI, no lugar dos seletores antigos. O save do form lê
//     window._f2GetConfig() e compila via compileToPhases.
//   • PAGE (legado): página #formato/:tId (mantida como fallback; o botão foi removido).
//
// Estado compartilhado S; handlers globais mutam S.cfg + normalizam + re-renderizam
// no mount atual (form container OU view-container).
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var S = null; // { mode:'form'|'page', mountEl, tId, t, sport, cfg }
  var _safe = function (s) { return (window._safeHtml || function (x) { return x; })(s == null ? '' : String(s)); };

  function _tid() { var h = (location.hash || '').replace(/^#/, '').split('/'); return h[1] || ''; }
  function _norm() { if (S) S.cfg = window.FORMAT2.normalize(S.cfg, S.sport); }
  function _rerender() {
    if (!S) return;
    if (S.mode === 'form') {
      var el = document.getElementById('f2-config-mount');
      if (el) el.innerHTML = _bodyControls();
    } else {
      var c = document.getElementById('view-container');
      if (c) window.renderFormatoPage(c);
    }
  }

  function _pill(active, onclick, label) {
    var on = 'border:2px solid #818cf8;background:rgba(99,102,241,0.22);color:#c7d2fe;';
    var off = 'border:2px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.05);color:var(--text-main);';
    return '<button type="button" onclick="' + onclick + '" style="padding:8px 14px;border-radius:10px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;margin:0 4px 4px 0;' + (active ? on : off) + '">' + label + '</button>';
  }
  function _sec(title, inner) {
    return '<div style="margin-bottom:16px;"><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:7px;">' + title + '</div>' + inner + '</div>';
  }
  function _num(val, min, max, onchange) {
    return '<input type="number" min="' + min + '" max="' + max + '" value="' + val + '" onchange="' + onchange + '" style="width:60px;text-align:center;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);">';
  }

  // ── Controles do configurador (compartilhados form+page) ──
  function _bodyControls() {
    var cfg = S.cfg, sport = S.sport;
    var allowsS = window.FORMAT2.allowsSingles(sport);
    var isDupla = cfg.disputa === 'dupla';
    var um = cfg.grupos === 1;
    var rotativo = isDupla && (cfg.parceria === 'rei_rainha' || cfg.parceria === 'sorteio_rodada');
    var scoreInd = cfg._scoreBy === 'individual';
    var h = '';

    if (allowsS) {
      h += _sec('Disputa', _pill(cfg.disputa === 'individual', 'window._f2Disputa(\'individual\')', '👤 Individual') + _pill(isDupla, 'window._f2Disputa(\'dupla\')', '👥 Duplas'));
    } else {
      h += _sec('Disputa', '<div style="font-size:0.85rem;color:var(--text-muted);">👥 Duplas <span style="opacity:0.7;">(' + _safe(sport) + ' é sempre em duplas)</span></div>');
    }

    var gLabel = um ? '1 grupo — <b>Pontos Corridos</b> (tabela única, classificação geral)' : (cfg.grupos + ' grupos — <b>Fase de Grupos</b> (classificação por grupo)');
    h += _sec('Estrutura — nº de grupos',
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<input type="range" min="1" max="16" value="' + cfg.grupos + '" oninput="window._f2Grupos(this.value)" style="flex:1;">' +
      '<span style="min-width:30px;text-align:center;font-weight:800;font-size:1.15rem;color:#c7d2fe;">' + cfg.grupos + '</span></div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">' + gLabel + '</div>');

    if (isDupla && um) {
      var pr = cfg.parceria;
      var prBtns = _pill(pr === 'fixa', 'window._f2Parceria(\'fixa\')', '🔒 Dupla fixa') +
        _pill(pr === 'rei_rainha', 'window._f2Parceria(\'rei_rainha\')', '👑 Rei/Rainha') +
        _pill(pr === 'sorteio_rodada', 'window._f2Parceria(\'sorteio_rodada\')', '🎲 Sorteio a cada rodada');
      var extra = '';
      if (pr === 'fixa') extra = '<div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Formação das duplas</div>' + _pill(cfg.formacaoDupla === 'sorteio', 'window._f2Form(\'sorteio\')', '🎲 Sorteio') + _pill(cfg.formacaoDupla === 'manual', 'window._f2Form(\'manual\')', '✍️ Manual');
      h += _sec('Parceria', prBtns + extra);
    } else if (isDupla && !um) {
      h += _sec('Parceria', '<div style="font-size:0.82rem;color:#34d399;">🔒 Duplas fixas <span style="color:var(--text-muted);">(sorteadas uma vez e fixas nos grupos)</span></div>');
    }

    if (um && !rotativo) {
      var modo = cfg.rodadas.modo;
      var rBtns = _pill(modo === 'todos', 'window._f2Modo(\'todos\')', '🔄 Todos contra todos');
      if (!isDupla) rBtns += _pill(modo === 'fixo', 'window._f2Modo(\'fixo\')', '#️⃣ Nº fixo de rodadas');
      var inner = rBtns;
      if (modo === 'todos') {
        inner += '<div style="margin-top:8px;">' + _pill(cfg.rodadas.turnos === 'ida', 'window._f2Turnos(\'ida\')', 'Ida') + _pill(cfg.rodadas.turnos === 'ida_volta', 'window._f2Turnos(\'ida_volta\')', 'Ida e volta') + '</div>';
      } else {
        inner += '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:0.85rem;">Rodadas ' + _num(cfg.rodadas.n, 1, 30, 'window._f2Rn(this.value)') + '</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Com rodadas insuficientes, os confrontos usam clusters (equilíbrio) e sit-out balanceado.</div>';
      }
      h += _sec('Rodadas', inner);
    } else if (um && rotativo) {
      h += _sec('Rodadas', '<div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;">Rodadas ' + _num(cfg.rodadas.n, 1, 30, 'window._f2Rn(this.value)') + '</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Sorteio a cada rodada — parceiro' + (cfg.parceria === 'rei_rainha' ? ' (grupos de 4)' : '') + ' e adversário sorteados; pontuação individual; sit-out balanceado.</div>');
    }

    var classLabel = um ? 'Nº de classificados (total) para a eliminatória' : 'Nº de classificados por grupo';
    h += _sec('Classificação', '<div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;flex-wrap:wrap;">' + classLabel + ' ' + _num(cfg.classificados, 1, 64, 'window._f2Class(this.value)') + '</div>');

    var e = cfg.eliminatoria;
    var elimForced = cfg.grupos > 1;
    var elimHead = elimForced
      ? '<div style="font-size:0.82rem;color:#34d399;">✅ Eliminatória (obrigatória em fase de grupos)</div>'
      : '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" ' + (e.ativa ? 'checked' : '') + ' onchange="window._f2Elim(this.checked)"> <span style="font-size:0.85rem;">Tem eliminatória no fim</span></label>';
    var eb = '';
    if (e.ativa) {
      eb += '<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Linhas (chaves paralelas — nomes livres)</div>';
      eb += [1, 2, 4].map(function (n) { return _pill(e.linhas === n, 'window._f2Linhas(' + n + ')', String(n)); }).join('');
      for (var i = 0; i < e.linhas; i++) {
        eb += '<div style="margin-top:6px;"><input type="text" value="' + _safe(e.nomes[i] || '') + '" placeholder="Nome da linha ' + (i + 1) + ' (opcional)" oninput="window._f2LineName(' + i + ',this.value)" style="width:100%;max-width:300px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-main);box-sizing:border-box;"></div>';
      }
      if (scoreInd && isDupla) {
        eb += '<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">Origem das duplas na eliminatória</div>';
        eb += _pill(e.origem === 'ja_formadas', 'window._f2Origem(\'ja_formadas\')', 'Já formadas') + _pill(e.origem === 'formar', 'window._f2Origem(\'formar\')', 'Formar da classificação');
        if (e.origem === 'formar') {
          eb += '<div style="margin-top:6px;">' + _pill(e.formacao === 'performance', 'window._f2Formacao(\'performance\')', '📈 Performance') + _pill(e.formacao === 'equilibrio', 'window._f2Formacao(\'equilibrio\')', '⚖️ Equilíbrio') + _pill(e.formacao === 'sorteio', 'window._f2Formacao(\'sorteio\')', '🎲 Sorteio') + '</div>';
        }
      } else if (isDupla) {
        eb += '<div style="margin-top:10px;font-size:0.78rem;color:#34d399;">🔒 As duplas já vêm formadas e seguem juntas.</div>';
      }
      eb += '<div style="margin-top:12px;"><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" ' + (e.terceiro ? 'checked' : '') + ' onchange="window._f2Terceiro(this.checked)"> <span style="font-size:0.85rem;">Disputa de 3º lugar</span></label></div>';
    }
    h += _sec('Eliminatória', elimHead + eb);

    h += '<div style="margin-top:4px;padding:11px 13px;border-radius:10px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);font-size:0.82rem;color:#a5b4fc;">📋 ' + _safe(window.FORMAT2.summary(cfg)) + '</div>';
    return h;
  }

  // ── Handlers globais (form + page) ──
  window._f2Disputa = function (v) { S.cfg.disputa = v; _norm(); _rerender(); };
  window._f2Grupos = function (v) { S.cfg.grupos = Math.max(1, parseInt(v, 10) || 1); _norm(); _rerender(); };
  window._f2Parceria = function (v) { S.cfg.parceria = v; _norm(); _rerender(); };
  window._f2Form = function (v) { S.cfg.formacaoDupla = v; _norm(); _rerender(); };
  window._f2Modo = function (v) { S.cfg.rodadas.modo = v; _norm(); _rerender(); };
  window._f2Turnos = function (v) { S.cfg.rodadas.turnos = v; _norm(); _rerender(); };
  window._f2Rn = function (v) { S.cfg.rodadas.n = Math.max(1, parseInt(v, 10) || 1); _norm(); _rerender(); };
  window._f2Class = function (v) { S.cfg.classificados = Math.max(1, parseInt(v, 10) || 1); _norm(); _rerender(); };
  window._f2Elim = function (b) { S.cfg.eliminatoria.ativa = !!b; _norm(); _rerender(); };
  window._f2Linhas = function (n) { S.cfg.eliminatoria.linhas = n; _norm(); _rerender(); };
  window._f2Origem = function (v) { S.cfg.eliminatoria.origem = v; _norm(); _rerender(); };
  window._f2Formacao = function (v) { S.cfg.eliminatoria.formacao = v; _norm(); _rerender(); };
  window._f2Terceiro = function (b) { S.cfg.eliminatoria.terceiro = !!b; _norm(); };
  window._f2LineName = function (i, v) { if (S && S.cfg.eliminatoria.nomes) S.cfg.eliminatoria.nomes[i] = v; };

  // ── MODO FORM: monta os controles dentro do #fase1-box do editar/criar. ──
  // sport: modalidade; initialCfg: config existente (t.fmt2) ou null (default do esporte).
  window._f2MountInForm = function (container, sport, initialCfg) {
    sport = sport || 'Beach Tennis';
    var cfg = (initialCfg && typeof initialCfg === 'object') ? window.FORMAT2.normalize(initialCfg, sport) : window.FORMAT2.defaultConfig(sport);
    S = { mode: 'form', mountEl: container, sport: sport, cfg: cfg };
    if (container) container.innerHTML = _bodyControls();
  };
  // Config atual (pro save do form). null se não montado em modo form.
  window._f2GetConfig = function () { return (S && S.mode === 'form') ? window.FORMAT2.normalize(S.cfg, S.sport) : null; };
  // Atualiza a modalidade sem perder a config (quando o form troca o esporte).
  window._f2SetSport = function (sport) { if (S) { S.sport = sport || S.sport; _norm(); _rerender(); } };

  // ── MODO PAGE (legado): página #formato/:tId ──
  window.renderFormatoPage = function (container) {
    var tId = _tid();
    var lookup = window._findTournamentById || function () { return null; };
    var t = lookup(tId);
    var hdr = window._renderBackHeader({ href: '#tournaments/' + tId, label: 'Voltar', middleHtml: '<b>Formato do torneio</b>' });
    if (!t) { container.innerHTML = hdr + '<div style="padding:24px;text-align:center;color:var(--text-muted);">Torneio não encontrado. Abra logado, pelo app.</div>'; return; }
    var sport = t.sport || 'Beach Tennis';
    if (!S || S.mode !== 'page' || S.tId !== tId) {
      var init = (t.fmt2 && typeof t.fmt2 === 'object') ? window.FORMAT2.normalize(t.fmt2, sport) : window.FORMAT2.defaultConfig(sport);
      S = { mode: 'page', tId: tId, t: t, sport: sport, cfg: init };
    } else { S.t = t; }
    container.innerHTML = hdr + '<div style="max-width:720px;margin:0 auto;padding:14px 16px 44px;">' + _bodyControls() +
      '<button type="button" onclick="window._f2ApplyPage()" style="margin-top:16px;width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:0.95rem;font-weight:700;cursor:pointer;">Aplicar formato ao torneio</button></div>';
  };
  window._f2ApplyPage = function () {
    var t = S.t;
    var out = window.FORMAT2.compileToPhases(S.cfg, { sport: S.sport, resultEntry: t.resultEntry || ['organizer'] });
    Object.assign(t, out.topLevel);
    t.phases = out.phases; t.fmt2 = S.cfg;
    if (t.format === 'Fase de Grupos') { t.ligaRoundFormat = 'standard'; t.ligaDrawMode = 'standard'; }
    t.currentPhaseIndex = 0; t.currentStage = null;
    t.matches = []; t.rounds = []; t.groups = []; t.standings = []; t.thirdPlaceMatch = null;
    t.updatedAt = new Date().toISOString();
    var done = function () { if (window.showNotification) showNotification('Formato aplicado', window.FORMAT2.summary(S.cfg), 'success'); location.hash = '#tournaments/' + S.tId; };
    try { var p = (window.FirestoreDB && window.FirestoreDB.saveTournament) ? window.FirestoreDB.saveTournament(t) : null; if (p && p.then) p.then(done).catch(function (e) { if (window.showNotification) showNotification('Erro ao salvar', String((e && e.message) || e), 'error'); }); else done(); }
    catch (e) { if (window.showNotification) showNotification('Erro ao salvar', String((e && e.message) || e), 'error'); }
  };
})();
