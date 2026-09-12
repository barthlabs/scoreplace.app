'use strict';
/* ⛔ "AINDA NÃO AUTORIZOU" NÃO É FALHA — É A PRIMEIRA VEZ.
 * Relato do dono (12/set/2026, Android real, 2.2.82): _"erro ao entrar com o google e aí
 * clicando de novo aparece a conta única no aparelho e daí consegue entrar, bug claro"_.
 * MEDIDO no plugin (@capacitor-firebase/authentication@8.3.0,
 * GoogleAuthProviderHandler.java): `signInOrLink` lê `useCredentialManager` (padrão true) e
 * passa pelo Credential Manager; sem credencial guardada ele lança `NoCredentialException`
 * ("No credentials available"). Com `useCredentialManager:false` o mesmo plugin abre o
 * seletor de contas clássico — a tela que funcionava no segundo toque.
 * A rede aqui é estreita de propósito: DESISTÊNCIA do usuário não pode virar reabertura.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const AUTH = fs.readFileSync(path.join(raiz, 'js/views/auth.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① existe o pedido com queda para o seletor ──────────────────────────────
const ini = AUTH.indexOf('function _pedeCredencialDoGoogle');
assert.ok(ini > 0, 'âncora: o pedido de credencial do Google');
const fim = AUTH.indexOf('function _handleGoogleLoginNative', ini);
assert.ok(fim > ini, 'âncora: o fim do pedido');
const pede = semComentario(AUTH.slice(ini, fim));

must(/FA\.signInWithGoogle\(\)/.test(pede),
  '① tenta primeiro o caminho moderno (Credential Manager), sem opção');
must(/useCredentialManager: false/.test(pede),
  '① e, ao faltar credencial, repete pedindo o SELETOR DE CONTAS');

// ── ② a rede pega ESTE erro e só ele ────────────────────────────────────────
const re = /\/(NoCredentialException[^/]*)\/i/.exec(pede);
assert.ok(re, 'âncora: a expressão que reconhece a falta de credencial');
const regra = new RegExp(re[1], 'i');
must(regra.test('androidx.credentials.exceptions.NoCredentialException: No credentials available'),
  '② o erro REAL do aparelho casa com a rede');
must(regra.test('No credentials available'), '② e a mensagem nua também');
must(!regra.test('activity is cancelled by the user.'),
  '② ⛔ DESISTIR não reabre o seletor — quem fechou a tela não quer vê-la de novo');
must(!regra.test('SIGN_IN_CANCELLED'), '② ⛔ nem o cancelamento do seletor clássico');
must(!regra.test('NETWORK_ERROR'), '② ⛔ e falha de rede não vira troca de caminho');
must(/throw _erro;/.test(pede),
  '② ⛔ o que não é falta de credencial SEGUE como erro — a rede não engole o resto');

// ── ③ o login nativo passa a usar o pedido, não o plugin cru ────────────────
const iniH = AUTH.indexOf('function _handleGoogleLoginNative');
const login = semComentario(AUTH.slice(iniH, iniH + 1200));
must(/_pedeCredencialDoGoogle\(\)\.then\(/.test(login),
  '③ o login nativo entra pelo pedido com rede, não por signInWithGoogle cru');
must(!/FA\.signInWithGoogle\(\)/.test(login),
  '③ ⛔ e não sobrou chamada crua ao plugin dentro do login — seria a porta velha de volta');

// ── ④ a trava de conteúdo do release nativo continua de pé ──────────────────
must(/_handleGoogleLoginNative/.test(AUTH),
  '④ o marcador que o ios-archive.sh exige continua no arquivo');

console.log('\n✅ sem credencial guardada, abre o seletor — ' + ok + ' verificações');
