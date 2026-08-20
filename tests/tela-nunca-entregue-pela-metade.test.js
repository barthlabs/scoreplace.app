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

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
