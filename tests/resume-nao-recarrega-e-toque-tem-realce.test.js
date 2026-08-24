/* DUAS COISAS QUE O DONO RELATOU NA 1.9.102, e as duas eram uma REGRA COPIADA
 * QUE FALTOU NUM LUGAR.
 *
 * ── A) A TELA BRANCA AO DESBLOQUEAR ────────────────────────────────────────
 * Relato: _"quando estamos no detalhe do torneio e deixamos a tela bloquear,
 * quando desbloqueamos vem uma tela branca por um instante"_.
 * CAUSA: `_checkForUpdate` acha versão nova no resume e RECARREGA por baixo de
 * quem está lendo. A 1.9.46 já tinha diagnosticado isso e posto uma guarda de
 * "só na dashboard" — mas SÓ no `visibilitychange`. O `pageshow` e o `focus`
 * ficaram sem nada, e os dois disparam no MESMO momento (desbloquear o
 * aparelho). O conserto de 1.9.46 nunca valeu na prática.
 * ⛔ A condição mora numa função ÚNICA e os três a chamam. Regra copiada em N
 * lugares volta pelo lugar esquecido — foi o que aconteceu aqui.
 *
 * ── B) O TOQUE NO CARD SEM REALCE ──────────────────────────────────────────
 * Relato, depois de oito versões: _"a merda de não ter feedback imediato no
 * clique do card do torneio é o que incomoda todo clique"_.
 * O único realce era `:active` (esmaecer + contorno). MEDIDO no WKWebView com o
 * CSS real do card: thread LIVRE → pinta (opacidade 0.5); thread OCUPADA 1,2s →
 * NÃO pinta nada. `:active` é recálculo de estilo, e recálculo precisa da thread
 * principal — que é justamente o que falta quando o toque incomoda.
 * `-webkit-tap-highlight-color` é desenhado pelo SISTEMA (UIKit), no toque, sem
 * passar pelo renderer: é o único feedback que sobrevive à thread presa. Estava
 * no padrão do iOS — um cinza quase invisível sobre o gradiente escuro do card.
 * ⚠️ Ele NÃO substitui o `:active`: os dois convivem.
 */
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── resume não recarrega · toque tem realce ────');

