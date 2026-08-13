/* LOGIN: O MODAL GUIA PRO MÉTODO CERTO — a fábrica de conta duplicada fecha.
 *
 * MEDIDO em 13/ago/2026 (206 contas no Auth): 68 só-senha, 63 só-Google, 5 com
 * e-mail oculto da Apple. A maioria tem UM método — e o modal antigo abria com
 * campo de SENHA + cadastro inline, com Google/Apple no FIM. Quem não lembrava
 * como entrou era conduzido a criar outra conta.
 *
 * Este teste trava as peças da leva 1.8.40:
 *   1. ORDEM: Google/Apple ANTES do bloco e-mail/senha no modal;
 *   2. "ÚLTIMO USADO": chave que sobrevive ao logout + badge + gancho central
 *      no openModal (todo caminho que abre o login decora);
 *   3. LINKING: _handleAccountLinking NÃO usa mais fetchSignInMethodsForEmail
 *      (morto com a proteção de enumeração LIGADA no projeto — devolvia []);
 *      usa a CF checkAccount e abre diálogo com ação;
 *   4. CORRIDA DO RESGATE: nenhum handler social cria users/{uid} antes do
 *      resolveLoginRedirect — só patch-se-existe;
 *   5. HINT PRECOCE: o campo de e-mail consulta checkAccount (debounce) e aponta
 *      o método certo ANTES de a pessoa errar a senha;
 *   6. "GARANTA SUA CONTA": pedido de celular pós-login com cooldown, priorizando
 *      as perguntas de duplicata/nome.
 * Comportamental onde dá; varredura de código (sem comentários) no resto.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const semComent = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('──── login: um caminho só ────');

const auth = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
const authCode = semComent(auth);
const ui = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8'));

// ── 1. ORDEM DO MODAL ─────────────────────────────────────────────────────────
// No fonte do setupLoginModal, o botão do Google e o da Apple têm que aparecer
// ANTES do bloco principal de e-mail/senha (login-block-main).
const modalStart = auth.indexOf('function setupLoginModal()');
ok(modalStart !== -1, 'setupLoginModal existe');
const modalSrc = auth.slice(modalStart, modalStart + 24000);
const iGoogle = modalSrc.indexOf('login-google-btn');
const iApple = modalSrc.indexOf('login-apple-btn');
const iMain = modalSrc.indexOf('login-block-main');
ok(iGoogle !== -1 && iMain !== -1 && iGoogle < iMain,
  'Google vem ANTES do bloco e-mail/senha no modal (topo)');
ok(iApple !== -1 && iApple < iMain, 'Apple vem ANTES do bloco e-mail/senha no modal (topo)');
ok(/Entre do mesmo jeito da última vez/.test(modalSrc),
  'o modal avisa: entrar por outro caminho cria conta separada');
ok(/_plat === 'ios'\) \? \(appleBtn \+ googleBtn\) : \(googleBtn \+ appleBtn\)/.test(modalSrc),
  'iOS nativo põe Apple primeiro (Guideline 4.8); web/Android, Google primeiro');

// ── 2. ÚLTIMO USADO ───────────────────────────────────────────────────────────
// (fonte CRU aqui: o stripper de comentário é ingênuo demais pro auth.js — regexes
// e strings com `/*` engolem trechos; onde a varredura precisa de precisão usamos
// fatias de função, não o arquivo inteiro despido)
ok(/localStorage\.setItem\('scoreplace_last_login_method'/.test(auth), 'chave própria de último método (sobrevive ao logout)');
ok(/window\._rememberLoginMethod = function/.test(auth) &&
   /_rememberLoginMethod === 'function'\) window\._rememberLoginMethod\(\)/.test(auth),
  'o método é memorizado no funil único (simulateLoginSuccess)');
ok(/window\._applyLastLoginBadge = function/.test(auth), 'badge "✓ da última vez" existe');
ok(/sp-lastlogin-badge/.test(auth), 'badge tem classe própria (removível/re-aplicável)');
ok(/_decorateLoginModal/.test(ui),
  'openModal (ui.js) decora o modal — TODO caminho que abre o login ganha banner+badge');

// ── 3. LINKING SEM API MORTA ──────────────────────────────────────────────────
const iLink = auth.indexOf('function _handleAccountLinking');
ok(iLink !== -1, '_handleAccountLinking existe');
const linkBody = semComent(auth.slice(iLink, auth.indexOf('function _tryLinkPendingCredential')));
ok(linkBody.indexOf('fetchSignInMethodsForEmail') === -1,
  'REGRESSÃO: _handleAccountLinking não pode voltar a usar fetchSignInMethodsForEmail (retorna [] com enumeração protegida)');
ok(/_entrarCheckAccount/.test(linkBody), 'linking consulta a CF checkAccount (Admin SDK enxerga os provedores)');
ok(/showConfirmDialog/.test(linkBody), 'linking abre DIÁLOGO com ação (não só notificação)');
ok(/_pendingLinkCredential = pendingCred/.test(linkBody),
  'credencial pendente guardada — _tryLinkPendingCredential vincula após o login certo');

// ── 4. CORRIDA DO RESGATE ─────────────────────────────────────────────────────
ok(/function _patchProfileIfExists\(/.test(auth), '_patchProfileIfExists existe');
ok(/\.update\(fields\)\.catch/.test(auth), 'patch usa update() — falha silenciosa quando o doc NÃO existe (nunca cria)');
// nenhum handler social pode gravar saveUserProfile ANTES do simulateLoginSuccess
const gStart = auth.indexOf('firebase.auth().signInWithPopup(authProvider)');
const gEnd = auth.indexOf('function _googleNativeLogin');
const googleHandler = semComent(auth.slice(gStart, gEnd));
ok(googleHandler.indexOf('saveUserProfile(user.uid') === -1,
  'REGRESSÃO: o handler do Google popup não pode criar users/{uid} (mata o resolveLoginRedirect)');
const aStart = auth.indexOf('function _onAppleAuthSuccess');
const appleHandler = semComent(auth.slice(aStart, aStart + 2500));
ok(appleHandler.indexOf('saveUserProfile(') === -1 && /_patchProfileIfExists\(/.test(appleHandler),
  'REGRESSÃO: _onAppleAuthSuccess usa patch-se-existe, nunca saveUserProfile');
const gnStart = auth.indexOf('function _onGoogleAuthSuccess');
const gnHandler = semComent(auth.slice(gnStart, gnStart + 2500));
ok(gnHandler.indexOf('saveUserProfile(') === -1 && /_patchProfileIfExists\(/.test(gnHandler),
  'REGRESSÃO: _onGoogleAuthSuccess usa patch-se-existe, nunca saveUserProfile');

// ── 5. HINT PRECOCE ───────────────────────────────────────────────────────────
ok(/window\._entrarEarlyHint = function/.test(auth), 'hint precoce existe');
ok(/_entrarEarlyHint === 'function'\) window\._entrarEarlyHint/.test(auth),
  'o campo identificador chama o hint (fiação no _onIdentifierInput)');
ok(/setTimeout\(function \(\) \{\n      if \(typeof window\._entrarCheckAccount !== 'function'\) return;/.test(auth) ||
   /_entrarEarlyHintTimer = setTimeout/.test(auth),
  'hint tem DEBOUNCE (não metralha a CF a cada tecla)');
ok(/_entrarEarlyHintCache/.test(auth), 'hint tem cache por valor (zero chamada repetida)');

// ── 6. GARANTA SUA CONTA ──────────────────────────────────────────────────────
ok(/window\._askSecureContact = function/.test(auth), 'pedido de celular pós-login existe');
ok(/scoreplace_phone_nudge_/.test(auth), 'cooldown por uid (não vira spam de diálogo)');
ok(/cu\.dupSuspect \|\| cu\.nameConflict\) return/.test(auth),
  'perguntas de duplicata/nome têm PRIORIDADE (nunca empilha diálogos)');
// (no fonte o domínio aparece como regex literal com \. escapado — casar por partes)
ok(/privaterelay/.test(auth) && /e-mail oculto/.test(auth), 'e-mail oculto da Apple tem texto próprio');
ok(/_askSecureContact === 'function'\) window\._askSecureContact\(\); \}, 16000\)/.test(auth),
  'agendado DEPOIS das perguntas de nome (4s) e duplicata (9s)');

console.log(fail === 0 ? '✅ login-um-caminho-so: ' + pass + ' asserções, 0 falha(s)'
                       : '❌ login-um-caminho-so: ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
