'use strict';
/* A CLASSIFICAÇÃO DA LINHA NÃO SAI ENQUANTO A REPESCAGEM DELA ESTIVER INDEFINIDA.
 * node tests/classificacao-nao-sai-com-repescagem-indefinida.test.js
 *
 * ⛔⛔ Relato do dono, 26/set/2026, linha Ouro da Confra: _"a classificacao definida da ouro esta
 * errada tambem. considerando que mudaram quem ficou de fora esta errada. oculta até redesenharmos a
 * repescagem"_ — e logo depois: _"como ainda estou confirmando o resultado do jogo 120 pode haver
 * outra mudança"_.
 *
 * ⛔ A REGRA NÃO É DA CONFRA: enquanto houver vaga de repescagem indefinida na linha, a classificação
 * dela é um chute. Quem entra pela repescagem ainda vai jogar e mudar tudo, e quem ficou de fora já
 * está classificado abaixo de quem entrou. Uma tabela que se apresenta como "parcial" — ou pior,
 * "final" — nesse estado afirma o que não se sabe, e alguém age em cima dela.
 *
 * ⚠️ E A AUSÊNCIA TEM DE SER EXPLICADA, nunca muda: some a tabela, entra a frase dizendo o que falta.
 * [[feedback_tela_parcial_se_diz_pronta]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── classificação não sai com repescagem indefinida ────\n');

/* ── ① A PORTA EXISTE E É CHAMADA ANTES DE MONTAR A TABELA ─────────────────── */
const bloco = (semComentarios.match(/function _tierClassifHtml\([\s\S]*?\n  \}/) || [''])[0];
ok(bloco.length > 100, '① o bloco da classificação por linha foi achado pelo próprio identificador');
ok(/_vagaDeRepescagemIndefinida\(lm\)/.test(bloco),
  '① ⛔⛔ a classificação da linha pergunta antes se a repescagem está definida');
const iGuarda = bloco.indexOf('_vagaDeRepescagemIndefinida');
const iMapa = bloco.indexOf('_lineClassifMap');
ok(iGuarda > 0 && (iMapa < 0 || iGuarda < iMapa),
  '① ⛔ e pergunta ANTES de montar o mapa — não monta a tabela para depois jogar fora');

/* ── ② A REGRA, EXERCIDA ───────────────────────────────────────────────────── */
const fn = new Function('return ' + (semComentarios.match(/function _vagaDeRepescagemIndefinida\([\s\S]*?\n  \}/) || ['function(){return false;}'])[0])();
ok(typeof fn === 'function', '② a regra foi extraída e é executável');
if (typeof fn === 'function') {
  ok(fn([{ id: 'a', p1: 'X', p2: 'Y' }]) === false,
    '② linha sem vaga de repescagem: classificação sai normalmente');
  ok(fn([{ id: 'a', p1: 'X', p2: 'TBD', p2FromRepechage: true }]) === true,
    '② ⛔ vaga de repescagem VAZIA segura a classificação');
  ok(fn([{ id: 'a', p1: 'X', p2: 'A definir', p2FromRepechage: true }]) === true,
    '② e "A definir" conta como vazia');
  ok(fn([{ id: 'a', p1: 'X', p2: 'TBD', p2AguardaMelhor: true }]) === true,
    '② ⛔ e a marca de "espera o melhor derrotado" também segura');
  ok(fn([{ id: 'a', p1: 'W', p2: 'Z', p2FromRepechage: true }]) === false,
    '② ⭐ vaga de repescagem JÁ PREENCHIDA não segura — a linha voltou a saber quem está nela');
  ok(fn([]) === false && fn(null) === false,
    '② linha sem jogos não trava nada');
  /* ⛔ uma vaga pendente EM QUALQUER jogo da linha basta: a classificação é da linha inteira */
  ok(fn([{ id: 'a', p1: 'X', p2: 'Y' }, { id: 'b', p1: 'TBD', p1FromRepechage: true }]) === true,
    '② ⛔⛔ uma vaga pendente em UM jogo já segura a classificação da linha toda');
}

/* ── ③ A AUSÊNCIA É EXPLICADA, NÃO MUDA ────────────────────────────────────── */
ok(/Classificação indisponível/.test(src),
  '③ ⛔ no lugar da tabela entra um aviso — ausência silenciosa faria concluir que a linha não tem classificação');
ok(/repescagem desta chave ainda não está definida/i.test(src),
  '③ e o aviso diz O QUE falta, não só que falta');

/* ── ④ NÃO É CASO ESPECIAL DA CONFRA ───────────────────────────────────────── */
ok(!/confra/i.test(bloco) && !/ouro/i.test(bloco),
  '④ ⛔ a regra não nomeia torneio nem linha: vale para Ouro, Prata e chave única');

/* ══════════════════════════════════════════════════════════════════════════════
 * ⑤ A CLASSIFICAÇÃO FINAL É GRAVADA — ela é RESULTADO, não desenho de tela.
 *
 * Ordem do dono: _"deveria ser gravado. é classificacao final de torneio. nao meramente escrito ou
 * desenhado na hora."_
 * ⚠️ E isto NÃO contradiz ter apagado a `standings` do documento em ago/2026 — é o oposto: o que se
 * apagou foi a PARCIAL, cópia derivada que envelhece e passa a mentir (120 linhas zeradas afirmando
 * "0 jogo disputado" num torneio com 115 jogos). O que se grava agora é a FINAL, que é fato e não
 * pode mudar porque a régua de desempate melhorou depois.
 * ════════════════════════════════════════════════════════════════════════════ */
const bl = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const blCodigo = bl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/function _congelaLinhasEncerradas\(/.test(blCodigo), '⑤ a porta que congela a linha existe');
ok(/classifFinalDaLinha\[k\] = ordem\.map/.test(blCodigo), '⑤ e ela GRAVA a ordem final da linha');
ok(/if \(Array\.isArray\(t\.classifFinalDaLinha\[k\]\)\) return;/.test(blCodigo),
  '⑤ ⛔ idempotente: nunca regrava por cima de um resultado já congelado');
ok(/if \(pendente\) return;/.test(blCodigo),
  '⑤ ⛔⛔ e NÃO congela com vaga de repescagem indefinida — congelar um chute é pior que não congelar');
ok(/reais\.every\(function \(m\) \{ return !!m\.winner; \}\)/.test(blCodigo),
  '⑤ nem com jogo em aberto na linha');
const ui = fs.readFileSync(path.join(ROOT, 'js/views/bracket-ui.js'), 'utf8');
ok(/_congelaLinhasEncerradas\(t\)/.test(ui),
  '⑤ ⭐ e o congelamento acontece na PORTA ÚNICA por onde todo placar lançado passa');
ok(/t\.classifFinalDaLinha && t\.classifFinalDaLinha\[bracketKey\]/.test(semComentarios),
  '⑤ ⛔ a tela LÊ o retrato gravado antes de recalcular — senão a ordem publicada mudaria sozinha');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
