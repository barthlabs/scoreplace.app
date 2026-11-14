'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const window = {};
const context = vm.createContext({ window });
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/next-match.js'), 'utf8'), context);
const next = window.ScoreplaceNextMatch;
for (const placeholder of ['Vencedor do Grupo 9', 'Perdedora do jogo 12',
  'Classificada A1', 'A definir', 'TBD']) {
  assert.equal(next.knownSide(placeholder), false, placeholder + ' não é uma dupla definida');
}
const called = { id: 'court', court: 'Quadra 4', courtCalledAt: '2026-10-23T18:00:00Z',
  p1: 'Ana / Bia', team1Uids: ['ana-uid', 'bia-uid'], p2: 'Caio / Dora', team2Uids: ['caio-uid', 'dora-uid'] };
const busy = { id: 'busy', p1: 'Ana / Eva', team1Uids: ['ana-uid', 'eva-uid'], p2: 'Fabio / Gabi' };
const free = { id: 'free', p1: 'Hugo / Iara', p2: 'Joao / Keli' };
assert.equal(next.firstAvailable([busy, free], [called], {}).id, 'busy',
  'antes de carregar occupancy, a seleção isolada mantém a agenda sem lançar erro');
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/court-occupancy.js'), 'utf8'), context);
assert.equal(next.firstAvailable([busy, free], [called], {}).id, 'free',
  'após carregar occupancy, pula dupla que já disputa outro jogo');
assert.equal(next.firstAvailable([busy, free], [called], { court: 'released' }).id, 'busy',
  'jogo liberado sem placar deixa de bloquear a dupla');
assert.equal(next.firstAvailable([busy], [called], {}), null,
  'não inventa próximo jogo se todas as duplas estão em quadra');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Ana', p1Uid:'outra-ana', p2:'Zoe' }, [called]), false,
  'duas pessoas identificadas com o mesmo nome não se confundem');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Ana / Outra', p2:'Zoe' }, [called]), true,
  'sem UID no próximo jogo, o nome da atleta já identificada em quadra impede a chamada');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Manual / Outra', p2:'Zoe' },
  [{ id:'court2', p1:'Manual / Parceira', p2:'Pedro' }]), true,
  'nomes manuais sem ID bloqueiam a dupla correta');
const activeTie = { phaseTieDecisions:{ '0':{ group:{ matches:[{
  id:'tie-1', court:'Quadra 2', courtCalledAt:'2026-11-13T12:00:00Z',
  p1:{name:'Ana'}, p2:{name:'Bia'}
}] } } } };
assert.equal(next.firstAvailable([{ id:'later', p1:'Ana / Eva', p2:'Caio / Dora' }],
  [], {}, activeTie), null, 'desempate em quadra também impede chamar a mesma atleta');
const identifiedTie = { phaseTieDecisions:{ '0':{ group:{ matches:[{
  id:'tie-uid', court:'Quadra 2', courtCalledAt:'2026-11-13T12:00:00Z',
  p1:{name:'Ana', key:'uid:ana-1'}, p2:{name:'Bia', key:'uid:bia-1'}
}] } } } };
assert.equal(next.firstAvailable([{ id:'other-ana', p1:'Ana', p1Uid:'ana-2', p2:'Zoe' }],
  [], {}, identifiedTie).id, 'other-ana', 'nome igual com UID distinto continua chamável');
assert.equal(next.firstAvailable([{ id:'same-ana', p1:'Ana', p1Uid:'ana-1', p2:'Zoe' }],
  [], {}, identifiedTie), null, 'UID do desempate ainda bloqueia a mesma atleta');
const serverDraw = require('../functions-autodraw/draw-core.js');
assert.equal(serverDraw._window, globalThis, 'o shim do servidor compartilha window com globalThis');
assert.equal(typeof serverDraw._window.ScoreplaceNextMatch.conflictsWithActive, 'function',
  'a callable de quadra recebe a mesma regra de conflito no servidor real');
const backend = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const groupGuardStart = backend.indexOf("if (court && ['call', 'restore'].includes(requestedTieAction.type))");
const groupGuardEnd = backend.indexOf("if (requestedTieAction.type === 'clock')", groupGuardStart);
const titleGuardStart = backend.indexOf("if (['call', 'restore'].includes(action.type))", backend.indexOf('const next = { source:'));
const titleGuardEnd = backend.indexOf("if (action.type === 'clock')", titleGuardStart);
assert(groupGuardStart >= 0 && groupGuardEnd > groupGuardStart &&
  titleGuardStart >= 0 && titleGuardEnd > titleGuardStart,
  'guardas das duas chamadas de desempate localizadas');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const occupancy = require('../js/domain/court-occupancy.js');
const groupGuard = new Function('t', 'target', 'court', 'requestedTieAction', 'drawWindow', '_courtOccupancy', 'HttpsError',
  backend.slice(groupGuardStart, groupGuardEnd) + ' return true;');
const titleGuard = new Function('t', 'match', 'court', 'action', 'drawWindow', '_courtOccupancy', 'HttpsError',
  backend.slice(titleGuardStart, titleGuardEnd) + ' return true;');
const regularAna = { id:'regular-ana', court:'Quadra 1', courtCalledAt:'2026-11-14T12:00:00Z',
  p1:'Ana', p1Uid:'ana-1', p2:'Beatriz', p2Uid:'bia-1' };
const regularTournament = { games:[regularAna] };
const validationWindow = { _collectAllMatches:tournament=>tournament.games,
  ScoreplaceNextMatch:serverDraw._window.ScoreplaceNextMatch };
for (const [label, guard] of [
  ['classificatório', groupGuard, 'requestedTieAction'],
  ['de título', titleGuard, 'action']
]) {
  const tie = { id:'tie-ana', court:'Quadra 2', p1:{ name:'Ana', key:'uid:ana-1' },
    p2:{ name:'Carla', key:'uid:carla-1' } };
  const action = { type:'call' };
  assert.throws(() => guard(regularTournament, tie, 'Quadra 2', action,
    validationWindow, occupancy, HttpsError), /já está em quadra/,
  `desempate ${label} não chama Ana já em jogo regular noutra quadra`);
  assert.equal(tie.courtCalledAt, undefined, `desempate ${label} recusado não registra chamada`);
  const otherAna = { ...tie, id:'tie-other-ana', p1:{ name:'Ana', key:'uid:ana-2' } };
  assert.equal(guard(regularTournament, otherAna, 'Quadra 2', action,
    validationWindow, occupancy, HttpsError), true,
  `desempate ${label} permite Ana distinta com outro UID`);
}
console.log('✓ próximo jogo pula participantes ocupados e respeita identidade');
