/* CHAVE CANÔNICA DA CLASSIFICAÇÃO
 * node tests/classificacao-chave-canonica.test.js
 *
 * A classificação progressiva ainda será migrada em etapas. Esta prova trava a
 * identidade que todos os escritores passarão a usar: a dupla é o conjunto dos
 * dois UIDs, em ordem indiferente; nome é só fallback para quem foi digitado sem
 * conta. Um nome igual jamais fabrica UID nem funde duas pessoas. */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { window: W } = require(path.join(__dirname, 'headless.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── chave canônica da classificação ────');
ok(typeof W._classifEntryKey === 'function', 'a porta única da chave existe');

const ab = W._classifEntryKey('Ana / Bia', ['uBia', 'uAna']);
ok(ab === 'uid:uAna+uBia', 'dupla usa os DOIS UIDs em ordem estável: ' + ab);
ok(W._classifEntryKey('Bia / Ana', ['uAna', 'uBia']) === ab,
  'trocar a ordem visual não cria outra dupla');
ok(W._classifEntryKey('Ana / Carla', ['uAna', 'uCarla']) !== ab,
  'um membro em comum NÃO confunde duas duplas');
ok(W._classifEntryKey('Ana', ['uAna']) !== W._classifEntryKey('Ana', ['uOutraAna']),
  'homônimos com UID continuam entradas distintas');
ok(W._classifEntryKey('Convidada manual', []) === 'manual:Convidada manual',
  'quem foi digitada sem UID tem fallback explícito por rótulo');
ok(W._classifEntryKey('', []) === '', 'sem identidade nem rótulo não vira chave inventada');

// Regressão real: duas duplas podem ter o mesmo rótulo na chave (nome editado, ou
// homônimos), mas não são a mesma entrada. A classificação progressiva precisa chegar
// à final e às semis usando a identidade carregada em cada slot — nunca o texto do time.
const dupla = (id, p1, p2, winner) => Object.assign({ id, p1, p2, winner },
  p1 === 'Ana / Bia' ? { team1Uids: id === 's2' || id === 'f' && p2 === 'Ana / Bia' ? ['uC', 'uD'] : ['uA', 'uB'] } : {},
  p2 === 'Ana / Bia' ? { team2Uids: ['uC', 'uD'] } : {});
const homonimas = {
  format: 'Eliminatórias Simples',
  matches: [
    Object.assign(dupla('s1', 'Ana / Bia', 'Carla / Dani', 'Ana / Bia'), { round: 0, team1Uids: ['uA', 'uB'], team2Uids: ['uE', 'uF'] }),
    Object.assign(dupla('s2', 'Ana / Bia', 'Erika / Fabi', 'Ana / Bia'), { round: 0, team1Uids: ['uC', 'uD'], team2Uids: ['uG', 'uH'] }),
    Object.assign(dupla('f', 'Ana / Bia', 'Ana / Bia', 'Ana / Bia'), { round: 1, team1Uids: ['uA', 'uB'], team2Uids: ['uC', 'uD'] })
  ]
};
W._updateProgressiveClassification(homonimas);
ok(homonimas.classificationEntries['uid:uA+uB'].pos === 1 && homonimas.classificationEntries['uid:uC+uD'].pos === 2,
  'final entre duplas com o mesmo rótulo preserva campeão e vice distintos');
ok(Object.keys(homonimas.classificationEntries).length === 4,
  'as quatro duplas permanecem na classificação canônica, sem fusão por nome');
ok(W._classifRows(homonimas).length === 4,
  'o leitor da classificação prefere as entradas canônicas em vez do mapa legado colidido');
W._congelaLinhasEncerradas(homonimas);
ok(homonimas.classifFinalDaLinha.main.length === 4 && homonimas.classifFinalDaLinha.main[1].uids.join('+') === 'uC+uD',
  'o retrato final congela as duas duplas homônimas pela identidade do slot');

const gruposComHomonimas = {
  format: 'Fase de Grupos + Eliminatórias', gruposClassified: 1,
  matches: [{ id: 'final', round: 1, p1: 'Campeã', p2: 'Vice', winner: 'Campeã', p1Uid: 'uCampeã', p2Uid: 'uVice' }],
  groups: [{
    players: [
      { uid: 'uC', displayName: 'Carla' }, { uid: 'uD', displayName: 'Dora' },
      { uid: 'uAna1', displayName: 'Ana' }, { uid: 'uAna2', displayName: 'Ana' }
    ],
    matches: [
      { p1: 'Carla', p2: 'Ana', p1Uid: 'uC', p2Uid: 'uAna1', winner: 'Carla', scoreP1: 6, scoreP2: 0 },
      { p1: 'Dora', p2: 'Ana', p1Uid: 'uD', p2Uid: 'uAna2', winner: 'Dora', scoreP1: 6, scoreP2: 0 },
      { p1: 'Carla', p2: 'Dora', p1Uid: 'uC', p2Uid: 'uD', winner: 'Carla', scoreP1: 6, scoreP2: 5 },
      { p1: 'Ana', p2: 'Ana', p1Uid: 'uAna1', p2Uid: 'uAna2', winner: 'Ana', scoreP1: 1, scoreP2: 0 }
    ]
  }]
};
W._updateProgressiveClassification(gruposComHomonimas);
ok(gruposComHomonimas.classificationEntries['uid:uAna1'] && gruposComHomonimas.classificationEntries['uid:uAna2'],
  'grupo conserva as duas homônimas não-classificadas como entradas distintas');

// A tela e a ficha não podem voltar a reduzir a classificação progressiva ao mapa
// `nome -> posição`. Carrega a porta real do store no mesmo VM do motor, não uma cópia
// em teste: duas duplas de mesmo rótulo devem continuar com posições próprias.
const store = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const storeIni = store.indexOf('window._classifEntriesFromMatches = function');
const storeFim = store.indexOf('\n// Renderiza um bloco', storeIni);
ok(storeIni >= 0 && storeFim > storeIni, 'a porta progressiva canônica foi localizada no store');
if (storeIni >= 0 && storeFim > storeIni) vm.runInContext(store.slice(storeIni, storeFim), require('./headless.js').sandbox);

const entries = W._classifEntriesFromMatches(homonimas, homonimas.matches);
ok(entries.length === 4 && entries.filter((e) => e.name === 'Ana / Bia').length === 2,
  'a classificação progressiva entrega lista e preserva os dois rótulos iguais');
ok(W._classifIsComplete(homonimas.matches, entries),
  'a completude compara as quatro identidades de slot, não apenas dois textos');
ok(W._placementInTournament(homonimas, 'uC').pos === 2,
  'a ficha encontra o vice pela chave UID mesmo com o rótulo do campeão igual');

console.log(fail ? ('❌ ' + fail + ' falha(s)') : ('✅ ' + pass + ' verificações passaram'));
process.exit(fail ? 1 : 0);
