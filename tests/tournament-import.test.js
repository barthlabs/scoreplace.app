'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../functions/tournament-import-core');
const registration = require('../functions/registration-core');
const mutations = require('../functions/registration-mutations-core');
const boundary = require('../functions/canonical-registration-boundary-core');
const parser = require('../js/views/tournaments-import-parser');
const allocation = require('../js/views/tournaments-import-allocation');
const XLSX = require('../js/vendor/xlsx.full.min.js');
const vm = require('vm');
const privacyView = fs.readFileSync(path.join(__dirname, '..', 'js/views/privacy.js'), 'utf8');
assert(privacyView.includes("_t('privacy.section2Body')"), 'a política mostra a seção de tratamento');
for (const language of ['pt', 'en']) {
  const dictionary = fs.readFileSync(path.join(__dirname, '..', 'js/i18n-' + language + '.js'), 'utf8');
  assert(/'privacy\.section2Body':[^\n]*Google Cloud Vision/.test(dictionary),
    'a política ' + language + ' deve divulgar o processamento das fotos pelo Google Cloud Vision');
}

function fixture() {
  const tournament = { id: 'test-import', canonicalRegistrationMigration: { fingerprint: 'materialized-test', registrationCount: 4 } };
  const registrations = [1, 2, 3, 4].map((number) => {
    const manualParticipantId = 'slot-' + number;
    const participantKey = registration.participantKey({ manualParticipantId });
    return { registrationId: registration.registrationId(participantKey, 'cat-light'), tournamentId: tournament.id,
      categoryId: 'cat-light', participantKey, participantKind: 'manual', participantUid: null,
      manualParticipantId, manualDisplayName: 'Jogador ' + String(number).padStart(2, '0'),
      status: 'confirmed', validationState: 'approved', fixedPairId: null };
  });
  [0, 2].forEach((start) => {
    const pairId = mutations.canonicalPairId(tournament.id, 'cat-light', registrations.slice(start, start + 2).map((item) => item.registrationId));
    registrations[start].fixedPairId = pairId; registrations[start + 1].fixedPairId = pairId;
  });
  return { tournament, registrations };
}
const { tournament, registrations } = fixture();
const slots = core.slots(registrations);
assert.strictEqual(slots.length, 2);
assert.notStrictEqual(core.fingerprint(tournament, registrations), core.fingerprint(tournament, registrations.slice(0, 2)));
const block = [{ pairId: slots[0].pairId, categoryId: 'cat-light', people: [
  { name: 'Ana Souza', uid: null }, { name: 'Bia Lima', uid: 'account-bia' },
] }];
const result = core.applyReviewedBlock(tournament, registrations, block);
assert(result.updates.some((item) => item.manualDisplayName === 'Ana Souza' && item.manualParticipantId));
assert(result.creates.some((item) => item.participantUid === 'account-bia'));
const final = boundary.applyChanges(tournament, registrations, result.updates, result.creates);
assert.strictEqual(final.registrations.length, 5);
assert.strictEqual(core.slots(final.registrations).length, 1);
assert.strictEqual(final.registrations.find((item) => item.registrationId === slots[0].members[0].registrationId).manualDisplayName, 'Ana Souza');
assert.throws(() => core.applyReviewedBlock(tournament, registrations, [{ ...block[0], people: [
  { name: 'Ana Souza', uid: null }, { name: 'Ana Souza', uid: null },
] }]), /repetidos/);
const moved = core.applyReviewedBlock(tournament, registrations, [{ ...block[0], categoryId: 'fem-light' }]);
const movedRoster = boundary.applyChanges(tournament, registrations, moved.updates, moved.creates).registrations;
assert.strictEqual(movedRoster.filter((item) => item.status === 'confirmed').length, 4);
assert.strictEqual(movedRoster.filter((item) => item.categoryId === 'fem-light' && item.status === 'confirmed').length, 2);
assert.strictEqual(movedRoster.filter((item) => item.categoryId === 'cat-light' && item.status === 'confirmed').length, 2);
assert.strictEqual(movedRoster.filter((item) => item.categoryId === 'cat-light' && item.status === 'withdrawn').length, 2);
assert(movedRoster.some((item) => item.categoryId === 'fem-light' && item.participantUid === 'account-bia'));
assert.throws(() => core.applyReviewedBlock(tournament, registrations, [{ ...block[0], people: [
  { name: 'Ana Souza', uid: 'same' }, { name: 'Bia Lima', uid: 'same' },
] }]), /repetida/);
assert.strictEqual(core.payloadHash(block), core.payloadHash(JSON.parse(JSON.stringify(block))));
assert.notStrictEqual(core.payloadHash(block), core.payloadHash([{ ...block[0], people: [
  { name: 'Ana Outra', uid: null }, { name: 'Bia Lima', uid: 'account-bia' },
] }]));
const receiptNames = core.receiptNames(block);
assert.strictEqual(receiptNames.length, 2);
assert.deepStrictEqual(receiptNames.map((item) => item.side), [0, 1]);
function noNestedArrays(value, insideArray) {
  if (Array.isArray(value)) return !insideArray && value.every((item) => noNestedArrays(item, true));
  return !value || typeof value !== 'object' || Object.values(value).every((item) => noNestedArrays(item, false));
}
assert(noNestedArrays({ names: receiptNames, pairs: [{ pairId: block[0].pairId }] }, false),
  'Firestore não aceita arrays diretamente dentro de outros arrays');
