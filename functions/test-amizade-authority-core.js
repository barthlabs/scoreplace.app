/* A AUTORIDADE DA AMIZADE (amizade-authority-core.js, código REAL).
 * node functions/test-amizade-authority-core.js
 *
 * ⛔ O CASO QUE ESTE ARQUIVO EXISTE PRA TRAVAR — a escalada achada na 2.1.47:
 *   um TERCEIRO, que não faz parte do par, mandava `users/{vítima}.friends = [ele]` e
 *   passava a ler estatísticas marcadas como "só amigos". A regra antiga perguntava
 *   "quais chaves mudaram?" e nunca "quem está mudando?".
 *   Aqui a pergunta certa é `estranhoNaoEntra` — se ela cair, o buraco voltou.
 *
 * O que mais dói errar, e por isso está travado:
 *   • quem ENVIA aceitar o próprio convite (vira auto-amizade com qualquer um);
 *   • convite CRUZADO virar dois docs em vez de uma amizade;
 *   • `rejected` virar beco sem saída (a pessoa nunca mais pode ser convidada);
 *   • backfill PERDER amizade que só um lado afirma (o estado velho diverge de fato).
 */
const core = require('./amizade-authority-core');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const A = 'uid_ana', B = 'uid_bia', C = 'uid_carlos_estranho';
const T0 = '2026-08-29T10:00:00.000Z', T1 = '2026-08-29T11:00:00.000Z';

// ── pairId é canônico ────────────────────────────────────────────────────────
ok(core.pairId(A, B) === core.pairId(B, A), 'pairId é o MESMO venha de qual lado vier');
ok(core.pairId(A, B).indexOf('__') > 0, 'pairId separa com __');
let threw = false; try { core.pairId(A, A); } catch (e) { threw = true; }
ok(threw, 'pairId recusa uids iguais');

// ══ A TRAVA: ESTRANHO NÃO ENTRA ═══════════════════════════════════════════════
const amizadeAB = { uidA: A < B ? A : B, uidB: A < B ? B : A, status: 'accepted', requestedBy: A, createdAt: T0, acceptedAt: T1 };
const pendenteAB = { uidA: A < B ? A : B, uidB: A < B ? B : A, status: 'pending', requestedBy: A, createdAt: T0, acceptedAt: null };

['aceitar', 'recusar', 'cancelar', 'remover'].forEach((acao) => {
  const r = core.decidir(acao, amizadeAB, C, A, T1);
  ok(!r.ok && r.codigo === 'permission-denied',
    'estranhoNaoEntra: C não pode "' + acao + '" a relação de A com B');
});
const rEnv = core.decidir('enviar', pendenteAB, C, A, T1);
ok(!rEnv.ok, 'estranhoNaoEntra: C não se enfia num convite pendente de A↔B');

// ── fluxo legítimo ───────────────────────────────────────────────────────────
const env = core.decidir('enviar', null, A, B, T0);
ok(env.ok && env.doc.status === 'pending' && env.doc.requestedBy === A, 'A convida B → pending');
ok(env.acesso === 'nada', 'convite pendente NÃO abre acesso');

const ace = core.decidir('aceitar', env.doc, B, A, T1);
ok(ace.ok && ace.doc.status === 'accepted', 'B aceita → accepted');
ok(ace.acesso === 'criar', 'aceitar ABRE o acesso (projeção)');
ok(ace.doc.acceptedAt === T1 && ace.doc.createdAt === T0, 'carimbos preservados');

const rem = core.decidir('remover', ace.doc, B, A, T1);
ok(rem.ok && rem.doc === null && rem.acesso === 'apagar', 'remover APAGA o acesso');

// ── quem envia não aceita nem recusa o próprio convite ───────────────────────
const proprio = core.decidir('aceitar', env.doc, A, B, T1);
ok(!proprio.ok && proprio.codigo === 'permission-denied', 'quem ENVIA não aceita o próprio convite');
const proprioR = core.decidir('recusar', env.doc, A, B, T1);
ok(!proprioR.ok, 'quem ENVIA não recusa o próprio convite');
const cancelaOutro = core.decidir('cancelar', env.doc, B, A, T1);
ok(!cancelaOutro.ok, 'quem RECEBE não cancela — recusa');
ok(core.decidir('cancelar', env.doc, A, B, T1).ok, 'quem ENVIOU cancela');

// ── convite cruzado vira amizade, não dois docs ──────────────────────────────
const cruz = core.decidir('enviar', env.doc, B, A, T1);
ok(cruz.ok && cruz.doc.status === 'accepted' && cruz.evento === 'auto-aceito',
  'convite CRUZADO (B convida quem já o convidou) vira amizade');
