/* A REGRA DA VARREDURA DE CONTA ÓRFÃ (orphan-profile-core.js, código REAL).
 * node functions/test-orphan-profile-core.js
 *
 * Conta no Firebase Auth sem doc em `users/` não existe pro app: não aparece na busca,
 * não entra em lista de espera, não se inscreve. Medido em 22/ago/2026: 2 dessas, ambas
 * Apple com e-mail oculto. O cliente já foi endurecido, mas quando o Firestore RECUSA a
 * escrita não sobra ninguém pra tentar de novo — essas pessoas não voltam. Esta varredura
 * é esse "alguém", e ela tem prazo: a cleanupAbandonedAuth APAGA do Auth conta sem doc
 * com mais de 30 dias.
 *
 * O QUE MAIS DÓI ERRAR, e por isso está travado aqui:
 *   • criar perfil de quem tem entrada em `loginRedirects` PRENDE a pessoa numa conta
 *     vazia pra sempre (o resgate da v1.2.9 só age quando o doc NÃO existe);
 *   • gravar o e-mail como nome PUBLICA o endereço dela na lista do organizador;
 *   • esquecer o `displayName_lower` deixa a pessoa invisível na busca — metade do
 *     problema que a varredura veio resolver;
 *   • carimbar `createdAt` na hora da varredura faria uma conta de junho parecer nova.
 */
const core = require('./orphan-profile-core');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const AGORA = Date.UTC(2026, 7, 22, 12, 0, 0);
const HORAS = (h) => AGORA - h * 3600000;

const APPLE_RELAY = {
  uid: 'Ndj2oQvljlTnr93i8AD1b7W49rk1',
  email: '7hsc6fn77d@privaterelay.appleid.com',
  displayName: '', providerId: 'apple.com', creationTimeMs: HORAS(96),
};

// ── 1. A órfã de verdade é curada ───────────────────────────────────────────
let d = core.decidir(APPLE_RELAY, false, null, AGORA);
ok(d.acao === 'criar', 'conta Apple sem perfil há 4 dias → cria (got ' + d.motivo + ')');
ok(d.semente.authProvider === 'apple.com', '  → guarda o provedor');
ok(d.semente.email === APPLE_RELAY.email, '  → guarda o e-mail (é como a pessoa é reencontrada)');
ok(d.semente.email_lower === APPLE_RELAY.email, '  → e o email_lower, que é o que a BUSCA consulta');

// ── 2. ⛔ e-mail NÃO é nome num login social ─────────────────────────────────
ok(d.semente.displayName === undefined,
   '🔒 e-mail oculto da Apple NUNCA vira displayName (senão o organizador vê "7hsc6fn77d@privaterelay…")');
d = core.decidir(Object.assign({}, APPLE_RELAY, { email: 'brupoti@gmail.com' }), false, null, AGORA);
ok(d.semente.displayName === undefined, '🔒 nem um e-mail de verdade vira nome num login social');
d = core.decidir(Object.assign({}, APPLE_RELAY, { email: 'brupoti@gmail.com', displayName: 'Bruna Verga Sá' }), false, null, AGORA);
ok(d.semente.displayName === 'Bruna Verga Sá', 'com nome no Auth, é ELE que vai pro perfil');
ok(d.semente.displayName_lower === 'bruna verga sá', '  → com o _lower junto, senão ela fica invisível na busca');

// ── 3. Conta de e-mail/senha e magic link seguem como eram ──────────────────
d = core.decidir({ uid: 'U2', email: 'alguem@gmail.com', displayName: '', providerId: 'password', creationTimeMs: HORAS(96) }, false, null, AGORA);
ok(d.semente.displayName === 'alguem@gmail.com',
   'e-mail/senha: o endereço É o identificador que a pessoa digitou e reconhece (nada regrediu)');

