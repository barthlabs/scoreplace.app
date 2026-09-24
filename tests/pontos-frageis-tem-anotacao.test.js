'use strict';
/* ⛔⛔ A TRAVA DA ANOTAÇÃO (ordem do dono, 24/set/2026).
 *
 * _"criem regras e travas para que isso sempre seja feito e quem sabe assim paramos de ter
 *  regressões, com anotações no código de como as coisas devem ser e funcionar."_
 *
 * Regra que não é portão NÃO ACONTECE — o próprio repo já registrou isso. Então a anotação
 * deixa de ser boa vontade: se ela sumir de um ponto que já regrediu, o portão reprova e
 * mostra o incidente.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require('./pontos-frageis-validador.js');
const REGISTRO = require('./pontos-frageis.js');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── pontos frágeis têm anotação ────');

// ── A. O LEITOR, falsificado ANTES de qualquer entrada real ──────────────────
{
  const js = "var a = 'ANCORA aqui';\n// ANCORA de linha\n/* ANCORA de bloco */\nvar ANCORA = 1;\n";
  const r = V.lerJs(js);
  ok(r.mascarado.length === js.length, 'o mascarado tem o MESMO comprimento (é o que sustenta o offset)');
  const achados = r.mascarado.split('ANCORA').length - 1;
  ok(achados === 1, 'âncora em string, em // e em /* */ não conta — só a de código (achou ' + achados + ')');
  ok(r.comentarios.length === 2, 'os dois comentários voltam com intervalo próprio');

  const tpl = 'var t = `texto ANCORA aqui ${ANCORA + 1}`;\n';
  const rt = V.lerJs(tpl);
  ok((rt.mascarado.split('ANCORA').length - 1) === 1,
    'na template: o TEXTO é mascarado, mas ${...} é CÓDIGO e continua valendo');

  const div = 'var x = a / b;\nvar y = /ANCORA/.test(s);\nvar z = ANCORA;\n';
  const rd = V.lerJs(div);
  ok((rd.mascarado.split('ANCORA').length - 1) === 1,
    'divisão não abre regex, e regex de verdade é mascarada');
}

// ── B. Rules: sem regra de regex, e o ancestral é estrutural ─────────────────
{
  const rules = [
    'match /tournaments/{tournamentId} {',
    '  // nota de cima',
    '  allow create: if false;',
    '  match /results/{matchId} {',
    '    allow create: if false;',
    '  }',
    '}'
  ].join('\n');
  const r = V.lerRules(rules);
  ok(r.mascarado.indexOf('match /results/{matchId}') !== -1,
    'os caminhos `match` sobrevivem — um lexer JS abriria regex na primeira barra');
  const blocos = V.blocosMatch(r.mascarado);
  ok(blocos.length === 2, 'os dois blocos match são encontrados');
  const entrada = { id: 'T', arquivo: 'x', ancora: 'allow create: if false;',
    contexto: 'match /tournaments/{tournamentId}', marca: 'nota de cima',
    incidente: 'fixture', data: '2026-09-24' };
  ok(V.validarFonte(rules, entrada, 'rules').length === 0,
    'o allow do torneio casa com o bloco do TORNEIO, não com o da subcoleção');
  const subEntrada = Object.assign({}, entrada, { contexto: 'match /results/{matchId}' });
  const errosSub = V.validarFonte(rules, subEntrada, 'rules');
  ok(errosSub.length === 1 && /comentário COLADO/.test(errosSub[0]),
    'e o allow da subcoleção é avaliado no bloco DELE (aqui, sem anotação colada)');
}

// ── C. Cardinalidade e ambiguidade ───────────────────────────────────────────
{
  const doisNoMesmo = 'match /results/{matchId} {\n  // m\n  allow create: if false;\n  allow create: if false;\n}';
  const e = { id: 'C', arquivo: 'x', ancora: 'allow create: if false;',
    contexto: 'match /results/{matchId}', marca: 'm', incidente: 'fixture', data: '2026-09-24' };
  const erros = V.validarFonte(doisNoMesmo, e, 'rules');
  ok(erros.length === 1 && /exatamente 1/.test(erros[0]),
    'duas âncoras filhas diretas do mesmo match ⇒ reprova (uma ficaria nua)');

  const js = '// m\nvar ANCORA = 1;\nvar ANCORA = 2;\n';
  const amb = { id: 'A', arquivo: 'x', ancora: 'var ANCORA', marca: 'm', incidente: 'fixture', data: '2026-09-24' };
  const errosAmb = V.validarFonte(js, amb, 'js');
  ok(errosAmb.length === 1 && /ambiguidade/.test(errosAmb[0]),
    'âncora repetida sem ocorrência nem contexto ⇒ reprova por ambígua');

  const seg = Object.assign({}, amb, { ocorrencia: 2 });
  const errosSeg = V.validarFonte(js, seg, 'js');
  ok(errosSeg.length === 1 && /comentário COLADO/.test(errosSeg[0]),
    'pedida a 2ª ocorrência, é a 2ª que é validada — e ela não tem anotação colada');

  const fora = Object.assign({}, amb, { ocorrencia: 9 });
  ok(/só há 2/.test(V.validarFonte(js, fora, 'js')[0] || ''), 'ocorrência inexistente ⇒ reprova');
  const zero = Object.assign({}, amb, { ocorrencia: 0 });
  ok(/inteiro >= 1/.test(V.validarFonte(js, zero, 'js')[0] || ''), 'ocorrência 0 ⇒ reprova');
}

