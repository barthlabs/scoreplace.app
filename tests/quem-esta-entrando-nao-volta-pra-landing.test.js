/* QUEM ESTÁ ENTRANDO NÃO VOLTA PRA LANDING NEM PRO LOGIN
 * node tests/quem-esta-entrando-nao-volta-pra-landing.test.js
 *
 * ORDEM DO DONO (28/ago/2026): _"quando a pessoa faz login a partir da landing page, não
 * pode voltar à landing page, nem à tela de login. isso causa confusão. a pessoa logou e
 * volta para a landing ou para a tela de login e ela se pergunta: não deu certo? use o
 * carregando em vez disso"_.
 *
 * A JANELA QUE CAUSA ISSO: entre "o provedor autenticou" e "o app tem o usuário",
 * `AppStore.currentUser` é null. O portão do router conclui — corretamente pelo que ele
 * sabe — "não logado ⇒ landing". No fluxo de REDIRECT a janela é maior ainda: a página
 * recarrega inteira e volta com o `getRedirectResult` pendente.
 * ⛔ Para quem está olhando, voltar pra tela de onde saiu significa UMA coisa: falhou.
 *
 * ⚠️ E A ARMADILHA QUE ESTE TESTE TAMBÉM GUARDA: marca sem prazo prende a pessoa no
 * "Carregando" pra sempre se algum erro não for tratado. Trocar "parece que falhou" por
 * "não sai mais do lugar" seria PIORAR. Por isso a marca caduca.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const auth = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const router = fs.readFileSync(path.join(ROOT, 'js', 'router.js'), 'utf8');

// ── ① as três funções da marca, EXECUTADAS contra um sessionStorage de mentira ────
console.log('\n① A marca vive, caduca e some — rodando as funções REAIS');
const ini = auth.indexOf("var _LOGIN_EM_CURSO_K = 'sp_login_em_curso';");
ok(ini > 0, 'achei os helpers da marca no auth.js');
const fim = auth.indexOf('\n};', auth.indexOf('window._loginEmCurso = function ()', ini)) + 3;
const corpo = auth.slice(ini, fim);

function novoAmbiente(agora) {
  const store = {};
  const win = { _log: function () {} };
  const ss = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  new Function('window', 'sessionStorage', 'Date', corpo)(win, ss, { now: () => agora });
  return { win: win, store: store, ss: ss };
}

const T0 = 1000000;
let a = novoAmbiente(T0);
ok(a.win._loginEmCurso() === false, 'sem marca, não há login em curso');
a.win._marcarLoginEmCurso();
ok(a.win._loginEmCurso() === true, '⛔ marcado ⇒ login em curso (é o que segura a landing)');
a.win._limparLoginEmCurso();
ok(a.win._loginEmCurso() === false, 'apagada ⇒ a landing volta a valer na hora');

console.log('\n② ⛔ A MARCA CADUCA — ninguém fica preso no "Carregando"');
a = novoAmbiente(T0);
a.win._marcarLoginEmCurso();
const guardado = a.store['sp_login_em_curso'];
let b = novoAmbiente(T0 + 19000);
b.store['sp_login_em_curso'] = guardado;
ok(b.win._loginEmCurso() === true, 'aos 19s ainda vale (login lento é login)');
let c = novoAmbiente(T0 + 21000);
c.store['sp_login_em_curso'] = guardado;
ok(c.win._loginEmCurso() === false, '⛔ aos 21s caducou — erro não tratado não vira armadilha');
ok(c.store['sp_login_em_curso'] === undefined, 'e ela se apaga sozinha ao caducar');

console.log('\n③ Ela sobrevive ao REDIRECT (que recarrega a página)');
ok(/sessionStorage\.setItem\(_LOGIN_EM_CURSO_K/.test(auth),
   '⛔ mora em sessionStorage, não numa variável — variável morre no reload, e o redirect É um reload');

// ── ④ o portão do router usa a marca, e ANTES das outras perguntas ────────────────
console.log('\n④ O portão da landing pinta o Carregando');
const iG = router.indexOf("if (!_isLoggedInNow && !_isLegalView && typeof renderLanding === 'function') {");
ok(iG > 0, 'achei o portão da landing');
const portao = router.slice(iG, router.indexOf('// Firebase resolveu com null', iG));
ok(/window\._loginEmCurso\(\)/.test(portao), '⛔ ele pergunta se há login em curso');
ok(/_renderBallLoader/.test(portao.slice(0, portao.indexOf('_hasAuthCacheNow'))),
   '⛔ e pinta o Carregando canônico nesse ramo');
const posLogin = portao.indexOf('window._loginEmCurso()');
const posCache = portao.indexOf('if (_hasAuthCacheNow)');
ok(posLogin > 0 && posCache > posLogin,
   '⛔⛔ a pergunta "estou entrando agora?" vem ANTES da de cache — senão quem entra pela ' +
   'PRIMEIRA vez (sem cache), que é o caso do relato, cairia na landing assim mesmo');

// ── ⑤ posta nos três caminhos, apagada no funil de sucesso ───────────────────────
console.log('\n⑤ Posta em todo caminho de login, apagada quando resolve');
['function handleGoogleLogin', 'function handleAppleLogin', 'function handleEmailLogin'].forEach((f) => {
  const i = auth.indexOf(f);
  ok(i > 0 && /_marcarLoginEmCurso\(\)/.test(auth.slice(i, i + 1200)), '   ' + f.replace('function ', '') + ' marca');
});
const iS = auth.indexOf('async function simulateLoginSuccess(user) {');
ok(iS > 0 && /_limparLoginEmCurso\(\)/.test(auth.slice(iS, iS + 900)),
   '⭐ e o FUNIL ÚNICO de sucesso apaga — um clear por caminho ficaria devendo em algum');
ok(/if \(!result \|\| !result\.user\) \{[\s\S]{0,400}_limparLoginEmCurso/.test(auth),
   '⛔ redirect que volta SEM usuário também apaga (o pior caso, porque a página recarregou)');

console.log(falhas === 0
  ? '\n✅ entrou não volta pra porta; e o "Carregando" tem saída\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
