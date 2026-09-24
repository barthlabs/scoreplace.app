'use strict';
/* ⛔⛔ O REPROCESSAMENTO DOS RESUMOS PÚBLICOS — testado no CAMINHO DE VERDADE.
 *
 * O que este teste impede, e que quase aconteceu: a versão anterior da ferramenta entregava o
 * documento RAIZ direto ao `buildSummary`. Em torneio DIVIDIDO os pesados moram em
 * subcoleções, então um `--apply` teria regravado o cartão de todos eles com elenco e
 * progresso ZERADOS — trocando um vazamento de e-mail por um dado mentiroso em produção.
 */
const path = require('path');
const R = require(path.join(__dirname, '..', 'functions-autodraw', 'reprocessar-resumos.js'));
const Split = require(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'tournament-split-core.js'));
const Sum = require(path.join(__dirname, '..', 'functions-autodraw', 'tournament-summary-core.js'));

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── reprocessar resumos públicos ────');

// ── A. caminhos proibidos: por CAMINHO, nunca por aparência ──────────────────
{
  ok(R.caminhosProibidos({ organizerEmail: 'x@y.com' }).length === 1, 'acha organizerEmail');
  ok(R.caminhosProibidos({ polls: [{ votes: { 'a@b.com': 1 } }] }).length === 1,
    'acha o mapa de votos com chave');
  ok(R.caminhosProibidos({ polls: [{ votes: {}, voteCount: 3 }] }).length === 0,
    'mapa vazio com contagem é o formato CERTO, não vazamento');
  ok(R.caminhosProibidos({ name: 'Copa contato@clube.com', memberUids: ['contato@clube.com'] }).length === 0,
    '⛔ "@" LEGÍTIMO em nome ou identidade não é vazamento — reprovar por aparência pararia o conserto');
}

// ── B. TORNEIO DIVIDIDO: monta antes de resumir ──────────────────────────────
{
  /* ⛔ O documento da PARTE não é o inscrito cru: ele é `{ _idx, item, _k }`, e é o `_idx`
   * que devolve a ORDEM na remontagem. Montei a fixture à mão na primeira versão e o elenco
   * voltou VAZIO — o mesmo silêncio que teria zerado o cartão em produção. Agora a fixture
   * sai da própria função que divide, para não haver duas ideias do formato. */
  const inscritosCrus = [];
  for (let i = 1; i <= 7; i++) inscritosCrus.push({ uid: 'u' + i, displayName: 'P' + i });
  const inscritos = Split.dividir(JSON.parse(JSON.stringify(
    { id: 'div', participants: inscritosCrus }))).participants;
  const raiz = { id: 'div', name: 'Dividido', isPublic: true, organizerEmail: 'org@x.com',
    _semPesados: ['participants'], status: 'active' };
  const lidas = [];
  const portas = {
    apply: true,
    lerRaiz: async () => raiz,
    lerResumo: async () => ({ organizerEmail: 'org@x.com', participantsCount: 7 }),
    /* ⛔ `montarDoBanco` chama `lerColecao(NOME_DA_COLECAO, campo)` — a coleção de
     * `participants` se chama `inscritos`. Na primeira versão eu casei pelo primeiro
     * argumento e recebi lista vazia: o mesmo silêncio que zeraria o cartão. */
    lerColecao: async (colecao, campo) => { lidas.push(colecao + '/' + campo); return campo === 'participants' ? inscritos : []; },
    montar: (r, ler) => Split.montarDoBanco(JSON.parse(JSON.stringify(r)), ler),
    construir: (t, id) => Sum.buildSummary(t, id, {}),
    gravar: async (id, novo) => { portas._gravado = novo; },
    apagar: async () => { throw new Error('não deveria apagar'); }
  };
  return (async () => {
    const r = await R.reprocessarUm('div', portas);
    ok(r.acao === 'gravado', 'torneio dividido é reprocessado');
    ok(lidas.length > 0, 'as subcoleções foram LIDAS — não se resume o documento magro');
    const novo = portas._gravado || {};
    ok(novo.organizerEmail === undefined, 'e o e-mail saiu do resumo');
    ok(novo.participantsCount === 7,
      '⛔ REGRESSÃO: o elenco continua 7, não zerado — era isto que o --apply antigo quebraria (deu ' + novo.participantsCount + ')');
    return seguir();
  })().then((c) => c);
}

