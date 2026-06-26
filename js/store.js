window.SCOREPLACE_VERSION = '3.1.20-beta';

// v2.8.82: preservação de scroll em re-renders por AÇÃO. Chamado no início das
// funções de render (renderTournaments/renderParticipants/renderBracket). Captura
// o scroll atual e o restaura depois do innerHTML (que pode zerar o scroll),
// fazendo o re-render "parecer que nada aconteceu". DURANTE a navegação do router
// (window._inRouterRender) NÃO faz nada — lá o router já cuida (scrollTo(0,0) em
// navegação nova, ou preserva em soft-refresh; scroll intencional pra um jogo via
// _goToTournamentMatch também roda fora daqui).
window._autoKeepScroll = function() {
  if (window._inRouterRender) return;
  var y = window.pageYOffset || window.scrollY || 0;
  if (!y) return; // já no topo: nada a restaurar
  var restore = function() { try { window.scrollTo(0, y); } catch (e) {} };
  try { requestAnimationFrame(restore); } catch (e) {}
  try { setTimeout(restore, 0); } catch (e) {}
};

// Rótulo de EXIBIÇÃO do formato — mantém o valor canônico de t.format intocado
// (compat de dados + lógica que compara t.format === 'Liga' etc.). Só muda o texto
// mostrado ao usuário. 'Liga'/'Ranking' → 'Pontos Corridos';
// 'Fase de Grupos + Eliminatórias' → 'Fase de Grupos'.
window._formatDisplayName = function (fmt) {
  if (fmt === 'Liga' || fmt === 'Ranking') return 'Pontos Corridos';
  if (fmt === 'Fase de Grupos + Eliminatórias') return 'Fase de Grupos';
  return fmt;
};

// ─── Tempo mínimo de splash imposto pela camada JS FRESCA ────────────────────
// v2.4.89: a v2.4.88 colocou o piso de tempo no boot loader INLINE (index.html).
// Mas o index.html fica em cache no PWA (iOS) — o JS atualiza (network-first),
// o shell HTML não. Resultado: o usuário roda JS novo dentro de um shell antigo,
// e o boot loader antigo escondia a tela cedo demais. Por isso "continua rápido".
// Solução: gatear _bootReady AQUI (store.js é network-first → sempre fresco).
// TODOS os caminhos que liberam a tela chamam _markBootReady(min): só seta
// _bootReady=true depois de `min` ms desde o open do app. Assim, mesmo com o
// shell velho em cache, a tela inicial respeita o tempo mínimo.
window.__bootT0 = window.__bootT0 || Date.now();
window._BOOT_MIN_MS = 3500;
window._markBootReady = function(minMs, _label) {
  if (window._bootReady === true) return;
  if (typeof minMs !== 'number') minMs = window._BOOT_MIN_MS;
  var _el = Date.now() - (window.__bootT0 || Date.now());
  if (_el < minMs) { setTimeout(function() { window._markBootReady(minMs, _label); }, minMs - _el); return; }
  // Diagnóstico: registra QUEM revelou e em quanto tempo (útil pra confirmar que
  // o splash está segurando o tempo certo, inclusive no aparelho do usuário).
  window._bootRevealInfo = { minMs: minMs, elapsedMs: Math.round(_el), label: _label || '?' };
  window._bootReady = true;
};

// v2.4.90: SPLASH controlado pela camada JS (store.js é network-first → sempre
// fresco). O boot loader INLINE vive no index.html, que o PWA iOS guarda em
// cache — e shells antigos escondiam a tela no `window.load`, IGNORANDO o
// _bootReady. Por isso o piso de tempo (v2.4.88/89) "continuava rápido": o
// splash velho sumia sozinho. Aqui criamos um overlay PRÓPRIO, idêntico, que
// fica por cima e só sai quando _bootReady (que respeita o tempo mínimo).
// Funciona mesmo com o esqueleto da página velho em cache, sem reinstalar.
window._ensureBootOverlay = function() {
  try {
    if (window._bootReady === true) return;
    // v2.4.95: o overlay JS é só FALLBACK. Se o boot loader inline do shell está
    // presente (caso normal — agora ele sobrevive ao sweep), ELE é o splash, com
    // a barra de progresso. Não criamos um segundo overlay por cima (que escondia
    // a barra e mostrava só "Carregando…"). Só entra se o inline sumiu.
    if (document.getElementById('scoreplace-boot-loader')) return;
    if (document.getElementById('sp-js-boot-overlay')) return;
    var host = document.body || document.documentElement;
    if (!host) { setTimeout(window._ensureBootOverlay, 30); return; }
    if (!document.getElementById('scoreplace-ball-keyframes')) {
      var st = document.createElement('style');
      st.id = 'scoreplace-ball-keyframes';
      st.textContent = '@keyframes scoreplace-ball-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes scoreplace-ball-pulse{0%,100%{filter:drop-shadow(0 0 0 transparent)}50%{filter:drop-shadow(0 0 12px rgba(212,244,60,0.6))}}';
      (document.head || host).appendChild(st);
    }
    var ballSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%"><defs><radialGradient id="spjbball" cx="37%" cy="31%" r="80%"><stop offset="0" stop-color="#EFEA57"/><stop offset="46%" stop-color="#D2E000"/><stop offset="86%" stop-color="#A6C614"/><stop offset="100%" stop-color="#8CA811"/></radialGradient><clipPath id="spjbclip"><circle cx="24" cy="24" r="22"/></clipPath></defs><circle cx="24" cy="24" r="22" fill="url(#spjbball)"/><g clip-path="url(#spjbclip)"><path d="M24,-3 C58,18 -10,30 24,51" fill="none" stroke="#7a9410" stroke-width="3.4" opacity="0.4"/><path d="M24,-3 C58,18 -10,30 24,51" fill="none" stroke="#fff" stroke-width="2.6" opacity="0.97"/></g></svg>';
    var ov = document.createElement('div');
    ov.id = 'sp-js-boot-overlay';
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-label', 'Carregando scoreplace.app');
    ov.style.cssText = 'position:fixed;inset:0;background:#0f172a;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:100000;transition:opacity .35s ease;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    ov.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;" aria-hidden="true">' +
        '<svg width="40" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="13" width="5" height="7" rx="1" fill="#CBD5E1"/><rect x="9.5" y="8" width="5" height="12" rx="1" fill="#F59E0B"/><rect x="16" y="15" width="5" height="5" rx="1" fill="#FB923C"/><path d="M 12 4.4 L 12.5 5.8 L 13.9 5.8 L 12.8 6.7 L 13.2 8 L 12 7.2 L 10.8 8 L 11.2 6.7 L 10.1 5.8 L 11.5 5.8 Z" fill="#F59E0B"/></svg>' +
        '<span style="font-size:1.2rem;font-weight:800;letter-spacing:.3px;">scoreplace<span style="color:#fbbf24">.app</span></span>' +
      '</div>' +
      '<div aria-hidden="true" style="width:3rem;height:3rem;display:inline-block;line-height:1;animation:scoreplace-ball-spin 1.2s linear infinite;">' + ballSvg + '</div>' +
      '<div style="font-size:.78rem;color:#64748b;">Carregando…</div>';
    host.appendChild(ov);
    var _tick = function() {
      if (window._bootReady === true) {
        ov.style.opacity = '0';
        setTimeout(function() { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 380);
        return;
      }
      setTimeout(_tick, 80);
    };
    _tick();
  } catch (e) {}
};
window._ensureBootOverlay();

// v2.4.93: TETO GLOBAL de splash. Garante que a tela inicial nunca passa de
// ~4,5s desde o open do app, qualquer que seja o caminho (mesmo dados lentos,
// _finalizeBootReady atrasado, etc.). Os caminhos mais rápidos (router=1,5s,
// dash-poller=3,5s) revelam antes quando aplicáveis; este é só o limite.
window._markBootReady(4500, 'global-cap');

// ─── Plataforma de execução + Feature Flags ──────────────────────────────────
// Trilho pra "mudar com segurança enquanto sempre no ar": uma mudança arriscada
// entra LIGADA só pras identidades de teste (testar no escuro em produção real),
// depois abre pra todos. Sem flag definida em SP_FLAGS → _flag() sempre false →
// ZERO mudança de comportamento. É inerte por padrão de propósito.
//
// Plataforma: 'web' hoje. O build nativo (Capacitor) sobrescreve pra 'ios'/
// 'android' ANTES deste script carregar. Seam pra gates específicos de plataforma
// (ex: esconder a venda do Pro no iOS → modelo "reader app" web-only / IAP).
window.SCOREPLACE_PLATFORM = window.SCOREPLACE_PLATFORM || 'web';

// Identidades de teste/dev — recebem flags `test:true` antes de todo mundo.
// Aceita e-mail (minúsculo) OU uid.
window.SP_TEST_IDENTITIES = [
  // SÓ as 3 contas de teste DO DONO (recebem recursos test:true em desenvolvimento).
  // NUNCA incluir usuários reais aqui (Kelly/Zilda eram reais — removidas em v2.4.53).
  'rstbarth@gmail.com',         'B17n7JCXYOfqahlcLZ0fKxGGyUu1', // Rodrigo Barth
  'rstbarth@hotmail.com',                                       // Rodrigo Teste
  'nelsonterrabarth@gmail.com', '9r1I1brrTecENuQKXYWpAqTmBbQ2'  // Nelson
];

// Catálogo de flags. Cada chave controla se uma mudança arriscada está LIGADA
// pro usuário atual. Opções por flag (precedência de cima pra baixo):
//   on: true            → liga pra TODO MUNDO (rollout completo)
//   platforms: ['ios']  → liga só nessa(s) plataforma(s)
//   test: true          → liga só pras SP_TEST_IDENTITIES (teste no escuro)
// Override manual por dispositivo (DevTools), vence tudo:
//   localStorage.setItem('spflag_<nome>', '1'|'0')
window.SP_FLAGS = {
  // 'safe-area': { test: true },   // ex: testar notch só pras contas de teste
  // 'pro-iap':   { platforms: ['ios'] },
  'playoff-double-elim': { test: true },  // Dupla Eliminatória na fase final de Liga (em construção)
  'playoff-divisions': { test: true },    // Divisões Ouro/Prata na fase final de Liga (em construção)
  'playoff-time-estimate': { test: true },// Estimativa de tempo na config do playoff (verificar e liberar p/ todos)
};

// Usuário atual é uma identidade de teste/dev?
window._isTestIdentity = function () {
  try {
    var cu = (window.AppStore && window.AppStore.currentUser) || null;
    if (!cu) return false;
    var list = window.SP_TEST_IDENTITIES || [];
    var email = String(cu.email || '').toLowerCase();
    var uid = String(cu.uid || '').toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] || '').toLowerCase();
      if (id && (id === email || id === uid)) return true;
    }
    return false;
  } catch (e) { return false; }
};

// Flag ligada pro usuário atual? Use em qualquer gate:
//   if (window._flag('safe-area')) { ...novo caminho... } else { ...atual... }
window._flag = function (name) {
  try {
    var def = (window.SP_FLAGS && window.SP_FLAGS[name]) || null;
    if (!def) return false;
    var ls = null;
    try { ls = localStorage.getItem('spflag_' + name); } catch (e) {}
    if (ls === '1') return true;
    if (ls === '0') return false;
    if (def.on === true) return true;
    if (Array.isArray(def.platforms) && def.platforms.indexOf(window.SCOREPLACE_PLATFORM) !== -1) return true;
    if (def.test === true && window._isTestIdentity()) return true;
    return false;
  } catch (e) { return false; }
};

// ─── Selo STAGING (só no ambiente de teste) ──────────────────────────────────
// Badge fixo e inconfundível pra NUNCA confundir staging com produção: evita
// fazer teste destrutivo achando que está no staging (ou entrar em pânico
// achando que quebrou o Confra quando está só no staging). Só aparece quando o
// host é o de staging — INVISÍVEL na produção. pointer-events:none = não bloqueia
// clique. Detecta por hostname (auto-suficiente, sem depender de timing).
(function () {
  try {
    if (!/scoreplace-staging/.test(window.location.hostname || '')) return;
    var inject = function () {
      if (document.getElementById('sp-staging-badge')) return;
      var b = document.createElement('div');
      b.id = 'sp-staging-badge';
      b.textContent = 'STAGING';
      b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;' +
        'background:#b91c1c;color:#fff;font:700 11px/1 -apple-system,BlinkMacSystemFont,sans-serif;' +
        'letter-spacing:1.5px;padding:5px 9px;border-radius:6px;pointer-events:none;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.45);opacity:0.92;';
      (document.body || document.documentElement).appendChild(b);
    };
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  } catch (e) {}
})();

// ─── Botão W.O. PADRONIZADO em todo o app ─────────────────────────────────────
// Declarar W.O. (faltou alguém) = botão VERMELHO SÓLIDO + fonte branca + volume
// (classe padrão .btn .btn-danger). Reverter = outline azul (ação de desfazer).
// onclick: a string JS do handler (sem aspas duplas). isDeclare: true=W.O.(vermelho),
// false=Reverter(outline). opts: {label, title, size('btn-sm'|'btn-micro'), fontSize}.
window._woBtnHtml = function (onclick, isDeclare, opts) {
  opts = opts || {};
  var size = opts.size || 'btn-sm';
  var title = opts.title ? (' title="' + String(opts.title).replace(/"/g, '&quot;') + '"') : '';
  var base = 'font-size:' + (opts.fontSize || '0.72rem') + ';padding:3px 11px;' + (opts.extraStyle || '');
  if (isDeclare) {
    return '<button type="button" class="btn btn-danger ' + size + '" onclick="' + onclick + '"' + title +
      ' style="' + base + '">' + (opts.label || 'W.O.') + '</button>';
  }
  return '<button type="button" class="btn btn-outline ' + size + '" onclick="' + onclick + '"' + title +
    ' style="' + base + 'color:#60a5fa;border-color:rgba(59,130,246,0.5);">' + (opts.label || '↩️ Reverter') + '</button>';
};

// ─── Trava de reversão de W.O. depois que o jogo aconteceu ────────────────────
// Retorna true quando a partida JÁ foi jogada de verdade: placar lançado, sets
// lançados, placar ao vivo aberto/usado, ou jogo iniciado. Regra do produto:
// depois que o jogo rolou (ou começou ao vivo), o W.O. não pode mais ser
// revertido — reverter zeraria um resultado real. O marcador PURO de W.O.
// (scoreP1/P2 = 'W.O.'/0, sem startedAt/resultAt/liveScored) NÃO conta como
// jogado, então o W.O. recém-declarado segue reversível.
window._matchHasRealPlay = function (m) {
  if (!m || typeof m !== 'object') return false;
  if (m.liveScored === true) return true;                          // placar ao vivo finalizado
  if (m.startedAt) return true;                                    // jogo iniciado (placar ao vivo aberto)
  if (m.resultAt) return true;                                     // resultado real registrado
  if (Array.isArray(m.sets) && m.sets.length > 0) return true;     // sets lançados
  // Placar numérico real (> 0) lançado por jogo de verdade — exclui o W.O. puro.
  var _num = function (v) { return typeof v === 'number' && v > 0; };
  if ((_num(m.scoreP1) || _num(m.scoreP2)) && !m.wo) return true;
  return false;
};

// ─── v2.3.85: Linha direta com o desenvolvedor (barthlabs) via WhatsApp ───────
window.SCOREPLACE_DEV_WHATSAPP = '5511916936454'; // +55 11 91693-6454
window._devWhatsAppTip = 'Clique aqui para a sua Linha direta com o desenvolvedor do scoreplace.app. ' +
  'Tem dúvida, crítica ou sugestão? Achou algo que não funcionou como esperava? ' +
  'Precisa de ajuda com algo com relação ao app? Por favor fale conosco! ' +
  'Estamos em versão beta — queremos ouvi-lo!';
window._openDevWhatsApp = function () {
  var msg = encodeURIComponent('Olá! Sou usuário do scoreplace.app e gostaria de falar com o desenvolvedor.');
  try { window.open('https://wa.me/' + window.SCOREPLACE_DEV_WHATSAPP + '?text=' + msg, '_blank', 'noopener'); } catch (e) {}
};
// HTML do botão verde "Fale com o Desenvolvedor" (reusado no dashboard e no
// torneio). opts.extra = estilos extras; opts.height/padding/font ajustáveis.
window._devWhatsAppBtnHtml = function (opts) {
  opts = opts || {};
  var tip = (window._devWhatsAppTip || 'Fale com o desenvolvedor').replace(/"/g, '&quot;');
  var wa = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true" style="flex-shrink:0;"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 10.37c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg>';
  // opts.twoLine = rótulo em 2 linhas ("Fale com o" / "Desenvolvedor") pra um
  // botão mais estreito.
  var label = opts.twoLine
    ? '<span style="display:flex;flex-direction:column;line-height:1.08;text-align:left;white-space:nowrap;"><span>Fale com o</span><span>Desenvolvedor</span></span>'
    : '<span>Fale com o Desenvolvedor</span>';
  return '<button onclick="event.stopPropagation();window._openDevWhatsApp()" title="' + tip + '" aria-label="Fale com o Desenvolvedor" ' +
    'style="background:#25d366;color:#fff;border:none;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:' + (opts.radius || '12px') + ';' + (opts.extra || '') + '">' +
    wa + label + '</button>';
};

// ─── v2.1.43: sentinela de pico de leituras Firestore (reporta ao Sentry) ─────
// Conta leituras (snap.size) numa janela deslizante de 10s. Quando a taxa passa
// do limite, manda UMA mensagem ao Sentry (throttle 60s) com a taxa, as fontes
// que mais leem e a rota. Complementa o alerta do Cloud Monitoring (>10/s) — dá
// visibilidade no digest diário do Sentry de QUANDO/ONDE os picos acontecem.
(function() {
  var _reads = [];        // [{t, n, label}]
  var _lastReport = 0;
  var WINDOW_MS = 10000;
  // v2.8.39: 15→25/s. O limiar antigo (150 reads/10s) disparava no COLD-LOAD
  // legítimo de torneio grande (ex.: Confra ~84 inscritos → autofix-uid≈98 +
  // rt-snap/discovery ≈50 = ~150), caminho JÁ cacheado (≈0 após o 1º load da
  // sessão) e batched (`in`, 10/query). Era o ruído #1 do Sentry. 25/s (250/10s)
  // ignora o burst único de abertura, mas ainda pega loop descontrolado — que é
  // SUSTENTADO e muito maior (milhares), não um pico único que cai sozinho.
  var RATE_THRESHOLD = 25; // leituras/s no cliente (acima do alerta GCP de 10/s)
  window._noteFsReads = function(n, label) {
    try {
      n = parseInt(n, 10) || 0;
      if (n <= 0) return;
      var now = Date.now();
      _reads.push({ t: now, n: n, label: label || 'read' });
      var cutoff = now - WINDOW_MS;
      while (_reads.length && _reads[0].t < cutoff) _reads.shift();
      var total = 0, byLabel = {};
      for (var i = 0; i < _reads.length; i++) { total += _reads[i].n; byLabel[_reads[i].label] = (byLabel[_reads[i].label] || 0) + _reads[i].n; }
      var rate = total / (WINDOW_MS / 1000);
      if (rate >= RATE_THRESHOLD && (now - _lastReport) > 60000) {
        _lastReport = now;
        var tops = Object.keys(byLabel).sort(function(a, b) { return byLabel[b] - byLabel[a]; }).slice(0, 5).map(function(k) { return k + '=' + byLabel[k]; }).join(', ');
        var msg = 'Firestore read spike (client): ~' + rate.toFixed(1) + '/s em 10s (' + total + ' reads) — ' + tops + ' · rota=' + (window.location.hash || '');
        if (typeof window._captureMessage === 'function') window._captureMessage(msg, 'warning');
        if (typeof window._warn === 'function') window._warn('[FSReadSpike]', msg);
      }
    } catch (e) {}
  };
})();

// ─── One-time beta cleanup ─────────────────────────────────────────────────
// v1.0.0-beta: Firestore foi zerado na transição alpha→beta. MAS caches
// locais (localStorage) sobrevivem ao reset server-side. Stats casuais por
// exemplo moram em scoreplace_casual_history_v2 e o player-stats modal
// MERGE local + Firestore — então mesmo com Firestore vazio, stats antigas
// apareciam. Cleanup roda 1 vez por browser via flag scoreplace_beta_cleanup_v1
// e apaga só caches de DADOS (não preferências de UI/idioma/tema).
(function () {
  try {
    if (localStorage.getItem('scoreplace_beta_cleanup_v1') === '1') return;
    var dataKeys = [
      // scoreplace_authCache REMOVIDO — v1.3.39-beta: nunca limpar o cache
      // de auth no cleanup. O único efeito de apagá-lo é fazer o router
      // renderizar a landing imediatamente na próxima visita se o iOS tiver
      // limpado o localStorage (cleanup re-roda sem o flag). Com authCache
      // ausente E Firebase ainda não resolvido (~200-500ms), o usuário vê
      // um flash da landing page antes de ser logado — que é exatamente o
      // bug que o usuário reportou. A sessão Firebase vive no IndexedDB e
      // não precisa do authCache para persistir.
      'scoreplace_casual_history',// stats casuais legacy v1
      'scoreplace_casual_history_v2', // stats casuais v2 (era esse o culpado)
      'scoreplace_casual_last',   // último casual restored
      'scoreplace_casual_prefs',  // prefs casual
      'scoreplace_deleted_ids',   // tombstones de ids deletados
      'scoreplace_analytics_open' // estado de details aberto
    ];
    dataKeys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (_e) {}
    });
    // v1.0.0-beta: A deleção do IndexedDB do Firebase Auth foi removida na
    // v1.3.38-beta. Causa de bug: em iOS Safari + ITP / PWA com limpeza
    // agressiva de storage, o localStorage é zerado periodicamente, o que
    // resetava a flag scoreplace_beta_cleanup_v1. Na próxima visita o cleanup
    // rodava de novo e deletava a sessão Firebase do usuário já logado —
    // forçando re-login em loop. A deleção era necessária apenas na transição
    // alpha→beta (2026-04-29); oito dias depois todos os usuários existentes
    // já passaram pelo re-login único. Novos usuários não têm sessão alpha
    // para limpar. Sem a deleção, mesmo que o cleanup rode novamente (por
    // perda do flag), o onAuthStateChanged ainda restaura a sessão do Firebase
    // via IndexedDB — não precisa de re-login.
    // Preferências preservadas: theme, lang, dashView, debug, emailForSignIn,
    // fcm_dismissed, gsm_prefs, loginPhoneCountry, sentry_dsn.
    localStorage.setItem('scoreplace_beta_cleanup_v1', '1');
    if (typeof console !== 'undefined' && window._log) {
      window._log('[scoreplace-beta] one-time cleanup done — ' + dataKeys.length + ' data keys cleared (Firebase IndexedDB preserved)');
    }
  } catch (e) {
    // localStorage pode estar indisponível em modo private; não bloqueia o boot
  }
})();

// ─── Auto-update: check if a newer version is deployed and force reload ────
// v2.4.14: antes rodava SÓ no load (1s). No PWA do iOS isso era o ponto cego:
// quando a pessoa volta pro app pelo app switcher (resume, sem reload real),
// o check nunca re-disparava e ela ficava presa numa versão antiga até fechar
// e reabrir o app na unha. Agora o check também roda em visibilitychange/
// pageshow/focus (eventos que o iOS PWA dispara no resume) e num intervalo,
// com throttle. O reload é GUARDADO: nunca interrompe placar ao vivo, partida
// casual, formulário de torneio ou digitação — nesses casos adia até ficar
// seguro (ou até o próximo resume).
(function() {
  // É seguro recarregar agora? (não interromper ação crítica do usuário)
  window._isSafeToReload = function() {
    try {
      if (document.querySelector('.modal-overlay.active')) return false;
      if (document.getElementById('live-scoring-overlay')) return false;
      if (document.getElementById('casual-match-overlay')) return false;
      var v = (window.location.hash || '').replace('#', '').split('/')[0];
      if (v === 'novo-torneio') return false;
      var a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return false;
    } catch (e) {}
    return true;
  };

  // v2.6.103: pílula visível "Nova versão — toque pra atualizar". Aparece sempre
  // que detectamos versão nova (mesmo quando o reload automático é adiado por ação
  // em andamento) — assim o usuário NUNCA precisa de DevTools/aba anônima: 1 toque
  // e atualiza na hora. O reload automático (quando seguro) continua valendo.
  window._showUpdatePill = function() {
    try {
      if (document.getElementById('sp-update-pill')) return;
      if (!document.body) return;
      var pill = document.createElement('button');
      pill.id = 'sp-update-pill';
      pill.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:100000;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;font-size:0.85rem;padding:11px 18px;border-radius:999px;box-shadow:0 6px 22px rgba(0,0,0,0.4);cursor:pointer;border:none;display:flex;align-items:center;gap:8px;animation:spUpPill 0.3s ease;';
      pill.innerHTML = '🔄 Nova versão — toque para atualizar';
      pill.onclick = function() { pill.innerHTML = '⏳ Atualizando…'; window._applyUpdate(true); };
      if (!document.getElementById('sp-update-pill-style')) {
        var st = document.createElement('style'); st.id = 'sp-update-pill-style';
        st.textContent = '@keyframes spUpPill{from{opacity:0;transform:translateX(-50%) translateY(12px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}';
        document.head.appendChild(st);
      }
      document.body.appendChild(pill);
    } catch (e) {}
  };

  // Aplica a atualização: nuke caches + unregister SW + reload. Se não for
  // seguro e force!=true, marca pendente e tenta de novo quando ficar seguro.
  window._applyUpdate = function(force) {
    if (!force && !window._isSafeToReload()) {
      window._pendingUpdateReload = true;
      window._log('[AutoUpdate] Nova versão pronta — aguardando momento seguro pra recarregar.');
      window._showUpdatePill(); // dá agência ao usuário: 1 toque atualiza já
      return;
    }
    window._pendingUpdateReload = false;
    var p1 = ('caches' in window) ? caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }) : Promise.resolve();
    var p2 = ('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistrations().then(function(regs) {
      return Promise.all(regs.map(function(r) { return r.unregister(); }));
    }) : Promise.resolve();
    // Marca o guard ANTES do reload pra o handler de controllerchange (index.html)
    // não disparar um segundo reload durante o churn de unregister/re-register.
    Promise.all([p1, p2]).then(function() { window._swReloading = true; window.location.reload(); });
  };

  // Busca store.js sem cache e compara a versão. Throttle de 60s salvo force.
  window._lastUpdateCheck = 0;
  window._checkForUpdate = function(opts) {
    opts = opts || {};
    var now = Date.now();
    // Se já detectamos uma versão nova antes mas adiamos, tenta aplicar agora.
    if (window._pendingUpdateReload) { window._applyUpdate(false); if (!opts.force) return; }
    if (!opts.force && (now - window._lastUpdateCheck) < 60000) return;
    window._lastUpdateCheck = now;
    fetch('/js/store.js?_t=' + now, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('fetch failed');
      return r.text();
    }).then(function(txt) {
      var m = txt.match(/SCOREPLACE_VERSION\s*=\s*'([^']+)'/);
      if (m && m[1] && m[1] !== window.SCOREPLACE_VERSION) {
        window._log('[AutoUpdate] New version:', m[1], '(running:', window.SCOREPLACE_VERSION + ').');
        window._showUpdatePill(); // mostra a pílula mesmo se o reload auto for adiado
        window._applyUpdate(!!opts.force);
      }
    }).catch(function() {});
  };

  // 1. No load inicial: força (nada que o usuário tenha digitado ainda).
  setTimeout(function() { window._checkForUpdate({ force: true }); }, 1000);

  // 2. Resume do PWA / volta de aba (iOS PWA dispara visibilitychange + pageshow
  //    ao voltar do app switcher). Aqui NÃO força — respeita ação em andamento.
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') window._checkForUpdate({});
  });
  window.addEventListener('pageshow', function() { window._checkForUpdate({}); });
  window.addEventListener('focus', function() { window._checkForUpdate({}); });

  // 3. Periódico enquanto o app está aberto (timer pausa em background no iOS,
  //    mas cobre sessões longas em desktop/Android).
  setInterval(function() { window._checkForUpdate({}); }, 600000);
})();

// ─── Live countdown ticker ─────────────────────────────────────────────────
// Updates all elements with data-countdown-target every second
window._formatCountdown = function(diff) {
  if (diff <= 0) return '0s';
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm ' + s + 's';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
};
setInterval(function() {
  var now = Date.now();
  var els = document.querySelectorAll('[data-countdown-target]');
  els.forEach(function(el) {
    var target = parseInt(el.getAttribute('data-countdown-target'));
    if (isNaN(target)) return;
    var diff = target - now;
    el.textContent = diff > 0 ? window._formatCountdown(diff) : 'Agora!';
  });
  var els2 = document.querySelectorAll('[data-elapsed-since]');
  els2.forEach(function(el) {
    var since = parseInt(el.getAttribute('data-elapsed-since'));
    if (isNaN(since)) return;
    var diff = now - since;
    el.textContent = diff > 0 ? window._formatCountdown(diff) : '0s';
  });
  // v1.6.66-beta: auto-expirar prazo de inscrição no card do dashboard sem
  // precisar de refresh. Quando o prazo chega, atualiza o badge de status,
  // oculta o botão de inscrição e persiste status:'closed' no Firestore.
  var els3 = document.querySelectorAll('[data-regdeadline-ts]');
  els3.forEach(function(el) {
    var ts = parseInt(el.getAttribute('data-regdeadline-ts'));
    if (isNaN(ts) || ts > now) return;
    var tId = el.getAttribute('data-regdeadline-tid');
    // Atualiza badge de status
    var closedText = typeof window._t === 'function' ? window._t('status.closed') : 'Inscrições Encerradas';
    el.textContent = closedText;
    el.style.color = '#fca5a5';
    el.style.background = 'rgba(0,0,0,0.3)';
    el.style.fontWeight = '600';
    el.removeAttribute('data-regdeadline-ts');
    el.removeAttribute('data-regdeadline-tid');
    // Oculta botão de inscrição
    if (tId) {
      var enrollEl = document.getElementById('dash-enrollbtn-' + tId);
      if (enrollEl) enrollEl.style.display = 'none';
    }
    // Persiste status:'closed' no Firestore usando o objeto completo do
    // AppStore — salvar objeto parcial limparia memberEmails/adminEmails e
    // bloquearia futuras gravações via regras de segurança do Firestore.
    if (tId && window.AppStore && window.FirestoreDB) {
      var _appT = window.AppStore.tournaments && window.AppStore.tournaments.find(function(x) {
        return String(x.id) === String(tId);
      });
      if (_appT) {
        _appT.status = 'closed';
        if (typeof window.FirestoreDB.saveTournament === 'function') {
          window.FirestoreDB.saveTournament(_appT).catch(function() {});
        }
      } else if (window.FirestoreDB.db) {
        // Fallback: update cirúrgico — não toca em memberEmails/adminEmails
        window.FirestoreDB.db.collection('tournaments').doc(String(tId))
          .update({ status: 'closed' }).catch(function() {});
      }
    }
  });
}, 1000);

// ─── Soft refresh: re-render current view without disrupting UX ────────────
// Called by real-time Firestore listener when remote data changes.
// Preserves: scroll position, open modals, focus state, form inputs.
window._softRefreshView = function() {
  // 0. If bracket just re-rendered locally, skip to avoid double-render + scroll jump
  if (window._suppressSoftRefresh) return;

  // 0b. #novo-torneio is stateful — renderCreateTournamentPage moves DOM from
  // body into viewContainer. A soft-refresh calls initRouter() which does
  // viewContainer.innerHTML='' destroying that moved DOM, causing the page to
  // close/redirect. Block entirely; user exits intentionally via Voltar/Salvar.
  var _currentView = (window.location.hash || '').replace('#', '').split('/')[0];
  if (_currentView === 'novo-torneio') return;
  // v2.8.23/60: a DASHBOARD não faz soft-refresh a cada snapshot (rebuild constante do
  // innerHTML = "travada no scroll"). MAS quando o CONJUNTO de torneios muda de verdade
  // (dados que chegaram async do listener — torneios que "não apareciam até navegar"),
  // re-renderiza UMA vez preservando scroll. Gate por assinatura (ids + count) evita o
  // re-render constante; só dispara quando o conteúdo realmente mudou.
  if (_currentView === '' || _currentView === 'dashboard') {
    try {
      var _dts = (window.AppStore && window.AppStore.tournaments) || [];
      var _dsig = _dts.length + '|' + _dts.map(function(t){ return t && t.id; }).join(',');
      if (_dsig !== window._dashDataSig) {
        window._dashDataSig = _dsig;
        if (typeof window._dashRerender === 'function') window._dashRerender();
      }
    } catch (e) {}
    return;
  }

  // 1. If any modal is open or user is typing, defer — retry in 500ms
  // v1.0.62-beta: simulation-panel adicionado ao safe-list. Bug reportado:
  // user clicou Suíço no painel de resolução de potência de 2 (40 inscritos
  // em torneio Eliminatório), painel de config de rodadas Suíço apareceu
  // mas sumiu — soft refresh derrubou. Mesma classe de bug da v0.15.89,
  // só que pra um overlay diferente. Também adicionei incomplete-teams-panel
  // que aparece em fluxos paralelos.
  var openModal = document.querySelector('.modal-overlay.active') ||
                  document.getElementById('qr-modal-overlay') ||
                  document.getElementById('player-stats-overlay') ||
                  // v3.0.x: era querySelector('.tv-overlay') — classe que NÃO existe;
                  // o elemento é id="tv-mode-overlay". Sem isto, um snapshot do Firestore
                  // disparava _softRefreshView → initRouter → _dismissAllOverlays e fechava
                  // o Modo TV sozinho (resultado lançado em outro device, poller da Liga).
                  document.getElementById('tv-mode-overlay') ||
                  document.getElementById('live-scoring-overlay') ||
                  document.getElementById('casual-match-overlay') ||
                  document.getElementById('unified-resolution-panel') ||
                  document.getElementById('groups-config-panel') ||
                  document.getElementById('remainder-resolution-panel') ||
                  document.getElementById('phase-res-panel') ||
                  document.getElementById('vagas-draw-panel') ||
                  document.getElementById('removal-subchoice-panel') ||
                  document.getElementById('simulation-panel') ||
                  document.getElementById('incomplete-teams-panel') ||
                  document.getElementById('flyer-print-overlay') ||
                  // v2.7.96: diálogos padrão (confirm/alert/input). Sem isto, em torneio
                  // VIVO (Confra: snapshots frequentes ao simular resultados) o snapshot
                  // disparava _softRefreshView → initRouter → _dismissAllOverlays e varria a
                  // confirmação ANTES do clique. Sintoma: "clico em Sortear/Resetar, a janela
                  // de confirmação abre e fecha; só fica depois de ~4 cliques".
                  document.getElementById('custom-confirm-dialog') ||
                  document.getElementById('custom-alert-dialog') ||
                  document.getElementById('custom-input-dialog') ||
                  document.getElementById('custom-multi-input-dialog') ||
                  // v2.4.9: escolha de categoria/dados na INSCRIÇÃO. Sem isto, o
                  // snapshot do Firestore (frequente em torneio ao vivo) disparava
                  // _softRefreshView → initRouter → _dismissAllOverlays e varria o
                  // modal antes da pessoa escolher → "fica processando e não
                  // inscreve". Mesma classe de bug da v0.15.89/v1.0.62/casual overlay.
                  document.querySelector('[id^="modal-category-enroll-"]') ||
                  document.getElementById('modal-birthdate-enroll');
  var active = document.activeElement;
  var isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
  // v2.8.51: NÃO re-renderiza durante um arraste em andamento (body.sp-drag-compact).
  // Um snapshot do Firestore no meio do drag rebuildava os cards (o card arrastado
  // sumia/voltava) → a tela "piscava que nem louco". Adia até o arraste terminar.
  var _dragging = document.body && document.body.classList.contains('sp-drag-compact');
  if (openModal || isTyping || _dragging) {
    clearTimeout(window._pendingSoftRefresh);
    window._pendingSoftRefresh = setTimeout(function() { window._softRefreshView(); }, 500);
    return;
  }

  // 2. Debounce: don't re-render more than once per 800ms
  var now = Date.now();
  if (window._lastSoftRefresh && (now - window._lastSoftRefresh) < 800) {
    clearTimeout(window._pendingSoftRefresh);
    window._pendingSoftRefresh = setTimeout(function() { window._softRefreshView(); }, 800);
    return;
  }
  window._lastSoftRefresh = now;

  // 3. Save scroll position
  var scrollY = window.scrollY || window.pageYOffset || 0;

  // 4. Set soft-refresh flag so router skips scroll-to-top and fade animation
  window._isSoftRefresh = true;

  // 5. Re-render current view via router
  if (typeof initRouter === 'function') initRouter();

  // v1.8.86: se o participante está no detalhe de um torneio que acabou de ter
  // o sorteio realizado (agora tem matches/rounds), redirecionar para o bracket.
  // Cobre o caso de alguém que ficou esperando o sorteio acontecer.
  try {
    var _hash = window.location.hash || '';
    var _hParts = _hash.replace('#','').split('/');

    // v1.9.5: se o user está EM #bracket/:id, marca o key imediatamente.
    // Assim: bracket → Voltar → #tournaments/:id NÃO dispara o redirect,
    // porque o key já está setado desde quando estava no bracket.
    if (_hParts[0] === 'bracket' && _hParts[1]) {
      try { sessionStorage.setItem('sp_bracketRedirected_' + _hParts[1], '1'); } catch(_bse) {}
    }

    if (_hParts[0] === 'tournaments' && _hParts[1]) {
      var _tId = _hParts[1];
      var _tNow = window.AppStore && window.AppStore.tournaments &&
                  window.AppStore.tournaments.find(function(x){ return String(x.id) === String(_tId); });
      if (_tNow) {
        var _hasDraw = (Array.isArray(_tNow.matches) && _tNow.matches.length > 0) ||
                       (Array.isArray(_tNow.rounds)  && _tNow.rounds.length  > 0) ||
                       (Array.isArray(_tNow.groups)  && _tNow.groups.length  > 0);
        // v2.3.48 — CAUSA-RAIZ do toast espúrio "🎲 Sorteio realizado!" ao
        // desativar um jogador (ou qualquer ação que dispare soft-refresh) na
        // página de detalhe com a chave já montada. O redirect serve SÓ pra
        // quem está ESPERANDO o sorteio: deve disparar quando a chave TRANSICIONA
        // de ausente → presente nesta sessão de visualização — NÃO quando o
        // usuário já chega com a chave montada (organizador gerenciando). Antes
        // a condição era "tem chave E não redirecionou ainda", e o key de sessão
        // só era setado pela rota #bracket/ — nunca pelo bracket inline em
        // #tournaments/:id — então o organizador, que vê a chave inline, nunca
        // setava o key e levava o redirect no primeiro soft-refresh não-suprimido.
        if (!window._drawStateSeen) window._drawStateSeen = {};
        var _prevSeen = window._drawStateSeen[_tId];
        window._drawStateSeen[_tId] = _hasDraw; // registra estado atual
        var _ssKey = 'sp_bracketRedirected_' + _tId;
        var _alreadyRedirected = false;
        try { _alreadyRedirected = sessionStorage.getItem(_ssKey) === '1'; } catch(_se) {}
        // Transição real: na observação anterior NÃO havia chave e agora há.
        // Primeira observação (_prevSeen === undefined) nunca redireciona — só
        // registra o estado — pra não disparar pra quem já abriu com a chave.
        var _justAppeared = (_prevSeen === false) && _hasDraw;
        if (_justAppeared && !_alreadyRedirected) {
          try { sessionStorage.setItem(_ssKey, '1'); } catch(_se) {}
          window._bracketRedirectedFor = _tId; // compat
          if (typeof showNotification === 'function') {
            showNotification('🎲 Sorteio realizado!', 'Redirecionando para o chaveamento…', 'success');
          }
          setTimeout(function() {
            window._lastActiveTournamentId = _tId;
            window.location.hash = '#bracket/' + _tId;
          }, 1200);
        }
      }
    }
  } catch(_e) {}

  // 6. Restore scroll position after render
  requestAnimationFrame(function() {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    window._isSoftRefresh = false;
  });
};