ok(cruz.acesso === 'criar', 'convite cruzado abre o acesso');

// ── rejected não é beco sem saída ────────────────────────────────────────────
const rec = core.decidir('recusar', env.doc, B, A, T1);
ok(rec.ok && rec.doc.status === 'rejected', 'B recusa → rejected');
ok(rec.acesso === 'nada', 'recusa não abre acesso');
const dedoNovo = core.decidir('enviar', rec.doc, A, B, T1);
ok(dedoNovo.ok && dedoNovo.doc.status === 'pending', 'depois de recusado, dá pra convidar DE NOVO');

// ── nada de amizade consigo mesmo ────────────────────────────────────────────
ok(!core.decidir('enviar', null, A, A, T0).ok, 'não dá pra convidar a si mesmo');

// ── duplo aceite / duplo envio ───────────────────────────────────────────────
ok(!core.decidir('aceitar', amizadeAB, B, A, T1).ok, 'aceitar quem já é amigo falha');
ok(!core.decidir('enviar', amizadeAB, A, B, T1).ok, 'convidar quem já é amigo falha');
ok(!core.decidir('remover', pendenteAB, A, B, T1).ok, 'remover quem NÃO é amigo falha');

// ══ BACKFILL ═════════════════════════════════════════════════════════════════
/* ⛔ ESTE BLOCO FOI INVERTIDO DUAS VEZES, e a segunda é a que vale.
 *   1ª versão: exigia que amizade UNILATERAL virasse accepted. Perigoso — foi derrubado.
 *   2ª versão: exigia que amizade RECÍPROCA virasse accepted automaticamente.
 *              Também derrubado (4ª auditoria externa): quem explorava a falha da 2.1.47
 *              escrevia OS DOIS LADOS, então reciprocidade no legado é indistinguível de
 *              ataque. Promover era transformar dado adulterável em autorização permanente.
 * AGORA: nada do legado vira accepted, e `acessos` é SEMPRE vazio. */
const perfis = {
  [A]: { friends: [B], friendRequestsSent: ['uid_dani'], friendRequestsReceived: [] },
  [B]: { friends: [A], friendRequestsSent: [], friendRequestsReceived: [] },
  'uid_dani': { friends: [], friendRequestsSent: [], friendRequestsReceived: [A] },
  'uid_solo': { friends: ['uid_alvo'], friendRequestsSent: [], friendRequestsReceived: [] },
  'uid_alvo': { friends: [], friendRequestsSent: [], friendRequestsReceived: [] }
};
const bf = core.planejarBackfill(perfis, T0);

ok(bf.acessos.length === 0, '⛔ o backfill NÃO concede friendAccess a NADA do legado');
ok(bf.relacoes.every((r) => r.doc.status === 'legacy_unverified'),
  '⛔ e NENHUMA relação legada nasce accepted ou pending');
ok(bf.relacoes.length === 2, 'recíproca + convite consistente viram legacy_unverified — deu ' + bf.relacoes.length);
const uni = bf.quarentena.filter((q) => q.tipo === 'amizade-unilateral');
ok(uni.length === 1 && uni[0].bloqueia, 'a unilateral vai pra quarentena bloqueante');
ok(!bf.relacoes.some((r) => r.id === core.pairId('uid_solo', 'uid_alvo')), 'unilateral não vira relação');
ok(new Set(bf.relacoes.map((r) => r.id)).size === bf.relacoes.length, 'backfill não duplica par');
ok(bf.relacoes.find((r) => r.id === core.pairId(A, B)).doc.legacyOrigem === 'friends-reciproco',
  'a origem fica registrada no doc (auditoria)');
ok(bf.relacoes.find((r) => r.id === core.pairId(A, 'uid_dani')).doc.legacyOrigem === 'convite-consistente',
  'e distingue convite de amizade');

// nada some calado: convite inconsistente é migrado como legado E registrado
const bfInc = core.planejarBackfill({
  [A]: { friends: [], friendRequestsSent: [B], friendRequestsReceived: [] },
  [B]: { friends: [], friendRequestsSent: [], friendRequestsReceived: [] }
}, T0);
ok(bfInc.relacoes[0].doc.legacyOrigem === 'convite-inconsistente', 'convite inconsistente é marcado');
ok(bfInc.quarentena.some((q) => q.tipo === 'convite-inconsistente'), 'e registrado na quarentena');
ok(bfInc.acessos.length === 0, 'sem conceder nada');

// projeção de cache ignora legacy_unverified
const legProj = core.projetarCache([{ id: 'x', doc: { uidA: A, uidB: B, status: 'legacy_unverified',
  requestedBy: A, createdAt: T0, acceptedAt: null } }], A);
