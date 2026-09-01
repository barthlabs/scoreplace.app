/* DUAS PORTAS, UM CLASSIFICADO — o pré-cheque tem que enxergar o MESMO conjunto que o
 * materializador. node tests/duas-portas-um-classificado.test.js
 *
 * A FALHA REAL, medida na Confra em 01/set/2026 (leitura de produção, sem escrita):
 * duas funções respondem "quem classifica" e montavam os opts à mão, cada uma do seu jeito.
 *   • `selectQualifiers`   — o PRÉ-CHEQUE do painel "promover linha" (advanceMultiPhase);
 *   • `buildPhaseBrackets` — quem MATERIALIZA a fase (é ela que publica).
 * O pré-cheque repassava `source.flatOverall`; o materializador não. Com o doc da Confra
 * (`scope:'overall'`, `flatOverall:true`, 2 linhas 1..999, 35 grupos de Rei/Rainha), o
 * pré-cheque via **Ouro=1 / Prata=1** e a fase nascia com **35/35**.
 *
 * O ESTRAGO NÃO ERA COSMÉTICO: o gate `_phasePromoteHelps` recusa `size <= 1`, então com
 * 1/1 o painel NUNCA aparecia. Com os 35/35 de verdade — dois ímpares — ele DEVIA aparecer:
 * uma promoção deixa 36/34 e ninguém fica sem adversário. O organizador perdia uma decisão
 * de mérito que é dele, sem jamais saber que ela existia, e a fase caía em BYE/repescagem.
 *
 * A segunda divergência do mesmo par (achada no mesmo dia): SEM `source.mapping`, o
 * pré-cheque assumia `rankTo:999` e o materializador `rankTo:2` — 16 entrantes contra 8.
 *
 * ⛔ O QUE ESTE TESTE NÃO DEIXA VOLTAR: as duas portas voltarem a montar os opts/mapping à
 * mão. É por isso que há uma metade ESTRUTURAL no fim — equivalência medida em N cenários
 * prova os N; a fonte única prova o resto.
 */
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
global.window = global.window || global;
var E = require(path.join(ROOT, 'js/views/phases-engine.js'));

var falhas = 0;
function ok(nome, cond, extra) {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
}

console.log('──── duas portas, um classificado ────');

// ── cenário: grupos de 4 do Rei/Rainha, com a força EMBARALHADA entre grupos ─────────
// (mesma fixture de ouro-prata-sai-dos-seletores: os números são os que o R/R produz —
// todos os 1ºs empatam em vitórias e quem separa é o saldo de games.)
function gruposDe4(N) {
  var out = [];
  for (var g = 0; g < N; g++) {
    var s = (g * 7) % N;
    out.push({ name: 'R1 Grupo ' + g, standings: [1, 2, 3, 4].map(function (pos) {
      return { name: 'G' + g + 'P' + pos, uid: 'u' + g + '-' + pos, played: 3,
               wins: 4 - pos, losses: pos - 1,
               gamesWon: 12 + s - (pos - 1) * 3, gamesLost: 6 + (pos - 1) * 3 };
    }) });
  }
  return out;
}
var cs = function (g) { return g.standings; };
function tamanhos(byDest) {
  return Object.keys(byDest || {}).sort().map(function (k) { return k + '=' + (byDest[k] || []).length; }).join(' ');
}
// As DUAS portas, com a MESMA informação de fase anterior nas duas.
function portas(prevGroups, cfg, prevRRRodadaUnica) {
  return {
    pre: E.selectQualifiers(prevGroups, cfg, { computeStandings: cs, prevRRRodadaUnica: prevRRRodadaUnica === true }),
    mat: E.buildPhaseBrackets(prevGroups, Object.assign({}, cfg, { _prevRRRodadaUnica: prevRRRodadaUnica === true }), cs, 'ph').byDest
  };
}

// ── 1. a CONFIG REAL do Confra, lida do snapshot de produção ─────────────────────────
var PROD = require(path.join(ROOT, 'tests/fixtures/prod-tournaments.json'));
var confra = PROD[0];
var cfgConfra = confra.phases[1];
ok('o snapshot de produção ainda é o Confra de 2 fases', /Confra/i.test(confra.name || '') && (confra.phases || []).length === 2,
  'veio ' + confra.name + ' com ' + (confra.phases || []).length + ' fases');
ok('a fase 2 dele tem o legado no disco: scope=overall + flatOverall=true',
  cfgConfra.source.scope === 'overall' && cfgConfra.source.flatOverall === true,
  'scope=' + cfgConfra.source.scope + ' flatOverall=' + cfgConfra.source.flatOverall);
