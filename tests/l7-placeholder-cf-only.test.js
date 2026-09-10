'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let bad = 0;
function check(name, yes) { console.log((yes ? '✓ ' : '✗ ') + name); if (!yes) bad++; }
function cut(source, start, end) { const i = source.indexOf(start), j = source.indexOf(end, i + start.length); if (i < 0 || j < 0) throw new Error('marcador ausente: ' + start); return source.slice(i, j); }
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-org-tools.js'), 'utf8');
const replace = cut(client, 'window._substitutePlaceholder = function', '\n  // ── UI canônica');
check('cliente só despacha a intenção estreita', /_callCF\('occupyTournamentPlaceholder'/.test(replace));
check('cliente não altera chave ou elenco', !/AppStore\.(?:mutate|commitTournamentTx)|_applyPlaceholderSub\(/.test(replace));
check('cliente só celebra depois da resposta confirmada', /\.then\(function \(out\)/.test(replace) && /out\.ok/.test(replace));
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const cf = cut(server, 'exports.occupyTournamentPlaceholder = onCall', '// ─── Declarar/reverter ausência de W.O.');
check('Function exige autenticação e organização', /request\.auth/.test(cf) && /_isTournamentAdmin\(t, uid\)/.test(cf));
check('payload contém só vaga e UID', /placeholderName/.test(cf) && /participantUid/.test(cf) && !/data\.(?:participants|matches|rounds|waitlist)/.test(cf));
check('Function relê a espera no documento fresco', /const espera =/.test(cf) && /espera\.find/.test(cf));
check('Function captura o estado antes de trocar a chave', /const before = _antesDoMotor\(t\);[\s\S]*?const boundary = _gravaTorneio\(tx, ref, t, before/.test(cf));
check('Function remove o suplente da espera na mesma transação', /standbyParticipants.*filter/.test(cf) && /waitlist.*filter/.test(cf));
process.exitCode = bad ? 1 : 0;
