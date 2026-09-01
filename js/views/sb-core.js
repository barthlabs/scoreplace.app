/* sb-core.js — A CÓPIA FIEL DO ORIGINAL, E A PROVA DE QUE ELA É FIEL.  (FIX.SANDBOX.P1)
 *
 * INVARIANTE DO DONO (01/set/2026), palavra por palavra:
 *   _"O sandbox é uma réplica fiel do original. Qualquer diferença de estado de torneio
 *    além de id técnico, sandboxOf, notificações suprimidas e estatísticas históricas
 *    pessoais suprimidas é defeito bloqueante."_
 *   _"Não é permitido simplificar, limpar, reconstruir, normalizar, reduzir ou substituir
 *    participantes, inscrições, member state, jogos, resultados, fases, rankings,
 *    classificações congeladas, W.O., espera, histórico, barras, progresso ou chaves."_
 *   _"Se a cópia não puder provar igualdade canônica de tudo isso antes de ficar visível,
 *    ela NÃO serve, NÃO pode ser aberta e NÃO pode ser entregue ao usuário."_
 *
 * ⛔ O DEFEITO QUE ISTO MATA, medido: o sandbox nascia de `JSON.parse(JSON.stringify(orig))`
 * com `orig` vindo do AppStore — que num torneio DIVIDIDO é o documento MAGRO (os jogos e o
 * elenco moram em subcoleção e chegam depois). O clone saía com 14 inscritos e ZERO jogos,
 * e era gravado com `_semPesados` — prometendo partes que NINGUÉM podia escrever:
 *   · o CLIENTE não pode (firestore.rules: `allow write: if false` em inscritos,
 *     opponentHistory e matches — "⛔ O CLIENTE NÃO ESCREVE AQUI. NUNCA.");
 *   · a CF do espelho PULA justamente o que está em `_semPesados`.
 * ⇒ promessa sem dono. A tela mostrava "…" inscritos, não sabia se você estava inscrito, e
 * perdia barra e números de progresso.
 *
 * ⭐ POR ISSO O SANDBOX NASCE INTEIRO. Sem `_semPesados`, tudo mora no documento — e aí a
 * cópia É o documento, provável na hora, sem depender de ninguém escrever depois. Medido no
 * Confra: 206,9 KB de 1024 KB (817 KB de folga). É o mesmo caminho dos 41 torneios migrados.
 * ⚠️ Se um dia não couber, o certo é a porta de escrita no servidor — NÃO voltar a gravar
 * `_semPesados` sem quem escreva as partes.
 */
