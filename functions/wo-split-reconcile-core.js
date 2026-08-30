/* wo-split-reconcile-core.js — O W.O. CHEGA NAS SUBCOLEÇÕES  (2.1.63)
 *
 * ⛔ O BURACO QUE ISTO FECHA, medido no Confra ao vivo em 30/ago/2026.
 * `mutateTournament` (js/firebase-db.js) é a porta do W.O., da substituição e da formação
 * de grupo. Ela roda o mutator sobre `doc.data()` — o documento CRU. Num torneio DIVIDIDO
 * isso é o documento MAGRO: `participants: []` e nenhum jogo. Consequências, todas vistas:
 *   ① o mutator não ACHA o jogo pra trocar o slot — a troca entra no `woLog` e na
 *      classificação e NÃO entra no jogo (a Nathalya seguiu jogando depois do W.O. dela);
 *   ② o substituto é empurrado pra `ft.participants`, que é um array vazio no doc, e a
 *      leitura seguinte (`montarDoBanco`) sobrescreve esse campo com a subcoleção — a
 *      pessoa SOME do elenco (aconteceu com três: Fábio Ruggiero, Tiago Lima, Erika Benedet);
 *   ③ o ausente não é desativado, e volta a ser sorteado na rodada seguinte.
 *
 * ⛔ E O CLIENTE NÃO PODE SER O CONSERTO: `firestore.rules` tem `allow write: if false` em
 * `inscritos` e "O CLIENTE NÃO ESCREVE AQUI. NUNCA." em `matches`. Cânone do dono: tudo roda
 * na CF, o cliente apenas dispara.
 *
 * ⭐ POR QUE UM GATILHO, e não uma CF chamável. O gatilho de `tournaments/{tid}` vê TODA
 * escrita, de QUALQUER cliente — inclusive o app NATIVO, que não tem auto-update e nunca vai
 * chamar CF nenhuma. Uma chamável só conserta quem atualizar. É o mesmo raciocínio (e o
 * mesmo gatilho) que já hospeda o espelho do roster.
 *
 * ⭐ AGE SOBRE O DELTA DO `woLog`, não sobre o histórico. Reconciliar o log inteiro a cada
 * escrita reabriria decisões antigas — e no ensaio do reparo manual isso apareceu na hora:
 * três ausentes de W.O. ANTERIORES à divisão estavam ativos de propósito, e um deles (Fábio
 * Simão) tinha sido REATIVADO À MÃO pelo organizador. Mexer ali seria desfazer decisão dele
 * com cara de conserto. Só o que ACABOU de entrar no log é reconciliado.
 *
 * ⛔ NÃO TOCA EM JOGO COM PLACAR. Reescrever quem jogou depois do resultado lançado é
 * reescrever história — e o guard não é teórico: no reparo manual ele barrou 9 jogos.
 *
 * Puro: recebe estado, devolve plano. Não lê nem escreve nada — quem faz I/O é o gatilho.
 * [[project_wo_nao_escreve_nas_subcolecoes]] [[project_dividir_exige_todo_escritor_ciente]]
 */

/** Entradas de `woLog` que existem em `depois` e não existiam em `antes`. Chave = `id`. */
function novasEntradasDeWo(antes, depois) {
  const jaTinha = {};
  ((antes && Array.isArray(antes.woLog)) ? antes.woLog : []).forEach((w) => {
    if (w && w.id) jaTinha[String(w.id)] = 1;
  });
  return ((depois && Array.isArray(depois.woLog)) ? depois.woLog : [])
    .filter((w) => w && w.id && !jaTinha[String(w.id)] && w.status === 'active');
}

/** Este torneio guarda elenco/jogos fora do documento? */
function precisaReconciliar(depois) {
  const fora = (depois && Array.isArray(depois._semPesados)) ? depois._semPesados : [];
  return fora.indexOf('participants') !== -1 || fora.indexOf('matches') !== -1;
}

/* ── UM SLOT DO JOGO TROCA EM TRÊS LUGARES ────────────────────────────────────
 * O jogo guarda quem joga em `p1`/`p2` (a string "A / B"), em `team1`/`team2` (os arrays de
 * nomes) e em `team1Uids`/`team2Uids`. ⛔ Trocar só a string deixa o jogo discordando de si
 * mesmo — foi o meu erro na primeira passada do reparo manual: os 6 jogos continuavam
 * citando a ausente pelos arrays. Por isso a trinca anda junta, sempre. */
function trocarNoJogo(jogo, absentName, subName, subUid) {
  const novo = JSON.parse(JSON.stringify(jogo));
  let mexeu = false;
  [['p1', 'team1', 'team1Uids'], ['p2', 'team2', 'team2Uids']].forEach(([cStr, cNomes, cUids]) => {
    let aqui = false;
    const partes = String(novo[cStr] == null ? '' : novo[cStr]).split(' / ');
    partes.forEach((nome, i) => {
      if (String(nome).trim() !== absentName) return;
      partes[i] = subName;
      if (Array.isArray(novo[cUids])) novo[cUids][i] = subUid || null;
      aqui = true;
    });
    if (Array.isArray(novo[cNomes])) {
      novo[cNomes].forEach((nome, i) => {
        if (String(nome).trim() !== absentName) return;
        novo[cNomes][i] = subName;
        if (Array.isArray(novo[cUids])) novo[cUids][i] = subUid || null;
        aqui = true;
      });
    }
    if (aqui) { novo[cStr] = partes.join(' / '); mexeu = true; }
  });
  return mexeu ? novo : null;
}