ok(legProj.friends.length === 0 && legProj.friendRequestsSent.length === 0,
  '⛔ legacy_unverified não aparece no cache — nem como amigo, nem como convite');

// ══ O ATACANTE ANTIGO NÃO GANHA NADA (4ª auditoria, ponto 1) ═════════════════
/* Reproduz o cenário exato: quem explorava a falha da 2.1.47 escrevia OS DOIS LADOS —
 * `users/{vítima}.friends = [atacante]` E `users/{atacante}.friends = [vítima]`. Isso é
 * indistinguível de amizade real olhando só os arrays. Por isso reciprocidade no legado
 * NÃO é prova, e o backfill não pode promover nada disso a `accepted`. */
const VIT = 'uid_vitima', ATK = 'uid_atacante';
const bfAtk = core.planejarBackfill({
  [VIT]: { friends: [ATK], friendRequestsSent: [], friendRequestsReceived: [] },
  [ATK]: { friends: [VIT], friendRequestsSent: [], friendRequestsReceived: [] }
}, T0);
ok(bfAtk.acessos.length === 0,
  '⛔ ATACANTE que escreveu os DOIS lados NÃO ganha friendAccess no backfill');
ok(bfAtk.relacoes.length === 1 && bfAtk.relacoes[0].doc.status === 'legacy_unverified',
  'a relação recíproca antiga vira legacy_unverified, não accepted');
ok(bfAtk.relacoes[0].doc.legacyOrigem === 'friends-reciproco', 'e carrega a origem, pra auditoria');
ok(!bfAtk.relacoes.some((r) => r.doc.status === 'accepted'), '⛔ NENHUMA relação legada nasce accepted');

// convites antigos também não são prova
const bfConv = core.planejarBackfill({
  [A]: { friends: [], friendRequestsSent: [B], friendRequestsReceived: [] },
  [B]: { friends: [], friendRequestsSent: [], friendRequestsReceived: [A] }
}, T0);
ok(bfConv.relacoes[0].doc.status === 'legacy_unverified',
  'convite antigo CONSISTENTE também vira legacy_unverified, nunca pending');
ok(bfConv.acessos.length === 0, 'e não concede nada');

// unilateral continua em quarentena, sem relação
const bfUni = core.planejarBackfill({
  [A]: { friends: [B], friendRequestsSent: [], friendRequestsReceived: [] },
  [B]: { friends: [], friendRequestsSent: [], friendRequestsReceived: [] }
}, T0);
ok(bfUni.relacoes.length === 0 && bfUni.quarentena.some((q) => q.tipo === 'amizade-unilateral' && q.bloqueia),
  'unilateral: sem relação, quarentena bloqueante');

// ⭐ o caminho de volta: reconfirmar sobre legacy_unverified
const legado = { uidA: A < B ? A : B, uidB: A < B ? B : A, status: 'legacy_unverified',
                 requestedBy: A, createdAt: T0, acceptedAt: null };
const rc = core.decidir('enviar', legado, B, A, T1);
ok(rc.ok && rc.doc.status === 'pending' && rc.evento === 'reconfirmacao-enviada',
  '⭐ convidar sobre legacy_unverified é a RECONFIRMAÇÃO → pending');
ok(rc.acesso === 'nada', 'e ela sozinha ainda não concede acesso');
const rc2 = core.decidir('aceitar', rc.doc, A, B, T1);
ok(rc2.ok && rc2.doc.status === 'accepted' && rc2.acesso === 'criar',
  '⭐ só o ACEITE do outro lado, pela autoridade nova, gera friendAccess');
ok(!core.decidir('aceitar', legado, B, A, T1).ok, '⛔ não dá pra aceitar direto o estado legado');
ok(core.decidir('remover', legado, B, A, T1).ok, 'mas dá pra descartar um par legado');

// ══ E-MAIL LEGADO DENTRO DOS ARRAYS (3ª auditoria, ponto 4) ══════════════════
/* Casos vindos do legado real: o mesmo e-mail casa com a LÁPIDE e com o SOBREVIVENTE
 * (a fusão não apaga o doc morto, ele fica com o mesmo e-mail) — a porta da conta viva
 * colapsa os dois num só, e aí a resolução é única e segura. */