assert.strictEqual(receiptNames[1].uid, 'account-bia');

// Neon: 6 duplas vindas de Masc Light e 2 de Masc Extreme passam a Fem Light.
// A quantidade de pessoas não muda; a vaga de origem não fica ativa em paralelo.
const neon = { id: 'neon-test', canonicalRegistrationMigration: { fingerprint: 'neon-test', registrationCount: 16 } };
const neonRegistrations = [];
for (let pair = 0; pair < 8; pair++) {
  const sourceCategory = pair < 6 ? 'masc-light' : 'masc-extreme';
  const members = [0, 1].map((side) => {
    const number = pair * 2 + side + 1;
    const manualParticipantId = 'neon-slot-' + number;
    const participantKey = registration.participantKey({ manualParticipantId });
    return { registrationId: registration.registrationId(participantKey, sourceCategory), tournamentId: neon.id,
      categoryId: sourceCategory, participantKey, participantKind: 'manual', participantUid: null,
      manualParticipantId, manualDisplayName: 'Jogador ' + String(number).padStart(2, '0'),
      status: 'confirmed', validationState: 'approved', fixedPairId: null };
  });
  const pairId = mutations.canonicalPairId(neon.id, sourceCategory, members.map((item) => item.registrationId));
  members.forEach((item) => { item.fixedPairId = pairId; neonRegistrations.push(item); });
}
const neonBlock = core.slots(neonRegistrations).map((slot, pair) => ({
  pairId: slot.pairId, categoryId: 'fem-light', people: [
    { name: 'Atleta ' + (pair * 2 + 1), uid: null },
    { name: 'Atleta ' + (pair * 2 + 2), uid: null },
  ],
}));
const neonChanges = core.applyReviewedBlock(neon, neonRegistrations, neonBlock);
const neonFinal = boundary.applyChanges(neon, neonRegistrations, neonChanges.updates, neonChanges.creates).registrations;
assert.strictEqual(neonFinal.filter((item) => item.status === 'confirmed').length, 16);
assert.strictEqual(neonFinal.filter((item) => item.status === 'confirmed' && item.categoryId === 'fem-light').length, 16);
assert.strictEqual(neonFinal.filter((item) => item.status === 'confirmed' && item.categoryId !== 'fem-light').length, 0);
assert.strictEqual(new Set(neonFinal.filter((item) => item.status === 'confirmed').map((item) => item.fixedPairId)).size, 8);

// A redistribuição posterior de duplas Masc Light para Masc Power usa a mesma
// operação canônica: os dois integrantes se movem juntos, sem duplicar inscritos.
const maleLight = fixture();
const maleSlot = core.slots(maleLight.registrations)[0];
const maleMove = core.applyReviewedBlock(maleLight.tournament, maleLight.registrations, [{
  pairId: maleSlot.pairId, categoryId: 'masc-power', people: [
    { name: 'Carlos Silva', uid: null }, { name: 'Daniel Costa', uid: null },
  ],
}]);
const maleFinal = boundary.applyChanges(maleLight.tournament, maleLight.registrations,
  maleMove.updates, maleMove.creates).registrations;
