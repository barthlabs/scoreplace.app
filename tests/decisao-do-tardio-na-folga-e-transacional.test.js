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

/* ⛔⛔ A REGRA MUDOU DE ARQUIVO, E ESTE TESTE MUDOU JUNTO. Ela saiu da callable e virou função pura
 * do motor, justamente para poder ser EXERCIDA (bloco ⑧). As asserções de estrutura passam a olhar
 * o motor; as de comportamento saíram daqui e viraram execução — conferir os dois lugares seria
 * conferir duas vezes a mesma coisa, e a cópia que envelhece é a de texto. */
const coreSrc = fs.readFileSync(path.join(ROOT, 'functions-autodraw/draw-core.js'), 'utf8');
const iM = coreSrc.indexOf('function decidirTardioNaFolga(t, opts)');
const motor = iM < 0 ? '' : coreSrc.slice(iM, coreSrc.indexOf('\nmodule.exports', iM));
ok(motor.length > 800, '① a regra foi achada no motor, pelo identificador');

/* ── ① AS QUATRO CONFERÊNCIAS, TODAS DENTRO DA TRANSAÇÃO ───────────────────── */
const iTx = bloco.indexOf('db.runTransaction');
ok(iTx > 0, '① ela roda em transação');
const dentro = iTx > 0 ? bloco.slice(iTx) : '';
/* a CASCA: o que só a callable pode fazer */
[
  ['_leTorneio(tx, ref, tId)', '① ⛔⛔ RELÊ o torneio pelo caminho canônico — decidir sobre o retrato da aba é decidir sobre o que já mudou'],
  ['_isTournamentAdmin(t, uid)', '① ⛔⛔ exige ORGANIZAÇÃO: nem o inscrito nem terceiro redesenham a chave de ninguém'],
  ['_gravaTorneio(tx, ref, t, antes', '① e grava pela porta canônica']
].forEach(function (par) {
  ok(dentro.indexOf(par[0]) >= 0, par[1]);
});
/* a REGRA: mora no motor */
[
  ["String(prop.revisaoDaChave) !== revisao", '① ⛔⛔ exige que a REVISÃO bata — proposta velha é recusada, não aplicada por cima'],
  ['confrontosAfetados', '① ⛔⛔ confere os confrontos afetados antes de mexer']
].forEach(function (par) {
  ok(motor.indexOf(par[0]) >= 0, par[1]);
});
ok(/m\.winner \|\| m\.scoreP1 != null \|\| m\.scoreP2 != null \|\| m\.pendingResult/.test(motor),
  '① ⛔ e recusa se houver resultado, placar ou placar esperando — redesenhar apagaria resultado');
/* ⛔⛔ E CONFERE O RETRATO INTEIRO, não só "tem placar?": a proposta guardou id, p1 e p2. Uma troca
 * de duplas sem placar passava batido e seria apagada pelo redesenho. */
ok(/String\(m\.p1 == null \? '' : m\.p1\) !== String\(\(c && c\.p1\) \|\| ''\)/.test(motor),
  '① ⛔⛔ compara p1 do retrato com o que está na chave agora');
ok(/String\(m\.p2 == null \? '' : m\.p2\) !== String\(\(c && c\.p2\) \|\| ''\)/.test(motor),
  '① e p2 também');
/* ⛔ e nomeia QUEM entra, não só a linha */
ok(/assinaturasDaDecisao/.test(motor) && /prop\.inscritos/.test(motor),
  '① ⛔⛔ a identidade de quem entra sai da PRÓPRIA proposta — o core recolhe a espera inteira');
ok(/assinaturasDaDecisao: assinaturas/.test(motor), '① e vai para o integrador');
ok(/sem-pendencia/.test(motor),
  '① ⭐ pendência já resolvida devolve "nada mudou" em vez de estourar — é a segunda confirmação simultânea');

