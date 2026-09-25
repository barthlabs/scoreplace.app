'use strict';

/* O e-mail do organizador deixa de viajar no documento PÚBLICO e passa a sair só
 * por esta porta autenticada — e com régua mais estrita que os outros campos de
 * contato: quem não está inscrito não recebe endereço nenhum (LGPD: necessidade
 * e minimização). Se esta suíte cair, alguém alargou a porta.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../functions/tournament-contact-core.js');

const root = path.join(__dirname, '..');
const torneio = {
  creatorUid: 'org1',
  coHosts: [{ uid: 'co1', status: 'active' }],
  participants: [
    { uid: 'insc1' },
    { p1Uid: 'insc2', p2Uid: 'insc3' },
    { participants: [{ uid: 'insc4' }] },
  ],
};

// ── quem PODE ────────────────────────────────────────────────────────────────
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'insc1', 'org1'), true,
  'inscrito vê o e-mail de quem criou o torneio');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'insc4', 'co1'), true,
  'inscrito vê o e-mail do co-organizador ativo');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'org1', 'co1'), true,
  'a organização vê o e-mail da própria organização');

// ── quem NÃO pode ────────────────────────────────────────────────────────────
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'estranho', 'org1'), false,
  'quem não está inscrito NÃO recebe o e-mail do organizador');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'insc1', 'insc2'), false,
  'e-mail de participante não vai para ninguém, nem entre inscritos');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'org1', 'insc1'), false,
  'nem o organizador recebe e-mail de participante por esta porta');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, '', 'org1'), false,
  'sem quem chama, não devolve');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'insc1', ''), false,
  'sem alvo, não devolve');
assert.equal(core.emailDaOrganizacaoVisivel({ creatorUid: 'org1', coHosts: [{ uid: 'co2', status: 'removed' }] },
  'org1', 'co2'), false, 'co-organizador REMOVIDO não é organização');

// ── a régua é MAIS estrita que a do contato comum ─────────────────────────────
// `podeVerContatoDoTorneio` libera o contato da organização para qualquer pessoa
// autenticada; o e-mail não acompanha essa abertura.
assert.equal(core.podeVerContatoDoTorneio(torneio, 'estranho', 'org1', false), true,
  'o contato comum da organização é aberto a quem está logado');
assert.equal(core.emailDaOrganizacaoVisivel(torneio, 'estranho', 'org1'), false,
  'o e-mail NÃO segue a abertura do contato comum');

// ── o e-mail nunca entra na projeção comum ───────────────────────────────────
assert.equal(core.CAMPOS_CONTATO_ELENCO.indexOf('email'), -1,
  'e-mail fora da lista de campos do contato do elenco');
assert.equal(core.contatoDoPerfil({ email: 'a@b.com', phone: '11' }).email, undefined,
  'a projeção comum não carrega e-mail');

// ── de onde vem o endereço ───────────────────────────────────────────────────
assert.equal(core.emailDoPerfil({ email: 'org@exemplo.com' }), 'org@exemplo.com',
  'o endereço vem do PERFIL da pessoa');
assert.equal(core.emailDoPerfil({ email: 'semarroba' }), '', 'texto sem @ não é e-mail');
assert.equal(core.emailDoPerfil({}), '', 'perfil sem e-mail devolve vazio');
assert.equal(core.emailDoPerfil(null), '', 'perfil ausente devolve vazio');

// ── a callable usa a porta, e só ela ─────────────────────────────────────────
const idx = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const ini = idx.indexOf('exports.getTournamentParticipantContact');
const fim = idx.indexOf('exports.getTournamentEnrollmentProfiles');
assert.ok(ini > 0 && fim > ini, 'achou a callable de contato');
const callable = idx.slice(ini, fim);
assert.match(callable, /emailDaOrganizacaoVisivel\(tournament, callerUid, targetUid\)/,
  'a callable decide o e-mail pela porta única');
assert.match(callable, /contact\.organizerEmail = email/,
  'o e-mail sai em campo próprio, separado do contato comum');
const guarda = callable.indexOf('emailDaOrganizacaoVisivel');
const uso = callable.indexOf('emailDoPerfil');
assert.ok(guarda < uso, 'a autorização vem ANTES de ler o endereço');

// ── a PROVA REAL não pode cair da lista sem ninguém ver ──────────────────────
/* ⛔ Suíte de emulador que não está num comando NÃO É PORTÃO: ela verde-ja uma vez no terminal
 * de quem a escreveu e nunca mais roda. Este gate é barato e mora no comando de sempre: ele só
 * confere que a prova real continua registrada. */
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(fs.existsSync(path.join(root, 'functions/test-contato-email-emu.js')),
  'a prova de emulador da porta existe');
assert.match(String(pkg.scripts['test:emu:fn'] || ''), /test-contato-email-emu\.js/,
  'e está registrada no comando de emulador de Functions — senão nunca roda');

console.log('✅ e-mail do organizador só para o elenco — 22 verificações');
