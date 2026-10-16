// A ordem das fotos é a ordem de inscrição; a projeção pode embaralhar o array.
// Render e numeração devem concordar, sem regravar o torneio.
const assert = require('assert');
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
const all64Html = W._buildDoublesInscritosSection(tournament(shuffled64), { drawDone: false }).html;
const visibleOrder = [...all64Html.matchAll(/data-part-order="(\d+)"/g)].map(m => Number(m[1]));
assert.deepStrictEqual(visibleOrder, Array.from({ length: 64 }, (_, i) => i * 2 + 1));
assert.deepStrictEqual(shuffled64, all64.slice().reverse(), 'render não muda o array persistido');

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
console.log('✅ duplas-foto-ordem: ordem dos cards, membros e guarda canônica');