assert.strictEqual(maleFinal.filter((item) => item.status === 'confirmed').length, 4);
assert.strictEqual(maleFinal.filter((item) => item.status === 'confirmed' && item.categoryId === 'masc-power').length, 2);
assert.strictEqual(maleFinal.filter((item) => item.status === 'confirmed' && item.categoryId === 'cat-light').length, 2);
assert.strictEqual(new Set(maleFinal.filter((item) => item.status === 'confirmed' && item.categoryId === 'masc-power')
  .map((item) => item.fixedPairId)).size, 1);
const filledMale = maleFinal.find((item) => item.status === 'confirmed' && item.categoryId === 'cat-light');
const filledMove = mutations.reclassify(maleLight.tournament.id, maleFinal,
  { manualParticipantId: filledMale.manualParticipantId }, 'cat-light', 'masc-power');
const filledFinal = boundary.applyChanges({ ...maleLight.tournament,
  canonicalRegistrationMigration: { ...maleLight.tournament.canonicalRegistrationMigration, registrationCount: maleFinal.length },
}, maleFinal, filledMove.updates, filledMove.creates).registrations;
assert.strictEqual(filledFinal.filter((item) => item.status === 'confirmed').length, 4);
assert.strictEqual(filledFinal.filter((item) => item.status === 'confirmed' && item.categoryId === 'masc-power').length, 4);

const cats = [{ id: 'fem-light', label: 'Fem Light' }, { id: 'masc-light', label: 'Masc Light' }];
assert.strictEqual(parser.categoryFor('LIGHT FEMININO', cats), 'fem-light');
assert.strictEqual(parser.parsePhotoText('LIGHT FEMININO\n1. Ana Souza + Bia Lima', cats).rows[0].people[0].name, 'Ana Souza');
assert.strictEqual(parser.parsePhotoText('LIGHT FEMININO\n9. Ana Souza + Bia Lima', cats).rows[0].ordinal, 9);
assert.strictEqual(parser.parseMatrix([['Categoria', 'Pessoa 1', 'Pessoa 2'], ['Fem Light', 'Ana Souza', 'Bia Lima']], cats).rows.length, 1);
for (const format of ['csv', 'txt', 'xls', 'xlsx']) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Categoria', 'Pessoa 1', 'Pessoa 2'], ['Fem Light', 'Ana Souza', 'Bia Lima'],
  ]), 'Inscritos');
  const bytes = XLSX.write(book, { bookType: format, type: 'buffer' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const matrix = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], { header: 1, raw: false, blankrows: false });
  const rows = parser.parseMatrix(matrix, cats).rows;
  assert.strictEqual(rows.length, 1, `${format}: uma dupla`);
  assert.strictEqual(rows[0].categoryId, 'fem-light', `${format}: categoria`);
assert.deepStrictEqual(rows[0].people.map((person) => person.name), ['Ana Souza', 'Bia Lima'], `${format}: nomes`);
}
const view = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-import.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'css/components.css'), 'utf8');
const firstSlot = { pairId: 'z', categoryId: 'fem-light', members: [
  { registrationId: 'a', name: 'Jogador 02' }, { registrationId: 'z', name: 'Jogador 01' },
] };
const secondSlot = { pairId: 'a', categoryId: 'fem-light', members: [
  { registrationId: 'b', name: 'Jogador 04' }, { registrationId: 'c', name: 'Jogador 03' },
] };
const otherSlot = { pairId: 'b', categoryId: 'masc-light', members: [
  { registrationId: 'd', name: 'Jogador 05' }, { registrationId: 'e', name: 'Jogador 06' },
] };
const photoRows = [{ categoryId: 'fem-light', people: [{ name: 'Ana' }, { name: 'Bia' }] },
  { categoryId: 'fem-light', people: [{ name: 'Cris' }, { name: 'Dora' }] }];
const planned = allocation.allocate(photoRows, [otherSlot, secondSlot, firstSlot]);
assert.deepStrictEqual(planned.map((entry) => entry.slot && entry.slot.pairId), ['z', 'a'],
  'a primeira dupla da foto usa o primeiro placeholder da categoria, independentemente da ordem interna');
assert.deepStrictEqual(allocation.peopleForBackend(photoRows[0], firstSlot).map((person) => person.name), ['Bia', 'Ana'],
  'ID interno invertido não inverte a associação visual Jogador 01 → primeira pessoa da foto');
assert.strictEqual(allocation.allocate([{ categoryId: 'fem-light', people: [] }, ...photoRows], [firstSlot, secondSlot, otherSlot])[2].error,
  'Não há outra dupla-placeholder nesta categoria.', 'não invade vaga de outra categoria');
