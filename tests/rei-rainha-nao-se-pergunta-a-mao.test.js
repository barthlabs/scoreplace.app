/* O PORTÃO: "é rei/rainha?" não se pergunta comparando texto à mão.
 * node tests/rei-rainha-nao-se-pergunta-a-mao.test.js
 *
 * ⛔ POR QUE ESTE PORTÃO EXISTE. A pergunta é feita hoje por DOIS campos legados
 * (`drawMode` e `ligaRoundFormat`) espalhados pelo programa, e nenhum deles sabe em que FASE o
 * torneio está. Medido em 25/set/2026 nos 78 torneios reais: no Confra 2026 o topo diz
 * rei/rainha porque descrevia a fase 0, e o torneio está na fase 1, que sorteia duplas.
 * Enquanto a migração dos leitores não acontece, o portão impede que NASÇA comparação nova —
 * senão cada leva conserta dez e aparecem onze.
 *
 * ⚠️ PORTÃO POR ÁRVORE, NÃO POR TEXTO: na consolidação do papel do organizador um ponto
 * escapou da busca textual porque chamava a coisa por apelido. Aqui a comparação é reconhecida
 * na sintaxe, e a contagem é FIXADA — abaixar o número é o conserto, subir reprova.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── "é rei/rainha?" não se pergunta à mão ────\n');

/* A CASA ÚNICA das duas portas. Só ela pode comparar os campos legados: é o trabalho dela. */
const CASA = 'js/views/tournaments-utils.js';
/* ⛔ EXCEÇÕES, uma a uma e com motivo — lista curta de propósito, porque exceção sem motivo é
 * portão desligado com passos extras.
 *  · o compilador de formato ESCREVE esses campos (não pergunta): é a origem deles;
 *  · o motor do sorteio no servidor consulta a CONFIGURAÇÃO DA FASE, que é a resposta certa,
 *    e será migrado para a porta na leva dos leitores. */
const EXCECOES = {
  'js/views/format2.js': 'o compilador ESCREVE o campo — é a origem, não um leitor',
  'js/views/format2-ui.js': 'a tela de configuração ESCREVE o campo',
  'functions-autodraw/draw-core.js': 'lê a config da FASE (resposta certa); migra na leva dos leitores',
};
const CAMPOS = ['drawMode', 'ligaRoundFormat'];

function comparacoes(fonte) {
  let raiz;
  try {
    raiz = acorn.parse(fonte, { ecmaVersion: 'latest', sourceType: 'script',
      allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true });
  } catch (e) { return [{ motivo: 'não parseou: ' + e.message }]; }
  const achados = [];
  const ehCampo = (n) => n && n.type === 'MemberExpression' && !n.computed
    && n.property && CAMPOS.indexOf(n.property.name) !== -1;
  const ehLiteralRR = (n) => n && n.type === 'Literal' && n.value === 'rei_rainha';
  const anda = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(anda); return; }
    if (!n.type) return;
    if (n.type === 'BinaryExpression' && ['===', '!==', '==', '!='].indexOf(n.operator) !== -1) {
      if ((ehCampo(n.left) && ehLiteralRR(n.right)) || (ehCampo(n.right) && ehLiteralRR(n.left))) {
        achados.push({ motivo: 'comparação crua com "rei_rainha"' });
      }
    }
    Object.keys(n).forEach((k) => { if (k !== 'type' && k !== 'start' && k !== 'end' && k !== 'loc') anda(n[k]); });
  };
  anda(raiz);
  return achados;
}

function varrer(dir) {
  const out = {};
  (function rec(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') rec(p); return; }
      if (!/\.js$/.test(e.name) || /\.test\.js$/.test(e.name) || /^test-/.test(e.name)) return;
      const rel = path.relative(ROOT, p);
      const achados = comparacoes(fs.readFileSync(p, 'utf8'));
      if (achados.length) out[rel] = achados.length;
    });
  })(dir);
  return out;
}

const achado = Object.assign({}, varrer(path.join(ROOT, 'js')), varrer(path.join(ROOT, 'functions-autodraw')), varrer(path.join(ROOT, 'functions')));
const fora = Object.keys(achado).filter((f) => f !== CASA && !EXCECOES[f]);

// ── ① a casa única compara, e é o trabalho dela ──────────────────────────────
ok((achado[CASA] || 0) > 0, '① a casa única compara os campos legados — é a função dela');

// ── ② ninguém mais compara, fora das exceções nomeadas ───────────────────────
/* ⛔ TETO FIXADO NO MEDIDO, não no que eu achava. Eu escrevi 12 de cabeça e o portão contou 14 —
 * a diferença é o motivo de o teto sair de medição e não de estimativa.
 * Medição de 25/set/2026, os 14 que faltam migrar, por casa:
 *   bracket-logic 5 · create-tournament 2 · tournaments-draw 2 · bracket 1 · dashboard 1
 *   phases-engine 1 · tournaments-enrollment-report 1 · autodraw/index 1
 * Cada leva de migração ABAIXA este número; subir significa comparação nova nascendo. */
const TETO = 14;
const total = fora.reduce((s, f) => s + achado[f], 0);
ok(total <= TETO, '② comparações cruas fora da casa: ' + total + ' (teto ' + TETO + ') — '
  + (fora.length ? fora.map((f) => f + ':' + achado[f]).join(', ') : 'nenhuma'));

// ── ③ teste de FALSIFICAÇÃO: o portão sabe reprovar? ─────────────────────────
/* Sem isto o portão pode estar verde por não enxergar nada — foi assim que uma trava deste
 * projeto ficou verde por meses com a tela quebrada. */
ok(comparacoes("if (t.drawMode === 'rei_rainha') { x(); }").length === 1,
  '③ ⛔ o portão RECONHECE uma comparação crua quando ela existe');
ok(comparacoes("if ('rei_rainha' === t.ligaRoundFormat) { x(); }").length === 1,
  '③ e reconhece com os lados invertidos');
ok(comparacoes("if (t.drawMode !== 'rei_rainha') { x(); }").length === 1, '③ e a negação também');
ok(comparacoes("if (window._sorteioDaFaseEhReiRainha(t)) { x(); }").length === 0,
  '③ e NÃO reclama de quem usa a porta — portão que reclama do código certo acaba desligado');
ok(comparacoes("var m = { drawMode: 'rei_rainha' };").length === 0,
  '③ nem de quem ESCREVE o campo: escrever é a origem, não a pergunta');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
