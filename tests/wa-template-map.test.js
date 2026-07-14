/* WhatsApp Cloud API: tipo de notificação → template aprovado — node tests/wa-template-map.test.js
 *
 * O Evolution (WhatsApp Web) mandava TEXTO LIVRE pra qualquer um. O Cloud API só
 * manda texto livre dentro da janela de 24h aberta pelo usuário; notificação nossa é
 * business-initiated → é TEMPLATE APROVADO ou não sai. Este teste congela o mapeador
 * (_waTemplateFor) e o sanitizador de parâmetro (_waParam) contra as regras DURAS da
 * Meta, cada uma aprendida com um erro real (ver project_whatsapp_meta_2fa_block):
 *   • parâmetro com \n / tab / 4+ espaços → a Meta REJEITA o envio;
 *   • parâmetro vazio → rejeitado;
 *   • {{1}} é SEMPRE o nome de quem recebe (mensagem é personalizada por pessoa);
 *   • tipo sem template → null (pula o WhatsApp; e-mail/in-app seguem) — nunca inventa texto.
 * Ver feedback_tests_must_reproduce_real_failure.
 */
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── carrega só os helpers, sem DOM ────────────────────────────────────────────
global.window = global;
window._warn = function () {};
window.SCOREPLACE_URL = 'https://scoreplace.app';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// _waParam vive no store.js (helper global). Extrai só ele — o arquivo inteiro
// depende de DOM/Firebase e não roda headless.
const storeSrc = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const waParamSrc = storeSrc.match(/window\._waParam = function[\s\S]*?\n};/);
if (!waParamSrc) { console.error('✗ _waParam não encontrado em store.js'); process.exit(1); }
eval(waParamSrc[0]);

// _waTemplateFor + _waUrlSuffix + _notifCta vivem em tournaments-organizer.js.
const orgSrc = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-organizer.js'), 'utf8');
for (const re of [
  /window\._notifCta = function[\s\S]*?\n};/,
  /window\._waTemplateFor = function[\s\S]*?\n};/,
  /window\._waUrlSuffix = function[\s\S]*?\n};/,
]) {
  const m = orgSrc.match(re);
  if (!m) { console.error('✗ helper não encontrado:', re); process.exit(1); }
  eval(m[0]);
}

console.log('──── _waParam: regras de parâmetro da Meta ────');
// A Meta rejeita o ENVIO (não a criação) se o parâmetro tiver newline/tab/4+ espaços.
ok(window._waParam('Torneio\nde Beach') === 'Torneio de Beach', 'newline vira espaço');
ok(window._waParam('a\tb') === 'a b', 'tab vira espaço');
ok(window._waParam('a    b') === 'a b', '4+ espaços colapsam');
ok(window._waParam('  x  ') === 'x', 'trim');
ok(window._waParam('') === '-', 'vazio vira "-" (parâmetro vazio é rejeitado)');
ok(window._waParam(null) === '-', 'null vira "-"');
ok(window._waParam(undefined) === '-', 'undefined vira "-"');
const longo = window._waParam('x'.repeat(2000));
ok(longo.length === 1024, 'corta em 1024 (limite da Meta), got ' + longo.length);
ok(/\.\.\.$/.test(longo), 'corte marca reticências');

console.log('──── {{1}} é sempre o nome de quem recebe ────');
const draw = window._waTemplateFor('draw', { tournamentName: 'Torneio X', playerMatch: 'A/B x C/D' }, 'Rodrigo');
ok(draw.template === 'sp_sorteio_jogo', 'draw → sp_sorteio_jogo (got ' + draw.template + ')');
ok(draw.params[0] === 'Rodrigo', '{{1}} = nome de quem recebe');
ok(draw.params[1] === 'Torneio X', '{{2}} = torneio');
ok(draw.params[2] === 'A/B x C/D', '{{3}} = o jogo da pessoa (os 4 nomes)');

// Sem nome (caminho legado que não passa waRecipients) NÃO pode quebrar.
const semNome = window._waTemplateFor('draw', { tournamentName: 'T' }, '');
ok(semNome && semNome.params[0] === 'jogador', 'sem nome → "jogador", nunca vazio/undefined');

console.log('──── cada tipo cai no template certo ────');
const casos = [
  ['new_round', 'sp_sorteio_jogo'], ['new_phase', 'sp_sorteio_jogo'],
  ['match-pending-approval', 'sp_placar_confirmar'], ['match-rejected', 'sp_placar_confirmar'],
  ['pair_invite', 'sp_convite_recebido'], ['cohost_invite', 'sp_convite_recebido'],
  ['liga-sub-invite', 'sp_convite_recebido'], ['casual_invite', 'sp_convite_recebido'],
  ['poll', 'sp_enquete_aberta'], ['org_communication', 'sp_comunicado_torneio'],
  ['presence_checkin', 'sp_presenca_amigo'], ['presence_plan', 'sp_presenca_amigo'],
];
casos.forEach(function (c) {
  const r = window._waTemplateFor(c[0], { tournamentName: 'T', message: 'm', fromName: 'N', venue: 'V' }, 'Rodrigo');
  ok(r && r.template === c[1], c[0] + ' → ' + c[1] + ' (got ' + (r && r.template) + ')');
  ok(r && r.params.every(function (p) { return p !== undefined && p !== null && p !== ''; }),
    c[0] + ': nenhum parâmetro vazio/undefined');
});

console.log('──── tipo sem template → null (pula WhatsApp, não inventa) ────');
// Esses estão como 'nenhum' na política OU não têm template — não podem virar
// texto livre (o Cloud API recusaria) nem cair num template errado.
['friend_request', 'tournament_reminder', 'result', 'tipo_inexistente_xyz'].forEach(function (t) {
  ok(window._waTemplateFor(t, { tournamentName: 'T' }, 'Rodrigo') === null, t + ' → null');
});

console.log('──── botão: só o SUFIXO varia (base é fixa no template) ────');
// A Meta só deixa variar o sufixo de um botão URL dinâmico. Se vazasse a URL
// inteira ("https://..."), o link entregue viraria scoreplace.app/https://...
const sufDraw = window._waUrlSuffix('draw', { tournamentId: 'tour_123' });
ok(sufDraw.charAt(0) === '#', 'sufixo começa com # (got ' + sufDraw + ')');
ok(sufDraw.indexOf('http') === -1, 'sufixo NUNCA carrega a base http (got ' + sufDraw + ')');
ok(sufDraw === '#bracket/tour_123', 'draw → #bracket/<id> (got ' + sufDraw + ')');
const sufSemNada = window._waUrlSuffix('tipo_qualquer', {});
ok(sufSemNada.charAt(0) === '#', 'fallback também é sufixo (got ' + sufSemNada + ')');

console.log('──── texto livre do organizador é sanitizado ────');
// org_communication carrega texto digitado pelo humano — o caso mais provável de
// vir com quebra de linha e derrubar o envio.
const comunicado = window._waTemplateFor('org_communication',
  { tournamentName: 'T', message: 'Jogos de sábado\nadiados\n\npara domingo' }, 'Rodrigo');
const limpo = comunicado.params.map(window._waParam);
ok(limpo.every(function (p) { return p.indexOf('\n') === -1; }), 'nenhum \\n sobrevive ao _waParam');

console.log('════════════════════════════════════════');
console.log((fail ? '❌' : '✅') + ' wa-template-map: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
