/* TORNEIOS ENCERRADOS: LISTA, E A DOBRA CANÔNICA — NÃO A LINHA QUE NINGUÉM VÊ
 * node tests/encerrados-em-lista-com-dobra.test.js
 *
 * ORDEM DO DONO (28/ago/2026): _"a seção de torneios encerrados poderia listar em modo
 * lista e usar o ver mais/ver menos, para não ser essa linha que poucos notam"_.
 *
 * Ela era um `<summary>`: texto apagado, sem affordance além do triangulinho do
 * navegador. A dobra canônica (`window._spDobra`) é a mesma pílula "ver mais / ver menos"
 * que ele já aprovou nas outras seções — _"padronizar isso que ficou legal"_.
 *
 * ⛔ E O QUE NÃO PODE SE PERDER NA TROCA: o `<details>` tinha um `ontoggle` que montava o
 * conteúdo só no primeiro ABRIR. Foi ele que tirou **437 KB de HTML construído e nunca
 * visto** do DOM (v1.8.94 — o relato "fica lenta, tudo demora a responder" no nativo).
 * Trocar o controle sem levar isso junto seria desfazer aquela medição em silêncio: a
 * tela ficaria igual e o app voltaria a ser lento. Por isso a dobra ganhou o gancho de
 * hidratação, e é isso que a seção ③ tranca.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const dobra = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dobra-core.js'), 'utf8');

// ── recorta a seção REAL de encerrados ───────────────────────────────────────────
const i = dash.indexOf('const finishedList = _encerradosExtraidos;');
ok(i > 0, 'achei a seção de encerrados');
const sec = dash.slice(i, dash.indexOf('// ── v1.8.93', i));

console.log('\n① O controle é a dobra canônica, não um <summary>');
ok(/window\._spDobra\('dash-encerrados'/.test(sec),
   '⛔ usa window._spDobra — a mesma pílula "ver mais/ver menos" das outras seções');
/* ⚠️ procura o HTML EMITIDO (a string entre aspas), não a palavra solta: as notas
 * acima explicam o que foi trocado e citam `<details>`/`<summary>` no texto. Regex que
 * lê comentário como código reprova quem já está certo. */
ok(!/'<summary/.test(sec) && !/"<summary/.test(sec), '⛔ o <summary> apagado saiu do HTML');
ok(!/'<details/.test(sec) && !/"<details/.test(sec), '   (e o <details> junto)');
ok(!/_dashDetailsAttr\(/.test(sec), '   e o atributo do <details> não é mais montado aqui');
ok(/_spDobraAberta\('dash-encerrados'/.test(sec),
   'e o estado lembrado vem da memória DA DOBRA, não da do <details> — duas memórias pra ' +
   'mesma seção brigariam');

console.log('\n② O conteúdo é LISTA, não card');
ok(/_buildCompactList\(myFinished\)/.test(sec) && /_buildCompactList\(otherFinished\)/.test(sec),
   '⛔ os dois grupos (seus / dos outros) saem em linha compacta');
ok(!/_renderTGroup\(myFinished\)/.test(sec) && !/_renderTGroup\(otherFinished\)/.test(sec),
   '⛔ e não pelo _renderTGroup, que seguiria o toggle global e voltaria a card');

console.log('\n③ ⛔ O CORPO CONTINUA PREGUIÇOSO (os 437 KB da v1.8.94)');
ok(/_dashLazyBody\('enc'/.test(sec),
   'a seção fechada devolve um slot VAZIO — não monta o que ninguém vai ver');
ok(/window\._spDobraHidratar/.test(dobra),
   '⛔ e a dobra hidrata esse slot ao ABRIR — sem isto, trocar o <details> desfaria a medição');
const iT = dobra.indexOf('window._spDobraToggle = function');
const toggle = dobra.slice(iT, dobra.indexOf('\n};', iT));
ok(/if \(abrindo &&/.test(toggle),
   '⛔ e só ao ABRIR: hidratar ao fechar seria montar justamente o que ninguém vai ver');
ok(/typeof window\._spDobraHidratar === 'function'/.test(toggle),
   'o gancho é OPCIONAL — dobra sem corpo preguiçoso não paga nada por ele');
ok(/window\._spDobraHidratar = function/.test(dash),
   'e quem sabe hidratar é a dashboard, que é dona do _dashLazyGroups');

console.log('\n④ A hidratação roda UMA vez por slot');
const iH = dash.indexOf('window._spDobraHidratar = function');
const hid = dash.slice(iH, dash.indexOf('\n};', iH));
ok(/data-filled/.test(hid), '⛔ marca o slot como preenchido — reabrir não remonta');
ok(/_fitNames/.test(hid), 'e reajusta os nomes no que acabou de nascer');

console.log(falhas === 0
  ? '\n✅ encerrado vira lista atrás de uma dobra que se vê — e continua não custando fechado\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
