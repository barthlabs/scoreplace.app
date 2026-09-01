/* A CONGELADA MANDA NO AVANÇO, NÃO SÓ NA TELA  (CONFRA.P1)
 * node tests/congelada-manda-no-avanco.test.js
 *
 * ⛔ A FALHA QUE ESTE TESTE REPRODUZ — Confra, Grupo D, medida no sandbox em 01/set/2026:
 * a 2.1.2 consertou a fronteira do RENDER ([[tests/congelada-viaja-ate-o-render.test.js]]):
 * `classifCongelada` passou a viajar até quem ordena, e a TELA passou a mostrar a ordem
 * publicada. O AVANÇO ficou de fora. Ele montava o mesmo objeto sintético que o render
 * montava antes —
 *     _computeMonarchStandings({ players: g.players, matches: ms }, t, cat)
 * — e o retrato ficava pra trás outra vez. Resultado medido: a tela dizia Fernando 3º e
 * Vivian 4º, e o avanço, recalculando, jogava Fernando pra baixo de quem não jogou. A Prata
 * que devia ser Fernando+Vivian não se formou: a Vivian subiu pra Ouro com o Jogador X (que
 * estava em 5º e não pontua) e o Fernando ficou SOZINHO na Prata.
 *
 * ⭐ A LIÇÃO, que é o motivo deste arquivo existir separado do outro: consertar UM chamador
 * não conserta a fronteira. Eram duas portas lendo a mesma verdade, e só uma foi fechada.
 * Por isso o bloco ⑨ afirma por FONTE que o avanço não tem outro caminho — é a asserção que
 * pega a próxima regressão, não as funcionais.  [[feedback_unify_dual_entry_points]]
 *
 * REGRA DO DONO (01/set/2026), palavra por palavra no que decide os casos daqui:
 *   • classificam SOMENTE 1º a 4º de cada grupo congelado; 5º pra baixo não avança —
 *     atleta de verdade, Jogador X ou W.O., a régua é a MESMA (a posição, não o tipo);
 *   • o Jogador X PODE avançar se estiver numa das quatro: a vaga é CORINGA, forma dupla e
 *     é substituída depois. ⛔ não se filtra por `ligaGhosts`;
 *   • Performance pareia 1º+2º e 3º+4º; Equilíbrio pareia 1º+4º e 2º+3º;
 *   • a congelada legada, sem `classifCongeladaAt`, vale igual e NÃO é regravada.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
// ⚠️ o phases-engine lê `window._computeMonarchStandings` em runtime; no browser e no vendor
// da CF é o MESMO global do bracket-logic. Aqui o `require` roda fora do vm do harness, então
// é preciso apontar o window do processo pro sandbox — senão o teste mede um cenário que não
// existe em lugar nenhum. Mesma nota de tests/classificacao-uma-regra-so.test.js.
global.window = W;
const E = require('../js/views/phases-engine.js');

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };
const nomes = (st) => (st || []).map((l) => l.name).join(' · ');
const linha = (byDest, dest) => (byDest[dest] || []).map((tm) => tm.name).join('  |  ');

/* ── AS CONFIGURAÇÕES DE FASE ANTERIOR (é delas que a condição do legado é lida) ─────
 * ⛔ "ter grupos Rei/Rainha" não basta. O que autoriza reinterpretar `rankTo:999` é a fase
 * anterior ser Rei/Rainha DE RODADA ÚNICA — e isso só a configuração diz. Estes objetos têm
 * a forma que `format2.compileToPhases` grava em `t.phases[]` (reiRainha + rounds). */
const FASE_RR_UNICA = { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga',
  reiRainha: true, drawMode: 'rei_rainha', rounds: 1, groupsBy: 'sorteio' };
const FASE_RR_MULTI = Object.assign({}, FASE_RR_UNICA, { rounds: 3 });
const FASE_GRUPOS = { name: 'Fase de Grupos', formatCode: 'grupos_mata', format: 'Fase de Grupos',
  reiRainha: false, drawMode: 'sorteio', rounds: 1 };
