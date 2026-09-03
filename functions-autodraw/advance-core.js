/* ═══ ADVANCE-CORE — A REGRA DO AVANÇO DE FASE, PURA E TESTÁVEL ═══════════════════════
 *
 * ⛔ POR QUE ISTO É UM MÓDULO SEPARADO, e não código dentro do `index.js`:
 * `functions-autodraw/index.js` não é `require`-ável em teste — ele registra `onCall` e lê
 * segredos no import. O CLAUDE.md do repo é explícito: "toda regra que dói errar mora num
 * módulo puro, com teste exercitando o CÓDIGO REAL — não uma réplica, que já deixou suíte
 * verde com o index revertido". Aqui moram: revisão, decisões, carimbo determinístico,
 * invariantes e recibo. O `index.js` fica com authz, transação e resposta.
 *
 * ⛔ E É PURO DE VERDADE: nada aqui chama `Date.now()`, `new Date()`, `Math.random()`, gera
 * id automático, toca `tx` ou lê global mutável. Todo instante e toda aleatoriedade entram
 * por argumento — porque o callback de uma transação do Firestore é RE-EXECUTADO no retry,
 * e o que varia entre tentativas produz plano diferente a cada volta.
 */
'use strict';

const crypto = require('crypto');

/* ─────────────────────────────────────────────────────────────────────────────────────
 * 1. DENYLIST — o que NÃO entra no hash de revisão
 *
 * ⭐ O DESENHO É INVERTIDO DE PROPÓSITO. A primeira versão listava os campos que o motor
 * lê (allowlist) e foi recusada na revisão, com razão: uma allowlist erra por OMISSÃO, e o
 * erro é silencioso — o token diz "nada mudou" e o motor produz outro resultado. Aqui se
 * hasheia o torneio INTEIRO menos uma lista pequena e PROVADA. Campo novo do motor entra
 * sozinho, sem ninguém lembrar.
 *
 * ⛔ REGRA DE ENTRADA NESTA LISTA: só sai do hash quem tem prova, por leitura de código, de
 * que não afeta quem classifica, a ordem, a composição ou os ids da fase seguinte.
 * "Parece irrelevante" não basta. Falso conflito custa ao organizador reabrir o painel;
 * falso sucesso materializa uma fase sobre estado que mudou.
 * As provas estão no desenho v4 §1.3 (varredura read-only de 02/set/2026, HEAD dea9c710).
 * ───────────────────────────────────────────────────────────────────────────────────── */
const DENYLIST = [
  // carimbos de escrita — nenhum leitor no caminho
  'updatedAt', 'lastModified',
  // presença — zero leituras no caminho do avanço
  'checkedIn', 'absent', 'checkedInConfirmed', 'vips',
  // vitrine e metadados
  'name', 'description', 'image', 'logo', 'coverPhoto', 'status', 'startDate',
  'venue', 'venueName', 'venueLat', 'venueLng', 'venueId', 'venuePlaceId',
  // agenda/janela: `_limitesDasRodadas` (round-bounds-core.js:100) só é chamado por
  // tournaments-utils.js:1437/1531 e create-tournament.js:4672 — nenhum no caminho
  'roundBounds',
  // o `faux` de `_phaseGenNextLeagueRound` (bracket-logic.js:5514-5528) não carrega estes,
  // então o topo do documento nunca chega ao motor de Liga incremental
  'teamSize', 'enrollmentMode', 'combinedCategories', 'skillCategories',
  'scoring', 'equilibrado', 'clusterSize',
  // bracket-model.js:533-541 retorna antes de testar
  'storageCanonico',
  // telemetria de aviso
  'notifications', 'notifyLog', 'notifiedAt', 'notifyCount', '_finishNotified',
  'pollNotifications', 'polls', 'activePollId', 'opinionPolls',
  // por desenho não persiste (store.js:4541-4556)
  '_phaseResInfo',
  // do JOGO: só exibição/derivado
  'label', 'tierLabel', '_sig', '_gameNum',
  'p1FromBye', 'p2FromBye', 'p1PromotedFromLower', 'p2PromotedFromLower',
  'waGroup', 'schedule', 'scheduledAt', 'scheduledBy', 'scheduledKind',
  // do GRUPO: rótulo e carimbo sem leitor (comentário bracket-logic.js:281 é explícito)
  'classifCongeladaAt',
  // do PARTICIPANTE: nenhum leitor no caminho
  'phone', 'phoneFull', 'photoURL', 'letzplayHandle'
];