// ─── Topbar progressive compaction ─────────────────────────────────────────
// Progressive hiding order (shrinking):
//   1. Abbreviate "Organizador" → "Org."
//   2. Hide user name
//   3. Hide "Notificações" label
//   4. Hide "Explorar" label
//   5. Hide "Início" label
//   6. Hamburger (if still doesn't fit)
// Reverse order when growing.
window._checkTopbarWrap = function() {
  var topbar = document.querySelector('.topbar');
  var menu = document.querySelector('.topbar-menu');
  if (!topbar || !menu) return;
  var logo = topbar.querySelector('.page-title');
  if (!logo) return;

  // Progressive hiding steps (classes on menu)
  var steps = ['hide-viewlabel', 'hide-username', 'hide-notif', 'hide-explorar', 'hide-inicio'];

  function _setViewModeLabel(abbreviated) {
    var vmBtn = document.getElementById('view-mode-selector');
    if (vmBtn && window.AppStore) {
      var isOrg = window.AppStore.viewMode === 'organizer';
      var icon = isOrg ? '👁️' : '👤';
      var label = isOrg ? (abbreviated ? 'Org.' : 'Organizador') : (abbreviated ? 'Part.' : 'Participante');
      vmBtn.innerHTML = icon + ' <span style="font-weight:600;">' + label + '</span>';
    }
  }

  // Skip if ≤767px — CSS handles hamburger via media query
  if (window.innerWidth <= 767) {
    for (var i = 0; i < steps.length; i++) menu.classList.remove(steps[i]);
    menu.classList.remove('topbar-compact');
    topbar.classList.remove('topbar-hamburger');
    _setViewModeLabel(true);
    return;
  }

  // Helper: force reflow then check if content exceeds topbar bounds
  function doesntFit() {
    void topbar.offsetHeight;
    var lastChild = menu.lastElementChild;
    if (!lastChild) return false;
    var topbarRight = topbar.getBoundingClientRect().right;
    var contentRight = lastChild.getBoundingClientRect().right;
    return contentRight > topbarRight + 2;
  }

  // Reset all states
  for (var j = 0; j < steps.length; j++) menu.classList.remove(steps[j]);
  menu.classList.remove('topbar-compact');
  topbar.classList.remove('topbar-hamburger');
  menu.classList.remove('open');
  _setViewModeLabel(false);

  // Progressive: try each step until it fits
  if (!doesntFit()) return;

  // Step 1: Abbreviate view mode label
  _setViewModeLabel(true);
  menu.classList.add('hide-viewlabel');
  if (!doesntFit()) return;

  // Step 2: Hide user name
  menu.classList.add('hide-username');
  if (!doesntFit()) return;

  // Step 3: Hide "Notificações" label
  menu.classList.add('hide-notif');
  if (!doesntFit()) return;

  // Step 4: Hide "Explorar" label
  menu.classList.add('hide-explorar');
  if (!doesntFit()) return;

  // Step 5: Hide "Início" label
  menu.classList.add('hide-inicio');
  if (!doesntFit()) return;

  // Step 6: Hamburger — nothing else to hide
  topbar.classList.add('topbar-hamburger');
};
(function() {
  var _wrapTimer;
  window.addEventListener('resize', function() {
    clearTimeout(_wrapTimer);
    _wrapTimer = setTimeout(window._checkTopbarWrap, 60);
    // Close hamburger dropdown on resize (layout may change)
    window._closeHamburger();
  });
  window.addEventListener('load', function() { setTimeout(window._checkTopbarWrap, 300); });
})();

// ═══════════════════════════════════════════════════════════════════════════
// HAMBURGER DROPDOWN — OUTSIDE topbar stacking context
// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE (DO NOT CHANGE):
//   #hamburger-dropdown is a SIBLING of <header class="topbar">, NOT a child.
//   It has its own stacking context: z-index 102 > back-header 101 > topbar 100.
//   When open, JS pushes .sticky-back-header (Voltar) down below the dropdown.
//   Both are visible and clickable simultaneously.
//
// RULES:
//   1. DO NOT move the dropdown inside the topbar — breaks Voltar.
//   2. DO NOT change z-index values — update style.css vars + tests first.
//   3. DO NOT use display:none on .sticky-back-header — user needs Voltar.
//   4. DO NOT raise topbar z-index above back-header — blocks Voltar clicks.
//   5. See tests.html "Z-Index Hierarchy" suite for automated guards.
// ═══════════════════════════════════════════════════════════════════════════
window._toggleHamburger = function(btn) {
  var dd = document.getElementById('hamburger-dropdown');
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  if (isOpen) {
    window._closeHamburger();
    return;
  }
  // Populate dropdown with cloned nav content from .topbar-menu
  var menu = document.querySelector('.topbar-menu');
  if (!menu) return;
  dd.innerHTML = '';
  // Clone each child group (nav, actions, profile)
  var children = menu.children;
  for (var i = 0; i < children.length; i++) {
    var clone = children[i].cloneNode(true);
    dd.appendChild(clone);
  }
  dd.classList.add('open');
  document.body.classList.add('hamburger-open');
  if (btn) btn.setAttribute('aria-expanded', 'true');

  // If triggered from within a high-z overlay (e.g. casual at 100002, support at 100000),
  // raise dropdown above that overlay so the menu is actually visible.
  var highZParent = btn && btn.closest && btn.closest('#casual-match-overlay, #modal-support-pix, #qr-modal-overlay');
  dd.style.zIndex = highZParent ? '200000' : '';

  // Push back-header (Voltar) down so it appears below the dropdown.
  // Double rAF ensures the dropdown has painted before we measure its height.
  window._reflowChrome();
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { window._reflowChrome(); });
  });

  // Close on click outside — remove first to prevent accumulation on rapid open
  document.removeEventListener('click', window._hamburgerOutsideClick);
  setTimeout(function() {
    document.addEventListener('click', window._hamburgerOutsideClick);
  }, 10);
};

window._closeHamburger = function() {
  var dd = document.getElementById('hamburger-dropdown');
  if (dd) {
    dd.style.zIndex = ''; // reset any elevated z-index from overlay context
    dd.classList.remove('open');
    dd.innerHTML = '';
  }
  document.body.classList.remove('hamburger-open');
  var btn = document.querySelector('.hamburger-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', window._hamburgerOutsideClick);
  // Restore back-header to default position
  window._reflowChrome();
};

// ─── UNIFIED BACK HEADER ────────────────────────────────────────────────────
// Canonical emitter for the fixed "Voltar" bar that sits under the topbar.
// ALL views route through this helper — there is exactly one place that
// renders a Voltar button and exactly one click path that handles it.
//
// Architecture:
//   - The button carries `data-back-nav` + `data-back-href` attributes.
//   - A single delegated listener on <body> (installed in _installBackNavDelegate
//     below) handles every Voltar click in the app. This is more robust than
//     inline onclick strings which are fragile to escaping bugs and easy to
//     lose silently when the button is re-parented by CSS tricks.
//   - On click: _dismissAllOverlays() runs, then window.location.hash is set.
//     A programmatic callback override is supported via registry instead of
//     inline JS.
//
// opts:
//   href           — hash to navigate to (default '#dashboard')
//   label          — button text (default 'Voltar')
//   middleHtml     — optional HTML between the button and the right slot
//                    (auto-adds a flex:1 spacer if omitted)
//   rightHtml      — optional HTML after the middle slot
//   belowHtml      — optional second row inside the sticky wrapper
//   extraStyle     — optional inline style on the outer wrapper
//   onClickOverride— optional JS string (legacy) OR function. If a function is
//                    passed, it's registered and invoked by the delegate.
window._backNavCallbacks = window._backNavCallbacks || {};
window._renderBackHeader = function(opts) {
  opts = opts || {};
  var _label = (opts.label == null) ? 'Voltar' : String(opts.label);
  var _href = opts.href || '#dashboard';
  var _safeHrefAttr = String(_href).replace(/"/g, '&quot;');
  var _extraStyle = opts.extraStyle ? (' style="' + opts.extraStyle + '"') : '';
  var _svg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
  var _middle = (opts.middleHtml == null || opts.middleHtml === '')
    ? '<div style="flex:1;"></div>'
    : opts.middleHtml;
  var _right = opts.rightHtml || '';
  var _below = opts.belowHtml || '';
  var _hamSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  var _hamBtn = '<button class="back-hdr-ham" type="button" aria-label="Abrir menu" onclick="typeof window._toggleHamburger===\'function\'&&window._toggleHamburger(this);" style="width:36px;height:36px;border:none;background:transparent;color:var(--text-color);cursor:pointer;border-radius:50%;align-items:center;justify-content:center;flex-shrink:0;">' + _hamSvg + '</button>';

  // Override support: inline JS (legacy string) OR function (registered).
  var _overrideAttr = '';
  if (opts.onClickOverride) {
    if (typeof opts.onClickOverride === 'function') {
      var _cbId = 'back_cb_' + Math.random().toString(36).slice(2, 10);
      window._backNavCallbacks[_cbId] = opts.onClickOverride;
      _overrideAttr = ' data-back-cb="' + _cbId + '"';
    } else {
      // Legacy inline-JS override (kept for backward compat).
      _overrideAttr = ' data-back-inline="' + String(opts.onClickOverride).replace(/"/g, '&quot;') + '"';
    }
  }

  return (
    '<div class="sticky-back-header"' + _extraStyle + '>' +
      '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;">' +
        '<button class="btn btn-outline btn-sm hover-lift" type="button" ' +
                'data-back-nav="1" data-back-href="' + _safeHrefAttr + '"' + _overrideAttr + ' ' +
                'aria-label="' + _label + '" ' +
                'style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:20px;flex-shrink:0;">' +
          _svg + ' <span class="back-btn-label">' + _label + '</span>' +
        '</button>' +
        _middle +
        _right +
        _hamBtn +
      '</div>' +
      _below +
    '</div>'
  );
};

// Single delegated click handler for every Voltar button in the app.
// Installed once at load; survives view re-renders because it lives on <body>.
window._installBackNavDelegate = function() {
  if (window._backNavDelegateInstalled) return;
  window._backNavDelegateInstalled = true;
  var _onBackNav = function(e) {
    // Walk up from target to find [data-back-nav] (button may wrap SVG/text)
    var el = e.target;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.getAttribute && el.getAttribute('data-back-nav') === '1') break;
      el = el.parentNode;
    }
    if (!el || el === document.body) return;
    e.preventDefault();
    e.stopPropagation();

    // Dismiss overlays first so no stale full-screen modal masks the target view.
    try { if (typeof window._dismissAllOverlays === 'function') window._dismissAllOverlays(); } catch(err) {}

    // Override path: callback function registered in _backNavCallbacks.
    var cbId = el.getAttribute('data-back-cb');
    if (cbId && typeof window._backNavCallbacks[cbId] === 'function') {
      try { window._backNavCallbacks[cbId](e); } catch(err) { window._warn('[scoreplace-back] cb error', err); }
      return;
    }
    // Override path: legacy inline JS string (Function exec).
    var inline = el.getAttribute('data-back-inline');
    if (inline) {
      try { (new Function(inline))(); } catch(err) { window._warn('[scoreplace-back] inline error', err); }
      return;
    }
    // Default path: navigate to the hash. If we're already there (edge case
    // where caller passed href === current hash), force a re-render by briefly
    // toggling the hash, so the user still gets the expected back behavior.
    var href = el.getAttribute('data-back-href') || '#dashboard';
    if (window.location.hash === href) {
      window.location.hash = '#dashboard';
      if (href !== '#dashboard') {
        setTimeout(function() { window.location.hash = href; }, 0);
      }
    } else {
      window.location.hash = href;
    }
  };
  // Capture-phase so we beat view-local listeners (no one else should also
  // handle a click on a [data-back-nav] element).
  document.body.addEventListener('click', _onBackNav, true);
};
// Install as soon as body exists.
if (document.body) {
  window._installBackNavDelegate();
} else {
  document.addEventListener('DOMContentLoaded', function() { window._installBackNavDelegate(); });
}

// ─── DISMISS ALL OVERLAYS ───────────────────────────────────────────────────
// .sticky-back-header lives at z-index 101, but the app creates 40+ ad-hoc
// SVG da bola de tênis — idêntico em iOS, Android, Windows, Mac.
// Substitui o emoji 🎾 que renderiza como raquete no Samsung/Android.
// ~600 bytes inline, zero impacto de desempenho. Gradiente radial dá volume
// (highlight em cima à esquerda → sombra embaixo à direita). A costura é a
// curva S central acentuada que divide a bola em 2 gomos IDÊNTICOS (simétricos
// por rotação de 180°), recortada pelo círculo (clipPath) para as pontas
// terminarem exatamente na borda — sem arredondado vazando. Cores da referência.
// Cada chamada gera ids de gradiente/clip únicos para não colidir quando há
// vários loaders na mesma página. Gira pelo eixo central via animação do loader.
window._tennisBallSeq = (window._tennisBallSeq || 0);
window._TENNIS_BALL_SVG = function(size) {
  var s = size || '1em';
  var n = (window._tennisBallSeq++);
  var gid = 'sptb' + n, cid = 'sptbc' + n;
  var seam = 'M24,-3 C58,18 -10,30 24,51';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="' + s + '" height="' + s + '" style="display:inline-block;vertical-align:-0.12em;flex-shrink:0;" aria-hidden="true">' +
    '<defs><radialGradient id="' + gid + '" cx="37%" cy="31%" r="80%">' +
      '<stop offset="0" stop-color="#EFEA57"/><stop offset="46%" stop-color="#D2E000"/>' +
      '<stop offset="86%" stop-color="#A6C614"/><stop offset="100%" stop-color="#8CA811"/>' +
    '</radialGradient><clipPath id="' + cid + '"><circle cx="24" cy="24" r="22"/></clipPath></defs>' +
    '<circle cx="24" cy="24" r="22" fill="url(#' + gid + ')"/>' +
    '<g clip-path="url(#' + cid + ')">' +
      '<path d="' + seam + '" fill="none" stroke="#7a9410" stroke-width="3.4" opacity="0.4"/>' +
      '<path d="' + seam + '" fill="none" stroke="#fff" stroke-width="2.6" opacity="0.97"/>' +
    '</g>' +
  '</svg>';
};

// ─── Global loading spinner — bola de tênis girando fixed no topo da viewport ────────
// v0.17.94: helper reutilizável pra qualquer operação async que demora.
// Stack-based — múltiplas chamadas .show() exigem mesmo número de .hide()
// pra sumir. Usar `window._loadingSpinner.show('Carregando perfil…')`
// ou simplesmente `window._loadingSpinner.show()`.
window._loadingSpinner = (function() {
  var _refCount = 0;
  var _id = 'scoreplace-global-loader';
  var _styleId = 'scoreplace-global-loader-style';

  function _ensureStyle() {
    if (document.getElementById(_styleId)) return;
    var style = document.createElement('style');
    style.id = _styleId;
    style.textContent =
      '@keyframes sp-loader-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
      '@keyframes sp-loader-pulse { 0%,100% { filter: drop-shadow(0 0 0 transparent); } 50% { filter: drop-shadow(0 0 10px rgba(212,244,60,0.7)); } }' +
      '#' + _id + ' { position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:99999; display:flex; align-items:center; gap:8px; padding:6px 14px; background:rgba(15,23,42,0.92); border:1px solid rgba(212,244,60,0.3); border-radius:999px; backdrop-filter:blur(8px); pointer-events:none; box-shadow:0 4px 20px rgba(0,0,0,0.4); }' +
      '#' + _id + ' .ball { font-size:1.1rem; display:inline-block; animation: sp-loader-spin 1.2s linear infinite, sp-loader-pulse 1.6s ease-in-out infinite; }' +
      '#' + _id + ' .label { color:#e2e8f0; font-size:0.78rem; font-weight:600; white-space:nowrap; }';
    document.head.appendChild(style);
  }

  return {
    show: function(label) {
      _refCount++;
      _ensureStyle();
      var el = document.getElementById(_id);
      if (!el) {
        el = document.createElement('div');
        el.id = _id;
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
      }
      el.innerHTML = '<span class="ball" style="line-height:1;">' + window._TENNIS_BALL_SVG('1.1rem') + '</span><span class="label">' +
        (label ? String(label).replace(/[<>]/g, '') : 'Carregando…') + '</span>';
    },
    hide: function() {
      _refCount = Math.max(0, _refCount - 1);
      if (_refCount === 0) {
        var el = document.getElementById(_id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    },
    // Reset force — usado em casos extremos (erro grave, logout).
    reset: function() {
      _refCount = 0;
      var el = document.getElementById(_id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  };
})();

// v1.3.26-beta: helper canônico pra renderizar bloco "🎾 Carregando…"
// dentro de uma área (view container, modal, slot). Emite o MESMO emoji
// + animação spin+pulse que o boot loader e o auth-cache loader, pra
// padronizar todas as telas de loading. Chamadores fazem
// `container.innerHTML = window._renderBallLoader('Buscando perfis…')`.
// Sem 'label' usa "Carregando…" como default.
//
// As keyframes ficam em <style id="scoreplace-ball-keyframes"> injetado
// uma vez no <head>. Pode coexistir com o estilo do _loadingSpinner
// (chaves com prefixo diferente) sem conflito.
window._renderBallLoader = function(label, opts) {
  opts = opts || {};
  if (!document.getElementById('scoreplace-ball-keyframes')) {
    var style = document.createElement('style');
    style.id = 'scoreplace-ball-keyframes';
    style.textContent =
      '@keyframes scoreplace-ball-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }' +
      '@keyframes scoreplace-ball-pulse { 0%,100% { filter: drop-shadow(0 0 0 transparent);} 50% { filter: drop-shadow(0 0 12px rgba(212,244,60,0.6));} }';
    document.head.appendChild(style);
  }
  var size = opts.size || '3rem';
  var minHeight = opts.minHeight || '40vh';
  var safeLabel = label ? String(label).replace(/[<>]/g, '') : 'Carregando…';
  return '<div class="scoreplace-ball-loader" style="display:flex;justify-content:center;align-items:center;min-height:' + minHeight + ';">' +
    '<div style="text-align:center;">' +
      '<div aria-hidden="true" style="width:' + size + ';height:' + size + ';margin-bottom:0.85rem;display:inline-block;line-height:1;animation:scoreplace-ball-spin 1.2s linear infinite;">' + window._TENNIS_BALL_SVG(size) + '</div>' +
      '<div role="status" aria-live="polite" style="color:var(--text-muted, #9ca3af);font-size:0.88rem;font-weight:600;">' + safeLabel + '</div>' +
    '</div>' +
  '</div>';
};

// Inline (mini) — pra slots pequenos dentro de cards ou seções (ex: "🎾
// Sugestões do Google carregando…" abaixo da seção "Outros locais"). Sem
// padding vertical pesado. Mesma animação canônica.
window._renderBallLoaderInline = function(label, opts) {
  opts = opts || {};
  if (!document.getElementById('scoreplace-ball-keyframes')) {
    // Reutiliza _renderBallLoader pra garantir o style injetado mesmo se
    // o caller nunca tiver invocado a versão block.
    window._renderBallLoader('', { minHeight: '0' });
  }
  var size = opts.size || '1.4rem';
  var safeLabel = label ? String(label).replace(/[<>]/g, '') : 'Carregando…';
  return '<div class="scoreplace-ball-loader-inline" style="display:inline-flex;align-items:center;gap:8px;padding:6px 0;color:var(--text-muted,#9ca3af);font-size:0.82rem;">' +
    '<span aria-hidden="true" style="width:' + size + ';height:' + size + ';display:inline-block;line-height:1;animation:scoreplace-ball-spin 1.2s linear infinite;">' + window._TENNIS_BALL_SVG(size) + '</span>' +
    '<span role="status" aria-live="polite">' + safeLabel + '</span>' +
  '</div>';
};

// overlays at z 9999–999999 (TV mode, set scoring, draw prep, categories,
// host transfer, re-auth, etc). If ANY of them survives a hashchange, it
// masks the Voltar button invisibly. This function rips them ALL down,
// not just a named list: any position:fixed direct child of <body> whose
// computed z-index > 101 and whose bounding box covers most of the viewport
// is treated as a leftover overlay. Safe-list elements (topbar, hamburger,
// back-header, toast notifications, offline banner) are preserved.
// Called by the router on every hashchange and by Voltar's default onclick.
window._dismissAllOverlays = function(opts) {
  opts = opts || {};
  var keep = opts.keep || [];

  // v0.17.90: ALWAYS-KEEP list — modais críticos com lifecycle próprio que
  // NUNCA devem ser dismissed pelo sweep, mesmo sem aparecer no `keep` arg.
  // Adicione aqui qualquer modal que: (a) bloqueia fluxo crítico (terms,
  // confirm de logout, etc.), (b) tem botões "Cancelar"/"Confirmar" próprios
  // que controlam o ciclo de vida.
  var ALWAYS_KEEP = [
    'modal-terms-acceptance', // LGPD compliance — bug v0.17.90: aparecia e
                              // sumia rápido pq sweep removia .active
    'live-scoring-overlay',   // partida casual ao vivo — ciclo de vida próprio,
                              // nunca deve ser varrido pelo sweep genérico
    'casual-match-overlay',   // lobby/join de partida casual — idem
    'player-profile-overlay', // perfil de jogador — escondido (display:none)
                              // quando stats está aberto, restaurado no Voltar
    'flyer-print-overlay'     // diálogo de imprimir convite — fecha sozinho
                              // (Cancelar/backdrop gravam as prefs e removem)
  ];
  ALWAYS_KEEP.forEach(function(id) {
    if (keep.indexOf(id) === -1) keep.push(id);
  });

  // 1. Named overlays (fast path — always remove unless kept).
  var overlayIds = [
    'tv-mode-overlay',
    'set-scoring-overlay',
    'qr-modal-overlay',
    'player-stats-overlay',
    'scan-qr-overlay',
    'scan-qr-room-overlay'
  ];
  overlayIds.forEach(function(id) {
    if (keep.indexOf(id) !== -1) return;
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  });

  // 2. Generic sweep — any fixed-position body child above z 101 that looks
  //    like a full-screen overlay.
  try {
    var kids = document.body ? Array.prototype.slice.call(document.body.children) : [];
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    kids.forEach(function(el) {
      if (!el || !el.parentNode) return;
      if (keep.indexOf(el.id) !== -1) return;
      // Safe-list: elements that must NEVER be swept.
      if (el.classList && (
        el.classList.contains('modal-overlay') ||
        el.classList.contains('topbar') ||
        el.classList.contains('sticky-back-header') ||
        el.classList.contains('hamburger-dropdown') ||
        el.classList.contains('notification-banner') ||
        el.classList.contains('notification-toast') ||
        el.classList.contains('toast-notification') ||
        el.classList.contains('offline-banner')
      )) return;
      if (el.id === 'hamburger-dropdown' || el.id === 'view-container' ||
          el.id === 'skip-link' || el.id === 'aria-live-region' ||
          el.id === 'scoreplace-global-loader' ||
          // v2.4.94: PROTEGER os splashes de boot do sweep genérico. ESTE era o
          // bug de "abre imediatamente": o _dismissAllOverlays roda no 1º
          // handleRoute (render da dashboard) e arrancava o splash (fixed,
          // full-screen, z alto) — ignorando todo o controle de tempo do hide()/
          // _bootReady. Eles têm ciclo de vida próprio (removidos só quando
          // _bootReady, respeitando o tempo mínimo).
          el.id === 'scoreplace-boot-loader' || el.id === 'sp-js-boot-overlay' ||
          /^notification/i.test(el.id || '') || /^toast/i.test(el.id || '')) return;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
      var cs;
      try { cs = window.getComputedStyle(el); } catch(e) { return; }
      if (!cs) return;
      if (cs.position !== 'fixed') return;
      var z = parseInt(cs.zIndex, 10);
      if (!z || z <= 101) return;
      // Heuristic: treat as full-screen overlay only if it covers >50% of the viewport.
      // Small toasts, floating pills, and dropdowns are left alone.
      var r;
      try { r = el.getBoundingClientRect(); } catch(e) { return; }
      if (!r || r.width < vw * 0.5 || r.height < vh * 0.5) return;
      el.parentNode.removeChild(el);
    });
  } catch(e) {}

  // 3. TV mode locks body scroll + enters fullscreen — undo both.
  try { document.body.style.overflow = ''; } catch(e) {}
  try { document.documentElement.style.overflow = ''; } catch(e) {}
  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(function(){});
    }
  } catch(e) {}

  // 4. Standard modal-overlay deactivation.
  try {
    var modals = document.querySelectorAll('.modal-overlay.active');
    for (var i = 0; i < modals.length; i++) {
      if (keep.indexOf(modals[i].id) === -1) modals[i].classList.remove('active');
    }
  } catch(e) {}
};

// ─── UNIFIED CHROME LAYOUT ───────────────────────────────────────────────────
// Single source of truth for the position of topbar + hamburger dropdown +
// back header. Everything else used to compute its own position from stale
// state (dropdown was position:relative and got scrolled off when the user
// scrolled before opening it; back-header tracked that off-screen dropdown).
// Now both the dropdown and the back-header are position:fixed and anchored
// to the measured topbar height, so they stay pinned regardless of scroll.
//
// Layout (top-down): topbar → (if open) dropdown → back-header → content.
window._reflowChrome = function() {
  var topbar = document.querySelector('.topbar');
  var topbarH = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 60;
  var dd = document.getElementById('hamburger-dropdown');
  var ddOpen = dd && dd.classList.contains('open');
  var ddH = 0;

  var backHeaders = document.querySelectorAll('.sticky-back-header');

  // A back-header only "counts" if it is actually visible to the user:
  // either position:fixed on a regular page, or static inside an *active*
  // .modal-overlay. Inactive modals are kept in the DOM (opacity:0 +
  // pointer-events:none, NOT display:none), so their back-headers would
  // otherwise inflate the count and stop the dropdown from pushing content.
  var visibleBackHeaders = [];
  var staticBH = null;
  backHeaders.forEach(function(bh) {
    var overlayAncestor = bh.closest && bh.closest('.modal-overlay');
    if (overlayAncestor && !overlayAncestor.classList.contains('active')) return;
    var _r = bh.getBoundingClientRect();
    if (_r.width === 0 && _r.height === 0) return; // display:none — skip
    visibleBackHeaders.push(bh);
    if (window.getComputedStyle(bh).position !== 'fixed') {
      // For overlays, the dropdown must snap to the back-header's actual
      // bottom edge in the viewport rather than topbarH.
      staticBH = bh;
    }
  });
  var hasBackHeader = visibleBackHeaders.length > 0;

  if (dd) {
    if (staticBH) {
      // Overlay context: snap dropdown immediately below the back-header
      var _bhRect = staticBH.getBoundingClientRect();
      // v0.16.81: -1px de overlap pra eliminar gap subpixel (idem fix do
      // back-header abaixo). Topbar e back-header usam o mesmo bg-darker,
      // então 1px de sobreposição é invisível.
      dd.style.top = (Math.ceil(_bhRect.bottom) - 1) + 'px';
    } else {
      // Regular page: pin dropdown under topbar
      dd.style.top = (topbarH - 1) + 'px';
    }
    if (ddOpen) ddH = Math.ceil(dd.getBoundingClientRect().height);
  }

  // v0.16.81: -1px de overlap entre topbar/dropdown e back-header.
  // Usuário reportou em larguras intermediárias (não estreitas, não
  // largas) gap visível mostrando conteúdo de fundo passando entre o
  // topbar e o "Voltar" sticky. Causa: subpixel rendering — topbar
  // renderiza em e.g. 60.5px, Math.ceil arredonda pra 61 mas o navegador
  // pinta o edge em 60.5 → 0.5px de gap visível antialiased pra ~1px.
  // Mesmo problema entre dropdown do hamburger e back-header. Como
  // topbar/dropdown/back-header todos usam var(--bg-darker), 1px de
  // overlap é invisível e cobre qualquer rounding antialiased.
  // v2.7.70: a margem do conteúdo precisa ir no primeiro irmão VISÍVEL — senão um
  // irmão display:none logo após o header (ex.: #part-search-empty na tela de
  // Inscritos) recebe a margem (e some), e o conteúdo de verdade fica COBERTO pelo
  // header fixo. Pula invisíveis (display:none / 0×0).
  function _firstVisibleSibling(el) {
    var s = el && el.nextElementSibling;
    while (s) {
      var cs = window.getComputedStyle(s);
      var r = s.getBoundingClientRect();
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && !(r.width === 0 && r.height === 0)) return s;
      s = s.nextElementSibling;
    }
    return null;
  }
  var bhOffset = topbarH + ddH - 1;
  // v3.0.91: expõe a altura do back-header FIXO visível em `--backheader-h`.
  // Qualquer barra sticky que precise grudar ABAIXO do back-header (ex.: a barra
  // canônica de filtro/busca de Pessoas/Inscritos) usa
  // `top: calc(var(--topbar-h) + var(--hamburger-dd-h) + var(--backheader-h))`.
  // 0 quando não há back-header (ex.: dashboard) → a fórmula colapsa pro caso
  // sem back-header sozinha.
  var fixedBackHeaderH = 0;
  backHeaders.forEach(function(bh) {
    var isFixed = window.getComputedStyle(bh).position === 'fixed';
    if (isFixed) {
      bh.style.top = bhOffset + 'px';
      var next = _firstVisibleSibling(bh);
      if (next) {
        var _bhRectH = bh.getBoundingClientRect().height;
        // v3.1.19: a barra canônica sticky usa FLOOR da altura do back-header pra
        // `--backheader-h`, NÃO ceil. Com ceil (54.1→55) o `top` da barra caía ~0.9px
        // ABAIXO do fundo real do header (121.1) → um vão sub-1px onde o card vazava
        // (reportado "não encaixa no cabeçalho"). Floor (54.1→54) faz o top da barra
        // ficar ≤ fundo do header → overlap <1px (invisível, MESMA cor bg-darker, header
        // por cima) em vez de gap. O espaçamento do conteúdo (margin-top) segue ceil
        // (folga generosa pra o conteúdo nunca ser coberto pelo header).
        var bhH = Math.ceil(_bhRectH);
        fixedBackHeaderH = Math.floor(_bhRectH);
        // Use !important because overlay CSS uses `margin-top: 0 !important`
        // to suppress the default 50px spacer — our dynamic value has to win.
        next.style.setProperty('margin-top', (ddH + bhH + 8) + 'px', 'important');
      }
    } else {
      var next = _firstVisibleSibling(bh);
      if (next) {
        var mt = ddH > 0 ? (ddH + 8) + 'px' : '0';
        next.style.setProperty('margin-top', mt, 'important');
      }
    }
  });
  // v2.7.71: topbar agora é FIXED (não mais sticky) → compensa a saída do fluxo com
  // padding-top no .main-content = altura REAL da topbar. Dinâmico: acompanha a
  // topbar quebrando em 2 linhas em telas estreitas. Sem isso o conteúdo subiria
  // pra trás da topbar.
  // !important pra vencer a regra `.main-content { padding:0 !important }` (centralização em telas largas).
  var mc = document.querySelector('.main-content');
  if (mc && topbarH > 0) mc.style.setProperty('padding-top', (topbarH + 16) + 'px', 'important'); // +16 = o respiro (1rem) que a topbar tinha em margin-bottom

  var vc = document.getElementById('view-container');
  if (vc) {
    if (!hasBackHeader) {
      // v2.8.54: o .main-content já tem padding-top = topbarH + 16 (o respiro de 1rem
      // abaixo da topbar). Com o menu aberto, somar ddH cheio deixava ESSE respiro de
      // 16px como um gap escuro entre o menu e o conteúdo (ex.: barra de filtro/busca da
      // dashboard). Subtrai o respiro pra o conteúdo grudar no fundo do menu.
      vc.style.paddingTop = ddH > 0 ? (Math.max(0, ddH - 16) + 'px') : '';
    } else if (vc.style.paddingTop) {
      vc.style.paddingTop = '';
    }
  }
  // v2.8.47: expõe a altura REAL da topbar + a do dropdown do hamburger (0 fechado).
  // Qualquer sticky abaixo da topbar (ex.: barra de filtro/busca da dashboard) usa
  // `top: calc(var(--topbar-h) + var(--hamburger-dd-h))` pra grudar no fundo da
  // topbar (que cresce ao quebrar linha no mobile) e descer com o menu aberto.
  try {
    document.documentElement.style.setProperty('--topbar-h', topbarH + 'px');
    document.documentElement.style.setProperty('--hamburger-dd-h', ((ddOpen ? ddH : 0)) + 'px');
    document.documentElement.style.setProperty('--backheader-h', fixedBackHeaderH + 'px');
  } catch (e) {}
};
window._hamburgerOutsideClick = function(e) {
  var dd = document.getElementById('hamburger-dropdown');
  var btn = document.querySelector('.hamburger-btn');
  if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
    window._closeHamburger();
  }
};

