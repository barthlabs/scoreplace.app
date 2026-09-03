/* O MAPA DE PERFIS É POR INVOCAÇÃO, NÃO GLOBAL (leva 2.2)
 *
 * ⛔ O DEFEITO QUE ISTO IMPEDE, e ele é grave: `_profileNameByUid` era um global do módulo.
 * Uma instância de Cloud Function atende VÁRIAS invocações, e o Node intercala promessas —
 * então a invocação do torneio A escrevia o mapa, cedia o controle num `await`, a do torneio
 * B sobrescrevia o mesmo global, e quando A voltava resolvia os uids **com os nomes de B**.
 * O resultado é o pior tipo de bug: nomes trocados entre torneios, sem erro nenhum, e
 * impossível de reproduzir sozinho — só aparece sob concorrência, que é exatamente o que
 * não acontece no teste de uma coisa de cada vez.
 *
 * A saída é AsyncLocalStorage: cada invocação roda dentro do seu próprio `run()`, e a
 * leitura (`_spMapaDeNomes`) enxerga o store do SEU contexto, não o do vizinho.
 *
 * ⚠️ Este teste FORÇA a intercalação com `await` no meio de cada contexto. Sem esse `await`
 * ele passaria mesmo com o global — seria verde e não provaria nada.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
/* require que resolve a partir de functions-autodraw/, senão os `./vendor/...` de
 * dentro do draw-core apontam para tests/ e o módulo nem carrega. */
const reqCF = require('node:module').createRequire(path.join(__dirname, '..', 'functions-autodraw', 'x.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o mapa de perfis é isolado por invocação ────');

/* Carregado do MESMO jeito que a Cloud Function carrega — `require`, não sandbox.
 * O draw-core monta o próprio `window` (`globalThis.window = globalThis`) e puxa os vendors;
 * emular isso à mão daria um ambiente que não é o do servidor, e um teste que não é o teste. */
require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
const g = globalThis;

ok(typeof g.window._spRodaComNomes === 'function', '① _spRodaComNomes existe');
ok(typeof g.window._spMapaDeNomes === 'function', '① _spMapaDeNomes existe');
ok(typeof g.window._spMapaDePerfis === 'function', '① _spMapaDePerfis existe');

const respira = () => new Promise((r) => setTimeout(r, 0));

/* uma "invocação": escreve o mapa, CEDE O CONTROLE, e só então lê. É no meio do await que o
 * vizinho corre — com global, é aqui que ele estraga tudo. */
function invocacao(rotulo, uid, nome) {
  return g.window._spRodaComNomes(
    { [uid]: nome },
    { [uid]: { displayName: nome, phone: '+55' + uid } },
    async () => {
      await respira();
      const lidoNome = g.window._nameForUid(uid);
      await respira();
      const perfis = g.window._spMapaDePerfis();
      await respira();
      return { rotulo, esperado: nome, lidoNome, temPerfil: !!(perfis && perfis[uid]),
               telefone: (perfis && perfis[uid] && perfis[uid].phone) || null };
    }
  );
}

(async () => {
  /* ⑤ invocações simultâneas, cada uma com um mapa DIFERENTE, todas intercaladas */
  const N = 12;
  const alvos = [];
  for (let i = 0; i < N; i++) alvos.push(invocacao('inv' + i, 'u' + i, 'Atleta ' + i));
  const r = await Promise.all(alvos);

  const trocados = r.filter((x) => x.lidoNome !== x.esperado);
  ok(trocados.length === 0,
     '② ⭐ ' + N + ' invocações simultâneas: cada uma leu o SEU nome (' +
     (trocados.length ? 'trocaram: ' + trocados.map((t) => t.rotulo + ' leu "' + t.lidoNome + '"').join(', ') : 'nenhuma troca') + ')');
  ok(r.every((x) => x.temPerfil), '② e cada uma enxergou o SEU mapa de perfis');
  ok(r.every((x, i) => x.telefone === '+55u' + i), '② ⭐ inclusive o telefone — o perfil inteiro, não só o nome');

  /* ③ FORA de qualquer contexto, cai no global antigo — chamador que não migrou não quebra */
  g.window._profileNameByUid = { legado: 'Nome Legado' };
  ok(g.window._nameForUid('legado') === 'Nome Legado',
     '③ ⭐ fora do contexto, o global antigo ainda responde (compatibilidade)');

  /* ④ e um contexto NÃO vaza para fora depois de terminar */
  await g.window._spRodaComNomes({ efemero: 'Some' }, {}, async () => { await respira(); });
  ok(g.window._nameForUid('efemero') === '', '④ terminado o contexto, o mapa dele sumiu');

  /* ⑤ aninhado: o de dentro manda, e o de fora volta intacto depois */
  const aninhado = await g.window._spRodaComNomes({ a: 'Externo' }, {}, async () => {
    const antes = g.window._nameForUid('a');
    const dentro = await g.window._spRodaComNomes({ a: 'Interno' }, {}, async () => {
      await respira(); return g.window._nameForUid('a');
    });
    await respira();
    return { antes, dentro, depois: g.window._nameForUid('a') };
  });
  ok(aninhado.antes === 'Externo' && aninhado.dentro === 'Interno' && aninhado.depois === 'Externo',
     '⑤ contexto aninhado não contamina o de fora');

  /* ⑥ o vendor está em dia — o servidor roda ESTE draw-core */
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'), 'utf8');
  ok(/AsyncLocalStorage/.test(fonte) && /_alsNomes\.run\(/.test(fonte),
     '⑥ o isolamento está no arquivo que a CF carrega');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
  const semComentario = idx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const leiturasCruas = (semComentario.match(/\b(?:window|global|g)\._profByUid\b/g) || []).length;
  ok(leiturasCruas === 0,
     '⑥ ⭐ index.js não lê mais `_profByUid` global direto (achei ' + leiturasCruas + ') — usa a porta _spMapaDePerfis');

  console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
  process.exit(fail ? 1 : 0);
})();
