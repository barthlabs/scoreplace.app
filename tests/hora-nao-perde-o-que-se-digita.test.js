'use strict';
/* ⛔ REPINTAR NO MEIO DA DIGITAÇÃO APAGA O QUE A PESSOA DIGITOU.
 * Relato do dono (12/set/2026): _"você clica na hora e quer escrever 23 e ele fica 02 apenas"_.
 * O `change` de um `<input type=time>` dispara ASSIM QUE o valor fica completo — não no blur.
 * Com "23:00" no campo, o `2` da hora já forma "02:00" → `change` → `_rerender()` → o input é
 * destruído e recriado → o `3` cai num elemento que não existe mais.
 * Este teste roda o CAMINHO REAL (o helper recortado do arquivo) num DOM de mentira que
 * responde `document.activeElement`, e CONTA os repintes. [[feedback_montagem_preguicosa_mata_o_clique]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const F2 = fs.readFileSync(path.join(__dirname, '..', 'js/views/format2-ui.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const ini = F2.indexOf('  function _rerenderSemAtrapalhar(el) {');
const fim = F2.indexOf('\n  }\n', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do helper');

const campo = {
  ouvintes: {},
  addEventListener(ev, fn) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(fn); },
  blur() { (this.ouvintes.blur || []).forEach((f) => f()); this.ouvintes.blur = []; }
};
const ctx = { pintou: 0, normalizou: 0, document: { activeElement: campo } };
vm.runInNewContext(
  'function _norm(){ normalizou++; }\nfunction _rerender(){ pintou++; }\n' + F2.slice(ini, fim + 4) +
  '\nglobalThis._chamar = _rerenderSemAtrapalhar;', ctx);
const chamar = ctx._chamar;

// ── digitando: cada dígito dispara um `change` com o campo ainda em foco ────
chamar(campo);   // "0"
chamar(campo);   // "02"
chamar(campo);   // "23"
must(ctx.pintou === 0, '⛔ com o campo em FOCO, nenhum repinte — é o repinte que comia o 2º dígito (0 pintadas)');
must((campo.ouvintes.blur || []).length === 1,
  'e UM único ouvinte de saída fica armado, não um por tecla (' + (campo.ouvintes.blur || []).length + ')');

// ── ao sair do campo, a tela se acerta ─────────────────────────────────────
campo.blur();
must(ctx.pintou === 1, 'ao SAIR do campo, a tela repinta — uma vez');
must(ctx.normalizou === 1, 'e normaliza o modelo junto');

// ── mudança que NÃO vem do campo em foco repinta na hora, como antes ───────
ctx.document.activeElement = null;
chamar(campo);
must(ctx.pintou === 2, 'mudança fora do campo (arraste, clique) segue repintando na hora');
chamar(null);
must(ctx.pintou === 3, 'e chamada sem elemento nenhum também');

// ── a fiação: os três editores de data/hora passam o elemento ──────────────
['_f2ElimRoundEndTime(\' + idx + \',this.value,this)', '_f2ElimEndTime(this.value,this)', '_f2ElimEndDate(this.value,this)']
  .forEach((t) => must(F2.indexOf(t) > 0, '⛔ o HTML manda o próprio campo: ' + t.slice(0, 28) + '…'));
must(!/_f2ElimEndTime = function \(v\) \{/.test(F2) && !/_f2ElimRoundEndTime = function \(idx, value\) \{/.test(F2),
  '⛔ e nenhum dos setters voltou a ignorar o elemento');

console.log('✅ ' + ok + ' asserções — digitar a hora não é interrompido pelo repinte');
