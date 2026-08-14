#!/usr/bin/env node
/* GOLDEN MASTER DO CONSTRUTOR — congela o que cada CONFIGURAÇÃO de torneio compila.
 *
 * POR QUÊ: o dono definiu o modelo do produto (14/ago/2026) e mandou não me prender ao que
 * existe na base: "sao muitas possibilidades e o fato de nao termos um torneio desse tipo ou
 * daquele tipo na base é só porque o programa ainda nao tem usuários que criem esses torneios
 * ainda… o codigo tem que possibilitar todas as possibilidades que estamos prevendo."
 *
 * O MODELO, nas palavras dele:
 *   • base = uma fase CLASSIFICATÓRIA + uma fase ELIMINATÓRIA — e nem sempre as duas;
 *   • só eliminatória direta;
 *   • eliminatória direta com UMA rodada classificatória (hoje um toggle da eliminatória —
 *     ele mesmo apontou a duplicidade: "esse toggle da fase eliminatoria veio depois");
 *   • classificatória de VÁRIAS rodadas → os X classificados fazem uma RODADA INICIAL na
 *     eliminatória que define as duplas que seguem (Rei/Rainha sorteado com cabeças de chave
 *     vindas da fase anterior);
 *   • só classificatória (pontos corridos de X rodadas ou por datas), sem eliminatória.
 *
 * Este arquivo congela a saída de `FORMAT2.compileToPhases` para cada uma dessas formas.
 * É a trava que permite MOVER a configuração de lugar sem mudar o torneio que ela produz —
 * exatamente o que falta pra unificar o motor da fase sem tocar no que já foi sorteado.
 *
 * ⚠️ Um caso está declarado como AUSENTE de propósito: `classifAtiva + openReiRainha`. Hoje
 * o normalize o apaga (`e.openReiRainha = … && out.classifAtiva === false`), então ele não é
 * expressável — é justamente a duplicidade que o dono apontou. O caso está na matriz para o
 * dia em que passar a existir: quando existir, este golden acusa a mudança e ela é revisada
 * de propósito, em vez de entrar sem ninguém ver.
 *
 * Uso:
 *   node tests/construtor-golden-master.js --gravar   → grava a fixture
 *   node tests/construtor-golden-master.js            → compara (exit 1 se mudou)
 */
const fs = require('fs');
const path = require('path');
const { window: W, load } = require('./headless.js');
load('format2.js');

const GOLDEN = path.join(__dirname, 'fixtures', 'construtor-golden.json');
const GRAVAR = process.argv.indexOf('--gravar') !== -1;
const F2 = W.FORMAT2;

function estavel(v) {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') {
    const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = estavel(v[k]); }); return o;
  }
  return v;
}
// Aplica um patch fundo sobre a config padrão do esporte.
function cfg(sport, patch) {
  const base = F2.defaultConfig(sport);
  (function mescla(dst, src) {
    Object.keys(src || {}).forEach((k) => {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = dst[k] && typeof dst[k] === 'object' ? dst[k] : {};
        mescla(dst[k], src[k]);
      } else dst[k] = src[k];
    });
  })(base, patch);
  return F2.normalize(base, sport);
}

// ── A MATRIZ: uma entrada por forma de torneio que o modelo prevê ────────────────
const CASOS = [
  { nome: 'A · só eliminatória direta (duplas já formadas)', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: false, formacaoDupla: 'manual',
      eliminatoria: { ativa: true, openReiRainha: false } } },

  { nome: 'A2 · só eliminatória direta (duplas sorteadas)', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: false, formacaoDupla: 'sorteio',
      eliminatoria: { ativa: true, openReiRainha: false } } },

  { nome: 'A3 · só eliminatória direta (individual)', sport: 'Tênis',
    patch: { disputa: 'individual', classifAtiva: false,
      eliminatoria: { ativa: true, openReiRainha: false } } },

  { nome: 'B · eliminatória direta ABRINDO com rodada Rei/Rainha (corte 2)', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: false,
      eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 2, formacao: 'performance' } } },

  { nome: 'B2 · idem, corte 4 e formação por equilíbrio', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: false,
      eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 4, formacao: 'equilibrio' } } },

  { nome: 'C · classificatória de 5 rodadas + eliminatória', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, grupos: 1, classificados: 2,
      classifScope: 'overall', rodadas: { modo: 'fixo', n: 5 },
      eliminatoria: { ativa: true } } },

  { nome: 'C2 · classificatória Rei/Rainha (o Confra) + eliminatória', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, parceria: 'rei_rainha',
      grupos: 1, classificados: 2, classifScope: 'overall',
      rodadas: { modo: 'fixo', n: 1 }, eliminatoria: { ativa: true } } },

  { nome: 'C3 · fase de grupos + eliminatória (2 de cada grupo)', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, grupos: 4, classificados: 2,
      classifScope: 'per_group', eliminatoria: { ativa: true } } },

  { nome: 'D · SÓ classificatória, X rodadas, sem eliminatória', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, rodadas: { modo: 'fixo', n: 8 },
      eliminatoria: { ativa: false } } },

  { nome: 'D2 · SÓ classificatória por DATAS (temporada), sem eliminatória', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true,
      rodadas: { modo: 'datas', drawFirstDate: '2026-09-01', drawFirstTime: '19:00', drawIntervalDays: 7 },
      eliminatoria: { ativa: false } } },

  { nome: 'E · eliminatória DUPLA (repescagem) após classificatória', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, classificados: 4, classifScope: 'overall',
      eliminatoria: { ativa: true, dupla: true } } },

  { nome: 'F · eliminatória em 2 linhas (Ouro/Prata)', sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, classificados: 4, classifScope: 'overall',
      eliminatoria: { ativa: true, linhas: 2, nomes: ['Ouro', 'Prata'] } } },

  // ⚠️ AUSENTE HOJE — ver o cabeçalho. É a forma que o dono descreveu e que o normalize apaga.
  { nome: 'G · classificatória de N rodadas + eliminatória que ABRE com Rei/Rainha semeado',
    sport: 'Beach Tennis',
    patch: { disputa: 'dupla', classifAtiva: true, classificados: 4, classifScope: 'overall',
      rodadas: { modo: 'fixo', n: 5 },
      eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 2 } } }
];

