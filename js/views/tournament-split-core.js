/* TRADUÇÃO DO TORNEIO: documento único ⇄ documento + subcoleções.
 *
 * POR QUE ISTO EXISTE (medido em 25/ago/2026, base REAL):
 *   · documento do Confra: 236 KB — `rounds` 101 KB, `participants` 36 KB,
 *     `history` 33 KB, `standings` 12,5 KB, `opponentHistory` 13 KB.
 *   · o Firestore RECUSA documento acima de 1 MB.
 *   · custo unitário: 255 B por inscrito, 925 B por jogo ⇒ o app tem TETO em ~4× o
 *     Confra. Torneio de 700 pessoas NÃO PODE SER GRAVADO. Não é lentidão.
 *   · e cada placar lançado reescreve os 236 KB inteiros.
 * Ver docs/ARQUITETURA-DE-DADOS.md.
 *
 * ⛔ A REGRA DESTE MÓDULO, E ELE INTEIRO EXISTE PRA ISSO:
 *   **`remontar(dividir(t))` tem que devolver `t` IDÊNTICO.**
 * Não "equivalente", não "quase": idêntico, campo por campo, na mesma ORDEM. É essa
 * propriedade que permite ligar a escrita nos dois bancos sem medo — se a volta é
 * exata, o banco novo é uma REPRESENTAÇÃO do velho, não uma reinterpretação dele.
 * Provado em tests/traducao-do-torneio-nao-perde-nada.test.js contra os 39 torneios
 * reais, o Confra incluído.
 *
 * ⚠️ OS JOGOS MORAM EM TRÊS LUGARES (medido na base real):
 *     t.rounds[ri].matches[mi]              ← 112 jogos (Confra)
 *     t.matches[mi]                         ←  54 jogos (demais)
 *     t.phaseRounds[fase].rounds[ri].matches[mi]  ← 0 hoje, mas o motor escreve
 *   Cada jogo extraído leva `_loc`, que diz de ONDE veio. Sem isso a volta não é
 *   fiel: o mesmo jogo em `rounds` ou em `matches` muda o comportamento da tela
 *   (ver [[project_phase_inactive_resolution]] e o leitor único `phaseGames`).
 */
