/* 📱 CELULAR REGISTRADO PELO ORGANIZADOR — contato COM procedência, nunca identidade
 *   node tests/celular-registrado-pelo-organizador.test.js
 *
 * ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
 * 20/ago/2026, Leila Arida. Ela pediu o código de verificação do celular, a métrica do
 * Identity Toolkit mostrou o disparo às 11:09 com HTTP 200 (o Google aceitou e entregou
 * o SMS à operadora) e NENHUMA confirmação depois. O SMS não chegou no aparelho. Sem
 * saída nenhuma, ela ficava fora da campanha de celular da Confra pra sempre.
 *
 * A primeira proposta — deixar salvar o número sem verificar — foi DERRUBADA pelo dono,
 * e ele estava certo:
 *   "e se a pessoa colocar o numero de outro? sequestra o numero do outro para
 *    contatos. e se errar a digitação, ninguem recebe nada e acha que esta tudo bem"
 * Número não verificado, anônimo e auto-declarado é PIOR que campo vazio: parece
 * resolvido e não é.
 *
 * ⭐ O QUE MUDOU FOI A PROCEDÊNCIA, NÃO A EXIGÊNCIA. Quem registra é o organizador —
 * que já falou com a pessoa —, o uid dele fica gravado, e a pessoa é avisada. O número
 * vale pra CONTATO e nunca pra IDENTIDADE.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. só organizador/co-organizador DESTE torneio registra;
 *   B. só pra quem está no elenco DESTE torneio;
 *   C. NUNCA por cima de celular verificado por SMS;
 *   D. nunca no próprio perfil (burlaria a verificação pra si mesmo);
 *   E. o dado grava QUEM registrou e QUANDO (procedência é o ponto todo);
 *   F. número do organizador NÃO recupera senha, NÃO é evidência de duplicata e
 *      PERDE pro verificado numa fusão — os três caminhos de identidade;
 *   G. a pessoa é notificada, com o número mascarado;
 *   H. os campos de procedência são PRIVILEGIADOS nas rules (apagar `phoneSource`
 *      promoveria a identidade um número que ninguém confirmou).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const core = require(path.join(ROOT, 'functions', 'contact-phone-core.js'));
const IDX = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const PARTS = fs.readFileSync(path.join(ROOT, 'js', 'views', 'participants.js'), 'utf8');
const AUTH = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');

const ORG = 'uid-organizador-aaaa';
const CO = 'uid-coorganizador-bb';
const LEILA = 'uid-leila-cccccccccc';
const FORA = 'uid-de-fora-dddddddd';
const T = {
  name: 'Confra BT Alta da Clínica 2026',
  creatorUid: ORG,
  coHosts: [{ uid: CO, status: 'active' }, { uid: 'uid-convidado-pendente', status: 'pending' }],
  participants: [{ uid: LEILA, name: 'Leila' }, { uid: ORG, name: 'Rodrigo' }],
};
const base = (extra) => Object.assign({
  tournament: T, callerUid: ORG, targetUid: LEILA, phone: '11988887777', country: '55',
  targetProfile: {}, nowIso: '2026-08-20T18:00:00.000Z',
}, extra || {});

// ── A. QUEM PODE ────────────────────────────────────────────────────────────
ok(core.computeSetContactPhone(base()).ok === true, 'A1. o organizador registra');
ok(core.computeSetContactPhone(base({ callerUid: CO })).ok === true,
  'A2. co-organizador ATIVO tem o mesmo poder (cânone do projeto)');
ok(core.computeSetContactPhone(base({ callerUid: 'uid-convidado-pendente' })).reason === 'nao-e-organizador',
  'A3. co-organizador PENDENTE (convite não aceito) não registra');
ok(core.computeSetContactPhone(base({ callerUid: FORA })).reason === 'nao-e-organizador',
  'A4. quem não organiza este torneio não registra');
ok(core.computeSetContactPhone(base({ tournament: null })).reason === 'torneio-inexistente',
  'A5. sem torneio, não decide');

// ── B. PRA QUEM ─────────────────────────────────────────────────────────────
ok(core.computeSetContactPhone(base({ targetUid: FORA })).reason === 'nao-esta-no-elenco',
  'B1. só quem está no elenco DESTE torneio — senão organizar um torneio viraria licença sobre a base inteira');

// ── C. NUNCA POR CIMA DE VERIFICADO ─────────────────────────────────────────
ok(core.computeSetContactPhone(base({ targetProfile: { phone: '+5511999990000' } })).reason === 'ja-tem-verificado',
  'C1. celular verificado por SMS não é sobrescrito por organizador');
const corrige = core.computeSetContactPhone(base({
  targetProfile: { phone: '+5511900001111', phoneSource: 'organizer' },
}));
ok(corrige.ok === true && corrige.anterior === '+5511900001111',
  'C2. o que o PRÓPRIO organizador registrou pode ser corrigido (é conserto de digitação, não sequestro)');
ok(core.computeSetContactPhone(base({
  targetProfile: { phone: '+5511988887777', phoneSource: 'organizer' },
})).reason === 'sem-mudanca', 'C3. o mesmo número de novo não é gravação nova');

// ── D. NUNCA NO PRÓPRIO PERFIL ──────────────────────────────────────────────
ok(core.computeSetContactPhone(base({ targetUid: ORG })).reason === 'use-o-proprio-perfil',
  'D1. o organizador não registra o PRÓPRIO celular por aqui — no perfil dele há SMS');

// ── número inválido ─────────────────────────────────────────────────────────
ok(core.computeSetContactPhone(base({ phone: '9999' })).reason === 'numero-invalido', 'D2. número curto é recusado');
ok(core.computeSetContactPhone(base({ phone: '' })).reason === 'numero-invalido', 'D3. vazio é recusado');
ok(core.toE164('11988887777', '55') === '+5511988887777', 'D4. DDD+9 vira E.164 com +55');
ok(core.toE164('5511988887777', '55') === '+5511988887777', 'D5. número que já traz o DDI não ganha outro');
ok(core.toE164('(11) 98888-7777', '55') === '+5511988887777', 'D6. máscara digitada não atrapalha');

// ── E. PROCEDÊNCIA GRAVADA ──────────────────────────────────────────────────
const r = core.computeSetContactPhone(base());
ok(r.update.phone === '+5511988887777', 'E1. grava o número em E.164');
ok(r.update.phoneSource === 'organizer', 'E2. grava a PROCEDÊNCIA — é o discriminador único');
ok(r.update.phoneSetBy === ORG, 'E3. grava QUEM registrou (sem isso não há responsável)');
ok(r.update.phoneSetAt === '2026-08-20T18:00:00.000Z', 'E4. grava QUANDO');
ok(!('phoneVerified' in r.update),
  'E5. NÃO inventa phoneVerified — duas fontes de verdade exigiriam backfill nas contas antigas');

// ── F. NUNCA IDENTIDADE (os três caminhos) ──────────────────────────────────
ok(core.isIdentityPhone({ phone: '+5511988887777' }) === true,
  'F1. celular SEM procedência = verificado (é o estado de todas as contas anteriores; o default do dado velho tem que valer)');
ok(core.isIdentityPhone({ phone: '+5511988887777', phoneSource: 'organizer' }) === false,
  'F2. celular do organizador NÃO é identidade');
ok(core.isIdentityPhone({}) === false && core.isIdentityPhone(null) === false,
  'F3. sem telefone não há identidade');
ok(core.contactPhoneOf({ phone: '+5511988887777', phoneSource: 'organizer' }) === '+5511988887777',
  'F4. mas VALE como contato — é pra isso que ele existe');

// os três consumidores de identidade, no servidor
ok(/_contactPhone\.isIdentityPhone\(p\)/.test(IDX) && /_registeredPhoneFor/.test(IDX),
  'F5. recuperação de senha por celular ignora o número do organizador');
ok(/if \(telCanon && _contactPhone\.isIdentityPhone\(meu\)\)/.test(IDX),
  'F6. dedup não usa o número do organizador como evidência (casal com um aparelho só não é "a mesma pessoa")');
ok(/_survSemIdentidade/.test(IDX),
  'F7. na fusão, celular VERIFICADO vence o registrado pelo organizador');
ok(/phoneSource: admin\.firestore\.FieldValue\.delete\(\)/.test(IDX),
  'F8. quando o SMS finalmente prova a posse, a procedência de organizador é apagada');

// ── G. A PESSOA É AVISADA ───────────────────────────────────────────────────
const aviso = core.buildContactPhoneNotice({
  organizerName: 'Rodrigo Barth', tournamentName: 'Confra', phone: '+5511988887777',
  nowIso: '2026-08-20T18:00:00.000Z',
});
ok(aviso.type === 'contact_phone_set', 'G1. o aviso tem tipo próprio');
ok(/Rodrigo Barth/.test(aviso.message) && /Confra/.test(aviso.message),
  'G2. o aviso diz QUEM registrou e em qual torneio');
ok(/\*\*\*\*-7777/.test(aviso.message) && aviso.message.indexOf('988887777') === -1,
  'G3. o número aparece MASCARADO — notificação é lida com gente do lado');
ok(/confirme por SMS/i.test(aviso.message),
  'G4. o aviso oferece a correção/confirmação, não só informa');
const CAT = fs.readFileSync(path.join(ROOT, 'js', 'notification-catalog.js'), 'utf8');
ok(/contact_phone_set:\s*\{/.test(CAT),
  'G5. o tipo está no catálogo (senão cai no ícone genérico e sem nível)');
ok(/setParticipantContactPhone/.test(IDX) && /buildContactPhoneNotice/.test(IDX),
  'G6. a CF existe e dispara o aviso');
ok(/collection\("notifications"\)/.test(IDX.slice(IDX.indexOf('exports.setParticipantContactPhone'))),
  'G7. o aviso é gravado na caixa da própria pessoa');

// ── H. RULES: procedência é campo-PROVA ─────────────────────────────────────
ok(/'phoneSource', 'phoneSetBy', 'phoneSetAt'/.test(RULES),
  'H1. os campos de procedência são privilegiados — o cliente não apaga `phoneSource` pra se auto-promover');
ok(/phoneVerifyAttempts/.test(RULES),
  'H2. a subcoleção do rastro de tentativas tem regra própria (camada 2)');

// ── FIAÇÃO DA TELA ──────────────────────────────────────────────────────────
ok(/_orgSetContactPhone/.test(PARTS) && /httpsCallable\('setParticipantContactPhone'\)/.test(PARTS),
  'I1. o botão do organizador chama a CF (quem decide é o servidor)');
ok(/isOrg && ind\.uid/.test(PARTS),
  'I2. o botão só existe pro organizador e só pra quem tem uid');
ok(/já confirmou o celular por SMS/.test(PARTS),
  'I3. a tela recusa antes de chamar quando o celular é verificado — a recusa do servidor não pode ser a primeira notícia');
ok(/profile-phone-org-note/.test(AUTH) && /registrado pelo <b>organizador/.test(AUTH),
  'I4. o perfil da PESSOA mostra a procedência — encontrar um telefone que ela não digitou, sem explicação, é o oposto do que queremos');

console.log('\n📱 CELULAR REGISTRADO PELO ORGANIZADOR');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
