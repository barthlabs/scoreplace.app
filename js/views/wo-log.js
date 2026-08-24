/* wo-log.js — O REGISTRO DE W.O. (v2.0.60)
 *
 * POR QUE ISTO EXISTE (ler antes de mexer):
 * o histórico de W.O. de um grupo era RECONSTRUÍDO a cada render, a partir de pistas
 * espalhadas: o estado do grupo (`woAbsent`/`subName` — SLOT ÚNICO, só cabe o último), o
 * marcador de folga da rodada, e o rastro `woSubstituteFor` na entrada de quem entrou. Cada
 * uma dessas pistas é ESTADO de outra coisa, e o histórico ia junto quando elas mudavam:
 *
 *   · 2.0.53 — o grupo tinha 3 W.O.s e a tela mostrava 1 (o slot só guarda o último);
 *   · 2.0.57 — quem volta pra fila perde o marcador de folga... e sumia da lista de W.O.;
 *   · 2.0.58 — o rastro guardava NOME; sem nome no doc, a corrente arrebentava e a Denise
 *              Mamesso desaparecia do histórico do Grupo A;
 *   · 2.0.59 — reverter deixava o rastro pendurado, e ele voltava como W.O. fantasma.
 *
 * Quatro correções em quatro dias, todas do mesmo defeito de fundo: **um fato do passado
 * estava sendo deduzido do estado do presente.** Ordem do dono (24/ago/2026): _"termine
 * isso. senão nunca mais arrumamos como deve."_
 *
 * Agora o W.O. é GRAVADO quando acontece, num registro append-only (`t.woLog`), e a tela
 * apenas LÊ. Mudar o estado (reativar, sortear de novo, trocar de nome) não mexe no que
 * está escrito.
 *
 * REGRAS DESTE ARQUIVO:
 *  • PURO — nada de document/AppStore/Firestore. Recebe `t`, devolve/mut o `t`.
 *  • IDENTIDADE É O UID. `absentUid`/`subUid` mandam; o nome viaja junto como RÓTULO DO DIA
 *    (útil pra exibir doc antigo e pra quem não tem conta — Jogador X não tem uid).
 *  • IDEMPOTENTE. Aplicar o mesmo W.O. duas vezes atualiza o evento aberto em vez de criar
 *    outro; reverter duas vezes não duplica nada.
 *  • APPEND-ONLY. Reverter não apaga: marca `status:'reverted'`. O que aconteceu aconteceu.
 *
 * Carregado ANTES de liga-substitution.js e bracket.js (index.html) e por tests/headless.
 */

// Chave de identidade de uma ponta (ausente ou substituto): uid quando existe, nome só
// para quem NÃO TEM conta — a ressalva do dono (participante digitado à mão, Jogador X).
function _woKey(uid, nome) {
  if (uid) return 'u:' + String(uid);
  var n = String(nome == null ? '' : nome).trim().toLowerCase();
  return n ? ('n:' + n) : '';
}
window._woLogKey = _woKey;

function _woLogArr(t, criar) {
  if (!t) return [];
  if (!Array.isArray(t.woLog)) {
    if (!criar) return [];
    t.woLog = [];
  }
  return t.woLog;
}

// Mesmo grupo? `roundIndex` costuma ser o índice da rodada; nas rotas canônicas
// (t.matches) é o `phaseIndex`. Os dois entram como o mesmo campo `roundIndex`.
function _mesmoGrupo(ev, roundIndex, groupName) {
  return !!ev && ev.groupName === groupName && (ev.roundIndex || 0) === (roundIndex || 0);
}

// O evento ABERTO daquele ausente naquele grupo (o que ainda vale).
function _woLogFind(t, roundIndex, groupName, absentUid, absentName) {
  var k = _woKey(absentUid, absentName);
  if (!k) return null;
  var arr = _woLogArr(t);
  for (var i = arr.length - 1; i >= 0; i--) {
    var ev = arr[i];
    if (!_mesmoGrupo(ev, roundIndex, groupName)) continue;
    if (ev.status === 'reverted') continue;
    if (_woKey(ev.absentUid, ev.absentName) === k) return ev;
  }
  return null;
}
window._woLogFind = _woLogFind;

/* REGISTRA que alguém levou W.O. Chamado no ATO, por todos os fluxos que aplicam W.O. —
 * inclusive o que ainda não tem substituto (convite pendente / vaga aberta): o fato "fulano
 * levou W.O." não depende de alguém assumir a vaga.
 * `ev`: {roundIndex, groupName, category, absentUid, absentName, subUid, subName,
 *        subIsGuest, byUid}. Devolve o evento (novo ou o que já existia, atualizado). */
