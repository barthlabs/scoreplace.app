/* scoreplace.app — letzplay-profile.js
 * Card "Seu nível (letzplay)" no perfil. Lê users/{uid}.letzplayImport (já normalizado)
 * e renderiza: categoria OFICIAL (torneio) + rating recreativo (forma) num medidor
 * fluido FUN→A, footprint oficial×recreativo, duplas, stats. Self-contained (sem deps).
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : this;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // rating (1300..1850 ~ FUN..A) → posição 0..100% no medidor.
  function ratingPct(v) {
    if (v == null) return 35;
    var p = (v - 1300) / (1850 - 1300) * 100;
    return Math.max(3, Math.min(97, p));
  }

  // ══ CATEGORIA DO ATLETA — NUNCA "MISTA" ══════════════════════════════════════
  // Ordem do dono (11/ago/2026), vendo a ficha do @GersomOtsu (masculino no perfil)
  // dizer "categoria oficial: Mista D": _"não existe categoria Mista para atleta! é masc
  // ou fem. no torneio ele pode participar da categoria mista."_
  //
  // Ele está descrevendo duas coisas diferentes que estavam no mesmo campo: "Mista" é a
  // categoria do TORNEIO (uma dupla homem+mulher); a do ATLETA é a faixa dele dentro do
  // próprio gênero. Um homem que jogou a Mista D não "é" Mista D.
  //
  // CAUSA MEDIDA: a escolha em extension/lib/letzplay-import.js pega a skill mais alta de
  // QUALQUER torneio oficial — só exclui faixa etária. No footprint do Gersom, "Mista D" e
  // "Masculina D" empatam em D, e como a comparação é `>` estrito, a PRIMEIRA do array
  // vence. Era a Mista, por ordem de leitura.
  //
  // ⚠️ POR QUE A REGRA MORA AQUI E NÃO NA EXTENSÃO: corrigir só na origem deixaria errada
  // toda leitura já gravada — e o footprint completo já está no doc, então dá pra resolver
  // no render e curar o passado sem ninguém reler nada. As libs do letzplay vivem só em
  // extension/lib/ e o app não as carrega ([[project_letzplay_libs_single_source]]), então
  // a alternativa seria uma segunda cópia da regra, que é o defeito, não o conserto.
  var _SKILL_ORD = { 'FUN': 0, 'E': 1, 'D': 2, 'D+': 3, 'C-': 4, 'C': 5, 'C+': 6,
                     'B-': 7, 'B': 8, 'B+': 9, 'A-': 10, 'A': 11, 'PRO': 12 };
  // Token de skill mais alto presente no texto. Casa D+ antes de D (chaves da maior pra
  // menor) e exige fronteira, senão o "D" de "Duplas" viraria categoria.
  function skillDe(categoryRaw) {
    var up = String(categoryRaw || '').toUpperCase(), melhor = null, v = -1;
    Object.keys(_SKILL_ORD).sort(function (a, b) { return b.length - a.length; }).forEach(function (tok) {
      var e = tok.replace('+', '\\+').replace('-', '\\-');
      if (new RegExp('(^|[^A-Z+\\-])' + e + '($|[^A-Z+\\-])').test(up) && _SKILL_ORD[tok] > v) {
        v = _SKILL_ORD[tok]; melhor = tok;
      }
    });
    return melhor ? { tok: melhor, ord: v } : null;
  }
  // 'M' | 'F' | 'X' (mista) | null (não declarado no texto).
  // ⚠️ "Mista" tem que ser testada ANTES de qualquer coisa: é o caso que decide.
  function generoDe(categoryRaw) {
    var s = String(categoryRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/\bmist[oa]s?\b|\bmixed\b|\bdupla\s+mist/.test(s)) return 'X';
    if (/\bmasculin[oa]s?\b|\bmasc\b|\bmale\b/.test(s)) return 'M';
    if (/\bfeminin[oa]s?\b|\bfem\b|\bfemale\b/.test(s)) return 'F';
    return null;
  }
  function temIdade(categoryRaw) { return /\b(40|50|60|70)\b/.test(String(categoryRaw || '')); }

  // SÓ A CATEGORIA — o nome do torneio, quando vem grudado, é jogado fora.
  // MEDIDO no doc do @fabiogod (11/ago/2026): o campo `categoryRaw` NEM SEMPRE é só a
  // categoria. Vem assim, misturado, e depende do torneio:
  //   "Masculina D"                          → já é só a categoria
  //   "11º BT House Open - MASCULINA C"      → nome + categoria
  //   "8º ABACATEIRO OPEN - MASCULINA - C"   → nome + gênero + skill, em 3 partes
  // Sem isto, a ficha dele exibia "categoria oficial: 11º BT House Open - MASCULINA C" —
  // o nome do torneio inteiro dentro da pílula de categoria.
  //
  // A REGRA: parte por separador e devolve do PRIMEIRO pedaço que fala de gênero em
  // diante. É isso que separa "o que é nome" de "o que é categoria" sem precisar conhecer
  // os nomes — e mantém "MASCULINA - C" inteiro quando gênero e skill vêm separados.
  // Sem gênero em parte nenhuma, devolve o texto como está: quem decide daí é quem chama.
  function soCategoria(catRaw) {
    var s = String(catRaw == null ? '' : catRaw).replace(/\s+/g, ' ').trim();
    if (!s) return s;
    var partes = s.split(/\s+[-–—]\s+/);
    if (partes.length < 2) return s;
    for (var i = 0; i < partes.length; i++) {
      if (generoDe(partes[i])) return partes.slice(i).join(' - ');
    }
    return s;
  }

  /** A categoria oficial do ATLETA → { label, deMista } ou null.
   *  `deMista` = a skill veio de um torneio misto e o gênero foi OMITIDO de propósito. */
  root._lzCatAtleta = function (imp) {
    if (!imp || typeof imp !== 'object') return null;
    var comGenero = null, soSkill = null;
    function considera(catRawBruto, ageBand) {
      if (!catRawBruto || ageBand || temIdade(catRawBruto)) return;   // faixa etária nunca é a categoria base
      // JOGA FORA O NOME DO TORNEIO antes de qualquer coisa — ele vem grudado em parte dos
      // registros e ia inteiro pra pílula de categoria (ver soCategoria).
      var catRaw = soCategoria(catRawBruto);
      var sk = skillDe(catRaw); if (!sk) return;
      var g = generoDe(catRaw);
      if (g === 'M' || g === 'F') {
        if (!comGenero || sk.ord > comGenero.ord) comGenero = { label: String(catRaw).trim(), ord: sk.ord };
      } else if (!soSkill || sk.ord > soSkill.ord) {
        // Mista OU sem gênero no texto: guarda só a SKILL. Ela é do atleta; o rótulo de
        // gênero do torneio não é. Melhor "D" verdadeiro que "Mista D" falso.
        soSkill = { label: sk.tok, ord: sk.ord, deMista: g === 'X' };
      }
    }
    // ORDEM IMPORTA no EMPATE. O campo já gravado vem primeiro e, como a substituição só
    // acontece com skill ESTRITAMENTE maior, ele vence quando empata — que é o certo: ele é
    // a escolha que o app já exibia, e costuma trazer o rótulo por extenso ("Feminina C")
    // enquanto o footprint traz a abreviação ("Fem C"). Inverter isso trocaria o rótulo de
    // quem está correto sem nenhum ganho (pego pela suíte letzplay-level-bar, com o dado da
    // @camilacalia).
    // ⚠️ Mas ele NUNCA é aceito cru: passa pelo mesmo filtro, então uma "Mista D" gravada
    // continua barrada — era exatamente esta a porta dos fundos que faltava fechar.
    // ⛔ NUNCA ACEITAR O NOME DO TORNEIO COMO CATEGORIA. `categoryRaw` guarda o rótulo
    // CRU do letzplay, e ele frequentemente é o nome inteiro do evento — a M.delia
    // apareceu com "Consolation D/C --6º Torneio Feminino – Ilha de Comandatuba –
    // Consolation---Categoria D/C" ocupando duas linhas no lugar da categoria
    // (print do dono, 17/ago/2026: "isso nao é categoria porra").
    // Categoria é rótulo CURTO. Qualquer coisa longa é nome de evento, e nome de evento
    // não é categoria — mesmo que tenha um "D/C" dentro.
    var oc = imp.officialCategory;
    if (oc && oc.categoryRaw && String(oc.categoryRaw).trim().length <= 24) {
      considera(oc.categoryRaw, null);
    }
    (imp.footprint || []).forEach(function (f) { if (f && f.official) considera(f.categoryRaw, f.ageBand); });
    if (comGenero) return { label: comGenero.label, deMista: false };
    if (soSkill) return { label: soSkill.label, deMista: !!soSkill.deMista };
    return null;
  };

  // tile centralizado. valHtml já é HTML (permite cor); x = sublinha.
  function tileH(k, valHtml, x) {
    return '<div style="background:var(--bg-darker,#0f1420);border:1px solid var(--border-color,#28313f);border-radius:9px;padding:9px 11px;text-align:center;">' +
      '<div style="font-size:11px;color:var(--text-muted,#8b93a3);font-weight:600;">' + esc(k) + '</div>' +
      '<div style="font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;margin-top:2px;">' + valHtml + '</div>' +
      (x ? '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:1px;">' + esc(x) + '</div>' : '') + '</div>';
  }
  function tile(k, v, x) { return tileH(k, esc(v), x); }
  // v1.8.98: tile de duas medidas com o mesmo peso visual (atual e recorde). O
  // `tileH` só tem UM valor grande + um rodapé pequeno, e o rodapé rebaixaria o
  // recorde a legenda.
  function _tileSeq(atualHtml, maior) {
    var linha = function (rot, val) {
      return '<div style="margin-top:2px;">' +
        '<div style="font-size:11px;color:var(--text-muted,#8b93a3);font-weight:600;">' + esc(rot) + '</div>' +
        '<div style="font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;">' + val + '</div>' +
      '</div>';
    };
    return '<div style="background:var(--bg-darker,#0f1420);border:1px solid var(--border-color,#28313f);border-radius:9px;padding:9px 11px;text-align:center;">' +
      linha('sequência atual', atualHtml) +
      (maior > 0 ? linha('maior sequência', '<span style="color:#2dd4a0;">' + maior + 'V</span>') : '') +
    '</div>';
  }

  /** Retorna o HTML do card "Seu nível (geral)", ou '' se não há import.
   * spExtra (opcional) mistura o scoreplace: { tournaments:[{name,sport,year}],
   * wins, losses } — torneios do scoreplace entram na coluna OFICIAL e as V/D
   * somam no Total. */
  // MEDIDOR DE NÍVEL — categoria oficial · forma · barra FUN→A com a bolinha.
  // Vive aqui sozinho porque aparece em DOIS lugares: nas estatísticas do jogador e no
  // diálogo do histórico do letzplay (pedido do dono, 30/jul/2026). Duplicar o markup
  // seria garantir que um dia os dois divergem.
  root._lzLevelBar = function (imp) {
    if (!imp || typeof imp !== 'object') return '';
    var cat = root._lzCatAtleta(imp), r = imp.rating || {};
    // ⭐ A BOLINHA MORA ONDE O RÓTULO DIZ (1.9.29). Ela seguia `r.value` — outra régua —
    // e contradizia o rótulo ao lado: a Bruna saía "D+" com a bolinha em B-, o Fábio
    // "D-" com a bolinha acima do D. Agora sai de `_lzPctDaCategoria`, que fala a
    // mesma língua dos rótulos impressos (FUN·D·C·B·A em 10/30/50/70/90%).
    // ⚠️ O fallback pros pontos NÃO é decoração: quem ainda não tem torneio lido não tem
    // rótulo, e aí a régua por pontos é a única coisa que situa a pessoa.
    var _csPos = (typeof window._lzCategoriaDoImport === 'function') ? window._lzCategoriaDoImport(imp) : null;
    var _pctCat = (_csPos && typeof window._lzPctDaCategoria === 'function') ? window._lzPctDaCategoria(_csPos.rotulo) : null;
    var pct = (_pctCat != null) ? _pctCat : ratingPct(r.value);
    var gStops = 'linear-gradient(90deg,#dc2626 0%,#ef7a2b ' + Math.max(6, pct - 22) + '%,#eab308 ' +
      Math.max(10, pct - 12) + '%,#16a34a ' + Math.max(14, pct - 5) + '%,#16a34a ' +
      Math.min(88, pct + 5) + '%,#eab308 ' + Math.min(92, pct + 14) + '%,#ef7a2b ' +
      Math.min(97, pct + 26) + '%,#dc2626 100%)';
    // A faixa vem da RÉGUA ÚNICA intercalada, derivada dos pontos (store.js) — não da
    // banda gravada pela extensão, que dependia de gênero. Ver window.SP_ESCADA.
    var _faixa = (typeof window._lzBanda === 'function') ? window._lzBanda(r.value) : null;
    // ⭐ A CATEGORIA COM SINAL, LIGADA (17/ago/2026, ordem do dono). Vem de
    // window._lzCategoriaComSinal: base = categoria de torneio, "+" para quem busca a de
    // cima / domina a própria / está no topo, "-" para quem está na base.
    // ⚠️ Ela SUBSTITUI a antiga "categoria oficial", que era o rótulo mais difícil já
    // disputado alguma vez na vida — e que trazia nome de torneio, "Rodada: N" e faixa
    // etária no lugar da categoria.
    var _cs = _csPos;   // mesma leitura que posicionou a bolinha — não pode divergir
    // "Feminina C+" / "Masculina D" — o rótulo que o organizador usa pra inscrever.
    // ⚠️ O GÊNERO NÃO MORA NO IMPORT. `imp.gender` é undefined — ele vive no scan, e por
    // isso a Bruna saía "D+" pelado, sem o "Feminina". Buscar nos dois, e em último caso
    // deduzir da própria categoria ("Fem C+", "Feminina D").
    var _cats = ((imp && imp.footprint) || []).map(function (f) { return (f && f.categoryRaw) || ''; }).join(' ');
    var _g = String((imp && imp.gender) || (imp && imp.scan && imp.scan.gender) ||
                    (window.AppStore && window.AppStore.currentUser && imp === window.AppStore.currentUser.letzplayImport
                       ? window.AppStore.currentUser.gender : '') || '').toLowerCase();
    if (!_g && /\bfem/i.test(_cats)) _g = 'feminino';
    else if (!_g && /\bmasc/i.test(_cats)) _g = 'masculino';
    var _gen = /fem/.test(_g) ? 'Feminina ' : (/mas/.test(_g) ? 'Masculina ' : '');
    var offHtml = cat
      ? '<span title="' + (cat.deMista ? 'faixa apurada em torneio misto — o gênero é do torneio, não do atleta' : 'categoria oficial disputada em torneio') +
        '" style="font-family:ui-monospace,Menlo,monospace;font-weight:700;background:rgba(16,185,129,0.16);color:#2dd4a0;padding:2px 9px;border-radius:6px;">' + esc(cat.label) + '</span>'
      : '<span style="color:var(--text-muted,#8b93a3);">—</span>';
    return '' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:4px;">' +
        // ⭐ SÓ A CATEGORIA, INTEIRA. Ordem do dono (17/ago/2026): "que porra é essa de no
        // lugar e faixa. É feminina C+ e acabou porra." O motivo do sinal e a faixa por
        // pontos saíram da tela — quem precisa do porquê tem no título; a tela mostra o
        // rótulo que o organizador usa pra inscrever, com gênero: "Feminina C+".
        ('<div><span style="font-size:11px;color:var(--text-muted,#8b93a3);">categoria</span><br>' +
          (_cs
            ? ('<span title="' + esc(_cs.porque) + '" style="font-family:ui-monospace,Menlo,monospace;font-weight:700;' +
               'background:rgba(16,185,129,0.16);color:#2dd4a0;padding:2px 9px;border-radius:6px;">' +
               esc(_gen + _cs.rotulo) + '</span>')
            : offHtml) + '</div>') +
        // ⛔ A "FORMA" SAIU (17/ago/2026). Ordem do dono: "os outros tem essa merda de
        // forma que nao é porra nenhuma". Ela era a banda do rating — a MESMA informação
        // que a bolinha da régua logo abaixo já mostra, e em melhor forma: a régua situa
        // a pessoa entre FUN e A, a letra sozinha não situa nada. Duas leituras do mesmo
        // número, uma delas pior, é ruído.
        // Os PONTOS continuam, porque são o número que resume o atleta.
        // ── OS PONTOS ────────────────────────────────────────────────────────────
        // Ordem do dono (11/ago/2026): _"vamos dar mais destaque para os 14xx pontos do
        // atleta. para isso ser uma coisa a ser notada."_ Antes eram 11px em cinza-muted,
        // atrás de um "·", grudados na forma — MENORES que qualquer outra coisa da linha,
        // quando são o número que resume o atleta.
        // Ficam à DIREITA (margin-left:auto) e não ao lado da forma: a numeração precisa
        // de um canto próprio pra ser lida como valor, não como legenda da faixa.
        (r.value
          ? '<div style="margin-left:auto;text-align:right;">' +
              '<span style="font-size:11px;color:var(--text-muted,#8b93a3);">pontos</span><br>' +
              '<span style="font-family:ui-monospace,Menlo,monospace;font-size:26px;font-weight:800;line-height:1;' +
                'color:#2dd4a0;text-shadow:0 0 18px rgba(45,212,160,.28);font-variant-numeric:tabular-nums;">' + r.value + '</span>' +
            '</div>'
          : '') +
      '</div>' +
      '<div style="margin-top:10px;">' +
        '<div style="display:flex;">' + ['FUN', 'D', 'C', 'B', 'A'].map(function (t) {
          return '<span style="flex:1;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;color:var(--text-muted,#8b93a3);">' + t + '</span>';
        }).join('') + '</div>' +
        '<div style="position:relative;height:20px;border-radius:11px;margin-top:5px;background:' + gStops + ';box-shadow:inset 0 1px 4px rgba(0,0,0,.3);">' +
          '<span style="position:absolute;top:50%;left:' + pct.toFixed(1) + '%;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;background:#fff;border:3px solid #0f9d6b;box-shadow:0 0 0 4px rgba(16,157,107,.22);"></span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted,#8b93a3);margin-top:7px;"><span>↓ abaixo</span><span style="color:#2dd4a0;font-weight:700;">no seu nível</span><span>acima ↑</span></div>' +
      '</div>';
  };

  root._renderLetzplayCard = function (imp, spExtra) {
    if (!imp || typeof imp !== 'object') return '';
    spExtra = spExtra || {};
    var spT = Array.isArray(spExtra.tournaments) ? spExtra.tournaments : [];
    var spW = spExtra.wins || 0, spL = spExtra.losses || 0;
    var off = root._lzCatAtleta(imp);            // NUNCA "Mista" — ver _lzCatAtleta
    var r = imp.rating || {};
    var st = imp.stats || {};
    // Mesma regra do _lzLevelBar: a bolinha segue o RÓTULO; os pontos são o fallback de
    // quem ainda não tem torneio lido. Duplicar o critério aqui seria garantir divergência.
    var _csCard = (typeof window._lzCategoriaDoImport === 'function') ? window._lzCategoriaDoImport(imp) : null;
    var _pctCard = (_csCard && typeof window._lzPctDaCategoria === 'function') ? window._lzPctDaCategoria(_csCard.rotulo) : null;
    var pct = (_pctCard != null) ? _pctCard : ratingPct(r.value);

    // medidor: gradiente verde-no-centro (do rating) → vermelho nas pontas.
    var gStops = 'linear-gradient(90deg,#dc2626 0%,#ef7a2b ' + Math.max(6, pct - 22) + '%,#eab308 ' +
      Math.max(10, pct - 12) + '%,#16a34a ' + Math.max(14, pct - 5) + '%,#16a34a ' +
      Math.min(88, pct + 5) + '%,#eab308 ' + Math.min(92, pct + 14) + '%,#ef7a2b ' +
      Math.min(97, pct + 26) + '%,#dc2626 100%)';

    var offHtml = off
      ? '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;background:rgba(16,185,129,0.16);color:#2dd4a0;padding:2px 9px;border-radius:6px;">' + esc(off.label) + '</span>'
      : '<span style="color:var(--text-muted,#8b93a3);">—</span>';

    // ── Data de conclusão (mês/ano) + ordenação cronológica ──────────────
    // Letzplay: último jogo da competição (imp.games). Scoreplace: end/startDate
    // do torneio. Datas letzplay vêm "Sábado, 20/06/26" (dia-da-semana antes) —
    // extrai dd/mm/aa em QUALQUER posição (âncora ^…$ falhava e sumia a data).
    var _MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    function _ts(raw) {
      if (typeof raw === 'number') return raw;                        // já é timestamp
      // canônico em store.js — dd/mm nunca é lido como mm/dd
      return (typeof window._spTsData === 'function') ? window._spTsData(raw, { fallback: 0 }) : 0;
    }
    function monYr(raw) { var t = _ts(raw); if (!t) return null; var d = new Date(t); return _MON[d.getMonth()] + '/' + d.getFullYear(); }
    function prettyClub(slug) {
      if (!slug) return '';
      return String(slug).split(/[-_]/).map(function (w) { return w.length <= 3 ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1)); }).join(' ');
    }
    var _games = Array.isArray(imp.games) ? imp.games : [];
    function concluded(f, official) {                                 // {when, ts} do último jogo DAQUELE torneio
      var best = 0;
      // Quando o torneio tem id (import novo), casa a data pelos jogos DAQUELE torneio
      // (tourneyId) — não por categoria. Isso conserta "Masc D" jogada em 2 torneios
      // pegando a data do mais recente. Sem id (import antigo), cai no match por categoria.
      var refId = (f.tourneyId != null) ? f.tourneyId : (f.rankingId != null ? f.rankingId : null);
      var refField = (f.tourneyId != null) ? 'tourneyId' : 'rankingId';
      for (var i = 0; i < _games.length; i++) {
        var g = _games[i];
        if (g.official !== official) continue;
        if (refId != null) {
          if (g[refField] == null || String(g[refField]) !== String(refId)) continue;
        } else {
          if (g.competition !== f.categoryRaw) continue;
          if (f.year != null && g.year != null && g.year !== f.year) continue;
          if (f.club && g.club && g.club !== f.club) continue;
        }
        var t = _ts(g.date); if (t > best) best = t;
      }
      if (best) return { when: monYr(best), ts: best };
      return { when: (f.year ? String(f.year) : null), ts: (f.year ? new Date(f.year, 11, 31).getTime() : 0) };
    }
    // NOME do torneio pra a linha de cima: clube (quando houver) + NOME REAL (f.name,
    // do og:title via fillTourneyNames). Sem nome real, o rótulo é o próprio clube; sem
    // clube, cai na categoria. A categoria vai numa 2ª linha embaixo (não aqui).
    function lpName(f) {
      var c = prettyClub(f.club);
      var nm = (f.name && f.name !== f.categoryRaw) ? f.name : null;
      if (nm) return c ? (c + ' · ' + nm) : nm;
      return c || f.categoryRaw || '';
    }

    // OFICIAL = torneios (eventos únicos): letzplay (🎾) + scoreplace mata-mata (🏆).
    // RANKING = temporadas contínuas: rankings letzplay (🎾) + Liga/Pontos Corridos do
    // scoreplace (🏆). Liga é ranking, NÃO torneio — vai na coluna de ranking.
    var footOff = (imp.footprint || []).filter(function (f) { return f.official && lpClubeValido(f); })
      .map(function (f) { var c = concluded(f, true); var nm = lpName(f); return { name: nm, cat: (f.categoryRaw && f.categoryRaw !== nm) ? f.categoryRaw : '', when: c.when, ts: c.ts, pos: f.position, wins: f.wins, losses: f.losses, src: '🎾', logo: f.logo || null, ref: (f.tourneyId != null && f.club) ? ('t/' + f.club + '/' + f.tourneyId) : null }; });
    var footRec = (imp.footprint || []).filter(function (f) { return !f.official && lpClubeValido(f); })
      .map(function (f) { var c = concluded(f, false); var nm = lpName(f); return { name: nm, cat: (f.categoryRaw && f.categoryRaw !== nm) ? f.categoryRaw : '', when: c.when, ts: c.ts, pos: f.position, wins: f.wins, losses: f.losses, src: '🎾', logo: f.logo || null, ref: (f.rankingId != null && f.club) ? ('r/' + f.club + '/' + f.rankingId) : null }; });
    spT.forEach(function (s) {
      var t = _ts(s.date);
      var row = { name: s.name, cat: s.sport || '', when: monYr(s.date) || (s.year ? String(s.year) : null), ts: t || (s.year ? new Date(s.year, 11, 31).getTime() : 0), pos: null, wins: null, losses: null, src: '🏆', spId: s.id || s.tId || null };
      if (s.isRanking) footRec.push(row); else footOff.push(row);   // Liga → ranking
    });
    // Guarda o import do card atual pra o handler de clique da linha resolver o detalhe.
    root._spCardImp = imp;
    footOff.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });  // mais recente no topo
    footRec.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    // Abre o detalhe (letzplay torneio/ranking → gráfico+classificação+jogos; scoreplace → torneio real).
    function clickAttrs(f) {
      if (f.ref) return ' data-lp-ref="' + esc(f.ref) + '" style="cursor:pointer;" title="Ver detalhes">';
      if (f.spId) return ' data-sp-tid="' + esc(f.spId) + '" style="cursor:pointer;" title="Abrir torneio">';
      return '>';
    }
    // Logo real do letzplay (cloudinary) quando importado; senão o emoji bola. 18x18 redondo.
    function iconHtml(f) {
      if (f.logo) return '<img src="' + esc(f.logo) + '" alt="" loading="lazy" style="width:18px;height:18px;border-radius:5px;object-fit:cover;vertical-align:-4px;margin-right:2px;" onerror="this.style.display=\'none\';">';
      return (f.src || '•') + ' ';
    }
    var caret = '<span style="color:var(--text-muted,#8b93a3);font-weight:400;"> ›</span>';
    // OFICIAL (torneio): 1 LINHA só — nome + data, SEM saldo. Nome longo quebra linha.
    function footRowOfficial(f) {
      var wh = f.when ? ('<span style="color:var(--text-muted,#8b93a3);font-weight:400;"> · ' + esc(f.when) + '</span>') : '';
      var clickable = f.ref || f.spId;
      return '<div class="lp-foot-row"' + clickAttrs(f) + '<div style="font-size:12.5px;color:var(--text-main,#cbd5e1);font-weight:600;line-height:1.4;word-break:break-word;overflow-wrap:anywhere;padding:5px 0;' + (clickable ? 'cursor:pointer;' : '') + '">' +
        iconHtml(f) + esc(f.name) + wh + (clickable ? caret : '') + '</div></div>';
    }
    // RANKING: nome (esq) + categoria + data numa 2ª linha embaixo. SEM número/saldo à
    // direita (o usuário não quer os números vermelhos). Nome longo quebra linha.
    function footRowRanking(f) {
      var subBits = [];
      if (f.cat) subBits.push(esc(f.cat));
      if (f.when) subBits.push(esc(f.when));
      var sub = subBits.join(' · ');
      var clickable = f.ref || f.spId;
      return '<div class="lp-foot-row"' + clickAttrs(f) + '<div style="padding:5px 0;' + (clickable ? 'cursor:pointer;' : '') + '">' +
        '<div style="font-size:12.5px;color:var(--text-main,#cbd5e1);font-weight:600;line-height:1.35;word-break:break-word;overflow-wrap:anywhere;">' + iconHtml(f) + esc(f.name) + (clickable ? caret : '') + '</div>' +
        (sub ? '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:1px;">' + sub + '</div>' : '') +
      '</div></div>';
    }
    function footList(arr, kind) {
      var fn = (kind === 'off') ? footRowOfficial : footRowRanking;
      return arr.map(fn).join('') || '<div style="font-size:12px;color:var(--text-muted,#8b93a3);">—</div>';
    }

    var pairsHtml = (st.pairs || []).slice(0, 6).map(function (p) {
      var strong = (p.wins > p.losses);
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12.5px;">' +
        '<span>com <b>' + esc(p.partner) + '</b></span>' +
        '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:' + (strong ? '#2dd4a0' : 'var(--text-muted,#8b93a3)') + ';">' + p.wins + '–' + p.losses + '</span></div>';
    }).join('');

    var totW = (st.wins != null) ? st.wins : (imp.profile && imp.profile.totals ? imp.profile.totals.wins : '');
    var totL = (st.losses != null) ? st.losses : (imp.profile && imp.profile.totals ? imp.profile.totals.losses : '');
    // soma scoreplace (V/D) ao total do letzplay
    var totWn = ((typeof totW === 'number') ? totW : (parseInt(totW, 10) || 0)) + spW;
    var totLn = ((typeof totL === 'number') ? totL : (parseInt(totL, 10) || 0)) + spL;
    var _gTot = totWn + totLn;
    var winPct = _gTot ? Math.round(totWn / _gTot * 100) : 0;
    // Total: verde nas vitórias (V), vermelho nas derrotas (D).
    // v1.8.98: SEM o traço entre V e D (ordem do dono) — ele empurrava a segunda
    // linha e desalinhava os números. Agora são duas linhas de grade: o número à
    // direita e a letra à esquerda, então 53/53 ficam na mesma coluna.
    // v1.8.99: o bloco fica CENTRALIZADO no box (ordem do dono: "quem mandou jogar na
    // direita do box"). Eu tinha alinhado à direita por conta própria — o pedido era só
    // tirar o traço pra os números alinharem entre si.
    // A grade continua existindo, mas agora ela é `inline-grid` e o container centraliza:
    // os DÍGITOS seguem alinhados um sob o outro (é o que o traço estragava) e o
    // conjunto fica no meio da caixa.
    var _linhaVD = function (n, letra, cor) {
      return '<div style="display:inline-grid;grid-template-columns:auto auto;align-items:baseline;gap:6px;color:' + cor + ';">' +
        '<span style="text-align:right;">' + n + '</span><span style="text-align:left;">' + letra + '</span></div>';
    };
    var totalHtml = '<div style="text-align:center;">' + _linhaVD(totWn, 'V', '#2dd4a0') + '</div>' +
                    '<div style="text-align:center;">' + _linhaVD(totLn, 'D', '#f87171') + '</div>';

    // Sequência atual: derivada dos jogos letzplay (com data), do mais recente
    // pra trás — conta a fila de resultados iguais no topo.
    // ── v1.8.97: a sequência considera letzplay + scoreplace ────────────────
    // Antes saía só de `_games` (letzplay). O "Total" ao lado já somava os dois, então
    // o card se contradizia: o dono tinha 1V e o tile marcava 2V, porque o último jogo
    // do letzplay é bem mais antigo que as partidas dele no scoreplace.
    // `spExtra.resultados` traz os jogos do scoreplace já como {ts, won}; a ordenação e
    // a regra de "sem data não é o mais recente" moram em window._sequenciaAtual.
    var _seqItens = _games
      .filter(function (g) { return typeof g.won === 'boolean'; })
      .map(function (g) { return { ts: _ts(g.date), won: g.won }; })
      .concat(Array.isArray(spExtra.resultados) ? spExtra.resultados : []);
    var _seq = (typeof root._sequenciaAtual === 'function')
      ? root._sequenciaAtual(_seqItens)
      : { n: 0, won: null };
    var _stN = _seq.n, _stT = _seq.won;
    var streakHtml = _stN
      ? '<span style="color:' + (_stT ? '#2dd4a0' : '#f87171') + ';">' + _stN + (_stT ? 'V' : 'D') + '</span>'
      : '<span style="color:var(--text-muted,#8b93a3);">—</span>';

    return '' +
      '<div style="background:var(--bg-card,#141a24);border:1px solid var(--border-color,#28313f);border-radius:14px;padding:15px 16px;margin:12px 0;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:3px;">🎾 Seu nível (geral)</div>' +
        '<div style="font-size:10.5px;color:var(--text-muted,#8b93a3);margin-bottom:11px;">letzplay @' + esc(imp.handle) + ' + scoreplace</div>' +

        root._lzLevelBar(imp) +

        // tiles
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px;">' +
          // v1.8.98: o rodapé perdeu "letzplay + scoreplace" (ordem do dono) — o card já
          // diz isso no cabeçalho, e ali embaixo virava três linhas de ruído.
          tileH('Total', totalHtml, winPct + '%') +
          // v1.8.98: DUAS linhas com o MESMO destaque — ordem do dono: "sequencia
          // atual: x vitorias e abaixo, maior sequencia: x vitorias (com o mesmo
          // destaque)". Antes o recorde ia no rodapé, em letra pequena, como se fosse
          // legenda; ele é um número tão relevante quanto o atual.
          _tileSeq(streakHtml, _seq.maiorV) +
          tile('Oficiais', footOff.length, 'torneios') +
        '</div>' +

        // footprint
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">' +
          '<div><div style="font-size:11px;font-weight:700;color:#2dd4a0;margin-bottom:3px;">OFICIAL (torneio)</div>' + footList(footOff, 'off') + '</div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted,#8b93a3);margin-bottom:3px;">RANKING</div>' + footList(footRec, 'rec') + '</div>' +
        '</div>' +

        // duplas
        (pairsHtml ? '<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:4px;">Suas duplas</div>' + pairsHtml + '</div>' : '') +

        // privacidade — dados públicos do letzplay; a consulta é autorizada nos
        // Termos de Uso (2.0.50 — o toggle de autorização morreu).
        '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:12px;border-top:1px solid var(--border-color,#28313f);padding-top:9px;">' +
          'Histórico público do letzplay (nomes e placares) — consulta autorizada nos Termos de Uso' +
          (imp.importedAt ? '; importado em ' + esc(String(imp.importedAt).slice(0, 10)) : '') + '.' +
        '</div>' +
      '</div>';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DETALHE DO TORNEIO (letzplay): gráfico do SEU desempenho + classificação
  // completa (todos os participantes) + os SEUS jogos. Aberto ao clicar numa
  // linha da lista OFICIAL/RANKING. Resolve tudo por REFERÊNCIA (club/tourneyId).
  // ─────────────────────────────────────────────────────────────────────────
  function lpTs(raw) {
    if (typeof raw === 'number') return raw;
    var s = String(raw || '').trim(); if (!s) return 0;
    return (typeof window._spTsData === 'function') ? window._spTsData(s, { fallback: 0 }) : 0;
  }
  // Sparkline do saldo acumulado (V=+1, D=−1) nos jogos DAQUELE torneio, cronológico.
  function saldoSvg(games) {
    var g2 = games.filter(function (g) { return g.won === true || g.won === false; })
      .slice().sort(function (a, b) { return lpTs(a.date) - lpTs(b.date); });
    var pts = [], s = 0;
    g2.forEach(function (g) { s += g.won ? 1 : -1; pts.push(s); });
    if (pts.length < 2) return '';
    var W = 300, H = 96, pad = 12;
    var allv = pts.concat([0]);
    var min = Math.min.apply(null, allv), max = Math.max.apply(null, allv), range = (max - min) || 1;
    var stepX = (W - 2 * pad) / (pts.length - 1);
    function X(i) { return pad + i * stepX; }
    function Y(v) { return pad + (1 - (v - min) / range) * (H - 2 * pad); }
    var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    var clr = last > 0 ? '#2dd4a0' : (last < 0 ? '#f87171' : '#8b93a3');
    var zY = Y(0).toFixed(1);
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="96" preserveAspectRatio="none" style="display:block;">' +
      '<line x1="' + pad + '" y1="' + zY + '" x2="' + (W - pad) + '" y2="' + zY + '" stroke="rgba(255,255,255,.16)" stroke-dasharray="3 3"/>' +
      '<path d="' + d + '" fill="none" stroke="' + clr + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(last).toFixed(1) + '" r="3.6" fill="' + clr + '"/>' +
    '</svg>';
  }
  // Fonte única em store.js (window._lzClubeValido) — a Análise de Inscritos usa a MESMA.
  function lpClubeValido(f) {
    return (typeof window._lzClubeValido === 'function') ? window._lzClubeValido(f) : !!f;
  }

  // CURA DE LEITURA para classificações já gravadas por uma extensão anterior a 2.02.
  // Dois estragos, ambos medidos no doc real: (a) o badge do letzplay entrava COLADO no
  // nome ("Fabio Ruggiero Inativo"); (b) o nome de uma linha vazava para todas as
  // seguintes, então a classificação inteira saía com a MESMA pessoa. O handle, esse,
  // sempre esteve certo em toda linha.
  // Mostrar o nome de OUTRA pessoa é pior que não mostrar nome: quando o mesmo rótulo se
  // repete no grupo, ele deixa de ser identidade e cai para o handle, que é.
  function lpCuraNomes(rows) {
    var vezes = {};
    (rows || []).forEach(function (r) {
      var k = ((r.players || []).join('/') || '').trim().toLowerCase();
      if (k) vezes[k] = (vezes[k] || 0) + 1;
    });
    return (rows || []).map(function (r) {
      var nomes = (r.players || []).map(function (s) {
        return String(s).replace(/\s+(Inativo|Ativo)$/i, '').replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      var k = (nomes.join('/') || '').trim().toLowerCase();
      var repetido = k && vezes[((r.players || []).join('/') || '').trim().toLowerCase()] > 1;
      if (!nomes.length || repetido) {
        var h = (r.handles || []).filter(Boolean);
        if (h.length) nomes = h.slice();
      }
      return { pos: r.pos, players: nomes, handles: r.handles, points: r.points,
               wins: r.wins, losses: r.losses, inactive: r.inactive };
    });
  }
  root._lpCuraNomes = lpCuraNomes;

  function standingsHtml(standings, myHandle) {
    if (!standings || !standings.length) {
      return '<div style="font-size:12px;color:var(--text-muted,#8b93a3);padding:8px 0;">Classificação completa disponível após reimportar com a extensão atualizada.</div>';
    }
    var myH = String(myHandle || '').toLowerCase();
    return standings.map(function (grp) {
      var isRk = grp.ranking === true;   // ranking: mostra PONTOS; torneio: mostra V–D
      var rows = lpCuraNomes(grp.rows).map(function (r) {
        var mine = (r.handles || []).some(function (h) { return String(h).toLowerCase() === myH; });
        var players = (r.players || []).map(esc).join(' / ') || '—';
        var rightVal = isRk
          ? (r.points != null ? ('<b>' + r.points + '</b> pts') : '')
          : ((r.wins != null || r.losses != null) ? ((r.wins || 0) + '–' + (r.losses || 0)) : '');
        var inactive = r.inactive ? ' <span style="color:#f59e0b;font-size:10px;">inativo</span>' : '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;' +
          (mine ? 'background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.35);' : '') + '">' +
          '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:800;color:' + (mine ? '#2dd4a0' : 'var(--text-muted,#8b93a3)') + ';min-width:22px;">' + (r.pos != null ? r.pos + 'º' : '–') + '</span>' +
          '<span style="flex:1;font-size:12.5px;color:var(--text-main,#cbd5e1);font-weight:' + (mine ? '700' : '500') + ';">' + players + (mine ? ' <span style="color:#2dd4a0;font-size:11px;">(você)</span>' : '') + inactive + '</span>' +
          (rightVal ? '<span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--text-muted,#8b93a3);">' + rightVal + '</span>' : '') +
        '</div>';
      }).join('');
      // Ranking = classificação única (o header "CLASSIFICAÇÃO" acima já rotula) → sem
      // título de grupo redundante. Torneio = mostra "GRUPO 01/02…".
      var groupTitle = isRk ? '' :
        '<div style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#2dd4a0;margin-bottom:4px;">' + esc(grp.group || 'Grupo') + '</div>';
      return '<div style="margin-top:10px;">' + groupTitle + rows + '</div>';
    }).join('');
  }
  function gamesHtml(games) {
    var g2 = games.slice().sort(function (a, b) { return lpTs(b.date) - lpTs(a.date); });
    if (!g2.length) return '<div style="font-size:12px;color:var(--text-muted,#8b93a3);padding:8px 0;">Sem jogos seus registrados aqui.</div>';
    return g2.map(function (g) {
      var won = g.won === true, lost = g.won === false;
      var badge = won ? '<span style="color:#2dd4a0;font-weight:800;">V</span>' : (lost ? '<span style="color:#f87171;font-weight:800;">D</span>' : '<span style="color:var(--text-muted,#8b93a3);">–</span>');
      var opps = (Array.isArray(g.oppNames) ? g.oppNames.filter(Boolean) : []).map(esc).join(' / ') || 'adversário';
      var withP = g.partnerName ? '<span style="color:var(--text-muted,#8b93a3);">com ' + esc(g.partnerName) + '</span> ' : '';
      var score = (typeof g.myScore === 'number' && typeof g.oppScore === 'number')
        ? '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:var(--text-main,#cbd5e1);">' + g.myScore + '–' + g.oppScore + '</span>' : '';
      var dt = g.date ? '<span style="color:var(--text-muted,#8b93a3);font-size:11px;">' + esc(String(g.date).replace(/^[^,]*,\s*/, '')) + '</span>' : '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--border-color,#28313f);">' +
        '<span style="min-width:16px;text-align:center;">' + badge + '</span>' +
        '<span style="flex:1;font-size:12.5px;color:var(--text-main,#cbd5e1);">' + withP + '<span style="color:var(--text-muted,#8b93a3);">vs</span> ' + opps + '</span>' +
        score + ' ' + dt +
      '</div>';
    }).join('');
  }

  function closeLpTourneyDetail() {
    var el = document.getElementById('lp-tourney-detail-overlay');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.removeEventListener('keydown', _lpDetailEsc);
  }
  function _lpDetailEsc(e) { if (e.key === 'Escape') closeLpTourneyDetail(); }
  root._closeLpTourneyDetail = closeLpTourneyDetail;

  // ref = 't/club/tourneyId' (torneio) ou 'r/club/rankingId' (ranking).
  root._openLpTourneyDetail = function (ref) {
    var imp = root._spCardImp;
    if (!imp || !ref) return;
    var parts = String(ref).split('/');
    var kind = parts[0], club = parts[1], cid = parts.slice(2).join('/');
    var isRanking = (kind === 'r');
    var f = (window._spCompByRefStr ? window._spCompByRefStr(imp, ref) : null);
    var name = (f && f.name && f.name !== f.categoryRaw) ? f.name : (f ? f.categoryRaw : cid);
    var standings = f ? f.standings : null;
    var logo = f ? f.logo : null;
    var idField = isRanking ? 'rankingId' : 'tourneyId';
    var myGames = (Array.isArray(imp.games) ? imp.games : []).filter(function (g) {
      return g && (!!g.official === !isRanking) && g[idField] != null && String(g[idField]) === String(cid) && (g.club || '') === club;
    });
    var w = myGames.filter(function (g) { return g.won === true; }).length;
    var l = myGames.filter(function (g) { return g.won === false; }).length;
    var spark = saldoSvg(myGames);
    var kindLabel = isRanking ? 'ranking' : 'torneio';
    var logoHtml = logo
      ? '<img src="' + esc(logo) + '" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover;flex:0 0 34px;" onerror="this.style.display=\'none\';">'
      : '<span style="font-size:22px;">🎾</span>';

    closeLpTourneyDetail();
    var ov = document.createElement('div');
    ov.id = 'lp-tourney-detail-overlay';
    ov.style.cssText = 'position:fixed;inset:60px 0 0 0;z-index:10020;background:var(--bg-dark,#0b0f17);overflow-y:auto;-webkit-overflow-scrolling:touch;';
    ov.innerHTML =
      '<div style="max-width:640px;margin:0 auto;padding:14px 16px 60px;">' +
        '<button onclick="window._closeLpTourneyDetail()" style="background:var(--bg-card,#141a24);border:1px solid var(--border-color,#28313f);color:var(--text-main,#cbd5e1);border-radius:10px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;">← Voltar</button>' +
        '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 2px;">' + logoHtml +
          '<div style="font-size:17px;font-weight:800;color:var(--text-bright,#fff);line-height:1.3;">' + esc(name) + '</div></div>' +
        '<div style="font-size:12px;color:var(--text-muted,#8b93a3);margin-bottom:14px;">Seu desempenho: <span style="color:#2dd4a0;font-weight:700;">' + w + ' V</span> – <span style="color:#f87171;font-weight:700;">' + l + ' D</span> · ' + myGames.length + ' jogo' + (myGames.length === 1 ? '' : 's') + '</div>' +
        (spark ? ('<div style="background:var(--info-box-bg,#141a24);border:1px solid var(--border-color,#28313f);border-radius:12px;padding:12px;margin-bottom:16px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#8b93a3);margin-bottom:6px;">Saldo V/D ao longo do ' + kindLabel + '</div>' + spark + '</div>') : '') +
        '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#8b93a3);margin-bottom:2px;">Classificação</div>' +
        standingsHtml(standings, imp.handle) +
        '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#8b93a3);margin:18px 0 2px;">Seus jogos</div>' +
        gamesHtml(myGames) +
      '</div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', _lpDetailEsc);
  };

  // Delegação de clique nas linhas da lista (letzplay torneio/ranking → detalhe; scoreplace → torneio).
  document.addEventListener('click', function (e) {
    var row = e.target && e.target.closest ? e.target.closest('.lp-foot-row') : null;
    if (!row) return;
    var ref = row.getAttribute('data-lp-ref');
    if (ref) { e.preventDefault(); root._openLpTourneyDetail(ref); return; }
    var sid = row.getAttribute('data-sp-tid');
    if (sid) { e.preventDefault(); window.location.hash = '#tournaments/' + sid; }
  });
})();