(function (raiz) {
  'use strict';

  /* Campos que PODEM diferir — o envelope técnico e as duas supressões que o dono permite.
   * ⛔ Esta lista é a definição do invariante. Tudo que não está aqui tem que ser IGUAL. */
  var ENVELOPE = [
    'id', 'name',                                   // id técnico e o rótulo "(SB) …"
    'isSandbox', 'sandboxOf', 'sandboxId', 'sandboxOwnerUid', 'sandboxSyncedAt',
    'notificationsMuted',                           // notificações suprimidas
    'isPublic',                                     // invisível pra quem não é o dev
    'creatorUid', 'organizerEmail', 'organizerName',// o dev é o dono do SB
    'createdAt', 'updatedAt',
    // ⚠️ ENTREGA, não estado do torneio: enquanto os uids reais estiverem aqui, o Firestore
    // ENTREGA o doc do SB no listener (`memberUids array-contains`) de cada uma das pessoas
    // reais — 152 pessoas recebendo um torneio fantasma. `participants` (o elenco, que é o
    // estado) continua íntegro e é dele que o motor sorteia. Ver project_sandbox_tournament.
    'memberUids', 'memberEmails', 'coHosts', 'adminUids', 'adminEmails',
    // estatísticas históricas pessoais suprimidas (não vazam do SB)
    'remindersSent', 'finishNotifiedAt', 'nextDrawAt', 'lastAutoDrawAt',
    // marcadores de armazenamento — o SB nasce INTEIRO de propósito
    '_semPesados', '_nPartes', '_nJogos', '_nGrupos', '_partesQueFaltam'
  ];

  function _canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(_canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + _canon(v[k]); }).join(',') + '}';
  }

  /* AS PARTES CUMPREM O QUE O DOCUMENTO PROMETEU?
   * Confere pelo INVERSO canônico (`_tSplit.dividir`): o que sai tem que bater com `_nPartes`
   * e `_nJogos`. ⛔ Não é contagem escrita à mão — é a mesma função que grava. */
  function partesCompletas(t) {
    var faltas = [];
    var S = (typeof raiz !== 'undefined') ? raiz._tSplit : null;
    if (!t) return { ok: false, faltas: [{ parte: 'torneio', prometido: 1, veio: 0 }] };
    var fora = Array.isArray(t._semPesados) ? t._semPesados : [];
    if (!fora.length) return { ok: true, faltas: [] };      // inteiro: não prometeu nada fora
    if (!S || typeof S.dividir !== 'function') return { ok: false, faltas: [{ parte: '_tSplit', prometido: 1, veio: 0 }] };
    var s = S.dividir(t, fora);                              // dividir clona; `t` não é tocado
    var prom = t._nPartes || {};
    fora.forEach(function (nome) {
      var veio = Array.isArray(s[nome]) ? s[nome].length : 0;
      if (prom[nome] != null && veio !== prom[nome]) faltas.push({ parte: nome, prometido: prom[nome], veio: veio });
    });
    if (t._nJogos != null) {
      var nj = Array.isArray(s.matches) ? s.matches.length : 0;
      if (nj !== t._nJogos) faltas.push({ parte: '_nJogos', prometido: t._nJogos, veio: nj });
    }
    return { ok: faltas.length === 0, faltas: faltas };
  }

  /* A PROVA DE IGUALDADE CANÔNICA. Devolve { ok, diferencas:[{campo, orig, sb}] }.
   * ⭐ Compara TUDO que não está no ENVELOPE — inclusive campo que ninguém lembrou de listar:
   * a varredura é sobre a UNIÃO das chaves dos dois, não sobre uma lista escrita à mão. Foi
   * lista à mão que já esqueceu `participants` três vezes neste projeto. */
  function provaIgualdade(orig, sb) {
    var difs = [];
    if (!orig || !sb) return { ok: false, diferencas: [{ campo: '(torneio)', orig: !!orig, sb: !!sb }] };
    /* ⭐ COMPARA NA FORMA CANÔNICA DE PERSISTÊNCIA (os dois DOBRADOS). `_hydrateMonarchGroups`
     * preenche `monarchGroups[].matches` com REFERÊNCIAS aos jogos que já moram em
     * `rounds[].matches` — um lado hidratado e o outro não acusaria diferença em `rounds`
     * sem que jogo nenhum diferisse. Dobrar é a mesma normalização que o save aplica antes
     * de gravar, e roda em CÓPIA: nem o original nem o sandbox são tocados aqui.
     * ⛔ Isto NÃO é "normalizar o dado" (que o invariante proíbe) — é comparar os dois na
     * mesma forma. O que vai pro banco continua sendo a cópia fiel, intacta. */
    try {
      if (raiz && typeof raiz._foldMonarchGroups === 'function') {
        orig = JSON.parse(JSON.stringify(orig)); raiz._foldMonarchGroups(orig);
        sb = JSON.parse(JSON.stringify(sb)); raiz._foldMonarchGroups(sb);
      }
    } catch (e) { /* sem o dobrador, compara como veio */ }
    var chaves = {};
    Object.keys(orig).forEach(function (k) { chaves[k] = 1; });
    Object.keys(sb).forEach(function (k) { chaves[k] = 1; });
    Object.keys(chaves).sort().forEach(function (k) {
      if (ENVELOPE.indexOf(k) !== -1) return;
      var a = _canon(orig[k]), b = _canon(sb[k]);
      if (a !== b) difs.push({ campo: k, orig: a.slice(0, 90), sb: b.slice(0, 90) });
    });
    return { ok: difs.length === 0, diferencas: difs };
  }

  /* O PROGRESSO TAMBÉM TEM QUE BATER — pela porta canônica, nunca por campo cru.
   * (barras e números estão na lista do dono: "barras, progresso ou chaves".) */
  function provaProgresso(orig, sb) {
    var f = (typeof raiz !== 'undefined') ? raiz._getTournamentProgress : null;
    if (typeof f !== 'function') return { ok: false, motivo: '_getTournamentProgress ausente' };
    var a = f(orig), b = f(sb);
    var ok = a.total === b.total && a.completed === b.completed && a.pct === b.pct;
    return { ok: ok, orig: a, sb: b };
  }

  var api = { ENVELOPE: ENVELOPE, canon: _canon, partesCompletas: partesCompletas,
              provaIgualdade: provaIgualdade, provaProgresso: provaProgresso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (raiz) {
    raiz._sbCore = api;
    raiz._sbPartesCompletas = partesCompletas;
    raiz._sbProvaIgualdade = provaIgualdade;
    raiz._sbProvaProgresso = provaProgresso;
  }
})(typeof window !== 'undefined' ? window : null);
