'use strict';
/* O compartilhamento do torneio pertence à modal de convite. O botão Voltar
 * da modal precisa ter contraste próprio: fundo transparente o fazia sumir
 * sobre a arte do torneio em telas estreitas. */
const fs = require('fs');
const source = fs.readFileSync('js/views/tournaments.js', 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const modalAt = source.indexOf('invite-modal-${t.id}');
const modalEnd = source.indexOf('const editModalHtml', modalAt);
const modal = source.slice(modalAt, modalEnd);
ok(/aria-label="Voltar ao torneio"/.test(modal) && /background:rgba\(59,130,246,0\.2\)/.test(modal), 'Voltar da modal tem contraste explícito');
ok(/Compartilhar convite/.test(modal) && /window\._shareTournament\('\$\{t\.id\}'\)/.test(modal), 'Compartilhar mora dentro da modal de convite');
const cardAt = source.indexOf('Grupo do torneio no WhatsApp');
const cardEnd = source.indexOf('<!-- Datas e logo do local', cardAt);
ok(!/Compartilhar<\/button>/.test(source.slice(cardAt, cardEnd)), 'card não duplica Compartilhar fora do convite');
process.exit(failed ? 1 : 0);
