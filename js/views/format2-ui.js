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
  function _syncTeamSize() {
    if (!S) return;
    var ts = document.getElementById('tourn-team-size');
    if (ts) ts.value = window.FORMAT2.teamSizeFor(S.cfg.disputa); // mantém o form (estimativa/categorias) coerente
  }
  function _rerender() {
    if (!S) return;
    if (S.mode === 'form') {
      _syncTeamSize();
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

  // Conta PESSOAS inscritas (dupla-entry = 2; senão 1). project_count_people_not_entries.
  function _peopleCount(t) {
    var ps = (t && t.participants) || [];
    var n = 0;
    ps.forEach(function (p) {
      if (!p) return;
      if (p.p2Name || (Array.isArray(p.participants) && p.participants.length > 1)) n += 2;
      else n += 1;
    });
    return n;
  }
  // Estimativa (pessoas por grupo + tempo) baseada nos inscritos + slider + config.
  function _estimateBlock(cfg) {
    var t = S && S.t;
    var people = _peopleCount(t);
    if (!people) return '<div style="margin-top:6px;font-size:0.72rem;color:var(--text-muted);">Sem inscritos ainda — a previsão aparece quando houver gente inscrita.</div>';
    var isDupla = cfg.disputa === 'dupla';
    var units = isDupla ? Math.floor(people / 2) : people;
    if (units < 1) return '';
    var ng = Math.min(cfg.grupos, units);
    var base = Math.floor(units / ng), rem = units % ng, small = base, big = base + (rem > 0 ? 1 : 0);
    var puUnits = (rem === 0) ? String(base) : (small + '–' + big);
    var puPeople = isDupla ? ((rem === 0) ? String(base * 2) : (small * 2 + '–' + big * 2)) : puUnits;
    var groupGames = 0;
    for (var g = 0; g < ng; g++) { var u = base + (g < rem ? 1 : 0); groupGames += u * (u - 1) / 2; }
    var elimGames = 0;
    if (cfg.eliminatoria.ativa) {
      var q = (cfg.grupos > 1) ? cfg.grupos * cfg.classificados : cfg.classificados;
      q = Math.min(q, units);
      if (q >= 2) elimGames = (q - 1) + (cfg.eliminatoria.terceiro ? 1 : 0);
    }
    var gd = parseInt((document.getElementById('tourn-game-duration') || {}).value, 10) || (t && t.gameDuration) || 30;
    var cc = parseInt((document.getElementById('tourn-court-count') || {}).value, 10) || (t && t.courtCount) || 1;
    var totalGames = Math.round(groupGames + elimGames);
    var mins = Math.ceil(totalGames * gd / Math.max(1, cc));
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var timeStr = hh > 0 ? (hh + 'h' + (mm ? ' ' + mm + 'min' : '')) : (mm + 'min');
    return '<div style="margin-top:8px;font-size:0.78rem;color:#a5b4fc;background:rgba(99,102,241,0.08);border-radius:8px;padding:9px 11px;line-height:1.55;">' +
      '👥 <b>' + people + '</b> inscritos' + (isDupla ? (' → <b>' + units + '</b> duplas') : '') +
      ' · <b>' + puPeople + '</b> pessoas por grupo' + (isDupla ? (' <span style="opacity:0.8;">(' + puUnits + ' duplas)</span>') : '') +
      '<br>⏱️ ~<b>' + timeStr + '</b> de jogos <span style="opacity:0.8;">(' + totalGames + ' jogos · ' + gd + 'min · ' + cc + ' quadra' + (cc > 1 ? 's' : '') + ')</span></div>';
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
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">' + gLabel + '</div>' +
      _estimateBlock(cfg));

    // Formação das duplas fixas: Sorteio × Manual (participantes/organizador montam).
    var _formacao = '<div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Como as duplas são formadas</div>' +
      _pill(cfg.formacaoDupla === 'sorteio', 'window._f2Form(\'sorteio\')', '🎲 Sorteadas') +
      _pill(cfg.formacaoDupla === 'manual', 'window._f2Form(\'manual\')', '✍️ Montadas (participantes/organizador)');
    if (isDupla && um) {
      var pr = cfg.parceria;
      var prBtns = _pill(pr === 'fixa', 'window._f2Parceria(\'fixa\')', '🔒 Dupla fixa') +
        _pill(pr === 'rei_rainha', 'window._f2Parceria(\'rei_rainha\')', '👑 Rei/Rainha') +
        _pill(pr === 'sorteio_rodada', 'window._f2Parceria(\'sorteio_rodada\')', '🎲 Sorteio a cada rodada');
      h += _sec('Parceria', prBtns + (pr === 'fixa' ? _formacao : ''));
    } else if (isDupla && !um) {
      // Fase de grupos: sempre duplas fixas — mas o organizador escolhe como formá-las.
      h += _sec('Parceria', '<div style="font-size:0.82rem;color:#34d399;margin-bottom:2px;">🔒 Duplas fixas <span style="color:var(--text-muted);">(formadas uma vez e fixas nos grupos)</span></div>' + _formacao);
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
    // Fase de grupos sempre tem eliminatória → sem toggle, vai direto aos controles.
    // Pontos corridos (1 grupo) → toggle liga/desliga.
    var elimHead = elimForced
      ? ''
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
  window._f2MountInForm = function (container, sport, initialCfg, tournament) {
    sport = sport || 'Beach Tennis';
    var cfg = (initialCfg && typeof initialCfg === 'object') ? window.FORMAT2.normalize(initialCfg, sport) : window.FORMAT2.defaultConfig(sport);
    S = { mode: 'form', mountEl: container, sport: sport, cfg: cfg, t: tournament || null };
    _syncTeamSize();
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
