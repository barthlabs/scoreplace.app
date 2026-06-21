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
