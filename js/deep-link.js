// js/deep-link.js — Universal Links (iOS) / App Links (Android) → rota da SPA.
//
// PROBLEMA: um link de convite `https://scoreplace.app/#tournaments/ID` tocado no
// WhatsApp abria a versão WEB mesmo com o app instalado. Com Universal Links (iOS)
// + App Links (Android) o sistema operacional entrega o link direto ao app.
//
// O casamento do link é feito pelo SO via os arquivos de verificação hospedados em
//   https://scoreplace.app/.well-known/apple-app-site-association   (iOS)
//   https://scoreplace.app/.well-known/assetlinks.json              (Android)
// + a entitlement `associated-domains` (iOS) e o `<intent-filter android:autoVerify>`
// (Android). Este módulo é a PONTE JS: recebe a URL que abriu o app e aplica a rota.
//
// IMPORTANTE — rotas são por HASH (`/#tournaments/ID`). Universal/App Links casam pelo
// PATH (sempre `/`), então TODA URL scoreplace.app abre o app; o fragmento carrega a
// rota. O app já lida com visitante deslogado (gate de inscrição em auth.js/router.js),
// então navegar pra `#tournaments/ID` no cold start se comporta igual ao link web.
//
// INERTE NA WEB: no navegador `window.Capacitor` é undefined → o módulo faz early-return
// e não tem efeito algum. Só roda dentro do app nativo (Capacitor iOS/Android).
//
// Requer o plugin `@capacitor/app` (package.json) — exposto em
// `window.Capacitor.Plugins.App` após `npx cap sync`.
(function () {
  'use strict';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform
      && window.Capacitor.isNativePlatform());
  }

  // Só a WEB precisa deste seam; no navegador não há deep link do SO pra tratar.
  if (!isNative()) return;

  // Aplica a parte "roteável" de uma URL scoreplace.app recebida via deep link.
  function applyDeepLink(rawUrl) {
    if (!rawUrl) return;
    var u;
    try { u = new URL(rawUrl); } catch (e) { return; }

    // Trata só links do nosso próprio domínio (defesa contra esquemas inesperados).
    var host = (u.hostname || '').toLowerCase();
    if (host !== 'scoreplace.app' && host !== 'www.scoreplace.app') return;

    var hash = u.hash || '';       // ex.: #tournaments/ID?ref=UID  (rota + referrer)
    var search = u.search || '';   // ex.: ?ml=TOKEN (link mágico) ou ?ref=UID (convite app)

    // (1) Link mágico (?ml=TOKEN): o wrapper de auth.js lê ?ml= no boot e resolve o
    // token → precisa recarregar a webview na URL COMPLETA pra esse handler rodar.
    if (search && /[?&]ml=/.test(search)) {
      try { window.location.replace(u.pathname + search + hash); } catch (e) {}
      return;
    }

    // (2) Caso comum — convite de torneio: rota por hash (#tournaments/ID[?ref=UID]).
    // O router (router.js) lê o ?ref= tanto do hash quanto da query.
    if (hash) {
      if (window.location.hash !== hash) {
        window.location.hash = hash;               // dispara hashchange → router navega
      } else {
        // Mesma rota já ativa: força re-render pra refletir o toque no link.
        try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) {}
      }
      return;
    }

    // (3) Convite do app sem hash (…/?ref=UID): recarrega mantendo a query pro
    // router/auth consumir o referrer, caindo no dashboard.
    if (search) {
      try { window.location.replace('/' + search); } catch (e) {}
    }
  }

  function boot() {
    var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App) {
      window._warn && window._warn('[deep-link] plugin @capacitor/app ausente — rode `npx cap sync`');
      return;
    }

    // Cold start: app aberto DIRETO por um deep link (estava fechado).
    if (typeof App.getLaunchUrl === 'function') {
      App.getLaunchUrl().then(function (res) {
        if (res && res.url) applyDeepLink(res.url);
      }).catch(function () {});
    }

    // Warm start: app já rodando em background e um novo deep link chega.
    try {
      App.addListener('appUrlOpen', function (event) {
        if (event && event.url) applyDeepLink(event.url);
      });
    } catch (e) {
      window._warn && window._warn('[deep-link] falha ao registrar appUrlOpen', e);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
