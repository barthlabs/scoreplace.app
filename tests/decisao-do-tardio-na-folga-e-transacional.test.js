'use strict';
/* A DECISÃO SOBRE TARDIO EM CHAVE DE FOLGA ACONTECE NO SERVIDOR, EM TRANSAÇÃO.
 * node tests/decisao-do-tardio-na-folga-e-transacional.test.js
 *
 * ⛔⛔ O QUE ESTÁ EM JOGO É CHAVE PUBLICADA. No desenho de FOLGA a rodada de entrada é dimensionada
 * pela potência de 2 abaixo do número de inscritos, então admitir mais um MUDA QUEM ESTREIA — medido
 * em 60 dos 60 incrementos entre 4 e 64. Com 36→37, `D29×D30 … D35×D36` vira `D28×D29 … D36×D37`.
 * Por isso a inscrição tardia não redesenha nada sozinha: grava uma pendência, e refazer a chave é um
 * gesto explícito da organização.
 *
 * ⛔ E O GESTO É DO SERVIDOR. Decidir no navegador é decidir sobre o retrato que a aba tinha, que
 * pode já estar velho. A Function relê, autoriza, confere revisão e confere que nenhum confronto
 * afetado tem resultado — tudo na mesma transação. É isto que torna duas confirmações simultâneas
 * seguras: a segunda relê, vê que a pendência sumiu ou que a revisão mudou, e para.
 * [[feedback_a_trava_vale_onde_mora_a_verdade]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a decisão do tardio na folga é transacional ────\n');

const fn = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
/* ⛔ recorte pelo PRÓPRIO identificador, nunca por janela de tamanho fixo */
const i0 = fn.indexOf('exports.resolvePendingLateBye = onCall');
const bloco = i0 < 0 ? '' : fn.slice(i0, fn.indexOf('\n});', i0));
ok(bloco.length > 500, '① a porta existe e foi achada pelo identificador');

/* ── ① AS QUATRO CONFERÊNCIAS, TODAS DENTRO DA TRANSAÇÃO ───────────────────── */
const iTx = bloco.indexOf('db.runTransaction');
ok(iTx > 0, '① ela roda em transação');
const dentro = iTx > 0 ? bloco.slice(iTx) : '';
[
  ['_leTorneio(tx, ref, tId)', '① ⛔⛔ RELÊ o torneio pelo caminho canônico — decidir sobre o retrato da aba é decidir sobre o que já mudou'],
  ['_isTournamentAdmin(t, uid)', '① ⛔⛔ exige ORGANIZAÇÃO: nem o inscrito nem terceiro redesenham a chave de ninguém'],
  ["String(prop.revisaoDaChave) !== revisao", '① ⛔⛔ exige que a REVISÃO bata — proposta velha é recusada, não aplicada por cima'],
  ['confrontosAfetados', '① ⛔⛔ confere os confrontos afetados antes de mexer']
].forEach(function (par) {
  ok(dentro.indexOf(par[0]) >= 0, par[1]);
});
ok(/m\.winner \|\| m\.scoreP1 != null \|\| m\.scoreP2 != null \|\| m\.pendingResult/.test(dentro),
  '① ⛔ e recusa se houver resultado, placar ou placar esperando — redesenhar apagaria resultado');
ok(/sem-pendencia/.test(dentro),
  '① ⭐ pendência já resolvida devolve "nada mudou" em vez de estourar — é a segunda confirmação simultânea');

/* ── ② O INSTANTE VEM DE FORA DA TRANSAÇÃO ─────────────────────────────────── */
const iAgora = bloco.indexOf("const agoraIso = new Date().toISOString();");
ok(iAgora > 0 && iAgora < iTx,
  '② ⛔ o instante é calculado ANTES da transação — a transação é repetida, e hora criada dentro faz cada tentativa gravar diferente');

/* ── ③ CANCELAR TAMBÉM PERSISTE ────────────────────────────────────────────── */
ok(/acao === 'cancelar'[\s\S]{0,300}delete mapa\[linha\][\s\S]{0,200}_gravaTorneio/.test(dentro),
  '③ ⛔⛔ "manter como está" APAGA a pendência e GRAVA — decisão que não fica registrada volta amanhã');

