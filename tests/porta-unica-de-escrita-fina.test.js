/* A PORTA ÚNICA DE ESCRITA FINA NO TORNEIO  (2.0.122)
 * node tests/porta-unica-de-escrita-fina.test.js
 *
 * Ordem do dono (26/ago/2026): _"tudo em CF apenas disparado pelo cliente"_.
 *
 * ⛔ POR QUE A PORTA PRECISA EXISTIR: o teto de 1 MB do Firestore só cai movendo dado pra
 * fora do documento, e o cliente NÃO tem permissão de escrever subcoleção — nunca teve, por
 * decisão da 1.7.98. Enquanto um campo for escrito pelo cliente, ele NÃO PODE sair do
 * documento: sairia e as escritas cairiam no vazio. Foi exatamente esse o buraco que a
 * 2.0.120 fechou em seis portas do `functions/`.
 *
 * ⛔ E POR QUE ELA NÃO ABRE TRANSAÇÃO NO TORNEIO: marcar UMA presença já reescreveu o
 * torneio inteiro dentro de uma transação, e sob contenção elas se atropelam — medido na
 * 1.7.x: update por CAMPO 25/25, transação do doc inteiro com falhas; a marca aparecia na
 * tela e o snapshot seguinte a removia. A porta preserva a escrita fina.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'functions/partes-permissao.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a porta única de escrita fina ────');

const t = { creatorUid: 'uOrg', adminUids: ['uAdm'], coHosts: [{ uid: 'uCo', status: 'active' }, { uid: 'uPend', status: 'pending' }] };

// ── ① quem pode o quê ─────────────────────────────────────────────────────────
ok('⭐ cada pessoa marca a PRÓPRIA presença', P.autoriza(t, 'uA', { parte: 'checkedIn', chave: 'uA' }).ok);
ok('⛔ e NÃO marca a de outra', !P.autoriza(t, 'uA', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ o organizador marca qualquer um', P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ o co-organizador ATIVO também (mesmo poder)', P.autoriza(t, 'uCo', { parte: 'checkedIn', chave: 'uB' }).ok,
  'co-organizador tem o MESMO poder do organizador [[project_cohost_same_power_as_organizer]]');
ok('⛔ convite PENDENTE não vale', !P.autoriza(t, 'uPend', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ e o admin do torneio idem', P.autoriza(t, 'uAdm', { parte: 'checkedIn', chave: 'uB' }).ok);

// ⭐ QUEM NÃO TEM CONTA é chaveado pelo NOME que o organizador digitou — cânone do projeto.
// A primeira versão desta tabela exigia formato de uid na chave e reprovava essas pessoas;
// quem pegou foi o próprio teste. [[feedback_uid_controls_everything_name_only_ficticio]]
ok('⭐ o organizador marca quem NÃO tem conta (chave é o nome, com espaço e acento)',
  P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: 'Maria Betânia Roberto Faria' }).ok);

ok('⛔ rastro de W.O. é só de quem organiza', !P.autoriza(t, 'uA', { parte: 'woLog', chave: 'h1' }).ok &&
   P.autoriza(t, 'uOrg', { parte: 'woLog', chave: 'h1' }).ok);
ok('⛔ confirmar presença de terceiro é só de quem organiza',
  !P.autoriza(t, 'uA', { parte: 'checkedInConfirmed', chave: 'uA' }).ok);

// ── ② allowlist: o que não está na tabela é NEGADO ────────────────────────────
['participants', 'rounds', 'matches', 'adminUids', 'creatorUid', 'memberUids', 'status'].forEach((c) => {
  ok('⛔ `' + c + '` NÃO passa por esta porta', !P.autoriza(t, 'uOrg', { parte: c, chave: 'x' }).ok,
    'allowlist: negar só o que lembrei de proibir é como se abre buraco sem perceber');
});
ok('⛔ e sem login não passa nada', !P.autoriza(t, null, { parte: 'checkedIn', chave: 'uA' }).ok);

// ── ③ a chave tem que servir de id de documento ───────────────────────────────
['a/b', '.', '..', '__proto__', ''].forEach((k) => {
  ok('⛔ chave "' + (k || '(vazia)') + '" é recusada', !P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: k }).ok);
});
ok('⭐ mas nome comprido normal passa', P.idDeDocumentoValido('Ana Carolina de Souza e Silva'));

// ── ④ a CF: autoriza TUDO antes de escrever QUALQUER coisa ───────────────────
const cf = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const i = cf.indexOf('exports.aplicarNoTorneio');
ok('a porta existe', i > 0);
const corpo = cf.slice(i, cf.indexOf('\nexports.', i + 10));
const iAut = corpo.indexOf('_partesPerm.autoriza');
const iEscrita = corpo.indexOf('db.batch()');
ok('⛔ autoriza TODAS as operações ANTES de abrir o lote', iAut > 0 && iEscrita > iAut,
  'autorizar dentro do laço deixaria metade aplicada quando a outra metade é negada');
ok('  → e uma negada derruba a chamada inteira', /throw new HttpsError\("permission-denied"/.test(corpo));
ok('⛔ NÃO abre transação no torneio (a contenção da presença foi medida)',
  !/runTransaction/.test(corpo));
ok('⭐ campo que já mora fora vira UM documento na subcoleção',
  /docRef\.collection\(_tSplitFn\.colecaoDaParte\(parte\)\)\.doc\(chave\)/.test(corpo));
ok('⭐ campo ainda no documento continua indo por FieldPath (escrita fina)',
  /new FieldPath\(parte, chave\)/.test(corpo));
ok('⛔ e os pares viram UM update só — lote não toca o mesmo doc duas vezes',
  /lote\.update\.apply\(lote, \[docRef\]\.concat\(paresDoDoc\)\)/.test(corpo));
ok('⛔ há teto de operações por chamada', /ops\.length > 200/.test(corpo));

// ── ⑤ o cliente parou de escrever presença direto ─────────────────────────────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
const iSP = cli.indexOf('async setPresenceFields(');
const sp = cli.slice(iSP, cli.indexOf('\n  },', iSP));
ok('⛔ setPresenceFields NÃO escreve mais no Firestore direto',
  !/ref\.update\.apply/.test(sp) && !/this\.db\.collection/.test(sp),
  'enquanto o cliente escrever aqui, `checkedIn` não pode sair do documento');
ok('⭐ ele DISPARA a CF', /_callFn\('aplicarNoTorneio'/.test(sp));
ok('  → preservando a forma {map, key, value} de quem chama', /o\.map/.test(sp) && /o\.key/.test(sp));

console.log(falhas === 0 ? '\n✅ porta-unica-de-escrita-fina: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
