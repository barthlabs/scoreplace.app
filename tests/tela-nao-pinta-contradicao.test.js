'use strict';
/* A TELA NÃO PINTA CONTRADIÇÃO — ELA ACUSA E RELÊ.
 * node tests/tela-nao-pinta-contradicao.test.js
 *
 * ⛔⛔ RELATO DO DONO, 27/set/2026, com print: a MESMA tela mostrava "35º Rodrigo Godinho / Betsy"
 * na classificação — eliminados — e, logo abaixo, os dois jogando um card com a tarja REP.
 * _"as pessoas estao vendo e ficando confusas"_ · _"para de regredir isso que é muito serio"_.
 *
 * ⛔ E O DADO NÃO ESTAVA ERRADO. Medido no banco no mesmo minuto: aquele confronto NÃO EXISTE —
 * o jogo é Sandra Bighetto / Flávia Barchetta, com as duas vagas carimbadas. O navegador estava
 * com METADE VELHA: num torneio dividido os jogos moram numa coleção própria, e o documento veio
 * fresco enquanto os jogos vieram do cache. Duas idades no mesmo desenho, e nada acusava.
 *
 * ⛔ A MÁQUINA DE DESCARTAR CACHE JÁ EXISTIA e não servia aqui: ela só dispara em ERRO FATAL do
 * Firestore. Dado velho que "funciona" nunca chega nela — e é exatamente esse que vira mentira na
 * tela. [[project_cache_podre_do_firestore_se_descarta]]
 *
 * ⚠️ O DETECTOR É ESTREITO DE PROPÓSITO: quem a classificação FINAL GRAVADA já pôs entre os
 * eliminados não pode ocupar vaga de repescagem em jogo sem vencedor. Alargar isso esconderia a
 * chave de quem está jogando — o oposto do que se quer.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a tela não pinta contradição ────\n');

const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const i0 = codigo.indexOf('function _contradicaoNaLinha(');
const bloco = i0 < 0 ? '' : codigo.slice(i0, codigo.indexOf('\n  }', i0) + 4);
ok(bloco.length > 300, '① o detector foi achado pelo identificador');

/* ── ① A REGRA, EXERCIDA ───────────────────────────────────────────────────── */
const fn = new Function('t', 'return ' + bloco + '\n_contradicaoNaLinha;');
const monta = (cong, lm) => fn({ classifFinalDaLinha: cong ? { L: cong } : null })('L', lm);

const cong36 = Array.from({ length: 36 }, (_, i) => ({ name: 'D' + (i + 1), pos: i + 1 }));
const repPendente = (nome) => [{ id: 'm1', p1: nome, p1FromRepechage: true }];

ok(monta(cong36, repPendente('D35')) !== null,
  '① ⛔⛔ eliminado (35º de 36) ocupando vaga de repescagem em jogo aberto: ACUSA');
ok(monta(cong36, repPendente('D10')) === null,
  '① ⛔ quem NÃO está entre os últimos não acusa — senão a chave some para quem está jogando');
ok(monta(null, repPendente('D35')) === null,
  '① ⛔⛔ sem classificação congelada não há com o que contradizer: não acusa');
ok(monta(cong36, [{ id: 'm1', p1: 'D35', p1FromRepechage: true, winner: 'D35' }]) === null,
  '① ⛔ jogo já DECIDIDO não contradiz nada — o passado pode ter qualquer um');
ok(monta(cong36, [{ id: 'm1', p1: 'TBD', p1FromRepechage: true }]) === null,
  '① vaga vazia não acusa');
ok(monta(cong36, [{ id: 'm1', p1: 'D35' }]) === null,
  '① ⛔ slot que NÃO é de repescagem não acusa: entrar por mérito é outra coisa');
const achados = monta(cong36, [{ id: 'm1', p1: 'D35', p1FromRepechage: true },
                               { id: 'm2', p2: 'D36', p2FromRepechage: true }]);
ok(Array.isArray(achados) && achados.length === 2, '① acusa TODOS, não só o primeiro');
ok(/35º/.test(String(achados)), '① e diz a posição, para o aviso poder ser lido');

/* ── ② A TELA USA O DETECTOR ANTES DE PINTAR ───────────────────────────────── */
const iUso = codigo.indexOf('_contradicaoNaLinha(bracketKey, lm)');
const iPinta = codigo.indexOf('_renderClassifFromMap', iUso);
ok(iUso > 0, '② ⛔⛔ a montagem da linha chama o detector');
ok(iPinta > iUso, '② e chama ANTES de montar a tabela');
ok(/Dados desatualizados nesta chave/.test(src),
  '② ⛔ e no lugar da tabela entra um AVISO — sumir calado faria concluir que não há chave');

/* ── ③ ELA RELÊ, E SÓ UMA VEZ ──────────────────────────────────────────────── */
ok(/_descartaCacheEReler/.test(codigo), '③ ⛔⛔ e manda reler as partes');
ok(/_contradicaoNaLinha\._pediu/.test(codigo),
  '③ ⛔ com freio: sem ele, um dado de verdade incoerente viraria laço infinito de releitura');

/* ── ④ A RELEITURA EXISTE E NÃO DERRUBA A FILA OFFLINE ─────────────────────── */
const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const iD = st.indexOf('window._descartaCacheEReler = function');
const blocoD = iD < 0 ? '' : st.slice(iD, st.indexOf('\n};', iD));
ok(blocoD.length > 200, '④ a releitura existe');
ok(/_montaPesadosQueFaltam/.test(blocoD),
  '④ ⛔ e reusa o caminho que já busca parte que falta — não inventa leitura nova');
ok(!/clearPersistence|deleteDatabase/.test(blocoD),
  '④ ⛔⛔ e NÃO limpa o cache inteiro: isso derrubaria a fila de quem lança placar sem sinal');
ok(/_marcaPartesQueFaltam/.test(blocoD),
  '④ esvazia as partes e deixa o contador acusar a falta — é o que dispara a busca');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