// Observe DOM for added/removed sticky headers and their size changes.
// All triggers funnel into _reflowChrome so chrome positioning has exactly
// one source of truth.
(function() {
  if (window._backHeaderObserverInstalled) return;
  window._backHeaderObserverInstalled = true;

  var resizeObs = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(function() {
      window._reflowChrome();
    });
  }

  function observeExistingHeaders() {
    if (!resizeObs) return;
    document.querySelectorAll('.sticky-back-header').forEach(function(h) {
      try { resizeObs.observe(h); } catch(e) {}
    });
    // Also observe the topbar and hamburger dropdown: when their height
    // changes (topbar wraps on narrow viewport, dropdown opens/closes or
    // its content changes) we need to reflow everything below.
    var topbar = document.querySelector('.topbar');
    if (topbar) { try { resizeObs.observe(topbar); } catch(e) {} }
    var dd = document.getElementById('hamburger-dropdown');
    if (dd) { try { resizeObs.observe(dd); } catch(e) {} }
  }

  function initDomObserver() {
    var vc = document.getElementById('view-container');
    if (!vc) { setTimeout(initDomObserver, 100); return; }
    var mo = new MutationObserver(function() {
      observeExistingHeaders();
      window._reflowChrome();
    });
    mo.observe(vc, { childList: true, subtree: true });
    observeExistingHeaders();
    window._reflowChrome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDomObserver);
  } else {
    initDomObserver();
  }

  window.addEventListener('resize', function() {
    window._reflowChrome();
  });
  // Scroll: both dropdown and back-header are position:fixed so they don't
  // move with scroll, but measured heights can change (e.g. dropdown opens
  // mid-scroll and we need to update the back-header offset immediately).
  window.addEventListener('scroll', function() {
    window._reflowChrome();
  }, { passive: true });
})();

// ─── Constantes globais ─────────────────────────────────────────────────────
window.SCOREPLACE_URL = 'https://scoreplace.app';
// Helper canônico: retorna TODOS os UIDs de um participante.
// Duplas têm p1Uid/p2Uid além de uid. Garante individualidade.
window._participantUids = function(p) {
  if (typeof p !== 'object' || !p) return [];
  var seen = {};
  var uids = [];
  function _add(u) { if (u && !seen[u]) { seen[u] = true; uids.push(u); } }
  _add(p.uid); _add(p.p1Uid); _add(p.p2Uid);
  if (Array.isArray(p.participants)) p.participants.forEach(function(s) { if (s) _add(s.uid); });
  return uids;
};

// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE = uid em TODO mapa por-pessoa do torneio (checkedIn / absent / vips).
// Regra do dono (jun/2026): "sempre identifica pelo uid. vips, checkin, ausente e
// enquete inclusive." Esses mapas eram chaveados por NOME — dois jogadores de
// mesmo nome colidiam no mesmo estado. Agora a chave canônica é o uid da pessoa;
// o nome só vale como FALLBACK (jogador informal sem conta, ou doc legado).
//
// _memberUidByName(t, name): resolve o nome de UMA pessoa para o uid dela dentro
// do torneio — varre solos (p.uid), slots de dupla (p1Name/p1Uid, p2Name/p2Uid),
// sub-participants[], e também espera/standby (pra substitutos resolverem).
// Retorna '' pra jogador informal (sem conta).
window._memberUidByName = function(t, name) {
  if (!t || !name) return '';
  var target = String(name).trim().toLowerCase();
  if (!target) return '';
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if ((p.displayName || p.name || '').trim().toLowerCase() === target && p.uid) return p.uid;
      if ((p.p1Name || '').trim().toLowerCase() === target && p.p1Uid) return p.p1Uid;
      if ((p.p2Name || '').trim().toLowerCase() === target && p.p2Uid) return p.p2Uid;
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (sub && (sub.displayName || sub.name || '').trim().toLowerCase() === target && sub.uid) return sub.uid;
        }
      }
    }
  }
  return '';
};

// _memberNameByUid(t, uid): reverso de _memberUidByName — dado um uid, devolve o
// displayName da pessoa dentro do torneio. Usado pra "traduzir" chaves uid de
// volta pra nome quando o consumidor precisa cruzar com a CHAVE (m.p1/m.p2, que
// são nomes — camada do bracket, Parte 8). Retorna '' se o uid não bate ninguém
// (ex.: a chave do mapa já é um nome legado, não um uid).
window._memberNameByUid = function(t, uid) {
  if (!t || !uid) return '';
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if (p.uid === uid) return p.displayName || p.name || '';
      if (p.p1Uid === uid) return p.p1Name || '';
      if (p.p2Uid === uid) return p.p2Name || '';
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (sub && sub.uid === uid) return sub.displayName || sub.name || '';
        }
      }
    }
  }
  return '';
};

// _idMapKey(t, who): chave canônica {uid, name} de UMA pessoa. `who` pode ser
// string (nome — resolve via varredura) OU objeto de pessoa única (usa who.uid).
// NÃO use objeto de DUPLA aqui (dois uids) — os mapas são por-pessoa; readers
// iteram indivíduos decompostos.
window._idMapKey = function(t, who) {
  if (who && typeof who === 'object') {
    return { uid: who.uid || '', name: (who.displayName || who.name || '') };
  }
  var nm = String(who == null ? '' : who);
  return { uid: window._memberUidByName(t, nm), name: nm };
};
// Leitura: uid-key primeiro, nome só fallback (legado/informal). Retorna o valor
// cru armazenado (ex.: Date.now()) pra ordenação por timestamp continuar valendo.
window._idMapGet = function(t, map, who) {
  if (!map || who == null) return undefined;
  var k = window._idMapKey(t, who);
  if (k.uid && map[k.uid] != null) return map[k.uid];
  return k.name ? map[k.name] : undefined;
};
window._idMapHas = function(t, map, who) { return !!window._idMapGet(t, map, who); };
// Escrita: chaveia por uid quando há conta; migra (apaga a chave-nome legada).
// Jogador informal (sem uid) continua por nome.
window._idMapSet = function(t, map, who, val) {
  if (!map || who == null) return;
  var k = window._idMapKey(t, who);
  if (k.uid) { map[k.uid] = val; if (k.name && k.name !== k.uid && map[k.name] != null) delete map[k.name]; }
  else if (k.name) map[k.name] = val;
};
window._idMapDel = function(t, map, who) {
  if (!map || who == null) return;
  var k = window._idMapKey(t, who);
  if (k.uid && map[k.uid] != null) delete map[k.uid];
  if (k.name && map[k.name] != null) delete map[k.name];
};

// _entryHasVip(t, entry): VIP é flag de ENTRADA (qualquer membro VIP → entrada
// VIP), armazenada por uid de cada membro (ver _toggleVip). Aceita objeto
// (solo/dupla — usa _participantUids) OU string ("A / B" = time → resolve cada
// membro; ou nome solo). Nome só fallback legado. Unifica todos os readers de VIP.
window._entryHasVip = function(t, entry) {
  if (!t || !t.vips || entry == null) return false;
  var vips = t.vips;
  if (typeof entry === 'object') {
    var uids = (typeof window._participantUids === 'function') ? window._participantUids(entry) : (entry.uid ? [entry.uid] : []);
    for (var i = 0; i < uids.length; i++) { if (vips[uids[i]]) return true; }
    var nm = entry.displayName || entry.name || '';
    return nm ? !!vips[nm] : false;
  }
  var s = String(entry);
  var members = s.indexOf('/') !== -1 ? s.split('/').map(function(x){ return x.trim(); }).filter(Boolean) : [s];
  for (var j = 0; j < members.length; j++) {
    var u = window._memberUidByName(t, members[j]);
    if (u && vips[u]) return true;
    if (vips[members[j]]) return true; // fallback nome legado
  }
  return false;
};

// ─── woHistory uid-keyed (Parte 9 da varredura, v3.0.78-beta) ────────────────
// t.woHistory é o registro de W.O. (key = pessoa ausente; value = meta
// {originalTeam, partner, matchNum, replacedBy, timestamp}). Antes era chaveado
// por NOME → dois jogadores de mesmo nome colidiam (um W.O.'d sumia o outro).
// Agora a CHAVE é o uid da pessoa (nome só fallback legado/informal), exatamente
// como checkedIn/absent/vips (v3.0.74). Os VALORES (originalTeam/partner/
// replacedBy) seguem sendo NOMES — cruzam com os slots da chave (m.p1/m.p2 =
// nomes, camada do bracket, Parte 8). Os helpers espelham _idMap*.
//
// IMPORTANTE: o card "órfão" do jogador W.O.'d EXIBE a pessoa que levou W.O. —
// e ela pode já ter saído de todas as estruturas (substituída na dupla). Por
// isso _woHistSet GRAVA `meta.name` (o displayName no momento do W.O.) e o
// display usa _woHistDisplayName → nunca mostra um uid cru. Doc legado (key=nome,
// sem meta.name) cai no fallback: traduz uid→nome, senão a própria chave (= nome).
window._woHistGet = function(t, who) {
  if (!t || !t.woHistory || who == null) return undefined;
  var k = window._idMapKey(t, who);
  if (k.uid && t.woHistory[k.uid] != null) return t.woHistory[k.uid];
  return k.name ? t.woHistory[k.name] : undefined;
};
window._woHistHas = function(t, who) { return !!window._woHistGet(t, who); };
window._woHistSet = function(t, who, meta) {
  if (!t || who == null) return;
  if (!t.woHistory) t.woHistory = {};
  var k = window._idMapKey(t, who);
  // Garante display robusto: grava o nome da pessoa no próprio meta.
  if (meta && typeof meta === 'object' && !meta.name) meta.name = k.name || '';
  if (k.uid) {
    t.woHistory[k.uid] = meta;
    if (k.name && k.name !== k.uid && t.woHistory[k.name] != null) delete t.woHistory[k.name];
  } else if (k.name) {
    t.woHistory[k.name] = meta;
  }
};
window._woHistDel = function(t, who) {
  if (!t || !t.woHistory || who == null) return;
  var k = window._idMapKey(t, who);
  if (k.uid && t.woHistory[k.uid] != null) delete t.woHistory[k.uid];
  if (k.name && t.woHistory[k.name] != null) delete t.woHistory[k.name];
};
// Display name pra um entry de woHistory (card órfão). meta.name é canônico
// (gravado na escrita); fallback traduz a chave uid→nome, senão usa a própria
// chave (key = nome em docs legados).
window._woHistDisplayName = function(t, key, meta) {
  if (meta && meta.name) return meta.name;
  return window._memberNameByUid(t, key) || key;
};

// v2.4.72-beta: pontuação de "interação" entre o usuário logado e um amigo
// (por uid) = nº de torneios em que ambos participaram. Usada pra rankear
// quais amigos mostrar nominalmente quando há muitos no "Próximas horas" do
// dashboard (top-5 por interação + "+X"). Aceita um cache opcional pra evitar
// re-varrer a lista de torneios uma vez por uid no mesmo render.
window._friendInteractionScore = function(friendUid, cache) {
  if (!friendUid) return 0;
  if (cache && cache[friendUid] != null) return cache[friendUid];
  var cu = window.AppStore && window.AppStore.currentUser;
  var myUid = cu && cu.uid;
  var ts = (window.AppStore && window.AppStore.tournaments) || [];
  var n = 0;
  for (var i = 0; i < ts.length; i++) {
    var t = ts[i];
    if (!t) continue;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    var hasMe = !!(myUid && t.creatorUid === myUid);
    var hasFriend = false;
    for (var j = 0; j < parts.length; j++) {
      var uids = window._participantUids(parts[j]);
      if (myUid && uids.indexOf(myUid) !== -1) hasMe = true;
      if (uids.indexOf(friendUid) !== -1) hasFriend = true;
    }
    if (hasMe && hasFriend) n++;
  }
  if (cache) cache[friendUid] = n;
  return n;
};

window._avatarUrl = function(name, size) {
    var seed = encodeURIComponent(name || '?');
    var s = size || 40;
    return 'https://api.dicebear.com/9.x/initials/svg?seed=' + seed + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=' + s;
};
// v1.0.23-beta: helper canônico pra avatar de perfil. Preserva fotos reais
// (Google/Apple/etc) e cai em iniciais quando não tem foto OU quando o
// photoURL salvo é uma URL antiga de dicebear cartoon (notionists) — feedback
// do user: "esses ícones são ridículos. vamos usar as iniciais dos nomes
// invés dessa porcaria". Detecta qualquer URL dicebear.com como fallback,
// porque mesmo as variações de iniciais antigas precisam re-derivar do nome
// atual (caso usuário tenha mudado nome desde o save).
window._profileAvatarUrl = function(name, photoURL, size) {
    if (photoURL && typeof photoURL === 'string' && photoURL.indexOf('dicebear.com') === -1) {
        return photoURL;
    }
    return window._avatarUrl(name, size);
};

// ─── Friendly display name helpers ────────────────────────────────────────────
// Returns true when a displayName is a generic placeholder that gives no useful
// identity info (empty, "Usuário", "user", "teste", etc.).
// Also catches purely-numeric strings that were accidentally stored as names
// in very old versions (phone number as displayName).
// _genderWord: retorna a forma correta da palavra conforme o gênero do usuário.
// profileOrGender: objeto de perfil com .gender, ou string ('feminino'/'masculino').
// Se gênero não definido ou 'outro', retorna a forma neutra (com o/a).
// Exemplos:
//   _genderWord(p, 'inscrito', 'inscrita')        → 'inscrito' / 'inscrita' / 'inscrito(a)'
//   _genderWord(p, 'organizador', 'organizadora') → 'organizador' / 'organizadora' / 'organizador(a)'
window._genderWord = function(profileOrGender, masculine, feminine) {
  var g = typeof profileOrGender === 'string'
    ? profileOrGender
    : (profileOrGender && profileOrGender.gender) || '';
  g = String(g).toLowerCase().trim();
  if (g === 'feminino' || g === 'f') return feminine;
  if (g === 'masculino' || g === 'm') return masculine;
  // gênero não definido: forma neutra com parênteses
  if (masculine && feminine) {
    // diferem só no último char (inscrito/inscrita) → "inscrit(o/a)"
    if (masculine.slice(0,-1) === feminine.slice(0,-1)) {
      return masculine.slice(0,-1) + '(' + masculine.slice(-1) + '/' + feminine.slice(-1) + ')';
    }
    // v2.4.36: feminino = masculino + sufixo (Organizador/Organizadora) →
    // "Organizador(a)"; masculino = feminino + sufixo → idem ao contrário.
    if (feminine.indexOf(masculine) === 0) {
      return masculine + '(' + feminine.slice(masculine.length) + ')';
    }
    if (masculine.indexOf(feminine) === 0) {
      return feminine + '(' + masculine.slice(feminine.length) + ')';
    }
    return masculine + '/' + feminine;
  }
  return masculine || feminine || '';
};

// v2.4.6: título "Rei/Rainha" de uma série (grupo de 4 do formato Rei/Rainha)
// conforme a composição de gênero dos jogadores da série:
//   homens + mulheres → 'Rei/Rainha'
//   só mulheres        → 'Rainha'
//   só homens          → 'Rei'
//   indefinido         → 'Rei/Rainha' (sem regressão — mantém ambos)
// playerNames: array de nomes de exibição. tournament: pra resolver o gênero
// de cada nome em t.participants[] (gravado na inscrição).
window._monarchGroupTitle = function(playerNames, tournament) {
  var names = Array.isArray(playerNames) ? playerNames : [];
  var parr = tournament && (Array.isArray(tournament.participants)
    ? tournament.participants
    : (tournament.participants ? Object.values(tournament.participants) : [])) || [];
  var byName = {};
  parr.forEach(function(p) {
    if (p && typeof p === 'object' && p.gender) {
      var k1 = String(p.displayName || '').toLowerCase().trim();
      var k2 = String(p.name || '').toLowerCase().trim();
      var gg = String(p.gender).toLowerCase().trim();
      if (k1) byName[k1] = gg;
      if (k2) byName[k2] = gg;
    }
  });
  var hasMale = false, hasFemale = false;
  names.forEach(function(n) {
    var g = byName[String(n || '').toLowerCase().trim()];
    if (g === 'masculino' || g === 'm') hasMale = true;
    else if (g === 'feminino' || g === 'f') hasFemale = true;
  });
  if (hasMale && !hasFemale) return 'Rei';
  if (hasFemale && !hasMale) return 'Rainha';
  return 'Rei/Rainha';
};

// v3.0.x: gênero de exibição de um jogador por NOME (Rei/Rainha é individual).
// Fonte primária: t.participants[].gender (gravado na inscrição). Fallback: cache
// de perfil _partProfileByName. Retorna 'feminino' | 'masculino' | '' (desconhecido).
window._participantGenderByName = function(tournament, name) {
  var nm = String(name == null ? '' : name).toLowerCase().trim();
  if (!nm) return '';
  var parr = tournament && (Array.isArray(tournament.participants)
    ? tournament.participants
    : (tournament.participants ? Object.values(tournament.participants) : [])) || [];
  for (var i = 0; i < parr.length; i++) {
    var p = parr[i];
    if (p && typeof p === 'object' && p.gender) {
      var k1 = String(p.displayName || '').toLowerCase().trim();
      var k2 = String(p.name || '').toLowerCase().trim();
      if (k1 === nm || k2 === nm) return String(p.gender).toLowerCase().trim();
    }
  }
  var prof = window._partProfileByName && window._partProfileByName[nm];
  if (prof && prof.gender) return String(prof.gender).toLowerCase().trim();
  return '';
};

// v3.0.x: coroas da honraria "invicto" do REI/RAINHA DA PRAIA.
//   Coroa A = feminino (Rainha) · Coroa B = masculino (Rei). Ouro chapado, tom do app.
//   Construtor com tamanho parametrizável (inline na chave = 15px; pódio casual = maior).
window._reiRainhaCrownSvg = function(which, size) {
  size = size || 15;
  var base = 'width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="#fbbf24" style="flex-shrink:0;vertical-align:middle;margin-left:3px;" role="img"';
  if (which === 'B' || which === 'masc' || which === 'masculino' || which === 'm') {
    return '<svg ' + base + ' aria-label="Rei invicto"><title>Rei invicto</title><path d="M4.2 17.4 L5 9.4 L9 13 L12 6 L15 13 L19 9.4 L19.8 17.4 Z"/><circle cx="4.6" cy="8.2" r="1.5"/><circle cx="12" cy="5" r="1.6"/><circle cx="19.4" cy="8.2" r="1.5"/><rect x="4.4" y="18.4" width="15.2" height="2.6" rx="1.3"/></svg>';
  }
  return '<svg ' + base + ' aria-label="Rainha invicta"><title>Rainha invicta</title><path d="M4 17 L2.4 6.6 L8.4 11 L12 4.4 L15.6 11 L21.6 6.6 L20 17 Z"/><rect x="4.4" y="18.1" width="15.2" height="2.7" rx="1"/></svg>';
};
// Coroa por gênero: feminino/desconhecido → A (Rainha); masculino → B (Rei).
window._reiRainhaCrownByGender = function(gender, size) {
  var g = String(gender == null ? '' : gender).toLowerCase().trim();
  var masc = (g === 'masculino' || g === 'm');
  return window._reiRainhaCrownSvg(masc ? 'B' : 'A', size);
};
window._CROWN_A_FEM = window._reiRainhaCrownSvg('A');
window._CROWN_B_MASC = window._reiRainhaCrownSvg('B');

// v3.0.x — REI/RAINHA DA PRAIA (CONCEITO CANÔNICO, vale p/ TORNEIO **e** PARTIDA CASUAL):
// numa SÉRIE DE 3 JOGOS entre 4 pessoas, cada uma joga UMA vez com cada um dos outros 3
// como parceiro (AB×CD, AC×BD, AD×BC). O REI/RAINHA é quem VENCEU OS 3 JOGOS — é o ÚNICO
// que ganha todos; matematicamente os outros 3 vencem exatamente 1 cada (o jogo em que
// foram parceiros do rei). A honraria (coroa por gênero) é conferida ao vencedor da série,
// no torneio (classificação do grupo) e na partida casual (pódio Rei/Rainha).
//
// _reiRainhaInvictoCrown: variante TORNEIO — só com o grupo COMPLETO e para o invicto que
// disputou a rodada inteira (maxPlayed do grupo) — evita "rei falso" por BYE/sit-out.
window._reiRainhaInvictoCrown = function(tournament, standings, s, opts) {
  if (!s || !opts || !opts.groupDone) return '';
  if (!(s.played > 0) || s.losses !== 0) return '';
  var maxPlayed = 0;
  (Array.isArray(standings) ? standings : []).forEach(function(x) {
    if (x && x.played > maxPlayed) maxPlayed = x.played;
  });
  if (s.played !== maxPlayed) return '';
  var g = (typeof window._participantGenderByName === 'function')
    ? window._participantGenderByName(tournament, s.name) : '';
  return window._reiRainhaCrownByGender(g);
};

window._isUnfriendlyName = function(name) {
  if (!name) return true;
  var n = String(name).trim().toLowerCase();
  if (!n) return true;
  // v1.8.60: número de telefone (e.g. "+5511999887766") É um identificador
  // válido para usuários phone-only — não é "unfriendly". Apenas nomes
  // genéricos e placeholders são considerados ruins.
  var BAD = ['usuário', 'usuario', 'user', 'teste', 'test', 'undefined', 'null', 'anon', 'anônimo', 'visitante'];
  return BAD.indexOf(n) !== -1;
};

// v3.0.58: e-mail SINTÉTICO de conta phone-only (phone_<dígitos>@phone.scoreplace.app,
// ver _entrarSyntheticEmail em auth.js) NUNCA pode ser exibido como nome/identidade —
// é detalhe interno de auth. Qualquer resolvedor de nome trata isso como "sem e-mail"
// e cai no fallback de telefone (+55 (DDD)...).
window._isSyntheticEmail = function(email) {
  return /@phone\.scoreplace\.app$/i.test(String(email || ''));
};

// Nome amigável canônico para exibir um usuário logado. Mesma cadeia de
// fallback da topbar (displayName real → prefixo do email → telefone) para
// que a saudação NUNCA mostre "Visitante" pra um usuário de fato logado.
// Retorna null quando não há usuário/identidade alguma (aí o caller decide
// usar "Visitante"). Bug reportado: usuária krbenini logada aparecia como
// "Bem-vindo, Visitante!" porque a saudação só olhava displayName.
window._friendlyUserName = function(user) {
  user = user || (window.AppStore && window.AppStore.currentUser) || null;
  if (!user) return null;
  var dn = (user.displayName || '').trim();
  // v3.0.56: detecta também telefone mascarado SEM DDI ("(11) 91693-6454") —
  // o regex antigo só pegava se começasse com +/dígito. Assim displayName que é
  // só telefone (em qualquer forma) cai no fallback que reaplica o +55.
  var _dnDigits = dn.replace(/\D/g, '');
  var looksPhone = /^\+?\d[\d\s().-]{5,}$/.test(dn)
    || (_dnDigits.length >= 10 && _dnDigits.length <= 13 && !/[a-zA-Z@]/.test(dn));
  var unfriendly = (typeof window._isUnfriendlyName === 'function') && window._isUnfriendlyName(dn);
  if (dn && !looksPhone && !unfriendly) return dn;
  // displayName ausente/genérico/telefone → prefixo do email (igual topbar).
  // v3.0.58: e-mail sintético (phone_...@phone.scoreplace.app) NÃO conta como e-mail —
  // senão a topbar mostrava "phone_5511916936454". Cai no telefone (+55) logo abaixo.
  if (user.email && !(typeof window._isSyntheticEmail === 'function' && window._isSyntheticEmail(user.email))) {
    var pref = String(user.email).split('@')[0];
    if (pref) return pref;
  }
  // telefone formatado como último recurso (usuário phone-only sem nome).
  // v3.0.56: SEMPRE com o DDI (+55) — a identificação única de um telefone é
  // DDI+DDD+número. Consistente com _friendlyDisplayName (cards). Antes o greeting
  // e a topbar mostravam "(11) 91693-6454" sem o +55.
  var ph = user.phone || user.phoneNumber;
  if (ph) {
    var cc = user.phoneCountry || '55';
    var local = (typeof window._phoneLocalDigits === 'function')
      ? window._phoneLocalDigits(ph, cc)
      : String(ph).replace(/\D/g, '');
    if (local && local.length >= 8 && typeof window._formatPhoneDisplay === 'function') {
      return '+' + cc + ' ' + window._formatPhoneDisplay(local, cc);
    }
    return String(ph);
  }
  return null;
};

// v2.3.27: APENAS para a saudação da hero box e o nome no link de perfil da
// topbar (os 2 únicos lugares que só o próprio usuário vê). Extrai o primeiro
// nome quando é um nome de verdade; mantém telefone/email/identificadores
// intactos (não dá pra "encurtar"). NÃO usar em nenhum outro lugar — nomes de
// outros usuários e contextos públicos seguem com o nome completo.
window._firstNameOnly = function(name) {
  if (!name) return name;
  var s = String(name).trim();
  if (!s) return s;
  if (s.indexOf('@') > -1 || s.indexOf('(') > -1 || s.indexOf('+') > -1 || /\d{3,}/.test(s)) return s;
  var first = s.split(/\s+/)[0];
  return first || s;
};

// v2.4.23: saudação concordante com o gênero do perfil.
// PT: "Bem-vinda" pra gênero feminino, "Bem-vindo" pra masculino/desconhecido.
// EN: sempre "Welcome" (sem flexão). Usada nas chaves i18n via {greeting}.
// Aceita user explícito; default = AppStore.currentUser.
window._welcomeWord = function(user) {
  var lang = window._lang || 'pt';
  if (lang === 'en') return 'Welcome';
  var u = user || (window.AppStore && window.AppStore.currentUser) || null;
  var g = u && u.gender ? String(u.gender).trim().toLowerCase() : '';
  if (g === 'feminino' || g === 'female' || g === 'f') return 'Bem-vinda';
  if (g === 'masculino' || g === 'male' || g === 'm') return 'Bem-vindo';
  // v2.4.36: sem gênero no perfil → forma neutra "Bem-vindo(a)".
  return 'Bem-vindo(a)';
};

// Normalizes any phone string to E.164 format with + prefix.
// E.g., '11997237733' + cc='55' → '+5511997237733'
//       '+5511997237733'         → '+5511997237733' (unchanged)
// Returns '' if result has fewer than 8 digits (clearly invalid).
window._normalizePhoneE164 = function(phone, cc) {
  if (!phone) return '';
  var d = String(phone).replace(/\D/g, '');
  var _cc = String(cc || '55');
  // Strip leading country-code digits (whether they came with + or not)
  if (d.startsWith(_cc)) d = d.slice(_cc.length);
  if (d.length < 8) return '';
  return '+' + _cc + d;
};

// Returns local digits only (strips + and country code) — used by
// _formatPhoneDisplay which expects DDD+number without DDI.
// E.g., '+5511997237733' + cc='55' → '11997237733'
//       '11997237733'               → '11997237733'
window._phoneLocalDigits = function(phone, cc) {
  if (!phone) return '';
  var d = String(phone).replace(/\D/g, '');
  var _cc = String(cc || '55');
  if (d.startsWith(_cc)) d = d.slice(_cc.length);
  return d;
};

// Returns the best human-readable name for a user object.
// Falls through: displayName (if friendly) → email → phone → 'Usuário'.
// Suitable for display anywhere a person needs to be identified.
window._friendlyDisplayName = function(u) {
  if (!u) return 'Usuário';
  var name = String(u.displayName || '').trim();
  // v3.0.58: nome real vence — mas displayName que é só TELEFONE (em qualquer forma,
  // ex. "+5511916936454" cru ou "(11) 91693-6454") NÃO é retornado cru: cai no
  // formatador de telefone abaixo pra virar canônico "+55 (DDD)...".
  var _nd = name.replace(/\D/g, '');
  var nameLooksPhone = name && (/^\+?\d[\d\s().-]{5,}$/.test(name)
    || (_nd.length >= 10 && _nd.length <= 13 && !/[a-zA-Z@]/.test(name)));
  if (name && !nameLooksPhone && !window._isUnfriendlyName(name)) return name;
  // v2.4.3: privacidade — quando o usuário ocultou o e-mail/telefone, ele NÃO é
  // usado como nome público (fallback). Só afeta quem não tem nome amigável.
  // v3.0.58: e-mail sintético (phone_...@phone.scoreplace.app) nunca é nome.
  if (u.email && u.omitEmail !== true && !(typeof window._isSyntheticEmail === 'function' && window._isSyntheticEmail(u.email))) return u.email;
  // Phone — strip country code before formatting for display
  if (u.phone && u.omitPhone !== true) {
    var cc = u.phoneCountry || '55';
    var ph = (typeof window._phoneLocalDigits === 'function')
      ? window._phoneLocalDigits(u.phone, cc)
      : String(u.phone).replace(/\D/g, '');
    if (ph.length >= 8) {
      if (typeof window._formatPhoneDisplay === 'function') {
        try { return '+' + cc + ' ' + window._formatPhoneDisplay(ph, cc); } catch (_e) {}
      }
      return '+' + cc + ' ' + ph;
    }
  }
  // E.164 from Firebase Auth (SMS users who never loaded their profile)
  if (u.phoneNumber && u.omitPhone !== true) return u.phoneNumber;
  // displayName ERA um telefone (sem u.phone separado) → formata canônico.
  if (nameLooksPhone && typeof window._pNameDisplay === 'function') return window._pNameDisplay(name);
  return name || 'Usuário';
};

// v1.8.7-beta: canonical participant name resolver — used everywhere a
// participant object (or plain string name) needs to be shown as text.
// p can be: a plain string, or an object with displayName/name/email fields
// (the two shapes stored in t.participants[], t.matches[].p1/p2, etc.).
// fallback defaults to '' when omitted.
// v1.8.20-beta: formata para display um valor bruto do campo nome.
// Padrão canônico no BD desde v1.8.20: "+55 (DDD) XXXXX-XXXX".
// Esta função também lida com formas legadas que possam ter escapado:
//   - E.164 bruto: "+5511916936454" → formata
//   - Dígitos puros: "11916936454" → adiciona +55 e máscara
//   - Já formatado: "+55 (11) 91693-6454" → retorna como está
function _pNameDisplay(raw) {
  if (!raw) return raw;
  var s = String(raw).trim();
  // Já formatado com DDI e máscara
  if (/^\+\d{1,3}\s\(\d{2}\)\s\d{4,5}-\d{4}$/.test(s)) return s;
  // E.164 bruto sem espaços/máscara (ex: +5511916936454)
  if (/^\+55\d{10,11}$/.test(s)) {
    var local = s.replace(/\D/g, '').substring(2);
    if (local.length === 11) return '+55 (' + local.substring(0,2) + ') ' + local.substring(2,7) + '-' + local.substring(7);
    return '+55 (' + local.substring(0,2) + ') ' + local.substring(2,6) + '-' + local.substring(6);
  }
  // Dígitos puros BR (legado)
  if (/^\d{10,11}$/.test(s)) {
    if (s.length === 11) return '+55 (' + s.substring(0,2) + ') ' + s.substring(2,7) + '-' + s.substring(7);
    return '+55 (' + s.substring(0,2) + ') ' + s.substring(2,6) + '-' + s.substring(6);
  }
  // v3.0.56: mascarado SEM DDI (legado): "(11) 91693-6454" → prepend +55
  if (/^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(s)) {
    var dd = s.replace(/\D/g, '');
    if (dd.length === 11) return '+55 (' + dd.substring(0,2) + ') ' + dd.substring(2,7) + '-' + dd.substring(7);
    if (dd.length === 10) return '+55 (' + dd.substring(0,2) + ') ' + dd.substring(2,6) + '-' + dd.substring(6);
  }
  return s;
}

