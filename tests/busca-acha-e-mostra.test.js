/* A BUSCA ACHA **E MOSTRA** — porque achar e não mostrar é não achar.
 *
 * Ordem do dono (25/ago/2026): _"as buscas e filtro precisam voltar a funcionar na
 * nova arquitetura. achava, mas não mostrava — e achar e não mostrar é não achar."_
 *
 * ⛔ AS DUAS FALHAS QUE ISTO TRAVA, e elas são diferentes:
 *
 * ① ACHAVA E NÃO MOSTRAVA (literal). A busca revela o que casou com
 *    `card.style.display = ''`. Só que as seções RECOLHIDAS escondem com
 *    `display:none !important` — e `!important` GANHA do estilo em linha. O card era
 *    marcado como encontrado e o CSS seguia escondendo.
 *    ⇒ buscar passa a ABRIR as seções (buscar é pedir pra ver) e a MONTAR o que
 *      estava guardado sob demanda (2.0.82/86/88) — o que não está no DOM não pode
 *      nem ser achado.
 *
 * ② NEM ACHAVA. O filtro só olhava os cartões JÁ DESENHADOS: torneio antigo, de outra
 *    cidade ou que a pessoa não participa nunca chegou ao aparelho.
 *    ⇒ a busca vai ao SERVIDOR, no resumo (~2 KB), por `tokens` e por `nameLower`.
 *
 * ⛔ E buscar não pode reorganizar a tela da pessoa: o estado aberto/fechado que ela
 * escolheu é guardado e DEVOLVIDO ao limpar a busca.
 */
const fs = require('fs');
const path = require('path');
const M = require('../functions-autodraw/tournament-summary-core.js');
const HARNESS = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── a busca acha E mostra ────');

const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
const db = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');

// ── ① buscar ABRE o que estava escondendo ───────────────────────────────────
{
  ok(/function _buscaAbreTudo\(abrir\)/.test(dash), 'existe o passo que abre o que esconde');
  const i = dash.indexOf('function _buscaAbreTudo');
  const corpo = dash.slice(i, i + 1800);
  ok(/_novExtraPend/.test(corpo) && /_mrExtraPend/.test(corpo),
     '⭐ MONTA o conteúdo guardado sob demanda — o que não está no DOM não pode ser achado');
  ok(/data-nov-collapsed/.test(corpo) && /data-mr-collapsed/.test(corpo),
     '⛔ e ABRE as seções recolhidas (era o `display:none !important` que vencia a busca)');

  const j = dash.indexOf('window._applyDashSearchInPlace = function');
  const filtro = dash.slice(j, j + 700);
  const iAbre = filtro.indexOf('_buscaAbreTudo');
  const iFiltra = filtro.indexOf('data-search-blob');
  ok(iAbre > 0 && iFiltra > iAbre,
     '⛔ abre ANTES de filtrar — filtrar primeiro decidiria sobre um DOM incompleto');
}

// ── ② ⭐ e DEVOLVE o estado que a pessoa tinha escolhido ────────────────────
{
  const i = dash.indexOf('function _buscaAbreTudo');
  const corpo = dash.slice(i, i + 1800);
  ok(/data-sp-antes-busca/.test(corpo),
     '⭐ o estado aberto/fechado da pessoa é GUARDADO antes de abrir');
  ok(/removeAttribute\('data-sp-antes-busca'\)/.test(corpo),
     '⛔ e devolvido ao limpar a busca — buscar não pode reorganizar a tela dela');
}

// ── ③ a busca vai ao SERVIDOR ───────────────────────────────────────────────
{
  ok(/async buscarTorneios\(q, limite\)/.test(db), 'existe a busca no servidor');
  const i = db.indexOf('async buscarTorneios');
  const corpo = db.slice(i, i + 2200);
  ok(/tournaments_summary/.test(corpo), '⭐ e ela consulta o RESUMO (~2 KB), não o torneio inteiro');
  ok(/array-contains', termo/.test(corpo), 'casa PALAVRA inteira (tokens)');
  ok(/nameLower', '>=', termo/.test(corpo) && /\\uf8ff/.test(corpo), 'e PREFIXO (nameLower por faixa)');
  ok(/normalize\('NFD'\)/.test(corpo),
     '⛔ sem acento dos dois lados — procurar "clinica" tem que achar "Clínica"');
  ok(/termo\.length < 3/.test(corpo),
     'e 1-2 letras não consultam (casaria com meio banco)');
}

// ── ④ os DOIS caminhos de busca vão ao servidor ────────────────────────────
// Se só um for, buscar por um lugar acha menos que pelo outro — e "menos" aqui
// quer dizer "não achou".
{
  // ⚠️ a DEFINIÇÃO é `window._buscaNoServidor = function (q)` e não casa com
  // `_buscaNoServidor(` — então o esperado são as 2 CHAMADAS, não 3.
  const n = (dash.match(/_buscaNoServidor\(/g) || []).length;
  ok(n >= 2, '⛔ os dois pontos de busca chamam o servidor (' + n + ' chamadas)');
  ok(/window\._setDashSearch = function[\s\S]{0,400}_buscaNoServidor/.test(dash),
     '  → a busca direta');
  ok(/_dashApplyCanonical[\s\S]{0,1400}_buscaNoServidor\(q\)/.test(dash),
     '  → e a barra canônica');
}

// ── ⑤ ⛔ a consulta não pode virar uma por TECLA ────────────────────────────
{
  const i = dash.indexOf('window._buscaNoServidor = function');
  const corpo = dash.slice(i, i + 1600);
  ok(/setTimeout\(function \(\)/.test(corpo) && /320\)/.test(corpo),
     '⭐ espera de 320ms — sem isso seria uma consulta por tecla digitada');
  ok(/clearTimeout\(_buscaTimer\)/.test(corpo), 'e a anterior é cancelada');
  ok(/window\._dashSearch \|\| ''\)\.trim\(\) !== termo/.test(corpo),
     '⛔ resposta que chega tarde é DESCARTADA (a pessoa já mudou a busca)');
  ok(/!tem\[String\(t\.id\)\]/.test(corpo),
     '⛔ e o resultado entra sem DUPLICAR o que já estava na tela');
}

// ── ⑥ o resumo carrega mesmo o que a busca precisa ─────────────────────────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);
  const h = M.helpersDe(HARNESS.window);
  const confra = lista.find((t) => /confra/i.test(t.name || '')) || lista[0];
  const r = M.buildSummary(confra, confra.id, h);
  ok(typeof r.nameLower === 'string' && r.nameLower === r.nameLower.toLowerCase(),
     'o resumo tem `nameLower` (busca por prefixo)');
  ok(Array.isArray(r.tokens) && r.tokens.length > 0,
     'e `tokens` (' + r.tokens.slice(0, 4).join(', ') + ')');
  ok(r.tokens.every((x) => x === x.normalize('NFD').replace(/[̀-ͯ]/g, '')),
     '⛔ os tokens são SEM ACENTO — senão "clinica" não acha "Clínica"');
  let comBusca = 0;
  lista.forEach((t) => { const s = M.buildSummary(t, t.id, h); if (s.nameLower && s.tokens.length) comBusca++; });
  ok(comBusca === lista.length,
     'e TODO torneio da base real é encontrável (' + comBusca + '/' + lista.length + ')');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