let e = core.decidirEmailLegado([A], ['uid_lapide', A]);
ok(e.uid === A && e.viaEmail, 'e-mail que resolve pra UMA conta viva é convertido');
e = core.decidirEmailLegado([A, A], ['uid_lapide', A]);
ok(e.uid === A, 'lápide + sobrevivente colapsam num só — continua sendo 1');
e = core.decidirEmailLegado([], []);
ok(e.erro === 'email-sem-conta', 'e-mail sem nenhuma conta → quarentena nomeada');
e = core.decidirEmailLegado([], ['uid_so_lapide']);
ok(e.erro === 'email-so-resolve-pra-conta-morta', 'e-mail que só resolve pra conta morta → quarentena');
e = core.decidirEmailLegado([A, B], [A, B]);
ok(e.erro === 'email-ambiguo' && e.candidatos.length === 2,
  '⛔ e-mail AMBÍGUO (2 contas vivas) → quarentena, NUNCA escolher uma');
ok(!core.decidirEmailLegado([A, B], [A, B]).uid, 'e ambíguo não devolve uid nenhum');

// ══ FUSÃO oldUid → keepUid ═══════════════════════════════════════════════════
const OLD = 'uid_old', KEEP = 'uid_keep', C3 = 'uid_terceiro';
const rel = (u1, u2, st, by, cri, ace) => {
  const p = core.parOrdenado(u1, u2);
  return { id: core.pairId(u1, u2),
    doc: { uidA: p.uidA, uidB: p.uidB, status: st, requestedBy: by, createdAt: cri || T0, acceptedAt: ace || null } };
};

// caso 1: relação simples do OLD com um terceiro → rekey pro KEEP
let m = core.planejarMerge([rel(OLD, C3, 'accepted', OLD, T0, T0)], OLD, KEEP);
ok(m.escrever.length === 1 && m.escrever[0].id === core.pairId(KEEP, C3),
  'fusão: relação do OLD renasce com o pairId do KEEP');
ok(m.escrever[0].doc.requestedBy === KEEP, 'e o requestedBy é repontado');
ok(m.apagar.includes(core.pairId(OLD, C3)), 'e o doc antigo é APAGADO (não fica com id mentindo)');
ok(m.acessosCriar.length === 2, 'projeção recriada nas duas direções');
ok(m.acessosApagar.some(a => a.uid === OLD), 'e a projeção do uid morto some');

// caso 2: COLISÃO — OLD e KEEP têm relação com o MESMO terceiro
m = core.planejarMerge([
  rel(OLD, C3, 'accepted', OLD, T0, T1),
  rel(KEEP, C3, 'pending', C3, T1, null)
], OLD, KEEP);
ok(m.escrever.length === 1, 'colisão resolve em UMA relação — deu ' + m.escrever.length);
ok(m.escrever[0].doc.status === 'accepted', 'e accepted prevalece sobre pending');
ok(new Set(m.escrever.map(x => x.id)).size === m.escrever.length, 'sem duplicação');
ok(m.apagar.includes(core.pairId(OLD, C3)), 'o doc do OLD some na colisão');

// caso 3: os DOIS fundidos eram "amigos" entre si → a relação deixa de existir
m = core.planejarMerge([rel(OLD, KEEP, 'accepted', OLD, T0, T1)], OLD, KEEP);
ok(m.escrever.length === 0, 'amizade entre as duas contas fundidas não sobrevive');
ok(m.acessosApagar.length === 2, 'e as duas projeções são apagadas');

// caso 4: relação PENDENTE também é repontada
m = core.planejarMerge([rel(OLD, C3, 'pending', OLD, T0, null)], OLD, KEEP);
ok(m.escrever[0].doc.status === 'pending', 'pendência é repontada como pendência');
ok(m.acessosCriar.length === 0, 'e pendência NÃO cria projeção');

// caso 5: IDEMPOTÊNCIA — rodar sobre o estado já fundido não faz nada
m = core.planejarMerge([rel(KEEP, C3, 'accepted', KEEP, T0, T1)], OLD, KEEP);
ok(m.escrever.length === 0 && m.apagar.length === 0, 'idempotente: sem relação do OLD, plano vazio');

// ══ EXCLUSÃO DE CONTA ════════════════════════════════════════════════════════
const ex = core.planejarExclusao([
  rel(A, B, 'accepted', A, T0, T1),
  rel(A, C3, 'pending', A, T0, null),
  rel(B, C3, 'accepted', B, T0, T1)
], A);
ok(ex.apagar.length === 2, 'exclusão apaga as 2 relações de A (não a de B↔C) — deu ' + ex.apagar.length);
ok(ex.acessosApagar.length === 4, 'e as duas direções de cada uma');
ok(ex.cacheRemoverDe.sort().join() === [B, C3].sort().join(), 'e diz de quais caches o uid sai');
ok(!ex.apagar.includes(core.pairId(B, C3)), '⛔ não toca em relação de terceiros entre si');

console.log(pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
