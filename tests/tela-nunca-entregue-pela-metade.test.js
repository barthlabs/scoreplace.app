/* A TELA NUNCA É ENTREGUE PELA METADE, E NENHUMA ANIMAÇÃO É ETERNA
 * node tests/tela-nunca-entregue-pela-metade.test.js
 *
 * DE ONDE VEIO (1.9.90): relatório do APARELHO do dono, iOS 18.7 / WKWebView,
 * release scoreplace@1.9.89, via `tap-sem-feedback` no Sentry (7683007098):
 *
 *   entrada esperou 290ms, aviso pintou +3512ms
 *   trechos:  countdown-tick=0ms | Mu:?=173ms | rota-torneio=926ms
 *             | timeout:_pintaUmaVez=926ms | Mu:?=852ms
 *   travadas: 533ms@-2s[anim=1:btnCtaShine×1 nos=4238 snaps=1] | 1011ms@-0.9s
 *
 * Três coisas saíram daí, e este teste trava as três.
 *
 * ── 1. PINTURA EM FATIAS ACABOU ────────────────────────────────────────────
 * Relato: _"entra e scrollando corta"_. TERCEIRA volta do mesmo sintoma (1.9.42
 * desligou a versão original; a 1.9.75 remendou subindo a 1ª tacada de 3 pra 6
 * caixas). O remendo nunca podia funcionar: o defeito não é o TAMANHO da primeira
 * tacada, é EXISTIR uma segunda. O "Carregando" sai depois da 1ª tacada; as caixas
 * 7..N entram quadro a quadro DEPOIS, sem loader — quem rola nesse intervalo rola
 * pra dentro do que ainda não foi anexado. Mesma família do `content-visibility`,
 * banido pelos mesmos dois sintomas.
 * ⛔ Enquanto a tela for entregue incompleta, existe uma janela em que ela MENTE.
 *
 * ── 2. NENHUMA ANIMAÇÃO `infinite` DENTRO DO APP ───────────────────────────
 * `btnCtaShine` em 6 botões derrubou a rolagem inteira na 1.9.87 (fotografado com
 * ZERO JS rodando). Na 1.9.88 eu a reintroduzi como "brilho que ensina" — um
 * elemento só, mas `infinite`. O aparelho pegou ela viva numa travada de 533ms.
 * O custo não é por elemento, é por QUADRO.
 *
 * ⚰️ Esta suíte SUBSTITUI `tests/chave-pinta-em-etapas.test.js`, apagada aqui. Ela
 * travava a pintura em fatias — o comportamento que o aparelho acabou de condenar —
 * e as duas não podiam coexistir. O que ela protegia de bom continua vivo: o loader
 * só aparece com a tela VAZIA (re-render é mudo) segue travado em
 * `tests/eco-de-snapshot-nao-trava-a-thread.test.js`, e o banimento do
 * `content-visibility` foi trazido pra cá.
 *
 * ── 3. RELATÓRIO SEM NOME É RELATÓRIO INÚTIL ───────────────────────────────
 * `Mu:?=852ms`: um observer segurando a thread por quase 1s e sem nome, porque
 * todo callback nosso é anônimo e o wrapper usava só `cb.name`. Sabia-se que
 * doía, não onde.
 */
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── a tela nunca é entregue pela metade ────');

// ── 1. a chave pinta ATÔMICA ───────────────────────────────────────────────
const bracket = R('js/views/bracket.js');
const iP = bracket.indexOf('function _pintarEmEtapas');
ok(iP > 0, 'existe _pintarEmEtapas');
const pintar = bracket.slice(iP, bracket.indexOf('// ⚠️ NUNCA DEPENDER DE UM ÚNICO AGENDADOR', iP));

ok(/var _fatiar = false;/.test(pintar), 'a pintura em fatias está DESLIGADA (_fatiar = false)');
ok(!/window\._isSoftRefresh && !\(container && container\.firstElementChild\)[\s\S]{0,40}$/m.test(
   pintar.split('_entregarQuandoPronto')[0]) || /var _fatiar = false;/.test(pintar),
   'e não há condição que possa religá-la');