/* Chaves que identificam uma ENTIDADE dentro de um array, para ordenação canônica. */
const CHAVE_DE_ENTIDADE = ['id', 'uid', '_chave'];

/* Arrays cuja ORDEM é semântica — nunca reordenar (posição carrega significado). */
const ARRAYS_POSICIONAIS = [
  'sets', 'mapping', 'phases', 'players', 'playersUids', 'playersSlotIds',
  'team1', 'team2', 'team1Uids', 'team2Uids', 'team1SlotIds', 'team2SlotIds',
  'classifCongelada', 'standings', 'tiebreakers', 'rounds', 'repFill'
];

const TETO_PROFUNDIDADE = 40;
const TETO_NOS = 400000;

function _ehObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function _normalizaNumero(n) {
  if (!isFinite(n)) throw new ErroRevisao('revisao-invalida', 'número não finito no torneio');
  if (Object.is(n, -0)) return 0;
  return n;
}

function ErroRevisao(codigo, msg, extra) {
  const e = new Error(msg);
  e.codigo = codigo;
  if (extra) Object.assign(e, extra);
  return e;
}

/* ── omitirRecursivo + canonicalJSON ──────────────────────────────────────────────────
 * Serialização estável. NUNCA depende da ordem em que o Firestore devolveu nada.
 */
function canonicalJSON(valor, opts) {
  const o = opts || {};
  const deny = new Set(o.denylist || DENYLIST);
  let nos = 0;

  function serializa(v, prof, caminho) {
    if (++nos > TETO_NOS) throw ErroRevisao('revisao-grande', 'torneio excede o teto de nós para hash');
    if (prof > TETO_PROFUNDIDADE) throw ErroRevisao('revisao-profunda', 'profundidade excede o teto em ' + caminho);

    if (v === undefined) return undefined;                 // omitido, nunca vira null
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') return JSON.stringify(_normalizaNumero(v));
    if (t === 'string') return JSON.stringify(v);
    if (t === 'function') return undefined;

    /* Timestamp do Firestore e Date → ISO-8601 UTC, para o hash não depender do formato */
    if (v && typeof v.toDate === 'function') return JSON.stringify(v.toDate().toISOString());
    if (v instanceof Date) return JSON.stringify(v.toISOString());

    if (Array.isArray(v)) {
      const itens = [];
      for (let i = 0; i < v.length; i++) {
        const s = serializa(v[i], prof + 1, caminho + '[' + i + ']');
        itens.push(s === undefined ? 'null' : s);          // buraco em array é posição
      }
      return '[' + itens.join(',') + ']';
    }

    if (_ehObjeto(v)) {
      const chaves = Object.keys(v).filter((k) => !deny.has(k)).sort();
      const partes = [];
      for (let i = 0; i < chaves.length; i++) {
        const k = chaves[i];
        let val = v[k];
        if (Array.isArray(val) && ARRAYS_POSICIONAIS.indexOf(k) === -1) {
          val = _ordenaEntidades(val, prof, caminho + '.' + k, deny);
        }
        const s = serializa(val, prof + 1, caminho + '.' + k);
        if (s !== undefined) partes.push(JSON.stringify(k) + ':' + s);
      }
      return '{' + partes.join(',') + '}';
    }
    return undefined;
  }

  /* Ordena array de ENTIDADE por chave canônica; empate desempata pelo próprio
   * canonicalJSON do elemento. Chave repetida com conteúdo DIFERENTE falha fechada —
   * é o caso do id duplicado, que os invariantes também querem barrar. */
  function _ordenaEntidades(arr, prof, caminho, deny2) {
    if (!arr.length || !arr.every(_ehObjeto)) return arr;
    let campoChave = null;
    for (const c of CHAVE_DE_ENTIDADE) {
      if (arr.every((x) => x[c] !== undefined && x[c] !== null && x[c] !== '')) { campoChave = c; break; }
    }
    const decorado = arr.map((x, i) => {
      const s = serializa(x, prof + 1, caminho + '[#' + i + ']');
      return { x: x, s: (s === undefined ? 'null' : s), k: campoChave ? String(x[campoChave]) : null };
    });
    if (campoChave) {
      const vistos = new Map();
      for (const d of decorado) {
        if (vistos.has(d.k) && vistos.get(d.k) !== d.s) {
          throw ErroRevisao('revisao-ambigua',
            'duas entidades com a mesma chave "' + d.k + '" e conteúdo diferente em ' + caminho,
            { caminho: caminho, chave: d.k });
        }
        vistos.set(d.k, d.s);
      }
    }
    decorado.sort((a, b) => {
      if (a.k !== null && b.k !== null && a.k !== b.k) return a.k < b.k ? -1 : 1;
      return a.s < b.s ? -1 : (a.s > b.s ? 1 : 0);
    });
    return decorado.map((d) => d.x);
  }

  const raiz = _ehObjeto(valor) || Array.isArray(valor) ? valor : { v: valor };
  const s = serializa(raiz, 0, '$');
  if (s === undefined) throw ErroRevisao('revisao-invalida', 'valor não serializável na raiz');
  return s;
}

