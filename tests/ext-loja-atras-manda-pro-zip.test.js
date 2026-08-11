#!/usr/bin/env node
/* ENQUANTO A LOJA NÃO TEM A VERSÃO EXIGIDA, O APP MANDA PRO ZIP.
 *
 * POR QUE EXISTE (bronca do dono, 11/ago/2026, minutos depois de eu subir a 1.8.13 com a
 * extensão bumpada pra 1.99): _"a extensão tem que ter versão zip se não estiver na loja,
 * que leva dias. não adianta apontar para a loja enquanto a nova versão não estiver lá."_
 *
 * O BURACO É FECHADO E SEM SAÍDA, e por isso precisa de trava e não de lembrete:
 * `SP_EXT_VERSION` é ao mesmo tempo (a) a versão nova e (b) o MÍNIMO que o gate exige. No
 * instante do bump, TODO usuário fica abaixo do mínimo — e a Chrome Web Store, que leva
 * dias revisando, ainda serve a anterior. Mandar pra lá faz o Chrome responder "já está
 * atualizada": a pessoa clica, nada acontece, e ela fica presa sem conseguir importar.
 * Ou seja, bumpar a extensão e apontar pra loja QUEBRA a importação pra todo mundo até a
 * revisão sair.
 *
 * A REGRA: quem decide loja × zip é window._spExtStoreTemMinimo(), comparando a versão
 * DECLARADA como publicada (SP_EXT_STORE_VERSION) com a exigida (SP_EXT_VERSION).
 *
 * Uso:  node tests/ext-loja-atras-manda-pro-zip.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { bad++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

// ── as duas versões, lidas da FONTE (nunca hardcodadas aqui) ─────────────────
const storeSrc = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const vExig = (storeSrc.match(/SP_EXT_VERSION\s*=\s*'([^']+)'/) || [])[1];
const vLoja = (storeSrc.match(/SP_EXT_STORE_VERSION\s*=\s*'([^']+)'/) || [])[1];

console.log('\n1. AS DUAS VERSÕES EXISTEM E SÃO COERENTES');
t('SP_EXT_VERSION declarada', () => assert.ok(/^\d+\.\d+/.test(vExig || ''), 'ilegível: ' + vExig));
t('SP_EXT_STORE_VERSION declarada', () => {
  assert.ok(/^\d+\.\d+/.test(vLoja || ''),
    'SP_EXT_STORE_VERSION sumiu de js/store.js. Sem ela o app não tem como saber se a loja ' +
    'já serve a versão exigida, e volta a mandar todo mundo pra um beco.');
});
t('a loja NUNCA é declarada à frente da exigida', () => {
  // Dizer que a loja tem uma versão que nem existe no repo é mentir pro próprio app: ele
  // mandaria pra loja num momento em que ela não pode resolver.
  const cmp = (a, b) => {
    const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if ((A[i] || 0) > (B[i] || 0)) return 1;
      if ((A[i] || 0) < (B[i] || 0)) return -1;
    }
    return 0;
  };
  assert.ok(cmp(vLoja, vExig) <= 0,
    'SP_EXT_STORE_VERSION (' + vLoja + ') está À FRENTE de SP_EXT_VERSION (' + vExig + ')');
});

console.log('\n2. O COMPARADOR DECIDE CERTO (função real do store.js)');
const win = {};
new Function('window', storeSrc.slice(storeSrc.indexOf('window.SP_EXT_VERSION'),
  storeSrc.indexOf('// ─────────────────────────────────────────────────────────────────────────────',
                   storeSrc.indexOf('_spExtStoreTemMinimo'))))(win);
t('_spExtStoreTemMinimo existe', () => assert.strictEqual(typeof win._spExtStoreTemMinimo, 'function'));
[
  ['1.98', '1.99', false, 'loja atrás por patch'],
  ['1.99', '1.99', true,  'loja igual'],
  ['2.00', '1.99', true,  'loja à frente'],
  ['1.9',  '1.10', false, 'compara por CAMPO, não por texto (1.10 > 1.9)'],
  ['1.100', '1.99', true, 'e 1.100 é MAIOR que 1.99']
].forEach(([loja, exig, esperado, nota]) => {
  t('loja=' + loja + ' exigida=' + exig + ' → ' + esperado + '  (' + nota + ')', () => {
    win.SP_EXT_STORE_VERSION = loja; win.SP_EXT_VERSION = exig;
    assert.strictEqual(win._spExtStoreTemMinimo(), esperado);
  });
});

console.log('\n3. AS TELAS RESPEITAM A DECISÃO — nenhuma manda pra loja por conta própria');
// São TRÊS telas que pedem a extensão, e o histórico do projeto é de uma delas divergir
// (ver [[feedback_unify_dual_entry_points]]): na 1.8.3, três das quatro ainda mandavam
// baixar zip porque a URL da loja morava DENTRO de uma view.
const onb = fs.readFileSync(path.join(raiz, 'js/views/letzplay-onboarding.js'), 'utf8');
const rep = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');

t('o onboarding consulta _spExtStoreTemMinimo', () => {
  assert.ok(/_spExtStoreTemMinimo/.test(onb), 'letzplay-onboarding.js não consulta a decisão');
});
t('a Análise consulta _spExtStoreTemMinimo nos DOIS pontos', () => {
  const n = (rep.match(/_spExtStoreTemMinimo/g) || []).length;
  assert.ok(n >= 2, 'esperava 2 pontos (o aviso e o diálogo), achei ' + n);
});
t('o onboarding tem um botão de ZIP, não só a nota de rodapé', () => {
  assert.ok(/function _zipBtn/.test(onb),
    'sem _zipBtn o zip volta a ser só texto cinza embaixo do botão da loja — que é ' +
    'exatamente o estado que o dono reprovou');
});
t('a escolha do botão é PONTO ÚNICO no onboarding (_instalarBtn)', () => {
  assert.ok(/function _instalarBtn/.test(onb));
  // e os dois ramos que oferecem instalação passam por ela
  const corpo = onb.slice(onb.indexOf('function _installStepBody'), onb.indexOf('function _lojaTemMinimo'));
  const viaHelper = (corpo.match(/_instalarBtn\(/g) || []).length;
  assert.strictEqual(viaHelper, 2,
    'os 2 ramos (sem extensão / desatualizada) têm que passar por _instalarBtn; achei ' + viaHelper);
});
t('quem NÃO tem extensão também vai pro zip nesta janela', () => {
  // Era o ramo que ia sempre pra loja, com o argumento "quem instala do zero pega a de lá".
  // Falso enquanto a loja está atrás: instala a antiga e leva o bloqueio em seguida.
  const corpo = onb.slice(onb.indexOf('function _installStepBody'), onb.indexOf('function _lojaTemMinimo'));
  const ultimo = corpo.slice(corpo.lastIndexOf('return '));
  assert.ok(/_instalarBtn\(/.test(ultimo), 'o ramo "sem extensão" voltou a chamar _storeBtn direto');
});

console.log('\n3b. A LOJA APARECE SEMPRE — o zip SOMA, nunca substitui');
// Regra do dono, corrigindo a 1ª versão desta feature: "loja sempre e zip enquanto a loja
// não tiver a versão atualizada". Eu tinha feito um ou-outro, e o link da loja SUMIA na
// janela de revisão — o que apagaria o destino permanente (e o auto-update que vem com ele)
// durante os dias de revisão.
t('_instalarBtn devolve os DOIS quando a loja está atrás', () => {
  const fn = onb.slice(onb.indexOf('function _instalarBtn'), onb.indexOf('function _instalarBtn') + 700);
  const ramo = fn.slice(fn.indexOf('_lojaTemMinimo()'));
  assert.ok(/_zipBtn\(/.test(ramo) && /_storeBtn\(/.test(ramo),
    'o ramo "loja atrás" tem que montar zip E loja; hoje: ' + ramo.replace(/\s+/g, ' ').slice(0, 160));
});
t('e nenhum ramo devolve o zip SOZINHO', () => {
  const fn = onb.slice(onb.indexOf('function _instalarBtn'), onb.indexOf('function _instalarBtn') + 700);
  assert.ok(!/return\s+_zipBtn\([^)]*\)\s*(\|\|[^;]*)?;/.test(fn),
    'algum ramo voltou a devolver só o zip — a loja precisa aparecer junto');
});
t('o aviso da Análise mantém o link da loja na janela do zip', () => {
  // o ramo !lojaOk monta a frase do zip e ainda assim concatena `loja`
  const i = rep.indexOf('OS DOIS CAMINHOS');
  assert.ok(i > 0, 'o bloco do aviso mudou de forma — reveja este teste');
  const bloco = rep.slice(i, i + 1600);
  const ramoZip = bloco.slice(bloco.indexOf('if (!lojaOk'));
  assert.ok(/\+ loja \+|\+ loja;|loja \+/.test(ramoZip),
    'o ramo do zip parou de incluir o link da loja');
});

console.log('\n4. O ZIP DA VERSÃO EXIGIDA EXISTE DE VERDADE');
t('o arquivo scoreplace-letzplay-ext-<exigida>.zip está no repo', () => {
  const zip = path.join(raiz, 'scoreplace-letzplay-ext-' + vExig + '.zip');
  assert.ok(fs.existsSync(zip),
    'mandar pro zip sem o zip existir é um 404 no único caminho que resolve: ' + path.basename(zip));
  assert.ok(fs.statSync(zip).size > 10000, 'zip suspeito de vazio');
});

console.log('\n' + (bad ? '❌' : '✅') + ' ext-loja-atras-manda-pro-zip: ' + ok + ' passaram, ' + bad + ' falharam');
if (!bad && vLoja !== vExig) {
  console.log('   ℹ️  loja em ' + vLoja + ' e app exigindo ' + vExig + ' → o app está mandando pro ZIP.');
  console.log('      Quando a Chrome Web Store publicar a ' + vExig + ', suba SP_EXT_STORE_VERSION.');
}
process.exit(bad ? 1 : 0);
