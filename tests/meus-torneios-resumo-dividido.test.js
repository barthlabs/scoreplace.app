'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
function method(name) {
  const start = src.indexOf('async ' + name + '(');
  if (start < 0) throw new Error('Método ausente: ' + name);
  const end = src.indexOf('\n  },', start + 10);
  if (end < 0) throw new Error('Fim do método ausente: ' + name);
  return src.slice(start, end + 4);
}

const marker = {
  id: 'tour_split', name: 'Torneio dividido', requiresFullRead: true,
  memberUids: ['organizer'], creatorUid: 'organizer', organizerOnly: false
};
const calls = [];
const root = {
  id: 'tour_split', name: 'Torneio dividido', creatorUid: 'organizer',
  memberUids: ['organizer'], isPublic: false, _semPesados: ['matches', 'participants'],
  rounds: [], participants: []
};
const docs = [{ id: marker.id, data: () => ({ ...marker }) }];
const summarySnap = { size: 1, forEach: fn => docs.forEach(fn) };
const db = {
  collection: name => ({
    where: (field, op, uid) => ({
      get: async () => {
        calls.push({ name, field, op, uid });
        return name === 'tournaments_summary' ? summarySnap : { size: 0, forEach() {} };
      }
    })
  })
};

const window = {
  _tSplit: { partesDe: tournament => tournament._semPesados || [] },
  _projectTournamentPhasesForRead: tournament => tournament,
  _mergePlaceholderReservationsIntoRoster: tournament => tournament,
  _hydrateMonarchGroups() {}, _noteFsReads() {}, _marcaResumo() {},
  _warn: (...args) => calls.push({ warning: args })
};
const ctx = { window, console, Promise, Array, Object, Date, String, Number };
vm.createContext(ctx);
const loader = vm.runInContext('({ ' + method('loadMyTournaments') + ', ' +
  method('_loadCompleteTournamentFromServer') + ' })', ctx);
loader.db = db;
loader._tRef = id => ({
  get: async options => {
    calls.push({ rootRead: id, options });
    return { exists: id === root.id, id, data: () => ({ ...root }) };
  }
});
loader._montaDeSubcolecoes = async (id, config, parts) => {
  calls.push({ assemble: [id, config._semPesados, parts] });
  return { ...config, participants: [{ uid: 'organizer' }], rounds: [{ matches: [{ id: 'm1' }] }],
    competitors: 1, matchesTotal: 1, matchesDone: 0 };
};

(async () => {
  let failed = 0;
  const ok = (condition, label) => {
    if (!condition) { failed++; console.error('  ✗ ' + label); }
    else console.log('  ✓ ' + label);
  };
  const result = await loader.loadMyTournaments('organizer', { requireRemote: true });
  const assembled = calls.find(call => call.assemble);
  ok(result.length === 1 && result[0].rounds[0].matches[0].id === 'm1',
    'Meus torneios devolve jogos da subcoleção, não a raiz vazia');
  ok(result[0].participants.length === 1, 'o cartão usa inscrições montadas da parte canônica');
  ok(result[0].matchesTotal === 1 && result[0].matchesDone === 0 && result[0].competitors === 1,
    'o índice marcado não expõe contagens vazias: a lista devolve contagens após hidratar o canônico');
  ok(assembled && assembled.assemble[0] === 'tour_split' &&
    assembled.assemble[1].join(',') === 'matches,participants' &&
    assembled.assemble[2].join(',') === 'matches,participants',
    '_montaDeSubcolecoes recebe (id, config, parts) conforme a assinatura real');
  ok(calls.some(call => call.rootRead === 'tour_split' && call.options.source === 'server'),
    'a raiz é lida do servidor antes de montar as partes');
  ok(calls.filter(call => call.name === 'tournaments_summary').length === 2,
    'continua consultando os índices de membros e árbitros');
  console.log((failed ? '❌' : '✅') + ' meus-torneios-resumo-dividido: ' + (6 - failed) + '/6');
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