// classifica passando a condição CALCULADA pela função real do motor — nunca um booleano
// escrito à mão no teste.
function classificar(grupos, cfg, computeStandings, faseAnterior) {
  return E.selectQualifiers(grupos, cfg, {
    computeStandings: computeStandings,
    prevRRRodadaUnica: E.ehReiRainhaRodadaUnica(faseAnterior || FASE_RR_UNICA)
  });
}

/* ── ① O CENÁRIO REAL DO GRUPO D ─────────────────────────────────────────────────────
 * Mesmo dado do teste do render: Fernando joga os três e perde os três (saldo −6); Vivian
 * não joga nenhum (saldo 0); Jogador X é o coringa que cobriu a vaga. A congelada é a que o
 * dono mandou por print: Rostanda, Zilda, Fernando, Vivian, Jogador X. */
const U = { rost: 'uid-rostanda', zilda: 'uid-zilda', fer: 'uid-fernando', viv: 'uid-vivian' };
const jogo = (p1, p2, t1, t1u, t2, t2u, s1, s2, win) => ({
  id: 'm' + p1 + p2, p1, p2, team1: t1, team1Uids: t1u, team2: t2, team2Uids: t2u,
  scoreP1: s1, scoreP2: s2, winner: win, resultAt: 1, isMonarch: true,
  sets: [{ gamesP1: s1, gamesP2: s2 }],
});
const matchesD = [
  jogo('Zilda / Fernando', 'Rostanda / Jogador X', ['Zilda', 'Fernando'], [U.zilda, U.fer],
       ['Rostanda', 'Jogador X'], [U.rost, null], 3, 6, 'Rostanda / Jogador X'),
  jogo('Zilda / Rostanda', 'Fernando / Jogador X', ['Zilda', 'Rostanda'], [U.zilda, U.rost],
       ['Fernando', 'Jogador X'], [U.fer, null], 6, 4, 'Zilda / Rostanda'),
  jogo('Zilda / Jogador X', 'Fernando / Rostanda', ['Zilda', 'Jogador X'], [U.zilda, null],
       ['Fernando', 'Rostanda'], [U.fer, U.rost], 6, 5, 'Zilda / Jogador X'),
];
const CONGELADA_D = [
  { name: 'Rostanda', uid: U.rost }, { name: 'Zilda', uid: U.zilda },
  { name: 'Fernando', uid: U.fer }, { name: 'Vivian', uid: U.viv },
  { name: 'Jogador X', uid: null },
];
// ⛔ a congelada do Grupo D é LEGADA: nasceu sem `classifCongeladaAt`. Vale igual.
const grupoD = (cong) => ({
  name: 'Grupo D', matches: matchesD,
  players: ['Zilda', 'Fernando', 'Rostanda', 'Jogador X', 'Vivian'],
  playersUids: [U.zilda, U.fer, U.rost, null, U.viv],
  classifCongelada: cong || CONGELADA_D,
});
const T = { ligaGhosts: ['Jogador X'] };
const TB = { tiebreakers: T.tiebreakers, birthByName: {} };
// ⭐ A PORTA REAL — a mesma expressão que `advanceMultiPhase` monta. Não é um stub que já
// devolve a congelada: ela CALCULA, e o retrato só manda porque a porta o transporta.
const cs = (g) => E.standingsDaFaseAnterior(g, T, TB, true);

console.log('──── ① a divergência existe (senão o teste não prova nada) ────');
{
  const semRetrato = W._computeMonarchStandings(
    { players: grupoD().players, playersUids: grupoD().playersUids, matches: matchesD }, T, null);
  console.log('    recálculo ao vivo: ' + nomes(semRetrato));
  ok('⭐ ao vivo, quem NÃO jogou passa na frente de quem jogou e perdeu',
    nomes(semRetrato).indexOf('Vivian') < nomes(semRetrato).indexOf('Fernando'),
    'se não divergirem, o cenário não reproduz o defeito');
  ok('  → e o Fernando cairia pra 5º, FORA do corte', nomes(semRetrato).split(' · ').indexOf('Fernando') >= 4,
    'obtido: ' + nomes(semRetrato));
}

