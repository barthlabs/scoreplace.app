/* chaves.js — DESENHO DETERMINÍSTICO DE CHAVES (Eliminatória Simples e Dupla).
 *
 * PRINCÍPIO: a chave é função pura de (número de participantes, formato).
 * Cada N tem UM desenho, absoluto e imutável. Dois torneios com 11 duplas têm
 * exatamente a mesma estrutura de confrontos, byes e repescagens.
 *
 * POR QUE ESTE ARQUIVO EXISTE (v1.5.5, torneio de casais, falha ao vivo):
 * o id do jogo era cunhado com Date.now() (`p0-1738412955-3`). Id por timestamp
 * NÃO é derivável da estrutura, então recalcular a chave gerava ids novos e
 * órfãos TODOS os resultados já lançados (que moram em tournaments/{id}/results/
 * {matchId}). Sem poder recalcular, a entrada de um tardio só podia ser feita
 * operando o grafo vivo à mão — ~1.250 linhas de cirurgia incremental que
 * quebraram em quadra (tardio sem jogo, "vs a definir" preso, perdedor sem
 * pouso na inferior, auto-confronto Time X vs Time X na re-propagação).
 *
 * A CORREÇÃO É O ID: aqui o id é ESTRUTURAL — `VC-R1-P3`, derivável de
 * (N, formato). Recalcular a chave inteira reproduz os mesmos ids, e os
 * resultados se re-ancoram sozinhos. Cirurgia deixa de ser necessária.
 *
 * REGRAS (não "consertar" sem ler antes):
 *  • NUNCA persista a chave. Persista participantes[] e resultados{}.
 *  • NUNCA grave o número do jogo ("JOGO 7") — é rótulo de tela, some no render.
 *  • NUNCA resorteie ao admitir tardio: ele entra na PRÓXIMA POSIÇÃO LIVRE.
 *  • Byes e repescagens são camada DERIVADA — recalculam a cada N, e tudo bem.
 *  • Confronto normal já existente NUNCA muda (garantido por teste, ver abaixo).
 *
 * Invariantes travados em tests/chaves-aceite.test.js e tests/chaves-stress.test.js
 * (344 + 26.805 asserções, N=2..64, nos dois formatos). Se alguém reintroduzir
 * patch incremental na chave, aquelas suítes ficam vermelhas.
 */
