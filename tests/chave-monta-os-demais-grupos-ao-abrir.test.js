/* A CHAVE MONTA OS DEMAIS GRUPOS SÓ QUANDO ALGUÉM ABRE.
 *
 * Regra do dono: _"nada que não estiver visível deve ser carregado… o que não
 * estiver não carrega enquanto o usuário não clicar pedindo outra seção"_.
 *
 * MEDIDO no aparelho dele (Sentry, tela de torneio, 2.0.84):
 *   nos=8061 · onde: #app=7870 #inline-bracket-container=6157 → travada de 1.662ms
 * Reproduzido com o documento REAL do Confra: 34 grupos × 158 elementos = 5.482.
 * Depois desta leva: **230**.
 *
 * ⛔ TERCEIRA VEZ NO MESMO DIA que a confusão aparece: as janelas (2.0.84), o
 * histórico (2.0.86) e agora a chave — todos escondiam com `opacity:0`/`<details>`
 * e construíam assim mesmo. **Esconder não é deixar de construir.**
 *
 * ⚠️ E os dois riscos que vêm junto, cobertos aqui:
 *   ① grupo fora do DOM não tem âncora `data-group-box` (é por ela que a tela rola
 *      até um grupo) → só adia quando há MUITOS grupos;
 *   ② buscar é justamente "pedir pra ver o que não está à vista" → o filtro monta
 *      tudo antes, senão diria "nenhum resultado" mentindo.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── chave: os demais grupos nascem ao abrir ────');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');

// ── ① o cofre existe e guarda a FUNÇÃO, não a string ────────────────────────
{
  ok(/window\._chaveGuardaLote = function \(montar\)/.test(src), 'existe o cofre de lotes da chave');
  const i = src.indexOf('window._chaveGuardaLote = function');
  const corpo = src.slice(i, i + 400);
  ok(/window\._chaveLotes\[id\] = montar;/.test(corpo),
     '⛔ guarda a FUNÇÃO que monta — guardar a string pronta deixaria o custo de montar ' +
     '500 KB de HTML no caminho de abertura, que é o que trava o toque');
  ok(/data-chave-lote/.test(corpo), 'e devolve um marcador leve pro HTML');
}

// ── ② só adia quando há MUITOS grupos ───────────────────────────────────────
// Torneio pequeno segue montando tudo: o ganho seria ruído e o custo (perder a
// âncora de rolagem) é real.
{
  ok(/window\._CHAVE_LOTE_MIN\s*=\s*\d+/.test(src), 'existe um limiar de grupos');
  const n = parseInt((src.match(/window\._CHAVE_LOTE_MIN\s*=\s*(\d+)/) || [])[1], 10);
  ok(n >= 4, 'e ele não é 1 nem 2 (' + n + ') — adiar 1 grupo não paga o risco');
  const usos = (src.match(/_otherGroups\.length >= window\._CHAVE_LOTE_MIN/g) || []).length;
  ok(usos >= 2,
     '⛔ o limiar vale nos DOIS caminhos (categoria única e multi-categoria) — ' +
     'achei ' + usos);
}

// ── ③ adiou ⇒ nasce FECHADO ─────────────────────────────────────────────────
// Aberto, o navegador montaria tudo na hora e o ganho evaporava.
{
  ok(/_detailsOpen = \(_otherGroups\.length >= window\._CHAVE_LOTE_MIN\) \? '' : ' open';/.test(src),
     '⛔ quando adia, o <details> nasce FECHADO; quando não adia, segue aberto como sempre');
}

// ── ④ ⭐ BUSCAR MONTA TUDO (senão a busca mente) ────────────────────────────
{
  ok(/window\._chaveMontaTudo = function/.test(src), 'existe a porta que monta todos os lotes');
  const i = src.indexOf('window._bracketApplyFilter = function');
  const topo = src.slice(i, i + 1400);
  ok(/_chaveMontaTudo\(\)/.test(topo),
     '⭐ o filtro monta tudo ANTES de decidir visibilidade');
  const iM = topo.indexOf('_chaveMontaTudo()');
  const iQ = topo.indexOf("querySelectorAll('[data-players]')");
  ok(iM > 0 && iQ > iM,
     '⛔ e nessa ordem — procurar antes de montar acharia menos cards do que existem');
  ok(/\(q \|\| onlyMine\)/.test(topo),
     'vale pra busca por texto E pro "só os meus jogos"');
}

// ── ⑤ montar é UMA VEZ SÓ ───────────────────────────────────────────────────
{
  const i = src.indexOf('window._chaveLigaLotes = function');
  // janela ampliada em 2.0.89: `monta` cresceu ao passar a injetar em fatias.
  const corpo = src.slice(i, i + 3000);
  ok(/delete window\._chaveLotes\[id\];/.test(corpo),
     '⛔ o lote é apagado do cofre ao montar — abrir e fechar não pode duplicar grupo');
  ok(/if \(det\.open\) \{ monta\(\); return; \}/.test(corpo),
     '<details> que já nasce aberto monta na hora (não espera um toggle que não virá)');
  ok(/if \(!det\) \{ monta\(true\); return; \}/.test(corpo),
     '⛔ marcador sem <details> em volta monta já e INTEIRO — melhor pesado que faltando');
  // ⭐ 2.0.89: abrir despejava ~5.000 elementos num quadro só, e o dono relatou
  // "continua cortando rolando pra baixo depois de abrir os demais".
  ok(/requestAnimationFrame\(passo\)/.test(corpo) && /lote = \d+/.test(corpo),
     '⭐ o lote entra em FATIAS, com o navegador respirando entre elas');
  ok(/if \(!alvo\.isConnected\) return;/.test(corpo),
     '⛔ e para se outro render assumiu a tela (senão pinta numa árvore morta)');
}

// ── ⑥ a ligação acontece em TODOS os caminhos de pintura ────────────────────
// A chave pinta por 4 caminhos (inteiro, tela pequena, fatias, e o resgate quando
// a fatia falha). Um caminho sem ligação = seção que nunca abre.
{
  const n = (src.match(/_chaveLigaLotes\(container\)/g) || []).length;
  ok(n >= 4, '⛔ os ' + n + ' caminhos de pintura ligam os lotes (a chave pinta por 4)');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
