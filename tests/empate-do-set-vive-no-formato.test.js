// Games para vencer e regra de empate pertencem ao formato de cada fase.
// Exercita o controle real da fase inicial e verifica a passagem para a eliminatória.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ct = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
const f2 = fs.readFileSync(path.join(root, 'js/views/format2-ui.js'), 'utf8');
const format = fs.readFileSync(path.join(root, 'js/views/format2.js'), 'utf8');
let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error('  ✗ ' + message); }
}
function fn(name) {
  const start = ct.indexOf('window.' + name + ' = function');
  if (start < 0) throw new Error('Função ausente: ' + name);
  return ct.slice(start, ct.indexOf('\n};', start) + 3);
}

console.log('──── formato de games por fase ────');
const nodes = {
  'gsm-type': { value: 'sets' },
  'gsm-gamesPerSet': { value: '6' },
  'gsm-setsToWin': { value: '1' },
  'gsm-tiebreakEnabled': { value: 'true' },
  'gsm-tiebreakPoints': { value: '7' },
  'gsm-tiebreakMargin': { value: '2' },
  'gsm-superTiebreak': { value: 'false' },
  'gsm-superTiebreakPoints': { value: '10' },
  'gsm-advantageRule': { value: 'false' },
  'gsm-fixedSet': { value: 'false' },
  'gsm-fixedSetGames': { value: '6' },
  'gsm-countingType': { value: 'tennis' },
  'gsm-tiebreakAt': { value: 'g-1' },
  'gsm-tieRule': { value: 'tiebreak' },
  'gsm-tieat-inline': { innerHTML: '' }
};
const win = {
  document: { getElementById: id => nodes[id] || null },
  _scoringUsesSets: sc => sc.type === 'sets',
  _gsmRenderPresets() { this._gsmRenderTieAt(); },
  _gsmUpdateMainSummary() {},
  _gsmUpdateAdvantageUI() {},
  _gsmGetAdvantageForSport() { return false; },
  _sportTiebreakAt() { return 'g'; }
};
win.window = win;
vm.createContext(win);
vm.runInContext([
  fn('_tieAtToggleHtml'), fn('_gsmTieAtAtual'), fn('_gsmRenderTieAt'),
  fn('_gsmSetGamesInline'), fn('_gsmSetTieRuleInline'), fn('_gsmSelectPreset'), fn('_gsmDetectPreset')
].join('\n'), win);
win._gsmPresets = {
  set1: { setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7,
    tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'tennis' },
  best3: { setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7,
    tiebreakMargin: 2, superTiebreak: true, superTiebreakPoints: 10, countingType: 'tennis' }
};

win._gsmRenderTieAt();
ok(/Games para vencer o set/.test(nodes['gsm-tieat-inline'].innerHTML), 'campo de games aparece na fase inicial');
ok(/5-5/.test(nodes['gsm-tieat-inline'].innerHTML), '6 games dispara decisão em 5-5');
win._gsmSetGamesInline('4');
ok(nodes['gsm-gamesPerSet'].value === '4' && /3-3/.test(nodes['gsm-tieat-inline'].innerHTML),
  '4 games atualiza o campo salvo e o empate exibido');
win._gsmSetTieRuleInline('decider');
ok(nodes['gsm-tieRule'].value === 'decider' && nodes['gsm-tiebreakEnabled'].value === 'false',
  'game decisivo é gravado sem habilitar tie-break');
ok(/aria-pressed="true"[^>]*>Próximo game vence/.test(nodes['gsm-tieat-inline'].innerHTML),
  'a opção gravada fica selecionada');
win._gsmSetTieRuleInline('extend');
ok(nodes['gsm-tieRule'].value === 'extend', 'vantagem de dois games é gravada');
win._gsmSetGamesInline('4.5');
ok(nodes['gsm-gamesPerSet'].value === '4', 'fração inválida não altera a meta');

nodes['gsm-tiebreakAt'].value = 'g';
win._gsmRenderTieAt();
ok(/4-4/.test(nodes['gsm-tieat-inline'].innerHTML), 'torneio antigo com empate em g-g é preservado');
win._gsmSetTieRuleInline('tiebreak');
ok(nodes['gsm-tiebreakAt'].value === 'g-1', 'edição explícita adota o empate um game abaixo');
win._gsmSetTieRuleInline('decider');
win._gsmSelectPreset('best3');
ok(nodes['gsm-tieRule'].value === 'decider' && nodes['gsm-tiebreakEnabled'].value === 'false',
  'trocar o formato para melhor de 3 preserva o game decisivo');
ok(win._gsmDetectPreset() === 'best3', 'o preset continua reconhecido com regra de empate própria');

ok(/_tieAtToggleHtml\(/.test(f2) && /_f2ElimSetGames/.test(f2) && /_f2ElimSetRule/.test(f2),
  'a fase eliminatória usa o mesmo controle e tem gravadores próprios');
ok(/_mesmoFormato\(sc, ini\) \? null : sc/.test(f2),
  'a eliminatória volta a herdar quando a regra coincide com a fase inicial');
ok(/s\.tieRule === 'decider'/.test(format), 'normalização da fase preserva game decisivo');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail) process.exit(1);
console.log('✅ formato de games por fase: OK');