// ─── Editor de crop/zoom para upload de imagem ───────────────────────────────
// Uso: window._openImageCropEditor(dataUrl, opts, callback)
//   opts.shape  : 'square' (default) | 'circle'
//   opts.size   : tamanho do output em px (default: 400)
//   opts.title  : título do overlay (default: 'Ajustar imagem')
//   callback(croppedDataUrl) chamado quando usuário confirma
window._openImageCropEditor = function(dataUrl, opts, callback) {
  opts = opts || {};
  var SIZE   = opts.size  || 400;
  var SHAPE  = opts.shape || 'square';
  var TITLE  = opts.title || 'Ajustar imagem';
  var PREV   = 240; // preview canvas size (px)
  // v2.3.64: quando radiusControl=true (logo do torneio), o overlay ganha um
  // slider de FORMA contínuo (quadrado ↔ círculo) e a imagem é exportada como
  // QUADRADO inteiro — o arredondamento é aplicado via CSS no display/impressão.
  var RADIUS_CTRL = !!opts.radiusControl;
  var cropRadiusPct = (opts.initialRadius != null) ? Math.max(0, Math.min(50, Number(opts.initialRadius))) : 14;
  if (isNaN(cropRadiusPct)) cropRadiusPct = 14;

  // Remove overlay anterior se existir
  var _old = document.getElementById('img-crop-overlay');
  if (_old) _old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'img-crop-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:20000;display:flex;align-items:center;justify-content:center;';

  var panel = document.createElement('div');
  panel.style.cssText = 'background:var(--bg-card,#1e293b);border-radius:16px;padding:20px;max-width:320px;width:95%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);';

  // Cores de fundo predefinidas
  var _bgPresets = [
    { label: 'Transparente', value: 'transparent', css: 'repeating-conic-gradient(#666 0% 25%, #999 0% 50%) 0 0/12px 12px' },
    { label: 'Branco',       value: '#ffffff',     css: '#ffffff' },
    { label: 'Preto',        value: '#000000',     css: '#000000' },
    { label: 'Creme',        value: '#fffdd0',     css: '#fffdd0' },
    { label: 'Gelo',         value: '#e8f4f8',     css: '#e8f4f8' },
    { label: 'Cinza',        value: '#94a3b8',     css: '#94a3b8' },
  ];
  var _bgSwatchHtml = _bgPresets.map(function(p, i) {
    return '<button id="crop-bg-' + i + '" title="' + p.label + '" onclick="window._cropPickBg(' + i + ')" style="width:22px;height:22px;border-radius:4px;border:2px solid rgba(255,255,255,0.3);cursor:pointer;flex-shrink:0;background:' + p.css + ';padding:0;"></button>';
  }).join('');

  var _formaSliderHtml = RADIUS_CTRL
    ? '<div style="margin:6px 0 2px;display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">⚫</span>' +
        '<input type="range" id="crop-forma" min="0" max="50" value="' + (50 - cropRadiusPct) + '" style="flex:1;accent-color:#6366f1;">' +
        '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">⬛</span>' +
      '</div>' +
      '<div style="font-size:0.62rem;color:var(--text-muted,#94a3b8);margin:0 0 6px;text-align:left;">Forma: arraste pra arredondar (círculo ↔ quadrado)</div>'
    : '';
  var _canvasRadius = RADIUS_CTRL ? (cropRadiusPct + '%') : (SHAPE === 'circle' ? '50%' : '12px');
  panel.innerHTML =
    '<div style="font-size:0.9rem;font-weight:700;color:var(--text-bright,#f1f5f9);margin-bottom:14px;">' + TITLE + '</div>' +
    '<canvas id="crop-canvas" width="' + PREV + '" height="' + PREV + '" style="border-radius:' + _canvasRadius + ';cursor:move;touch-action:none;max-width:100%;"></canvas>' +
    '<div style="margin:14px 0 4px;display:flex;align-items:center;gap:10px;">' +
      '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">🔍−</span>' +
      '<input type="range" id="crop-zoom" min="50" max="300" value="100" style="flex:1;accent-color:var(--primary-color,#6366f1);">' +
      '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">+🔍</span>' +
    '</div>' +
    _formaSliderHtml +
    '<div style="margin:6px 0 4px;display:flex;align-items:center;gap:10px;">' +
      '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">☀−</span>' +
      '<input type="range" id="crop-brightness" min="-75" max="75" value="0" style="flex:1;accent-color:#f59e0b;">' +
      '<span style="font-size:0.7rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">+☀</span>' +
      '<span id="crop-brightness-label" style="font-size:0.7rem;color:#fbbf24;min-width:32px;text-align:right;">0%</span>' +
    '</div>' +
    '<div style="margin:6px 0 8px;">' +
      '<div style="font-size:0.65rem;color:var(--text-muted,#94a3b8);margin-bottom:5px;text-align:left;">Fundo</div>' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        _bgSwatchHtml +
        '<button id="crop-bg-eyedropper" title="Conta-gotas — capturar cor da tela" onclick="window._cropEyedropper()" style="width:22px;height:22px;border-radius:4px;border:2px solid rgba(255,255,255,0.3);cursor:pointer;background:rgba(255,255,255,0.08);font-size:0.8rem;padding:0;flex-shrink:0;">🩸</button>' +
        '<input type="color" id="crop-bg-custom" title="Cor personalizada" onchange="window._cropCustomColor(this.value)" style="width:22px;height:22px;border-radius:4px;border:2px solid rgba(255,255,255,0.3);cursor:pointer;padding:1px;background:none;flex-shrink:0;">' +
      '</div>' +
    '</div>' +
    '<div style="font-size:0.7rem;color:var(--text-muted,#94a3b8);margin-bottom:14px;">Arraste · Zoom · Luminosidade · Fundo</div>' +
    '<div style="display:flex;gap:10px;">' +
      '<button id="crop-cancel" class="btn btn-sm" style="flex:1;background:rgba(255,255,255,0.06);color:var(--text-muted,#94a3b8);border:1px solid rgba(255,255,255,0.1);">Cancelar</button>' +
      '<button id="crop-confirm" class="btn btn-sm btn-primary" style="flex:2;">✅ Confirmar</button>' +
    '</div>';

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  var canvas = document.getElementById('crop-canvas');
  var ctx = canvas.getContext('2d');
  var zoomSlider = document.getElementById('crop-zoom');
  var brightnessSlider = document.getElementById('crop-brightness');
  var brightnessLabel = document.getElementById('crop-brightness-label');

  var img = new Image();
  var scale = 1.0;
  var brightness = 0; // -75 to +75
  var bgColor = 'transparent'; // fundo do canvas
  var offsetX = 0, offsetY = 0;
  var isDragging = false, lastX = 0, lastY = 0;

  function _setBg(color) {
    bgColor = color;
    // Destacar swatch ativo
    _bgPresets.forEach(function(p, i) {
      var el = document.getElementById('crop-bg-' + i);
      if (el) el.style.border = (p.value === color) ? '2px solid #6366f1' : '2px solid rgba(255,255,255,0.3)';
    });
    draw();
  }
  // Helpers expostos globalmente para os onclick inline
  window._cropPickBg = function(i) { if (_bgPresets[i]) _setBg(_bgPresets[i].value); };
  window._cropCustomColor = function(v) { _setBg(v); };
  window._cropEyedropper = function() {
    if ('EyeDropper' in window) {
      new window.EyeDropper().open().then(function(r) { _setBg(r.sRGBHex); }).catch(function() {});
    } else {
      // Fallback: abre o color picker nativo
      var el = document.getElementById('crop-bg-custom');
      if (el) el.click();
    }
  };

  function draw() {
    ctx.clearRect(0, 0, PREV, PREV);
    var sw = img.width * scale;
    var sh = img.height * scale;
    var dx = PREV/2 + offsetX - sw/2;
    var dy = PREV/2 + offsetY - sh/2;
    ctx.save();
    var _cornerPx = RADIUS_CTRL ? (cropRadiusPct / 50) * (PREV / 2) : (SHAPE === 'circle' ? PREV / 2 : 12);
    ctx.beginPath(); ctx.roundRect(0, 0, PREV, PREV, _cornerPx); ctx.clip();
    // Preencher fundo antes de desenhar a imagem
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, PREV, PREV);
    }
    ctx.drawImage(img, dx, dy, sw, sh);
    // Luminosidade: overlay branco (clarear) ou preto (escurecer).
    // ctx.filter não funciona em Safari iOS < 15.4; esta abordagem funciona
    // em todos os browsers desde sempre.
    if (brightness !== 0) {
      var alpha = Math.abs(brightness) / 100 * 0.9; // 75% → alpha 0.675
      ctx.fillStyle = brightness > 0
        ? 'rgba(255,255,255,' + alpha + ')'
        : 'rgba(0,0,0,' + alpha + ')';
      ctx.fillRect(0, 0, PREV, PREV);
    }
    ctx.restore();
    // Borda sutil (acompanha a forma)
    ctx.strokeStyle = 'rgba(99,102,241,0.4)'; ctx.lineWidth = 2;
    var _bCorner = RADIUS_CTRL ? (cropRadiusPct / 50) * (PREV / 2 - 1) : (SHAPE === 'circle' ? PREV / 2 - 1 : 11);
    ctx.beginPath(); ctx.roundRect(1, 1, PREV - 2, PREV - 2, Math.max(0, _bCorner)); ctx.stroke();
  }

  img.onload = function() {
    // Fit image to fill the preview
    var ratio = Math.max(PREV / img.width, PREV / img.height);
    scale = ratio;
    zoomSlider.min = Math.max(20, Math.round(ratio * 80));
    zoomSlider.max = Math.round(ratio * 400);
    zoomSlider.value = Math.round(ratio * 100);
    draw();
  };
  img.src = dataUrl;

  zoomSlider.addEventListener('input', function() {
    scale = parseFloat(this.value) / 100;
    draw();
  });

  var formaSlider = document.getElementById('crop-forma');
  if (formaSlider) {
    formaSlider.addEventListener('input', function() {
      cropRadiusPct = 50 - parseInt(this.value, 10);
      canvas.style.borderRadius = cropRadiusPct + '%';
      draw();
    });
  }

  brightnessSlider.addEventListener('input', function() {
    brightness = parseInt(this.value, 10);
    brightnessLabel.textContent = (brightness >= 0 ? '+' : '') + brightness + '%';
    draw();
  });

  function startDrag(x, y) { isDragging = true; lastX = x; lastY = y; }
  function moveDrag(x, y) {
    if (!isDragging) return;
    offsetX += x - lastX; offsetY += y - lastY;
    lastX = x; lastY = y; draw();
  }
  function endDrag() { isDragging = false; }

  canvas.addEventListener('mousedown', function(e) { startDrag(e.offsetX, e.offsetY); });
  canvas.addEventListener('mousemove', function(e) { moveDrag(e.offsetX, e.offsetY); });
  canvas.addEventListener('mouseup', endDrag);
  canvas.addEventListener('mouseleave', endDrag);
  canvas.addEventListener('touchstart', function(e) { e.preventDefault(); var t=e.touches[0]; var r=canvas.getBoundingClientRect(); startDrag(t.clientX-r.left, t.clientY-r.top); }, {passive:false});
  canvas.addEventListener('touchmove', function(e) { e.preventDefault(); var t=e.touches[0]; var r=canvas.getBoundingClientRect(); moveDrag(t.clientX-r.left, t.clientY-r.top); }, {passive:false});
  canvas.addEventListener('touchend', endDrag);

  document.getElementById('crop-cancel').addEventListener('click', function() { overlay.remove(); });
  document.getElementById('crop-confirm').addEventListener('click', function() {
    // Render final output at target SIZE
    var out = document.createElement('canvas');
    out.width = SIZE; out.height = SIZE;
    var octx = out.getContext('2d');
    var ratio = SIZE / PREV;
    var sw = img.width * scale * ratio;
    var sh = img.height * scale * ratio;
    var dx = SIZE/2 + offsetX*ratio - sw/2;
    var dy = SIZE/2 + offsetY*ratio - sh/2;
    // Logo (RADIUS_CTRL): exporta QUADRADO inteiro (sem recortar) — o radius é
    // aplicado via CSS no display/impressão, sem cantos pretos no JPEG.
    if (!RADIUS_CTRL) {
      if (SHAPE === 'circle') { octx.beginPath(); octx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2); octx.clip(); }
      else { octx.beginPath(); octx.roundRect(0,0,SIZE,SIZE,Math.round(12*ratio)); octx.clip(); }
    }
    if (bgColor && bgColor !== 'transparent') {
      octx.fillStyle = bgColor;
      octx.fillRect(0, 0, SIZE, SIZE);
    }
    octx.drawImage(img, dx, dy, sw, sh);
    if (brightness !== 0) {
      var oAlpha = Math.abs(brightness) / 100 * 0.9;
      octx.fillStyle = brightness > 0
        ? 'rgba(255,255,255,' + oAlpha + ')'
        : 'rgba(0,0,0,' + oAlpha + ')';
      octx.fillRect(0, 0, SIZE, SIZE);
    }
    var result = out.toDataURL('image/jpeg', 0.88);
    overlay.remove();
    if (typeof callback === 'function') callback(result, RADIUS_CTRL ? cropRadiusPct : undefined);
  });
};

window._pName = function(p, fallback) {
  var fb = (fallback !== undefined && fallback !== null) ? fallback : '';
  if (!p) return fb;
  if (typeof p === 'string') return _pNameDisplay(p) || fb;
  // v2.7.98: dupla ESTRUTURAL (p1Name && p2Name) cujo displayName é só o nome do p1
  // (ex.: "Kelly Barth", sem "/") → mostra os DOIS membros. Sem isto, toda tela que
  // usa _pName (lista de inscritos #participants, notificações, contagens por "/")
  // escondia o parceiro (p2) e contava a dupla como 1. Canoniza o nome em 1 lugar só.
  if (p.p1Name && p.p2Name) {
    var _dn = String(p.displayName || p.name || '');
    if (_dn.indexOf('/') === -1) {
      return (_pNameDisplay(p.p1Name) || p.p1Name) + ' / ' + (_pNameDisplay(p.p2Name) || p.p2Name);
    }
  }
  // Prioridade: displayName > name > email > phone (todos passam por _pNameDisplay)
  var raw = p.displayName || p.name || p.email
         || (p.phone ? String(p.phone) : '')
         || fb;
  return _pNameDisplay(raw) || fb;
};

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE ESPERA — CANÔNICA (v2.7.52)
// A espera é UM conceito, igual em qualquer formato (Liga/Pontos Corridos,
// Rei/Rainha, Eliminatórias, Fase de Grupos). Historicamente o storage ficou
// fragmentado em 3 lugares, cada formato escreveu no seu:
//   • t.waitlist            (array)  — Sorteio de Vagas / inscrição tardia
//   • t.standbyParticipants (array)  — fluxo de substituição W.O.
//   • t.monarchWaitlist     (map por categoria, ex {_default_:[...]}) — Rei/Rainha
// _getWaitlist UNE os três numa lista única e deduplicada — é a ÚNICA forma
// correta de LER a espera. Todo display/lógica deve passar por aqui.
window._getWaitlist = function(t) {
  if (!t) return [];
  var out = [], seen = {};
  function add(e) {
    var nm = String(window._pName ? window._pName(e, '') : (typeof e === 'string' ? e : ((e && (e.displayName || e.name || e.email)) || ''))).trim();
    if (!nm) return;
    var k = nm.toLowerCase();
    if (seen[k]) return; seen[k] = 1;
    out.push((e && typeof e === 'object') ? e : { name: nm, displayName: nm });
  }
  if (Array.isArray(t.waitlist)) t.waitlist.forEach(add);
  if (Array.isArray(t.standbyParticipants)) t.standbyParticipants.forEach(add);
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function(cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) arr.forEach(add);
    });
  }
  return out;
};

// CANÔNICO: a lista de espera vive em 3 storages (waitlist + standbyParticipants +
// monarchWaitlist por categoria). Toda vez que se RE-DERIVA a espera (reset, re-sorteio)
// tem que limpar OS TRÊS — senão um deles vira resíduo e o painel (que lê os 3 via
// _getWaitlist) mostra gente fantasma. Retorna TODAS as pessoas que estavam na espera
// (deduplicadas, via _getWaitlist) pra quem precisar devolvê-las ao pool.
window._clearAllWaitlists = function(t) {
  if (!t) return [];
  var collected = window._getWaitlist(t);
  t.waitlist = [];
  t.standbyParticipants = [];
  t.monarchWaitlist = {};
  return collected;
};

// Conjunto de nomes (lowercase) na espera — inclui membros de duplas "A / B".
window._waitlistNameSet = function(t) {
  var s = {};
  window._getWaitlist(t).forEach(function(e) {
    var nm = String(window._pName ? window._pName(e, '') : ((e && (e.displayName || e.name)) || e || '')).trim().toLowerCase();
    if (!nm) return;
    if (nm.indexOf('/') !== -1) nm.split('/').forEach(function(x) { var k = x.trim(); if (k) s[k] = 1; });
    else s[nm] = 1;
  });
  return s;
};


// Formas do nome de um participante/entrada (cru displayName/name/email + formatado
// via _pName), em lowercase. Usado pra casar nomes que aparecem em formas diferentes
// (ex.: telefone cru "+5511981933576" vs formatado "+55 (11) 98193-3576").
window._nameForms = function(e) {
  var forms = [];
  if (window._pName) { var f = String(window._pName(e, '') || ''); if (f) forms.push(f); }
  if (e && typeof e === 'object') {
    ['displayName', 'name', 'email'].forEach(function(k) { if (e[k]) forms.push(String(e[k])); });
  } else if (typeof e === 'string') { forms.push(e); }
  return forms.map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
};

// Remove um nome de TODOS os storages da espera (waitlist + standbyParticipants +
// monarchWaitlist por categoria). Casa nome cru/formatado. Retorna true se removeu algo.
window._removeFromWaitlist = function(t, name) {
  if (!t || !name) return false;
  var target = String(name).trim().toLowerCase();
  var removed = false;
  function matches(e) { return window._nameForms(e).indexOf(target) !== -1; }
  if (Array.isArray(t.waitlist)) {
    var b = t.waitlist.length; t.waitlist = t.waitlist.filter(function(e) { return !matches(e); });
    if (t.waitlist.length < b) removed = true;
  }
  if (Array.isArray(t.standbyParticipants)) {
    var b2 = t.standbyParticipants.length; t.standbyParticipants = t.standbyParticipants.filter(function(e) { return !matches(e); });
    if (t.standbyParticipants.length < b2) removed = true;
  }
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function(cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) { var b3 = arr.length; t.monarchWaitlist[cat] = arr.filter(function(e) { return !matches(e); }); if (t.monarchWaitlist[cat].length < b3) removed = true; }
    });
  }
  return removed;
};

// ─────────────────────────────────────────────────────────────────────────────
// v2.7.68: TRAVA DE SCROLL DE FUNDO (global) — quando um overlay/modal de tela
// cheia está aberto, a página ATRÁS não rola mais. Resolve o bug de "scrollar o
// modal e a tela de baixo rolar junto" em TODO o programa, sem tocar em cada
// overlay. Detecta qualquer filho de <body> position:fixed cobrindo ~toda a
// viewport com z-index alto e trava o body (iOS-safe: position:fixed + restaura o
// scroll ao fechar). Cobre overlays criados dinamicamente E modais .active.
(function () {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  var locked = false, savedY = 0, raf = null;
  function isOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return false;
    var cs; try { cs = window.getComputedStyle(el); } catch (e) { return false; }
    if (!cs || cs.position !== 'fixed') return false;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0 || cs.pointerEvents === 'none') return false;
    if ((parseInt(cs.zIndex, 10) || 0) < 50) return false;
    var r; try { r = el.getBoundingClientRect(); } catch (e) { return false; }
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
  }
  function anyOpen() {
    var b = document.body; if (!b) return false;
    var k = b.children;
    for (var i = 0; i < k.length; i++) { if (isOverlay(k[i])) return true; }
    return false;
  }
  function apply() {
    var want = anyOpen();
    if (want && !locked) {
      locked = true;
      savedY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = (-savedY) + 'px';
      document.body.classList.add('sp-scroll-locked');
    } else if (!want && locked) {
      locked = false;
      document.body.classList.remove('sp-scroll-locked');
      document.body.style.top = '';
      window.scrollTo(0, savedY);
    }
  }
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = null; apply(); }); }
  function start() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', start); return; }
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch (e) {}
    apply();
  }
  start();
  window._refreshScrollLock = schedule; // pra forçar re-checagem se necessário
})();

// v1.8.9-beta: participant avatar HTML — photo with initial fallback
// pp: {photoURL, displayName/name} or string name; size: px integer
window._avatarHtml = function(pp, size) {
  var sz = size || 32;
  var name = (typeof pp === 'string') ? pp : (window._pName(pp) || '?');
  var photo = (pp && typeof pp === 'object') ? (pp.photoURL || null) : null;
  var initial = window._safeHtml((name[0] || '?').toUpperCase());
  var hiddenCircle = '<div style="display:none;width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);align-items:center;justify-content:center;font-size:' + Math.round(sz * 0.45) + 'px;color:white;font-weight:700;flex-shrink:0;">' + initial + '</div>';
  var visibleCircle = '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:' + Math.round(sz * 0.45) + 'px;color:white;font-weight:700;flex-shrink:0;">' + initial + '</div>';
  if (photo) {
    return '<img src="' + window._safeHtml(photo) + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,0.15);" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' + hiddenCircle;
  }
  return visibleCircle;
};

// v1.8.8-beta: canonical HH:MM formatter — accepts Date, timestamp (number)
// or ISO string. Eliminates the repeated padStart(2,'0') pattern spread
// across venues.js, presence.js, dashboard.js and bracket-ui.js.
window._formatHHMM = function(d) {
  if (!d) return '';
  if (typeof d === 'number' || typeof d === 'string') d = new Date(d);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

// v1.8.8-beta: canonical DD/MM HH:MM formatter — builds on _formatHHMM.
// Useful for notification messages and presence labels that need date + time.
window._formatDDMM = function(d) {
  if (!d) return '';
  if (typeof d === 'number' || typeof d === 'string') d = new Date(d);
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + ' ' + window._formatHHMM(d);
};

// v1.8.10-beta: canonical YYYY-MM-DD formatter (ISO date, for Firestore keys
// and <input type="date"> values). Replaces inline getFullYear+padStart chains.
window._formatYYYYMMDD = function(d) {
  if (!d) return '';
  if (typeof d === 'number' || typeof d === 'string') d = new Date(d);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
};

// v1.8.10-beta: extract first token from a display name, email or similar
// string. Splits on whitespace, dot, @, underscore or hyphen — matches the
// pattern used internally in _buildCasualMatchCardsHtml.
window._firstToken = function(s) {
  if (!s) return '';
  return s.split(/[\s.@_\-]+/)[0] || s;
};

// v1.0.33-beta: animação on-scroll de barras + contadores de stats.
// Usado nas estatísticas pós-partida casual e no modal "Estatísticas
// Detalhadas" do hero box. IntersectionObserver é nativo + barato — zero
// impacto perceptível em performance. Bars CSS-transicionam o width;
// counters sobem de 0 → target via RAF com easing cubic-out.
//
// Uso no HTML:
//   <div data-stat-bar="75" style="width:0%; transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>
//   <span data-stat-count="42" data-stat-count-suffix="%">0%</span>
//
// Após inserir no DOM:
//   window._initStatsAnimation(rootEl);
//
// Fallback (sem IntersectionObserver): seta valores finais imediatamente.
//
// v1.0.38-beta: 3 melhorias acumuladas:
//   1. Safety net via setTimeout 1.5s — força animação em qualquer elemento
//      que o IntersectionObserver não tenha disparado até lá (resolve
//      "números ficaram zerados" reportado pós-v1.0.37). Idempotente via
//      flag el._statAnimated.
//   2. Stagger row-by-row — feedback do user: "delay entre cada linha de
//      estatistica para que não carreguem ao mesmo tempo. conforme está
//      chegando ao final da primeira linha começa a carregar a segunda".
//      Linhas detectadas via getBoundingClientRect (Y-position grouping,
//      tolerância 25px). Cada linha começa 180ms depois da anterior — com
//      duração de 800ms da animação, dá overlap perceptível tipo cascata.
//   3. threshold: 0 + rootMargin -5% (mais permissivo que -8% antes).
//
// Stagger só aplica nos primeiros 1.5s da página. Elementos que entram em
// view DEPOIS (via scroll do user) animam imediatamente — sem cascata
// fora do contexto inicial.
window._initStatsAnimation = function(rootEl) {
    rootEl = rootEl || document;
    var bars = rootEl.querySelectorAll('[data-stat-bar]');
    var counts = rootEl.querySelectorAll('[data-stat-count]');
    if (!bars.length && !counts.length) return;

    // Computa índice da linha (0-based, top-down) pra cada elemento via Y.
    var _rowIdxOf = (function() {
        var allEls = [];
        Array.prototype.forEach.call(bars, function(el) { allEls.push(el); });
        Array.prototype.forEach.call(counts, function(el) { allEls.push(el); });
        if (!allEls.length) return function() { return 0; };
        var withY = allEls.map(function(el) {
            return { el: el, y: el.getBoundingClientRect().top };
        }).sort(function(a, b) { return a.y - b.y; });
        var rowMap = new WeakMap();
        var rowIdx = 0;
        var lastY = -Infinity;
        withY.forEach(function(item) {
            if (Math.abs(item.y - lastY) > 25) {
                if (lastY !== -Infinity) rowIdx++;
                lastY = item.y;
            }
            rowMap.set(item.el, rowIdx);
        });
        return function(el) {
            var idx = rowMap.get(el);
            return (idx == null) ? 0 : idx;
        };
    })();

    var initTime = (performance && performance.now) ? performance.now() : Date.now();
    var staggerWindow = 1500; // ms — após esse tempo, animações disparam imediato (sem stagger)
    var staggerStep = 180;    // ms entre o início de uma linha e a próxima

    var _delayFor = function(el) {
        var elapsed = ((performance && performance.now) ? performance.now() : Date.now()) - initTime;
        if (elapsed > staggerWindow) return 0;
        return _rowIdxOf(el) * staggerStep;
    };

    var animateCount = function(el) {
        if (el._statAnimated) return;
        el._statAnimated = true;
        var rawTarget = el.getAttribute('data-stat-count');
        var targetN = parseFloat(rawTarget);
        if (isNaN(targetN)) targetN = 0;
        var suffix = el.getAttribute('data-stat-count-suffix') || '';
        var prefix = el.getAttribute('data-stat-count-prefix') || '';
        var duration = 800;
        var isInt = (targetN === Math.floor(targetN));
        var run = function() {
            var startedAt = null;
            var step = function(now) {
                if (startedAt === null) startedAt = now;
                var elapsed = now - startedAt;
                var t = Math.min(1, elapsed / duration);
                var eased = 1 - Math.pow(1 - t, 3);
                var v = targetN * eased;
                var display = isInt ? Math.round(v) : (Math.round(v * 10) / 10);
                el.textContent = prefix + display + suffix;
                if (t < 1) requestAnimationFrame(step);
                else el.textContent = prefix + targetN + suffix; // exact final
            };
            requestAnimationFrame(step);
        };
        var d = _delayFor(el);
        if (d > 0) setTimeout(run, d); else run();
    };

    var animateBar = function(el) {
        if (el._statAnimated) return;
        el._statAnimated = true;
        var target = parseFloat(el.getAttribute('data-stat-bar')) || 0;
        var run = function() {
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    el.style.width = target + '%';
                });
            });
        };
        var d = _delayFor(el);
        if (d > 0) setTimeout(run, d); else run();
    };

    var triggerAll = function() {
        Array.prototype.forEach.call(bars, animateBar);
        Array.prototype.forEach.call(counts, animateCount);
    };

    // Fallback pra browsers sem IntersectionObserver — anima tudo já (com stagger).
    if (!('IntersectionObserver' in window)) {
        triggerAll();
        return;
    }

    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (!entry.isIntersecting) return;
            var el = entry.target;
            observer.unobserve(el);
            if (el.hasAttribute('data-stat-bar')) animateBar(el);
            if (el.hasAttribute('data-stat-count')) animateCount(el);
        });
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0 });

    Array.prototype.forEach.call(bars, function(el) { observer.observe(el); });
    Array.prototype.forEach.call(counts, function(el) { observer.observe(el); });

    // Safety net — depois de 1.5s, força animação em qualquer elemento
    // que o IntersectionObserver não tenha disparado (scroll containment,
    // off-screen, edge cases). Idempotente via flag _statAnimated.
    setTimeout(triggerAll, 1500);
};
// border-radius do logo do torneio, derivado de t.logoShape ('square'|'circle')
// + t.logoRadius (0-50 %, só pra square). Default 14% (visual atual). Usado em
// todos os lugares que renderizam o logo: dashboard, cards, detalhe, impressão.
window._tournamentLogoRadius = function(t) {
    if (!t) return '14%';
    if (t.logoShape === 'circle') return '50%';
    var r = (t.logoRadius != null && t.logoRadius !== '') ? Number(t.logoRadius) : 14;
    if (isNaN(r)) r = 14;
    return Math.max(0, Math.min(50, r)) + '%';
};
// v2.6.43: "read box" (tarja de leitura sobre a foto do local) é THEME-AWARE.
// Convenção dos dois lados (ver memória feedback_dark_tarja_light_text):
//   - tema ESCURO (Noturno/Oceano)  → box CLARO + texto ESCURO  (igual .stat-box)
//   - tema CLARO  (Claro/Sunset)    → box ESCURO + texto CLARO  (lógica invertida)
// Mantém legibilidade sobre a foto em qualquer tema sem forçar box escuro no escuro.
window._photoReadBox = function () {
    var th = (document.documentElement.getAttribute('data-theme') || 'dark');
    var light = (th === 'light'); // v2.7.21: só 2 temas (dark/light); sunset/ocean removidos
    // v2.7.20: TEMA ESCURO → tarja MAIS ESCURA que o fundo (scrim preto sobre o
    // bg, indo pro preto sem ser preto absoluto) + fonte CLARA (não branca pura).
    // Antes o escuro usava bg CLARO (226,232,240) → "brilho agressivo" sobre o
    // fundo escuro (pedido do dono). Tema CLARO INTOCADO. Consistente em
    // dashboard, detalhe e utils (todos chamam este helper).
    return light
        ? { bg: 'rgba(30,41,59,0.72)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' }
        : { bg: 'rgba(0,0,0,0.40)', fg: '#e2e8f0', border: 'rgba(255,255,255,0.10)' };
};

