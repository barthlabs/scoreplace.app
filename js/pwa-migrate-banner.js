// Banner "migre pro app da loja" (v1.2) — some a confusão dos DOIS ícones.
//
// Contexto: com o lançamento nas lojas, quem tinha o PWA (atalho instalado pelo
// navegador) passa a ter TAMBÉM o app da loja → dois ícones iguais na tela de
// início. Não existe API pra apagar um PWA automaticamente (trava de SO), então
// a saída é avisar dentro do próprio PWA e ensinar a remover o atalho.
//
// Aparece SÓ quando: rodando como PWA instalado (display-mode standalone / iOS
// navigator.standalone) E NÃO dentro do app nativo (Capacitor) E existe ficha
// PUBLICADA na loja daquele aparelho. No navegador comum (aba normal), no app da
// loja e no computador fica inerte.
(function () {
  'use strict';
  try {
    // ── A LISTA DAS LOJAS É UMA SÓ (v2.0.9) ──────────────────────────────────
    // Aqui viviam duas constantes com as URLs escritas à mão — uma SEGUNDA verdade,
    // e a divergência já tinha data marcada: na v2.0.8 a ficha da Play saiu da
    // análise e virar `SP_LOJAS.play.on` acendeu de uma vez o selo da landing, o
    // botão da tela inicial e o selo do convite impresso. Este banner teria ficado
    // pra trás, apontando pra uma URL que ninguém mais mantinha.
    // O literal abaixo é a MESMA rede do convite impresso (tournaments-sharing.js):
    // existe só pro caso de o banner rodar sem o store.js carregado — não é uma
    // segunda verdade. Hoje os dois são `defer` e o store.js vem antes (index.html).
    var L = window.SP_LOJAS || {
      apple: { on: true, nome: 'App Store',   url: 'https://apps.apple.com/br/app/scoreplace/id6789757489' },
      play:  { on: true, nome: 'Google Play', url: 'https://play.google.com/store/apps/details?id=app.scoreplace' }
    };
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

    // 4) Só existe migração pra onde há ficha PUBLICADA — a mesma escolha (e a mesma
    //    ordem de precedência) do `_storeButtonHtml` em main.js.
    //    ⚠️ COMPUTADOR FICA DE FORA, e é decisão: a ficha aberta no navegador do
    //    computador não instala nada, então mandar pra lá é beco — era o que a linha
    //    `isIOS ? IOS : (isAndroid ? ANDROID : IOS)` fazia, despejando o desktop na
    //    App Store. E não há app nativo de computador: o PWA ali não é o atalho
    //    velho competindo com o app de verdade, é o único caminho que existe. Pedir
    //    pra remover deixaria a pessoa sem nada.
    //    ⚠️ `on` é MEDIÇÃO. Ficha fora do ar = banner inteiro sai, não só o botão:
    //    um aviso que manda remover o atalho e leva a um 404 tira o app da pessoa.
    var ua = navigator.userAgent || '';
    // iPad moderno se declara Mac — o toque é o que o denuncia (mesma checagem do
    // _storeButtonHtml, mantida idêntica de propósito pros dois concordarem).
    var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/.test(ua);
    var loja = (isIOS && L.apple && L.apple.on) ? L.apple
             : (isAndroid && L.play && L.play.on) ? L.play
             : null;
    if (!loja || !loja.url) return;
    var storeUrl = loja.url;
    var storeName = loja.nome || 'loja';
    // Instrução de remoção por plataforma.
    var removeHow = isIOS
      ? 'Pra tirar este atalho: segure o ícone do scoreplace na tela de início → Remover App → Excluir da Tela de Início.'
      : 'Pra tirar este atalho: segure o ícone do scoreplace na tela de início → arraste pra Remover (ou toque em Desinstalar/Remover atalho).';

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
