'use strict';
/* L8.P5 — a marca de hidratação guarda o ESCOPO, e a chave nunca pinta sobre leitura truncada.
 *
 * MEDIDO em 11/set/2026 (produção, read-only): a dashboard puxava 244 documentos de `results`
 * por abertura e 214 eram de UM torneio. Truncar a consulta é fácil; o perigo é a marca — ela
 * valia pro torneio inteiro, ia pro cache e a CHAVE usa a MESMA função. Este gate roda o código
 * REAL (extraído por acorn/fatia de arquivo, nunca cópia) e prova os quatro invariantes.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), acorn = require('acorn');
const root = path.join(__dirname, '..');
function property(file, name) {
  const s = fs.readFileSync(path.join(root, file), 'utf8'); let found;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Property' && n.key && n.key.name === name) found = s.slice(n.start, n.end);
    Object.values(n).forEach((v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  })(acorn.parse(s, { ecmaVersion: 'latest' }));
  assert(found, name); return found;
}
function novaStore(respostas) {
  const lidos = [];
  const window = {
    FirestoreDB: { loadMatchResults(tid, opts) { lidos.push(opts && opts.limit ? opts.limit : null); return Promise.resolve(respostas.shift() || {}); } },
    _collectAllMatches: (t) => t.matches
  };
  const store = vm.runInNewContext('({' + property('js/store.js', 'hydrateMatchResults') + '})', { window });
  store.currentUser = { uid: 'u1' };
  store._saveToCache = () => {};
  store._overlayResultOnMatch = (m, r) => Object.assign(m, r);
  return { store, lidos, window };
}

(async () => {
  // ① completa → parcial: a janela recente NÃO rebaixa a marca e NÃO apaga o que já se sabia.
  {
    const { store, lidos } = novaStore([{ m1: { scoreP1: 6 } }, { m2: { scoreP1: 3 } }]);
    store.tournaments = [{ id: 't', matches: [{ id: 'm1' }, { id: 'm2' }] }];
    assert.equal(await store.hydrateMatchResults('t'), true);
    assert.equal(store.tournaments[0]._resultsHydrated, 'completa');
    assert.equal(await store.hydrateMatchResults('t', { limit: 40 }), true);
    assert.equal(store.tournaments[0]._resultsHydrated, 'completa', '⛔ parcial NUNCA rebaixa completa');
    assert.deepEqual(Object.keys(store.tournaments[0]._results).sort(), ['m1', 'm2'], 'a janela recente ACRESCENTA — não substitui a leitura completa');
    assert.equal(store.tournaments[0].matches[0].scoreP1, 6);
    assert.equal(store.tournaments[0].matches[1].scoreP1, 3);
    assert.deepEqual(lidos, [null, 40], 'sem opts vai a coleção inteira; com limite vai a janela');
  }
  // ② parcial → completa: a verdade inteira ganha e substitui o mapa.
  {
    const { store } = novaStore([{ m2: { scoreP1: 3 } }, { m1: { scoreP1: 6 } }]);
    store.tournaments = [{ id: 't', matches: [{ id: 'm1' }, { id: 'm2' }] }];
    assert.equal(await store.hydrateMatchResults('t', { limit: 40 }), true);
    assert.equal(store.tournaments[0]._resultsHydrated, 'parcial');
    assert.equal(await store.hydrateMatchResults('t'), true);
    assert.equal(store.tournaments[0]._resultsHydrated, 'completa');
    assert.deepEqual(Object.keys(store.tournaments[0]._results), ['m1'], 'a leitura completa é a verdade inteira e substitui');
  }
  // ③ coalescência POR ESCOPO: mesmo pedido é um só; escopos diferentes são dois.
  {
    const { store, lidos } = novaStore([{}, {}]);
    store.tournaments = [{ id: 't', matches: [] }];
    const a = store.hydrateMatchResults('t'), b = store.hydrateMatchResults('t');
    assert.equal(a, b, 'o mesmo escopo coalesce');
    const c = store.hydrateMatchResults('t', { limit: 40 });
    assert.notEqual(a, c, '⛔ parcial e completa NÃO podem se confundir na coalescência');
    await Promise.all([a, c]);
    assert.deepEqual(lidos, [null, 40]);
    assert.deepEqual(Object.keys(store._hydrateResultPromises), [], 'o finally limpa a chave COM escopo — nenhuma sobra');
  }
  // ④ os dois chamadores, no código real: quem pede o quê, e ninguém carimba a marca.
  {
    const dash = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
    const ds = dash.indexOf('  try {\n    _dashMyTournaments.filter'), de = dash.indexOf('\n  /* ⛔ `organizadosCount`', ds);
    const dashCode = dash.slice(ds, de);
    assert(ds >= 0 && de > ds);
    assert(/hydrateMatchResults\(t\.id, \{ limit: 40 \}\)/.test(dashCode), 'a dashboard pede a janela recente');
    assert(!/_resultsHydrated\s*=/.test(dashCode), '⛔ a dashboard NÃO carimba a marca');
    const br = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
    const bs = br.indexOf("  if (t && t._resultsHydrated !== 'completa'"), be = br.indexOf('\n  /* ⛔ PORTÃO', bs);
    const brCode = br.slice(bs, be);
    assert(bs >= 0 && be > bs);
    assert(/hydrateMatchResults\(t\.id\)/.test(brCode), 'a chave pede a coleção inteira');
    assert(!/_resultsHydrated\s*=/.test(brCode), '⛔ a chave NÃO carimba a marca');
  }
  console.log('✅ L8.P5: escopo da hidratação (parcial × completa), merge da janela, coalescência por escopo e os dois chamadores');
})().catch((e) => { console.error(e); process.exitCode = 1; });
