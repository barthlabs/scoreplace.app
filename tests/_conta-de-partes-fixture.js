/* FIXTURE (não é suíte) — carrega a CONTA DE PARTES do js/store.js num contexto de teste.
 *
 * ⚠️ POR QUE ISTO EXISTE (2.1.66). A decisão "que partes deste torneio faltam?" morava
 * DENTRO de `_enxertaJogos`, e por isso só o caminho do OUVINTE a executava —
 * `_loadFromCache` punha o cache direto em `store.tournaments` e ninguém pedia o resto.
 * Foi o último pedaço do incidente de 31/ago (tela com 2 inscritos de 152 e 1 jogo de 115).
 * A conta virou `window._marcaPartesQueFaltam`, chamada pelos DOIS caminhos.
 *
 * ⛔ CONSEQUÊNCIA PRA QUEM TESTA, e é a razão deste arquivo: quem recorta `_enxertaJogos`
 * do fonte agora precisa recortar TAMBÉM a função da conta, senão o teste morre em
 * "window._marcaPartesQueFaltam is not a function" e parece defeito do código. Seis suítes
 * recortam essa função; repetir o recorte em seis lugares é o mesmo tipo de cópia que este
 * projeto já pagou caro ([[feedback_unify_dual_entry_points]]).
 *
 * Uso:
 *   const F = require('./_conta-de-partes-fixture.js');
 *   const { enxerta, marca, ctx } = F.carregar();          // contexto próprio
 *   F.injetar(ctx, store);                                  // ou num contexto que já existe
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CAMINHO_STORE = path.join(__dirname, '..', 'js', 'store.js');
const MARCA_INI = 'window._marcaPartesQueFaltam = function (t) {';
const MARCA_FIM = 'window._userProfileCache = window._userProfileCache || {};';

function fonte() { return fs.readFileSync(CAMINHO_STORE, 'utf8'); }

/** O corpo da conta, recortado do fonte REAL (nunca uma réplica). */
function corpoDaConta(src) {
  const s = src || fonte();
  const a = s.indexOf(MARCA_INI);
  const b = s.indexOf(MARCA_FIM);
  if (a === -1 || b <= a) {
    throw new Error('[fixture] não achei `window._marcaPartesQueFaltam` em js/store.js — se ela mudou de nome, ajuste aqui, num lugar só');
  }
  return s.slice(a, b);
}

/** Injeta a conta num contexto vm JÁ criado (que precisa ter `window`). */
function injetar(ctx, src) {
  if (!ctx.window) ctx.window = {};
  vm.runInContext(corpoDaConta(src), ctx);
  return ctx;
}

/** O TEXTO da porta de hidratação, como EXPRESSÃO de função pronta pra avaliar.
 * ⭐ Existe pra que nenhum teste recorte a porta à mão: eram QUATRO recortes soltos, cada
 * um com a sua âncora, e todos quebraram juntos quando a função saiu da closure na 2.1.89 —
 * quatro falhas para UMA mudança de lugar. Agora a âncora mora aqui, num lugar só. */
function recortarPorta(src) {
  const ABRE = 'window._preservaPartesMontadas = function (novo, velho) {';
  const i = src.indexOf(ABRE);
  const j = src.indexOf('\n/* ══ R1.1 · "NÃO SEI AINDA"', i);
  if (i === -1 || j <= i) throw new Error('[fixture] não achei `_preservaPartesMontadas` em js/store.js');
  return src.slice(i, j).replace(ABRE, '(function (novo, velho) {').trim().replace(/\};\s*$/, '})');
}

/** Contexto novo com a conta e a porta de hidratação reais dentro. */
function carregar() {
  const src = fonte();
  const ctx = { window: {}, console: console, Array: Array, Object: Object, JSON: JSON, String: String };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  injetar(ctx, src);
  /* ⚠️ 2.1.89 — A REDE SAIU DA CLOSURE E VIROU PORTA GLOBAL. Ela vivia dentro de
   * `startRealtimeListener` como `function _enxertaJogos(...)`, e por isso SÓ o ouvinte de
   * `tournaments` a executava; o de `sandboxes` entregava o documento magro cru. Agora é
   * `window._preservaPartesMontadas`, chamada pelos DOIS — e `recortarPorta` é quem sabe
   * disso. O nome exportado (`enxerta`) fica, pra não mexer em quem já o usa. */
  const enxerta = vm.runInContext(recortarPorta(src), ctx);
  return { enxerta: enxerta, marca: ctx.window._marcaPartesQueFaltam, ctx: ctx, src: src };
}

module.exports = { carregar, injetar, corpoDaConta, fonte, recortarPorta, MARCA_INI, MARCA_FIM, CAMINHO_STORE };