/** Jogo já tem resultado lançado? Então é história, e história não se reescreve. */
function temPlacar(jogo) {
  return !!(jogo && (jogo.scoreP1 != null || jogo.scoreP2 != null));
}

/**
 * O PLANO. `inscritos`/`jogos` são os documentos CRUS das subcoleções:
 *   inscritos: [{ _id, _k, _idx, item:{uid, ligaActive, …} }]
 *   jogos:     [{ _id, _loc, _chave, jogo:{…}, playerUids? }]
 * Devolve o que precisa ser escrito — e `nada: true` quando não há o que fazer, pra o
 * gatilho poder sair sem pagar leitura nenhuma.
 */
function planejar(antes, depois, inscritos, jogos) {
  const novas = novasEntradasDeWo(antes, depois);
  if (!novas.length || !precisaReconciliar(depois)) return { nada: true, novosInscritos: [], patchesDeJogo: [], desativar: [], recusados: [] };

  const porUid = {};
  (inscritos || []).forEach((p) => { if (p && p.item && p.item.uid) porUid[p.item.uid] = p; });
  let idx = (inscritos || []).reduce((m, p) => Math.max(m, (typeof p._idx === 'number') ? p._idx : -1), -1);
  let seq = (inscritos || []).reduce((m, p) => Math.max(m, (p.item && p.item.enrollSeq) || 0), 0);

  const novosInscritos = [];
  const desativar = [];
  const patchesDeJogo = [];
  const recusados = [];

  novas.forEach((w) => {
    /* ① O SUBSTITUTO ENTRA NO ELENCO. É isto que faz ele "ocupar a posição até o fim do
     * torneio": na Liga cada rodada é sorteada de novo a partir do elenco, então quem fica
     * só no grupo desta rodada sumiria na próxima. */
    if (w.subUid && !porUid[w.subUid] && !novosInscritos.some((n) => n.item.uid === w.subUid)) {
      idx += 1; seq += 1;
      novosInscritos.push({
        _id: 'u' + w.subUid, _k: 'u' + w.subUid, _idx: idx,
        item: {
          uid: w.subUid, selfEnrolled: true, ligaActive: true, enrollSeq: seq,
          addedAt: w.at || null,
          woSubstituteFor: w.absentName || '', woSubstituteForUid: w.absentUid || null,
          woSubstituteAt: w.at || null
        }
      });
    }

    /* ② O AUSENTE É DESATIVADO — sempre (`_ligaWoDeactivate`, travado por wo-sempre-desativa).
     * ⚠️ "Jogador X" é VAGA, não pessoa: sem uid, não há quem desativar. */
    if (w.absentUid) {
      const e = porUid[w.absentUid];
      if (e && e.item.ligaActive !== false && !desativar.some((d) => d._id === e._id)) {
        desativar.push({
          _id: e._id, _k: e._k, _idx: e._idx, nome: w.absentName || '',
          item: Object.assign({}, e.item, { ligaActive: false, woDeactivatedAt: w.at || null })
        });
      }
    }

    /* ③ O SLOT DO JOGO. Só no grupo e na rodada onde o W.O. aconteceu — W.O. é do grupo
     * onde aconteceu ([[project_wo_e_do_grupo_onde_aconteceu]]). */
    if (!w.subName || !w.absentName || !w.groupName) return;
    (jogos || []).forEach((m) => {
      const g = m && m.jogo; if (!g) return;
      if (String(g.label || '').indexOf(w.groupName) !== 0) return;
      if ((g.roundIndex || 0) !== (w.roundIndex || 0)) return;
      const novo = trocarNoJogo(g, w.absentName, w.subName, w.subUid);
      if (!novo) return;
      if (temPlacar(g)) { recusados.push({ id: m._id, label: g.label, motivo: 'placar lançado' }); return; }
      const patch = { _id: m._id, _loc: m._loc, _chave: m._chave, jogo: novo, label: g.label };
      /* `playerUids` é índice denormalizado e nem todo jogo tem — escrever onde não existia
       * é inventar campo. */
      if (Array.isArray(m.playerUids)) {
        const uids = [];
        (novo.team1Uids || []).concat(novo.team2Uids || []).forEach((u) => { if (u) uids.push(u); });
        patch.playerUids = uids;
      }
      patchesDeJogo.push(patch);
    });
  });

  const nada = !novosInscritos.length && !desativar.length && !patchesDeJogo.length;
  return { nada, novosInscritos, desativar, patchesDeJogo, recusados, eventos: novas.length };
}

module.exports = { planejar, novasEntradasDeWo, precisaReconciliar, trocarNoJogo, temPlacar };