// v2.7.86: MODO COMPACTO no arrastar-soltar (mesclar / formar dupla / co-organizador).
// Enquanto arrasta, os outros cards encolhem pra SÓ O NOME (sem cortes) numa grade de
// 2-3 colunas → distância de drop bem menor. Soltou (qualquer dragend), volta ao normal.
// O nome aparece via CSS `content: attr(data-participant-name)`, então não precisa mexer
// no conteúdo dos cards. Liga-se nos dragstart; o desliga é GLOBAL (listener no document),
// pra nunca ficar preso mesmo que o card seja re-renderizado no drop.
window._setDragCompact = function (on) {
  try {
    var b = document.body; if (!b) return;
    // Só liga/desliga a classe do BODY — os containers de cards já têm a classe
    // permanente `.sp-dnd-host` (no HTML do renderizador), então sobrevive a um
    // re-render no meio do arraste. CSS: `body.sp-drag-compact .sp-dnd-host`.
    if (on) b.classList.add('sp-drag-compact'); else b.classList.remove('sp-drag-compact');
    if (on) {
      // v2.7.88: centraliza a SEÇÃO dos cards na tela quando eles encolhem — assim a
      // grade compacta fica no meio do viewport e o trajeto de drop é mínimo. Centra a
      // .sp-dnd-host do card que está sendo arrastado (ou a 1ª disponível).
      var _srcCard = document.querySelector('.sp-drag-source');
      var _host = (_srcCard && _srcCard.closest) ? _srcCard.closest('.sp-dnd-host') : null;
      if (!_host) _host = document.querySelector('.sp-dnd-host');
      if (_host) {
        // v2.7.89: a seção é centrada ONDE O CARD FOI PEGO (clientY do dragstart) — não no
        // meio da tela. Assim a grade compacta fica embaixo do dedo. Cálculo MANUAL de scroll
        // (mais confiável que scrollIntoView). getBoundingClientRect força reflow → já mede a
        // host JÁ compacta.
        var _r = _host.getBoundingClientRect();
        var _yOff = (window.pageYOffset != null ? window.pageYOffset : (window.scrollY || 0));
        var _pickY = (typeof window._spDragPickY === 'number') ? window._spDragPickY : (window.innerHeight / 2);
        var _target = _yOff + _r.top + _r.height / 2 - _pickY;
        if (_target < 0) _target = 0;
        try { window.scrollTo({ top: _target, behavior: 'auto' }); } catch (e2) { try { window.scrollTo(0, _target); } catch (e3) {} }
      }
    }
    if (!on) {
      // v2.7.87: limpa o marcador do card que estava sendo arrastado (ele fica
      // ESCONDIDO da lista durante o drag — não pode aparecer entre os demais).
      var src = document.querySelectorAll('.sp-drag-source');
      for (var i = 0; i < src.length; i++) src[i].classList.remove('sp-drag-source');
    }
  } catch (e) {}
};
// Marca o card que está sendo arrastado (pra escondê-lo da lista durante o drag).
window._markDragSource = function (el) {
  try {
    var card = el && el.closest ? el.closest('.participant-card') : null;
    if (card) card.classList.add('sp-drag-source');
  } catch (e) {}
};
// Desliga o modo compacto em QUALQUER fim de arraste (uma vez só).
if (!window._spDragCompactWired) {
  window._spDragCompactWired = true;
  try { document.addEventListener('dragend', function () { window._setDragCompact(false); }, true); } catch (e) {}
  try { document.addEventListener('drop', function () { setTimeout(function () { window._setDragCompact(false); }, 0); }, true); } catch (e) {}
  // v2.8.42: ativação GLOBAL da estrela de co-organização ao iniciar QUALQUER
  // arraste de card de inscrito — independente de qual dragstart inline rodou
  // (_mergeDragStart / handleDragStart / _duplaDragStart) ou se o try/catch dele
  // falhou. Era o motivo de "a estrela não se transforma com frequência": os
  // caminhos divergiam e nem todos chamavam _setOrgDropActive(true). Captura +
  // re-assert no setTimeout (sobrevive a re-render/compact no meio do dragstart).
  try {
    document.addEventListener('dragstart', function (e) {
      try {
        var card = e && e.target && e.target.closest ? (e.target.closest('.participant-card') || e.target.closest('[draggable="true"]')) : null;
        if (!card) return;
        if (typeof window._setOrgDropActive === 'function' && document.querySelector('.sp-org-droptarget')) {
          window._setOrgDropActive(true);
          setTimeout(function () { try { if (document.querySelector('.sp-org-droptarget')) window._setOrgDropActive(true); } catch (e2) {} }, 30);
        }
      } catch (e1) {}
    }, true);
    document.addEventListener('dragend', function () { try { if (typeof window._setOrgDropActive === 'function') window._setOrgDropActive(false); window._participantDragData = null; } catch (e) {} }, true);
  } catch (e) {}
}
// v2.6.60: CONFIG POR FASE — resolve woScope / resultEntry da FASE de um match
// (multifase), com FALLBACK pro top-level (= fase 0 / default). Single-phase ou
// match sem phaseIndex → sempre o top-level (comportamento idêntico ao de sempre).
// Match multifase é tagueado com m.phaseIndex; t.phases[i] guarda o override.
window._effectiveWoScope = function(t, match) {
    var def = (t && t.woScope) || 'individual';
    if (!t || !Array.isArray(t.phases) || t.phases.length <= 1 || !match) return def;
    var ph = t.phases[match.phaseIndex || 0];
    return (ph && ph.woScope) ? ph.woScope : def;
};
window._effectiveResultEntry = function(t, match) {
    var def = (t && t.resultEntry) || 'organizer';
    if (!t || !Array.isArray(t.phases) || t.phases.length <= 1 || !match) return def;
    var ph = t.phases[match.phaseIndex || 0];
    return (ph && ph.resultEntry != null) ? ph.resultEntry : def;
};
// v2.6.96 — placar (GSM) EFETIVO de um match no construtor de fases. Só diverge
// do placar do torneio (t.scoring) quando o match é de uma fase ≥1 que tem placar
// "Personalizado" (ph.scoring com type). Fase 0 e torneios de fase única usam
// SEMPRE t.scoring — garantia de compat com tudo que já existe.
window._effectiveScoring = function(t, match) {
    var def = (t && t.scoring) || null;
    var pi = (match && match.phaseIndex) || 0;
    if (!t || pi < 1 || !Array.isArray(t.phases) || pi >= t.phases.length) return def;
    var ph = t.phases[pi];
    return (ph && ph.scoring != null && ph.scoring.type) ? ph.scoring : def;
};
// v3.1.16 (inc 8) — Pontos Avançados EFETIVO por fase. Overlay canônico ORTOGONAL ao
// storage: a fase (phases[idx].advancedScoring, shape {enabled,categories,applyLiveScoring})
// SOBREPÕE o top-level (t.advancedScoring) — inclusive quando a fase o desliga
// (enabled:false). Fase 0 / single-phase / fase sem config própria → herda o top-level.
// É o que faz "Pontos Avançados numa fase e simples noutra" CALCULAR de verdade nas
// standings (renderStandings/_computeStandings leem advancedScoring do faux-t da fase).
window._effectiveAdvScoring = function(t, phaseIndex) {
    var def = (t && t.advancedScoring) || null;
    var pi = phaseIndex || 0;
    if (!t || pi < 1 || !Array.isArray(t.phases) || pi >= t.phases.length) return def;
    var ph = t.phases[pi];
    return (ph && ph.advancedScoring && typeof ph.advancedScoring === 'object') ? ph.advancedScoring : def;
};
// v2.6.108: barra CANÔNICA de busca + ordenação + filtros (gênero/habilidade) pra
// listas de inscritos. UI idêntica à Análise de Inscritos — uma fonte só, reusável.
// opts: { searchId, sortId, genderId, skillId, onChange, skillCategories[], sort, gender, skill, search }
// Mapeamento canônico: sort = order-asc|order-desc|name-asc|name-desc;
// gênero = all|Masc|Fem|Misto|none; habilidade = all|<cat>|none.
// v2.7.31: barra de filtro/sort ENXUTA e CANÔNICA — controles de ícone em vez de
// dropdowns. A-Z com ↑/↓ (alfabético cresc/decr), 🕐 com ↑/↓ (cronológico cresc/decr),
// botão de gênero cíclico (⚥ ambos → ♂ → ♀ → – sem gênero) e botão de habilidade
// cíclico (– todas → A/B/C/D/FUN → ⊘ sem habilidade). Estado por `stateKey` em
// _filterBarState (persiste entre re-renders); inputs OCULTOS com os mesmos IDs
// (sortId/genderId/skillId) mantêm os leitores (_partApplyFilter/_erRenderInscritos)
// funcionando sem mudança. Vale pra TODOS que usam _inscritosFilterBar.
window._filterBarState = window._filterBarState || {};
window._filterBarCfg = window._filterBarCfg || {};
// Aplica uma escolha: grava no store + espelha no input oculto + re-renderiza os
// botões (refletir estado) + dispara o onChange do consumidor.
window._fbAction = function (key, field, val, noRerender) {
    var st = window._filterBarState[key] || (window._filterBarState[key] = {});
    st[field] = val;
    var opts = window._filterBarCfg[key] || {};
    var idMap = { sort: opts.sortId, gender: opts.genderId, skill: opts.skillId, sport: opts.sportId, search: opts.searchId };
    var el = idMap[field] && document.getElementById(idMap[field]);
    if (el && el.value !== val) el.value = val;
    if (!noRerender) {
        var wrap = document.getElementById('fbwrap-' + key);
        if (wrap) wrap.innerHTML = window._fbInner(key);
    }
    if (opts.onChange) { try { (new Function(opts.onChange))(); } catch (e) {} }
};
// v2.7.33 (Opção 1): pílula de sort por critério — clicar a ATIVA inverte a seta
// (cresc↔decr); clicar a inativa ativa-a com a direção lembrada (st.nameDir/orderDir).
window._fbSortPill = function (key, dim) {
    var st = window._filterBarState[key] || (window._filterBarState[key] = {});
    var cur = st.sort || 'order-asc';
    var curDim = cur.indexOf('name') === 0 ? 'name' : 'order';
    var curDir = cur.indexOf('-desc') >= 0 ? 'desc' : 'asc';
    var nd = (curDim === dim) ? (curDir === 'asc' ? 'desc' : 'asc') : (st[dim + 'Dir'] || 'asc');
    st[dim + 'Dir'] = nd;
    window._fbAction(key, 'sort', dim + '-' + nd);
};
window._fbInner = function (key) {
    var opts = window._filterBarCfg[key] || {};
    var st = window._filterBarState[key] || (window._filterBarState[key] = {});
    var esc = window._safeHtml || function (s) { return s == null ? '' : String(s); };
    var sort = st.sort || opts.sort || 'order-asc';
    var gender = st.gender || opts.gender || 'all';
    var skill = st.skill || opts.skill || 'all';
    var search = (st.search != null ? st.search : (opts.search || ''));
    st.sort = sort; st.gender = gender; st.skill = skill; st.search = search;
    // pílula genérica: cor própria quando "active"; neutra (cinza) quando off.
    function pill(active, c, inner, onclick, title, extra) {
        var bg = active ? c.bg : 'rgba(255,255,255,0.05)';
        var bd = active ? c.bd : 'rgba(255,255,255,0.14)';
        var fg = active ? c.fg : 'var(--text-muted)';
        return '<button type="button" title="' + title + '" onclick="' + onclick + '" style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;height:44px;min-height:44px;min-width:44px;padding:0 10px;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:800;line-height:1;background:' + bg + ';border:1px solid ' + bd + ';color:' + fg + ';transition:all 0.15s;box-sizing:border-box;' + (extra || '') + '">' + inner + '</button>';
    }
    var IND = { bg: 'rgba(99,102,241,0.30)', bd: 'rgba(99,102,241,0.85)', fg: '#c7d2fe' };
    var RED = { bg: 'rgba(248,113,113,0.18)', bd: 'rgba(248,113,113,0.6)', fg: '#f87171' };
    var GREEN = { bg: 'rgba(52,211,153,0.20)', bd: 'rgba(52,211,153,0.7)', fg: '#6ee7b7' };
    var BLUE = { bg: 'rgba(96,165,250,0.22)', bd: 'rgba(96,165,250,0.7)', fg: '#93c5fd' };
    var PINK = { bg: 'rgba(244,114,182,0.22)', bd: 'rgba(244,114,182,0.7)', fg: '#f9a8d4' };
    // SORT (Opção 1): A-Z e 🕒, cada um uma pílula; ativo indigo + seta da direção.
    var curDim = sort.indexOf('name') === 0 ? 'name' : 'order';
    var curDir = sort.indexOf('-desc') >= 0 ? 'desc' : 'asc';
    if (!st.nameDir) st.nameDir = (curDim === 'name') ? curDir : 'asc';
    if (!st.orderDir) st.orderDir = (curDim === 'order') ? curDir : 'asc';
    var nameActive = curDim === 'name', orderActive = curDim === 'order';
    var nameDir = nameActive ? curDir : st.nameDir;
    var orderDir = orderActive ? curDir : st.orderDir;
    function ar(d) { return '<span style="font-size:0.95rem;margin-left:1px;">' + (d === 'desc' ? '↓' : '↑') + '</span>'; }
    var azPill = pill(nameActive, IND, 'A-Z' + ar(nameDir), "window._fbSortPill('" + key + "','name')",
        'Ordem alfabética ' + (nameDir === 'desc' ? '(Z→A)' : '(A→Z)') + ' — clique p/ inverter', 'min-width:auto;');
    var clockPill = pill(orderActive, IND, '🕒' + ar(orderDir), "window._fbSortPill('" + key + "','order')",
        'Ordem de inscrição ' + (orderDir === 'desc' ? '(mais recentes 1º)' : '(mais antigos 1º)') + ' — clique p/ inverter', 'min-width:auto;');
    // GÊNERO cíclico: ⚥ ambos(verde) → ♂ masc(azul) → ♀ fem(rosa) → 🚫 sem gênero(vermelho)
    var gOrder = ['all', 'Masc', 'Fem', 'none'];
    var gMap = {
        all:  { sym: '⚥',  t: 'Ambos os gêneros', c: GREEN },
        Masc: { sym: '♂',  t: 'Masculino',        c: BLUE },
        Fem:  { sym: '♀',  t: 'Feminino',         c: PINK },
        none: { sym: '🚫', t: 'Sem gênero',       c: RED }
    };
    var gCur = gMap[gender] ? gender : 'all';
    var gNext = gOrder[(gOrder.indexOf(gCur) + 1) % gOrder.length];
    var genderBtn = pill(true, gMap[gCur].c, gMap[gCur].sym, "window._fbAction('" + key + "','gender','" + gNext + "')",
        'Gênero: ' + gMap[gCur].t + ' — clique p/ alternar', 'font-size:' + (gCur === 'none' ? '0.95rem' : '1.02rem') + ';min-width:34px;');
    // TERCEIRO botão: habilidade (cards de PESSOA) OU modalidade (cards de TORNEIO).
    // v3.0.91: quando opts.mode === 'tournaments', a categoria/habilidade dá lugar a
    // um filtro CÍCLICO de modalidade (🎯 Todas → BT → Tênis → … → 🎯) — pedido do
    // usuário: "quando os cards forem de torneios e não de pessoas, modalidades
    // cíclicas no lugar de categoria".
    var modeT = opts.mode === 'tournaments';
    var thirdBtn = '';
    var sCur = 'all';      // habilidade efetiva (people)
    var spCur = 'all';     // modalidade efetiva (tournaments)
    if (modeT) {
        var sports = (opts.sportList && opts.sportList.length) ? opts.sportList.slice() : [];
        var spOrder = ['all'].concat(sports);
        spCur = (spOrder.indexOf(st.sport) >= 0) ? st.sport : 'all';
        st.sport = spCur;
        var spNext = spOrder[(spOrder.indexOf(spCur) + 1) % spOrder.length];
        var spClick = "window._fbAction('" + key + "','sport','" + String(spNext).replace(/'/g, "\\'") + "')";
        if (spCur === 'all') {
            thirdBtn = pill(true, GREEN, '🎯', spClick, 'Modalidade: Todas — clique p/ alternar', 'min-width:32px;font-size:0.95rem;');
        } else {
            var _ic = (typeof window._sportIcon === 'function') ? window._sportIcon(spCur) : '';
            thirdBtn = pill(true, IND, _ic + '<span style="margin-left:4px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(spCur) + '</span>', spClick, 'Modalidade: ' + spCur + ' — clique p/ alternar', 'min-width:auto;');
        }
    } else {
        // HABILIDADE cíclica: – todas(verde = mostra todas) → categorias(indigo) → 🚫 sem habilidade(vermelho)
        var skills = (opts.skillCategories && opts.skillCategories.length) ? opts.skillCategories : ['A', 'B', 'C', 'D', 'FUN'];
        var sOrder = ['all'].concat(skills).concat(['none']);
        sCur = (sOrder.indexOf(skill) >= 0) ? skill : 'all';
        var sNext = sOrder[(sOrder.indexOf(sCur) + 1) % sOrder.length];
        var sClick = "window._fbAction('" + key + "','skill','" + sNext + "')";
        if (sCur === 'all') thirdBtn = pill(true, GREEN, '–', sClick, 'Habilidade: Todas — clique p/ alternar', 'min-width:32px;');
        else if (sCur === 'none') thirdBtn = pill(true, RED, '🚫', sClick, 'Habilidade: Sem habilidade — clique p/ alternar', 'min-width:32px;font-size:0.95rem;');
        else thirdBtn = pill(true, IND, esc(sCur), sClick, 'Habilidade: ' + sCur + ' — clique p/ alternar', 'min-width:32px;');
    }
    // inputs ocultos lidos pelos consumidores
    var hidden = '';
    if (opts.sortId) hidden += '<input type="hidden" id="' + opts.sortId + '" value="' + sort + '">';
    // v3.0.97: modo TORNEIOS (dashboard) NÃO tem gênero — dá mais espaço pra modalidade
    // (pedido do dono). Sem botão e sem input oculto de gênero nesse modo.
    if (opts.genderId && !modeT) hidden += '<input type="hidden" id="' + opts.genderId + '" value="' + gCur + '">';
    if (opts.skillId) hidden += '<input type="hidden" id="' + opts.skillId + '" value="' + sCur + '">';
    if (opts.sportId) hidden += '<input type="hidden" id="' + opts.sportId + '" value="' + esc(spCur) + '">';
    var searchInp = '';
    if (opts.searchId) {
        var sctrl = 'box-sizing:border-box;background:var(--bg-dark,#0f1320);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:var(--text-bright);';
        // v3.0.97: MESMA altura dos botões — pedido do dono "a busca precisa ser da mesma
        // altura que os botões". As pílulas são <button>, e o CSS global força
        // min-height:44px (alvo de toque iOS) por cima do height inline → renderizam 44px.
        // Logo a busca também é 44px (height+min-height) p/ casar exatamente.
        searchInp = '<input id="' + opts.searchId + '" type="text" oninput="window._fbAction(\'' + key + '\',\'search\',this.value,true)" placeholder="🔎 Buscar…" autocomplete="off" value="' + esc(search) + '" style="' + sctrl + 'flex:1 1 64px;min-width:60px;height:44px;min-height:44px;padding:0 10px;font-size:0.8rem;">';
    }
    // v3.0.91: TUDO numa linha só (pedido do usuário) — flex-wrap:nowrap. A busca
    // (flex:1, min-width:60) absorve a sobra e encolhe em telas estreitas mantendo
    // as pílulas na mesma linha.
    return hidden
        + '<div style="display:flex;flex-wrap:nowrap;align-items:center;gap:6px;">'
        + azPill + clockPill
        + '<span style="flex:0 0 auto;width:1px;height:22px;background:rgba(255,255,255,0.12);margin:0 1px;"></span>'
        + (modeT ? '' : genderBtn) + thirdBtn + searchInp
        + '</div>';
};
window._inscritosFilterBar = function (opts) {
    opts = opts || {};
    var key = opts.stateKey || opts.sortId || 'fb';
    window._filterBarCfg[key] = opts;
    if (!window._filterBarState[key]) window._filterBarState[key] = {};
    // STICKY CANÔNICO (v3.0.91): a barra mora no FLUXO do conteúdo (NÃO mais no
    // belowHtml do back-header) e usa `position:sticky`. Rola junto com a página
    // até bater no cabeçalho; aí gruda na base dele e fica visível com os cards
    // rolando por trás. A fórmula soma topbar + dropdown do hamburger + back-header
    // (vars expostas por _reflowChrome) — em telas sem back-header (dashboard) o
    // `--backheader-h` é 0 e a fórmula colapsa pro caso da topbar sozinha.
    // (Antes a barra era fixa no belowHtml; o usuário pediu o comportamento sticky:
    // "scrolle até o topo e fixe no cabeçalho se scrollar mais".)
    var wrapStyle = '';
    if (opts.sticky) {
        // FULL-BLEED de viewport (margin:calc(50% - 50vw)) → a barra chega às bordas da
        // tela, independente do padding do .view-container (que varia por breakpoint).
        // bg = MESMA cor do cabeçalho (--bg-darker) → quando gruda, fica colada sem
        // "vão" visível. padding horizontal pequeno (10px) reaproxima os controles da
        // borda. Pedido do dono: "sem vão entre o cabeçalho e a barra" + "chegar ao
        // limite direito da tela".
        // v3.0.97: `-1px` no top (mesmo truque do back-header em _reflowChrome, bhOffset
        // = topbarH+ddH-1) pra ELIMINAR o seam subpixel — a topbar renderiza em e.g.
        // 60.5px mas --topbar-h é Math.ceil(61), então a barra grudava 0.5–1px ABAIXO,
        // vazando o fundo entre o cabeçalho e a barra. -1px sobrepõe; como a topbar tem
        // z-index maior e mesma cor, o overlap é invisível. `padding-top:2px` extra de
        // folga: a barra cobre qualquer rounding antialiased acima dos controles.
        wrapStyle = ' style="position:sticky;top:calc(var(--topbar-h,60px) + var(--hamburger-dd-h,0px) + var(--backheader-h,0px) - 1px);z-index:30;background:var(--bg-darker,#111114);margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);margin-bottom:6px;padding:9px 10px 7px;box-sizing:border-box;"';
    }
    return '<div id="fbwrap-' + key + '"' + wrapStyle + '>' + window._fbInner(key) + '</div>';
};
// v3.0.97 CANÔNICO: evita que a tela "pule" e a barra sticky saia do lugar quando um
// filtro/busca esvazia (ou encurta) a lista. Mantém um spacer invisível no FIM do
// #view-container, dimensionado pra que o documento nunca fique mais curto que
// (scrollY + viewport) → a barra continua grudada exatamente onde estava. Auto-some
// (altura 0) quando os resultados voltam e o conteúdo cresce de novo. Pedido do dono:
// "quando não há nada a mostrar não deve pular a tela e a barra sair de onde estava".
// TODO consumidor de filtro/busca in-place ou re-render deve chamar isto após aplicar.
window._stickyFilterKeepRoom = function (keepY) {
    var doc = document.scrollingElement || document.documentElement;
    if (keepY == null) keepY = doc.scrollTop;
    // CRÍTICO: position:sticky só gruda ENQUANTO o bloco-pai (containing block) está na
    // viewport. Se a lista esvazia, o pai encolhe e a barra "descola" subindo junto. Por
    // isso o spacer vai como ÚLTIMO FILHO DO PAI DA BARRA (não do #view-container) — mantém
    // o pai alto o bastante pra barra continuar grudada onde estava.
    var bar = null;
    var bars = document.querySelectorAll('[id^="fbwrap-"]');
    for (var i = 0; i < bars.length; i++) { if (getComputedStyle(bars[i]).position === 'sticky') { bar = bars[i]; break; } }
    if (!bar || !bar.parentNode) return;
    var host = bar.parentNode;
    var spacer = document.getElementById('sp-sticky-spacer');
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = 'sp-sticky-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.cssText = 'width:1px;flex:none;pointer-events:none;margin:0;padding:0;';
    }
    if (spacer.parentNode !== host || host.lastElementChild !== spacer) host.appendChild(spacer);
    spacer.style.height = '0px';
    // quanto falta pro fundo do PAI alcançar (keepY + 1 viewport) → barra fica grudada.
    var hostBottomDoc = host.getBoundingClientRect().bottom + doc.scrollTop;
    var deficit = (keepY + window.innerHeight) - hostBottomDoc;
    spacer.style.height = (deficit > 0 ? Math.ceil(deficit) : 0) + 'px';
    if (Math.abs(doc.scrollTop - keepY) > 1) doc.scrollTop = keepY;
};
// v2.6.108: normaliza o gênero do perfil/inscrito pro código canônico do filtro.
window._canonGender = function (g) {
    var s = String(g || '').trim().toLowerCase();
    if (!s) return 'none';
    if (s.indexOf('fem') === 0 || s === 'f' || s === '♀') return 'Fem';
    if (s.indexOf('masc') === 0 || s === 'm' || s === '♂') return 'Masc';
    if (s.indexOf('mist') === 0 || s.indexOf('mix') === 0) return 'Misto';
    return 'none';
};
window._qrCodeUrl = function(data, size, darkMode) {
    var s = size || 280;
    var bg = darkMode !== false ? '1a1e2e' : 'ffffff';
    var fg = darkMode !== false ? 'ffffff' : '1a1e2e';
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + s + 'x' + s + '&data=' + encodeURIComponent(data) + '&bgcolor=' + bg + '&color=' + fg + '&margin=10';
};
window._tournamentUrl = function(tournamentId) {
    return window.SCOREPLACE_URL + '/#tournaments/' + tournamentId;
};
window._whatsappShareUrl = function(text) {
    return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
};

// v0.17.9: ícone de Beach Tennis — SVG inline BICOLOR (metade laranja +
// metade amarelo-verde com seam branco), fiel à bola real (foto enviada
// pelo usuário). Pedido literal: "a bola precisa ser como a de tenis
// (com as riscas brancas), mas trocando o amarelo pelo laranja" + foto
// mostrando bolas half-orange/half-yellow. Emoji unicode não tem variante;
// SVG dá consistência visual entre plataformas. Tamanho via 1em escala
// com font-size do pai. vertical-align:-0.15em alinha com baseline de
// texto adjacente.
// v0.17.52: trocado SVG bicolor pelo emoji 🎾 com filter CSS hue-rotate
// + saturate. Pedido do usuário: usar o mesmo ícone do tênis (🎾) mas
// "com o hue puxado para o laranja". Após preview comparativo, escolhido
// hue-rotate(-50deg) saturate(1.8) — branco da seam line continua branco
// (saturação 0 não rotaciona) enquanto a base verde-amarelada vira laranja
// vibrante. Renderização consistente em iOS/Android/Windows.
// Versões anteriores (mantidas no histórico de commits): SVG bicolor com
// gomo amarelo + linha curva (v0.17.11-v0.17.51).
window._BEACH_TENNIS_ICON = '<span style="filter:hue-rotate(-50deg) saturate(1.8);display:inline-block;vertical-align:-0.15em;" aria-label="Beach Tennis">🎾</span>';

// v0.17.11: ícone Pickleball — SVG inline com bola amarela e furos visíveis
// (bola real tem 40 furos; reduzido pra 13 num grid distribuído pra que
// fiquem perceptíveis no tamanho 1em). Pedido do usuário com foto de
// referência: bola amarela perfurada característica do esporte. Substitui
// 🥒 (pepino) que era visualmente errado — ficou pelo nome "pickle"-ball
// mas não comunica o esporte. Cor base #facc15 (amarelo pickleball) e
// furos #a16207 (amber escuro pra dar profundidade).
// v0.17.22: Padel = 🥎 (softball emoji). Pedido do usuário: "vamos usar
// a bola de softball para o padel então." Após várias iterações tentando
// recolorir o 🏓 com CSS sem conseguir bola amarela, simplificamos: usa
// 🥎 que já é um ball emoji visualmente distinto de 🎾 (Tênis). Sem CSS,
// sem SVG — apenas emoji nativo. Render fica consistente em todos os OS.

// v0.17.16: SPORT ICON RESOLVER CENTRALIZADO. Substituto único pros ~10
// resolvers `_sportIcon` espalhados pelo app (venues×2, landing,
// venue-owner, presence, dashboard, tournaments, bracket-ui×2). Pedido
// do usuário após detectar regressão visual nos pills do modal-quick-create:
// "vamos centralizar no programa os icones das modalidades. veja que
// tivemos uma nova regressão."
//
// Regra cristalizada: TODA renderização de ícone de modalidade no app
// deve passar por window._sportIcon(sport). Hardcodes em template literal
// são proibidos — sempre interpolar ${window._sportIcon('Beach Tennis')}.
//
// Ordem de matching crítica:
// 1. futevôlei ANTES de qualquer "vôlei" (substring trap — "futevôlei"
//    contém "vôlei", então a ordem inversa pega o ícone errado)
// 2. tênis de mesa (nome completo) / ping pong ANTES de "tênis" genérico
// 3. beach ANTES de tennis (Beach Tennis ≠ Tênis comum)
window._sportIcon = function(sport) {
  if (!sport) return '';
  var s = String(sport).toLowerCase();
  // v0.17.18: Padel volta pra SVG (precisa de bolinha amarela, não dá com
  // CSS no emoji). Match "mesa" sozinho removido — era broad demais
  // (matchava "mesa de jogos", etc.). Só nomes completos da modalidade.
  if (s.indexOf('futvôlei') !== -1 || s.indexOf('futvolei') !== -1 || s.indexOf('futevôlei') !== -1 || s.indexOf('futevolei') !== -1) return '⚽';
  if (s.indexOf('vôlei de praia') !== -1 || s.indexOf('volei de praia') !== -1) return '🏐';
  if (s.indexOf('beach') !== -1) return window._BEACH_TENNIS_ICON || '🟠';
  if (s.indexOf('pickleball') !== -1) return '🟡';
  if (s.indexOf('padel') !== -1) return '🥎';
  if (s.indexOf('tênis de mesa') !== -1 || s.indexOf('tenis de mesa') !== -1 || s.indexOf('ping pong') !== -1) return '🏓';
  if (s.indexOf('tênis') !== -1 || s.indexOf('tenis') !== -1 || s.indexOf('tennis') !== -1) return '🎾';
  return '🏆';
};

// v0.17.5: dedup de cu.friends antes de disparar notificações pra evitar
// "várias notificações em cada evento". cu.friends pode conter o mesmo
// amigo em formatos diferentes (email legado + uid migrado) ou duplicatas
// estrangulhadas — cada entrada virava 1 notif separada. Filtra:
// - vazios/não-strings
// - emails (formato pré-v0.16.43, deveriam estar migrados; se não, ainda
//   notifica via uid quando o email não casa)
// - o próprio uid (defensiva contra auto-amizade)
// - duplicatas
window._dedupFriendsForNotify = function(friends, ownUid) {
  if (!Array.isArray(friends)) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < friends.length; i++) {
    var f = friends[i];
    if (!f || typeof f !== 'string') continue;
    if (ownUid && f === ownUid) continue;
    if (f.indexOf('@') !== -1) continue; // emails são pre-migration; uid é canônico
    if (seen[f]) continue;
    seen[f] = true;
    out.push(f);
  }
  return out;
};

// v0.17.2: helpers de string compartilhados — antes duplicados em
// presence.js e venues.js (auditoria L4.2 + L4.3).
// _initials: primeira letra do primeiro nome + primeira letra do último nome.
// Avatar fallback quando não há foto. Tolerante a nome vazio (retorna '?').
window._initials = function(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};
// _cleanVenueName: o geocoder retorna labels no formato "Nome — Endereço".
// Para a UI mostrar só o nome do venue, cortamos a partir do primeiro
// dash/em-dash/en-dash cercado por espaços. Funciona com "—", "–", " - ".
window._cleanVenueName = function(label) {
  if (!label) return '';
  var idx = String(label).search(/\s[—–-]\s/);
  return idx > 0 ? String(label).slice(0, idx).trim() : String(label).trim();
};

// ─── Beta Testers (acesso Pro completo) ─────────────────────────────────────
// Emails nesta lista recebem Pro automaticamente sem precisar de Stripe/Firestore
window.BETA_TESTERS = [
  'rstbarth@gmail.com'
];

// ─── Plano Pro ──────────────────────────────────────────────────────────────
// Verifica se o usuário logado tem plano Pro ativo
// v1.9.96: MONETIZAÇÃO PAUSADA no beta. Enquanto `false`: todos com conta têm
// acesso COMPLETO (Pro), o botão "🚀 Pro" e o modal de upgrade não aparecem, e
// ninguém recebe o selo "⭐ PRO". Objetivo: deixar todos usarem tudo pra
// entendermos o uso real antes de desenhar a cobrança. Reativar a cobrança =
// trocar esta linha para `true` (a lógica de plano abaixo volta a valer).
window._MONETIZATION_ENABLED = false;

window._isPro = function() {
  var user = window.AppStore && window.AppStore.currentUser;
  if (!user) return false;
  // Beta: monetização pausada → acesso completo (Pro) pra todos os logados.
  if (!window._MONETIZATION_ENABLED) return true;
  // Beta testers sempre têm Pro
  if (user.email && window.BETA_TESTERS.indexOf(user.email.toLowerCase()) !== -1) return true;
  if (user.plan !== 'pro') return false;
  // Checa expiração
  if (user.planExpiresAt) {
    var exp = new Date(user.planExpiresAt);
    if (exp < new Date()) return false;
  }
  return true;
};

// Limites do plano Free
window.PLAN_LIMITS = {
  FREE_MAX_TOURNAMENTS: 3,
  FREE_MAX_PARTICIPANTS: 32
};

// Verifica se pode criar mais torneios (Free: 3 ativos)
window._canCreateTournament = function() {
  if (window._isPro()) return true;
  var user = window.AppStore && window.AppStore.currentUser;
  if (!user) return false;
  var active = window.AppStore.tournaments.filter(function(t) {
    // v2.8.79: uid-primário (criador por uid; organizerEmail como fallback)
    var mine = (user.uid && t.creatorUid === user.uid) || (user.email && t.organizerEmail === user.email);
    return mine && t.status !== 'finished' && t.status !== 'cancelled';
  });
  return active.length < window.PLAN_LIMITS.FREE_MAX_TOURNAMENTS;
};

// Verifica se pode adicionar mais participantes (Free: 32 por torneio)
window._canAddParticipant = function(tournament) {
  if (window._isPro()) return true;
  var pList = Array.isArray(tournament.participants) ? tournament.participants : [];
  return pList.length < window.PLAN_LIMITS.FREE_MAX_PARTICIPANTS;
};

// Abre a página/modal de upgrade Pro
window._showUpgradeModal = function(reason) {
  // v1.9.96: monetização pausada — nenhum paywall/modal de upgrade aparece.
  // Belt+suspenders: mesmo que algum gate chame isto, vira no-op enquanto
  // _MONETIZATION_ENABLED for false.
  if (!window._MONETIZATION_ENABLED) return;
  // v1.0.59-beta: GA4 — pro_upgrade_clicked (sinal forte de monetização).
  // source = reason: tournaments | participants | logo | tv | unknown
  try {
    if (typeof window._trackProUpgradeClicked === 'function') window._trackProUpgradeClicked(reason || 'unknown');
  } catch (_e) {}
  var reasonText = '';
  if (reason === 'tournaments') reasonText = 'Você atingiu o limite de 3 torneios ativos no plano gratuito.';
  else if (reason === 'participants') reasonText = 'Você atingiu o limite de 32 participantes no plano gratuito.';
  else if (reason === 'logo') reasonText = 'Upload de logo personalizada é exclusivo do plano Pro.';
  else if (reason === 'tv') reasonText = 'Modo TV sem marca é exclusivo do plano Pro.';
  else reasonText = 'Desbloqueie todo o potencial do scoreplace.app.';

  var modal = document.getElementById('modal-upgrade');
  if (modal) { modal.style.display = 'flex'; return; }

  modal = document.createElement('div');
  modal.id = 'modal-upgrade';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100000;';
  modal.innerHTML =
    '<div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:20px;max-width:380px;width:92%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:1.2rem;text-align:center;flex-shrink:0;">' +
        '<div style="font-size:2rem;margin-bottom:0.3rem;">🚀</div>' +
        '<div style="font-size:1.2rem;font-weight:800;color:#fff;">scoreplace Pro</div>' +
        '<div style="font-size:0.82rem;color:rgba(255,255,255,0.8);margin-top:4px;">R$19,90/mês</div>' +
      '</div>' +
      '<div style="padding:1.2rem;overflow-y:auto;flex:1;">' +
        '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin-bottom:1rem;">' + reasonText + '</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1.2rem;">' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-radius:10px;">' +
            '<span style="font-size:1.1rem;">♾️</span><span style="color:var(--text-color);font-size:0.85rem;">Torneios ilimitados</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-radius:10px;">' +
            '<span style="font-size:1.1rem;">👥</span><span style="color:var(--text-color);font-size:0.85rem;">Participantes ilimitados</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-radius:10px;">' +
            '<span style="font-size:1.1rem;">🎨</span><span style="color:var(--text-color);font-size:0.85rem;">Upload de logo personalizada</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-radius:10px;">' +
            '<span style="font-size:1.1rem;">📺</span><span style="color:var(--text-color);font-size:0.85rem;">Modo TV sem marca scoreplace</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-radius:10px;">' +
            '<span style="font-size:1.1rem;">⚡</span><span style="color:var(--text-color);font-size:0.85rem;">Suporte prioritário</span></div>' +
        '</div>' +
        '<button onclick="window._startProCheckout()" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:12px;font-size:0.95rem;font-weight:700;cursor:pointer;margin-bottom:8px;transition:transform 0.2s;" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'none\'">Assinar Pro — R$19,90/mês</button>' +
        '<button onclick="document.getElementById(\'modal-upgrade\').remove()" style="width:100%;padding:8px;background:transparent;color:var(--text-muted);border:1px solid var(--border-color);border-radius:12px;font-size:0.82rem;cursor:pointer;">Agora não</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

// Inicia o checkout do Stripe para assinatura Pro
window._startProCheckout = async function() {
  var user = window.AppStore && window.AppStore.currentUser;
  if (!user || !user.uid) {
    if (typeof showNotification === 'function') showNotification(window._t('store.loginRequired'), window._t('store.loginRequiredMsg'), 'warning');
    return;
  }
  try {
    var btn = document.querySelector('#modal-upgrade button');
    if (btn) { btn.textContent = window._t('store.processing'); btn.disabled = true; }

    var resp = await fetch('https://southamerica-east1-scoreplace-app.cloudfunctions.net/createCheckoutSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.uid,
        priceId: window._STRIPE_PRICE_ID || 'price_1TGzhZIhfnsIPruFsz4plxaX'
      })
    });
    var data = await resp.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Erro ao criar sessão de pagamento');
    }
  } catch (err) {
    window._error('Checkout error:', err);
    if (typeof window._captureException === 'function') {
      window._captureException(err, { area: 'stripeCheckout', code: err && err.code });
    }
    if (typeof showNotification === 'function') showNotification(window._t('auth.error'), window._t('store.paymentError'), 'error');
    var btn2 = document.querySelector('#modal-upgrade button');
    if (btn2) { btn2.textContent = window._t('store.subscribePro'); btn2.disabled = false; }
  }
};

// Página de apoio voluntário via PIX — renderiza no view-container como página normal
window.renderSupportPage = function(container) {
  // v1.0.59-beta: GA4 — pix_support_clicked (chega na página = intenção)
  try {
    if (typeof window._trackPixSupportClicked === 'function') window._trackPixSupportClicked();
  } catch (_e) {}
  var pixKey = '51590996000173';
  var hdr = window._renderBackHeader({
    href: '#dashboard',
    label: 'Voltar',
    middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">💚 Apoie o scoreplace.app</span>'
  });
  container.innerHTML = hdr +
    '<div style="padding:1rem;text-align:center;max-width:400px;margin:0 auto;">' +
      '<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.8rem;line-height:1.5;">Contribuição voluntária — qualquer valor. Sua contribuição mantém o scoreplace.app no ar e financia novas funcionalidades!</p>' +
      '<div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:12px;padding:0.8rem;margin-bottom:0.8rem;display:flex;flex-direction:column;align-items:center;">' +
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent('00020126580014br.gov.bcb.pix0136' + pixKey + '5204000053039865802BR5925SCOREPLACE6009SAO PAULO62070503***6304') + '" alt="QR Code PIX" style="width:160px;height:160px;border-radius:8px;background:#fff;padding:6px;margin-bottom:0.6rem;" />' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">Chave PIX (CNPJ):</div>' +
        '<div style="display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap;">' +
          '<code id="pix-key-text" style="background:rgba(255,255,255,0.08);padding:6px 10px;border-radius:8px;font-size:0.85rem;color:var(--text-color);letter-spacing:0.3px;">' + pixKey + '</code>' +
          '<button onclick="navigator.clipboard.writeText(\'' + pixKey + '\').then(function(){var b=event.target;b.textContent=\'Copiado!\';setTimeout(function(){b.textContent=\'Copiar\'},2000)})" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap;">Copiar</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--text-muted);font-size:0.72rem;margin-bottom:0.8rem;">Escaneie o QR code ou copie a chave PIX no app do seu banco.</p>' +
    '</div>';
  if (typeof window._reflowChrome === 'function') window._reflowChrome();
};

// Global HTML escape utility (XSS protection)
window._safeHtml = function(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

// v2.8.36 (canonização B-2): distância great-circle em KM entre dois pontos
// (lat1,lon1)→(lat2,lon2). Fonte única — antes havia 4 cópias idênticas
// (venues/presence-geo/tournaments-organizer/arbitros), cada uma delegando agora.
window._haversineKm = function(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── v2.3.52: badges de perfil do participante (gênero · nível · faixa etária) ──
// Usados no card de inscritos — tanto na seção "Inscritos Confirmados" do detalhe
// do torneio (tournaments.js) quanto na página #participants (participants.js).
// Single source of truth pra não divergir entre as duas telas. Visível só pro
// ORGANIZADOR (dado de perfil — gênero/idade — não é exposto aos demais).
// Gênero/nível têm fallback no objeto do inscrito (capturado na inscrição); a
// faixa etária só vem do perfil (birthDate), carregada async via
// _loadParticipantProfilesByName e aplicada nos slots [data-pmeta-name].
window._partProfileByName = window._partProfileByName || {};

window._profileMetaGenderBadge = function(g) {
  if (!g) return '';
  var key = String(g).toLowerCase().trim();
  var map = {
    fem: ['♀', 'Fem', '236,72,153'], feminino: ['♀', 'Fem', '236,72,153'], f: ['♀', 'Fem', '236,72,153'],
    masc: ['♂', 'Masc', '59,130,246'], masculino: ['♂', 'Masc', '59,130,246'], m: ['♂', 'Masc', '59,130,246'],
    misto: ['⚥', 'Misto', '168,85,247'], misto_aleatorio: ['⚥', 'Misto', '168,85,247'], misto_obrigatorio: ['⚥', 'Misto', '168,85,247']
  };
  var e = map[key];
  if (!e) return '';
  return '<span style="font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:6px;background:rgba(' + e[2] + ',0.16);color:rgb(' + e[2] + ');border:1px solid rgba(' + e[2] + ',0.4);display:inline-flex;align-items:center;gap:3px;line-height:1.5;">' + e[0] + ' ' + e[1] + '</span>';
};

window._profileMetaExtractSkill = function(catStr, t) {
  if (!catStr) return '';
  var skills = (t && t.skillCategories && t.skillCategories.length) ? t.skillCategories : ['A', 'B', 'C', 'D', 'FUN'];
  var s = String(catStr).trim().toUpperCase();
  for (var i = 0; i < skills.length; i++) {
    var sk = String(skills[i]).toUpperCase();
    if (s === sk || s.endsWith(' ' + sk) || s.indexOf(sk + ' ') >= 0) return skills[i];
  }
  return '';
};

window._profileMetaSkillBadge = function(skill) {
  if (!skill) return '';
  return '<span style="font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:6px;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);line-height:1.5;">' + window._safeHtml(skill) + '</span>';
};

window._profileMetaAgeBadge = function(birthDate, t) {
  if (!birthDate) return '';
  var d = new Date(birthDate);
  if (isNaN(d.getTime())) return '';
  var now = new Date();
  var age = now.getFullYear() - d.getFullYear();
  var mm = now.getMonth() - d.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < d.getDate())) age--;
  if (!(age >= 0 && age < 150)) return '';
  var ageCats = (t && t.ageCategories && t.ageCategories.length) ? t.ageCategories : ['40+', '50+', '60+', '70+'];
  var th = ageCats.map(function(c) { var m = String(c).match(/^(\d+)\+$/); return m ? { cat: c, val: parseInt(m[1]) } : null; })
    .filter(Boolean).sort(function(a, b) { return b.val - a.val; });
  var bucket = null;
  for (var i = 0; i < th.length; i++) { if (age >= th[i].val) { bucket = th[i].cat; break; } }
  if (!bucket) return '';
  return '<span style="font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:6px;background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);line-height:1.5;">' + window._safeHtml(bucket) + '</span>';
};

// v2.4.39: tag "sem cat" na COR do eixo que está faltando (no lugar onde o badge
// daquele eixo apareceria). Verde = gênero (azul/rosa já são masc/fem), roxo =
// habilidade, amarelo = idade.
window._profileMetaSemCatTag = function(rgb) {
  return '<span style="font-size:0.6rem;font-weight:700;padding:1px 7px;border-radius:6px;background:rgba(' + rgb + ',0.12);color:rgb(' + rgb + ');border:1px dashed rgba(' + rgb + ',0.5);line-height:1.5;" title="sem categoria no perfil">sem cat</span>';
};

// Quais eixos de categoria o TORNEIO usa (pra decidir quando mostrar "sem cat").
window._profileMetaTournamentAxes = function(t) {
  var axes = { gender: false, skill: false, age: false };
  if (!t) return axes;
  var cats = (typeof window._getTournamentCategories === 'function') ? (window._getTournamentCategories(t) || []) : (t.combinedCategories || []);
  var skillRef = (t.skillCategories && t.skillCategories.length) ? t.skillCategories : ['A', 'B', 'C', 'D', 'FUN'];
  (cats || []).forEach(function(c) {
    var tk = (typeof window._categoryAxisTokens === 'function') ? window._categoryAxisTokens(c, skillRef) : null;
    if (!tk) return;
    if (tk.gender === 'fem' || tk.gender === 'masc') axes.gender = true;
    if (tk.skill) axes.skill = true;
    if (tk.age) axes.age = true;
  });
  if (!axes.gender && Array.isArray(t.genderCategories) && t.genderCategories.some(function(g) { return /fem|masc/i.test(String(g)); })) axes.gender = true;
  if (!axes.skill && Array.isArray(t.skillCategories) && t.skillCategories.length) axes.skill = true;
  if (!axes.age && Array.isArray(t.ageCategories) && t.ageCategories.length) axes.age = true;
  return axes;
};

