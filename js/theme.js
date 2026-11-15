// Aparência única azul. `dark` permanece como chave interna de compatibilidade
// com os seletores existentes; nenhuma preferência antiga controla a pintura.
document.documentElement.setAttribute('data-theme', 'dark');

// v2.1.91: aplica o tamanho da interface (--ui-scale) ANTES do body renderizar,
// pra não dar flash de tamanho errado. Lê o cache local; o perfil sincroniza
// depois (loadUserProfile). Clamp 0.7–1.6 por segurança.
(function applyInitialUiScale() {
  // v1.7.82: padrão = 1.3 (o que a pessoa vê como "100%"). Tem que casar com
  // window._UI_SCALE_BASE do store.js — aqui não dá pra ler o store (roda antes).
  // v1.7.88: os números abaixo são os MESMOS de store.js — BASE 1.3, faixa 80%–150%
  // → 1.04 a 1.95. Aqui não dá pra ler o store (este arquivo roda antes do body),
  // então a duplicação é inevitável; o que NÃO pode é ela divergir, e divergia:
  // este clamp dizia 0,7–1,7 enquanto o store dizia 0,8–1,7 e o slider 60%–130%.
  // Três faixas diferentes pro mesmo controle era a origem do "ora 130%, ora 169%".
  var s = 1.3;                       // = _UI_SCALE_BASE (o "100%" da pessoa)
  var MIN = 1.04, MAX = 1.95;        // = _uiPctToScale(80) e _uiPctToScale(150)
  // v1.7.91: mesmo carimbo de reset do store.js ('coloque o novo 100% por padrao para
  // todos'). Este arquivo roda ANTES do store — sem a checagem aqui, o valor antigo
  // seria pintado na tela por um instante antes de ser descartado lá, e a pessoa veria
  // a escala velha piscar. O valor tem que ser idêntico ao `_UI_SCALE_RESET`.
  var RESET = '2026-08-10-base130';
  try {
    if (localStorage.getItem('scoreplace_ui_scale_reset') !== RESET) {
      localStorage.removeItem('scoreplace_ui_scale');   // o store grava o carimbo
    }
    var raw = localStorage.getItem('scoreplace_ui_scale');
    if (raw != null) { var v = parseFloat(raw); if (!isNaN(v)) s = Math.max(MIN, Math.min(MAX, v)); }
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
// O azul da barra usa ícones claros (Style.Dark no plugin). NO-OP na web
// (window.Capacitor ausente) — não afeta o navegador.
(function syncNativeStatusBar() {
  try {
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
  } catch (e) { return; }
  function apply() {
    try {
      var SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
      if (!SB) return;
      var isAndroid = false;
      try { isAndroid = window.Capacitor.getPlatform() === 'android'; } catch (e) {}
      // Android edge-to-edge mostra o windowBackground azul do styles.xml.
      SB.setStyle({ style: 'DARK' }); // no plugin: ícones claros
      if (!isAndroid && typeof SB.setBackgroundColor === 'function') {
        try { SB.setBackgroundColor({ color: '#145584' }); } catch (e) {}
      }
    } catch (e) {}
  }
  apply();
  try {
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) {}
  setTimeout(apply, 600); // reaplica quando o bridge/plugin terminar de registrar
})();
