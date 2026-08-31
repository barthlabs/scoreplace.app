// ========================================
// scoreplace.app — Firestore Database Module
// ========================================
// Provides CRUD operations for Cloud Firestore.
// Collections: tournaments, users
// Requires firebase-app-compat + firebase-firestore-compat loaded first.

window.FirestoreDB = {
  db: null,
  lastInitError: null,

  // Teto de leitura do sininho. O badge só pinta "9+" (notifications-view.js), então
  // a 11ª não lida não muda a tela — e ler além disso é banda gasta na ABERTURA.
  // Ver `getUnreadNotificationCount`.
  NOTIF_BADGE_MAX: 10,

  init() {
    try {
      if (typeof firebase === 'undefined') {
        this.lastInitError = 'SDK Firebase não carregado (firebase undefined)';
        window._error('[FirestoreDB.init]', this.lastInitError);
        return;
      }
      if (typeof firebase.firestore !== 'function') {
        this.lastInitError = 'firebase-firestore-compat.js não carregado';
        window._error('[FirestoreDB.init]', this.lastInitError);
        return;
      }
      this.db = firebase.firestore();
      // v3.0.x: PERSISTÊNCIA OFFLINE = "shoot and forget". A escrita vai pra uma fila
      // DURÁVEL em IndexedDB e sincroniza sozinha — sobrevive a fechar o app / perder a
      // rede no meio de um save (era exatamente o que se perdia: clicou salvar e saiu).
      // Tem que ser chamado ANTES de qualquer leitura/escrita (init roda cedo, antes de
      // tudo). .catch degrada gracioso: navegador sem suporte / aba privada / persistência
      // já ativa (outra aba pegou) → app segue sem a fila durável.
      // v4.0.23: REMOVIDO synchronizeTabs:true. A persistência IndexedDB MULTI-ABA do SDK
      // 10.8.1 era o gatilho nº1 do bug interno "INTERNAL ASSERTION FAILED: Unexpected state"
      // (Sentry SCOREPLACE-WEB-66/67): abas concorrentes corrompem o IndexedDB compartilhado →
      // a AsyncQueue do Firestore "falha" → TODA chamada seguinte morre em cascata. Aba
      // única é o caminho estável; a 2ª aba simplesmente cai no .catch (sem fila durável,
      // mas sem corromper). Recuperação adicional: auto-reload guardado em sentry-init.js.
      // v1.3.27: FIX RAIZ — SDK subido 10.8.1 → 10.14.1 (as correções internas de
      // "Unexpected state" entraram em 10.12+). synchronizeTabs segue removido e o
      // auto-reload segue ativo como cinto-e-suspensório enquanto se confirma no Sentry.
      // v1.9.73 (19/ago/2026): "Unexpected state" AINDA reincidia no 10.14.1 (Sentry
      // WEB-69/65, 7 eventos desde junho) — SDK subido 10.14.1 → 12.17.1 (compat),
      // ~2 anos de correções do Firestore. Mesma banda compat, mesmos URLs gstatic
      // (index.html + storage lazy no store.js). synchronizeTabs SEGUE removido.
      try {
        this.db.enablePersistence().then(function () {
          if (window._log) window._log('[FirestoreDB] persistência offline ATIVA — saves sobrevivem a fechar o app');
        }).catch(function (err) {
          var _c = (err && err.code) || String(err);
          if (window._warn) window._warn('[FirestoreDB] persistência offline indisponível (' + _c + ') — app segue sem fila durável');
        });
      } catch (_pErr) { /* enablePersistence pode lançar síncrono em ambiente sem IndexedDB */ }
      this.lastInitError = null;
    } catch (e) {
      this.lastInitError = (e && e.message) || String(e);
      window._error('[FirestoreDB.init] Erro ao inicializar Firestore:', e);
    }
  },

  // Call this from code paths that need db and want to survive a late script load.
  // Returns true if db is ready after the call.
  ensureDb() {
    if (this.db) return true;
    this.init();
    return !!this.db;
  },

  // ---- Utilities ----

  // Recursively strip undefined values from objects/arrays (Firestore rejects undefined).
  // v0.16.58: também remove keys que começam E terminam com `__` — Firestore
  // reserva esse padrão pra fields internos (`__name__` etc) e rejeita o save
  // com `[invalid-argument] Document fields cannot begin and end with "__"`.
  // Bug capturado pelo diag v0.16.54: `sitOutHistory.__all__` (default key
  // antiga do auto-draw) batia nessa regra. Defesa global aqui pega esse
  // padrão em qualquer campo, em qualquer profundidade — protege contra
  // futuras introduções acidentais e cobre docs legacy ainda em memória.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _cleanUndefined(obj) {
    return (typeof window !== 'undefined' && typeof window._cleanUndefined === 'function')
      ? window._cleanUndefined(obj) : null;
  },

  // v4.4.70 FONTE ÚNICA Rei/Rainha: delega pro normalizador CANÔNICO em
  // bracket-model.js (window._foldMonarchGroups) — mesma função que o servidor
  // (autoDraw, via draw-core shim) chama antes de gravar. Uma implementação só,
  // zero drift. Remove group.matches do PAYLOAD e deixa só matchIds; round.matches
  // continua a única lista de jogos persistida. Chamado em saveTournament e
  // mutateTournament — todo write de torneio inteiro passa aqui.
  _foldMonarchGroups(cleanData) {
    if (typeof window !== 'undefined' && typeof window._foldMonarchGroups === 'function') {
      return window._foldMonarchGroups(cleanData);
    }
    return cleanData;
  },

  // ── v1.7.91 · CARIMBO DE ESCALAÇÃO — fonte ÚNICA das DUAS portas de escrita ────
  // Uma pessoa num grupo Rei/Rainha vive em QUATRO estruturas, e DUAS delas carregam
  // escalação: o SLOT do jogo (`p1/p2/team*Uids`) e o ELENCO do grupo
  // (`monarchGroups[g].players/playersUids`) — que é de onde sai a CLASSIFICAÇÃO.
  // Proteger só o slot deixava os 3 jogos certos e a classificação mostrando o ausente.
  //
  // Este bloco é o ÚNICO lugar que sabe quais campos são "escalação" e onde ela mora.
  // As duas portas o usam com papéis diferentes, e é essa divisão que conserta o bug:
  //   · `mutateTournament` (transação) só CARIMBA — ela já lê fresco, não precisa de
  //     defesa; o que faltava era ela DEIXAR O RASTRO pra outra porta poder se defender.
  //   · `saveTournament` (save solto) compara com o banco e RECUSA o que veio do passado.
  // Antes o carimbo nascia só no save solto — então toda troca feita pelo app (W.O.,
  // substituição, formação de grupo passam TODOS pela transação) ia pro banco SEM
  // carimbo, e a cópia velha que chegasse depois era lida como "primeira troca da vida"
  // e ACEITA. Ver [[project_roster_guard_single_rule]]: dois caminhos guardando o mesmo
  // invariante com regras diferentes é o próprio bug, e já custou dois incidentes.
  // ⚠️ As MARCAS do W.O. entram na assinatura do GRUPO (v1.7.95). Uma pessoa num grupo
  // Rei/Rainha vive em QUATRO estruturas e o W.O. é a 3ª: sem ela aqui, um save atrasado
  // apagava `woAbsent`/`subName`/`subStatus` — ou seja, desfazia o REGISTRO da falta
  // mesmo com a escalação já protegida, e a tela voltava a dizer que ninguém faltou.
  // Elas mudam junto com a escalação e pelos mesmos atos, então pertencem ao mesmo
  // carimbo: quem aplica ou reverte o W.O. carimba; quem chegou atrasado perde.
  _ROSTER_KEYS: {
    match: ['p1', 'p2', 'team1', 'team2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid'],
    group: ['players', 'playersUids',
            'woAbsent', 'woAbsentUid', 'subName', 'subUid', 'subStatus']
  },

  // Varre TODA unidade que carrega escalação, com uma CHAVE ESTÁVEL.
  // A chave do grupo é a ÂNCORA ESTRUTURAL (rodada + índice do grupo), nunca derivada
  // dos nomes/uids — senão trocar alguém mudaria a própria chave e o par se perderia.
  // Ver [[project_group_identity_structural_anchor]].
  _eachRosterUnit(t, fn) {
    if (!t) return;
    var _ms = function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (m) {
        if (m && m.id != null) fn(m, 'm:' + m.id, 'match');
      });
    };
    var _rodadas = function (rounds, escopo) {
      (Array.isArray(rounds) ? rounds : []).forEach(function (r, ri) {
        if (!r) return;
        _ms(r.matches);
        var rk = (r.round != null ? r.round : ri);
        (Array.isArray(r.monarchGroups) ? r.monarchGroups : []).forEach(function (g, gi) {
          if (!g) return;
          fn(g, 'g:' + escopo + ':' + rk + ':' + (g.groupIdx != null ? g.groupIdx : gi), 'group');
        });
      });
    };
    _ms(t.matches);
    _rodadas(t.rounds, '');
    // phaseRounds: { [fase]: { rounds: [...] } } — Liga incremental de fase posterior.
    // Mesma estrutura, mesma exposição; o fold canônico já a trata, o guard também tem que.
    if (t.phaseRounds && typeof t.phaseRounds === 'object') {
      Object.keys(t.phaseRounds).forEach(function (k) {
        var slot = t.phaseRounds[k];
        if (slot && Array.isArray(slot.rounds)) _rodadas(slot.rounds, 'p' + k);
      });
    }
    (Array.isArray(t.groups) ? t.groups : []).forEach(function (g) { if (g) _ms(g.matches); });
  },

  _rosterSig(u, tipo) {
    var keys = this._ROSTER_KEYS[tipo] || [];
    return JSON.stringify(keys.map(function (k) { return u ? u[k] : null; }));
  },

  // Carimba o que MUDOU de escalação entre `sigAntes` e o estado atual de `t`.
  // Usado pela transação (que conhece o "antes" exato da mesma leitura transacional).
  // Unidade que não existia antes = motor criando chave, não troca → não carimba.
  // Devolve quantas unidades trocaram (0 = save comum, e aí `rosterRev` não sobe:
  // o participante não pode carregar campo fora da allowlist ou a escrita é RECUSADA
  // INTEIRA e ele perde o lançamento de placar).
  _stampRosterChanges(t, sigAntes, agora) {
    var self = this, trocou = 0;
    this._eachRosterUnit(t, function (u, key, tipo) {
      if (!(key in sigAntes)) return;
      if (self._rosterSig(u, tipo) === sigAntes[key]) return;
      u.rosterAt = agora;
      trocou++;
    });
    if (trocou) t.rosterRev = ((typeof t.rosterRev === 'number') ? t.rosterRev : 0) + 1;
    return trocou;
  },

  _rosterSigMap(t) {
    var self = this, out = {};
    this._eachRosterUnit(t, function (u, key, tipo) { out[key] = self._rosterSig(u, tipo); });
    return out;
  },

  // ---- Tournaments ----

  // v1.2.2: _computeMemberEmails REMOVIDA junto com o campo memberEmails[]. Identidade de
  // membro é o uid (memberUids) — e-mail/telefone são ATRIBUTOS do perfil, resolvidos pelo
  // uid (_emailForUid/_phoneForUid), nunca chave. O campo só sobrevivia como fallback, e
  // fallback é rede de segurança pra código que não confia na própria identidade.
  // Ver [[project_uid_primary_identity]] / [[project_orphan_uid_entries]].

  // Subset of memberEmails restricted to organizer-level principals —
  // creator, current organizer, active co-hosts. Used by Firestore rules to
  // authorize full-edit and delete operations in O(1). Participants never
  // appear here; only admins.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeAdminEmails(data) {
    return (typeof window !== 'undefined' && typeof window._computeAdminEmails === 'function')
      ? window._computeAdminEmails(data) : [];
  },

  // v2.8.79: adminUids[] — UIDs dos principais de nível organizador (criador +
  // co-hosts ativos). Espelho uid de adminEmails. Necessário porque co-host
  // pode ter email '' (conta por telefone) → as regras precisam autorizar
  // edição/escrita por UID, não por email. Recomputa a cada save (encolhe
  // quando um co-host é removido — diferente de memberUids que nunca encolhe).
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeAdminUids(data) {
    return (typeof window !== 'undefined' && typeof window._computeAdminUids === 'function')
      ? window._computeAdminUids(data) : [];
  },

  // v1.8.62: memberUids[] — UIDs de todos os participantes + organizador.
  // Permite que usuários phone-only (sem email) sejam identificados nas
  // regras do Firestore, onde authEmail() retorna '' para esses usuários.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeMemberUids(data) {
    return (typeof window !== 'undefined' && typeof window._computeMemberUids === 'function')
      ? window._computeMemberUids(data) : [];
  },

  async saveTournament(tourData, options) {
    if (!this.db) return;
    var docId = String(tourData.id);
    var cleanData = this._cleanUndefined(tourData);
    this._foldMonarchGroups(cleanData); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
    // ── CLASSIFICAÇÃO É DERIVADA: NÃO VAI PRO BANCO (2.0.120) ──────────────────
    // MEDIDO: `standings` estava gravado em 2 dos 39 torneios — 120 linhas, TODAS zeradas e
    // NENHUMA com uid. No Confra eram 12,5 KB, 16% do documento, dizendo "0 jogo disputado"
    // num torneio com 115 jogos. O cálculo sobre os mesmos dados dá 103 linhas, 95 com jogo
    // e 103 com uid. Guardar um derivado é guardar uma segunda versão da verdade, e foi essa
    // que apodreceu — ela nascia de um `_computeStandings` rodado antes dos jogos chegarem.
    // Agora a leitura passa por `window._standingsDoTorneio`, que recusa responder sem os
    // jogos em vez de devolver uma tabela zerada.
    // ⚠️ `merge:true` PRESERVA o campo ausente: omitir aqui para de reescrever e para de
    // trafegar, mas NÃO apaga o que já está gravado. Quem apaga é
    // `scripts/apagar-standings-do-doc.js`, rodado uma vez.
    // [[project_teto_do_documento_e_arquitetura_de_dados]] [[project_cache_pinta_mas_nao_decide]]
    delete cleanData.standings;
    // ── IMAGEM NÃO VIAJA JUNTO COM PLACAR (1.9.49) ──────────────────────────────
    // MEDIDO nos documentos de produção: `logoData` + `coverPhotoData` são 62% do peso
    // de todos os torneios (602 KB de 966 KB). Num doc o par chega a 305 KB de 311 KB —
    // 98% —, com o torneio de verdade ocupando 1,3 KB.
    // Como TODO save mandava o objeto inteiro, registrar um placar (mudança de ~50 bytes)
    // reenviava os 211 KB do Confra, logo incluído — e devolvia esses 211 KB pra cada
    // listener aberto. Era escrita, banda e re-render pagos por uma imagem que não mudou.
    // `merge:true` PRESERVA no banco o campo que não vem: omitir aqui não apaga nada.
    // Quem realmente TROCA a imagem passa `withImages` — hoje só a criação/edição
    // (`AppStore.addTournament`) e o botão de trocar logo. Qualquer outro save carrega uma
    // cópia lida do próprio banco, então omitir é no-op semântico.
    if (!(options && options.withImages)) {
      delete cleanData.logoData;
      delete cleanData.coverPhotoData;
    } else {
      // ── A IMAGEM VAI PRO STORAGE, E O DOC GUARDA SÓ A URL (1.9.51) ────────────
      // Este é o ÚNICO ponto por onde imagem de torneio é gravada — criar, editar e o
      // botão de trocar logo passam todos por aqui. Concentrar em um lugar é o que
      // impede a divergência de 20 telas ([[feedback_unify_dual_entry_points]]).
      // `_subirImagemTorneio` devolve a própria URL quando o valor já é http(s), ou
      // seja: salvar sem mexer na imagem NÃO sobe nada de novo.
      var _pares = [['logoData', 'logoUrl', 'logo'], ['coverPhotoData', 'coverUrl', 'cover']];
      for (var _i = 0; _i < _pares.length; _i++) {
        var _campoVelho = _pares[_i][0], _campoNovo = _pares[_i][1], _tipo = _pares[_i][2];
        var _val = cleanData[_campoVelho] || cleanData[_campoNovo];
        if (!_val) { delete cleanData[_campoVelho]; continue; }
        try {
          var _url = await window._subirImagemTorneio(docId, _tipo, _val);
          if (_url) {
            cleanData[_campoNovo] = _url;
            // a base64 NUNCA volta pro doc — é o peso que a migração acabou de tirar
            delete cleanData[_campoVelho];
          } else {
            delete cleanData[_campoVelho];
          }
        } catch (e) {
          // upload falhou: preserva o que já está no banco em vez de gravar meia-imagem.
          // `merge:true` faz o campo ausente ser mantido — ver a nota acima.
          if (window._warn) window._warn('[saveTournament] upload da imagem falhou; campo preservado', e);
          delete cleanData[_campoVelho];
          delete cleanData[_campoNovo];
        }
      }
    }
    // When skipParticipants is true, exclude participants array to prevent
    // overwriting enrollments made by other users via transactions.
    // This is critical: sync() and organizer edits should NOT touch participants.
    if (options && options.skipParticipants) {
      delete cleanData.participants;
      // Also skip memberEmails — it's derived from participants, and
      // overwriting it here would wipe enrollments made concurrently.
      // adminEmails is not participant-derived, but we skip it too so the
      // sync() path never clobbers coHost changes made concurrently with a
      // stale local cache.
      delete cleanData.memberEmails;
      delete cleanData.adminEmails;
      delete cleanData.adminUids; // v2.8.79: idem — merge:true preserva o do banco
      // v1.9.84: idem memberUids — não tocar nesse path (merge:true preserva
      // o valor do banco). Sem o delete, um memberUids stale em memória poderia
      // ENCOLHER a lista e fazer participantes sumirem do listener deles.
      delete cleanData.memberUids;
    } else {
      // v1.2.2: memberEmails NÃO é mais escrito — identidade de membro é o uid (memberUids).
      // O campo saiu do schema; quem precisa do e-mail de alguém resolve pelo uid no perfil
      // (_emailForUid). O `delete` não é decorativo: o doc carregado do banco ainda TRAZ o
      // campo, e sem isto o save o devolveria intacto — ele nunca sairia dos documentos.
      // Ver [[project_uid_primary_identity]].
      delete cleanData.memberEmails;
      cleanData.adminEmails  = this._computeAdminEmails(cleanData);
      cleanData.adminUids    = this._computeAdminUids(cleanData); // v2.8.79: co-host por uid
      // v1.9.84: memberUids TAMBÉM nunca encolhe — mesma lógica do memberEmails.
      // BUG reportado: depois do sorteio o torneio sumia para os participantes
      // (só aparecia pro organizador). Causa: o sorteio reconstrói
      // t.participants em duplas/bracket e às vezes o uid não sobrevive no
      // objeto do time → _computeMemberUids retornava só o organizador, o
      // listener `where(memberUids array-contains uid)` parava de devolver o
      // torneio e ele desaparecia da tela do participante. Merge prev+new
      // garante que um uid, uma vez membro, nunca é removido por um save.
      // SANDBOX é a EXCEÇÃO ao "nunca encolhe": no SB o memberUids é SUBSTITUÍDO pelos uids
      // do dev (sem união), senão os uids reais copiados na clonagem ressuscitariam a cada
      // save e o Firestore voltaria a entregar o SB no listener de todo participante.
      var _newUids  = this._computeMemberUids(cleanData);
      var _prevUids = Array.isArray(tourData.memberUids) ? tourData.memberUids : [];
      cleanData.memberUids = window._mergeMemberUids(cleanData, _prevUids, _newUids);
    }
    // v4.5.85 (ITEM 3 · Fase 4): SANITIZA identidade — não grava nome de quem tem uid
    // (resolve do perfil vivo); guest sem uid mantém o nome. Opera na CÓPIA (cleanData),
    // nunca no tourData em memória. memberEmails/memberUids já foram computados acima.
    if (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function') {
      if (Array.isArray(cleanData.participants)) cleanData.participants = window._stripStoredNamesForUidEntries(cleanData.participants);
      if (Array.isArray(cleanData.standbyParticipants)) cleanData.standbyParticipants = window._stripStoredNamesForUidEntries(cleanData.standbyParticipants);
      if (Array.isArray(cleanData.waitlist)) cleanData.waitlist = window._stripStoredNamesForUidEntries(cleanData.waitlist);
      // jul/2026: co-host também é identificado SÓ por uid — o nome sai do doc quando o
      // perfil é resolvível (o strip preserva o nome de quem NÃO tem perfil).
      if (Array.isArray(cleanData.coHosts)) cleanData.coHosts = window._stripStoredNamesForUidEntries(cleanData.coHosts);
    }
    // v1.4.30: CHOKE POINT da cura de rótulo cru — "Jogador sem perfil (…)" gravado em
    // m.p1/m.p2/team1/team2 por corrida de cache no sorteio/integração é reescrito pro
    // nome vivo em TODO save que passa aqui com o perfil resolvível. Best-effort.
    try {
      if (typeof window !== 'undefined' && typeof window._cureRawMatchLabels === 'function') window._cureRawMatchLabels(cleanData);
    } catch (_lblErr) { /* cura nunca derruba o save */ }
    // v2.6.74: nextDrawAt — ms epoch do próximo sorteio devido (ver _nextOwedDrawMs).
    // É o índice que o autoDraw do servidor consulta com where('nextDrawAt','<=',now)
    // pra disparar perto da hora exata sem varrer a coleção toda. Recalculado em TODO
    // save (cria/edita/sorteio do cliente/manual), derivado do MESMO helper do servidor.
    // Quando não há sorteio devido (manual, sem data, encerrado, etc.) remove o campo
    // pra não deixar valor stale travando a query. Best-effort: se o helper não estiver
    // carregado, o reconciliador do servidor seta como fallback.
    try {
      if (typeof window._nextOwedDrawMs === 'function') {
        var _owed = window._nextOwedDrawMs(cleanData);
        if (typeof _owed === 'number') {
          cleanData.nextDrawAt = _owed;
        } else if (typeof firebase !== 'undefined' && firebase.firestore) {
          cleanData.nextDrawAt = firebase.firestore.FieldValue.delete();
        }
      }
    } catch (_ndErr) { /* nextDrawAt é otimização; nunca derruba o save */ }
    // v3.0.x: BLINDAGEM CONTRA PERDA DE CONFIG MULTI-FASE. Mesma filosofia do
    // memberEmails/memberUids acima (um cache velho NUNCA encolhe a config). Bug grave:
    // um save stale/parcial (outra aba/sessão que carregou ANTES da config, ou edição que
    // não renderizou o construtor de fases) chegava com phases=null + reiRainha/
    // allowSelfDeactivation no DEFAULT e, via merge, ZERAVA o construtor de fases do torneio
    // (Confra: 2 fases + Rei/Rainha + "deixar de fora" sumiam horas depois, SEM auto-draw).
    // Regra: se o save de entrada NÃO é multi-fase mas o doc no BANCO é, preserva a config
    // do banco (fonte da verdade). EXCEÇÃO: quando o organizador remove/reduz fases DE
    // PROPÓSITO no construtor, o save chega com _allowConfigReset=true (ou options) e a
    // redução é permitida — o guard só barra o que NÃO pretendia tocar (stale/bug).
    // ── v1.7.26 · O ELENCO E A FILA NUNCA ENCOLHEM POR ACIDENTE ────────────────
    // INCIDENTE (Confra, 02/ago/2026): o Gersom se inscreveu em 01/08 18:34, recebeu o
    // lembrete das 09:00 do dia seguinte — e a CF do lembrete itera `t.participants` NO
    // SERVIDOR, então ele estava no elenco — e às 19:00 não estava no sorteio. Não se
    // desinscreveu (essa ação notifica o organizador; não há notificação nenhuma). Sumiu
    // em silêncio e ficou dois dias fora do torneio.
    //
    // CAUSA ESTRUTURAL: este método grava o doc INTEIRO com merge, e há ~65 pontos no app
    // chamando `saveTournament(t)` com um `t` vindo da memória. Qualquer um com cópia
    // atrasada apaga quem entrou depois — sem erro, sem log, sem rastro. `skipParticipants`
    // existe pra isso e o comentário lá em cima promete que "organizer edits" não tocam em
    // participants; SÓ o `sync()` passa a flag. Promessa que o código não cumpria.
    //
    // A DOUTRINA (a mesma do memberUids acima, que já é "NUNCA ENCOLHE"): tirar alguém é
    // ATO DECLARADO. Todo save pode mexer nos CAMPOS de um inscrito à vontade, mas nenhum
    // faz alguém desaparecer — o ausente volta do doc fresco.
    //
    // Compara por UID, nunca por posição: dupla carrega dois uids (p1Uid/p2Uid) e
    // `_participantUids` os enxerga. É isso que faz o SORTEIO — que funde dois solos numa
    // dupla — não disparar restauração e duplicar o elenco a cada rodada.
    // Entrada SEM uid (fictício) não é protegida: não há identidade estável pra casar, e
    // inventar uma casaria homônimos. Limitação declarada e coberta por teste.
    //
    // ⚠️ MODO DE FALHA ESCOLHIDO: se um caminho legítimo de remoção esquecer a flag, a
    // pessoa CONTINUA inscrita e o console grita (+ Sentry). O contrário — sumir calado —
    // é o que custou dois dias de torneio a alguém.
    // ── v1.8.1 · INSCRIÇÃO SÓ-OTIMISTA NÃO VIRA INSCRITO ──────────────────────────
    // O cliente empurra a pessoa em `t.participants` ANTES de falar com o servidor, pra a
    // tela responder na hora, e desfaz quando a resposta chega. Se a resposta NUNCA chega
    // (4G caindo na quadra, aba fechada, timeout), o push ficava — e qualquer save
    // posterior o gravava. A pessoa virava "inscrita" sem nunca ter passado pela LISTA DE
    // ESPERA, que é onde a regra da 1.6.86 manda quem chega depois do sorteio: ficava no
    // elenco, fora de qualquer grupo, INVISÍVEL na rodada e nunca chamada.
    // Foi a causa-raiz de M.Delia Fernandez, Marcos Alvarez e Debora Castello no Confra —
    // achada em 10/ago depois de eliminar, por medição, inscrição manual, o bug do toggle,
    // a proteção do elenco, a CF, o fallback e a promoção por formação de grupo.
    // ⚠️ Aqui é o lugar certo: o CHOKE POINT. Quem grava inscrição de verdade é a CF (ou a
    // transação de fallback), e ambas devolvem o array AUTORITATIVO — que não tem a marca.
    // ⚠️ E isto NÃO briga com o guard "o elenco nunca encolhe": ele restaura quem está no
    // BANCO e sumiu do save; uma inscrição só-otimista nunca chegou ao banco.
    try {
      if (Array.isArray(cleanData.participants)) {
        cleanData.participants = cleanData.participants.filter(function (p) {
          return !(p && typeof p === 'object' && p._pendingEnroll);
        }).map(function (p) {
          if (p && typeof p === 'object' && '_pendingEnroll' in p) {
            var c = {}; for (var k in p) if (k !== '_pendingEnroll' && Object.prototype.hasOwnProperty.call(p, k)) c[k] = p[k];
            return c;                                  // marca é transiente: nunca persiste
          }
          return p;
        });
      }
    } catch (_peErr) { /* nunca derruba o save */ }

    var _allowRosterRemoval = !!(options && options.allowRosterRemoval) || cleanData._allowRosterRemoval === true;
    delete cleanData._allowRosterRemoval; // flag transiente — nunca persistir no doc
    var _tocaElenco = Array.isArray(cleanData.participants);
    var _tocaFila   = Array.isArray(cleanData.standbyParticipants) || Array.isArray(cleanData.waitlist);
    if ((_tocaElenco || _tocaFila) && !_allowRosterRemoval) {
      try {
        var _uidsOf = (typeof window !== 'undefined' && typeof window._participantUids === 'function')
          ? window._participantUids
          : function (p) { return (p && p.uid) ? [p.uid] : []; };
        var _rSnap = await this.db.collection('tournaments').doc(docId).get();
        var _banco = _rSnap.exists ? (_rSnap.data() || {}) : null;
        if (_banco) {
          // ── v1.9.87 · O JOGADOR FICTÍCIO TAMBÉM PRECISA SER PROTEGIDO ─────────
          // Pergunta do dono (20/ago/2026): _"se deixarem o app aberto e depois de muito
          // tempo salvarem um placar, não corremos o risco de sobrescrever uma cópia
          // antiga apagando o que outros lançaram nesse meio tempo?"_ — MEDIDO no
          // emulador (tests/concurrency, ALVO 9): placar, elenco, presença, W.O. e
          // suplentes sobrevivem, MAS quem estava na LISTA DE ESPERA sem uid sumia.
          // A causa: os guards casavam SÓ por uid e ignoravam entrada string
          // (`typeof p !== 'object'` → return), que é como o app guarda jogador
          // FICTÍCIO — gente sem conta, que o organizador digita. A limitação estava
          // declarada ("sem identidade estável pra casar"), mas era conservadora demais:
          // dentro deste guard, remover de propósito JÁ exige `allowRosterRemoval`, então
          // restaurar por NOME não desfaz ato nenhum do organizador. O risco de homônimo
          // exato existe e é menor que o de apagar quem está esperando pra jogar.
          var _chavesDe = function (p) {
            if (!p) return [];
            if (typeof p === 'string') {
              var n = p.trim().toLowerCase();
              return n ? ['nome:' + n] : [];
            }
            if (typeof p !== 'object') return [];
            var us = _uidsOf(p).filter(Boolean);
            if (us.length) return us;
            var nm = String(p.displayName || p.name || '').trim().toLowerCase();
            return nm ? ['nome:' + nm] : [];
          };

          var _restored = [];
          // Quem está no elenco DEPOIS deste save (o incoming quando ele traz elenco; o do
          // banco quando não traz). É a régua que reconhece PROMOÇÃO logo abaixo.
          var _noElenco = {};
          (Array.isArray(cleanData.participants) ? cleanData.participants
            : (Array.isArray(_banco.participants) ? _banco.participants : [])
          ).forEach(function (p) {
            _chavesDe(p).forEach(function (u) { if (u) _noElenco[u] = 1; });
          });

          // Quem está na FILA depois deste save — mesma régua do elenco acima: o incoming
          // quando ele traz o campo, o banco quando não traz (um save que só mexe no elenco
          // não afirma nada sobre a fila).
          var _naFilaDepois = {};
          ['standbyParticipants', 'waitlist'].forEach(function (campo) {
            (Array.isArray(cleanData[campo]) ? cleanData[campo]
              : (Array.isArray(_banco[campo]) ? _banco[campo] : [])
            ).forEach(function (p) {
              _chavesDe(p).forEach(function (u) { if (u) _naFilaDepois[u] = 1; });
            });
          });

          // ELENCO: ninguém SOME sem `allowRosterRemoval` — mas SAIR PRA FILA não é sumir.
          //
          // ⚠️ v1.7.72 — A REGRA AQUI ERA "TEM QUE CONTINUAR NO ELENCO", E ISSO DESFAZIA
          // O TOGGLE DA PESSOA. Reproduzido a partir do vídeo da Ana Ribeiro (07/ago/2026):
          // ela ligava "Ativado" e ele voltava sozinho pra "Desativado", quatro vezes. O
          // rastro estava no próprio doc, nos segundos do vídeo — quatro linhas de
          // "Protecao automatica: um save chegou sem 1 pessoa(s)... (participants)".
          // O que acontecia: `_toggleLigaActive` faz o certo (v1.6.86) e move a pessoa de
          // `participants` pra `standbyParticipants`; este guard lia o movimento como perda,
          // restaurava a entrada COMO ESTÁ NO BANCO — ou seja, com `ligaActive:false` — e
          // ainda a deixava nos DOIS lugares (por isso "Sair da lista de espera" convivia
          // com "você está inscrito").
          //
          // A doutrina certa já existia no `mutateTournament` (v1.7.28), que corrigiu este
          // mesmo engano porque a versão "tem que ficar no elenco" QUEBRAVA O W.O.:
          // ninguém pode sumir de TODAS as listas; ONDE a pessoa está é assunto de quem
          // move. Eram duas regras para o mesmo invariante — e a divergência era o bug.
          if (_tocaElenco && Array.isArray(_banco.participants)) {
            _banco.participants.forEach(function (p) {
              var us = _chavesDe(p);                               // uid, ou nome se fictício
              if (!us.length) return;
              if (us.some(function (u) { return _noElenco[u]; })) return;
              if (us.some(function (u) { return _naFilaDepois[u]; })) return;   // MOVIDO pra fila
              cleanData.participants.push(p);                       // volta como está no banco
              us.forEach(function (u) { _noElenco[u] = 1; });
              _restored.push(us[0] + ' (participants)');
            });
          }

          // FILA: depois do sorteio é ONDE AS PESSOAS ESPERAM (v1.6.86) — e some sem
          // ninguém notar, porque quem espera não tem jogo pra sentir falta.
          // NÃO exige flag: a saída legítima da fila é PROMOÇÃO, e promoção tem marca
          // própria — a pessoa passa a estar no elenco. Quem sumiu da fila SEM aparecer no
          // elenco não foi promovido, foi perdido. Assim as dezenas de caminhos de promoção
          // (W.O., formação de grupo, substituição) seguem funcionando sem marcar nenhum.
          ['standbyParticipants', 'waitlist'].forEach(function (campo) {
            if (!Array.isArray(cleanData[campo]) || !Array.isArray(_banco[campo]) || !_banco[campo].length) return;
            var _naFila = {};
            cleanData[campo].forEach(function (p) {
              _chavesDe(p).forEach(function (u) { if (u) _naFila[u] = 1; });
            });
            _banco[campo].forEach(function (p) {
              var us = _chavesDe(p);                               // uid, ou nome se fictício
              if (!us.length) return;
              if (us.some(function (u) { return _naFila[u]; })) return;
              if (us.some(function (u) { return _noElenco[u]; })) return;   // PROMOVIDO
              cleanData[campo].push(p);
              us.forEach(function (u) { _naFila[u] = 1; });
              _restored.push(us[0] + ' (' + campo + ')');
            });
          });

          // ── HISTÓRICO É APPEND-ONLY, e por isso não pode encolher tampouco ────
          // Reconstruir o sumiço do Gersom custou uma tarde porque NÃO HÁ RASTRO de quem
          // mexe no elenco — tive que inferir por notificações. O histórico é o rastro, e
          // ele vive no MESMO doc, sujeito ao MESMO save atrasado: registrar o incidente
          // numa lista que o próximo save apaga não registra nada. Une pelo par
          // (date+message) — nunca some linha, e reescrever a mesma não duplica.
          if (Array.isArray(_banco.history) && _banco.history.length) {
            var _hIn = Array.isArray(cleanData.history) ? cleanData.history : [];
            var _hKey = function (e) { return String((e && e.date) || '') + '|' + String((e && e.message) || ''); };
            var _vistos = {};
            _hIn.forEach(function (e) { _vistos[_hKey(e)] = 1; });
            var _perdidas = _banco.history.filter(function (e) { return !_vistos[_hKey(e)]; });
            if (_perdidas.length) {
              cleanData.history = _perdidas.concat(_hIn);
            }
          }

          if (_restored.length) {
            // O incidente vira LINHA NO HISTÓRICO, não só log de console: console some
            // quando a aba fecha, e foi justamente a falta de rastro que fez este caso
            // levar uma tarde pra ser reconstruído. Anexa ao histórico do BANCO (já unido
            // acima), nunca ao da cópia que chegou — ela é a atrasada.
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_banco.history) ? _banco.history.slice() : [];
            cleanData.history.push({
              date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem ' + _restored.length +
                ' pessoa(s) e elas foram restauradas (' + _restored.join(', ') + ').'
            });
            // Barulhento de propósito: é o sinal de que existe caminho gravando lista
            // atrasada. Silenciar seria repetir o bug numa camada acima.
            if (window._warn) window._warn('[saveTournament] LISTA PROTEGIDA em ' + docId + ': o save chegou sem ' +
              _restored.length + ' pessoa(s) e elas foram RESTAURADAS do banco — ' + _restored.join(', ') +
              '. Se a remoção era intencional, o caminho precisa passar allowRosterRemoval.');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('roster shrink blocked: ' + docId + ' (' + _restored.join(', ') + ')')); } catch (_se) {}
          }
        }
      } catch (_rgErr) { /* o guard nunca derruba o save */ }
    }


    // ── v1.7.30 · PLACAR LANÇADO NUNCA É APAGADO POR UM SAVE QUE NÃO É DE PLACAR ──
    // MEDIDO contra o doc real do Confra: um save do organizador (editar o torneio) com
    // cópia lida ANTES de alguém lançar um resultado gravava `rounds` da memória e o
    // placar voltava a `null x null`. Mesma família do sumiço do Gersom (v1.7.26) — lista
    // compartilhada gravada inteira a partir de estado velho —, só que atinge o dado que
    // as pessoas acabaram de produzir na quadra, que é o pior de todos pra perder.
    // O guard do elenco não pegava isso: ele protege listas de PESSOAS, e o placar mora
    // em `rounds[].matches[]` / `matches[]` / `groups[].matches[]`.
    //
    // REGRA: quem tem placar no banco e chega SEM placar no save é REGRESSÃO — o jogo
    // volta como está no banco. Corrigir placar segue livre (chega COM valor, vence o
    // que chegou). Apagar de propósito passa a exigir `allowScoreClear`.
    // Casa por `id` do jogo, nunca por posição: sorteio e rodada extra reordenam.
    var _allowScoreClear = !!(options && options.allowScoreClear) || cleanData._allowScoreClear === true;
    delete cleanData._allowScoreClear;
    if (!_allowScoreClear) {
      try {
        var _snapP = await this.db.collection('tournaments').doc(docId).get();
        if (_snapP.exists) {
          var _bancoP = _snapP.data() || {};
          var _temPlacar = function (m) {
            return !!(m && (m.winner || m.scoreP1 != null || m.scoreP2 != null ||
                            (Array.isArray(m.sets) && m.sets.length)));
          };
          // índice id→jogo do BANCO, varrendo as três formas onde jogo mora
          var _idx = {};
          var _varre = function (t, fn) {
            (Array.isArray(t.matches) ? t.matches : []).forEach(fn);
            (Array.isArray(t.rounds) ? t.rounds : []).forEach(function (r) {
              (r && Array.isArray(r.matches) ? r.matches : []).forEach(fn);
            });
            (Array.isArray(t.groups) ? t.groups : []).forEach(function (g) {
              (g && Array.isArray(g.matches) ? g.matches : []).forEach(fn);
            });
          };
          _varre(_bancoP, function (m) { if (m && m.id != null && _temPlacar(m)) _idx[String(m.id)] = m; });
          var _revertidos = [];
          if (Object.keys(_idx).length) {
            _varre(cleanData, function (m) {
              if (!m || m.id == null) return;
              var b = _idx[String(m.id)];
              if (!b || _temPlacar(m)) return;              // sem placar no banco, ou veio COM: nada a fazer
              // devolve os campos de RESULTADO; o resto do jogo (slots, rótulos) fica como veio
              ['scoreP1', 'scoreP2', 'winner', 'sets', 'setsWonP1', 'setsWonP2',
               'totalGamesP1', 'totalGamesP2', 'pendingResult', 'resultAt'].forEach(function (k) {
                if (b[k] !== undefined) m[k] = b[k];
              });
              _revertidos.push(String(m.id));
            });
          }
          if (_revertidos.length) {
            if (window._warn) window._warn('[saveTournament] PLACAR PROTEGIDO em ' + docId + ': o save chegou sem o resultado de ' +
              _revertidos.length + ' jogo(s) que JÁ TÊM placar no banco — restaurados (' + _revertidos.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('score wipe blocked: ' + docId + ' (' + _revertidos.length + ')')); } catch (_se) {}
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_bancoP.history) ? _bancoP.history.slice() : [];
            cleanData.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem o placar de ' + _revertidos.length +
                ' jogo(s) ja lancado(s) e eles foram restaurados.' });
          }

          // ── v1.7.32 · O QUE O JOGO JÁ GANHOU NÃO SOME, E A CHAVE NÃO ENCOLHE ──
          // O guard acima devolve o PLACAR de um jogo que veio sem ele. Não cobria o
          // jogo que NÃO VEIO, nem o que o jogo ganhou fora do placar. MEDIDO contra o
          // doc real do Confra, o save atrasado do organizador destruía CINCO coisas:
          // a rodada 2 recém-criada, um jogo de entrada tardia, o link do grupo de
          // WhatsApp, o horário combinado e a substituição por W.O.
          //
          // DUAS regras, desenhadas pra não atrapalhar quem apaga de propósito:
          //
          // (a) CAMPOS ADITIVOS de um jogo (link do grupo, horário combinado) só nascem
          //     pelo fluxo deles e nunca são "desmarcados" num save de outra coisa —
          //     então um save que chega sem eles está desatualizado, não decidindo.
          //
          // (b) SUMIÇO. Aqui está a distinção que evita 6 bandeiras espalhadas pelos
          //     pontos de reset: um RESET zera (`rounds: []`), um save atrasado traz
          //     MENOS rodadas — nunca zero. Então N→0 passa livre (é o re-sorteio, o
          //     reset do sandbox, o construtor de formato) e só 0<M<N é recusado.
          //     Dentro de uma rodada que sobreviveu, o jogo que sumiu volta — com DUAS
          //     exceções, tiradas de quem realmente apaga jogo no app (varri os 10
          //     pontos): (i) `isSitOut` — `_removeSitOut` (liga-substitution) e `_isRem`
          //     (bracket-logic) só apagam MARCADOR de folga, e ressuscitá-lo quebraria o
          //     W.O.; (ii) save que ACRESCENTA jogo novo — os outros 8 pontos são o motor
          //     reescrevendo a chave (re-sorteio, repescagem, chaves-adapter), e ele
          //     sempre gera jogo junto. Save atrasado só PERDE, nunca traz id novo.
          //     Na dúvida (o motor está reescrevendo), o guard sai de cena.
          //
          // ⚠️ NÃO cobre o slot reescrito (a substituição por W.O. desfeita, caso 3 da
          // medição): os dois lados escrevem o MESMO campo com dado igualmente válido e
          // não há como saber qual é o mais novo sem versionar o jogo. Fica anotado.
          // 'scheduledKind' (2.0.75) entra junto com os irmãos: é a ORIGEM da data
          // (estimate/organizer/consensus) e viaja SEMPRE com o scheduledAt. Fora daqui,
          // um save atrasado devolveria a data sem a origem — e a grade estimada, que só
          // pode sobrescrever 'estimate', passaria a achar que tudo foi combinado.
          var _ADITIVOS = ['waGroup', 'schedule', 'scheduledAt', 'scheduledBy', 'scheduledKind'];
          // índice COMPLETO do banco (o de cima só tem quem tem placar) + onde cada um mora
          var _ondeMora = {};
          var _idxAll = {};
          (Array.isArray(_bancoP.matches) ? _bancoP.matches : []).forEach(function (m) {
            if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'matches' }; }
          });
          (Array.isArray(_bancoP.rounds) ? _bancoP.rounds : []).forEach(function (r, ri) {
            (r && Array.isArray(r.matches) ? r.matches : []).forEach(function (m) {
              if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'rounds', i: ri, round: (r.round != null ? r.round : ri) }; }
            });
          });
          (Array.isArray(_bancoP.groups) ? _bancoP.groups : []).forEach(function (g, gi) {
            (g && Array.isArray(g.matches) ? g.matches : []).forEach(function (m) {
              if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'groups', i: gi }; }
            });
          });

          // (a) devolve os campos aditivos nos jogos que VIERAM
          var _aditRest = [];
          _varre(cleanData, function (m) {
            if (!m || m.id == null) return;
            var b = _idxAll[String(m.id)];
            if (!b) return;
            _ADITIVOS.forEach(function (k) {
              if (b[k] != null && m[k] == null) { m[k] = b[k]; _aditRest.push(String(m.id) + '·' + k); }
            });
          });

          // ⚠️ v1.8.0 — CALCULADO AQUI, ANTES DE (b1). Estava lá embaixo, em (b2), e o guard
          // de GRUPO que entrou nesta versão o lia ANTES de existir: `undefined` → o guard
          // achava que NUNCA era o motor e restaurava grupo durante o re-sorteio. Mesma
          // armadilha de zona morta que o `db` da CF deu hoje — a ordem é parte da regra.
          var _vistos = {};
          _varre(cleanData, function (m) { if (m && m.id != null) _vistos[String(m.id)] = 1; });
          // o save TROUXE jogo que o banco não tem ⇒ é o motor reescrevendo a chave: sai de cena
          var _motorReescrevendo = Object.keys(_vistos).some(function (id) { return !_idxAll[id]; });

          // (b1) rodada que sumiu — só quando o save NÃO zerou (zerar é reset declarado pela forma)
          var _rodVolt = [], _grpVolt = [];
          if (Array.isArray(cleanData.rounds) && Array.isArray(_bancoP.rounds) &&
              cleanData.rounds.length > 0 && cleanData.rounds.length < _bancoP.rounds.length) {
            var _temR = {};
            cleanData.rounds.forEach(function (r, i) { _temR[String(r && r.round != null ? r.round : i)] = 1; });
            _bancoP.rounds.forEach(function (r, i) {
              var k = String(r && r.round != null ? r.round : i);
              if (_temR[k]) return;
              cleanData.rounds.push(r); _rodVolt.push(k);
            });
            if (_rodVolt.length) {
              cleanData.rounds.sort(function (a, b) {
                return (a && a.round != null ? a.round : 0) - (b && b.round != null ? b.round : 0);
              });
            }
          }

          // ── v1.8.0 · (b1½) O GRUPO QUE SUMIU ───────────────────────────────────────
          // O guard cobria RODADA (b1) e JOGO (b2) e deixava o GRUPO de fora — a única
          // menção a `monarchGroups` no arquivo era um comentário. MEDIDO no Confra: a
          // formação por espera promove as 4 pessoas pro elenco e as tira da fila; um save
          // atrasado devolvia `rounds` sem o grupo, e como `participants` NÃO encolhe
          // (1.7.26) a promoção sobrevivia e o grupo não. Sobrava gente no elenco, fora de
          // qualquer grupo, INVISÍVEL na rodada — foi o estado de M.Delia, Marcos e Debora.
          // Metade da operação persistindo é pior que nenhuma: nenhum caminho do app produz
          // esse estado, então nada o conserta sozinho.
          // Mesma régua dos outros: o motor reescrevendo (`_motorReescrevendo`, id de jogo
          // novo) sai de cena, e rodada zerada é reset declarado pela FORMA.
          if (!_motorReescrevendo && Array.isArray(cleanData.rounds)) {
            (Array.isArray(_bancoP.rounds) ? _bancoP.rounds : []).forEach(function (rb, ri) {
              var gb = (rb && Array.isArray(rb.monarchGroups)) ? rb.monarchGroups : [];
              if (!gb.length) return;
              var rk = (rb.round != null ? rb.round : ri);
              var rs = null;
              for (var _i = 0; _i < cleanData.rounds.length; _i++) {
                var _c = cleanData.rounds[_i];
                if (!_c) continue;
                if (_c.round != null ? _c.round === rk : _i === ri) { rs = _c; break; }
              }
              if (!rs) return;                       // a rodada inteira sumiu → (b1) cuida
              if (!Array.isArray(rs.monarchGroups)) rs.monarchGroups = [];
              var _tem = {};
              rs.monarchGroups.forEach(function (g, gi) {
                if (g) _tem[String(g.groupIdx != null ? g.groupIdx : gi)] = 1;
              });
              gb.forEach(function (g, gi) {
                var k = String(g && g.groupIdx != null ? g.groupIdx : gi);
                if (_tem[k]) return;
                rs.monarchGroups.push(g);
                _grpVolt.push(rk + '/' + k);
              });
            });
          }

          // (b2) jogo que sumiu de uma rodada/grupo que sobreviveu
          // ⚠️ `_vistos` recalculado AQUI, sobre o estado JÁ restaurado por (b1)/(b1½). Ele
          // chegou a ser compartilhado com o cálculo de `_motorReescrevendo` lá em cima, e
          // isso duplicava jogo: a rodada restaurada por (b1) traz os jogos dela, mas o
          // conjunto antigo não os conhecia e (b2) os empurrava de novo.
          var _vistos = {};
          _varre(cleanData, function (m) { if (m && m.id != null) _vistos[String(m.id)] = 1; });
          // v1.7.95 — O SAVE ESTÁ PROVADAMENTE ATRASADO? O contador de DOCUMENTO responde.
          // `rosterRev` sobe a cada troca de escalação ACEITA. Quem leu o doc DEPOIS do
          // W.O. carrega o valor atual; a cópia atrasada carrega um ANTERIOR (ou nenhum).
          // Lido AQUI, antes do bloco de carimbo lá embaixo reescrever `cleanData.rosterRev`.
          var _revBanco = (typeof _bancoP.rosterRev === 'number') ? _bancoP.rosterRev : null;
          var _revSave  = (typeof cleanData.rosterRev === 'number') ? cleanData.rosterRev : null;
          var _saveAtrasadoPorRev = (_revBanco != null && (_revSave == null || _revSave < _revBanco));

          var _jogoVolt = [];
          if (!_motorReescrevendo) Object.keys(_idxAll).forEach(function (id) {
            if (_vistos[id]) return;
            var b = _idxAll[id];
            // A FOLGA é a 4ª estrutura do W.O. — e é ELA que a lista "⚠️ W.O. (N)" lê
            // (`sitOutReason==='wo'`), além de carregar os 0 pts da rodada. Deixá-la sumir
            // SEMPRE apagava a penalidade num save atrasado. Mas ela também some
            // LEGITIMAMENTE quando alguém reverte o W.O. — é por isso que a exceção existe.
            // O que separa os dois é o contador acima: só volta quando o save é provadamente
            // de antes da última troca aceita. Folga comum (inativo/remainder) segue livre.
            if (b && b.isSitOut) {
              if (b.sitOutReason !== 'wo' || !_saveAtrasadoPorRev) return;
            }
            var onde = _ondeMora[id] || {};
            var alvo = null;
            if (onde.tipo === 'matches') {
              if (!Array.isArray(cleanData.matches)) cleanData.matches = [];
              alvo = cleanData.matches;
            } else if (onde.tipo === 'rounds' && Array.isArray(cleanData.rounds)) {
              var r = null;
              for (var _ri = 0; _ri < cleanData.rounds.length; _ri++) {
                var _c = cleanData.rounds[_ri];
                if (_c && _c.round != null ? _c.round === onde.round : _ri === onde.i) { r = _c; break; }
              }
              if (r) { if (!Array.isArray(r.matches)) r.matches = []; alvo = r.matches; }
            } else if (onde.tipo === 'groups' && Array.isArray(cleanData.groups) && cleanData.groups[onde.i]) {
              var g = cleanData.groups[onde.i];
              if (!Array.isArray(g.matches)) g.matches = [];
              alvo = g.matches;
            }
            if (!alvo) return;                                // sem onde pousar: não inventa lugar
            alvo.push(b); _jogoVolt.push(id);
          });

          // ── v1.7.33 · TROCA DE JOGADOR NO JOGO: o mais NOVO vence ────────────────
          // Este era o caso 5 da medição e o único que eu tinha dado como insolúvel: o
          // suplente entra pelo W.O., o organizador salva uma cópia velha, e a
          // substituição é DESFEITA. Os dois lados escrevem o MESMO campo com dado
          // igualmente válido — sem saber QUANDO cada um escreveu, não há como decidir.
          //
          // A informação que faltava é um carimbo, e ele nasce AQUI em vez de nos 10
          // pontos que mexem em slot (draw, phases, bracket-logic, liga-substitution):
          // comparo a escalação que chegou com a do banco e, se mudou, carimbo
          // `rosterAt`. Assim toda troca se carimba sozinha e nenhum call site precisa
          // saber que o carimbo existe — a lição do `_repairTournaments`, onde manter
          // lista à mão sempre esquece o campo novo.
          //
          // Decisão: mudou E o banco tem carimbo MAIS NOVO que o do save ⇒ o save é
          // atrasado, a escalação do banco volta. Primeira troca da vida (banco sem
          // carimbo) é aceita e carimbada. Duas trocas legítimas em sequência também
          // passam: quem leu DEPOIS da primeira carrega o carimbo dela.
          //
          // v1.7.91 — DUAS correções neste guard, as duas medidas no incidente da
          // Denise → Carol (Confra, 09–10/ago): a substituição foi aplicada, conferida
          // no banco, e ~2h depois um save atrasado a desfez — com o dono SEM INTERNET,
          // ou seja não foi ato de ninguém, foi uma aba com cópia velha gravando.
          //   (1) o carimbo agora nasce TAMBÉM na transação (ver `_stampRosterChanges`).
          //       Era o buraco principal: W.O., substituição e formação de grupo passam
          //       TODOS pela transação, então a troca ia pro banco sem carimbo e o save
          //       atrasado era aceito como "primeira troca da vida".
          //   (2) o guard agora cobre o ELENCO DO GRUPO, não só o slot do jogo — a
          //       classificação sai de `monarchGroups[g].players[]`, então proteger só
          //       os jogos deixava a tela mostrando o ausente na tabela.
          var self = this;
          var _bancoUnits = {};
          this._eachRosterUnit(_bancoP, function (u, key, tipo) { _bancoUnits[key] = u; });
          var _slotRev = [], _slotNovo = 0, _agora = Date.now();
          if (!_motorReescrevendo) this._eachRosterUnit(cleanData, function (u, key, tipo) {
            var b = _bancoUnits[key];
            if (!b) return;                                   // unidade nova: nada a comparar
            if (self._rosterSig(u, tipo) === self._rosterSig(b, tipo)) {
              if (b.rosterAt != null && u.rosterAt == null) u.rosterAt = b.rosterAt; // não perde o carimbo
              return;
            }
            var _cB = (typeof b.rosterAt === 'number') ? b.rosterAt : null;
            var _cS = (typeof u.rosterAt === 'number') ? u.rosterAt : null;
            if (_cB != null && (_cS == null || _cS < _cB)) {
              self._ROSTER_KEYS[tipo].forEach(function (k) { if (b[k] !== undefined) u[k] = b[k]; else delete u[k]; });
              u.rosterAt = _cB;
              _slotRev.push(key);
            } else {
              u.rosterAt = _agora;                            // troca legítima: carimba
              _slotNovo++;
            }
          });
          // ── v1.7.36 · VIGIA ESTRUTURAL (metade do cliente) ───────────────────
          // Os guards acima moram no CLIENTE QUE GRAVA — só protegem quem os carrega.
          // O app NATIVO não tem auto-update: mesmo com a 1.7.35 aprovada, vai existir
          // uma janela com gente rodando 1.6.3/1.7.9 e gravando no mesmo torneio.
          //
          // `rosterRev` é um contador de nível de DOCUMENTO que sobe quando uma troca
          // de escalação é ACEITA. Ele não está na allowlist do participante em
          // `firestore.rules` (que é `hasOnly([...])`, lista FECHADA), então campo novo
          // já nasce inescrevível por ele — nenhuma mudança de regra foi necessária.
          //
          // O que isso compra: no servidor dá pra separar "escalação mudou junto com o
          // contador" (veio de quem tem autoridade) de "escalação mudou e o contador
          // ficou parado" (cliente velho devolvendo estado antigo). Quem lê isso é o
          // gatilho `guardBracketRosters`, hoje em modo OBSERVAÇÃO.
          //
          // Só sobe quando uma troca foi de fato aceita (`_slotNovo`) — nunca num save
          // comum, senão a escrita do participante passaria a carregar um campo fora da
          // allowlist e seria RECUSADA INTEIRA (ele perderia o lançamento de placar).
          if (_slotNovo > 0) {
            var _revB = (typeof _bancoP.rosterRev === 'number') ? _bancoP.rosterRev : 0;
            cleanData.rosterRev = _revB + 1;
          } else if (_bancoP.rosterRev != null && cleanData.rosterRev == null) {
            cleanData.rosterRev = _bancoP.rosterRev;   // não perde o contador
          }

          if (_slotRev.length) {
            if (window._warn) window._warn('[saveTournament] ESCALACAO PROTEGIDA em ' + docId + ': o save trazia escalação ANTIGA de ' +
              _slotRev.length + ' jogo(s) (ex.: substituição por W.O. já aplicada) — restaurada do banco (' + _slotRev.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('roster revert blocked: ' + docId + ' (' + _slotRev.length + ')')); } catch (_se) {}
          }

          // ── v1.7.34 · O 3º STORAGE DA ESPERA, O W.O. REIVINDICADO E A ENQUETE ────
          // A espera vive em TRÊS storages (cânone). O guard de 1.7.26 pegou os dois que
          // são ARRAY de entrada com uid (`standbyParticipants`, `waitlist`) e deixou de
          // fora o terceiro: `monarchWaitlist`, que é MAPA categoria→NOMES. MEDIDO no doc
          // real: quem entra na fila por ali some num save atrasado — **é o bug do Gersom
          // ainda aberto**. E hoje há gente exposta: o **Renato Oshima** existe SÓ nesse
          // mapa (não está no elenco nem em `standbyParticipants`), então zerá-lo o apaga
          // do torneio inteiro.
          //
          // Sair da fila é legítimo — mas SÓ o motor faz isso, e sempre sorteando (varri:
          // todos os `_setMonarchWaitlist` que encolhem estão em bracket-logic.js, tirando
          // da fila quem acabou de entrar num grupo). Reuso então o mesmo sinal da 1.7.32:
          // trouxe jogo com id novo ⇒ o motor sorteou ⇒ o guard sai de cena.
          //
          // `woClaims` e `polls`: varri o app e NADA os remove (o W.O. reivindicado é
          // append-only, a enquete idem) — some só por save atrasado. Guard direto por id.
          var _espVolt = [], _apVolt = [];
          if (!_motorReescrevendo && !_allowRosterRemoval) {
            var _mwlB = _bancoP.monarchWaitlist;
            if (_mwlB && typeof _mwlB === 'object' && !Array.isArray(_mwlB)) {
              if (!cleanData.monarchWaitlist || typeof cleanData.monarchWaitlist !== 'object' ||
                  Array.isArray(cleanData.monarchWaitlist)) cleanData.monarchWaitlist = {};
              Object.keys(_mwlB).forEach(function (cat) {
                var _b = _mwlB[cat];
                if (!Array.isArray(_b) || !_b.length) return;
                if (!Array.isArray(cleanData.monarchWaitlist[cat])) cleanData.monarchWaitlist[cat] = [];
                var _p = cleanData.monarchWaitlist[cat];
                _b.forEach(function (nome) {
                  if (nome == null || _p.indexOf(nome) >= 0) return;
                  _p.push(nome); _espVolt.push(String(cat) + '/' + String(nome));
                });
              });
            }
            // ── v1.7.35 · PRESENÇA ("Cheguei") não é apagada por save de outra coisa ──
            // Eu tinha deixado isto de fora achando que DESMARCAR passava por aqui e o
            // guard prenderia a pessoa. Fui ler o toggle (`_toggleCheckIn`) e **não passa**:
            // desmarcar vai por `setPresenceFields` (escrita campo a campo, `checkedIn.<uid>`)
            // ou pelo `AppStore.mutate`, que é TRANSAÇÃO e lê o doc fresco. Nenhum dos dois
            // é este caminho. Então proteger aqui não pode prender ninguém na quadra.
            // Quem legitimamente zera a presença por aqui é o SORTEIO ("acabou de sortear,
            // ninguém está presente" — regra do dono, tournaments-draw.js) — e ele traz jogo
            // com id novo, que é o mesmo sinal já usado nos guards de cima.
            ['checkedIn', 'absent', 'vips', 'checkedInConfirmed'].forEach(function (mapa) {
              var _b = _bancoP[mapa];
              if (!_b || typeof _b !== 'object' || Array.isArray(_b)) return;
              var _chaves = Object.keys(_b);
              if (!_chaves.length) return;
              if (!cleanData[mapa] || typeof cleanData[mapa] !== 'object' || Array.isArray(cleanData[mapa])) cleanData[mapa] = {};
              _chaves.forEach(function (k) {
                if (cleanData[mapa][k] !== undefined) return;
                cleanData[mapa][k] = _b[k]; _apVolt.push(mapa + '/' + k);
              });
            });

            // ── v1.8.0 · REGISTRO DE "JÁ AVISEI" NÃO SOME ────────────────────────────
            // Varredura do doc inteiro (ordem do dono: parar de achar buraco por incidente).
            // `categoryNotifications` (LISTA, append-only — o app só faz `push`) e
            // `remindersSent` (MAPA de janelas já disparadas, escrito pela CF de lembrete e
            // lido pra dedup; NADA no app remove) são registros de que a pessoa JÁ foi
            // avisada. Perdê-los não some com dado: **re-notifica todo mundo**. No doc real
            // do Confra são 82 avisos de categoria sobre 133 pessoas — spam garantido.
            // Mesma classe de `woClaims`/`polls`, e por isso entram no mesmo bloco.
            {
              var _cnB = _bancoP.categoryNotifications;
              if (Array.isArray(_cnB) && _cnB.length) {
                if (!Array.isArray(cleanData.categoryNotifications)) cleanData.categoryNotifications = [];
                if (cleanData.categoryNotifications.length < _cnB.length) {
                  var _falta = _cnB.length - cleanData.categoryNotifications.length;
                  cleanData.categoryNotifications = _cnB.slice();  // sem id estável: o banco manda
                  _apVolt.push('categoryNotifications/+' + _falta);
                }
              }
              var _rsB = _bancoP.remindersSent;
              if (_rsB && typeof _rsB === 'object' && !Array.isArray(_rsB)) {
                if (!cleanData.remindersSent || typeof cleanData.remindersSent !== 'object' ||
                    Array.isArray(cleanData.remindersSent)) cleanData.remindersSent = {};
                Object.keys(_rsB).forEach(function (k) {
                  if (cleanData.remindersSent[k] !== undefined) return;
                  cleanData.remindersSent[k] = _rsB[k]; _apVolt.push('remindersSent/' + k);
                });
              }
            }

            ['woClaims', 'polls'].forEach(function (campo) {
              var _b = _bancoP[campo];
              if (!Array.isArray(_b) || !_b.length) return;
              if (!Array.isArray(cleanData[campo])) cleanData[campo] = [];
              var _tem = {};
              cleanData[campo].forEach(function (o) { if (o && o.id != null) _tem[String(o.id)] = 1; });
              _b.forEach(function (o) {
                if (!o || o.id == null || _tem[String(o.id)]) return;
                cleanData[campo].push(o); _apVolt.push(campo + '/' + String(o.id));
              });
            });
          }
          if (_espVolt.length || _apVolt.length) {
            if (window._warn) window._warn('[saveTournament] ESPERA/REGISTRO PROTEGIDO em ' + docId + ': ' +
              (_espVolt.length ? _espVolt.length + ' nome(s) da lista de espera ' : '') +
              (_apVolt.length ? _apVolt.length + ' registro(s) (W.O./enquete) ' : '') +
              'sumiram do save e voltaram do banco.');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('waitlist/claims shrink blocked: ' + docId + ' (e=' + _espVolt.length + ' r=' + _apVolt.length + ')')); } catch (_se) {}
          }

          if (_rodVolt.length || _grpVolt.length || _jogoVolt.length || _aditRest.length) {
            if (window._warn) window._warn('[saveTournament] CHAVE PROTEGIDA em ' + docId + ': ' +
              (_rodVolt.length ? _rodVolt.length + ' rodada(s) ' : '') +
              (_grpVolt.length ? _grpVolt.length + ' grupo(s) ' : '') +
              (_jogoVolt.length ? _jogoVolt.length + ' jogo(s) com valor ' : '') +
              (_aditRest.length ? _aditRest.length + ' campo(s) (grupo/horário) ' : '') +
              'sumiram do save e foram restaurados do banco.');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('bracket shrink blocked: ' + docId + ' (r=' + _rodVolt.length + ' g=' + _grpVolt.length + ' m=' + _jogoVolt.length + ' f=' + _aditRest.length + ')')); } catch (_se) {}
          }
          if (_rodVolt.length || _grpVolt.length || _jogoVolt.length) {
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_bancoP.history) ? _bancoP.history.slice() : [];
            cleanData.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem ' + _rodVolt.length + ' rodada(s), ' +
                _grpVolt.length + ' grupo(s) e ' + _jogoVolt.length +
                ' jogo(s) que existem no banco e eles foram restaurados.' });
          }
        }
      } catch (_spErr) { /* o guard nunca derruba o save */ }
    }

    // ── v1.7.31 · ACEITE DE CO-ORGANIZAÇÃO NÃO VOLTA A "PENDENTE" ─────────────
    // MEDIDO: um save atrasado devolve `coHosts[i].status` de 'active' pra 'pending' e
    // apaga o `acceptedAt` — a pessoa aceita e, horas depois, o convite aparece pendente
    // outra vez. Já houve um caso ao vivo desse sintoma (Raquel, jul/2026); na época foi
    // atribuído a um `permission-denied`, e o fix da v1.6.9 tratou aquela causa. Agora sei
    // que existe uma SEGUNDA porta pro mesmo sintoma, e ela continuava aberta.
    // (Varri as notificações antes de mexer: o único `pending` de hoje no Confra é da
    // Fabiana, que nunca aceitou — não há vítima em produção. Isto é preventivo.)
    //
    // A regra é MONOTÔNICA e por isso não quebra nada: aceitar é avanço de estado e não
    // retrocede. CANCELAR o convite (que REMOVE a entrada) segue livre — só a volta
    // aceito→pendente é barrada. Assim o organizador continua podendo cancelar.
    if (Array.isArray(cleanData.coHosts)) {
      try {
        var _snapC = await this.db.collection('tournaments').doc(docId).get();
        var _chBanco = _snapC.exists ? ((_snapC.data() || {}).coHosts) : null;
        if (Array.isArray(_chBanco) && _chBanco.length) {
          var _aceito = function (c) { return c && (c.status === 'active' || c.status === 'accepted'); };
          var _porUid = {};
          _chBanco.forEach(function (c) { if (c && c.uid) _porUid[c.uid] = c; });
          var _regrediram = [];
          cleanData.coHosts.forEach(function (c, i) {
            if (!c || !c.uid) return;
            var b = _porUid[c.uid];
            if (!b || !_aceito(b) || _aceito(c)) return;      // não regrediu
            cleanData.coHosts[i] = b;                          // devolve o estado do banco
            _regrediram.push(c.uid);
          });
          if (_regrediram.length) {
            if (window._warn) window._warn('[saveTournament] CO-ORGANIZACAO PROTEGIDA em ' + docId +
              ': o save tentava devolver ' + _regrediram.length + ' aceite(s) para pendente — restaurado(s) (' + _regrediram.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('cohost accept revert blocked: ' + docId)); } catch (_se) {}
          }
        }
      } catch (_chErr) { /* o guard nunca derruba o save */ }
    }

    var _allowReset = (options && options._allowConfigReset) || cleanData._allowConfigReset === true;
    delete cleanData._allowConfigReset; // flag transiente — nunca persistir no doc
    try {
      var _incMulti = Array.isArray(cleanData.phases) && cleanData.phases.length > 1;
      if (!_incMulti && !_allowReset) {
        var _exSnap = await this.db.collection('tournaments').doc(docId).get();
        if (_exSnap.exists) {
          var _ex = _exSnap.data() || {};
          if (Array.isArray(_ex.phases) && _ex.phases.length > 1) {
            cleanData.phases = _ex.phases;
            if (_ex.reiRainha != null) cleanData.reiRainha = _ex.reiRainha;
            if (_ex.currentPhaseIndex != null) cleanData.currentPhaseIndex = _ex.currentPhaseIndex;
            if (_ex.drawMode != null) cleanData.drawMode = _ex.drawMode;
            if (_ex.allowSelfDeactivation != null) cleanData.allowSelfDeactivation = _ex.allowSelfDeactivation;
            if (window._warn) window._warn('[saveTournament] BLOQUEADO: save sem fases ia zerar torneio multi-fase ' + docId + ' — config do banco preservada (phases=' + _ex.phases.length + ')');
          }
        }
      }
    } catch (_cfgErr) { /* blindagem best-effort; nunca derruba o save */ }
    /* ── TORNEIO DIVIDIDO: O CLIENTE NÃO DEVOLVE OS JOGOS PRO DOCUMENTO ───────────
     * Depois que os jogos saem do doc (`_semPesados`), o objeto em MEMÓRIA continua tendo
     * eles — a rede do ouvinte enxerta pra tela não pintar chave vazia. Se este save
     * mandasse o objeto inteiro, os jogos VOLTAVAM pro documento: o teto voltava junto e,
     * pior, passava a existir duas cópias divergindo (a do doc e a da subcoleção).
     * ⇒ Grava só a CONFIG. Os jogos não são tocados aqui por ninguém: quem escreve jogo é
     * a CF, e a regra nega escrita do cliente na subcoleção.
     * ⭐ E as RODADAS continuam indo (só sem os jogos dentro): nome de grupo, horário e o
     * resto da config de rodada são editados por aqui e não podem se perder.
     * ⛔ `participants`/`history` só saem se estiverem NO MARCADOR — `dividir` extrai os
     * três por natureza, e gravar a config crua dele zeraria o elenco. */
    var _fora = Array.isArray(cleanData._semPesados) ? cleanData._semPesados : null;
    if (_fora && _fora.length && window._tSplit && typeof window._tSplit.dividir === 'function') {
      try {
        /* ⭐ PEDE SÓ O QUE O MARCADOR DIZ (2.0.124). Antes `dividir` extraía TUDO e quem grava
         * tinha que lembrar de devolver o que não foi pedido — devolução que já esqueceu uma
         * parte quatro vezes aqui. Passando a lista, o que não foi pedido nunca sai: não há o
         * que devolver, logo não há o que esquecer. */
        var _p = window._tSplit.dividir(JSON.parse(JSON.stringify(cleanData)), _fora);
        if (_p && _p.config) {
          /* ⛔ DERIVA DE `PESADOS`, não de lista escrita à mão. `dividir` extrai TODOS os
           * campos pesados por natureza; quem não está no marcador tem que VOLTAR pro
           * documento, senão a gravação o zera. Escrever a lista aqui à mão já custou três
           * incidentes num dia — e no dia em que um campo novo entrar em PESADOS, este
           * ponto esqueceria dele em silêncio. */
          /* ⛔ 2.1.42 — `S` NÃO EXISTE NESTE ESCOPO, e foi isto que quebrou a criação.
           * `var S = window._tSplit` é declarado na LINHA 2252, dentro de OUTRA função.
           * Aqui dava `ReferenceError: S is not defined` — dentro do try, e o catch abaixo
           * RELANÇA ⇒ a gravação inteira morria. Como este ramo só roda em torneio com
           * `_semPesados`, ninguém viu enquanto torneio novo nascia inteiro; no dia em que
           * ele passou a nascer DIVIDIDO (2.1.32), toda criação passou a falhar. Sintoma
           * na mão do dono, minutos depois de publicar: _"criei o torneio mas não consegui
           * salvar 8 placeholders"_ — e o doc não chegava ao banco.
           * ⭐ ACHADO NO SENTRY, não por leitura: `ReferenceError: S is not defined`, 6×,
           * às 15:20 UTC de 28/ago — 14 minutos depois do deploy da 2.1.32. A reversão
           * (2.1.33) foi feita às cegas e escreveu "a causa não está diagnosticada". Era
           * uma letra. [[feedback_measure_dont_declare_fixed]] */
          var _S = (typeof window !== 'undefined') ? window._tSplit : null;
          ((_S && _S.PESADOS) || ['participants', 'history']).forEach(function (k) {
            if (_fora.indexOf(k) === -1 && cleanData[k] !== undefined) _p.config[k] = cleanData[k];
          });
          _p.config._semPesados = _fora;
          // quantos jogos moram fora — ver a nota em _gravaTorneio (CF): sem o número,
          // "sem jogo no doc" é ambíguo entre "não sorteou" e "não carregou ainda".
          if (_fora.indexOf('matches') !== -1) _p.config._nJogos = (_p.matches || []).length;
          /* ⭐ QUANTOS GRUPOS moram fora — gêmeo do `_nJogos`, e pelo mesmo motivo: sem o número,
           * "o documento não tem grupo" é ambíguo entre torneio que ainda não sorteou e torneio
           * dividido cujos grupos a tela ainda não buscou. Os dois pintam igual — vazio — e só um
           * deles é honesto. Confundir os dois é apagar a chave de todo mundo. */
          if (_fora.indexOf('grupos') !== -1) _p.config._nGrupos = (_p.grupos || []).length;
          /* ⭐ QUANTOS de CADA parte moram fora. Antes eram dois campos soltos (`_nJogos`,
           * `_nGrupos`) e a conta do que falta só perguntava por eles — `participants` ficava de
           * fora, e um cache quente com os jogos fazia o app concluir "não falta nada" e NUNCA
           * buscar o elenco. Foi o "0 INSCRITOS" no PWA do dono.
           * Agora deriva da lista: parte nova entra no contador sem ninguém lembrar deste ponto.
           * ⚠️ `_nJogos`/`_nGrupos` continuam sendo gravados — documento já no ar é lido por app
           * já instalado, e tirar o campo quebraria quem ainda não atualizou. */
          _p.config._nPartes = _fora.reduce(function (acc, nome) {
            acc[nome] = ((_p[nome] || []).length); return acc;
          }, {});
          cleanData = _p.config;
        }
      } catch (_eD) {
        // ⛔ Falhar aqui e gravar o objeto INTEIRO desfaria a divisão em silêncio.
        // Melhor não gravar: a pessoa tenta de novo e o dado fica como está.
        if (window._error) window._error('[fase2] não consegui dividir pra gravar ' + docId, _eD);
        throw _eD;
      }
    }
    await this.db.collection('tournaments').doc(docId).set(cleanData, { merge: true });
    // v1.7.98: aqui havia a escrita dupla no espelho (`_mirrorRoster`). Saiu — o cliente
    // NÃO tem permissão nessa subcoleção e nunca teve; quem espelha é a CF. Ver a nota
    // longa onde a função morava.
  },

  // ── ESPELHO DO ROSTER: SAIU DO CLIENTE, VIVE NA CF (v1.7.98) ───────────────────────
  // Aqui morava `_mirrorRoster` (~100 linhas) + `_rosterMirrorCache`, que espelhavam o
  // roster em `tournaments/{id}/participants/{uid}` a cada save.
  //
  // MEDIDO: **não existe regra nenhuma pra essa subcoleção** no `firestore.rules`
  // (`grep -c 'match /participants'` = 0 — há `results` e `letzplayScans`, essa não), e o
  // Firestore NEGA por omissão. Ou seja o espelho **nunca funcionou a partir do cliente**,
  // desde que nasceu na 1.7.29: toda escrita voltava `permission-denied`. Os docs que
  // existem no banco vieram da **CF** (Admin SDK, que passa por cima das regras) e dos
  // backfills manuais. Pior: como o `try/catch` não pega rejeição de promessa, cada
  // tentativa virava *unhandled rejection* — era a issue nº1 do Sentry (57 eventos / 24
  // usuários), que a 1.7.97 calou pondo `.catch()` num código que já era morto.
  //
  // ⚠️ NÃO abrir a regra pra ressuscitar isto. Cânone do dono: **tudo roda na CF, o
  // cliente apenas DISPARA** ([[feedback_draw_is_cf_only]], [[project_canon_runs_on_server]]).
  // Quem espelha é `enrollParticipant` (functions/index.js), no MESMO ponto em que grava a
  // inscrição — que é o evento pelo qual a rede foi criada (o sumiço do Gersom).
  //
  // ⏳ COBERTURA HOJE, dita sem maquiagem: a CF espelha INSCRIÇÃO (enrolled/waitlisted). Os
  // MOVIMENTOS de roster (W.O., promoção da fila, saída) ainda não são espelhados por
  // ninguém — o W.O. roda por transação no cliente (`AppStore.mutate`), não por CF. Fechar
  // isso é levar esses fluxos pra CF, não reabrir a escrita do cliente.

  // ── BLINDAGEM DE CONCORRÊNCIA (project_concurrency_safe_saves) ──────────────
  // Primitivo transacional GENÉRICO para todo read-modify-write de alto risco.
  // Substitui o anti-padrão "mutar t local + saveTournament(merge doc inteiro)"
  // (propenso a lost-update: 2 caminhos/usuários leem, cada um grava tudo, o
  // último sobrescreve o outro com valores velhos).
  //
  // Como funciona / porque é seguro:
  //  1. runTransaction lê o doc FRESCO dentro da transação.
  //  2. `mutatorFn(freshData)` aplica a mutação NO estado fresco (in place).
  //  3. Grava o doc inteiro fresco+mutado via txn.set (SEM merge). Dentro de uma
  //     transação isso é clobber-free: se outro cliente commitou entre a leitura
  //     e o commit, o Firestore ABORTA e RE-EXECUTA a transação — re-lê o estado
  //     JÁ com a mudança do outro e re-aplica a nossa por cima. Nenhum write se perde.
  //
  // mutatorFn(data): muta `data` in place. Retorne `false` pra ABORTAR sem gravar
  // (ex.: pré-condição falhou). Qualquer outro retorno grava. Campos denormalizados
  // (memberEmails/memberUids/adminEmails/adminUids/nextDrawAt) são recomputados
  // aqui pra manter paridade com saveTournament.
  //
  // Retorna { aborted:boolean, data:object } — data = estado autoritativo pós-commit
  // (ou o lido, se abortou), pra o chamador sincronizar o AppStore local.
  // ── PRESENÇA POR CAMPO (v1.3.157) — a correção do "presença pula/desmarca em rajada" ──────
  // MEDIDO no Firestore REAL (doc temporário, 25 marcações):
  //   • 25 transações que gravam o DOC INTEIRO, concorrentes .......... 23/25 (PERDE)
  //   • idem + CF gravando o doc inteiro junto ........................ 23/25 (PERDE)
  //   • 25 updates POR CAMPO, concorrentes ........................... 25/25 ✅
  //   • idem + CF gravando o doc inteiro junto ....................... 25/25 ✅
  // Causa: marcar UMA presença reescrevia o TORNEIO INTEIRO dentro de uma transação. Sob
  // contenção elas se atropelam, algumas esgotam os retries e FALHAM — a marca já estava na tela
  // (otimista) e o snapshot seguinte a removia. Update por CAMPO não colide: o Firestore funde no
  // nível do campo, sem read-modify-write. Ver [[project_concurrency_safe_saves]].
  // `sets`/`dels` = arrays de {map, key}. Ex.: sets [{map:'checkedIn', key:'uid1'}].
  async setPresenceFields(tournamentId, sets, dels) {
    /* ── AGORA QUEM ESCREVE É A CF; O CLIENTE DISPARA (2.0.122) ──────────────────
     * Ordem do dono: _"tudo em CF apenas disparado pelo cliente"_.
     * ⛔ O motivo não é estilo: presença é um campo que PRECISA sair do documento (mapa
     * uid→instante, linear no número de pessoas — 4,1 KB no Confra e crescendo), e o
     * cliente não tem permissão de escrever subcoleção. Enquanto ele escrevesse aqui, o
     * campo não podia sair. [[project_dividir_exige_todo_escritor_ciente]]
     * ⭐ E NÃO SE PERDE o que foi medido na 1.7.x: a CF continua fazendo update por
     * CAMPO (`checkedIn.<uid>`), sem read-modify-write e sem transação no torneio —
     * marcar UMA presença nunca volta a reescrever o torneio inteiro. Quando o campo
     * estiver na subcoleção, cada marca vira UM documento: contenção zero.
     * A forma de `sets`/`dels` não mudou: [{map, key, value}]. */
    var ops = [];
    (sets || []).forEach(function (o) { if (o && o.map && o.key) ops.push({ parte: o.map, chave: String(o.key), valor: (o.value === undefined ? true : o.value) }); });
    (dels || []).forEach(function (o) { if (o && o.map && o.key) ops.push({ parte: o.map, chave: String(o.key), valor: null }); });
    if (!ops.length) return true;
    await this._callFn('aplicarNoTorneio', { tournamentId: String(tournamentId), ops: ops });
    return true;
  },


  async mutateTournament(tournamentId, mutatorFn, options) {
    if (!this.ensureDb()) throw new Error('Firestore not initialized');
    var ref = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    var _txOut = await this.db.runTransaction(async function (transaction) {
      var doc = await transaction.get(ref);
      if (!doc.exists) throw new Error('Tournament not found: ' + tournamentId);
      var data = doc.data();
      // Rei/Rainha: o doc fresco traz grupos só com matchIds. Hidrata group.matches
      // como refs de round.matches ANTES do mutator (W.O./substituição leem g.matches).
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(data); } catch (_hmErr) {}
      // v1.7.28 — MESMA DOUTRINA DENTRO DA TRANSAÇÃO. Ela é à prova de CONCORRÊNCIA
      // (lê fresco, re-executa se alguém commitou no meio), mas nada olha o que o próprio
      // MUTATOR faz. É por aqui que passam W.O., substituição e formação de grupo — tudo
      // o que roda com o torneio já sorteado. Um mutator que derrube alguém por engano
      // sumiria com a pessoa exatamente como no save solto (v1.7.26).
      // Aqui a comparação é EXATA e sem corrida: `_antes` e o resultado saem da MESMA
      // leitura transacional. Quem remove de propósito declara `allowRosterRemoval` no
      // options — os mesmos termos do saveTournament, pra não haver duas regras.
      var _uidsTx = (typeof window !== 'undefined' && typeof window._participantUids === 'function')
        ? window._participantUids : function (p) { return (p && p.uid) ? [p.uid] : []; };
      var _setDe = function (arr) {
        var o = {};
        (Array.isArray(arr) ? arr : []).forEach(function (p) {
          if (p && typeof p === 'object') _uidsTx(p).forEach(function (u) { if (u) o[u] = 1; });
        });
        return o;
      };
      var _antesArr = { participants: Array.isArray(data.participants) ? data.participants.slice() : [],
                        standbyParticipants: Array.isArray(data.standbyParticipants) ? data.standbyParticipants.slice() : [],
                        waitlist: Array.isArray(data.waitlist) ? data.waitlist.slice() : [] };
      // v1.7.91 — assinatura da ESCALAÇÃO antes do mutator. A transação não precisa se
      // DEFENDER de save atrasado (ela lê fresco), mas precisa DEIXAR O RASTRO: é por
      // aqui que passam W.O., substituição e formação de grupo, e sem carimbo a cópia
      // velha que gravasse depois seria lida como "primeira troca da vida" e venceria.
      // Foi exatamente assim que a substituição da Denise → Carol foi desfeita sozinha.
      var _sigRosterAntes = self._rosterSigMap(data);

      var out = mutatorFn(data);
      if (out === false) return { aborted: true, data: data };
      // Carimba o que o mutator trocou (0 trocas = save comum, nada é escrito).
      self._stampRosterChanges(data, _sigRosterAntes, Date.now());
      // ── RESTAURAÇÃO PÓS-MUTATOR — a regra é NÃO SUMIR, não "não sair" ─────────
      // ⚠️ A primeira versão disto exigia que a pessoa continuasse no ELENCO, e teria
      // QUEBRADO O W.O. no meio do torneio: o W.O. tira do elenco e põe na FILA (v1.6.88).
      // O movimento elenco↔fila é legítimo nos dois sentidos — promoção sobe, W.O. desce.
      // O invariante certo é mais simples e não pode quebrar movimento nenhum:
      // ninguém pode sumir DOS DOIS ao mesmo tempo. Quem estava em alguma das listas
      // antes da mutação tem que continuar em ALGUMA delas depois; onde exatamente é
      // assunto do mutator, não meu.
      if (!(options && options.allowRosterRemoval)) {
        try {
          var _emAlgumLugar = function (d) {
            var o = {};
            ['participants', 'standbyParticipants', 'waitlist'].forEach(function (c) {
              (Array.isArray(d[c]) ? d[c] : []).forEach(function (p) {
                if (p && typeof p === 'object') _uidsTx(p).forEach(function (u) { if (u) o[u] = 1; });
              });
            });
            return o;
          };
          var _depois = _emAlgumLugar(data);
          var _voltaram = [];
          ['participants', 'standbyParticipants', 'waitlist'].forEach(function (campo) {
            _antesArr[campo].forEach(function (p) {
              var us = _uidsTx(p).filter(Boolean);
              if (!us.length) return;                        // fictício: sem identidade estável
              if (us.some(function (u) { return _depois[u]; })) return;   // está em ALGUMA lista
              if (!Array.isArray(data[campo])) data[campo] = [];
              data[campo].push(p);                           // volta pra lista de onde saiu
              us.forEach(function (u) { _depois[u] = 1; });
              _voltaram.push(us[0] + ' (' + campo + ')');
            });
          });
          if (_voltaram.length) {
            if (!Array.isArray(data.history)) data.history = [];
            data.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica (transacao): ' + _voltaram.length +
                ' pessoa(s) sumiram de TODAS as listas na mutacao e foram restauradas (' + _voltaram.join(', ') + ').' });
            if (window._warn) window._warn('[mutateTournament] LISTA PROTEGIDA: ' + _voltaram.join(', '));
            try { if (typeof window._captureException === 'function') window._captureException(new Error('tx roster vanish blocked: ' + _voltaram.join(', '))); } catch (_se) {}
          }
        } catch (_txgErr) { /* o guard nunca derruba a transação */ }
      }
      // Recomputa denormalizados a partir do estado FINAL (mesmos helpers do save).
      // NUNCA ENCOLHE (union com o valor já no doc fresco) — mesma blindagem do
      // saveTournament: um uid/email que só existe no denormalizado (co-host por
      // path que não popula participants) não pode sumir e derrubar o listener
      // `array-contains` de quem depende dele. Ver saveTournament (v1.8.96/1.9.84).
      // SANDBOX: _mergeMemberUids SUBSTITUI (não une) — ver saveTournament/persist-core.
      data.adminEmails  = self._computeAdminEmails(data);
      data.adminUids    = self._computeAdminUids(data);
      data.memberUids   = window._mergeMemberUids(data, data.memberUids, self._computeMemberUids(data));
      try {
        if (typeof window !== 'undefined' && typeof window._nextOwedDrawMs === 'function') {
          var owed = window._nextOwedDrawMs(data);
          if (typeof owed === 'number') data.nextDrawAt = owed;
          else delete data.nextDrawAt;
        }
      } catch (_ndErr) { /* otimização; nunca derruba a transação */ }
      var clean = self._cleanUndefined(data);
      self._foldMonarchGroups(clean); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
      // v4.5.85 (ITEM 3 · Fase 4): PERSISTE cópia sanitizada (sem nome pra quem tem uid),
      // mas DEVOLVE `clean` COM nome pro caller sincronizar o AppStore local (display em
      // sessão intacto — o nome vivo já bate; só o Firestore fica só-uid).
      var _persist = clean;
      if (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function') {
        var _stripped = {};
        if (Array.isArray(clean.participants)) _stripped.participants = window._stripStoredNamesForUidEntries(clean.participants);
        if (Array.isArray(clean.standbyParticipants)) _stripped.standbyParticipants = window._stripStoredNamesForUidEntries(clean.standbyParticipants);
        if (Array.isArray(clean.coHosts)) _stripped.coHosts = window._stripStoredNamesForUidEntries(clean.coHosts);
        if (Array.isArray(clean.waitlist)) _stripped.waitlist = window._stripStoredNamesForUidEntries(clean.waitlist);
        if (Object.keys(_stripped).length) _persist = Object.assign({}, clean, _stripped);
      }
      /* ⛔ TORNEIO DIVIDIDO: ESTA PORTA NÃO DEVOLVE PARTE PESADA PRO DOCUMENTO (2.1.67).
       * `saveTournament` já fazia isso desde a Fase 2; esta aqui, não — e o estrago foi
       * MEDIDO no doc do Confra em 31/ago: `_semPesados` listava `matches`, e mesmo assim o
       * documento tinha 1 jogo em `rounds[0].matches` e 2 entradas em `participants`. Vieram
       * daqui: o mutator do W.O. empurra o marcador em `rounds[i].matches`, e o `set` abaixo
       * gravava tudo cru. Um único registro solto era o bastante pra o app concluir que já
       * tinha os 115 e nunca buscar o resto — três telas zeradas seguidas.
       *
       * ⚠️ E AQUI NÃO SE RECALCULA `_nPartes`/`_nJogos`, ao contrário do `saveTournament`.
       * Lá o objeto em memória está COMPLETO, então recontar é correto. Aqui `data` saiu do
       * documento MAGRO: recontar gravaria "1 jogo, 2 inscritos" como verdade e destruiria o
       * marcador — que é justamente o que a conta do cliente usa pra saber que falta coisa.
       * Só se REMOVE o que não devia estar no documento; os contadores ficam como estavam. */
      var _foraM = Array.isArray(_persist._semPesados) ? _persist._semPesados : null;
      if (_foraM && _foraM.length && typeof window !== 'undefined' && window._tSplit && typeof window._tSplit.dividir === 'function') {
        try {
          var _pM = window._tSplit.dividir(JSON.parse(JSON.stringify(_persist)), _foraM);
          if (_pM && _pM.config) {
            /* devolve pro doc o que é pesado por natureza mas NÃO está no marcador —
             * mesma razão do saveTournament: sem isso a gravação zeraria esses campos. */
            var _SM = window._tSplit;
            ((_SM && _SM.PESADOS) || ['participants', 'history']).forEach(function (k) {
              if (_foraM.indexOf(k) === -1 && _persist[k] !== undefined) _pM.config[k] = _persist[k];
            });
            _pM.config._semPesados = _foraM;
            if (_persist._nPartes !== undefined) _pM.config._nPartes = _persist._nPartes;
            if (_persist._nJogos !== undefined) _pM.config._nJogos = _persist._nJogos;
            if (_persist._nGrupos !== undefined) _pM.config._nGrupos = _persist._nGrupos;
            _persist = _pM.config;
          }
        } catch (_eDM) {
          /* ⛔ Falhar aqui e gravar o objeto inteiro desfaria a divisão em silêncio — que é
           * exatamente o defeito que este bloco existe pra impedir. Melhor não gravar. */
          if (window._error) window._error('[fase2] não consegui dividir pra mutar ' + tournamentId, _eDM);
          throw _eDM;
        }
      }
      transaction.set(ref, _persist); // set (sem merge) DENTRO da txn = clobber-free
      // Devolve o estado autoritativo HIDRATADO (group.matches como refs) pro caller
      // sincronizar o AppStore sem depender de um render pra reconstruir os grupos.
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(clean); } catch (_hmErr2) {}
      return { aborted: false, data: clean };
    });
    // v1.7.29: escrita dupla também aqui — a INSCRIÇÃO passa por esta transação, então
    // v1.7.98: o espelho saiu daqui junto com o do `saveTournament` — mesma razão (regra
    // inexistente, escrita sempre negada). A verdade continua sendo o array no doc.
    return _txOut;
  },

  // ── PLACAR POR JOGO EM DOC PRÓPRIO (project_match_result_docs, linha 4.1) ──────
  // Cada JOGO tem seu resultado/consenso num doc próprio:
  //   tournaments/{tId}/results/{matchId}
  // Por quê: escrever o placar do jogo A e o do jogo B são docs DIFERENTES →
  // NUNCA disputam entre si (isolamento, escala — o modelo das presenças/places).
  // A trava contra corrida DENTRO de um mesmo jogo (dois participantes/org lançando
  // ao mesmo tempo) é mantida pela TRANSAÇÃO neste doc: runTransaction lê fresco,
  // aplica, grava; conflito → aborta+re-executa → nenhum write se perde. Dividir +
  // manter a segurança, exatamente como o dono pediu.
  //
  // O doc guarda SÓ o estado MUTÁVEL do resultado (scoreP1/P2, winner, draw, sets,
  // setsWonP1/P2, totalGamesP1/P2, fixedSet, resultAt, startedAt, pendingResult,
  // wo, woAbsentSide, ...). A ESTRUTURA da chave (p1/p2, nextMatchId, fase) fica no
  // doc do torneio — a hidratação de leitura mescla o resultado no match p/ render.
  //
  // mutatorFn(result): muta `result` in place. Retorne `false` pra ABORTAR sem gravar.
  // Retorna { aborted, data } — data = estado autoritativo pós-commit.
  async mutateMatchResult(tournamentId, matchId, mutatorFn) {
    if (!this.ensureDb()) throw new Error('Firestore not initialized');
    if (matchId == null || matchId === '') throw new Error('mutateMatchResult: matchId vazio');
    var ref = this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').doc(String(matchId));
    var self = this;
    return this.db.runTransaction(async function (transaction) {
      var doc = await transaction.get(ref);
      var data = doc.exists ? doc.data() : { matchId: String(matchId), tournamentId: String(tournamentId) };
      var out = mutatorFn(data);
      if (out === false) return { aborted: true, data: data };
      // ⚠️ v1.7.91 — AQUI MORAVA UM BLOCO COLADO POR ENGANO, e ele quebrava esta função
      // INTEIRA. A 1.7.28 (`c1c041e5`) levou o guard de elenco pra DENTRO da transação e
      // uma cópia dele caiu também aqui, num escopo onde `options`, `_setDe`, `_antesArr`
      // e `_uidsTx` NÃO EXISTEM (`mutateMatchResult(tournamentId, matchId, mutatorFn)` não
      // tem `options`). Resultado MEDIDO chamando a função real: `ReferenceError: options
      // is not defined` na PRIMEIRA linha do bloco, antes de qualquer `try` — ou seja a
      // transação estourava e NADA era gravado, em 100% das chamadas.
      //
      // O bloco também não fazia sentido nenhum aqui: este doc é o RESULTADO de UM jogo
      // (placar/consenso, ver o comentário do topo) — não tem `participants`,
      // `standbyParticipants` nem `waitlist` pra restaurar. Elenco é assunto do doc do
      // torneio, e lá o guard continua onde deve, em `mutateTournament`.
      //
      // Não estourou em produção porque `commitMatchResult` (store.js) ainda não tem
      // chamador — o doc por jogo está atrás do "incremento 3" de
      // [[project_match_result_docs]]. Ficaria armado pro dia em que fosse ligado.
      data.matchId = String(matchId);
      data.updatedAt = new Date().toISOString();
      var clean = self._cleanUndefined(data);
      transaction.set(ref, clean); // set (sem merge) DENTRO da txn = clobber-free
      return { aborted: false, data: clean };
    });
  },

  // Lê TODOS os docs de resultado de um torneio (subcoleção results). Retorna um
  // mapa { [matchId]: resultData } pra hidratação de leitura (merge nos matches).
  async loadMatchResults(tournamentId) {
    if (!this.ensureDb()) return {};
    var snap = await this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').get();
    var out = {};
    snap.forEach(function (d) { out[d.id] = d.data(); });
    return out;
  },

  // ── FASE B: leitura ISOLADA do subdoc de resultado (project_match_result_docs) ──
  // Lê UM doc de resultado (tournaments/{tId}/results/{matchId}) sem carregar o
  // torneio inteiro. Retorna o dado do jogo ou null.
  async loadMatchResult(tournamentId, matchId) {
    if (!this.ensureDb()) return null;
    if (matchId == null || matchId === '') return null;
    var d = await this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').doc(String(matchId)).get();
    return d.exists ? d.data() : null;
  },

  // Lê TODOS os jogos de um usuário ACROSS todos os torneios numa ÚNICA query
  // collectionGroup (`results` where playerUids array-contains uid), sem carregar
  // NENHUM doc de torneio — o benefício de isolamento da leitura da linha 4.1.
  // Cada item traz `tournamentId` (campo do subdoc) + `matchId` + resultado.
  // Requer o índice collectionGroup `results` (playerUids CONTAINS, updatedAt DESC).
  async loadMyMatchResults(uid, opts) {
    if (!this.ensureDb() || !uid) return [];
    var q = this.db.collectionGroup('results').where('playerUids', 'array-contains', uid);
    try { q = q.orderBy('updatedAt', 'desc'); } catch (e) {}
    if (opts && opts.limit) q = q.limit(opts.limit);
    var snap = await q.get();
    var out = [];
    snap.forEach(function (d) {
      var data = d.data() || {};
      // tournamentId costuma vir no subdoc (mirror/seed); fallback = doc pai.
      if (!data.tournamentId && d.ref && d.ref.parent && d.ref.parent.parent) {
        data.tournamentId = d.ref.parent.parent.id;
      }
      out.push(data);
    });
    return out;
  },

  // Atomic enrollment — uses Firestore transaction to prevent race conditions
  // where concurrent enrollments overwrite each other's participants array
  // Fala o protocolo callable NA MÃO (POST {data} → {result}|{error}), igual
  // window._callDrawRound. NÃO usa httpsCallable de propósito: com o usuário
  // LOGADO o SDK compat tenta montar o token FCM antes de enviar e a promise
  // REJEITA sem a requisição sair ("Messaging: …") — a CF nem é tocada. Ver
  // js/views/tournaments-draw.js (_callDrawRound) e v1.3.86.
  async _callFn(name, payload) {
    var fb = window.firebase;
    var user = fb && fb.auth && fb.auth().currentUser;
    if (!user) throw Object.assign(new Error('login necessário'), { code: 'functions/unauthenticated' });
    var pid = '';
    try { pid = fb.app().options.projectId; } catch (e) {}
    if (!pid) throw Object.assign(new Error('App não inicializado'), { code: 'functions/internal' });
    var url = 'https://us-central1-' + pid + '.cloudfunctions.net/' + name;
    var tok = await user.getIdToken();
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify({ data: payload })
    });
    var j = await r.json().catch(function () { return {}; });
    if (j && j.error) {
      var st = String(j.error.status || '').toLowerCase().replace(/_/g, '-');
      throw Object.assign(new Error(j.error.message || 'Falha'), { code: 'functions/' + (st || 'internal') });
    }
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'functions/internal' });
    return (j && j.result) || {};
  },

  // Inscrição via Cloud Function (Admin SDK, servidor) com FALLBACK pra transação
  // do cliente. A CF não passa pela fila IndexedDB quebrada do SDK 10.8.1 (bug
  // fatal no iOS Safari que fazia a inscrição falhar) nem pelas rules. O fallback
  // preserva o comportamento anterior se a CF estiver fora — e é IDEMPOTENTE:
  // se a CF gravou mas a resposta se perdeu, a transação relê e o "já inscrito"
  // pega (sem duplicar). Ver [[project_firestore_assertion_bug]].
  async enrollParticipant(tournamentId, participantObj, extraUpdates) {
    try {
      return await this._callFn('enrollParticipant', {
        tournamentId: String(tournamentId),
        participantObj: participantObj,
        extraUpdates: extraUpdates || null
      });
    } catch (e) {
      if (window._warn) window._warn('[enrollParticipant] CF falhou (' + ((e && e.code) || e) + ') — fallback pra transação cliente');
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'enrollParticipant-cf-fallback', tournamentId: String(tournamentId), code: e && e.code });
      }
      return this._enrollParticipantTx(tournamentId, participantObj, extraUpdates);
    }
  },

  // v1.8.40: SAIR DA LISTA DE ESPERA por transação de CAMPOS (standby/waitlist/memberUids
  // recomputado do doc FRESCO). Antes o _leaveStandby gravava o documento INTEIRO via
  // saveTournament a partir da cópia em memória — a mesma classe do bug da Mariana (um
  // campo divergente derruba a escrita toda). As 3 chaves estão na allowlist de
  // isEnrollmentOnlyDiff() das rules, então o participante consegue gravar.
  async leaveStandby(tournamentId, user) {
    if (!this.db) throw new Error('Firestore not initialized');
    var self = this;
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    return this.db.runTransaction(async function (tx) {
      var doc = await tx.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var match = function (p) {
        if (!p) return false;
        if (typeof window !== 'undefined' && typeof window._userMatchesParticipant === 'function') {
          return window._userMatchesParticipant(user, p);
        }
        if (typeof p === 'string') return p === user.email || p === user.displayName;
        return !!(p.uid && user.uid && p.uid === user.uid);
      };
      var sb = Array.isArray(data.standbyParticipants) ? data.standbyParticipants.filter(function (p) { return !match(p); }) : [];
      var wl = Array.isArray(data.waitlist) ? data.waitlist.filter(function (p) { return !match(p); }) : [];
      var changed = (Array.isArray(data.standbyParticipants) && sb.length !== data.standbyParticipants.length) ||
                    (Array.isArray(data.waitlist) && wl.length !== data.waitlist.length);
      if (!changed) return { removed: false };
      var next = Object.assign({}, data, { standbyParticipants: sb, waitlist: wl });
      tx.update(docRef, { standbyParticipants: sb, waitlist: wl, memberUids: self._computeMemberUids(next) });
      return { removed: true, standbyParticipants: sb, waitlist: wl };
    });
  },

  async _enrollParticipantTx(tournamentId, participantObj, extraUpdates) {
    if (!this.db) throw new Error('Firestore not initialized');
    // Guard: rejeitar participante completamente sem identificador.
    // Evita objetos fantasmas {name:null,email:null,displayName:null} causados
    // por race condition entre login e inscrição (AppStore.currentUser ainda
    // não carregado quando _doEnrollCurrentUser rodou).
    var _hasId = !!(participantObj && (
      participantObj.uid || participantObj.email ||
      participantObj.displayName || participantObj.name || participantObj.phone
    ));
    if (!_hasId) throw new Error('enrollParticipant: participantObj sem identificador válido');
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    return this.db.runTransaction(async function(transaction) {
      var doc = await transaction.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var participants = Array.isArray(data.participants) ? data.participants : (data.participants ? Object.values(data.participants) : []);

      // Check if already enrolled (by email or displayName)
      var pEmail = participantObj.email || '';
      var pName = participantObj.displayName || participantObj.name || '';
      // Block enrollment if tournament is closed, active (draw done), or finished
      // Liga with open enrollment is the only exception
      var _isLiga = data.format && (data.format === 'Liga' || data.format === 'Ranking' || data.format === 'liga' || data.format === 'ranking');
      // v2.4.17: Liga é inscrição-aberta por DEFAULT — só fecha se explicitamente
      // false. Antes era truthy (data.ligaOpenEnrollment), então docs com o campo
      // undefined/null bloqueavam a inscrição assim que o sorteio acontecia, MESMO
      // com os cards/config mostrando "aberta" (que usam !== false). Bug da Vivi
      // Hirata: organizador não conseguia inscrever após o 1º confronto. Alinhado
      // com enrollCurrentUser, cards e form (todos !== false).
      // v1.8.40: `status !== 'finished'` espelha o canônico (waitlist-core._enrollmentOpenState
      // e functions/enroll-core.enrollmentOpen) — Liga ENCERRADA não aceita inscrição.
      var _ligaOpen = _isLiga && data.ligaOpenEnrollment !== false && data.status !== 'finished';
      var _sorteioRealizado = (Array.isArray(data.matches) && data.matches.length > 0) ||
                              (Array.isArray(data.rounds) && data.rounds.length > 0) ||
                              (Array.isArray(data.groups) && data.groups.length > 0);
      // Also check registration deadline
      var _deadlinePassed = data.registrationLimit && new Date(data.registrationLimit) < new Date();
      var _inscricoesAbertas = (data.status !== 'closed' && data.status !== 'finished' && !_sorteioRealizado && !_deadlinePassed) || _ligaOpen;
      if (!_inscricoesAbertas) {
        // Auto-close if deadline just passed (persist the status change)
        if (_deadlinePassed && data.status !== 'closed') {
          transaction.update(docRef, { status: 'closed' });
        }
        return { alreadyEnrolled: false, enrollmentClosed: true, participants: participants };
      }

      var pUid = participantObj.uid || '';
      function _memberMatches(m) {
        if (!m) return false;
        if (typeof m === 'string') {
          var s = m.trim();
          return (pEmail && s.toLowerCase() === pEmail.toLowerCase()) || (pName && s === pName);
        }
        if (pUid && m.uid && m.uid === pUid) return true;
        if (pEmail && m.email && m.email.toLowerCase() === pEmail.toLowerCase()) return true;
        if (pName && m.displayName && m.displayName === pName) return true;
        if (pName && m.name && m.name === pName) return true;
        return false;
      }
      var already = participants.some(function(p) {
        if (typeof p === 'string') {
          var parts = p.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean);
          return parts.some(_memberMatches);
        }
        if (_memberMatches(p)) return true;
        if (Array.isArray(p.participants) && p.participants.some(_memberMatches)) return true;
        // v3.0.x: IDENTIDADE POR SLOT (uid > nome > email). A dupla formada por aceite grava
        // p1Uid/p2Uid/p1Name/p2Name com displayName = só o p1 (ex.: "Kelly Barth", sem "/").
        // Sem checar os slots aqui (dentro da TRANSAÇÃO atômica), o p2 (ex.: Rodrigo) era visto
        // como NÃO-inscrito → inscrição em DOBRO no banco. Espelha store.js _userMatchesParticipant.
        if (pUid && ((p.p1Uid && p.p1Uid === pUid) || (p.p2Uid && p.p2Uid === pUid))) return true;
        if (pName && ((p.p1Name && p.p1Name === pName) || (p.p2Name && p.p2Name === pName))) return true;
        if (pEmail && ((p.p1Email && p.p1Email.toLowerCase() === pEmail.toLowerCase()) || (p.p2Email && p.p2Email.toLowerCase() === pEmail.toLowerCase()))) return true;
        // Fallback SÓ pra time em forma de STRING legada "A / B" (sem campos de slot) — '/' nunca
        // define dupla, mas pra string legada é a única forma de checar pertencimento.
        var label = p.displayName || p.name || '';
        if (label && label.indexOf(' / ') !== -1) {
          return label.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean).some(_memberMatches);
        }
        return false;
      });
      if (already) return { alreadyEnrolled: true, participants: participants };

      // v1.6.86 — FASE SORTEADA → LISTA DE ESPERA. Espelha functions/enroll-core.computeEnroll
      // e window._phaseDrawDone. Esta transação é o FALLBACK de quando a CF falha; sem o mesmo
      // ramo, o fallback recriaria exatamente o inscrito fantasma que a CF passou a evitar.
      // Vem antes do teto de vagas: a espera é o lugar de quem não tem vaga.
      if (_sorteioRealizado) {
        var _sbArr = Array.isArray(data.standbyParticipants) ? data.standbyParticipants : [];
        var _jaNaEspera = _sbArr.some(function(p) {
          if (typeof p === 'string') return _memberMatches(p);
          if (_memberMatches(p)) return true;
          return !!(pUid && ((p.p1Uid && p.p1Uid === pUid) || (p.p2Uid && p.p2Uid === pUid)));
        });
        if (_jaNaEspera) return { alreadyEnrolled: false, waitlisted: true, alreadyWaitlisted: true, participants: participants };
        var _sbNew = _sbArr.concat([self._cleanUndefined(participantObj)]);
        var _wlData = Object.assign({}, data, { standbyParticipants: _sbNew });
        var _sbPersist = (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function')
          ? window._stripStoredNamesForUidEntries(_sbNew) : _sbNew;
        var _wlUpdate = { standbyParticipants: _sbPersist, memberUids: self._computeMemberUids(_wlData) };
        if (extraUpdates) {
          Object.keys(extraUpdates).forEach(function(k) { _wlUpdate[k] = self._cleanUndefined(extraUpdates[k]); });
        }
        transaction.update(docRef, _wlUpdate);
        // v1.7.56: a ESPERA é o caso que mais precisa do espelho — é dela que some gente
        // (Gersom, Dėbora Castello). Vai com `_mirror` pro `.then()` espelhar após o commit.
        return { alreadyEnrolled: false, waitlisted: true, participants: participants, standbyParticipants: _sbNew,
                 _mirror: Object.assign({}, data, { standbyParticipants: _sbNew }) };
      }

      // v2.6.87: Limite com corrida — capacidade ATÔMICA. No modo 'cap' (não-sorteio)
      // com maxParticipants definido, REJEITA se já lotou ANTES de inserir. Como roda
      // dentro da transação, dois cliques simultâneos pra última vaga não passam ambos:
      // o segundo é re-executado pelo Firestore, re-lê participants já cheio e rejeita.
      // Quem clicou depois de lotar NUNCA é considerado inscrito.
      var _capMax = parseInt(data.maxParticipants, 10);
      var _isDrawMode = data.enrollmentLimitMode === 'draw';
      if (!_isDrawMode && !isNaN(_capMax) && _capMax > 0 && participants.length >= _capMax) {
        return { alreadyEnrolled: false, capacityFull: true, participants: participants };
      }

      participants.push(self._cleanUndefined(participantObj));

      var _enrollData = Object.assign({}, data, { participants: participants });
      // v4.5.85 (ITEM 3 · Fase 4): persiste array sanitizado (sem nome pra quem tem uid);
      // `participants` (com nome) segue no retorno pro caller sincronizar o AppStore local.
      var _persistParts = (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function')
        ? window._stripStoredNamesForUidEntries(participants) : participants;
      var updateData = {
        participants: _persistParts,
        memberUids:   self._computeMemberUids(_enrollData)   // v1.2.2: só uid
      };
      if (extraUpdates) {
        Object.keys(extraUpdates).forEach(function(k) {
          updateData[k] = self._cleanUndefined(extraUpdates[k]);
        });
      }

      // Auto-close check — v2.4.12: RESPEITA o toggle autoCloseOnFull.
      // Antes fechava sempre ao atingir maxParticipants ("always, no flag needed"),
      // mas o caminho do cliente (tournaments-enrollment.js) só fecha quando o flag
      // é verdadeiro. Inconsistência: desligar "Fechar quando lotar" não tinha efeito
      // no caminho real de inscrição. Agora os dois lados usam a mesma regra.
      // Modo Vagas-por-sorteio (enrollmentLimitMode='draw') nunca fecha sozinho.
      // v2.6.87: "Limite com corrida" sempre encerra ao lotar (a corrida é o modelo).
      // Modo Vagas-por-sorteio (draw) nunca fecha sozinho — encerra por prazo/organizador.
      var _maxP = parseInt(data.maxParticipants, 10);
      if (!_isDrawMode && !isNaN(_maxP) && _maxP > 0 && participants.length >= _maxP) {
        updateData.status = 'closed';
      }
      // v2.6.88: Vagas com sorteio — ao ATINGIR o máx., sinaliza (UMA vez) que as
      // próximas inscrições entram em lista de espera. waitlistNoticeSent garante 1
      // disparo só (mesmo com cliques simultâneos, a transação é serializada).
      var _reachedDraw = false;
      if (_isDrawMode && !isNaN(_maxP) && _maxP > 0 && participants.length >= _maxP && !data.waitlistNoticeSent) {
        updateData.waitlistNoticeSent = true;
        _reachedDraw = true;
      }

      transaction.update(docRef, updateData);
      return { alreadyEnrolled: false, participants: participants, autoCloseTriggered: !!updateData.status, reachedCapacityDraw: _reachedDraw,
               _mirror: Object.assign({}, data, { participants: participants }) };
    }).then(function (out) {
      // ESPELHO (v1.7.56): este caminho gravava por `transaction.update` e NUNCA chamava
      // ⏳ v1.7.98 — AQUI FICA O ÚNICO BURACO REAL, e ele é DECLARADO, não esquecido.
      // A 1.7.56 pôs o espelho neste ponto porque esta transação é o FALLBACK do cliente
      // (roda sempre que a CF falha — o bug do Firestore no iOS), e uma inscrição por
      // aqui não deixava rastro na subcoleção. Só que a escrita do cliente É NEGADA pela
      // regra (ela não existe), então o rastro nunca foi criado de verdade: o que havia
      // era a aparência de rede. Removido junto com o resto.
      // Consequência honesta: inscrição que cai no fallback fica SEM espelho. Fechar isso
      // é fazer este caminho passar pela CF (cânone: o cliente só dispara) — não reabrir a
      // escrita do cliente. Enquanto isso, a fonte da verdade segue sendo o array do doc,
      // que é o que toda tela lê.
      if (out) delete out._mirror;
      return out;
    });
  },

  // Atomic deenrollment — prevents race conditions where deenroll overwrites
  // concurrent enrollments by other users
  // v1.2.2: assinatura UID ONLY — userEmail/userDisplayName saíram porque a identidade é o
  // uid; parâmetro que ninguém lê é convite pra alguém "usar como fallback" de novo.
  async deenrollParticipant(tournamentId, userUid) {
    try {
      return await this._callFn('deenrollParticipant', {
        tournamentId: String(tournamentId),
        userUid: String(userUid || '')
      });
    } catch (e) {
      if (window._warn) window._warn('[deenrollParticipant] CF falhou (' + ((e && e.code) || e) + ') — fallback pra transação cliente');
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'deenrollParticipant-cf-fallback', tournamentId: String(tournamentId), code: e && e.code });
      }
      return this._deenrollParticipantTx(tournamentId, userUid);
    }
  },

  // Formar/desfazer DUPLA manual via Cloud Function (Admin SDK, concorrência-safe + replica
  // pro Sandbox). Thin wrappers: o chamador (_formDuplaByUids/_splitDupla) mantém a mutação
  // em memória pra UI imediata e, no CATCH, faz o saveTournament DIRETO como fallback (persiste
  // o t já mutado se a CF estiver fora). Ver pair-core.js / [[project_draw_client_to_cf_migration]].
  async formPair(tournamentId, opts) {
    return await this._callFn('formPair', {
      tournamentId: String(tournamentId),
      uid1: (opts && opts.uid1) || '', name1: (opts && opts.name1) || '',
      uid2: (opts && opts.uid2) || '', name2: (opts && opts.name2) || '',
      changeRule: !!(opts && opts.changeRule)
    });
  },
  // Responder convite de co-organização/transferência. CF-ONLY: o cliente não consegue
  // gravar (o aceite muda adminUids e a regra do participante não cobre) e a CF é quem
  // valida que o destinatário da transferência é quem aceita. Identidade só por uid.
  async respondHostInvite(tournamentId, inviteType, action) {
    return await this._callFn('respondHostInvite', {
      tournamentId: String(tournamentId),
      inviteType: String(inviteType || ''),
      action: String(action || '')
    });
  },
  async splitPair(tournamentId, opts) {
    return await this._callFn('splitPair', {
      tournamentId: String(tournamentId),
      id1: (opts && opts.id1) != null ? opts.id1 : '',
      id2: (opts && opts.id2) != null ? opts.id2 : ''
    });
  },
  // CF-only da DUPLA NA LISTA DE ESPERA: formar (funde _lateJoin + presença + integra na chave,
  // atômico) e desfazer. A CF (functions-autodraw) devolve `tournament` pro cliente refletir sem
  // reload. key1/key2 = uid||nome dos 2 avulsos; id1/id2 = identidade dos membros da dupla.
  async formLatePair(tournamentId, opts) {
    return await this._callFn('formLatePair', {
      tournamentId: String(tournamentId),
      key1: (opts && opts.key1) || '', key2: (opts && opts.key2) || ''
    });
  },
  async splitLatePair(tournamentId, opts) {
    return await this._callFn('splitLatePair', {
      tournamentId: String(tournamentId),
      id1: (opts && opts.id1) != null ? opts.id1 : '',
      id2: (opts && opts.id2) != null ? opts.id2 : ''
    });
  },

  async _deenrollParticipantTx(tournamentId, userUid) {
    if (!this.db) throw new Error('Firestore not initialized');
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    return this.db.runTransaction(async function(transaction) {
      var doc = await transaction.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var participants = Array.isArray(data.participants) ? data.participants : (data.participants ? Object.values(data.participants) : []);

      // v1.2.2: UID ONLY. Identidade de quem sai é o uid — e só. Os fallbacks por e-mail e
      // por NOME que moravam aqui eram rede de segurança pra writers que não gravavam uid;
      // o preço era casar por nome (homônimo-inseguro: dois "Maira" e sai a errada) e por
      // e-mail (que a pessoa troca). Quem chama esta função é SEMPRE alguém logado saindo
      // (botão "Desinscrever-se" e exclusão de conta) — logado tem uid, ponto. Inscrito sem
      // uid é guest informal, que não loga e é removido pelo organizador por outro caminho.
      // _participantUids cobre TODO slot onde uma pessoa existe: uid, p1Uid, p2Uid e
      // sub-participants[]. Remove a entrada inteira quando bate — dupla não joga com uma
      // pessoa só. Ver [[project_uid_primary_identity]] / [[project_orphan_uid_entries]].
      if (!userUid) throw new Error('deenrollParticipant: uid obrigatório (identidade é uid)');
      var _pUids = (typeof window !== 'undefined' && window._participantUids)
        ? window._participantUids
        : function (p) {
            var out = [];
            if (!p || typeof p !== 'object') return out;
            [p.uid, p.p1Uid, p.p2Uid].forEach(function (u) { if (u) out.push(u); });
            if (Array.isArray(p.participants)) p.participants.forEach(function (s) { if (s && s.uid) out.push(s.uid); });
            return out;
          };
      // v1.5.x — DUPLA NÃO SOME O PARCEIRO: quem sai de uma dupla a DESFAZ e o parceiro
      // fica SOLO ("sem dupla"). Espelha functions/enroll-core.computeDeenroll (CF é o
      // caminho primário; isto é o fallback). Iterar limpa DUPLICATAS (uid some de TODA
      // entrada) e não deixa slot com o uid do que saiu — senão re-inscrever vira no-op.
      var _partnerSolo = (typeof window !== 'undefined' && window._pairPartnerSolo)
        ? window._pairPartnerSolo
        : function (entry, n) {
            var g = function (s) { return entry['p' + n + s]; };
            var uid = g('Uid') || ''; var nome = String(g('Name') || '').trim();
            if (!uid) return nome || null;
            var o = { uid: uid, ligaActive: true };
            if (nome) { o.displayName = nome; o.name = nome; }
            if (g('Seq') != null) o.enrollSeq = g('Seq');
            if (g('Email')) o.email = g('Email');
            if (g('Photo')) o.photoURL = g('Photo');
            if (g('Gender')) o.gender = g('Gender');
            if (g('BirthDate')) o.birthDate = g('BirthDate');
            if (entry.category) o.category = entry.category;
            if (Array.isArray(entry.categories)) o.categories = entry.categories.slice();
            if (entry.categorySource) o.categorySource = entry.categorySource;
            return o;
          };
      var _changed = false;
      var newParticipants = [];
      participants.forEach(function (p) {
        if (!p || typeof p !== 'object') { newParticipants.push(p); return; } // string guest
        var isPair = !!((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name));
        if (isPair && (p.p1Uid === userUid || p.p2Uid === userUid)) {
          var keep = _partnerSolo(p, p.p1Uid === userUid ? 2 : 1);
          _changed = true;
          if (keep) newParticipants.push(keep);
          return;
        }
        if (_pUids(p).indexOf(userUid) !== -1) { _changed = true; return; }
        newParticipants.push(p);
      });

      if (!_changed) {
        return { notFound: true, participants: participants };
      }

      var _deenrollData = Object.assign({}, data, { participants: newParticipants });
      // v1.2.2: só memberUids. memberEmails NÃO é recomputado — quem decide quem é membro é
      // o uid (as rules leem memberUids; o e-mail só valia como fallback de torneio legado
      // sem memberUids, coisa que não existe mais). Recomputar aqui era, aliás, o ÚNICO ponto
      // que encolhia memberEmails — o saveTournament nunca encolhe, então os dois já viviam
      // divergentes. Ver [[project_uid_primary_identity]].
      transaction.update(docRef, {
        participants: newParticipants,
        memberUids:   self._computeMemberUids(_deenrollData)
      });
      return { notFound: false, participants: newParticipants };
    });
  },

  // Subcoleções que vivem SOB o torneio. Apagar o doc pai NÃO as apaga (Firestore não tem
  // delete recursivo) — quem esquece isso deixa dado vivo sem dono.
  _tournamentSubcollections: ['results', 'letzplayScans'],

  // Apaga TODOS os docs de uma subcoleção, em lotes de 400 (o teto do batch é 500).
  // Devolve quantos foram apagados. Best-effort: erro num lote não derruba o resto.
  async _deleteSubcollection(tournamentId, sub) {
    var col = this.db.collection('tournaments').doc(String(tournamentId)).collection(sub);
    var apagados = 0;
    for (var volta = 0; volta < 50; volta++) {           // teto de segurança (20 mil docs)
      var snap = await col.limit(400).get();
      if (snap.empty) break;
      var lote = this.db.batch();
      snap.forEach(function (d) { lote.delete(d.ref); });
      await lote.commit();
      apagados += snap.size;
      if (snap.size < 400) break;
    }
    return apagados;
  },

  // APAGAR UM TORNEIO É APAGAR TUDO QUE É DELE. Regra do dono (01/ago/2026, sobre o
  // sandbox): _"os dados do SB devem ficar apenas enquanto existe o SB. ao apagar o SB deve
  // apagar tudo relativo a ele para não persistir."_ Vale pra qualquer torneio.
  //
  // ISSO AQUI ERA UMA LINHA SÓ (`doc().delete()`) e por isso o banco tinha, medido em
  // 01/ago/2026, **211 documentos de placar dos quais só 60 eram de torneio vivo**: 151
  // órfãos, 85 deles de sandboxes já apagados. Órfão não é dado inerte — ele responde à
  // consulta `collectionGroup('results')` por uid e reaparece no histórico das pessoas.
  //
  // A ORDEM IMPORTA: as subcoleções PRIMEIRO, o doc do torneio DEPOIS. A regra do Firestore
  // pra `results` autoriza pelo torneio PAI (`parentT()`); com o pai já apagado o `get()`
  // devolve nada, `isAdminOf(null)` é falso e a limpeza toma permission-denied. Ou seja: uma
  // vez apagado o pai, os filhos ficam INALCANÇÁVEIS pelo cliente — é assim que os 151
  // órfãos nasceram e é por isso que não dá pra "limpar depois".
  async deleteTournament(tournamentId) {
    if (!this.db) return;
    var tId = String(tournamentId);
    for (var i = 0; i < this._tournamentSubcollections.length; i++) {
      var sub = this._tournamentSubcollections[i];
      try {
        var n = await this._deleteSubcollection(tId, sub);
        if (n && window._log) window._log('[delete torneio]', tId, '→', n, 'doc(s) de', sub);
      } catch (e) {
        // Não aborta o delete do torneio: é melhor o torneio sumir e sobrar subcoleção do
        // que o organizador clicar em Apagar e nada acontecer. Mas o erro é BARULHENTO.
        window._error('Erro ao limpar subcoleção ' + sub + ' de ' + tId + ':', e);
        if (typeof window._captureException === 'function') {
          window._captureException(e, { area: 'deleteTournament.sub', tournamentId: tId, sub: sub, code: e && e.code });
        }
      }
    }
    // ⛔ `discoveryFeed/{id}` NÃO se apaga daqui, e nunca deu: o índice é SERVER-AUTHORITATIVE.
    // `firestore.rules` diz `allow write: if false` — e `delete` está DENTRO de `write` —, então
    // a tentativa do cliente tomava permission-denied desde que nasceu (2.1.79 mediu: 0 órfãos
    // em 44 torneios, ou seja quem limpava nunca foi este código). Quem remove é o Admin SDK,
    // que ignora as rules: `syncDiscoveryFeed` (onDocumentWritten) e `purgeTournamentCopies`
    // (onDocumentDeleted, passo 5), os dois em `functions/index.js`.
    try {
      await this.db.collection('tournaments').doc(tId).delete();
    } catch (e) {
      window._error('Erro ao deletar torneio:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'deleteTournament', tournamentId: tournamentId, code: e && e.code });
      }
    }
  },

  async loadAllTournaments() {
    if (!this.db) return [];
    try {
      var snap = await this.db.collection('tournaments').get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-tourns'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d) tournaments.push(d);
      });
      // Torneios carregados do Firestore
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'loadAllTournaments', code: e && e.code });
      }
      return [];
    }
  },

  // Scoped load: returns only tournaments the user has a relationship with
  // (creator / organizer / active co-host / participant) via the denormalized
  // `memberEmails` field. Replaces `loadAllTournaments()` at login once the
  // backfill is complete and the composite index is live. Kept side-by-side
  // for now so the swap is a one-line change.
  // v1.2.2: UID ONLY (era loadMyTournaments(email) → where memberEmails).
  async loadMyTournaments(uid) {
    if (!this.db || !uid) return [];
    // ⭐ 2.0.95 — "MEUS TORNEIOS" LÊ O ÍNDICE, não o torneio inteiro.
    //
    // Esta tela desenha CARTÕES, e cartão não usa jogos, inscritos nem histórico. Lendo o
    // documento completo ela arrastava o torneio inteiro pra cada linha da lista.
    // MEDIDO no uid do organizador da Confra (scripts/medir-meus-torneios.js):
    //     documento COMPLETO ... 518 KB      RESUMO ... 25 KB
    // Abrir o torneio segue trocando o resumo pelo completo (`_ensureTournamentLoaded`).
    //
    // ⚠️ REDE: resumo vazio ⇒ cai no caminho antigo. Lista vazia por causa da migração
    // seria MUITO pior que lista pesada — o torneio da pessoa sumir da tela dela.
    // O espelho é conferido todo dia por scripts/conferir-banco-novo.js (39/39 idênticos).
    var _viaResumo = [];
    try {
      var snapS = await this.db.collection('tournaments_summary')
        .where('memberUids', 'array-contains', uid)
        .get();
      try { if (window._noteFsReads) window._noteFsReads(snapS.size, 'meus-torneios-resumo'); } catch (e) {}
      snapS.forEach(function (doc) {
        var d = doc.data();
        if (!d) return;
        d._docId = doc.id;
        if (!d.id) d.id = doc.id;
        // sentinela: se alguém pedir jogo/inscrito a este documento leve, o app avisa
        // com o rastro de quem pediu (ver `_marcaResumo` em store.js)
        if (typeof window._marcaResumo === 'function') window._marcaResumo(d);
        _viaResumo.push(d);
      });
    } catch (eR) {
      window._warn('[meus torneios] resumo indisponível, caindo no caminho antigo:', eR && eR.message);
    }
    if (_viaResumo.length) return _viaResumo;

    try {
      var snap = await this.db.collection('tournaments')
        .where('memberUids', 'array-contains', uid)
        .get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'meus-torneios-completo'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d) tournaments.push(d);
      });
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios do usuário:', e);
      return [];
    }
  },

  // Paginated discovery feed: public tournaments currently open for
  // enrollment. Used by the dashboard "Descobrir torneios" section so users
  // find events they aren't in yet. Server-side filters cap reads to
  // O(open public tournaments), not O(whole DB). Pass `cursor` (the last
  // DocumentSnapshot from a previous call) to page; returns { tournaments,
  // nextCursor, hasMore }.
  //
  // Requires a composite index on (isPublic asc, status asc, createdAt desc).
  // Firestore suggests the exact index via a console link on first query if
  // it isn't there yet.
  async loadPublicOpenTournaments(opts) {
    if (!this.db) return { tournaments: [], nextCursor: null, hasMore: false };
    opts = opts || {};
    var limit = Math.max(1, Math.min(50, opts.limit || 20));
    try {
      // Query só por isPublic=true + orderBy createdAt desc. Antes filtrávamos
      // server-side por `status == 'open'`, mas descobrimos que o fluxo de
      // criação de torneio (create-tournament.js) não setava `status` no
      // tourData — o campo ficava undefined e a query server-side excluía os
      // torneios, resultando em count zero na dashboard "Abertos para você".
      // Agora filtramos client-side: aceita status ausente OU 'open'.
      // O custo é ler docs a mais (finished/closed) que descartamos na
      // memória — aceitável na escala alpha; pode ser revertido pra query
      // estrita depois de uma migration que backfill `status: 'open'` nos
      // docs antigos.
      var q = this.db.collection('tournaments')
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc');
      if (opts.cursor) q = q.startAfter(opts.cursor);
      // Busca 3x a mais pra compensar filtragem client-side de docs
      // encerrados/fechados — evita que o primeiro page fique quase vazio.
      q = q.limit((limit + 1) * 3);
      var snap = await q.get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-public-open'); } catch (e) {}
      var tournaments = [];
      var lastDoc = null;
      var kept = 0;
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d) return;
        // Aceita status ausente (legacy) ou explicitamente 'open'.
        // Bloqueia status 'closed', 'finished', 'active' (em andamento) —
        // EXCETO Liga/Ranking que aceita inscrição mesmo com sorteio iniciado
        // (status='active') desde que ligaOpenEnrollment !== false.
        // v0.16.53: bug onde Liga pública sumia do feed de descoberta assim
        // que o organizador iniciava a 1ª rodada — Nelson não conseguia ver
        // Liga pública criada por Rodrigo porque status virou 'active'.
        var st = d.status;
        var isLigaFmt = d.format === 'Liga' || d.format === 'Ranking' || d.format === 'liga' || d.format === 'ranking';
        var ligaStillOpen = isLigaFmt && d.ligaOpenEnrollment !== false && st !== 'closed' && st !== 'finished';
        var isOpen = !st || st === 'open' || ligaStillOpen;
        if (!isOpen) return;
        // Lastdoc sempre avança mesmo quando filtrado — precisa pra cursor
        // funcionar corretamente na próxima página.
        lastDoc = doc;
        if (kept < limit) {
          tournaments.push(d);
          kept++;
        }
      });
      return {
        tournaments: tournaments,
        nextCursor: lastDoc,
        hasMore: snap.size >= (limit + 1) * 3
      };
    } catch (e) {
      window._error('Erro ao carregar torneios públicos:', e);
      return { tournaments: [], nextCursor: null, hasMore: false };
    }
  },

  // v0.16.57: novo loader que retorna TODOS os torneios públicos (sem filtro
  // de status). Diferente de `loadPublicOpenTournaments`, que filtra apenas
  // os "open"/Liga-aceitando-inscrição, este traz tudo (open, closed, active,
  // finished). Usado pelo dashboard pra mostrar 4 categorias separadas:
  // (a) inscrições abertas, (b) em andamento, (c) inscrições encerradas sem
  // sorteio, (d) encerrados. Categorização vai pra client-side.
  // ⭐ 2.0.91 — BUSCA NO SERVIDOR. Ordem do dono: "as buscas e filtro precisam voltar
  // a funcionar… achava, mas não mostrava, e achar e não mostrar é não achar".
  // A busca da tela inicial só filtrava os cartões JÁ DESENHADOS: torneio antigo, de
  // outra cidade ou que a pessoa não participa era INENCONTRÁVEL — não por estar
  // escondido, mas por nunca ter chegado ao aparelho.
  // O resumo (`tournaments_summary`) já carrega `nameLower` e `tokens` SEM ACENTO
  // exatamente pra isto. Duas consultas baratas, sobre documentos de ~2 KB:
  //   · `tokens array-contains` → casa PALAVRA inteira ("confra", "clinica")
  //   · `nameLower` por FAIXA   → casa PREFIXO ("conf" acha "Confra")
  // ⛔ Ambas são índice de campo ÚNICO: o Firestore cria sozinho, sem migração.
  async buscarTorneios(q, limite) {
    if (!this.db) return [];
    var termo = String(q || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (termo.length < 3) return [];      // 1-2 letras casaria com meio banco
    var lim = Math.max(1, Math.min(40, limite || 20));
    var achados = {};
    var colher = function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data(); if (!d) return;
        d._docId = doc.id; if (!d.id) d.id = doc.id;
        achados[String(d.id)] = d;
      });
    };
    try {
      var col = this.db.collection('tournaments_summary');
      var r = await Promise.all([
        col.where('tokens', 'array-contains', termo).limit(lim).get().catch(function () { return { forEach: function () {} }; }),
        col.where('nameLower', '>=', termo).where('nameLower', '<=', termo + '\uf8ff').limit(lim).get().catch(function () { return { forEach: function () {} }; })
      ]);
      r.forEach(colher);
      try { if (window._noteFsReads) window._noteFsReads(Object.keys(achados).length, 'busca-torneios'); } catch (e) {}
    } catch (e) {
      window._warn('[busca] falhou:', e && e.message);
      return [];
    }
    return Object.keys(achados).map(function (k) { return achados[k]; });
  },

  async loadAllPublicTournaments(opts) {
    if (!this.db) return { tournaments: [], nextCursor: null, hasMore: false };
    opts = opts || {};
    var limit = Math.max(1, Math.min(100, opts.limit || 50));
    try {
      // v0.16.62: REMOVIDO `.orderBy('createdAt', 'desc')` da query Firestore.
      // Causa-raiz do bug "Nelson não vê torneios públicos" mesmo com Liga
      // existindo no banco com isPublic=true: Firestore EXCLUI docs do
      // resultado de orderBy quando o campo de ordenação está ausente OU
      // num tipo inconsistente. Como `createdAt` é salvo como ISO string
      // em alguns paths, mas pode estar undefined em docs criados via
      // outros caminhos (ou via update sem o campo), a query orderBy zerava
      // tudo silenciosamente. Fix: query single-field `where('isPublic',
      // '==', true).limit(N)` SEM orderBy. Ordenação por createdAt vira
      // client-side. Custo: paginação por cursor não funciona temporaria-
      // mente (volume alpha é baixo, aceitável). Quando crescer a base,
      // backfill `createdAt` em todos os docs e voltar pro orderBy server-side.
      // ⭐ 2.0.90 — A VITRINE LÊ O RESUMO, NÃO O TORNEIO INTEIRO.
      // MEDIDO na base real: o documento do Confra tem 236 KB; o resumo dele, 11 KB.
      // Na base toda, 421 KB → 62 KB (85% menos). Esta consulta trazia até 51
      // documentos COMPLETOS — jogos, inscritos e histórico — pra desenhar cartões de
      // duas linhas. Ver docs/ARQUITETURA-DE-DADOS.md.
      // ⛔ O resumo vem marcado com `_resumo: true`: quem ABRE o torneio troca pelo
      // documento completo (`_ensureTournamentLoaded`), e a tela de detalhe não muda.
      // ⚠️ REDE: se a coleção de resumo vier vazia (regra, backfill em falta, projeto
      // novo), cai no caminho ANTIGO. Vitrine vazia por causa de migração seria pior
      // que vitrine pesada.
      var tournaments = [];
      var _viaResumo = false;
      /* ⛔ R1.3 · A CONTAGEM TEM QUE SOBREVIVER AOS DOIS CAMINHOS. O log final lia
       * `snap.size` — e `snap` só nasce dentro do `if (!_viaResumo)`. Quando o caminho do
       * RESUMO dava certo (o normal desde a 2.0.90), `snap` era `undefined`, o log lançava
       * `TypeError: Cannot read properties of undefined (reading 'size')`, e o `catch` lá
       * embaixo devolvia `{ tournaments: [] }`. Ou seja: a vitrine voltava VAZIA depois de
       * ter lido os resumos com sucesso — o dado estava na mão e era jogado fora por uma
       * linha de LOG. Medido em produção na 2.1.73: 5 exceções por carregamento.
       * ⚠️ `var` hoisted engana: a variável existe, só não tem valor. Nada avisa.
       * [[project_vitrine_volta_vazia_snap_indefinido]] */
      var _lidos = 0;
      try {
        var qs = this.db.collection('tournaments_summary')
          .where('isPublic', '==', true)
          .limit(limit + 1);
        var snapS = await qs.get();
        _lidos = snapS.size;
        try { if (window._noteFsReads) window._noteFsReads(snapS.size, 'load-all-public-resumo'); } catch (e) {}
        snapS.forEach(function (doc) {
          var d = doc.data();
          if (!d) return;
          d._docId = doc.id;
          if (!d.id) d.id = doc.id;
          // ⭐ sentinela: se alguém pedir jogo/inscrito a este documento leve, o app
          // avisa com o rastro de quem pediu (ver `_marcaResumo` em store.js).
          if (typeof window._marcaResumo === 'function') window._marcaResumo(d);
          tournaments.push(d);
        });
        _viaResumo = tournaments.length > 0;
      } catch (eR) {
        window._warn('[vitrine] resumo indisponível, caindo no caminho antigo:', eR && eR.message);
      }

      if (!_viaResumo) {
        var q = this.db.collection('tournaments')
          .where('isPublic', '==', true)
          .limit(limit + 1);
        var snap = await q.get();
        _lidos = snap.size;
        try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-public'); } catch (e) {}
        snap.forEach(function(doc) {
          var d = doc.data();
          if (!d) return;
          d._docId = doc.id;
          tournaments.push(d);
        });
      }
      // Sort client-side por createdAt desc. Docs sem createdAt vão pro fim.
      tournaments.sort(function(a, b) {
        var aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bT - aT;
      });
      var hasMore = tournaments.length > limit;
      if (hasMore) tournaments = tournaments.slice(0, limit);
      window._log('[loadAllPublicTournaments v0.16.62]',
        { via: _viaResumo ? 'resumo' : 'completo', lidos: _lidos, returned: tournaments.length, hasMore: hasMore });
      return {
        tournaments: tournaments,
        nextCursor: null, // paginação por cursor desabilitada temporariamente
        hasMore: hasMore
      };
    } catch (e) {
      window._error('Erro ao carregar todos os torneios públicos:', e);
      return { tournaments: [], nextCursor: null, hasMore: false };
    }
  },

  // Scan open tournaments across the whole DB — used by the nearby/sport-match
  // notification check, which has to look outside the current user's scoped
  // load (that's the whole point: show tournaments they aren't part of yet).
  // Filtra client-side por status ausente OU 'open' — docs legacy criados
  // antes do default explícito (v0.15.5) não têm status. Mesmo pattern
  // aplicado em loadPublicOpenTournaments.
  async loadOpenTournaments() {
    if (!this.db) return [];
    try {
      // Sem filtro server-side de status — busca todos os docs e filtra na
      // memória. Em collection com milhares de docs isso fica caro; mas o
      // call site único (notifier) já era uma varredura full anyway.
      var snap = await this.db.collection('tournaments').get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-tourns2'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d) return;
        var st = d.status;
        if (!st || st === 'open') tournaments.push(d);
      });
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios abertos:', e);
      return [];
    }
  },

  // Fetch one tournament by id — used by direct/invite links when the
  // tournament isn't in the scoped load (e.g. public tournament the user
  // hasn't joined yet).
  /* ── FASE 2a · O LEITOR SABE MONTAR O TORNEIO DAS SUBCOLEÇÕES ───────────────────
   *
   * Ainda NÃO muda nada: enquanto o documento carregar os jogos, é dele que eles saem.
   * Isto existe pra que o passo seguinte (tirar os jogos do documento, que é o que
   * REMOVE O TETO de 1 MB) possa acontecer torneio a torneio, sem release nenhum: basta
   * o documento passar a dizer `_semPesados: ['matches']` e este leitor assume.
   *
   * ⛔ O GATILHO É O MARCADOR, NUNCA A AUSÊNCIA. Torneio recém-criado também não tem
   * jogo — se eu disparasse por "não tem rounds", ele iria buscar subcoleção vazia e o
   * torneio abriria vazio. Ausência não é a mesma coisa que "mudou de lugar".
   *
   * ⚠️ E ISTO CUSTA LEITURA: o documento é 1 leitura; a subcoleção de jogos do Confra são
   * 112. A troca vale porque ABRIR acontece às vezes e LANÇAR PLACAR acontece o tempo
   * todo (hoje cada placar reescreve e ecoa 238 KB pra toda tela aberta). Por isso só o
   * que a tela precisa é buscado — `history` fica no documento até ter motivo pra sair.
   * Ver docs/FASE2-JOGOS-EM-SUBCOLECAO.md.
   */
  async _montaDeSubcolecoes(id, config, quais) {
    // ⭐ UM CAMINHO SÓ: quem sabe quais partes existem, em que coleção cada uma mora e o
    // que fazer quando falta é `montarDoBanco` (split-core, vendorizado). Aqui fica só o
    // que de fato é DAQUI: como se lê uma coleção com o SDK do cliente.
    var S = (typeof window !== 'undefined') ? window._tSplit : null;
    if (!S || typeof S.montarDoBanco !== 'function') {
      window._error('[fase2] falta o tradutor (_tSplit) — o torneio abriria sem jogos');
      throw new Error('tradutor indisponível');
    }
    var ref = this.db.collection('tournaments').doc(String(id));
    var lidos = 0;
    try {
      var t = await S.montarDoBanco(config, async function (colecao) {
        var snap = await ref.collection(colecao).get();
        lidos += snap.size;
        var arr = []; snap.forEach(function (d) { var v = d.data(); if (v) arr.push(v); });
        return arr;
      });
      try { if (window._noteFsReads) window._noteFsReads(lidos, 'abrir-torneio-subcolecao'); } catch (e) {}
      return t;
    } catch (e) {
      // ⛔ NÃO devolver o config cru: config cru é torneio SEM JOGOS, e entregar isso em
      // silêncio foi o que pintou chave vazia pra todo mundo em 26/ago.
      window._error('[fase2] não consegui montar ' + id, e);
      throw e;
    }
  },

  /* ── ENFILEIRA A INTENÇÃO DE PLACAR (2.0.103) ─────────────────────────────────
   * Chamada quando a CF `applyMatchResult` NÃO respondeu (rede, CF fora, aparelho sem
   * sinal na quadra). Antes disso a queda era o MOTOR LOCAL — e o dono proibiu:
   * _"imagina diferentes clientes com diferentes versões encerrando as rodadas e gerando
   * a seguinte cada um com um código. de forma alguma. tudo na cf"_.
   *
   * ⭐ POR QUE UMA ESCRITA COMUM, E NÃO OUTRA CHAMADA. `enablePersistence` está ligado —
   * o log do boot diz "persistência offline ATIVA: saves sobrevivem a fechar o app". Uma
   * escrita de Firestore sem sinal NÃO falha: o SDK enfileira e entrega sozinho quando a
   * rede volta, mesmo que o app tenha sido fechado no meio. Uma CF chamável não tem nada
   * disso — falha na hora. Por isso a intenção vai por escrita, e quem APLICA é o gatilho
   * `applyQueuedResult`, no servidor, com a MESMA função da porta chamável.
   *
   * ⭐ O ID SAI DA INTENÇÃO, não é sorteado: reenviar a mesma coisa cai no MESMO documento
   * e o gatilho roda uma vez só. A CF chamável pode ter aplicado e a resposta ter se
   * perdido na volta — nesse caso o cliente enfileira sem saber, e aplicar placar DUAS
   * vezes é o pior erro possível aqui. (2ª trava: o motor recusa sozinho quando o jogo já
   * tem aquele resultado, e recusa é resposta legítima.)
   *
   * ⛔ NÃO devolve promessa de que o servidor aplicou — devolve que a intenção FOI ACEITA
   * localmente. É por isso que quem chama avisa "vai entrar quando a conexão voltar" em
   * vez de "pronto": prometer o que não aconteceu é pior que avisar que falta.
   */
  async enfileirarPlacar(tournamentId, matchId, payload, logMessage, actor) {
    if (!this.db || !tournamentId || !matchId || !actor || !actor.uid) return false;
    var _hash = function (txt) {
      var h = 0x811c9dc5;
      for (var i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
      return h.toString(36);
    };
    var corpo = JSON.stringify({ m: String(matchId), p: payload, l: logMessage || '' });
    var id = String(matchId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '-' +
             String(actor.uid).slice(0, 8) + '-' + _hash(corpo);
    var item = {
      matchId: String(matchId),
      payload: payload,
      logMessage: logMessage || '',
      actorUid: String(actor.uid),
      actorEmail: actor.email || '',
      at: Date.now(),
      appVersion: (typeof window !== 'undefined' && window.SCOREPLACE_VERSION) || ''
    };
    // ⚠️ SEM await no set: offline ele SÓ resolve quando a rede voltar (pode ser horas), e
    // esperar aqui travaria a tela na quadra — que é justamente o caso que isto atende.
    // O SDK já persistiu localmente quando `set` retorna o objeto; a promessa é a
    // confirmação do SERVIDOR, e essa a gente não espera de propósito.
    try {
      this.db.collection('tournaments').doc(String(tournamentId))
        .collection('resultQueue').doc(id).set(item)
        .catch(function (e) { if (window._warn) window._warn('[filaPlacar] servidor recusou a intenção', e); });
      return true;
    } catch (e) {
      if (window._error) window._error('[filaPlacar] não consegui enfileirar', e);
      return false;
    }
  },

  /* ── O LOG INTEIRO, QUANDO O DOCUMENTO SÓ TEM A CAUDA ──────────────────────────
   * O histórico é o único campo do torneio que cresce PRA SEMPRE (`rounds` para quando o
   * torneio acaba; o log não). Medido em 26/ago: 37 KB dos 245 KB do Confra. Por isso a
   * cauda dele é podada do documento — e o que foi podado continua inteiro na subcoleção,
   * que o gatilho mantém em modo "só cresce".
   *
   * ⛔ PODAR SEM ISTO SERIA APAGAR DA TELA. Rastro de auditoria que some em silêncio é
   * exatamente o que custou uma tarde pra reconstruir o sumiço do Gersom. Quem poda tem
   * que oferecer de volta o que podou.
   * ⚠️ A ordem sai de `item.date`, NUNCA de índice: índice anda com a poda (foi o defeito
   * corrigido na 2.0.99b). Ver [[feedback_chave_de_espelho_nunca_e_posicao]].
   */
  async carregarHistoricoCompleto(id) {
    if (!this.db || !id) return null;
    try {
      var snap = await this.db.collection('tournaments').doc(String(id)).collection('history').get();
      var arr = [];
      snap.forEach(function (d) { var v = d.data(); if (v && v.item) arr.push(v.item); });
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'historico-completo'); } catch (e) {}
      arr.sort(function (a, b) { return String(a && a.date || '').localeCompare(String(b && b.date || '')); });
      return arr;
    } catch (e) {
      // falhar aqui NÃO pode derrubar a tela: ela já mostra a cauda do documento
      if (window._warn) window._warn('[historico] não consegui buscar o log completo de ' + id, e);
      return null;
    }
  },

  async loadTournamentById(id) {
    if (!this.db || !id) return null;
    try {
      var doc = await this.db.collection('tournaments').doc(String(id)).get();
      if (!doc.exists) return null;
      var _t = doc.data();
      // o documento diz o que saiu dele; enquanto não disser nada, nada muda
      var _fora = Array.isArray(_t._semPesados) ? _t._semPesados : null;
      if (_fora && _fora.length) _t = await this._montaDeSubcolecoes(id, _t, _fora);
      // Rei/Rainha: o doc traz grupos só com matchIds — reidrata group.matches como refs.
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(_t); } catch (_hmErr) {}
      return _t;
    } catch (e) {
      window._error('Erro ao carregar torneio:', e);
      return null;
    }
  },

  // ---- User Profiles ----

  async saveUserProfile(uid, profileData) {
    if (!this.db || !uid) return;
    // Denormalize lowercase copies for server-side search. Range queries
    // on `displayName_lower` / `email_lower` replace the
    // scan-the-whole-users-collection pattern in searchUsers(). Only write
    // the `_lower` fields when the source field is present in this update,
    // so merge-saves that don't touch displayName/email don't clobber them.
    //
    // v0.16.8: removido try/catch que engolia silenciosamente erros do
    // Firestore (security rules reject, offline, etc). O caller
    // (saveUserProfileToFirestore em store.js) depende de que o promise
    // rejeite para surfaçar "⚠️ Falhou" no toast em vez de "✅ salvou".
    // Erro aqui virava ok=true mentiroso — causa-raiz do bug "o perfil
    // continua não salvando" reportado em v0.16.6 e v0.16.7.
    var toSave = Object.assign({}, profileData);
    if (toSave.displayName) {
      // v1.7.88: saneia aqui TAMBÉM — este é o último portão antes do Firestore e
      // nem todo caminho passa pelo saveUserProfileToFirestore do store.js. Sem isto
      // o `displayName_lower` seria derivado do nome sujo, e é ele que a BUSCA usa:
      // "Juliana Dal+Sasso" ficaria inalcançável por quem digitasse "Dal Sasso".
      if (typeof window !== 'undefined' && typeof window._normalizeDisplayName === 'function') {
        toSave.displayName = window._normalizeDisplayName(toSave.displayName);
      }
      toSave.displayName_lower = String(toSave.displayName).toLowerCase();
    }
    if (toSave.email) {
      toSave.email_lower = String(toSave.email).toLowerCase();
    }
    await this.db.collection('users').doc(uid).set(toSave, { merge: true });
  },

  async loadUserProfile(uid) {
    if (!this.db || !uid) return null;
    try {
      var doc = await this.db.collection('users').doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      window._error('Erro ao carregar perfil:', e);
      return null;
    }
  },

  // Recently-active users (created or updated in the last N days). Used to
  // populate the Explore page with suggestions when the search box is empty —
  // feels better than a "Nenhum usuário encontrado" dead end. Ordered by the
  // most recent signal (`updatedAt` preferred, `createdAt` as a fallback for
  // profiles that never re-saved after signup). Requires a single-field index
  // on `updatedAt desc`, which Firestore provides automatically.
  async listRecentUsers(days, limit) {
    if (!this.db) return [];
    var d = Math.max(1, parseInt(days, 10) || 7);
    var lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 30));
    var cutoff = new Date(Date.now() - d * 24 * 3600 * 1000).toISOString();
    try {
      var results = {};
      var addFromSnap = function(snap) {
        snap.forEach(function(doc) {
          if (results[doc.id]) return;
          var data = doc.data();
          data._docId = doc.id;
          if (data.acceptFriendRequests !== false) results[doc.id] = data;
        });
      };
      // Two parallel queries — some profiles have updatedAt (active users),
      // others only carry createdAt from first login. Union them client-side.
      await Promise.all([
        this.db.collection('users')
          .where('updatedAt', '>=', cutoff)
          .orderBy('updatedAt', 'desc')
          .limit(lim).get().then(addFromSnap).catch(function(e) { window._warn('recent-updatedAt err', e && e.message); }),
        this.db.collection('users')
          .where('createdAt', '>=', cutoff)
          .orderBy('createdAt', 'desc')
          .limit(lim).get().then(addFromSnap).catch(function(e) { window._warn('recent-createdAt err', e && e.message); })
      ]);
      return Object.keys(results).map(function(k) { return results[k]; });
    } catch (e) {
      window._error('Erro ao carregar usuários recentes:', e);
      return [];
    }
  },

  // ---- Explore: list users who accept friend requests ----

  // v2.6.104: nome de exibição único. Retorna o uid de OUTRA conta que já usa
  // este nome (ou null). Consulta exata em displayName_lower (mesmo índice do
  // searchUsers). Ignora contas já mescladas (mergedInto). Fail-open: erro de
  // consulta retorna null (não bloqueia o save por falha técnica).
  async isDisplayNameTaken(name, myUid) {
    if (!name || !this.db) return null;
    var q = String(name).trim().toLowerCase();
    if (!q) return null;
    try {
      // user-vivo:isento — aqui não se RESOLVE uma pessoa, se procura CONFLITO de nome:
      // a lápide tem de ser IGNORADA (nome de conta morta não bloqueia ninguém), não seguida.
      var snap = await this.db.collection('users').where('displayName_lower', '==', q).limit(8).get();
      var conflict = null;
      snap.forEach(function (doc) {
        var data = doc.data() || {};
        if (doc.id !== myUid && !data.mergedInto) conflict = doc.id;
      });
      return conflict;
    } catch (e) {
      if (window._warn) window._warn('[isDisplayNameTaken] consulta falhou (fail-open):', e);
      return null;
    }
  },

  // Resolve um NOME DIGITADO → a(s) conta(s) que têm EXATAMENTE esse displayName.
  // IDENTIDADE = uid: usado no enroll/pareamento pra nunca gravar um titular de
  // conta só por nome (a classe de bug que sumiu o Adriano). Nomes são únicos entre
  // uids (resolveUniqueDisplayName), então normalmente 0 ou 1; 2+ é resíduo legado.
  // Ignora contas mescladas (mergedInto) e nomes "não-amigáveis" (dupla "A / B",
  // email, telefone, placeholder) — esses não são nome de pessoa. Retorna:
  //   { status:'none' }                      → sem conta (participante informal)
  //   { status:'unique', uid, profile }      → 1 conta
  //   { status:'ambiguous', candidates:[…] } → 2+ homônimos (perguntar qual)
  // Fail-open: erro de consulta devolve 'none' (grava informal, não bloqueia).
  async resolveNameToAccounts(name) {
    if (!name || !this.db) return { status: 'none' };
    var q = String(name).trim().toLowerCase();
    if (!q || q.indexOf(' / ') !== -1) return { status: 'none' };
    if (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(name)) return { status: 'none' };
    try {
      // user-vivo:isento — candidatos pra ESCOLHA humana entre homônimos: lápide não entra
      // na lista (seria oferecer uma conta morta), e o filtro abaixo já a descarta.
      var snap = await this.db.collection('users').where('displayName_lower', '==', q).limit(8).get();
      var cands = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        if (d.mergedInto) return;
        cands.push({ uid: doc.id, displayName: d.displayName || name, email: d.email || '', phone: d.phone || '', photoURL: d.photoURL || '' });
      });
      if (cands.length === 0) return { status: 'none' };
      if (cands.length === 1) return { status: 'unique', uid: cands[0].uid, profile: cands[0] };
      return { status: 'ambiguous', candidates: cands };
    } catch (e) {
      if (window._warn) window._warn('[resolveNameToAccounts] fail-open:', e);
      return { status: 'none' };
    }
  },

  // v3.0.82: garante displayName ÚNICO entre UIDs. Dado um nome-base e o meu uid,
  // devolve o próprio nome se livre, ou uma variante ("Nome 2", "Nome 3"…) quando
  // já há OUTRA conta (uid) usando — a regra do dono: dois uids de pessoas
  // diferentes NUNCA podem ter o mesmo nome. Nomes "não-amigáveis"
  // (email/telefone/placeholder) passam intactos: não são nomes de pessoa e não
  // disputam unicidade. Homônimos VIRTUAIS sem uid (Jogador X, informais, ghosts)
  // não estão em `users` → nunca colidem aqui (são permitidos). Usado no PRIMEIRO
  // login pra auto-adotar variante sem bloquear a entrada (o gate do perfil
  // continua pedindo a variante explicitamente quando a pessoa edita o nome).
  // Fail-open: erro de consulta devolve o nome-base.
  async resolveUniqueDisplayName(baseName, myUid) {
    var nm = String(baseName == null ? '' : baseName).trim();
    if (!nm || !this.db) return nm;
    if (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(nm)) return nm;
    try {
      var taken = await this.isDisplayNameTaken(nm, myUid);
      if (!taken) return nm;
      for (var k = 2; k <= 9; k++) {
        var cand = nm + ' ' + k;
        var t2 = await this.isDisplayNameTaken(cand, myUid);
        if (!t2) return cand;
      }
      // Fallback extremo (9 variantes ocupadas): sufixo curto do uid — sempre único.
      return nm + ' ' + String(myUid || '').slice(-4);
    } catch (e) {
      if (window._warn) window._warn('[resolveUniqueDisplayName] fail-open:', e);
      return nm;
    }
  },

  // Search users by name or email prefix. Server-side range queries on the
  // denormalized `displayName_lower` / `email_lower` fields — bounded by
  // the per-query `limit`, not the total user count. Empty query returns
  // []: a blind scan across all users is exactly what we moved away from.
  async searchUsers(queryText, opts) {
    if (!this.db) return [];
    var q = String(queryText || '').trim().toLowerCase();
    if (!q) return [];
    opts = opts || {};
    var perQueryLimit = Math.max(1, Math.min(50, opts.limit || 20));
    var results = {};
    // v1.0.5-beta: PRIVACY — sanitizar resultado de searchUsers pra retornar só
    // campos públicos. Antes retornava o doc inteiro de users/{uid}, expondo
    // phone/phoneCountry/birthDate/gender/preferredCeps/preferredLocations
    // pra qualquer um que rodasse FirestoreDB.searchUsers no console (#explore
    // chama isso pra busca de amigos). Fix em 1 camada client-side; security
    // rules ainda permitem leitura do doc inteiro — fix definitivo em rules
    // fica pra round dedicado com testes.
    var PUBLIC_FIELDS = [
      'displayName', 'displayName_lower',
      'email', 'email_lower',
      'photoURL',
      'acceptFriendRequests',
      'preferredSports',  // útil pra sugestão de parceiros
      'createdAt', 'updatedAt', 'lastSeenAt'
    ];
    var sanitize = function(raw) {
      var out = { _docId: raw._docId };
      for (var i = 0; i < PUBLIC_FIELDS.length; i++) {
        var k = PUBLIC_FIELDS[i];
        if (raw[k] !== undefined) out[k] = raw[k];
      }
      return out;
    };
    var addFromSnap = function(snap) {
      snap.forEach(function(doc) {
        if (results[doc.id]) return;
        var data = doc.data();
        data._docId = doc.id;
        // LÁPIDE (conta já mesclada) não é gente pra convidar: fora da lista, na FONTE.
        // Filtrar só lá na frente não funcionava — o `sanitize` abaixo apaga `mergedInto`,
        // então o filtro do explore.js recebia o campo já sumido e deixava a conta morta passar.
        if (data.mergedInto) return;
        // Default acceptFriendRequests to true (undefined means not set yet)
        if (data.acceptFriendRequests !== false) {
          results[doc.id] = sanitize(data);
        }
      });
    };
    var end = q + '\uf8ff';
    // user-vivo:isento — searchUsers devolve uma LISTA pra pessoa escolher: lápide é
    // DESCARTADA no addFromSnap (nem aparece), nunca redirecionada pro sobrevivente.
    var queries = [
      this.db.collection('users')
        .where('displayName_lower', '>=', q)
        .where('displayName_lower', '<', end)
        .limit(perQueryLimit).get().then(addFromSnap).catch(function(e) {
          window._warn('displayName search error:', e && e.message);
        }),
      // user-vivo:isento — idem: lista pra escolha, lápide descartada no addFromSnap.
      this.db.collection('users')
        .where('email_lower', '>=', q)
        .where('email_lower', '<', end)
        .limit(perQueryLimit).get().then(addFromSnap).catch(function(e) {
          window._warn('email search error:', e && e.message);
        })
    ];
    await Promise.all(queries);
    return Object.keys(results).map(function(k) { return results[k]; });
  },

  // Carrega TODOS os usuários que aceitam pedido de amizade (toggle do perfil),
  // sanitizados (só campos públicos). Usado pela busca da página Pessoas para
  // filtrar por SUBSTRING client-side — o searchUsers normal só faz prefix
  // match em displayName_lower (não acha "Vieira" em "Fabiana Vieira").
  // Escala-ok pra base beta (dezenas/centenas). Quando crescer, migrar pra
  // índice de busca dedicado. limit defensivo de 2000.
  async listInvitableUsers() {
    if (!this.db) return [];
    // v4.5.68: cache de sessão (TTL 5min). Abrir #explore fazia um scan de até
    // 2000 docs da coleção `users` TODA VEZ (Sentry: "read spike searchUsers-scan
    // =306 · rota=#explore"). Sem cache, cada reabertura da tela Explorar relia a
    // base inteira. Novos cadastros aparecem no máx 5min depois — trade-off aceito
    // pra lista de convite. Ver memória project_firestore_read_efficiency.
    var _c = window._invitableUsersCache;
    if (_c && (Date.now() - _c.at) < 300000) return _c.data.slice();
    // ⚠️ 2.1.14 — `preferredLocations` ENTROU AQUI, e é uma decisão de privacidade, não
    // um campo a mais. A tela #todas-pessoas agrupa por "joga nos meus locais" (ordem do
    // dono), e pra isso o local preferido do OUTRO precisa chegar ao cliente. O campo não
    // é EXIBIDO — serve só pra decidir a seção. Ele é da mesma família de `city`, que já
    // viajava aqui. MEDIDO em 27/ago: 40 dos 259 perfis (15%) têm o campo preenchido.
    var PUBLIC_FIELDS = [
      'displayName', 'displayName_lower', 'email', 'email_lower',
      'photoURL', 'acceptFriendRequests', 'preferredSports', 'city',
      'preferredLocations',
      'createdAt', 'updatedAt', 'lastSeenAt'
    ];
    var out = [];
    try {
      var snap = await this.db.collection('users').limit(2000).get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'searchUsers-scan'); } catch (e) {}
      snap.forEach(function(doc) {
        var data = doc.data();
        if (data.mergedInto) return;                     // lápide não é convidável (ver searchUsers)
        if (data.acceptFriendRequests === false) return; // respeita o toggle
        var o = { _docId: doc.id };
        for (var i = 0; i < PUBLIC_FIELDS.length; i++) {
          if (data[PUBLIC_FIELDS[i]] !== undefined) o[PUBLIC_FIELDS[i]] = data[PUBLIC_FIELDS[i]];
        }
        out.push(o);
      });
      window._invitableUsersCache = { at: Date.now(), data: out };
    } catch (e) {
      window._warn('listInvitableUsers err', e && e.message);
    }
    return out.slice();
  },

  // ---- Friend Requests ----

  /* ⛔ AS CINCO OPERAÇÕES DE AMIZADE SAÍRAM DAQUI (v2.1.48, 29/ago/2026).
   * Elas escreviam nos perfis dos DOIS lados por `arrayUnion`/`arrayRemove`, e a regra
   * que permitia isso (`isFriendArrayDiff`) não perguntava QUEM estava escrevendo — era
   * uma escalada de privilégio: qualquer conta se punha no `friends` de qualquer pessoa
   * e passava a ler estatísticas marcadas como "só amigos".
   * Agora a autoridade é a CF (functions/index.js → _amizadeAplicar), que decide pela
   * máquina de estados em functions/amizade-authority-core.js e grava relação +
   * projeção + cache numa transação só. O convite CRUZADO (os dois se convidam ⇒ vira
   * amizade) e a notificação também são do servidor agora — o cliente não sabe mais o
   * suficiente pra decidir isso, e é bom que não saiba.
   * A assinatura dos cinco métodos foi PRESERVADA: `fromUid`/`myUid` são ignorados (o
   * ator vem do token), e os ~12 chamadores em explore.js/tournaments-analytics.js
   * seguem chamando igual. */
  async sendFriendRequest(fromUid, toUid, fromData) {
    if (!toUid) return;
    var r = await this._callFn('sendFriendRequest', { toUid: String(toUid) });
    return (r && r.evento === 'auto-aceito') ? 'auto-accepted' : undefined;
  },

  async acceptFriendRequest(myUid, friendUid) {
    if (!friendUid) return;
    return this._callFn('acceptFriendRequest', { friendUid: String(friendUid) }).then(function () {
      setTimeout(function () {
        if (typeof window._trophyOnFriendAdded === 'function') window._trophyOnFriendAdded();
      }, 500);
    });
  },

  /* ⭐ A lista de amizades antigas a reconfirmar (v2.1.48). Vem do servidor porque só ele
   * pode enumerar `friendships` sem abrir a porta pra enumerar relação de terceiro — o
   * `uidA`/`uidB` da consulta é o do token, nunca do corpo. */
  async listLegacyFriendships() {
    var r = await this._callFn('listLegacyFriendships', {});
    return (r && Array.isArray(r.relacoes)) ? r.relacoes : [];
  },

  async removeFriend(myUid, friendUid) {
    if (!friendUid) return;
    return this._callFn('removeFriend', { friendUid: String(friendUid) });
  },

  async cancelFriendRequest(fromUid, toUid) {
    if (!toUid) return;
    return this._callFn('cancelFriendRequest', { toUid: String(toUid) });
  },

  async rejectFriendRequest(myUid, friendUid) {
    if (!friendUid) return;
    return this._callFn('rejectFriendRequest', { friendUid: String(friendUid) });
  },

  // ---- Notifications ----

  async addNotification(uid, notifData) {
    if (!this.db || !uid) return;
    try {
      // v1.8.45-beta: ID determinístico em vez de .add() para garantir
      // idempotência no Firestore. Múltiplas chamadas do mesmo evento
      // (race, retry, re-render) produzem o MESMO doc — sem duplicatas.
      // v2.1.15: BUG — a chave (type+tournament+match+dia+uid) era grossa demais:
      // eventos DIFERENTES do mesmo tipo/torneio no mesmo dia colapsavam no MESMO
      // doc, e o 2º .set() virava UPDATE (doc já existe) que a regra só permite
      // pro DONO → quem dispara (organizador) era NEGADO e a notificação sumia.
      // Agora incluímos um hash da mensagem: evento distinto → doc distinto (é
      // CREATE, permitido); duplicata real (mesma mensagem) → mesmo doc (idempotente).
      var _type = String(notifData.type || 'info');
      var _tId  = String(notifData.tournamentId || '');
      var _mId  = String(notifData.matchId || '');
      var _day  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      var _msg  = String(notifData.message || '');
      var _msgHash = (function(s){ var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); })(_msg);
      var _raw  = [_type, _tId, _mId, _day, _msgHash, uid].join('|');
      // Converte para ID válido (só alfanumérico + _ + -)
      var _docId = _raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);

      // ── NOTIFICAÇÃO NÃO CARREGA FOTO (1.9.24) ───────────────────────────────
      // Incidente REAL (17/ago/2026, relato do dono: _"demorou para caramba para
      // carregar os dados. dash no ar mas sem dados, sem perfil, sem torneios"_).
      // MEDIDO na base antes de mexer: a caixa dele tinha 476 notificações somando
      // **1,2 MB**, e as 3 NÃO LIDAS daquele momento pesavam **95 KB cada**. O peso
      // inteiro era `fromPhoto` — a `photoURL` de quem disparou, quando ela é
      // `data:image/jpeg;base64,…` (21 das 234 contas guardam a foto assim; a maior
      // tem 133 KB). Cada resultado proposto copiava a foto do proponente pra caixa
      // de CADA destinatário: 25 notificações de placar = 618 KB.
      // ⚠️ E `fromPhoto` **não é lido em lugar nenhum**: varredura no repo inteiro
      // deu 5 pontos gravando e ZERO renderizando. Era peso morto — e ele caía no
      // caminho de ABERTURA, porque o badge do sino baixava toda não lida pra contar
      // (ver `getUnreadNotificationCount`, consertado na mesma leva).
      // A limpeza mora AQUI, no ponto único por onde toda notificação passa: caller
      // novo não tem como reintroduzir o campo. Quem um dia quiser a foto lê o doc
      // de quem mandou por `fromUid` — a identidade já viaja no payload.
      // Ver [[feedback_unify_dual_entry_points]].
      var _limpo = {};
      Object.keys(notifData).forEach(function (k) {
        if (k === 'fromPhoto') return;
        _limpo[k] = notifData[k];
      });

      // .set() com merge:false sobrescreve silenciosamente doc existente.
      // Notificações não lidas preservam read:false (campo vem no notifData).
      await this.db.collection('users').doc(uid).collection('notifications').doc(_docId).set(_limpo);
    } catch (e) {
      window._error('Erro ao criar notificação:', e);
    }
  },

  async getNotifications(uid, limit) {
    if (!this.db || !uid) return [];
    try {
      var query = this.db.collection('users').doc(uid).collection('notifications')
        .orderBy('createdAt', 'desc');
      if (limit) query = query.limit(limit);
      var snap = await query.get();
      var notifs = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._id = doc.id;
        notifs.push(data);
      });
      return notifs;
    } catch (e) {
      window._error('Erro ao carregar notificações:', e);
      return [];
    }
  },

  async markNotificationRead(uid, notifId) {
    if (!this.db || !uid || !notifId) return;
    try {
      await this.db.collection('users').doc(uid).collection('notifications').doc(notifId).update({ read: true });
    } catch (e) {
      window._error('Erro ao marcar notificação como lida:', e);
    }
  },

  // ── v1.8.92: TODA notificação não lida tem que ser ALCANÇÁVEL ───────────────
  // A tela pede as 50 MAIS RECENTES; o sino conta TODAS as não lidas. Quando a não
  // lida é mais antiga que a 50ª, o ponto vermelho aponta pra algo que a tela não
  // consegue mostrar — e não existe gesto que resolva. Foi exatamente o caso: 466
  // notificações, 60 não lidas, TODAS de 11–15/jul, enquanto as 50 recentes (agosto)
  // estavam todas lidas. Medido, não deduzido.
  //
  // ⚠️ Sem `orderBy` de propósito: combinar `where` com `orderBy` num campo opcional
  // EXCLUI silenciosamente quem não tem o campo — foi assim que a Liga sumiu do
  // discovery (v0.16.62). A ordenação fica no cliente, que já ordena a lista.
  async getUnreadNotifications(uid, limit) {
    if (!this.db || !uid) return [];
    try {
      var q = this.db.collection('users').doc(uid).collection('notifications')
        .where('read', '==', false);
      if (limit) q = q.limit(limit);
      var snap = await q.get();
      var out = [];
      snap.forEach(function (d) { var o = d.data() || {}; o._id = d.id; out.push(o); });
      return out;
    } catch (e) {
      // Falhar aqui NÃO pode esvaziar a tela: o caller funde isto com as recentes,
      // então devolver [] degrada pro comportamento anterior em vez de quebrar.
      return [];
    }
  },

  // Marca TODAS as não lidas de uma vez. Existe porque, com 60 não lidas de um mês
  // atrás, exigir que cada uma fique 5s na tela é um pedido irreal.
  async markAllNotificationsRead(uid) {
    if (!this.db || !uid) return 0;
    try {
      var pend = await this.getUnreadNotifications(uid);
      if (!pend.length) return 0;
      var col = this.db.collection('users').doc(uid).collection('notifications');
      // Lotes de 400: o teto do batch do Firestore é 500.
      for (var i = 0; i < pend.length; i += 400) {
        var batch = this.db.batch();
        pend.slice(i, i + 400).forEach(function (n) { batch.update(col.doc(n._id), { read: true }); });
        await batch.commit();
      }
      return pend.length;
    } catch (e) {
      return 0;
    }
  },

  // ── CONTAR NÃO É BAIXAR (1.9.24) ──────────────────────────────────────────
  // Este é o primeiro pedido de dados que o app faz depois do login: o badge do
  // sino (`_updateNotificationBadge`, chamado por auth.js no boot). Ele pedia
  // `.get()` na consulta inteira e usava só o `snap.size` — ou seja, baixava o
  // CORPO de toda notificação não lida pra devolver um número. Com as fotos em
  // base64 que viajavam no `fromPhoto` (ver `addNotification`), isso eram **285 KB
  // de JPEG na frente da fila** na noite de 17/ago; no 4G do celular, o dashboard
  // ficava no ar sem dados enquanto elas desciam.
  // A agregação `count()` resolve no SERVIDOR: uma resposta com um inteiro.
  // ⚠️ O fallback não é enfeite: `count()` existe no SDK a partir da 9.11, e o app
  // roda dentro de WebView nativa com SDK possivelmente mais velho — sem ele o
  // badge zeraria em silêncio, que é pior que ser lento. Ver
  // [[feedback_no_load_fallback]]: fallback de LEITURA é proibido, este é de
  // CAPACIDADE do SDK — o dado é o mesmo, muda só quem conta.
  async getUnreadNotificationCount(uid) {
    if (!this.db || !uid) return 0;
    try {
      var q = this.db.collection('users').doc(uid).collection('notifications')
        .where('read', '==', false);
      if (typeof q.count === 'function') {
        var agg = await q.count().get();
        return (agg && typeof agg.data === 'function' && agg.data().count) || 0;
      }
      // ⚠️ MEDIDO NO AR (1.9.24, na página servida): o firebase-firestore-compat
      // 10.14.1 que o app carregava **não tinha `count()`** — em produção quem rodava
      // era ESTE ramo, e deixá-lo baixando a consulta inteira seria não ter consertado
      // nada. Desde a 1.9.73 o app carrega o compat 12.17.1; se ele expuser count(),
      // o ramo de cima assume sozinho — este aqui fica de fallback e o TETO continua
      // obrigatório de qualquer jeito.
      // O TETO resolve sem depender do SDK: o badge só sabe dizer "9+" (ver
      // `_updateNotificationBadge`), então a 11ª não lida não muda um pixel na tela.
      // Ler 10 é o suficiente para pintar certo — e o custo da abertura fica preso
      // num teto, em vez de crescer com a caixa da pessoa.
      // ⚠️ CONTRATO: o retorno é o número REAL até 10; acima disso devolve 10. Caller
      // que precise do total exato tem que fazer a própria leitura (e assumir o custo).
      var snap = await q.limit(this.NOTIF_BADGE_MAX).get();
      return snap.size;
    } catch (e) {
      return 0;
    }
  },

  /* ══ L1.1 · `queueEmail` MORREU ═══════════════════════════════════════════════
   * Era a ÚNICA porta do cliente para `/mail`, e recebia destinatário, assunto e HTML
   * INTEIROS de quem chamasse. Com `firestore.rules` aceitando write de qualquer
   * autenticado, isso não é fila de e-mail: é um relay aberto saindo do remetente do
   * produto. Os dois fluxos que a usavam — convite de dupla e de co-organização —
   * viraram capabilities de servidor (`sendPairInviteEmail` / `sendCoHostInviteEmail`),
   * que resolvem torneio, permissão, destinatário, URL, assunto e corpo sozinhas.
   * ⛔ NÃO REINTRODUZIR. `tests/convites-dupla-e-coorg-server-only.test.js` recusa
   * qualquer `collection('mail')` ou `queueEmail` em js/. */

  /* ⭐ L1.1.1 · OS DOIS ENVELOPES DEVOLVEM UM VEREDITO, não a resposta crua.
   * `{ enviado: boolean, motivo: string }`. Antes devolviam o objeto da Function ou
   * `null` no catch — e quem chamava mostrava "Convite enviado" de qualquer jeito,
   * inclusive quando a Function tinha respondido `convite-inexistente`. Afirmar que
   * um e-mail saiu quando ele não saiu é a mesma família de defeito que a R1.1 fechou
   * na tela: dizer à pessoa algo que não é verdade sobre o estado do sistema.
   * ⚠️ Um veredito só, aqui, e não uma tradução em cada tela: duas cópias divergiriam
   * e uma delas voltaria a mentir. */
  _vereditoDoEnvio(res, ondeLog) {
    if (res && res.ok === true) return { enviado: true, motivo: '' };
    var motivo = (res && res.motivo) ? String(res.motivo) : 'sem-resposta';
    window._warn('[' + ondeLog + '] e-mail não saiu: ' + motivo);
    return { enviado: false, motivo: motivo };
  },

  /** Convite de DUPLA: manda SÓ os identificadores. O servidor confere o convite
   *  gravado em `pairRequests` e monta o e-mail. */
  async sendPairInviteEmail(tournamentId, inviteeUid) {
    if (!tournamentId || !inviteeUid) return { enviado: false, motivo: 'sem-identificadores' };
    try {
      var r = await this._callFn('sendPairInviteEmail', {
        tournamentId: String(tournamentId), inviteeUid: String(inviteeUid)
      });
      return this._vereditoDoEnvio(r, 'convite-dupla');
    } catch (e) {
      window._warn('[convite-dupla] e-mail não saiu:', e && e.message);
      return { enviado: false, motivo: 'falha-de-rede' };
    }
  },

  /** Convite de CO-ORGANIZAÇÃO: idem, conferido contra a entrada `pending` em `coHosts`. */
  async sendCoHostInviteEmail(tournamentId, targetUid) {
    if (!tournamentId || !targetUid) return { enviado: false, motivo: 'sem-identificadores' };
    try {
      var r = await this._callFn('sendCoHostInviteEmail', {
        tournamentId: String(tournamentId), targetUid: String(targetUid)
      });
      return this._vereditoDoEnvio(r, 'convite-coorg');
    } catch (e) {
      window._warn('[convite-coorg] e-mail não saiu:', e && e.message);
      return { enviado: false, motivo: 'falha-de-rede' };
    }
  },

  // v2.1.19: e-mails de NOTIFICAÇÃO entram numa fila com janela por importância
  // (5/15/30 min). A Cloud Function flushNotifEmailDigest agrupa por destinatário
  // e manda UM e-mail consolidado por pessoa, evitando excesso de mensagens.
  // E-mails transacionais (verificação) NÃO passam por aqui — vão direto pro mail/.
  async queueNotifEmail(emails, level, message, opts) {
    if (!this.db || !emails || !emails.length) return;
    opts = opts || {};
    // v1.4.12 — BACKSTOP DO SANDBOX na ÚLTIMA porta antes do e-mail. O killswitch principal
    // é o _sendUserNotification/_notifyTournamentParticipants; este é a rede embaixo dele.
    // Um e-mail de SB que vaza chega em gente que nem sabe que o SB existe.
    // Ver [[project_sandbox_tournament]].
    if (/^\(SB\)/.test(String(opts.tournamentName || '')) || /_sb(\b|$)/.test(String(opts.tournamentUrl || ''))) {
      try { window._warn && window._warn('[sandbox] notif e-mail suprimido (queueNotifEmail)'); } catch (_e) {}
      return;
    }
    var WINDOWS = { fundamental: 5, important: 15, all: 30 }; // minutos
    var mins = (WINDOWS[level] != null) ? WINDOWS[level] : 30;
    var now = Date.now();
    try {
      for (var i = 0; i < emails.length; i++) {
        if (!emails[i]) continue;
        await this.db.collection('notif_email_queue').add({
          email: emails[i],
          level: level || 'all',
          message: message || '',
          tournamentName: opts.tournamentName || '',
          tournamentUrl: opts.tournamentUrl || '',
          ctaLabel: opts.ctaLabel || '',
          ctaUrl: opts.ctaUrl || '',
          createdAt: now,
          flushAtMs: now + mins * 60 * 1000
        });
      }
    } catch (e) {
      window._warn('Erro ao enfileirar notif email:', e);
    }
  },

  // ---- WhatsApp Queue (for future Cloud Function integration) ----

  // v1.2.9: queueWhatsAppTemplate + queueWhatsAppDigest REMOVIDOS. O número foi
  // banido, a apelação negada e o portfólio Meta está morto — não há canal pra
  // onde enfileirar. As coleções whatsapp_queue/whatsapp_digest_queue saíram
  // junto (rules + Cloud Functions). O WhatsApp que sobrou no produto é 100%
  // cliente: link wa.me e grupo criado pelo usuário (js/views/wa-group.js).
  // Ver project_whatsapp_meta_2fa_block.

  // ---- Templates ----

  async saveTemplate(uid, templateData) {
    if (!this.db || !uid) return null;
    try {
      var clean = this._cleanUndefined(templateData);
      var ref = await this.db.collection('users').doc(uid).collection('templates').add(clean);
      return ref.id;
    } catch (e) {
      window._error('Erro ao salvar template:', e);
      return null;
    }
  },

  async getTemplates(uid) {
    if (!this.db || !uid) return [];
    try {
      var snap = await this.db.collection('users').doc(uid).collection('templates').get();
      var templates = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._id = doc.id;
        templates.push(data);
      });
      // Sort client-side (newest first) — avoids Firestore index requirement
      templates.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return templates;
    } catch (e) {
      window._error('Erro ao carregar templates:', e);
      return [];
    }
  },

  async deleteTemplate(uid, templateId) {
    if (!this.db || !uid || !templateId) return;
    try {
      await this.db.collection('users').doc(uid).collection('templates').doc(templateId).delete();
    } catch (e) {
      window._error('Erro ao excluir template:', e);
    }
  },

  // ---- Casual Matches ----

  async saveCasualMatch(matchData) {
    if (!this.db) return null;
    try {
      var clean = this._cleanUndefined(matchData);
      var ref = await this.db.collection('casualMatches').add(clean);
      return ref.id;
    } catch (e) {
      window._error('Erro ao salvar partida casual:', e);
      return null;
    }
  },

  async loadCasualMatch(roomCode) {
    if (!this.db || !roomCode) return null;
    try {
      var snap = await this.db.collection('casualMatches')
        .where('roomCode', '==', roomCode).limit(1).get();
      if (snap.empty) return null;
      var doc = snap.docs[0];
      var data = doc.data();
      data._docId = doc.id;
      return data;
    } catch (e) {
      window._error('Erro ao carregar partida casual:', e);
      return null;
    }
  },

  // v1.3.32-beta: últimas N partidas casuais FINALIZADAS em que o user
  // participou (createdBy ou está em participants[].uid). Pra alimentar
  // a sessão "Últimas três partidas" no setup da partida casual.
  // Combina 2 queries (createdBy + participants array-contains-any) e
  // dedupa por _docId. Sem orderBy server-side pra evitar exigência de
  // índice composto — sort client-side por createdAt desc.
  async loadRecentCasualMatchesForUser(uid, limit) {
    if (!this.db || !uid) return [];
    var n = limit || 3;
    var out = {};
    try {
      // Query 1: matches que o user CRIOU.
      // Single-field query (sem composite index) — status filtrado client-side.
      // v1.6.65-beta: limit 30→200 — sem orderBy server-side, Firestore retorna
      // docs em ordem ascendente de doc-ID (≈ mais antigos primeiro). Com limit(30)
      // partidas recentes ficavam além do slice e nunca apareciam no histórico.
      // 200 cobre qualquer usuário beta confortavelmente; sort client-side por
      // createdAt desc já existia e continua sendo a fonte da ordenação final.
      var createdSnap = await this.db.collection('casualMatches')
        .where('createdBy', '==', uid)
        .limit(200).get();
      createdSnap.forEach(function(d) {
        var data = d.data();
        // v1.8.5-beta: também incluir docs com result.winner mesmo que
        // status não seja 'finished' (save pode ter falhado na transição).
        if (data.status !== 'finished' && !(data.result && data.result.winner)) return;
        data._docId = d.id;
        out[d.id] = data;
      });
    } catch (e) {
      window._warn('loadRecentCasualMatchesForUser createdBy err:', e);
    }

    // Query 2: array-contains em playerUids (denormalizado em
    // saveCasualMatch + joinCasualMatch — array de uids puros).
    // Single-field query (sem composite index) — status filtrado client-side.
    try {
      var partSnap = await this.db.collection('casualMatches')
        .where('playerUids', 'array-contains', uid)
        .limit(200).get();
      partSnap.forEach(function(d) {
        if (out[d.id]) return; // dedup
        var data = d.data();
        // v1.8.5-beta: idem — incluir docs com result.winner mesmo sem status:'finished'
        if (data.status !== 'finished' && !(data.result && data.result.winner)) return;
        data._docId = d.id;
        out[d.id] = data;
      });
    } catch (e) {
      window._warn('loadRecentCasualMatchesForUser participants err:', e);
    }

    // Sort client-side by finishedAt desc (fallback: createdAt), take N most recent.
    // v1.7.6-beta: ISO strings converted to ms before subtraction (NaN-safe).
    // v1.8.5-beta: prefer finishedAt over createdAt — "most recently finished"
    // is more intuitive than "most recently created" for last-played ordering.
    var arr = Object.keys(out).map(function(k) { return out[k]; });
    arr.sort(function(a, b) {
      var ta = a.finishedAt || a.createdAt || a._ts || 0;
      var tb = b.finishedAt || b.createdAt || b._ts || 0;
      if (ta && typeof ta.toMillis === 'function') ta = ta.toMillis();
      else if (ta && typeof ta === 'string') ta = new Date(ta).getTime() || 0;
      if (tb && typeof tb.toMillis === 'function') tb = tb.toMillis();
      else if (tb && typeof tb === 'string') tb = new Date(tb).getTime() || 0;
      return tb - ta;
    });
    return arr.slice(0, n);
  },

  async updateCasualMatch(docId, updates) {
    if (!this.db || !docId) return;
    try {
      var clean = this._cleanUndefined(updates);
      await this.db.collection('casualMatches').doc(docId).update(clean);
    } catch (e) {
      window._error('Erro ao atualizar partida casual:', e);
    }
  },

  async claimCasualSlot(docId, slotIndex, uid, displayName) {
    if (!this.db || !docId) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      var self = this;
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var players = Array.isArray(data.players) ? data.players.slice() : [];
        if (slotIndex < 0 || slotIndex >= players.length) return false;
        if (players[slotIndex].uid) return false; // Already claimed
        // Check user hasn't already claimed another slot
        var alreadyClaimed = players.some(function(p) { return p.uid === uid; });
        if (alreadyClaimed) return false;
        players[slotIndex] = Object.assign({}, players[slotIndex], { uid: uid, displayName: displayName });
        // v1.9.61: mantém playerUids em sincronia. Antes claimCasualSlot só
        // mexia em players → o uid não entrava em playerUids, quebrando o
        // auto-dissolve (sala morria com gente dentro) e o histórico durante a
        // fase ativa (a query de "últimas partidas" filtra por playerUids).
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        if (playerUids.indexOf(uid) === -1) playerUids.push(uid);
        transaction.update(docRef, { players: players, playerUids: playerUids });
        return true;
      });
    } catch (e) {
      window._error('Erro ao reservar vaga casual:', e);
      return false;
    }
  },

  // Join a casual match — add user to participants list (idempotent)
  // Join a casual match — add user to participants list (idempotent)
  async joinCasualMatch(docId, uid, displayName, photoURL) {
    if (!this.db || !docId || !uid) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var participants = Array.isArray(data.participants) ? data.participants.slice() : [];
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        var players = Array.isArray(data.players) ? data.players : [];

        // ⭐ 2.0.5 — A MESMA PESSOA NÃO ENTRA DUAS VEZES. Relato do dono, com print: ele
        // aparecia nos DOIS times da partida casual (slot 1 e slot 3), e os pares vazios
        // viravam "Jogador 2"/"Jogador 4". Os slots da tela saem de `participants`.
        //
        // 🔴 A CAUSA: o guarda de "já entrei?" olhava SÓ `playerUids`. Mas a sala guarda a
        // mesma informação em TRÊS lugares — `participants`, `playerUids` e `players` — e o
        // próprio arquivo já documenta que elas dessincronizam (ver leaveCasualMatch: "docs
        // legados podem ter uid só em players; claim-slot não populava playerUids"). Numa
        // sala assim o guarda passava batido e empurrava a pessoa em `participants` de novo.
        // Identidade é uid, e a pergunta tem que ser feita nas três listas — não em uma.
        var _souEu = function (x) { return x && x.uid === uid; };
        var jaEstou = playerUids.indexOf(uid) !== -1 || participants.some(_souEu) || players.some(_souEu);

        // Toda gravação passa por aqui: DEDUPLICA por uid e CURA a divergência. Sala que já
        // nasceu com a pessoa repetida (é o caso do print) se conserta sozinha na próxima
        // entrada, sem migração — e sem apagar quem não tem conta, cujo slot é o nome.
        var _vistos = {};
        participants = participants.filter(function (x) {
          if (!x || !x.uid) return true;
          if (_vistos[x.uid]) return false;
          _vistos[x.uid] = true;
          return true;
        });

        if (jaEstou) {
          if (playerUids.indexOf(uid) === -1) playerUids.push(uid);
          if (!participants.some(_souEu)) {
            participants.push({ uid: uid, displayName: displayName || '', photoURL: photoURL || '', joinedAt: new Date().toISOString() });
          }
          transaction.update(docRef, { participants: participants, playerUids: playerUids });
          return true;
        }

        participants.push({ uid: uid, displayName: displayName || '', photoURL: photoURL || '', joinedAt: new Date().toISOString() });
        playerUids.push(uid);
        transaction.update(docRef, { participants: participants, playerUids: playerUids });
        return true;
      });
    } catch (e) {
      window._error('Erro ao entrar na partida casual:', e);
      return false;
    }
  },

  // Cancel a casual match — delete the document so lingering participants are kicked out.
  // Called when the organizer closes the setup overlay before the match starts.
  async cancelCasualMatch(docId) {
    if (!this.db || !docId) return false;
    try {
      // v1.9.61: NUNCA apagar um registro finalizado. Bug: após "Jogar
      // Novamente" (keepSession), _sessionDocId aponta pro doc finished; se o
      // usuário sai do setup sem iniciar nova partida, o caminho "solo" do
      // _casualLeaveMatch chamava cancelCasualMatch(_sessionDocId) e DELETAVA a
      // última partida do histórico. Finished = registro permanente.
      var ref = this.db.collection('casualMatches').doc(docId);
      var snap = await ref.get();
      if (snap.exists && snap.data() && snap.data().status === 'finished') {
        window._warn('cancelCasualMatch: ignorando delete de partida finalizada', docId);
        return false;
      }
      await ref.delete();
      return true;
    } catch (e) {
      window._error('Erro ao cancelar partida casual:', e);
      return false;
    }
  },

  // Leave a casual match — remove user from participants, playerUids and release any claimed slot
  async leaveCasualMatch(docId, uid) {
    if (!this.db || !docId || !uid) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var participants = Array.isArray(data.participants) ? data.participants.slice() : [];
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        var players = Array.isArray(data.players) ? data.players.slice() : [];
        participants = participants.filter(function(p) { return p.uid !== uid; });
        playerUids = playerUids.filter(function(u) { return u !== uid; });
        // Release any slot this user had claimed so another player can take it
        // v1.6.25-beta: também apaga `name` e `team` — antes só removia
        // uid/displayName/photoURL, então `name` ficava como "Rodrigo" no
        // slot mesmo após o user sair. Outros clientes faziam polling, viam
        // o name persistido e mantinham "Rodrigo" no input do slot.
        // Agora o slot fica TOTALMENTE livre quando o user sai.
        players = players.map(function(p) {
          if (p && p.uid === uid) {
            // Preserva apenas `slot` — todo o resto vira default (slot livre)
            return { slot: p.slot };
          }
          return p;
        });
        // Auto-dissolução (v1.9.60): a sala vive enquanto houver ≥1 usuário
        // CADASTRADO (uid) — não importa se é o criador ou não. Quando o último
        // uid sai (sobram só nomes digitados sem conta, ou ninguém), a sala se
        // dissolve. Registros finalizados (status=finished) nunca são apagados
        // aqui (são histórico). Regra do dono: "enquanto houver 1 cadastrado a
        // sala persiste; quando todos sairem, é dissolvida".
        // v1.9.61: conta uids de AMBAS as fontes (playerUids ∪ players[].uid) —
        // docs legados podem ter uid só em players (claim-slot não populava
        // playerUids), e dissolver só por playerUids mataria sala com gente.
        // v2.1.76: a sala vive enquanto houver ≥1 PESSOA DE VERDADE no lobby —
        // um slot OCUPADO (players[].uid). Antes contava também `playerUids`, que
        // dessincroniza (sala-fantasma com players=[] mas playerUids=[uid] ficava
        // viva pra sempre). Agora dissolve assim que o último slot ocupado some.
        var _hasOccupant = players.some(function(p) { return p && p.uid; });
        if (!_hasOccupant && data.status !== 'finished') {
          transaction.delete(docRef);
          return 'dissolved';
        }
        transaction.update(docRef, { participants: participants, playerUids: playerUids, players: players });
        return true;
      });
    } catch (e) {
      window._error('Erro ao sair da partida casual:', e);
      return false;
    }
  },

  async loadUserCasualMatches(uid) {
    if (!this.db || !uid) return [];
    try {
      var snap = await this.db.collection('casualMatches')
        .where('playerUids', 'array-contains', uid)
        .where('status', '==', 'finished')
        .get();
      var matches = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._docId = doc.id;
        matches.push(data);
      });
      matches.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return matches;
    } catch (e) {
      window._error('Erro ao carregar partidas casuais:', e);
      return [];
    }
  },

  // ── User match history (persistent per-user stats across casual + tournament) ──
  // Writes one copy of the match record into each registered player's profile
  // subcollection so the record survives deletion of the original tournament
  // or casual match document.
  async saveUserMatchRecords(record) {
    if (!this.db || !record || !Array.isArray(record.players)) return false;
    var self = this;
    var clean = self._cleanUndefined(record);
    var recordId = clean.matchId || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    clean.matchId = recordId;
    var writers = [];
    for (var i = 0; i < clean.players.length; i++) {
      (function(p) {
        if (!p || !p.uid) return;
        writers.push((async function() {
          try {
            await self.db.collection('users').doc(p.uid)
              .collection('matchHistory').doc(recordId)
              .set(clean, { merge: true });
          } catch (e) { window._warn('saveUserMatchRecords for', p.uid, 'failed', e); }
        })());
      })(clean.players[i]);
    }
    try { await Promise.all(writers); return true; } catch (e) { return false; }
  },

  async loadUserMatchHistory(uid, options) {
    if (!this.db || !uid) return [];
    options = options || {};
    try {
      var q = this.db.collection('users').doc(uid).collection('matchHistory');
      if (options.matchType) q = q.where('matchType', '==', options.matchType);
      q = q.orderBy('finishedAt', 'desc');
      if (options.limit) q = q.limit(options.limit);
      var snap = await q.get();
      var out = [];
      // v1.8.93: PARTIDA EM RAJADA NÃO ENTRA. Filtrar aqui, na origem, é o que faz a
      // regra valer nos QUATRO consumidores do histórico (pill da tela inicial, ficha
      // do jogador, tela de histórico, Análise de Inscritos) sem que nenhum precise
      // saber dela. Ver `window._isPartidaEmRajada` (store.js) para o critério e o
      // porquê — resumidamente: 6-0 em 12 segundos é teste, e contá-lo é a porta pra
      // inflar aproveitamento ("assim evitamos manipulacoes nos dados").
      var _rajada = (typeof window !== 'undefined' && typeof window._isPartidaEmRajada === 'function')
        ? window._isPartidaEmRajada : null;
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        if (_rajada && _rajada(d)) return;   // descartada: não é jogo disputado
        out.push(d);
      });
      return out;
    } catch (e) {
      // v1.7.51 — RECUSA NÃO É LISTA VAZIA. `users/{uid}/matchHistory` agora é lido
      // conforme o `statsVisibility` da própria pessoa, então "não posso ver" virou um
      // desfecho legítimo — e devolver `[]` aqui fazia a ficha desenhar a grade ZERADA,
      // idêntica a "nunca jogou". Card que mente é pior que card que não existe.
      // `null` = sem permissão (quem chama mostra "estatísticas privadas");
      // `[]`   = permitido e realmente sem jogos.
      if (e && e.code === 'permission-denied') {
        window._warn('[matchHistory] sem permissão para ' + uid + ' (statsVisibility)');
        return null;
      }
      window._error('Erro ao carregar histórico de partidas:', e);
      return [];
    }
  }
};