window._profileMetaBadgesHtml = function(gender, skill, birth, prefixName, t) {
  var prefix = prefixName ? '<span style="font-size:0.6rem;color:var(--text-muted);font-weight:700;margin-right:1px;">' + window._safeHtml(prefixName) + ':</span>' : '';
  var axes = window._profileMetaTournamentAxes(t);
  // Cada eixo: o badge do perfil OU, se faltando E o torneio usa esse eixo,
  // a tag "sem cat" na cor do eixo — sempre na MESMA POSIÇÃO do badge.
  var gB = window._profileMetaGenderBadge(gender) || (axes.gender ? window._profileMetaSemCatTag('16,185,129') : '');
  var sB = window._profileMetaSkillBadge(skill) || (axes.skill ? window._profileMetaSemCatTag('99,102,241') : '');
  var aB = window._profileMetaAgeBadge(birth, t) || (axes.age ? window._profileMetaSemCatTag('245,158,11') : '');
  var badges = gB + sB + aB;
  return badges ? (prefix + badges) : '';
};

var _attrEscMeta = function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };

// Slot(s) de meta pra um inscrito (1 linha pra individual, 1 por membro em duplas).
// Visível pra TODOS os inscritos do torneio (não só o organizador) — as categorias
// (gênero · nível · idade) são informação pública da chave. O parâmetro isOrg é
// mantido por compat de assinatura, mas não gateia mais a visibilidade.
window._profileMetaSlots = function(p, pName, isTeam, t, isOrg, opts) {
  // v2.7.43: opts.inline → margin-top:0 (pra alinhar os badges com algo ao lado, ex.:
  // botão VIP na mesma linha). Sem opts → margem padrão (badges empilhados sob o nome).
  var _inline = !!(opts && opts.inline);
  var members = isTeam ? String(pName).split('/').map(function(n) { return n.trim(); }).filter(Boolean) : [pName];
  return members.map(function(mn, mi) {
    var lc = String(mn).toLowerCase();
    var fbGender = (!isTeam && p && typeof p === 'object') ? (p.gender || '') : '';
    var fbCat = (!isTeam && p && typeof p === 'object') ? (p.category || '') : '';
    var prefixName = isTeam ? String(mn).split(' ')[0] : '';
    var initial = window._profileMetaBadgesHtml(fbGender, window._profileMetaExtractSkill(fbCat, t), '', prefixName, t);
    var _mt = _inline ? '0' : (mi === 0 ? '5px' : '3px');
    return '<div class="participant-meta" data-pmeta-name="' + _attrEscMeta(lc) + '" data-pmeta-gender="' + _attrEscMeta(fbGender) + '" data-pmeta-cat="' + _attrEscMeta(fbCat) + '" data-pmeta-prefix="' + _attrEscMeta(prefixName) + '" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:' + _mt + ';">' + initial + '</div>';
  }).join('');
};

// Carrega perfis (por uid; fallback por displayName) e popula _partProfileByName por nome (lowercase).
window._loadParticipantProfilesByName = function(list) {
  if (!window.FirestoreDB || !window.FirestoreDB.db) return Promise.resolve();
  window._partProfileByName = window._partProfileByName || {};
  var db = window.FirestoreDB.db;
  var pairs = [];
  (list || []).forEach(function(p) {
    if (typeof p === 'string') { p.split(' / ').forEach(function(n) { n = n.trim(); if (n) pairs.push({ name: n, uid: '' }); }); return; }
    // v2.8.66: DUPLA ESTRUTURAL (p1Name/p2Name) — carrega os DOIS membros com seus uids,
    // mesmo quando displayName é só o p1 (duplas do aceite gravam só o p1). Sem isto, o
    // perfil do p2 nunca era carregado e o gênero/categoria dele não aparecia no card.
    if (p.p1Name && p.p2Name) {
      pairs.push({ name: String(p.p1Name).trim(), uid: p.p1Uid || p.uid || '' });
      pairs.push({ name: String(p.p2Name).trim(), uid: p.p2Uid || '' });
      return;
    }
    var dn = (p.displayName || p.name || '');
    var membersN = dn.split(' / ').map(function(n) { return n.trim(); }).filter(Boolean);
    if (membersN.length <= 1) {
      pairs.push({ name: membersN[0] || dn, uid: p.uid || '' });
    } else {
      pairs.push({ name: membersN[0], uid: p.p1Uid || p.uid || '' });
      pairs.push({ name: membersN[1], uid: p.p2Uid || '' });
      for (var k = 2; k < membersN.length; k++) pairs.push({ name: membersN[k], uid: '' });
    }
  });
  var proms = [];
  pairs.forEach(function(pr) {
    if (!pr.name) return;
    var lc = pr.name.toLowerCase();
    if (window._partProfileByName[lc]) return;
    var q = pr.uid
      ? db.collection('users').doc(pr.uid).get().then(function(doc) { return doc.exists ? doc.data() : null; })
      : db.collection('users').where('displayName', '==', pr.name).limit(1).get().then(function(snap) { return snap.empty ? null : snap.docs[0].data(); });
    proms.push(q.then(function(d) { if (d) window._partProfileByName[lc] = d; }).catch(function() {}));
  });
  return Promise.all(proms);
};

// Patch dos slots [data-pmeta-name] dentro de container após o perfil carregar.
window._patchProfileMetaSlots = function(container, t) {
  if (!container) return;
  var slots = container.querySelectorAll('[data-pmeta-name]');
  var touchedFilter = false;
  slots.forEach(function(slot) {
    var nm = slot.getAttribute('data-pmeta-name') || '';
    var prof = (window._partProfileByName && window._partProfileByName[nm]) || null;
    var fbGender = slot.getAttribute('data-pmeta-gender') || '';
    var fbCat = slot.getAttribute('data-pmeta-cat') || '';
    var prefixName = slot.getAttribute('data-pmeta-prefix') || '';
    var gender = (prof && prof.gender) || fbGender;
    var skillRaw = (prof && prof.skillBySport && t && t.sport && prof.skillBySport[t.sport]) || '';
    var skill = window._profileMetaExtractSkill(skillRaw, t) || window._profileMetaExtractSkill(fbCat, t);
    var birth = (prof && prof.birthDate) || '';
    slot.innerHTML = window._profileMetaBadgesHtml(gender, skill, birth, prefixName, t);
    // v2.7.35: o PERFIL é a fonte da verdade e propaga PRA TUDO — aqui pro filtro/sort.
    // O badge usa profile.skillBySport[sport]/gender; o card carregava data-part-skill/
    // gender de p.category/p.gender (muitas vezes vazios) → "sem habilidade"/"sem gênero"
    // errado. Agora o card herda o MESMO valor efetivo do badge. (Sem isso, quem tem
    // skill só no perfil caía no 🚫.) Slot single-membro (individual) → 1 card.
    var card = (slot.closest && !(/\s\/\s/.test(slot.getAttribute('data-pmeta-prefix') || ''))) ? slot.closest('[data-part-card]') : null;
    if (card && !slot.getAttribute('data-pmeta-prefix')) {
      var cg = (typeof window._canonGender === 'function') ? window._canonGender(gender) : (gender || 'none');
      card.setAttribute('data-part-gender', cg || 'none');
      card.setAttribute('data-part-skill', skill || 'none');
      touchedFilter = true;
    }
  });
  // Re-aplica o filtro/sort SÓ na página de Inscritos (onde existe a barra canônica),
  // pra refletir os data-part-* recém-herdados do perfil. Guard: input oculto part-sort.
  if (touchedFilter && document.getElementById('part-sort') && typeof window._partApplyFilter === 'function') {
    try { window._partApplyFilter(); } catch (e) {}
  }
};

// v2.8.68: auto-fit de nomes que devem caber em até 2 linhas dentro de uma altura fixa
// (ex.: nome do jogador no card de dupla, limitado à altura do avatar). Em vez de
// truncar com "…", REDUZ a fonte até o texto caber (scrollHeight <= max-height). Cada
// elemento `.sp-fit-name` traz data-fit-h (altura px, default 28) e data-fit-max (fonte
// px inicial, default 13.5). Marca data-fit-done pra não reprocessar.
window._fitTwoLineNames = function(root) {
  try {
    var scope = (root && root.querySelectorAll) ? root : document;
    var els = scope.querySelectorAll('.sp-fit-name:not([data-fit-done])');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.setAttribute('data-fit-done', '1');
      var maxH = parseFloat(el.getAttribute('data-fit-h') || '28');
      var fs = parseFloat(el.getAttribute('data-fit-max') || '13.5');
      var minFs = 9, guard = 0;
      el.style.fontSize = fs + 'px';
      while (el.scrollHeight > maxH + 0.5 && fs > minFs && guard < 40) { fs -= 0.5; el.style.fontSize = fs + 'px'; guard++; }
    }
  } catch (e) {}
};
// Observer único: ao mudar o DOM, agenda um fit (debounce via rAF). O filtro
// :not([data-fit-done]) torna o passo barato quando não há nomes novos.
(function() {
  if (window._fitNamesObserverInstalled || typeof MutationObserver === 'undefined') return;
  window._fitNamesObserverInstalled = true;
  var pending = false;
  function _run() { pending = false; if (typeof window._fitTwoLineNames === 'function') window._fitTwoLineNames(document); }
  function _schedule() { if (pending) return; pending = true; (window.requestAnimationFrame || function(f){ setTimeout(f, 16); })(_run); }
  try {
    var start = function() {
      var target = document.getElementById('view-container') || document.body;
      if (!target) { setTimeout(start, 300); return; }
      new MutationObserver(_schedule).observe(target, { childList: true, subtree: true });
      _schedule();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  } catch (e) {}
})();

// Replace button content with a spinner to indicate command received (enroll/unenroll etc).
// Caller passes `this` from the onclick. Normally the view re-renders and the button is replaced;
// a safety timeout restores the original content in case the flow is aborted (confirm cancel, etc).
window._spinButton = function(btn, label) {
  if (!btn || btn.getAttribute('data-spinning') === '1') return;
  var original = btn.innerHTML;
  btn.setAttribute('data-spinning', '1');
  btn.disabled = true;
  var txt = label || '';
  btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>' + (txt ? window._safeHtml(txt) : '');
  setTimeout(function() {
    if (btn && btn.getAttribute('data-spinning') === '1' && document.body.contains(btn)) {
      btn.innerHTML = original;
      btn.disabled = false;
      btn.removeAttribute('data-spinning');
    }
  }, 8000);
};

// Auto-close tournaments whose registration deadline has passed
// Runs once on app load — checks all tournaments and closes expired ones
window._autoCloseExpiredEnrollments = function() {
  if (!window.AppStore || !window.AppStore.tournaments) return;
  var now = new Date();
  window.AppStore.tournaments.forEach(function(t) {
    if (!t.registrationLimit) return;
    if (t.status === 'closed' || t.status === 'finished') return;
    // Skip if draw already done
    var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
                  (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                  (Array.isArray(t.groups) && t.groups.length > 0);
    if (hasDraw) return;
    // Skip Liga with open enrollment. v2.4.17: !== false (aberta por default) —
    // antes era truthy, então uma Liga com ligaOpenEnrollment undefined era
    // auto-fechada quando o prazo passava, mesmo sendo conceitualmente aberta.
    var isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking');
    if (isLiga && t.ligaOpenEnrollment !== false) return;
    // Check if deadline passed
    if (new Date(t.registrationLimit) < now) {
      t.status = 'closed';
      // Só o organizador persiste — salva objeto completo para não limpar
      // adminEmails/memberEmails (bug v1.6.66 corrigido em v1.6.67).
      var cu = window.AppStore.currentUser;
      if (cu && window.AppStore.isOrganizer(t)) { // v2.8.79: uid-primário (co-host com email '')
        if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
          window.FirestoreDB.saveTournament(t).catch(function() {});
        }
      }
    }
  });
};

// v1.6.68-beta: recupera torneios com adminEmails/memberEmails apagados pelo
// bug v1.6.66. Roda silenciosamente uma vez por sessão após o primeiro snapshot.
// Usa regra Firestore isAdminEmailsRecovery (escrita restrita a esses 2 campos).
window._recoverWipedAdminEmails = function() {
  if (!window.AppStore || !window.AppStore.tournaments) return;
  if (!window.FirestoreDB || !window.FirestoreDB.db) return;
  var cu = window.AppStore.currentUser;
  if (!cu || !cu.email) return;
  var myEmail = cu.email.toLowerCase();

  window.AppStore.tournaments.forEach(function(t) {
    // Só age quando adminEmails está ausente ou vazio E o usuário é o organizador
    var adminList = Array.isArray(t.adminEmails) ? t.adminEmails : [];
    if (adminList.length > 0) return; // já está OK
    var orgEmail = (t.organizerEmail || t.creatorEmail || '').toLowerCase();
    if (orgEmail !== myEmail) return; // só o dono recupera

    // Recomputa usando os mesmos helpers de firebase-db.js
    var newAdminEmails = window.FirestoreDB._computeAdminEmails(t);
    var newMemberEmails = window.FirestoreDB._computeMemberEmails(t);

    // Escrita cirúrgica — só adminEmails e memberEmails (Firestore rule permite)
    window.FirestoreDB.db.collection('tournaments').doc(String(t.id))
      .update({ adminEmails: newAdminEmails, memberEmails: newMemberEmails })
      .then(function() {
        // Atualiza AppStore em memória para que a sessão atual funcione
        t.adminEmails = newAdminEmails;
        t.memberEmails = newMemberEmails;
        window._log('[Recovery v1.6.68] restaurado adminEmails para torneio', t.id,
          '→', newAdminEmails);
      })
      .catch(function(e) {
        window._warn('[Recovery v1.6.68] falhou para torneio', t.id, e);
      });
  });
};

// ─── Temas: SÓ 2 — escuro ↔ claro (v2.6.27, simplificado) ───────────────────
window._themeOrder = ['dark', 'light'];
window._themeIcons = { dark: '🌙', light: '☀️' };
window._themeNames = { dark: 'Noturno', light: 'Claro' };

// ─── Tamanho da interface (v2.1.91) ─────────────────────────────────────────
// --ui-scale multiplica o font-size da raiz (html), que é a base de quase todo
// o app (rem). Escala TUDO junto e proporcionalmente. Padrão 1 = aparência de
// hoje. Persiste em localStorage (instantâneo) + perfil (cross-device).
window._UI_SCALE_MIN = 0.8;
window._UI_SCALE_MAX = 1.3;
window._clampUiScale = function(v) {
  v = parseFloat(v);
  if (isNaN(v)) return 1;
  return Math.max(window._UI_SCALE_MIN, Math.min(window._UI_SCALE_MAX, v));
};
window._getUiScale = function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (cu && cu.uiScale != null) return window._clampUiScale(cu.uiScale);
  try { var raw = localStorage.getItem('scoreplace_ui_scale'); if (raw != null) return window._clampUiScale(raw); } catch (e) {}
  return 1;
};
// Aplica ao vivo (só o CSS var) — sem persistir. Pra preview do slider.
window._applyUiScale = function(scale) {
  var s = window._clampUiScale(scale);
  try { document.documentElement.style.setProperty('--ui-scale', s); } catch (e) {}
  return s;
};
// Aplica + persiste (localStorage + currentUser + Firestore).
window._setUiScale = function(scale) {
  var s = window._applyUiScale(scale);
  try { localStorage.setItem('scoreplace_ui_scale', String(s)); } catch (e) {}
  var cu = window.AppStore && window.AppStore.currentUser;
  if (cu) cu.uiScale = s;
  try {
    var uid = cu && (cu.uid || cu.email);
    if (uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
      window.FirestoreDB.saveUserProfile(uid, { uiScale: s }).catch(function() {});
    }
  } catch (e) {}
  return s;
};

window._toggleTheme = function() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme') || 'dark';
  var order = window._themeOrder;
  var idx = order.indexOf(current);
  var next = order[(idx + 1) % order.length];
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('scoreplace_theme', next); } catch (e) {}
  window._applyThemeIcon(next);
  // Sync theme to Firestore so other devices pick it up
  try {
    var cu = window.AppStore && window.AppStore.currentUser;
    var uid = cu && (cu.uid || cu.email);
    if (uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
      window.FirestoreDB.saveUserProfile(uid, { theme: next }).catch(function() {});
    }
  } catch (e) {}
};

window._applyThemeIcon = function(theme) {
  // The hamburger dropdown clones topbar nodes, producing a second element
  // with id="theme-toggle-btn". getElementById returns only the first, so we
  // use querySelectorAll to update every live copy.
  var btns = document.querySelectorAll('#theme-toggle-btn');
  if (!btns || !btns.length) return;
  var icon = window._themeIcons[theme] || '🌙';
  var name = window._themeNames[theme] || theme;
  for (var i = 0; i < btns.length; i++) {
    btns[i].textContent = icon;
    btns[i].title = 'Tema: ' + name + ' (clique para trocar)';
  }
};

// Apply saved theme on load
(function() {
  try {
    var saved = localStorage.getItem('scoreplace_theme');
    var valid = window._themeOrder;
    if (saved && valid.indexOf(saved) !== -1) {
      document.documentElement.setAttribute('data-theme', saved);
      var _applyIcon = function() { window._applyThemeIcon(saved); };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _applyIcon);
      } else {
        _applyIcon();
      }
    }
  } catch (e) {}
})();

// ─── Favoritos (localStorage) ────────────────────────────────────────────────
// Favoritos — v2.6.50: re-chaveado por UID (identidade estável). Antes a chave era
// só `scoreplace_favorites_<email>`; como o email NÃO é estável (zerado p/ contas
// sintéticas em auth.js, ausente em re-render pré-auth, mudável), a chave trocava e
// o favorito "sumia". Agora: leitura em UNIÃO de [uid-key, email-key, legado] —
// acha o favorito independente de qual identidade está presente; escrita nas chaves
// de identidade (uid + email) — migra sozinho e remoção fica consistente.
window._favReadKeys = function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  var keys = [];
  if (cu && cu.uid) keys.push('scoreplace_favorites_uid_' + cu.uid);
  if (cu && cu.email) keys.push('scoreplace_favorites_' + cu.email);
  if (keys.length === 0) keys.push('scoreplace_favorites'); // deslogado / pré-auth
  return keys;
};
window._favWriteKeys = function() {
  // mesmas chaves da leitura (de identidade quando logado) — escreve a lista
  // unificada em todas, então a remoção "pega" em qualquer caminho.
  return window._favReadKeys();
};

window._getFavorites = function() {
  try {
    var set = {};
    window._favReadKeys().forEach(function(k) {
      try { var raw = localStorage.getItem(k); if (raw) JSON.parse(raw).forEach(function(id){ set[String(id)] = 1; }); } catch (e) {}
    });
    return Object.keys(set);
  } catch (e) { return []; }
};

window._isFavorite = function(tId) {
  var favs = window._getFavorites();
  return favs.indexOf(String(tId)) !== -1;
};

window._toggleFavorite = function(tId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var favs = window._getFavorites();
  var id = String(tId);
  var idx = favs.indexOf(id);
  var nowFav = (idx === -1);
  if (nowFav) { favs.push(id); } else { favs.splice(idx, 1); }
  var payload = JSON.stringify(favs);
  window._favWriteKeys().forEach(function(k) { try { localStorage.setItem(k, payload); } catch (e) {} });
  // Update heart icons on the page
  var stars = document.querySelectorAll('[data-fav-id="' + id + '"]');
  stars.forEach(function(el) {
    // v2.8.5: favoritado = emoji ❤️ (volume nativo); não-favoritado = ♡ (contorno).
    // Antes o clique sobrescrevia com ♥ (texto), revertendo o emoji do render inicial.
    el.textContent = nowFav ? '❤️' : '♡';
    el.title = nowFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    el.style.color = nowFav ? '#f43f5e' : 'rgba(255,255,255,0.4)';
  });
};

// v2.8.40: torneios OCULTADOS pelo usuário — somem da lista normal e vão pra uma
// seção "Torneios ocultados" no fim da dashboard. Mesmo esquema de chaves dos
// favoritos (uid + email, união na leitura), pra sobreviver a troca de identidade.
// Só faz sentido pra torneios em que o usuário NÃO está inscrito (o botão só
// aparece neles). Toggle re-renderiza a dashboard (o card muda de seção).
window._hiddenReadKeys = function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  var keys = [];
  if (cu && cu.uid) keys.push('scoreplace_hidden_uid_' + cu.uid);
  if (cu && cu.email) keys.push('scoreplace_hidden_' + cu.email);
  if (keys.length === 0) keys.push('scoreplace_hidden');
  return keys;
};
window._getHidden = function() {
  try {
    var set = {};
    window._hiddenReadKeys().forEach(function(k) {
      try { var raw = localStorage.getItem(k); if (raw) JSON.parse(raw).forEach(function(id){ set[String(id)] = 1; }); } catch (e) {}
    });
    return Object.keys(set);
  } catch (e) { return []; }
};
window._isHidden = function(tId) { return window._getHidden().indexOf(String(tId)) !== -1; };
window._toggleHidden = function(tId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var list = window._getHidden();
  var id = String(tId);
  var idx = list.indexOf(id);
  if (idx === -1) list.push(id); else list.splice(idx, 1);
  var payload = JSON.stringify(list);
  window._hiddenReadKeys().forEach(function(k) { try { localStorage.setItem(k, payload); } catch (e) {} });
  // v2.8.45: re-render preservando o scroll (não pula a tela).
  if (typeof window._dashRerender === 'function') { window._dashRerender(); return; }
  var c = document.getElementById('view-container');
  if (c && typeof window.renderDashboard === 'function') window.renderDashboard(c);
};

// ========================================
// scoreplace.app — AppStore (Firestore Backend)
// ========================================
// All tournament data persists in Cloud Firestore.
// Local cache in localStorage for instant first-paint.
// Real-time listener (onSnapshot) keeps data fresh without refresh.

// v2.8.29: lookup CANÔNICO de torneio por id (auditoria B-3). Busca nos torneios do
// usuário E no feed de descoberta pública — sem isso, ações em torneio DESCOBERTO (não
// inscrito), como "Falar com o organizador", davam "Torneio não encontrado" (só olhavam
// AppStore.tournaments). Comparação por String (ids podem vir number/string).
// v3.0.x: detecção CANÔNICA de dupla/time. Retorna a lista de membros (nomes, só p/
// exibição/contagem) quando p é uma ENTRADA DE TIME; null se é individual.
//
// PRINCÍPIO (regra do dono, gravada): uma DUPLA é definida pelos DOIS SLOTS (p1 e p2)
// ocupados — slot ocupado = uid (identidade real) OU, só pra jogador INFORMAL sem conta,
// o nome do slot. A identidade interna é SEMPRE o uid quando existe; o nome é só exibição.
// O '/' num displayName é PURAMENTE exibição ("Kelly / Rodrigo") e NUNCA define dupla.
// Uma string solta também nunca é dupla. (lista participants[] cobre o formato de array.)
window._entryTeamMembers = function (p) {
  if (!p || typeof p !== 'object') return null; // string/individual — '/' é só exibição
  if (Array.isArray(p.participants) && p.participants.length) {
    return p.participants.map(function (s) { return (s && (s.displayName || s.name)) || String(s || ''); }).filter(Boolean);
  }
  var hasP1 = !!(p.p1Uid || p.p1Name); // slot 1 ocupado: uid (real) ou nome (informal)
  var hasP2 = !!(p.p2Uid || p.p2Name); // slot 2 ocupado
  if (hasP1 && hasP2) {
    return [p.p1Name || p.p1Uid || '', p.p2Name || p.p2Uid || ''];
  }
  return null;
};

window._findTournamentById = function (tId) {
  if (tId == null) return null;
  var s = String(tId);
  var A = window.AppStore;
  if (!A) return null;
  var lists = [A.tournaments, A.publicDiscovery];
  for (var li = 0; li < lists.length; li++) {
    var arr = lists[li];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === s) return arr[i];
    }
  }
  return null;
};