// ── 4. ⛔ RESGATE DE CONTA ABSORVIDA — o que não pode ser quebrado ───────────
d = core.decidir(APPLE_RELAY, false, 'uid_DA_CONTA_QUE_SOBREVIVEU', AGORA);
ok(d.acao === 'pular' && d.motivo === 'resgate_pendente',
   '🔒 quem tem entrada em loginRedirects NÃO ganha perfil — criar prenderia a pessoa numa conta vazia');
d = core.decidir(APPLE_RELAY, false, APPLE_RELAY.uid, AGORA);
ok(d.acao === 'criar', '  → redirect apontando pra ela mesma não é resgate: cura normal');

// ── 5. Carência: o cliente ainda pode estar terminando o login ──────────────
d = core.decidir(Object.assign({}, APPLE_RELAY, { creationTimeMs: AGORA - 60000 }), false, null, AGORA);
ok(d.acao === 'pular' && d.motivo === 'muito_recente', 'conta de 1 minuto não é órfã — é login em andamento');
d = core.decidir(Object.assign({}, APPLE_RELAY, { creationTimeMs: AGORA - 20 * 60000 }), false, null, AGORA);
ok(d.acao === 'criar', 'passados 20 min sem doc, aí sim é órfã');

// ── 6. Quem já tem perfil nunca é tocado ────────────────────────────────────
d = core.decidir(APPLE_RELAY, true, null, AGORA);
ok(d.acao === 'pular' && d.motivo === 'ja_tem_perfil', '🔒 perfil existente jamais é sobrescrito por semente');

// ── 7. createdAt é o NASCIMENTO da conta, não a hora da varredura ───────────
d = core.decidir(APPLE_RELAY, false, null, AGORA);
ok(d.semente.createdAt === new Date(HORAS(96)).toISOString(),
   'createdAt = nascimento REAL no Auth (carimbar "agora" faria conta velha parecer cadastro novo)');
ok(d.semente.updatedAt === d.semente.createdAt,
   '  → updatedAt igual: a varredura não é "atividade", e o Explorar lista por atividade recente');

// ── 8. A semente não pode parecer USO PASSADO — senão o gate de termos some ──
// O grandfather do terms-gate carimba acceptedTerms=true quando vê sinal de uso. Conta
// nova TEM que ver os termos quando finalmente voltar (LGPD).
const EVIDENCIA = ['friends', 'preferredSports', 'preferredLocations', 'preferredCeps', 'matchHistory', 'letzplayHandle', 'plan', 'acceptedTerms'];
const semente = core.decidir(APPLE_RELAY, false, null, AGORA).semente;
ok(EVIDENCIA.every((k) => semente[k] === undefined),
   '🔒 a semente não traz nenhum campo que o gate de termos leia como uso passado');
ok(Object.keys(semente).length > 0, '  → e não é vazia (doc vazio reabriria o bypass de metadata do terms-gate)');
ok(semente.profileCreatedBy === 'orphan-sweep', 'fica marcado que quem criou foi a varredura (auditável)');

// ── 9. Chaves de loginRedirects: as MESMAS que a CF resolveLoginRedirect usa ─
let ch = core.chavesDeRedirect({ email: 'Fulano@Gmail.com', phoneNumber: '+5511999998888' });
ok(ch[0] === 'fulano@gmail.com', 'chave de e-mail em minúsculas (é assim que o merge grava)');
ok(ch[1] === '+5511999998888', 'e o telefone em E.164, cru');
ch = core.chavesDeRedirect({ email: 'phone_5511999998888@phone.scoreplace.app' });
ok(ch.length === 0, 'e-mail sintético de conta só-celular não é chave de nada');

// ── 10. Sem data de criação não dá pra julgar — não inventa ─────────────────
d = core.decidir({ uid: 'U3', providerId: 'apple.com' }, false, null, AGORA);
ok(d.acao === 'pular' && d.motivo === 'sem_data_de_criacao', 'conta sem creationTime é pulada, não adivinhada');

console.log((fail === 0 ? '✅' : '❌') + ' orphan-profile-core: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
