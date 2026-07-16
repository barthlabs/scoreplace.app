// ─── Landing Page: conversion page for non-logged visitors ──────────────────
(function() {
  'use strict';

  // v0.17.16: lista de modalidades — ícones resolvidos via window._sportIcon
  // (resolver centralizado em store.js). Mantém só os labels.
  var _SPORTS_LANDING = ['Beach Tennis', 'Pickleball', 'Tenis', 'Tenis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'];

  window.renderLanding = function(container) {
    var t = window._t || function(k) { return k; };

    container.innerHTML = '<div class="landing-page">' +
      _css() +
      _hero(t) +
      _features(t) +
      _tutorials() +
      _howItWorks(t) +
      // v0.17.92: _stats() removido — números (500+ torneios, 2.000+
      // participantes, 5 modalidades) eram fictícios. Voltam quando
      // tivermos dados reais relevantes.
      _ctaBottom(t) +
      _footer() +
    '</div>';

    // v0.17.91: handlers do CTA agora são INLINE no atributo onclick do
    // <button> (em _hero e _ctaBottom). Antes eram attached via
    // addEventListener aqui — funcionava no fluxo normal mas QUEBRAVA com
    // prerender estático: o router pulava renderLanding() pra preservar o
    // snapshot baked-in, então addEventListener nunca rodava e o botão
    // ficava morto. Inline onclick é serializado no HTML, então sobrevive
    // ao prerender. Bug reportado pelo usuário: "esse botão não faz nada".
    // No-op aqui — handlers já no HTML.
  };

  function _hero(t) {
    var ver = window.SCOREPLACE_VERSION || '';
    // CTA em duas linhas: ação (ENTRAR) grande em cima, scoreplace.app embaixo.
    var _cta = t('landing.cta');
    var _sp = _cta.indexOf(' ');
    var _ctaL1 = _sp > 0 ? _cta.slice(0, _sp) : _cta;
    var _ctaL2 = _sp > 0 ? _cta.slice(_sp + 1) : '';
    return '<section class="landing-hero">' +
      '<div class="landing-hero-content">' +
        '<div class="landing-logo"><img src="icons/logo-podium.svg?v=0.15.95" alt="scoreplace" width="96" height="72" style="display:inline-block;filter:drop-shadow(0 4px 12px rgba(245,158,11,0.3));"></div>' +
        '<h1 class="landing-title">scoreplace<span class="landing-dot">.app</span></h1>' +
        (ver ? '<div class="landing-version" style="font-size:0.78rem;color:var(--text-muted,#9ca3af);margin-top:-4px;margin-bottom:14px;letter-spacing:0.3px;">v' + ver + '</div>' : '') +
        '<p class="landing-tagline">' + t('landing.tagline') + '</p>' +
        '<button class="btn btn-cta btn-success landing-cta-btn landing-cta-hero" data-landing-cta onclick="if(window._enterApp)window._enterApp();else if(window.openModal)window.openModal(\'modal-login\');else if(window.handleGoogleLogin)window.handleGoogleLogin();">' +
          '<span class="landing-cta-l1">' + _ctaL1 + '</span>' +
          (_ctaL2 ? '<span class="landing-cta-l2">' + _ctaL2 + '</span>' : '') +
        '</button>' +
        // v2.3.99: no Android/desktop o próprio "Entrar" instala (via _enterApp);
        // o botão separado fica SÓ no iPhone (iosOnly), onde "Entrar" não consegue
        // instalar (Apple) — e instalar antes de entrar evita re-login no app.
        ((typeof window._installButtonHtml === 'function')
          ? window._installButtonHtml({ iosOnly: true, cls: 'btn btn-outline', label: '📲 Instalar na tela inicial', style: 'margin-top:10px;font-size:0.92rem;font-weight:600;padding:10px 18px;border-radius:12px;' })
          : '') +
        '<div class="landing-sports-row">' +
          _SPORTS_LANDING.map(function(s) {
            var icon = window._sportIcon ? window._sportIcon(s) : '';
            return '<span class="landing-sport-pill">' + icon + ' ' + s + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function _features(t) {
    var feats = [
      { key: 'feat1', icon: '🎯' },
      { key: 'feat2', icon: '📋' },
      { key: 'feat3', icon: '🔗' },
      { key: 'feat4', icon: '⚡' },
      { key: 'feat5', icon: '📍' },
      { key: 'feat6', icon: '🏢' }
    ];
    var cards = feats.map(function(f) {
      return '<div class="landing-feat-card">' +
        '<div class="landing-feat-icon">' + f.icon + '</div>' +
        '<h3>' + t('landing.' + f.key + 'Title') + '</h3>' +
        '<p>' + t('landing.' + f.key + 'Desc') + '</p>' +
      '</div>';
    }).join('');
    return '<section class="landing-features">' +
      // h2 adicionado pra fix de heading-order na auditoria a11y v0.17.62
      // (h1 do hero → h3 dos cards pulava o h2). visualmente .sr-only
      // pra não bagunçar o layout original — só o screen reader percebe.
      '<h2 class="sr-only">' + t('landing.featuresTitle') + '</h2>' +
      '<div class="landing-grid">' + cards + '</div>' +
    '</section>';
  }

  function _howItWorks(t) {
    var steps = [
      { num: '1', key: 'step1', icon: '🏗️' },
      { num: '2', key: 'step2', icon: '📨' },
      { num: '3', key: 'step3', icon: '🏅' }
    ];
    var html = steps.map(function(s) {
      return '<div class="landing-step">' +
        '<div class="landing-step-num">' + s.icon + '</div>' +
        '<h3>' + t('landing.' + s.key + 'Title') + '</h3>' +
        '<p>' + t('landing.' + s.key + 'Desc') + '</p>' +
      '</div>';
    }).join('<div class="landing-step-arrow">→</div>');
    return '<section class="landing-how">' +
      '<h2>' + t('landing.howTitle') + '</h2>' +
      '<div class="landing-steps">' + html + '</div>' +
    '</section>';
  }

  // v0.17.92: _stats() removido — números fictícios (500+/2.000+/5)
  // suprimidos até termos dados reais. Quando voltarem, restaurar:
  // git show HEAD~N:js/views/landing.js (consultar histórico).

  // v1.7.0-beta: seção de tutoriais em vídeo — 6 YouTube Shorts embeds
  // com lazy-load via thumbnail. Iframe só carrega no clique, evitando
  // 6 requests ao YouTube JS na abertura da landing.
  function _tutorials() {
    var vids = [
      { id: 'ffMcLFj5yIs' },
      { id: 'K5KncI40tIE' },
      { id: 'q_ZEMJ_bs-Y' },
      { id: 'wKy5x0D9E-E' },
      { id: 'XpI7fcdFDn0' },
      { id: 'jiKAdBkMso8' }
    ];
    var cards = vids.map(function(v) {
      var thumb = 'https://img.youtube.com/vi/' + v.id + '/maxresdefault.jpg';
      var embed = 'https://www.youtube.com/embed/' + v.id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
      return '<div class="landing-vid-card" onclick="' +
          'var w=this.querySelector(\'.landing-vid-wrap\');' +
          'w.innerHTML=\'<iframe src=\\\'' + embed + '\\\' frameborder=\\\'0\\\' allow=\\\'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture\\\' allowfullscreen></iframe>\';' +
          'this.querySelector(\'.landing-vid-play\').style.display=\'none\'' +
        '">' +
        '<div class="landing-vid-wrap">' +
          '<img src="' + thumb + '" ' +
            'onerror="this.src=\'https://img.youtube.com/vi/' + v.id + '/hqdefault.jpg\'" ' +
            'alt="Tutorial scoreplace.app" loading="lazy">' +
        '</div>' +
        '<div class="landing-vid-play" aria-label="Reproduzir vídeo">▶</div>' +
      '</div>';
    }).join('');
    return '<section class="landing-tutorials">' +
      '<h2>Veja em ação</h2>' +
      '<p class="landing-tutorials-sub">Tutoriais rápidos de cada funcionalidade</p>' +
      '<div class="landing-vids-grid">' + cards + '</div>' +
    '</section>';
  }

  function _ctaBottom(t) {
    return '<section class="landing-cta-section">' +
      '<button class="btn btn-cta btn-success landing-cta-btn" data-landing-cta onclick="if(window._enterApp)window._enterApp();else if(window.openModal)window.openModal(\'modal-login\');else if(window.handleGoogleLogin)window.handleGoogleLogin();">' +
        t('landing.ctaBottom') +
      '</button>' +
      ((typeof window._installButtonHtml === 'function')
        ? window._installButtonHtml({ iosOnly: true, cls: 'btn btn-outline', label: '📲 Instalar na tela inicial', style: 'margin-top:10px;font-size:0.88rem;font-weight:600;padding:9px 16px;border-radius:12px;' })
        : '') +
    '</section>';
  }

  function _footer() {
    var ver = window.SCOREPLACE_VERSION || '';
    var t = (window._t || function (k) { return k; });
    return '<footer class="landing-footer">' +
      '<p>scoreplace.app v' + ver + '</p>' +
      // contato@barthlabs.com (não o gmail): é o e-mail da empresa e o mesmo do
      // portfólio Barthlabs na Meta — o revisor casa site × registro.
      '<p><a href="mailto:contato@barthlabs.com">contato@barthlabs.com</a></p>' +
      // v0.17.71: links pra privacy + termos (LGPD-ready pra beta)
      '<p style="margin-top:12px;font-size:0.75rem;">' +
        '<a href="#privacy">' + t('privacy.title') + '</a>' +
        ' · ' +
        '<a href="#terms">' + t('terms.title') + '</a>' +
      '</p>' +
      // Razão social por extenso no HTML estático: a Meta casa o site contra o
      // registro do portfólio na verificação da empresa e o crawler dela não
      // executa JS, então isto NÃO pode viver só no i18n de #privacy/#terms.
      '<address class="landing-legal">' +
        '<span>Terra Barth Serviços Administrativos Ltda</span>' +
        '<span>CNPJ 51.590.996/0001-73</span>' +
        '<span>Rua Ministro Alfredo Nasser, 68 — São Paulo, SP, 05516-090, Brasil</span>' +
        '<a href="tel:+5511987726873">+55 11 98772-6873</a>' +
      '</address>' +
    '</footer>';
  }

  function _css() {
    return '<style>' +
    '.landing-page { max-width: 900px; margin: 0 auto; padding: 0 16px; }' +

    /* Hero */
    '.landing-hero { text-align: center; padding: 48px 0 32px; }' +
    '.landing-logo { margin-bottom: 8px; line-height: 0; }' +
    '.landing-title { font-size: 2.2rem; font-weight: 800; color: var(--text-bright); margin: 0; }' +
    '.landing-dot { color: var(--primary-color); }' +
    '.landing-tagline { font-size: 1.1rem; color: var(--text-muted); margin: 12px 0 28px; max-width: 500px; margin-left: auto; margin-right: auto; }' +
    /* a11y v0.17.66: override do .btn-success default (#10b981, contrast 2.53:1
       em texto branco) pra emerald-700 (#047857, ~5:1, passa WCAG AA). Só nos
       CTAs da landing — outros .btn-success do app continuam #10b981.
       v1.0.25-beta: largura total + altura/fonte fluidas via clamp() pra
       escalar com a tela (mobile pequeno → desktop). User explicit: "faça
       com que ele tenha a largura total e altura compativel de acordo com
       a tela". Caps inferior/superior previnem que fique pequeno demais ou
       gigante demais em casos extremos (ex: tablet em landscape). */
    '.landing-cta-btn { display: block; width: 95%; max-width: 760px; margin-left: auto; margin-right: auto; box-sizing: border-box; font-size: clamp(1.05rem, 1.4vw + 0.85rem, 1.55rem); font-weight: 800; padding: clamp(14px, 2vh + 6px, 26px) clamp(16px, 4vw, 48px); border-radius: 14px; cursor: pointer; background: linear-gradient(180deg, #059669 0%, #047857 55%, #036048 100%); letter-spacing: 0.3px; box-shadow: inset 0 3px 0 rgba(255,255,255,0.6), inset 0 13px 17px rgba(255,255,255,0.36), inset 0 -26px 30px rgba(0,0,0,0.38), inset 0 -5px 0 rgba(0,0,0,0.30), 0 12px 30px rgba(5,150,105,0.5), 0 6px 12px rgba(0,0,0,0.32); }' +
    '.landing-cta-btn:active { transform: translateY(3px); box-shadow: inset 0 3px 0 rgba(255,255,255,0.45), inset 0 9px 13px rgba(255,255,255,0.26), inset 0 -16px 20px rgba(0,0,0,0.32), inset 0 -3px 0 rgba(0,0,0,0.26), 0 5px 14px rgba(5,150,105,0.4), 0 2px 5px rgba(0,0,0,0.24); }' +
    '.landing-cta-btn:hover { background: #065f46; }' +
    /* Hero CTA: ~3x mais alto que o botão padrão, texto em 2 linhas grandes.
       Uma usuária confundiu as modalidades com o próximo passo ("clico em
       beach tennis?") — o CTA gigante deixa óbvio onde clicar. */
    '.landing-cta-hero { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(2px, 0.4vh, 8px); padding: clamp(26px, 5vh + 10px, 60px) clamp(26px, 6vw, 56px); line-height: 1.05; }' +
    /* v2.0.9: texto NUNCA cola nas laterais. "ENTRAR" grande (verbo da ação);
       "no scoreplace.app" menor (linha longa) e dimensionado pra sempre caber
       com folga — em tela estreita quebra sozinho (ENTRAR / no / scoreplace.app),
       em tela larga fica em 2 linhas. Composição sempre uniforme. */
    '.landing-cta-hero .landing-cta-l1 { font-size: clamp(2rem, 4.4vw + 1.2rem, 3.8rem); font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; max-width: 100%; }' +
    '.landing-cta-hero .landing-cta-l2 { font-size: clamp(1.45rem, 3.1vw + 0.85rem, 2.9rem); font-weight: 800; letter-spacing: 0.2px; max-width: 100%; overflow-wrap: break-word; word-break: break-word; }' +
    '.landing-sports-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: clamp(40px, 7vh, 72px); }' +
    '.landing-sport-pill { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; padding: 6px 14px; font-size: 0.82rem; color: var(--text-main); cursor: default; }' +

    /* Features grid */
    '.landing-features { padding: 24px 0; }' +
    '.landing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }' +
    '.landing-feat-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; padding: 24px 20px; text-align: center; transition: transform 0.2s, box-shadow 0.2s; }' +
    '.landing-feat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }' +
    '.landing-feat-icon { font-size: 2rem; margin-bottom: 10px; }' +
    '.landing-feat-card h3 { font-size: 1rem; font-weight: 700; color: var(--text-bright); margin: 0 0 8px; }' +
    '.landing-feat-card p { font-size: 0.88rem; color: var(--text-muted); margin: 0; line-height: 1.5; }' +

    /* How it works */
    '.landing-how { padding: 32px 0; text-align: center; }' +
    '.landing-how h2 { font-size: 1.4rem; font-weight: 700; color: var(--text-bright); margin: 0 0 24px; }' +
    '.landing-steps { display: flex; align-items: flex-start; justify-content: center; gap: 12px; flex-wrap: wrap; }' +
    '.landing-step { flex: 1; min-width: 180px; max-width: 240px; text-align: center; }' +
    '.landing-step-num { font-size: 2rem; margin-bottom: 8px; }' +
    '.landing-step h3 { font-size: 0.95rem; font-weight: 700; color: var(--text-bright); margin: 0 0 6px; }' +
    '.landing-step p { font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.5; }' +
    '.landing-step-arrow { font-size: 1.5rem; color: var(--text-muted); padding-top: 16px; }' +

    /* Stats */
    '.landing-stats { display: flex; justify-content: center; gap: 40px; padding: 32px 0; flex-wrap: wrap; }' +
    '.landing-stat { text-align: center; }' +
    '.landing-stat-value { font-size: 2rem; font-weight: 800; color: var(--primary-color); }' +
    '.landing-stat-label { font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; }' +

    /* Tutorials */
    '.landing-tutorials { padding: 40px 0; text-align: center; }' +
    '.landing-tutorials h2 { font-size: 1.4rem; font-weight: 700; color: var(--text-bright); margin: 0 0 8px; }' +
    '.landing-tutorials-sub { font-size: 0.9rem; color: var(--text-muted); margin: 0 0 24px; }' +
    '.landing-vids-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }' +
    '.landing-vid-card { position: relative; border-radius: 12px; overflow: hidden; background: var(--bg-card); border: 1px solid var(--border-color); cursor: pointer; }' +
    '.landing-vid-card:hover .landing-vid-play { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }' +
    '.landing-vid-wrap { position: relative; padding-top: 177.78%; /* 9:16 */ background: #000; }' +
    '.landing-vid-wrap img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }' +
    '.landing-vid-wrap iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }' +
    '.landing-vid-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 52px; height: 52px; background: rgba(0,0,0,0.72); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #fff; pointer-events: none; opacity: 0.85; transition: opacity 0.2s, transform 0.2s; padding-left: 4px; }' +

    /* CTA bottom */
    '.landing-cta-section { text-align: center; padding: 24px 0 40px; }' +

    /* Footer */
    '.landing-footer { text-align: center; padding: 24px 0; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted); }' +
    '.landing-footer a { color: var(--primary-color); text-decoration: none; }' +
    '.landing-legal { display: flex; flex-direction: column; gap: 2px; margin-top: 14px; font-size: 0.75rem; font-style: normal; line-height: 1.5; opacity: 0.85; }' +

    /* Mobile */
    '@media (max-width: 767px) {' +
      '.landing-title { font-size: 1.6rem; }' +
      '.landing-tagline { font-size: 0.95rem; }' +
      '.landing-step-arrow { display: none; }' +
      '.landing-steps { flex-direction: column; align-items: center; }' +
      '.landing-stats { gap: 24px; }' +
      '.landing-vids-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }' +
      // v1.0.25-beta: max-width:320px removido — default agora é 100%
      // já fluido via clamp().
    '}' +
    '</style>';
  }
})();