window.AppStore = {
  currentUser: null,
  viewMode: 'organizer',
  tournaments: [],
  // Public discovery feed — public open tournaments the user isn't in yet.
  // Populated on demand via loadPublicDiscovery(). Independent of
  // `tournaments` (which is scoped to the user's own).
  publicDiscovery: [],
  _publicDiscoveryCursor: null,
  _publicDiscoveryHasMore: false,
  _invitedTournamentIds: [],  // Track tournament IDs from invite links
  _deletedTournamentIds: (function() { try { var d = localStorage.getItem('scoreplace_deleted_ids'); return d ? JSON.parse(d) : []; } catch(e) { return []; } })(),
  _syncDebounce: null,
  _loading: false,
  _realtimeUnsubscribe: null,  // Real-time listener unsubscribe function
  _cacheKey: 'scoreplace_tournaments_cache',

  // --- Local Cache ---
  _saveToCache() {
    try {
      // v3.0.x: NUNCA persistir a flag transiente _allowConfigReset no cache local.
      // Ela autoriza o guard anti-wipe de saveTournament por UM save (quando o
      // organizador reduz fases de propósito). Se vazar pro localStorage (o caminho de
      // EDIÇÃO grava ela em t e nunca a remove), volta no boot via _loadFromCache e
      // DESARMA a blindagem multi-fase daquele torneio — vetor confirmado do "Confra
      // perdeu as fases horas depois". Strip numa cópia rasa: não muta o objeto vivo
      // (a flag em memória se auto-limpa no próximo echo do onSnapshot).
      var clean = this.tournaments.map(function(t) {
        if (t && t._allowConfigReset !== undefined) {
          var c = Object.assign({}, t);
          delete c._allowConfigReset;
          return c;
        }
        return t;
      });
      var data = { ts: Date.now(), tournaments: clean };
      localStorage.setItem(this._cacheKey, JSON.stringify(data));
    } catch(e) { /* quota exceeded or private browsing */ }
  },

  _loadFromCache() {
    try {
      var raw = localStorage.getItem(this._cacheKey);
      if (!raw) return false;
      var data = JSON.parse(raw);
      // Cache valid for 24h
      if (data && data.tournaments && (Date.now() - data.ts) < 86400000) {
        var deletedIds = this._deletedTournamentIds || [];
        if (deletedIds.length > 0) {
          this.tournaments = data.tournaments.filter(function(t) {
            return deletedIds.indexOf(String(t.id)) === -1;
          });
        } else {
          this.tournaments = data.tournaments;
        }
        // Loaded from local cache
        return true;
      }
    } catch(e) { window._warn('[AppStore] Erro ao carregar cache local:', e.message); }
    return false;
  },

  // Sync: saves ALL organizer tournaments to Firestore IMMEDIATELY
  // No more debounce — every mutation must persist to prevent data loss across devices
  // IMPORTANT: skipParticipants prevents overwriting enrollments from other users
  sync() {
    var store = this;
    if (!window.FirestoreDB || !window.FirestoreDB.db || !store.currentUser) return;
    store.tournaments.forEach(function(t) {
      if (store.isOrganizer(t)) { // v2.8.79: uid-primário (co-host com email '')
        window.FirestoreDB.saveTournament(t, { skipParticipants: true }).catch(function(err) {
          window._warn('Sync error:', err);
        });
      }
    });
    store._saveToCache();
  },

  // SyncImmediate: saves a specific tournament to Firestore RIGHT NOW (no debounce)
  // Use for critical operations: draw, match results, status changes, enrollments
  async syncImmediate(tournamentId) {
    if (!window.FirestoreDB || !window.FirestoreDB.db) {
      window._error('syncImmediate: Firestore not available');
      return false;
    }
    var t = this.tournaments.find(function(tour) {
      return String(tour.id) === String(tournamentId);
    });
    if (!t) {
      window._error('syncImmediate: Tournament not found:', tournamentId);
      return false;
    }
    try {
      t.updatedAt = new Date().toISOString();
      await window.FirestoreDB.saveTournament(t);
      this._saveToCache();
      // Tournament saved to Firestore
      return true;
    } catch (err) {
      window._error('syncImmediate: FAILED to save tournament ' + tournamentId, err);
      // Sentry observability (no-op se DSN não configurada — ver js/sentry-init.js)
      if (typeof window._captureException === 'function') {
        window._captureException(err, { area: 'syncImmediate', tournamentId: tournamentId, code: err && err.code });
      }
      // v0.16.54: expor mensagem real do erro no toast (antes era genérico
      // "Não foi possível salvar no servidor. Tente novamente." que escondia
      // a causa). Inclui código Firestore (permission-denied, resource-
      // exhausted, deadline-exceeded, etc.) + mensagem detalhada + tamanho
      // estimado do doc pra detectar erros de "documento muito grande" (>1MiB).
      var _diagMsg = '';
      try {
        var _code = (err && err.code) || '';
        var _msg = (err && err.message) || String(err);
        var _docBytes = 0;
        try { _docBytes = new Blob([JSON.stringify(t)]).size; } catch(e2) {}
        _diagMsg = (_code ? '[' + _code + '] ' : '') + _msg.substring(0, 200);
        if (_docBytes > 0) _diagMsg += ' · ~' + Math.round(_docBytes / 1024) + 'KB';
        // window expose pra inspeção
        window._lastSaveError = { tournamentId: tournamentId, code: _code, message: _msg, docBytes: _docBytes, at: new Date().toISOString() };
      } catch (e3) { _diagMsg = String(err); }
      if (typeof showNotification === 'function') {
        showNotification(window._t('store.saveError') + ' (v0.16.54)', _diagMsg, 'error');
      }
      return false;
    }
  },

  // Start real-time listener — auto-updates tournaments on any Firestore change
  //
  // Scoped to the user's own tournaments via the denormalized `memberEmails[]`
  // field (creator + organizer + active co-hosts + participants). Without a
  // scope, every snapshot downloaded every tournament in the database on
  // every change anywhere — doesn't scale past a handful of users.
  startRealtimeListener(email) {
    if (this._realtimeUnsubscribe) return; // Already listening
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;

    // v1.9.43: sinaliza que estamos aguardando o primeiro snapshot antes de
    // esconder o boot loader. router.js respeita esse flag e não esconde antes.
    window._waitingForFirstSnapshot = true;
    // Fallback: se o Firestore nunca responder (offline/erro), revela após 5s.
    setTimeout(function() {
      if (window._waitingForFirstSnapshot) {
        window._waitingForFirstSnapshot = false;
        // Sem dados do servidor — revela o que houver (cache) mesmo assim.
        window._markBootReady(undefined, '5s-fallback');
        if (typeof window._hideBootLoader === 'function') window._hideBootLoader();
      }
    }, 5000);

    var store = this;
    var isFirstSnapshot = true;
    var coll = window.FirestoreDB.db.collection('tournaments');
    var norm = email ? String(email).trim().toLowerCase() : '';
    // v1.8.98: uid como fonte primária — mais confiável que email
    var _cuNow = window.AppStore && window.AppStore.currentUser;
    var _uid = _cuNow && _cuNow.uid ? _cuNow.uid : '';
    var query = _uid
      ? coll.where('memberUids', 'array-contains', _uid)
      : (norm ? coll.where('memberEmails', 'array-contains', norm) : coll);
    this._realtimeUnsubscribe = query
      .onSnapshot(function(snap) {
        try { if (window._noteFsReads) window._noteFsReads(snap.docChanges().length, 'rt-tournaments'); } catch (e) {}
        // v1.9.81: IDs antes do rebuild — pra detectar torneios REMOVIDOS
        // (deletados pelo organizador, ou usuário removido do torneio). Se o
        // participante está vendo a página de um torneio que sumiu, redireciona
        // pro dashboard (senão fica numa tela morta até dar refresh).
        var _prevIds = (store.tournaments || []).map(function(t) { return String(t.id); });
        var tournaments = [];
        var deletedIds = store._deletedTournamentIds || [];
        snap.forEach(function(doc) {
          var data = doc.data();
          if (deletedIds.indexOf(String(data.id)) === -1) {
            tournaments.push(data);
          }
        });
        store.tournaments = tournaments;
        store._saveToCache();
        store._loading = false;

        // v1.9.81: detecta remoções (presente antes, ausente agora) e, se o
        // usuário está vendo um torneio removido, tira ele da tela na hora.
        if (!isFirstSnapshot) {
          var _newIdSet = {};
          tournaments.forEach(function(t) { _newIdSet[String(t.id)] = true; });
          var _removedIds = _prevIds.filter(function(id) { return !_newIdSet[id]; });
          if (_removedIds.length) {
            try {
              var _hp = (window.location.hash || '').replace('#', '').split('/');
              var _tourViews = ['tournaments', 'bracket', 'participants', 'rules', 'pre-draw', 'analise', 'categorias'];
              if (_tourViews.indexOf(_hp[0]) !== -1 && _hp[1] && _removedIds.indexOf(String(_hp[1])) !== -1) {
                if (typeof showNotification === 'function') {
                  showNotification('Torneio removido', 'Esse torneio não está mais disponível (foi removido pelo organizador).', 'warning');
                }
                window.location.hash = '#dashboard';
              }
            } catch (_e) {}
          }
        }

        // First snapshot = initial load → full render needed
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          // v2.4.7: marco real pra barra do boot splash (dados em memória).
          window._firstSnapshotDone = true;
          // v1.4.13-beta: se o usuário já navegou pra uma rota stateful
          // (#novo-torneio) antes do primeiro snapshot chegar, NÃO chamar
          // initRouter() — isso limparia o viewContainer e fecharia o formulário.
          // O mesmo guard de _softRefreshView se aplica aqui: a rota stateful
          // já foi renderizada pelo hashchange; o snapshot só atualiza os dados
          // em memória (store.tournaments) sem precisar re-renderizar a view.
          var _firstSnapView = (window.location.hash || '').replace('#', '').split('/')[0];
          if (_firstSnapView !== 'novo-torneio') {
            if (typeof initRouter === 'function') initRouter();
          }
          // v1.9.43: boot loader esperou o primeiro snapshot.
          // v2.4.5: NÃO esconde aqui. Espera o settle — a query complementar
          // (abaixo) + um respiro pras hidratações async da dashboard
          // (presença, movimento, descoberta) assentarem ATRÁS do splash —
          // e só então marca _bootReady=true. Assim a dashboard é revelada
          // estável, sem o re-render visível que travava o scroll na abertura.
          window._waitingForFirstSnapshot = false;
          var _finalizeBootTries = 0;
          var _finalizeBootReady = function() {
            // v2.4.7b: não revela a dashboard antes do PERFIL terminar de
            // carregar (loadUserProfile seta currentUser._profileLoaded). No
            // fluxo normal o perfil já carregou antes do listener; este guard
            // cobre ordering raro — espera até ~3s (25×120ms) e segue mesmo
            // assim pra nunca travar.
            var _cuf = window.AppStore && window.AppStore.currentUser;
            if (_cuf && _cuf._profileLoaded !== true && _finalizeBootTries < 25) {
              _finalizeBootTries++;
              setTimeout(_finalizeBootReady, 120);
              return;
            }
            // v2.4.84: deep-link pra fora da dashboard → revela rápido (a trava
            // de scroll é fenômeno da dashboard; outras views não hidratam pesado).
            var _hash0 = (window.location.hash || '').replace('#', '').split('/')[0];
            var _onDash = (_hash0 === '' || _hash0 === 'dashboard');
            if (!_onDash) {
              requestAnimationFrame(function() {
                setTimeout(function() { window._markBootReady(1000, 'deep-link'); }, 550);
              });
              return;
            }
            // v2.4.93: tempo FIXO de splash, simples e LIMITADO. A v2.4.87 usava
            // um detector de "DOM quieto" — mas a dashboard tem timers/re-renders
            // ~contínuos, então ele batia no teto e revelava só em ~9s (confirmado
            // pelo diagnóstico: dash-poller @ 9002ms). Agora: revela no piso de
            // 3,5s (desde o open do app). Um teto GLOBAL (_markBootReady(4500))
            // garante que nunca passa de ~4,5s, mesmo com dados lentos. Quem
            // realmente trava o scroll (re-render pós-reveal) é tratado separado.
            window._markBootReady(3500, 'dash-poller');
          };
          // Auto-scroll: tratado pelo renderDashboard com 600ms após render.
          // Auto-fix stale names after tournaments are loaded (no currentUser check needed)
          if (typeof window._autoFixStaleNames === 'function') {
            window._autoFixStaleNames().catch(function(e) { window._warn('Auto-fix stale names error:', e); });
          }
          // Auto-close tournaments whose registration deadline has passed
          window._autoCloseExpiredEnrollments();
          // Recupera adminEmails/memberEmails apagados pelo bug v1.6.66
          setTimeout(function() { window._recoverWipedAdminEmails(); }, 2000);
          // v1.8.98: listener usa uid como primário — busca complementar
          // por email para torneios antigos sem memberUids preenchido
          var _cu2 = window.AppStore && window.AppStore.currentUser;
          if (_cu2 && _cu2.email && _cu2.uid && window.FirestoreDB && window.FirestoreDB.db) {
            var _norm2 = String(_cu2.email).trim().toLowerCase();
            window.FirestoreDB.db.collection('tournaments')
              .where('memberEmails', 'array-contains', _norm2)
              .get()
              .then(function(snap2) {
                var existing = new Set(store.tournaments.map(function(t){ return String(t.id); }));
                var added = 0;
                snap2.forEach(function(doc) {
                  var id = String(doc.id);
                  if (!existing.has(id)) {
                    store.tournaments.push(doc.data());
                    added++;
                  }
                });
                if (added > 0) {
                  store._saveToCache();
                  if (typeof window._softRefreshView === 'function') window._softRefreshView();
                }
              })
              .catch(function() {})
              // v2.4.5: só libera o boot loader DEPOIS que a query complementar
              // assenta (o _softRefreshView dela roda atrás do splash).
              .then(function() { _finalizeBootReady(); });
          } else {
            _finalizeBootReady();
          }
          return;
        }

        // Subsequent snapshots = remote changes → soft refresh (preserve UX)
        window._softRefreshView();
      }, function(err) {
        window._warn('Real-time listener error:', err);
        // Fallback to one-time load
        store.loadFromFirestore();
      });

    // v1.9.92: gatilho tempo-real da descoberta pública (camada ADITIVA;
    // se falhar, o polling de 25s da dashboard assume — nada quebra).
    this.startDiscoveryFeedListener();
  },

  // v1.9.92: listener leve em `discoveryFeed`. NÃO é a fonte de dados — quando
  // dispara (alguém criou/alterou/removeu um torneio público), apenas re-busca
  // o feed real via loadPublicDiscovery() (que lê `tournaments`, caminho já
  // comprovado) e re-renderiza a dashboard. A Cloud Function `syncDiscoveryFeed`
  // só escreve em discoveryFeed quando campos relevantes mudam, então isto NÃO
  // dispara em updates de placar/presença. Se este listener falhar por qualquer
  // motivo, o polling de 25s da dashboard continua atualizando o feed.
  startDiscoveryFeedListener() {
    if (this._discoveryUnsub) return; // já escutando
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    var store = this;
    var isFirst = true;
    try {
      this._discoveryUnsub = window.FirestoreDB.db.collection('discoveryFeed')
        .onSnapshot(function(snap) {
          try { if (window._noteFsReads) window._noteFsReads(snap.docChanges().length, 'rt-discovery'); } catch (e) {}
          // Primeiro snapshot já está coberto pelo loadPublicDiscovery inicial.
          if (isFirst) { isFirst = false; return; }
          if (!store.currentUser) return;
          store.loadPublicDiscovery().then(function() {
            var h = window.location.hash || '';
            if (!(h === '' || h === '#' || h.indexOf('#dashboard') === 0)) return;
            // v2.8.83: só re-renderiza se o SET de discovery mudou de fato — evita
            // o flash da seção "Movimento" (e o pulo do que está abaixo) a cada
            // update irrelevante de outros torneios públicos. E usa _dashRerender
            // (preserva scroll) em vez de renderDashboard cru.
            try {
              var _pd = store.publicDiscovery || [];
              var _sig = _pd.length + '|' + _pd.map(function(t) { return t && (t.id || t._id); }).join(',');
              if (_sig === window._dashDiscoverySig) return;
              window._dashDiscoverySig = _sig;
            } catch (e) {}
            if (typeof window._dashRerender === 'function') { window._dashRerender(); return; }
            var c = document.getElementById('view-container');
            if (c && typeof renderDashboard === 'function') renderDashboard(c);
          }).catch(function() {});
        }, function(err) {
          window._warn('discoveryFeed listener error (fallback p/ polling 25s):', err);
        });
    } catch (e) {
      window._warn('discoveryFeed listener setup error:', e);
    }
  },

  stopRealtimeListener() {
    if (this._realtimeUnsubscribe) {
      this._realtimeUnsubscribe();
      this._realtimeUnsubscribe = null;
    }
    if (this._discoveryUnsub) {
      this._discoveryUnsub();
      this._discoveryUnsub = null;
    }
    if (this._notifUnsubscribe) {
      this._notifUnsubscribe();
      this._notifUnsubscribe = null;
    }
    if (this._profileUnsubscribe) {
      this._profileUnsubscribe();
      this._profileUnsubscribe = null;
    }
  },

  // Real-time listener for user notifications — fires on new/updated notifications
  startNotificationsListener() {
    if (this._notifUnsubscribe) return; // Already listening
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    var cu = this.currentUser;
    if (!cu || !cu.uid) return;

    var isFirst = true;
    this._notifUnsubscribe = window.FirestoreDB.db
      .collection('users').doc(cu.uid).collection('notifications')
      .orderBy('createdAt', 'desc').limit(20)
      .onSnapshot(function(snap) {
        try { if (window._noteFsReads) window._noteFsReads(snap.docChanges().length, 'rt-snap'); } catch (e) {}
        // Skip the initial snapshot (already loaded via polling)
        if (isFirst) { isFirst = false; return; }

        // New notification arrived — update badge immediately
        if (typeof window._updateNotificationBadge === 'function') {
          window._updateNotificationBadge();
        }

        // Show toast for each new notification
        snap.docChanges().forEach(function(change) {
          if (change.type === 'added') {
            var d = change.doc.data();
            if (d && !d.read && d.message && typeof showNotification === 'function') {
              showNotification('🔔 ' + (d.type === 'cohost_invite' ? window._t('store.cohostInviteTitle') : window._t('store.notifTitle')), d.message, 'info');
            }
          }
        });

        // If user is on notifications page, refresh it
        if (window.location.hash === '#notifications') {
          var vc = document.getElementById('view-container');
          if (vc && typeof renderNotifications === 'function') renderNotifications(vc);
        }
      }, function(err) {
        window._warn('Notifications listener error:', err);
      });
  },

  // Real-time listener for user profile — syncs theme and prefs across devices
  startProfileListener() {
    if (this._profileUnsubscribe) return; // Already listening
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    var cu = this.currentUser;
    if (!cu || !cu.uid) return;

    var store = this;
    var isFirst = true;
    // Remember the last synced casual room so we only hijack navigation when
    // the value CHANGES — without this, every profile save (e.g. the user
    // editing Locais, nome, tema) re-fires the redirect and yanks them into
    // an old casual match they thought they'd left.
    var lastCasualRoom = null;
    this._profileUnsubscribe = window.FirestoreDB.db
      .collection('users').doc(cu.uid)
      .onSnapshot(function(doc) {
        // v2.7.35: PERFIL É A FONTE DA VERDADE e propaga PRA TUDO dinamicamente.
        // A cada mudança do perfil do usuário, atualiza o cache _partProfileByName
        // (que alimenta os badges gênero·nível·idade E o filtro/sort dos Inscritos)
        // com os dados frescos — sem precisar reabrir nada. Cross-user: outros
        // perfis ficam frescos a cada sessão (cache zera no reload).
        try {
          if (doc.exists) {
            var _pd = doc.data();
            var _dn = String((_pd && (_pd.displayName || _pd.name)) || '').toLowerCase();
            if (_dn) { window._partProfileByName = window._partProfileByName || {}; window._partProfileByName[_dn] = _pd; }
          }
          // Se a página de Inscritos está aberta, re-aplica badges + filtro AO VIVO.
          var _h = window.location.hash || '';
          if (_h.indexOf('#participants/') === 0 && document.getElementById('part-sort')) {
            var _t = store.getTournament ? store.getTournament(_h.split('/')[1]) : null;
            var _vc = document.getElementById('view-container');
            if (_t && _vc && typeof window._patchProfileMetaSlots === 'function') window._patchProfileMetaSlots(_vc, _t);
          }
        } catch (e) {}
        // First snapshot: aproveitamos para RESUMIR uma partida ao vivo
        // em andamento. Cenário real: o celular cai da mão durante o
        // placar ao vivo, a aba fecha, o user volta — espera cair
        // direto na partida, não na dashboard. Se o perfil tem um
        // activeCasualRoom e o hash atual não aponta para essa sala,
        // navega. Se o user já está em #casual/... (deep link direto
        // ou reload na própria página), deixamos quieto.
        if (isFirst) {
          isFirst = false;
          // v0.17.48: fallback pra sessionStorage quando o Firestore profile
          // não tem activeCasualRoom (pode ser race com auto-update reload —
          // saveUserProfile falhou em concluir antes do reload). Se a
          // sessionStorage tem a sala salva, prioriza ela como fonte de
          // verdade pro resume. Limpa sessionStorage se Firestore explicitamente
          // tem null (organizador fechou a partida).
          var firstRoom = (doc.exists ? doc.data().activeCasualRoom : null) || null;
          if (!firstRoom) {
            try {
              var ssRoom = sessionStorage.getItem('_activeCasualRoom');
              if (ssRoom) firstRoom = ssRoom;
            } catch(e) {}
          }
          lastCasualRoom = firstRoom;
          if (firstRoom) {
            var hash = window.location.hash || '';
            var expected = '#casual/' + firstRoom;
            var alreadyInMatch = hash === expected ||
                                 hash.indexOf('#casual/' + firstRoom) === 0;
            // ALSO check for the DOM overlays — without this, clicking
            // "Iniciar" (which removes #casual-match-overlay and opens
            // #live-scoring-overlay) triggers a redirect back to the
            // setup overlay mid-transition, and clicking "Fechar"
            // reopens the match because the profile clear is async
            // and this branch fires before activeCasualRoom=null lands.
            var hasOverlay = !!document.getElementById('casual-match-overlay') ||
                             !!document.getElementById('live-scoring-overlay');
            // v2.1.74: SÓ resume a partida casual se o app abriu numa página
            // NEUTRA (dashboard/raiz). Se o usuário abriu um DEEP LINK explícito
            // — torneio (link de convite!), #invite, #place, etc. — respeita o
            // destino e NÃO sequestra pra casual. Bug: link da Confra caía na
            // partida casual de quem tinha activeCasualRoom pendente.
            var _hLow = (hash || '').toLowerCase();
            var isNeutralHash = !_hLow || _hLow === '#' || _hLow === '#dashboard' || _hLow.indexOf('#dashboard') === 0;
            if (!alreadyInMatch && !hasOverlay && isNeutralHash) {
              window.location.hash = expected;
            }
          }
          return;
        }
        if (!doc.exists) return;
        var data = doc.data();
        // Sync theme in real-time across all logged-in devices
        if (data.theme && window._themeOrder.indexOf(data.theme) !== -1) {
          var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
          if (data.theme !== currentTheme) {
            document.documentElement.setAttribute('data-theme', data.theme);
            try { localStorage.setItem('scoreplace_theme', data.theme); } catch (e) {}
            window._applyThemeIcon(data.theme);
            if (store.currentUser) store.currentUser.theme = data.theme;
          }
        }
        // v2.1.91: sincroniza o tamanho da interface (--ui-scale) entre dispositivos
        if (data.uiScale != null && typeof window._applyUiScale === 'function') {
          var _s = window._clampUiScale(data.uiScale);
          if (store.currentUser) store.currentUser.uiScale = _s;
          try { localStorage.setItem('scoreplace_ui_scale', String(_s)); } catch (e) {}
          window._applyUiScale(_s);
          var _sl = document.getElementById('profile-ui-scale');
          if (_sl) { _sl.value = Math.round(_s * 100); var _lbl = document.getElementById('profile-ui-scale-val'); if (_lbl) _lbl.textContent = Math.round(_s * 100) + '%'; }
        }
        // Sync active casual room — navigate other devices to the same match
        // BUT only when the value transitioned (not on every unrelated save).
        var newRoom = data.activeCasualRoom || null;
        if (newRoom && newRoom !== lastCasualRoom) {
          var currentHash = window.location.hash || '';
          var alreadyOnCasual = currentHash.indexOf('#casual/') === 0 ||
                                document.getElementById('casual-match-overlay') ||
                                document.getElementById('live-scoring-overlay');
          // Suppression: if the user just closed a match (_casualSetupClose
          // or finished live-scoring), Firestore may still deliver a stale
          // snapshot with the old room value due to optimistic writes or
          // out-of-order delivery. Within 6s of a deliberate close, ignore
          // any "room is set" snapshots — the null snapshot is the truth.
          var suppressedUntil = window._suppressCasualResumeUntil || 0;
          var isSuppressed = Date.now() < suppressedUntil;
          if (!alreadyOnCasual && !isSuppressed) {
            window.location.hash = '#casual/' + newRoom;
          }
        }
        lastCasualRoom = newRoom;

        // Sync friend-relationship arrays so the sender's Explore view
        // reflects Accept/Reject/Remove decisions the other party made
        // WITHOUT requiring a page reload. Previously the explore cards
        // (including the "Convite enviado" pending card) stayed stale
        // indefinitely because AppStore.currentUser was never refreshed.
        if (store.currentUser) {
          var friendArraysChanged = false;
          ['friends', 'friendRequestsSent', 'friendRequestsReceived'].forEach(function(key) {
            var incoming = Array.isArray(data[key]) ? data[key] : [];
            var existing = Array.isArray(store.currentUser[key]) ? store.currentUser[key] : [];
            // Compare as sorted-joined strings — cheap and deterministic for
            // simple arrays of uids. Different length OR different members
            // counts as changed.
            var a = existing.slice().sort().join(',');
            var b = incoming.slice().sort().join(',');
            if (a !== b) {
              store.currentUser[key] = incoming.slice();
              friendArraysChanged = true;
            }
          });
          if (friendArraysChanged) {
            // If the Explorar view is open, re-render it so pending cards
            // disappear, new friends move up into "Meus Amigos", etc.
            if (window.location.hash === '#explore') {
              var vc = document.getElementById('view-container');
              if (vc && typeof renderExplore === 'function') renderExplore(vc);
            }
          }
        }
      }, function(err) {
        window._warn('Profile listener error:', err);
      });
  },

  // Load the public discovery feed (public + open tournaments the user
  // isn't in). Paginated via cursor. Pass { append: true } to fetch the next
  // page; otherwise replaces the current list (pull-to-refresh style).
  async loadPublicDiscovery(opts) {
    // v0.16.57: usa loadAllPublicTournaments (sem filtro de status) pra
    // popular o feed completo. Antes usava loadPublicOpenTournaments que
    // filtrava só inscrições abertas — discovery escondia torneios em
    // andamento, encerrados sem sorteio e finished. Pedido do usuário:
    // mostrar TODOS os públicos categorizados (abertas → andamento →
    // fechadas-sem-sorteio → encerrados). Categorização é client-side
    // no dashboard via _classifyDiscoveryTournament.
    if (!window.FirestoreDB) return;
    var loader = window.FirestoreDB.loadAllPublicTournaments
      || window.FirestoreDB.loadPublicOpenTournaments;
    if (typeof loader !== 'function') return;
    opts = opts || {};
    var cursor = opts.append ? this._publicDiscoveryCursor : null;
    var myEmail = this.currentUser && this.currentUser.email
      ? String(this.currentUser.email).toLowerCase()
      : '';
    try {
      var res = await loader.call(window.FirestoreDB, {
        limit: opts.limit || 50,
        cursor: cursor
      });
      // Drop tournaments the user already has a relationship with — they
      // already see those via the scoped listener. Uses the denormalized
      // memberEmails[] so no extra reads.
      var filtered = (res.tournaments || []).filter(function(t) {
        if (!myEmail) return true;
        if (!Array.isArray(t.memberEmails)) return true;
        return t.memberEmails.indexOf(myEmail) === -1;
      });
      this.publicDiscovery = opts.append
        ? this.publicDiscovery.concat(filtered)
        : filtered;
      this._publicDiscoveryCursor = res.nextCursor;
      this._publicDiscoveryHasMore = !!res.hasMore;
      this._publicDiscoveryLoaded = true; // v1.9.79: ao menos um load concluído
    } catch (e) {
      window._warn('Erro ao carregar descoberta pública:', e);
    }
  },

  // Load tournaments from Firestore (one-time, fallback for listener failure).
  // Scoped to the current user's own tournaments via `memberEmails[]`.
  async loadFromFirestore() {
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    this._loading = true;
    try {
      var email = this.currentUser && this.currentUser.email;
      var tournaments = email
        ? await window.FirestoreDB.loadMyTournaments(email)
        : await window.FirestoreDB.loadAllTournaments();
      var deletedIds = this._deletedTournamentIds || [];
      if (deletedIds.length > 0) {
        tournaments = tournaments.filter(function(t) {
          return deletedIds.indexOf(String(t.id)) === -1;
        });
      }
      this.tournaments = tournaments;
      this._saveToCache();
      // Tournaments loaded from Firestore
    } catch (e) {
      window._error('Erro ao carregar torneios:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'loadTournaments', code: e && e.code });
      }
      this.tournaments = [];
    }
    this._loading = false;
  },

  // Load user profile from Firestore
  async loadUserProfile(uid) {
    if (!window.FirestoreDB || !window.FirestoreDB.db || !uid) return null;
    try {
      var profile = await window.FirestoreDB.loadUserProfile(uid);
      // v0.16.8: expõe snapshot do que Firestore devolveu pra debug visual.
      // Se o usuário reportar "gender sumiu", dá pra checar se foi (a) o save
      // que não persistiu (_lastProfileSave mostra), (b) o load que pegou
      // valor errado (_lastProfileLoad mostra), ou (c) o populate que
      // falhou (comparar com formulário). Diagnóstico em 3 pontos.
      try {
        window._lastProfileLoad = {
          uid: uid,
          version: window.SCOREPLACE_VERSION,
          at: new Date().toISOString(),
          hasProfile: !!profile,
          gender: profile ? profile.gender : undefined,
          city: profile ? profile.city : undefined,
          phone: profile ? profile.phone : undefined,
          birthDate: profile ? profile.birthDate : undefined,
          fields: profile ? Object.keys(profile).sort() : []
        };
        window._log('[Profile Load]', uid, 'gender:', window._lastProfileLoad.gender, 'city:', window._lastProfileLoad.city);
      } catch (_e) {}
      if (profile && this.currentUser) {
        // Merge saved profile data into currentUser
        // v2.1.91: tamanho da interface — aplica o valor salvo do perfil
        if (profile.uiScale != null && typeof window._applyUiScale === 'function') {
          this.currentUser.uiScale = window._clampUiScale(profile.uiScale);
          try { localStorage.setItem('scoreplace_ui_scale', String(this.currentUser.uiScale)); } catch (e) {}
          window._applyUiScale(this.currentUser.uiScale);
        }
        if (profile.gender) this.currentUser.gender = profile.gender;
        if (profile.preferredSports) this.currentUser.preferredSports = profile.preferredSports;
        if (profile.defaultCategory) this.currentUser.defaultCategory = profile.defaultCategory;
        // v1.3.6-beta: skillBySport — habilidade por modalidade
        if (profile.skillBySport && typeof profile.skillBySport === 'object') {
          this.currentUser.skillBySport = profile.skillBySport;
        }
        if (profile.displayName) this.currentUser.displayName = profile.displayName;
        if (profile.birthDate) this.currentUser.birthDate = profile.birthDate;
        if (profile.age) this.currentUser.age = profile.age;
        if (profile.city) this.currentUser.city = profile.city;
        if (profile.state) this.currentUser.state = profile.state;
        if (profile.country) this.currentUser.country = profile.country;
        if (profile.locale) this.currentUser.locale = profile.locale;
        if (profile.phone) this.currentUser.phone = profile.phone;
        if (profile.phoneCountry) this.currentUser.phoneCountry = profile.phoneCountry;
        if (profile.photoURL) this.currentUser.photoURL = profile.photoURL;
        // Boolean prefs — use !== undefined to allow false values
        if (profile.acceptFriendRequests !== undefined) this.currentUser.acceptFriendRequests = profile.acceptFriendRequests;
        if (profile.notifyPlatform !== undefined) this.currentUser.notifyPlatform = profile.notifyPlatform;
        if (profile.notifyEmail !== undefined) this.currentUser.notifyEmail = profile.notifyEmail;
        if (profile.notifyWhatsApp !== undefined) this.currentUser.notifyWhatsApp = profile.notifyWhatsApp;
        if (profile.notifyLevel) this.currentUser.notifyLevel = profile.notifyLevel;
        if (profile.preferredCeps !== undefined) this.currentUser.preferredCeps = profile.preferredCeps;
        if (Array.isArray(profile.preferredLocations)) this.currentUser.preferredLocations = profile.preferredLocations;
        // v1.6.29-beta: flag setado pelo login Google via People API.
        // True = foto real cadastrada no Google. False = monograma default.
        // Usado pela check do trofeu perfil_foto pra decidir se Google
        // avatar conta como foto real.
        if (profile.hasGooglePhotoReal !== undefined) this.currentUser.hasGooglePhotoReal = profile.hasGooglePhotoReal;
        if (Array.isArray(profile.friends)) this.currentUser.friends = profile.friends;
        if (Array.isArray(profile.friendRequestsSent)) this.currentUser.friendRequestsSent = profile.friendRequestsSent;
        if (Array.isArray(profile.friendRequestsReceived)) this.currentUser.friendRequestsReceived = profile.friendRequestsReceived;
        // Presence settings — previously set on currentUser via profile save but
        // never actually persisted to Firestore (save payload omitted them).
        // v0.16.5 adds save+load for these so the user's visibility/mute/auto
        // check-in choices survive app restarts.
        // v1.9.63: preferências de tamanho do placar ao vivo (sliders).
        if (profile.liveScorePrefs && typeof profile.liveScorePrefs === 'object') this.currentUser.liveScorePrefs = profile.liveScorePrefs;
        if (profile.presenceVisibility) this.currentUser.presenceVisibility = profile.presenceVisibility;
        if (profile.presenceMuteDays !== undefined) this.currentUser.presenceMuteDays = profile.presenceMuteDays;
        if (profile.presenceMuteUntil !== undefined) this.currentUser.presenceMuteUntil = profile.presenceMuteUntil;
        if (profile.presenceAutoCheckin !== undefined) this.currentUser.presenceAutoCheckin = profile.presenceAutoCheckin;
        // v2.4.3: privacidade de contato.
        if (profile.omitEmail !== undefined) this.currentUser.omitEmail = profile.omitEmail;
        if (profile.omitPhone !== undefined) this.currentUser.omitPhone = profile.omitPhone;
        // v0.17.86: bug crítico — acceptedTerms* não estavam na lista de merge.
        // Toda vez que simulateLoginSuccess re-rodava (ex: onAuthStateChanged
        // por token refresh), currentUser = user (4 campos) wipeava o
        // acceptedTerms local. loadUserProfile NÃO restaurava → próximo
        // _needsTermsAcceptance retornava true mesmo com Firestore tendo
        // acceptedTerms=true → modal de termos reaparecia → user cancelava →
        // handleLogout → login modal abria do nada. Sintoma reportado:
        // "ao salvar perfil vai pra tela de login de novo".
        if (profile.acceptedTerms !== undefined) this.currentUser.acceptedTerms = profile.acceptedTerms;
        if (profile.acceptedTermsAt) this.currentUser.acceptedTermsAt = profile.acceptedTermsAt;
        if (profile.acceptedTermsVersion) this.currentUser.acceptedTermsVersion = profile.acceptedTermsVersion;
        // Plan info (Pro vs Free) também escapava — efeito colateral
        // similar: usuário Pro virava Free temporariamente após token refresh.
        if (profile.plan) this.currentUser.plan = profile.plan;
        if (profile.planExpiresAt) this.currentUser.planExpiresAt = profile.planExpiresAt;
        // previousDisplayNames pra auto-fix de orfãos (v0.17.x)
        if (Array.isArray(profile.previousDisplayNames)) this.currentUser.previousDisplayNames = profile.previousDisplayNames;
        // Theme sync across devices
        if (profile.theme && window._themeOrder.indexOf(profile.theme) !== -1) {
          this.currentUser.theme = profile.theme;
          // Apply remote theme if different from local
          var localTheme = document.documentElement.getAttribute('data-theme') || 'dark';
          if (profile.theme !== localTheme) {
            document.documentElement.setAttribute('data-theme', profile.theme);
            try { localStorage.setItem('scoreplace_theme', profile.theme); } catch (e) {}
            window._applyThemeIcon(profile.theme);
          }
        }
        // Plan fields
        if (profile.plan) this.currentUser.plan = profile.plan;
        if (profile.planExpiresAt) this.currentUser.planExpiresAt = profile.planExpiresAt;
        if (profile.stripeCustomerId) this.currentUser.stripeCustomerId = profile.stripeCustomerId;
        if (profile.stripeSubscriptionId) this.currentUser.stripeSubscriptionId = profile.stripeSubscriptionId;
        // v0.17.78: aceite de Termos+Privacy (compliance LGPD beta)
        if (profile.acceptedTerms !== undefined) this.currentUser.acceptedTerms = profile.acceptedTerms;
        if (profile.acceptedTermsAt) this.currentUser.acceptedTermsAt = profile.acceptedTermsAt;
        if (profile.acceptedTermsVersion) this.currentUser.acceptedTermsVersion = profile.acceptedTermsVersion;
      }
      // v0.17.6: self-heal de cu.friends — roda em background após profile
      // load. Resolve emails legados pra uid, dropa órfãos e dedup. Persiste
      // a lista limpa no Firestore. Atende pedido do usuário pra prevenir
      // notificações duplicadas. Background pra não bloquear render do app.
      if (this.currentUser && this.currentUser.uid) {
        var self = this;
        setTimeout(function() {
          self._selfHealFriendsList().catch(function(e) {
            window._warn('[selfHealFriends] background failed:', e);
          });
        }, 0);
      }
      // v0.17.3: sinaliza que o profile load attempt completou (sucesso OU
      // doc inexistente — first-time user). Views que dependem de campos do
      // profile (preferredLocations, friends, etc.) escutam esse evento pra
      // re-renderizar quando os dados chegam, em vez de mostrar placeholder
      // vazio durante o gap async entre simulateLoginSuccess e profile merge.
      // Causa-raiz reportada: usuário em #place com auto-update reload — view
      // renderizou antes do profile carregar, "Marque seus lugares favoritos"
      // apareceu mesmo com preferreds salvos.
      if (this.currentUser) this.currentUser._profileLoaded = true;
      window._profileLoadDone = true; // v2.4.7b: marco real da barra do boot splash
      try {
        document.dispatchEvent(new CustomEvent('scoreplace:profile-loaded', { detail: { uid: uid } }));
      } catch (e) {}
      // Belt+suspenders: se trophies.js já carregou e o usuário não foi
      // bootstrapped ainda (sessão persistente sem re-login), dispara agora.
      if (typeof window._trophyCheckPersistentSession === 'function') {
        window._trophyCheckPersistentSession();
      }
      return profile;
    } catch (e) {
      window._error('Erro ao carregar perfil:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'loadUserProfile', uid: uid, code: e && e.code });
      }
      // v0.17.3: mesmo em erro, marca como "tentativa concluída" pra views
      // não ficarem esperando indefinidamente. Erro real continua logado.
      if (this.currentUser) this.currentUser._profileLoaded = true;
      window._profileLoadDone = true; // v2.4.7b: marco real da barra do boot splash
      try {
        document.dispatchEvent(new CustomEvent('scoreplace:profile-loaded', { detail: { uid: uid, error: true } }));
      } catch (e2) {}
      return null;
    }
  },

  // v0.17.6: normaliza cu.friends — resolve emails legados → uid, dropa
  // órfãos (email não casa com nenhum user), dedup. Persiste a lista limpa
  // no Firestore. Disparado em background após loadUserProfile. Resolve a
  // causa-raiz das "várias notificações em cada evento" — antes da v0.17.5
  // o dedup era só no momento de notificar; agora a lista persistida é
  // canônica. Não bloqueia render — usuário pode usar o app enquanto roda.
  // Idempotente: pode chamar várias vezes, só faz write quando há mudança.
  async _selfHealFriendsList() {
    if (!this.currentUser || !window.FirestoreDB || !window.FirestoreDB.db) return;
    var uid = this.currentUser.uid;
    if (!uid) return;
    var friends = Array.isArray(this.currentUser.friends) ? this.currentUser.friends.slice() : [];
    if (friends.length === 0) return;

    // Categoriza
    var uidEntries = {}; // uid → true
    var emailsToResolve = []; // emails únicos pra resolver
    var emailSet = {};
    var hasSelfRef = false;
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i];
      if (!f || typeof f !== 'string') continue;
      if (f === uid) { hasSelfRef = true; continue; }
      if (f.indexOf('@') === -1) {
        uidEntries[f] = true;
      } else {
        if (!emailSet[f]) { emailSet[f] = true; emailsToResolve.push(f); }
      }
    }

    // Precisa limpar se: tem email, tem self-ref, ou lista atual tem
    // duplicatas (length > unique uids).
    var uniqueUidCount = Object.keys(uidEntries).length;
    var needsClean = emailsToResolve.length > 0 || hasSelfRef ||
                     friends.length !== (uniqueUidCount + emailsToResolve.length);
    if (!needsClean) return;

    window._log('[selfHealFriends v0.17.6] starting', {
      total: friends.length,
      uniqueUids: uniqueUidCount,
      emailsToResolve: emailsToResolve.length,
      hasSelfRef: hasSelfRef
    });

    var db = window.FirestoreDB.db;
    var resolvedMap = {}; // email → uid (or null se não resolveu)

    // Resolve emails em paralelo
    await Promise.all(emailsToResolve.map(async function(email) {
      try {
        var emLower = String(email).toLowerCase();
        var snap = await db.collection('users')
          .where('email_lower', '==', emLower).limit(1).get();
        if (snap.empty) {
          // Fallback: campo legacy 'email' (não-lowercase)
          snap = await db.collection('users').where('email', '==', email).limit(1).get();
        }
        if (!snap.empty) {
          var docId = snap.docs[0].id;
          // Se docId é também email (legacy doc keyed por email), preserva
          // como está — usuário ainda não migrou. Se não, é uid resolvido.
          resolvedMap[email] = docId;
        } else {
          resolvedMap[email] = null; // órfão, dropar
        }
      } catch (e) {
        window._warn('[selfHealFriends] resolve falhou pra', email, e);
        resolvedMap[email] = null;
      }
    }));

    // Constrói lista limpa
    var clean = [];
    var added = {};
    Object.keys(uidEntries).forEach(function(u) {
      if (!added[u]) { added[u] = true; clean.push(u); }
    });
    emailsToResolve.forEach(function(em) {
      var resolved = resolvedMap[em];
      // v0.17.8: filtra também se email resolve pro próprio uid (caso edge —
      // user pode ter o próprio email antigo na lista por bug histórico). Se
      // entra aqui, ownUid acabaria em cu.friends e o user notificaria a si
      // mesmo nas chamadas de presence_checkin/plan.
      if (resolved && resolved !== uid && !added[resolved]) {
        added[resolved] = true;
        clean.push(resolved);
      }
    });

    // Se nada mudou (clean tem mesmo conteúdo de friends original), bail
    var origSet = {};
    friends.forEach(function(f) { if (f) origSet[f] = true; });
    var cleanSet = {};
    clean.forEach(function(f) { cleanSet[f] = true; });
    var origKeys = Object.keys(origSet);
    var cleanKeys = Object.keys(cleanSet);
    if (origKeys.length === cleanKeys.length && origKeys.every(function(k) { return cleanSet[k]; })) {
      window._log('[selfHealFriends] no changes after dedup');
      return;
    }

    // Persiste lista limpa
    try {
      await db.collection('users').doc(uid).update({ friends: clean });
      this.currentUser.friends = clean;
      window._log('[selfHealFriends v0.17.6] cleaned', {
        before: friends.length,
        after: clean.length,
        droppedOrphans: emailsToResolve.filter(function(em) { return !resolvedMap[em]; }).length,
        resolvedEmails: emailsToResolve.filter(function(em) { return resolvedMap[em]; }).length
      });
      try {
        document.dispatchEvent(new CustomEvent('scoreplace:friends-cleaned', { detail: { uid: uid, before: friends.length, after: clean.length } }));
      } catch (e) {}
    } catch (e) {
      window._error('[selfHealFriends v0.17.6] commit falhou:', e);
    }
  },

  // Save user profile to Firestore
  //
  // v0.16.5 fix for silent data loss: the previous version wrote the full
  // profile object with `|| ''` / `|| []` fallbacks, which meant any field
  // not yet loaded into currentUser (race between login and loadUserProfile)
  // got persisted as empty string / empty array and WIPED the existing
  // Firestore value. Symptom reported: "mudo o perfil, salvo, fecho o app,
  // reabro e as informações somem". Now we:
  //   1. Add the presence settings to the save payload (they were never
  //      persisted before — set on currentUser but never written).
  //   2. Strip undefined fields so a race-hydrated currentUser can't clobber
  //      existing Firestore data.
  //   3. Drop friends / friendRequests* from this payload — those are owned
  //      by the dedicated FirestoreDB.sendFriendRequest /
  //      acceptFriendRequest / removeFriend flows which use arrayUnion /
  //      arrayRemove. Writing them here on every profile save was another
  //      clobber path when currentUser wasn't fully hydrated.
  async saveUserProfileToFirestore() {
    if (!window.FirestoreDB || !window.FirestoreDB.db || !this.currentUser) return;
    var user = this.currentUser;
    var uid = user.uid || user.email;
    var payload = {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      gender: user.gender,
      birthDate: user.birthDate,
      age: user.age,
      city: user.city,
      state: user.state,
      country: user.country,
      locale: user.locale,
      phone: user.phone,
      phoneCountry: user.phoneCountry,
      preferredSports: user.preferredSports,
      // defaultCategory removed v1.3.98-beta — skill lives in skillBySport
      acceptFriendRequests: user.acceptFriendRequests,
      notifyPlatform: user.notifyPlatform,
      notifyEmail: user.notifyEmail,
      notifyWhatsApp: user.notifyWhatsApp,
      notifyLevel: user.notifyLevel,
      preferredCeps: user.preferredCeps,
      preferredLocations: user.preferredLocations,
      presenceVisibility: user.presenceVisibility,
      presenceMuteDays: user.presenceMuteDays,
      presenceMuteUntil: user.presenceMuteUntil,
      presenceAutoCheckin: user.presenceAutoCheckin,
      omitEmail: user.omitEmail,
      omitPhone: user.omitPhone,
      updatedAt: new Date().toISOString()
    };
    // Strip undefined so merge-save preserves existing Firestore values
    // for fields that were never hydrated into currentUser.
    Object.keys(payload).forEach(function(k) {
      if (payload[k] === undefined) delete payload[k];
    });
    // v0.16.6 defense-in-depth: Firestore set({merge:true}) preserves fields
    // apenas quando são `undefined` — strings vazias "" e arrays vazios []
    // ainda sobrescrevem o valor existente. Esse era exatamente o buraco
    // que fazia o perfil sumir: race condition pintava currentUser com ""
    // antes do loadUserProfile merge, save persistia "", Firestore passava
    // a ter "" definitivo. Agora também removemos "" e [] dos campos
    // opcionais. Booleans, phoneCountry (default "55") e notifyLevel
    // (default "todas") continuam sendo escritos sempre.
    var _optionalTextFields = ['gender', 'birthDate', 'city', 'state', 'country',
                               'phone', 'preferredCeps'];
    var _optionalArrayFields = ['preferredSports', 'preferredLocations'];
    _optionalTextFields.forEach(function(k) {
      if (payload[k] === '') delete payload[k];
    });
    _optionalArrayFields.forEach(function(k) {
      if (Array.isArray(payload[k]) && payload[k].length === 0) delete payload[k];
    });
    var _persistedKeys = Object.keys(payload).sort();
    window._log('[Profile Save]', uid, 'fields persisted:', _persistedKeys.join(','));
    // v0.16.7: evidência em tela. Expõe o último save pra UI consumir.
    // v0.16.8: agora compara VALORES no round-trip (não só presença da chave).
    // v0.16.7 checava apenas `_roundtrip[k] === undefined`, o que passava mesmo
    // quando Firestore rejeitava silenciosamente a gravação — o doc antigo
    // retornava com o VALOR VELHO da chave, que não é undefined, logo o check
    // passava e o toast mostrava ✅. Agora comparamos stringify do valor
    // enviado com o valor realmente gravado — se diferente, vai pra
    // `roundtripMismatch` e o toast mostra exatamente qual campo regrediu.
    window._lastProfileSave = {
      uid: uid,
      version: window.SCOREPLACE_VERSION,
      at: new Date().toISOString(),
      fields: _persistedKeys,
      payload: payload
    };
    try {
      await window.FirestoreDB.saveUserProfile(uid, payload);
      window._lastProfileSave.ok = true;
      // Verificação round-trip: lê de volta e confirma que os VALORES chegaram.
      try {
        var _roundtrip = await window.FirestoreDB.loadUserProfile(uid);
        var _missing = [];
        var _mismatch = [];
        _persistedKeys.forEach(function(k) {
          if (k === 'updatedAt') return; // timestamp muda sempre — ignorar
          if (!_roundtrip || _roundtrip[k] === undefined) {
            _missing.push(k);
            return;
          }
          // Compara valor enviado com valor gravado. JSON.stringify é
          // bom o suficiente pra primitivos, arrays e objetos simples.
          var _sent = JSON.stringify(payload[k]);
          var _got = JSON.stringify(_roundtrip[k]);
          if (_sent !== _got) {
            _mismatch.push({ field: k, sent: payload[k], got: _roundtrip[k] });
          }
        });
        window._lastProfileSave.roundtripMissing = _missing;
        window._lastProfileSave.roundtripMismatch = _mismatch;
        if (_missing.length > 0) window._warn('[Profile Save] roundtrip missing:', _missing);
        if (_mismatch.length > 0) window._warn('[Profile Save] roundtrip mismatch:', _mismatch);
      } catch (_e) {
        window._lastProfileSave.roundtripError = (_e && _e.message) || String(_e);
      }
    } catch (e) {
      window._lastProfileSave.ok = false;
      window._lastProfileSave.error = (e && e.message) || String(e);
      throw e;
    }
  },

  // v0.17.42: toggleViewMode removido — visão é sempre baseada na permissão
  // real do usuário no torneio específico (organizerEmail/coHosts), não num
  // toggle global. O botão "Visão Organizador/Participante" foi eliminado
  // do topbar porque adicionava ruído sem entregar valor — todas as views
  // já mostravam o mesmo conteúdo, só os botões de admin variavam, e isso
  // já era checado por isOrganizer(t) per-torneio.

  isOrganizer(tournament) {
    if (!this.currentUser) return false;
    var email = this.currentUser.email;
    var uid = this.currentUser.uid;
    // v2.8.79: uid é identidade primária. Criador por uid OU organizerEmail.
    if (uid && tournament.creatorUid && tournament.creatorUid === uid) return true;
    if (email && tournament.organizerEmail === email) return true;
    if (Array.isArray(tournament.coHosts)) {
      return tournament.coHosts.some(function(ch) {
        if (!ch || ch.status !== 'active') return false;
        // Co-host casa por UID (primário) OU email (fallback, ambos não-vazios).
        // ANTES casava só `ch.email === email`: co-host com email '' (ex.: conta
        // por telefone) nunca virava organizador — sumiam Análise/Enquete/etc.
        if (uid && ch.uid && ch.uid === uid) return true;
        if (email && ch.email && ch.email === email) return true;
        return false;
      });
    }
    return false;
  },

  isCreator(tournament) {
    if (!this.currentUser) return false;
    // v2.8.79: uid primeiro (robusto pra criador com conta por telefone/sem email).
    if (this.currentUser.uid && tournament.creatorUid && tournament.creatorUid === this.currentUser.uid) return true;
    var creator = tournament.creatorEmail || tournament.organizerEmail;
    return !!(creator && this.currentUser.email && creator === this.currentUser.email);
  },

  getVisibleTournaments() {
    var invitedIds = this._invitedTournamentIds || [];
    var cu = window.AppStore.currentUser;
    return this.tournaments.filter(function(t) {
      if (t.isPublic) return true;
      if (invitedIds.indexOf(String(t.id)) !== -1) return true;
      if (!cu || !cu.uid) return false;
      // v1.8.99: uid é a única fonte de identificação
      if (t.creatorUid === cu.uid) return true;
      if (Array.isArray(t.memberUids) && t.memberUids.indexOf(cu.uid) !== -1) return true;
      // Fallback estreito: só para torneios antigos migrados antes da v1.8.99
      // (memberUids pode estar vazio se a migração falhou)
      if (!Array.isArray(t.memberUids) || t.memberUids.length === 0) {
        if (cu.email) {
          var _em = cu.email.toLowerCase();
          if (t.organizerEmail && t.organizerEmail.toLowerCase() === _em) return true;
          if (Array.isArray(t.memberEmails) && t.memberEmails.indexOf(_em) !== -1) return true;
        }
      }
      return false;
    });
  },

  getMyOrganized() {
    if (!this.currentUser) return [];
    var uid = this.currentUser.uid;
    var email = this.currentUser.email;
    return this.tournaments.filter(function(t) {
      if (uid && t.creatorUid === uid) return true;
      // Fallback: organizerEmail para torneios antigos sem creatorUid
      return email && t.organizerEmail === email;
    });
  },

  getMyParticipations() {
    if (!this.currentUser || !this.currentUser.uid) return [];
    var uid = this.currentUser.uid;
    // Verifica inscrição REAL em participants[] (uid solo, p1Uid/p2Uid de dupla
    // formada, ou sub-participante de time). Preserva o match de duplas por uid.
    var _isEnrolledInParts = function(t) {
      var pList = Array.isArray(t.participants) ? t.participants : [];
      return pList.some(function(p) {
        if (typeof p !== 'object' || !p) return false;
        if (p.uid === uid) return true;
        if (p.p1Uid === uid || p.p2Uid === uid) return true;
        if (Array.isArray(p.participants)) {
          return p.participants.some(function(sub) { return sub && sub.uid === uid; });
        }
        return false;
      });
    };
    return this.tournaments.filter(function(t) {
      // v2.2.45 FIX: memberUids[] inclui creatorUid + uids de co-hosts SÓ pra
      // read-access nas regras do Firestore — NÃO é prova de inscrição. Antes,
      // o organizador caía aqui e o próprio torneio aparecia em "Participando"
      // sem ele ter clicado em Inscrever-se. Agora: membro normal (não
      // organizador/co-host) presente em memberUids conta direto; organizador
      // ou co-host só conta se realmente se inscreveu em participants[].
      var inMembers = Array.isArray(t.memberUids) && t.memberUids.indexOf(uid) !== -1;
      // Fallback: torneios sem memberUids (migração pendente)
      if (!Array.isArray(t.memberUids) || t.memberUids.length === 0) {
        return _isEnrolledInParts(t);
      }
      if (!inMembers) return false;
      var isCreator = !!(t.creatorUid && t.creatorUid === uid);
      var isCoHost = Array.isArray(t.coHosts) && t.coHosts.some(function(ch) {
        return ch && ch.status === 'active' && ch.uid === uid;
      });
      if (!isCreator && !isCoHost) return true; // membro comum = participante
      return _isEnrolledInParts(t); // organizador/co-host: exige inscrição real
    });
  },

  addTournament(data) {
    var id = data.id || ('tour_' + Date.now());
    // v3.0.x: EDIÇÃO vs CRIAÇÃO. Antes, TODO save do editor fazia `push` cego — mesmo
    // editando um torneio que já existia em memória. Resultado: DUAS cópias do mesmo
    // torneio em store.tournaments (uma podia ser stale, ex.: cache reidratado), e um
    // sync/save posterior persistia a cópia velha POR CIMA da config (Confra perdia
    // fases/Rei-Rainha/"deixar de fora"). Além disso o `Object.assign({defaults}, data)`
    // re-aplicava defaults de criação numa edição. Agora: se o id já existe, MESCLA as
    // mudanças sobre o objeto vivo NO LUGAR (sem duplicar, sem default); só criação nova
    // aplica os defaults e dá push.
    var _idx = -1;
    for (var _i = 0; _i < this.tournaments.length; _i++) {
      if (String(this.tournaments[_i].id) === String(id)) { _idx = _i; break; }
    }
    var tourData;
    if (_idx !== -1) {
      Object.assign(this.tournaments[_idx], data);
      this.tournaments[_idx].id = id;
      tourData = this.tournaments[_idx];
    } else {
      tourData = Object.assign({
        id: id,
        createdAt: new Date().toISOString(),
        // Default status='open' pra que torneios novos apareçam no feed público de
        // discovery (a query filtra por status=='open'). Só pra CRIAÇÃO.
        status: 'open',
        participants: [],
        standbyParticipants: [],
        history: [{
          date: new Date().toISOString(),
          message: 'Torneio Criado'
        }]
      }, data);
      tourData.id = id;
      this.tournaments.push(tourData);
    }
    // Save to Firestore immediately (saveTournament captura o _allowConfigReset de forma
    // SÍNCRONA no cleanData antes de qualquer await, então pode remover da memória logo após).
    if (window.FirestoreDB && window.FirestoreDB.db) {
      window.FirestoreDB.saveTournament(tourData).catch(function(err) {
        window._error('Erro ao salvar torneio:', err);
        // permission-denied = token expirado ou regra de auth — não é bug de código
        if (err && err.code === 'permission-denied') {
          if (typeof showNotification === 'function') {
            showNotification('Sessão expirada', 'Faça login novamente para salvar o torneio.', 'warning');
          }
          return;
        }
        if (typeof window._captureException === 'function') {
          window._captureException(err, { area: 'addTournament', tournamentId: id, code: err && err.code });
        }
      });
    }
    // Flag transiente: NUNCA pode sobrar na memória/cache, senão um sync futuro
    // "autorizaria" um reset de config sem o organizador ter pedido.
    delete tourData._allowConfigReset;
    // Cache fresco NA HORA — não espera o echo do listener (que pode demorar ou nem vir se
    // o app fecha logo após salvar). Mata a janela "config salva mas cache velho na reabertura".
    this._saveToCache();
    return id;
  },

  logAction(tournamentId, message) {
    var t = this.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (t) {
      if (!t.history) t.history = [];
      t.history.push({
        date: new Date().toISOString(),
        message: message
      });
      // Note: does NOT call sync() here — the caller is responsible for saving.
      // This avoids double Firestore writes since every logAction is followed by a sync().
    }
  },

  hasOrganizedTournaments() {
    if (!this.currentUser) return false;
    var email = this.currentUser.email;
    var uid = this.currentUser.uid;
    // v2.8.79: uid-primário (criador por uid; organizerEmail como fallback)
    return this.tournaments.some(function(t) {
      return (uid && t.creatorUid === uid) || (email && t.organizerEmail === email);
    });
  }
};