window._woLogAdd = function (t, ev, agora) {
  if (!t || !ev || (!ev.absentUid && !ev.absentName)) return null;
  var arr = _woLogArr(t, true);
  var ja = _woLogFind(t, ev.roundIndex, ev.groupName, ev.absentUid, ev.absentName);
  var at = agora || new Date().toISOString();
  if (ja) {
    // idempotente: reaplicar o mesmo W.O. não cria um segundo evento. Só completa o que
    // faltava (o substituto costuma chegar depois — convite aceito, Jogador X escolhido).
    if (ev.absentUid && !ja.absentUid) ja.absentUid = String(ev.absentUid);
    if (ev.absentName && !ja.absentName) ja.absentName = ev.absentName;
    if (ev.subUid || ev.subName) {
      ja.subUid = ev.subUid ? String(ev.subUid) : (ja.subUid || null);
      ja.subName = ev.subName || ja.subName || '';
      ja.subIsGuest = !!ev.subIsGuest;
      ja.filledAt = at;
    }
    if (ev.category && !ja.category) ja.category = ev.category;
    return ja;
  }
  var novo = {
    id: 'wo-' + (ev.roundIndex || 0) + '-' + String(ev.groupName || '').replace(/\s+/g, '_') + '-' +
        (ev.absentUid || String(ev.absentName || '').replace(/\s+/g, '_')) + '-' + arr.length,
    roundIndex: ev.roundIndex || 0,
    groupName: ev.groupName || '',
    category: ev.category || null,
    absentUid: ev.absentUid ? String(ev.absentUid) : null,
    absentName: ev.absentName || '',          // rótulo do dia (exibição/legado/fictício)
    subUid: ev.subUid ? String(ev.subUid) : null,
    subName: ev.subName || '',
    subIsGuest: !!ev.subIsGuest,
    byUid: ev.byUid || null,
    at: at,
    status: 'active'
  };
  if (novo.subUid || novo.subName) novo.filledAt = at;
  arr.push(novo);
  return novo;
};

/* CARIMBA quem assumiu a vaga (o substituto chega depois em vários fluxos: aceite de
 * convite, escolha do organizador, Jogador X). Sem evento aberto, não faz nada — quem cria
 * o fato é `_woLogAdd`. */
window._woLogFill = function (t, ev, agora) {
  if (!t || !ev) return null;
  var aberto = _woLogFind(t, ev.roundIndex, ev.groupName, ev.absentUid, ev.absentName);
  if (!aberto) return null;
  aberto.subUid = ev.subUid ? String(ev.subUid) : null;
  aberto.subName = ev.subName || '';
  aberto.subIsGuest = !!ev.subIsGuest;
  aberto.filledAt = agora || new Date().toISOString();
  return aberto;
};

/* REVERTE: marca o evento como desfeito, sem apagá-lo. Append-only — "aconteceu e foi
 * desfeito" é uma informação diferente de "nunca aconteceu", e é a primeira que o
 * organizador precisa quando alguém pergunta por que a tabela mudou. */
window._woLogRevert = function (t, ev, agora) {
  var aberto = _woLogFind(t, ev && ev.roundIndex, ev && ev.groupName, ev && ev.absentUid, ev && ev.absentName);
  if (!aberto) return null;
  aberto.status = 'reverted';
  aberto.revertedAt = agora || new Date().toISOString();
  if (ev && ev.byUid) aberto.revertedByUid = ev.byUid;
  return aberto;
};

/* OS W.O.s DE UM GRUPO, do mais antigo pro mais novo — só os que valem.
 * É a fonte que a tela usa; devolve [] quando o registro não cobre aquele grupo (doc
 * anterior à 2.0.60), e aí quem chama cai na reconstrução legada. */
window._woLogForGroup = function (t, roundIndex, groupName) {
  return _woLogArr(t)
    .filter(function (ev) { return _mesmoGrupo(ev, roundIndex, groupName) && ev.status !== 'reverted'; })
    .slice()
    .sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
};

/* Tem registro pra este grupo? (inclusive revertido — um grupo cujo único W.O. foi desfeito
 * está COBERTO pelo registro, e a resposta certa é "nenhum W.O. vale", não "caia no
 * legado", que ressuscitaria o que foi revertido.) */
window._woLogCobreGrupo = function (t, roundIndex, groupName) {
  return _woLogArr(t).some(function (ev) { return _mesmoGrupo(ev, roundIndex, groupName); });
};

/* BACKFILL — deriva os eventos do estado atual, pra doc gravado antes do registro existir.
 * Usa exatamente as pistas que a reconstrução usava (é a última vez que elas são lidas como
 * histórico). `pares` vem de quem sabe reconstruir (`_ligaGroupWoList`), pra não haver duas
 * versões da mesma dedução. Idempotente: rodar de novo não duplica. Devolve quantos entraram. */
window._woLogBackfillGroup = function (t, roundIndex, groupName, pares, agora) {
  if (!t || !Array.isArray(pares) || !pares.length) return 0;
  var n = 0;
  pares.forEach(function (p, i) {
    if (!p || (!p.absentUid && !p.absentName)) return;
    if (_woLogFind(t, roundIndex, groupName, p.absentUid, p.absentName)) return;
    window._woLogAdd(t, {
      roundIndex: roundIndex, groupName: groupName, category: p.category || null,
      absentUid: p.absentUid || null, absentName: p.absentName || '',
      subUid: p.subUid || null, subName: p.subName || '', subIsGuest: !!p.subIsGuest
    }, p.at || agora || new Date().toISOString());
    n++;
  });
  return n;
};
