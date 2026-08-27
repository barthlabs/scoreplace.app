/* "IR PARA O TORNEIO" VAI PRO GRUPO CLICADO, NÃO PRO SEU (leva 2.1.22)
 *
 * Relato do dono (27/ago/2026): _"clicando no ir para o torneio. continua indo para o
 * grupo do usuário. nem aberto fica os demais jogos da rodada."_
 *
 * ⚠️ A REGRA JÁ EXISTIA e estava certa: `_alvoDeEntrada` (bracket.js) dá prioridade ao
 * grupo pedido (sessionStorage `sp_scrollToGroup`, gravado pelo botão da dashboard) sobre
 * "o SEU grupo". O que faltava era o grupo pedido EXISTIR no documento na hora de procurar.
 *
 * A CAUSA: a otimização da 2.0.88 — acima de `_CHAVE_LOTE_MIN` (6) grupos, os que NÃO são
 * o seu nascem como um marcador `data-chave-lote` e só são montados quando alguém abre a
 * seção. O Confra tem 35 grupos. Então `[data-group-label=…]` do grupo clicado não estava
 * no DOM, a busca falhava, e o código seguia para o item (2) do alvo: o grupo do usuário.
 * Os DOIS sintomas saem daí — o destino errado e a seção fechada, porque quem abre os
 * <details> é justamente o ramo que nunca era alcançado.
 *
 * ⭐ E o aviso já estava escrito no próprio código do lote: _"grupo fora do DOM não tem
 * âncora `data-group-box`, e é por ela que a tela rola até um grupo"_. A nota existia; a
 * consequência para o grupo PEDIDO é que não tinha sido ligada.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── "Ir para o torneio" vai pro grupo clicado ────');

const ROOT = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

// ── as duas pontas do contrato ──────────────────────────────────────────────
ok(/sessionStorage\.setItem\(\\'sp_scrollToGroup\\'/.test(dash),
   'o botão "Ir para o torneio" da dashboard grava o grupo clicado');
ok(/sessionStorage\.getItem\('sp_scrollToGroup'\)/.test(bracket),
   'e o alvo de entrada da chave lê esse pedido');

// ── ⛔ o conserto: montar os lotes adiados antes de desistir ────────────────
const iAlvo = bracket.indexOf('function _alvoDeEntrada()');
const corpoAlvo = bracket.slice(iAlvo, bracket.indexOf('\n}', bracket.indexOf('return _g;', iAlvo)));
ok(/if \(!_g && typeof window\._chaveMontaTudo === 'function'\)/.test(corpoAlvo),
   '⛔ não achou o grupo pedido → monta os lotes adiados e procura DE NOVO (era aqui que desistia)');
const iMonta = corpoAlvo.indexOf('_chaveMontaTudo');
const iSeuGrupo = corpoAlvo.indexOf('O SEU GRUPO');
ok(iMonta > 0 && (iSeuGrupo === -1 || iMonta < iSeuGrupo),
   'e isso acontece ANTES de cair no fallback "o seu grupo"');

// ── ⛔ e a seção que contém o grupo abre ────────────────────────────────────
ok(/while \(_pai\) \{[\s\S]{0,200}_pai\.tagName === 'DETAILS'/.test(corpoAlvo),
   '⛔ abre os <details> ANCESTRAIS — o grupo mora dentro de "Demais jogos da rodada", e ' +
   'alvo dentro de seção fechada não tem altura pra scrollIntoView levar a lugar nenhum');
ok(/_ds\[_di\]\.open = true/.test(corpoAlvo),
   'e os <details> de dentro do grupo também (o "mostrar mais" que o dono pediu na 2.0.x)');

// ── o custo é pago SÓ nesse caso ────────────────────────────────────────────
// Montar tudo é o oposto do que a 2.0.88 fez pra performance (5.482 elementos no Confra).
// Só vale porque alguém CLICOU pedindo um grupo — e nesse instante está esperando chegar lá.
ok((bracket.match(/_chaveMontaTudo\(/g) || []).length >= 1, 'o monta-tudo é chamado');
ok(!/_chaveMontaTudo\(document\);[\s\S]{0,80}\n\s*\/\/ 2\) O SEU GRUPO/.test(corpoAlvo),
   'e não no caminho comum de entrar no torneio (senão a otimização da 2.0.88 morria)');

// ── comportamento: com lote adiado, o alvo ainda é o grupo PEDIDO ───────────
const sb = { console };
sb.window = sb;
const feitos = [];
sb.document = {
  _tem: false,
  querySelector(sel) {
    // simula o DOM real: o grupo pedido SÓ existe depois que os lotes são montados
    if (sel.indexOf('data-group-label') !== -1) {
      return sb.document._tem ? { tagName: 'DIV', parentElement: null, querySelectorAll: () => [] } : null;
    }
    return null;
  },
  getElementById: () => null,
  querySelectorAll: () => []
};
sb.sessionStorage = { getItem: () => 'r1-grupo-q', removeItem() {} };
sb.window._chaveMontaTudo = function () { feitos.push('montou'); sb.document._tem = true; };
vm.createContext(sb);
const ini = bracket.indexOf('function _alvoDeEntrada()');
const fim = bracket.indexOf('\n}', bracket.indexOf('return _g;', ini)) + 2;
// só o começo da função (item 0 + item 1) — o resto depende de muito DOM
let fonte = bracket.slice(ini, fim);
fonte = fonte.slice(0, fonte.indexOf('  // 2) O SEU GRUPO')) + '\n  return null;\n}';
vm.runInContext(fonte + '; window._alvo = _alvoDeEntrada;', sb, { filename: 'alvo' });
const alvo = sb.window._alvo();
ok(feitos.length === 1, 'com o grupo fora do DOM, os lotes são montados uma vez — feitos: ' + feitos.length);
ok(!!alvo, '⛔ e o alvo passa a ser o GRUPO PEDIDO (antes voltava null e caía no grupo do usuário)');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