function sha256_16(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 32);
}

/* ── revisionOf ───────────────────────────────────────────────────────────────────────
 * V = { t: <torneio REMONTADO: raiz + todas as partes de _semPesados>,
 *       nameByUid: <o MAPA que o motor usará NESTA invocação> }
 *
 * ⭐ O MAPA ENTRA NO HASH, e essa é a correção mais importante da revisão. A varredura
 * provou que o `name` da linha de classificação vem do PERFIL VIVO
 * (`window._displayNameForUid`, draw-core.js:79 → bracket-logic.js:106-107,:143 e
 * phases-engine.js:57), e que esse nome é a CHAVE do `smap` de `_groupTeamStandings`
 * (phases-engine.js:1684). Um hash só do documento NÃO VÊ um rename de perfil que muda a
 * classificação — falso sucesso garantido. Com o mapa dentro, renomear alguém do torneio
 * invalida o token; renomear quem não está nele, não.
 */
function revisionOf(V, opts) {
  if (!V || !V.t) throw ErroRevisao('revisao-invalida', 'revisionOf exige { t, nameByUid }');
  const alvo = { t: V.t, nameByUid: V.nameByUid || {} };
  return 'v1.' + sha256_16(canonicalJSON(alvo, opts));
}

/* ── carimbo determinístico ───────────────────────────────────────────────────────────
 * Mesma operação ⇒ mesmo carimbo ⇒ mesmos ids, em qualquer retry e em qualquer máquina.
 * É o que substitui o `Date.now()` que hoje entra no id dos jogos da dupla eliminação
 * (tournaments-draw.js:2998, usado em :3018/:3063/:3089/:3121/:3146) e da repescagem.
 */
function stampDe(operationId, tournamentId, toPhaseIndex) {
  return sha256_16(String(operationId) + '|' + String(tournamentId) + '|' + String(toPhaseIndex));
}

/* inteiro estável derivado do carimbo — ocupa o lugar do `Date.now()` nos ids */
function tsDe(stamp) {
  return parseInt(String(stamp).slice(0, 12), 16);
}

/* PRNG determinístico (xorshift128), semeado pelo carimbo. Substitui `Math.random()` nos
 * embaralhadores alcançáveis pelo avanço. */