console.log('──── ② a porta real do avanço devolve a ordem CONGELADA ────');
{
  const st = cs(grupoD());
  console.log('    pela porta: ' + nomes(st));
  ok('⭐⭐ sai exatamente a congelada publicada',
    nomes(st) === 'Rostanda · Zilda · Fernando · Vivian · Jogador X', 'obtido: ' + nomes(st));
  ok('  → e ela vale mesmo sem `classifCongeladaAt` (congelada legada)',
    grupoD().classifCongeladaAt === undefined);
}

/* ── ③ O CASO OBRIGATÓRIO: Grupo D, Performance ──────────────────────────────────────
 * Segundo grupo limpo (4 atletas, sem coringa) só pra a fase ter duas equipes por linha —
 * uma linha com uma equipe só não vira chave. */
const grupoC = {
  name: 'Grupo C', matches: [], players: ['C1', 'C2', 'C3', 'C4'],
  playersUids: ['uc1', 'uc2', 'uc3', 'uc4'],
  classifCongelada: [{ name: 'C1', uid: 'uc1' }, { name: 'C2', uid: 'uc2' },
                     { name: 'C3', uid: 'uc3' }, { name: 'C4', uid: 'uc4' }],
};
const cfgConfra = (estrategia, mapping) => ({
  name: 'Ouro/Prata', formatCode: 'elim_dupla', fixedPairs: true,
  pairingStrategy: estrategia || 'top',
  source: { type: 'previous_phase', byGroupRank: true, scope: 'per_group',
            rankingBasis: 'individual', mapping: mapping || [
              { dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
              { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }] },
});

/* ── ②bis O CONTROLE: a porta ANTIGA reproduz o relato do dono ───────────────────────
 * ⛔ Sem este bloco o teste provaria só que o código novo faz o certo — não que o velho
 * fazia o errado. A porta de `ab81228c` está copiada aqui palavra por palavra (era
 * phases-engine.js:2048-2058). Rodada com o MESMO dado, ela devolve exatamente o que o dono
 * relatou em 01/set: _"a vivian deveria ser prata com fernando e ela esta na ouro com
 * jogador x"_ e _"fernando esta na prata sozinho"_.
 * ⭐ E o contraste isola a CAUSA: as duas rodadas usam o mesmo mapping e a mesma estratégia.
 * O que muda é só o que chega na função de classificação. */
console.log('──── ②bis a porta antiga reproduz o defeito relatado ────');
{
  const portaAntiga = (g) => {
    const ms = (g.matches || []).concat((g.rounds || []).reduce((a, r) => a.concat(r.matches || []), []));
    // ⬇️ o objeto SINTÉTICO: sem classifCongelada, sem uids. Era este o defeito.
    return W._computeMonarchStandings({ players: g.players || [], matches: ms }, T, g.category || null);
  };
  const ordem = nomes(portaAntiga(grupoD()));
  ok('⭐ a porta antiga recalcula e IGNORA o retrato publicado',
    ordem !== 'Rostanda · Zilda · Fernando · Vivian · Jogador X', 'obtido: ' + ordem);
  const cfgUmGrupo = cfgConfra('top');
  const bV = classificar([grupoD()], cfgUmGrupo, portaAntiga);
  const timesV = [].concat(bV.upper || [], bV.lower || []);
  const nomesV = timesV.map((x) => x.name);
  console.log('    com a porta antiga → ' + nomesV.join('  |  '));
  ok('⭐⭐ com a porta antiga o Fernando some do lugar dele (sozinho ou cortado)',
    !nomesV.some((n) => /Fernando \/ Vivian|Vivian \/ Fernando/.test(n)),
    'obtido: ' + nomesV.join(' | ') + ' — se a dupla certa aparecer, o controle não controla nada');
  const bN = classificar([grupoD()], cfgUmGrupo, cs);
  const nomesN = [].concat(bN.upper || [], bN.lower || []).map((x) => x.name);
  console.log('    com a porta nova  → ' + nomesN.join('  |  '));
  ok('⭐⭐ com a porta nova, no MESMO mapping e MESMA estratégia, a dupla certa se forma',
    nomesN.some((n) => n === 'Fernando / Vivian'), 'obtido: ' + nomesN.join(' | '));
  ok('  → ou seja: a causa era a PORTA, não a configuração (as duas rodadas só diferem nela)',
    JSON.stringify(nomesV) !== JSON.stringify(nomesN));
}

console.log('──── ③ Grupo D + Performance: Ouro 1º+2º, Prata 3º+4º, o 5º fica ────');
{
  const byDest = classificar([grupoD(), grupoC], cfgConfra('top'), cs);
  console.log('    Ouro : ' + linha(byDest, 'upper'));
  console.log('    Prata: ' + linha(byDest, 'lower'));
  ok('⭐⭐ Ouro tem a dupla Rostanda / Zilda', /Rostanda \/ Zilda/.test(linha(byDest, 'upper')),
    'obtido: ' + linha(byDest, 'upper'));
  ok('⭐⭐ Prata tem a dupla Fernando / Vivian', /Fernando \/ Vivian/.test(linha(byDest, 'lower')),
    'obtido: ' + linha(byDest, 'lower'));
  const todos = linha(byDest, 'upper') + ' ' + linha(byDest, 'lower');
  ok('⭐ o Jogador X, em 5º, NÃO avança', !/Jogador X/.test(todos), 'obtido: ' + todos);
  ok('  → e o Fernando não ficou sozinho: ninguém tem dupla de um só',
    [].concat(byDest.upper || [], byDest.lower || []).every((tm) => (tm.participants || []).length === 2),
    'obtido: ' + JSON.stringify([].concat(byDest.upper || [], byDest.lower || []).map((t2) => t2.name)));
}

console.log('──── ④ mesma congelada, Equilíbrio: 1º+4º e 2º+3º ────');
{
  const byDest = classificar([grupoD(), grupoC], cfgConfra('balanced'), cs);
  console.log('    Ouro : ' + linha(byDest, 'upper'));
  console.log('    Prata: ' + linha(byDest, 'lower'));
  ok('⭐⭐ Ouro pareia 1º+4º (Rostanda / Vivian)', /Rostanda \/ Vivian/.test(linha(byDest, 'upper')),
    'obtido: ' + linha(byDest, 'upper'));
  ok('⭐⭐ Prata pareia 2º+3º (Zilda / Fernando)', /Zilda \/ Fernando/.test(linha(byDest, 'lower')),
    'obtido: ' + linha(byDest, 'lower'));
  ok('  → e o 5º segue fora', !/Jogador X/.test(linha(byDest, 'upper') + linha(byDest, 'lower')));
}

/* ── ⑤ A VAGA CORINGA: a POSIÇÃO decide, nunca o tipo ────────────────────────────────
 * Trocando só a ORDEM da congelada, o mesmo Jogador X passa a avançar. É a prova de que
 * ninguém está filtrando `ligaGhosts` — o que decide é estar entre 1º e 4º. */
console.log('──── ⑤ Jogador X em 2º e em 4º AVANÇA; em 5º não ────');
{
  const em2 = [{ name: 'Rostanda', uid: U.rost }, { name: 'Jogador X', uid: null },
               { name: 'Zilda', uid: U.zilda }, { name: 'Fernando', uid: U.fer },
               { name: 'Vivian', uid: U.viv }];
  const b2 = classificar([grupoD(em2), grupoC], cfgConfra('top'), cs);
  ok('⭐⭐ X em 2º avança e forma dupla com o 1º', /Rostanda \/ Jogador X/.test(linha(b2, 'upper')),
    'obtido: ' + linha(b2, 'upper'));
  const em4 = [{ name: 'Rostanda', uid: U.rost }, { name: 'Zilda', uid: U.zilda },
               { name: 'Fernando', uid: U.fer }, { name: 'Jogador X', uid: null },
               { name: 'Vivian', uid: U.viv }];
  const b4 = classificar([grupoD(em4), grupoC], cfgConfra('top'), cs);
  ok('⭐⭐ X em 4º avança e forma dupla com o 3º', /Fernando \/ Jogador X/.test(linha(b4, 'lower')),
    'obtido: ' + linha(b4, 'lower'));
  ok('  → e a Vivian, agora em 5º, é quem fica de fora',
    !/Vivian/.test(linha(b4, 'upper') + linha(b4, 'lower')));
}

console.log('──── ⑥ em 5º ninguém avança: atleta, W.O. ou coringa ────');
{
  // atleta de verdade em 5º (a congelada original: Jogador X em 5º já cobre o coringa)
  const b = classificar([grupoD(), grupoC], cfgConfra('top'), cs);
  const todos = linha(b, 'upper') + ' ' + linha(b, 'lower');
  ok('  → coringa em 5º fica de fora', !/Jogador X/.test(todos));
  const atleta5 = [{ name: 'Rostanda', uid: U.rost }, { name: 'Zilda', uid: U.zilda },
                   { name: 'Jogador X', uid: null }, { name: 'Fernando', uid: U.fer },
                   { name: 'Vivian', uid: U.viv }];
  const bA = classificar([grupoD(atleta5), grupoC], cfgConfra('top'), cs);
  ok('⭐ atleta de verdade em 5º NÃO avança (a Vivian, aqui)',
    !/Vivian/.test(linha(bA, 'upper') + linha(bA, 'lower')),
    'obtido: ' + linha(bA, 'upper') + ' | ' + linha(bA, 'lower'));
  // W.O. em 5º — mesma régua; o marcador de W.O. não muda nada, a posição sim
  const gWO = grupoD([{ name: 'Rostanda', uid: U.rost }, { name: 'Zilda', uid: U.zilda },
                      { name: 'Jogador X', uid: null }, { name: 'Fernando', uid: U.fer },
                      { name: 'Vivian', uid: U.viv, wo: true }]);
  const bW = classificar([gWO, grupoC], cfgConfra('top'), cs);
  ok('⭐ W.O. em 5º NÃO avança — e é pela POSIÇÃO, não por ser W.O.',
    !/Vivian/.test(linha(bW, 'upper') + linha(bW, 'lower')),
    'obtido: ' + linha(bW, 'upper') + ' | ' + linha(bW, 'lower'));
}

console.log('──── ⑦ toda dupla tem DOIS slots distintos ────');
{
  ['top', 'balanced'].forEach((estr) => {
    const b = classificar([grupoD(), grupoC], cfgConfra(estr), cs);
    const times = [].concat(b.upper || [], b.lower || []);
    ok('  → ' + estr + ': nenhuma dupla de um slot só',
      times.every((tm) => (tm.participants || []).length === 2),
      'obtido: ' + JSON.stringify(times.map((t2) => (t2.participants || []).length)));
    ok('  → ' + estr + ': nenhum slot repetido dentro da dupla',
      times.every((tm) => {
        const p = tm.participants || [];
        const ka = (p[0] || {}).uid || (p[0] || {}).name, kb = (p[1] || {}).uid || (p[1] || {}).name;
        return ka && kb && ka !== kb;
      }));
    const vistos = {};
    let repetido = false;
    times.forEach((tm) => (tm.participants || []).forEach((p) => {
      const k = p.uid || p.name; if (vistos[k]) repetido = true; vistos[k] = 1;
    }));
    ok('  → ' + estr + ': ninguém aparece em duas duplas', !repetido);
  });
}

/* ── ⑦bis PROMOVER LINHA move a DUPLA inteira, e só depois de ela existir ────────────
 * Promoção é PARIDADE (linha ímpar = alguém sem adversário), não formação de dupla. Ela
 * roda DEPOIS do pareamento e empurra a ENTRADA inteira — nunca um indivíduo, nunca
 * refazendo pares. Ver [[project_promote_line_before_pow2]]. */
console.log('──── ⑦bis promover linha move a dupla inteira ────');
{
  const grupoB = {
    name: 'Grupo B', matches: [], players: ['B1', 'B2', 'B3', 'B4'], playersUids: ['ub1', 'ub2', 'ub3', 'ub4'],
    classifCongelada: [{ name: 'B1', uid: 'ub1' }, { name: 'B2', uid: 'ub2' },
                       { name: 'B3', uid: 'ub3' }, { name: 'B4', uid: 'ub4' }],
  };
  const grupos = [grupoD(), grupoC, grupoB];
  const semProm = classificar(grupos, cfgConfra('top'), cs);
  const cfgProm = Object.assign({}, cfgConfra('top'), { _promoteLines: 1 });
  const comProm = classificar(grupos, cfgProm, cs);
  ok('  → sem promover: 3 equipes por linha (uma linha ímpar — é o que a promoção resolve)',
    (semProm.upper || []).length === 3 && (semProm.lower || []).length === 3,
    'obtido ' + (semProm.upper || []).length + '/' + (semProm.lower || []).length);
  ok('⭐⭐ promovendo 1: a Ouro fica com 4 e a Prata com 2 — linhas PARES',
    (comProm.upper || []).length === 4 && (comProm.lower || []).length === 2,
    'obtido ' + (comProm.upper || []).length + '/' + (comProm.lower || []).length);
  ok('⭐⭐ tudo que subiu continua sendo DUPLA (ninguém foi promovido sozinho)',
    [].concat(comProm.upper || [], comProm.lower || []).every((tm) => (tm.participants || []).length === 2),
    'obtido: ' + JSON.stringify([].concat(comProm.upper || [], comProm.lower || []).map((x) => x.name)));
  const paresAntes = [].concat(semProm.upper || [], semProm.lower || []).map((x) => x.name).sort();
  const paresDepois = [].concat(comProm.upper || [], comProm.lower || []).map((x) => x.name).sort();
  ok('⭐⭐ a promoção NÃO refez nenhum par — o conjunto de duplas é o mesmo, só mudou de linha',
    JSON.stringify(paresAntes) === JSON.stringify(paresDepois),
    'antes: ' + paresAntes.join(' | ') + '\n      depois: ' + paresDepois.join(' | '));
  ok('  → e quem subiu foi a MELHOR dupla da Prata (a primeira da linha de baixo)',
    (comProm.upper || [])[3] && (comProm.upper || [])[3].name === ((semProm.lower || [])[0] || {}).name,
    'subiu: ' + (((comProm.upper || [])[3] || {}).name) + ' — esperava ' + (((semProm.lower || [])[0] || {}).name));
  ok('  → e o 5º do Grupo D segue fora mesmo com promoção',
    !/Jogador X/.test(paresDepois.join(' ')));
}

console.log('──── ⑧ o avanço LÊ a congelada e não escreve nela ────');
{
  const g = grupoD();
  const antes = JSON.stringify(g.classifCongelada);
  cs(g);
  classificar([g, grupoC], cfgConfra('top'), cs);
  ok('⭐⭐ a congelada segue byte a byte igual depois do avanço',
    JSON.stringify(g.classifCongelada) === antes,
    'antes: ' + antes + '\n      depois: ' + JSON.stringify(g.classifCongelada));
  ok('  → e nenhum `classifCongeladaAt` foi inventado no caminho (nada de backfill)',
    g.classifCongeladaAt === undefined);
}

/* ── ⑨ A REINTERPRETAÇÃO DO LEGADO É ESTREITA ────────────────────────────────────────
 * ⛔ O RISCO que este bloco trava: "todos avançam" é escolha legítima em quase todo formato.
 * O que não existe é "todos avançam" quando a fase seguinte FORMA DUPLAS em duas linhas a
 * partir de um grupo ímpar — aí sobra gente sem par, que é como o Fernando ficou sozinho.
 * A leitura nova só vale com as QUATRO condições juntas; faltando qualquer uma, o mapping
 * passa intocado e TODO MUNDO avança, como sempre. */
console.log('──── ⑨ o legado da Confra vira top-4, e SÓ ele ────');
{
  // ① o arranjo legado: Rei/Rainha antes + forma duplas + 2 linhas + faixas "1..999"
  const b = classificar([grupoD(), grupoC], cfgConfra('top'), cs);
  const qtd = (b.upper || []).length + (b.lower || []).length;
  ok('⭐⭐ `rankTo:999` no arranjo legado da Confra classifica top-4 (2 duplas por grupo)',
    qtd === 4, 'obtido ' + qtd + ' equipes — top-4 de 2 grupos são 4 duplas');
  ok('  → e o 5º do grupo de 5 ficou de fora', !/Jogador X/.test(linha(b, 'upper') + linha(b, 'lower')));

  // ② fase anterior NÃO é Rei/Rainha → nada é reinterpretado
  const grupoComum = {
    name: 'Grupo A', matches: [{ id: 'x', winner: 'A1' }],   // sem isMonarch
    standings: [{ name: 'A1', uid: 'ua1' }, { name: 'A2', uid: 'ua2' }, { name: 'A3', uid: 'ua3' },
                { name: 'A4', uid: 'ua4' }, { name: 'A5', uid: 'ua5' }, { name: 'A6', uid: 'ua6' }],
  };
  const csDireto = (g) => g.standings || [];
  const b2 = classificar([grupoComum], cfgConfra('top'), csDireto, FASE_GRUPOS);
  const nomes2 = linha(b2, 'upper') + ' ' + linha(b2, 'lower');
  ok('⭐⭐ fase anterior comum (sem Rei/Rainha): `999` segue sendo TODOS — os 6 avançam',
    ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].every((n) => nomes2.indexOf(n) >= 0),
    'obtido: ' + nomes2);

  // ③ Rei/Rainha antes, mas a fase NÃO forma duplas → nada é reinterpretado
  const cfgInd = cfgConfra('top');
  const b3 = classificar([grupoD(), grupoC], Object.assign({}, cfgInd, { fixedPairs: false }), cs);
  const n3 = (b3.upper || []).length + (b3.lower || []).length;
  ok('⭐⭐ Rei/Rainha + fase INDIVIDUAL: `999` segue sendo TODOS — os 9 avançam',
    n3 === 9, 'obtido ' + n3 + ' (5 do Grupo D + 4 do C)');

  // ④ Rei/Rainha + duplas, mas UMA linha só → nada a separar, nada é reinterpretado
  const umaLinha = cfgConfra('top', [{ dest: 'main', rankFrom: 1, rankTo: 999, label: 'Única' }]);
  const b4 = classificar([grupoD(), grupoC], umaLinha, cs);
  const slots4 = (b4.main || []).reduce((a, tm) => a + (tm.participants || []).length, 0);
  ok('⭐⭐ Rei/Rainha + duplas + UMA linha: `999` segue sendo TODOS — os 9 entram no pool',
    slots4 === 9, 'obtido ' + slots4 + ' slots');

  // ③bis REI/RAINHA DE VÁRIAS RODADAS: é Rei/Rainha, é dupla, são 2 linhas, as faixas são
  // 1..999 — e mesmo assim NÃO se reinterpreta. Só rodada única é o arranjo legado.
  ok('⭐⭐ a condição é lida da CONFIG: rodada única sim, várias rodadas não',
    E.ehReiRainhaRodadaUnica(FASE_RR_UNICA) === true && E.ehReiRainhaRodadaUnica(FASE_RR_MULTI) === false,
    'única=' + E.ehReiRainhaRodadaUnica(FASE_RR_UNICA) + ' multi=' + E.ehReiRainhaRodadaUnica(FASE_RR_MULTI));
  ok('  → e fase de grupos comum também não é Rei/Rainha de rodada única',
    E.ehReiRainhaRodadaUnica(FASE_GRUPOS) === false);
  ok('  → nem uma config ausente (na dúvida, não reinterpreta)',
    E.ehReiRainhaRodadaUnica(null) === false && E.ehReiRainhaRodadaUnica(undefined) === false);
  const bMulti = classificar([grupoD(), grupoC], cfgConfra('top'), cs, FASE_RR_MULTI);
  const slotsMulti = [].concat(bMulti.upper || [], bMulti.lower || [])
    .reduce((a, tm) => a + (tm.participants || []).length, 0);
  ok('⭐⭐ Rei/Rainha de VÁRIAS rodadas: `999` segue sendo TODOS — os 9 avançam',
    slotsMulti === 9, 'obtido ' + slotsMulti + ' slots (5 do Grupo D + 4 do C)');
  ok('  → e o Jogador X, que em rodada única ficaria de fora, avança aqui',
    /Jogador X/.test(linha(bMulti, 'upper') + linha(bMulti, 'lower')),
    'obtido: ' + linha(bMulti, 'upper') + ' | ' + linha(bMulti, 'lower'));

  // ③ter SEM NINGUÉM PASSAR A CONDIÇÃO: o padrão é NÃO reinterpretar. Protege todo chamador
  // que não conhece a fase anterior — inclusive os de fora do motor.
  const bSemFlag = E.selectQualifiers([grupoD(), grupoC], cfgConfra('top'), { computeStandings: cs });
  const slotsSemFlag = [].concat(bSemFlag.upper || [], bSemFlag.lower || [])
    .reduce((a, tm) => a + (tm.participants || []).length, 0);
  ok('⭐⭐ sem a condição informada, NADA é reinterpretado (padrão seguro)',
    slotsSemFlag === 9, 'obtido ' + slotsSemFlag + ' slots');

  // ⑤ faixa de verdade (1-2 / 3-4) não é tocada — ela já diz o que quer
  const explicito = cfgConfra('top', [{ dest: 'upper', rankFrom: 1, rankTo: 2 },
                                      { dest: 'lower', rankFrom: 3, rankTo: 4 }]);
  const b5 = classificar([grupoD(), grupoC], explicito, cs);
  ok('  → mapping explícito 1-2 / 3-4 dá o MESMO resultado do legado reinterpretado',
    /Rostanda \/ Zilda/.test(linha(b5, 'upper')) && /Fernando \/ Vivian/.test(linha(b5, 'lower')),
    'obtido: ' + linha(b5, 'upper') + ' | ' + linha(b5, 'lower'));
}

