// A grade canônica põe os dois nomes na linha 1 e ambas as ações na linha 2.
// Além da estrutura, Chromium mede o alinhamento real em larguras estreitas.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { chromium } = require('@playwright/test');
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

// A mesma função desenha detalhe e Inscritos. O UID real navega pelo helper
// canônico; a vaga manual e o UID sintético legado não anunciam perfil.
const displayNameBefore = W._displayName;
W._displayName = (uid, guest) => uid === 'uid-real' ? 'Perfil Real' : displayNameBefore(uid, guest);
const linkedPair = { p1Uid: 'uid-real', p1Name: 'Nome antigo', p2ManualId: 'manual-2',
  p2Name: 'Pessoa sem conta', category: 'Fem Light' };
const linkedCard = W._duplaCard({ ...t, participants: [linkedPair] }, linkedPair, false);
assert.match(linkedCard, /data-dupla-member-header="1"[\s\S]*?data-player-profile-uid="uid-real"/);
const manualHeader = linkedCard.match(/data-dupla-member-header="2"[\s\S]*?(?=<div data-dupla-member-actions|<div title="Categoria)/);
assert(manualHeader && manualHeader[0].includes('Pessoa sem conta'));
assert(manualHeader[0].includes('title="Pessoa sem conta"'), 'tooltip de nome longo preservado');
assert(!manualHeader[0].includes('data-player-profile-uid=') && !manualHeader[0].includes('sp-person-name-link'));
const syntheticPair = { ...linkedPair, p1Uid: 'jog_1_legacy', p1Name: 'Jogador 1' };
const syntheticCard = W._duplaCard({ ...t, participants: [syntheticPair] }, syntheticPair, false);
assert(!syntheticCard.includes('data-player-profile-uid="jog_1_legacy"'));
W._displayName = displayNameBefore;

// Medição real em Chromium: nomes com 1/2 linhas não deslocam estado nem W.O.
vm.runInContext(fs.readFileSync('js/views/participants.js', 'utf8'), W);
const realPresence = W._rollCallPresenceCtx(t, { isOrg: true, active: true, woScope: 'individual' });
const realCard = W._duplaCard(t, pair, false, {
  cardPresence: realPresence.cardPresence, memberPresence: realPresence.memberPresence
});
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [500, 360]) {
      const page = await browser.newPage({ viewport: { width: width + 20, height: 500 } });
      await page.setContent('<!doctype html><style>body{margin:0;background:#111;color:white}.participant-card{box-sizing:border-box;width:' + width + 'px;padding:14px}.toggle-switch{display:inline-block;width:44px;height:22px}.toggle-slider{display:block;width:44px;height:22px;background:#555}.btn-micro{display:inline-block}</style>' + realCard);
      const boxes = await page.evaluate(() => {
        const rect = (col, part) => document.querySelector('[data-dupla-member-actions="' + col + '"] [data-dupla-presence-' + part + ']').getBoundingClientRect();
        const leftStatus = rect(1, 'status'), rightStatus = rect(2, 'status');
        const leftWo = rect(1, 'wo'), rightWo = rect(2, 'wo');
        return { statusGap: Math.abs(leftStatus.top - rightStatus.top), woGap: Math.abs(leftWo.top - rightWo.top),
          nextRowGap: Math.abs((leftStatus.bottom + 3) - leftWo.top),
          rightAligned: Math.abs(rightStatus.right - rightWo.right) };
      });
      assert(boxes.statusGap <= 1 && boxes.woGap <= 1 && boxes.nextRowGap <= 1,
        'presença e W.O. alinhados com nome longo a ' + width + 'px');
      assert(boxes.rightAligned <= 1, 'lado direito alinha ações à direita a ' + width + 'px');
      await page.close();
    }
    console.log('✅ dupla-presenca-alinhada: links e geometria OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