/* ── ④ O REDESENHO SÓ SAI POR AQUI ─────────────────────────────────────────── */
const ad = fs.readFileSync(path.join(ROOT, 'js/views/chaves-adapter.js'), 'utf8');
const adCod = ad.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/_politicaAqui === 'bye' && !\(opts && opts\.decisaoDoOrganizador === true\)/.test(adCod),
  '④ ⛔⛔ o integrador só redesenha a folga com o interruptor da DECISÃO — sem ele, recusa como antes');
ok(/decisaoDoOrganizador: true/.test(dentro),
  '④ e é a callable quem o liga');
const core = fs.readFileSync(path.join(ROOT, 'functions-autodraw/draw-core.js'), 'utf8');
ok(/decisaoDoOrganizador: !!\(opts && opts\.decisaoDoOrganizador\)/.test(core),
  '④ o core repassa o interruptor em vez de ligá-lo por conta própria');
/* ⛔ e NENHUM caminho automático o liga. ⚠️ A contagem exclui o corpo da PRÓPRIA callable, que é
 * justamente quem deve ligá-lo — incluí-lo aqui daria vermelho pelo motivo errado (e me deu). */
const _foraDaCallable = fn.slice(0, i0) + fn.slice(i0 + bloco.length);
const automaticos = (_foraDaCallable.match(/integrateLateFn\(t, \{[\s\S]{0,200}?\}\)/g) || []);
const comFlag = automaticos.filter(function (x) { return /decisaoDoOrganizador/.test(x); });
ok(automaticos.length >= 2 && comFlag.length === 0,
  '④ ⛔⛔ os ' + automaticos.length + ' caminhos automáticos NÃO ligam o interruptor — inscrever-se não redesenha chave publicada (com a flag: ' + comFlag.length + ')');

/* ── ⑤ A TELA LÊ O QUE ESTÁ GRAVADO, NÃO `window` ──────────────────────────── */
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const brCod = br.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const iTard = brCod.indexOf('function _tardioPendenteHtml(');
const blocoUi = iTard < 0 ? '' : brCod.slice(iTard, brCod.indexOf('\n  }', iTard));
ok(blocoUi.length > 200, '⑤ o aviso da pendência existe na tela');
ok(/t\.tardiosPendentesPorLinha/.test(blocoUi),
  '⑤ ⛔⛔ e lê o campo GRAVADO no torneio');
ok(!/_tardiosAguardandoNovaChave/.test(blocoUi),
  '⑤ ⛔ e NÃO o mapa da aba, que some quando a página fecha');
ok(/window\._souOrganizador\(t\)/.test(blocoUi),
  '⑤ ⛔ só a organização vê — botão que o inscrito não pode apertar é promessa que a tela não cumpre');
ok(/_decidirTardioNaFolga/.test(blocoUi), '⑤ e os botões chamam a decisão');
ok(brCod.indexOf('_tardioPendenteHtml(bracketKey, color) +') > 0,
  '⑤ ⭐ e o aviso é realmente renderizado, não só definido');

/* ── ⑥ O CLIENTE SÓ TRANSPORTA A INTENÇÃO ──────────────────────────────────── */
const bl = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const iDec = bl.indexOf('window._decidirTardioNaFolga = async function');
const blocoCli = iDec < 0 ? '' : bl.slice(iDec);
ok(blocoCli.length > 300, '⑥ o cliente da decisão existe');
ok(/_callCF\('resolvePendingLateBye'/.test(blocoCli),
  '⑥ ⛔⛔ e chama a porta do servidor');
ok(/revisaoDaChave/.test(blocoCli), '⑥ mandando a revisão que ele viu');
ok(!/integrarTardiosElim|_chavesAdapter/.test(blocoCli),
  '⑥ ⛔ e NÃO redesenha nada no navegador');
ok(/window\.confirm\(/.test(blocoCli),
  '⑥ ⛔ pergunta antes de confirmar — isto muda confronto publicado, não é clique reversível');

/* ── ⑦ A PORTA ESTÁ NO CONTRATO DE CALLABLES ───────────────────────────────── */
const contrato = fs.readFileSync(path.join(ROOT, 'tests/contrato-callables.js'), 'utf8');
ok(/resolvePendingLateBye/.test(contrato),
  '⑦ ⛔ a porta entrou no contrato — fora dele, a sonda não prova que ela foi publicada');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
