'use strict';

/* ⛔⛔ O BOTÃO DE ENTRAR SEM SENHA NÃO PODE PROMETER O QUE O APARELHO NÃO CUMPRE.
 *
 * Por que a leva existe: medido em 25/set/2026, 4 dos 9 pares de conta duplicada são Apple+Google —
 * gente que voltou, não achou a própria conta e criou outra. A chave descobrível tira a pergunta
 * "qual conta eu usei": não se digita nome nem e-mail.
 *
 * ⛔ E O QUE ESTE ARQUIVO TRAVA É O CONTRÁRIO DA FUNCIONALIDADE — é onde ela se cala:
 *   · no app NATIVO o botão não aparece. A WebView roda em origem própria e passkey é PRESO ao
 *     domínio por desenho; oferecer ali é prometer no botão o que o app não pode cumprir. É a mesma
 *     parede que derrubou o seletor do Google aqui;
 *   · CANCELAR não é erro. Quem fecha o diálogo do rosto recebe `NotAllowedError`; mostrar "falhou"
 *     aí ensina a pessoa a desconfiar do caminho que a gente quer que ela use;
 *   · "já cadastrado" é SUCESSO disfarçado de erro (`InvalidStateError`). Tratar como falha faria a
 *     pessoa tentar para sempre;
 *   · e só se diz "vale nos seus outros aparelhos" quando o próprio aparelho informou que a chave
 *     SINCRONIZA.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/views/passkey.js'), 'utf8');
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o passkey não promete o que não cumpre ────\n');

// ── ① no nativo, não oferece ─────────────────────────────────────────────────
ok(/isNativePlatform/.test(semComentarios),
  '① ⛔ a disponibilidade consulta se está no app NATIVO — lá a origem não serve e o gesto falharia depois do clique');
ok(/isSecureContext/.test(semComentarios), '① e exige contexto seguro');
ok(/window\.PublicKeyCredential/.test(semComentarios), '① e a existência da API');

// ── ② cancelar não é erro ────────────────────────────────────────────────────
const nomes = (semComentarios.match(/NotAllowedError/g) || []).length;
ok(nomes >= 2, '② ⛔ cancelar é tratado como cancelamento nas DUAS portas (entrar e cadastrar) — achei ' + nomes);
ok(/AbortError/.test(semComentarios), '② e o aborto do navegador também');
ok(/InvalidStateError/.test(semComentarios),
  '② ⛔ "já cadastrado" é sucesso disfarçado de erro, e está tratado — senão a pessoa tentaria para sempre');

// ── ③ o que se promete na tela depende do que o aparelho disse ───────────────
ok(/fim\.sincroniza[\s\S]{0,200}outros aparelhos/.test(src),
  '③ ⭐ só promete "nos seus outros aparelhos" quando o aparelho informou que a chave SINCRONIZA');
ok(/neste aparelho/.test(src), '③ e diz "neste aparelho" quando ela não sincroniza');

// ── ④ o gesto é explícito ────────────────────────────────────────────────────
ok(/mediation: 'required'/.test(semComentarios),
  '④ a entrada exige gesto explícito — resolver em silêncio deixaria a pessoa sem entender o que houve');
ok(/userVerification/.test(semComentarios),
  '④ e exige verificação do usuário: sem isso o passkey viraria "tocar no botão e entrar"');

// ── ⑤ nada de chave privada, nunca ───────────────────────────────────────────
ok(!/privateKey|chavePrivada/.test(src),
  '⑤ ⛔ não há menção a chave privada: ela nunca sai do aparelho da pessoa');

// ── ⑥ a falha tem saída, e a saída é dita ────────────────────────────────────
ok(/Google, Apple ou e-mail/.test(src),
  '⑥ ⭐ quando falha, a tela diz o caminho que ainda existe — passkey ACRESCENTA entrada, não remove as outras');

// ── ⑦ O PADRÃO: A CHAVE APARECE NO CAMPO, E NÃO HÁ BOTÃO ─────────────────────
/* ⛔⛔ CORREÇÃO DE UM ERRO MEU, e é a asserção mais importante deste arquivo.
 * Eu havia construído um botão "Entrar sem senha", um atalho "primeira vez aqui?" e um bloco que
 * aparecia depois da falha — quatro rodadas inventando texto. A recomendação publicada para passkey
 * diz o contrário: NADA de botão dedicado. A chave aparece no PRÓPRIO CAMPO de identificação, junto
 * das senhas guardadas, pelo preenchimento automático — o campo leva `webauthn` no `autocomplete`.
 *
 * ⛔ E ISSO CONSERTA DOIS DEFEITOS QUE O BOTÃO CRIAVA, os dois apontados pelo dono:
 *  ① quem NUNCA teve conta tocava num botão que não podia funcionar e caía num beco;
 *  ② o bloco revelado depois da falha CONVIDAVA a criar conta — e quem já tinha conta e só cancelou
 *    o gesto criaria a segunda, que é exatamente o defeito que a leva ataca.
 * Com o campo, quem não tem chave não vê nada e não recebe erro: não há beco e não há convite. */
