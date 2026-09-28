'use strict';
/* APP CHECK FECHA A PORTA PÚBLICA — e o cliente precisa MANDAR o token, senão nada entra.
 * node tests/app-check-fecha-a-porta-publica.test.js
 *
 * ⛔⛔ POR QUE EXISTE: a entrada sem senha precisa de uma porta que funcione ANTES de a pessoa logar,
 * então ela não pode exigir login. Sem App Check, qualquer um chama essa porta de fora do navegador,
 * no laço que quiser. CORS e o cabeçalho `Origin` NÃO servem para isso — os dois são escritos por quem
 * chama, e eu já tentei me apoiar nos dois antes de entender isso.
 *
 * ⛔ SÃO TRÊS PEÇAS, e faltando uma o conjunto não funciona ou quebra tudo:
 *   ① o SDK do App Check carregado na página;
 *   ② o cliente ATIVANDO com a chave de site e MANDANDO o token em cada chamada — este transporte é
 *      montado à mão, não é o SDK de Functions, então o cabeçalho não vai sozinho. Foi exatamente o
 *      que a revisão apontou: o cliente mandava só `Content-Type` e, havendo sessão, `Authorization`;
 *   ③ o servidor EXIGINDO (`enforceAppCheck`) nas duas portas públicas.
 * ⚠️ Ligar ③ sem ② recusaria TODAS as chamadas, inclusive as legítimas. A ordem importa e por isso as
 * três são conferidas juntas, num arquivo só.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const semCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── app check fecha a porta pública ────\n');

/* ── ① O SDK NA PÁGINA ─────────────────────────────────────────────────────── */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/firebase-app-check-compat\.js/.test(idx), '① o SDK do App Check é carregado pela página');
const iSdk = idx.indexOf('firebase-app-check-compat.js');
const iApp = idx.indexOf('firebase-app-compat.js');
ok(iApp > 0 && iSdk > iApp, '① e depois do SDK base do Firebase');

/* ── ② O CLIENTE ATIVA E MANDA ─────────────────────────────────────────────── */
const auth = semCom(fs.readFileSync(path.join(ROOT, 'js/views/auth.js'), 'utf8'));
ok(/firebase\.appCheck\(\)\.activate\(/.test(auth), '② o cliente ATIVA o App Check');
ok(/ReCaptchaEnterpriseProvider\('6L[\w-]+'\)/.test(auth),
  '② com a chave de SITE do reCAPTCHA Enterprise (pública por natureza — ela identifica, não autoriza)');
/* ⛔ A ORDEM É CONFERIDA NO TEXTO CRU, com âncora EXATA. Eu tinha comparado no texto sem comentários
 * e deu falso vermelho: o recorte de blocos `/* *\/` engoliu a própria linha do `initializeApp` e o
 * índice foi parar num `initializeApp` de app secundário, 300 KB adiante. Tirar comentário para achar
 * ORDEM é trocar a coisa medida — a ordem é do arquivo, não do arquivo mutilado. */
const authCru = fs.readFileSync(path.join(ROOT, 'js/views/auth.js'), 'utf8');
const iInit = authCru.indexOf('firebase.initializeApp(firebaseConfig)');
const iAct = authCru.indexOf('firebase.appCheck().activate(');
ok(iInit > 0, '② o initializeApp principal foi achado');
ok(iAct > iInit, '② ⛔ e o App Check é ativado DEPOIS dele — antes não há app para proteger');
ok(/activate\([\s\S]{0,200},\s*true\s*\)/.test(auth),
  '② ⛔ com renovação automática do token: sem isso ele vence em 1h e quem deixa a aba aberta o dia todo é recusado');

const db = semCom(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8'));
ok(/X-Firebase-AppCheck/.test(db),
  '② ⛔⛔ o transporte MANDA o cabeçalho — ele é montado à mão, o cabeçalho não vai sozinho');
const iCab = db.indexOf("cab['Authorization']");
const iAC = db.indexOf("X-Firebase-AppCheck");
const iFetch = db.indexOf('await fetch(url', iCab > 0 ? iCab : 0);
ok(iAC > 0 && iFetch > 0 && iAC < iFetch, '② e o cabeçalho é posto ANTES da chamada sair');
ok(/catch \(_eAC\)/.test(db),
  '② ⛔ e é best-effort: bloqueador de anúncio comendo o SDK não pode derrubar o app inteiro');

/* ── ③ O SERVIDOR EXIGE, e só nas portas públicas ──────────────────────────── */
const fn = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const bloco = (id) => { const i = fn.indexOf('exports.' + id + ' = onCall'); const j = fn.indexOf('\n);', i); return i < 0 ? '' : fn.slice(i, j); };
['iniciarEntradaPorPasskey', 'concluirEntradaPorPasskey'].forEach(function (id) {
  const b = bloco(id);
  ok(b.length > 100, '③ o bloco de ' + id + ' foi achado');
  ok(/enforceAppCheck:\s*true/.test(b), '③ ⛔⛔ ' + id + ' EXIGE App Check');
  ok(!/App Check, que não existe no projeto/.test(b),
    '③ o comentário de ' + id + ' não contradiz a proteção que ele realmente exige');
});
/* ⛔ E NÃO nas portas de quem já está logado: ali a sessão já prova quem é, e exigir App Check
 * derrubaria quem estivesse com a página velha aberta no meio de um torneio. */
['concluirCadastroDePasskey', 'listarMinhasPasskeys', 'revogarPasskey'].forEach(function (id) {
  const b = bloco(id);
  if (!b) return;
  ok(!/enforceAppCheck:\s*true/.test(b),
    '③ ⚠️ ' + id + ' NÃO exige — é porta de quem já entrou, e a sessão já prova quem é');
});
const quantas = (fn.match(/enforceAppCheck:\s*true/g) || []).length;
ok(quantas === 2, '③ exatamente DUAS portas exigem App Check hoje (achei ' + quantas + ')');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
