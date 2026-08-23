/* gender-ratio-core.js — PROPORÇÃO DE GÊNERO do sorteio equilibrado (v1.7.16)
 *
 * Regra do dono (ago/2026, depois do incidente do "R1 Grupo B2" no Confra, onde um grupo
 * novo fechou com 3 homens):
 *
 *   - Sorteio LIVRE  → não tem proporção nem toggle. Nada aqui é consultado.
 *   - Sorteio EQUILIBRADO → tem uma PROPORÇÃO (50/50, 25/75 ou 75/25, sempre sobre as 4
 *     pessoas de um grupo Rei/Rainha ou de um jogo) e o toggle "Travar proporção":
 *       · TRAVADO   → só fecha grupo que atenda a proporção EXATA. Nunca flexibiliza.
 *       · DESTRAVADO→ persegue a proporção enquanto for possível e, quando não houver mais
 *         gente de um gênero para mantê-la, FLEXIBILIZA para incluir o máximo de pessoas.
 *   - SEM GÊNERO DECLARADO NUNCA ENTRA EM GRUPO no equilibrado — nem na flexibilização.
 *     "não pode assumir nem ser homem, nem ser mulher". Quem corrige é o organizador, pela
 *     Análise de Inscritos (que enxerga a lista de espera desde a v1.7.2).
 *
 * POR QUE UM ARQUIVO PRÓPRIO: a MESMA proporção decide dois caminhos que hoje moram longe
 * um do outro — o sorteio inicial equilibrado e a formação de grupo a partir da lista de
 * espera (_tryFormMonarchWaitlistGroups). Este projeto já pagou caro por regra duplicada
 * (a formação de grupo Rei/Rainha estava escrita em 3 lugares até a v2.7.2, com drift de
 * folga/label). Uma versão só, consumida pelos dois.
 *
 * REGRA: PURO. Nada de document/AppStore/firebase/Date.now/Math.random. Recebe o pool já
 * resolvido (nome + gênero) e devolve a divisão. Quem embaralha é o chamador — assim a
 * ordem do sorteio continua sendo do sorteio, e este módulo é determinístico e testável.
 */