(function (raiz) {
  'use strict';

  // Campos que saem do documento e viram subcoleção. ⛔ `standings` NÃO entra aqui:
  // ele é DERIVADO e vai ser recalculado no servidor (fase 3) — sair antes disso
  // quebraria a classificação congelada, que é dado com valor jurídico no torneio.
  /* ⭐ `opponentHistory` ENTROU (26/ago): 94 B por inscrito, o maior do que sobrava no
   * documento. ⚠️ E ele NÃO pode ser apagado e recalculado — MEDIDO no Confra: dos 215
   * pares guardados, 74 NÃO aparecem nos jogos de hoje (substituição, W.O., gente que
   * saiu) e o recálculo inventaria 66 que não existem. Ou seja ele carrega história que os
   * jogos já não contam; apagar quebraria o anti-repetição do sorteio.
   * ⇒ Sai do documento, mas continua existindo. Quem escreve nele é só o motor de sorteio
   * (`_recordOpponentHistory`), que roda na CF.
   * ⛔ `standings` continua FORA desta lista: ele é derivado, mas carrega a classificação
   * CONGELADA — dado com valor jurídico no torneio. Sai por último e com prova própria. */
  /* ── O QUE PODE MORAR FORA DO DOCUMENTO ───────────────────────────────────────
   * ⭐ O critério é UM: entra aqui tudo que CRESCE — com gente ou com evento. O teto de
   * 1 MB do Firestore não é lentidão, é RECUSA: passou, o banco não grava mais. Enquanto
   * um campo linear no número de inscritos morar no documento, existe um número de pessoas
   * a partir do qual o torneio simplesmente para.
   * ⚠️ Estar nesta lista NÃO divide nada: `dividir` extrai por natureza, e os dois
   * escritores devolvem pro documento tudo que não estiver no `_semPesados` daquele
   * torneio. Quem opta é o marcador, por torneio.
   * ⛔ E antes de pôr um torneio pra fora numa parte nova, TODO escritor tem que hidratar
   * — ver [[project_dividir_exige_todo_escritor_ciente]]: seis portas do `functions/`
   * decidiam com o elenco vazio porque a leitura foi construída antes da escrita. */
  var PESADOS = ['participants', 'history', 'opponentHistory',
                 'checkedIn',              // mapa uid → quando chegou: LINEAR nas pessoas
                 'woClaims', 'woLog',      // rastro de W.O.: cresce com o evento
                 'categoryNotifications']; // apontamentos de categoria: idem

  /* ⭐ TODA parte que pode morar fora do documento, num lugar só.
   * `PESADOS` são as de campo de topo (o laço genérico de `dividir` dá conta). `matches` e
   * `grupos` são estruturais: moram ANINHADAS em `rounds[]` e voltam pelo `_loc`, então têm
   * laço próprio e nunca entraram em PESADOS.
   * ⛔ Quem precisa saber "isto pode sair do documento?" tem que perguntar a `PARTES`, não
   * a `PESADOS` — foi essa confusão que fez a trava do rito recusar `grupos`. */
  var PARTES = PESADOS.concat(['matches', 'grupos']);

  function _arr(x) { return Array.isArray(x) ? x : []; }
  function _clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  /* ── CHAVE DURÁVEL DO EVENTO DE HISTÓRICO ──────────────────────────────────────
   * O histórico é um LOG: só cresce, e cada linha é imutável depois de escrita.
   * Mesmo assim ele era espelhado por POSIÇÃO (`'h' + _idx`), e posição é justamente
   * a coisa que muda quando o log é podado.
   *
   * ⛔ O ESTRAGO QUE ISSO CAUSARIA (medido antes de mexer, não descoberto depois):
   * o Confra tem 218 eventos no documento e 218 no espelho. Podar o documento para as
   * últimas 30 faria `_espelhaColecao` ver `h0..h29` com CONTEÚDO NOVO (as 30 últimas) e
   * `h30..h217` AUSENTES — ou seja, reescreveria as 30 primeiras linhas erradas e
   * APAGARIA as outras 188. O histórico inteiro, destruído pela poda que existia pra
   * economizar 37 KB.
   *
   * ⇒ A chave passa a sair do CONTEÚDO (data + mensagem), que é o que não muda de lugar.
   * ⚠️ Limite conhecido e aceito: dois eventos com a MESMA mensagem no MESMO milissegundo
   * colidem e viram uma linha só. `date` é ISO com milissegundo e as mensagens carregam
   * nome próprio — na prática não acontece; e perder uma linha repetida é infinitamente
   * menos grave que perder 188.
   * ⛔ `_idx` CONTINUA indo junto: é ele que `remontar` usa pra devolver a ORDEM. A chave
   * diz QUEM é a linha; o índice diz ONDE ela fica. São coisas diferentes e o bug nasceu
   * de usar uma como a outra.
   */
  /* ⭐ UM HASH SÓ pra toda chave-por-conteúdo. Cada uma escolhe QUE campos a
   * identificam; a aritmética é a mesma. Repetir o laço em cada chave é como duas delas
   * passam a discordar sem ninguém ver. */
  function _hashDe(txt) {
    var h = 0x811c9dc5;
    for (var i = 0; i < txt.length; i++) {
      h ^= txt.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return txt.length.toString(36) + '-' + h.toString(36);
  }

  /* Chave do apontamento de categoria. Identificam-no: PRA QUEM, QUANDO e QUAL categoria.
   * Medido no Confra: 82 registros, 82 chaves distintas — nenhuma colisão. */
  function chaveDoApontamento(a) {
    if (!a || typeof a !== 'object') return 'x';
    return 'c' + _hashDe([a.targetUid || a.targetName || '', a.timestamp || '', a.category || ''].join('|'));
  }

  /* ── O HISTÓRICO SE REMONTA PELO TEMPO, NÃO PELA POSIÇÃO (2.1.31) ──────────────
   * ⛔ ISTO É O PRÉ-REQUISITO PRA `history` SAIR DO DOCUMENTO, e estava escrito como
   * "o próximo passo" em functions-autodraw: enquanto o leitor ordenar por `_idx`, o log
   * NÃO pode entrar em `_semPesados`.
   *
   * POR QUÊ, em uma frase: `_idx` é a posição do evento no ARRAY DO DOCUMENTO, e a PODA
   * muda essa posição. A poda está LIGADA (`TETO_HIST = 120 → ALVO_HIST = 80`) e o Confra
   * está em 105 eventos, ao vivo. Na primeira poda o documento volta a 80, os eventos
   * seguintes nascem com `_idx` 80, 81… — que o espelho JÁ USOU. O `a[Number(x._idx)]`
   * gravaria um evento por cima do outro e o log perderia linhas em silêncio.
   * ⚠️ Isso não morde HOJE só porque `history` ainda é lido do documento. Move o campo
   * pro marcador sem isto e o log começa a comer a si mesmo.
   *
   * ⛔ E ORDENAR POR `date` NÃO SERVE — foi a primeira tentativa e ela QUEBROU a
   * invariante do módulo. Parecia óbvio (a própria `chaveDoEvento` deriva de `date`) e a
   * medição do dia apoiava: 0 eventos fora de ordem na base atual. Mas a fixture do
   * Confra tem **3 eventos fora de ordem cronológica** e **2 sem `date`** — o log é um
   * append de vários caminhos, não um relógio. Ordenar por tempo reordenava esses três, e
   * reordenar um log de auditoria é tão ruim quanto perdê-lo.
   * ⚠️ A lição: "a base de hoje não tem essa anomalia" não é o mesmo que "essa anomalia
   * não existe". A fixture guardava o contra-exemplo.
   *
   * ⭐ A REGRA QUE FICA: preservar a ordem GRAVADA (`_idx` crescente) e emitir DENSO.
   * Colisão de índice vira ADJACÊNCIA em vez de sobrescrita — nenhum evento é engolido, e
   * pra um log não podado o resultado é byte a byte o array original, então
   * `remontar(dividir(t)) === t` continua valendo.
   * ⛔ O que isto NÃO resolve, dito na cara: depois de MUITAS podas a ordem entre levas
   * pode não ser perfeitamente cronológica. Ordem imperfeita é recuperável olhando a data
   * do evento; evento comido não é. A correção definitiva é o espelho gravar uma
   * SEQUÊNCIA monotônica em vez da posição — isso é mudança de ESCRITA, e vem depois. */
  function _remontaHistorico(lista) {
    return lista.slice()
      .map(function (x, ord) { return { i: Number(x._idx), ord: ord, item: x.item }; })
      .sort(function (a, b) { return (a.i - b.i) || (a.ord - b.ord); })
      .map(function (x) { return _clone(x.item); });
  }

  function chaveDoEvento(ev) {
    var d = (ev && ev.date != null) ? String(ev.date) : '';
    var m = (ev && ev.message != null) ? String(ev.message) : '';
    var txt = d + '|' + m;
    // hash de 32 bits (FNV-1a) — determinístico, sem depender de lib. O par
    // (tamanho + hash) reduz colisão sem precisar de criptografia: isto é chave de
    // documento, não assinatura.
    var h = 0x811c9dc5;
    for (var i = 0; i < txt.length; i++) {
      h ^= txt.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'h' + txt.length.toString(36) + '-' + h.toString(36);
  }

  // Chave estável do jogo dentro do torneio. Usa o `id` quando existe (é o que o app
  // usa em toda parte); sem id, deriva da POSIÇÃO — determinístico e reversível.
  function chaveDoJogo(m, loc) {
    if (m && m.id != null && String(m.id) !== '') return String(m.id);
    if (loc.tipo === 'rounds') return 'r' + loc.ri + '-' + loc.mi;
    if (loc.tipo === 'phaseRounds') return 'p' + loc.fase + '-' + loc.ri + '-' + loc.mi;
    return 'm' + loc.mi;
  }

  /* ── EM QUE SUBCOLEÇÃO CADA PARTE MORA ────────────────────────────────────────
   * ⛔ POR QUE ISTO NÃO É "o nome da parte": `tournaments/{id}/participants` JÁ TEM DONO —
   * o espelho de roster (id do doc = uid puro, dado CRU), escrito pela CF desde antes desta
   * arquitetura existir. Dividir os inscritos pra lá botou DOIS ESQUEMAS no mesmo lugar:
   * medido num torneio real, 13 documentos onde deviam existir 8, e `remontar` devolveu o
   * certo POR SORTE (os intrusos não têm `_idx` e caíram fora do mapa). "Funcionou por
   * sorte" não é critério pra mexer no elenco de um torneio.
   * ⇒ Os inscritos vão pra `inscritos`, que não tem dono nenhum. O roster continua onde
   * está, intacto — não estou migrando ele, estou saindo do caminho dele.
   * ⭐ E o mapeamento vive AQUI, num lugar só: hoje sete caminhos precisam saber disso
   * (leitor do app, leitor da CF, gravador da CF, gatilho, salto, volta, ensaio) e lista
   * escrita à mão já esqueceu `participants` TRÊS vezes hoje.
   */
  var COLECAO_DA_PARTE = { participants: 'inscritos' };
  function colecaoDaParte(nome) { return COLECAO_DA_PARTE[nome] || nome; }

  /* ── CHAVE DURÁVEL DA INSCRIÇÃO ────────────────────────────────────────────────
   * Mesma história do histórico, e o mesmo estrago se eu deixar como estava: o espelho
   * chaveia inscrito por POSIÇÃO (`'p' + _idx`), e posição muda quando alguém sai do meio
   * da lista — aí o diff reescreve todo mundo depois dele com o conteúdo errado.
   *
   * ⭐ A ORDEM DE PREFERÊNCIA É O CÂNONE DO DONO (26/ago): _"sempre por uid a menos que
   * seja digitado por organizador e nao tenha uid"_.
   *   ① `uid` — a identidade de verdade.
   *   ② dupla: os dois uids, na ordem em que estão (p1 e p2 são posições do time, não
   *      ordem alfabética — trocar mudaria QUEM joga de cada lado).
   *   ③ só então o NOME, e só pra quem não tem uid nenhum: são as 75 de 240 entradas
   *      digitadas pelo organizador, que existem só pelo nome. É a exceção dele, e ela é
   *      legítima — sem ela essas pessoas não teriam chave nenhuma.
   * ⚠️ Consequência aceita do ③: renomear um inscrito fictício muda a chave dele, e o
   * espelho trata como "saiu um, entrou outro". Pro dado é a mesma coisa (o registro é o
   * nome); e é infinitamente melhor que a posição, que muda sem ninguém ter feito nada.
   */
  function chaveDoInscrito(p) {
    if (!p || typeof p !== 'object') return 'x';
    if (p.uid) return 'u' + String(p.uid);
    if (p.p1Uid || p.p2Uid) return 'd' + String(p.p1Uid || '-') + '_' + String(p.p2Uid || '-');
    var nomes = [p.name, p.displayName, p.p1Name, p.p2Name]
      .concat((Array.isArray(p.participants) ? p.participants : [])
        .map(function (x) { return x && (x.displayName || x.name); }))
      .filter(Boolean).join('|');
    var h = 0x811c9dc5;
    for (var i = 0; i < nomes.length; i++) {
      h ^= nomes.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'n' + nomes.length.toString(36) + '-' + h.toString(36);
  }

  /** Divide o documento em { config, matches, participants, history }. */
  /* QUEM JOGA ESTE JOGO, no próprio documento do jogo.
   *
   * É este campo que sustenta a regra por jogo em firestore.rules — "só quem joga ESTE
   * jogo escreve, e não pode se auto-incluir" —, o mesmo desenho que `results` já usa.
   * Sem ele, liberar escrita na subcoleção seria liberar qualquer inscrito a mexer em
   * qualquer jogo.
   *
   * ⛔ A DERIVAÇÃO NÃO É REIMPLEMENTADA AQUI: chama `window._matchPlayerUids`
   * (js/views/bracket-logic.js), a mesma que o cliente usa pra autorizar lançamento.
   * Duas versões divergem — hoje mesmo três bugs saíram disso.
   * ⚠️ Se ela não estiver carregada (harness mínimo), o campo simplesmente não vai:
   * documento sem `playerUids` continua legível e só não é escrevível por jogador, que é
   * o comportamento seguro.
   */
  function _uidsDoJogo(t, m) {
    var fn = (raiz && raiz._matchPlayerUids) ||
             (typeof window !== 'undefined' && window._matchPlayerUids) || null;
    if (typeof fn !== 'function') return null;
    try {
      var u = fn(t, m);
      return (Array.isArray(u) && u.length) ? u.map(String) : null;
    } catch (e) { return null; }
  }

  /* ── A CHAVE DE CADA PARTE É UMA REGRA, NÃO UM MAPA POR PARTE ─────────────────
   * ⛔ Aqui havia um `if (campo === 'history') … else if (campo === 'participants') …`.
   * Cadeia assim NÃO FALHA quando um campo novo entra: ela cai no `else` e o registro sai
   * chaveado por POSIÇÃO — que é exatamente o estrago que quase apagou 188 dos 218 eventos
   * do Confra. Errar em silêncio é pior que errar alto.
   * ⭐ Agora todo campo tem uma resposta explícita, e o que não tem identidade própria
   * devolve `null` — o registro fica só com `_idx`, e `chaveDoRegistro` marca isso com o
   * prefixo `i`. Chave é QUEM; índice é ONDE.
   */
  function chaveDaParte(campo, item) {
    if (campo === 'history') return chaveDoEvento(item);
    if (campo === 'participants') return chaveDoInscrito(item);
    if (campo === 'categoryNotifications') return chaveDoApontamento(item);
    if (!item || typeof item !== 'object') return null;   // escalar: o _idx já é a identidade
    // `woLog` carrega `id` próprio ("wo-0-R1_Grupo_A-<uid>-0") — identidade de verdade.
    if (item.id) return 'i' + _hashDe(String(item.id));
    // `woClaims` e afins: sem id, a identidade é o CONTEÚDO. Mesmo espírito do histórico.
    return 'h' + _hashDe(JSON.stringify(item));
  }

  /* ── CHAVE DURÁVEL DO GRUPO ───────────────────────────────────────────────────
   * O grupo é um CONTAINER de jogos, e o dono descreveu a arquitetura assim: _"cada jogo é
   * um doc pendurado no torneio e cada inscrito é outro doc"_. Grupo é a mesma família.
   * MEDIDO no Confra: 35 grupos ocupam 22,2 KB do documento — 153 B por inscrito, o maior
   * termo que ainda cresce com gente (retrato congelado 5,9 KB, uids 4,2, ids de jogo 3,6,
   * nomes 2,3).
   * ⛔ A CHAVE NÃO PODE SER A POSIÇÃO. Grupo some do meio (fase que reagrupa, W.O. que
   * dissolve) e todos os índices depois dele andam — o diff veria cada um como "mudou" e
   * gravaria o retrato de A por cima do de B. É a mesma família do estrago que quase apagou
   * 188 dos 218 eventos do histórico. [[feedback_chave_de_espelho_nunca_e_posicao]]
   * ⭐ A identidade é RODADA + NOME ("R1 Grupo Q") — o nome é estável e único dentro da
   * rodada, e é por ele que as pessoas se referem ao grupo. Sem nome, cai nos UIDS de quem
   * joga nele, que é a identidade real do grupo; só em último caso na posição, e aí marcada.
   */
  function chaveDoGrupo(g, loc) {
    var ri = (loc && typeof loc.ri === 'number') ? loc.ri : 0;
    if (g && g.name) return 'g' + _hashDe(ri + '|' + String(g.name));
    var us = (g && Array.isArray(g.playersUids)) ? g.playersUids.slice().sort() : [];
    if (us.length) return 'g' + _hashDe(ri + '|' + us.join(','));
    var ps = (g && Array.isArray(g.players)) ? g.players.slice().sort() : [];
    if (ps.length) return 'g' + _hashDe(ri + '|' + ps.join(','));
    return 'gi' + ri + '-' + ((loc && loc.gi) || 0);   // sem identidade: posição, e MARCADA
  }

  /* `apenas` (opcional) limita o que sai do documento.
   * ⛔ SEM ELE, `dividir` extrai TUDO — e aí quem grava precisa lembrar de devolver o que o
   * marcador não pediu. Essa devolução já esqueceu uma parte quatro vezes neste projeto, e
   * ao acrescentar `grupos` eu estava prestes a repetir: o Confra está dividido só em
   * matches/participants/opponentHistory, então a próxima gravação teria mandado
   * `monarchGroups: []` pro documento e apagado os 35 grupos — sem erro e sem log.
   * ⭐ Com `apenas`, o que não foi pedido NUNCA sai do config: não há o que devolver, logo
   * não há o que esquecer. Quem chama sem lista (o espelho) segue querendo tudo. */
  function dividir(t, apenas) {
    if (!t || typeof t !== 'object') return null;
    var _lista = Array.isArray(apenas) ? apenas : null;
    var _quer = function (nome) { return !_lista || _lista.indexOf(nome) !== -1; };
    var config = _clone(t);
    var matches = [], grupos = [];

    if (_quer('matches')) // ── 1. jogos de t.rounds[].matches ────────────────────────────────────────
    _arr(config.rounds).forEach(function (r, ri) {
      if (!r || typeof r !== 'object') return;
      _arr(r.matches).forEach(function (m, mi) {
        var loc = { tipo: 'rounds', ri: ri, mi: mi };
        var _pu = _uidsDoJogo(t, m);
        var _reg = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
        if (_pu) _reg.playerUids = _pu;
        matches.push(_reg);
      });
      // ⛔ o array fica VAZIO, não some: a rodada tem outros campos (format, status,
      // round, monarchGroups) e a AUSÊNCIA de `matches` não é o mesmo que vazio.
      if (Array.isArray(r.matches)) r.matches = [];
    });

    /* ── 1b. GRUPOS de t.rounds[].monarchGroups ─────────────────────────────────
     * Sai INTEIRO pra subcoleção `grupos`. O que o grupo guarda não é derivável dos jogos:
     * `classifCongelada` (a ordem PUBLICADA, que não se reescreve), `playersUids`,
     * `woAbsent`/`woDest`, `rosterAt`. Derivar seria inventar. */
    if (_quer('grupos')) _arr(config.rounds).forEach(function (r, ri) {
      if (!r || typeof r !== 'object' || !Array.isArray(r.monarchGroups)) return;
      r.monarchGroups.forEach(function (g, gi) {
        var loc = { tipo: 'grupos', ri: ri, gi: gi };
        grupos.push({ _chave: chaveDoGrupo(g, loc), _loc: loc, grupo: _clone(g) });
      });
      // ⛔ VAZIO, não ausente: a rodada tem outros campos, e "não tem grupo" ≠ "não veio".
      r.monarchGroups = [];
    });

    // ── 2. jogos de t.matches[] ───────────────────────────────────────────────
    if (_quer('matches')) _arr(config.matches).forEach(function (m, mi) {
      var loc = { tipo: 'matches', mi: mi };
      var _pu2 = _uidsDoJogo(t, m);
      var _reg2 = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
      if (_pu2) _reg2.playerUids = _pu2;
      matches.push(_reg2);
    });
    if (_quer('matches') && Array.isArray(config.matches)) config.matches = [];

    // ── 3. jogos de t.phaseRounds{fase}.rounds[].matches ──────────────────────
    if (_quer('matches') && config.phaseRounds && typeof config.phaseRounds === 'object') {
      Object.keys(config.phaseRounds).forEach(function (fase) {
        var ph = config.phaseRounds[fase];
        if (!ph || !Array.isArray(ph.rounds)) return;
        ph.rounds.forEach(function (r, ri) {
          if (!r || typeof r !== 'object') return;
          _arr(r.matches).forEach(function (m, mi) {
            var loc = { tipo: 'phaseRounds', fase: String(fase), ri: ri, mi: mi };
            var _pu = _uidsDoJogo(t, m);
        var _reg = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
        if (_pu) _reg.playerUids = _pu;
        matches.push(_reg);
          });
          if (Array.isArray(r.matches)) r.matches = [];
        });
      });
    }

    // ── 4. inscritos e histórico ──────────────────────────────────────────────
    var saida = { config: config, matches: matches, grupos: grupos };
    PESADOS.forEach(function (campo) {
      if (!_quer(campo)) { saida[campo] = []; return; }
      var v = config[campo];
      if (Array.isArray(v)) {
        saida[campo] = v.map(function (item, i) {
          var _reg = { _idx: i, item: _clone(item) };
          // só o histórico ganha chave por conteúdo — `participants` é chaveado por uid
          // do lado de fora e não é podado. Ver chaveDoEvento().
          _reg._k = chaveDaParte(campo, item);
          return _reg;
        });
        config[campo] = [];
      } else if (v && typeof v === 'object') {
        // forma de MAPA (alguns docs legados guardam participants como objeto)
        saida[campo] = Object.keys(v).map(function (k) { return { _idx: k, item: _clone(v[k]) }; });
        config[campo] = {};
      } else {
        saida[campo] = [];   // ausente ou vazio: nada a extrair
      }
    });
    return saida;
  }

  /** Remonta o documento original a partir das partes. Tem que sair IDÊNTICO. */
  function remontar(partes) {
    if (!partes || !partes.config) return null;
    var t = _clone(partes.config);

    // ⛔ ORDEM IMPORTA: o índice `mi` é a posição no array original. Ordenar por ele
    // devolve a ordem exata; sem isso, dois jogos trocados já quebram a igualdade —
    // e, pior, mudariam a ordem visível na tela.
    var porTipo = { rounds: [], matches: [], phaseRounds: [] };
    _arr(partes.matches).forEach(function (m) {
      var tipo = (m && m._loc && m._loc.tipo) || 'matches';
      (porTipo[tipo] || porTipo.matches).push(m);
    });

    porTipo.rounds
      .slice().sort(function (a, b) { return (a._loc.ri - b._loc.ri) || (a._loc.mi - b._loc.mi); })
      .forEach(function (m) {
        var r = _arr(t.rounds)[m._loc.ri];
        if (!r) return;
        if (!Array.isArray(r.matches)) r.matches = [];
        r.matches[m._loc.mi] = _clone(m.jogo);
      });

    porTipo.matches
      .slice().sort(function (a, b) { return a._loc.mi - b._loc.mi; })
      .forEach(function (m) {
        if (!Array.isArray(t.matches)) t.matches = [];
        t.matches[m._loc.mi] = _clone(m.jogo);
      });

    porTipo.phaseRounds
      .slice().sort(function (a, b) {
        return String(a._loc.fase).localeCompare(String(b._loc.fase))
          || (a._loc.ri - b._loc.ri) || (a._loc.mi - b._loc.mi);
      })
      .forEach(function (m) {
        var ph = t.phaseRounds && t.phaseRounds[m._loc.fase];
        var r = ph && _arr(ph.rounds)[m._loc.ri];
        if (!r) return;
        if (!Array.isArray(r.matches)) r.matches = [];
        r.matches[m._loc.mi] = _clone(m.jogo);
      });

    /* ── GRUPOS DE VOLTA ────────────────────────────────────────────────────────
     * ⛔ Pela POSIÇÃO gravada em `_loc`, nunca pela ordem em que os documentos chegaram: o
     * Firestore entrega por id, e id aqui é hash. Sem `_loc.gi` o Grupo Q apareceria onde
     * estava o Grupo A. Chave diz QUEM, `_loc` diz ONDE. */
    _arr(partes.grupos)
      .filter(function (x) { return x && x._loc && x._loc.tipo === 'grupos'; })
      .slice().sort(function (x, y) { return (x._loc.ri - y._loc.ri) || (x._loc.gi - y._loc.gi); })
      .forEach(function (x) {
        var r = _arr(t.rounds)[x._loc.ri];
        if (!r) return;
        if (!Array.isArray(r.monarchGroups)) r.monarchGroups = [];
        r.monarchGroups[x._loc.gi] = _clone(x.grupo);
      });

    PESADOS.forEach(function (campo) {
      var lista = _arr(partes[campo]);
      if (!lista.length) return;
      var mapa = (typeof lista[0]._idx === 'string' && isNaN(Number(lista[0]._idx)));
      if (mapa) {
        var o = {};
        lista.forEach(function (x) { o[x._idx] = _clone(x.item); });
        t[campo] = o;
      } else if (campo === 'history') {
        t[campo] = _remontaHistorico(lista);
      } else {
        var a = [];
        lista.forEach(function (x) { a[Number(x._idx)] = _clone(x.item); });
        t[campo] = a;
      }
    });

    return t;
  }

  // ⭐ COMPARAÇÃO CANÔNICA — e ela é o que separa "diferente" de "reordenado".
  // MEDIDO ao conferir a 1ª carga: 30 dos 39 torneios "divergiam", e a diferença era
  // só a ORDEM DAS CHAVES dentro dos objetos:
  //     velho: {"message":"Torneio Criado","date":"…"}
  //     novo : {"date":"…","message":"Torneio Criado"}
  // O Firestore NUNCA prometeu ordem de chave — ele devolve ordenado. Exigir isso era
  // um teste medindo o que o banco não garante, e teria feito a migração parecer
  // quebrada quando estava correta.
  // ⛔ MAS ORDEM DE ARRAY É SAGRADA: os jogos e os inscritos têm ordem VISÍVEL na
  // tela. Aqui só as chaves de OBJETO são ordenadas; arrays ficam como estão.
  function canonico(x) {
    if (Array.isArray(x)) return x.map(canonico);
    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).sort().forEach(function (k) { o[k] = canonico(x[k]); });
      return o;
    }
    return x;
  }
  function iguais(a, b) { return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b)); }

  /* ── FASE 2b · O QUE MUDOU, E SÓ ISSO ──────────────────────────────────────────
   *
   * É esta função que faz um placar custar ~925 B em vez de 238 KB: comparada a foto
   * dos jogos como estavam ao ABRIR, ela devolve só os que mudaram (e os que sumiram).
   *
   * ⭐ E CONSERTA UMA CLASSE INTEIRA DE BUG. As 8 proteções de `saveTournament` existem
   * porque o cliente manda o TORNEIO INTEIRO — um save atrasado sobrescreve o que ele
   * não sabia que mudou (medido: destruía rodada nova, jogo de entrada tardia, link do
   * grupo, horário combinado e substituição por W.O.). Escrevendo só o que mudou, o save
   * atrasado deixa de poder apagar o que não tocou. Por construção, não por mais um guard.
   *
   * ⛔ Compara pelo CANÔNICO: o Firestore não preserva ordem de chave, então `{a,b}` e
   * `{b,a}` são o MESMO jogo. Comparar o JSON cru marcaria os 112 jogos como mudados a
   * cada save — exatamente o que estamos evitando. (Foi o que fez 30 dos 39 torneios
   * "divergirem" na primeira conferência do espelho.)
   */
  /* ── A CHAVE DE QUALQUER REGISTRO DE PARTE — UMA REGRA SÓ ────────────────────
   * `dividir` produz dois formatos de registro: o do jogo, que traz `_chave` (conteúdo +
   * lugar), e o das demais partes, que traz `_k` (conteúdo) e `_idx` (posição).
   * ⛔ Cada escritor vinha decidindo isso por conta própria — um usava `m._chave`, outro
   * `p._k || ('p' + p._idx)`, e o `jogosQueMudaram` só sabia ler `_chave`. Parte cuja
   * chave ele não reconhecia saía do diff INTEIRA e em silêncio.
   * ⭐ `_idx` é o ÚLTIMO recurso e vem marcado: posição não é identidade, e usá-la como
   * chave é o estrago que quase apagou 188 dos 218 eventos do Confra.
   */
  function chaveDoRegistro(reg) {
    if (!reg || typeof reg !== 'object') return null;
    if (reg._chave) return String(reg._chave);
    if (reg._k) return String(reg._k);
    if (reg._idx !== undefined && reg._idx !== null) return 'i' + String(reg._idx);
    return null;
  }

  function jogosQueMudaram(antes, depois) {
    var idx = {};
    _arr(antes).forEach(function (m) { var k = chaveDoRegistro(m); if (k) idx[k] = m; });
    var mudaram = [], sumiram = [];
    var vistos = {};
    _arr(depois).forEach(function (m) {
      var k = chaveDoRegistro(m);
      if (!k) return;
      vistos[k] = 1;
      var b = idx[k];
      if (!b || !iguais(b, m)) mudaram.push(m);
    });
    Object.keys(idx).forEach(function (k) { if (!vistos[k]) sumiram.push(idx[k]); });
    return { mudaram: mudaram, sumiram: sumiram };
  }

  /* ── ⭐ MONTAR O TORNEIO DO BANCO — O CAMINHO ÚNICO ────────────────────────────
   * Pergunta do dono (26/ago): _"por que 7 caminhos? não deveria ser 1 caminho único
   * canônico?"_ — e ele está certo. Eu tinha SEIS cópias da mesma operação: leitor do app,
   * leitor da CF, montagem do resumo, salto, volta e ensaio. Todas faziam a mesma coisa:
   * ler as partes que `_semPesados` nomeia e chamar `remontar`.
   *
   * ⛔ E CÓPIA NÃO É CAMINHO — é lugar pra esquecer. Hoje mesmo a mesma lista escrita à
   * mão esqueceu `participants` TRÊS vezes: o gatilho apagou o elenco, a volta devolveu o
   * torneio sem ele, e o meu conferidor não viu nem um nem outro.
   *
   * ⭐ O que de fato DIFERE entre os seis é só COMO SE LÊ UMA COLEÇÃO: o SDK do cliente, o
   * admin, e o admin dentro de uma transação. Isso é uma linha, não um caminho. Então ela
   * entra por parâmetro e todo o resto — quais partes, em que coleção cada uma mora, o que
   * fazer quando falta — vive AQUI, num lugar só.
   *
   * `lerColecao(nomeDaColecao)` devolve (ou promete) a lista de documentos daquela coleção.
   * Devolve o torneio montado, ou lança — ⛔ NUNCA devolve o config cru: config cru é um
   * torneio sem jogos, e devolver isso em silêncio foi exatamente o que pintou chave vazia
   * pra todo mundo em 26/ago.
   */
  function montarDoBanco(config, lerColecao) {
    if (!config) throw new Error('[split] montarDoBanco: sem config');
    var fora = Array.isArray(config._semPesados) ? config._semPesados : null;
    if (!fora || !fora.length) return Promise.resolve(config);   // inteiro: nada a montar
    var partes = { config: config };
    var i = 0;
    function proxima() {
      if (i >= fora.length) {
        var t = remontar(partes);
        if (!t) throw new Error('[split] remontar devolveu vazio — recuso entregar torneio incompleto');
        return t;
      }
      var nome = fora[i++];
      return Promise.resolve(lerColecao(colecaoDaParte(nome), nome)).then(function (docs) {
        partes[nome] = docs || [];
        return proxima();
      });
    }
    return Promise.resolve().then(proxima);
  }

  var api = { dividir: dividir, remontar: remontar, chaveDoJogo: chaveDoJogo, chaveDoRegistro: chaveDoRegistro, chaveDaParte: chaveDaParte,
              chaveDoEvento: chaveDoEvento, chaveDoInscrito: chaveDoInscrito,
              chaveDoApontamento: chaveDoApontamento,
              colecaoDaParte: colecaoDaParte, chaveDoGrupo: chaveDoGrupo, montarDoBanco: montarDoBanco,
              jogosQueMudaram: jogosQueMudaram,
              PESADOS: PESADOS, PARTES: PARTES, canonico: canonico, iguais: iguais };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (raiz) { raiz._tSplit = api; }
})(typeof window !== 'undefined' ? window : null);
