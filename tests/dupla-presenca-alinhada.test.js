// Estrutura de layout, não geometria: jsdom não mede alinhamento real. A grade
// canônica põe os dois nomes na linha 1 e ambas as ações na linha 2.
const assert = require('assert');
const { sandbox: W } = require('./render-harness');

const t = {
  id: 'dupla-grid', teamSize: 2, enrollmentMode: 'teams',
  participants: [], combinedCategories: ['Fem Light']
};
const pair = {
  p1Name: 'Andrea Ruschmann Nome Longo Em Duas Linhas', p1ManualId: 'm1',
  p2Name: 'Juliana', p2ManualId: 'm2', category: 'Fem Light'
};
t.participants = [pair];
const previousMeta = W._profileMetaSlots;
W._profileMetaSlots = () => '<span>META_SENTINEL</span>';
const memberPresence = (_, right) => ({ html: '<div><span>' + (right ? 'Ausente direita' : 'Ausente esquerda') + '</span><button onclick="window._markAbsent()">Aplicar W.O.</button></div>' });
const html = W._duplaCard(t, pair, false, { memberPresence });

assert(html.includes('data-dupla-member-grid="1"'));
assert(html.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
const positions = [
  'data-dupla-member-header="1"', 'data-dupla-member-header="2"',
  'data-dupla-member-actions="1"', 'data-dupla-member-actions="2"'
].map((marker) => html.indexOf(marker));
assert(positions.every((n) => n >= 0));
assert(positions.every((n, i) => i === 0 || n > positions[i - 1]),
  'DOM: cabeçalho esquerdo/direito antes das duas ações');
assert.match(html, /data-dupla-member-header="1"[^>]*grid-column:1;grid-row:1/);
assert.match(html, /data-dupla-member-header="2"[^>]*grid-column:2;grid-row:1/);
assert.match(html, /data-dupla-member-actions="1"[^>]*grid-column:1;grid-row:2/);
assert.match(html, /data-dupla-member-actions="2"[^>]*grid-column:2;grid-row:2/);
assert(html.includes('sp-fit-name') && html.includes('data-fit-h="44"'));
assert(html.includes('justify-self:end;text-align:right'));
assert(html.indexOf('Ausente esquerda') > positions[2]);
assert(html.indexOf('Ausente direita') > positions[3]);
assert.strictEqual((html.match(/_markAbsent\(\)/g) || []).length, 2,
  'os dois handlers W.O. continuam presentes');
assert(html.includes('🏷️ Fem Light'));
assert(!html.includes('META_SENTINEL'), 'categoria do par suprime metadados por membro');

const detailWithoutRollCall = W._duplaCard(t, pair, false);
assert(!detailWithoutRollCall.includes('data-dupla-member-actions='),
  'sem chamada, a grade não cria uma linha vazia abaixo dos nomes');

const legacy = { name: 'Ana /', displayName: 'Ana /' };
const legacyHtml = W._duplaCard({ ...t, participants: [legacy] }, legacy, false, { memberPresence });
assert(legacyHtml.includes('grid-template-columns:minmax(0,1fr);'));
assert(legacyHtml.includes('data-dupla-member-header="1"'));
assert(legacyHtml.includes('data-dupla-member-actions="1"'));
assert(!legacyHtml.includes('data-dupla-member-header="2"'));
assert(!legacyHtml.includes('data-dupla-member-actions="2"'));
W._profileMetaSlots = previousMeta;
console.log('✅ dupla-presenca-alinhada: OK');