function seguir() {
  // ── C. já limpo: não grava nada ────────────────────────────────────────────
  return (async () => {
    let gravou = false;
    const r = await R.reprocessarUm('ok1', {
      apply: true,
      lerRaiz: async () => ({ id: 'ok1', name: 'Limpo' }),
      lerResumo: async () => ({ polls: [{ votes: {}, voteCount: 0 }] }),
      lerColecao: async () => [],
      montar: async (x) => x, construir: () => ({}),
      gravar: async () => { gravou = true; }, apagar: async () => { gravou = true; }
    });
    ok(r.acao === 'limpo' && !gravou, 'resumo já limpo não é reescrito à toa');

    // ── D. ÓRFÃO: apaga, não ignora ──────────────────────────────────────────
    let apagou = null;
    const orf = await R.reprocessarUm('orf', {
      apply: true,
      lerRaiz: async () => null,
      lerResumo: async () => ({ organizerEmail: 'sobrou@x.com' }),
      lerColecao: async () => [],
      montar: async (x) => x, construir: () => ({}),
      gravar: async () => { throw new Error('não deveria gravar'); },
      apagar: async (id) => { apagou = id; }
    });
    ok(orf.acao === 'apagado' && apagou === 'orf' && orf.orfao === true,
      '⛔ resumo órfão é APAGADO — ignorado, guardaria o e-mail para sempre');

    // ── E. montagem falhou: aborta SEM gravar ────────────────────────────────
    let gravouF = false;
    const falhou = await R.reprocessarUm('bad', {
      apply: true,
      lerRaiz: async () => ({ id: 'bad', _semPesados: ['participants'] }),
      lerResumo: async () => ({ organizerEmail: 'x@y.com' }),
      lerColecao: async () => { throw new Error('rede caiu'); },
      montar: (r, ler) => Split.montarDoBanco(JSON.parse(JSON.stringify(r)), ler),
      construir: (t, id) => Sum.buildSummary(t, id, {}),
      gravar: async () => { gravouF = true; }, apagar: async () => {}
    });
    ok(falhou.acao === 'abortado' && !gravouF,
      '⛔ se a montagem falha, NÃO grava — resumo velho e verdadeiro vence resumo novo e vazio');

    // ── F. seco não escreve ──────────────────────────────────────────────────
    let gravouS = false;
    const seco = await R.reprocessarUm('seco', {
      apply: false,
      lerRaiz: async () => ({ id: 'seco', name: 'X', isPublic: true, organizerEmail: 'a@b.com' }),
      lerResumo: async () => ({ organizerEmail: 'a@b.com' }),
      lerColecao: async () => [],
      montar: async (x) => x, construir: (t, id) => Sum.buildSummary(t, id, {}),
      gravar: async () => { gravouS = true; }, apagar: async () => { gravouS = true; }
    });
    ok(seco.acao === 'gravado' && !gravouS, 'em modo SECO ele conta, mas não escreve');

    // ── G. o ponto de entrada não roda ao ser importado ──────────────────────
    const fonte = require('fs').readFileSync(
      path.join(__dirname, '..', 'functions-autodraw', 'reprocessar-resumos.js'), 'utf8');
    ok(/if \(require\.main === module\)/.test(fonte),
      '⛔ o executável fica atrás de require.main — senão importar no teste rodaria contra a base');
    ok(fonte.lastIndexOf("require('firebase-admin')") > fonte.indexOf('require.main === module'),
      'e o admin só é carregado lá dentro, para o teste não precisar dele');
    ok(/runTransaction/.test(fonte) && /montarDoBanco/.test(fonte),
      'a execução real usa transação e a porta canônica de montagem');

    console.log(fail ? `❌ reprocessar-resumos: ${fail} falha(s), ${pass} ok`
                     : `✅ reprocessar-resumos: ${pass} ok`);
    process.exit(fail ? 1 : 0);
  })();
}