// ── A ──────────────────────────────────────────────────────────────────────
const store = R('js/store.js');
ok(/var _momentoSeguroPraAtualizar = function \(\) \{/.test(store),
   'a condição de "momento seguro" existe numa função única');
const nChamadas = (store.match(/_momentoSeguroPraAtualizar\(\)/g) || []).length;
ok(nChamadas >= 3, 'os TRÊS eventos de retorno usam a mesma função (achei ' + nChamadas + ')');
['visibilitychange', 'pageshow', 'focus'].forEach(function (ev) {
  const re = new RegExp("addEventListener\\('" + ev + "'[\\s\\S]{0,220}?_checkForUpdate");
  const m = re.exec(store);
  ok(!!m && /_momentoSeguroPraAtualizar\(\)/.test(m[0]),
     'o evento `' + ev + '` só checa atualização em momento seguro');
});
ok(!/window\.addEventListener\('pageshow', function\(\) \{ window\._checkForUpdate\(\{\}\); \}\);/.test(store),
   '⛔ a versão sem guarda do pageshow não existe mais');
ok(!/window\.addEventListener\('focus', function\(\) \{ window\._checkForUpdate\(\{\}\); \}\);/.test(store),
   '⛔ nem a do focus');

// ── B ──────────────────────────────────────────────────────────────────────
const comps = R('css/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
const iGesto = comps.indexOf('.card[onclick],');
ok(iGesto > 0, 'a regra de gesto do card existe');
const gesto = comps.slice(iGesto, comps.indexOf('}', iGesto));
ok(/-webkit-tap-highlight-color:\s*rgba\(255, 255, 255, 0\.45\)/.test(gesto),
   'o card pede o realce do SISTEMA explicitamente, e FORTE (0.45) — 2.0.47: a 0.30 o dono seguia sem ver nada no aparelho; este é o único feedback que sobrevive à thread presa');
ok(!/-webkit-tap-highlight-color:\s*transparent/.test(gesto),
   '⛔ o card nunca apaga o realce do sistema — é o único que sobrevive à thread presa');
ok(/touch-action:\s*manipulation/.test(gesto), 'e o atraso do duplo-toque segue removido');
// o :active continua — os dois convivem
ok(/\.card\[onclick\]:active/.test(comps) && /opacity:\s*0\.5/.test(comps),
   'o realce por `:active` NÃO foi removido: com a thread livre a pessoa vê os dois');

// ── C) a borda no quadro que a seta aponta ────────────────────────────────
// Ordem do dono: "colocar uma borda na cor da seta no box alvo dela que persiste
// 3s depois dela desaparecer".
ok(/\.sp-alvo-do-convite\{outline:3px solid #fbbf24/.test(store),
   'o quadro-alvo ganha borda na cor da seta');
ok(/outline:3px/.test(store) && !/\.sp-alvo-do-convite\{border:/.test(store),
   'é `outline`, não `border`: não entra no layout, então o quadro não pula');
ok(/classList\.add\('sp-alvo-do-convite'\)/.test(store), 'a borda nasce junto com a seta');
ok(/\}, 3000\);/.test(store), 'e só começa a sair 3s DEPOIS de a seta sumir');
ok(/if \(!escolhido\.cfg\.praCima\) \{[\s\S]{0,200}sp-alvo-do-convite/.test(store),
   'o convite de PERFIL não marca nada — o alvo dele é o menu, e moldura ali seria ruído');

// ── D) A CHAVE NAO TEM CAMADA DE COMPOSICAO PROPRIA (1.9.104) ─────────────
// Relato teimoso do dono desde a 1.9.89: "entra e scrollando corta" — e "depois
// da primeira vez ele se conserta". Esse "se conserta" e a assinatura de
// RASTERIZACAO DE TILES: o rolador tinha camada propria (com orcamento de tiles
// proprio), o WebKit precisava re-rasterizar ao rolar, e ate terminar aparecia o
// buraco. Duas causas no mesmo bloco:
//   • `overflow-y: visible` ao lado de `overflow-x: auto` NAO e visivel — o CSS
//     manda computar como AUTO, entao o wrapper virava rolador nos dois eixos,
//     aninhado dentro do rolador da pagina;
//   • `-webkit-overflow-scrolling: touch` forcava a camada. Obsoleto desde o
//     iOS 13: nao entrega rolagem suave (virou padrao), so cobra a camada.
// ⚠️ NAO consegui reproduzir o corte no simulador — ele roda na GPU do Mac, sem a
// pressao de tiles do aparelho (medido la: 4% de quadros perdidos, 43ms). Entao
// esta trava protege o MECANISMO, e quem confirma o efeito e o dono.
const cssTodos = ['css/components.css', 'css/bracket.css', 'css/responsive.css', 'css/style.css', 'css/layout.css']
  .map(function (f) { return { f: f, s: R(f).replace(/\/\*[\s\S]*?\*\//g, '') }; });
cssTodos.forEach(function (o) {
  ok(!/-webkit-overflow-scrolling/.test(o.s),
     '⛔ nenhum `-webkit-overflow-scrolling` em ' + o.f + ' (obsoleto no iOS 13+, so forca camada)');
});
const comps2 = R('css/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
const iW = comps2.indexOf('.bracket-sticky-scroll-wrapper {');
ok(iW > 0, 'o wrapper da chave existe');
const wrap = comps2.slice(iW, comps2.indexOf('}', iW));
ok(/overflow-y:\s*hidden/.test(wrap),
   'o wrapper rola so na horizontal — `overflow-y: visible` era computado como AUTO e criava rolador aninhado');
ok(!/overflow-y:\s*visible/.test(wrap), '⛔ e `visible` nao volta: ao lado de `auto` ele nao e visivel');

// ── E) A REGRA DO RELOAD MORA NA PORTA UNICA (1.9.105) ────────────────────
// TERCEIRA volta do clarao branco. A 1.9.46 guardou o `visibilitychange`; a
// 1.9.103 estendeu pro `pageshow`/`focus`; e o dono relatou DE NOVO — porque
// sobravam dois chamadores: o `hashchange` (dispara ao ENTRAR no torneio) e um
// `setInterval` de 2 MINUTOS, que dispara em qualquer tela.
// ⛔ O ERRO, DUAS VEZES, FOI O LUGAR: guardar CHAMADORES sempre deixa um pra
// tras. `_isSafeToReload` e a PORTA UNICA — `_applyUpdate` a consulta antes de
// qualquer coisa, entao TODO caminho passa por ela.
const iSafe = store.indexOf('window._isSafeToReload = function');
ok(iSafe > 0, 'a porta unica do reload existe');
const safe = store.slice(iSafe, store.indexOf('window._showUpdatePill', iSafe));
ok(/var _naTelaInicial = \(v === '' \|\| v === 'dashboard'\);/.test(safe),
   'a regra "so na tela inicial" mora DENTRO de _isSafeToReload');
ok(/if \(!_naTelaInicial\) return false;/.test(safe),
   'e ela BLOQUEIA o reload fora da tela inicial');
ok(/_applyUpdate = function\(force\) \{\s*if \(!force && !window\._isSafeToReload\(\)\)/.test(store),
   'e `_applyUpdate` consulta a porta antes de qualquer coisa');
ok(/window\._pendingUpdateReload = true;/.test(store),
   'o update nao se perde: fica pendente e a pilula da a opcao de atualizar na hora');

// ── F) O REALCE DO TOQUE E POSTO POR JS, NAO PELO `:active` (1.9.105) ─────
// O dono entregou o diagnostico sem saber, na 1.9.104: "da uma leve mexidinha no
// box, mas isso e muito sutil". A mexidinha e o `onmouseover` (translateX 5px) —
// o iOS simula hover no toque. Ela prova que a thread NAO esta presa (estilo
// inline de JS pinta na hora) e que, ainda assim, o `:active` nao pinta: no iOS
// ele e ADIADO enquanto o WebKit decide se o toque vira ROLAGEM, e num card
// dentro de pagina rolavel o dedo sai antes da decisao.
ok(/var _ALVO = '\.card\[onclick\], a\.compact-row, \.compact-row\[onclick\]';/.test(store),
   'o ouvinte cobre card e linha compacta');
ok(/document\.addEventListener\('touchstart', function \(ev\)[\s\S]{0,600}classList\.add\('sp-tocado'\)/.test(store),
   'o realce entra no TOUCHSTART — sem esperar decisao de gesto');
['touchcancel', 'touchmove'].forEach(function (ev) {
  ok(new RegExp("addEventListener\\('" + ev + "', _apaga, \\{ passive: true \\}\\)").test(store),
     'e sai no `' + ev + '`' + (ev === 'touchmove' ? ' — dedo que andou virou ROLAGEM, e card aceso rolando e pior que card sem realce' : ''));
});
// ── 2.0.55: O CLIQUE ACONTECE NO TOUCHEND ────────────────────────────────────
// MEDIDO no aparelho do dono: todo toque chegava com ~285-289ms constantes — o
// clique SINTETICO do WebKit, que touch-action:manipulation nao mata no
// WKWebView. O touchend do realce agora dispara o click e cancela o sintetico.
{
  const mTe = store.match(/document\.addEventListener\('touchend', function \(ev\) \{[\s\S]{0,900}?\}, \{ passive: false \}\);/);
  ok(!!mTe, 'o touchend do realce e NAO-passivo (precisa do preventDefault pro click sintetico)');
  const te = mTe ? mTe[0] : '';
  ok(/_apaga\(\);/.test(te), 'o realce continua saindo no touchend');
  ok(/ev\.cancelable[\s\S]{0,40}ev\.preventDefault\(\)/.test(te), 'o click SINTETICO (300ms) e cancelado');
  ok(/alvo\.click\(\)/.test(te), 'e o click REAL dispara no ato do touchend');
  ok(/> 700\) return;/.test(te), 'long-press nao vira clique (teto de 700ms)');
}
ok(/closest\('button, input, label, select, textarea, a\[href\], \[data-no-card-nav\]'\)/.test(store),
   'controle DENTRO do card nao acende o card (ele tem o proprio feedback)');
const comps3 = R('css/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
// ⚠️ SO `opacity`, e de proposito (1.9.114). O realce ja passou por
// `filter: brightness()` e por `transform: scale()`, e os dois sairam pelo MESMO
// motivo: ele entra no `touchstart`, ou seja TAMBEM no toque que comeca uma
// rolagem. Mexer em transform/filter ali promove o card a camada nova e obriga o
// WebKit a rasterizar de novo no primeiro quadro do gesto — o "scrolla e corta"
// voltou justamente depois que este realce nasceu.
// escopo = SO o corpo da regra: logo depois dela vem o bloco de hover, que tem
// `transform` legitimamente (e so vale em tela com mouse).
const iToc = comps3.indexOf('.card[onclick].sp-tocado');
ok(iToc > 0, 'a regra do realce existe');
const corpoToc = comps3.slice(iToc, comps3.indexOf('}', iToc));
ok(!/transform:/.test(corpoToc),
   '⛔ sem `transform` no realce: muda geometria no primeiro quadro do gesto');
ok(!/filter:/.test(corpoToc),
   '⛔ nem `filter`: cria contexto de composicao e forca re-rasterizacao');
// 1.9.114: era `filter: brightness()`. Filtro cria contexto de composicao novo e
// obriga o WebKit a re-rasterizar a area — caro justamente no toque, quando a
// thread ja esta disputada. `opacity` faz o mesmo trabalho visual e o compositor
// resolve sozinho.
ok(/opacity: 0\.45 !important/.test(corpoToc),
   'o realce e esmaecer FORTE (0.45 — 2.0.47, era 0.6 e o dono nao via no card de foto) — a mudanca mais barata que existe e se ve de longe');
ok(/var _rolando = 0;/.test(store) && /if \(Date\.now\(\) - _rolando < 250\) return;/.test(store),
   'ROLANDO NAO ACENDE: encostar o dedo pra parar a inercia nao e clique, e o realce cairia no pior quadro');
ok(!/\.sp-tocado[\s\S]{0,320}filter:/.test(comps3),
   '⛔ sem `filter` no realce: ele forca re-rasterizacao no pior momento');

// ── G) EFEITO DE MOUSE NAO ENCOSTA EM TELA DE TOQUE (1.9.114) ─────────────
// Relato do dono, testando o realce novo: "o clique deu 2x um pulo e nao da a
// sensacao de clique". Causa exata: o card tinha
// `onmouseover="this.style.transform='translateX(5px)'"` INLINE, e o iOS SIMULA
// hover no toque — entao: touchstart encolhe · touchend deixa o transform do
// hover (PULO pra direita) · mouseout devolve pra none (PULO de volta).
// O realce de toque brigava com um efeito de mouse que nao devia existir ali.
['js/views/dashboard.js', 'js/views/tournaments.js'].forEach(function (f) {
  ok(!/onmouseover="this\.style\.transform='translateX\(5px\)'"/.test(R(f)),
     '⛔ nenhum hover inline empurrando o card em ' + f);
});
ok(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]{0,160}\.card\[onclick\]:hover \{ transform: translateX\(5px\); \}/.test(comps3),
   'o efeito de hover vive atras de `@media (hover: hover)` — nao casa em tela de toque, e o desktop segue igual');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