assert.strictEqual(allocation.allocate([{ categoryId: '', people: [] }], [firstSlot])[0].slot, null);
assert.strictEqual(allocation.allocate([photoRows[1]], [firstSlot, secondSlot])[0].slot.pairId, 'z',
  'remover uma linha libera a primeira vaga para a próxima');
const longBatch = Array.from({ length: 9 }, (_, index) => ({ people: [{ uid: index === 0 ? 'dup' : null },
  { uid: index === 8 ? 'dup' : null }] }));
assert.strictEqual(allocation.repeatedUid(longBatch), 'dup', 'UID repetido entre blocos de 8 é detectado antes de qualquer gravação');
assert(view.includes("window._callCF('applyTournamentImportBlock'"), 'gravação usa o transporte autenticado canônico');
assert(!view.includes('firebase.functions().httpsCallable('), 'importação não usa transporte compat sem token');
assert(view.includes('class="sp-import-panel"') && view.includes("box.className = 'sp-import-dialog'"), 'painel e overlay usam os estilos próprios');
assert(view.includes('id="tournament-import-title"') && view.includes("box.setAttribute('aria-labelledby', 'tournament-import-title')"), 'diálogo anuncia seu título');
assert(/id="tournament-import-files" class="sr-only"[^>]*>\s*' \+\s*'<label class="sp-import-upload" for="tournament-import-files"/.test(view), 'seletor de arquivos invisível visualmente conserva foco e label associado');
assert(view.includes('Fotos são enviadas ao Google Cloud Vision somente após sua confirmação.'), 'divulgação de OCR permanece visível antes do envio');
assert(view.includes("window.confirm('Enviar a foto"), 'cada foto continua exigindo consentimento');
assert(!view.includes('data-act="add-row"') && !view.includes('data-act="category"') && !view.includes('data-act="slot"'),
  'organizador não escolhe vaga ou categoria final neste fluxo');
assert(view.includes('data-act="save"') && view.includes('data-act="none"'), 'decisão humana e gravação continuam disponíveis');
assert(view.includes('state.page = 0;') && view.includes('discoverCandidates(imported)'), 'prévia abre na primeira dupla e consulta contas');
assert(view.includes('person.lookupToken !== token') && view.includes('person.lookupStatus = \'error\''),
  'resposta obsoleta é descartada e falha de busca não vira ausência de conta');
assert(view.includes('repeatedUid(state.rows)') && view.indexOf('repeatedUid(state.rows)') < view.indexOf('window.confirm(\'Gravar '),
  'UID duplicado em toda a importação é barrado antes da primeira gravação');
assert(view.includes('if (!state.rows[index] || state.rows[index].saved) return;'), 'linha gravada não pode ser removida');
assert(view.includes('entry.plan.slot.categoryId'), 'a categoria enviada é sempre a categoria da vaga mapeada');
assert(styles.includes('.sp-import-person-match') && styles.includes('background: #d9fbe8'), 'candidato provável é identificado em verde');
assert(styles.includes('.sp-import-person {') && styles.includes('background: #fff'), 'sem candidato provável permanece branco');
assert(view.includes("state.busy || !state.rows.some(function (r) { return !r.saved; }) ? ' disabled'"), 'gravação segue desativada sem duplas pendentes');
assert(!view.includes('style=') && !view.includes('style.cssText'), 'nenhum estilo inline atropela o tema');
assert(styles.includes('#tournament-import-dialog.sp-import-dialog') && styles.includes('z-index: 10100'), 'overlay mantém sua camada no CSS');
assert(styles.includes('background: var(--bg-card)') && styles.includes('color: var(--text-main)'), 'fundo e texto do painel seguem o tema juntos');
assert(styles.includes('#tournament-import-files:focus-visible + .sp-import-upload'), 'seletor de arquivo conserva foco visível');
console.log('✓ importação assistida: pares, UID/nenhum, slots, hash, parser');

