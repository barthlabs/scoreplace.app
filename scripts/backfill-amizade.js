#!/usr/bin/env node
/* backfill-amizade.js — users.friends (legado) → friendships + friendAccess (autoridade)
 *
 * ⛔ RODAR ANTES DE PUBLICAR A 2.1.48. As rules passam a decidir "amigo?" por
 * `friendAccess/{uid}/accepted/{friendUid}`. Sem a projeção, amizade real fica invisível.
 *
 *   node scripts/backfill-amizade.js                      # DRY-RUN
 *   node scripts/backfill-amizade.js --aplicar            # escreve (aborta se houver quarentena)
 *   node scripts/backfill-amizade.js --aplicar --adjudicacao=arquivo.json
 *   node scripts/backfill-amizade.js --aplicar --apagar-stale   # remove extras fora do plano
 *
 * ═══ AS TRÊS TRAVAS QUE A AUDITORIA EXTERNA EXIGIU (29/ago/2026) ═══════════════════════
 *
 * ⛔ NADA DO LEGADO VIRA AUTORIDADE. (Este parágrafo já disse o contrário duas vezes; a
 *   regra atual é esta.) `users.friends`, `friendRequestsSent` e `friendRequestsReceived`
 *   eram graváveis CROSS-USER por qualquer autenticado — quem explorava a falha podia
 *   escrever OS DOIS LADOS, então nem a reciprocidade distingue amizade real de ataque.
 *   Tudo que vem do legado nasce `legacy_unverified`: relação existe, mas NÃO concede
 *   `friendAccess`. `accepted` só por reconfirmação pela autoridade nova (depois do corte)
 *   ou por adjudicação com evidência independente do array vulnerável.
 *   Unilateral e identidade não resolvida vão pra QUARENTENA. `--aplicar` ABORTA enquanto
 *   houver quarentena bloqueante sem adjudicação escrita.
 *
 * P0-3 — "EXISTE COMO DOC ID EM users" NÃO É "É UID VIVO". Nesta base há lápides
 *   (`mergedInto`) e já houve doc com chave de e-mail. Toda identidade passa por
 *   `user-vivo-core.uidVivo` antes de entrar no cânone: lápide resolve pra conta viva,
 *   corrente quebrada/em ciclo NÃO resolve (e o caso é reportado, nunca chutado).
 *   MEDIDO na base em 29/ago/2026: 260 perfis, 0 com chave de e-mail, 14 lápides,
 *   13 entradas de `friends` apontando pra lápide, 8 pra doc inexistente.
 *
 * B — NADA DE "✅" ANTES DA CONFERÊNCIA. Depois de escrever, relê `friendships` e
 *   `friendAccess` do banco e compara com o plano. Divergência = saída não-zero.
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const core = require(path.join(__dirname, '..', 'functions', 'amizade-authority-core.js'));
const userVivo = require(path.join(__dirname, '..', 'functions', 'user-vivo-core.js'));
const vida = require(path.join(__dirname, '..', 'functions', 'amizade-lifecycle.js'));
const faseMod = require(path.join(__dirname, '..', 'functions', 'amizade-fase.js'));
/* ⚠️ `SP_PROJECT` existe pra o TESTE poder rodar isto contra o emulador (com
 * FIRESTORE_EMULATOR_HOST). Sem override o alvo é sempre produção — a adjudicação de
 * e-mail precisava de prova funcional, não de regex sobre o fonte. */
const PROJETO = process.env.SP_PROJECT || 'scoreplace-app';
require('./preflight-alvo').preflight('backfill-amizade', PROJETO);
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const db = admin.firestore();

const APLICAR = process.argv.includes('--aplicar');
const APAGAR_STALE = process.argv.includes('--apagar-stale');
const FASE_ARG = (process.argv.find((a) => a.startsWith('--fase=')) || '').split('=')[1];
const MANUT_ARG = (process.argv.find((a) => a.startsWith('--maintenance=')) || '').split('=')[1];
const PRIMEIRO_CORTE = process.argv.includes('--preflight-primeiro-corte');
const ADJ_ARG = (process.argv.find((a) => a.startsWith('--adjudicacao=')) || '').split('=')[1];
const AGORA = new Date().toISOString();
const L = (v) => Array.isArray(v) ? v.filter((x) => x != null && x !== '').map(String) : [];
const morra = (m) => { console.error('\n⛔ ABORTA: ' + m); process.exit(1); };

/* ⛔ 5ª auditoria (ponto 4): O BACKFILL É ONE-SHOT, E ISSO PRECISA SER MECÂNICO.
 * Rodar isto DEPOIS do go-live seria catastrófico: as amizades criadas pela autoridade
 * nova (accepted, com friendAccess) não estão no plano — o script as veria como "extras",
 * e `--apagar-stale` DESTRUIRIA estado legítimo criado depois do corte.
 * A trava é um marcador server-side em `_meta/amizadeMigration`, com fases explícitas:
 *   not_started → frozen → backfilled → live
 * `--aplicar` só roda em `frozen`. Depois de `live`, o script RECUSA escrever, e
 * `--apagar-stale` deixa de existir. Mudar de fase é ato explícito (`--fase=`), registrado
 * com data no próprio documento. */
const FASES = ['not_started', 'frozen', 'backfilled', 'live'];
/* ⛔ 6ª auditoria (ponto 6): ISTO NÃO ERA UMA MÁQUINA DE ESTADOS. `--fase=` aceitava
 * qualquer fase válida e gravava, independente da atual — então dava pra fazer
 * `live → frozen` e rodar o backfill destrutivo de novo, derrotando a trava one-shot.
 * Agora só a transição normal passa. Rewind NÃO é caso de `--fase=`: quem volta estado é o
 * `restore-amizade-legado.js`, que restaura dados E marcador juntos. */
