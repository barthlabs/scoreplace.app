'use strict';
const assert = require('assert/strict');
const H = require('./render-harness');
const W = H.window;

async function main() {
  const t = H.hydrateMonarchGroups(H.buildViaDraw('Liga', 8, {
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true
  }));
  H.simulateRounds(t);
  t.id = 'historic-external-test';
  t.phases = [
    { name: 'Rei/Rainha', kind: 'classification', drawMode: 'rei_rainha', classification: { pairing: { strategy: 'monarch_groups' } } },
    { name: 'Eliminatória', kind: 'elimination' }
  ];
  t.currentPhaseIndex = 1;
  t._phaseMaterialized = 1;
  const docs = [];
  t.rounds.forEach((rd, ri) => (rd.monarchGroups || []).forEach((g, gi) => {
    const group = JSON.parse(JSON.stringify(g));
    group.classifCongelada = (group.players || []).slice().reverse().map(name => ({ name }));
    docs.push({ _loc: { tipo: 'grupos', ri, gi }, grupo: group });
  }));
  assert.ok(docs.length > 0, 'fixture tem grupos');
  t._nGrupos = docs.length;
  t._nPartes = { grupos: docs.length };
  t.rounds.forEach(rd => { rd.monarchGroups = []; });
  const before = JSON.stringify(t);
  const dbBefore = W.FirestoreDB;
  const rerenderBefore = W._rerenderBracket;
  let reads = 0, rerenders = 0, resolveRead;
  const computeBefore = W._computeMonarchStandings;
  const frozenSeen = [];
  W._computeMonarchStandings = function (g, tournament, category) {
    frozenSeen.push((g.classifCongelada || []).map(x => x.name));
    return computeBefore(g, tournament, category);
  };
  W.FirestoreDB = { _tSub(id, name) {
    assert.equal(id, t.id);
    assert.equal(name, 'grupos');
    return { get(opts) {
      assert.equal(opts.source, 'server');
      reads++;
      return new Promise(resolve => { resolveRead = resolve; });
    } };
  } };
  W._rerenderBracket = () => { rerenders++; };
  try {
    W._phasePrevOpen[t.id] = true;
    const loading = W._renderPhase0ReadOnly(t);
    assert.match(loading, /Carregando|Loading/, 'primeiro render aguarda leitura');
    assert.equal(reads, 1);
    W._renderPhase0ReadOnly(t);
    assert.equal(reads, 1, 'render durante leitura não duplica consulta');
    resolveRead({ forEach(fn) { docs.forEach(doc => fn({ data: () => doc })); } });
    await Promise.resolve();
    assert.equal(rerenders, 1, 'resposta aciona re-render');
    const html = W._renderPhase0ReadOnly(t);
    assert.match(html, /data-group-box/, 'exibe grupos reais');
    assert.match(html, /data-monarch-group="1"/, 'grupo Rei\/Rainha identificado para a busca');
    assert.equal(W._grpRotuloCurto('R1 Grupo A2', true), 'A2', 'após Z o grupo usa letra e número');
    assert.equal(W._grpRotuloCurto('R1 Grupo A'), 'R1 (A)', 'outro chamador mantém o rótulo antigo');
    assert.match(html, /<h3[^>]*>A<\/h3>/, 'grupo Rei\/Rainha mostra só a letra, sem R1');
    assert.match(html, /<th[^>]*>Pts<\/th>/, 'exibe pontos na tabela do grupo');
    for (const doc of docs) {
      for (const id of doc.grupo.matchIds) {
        assert.ok(html.includes('id="card-' + id + '"'), 'jogo ' + id + ' aparece com duplas e placar');
      }
    }
    assert.match(html, /data-players="[^"]*J1 \/ J2[^"]*J3 \/ J4/, 'os dois lados da dupla seguem no confronto');
    assert.match(html, />6<\/[^>]+>/, 'placar gravado é mostrado no card histórico');
    const firstRanked = docs[0].grupo.classifCongelada[0].name;
    const firstTable = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    assert.ok(firstTable && firstTable[1].includes(firstRanked), 'tabela usa o retrato de classificação guardado');
    const firstRow = firstTable[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    assert.ok(firstRow && firstRow[1].includes(firstRanked), 'primeiro colocado respeita a ordem congelada: esperado ' + firstRanked + ', visto ' + JSON.stringify(frozenSeen.slice(0, 2)) + ', linha ' + (firstRow && firstRow[1].replace(/<[^>]+>/g, ' ').slice(0, 140)));
    assert.doesNotMatch(html, /Classificação — Rodada 1/, 'não inventa classificação geral');
    assert.equal(JSON.stringify(t), before, 'render não altera torneio, grupos nem resultados');
    const badDocs = JSON.parse(JSON.stringify(docs));
    badDocs[0].grupo.matchIds[0] = 'jogo-inexistente';
    W._retryHistoricalMonarchGroups(t.id);
    assert.match(W._renderPhase0ReadOnly(t), /Carregando|Loading/);
    resolveRead({ forEach(fn) { badDocs.forEach(doc => fn({ data: () => doc })); } });
    await Promise.resolve();
    assert.match(W._renderPhase0ReadOnly(t), /Tentar novamente|Try again/, 'ID ausente não vira tabela inventada');
    assert.equal(JSON.stringify(t), before, 'falha de validação também não altera torneio');
    W._retryHistoricalMonarchGroups(t.id);
    W._renderPhase0ReadOnly(t);
    resolveRead({ forEach(fn) { docs.slice(1).forEach(doc => fn({ data: () => doc })); } });
    await Promise.resolve();
    assert.match(W._renderPhase0ReadOnly(t), /Tentar novamente|Try again/, 'leitura parcial não gera classificação');
    W._retryHistoricalMonarchGroups(t.id);
    W._renderPhase0ReadOnly(t);
    resolveRead({ forEach() { throw new Error('permission-denied'); } });
    await Promise.resolve();
    await Promise.resolve();
    assert.match(W._renderPhase0ReadOnly(t), /Tentar novamente|Try again/, 'erro de permissão é recuperável');
    const legacyDocs = JSON.parse(JSON.stringify(docs));
    delete legacyDocs[0].grupo.matchIds;
    assert.ok(legacyDocs[0].grupo.matches.length, 'fixture legado tem jogos embutidos');
    W._retryHistoricalMonarchGroups(t.id);
    W._renderPhase0ReadOnly(t);
    resolveRead({ forEach(fn) { legacyDocs.forEach(doc => fn({ data: () => doc })); } });
    await Promise.resolve();
    assert.match(W._renderPhase0ReadOnly(t), /data-group-box/, 'grupo legado também aparece sem regravar o torneio');
    assert.equal(JSON.stringify(t), before, 'hidratação de grupo legado ocorre somente na cópia');
    W._togglePhasePrev(t.id);
    assert.equal(W._phasePrevOpen[t.id], false);
    W._togglePhasePrev(t.id);
    W._renderPhase0ReadOnly(t);
    assert.equal(reads, 6, 'reabrir fase faz nova leitura');
  } finally {
    W.FirestoreDB = dbBefore;
    W._computeMonarchStandings = computeBefore;
    W._rerenderBracket = rerenderBefore;
    delete W._phasePrevOpen[t.id];
  }
  console.log('fase-historica-grupos-externos: ok');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
