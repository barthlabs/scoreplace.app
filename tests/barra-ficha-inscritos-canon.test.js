'use strict';
// Exercita o host real da ficha; testar apenas _inscritosBar não detectou a barra
// ausente em produção na v2.4.60.
const assert = require('assert');
const { sandbox: W } = require('./render-harness');

function pair(i) {
  return { p1Name: 'Pessoa ' + String(i * 2 + 1), p2Name: 'Pessoa ' + String(i * 2 + 2),
    p1ManualId: 'm' + String(i * 2 + 1), p2ManualId: 'm' + String(i * 2 + 2),
    p1Seq: i * 2 + 1, p2Seq: i * 2 + 2, category: 'Fem Light' };
}
function tournament(extra) {
  return Object.assign({ id: 'ficha-' + String(Math.random()), name: 'Torneio de teste',
    sport: 'Beach Tennis', status: 'open', isPublic: true, format: 'Fase de Grupos + Eliminatórias',
    teamSize: 2, enrollmentMode: 'teams', participants: [pair(1), pair(0)],
    canonicalRegistrationMigration: { fingerprint: 'teste' }, matches: [], rounds: [], groups: []
  }, extra || {});
}
function render(t) {
  const el = { innerHTML: '', style: {}, dataset: {}, appendChild() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, classList: { add() {}, remove() {}, contains() { return false; } } };
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = null;
  W.renderTournaments(el, t.id);
  return el.innerHTML;
}
function count(html, needle) { return html.split(needle).length - 1; }

const photo = tournament({ id: 'ficha-foto', participants: Array.from({ length: 64 }, (_, i) => pair(i)).reverse() });
let html = render(photo);
assert(html.length > 5000, 'a ficha real precisa renderizar');
assert.strictEqual(count(html, 'id="fbwrap-inscritos"'), 1, 'uma barra na ficha de duplas');
assert(html.includes('id="part-sort" value="order-asc"'), 'ordem de inscrição no elenco canônico');
const orders = [...html.matchAll(/data-part-order="(\d+)"/g)].map(x => Number(x[1]));
assert.deepStrictEqual(orders, Array.from({ length: 64 }, (_, i) => 2 * i + 1), '64 duplas em ordem das fotos');
assert(html.indexOf('id="fbwrap-inscritos"') < html.indexOf('data-detail-participants="1"'),
  'barra fica logo abaixo do cabeçalho, acima da ficha');

W._filterBarState.inscritos.sort = 'name-asc'; // escolha manual
html = render(photo);
assert(html.includes('id="part-sort" value="name-asc"'), 're-render da ficha preserva A-Z escolhido');
assert.strictEqual(count(html, 'id="fbwrap-inscritos"'), 1);

const legacy = tournament({ id: 'ficha-legado', canonicalRegistrationMigration: null,
  participants: { a: { displayName: 'Bia', name: 'Bia', manualParticipantId: 'manual-b' },
    b: { displayName: 'Ana', name: 'Ana', manualParticipantId: 'manual-a' } },
  teamSize: 1, enrollmentMode: 'individual' });
html = render(legacy);
assert.strictEqual(count(html, 'id="fbwrap-inscritos"'), 1, 'a barra cobre individual com participants objeto');
assert(html.includes('id="part-sort" value="name-asc"'), 'legado mantém default A-Z');

const drawn = tournament({ id: 'ficha-chave', matches: [{ id: 'm1', p1: 'A', p2: 'B', round: 1 }] });
html = render(drawn);
assert.strictEqual(count(html, 'id="fbwrap-inscritos"'), 0, 'chave não duplica barra de inscritos');
assert.strictEqual(count(html, 'id="fbwrap-chaves"'), 1, 'chave conserva sua barra canônica');

console.log('✅ barra-ficha-inscritos-canon: host real, 64 duplas, individual, chave e escolha manual');