const TRANSICOES = {
  not_started: ['frozen'],
  frozen:      ['backfilled'],
  backfilled:  ['live'],
  live:        [],
};
const MARCADOR = '_meta/amizadeMigration';
async function lerFase() {
  const d = await db.doc(MARCADOR).get();
  const f = d.exists ? String((d.data() || {}).fase || '') : 'not_started';
  if (!FASES.includes(f)) morra('fase desconhecida em ' + MARCADOR + ': "' + f + '". Estado inesperado aborta.');
  return f;
}
async function lerEstado() { return faseMod.estado(db); }

async function gravarFase(nova, extra) {
  await db.doc(MARCADOR).set(Object.assign({
    fase: nova, projeto: PROJETO, em: new Date().toISOString(),
    por: 'backfill-amizade',
  }, extra || {}), { merge: true });
  console.log('fase da migração → ' + nova);
}

(async () => {
  console.log(APLICAR ? '⚠️  MODO APLICAR\n' : '🔍 DRY-RUN — não escreve nada\n');

  /* ── PRE-FLIGHT DO PRIMEIRO CORTE (8ª auditoria, ponto 5) ──────────────────
   * Antes do primeiro cutover não basta ASSUMIR que o marcador está ausente/not_started.
   * Uma tentativa anterior ou um comando acidental deixaria as Functions novas subindo
   * LIBERADAS enquanto o runbook acha que estão congeladas. Retomar uma migração
   * interrompida é outro modo, e tem que ser dito explicitamente. */
  if (PRIMEIRO_CORTE) {
    const est = await lerEstado();
    console.log('marcador: fase=' + est.fase + ' maintenance=' + est.maintenance +
      (est.existe === false ? ' (documento ausente)' : ''));
    if (est.erroLeitura) morra('não foi possível LER o marcador. Sem saber o estado, não se começa um corte.');
    if (est.fase !== 'not_started') {
      morra('o marcador já está em "' + est.fase + '" — isto NÃO é um primeiro corte. ' +
            'Se a intenção é RETOMAR uma migração interrompida, siga a partir da fase atual, ' +
            'conscientemente, e não por este pre-flight.');
    }
    if (est.maintenance === true) {
      morra('`maintenance` está LIGADA. Um primeiro corte parte de manutenção desligada — ' +
            'ligue-a como parte do procedimento, não antes dele.');
    }
    console.log('✅ pre-flight ok: marcador em not_started, sem manutenção, projeto ' + PROJETO + '.');
    return;
  }

  // ── manutenção: liga/desliga SEM tocar na fase ──────────────────────────
  if (MANUT_ARG) {
    if (MANUT_ARG !== 'on' && MANUT_ARG !== 'off') morra('--maintenance= tem que ser `on` ou `off`.');
    const est = await lerEstado();
    console.log('fase: ' + est.fase + ' · maintenance atual: ' + est.maintenance + ' → ' + MANUT_ARG);
    if (!APLICAR) { console.log('🔍 DRY-RUN — manutenção NÃO alterada. Use --aplicar.'); return; }
    await db.doc(MARCADOR).set({
      maintenance: MANUT_ARG === 'on', maintenanceEm: new Date().toISOString(), projeto: PROJETO,
    }, { merge: true });
    const depois = await lerEstado();
    console.log('maintenance = ' + depois.maintenance + ' · fase INTACTA em ' + depois.fase);
    if (depois.maintenance !== (MANUT_ARG === 'on')) morra('a manutenção não foi aplicada.');
    return;
  }

  // ── troca de fase explícita e nada mais ─────────────────────────────────
  if (FASE_ARG) {
    if (!FASES.includes(FASE_ARG)) morra('--fase= tem que ser um de: ' + FASES.join(', '));
    const atual = await lerFase();
    console.log('fase atual: ' + atual + ' → pedida: ' + FASE_ARG);
    const permitidas = TRANSICOES[atual] || [];
    if (!permitidas.includes(FASE_ARG)) {
      morra('transição PROIBIDA: ' + atual + ' → ' + FASE_ARG + '. ' +
            (permitidas.length ? 'De "' + atual + '" só se vai para: ' + permitidas.join(', ') + '.'
                               : '"' + atual + '" é estado final.') +
            ' Para voltar atrás use scripts/restore-amizade-legado.js, que restaura dados E marcador juntos.');
    }
    if (!APLICAR) { console.log('🔍 DRY-RUN — fase NÃO alterada. Use --aplicar.'); return; }
    await gravarFase(FASE_ARG, { faseAnterior: atual });
    return;
  }

  const est0 = await lerEstado();
  const fase = est0.fase;
  console.log('fase da migração: ' + fase + ' · maintenance: ' + est0.maintenance + ' (projeto ' + PROJETO + ')');
  if (APLICAR) {
    if (fase === 'live') {
      morra('a migração já está LIVE. O backfill é one-shot: rodá-lo agora veria as amizades ' +
            'criadas depois do corte como "extras" e --apagar-stale as DESTRUIRIA. ' +
            'Nada foi lido nem escrito.');
    }
    /* ⛔ 8ª auditoria (ponto 2): `maintenance` é PAUSA, não migração. Ela nunca autoriza o
     * backfill — senão o rollback seguro (que liga manutenção) reabriria a escrita
     * destrutiva. Quem autoriza o backfill é EXCLUSIVAMENTE `fase === 'frozen'`. */
    if (!faseMod.backfillAutorizado(est0)) {
      morra('o backfill só roda com fase="frozen" e maintenance=false ' +
            '(está em fase="' + fase + '", maintenance=' + est0.maintenance + '). ' +
            'Manutenção é pausa operacional e NÃO autoriza migração.');
    }
  }
  if (APAGAR_STALE && !faseMod.backfillAutorizado(est0)) {
    morra('--apagar-stale só existe com fase="frozen" e maintenance=false.');
  }


  const snap = await db.collection('users').get();
  const cru = {};
  snap.forEach((d) => { cru[d.id] = d.data() || {}; });
  console.log('perfis lidos: ' + snap.size);

  // ── 1) RESOLUÇÃO DE IDENTIDADE (P0-3) ─────────────────────────────────────
  // Cada doc id e cada entrada dos três arrays vira uid canônico VIVO, ou é reportado.
  // índice e-mail → uids, montado UMA vez (o valor pode casar com vários docs: lápide +
  // sobrevivente têm o mesmo e-mail, e é isso que exige a resolução pela conta viva).
  const porEmail = new Map();
  const addEmail = (e, uid) => {
    const k = String(e || '').trim().toLowerCase();
    if (!k || k.indexOf('@') === -1) return;
    if (!porEmail.has(k)) porEmail.set(k, new Set());
    porEmail.get(k).add(uid);
  };
  Object.keys(cru).forEach((uid) => {
    const d = cru[uid];
    addEmail(d.email, uid); addEmail(d.email_lower, uid);
    (Array.isArray(d.linkedEmails) ? d.linkedEmails : []).forEach((e) => addEmail(e, uid));
  });

  const cache = new Map();

  /* ⛔ 3ª auditoria (ponto 4): E-MAIL NÃO É UM PROBLEMA SÓ — são dois, e a versão anterior
   * abortava o backfill inteiro por causa dos dois juntos.
   *   (A) doc `users/{email}` — o DOC é keyed por e-mail. Isso não é uid e não pode virar
   *       identidade: exige migração explícita antes. Continua ABORTANDO (é raro e grave).
   *   (B) e-mail dentro de `friends[]`/requests — resíduo do tempo em que a lista guardava
   *       e-mail. Aqui dá pra resolver: procura o e-mail nos campos de identidade e, se
   *       houver EXATAMENTE UMA conta viva, usa. Zero ou mais de uma ⇒ QUARENTENA.
   * Nunca converte silenciosamente e nunca joga o backfill fora por conta de um `@`. */
  async function resolverEmailEmArray(v) {
    const k = v.trim().toLowerCase();
    const cands = porEmail.get(k);
    const brutos = cands ? [...cands] : [];
    const vivos = [];
    for (const c of brutos) {
      const vivo = await userVivo.uidVivo(db, c);
      if (vivo) vivos.push(vivo);                   // lápide e sobrevivente colapsam aqui
    }
    // a DECISÃO é pura e testada em functions/test-amizade-authority-core.js
    const d = core.decidirEmailLegado(vivos, brutos);
    if (d.erro === 'email-sem-conta') {
      /* ponto 8: ausência nos perfis do Firestore NÃO prova ausência no Firebase Auth —
       * pode ser um Auth ghost cujo e-mail nunca virou documento. Pergunta antes. */
      try {
        const u = await admin.auth().getUserByEmail(k);
        if (u) return { erro: 'auth-ghost-email', valor: v, detalhe: 'e-mail existe no Auth (uid ' + u.uid + ') sem perfil' };
      } catch (e) {
        const cod = (e && e.code) || '';
        if (cod !== 'auth/user-not-found') return { erro: 'auth-indisponivel', valor: v, detalhe: cod };
      }
    }
    return d.uid ? d : Object.assign({ valor: v }, d);
  }

  /* Pergunta ao Firebase Auth por um uid que não tem documento em `users/`. */
  async function _semDoc(uid) {
    try {
      const u = await admin.auth().getUser(uid);
      if (u) return { erro: 'auth-ghost', detalhe: 'conta EXISTE no Firebase Auth sem doc em users/' };
    } catch (e) {
      const cod = (e && e.code) || '';
      if (cod === 'auth/user-not-found') {
        // prova positiva: não há doc E não há conta de login. Aí sim é descarte provado.
        return { erro: 'doc-inexistente' };
      }
      // não conseguiu PERGUNTAR — falha fechada
      return { erro: 'auth-indisponivel', detalhe: cod || (e && e.message) };
    }
    return { erro: 'doc-inexistente' };
  }

  async function resolver(x, ondeEstou) {
    const v = String(x || '');
    if (!v) return null;
    const chave = ondeEstou + '|' + v;
    if (cache.has(chave)) return cache.get(chave);
    let r = null;
    if (v.indexOf('@') !== -1) {
      r = (ondeEstou === 'docId')
        ? { erro: 'doc-com-chave-de-email' }        // (A) — aborta
        : await resolverEmailEmArray(v);           // (B) — resolve ou quarentena
    } else {
      const d = cru[v];
      /* ⛔ 7ª auditoria (ponto 8): "não tem doc em users/" NÃO prova que a pessoa nunca
       * existiu. O próprio `mergePhoneAccount` tem fluxo explícito de "Auth ghost": conta
       * no Firebase Auth SEM documento em `users/`. Descartar essas referências seria
       * apagar a amizade de gente que existe. Então pergunta ao Auth — e se não der pra
       * perguntar, vai pra quarentena, nunca pro descarte. */
      if (!d) r = await _semDoc(v);
      else if (d.deleted === true || d.deletedAt) r = { erro: 'conta-excluida' };
      else {
        const vivo = await userVivo.uidVivo(db, v);
        if (!vivo) r = { erro: 'lapide-nao-resolve' };                    // corrente quebrada/ciclo
        else r = { uid: vivo, viaLapide: vivo !== v };
      }
    }
    cache.set(chave, r);
    return r;
  }

  const perfis = {}, naoResolvidos = [], resolvidosViaLapide = [], resolvidosPorEmail = [];
  for (const docId of Object.keys(cru)) {
    const dono = await resolver(docId, 'docId');
    if (!dono || dono.erro) {
      /* O próprio doc não é uma conta viva (lápide, doc com chave de e-mail, excluída).
       * Os arrays dele não entram: quem vale é o sobrevivente, cujos arrays já são lidos
       * na volta dele.
       * ⛔ 7ª auditoria (ponto 8): MAS não pula em silêncio se ele carregar conteúdo social
       * que pode não existir no sobrevivente. Doc SEM conteúdo social não perde nada e não
       * precisa bloquear a migração inteira — relatar um par degenerado (uid consigo mesmo)
       * seria ruído que o operador não tem como adjudicar. */
      const dd = cru[docId] || {};
      const temSocial = L(dd.friends).length || L(dd.friendRequestsSent).length || L(dd.friendRequestsReceived).length;
      if (dono && dono.erro !== 'doc-inexistente' && temSocial) {
        naoResolvidos.push({ onde: docId, campo: '(doc)', valor: docId, erro: dono.erro,
          detalhe: 'doc não-canônico com ' + temSocial + ' referência(s) social(is) que podem não existir no sobrevivente' });
      }
      continue;
    }
    if (dono.viaLapide) continue;   // lápide: o conteúdo dela não é a verdade do vivo
    const x = cru[docId];
    const alvo = perfis[dono.uid] || (perfis[dono.uid] = { friends: [], friendRequestsSent: [], friendRequestsReceived: [] });
    for (const campo of ['friends', 'friendRequestsSent', 'friendRequestsReceived']) {
      for (const v of L(x[campo])) {
        const r = await resolver(v, campo);
        if (!r || r.erro) { naoResolvidos.push({ onde: docId, campo, valor: v, erro: (r && r.erro) || 'desconhecido' }); continue; }
        if (r.uid === dono.uid) continue;                    // auto-referência pós-fusão
        if (r.viaLapide) resolvidosViaLapide.push({ onde: docId, campo, de: v, para: r.uid });
        if (r.viaEmail) resolvidosPorEmail.push({ onde: docId, campo, de: v, para: r.uid });
        if (alvo[campo].indexOf(r.uid) === -1) alvo[campo].push(r.uid);
      }
    }
  }

  console.log('contas vivas consideradas: ' + Object.keys(perfis).length);
  console.log('entradas resolvidas via lápide: ' + resolvidosViaLapide.length);
  resolvidosViaLapide.slice(0, 8).forEach((r) => console.log('   ↪ ' + r.onde + '.' + r.campo + ': ' + r.de + ' → ' + r.para));
  console.log('entradas NÃO resolvidas (ficam de fora, reportadas): ' + naoResolvidos.length);
  const quarentenaExtra = [];
  const porErro = {};
  naoResolvidos.forEach((n) => { porErro[n.erro] = (porErro[n.erro] || 0) + 1; });
  if (naoResolvidos.length) console.log('   ' + JSON.stringify(porErro));
  naoResolvidos.slice(0, 10).forEach((n) => console.log('   · ' + n.onde + '.' + n.campo + ' → ' + n.valor + ' [' + n.erro + ']'));
  console.log('e-mails em array resolvidos pra uid vivo: ' + resolvidosPorEmail.length);
  resolvidosPorEmail.slice(0, 8).forEach((r) => console.log('   ✉ ' + r.onde + '.' + r.campo + ': ' + r.de + ' → ' + r.para));
  if (porErro['doc-com-chave-de-email']) {
    morra('há doc de usuário com CHAVE DE E-MAIL (users/{email}). Migre-os para uid ANTES ' +
          'do backfill — e a migração tem que TRANSPORTAR a amizade, não apagar o doc legado.');
  }
  /* ⛔ 6ª auditoria (ponto 8): NENHUMA referência social some num log.
   * Antes, `doc-inexistente`, `conta-excluida` e `lapide-nao-resolve` eram só reportados,
   * ficavam fora do plano, e o cache era reconstruído sem eles — perda silenciosa decidida
   * por um `console.log`. Agora cada não-resolvido cai numa de DUAS categorias:
   *   · DESCARTE_PROVADO      — há evidência objetiva de que deve sumir, e o motivo fica
   *                             registrado no relatório (não bloqueia);
   *   · QUARENTENA_BLOQUEANTE — exige adjudicação humana.
   * O critério é: a referência aponta para algo que COMPROVADAMENTE não existe mais como
   * pessoa? Então é descarte provado. Aponta para algo ambíguo ou que ainda pode ser
   * alguém? Então é quarentena. */
  /* ⛔ 7ª auditoria (ponto 8): só entra aqui o que tem PROVA POSITIVA de inexistência —
   * conferido no Firestore E no Firebase Auth. "Não achei no Firestore" não é prova. */
  const DESCARTE_PROVADO = {
    'doc-inexistente': 'sem documento em users/ E sem conta no Firebase Auth (auth/user-not-found) — conferido nos dois',
    'conta-excluida': 'a conta foi excluída pelo dono dela (deleted/deletedAt)',
    'email-sem-conta': 'o e-mail não existe nos perfis NEM no Firebase Auth — conferido nos dois',
  };
  const QUARENTENA_TIPOS = {
    'auth-ghost': 'conta EXISTE no Firebase Auth sem doc em users/ — identidade a resolver, nunca descartar',
    'auth-ghost-email': 'o e-mail existe no Firebase Auth sem perfil — identidade a resolver',
    'auth-indisponivel': 'não foi possível CONSULTAR o Firebase Auth — falha fechada, nunca descarte por dúvida',
    'lapide-nao-resolve': 'lápide com corrente quebrada ou em ciclo — pode haver pessoa viva por trás',
    'email-ambiguo': 'o e-mail resolve para MAIS DE UMA conta viva',
    'email-so-resolve-pra-conta-morta': 'o e-mail só chega a conta morta; pode haver sobrevivente não mapeado',
    'doc-com-chave-de-email': 'documento legado com chave de e-mail — exige migração explícita',
  };
  const descartesProvados = [];
  naoResolvidos.forEach((n) => {
    if (DESCARTE_PROVADO[n.erro]) {
      descartesProvados.push({ onde: n.onde, campo: n.campo, valor: n.valor,
        categoria: 'DESCARTE_PROVADO', motivo: DESCARTE_PROVADO[n.erro] });
      return;
    }
    quarentenaExtra.push({
      id: n.onde + '|' + n.campo + '|' + n.valor,
      tipo: (n.erro.indexOf('email') === 0 ? 'email-' : '') + n.erro,
      bloqueia: true, afirmadoPor: n.onde, ausenteEm: n.valor,
      motivo: QUARENTENA_TIPOS[n.erro] || ('não resolvido: ' + n.erro),
    });
  });
  console.log('\n── REFERÊNCIAS NÃO RESOLVIDAS, CLASSIFICADAS ──');
  console.log('DESCARTE_PROVADO:      ' + descartesProvados.length);
  const porMotivo = {};
  descartesProvados.forEach((d) => { porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1; });
  Object.keys(porMotivo).forEach((m) => console.log('   · ' + porMotivo[m] + '× ' + m));
  console.log('QUARENTENA_BLOQUEANTE: ' + quarentenaExtra.length);
  quarentenaExtra.slice(0, 10).forEach((q) => console.log('   · ' + q.tipo + ' — ' + q.motivo));

  // ── 2) PLANO ──────────────────────────────────────────────────────────────
  const plano = core.planejarBackfill(perfis, AGORA);
  plano.quarentena = plano.quarentena.concat(quarentenaExtra);
  const legado = plano.relacoes.filter((r) => r.doc.status === 'legacy_unverified');
  const porOrigem = {};
  legado.forEach((r) => { porOrigem[r.doc.legacyOrigem] = (porOrigem[r.doc.legacyOrigem] || 0) + 1; });
  const bloqueantes = plano.quarentena.filter((q) => q.bloqueia);

  console.log('\n── PLANO ──');
  console.log('relações LEGACY_UNVERIFIED:     ' + legado.length + '  ' + JSON.stringify(porOrigem));
  console.log('⛔ friendAccess concedido:      ' + plano.acessos.length + '  (tem que ser 0: legado NÃO é prova)');
  console.log('QUARENTENA bloqueante:          ' + bloqueantes.length);
  console.log('quarentena informativa:         ' + (plano.quarentena.length - bloqueantes.length));
  if (plano.acessos.length !== 0) morra('o plano concedeu friendAccess a partir do legado. Isso não pode acontecer.');

  if (bloqueantes.length) {
    console.log('\n⚠️  CASOS QUE EXIGEM ADJUDICAÇÃO (nenhum vira amizade sozinho):');
    bloqueantes.forEach((q) => console.log('   [' + q.tipo + '] ' + q.id + ' — ' + q.afirmadoPor + ' afirma, ' + q.ausenteEm + ' não'));
  }
  // A volta tem que fechar: todo par recíproco do legado vira uma relação legacy_unverified
  const doPerfil = new Set();
  Object.keys(perfis).forEach((uid) => {
    perfis[uid].friends.forEach((o) => {
      if (perfis[o] && perfis[o].friends.indexOf(uid) !== -1) { try { doPerfil.add(core.pairId(uid, o)); } catch (e) {} }
    });
  });
  const doPlano = new Set(legado.filter((r) => r.doc.legacyOrigem === 'friends-reciproco').map((r) => r.id));
  const faltando = [...doPerfil].filter((p) => !doPlano.has(p));
  const sobrando = [...doPlano].filter((p) => !doPerfil.has(p));
  console.log('\n── CONFERÊNCIA DO PLANO ──');
  console.log('pares recíprocos nos perfis: ' + doPerfil.size + ' · no plano (legacy): ' + doPlano.size);
  if (faltando.length || sobrando.length) {
    faltando.slice(0, 10).forEach((p) => console.error('   falta: ' + p));
    sobrando.slice(0, 10).forEach((p) => console.error('   sobra: ' + p));
    morra('a volta não fecha.');
  }
  console.log('a volta fecha.');

  if (!APLICAR) {
    console.log('\n🔍 DRY-RUN — nada escrito.');
    if (bloqueantes.length) {
      console.log('   Para aplicar, resolva a quarentena e passe --adjudicacao=<arquivo.json> com:');
      console.log('   [{"id":"<pairId>","decisao":"descartar"|"aceitar","porQue":"..."}]');
    }
    return;
  }

  // ── 3) ADJUDICAÇÃO ────────────────────────────────────────────────────────
  /* ⛔ 6ª auditoria (ponto 9): a adjudicação é VALIDADA INTEIRA, antes de qualquer escrita.
   * Antes, qualquer objeto com o id certo satisfazia `semDecisao`, e qualquer `decisao`
   * diferente de "aceitar" caía implicitamente em descarte — então um typo como
   * `"aceitarr"` funcionava como DESCARTE SILENCIOSO de uma amizade. */
  const DECISOES = ['aceitar', 'descartar'];
  let adj = {};
  if (ADJ_ARG) {
    const lista = JSON.parse(fs.readFileSync(ADJ_ARG, 'utf8'));
    if (!Array.isArray(lista)) morra('o arquivo de adjudicação tem que ser uma LISTA.');
    const idsQuarentena = new Set(plano.quarentena.map((q) => q.id));
    const vistos = new Set();
    lista.forEach((d, i) => {
      const onde = 'adjudicação #' + (i + 1) + (d && d.id ? ' (' + d.id + ')' : '');
      if (!d || !d.id) morra(onde + ': sem `id`.');
      if (vistos.has(d.id)) morra(onde + ': ID DUPLICADO no arquivo. Duas decisões pro mesmo caso é ambiguidade, não decisão.');
      vistos.add(d.id);
      if (!idsQuarentena.has(d.id)) morra(onde + ': não corresponde a nenhum caso de quarentena deste plano.');
      if (!DECISOES.includes(d.decisao)) {
        morra(onde + ': decisão "' + d.decisao + '" desconhecida. Só existe: ' + DECISOES.join(' | ') + '.');
      }
      if (!d.porQue || !String(d.porQue).trim()) {
        morra(onde + ': `porQue` vazio. Vale para "aceitar" E para "descartar" — descartar amizade sem registrar o motivo é perda de dado sem rastro.');
      }
      adj[d.id] = d;
    });
    console.log('\nadjudicação lida e validada: ' + Object.keys(adj).length + ' decisões de ' + ADJ_ARG);
  }
  const semDecisao = bloqueantes.filter((q) => !adj[q.id]);
  if (semDecisao.length) {
    semDecisao.slice(0, 10).forEach((q) => console.error('   sem decisão: ' + q.id + ' [' + q.tipo + ']'));
    morra(semDecisao.length + ' caso(s) de quarentena sem adjudicação. Nada foi escrito.');
  }
  /* ⛔ 4ª auditoria (ponto 2): A ADJUDICAÇÃO DE E-MAIL É OUTRA COISA.
   * Antes, uma quarentena de e-mail caía no adjudicador genérico e um `decisao:"aceitar"`
   * montava o par com `afirmadoPor + ausenteEm` — e `ausenteEm`, nessas quarentenas, é
   * o E-MAIL. Isso gravaria um e-mail como uid dentro do cânone, e o `id` textual da
   * quarentena (`doc|campo|email`) viraria id de friendship. Proibido.
   * Agora quarentena de identidade exige `resolverParaUid` explícito, o uid é VALIDADO
   * (existe, resolve por userVivo, é canônico e vivo, não é e-mail, não é a própria
   * pessoa) e o pairId é RECALCULADO com os dois uids canônicos. */
  /* ⛔ 7ª auditoria (ponto 9): a quarentena se classifica por NATUREZA, não por prefixo.
   *   RELAÇÃO   — os dois lados já são uid canônico conhecido (ex.: amizade unilateral).
   *               `aceitar` monta o par com os dois uids que já estão ali.
   *   IDENTIDADE — um dos lados NÃO é uid canônico resolvido: e-mail solto, lápide que não
   *               resolve, Auth ghost, Auth indisponível. Aceitar usando `ausenteEm` bruto
   *               gravaria um e-mail (ou um uid morto) dentro do cânone. Exige
   *               `resolverParaUid` explícito e validado.
   * Antes só `email-*` tinha tratamento especial — `lapide-nao-resolve` é identidade não
   * resolvida do mesmo jeito e caía no caminho genérico. */
  const TIPOS_IDENTIDADE = [
    'email-email-sem-conta', 'email-email-ambiguo', 'email-email-so-resolve-pra-conta-morta',
    'email-auth-ghost-email', 'lapide-nao-resolve', 'auth-ghost', 'auth-indisponivel',
    'doc-com-chave-de-email',
  ];
  const EH_IDENTIDADE = (q) => {
    const t = String(q.tipo || '');
    return TIPOS_IDENTIDADE.includes(t) || t.indexOf('email-') === 0 || t.indexOf('auth-') === 0;
  };
  const EH_EMAIL = EH_IDENTIDADE;
  const aceitosPorAdj = [];
  for (const q of bloqueantes) {
    const d = adj[q.id];
    if (d.decisao !== 'aceitar') continue;
    if (!d.porQue) morra('adjudicação de ' + q.id + ' sem "porQue" — decisão sem registro não vale.');

    let a = q.afirmadoPor, b = q.ausenteEm;

    if (EH_IDENTIDADE(q)) {
      if (!d.resolverParaUid) {
        morra('quarentena de IDENTIDADE ' + q.id + ' (' + q.tipo + ') NÃO aceita ' +
              '`decisao:"aceitar"` sozinha: um dos lados não é uid canônico resolvido. ' +
              'Informe `resolverParaUid` com o uid canônico vivo.');
      }
      const alvo = String(d.resolverParaUid);
      if (alvo.indexOf('@') !== -1) morra('resolverParaUid de ' + q.id + ' é um e-mail, não um uid.');
      if (!cru[alvo]) morra('resolverParaUid de ' + q.id + ' não existe em users/: ' + alvo);
      const vivo = await userVivo.uidVivo(db, alvo);
      if (!vivo) morra('resolverParaUid de ' + q.id + ' não resolve para conta viva: ' + alvo);
      if (vivo !== alvo) morra('resolverParaUid de ' + q.id + ' é lápide (' + alvo + ' → ' + vivo + '). Informe o uid canônico.');
      const dono = await userVivo.uidVivo(db, a);
      if (!dono) morra('o lado conhecido de ' + q.id + ' não resolve para conta viva: ' + a);
      if (dono === vivo) morra('resolverParaUid de ' + q.id + ' é a própria pessoa.');
      a = dono; b = vivo;
    }

    // ⛔ pairId SEMPRE recalculado com os dois uids canônicos — nunca o id da quarentena
    let novoId;
    try { novoId = core.pairId(a, b); } catch (e) { morra('par inválido em ' + q.id + ': ' + e.message); }
    const par = core.parOrdenado(a, b);
    aceitosPorAdj.push({ id: novoId, doc: { uidA: par.uidA, uidB: par.uidB, status: 'accepted',
      requestedBy: a, createdAt: AGORA, acceptedAt: AGORA,
      adjudicado: { por: 'backfill-amizade', em: AGORA, porQue: String(d.porQue),
                    quarentena: q.id, tipo: q.tipo } } });
  }
  const relacoesFinais = plano.relacoes.concat(aceitosPorAdj);
  const acessosFinais = plano.acessos.concat(
    aceitosPorAdj.flatMap((r) => [{ uid: r.doc.uidA, friendUid: r.doc.uidB }, { uid: r.doc.uidB, friendUid: r.doc.uidA }]));
  if (aceitosPorAdj.length) console.log('adjudicados como amizade: ' + aceitosPorAdj.length + ' (com motivo registrado no doc)');

  /* ── 3b) ESTABILIDADE DO SNAPSHOT (7ª auditoria, ponto 14) ──────────────────
   * Defesa em profundidade contra writer esquecido: relê AGORA os mesmos campos sociais
   * que geraram o plano e compara o hash. Se mudou qualquer coisa entre a leitura e este
   * instante, alguém escreveu apesar do freeze — e o plano já está desatualizado antes de
   * ser aplicado. Aborta sem escrever. */
  const hashSocial = (mapa) => {
    const chaves = Object.keys(mapa).sort();
    const corpo = chaves.map((u) => u + ':' + JSON.stringify([
      (mapa[u].friends || []).slice().sort(),
      (mapa[u].friendRequestsSent || []).slice().sort(),
      (mapa[u].friendRequestsReceived || []).slice().sort(),
    ])).join('|');
    return crypto.createHash('sha256').update(corpo).digest('hex');
  };
  const hashEntrada = hashSocial(perfis);
  console.log('\n── ESTABILIDADE DO SNAPSHOT ──');
  console.log('hash da entrada que gerou o plano: ' + hashEntrada.slice(0, 16) + '…');

  const snap2 = await db.collection('users').get();
  const cru2 = {}; snap2.forEach((d) => { cru2[d.id] = d.data() || {}; });
  const perfis2 = {};
  Object.keys(perfis).forEach((u) => {
    const x = cru2[u] || {};
    perfis2[u] = {
      friends: L(x.friends).filter((v) => perfis[u].friends.indexOf(v) !== -1 || cru2[v] || true),
      friendRequestsSent: L(x.friendRequestsSent),
      friendRequestsReceived: L(x.friendRequestsReceived),
    };
  });
  // compara só o que é comparável: o dado CRU dos mesmos perfis, sem re-resolver identidade
  const cruDe = (fonte) => {
    const m = {}; Object.keys(perfis).forEach((u) => {
      const x = fonte[u] || {};
      m[u] = { friends: L(x.friends), friendRequestsSent: L(x.friendRequestsSent), friendRequestsReceived: L(x.friendRequestsReceived) };
    }); return m;
  };
  const hashAntes = hashSocial(cruDe(cru));
  const hashAgora = hashSocial(cruDe(cru2));
  if (hashAntes !== hashAgora) {
    console.error('   antes: ' + hashAntes.slice(0, 16) + '…');
    console.error('   agora: ' + hashAgora.slice(0, 16) + '…');
    Object.keys(perfis).forEach((u) => {
      const a = JSON.stringify(cruDe(cru)[u]), b2 = JSON.stringify(cruDe(cru2)[u]);
      if (a !== b2) console.error('   mudou: ' + u);
    });
    morra('o estado social MUDOU entre a leitura e a escrita. Algum writer escapou do ' +
          'congelamento (Etapa A). O plano já está desatualizado — nada foi escrito.');
  }
  console.log('o estado social NÃO mudou desde a leitura — o plano ainda descreve o banco.');

  // ── 4) ESCRITA ────────────────────────────────────────────────────────────
  let b = db.batch(), c = 0, n = 0;
  const lotes = [];
  const push = (ref, data) => { b.set(ref, data); c++; n++; if (c >= 400) { lotes.push(b); b = db.batch(); c = 0; } };
  relacoesFinais.forEach((r) => push(db.collection('friendships').doc(r.id), r.doc));
  /* ⛔ 7ª auditoria (ponto 5): `{ since: AGORA }` puro era o SEGUNDO formato — projeção sem
   * `ownerUid`/`friendUid` é órfã invisível pro retry. Agora vem do core, como as outras. */
  acessosFinais.forEach((a) => push(db.collection('friendAccess').doc(a.uid).collection('accepted').doc(a.friendUid),
    core.docAcesso(a.uid, a.friendUid, AGORA)));
  if (c > 0) lotes.push(b);
  for (let i = 0; i < lotes.length; i++) { await lotes[i].commit(); console.log('lote ' + (i + 1) + '/' + lotes.length); }
  console.log(n + ' documentos gravados.');

  // ── 5) RECONCILIAÇÃO EXATA (3ª auditoria, ponto 5) ────────────────────────
  /* ⛔ A versão anterior só conferia que o ESPERADO existe. Isso não basta: estado EXTRA
   * desconhecido (relação de uma execução anterior, projeção de uma relação já removida,
   * lixo de teste) passava batido e o script imprimia sucesso. Agora a comparação é de
   * IGUALDADE DE CONJUNTO nos dois lados — nada a mais, nada a menos.
   * Extra encontrado NÃO é apagado por conta própria: aborta e exige `--apagar-stale`,
   * que é decisão explícita de quem roda. */
  console.log('\n── RECONCILIAÇÃO EXATA (relendo o banco inteiro) ──');
  const fsSnap = await db.collection('friendships').get();
  const noBanco = new Map();
  fsSnap.forEach((d) => noBanco.set(d.id, d.data() || {}));
  const esperado = new Map(relacoesFinais.map((r) => [r.id, r.doc]));

  const problemas = [], extrasRel = [], extrasAcc = [];
  esperado.forEach((doc, id) => {
    const b2 = noBanco.get(id);
    if (!b2) return problemas.push('relação AUSENTE: ' + id);
    if (b2.status !== doc.status) problemas.push('status divergente em ' + id + ': banco=' + b2.status + ' plano=' + doc.status);
    if (b2.uidA !== doc.uidA || b2.uidB !== doc.uidB) problemas.push('par divergente em ' + id);
  });
  noBanco.forEach((_doc, id) => { if (!esperado.has(id)) extrasRel.push(id); });

  // TODAS as projeções do banco, não só as esperadas — collectionGroup pega as subcoleções
  const accSnap = await db.collectionGroup('accepted').get();
  const accNoBanco = new Set();
  accSnap.forEach((d) => {
    const pai = d.ref.parent.parent;                    // friendAccess/{uid}
    if (pai && pai.parent && pai.parent.id === 'friendAccess') accNoBanco.add(pai.id + '/' + d.id);
  });
  const accEsperadas = new Set();
  relacoesFinais.forEach((r) => {
    if (r.doc.status !== 'accepted') return;
    accEsperadas.add(r.doc.uidA + '/' + r.doc.uidB);
    accEsperadas.add(r.doc.uidB + '/' + r.doc.uidA);
  });
  accEsperadas.forEach((k) => { if (!accNoBanco.has(k)) problemas.push('projeção AUSENTE: ' + k); });
  accNoBanco.forEach((k) => { if (!accEsperadas.has(k)) extrasAcc.push(k); });

  // quarentena não pode ter virado relação nem acesso
  plano.quarentena.filter((q) => q.bloqueia).forEach((q) => {
    if (!esperado.has(q.id) && noBanco.has(q.id)) problemas.push('QUARENTENA vazou: ' + q.id);
  });

  console.log('friendships  → banco ' + noBanco.size + ' · plano ' + esperado.size + ' · extras ' + extrasRel.length);
  console.log('friendAccess → banco ' + accNoBanco.size + ' · plano ' + accEsperadas.size + ' · extras ' + extrasAcc.length);

  if (extrasRel.length || extrasAcc.length) {
    extrasRel.slice(0, 15).forEach((id) => console.error('   extra (relação): ' + id));
    extrasAcc.slice(0, 15).forEach((k) => console.error('   extra (projeção): ' + k));
    if (!APAGAR_STALE) {
      morra('há ' + (extrasRel.length + extrasAcc.length) + ' documento(s) EXTRA fora do plano. ' +
            'Isto NÃO é sucesso. Confira a lista acima e, se forem resíduo, rode de novo com --apagar-stale.');
    }
    console.log('\n⚠️  --apagar-stale: removendo ' + (extrasRel.length + extrasAcc.length) + ' documento(s) extra...');
    let sb = db.batch(), sc = 0;
    const sput = async (ref) => { sb.delete(ref); if (++sc >= 400) { await sb.commit(); sb = db.batch(); sc = 0; } };
    for (const id of extrasRel) await sput(db.collection('friendships').doc(id));
    for (const k of extrasAcc) {
      const [u, f] = k.split('/');
      await sput(db.collection('friendAccess').doc(u).collection('accepted').doc(f));
    }
    if (sc) await sb.commit();
    // relê e exige igualdade agora
    const relBase2 = await db.collection('friendships').get();
    const acc2 = await db.collectionGroup('accepted').get();
    let n2 = 0; acc2.forEach((d) => { const pai = d.ref.parent.parent; if (pai && pai.parent && pai.parent.id === 'friendAccess') n2++; });
    if (relBase2.size !== esperado.size) problemas.push('após limpeza: friendships ' + relBase2.size + ' ≠ ' + esperado.size);
    if (n2 !== accEsperadas.size) problemas.push('após limpeza: friendAccess ' + n2 + ' ≠ ' + accEsperadas.size);
    console.log('limpeza feita; conjuntos reconferidos.');
  }

  if (problemas.length) {
    problemas.slice(0, 20).forEach((p2) => console.error('   ✗ ' + p2));
    morra(problemas.length + ' divergência(s) entre banco e plano.');
  }
  // ── 6) CACHES `users.*` RECONSTRUÍDOS DO CÂNONE FINAL (4ª auditoria, ponto 3) ──
  /* Nada de preservar array antigo por inércia: os quatro campos são reescritos EXATAMENTE
   * a partir das relações finais. `legacy_unverified` não vira amizade nem convite, então
   * some do cache — é isso que faz o corte "falhar fechado" chegar até a tela. */
  console.log('\n── RECONSTRUINDO OS CACHES users.* A PARTIR DO CÂNONE ──');
  const tocados = new Set();
  relacoesFinais.forEach((r) => { tocados.add(r.doc.uidA); tocados.add(r.doc.uidB); });
  Object.keys(perfis).forEach((u) => tocados.add(u));   // quem tinha cache e agora não tem relação
  const nCache = await vida.reconstruirCache(db, [...tocados]);
  console.log(nCache + ' perfil(is) reescrito(s).');

  // conferência dos caches contra o cânone
  const problemasCache = [];
  for (const uid of tocados) {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) continue;
    const x = doc.data() || {};
    const esperadoCache = core.projetarCache(await vida.relacoesDe(db, uid), uid);
    const cmp = (campo) => JSON.stringify((x[campo] || []).slice().sort()) !== JSON.stringify(esperadoCache[campo]);
    ['friends', 'friendRequestsSent', 'friendRequestsReceived'].forEach((campo) => {
      if (cmp(campo)) problemasCache.push('cache divergente ' + uid + '.' + campo);
    });
    (x.friends || []).forEach((f) => {
      if (String(f).indexOf('@') !== -1) problemasCache.push('e-mail legado sobrou em ' + uid + '.friends: ' + f);
      if (f === uid) problemasCache.push('auto-amizade em ' + uid);
      if (!cru[f]) problemasCache.push('uid desconhecido em ' + uid + '.friends: ' + f);
      if ((x.friendRequestsSent || []).includes(f) || (x.friendRequestsReceived || []).includes(f)) {
        problemasCache.push('amigo E pendente ao mesmo tempo em ' + uid + ': ' + f);
      }
    });
  }
  if (problemasCache.length) {
    problemasCache.slice(0, 20).forEach((p2) => console.error('   ✗ ' + p2));
    morra(problemasCache.length + ' divergência(s) de cache contra o cânone.');
  }
  console.log('caches conferidos: ' + tocados.size + ' perfil(is), todos batendo com o cânone.');

  console.log('relações conferidas: ' + esperado.size + ' · projeções conferidas: ' + accEsperadas.size);
  console.log('quarentena NÃO vazou: ' + plano.quarentena.filter((q) => q.bloqueia).length + ' caso(s) fora do cânone');
  await gravarFase('backfilled', {
    relacoes: relacoesFinais.length, quarentena: plano.quarentena.filter((q) => q.bloqueia).length,
    hashEntrada: hashEntrada,     // ponto 14: fica registrado qual entrada gerou este cânone
  });
  console.log('\n✅ backfill aplicado e RECONCILIADO (igualdade de conjunto nos dois lados).');
  console.log('⏳ Depois de publicar a Etapa C, marque: node scripts/backfill-amizade.js --fase=live --aplicar');
})().catch((e) => { console.error('ERRO:', e); process.exit(1); });
