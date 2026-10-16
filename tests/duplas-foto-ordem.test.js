// A ordem das fotos é a ordem de inscrição; a projeção pode embaralhar o array.
// Render e numeração devem concordar, sem regravar o torneio.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox: W } = require('./render-harness');

function pair(a, b, n1, n2, extra) {
  return Object.assign({ p1Name: a, p2Name: b, p1ManualId: 'm' + n1,
    p2ManualId: 'm' + n2, p1Seq: n1, p2Seq: n2, category: 'Fem Light' }, extra);
}
function tournament(parts, extra) {
  return Object.assign({ id: 'foto', teamSize: 2, enrollmentMode: 'teams',
    canonicalRegistrationMigration: { fingerprint: 'foto' }, participants: parts,
    combinedCategories: ['Fem Light'], maxParticipants: 128 }, extra);
}
const andrea = pair('Andrea Ruschmann', 'Juliana Marques', 1, 2);
const adriana = pair('Adriana Rosa', 'Adriana de Marco Pilli', 4, 3);
const larissa = pair('Larissa Garcia', 'Ana Cattani', 5, 6);
const t = tournament([adriana, larissa, andrea]);
assert.strictEqual(W._canonicalDenseRegistrationSeq(t), true);
const html = W._buildDoublesInscritosSection(t, { drawDone: false }).html;
assert(html.includes('Duplas formadas (3)'));
assert(html.indexOf('Andrea Ruschmann') < html.indexOf('Adriana de Marco Pilli'));
assert(html.indexOf('Adriana de Marco Pilli') < html.indexOf('Larissa Garcia'));
const adrianaCard = W._duplaCard(t, adriana, false);
const visibleNames = [...adrianaCard.matchAll(/<span class="sp-fit-name"[^>]*>([^<]+)/g)].map(m => m[1]);
assert.deepStrictEqual(visibleNames, ['Adriana de Marco Pilli', 'Adriana Rosa']);
assert(adrianaCard.includes('>3</text>'));
assert(adrianaCard.includes('>4</text>'));

const all64 = Array.from({ length: 64 }, (_, i) => pair('Pessoa ' + (i * 2 + 1),
  'Pessoa ' + (i * 2 + 2), i * 2 + 1, i * 2 + 2));
const shuffled64 = all64.slice().reverse();
const photoTournament = tournament(shuffled64);
const all64Html = W._buildDoublesInscritosSection(photoTournament, { drawDone: false }).html;
const visibleOrder = [...all64Html.matchAll(/data-part-order="(\d+)"/g)].map(m => Number(m[1]));
assert.deepStrictEqual(visibleOrder, Array.from({ length: 64 }, (_, i) => i * 2 + 1));
assert.deepStrictEqual(shuffled64, all64.slice().reverse(), 'render não muda o array persistido');

// A ficha real também tem barra de filtro: #part-sort é hidden e seu valor
// inicial era name-asc, que reordenava os 64 cards após carregar os perfis.
W._filterBarState.inscritos = { sort: 'name-asc', sortFor: 'outro' };
const photoBar = W._inscritosBar(photoTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'order-asc');
assert(photoBar.includes('id="part-sort" value="order-asc"'));
const photoDefaultSort = W._filterBarState.inscritos.sort;
W._filterBarState.inscritos.sort = 'name-asc'; // escolha explícita na pílula A-Z
W._inscritosBar(photoTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'name-asc', 're-render respeita ordenação manual');
const otherTournament = tournament([pair('Eva', 'Fê', 1, 2)], { id: 'outro', canonicalRegistrationMigration: null });
W._inscritosBar(otherTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'name-asc', 'outro torneio usa seu default');
const partialTournament = tournament([pair('Eva', 'Fê', 1, 2), pair('Gabi', 'Hana', 3, undefined)], { id: 'parcial' });
W._inscritosBar(partialTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'name-asc', 'leitura parcial não antecipa a guarda');
partialTournament.participants[1].p2Seq = 4;
W._inscritosBar(partialTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'order-asc', 'leitura completa troca o default uma vez');
const noIdTournament = tournament([pair('Eva', 'Fê', 1, 2)], { id: undefined });
W._inscritosBar(noIdTournament, true);
W._filterBarState.inscritos.sort = 'name-desc';
W._inscritosBar(noIdTournament, true);
assert.strictEqual(W._filterBarState.inscritos.sort, 'name-desc', 'id ausente não reinicia a escolha a cada render');