(function () {
  // Proporções aceitas, sempre sobre 4 pessoas. A chave é "homens/mulheres" em %.
  var RATIOS = {
    '50/50': { m: 2, f: 2 },
    '25/75': { m: 1, f: 3 },
    '75/25': { m: 3, f: 1 }
  };
  window._GENDER_RATIOS = RATIOS;
  // ⭐ 2.1 (dono): o padrão é 50/50. Era '25/75' — herança de quando a única regra existente
  // era "no máximo 1 homem em 4" na lista de espera. Com a seção só aparecendo quando os DOIS
  // gêneros estão misturados na mesma categoria, o padrão honesto é a divisão igual.
  window._GENDER_RATIO_DEFAULT = '50/50';

  // Rótulo humano da proporção (UI e notificação falam a mesma língua).
  window._ratioLabel = function (r) {
    var c = RATIOS[r];
    if (!c) return '';
    var h = c.m === 1 ? '1 homem' : c.m + ' homens';
    var f = c.f === 1 ? '1 mulher' : c.f + ' mulheres';
    return r + ' (' + h + ' / ' + f + ')';
  };

  window._isValidRatio = function (r) { return !!RATIOS[String(r || '')]; };

  /* As DUAS leituras da mesma proporção, uma função cada — o slider e o arrasto pintam
   * pelo mesmo texto. Ordem do dono (22/ago/2026): o % é o que fica GRANDE e em verde; a
   * composição em H/M desceu para a linha menor. */
  window._ratioPctFace = function (r) {
    var c = RATIOS[String(r || '')];
    return c ? (String(r).replace('/', '% / ') + '%') : '';
  };
  window._ratioHmFace = function (r) {
    var c = RATIOS[String(r || '')];
    return c ? (c.m + 'H / ' + c.f + 'M') : '';
  };

  // Proporção VIGENTE do torneio/fase. A fase manda; sem ela, o topo; sem nada, o default.
  // Devolve '' quando o sorteio é LIVRE — ali proporção não existe, e devolver um valor
  // faria a UI mostrar uma regra que o motor não aplica.
  // ── ONDE A PROPORÇÃO EXISTE (v1.7.19) ───────────────────────────────────────────────
  // Regra do dono (ago/2026): "essas proporções são sugeridas apenas em torneios em que
  // seja tudo misturado, sem categoria por gênero. Se tiver categoria fem e masc ou mesmo
  // misto (50/50) separadas, não temos essas proporções e flexibilizações."
  //
  // POR QUÊ, na prática: com o torneio separado por gênero o sorteio já roda POR CATEGORIA,
  // e cada pool já é homogêneo — uma categoria Feminina tem 4 mulheres e ZERO homens, então
  // exigir 25/75 ali recusaria TODOS os grupos. A regra anterior ("no máximo 1 homem")
  // tolerava isso por ser um TETO; a proporção é EXATA e não tolera. E no MISTO a proporção
  // já é 50/50 por construção (sorteia duplas), com flexibilização própria no
  // `_formDoublesTeams` — duplicar aqui criaria duas regras para o mesmo fato.
  //
  // O gatilho é `genderCategories`: categoria de HABILIDADE (A/B/C) ou de IDADE não separa
  // gênero, então esses torneios continuam misturados e COM proporção.
  function _labelSeparaGenero(x) {
    var v = String(x == null ? '' : x).trim().toLowerCase();
    if (!v) return false;
    if (v.indexOf('mist') === 0) return true;   // "Misto" separado também é categoria de gênero
    return v.indexOf('fem') === 0 || v.indexOf('masc') === 0;
  }
  window._ratioAppliesTo = function (t, category) {
    if (!t) return false;
    if (_labelSeparaGenero(category)) return false;
    var gc = Array.isArray(t.genderCategories) ? t.genderCategories : [];
    for (var i = 0; i < gc.length; i++) if (_labelSeparaGenero(gc[i])) return false;
    return true;
  };

  // Sem nada configurado o equilibrado cai no DEFAULT (25/75). Isso é deliberado: a regra
  // que já vigorava antes desta versão era "no máximo 1 homem em 4", que É o 25/75 — cair
  // em "sem proporção" afrouxaria, calado, todos os torneios em andamento.
  /* A PROPORÇÃO SÓ EXISTE QUANDO HÁ OS DOIS GÊNEROS PRA PROPORCIONAR.
   *
   * Ordem do dono (22/ago/2026): _"essa proporção só deve aparecer quando existem os 2 gêneros
   * misturados em mesma categoria e daí considera por padrão 50/50… se houverem categorias que
   * separam os gêneros ou os inscritos forem de 1 gênero apenas a seção inteira deve sumir."_
   *
   * `_ratioAppliesTo` já cobria a metade das CATEGORIAS (Fem/Masc separam, misto não). Faltava
   * a metade dos INSCRITOS: num torneio misto em que só se inscreveram mulheres, oferecer
   * "25/75" é oferecer uma regra que nenhum grupo pode cumprir — e travada, ela não sorteia
   * grupo nenhum.
   *
   * `generos` = array de 'masculino' | 'feminino' | '' (quem não preencheu). Quem não
   * preencheu NÃO conta como gênero presente: um torneio com 8 mulheres e 3 sem preencher não
   * tem "dois gêneros", tem um e três incógnitas.
   */
  window._ratioTemOsDoisGeneros = function (generos) {
    // ⚠️ NÃO SABER não é o mesmo que ser de um gênero só — e essa diferença decide se a seção
    // some. Dois casos de "não sabe": a CRIAÇÃO do torneio (ninguém inscrito ainda, quem chama
    // passa `null`) e o inscrito SEM gênero declarado (é justamente quem o diálogo de sorteio
    // está prestes a definir). Nos dois a seção FICA. Ela só sai quando todo mundo tem gênero
    // e é o mesmo pra todo mundo — aí não há o que proporcionar.
    if (generos == null) return true;
    if (!Array.isArray(generos)) return false;
    var m = false, f = false, desconhecido = false;
    for (var i = 0; i < generos.length; i++) {
      var g = String(generos[i] || '').toLowerCase();
      if (g === 'masculino') m = true;
      else if (g === 'feminino') f = true;
      else desconhecido = true;
      if (m && f) return true;
    }
    if (!m && !f) return true;      // ninguém declarou nada — ainda pode virar misto
    return desconhecido;            // um gênero só, mas há indefinidos: ainda pode virar misto
  };

  window._ratioVisivel = function (t, category, generos) {
    if (!window._ratioAppliesTo(t, category)) return false;
    return window._ratioTemOsDoisGeneros(generos);
  };

  /* ⭐ O CONTROLE É UM SÓ, e mora aqui (2.1).
   *
   * Ordem do dono (22/ago/2026): _"mudou aqui muda lá na lista de espera o texto e a
   * proporção. mesma coisa o toggle que trava a proporção."_ Havia DUAS cópias do controle —
   * uma no formulário do torneio, outra na tela de sorteio — e por isso as duas podiam contar
   * histórias diferentes. Agora as duas chamam esta função: um desenho, um texto, uma regra.
   *
   * `idp` = prefixo dos ids (as duas telas coexistem no DOM sem colidir).
   * `onRatio`/`onLock` = nomes de função global chamados no evento; quem usa decide o que
   * fazer com o valor (gravar no form, gravar no torneio…), mas o DESENHO não se duplica.
   */
  var ORDEM = ['25/75', '50/50', '75/25'];
  /* A lista de gêneros da disputa — uma leitura só, pras duas telas.
   * `_pGender` é o leitor canônico (uid-first, [[feedback_uid_controls_everything_name_only_ficticio]]).
   * Devolve `null` quando ainda não há ninguém inscrito: não saber ≠ ser de um gênero só,
   * e é o caso da CRIAÇÃO do torneio. */
  window._ratioGenerosDoTorneio = function (t) {
    var ps = (t && Array.isArray(t.participants)) ? t.participants : null;
    if (!ps || !ps.length) return null;
    var ler = (typeof window._pGender === 'function')
      ? window._pGender
      : function (p) { return (p && p.gender) || ''; };
    var out = [];
    for (var i = 0; i < ps.length; i++) out.push(ler(ps[i]));
    return out;
  };

  // O PORQUÊ também é regra, não texto de tela: quem some tem que saber dizer por quê.
  window._ratioMotivoAusencia = function (t, category, generos) {
    if (!window._ratioAppliesTo(t, category)) return 'as categorias já separam os gêneros, cada sorteio roda dentro da sua';
    if (!window._ratioTemOsDoisGeneros(generos)) {
      var so = '';
      if (Array.isArray(generos)) {
        for (var i = 0; i < generos.length; i++) {
          var g = String(generos[i] || '').toLowerCase();
          if (g === 'masculino' || g === 'feminino') { so = g; break; }
        }
      }
      return so ? ('só há ' + (so === 'masculino' ? 'homens' : 'mulheres') + ' na disputa') : 'ainda não há os dois gêneros na disputa';
    }
    return '';
  };

  window._ratioSliderHtml = function (o) {
    o = o || {};
    var idp = o.idp || 'gr';
    // ── SEÇÃO INTEIRA SOME quando não há os dois gêneros pra proporcionar ──────────────
    // O dono pediu que sumisse — e pediu também que diga por quê: foi justamente ele
    // procurando "por que a proporção funcionava" que abriu este caso. Controle que some
    // calado manda a pessoa procurar.
    if (o.visivel === false) {
      return '<div id="' + idp + '-box" style="font-size:0.74rem;color:var(--text-muted,#94a3b8);' +
        'line-height:1.45;padding:10px 12px;border-radius:10px;border:1px dashed rgba(255,255,255,0.14);margin-bottom:1rem;">' +
        '<span style="margin-right:5px;">⚖️</span><b>Sem proporção de gênero</b> — ' + (o.motivo || 'não há os dois gêneros para proporcionar') + '.</div>';
    }
    var r = window._isValidRatio(o.ratio) ? String(o.ratio) : window._GENDER_RATIO_DEFAULT;
    var i = ORDEM.indexOf(r); if (i < 0) i = 1;
    var cfg = RATIOS[r];
    var travada = (o.locked !== false);
    return '<div id="' + idp + '-box" style="background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.20);border-radius:12px;padding:1rem;margin-bottom:1rem;">' +
      '<p style="margin:0 0 0.35rem;font-size:0.8rem;color:var(--ratio-verde,#22c55e);font-weight:600;text-transform:uppercase;letter-spacing:1px;"><span style="margin-right:5px;">⚖️</span>Proporção do sorteio</p>' +
      '<p style="margin:0 0 0.9rem;font-size:0.74rem;color:var(--text-muted,#94a3b8);line-height:1.4;">Homens / mulheres em cada 4 pessoas sorteadas (grupo Rei/Rainha ou jogo). Vale no sorteio equilibrado.</p>' +
      // A LEITURA em cima do slider: o PERCENTUAL grande e em verde (é como o valor está
      // gravado e como o slider fala), a composição H/M embaixo, menor. Pedido do dono
      // (22/ago/2026) — antes era o contrário. `-face` = linha grande, `-pct` = linha menor.
      '<div style="text-align:center;margin-bottom:6px;">' +
        '<div id="' + idp + '-face" style="font-size:1.35rem;font-weight:900;color:var(--ratio-verde,#22c55e);font-variant-numeric:tabular-nums;line-height:1.15;">' + window._ratioPctFace(r) + '</div>' +
        '<div id="' + idp + '-pct" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);font-weight:700;">' + window._ratioHmFace(r) + '</div>' +
      '</div>' +
      '<input type="range" id="' + idp + '-slider" min="0" max="2" step="1" value="' + i + '" ' +
        'aria-label="Proporção de gênero no sorteio" ' +
        'oninput="window._ratioSliderMove(\'' + idp + '\', this.value)" ' +
        'onchange="' + (o.onRatio || 'window._ratioSliderNoop') + '(window._ratioSliderValue(this.value))" ' +
        'style="width:100%;accent-color:var(--ratio-verde,#22c55e);">' +
      '<div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--text-muted,#94a3b8);font-weight:700;margin-top:-2px;">' +
        '<span>25%/75%</span><span>50%/50%</span><span>75%/25%</span></div>' +
      '<div class="toggle-row" style="margin-top:12px;padding:8px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.25);background:rgba(34,197,94,0.07);">' +
        '<div class="toggle-row-label" style="gap:8px;"><span class="toggle-icon">🔒</span><div>' +
          '<span style="font-weight:600;color:var(--text-color);font-size:0.88rem;">Travar proporção</span>' +
          '<div class="toggle-desc" id="' + idp + '-lockdesc" style="font-size:0.72rem;margin-top:2px;">' + window._ratioLockDesc(travada) + '</div>' +
        '</div></div>' +
        '<label class="toggle-switch"><input type="checkbox" id="' + idp + '-lock"' + (travada ? ' checked' : '') +
          ' onchange="window._ratioSliderLock(\'' + idp + '\', this.checked); ' + (o.onLock || 'window._ratioSliderNoop') + '(this.checked)">' +
          '<span class="toggle-slider"></span></label>' +
      '</div>' +
    '</div>';
  };
  // O texto da trava também é um só — era outra coisa que divergia entre as duas telas.
  window._ratioLockDesc = function (travada) {
    return travada
      ? 'Travada, só forma grupo na proporção exata. Quem não couber espera a próxima pessoa do gênero que falta.'
      : 'Destravada, busca a proporção e depois flexibiliza para incluir mais gente.';
  };
  window._ratioSliderValue = function (i) { return ORDEM[parseInt(i, 10)] || window._GENDER_RATIO_DEFAULT; };
  window._ratioSliderNoop = function () {};
  // Pintura ao arrastar: a leitura acompanha o dedo, sem esperar o `change`.
  window._ratioSliderMove = function (idp, i) {
    var r = window._ratioSliderValue(i);
    var f = document.getElementById(idp + '-face'); if (f) f.textContent = window._ratioPctFace(r);
    var p = document.getElementById(idp + '-pct'); if (p) p.textContent = window._ratioHmFace(r);
  };
  window._ratioSliderLock = function (idp, travada) {
    var d = document.getElementById(idp + '-lockdesc');
    if (d) d.textContent = window._ratioLockDesc(!!travada);
  };

  window._ratioForPhase = function (t, phaseIdx, category) {
    if (!t) return '';
    if (window._drawModeIsLivre && window._drawModeIsLivre(t)) return '';
    if (!window._ratioAppliesTo(t, category)) return '';   // separado por gênero → sem proporção
    var r = window._ratioConfigured(t, phaseIdx);
    return r || window._GENDER_RATIO_DEFAULT;
  };

  // Proporção ESCOLHIDA de verdade (sem cair no default). Existe porque os dois caminhos
  // não podem ser tratados igual:
  //   · LISTA DE ESPERA (grupo novo) → usa _ratioForPhase, COM default. Antes desta versão
  //     já havia ali uma regra dura ("no máximo 1 homem em 4", que é o 25/75); cair em
  //     "sem proporção" afrouxaria calado o que já valia — foi o bug do "R1 Grupo B2".
  //   · SORTEIO INICIAL → usa esta, SEM default. Ali nunca existiu regra dura: só o reparo
  //     best-effort _spreadMinorityGender ("o mais possível", nunca uma falha). Ligar uma
  //     regra dura por default deixaria QUALQUER torneio cujos inscritos não preencheram
  //     gênero sortear ZERO grupos — o organizador clica Sortear e não sai nada.
  // Escolhida a proporção na fase, ela vale nos DOIS (é o "trava tudo" pedido pelo dono).
  window._ratioConfigured = function (t, phaseIdx, category) {
    if (!t) return '';
    if (!window._ratioAppliesTo(t, category)) return '';
    var i = (phaseIdx == null) ? (t.currentPhaseIndex || 0) : phaseIdx;
    var ph = (Array.isArray(t.phases) && t.phases[i]) ? t.phases[i] : null;
    var r = String((ph && ph.genderRatio) || t.genderRatio || '');
    return RATIOS[r] ? r : '';
  };

  // Sorteio livre? (o campo é o mesmo que o motor de duplas já lê)
  window._drawModeIsLivre = function (t) {
    if (!t) return false;
    if (t._drawBalanceMode === 'livre') return true;
    if (t._drawBalanceMode === 'equilibrado') return false;
    // sem escolha explícita: `equilibrado !== false` é o default histórico do motor
    return t.equilibrado === false;
  };

  // Proporção TRAVADA? Toggle do organizador, default TRAVADO (foi o pedido do dono:
  // "pelo menos por enquanto" — destravar é escolha explícita, não estado inicial).
  // Campo mantido com o nome/valores antigos de propósito: já existe gravado em produção
  // e trocar o valor interno quebraria os torneios em andamento. 'livre' aqui significa
  // "proporção destravada", NÃO "sorteio livre" — são eixos diferentes.
  window._ratioIsLocked = function (t) {
    return !(t && t.wlGroupBalance === 'livre');
  };

  /* VERIFICAÇÃO NA PORTA — o grupo só nasce se a composição REAL atender a proporção.
   *
   * Regra do dono (ago/2026): "só não quero que coloque 4 num grupo para depois perceber
   * que quebrou a regra." Não é redundância com _planGroupsByRatio: aquele é o PLANEJADOR,
   * e confiar nele é confiar que nenhum caminho futuro monte grupo por outra via e que a
   * resolução de gênero nunca falhe. Foi precisamente uma falha de resolução que deixou o
   * "R1 Grupo B2" fechar com 3 homens — o planejador da época "achou" que estava tudo certo.
   * Aqui a composição é conferida DEPOIS de resolvida e ANTES de o grupo existir.
   *
   * entradas: array de gêneros ('masculino'/'feminino'/'') ou de {gender, wildcard}.
   * Devolve true quando não há proporção (nada a violar).
   */
  window._groupMeetsRatio = function (entradas, ratio) {
    var cfg = RATIOS[String(ratio || '')];
    if (!cfg) return true;
    var arr = Array.isArray(entradas) ? entradas : [];
    var m = 0, f = 0, w = 0, x = 0;
    arr.forEach(function (e) {
      var g, wild = false;
      if (e && typeof e === 'object') { g = String(e.gender || ''); wild = !!e.wildcard; }
      else g = String(e || '');
      g = g.trim().toLowerCase();
      if (g.indexOf('masc') === 0) m++;
      else if (g.indexOf('fem') === 0) f++;
      else if (wild) w++;      // VAGA: preenche qualquer lado (não é pessoa)
      else x++;                // pessoa real sem gênero: nunca compõe grupo travado
    });
    if (x) return false;
    if (m > cfg.m || f > cfg.f) return false;
    // as vagas têm de tapar exatamente os buracos que sobraram
    return (cfg.m - m) + (cfg.f - f) === w;
  };

  /* DISTÂNCIA ATÉ A PROPORÇÃO — quanto uma composição EXCEDE as cotas de gênero.
   *
   * Nasceu na escolha do SUPLENTE de W.O. (v1.8.45, ordem do dono em 13/ago/2026, W.O.
   * da Glauce no R1 Grupo R do Confra): _"o homem na lista de espera passa na frente das
   * mulheres e vai compor um grupo que estava 0/100 para virar 25/75"_. Ali o
   * `_groupMeetsRatio` booleano NÃO serve de régua: num grupo que JÁ está fora da
   * proporção (4 mulheres em 25/75), TODO candidato "não atende" — e um booleano
   * bloquearia até a troca NEUTRA (mulher no lugar de mulher, que mantém o grupo
   * exatamente como estava). A distância ordena: 0 = a composição atende a proporção
   * exata; N = N pessoas além da cota do seu gênero; null = não dá pra medir (proporção
   * inválida OU alguém sem gênero declarado — gênero nunca é presumido).
   * Vaga (wildcard) não conta excesso: ela tapa o buraco de qualquer lado.
   */
  window._ratioDistance = function (entradas, ratio) {
    var cfg = RATIOS[String(ratio || '')];
    if (!cfg) return null;
    var arr = Array.isArray(entradas) ? entradas : [];
    var m = 0, f = 0, x = 0;
    arr.forEach(function (e) {
      var g, wild = false;
      if (e && typeof e === 'object') { g = String(e.gender || ''); wild = !!e.wildcard; }
      else g = String(e || '');
      g = g.trim().toLowerCase();
      if (g.indexOf('masc') === 0) m++;
      else if (g.indexOf('fem') === 0) f++;
      else if (!wild) x++;             // pessoa real sem gênero: não dá pra medir
    });
    if (x) return null;
    return Math.max(0, m - cfg.m) + Math.max(0, f - cfg.f);
  };

  /* DIVIDE O POOL EM GRUPOS respeitando a proporção.
   *
   * pool : [{ key, gender }]  — gender: 'masculino' | 'feminino' | '' (desconhecido)
   *        A ORDEM do array é respeitada dentro de cada gênero (o chamador já embaralhou).
   * opts : { ratio: '25/75', locked: true, size: 4 }
   *
   * Retorna { groups: [[key,...]], leftover: [key,...], flexed: N }
   *   groups   — grupos completos, na ordem em que devem ser criados
   *   leftover — quem sobrou (continua na fila; NUNCA some)
   *   flexed   — quantos grupos foram formados FORA da proporção (só com locked=false)
   */
  window._planGroupsByRatio = function (pool, opts) {
    opts = opts || {};
    var size = opts.size || 4;
    var cfg = RATIOS[String(opts.ratio || '')];
    var locked = opts.locked !== false;
    var arr = Array.isArray(pool) ? pool.slice() : [];

    var homens = [], mulheres = [], semGenero = [], coringas = [];
    arr.forEach(function (p) {
      if (!p) return;
      var g = String(p.gender || '');
      if (g === 'masculino') homens.push(p.key);
      else if (g === 'feminino') mulheres.push(p.key);
      // VAGA (placeholder): não é pessoa, é "alguém a definir". Preenche qualquer lugar
      // sem que ninguém seja presumido homem ou mulher — é o que mantém vivo o recurso de
      // completar grupo com vagas (tests/monarch-late-roster.test.js) sem furar a regra.
      else if (p.wildcard) coringas.push(p.key);
      else semGenero.push(p.key);   // NUNCA entra em grupo (nem na flexibilização)
    });
    // Sem proporção o coringa é só mais uma pessoa na fila.
    if (coringas.length && !cfg) { while (coringas.length) mulheres.push(coringas.shift()); }

    // Sem proporção configurada: o equilíbrio não tem o que perseguir — forma na ordem,
    // ainda excluindo quem não tem gênero (a regra do dono vale nos dois modos).
    if (!cfg) {
      var seq = homens.concat(mulheres), gs = [], i;
      for (i = 0; i + size <= seq.length; i += size) gs.push(seq.slice(i, i + size));
      return { groups: gs, leftover: seq.slice(gs.length * size).concat(semGenero), flexed: 0 };
    }

    // Quantos grupos EXATOS cabem. Os coringas (vagas) tapam o buraco de qualquer lado,
    // então G não sai de uma divisão simples: procura o maior G cujo déficit dos dois
    // gêneros caiba nas vagas disponíveis. (Sem vagas isto recai no min() de sempre.)
    var G = 0;
    var teto = Math.floor((homens.length + mulheres.length + coringas.length) / size);
    for (var cand = teto; cand >= 1; cand--) {
      var dM = Math.max(0, cand * cfg.m - homens.length);
      var dF = Math.max(0, cand * cfg.f - mulheres.length);
      if (dM + dF <= coringas.length) { G = cand; break; }
    }

    var groups = [], hi = 0, fi = 0, ci = 0, g, k;
    for (g = 0; g < G; g++) {
      var grp = [];
      for (k = 0; k < cfg.m; k++) grp.push(hi < homens.length ? homens[hi++] : coringas[ci++]);
      for (k = 0; k < cfg.f; k++) grp.push(fi < mulheres.length ? mulheres[fi++] : coringas[ci++]);
      groups.push(grp);
    }

    // Sobra de gênero conhecido (+ vagas não usadas) depois dos grupos exatos.
    var resto = homens.slice(hi).concat(mulheres.slice(fi)).concat(coringas.slice(ci));

    // TRAVADO: a sobra espera. É literalmente o pedido — nunca montar o grupo "errado" só
    // pra não deixar gente parada.
    if (locked) {
      return { groups: groups, leftover: resto.concat(semGenero), flexed: 0 };
    }

    // DESTRAVADO: já perseguimos a proporção ao máximo; agora inclui o máximo de gente,
    // formando grupos com o que sobrou, em qualquer composição.
    //
    // SEM GÊNERO na flexibilização (regra do dono, ago/2026): "se no sorteio inicial for
    // flexibilizada a proporção, os sem gênero entram DEPOIS de todos, mas entram. Um
    // entrante de última hora, nos últimos segundos antes do sorteio, entra sim. Só não
    // assume como gênero masc ou fem." — por isso eles vão pro FIM da fila de flexibilização
    // e nunca contam pra cota de nenhum lado.
    //
    // `flexIncludesUnknown` separa os dois momentos, que o dono tratou diferente:
    //   · SORTEIO INICIAL (true)  → quem está ali joga; ficar de fora do torneio inteiro por
    //     causa de um campo em branco no perfil seria punição desproporcional.
    //   · GRUPO NOVO da espera (false) → ali o dono foi explícito ("nunca, nem
    //     flexibilizando"): o sorteio já passou, há tempo de corrigir o campo pela Análise
    //     de Inscritos, e é justamente onde mora o risco de vantagem por atraso.
    var flexPool = (opts.flexIncludesUnknown ? resto.concat(semGenero) : resto);
    var flexed = 0;
    for (var j = 0; j + size <= flexPool.length; j += size) { groups.push(flexPool.slice(j, j + size)); flexed++; }
    var sobra = flexPool.slice(flexed * size);
    return {
      groups: groups,
      leftover: opts.flexIncludesUnknown ? sobra : sobra.concat(semGenero),
      flexed: flexed
    };
  };
})();
