/* A BOLINHA MORA ONDE O RÓTULO DIZ — DUAS RESPOSTAS NA MESMA TELA É UMA A MAIS.
 *
 * Relato do dono (17/ago/2026, com print da ficha da Bruna):
 *   _"a bruna tudo indica D mas a barra dela esta em B muito alem do que deveria"_
 *   _"Fabio simao esta D- mas a bolinha um pouco acima do D entao nao teria o -"_
 *
 * MEDIDO nos dois docs REAIS de produção, rodando o motor inteiro:
 *   Bruna Arilla · rótulo **D+** ("busca a de cima") · pontos 1672 → bolinha caía em **B-**
 *   Fábio Simão  · rótulo **D-** ("base da categoria") · pontos 1467 → bolinha em **D+**
 *
 * A tela dava DUAS respostas para "qual é o nível dela?": o rótulo saía do motor de
 * categoria (torneio manda na letra, ranking dá o sinal) e a bolinha saía dos PONTOS do
 * letzplay — outra régua, com outra origem. No caso da Bruna os pontos nasceram semeados
 * em "Fem C+" com 9 jogos e rd 173; nada disso é categoria disputada. E quem lê acredita
 * no DESENHO, não no texto — então a pessoa "virava" B.
 *
 * ⚠️ E havia um erro de escala por baixo disso, que sobreviveria a qualquer conserto de
 * dado: os rótulos da régua são cinco `flex:1` (FUN·D·C·B·A), ou seja centros em
 * 10/30/50/70/90%. Posicionar por PONTOS numa régua desenhada por igual desalinha por
 * construção — "B" pelos pontos cai em 80% enquanto o "B" impresso está em 70%.
 *
 * INVARIANTES guardados aqui:
 *   1. a bolinha fica na casa do RÓTULO — dentro da letra impressa, e do lado certo do
 *      centro conforme o sinal;
 *   2. a régua da posição é a MESMA lista de letras que o render desenha (se alguém
 *      acrescentar uma letra na barra, a conta acompanha sozinha);
 *   3. quem NÃO tem rótulo (nenhum torneio lido) continua situado pelos pontos — o
 *      fallback existe porque sem ele a barra ficaria muda para quem acabou de importar.
 *
 * Forma nova de a bolinha contradizer o rótulo entra NESTE arquivo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const PROF = fs.readFileSync(path.join(ROOT, 'js', 'views', 'letzplay-profile.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== A bolinha mora onde o rótulo diz ==');

// ── as funções REAIS, extraídas do store.js ────────────────────────────────────
const W = {};
W.window = W; W.globalThis = W; W.console = console;
vm.createContext(W);
const mLetras = STORE.match(/window\.SP_REGUA_LETRAS\s*=\s*\[[^\]]*\];/);
const mPct = STORE.match(/window\._lzPctDaCategoria = function[\s\S]*?\n};/);
ok(!!mLetras, 'SP_REGUA_LETRAS existe no store.js');
ok(!!mPct, '_lzPctDaCategoria existe no store.js');
if (mLetras) vm.runInContext(mLetras[0], W);
if (mPct) vm.runInContext(mPct[0], W);

// Sem as duas, o resto não tem o que medir — reprova AQUI, com motivo, em vez de estourar
// um TypeError três blocos abaixo (o teste também é lido por quem estiver com pressa).
if (!W.SP_REGUA_LETRAS || typeof W._lzPctDaCategoria !== 'function') {
  console.log('  ✗ a bolinha ainda é posicionada pelos PONTOS: falta a régua do rótulo no store.js');
  console.log('\n✅ ' + pass + ' asserções ok, ' + (fail + 1) + ' falha(s)');
  process.exit(1);
}

// ═══ 1) A RÉGUA DO CÁLCULO É A RÉGUA DESENHADA ═════════════════════════════════
// Se o render passar a desenhar outra lista de letras, a posição TEM que acompanhar.
(function () {
  const mRender = PROF.match(/\[\s*'FUN'[^\]]*\]\.map\(function \(t\)/);
  ok(!!mRender, 'o render desenha a régua a partir de uma lista de letras');
  if (!mRender) return;
  const letrasRender = (mRender[0].match(/'([A-Z]+)'/g) || []).map(s => s.replace(/'/g, ''));
  ok(JSON.stringify(letrasRender) === JSON.stringify(W.SP_REGUA_LETRAS),
    'a lista do render é a mesma de SP_REGUA_LETRAS (render: ' + letrasRender.join('·') +
    ' | cálculo: ' + (W.SP_REGUA_LETRAS || []).join('·') + ')');
})();

// ═══ 2) CADA RÓTULO CAI NA SUA CASA ════════════════════════════════════════════
(function () {
  const L = W.SP_REGUA_LETRAS, passo = 100 / L.length;
  const centro = (letra) => passo * (L.indexOf(letra) + 0.5);

  L.forEach(function (letra) {
    if (letra === 'FUN' || letra === 'A') return;   // pontas não recebem sinal
    const c = centro(letra);
    const menos = W._lzPctDaCategoria(letra + '-');
    const puro = W._lzPctDaCategoria(letra);
    const mais = W._lzPctDaCategoria(letra + '+');

    ok(puro === c, letra + ' sem sinal cai EXATAMENTE no rótulo impresso (' + puro + '% vs ' + c + '%)');
    ok(menos < c, letra + '- fica ABAIXO do ' + letra + ' impresso (' + menos.toFixed(1) + '% < ' + c + '%)');
    ok(mais > c, letra + '+ fica ACIMA do ' + letra + ' impresso (' + mais.toFixed(1) + '% > ' + c + '%)');
    // ...e sem invadir a letra vizinha: o deslocamento é menor que meio passo.
    ok(c - menos < passo / 2 && mais - c < passo / 2,
      letra + '± não encosta na letra vizinha (deslocamento ' + (c - menos).toFixed(1) + '% < ' + (passo / 2) + '%)');
  });
})();

// ═══ 3) OS DOIS CASOS DO PRINT ═════════════════════════════════════════════════
// Os números são os dos docs reais; o que se guarda é o VEREDITO, não a decimal.
(function () {
  const L = W.SP_REGUA_LETRAS, passo = 100 / L.length;
  const cD = passo * (L.indexOf('D') + 0.5);
  const cB = passo * (L.indexOf('B') + 0.5);
  const cC = passo * (L.indexOf('C') + 0.5);

  // Bruna: rótulo D+ — antes a bolinha ia parar em B- (pelos pontos 1672).
  const bruna = W._lzPctDaCategoria('D+');
  ok(bruna > cD && bruna < cC, 'Bruna (D+): a bolinha fica entre o D e o C — nem em cima do D, nem perto do B (' + bruna.toFixed(1) + '%)');
  ok(Math.abs(bruna - cB) > 20, 'Bruna (D+): a bolinha está LONGE do B, que era o defeito do print');

  // Fábio: rótulo D- — antes a bolinha ficava um pouco ACIMA do D.
  const fabio = W._lzPctDaCategoria('D-');
  ok(fabio < cD, 'Fábio (D-): a bolinha fica abaixo do D impresso (' + fabio.toFixed(1) + '% < ' + cD + '%)');
  ok(fabio > passo * (L.indexOf('FUN') + 0.5), 'Fábio (D-): mas ainda acima do FUN — ele é D, não iniciante');
})();

// ═══ 4) ENTRADA QUE NÃO É RÓTULO NÃO VIRA POSIÇÃO ══════════════════════════════
// `categoryRaw` do letzplay traz lixo ("Rodada: 6", nome de torneio inteiro, "Feminina P").
// Nada disso pode virar uma bolinha em algum lugar plausível — melhor não posicionar.
(function () {
  ['', null, undefined, 'Rodada: 6', 'Feminina P', 'Mista D',
   'ESPAÇOLASER apresenta BT Bellas by Nati Font - 6ª Edição - Nível 1 - Categoria D'
  ].forEach(function (lixo) {
    ok(W._lzPctDaCategoria(lixo) === null, 'não posiciona por lixo: ' + JSON.stringify(String(lixo).slice(0, 34)));
  });
  // "Fem D+" e "Feminina D" chegam com o gênero colado em alguns pontos do app —
  // o gênero é decidido fora, então aqui eles NÃO são rótulo válido e caem no fallback.
  ok(W._lzPctDaCategoria('Fem D+') === null, 'rótulo com gênero colado não posiciona (o gênero é resolvido fora)');
})();

// ═══ 5) AS DUAS BARRAS USAM A MESMA FONTE, E O FALLBACK CONTINUA VIVO ══════════
(function () {
  const usos = PROF.match(/var pct = \(_pct\w+ != null\) \? _pct\w+ : ratingPct\(r\.value\);/g) || [];
  ok(usos.length === 2, 'as DUAS barras (nível e card) posicionam pelo rótulo — achei ' + usos.length);
  ok(!/var pct = ratingPct\(r\.value\);/.test(PROF),
    'nenhuma barra ficou posicionando só pelos pontos');
  ok(/ratingPct\(r\.value\)/.test(PROF),
    'o fallback por pontos continua existindo pra quem não tem rótulo');
  // A leitura que posiciona e a que rotula têm que ser a MESMA — duas chamadas separadas
  // divergiriam no dia em que o motor virasse não-determinístico.
  ok(/var _cs = _csPos;/.test(PROF), 'o rótulo exibido reusa exatamente a leitura que posicionou a bolinha');
})();

console.log('\n✅ ' + pass + ' asserções ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
