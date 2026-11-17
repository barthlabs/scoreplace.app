'use strict';
/* O convite usa o Voltar geral acima do painel, sem segundo botão interno. */
const fs = require('fs');
const source = fs.readFileSync('js/views/tournaments.js', 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const modalAt = source.indexOf('invite-modal-${t.id}');
const modalEnd = source.indexOf('const editModalHtml', modalAt);
const modal = source.slice(modalAt, modalEnd);
ok(!/aria-label="Voltar ao torneio"/.test(modal) && /top: var\(--scroll-anchor, 120px\)/.test(modal) &&
  /height: calc\(100% - var\(--scroll-anchor, 120px\)\)/.test(modal),
  'convite mantém apenas o Voltar geral acima do painel');
const back = fs.readFileSync('js/store.js', 'utf8');
ok(/invite-modal-container/.test(back) && /invitePanels\[inviteIndex\]\.style\.display = 'none'/.test(back),
  'Voltar geral fecha o convite antes de navegar');
ok(/Compartilhar convite/.test(modal) && /window\._shareTournament\('\$\{t\.id\}'\)/.test(modal), 'Compartilhar mora dentro da modal de convite');
const cardAt = source.indexOf('Grupo do torneio no WhatsApp');
const cardEnd = source.indexOf('<!-- Datas e logo do local', cardAt);
ok(!/Compartilhar<\/button>/.test(source.slice(cardAt, cardEnd)), 'card não duplica Compartilhar fora do convite');
process.exit(failed ? 1 : 0);