function prngDe(stamp) {
  let a = parseInt(String(stamp).slice(0, 8), 16) || 1;
  let b = parseInt(String(stamp).slice(8, 16), 16) || 2;
  let c = parseInt(String(stamp).slice(16, 24), 16) || 3;
  let d = parseInt(String(stamp).slice(24, 32), 16) || 4;
  return function () {
    const t = a ^ (a << 11);
    a = b; b = c; c = d;
    d = (d ^ (d >>> 19)) ^ (t ^ (t >>> 8));
    return ((d >>> 0) / 4294967296);
  };
}

/* ── operationId ──────────────────────────────────────────────────────────────────────
 * UUID v4 ESTRITO. Um por INTENÇÃO — timeout repete o mesmo, nunca gera outro. */
const RE_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validaOperationId(v) {
  if (typeof v !== 'string' || !RE_UUID_V4.test(v)) {
    throw ErroRevisao('operacao-invalida', 'operationId deve ser um UUID v4');
  }
  return v.toLowerCase();
}

/* ── DECISÕES ─────────────────────────────────────────────────────────────────────────
 * ⛔ ENTRADA HOSTIL, mesmo vinda de administrador. A CF DERIVA as pendências do documento
 * FRESCO e só aceita decisão que corresponda a elas. Decisão não introduz participante,
 * jogo, seed nem placar — ela só escolhe entre alternativas que o servidor ofereceu.
 *
 * ⭐ E DECISÃO VIAJA NO PAYLOAD, NUNCA PELO DOCUMENTO. Hoje `_promoteLines`/`_promoteAsked`
 * chegam por `saveTournament` fire-and-forget (tournaments-draw-prep.js:1204/:1217) com o
 * avanço na linha seguinte, e `_includeInactive` nunca é persistido — o que faz o estado
 * local e o fresco divergirem por construção. Com a decisão no payload, isso some.
 */
const ESCOLHAS_INATIVOS = ['manter', 'espera', 'excluir'];

function derivaPendencias(t, deps) {
  const w = (deps && deps.window) || {};
  const inativos = (typeof w._phasePendingInactives === 'function') ? (w._phasePendingInactives(t) || []) : [];
  const wo = (typeof w._phaseWoDeactivated === 'function') ? (w._phaseWoDeactivated(t) || []) : [];
  const idDe = (p) => (p && (p.uid || p.p1Uid || p.displayName || p.name)) || null;
  return {
    inativos: inativos.map(idDe).filter(Boolean).sort(),
    wo: wo.map(idDe).filter(Boolean).sort(),
    precisaDecidirInativos: inativos.length > 0,
    mostraWo: wo.length > 0
  };
}

function validaDecisoes(decisions, pend, opts) {
  const d = decisions || {};
  const out = {};
  const erro = (m) => { throw ErroRevisao('decisao-invalida', m); };

  if (typeof d !== 'object' || Array.isArray(d)) erro('decisions deve ser um objeto');

  const chavesConhecidas = ['inativos', 'promoteLines', 'bracketResolution', 'swissRounds'];
  Object.keys(d).forEach((k) => { if (chavesConhecidas.indexOf(k) === -1) erro('decisão desconhecida: ' + k); });

  if (pend.precisaDecidirInativos) {
    if (typeof d.inativos !== 'string') erro('decisions.inativos é obrigatório quando há inativos');
    if (ESCOLHAS_INATIVOS.indexOf(d.inativos) === -1) erro('decisions.inativos inválido: ' + d.inativos);
    out.inativos = d.inativos;
  } else if (d.inativos !== undefined) {
    erro('decisions.inativos veio sem pendência de inativos no estado fresco');
  }

  if (d.promoteLines !== undefined) {
    const n = d.promoteLines;
    if (!Number.isInteger(n) || n < 0 || n > 4) erro('decisions.promoteLines inválido');
    out.promoteLines = n;
  }
  if (d.bracketResolution !== undefined) {
    if (['bye', 'playin', 'waitlist'].indexOf(d.bracketResolution) === -1) erro('decisions.bracketResolution inválido');
    out.bracketResolution = d.bracketResolution;
  }
  if (d.swissRounds !== undefined) {
    const n = d.swissRounds;
    if (!Number.isInteger(n) || n < 1 || n > 30) erro('decisions.swissRounds inválido');
    out.swissRounds = n;
  }
  return out;
}

