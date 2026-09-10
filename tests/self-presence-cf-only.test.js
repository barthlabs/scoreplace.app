/* L7: autopresença só despacha a intenção tipada; o navegador não escreve o torneio. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/views/participants.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('✓ ' + message);
  else { console.error('✗ ' + message); fail++; }
}

const start = src.indexOf('window._applySelfPresence = function');
const end = src.indexOf('\n};', start) + 3;
const body = src.slice(start, end);
console.log('──── autopresença por CF tipada ────');
ok(start >= 0 && end > start, '_applySelfPresence existe');
ok(/setTournamentPresence\(tId, selfUid, action, ''\)/.test(body),
  'a tela dispara somente a intenção tipada');
ok(!/AppStore\.mutate/.test(body),
  'a autopresença não executa mutação do torneio no navegador');
ok(/atVenue \? 'present' : 'confirmed'/.test(body),
  'GPS escolhe entre presente local e presença confirmada');
ok(/_presenceBusyUntil\(selfUid, save\)/.test(body),
  'a interface permanece bloqueada até a resposta do servidor');
ok(/Sem estado otimista/.test(body),
  'a tela só repinta a resposta canônica, sem mutar o torneio local');
process.exit(fail ? 1 : 0);