ok(/_entregarQuandoPronto/.test(pintar), 'quem entrega a tela continua sendo o "Carregando"');
// a rede que pinta tudo de uma vez tem que continuar existindo
ok(/container\.innerHTML = leve \+ _tudo;/.test(pintar), 'o caminho atômico (innerHTML inteiro) está lá');

// ⛔ content-visibility segue banido — mesma família.
// Comentário de bloco fora ANTES de olhar: o trecho desligado continua no arquivo
// documentando o porquê, e ler o comentário como se fosse regra é acusar o próprio
// registro histórico.
const comps = R('css/components.css');
const compsVivo = comps.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/content-visibility:\s*auto/.test(compsVivo),
   'content-visibility:auto continua banido (só sobrevive dentro de comentário)');

// ── 2. o btnCtaShine nunca mais roda pra sempre DENTRO do app ──────────────
// ⚠️ A regra é ESTREITA de propósito. "Nenhuma animação infinite" seria falso:
// spinner TEM que girar enquanto carrega (lj-spin-kf, sp-btn-spin) e os pulsos de
// anel (spGlowRing, hint-pulse-ring) foram justamente a troca BARATA que substituiu
// os que animavam sombra. O que a 1.9.87 provou venenoso foi ESTE efeito — um
// gradiente varrendo dentro de um overflow:hidden — e é ele que fica travado aqui.
const usosShine = compsVivo.split('\n')
  .map((l, i) => ({ l: l, n: i + 1 }))
  .filter((o) => /animation:[^;]*btnCtaShine/.test(o.l));
const shineInfinito = usosShine.filter((o) => /\binfinite\b/.test(o.l));
const foraDaLanding = shineInfinito.filter((o) => {
  const antes = compsVivo.split('\n').slice(Math.max(0, o.n - 8), o.n).join(' ');
  return !/\.landing-page/.test(antes);
});
ok(foraDaLanding.length === 0,
   'btnCtaShine só roda `infinite` na landing — nunca dentro do app' +
   (foraDaLanding.length ? ' — achei: ' + foraDaLanding.map((o) => o.n + ': ' + o.l.trim()).join(' | ') : ''));

// o brilho que ensina: finito, e sem camada permanente
const iDica = compsVivo.indexOf('.sp-shine-dica::after');
ok(iDica > 0, 'o brilho que ensina existe');
const dica = compsVivo.slice(iDica, compsVivo.indexOf('}', iDica));
ok(/animation:\s*btnCtaShine 4s ease-in-out 2 forwards;/.test(dica),
   'o brilho que ensina é FINITO (2 passadas), nunca infinite');
ok(!/will-change\s*:/.test(dica),
   'e sem will-change: a camada própria ficaria depois de a animação acabar');

// ── 3. o perfilador NOMEIA quem segurou a thread ───────────────────────────
const store = R('js/store.js');
const iObs = store.indexOf("['IntersectionObserver', 'MutationObserver', 'ResizeObserver']");
ok(iObs > 0, 'os observers entram no rastro');
const obs = store.slice(iObs, store.indexOf('Novo.prototype = Orig.prototype;', iObs));
ok(!/nome\.slice\(0, 2\) \+ ':' \+ \(cb\.name \|\| '\?'\)/.test(obs),
   'o observer não é mais registrado como "?" quando o callback é anônimo');
ok(/String\(cb\)\.replace\(\/\\s\+\/g, ' '\)\.slice\(9, 69\)/.test(obs),
   'ele recorta o CÓDIGO do callback — que identifica sem ambiguidade');
