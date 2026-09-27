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
ok(/_politicaAqui === 'bye' && !_decidida/.test(adCod),
  '④ ⛔⛔ o integrador só redesenha a folga quando a decisão é DESTA linha — fora disso, recusa como antes');
ok(/opts\.decisaoDoOrganizador === true/.test(adCod) && /opts\.linhaDaDecisao/.test(adCod),
  '④ e "decidida" exige as DUAS coisas: o interruptor e a linha');
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

/* ── ④b A DECISÃO É DE UMA LINHA, NÃO DO TORNEIO — EXERCIDO ─────────────────
 * ⛔⛔ Defeito meu, achado pelo revisor: eu ligava o interruptor e o integrador seguia varrendo
 * TODAS as linhas. Confirmar a Ouro redesenharia a Prata junto — que tem decisão própria pendente e
 * cujo organizador não foi perguntado. Chave publicada de outra linha mudando por tabela.
 * ⚠️ Aqui não basta ler o código: o que importa é o COMPORTAMENTO com duas linhas pendentes. */
ok(/linhaDaDecisao/.test(adCod), '④b o integrador conhece a linha decidida');
ok(/linhaDaDecisao: linha/.test(dentro), '④b e a callable manda QUAL linha foi decidida');
(function () {
  const H = require(path.join(ROOT, 'tests/headless.js'));
  ['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
  const W = H.window;
  const A = W._chavesAdapter || W.ChavesAdapter || W._adapterChaves;
  if (!A || typeof A.integrarTardiosElim !== 'function') { ok(false, '④b adapter não carregou'); return; }
  const gente = (n, pre) => Array.from({ length: n }, (_, i) => ({ name: pre + (i + 1), uid: pre + 'u' + (i + 1) }));
  /* duas linhas de folga no MESMO torneio, cada uma com o seu tardio */
  const mA = A.build(16, 'simples', { participantes: gente(16, 'A'), politicaDaChave: 'bye' }).matches;
  const mB = A.build(16, 'simples', { participantes: gente(16, 'B'), politicaDaChave: 'bye' }).matches;
  const marca = (ms, tag) => ms.map(function (m) {
    const c = Object.assign({}, m);
    /* ⛔ o prefixo TERMINA EM '-': a coordenada estrutural é achada por /(^|-)(VC|PD|GF|3P)(-|$)/,
     * e um separador diferente faz a chave ser lida como "motor antigo" e o tardio ser recusado —
     * caí exatamente nisso ao escrever este teste com '|'. */
    c.id = tag + '-' + String(m.id);
    if (c.nextMatchId) c.nextMatchId = tag + '-' + String(c.nextMatchId);
    if (c.loserNextMatchId) c.loserNextMatchId = tag + '-' + String(c.loserNextMatchId);
    return c;
  });
  const t = { id: 'tt', politicaDaChave: 'bye', matches: marca(mA, 'OURO').concat(marca(mB, 'PRATA')) };
  A.integrarTardiosElim(t, [
    { name: 'A17', uid: 'Au17', presente: true },
    { name: 'B17', uid: 'Bu17', presente: true }
  ]);
  const mapa = t.tardiosPendentesPorLinha || {};
  const linhas = Object.keys(mapa);
  ok(linhas.length === 2, '④b duas linhas ficam pendentes, cada uma com o seu (achei ' + linhas.length + ')');
  if (linhas.length !== 2) return;
  const alvo = linhas[0], outra = linhas[1];
  const foto = (tag) => t.matches.filter(function (m) { return String(m.id).indexOf(tag) === 0; })
    .map(function (m) { return m.id + ':' + m.p1 + 'x' + m.p2; }).sort().join('|');
  const tagOutra = String(outra).indexOf('OURO') >= 0 ? 'OURO' : 'PRATA';
  const antesOutra = foto(tagOutra);
  const revOutra = mapa[outra].revisaoDaChave;
  /* confirma SÓ a primeira */
  A.integrarTardiosElim(t, [{ name: 'A17', uid: 'Au17', presente: true }],
    { decisaoDoOrganizador: true, linhaDaDecisao: alvo });
  ok(foto(tagOutra) === antesOutra,
    '④b ⛔⛔ confirmar UMA linha não mexe em NENHUM confronto da outra');
  const depois = t.tardiosPendentesPorLinha || {};
  ok(depois[outra] && depois[outra].revisaoDaChave === revOutra,
    '④b ⛔ e a pendência da outra linha continua lá, intacta — a decisão dela não foi tomada por tabela');
})();

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