ok('  → e a fase 1 é Rei/Rainha de RODADA ÚNICA (é o que torna aquele campo legado)',
  E.ehReiRainhaRodadaUnica(confra.phases[0]) === true);

var g35 = gruposDe4(35);
var p = portas(g35, cfgConfra, true);
ok('35 grupos: o pré-cheque enxerga o MESMO conjunto que o materializador',
  tamanhos(p.pre) === tamanhos(p.mat), 'pré-cheque ' + tamanhos(p.pre) + '  ×  materializa ' + tamanhos(p.mat));
ok('  → e o conjunto é o que o dono mandou: 35 duplas de Ouro e 35 de Prata',
  (p.mat.upper || []).length === 35 && (p.mat.lower || []).length === 35, tamanhos(p.mat));

// ⛔ O MATERIALIZADOR NÃO PODE TER MUDADO. É ele que publicou a fase do Confra; consertar o
// pré-cheque não pode reescrever chave que já foi ao ar. Ouro = 1º+2º do MESMO grupo.
var intraGrupo = (p.mat.upper || []).concat(p.mat.lower || []).every(function (tm) {
  return tm.p1Name && tm.p2Name && tm.p1Name.split('P')[0] === tm.p2Name.split('P')[0];
});
ok('  → nenhuma dupla mistura grupos (o sorteio publicado continua igual)', intraGrupo);

// ── 2. o gate do painel decide sobre o conjunto CERTO ────────────────────────────────
// ⚠️ A `_phasePromoteHelps` REAL, extraída do arquivo — NÃO uma réplica. Réplica sai de
// sincronia em silêncio e o teste passa a medir a si mesmo. Mesmo idioma que
// classificatory-phase-sweep.test.js já usa (o headless não sobe tournaments-draw-prep.js).
var promoveAjuda = (function () {
  var fonte = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw-prep.js'), 'utf8');
  var m = fonte.match(/window\._phasePromoteHelps = function[\s\S]*?\n\};/);
  if (!m) return null;
  var f = null;
  eval('f = ' + m[0].replace('window._phasePromoteHelps = ', '').replace(/;$/, ''));
  return f;
})();
ok('a regra do painel é a REAL (window._phasePromoteHelps, lida do arquivo)',
  typeof promoveAjuda === 'function' &&
  promoveAjuda([{ size: 7 }, { size: 7 }]) === true &&    // dois ímpares → promover zera
  promoveAjuda([{ size: 6 }, { size: 6 }]) === false &&   // já pares → nada a fazer
  promoveAjuda([{ size: 1 }, { size: 1 }]) === false);    // ⬅ era ISTO que o 1/1 falso disparava
function linhas(byDest, cfg) {
  return (((cfg || {}).source || {}).mapping || [])
    .map(function (m) { return { label: m.label || m.dest, dest: m.dest, size: (byDest[m.dest] || []).length }; })
    .filter(function (l) { return l.size > 0; });
}
var lPre = linhas(p.pre, cfgConfra), lMat = linhas(p.mat, cfgConfra);
ok('35/35 são DOIS ímpares → o painel "promover linha" tem que ser oferecido',
  promoveAjuda(lMat) === true, JSON.stringify(lMat));
ok('  → e o pré-cheque chega ao MESMO veredicto (antes dizia não, por ler 1/1)',
  promoveAjuda(lPre) === promoveAjuda(lMat),
  'pré-cheque=' + promoveAjuda(lPre) + ' materializa=' + promoveAjuda(lMat));

// 34 grupos (o número do snapshot): par dos dois lados → não oferece. As portas seguem juntas.
var p34 = portas(gruposDe4(34), cfgConfra, true);
ok('34 grupos: as portas continuam iguais (e o painel, corretamente, não aparece)',
  tamanhos(p34.pre) === tamanhos(p34.mat) &&
  promoveAjuda(linhas(p34.pre, cfgConfra)) === false && promoveAjuda(linhas(p34.mat, cfgConfra)) === false,
  'pré-cheque ' + tamanhos(p34.pre) + '  ×  materializa ' + tamanhos(p34.mat));