function decisionsHash(decisoesValidadas) {
  return sha256_16(canonicalJSON(decisoesValidadas || {}, { denylist: [] }));
}

/* ── INVARIANTES — falha FECHADA antes de qualquer escrita ────────────────────────────
 * ⛔ Nada de "conserta enquanto avança": um torneio incoerente é recusado, não remendado.
 */
function verificaInvariantes(t, opts) {
  const o = opts || {};
  const problemas = [];
  const fora = Array.isArray(t._semPesados) ? t._semPesados : [];

  /* Coleta com CAMINHO: o erro de duplicata tem de dizer ONDE, senão vira caça ao tesouro. */
  const jogos = [];
  const colhe = (arr, caminho) => {
    (arr || []).forEach((m, i) => { if (m) jogos.push({ m: m, caminho: caminho + '[' + i + ']' }); });
  };
  colhe(t.matches, 't.matches');
  (t.rounds || []).forEach((r, ri) => { colhe(r && r.matches, 't.rounds[' + ri + '].matches'); });
  (t.groups || []).forEach((g, gi) => { colhe(g && g.matches, 't.groups[' + gi + '].matches'); });
  Object.keys(t.phaseRounds || {}).forEach((k) => {
    ((t.phaseRounds[k] || {}).rounds || []).forEach((r, ri) => {
      colhe(r && r.matches, 't.phaseRounds[' + k + '].rounds[' + ri + '].matches');
    });
  });

  /* ⛔ POLÍTICA DE DUPLICATA, DEFINIDA E TESTADA — não é detalhe de implementação.
   *
   * A primeira versão disto tinha um `if/else` cujos DOIS ramos faziam a mesma coisa, então
   * a duplicata nunca era reportada: `porId.size` mentia por construção. Registrado porque
   * a lição é a mesma de sempre — rede que não é exercitada não é rede.
   *
   * A REGRA:
   *  · o MESMO objeto alcançado por vários caminhos de coleta (t.matches e
   *    rounds[].matches compartilham referência depois de `_hydrateMonarchGroups`) é
   *    DEDUPLICADO POR IDENTIDADE — é um jogo só, visto duas vezes;
   *  · dois objetos DISTINTOS com o mesmo id são ERRO, e o erro diz o id e os caminhos.
   *    Nunca se escolhe um "vencedor": é ambiguidade de identidade, e `revisionOf` também
   *    a recusa (revisao-ambigua). */
  const porId = new Map();      // id -> { obj, caminhos: [] }
  const duplicados = [];
  jogos.forEach((reg) => {
    const m = reg.m, caminho = reg.caminho;
    if (m.id == null || m.id === '') { problemas.push('jogo sem id em ' + caminho); return; }
    const k = String(m.id);
    const ja = porId.get(k);
    if (!ja) { porId.set(k, { obj: m, caminhos: [caminho] }); return; }
    if (ja.obj === m) { ja.caminhos.push(caminho); return; }   // mesma referência: um jogo só
    ja.caminhos.push(caminho);
    duplicados.push({ id: k, caminhos: ja.caminhos.slice() });
  });
  duplicados.forEach((d) => {
    problemas.push('id de jogo duplicado em objetos distintos: "' + d.id +
                   '" aparece em ' + d.caminhos.join(' e '));
  });

  if (fora.indexOf('matches') !== -1 && t._nJogos != null) {
    /* ⛔ NUNCA usar `porId.size` sozinho como prova de ausência de duplicata — ele conta
     * CHAVES, e duas chaves iguais colapsam. A prova de duplicata é a lista acima. */
    const unicos = new Set();
    jogos.forEach((reg) => { if (reg.m.id != null && reg.m.id !== '') unicos.add(reg.m); });
    if (Number(t._nJogos) !== unicos.size) {
      problemas.push('_nJogos=' + t._nJogos + ' diverge da contagem real (' + unicos.size + ' jogos distintos)');
    }
    if (Array.isArray(t.matches) && t.matches.length && fora.indexOf('matches') !== -1) {
      problemas.push('parte pesada no lugar errado: t.matches tem ' + t.matches.length +
                     ' itens num torneio cujo marcador diz que "matches" mora fora');
    }
  }
  fora.forEach((nome) => {
    if (nome === 'matches') return;
    const v = t[nome];
    if (v === undefined) problemas.push('parte "' + nome + '" ausente depois da remontagem');
  });

  /* referência quebrada na fiação da chave */
  const ids = new Set(Array.from(porId.keys()));
  jogos.forEach((reg) => {
    const m = reg.m;
    ['nextMatchId', 'loserMatchId', 'loserNextMatchId'].forEach((c) => {
      if (m[c] && !ids.has(String(m[c]))) problemas.push('jogo ' + m.id + ' aponta ' + c + '=' + m[c] + ' inexistente');
    });
  });

  if (o.exigeFaseCompleta && typeof o.phaseComplete === 'function' && !o.phaseComplete(t)) {
    problemas.push('fase atual incompleta no estado fresco');
  }
  return problemas;
}