/* ── ② O INSTANTE VEM DE FORA DA TRANSAÇÃO ─────────────────────────────────── */
const iAgora = bloco.indexOf("const agoraIso = new Date().toISOString();");
ok(iAgora > 0 && iAgora < iTx,
  '② ⛔ o instante é calculado ANTES da transação — a transação é repetida, e hora criada dentro faz cada tentativa gravar diferente');

/* ── ③ CANCELAR TAMBÉM PERSISTE ────────────────────────────────────────────── */
ok(/acao === 'cancelar'[\s\S]{0,120}delete mapa\[linha\]/.test(motor),
  '③ ⛔⛔ "manter como está" APAGA a pendência — e a casca grava, porque `mudou` volta verdadeiro');

/* ── ④ O REDESENHO SÓ SAI POR AQUI ─────────────────────────────────────────── */
const ad = fs.readFileSync(path.join(ROOT, 'js/views/chaves-adapter.js'), 'utf8');
const adCod = ad.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/_politicaAqui === 'bye' && !_decidida/.test(adCod),
  '④ ⛔⛔ o integrador só redesenha a folga quando a decisão é DESTA linha — fora disso, recusa como antes');
ok(/opts\.decisaoDoOrganizador === true/.test(adCod) && /opts\.linhaDaDecisao/.test(adCod),
  '④ e "decidida" exige as DUAS coisas: o interruptor e a linha');
ok(/decisaoDoOrganizador: true/.test(motor),
  '④ e é a decisão quem o liga');
const core = fs.readFileSync(path.join(ROOT, 'functions-autodraw/draw-core.js'), 'utf8');
ok(/decisaoDoOrganizador: !!\(opts && opts\.decisaoDoOrganizador\)/.test(core),
  '④ o core repassa o interruptor em vez de ligá-lo por conta própria');
ok(/assinaturasDaDecisao/.test(core), '④ e repassa a identidade de quem a decisão nomeia');
ok(/opts\.assinaturasDaDecisao/.test(adCod),
  '④ ⛔ o adapter filtra os candidatos por ela, em vez de aceitar a espera inteira');
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
ok(/linhaDaDecisao: linha/.test(motor), '④b e a decisão manda QUAL linha foi decidida');
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
  /* ⛔ CADA LINHA PRECISA DE ALGO QUE A DISTINGA, senão o candidato não pertence a nenhuma — e o
   * código, com razão, recusa escolher (ver o caso ambíguo logo abaixo). Aqui é a categoria, que é o
   * que separa linhas paralelas num torneio de verdade. */
  const comCat = (ms, cat) => ms.map(function (m) { const c = Object.assign({}, m); c.category = cat; return c; });
  const t = {
    id: 'tt', politicaDaChave: 'bye',
    matches: comCat(marca(mA, 'OURO'), 'Ouro').concat(comCat(marca(mB, 'PRATA'), 'Prata'))
  };
  A.integrarTardiosElim(t, [
    { name: 'A17', uid: 'Au17', presente: true, category: 'Ouro' },
    { name: 'B17', uid: 'Bu17', presente: true, category: 'Prata' }
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
  /* ⛔⛔ CONFIRMA COM A ESPERA INTEIRA, que é o que a callable faz de verdade. Meu teste anterior
   * passava só `A17` e mascarava a falha: o core recolhe TODA a espera, então confirmar a Ouro
   * inseria o tardio da Prata na Ouro. Testar com a lista que o código real não usa é falso verde. */
  const esperaInteira = [
    { name: 'A17', uid: 'Au17', presente: true, category: 'Ouro' },
    { name: 'B17', uid: 'Bu17', presente: true, category: 'Prata' }
  ];
  const assinar = (x) => ((x.chaves || []).map(String).sort().join('|'));
  const assinDoAlvo = (mapa[alvo].inscritos || []).map(assinar).filter(Boolean);
  ok(assinDoAlvo.length > 0, '④b a proposta da linha nomeia quem entraria');
  A.integrarTardiosElim(t, esperaInteira,
    { decisaoDoOrganizador: true, linhaDaDecisao: alvo, assinaturasDaDecisao: assinDoAlvo });
  ok(foto(tagOutra) === antesOutra,
    '④b ⛔⛔ confirmar UMA linha não mexe em NENHUM confronto da outra');
  const depois = t.tardiosPendentesPorLinha || {};
  ok(depois[outra] && depois[outra].revisaoDaChave === revOutra,
    '④b ⛔ e a pendência da outra linha continua lá, intacta — a decisão dela não foi tomada por tabela');
  /* ⛔⛔ E O CANDIDATO DA OUTRA LINHA NÃO ENTROU NESTA. Era exatamente o furo: nomear a linha e não
   * nomear quem. */
  const tagAlvo = String(alvo).indexOf('OURO') >= 0 ? 'OURO' : 'PRATA';
  const intrusoNoAlvo = t.matches.some(function (m) {
    if (String(m.id).indexOf(tagAlvo) !== 0) return false;
    return ['p1', 'p2'].some(function (sl) {
      const uids = (sl === 'p1') ? (m.team1Uids || []) : (m.team2Uids || []);
      return uids.map(String).indexOf(tagAlvo === 'OURO' ? 'Bu17' : 'Au17') >= 0 ||
             String(m[sl] || '') === (tagAlvo === 'OURO' ? 'B17' : 'A17');
    });
  });
  ok(!intrusoNoAlvo,
    '④b ⛔⛔ o tardio da OUTRA linha não foi inserido na linha decidida, mesmo estando na espera');
})();

