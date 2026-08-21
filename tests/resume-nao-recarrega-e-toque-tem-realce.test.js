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
ok(/-webkit-tap-highlight-color:\s*rgba\(255, 255, 255, 0\.30\)/.test(gesto),
   'o card pede o realce do SISTEMA explicitamente (o padrão some no fundo escuro)');
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
['touchend', 'touchcancel', 'touchmove'].forEach(function (ev) {
  ok(new RegExp("addEventListener\\('" + ev + "', _apaga, \\{ passive: true \\}\\)").test(store),
     'e sai no `' + ev + '`' + (ev === 'touchmove' ? ' — dedo que andou virou ROLAGEM, e card aceso rolando e pior que card sem realce' : ''));
});
ok(/closest\('button, input, label, select, textarea, a\[href\], \[data-no-card-nav\]'\)/.test(store),
   'controle DENTRO do card nao acende o card (ele tem o proprio feedback)');
const comps3 = R('css/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/\.card\[onclick\]\.sp-tocado[\s\S]{0,200}transform: scale\(0\.96\) !important/.test(comps3),
   'o realce e visivel (encolhe 4%) e usa !important — o card cravou transform INLINE no onmouseover');
ok(/\.sp-tocado[\s\S]{0,220}filter: brightness/.test(comps3),
   'e clareia: transform+filter sao compositor, sem layout');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