ok(/try \{ _quem = cb\.name/.test(obs),
   'e o recorte é protegido: um throw aqui viveria dentro de um `finally` e quebraria o próprio perfilador');

// ── 4. o cromo não rediscute o documento inteiro a cada mutação (1.9.91) ───
// MEDIDO no iPhone do dono (Sentry 7683086330, release 1.9.90):
//   `Mu:) { observeExistingHeaders(); window._reflowChrome(); }=172ms`
// O observer escuta o #view-container INTEIRO e chamava `_reflowChrome` SÍNCRONO
// a cada lote. O `_reflowChrome` lê layout e depois escreve cinco custom
// properties no `documentElement` — o que invalida o estilo do DOCUMENTO TODO.
// Medido no navegador, 50 lotes de mutação: 50 reflows / 250 escritas ANTES;
// 1 por quadro / ZERO escritas DEPOIS (os números quase nunca mudam — a topbar
// não muda de altura porque entrou um card na lista).
const iMo = store.indexOf('function initDomObserver()');
ok(iMo > 0, 'o observer do cromo existe');
const moBloco = store.slice(iMo, store.indexOf('observeExistingHeaders();\n    window._reflowChrome();', iMo) + 60);
ok(/if \(_reflowPend\) return;\s*_reflowPend = true;/.test(moBloco),
   'o observer COALESCE: um reflow por quadro, não um por lote de mutação');
ok(/requestAnimationFrame\(_reflowAgora\)[\s\S]{0,80}setTimeout\(_reflowAgora, 100\)/.test(moBloco),
   'e corre rAF × timeout (rAF não dispara em aba de fundo)');
ok(!/new MutationObserver\(function\(\) \{\s*observeExistingHeaders\(\);\s*window\._reflowChrome\(\);\s*\}\)/.test(store),
   '⛔ a versão síncrona (reflow por lote) não existe mais');

const iVar = store.indexOf("var _vars = window._spChromeVars");
ok(iVar > 0, 'existe o cache das variáveis do cromo');
const varBloco = store.slice(iVar, store.indexOf('--scroll-anchor', iVar) + 400);
ok(/if \(_vars\[nome\] === valor\) return;/.test(varBloco),
   'variável CSS só é escrita quando o valor MUDOU (escrever igual invalida o documento de graça)');
['--topbar-h', '--hamburger-dd-h', '--backheader-h', '--stickybar-h', '--scroll-anchor'].forEach(function (v) {
  ok(new RegExp("_setVar\\('" + v + "'").test(store), 'a variável ' + v + ' passa pelo guarda');
});
ok(!/document\.documentElement\.style\.setProperty\('--(topbar-h|hamburger-dd-h|backheader-h|stickybar-h|scroll-anchor)'/.test(store),
   '⛔ nenhuma das cinco escreve direto no documentElement, contornando o guarda');

// ── 5. o relatório do aparelho não pode chegar cortado ────────────────────
// O da 1.9.90 chegou truncado em 253 caracteres, e o corte caiu EXATAMENTE em
// cima das travadas — a parte que diz quem segurou a tela.
ok(/travadas: ' \+ \(travadas\.join/.test(store),
   'as TRAVADAS vêm primeiro na mensagem (é o que mais explica, e o fim é o que se perde)');
ok(/tr\.dur >= 120/.test(store),
   'trechos abaixo de 120ms ficam fora: não são bloqueio, só gastam caracteres');
ok(/\(tasks\.length \? ' · longtasks: ' \+ tasks\.join\(' \| '\) : ''\)/.test(store),
   'e "longtasks: sem suporte" não é mais enviado (o WKWebView nunca tem a API)');

// ── 6. a barra do "Carregando" anda SEM a thread principal (1.9.93) ───────
// Relato do dono na 1.9.92: _"o carregando chega em 100% com a barra travada em
// 5% aprox."_ Duas causas somadas:
//   (a) o creep vinha de `setInterval(140ms)` — que morre EXATAMENTE quando a
//       thread trava, que é o único momento em que a pessoa encara a barra;
//   (b) o preenchimento era `transition: width`, e `width` é LAYOUT: nem quando o
//       valor final chegava havia quadro pra pintar antes de a tela sair. Já o `%`
//       é textContent e salta na hora — daí 100% sobre barra parada.
// Agora quem move é animação CSS em `transform:scaleX`, que o compositor roda sem
// a thread. VERIFICADO no navegador: animação `sp-loader-creep` anexada e running
// (9000ms), e o finish deixa `matrix(1,0,0,1,0,0)` com `animation-name: none`.
const iKf = store.indexOf('window._spLoaderKeyframes = function');
const kf = store.slice(iKf, store.indexOf('window._SP_LOADER_CREEP_MS', iKf) + 80);
ok(/@keyframes sp-loader-creep\{from\{transform:scaleX\(0\.04\)\}to\{transform:scaleX\(0\.95\)\}\}/.test(kf),
   'o creep é animação CSS em transform (composta na GPU), não JS');
ok(/window\._SP_LOADER_CREEP_MS = 9000;/.test(store),
   'a duração mora num lugar só — JS e CSS não podem discordar');

const iBarra = store.indexOf("return '<div class=\"sp-loader-bar\"");
const barra = store.slice(iBarra, store.indexOf('_spLoaderTick', iBarra));
ok(/animation:sp-loader-creep 9s linear forwards/.test(barra),
   'o preenchimento nasce com o creep ligado');
ok(/transform-origin:left center;transform:scaleX\(0\.04\)/.test(barra),
   'e cresce da esquerda por scaleX');
ok(!/transition:width/.test(barra),
   '⛔ nada de `transition: width` — é layout, e não pinta antes de a tela sair');

const iTick = store.indexOf('window._spLoaderTick = function');
const tick = store.slice(iTick, store.indexOf('window._spLoaderFinish', iTick));
ok(!/sp-loader-fill/.test(tick),
   'o tick NÃO toca mais na barra (quem move é o compositor)');
ok(/var p = 4 \+ \(95 - 4\) \* frac;/.test(tick),
   'o texto usa a MESMA fórmula linear do @keyframes — número e barra não divergem');
ok(/\(agora - t0\) \/ \(window\._SP_LOADER_CREEP_MS/.test(tick),
   'e é calculado por TEMPO DECORRIDO: depois de uma travada o texto pula pro valor real, sem acumular o que perdeu');

const iFin = store.indexOf('window._spLoaderFinish = function');
const fin = store.slice(iFin, store.indexOf('window._spLoaderLogoHtml', iFin));
ok(/f\.style\.animation = 'none';/.test(fin),
   'o finish MATA a animação — senão o `forwards` seguraria 95% sob um texto de 100%');
ok(/f\.style\.transform = 'scaleX\(1\)';/.test(fin), 'e crava scaleX(1)');

// ── 7. ⛔ NADA DE MEDIR LAYOUT DENTRO DE OUVINTE DE ROLAGEM (1.9.94) ───────
// ERA ESTE O "SCROLLA E CORTA", e ele sobreviveu a QUATRO versões porque meu
// perfilador é cego aqui: ele embrulha timers e observers, nunca listeners de
// rolagem. Por isso as travadas do aparelho do dono chegavam com `anim=0` e
// NENHUM JS atribuído — o culpado não passava por nenhum dos dois wrappers.
//
// O ouvinte chamava `_reflowChrome()` a cada evento de scroll (até 60/s), e o
// `_reflowChrome` varre `[id^="fbwrap-"]` com getComputedStyle +
// getBoundingClientRect: recálculo de estilo e LAYOUT do documento inteiro, no
// meio da rolagem. MEDIDO no navegador, 60 eventos num documento de 3238 nós:
// 313,7ms de thread (5,23ms por evento) → 0ms depois. O aparelho do dono tem
// 4238 nós e é mais lento: perto de 1s de thread bloqueada por segundo de rolagem.
// É por isso que a tela vinha cortada e se "consertava" ao parar de rolar.
const iChrome = store.indexOf('window._backHeaderObserverInstalled = true;');
ok(iChrome > 0, 'o instalador do cromo existe');
const chrome = store.slice(iChrome, store.indexOf('// ─── Constantes globais', iChrome));
ok(!/addEventListener\('scroll'[\s\S]{0,160}_reflowChrome/.test(chrome),
   '⛔ NENHUM ouvinte de rolagem chama _reflowChrome');
ok(/addEventListener\('resize'/.test(chrome),
   'o de RESIZE continua (aí a altura muda de verdade, e é raro)');
// varredura ampla: em NENHUM arquivo pode haver reflow do cromo preso ao scroll
['js/store.js', 'js/ui.js', 'js/views/bracket.js', 'js/views/dashboard.js'].forEach(function (f) {
  const src2 = R(f);
  ok(!/addEventListener\(\s*['"]scroll['"][\s\S]{0,200}?_reflowChrome\s*\(/.test(src2),
     'nenhum ouvinte de rolagem chama _reflowChrome em ' + f);
});

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