/* ── RECIBO ───────────────────────────────────────────────────────────────────────────
 * Escrito DENTRO da mesma transação, como operação do plano. Existe ⇔ o avanço commitou.
 * "Em andamento" não tem representação persistida de propósito: ausência de recibo é
 * "não commitou", nunca "está rodando".
 */
function montaRecibo(dados) {
  return {
    operationId: dados.operationId,
    tournamentId: dados.tournamentId,
    fromPhaseIndex: dados.fromPhaseIndex,
    toPhaseIndex: dados.toPhaseIndex,
    revisaoAntes: dados.revisaoAntes,
    revisaoDepois: dados.revisaoDepois,
    decisionsHash: dados.decisionsHash,
    decisionsDivergentesDoDoc: dados.decisionsDivergentesDoDoc || null,
    resultado: {
      jogosCriados: dados.jogosCriados,
      idsHash: dados.idsHash,
      partesTocadas: dados.partesTocadas || [],
      totaisDoPlano: dados.totaisDoPlano || null
    },
    autorUid: dados.autorUid,
    criadoEm: dados.criadoEm,
    versaoFuncao: dados.versaoFuncao
  };
}

function idsHashDe(jogos) {
  const ids = (jogos || []).map((m) => String((m && m.id) || '')).filter(Boolean).sort();
  return sha256_16(ids.join('|'));
}

function eventoOutbox(dados) {
  return {
    id: 'adv-' + dados.tournamentId + '-' + dados.toPhaseIndex + '-' + dados.operationId,
    doc: {
      tipo: 'new_phase',
      tournamentId: dados.tournamentId,
      fromPhaseIndex: dados.fromPhaseIndex,
      toPhaseIndex: dados.toPhaseIndex,
      operationId: dados.operationId,
      revisaoDepois: dados.revisaoDepois,
      criadoEm: dados.criadoEm,
      versaoFuncao: dados.versaoFuncao
    }
  };
}

module.exports = {
  DENYLIST, ARRAYS_POSICIONAIS,
  canonicalJSON, sha256_16, revisionOf,
  stampDe, tsDe, prngDe,
  validaOperationId,
  derivaPendencias, validaDecisoes, decisionsHash,
  verificaInvariantes,
  montaRecibo, idsHashDe, eventoOutbox,
  ErroRevisao
};
