/* L9 — aliases globais só permanecem quando há chamador real, dado histórico ou
 * contrato de compatibilidade documentado. Estes três tinham apenas a definição. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
let total = 0;
function ok(value, msg) { total++; if (!value) throw new Error(msg); }

const bracket = read('js/views/bracket-ui.js');
const organizer = read('js/views/tournaments-organizer.js');
const create = read('js/views/create-tournament.js');

ok(!/window\._reopenSet\b/.test(bracket), 'L9: _reopenSet sem chamadores não volta');
ok(!/window\._messageOrganizer\b/.test(organizer), 'L9: _messageOrganizer sem chamadores não volta');
ok(!/window\._onRankingManualChange\b/.test(create), 'L9: _onRankingManualChange sem chamadores não volta');
ok(/window\._editSetsInline\s*=\s*(async\s*)?function/.test(bracket), 'L9: editor canônico de sets continua exposto');
ok(/window\._contactOrganizer\s*=\s*(async\s*)?function/.test(organizer), 'L9: contato canônico do organizador continua exposto');

console.log('l9-aliases-mortos-removidos:', total, 'ok');