// ── 3. `flatOverall` LEGÍTIMO continua valendo — nas DUAS portas ─────────────────────
// Rei/Rainha de VÁRIAS rodadas: os grupos rotacionam, "1º do grupo" não quer dizer nada, e
// o ranking geral plano é o certo. É o que format2.compileToPhases grava pra rodadas>1.
// Aqui o corte é EXPLÍCITO (1..8) — sem faixa aberta o legado da Confra nem se aplica.
var cfgMultiRodada = {
  name: 'Eliminatória', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
  source: { type: 'previous_phase', scope: 'overall', flatOverall: true,
            mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 8, label: 'Ouro' },
                      { dest: 'lower', rankFrom: 1, rankTo: 8, label: 'Prata' }] }
};
var pm = portas(gruposDe4(10), cfgMultiRodada, false);   // prevRRRodadaUnica = false → NÃO é legado
ok('flatOverall legítimo (R/R de várias rodadas) é honrado nas DUAS portas',
  tamanhos(pm.pre) === tamanhos(pm.mat), 'pré-cheque ' + tamanhos(pm.pre) + '  ×  materializa ' + tamanhos(pm.mat));
ok('  → e ele achata mesmo: o top-8 do TORNEIO vira 4 duplas (2 por linha), não 10 por linha',
  (pm.mat.upper || []).length === 2 && (pm.mat.lower || []).length === 2, tamanhos(pm.mat));
var cruzaGrupos = (pm.mat.upper || []).some(function (tm) {
  return tm.p1Name && tm.p2Name && tm.p1Name.split('P')[0] !== tm.p2Name.split('P')[0];
});
ok('  → e as duplas cruzam grupos (é isso que "ranking geral plano" significa)', cruzaGrupos);

// O MESMO doc, mas com a fase anterior de rodada ÚNICA: aí `flatOverall` é resíduo e vale
// false — a mesma régua com que `_mappingLegadoConfra` lê `rankTo:999`.
var geral = (typeof E.usaRankingGeral === 'function') ? E.usaRankingGeral : null;
ok('a regra "usa ranking geral?" é exportada pelo motor', geral !== null);
ok('a regra canônica: flatOverall gravado sobre R/R de rodada única vale FALSE',
  geral && geral('overall', 2, 10, true, true) === false && geral('overall', 2, 10, true, false) === true,
  geral ? ('unica=' + geral('overall', 2, 10, true, true) + ' varias=' + geral('overall', 2, 10, true, false)) : 'não exportada');
ok('  → e escopo Geral com 2+ linhas de 2+ grupos degenera pra POR GRUPO (regra v3.0.x intacta)',
  geral && geral('overall', 2, 10, false, false) === false &&
  geral('overall', 1, 10, false, false) === true &&   // 1 linha: pool único de verdade
  geral('overall', 2, 1, false, false) === true &&    // 1 grupo: idem
  geral('per_group', 1, 1, true, false) === false);   // escopo por grupo nunca é geral

// ── 3b. a premissa que sustenta ler `flatOverall` literalmente ──────────────────────
// A regra acima não pede uma 2ª prova de que a fase anterior era Rei/Rainha. Ela pode
// porque quem ESCREVE o campo só o liga pro Rei/Rainha. Se alguém passar a gravar
// `flatOverall:true` em outro formato (ex.: Fase de Grupos de verdade, onde os grupos NÃO
// rotacionam), a premissa cai e o achatamento passaria a valer onde não deve — por isso a
// premissa é medida aqui, no fonte, e não assumida.
var f2 = fs.readFileSync(path.join(ROOT, 'js/views/format2.js'), 'utf8');
var escritas = f2.match(/flatOverall:[^\n]*/g) || [];
ok('format2.compileToPhases só liga flatOverall pro Rei/Rainha (' + escritas.length + ' escrita(s))',
  escritas.length >= 1 && escritas.every(function (l) { return /parceria\s*===\s*'rei_rainha'/.test(l); }),
  escritas.join('\n      '));

// ── 4. a SEGUNDA divergência: o default do mapping ──────────────────────────────────
var cfgSemMapping = { name: 'X', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
                      source: { type: 'previous_phase' } };
var ps = portas(gruposDe4(8), cfgSemMapping, false);
ok('fase SEM source.mapping: as portas usam o MESMO default (era 999 × 2 → 16 × 8)',
  tamanhos(ps.pre) === tamanhos(ps.mat), 'pré-cheque ' + tamanhos(ps.pre) + '  ×  materializa ' + tamanhos(ps.mat));
ok('  → e o default é o do materializador, que é quem publica (rankTo:2)',
  typeof E.mappingDaTransicao === 'function' &&
  E.mappingDaTransicao(cfgSemMapping)[0].rankTo === 2 &&
  E.mappingDaTransicao(cfgConfra).length === 2,   // com mapping no doc, devolve o do doc
  typeof E.mappingDaTransicao === 'function' ? JSON.stringify(E.mappingDaTransicao(cfgSemMapping)) : 'mappingDaTransicao não existe');

