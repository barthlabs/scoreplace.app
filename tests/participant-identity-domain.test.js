/* O contrato de identidade tipado precisa decidir os mesmos slots que o adaptador legado
 * e o motor de sorteio. Ele não conhece tela nem Firestore: só transforma a estrutura
 * persistida em identidade canônica. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (condition, message) => { if (condition) pass += 1; else { fail += 1; console.error('  ✗', message); } };

console.log('──── domínio tipado de identidade de participante ────');
try {
  execFileSync(process.execPath, ['scripts/build-domain.js', '--check'], { cwd: ROOT, stdio: 'pipe' });
  ok(true, '① JavaScript servido corresponde às fontes TypeScript');
} catch (error) {
  ok(false, '① domínio gerado diverge: ' + String(error.stderr || error.message));
}

const source = fs.readFileSync(path.join(ROOT, 'src/domain/participant-identity.ts'), 'utf8');
const implementation = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
ok(!/\bwindow\b|\bdocument\b|Firestore/.test(implementation),
  '② contrato não depende de browser, DOM ou Firestore');

const domain = require(path.join(ROOT, 'js/domain/participant-identity.js'));
ok(domain.participantUids({ uid: 'ana', p1Uid: 'bia', p2Uid: 'ana', participants: [{ uid: 'caio' }, { uid: 'bia' }] }).join(',') === 'ana,bia,caio',
  '③ UIDs são únicos e preservam a ordem dos slots');
ok(domain.participantUids({ p1Uid: 'u1', p2Uid: 'u2' }).join(',') === 'u1,u2',
  '④ dupla só-uid mantém as duas identidades');
ok(domain.participantUids({ name: 'Convidada sem conta' }).length === 0,
  '⑤ nome sem conta não finge ser UID');
ok(domain.entryTeamMembers({ p1Uid: 'u1', p2Uid: 'u2' }).join(',') === 'u1,u2',
  '⑥ dupla só-uid é reconhecida estruturalmente');
ok(domain.entryTeamMembers({ displayName: 'Ana / Bia' }) === null,
  '⑦ barra no nome não inventa uma dupla');
ok(domain.entryTeamMembers({ participants: [{ displayName: 'Ana' }, { name: 'Bia' }] }).join(',') === 'Ana,Bia',
  '⑧ entrada composta preserva a ordem de apresentação');
ok(domain.entryTeamMembers({ participants: ['Ana', { name: 'Bia' }] }).join(',') === 'Ana,Bia',
  '⑨ entrada composta legada em texto continua legível');
ok(domain.entryIdentityKey({ uid: 'ana', email: 'ana@antigo.test', displayName: 'Ana' }) === 'uid:ana',
  '⑩ identidade de conta ignora e-mail e nome de apresentação');
ok(domain.entryIdentityKey({ p1Uid: 'ana', p2ManualId: 'guest-7', p2Name: 'Convidada' }) === 'team:manual:guest-7|uid:ana',
  '⑪ dupla preserva UID e ID manual dos dois membros');
ok(domain.entryIdentityKey({ manualParticipantId: 'ana', displayName: 'Ana' }) !== domain.entryIdentityKey({ uid: 'ana', displayName: 'Ana' }),
  '⑫ UID e participante manual com o mesmo texto não colidem');
ok(domain.participantIdentityKeys({ p1Uid: 'ana', p2ManualId: 'guest-7', p2Name: 'Convidada' }).join(',') === 'manual:guest-7,uid:ana',
  '⑬ contadores recebem uma chave por pessoa da dupla');

const browser = { window: null }; browser.window = browser; vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/participant-identity.js'), 'utf8'), browser);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/identity-core.js'), 'utf8'), browser);
ok(browser._participantUids({ uid: 'ana', p1Uid: 'bia', p2Uid: 'ana' }).join(',') === 'ana,bia',
  '⑬ adaptador de browser delega ao domínio tipado');
ok(browser._entryTeamMembers({ p1Uid: 'u1', p2Uid: 'u2' }).join(',') === 'u1,u2',
  '⑭ adaptador de browser preserva a dupla só-uid');
ok(browser._participantEntryKey({ p1Uid: 'u1', p2ManualId: 'm2', p2Name: 'Manual' }) === 'team:manual:m2|uid:u1',
  '⑯ adaptador expõe a mesma chave tipada de entrada');
ok(browser._participantIdentityKeys({ p1Uid: 'u1', p2ManualId: 'm2', p2Name: 'Manual' }).join(',') === 'manual:m2,uid:u1',
  '⑰ adaptador expõe as chaves individuais da dupla');
const duoA = { displayName: 'Ana / Bia', p1Uid: 'ana-1', p2Uid: 'bia-1' };
const duoB = { displayName: 'Ana / Bia', p1Uid: 'ana-2', p2Uid: 'bia-2' };
const origins = {};
browser._setTeamOrigin(origins, duoA, 'formada');
browser._setTeamOrigin(origins, duoB, 'sorteada');
ok(browser._teamOriginKey(duoA) !== browser._teamOriginKey(duoB) &&
  browser._getTeamOrigin(origins, duoA) === 'formada' && browser._getTeamOrigin(origins, duoB) === 'sorteada',
  '⑱ duplas homônimas guardam origens separadas pela identidade estrutural');
ok(browser._getTeamOrigin({ 'Ana / Bia': 'inscrita' }, duoA) === 'inscrita',
  '⑲ documentos legados por rótulo continuam legíveis durante a migração');

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(index.indexOf('js/domain/participant-identity.js') < index.indexOf('js/views/identity-core.js'),
  '⑳ domínio carrega antes do adaptador clássico');
const draw = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'draw-core.js'), 'utf8');
ok(draw.indexOf("participant-identity.js") < draw.indexOf("require('./vendor/identity-core.js')"),
  '㉑ motor de sorteio carrega o mesmo domínio antes do adaptador');
const engine = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
ok(engine._window.ScoreplaceParticipantIdentity && engine._window._participantUids({ uid: 'a', p1Uid: 'b', p2Uid: 'a' }).join(',') === 'a,b',
  '㉒ motor executa o contrato tipado, não uma cópia própria');

const tournamentsView = fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8');
ok(/window\._participantEntryKey\(p\)/.test(tournamentsView) &&
  /p\.manualParticipantId/.test(tournamentsView) &&
  /p\.p1ManualId/.test(tournamentsView),
  '㉓ card, arraste e desfazer de dupla preservam UID e manualParticipantId antes de nome legado');

const participantCards = fs.readFileSync(path.join(ROOT, 'js/views/participants.js'), 'utf8');
ok(/!p\.p1ManualId && !p\.p2ManualId/.test(participantCards) &&
  !/\|\| p\.email \|\| _T\('participants\.participant'/.test(participantCards),
  '㉔ card individual não confunde dupla manual com solo nem expõe e-mail como nome');

const authView = fs.readFileSync(path.join(ROOT, 'js/views/auth.js'), 'utf8');
const createTournament = fs.readFileSync(path.join(ROOT, 'js/views/create-tournament.js'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
ok(!/currentUser\.uid \|\| currentUser\.email/.test(authView) &&
  !/currentUser\.displayName \|\| window\.AppStore\.currentUser\.email/.test(createTournament) &&
  !/actor\.name \|\| actor\.email/.test(functionsIndex),
  '㉕ convite, criação e notificações não usam e-mail como identidade ou nome persistido');

const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
ok(/startRealtimeListener\(\)/.test(authView) && /startRealtimeListener\(\)\s*\{/.test(store) &&
  /where\('memberUids', 'array-contains', _uid\)/.test(store),
  '㉖ ouvinte de torneios recebe e consulta exclusivamente UID');

const createFunction = fs.readFileSync(path.join(ROOT, 'functions-autodraw/tournament-create.js'), 'utf8');
ok(!/organizerName\s*:/.test(createFunction) &&
  /'organizerName'/.test(functionsIndex),
  '㉗ criação não congela o nome do organizador e a fronteira de escrita remove o legado');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
