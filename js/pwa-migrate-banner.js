// Banner "migre pro app da loja" (v1.1) — some a confusão dos DOIS ícones.
//
// Contexto: com o lançamento nas lojas, quem tinha o PWA (atalho instalado pelo
// navegador) passa a ter TAMBÉM o app da loja → dois ícones iguais na tela de
// início. Não existe API pra apagar um PWA automaticamente (trava de SO), então
// a saída é avisar dentro do próprio PWA e ensinar a remover o atalho.
//
// Aparece SÓ quando: rodando como PWA instalado (display-mode standalone / iOS
// navigator.standalone) E NÃO dentro do app nativo (Capacitor). No navegador
// comum (aba normal) e no app da loja fica inerte. Funciona pra QUALQUER um que
// abra o PWA — tendo instalado a loja antes, depois, ou nem tendo instalado.
(function () {
  'use strict';
  try {
    var IOS_URL = 'https://apps.apple.com/br/app/scoreplace/id6789757489';
    var ANDROID_URL = 'https://play.google.com/store/apps/details?id=app.scoreplace';
    var DISMISS_KEY = 'scoreplace_pwa_migrate_dismissed';

    // 1) Não mostrar dentro do app nativo (é o próprio app da loja).
    var isNative = (window.SCOREPLACE_PLATFORM === 'ios' || window.SCOREPLACE_PLATFORM === 'android')
      || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) return;

    // 2) Mostrar só quando é o PWA INSTALADO (standalone) — não em aba normal.
    var mm = window.matchMedia;
    var isStandalone = (mm && (mm('(display-mode: standalone)').matches || mm('(display-mode: fullscreen)').matches))
      || window.navigator.standalone === true;
    if (!isStandalone) return;

    // 3) Respeitar dispensa anterior.
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return; } catch (e) {}

    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || window.navigator.standalone !== undefined;
    var isAndroid = /Android/.test(ua);
    var storeUrl = isIOS ? IOS_URL : (isAndroid ? ANDROID_URL : IOS_URL);
    var storeName = isIOS ? 'App Store' : (isAndroid ? 'Google Play' : 'loja');
    // Instrução de remoção por plataforma.
    var removeHow = isIOS
      ? 'Pra tirar este atalho: segure o ícone do scoreplace na tela de início → Remover App → Excluir da Tela de Início.'
      : (isAndroid
        ? 'Pra tirar este atalho: segure o ícone do scoreplace na tela de início → arraste pra Remover (ou toque em Desinstalar/Remover atalho).'
        : 'Pra tirar este atalho: abra as configurações de apps do navegador e remova o atalho do scoreplace.');

    function show() {
      if (document.getElementById('sp-pwa-migrate-banner')) return;
      var wrap = document.createElement('div');
      wrap.id = 'sp-pwa-migrate-banner';
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Aviso: app oficial na loja');
      wrap.style.cssText = [
        'position:fixed', 'left:12px', 'right:12px',
        'bottom:calc(12px + env(safe-area-inset-bottom, 0px))',
        'z-index:99990', 'background:#1e293b',
        'border:1px solid rgba(245,158,11,0.55)', 'border-radius:14px',
        'padding:14px 14px 12px', 'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
        'color:#fff', 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'max-width:520px', 'margin:0 auto'
      ].join(';');

      var title = document.createElement('div');
      title.style.cssText = 'font-weight:800;font-size:0.95rem;color:#fbbf24;margin-bottom:4px;';
      title.textContent = '⌚📲 scoreplace agora é app oficial';

      var msg = document.createElement('div');
      msg.style.cssText = 'font-size:0.82rem;line-height:1.45;color:#e2e8f0;margin-bottom:10px;';
      msg.textContent = 'Este é o atalho antigo (PWA). O app oficial está na ' + storeName
        + ' — com placar no relógio e mais. Se você já instalou, pode remover este atalho da tela de início pra não ficar com dois ícones iguais. ' + removeHow;

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

      var storeBtn = document.createElement('a');
      storeBtn.href = storeUrl;
      storeBtn.target = '_blank';
      storeBtn.rel = 'noopener';
      storeBtn.textContent = 'Abrir na ' + storeName;
      storeBtn.style.cssText = 'flex:1;text-align:center;text-decoration:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1200;font-weight:800;font-size:0.85rem;padding:10px 12px;border-radius:10px;';

      var dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.textContent = 'Entendi';
      dismissBtn.style.cssText = 'flex:0 0 auto;background:rgba(255,255,255,0.08);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15);font-weight:600;font-size:0.85rem;padding:10px 14px;border-radius:10px;cursor:pointer;';
      dismissBtn.addEventListener('click', function () {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
        wrap.remove();
      });

      btnRow.appendChild(storeBtn);
      btnRow.appendChild(dismissBtn);
      wrap.appendChild(title);
      wrap.appendChild(msg);
      wrap.appendChild(btnRow);
      document.body.appendChild(wrap);
    }

    // Espera o app assentar (depois do boot loader) pra não competir com o splash.
    var start = function () { setTimeout(show, 2500); };
    if (document.readyState === 'complete' || document.readyState === 'interactive') start();
    else window.addEventListener('DOMContentLoaded', start);
  } catch (e) { /* nunca quebra o app por causa do banner */ }
})();
