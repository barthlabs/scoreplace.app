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

const browser = { window: null }; browser.window = browser; vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/participant-identity.js'), 'utf8'), browser);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/identity-core.js'), 'utf8'), browser);
ok(browser._participantUids({ uid: 'ana', p1Uid: 'bia', p2Uid: 'ana' }).join(',') === 'ana,bia',
  '⑩ adaptador de browser delega ao domínio tipado');
ok(browser._entryTeamMembers({ p1Uid: 'u1', p2Uid: 'u2' }).join(',') === 'u1,u2',
  '⑪ adaptador de browser preserva a dupla só-uid');

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(index.indexOf('js/domain/participant-identity.js') < index.indexOf('js/views/identity-core.js'),
  '⑫ domínio carrega antes do adaptador clássico');
const draw = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'draw-core.js'), 'utf8');
ok(draw.indexOf("participant-identity.js") < draw.indexOf("require('./vendor/identity-core.js')"),
  '⑬ motor de sorteio carrega o mesmo domínio antes do adaptador');
const engine = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
ok(engine._window.ScoreplaceParticipantIdentity && engine._window._participantUids({ uid: 'a', p1Uid: 'b', p2Uid: 'a' }).join(',') === 'a,b',
  '⑭ motor executa o contrato tipado, não uma cópia própria');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