const auth = fs.readFileSync(path.join(ROOT, 'js/views/auth.js'), 'utf8');
ok(/autocomplete="username webauthn"/.test(auth),
  '⑦ ⭐⭐ o CAMPO de identificação leva `webauthn` — é onde o navegador pendura a oferta da chave');
ok(/_passkeyOferecerNoCampo\(\)/.test(auth),
  '⑦ ⭐ e a oferta é disparada quando a tela de entrada abre');
ok(!/login-passkey-btn|login-ver-outras|login-outras-formas/.test(auth),
  '⑦ ⛔⛔ e NÃO existe botão de passkey na tela de entrada — o padrão é o campo, e o botão criava beco e convite indevido');

/* ⛔⛔ E ESTA ASSERÇÃO NASCEU DE UM FALSO VERDE MEU, no mesmo dia.
 * A asserção acima dizia "nem atalho" e continuou VERDE depois de eu acrescentar um atalho: ela casa
 * TRÊS IDS pelo nome, e o meu tinha nome novo. Asserção que nomeia id não vigia o fato — é a terceira
 * vez que caio nisso. ⇒ o que se trava agora é a CONDIÇÃO, não o nome.
 *
 * O atalho é legítimo e faz parte do padrão publicado (preenchimento no campo + saída para quem não
 * tem mediação condicional). O que não é legítimo é aparecer SEM PERGUNTAR: aí ele volta a ser o
 * botão que cria beco para quem nunca teve conta.
 * ⚠️ Quem acrescentar outro caminho de mostrar o atalho tem de passar por esta porta — senão o fato
 * volta a divergir do texto. */
const _blocoAtalho = (semComentarios.match(/_passkeyMostrarAtalhoSeNecessario\s*=\s*async function[\s\S]*?\n  \};/) || [''])[0];
ok(_blocoAtalho.length > 100, '⑦ o bloco do atalho foi encontrado pelo próprio identificador (não por tamanho fixo)');
ok(/_passkeyTemNesteAparelho\(\)/.test(_blocoAtalho),
  '⑦ ⛔⛔ o atalho PERGUNTA ao navegador antes de existir — não é chutado');
ok(/===\s*true\)\s*return/.test(_blocoAtalho),
  '⑦ ⛔ e desiste quando o campo JÁ oferece a chave: dois convites para a mesma coisa é ruído');
ok(/_passkeyDisponivel\(\)\)\s*return/.test(_blocoAtalho),
  '⑦ ⛔ e não aparece onde passkey não funciona — no nativo, nada');
ok(/mediation: 'conditional'/.test(semComentarios),
  '⑦ a oferta usa mediação condicional — silenciosa para quem não tem chave');

// ── ⑧ A CRIAÇÃO DA CHAVE VEM DEPOIS DE ENTRAR, NUNCA ANTES ───────────────────
/* A chave só nasce contra uma conta que já existe: chave de casa que ainda não foi construída não
 * existe. Por isso o lugar de oferecer é o perfil, depois de a pessoa estar dentro. */
ok(/profile-passkey-btn/.test(auth), '⑧ o cadastro do aparelho vive no perfil, com a pessoa já dentro');
ok(/_passkeyDisponivel\(\)[\s\S]{0,900}profile-passkey-btn/.test(auth),
  '⑧ ⛔ e só aparece onde funciona — no app nativo a origem da WebView não serve para passkey');

// ── ⑨ O RÓTULO DO PROVEDOR NÃO MENTE ─────────────────────────────────────────
/* ⛔ O botão do provedor ENTRA e CRIA com o mesmo toque, e a pessoa não descobre qual aconteceu —
 * é assim que nasceram 4 dos 9 pares medidos. "Continuar" é o que é verdade para todas. */
const pt = fs.readFileSync(path.join(ROOT, 'js/i18n-pt.js'), 'utf8');
ok(/'auth\.signInGoogle': 'Continuar com Google'/.test(pt),
  '⑨ ⭐ o rótulo do Google diz "Continuar" — "Entrar" mentiria para quem está criando');
ok(/Continuar com a Apple/.test(auth), '⑨ idem o da Apple');
const en = fs.readFileSync(path.join(ROOT, 'js/i18n-en.js'), 'utf8');
ok(/'auth\.signInGoogle': 'Continue with Google'/.test(en), '⑨ e em inglês também');

// ── ⑩ e está carregado na página ─────────────────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(/js\/views\/passkey\.js\?v=/.test(html), '⑩ o módulo é carregado pela página, com marcador de versão');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