// ── 5. varredura: as portas concordam em TODA a matriz de formas ────────────────────
var divergentes = [];
[['overall', true], ['overall', false], ['per_group', true], ['per_group', false]].forEach(function (par) {
  [1, 2].forEach(function (nLinhas) {
    [1, 3, 9].forEach(function (nGrupos) {
      [true, false].forEach(function (rrUnica) {
        [999, 2].forEach(function (rankTo) {
          var mp = [{ dest: 'upper', rankFrom: 1, rankTo: rankTo, label: 'A' }];
          if (nLinhas === 2) mp.push({ dest: 'lower', rankFrom: 1, rankTo: rankTo, label: 'B' });
          var cfg = { name: 'X', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
                      source: { type: 'previous_phase', scope: par[0], flatOverall: par[1], mapping: mp } };
          var r = portas(gruposDe4(nGrupos), cfg, rrUnica);
          if (tamanhos(r.pre) !== tamanhos(r.mat)) {
            divergentes.push(par[0] + '/flat=' + par[1] + '/linhas=' + nLinhas + '/grupos=' + nGrupos +
              '/rrUnica=' + rrUnica + '/rankTo=' + rankTo + ': ' + tamanhos(r.pre) + ' × ' + tamanhos(r.mat));
          }
        });
      });
    });
  });
});
ok('96 combinações de (escopo × flatOverall × linhas × grupos × rodada única × corte): zero divergência',
  divergentes.length === 0, divergentes.slice(0, 5).join('\n      '));

// ── 6. ESTRUTURAL: fonte única, senão a divergência volta ───────────────────────────
// Equivalência medida prova os cenários medidos. O que impede o próximo caso é as duas
// portas NÃO poderem montar os opts por conta própria.
var src = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
function corpoDe(nome) {
  var i = src.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  var j = src.indexOf('\n  }', i);
  return src.slice(i, j < 0 ? src.length : j);
}
['selectQualifiers', 'buildPhaseBrackets'].forEach(function (fn) {
  var corpo = corpoDe(fn);
  ok(fn + ' monta os opts por optsDaTransicao (não à mão)',
    corpo.indexOf('optsDaTransicao(') >= 0 && !/flatOverall\s*:/.test(corpo),
    'achei flatOverall montado à mão dentro de ' + fn);
  ok('  ' + fn + ' pega o mapping por mappingDaTransicao (mesmo default)',
    corpo.indexOf('mappingDaTransicao(') >= 0 && !/rankTo:\s*\d+\s*\}\]/.test(corpo),
    'achei um default de mapping próprio dentro de ' + fn);
});
ok('a regra "usa ranking geral?" existe UMA vez, como função exportada',
  typeof E.usaRankingGeral === 'function' && (src.match(/function usaRankingGeral\(/g) || []).length === 1);

// A TELA lê a regra do motor em vez de copiá-la — foi a 3ª cópia da mesma pergunta.
// (`_hideGeneralStandings`: quando a classificação é POR GRUPO, a tabela GERAL não decide
// nada e não deve aparecer. Ela TEM que concordar com o sorteio — era um espelho à mão.)
var br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
ok('bracket.js pergunta ao motor (usaRankingGeral) em vez de espelhar a condição à mão',
  br.indexOf('usaRankingGeral(') >= 0 &&
  !/_useOverall\s*=\s*\(_scope === 'overall'\)\s*&&\s*!\(/.test(br));

// E a decisão da tela para o Confra tem que ser a MESMA de antes: escondida. Consertar o
// motor não pode ter feito a tabela geral reaparecer numa fase que classifica por grupo.
function telaEsconde(scope, nLines, nGroups, flat, cfgFaseAtual) {
  if (geral && geral(scope, nLines, nGroups, flat === true, E.ehReiRainhaRodadaUnica(cfgFaseAtual))) return false;
  return (parseInt(cfgFaseAtual.rounds, 10) || 1) <= 1;
}
ok('Confra: a tabela geral continua ESCONDIDA (a classificação dele é por grupo)',
  telaEsconde('overall', 2, 34, true, confra.phases[0]) === true);
ok('  → e num Rei/Rainha de VÁRIAS rodadas ela aparece, porque ali ela é quem decide',
  telaEsconde('overall', 2, 34, true, { reiRainha: true, drawMode: 'rei_rainha', rounds: 4 }) === false);

console.log(falhas === 0
  ? '\n✅ duas-portas-um-classificado: OK'
  : '\n❌ duas-portas-um-classificado: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