/* ── ⑩ A FRONTEIRA: o avanço não pode ter outro caminho ──────────────────────────────
 * ⛔ ESTA é a asserção que pega a regressão. As funcionais acima passariam mesmo com o bug
 * em produção se o `advanceMultiPhase` chamasse outra coisa — foi exatamente o que
 * aconteceu entre a 2.1.2 e a 2.1.82: o render consertado, o avanço não. */
console.log('──── ⑩ por fonte: o avanço usa a porta, e a porta transporta tudo ────');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
  const i = src.indexOf('function standingsDaFaseAnterior');
  const j = src.indexOf('\n  }', i);
  const porta = src.slice(i, j);
  ok('⭐ a porta transporta a congelada', /classifCongelada/.test(porta));
  ok('  → e a IDENTIDADE junto (uid e slot — nome não é identidade)',
    /playersUids/.test(porta) && /playersSlotIds/.test(porta));
  ok('  → e os jogos das duas formas (g.matches e g.rounds[].matches)',
    /g\.matches/.test(porta) && /g\.rounds/.test(porta));
  const chamadas = src.split('_computeMonarchStandings(').slice(1);
  ok('⭐ achei os chamadores de _computeMonarchStandings em phases-engine.js', chamadas.length >= 1,
    'achei ' + chamadas.length);
  /* ⚠️ A RÉGUA CERTA é "ninguém monta objeto SINTÉTICO", não "a palavra aparece depois da
   * chamada". A porta monta `entrada` ANTES de chamar — procurar `classifCongelada` na
   * janela DEPOIS do parêntese reprovava a própria porta corrigida. O que não pode voltar é
   * o literal inline `{ players: … }`, que foi a forma exata do defeito nas duas vezes. */
  let sinteticos = 0;
  chamadas.forEach((trecho, k) => {
    const arg = trecho.slice(0, 200);
    if (/^\s*\{/.test(arg) && !/classifCongelada/.test(arg)) {
      sinteticos++; console.log('      ▸ chamador #' + (k + 1) + ' monta objeto INLINE sem a congelada');
    }
  });
  ok('⭐⭐ nenhum chamador monta objeto sintético inline (o retrato não fica pra trás)', sinteticos === 0,
    sinteticos + ' chamador(es) deixam o retrato pra trás — é o defeito de 01/set voltando');
  ok('  → e a única chamada do motor é a da porta (uma porta só)', chamadas.length === 1,
    'achei ' + chamadas.length + ' — se passou de uma, alguém abriu um caminho paralelo');
  const av = src.slice(src.indexOf('function advanceMultiPhase'));
  ok('⭐⭐ `advanceMultiPhase` usa a porta extraída, não uma cópia local',
    /standingsDaFaseAnterior\(/.test(av.slice(0, 4000)));
}

console.log(falhas === 0 ? '\n✅ congelada-manda-no-avanco: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