(function () {
  'use strict';

  var proxPow2 = function (n) { var b = 1; while (b < n) b *= 2; return b; };

  /**
   * Ajuste de entrada: quantos byes e quantas repescagens.
   * vagas = posições da R1 sem adversário   (B - N)
   * pool  = jogos normais da R1 = perdedores gerados  (N - B/2)
   * Aplica-se o MENOR dos dois; EMPATE VAI PARA BYE.
   * Repescagem só cobre até `pool`, pois cada uma consome um perdedor.
   */
  function plano(N) {
    if (N < 2) throw new Error('N minimo = 2');
    var B = Math.max(2, proxPow2(N));
    var vagas = B - N;
    var pool = N - B / 2;
    var modo = vagas <= pool ? 'bye' : 'repescagem';
    var repescagens = modo === 'bye' ? 0 : Math.min(vagas, pool);
    return { N: N, B: B, vagas: vagas, pool: pool, menor: Math.min(vagas, pool), modo: modo, repescagens: repescagens, byes: vagas - repescagens };
  }

  function ordemSeeds(size) {
    var o = [1];
    while (o.length < size) {
      var n = o.length * 2;
      o = o.flatMap(function (p) { return [p, n + 1 - p]; });
    }
    return o;
  }

  var S = function (seed) { return { tipo: 'seed', seed: seed }; };
  var V = function (id) { return { tipo: 'vencedor', de: id }; };
  var P = function (id) { return { tipo: 'perdedor', de: id }; };
  var R = function (id) { return { tipo: 'repescado', de: id }; };
  var VAZIO = { tipo: 'vazio' };

  /**
   * @param {number} N   participantes
   * @param {'simples'|'dupla'} formato
   * @returns {{plano, rodadas, jogos: Array, porId: Object, totalJogos: number, ordem: string[]}}
   */
  function chave(N, formato) {
    formato = formato || 'simples';
    var pl = plano(N);
    var B = pl.B, repescagens = pl.repescagens;
    var rodadas = Math.log2(B);
    var ordem = ordemSeeds(B);
    var jogos = [];
    var novo = function (o) { jogos.push(o); return o; };

    // ---------- Rodada 1 da chave superior ----------
    var pares = [];
    for (var i = 0; i < B / 2; i++) pares.push([ordem[2 * i], ordem[2 * i + 1]]);

    var normais = [], vagas = [];
    pares.forEach(function (par, i) {
      var a = par[0], b = par[1];
      if (a <= N && b <= N) normais.push(i);
      else vagas.push({ seed: Math.min(a, b), pos: i });
    });
    vagas.sort(function (x, y) { return y.seed - x.seed; }); // piores seeds recebem repescado

    var R1 = new Array(B / 2);
    var id1 = function (i) { return 'VC-R1-P' + (i + 1); };

    normais.forEach(function (i) {
      R1[i] = novo({
        id: id1(i), fase: 'VC', rodada: 1, pos: i + 1, tipo: 'normal',
        entradas: [S(pares[i][0]), S(pares[i][1])], perdedorDesce: true
      });
    });

    // repescagem: receptor sempre na metade OPOSTA à do jogo de origem
    var livres = normais.slice();
    vagas.slice(0, repescagens).forEach(function (v) {
      var seed = v.seed, pos = v.pos;
      var meta = B / 4;
      var cand = livres.filter(function (j) { return (j < meta) !== (pos < meta); });
      var src = (cand.length ? cand : livres)[0];
      livres.splice(livres.indexOf(src), 1);
      R1[src].perdedorDesce = false; // derrota anulada: vira repescado
      R1[pos] = novo({
        id: id1(pos), fase: 'VC', rodada: 1, pos: pos + 1, tipo: 'repescagem',
        entradas: [S(seed), R(id1(src))], perdedorDesce: true, origemRepescado: id1(src)
      });
    });

    vagas.slice(repescagens).forEach(function (v) {
      R1[v.pos] = novo({
        id: id1(v.pos), fase: 'VC', rodada: 1, pos: v.pos + 1, tipo: 'bye',
        entradas: [S(v.seed), VAZIO], perdedorDesce: false
      });
    });

    // ---------- Demais rodadas da superior ----------
    var VC = { 1: R1 };
    for (var r = 2; r <= rodadas; r++) {
      (function (r) {
        var pv = VC[r - 1];
        VC[r] = Array.from({ length: pv.length / 2 }, function (_, i) {
          return novo({
            id: 'VC-R' + r + '-P' + (i + 1), fase: 'VC', rodada: r, pos: i + 1, tipo: 'normal',
            entradas: [V(pv[2 * i].id), V(pv[2 * i + 1].id)], perdedorDesce: true
          });
        });
      })(r);
    }

    // ---------- Chave inferior (dupla eliminatória) ----------
    var PD = {};
    var gf = null;
    var nlb = 2 * rodadas - 2;
    if (formato === 'dupla' && rodadas >= 2) {
      PD[1] = Array.from({ length: B / 4 }, function (_, i) {
        return novo({
          id: 'PD-R1-P' + (i + 1), fase: 'PD', rodada: 1, pos: i + 1, tipo: 'normal',
          entradas: [P(VC[1][2 * i].id), P(VC[1][2 * i + 1].id)]
        });
      });
      for (var lr = 2; lr <= nlb; lr++) {
        (function (lr) {
          var c = B / Math.pow(2, Math.ceil(lr / 2) + 1);
          var pv = PD[lr - 1];
          PD[lr] = Array.from({ length: c }, function (_, i) {
            return novo({
              id: 'PD-R' + lr + '-P' + (i + 1), fase: 'PD', rodada: lr, pos: i + 1, tipo: 'normal',
              entradas: lr % 2 === 0
                ? [V(pv[i].id), P(VC[lr / 2 + 1][c - 1 - i].id)]   // descida da superior
                : [V(pv[2 * i].id), V(pv[2 * i + 1].id)]
            });
          });
        })(lr);
      }
      gf = novo({
        id: 'GF', fase: 'GF', rodada: 1, pos: 1, tipo: 'normal',
        entradas: [V(VC[rodadas][0].id), V(PD[nlb][0].id)]
      });
      novo({
        id: 'GF-EXTRA', fase: 'GF', rodada: 2, pos: 1, tipo: 'extra',
        condicional: true, entradas: [V('GF'), P('GF')]
      });
    }

    // ---------- Ordem cronológica ----------
    var seq = [];
    var push = function (arr) { if (arr) seq.push.apply(seq, arr.filter(Boolean)); };
    // na R1 os jogos normais precedem as repescagens: a repescagem consome o
    // perdedor de um jogo normal, então a dependência é real, não estética.
    var R1ordenada = R1.filter(function (m) { return m && m.tipo !== 'repescagem'; })
      .concat(R1.filter(function (m) { return m && m.tipo === 'repescagem'; }));
    if (formato !== 'dupla') {
      push(R1ordenada);
      for (var k1 = 2; k1 <= rodadas; k1++) push(VC[k1]);
    } else {
      push(R1ordenada); push(PD[1]);
      for (var k = 2; k <= rodadas; k++) {
        push(VC[k]);
        var pair = [2 * k - 2, 2 * k - 1];
        for (var pi = 0; pi < pair.length; pi++) {
          var rr = pair[pi];
          if (rr >= 2 && rr <= nlb) push(PD[rr]);
        }
      }
      if (gf) seq.push(gf);
    }

    // ---------- Resolução de byes + numeração (DERIVADA, nunca persistida) ----------
    var porId = {};
    jogos.forEach(function (j) { porId[j.id] = j; });
    var real = {}; // id -> {vencedor:{vivo,rotulo}, perdedor, perdedorBruto}

    var resolver = function (e) {
      if (e.tipo === 'vazio') return { vivo: false, rotulo: 'BYE' };
      if (e.tipo === 'seed') return e.seed <= N
        ? { vivo: true, rotulo: '#' + e.seed } : { vivo: false, rotulo: 'BYE' };
      var f = real[e.de];
      if (e.tipo === 'vencedor') return f.vencedor;
      if (e.tipo === 'repescado') return { vivo: f.perdedorBruto.vivo, rotulo: f.perdedorBruto.rotulo + ' rep' };
      return porId[e.de].perdedorDesce === false
        ? { vivo: false, rotulo: 'BYE' } : f.perdedor;
    };

    var n = 0;
    seq.forEach(function (j) {
      var res = j.entradas.map(resolver);
      var a = res[0], b = res[1];
      j.rotulos = [a.rotulo, b.rotulo];
      if (!a.vivo && !b.vivo) {
        j.disputado = false;
        real[j.id] = { vencedor: { vivo: false, rotulo: 'BYE' }, perdedor: { vivo: false, rotulo: 'BYE' }, perdedorBruto: { vivo: false, rotulo: 'BYE' } };
      } else if (!a.vivo || !b.vivo) {
        j.disputado = false; j.avancaDireto = a.vivo ? a : b;
        real[j.id] = { vencedor: a.vivo ? a : b, perdedor: { vivo: false, rotulo: 'BYE' }, perdedorBruto: { vivo: false, rotulo: 'BYE' } };
      } else {
        j.disputado = true; j.numero = ++n;
        real[j.id] = {
          vencedor: { vivo: true, rotulo: 'V' + n },
          perdedor: { vivo: true, rotulo: 'P' + n },
          perdedorBruto: { vivo: true, rotulo: 'P' + n }
        };
      }
    });
    if (porId['GF-EXTRA']) { porId['GF-EXTRA'].numero = n + 1; porId['GF-EXTRA'].disputado = null; }

    return {
      plano: pl, rodadas: rodadas, jogos: jogos, porId: porId, totalJogos: n,
      ordem: seq.map(function (j) { return j.id; })
    };
  }

  /**
   * Uma inscrição tardia só pode redesenhar enquanto NADA foi jogado.
   * Depois do 1º resultado a chave está congelada: byes já foram consumidos
   * e posições já viraram fato. Só restam 2 saídas — lista de espera, ou
   * refazer descartando os resultados. NÃO existe terceira.
   */
  function podeRedesenhar(resultados) {
    var lancados = Object.keys(resultados || {}).length;
    return lancados === 0
      ? { ok: true }
      : { ok: false, motivo: lancados + ' resultado(s) lancado(s)', opcoes: ['lista_de_espera', 'refazer_descartando_resultados'] };
  }

  /* ======================================================================
   * ADMISSÃO INCREMENTAL DE TARDIOS
   * O sorteio (equipe -> posição) é IMUTÁVEL. Tardio entra na PRÓXIMA posição
   * livre; ninguém é deslocado, nada é resorteado.
   *
   * Propriedade verificada em toda a faixa: enquanto B não muda, os jogos
   * normais da R1 são ANINHADOS — um par (a,b) é real quando a<=N e b<=N, e
   * aumentar N nunca torna um par falso. Cada tardio cria exatamente 1 jogo
   * normal novo (contra a posição B-N) e não toca em confronto existente.
   *
   * Duas exceções, ambas inevitáveis:
   *  1. Repescagens são camada derivada — podem ser criadas/destruídas a cada
   *     tardio. INOFENSIVO: repescagem só é jogável depois dos jogos normais
   *     da R1, então enquanto há admissão nenhuma foi disputada. NÃO avise o
   *     organizador, NÃO peça confirmação.
   *  2. Cruzar potência de 2 redesenha TUDO. De 16 p/ 17 os 8 confrontos são
   *     perdidos e não há conserto — com 17 inscritos só 1 pode ser eliminado
   *     na R1, logo só cabe 1 jogo. EXIJA confirmação explícita (avisoPotencia2).
   * ==================================================================== */

  /** Sorteio inicial. Chamar UMA vez. Semente guardada para auditoria. */
  function sortear(equipes, opts) {
    opts = opts || {};
    var aleatorio = opts.aleatorio !== false;
    var semente = opts.semente != null ? opts.semente : Date.now();
    var participantes = equipes.slice();
    if (aleatorio) {
      var s = semente >>> 0;
      var rnd = function () {
        s = (s + 0x6d2b79f5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (var i = participantes.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var tmp = participantes[i]; participantes[i] = participantes[j]; participantes[j] = tmp;
      }
    }
    return { participantes: participantes, semente: semente, sorteadoEm: new Date().toISOString() };
  }

  /** Admite tardios no FIM da ordem. Nunca desloca quem já estava. */
  function admitir(sorteio) {
    var tardios = Array.prototype.slice.call(arguments, 1);
    return Object.assign({}, sorteio, { participantes: sorteio.participantes.concat(tardios) });
  }

  var assinatura = function (j) {
    return j.tipo + ':' + j.entradas.map(function (e) {
      return e.tipo === 'seed' ? '#' + e.seed : e.tipo === 'vazio' ? '-' : e.tipo + '(' + e.de + ')';
    }).join(' x ');
  };

  /** O que muda na R1 ao passar de nAntes para nDepois participantes. */
  function delta(nAntes, nDepois, formato) {
    formato = formato || 'simples';
    var r1 = function (N) {
      var o = {};
      chave(N, formato).jogos
        .filter(function (j) { return j.fase === 'VC' && j.rodada === 1; })
        .forEach(function (j) { o[j.id] = assinatura(j); });
      return o;
    };
    var a = nAntes >= 2 ? r1(nAntes) : {};
    var b = r1(nDepois);
    var out = { redesenhoTotal: plano(nAntes).B !== plano(nDepois).B, criados: [], destruidos: [], preservados: [] };
    var ids = {};
    Object.keys(a).forEach(function (k) { ids[k] = 1; });
    Object.keys(b).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (id) {
      if (a[id] === b[id]) { if (a[id]) out.preservados.push(id); return; }
      if (a[id] && a[id].indexOf('bye') !== 0) out.destruidos.push({ id: id, era: a[id] });
      if (b[id] && b[id].indexOf('bye') !== 0) out.criados.push({ id: id, agora: b[id] });
    });
    return out;
  }

  /** Avisa o organizador quando a próxima inscrição DOBRA a chave. */
  function avisoPotencia2(N) {
    var B = plano(N).B;
    return N === B
      ? { alerta: true, mensagem: 'Chave cheia (' + B + '). A próxima inscrição dobra a chave para ' + (B * 2) + ' e redesenha todos os confrontos.' }
      : { alerta: false, vagasAteDobrar: B - N };
  }

  var api = {
    plano: plano,
    chave: chave,
    podeRedesenhar: podeRedesenhar,
    sortear: sortear,
    admitir: admitir,
    delta: delta,
    avisoPotencia2: avisoPotencia2
  };
  // Dual-mode: browser (<script> → window) e Node (require direto, como
  // phases-engine.js já faz). Sem isto, um teste que dá require() no
  // phases-engine sem o sandbox não encontra o motor.
  if (typeof window !== 'undefined') window._chaves = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