// Só o que descreve a ESTRUTURA do torneio entra no retrato — campos de UI/rótulo ficam de
// fora pra o golden não virar vermelho por causa de um texto.
function retratoDaFase(p) {
  if (!p) return null;
  return {
    name: p.name, formatCode: p.formatCode, format: p.format,
    drawMode: p.drawMode, reiRainha: !!p.reiRainha, rounds: p.rounds,
    groupsBy: p.groupsBy, gruposCount: p.gruposCount, gruposClassified: p.gruposClassified,
    fixedPairs: p.fixedPairs, pairingStrategy: p.pairingStrategy,
    ligaCadence: p.ligaCadence, grandFinal: p.grandFinal, terceiro: p.terceiro,
    lateEnrollment: p.lateEnrollment, newMatchups: p.newMatchups,
    bracketSeeding: p.bracketSeeding, dupla: p.dupla,
    source: p.source ? {
      type: p.source.type, fromPhaseOffset: p.source.fromPhaseOffset,
      byGroupRank: p.source.byGroupRank, scope: p.source.scope,
      rankingBasis: p.source.rankingBasis, mapping: p.source.mapping
    } : null,
    endDate: p.endDate || null, endTime: p.endTime || null
  };
}

const retrato = estavel(CASOS.map(function (c) {
  let out = null, erro = null;
  try { out = F2.compileToPhases(cfg(c.sport, c.patch)); }
  catch (e) { erro = String((e && e.message) || e); }
  const cfgN = cfg(c.sport, c.patch);
  return {
    caso: c.nome,
    // o que o NORMALIZE decidiu — é aqui que a exclusão mútua aparece
    normalizado: {
      classifAtiva: cfgN.classifAtiva,
      elimAtiva: cfgN.eliminatoria.ativa,
      openReiRainha: cfgN.eliminatoria.openReiRainha === true,
      reiRainhaCut: cfgN.eliminatoria.reiRainhaCut || null,
      parceria: cfgN.parceria, formacaoDupla: cfgN.formacaoDupla,
      classificados: cfgN.classificados, classifScope: cfgN.classifScope,
      rodadas: { modo: cfgN.rodadas.modo, n: cfgN.rodadas.n, turnos: cfgN.rodadas.turnos }
    },
    erro: erro,
    topLevel: out ? {
      format: out.topLevel.format, drawMode: out.topLevel.drawMode,
      ligaRoundFormat: out.topLevel.ligaRoundFormat, ligaDrawMode: out.topLevel.ligaDrawMode,
      teamSize: out.topLevel.teamSize, enrollmentMode: out.topLevel.enrollmentMode,
      gruposCount: out.topLevel.gruposCount, gruposClassified: out.topLevel.gruposClassified,
      drawManual: out.topLevel.drawManual, thirdPlace: out.topLevel.thirdPlace
    } : null,
    fases: out ? (out.phases || []).map(retratoDaFase) : null,
    nFases: out ? (out.phases || []).length : null
  };
}));

const texto = JSON.stringify(retrato, null, 2);

if (GRAVAR) {
  fs.writeFileSync(GOLDEN, texto);
  console.log('✅ construtor congelado: ' + path.relative(process.cwd(), GOLDEN) +
    ' (' + CASOS.length + ' formas de torneio, ' + texto.length + ' bytes)');
  process.exit(0);
}
if (!fs.existsSync(GOLDEN)) {
  console.log('⏭️  construtor-golden-master: PULADO — sem retrato gravado');
  console.log('    (grave com: node tests/construtor-golden-master.js --gravar)');
  process.exit(0);
}
const antes = fs.readFileSync(GOLDEN, 'utf8');
if (antes === texto) {
  console.log('✅ construtor-golden-master: as ' + CASOS.length + ' formas de torneio compilam IDÊNTICO ao congelado');
  process.exit(0);
}
const A = JSON.parse(antes), B = retrato;
console.log('❌ construtor-golden-master: O CONSTRUTOR MUDOU');
for (let i = 0; i < Math.max(A.length, B.length); i++) {
  const a = JSON.stringify(A[i]), b = JSON.stringify(B[i]);
  if (a === b) continue;
  console.log('   caso: ' + ((B[i] && B[i].caso) || (A[i] && A[i].caso)));
  const ka = A[i] || {}, kb = B[i] || {};
  ['nFases', 'erro'].forEach(function (k) {
    if (JSON.stringify(ka[k]) !== JSON.stringify(kb[k])) console.log('     ' + k + ': ' + JSON.stringify(ka[k]) + ' → ' + JSON.stringify(kb[k]));
  });
  Object.keys(kb.normalizado || {}).forEach(function (k) {
    const x = (ka.normalizado || {})[k], y = kb.normalizado[k];
    if (JSON.stringify(x) !== JSON.stringify(y)) console.log('     normalizado.' + k + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y));
  });
  const fa = ka.fases || [], fb = kb.fases || [];
  for (let j = 0; j < Math.max(fa.length, fb.length); j++) {
    if (JSON.stringify(fa[j]) !== JSON.stringify(fb[j])) {
      console.log('     fase[' + j + ']:\n       antes: ' + JSON.stringify(fa[j]) + '\n       agora: ' + JSON.stringify(fb[j]));
    }
  }
}
process.exit(1);
