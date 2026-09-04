/* ═══ SEÇÃO DOBRÁVEL COM MEMÓRIA ═════════════════════════════════════════════
 *
 * ⚠️ MORA NUM ARQUIVO PRÓPRIO, e não no store.js, por um motivo que a suíte apontou na
 * hora: `weather.js` e `tournaments-utils.js` usam este helper, e as suítes que testam
 * esses dois NÃO carregam o store.js (ele é grande e traz meio app junto). Três suítes
 * quebraram com "window._spDobra is not a function".
 * A saída fácil seria um fallback em cada chamador ("se não existir, desenha sem dobrar") —
 * e seria a mesma armadilha de sempre: dois comportamentos para a mesma seção, um deles
 * só no teste. Um arquivo pequeno e sem dependências resolve nos dois lados.
 */
// Ordem do dono (27/ago/2026): _"vamos na dashboard e no detalhe do torneio abreviar essas
// sessoes de forma que possam ser expandidas e colapsadas ao gosto do usuário (e isso seja
// lembrado)"_ — a previsão do tempo abre em "próximos dias", o progresso em "torneio
// completo".
//
// ⛔ UM MECANISMO SÓ, e por dois motivos que a sessão de hoje deixou claros:
//  · as MESMAS seções aparecem na dashboard E no detalhe do torneio. Duas implementações
//    divergiriam, e o usuário veria a mesma caixa se comportando diferente em cada tela;
//  · a pílula visual já é canônica (`window._spVerMaisTag`) — quem recriou o desenho dela
//    antes ouviu do dono que "o ver menos ficou com uma aparência diferente".
//
// ⚠️ O TOGGLE É PURO DOM, não re-render: mostrar/esconder um trecho não pode custar o
// redesenho da tela inteira. Isso também mantém a rolagem no lugar — o que a leva 2.1.21
// acabou de provar ser o que mais incomoda.
//
// A memória é por CHAVE, não por tela: fechar "próximos dias" na dashboard fecha no
// detalhe também. É a mesma seção; lembrar duas preferências para ela seria o app
// discordando de si mesmo.
window._spDobraAberta = function (chave, padraoAberto) {
  try {
    var v = localStorage.getItem('scoreplace_dobra_' + chave);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) {}
  return !!padraoAberto;
};
window._spDobraToggle = function (chave) {
  var raizes = document.querySelectorAll('[data-dobra="' + chave + '"]');
  if (!raizes.length) return;
  // decide UMA vez, pelo primeiro, e aplica em todos — a mesma seção pode estar na tela
  // mais de uma vez (ex.: vários cards de torneio na dashboard) e elas não podem divergir.
  var primeiro = raizes[0].querySelector('[data-dobra-corpo]');
  var abrindo = !primeiro || primeiro.style.display === 'none';
  for (var i = 0; i < raizes.length; i++) {
    var corpo = raizes[i].querySelector('[data-dobra-corpo]');
    var pill = raizes[i].querySelector('[data-dobra-pill]');
    if (corpo) corpo.style.display = abrindo ? '' : 'none';
    if (pill) pill.textContent = abrindo ? 'ver menos' : 'ver mais';
    /* ⭐ 2.1.45 — A DOBRA ABRE CORPO PREGUIÇOSO. O `<details>` da dashboard tinha um
     * `ontoggle` que montava o conteúdo só no primeiro ABRIR — foi ele que tirou 437 KB
     * de HTML construído e nunca visto (v1.8.94, o relato de "fica lenta" no nativo).
     * Trocar aquele `<details>` por esta dobra sem trazer isto junto REGREDIRIA a
     * medição. O gancho é opcional: quem não tem corpo preguiçoso não paga nada.
     * ⚠️ Só ao ABRIR: hidratar ao fechar seria montar justamente o que ninguém vai ver. */
    if (abrindo && corpo && typeof window._spDobraHidratar === 'function') {
      try { window._spDobraHidratar(corpo); } catch (_h) {}
    }
  }
  try { localStorage.setItem('scoreplace_dobra_' + chave, abrindo ? '1' : '0'); } catch (e) {}
};
// Monta a seção: a LINHA-GATILHO (que o dono pediu que fosse o próprio rótulo — "próximos
// dias", "torneio completo") ganha a pílula à direita e vira o clique; o corpo nasce
// aberto ou fechado conforme o que foi lembrado.
//   rotuloHtml — o conteúdo da linha (sem a pílula)
//   corpoHtml  — o que dobra
window._spDobra = function (chave, rotuloHtml, corpoHtml, padraoAberto, estiloLinha) {
  var aberta = window._spDobraAberta(chave, padraoAberto);
  var pill = (typeof window._spVerMaisTag === 'function')
    ? window._spVerMaisTag('', !aberta, { attrs: ' data-dobra-pill="1"' })
    : '<span data-dobra-pill="1" style="margin-left:auto;font-size:0.7rem;">' + (aberta ? 'ver menos' : 'ver mais') + '</span>';
  /* ⛔ GUARD GRANDE EM VOLTA DO GATILHO (dono, 04/set/2026: _"clicar em ver mais/menos ainda
   * está abrindo o detalhe. precisa criar um guard maior em torno desses botões"_).
   *
   * O `stopPropagation` só no `onclick` NÃO basta, e o motivo é a ordem dos eventos: o card
   * que navega reage ao TOQUE (pointerdown/pointerup/touchend), que acontecem ANTES do
   * `click`. Quando o clique enfim chega aqui pra ser barrado, o card já abriu — barrar
   * depois é barrar o que já passou.
   * ⭐ Então o gatilho barra a família inteira do gesto, na ida e na volta, e não só o
   * `click`. É a mesma lição do toque perdido pro `user-select`
   * ([[feedback_toque_no_card_perdido_para_selecao_de_texto]]): num card que navega, quem
   * tem ação própria precisa segurar o gesto INTEIRO.
   * ⚠️ `touchstart` NÃO é passivo aqui de propósito — é ele que chega primeiro no celular.
   * ⭐ E o alvo cresce: `padding` + `touch-action:manipulation` dão dedo onde antes havia
   * uma pílula de 0.7rem, que é a outra metade do "ainda abre o detalhe" — errar o alvo por
   * 3px cai no card. */
  var _guard = ' onpointerdown="event.stopPropagation();" onpointerup="event.stopPropagation();"' +
    ' ontouchstart="event.stopPropagation();" ontouchend="event.stopPropagation();"' +
    ' onmousedown="event.stopPropagation();" onmouseup="event.stopPropagation();"';
  return '<div data-dobra="' + window._safeHtml(chave) + '">' +
    '<div onclick="event.stopPropagation(); event.preventDefault(); window._spDobraToggle(\'' + window._safeHtml(chave) + '\')"' + _guard + ' ' +
      'style="display:flex;align-items:center;gap:6px;cursor:pointer;touch-action:manipulation;padding:6px 2px;margin:-6px -2px;' + (estiloLinha || '') + '">' +
      rotuloHtml + pill +
    '</div>' +
    '<div data-dobra-corpo="1"' + (aberta ? '' : ' style="display:none;"') + '>' + corpoHtml + '</div>' +
  '</div>';
};


// ── A MESMA MEMÓRIA PARA UM <details> NATIVO (2.1.26) ────────────────────────
// A caixa de configuração do torneio já era um <details>, e o CSS (.tourn-config-box)
// depende disso. Converter pra div traria o risco de mexer no visual sem necessidade —
// o que o dono pediu foi PADRONIZAR o controle ("adotar o mostrar mais/menos... padronizar
// isso que ficou legal"), não trocar a mecânica.
// Então o <details> ganha a MESMA pílula e a MESMA memória, pela mesma chave.
// ⚠️ `ontoggle` dispara também quando o código restaura o estado (foi a causa raiz do
// "a tela pula ao lançar placar", 2.1.21) — aqui isso é inócuo: regravar o valor que já
// estava é no-op. O que NÃO se faz aqui é rolar a tela.
window._spDobraDetails = function (el, chave) {
  if (!el) return;
  try { localStorage.setItem('scoreplace_dobra_' + chave, el.open ? '1' : '0'); } catch (e) {}
  var pill = el.querySelector('[data-dobra-pill]');
  if (pill) pill.textContent = el.open ? 'ver menos' : 'ver mais';
};