// A regra direta é indivisível: sequência faltante/esparsa, espera ou legado
// mantêm os números densos anteriores, inclusive em card chamado sem ctx.
for (const degraded of [
  tournament([pair('Ana', 'Bia', 10, 20)]),
  tournament([pair('Ana', 'Bia', 1, 2), pair('Caio', 'Duda', 3, undefined)]),
  tournament([pair('Ana', 'Bia', 1, 2)], { waitlist: [{ name: 'Espera' }] }),
  tournament([pair('Ana', 'Bia', 1, 2)], { standbyParticipants: [{ name: 'Espera' }] }),
  tournament([pair('Ana', 'Bia', 1, 2)], { monarchWaitlist: { x: {} } }),
  tournament([pair('Ana', 'Bia', 1, 2)], { _faltamPesados: true }),
  tournament([pair('Ana', 'Bia', 1, 2)], { canonicalRegistrationMigration: null })
]) {
  assert.strictEqual(W._canonicalDenseRegistrationSeq(degraded), false);
  const card = W._duplaCard(degraded, degraded.participants[0], false);
  assert(!card.includes('>10</text>') && !card.includes('>20</text>'),
    'badge esparso não pode vazar');
}

// Exercita o filtro REAL que roda depois do render e após hidratação dos nomes.
// O teste do HTML acima sozinho não detectava a regressão vista no Chrome: os
// cards nasciam 1,3,5, mas _partApplyFilter os reanexava em A-Z sem #part-sort.
const participantsSrc = fs.readFileSync(path.join(__dirname, '..', 'js/views/participants.js'), 'utf8');
const filterSrc = participantsSrc.slice(participantsSrc.indexOf('window._partSearch = window._partSearch ||'),
  participantsSrc.indexOf('window._toggleVip = function'));
assert(filterSrc.includes('window._partApplyFilter = function'));
function runFilterScenario(names, options) {
  options = options || {};
  const host = {
    items: [],
    appendChild(card) { this.items.splice(this.items.indexOf(card), 1); this.items.push(card); }
  };
  names.forEach((name, i) => {
    const attrs = { 'data-part-card': '1', 'data-part-name': name.toLowerCase(),
      'data-part-order': String(i * 2 + 1), 'data-part-org': options.org === i ? '1' : '0',
      'data-part-vip': options.vip === i ? '1' : '0' };
    host.items.push({ name, attrs, parentNode: host, style: {}, getAttribute(k) { return this.attrs[k] || null; } });
  });
  const search = { value: options.search || '' };
  const sort = options.sort ? { type: 'hidden', value: options.sort } : null;
  const doc = { scrollingElement: { scrollTop: 0 }, documentElement: { scrollTop: 0 },
    getElementById(id) { return id === 'part-search' ? search : id === 'part-sort' ? sort : null; },
    querySelectorAll(selector) { return selector === '[data-part-card]' ? host.items.slice() : []; } };
  const browser = { window: { _partSearch: '', _stickyFilterKeepRoom() {} }, document: doc, console };
  vm.runInNewContext(filterSrc, browser);
  browser.window._partApplyFilter();
  const firstPass = host.items.map(c => c.name);
  // A hidratação posterior altera o texto de um UID e reaplica o mesmo filtro.
  host.items[0].attrs['data-part-name'] = 'zz ' + host.items[0].attrs['data-part-name'];
  browser.window._partApplyFilter();
  return { firstPass, afterHydration: host.items.map(c => c.name), cards: host.items };
}
const oldPhotoHost = runFilterScenario(['Andrea', 'Adriana', 'Larissa'], { sort: 'name-asc' });
assert.deepStrictEqual(oldPhotoHost.firstPass, ['Adriana', 'Andrea', 'Larissa'],
  'hidden antigo em A-Z reproduz o defeito visto no Chrome');
const photoHost = runFilterScenario(['Andrea', 'Adriana', 'Larissa'],
  { sort: photoDefaultSort, search: 'andrea' });
assert.deepStrictEqual(photoHost.firstPass, ['Andrea', 'Adriana', 'Larissa']);
assert.deepStrictEqual(photoHost.afterHydration, photoHost.firstPass);
assert.deepStrictEqual(photoHost.cards.map(c => c.style.display), ['', 'none', 'none']);
const regularHost = runFilterScenario(['Bia', 'Ana', 'Zélia', 'Yara'],
  { sort: 'name-asc', org: 2, vip: 3 });
assert.deepStrictEqual(regularHost.firstPass, ['Zélia', 'Yara', 'Ana', 'Bia'],
  'lista comum continua priorizando organização, VIP e A-Z');
const explicitlySortedPhotoHost = runFilterScenario(['Bia', 'Ana', 'Clara'],
  { sort: 'name-asc' });
assert.deepStrictEqual(explicitlySortedPhotoHost.firstPass, ['Ana', 'Bia', 'Clara'],
  'controle de ordenação explícito continua funcional no host marcado');
console.log('✅ duplas-foto-ordem: ordem dos cards, membros e guarda canônica');
