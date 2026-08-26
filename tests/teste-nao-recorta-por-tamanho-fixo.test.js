/* TESTE NÃO RECORTA CÓDIGO POR TAMANHO FIXO  (2.0.129)
 * node tests/teste-nao-recorta-por-tamanho-fixo.test.js
 *
 * ⛔ SETE VEZES neste projeto um teste reprovou sem que NADA tivesse regredido, porque
 * recortava o código-fonte numa janela de N caracteres — `src.slice(i, i + 1800)` — e um
 * comentário a mais empurrou a linha procurada pra fora do recorte. Janelas de 900, 1800,
 * 2200, 4000 e 6000 já apareceram.
 *
 * O custo real não é o minuto perdido: é que teste que "falha" sem defeito ENSINA A IGNORAR
 * TESTE. Depois da terceira vez, o reflexo passa a ser "deve ser a janela de novo" — e é
 * exatamente nessa hora que passa um defeito verdadeiro.
 *
 * ⭐ A ÂNCORA CERTA É O FIM DO CONSTRUTO: `indexOf('\n}', i)`, `indexOf('\nexports.', i)`,
 * `indexOf('\n  },', i)`. O recorte acompanha o código em vez de brigar com ele.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── nenhum teste recorta por tamanho fixo ────');

/* Só interessa o recorte de CÓDIGO-FONTE lido do disco. Fatiar um array de dados, pegar os
 * primeiros N de uma lista ou cortar string pra imprimir são usos legítimos e comuns. */
const FONTES = /\b(src|store|cf|cli|corpo|abrir|texto|conteudo|arquivo|source|js|sw|rules|idx|pre|vend|grava|trecho)\b/i;
/* ⛔⛔ CATRACA, NÃO FAXINA. Quando escrevi esta trava ela achou 47 ocorrências em 33
 * arquivos — dívida de meses. Sair consertando tudo agora seria trocar um defeito ao vivo
 * por um mutirão, e mexer em 33 suítes de uma vez é justamente o tipo de leva que já
 * obrigou reversão aqui. Então: o que existe fica REGISTRADO e CONGELADO; o que crescer,
 * reprova. A dívida só pode diminuir.
 * ⭐ Quem encostar num destes arquivos, ancore no fim do construto e BAIXE o número. */
const BASE = {
  "ajuste-de-nome-nao-trava-a-thread.test.js": 1,
  "analise-barra-de-busca.test.js": 1,
  "aprovar-no-feed-a-tela-muda.test.js": 2,
  "carregando-e-uma-tela-so.test.js": 2,
  "cartao-do-resumo-e-igual-ao-completo.test.js": 1,
  "chave-monta-os-demais-grupos-ao-abrir.test.js": 3,
  "consenso-na-dashboard.test.js": 2,
  "fecho-de-rodada-vai-pra-cf.test.js": 1,
  "foto-do-card-aparece-nos-dois-temas.test.js": 1,
  "historico-e-log-nao-se-apaga.test.js": 2,
  "historico-so-monta-quando-aberto.test.js": 1,
  "instrumento-enxerga-callback-assincrono.test.js": 1,
  "lz-id-survives-rounds.test.js": 1,
  "novidades-so-monta-o-que-aparece.test.js": 1,
  "odometro-do-carregando-mostra-um-numero.test.js": 2,
  "ouvinte-nunca-entrega-torneio-sem-jogos.test.js": 1,
  "perfilador-tem-dois-niveis.test.js": 2,
  "pessoa-na-tela-hidrata.test.js": 1,
  "placar-sem-sinal-vai-pra-fila.test.js": 5,
  "poda-do-historico-nao-perde-linha.test.js": 1,
  "podio-concorda-com-a-classificacao.test.js": 1,
  "previa-fechada-preenche-a-linha.test.js": 2,
  "quem-saiu-por-wo-mostra-onde-joga-agora.test.js": 1,
  "repechage-best-loser.test.js": 1,
  "rotulo-de-papel-se-cura.test.js": 1,
  "safe-area-cobre-todo-contexto.test.js": 1,
  "torneio-dividido-chega-inteiro-na-tela.test.js": 1,
  "torneio-novo-nasce-inteiro.test.js": 1,
  "travada-ao-rolar-se-reporta.test.js": 2,
  "ultimos-resultados-mostra-o-ultimo.test.js": 1,
  "wo-destino-ciclo-notifica.test.js": 1,
  "wo-volta-e-busca.test.js": 1,
  "x-da-busca-alvo-de-toque.test.js": 1
};

const achados = {};
fs.readdirSync(path.join(ROOT, 'tests')).forEach(function (f) {
  if (!/\.(test\.)?js$/.test(f)) return;
  if (f === path.basename(__filename)) return;
  const txt = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
  txt.split('\n').forEach(function (linha, n) {
    // `X.slice(algo, algo + 1234)` — o `+ número` é a assinatura da janela fixa
    const m = linha.match(/(\w+)\.slice\([^)]*\+\s*(\d{3,})\s*\)/);
    if (!m || !FONTES.test(m[1])) return;
    (achados[f] = achados[f] || []).push((n + 1) + ': ' + linha.trim().slice(0, 90));
  });
});

const novos = [], piores = [], melhores = [];
Object.keys(achados).forEach(function (f) {
  const q = achados[f].length, b = BASE[f] || 0;
  if (!b) novos.push(f + ' (' + q + ')\n          ' + achados[f].join('\n          '));
  else if (q > b) piores.push(f + ': era ' + b + ', virou ' + q);
});
Object.keys(BASE).forEach(function (f) {
  const q = (achados[f] || []).length;
  if (q < BASE[f]) melhores.push(f + ': ' + BASE[f] + ' → ' + q);
});

const totalHoje = Object.keys(achados).reduce(function (a, f) { return a + achados[f].length; }, 0);
const totalBase = Object.keys(BASE).reduce(function (a, f) { return a + BASE[f]; }, 0);
console.log('  dívida congelada: ' + totalBase + '  ·  hoje: ' + totalHoje);
melhores.forEach(function (m) { console.log('  ⭐ diminuiu — ' + m); });

ok('⛔ NENHUM arquivo NOVO recorta o código-fonte por tamanho fixo',
  novos.length === 0,
  novos.join('\n      ') +
  '\n      ⇒ ancore no FIM do construto: indexOf(\'\\n}\', i) / indexOf(\'\\nexports.\', i)\n' +
  '      Uma janela fixa reprova sozinha assim que um comentário empurra a linha pra fora —\n' +
  '      e teste que falha sem defeito ensina a ignorar teste.');
ok('⛔ e nenhum arquivo antigo GANHOU mais uma',
  piores.length === 0, piores.join('\n      '));

// e a trava tem que DETECTAR de verdade — senão é verde que não confere nada
const amostra = "const corpo = src.slice(i, i + 1800);";
const pega = amostra.match(/(\w+)\.slice\([^)]*\+\s*(\d{3,})\s*\)/);
ok('⭐ a trava reconhece o padrão que ela existe pra pegar', !!pega && FONTES.test(pega[1]));
const legitimo = "const primeiros = lista.slice(0, 10);";
ok('⭐ e não reclama de fatiar dados (só de recortar FONTE)',
  !(legitimo.match(/(\w+)\.slice\([^)]*\+\s*(\d{3,})\s*\)/)));

console.log(falhas === 0 ? '\n✅ teste-nao-recorta-por-tamanho-fixo: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
