'use strict';
/* ⛔ O E-MAIL DE ALGUÉM NÃO É O NOME DELE — nem no aviso que o organizador recebe.
 *
 * `_enrollDisplayName` resolvia o nome de quem se inscreve assim:
 *     displayName → **E-MAIL** → telefone → ''
 * e esse nome entra no aviso que vai para a caixa do organizador — que vira e-mail e vira
 * digest. Ou seja, o endereço da pessoa viajava dentro de um texto, exatamente o que saiu do
 * espelho público, do cache da chave e da comparação de troféus no mesmo dia.
 *
 * ⭐ MEDIDO ANTES DE TIRAR, nos 279 perfis de produção: **275 têm displayName**, 3 não têm
 * nome mas têm telefone, e **1** só tem e-mail. O preço de tirar é UMA pessoa aparecer como
 * "Um participante" — e o organizador identifica quem é na lista de inscritos, que é onde
 * esse dado deve estar. Publicar o e-mail de 279 para nomear 1 é a troca errada.
 *
 * ⚠️ O TELEFONE FICA: é o que o dono já aprovou como identificação de quem entra sem nome, e
 * sai formatado, não cru. Tirar os dois deixaria o aviso mudo para 4 pessoas em vez de 1.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const SRC = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment.js'), 'utf8');
const i = SRC.indexOf('window._enrollDisplayName = function');
const W = {};
vm.runInNewContext(SRC.slice(i, SRC.indexOf('\n};', i) + 3), { window: W, String });
const nome = W._enrollDisplayName;

console.log('\n──── a inscrição não usa e-mail como nome ────\n');

// ── ① a cadeia, rodando de verdade ─────────────────────────────────────────
must(nome({ displayName: 'Fulana', email: 'f@x.invalid' }) === 'Fulana',
  '① quem tem nome aparece pelo nome');
must(nome({ email: 'segredo@exemplo.invalid' }) === '',
  '① ⭐⭐ quem só tem e-mail NÃO vira o próprio endereço no aviso');
must(/\+55 \(11\) 99999-9999/.test(nome({ phone: '+5511999999999' })),
  '① quem não tem nome mas tem telefone aparece pelo telefone, formatado');
must(nome({ phone: '+5511999999999', email: 'x@y.invalid' }) !== 'x@y.invalid',
  '① ⛔ e o e-mail não vence o telefone');
must(nome(null) === '' && nome({}) === '',
  '① sem nada, devolve vazio — quem chama decide o rótulo');

// ── ② o e-mail não aparece em lugar nenhum da função ───────────────────────
const corpo = SRC.slice(i, SRC.indexOf('\n};', i));
const codigo = corpo.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
must(!/user\.email/.test(codigo),
  '② ⛔ `user.email` não é lido pela função — não é queda, é ausência');

// ── ③ quem chama trata o vazio com um rótulo, não com um endereço ─────────
must(/_t\('enroll\.anonParticipant'\)/.test(SRC),
  '③ o vazio vira um rótulo traduzido ("Um participante"), não um dado pessoal');
const i18n = fs.readFileSync(path.join(raiz, 'js/i18n-pt.js'), 'utf8');
must(/'enroll\.anonParticipant': 'Um participante'/.test(i18n),
  '③ e o rótulo existe na tradução');

// ── ④ CONTROLE: a cadeia antiga devolveria o e-mail ───────────────────────
const antiga = (u) => (u && u.displayName) ? u.displayName : ((u && u.email) ? u.email : '');
must(antiga({ email: 'segredo@exemplo.invalid' }) === 'segredo@exemplo.invalid',
  '④ ⭐ CONTROLE: a cadeia ANTIGA devolvia o endereço — o corte é real');
must(nome({ email: 'segredo@exemplo.invalid' }) !== antiga({ email: 'segredo@exemplo.invalid' }),
  '④ e a de hoje não');

console.log('\n✅ ' + ok + ' verificações');