// ─── Tournament Templates (Firestore + localStorage fallback) ─────────────
window._templateCache = null;

window._getTemplates = function() {
  return window._templateCache || [];
};

window._loadTemplates = async function() {
  var u = window.AppStore && window.AppStore.currentUser;
  if (!u || !u.uid) { window._templateCache = []; return []; }
  try {
    var templates = await window.FirestoreDB.getTemplates(u.uid);
    window._templateCache = templates;
    // Migrate localStorage templates to Firestore (one-time)
    var lsKey = 'scoreplace_templates_' + u.email;
    var lsRaw = localStorage.getItem(lsKey);
    if (lsRaw) {
      try {
        var lsTemplates = JSON.parse(lsRaw);
        if (Array.isArray(lsTemplates) && lsTemplates.length > 0) {
          for (var i = 0; i < lsTemplates.length; i++) {
            if (!lsTemplates[i].createdAt) lsTemplates[i].createdAt = new Date().toISOString();
            await window.FirestoreDB.saveTemplate(u.uid, lsTemplates[i]);
          }
          localStorage.removeItem(lsKey);
          templates = await window.FirestoreDB.getTemplates(u.uid);
          window._templateCache = templates;
        }
      } catch(e) { localStorage.removeItem(lsKey); }
    }
    return templates;
  } catch(e) {
    window._warn('[Templates] Firestore load failed, using localStorage:', e);
    // Fallback to localStorage
    var lsKey2 = 'scoreplace_templates_' + (u.email || '');
    try {
      var raw = localStorage.getItem(lsKey2);
      window._templateCache = raw ? JSON.parse(raw) : [];
    } catch(e2) { window._templateCache = []; }
    return window._templateCache;
  }
};

// v2.7.37: é ESTE participante um organizador (criador ou co-host ATIVO)? Aceita o
// objeto participante (checa uid/email + p1/p2 de duplas). Usado pra ESTRELA + fixar
// no topo da lista de Inscritos (organizadores no topo, como os VIPs).
window._isOrgParticipant = function (t, p) {
  if (!t || !p || typeof p !== 'object') return false;
  var uids = [p.uid || '', p.p1Uid || '', p.p2Uid || ''].filter(Boolean);
  var emails = [p.email, p.p1Email, p.p2Email].map(function (e) { return String(e || '').toLowerCase(); }).filter(Boolean);
  if (t.creatorUid && uids.indexOf(t.creatorUid) >= 0) return true;
  var cE = String(t.creatorEmail || '').toLowerCase();
  var oE = String(t.organizerEmail || '').toLowerCase();
  if (cE && emails.indexOf(cE) >= 0) return true;
  if (oE && emails.indexOf(oE) >= 0) return true;
  if (Array.isArray(t.coHosts)) {
    for (var i = 0; i < t.coHosts.length; i++) {
      var ch = t.coHosts[i];
      if (!ch || ch.status !== 'active') continue;
      if (ch.uid && uids.indexOf(ch.uid) >= 0) return true;
      if (ch.email && emails.indexOf(String(ch.email).toLowerCase()) >= 0) return true;
    }
  }
  return false;
};

// v3.0.x: org de UM jogador específico — NÃO contamina o parceiro. _isOrgParticipant
// olha p1Uid/p2Uid do TIME, então uma dupla SORTEADA com o organizador (ou co-host)
// marcava o parceiro como organizador (⭐). Aqui resolvemos o uid/email DAQUELE jogador
// (casando o nome com p1Name/p2Name) e só comparamos esse. Bug: Cocozza/Thereza viraram
// "organizadoras" por estarem na dupla do org/co-host.
window._isOrgPlayer = function (t, playerName, pObj) {
  if (!t) return false;
  var nm = String(playerName == null ? '' : playerName).trim();
  var uid = '', email = '';
  if (pObj && typeof pObj === 'object') {
    if (pObj.p1Name && String(pObj.p1Name).trim() === nm) { uid = pObj.p1Uid || ''; email = pObj.p1Email || ''; }
    else if (pObj.p2Name && String(pObj.p2Name).trim() === nm) { uid = pObj.p2Uid || ''; email = pObj.p2Email || ''; }
    else if (Array.isArray(pObj.participants)) {
      var _m = pObj.participants.filter(function (s) { return s && String(s.displayName || s.name || '').trim() === nm; })[0];
      if (_m) { uid = _m.uid || ''; email = _m.email || ''; }
    } else { uid = pObj.uid || ''; email = pObj.email || ''; }
  }
  email = String(email || '').toLowerCase();
  if (uid && t.creatorUid && uid === t.creatorUid) return true;
  var cE = String(t.creatorEmail || '').toLowerCase(), oE = String(t.organizerEmail || '').toLowerCase();
  if (email && (email === cE || email === oE)) return true;
  if (Array.isArray(t.coHosts)) {
    for (var j = 0; j < t.coHosts.length; j++) {
      var c = t.coHosts[j];
      if (!c || c.status !== 'active') continue;
      if (c.uid && uid && c.uid === uid) return true;
      if (c.email && email && String(c.email).toLowerCase() === email) return true;
    }
  }
  // fallback por NOME (org/co-host sem uid resolvido neste objeto)
  if (typeof window._isOrgName === 'function' && window._isOrgName(nm, t)) return true;
  return false;
};

window._saveTemplate = async function(template) {
  var u = window.AppStore && window.AppStore.currentUser;
  if (!u || !u.uid) return 'error';
  // Ensure cache is loaded
  if (window._templateCache === null) await window._loadTemplates();
  var templates = window._getTemplates();
  var isPro = u && u.plan === 'pro';
  if (!isPro && templates.length >= 10) return 'limit';
  template.createdAt = new Date().toISOString();
  try {
    var id = await window.FirestoreDB.saveTemplate(u.uid, template);
    if (id) {
      template._id = id;
      window._templateCache = window._templateCache || [];
      window._templateCache.unshift(template);
      return 'ok';
    }
    return 'error';
  } catch(e) {
    window._warn('[Templates] Firestore save failed, using localStorage:', e);
    // Fallback: save to localStorage
    template._id = 'tpl_' + Date.now();
    window._templateCache = window._templateCache || [];
    window._templateCache.unshift(template);
    var lsKey = 'scoreplace_templates_' + (u.email || '');
    try { localStorage.setItem(lsKey, JSON.stringify(window._templateCache)); } catch(e2) {}
    return 'ok';
  }
};

window._deleteTemplate = async function(templateId) {
  var u = window.AppStore && window.AppStore.currentUser;
  if (!u || !u.uid || !templateId) return;
  try { await window.FirestoreDB.deleteTemplate(u.uid, templateId); } catch(e) {}
  window._templateCache = (window._templateCache || []).filter(function(t) { return t._id !== templateId; });
};

window._applyTemplate = function(index) {
  var templates = window._getTemplates();
  return (index >= 0 && index < templates.length) ? templates[index] : null;
};

// ─── Crown helper: adds crown SVG next to organizer names ──────────────────
window._CROWN_MINI = '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(251,191,36,0.85)" style="flex-shrink:0;vertical-align:middle;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

window._isOrgName = function(name, tournament) {
  if (!name || !tournament) return false;
  var orgName = tournament.organizerName || '';
  var orgEmail = tournament.organizerEmail || '';
  if (name === orgName || name === orgEmail) return true;
  if (Array.isArray(tournament.coHosts)) {
    return tournament.coHosts.some(function(ch) {
      return ch.status === 'active' && (ch.displayName === name || ch.email === name);
    });
  }
  return false;
};

window._nameWithCrown = function(name, tournament) {
  var safe = window._safeHtml(name);
  if (window._isOrgName(name, tournament)) {
    return safe + ' ' + window._CROWN_MINI;
  }
  return safe;
};

// v3.0.x: nome de EQUIPE nas tabelas (standings). Quando é dupla "A / B", quebra
// após o " / " — 1º jogador (com a barra) na 1ª linha, 2º embaixo, alinhado à
// esquerda. Para solo, retorna igual ao _nameWithCrown.
window._teamNameBreakHtml = function(name, tournament) {
  var base = (typeof window._nameWithCrown === 'function')
    ? window._nameWithCrown(name, tournament)
    : (window._safeHtml ? window._safeHtml(name) : String(name == null ? '' : name));
  return String(base).replace(/ \/ /g, ' /<br>');
};

// ─── Enrollment lookup: matches user against a participant (incl. team members) ─
// A participant can be:
//  • string "Name"                           → match vs user.displayName/email
//  • string "Name1 / Name2"                  → team — match any member
//  • object { uid, email, displayName, ... } → top-level fields
//  • object { ..., participants: [ m1, m2 ] }→ team — recurse into each member
//  • object whose displayName/name contains " / " → treat label as team string
window._userMatchesParticipant = function(user, p) {
  if (!user || !p) return false;
  var ue = (user.email || '').toLowerCase();
  var un = user.displayName || '';
  var uu = user.uid || '';
  function matchMember(m) {
    if (!m) return false;
    if (typeof m === 'string') {
      var s = m.trim();
      return (ue && s.toLowerCase() === ue) || (un && s === un);
    }
    if (uu && m.uid && m.uid === uu) return true;
    if (ue && m.email && m.email.toLowerCase() === ue) return true;
    if (un && m.displayName && m.displayName === un) return true;
    if (un && m.name && m.name === un) return true;
    return false;
  }
  if (typeof p === 'string') {
    var parts = p.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean);
    return parts.some(matchMember);
  }
  if (matchMember(p)) return true;
  // v2.7.91: dupla formada pelo aceite grava p1Name/p2Name/p1Uid/p2Uid com displayName
  // = só o nome do p1 (ex.: "Kelly Barth"). Sem checar esses campos, o p2 (ex.: Rodrigo)
  // não era reconhecido como inscrito → botão "Inscrever-se" reaparecia → inscrição em
  // DOBRO. Esta é a RAIZ da duplicata, não só um sintoma de render.
  if (uu && ((p.p1Uid && p.p1Uid === uu) || (p.p2Uid && p.p2Uid === uu))) return true;
  if (un && ((p.p1Name && p.p1Name === un) || (p.p2Name && p.p2Name === un))) return true;
  if (ue && ((p.p1Email && p.p1Email.toLowerCase() === ue) || (p.p2Email && p.p2Email.toLowerCase() === ue))) return true;
  if (Array.isArray(p.participants) && p.participants.some(matchMember)) return true;
  var label = p.displayName || p.name || '';
  if (label && label.indexOf(' / ') !== -1) {
    return label.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean).some(matchMember);
  }
  return false;
};

window._isUserEnrolledInTournament = function(user, tournament) {
  if (!user || !tournament) return false;
  var arr = Array.isArray(tournament.participants) ? tournament.participants : (tournament.participants ? Object.values(tournament.participants) : []);
  return arr.some(function(p) { return window._userMatchesParticipant(user, p); });
};

// v2.7.97: NÚMERO DE INSCRIÇÃO POR PESSOA. Antes a dupla compartilhava UM número e a
// contagem somava 1 pela dupla ("12 em vez de 13"). Agora CADA pessoa tem o SEU número:
// solo → p.enrollSeq; dupla → p.p1Seq (membro esquerdo) e p.p2Seq (membro direito).
// _ensureEnrollSeqs atribui seqs faltantes (legado/novos inscritos) preenchendo lacunas
// SEM colidir com os já guardados (o form guarda os originais → ficam estáveis).
window._ensureEnrollSeqs = function(t) {
  if (!t) return;
  var arr = Array.isArray(t.participants) ? t.participants : [];
  var used = {};
  function mark(s){ if (s != null && !isNaN(s)) used[s] = 1; }
  arr.forEach(function(p){ if (p && typeof p === 'object') { mark(p.enrollSeq); mark(p.p1Seq); mark(p.p2Seq); } });
  var nf = 1;
  function alloc(){ while (used[nf]) nf++; used[nf] = 1; return nf; }
  arr.forEach(function(p){
    if (!p || typeof p !== 'object') return; // string legada: tratada on-the-fly no map
    if (p.p1Name && p.p2Name) {
      if (p.p1Seq == null) p.p1Seq = alloc();
      if (p.p2Seq == null) p.p2Seq = alloc();
    } else if (p.enrollSeq == null) {
      p.enrollSeq = alloc();
    }
  });
};
window._buildEnrollOrderMap = function(t) {
  if (typeof window._ensureEnrollSeqs === 'function') window._ensureEnrollSeqs(t);
  var map = {};
  var arr = Array.isArray(t.participants) ? t.participants : [];
  var maxSeq = 0;
  arr.forEach(function(p){ if (p && typeof p === 'object') [p.enrollSeq, p.p1Seq, p.p2Seq].forEach(function(s){ if (s != null && s > maxSeq) maxSeq = s; }); });
  var strNext = maxSeq;
  function put(uid, name, seq){ if (seq == null) return; if (uid) map['u:'+uid] = seq; if (name) map['n:'+String(name).trim().toLowerCase()] = seq; }
  arr.forEach(function(p){
    if (typeof p === 'string') { String(p).split(' / ').forEach(function(nm){ nm = nm.trim(); if (nm) put(null, nm, ++strNext); }); return; }
    if (!p || typeof p !== 'object') return;
    if (p.p1Name && p.p2Name) { put(p.p1Uid, p.p1Name, p.p1Seq); put(p.p2Uid, p.p2Name, p.p2Seq); }
    else { put(p.uid, p.displayName || p.name, p.enrollSeq); }
  });
  return map;
};
// nº de inscrição de UMA pessoa (1-based) — uid primeiro, nome como fallback.
window._enrollNumber = function(orderMap, p) {
  if (!orderMap || !p) return '';
  var cand = [];
  if (typeof p === 'object') {
    if (p.uid)   cand.push('u:' + p.uid);
    if (p.p1Uid) cand.push('u:' + p.p1Uid);
    if (p.p2Uid) cand.push('u:' + p.p2Uid);
    [p.displayName, p.name].forEach(function(nm){ if (nm) cand.push('n:' + String(nm).toLowerCase().trim()); });
  } else {
    cand.push('n:' + String(p).toLowerCase().trim());
  }
  for (var i = 0; i < cand.length; i++) { if (orderMap[cand[i]] != null) return orderMap[cand[i]]; }
  return '';
};
// total de PESSOAS inscritas (dupla conta 2) — pra a contagem "Inscritos".
window._personCount = function(t) {
  var arr = Array.isArray(t && t.participants) ? t.participants : [];
  var n = 0;
  arr.forEach(function(p){
    // v3.0.x CANON: dupla/time por ESTRUTURA (slots p1/p2 ou participants[]) → conta os membros.
    // Antes ignorava a forma p.participants[] e a contava como 1 pessoa (subcontagem de inscritos).
    var m = (typeof window._entryTeamMembers === 'function') ? window._entryTeamMembers(p) : null;
    if (m) { n += m.length; return; }
    // String legada "A / B" (helper retorna null pra string solta) → conta os membros.
    if (typeof p === 'string' && p.indexOf(' / ') !== -1) { n += p.split(' / ').filter(function(s){ return s.trim(); }).length; return; }
    n += 1;
  });
  return n;
};
// Marca d'água do número de inscrição no canto sup. direito (mesmo estilo do card de
// inscrito do participants.js): grande, semitransparente, não-interativo.
// v2.8.57: número de inscrição como marca-d'água que ocupa ~60% da ALTURA do card
// (centralizado verticalmente → ~20% de margem acima/abaixo), independente da altura do
// card (auto-height). SVG com viewBox + preserveAspectRatio escala o dígito sozinho —
// `height:60%` resolve contra a caixa do card (position:relative). `side` ('right' padrão
// | 'left') mantém a posição horizontal.
window._enrollNumberBadge = function(num, side) {
  if (num === '' || num == null) return '';
  side = (side === 'left') ? 'left' : 'right';
  var n = String(num);
  // v3.0.x: número GRANDE (≈76% da altura do card) e SEM corte. A causa do corte era o
  // glifo VAZANDO os limites: largura por dígito curta demais pro peso 900 → o número
  // transbordava o próprio box e a borda do card (overflow:hidden) cortava. Fix: `textLength`
  // = largura da viewBox (lengthAdjust ajusta espaçamento/glifo) trava a largura, e a viewBox
  // tem largura por dígito generosa (60) — o número nunca vaza, nem na direita nem na esquerda.
  // height 52% + folga vertical (medido: ~12px topo/base, livre dos cantos arredondados).
  var vbH = 76;                            // glifo (fonte 100) preenche a viewBox → número cheio
  var vbW = n.length * 60;
  return '<svg aria-hidden="true" style="position:absolute;top:50%;transform:translateY(-50%);' + side + ':14px;height:52%;max-height:54px;width:auto;pointer-events:none;user-select:none;z-index:0;overflow:visible;" ' +
    'viewBox="0 0 ' + vbW + ' ' + vbH + '" preserveAspectRatio="xMidYMid meet">' +
    '<text x="' + (vbW / 2) + '" y="' + (vbH / 2) + '" textLength="' + vbW + '" lengthAdjust="spacingAndGlyphs" text-anchor="middle" dominant-baseline="central" font-size="100" font-weight="900" ' +
    'fill="rgba(255,255,255,0.10)" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif">' + window._safeHtml(n) + '</text></svg>';
};

// v3.0.x: classificação GERAL COLAPSADA pra ficar SEMPRE abaixo do pódio no torneio
// encerrado. Liga/Suíço → standings; eliminatória/multi-fase → classificação progressiva
// (faux sobre os jogos da fase final, 3º/4º como thirdPlaceMatch). Retorna '' se não há
// dados (não polui). Colapsada por padrão (<details> sem open).
window._collapsedClassifHtml = function (t) {
  if (!t) return '';
  var rows = [];
  var isLiga = (typeof window._isLigaFormat === 'function' && window._isLigaFormat(t)) ||
    (Array.isArray(t.rounds) && t.rounds.length && (!Array.isArray(t.matches) || !t.matches.length));
  if (isLiga && typeof window._computeStandings === 'function') {
    try {
      var st = window._computeStandings(t);
      if (Array.isArray(st) && st.length) rows = st.map(function (s, i) { return { pos: i + 1, name: (s && (s.name || s.player)) || '' }; });
    } catch (e) {}
  }
  if (!rows.length && Array.isArray(t.matches) && t.matches.length && typeof window._updateProgressiveClassification === 'function') {
    try {
      var ph = t.matches;
      if (typeof t.currentPhaseIndex === 'number' && Array.isArray(t.phases) && t.phases.length > 1) {
        var fp = t.matches.filter(function (m) { return (m.phaseIndex || 0) === t.currentPhaseIndex; });
        if (fp.length) ph = fp;
      }
      var third = ph.filter(function (m) { return m.isThirdPlace || (m.bracket || '') === 'thirdplace'; })[0] || null;
      var rest = ph.filter(function (m) { return m !== third; });
      var faux = { matches: rest, format: 'Eliminatórias Simples', thirdPlaceMatch: third, tiebreakers: t.tiebreakers };
      window._updateProgressiveClassification(faux);
      var cl = faux.classification || {}, keys = Object.keys(cl);
      if (keys.length) rows = keys.map(function (k) { return { pos: cl[k], name: k }; }).sort(function (a, b) { return a.pos - b.pos; });
    } catch (e) {}
  }
  if (!rows.length) return '';
  var medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  var body = rows.map(function (r) {
    var c = r.pos === 1 ? '#fbbf24' : r.pos === 2 ? '#94a3b8' : r.pos === 3 ? '#cd7f32' : 'var(--text-muted)';
    var nm = (typeof window._nameWithCrown === 'function') ? window._nameWithCrown(r.name, t) : window._safeHtml(r.name);
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 14px;">' +
      '<span style="min-width:30px;text-align:center;font-weight:800;color:' + c + ';">' + r.pos + 'º</span>' +
      '<span style="flex:1;min-width:0;font-weight:600;color:' + c + ';">' + nm + '</span>' +
      (r.pos <= 3 ? '<span style="font-size:1.05rem;flex-shrink:0;">' + medals[r.pos] + '</span>' : '') + '</div>';
  }).join('');
  return '<details style="margin-top:1rem;"><summary style="cursor:pointer;font-weight:700;font-size:0.82rem;color:var(--text-bright,#f1f5f9);padding:9px 14px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;user-select:none;">📊 Classificação geral (' + rows.length + ')</summary><div style="margin-top:6px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:6px 0;">' + body + '</div></details>';
};

// ─── Competitors helper: filter out non-competing organizers from participants ─
// Returns an array of participants excluding the organizer/co-hosts who didn't
// explicitly enroll (selfEnrolled flag). Works for both old and new tournaments.
window._getCompetitors = function(t) {
  if (!t || !t.participants) return [];
  var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
  var orgEmail = (t.organizerEmail || '').toLowerCase();
  var orgName = (t.organizerName || '').toLowerCase();
  // v2.4.83: só co-hosts ATIVOS deixam de ser competidores. Um convite de
  // co-organização PENDENTE não muda o status do participante — ele continua
  // inscrito (e competindo) até aceitar. Antes, qualquer co-host (mesmo pendente)
  // era excluído na hora do convite, fazendo o inscrito "sumir" da lista assim
  // que era arrastado pra promover — e impedindo a tag "Aguardando aceite".
  var coHostEmails = {};
  if (Array.isArray(t.coHosts)) {
    t.coHosts.forEach(function(ch) { if (ch.email && ch.status === 'active') coHostEmails[ch.email.toLowerCase()] = true; });
  }
  return parts.filter(function(p) {
    if (p && p.selfEnrolled) return true; // explicitly enrolled — always keep
    var email = '', name = '';
    if (typeof p === 'string') {
      name = p.toLowerCase();
    } else if (p) {
      email = (p.email || '').toLowerCase();
      name = (p.displayName || p.name || '').toLowerCase();
    }
    // Times/duplas são SEMPRE competidores reais — nunca excluir por match com
    // organizador/co-host. Uma dupla que inclui o organizador (ex: "Kelly /
    // Rodrigo Barth", onde Rodrigo é o org) é uma equipe que joga e conta como
    // competidor — caso contrário o programa some com 1 time inteiro e mostra
    // "2 inscritos / 1 time" quando são 4 inscritos / 2 times.
    var isTeam = false;
    if (p && typeof p === 'object') {
      if (Array.isArray(p.participants) && p.participants.length > 1) isTeam = true;
      if (p.p1Name && p.p2Name) isTeam = true;
    }
    if (name.indexOf(' / ') !== -1) isTeam = true;
    if (isTeam) return true;
    // Exclude organizer who didn't self-enroll (apenas entradas SOLO)
    if (orgEmail && email && email === orgEmail) return false;
    if (!email && orgName && name && name === orgName) return false;
    // Exclude co-hosts who didn't self-enroll
    if (email && coHostEmails[email]) return false;
    return true;
  });
};

// v0.17.42: updateViewModeVisibility removido junto com o botão Visão.
// Stub mantido como no-op pra compat com chamadas residuais — qualquer
// caller que ainda invoque não quebra. Pode ser removido na próxima
// limpeza geral.
window.updateViewModeVisibility = function() {};

// ─── Auto-scroll during drag (HTML5 + touch) ───────────────────────────────
// Scrolls the nearest scrollable container (or window) when the pointer
// approaches the top/bottom viewport edge during a drag. HTML5 drags are
// handled automatically via document-level dragover. Custom touch-drag code
// should call window._dragAutoScrollOnTouchMove(event) from its touchmove
// handler and window._dragAutoScrollStop() from its touchend handler.
(function(){
  var EDGE = 80;       // px from viewport edge where auto-scroll kicks in
  var MAX_SPEED = 18;  // px per animation frame at the very edge
  var IDLE_MS = 150;   // stop auto-scroll if no pointer event within this window
  var rafId = null;
  var lastY = -1;
  var lastEvt = 0;
  var container = null;

  function isScrollable(el) {
    if (!el || el === document.documentElement || el === document.body) return false;
    var cs = getComputedStyle(el);
    var oy = cs.overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > 1;
  }
  function findScrollable(startEl) {
    var el = startEl;
    while (el && el !== document.body) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function tick() {
    if (Date.now() - lastEvt > IDLE_MS || lastY < 0) {
      rafId = null; container = null; return;
    }
    var vh = window.innerHeight;
    var delta = 0;
    if (lastY < EDGE) delta = -Math.ceil(MAX_SPEED * (EDGE - lastY) / EDGE);
    else if (lastY > vh - EDGE) delta = Math.ceil(MAX_SPEED * (lastY - (vh - EDGE)) / EDGE);
    if (delta !== 0) {
      if (container) container.scrollTop += delta;
      else window.scrollBy(0, delta);
    }
    rafId = requestAnimationFrame(tick);
  }
  function schedule(x, y) {
    lastY = y;
    lastEvt = Date.now();
    if (!container) {
      var el = document.elementFromPoint(x, y);
      container = findScrollable(el);
    }
    if (!rafId) rafId = requestAnimationFrame(tick);
  }
  function stop() {
    lastY = -1;
    container = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  document.addEventListener('dragover', function(e){ schedule(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('dragend', stop, { passive: true });
  document.addEventListener('drop', stop, { passive: true });

  window._dragAutoScrollOnTouchMove = function(e) {
    var t = e && e.touches && e.touches[0];
    if (t) schedule(t.clientX, t.clientY);
  };
  window._dragAutoScrollStop = stop;
})();