/* ── ④c CANDIDATO QUE NÃO PERTENCE A UMA LINHA SÓ FICA SEM DESTINO ─────────
 * ⛔⛔ Era a raiz do furo: com duas linhas e nada que separe os candidatos, AS DUAS propostas
 * nasciam com OS DOIS — e confirmar uma inseria o tardio da outra. Escolher uma linha no chute
 * colocaria alguém numa chave que não é a dele.
 * ⇒ o ambíguo sai de todas as propostas de linha e vira pendência SEM DESTINO. Pergunta explícita é
 * melhor que resposta errada em duas chaves. */
(function () {
  const H = require(path.join(ROOT, 'tests/headless.js'));
  ['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
  const W = H.window;
  const A = W._chavesAdapter || W.ChavesAdapter || W._adapterChaves;
  if (!A) { ok(false, '④c adapter não carregou'); return; }
  const gente = (n, pre) => Array.from({ length: n }, (_, i) => ({ name: pre + (i + 1), uid: pre + 'u' + (i + 1) }));
  const marca = (ms, tag) => ms.map(function (m) {
    const c = Object.assign({}, m);
    c.id = tag + '-' + String(m.id);
    if (c.nextMatchId) c.nextMatchId = tag + '-' + String(c.nextMatchId);
    if (c.loserNextMatchId) c.loserNextMatchId = tag + '-' + String(c.loserNextMatchId);
    return c;
  });
  const mA = A.build(16, 'simples', { participantes: gente(16, 'A'), politicaDaChave: 'bye' }).matches;
  const mB = A.build(16, 'simples', { participantes: gente(16, 'B'), politicaDaChave: 'bye' }).matches;
  /* SEM categoria nos dois lados: nada diz a que linha o candidato pertence */
  const t = { id: 'ta', politicaDaChave: 'bye', matches: marca(mA, 'OURO').concat(marca(mB, 'PRATA')) };
  A.integrarTardiosElim(t, [{ name: 'X', uid: 'ux', presente: true }]);
  const mapa = t.tardiosPendentesPorLinha || {};
  const porLinha = Object.keys(mapa).filter(function (k) { return k !== '__sem_destino__'; });
  ok(porLinha.length === 0,
    '④c ⛔⛔ candidato ambíguo NÃO fica em nenhuma proposta de linha (achei ' + porLinha.length + ')');
  ok(!!mapa.__sem_destino__,
    '④c ⛔ ele vai para uma pendência SEM DESTINO, em vez de sumir ou ser duplicado');
  ok(mapa.__sem_destino__ && mapa.__sem_destino__.semDestino === true &&
     mapa.__sem_destino__.linha === null,
    '④c e ela se declara sem destino, para a tela não a tratar como se fosse de uma linha');
  const ins = (mapa.__sem_destino__ && mapa.__sem_destino__.inscritos) || [];
  ok(ins.length === 1 && (ins[0].uids || []).indexOf('ux') >= 0,
    '④c com quem está esperando');
})();

/* ── ④d QUEM NÃO TEM CONTA TAMBÉM PODE SER CONFIRMADO ──────────────────────
 * ⛔⛔ Achado do revisor: o organizador inscreve gente à mão, e essa gente nasce com
 * `manualParticipantId` e NENHUM uid. A proposta guardava só uids e a callable recusava sem eles —
 * o inscrito manual aparecia esperando e o botão de confirmar falhava para sempre. Beco sem saída.
 * ⚠️ Isto NÃO afrouxa a régua do uid: onde há uid, é ele que vale e é ele que casa. */
(function () {
  const H = require(path.join(ROOT, 'tests/headless.js'));
  ['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
  const A = H.window._chavesAdapter;
  if (!A) { ok(false, '④d adapter não carregou'); return; }
  const gente = (n) => Array.from({ length: n }, (_, i) => ({ name: 'D' + (i + 1), uid: 'u' + (i + 1) }));
  const t = { id: 'tm', politicaDaChave: 'bye',
    matches: A.build(16, 'simples', { participantes: gente(16), politicaDaChave: 'bye' }).matches };
  const manual = { name: 'Sem Conta', manualParticipantId: 'manual-abc', presente: true };
  A.integrarTardiosElim(t, [manual]);
  const mapa = t.tardiosPendentesPorLinha || {};
  const k = Object.keys(mapa)[0];
  const prop = k != null ? mapa[k] : null;
  ok(!!prop, '④d a pendência do inscrito manual é gravada');
  if (!prop) return;
  const ks = (prop.inscritos[0] || {}).chaves || [];
  ok(ks.length > 0, '④d ⛔⛔ e ela NOMEIA a pessoa mesmo sem uid (achei ' + ks.length + ' chave(s))');
  ok(ks.indexOf('manual:manual-abc') >= 0,
    '④d pela identidade manual, que é estável — não pelo nome, que envelhece');
  /* ⛔ e a confirmação com essa chave realmente integra */
  const antes = t.matches.length;
  const out = A.integrarTardiosElim(t, [manual],
    { decisaoDoOrganizador: true, linhaDaDecisao: k, assinaturasDaDecisao: [ks.map(String).sort().join('|')] });
  ok(out && out.aplicados === 1,
    '④d ⛔⛔ e confirmar FUNCIONA para quem não tem conta (aplicados=' + ((out || {}).aplicados) + ')');
  ok(t.matches.length !== antes || out.aplicados === 1, '④d a chave foi refeita');
})();

/* ── ④e A PENDÊNCIA SEM DESTINO TEM SAÍDA ──────────────────────────────────
 * ⛔⛔ Achado do revisor: eu criava `__sem_destino__` e não havia como resolvê-la. A tela só casava
 * namespace de chave real e a callable exigia revisão não vazia — que ela não tem, porque não
 * pertence a chave nenhuma. O inscrito ficava visível e sem decisão possível, para sempre.
 * ⇒ ela é ARQUIVÁVEL: aceita `cancelar` sem revisão, e recusa `confirmar`, porque confirmar exigiria
 * saber a linha — que é exatamente o que falta. */
ok(motor.indexOf("const SEM_DESTINO = '__sem_destino__';") >= 0, '④e a regra conhece a pendência sem destino');
ok(/ehSemDestino && acao !== 'cancelar'[\s\S]{0,200}Só é possível arquivá-lo/.test(motor),
  '④e ⛔⛔ ela só aceita ARQUIVAR — confirmar exigiria saber a linha');
ok(/if \(!revisao && !ehSemDestino\)/.test(motor),
  '④e ⛔ e a revisão obrigatória não vale para ela, que nasce sem confrontos para assinar');
ok(/!ehSemDestino && String\(prop\.revisaoDaChave\) !== revisao/.test(motor),
  '④e nem a conferência de revisão lá dentro');
ok(/__sem_destino__/.test(brCodParaSemDestino()),
  '④e ⛔⛔ e a TELA a mostra, com botão de arquivar — senão ela ficaria invisível');
function brCodParaSemDestino() {
  return fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
}

/* ── ④f UMA PESSOA EM COMUM NÃO FAZ DUAS DUPLAS SEREM A MESMA DUPLA ────────
 * ⛔⛔ Defeito meu, reproduzido pelo revisor: eu juntava as chaves de todos os membros num saco e
 * casava por INTERSEÇÃO. A proposta era da dupla (compartilhado, A); se a espera passasse a ter
 * (compartilhado, B), o filtro aceitava B pelo membro em comum e refazia a chave com a dupla ERRADA.
 * ⇒ compara-se a ASSINATURA da inscrição inteira: ou é a mesma, ou não é. */
(function () {
  const H = require(path.join(ROOT, 'tests/headless.js'));
  ['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
  const A = H.window._chavesAdapter;
  if (!A) { ok(false, '④f adapter não carregou'); return; }
  const gente = (n) => Array.from({ length: n }, (_, i) => ({ name: 'D' + (i + 1), uid: 'u' + (i + 1) }));
  const dupla = (a, b) => ({ name: a + ' / ' + b, uids: [a, b], presente: true });
  const t = { id: 'tc', politicaDaChave: 'bye',
    matches: A.build(16, 'simples', { participantes: gente(16), politicaDaChave: 'bye' }).matches };
  A.integrarTardiosElim(t, [dupla('shared', 'a')]);
  const k = Object.keys(t.tardiosPendentesPorLinha || {})[0];
  const prop = k != null ? t.tardiosPendentesPorLinha[k] : null;
  ok(!!prop, '④f a proposta da dupla (shared, a) foi gravada');
  if (!prop) return;
  const assin = (prop.inscritos || []).map(function (x) { return (x.chaves || []).map(String).sort().join('|'); });
  /* agora a espera tem OUTRA dupla, com um membro em comum */
  const out = A.integrarTardiosElim(t, [dupla('shared', 'b')],
    { decisaoDoOrganizador: true, linhaDaDecisao: k, assinaturasDaDecisao: assin });
  ok(!out || out.aplicados === 0,
    '④f ⛔⛔ a dupla (shared, b) NÃO entra no lugar da (shared, a) (aplicados=' + ((out || {}).aplicados) + ')');
  const temB = t.matches.some(function (m) {
    return ['team1Uids', 'team2Uids'].some(function (c) { return (m[c] || []).map(String).indexOf('b') >= 0; });
  });
  ok(!temB, '④f ⛔ e nenhum slot da chave ficou com o membro errado');
})();

/* ── ④g DOIS INSCRITOS MANUAIS DIFERENTES SÃO DIFERENTES ───────────────────
 * ⛔⛔ Defeito meu, reproduzido pelo revisor: a assinatura de idempotência usava só `uids`, e dois
 * manuais têm AMBOS `uids: []` — então trocar o manual A pelo B dava a mesma assinatura, a proposta
 * de A ficava lá e a de B nunca era gravada, em silêncio. Assinar por um campo que é vazio para toda
 * uma classe de gente é não assinar. */
(function () {
  const H = require(path.join(ROOT, 'tests/headless.js'));
  ['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
  const A = H.window._chavesAdapter;
  if (!A) { ok(false, '④g adapter não carregou'); return; }
  const gente = (n) => Array.from({ length: n }, (_, i) => ({ name: 'D' + (i + 1), uid: 'u' + (i + 1) }));
  const t = { id: 'tg', politicaDaChave: 'bye',
    matches: A.build(16, 'simples', { participantes: gente(16), politicaDaChave: 'bye' }).matches };
  A.integrarTardiosElim(t, [{ name: 'Manual A', manualParticipantId: 'manual:a', presente: true }]);
  const r2 = A.integrarTardiosElim(t, [{ name: 'Manual B', manualParticipantId: 'manual:b', presente: true }]);
  ok(r2 && r2.propostas === 1,
    '④g ⛔⛔ trocar o manual A pelo B grava proposta NOVA (propostas=' + ((r2 || {}).propostas) + ')');
  const k = Object.keys(t.tardiosPendentesPorLinha || {})[0];
  const ins = (k != null && t.tardiosPendentesPorLinha[k].inscritos) || [];
  ok(ins.length === 1 && String(ins[0].nome) === 'Manual B',
    '④g ⛔ e a pendência aponta para B, não continua em A (achei "' + ((ins[0] || {}).nome) + '")');
})();

/* ── ④h A PENDÊNCIA SÓ SAI DEPOIS DE O MOTOR APLICAR ───────────────────────
 * ⛔⛔ Defeito meu, achado pelo revisor: eu apagava a pendência ANTES de chamar o motor e apostava
 * que ele aplicaria. Se quem o pedido nomeia já não estivesse na espera — desistiu, foi promovido,
 * virou dupla — o motor não aplicava nada e a pendência sumia sem ninguém entrar. O organizador via
 * o pedido desaparecer e nada acontecer.
 * ⇒ apaga DEPOIS, e só se TODAS as inscrições da proposta tiverem entrado. */
ok(/res\.assinaturasAplicadas/.test(adCod),
  '④h o adapter devolve QUAIS inscrições realmente entraram');
ok(/assinaturasAplicadas/.test(core), '④h e o core repassa');
const iIntegra = motor.indexOf('const r = integrar(t, {');
const iApaga = motor.indexOf('delete mapa[linha];', iIntegra);
ok(iIntegra > 0 && iApaga > iIntegra,
  '④h ⛔⛔ a pendência é apagada DEPOIS do integrador, não antes');
const iFalta = motor.indexOf('const faltaram =');
ok(iFalta > iIntegra && iFalta < iApaga,
  '④h ⛔ e a conferência de quem entrou vem ANTES do apagar — depois já seria tarde');
ok(/já não está na lista de espera/.test(motor),
  '④h e o erro diz o que aconteceu, em vez de falhar calado');

/* ══════════════════════════════════════════════════════════════════════════════
 * ⑧ A DECISÃO, EXERCIDA DE VERDADE — não lida no texto.
 *
 * ⛔⛔ Pedido do revisor, e ele tem razão: até aqui eu conferia a regra procurando palavras no
 * arquivo da callable. Teste que lê texto dá verde com o comportamento quebrado — já me pegou nesta
 * mesma leva. Por isso a regra saiu da callable e virou função pura do motor: agora ela roda com um
 * torneio na mão, e a callable é só a casca (autenticar, abrir transação, reler, gravar).
 * ⚠️ O `integrar` é injetado, então cada caso abaixo controla o que o motor devolve.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  const core = require(path.join(ROOT, 'functions-autodraw/draw-core.js'));
  const D = core.decidirTardioNaFolga;
  ok(typeof D === 'function', '⑧ a decisão é exportada pelo motor e executável');
  if (typeof D !== 'function') return;

  const montaT = () => ({
    id: 'tx1',
    matches: [
      { id: 'VC-R1-P1', p1: 'A', p2: 'B' },
      { id: 'VC-R1-P2', p1: 'C', p2: 'D' }
    ],
    tardiosPendentesPorLinha: {
      '': {
        linha: '', politica: 'bye', revisaoDaChave: 'r1',
        inscritos: [{ uids: ['shared', 'a'], chaves: ['uid:shared', 'uid:a'], nome: 'shared / a' }],
        confrontosAfetados: [
          { id: 'VC-R1-P1', p1: 'A', p2: 'B' },
          { id: 'VC-R1-P2', p1: 'C', p2: 'D' }
        ]
      }
    }
  });
  const foto = (t) => JSON.stringify(t.matches);

  /* ── caso 1: o motor não aplica (quem foi proposto saiu da espera) ──────── */
  (function () {
    const t = montaT(); const antes = foto(t);
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i',
      integrar: function () { return { ok: true, placed: 0, assinaturasAplicadas: [] }; } });
    ok(r.ok === false && r.codigo === 'failed-precondition',
      '⑧ ⛔⛔ espera sem quem foi proposto ⇒ RECUSA (veio ' + JSON.stringify(r.codigo) + ')');
    ok(/já não está na lista de espera/.test(String(r.mensagem || '')),
      '⑧ e a mensagem diz o que aconteceu');
    ok(!!t.tardiosPendentesPorLinha[''],
      '⑧ ⛔⛔ a pendência CONTINUA LÁ — apagar e não aplicar era o pior dos dois mundos');
    ok(foto(t) === antes, '⑧ e nenhum confronto foi tocado');
  })();

  /* ── caso 2: a dupla da espera tem um membro em comum, mas não é a proposta ─ */
  (function () {
    const t = montaT(); const antes = foto(t);
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i',
      /* o motor recebeu a assinatura certa e nada casou: devolve zero aplicadas */
      integrar: function (tt, o) {
        ok((o.assinaturasDaDecisao || []).join() === 'uid:a|uid:shared',
          '⑧ ⛔ o motor recebe a ASSINATURA da inscrição, não os membros soltos');
        return { ok: true, placed: 0, assinaturasAplicadas: [] };
      } });
    ok(r.ok === false, '⑧ ⛔⛔ dupla com membro em comum não confirma o pedido de outra dupla');
    ok(!!t.tardiosPendentesPorLinha[''] && foto(t) === antes,
      '⑧ e a pendência e a chave ficam intactas');
  })();

  /* ── caso 3: o caminho feliz ────────────────────────────────────────────── */
  (function () {
    const t = montaT();
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i',
      integrar: function () { return { ok: true, placed: 1, assinaturasAplicadas: ['uid:a|uid:shared'] }; } });
    ok(r.ok === true && r.mudou === true,
      '⑧ ⭐ quem foi proposto entrou ⇒ a decisão vale (' + JSON.stringify(r) + ')');
    ok(!t.tardiosPendentesPorLinha[''],
      '⑧ ⛔ e SÓ ENTÃO a pendência é removida');
  })();

  /* ── caso 4: a revisão não bate ─────────────────────────────────────────── */
  (function () {
    const t = montaT(); const antes = foto(t);
    const r = D(t, { linha: '', revisao: 'OUTRA', acao: 'confirmar', agoraIso: 'i',
      integrar: function () { ok(false, '⑧ o motor NÃO devia ser chamado com revisão velha'); return { ok: true }; } });
    ok(r.ok === false && /A chave mudou/.test(String(r.mensagem || '')),
      '⑧ ⛔⛔ revisão velha é recusada ANTES de tocar no motor');
    ok(!!t.tardiosPendentesPorLinha[''] && foto(t) === antes, '⑧ e nada foi alterado');
  })();

  /* ── caso 5: o retrato mudou sem placar (troca de dupla) ────────────────── */
  (function () {
    const t = montaT();
    t.matches[0].p2 = 'OUTRO';                       // trocou sem lançar placar
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i',
      integrar: function () { ok(false, '⑧ o motor NÃO devia rodar com o retrato diferente'); return { ok: true }; } });
    ok(r.ok === false, '⑧ ⛔⛔ troca de dupla SEM placar também barra — era o furo que eu tinha');
    ok(!!t.tardiosPendentesPorLinha[''], '⑧ e a pendência fica');
  })();

  /* ── caso 6: jogo já lançado entre os afetados ──────────────────────────── */
  (function () {
    const t = montaT();
    t.matches[1].winner = 'C';
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i',
      integrar: function () { ok(false, '⑧ o motor NÃO devia rodar com resultado lançado'); return { ok: true }; } });
    ok(r.ok === false && /apagaria resultado/.test(String(r.mensagem || '')),
      '⑧ ⛔⛔ resultado lançado barra o redesenho');
  })();

  /* ── caso 7: arquivar ───────────────────────────────────────────────────── */
  (function () {
    const t = montaT();
    const r = D(t, { linha: '', revisao: 'r1', acao: 'cancelar', agoraIso: 'i' });
    ok(r.ok === true && r.mudou === true, '⑧ arquivar vale e é gravado');
    ok(!t.tardiosPendentesPorLinha[''], '⑧ ⛔ e a pendência sai — decisão que não fica registrada volta amanhã');
  })();

  /* ── caso 8: a pendência sem destino só arquiva ─────────────────────────── */
  (function () {
    const t = { id: 't', matches: [], tardiosPendentesPorLinha: {
      __sem_destino__: { linha: null, semDestino: true, revisaoDaChave: '', inscritos: [{ chaves: ['manual:x'], nome: 'X' }], confrontosAfetados: [] }
    } };
    const nao = D(t, { linha: '__sem_destino__', revisao: '', acao: 'confirmar', agoraIso: 'i' });
    ok(nao.ok === false && /Só é possível arquivá-lo/.test(String(nao.mensagem || '')),
      '⑧ ⛔⛔ sem chave definida NÃO confirma — escolher a linha seria inventar');
    const sim = D(t, { linha: '__sem_destino__', revisao: '', acao: 'cancelar', agoraIso: 'i' });
    ok(sim.ok === true && sim.mudou === true && !t.tardiosPendentesPorLinha.__sem_destino__,
      '⑧ ⭐ mas ARQUIVA sem revisão — é a saída dela, e sem isso ela ficava presa para sempre');
  })();

  /* ── caso 9: pendência que já sumiu não é erro ──────────────────────────── */
  (function () {
    const t = { id: 't', matches: [], tardiosPendentesPorLinha: {} };
    const r = D(t, { linha: '', revisao: 'r1', acao: 'confirmar', agoraIso: 'i' });
    ok(r.ok === true && r.mudou === false,
      '⑧ ⭐ segunda confirmação simultânea: a pendência já saiu ⇒ "nada mudou", sem estourar');
  })();
})();

/* ⑧b E A CALLABLE É SÓ A CASCA — a regra não pode voltar a morar lá dentro. */
ok(/decidirTardioNaFolgaFn\(t, \{/.test(dentro),
  '⑧b ⛔⛔ a porta CHAMA a função do motor');
ok(!/confrontosAfetados/.test(dentro),
  '⑧b ⛔ e não reimplementa a conferência do retrato');
ok(!/assinaturasAplicadas/.test(dentro),
  '⑧b nem a conferência de quem entrou');

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
/* ⛔⛔ CASAMENTO EXATO, não por trecho: numa linha cujo namespace é PREFIXO de outra, o `indexOf`
 * mostrava e decidia a pendência errada — o organizador refaria a chave que não quis. */
ok(/String\(k\) !== String\(_nsDaAba\)/.test(blocoUi),
  '⑤ ⛔⛔ a pendência é casada por IGUALDADE do namespace');
ok(!/indexOf\(String\(bracketKey\)\)/.test(blocoUi),
  '⑤ ⛔ e a comparação por trecho não existe mais');
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