async function testVisibleFlow() {
  const listeners = {};
  let dialog;
  let resolveOldLookup;
  const applied = [];
  const document = {
    getElementById(id) { return id === 'tournament-import-dialog' ? dialog : null; },
    createElement() { return { setAttribute() {}, contains() { return true; }, remove() { dialog = null; } }; },
    body: { appendChild(node) { dialog = node; } },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  class FileReaderMock {
    readAsDataURL() { this.result = 'data:image/png;base64,aGVsbG8='; this.onload(); }
  }
  const preview = { count: 6, fingerprint: 'a'.repeat(64), photoImportEnabled: true,
    categories: cats, slots: [otherSlot, secondSlot, firstSlot] };
  const app = {
    TournamentImportParser: parser, TournamentImportAllocation: allocation,
    _findTournamentById() { return { categoryDefinitions: cats }; },
    confirm() { return true; },
    _callCF(name, data) {
      if (name === 'previewTournamentImport') return Promise.resolve({ data: preview });
      if (name === 'extractTournamentImportImage') return Promise.resolve({ data: {
        text: 'LIGHT FEMININO\n1. Ana Souza + Bia Lima\n2. Carla Souza + Dora Lima\nLIGHT MASCULINO\n1. Eduardo Lima + Fabio Souza',
      } });
      if (name === 'searchTournamentImportCandidates' && data.query === 'Gina Antiga') {
        return new Promise((resolve) => { resolveOldLookup = resolve; });
      }
      if (name === 'searchTournamentImportCandidates') return Promise.resolve({ data: {
        candidates: data.query === 'Ana Souza' ? [{ uid: 'uid-ana', name: 'Ana Souza' }] : [],
      } });
      if (name === 'applyTournamentImportBlock') {
        applied.push(data.block);
        return Promise.resolve({ data: { fingerprint: 'b'.repeat(64), count: 6 } });
      }
      throw Error('chamada inesperada: ' + name);
    },
  };
  vm.runInNewContext(view, { window: app, document, FileReader: FileReaderMock,
    crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789abc' },
    Uint8Array, Set, Map, console });
  await app._openTournamentImport('fixture');
  listeners.change({ target: { id: 'tournament-import-files', files: [
    { name: 'foto.png', type: 'image/png', size: 100 },
  ] } });
  for (let i = 0; i < 20 && !dialog.innerHTML.includes('Conta provável'); i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert(dialog.innerHTML.includes('Conta provável'), 'conta candidata aparece na prévia');
  assert(dialog.innerHTML.includes('sp-import-person-match'), 'conta candidata recebe o card verde');
  assert(dialog.innerHTML.indexOf('Ana Souza') < dialog.innerHTML.indexOf('Carla Souza') &&
    dialog.innerHTML.indexOf('Carla Souza') < dialog.innerHTML.indexOf('Eduardo Lima'), 'cards seguem a ordem da foto');
  assert(!dialog.innerHTML.includes('Categoria final') && !dialog.innerHTML.includes('Escolha a dupla-placeholder'),
    'prévia não pede escolhas redundantes');
  const editName = (name) => listeners.change({ target: { dataset: { act: 'name', row: '0', side: '1' }, value: name } });
  editName('Gina Antiga');
  editName('Bia Lima');
  resolveOldLookup({ data: { candidates: [{ uid: 'uid-gina', name: 'Gina Antiga' }] } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(!dialog.innerHTML.includes('uid-gina') && !dialog.innerHTML.includes('Gina Antiga'),
    'resposta de busca antiga não reaparece após corrigir o nome');
  const click = (act, row, side, candidate, token) => listeners.click({ target: {
    closest: () => ({ dataset: { act, row: String(row), side: String(side), candidate: String(candidate), token: String(token) } }),
  } });
  const token = dialog.innerHTML.match(/data-act="choose"[^>]*data-token="(\d+)"/)[1];
  click('choose', 0, 0, 0, token);
  for (const [row, side] of [[0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]) click('none', row, side);
  click('save', 0, 0);
  for (let i = 0; i < 20 && !applied.length; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(applied.length, 1, 'bloco foi enviado uma única vez');
  assert.deepStrictEqual(Array.from(applied[0], (row) => row.pairId), ['z', 'a', 'b'], 'mapeamento usa a ordem da foto por categoria');
  assert.deepStrictEqual(Array.from(applied[0][0].people, (person) => person.name), ['Bia Lima', 'Ana Souza'],
    'payload respeita a ordem interna do backend sem trocar a posição visual');
  assert.strictEqual(applied[0][0].people[1].uid, 'uid-ana', 'vínculo foi resultado de clique humano, nunca da busca');
  console.log('✓ prévia real: ordem da foto, cards, candidato verde e payload canônico');
}
testVisibleFlow().catch((error) => { console.error(error); process.exitCode = 1; });
