// v2.6.27: SÓ 2 temas — escuro e claro. (sunset/ocean removidos; preferências
// salvas com eles caem no padrão pela validação abaixo.)
var _validThemes = ['dark', 'light'];

// Chamar imediatamente para evitar FOUC
(function checkInitialTheme() {
  var pref = null;
  try { pref = localStorage.getItem('scoreplace_theme'); } catch(e) {}
  if (pref && _validThemes.indexOf(pref) !== -1) {
    document.documentElement.setAttribute('data-theme', pref);
  } else {
    var mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
  }
})();

// v2.1.91: aplica o tamanho da interface (--ui-scale) ANTES do body renderizar,
// pra não dar flash de tamanho errado. Lê o cache local; o perfil sincroniza
// depois (loadUserProfile). Clamp 0.7–1.6 por segurança.
(function applyInitialUiScale() {
  var s = 1;
  try {
    var raw = localStorage.getItem('scoreplace_ui_scale');
    if (raw != null) { var v = parseFloat(raw); if (!isNaN(v)) s = Math.max(0.7, Math.min(1.6, v)); }
  } catch (e) {}
  document.documentElement.style.setProperty('--ui-scale', s);
})();

// v0.17.70: REVERTIDA a injeção dinâmica do dict i18n da v0.17.68. A teoria
// (script-inserted async=false executa antes dos parser-defers) NÃO funcionou
// na prática — em alguns casos o dict carregava DEPOIS de IIFEs como
// setupCreateTournamentModal, que constroem HTML com _t() ao boot. Resultado:
// keys cruas tipo 'create.nameLabel' baked no HTML do modal, persistindo até
// o próximo reload. O modal Novo Torneio ficou inutilizável (screenshot do
// usuário em 2026-04-29).
// Os dicts i18n-pt.js e i18n-en.js voltaram pra index.html como parser-defers,
// garantindo ordering correto. Custo: ~107KB raw / ~30KB gzipped a mais no
// boot pra usuários PT (que era o ganho da v0.17.68). Trade-off aceito —
// ordering correto > economia de bytes que Lighthouse não estava capturando.

// ── Status bar NATIVA sincronizada com o tema (só no app Capacitor) ─────────────
// Tema escuro → texto do relógio/bateria CLARO (Style.Dark); tema claro → texto
// ESCURO (Style.Light). Reaplica em toda troca de data-theme. NO-OP na web
// (window.Capacitor ausente) — não afeta o navegador.
(function syncNativeStatusBar() {
  try {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
  } catch (e) { return; }
  function apply() {
    try {
      var SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
      if (!SB) return;
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var isAndroid = false;
      try { isAndroid = window.Capacitor.getPlatform() === 'android'; } catch (e) {}
      // Android (targetSdk 36): a faixa da status bar mostra o windowBackground, que
      // fixamos em #111114 (dark) no styles.xml — porque setBackgroundColor virou no-op
      // no edge-to-edge do Android 15+. Como a faixa é SEMPRE dark, os ícones têm que ser
      // SEMPRE claros (Style.DARK), inclusive no tema Claro — senão ficam escuros sobre
      // dark = invisíveis. No iOS a status bar é edge-to-edge e acompanha o conteúdo do
      // app, então lá mantemos o sync por tema.
      SB.setStyle({ style: (isAndroid || dark) ? 'DARK' : 'LIGHT' }); // Dark=ícones claros, Light=ícones escuros
      if (!isAndroid && typeof SB.setBackgroundColor === 'function') {
        try { SB.setBackgroundColor({ color: dark ? '#0f0f23' : '#ffffff' }); } catch (e) {} // no-op no Android 15+
      }
    } catch (e) {}
  }
  apply();
  try {
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) {}
  setTimeout(apply, 600); // reaplica quando o bridge/plugin terminar de registrar
})();