// ── D. As três falsificações do pedido: marca, âncora e ADJACÊNCIA ───────────
{
  const base = '/* m: A MARCA */\nvar ANCORA = 1;\n';
  const e = { id: 'D', arquivo: 'x', ancora: 'var ANCORA', marca: 'A MARCA',
    incidente: 'caso de fixture', data: '2026-09-24' };
  ok(V.validarFonte(base, e, 'js').length === 0, 'com marca colada na âncora, passa');

  const semMarca = '/* m: outra coisa */\nvar ANCORA = 1;\n';
  const e1 = V.validarFonte(semMarca, e, 'js');
  ok(e1.length === 1 && /perdeu a marca/.test(e1[0]), 'apagar a marca ⇒ reprova');

  const semAncora = '/* m: A MARCA */\nvar OUTRA = 1;\n';
  const e2 = V.validarFonte(semAncora, e, 'js');
  ok(e2.length === 1 && /SUMIU/.test(e2[0]), 'apagar a âncora ⇒ reprova');

  const longe = '/* m: A MARCA */\nvar meio = 0;\nvar ANCORA = 1;\n';
  const e3 = V.validarFonte(longe, e, 'js');
  ok(e3.length === 1 && /COLADO/.test(e3[0]),
    'marca em comentário NÃO adjacente ⇒ reprova — é isto que põe a explicação onde se mexe');

  [e1, e2, e3].forEach(function (err, i) {
    ok(/caso de fixture/.test(err[0]) && /2026-09-24/.test(err[0]),
      'a mensagem ' + (i + 1) + ' carrega o incidente e a data');
  });

  const comAspas = Object.assign({}, e, { ancora: "var x = 'y'" });
  ok(/entre aspas/.test(V.validarFonte(base, comAspas, 'js')[0] || ''),
    'âncora com string ⇒ reprova na validação do registro (ela nunca casaria)');
  const semInc = { id: 'X', arquivo: 'x', ancora: 'var ANCORA', marca: 'A MARCA' };
  ok(/incidente/.test(V.validarFonte(base, semInc, 'js')[0] || ''),
    'entrada sem incidente/data ⇒ reprova');
}

// ── E. A ÁRVORE REAL ─────────────────────────────────────────────────────────
console.log('  ── o registro contra o código de verdade ──');
{
  const porArquivo = {};
  REGISTRO.forEach((e) => { (porArquivo[e.arquivo] = porArquivo[e.arquivo] || []).push(e); });
  let erros = [];
  Object.keys(porArquivo).forEach((arquivo) => {
    const fonte = fs.readFileSync(path.join(ROOT, arquivo), 'utf8');
    const tipo = arquivo.endsWith('.rules') ? 'rules' : 'js';
    porArquivo[arquivo].forEach((entrada) => {
      erros = erros.concat(V.validarFonte(fonte, entrada, tipo));
    });
  });
  ok(erros.length === 0, 'os ' + REGISTRO.length + ' pontos frágeis continuam anotados'
    + (erros.length ? '\n      ' + erros.join('\n      ') : ''));
  ok(REGISTRO.every((e) => e.incidente && e.data), 'toda entrada declara incidente e data');

  /* ⛔⛔ OS IDs SÃO FIXADOS AQUI, e não lidos do próprio registro. Um portão que só percorre
   * o conteúdo atual aprova quem APAGA uma entrada: a proteção encolhe e nada reclama —
   * exatamente o tipo de regressão silenciosa que esta trava existe para impedir.
   * Tirar um ponto da lista passa a exigir tirar o id daqui também, e aí a pessoa lê o
   * incidente antes de decidir. É o objetivo inteiro do pedido do dono. */
  const IDS = ['1','2','3','4','5','6','7','8','9','10','10b','10c','11','12'];
  const atuais = REGISTRO.map((e) => e.id);
  const sumiram = IDS.filter((id) => atuais.indexOf(id) === -1);
  ok(sumiram.length === 0, 'nenhum ponto foi removido do registro'
    + (sumiram.length ? ' — sumiram: ' + sumiram.join(', ') : ''));
  ok(new Set(atuais).size === atuais.length, 'e nenhum id se repete');
}

console.log(fail ? `❌ pontos-frageis-tem-anotacao: ${fail} falha(s), ${pass} ok`
                 : `✅ pontos-frageis-tem-anotacao: ${pass} ok`);
process.exit(fail ? 1 : 0);
